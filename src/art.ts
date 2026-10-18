// Code-drawn cartoon art in a chunky, outlined, hand-painted spirit.
// Every function draws around a local origin (0, 0) = the object's feet on the ground,
// so the same drawing can later be swapped for an AI-generated sprite with the same anchor.
import Phaser from 'phaser';
import { EnemyKind, TowerKind } from './config';

type G = Phaser.GameObjects.Graphics;
type Pt = { x: number; y: number };

export const OUTLINE = 0x2b1d12;
export const PAL = {
  grass: 0x6fa046, grassLight: 0x82b653, grassDark: 0x5c8a3a,
  road: 0xd9b77a, roadEdge: 0x9a7448, roadLight: 0xe8cd98,
  dirt: 0xa57f50, dirtLight: 0xbf9662,
  stone: 0xa49d90, stoneLight: 0xc4beb2, stoneDark: 0x77706a,
  wood: 0xa36d3b, woodDark: 0x7a4e27, roof: 0xbf4a37, roofDark: 0x8f3426,
  leaf: 0x3f7f35, leafLight: 0x58a046, leafDark: 0x2f6128,
  iron: 0x484c55, gold: 0xf2c94c,
};

// Phaser's types want Vector2 objects, but plain {x, y} points work fine at runtime.
const V = (pts: Pt[]) => pts as unknown as Phaser.Math.Vector2[];

export function shade(color: number, f: number): number {
  const c = (sh: number) => Math.max(0, Math.min(255, Math.round(((color >> sh) & 0xff) * f)));
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

// Small seeded random generator, so scenery is the same every time the map loads.
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- primitives ----------
function ellipse(g: G, x: number, y: number, rx: number, ry: number, fill: number, lw = 3) {
  g.fillStyle(fill).fillEllipse(x, y, rx * 2, ry * 2);
  if (lw) g.lineStyle(lw, OUTLINE).strokeEllipse(x, y, rx * 2, ry * 2);
}

/** An upright cylinder (towers, mounds): bottom at y, top at y - h. */
export function cylinder(g: G, x: number, y: number, rx: number, ry: number, h: number, side: number, top: number, lw = 3) {
  g.fillStyle(side).fillEllipse(x, y, rx * 2, ry * 2);
  g.lineStyle(lw, OUTLINE).strokeEllipse(x, y, rx * 2, ry * 2);
  g.fillStyle(side).fillRect(x - rx, y - h, rx * 2, h);
  // darker left half gives a light-from-the-right painted feel
  g.fillStyle(shade(side, 0.82)).fillRect(x - rx, y - h, rx * 0.8, h);
  g.fillStyle(shade(side, 0.82)).fillEllipse(x - rx * 0.6, y, rx * 0.8, ry * 1.6);
  g.lineStyle(lw, OUTLINE).lineBetween(x - rx, y - h, x - rx, y).lineBetween(x + rx, y - h, x + rx, y);
  ellipse(g, x, y - h, rx, ry, top, lw);
}

function stoneRing(g: G, x: number, y: number, rx: number, ry: number, count: number, r: () => number) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + 0.2;
    const sx = x + Math.cos(a) * rx, sy = y + Math.sin(a) * ry;
    const w = 6 + r() * 3;
    ellipse(g, sx, sy, w, w * 0.6, i % 3 ? PAL.stone : PAL.stoneLight, 2);
  }
}

// ---------- ground details ----------
export function grassTuft(g: G, x: number, y: number, r: () => number) {
  g.lineStyle(2, PAL.grassDark);
  for (let i = -1; i <= 1; i++) g.lineBetween(x + i * 3, y, x + i * 4 + (r() - 0.5) * 3, y - 6 - r() * 4);
}

export function flower(g: G, x: number, y: number, color: number) {
  g.fillStyle(color).fillCircle(x - 2, y, 2).fillCircle(x + 2, y, 2).fillCircle(x, y - 2, 2).fillCircle(x, y + 2, 2);
  g.fillStyle(0xfff3b0).fillCircle(x, y, 1.5);
}

export function pebble(g: G, x: number, y: number, s: number) {
  g.fillStyle(PAL.roadEdge, 0.6).fillEllipse(x, y, s * 2, s * 1.2);
}

// ---------- scenery ----------
export function tree(g: G, s: number, r: () => number) {
  g.fillStyle(0x000000, 0.22).fillEllipse(4 * s, 2, 44 * s, 18 * s);
  g.fillStyle(PAL.woodDark).fillRect(-4 * s, -22 * s, 8 * s, 22 * s);
  g.lineStyle(3, OUTLINE).strokeRect(-4 * s, -22 * s, 8 * s, 22 * s);
  const blobs: [number, number, number][] = [[-10, -30, 13], [10, -32, 13], [0, -44, 15], [-4, -28, 12], [6, -26, 11]];
  for (const [bx, by, br] of blobs) g.lineStyle(6, OUTLINE).strokeCircle(bx * s, by * s, br * s);
  for (const [bx, by, br] of blobs) g.fillStyle(PAL.leaf).fillCircle(bx * s, by * s, br * s);
  g.fillStyle(PAL.leafLight).fillCircle(4 * s, -46 * s, 8 * s).fillCircle(13 * s, -34 * s, 6 * s);
  g.fillStyle(PAL.leafDark).fillCircle(-12 * s, -26 * s, 6 * s);
  if (r() < 0.3) g.fillStyle(0xd9473b).fillCircle(-6 * s, -36 * s, 2.5 * s).fillCircle(8 * s, -40 * s, 2.5 * s);
}

export function pine(g: G, s: number) {
  g.fillStyle(0x000000, 0.22).fillEllipse(4 * s, 2, 34 * s, 14 * s);
  g.fillStyle(PAL.woodDark).fillRect(-3 * s, -10 * s, 6 * s, 10 * s);
  for (let i = 0; i < 3; i++) {
    const y = -8 * s - i * 14 * s, w = (20 - i * 5) * s;
    g.fillStyle(i === 2 ? PAL.leafLight : PAL.leafDark).fillTriangle(-w, y, w, y, 0, y - 24 * s);
    g.lineStyle(3, OUTLINE).strokeTriangle(-w, y, w, y, 0, y - 24 * s);
  }
}

export function rock(g: G, s: number) {
  g.fillStyle(0x000000, 0.2).fillEllipse(3, 2, 30 * s, 10 * s);
  g.fillStyle(PAL.stone).fillPoints(V([{ x: -13 * s, y: 0 }, { x: -10 * s, y: -10 * s }, { x: 0, y: -15 * s }, { x: 11 * s, y: -9 * s }, { x: 13 * s, y: 0 }]), true);
  g.fillStyle(PAL.stoneLight).fillPoints(V([{ x: -6 * s, y: -11 * s }, { x: 0, y: -15 * s }, { x: 8 * s, y: -10 * s }, { x: 0, y: -7 * s }]), true);
  g.lineStyle(3, OUTLINE).strokePoints(V([{ x: -13 * s, y: 0 }, { x: -10 * s, y: -10 * s }, { x: 0, y: -15 * s }, { x: 11 * s, y: -9 * s }, { x: 13 * s, y: 0 }]), true);
}

export function bush(g: G, s: number) {
  g.fillStyle(0x000000, 0.2).fillEllipse(2, 2, 32 * s, 10 * s);
  const b: [number, number, number][] = [[-8, -7, 8], [6, -8, 9], [-1, -13, 8]];
  for (const [x, y, r] of b) g.lineStyle(5, OUTLINE).strokeCircle(x * s, y * s, r * s);
  for (const [x, y, r] of b) g.fillStyle(PAL.leafLight).fillCircle(x * s, y * s, r * s);
  g.fillStyle(PAL.grassLight).fillCircle(2 * s, -14 * s, 3.5 * s);
}

/** The crypt the dead crawl out of. */
export function crypt(g: G) {
  g.fillStyle(0x000000, 0.25).fillEllipse(0, 4, 120, 40);
  // back wall slab
  g.fillStyle(PAL.stoneDark).fillRoundedRect(-44, -70, 88, 70, { tl: 40, tr: 40, bl: 0, br: 0 });
  g.lineStyle(3, OUTLINE).strokeRoundedRect(-44, -70, 88, 70, { tl: 40, tr: 40, bl: 0, br: 0 });
  g.fillStyle(PAL.stone).fillRoundedRect(-36, -62, 72, 62, { tl: 34, tr: 34, bl: 0, br: 0 });
  // dark doorway
  g.fillStyle(0x1a1320).fillRoundedRect(-20, -46, 40, 46, { tl: 20, tr: 20, bl: 0, br: 0 });
  g.lineStyle(3, OUTLINE).strokeRoundedRect(-20, -46, 40, 46, { tl: 20, tr: 20, bl: 0, br: 0 });
  // glowing eyes in the dark
  g.fillStyle(0xff5a3c).fillCircle(-7, -22, 2.5).fillCircle(3, -24, 2.5);
  // skull keystone
  g.fillStyle(0xeee6d2).fillCircle(0, -58, 7);
  g.lineStyle(2, OUTLINE).strokeCircle(0, -58, 7);
  g.fillStyle(OUTLINE).fillCircle(-2.5, -59, 1.8).fillCircle(2.5, -59, 1.8);
  // gravestones
  for (const [x, h] of [[-62, 26], [58, 22]] as const) {
    g.fillStyle(PAL.stoneLight).fillRoundedRect(x - 9, -h, 18, h, { tl: 9, tr: 9, bl: 0, br: 0 });
    g.lineStyle(3, OUTLINE).strokeRoundedRect(x - 9, -h, 18, h, { tl: 9, tr: 9, bl: 0, br: 0 });
    g.lineStyle(2, PAL.stoneDark).lineBetween(x, -h + 7, x, -h + 15).lineBetween(x - 4, -h + 10, x + 4, -h + 10);
  }
}

/** The cabin the player defends. */
export function cabin(g: G) {
  g.fillStyle(0x000000, 0.25).fillEllipse(6, 6, 150, 46);
  const L: Pt[] = [{ x: -56, y: -8 }, { x: 0, y: 20 }, { x: 0, y: -26 }, { x: -56, y: -54 }];
  const R: Pt[] = [{ x: 0, y: 20 }, { x: 48, y: -4 }, { x: 48, y: -50 }, { x: 0, y: -26 }];
  g.fillStyle(PAL.woodDark).fillPoints(V(L), true);
  g.fillStyle(PAL.wood).fillPoints(V(R), true);
  // log lines
  g.lineStyle(2, shade(PAL.woodDark, 0.7));
  for (let i = 1; i < 5; i++) {
    g.lineBetween(-56, -8 - i * 9.2, 0, 20 - i * 9.2);
    g.lineBetween(0, 20 - i * 9.2, 48, -4 - i * 9.2);
  }
  g.lineStyle(3, OUTLINE).strokePoints(V(L), true).strokePoints(V(R), true);
  // door and glowing window
  g.fillStyle(0x3a2414).fillPoints(V([{ x: -36, y: -4 }, { x: -22, y: 3 }, { x: -22, y: -25 }, { x: -36, y: -32 }]), true);
  g.lineStyle(2, OUTLINE).strokePoints(V([{ x: -36, y: -4 }, { x: -22, y: 3 }, { x: -22, y: -25 }, { x: -36, y: -32 }]), true);
  g.fillStyle(0xffd76a).fillPoints(V([{ x: 14, y: -16 }, { x: 32, y: -25 }, { x: 32, y: -40 }, { x: 14, y: -31 }]), true);
  g.lineStyle(2, OUTLINE).strokePoints(V([{ x: 14, y: -16 }, { x: 32, y: -25 }, { x: 32, y: -40 }, { x: 14, y: -31 }]), true);
  // roof
  const roofL: Pt[] = [{ x: -64, y: -50 }, { x: 0, y: -20 }, { x: 4, y: -70 }, { x: -58, y: -100 }];
  const roofR: Pt[] = [{ x: 0, y: -20 }, { x: 56, y: -46 }, { x: 58, y: -90 }, { x: 4, y: -70 }];
  g.fillStyle(PAL.roofDark).fillPoints(V(roofL), true);
  g.fillStyle(PAL.roof).fillPoints(V(roofR), true);
  g.lineStyle(3, OUTLINE).strokePoints(V(roofL), true).strokePoints(V(roofR), true);
  // chimney
  g.fillStyle(PAL.stone).fillRect(26, -104, 14, 30);
  g.lineStyle(3, OUTLINE).strokeRect(26, -104, 14, 30);
}

// ---------- plots ----------
/** A build plot: a stone-ringed dirt pad, raised on a rocky mound when it is high ground. */
export function plot(g: G, lift: number, high: boolean, hover: boolean, seed: number) {
  const r = rng(seed);
  if (high) {
    g.fillStyle(0x000000, 0.22).fillEllipse(4, 4, 84, 36);
    cylinder(g, 0, 0, 38, 19, lift, 0x8a7358, PAL.grass);
    // rocky bumps on the mound's face
    for (const [x, y] of [[-26, -4], [-6, 2], [18, -2]] as const) ellipse(g, x, y - lift * 0.35, 7, 4, PAL.stoneDark, 2);
  }
  const y = -lift;
  ellipse(g, 0, y, 27, 13.5, PAL.dirt, 3);
  ellipse(g, 0, y - 1, 20, 9.5, PAL.dirtLight, 0);
  stoneRing(g, 0, y, 27, 13.5, 10, r);
  if (hover) g.lineStyle(3, 0xfff3b0, 0.95).strokeEllipse(0, y, 66, 34);
}

// ---------- towers ----------
/** Returns the height (above the tower's base) that its shots come from. */
export function towerMuzzleHeight(kind: TowerKind) {
  return kind === 'arrow' ? 46 : kind === 'mg' ? 30 : 22;
}

export function tower(g: G, kind: TowerKind, aim: number, recoil = 0) {
  const ax = Math.cos(aim), ay = Math.sin(aim) * 0.5;
  if (kind === 'arrow') {
    cylinder(g, 0, 0, 19, 9.5, 16, PAL.stone, PAL.stoneLight);
    cylinder(g, 0, -16, 15, 7.5, 18, PAL.wood, PAL.woodDark);
    g.fillStyle(0x24170d).fillRect(3, -29, 5, 9);
    // roof
    g.fillStyle(PAL.roofDark).fillTriangle(-20, -33, 0, -33, 0, -66);
    g.fillStyle(PAL.roof).fillTriangle(0, -33, 20, -33, 0, -66);
    g.lineStyle(3, OUTLINE).strokeTriangle(-20, -33, 20, -33, 0, -66);
    g.lineStyle(2, OUTLINE).lineBetween(0, -66, 0, -78);
    g.fillStyle(PAL.gold).fillTriangle(0, -78, 11, -74, 0, -70);
    g.lineStyle(2, OUTLINE).strokeTriangle(0, -78, 11, -74, 0, -70);
    // little archer bow peeking out toward the target
    g.lineStyle(3, OUTLINE).lineBetween(ax * 12, -40 + ay * 6, ax * 20, -40 + ay * 10);
    g.lineStyle(2, PAL.woodDark).lineBetween(ax * 12, -40 + ay * 6, ax * 20, -40 + ay * 10);
  } else if (kind === 'mg') {
    cylinder(g, 0, 0, 21, 10.5, 18, PAL.stoneDark, PAL.stone);
    // sandbag ring
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i / 6) * Math.PI;
      ellipse(g, Math.cos(a) * 16, -18 + Math.sin(a) * 8, 6, 3.5, 0xc9b07a, 2);
    }
    // double barrel
    const bx = ax * (22 - recoil), by = ay * (22 - recoil);
    g.lineStyle(8, OUTLINE).lineBetween(0, -26, bx, -26 + by);
    g.lineStyle(5, PAL.iron).lineBetween(0, -26, bx, -26 + by);
    g.lineStyle(2, 0x8a909c).lineBetween(0, -27.5, bx, -27.5 + by);
    ellipse(g, 0, -26, 8, 5, PAL.iron, 2);
  } else {
    cylinder(g, 0, 0, 23, 11.5, 12, PAL.stone, PAL.stoneLight);
    ellipse(g, 0, -12, 15, 7, 0x2a2420, 2);
    const bx = ax * 9, by = ay * 9 - 12 + recoil * 0.6;
    g.lineStyle(15, OUTLINE).lineBetween(0, -14, bx, -14 + by);
    g.lineStyle(11, PAL.iron).lineBetween(0, -14, bx, -14 + by);
    ellipse(g, bx, -14 + by, 6.5, 4, 0x18181b, 2);
    g.lineStyle(3, PAL.gold).lineBetween(-5, -15, 5, -15);
  }
}

// ---------- enemies ----------
interface EnemyLook { skin: number; cloth: number; leg: number; scale: number; eye: number }
const LOOKS: Record<EnemyKind, EnemyLook> = {
  grunt:   { skin: 0x9db57f, cloth: 0x6b4a32, leg: 0x4e3a2a, scale: 1.2, eye: 0xffffff },
  fast:    { skin: 0xd6cd9c, cloth: 0x7d2c2c, leg: 0x5a2424, scale: 1, eye: 0xff5a3c },
  armored: { skin: 0x8fa37a, cloth: 0x9097a3, leg: 0x5d626b, scale: 1.5, eye: 0xff5a3c },
};

/** A shambling deadite. `phase` drives the walk, `facing` is 1 (right) or -1 (left). */
export function enemy(g: G, kind: EnemyKind, phase: number, facing: number, flash: boolean) {
  const L = LOOKS[kind], k = L.scale, f = facing;
  const skin = flash ? 0xffffff : L.skin, cloth = flash ? 0xffffff : L.cloth, leg = flash ? 0xffffff : L.leg;
  const step = Math.sin(phase) * 3 * k;
  const bob = Math.abs(Math.cos(phase)) * 2 * k;

  g.fillStyle(0x000000, 0.28).fillEllipse(0, 0, 22 * k, 9 * k);
  // legs
  ellipse(g, -3.5 * k + step, -3 * k, 3 * k, 4 * k, leg, 2);
  ellipse(g, 3.5 * k - step, -3 * k, 3 * k, 4 * k, leg, 2);
  // body
  const by = -13 * k - bob;
  g.fillStyle(cloth).fillRoundedRect(-7 * k, by - 7 * k, 14 * k, 14 * k, 4 * k);
  g.lineStyle(2.5, OUTLINE).strokeRoundedRect(-7 * k, by - 7 * k, 14 * k, 14 * k, 4 * k);
  if (kind === 'grunt') g.lineStyle(2, shade(L.cloth, 0.7)).lineBetween(-4 * k, by + 1 * k, 3 * k, by + 5 * k);
  if (kind === 'armored') g.lineStyle(2, 0xc9ced8).lineBetween(-5 * k, by - 3 * k, 5 * k, by - 3 * k);
  // zombie arm reaching forward
  const ay = by - 3 * k + step * 0.25;
  g.lineStyle(5 * k, OUTLINE).lineBetween(f * 3 * k, by - 3 * k, f * 13 * k, ay);
  g.lineStyle(3 * k, skin).lineBetween(f * 3 * k, by - 3 * k, f * 13 * k, ay);
  // head
  const hx = f * 1.5 * k, hy = by - 12 * k;
  ellipse(g, hx, hy, 6.5 * k, 6.5 * k, skin, 2.5);
  if (kind === 'armored') {
    g.fillStyle(flash ? 0xffffff : 0x7d838e).fillRoundedRect(hx - 7 * k, hy - 8 * k, 14 * k, 9 * k, { tl: 7 * k, tr: 7 * k, bl: 1, br: 1 });
    g.lineStyle(2.5, OUTLINE).strokeRoundedRect(hx - 7 * k, hy - 8 * k, 14 * k, 9 * k, { tl: 7 * k, tr: 7 * k, bl: 1, br: 1 });
    g.fillStyle(L.eye).fillRect(hx - 4 * k + f * 1.5 * k, hy - 1.5 * k, 8 * k, 1.8 * k);
  } else {
    g.fillStyle(L.eye).fillCircle(hx + f * 2.8 * k, hy - 1.2 * k, 1.8 * k).fillCircle(hx - f * 0.8 * k, hy - 1.2 * k, 1.8 * k);
    if (kind === 'grunt') g.fillStyle(0x111111).fillCircle(hx + f * 3.2 * k, hy - 1 * k, 0.9 * k).fillCircle(hx - f * 0.4 * k, hy - 1 * k, 0.9 * k);
    g.fillStyle(0x3a1414).fillEllipse(hx + f * 1.5 * k, hy + 3 * k, 4 * k, 2.2 * k);
  }
}

// ---------- HUD icons ----------
export function heartIcon(g: G, x: number, y: number) {
  g.fillStyle(0xd9473b).fillCircle(x - 4, y - 2, 5).fillCircle(x + 4, y - 2, 5).fillTriangle(x - 9, y, x + 9, y, x, y + 9);
  g.fillStyle(0xff8a7a).fillCircle(x - 5, y - 4, 1.8);
}

export function coinIcon(g: G, x: number, y: number, r = 8) {
  ellipse(g, x, y, r, r, PAL.gold, 2);
  g.lineStyle(2, shade(PAL.gold, 0.7)).strokeCircle(x, y, r * 0.55);
}

export function skullIcon(g: G, x: number, y: number) {
  ellipse(g, x, y - 1, 8, 7.5, 0xeee6d2, 2);
  g.fillStyle(0xeee6d2).fillRect(x - 4, y + 4, 8, 4);
  g.fillStyle(OUTLINE).fillCircle(x - 3, y - 1, 2).fillCircle(x + 3, y - 1, 2);
}

export function bookIcon(g: G, x: number, y: number, used: boolean) {
  g.fillStyle(used ? 0x4a3f36 : 0x6b2a2a).fillRoundedRect(x - 7, y - 9, 14, 18, 2);
  g.lineStyle(2, OUTLINE).strokeRoundedRect(x - 7, y - 9, 14, 18, 2);
  if (!used) g.fillStyle(0xe8cd98).fillCircle(x, y - 1, 3);
}
