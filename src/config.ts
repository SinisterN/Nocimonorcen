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
/** The active era's road (switched by setEra). */
export let PATH_WAYPOINTS = ERA1_PATH;

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
  { x: 9, y: 1 }, { x: 7, y: 3 }, { x: 5, y: 16 }, { x: 5, y: -1 }, { x: 4, y: 4, high: true }, { x: 2, y: 14 },
  { x: 2, y: 11 }, { x: 0, y: 6 }, { x: 9, y: -2 }, { x: 8, y: 16 },
];
export let PLOTS = ERA1_PLOTS;

// ---------- Towers ----------
export type TowerKind = 'arrow' | 'mg' | 'mortar' | 'gun' | 'rocket' | 'rail';
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
};
/** Trait tuning. */
export const TRAITS = {
  pierceTargets: 2, pierceRadius: 1.0, pierceDamage: 0.6,
  fireDuration: 3, fireRadius: 0.8, fireDps: 0.35, // dps as a share of shell damage
};

// ---------- Enemies ----------
export type EnemyKind = 'grunt' | 'fast' | 'armored' | 'robot' | 'droid' | 'walker';

export interface EnemyDef {
  kind: EnemyKind;
  hp: number;
  speed: number;   // tiles per second
  armor: number;   // flat damage reduction per hit (punishes rapid low-damage fire)
  reward: number;  // gold on kill
  leakDamage: number;
  color: number;
  size: number;
}

const ERA1_ENEMIES: Record<string, EnemyDef> = {
  grunt:   { kind: 'grunt',   hp: 40, speed: 1.2, armor: 0, reward: 6,  leakDamage: 1, color: 0xb04a4a, size: 9 },
  fast:    { kind: 'fast',    hp: 22, speed: 2.3, armor: 0, reward: 5,  leakDamage: 1, color: 0xd9c24a, size: 7 },
  armored: { kind: 'armored', hp: 95, speed: 0.8, armor: 2, reward: 12, leakDamage: 2, color: 0x7a7f8c, size: 12 },
};
const ERA2_ENEMIES: Record<string, EnemyDef> = {
  robot:  { kind: 'robot',  hp: 70,  speed: 1.0, armor: 1, reward: 7,  leakDamage: 1, color: 0x8a8f99, size: 10 },
  droid:  { kind: 'droid',  hp: 30,  speed: 2.4, armor: 0, reward: 5,  leakDamage: 1, color: 0xd9c24a, size: 7 },
  walker: { kind: 'walker', hp: 190, speed: 0.6, armor: 3, reward: 16, leakDamage: 3, color: 0x6a6f7c, size: 14 },
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
  { groups: [{ kind: 'grunt', count: 12, interval: 0.8, delay: 0 }, { kind: 'armored', count: 3, interval: 2, delay: 5 }] },
  { groups: [{ kind: 'armored', count: 6, interval: 1.6, delay: 0 }, { kind: 'fast', count: 10, interval: 0.4, delay: 3 }] },
  { groups: [{ kind: 'grunt', count: 20, interval: 0.5, delay: 0 }, { kind: 'armored', count: 5, interval: 1.4, delay: 6 }] },
  { groups: [{ kind: 'fast', count: 24, interval: 0.3, delay: 0 }, { kind: 'armored', count: 8, interval: 1.2, delay: 4 }] },
  { groups: [{ kind: 'armored', count: 14, interval: 1.0, delay: 0 }, { kind: 'grunt', count: 20, interval: 0.4, delay: 2 }] },
  { groups: [{ kind: 'grunt', count: 25, interval: 0.35, delay: 0 }, { kind: 'fast', count: 20, interval: 0.3, delay: 4 }, { kind: 'armored', count: 16, interval: 0.8, delay: 8 }] },
];
const ERA2_WAVES: WaveDef[] = [
  { groups: [{ kind: 'robot', count: 8, interval: 1.1, delay: 0 }] },
  { groups: [{ kind: 'robot', count: 10, interval: 0.9, delay: 0 }, { kind: 'droid', count: 5, interval: 0.6, delay: 6 }] },
  { groups: [{ kind: 'droid', count: 12, interval: 0.45, delay: 0 }, { kind: 'robot', count: 8, interval: 0.9, delay: 4 }] },
  { groups: [{ kind: 'robot', count: 12, interval: 0.8, delay: 0 }, { kind: 'walker', count: 2, interval: 3, delay: 6 }] },
  { groups: [{ kind: 'walker', count: 4, interval: 2.4, delay: 0 }, { kind: 'droid', count: 12, interval: 0.4, delay: 3 }] },
  { groups: [{ kind: 'robot', count: 20, interval: 0.5, delay: 0 }, { kind: 'walker', count: 4, interval: 2, delay: 6 }] },
  { groups: [{ kind: 'droid', count: 24, interval: 0.3, delay: 0 }, { kind: 'walker', count: 6, interval: 1.6, delay: 4 }] },
  { groups: [{ kind: 'walker', count: 10, interval: 1.3, delay: 0 }, { kind: 'robot', count: 20, interval: 0.45, delay: 2 }] },
  { groups: [{ kind: 'robot', count: 25, interval: 0.35, delay: 0 }, { kind: 'droid', count: 20, interval: 0.3, delay: 4 }, { kind: 'walker', count: 12, interval: 1.0, delay: 8 }] },
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

// ---------- Economy & base ----------
export let START_GOLD = 160;

// ---------- Eras ----------
export type EraId = 'era1' | 'era2';
export let ERA_ID: EraId = 'era1';
/** Switches all era data (road, plots, towers, enemies, waves, start gold) before a map starts. */
export function setEra(id: EraId) {
  ERA_ID = id;
  const e2 = id === 'era2';
  PATH_WAYPOINTS = e2 ? ERA2_PATH : ERA1_PATH;
  PLOTS = e2 ? ERA2_PLOTS : ERA1_PLOTS;
  TOWERS = e2 ? ERA2_TOWERS : ERA1_TOWERS;
  TOWER_ORDER = e2 ? ['gun', 'rocket', 'rail'] : ['arrow', 'mg', 'mortar'];
  ENEMIES = e2 ? ERA2_ENEMIES : ERA1_ENEMIES;
  WAVES = e2 ? ERA2_WAVES : ERA1_WAVES;
  START_GOLD = e2 ? 220 : 160;
}
export const START_LIVES = 20;
export const waveClearBonus = (waveNumber: number) => 20 + waveNumber * 6;
