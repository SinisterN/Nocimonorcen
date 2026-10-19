// The level 3 turret's energy shield: a gentle idle shimmer, and a flare with a ripple where it is hit.
// Drawn in code over the painted dome, with additive blending so it only ever brightens the art.
import Phaser from 'phaser';

/** Dome shape as fractions of the turret sprite: the base rim's centre and the dome's radii. */
export interface DomeShape { cx: number; cy: number; rx: number; ry: number; rimRy: number }
export const TURRET_DOME: DomeShape = { cx: 0.5, cy: 0.8, rx: 0.47, ry: 0.79, rimRy: 0.1 };

const CYAN = 0x8ff4ff;

export class ForceField {
  private gfx: Phaser.GameObjects.Graphics;
  private hits: { x: number; y: number; t: number }[] = [];
  private sparks: { x: number; y: number; vx: number; vy: number; t: number }[] = [];
  private flare = 0;
  private time = Math.random() * 10;
  private onUpdate: (time: number, dt: number) => void;

  /** sprite: the turret image (origin anywhere); its on-screen bounds define the dome. */
  constructor(private scene: Phaser.Scene, private sprite: Phaser.GameObjects.Image, private shape: DomeShape = TURRET_DOME) {
    this.gfx = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setDepth(sprite.depth + 0.5);
    this.onUpdate = (_t, dt) => this.update(dt / 1000);
    scene.events.on('update', this.onUpdate);
  }

  /** The dome in screen space. */
  private dome() {
    const b = this.sprite.getBounds(), s = this.shape;
    return { cx: b.x + b.width * s.cx, cy: b.y + b.height * s.cy, rx: b.width * s.rx, ry: b.height * s.ry, rimRy: b.height * s.rimRy };
  }

  /** Is a screen point inside the dome (upper half-ellipse plus the base rim)? */
  private inside(x: number, y: number) {
    const d = this.dome();
    const nx = (x - d.cx) / d.rx;
    if (y <= d.cy) return nx * nx + ((y - d.cy) / d.ry) ** 2 <= 1;
    return nx * nx + ((y - d.cy) / d.rimRy) ** 2 <= 1;
  }

  /** A shot or blast hits the field. (x, y): where it came from or landed; the impact is put on the dome's surface. */
  hit(fromX: number, fromY: number) {
    const d = this.dome();
    // the point on the dome's upper surface facing the attacker
    let a = Math.atan2((fromY - d.cy) / d.ry, (fromX - d.cx) / d.rx);
    if (Math.sin(a) > -0.15) a = Math.cos(a) >= 0 ? -0.15 : Math.PI + 0.15; // attackers below aim at the low sides
    const x = d.cx + Math.cos(a) * d.rx * 0.96;
    const y = d.cy + Math.sin(a) * d.ry * 0.96;
    this.hits.push({ x, y, t: 0 });
    this.flare = 1;
    for (let i = 0; i < 10; i++) {
      const s = Phaser.Math.FloatBetween(40, 110), dir = a + Phaser.Math.FloatBetween(-1.2, 1.2);
      this.sparks.push({ x, y, vx: Math.cos(dir) * s, vy: Math.sin(dir) * s - 30, t: 0 });
    }
  }

  destroy() {
    this.scene.events.off('update', this.onUpdate);
    this.gfx.destroy();
  }

  private update(dt: number) {
    if (!this.sprite.active) return this.destroy();
    this.time += dt;
    this.flare = Math.max(0, this.flare - dt * 3.2);
    const g = this.gfx.clear().setDepth(this.sprite.depth + 0.5);
    const d = this.dome();
    const t = this.time;

    // body glow: slow breathing, plus the flare after a hit
    const glow = 0.05 + 0.03 * Math.sin(t * 2.1) + 0.16 * this.flare;
    this.fillDome(g, d, CYAN, glow);

    // rim light: brighter edge, flickers a little
    g.lineStyle(2 + 2 * this.flare, CYAN, 0.35 + 0.1 * Math.sin(t * 7) + 0.4 * this.flare);
    this.strokeDome(g, d);

    // a bright band sweeping slowly up the dome, every few seconds
    const sweep = (t % 3.2) / 3.2;
    if (sweep < 0.6) {
      const k = sweep / 0.6, yy = d.cy - d.ry * k, half = d.rx * Math.sqrt(Math.max(0, 1 - k * k));
      g.lineStyle(3, 0xd8fcff, 0.28 * Math.sin(k * Math.PI));
      g.beginPath();
      g.arc(d.cx, yy + half * 0.18, half, Math.PI * 1.08, Math.PI * 1.92, false);
      g.strokePath();
    }

    // impacts: bright core and a ripple ring spreading over the surface
    for (const h of this.hits) {
      h.t += dt;
      const k = h.t / 0.55;
      g.fillStyle(0xffffff, Math.max(0, 0.9 - k * 2)).fillCircle(h.x, h.y, 5 + 6 * k);
      g.fillStyle(CYAN, Math.max(0, 0.6 - k)).fillCircle(h.x, h.y, 10 + 14 * k);
      for (const [r, a] of [[1, 0.8], [0.6, 0.5]] as const) {
        const rr = (10 + 55 * k) * r;
        g.lineStyle(2.5, CYAN, Math.max(0, a * (1 - k)));
        this.clippedRing(g, h.x, h.y, rr, rr * 0.75);
      }
    }
    this.hits = this.hits.filter(h => h.t < 0.55);

    // sparks: little bright flecks thrown off the impact
    for (const s of this.sparks) {
      s.t += dt; s.vy += 220 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
      g.fillStyle(0xe8feff, Math.max(0, 1 - s.t / 0.45)).fillCircle(s.x, s.y, 1.6);
    }
    this.sparks = this.sparks.filter(s => s.t < 0.45);
  }

  /** Filled dome: upper half-ellipse plus the base rim, as one polygon. */
  private fillDome(g: Phaser.GameObjects.Graphics, d: ReturnType<ForceField['dome']>, color: number, alpha: number) {
    g.fillStyle(color, alpha);
    g.fillPoints(this.domePoints(d), true);
  }

  private strokeDome(g: Phaser.GameObjects.Graphics, d: ReturnType<ForceField['dome']>) {
    g.strokePoints(this.domePoints(d), true);
  }

  private domePoints(d: ReturnType<ForceField['dome']>) {
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i <= 40; i++) {
      const a = Math.PI + (i / 40) * Math.PI; // left, over the top, to the right
      pts.push(new Phaser.Math.Vector2(d.cx + Math.cos(a) * d.rx, d.cy + Math.sin(a) * d.ry));
    }
    for (let i = 1; i < 20; i++) {
      const a = (i / 20) * Math.PI; // back along the front of the rim
      pts.push(new Phaser.Math.Vector2(d.cx + Math.cos(a) * d.rx, d.cy + Math.sin(a) * d.rimRy));
    }
    return pts;
  }

  /** An elliptical ring, drawn only where it lies on the dome. */
  private clippedRing(g: Phaser.GameObjects.Graphics, x: number, y: number, rx: number, ry: number) {
    const n = 36;
    let drawing = false;
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2, px = x + Math.cos(a) * rx, py = y + Math.sin(a) * ry;
      if (this.inside(px, py)) {
        if (drawing) g.lineTo(px, py); else { g.moveTo(px, py); drawing = true; }
      } else drawing = false;
    }
    g.strokePath();
  }
}
