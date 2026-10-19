// Enemies, towers, plots and projectiles. Each owns its Phaser graphics; GameScene runs the logic.
import Phaser from 'phaser';
import * as art from './art';
import { audio } from './audio';
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

  /** Takes a hit; armour counts against each pellet when the shot is a spread of pellets. */
  hit(amount: number, pellets = 1): number {
    const dealt = Math.max(1, pellets * Math.max(0, amount / pellets - this.def.armor));
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
  /** Level 3 arrow towers get a second archer beside the first. */
  private archer2: Phaser.GameObjects.Image | null = null;
  private archer2Home = { x: 0, y: 0 };
  private idle?: Phaser.Tweens.Tween;
  /** Total gold put into this tower (build plus upgrades), for the sell refund. */
  spent: number;

  /** Upgrade level, 1 to 3. */
  level = 1;
  private gun: Phaser.GameObjects.Image | null = null;

  constructor(private scene: Phaser.Scene, readonly def: TowerDef, readonly plot: Plot) {
    this.spent = def.cost;
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
    const meta: SpriteMeta = SPRITES[this.levelSprite()];
    for (const img of [this.base, this.front, this.gun]) {
      img?.setTexture(meta.key).setOrigin(meta.origin[0], meta.origin[1]).setDisplaySize(meta.display[0], meta.display[1]);
    }
    if (this.level >= 3 && this.archer && !this.archer2) this.addSecondArcher();
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
    this.idle = this.breathe(this.archer, this.archerHome);
  }

  private addSecondArcher() {
    const a = this.archer!;
    // the two archers stand side by side on the platform
    this.archerHome.x -= 9;
    this.scene.tweens.killTweensOf(a);
    a.setPosition(this.archerHome.x, this.archerHome.y);
    this.idle = this.breathe(a, this.archerHome);
    this.archer2Home = { x: this.archerHome.x + 19, y: this.archerHome.y + 1 };
    this.archer2 = addSprite(this.scene, 'archer', this.archer2Home.x, this.archer2Home.y)
      .setDepth(a.depth + 0.05).setFlipX(true);
    this.breathe(this.archer2, this.archer2Home, 300);
  }

  private breathe(img: Phaser.GameObjects.Image, home: { y: number }, delay = 0) {
    return this.scene.tweens.add({
      targets: img, y: home.y - 1, duration: 900, delay, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
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
    if (this.archer) this.drawBow(this.archer, this.archerHome, targetScreenX);
  }

  /** Level 3 arrow towers: the second archer's shot. */
  shootSecond(targetScreenX: number) {
    if (this.archer2) this.drawBow(this.archer2, this.archer2Home, targetScreenX);
  }

  /** Archer faces the target, pulls back, snaps forward, then goes back to breathing. */
  private drawBow(a: Phaser.GameObjects.Image, home: { x: number; y: number }, targetScreenX: number) {
    a.setFlipX(targetScreenX < home.x);
    const sx = SPRITES.archer.display[0], sy = SPRITES.archer.display[1];
    const lean = (targetScreenX < home.x ? -1 : 1) * 2;
    this.scene.tweens.killTweensOf(a);
    a.setPosition(home.x, home.y);
    this.scene.tweens.chain({
      targets: a,
      tweens: [
        { displayWidth: sx * 0.9, displayHeight: sy * 1.04, x: home.x - lean, duration: 70, ease: 'Quad.easeOut' },
        { displayWidth: sx * 1.08, displayHeight: sy * 0.96, x: home.x + lean, duration: 50, ease: 'Quad.easeIn' },
        { displayWidth: sx, displayHeight: sy, x: home.x, duration: 160, ease: 'Back.easeOut' },
      ],
      onComplete: () => { this.breathe(a, home); },
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
    g.setPosition(home.x, home.y).setDisplaySize(w, h).setAngle(0);
    if (this.def.kind === 'mg') return this.shotgunKick(g, w, h, back, home);
    this.scene.tweens.chain({
      targets: g,
      tweens: [
        { displayWidth: w * 1.05, displayHeight: h * 0.92, x: home.x - back, duration: 50, ease: 'Quad.easeOut' },
        { displayWidth: w, displayHeight: h, x: home.x, duration: 220, ease: 'Back.easeOut' },
      ],
    });
  }

  /**
   * The Boomstick's shot: a hard kick back with the barrel jerking up, a settle, then the pump-action rack
   * (two quick jerks) that throws the spent shell out.
   */
  private shotgunKick(g: Phaser.GameObjects.Image, w: number, h: number, back: number, home: { x: number; y: number }) {
    const kick = back * 3;                  // pushed away from the target
    const tilt = (back > 0 ? 1 : -1) * 2;   // the whole gun rocks back a little
    this.scene.tweens.chain({
      targets: g,
      tweens: [
        { displayWidth: w * 1.07, displayHeight: h * 0.9, x: home.x - kick, angle: tilt, duration: 45, ease: 'Quad.easeOut' },
        { displayWidth: w, displayHeight: h, x: home.x, angle: 0, duration: 260, ease: 'Back.easeOut' },
        // pump back: the shell flies out
        { x: home.x - back, displayHeight: h * 0.97, duration: 60, delay: 90, ease: 'Quad.easeOut',
          onStart: () => { audio.play('boomstick_pump', { x: home.x }); this.ejectShell(); } },
        { x: home.x, displayHeight: h, duration: 70, ease: 'Quad.easeIn' },
        // pump forward: chambered
        { x: home.x - back * 0.5, duration: 40, ease: 'Quad.easeOut' },
        { x: home.x, duration: 90, ease: 'Back.easeOut' },
      ],
    });
  }

  /** A spent red shotgun shell spinning out of the gun, bouncing once by the tower and fading out. */
  private ejectShell() {
    const mp = this.muzzlePoint;
    if (!mp || !this.gun) return;
    const scene = this.scene;
    const home = this.plot.top;
    // the shell leaves from the breech, a little behind the middle of the gun, and flies away from the barrel
    const away = Math.sign(home.x - mp.x) || 1;
    const sx = home.x + (mp.x - home.x) * 0.15, sy = mp.y + 12;
    const shell = scene.add.graphics().setPosition(sx, sy).setDepth(this.gun.depth + 1);
    shell.fillStyle(0x2b1d12).fillRoundedRect(-5.5, -2.6, 11, 5.2, 2);
    shell.fillStyle(0xc0392b).fillRoundedRect(-4.5, -1.8, 7, 3.6, 1.5);
    shell.fillStyle(0xe2b04a).fillRect(2.5, -1.8, 2.2, 3.6);
    shell.fillStyle(0xff8a7a, 0.8).fillRect(-3.5, -1.4, 5, 1);
    const groundY = home.y + Phaser.Math.Between(4, 14);
    const vx = away * Phaser.Math.FloatBetween(40, 70);
    let vy = -Phaser.Math.FloatBetween(110, 150), y = sy, x = sx, bounced = false;
    const spin = away * Phaser.Math.FloatBetween(14, 22);
    const step = (_t: number, dtMs: number) => {
      const dt = dtMs / 1000;
      vy += 520 * dt;
      x += vx * dt * (bounced ? 0.4 : 1);
      y += vy * dt;
      if (y >= groundY) {
        if (bounced) { y = groundY; vy = 0; } else {
          bounced = true; y = groundY; vy = -vy * 0.35;
          audio.play('shell_drop', { x });
        }
      }
      shell.setPosition(x, y);
      if (!(bounced && vy === 0)) shell.rotation += spin * dt * (bounced ? 0.5 : 1);
    };
    scene.events.on('update', step);
    scene.tweens.add({
      targets: shell, alpha: 0, delay: 1100, duration: 500,
      onComplete: () => { scene.events.off('update', step); shell.destroy(); },
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
    if (this.archer2) this.scene.tweens.killTweensOf(this.archer2);
    this.archer2?.destroy();
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
  /** Level 3 bombard shells leave burning ground. */
  burns?: boolean;
  arcHeight: number;
  kind: 'arrow' | 'shell';
  last?: { x: number; y: number };
}
