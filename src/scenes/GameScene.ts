import Phaser from 'phaser';
import {
  ENEMIES, GAME_H, GAME_W, HP_SCALE_PER_WAVE, MAP_SIZE, PATH_WAYPOINTS, PUZZLE_EVERY, SELL_REFUND,
  START_GOLD, START_LIVES, TILE_H, TILE_W, TOWER_ORDER, TOWERS, TowerKind, WAVES, waveClearBonus,
} from '../config';
import { Enemy, P, Path, Projectile, Tower, shade } from '../entities';
import { depthOf, rangeEllipse, toGrid, toScreen } from '../iso';
import {
  Modifiers, PityTracker, RewardTier, UpgradeOption, applyOption, failurePick, freshModifiers, isUnlocked, rollDraft,
} from '../upgrades';

type Phase = 'build' | 'wave' | 'draft' | 'over';
interface PendingSpawn { at: number; kind: keyof typeof ENEMIES }

const UI_DEPTH = 5000;
const OVERLAY_DEPTH = 9000;
const FONT = '"Trebuchet MS", Verdana, sans-serif';
const TIER_COLOR = { bronze: 0xc98a4b, silver: 0xbfc7d1, gold: 0xf2c94c } as const;

export class GameScene extends Phaser.Scene {
  // run state (survives a map restart)
  private campaignLives = 3;

  // map state
  private path!: Path;
  private pathTiles!: Set<string>;
  private towers = new Map<string, Tower>();
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private spawns: PendingSpawn[] = [];
  private waveClock = 0;
  private waveIndex = 0; // index of the NEXT wave to start
  private phase: Phase = 'build';
  private gold = START_GOLD;
  private baseHp = START_LIVES;
  private speed = 1;
  private mods: Modifiers = freshModifiers();
  private pity = new PityTracker();
  private upgradesTaken: string[] = [];

  // interaction
  private buildKind: TowerKind | null = null;
  private selected: Tower | null = null;
  private hoverTile: { x: number; y: number } | null = null;

  // display objects
  private cursorGfx!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private startBtn!: Phaser.GameObjects.Container;
  private speedBtn!: Phaser.GameObjects.Container;
  private sellBtn!: Phaser.GameObjects.Container;
  private towerBtns: Phaser.GameObjects.Container[] = [];
  private overlay: Phaser.GameObjects.Container | null = null;

  constructor() { super('Game'); }

  init(data: { campaignLives?: number }) {
    this.campaignLives = data.campaignLives ?? 3;
    this.towers = new Map();
    this.enemies = [];
    this.projectiles = [];
    this.spawns = [];
    this.waveIndex = 0;
    this.phase = 'build';
    this.gold = START_GOLD;
    this.baseHp = START_LIVES;
    this.mods = freshModifiers();
    this.pity = new PityTracker();
    this.upgradesTaken = [];
    this.buildKind = null;
    this.selected = null;
    this.overlay = null;
    this.towerBtns = [];
  }

  create() {
    this.cameras.main.setBackgroundColor(0x1d1a17);
    this.path = new Path(PATH_WAYPOINTS);
    this.pathTiles = this.path.tiles();
    this.drawMap();
    this.cursorGfx = this.add.graphics().setDepth(UI_DEPTH - 10);
    this.buildHud();
    this.bindInput();
    this.refreshHud();
    this.flash('Build towers, then start the wave  (keys 1-3, Space)');
  }

  // ======================= MAP =======================
  private drawMap() {
    const g = this.add.graphics().setDepth(0);
    for (let x = 0; x < MAP_SIZE; x++) {
      for (let y = 0; y < MAP_SIZE; y++) {
        const { x: sx, y: sy } = toScreen(x, y);
        const onPath = this.pathTiles.has(`${x},${y}`);
        const base = onPath ? 0x8a6a45 : (x + y) % 2 ? 0x4f7a3a : 0x568341;
        // soil edge under the outer tiles gives the map a little thickness
        if (x === MAP_SIZE - 1 || y === MAP_SIZE - 1) {
          g.fillStyle(0x3a2b1f).fillPoints(P([
            { x: sx - TILE_W / 2, y: sy }, { x: sx, y: sy + TILE_H / 2 }, { x: sx + TILE_W / 2, y: sy },
            { x: sx + TILE_W / 2, y: sy + 14 }, { x: sx, y: sy + TILE_H / 2 + 14 }, { x: sx - TILE_W / 2, y: sy + 14 },
          ]), true);
        }
        g.fillStyle(base).fillPoints(P(this.diamond(sx, sy)), true);
        g.lineStyle(1, shade(base, 0.8), 0.6).strokePoints(P(this.diamond(sx, sy)), true);
      }
    }
    const start = toScreen(...PATH_WAYPOINTS[0]);
    const end = toScreen(...PATH_WAYPOINTS[PATH_WAYPOINTS.length - 1]);
    this.add.text(start.x - 30, start.y - 34, 'SPAWN', { fontFamily: FONT, fontSize: '13px', color: '#ffb3a7' }).setDepth(2);
    this.add.text(end.x - 6, end.y - 34, 'CABIN', { fontFamily: FONT, fontSize: '13px', color: '#a7d8ff' }).setDepth(2);
  }

  private diamond(cx: number, cy: number, scale = 1) {
    const w = (TILE_W / 2) * scale, h = (TILE_H / 2) * scale;
    return [{ x: cx, y: cy - h }, { x: cx + w, y: cy }, { x: cx, y: cy + h }, { x: cx - w, y: cy }];
  }

  // ======================= HUD =======================
  private button(x: number, y: number, w: number, label: string, color: number, onClick: () => void) {
    const bg = this.add.rectangle(0, 0, w, 40, color).setStrokeStyle(2, shade(color, 0.6));
    const txt = this.add.text(0, 0, label, { fontFamily: FONT, fontSize: '16px', color: '#1b1612', fontStyle: 'bold', align: 'center' }).setOrigin(0.5);
    const c = this.add.container(x, y, [bg, txt]).setDepth(UI_DEPTH).setSize(w, 40);
    bg.setInteractive({ useHandCursor: true })
      .on('pointerover', () => bg.setFillStyle(shade(color, 1.15)))
      .on('pointerout', () => bg.setFillStyle(color))
      .on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => { e.stopPropagation(); onClick(); });
    c.setData('bg', bg).setData('txt', txt).setData('color', color);
    return c;
  }

  private setButtonLabel(btn: Phaser.GameObjects.Container, label: string) {
    (btn.getData('txt') as Phaser.GameObjects.Text).setText(label);
  }

  private buildHud() {
    this.add.rectangle(GAME_W / 2, GAME_H - 38, GAME_W, 76, 0x0f0d0b, 0.85).setDepth(UI_DEPTH - 1);
    this.hudText = this.add.text(16, 12, '', { fontFamily: FONT, fontSize: '18px', color: '#f3e9dc' }).setDepth(UI_DEPTH);
    this.infoText = this.add.text(16, 44, '', { fontFamily: FONT, fontSize: '14px', color: '#c9bba8', lineSpacing: 4 }).setDepth(UI_DEPTH);
    this.toast = this.add.text(GAME_W / 2, 64, '', { fontFamily: FONT, fontSize: '18px', color: '#ffe08a', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(UI_DEPTH);

    TOWER_ORDER.forEach((kind, i) => {
      const d = TOWERS[kind];
      const btn = this.button(110 + i * 200, GAME_H - 38, 186, `${i + 1}. ${d.name}  ${d.cost}g`, d.color, () => this.chooseBuild(kind));
      this.towerBtns.push(btn);
    });
    this.sellBtn = this.button(760, GAME_H - 38, 160, 'Sell', 0xd9785a, () => this.sellSelected()).setVisible(false);
    this.speedBtn = this.button(GAME_W - 290, GAME_H - 38, 90, 'Speed 1x', 0x9aa5b1, () => this.toggleSpeed());
    this.startBtn = this.button(GAME_W - 130, GAME_H - 38, 220, 'Start wave 1', 0x7fd18b, () => this.startWave());
  }

  private refreshHud() {
    const shown = Math.min(this.waveIndex + 1, WAVES.length);
    this.hudText.setText(`Gold ${this.gold}    Cabin HP ${this.baseHp}    Lives ${this.campaignLives}    Wave ${shown}/${WAVES.length}`);
    const m = this.mods;
    const pct = (v: number) => `${Math.round((v - 1) * 100)}%`;
    this.infoText.setText(
      this.upgradesTaken.length
        ? `Upgrades: ${this.upgradesTaken.join(', ')}\nDmg R1 +${pct(m.rankDamage[1])} R2 +${pct(m.rankDamage[2])} R3 +${pct(m.rankDamage[3])} · Rate +${pct(m.fireRate)} · Range +${pct(m.range)} · Gold +${pct(m.gold)}`
        : 'Upgrade draft after waves 3 and 6',
    );
    this.towerBtns.forEach((b, i) => {
      const d = TOWERS[TOWER_ORDER[i]];
      const bg = b.getData('bg') as Phaser.GameObjects.Rectangle;
      bg.setAlpha(this.gold >= d.cost ? 1 : 0.45);
      bg.setStrokeStyle(this.buildKind === d.kind ? 4 : 2, this.buildKind === d.kind ? 0xffffff : shade(d.color, 0.6));
    });
    this.startBtn.setVisible(this.phase === 'build');
    this.setButtonLabel(this.startBtn, `Start wave ${this.waveIndex + 1}`);
    if (this.selected) {
      this.sellBtn.setVisible(true);
      this.setButtonLabel(this.sellBtn, `Sell +${Math.floor(this.selected.def.cost * SELL_REFUND)}g`);
    } else this.sellBtn.setVisible(false);
  }

  private flash(msg: string) {
    this.toast.setText(msg).setAlpha(1);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 2200, duration: 600 });
  }

  // ======================= INPUT =======================
  private bindInput() {
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const { gx, gy } = toGrid(p.worldX, p.worldY);
      const x = Math.round(gx), y = Math.round(gy);
      this.hoverTile = x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE ? { x, y } : null;
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.overlay || p.worldY > GAME_H - 76) return;
      if (p.rightButtonDown()) { this.buildKind = null; this.selected = null; this.refreshHud(); return; }
      const { gx, gy } = toGrid(p.worldX, p.worldY);
      this.clickTile(Math.round(gx), Math.round(gy));
    });
    this.input.mouse?.disableContextMenu();
    const kb = this.input.keyboard!;
    kb.on('keydown-ONE', () => this.chooseBuild('arrow'));
    kb.on('keydown-TWO', () => this.chooseBuild('mg'));
    kb.on('keydown-THREE', () => this.chooseBuild('mortar'));
    kb.on('keydown-SPACE', () => this.startWave());
    kb.on('keydown-F', () => this.toggleSpeed());
    kb.on('keydown-ESC', () => { this.buildKind = null; this.selected = null; this.refreshHud(); });
  }

  private chooseBuild(kind: TowerKind) {
    if (this.overlay) return;
    this.buildKind = this.buildKind === kind ? null : kind;
    this.selected = null;
    this.refreshHud();
  }

  private canBuild(x: number, y: number) {
    return x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE && !this.pathTiles.has(`${x},${y}`) && !this.towers.has(`${x},${y}`);
  }

  private clickTile(x: number, y: number) {
    const existing = this.towers.get(`${x},${y}`);
    if (existing) { this.selected = existing; this.buildKind = null; this.refreshHud(); return; }
    if (!this.buildKind) { this.selected = null; this.refreshHud(); return; }
    const def = TOWERS[this.buildKind];
    if (!this.canBuild(x, y)) { this.flash("Can't build there"); return; }
    if (this.gold < def.cost) { this.flash('Not enough gold'); return; }
    if (this.phase === 'over') return;
    this.gold -= def.cost;
    this.towers.set(`${x},${y}`, new Tower(this, def, x, y));
    if (this.gold < def.cost) this.buildKind = null; // keep building while affordable
    this.refreshHud();
  }

  private sellSelected() {
    const t = this.selected;
    if (!t) return;
    this.gold += Math.floor(t.def.cost * SELL_REFUND);
    t.destroy();
    this.towers.delete(`${t.tx},${t.ty}`);
    this.selected = null;
    this.refreshHud();
  }

  private toggleSpeed() {
    this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1;
    this.setButtonLabel(this.speedBtn, `Speed ${this.speed}x`);
  }

  // ======================= WAVES =======================
  private startWave() {
    if (this.phase !== 'build' || this.overlay) return;
    const wave = WAVES[this.waveIndex];
    this.spawns = [];
    for (const g of wave.groups) {
      for (let i = 0; i < g.count; i++) this.spawns.push({ at: g.delay + i * g.interval, kind: g.kind });
    }
    this.spawns.sort((a, b) => a.at - b.at);
    this.waveClock = 0;
    this.phase = 'wave';
    this.buildKind = null;
    this.refreshHud();
    this.flash(`Wave ${this.waveIndex + 1}: here they come!`);
  }

  private endWave() {
    const waveNumber = this.waveIndex + 1;
    const bonus = waveClearBonus(waveNumber);
    this.gold += bonus;
    this.waveIndex++;
    this.phase = 'build';
    if (this.waveIndex >= WAVES.length) { this.showEnd(true); return; }
    this.flash(`Wave ${waveNumber} cleared  +${bonus}g`);
    if (waveNumber % PUZZLE_EVERY === 0) this.openPuzzleBreak();
    this.refreshHud();
  }

  // ======================= UPDATE LOOP =======================
  update(_time: number, deltaMs: number) {
    this.drawCursor();
    if (this.phase !== 'wave') return;
    const dt = Math.min(deltaMs / 1000, 0.05) * this.speed;

    // spawn
    this.waveClock += dt;
    const hpScale = 1 + this.waveIndex * HP_SCALE_PER_WAVE;
    while (this.spawns.length && this.spawns[0].at <= this.waveClock) {
      const s = this.spawns.shift()!;
      this.enemies.push(new Enemy(this, ENEMIES[s.kind], hpScale, this.path));
    }

    // move enemies
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.move(dt)) {
        e.alive = false;
        this.baseHp -= e.def.leakDamage;
        this.cameras.main.shake(120, 0.004);
      }
    }

    this.updateTowers(dt);
    this.updateProjectiles(dt);

    // clean up
    const before = this.enemies.length;
    this.enemies = this.enemies.filter(e => { if (!e.alive) e.destroy(); return e.alive; });
    if (before !== this.enemies.length) this.refreshHud();

    if (this.baseHp <= 0) { this.loseMap(); return; }
    if (!this.spawns.length && !this.enemies.length && !this.projectiles.length) this.endWave();
  }

  private towerRange(t: Tower) { return t.def.range * this.mods.range; }
  private towerDamage(t: Tower) { return t.def.damage * this.mods.rankDamage[t.def.rank]; }

  private updateTowers(dt: number) {
    for (const t of this.towers.values()) {
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      const range = this.towerRange(t);
      // target the enemy furthest along the path ("first")
      let target: Enemy | null = null;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.gx - t.tx, e.gy - t.ty);
        if (d <= range && d >= t.def.minRange && (!target || e.distance > target.distance)) target = e;
      }
      if (!target) continue;
      t.cooldown = t.def.fireDelay / this.mods.fireRate;
      const from = toScreen(t.tx, t.ty), to = toScreen(target.gx, target.gy);
      t.aim = Math.atan2((to.y - from.y) * 2, to.x - from.x);
      t.draw();
      this.fire(t, target);
    }
  }

  private fire(t: Tower, target: Enemy) {
    const dmg = this.towerDamage(t);
    if (t.def.flightTime === 0) {
      // straight, instant fire: hit now and draw a tracer
      this.damage(target, dmg);
      const a = toScreen(t.tx, t.ty), b = toScreen(target.gx, target.gy);
      const tracer = this.add.graphics().setDepth(UI_DEPTH - 20);
      tracer.lineStyle(2, 0xfff2a8, 0.9).lineBetween(a.x, a.y - t.height, b.x, b.y - target.def.size);
      this.tweens.add({ targets: tracer, alpha: 0, duration: 90, onComplete: () => tracer.destroy() });
      return;
    }
    const isMortar = t.def.splash > 0;
    this.projectiles.push({
      gfx: this.add.graphics(),
      sx: t.tx, sy: t.ty, tx: target.gx, ty: target.gy,
      startHeight: t.height,
      homing: isMortar ? undefined : target, // arrows home in, mortar shells land where the target WAS
      t: 0, duration: t.def.flightTime,
      damage: dmg, splash: t.def.splash * this.mods.splash,
      arcHeight: isMortar ? 120 : 40,
      color: isMortar ? 0x2b2b2b : 0xe9dcc0,
    });
  }

  private updateProjectiles(dt: number) {
    for (const p of this.projectiles) {
      p.t += dt;
      if (p.homing && p.homing.alive) { p.tx = p.homing.gx; p.ty = p.homing.gy; }
      const k = Math.min(1, p.t / p.duration);
      const gx = p.sx + (p.tx - p.sx) * k, gy = p.sy + (p.ty - p.sy) * k;
      const { x, y } = toScreen(gx, gy);
      const lift = p.startHeight * (1 - k) + Math.sin(k * Math.PI) * p.arcHeight;
      p.gfx.clear().setDepth(depthOf(gx, gy) + 50);
      p.gfx.fillStyle(0x000000, 0.25).fillEllipse(x, y, 8, 4);
      p.gfx.fillStyle(p.color).fillCircle(x, y - lift, p.splash ? 5 : 3);
      if (k >= 1) this.land(p);
    }
    this.projectiles = this.projectiles.filter(p => p.t < p.duration);
  }

  private land(p: Projectile) {
    p.gfx.destroy();
    if (p.splash > 0) {
      const { x, y } = toScreen(p.tx, p.ty);
      const { w, h } = rangeEllipse(p.splash);
      const boom = this.add.graphics().setDepth(UI_DEPTH - 30);
      boom.fillStyle(0xffa040, 0.55).fillEllipse(x, y, w, h);
      this.tweens.add({ targets: boom, alpha: 0, duration: 300, onComplete: () => boom.destroy() });
      for (const e of this.enemies) {
        if (e.alive && Math.hypot(e.gx - p.tx, e.gy - p.ty) <= p.splash) this.damage(e, p.damage);
      }
    } else if (p.homing && p.homing.alive) {
      this.damage(p.homing, p.damage);
    }
  }

  private damage(e: Enemy, amount: number) {
    if (!e.alive) return;
    e.hit(amount);
    if (!e.alive) this.gold += Math.round(e.def.reward * this.mods.gold);
  }

  // ======================= CURSOR / RANGE OVERLAY =======================
  private drawCursor() {
    const g = this.cursorGfx;
    g.clear();
    const showRange = (tx: number, ty: number, r: number, minR: number, ok: boolean) => {
      const { x, y } = toScreen(tx, ty);
      const e = rangeEllipse(r);
      g.fillStyle(ok ? 0xffffff : 0xff5555, 0.08).fillEllipse(x, y, e.w, e.h);
      g.lineStyle(2, ok ? 0xffffff : 0xff5555, 0.5).strokeEllipse(x, y, e.w, e.h);
      if (minR > 0) {
        const m = rangeEllipse(minR);
        g.lineStyle(1, 0xff9090, 0.6).strokeEllipse(x, y, m.w, m.h);
      }
    };
    if (this.selected) {
      showRange(this.selected.tx, this.selected.ty, this.towerRange(this.selected), this.selected.def.minRange, true);
    }
    if (this.buildKind && this.hoverTile && !this.overlay) {
      const { x: tx, y: ty } = this.hoverTile;
      const def = TOWERS[this.buildKind];
      const ok = this.canBuild(tx, ty) && this.gold >= def.cost;
      const { x, y } = toScreen(tx, ty);
      g.fillStyle(ok ? 0x9cff9c : 0xff6b6b, 0.35).fillPoints(P(this.diamond(x, y)), true);
      showRange(tx, ty, def.range * this.mods.range, def.minRange, ok);
    }
  }

  // ======================= PUZZLE BREAK + UPGRADE DRAFT =======================
  private openOverlay(): Phaser.GameObjects.Container {
    this.overlay?.destroy();
    const c = this.add.container(0, 0).setDepth(OVERLAY_DEPTH);
    const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.72).setInteractive();
    c.add(dim);
    this.overlay = c;
    this.phase = this.phase === 'over' ? 'over' : 'draft';
    this.refreshHud();
    return c;
  }

  private closeOverlay() {
    this.overlay?.destroy();
    this.overlay = null;
    if (this.phase === 'draft') this.phase = 'build';
    this.refreshHud();
  }

  private title(c: Phaser.GameObjects.Container, y: number, text: string, size = 30) {
    c.add(this.add.text(GAME_W / 2, y, text, { fontFamily: FONT, fontSize: `${size}px`, color: '#f3e9dc', align: 'center', wordWrap: { width: 900 } }).setOrigin(0.5));
  }

  // Placeholder until the real puzzles exist: pick the result to test the draft.
  private openPuzzleBreak() {
    const c = this.openOverlay();
    this.title(c, 200, 'The Nocimonorcen stirs… puzzle time!');
    this.title(c, 250, 'Puzzles arrive in the next build. For now, choose the result you "earned" to test the upgrade draft.', 17);
    const opts: [RewardTier, string, number][] = [
      ['fail', 'Failed', 0x9c4a4a], ['bronze', 'Bronze', TIER_COLOR.bronze], ['silver', 'Silver', TIER_COLOR.silver], ['gold', 'Gold', TIER_COLOR.gold],
    ];
    opts.forEach(([tier, label, color], i) => {
      const b = this.button(GAME_W / 2 - 330 + i * 220, 340, 190, label, color, () => this.openDraft(tier));
      b.setDepth(OVERLAY_DEPTH + 1);
      c.add(b);
    });
  }

  private openDraft(earned: RewardTier) {
    const { tier, boosted } = this.pity.adjust(earned);
    const draft = rollDraft();
    const c = this.openOverlay();
    const label = tier === 'fail' ? 'Puzzle failed' : `${tier[0].toUpperCase()}${tier.slice(1)} reward`;
    this.title(c, 90, label + (boosted ? '  (lucky break: boosted to Silver)' : ''));

    if (tier === 'fail') {
      const { option, pct } = failurePick(draft);
      this.title(c, 140, 'You get one random bronze upgrade, weakened.', 17);
      this.card(c, GAME_W / 2, 330, option, true, pct, () => this.take(option, pct));
      return;
    }
    this.title(c, 140, 'Pick ONE upgrade. Greyed-out cards need a better result.', 17);
    draft.forEach((opt, i) => {
      const x = 130 + i * 204;
      const unlocked = isUnlocked(opt.tier, tier);
      this.card(c, x, 340, opt, unlocked, opt.power, () => this.take(opt, opt.power));
    });
  }

  private card(c: Phaser.GameObjects.Container, x: number, y: number, opt: UpgradeOption, unlocked: boolean, pct: number, onPick: () => void) {
    const w = 188, h = 250, col = TIER_COLOR[opt.tier];
    const bg = this.add.rectangle(x, y, w, h, unlocked ? 0x2a241f : 0x1b1917).setStrokeStyle(3, unlocked ? col : 0x444444);
    const band = this.add.rectangle(x, y - h / 2 + 18, w - 6, 30, unlocked ? col : 0x3a3a3a);
    const tierTxt = this.add.text(x, y - h / 2 + 18, opt.tier.toUpperCase(), { fontFamily: FONT, fontSize: '14px', color: '#1b1612', fontStyle: 'bold' }).setOrigin(0.5);
    const titleTxt = this.add.text(x, y - 50, opt.title, { fontFamily: FONT, fontSize: '19px', color: unlocked ? '#f3e9dc' : '#6b655e', align: 'center', wordWrap: { width: w - 20 } }).setOrigin(0.5);
    const desc = this.add.text(x, y + 10, opt.describe(pct), { fontFamily: FONT, fontSize: '15px', color: unlocked ? '#c9bba8' : '#5a554f', align: 'center', wordWrap: { width: w - 24 } }).setOrigin(0.5);
    const cat = this.add.text(x, y + 70, opt.category, { fontFamily: FONT, fontSize: '13px', color: unlocked ? '#8f8578' : '#4a4540' }).setOrigin(0.5);
    c.add([bg, band, tierTxt, titleTxt, desc, cat]);
    if (!unlocked) {
      c.add(this.add.text(x, y + 100, `🔒 Requires ${opt.tier}`, { fontFamily: FONT, fontSize: '14px', color: '#8a8178' }).setOrigin(0.5));
      return;
    }
    bg.setInteractive({ useHandCursor: true })
      .on('pointerover', () => bg.setFillStyle(0x3a322a))
      .on('pointerout', () => bg.setFillStyle(0x2a241f))
      .on('pointerdown', onPick);
  }

  private take(opt: UpgradeOption, pct: number) {
    applyOption(this.mods, opt, pct);
    this.upgradesTaken.push(`${opt.title} (${opt.tier})`);
    this.closeOverlay();
    this.flash(`${opt.title}: ${opt.describe(pct)}`);
  }

  // ======================= WIN / LOSE =======================
  private loseMap() {
    this.phase = 'over';
    const livesLeft = this.campaignLives - 1;
    const c = this.openOverlay();
    if (livesLeft > 0) {
      this.title(c, 260, 'The deadites got to the cabin.');
      this.title(c, 310, `You lose a life. ${livesLeft} ${livesLeft === 1 ? 'life' : 'lives'} left. The map restarts.`, 18);
      c.add(this.button(GAME_W / 2, 400, 240, 'Try again', 0x7fd18b, () => this.scene.restart({ campaignLives: livesLeft })).setDepth(OVERLAY_DEPTH + 1));
    } else this.showEnd(false);
  }

  private showEnd(won: boolean) {
    this.phase = 'over';
    const c = this.openOverlay();
    this.title(c, 260, won ? 'Groovy. Map cleared!' : 'Game over, man.');
    this.title(c, 310, won ? 'The boss wave and the next era come in later milestones.' : 'All 3 lives used. The campaign starts over.', 18);
    c.add(this.button(GAME_W / 2, 400, 240, 'Play again', 0x7fd18b, () => this.scene.restart({ campaignLives: 3 })).setDepth(OVERLAY_DEPTH + 1));
  }
}
