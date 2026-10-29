// Layered effects for Era Studio eras: a tower's hit, its shot in flight (or a stream's jet) and its burning ground
// can be described as a recipe of procedural layers (flash, fireball, smoke, sparks, shards, mist, ring, ground mark…),
// drawn by the same code as the built-in explosion (src/effects.ts). The generated pictures can still take part, as a
// small element (`image`) or as the texture of flung `shards`, never as the whole effect.
//
// Every number is held inside FX_LIMITS, whatever the era file says, so a recipe can't flood the screen. A TowerFx
// without a recipe keeps its old look (the hit picture, the trail motes, the sprite spray).
import { clamp, colour } from './eraFx';

export type FxLayerType =
  | 'flash'     // a white-hot additive glow that swells and vanishes
  | 'fireball'  // glowing blobs that swell and rise, cooling through `colors` (hot to cool); in a stream: the flame jet
  | 'smoke'     // dark puffs billowing up and drifting (normal blend)
  | 'sparks'    // bright points thrown out in arcs and pulled down
  | 'embers'    // small glowing motes rising slowly and flickering
  | 'shards'    // pieces flung out in arcs, spinning, landing (ice chunks, burning splinters); `texture` may be a picture
  | 'mist'      // a soft cold cloud spreading low and fading slowly
  | 'ring'      // a shockwave ellipse racing out over the ground
  | 'mark'      // a ground decal left behind (scorch, frost patch with `cracks`)
  | 'spikes'    // ice crystals jutting out of the ground and breaking off
  | 'image'     // the generated picture as a small element: pops, swells a little and fades
  | 'core';     // shots in flight and streams: a pulsing glow on the shot itself (a stream: its cone)

export interface FxLayer {
  type: FxLayerType;
  /** '#rrggbb', hot to cool (up to 4). Each type has its own default. */
  colors?: string[];
  /** Size as a share of the effect's size (0.2-2, default 1). */
  size?: number;
  /** How many pieces (each type has its own range). */
  count?: number;
  /** How long its pieces live, ms. */
  life?: number;
  /** Start after this many ms. */
  delay?: number;
  /** How fast pieces are thrown (0.3-2, default 1). */
  speed?: number;
  /** How far pieces rise or are thrown up (0-2, default 1). */
  rise?: number;
  /** shards / image: 'impact', 'projectile' (this look's own pictures) or one of the era's sprite names. */
  texture?: string;
  /** 'add' glows, 'normal' covers. Each type has its own default. */
  blend?: 'add' | 'normal';
  /** Shots in flight, streams and burning ground: ms between puffs. */
  every?: number;
  /** mark: crack lines across it (a frost patch), 0-10. */
  cracks?: number;
  /** shards: leave a trail of motes in their colour. */
  trail?: boolean;
}

export interface FxRecipe {
  layers: FxLayer[];
  /** Splash hits: the effect's width as a share of the blast area's width (0.3-1.2, default 0.8). */
  scale?: number;
  /** Direct hits (no splash): the effect's size in game pixels (12-80, default 32). */
  size?: number;
  /** A tiny camera kick (splash hits only). */
  shake?: boolean;
  /** Shots in flight: also draw the shot's picture (default true). */
  sprite?: boolean;
}

/** The ranges every recipe number is held in. count ranges are per layer type. */
export const FX_LIMITS = {
  layers: 10, colors: 4,
  scale: [0.3, 1.2], size: [12, 80], layerSize: [0.2, 2], speed: [0.3, 2], rise: [0, 2],
  life: [80, 2500], markLife: [300, 5000], delay: [0, 600], every: [15, 400], cracks: [0, 10],
  count: {
    flash: [1, 1], fireball: [1, 16], smoke: [1, 10], sparks: [1, 24], embers: [1, 16], shards: [1, 12],
    mist: [1, 10], ring: [1, 1], mark: [1, 1], spikes: [1, 10], image: [1, 1], core: [1, 1],
  },
} as const;

/** Defaults per type: colours, count and life. */
const DEFAULTS: Record<FxLayerType, { colors: number[]; count: number; life: number; blend: 'add' | 'normal'; every: number }> = {
  flash: { colors: [0xfff4d0], count: 1, life: 180, blend: 'add', every: 60 },
  fireball: { colors: [0xffe27a, 0xff9a2e, 0xff5a1f], count: 10, life: 520, blend: 'add', every: 30 },
  smoke: { colors: [0x6e6874], count: 5, life: 1100, blend: 'normal', every: 80 },
  sparks: { colors: [0xffd27a], count: 10, life: 650, blend: 'add', every: 40 },
  embers: { colors: [0xffb347], count: 6, life: 900, blend: 'add', every: 60 },
  shards: { colors: [0xe8f6ff, 0x9fd0f0], count: 6, life: 700, blend: 'normal', every: 60 },
  mist: { colors: [0xdcefff], count: 5, life: 1100, blend: 'normal', every: 40 },
  ring: { colors: [0xffd9a0], count: 1, life: 320, blend: 'normal', every: 200 },
  mark: { colors: [0x140a08], count: 1, life: 2800, blend: 'normal', every: 200 },
  spikes: { colors: [0xe6f7ff, 0x7cc0ea], count: 5, life: 700, blend: 'normal', every: 120 },
  image: { colors: [0xffffff], count: 1, life: 300, blend: 'normal', every: 120 },
  core: { colors: [0xffffff, 0xffb347], count: 1, life: 0, blend: 'add', every: 0 },
};

/** A layer with every number in range and colours as Phaser numbers. */
export interface SafeLayer {
  type: FxLayerType; colors: number[]; size: number; count: number; life: number; delay: number; speed: number;
  rise: number; texture?: string; blend: 'add' | 'normal'; every: number; cracks: number; trail: boolean;
  /** The recipe gave its own colours (a textured piece is tinted only then). */
  ownColors: boolean;
}
export interface SafeRecipe { layers: SafeLayer[]; scale: number; size: number; shake: boolean; sprite: boolean }

const L = FX_LIMITS;
const TYPES = new Set(Object.keys(DEFAULTS));
const cache = new WeakMap<FxRecipe, SafeRecipe | null>();

/** The recipe with every number held in range (undefined when it has no usable layer). Cached per recipe object. */
export function safeRecipe(r: FxRecipe | undefined): SafeRecipe | undefined {
  if (!r || typeof r !== 'object') return undefined;
  if (cache.has(r)) return cache.get(r) ?? undefined;
  const layers: SafeLayer[] = [];
  for (const l of Array.isArray(r.layers) ? r.layers.slice(0, L.layers) : []) {
    if (!l || !TYPES.has(l.type)) continue;
    const d = DEFAULTS[l.type];
    const cols = (Array.isArray(l.colors) ? l.colors : []).map(colour).filter((c): c is number => c !== undefined).slice(0, L.colors);
    const [cLo, cHi] = L.count[l.type];
    const [lLo, lHi] = l.type === 'mark' ? L.markLife : L.life;
    layers.push({
      type: l.type, colors: cols.length ? cols : d.colors,
      size: clamp(l.size, L.layerSize[0], L.layerSize[1], 1),
      count: Math.round(clamp(l.count, cLo, cHi, d.count)),
      life: l.type === 'core' ? 0 : clamp(l.life, lLo, lHi, d.life),
      delay: clamp(l.delay, L.delay[0], L.delay[1], 0),
      speed: clamp(l.speed, L.speed[0], L.speed[1], 1),
      rise: clamp(l.rise, L.rise[0], L.rise[1], 1),
      texture: typeof l.texture === 'string' && /^[a-z0-9_]{1,64}$/.test(l.texture) ? l.texture : undefined,
      blend: l.blend === 'add' || l.blend === 'normal' ? l.blend : d.blend,
      every: clamp(l.every, L.every[0], L.every[1], d.every || 60),
      cracks: Math.round(clamp(l.cracks, L.cracks[0], L.cracks[1], 0)),
      trail: !!l.trail, ownColors: cols.length > 0,
    });
  }
  const out: SafeRecipe | null = layers.length ? {
    layers, scale: clamp(r.scale, L.scale[0], L.scale[1], 0.8), size: clamp(r.size, L.size[0], L.size[1], 32),
    shake: !!r.shake, sprite: r.sprite !== false,
  } : null;
  cache.set(r, out);
  return out ?? undefined;
}
