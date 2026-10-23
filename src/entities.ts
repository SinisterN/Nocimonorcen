// Enemies, towers, plots and projectiles. Each owns its Phaser graphics; GameScene runs the logic.
import Phaser from 'phaser';
import * as art from './art';
import { audio } from './audio';
import { eraLook } from './era';
import { ERA_ID, EnemyDef, HIGH_GROUND_LIFT, bk, PELLET_SLOW, PlotDef, SHIELD_ABSORB, SHIELD_BLOCK, TOWER_HP, TOWER_HP_LEVEL, TowerDef } from './config';
import { ForceField } from './forcefield';
import { RigView, hasRig } from './rig/rigView';
import { SheetView, hasSheetAnims } from './sheetAnim';
import { ArcherSheet, TowerSheet } from './towerAnim';
import { towerUnit } from './eraFx';
import { TowerFx, dataEra } from './eras';
import { Blocks, hasLevels, levelSpec } from './levels';
import { basePose, ease } from './rig/poses';
import { sparkBurst } from './effects';
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
  /** The plot is part of the map painting (era 3): only the hover ring is drawn. */
  private painted = false;

  constructor(scene: Phaser.Scene, readonly def: PlotDef, readonly index: number) {
    this.lift = def.high ? HIGH_GROUND_LIFT : 0;
    this.gfx = scene.add.graphics();
    const { x, y } = toScreen(def.x, def.y);
    const depth = depthOf(def.x, def.y) + 1;
    this.gfx.setPosition(x, y).setDepth(depth + 0.05);
    this.painted = !!eraLook().painted;
    const name = def.high ? eraLook().plotHigh : eraLook().plot;
    if (!this.painted && hasSprite(scene, name)) this.sprite = addSprite(scene, name, x, y - this.lift).setDepth(depth);
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
    if (this.painted) {
      // the map's square stone pads: a matching square outline
      if (this.hovered && !this.tower) {
        const w = 56, h = 28, y = -this.lift;
        const pts = [new Phaser.Math.Vector2(0, y - h), new Phaser.Math.Vector2(w, y), new Phaser.Math.Vector2(0, y + h), new Phaser.Math.Vector2(-w, y)];
        this.gfx.lineStyle(5, art.OUTLINE, 0.5).strokePoints(pts, true);
        this.gfx.lineStyle(3, 0xfff3b0, 0.95).strokePoints(pts, true);
      }
      return;
    }
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
    if (this.painted) { if (Math.abs(px - t.x) / 54 + Math.abs(py - t.y) / 27 <= 1) return true; }
    else { const dx = (px - t.x) / 32, dy = (py - t.y) / 17; if (dx * dx + dy * dy <= 1) return true; }
    return !!this.tower && Math.abs(px - t.x) < 24 && py < t.y && py > t.y - 70;
  }
}

// ---------- Enemy ----------
/** How an enemy dies on screen. */
export type DeathStyle = 'sink' | 'collapse' | 'topple' | 'machine' | 'buckle' | 'blast';
const DEATH: Record<string, DeathStyle> = {
  grunt: 'sink', shaman: 'sink', fast: 'collapse', armored: 'topple', brute: 'topple',
  robot: 'machine', shield: 'machine', droid: 'blast', walker: 'buckle', tank: 'machine',
  titan_s: 'sink', titan_m: 'sink', brawler: 'topple', wallwalker: 'topple', colossus: 'topple',
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
  /** An Era Studio tower's chill: seconds left, and the speed factor while it lasts. */
  chill = 0;
  chillFactor = 1;
  /** Tiles still to be pushed back by a blast. */
  knock = 0;
  /** Seconds since the enemy appeared: it climbs out of the ground / rolls out of the gate first. */
  age = 0;
  /** Direction of travel along the road (grid, unit length), for shields and facing. */
  headX = 1;
  headY = 0;
  /** The last hit was stopped by the riot shield (the scene draws a spark). */
  blocked = false;
  /** Era 3 boss armour bar: soaks damage before health (see EnemyDef.shell). */
  shell = 0;
  readonly maxShell: number;
  /**
   * Off-road moves driven by the scene (a brawler's leap onto a tower, a wall walker straying, the giant's charge):
   * a grid offset from the road position and a height above the ground. While `busy` it doesn't walk on.
   */
  offX = 0;
  offY = 0;
  lift = 0;
  busy = false;
  /** Towers the boss has already charged (it charges each tower once). */
  readonly charged = new Set<unknown>();
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
  /** Frame-by-frame animations made from the painted art (walk, attack, hit, death); used instead of the rig. */
  private sheet: SheetView | null = null;
  private lastHitAnim = -9;
  /** Seconds left of the attack at the end of the road (-1 = not there yet). */
  private endAttack = -1;

  constructor(private scene: Phaser.Scene, readonly def: EnemyDef, hpScale: number, readonly path: Path,
    opts: { lane?: number; group?: number } = {}) {
    this.maxHp = Math.round(def.hp * (def.boss ? 1 : hpScale));
    this.hp = this.maxHp;
    this.maxShell = this.shell = def.shell ?? 0;
    this.group = opts.group ?? 0;
    this.lane = this.laneTarget = def.boss ? 0 : opts.lane ?? (Math.random() * 2 - 1) * LANE_MAX;
    this.gfx = scene.add.graphics();
    const front = `enemy_${def.kind}` as SpriteName, back = `enemy_${def.kind}_back` as SpriteName;
    if (front in SPRITES && hasSprite(scene, front)) {
      this.frontMeta = SPRITES[front];
      this.sprite = addSprite(scene, front, 0, 0);
      if (back in SPRITES && hasSprite(scene, back)) this.backMeta = SPRITES[back];
      if (hasSheetAnims(scene, def.kind)) {
        this.sheet = new SheetView(scene, def.kind, !!this.frontMeta.facesLeft, !!this.backMeta?.facesLeft);
        this.sprite.setVisible(false);
      } else if (hasRig(scene, def.kind)) this.rig = new RigView(scene, def.kind, this.frontMeta.display[1]);
    }
    this.move(0);
  }

  get screen() { return toScreen(this.gx, this.gy); }
  /** Height of the body's centre above the feet, for aiming shots. */
  get bodyHeight() { return this.def.size * 2.3; }
  /** Current speed in tiles per second, after everything that slows or speeds it. */
  get speedNow() {
    if (this.hold > 0 || this.knock > 0 || this.busy) return 0;
    let v = this.def.speed * this.pace * this.behaviourPace();
    if (this.slow > 0 && !this.def.boss) v *= PELLET_SLOW.factor;
    if (this.chill > 0 && !this.def.boss) v *= this.chillFactor;
    if (this.brace > 0) v *= 0.7;
    return v;
  }

  /** Speed changes that are part of each enemy's character. */
  private behaviourPace(): number {
    const t = this.behaviourClock;
    switch (bk(this.def)) {
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
    this.sheet?.update(dt);
    // at the end of the road: swipes at the door before going in
    if (this.endAttack >= 0) {
      this.endAttack -= dt;
      this.flash = Math.max(0, this.flash - dt);
      this.draw();
      return this.endAttack <= 0;
    }
    this.behaviourClock += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.stagger = Math.max(0, this.stagger - dt);
    this.slow = Math.max(0, this.slow - dt);
    this.chill = Math.max(0, this.chill - dt);
    this.brace = Math.max(0, this.brace - dt);
    this.stumble = Math.max(0, this.stumble - dt);
    // zombies now and then trip over their own feet
    if ((bk(this.def) === 'grunt' || bk(this.def) === 'shaman') && this.stumble <= 0 && Math.random() < dt / 7) {
      this.stumble = 0.55;
      if (!this.rigAct) this.playRig('stumble');
    }
    if (this.rigAct) {
      this.rigAct.t += dt;
      if (this.rigAct.t >= (this.rig?.moves.acts[this.rigAct.name]?.dur ?? 0)) this.rigAct = null;
    }
    // droids weave from side to side
    if (bk(this.def) === 'droid') this.laneTarget = Math.sin(this.behaviourClock * 2.6) * LANE_MAX;

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
    this.gx = (a.gx + 2 * c.gx + b.gx) / 4 - ty * this.lane + this.offX;
    this.gy = (a.gy + 2 * c.gy + b.gy) / 4 + tx * this.lane + this.offY;

    const after = toScreen(this.gx, this.gy);
    const sdx = after.x - before.x, sdy = after.y - before.y;
    const moved = Math.hypot(sdx, sdy);
    // off-road moves (charges, strays) turn and stride the same way as walking
    if (moved > 0.05 && (step > 0 || this.busy)) {
      if (Math.abs(sdx) > 0.02) this.facing = sdx > 0 ? 1 : -1;
      // a little hysteresis so it doesn't flicker between front and back on level stretches
      if (sdy < -moved * 0.25) this.goingUp = true;
      else if (sdy > moved * 0.25) this.goingUp = false;
    }
    // the walk cycle follows the ground covered, so feet plant instead of sliding
    const meta = this.frontMeta;
    const stride = meta ? meta.display[0] * 0.55 : 18;
    if (step > 0 || this.busy) this.phase += (moved / stride) * Math.PI;
    const reached = this.distance >= this.path.length;
    if (reached && this.sheet?.has('attack')) {
      this.endAttack = this.sheet.play('attack');
      this.draw();
      return false;
    }
    this.draw();
    return reached;
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
  /** An Era Studio tower's chill: the strongest one wins; bosses can't be slowed. */
  chillFor(seconds: number, factor: number) {
    if (this.def.boss) return;
    if (this.chill <= 0 || factor <= this.chillFactor) this.chillFactor = factor;
    this.chill = Math.max(this.chill, seconds);
  }

  hit(amount: number, pellets = 1, from?: { gx: number; gy: number }, armorMult = 1): number {
    this.blocked = false;
    if (this.shell > 0) {
      // the armour bar takes the hit first (scaled by how well this weapon strips armour); what breaks through
      // after the bar is gone carries on into health
      const into = amount * armorMult;
      const soaked = Math.min(this.shell, into);
      this.shell -= soaked;
      this.flash = 0.07;
      if (this.age - this.lastSparks > 0.25) {
        this.lastSparks = this.age;
        const s = this.screen;
        sparkBurst(this.scene, s.x + (Math.random() - 0.5) * 40, s.y - this.bodyHeight * (0.4 + Math.random() * 0.6), depthOf(this.gx, this.gy) + 6, 0.6);
      }
      if (into <= soaked) return soaked;
      amount = (into - soaked) / armorMult;
    }
    if (bk(this.def) === 'shield' && from) {
      const fx = from.gx - this.gx, fy = from.gy - this.gy, fl = Math.hypot(fx, fy) || 1;
      if ((fx * this.headX + fy * this.headY) / fl > 0.3) { amount *= 1 - SHIELD_BLOCK; this.blocked = true; }
    }
    let armor = this.def.armor;
    if (pellets > 1) {
      // knights brace behind their armour when a shotgun opens up on them
      if (bk(this.def) === 'armored') { if (this.brace > 0) armor += 1; this.brace = 1.0; }
      if (!this.def.boss) this.slow = PELLET_SLOW.seconds;
    }
    const dealt = Math.max(1, pellets * Math.max(0, amount / pellets - armor));
    this.hp -= dealt;
    this.flash = 0.07;
    this.stagger = this.def.boss ? 0.05 : 0.12;
    if (this.rig && this.rigAct?.name !== 'blast' && this.rigAct?.name !== 'stumble') this.playRig('hit');
    // flinch now and then (not on every pellet, or it would never get to walk)
    if (this.sheet && !this.sheet.playing() && this.age - this.lastHitAnim > 1.2) { this.lastHitAnim = this.age; this.sheet.play('hit'); }
    if ((this.rig?.moves.hitFx === 'sparks' || (this.sheet && MACHINES.has(bk(this.def)))) && this.age - this.lastSparks > 0.3) {
      this.lastSparks = this.age;
      const s = this.screen;
      sparkBurst(this.scene, s.x + (Math.random() - 0.5) * 30, s.y - this.bodyHeight * (0.5 + Math.random() * 0.5), depthOf(this.gx, this.gy) + 6, 0.5);
    }
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

  private lastSparks = -1;

  /** Where the gun's muzzle is on screen right now (enemies whose rig has a muzzle), for the muzzle flash. */
  muzzleWorld() {
    if (this.sheet) return this.sheet.muzzle(this.screen.x, this.screen.y, this.facing);
    const m = this.rig?.moves.muzzle;
    return m && this.rig?.container.visible ? this.rig.pointOn(m.part, m.x, m.y, m.angle) : null;
  }

  /** Seconds into the attack animation when the shot goes off (0 = straight away). */
  get fireAt() { return this.sheet?.fireAt ?? 0; }

  /** Plays one of the rig's moves (attack, hit...) if this enemy has a rig. */
  /** Plays one of the enemy's moves; returns true when it has an animation for it. */
  playAct(name: string): boolean {
    this.playRig(name);
    if (this.sheet?.has(name)) { this.sheet.play(name); return true; }
    return !!this.rig?.moves.acts[name];
  }

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

  /** Frame-by-frame animation plus the code motions that still apply on top: stumble, hit stagger, entrance. */
  private drawSheet(x: number, y: number, depth: number) {
    const dir = this.facing;
    let rot = 0, dx = 0, dy = -this.lift, squashY = 1, alpha = 1;
    if (this.stumble > 0) rot += Math.sin((this.stumble / 0.55) * Math.PI) * 0.3 * dir;
    if (this.stagger > 0) { const k = this.stagger / 0.12; dx -= dir * 3 * k; }
    const enter = Math.min(1, this.age / 0.7);
    if (enter < 1) { dy += (1 - enter) * 22; squashY = 0.55 + 0.45 * enter; alpha = Math.min(1, enter * 2); }
    this.sheet!.draw({ x, y, depth, facing: dir, goingUp: this.goingUp && this.endAttack < 0, phase: this.phase,
      flash: this.flash > 0, rotation: rot, squashY, dx, dy, alpha });
  }

  private draw() {
    const { x, y } = toScreen(this.gx, this.gy);
    const g = this.gfx;
    const depth = depthOf(this.gx, this.gy) + 5;
    if (this.sheet && this.alive) {
      this.drawSheet(x, y, depth);
      const top = -this.sheet.bodyHeight - 8 - this.lift;
      g.clear().setPosition(x, y).setDepth(depth + 0.1);
      const sh = Math.max(0.3, 1 - this.lift / 160), sw = Math.max(30, this.def.size * 2.6);
      g.fillStyle(0x000000, 0.25 * sh).fillEllipse(0, 0, sw * sh, sw * 0.33 * sh);
      this.drawHpBar(g, top);
      return;
    }
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
        if (MACHINES.has(bk(this.def))) alpha = enter;
        else { py += (1 - enter) * h * 0.45; h *= 0.55 + 0.45 * enter; alpha = Math.min(1, enter * 2); }
      }
      sp.setPosition(px, py).setDepth(depth).setRotation(rot).setDisplaySize(w, h).setAlpha(alpha);
      sp.setFlipX(meta.facesLeft ? this.facing > 0 : this.facing < 0);
      if (this.flash > 0) sp.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      else if (this.chill > 0 && !this.def.boss) sp.setTint(0xb8dcff).setTintMode(Phaser.TintModes.MULTIPLY);
      else if (enter < 1 && MACHINES.has(bk(this.def))) sp.setTint(Phaser.Display.Color.GetColor(70 + 185 * enter, 70 + 185 * enter, 70 + 185 * enter)).setTintMode(Phaser.TintModes.MULTIPLY);
      else sp.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      top = -meta.display[1] - 8;
    } else {
      art.enemy(g, bk(this.def), this.phase, this.facing, this.flash > 0);
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
    const style = DEATH[bk(this.def)] ?? 'sink';
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
      return style === 'blast' ? 'machine' : style === 'buckle' || style === 'machine' ? style : 'sink';
    }
    if (this.sheet) {
      const { x, y } = this.screen;
      this.dying = true;
      sp?.destroy();
      this.sheet.playDeath(x, y, depthOf(this.gx, this.gy) + 5, this.facing);
      this.sheet = null;
      return style;
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
    if (!this.dying) { this.sprite?.destroy(); this.rig?.destroy(); this.sheet?.destroy(); }
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
  /** Animated archers (when their sheets loaded) and the soft shadow they cast on the platform. */
  private archerAnim: ArcherSheet | null = null;
  private archer2Anim: ArcherSheet | null = null;
  private archerShadow: Phaser.GameObjects.Graphics | null = null;
  /** Where the archer stands on the static art (used when the tower has no animated sheet). */
  private staticFeet = { x: 0, y: 0 };
  /** The unit on an arrow-type tower: the archer, or an Era Studio era's own unit (a wizard, say). */
  private unitSprite: SpriteName = 'archer' as SpriteName;
  /** An Era Studio era's arrow-type tower: its own art, its unit stands on the spot marked for each level. */
  private eraUnitTower = false;
  /** Total gold put into this tower (build plus upgrades), for the sell refund. */
  spent: number;

  /** Upgrade level, 1 to 3. */
  level = 1;
  /** Era Studio towers with per-level attacks: shots fired (for "every Nth shot" specials) and seconds to the next timed special. */
  shots = 0;
  specialIn = 0;
  private gun: Phaser.GameObjects.Image | null = null;
  /** Frame-by-frame animations for the gun image and (arrow tower) the base, when sheets exist for this kind. */
  private anim: TowerSheet | null = null;
  private baseAnim: TowerSheet | null = null;

  constructor(private scene: Phaser.Scene, readonly def: TowerDef, readonly plot: Plot) {
    this.spent = def.cost;
    this.gfx = scene.add.graphics();
    const t = plot.top;
    const depth = depthOf(plot.def.x, plot.def.y) + 4;
    this.gfx.setPosition(t.x, t.y).setDepth(depth);
    const first = TOWER_SPRITES[def.kind]?.[0];
    const isArrow = bk(def) === 'arrow';
    const unit = towerUnit(def.kind);
    const lvUnit = levelSpec(def, 1)?.unit ?? unit;
    if (lvUnit && hasSprite(scene, lvUnit.sprite as SpriteName)) this.unitSprite = lvUnit.sprite as SpriteName;
    this.eraUnitTower = isArrow && !!dataEra(ERA_ID)?.towers[def.kind];
    this.usesSprite = !!first && hasSprite(scene, first) && (!isArrow || hasSprite(scene, this.unitSprite));
    if (TOWER_HP[bk(def)]) {
      this.maxHp = this.hp = TOWER_HP[bk(def)];
      this.hpBar = scene.add.graphics().setDepth(depth + 0.6);
    }
    if (this.usesSprite && this.eraUnitTower) this.buildUnitSprites(t.x, t.y, depth);
    else if (this.usesSprite && isArrow) this.buildArrowSprites(t.x, t.y, depth);
    else if (this.usesSprite) {
      this.gun = addSprite(scene, first, t.x, t.y).setDepth(depth);
      this.anim = TowerSheet.tryCreate(scene, this.gun, def.kind, 1);
    } else this.draw();
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
    if (TOWER_HP[bk(this.def)]) {
      // upgrading reinforces the tower: the extra maximum health comes on top of what it has left
      const max = Math.round(TOWER_HP[bk(this.def)] * TOWER_HP_LEVEL[this.level - 1]);
      this.hp += max - this.maxHp;
      this.maxHp = max;
      this.drawHp();
    }
    if (!this.usesSprite) return;
    this.anim?.setLevel(this.level);
    this.baseAnim?.setLevel(this.level);
    const meta: SpriteMeta = SPRITES[this.levelSprite()];
    for (const img of [this.base, this.front, this.gun]) {
      // images driven by animated sheets keep their sheet texture; the others swap to the level's static art
      if (img && ((img === this.gun && this.anim) || (img !== this.gun && this.baseAnim))) continue;
      img?.setTexture(meta.key).setOrigin(meta.origin[0], meta.origin[1]).setDisplaySize(meta.display[0], meta.display[1]);
    }
    this.syncFront();
    if (hasLevels(this.def)) this.levelUnits();
    else if (this.level >= 3 && this.archer && !this.archer2) this.addSecondArcher();
    this.placeArchers();
    if (!hasLevels(this.def) && this.level >= 3 && bk(this.def) === 'gun' && this.gun && !this.shield) this.shield = new ForceField(this.scene, this.gun);
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
    this.staticFeet = { ...this.archerHome };
    this.archerShadow = this.scene.add.graphics().setDepth(depth + 0.05);
    this.archer = addSprite(this.scene, 'archer', this.archerHome.x, this.archerHome.y).setDepth(depth + 0.1);
    if (ArcherSheet.available(this.scene)) this.archerAnim = new ArcherSheet(this.archer);
    const tex = this.base.texture.getSourceImage() as HTMLImageElement;
    const [b0, b1] = ARROW_TOWER.frontBand;
    this.front = addSprite(this.scene, 'tower_arrow', x, y).setDepth(depth + 0.2)
      .setCrop(0, tex.height * b0, tex.width, tex.height * (b1 - b0));
    this.baseAnim = TowerSheet.tryCreate(this.scene, this.base, 'arrow', 1);
    this.syncFront();
    this.placeArchers();
    // gentle breathing while waiting for targets (the animated archer breathes in his idle)
    if (!this.archerAnim) this.idle = this.breathe(this.archer, this.archerHome);
  }

  /** An Era Studio era's arrow-type tower: its own art with its unit (or the archer) standing on top. */
  private buildUnitSprites(x: number, y: number, depth: number) {
    this.base = addSprite(this.scene, this.levelSprite(), x, y).setDepth(depth);
    this.staticFeet = this.unitFeetPoint();
    this.archerHome = { ...this.staticFeet };
    this.archerShadow = this.scene.add.graphics().setDepth(depth + 0.05);
    this.archer = addSprite(this.scene, this.unitSprite, this.archerHome.x, this.archerHome.y).setDepth(depth + 0.1);
    const key = this.unitAnimKey();
    if (key) this.archerAnim = new ArcherSheet(this.archer, key);
    this.placeArchers();
    if (!this.archerAnim) this.idle = this.breathe(this.archer, this.archerHome);
  }

  /** The unit's animation sheet: the era's own when it has one, the archer's for the archer, else none. */
  private unitAnimKey(): string | null {
    const u = levelSpec(this.def, this.level)?.unit ?? towerUnit(this.def.kind);
    if (u && this.unitSprite === u.sprite) return u.anim && ArcherSheet.available(this.scene, u.anim) ? u.anim : null;
    return ArcherSheet.available(this.scene) ? 'archer' : null;
  }

  /** Where the unit's feet go on the current level's art: the era's marked spot, else near the top of the art. */
  private unitFeetPoint() {
    const b = this.base!;
    const feet = towerUnit(this.def.kind)?.feet ?? [];
    const f = feet[this.level - 1] ?? feet[feet.length - 1] ?? [0.5, 0.14];
    return { x: b.x + (f[0] - b.originX) * b.displayWidth, y: b.y + (f[1] - b.originY) * b.displayHeight };
  }

  /**
   * Stands the archers on this level's platform, just behind the front battlements: the animated tower records
   * where the platform floor is, so each level puts them on its own floor. Level 3 has two side by side.
   */
  private placeArchers() {
    if (!this.archer || !this.base) return;
    const feet = this.baseAnim?.feet;
    let fx = this.staticFeet.x, fy = this.staticFeet.y;
    if (this.eraUnitTower) ({ x: fx, y: fy } = this.unitFeetPoint());
    else if (feet) {
      const b = this.base;
      fx = b.x + (feet[0] - b.originX) * b.displayWidth;
      fy = b.y + (feet[1] - b.originY) * b.displayHeight;
    }
    const pair = !!this.archer2;
    this.archerHome = { x: pair ? fx - 10.5 : fx, y: fy };
    this.archer2Home = { x: fx + 10.5, y: fy };
    for (const [a, home] of [[this.archer, this.archerHome], [this.archer2, this.archer2Home]] as const) {
      if (!a) continue;
      this.scene.tweens.killTweensOf(a);
      a.setPosition(home.x, home.y);
      if (!this.archerAnim) this.breathe(a, home, a === this.archer2 ? 300 : 0);
    }
    // a soft shadow under each archer's feet ties him to the platform floor
    const g = this.archerShadow;
    if (g) {
      g.clear().fillStyle(0x1a0f08, 0.32);
      for (const home of pair ? [this.archerHome, this.archer2Home] : [this.archerHome]) g.fillEllipse(home.x, home.y - 1, 17, 5);
    }
  }

  /**
   * Era Studio towers with per-level units: this level's unit (a new model and animations when the level has its
   * own), and one or two of them as the level says.
   */
  private levelUnits() {
    if (!this.archer) return;
    const L = levelSpec(this.def, this.level);
    const u = L?.unit;
    if (u && hasSprite(this.scene, u.sprite as SpriteName) && u.sprite !== this.unitSprite) {
      this.unitSprite = u.sprite as SpriteName;
      const key = this.unitAnimKey();
      for (const a of [this.archer, this.archer2]) {
        if (!a) continue;
        this.scene.tweens.killTweensOf(a);
        const m = SPRITES[this.unitSprite];
        a.setTexture(m.key).setOrigin(m.origin[0], m.origin[1]).setDisplaySize(m.display[0], m.display[1]);
      }
      this.archerAnim = key ? new ArcherSheet(this.archer, key) : null;
      this.archer2Anim = key && this.archer2 ? new ArcherSheet(this.archer2, key) : null;
    }
    const want = L?.units ?? 1;
    if (want >= 2 && !this.archer2) this.addSecondArcher();
    if (want < 2 && this.archer2) {
      this.scene.tweens.killTweensOf(this.archer2);
      this.archer2.destroy(); this.archer2 = null; this.archer2Anim = null;
      this.archer.setFlipX(false);
    }
  }

  private addSecondArcher() {
    const a = this.archer!;
    // the two archers stand side by side on the platform (placeArchers puts them there)
    // back to back, each watching his own side, so their bows don't cross over the middle of the platform
    a.setFlipX(true);
    this.archer2 = addSprite(this.scene, this.unitSprite, this.archerHome.x + 19, this.archerHome.y)
      .setDepth(a.depth + 0.05).setFlipX(false);
    if (this.archerAnim) this.archer2Anim = new ArcherSheet(this.archer2, this.archerAnim.key);
  }

  private breathe(img: Phaser.GameObjects.Image, home: { y: number }, delay = 0) {
    return this.scene.tweens.add({
      targets: img, y: home.y - 1, duration: 900, delay, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  /** Screen point at the very top of the tower art (where grapple lines run from, where a leaping brawler lands). */
  get topPoint() {
    const img = this.gun ?? this.base;
    if (!img) { const t = this.plot.top; return { x: t.x, y: t.y - 80 }; }
    const b = img.getBounds();
    return { x: img.x, y: b.y + b.height * 0.06 };
  }
  /** A hard knock (a titan slamming into the base): the tower shudders. */
  shudder() {
    const img = this.gun ?? this.base;
    if (!img) return;
    const x0 = this.plot.top.x;
    this.scene.tweens.killTweensOf(img);
    img.setX(x0).setAngle(0);
    this.scene.tweens.chain({ targets: img, tweens: [
      { x: x0 - 4, angle: -1.5, duration: 50, ease: 'Quad.easeOut' },
      { x: x0 + 3, angle: 1, duration: 70, ease: 'Sine.easeInOut' },
      { x: x0 - 1.5, angle: -0.4, duration: 70, ease: 'Sine.easeInOut' },
      { x: x0, angle: 0, duration: 90, ease: 'Sine.easeOut' },
    ] });
  }

  /** The tower's main image (for effects that move or tint the whole tower). */
  get image() { return this.gun ?? this.base; }

  get tx() { return this.plot.def.x; }
  get ty() { return this.plot.def.y; }
  /** Screen height (above the plot's ground) where shots leave the tower. */
  get muzzle() {
    if (this.gun) return -GUN_MUZZLE[this.def.kind].y + this.plot.lift;
    if (this.usesSprite) {
      // the bow, about 60% up the archer from where he stands
      const archerH = this.archerAnim?.size[1] ?? SPRITES[this.unitSprite].display[1];
      return this.plot.top.y - this.archerHome.y + archerH * 0.6 + this.plot.lift;
    }
    return art.towerMuzzleHeight(bk(this.def)) + this.plot.lift;
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
    if (this.def.crew) return;
    this.anim?.fire();
    if (this.gun) return this.kickGun(targetScreenX);
    if (this.archer) this.drawBow(this.archer, this.archerHome, targetScreenX, this.archerAnim);
  }

  /** Level 3 arrow towers: the second archer's shot. */
  shootSecond(targetScreenX: number) {
    if (this.archer2) this.drawBow(this.archer2, this.archer2Home, targetScreenX, this.archer2Anim);
  }

  /** An Era Studio tower's special: the unit plays its cast animation (or its shot when it has none). */
  cast(targetScreenX: number) {
    if (this.def.crew) return;
    if (this.archer && this.archerAnim) {
      this.archer.setFlipX(targetScreenX < this.archerHome.x);
      return this.archerAnim.cast(Math.max(this.cooldown, 0.6));
    }
    this.shoot(targetScreenX);
  }

  /** Archer faces the target, pulls back, snaps forward, then goes back to breathing. */
  private drawBow(a: Phaser.GameObjects.Image, home: { x: number; y: number }, targetScreenX: number, anim: ArcherSheet | null) {
    a.setFlipX(targetScreenX < home.x);
    if (anim) return anim.shoot(this.cooldown || Infinity);   // the animation is the shot: release, new arrow, draw
    const sx = SPRITES[this.unitSprite].display[0], sy = SPRITES[this.unitSprite].display[1];
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
    const [w, h] = this.anim?.size ?? SPRITES[this.levelSprite()].display;
    const back = (g.flipX ? 1 : -1) * (m.facesLeft ? -1 : 1) * 2;
    this.scene.tweens.killTweensOf(g);
    g.setPosition(home.x, home.y).setDisplaySize(w, h).setAngle(0);
    if (bk(this.def) === 'mg') return this.shotgunKick(g, w, h, back, home);
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

  /** Advances the frame-by-frame animations; called every frame, waves or not, so towers never freeze. */
  tickAnim(dt: number) {
    this.anim?.update(dt);
    if (this.baseAnim) {
      this.baseAnim.update(dt);
      this.syncFront();
    }
    this.archerAnim?.update(dt);
    this.archer2Anim?.update(dt);
  }

  /** Arrow tower: the front parapet mirrors the animated base's frame, cropped to the parapet band. */
  private syncFront() {
    if (!this.front || !this.base || !this.baseAnim) return;
    const f = this.front, b = this.base;
    const occluder = this.baseAnim.frontKey;
    if (occluder) {
      // the occluder sheet holds only the front battlements and rim, frame for frame with the base
      if (f.texture.key !== occluder) f.setTexture(occluder, b.frame.name).setCrop();
      else if (f.frame.name !== b.frame.name) f.setFrame(b.frame.name);
      f.setOrigin(b.originX, b.originY).setDisplaySize(b.displayWidth, b.displayHeight);
      return;
    }
    if (f.texture.key !== b.texture.key || f.frame.name !== b.frame.name) {
      f.setTexture(b.texture.key, b.frame.name)
        .setOrigin(b.originX, b.originY)
        .setDisplaySize(b.displayWidth, b.displayHeight);
    }
    const [b0, b1] = this.baseAnim.band ?? ARROW_TOWER.frontBand;
    const fh = f.frame.height;
    f.setCrop(0, fh * b0, f.frame.width, fh * (b1 - b0));
  }

  draw() {
    if (this.usesSprite) return;
    this.gfx.clear();
    art.tower(this.gfx, bk(this.def), this.aim, this.recoil);
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
    this.anim?.setDamaged(this.hp / this.maxHp);
    this.hitFlash = 0.12;
    const img = this.gun ?? this.base;
    if (img && !this.shield) img.setTint(0xff8a7a);
    this.drawHp();
    return dmg;
  }

  repairFull() {
    this.hp = this.maxHp;
    this.anim?.setDamaged(1);
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
    this.archerShadow?.destroy();
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
  kind: 'arrow' | 'shell' | 'rocket' | 'bolt' | 'lance' | 'rock' | 'orb';
  /** Era 3: how well this shot strips the boss's armour bar (see TowerDef.armorMult). */
  armorMult?: number;
  /** Ballista level 2+: the bolt carries on into the titan behind the one it hits. */
  pierce?: boolean;
  /** Seconds until the next exhaust puff (rockets). */
  smokeIn?: number;
  last?: { x: number; y: number };
  /** The tower kind that fired it: an Era Studio era may give its shots their own look (src/eraFx.ts). */
  tower?: string;
  /** An Era Studio level shot: the look for this level (or its special) and what it does (src/levels.ts). */
  fx?: TowerFx;
  blocks?: Blocks;
  /** A travelling shot (the `line` block): how wide it hits, and who it has hit already. */
  line?: { width: number; hit: Set<Enemy> };
  /** That look's sprite, made on the first frame of flight. */
  img?: Phaser.GameObjects.Image;
  glowImg?: Phaser.GameObjects.Image;
  trailIn?: number;
}
