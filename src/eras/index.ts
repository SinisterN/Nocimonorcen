// Data eras: an era defined entirely by one JSON file in this folder (src/eras/<id>.json), made by the Era Studio
// pipeline (tools/era). Its towers and enemies copy built-in behaviours (`behaves`), with their own names, art and
// sounds. Eras 1-3 are built into config.ts / era.ts; a data era plugs into the same places at startup:
// config.ts setEra (gameplay), era.ts (look), sprites.ts and audio.ts (files), hero.ts (lines).
import type { EnemyDef, PlotDef, TowerDef, WaveDef } from '../config';
import type { EraLook } from '../era';
import type { SoundDef } from '../audio';
import type { SpriteMeta } from '../sprites';
import type { FxRecipe } from '../fxRecipe';

export interface DataEra {
  id: string;            // 'era4', 'era5', ...: also the folder of its files (public/sprites/<id>, public/sounds/<id>)
  name: string;          // shown in menus, e.g. 'The Frozen Pass'
  /** Shown in the live game's menu. Off until the owner pushes the era live; preview builds always list it. */
  live?: boolean;
  /** Road: one or more lanes of [x, y] waypoints (all lanes share the first and last point). */
  lanes: [number, number][][];
  plots: PlotDef[];
  towers: Record<string, TowerDef>;
  towerOrder: string[];
  enemies: Record<string, EnemyDef>;
  waves: WaveDef[];
  startGold: number;
  killGoldPerWave?: number;
  /** Enemy health growth step (see hpScaleForWave). Default 0.10. */
  hpStep?: number;
  look: EraLook;
  sprites: Record<string, SpriteMeta>;
  towerSprites: Record<string, string[]>;
  gunMuzzle: Record<string, { x: number; y: number; facesLeft: boolean; turns: boolean }>;
  sfx: Record<string, SoundDef>;
  music: Record<string, { available: boolean; volume: number; src?: string }>;
  /** Hero lines per event (the same events as hero.ts) and the ones that have recordings. */
  heroLines?: Record<string, string[]>;
  voice?: string[];
  /** Level 3 trait names for its towers, when they differ from the copied behaviour's. */
  traits?: Record<string, { name: string; text: string }>;
  /** Per tower kind: the era's own look for its shots (see src/eraFx.ts). */
  fx?: Record<string, TowerFx>;
  /** Per tower kind: the unit standing on the tower, for towers that play like the arrow tower. */
  units?: Record<string, TowerUnit>;
  /** Animation sheets for the era's units, merged into the tower animations (src/towerAnim.ts). */
  towerAnims?: Record<string, unknown>;
  /** Per tower kind: what each level does and looks like, levels 1-3 (src/levels.ts). Built-in eras have none. */
  levels?: Record<string, import('../levels').LevelSpec[]>;
}

/**
 * How a tower's shots look in this era. Every field is optional; what's missing falls back to the copied
 * behaviour's own drawing.
 */
export interface TowerFx {
  /** Sprite (from `sprites`) drawn for each shot in flight. */
  projectile?: string;
  /** Length of the shot's longest side on screen, in game pixels (clamped 8-48). */
  size?: number;
  /** true: the shot spins as it flies; false: it points along its flight. */
  spin?: boolean;
  /** Trail and glow colours ('#rrggbb'). */
  trail?: string;
  glow?: string;
  /** Colour of the beam or tracer, for towers whose shots hit instantly. */
  beam?: string;
  /** Sprite shown where a shot hits, and its size in game pixels (clamped 16-120). */
  impact?: string;
  impactSize?: number;
  /** Splash hits: the hit picture's size as a share of the blast area's width (0.3-1.5; default 1). */
  impactScale?: number;
  /** Sound when it hits (an Era Studio tower's own impact sound). */
  hitSound?: string;
  /**
   * Layered effects drawn in code (src/fxRecipe.ts). hitFx: what a hit looks like (replaces the hit picture as the
   * whole effect; splash hits are sized from the blast area). shotFx: what the shot leaves behind in flight, or a
   * stream's jet. burnFx: the burning ground it leaves. Without them the look above is used as before.
   */
  hitFx?: FxRecipe;
  shotFx?: FxRecipe;
  burnFx?: FxRecipe;
}

/** The unit standing on a tower (a wizard instead of the archer). */
export interface TowerUnit {
  /** Sprite (from `sprites`) of the unit standing still. */
  sprite: string;
  /** Key of its animation sheet in `towerAnims` (idle loop + 'shoot' one-shot), when it has one. */
  anim?: string;
  /** Where its feet stand on each tower level's art, as fractions of that art's width and height. */
  feet: [number, number][];
}

const FILES = import.meta.glob('./*.json', { eager: true, import: 'default' }) as Record<string, DataEra>;
export const DATA_ERAS: DataEra[] = Object.values(FILES).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
export const dataEra = (id: string): DataEra | undefined => DATA_ERAS.find(e => e.id === id);
