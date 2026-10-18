// Enemies, towers, plots and projectiles. Each owns its Phaser graphics; GameScene runs the logic.
import Phaser from 'phaser';
import * as art from './art';
import { EnemyDef, HIGH_GROUND_LIFT, PlotDef, TowerDef } from './config';
import { depthOf, toScreen } from './iso';
import { ARROW_TOWER, GUN_MUZZLE, SPRITES, SpriteMeta, SpriteName, TOWER_SPRITES, addSprite, hasSprite, walkFrameKey } from './sprites';

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

  private sprite: Phaser.GameObjects.Image | null = null;

  constructor(scene: Phaser.Scene, readonly def: PlotDef, readonly index: number) {
    this.lift = def.high ? HIGH_GROUND_LIFT : 0;
    this.gfx = scene.add.graphics();
    const { x, y } = toScreen(def.x, def.y);
    const depth = depthOf(def.x, def.y) + 1;
    this.gfx.setPosition(x, y).setDepth(depth + 0.05);
    const name = def.high ? 'plot_high' : 'plot';
    if (hasSprite(scene, name)) this.sprite = addSprite(scene, name, x, y - this.lift).setDepth(depth);
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

  draw() {
    this.gfx.clear();
    // Sprite towers bring their own grassy base, so the empty pad is hidden under them.
    const hidden = !!this.tower?.usesSprite;
    this.gfx.setVisible(!hidden);
    this.sprite?.setVisible(!hidden);
    if (this.sprite) {
      if (this.hovered && !this.tower) {
        this.gfx.lineStyle(4, art.OUTLINE, 0.5).strokeEllipse(0, -this.lift, 70, 36);
        this.gfx.lineStyle(3, 0xfff3b0, 0.95).strokeEllipse(0, -this.lift, 70, 36);
      }
      return;
    }
    art.plot(this.gfx, this.lift, !!this.def.high, this.hovered && !this.tower, this.index * 97 + 13);
  }

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
  private sprite: Phaser.GameObjects.Image | null = null;

  constructor(scene: Phaser.Scene, readonly def: EnemyDef, hpScale: number, private path: Path) {
    this.maxHp = Math.round(def.hp * hpScale);
    this.hp = this.maxHp;
    this.gfx = scene.add.graphics();
    const spriteName = `enemy_${def.kind}` as const;
    if (spriteName in SPRITES && hasSprite(scene, spriteName as keyof typeof SPRITES)) {
      this.sprite = addSprite(scene, spriteName as keyof typeof SPRITES, 0, 0);
    }
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
    this.phase += dt * this.def.speed * (this.sprite ? 7 : 9);
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
    const depth = depthOf(this.gx, this.gy) + 5;
    g.clear().setPosition(x, y).setDepth(depth + 0.1);
    let top = -this.def.size * 5.3;
    if (this.sprite) {
      // Painted walk cycle plus a little code motion: bob, sway, facing flip, white hit flash.
      const sp = this.sprite;
      const step = Math.sin(this.phase * 2);
      const meta: SpriteMeta = SPRITES[`enemy_${this.def.kind}` as keyof typeof SPRITES];
      g.fillStyle(0x000000, 0.25).fillEllipse(0, 0, meta.display[0] * 0.6, meta.display[0] * 0.2);
      const key = walkFrameKey(meta, this.phase);
      if (sp.texture.key !== key) sp.setTexture(key);
      if (meta.gait === 'scuttle') {
        // quick skittering hops: stretch long while airborne, squash on landing, nose dipping
        const hop = Math.abs(Math.sin(this.phase * 1.5));
        const s = Math.sin(this.phase * 3);
        sp.setPosition(x, y - hop * 3).setDepth(depth);
        sp.setRotation(Math.cos(this.phase * 1.5) * 0.06 * (meta.facesLeft ? -this.facing : this.facing));
        sp.setDisplaySize(meta.display[0] * (1 + 0.06 * s), meta.display[1] * (1 - 0.06 * s));
      } else {
        sp.setPosition(x, y - Math.abs(step) * 1.5).setDepth(depth);
        sp.setRotation(Math.sin(this.phase) * 0.03);
        sp.setDisplaySize(meta.display[0], meta.display[1]);
      }
      sp.setFlipX(meta.facesLeft ? this.facing > 0 : this.facing < 0);
      if (this.flash > 0) sp.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      else sp.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      top = -meta.display[1] - 8;
    } else {
      art.enemy(g, this.def.kind, this.phase, this.facing, this.flash > 0);
    }
    if (this.hp < this.maxHp) {
      const w = 26, frac = Math.max(0, this.hp / this.maxHp);
      g.fillStyle(art.OUTLINE).fillRect(-w / 2 - 1, top - 1, w + 2, 6);
      g.fillStyle(0x5a1d1d).fillRect(-w / 2, top, w, 4);
      g.fillStyle(frac > 0.5 ? 0x7bd35a : frac > 0.25 ? 0xf2c94c : 0xe0553f).fillRect(-w / 2, top, w * frac, 4);
    }
  }

  destroy() { this.gfx.destroy(); this.sprite?.destroy(); }
}

// ---------- Tower ----------
export class Tower {
  cooldown = 0;
  aim = Math.PI * 0.25;
  recoil = 0;
  readonly gfx: Phaser.GameObjects.Graphics;
  /** True when this tower is drawn with painted sprites instead of code art. */
  readonly usesSprite: boolean;
  private base: Phaser.GameObjects.Image | null = null;
  private front: Phaser.GameObjects.Image | null = null;
  private archer: Phaser.GameObjects.Image | null = null;
  private archerHome = { x: 0, y: 0 };
  private idle?: Phaser.Tweens.Tween;

  /** Upgrade level, 1 to 3. */
  level = 1;
  private gun: Phaser.GameObjects.Image | null = null;

  constructor(private scene: Phaser.Scene, readonly def: TowerDef, readonly plot: Plot) {
    this.gfx = scene.add.graphics();
    const t = plot.top;
    const depth = depthOf(plot.def.x, plot.def.y) + 4;
    this.gfx.setPosition(t.x, t.y).setDepth(depth);
    const first = TOWER_SPRITES[def.kind]?.[0];
    const isArrow = def.kind === 'arrow';
    this.usesSprite = !!first && hasSprite(scene, first) && (!isArrow || hasSprite(scene, 'archer'));
    if (this.usesSprite && isArrow) this.buildArrowSprites(t.x, t.y, depth);
    else if (this.usesSprite) this.gun = addSprite(scene, first, t.x, t.y).setDepth(depth);
    else this.draw();
  }

  /** Painted sprite for the current level (falls back to the highest level that has art). */
  private levelSprite(): SpriteName {
    const list = TOWER_SPRITES[this.def.kind];
    for (let i = Math.min(this.level, list.length) - 1; i > 0; i--) if (hasSprite(this.scene, list[i])) return list[i];
    return list[0];
  }

  /** Changes the upgrade level and swaps in that level's art. */
  setLevel(level: number) {
    this.level = Math.max(1, Math.min(3, level));
    if (!this.usesSprite) return;
    const key = SPRITES[this.levelSprite()].key;
    this.base?.setTexture(key);
    this.front?.setTexture(key);
    this.gun?.setTexture(key);
    const target = this.base ?? this.gun;
    if (target) {
      this.scene.tweens.add({ targets: target, scaleY: { from: target.scaleY * 1.12, to: target.scaleY }, duration: 300, ease: 'Back.easeOut' });
    }
  }

  /** Tower base, archer standing on the platform, and the front parapet drawn over his legs. */
  private buildArrowSprites(x: number, y: number, depth: number) {
    const meta = SPRITES.tower_arrow;
    const [w, h] = meta.display;
    this.base = addSprite(this.scene, 'tower_arrow', x, y).setDepth(depth);
    const top = y - h * meta.origin[1];
    this.archerHome = { x: x + (0.5 - meta.origin[0]) * w, y: top + h * ARROW_TOWER.archerFeetY };
    this.archer = addSprite(this.scene, 'archer', this.archerHome.x, this.archerHome.y).setDepth(depth + 0.1);
    const tex = this.base.texture.getSourceImage() as HTMLImageElement;
    const [b0, b1] = ARROW_TOWER.frontBand;
    this.front = addSprite(this.scene, 'tower_arrow', x, y).setDepth(depth + 0.2)
      .setCrop(0, tex.height * b0, tex.width, tex.height * (b1 - b0));
    // gentle breathing while waiting for targets
    this.idle = this.scene.tweens.add({
      targets: this.archer, y: this.archerHome.y - 1, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  get tx() { return this.plot.def.x; }
  get ty() { return this.plot.def.y; }
  /** Screen height (above the plot's ground) where shots leave the tower. */
  get muzzle() {
    if (this.gun) return -GUN_MUZZLE[this.def.kind].y + this.plot.lift;
    if (this.usesSprite) {
      const meta = SPRITES.tower_arrow;
      return meta.display[1] * (meta.origin[1] - ARROW_TOWER.archerFeetY) + SPRITES.archer.display[1] * 0.6 + this.plot.lift;
    }
    return art.towerMuzzleHeight(this.def.kind) + this.plot.lift;
  }

  /** Screen point of the muzzle (for flashes), or null when shots leave from the tower's centre. */
  get muzzlePoint(): { x: number; y: number } | null {
    if (!this.gun) return null;
    const m = GUN_MUZZLE[this.def.kind];
    const flip = this.gun.flipX ? -1 : 1;
    return { x: this.gun.x + m.x * flip, y: this.gun.y + m.y };
  }

  /** Called when the tower fires: face the target and play its firing motion. */
  shoot(targetScreenX: number) {
    if (this.gun) return this.kickGun(targetScreenX);
    if (!this.archer) return;
    const a = this.archer;
    a.setFlipX(targetScreenX < this.archerHome.x);
    const sx = SPRITES.archer.display[0], sy = SPRITES.archer.display[1];
    const lean = (targetScreenX < this.archerHome.x ? -1 : 1) * 2;
    this.scene.tweens.killTweensOf(a);
    a.setPosition(this.archerHome.x, this.archerHome.y);
    this.scene.tweens.chain({
      targets: a,
      tweens: [
        { displayWidth: sx * 0.9, displayHeight: sy * 1.04, x: this.archerHome.x - lean, duration: 70, ease: 'Quad.easeOut' },
        { displayWidth: sx * 1.08, displayHeight: sy * 0.96, x: this.archerHome.x + lean, duration: 50, ease: 'Quad.easeIn' },
        { displayWidth: sx, displayHeight: sy, x: this.archerHome.x, duration: 160, ease: 'Back.easeOut' },
      ],
      onComplete: () => {
        this.idle = this.scene.tweens.add({
          targets: a, y: this.archerHome.y - 1, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
      },
    });
  }

  /** Gun towers: turn to the target's side, squash down on the shot and spring back. */
  private kickGun(targetScreenX: number) {
    const g = this.gun!;
    const m = GUN_MUZZLE[this.def.kind];
    const home = this.plot.top;
    if (this.def.kind === 'mg') g.setFlipX(m.facesLeft ? targetScreenX > home.x : targetScreenX < home.x);
    const meta: SpriteMeta = SPRITES[this.levelSprite()];
    const [w, h] = meta.display;
    const back = (g.flipX ? 1 : -1) * (m.facesLeft ? -1 : 1) * 2;
    this.scene.tweens.killTweensOf(g);
    g.setPosition(home.x, home.y).setDisplaySize(w, h);
    this.scene.tweens.chain({
      targets: g,
      tweens: [
        { displayWidth: w * 1.05, displayHeight: h * 0.92, x: home.x - back, duration: 50, ease: 'Quad.easeOut' },
        { displayWidth: w, displayHeight: h, x: home.x, duration: 220, ease: 'Back.easeOut' },
      ],
    });
  }

  tick(dt: number) {
    if (this.usesSprite) return;
    if (this.recoil > 0) { this.recoil = Math.max(0, this.recoil - dt * 30); this.draw(); }
  }

  draw() {
    if (this.usesSprite) return;
    this.gfx.clear();
    art.tower(this.gfx, this.def.kind, this.aim, this.recoil);
  }

  destroy() {
    this.idle?.stop();
    if (this.archer) this.scene.tweens.killTweensOf(this.archer);
    this.gfx.destroy();
    this.base?.destroy();
    this.front?.destroy();
    this.archer?.destroy();
    if (this.gun) this.scene.tweens.killTweensOf(this.gun);
    this.gun?.destroy();
  }
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
