// All tunable game data lives here, so balancing never means digging through game logic.

export const GAME_W = 1280;
export const GAME_H = 720;

// Isometric tile size (2:1 diamond) and where grid (0,0) lands on screen.
export const TILE_W = 80;
export const TILE_H = 40;
export const MAP_SIZE = 12;
export const ORIGIN = { x: 640, y: 100 };

// Enemy path as grid waypoints. Enemies walk straight lines between them.
export const PATH_WAYPOINTS: ReadonlyArray<[number, number]> = [
  [0, 2], [6, 2], [6, 7], [2, 7], [2, 10], [11, 10],
];

// ---------- Towers ----------
export type TowerKind = 'arrow' | 'mg' | 'mortar';
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
}

export const TOWERS: Record<TowerKind, TowerDef> = {
  arrow:  { kind: 'arrow',  name: 'Arrow Tower', rank: 1, cost: 50,  range: 3.5, minRange: 0,   fireDelay: 0.8,  damage: 12, splash: 0,   projectile: 'arc',      flightTime: 0.45, color: 0x8fbf5a },
  mg:     { kind: 'mg',     name: 'Boomstick',   rank: 2, cost: 75,  range: 2.6, minRange: 0,   fireDelay: 0.14, damage: 3,  splash: 0,   projectile: 'straight', flightTime: 0,    color: 0x5aa9e6 },
  mortar: { kind: 'mortar', name: 'Mortar',      rank: 3, cost: 110, range: 4.6, minRange: 1.4, fireDelay: 2.2,  damage: 32, splash: 1.2, projectile: 'arc',      flightTime: 0.9,  color: 0xe08a3c },
};
export const TOWER_ORDER: TowerKind[] = ['arrow', 'mg', 'mortar'];
export const SELL_REFUND = 0.7;

// ---------- Enemies ----------
export type EnemyKind = 'grunt' | 'fast' | 'armored';

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

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  grunt:   { kind: 'grunt',   hp: 40, speed: 1.2, armor: 0, reward: 6,  leakDamage: 1, color: 0xb04a4a, size: 9 },
  fast:    { kind: 'fast',    hp: 22, speed: 2.3, armor: 0, reward: 5,  leakDamage: 1, color: 0xd9c24a, size: 7 },
  armored: { kind: 'armored', hp: 95, speed: 0.8, armor: 2, reward: 12, leakDamage: 2, color: 0x7a7f8c, size: 12 },
};

// ---------- Waves ----------
export interface SpawnGroup { kind: EnemyKind; count: number; interval: number; delay: number }
export interface WaveDef { groups: SpawnGroup[] }

// 9 waves for milestone 1. Health scales per wave so upgrades stay necessary.
export const WAVES: WaveDef[] = [
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
export const HP_SCALE_PER_WAVE = 0.18;   // +18% enemy health per wave
export const PUZZLE_EVERY = 3;            // upgrade draft after every 3rd wave

// ---------- Economy & base ----------
export const START_GOLD = 160;
export const START_LIVES = 20;
export const waveClearBonus = (waveNumber: number) => 20 + waveNumber * 6;
