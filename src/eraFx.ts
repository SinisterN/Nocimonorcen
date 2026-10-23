// The current era's own look for tower shots and tower units (Era Studio eras; see TowerFx and TowerUnit in
// src/eras/index.ts). Everything here is optional: the built-in eras have none and keep their own drawing.
import { ERA_ID } from './config';
import { TowerFx, TowerUnit, dataEra } from './eras';

export const towerFx = (kind: string | undefined): TowerFx | undefined => kind ? dataEra(ERA_ID)?.fx?.[kind] : undefined;
export const towerUnit = (kind: string): TowerUnit | undefined => dataEra(ERA_ID)?.units?.[kind];

/** '#rrggbb' to a Phaser colour number, or undefined. */
export function colour(hex: string | undefined): number | undefined {
  if (!hex || !/^#?[0-9a-f]{6}$/i.test(hex)) return undefined;
  return parseInt(hex.replace('#', ''), 16);
}

export const clamp = (v: number | undefined, lo: number, hi: number, dflt: number) =>
  Math.max(lo, Math.min(hi, typeof v === 'number' && isFinite(v) ? v : dflt));
