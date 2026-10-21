// The titan killer tower's crew (era 3). Fighters wait on top of the tower; when a titan comes within range one
// swings out on grapple lines, slashes at the back of its neck and swings back. Regular titans swat at a fighter
// at their neck: a hit flings the fighter back to the tower, stunned for a moment. Level 2 adds a second fighter
// who strikes the same titan from the other side; at level 3 that fighter takes up a rocket lance instead and
// fires it at titans far down the road.
import Phaser from 'phaser';
import { KILLER } from './config';
import type { Enemy, Tower } from './entities';
import { depthOf } from './iso';
import { SPRITES, hasSprite } from './sprites';
import { SheetCycle } from './crewAnim';

/** What the crew needs from the game scene. */
export interface CrewHost {
  /** Titans the crew can reach, most dangerous (furthest along the road) first. */
  targets(range: number): Enemy[];
  /** Damage of one slash (level and upgrades applied). */
  slashDamage(): number;
  /** Seconds between a fighter's sorties. */
  restDelay(): number;
  /** Deals a slash's damage to a titan. */
  hit(e: Enemy, amount: number): void;
  /** Fires a rocket lance warhead from a screen point at a titan. */
  fireLance(x: number, y: number, target: Enemy): void;
  /** Range of the blades (tiles), and of the lance. */
  range(): number;
  sound(id: 'swing' | 'slash' | 'swat' | 'lance'): void;
  fxDepth: number;
}

type State = 'home' | 'out' | 'strike' | 'back' | 'flung' | 'stunned';

class Fighter {
  readonly img: Phaser.GameObjects.Image;
  state: State = 'home';
  t = 0;
  rest = Math.random() * 0.6;
  target: Enemy | null = null;
  /** Which side of the titan's neck this fighter goes for (+1 right, -1 left on screen). */
  side = 1;
  from = { x: 0, y: 0 };
  x = 0; y = 0;
  /** Did this strike's swat already get decided. */
  swatDone = false;
  swatted = false;
  lance = false;
  lanceRest = 1.5;
  stars: Phaser.GameObjects.Graphics | null = null;
  anim: SheetCycle | null = null;

  constructor(scene: Phaser.Scene, public home: { x: number; y: number }, depth: number) {
    const m = SPRITES.e3_hunter;
    this.img = scene.add.image(home.x, home.y, m.key).setOrigin(m.origin[0], m.origin[1]).setDisplaySize(m.display[0], m.display[1]).setDepth(depth);
    this.x = home.x; this.y = home.y;
    this.anim = SheetCycle.tryCreate(scene, this.img);
  }
}

export class KillerCrew {
  private fighters: Fighter[] = [];
  private lines: Phaser.GameObjects.Graphics;
  private fx: Phaser.GameObjects.Graphics;
  private level = 0;
  private clock = 0;

  constructor(private scene: Phaser.Scene, private tower: Tower, private host: CrewHost) {
    this.lines = scene.add.graphics();
    this.fx = scene.add.graphics();
    this.setLevel(tower.level);
  }

  static available(scene: Phaser.Scene) { return hasSprite(scene, 'e3_hunter'); }

  private get towerDepth() { return depthOf(this.tower.tx, this.tower.ty) + 4; }

  /** Where each fighter waits: on the top platform, and at level 2 and up the second on the side platform. */
  private homes() {
    const top = this.tower.topPoint, base = this.tower.plot.top;
    const h = base.y - top.y;
    return [
      { x: top.x - 4, y: top.y + h * 0.13 },
      { x: top.x + 14, y: top.y + h * 0.36 },
    ];
  }

  setLevel(level: number) {
    this.level = level;
    const want = level >= 2 ? 2 : 1;
    const homes = this.homes();
    while (this.fighters.length < want) this.fighters.push(new Fighter(this.scene, homes[this.fighters.length], this.towerDepth + 0.3));
    this.fighters.forEach((f, i) => {
      f.home = homes[i];
      if (f.state === 'home' || f.state === 'stunned') { f.x = f.home.x; f.y = f.home.y; }
    });
    // level 3: the second fighter takes up the rocket lance, standing at the very top to aim over the roofs
    if (level >= 3 && this.fighters[1]) {
      const f = this.fighters[1];
      f.lance = true;
      f.home = { x: homes[0].x + 10, y: homes[0].y + 1 };
      if (f.state === 'home') { f.x = f.home.x; f.y = f.home.y; }
      if (!f.anim && hasSprite(this.scene, 'e3_hunter_lance')) {
        const m = SPRITES.e3_hunter_lance;
        f.img.setTexture(m.key).setOrigin(m.origin[0], m.origin[1]).setDisplaySize(m.display[0], m.display[1]);
      }
    }
  }

  update(dt: number) {
    this.clock += dt;
    const lines = this.lines.clear().setDepth(this.towerDepth + 0.2);
    this.fx.clear().setDepth(this.host.fxDepth);
    const anchor = this.tower.topPoint;
    const ready = this.fighters.filter(f => f.state === 'home' && !f.lance && f.rest <= 0);
    for (const f of this.fighters) {
      f.t += dt;
      if (f.state === 'home') f.rest -= dt;
      if (f.lance) this.updateLance(f, dt);
      else this.updateBlade(f, dt, anchor);
      f.anim?.update(dt, f.lance ? 'lance_idle' : f.state === 'home' || f.state === 'stunned' ? 'idle' : f.state === 'strike' ? 'slash' : 'swing');
      this.place(f);
      // grapple lines: one from the tower top, and once it has hooked on, one into the titan's shoulder
      if (f.state === 'out' || f.state === 'strike' || f.state === 'back' || f.state === 'flung') {
        const midY = f.y - 12;
        this.cable(lines, anchor.x, anchor.y + 4, f.x, midY, f.state === 'flung' ? 0.5 : 1);
        if ((f.state === 'strike' || (f.state === 'out' && f.t > KILLER.swingOut * 0.45)) && f.target?.alive) {
          const s = f.target.screen;
          this.cable(lines, f.x, midY, s.x - f.side * 6, s.y - f.target.bodyHeight * 0.75 - f.target.lift, 1);
        }
      }
    }
    // level 2: the pair strikes together, from both sides of the same titan
    if (ready.length) {
      const target = this.host.targets(this.host.range())[0];
      if (target) {
        let side = Math.random() < 0.5 ? 1 : -1;
        ready.forEach((f, i) => {
          this.scene.time.delayedCall(i * 160, () => { if (f.state === 'home') this.launch(f, target, side * (i % 2 ? -1 : 1)); });
        });
        side = -side;
      }
    }
  }

  private launch(f: Fighter, target: Enemy, side: number) {
    if (!target.alive) return;
    f.state = 'out'; f.t = 0; f.target = target; f.side = side;
    f.from = { x: f.x, y: f.y };
    f.swatDone = false; f.swatted = false;
    this.host.sound('swing');
  }

  /** Where the fighter hangs at a titan's neck: just behind the head, on his side. */
  private neck(e: Enemy, side: number) {
    const s = e.screen;
    return { x: s.x + side * Math.max(12, e.def.size * 1.1), y: s.y - e.bodyHeight * 0.9 - e.lift + 14 };
  }

  private updateBlade(f: Fighter, dt: number, anchor: { x: number; y: number }) {
    const K = KILLER;
    if (f.state === 'out' || f.state === 'strike') {
      // the titan died on the way: pick another in reach, or swing back
      if (!f.target?.alive) {
        const next = this.host.targets(this.host.range() * 1.15)[0];
        if (next) { f.target = next; if (f.state === 'strike') { f.state = 'out'; f.t = K.swingOut * 0.5; f.from = { x: f.x, y: f.y }; } }
        else { this.goBack(f); return; }
      }
    }
    switch (f.state) {
      case 'home': {
        // breathing on the platform, facing the road
        f.x = f.home.x; f.y = f.home.y + Math.sin(this.clock * 2 + f.home.x) * 0.6;
        break;
      }
      case 'out': {
        const k = Math.min(1, f.t / K.swingOut);
        const to = this.neck(f.target!, f.side);
        // a pendulum swing under the grapple: dips low mid-swing, then rises to the neck
        const e = Phaser.Math.Easing.Sine.InOut(k);
        const cx = (f.from.x + to.x) / 2, cy = Math.max(f.from.y, to.y) + 50;
        f.x = (1 - e) ** 2 * f.from.x + 2 * (1 - e) * e * cx + e * e * to.x;
        f.y = (1 - e) ** 2 * f.from.y + 2 * (1 - e) * e * cy + e * e * to.y;
        f.img.setRotation(Phaser.Math.Clamp((to.x - f.from.x) / 300, -0.6, 0.6) * Math.sin(k * Math.PI) * (f.anim ? 0.5 : 1));
        if (k >= 1) { f.state = 'strike'; f.t = 0; }
        break;
      }
      case 'strike': {
        const k = Math.min(1, f.t / K.strike);
        const at = this.neck(f.target!, f.side);
        // a quick spin around the neck, blades out
        f.x = at.x + Math.sin(k * Math.PI * 2) * 10 * -f.side;
        f.y = at.y - Math.sin(k * Math.PI) * 8;
        f.img.setRotation(f.anim ? 0 : k * Math.PI * 2 * f.side);
        const kind = f.target!.def.kind;
        if (!f.swatDone && k > 0.15) {
          f.swatDone = true;
          const chance = K.swat[kind];
          if (chance !== undefined) {
            // the titan swats at whatever is at its neck
            f.target!.playAct('attack');
            f.swatted = Math.random() < chance;
          }
        }
        if (f.swatted && k > 0.4) { this.fling(f); break; }
        if (k > 0.55 && !f.swatted && f.t - dt < K.strike * 0.55) {
          this.host.hit(f.target!, this.host.slashDamage());
          this.host.sound('slash');
          this.slashFx(at.x, at.y, f.side);
        }
        if (k >= 1) this.goBack(f);
        break;
      }
      case 'back': {
        const k = Math.min(1, f.t / K.swingBack);
        const e = Phaser.Math.Easing.Sine.InOut(k);
        const to = f.home;
        const cx = (f.from.x + to.x) / 2, cy = Math.max(f.from.y, to.y) + 40;
        f.x = (1 - e) ** 2 * f.from.x + 2 * (1 - e) * e * cx + e * e * to.x;
        f.y = (1 - e) ** 2 * f.from.y + 2 * (1 - e) * e * cy + e * e * to.y;
        f.img.setRotation((1 - k) * 0.4 * -f.side);
        if (k >= 1) { f.state = 'home'; f.t = 0; f.rest = this.host.restDelay(); f.img.setRotation(0); f.target = null; }
        break;
      }
      case 'flung': {
        // swatted: tumbling back through the air to the tower
        const k = Math.min(1, f.t / 0.5);
        const e = (1 - (1 - k) * (1 - k));
        f.x = f.from.x + (f.home.x - f.from.x) * e;
        f.y = f.from.y + (f.home.y - f.from.y) * e - Math.sin(k * Math.PI) * 40;
        f.img.setRotation(k * Math.PI * 5 * -f.side);
        if (k >= 1) {
          f.state = 'stunned'; f.t = 0; f.img.setRotation(0);
          this.scene.cameras.main.shake(90, 0.003);
        }
        break;
      }
      case 'stunned': {
        f.x = f.home.x; f.y = f.home.y;
        this.drawStars(f);
        if (f.t >= KILLER.stun) {
          f.state = 'home'; f.t = 0; f.rest = 0.3;
          f.stars?.destroy(); f.stars = null;
          f.img.clearTint();
        }
        break;
      }
    }
    void anchor;
  }

  private goBack(f: Fighter) {
    f.state = 'back'; f.t = 0; f.from = { x: f.x, y: f.y };
  }

  private fling(f: Fighter) {
    f.state = 'flung'; f.t = 0; f.from = { x: f.x, y: f.y };
    this.host.sound('swat');
    // a smack: a white burst where the hand connects
    const g = this.scene.add.graphics().setDepth(this.host.fxDepth + 1).setPosition(f.x, f.y - 10);
    g.fillStyle(0xffffff, 0.95).fillCircle(0, 0, 10);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.lineStyle(3, 0xfff3b0, 1).lineBetween(Math.cos(a) * 10, Math.sin(a) * 10, Math.cos(a) * 22, Math.sin(a) * 22);
    }
    this.scene.tweens.add({ targets: g, scale: 1.6, alpha: 0, duration: 260, onComplete: () => g.destroy() });
    f.img.setTint(0xb0a8a0);
  }

  /** Little stars circling a stunned fighter's head. */
  private drawStars(f: Fighter) {
    if (!f.stars) f.stars = this.scene.add.graphics();
    const g = f.stars.clear().setDepth(this.towerDepth + 0.5);
    const cy = f.y - SPRITES.e3_hunter.display[1] - 4;
    for (let i = 0; i < 3; i++) {
      const a = this.clock * 5 + (i / 3) * Math.PI * 2;
      const x = f.x + Math.cos(a) * 10, y = cy + Math.sin(a) * 3;
      // a little four-pointed twinkle
      g.fillStyle(0xffe08a, 1).fillTriangle(x - 4, y, x + 4, y, x, y - 1.2).fillTriangle(x - 4, y, x + 4, y, x, y + 1.2)
        .fillTriangle(x, y - 4, x, y + 4, x - 1.2, y).fillTriangle(x, y - 4, x, y + 4, x + 1.2, y);
      g.fillStyle(0xfffbe8, 1).fillCircle(x, y, 1.2);
    }
  }

  private updateLance(f: Fighter, dt: number) {
    f.x = f.home.x; f.y = f.home.y;
    f.lanceRest -= dt;
    if (f.state === 'stunned') return;
    if (f.lanceRest > 0) return;
    const target = this.host.targets(KILLER.lance.range)[0];
    if (!target) { f.lanceRest = 0.25; return; }
    f.lanceRest = KILLER.lance.cooldown;
    // recoil: the fighter is jolted back as the warhead blasts off
    const s = target.screen, dir = s.x < f.x ? -1 : 1;
    f.img.setFlipX(dir < 0);
    f.anim?.fire();
    const mx = f.x + dir * 14, my = f.y - 22;
    this.host.fireLance(mx, my, target);
    this.host.sound('lance');
    this.scene.tweens.add({ targets: f.img, x: f.x - dir * 4, duration: 70, yoyo: true, ease: 'Quad.easeOut' });
  }

  private place(f: Fighter) {
    const depth = f.state === 'home' || f.state === 'stunned' ? this.towerDepth + 0.3
      : Math.max(this.towerDepth, f.target ? depthOf(f.target.gx, f.target.gy) + 5 : 0) + 3;
    if (f.state === 'home' || f.state === 'stunned' || f.lance) {
      // face the road: towards the current target, or towards the screen's middle
      const t = f.target ?? this.host.targets(this.host.range() * 1.4)[0];
      if (t) f.img.setFlipX(t.screen.x < f.x);
    } else if (f.target) f.img.setFlipX(f.target.screen.x < f.x === (f.state !== 'back'));
    f.img.setPosition(f.x, f.y).setDepth(depth);
    f.anim?.apply();
  }

  /** A grapple line: dark core with a glint, slightly slack. */
  private cable(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, alpha: number) {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + Math.min(18, Math.hypot(x1 - x0, y1 - y0) * 0.06);
    const curve = new Phaser.Curves.QuadraticBezier(new Phaser.Math.Vector2(x0, y0), new Phaser.Math.Vector2(mx, my), new Phaser.Math.Vector2(x1, y1));
    const pts = curve.getPoints(12);
    g.lineStyle(2.4, 0x1c1712, 0.85 * alpha).strokePoints(pts);
    g.lineStyle(1, 0xd9d4c8, 0.6 * alpha).strokePoints(pts);
  }

  /** The slash: two white crescents across the neck, a spray of blood and a puff of titan steam. */
  private slashFx(x: number, y: number, side: number) {
    const s = this.scene;
    const g = s.add.graphics().setDepth(this.host.fxDepth + 1).setPosition(x, y);
    for (const [r, w, a0] of [[18, 4, -0.9], [24, 3, -0.6]] as [number, number, number][]) {
      g.lineStyle(w + 2, 0x6fd3ff, 0.35).beginPath().arc(0, 0, r, a0 * side, (a0 + 1.9) * side, side < 0).strokePath();
      g.lineStyle(w, 0xffffff, 0.95).beginPath().arc(0, 0, r, a0 * side, (a0 + 1.9) * side, side < 0).strokePath();
    }
    s.tweens.add({ targets: g, alpha: 0, scale: 1.25, duration: 220, onComplete: () => g.destroy() });
    // blood: a few droplets thrown out and falling
    for (let i = 0; i < 9; i++) {
      const d = s.add.graphics().setDepth(this.host.fxDepth).setPosition(x, y);
      d.fillStyle(i % 3 ? 0xa3161b : 0x6e0c10, 0.95).fillCircle(0, 0, 1.6 + Math.random() * 2);
      const vx = (Math.random() - 0.3) * -side * 70, vy = -40 - Math.random() * 60;
      s.tweens.add({ targets: d, x: x + vx * 0.5, y: y + vy * 0.3 + 40, alpha: 0, duration: 450 + Math.random() * 200, ease: 'Quad.easeIn', onComplete: () => d.destroy() });
    }
    // steam rising from the cut
    for (let i = 0; i < 4; i++) {
      const p = s.add.graphics().setDepth(this.host.fxDepth).setPosition(x + (Math.random() - 0.5) * 10, y);
      p.fillStyle(0xf2efe8, 0.7).fillCircle(0, 0, 5 + Math.random() * 3);
      s.tweens.add({ targets: p, y: y - 30 - Math.random() * 20, scale: 2.2, alpha: 0, duration: 800 + Math.random() * 300, delay: i * 60, onComplete: () => p.destroy() });
    }
  }

  destroy() {
    for (const f of this.fighters) { f.img.destroy(); f.stars?.destroy(); }
    this.lines.destroy();
    this.fx.destroy();
  }
}
