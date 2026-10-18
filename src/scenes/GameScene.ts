import Phaser from 'phaser';
import * as art from '../art';
import {
  ENEMIES, GAME_H, GAME_W, HIGH_GROUND_RANGE, HP_SCALE_PER_WAVE, PATH_WAYPOINTS, PLOTS, PUZZLE_EVERY, SELL_REFUND,
  START_GOLD, START_LIVES, TOWER_ORDER, TOWERS, TowerKind, WAVES, waveClearBonus,
} from '../config';
import { Enemy, Path, Plot, Projectile, Tower } from '../entities';
import { HeroPortrait } from '../hero';
import { depthOf, rangeEllipse, toScreen } from '../iso';
import { CABIN_CHIMNEY, SPRITES, SpriteName, addSprite, hasSprite, preloadSprites, variants } from '../sprites';
import {
  Modifiers, PityTracker, RewardTier, UpgradeOption, applyOption, failurePick, freshModifiers, isUnlocked, rollDraft,
} from '../upgrades';

type Phase = 'build' | 'wave' | 'draft' | 'over';
interface PendingSpawn { at: number; kind: keyof typeof ENEMIES }

const UI_DEPTH = 5000;
const MENU_DEPTH = 6000;
const OVERLAY_DEPTH = 9000;
const FONT = '"Trebuchet MS", Verdana, sans-serif';
const TIER_COLOR = { bronze: 0xc98a4b, silver: 0xbfc7d1, gold: 0xf2c94c } as const;
const TEXT = (size: number, color = '#fff7e6'): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: 'bold', stroke: '#2b1d12', strokeThickness: Math.max(3, size / 4),
});

export class GameScene extends Phaser.Scene {
  // run state (survives a map restart)
  private campaignLives = 3;

  // map state
  private path!: Path;
  private plots: Plot[] = [];
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
  private hoverPlot: Plot | null = null;
  private menuPlot: Plot | null = null;
  private menuHoverKind: TowerKind | null = null;
  private menu: Phaser.GameObjects.Container | null = null;

  // display objects
  private cursorGfx!: Phaser.GameObjects.Graphics;
  private hudGfx!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private startBtn!: Phaser.GameObjects.Container;
  private speedBtn!: Phaser.GameObjects.Container;
  private overlay: Phaser.GameObjects.Container | null = null;
  private lifeIcons: Phaser.GameObjects.Image[] = [];
  private hero: HeroPortrait | null = null;

  constructor() { super('Game'); }

  init(data: { campaignLives?: number }) {
    this.campaignLives = data.campaignLives ?? 3;
    this.plots = [];
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
    this.hoverPlot = null;
    this.menuPlot = null;
    this.menu = null;
    this.overlay = null;
    this.lifeIcons = [];
    this.hero = null;
  }

  preload() {
    preloadSprites(this);
  }

  create() {
    this.cameras.main.setBackgroundColor(art.PAL.grass);
    this.path = new Path(PATH_WAYPOINTS);
    this.drawGround();
    this.plots = PLOTS.map((def, i) => new Plot(this, def, i));
    this.drawScenery();
    this.cursorGfx = this.add.graphics().setDepth(UI_DEPTH - 10);
    this.buildHud();
    if (hasSprite(this, 'hero_neutral')) this.hero = new HeroPortrait(this, UI_DEPTH + 5);
    this.bindInput();
    this.refreshHud();
    this.flash('Click a stone plot to build a tower');
  }

  // ======================= MAP =======================
  /** Grass, the winding road and flat ground details: drawn once, underneath everything. */
  private drawGround() {
    if (hasSprite(this, 'map_ground')) {
      addSprite(this, 'map_ground', 0, 0).setDepth(0);
      return;
    }
    if (!this.textures.exists('ground')) this.bake('ground', GAME_W, GAME_H, 0, 0, g => this.paintGround(g));
    this.add.image(0, 0, 'ground').setOrigin(0, 0).setDepth(0);
  }

  /**
   * Draws something once into a reusable texture. Graphics objects re-draw every frame,
   * so anything that never changes (ground, trees, buildings) is baked into an image instead.
   * (ox, oy) is where the drawing's origin (its feet) sits inside the w × h texture.
   */
  private bake(key: string, w: number, h: number, ox: number, oy: number, draw: (g: Phaser.GameObjects.Graphics) => void) {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.translateCanvas(ox, oy);
    draw(g);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  private paintGround(g: Phaser.GameObjects.Graphics) {
    const r = art.rng(7);
    g.fillStyle(art.PAL.grass).fillRect(0, 0, GAME_W, GAME_H);
    // soft painted patches of lighter and darker grass
    for (let i = 0; i < 70; i++) {
      const x = r() * GAME_W, y = r() * GAME_H, w = 80 + r() * 160;
      g.fillStyle(r() < 0.5 ? art.PAL.grassLight : art.PAL.grassDark, 0.35).fillEllipse(x, y, w, w * 0.5);
    }
    // road: dark edge first, then sand, then a lighter centre, sampled densely along the path
    const step = 0.08;
    const layers: [number, number][] = [[0.78, art.PAL.roadEdge], [0.66, art.PAL.road], [0.36, art.PAL.roadLight]];
    for (const [radius, color] of layers) {
      const e = rangeEllipse(radius);
      g.fillStyle(color);
      for (let d = 0; d <= this.path.length; d += step) {
        const p = this.path.at(d), s = toScreen(p.gx, p.gy);
        g.fillEllipse(s.x, s.y, e.w, e.h);
      }
    }
    // pebbles and wheel ruts on the road
    for (let d = 0; d <= this.path.length; d += 0.35) {
      const p = this.path.at(d), s = toScreen(p.gx, p.gy);
      art.pebble(g, s.x + (r() - 0.5) * 60, s.y + (r() - 0.5) * 26, 2 + r() * 2.5);
    }
    // grass tufts and flowers away from the road
    for (let i = 0; i < 260; i++) {
      const x = r() * GAME_W, y = r() * GAME_H;
      const grid = this.toGridPoint(x, y);
      if (this.path.distanceTo(grid.gx, grid.gy) < 0.85) continue;
      if (r() < 0.75) art.grassTuft(g, x, y, r);
      else art.flower(g, x, y, [0xffffff, 0xf2c94c, 0xe36a8a, 0xb38ce0][Math.floor(r() * 4)]);
    }
  }

  private toGridPoint(sx: number, sy: number) {
    const o = toScreen(0, 0);
    const a = (sx - o.x) / 40, b = (sy - o.y) / 20;
    return { gx: (a + b) / 2, gy: (b - a) / 2 };
  }

  /** Trees, rocks, bushes, the crypt and the cabin. Each is depth-sorted so enemies walk behind them. */
  private drawScenery() {
    const start = PATH_WAYPOINTS[0], end = PATH_WAYPOINTS[PATH_WAYPOINTS.length - 1];
    const place = (key: string, gx: number, gy: number, box: [number, number, number, number],
      draw: (g: Phaser.GameObjects.Graphics) => void, depthBias = 0) => {
      const [w, h, ox, oy] = box;
      if (!this.textures.exists(key)) this.bake(key, w, h, ox, oy, draw);
      const s = toScreen(gx, gy);
      this.add.image(s.x, s.y, key).setOrigin(ox / w, oy / h).setDepth(depthOf(gx, gy) + depthBias);
    };
    if (hasSprite(this, 'crypt')) {
      const c = toScreen(start[0], start[1] - 0.6);
      addSprite(this, 'crypt', c.x, c.y).setDepth(depthOf(start[0], start[1] - 0.6) + 3);
    } else place('crypt', start[0], start[1] - 0.6, [160, 110, 80, 85], g => art.crypt(g), 3);
    const painted: Record<string, SpriteName[]> = {
      tree: variants(this, 'tree'), pine: variants(this, 'pine'), bush: variants(this, 'bush'), rock: variants(this, 'rock'),
    };
    const placeSprite = (family: string, gx: number, gy: number, size: number, pick: number) => {
      const list = painted[family];
      if (!list.length) return false;
      const name = list[Math.floor(pick * list.length) % list.length];
      const s = toScreen(gx, gy), meta = SPRITES[name];
      addSprite(this, name, s.x, s.y).setDepth(depthOf(gx, gy))
        .setDisplaySize(meta.display[0] * size, meta.display[1] * size).setFlipX(pick * 7 % 1 > 0.5);
      return true;
    };
    if (hasSprite(this, 'cabin')) this.placeCabinSprite(end[0], end[1]);
    else place('cabin', end[0], end[1], [180, 150, 88, 118], g => art.cabin(g), 6);

    // Pick spots first with one seeded generator, so the layout is identical on every restart.
    const r = art.rng(42);
    const centre = { gx: 6, gy: 6 };
    let placed = 0;
    for (let tries = 0; tries < 2500 && placed < 120; tries++) {
      const gx = -9 + r() * 30, gy = -9 + r() * 30;
      const s = toScreen(gx, gy);
      if (s.x < -30 || s.x > GAME_W + 30 || s.y < -10 || s.y > GAME_H + 60) continue;
      if (this.path.distanceTo(gx, gy) < 1.25) continue;
      if (PLOTS.some(p => Math.hypot(p.x - gx, p.y - gy) < 1.3)) continue;
      if (Math.hypot(gx - start[0], gy - start[1]) < 2.2 || Math.hypot(gx - end[0], gy - end[1]) < 2.6) continue;
      // keep the middle of the map fairly open, the edges dense like a forest
      if (Math.hypot(gx - centre.gx, gy - centre.gy) < 7 && r() > 0.12) continue;
      const roll = r(), size = 0.85 + r() * 0.45, seed = placed * 31 + 5, key = `scenery-${placed}`;
      const box: [number, number, number, number] = [120, 120, 60, 100];
      const pick = r();
      if (roll < 0.5) placeSprite('tree', gx, gy, size, pick) || place(key, gx, gy, box, g => art.tree(g, size, art.rng(seed)));
      else if (roll < 0.7) placeSprite('pine', gx, gy, size, pick) || place(key, gx, gy, box, g => art.pine(g, size));
      else if (roll < 0.85) placeSprite('bush', gx, gy, size, pick) || place(key, gx, gy, box, g => art.bush(g, size * 0.9));
      else placeSprite('rock', gx, gy, size, pick) || place(key, gx, gy, box, g => art.rock(g, size * 0.8));
      placed++;
    }
  }

  /** The painted cabin, with chimney smoke puffed in code so it never repeats. */
  private placeCabinSprite(gx: number, gy: number) {
    const { x, y } = toScreen(gx, gy);
    const meta = SPRITES.cabin;
    addSprite(this, 'cabin', x, y).setDepth(depthOf(gx, gy) + 6);
    const [w, h] = meta.display;
    const cx = x - w * meta.origin[0] + w * CABIN_CHIMNEY[0];
    const cy = y - h * meta.origin[1] + h * CABIN_CHIMNEY[1];
    const puff = () => {
      const p = this.add.graphics().setPosition(cx + (Math.random() - 0.5) * 4, cy).setDepth(UI_DEPTH - 40);
      const r = 5 + Math.random() * 3;
      p.fillStyle(0xe9e4dc, 0.85).fillCircle(0, 0, r);
      p.fillStyle(0xffffff, 0.6).fillCircle(-r * 0.3, -r * 0.3, r * 0.5);
      this.tweens.add({
        targets: p, y: cy - 46 - Math.random() * 12, x: cx + 10 + Math.random() * 10,
        scale: 2.2, alpha: 0, duration: 2600 + Math.random() * 600, ease: 'Sine.easeOut',
        onComplete: () => p.destroy(),
      });
    };
    this.time.addEvent({ delay: 650, loop: true, callback: puff });
  }

  // ======================= HUD =======================
  /** A chunky wooden button. Returns a container with the label stored for later updates. */
  private button(x: number, y: number, w: number, h: number, label: string, color: number, onClick: () => void, size = 17) {
    const txt = this.add.text(0, 0, label, TEXT(size)).setOrigin(0.5);
    const zone = this.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
    let bg: Phaser.GameObjects.GameObject;
    let paint: (hover: boolean) => void;
    if (hasSprite(this, 'ui_button')) {
      // painted wooden plank, stretched without distorting its iron corners (texture is stored at 2x)
      const ns = this.add.nineslice(0, 0, SPRITES.ui_button.key, undefined, w * 2, h * 2, 44, 44, 36, 36).setScale(0.5);
      const tint = art.shade(color, 1.35);
      paint = (hover: boolean) => {
        ns.setTint(hover ? 0xffffff : tint);
        ns.setScale(hover ? 0.52 : 0.5);
      };
      bg = ns;
    } else {
      const g = this.add.graphics();
      paint = (hover: boolean) => {
        g.clear();
        g.fillStyle(0x000000, 0.3).fillRoundedRect(-w / 2 + 2, -h / 2 + 4, w, h, 10);
        g.fillStyle(hover ? art.shade(color, 1.12) : color).fillRoundedRect(-w / 2, -h / 2, w, h, 10);
        g.fillStyle(0xffffff, 0.18).fillRoundedRect(-w / 2 + 4, -h / 2 + 3, w - 8, h * 0.38, 7);
        g.lineStyle(3, art.OUTLINE).strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
      };
      bg = g;
    }
    paint(false);
    zone.on('pointerover', () => paint(true)).on('pointerout', () => paint(false)).on('pointerdown', onClick);
    const c = this.add.container(x, y, [bg, txt, zone]).setDepth(UI_DEPTH);
    c.setData('txt', txt);
    return c;
  }

  private setButtonLabel(btn: Phaser.GameObjects.Container, label: string) {
    (btn.getData('txt') as Phaser.GameObjects.Text).setText(label);
  }

  private buildHud() {
    this.hudGfx = this.add.graphics().setDepth(UI_DEPTH);
    if (hasSprite(this, 'ui_panel')) {
      this.add.nineslice(8, 6, SPRITES.ui_panel.key, undefined, 900, 104, 60, 60, 30, 30)
        .setOrigin(0, 0).setScale(0.5).setDepth(UI_DEPTH - 0.5);
      const icon = (name: SpriteName, x: number) => addSprite(this, name, x, 31).setDisplaySize(28, 28).setDepth(UI_DEPTH);
      icon('icon_heart', 36); icon('icon_coin', 118); icon('icon_skull', 218);
      this.lifeIcons = [0, 1, 2].map(i => addSprite(this, 'icon_book', 372 + i * 26, 31).setDisplaySize(26, 26).setDepth(UI_DEPTH));
    }
    this.hpText = this.add.text(52, 31, '', TEXT(20)).setOrigin(0, 0.5).setDepth(UI_DEPTH);
    this.goldText = this.add.text(132, 31, '', TEXT(20, '#ffe08a')).setOrigin(0, 0.5).setDepth(UI_DEPTH);
    this.waveText = this.add.text(232, 31, '', TEXT(20)).setOrigin(0, 0.5).setDepth(UI_DEPTH);
    this.infoText = this.add.text(18, 66, '', TEXT(13, '#f3e9dc')).setDepth(UI_DEPTH).setLineSpacing(3);
    this.toast = this.add.text(GAME_W / 2, 92, '', TEXT(22, '#ffe08a')).setOrigin(0.5).setDepth(UI_DEPTH);
    this.speedBtn = this.button(GAME_W - 300, GAME_H - 42, 92, 50, '1x', 0x7d8a99, () => this.toggleSpeed(), 20);
    this.startBtn = this.button(GAME_W - 140, GAME_H - 42, 210, 50, '', 0x5fae4e, () => this.startWave(), 18);
  }

  private refreshHud() {
    const g = this.hudGfx;
    g.clear();
    if (this.lifeIcons.length) {
      // painted HUD: used lives fade out
      this.lifeIcons.forEach((ic, i) => ic.setAlpha(i < this.campaignLives ? 1 : 0.25));
    } else {
      // wooden plank panel, top left
      g.fillStyle(0x000000, 0.3).fillRoundedRect(12, 12, 420, 44, 12);
      g.fillStyle(0x6e4626).fillRoundedRect(8, 8, 420, 44, 12);
      g.fillStyle(0x8a5a30).fillRoundedRect(12, 11, 412, 18, 8);
      g.lineStyle(3, art.OUTLINE).strokeRoundedRect(8, 8, 420, 44, 12);
      art.heartIcon(g, 34, 30);
      art.coinIcon(g, 116, 31, 9);
      art.skullIcon(g, 216, 31);
      for (let i = 0; i < 3; i++) art.bookIcon(g, 360 + i * 22, 30, i >= this.campaignLives);
    }

    const shown = Math.min(this.waveIndex + 1, WAVES.length);
    this.hpText.setText(`${this.baseHp}`);
    this.goldText.setText(`${this.gold}`);
    this.waveText.setText(`Wave ${shown}/${WAVES.length}`);
    const m = this.mods;
    const pct = (v: number) => `${Math.round((v - 1) * 100)}%`;
    this.infoText.setText(
      this.upgradesTaken.length
        ? `Upgrades: ${this.upgradesTaken.join(', ')}\nDmg R1 +${pct(m.rankDamage[1])}  R2 +${pct(m.rankDamage[2])}  R3 +${pct(m.rankDamage[3])} · Rate +${pct(m.fireRate)} · Range +${pct(m.range)} · Gold +${pct(m.gold)}`
        : 'Upgrade draft after waves 3 and 6',
    );
    this.startBtn.setVisible(this.phase === 'build');
    this.setButtonLabel(this.startBtn, `Start wave ${this.waveIndex + 1}`);
    this.refreshMenu();
  }

  private flash(msg: string) {
    this.toast.setText(msg).setAlpha(1);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 2200, duration: 600 });
  }

  // ======================= INPUT =======================
  private plotAt(px: number, py: number): Plot | null {
    // check front-most plots first, so a tower in front wins over one behind it
    const sorted = [...this.plots].sort((a, b) => (b.def.x + b.def.y) - (a.def.x + a.def.y));
    return sorted.find(p => p.hit(px, py)) ?? null;
  }

  private bindInput() {
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const hit = this.overlay ? null : this.plotAt(p.worldX, p.worldY);
      if (hit !== this.hoverPlot) {
        this.hoverPlot?.setHover(false);
        hit?.setHover(true);
        this.hoverPlot = hit;
        this.input.setDefaultCursor(hit ? 'pointer' : 'default');
      }
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (this.overlay || over.length) return; // a button or menu item handled it
      const hit = this.plotAt(p.worldX, p.worldY);
      if (hit && hit !== this.menuPlot) this.openMenu(hit);
      else this.closeMenu();
    });
    const kb = this.input.keyboard!;
    TOWER_ORDER.forEach((kind, i) => kb.on(`keydown-${['ONE', 'TWO', 'THREE'][i]}`, () => {
      if (this.menuPlot && !this.menuPlot.tower) this.build(this.menuPlot, kind);
    }));
    kb.on('keydown-SPACE', () => this.startWave());
    kb.on('keydown-F', () => this.toggleSpeed());
    kb.on('keydown-ESC', () => this.closeMenu());
  }

  // ======================= RADIAL BUILD MENU =======================
  private openMenu(plot: Plot) {
    this.closeMenu();
    this.menuPlot = plot;
    this.refreshMenu();
  }

  private closeMenu() {
    this.menu?.destroy();
    this.menu = null;
    this.menuPlot = null;
    this.menuHoverKind = null;
  }

  /** (Re)builds the ring of options around the open plot. Called whenever gold changes. */
  private refreshMenu() {
    const plot = this.menuPlot;
    this.menu?.destroy();
    this.menu = null;
    if (!plot || this.overlay) return;
    const { x, y } = plot.top;
    const c = this.add.container(x, y - 6).setDepth(MENU_DEPTH);
    this.menu = c;
    const ring = this.add.graphics();
    ring.lineStyle(5, art.OUTLINE, 0.6).strokeCircle(0, 0, 60);
    ring.lineStyle(3, 0xfff3b0, 0.9).strokeCircle(0, 0, 60);
    c.add(ring);

    const label = (text: string, ly: number) => c.add(this.add.text(0, ly, text, TEXT(14)).setOrigin(0.5));
    if (plot.def.high) label('High ground: +25% range', -102);

    if (!plot.tower) {
      TOWER_ORDER.forEach((kind, i) => {
        const def = TOWERS[kind];
        const ang = Phaser.Math.DegToRad(-150 + i * 60);
        this.menuOption(c, Math.cos(ang) * 60, Math.sin(ang) * 60, this.gold >= def.cost, `${def.cost}`,
          g => { g.setScale(0.5); art.tower(g, kind, Math.PI * 0.25); g.y += 16; },
          () => this.build(plot, kind),
          on => { this.menuHoverKind = on ? kind : null; },
        );
      });
    } else {
      const t = plot.tower;
      label(t.def.name, -84);
      const refund = Math.floor(t.def.cost * SELL_REFUND);
      this.menuOption(c, 0, 60, true, `+${refund}`,
        g => { art.coinIcon(g, 0, 0, 13); g.lineStyle(3, art.OUTLINE).lineBetween(0, -7, 0, 7); },
        () => this.sell(plot), () => {}, 0xd9785a);
    }
  }

  private menuOption(
    c: Phaser.GameObjects.Container, x: number, y: number, enabled: boolean, price: string,
    icon: (g: Phaser.GameObjects.Graphics) => void, onPick: () => void, onHover: (on: boolean) => void, color = 0x8a5a30,
  ) {
    const bg = this.add.graphics().setPosition(x, y);
    const paint = (hover: boolean) => {
      bg.clear();
      bg.fillStyle(0x000000, 0.3).fillCircle(2, 4, 25);
      bg.fillStyle(enabled ? (hover ? art.shade(color, 1.2) : color) : 0x4a4038).fillCircle(0, 0, 25);
      bg.lineStyle(3, hover && enabled ? 0xfff3b0 : art.OUTLINE).strokeCircle(0, 0, 25);
    };
    paint(false);
    const ic = this.add.graphics().setPosition(x, y);
    icon(ic);
    if (!enabled) ic.setAlpha(0.45);
    const tag = this.add.graphics().setPosition(x, y + 30);
    tag.fillStyle(enabled ? 0x2b1d12 : 0x4a1f1f, 0.92).fillRoundedRect(-24, -9, 48, 18, 8);
    art.coinIcon(tag, -14, 0, 6);
    const tagText = this.add.text(x + 6, y + 30, price, TEXT(13, enabled ? '#ffe08a' : '#e08a7a')).setOrigin(0.5);
    const zone = this.add.zone(x, y, 54, 54).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => { paint(true); onHover(true); })
      .on('pointerout', () => { paint(false); onHover(false); })
      .on('pointerdown', () => (enabled ? onPick() : this.flash('Not enough gold')));
    c.add([bg, ic, tag, tagText, zone]);
  }

  private build(plot: Plot, kind: TowerKind) {
    const def = TOWERS[kind];
    if (plot.tower || this.phase === 'over') return;
    if (this.gold < def.cost) { this.flash('Not enough gold'); return; }
    this.gold -= def.cost;
    plot.tower = new Tower(this, def, plot);
    this.hero?.react('towerBuilt');
    plot.draw();
    this.puff(plot.top.x, plot.top.y, 0xd9c4a0, 8);
    this.closeMenu();
    this.refreshHud();
  }

  private sell(plot: Plot) {
    const t = plot.tower;
    if (!t) return;
    const refund = Math.floor(t.def.cost * SELL_REFUND);
    this.gold += refund;
    this.goldPop(plot.top.x, plot.top.y - 30, refund);
    this.hero?.react('towerSold');
    t.destroy();
    plot.tower = null;
    plot.draw();
    this.closeMenu();
    this.refreshHud();
  }

  private toggleSpeed() {
    this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1;
    this.setButtonLabel(this.speedBtn, `${this.speed}x`);
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
    this.refreshHud();
    this.flash(`Wave ${this.waveIndex + 1}: here they come!`);
    this.hero?.react('waveStart');
  }

  private endWave() {
    const waveNumber = this.waveIndex + 1;
    const bonus = waveClearBonus(waveNumber);
    this.gold += bonus;
    this.waveIndex++;
    this.phase = 'build';
    if (this.waveIndex >= WAVES.length) { this.showEnd(true); return; }
    if (waveNumber % PUZZLE_EVERY === 0) this.openPuzzleBreak();
    else this.flash(`Wave ${waveNumber} cleared  +${bonus} gold`);
    this.hero?.react('waveCleared');
    this.refreshHud();
  }

  // ======================= UPDATE LOOP =======================
  update(_time: number, deltaMs: number) {
    this.drawCursor();
    if (this.phase !== 'wave') return;
    const dt = Math.min(deltaMs / 1000, 0.05) * this.speed;

    this.waveClock += dt;
    const hpScale = 1 + this.waveIndex * HP_SCALE_PER_WAVE;
    while (this.spawns.length && this.spawns[0].at <= this.waveClock) {
      const s = this.spawns.shift()!;
      this.enemies.push(new Enemy(this, ENEMIES[s.kind], hpScale, this.path));
    }

    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.move(dt)) {
        e.alive = false;
        this.baseHp -= e.def.leakDamage;
        this.hero?.react('baseHit');
        this.cameras.main.shake(140, 0.005);
        const end = toScreen(...PATH_WAYPOINTS[PATH_WAYPOINTS.length - 1]);
        this.puff(end.x, end.y - 20, 0xd9473b, 6);
      }
    }

    this.updateTowers(dt);
    this.updateProjectiles(dt);

    const before = this.enemies.length;
    this.enemies = this.enemies.filter(e => { if (!e.alive) e.destroy(); return e.alive; });
    if (before !== this.enemies.length) this.refreshHud();

    if (this.baseHp <= 0) { this.loseMap(); return; }
    if (!this.spawns.length && !this.enemies.length && !this.projectiles.length) this.endWave();
  }

  private towerRange(t: Tower) { return t.def.range * this.mods.range * (t.plot.def.high ? HIGH_GROUND_RANGE : 1); }
  private towerDamage(t: Tower) { return t.def.damage * this.mods.rankDamage[t.def.rank]; }

  private updateTowers(dt: number) {
    for (const plot of this.plots) {
      const t = plot.tower;
      if (!t) continue;
      t.tick(dt);
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      const range = this.towerRange(t);
      let target: Enemy | null = null;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.gx - t.tx, e.gy - t.ty);
        if (d <= range && d >= t.def.minRange && (!target || e.distance > target.distance)) target = e;
      }
      if (!target) continue;
      t.cooldown = t.def.fireDelay / this.mods.fireRate;
      const from = toScreen(t.tx, t.ty), to = target.screen;
      t.aim = Math.atan2((to.y - from.y) * 2, to.x - from.x);
      t.recoil = 4;
      t.draw();
      t.shoot(to.x);
      this.fire(t, target);
    }
  }

  private fire(t: Tower, target: Enemy) {
    const dmg = this.towerDamage(t);
    const from = toScreen(t.tx, t.ty);
    if (t.def.flightTime === 0) {
      this.damage(target, dmg);
      const to = target.screen;
      const mx = from.x + Math.cos(t.aim) * 22, my = from.y - t.muzzle + Math.sin(t.aim) * 11;
      const fx = this.add.graphics().setDepth(UI_DEPTH - 20);
      fx.lineStyle(3, 0xfff2a8, 0.95).lineBetween(mx, my, to.x, to.y - target.bodyHeight);
      fx.fillStyle(0xffd23f).fillCircle(mx, my, 6);
      fx.fillStyle(0xffffff).fillCircle(mx, my, 3);
      this.tweens.add({ targets: fx, alpha: 0, duration: 90, onComplete: () => fx.destroy() });
      return;
    }
    const isShell = t.def.splash > 0;
    this.projectiles.push({
      gfx: this.add.graphics(),
      sx: t.tx, sy: t.ty, tx: target.gx, ty: target.gy,
      startHeight: t.muzzle, endHeight: isShell ? 0 : target.bodyHeight,
      homing: isShell ? undefined : target, // arrows home in, mortar shells land where the target WAS
      t: 0, duration: t.def.flightTime,
      damage: dmg, splash: t.def.splash * this.mods.splash,
      arcHeight: isShell ? 130 : 45,
      kind: isShell ? 'shell' : 'arrow',
    });
  }

  private updateProjectiles(dt: number) {
    for (const p of this.projectiles) {
      p.t += dt;
      if (p.homing && p.homing.alive) { p.tx = p.homing.gx; p.ty = p.homing.gy; }
      const k = Math.min(1, p.t / p.duration);
      const gx = p.sx + (p.tx - p.sx) * k, gy = p.sy + (p.ty - p.sy) * k;
      const s = toScreen(gx, gy);
      const lift = p.startHeight + (p.endHeight - p.startHeight) * k + Math.sin(k * Math.PI) * p.arcHeight;
      const x = s.x, y = s.y - lift;
      const g = p.gfx.clear().setDepth(depthOf(gx, gy) + 50);
      g.fillStyle(0x000000, 0.22).fillEllipse(s.x, s.y, 10, 5);
      if (p.kind === 'arrow') {
        const last = p.last ?? { x: x - 1, y };
        const a = Math.atan2(y - last.y, x - last.x), len = 14;
        const bx = x - Math.cos(a) * len, by = y - Math.sin(a) * len;
        g.lineStyle(4, art.OUTLINE).lineBetween(bx, by, x, y);
        g.lineStyle(2, 0xe9dcc0).lineBetween(bx, by, x, y);
        g.fillStyle(0xffffff).fillCircle(bx, by, 2);
      } else {
        g.fillStyle(art.OUTLINE).fillCircle(x, y, 7.5);
        g.fillStyle(0x3a3a40).fillCircle(x, y, 5.5);
        g.fillStyle(0xff9a3c).fillCircle(x + 2, y - 2, 1.8);
      }
      p.last = { x, y };
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
      boom.fillStyle(0xff7a2a, 0.6).fillEllipse(x, y, w, h);
      boom.fillStyle(0xffd23f, 0.9).fillEllipse(x, y - 4, w * 0.45, h * 0.45);
      this.tweens.add({ targets: boom, alpha: 0, scale: 1.05, duration: 320, onComplete: () => boom.destroy() });
      this.puff(x, y - 6, 0x9c9488, 7);
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
    if (!e.alive) {
      const reward = Math.round(e.def.reward * this.mods.gold);
      this.gold += reward;
      const s = e.screen;
      this.puff(s.x, s.y - 10, 0x8fae78, 6);
      this.goldPop(s.x, s.y - 30, reward);
      this.hero?.react('kill');
    }
  }

  // ======================= EFFECTS =======================
  private puff(x: number, y: number, color: number, count: number) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random();
      const c = this.add.graphics().setPosition(x, y).setDepth(UI_DEPTH - 25);
      const r = 4 + Math.random() * 4;
      c.fillStyle(color).fillCircle(0, 0, r);
      c.lineStyle(2, art.OUTLINE, 0.6).strokeCircle(0, 0, r);
      this.tweens.add({
        targets: c, x: x + Math.cos(a) * 22, y: y + Math.sin(a) * 11 - 10, alpha: 0, scale: 0.4,
        duration: 380 + Math.random() * 180, ease: 'Cubic.easeOut', onComplete: () => c.destroy(),
      });
    }
  }

  private goldPop(x: number, y: number, amount: number) {
    const t = this.add.text(x, y, `+${amount}`, TEXT(16, '#ffe08a')).setOrigin(0.5).setDepth(UI_DEPTH - 5);
    this.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: 800, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  // ======================= RANGE OVERLAY =======================
  private drawCursor() {
    const g = this.cursorGfx;
    g.clear();
    const plot = this.menuPlot;
    if (!plot || this.overlay) return;
    const show = (r: number, minR: number) => {
      const s = plot.screen;
      const e = rangeEllipse(r);
      g.fillStyle(0xfff3b0, 0.12).fillEllipse(s.x, s.y, e.w, e.h);
      g.lineStyle(3, 0xfff3b0, 0.75).strokeEllipse(s.x, s.y, e.w, e.h);
      if (minR > 0) {
        const m = rangeEllipse(minR);
        g.lineStyle(2, 0xff8a7a, 0.7).strokeEllipse(s.x, s.y, m.w, m.h);
      }
    };
    const bonus = plot.def.high ? HIGH_GROUND_RANGE : 1;
    if (plot.tower) show(this.towerRange(plot.tower), plot.tower.def.minRange);
    else if (this.menuHoverKind) {
      const def = TOWERS[this.menuHoverKind];
      show(def.range * this.mods.range * bonus, def.minRange);
    }
  }

  // ======================= PUZZLE BREAK + UPGRADE DRAFT =======================
  private openOverlay(): Phaser.GameObjects.Container {
    this.closeMenu();
    this.overlay?.destroy();
    const c = this.add.container(0, 0).setDepth(OVERLAY_DEPTH);
    const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x120c08, 0.78).setInteractive();
    c.add(dim);
    this.overlay = c;
    if (this.phase !== 'over') this.phase = 'draft';
    this.refreshHud();
    return c;
  }

  private closeOverlay() {
    this.overlay?.destroy();
    this.overlay = null;
    if (this.phase === 'draft') this.phase = 'build';
    this.refreshHud();
  }

  private title(c: Phaser.GameObjects.Container, y: number, text: string, size = 32) {
    c.add(this.add.text(GAME_W / 2, y, text, { ...TEXT(size), align: 'center', wordWrap: { width: 900 } }).setOrigin(0.5));
  }

  // Placeholder until the real puzzles exist: pick the result to test the draft.
  private openPuzzleBreak() {
    const c = this.openOverlay();
    this.title(c, 200, 'The Nocimonorcen stirs… puzzle time!');
    this.title(c, 250, 'Puzzles arrive in a later build. For now, choose the result you "earned" to test the upgrade draft.', 17);
    const opts: [RewardTier, string, number][] = [
      ['fail', 'Failed', 0x9c4a4a], ['bronze', 'Bronze', TIER_COLOR.bronze], ['silver', 'Silver', TIER_COLOR.silver], ['gold', 'Gold', TIER_COLOR.gold],
    ];
    opts.forEach(([tier, label, color], i) => {
      c.add(this.button(GAME_W / 2 - 330 + i * 220, 340, 190, 52, label, color, () => this.openDraft(tier), 20).setDepth(OVERLAY_DEPTH + 1));
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
      this.card(c, 130 + i * 204, 340, opt, isUnlocked(opt.tier, tier), opt.power, () => this.take(opt, opt.power));
    });
  }

  private card(c: Phaser.GameObjects.Container, x: number, y: number, opt: UpgradeOption, unlocked: boolean, pct: number, onPick: () => void) {
    const w = 188, h = 250, col = TIER_COLOR[opt.tier];
    const g = this.add.graphics().setPosition(x, y);
    const paint = (hover: boolean) => {
      g.clear();
      g.fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2 + 3, -h / 2 + 5, w, h, 14);
      g.fillStyle(unlocked ? (hover ? 0x5a3c22 : 0x4a311c) : 0x2a2420).fillRoundedRect(-w / 2, -h / 2, w, h, 14);
      g.fillStyle(unlocked ? col : 0x4a4440).fillRoundedRect(-w / 2 + 6, -h / 2 + 6, w - 12, 30, 9);
      g.lineStyle(4, unlocked ? (hover ? 0xfff3b0 : art.OUTLINE) : 0x1a1410).strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
    };
    paint(false);
    c.add(g);
    const dim = unlocked ? 1 : 0.4;
    c.add(this.add.text(x, y - h / 2 + 21, opt.tier.toUpperCase(), { fontFamily: FONT, fontSize: '14px', color: '#2b1d12', fontStyle: 'bold' }).setOrigin(0.5));
    c.add(this.add.text(x, y - 50, opt.title, { ...TEXT(19), align: 'center', wordWrap: { width: w - 20 } }).setOrigin(0.5).setAlpha(dim));
    c.add(this.add.text(x, y + 10, opt.describe(pct), { ...TEXT(15, '#f3e9dc'), align: 'center', wordWrap: { width: w - 24 } }).setOrigin(0.5).setAlpha(dim));
    c.add(this.add.text(x, y + 70, opt.category, { fontFamily: FONT, fontSize: '13px', color: '#c9a77a' }).setOrigin(0.5).setAlpha(dim));
    if (!unlocked) {
      c.add(this.add.text(x, y + 100, `Requires ${opt.tier}`, TEXT(14, '#bfb3a5')).setOrigin(0.5));
      return;
    }
    const zone = this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => paint(true)).on('pointerout', () => paint(false)).on('pointerdown', onPick);
    c.add(zone);
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
      c.add(this.button(GAME_W / 2, 400, 240, 54, 'Try again', 0x5fae4e, () => this.scene.restart({ campaignLives: livesLeft }), 20).setDepth(OVERLAY_DEPTH + 1));
    } else this.showEnd(false);
  }

  private showEnd(won: boolean) {
    this.phase = 'over';
    const c = this.openOverlay();
    this.title(c, 260, won ? 'Groovy. Map cleared!' : 'Game over, man.');
    this.title(c, 310, won ? 'The boss wave and the next era come in later milestones.' : 'All 3 lives used. The campaign starts over.', 18);
    c.add(this.button(GAME_W / 2, 400, 240, 54, 'Play again', 0x5fae4e, () => this.scene.restart({ campaignLives: 3 }), 20).setDepth(OVERLAY_DEPTH + 1));
  }
}
