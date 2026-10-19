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
  /** 'scuttle' = single frame driven by a fast hop with squash and stretch (no painted leg frames). */
  gait?: 'scuttle';
  /** Where the sprite touches the ground, as a fraction of its width and height. */
  origin: [number, number];
  /** On-screen size in game pixels (the file is twice this). */
  display: [number, number];
}

export const SPRITES = {
  tower_arrow: {
    key: 'sp_tower_arrow', file: 'sprites/era1/tower_arrow_base.png', origin: [0.51, 0.8], display: [96, 117],
  },
  tower_arrow_l2: { key: 'sp_tower_arrow_l2', file: 'sprites/era1/tower_arrow_l2.png', origin: [0.51, 0.8], display: [96, 117] },
  tower_arrow_l3: { key: 'sp_tower_arrow_l3', file: 'sprites/era1/tower_arrow_l3.png', origin: [0.51, 0.8], display: [96, 117] },
  tower_boomstick: { key: 'sp_tower_boomstick', file: 'sprites/era1/tower_boomstick.png', origin: [0.515, 0.805], display: [96, 118] },
  tower_bombard: { key: 'sp_tower_bombard', file: 'sprites/era1/tower_bombard.png', origin: [0.5, 0.758], display: [100, 104] },
  tower_boomstick_l2: { key: 'sp_tower_boomstick_l2', file: 'sprites/era1/tower_boomstick_l2.png', origin: [0.513, 0.809], display: [97, 121] },
  tower_boomstick_l3: { key: 'sp_tower_boomstick_l3', file: 'sprites/era1/tower_boomstick_l3.png', origin: [0.515, 0.804], display: [96, 118] },
  tower_bombard_l2: { key: 'sp_tower_bombard_l2', file: 'sprites/era1/tower_bombard_l2.png', origin: [0.499, 0.784], display: [100, 116] },
  tower_bombard_l3: { key: 'sp_tower_bombard_l3', file: 'sprites/era1/tower_bombard_l3.png', origin: [0.499, 0.781], display: [100, 115] },
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
  // the scorpion-tailed crawler; one frame, animated in code
  enemy_fast: {
    key: 'sp_enemy_fast', file: 'sprites/era1/enemy_fast_walk0.png', origin: [0.59, 0.987], display: [59, 60],
    facesLeft: true, gait: 'scuttle',
  },
  // possessed knight dragging his axe; painted facing right
  enemy_armored: {
    key: 'sp_enemy_armored', file: 'sprites/era1/enemy_armored_walk0.png', origin: [0.6, 0.988], display: [55, 62],
    frames: [
      { key: 'sp_enemy_armored_walk1', file: 'sprites/era1/enemy_armored_walk1.png' },
      { key: 'sp_enemy_armored_walk2', file: 'sprites/era1/enemy_armored_walk2.png' },
    ],
    walkOrder: [1, 0, 2, 0],
  },
  cabin: { key: 'sp_cabin', file: 'sprites/era1/cabin.png', origin: [0.48, 0.82], display: [162, 180] },
  map_ground: { key: 'sp_map_ground', file: 'sprites/era1/map_ground.jpg', origin: [0, 0], display: [1280, 720] },
  crypt: { key: 'sp_crypt', file: 'sprites/era1/crypt.png', origin: [0.5, 0.9], display: [150, 92] },
  tree_1: { key: 'sp_tree_1', file: 'sprites/era1/tree_1.png', origin: [0.5, 0.97], display: [94, 90] },
  pine_1: { key: 'sp_pine_1', file: 'sprites/era1/pine_1.png', origin: [0.5, 0.97], display: [43, 100] },
  tree_2: { key: 'sp_tree_2', file: 'sprites/era1/tree_2.png', origin: [0.5, 0.97], display: [76, 90] },
  pine_2: { key: 'sp_pine_2', file: 'sprites/era1/pine_2.png', origin: [0.5, 0.97], display: [56, 100] },
  tree_3: { key: 'sp_tree_3', file: 'sprites/era1/tree_3.png', origin: [0.5, 0.97], display: [89, 90] },
  pine_3: { key: 'sp_pine_3', file: 'sprites/era1/pine_3.png', origin: [0.5, 0.97], display: [51, 100] },
  tree_4: { key: 'sp_tree_4', file: 'sprites/era1/tree_4.png', origin: [0.5, 0.97], display: [83, 90] },
  pine_4: { key: 'sp_pine_4', file: 'sprites/era1/pine_4.png', origin: [0.5, 0.97], display: [40, 92] },
  bush_1: { key: 'sp_bush_1', file: 'sprites/era1/bush_1.png', origin: [0.5, 0.9], display: [52, 50] },
  bush_2: { key: 'sp_bush_2', file: 'sprites/era1/bush_2.png', origin: [0.5, 0.9], display: [54, 41] },
  bush_3: { key: 'sp_bush_3', file: 'sprites/era1/bush_3.png', origin: [0.5, 0.9], display: [54, 44] },
  rock_1: { key: 'sp_rock_1', file: 'sprites/era1/rock_1.png', origin: [0.5, 0.9], display: [45, 46] },
  rock_2: { key: 'sp_rock_2', file: 'sprites/era1/rock_2.png', origin: [0.5, 0.9], display: [44, 46] },
  plot: { key: 'sp_plot', file: 'sprites/era1/plot.png', origin: [0.5, 0.5], display: [66, 35] },
  plot_high: { key: 'sp_plot_high', file: 'sprites/era1/plot_high.png', origin: [0.5, 0.367], display: [82, 59] },
  ui_panel: { key: 'sp_ui_panel', file: 'sprites/era1/ui_panel.png', origin: [0.5, 0.5], display: [197, 44] },
  ui_button: { key: 'sp_ui_button', file: 'sprites/era1/ui_button.png', origin: [0.5, 0.5], display: [98, 50] },
  ui_button_round: { key: 'sp_ui_button_round', file: 'sprites/era1/ui_button_round.png', origin: [0.5, 0.5], display: [56, 56] },
  icon_upgrade: { key: 'sp_icon_upgrade', file: 'sprites/era1/icon_upgrade.png', origin: [0.5, 0.5], display: [32, 32] },
  icon_sell: { key: 'sp_icon_sell', file: 'sprites/era1/icon_sell.png', origin: [0.5, 0.5], display: [32, 32] },
  icon_max: { key: 'sp_icon_max', file: 'sprites/era1/icon_max.png', origin: [0.5, 0.5], display: [32, 32] },
  icon_heart: { key: 'sp_icon_heart', file: 'sprites/era1/icon_heart.png', origin: [0.5, 0.5], display: [32, 32] },
  icon_coin: { key: 'sp_icon_coin', file: 'sprites/era1/icon_coin.png', origin: [0.5, 0.5], display: [32, 32] },
  icon_skull: { key: 'sp_icon_skull', file: 'sprites/era1/icon_skull.png', origin: [0.5, 0.5], display: [32, 32] },
  icon_book: { key: 'sp_icon_book', file: 'sprites/era1/icon_book.png', origin: [0.5, 0.5], display: [32, 32] },
  hero_neutral: { key: 'sp_hero_neutral', file: 'sprites/era1/hero_neutral.png', origin: [0.5, 0.5], display: [128, 128] },
  hero_furious: { key: 'sp_hero_furious', file: 'sprites/era1/hero_furious.png', origin: [0.5, 0.5], display: [128, 128] },
  hero_smug: { key: 'sp_hero_smug', file: 'sprites/era1/hero_smug.png', origin: [0.5, 0.5], display: [128, 128] },
  hero_laugh: { key: 'sp_hero_laugh', file: 'sprites/era1/hero_laugh.png', origin: [0.5, 0.5], display: [128, 128] },
} satisfies Record<string, SpriteMeta>;

export type SpriteName = keyof typeof SPRITES;

/** Arrow tower layout, as fractions of the tower sprite's height (0 = top). */
export const ARROW_TOWER = {
  /** The archer's feet stand here, on the platform floor. */
  archerFeetY: 0.4,
  /** The front parapet band, redrawn over the archer so he stands behind the battlements. */
  frontBand: [0.355, 0.47] as [number, number],
};

/** Painted sprite per tower kind and level (index 0 = level 1). */
export const TOWER_SPRITES: Record<string, SpriteName[]> = {
  arrow: ['tower_arrow', 'tower_arrow_l2', 'tower_arrow_l3'],
  mg: ['tower_boomstick', 'tower_boomstick_l2', 'tower_boomstick_l3'],
  mortar: ['tower_bombard', 'tower_bombard_l2', 'tower_bombard_l3'],
};

/** Where shots leave a static gun sprite, in game pixels from its ground anchor (sprite unflipped). */
export const GUN_MUZZLE: Record<string, { x: number; y: number; facesLeft: boolean }> = {
  mg: { x: -47, y: -91, facesLeft: true },
  mortar: { x: -15, y: -72, facesLeft: false },
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

/** All loaded variants of a sprite family, e.g. variants(scene, 'tree') -> ['tree_1', 'tree_3']. */
export function variants(scene: Phaser.Scene, family: string): SpriteName[] {
  return (Object.keys(SPRITES) as SpriteName[]).filter(k => k.startsWith(family + '_') && hasSprite(scene, k));
}

/** Adds a sprite image with its ground anchor and on-screen size applied. */
export function addSprite(scene: Phaser.Scene, name: SpriteName, x: number, y: number) {
  const s: SpriteMeta = SPRITES[name];
  return scene.add.image(x, y, s.key).setOrigin(s.origin[0], s.origin[1]).setDisplaySize(s.display[0], s.display[1]);
}
