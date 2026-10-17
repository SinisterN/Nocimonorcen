// Enemies, towers and projectiles. Each owns its Phaser graphics; GameScene runs the logic.
import Phaser from 'phaser';
import { EnemyDef, TowerDef, TILE_H, TILE_W } from './config';
import { depthOf, toScreen } from './iso';

// Phaser's types want Vector2 objects, but plain {x, y} points work fine at runtime.
export const P = (pts: { x: number; y: number }[]) => pts as unknown as Phaser.Math.Vector2[];

export function shade(color: number, factor: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

// ---------- Path helper ----------
export class Path {
  readonly points: { gx: number; gy: number }[];
  readonly cumulative: number[] = [0];
  readonly length: number;

  constructor(waypoints: ReadonlyArray<[number, number]>) {
    this.points = waypoints.map(([gx, gy]) => ({ gx, gy }));
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1], b = this.points[i];
      this.cumulative.push(this.cumulative[i - 1] + Math.hypot(b.gx - a.gx, b.gy - a.gy));
    }
    this.length = this.cumulative[this.cumulative.length - 1];
  }

  // Position after walking `dist` tiles from the start.
  at(dist: number): { gx: number; gy: number } {
    const d = Phaser.Math.Clamp(dist, 0, this.length);
    let i = 1;
    while (i < this.cumulative.length - 1 && this.cumulative[i] < d) i++;
    const a = this.points[i - 1], b = this.points[i];
    const segLen = this.cumulative[i] - this.cumulative[i - 1];
    const t = segLen === 0 ? 0 : (d - this.cumulative[i - 1]) / segLen;
    return { gx: a.gx + (b.gx - a.gx) * t, gy: a.gy + (b.gy - a.gy) * t };
  }

  // Every tile the path crosses (used to block building on it).
  tiles(): Set<string> {
    const set = new Set<string>();
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1], b = this.points[i];
      const steps = Math.max(Math.abs(b.gx - a.gx), Math.abs(b.gy - a.gy));
      for (let s = 0; s <= steps; s++) {
        set.add(`${Math.round(a.gx + ((b.gx - a.gx) * s) / steps)},${Math.round(a.gy + ((b.gy - a.gy) * s) / steps)}`);
      }
    }
    return set;
  }
}

// ---------- Enemy ----------
export class Enemy {
  hp: number;
  readonly maxHp: number;
  distance = 0;
  gx = 0;
  gy = 0;
  alive = true;
  private gfx: Phaser.GameObjects.Graphics;
  private bob = Math.random() * Math.PI * 2;

  constructor(scene: Phaser.Scene, readonly def: EnemyDef, hpScale: number, private path: Path) {
    this.maxHp = Math.round(def.hp * hpScale);
    this.hp = this.maxHp;
    this.gfx = scene.add.graphics();
    this.move(0);
  }

  /** Returns true when the enemy reached the end of the path. */
  move(dt: number): boolean {
    this.distance += this.def.speed * dt;
    const p = this.path.at(this.distance);
    this.gx = p.gx;
    this.gy = p.gy;
    this.bob += dt * this.def.speed * 8;
    this.draw();
    return this.distance >= this.path.length;
  }

  hit(amount: number): number {
    const dealt = Math.max(1, amount - this.def.armor);
    this.hp -= dealt;
    if (this.hp <= 0) this.alive = false;
    return dealt;
  }

  private draw() {
    const { x, y } = toScreen(this.gx, this.gy);
    const s = this.def.size;
    const hop = Math.abs(Math.sin(this.bob)) * 3;
    const g = this.gfx;
    g.clear();
    g.setPosition(x, y);
    g.setDepth(depthOf(this.gx, this.gy) + 5);
    g.fillStyle(0x000000, 0.3).fillEllipse(0, 0, s * 2.2, s * 1.1);
    g.fillStyle(shade(this.def.color, 0.6)).fillCircle(0, -s - hop + 2, s);
    g.fillStyle(this.def.color).fillCircle(0, -s - hop, s);
    g.fillStyle(0xffffff).fillCircle(-s * 0.35, -s * 1.15 - hop, s * 0.22).fillCircle(s * 0.35, -s * 1.15 - hop, s * 0.22);
    // health bar
    const w = 26, frac = Math.max(0, this.hp / this.maxHp);
    g.fillStyle(0x000000, 0.6).fillRect(-w / 2, -s * 2 - 10, w, 4);
    g.fillStyle(frac > 0.5 ? 0x6ad06a : frac > 0.25 ? 0xe8c547 : 0xe05555).fillRect(-w / 2, -s * 2 - 10, w * frac, 4);
  }

  destroy() { this.gfx.destroy(); }
}

// ---------- Tower ----------
export class Tower {
  cooldown = 0;
  readonly gfx: Phaser.GameObjects.Graphics;
  aim = 0; // angle in screen space, for the little barrel

  constructor(scene: Phaser.Scene, readonly def: TowerDef, readonly tx: number, readonly ty: number) {
    this.gfx = scene.add.graphics();
    const { x, y } = toScreen(tx, ty);
    this.gfx.setPosition(x, y).setDepth(depthOf(tx, ty) + 4);
    this.draw();
  }

  get height() { return this.def.kind === 'mortar' ? 22 : this.def.kind === 'mg' ? 30 : 40; }

  draw() {
    const g = this.gfx;
    const w = TILE_W * 0.32, h = TILE_H * 0.32, H = this.height, c = this.def.color;
    g.clear();
    g.fillStyle(0x000000, 0.25).fillEllipse(0, 2, w * 2.4, h * 2.4);
    // left face, right face, top face of an isometric block
    g.fillStyle(shade(c, 0.55)).fillPoints(P([{ x: -w, y: 0 }, { x: 0, y: h }, { x: 0, y: h - H }, { x: -w, y: -H }]), true);
    g.fillStyle(shade(c, 0.78)).fillPoints(P([{ x: w, y: 0 }, { x: 0, y: h }, { x: 0, y: h - H }, { x: w, y: -H }]), true);
    g.fillStyle(c).fillPoints(P([{ x: 0, y: -h - H }, { x: w, y: -H }, { x: 0, y: h - H }, { x: -w, y: -H }]), true);
    // barrel
    const bx = Math.cos(this.aim) * 14, by = Math.sin(this.aim) * 7;
    g.lineStyle(this.def.kind === 'mortar' ? 7 : 4, shade(c, 0.4)).lineBetween(0, -H, bx, -H + by - (this.def.kind === 'mortar' ? 6 : 0));
    g.fillStyle(shade(c, 1.2)).fillCircle(0, -H, 5);
  }

  destroy() { this.gfx.destroy(); }
}

// ---------- Projectile ----------
export interface Projectile {
  gfx: Phaser.GameObjects.Graphics;
  sx: number; sy: number;            // start (grid)
  tx: number; ty: number;            // landing point (grid), updated while homing
  startHeight: number;
  homing?: Enemy;
  t: number;
  duration: number;
  damage: number;
  splash: number;
  arcHeight: number;
  color: number;
}
