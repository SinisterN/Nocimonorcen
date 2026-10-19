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

/** Global art switches. The guide-image renderer turns shadows off so AI generation doesn't turn them into pedestals. */
export const artOptions = { shadows: true, milkyEyes: false };

function shadow(g: G, alpha: number, x: number, y: number, w: number, h: number) {
  if (artOptions.shadows) g.fillStyle(0x000000, alpha).fillEllipse(x, y, w, h);
}

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
  shadow(g, 0.22, 4 * s, 2, 44 * s, 18 * s);
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
  shadow(g, 0.22, 4 * s, 2, 34 * s, 14 * s);
  g.fillStyle(PAL.woodDark).fillRect(-3 * s, -10 * s, 6 * s, 10 * s);
  for (let i = 0; i < 3; i++) {
    const y = -8 * s - i * 14 * s, w = (20 - i * 5) * s;
    g.fillStyle(i === 2 ? PAL.leafLight : PAL.leafDark).fillTriangle(-w, y, w, y, 0, y - 24 * s);
    g.lineStyle(3, OUTLINE).strokeTriangle(-w, y, w, y, 0, y - 24 * s);
  }
}

export function rock(g: G, s: number) {
  shadow(g, 0.2, 3, 2, 30 * s, 10 * s);
  g.fillStyle(PAL.stone).fillPoints(V([{ x: -13 * s, y: 0 }, { x: -10 * s, y: -10 * s }, { x: 0, y: -15 * s }, { x: 11 * s, y: -9 * s }, { x: 13 * s, y: 0 }]), true);
  g.fillStyle(PAL.stoneLight).fillPoints(V([{ x: -6 * s, y: -11 * s }, { x: 0, y: -15 * s }, { x: 8 * s, y: -10 * s }, { x: 0, y: -7 * s }]), true);
  g.lineStyle(3, OUTLINE).strokePoints(V([{ x: -13 * s, y: 0 }, { x: -10 * s, y: -10 * s }, { x: 0, y: -15 * s }, { x: 11 * s, y: -9 * s }, { x: 13 * s, y: 0 }]), true);
}

export function bush(g: G, s: number) {
  shadow(g, 0.2, 2, 2, 32 * s, 10 * s);
  const b: [number, number, number][] = [[-8, -7, 8], [6, -8, 9], [-1, -13, 8]];
  for (const [x, y, r] of b) g.lineStyle(5, OUTLINE).strokeCircle(x * s, y * s, r * s);
  for (const [x, y, r] of b) g.fillStyle(PAL.leafLight).fillCircle(x * s, y * s, r * s);
  g.fillStyle(PAL.grassLight).fillCircle(2 * s, -14 * s, 3.5 * s);
}

/** The crypt the dead crawl out of. */
export function crypt(g: G) {
  shadow(g, 0.25, 0, 4, 120, 40);
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
  shadow(g, 0.25, 6, 6, 150, 46);
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
  // gable end above the front (left) wall
  const gable: Pt[] = [{ x: -56, y: -54 }, { x: 0, y: -26 }, { x: -28, y: -76 }];
  g.fillStyle(shade(PAL.woodDark, 1.1)).fillPoints(V(gable), true);
  g.lineStyle(2, shade(PAL.woodDark, 0.7)).lineBetween(-46, -49, -10, -31).lineBetween(-38, -58, -18, -48);
  g.lineStyle(3, OUTLINE).strokePoints(V(gable), true);
  g.fillStyle(0xffd76a).fillCircle(-28, -54, 4);
  g.lineStyle(2, OUTLINE).strokeCircle(-28, -54, 4);
  // roof plane facing the viewer: ridge from the gable apex, eaves overhanging the long wall
  const roof: Pt[] = [{ x: -31, y: -79 }, { x: 22, y: -106 }, { x: 56, y: -50 }, { x: 4, y: -22 }];
  g.fillStyle(PAL.roof).fillPoints(V(roof), true);
  g.lineStyle(2, PAL.roofDark);
  for (let i = 1; i < 4; i++) {
    const t = i / 4;
    g.lineBetween(-31 + 35 * t, -79 + 57 * t, 22 + 34 * t, -106 + 56 * t);
  }
  // roof thickness along the eave and the gable edge
  g.fillStyle(PAL.roofDark).fillPoints(V([{ x: 4, y: -22 }, { x: 56, y: -50 }, { x: 56, y: -45 }, { x: 4, y: -17 }]), true);
  g.fillStyle(PAL.roofDark).fillPoints(V([{ x: -61, y: -50 }, { x: -31, y: -79 }, { x: -31, y: -74 }, { x: -58, y: -47 }]), true);
  g.lineStyle(3, OUTLINE).strokePoints(V(roof), true)
    .strokePoints(V([{ x: 4, y: -22 }, { x: 56, y: -50 }, { x: 56, y: -45 }, { x: 4, y: -17 }]), true)
    .strokePoints(V([{ x: -61, y: -50 }, { x: -31, y: -79 }, { x: -31, y: -74 }, { x: -58, y: -47 }]), true);
  // stone chimney built against the far end of the long wall, from the ground up past the roof
  const H = 104;
  const front: Pt[] = [{ x: 35, y: 7.5 }, { x: 50, y: 0 }, { x: 50, y: -H }, { x: 35, y: 7.5 - H }];
  const side: Pt[] = [{ x: 30, y: 5 }, { x: 35, y: 7.5 }, { x: 35, y: 7.5 - H }, { x: 30, y: 5 - H }];
  const cap: Pt[] = [{ x: 28, y: 5 - H }, { x: 35, y: 8.5 - H }, { x: 52, y: -H }, { x: 45, y: -3.5 - H }];
  g.fillStyle(PAL.stoneDark).fillPoints(V(side), true);
  g.fillStyle(PAL.stone).fillPoints(V(front), true);
  g.lineStyle(1.5, PAL.stoneDark);
  for (let i = 1; i < 10; i++) {
    const yy = i * 10.4;
    g.lineBetween(35, 7.5 - yy, 50, -yy);
    const t = i % 2 ? 0.35 : 0.7;
    g.lineBetween(35 + 15 * t, 7.5 - 7.5 * t - yy, 35 + 15 * t, 7.5 - 7.5 * t - yy + 10.4);
  }
  g.lineStyle(3, OUTLINE).strokePoints(V(side), true).strokePoints(V(front), true);
  g.fillStyle(PAL.stoneLight).fillPoints(V(cap), true);
  g.lineStyle(3, OUTLINE).strokePoints(V(cap), true);
  g.fillStyle(0x1a1410).fillEllipse(40, 2 - H, 8, 4);
}

// ---------- plots ----------
/** A build plot: a stone-ringed dirt pad, raised on a rocky mound when it is high ground. */
export function plot(g: G, lift: number, high: boolean, hover: boolean, seed: number) {
  const r = rng(seed);
  if (high) {
    shadow(g, 0.22, 4, 4, 84, 36);
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
  return kind === 'arrow' ? 54 : kind === 'mg' ? 30 : 22;
}

export function tower(g: G, kind: TowerKind, aim: number, recoil = 0, opts: { archer?: boolean } = {}) {
  const ax = Math.cos(aim), ay = Math.sin(aim) * 0.5;
  if (kind === 'arrow') {
    cylinder(g, 0, 0, 19, 9.5, 16, PAL.stone, PAL.stoneLight);
    cylinder(g, 0, -16, 15, 7.5, 20, PAL.wood, PAL.woodDark);
    g.fillStyle(0x24170d).fillRect(3, -31, 4, 9);
    // open lookout platform, wider than the body
    cylinder(g, 0, -36, 20, 10, 5, PAL.woodDark, PAL.wood);
    const merlon = (a: number) => {
      const mx = Math.cos(a) * 17, my = -41 + Math.sin(a) * 8.5;
      g.fillStyle(PAL.wood).fillRect(mx - 3, my - 7, 6, 7);
      g.lineStyle(2, OUTLINE).strokeRect(mx - 3, my - 7, 6, 7);
    };
    const angles = [0, 1, 2, 3, 4, 5, 6, 7].map(i => (i / 8) * Math.PI * 2 + 0.2);
    angles.filter(a => Math.sin(a) < 0).forEach(merlon); // back half, behind the archer
    // flag on a pole at the back
    g.lineStyle(2, OUTLINE).lineBetween(-12, -46, -12, -76);
    g.fillStyle(PAL.gold).fillTriangle(-12, -76, -1, -72, -12, -68);
    g.lineStyle(2, OUTLINE).strokeTriangle(-12, -76, -1, -72, -12, -68);
    if (opts.archer !== false) archer(g, aim, 0, -42);
    angles.filter(a => Math.sin(a) >= 0).forEach(merlon); // front half, in front of the archer
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


/**
 * The archer that stands on the arrow tower's platform, drawn separately so it can turn and animate.
 * (x, y) is where its feet stand; draw is 0 (relaxed) to 1 (string fully drawn).
 */
export function archer(g: G, aim: number, draw = 0, y0 = 0, x0 = 0) {
  const ax = Math.cos(aim), ay = Math.sin(aim) * 0.5, f = ax >= 0 ? 1 : -1;
  const X = (x: number) => x0 + x, Y = (y: number) => y0 + y;
  // quiver on the back, with fletchings
  g.lineStyle(6, OUTLINE).lineBetween(X(-f * 5), Y(-18), X(-f * 8), Y(-6));
  g.lineStyle(4, PAL.woodDark).lineBetween(X(-f * 5), Y(-18), X(-f * 8), Y(-6));
  for (const dx of [-1, 1.5]) {
    g.fillStyle(0xf3e9dc).fillTriangle(X(-f * 5 + dx - 1.5), Y(-18), X(-f * 5 + dx + 1.5), Y(-18), X(-f * 5 + dx), Y(-23));
    g.lineStyle(1, OUTLINE).strokeTriangle(X(-f * 5 + dx - 1.5), Y(-18), X(-f * 5 + dx + 1.5), Y(-18), X(-f * 5 + dx), Y(-23));
  }
  // legs and boots
  g.fillStyle(0x5a3a22).fillRect(X(-4), Y(-6), 3, 6).fillRect(X(1), Y(-6), 3, 6);
  g.lineStyle(1.5, OUTLINE).strokeRect(X(-4), Y(-6), 3, 6).strokeRect(X(1), Y(-6), 3, 6);
  // tunic, belt and short cape
  g.fillStyle(0x2f5a2c).fillRoundedRect(X(-6.5), Y(-18), 13, 8, 3);
  g.fillStyle(0x4f8a45).fillRoundedRect(X(-5), Y(-17), 10, 12, 3);
  g.lineStyle(2, OUTLINE).strokeRoundedRect(X(-5), Y(-17), 10, 12, 3);
  g.lineStyle(2, 0x6b4423).lineBetween(X(-5), Y(-9), X(5), Y(-9));
  g.fillStyle(PAL.gold).fillRect(X(-1), Y(-10), 2, 2);
  // head: face, eyes and a hood pushed back
  ellipse(g, X(f * 0.5), Y(-22), 4.5, 4.5, 0xe2b48c, 2);
  g.fillStyle(0x2f5a2c).fillRoundedRect(X(-5 + f * 0.5 - f * 1.5), Y(-27.5), 10, 5, { tl: 5, tr: 5, bl: 1, br: 1 });
  g.lineStyle(1.5, OUTLINE).strokeRoundedRect(X(-5 + f * 0.5 - f * 1.5), Y(-27.5), 10, 5, { tl: 5, tr: 5, bl: 1, br: 1 });
  g.fillStyle(OUTLINE).fillCircle(X(f * 2.2), Y(-22), 0.9).fillCircle(X(f * 0.1), Y(-22), 0.9);
  // bow held out toward the target, string pulled back by `draw`
  const gx = X(ax * 10), gy = Y(-15 + ay * 4);
  const r = 8, a0 = Math.atan2(ay, ax);
  g.lineStyle(4, OUTLINE).beginPath().arc(gx - ax * 4, gy, r, a0 - 1.2, a0 + 1.2).strokePath();
  g.lineStyle(2.5, 0x8a5a2b).beginPath().arc(gx - ax * 4, gy, r, a0 - 1.2, a0 + 1.2).strokePath();
  const tip1 = { x: gx - ax * 4 + Math.cos(a0 - 1.2) * r, y: gy + Math.sin(a0 - 1.2) * r };
  const tip2 = { x: gx - ax * 4 + Math.cos(a0 + 1.2) * r, y: gy + Math.sin(a0 + 1.2) * r };
  const hand = { x: X(ax * (4 - draw * 5)), y: Y(-16 + ay * 2) };
  g.lineStyle(1, 0xf3e9dc).lineBetween(tip1.x, tip1.y, hand.x, hand.y).lineBetween(tip2.x, tip2.y, hand.x, hand.y);
  // arms: front arm to the grip, back arm to the string
  g.lineStyle(4, OUTLINE).lineBetween(X(f * 2), Y(-15), gx, gy).lineBetween(X(-f * 2), Y(-15), hand.x, hand.y);
  g.lineStyle(2.5, 0x4f8a45).lineBetween(X(f * 2), Y(-15), gx, gy).lineBetween(X(-f * 2), Y(-15), hand.x, hand.y);
  g.fillStyle(0xe2b48c).fillCircle(gx, gy, 1.6).fillCircle(hand.x, hand.y, 1.6);
  // arrow on the string
  if (draw > 0.1) {
    g.lineStyle(1.5, OUTLINE).lineBetween(hand.x, hand.y, gx + ax * 4, gy + ay * 2);
  }
}


export type ArcherPose = 'idle' | 'nock' | 'draw' | 'release' | 'back_draw' | 'back_idle';

/**
 * Archer pose guides for AI animation frames. Same proportions as archer(), facing right.
 * Feet at (0, 0); about 30 px tall at scale 1.
 */
export function archerPose(g: G, pose: ArcherPose) {
  const back = pose.startsWith('back');
  const skin = 0xe2b48c, tunic = 0x4f8a45, hood = 0x2f5a2c, wood = 0x8a5a2b;
  const line = (w: number, c: number, x1: number, y1: number, x2: number, y2: number) => {
    g.lineStyle(w + 2, OUTLINE).lineBetween(x1, y1, x2, y2);
    g.lineStyle(w, c).lineBetween(x1, y1, x2, y2);
  };
  const bowArc = (cx: number, cy: number, r: number, a0: number, a1: number) => {
    g.lineStyle(4, OUTLINE).beginPath().arc(cx, cy, r, a0, a1).strokePath();
    g.lineStyle(2.5, wood).beginPath().arc(cx, cy, r, a0, a1).strokePath();
  };
  // quiver: on the left shoulder from the front, centred on the back from behind
  const qx = back ? 0 : -5;
  line(4, PAL.woodDark, qx, -19, qx - 3, -7);
  for (const dx of [-1.5, 1, 3]) {
    g.fillStyle(0xf3e9dc).fillTriangle(qx + dx - 1.5, -19, qx + dx + 1.5, -19, qx + dx, -24);
    g.lineStyle(1, OUTLINE).strokeTriangle(qx + dx - 1.5, -19, qx + dx + 1.5, -19, qx + dx, -24);
  }
  // legs
  g.fillStyle(0x5a3a22).fillRect(-4, -6, 3, 6).fillRect(1, -6, 3, 6);
  g.lineStyle(1.5, OUTLINE).strokeRect(-4, -6, 3, 6).strokeRect(1, -6, 3, 6);
  // body
  g.fillStyle(tunic).fillRoundedRect(-5, -17, 10, 12, 3);
  g.lineStyle(2, OUTLINE).strokeRoundedRect(-5, -17, 10, 12, 3);
  g.lineStyle(2, 0x6b4423).lineBetween(-5, -9, 5, -9);
  if (back) {
    // back view: quiver strap across the back, hood up covering the head, no face
    g.lineStyle(1.5, PAL.woodDark).lineBetween(-4, -16, 4, -9);
    ellipse(g, 0, -22, 4.8, 4.8, hood, 2);
    g.fillStyle(shade(hood, 0.8)).fillTriangle(-3, -18, 3, -18, 0, -14);
  } else {
    ellipse(g, 0.5, -22, 4.5, 4.5, skin, 2);
    g.fillStyle(hood).fillRoundedRect(-5, -27.5, 10, 5, { tl: 5, tr: 5, bl: 1, br: 1 });
    g.lineStyle(1.5, OUTLINE).strokeRoundedRect(-5, -27.5, 10, 5, { tl: 5, tr: 5, bl: 1, br: 1 });
    g.fillStyle(OUTLINE).fillCircle(2.2, -22, 0.9).fillCircle(0.1, -22, 0.9);
  }
  const hand = (x: number, y: number) => g.fillStyle(skin).fillCircle(x, y, 1.6);
  switch (pose) {
    case 'idle':
    case 'back_idle': {
      // bow held upright at the side, string slack, other arm hanging
      line(2.5, tunic, 3, -15, 7, -9);
      line(2.5, tunic, -3, -15, -5, -9);
      bowArc(3, -9, 9, -1.1, 1.1);
      g.lineStyle(1, 0xf3e9dc).lineBetween(3 + Math.cos(-1.1) * 9, -9 + Math.sin(-1.1) * 9, 3 + Math.cos(1.1) * 9, -9 + Math.sin(1.1) * 9);
      hand(7, -9); hand(-5, -9);
      break;
    }
    case 'nock': {
      // bow half raised in front, other hand reaching back over the shoulder to the quiver
      line(2.5, tunic, 2, -15, 8, -13);
      bowArc(4, -13, 8, -1.2, 1.2);
      g.lineStyle(1, 0xf3e9dc).lineBetween(4 + Math.cos(-1.2) * 8, -13 + Math.sin(-1.2) * 8, 4 + Math.cos(1.2) * 8, -13 + Math.sin(1.2) * 8);
      line(2.5, tunic, -2, -15, -4, -22);
      hand(8, -13); hand(-4, -22);
      break;
    }
    case 'draw':
    case 'back_draw':
    case 'release': {
      const drawn = pose !== 'release';
      line(2.5, tunic, 2, -15, 10, -15);
      bowArc(6, -15, 8, -1.2, 1.2);
      const t1 = { x: 6 + Math.cos(-1.2) * 8, y: -15 + Math.sin(-1.2) * 8 };
      const t2 = { x: 6 + Math.cos(1.2) * 8, y: -15 + Math.sin(1.2) * 8 };
      const hx = drawn ? -1 : -4, hy = drawn ? -16 : -20;
      if (drawn) {
        g.lineStyle(1, 0xf3e9dc).lineBetween(t1.x, t1.y, hx, hy).lineBetween(t2.x, t2.y, hx, hy);
        g.lineStyle(1.5, OUTLINE).lineBetween(hx, hy, 13, -15);
      } else {
        g.lineStyle(1, 0xf3e9dc).lineBetween(t1.x, t1.y, t2.x, t2.y);
      }
      line(2.5, tunic, -2, -15, hx, hy);
      hand(10, -15); hand(hx, hy);
      break;
    }
  }
}


/**
 * Guide for the arched crawler (fast enemy): side view facing left, back arched like a bridge,
 * four long spindly limbs, head hanging low under the front of the arch. Feet at (0, 0).
 */
export function crawlerGuide(g: G) {
  const skin = 0xb8bcc0, dark = 0x8a8f96;
  const limb = (pts: Pt[], c: number) => {
    g.lineStyle(7, OUTLINE).strokePoints(V(pts), false);
    g.lineStyle(4.5, c).strokePoints(V(pts), false);
  };
  // far limbs (behind the body)
  limb([{ x: -14, y: -26 }, { x: -20, y: -12 }, { x: -24, y: 0 }], dark);
  limb([{ x: 16, y: -24 }, { x: 22, y: -12 }, { x: 18, y: 0 }], dark);
  // arched torso: an emaciated body bent up like a bridge, ribs and spine bumps showing
  const spine: Pt[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16, a = Math.PI * (1 - t);
    spine.push({ x: Math.cos(a) * 20, y: -24 - Math.sin(a) * 14 });
  }
  g.lineStyle(17, OUTLINE).strokePoints(V(spine), false);
  g.lineStyle(13, skin).strokePoints(V(spine), false);
  // ribs on the underside of the arch, spine knobs on top
  for (let i = 3; i <= 13; i += 2) {
    const t = i / 16, a = Math.PI * (1 - t);
    const x = Math.cos(a) * 20, y = -24 - Math.sin(a) * 14;
    g.lineStyle(1.5, dark).lineBetween(x, y, x + Math.cos(a) * -2, y + 5);
    ellipse(g, x + Math.cos(a) * 2, y - 6.5, 1.8, 1.8, skin, 1.5);
  }
  // torn loincloth rag hanging under the middle
  g.fillStyle(0x5a4636).fillTriangle(-4, -32, 6, -32, 2, -24);
  g.lineStyle(1.5, OUTLINE).strokeTriangle(-4, -32, 6, -32, 2, -24);
  // near limbs (in front)
  limb([{ x: -18, y: -26 }, { x: -26, y: -12 }, { x: -30, y: 0 }], skin);
  limb([{ x: 19, y: -24 }, { x: 28, y: -10 }, { x: 25, y: 0 }], skin);
  for (const [x] of [[-30], [-24], [18], [25]]) ellipse(g, x, 0, 3.5, 1.6, skin, 1.5);
  // neck and head hanging under the front of the arch
  g.lineStyle(7, OUTLINE).lineBetween(-17, -27, -10, -17);
  g.lineStyle(4.5, skin).lineBetween(-17, -27, -10, -17);
  ellipse(g, -10, -13, 6, 5.5, skin, 2.5);
  g.fillStyle(0xf3f1ea).fillCircle(-13, -14, 1.7).fillCircle(-8.5, -14, 1.7);
  g.fillStyle(0x3a1414).fillEllipse(-10.5, -9.5, 6, 3);
  g.fillStyle(0xf3f1ea).fillTriangle(-13, -10.5, -12, -8.5, -11, -10.5).fillTriangle(-10, -10.5, -9, -8.5, -8, -10.5);
}

// ---------- enemies ----------
interface EnemyLook { skin: number; cloth: number; leg: number; scale: number; eye: number }
const LOOKS: Record<EnemyKind, EnemyLook> = {
  grunt:   { skin: 0x9db57f, cloth: 0x6b4a32, leg: 0x4e3a2a, scale: 1.2, eye: 0xffffff },
  fast:    { skin: 0xd6cd9c, cloth: 0x7d2c2c, leg: 0x5a2424, scale: 1, eye: 0xff5a3c },
  armored: { skin: 0x8fa37a, cloth: 0x9097a3, leg: 0x5d626b, scale: 1.5, eye: 0xff5a3c },
  // era 2 machines only use the code drawing if their sprites fail to load
  robot:   { skin: 0x8a8f99, cloth: 0x4a4f59, leg: 0x3a3f49, scale: 1.3, eye: 0xff3030 },
  droid:   { skin: 0xc9b23a, cloth: 0x4a4f59, leg: 0x3a3f49, scale: 0.9, eye: 0xff3030 },
  walker:  { skin: 0x6a6f7c, cloth: 0x4a4f59, leg: 0x3a3f49, scale: 1.7, eye: 0xff3030 },
  shaman:  { skin: 0x9db57f, cloth: 0x2f3a2a, leg: 0x2a2a22, scale: 1.2, eye: 0x9dff7a },
  brute:   { skin: 0x8fa37a, cloth: 0x5a4030, leg: 0x3e2e22, scale: 2.4, eye: 0xff5a3c },
  shield:  { skin: 0x7a8fa9, cloth: 0x4a4f59, leg: 0x3a3f49, scale: 1.3, eye: 0x6ad0ff },
  tank:    { skin: 0x5a5f6a, cloth: 0x3a3f49, leg: 0x2a2f39, scale: 2.6, eye: 0xff3030 },
};

/** A shambling deadite. `phase` drives the walk, `facing` is 1 (right) or -1 (left). */
export function enemy(g: G, kind: EnemyKind, phase: number, facing: number, flash: boolean) {
  const L = LOOKS[kind], k = L.scale, f = facing;
  const skin = flash ? 0xffffff : L.skin, cloth = flash ? 0xffffff : L.cloth, leg = flash ? 0xffffff : L.leg;
  const step = Math.sin(phase) * 3 * k;
  const bob = Math.abs(Math.cos(phase)) * 2 * k;

  shadow(g, 0.28, 0, 0, 22 * k, 9 * k);
  // legs
  ellipse(g, -3.5 * k + step, -3 * k, 3 * k, 4 * k, leg, 2);
  ellipse(g, 3.5 * k - step, -3 * k, 3 * k, 4 * k, leg, 2);
  // body
  const by = -13 * k - bob;
  // far arm, behind the body: both arms reach forward like a proper zombie
  const fay = by - 6 * k - step * 0.25;
  g.lineStyle(5 * k, OUTLINE).lineBetween(f * 1 * k, by - 5 * k, f * 12 * k, fay);
  g.lineStyle(3 * k, flash ? 0xffffff : shade(L.skin, 0.78)).lineBetween(f * 1 * k, by - 5 * k, f * 12 * k, fay);
  g.fillStyle(cloth).fillRoundedRect(-7 * k, by - 7 * k, 14 * k, 14 * k, 4 * k);
  g.lineStyle(2.5, OUTLINE).strokeRoundedRect(-7 * k, by - 7 * k, 14 * k, 14 * k, 4 * k);
  if (kind === 'grunt') g.lineStyle(2, shade(L.cloth, 0.7)).lineBetween(-4 * k, by + 1 * k, 3 * k, by + 5 * k);
  if (kind === 'armored') g.lineStyle(2, 0xc9ced8).lineBetween(-5 * k, by - 3 * k, 5 * k, by - 3 * k);
  // near arm, in front of the body
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
    if (kind === 'grunt' && !artOptions.milkyEyes) g.fillStyle(0x111111).fillCircle(hx + f * 3.2 * k, hy - 1 * k, 0.9 * k).fillCircle(hx - f * 0.4 * k, hy - 1 * k, 0.9 * k);
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

/** Two stacked chevrons pointing up: the tower upgrade button. */
export function upgradeIcon(g: G) {
  for (const [dy, c] of [[4, 0xfff3b0], [-5, 0xffffff]] as const) {
    const pts = V([{ x: -10, y: dy + 5 }, { x: 0, y: dy - 5 }, { x: 10, y: dy + 5 }]);
    g.lineStyle(8, OUTLINE).strokePoints(pts);
    g.lineStyle(4, c).strokePoints(pts);
  }
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
