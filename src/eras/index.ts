// Data eras: an era defined entirely by one JSON file in this folder (src/eras/<id>.json), made by the Era Studio
// pipeline (tools/era). Its towers and enemies copy built-in behaviours (`behaves`), with their own names, art and
// sounds. Eras 1-3 are built into config.ts / era.ts; a data era plugs into the same places at startup:
// config.ts setEra (gameplay), era.ts (look), sprites.ts and audio.ts (files), hero.ts (lines).
import type { EnemyDef, PlotDef, TowerDef, WaveDef } from '../config';
import type { EraLook } from '../era';
import type { SoundDef } from '../audio';
import type { SpriteMeta } from '../sprites';

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
}

const FILES = import.meta.glob('./*.json', { eager: true, import: 'default' }) as Record<string, DataEra>;
export const DATA_ERAS: DataEra[] = Object.values(FILES).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
export const dataEra = (id: string): DataEra | undefined => DATA_ERAS.find(e => e.id === id);
