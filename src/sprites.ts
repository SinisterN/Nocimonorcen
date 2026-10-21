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
  /**
   * Code-driven walks for single-frame sprites: 'scuttle' = fast hops with squash and stretch,
   * 'stomp' = heavy rocking steps with a squash on each foot-plant, 'roll' = tracked droid: jitter and lean.
   */
  gait?: 'scuttle' | 'stomp' | 'roll';
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
  // back views (walking up the screen) and the newer undead
  enemy_shaman_back: { key: 'sp_enemy_shaman_back', file: 'sprites/era1/enemy_shaman_back.png', origin: [0.5, 0.985], display: [42, 62], facesLeft: true, gait: 'stomp' },
  enemy_brute_back: { key: 'sp_enemy_brute_back', file: 'sprites/era1/enemy_brute_back.png', origin: [0.5, 0.985], display: [103, 112], facesLeft: true, gait: 'stomp' },
  enemy_armored_back: { key: 'sp_enemy_armored_back', file: 'sprites/era1/enemy_armored_back.png', origin: [0.5, 0.985], display: [52, 62], facesLeft: true, gait: 'stomp' },
  enemy_grunt_back: { key: 'sp_enemy_grunt_back', file: 'sprites/era1/enemy_grunt_back.png', origin: [0.5, 0.985], display: [52, 54], facesLeft: true, gait: 'stomp' },
  enemy_fast_back: { key: 'sp_enemy_fast_back', file: 'sprites/era1/enemy_fast_back.png', origin: [0.5, 0.985], display: [51, 60], gait: 'scuttle' },
  enemy_shaman: { key: 'sp_enemy_shaman', file: 'sprites/era1/enemy_shaman.png', origin: [0.5, 0.985], display: [61, 62], gait: 'stomp' },
  enemy_brute: { key: 'sp_enemy_brute', file: 'sprites/era1/enemy_brute.png', origin: [0.5, 0.985], display: [118, 112], gait: 'stomp' },
  cabin: { key: 'sp_cabin', file: 'sprites/era1/cabin.png', origin: [0.48, 0.82], display: [162, 180] },
  map_ground: { key: 'sp_map_ground', file: 'sprites/era1/map_ground.jpg', origin: [0, 0], display: [1280, 720] },
  crypt: { key: 'sp_crypt', file: 'sprites/era1/crypt.png', origin: [0.5, 0.9], display: [150, 92] },
  tree_1: { key: 'sp_tree_1', file: 'sprites/era1/tree_1.png', origin: [0.5, 0.97], display: [83, 90] },
  tree_2: { key: 'sp_tree_2', file: 'sprites/era1/tree_2.png', origin: [0.5, 0.97], display: [87, 90] },
  tree_3: { key: 'sp_tree_3', file: 'sprites/era1/tree_3.png', origin: [0.5, 0.97], display: [89, 90] },
  tree_4: { key: 'sp_tree_4', file: 'sprites/era1/tree_4.png', origin: [0.5, 0.97], display: [83, 90] },
  bush_1: { key: 'sp_bush_1', file: 'sprites/era1/bush_1.png', origin: [0.5, 0.9], display: [52, 50] },
  bush_2: { key: 'sp_bush_2', file: 'sprites/era1/bush_2.png', origin: [0.5, 0.9], display: [54, 41] },
  bush_3: { key: 'sp_bush_3', file: 'sprites/era1/bush_3.png', origin: [0.5, 0.9], display: [54, 44] },
  rock_1: { key: 'sp_rock_1', file: 'sprites/era1/rock_1.png', origin: [0.5, 0.9], display: [45, 46] },
  rock_2: { key: 'sp_rock_2', file: 'sprites/era1/rock_2.png', origin: [0.5, 0.9], display: [44, 46] },
  plot: { key: 'sp_plot', file: 'sprites/era1/plot.png', origin: [0.5, 0.5], display: [66, 35] },
  plot_high: { key: 'sp_plot_high', file: 'sprites/era1/plot_high.png', origin: [0.5, 0.367], display: [82, 59] },
  ui_panel: { key: 'sp_ui_panel', file: 'sprites/era1/ui_panel.png', origin: [0.5, 0.5], display: [197, 44] },
  ui_button: { key: 'sp_ui_button', file: 'sprites/era1/ui_button.png', origin: [0.5, 0.5], display: [98, 50] },
  /** Start menu button: a 3D-rendered riveted wooden plaque at the menu's own proportions (no nine-slice stretching). */
  ui_menu_button: { key: 'sp_ui_menu_button', file: 'sprites/era1/ui_menu_button.png', origin: [0.5, 0.5], display: [390, 68] },
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
  // ---------- era 2: the machine wasteland ----------
  map_ground_e2: { key: 'sp_map_ground_e2', file: 'sprites/era2/map_ground.jpg', origin: [0, 0], display: [1280, 720] },
  e2_tower_gun: { key: 'sp_e2_tower_gun', file: 'sprites/era2/e2_tower_gun.png', origin: [0.5, 0.82], display: [92, 128] },
  e2_tower_gun_l2: { key: 'sp_e2_tower_gun_l2', file: 'sprites/era2/e2_tower_gun_l2.png', origin: [0.5, 0.821], display: [98, 136] },
  e2_tower_gun_l3: { key: 'sp_e2_tower_gun_l3', file: 'sprites/era2/e2_tower_gun_l3.png', origin: [0.5, 0.785], display: [104, 121] },
  e2_tower_rocket: { key: 'sp_e2_tower_rocket', file: 'sprites/era2/e2_tower_rocket.png', origin: [0.5, 0.819], display: [84, 116] },
  e2_tower_rocket_l2: { key: 'sp_e2_tower_rocket_l2', file: 'sprites/era2/e2_tower_rocket_l2.png', origin: [0.5, 0.716], display: [104, 92] },
  e2_tower_rocket_l3: { key: 'sp_e2_tower_rocket_l3', file: 'sprites/era2/e2_tower_rocket_l3.png', origin: [0.5, 0.703], display: [104, 88] },
  e2_tower_rail: { key: 'sp_e2_tower_rail', file: 'sprites/era2/e2_tower_rail.png', origin: [0.5, 0.821], display: [84, 117] },
  e2_tower_rail_l2: { key: 'sp_e2_tower_rail_l2', file: 'sprites/era2/e2_tower_rail_l2.png', origin: [0.5, 0.811], display: [86, 114] },
  e2_tower_rail_l3: { key: 'sp_e2_tower_rail_l3', file: 'sprites/era2/e2_tower_rail_l3.png', origin: [0.5, 0.812], display: [90, 120] },
  enemy_robot: { key: 'sp_enemy_robot', file: 'sprites/era2/enemy_robot.png', origin: [0.5, 0.985], display: [52, 52], gait: 'stomp' },
  enemy_droid: { key: 'sp_enemy_droid', file: 'sprites/era2/enemy_droid.png', origin: [0.5, 0.985], display: [40, 48], gait: 'roll' },
  enemy_walker: { key: 'sp_enemy_walker', file: 'sprites/era2/enemy_walker.png', origin: [0.5, 0.985], display: [77, 83],
    frames: [
      { key: 'sp_enemy_walker_walk1', file: 'sprites/era2/enemy_walker_walk1.png' },
      { key: 'sp_enemy_walker_walk2', file: 'sprites/era2/enemy_walker_walk2.png' },
    ],
    walkOrder: [1, 0, 2, 0] },
  // back views (walking up the screen) and the newer machines
  enemy_shield_back: { key: 'sp_enemy_shield_back', file: 'sprites/era2/enemy_shield_back.png', origin: [0.5, 0.985], display: [56, 56], gait: 'stomp' },
  enemy_tank: { key: 'sp_enemy_tank', file: 'sprites/era2/enemy_tank.png', origin: [0.5, 0.98], display: [124, 80], gait: 'roll' },
  enemy_shield: { key: 'sp_enemy_shield', file: 'sprites/era2/enemy_shield.png', origin: [0.5, 0.985], display: [58, 56], gait: 'stomp' },
  enemy_robot_back: { key: 'sp_enemy_robot_back', file: 'sprites/era2/enemy_robot_back.png', origin: [0.5, 0.985], display: [39, 52], facesLeft: true, gait: 'stomp' },
  enemy_droid_back: { key: 'sp_enemy_droid_back', file: 'sprites/era2/enemy_droid_back.png', origin: [0.5, 0.985], display: [38, 48], facesLeft: true, gait: 'roll' },
  enemy_walker_back: { key: 'sp_enemy_walker_back', file: 'sprites/era2/enemy_walker_back.png', origin: [0.5, 0.985], display: [66, 83], facesLeft: true, gait: 'stomp' },
  e2_factory: { key: 'sp_e2_factory', file: 'sprites/era2/e2_factory.png', origin: [0.5, 0.732], display: [170, 158] },
  e2_police: { key: 'sp_e2_police', file: 'sprites/era2/e2_police.png', origin: [0.5, 0.75], display: [150, 150] },
  e2_plot: { key: 'sp_e2_plot', file: 'sprites/era2/e2_plot.png', origin: [0.5, 0.5], display: [70, 49] },
  e2_plot_high: { key: 'sp_e2_plot_high', file: 'sprites/era2/e2_plot_high.png', origin: [0.5, 0.656], display: [84, 61] },
  e2_prop_skulls: { key: 'sp_e2_prop_skulls', file: 'sprites/era2/e2_prop_skulls.png', origin: [0.5, 0.985], display: [60, 60] },
  e2_prop_searchlight: { key: 'sp_e2_prop_searchlight', file: 'sprites/era2/e2_prop_searchlight.png', origin: [0.5, 0.985], display: [46, 93] },
  e2_prop_wreck: { key: 'sp_e2_prop_wreck', file: 'sprites/era2/e2_prop_wreck.png', origin: [0.5, 0.985], display: [66, 50] },
  e2_prop_rubble: { key: 'sp_e2_prop_rubble', file: 'sprites/era2/e2_prop_rubble.png', origin: [0.5, 0.985], display: [62, 64] },
  e2_prop_pit: { key: 'sp_e2_prop_pit', file: 'sprites/era2/e2_prop_pit.png', origin: [0.5, 0.985], display: [48, 46] },
  // ---------- Era 3: The Fallen Village (tools/era3/install_sprites.py) ----------
  map_ground_e3: { key: 'sp_map_ground_e3', file: 'sprites/era3/map_ground.jpg', origin: [0, 0], display: [1280, 720] },
  e3_tower_rifle: { key: 'sp_e3_tower_rifle', file: 'sprites/era3/e3_tower_rifle.png', origin: [0.5, 0.846], display: [73, 118] },
  e3_tower_rifle_l2: { key: 'sp_e3_tower_rifle_l2', file: 'sprites/era3/e3_tower_rifle_l2.png', origin: [0.5, 0.846], display: [74, 120] },
  e3_tower_rifle_l3: { key: 'sp_e3_tower_rifle_l3', file: 'sprites/era3/e3_tower_rifle_l3.png', origin: [0.5, 0.846], display: [74, 120] },
  e3_tower_ballista: { key: 'sp_e3_tower_ballista', file: 'sprites/era3/e3_tower_ballista.png', origin: [0.5, 0.839], display: [80, 124] },
  e3_tower_ballista_l2: { key: 'sp_e3_tower_ballista_l2', file: 'sprites/era3/e3_tower_ballista_l2.png', origin: [0.5, 0.838], display: [83, 128] },
  e3_tower_ballista_l3: { key: 'sp_e3_tower_ballista_l3', file: 'sprites/era3/e3_tower_ballista_l3.png', origin: [0.5, 0.846], display: [79, 128] },
  e3_tower_killer: { key: 'sp_e3_tower_killer', file: 'sprites/era3/e3_tower_killer.png', origin: [0.5, 0.924], display: [51, 168] },
  e3_tower_killer_l2: { key: 'sp_e3_tower_killer_l2', file: 'sprites/era3/e3_tower_killer_l2.png', origin: [0.5, 0.888], display: [79, 176] },
  e3_tower_killer_l3: { key: 'sp_e3_tower_killer_l3', file: 'sprites/era3/e3_tower_killer_l3.png', origin: [0.5, 0.918], display: [60, 182] },
  e3_hunter: { key: 'sp_e3_hunter', file: 'sprites/era3/e3_hunter.png', origin: [0.5, 0.985], display: [24, 30] },
  enemy_titan_s: { key: 'sp_enemy_titan_s', file: 'sprites/era3/enemy_titan_s.png', origin: [0.5, 0.985], display: [29, 64] },
  enemy_titan_m: { key: 'sp_enemy_titan_m', file: 'sprites/era3/enemy_titan_m.png', origin: [0.5, 0.985], display: [38, 86], facesLeft: true },
  enemy_brawler: { key: 'sp_enemy_brawler', file: 'sprites/era3/enemy_brawler.png', origin: [0.5, 0.985], display: [71, 92], facesLeft: true },
  enemy_wallwalker: { key: 'sp_enemy_wallwalker', file: 'sprites/era3/enemy_wallwalker.png', origin: [0.5, 0.985], display: [79, 138], facesLeft: true },
  enemy_colossus: { key: 'sp_enemy_colossus', file: 'sprites/era3/enemy_colossus.png', origin: [0.5, 0.985], display: [109, 126], facesLeft: true },
  enemy_titan_s_back: { key: 'sp_enemy_titan_s_back', file: 'sprites/era3/enemy_titan_s_back.png', origin: [0.5, 0.985], display: [29, 64] },
  enemy_titan_m_back: { key: 'sp_enemy_titan_m_back', file: 'sprites/era3/enemy_titan_m_back.png', origin: [0.5, 0.985], display: [35, 86] },
  enemy_brawler_back: { key: 'sp_enemy_brawler_back', file: 'sprites/era3/enemy_brawler_back.png', origin: [0.5, 0.985], display: [67, 92], facesLeft: true },
  enemy_wallwalker_back: { key: 'sp_enemy_wallwalker_back', file: 'sprites/era3/enemy_wallwalker_back.png', origin: [0.5, 0.985], display: [82, 138] },
  enemy_colossus_back: { key: 'sp_enemy_colossus_back', file: 'sprites/era3/enemy_colossus_back.png', origin: [0.5, 0.985], display: [103, 126] },
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
  gun: ['e2_tower_gun', 'e2_tower_gun_l2', 'e2_tower_gun_l3'],
  rocket: ['e2_tower_rocket', 'e2_tower_rocket_l2', 'e2_tower_rocket_l3'],
  rail: ['e2_tower_rail', 'e2_tower_rail_l2', 'e2_tower_rail_l3'],
  rifle: ['e3_tower_rifle', 'e3_tower_rifle_l2', 'e3_tower_rifle_l3'],
  ballista: ['e3_tower_ballista', 'e3_tower_ballista_l2', 'e3_tower_ballista_l3'],
  killer: ['e3_tower_killer', 'e3_tower_killer_l2', 'e3_tower_killer_l3'],
};

/**
 * Where shots leave a static gun sprite, in game pixels from its ground anchor (sprite unflipped).
 * turns: the whole sprite flips to face the target's side.
 */
export const GUN_MUZZLE: Record<string, { x: number; y: number; facesLeft: boolean; turns: boolean }> = {
  mg: { x: -47, y: -91, facesLeft: true, turns: true },
  mortar: { x: -15, y: -72, facesLeft: false, turns: false },
  gun: { x: 38, y: -50, facesLeft: false, turns: true },
  rocket: { x: -34, y: -60, facesLeft: true, turns: true },
  rail: { x: -30, y: -72, facesLeft: true, turns: true },
  rifle: { x: 30, y: -66, facesLeft: false, turns: true },
  ballista: { x: -32, y: -88, facesLeft: true, turns: true },
  killer: { x: 0, y: -140, facesLeft: false, turns: false },
};

/** Cabin chimney opening, as fractions of the cabin sprite's width and height. */
export const CABIN_CHIMNEY: [number, number] = [0.81, 0.04];

/**
 * Loads the sprites. Each era's own art (sprites/eraN/...) loads only for that era, so a level doesn't wait for
 * another era's files; era 1's shared UI art (buttons, icons, hero) always loads. Without an era, everything loads.
 */
export function preloadSprites(scene: Phaser.Scene, era?: string) {
  for (const s of Object.values(SPRITES) as SpriteMeta[]) {
    const m = /^sprites\/(era\d)\//.exec(s.file);
    if (era && m && m[1] !== 'era1' && m[1] !== era) continue;
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
