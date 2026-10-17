// Converting between grid coordinates (gx, gy) and isometric screen pixels.
// Tile (i, j) has its centre at toScreen(i, j).
import { ORIGIN, TILE_W, TILE_H } from './config';

export function toScreen(gx: number, gy: number): { x: number; y: number } {
  return {
    x: ORIGIN.x + (gx - gy) * (TILE_W / 2),
    y: ORIGIN.y + (gx + gy) * (TILE_H / 2),
  };
}

export function toGrid(sx: number, sy: number): { gx: number; gy: number } {
  const a = (sx - ORIGIN.x) / (TILE_W / 2);
  const b = (sy - ORIGIN.y) / (TILE_H / 2);
  return { gx: (a + b) / 2, gy: (b - a) / 2 };
}

// A circle of radius r (in tiles) becomes an axis-aligned ellipse on screen.
export function rangeEllipse(r: number): { w: number; h: number } {
  return { w: r * Math.SQRT2 * TILE_W, h: r * Math.SQRT2 * TILE_H };
}

// Draw-order helper: things further "down" the screen render on top.
export const depthOf = (gx: number, gy: number) => (gx + gy) * 10 + 100;
