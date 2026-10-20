// Enemies, towers, plots and projectiles. Each owns its Phaser graphics; GameScene runs the logic.
import Phaser from 'phaser';
import * as art from './art';
import { audio } from './audio';
import { eraLook } from './era';
import { EnemyDef, HIGH_GROUND_LIFT, PELLET_SLOW, PlotDef, SHIELD_ABSORB, SHIELD_BLOCK, TOWER_HP, TOWER_HP_LEVEL, TowerDef } from './config';
import { ForceField } from './forcefield';
import { RigView, hasRig } from './rig/rigView';
import { basePose, ease } from './rig/poses';
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
    const name = def.high ? eraLook().plotHigh : eraLook().plot;
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
/** How an enemy dies on screen. */
export type DeathStyle = 'sink' | 'collapse' | 'topple' | 'machine' | 'buckle' | 'blast';
const DEATH: Record<string, DeathStyle> = {
  grunt: 'sink', shaman: 'sink', fast: 'collapse', armored: 'topple', brute: 'topple',
  robot: 'machine', shield: 'machine', droid: 'blast', walker: 'buckle', tank: 'buckle',
};
/** Half the usable width of the road, in tiles: enemies spread over lanes within it. */
export const LANE_MAX = 0.28;
const MACHINES = new Set(['robot', 'droid', 'walker', 'shield', 'tank']);

export class Enemy {
  hp: number;
  readonly maxHp: number;
  distance = 0;
  gx = 0;
  gy = 0;
  alive = true;
  flash = 0;
  /** Sideways offset from the road's centre line in tiles (+ = right of the direction of travel), eased towards laneTarget. */
  lane: number;
  laneTarget: number;
  /** Spawn group: members of a pack keep together. */
  readonly group: number;
  /** Speed multiplier the scene sets each frame (spacing in the crowd, rushing at towers). */
  pace = 1;
  /** Seconds left standing still (firing, bracing for a rocket launch). */
  hold = 0;
  /** Seconds left braced (knight guarding against pellets, walker winding up): leans back, moves slower. */
  brace = 0;
  /** Seconds left of the shotgun slow. */
  slow = 0;
  /** Tiles still to be pushed back by a blast. */
  knock = 0;
  /** Seconds since the enemy appeared: it climbs out of the ground / rolls out of the gate first. */
  age = 0;
  /** Direction of travel along the road (grid, unit length), for shields and facing. */
  headX = 1;
  headY = 0;
  /** The last hit was stopped by the riot shield (the scene draws a spark). */
  blocked = false;
  private stagger = 0;
  private facing = 1;
  private goingUp = false;
  private phase = Math.random() * Math.PI * 2;
  private behaviourClock = Math.random() * 10;
  private stumble = 0;
  private gfx: Phaser.GameObjects.Graphics;
  private sprite: Phaser.GameObjects.Image | null = null;
  private frontMeta: SpriteMeta | null = null;
  private backMeta: SpriteMeta | null = null;
  private dying = false;
  /** Cut-out rig with jointed limbs (front view); the painted back view is still used when walking up the screen. */
  private rig: RigView | null = null;
  private rigAct: { name: string; t: number } | null = null;

  constructor(private scene: Phaser.Scene, readonly def: EnemyDef, hpScale: number, private path: Path,
    opts: { lane?: number; group?: number } = {}) {
    this.maxHp = Math.round(def.hp * (def.boss ? 1 : hpScale));
    this.hp = this.maxHp;
    this.group = opts.group ?? 0;
    this.lane = this.laneTarget = def.boss ? 0 : opts.lane ?? (Math.random() * 2 - 1) * LANE_MAX;
    this.gfx = scene.add.graphics();
    const front = `enemy_${def.kind}` as SpriteName, back = `enemy_${def.kind}_back` as SpriteName;
    if (front in SPRITES && hasSprite(scene, front)) {
      this.frontMeta = SPRITES[front];
      this.sprite = addSprite(scene, front, 0, 0);
      if (back in SPRITES && hasSprite(scene, back)) this.backMeta = SPRITES[back];
      if (hasRig(scene, def.kind)) this.rig = new RigView(scene, def.kind, this.frontMeta.display[1]);
    }
    this.move(0);
  }

  get screen() { return toScreen(this.gx, this.gy); }
  /** Height of the body's centre above the feet, for aiming shots. */
  get bodyHeight() { return this.def.size * 2.3; }
  /** Current speed in tiles per second, after everything that slows or speeds it. */
  get speedNow() {
    if (this.hold > 0 || this.knock > 0) return 0;
    let v = this.def.speed * this.pace * this.behaviourPace();
    if (this.slow > 0 && !this.def.boss) v *= PELLET_SLOW.factor;
    if (this.brace > 0) v *= 0.7;
    return v;
  }

  /** Speed changes that are part of each enemy's character. */
  private behaviourPace(): number {
    const t = this.behaviourClock;
    switch (this.def.kind) {
      case 'fast': {
        // crawlers sprint, then stop to sniff; a pack shares the rhythm (the clock is seeded by the group)
        const c = t % 1.5;
        return c < 1.15 ? 1.32 : 0.3;
      }
      case 'grunt': case 'shaman':
        return this.stumble > 0 ? 0.25 : 1;
      default:
        return 1;
    }
  }

  /** Crawler packs sprint in step: everyone in a group uses the same clock. */
  syncClock(t: number) { this.behaviourClock = t; }

  /** Returns true when the enemy reached the end of the path. */
  move(dt: number): boolean {
    this.age += dt;
    this.behaviourClock += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.stagger = Math.max(0, this.stagger - dt);
    this.slow = Math.max(0, this.slow - dt);
    this.brace = Math.max(0, this.brace - dt);
    this.stumble = Math.max(0, this.stumble - dt);
    // zombies now and then trip over their own feet
    if ((this.def.kind === 'grunt' || this.def.kind === 'shaman') && this.stumble <= 0 && Math.random() < dt / 7) {
      this.stumble = 0.55;
      if (!this.rigAct) this.playRig('stumble');
    }
    if (this.rigAct) {
      this.rigAct.t += dt;
      if (this.rigAct.t >= (this.rig?.moves.acts[this.rigAct.name]?.dur ?? 0)) this.rigAct = null;
    }
    // droids weave from side to side
    if (this.def.kind === 'droid') this.laneTarget = Math.sin(this.behaviourClock * 2.6) * LANE_MAX;

    const before = toScreen(this.gx, this.gy);
    let step = this.speedNow * dt;
    if (this.knock > 0) {
      const k = Math.min(this.knock, dt * 3);
      this.knock -= k;
      step = -k;
    }
    if (this.hold > 0) this.hold -= dt;
    // ease off through corners
    step *= this.cornerFactor();
    this.distance = Math.max(0, this.distance + step);
    this.lane += (this.laneTarget - this.lane) * Math.min(1, dt * 2.2);

    // position: the road's centre line with its corners rounded off, shifted sideways into the lane
    const d = this.distance, r = 0.45;
    const a = this.path.at(d - r), c = this.path.at(d), b = this.path.at(d + r);
    let tx = b.gx - a.gx, ty = b.gy - a.gy;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    this.headX = tx; this.headY = ty;
    this.gx = (a.gx + 2 * c.gx + b.gx) / 4 - ty * this.lane;
    this.gy = (a.gy + 2 * c.gy + b.gy) / 4 + tx * this.lane;

    const after = toScreen(this.gx, this.gy);
    const sdx = after.x - before.x, sdy = after.y - before.y;
    const moved = Math.hypot(sdx, sdy);
    if (moved > 0.05 && step > 0) {
      if (Math.abs(sdx) > 0.02) this.facing = sdx > 0 ? 1 : -1;
      // a little hysteresis so it doesn't flicker between front and back on level stretches
      if (sdy < -moved * 0.25) this.goingUp = true;
      else if (sdy > moved * 0.25) this.goingUp = false;
    }
    // the walk cycle follows the ground covered, so feet plant instead of sliding
    const meta = this.frontMeta;
    const stride = meta ? meta.display[0] * 0.55 : 18;
    if (step > 0) this.phase += (moved / stride) * Math.PI;
    this.draw();
    return this.distance >= this.path.length;
  }

  /** 1 on straight road, down to 0.8 in the middle of a right-angle turn. */
  private cornerFactor() {
    const d = this.distance;
    const a = this.path.at(d - 0.5), c = this.path.at(d), b = this.path.at(d + 0.5);
    const ux = c.gx - a.gx, uy = c.gy - a.gy, vx = b.gx - c.gx, vy = b.gy - c.gy;
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    if (lu < 1e-3 || lv < 1e-3) return 1;
    const cos = (ux * vx + uy * vy) / (lu * lv);
    return 0.8 + 0.2 * Math.max(0, cos);
  }

  /**
   * Takes a hit; armour counts against each pellet when the shot is a spread of pellets.
   * from: where the shot came from (grid), for the riot shield. Returns the damage dealt.
   */
  hit(amount: number, pellets = 1, from?: { gx: number; gy: number }): number {
    this.blocked = false;
    if (this.def.kind === 'shield' && from) {
      const fx = from.gx - this.gx, fy = from.gy - this.gy, fl = Math.hypot(fx, fy) || 1;
      if ((fx * this.headX + fy * this.headY) / fl > 0.3) { amount *= 1 - SHIELD_BLOCK; this.blocked = true; }
    }
    let armor = this.def.armor;
    if (pellets > 1) {
      // knights brace behind their armour when a shotgun opens up on them
      if (this.def.kind === 'armored') { if (this.brace > 0) armor += 1; this.brace = 1.0; }
      if (!this.def.boss) this.slow = PELLET_SLOW.seconds;
    }
    const dealt = Math.max(1, pellets * Math.max(0, amount / pellets - armor));
    this.hp -= dealt;
    this.flash = 0.07;
    this.stagger = this.def.boss ? 0.05 : 0.12;
    if (this.rig && this.rigAct?.name !== 'blast' && this.rigAct?.name !== 'stumble') this.playRig('hit');
    if (this.hp <= 0) this.alive = false;
    return dealt;
  }

  /** Pushed back along the road by a blast. */
  knockBack(tiles: number) {
    if (this.def.boss || !this.alive) return;
    this.knock = Math.max(this.knock, tiles * (1 - Math.min(0.8, this.def.armor * 0.15)));
    this.playRig('blast');
  }

  heal(amount: number) {
    if (!this.alive) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.draw();
  }

  /** Plays one of the rig's moves (attack, hit...) if this enemy has a rig. */
  playAct(name: string) { this.playRig(name); }

  private playRig(name: string) {
    if (this.rig?.moves.acts[name]) this.rigAct = { name, t: 0 };
  }

  /** Draws the jointed rig; returns false when the painted sprite should be used instead (walking up the screen). */
  private drawRig(x: number, y: number, depth: number): boolean {
    const rig = this.rig!;
    if (this.goingUp && this.backMeta) { rig.setVisible(false); return false; }
    rig.setVisible(true);
    this.sprite?.setVisible(false);
    const p = basePose();
    if (this.speedNow > 0.01 || this.knock > 0) rig.moves.walk(this.phase, p);
    else rig.moves.idle(this.age, p);
    if (this.rigAct) {
      rig.moves.acts[this.rigAct.name].pose(this.rigAct.t, p);
      // the game moves the enemy back along the road itself, so the pose only adds the body's flight
      if (this.rigAct.name === 'blast') p.x = 0;
    }
    // entrance: climbs up out of the ground
    const enter = Math.min(1, this.age / 0.7);
    let squashY = 1;
    if (enter < 1) { p.y += (1 - enter) * 160; squashY = 0.55 + 0.45 * enter; p.alpha = Math.min(1, enter * 2); }
    rig.apply(p);
    rig.place(x, y, this.facing, depth, squashY);
    rig.flash(this.flash > 0);
    return true;
  }

  private draw() {
    const { x, y } = toScreen(this.gx, this.gy);
    const g = this.gfx;
    const depth = depthOf(this.gx, this.gy) + 5;
    if (this.rig && this.alive && this.drawRig(x, y, depth)) {
      const meta = this.frontMeta!;
      g.clear().setPosition(x, y).setDepth(depth + 0.1);
      g.fillStyle(0x000000, 0.25).fillEllipse(0, 0, meta.display[0] * 0.6, meta.display[0] * 0.2);
      this.drawHpBar(g, -meta.display[1] - 8);
      return;
    }
    if (this.rig) this.sprite?.setVisible(true);
    g.clear().setPosition(x, y).setDepth(depth + 0.1);
    let top = -this.def.size * 5.3;
    const sp = this.sprite;
    if (sp && this.frontMeta) {
      // painted sprite (front, or back when walking up the screen) plus code motion: gait, hit stagger, entrance
      const back = this.goingUp && this.backMeta;
      const meta = back ? this.backMeta! : this.frontMeta;
      g.fillStyle(0x000000, 0.25).fillEllipse(0, 0, meta.display[0] * 0.6, meta.display[0] * 0.2);
      const key = back ? meta.key : walkFrameKey(meta, this.phase);
      if (sp.texture.key !== key) { sp.setTexture(key); sp.setOrigin(meta.origin[0], meta.origin[1]); }
      const dir = meta.facesLeft ? -this.facing : this.facing;
      let px = x, py = y, rot = 0, w = meta.display[0], h = meta.display[1];
      const gait = meta.gait ?? (back ? 'stomp' : undefined);
      if (gait === 'scuttle') {
        // quick skittering hops: stretch long while airborne, squash on landing, nose dipping
        const hop = Math.abs(Math.sin(this.phase * 1.5)), s = Math.sin(this.phase * 3);
        py -= hop * 3;
        rot = Math.cos(this.phase * 1.5) * 0.06 * dir;
        w *= 1 + 0.06 * s; h *= 1 - 0.06 * s;
      } else if (gait === 'stomp') {
        // heavy steps: rises mid-step, rocks side to side, squashes a little on each foot-plant
        const lift = Math.abs(Math.sin(this.phase)), plant = Math.pow(1 - lift, 6);
        py -= lift * (this.def.boss ? 4 : 2.5);
        rot = Math.sin(this.phase) * 0.07 + 0.04 * dir;
        w *= 1 + 0.06 * plant; h *= 1 - 0.06 * plant;
      } else if (gait === 'roll') {
        // tracked droid: a fast engine jitter and a lean into its movement
        const jit = Math.sin(this.age * 60) * 0.6;
        px += jit * 0.3; py -= Math.abs(jit);
        rot = 0.06 * dir + Math.sin(this.phase * 2) * 0.02;
      } else {
        py -= Math.abs(Math.sin(this.phase * 2)) * 1.5;
        rot = Math.sin(this.phase) * 0.03;
      }
      // character: a zombie's stumble pitches it forward, a braced knight or walker leans back
      if (this.stumble > 0) rot += Math.sin((this.stumble / 0.55) * Math.PI) * 0.35 * dir;
      if (this.brace > 0) rot -= 0.12 * dir * Math.min(1, this.brace * 4);
      // hit stagger: knocked back a few pixels and squashed
      if (this.stagger > 0) {
        const k = this.stagger / 0.12;
        px -= dir * 4 * k; rot -= dir * 0.12 * k; h *= 1 - 0.07 * k;
      }
      // entrance: zombies claw up out of the ground, machines roll out of the dark factory gate
      let alpha = 1;
      const enter = Math.min(1, this.age / 0.7);
      if (enter < 1) {
        if (MACHINES.has(this.def.kind)) alpha = enter;
        else { py += (1 - enter) * h * 0.45; h *= 0.55 + 0.45 * enter; alpha = Math.min(1, enter * 2); }
      }
      sp.setPosition(px, py).setDepth(depth).setRotation(rot).setDisplaySize(w, h).setAlpha(alpha);
      sp.setFlipX(meta.facesLeft ? this.facing > 0 : this.facing < 0);
      if (this.flash > 0) sp.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      else if (enter < 1 && MACHINES.has(this.def.kind)) sp.setTint(Phaser.Display.Color.GetColor(70 + 185 * enter, 70 + 185 * enter, 70 + 185 * enter)).setTintMode(Phaser.TintModes.MULTIPLY);
      else sp.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      top = -meta.display[1] - 8;
    } else {
      art.enemy(g, this.def.kind, this.phase, this.facing, this.flash > 0);
    }
    this.drawHpBar(g, top);
  }

  private drawHpBar(g: Phaser.GameObjects.Graphics, top: number) {
    if (this.hp < this.maxHp && !this.def.boss) {
      const w = 26, frac = Math.max(0, this.hp / this.maxHp);
      g.fillStyle(art.OUTLINE).fillRect(-w / 2 - 1, top - 1, w + 2, 6);
      g.fillStyle(0x5a1d1d).fillRect(-w / 2, top, w, 4);
      g.fillStyle(frac > 0.5 ? 0x7bd35a : frac > 0.25 ? 0xf2c94c : 0xe0553f).fillRect(-w / 2, top, w * frac, 4);
    }
  }

  /**
   * Plays the death on screen and returns its style, so the scene can add dust, sparks or an explosion.
   * The sprite removes itself when the animation ends.
   */
  die(): DeathStyle {
    const style = DEATH[this.def.kind] ?? 'sink';
    const sp = this.sprite;
    this.gfx.clear();
    if (this.rig && this.rig.container.visible) {
      // the jointed death: drops to its knees, topples, the head rolls off
      sp?.setVisible(false);
      const rig = this.rig, s = this.scene, dir = this.facing;
      this.dying = true;
      rig.playDeath(head => {
        const x0 = head.x, y0 = head.y, ground = this.screen.y - 3;
        const k = { v: 0 };
        s.tweens.add({ targets: k, v: 1, duration: 900, ease: 'Linear',
          onUpdate: () => {
            const v = k.v, bounce = Math.abs(Math.sin(v * Math.PI * 1.6)) * (1 - v);
            head.setPosition(x0 + dir * -22 * ease(v), Math.min(ground, y0 + (ground - y0) * ease(v * 1.4)) - bounce * 10);
            head.setRotation(head.rotation + dir * -0.12 * (1 - v));
          },
          onComplete: () => s.tweens.add({ targets: head, alpha: 0, duration: 700, delay: 1300, onComplete: () => head.destroy() }) });
      });
      this.rig = null;
      sp?.destroy();
      return 'sink';
    }
    this.rig?.destroy(); this.rig = null;
    if (!sp || style === 'blast') return style;
    this.dying = true;
    const s = this.scene, dir = this.facing;
    const done = () => sp.destroy();
    sp.clearTint().setTintMode(Phaser.TintModes.MULTIPLY).setAlpha(1);
    const h = sp.displayHeight, w = sp.displayWidth;
    switch (style) {
      case 'sink':
        sp.setTint(0x8a9a7a);
        s.tweens.add({ targets: sp, y: sp.y + h * 0.35, displayHeight: h * 0.45, rotation: 0.2 * dir, alpha: 0, duration: 800, ease: 'Quad.easeIn', onComplete: done });
        break;
      case 'collapse':
        s.tweens.add({ targets: sp, displayHeight: h * 0.25, displayWidth: w * 1.2, duration: 220, ease: 'Quad.easeIn',
          onComplete: () => s.tweens.add({ targets: sp, alpha: 0, duration: 500, delay: 250, onComplete: done }) });
        break;
      case 'topple':
        s.tweens.add({ targets: sp, rotation: -1.45 * dir, duration: this.def.boss ? 900 : 480, ease: 'Bounce.easeOut',
          onComplete: () => s.tweens.add({ targets: sp, alpha: 0, duration: 600, delay: this.def.boss ? 900 : 300, onComplete: done }) });
        break;
      case 'machine':
        sp.setTint(0x6a6a70);
        s.tweens.add({ targets: sp, rotation: 0.55 * dir, y: sp.y + 3, displayHeight: h * 0.8, duration: 360, ease: 'Quad.easeIn',
          onComplete: () => s.tweens.add({ targets: sp, alpha: 0, duration: 500, delay: 250, onComplete: done }) });
        break;
      case 'buckle':
        sp.setTint(0x8a8a90);
        s.tweens.add({ targets: sp, displayHeight: h * 0.62, y: sp.y + 2, rotation: 0.12 * dir, duration: this.def.boss ? 900 : 450, ease: 'Quad.easeIn',
          onComplete: () => s.tweens.add({ targets: sp, alpha: 0, duration: 260, onComplete: done }) });
        break;
    }
    return style;
  }

  destroy() {
    this.gfx.destroy();
    if (!this.dying) { this.sprite?.destroy(); this.rig?.destroy(); }
  }
}

// ---------- Tower ----------
export class Tower {
  /** Health, for towers that enemies can attack (era 2); 0 = this tower can't be damaged. */
  hp = 0;
  maxHp = 0;
  private hpBar: Phaser.GameObjects.Graphics | null = null;
  private hitFlash = 0;
  /** The level 3 Twin MG's shield dome. */
  shield: ForceField | null = null;
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
    if (TOWER_HP[def.kind]) {
      this.maxHp = this.hp = TOWER_HP[def.kind];
      this.hpBar = scene.add.graphics().setDepth(depth + 0.6);
    }
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
    if (TOWER_HP[this.def.kind]) {
      // upgrading reinforces the tower: the extra maximum health comes on top of what it has left
      const max = Math.round(TOWER_HP[this.def.kind] * TOWER_HP_LEVEL[this.level - 1]);
      this.hp += max - this.maxHp;
      this.maxHp = max;
      this.drawHp();
    }
    if (!this.usesSprite) return;
    const meta: SpriteMeta = SPRITES[this.levelSprite()];
    for (const img of [this.base, this.front, this.gun]) {
      img?.setTexture(meta.key).setOrigin(meta.origin[0], meta.origin[1]).setDisplaySize(meta.display[0], meta.display[1]);
    }
    if (this.level >= 3 && this.archer && !this.archer2) this.addSecondArcher();
    if (this.level >= 3 && this.def.kind === 'gun' && this.gun && !this.shield) this.shield = new ForceField(this.scene, this.gun);
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
    if (m.turns) g.setFlipX(m.facesLeft ? targetScreenX > home.x : targetScreenX < home.x);
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

  get damaged() { return this.maxHp > 0 && this.hp < this.maxHp; }

  /**
   * Takes damage from an enemy attack coming from screen point (fromX, fromY).
   * Returns the damage actually taken (the shield dome soaks up part of it).
   */
  takeDamage(amount: number, fromX: number, fromY: number): number {
    if (!this.maxHp) return 0;
    let dmg = amount;
    if (this.shield) {
      this.shield.hit(fromX, fromY);
      dmg *= 1 - SHIELD_ABSORB;
    }
    this.hp = Math.max(0, this.hp - dmg);
    this.hitFlash = 0.12;
    const img = this.gun ?? this.base;
    if (img && !this.shield) img.setTint(0xff8a7a);
    this.drawHp();
    return dmg;
  }

  repairFull() {
    this.hp = this.maxHp;
    this.drawHp();
  }

  /** A small health bar over the tower, shown only while it is damaged. */
  drawHp() {
    const g = this.hpBar;
    if (!g) return;
    g.clear();
    if (!this.damaged) return;
    const img = this.gun ?? this.base;
    const t = this.plot.top;
    const top = img ? img.getBounds().y - 6 : t.y - 90;
    const w = 40, frac = this.hp / this.maxHp;
    g.fillStyle(0x1a120b, 0.9).fillRect(t.x - w / 2 - 1, top - 1, w + 2, 7);
    g.fillStyle(0x4a1d1d).fillRect(t.x - w / 2, top, w, 5);
    g.fillStyle(frac > 0.5 ? 0x7bd35a : frac > 0.25 ? 0xf2c94c : 0xe0553f).fillRect(t.x - w / 2, top, w * frac, 5);
  }

  /** Called every frame while a wave runs: fades the red hit flash. */
  tickDamage(dt: number) {
    if (this.hitFlash <= 0) return;
    this.hitFlash -= dt;
    if (this.hitFlash <= 0) (this.gun ?? this.base)?.clearTint();
  }

  destroy() {
    this.shield?.destroy();
    this.hpBar?.destroy();
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
  kind: 'arrow' | 'shell' | 'rocket';
  /** Seconds until the next exhaust puff (rockets). */
  smokeIn?: number;
  last?: { x: number; y: number };
}
