// Character animation: WAN 2.2 image-to-video (14B, 4-step distilled GGUF, two experts swapped through VRAM)
// turns one character picture into a short clip; the connector then removes each frame's background and
// lays the frames out as a sprite sheet. Workflow adapted from mor-o/comfyui-2d-character-pipeline (MIT), W2.
import path from "path";
import sharp from "sharp";
import { PROJECT_ROOT } from "./comfy.js";

export const ANIMATION_WORKFLOW = process.env.COMFY_ANIMATION_WORKFLOW || path.join(PROJECT_ROOT, "animate.json");

// What a sprite never wants: a moving camera, scenery, smeared or extra body parts.
export const DEFAULT_NEGATIVE =
  "camera movement, camera pan, zoom, dolly, rotating camera, cut, scene change, background, scenery, floor, ground, " +
  "shadow, cast shadow, extra limbs, extra arms, extra legs, extra fingers, missing limbs, deformed hands, fused fingers, " +
  "melting, morphing, warping, distorted face, second character, duplicate, text, watermark, blurry, flicker, jitter, " +
  "color shift, style change, realistic, photo, 3d render";

export const PROMPT_SUFFIX =
  "The camera is completely static and locked off, the character stays centered in the frame on a plain white background. " +
  "Same art style, colours and outlines as the first frame in every frame, smooth continuous motion.";

const nodesOf = (wf, type) => Object.values(wf).filter((n) => n.class_type === type);

/** opts: { startName, prompt, negative, frames, width, height, seed, fps, prefix } */
export function prepareAnimation(template, o) {
  const wf = structuredClone(template);
  const i2v = nodesOf(wf, "WanImageToVideo")[0];
  if (!i2v) throw new Error("animate.json has no WanImageToVideo node");
  Object.assign(i2v.inputs, { width: o.width, height: o.height, length: o.frames });
  const pos = wf[i2v.inputs.positive[0]], neg = wf[i2v.inputs.negative[0]];
  pos.inputs.text = `${o.prompt} ${PROMPT_SUFFIX}`;
  neg.inputs.text = o.negative || DEFAULT_NEGATIVE;
  for (const n of nodesOf(wf, "LoadImage")) n.inputs.image = o.startName;
  for (const n of nodesOf(wf, "KSamplerAdvanced")) n.inputs.noise_seed = o.seed;
  for (const n of nodesOf(wf, "CreateVideo")) n.inputs.fps = o.fps;
  for (const n of nodesOf(wf, "SaveImage")) n.inputs.filename_prefix = `${o.prefix}/frame`;
  for (const n of nodesOf(wf, "SaveVideo")) n.inputs.filename_prefix = `${o.prefix}/preview`;
  return wf;
}

/** Lays transparent frames out left-to-right, top-to-bottom in a grid of equal cells. */
export async function spriteSheet(frames, width, height, cols) {
  const rows = Math.ceil(frames.length / cols);
  return sharp({ create: { width: cols * width, height: rows * height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(frames.map((input, i) => ({ input, left: (i % cols) * width, top: Math.floor(i / cols) * height })))
    .png()
    .toBuffer();
}

/** A labelled strip of every few frames on a light background, for quick review. */
export async function framePreview(frames, every = 4, cell = 200) {
  const pick = frames.filter((_, i) => i % every === 0);
  const tiles = await Promise.all(pick.map((f) =>
    sharp(f).resize(cell, cell, { fit: "contain", background: { r: 236, g: 232, b: 222, alpha: 1 } }).flatten({ background: "#ece8de" }).png().toBuffer()));
  return sharp({ create: { width: tiles.length * (cell + 6) + 6, height: cell + 12, channels: 3, background: "#f7f3ea" } })
    .composite(tiles.map((input, i) => ({ input, left: 6 + i * (cell + 6), top: 6 })))
    .png()
    .toBuffer();
}
