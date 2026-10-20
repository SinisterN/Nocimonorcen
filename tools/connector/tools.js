import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { promises as fs, statSync } from "fs";
import path from "path";
import sharp from "sharp";
import { log, logDetailedError } from "./logger.js";
import { sanitizePrompt, generateUniqueFilename } from "./utils.js";
import { PROJECT_ROOT } from "./comfy.js";
import { MCP_ERROR_CODES } from "./validation.js";
import {
  prepareImageWorkflow,
  prepare3dWorkflow,
  MODEL_EXTENSIONS,
  IMAGE_EXTENSIONS,
  QUALITY_PRESETS,
  ASPECT_SIZES,
} from "./comfy.js";
import {
  WORKFLOWS,
  resolveImagePath,
  fitOnWhite,
  prepareRoute,
  backgroundMaskWorkflow,
  applyMask,
  cleanPrompt,
  safeName,
  contactSheet,
} from "./assetPipeline.js";
import { ANIMATION_WORKFLOW, prepareAnimation, spriteSheet, framePreview } from "./animationPipeline.js";
import { AUDIO_WORKFLOWS, AUDIO_EXTENSIONS, prepareSfx, prepareMusic, listeningPage, TTS, runVoiceJob } from "./audioPipeline.js";

const PROMPT_SUFFIX = "high detailed, complete object, not cut off, white solid background";
const IMAGE_TIMEOUT_MS = 5 * 60 * 1000;
const MODEL_TIMEOUT_MS = 30 * 60 * 1000;

const promptField = z.string().min(1).max(500).transform(sanitizePrompt);
const longPrompt = z.string().min(1).max(2000).transform((p) => cleanPrompt(p));
const dim = z.number().int().min(256).max(2048).transform((v) => Math.round(v / 16) * 16);
const imageOptions = {
  mode: z.enum(["asset", "scene"]).optional(),
  aspect: z.enum(["square", "landscape", "portrait"]).optional(),
  width: dim.optional(),
  height: dim.optional(),
  seed: z.number().int().min(0).max(2 ** 48 - 1).optional(),
  variants: z.number().int().min(1).max(8).optional(),
  guide_image: z.string().optional(),
  guide_strength: z.number().min(0).max(2).optional(),
  style_image: z.string().optional(),
  remove_background: z.boolean().optional(),
  name: z.string().max(80).optional(),
  folder: z.string().max(120).optional(),
};
const schema2D = z.object({ prompt: longPrompt, ...imageOptions });
const schemaBatch = z.object({
  manifest: z.string().min(1),
  only: z.array(z.string()).optional(),
  dry_run: z.boolean().optional(),
});
const schemaBatchStatus = z.object({ operation_id: z.string().optional() });
const schemaAnimation = z.object({
  image: z.string().min(1),
  prompt: longPrompt,
  negative_prompt: z.string().max(2000).optional(),
  frames: z.number().int().min(9).max(81).refine((n) => (n - 1) % 4 === 0, "frames must be 4n+1: 9, 13, 17, 21, 25, 33, 49 or 81").optional(),
  width: dim.optional(),
  height: dim.optional(),
  seed: z.number().int().min(0).max(2 ** 48 - 1).optional(),
  variants: z.number().int().min(1).max(4).optional(),
  fps: z.number().int().min(4).max(30).optional(),
  columns: z.number().int().min(1).max(16).optional(),
  remove_background: z.boolean().optional(),
  name: z.string().max(80).optional(),
  folder: z.string().max(120).optional(),
});
const schemaAudio = z.object({
  kind: z.enum(["sfx", "music", "voice"]),
  prompt: longPrompt,
  seconds: z.number().min(0.5).max(240).optional(),
  // voice: the prompt is the spoken text
  mode: z.enum(["design", "clone"]).optional(),
  instruct: z.string().max(1000).optional(),
  ref_audio: z.string().optional(),
  ref_text: z.string().max(1000).optional(),
  model: z.string().optional(),
  language: z.string().optional(),
  variants: z.number().int().min(1).max(8).optional(),
  seed: z.number().int().min(0).max(2 ** 48 - 1).optional(),
  lyrics: z.string().max(4000).optional(),
  bpm: z.number().int().min(30).max(300).optional(),
  keyscale: z.string().max(40).optional(),
  timesignature: z.union([z.string(), z.number()]).optional(),
});
const AUDIO_TIMEOUT_MS = 10 * 60 * 1000;
const schema3D = z
  .object({
    prompt: promptField.optional(),
    image: z.string().optional(),
    quality: z.enum(["low", "medium", "high", "ultra"]).default("medium"),
    face_count: z.number().int().min(500).max(2000000).optional(),
    texture_size: z.union([z.literal(256), z.literal(512), z.literal(1024), z.literal(2048), z.literal(4096)]).optional(),
  })
  .refine((a) => a.prompt || a.image, { message: "Provide a prompt or an image" });
const schemaStatus = z.object({ operation_id: z.string().optional() });

const TOOLS = [
  {
    name: "generate_2d_asset",
    description:
      "Generate a 2D image with the local ComfyUI workflows. Put the style in the prompt. " +
      "mode 'asset' (default) makes one complete object on a plain background, with the background removed " +
      "(transparent PNG) unless remove_background is false; mode 'scene' is for backgrounds and full scenes. " +
      "Three routes, picked automatically: plain text-to-image (Z-Image-Turbo); guide_image only = ControlNet, " +
      "the result follows the guide's outlines, angle and size (guide_strength 0-2, default 1); guide_image + " +
      "style_image = FLUX.2 Klein redraws the guide's shape in the style image's look. Image paths can be absolute, " +
      "relative to the connector folder (e.g. guides/tower_arrow.png) or a file in assets/. seed makes results " +
      "repeatable; variants (1-8) makes several images with seeds seed, seed+1, …; name and folder give the files " +
      "readable names under assets/. Takes a few seconds per image.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Description of the image including its style (up to 2000 characters)" },
        mode: { type: "string", enum: ["asset", "scene"], description: "asset (default): single object, background removed. scene: no background constraint" },
        aspect: { type: "string", enum: ["square", "landscape", "portrait"], description: "Image shape when width/height are not given" },
        width: { type: "integer", description: "Exact width in px (256-2048, rounded to a multiple of 16)" },
        height: { type: "integer", description: "Exact height in px (256-2048, rounded to a multiple of 16)" },
        seed: { type: "integer", description: "Fixed seed for repeatable results; random if omitted" },
        variants: { type: "integer", description: "How many images to make (1-8), seeds seed, seed+1, ..." },
        guide_image: { type: "string", description: "Shape guide image (ControlNet, or the shape for Klein)" },
        guide_strength: { type: "number", description: "How strictly to follow the guide (ControlNet only), default 1" },
        style_image: { type: "string", description: "Style reference image; with guide_image uses FLUX.2 Klein" },
        remove_background: { type: "boolean", description: "Transparent background; default true for assets, false for scenes" },
        name: { type: "string", description: "Output file name without extension, e.g. tower_arrow" },
        folder: { type: "string", description: "Subfolder of assets/ for the output, e.g. tests" },
      },
      required: ["prompt"],
    },
  },
  {
    name: "generate_batch",
    // Audio manifests: set "type": "audio"; each asset has kind ("sfx" or "music"), prompt, seconds, variants,
    // and for music optional lyrics, bpm, keyscale, timesignature. Output is FLAC plus a listen.html page.
    description:
      "Generate a whole list of assets from a JSON manifest in one go. Runs in the background on the local GPU and " +
      "returns an operation ID; poll check_batch_status. The manifest holds a style block (prefix/suffix added to " +
      "every prompt), defaults, and an assets array of { id, prompt, guide_image?, style_image?, guide_strength?, " +
      "seed?, variants?, width?, height?, mode?, remove_background? }. Files land in assets/<output>/<id>_v<n>.png " +
      "with the untouched originals in _raw/, plus results.json and contact_sheet.png for review. " +
      "`only` limits the run to some asset ids; dry_run lists what would be generated without running.",
    inputSchema: {
      type: "object",
      properties: {
        manifest: { type: "string", description: "Path to the manifest JSON (absolute or relative to the connector folder)" },
        only: { type: "array", items: { type: "string" }, description: "Optional list of asset ids to run" },
        dry_run: { type: "boolean", description: "List the planned images and time estimate without generating" },
      },
      required: ["manifest"],
    },
  },
  {
    name: "check_batch_status",
    description: "Check a batch started with generate_batch: progress, failures and, when finished, the contact sheet. Omit operation_id to list all batches.",
    inputSchema: {
      type: "object",
      properties: { operation_id: { type: "string", description: "The ID returned by generate_batch" } },
    },
  },
  {
    name: "generate_3d_asset",
    description:
      "Generate a textured 3D model (GLB) using the local ComfyUI TRELLIS.2 workflow. Pass a prompt to generate a new " +
      "reference image first, or pass `image` with the filename of an existing 2D asset to convert that instead. " +
      "`quality` sets the polygon budget and texture size: low (5k faces, 512px, small props/mobile), medium " +
      "(default, 20k faces, 1024px), high (100k faces, 2048px, hero assets), ultra (workflow defaults, very large files). " +
      "face_count / texture_size override the preset. " +
      "Runs in the background (usually a few minutes) and returns an operation ID; poll check_3d_status for the result.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Description of the object, e.g. 'low-poly treasure chest'" },
        image: { type: "string", description: "Optional: filename of an existing PNG in the assets folder to convert to 3D" },
        quality: { type: "string", enum: ["low", "medium", "high", "ultra"], description: "Size/detail preset (default medium)" },
        face_count: { type: "integer", description: "Optional exact polygon target, overrides the preset" },
        texture_size: { type: "integer", enum: [256, 512, 1024, 2048, 4096], description: "Optional texture resolution in px, overrides the preset" },
      },
    },
  },
  {
    name: "generate_animation",
    description:
      "Animate a character picture into sprite frames with the local ComfyUI WAN 2.2 image-to-video model (14B, 4-step). " +
      "The picture is the first frame, so its style, colours and angle carry through; `prompt` describes the motion " +
      "(e.g. 'the zombie shambles forward in place, legs stepping, arms swinging'). A static camera and plain background " +
      "are added to every prompt. Each frame gets its background removed (BiRefNet) and the frames are laid out as a sprite " +
      "sheet. Output per variant in assets/<folder>/<name>_v<n>/: frames/frame_000.png..., raw/ (untouched frames), " +
      "sheet.png + sheet.json (grid of equal cells), preview.mp4 and strip.png (every 4th frame). frames must be 4n+1 " +
      "(default 33 = 2 s at 16 fps). Runs in the background, about 3 minutes per variant on a 24 GB card; poll " +
      "check_animation_status.",
    inputSchema: {
      type: "object",
      properties: {
        image: { type: "string", description: "Character picture: absolute path, path relative to the connector folder, or a file in assets/" },
        prompt: { type: "string", description: "The motion, in plain words" },
        negative_prompt: { type: "string", description: "Optional: replaces the default list of things to avoid (camera moves, extra limbs, flicker...)" },
        frames: { type: "integer", description: "Frame count, 4n+1 (9, 13, 17, 21, 25, 33, 49, 81). Default 33" },
        width: { type: "integer", description: "Frame width in px, multiple of 16. Default 512" },
        height: { type: "integer", description: "Frame height in px, multiple of 16. Default 512" },
        seed: { type: "integer", description: "Fixed seed; variants use seed, seed+1, ..." },
        variants: { type: "integer", description: "How many takes (1-4)" },
        fps: { type: "integer", description: "Preview video frame rate. Default 16" },
        columns: { type: "integer", description: "Sprite sheet columns. Default 8" },
        remove_background: { type: "boolean", description: "Transparent frames (default true)" },
        name: { type: "string", description: "Output name, e.g. zombie_walk" },
        folder: { type: "string", description: "Subfolder of assets/, default animations" },
      },
      required: ["image", "prompt"],
    },
  },
  {
    name: "check_animation_status",
    description: "Check an animation started with generate_animation; when it's done, shows a strip of every 4th frame. Omit operation_id to list all.",
    inputSchema: {
      type: "object",
      properties: { operation_id: { type: "string", description: "The ID returned by generate_animation" } },
    },
  },
  {
    name: "check_3d_status",
    description: "Check the progress of a 3D generation started with generate_3d_asset. Omit operation_id to list all jobs.",
    inputSchema: {
      type: "object",
      properties: { operation_id: { type: "string", description: "The ID returned by generate_3d_asset" } },
    },
  },
];

export function registerToolHandlers(server, config, clients, notifyResourceListChanged) {
  const { comfy } = clients;
  const { assetsDir, workDir } = config;
  const jobs = new Map();
  let counter = 0;

  const saveAsset = async (buffer, prefix, ext, toolName) => {
    const filename = generateUniqueFilename(prefix, ext, toolName);
    const filePath = path.join(assetsDir, filename);
    await fs.writeFile(filePath, buffer);
    return { filename, filePath, resourceUri: `asset://${prefix}/${filename}` };
  };

  const generateImage = async (prompt, prefix, toolName, { scene = false, aspect = "square" } = {}) => {
    const template = await comfy.loadWorkflow(comfy.imageWorkflowPath);
    const wf = prepareImageWorkflow(template, scene ? prompt : `${prompt}, ${PROMPT_SUFFIX}`, aspect);
    const [first] = await comfy.run(wf, IMAGE_EXTENSIONS, IMAGE_TIMEOUT_MS);
    const ext = path.extname(first.filename).slice(1).toLowerCase() || "png";
    return { ...(await saveAsset(first.data, prefix, ext, toolName)), data: first.data };
  };

  const preview = async (buffer) => {
    const png = await sharp(buffer).resize(512, 512, { fit: "inside" }).png().toBuffer();
    return { type: "image", data: png.toString("base64"), mimeType: "image/png" };
  };

  const resolveAssetImage = async (name) => {
    const filePath = path.resolve(assetsDir, path.basename(name));
    if (!IMAGE_EXTENSIONS.includes(path.extname(filePath).toLowerCase())) {
      throw new Error(`"${name}" is not an image file`);
    }
    try {
      return { filePath, data: await fs.readFile(filePath) };
    } catch {
      throw new Error(`Image "${name}" not found in the assets folder (${assetsDir})`);
    }
  };

  const describeJob = (job) => {
    const secs = Math.round(((job.finishedAt || Date.now()) - job.startedAt) / 1000);
    const lines = [`Operation ${job.id}: ${job.status} (${secs}s)`, `Step: ${job.step}`];
    if (job.input) lines.push(`Input: ${job.input}`);
    if (job.quality) lines.push(`Quality: ${job.quality}`);
    if (job.image) lines.push(`Reference image: ${job.image}`);
    for (const m of job.models || []) lines.push(`3D model: ${m.path} (${(m.bytes / 1048576).toFixed(1)} MB)`);
    for (const t of job.takes || []) lines.push(`Take v${t.variant} (seed ${t.seed}): ${t.dir}  [${t.frames} frames, sheet ${t.sheet}]`);
    if (job.warning) lines.push(`Warning: ${job.warning}`);
    if (job.error) lines.push(`Error: ${job.error}`);
    return lines.join("\n");
  };

  const run3dJob = async (job, args, toolName) => {
    try {
      await comfy.ensureAlive();
      let imageData;
      if (args.image) {
        job.step = "Loading reference image";
        const img = await resolveAssetImage(args.image);
        imageData = img.data;
        job.image = img.filePath;
      } else {
        job.step = "Generating reference image";
        const img = await generateImage(args.prompt, "3d_image", toolName);
        imageData = img.data;
        job.image = img.filePath;
        await notifyResourceListChanged();
      }

      job.step = "Building 3D model with TRELLIS.2";
      const uploaded = await comfy.uploadImage(imageData, `mcp_${job.id}.png`);
      const template = await comfy.loadWorkflow(comfy.model3dWorkflowPath);
      const settings = { ...(QUALITY_PRESETS[args.quality] || {}) };
      if (args.face_count) settings.faces = args.face_count;
      if (args.texture_size) settings.texture = args.texture_size;
      const { workflow, applied } = prepare3dWorkflow(template, uploaded, settings);
      if (settings.faces && !applied.faces) job.warning = "No Decimate Mesh node found in 3d.json, polygon count not changed";
      if (settings.texture && !applied.texture) job.warning = "No texture bake node found in 3d.json, texture size not changed";
      const outputs = await comfy.run(workflow, MODEL_EXTENSIONS, MODEL_TIMEOUT_MS);

      job.models = [];
      for (const out of outputs) {
        const ext = path.extname(out.filename).slice(1).toLowerCase();
        const saved = await saveAsset(out.data, "3d_model", ext, toolName);
        job.models.push({ path: saved.filePath, bytes: out.data.length });
      }
      await notifyResourceListChanged();
      job.status = "COMPLETED";
      job.step = "Done";
      await log("INFO", `Operation ${job.id} completed: ${job.models.map((m) => m.path).join(", ")}`, workDir);
    } catch (error) {
      job.status = "FAILED";
      job.error = error.message;
      await logDetailedError(error, job.id, workDir, { input: job.input, step: job.step });
    } finally {
      job.finishedAt = Date.now();
    }
  };


  // ---------- character animation ----------
  const animJobs = new Map();
  let animCounter = 0;
  const ANIM_TIMEOUT_MS = 25 * 60 * 1000;

  const runAnimationJob = async (job, a) => {
    try {
      await comfy.ensureAlive();
      const width = a.width || 512, height = a.height || 512, frames = a.frames || 33, fps = a.fps || 16;
      const removeBg = a.remove_background ?? true;
      job.step = "Uploading the character picture";
      const src = await resolveImagePath(a.image, assetsDir);
      const startName = await uploadImageFile(src, { width, height });
      const template = await comfy.loadWorkflow(ANIMATION_WORKFLOW);
      const name = safeName(a.name || path.basename(src, path.extname(src)) + "_anim");
      const outRoot = path.resolve(assetsDir, a.folder || "animations");
      if (outRoot !== assetsDir && !outRoot.startsWith(assetsDir + path.sep)) throw new Error(`folder must stay inside ${assetsDir}`);
      const baseSeed = a.seed ?? randomSeed();
      job.takes = [];
      for (let v = 0; v < (a.variants || 1); v++) {
        const seed = baseSeed + v, tag = `${name}_v${v + 1}`;
        job.step = `Take ${v + 1}/${a.variants || 1}: generating ${frames} frames with WAN 2.2`;
        const wf = prepareAnimation(template, { startName, prompt: a.prompt, negative: a.negative_prompt, frames, width, height, seed, fps, prefix: `anim/${tag}` });
        const outs = await comfy.run(wf, [".png", ".mp4"], ANIM_TIMEOUT_MS);
        const pngs = outs.filter((o) => o.filename.toLowerCase().endsWith(".png")).sort((x, y) => x.filename.localeCompare(y.filename));
        const mp4 = outs.find((o) => o.filename.toLowerCase().endsWith(".mp4"));
        const dir = path.join(outRoot, tag);
        await fs.mkdir(path.join(dir, "frames"), { recursive: true });
        await fs.mkdir(path.join(dir, "raw"), { recursive: true });
        const finals = [];
        for (let i = 0; i < pngs.length; i++) {
          job.step = `Take ${v + 1}: removing backgrounds (${i + 1}/${pngs.length})`;
          const id = String(i).padStart(3, "0");
          await fs.writeFile(path.join(dir, "raw", `frame_${id}.png`), pngs[i].data);
          let data = pngs[i].data;
          if (removeBg) {
            const up = await comfy.uploadImage(data, `mcp_anim_${tag}_${id}.png`);
            const [mask] = await comfy.run(backgroundMaskWorkflow(up), IMAGE_EXTENSIONS, IMAGE_TIMEOUT_MS);
            data = await applyMask(data, mask.data);
          }
          await fs.writeFile(path.join(dir, "frames", `frame_${id}.png`), data);
          finals.push(data);
        }
        const { width: fw, height: fh } = await sharp(finals[0]).metadata();
        const cols = Math.min(a.columns || 8, finals.length);
        await fs.writeFile(path.join(dir, "sheet.png"), await spriteSheet(finals, fw, fh, cols));
        await fs.writeFile(path.join(dir, "sheet.json"), JSON.stringify({ frameWidth: fw, frameHeight: fh, frames: finals.length, columns: cols, fps, seed, prompt: a.prompt }, null, 1));
        const strip = await framePreview(finals);
        await fs.writeFile(path.join(dir, "strip.png"), strip);
        if (mp4) await fs.writeFile(path.join(dir, "preview.mp4"), mp4.data);
        job.takes.push({ variant: v + 1, seed, dir, frames: finals.length, sheet: `${cols} columns of ${fw}x${fh}`, strip });
        await notifyResourceListChanged();
      }
      job.status = "COMPLETED";
      job.step = "Done";
    } catch (error) {
      job.status = "FAILED";
      job.error = error.message;
      await logDetailedError(error, job.id, workDir, { input: job.input, step: job.step });
    } finally {
      job.finishedAt = Date.now();
    }
  };

  // ---------- game-asset pipeline ----------
  const randomSeed = () => Math.floor(Math.random() * 2 ** 40);
  const uploads = new Map(); // cache: "path|w|h" -> uploaded ComfyUI filename

  const uploadImageFile = async (filePath, fit) => {
    // The file's modification time is part of the key, so an edited guide is uploaded again.
    const { mtimeMs } = await fs.stat(filePath);
    const key = `${filePath}|${mtimeMs}|${fit ? `${fit.width}x${fit.height}` : "raw"}`;
    if (uploads.has(key)) return uploads.get(key);
    const buffer = fit ? await fitOnWhite(filePath, fit.width, fit.height) : await fs.readFile(filePath);
    const name = await comfy.uploadImage(buffer, `mcp_${safeName(path.basename(filePath, path.extname(filePath)))}_${fit ? `${fit.width}x${fit.height}` : "ref"}.png`);
    uploads.set(key, name);
    return name;
  };

  /**
   * Generates one or more images for a single asset request.
   * Returns [{ filePath, rawPath, seed, data }] where data is the final PNG buffer.
   */
  const generateAsset = async (o, { extraBases = [] } = {}) => {
    const mode = o.mode || "asset";
    const route = o.style_image ? "klein" : o.guide_image ? "control" : "plain";
    if (route === "klein" && !o.guide_image) throw new Error("style_image needs a guide_image (the shape to redraw)");
    const [aw, ah] = ASPECT_SIZES[o.aspect || (mode === "scene" ? "landscape" : "square")];
    const width = o.width || aw, height = o.height || ah;
    const removeBg = o.remove_background ?? mode === "asset";
    const prompt = mode === "asset" ? `${o.prompt}, ${PROMPT_SUFFIX}` : o.prompt;

    let guideName, styleName;
    if (o.guide_image) {
      const p = await resolveImagePath(o.guide_image, assetsDir, extraBases);
      guideName = await uploadImageFile(p, { width, height });
    }
    if (o.style_image) {
      const p = await resolveImagePath(o.style_image, assetsDir, extraBases);
      styleName = await uploadImageFile(p, null);
    }
    const template = await comfy.loadWorkflow(WORKFLOWS[route]);

    const outDir = path.resolve(assetsDir, o.folder || "");
    if (outDir !== assetsDir && !outDir.startsWith(assetsDir + path.sep)) throw new Error(`folder must stay inside ${assetsDir}`);
    const rawDir = path.join(outDir, "_raw");
    await fs.mkdir(rawDir, { recursive: true });

    const variants = o.variants || 1;
    const baseSeed = o.seed ?? randomSeed();
    const results = [];
    for (let v = 0; v < variants; v++) {
      const seed = baseSeed + v;
      const wf = prepareRoute(template, {
        route, prompt, seed, width, height, guideName, styleName,
        guideStrength: o.guide_strength, prefix: `mcp/${safeName(o.name || route)}`,
      });
      const [first] = await comfy.run(wf, IMAGE_EXTENSIONS, IMAGE_TIMEOUT_MS);
      let data = first.data;
      const base = o.name
        ? `${safeName(o.name)}${variants > 1 ? `_v${v + 1}` : ""}`
        : path.basename(generateUniqueFilename(mode === "scene" ? "2d_scene" : "2d_asset", "png", "generate_2d_asset"), ".png");
      const rawPath = path.join(rawDir, `${base}.png`);
      await fs.writeFile(rawPath, data);
      if (removeBg) {
        const uploaded = await comfy.uploadImage(data, `mcp_bg_${base}.png`);
        const [mask] = await comfy.run(backgroundMaskWorkflow(uploaded), IMAGE_EXTENSIONS, IMAGE_TIMEOUT_MS);
        data = await applyMask(data, mask.data);
      }
      const filePath = path.join(outDir, `${base}.png`);
      await fs.writeFile(filePath, data);
      results.push({ filePath, rawPath, seed, data, route });
    }
    return results;
  };

  // ---------- batches ----------
  const batches = new Map();
  let batchCounter = 0;

  const loadManifest = async (manifestArg) => {
    const manifestPath = path.isAbsolute(manifestArg) ? manifestArg : path.resolve(PROJECT_ROOT, manifestArg);
    let manifest;
    try {
      manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    } catch (e) {
      throw new Error(`Could not read manifest ${manifestPath}: ${e.message}`);
    }
    if (!Array.isArray(manifest.assets) || !manifest.assets.length) throw new Error("Manifest has no assets array");
    const style = manifest.style || {};
    const defaults = manifest.defaults || {};
    const output = manifest.output || `batches/${safeName(manifest.name || path.basename(manifestPath, ".json"))}`;
    if (manifest.type === "audio") {
      const items = manifest.assets.map((a, i) => {
        if (!a.id || !a.prompt) throw new Error(`Asset #${i + 1} needs an id and a prompt`);
        const merged = { ...defaults, ...a };
        const st = (style[merged.kind] || style);
        const prompt = [st.prefix, a.prompt, st.suffix].filter((x) => typeof x === "string" && x).join(", ");
        const { id, ...rest } = merged;
        return schemaAudio.parse({ ...rest, prompt });
      });
      return { audio: true, manifestPath, manifestDir: path.dirname(manifestPath), output, items, ids: manifest.assets.map((a) => a.id) };
    }
    const items = manifest.assets.map((a, i) => {
      if (!a.id || !a.prompt) throw new Error(`Asset #${i + 1} needs an id and a prompt`);
      const merged = { ...defaults, ...a };
      const prompt = [style.prefix, a.prompt, style.suffix].filter(Boolean).join(", ");
      return schema2D.parse({ ...merged, prompt, name: a.id, folder: output, id: undefined });
    });
    return { manifestPath, manifestDir: path.dirname(manifestPath), output, items, ids: manifest.assets.map((a) => a.id) };
  };

  const describeBatch = (b) => {
    const secs = Math.round(((b.finishedAt || Date.now()) - b.startedAt) / 1000);
    const lines = [
      `Batch ${b.id}: ${b.status} (${secs}s)`,
      `Progress: ${b.done}/${b.total} assets, ${b.images} images`,
    ];
    if (b.current) lines.push(`Working on: ${b.current}`);
    if (b.failures.length) lines.push(`Failed: ${b.failures.map((f) => `${f.id} (${f.error})`).join("; ")}`);
    if (b.outDir) lines.push(`Output folder: ${b.outDir}`);
    if (b.sheet) lines.push(`Contact sheet: ${b.sheet}`);
    if (b.page) lines.push(`Listening page: ${b.page}`);
    return lines.join("\n");
  };

  const runBatch = async (b, plan) => {
    const rows = [];
    const summary = [];
    try {
      await comfy.ensureAlive();
      for (let i = 0; i < plan.items.length; i++) {
        const item = plan.items[i];
        const id = plan.ids[i];
        b.current = id;
        try {
          const res = await generateAsset(item, { extraBases: [plan.manifestDir] });
          b.images += res.length;
          rows.push({ id, files: res.map((r) => r.filePath) });
          summary.push({ id, route: res[0]?.route, files: res.map((r) => ({ file: path.relative(b.outDir, r.filePath), seed: r.seed })) });
        } catch (e) {
          b.failures.push({ id, error: e.message });
          summary.push({ id, error: e.message });
          await log("ERROR", `Batch ${b.id} asset ${id} failed: ${e.message}`, workDir);
        }
        b.done++;
      }
      b.current = null;
      await fs.writeFile(path.join(b.outDir, "results.json"), JSON.stringify({ manifest: plan.manifestPath, finished: new Date().toISOString(), assets: summary }, null, 2));
      if (rows.length) b.sheet = await contactSheet(rows, path.join(b.outDir, "contact_sheet.png"));
      b.status = b.failures.length ? "COMPLETED_WITH_ERRORS" : "COMPLETED";
      await notifyResourceListChanged();
    } catch (e) {
      b.status = "FAILED";
      b.failures.push({ id: b.current || "batch", error: e.message });
    } finally {
      b.finishedAt = Date.now();
    }
  };

  const require_exists = (p) => { try { return !!statSync(p); } catch { return false; } };
  const runAudioBatch = async (b, plan) => {
    const rows = [];
    const summary = [];
    try {
      await comfy.ensureAlive();
      const templates = {};
      for (let i = 0; i < plan.items.length; i++) {
        const item = plan.items[i];
        const id = plan.ids[i];
        if (item.kind === "voice") continue; // voice lines run together below
        b.current = id;
        try {
          templates[item.kind] ||= await comfy.loadWorkflow(AUDIO_WORKFLOWS[item.kind]);
          const variants = item.variants || 1;
          const baseSeed = item.seed ?? randomSeed();
          const files = [];
          for (let v = 0; v < variants; v++) {
            const seed = baseSeed + v;
            const opts = { ...item, seed, prefix: `mcp_audio/${safeName(id)}` };
            const wf = item.kind === "music" ? prepareMusic(templates.music, opts) : prepareSfx(templates.sfx, opts);
            const [first] = await comfy.run(wf, AUDIO_EXTENSIONS, AUDIO_TIMEOUT_MS);
            const ext = path.extname(first.filename).toLowerCase() || ".flac";
            const filePath = path.join(b.outDir, `${safeName(id)}${variants > 1 ? `_v${v + 1}` : ""}${ext}`);
            await fs.writeFile(filePath, first.data);
            files.push({ filePath, seed });
            b.images++;
          }
          rows.push({ id, kind: item.kind, prompt: item.prompt, files: files.map((f) => f.filePath) });
          summary.push({ id, kind: item.kind, prompt: item.prompt, seconds: item.seconds, files: files.map((f) => ({ file: path.relative(b.outDir, f.filePath), seed: f.seed })) });
        } catch (e) {
          b.failures.push({ id, error: e.message });
          summary.push({ id, error: e.message });
          await log("ERROR", `Batch ${b.id} audio ${id} failed: ${e.message}`, workDir);
        }
        b.done++;
      }
      // voice lines: one Qwen3-TTS job per voice (same mode, model and reference), so the model loads once
      const groups = new Map();
      plan.items.forEach((item, i) => {
        if (item.kind !== "voice") return;
        const mode = item.mode || (item.ref_audio ? "clone" : "design");
        const model = item.model || (mode === "clone" ? TTS.cloneModel() : TTS.designModel());
        const key = JSON.stringify([mode, model, item.ref_audio || "", item.ref_text || "", item.language || "English"]);
        if (!groups.has(key)) groups.set(key, { mode, model, item, entries: [] });
        groups.get(key).entries.push({ i, item });
      });
      for (const g of groups.values()) {
        b.current = `voice: ${g.entries.map((e) => plan.ids[e.i]).join(", ")}`;
        try {
          let refAudio;
          if (g.mode === "clone") {
            if (!g.item.ref_audio) throw new Error("clone mode needs ref_audio");
            const cands = [path.resolve(plan.manifestDir, g.item.ref_audio), path.resolve(PROJECT_ROOT, g.item.ref_audio), path.resolve(assetsDir, g.item.ref_audio)];
            refAudio = cands.find((p) => { try { return require_exists(p); } catch { return false; } });
            if (!refAudio) throw new Error(`ref_audio not found: ${g.item.ref_audio}`);
          }
          const job = {
            mode: g.mode, model: g.model, language: g.item.language || "English", out_dir: b.outDir,
            ref_audio: refAudio, ref_text: g.item.ref_text,
            items: g.entries.map(({ i, item }) => ({
              id: safeName(plan.ids[i]), text: item.prompt, instruct: item.instruct,
              seed: item.seed ?? randomSeed(), variants: item.variants || 1,
            })),
          };
          const res = await runVoiceJob(job, path.join(workDir, "tts_jobs"));
          for (const { i, item } of g.entries) {
            const id = plan.ids[i];
            const files = res.files.filter((f) => f.id === safeName(id));
            const errs = res.errors.filter((e) => e.id === safeName(id));
            b.images += files.length;
            if (files.length) rows.push({ id, kind: "voice", prompt: item.prompt, files: files.map((f) => f.file), order: i });
            if (errs.length) b.failures.push({ id, error: errs.map((e) => e.error).join("; ") });
            summary.push({ id, kind: "voice", mode: g.mode, text: item.prompt, files: files.map((f) => ({ file: path.relative(b.outDir, f.file), seed: f.seed })), errors: errs });
            b.done++;
          }
        } catch (e) {
          for (const { i } of g.entries) { b.failures.push({ id: plan.ids[i], error: e.message }); b.done++; }
          await log("ERROR", `Batch ${b.id} voice job failed: ${e.message}`, workDir);
        }
      }
      b.current = null;
      await fs.writeFile(path.join(b.outDir, "results.json"), JSON.stringify({ manifest: plan.manifestPath, finished: new Date().toISOString(), assets: summary }, null, 2));
      if (rows.length) b.page = await listeningPage(rows, b.outDir, path.basename(b.outDir));
      b.status = b.failures.length ? "COMPLETED_WITH_ERRORS" : "COMPLETED";
      await notifyResourceListChanged();
    } catch (e) {
      b.status = "FAILED";
      b.failures.push({ id: b.current || "batch", error: e.message });
    } finally {
      b.finishedAt = Date.now();
    }
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    await log("INFO", `Calling tool: ${name}`, workDir);

    try {
      if (name === "generate_2d_asset") {
        const opts = schema2D.parse(args);
        await comfy.ensureAlive();
        const results = await generateAsset(opts);
        await notifyResourceListChanged();
        for (const r of results) await log("INFO", `2D asset saved at: ${r.filePath} (seed ${r.seed}, ${r.route})`, workDir);
        const text = results.map((r) => `${r.filePath} (seed ${r.seed}, route ${r.route}, filename: ${path.basename(r.filePath)})`).join("\n");
        return {
          content: [
            { type: "text", text: `2D asset${results.length > 1 ? "s" : ""} saved:\n${text}` },
            ...(await Promise.all(results.slice(0, 4).map((r) => preview(r.data)))),
          ],
          isError: false,
        };
      }

      if (name === "generate_batch") {
        const { manifest, only, dry_run } = schemaBatch.parse(args || {});
        const plan = await loadManifest(manifest);
        if (only?.length) {
          const keep = new Set(only);
          const idx = plan.ids.map((id, i) => (keep.has(id) ? i : -1)).filter((i) => i >= 0);
          if (!idx.length) throw new Error(`None of ${only.join(", ")} are in the manifest`);
          plan.items = idx.map((i) => plan.items[i]);
          plan.ids = idx.map((i) => plan.ids[i]);
        }
        const images = plan.items.reduce((n, it) => n + (it.variants || 1), 0);
        if (plan.audio) {
          const secs = plan.items.reduce((n, it) => n + (it.variants || 1) * (it.kind === "music" ? 20 + (it.seconds || 60) * 0.3 : it.kind === "voice" ? 8 : 6), 0) + (plan.items.some((it) => it.kind === "voice") ? 60 : 0);
          const listingA = plan.ids.map((id, i) => {
            const it = plan.items[i];
            return `- ${id}: ${it.variants || 1}x ${it.kind}${it.kind === "voice" ? ` (${it.mode || (it.ref_audio ? "clone" : "design")}) "${it.prompt.slice(0, 50)}"` : `, ${it.seconds}s`}`;
          }).join("\n");
          const head = `${plan.items.length} sounds, ${images} files (about ${Math.max(1, Math.ceil(secs / 60))} min)`;
          if (dry_run) return { content: [{ type: "text", text: `Dry run: ${head} into assets/${plan.output}\n${listingA}` }] };
          await comfy.ensureAlive();
          const id = `BATCH-${++batchCounter}`;
          const outDir = path.join(assetsDir, plan.output);
          await fs.mkdir(outDir, { recursive: true });
          const b = { id, status: "RUNNING", total: plan.items.length, done: 0, images: 0, failures: [], outDir, startedAt: Date.now() };
          batches.set(id, b);
          runAudioBatch(b, plan);
          return { content: [{ type: "text", text: `Started audio batch ${id}: ${head}. Output: ${outDir}. Use check_batch_status with operation_id "${id}".\n${listingA}` }], isError: false };
        }
        const listing = plan.ids.map((id, i) => {
          const it = plan.items[i];
          const route = it.style_image ? "klein" : it.guide_image ? "control" : "plain";
          return `- ${id}: ${it.variants || 1}x ${route}${it.guide_image ? `, guide ${it.guide_image}` : ""}`;
        }).join("\n");
        if (dry_run) {
          return { content: [{ type: "text", text: `Dry run: ${plan.items.length} assets, ${images} images (about ${Math.ceil(images * 7 / 60)} min) into assets/${plan.output}\n${listing}` }] };
        }
        await comfy.ensureAlive();
        const id = `BATCH-${++batchCounter}`;
        const outDir = path.join(assetsDir, plan.output);
        await fs.mkdir(outDir, { recursive: true });
        const b = { id, status: "RUNNING", total: plan.items.length, done: 0, images: 0, failures: [], outDir, startedAt: Date.now() };
        batches.set(id, b);
        runBatch(b, plan);
        return {
          content: [{
            type: "text",
            text: `Started batch ${id}: ${plan.items.length} assets, ${images} images (about ${Math.ceil(images * 7 / 60)} min). ` +
              `Output: ${outDir}. Use check_batch_status with operation_id "${id}".\n${listing}`,
          }],
          isError: false,
        };
      }

      if (name === "check_batch_status") {
        const { operation_id } = schemaBatchStatus.parse(args || {});
        if (!operation_id) {
          const all = [...batches.values()].map(describeBatch);
          return { content: [{ type: "text", text: all.length ? all.join("\n\n") : "No batches since the server started." }] };
        }
        const b = batches.get(operation_id);
        if (!b) return { content: [{ type: "text", text: `Unknown batch "${operation_id}". IDs reset when the server restarts.` }], isError: true };
        const content = [{ type: "text", text: describeBatch(b) }];
        if (b.sheet) {
          const png = await sharp(b.sheet).resize(1400, 1400, { fit: "inside" }).png().toBuffer();
          content.push({ type: "image", data: png.toString("base64"), mimeType: "image/png" });
        }
        return { content, isError: false };
      }

      if (name === "generate_3d_asset") {
        const parsed = schema3D.parse(args || {});
        await comfy.ensureAlive();
        const id = `3D-${++counter}`;
        const job = {
          id,
          status: "RUNNING",
          step: "Queued",
          input: parsed.image ? `image ${parsed.image}` : `prompt "${parsed.prompt}"`,
          quality: [parsed.quality, parsed.face_count && `${parsed.face_count} faces`, parsed.texture_size && `${parsed.texture_size}px textures`].filter(Boolean).join(", "),
          startedAt: Date.now(),
        };
        jobs.set(id, job);
        run3dJob(job, parsed, name);
        return {
          content: [
            {
              type: "text",
              text:
                `Started 3D generation (Operation ID: ${id}). This usually takes a few minutes on the local GPU. ` +
                `Use check_3d_status with operation_id "${id}" to get the result.`,
            },
          ],
          isError: false,
        };
      }

      if (name === "generate_animation") {
        const parsed = schemaAnimation.parse(args || {});
        await comfy.ensureAlive();
        const id = `ANIM-${++animCounter}`;
        const job = { id, status: "RUNNING", step: "Queued", input: `${parsed.image}: "${parsed.prompt}"`, startedAt: Date.now() };
        animJobs.set(id, job);
        runAnimationJob(job, parsed);
        return {
          content: [{ type: "text", text: `Started animation (Operation ID: ${id}), about 3 minutes per take. Use check_animation_status with operation_id "${id}".` }],
          isError: false,
        };
      }

      if (name === "check_animation_status") {
        const { operation_id } = schemaStatus.parse(args || {});
        if (!operation_id) {
          const all = [...animJobs.values()].map(describeJob);
          return { content: [{ type: "text", text: all.length ? all.join("\n\n") : "No animation jobs since the server started." }] };
        }
        const job = animJobs.get(operation_id);
        if (!job) return { content: [{ type: "text", text: `Unknown operation ID "${operation_id}". IDs reset when the server restarts.` }], isError: true };
        const content = [{ type: "text", text: describeJob(job) }];
        for (const t of job.takes || []) {
          const png = await sharp(t.strip).resize(1600, 260, { fit: "inside" }).png().toBuffer();
          content.push({ type: "image", data: png.toString("base64"), mimeType: "image/png" });
        }
        return { content, isError: false };
      }

      if (name === "check_3d_status") {
        const { operation_id } = schemaStatus.parse(args || {});
        if (!operation_id) {
          const all = [...jobs.values()].map(describeJob);
          return { content: [{ type: "text", text: all.length ? all.join("\n\n") : "No 3D jobs since the server started." }] };
        }
        const job = jobs.get(operation_id);
        if (!job) {
          return { content: [{ type: "text", text: `Unknown operation ID "${operation_id}". IDs reset when the server restarts.` }], isError: true };
        }
        return { content: [{ type: "text", text: describeJob(job) }], isError: false };
      }

      throw { code: MCP_ERROR_CODES.MethodNotFound, message: `Unknown tool: ${name}` };
    } catch (error) {
      let errorMessage = error.message || "Unknown error";
      let errorCode = error.code || MCP_ERROR_CODES.InternalError;
      if (error instanceof z.ZodError) {
        errorCode = MCP_ERROR_CODES.InvalidParams;
        errorMessage = `Invalid parameters: ${error.errors.map((e) => e.message).join(", ")}`;
      }
      await log("ERROR", `Error in ${name}: ${errorMessage}`, workDir);
      return { content: [{ type: "text", text: `Error: ${errorMessage}` }], isError: true, errorCode };
    }
  });
}
