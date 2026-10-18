// Enemies, towers, plots and projectiles. Each owns its Phaser graphics; GameScene runs the logic.
import Phaser from 'phaser';
import * as art from './art';
import { EnemyDef, HIGH_GROUND_LIFT, PlotDef, TowerDef } from './config';
import { depthOf, toScreen } from './iso';

// ---------- Path ----------
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

  /** Position after walking `dist` tiles from the start. */
  at(dist: number): { gx: number; gy: number } {
    const d = Phaser.Math.Clamp(dist, 0, this.length);
    let i = 1;
    while (i < this.cumulative.length - 1 && this.cumulative[i] < d) i++;
    const a = this.points[i - 1], b = this.points[i];
    const segLen = this.cumulative[i] - this.cumulative[i - 1];
    const t = segLen === 0 ? 0 : (d - this.cumulative[i - 1]) / segLen;
    return { gx: a.gx + (b.gx - a.gx) * t, gy: a.gy + (b.gy - a.gy) * t };
  }

  /** Shortest distance (in tiles) from a grid point to the road's centre line. */
  distanceTo(gx: number, gy: number): number {
    let best = Infinity;
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1], b = this.points[i];
      const dx = b.gx - a.gx, dy = b.gy - a.gy;
      const t = Phaser.Math.Clamp(((gx - a.gx) * dx + (gy - a.gy) * dy) / (dx * dx + dy * dy), 0, 1);
      best = Math.min(best, Math.hypot(gx - (a.gx + dx * t), gy - (a.gy + dy * t)));
    }
    return best;
  }
}

// ---------- Plot ----------
export class Plot {
  readonly gfx: Phaser.GameObjects.Graphics;
  readonly lift: number;
  tower: Tower | null = null;
  private hovered = false;

  constructor(scene: Phaser.Scene, readonly def: PlotDef, readonly index: number) {
    this.lift = def.high ? HIGH_GROUND_LIFT : 0;
    this.gfx = scene.add.graphics();
    const { x, y } = toScreen(def.x, def.y);
    this.gfx.setPosition(x, y).setDepth(depthOf(def.x, def.y) + 1);
    this.draw();
  }

  get screen() { return toScreen(this.def.x, this.def.y); }
  /** Screen point of the pad's centre (where a tower stands). */
  get top() { const s = this.screen; return { x: s.x, y: s.y - this.lift }; }

  setHover(on: boolean) {
    if (on === this.hovered) return;
    this.hovered = on;
    this.draw();
  }

  draw() { this.gfx.clear(); art.plot(this.gfx, this.lift, !!this.def.high, this.hovered && !this.tower, this.index * 97 + 13); }

  /** Is a screen point on this plot's pad (or on the tower standing on it)? */
  hit(px: number, py: number): boolean {
    const t = this.top;
    const dx = (px - t.x) / 32, dy = (py - t.y) / 17;
    if (dx * dx + dy * dy <= 1) return true;
    return !!this.tower && Math.abs(px - t.x) < 24 && py < t.y && py > t.y - 70;
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
  flash = 0;
  private facing = 1;
  private phase = Math.random() * Math.PI * 2;
  private gfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, readonly def: EnemyDef, hpScale: number, private path: Path) {
    this.maxHp = Math.round(def.hp * hpScale);
    this.hp = this.maxHp;
    this.gfx = scene.add.graphics();
    this.move(0);
  }

  get screen() { return toScreen(this.gx, this.gy); }
  /** Height of the body's centre above the feet, for aiming shots. */
  get bodyHeight() { return this.def.size * 2.3; }

  /** Returns true when the enemy reached the end of the path. */
  move(dt: number): boolean {
    const before = toScreen(this.gx, this.gy).x;
    this.distance += this.def.speed * dt;
    const p = this.path.at(this.distance);
    this.gx = p.gx;
    this.gy = p.gy;
    const dx = toScreen(this.gx, this.gy).x - before;
    if (Math.abs(dx) > 0.01) this.facing = dx > 0 ? 1 : -1;
    this.phase += dt * this.def.speed * 9;
    this.flash = Math.max(0, this.flash - dt);
    this.draw();
    return this.distance >= this.path.length;
  }

  hit(amount: number): number {
    const dealt = Math.max(1, amount - this.def.armor);
    this.hp -= dealt;
    this.flash = 0.07;
    if (this.hp <= 0) this.alive = false;
    return dealt;
  }

  private draw() {
    const { x, y } = toScreen(this.gx, this.gy);
    const g = this.gfx;
    g.clear().setPosition(x, y).setDepth(depthOf(this.gx, this.gy) + 5);
    art.enemy(g, this.def.kind, this.phase, this.facing, this.flash > 0);
    if (this.hp < this.maxHp) {
      const w = 26, frac = Math.max(0, this.hp / this.maxHp), top = -this.def.size * 5.3;
      g.fillStyle(art.OUTLINE).fillRect(-w / 2 - 1, top - 1, w + 2, 6);
      g.fillStyle(0x5a1d1d).fillRect(-w / 2, top, w, 4);
      g.fillStyle(frac > 0.5 ? 0x7bd35a : frac > 0.25 ? 0xf2c94c : 0xe0553f).fillRect(-w / 2, top, w * frac, 4);
    }
  }

  destroy() { this.gfx.destroy(); }
}

// ---------- Tower ----------
export class Tower {
  cooldown = 0;
  aim = Math.PI * 0.25;
  recoil = 0;
  readonly gfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, readonly def: TowerDef, readonly plot: Plot) {
    this.gfx = scene.add.graphics();
    const t = plot.top;
    this.gfx.setPosition(t.x, t.y).setDepth(depthOf(plot.def.x, plot.def.y) + 4);
    this.draw();
  }

  get tx() { return this.plot.def.x; }
  get ty() { return this.plot.def.y; }
  /** Screen height (above the plot's ground) where shots leave the tower. */
  get muzzle() { return art.towerMuzzleHeight(this.def.kind) + this.plot.lift; }

  tick(dt: number) {
    if (this.recoil > 0) { this.recoil = Math.max(0, this.recoil - dt * 30); this.draw(); }
  }

  draw() { this.gfx.clear(); art.tower(this.gfx, this.def.kind, this.aim, this.recoil); }

  destroy() { this.gfx.destroy(); }
}

// ---------- Projectile ----------
export interface Projectile {
  gfx: Phaser.GameObjects.Graphics;
  sx: number; sy: number;            // start (grid)
  tx: number; ty: number;            // landing point (grid), updated while homing
  startHeight: number;
  endHeight: number;
  homing?: Enemy;
  t: number;
  duration: number;
  damage: number;
  splash: number;
  arcHeight: number;
  kind: 'arrow' | 'shell';
  last?: { x: number; y: number };
}
