// AI-generated sprites and how they sit in the world.
// Each sprite replaces a code drawing from art.ts; anything without a sprite keeps its code drawing.
// Files live in public/sprites/<era>/ and are stored at 2x their on-screen size for crispness.
import Phaser from 'phaser';

export interface SpriteMeta {
  key: string;
  file: string;
  /** Extra animation frames (texture keys and files), played in walkOrder. */
  frames?: { key: string; file: string }[];
  /** Order of frame indexes for one walk cycle; 0 = the main sprite. */
  walkOrder?: number[];
  /** The painted sprite faces left, so it is flipped when moving right. */
  facesLeft?: boolean;
  /** Where the sprite touches the ground, as a fraction of its width and height. */
  origin: [number, number];
  /** On-screen size in game pixels (the file is twice this). */
  display: [number, number];
}

export const SPRITES = {
  tower_arrow: {
    key: 'sp_tower_arrow', file: 'sprites/era1/tower_arrow_base.png', origin: [0.51, 0.8], display: [96, 117],
  },
  archer: { key: 'sp_archer', file: 'sprites/era1/archer.png', origin: [0.5, 1], display: [34, 44] },
  enemy_grunt: {
    key: 'sp_enemy_grunt', file: 'sprites/era1/enemy_grunt_walk0.png', origin: [0.5, 0.985], display: [50, 54],
    frames: [
      { key: 'sp_enemy_grunt_walk1', file: 'sprites/era1/enemy_grunt_walk1.png' },
      { key: 'sp_enemy_grunt_walk2', file: 'sprites/era1/enemy_grunt_walk2.png' },
    ],
    // stride, pass, other stride, pass
    walkOrder: [1, 0, 2, 0],
    facesLeft: true,
  },
  cabin: { key: 'sp_cabin', file: 'sprites/era1/cabin.png', origin: [0.48, 0.82], display: [176, 180] },
} satisfies Record<string, SpriteMeta>;

export type SpriteName = keyof typeof SPRITES;

/** Arrow tower layout, as fractions of the tower sprite's height (0 = top). */
export const ARROW_TOWER = {
  /** The archer's feet stand here, on the platform floor. */
  archerFeetY: 0.4,
  /** The front parapet band, redrawn over the archer so he stands behind the battlements. */
  frontBand: [0.355, 0.47] as [number, number],
};

/** Cabin chimney opening, as fractions of the cabin sprite's width and height. */
export const CABIN_CHIMNEY: [number, number] = [0.81, 0.04];

export function preloadSprites(scene: Phaser.Scene) {
  for (const s of Object.values(SPRITES) as SpriteMeta[]) {
    scene.load.image(s.key, s.file);
    for (const f of s.frames ?? []) scene.load.image(f.key, f.file);
  }
}

/** Texture key for a walk-cycle step (phase in radians, one cycle per 2π). */
export function walkFrameKey(meta: SpriteMeta, phase: number) {
  if (!meta.walkOrder || !meta.frames?.length) return meta.key;
  const order = meta.walkOrder;
  const i = order[Math.floor(((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2) * order.length) % order.length];
  return i === 0 ? meta.key : meta.frames[i - 1].key;
}

export function hasSprite(scene: Phaser.Scene, name: SpriteName) {
  return scene.textures.exists(SPRITES[name].key);
}

/** Adds a sprite image with its ground anchor and on-screen size applied. */
export function addSprite(scene: Phaser.Scene, name: SpriteName, x: number, y: number) {
  const s: SpriteMeta = SPRITES[name];
  return scene.add.image(x, y, s.key).setOrigin(s.origin[0], s.origin[1]).setDisplaySize(s.display[0], s.display[1]);
}
