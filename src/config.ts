// All tunable game data lives here, so balancing never means digging through game logic.

export const GAME_W = 1280;
export const GAME_H = 720;

// Isometric tile size (2:1 diamond) and where grid (0,0) lands on screen.
// The grid is invisible: it only positions the road, plots and scenery.
export const TILE_W = 80;
export const TILE_H = 40;
export const ORIGIN = { x: 640, y: 96 };

// Enemy path as grid waypoints. Enemies walk straight lines between them.
// The first point is the crypt they crawl out of; the last is the cabin.
const ERA1_PATH: ReadonlyArray<[number, number]> = [
  [-2, 2], [6, 2], [6, 7], [2, 7], [2, 10], [13, 10],
];
// Era 2: the long zigzag from the robot factory (top right) to the police station (bottom); see art/era2/layout.json
const ERA2_PATH: ReadonlyArray<[number, number]> = [
  [7, -5], [7, 1], [2, 1], [2, 6], [9, 6], [9, 10], [4, 10], [4, 14], [11, 14],
];
// Era 3: from the breach in the village wall (top) to the chapel (bottom). The road forks around the market square
// and rejoins: each titan picks one of the two lanes at random (see art/era3/layout.json).
const ERA3_LANES: ReadonlyArray<ReadonlyArray<[number, number]>> = [
  [[3, -1], [3, 1], [10, 1], [10, 8], [10, 12], [14, 12]],
  [[3, -1], [3, 1], [3, 8], [10, 8], [10, 12], [14, 12]],
];
/** The active era's road (switched by setEra): its first lane, for the start and end of the road. */
export let PATH_WAYPOINTS: ReadonlyArray<[number, number]> = ERA1_PATH;
/** Every lane of the active era's road; eras without a fork have one. */
export let PATH_LANES: ReadonlyArray<ReadonlyArray<[number, number]>> = [ERA1_PATH];

// ---------- Build plots ----------
// Deliberately more plots (17) than a player can afford to fill (about 10 towers over 9 waves),
// so where you build is still a real choice. High-ground plots give a range bonus.
export interface PlotDef { x: number; y: number; high?: boolean }
export const HIGH_GROUND_RANGE = 1.25; // +25% range on raised plots
export const HIGH_GROUND_LIFT = 16;    // how far a raised plot sits above the ground, in pixels

const ERA1_PLOTS: PlotDef[] = [
  { x: 3, y: 1 }, { x: 5, y: 0 }, { x: 7, y: 1 },
  { x: 1, y: 4 }, { x: 4, y: 4, high: true }, { x: 8, y: 4, high: true },
  { x: 1, y: 6 }, { x: 3, y: 6 }, { x: 8, y: 6 },
  { x: 1, y: 8 }, { x: 8, y: 8 },
  { x: 3, y: 9 }, { x: 5, y: 9, high: true }, { x: 10, y: 9 },
  { x: 4, y: 11 }, { x: 7, y: 11 }, { x: 10, y: 11 },
];
const ERA2_PLOTS: PlotDef[] = [
  { x: 3, y: 8, high: true }, { x: 7, y: 8, high: true }, { x: 11, y: 10 }, { x: 11, y: 7 }, { x: 9, y: 4 },
  { x: 9, y: 1 }, { x: 7, y: 3 }, { x: 5, y: 16 }, { x: 6, y: -2 }, { x: 4, y: 4 }, { x: 2, y: 14 },
  { x: 2, y: 11 }, { x: 0, y: 4 }, { x: 8, y: -3 }, { x: 8, y: 16 },
];
const ERA3_PLOTS: PlotDef[] = [
  { x: 1, y: -0.2 }, { x: 5, y: -0.6, high: true }, { x: 7, y: -1 }, { x: 12, y: 0 }, { x: 12, y: 4, high: true }, { x: 12, y: 7 },
  { x: 1, y: 3 }, { x: 1, y: 7, high: true }, { x: 5, y: 3 }, { x: 8, y: 3 }, { x: 5, y: 6 }, { x: 8, y: 6 }, { x: 6.5, y: 4.5, high: true },
  { x: 5, y: 10 }, { x: 8, y: 10 }, { x: 7.6, y: 13.1 }, { x: 12, y: 14 },
];
export let PLOTS = ERA1_PLOTS;

// ---------- Towers ----------
export type TowerKind = 'arrow' | 'mg' | 'mortar' | 'gun' | 'rocket' | 'rail' | 'rifle' | 'ballista' | 'killer';
export type WeaponRank = 1 | 2 | 3 | 4;

export interface TowerDef {
  kind: TowerKind;
  name: string;
  rank: WeaponRank;        // upgrades target ranks, not tower names (see design doc)
  cost: number;
  range: number;           // in tiles
  minRange: number;        // mortar can't hit what's right next to it
  fireDelay: number;       // seconds between shots
  damage: number;
  splash: number;          // splash radius in tiles, 0 = single target
  projectile: 'arc' | 'straight';
  flightTime: number;      // seconds a projectile takes to land (0 = instant)
  color: number;
  /**
   * Shots made of many small pellets: armour is subtracted from every pellet, not once per shot,
   * so armoured enemies shrug off most of the blast. Omitted = one solid hit.
   */
  pellets?: number;
  /** Short note shown next to the name in the build menu. */
  note?: string;
  /** How an instant shot looks: shotgun pellets (default), machine-gun tracers or a railgun beam. */
  beam?: 'pellets' | 'tracer' | 'rail';
  /** Railgun: how many enemies one beam passes through (along the line of fire). */
  pierceLine?: number;
  /**
   * Era 3 boss armour: the share of this tower's damage that counts against the armour bar (rifles barely scratch it,
   * bolts and rocket lances strip it). Default 1.
   */
  armorMult?: number;
  /** Titan killer tower: its fighters do the attacking (src/killer.ts), not shots from the tower. */
  crew?: boolean;
}

const ERA1_TOWERS: Record<string, TowerDef> = {
  arrow:  { kind: 'arrow',  name: 'Arrow Tower', rank: 1, cost: 50,  range: 3.5, minRange: 0,   fireDelay: 0.8,  damage: 12, splash: 0,   projectile: 'arc',      flightTime: 0.45, color: 0x8fbf5a },
  mg:     { kind: 'mg',     name: 'Boomstick',   rank: 2, cost: 75,  range: 2.6, minRange: 0,   fireDelay: 1.5,  damage: 32, splash: 0,   projectile: 'straight', flightTime: 0,    color: 0x5aa9e6, pellets: 10, note: 'weak vs armour' },
  mortar: { kind: 'mortar', name: 'Mortar',      rank: 3, cost: 110, range: 4.6, minRange: 1.4, fireDelay: 2.2,  damage: 32, splash: 1.2, projectile: 'arc',      flightTime: 0.9,  color: 0xe08a3c },
};
const ERA2_TOWERS: Record<string, TowerDef> = {
  gun:    { kind: 'gun',    name: 'Twin MG',         rank: 1, cost: 60,  range: 3.3, minRange: 0,   fireDelay: 0.22, damage: 6,  splash: 0,   projectile: 'straight', flightTime: 0,   color: 0x8fbf5a, beam: 'tracer', note: 'fast, weak vs armour' },
  rocket: { kind: 'rocket', name: 'Rocket Launcher', rank: 3, cost: 120, range: 4.8, minRange: 1.0, fireDelay: 2.0,  damage: 40, splash: 1.1, projectile: 'arc',      flightTime: 0.7, color: 0xe08a3c },
  rail:   { kind: 'rail',   name: 'Railgun',         rank: 2, cost: 100, range: 5.5, minRange: 0,   fireDelay: 2.6,  damage: 75, splash: 0,   projectile: 'straight', flightTime: 0,   color: 0x5aa9e6, beam: 'rail', pierceLine: 4, note: 'pierces a whole line' },
};
const ERA3_TOWERS: Record<string, TowerDef> = {
  rifle:    { kind: 'rifle',    name: 'Rifle Post',         rank: 1, cost: 55,  range: 3.2, minRange: 0, fireDelay: 0.75, damage: 11, splash: 0, projectile: 'straight', flightTime: 0,    color: 0x8fbf5a, beam: 'tracer', armorMult: 0.25, note: 'cheap, weak vs armour' },
  ballista: { kind: 'ballista', name: 'Ballista',           rank: 2, cost: 95,  range: 4.6, minRange: 0, fireDelay: 2.0,  damage: 42, splash: 0, projectile: 'straight', flightTime: 0.32, color: 0x5aa9e6, armorMult: 1.6, note: 'long range' },
  killer:   { kind: 'killer',   name: 'Titan Killer Tower', rank: 3, cost: 140, range: 3.0, minRange: 0, fireDelay: 2.6,  damage: 60, splash: 0, projectile: 'straight', flightTime: 0,    color: 0xe08a3c, armorMult: 1, crew: true, note: 'fighters on grapple lines' },
};
/** The active era's towers and their order in the build menu (switched by setEra). */
export let TOWERS = ERA1_TOWERS;
export let TOWER_ORDER: TowerKind[] = ['arrow', 'mg', 'mortar'];
export const SELL_REFUND = 0.7; // share of everything spent on a tower (build + upgrades)

/** Gold upgrades per tower. Index 0 = level 1. Costs are multiples of the tower's build cost. */
export const TOWER_LEVELS = {
  max: 3,
  cost: [0, 1.0, 1.5],      // level 2 costs 100% of build cost, level 3 costs 150%
  damage: [1, 1.6, 2.3],
  fireRate: [1, 1.1, 1.2],
  range: [1, 1.1, 1.2],
};

/** Level 3 traits, one per tower kind. */
export const LEVEL3_TRAIT: Record<string, { name: string; text: string }> = {
  arrow: { name: 'Twin Archers', text: 'A second archer fires at another target' },
  mg: { name: 'Buckshot', text: 'Shots pierce up to 2 more enemies' },
  mortar: { name: 'Hellfire', text: 'Shells leave burning ground' },
  gun: { name: 'Shield Dome', text: 'A forcefield shields the turret' },
  rocket: { name: 'Homing Missiles', text: 'Rockets chase their target' },
  rail: { name: 'Dual Rail', text: 'A second beam fires at another target' },
  rifle: { name: 'Second Gunner', text: 'A second soldier fires at another target' },
  ballista: { name: 'Twin Bolts', text: 'Fires two piercing bolts at once' },
  killer: { name: 'Rocket Lance', text: 'One fighter fires a long-range rocket lance' },
};
/** Trait tuning. */
export const TRAITS = {
  pierceTargets: 2, pierceRadius: 1.0, pierceDamage: 0.6,
  fireDuration: 3, fireRadius: 0.8, fireDps: 0.35, // dps as a share of shell damage
};

// ---------- Enemies ----------
export type EnemyKind = 'grunt' | 'fast' | 'armored' | 'shaman' | 'brute' | 'robot' | 'droid' | 'walker' | 'shield' | 'tank'
  | 'titan_s' | 'titan_m' | 'brawler' | 'wallwalker' | 'colossus';

export interface EnemyDef {
  kind: EnemyKind;
  hp: number;
  speed: number;   // tiles per second
  armor: number;   // flat damage reduction per hit (punishes rapid low-damage fire)
  reward: number;  // gold on kill
  leakDamage: number;
  color: number;
  size: number;
  /** Final-wave boss: health is not scaled by wave, shown in a big bar, can't be knocked back or slowed. */
  boss?: boolean;
  /** Display name (bosses). */
  name?: string;
  /** Era 3 boss: an armour bar that soaks damage before health takes any (scaled by each tower's armorMult). */
  shell?: number;
}

const ERA1_ENEMIES: Record<string, EnemyDef> = {
  grunt:   { kind: 'grunt',   hp: 40, speed: 1.2, armor: 0, reward: 6,  leakDamage: 1, color: 0xb04a4a, size: 9 },
  fast:    { kind: 'fast',    hp: 22, speed: 2.3, armor: 0, reward: 5,  leakDamage: 1, color: 0xd9c24a, size: 7 },
  armored: { kind: 'armored', hp: 95, speed: 0.8, armor: 2, reward: 12, leakDamage: 2, color: 0x7a7f8c, size: 12 },
  shaman:  { kind: 'shaman',  hp: 55, speed: 1.0, armor: 0, reward: 10, leakDamage: 1, color: 0x6aa84f, size: 9 },
  brute:   { kind: 'brute',   hp: 3500, speed: 0.42, armor: 3, reward: 150, leakDamage: 8, color: 0x7a8f6a, size: 18, boss: true, name: 'Grave Brute' },
};
const ERA2_ENEMIES: Record<string, EnemyDef> = {
  robot:  { kind: 'robot',  hp: 70,  speed: 1.0, armor: 1, reward: 7,  leakDamage: 1, color: 0x8a8f99, size: 10 },
  droid:  { kind: 'droid',  hp: 30,  speed: 2.4, armor: 0, reward: 5,  leakDamage: 1, color: 0xd9c24a, size: 7 },
  walker: { kind: 'walker', hp: 190, speed: 0.6, armor: 3, reward: 16, leakDamage: 3, color: 0x6a6f7c, size: 14 },
  shield: { kind: 'shield', hp: 90,  speed: 0.9, armor: 1, reward: 9,  leakDamage: 1, color: 0x7a8fa9, size: 10 },
  tank:   { kind: 'tank',   hp: 5000, speed: 0.38, armor: 5, reward: 200, leakDamage: 10, color: 0x5a5f6a, size: 20, boss: true, name: 'Siege Tank' },
};
const ERA3_ENEMIES: Record<string, EnemyDef> = {
  titan_s:    { kind: 'titan_s',    hp: 60,   speed: 1.0,  armor: 0, reward: 6,  leakDamage: 1, color: 0xe8b89a, size: 11 },
  titan_m:    { kind: 'titan_m',    hp: 120,  speed: 0.85, armor: 1, reward: 10, leakDamage: 2, color: 0xe8b89a, size: 14 },
  brawler:    { kind: 'brawler',    hp: 170,  speed: 1.25, armor: 1, reward: 14, leakDamage: 2, color: 0xc0392b, size: 15 },
  wallwalker: { kind: 'wallwalker', hp: 420,  speed: 0.5,  armor: 3, reward: 26, leakDamage: 4, color: 0x7d8a7a, size: 20 },
  colossus:   { kind: 'colossus',   hp: 4200, speed: 0.4,  armor: 4, reward: 220, leakDamage: 10, color: 0xd8cfb8, size: 22, boss: true, name: 'Armored Giant', shell: 2600 },
};
export let ENEMIES = ERA1_ENEMIES;

// ---------- Waves ----------
export interface SpawnGroup { kind: EnemyKind; count: number; interval: number; delay: number }
export interface WaveDef { groups: SpawnGroup[] }

// 9 waves for milestone 1. Health scales per wave so upgrades stay necessary.
const ERA1_WAVES: WaveDef[] = [
  { groups: [{ kind: 'grunt', count: 8, interval: 1.0, delay: 0 }] },
  { groups: [{ kind: 'grunt', count: 10, interval: 0.9, delay: 0 }, { kind: 'fast', count: 4, interval: 0.7, delay: 6 }] },
  { groups: [{ kind: 'fast', count: 12, interval: 0.5, delay: 0 }, { kind: 'grunt', count: 6, interval: 1, delay: 4 }] },
  { groups: [{ kind: 'grunt', count: 12, interval: 0.8, delay: 0 }, { kind: 'armored', count: 3, interval: 2, delay: 5 }, { kind: 'shaman', count: 2, interval: 3, delay: 6 }] },
  { groups: [{ kind: 'armored', count: 6, interval: 1.6, delay: 0 }, { kind: 'fast', count: 10, interval: 0.4, delay: 3 }, { kind: 'shaman', count: 2, interval: 3, delay: 4 }] },
  { groups: [{ kind: 'grunt', count: 20, interval: 0.5, delay: 0 }, { kind: 'armored', count: 5, interval: 1.4, delay: 6 }, { kind: 'shaman', count: 3, interval: 2.5, delay: 5 }] },
  { groups: [{ kind: 'fast', count: 24, interval: 0.3, delay: 0 }, { kind: 'armored', count: 8, interval: 1.2, delay: 4 }, { kind: 'shaman', count: 3, interval: 2.5, delay: 5 }] },
  { groups: [{ kind: 'armored', count: 14, interval: 1.0, delay: 0 }, { kind: 'grunt', count: 20, interval: 0.4, delay: 2 }, { kind: 'shaman', count: 4, interval: 2, delay: 3 }] },
  // the finale: a bit bigger than wave 8, then the boss (bosses count once, they are not multiplied by WAVE_SIZE)
  { groups: [{ kind: 'grunt', count: 18, interval: 0.4, delay: 0 }, { kind: 'fast', count: 12, interval: 0.3, delay: 4 }, { kind: 'armored', count: 12, interval: 0.9, delay: 8 },
    { kind: 'shaman', count: 4, interval: 2, delay: 9 }, { kind: 'brute', count: 1, interval: 1, delay: 22 }] },
];
const ERA2_WAVES: WaveDef[] = [
  { groups: [{ kind: 'robot', count: 8, interval: 1.1, delay: 0 }] },
  { groups: [{ kind: 'robot', count: 10, interval: 0.9, delay: 0 }, { kind: 'droid', count: 5, interval: 0.6, delay: 6 }] },
  { groups: [{ kind: 'droid', count: 12, interval: 0.45, delay: 0 }, { kind: 'robot', count: 8, interval: 0.9, delay: 4 }, { kind: 'shield', count: 2, interval: 2, delay: 6 }] },
  { groups: [{ kind: 'robot', count: 12, interval: 0.8, delay: 0 }, { kind: 'walker', count: 2, interval: 3, delay: 6 }, { kind: 'shield', count: 3, interval: 1.5, delay: 3 }] },
  { groups: [{ kind: 'walker', count: 4, interval: 2.4, delay: 0 }, { kind: 'droid', count: 12, interval: 0.4, delay: 3 }, { kind: 'shield', count: 3, interval: 1.5, delay: 5 }] },
  { groups: [{ kind: 'robot', count: 20, interval: 0.5, delay: 0 }, { kind: 'walker', count: 4, interval: 2, delay: 6 }, { kind: 'shield', count: 4, interval: 1.4, delay: 4 }] },
  { groups: [{ kind: 'droid', count: 24, interval: 0.3, delay: 0 }, { kind: 'walker', count: 6, interval: 1.6, delay: 4 }, { kind: 'shield', count: 5, interval: 1.2, delay: 6 }] },
  { groups: [{ kind: 'walker', count: 10, interval: 1.3, delay: 0 }, { kind: 'robot', count: 20, interval: 0.45, delay: 2 }, { kind: 'shield', count: 6, interval: 1, delay: 5 }] },
  // the finale: a bit bigger than wave 8, then the boss
  { groups: [{ kind: 'robot', count: 18, interval: 0.4, delay: 0 }, { kind: 'droid', count: 12, interval: 0.35, delay: 4 }, { kind: 'walker', count: 8, interval: 1.2, delay: 8 },
    { kind: 'shield', count: 6, interval: 1, delay: 6 }, { kind: 'tank', count: 1, interval: 1, delay: 24 }] },
];
const ERA3_WAVES: WaveDef[] = [
  { groups: [{ kind: 'titan_s', count: 8, interval: 1.2, delay: 0 }] },
  { groups: [{ kind: 'titan_s', count: 10, interval: 1.0, delay: 0 }, { kind: 'titan_m', count: 3, interval: 2, delay: 6 }] },
  { groups: [{ kind: 'titan_m', count: 8, interval: 1.4, delay: 0 }, { kind: 'titan_s', count: 8, interval: 0.8, delay: 4 }, { kind: 'brawler', count: 1, interval: 1, delay: 10 }] },
  { groups: [{ kind: 'titan_s', count: 14, interval: 0.7, delay: 0 }, { kind: 'brawler', count: 3, interval: 3, delay: 5 }, { kind: 'titan_m', count: 4, interval: 1.6, delay: 8 }] },
  { groups: [{ kind: 'wallwalker', count: 2, interval: 6, delay: 0 }, { kind: 'titan_m', count: 10, interval: 1.0, delay: 3 }, { kind: 'brawler', count: 2, interval: 3, delay: 9 }] },
  { groups: [{ kind: 'titan_s', count: 20, interval: 0.5, delay: 0 }, { kind: 'brawler', count: 4, interval: 2.4, delay: 4 }, { kind: 'wallwalker', count: 2, interval: 5, delay: 8 }] },
  { groups: [{ kind: 'titan_m', count: 16, interval: 0.7, delay: 0 }, { kind: 'wallwalker', count: 4, interval: 4, delay: 3 }, { kind: 'brawler', count: 5, interval: 2, delay: 6 }] },
  { groups: [{ kind: 'wallwalker', count: 6, interval: 3, delay: 0 }, { kind: 'titan_s', count: 20, interval: 0.4, delay: 2 }, { kind: 'brawler', count: 6, interval: 1.6, delay: 5 }] },
  // the finale: a big push, then the Armored Giant
  { groups: [{ kind: 'titan_m', count: 14, interval: 0.6, delay: 0 }, { kind: 'brawler', count: 6, interval: 1.5, delay: 4 }, { kind: 'wallwalker', count: 5, interval: 3, delay: 8 },
    { kind: 'titan_s', count: 16, interval: 0.4, delay: 10 }, { kind: 'colossus', count: 1, interval: 1, delay: 26 }] },
];
export let WAVES = ERA1_WAVES;
/**
 * Enemy health growth: the bonus starts at HP_STEP on wave 2 and doubles every wave after that
 * (+10%, +20%, +40%, +80%...). Waves 1-9: 1, 1.1, 1.2, 1.4, 1.8, 2.6, 4.2, 7.4, 13.8x base health.
 */
export const HP_STEP = 0.10;
export function hpScaleForWave(waveIndex: number) { return waveIndex === 0 ? 1 : 1 + HP_STEP * 2 ** (waveIndex - 1); }
/** Every spawn group in WAVES is this many times bigger (same spacing, so waves also last longer). */
export const WAVE_SIZE = 1.5;
export const PUZZLE_EVERY = 3;            // upgrade draft after every 3rd wave

// ---------- Era 2: machines attack the towers ----------
/** Tower health (era 2 towers only; era 1 enemies don't attack towers). Multiplied per level by TOWER_HP_LEVEL. */
export const TOWER_HP: Record<string, number> = { gun: 140, rocket: 160, rail: 120, rifle: 120, ballista: 170, killer: 150 };
export const TOWER_HP_LEVEL = [1, 1.4, 1.8];
/** Repairing costs this share of what the tower cost in total, times the share of health it is missing. */
export const REPAIR_COST = 0.4;
/** Level 3 Twin MG: the shield dome soaks up this share of all damage. */
export const SHIELD_ABSORB = 0.6;
/**
 * How each machine attacks towers. robot: machine-gun bursts at the nearest tower in range;
 * walker: a pair of rockets; droid: explodes when destroyed, hurting every tower within blastRadius.
 */
export const ENEMY_ATTACKS = {
  robot: { range: 2.2, interval: 2.2, damage: 7 },
  walker: { range: 3.6, interval: 5.0, damage: 18, rockets: 2 },
  droid: { blastRadius: 1.5, damage: 40 },
  shield: { range: 2.2, interval: 2.6, damage: 6 },
  tank: { range: 4.2, interval: 4.5, damage: 45 },
};

// ---------- Era 3: titans and the titan killer tower ----------
/**
 * brawler: every charge.interval s, if a tower is within charge.range, it charges off the road shoulder-first into the
 * tower's base and rebounds back;
 * every rock.interval s it throws a rock at a tower within rock.range. wallwalker: now and then strays into a tower
 * within stray.range for stray.share of the tower's maximum health. colossus: charges each tower within charge.range
 * once, for charge.share of its maximum health.
 */
export const TITAN_ATTACKS = {
  brawler: { charge: { interval: 9, range: 2.6, damage: 40 }, rock: { interval: 7, range: 3.6, damage: 22 } },
  wallwalker: { stray: { chance: 0.5, interval: 5, range: 2.2, share: 0.3 } },
  colossus: { charge: { range: 2.2, share: 0.5 } },
};
/** Titan killer tower fighters. */
export const KILLER = {
  /** Seconds out along the grapple lines, slashing, and back. */
  swingOut: 0.45, strike: 0.5, swingBack: 0.5,
  /** Regular titans swat at a fighter at their neck: the chance it lands, by titan (smaller titans miss more). */
  swat: { titan_s: 0.2, titan_m: 0.38 } as Record<string, number>,
  /** Seconds a swatted fighter is stunned after being flung back to the tower. */
  stun: 2,
  /** Level 3 rocket lance. */
  lance: { range: 6.4, cooldown: 5, damage: 150, splash: 0.9, armorMult: 2.5 },
};

// ---------- Enemy behaviours ----------
/** Zombie shaman: every `interval` seconds heals nearby undead by `share` of their maximum health. */
export const SHAMAN_HEAL = { radius: 1.6, interval: 2.5, share: 0.12 };
/** Riot-shield robot: shots from in front of it lose this share of their damage (rockets and shells from above don't). */
export const SHIELD_BLOCK = 0.75;
/** Bombard shells and rockets push enemies back this far (tiles); shotgun pellets slow them for a moment. */
export const KNOCKBACK = 0.3;
export const PELLET_SLOW = { seconds: 0.5, factor: 0.7 };

// ---------- Economy & base ----------
export let START_GOLD = 160;
/**
 * Kill gold grows by this share per wave (wave 1 = base, wave 9 = +40%). Era 2 only, where repairs eat into
 * the budget; era 1 stays as tuned.
 */
export let KILL_GOLD_PER_WAVE = 0;

// ---------- Eras ----------
export type EraId = 'era1' | 'era2' | 'era3';
export let ERA_ID: EraId = 'era1';
/** Switches all era data (road, plots, towers, enemies, waves, start gold) before a map starts. */
export function setEra(id: EraId) {
  ERA_ID = id;
  if (id === 'era3') {
    PATH_LANES = ERA3_LANES; PATH_WAYPOINTS = ERA3_LANES[0];
    PLOTS = ERA3_PLOTS; TOWERS = ERA3_TOWERS; TOWER_ORDER = ['rifle', 'ballista', 'killer'];
    ENEMIES = ERA3_ENEMIES; WAVES = ERA3_WAVES; START_GOLD = 240; KILL_GOLD_PER_WAVE = 0.05;
    return;
  }
  const e2 = id === 'era2';
  PATH_WAYPOINTS = e2 ? ERA2_PATH : ERA1_PATH;
  PATH_LANES = [PATH_WAYPOINTS];
  PLOTS = e2 ? ERA2_PLOTS : ERA1_PLOTS;
  TOWERS = e2 ? ERA2_TOWERS : ERA1_TOWERS;
  TOWER_ORDER = e2 ? ['gun', 'rocket', 'rail'] : ['arrow', 'mg', 'mortar'];
  ENEMIES = e2 ? ERA2_ENEMIES : ERA1_ENEMIES;
  WAVES = e2 ? ERA2_WAVES : ERA1_WAVES;
  START_GOLD = e2 ? 220 : 160;
  KILL_GOLD_PER_WAVE = e2 ? 0.05 : 0;
}
export const START_LIVES = 20;
export const waveClearBonus = (waveNumber: number) => 20 + waveNumber * 6;
