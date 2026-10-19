import Phaser from 'phaser';
import * as art from '../art';
import {
  ENEMIES, GAME_H, GAME_W, HIGH_GROUND_RANGE, HP_SCALE_PER_WAVE, LEVEL3_TRAIT, PATH_WAYPOINTS, PLOTS, PUZZLE_EVERY,
  SELL_REFUND, START_GOLD, START_LIVES, TOWER_LEVELS, TOWER_ORDER, TOWERS, TRAITS, TowerKind, WAVES, waveClearBonus,
} from '../config';
import { Enemy, Path, Plot, Projectile, Tower } from '../entities';
import { addAtmosphere } from '../atmosphere';
import { explosion, shotgunBlast } from '../effects';
import { SCENERY_LAYOUT } from '../sceneryLayout';
import { LayoutItem, SceneEditor, loadLayout } from '../editor';
import { audio, preloadAudio } from '../audio';
import { HeroPortrait } from '../hero';
import { depthOf, rangeEllipse, toScreen } from '../iso';
import {
  ARROW_TOWER, CABIN_CHIMNEY, SPRITES, SpriteMeta, SpriteName, TOWER_SPRITES, addSprite, hasSprite, preloadSprites, variants,
} from '../sprites';
import {
  Modifiers, PityTracker, RewardTier, UpgradeOption, applyOption, failurePick, freshModifiers, isUnlocked, rollDraft,
} from '../upgrades';

type Phase = 'build' | 'wave' | 'draft' | 'over';
interface PendingSpawn { at: number; kind: keyof typeof ENEMIES }
/** A patch of burning ground left by a level 3 bombard shell. */
interface FirePatch { gx: number; gy: number; r: number; dps: number; left: number; gfx: Phaser.GameObjects.Graphics; tick: number }

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
  private menuHoverUpgrade = false;
  private fires: FirePatch[] = [];
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
  private muteBtn!: Phaser.GameObjects.Container;
  private soundPanel: Phaser.GameObjects.Container | null = null;
  private overlay: Phaser.GameObjects.Container | null = null;
  /** Scene editor for the painted map's scenery (E key); null on the code-drawn map. */
  private editor: SceneEditor | null = null;
  private lifeIcons: Phaser.GameObjects.Image[] = [];
  private hero: HeroPortrait | null = null;

  constructor() { super('Game'); }

  init(data: { campaignLives?: number }) {
    this.campaignLives = data.campaignLives ?? 3;
    this.plots = [];
    this.enemies = [];
    this.projectiles = [];
    this.fires = [];
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
    preloadAudio(this);
  }

  create() {
    this.cameras.main.setBackgroundColor(art.PAL.grass);
    audio.attach(this);
    audio.playMusic('music_build');
    this.path = new Path(PATH_WAYPOINTS);
    this.drawGround();
    this.plots = PLOTS.map((def, i) => new Plot(this, def, i));
    this.drawScenery();
    addAtmosphere(this, GAME_W, GAME_H, UI_DEPTH);
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

    // The painted map has a fixed layout (src/sceneryLayout.ts), editable in game with the scene editor (E).
    if (hasSprite(this, 'map_ground')) {
      const items = loadLayout(SCENERY_LAYOUT).filter(i => hasSprite(this, i.name)).map(i => this.placeScenery(i));
      this.editor = new SceneEditor(this, items, {
        palette: (Object.keys(SPRITES) as SpriteName[]).filter(k => /^(tree|bush|rock)_\d$/.test(k)),
        shipped: SCENERY_LAYOUT,
        place: i => this.placeScenery(i),
        toGrid: (x, y) => this.toGridPoint(x, y),
        depthAt: depthOf,
        drawKeepClear: g => this.drawKeepClear(g),
        flash: msg => this.flash(msg),
        depth: OVERLAY_DEPTH + 50,
      });
      return;
    }

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

  /** One scenery sprite of the painted map's layout. */
  private placeScenery(item: LayoutItem) {
    const s = toScreen(item.gx, item.gy), meta: SpriteMeta = SPRITES[item.name];
    return addSprite(this, item.name, s.x, s.y).setDepth(depthOf(item.gx, item.gy))
      .setDisplaySize(meta.display[0] * item.scale, meta.display[1] * item.scale).setFlipX(item.flip)
      .setData('name', item.name);
  }

  /** Editor guide: the road, the build plots and the space towers take up, which scenery should leave free. */
  private drawKeepClear(g: Phaser.GameObjects.Graphics) {
    const e = rangeEllipse(0.95);
    g.fillStyle(0xff4d4d, 0.18);
    for (let d = 0; d <= this.path.length; d += 0.25) {
      const p = this.path.at(d), s = toScreen(p.gx, p.gy);
      g.fillEllipse(s.x, s.y, e.w, e.h);
    }
    for (const plot of this.plots) {
      const t = plot.top;
      g.fillStyle(0xff4d4d, 0.22).fillRect(t.x - 50, t.y - 98, 100, 120);
      g.lineStyle(2, 0xff8a7a, 0.8).strokeRect(t.x - 50, t.y - 98, 100, 120);
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
    zone.on('pointerover', () => paint(true)).on('pointerout', () => paint(false))
      .on('pointerdown', () => { audio.play('click'); onClick(); });
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
    this.muteBtn = this.button(GAME_W - 430, GAME_H - 42, 140, 50, audio.settings.muted ? 'Muted' : 'Sound', 0x7d8a99,
      () => this.toggleSoundPanel(), 17);
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
      const hit = this.overlay || this.editor?.active ? null : this.plotAt(p.worldX, p.worldY);
      if (hit !== this.hoverPlot) {
        this.hoverPlot?.setHover(false);
        hit?.setHover(true);
        this.hoverPlot = hit;
        this.input.setDefaultCursor(hit ? 'pointer' : 'default');
      }
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (this.overlay || this.editor?.active || over.length) return; // a button, menu item or the editor handled it
      if (this.soundPanel) { this.closeSoundPanel(); return; }
      const hit = this.plotAt(p.worldX, p.worldY);
      if (hit && hit !== this.menuPlot) this.openMenu(hit);
      else this.closeMenu();
    });
    const keys = this.input.keyboard!;
    // game shortcuts are off while the scene editor is open (it uses some of the same keys)
    const kb = { on: (event: string, fn: () => void) => keys.on(event, () => { if (!this.editor?.active) fn(); }) };
    TOWER_ORDER.forEach((kind, i) => kb.on(`keydown-${['ONE', 'TWO', 'THREE'][i]}`, () => {
      if (this.menuPlot && !this.menuPlot.tower) this.build(this.menuPlot, kind);
    }));
    kb.on('keydown-U', () => { if (this.menuPlot?.tower) this.upgrade(this.menuPlot); });
    kb.on('keydown-SPACE', () => this.startWave());
    kb.on('keydown-F', () => this.toggleSpeed());
    kb.on('keydown-M', () => this.toggleMute());
    kb.on('keydown-ESC', () => { this.closeMenu(); this.closeSoundPanel(); });
    keys.on('keydown-E', () => {
      if (!this.editor || this.overlay) return;
      this.closeMenu(); this.closeSoundPanel();
      this.editor.toggle();
    });
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
    this.menuHoverUpgrade = false;
  }

  /** (Re)builds the ring of options around the open plot. Called whenever gold changes. */
  private refreshMenu() {
    const plot = this.menuPlot;
    this.menu?.destroy();
    this.menu = null;
    this.upgradeInfo = null;
    this.hoverTitle = null;
    if (!plot || this.overlay) return;
    const { x, y } = plot.top;
    const c = this.add.container(x, y - 6).setDepth(MENU_DEPTH);
    this.menu = c;
    // a braided gold rope ring linking the buttons
    const ring = this.add.graphics();
    ring.lineStyle(9, art.OUTLINE, 0.55).strokeCircle(0, 0, 60);
    ring.lineStyle(5, 0xc9963f, 1).strokeCircle(0, 0, 60);
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      ring.lineStyle(1.5, 0x7a5420, 0.9)
        .lineBetween(Math.cos(a) * 57.5, Math.sin(a) * 57.5, Math.cos(a + 0.08) * 62.5, Math.sin(a + 0.08) * 62.5);
    }
    c.add(ring);

    // titles sit above the top button; high ground adds one more line above that
    const titleY = -106;
    if (plot.def.high) this.plaque(c, 'High ground: +25% range', titleY - 32, '#c9f0a0');

    if (!plot.tower) {
      TOWER_ORDER.forEach((kind, i) => {
        const def = TOWERS[kind];
        const ang = Phaser.Math.DegToRad(-150 + i * 60);
        this.menuOption(c, Math.cos(ang) * 60, Math.sin(ang) * 60, this.gold >= def.cost, `${def.cost}`,
          (ix, iy) => this.towerIcon(kind, ix, iy),
          () => this.build(plot, kind),
          on => { this.menuHoverKind = on ? kind : null; this.setHoverTitle(on ? (def.note ? `${def.name} (${def.note})` : def.name) : ''); },
        );
      });
      this.hoverTitle = this.plaque(c, ' ', titleY).setVisible(false);
    } else {
      const t = plot.tower;
      this.plaque(c, `${t.def.name}  ·  Lv ${t.level}`, titleY);
      if (t.level < TOWER_LEVELS.max) {
        const cost = this.upgradeCost(t);
        this.menuOption(c, 0, -60, this.gold >= cost, `${cost}`,
          (ix, iy) => this.menuIcon('icon_upgrade', ix, iy, () => {
            const g = this.add.graphics().setPosition(ix, iy);
            art.upgradeIcon(g);
            return g;
          }),
          () => this.upgrade(plot),
          on => { this.menuHoverUpgrade = on; this.refreshUpgradeInfo(); });
      } else {
        this.menuOption(c, 0, -60, true, 'MAX',
          (ix, iy) => this.menuIcon('icon_max', ix, iy, () => {
            const g = this.add.graphics().setPosition(ix, iy);
            art.upgradeIcon(g);
            return g;
          }),
          () => {}, () => {});
      }
      const refund = this.refund(t);
      this.menuOption(c, 0, 60, true, `+${refund}`,
        (ix, iy) => this.menuIcon('icon_sell', ix, iy, () => {
          const g = this.add.graphics().setPosition(ix, iy);
          art.coinIcon(g, 0, 0, 13);
          return g;
        }),
        () => this.sell(plot), () => {});
      this.upgradeInfo = this.add.text(0, 112, '', { ...TEXT(13, '#fff3b0'), align: 'center' })
        .setOrigin(0.5, 0).setData('keepOnScreen', true);
      c.add(this.upgradeInfo);
      this.refreshUpgradeInfo();
    }
    this.keepMenuTextOnScreen();
  }

  private hoverTitle: Phaser.GameObjects.Container | null = null;

  /** Shows the hovered tower's name on the title plaque of the build ring. */
  private setHoverTitle(text: string) {
    const p = this.hoverTitle;
    if (!p || !p.active) return;
    if (!text) { p.setVisible(false); return; }
    this.fillPlaque(p, text);
    p.setVisible(true);
    this.keepMenuTextOnScreen();
  }

  /** A small wooden plaque with a line of text, added to the menu container. */
  private plaque(c: Phaser.GameObjects.Container, text: string, y: number, color = '#fff7e6') {
    const p = this.add.container(0, y).setData('keepOnScreen', true).setData('color', color);
    c.add(p);
    this.fillPlaque(p, text);
    return p;
  }

  private fillPlaque(p: Phaser.GameObjects.Container, text: string) {
    p.removeAll(true);
    const t = this.add.text(0, 0, text, TEXT(14, p.getData('color'))).setOrigin(0.5);
    const w = t.width + 30, h = 32;
    if (hasSprite(this, 'ui_panel')) {
      p.add(this.add.nineslice(0, 0, SPRITES.ui_panel.key, undefined, w * 2, h * 2, 40, 40, 20, 20).setScale(0.5));
    } else {
      const g = this.add.graphics();
      g.fillStyle(0x2b1d12, 0.9).fillRoundedRect(-w / 2, -h / 2, w, h, 8);
      p.add(g);
    }
    p.add(t);
    p.setData('halfWidth', w / 2);
  }

  /** A painted icon from the sprite set, or the code-drawn fallback. */
  private menuIcon(name: SpriteName, x: number, y: number, fallback: () => Phaser.GameObjects.GameObject) {
    if (!hasSprite(this, name)) return fallback();
    return addSprite(this, name, x, y).setDisplaySize(30, 30);
  }

  /** The painted level 1 tower shrunk into a button (code art when sprites are missing). */
  private towerIcon(kind: TowerKind, x: number, y: number): Phaser.GameObjects.GameObject {
    const name = TOWER_SPRITES[kind]?.[0];
    if (!name || !hasSprite(this, name)) {
      const g = this.add.graphics().setPosition(x, y + 16).setScale(0.5);
      art.tower(g, kind, Math.PI * 0.25);
      return g;
    }
    const meta: SpriteMeta = SPRITES[name];
    const k = 44 / meta.display[1];
    const w = meta.display[0] * k, h = meta.display[1] * k;
    // centre the picture in the button: shift from its ground anchor to the middle of the image
    const cx = x + (meta.origin[0] - 0.5) * w, cy = y + (meta.origin[1] - 0.5) * h + 2;
    const box = this.add.container(0, 0);
    box.add(this.add.image(cx, cy, meta.key).setOrigin(meta.origin[0], meta.origin[1]).setDisplaySize(w, h));
    if (kind === 'arrow' && hasSprite(this, 'archer')) {
      const top = cy - h * meta.origin[1];
      const a = SPRITES.archer;
      box.add(this.add.image(cx + (0.5 - meta.origin[0]) * w, top + h * ARROW_TOWER.archerFeetY, a.key)
        .setOrigin(0.5, 1).setDisplaySize(a.display[0] * k, a.display[1] * k));
    }
    return box;
  }

  private upgradeInfo: Phaser.GameObjects.Text | null = null;

  /** Shows what the next level brings while the upgrade button is hovered. */
  private refreshUpgradeInfo() {
    const t = this.menuPlot?.tower;
    if (!this.upgradeInfo || !t) return;
    if (t.level >= TOWER_LEVELS.max) {
      const trait = LEVEL3_TRAIT[t.def.kind];
      this.upgradeInfo.setText(`${trait.name}: ${trait.text}`);
      return;
    }
    if (!this.menuHoverUpgrade) { this.upgradeInfo.setText(''); return; }
    const n = t.level; // index of the next level
    const pct = (v: number[]) => Math.round((v[n] - 1) * 100);
    let text = `Level ${n + 1}: +${pct(TOWER_LEVELS.damage)}% damage, +${pct(TOWER_LEVELS.fireRate)}% rate, +${pct(TOWER_LEVELS.range)}% range\n(compared to level 1)`;
    if (n + 1 === TOWER_LEVELS.max) {
      const trait = LEVEL3_TRAIT[t.def.kind];
      text += `\n${trait.name}: ${trait.text}`;
    }
    this.upgradeInfo.setText(text);
    this.keepMenuTextOnScreen();
  }

  /** Slides the menu's centred labels (not the price tags) sideways so they never run off the screen edge. */
  private keepMenuTextOnScreen() {
    const c = this.menu;
    if (!c) return;
    for (const o of c.list) {
      if (!(o instanceof Phaser.GameObjects.Text || o instanceof Phaser.GameObjects.Container) || !o.getData('keepOnScreen')) continue;
      const half = o instanceof Phaser.GameObjects.Text ? o.width / 2 : (o.getData('halfWidth') ?? 0), margin = 8;
      const min = margin + half - c.x, max = GAME_W - margin - half - c.x;
      o.x = Phaser.Math.Clamp(0, min, max);
    }
  }

  private menuOption(
    c: Phaser.GameObjects.Container, x: number, y: number, enabled: boolean, price: string,
    icon: (x: number, y: number) => Phaser.GameObjects.GameObject, onPick: () => void, onHover: (on: boolean) => void,
  ) {
    const painted = hasSprite(this, 'ui_button_round');
    const shadow = this.add.graphics().setPosition(x, y);
    shadow.fillStyle(0x000000, 0.35).fillCircle(2, 4, 28);
    const halo = this.add.graphics().setPosition(x, y).setVisible(false);
    halo.lineStyle(6, 0xfff3b0, 0.85).strokeCircle(0, 0, 30);
    let btn: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
    if (painted) {
      btn = addSprite(this, 'ui_button_round', x, y);
      if (!enabled) btn.setTint(0x7d7068);
    } else {
      const g = this.add.graphics().setPosition(x, y);
      g.fillStyle(enabled ? 0x8a5a30 : 0x4a4038).fillCircle(0, 0, 25);
      g.lineStyle(3, art.OUTLINE).strokeCircle(0, 0, 25);
      btn = g;
    }
    const ic = icon(x, y);
    if (!enabled) (ic as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(0.5);

    // price on a little wooden plank under the button
    const tag = this.add.container(x, y + 34);
    const tagW = 60, tagH = 26;
    if (hasSprite(this, 'ui_panel')) {
      const ns = this.add.nineslice(0, 0, SPRITES.ui_panel.key, undefined, tagW * 2, tagH * 2, 36, 36, 18, 18).setScale(0.5);
      if (!enabled) ns.setTint(0x8a6a62);
      tag.add(ns);
    } else {
      const g = this.add.graphics();
      g.fillStyle(enabled ? 0x2b1d12 : 0x4a1f1f, 0.92).fillRoundedRect(-tagW / 2, -tagH / 2, tagW, tagH, 8);
      tag.add(g);
    }
    if (price !== 'MAX') {
      if (hasSprite(this, 'icon_coin')) tag.add(addSprite(this, 'icon_coin', -16, 0).setDisplaySize(16, 16));
      else { const g = this.add.graphics(); art.coinIcon(g, -16, 0, 6); tag.add(g); }
    }
    tag.add(this.add.text(price === 'MAX' ? 0 : 7, 0, price, TEXT(13, enabled ? '#ffe08a' : '#ffb0a0')).setOrigin(0.5));

    const zone = this.add.zone(x, y, 58, 58).setInteractive({ useHandCursor: enabled });
    const base = btn.scaleX;
    zone.on('pointerover', () => { halo.setVisible(enabled); btn.setScale(base * 1.08); onHover(true); })
      .on('pointerout', () => { halo.setVisible(false); btn.setScale(base); onHover(false); })
      .on('pointerdown', () => { if (enabled) { audio.play('click'); onPick(); } else this.noGold(); });
    c.add([shadow, halo, btn, ic, tag, zone]);
  }

  private build(plot: Plot, kind: TowerKind) {
    const def = TOWERS[kind];
    if (plot.tower || this.phase === 'over') return;
    if (this.gold < def.cost) { this.noGold(); return; }
    this.gold -= def.cost;
    plot.tower = new Tower(this, def, plot);
    audio.play('build', { x: plot.top.x });
    this.hero?.react('towerBuilt');
    plot.draw();
    this.puff(plot.top.x, plot.top.y, 0xd9c4a0, 8);
    this.closeMenu();
    this.refreshHud();
  }

  private upgradeCost(t: Tower) {
    return Math.round(t.def.cost * TOWER_LEVELS.cost[t.level] * this.mods.upgradeCost);
  }

  private refund(t: Tower) { return Math.floor(t.spent * SELL_REFUND); }

  /** Gold upgrade to the next level; allowed during waves too. */
  private upgrade(plot: Plot) {
    const t = plot.tower;
    if (!t || t.level >= TOWER_LEVELS.max || this.phase === 'over') return;
    const cost = this.upgradeCost(t);
    if (this.gold < cost) { this.noGold(); return; }
    this.gold -= cost;
    t.spent += cost;
    t.setLevel(t.level + 1);
    audio.play('upgrade', { x: plot.top.x });
    this.hero?.react('towerBuilt');
    this.puff(plot.top.x, plot.top.y - 20, 0xfff3b0, 10);
    if (t.level === TOWER_LEVELS.max) this.flash(`${LEVEL3_TRAIT[t.def.kind].name}!`);
    this.refreshHud();
  }

  private sell(plot: Plot) {
    const t = plot.tower;
    if (!t) return;
    const refund = this.refund(t);
    this.gold += refund;
    this.goldPop(plot.top.x, plot.top.y - 30, refund);
    audio.play('sell', { x: plot.top.x });
    this.hero?.react('towerSold');
    t.destroy();
    plot.tower = null;
    plot.draw();
    this.closeMenu();
    this.refreshHud();
  }

  private noGold() {
    audio.play('denied');
    this.flash('Not enough gold');
  }

  private toggleMute() {
    const muted = audio.toggleMute();
    this.setButtonLabel(this.muteBtn, muted ? 'Muted' : 'Sound');
    if (this.soundPanel) this.openSoundPanel(); // refresh the mute button inside the panel
  }

  // ======================= SOUND PANEL =======================
  private toggleSoundPanel() {
    if (this.soundPanel) this.closeSoundPanel();
    else this.openSoundPanel();
  }

  private closeSoundPanel() {
    this.soundPanel?.destroy();
    this.soundPanel = null;
  }

  /** A small wooden panel above the Sound button: effects and music volume sliders and a mute toggle. */
  private openSoundPanel() {
    this.closeSoundPanel();
    const w = 320, h = 230;
    const c = this.add.container(GAME_W - 430, GAME_H - 80 - h / 2).setDepth(MENU_DEPTH + 10);
    this.soundPanel = c;
    if (hasSprite(this, 'ui_panel')) {
      c.add(this.add.nineslice(0, 0, SPRITES.ui_panel.key, undefined, w * 2, h * 2, 60, 60, 30, 30).setScale(0.5));
    } else {
      const g = this.add.graphics();
      g.fillStyle(0x3a2a1c, 0.95).fillRoundedRect(-w / 2, -h / 2, w, h, 12);
      c.add(g);
    }
    // swallow clicks on the panel background so they don't reach the map underneath
    c.add(this.add.zone(0, 0, w, h).setInteractive());
    c.add(this.add.text(0, -h / 2 + 26, 'Sound', TEXT(18)).setOrigin(0.5));
    this.volumeSlider(c, -38, 'Effects', 'sfx');
    this.volumeSlider(c, 0, 'Music', 'music');
    this.volumeSlider(c, 38, 'Voice', 'voice');
    const muted = audio.settings.muted;
    const mute = this.button(0, 0, 150, 40, muted ? 'Unmute (M)' : 'Mute all (M)', muted ? 0xb5652a : 0x7d8a99, () => this.toggleMute(), 15);
    mute.setPosition(0, h / 2 - 38);
    c.add(mute);
  }

  private volumeSlider(c: Phaser.GameObjects.Container, y: number, label: string, kind: 'sfx' | 'music' | 'voice') {
    const x0 = -52, len = 150;
    c.add(this.add.text(-136, y, label, TEXT(15)).setOrigin(0, 0.5));
    const track = this.add.graphics();
    const pct = this.add.text(x0 + len + 16, y, '', TEXT(14, '#ffe08a')).setOrigin(0, 0.5);
    const knob = hasSprite(this, 'ui_button_round')
      ? addSprite(this, 'ui_button_round', 0, y).setDisplaySize(24, 24)
      : this.add.circle(0, y, 11, 0xc9963f).setStrokeStyle(3, art.OUTLINE);
    const draw = (v: number) => {
      track.clear();
      track.fillStyle(art.OUTLINE, 0.85).fillRoundedRect(x0 - 3, y - 7, len + 6, 14, 7);
      track.fillStyle(0x5a4636).fillRoundedRect(x0, y - 4, len, 8, 4);
      track.fillStyle(0xe9b44c).fillRoundedRect(x0, y - 4, Math.max(8, len * v), 8, 4);
      knob.x = x0 + len * v;
      pct.setText(`${Math.round(v * 100)}%`);
    };
    const set = (pointer: Phaser.Input.Pointer) => {
      const v = Phaser.Math.Clamp((pointer.worldX - (c.x + x0)) / len, 0, 1);
      audio.setVolume(kind, v);
      draw(v);
    };
    draw(audio.settings[kind]);
    // click anywhere on the bar to jump there, or drag the knob
    const hit = this.add.zone(x0 + len / 2, y, len + 24, 30).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', (p: Phaser.Input.Pointer) => set(p));
    hit.on('pointermove', (p: Phaser.Input.Pointer) => { if (p.isDown) set(p); });
    hit.on('pointerup', () => { if (kind === 'sfx') audio.play('click'); });
    knob.setInteractive({ useHandCursor: true, draggable: true });
    knob.on('drag', (p: Phaser.Input.Pointer) => set(p));
    knob.on('dragend', () => { if (kind === 'sfx') audio.play('click'); });
    c.add([track, pct, hit, knob]);
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
    audio.play('wave_start');
    audio.playMusic('music_wave');
    this.hero?.react('waveStart');
  }

  private endWave() {
    const waveNumber = this.waveIndex + 1;
    const bonus = waveClearBonus(waveNumber);
    this.gold += bonus;
    this.waveIndex++;
    this.phase = 'build';
    audio.playMusic('music_build');
    if (this.waveIndex < WAVES.length) audio.play('wave_clear');
    if (this.waveIndex >= WAVES.length) { this.showEnd(true); return; }
    if (waveNumber % PUZZLE_EVERY === 0) this.openPuzzleBreak();
    else this.flash(`Wave ${waveNumber} cleared  +${bonus} gold`);
    this.hero?.react('waveCleared');
    this.refreshHud();
  }

  // ======================= UPDATE LOOP =======================
  update(_time: number, deltaMs: number) {
    this.drawCursor();
    if (this.phase !== 'wave' || this.editor?.active) return;
    const dt = Math.min(deltaMs / 1000, 0.05) * this.speed;

    this.waveClock += dt;
    const hpScale = 1 + this.waveIndex * HP_SCALE_PER_WAVE;
    while (this.spawns.length && this.spawns[0].at <= this.waveClock) {
      const s = this.spawns.shift()!;
      this.enemies.push(new Enemy(this, ENEMIES[s.kind], hpScale, this.path));
      const from = toScreen(...PATH_WAYPOINTS[0]);
      if (s.kind === 'fast') audio.play('crawler_screech', { x: from.x });
      else if (Math.random() < 0.4) audio.play('zombie_groan', { x: from.x });
    }

    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.move(dt)) {
        e.alive = false;
        this.baseHp -= e.def.leakDamage;
        this.hero?.react('baseHit');
        audio.play('base_hit');
        this.cameras.main.shake(140, 0.005);
        const end = toScreen(...PATH_WAYPOINTS[PATH_WAYPOINTS.length - 1]);
        this.puff(end.x, end.y - 20, 0xd9473b, 6);
      }
    }

    this.updateTowers(dt);
    this.updateProjectiles(dt);
    this.updateFires(dt);

    const before = this.enemies.length;
    this.enemies = this.enemies.filter(e => { if (!e.alive) e.destroy(); return e.alive; });
    if (before !== this.enemies.length) this.refreshHud();

    if (this.baseHp <= 0) { this.loseMap(); return; }
    if (!this.spawns.length && !this.enemies.length && !this.projectiles.length) this.endWave();
  }

  private towerRange(t: Tower, level = t.level) {
    return t.def.range * TOWER_LEVELS.range[level - 1] * this.mods.range * (t.plot.def.high ? HIGH_GROUND_RANGE : 1);
  }
  private towerDamage(t: Tower) { return t.def.damage * TOWER_LEVELS.damage[t.level - 1] * this.mods.rankDamage[t.def.rank]; }
  private towerFireDelay(t: Tower) { return t.def.fireDelay / (this.mods.fireRate * TOWER_LEVELS.fireRate[t.level - 1]); }

  /** Enemies in a tower's reach, furthest along the path first. */
  private targetsFor(t: Tower): Enemy[] {
    const range = this.towerRange(t);
    return this.enemies
      .filter(e => { if (!e.alive) return false; const d = Math.hypot(e.gx - t.tx, e.gy - t.ty); return d <= range && d >= t.def.minRange; })
      .sort((a, b) => b.distance - a.distance);
  }

  private updateTowers(dt: number) {
    for (const plot of this.plots) {
      const t = plot.tower;
      if (!t) continue;
      t.tick(dt);
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      const targets = this.targetsFor(t);
      const target = targets[0];
      if (!target) continue;
      t.cooldown = this.towerFireDelay(t);
      const from = toScreen(t.tx, t.ty), to = target.screen;
      t.aim = Math.atan2((to.y - from.y) * 2, to.x - from.x);
      t.recoil = 4;
      t.draw();
      t.shoot(to.x);
      audio.play(t.def.kind === 'arrow' ? 'arrow_shot' : t.def.kind === 'mg' ? 'boomstick_shot' : 'bombard_shot', { x: from.x });
      this.fire(t, target);
      if (t.def.kind === 'arrow' && t.level >= 3) {
        // Twin Archers: the second archer picks another target when there is one
        const second = targets[1] ?? target;
        this.time.delayedCall(140, () => {
          if (!t.plot.tower || !second.alive) return;
          t.shootSecond(second.screen.x);
          audio.play('arrow_shot', { x: t.plot.top.x });
          this.fire(t, second);
        });
      }
    }
  }

  private fire(t: Tower, target: Enemy) {
    const dmg = this.towerDamage(t);
    const from = toScreen(t.tx, t.ty);
    if (t.def.flightTime === 0) {
      // Buckshot (level 3): the shot carries on into the enemies bunched up behind the target
      const pierced = t.def.kind === 'mg' && t.level >= 3
        ? this.enemies
          .filter(e => e !== target && e.alive && Math.hypot(e.gx - target.gx, e.gy - target.gy) <= TRAITS.pierceRadius)
          .sort((a, b) => Math.hypot(a.gx - target.gx, a.gy - target.gy) - Math.hypot(b.gx - target.gx, b.gy - target.gy))
          .slice(0, TRAITS.pierceTargets)
        : [];
      const pellets = t.def.pellets ?? 1;
      this.damage(target, dmg, pellets);
      const to = target.screen;
      const mp = t.muzzlePoint;
      const mx = mp?.x ?? from.x + Math.cos(t.aim) * 22, my = mp?.y ?? from.y - t.muzzle + Math.sin(t.aim) * 11;
      // shotgun blast: pellets to the target, and on with Buckshot into the enemies bunched up behind it
      const hits = [{ x: to.x, y: to.y - target.bodyHeight * 0.6, armored: target.def.armor > 0 }];
      for (const e of pierced) {
        const p = e.screen;
        hits.push({ x: p.x, y: p.y - e.bodyHeight * 0.6, armored: e.def.armor > 0 });
        this.damage(e, dmg * TRAITS.pierceDamage, pellets);
      }
      shotgunBlast(this, mx, my, hits, UI_DEPTH - 22);
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
      burns: t.def.kind === 'mortar' && t.level >= 3,
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
      audio.play('explosion', { x });
      explosion(this, x, y, w, h, UI_DEPTH - 34);
      for (const e of this.enemies) {
        if (e.alive && Math.hypot(e.gx - p.tx, e.gy - p.ty) <= p.splash) this.damage(e, p.damage);
      }
      if (p.burns) this.addFire(p.tx, p.ty, p.splash * TRAITS.fireRadius, p.damage * TRAITS.fireDps);
    } else if (p.homing && p.homing.alive) {
      audio.play('arrow_hit', { x: p.homing.screen.x });
      this.damage(p.homing, p.damage);
    }
  }

  // ======================= BURNING GROUND (bombard level 3) =======================
  private addFire(gx: number, gy: number, r: number, dps: number) {
    const s = toScreen(gx, gy);
    // a ground decal: under every plot, tower and enemy
    const gfx = this.add.graphics().setPosition(s.x, s.y).setDepth(60);
    this.fires.push({ gx, gy, r, dps, left: TRAITS.fireDuration, gfx, tick: 0 });
    audio.play('hellfire', { x: s.x });
  }

  private updateFires(dt: number) {
    for (const f of this.fires) {
      f.left -= dt;
      f.tick -= dt;
      // damage in small pulses so the hit flash reads as burning
      if (f.tick <= 0) {
        f.tick = 0.25;
        for (const e of this.enemies) {
          if (e.alive && Math.hypot(e.gx - f.gx, e.gy - f.gy) <= f.r) this.damage(e, f.dps * 0.25);
        }
      }
      const fade = Math.min(1, f.left / 0.6);
      const { w, h } = rangeEllipse(f.r);
      const t = this.time.now / 1000;
      const g = f.gfx.clear();
      g.fillStyle(0x3a1a0c, 0.45 * fade).fillEllipse(0, 0, w, h);
      g.fillStyle(0xff5a1f, 0.35 * fade).fillEllipse(0, 0, w * 0.8, h * 0.8);
      g.fillStyle(0xffb03a, 0.3 * fade).fillEllipse(0, 0, w * 0.45, h * 0.45);
      for (let i = 0; i < 6; i++) {
        const a = i * 1.7 + f.gx;
        const fx = Math.cos(a) * w * 0.3, fy = Math.sin(a) * h * 0.3;
        const fh = (7 + 4 * Math.sin(t * 9 + i * 2.3)) * fade;
        g.fillStyle(0xff7a1f, 0.9 * fade).fillTriangle(fx - 4, fy, fx + 4, fy, fx, fy - fh);
        g.fillStyle(0xffe07a, 0.9 * fade).fillTriangle(fx - 2, fy, fx + 2, fy, fx, fy - fh * 0.55);
      }
    }
    for (const f of this.fires) if (f.left <= 0) f.gfx.destroy();
    this.fires = this.fires.filter(f => f.left > 0);
  }

  private damage(e: Enemy, amount: number, pellets = 1) {
    if (!e.alive) return;
    e.hit(amount, pellets);
    if (!e.alive) {
      const reward = Math.round(e.def.reward * this.mods.gold);
      this.gold += reward;
      const s = e.screen;
      this.puff(s.x, s.y - 10, 0x8fae78, 6);
      this.goldPop(s.x, s.y - 30, reward);
      audio.play(e.def.kind === 'fast' ? 'crawler_death' : e.def.kind === 'armored' ? 'knight_death' : 'zombie_death', { x: s.x });
      audio.play('coin', { x: s.x });
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
    if (plot.tower) {
      const t = plot.tower;
      const next = this.menuHoverUpgrade && t.level < TOWER_LEVELS.max ? t.level + 1 : t.level;
      show(this.towerRange(t, next), t.def.minRange);
    }
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
    audio.play('defeat');
    const c = this.openOverlay();
    if (livesLeft > 0) {
      this.title(c, 260, 'The deadites got to the cabin.');
      this.title(c, 310, `You lose a life. ${livesLeft} ${livesLeft === 1 ? 'life' : 'lives'} left. The map restarts.`, 18);
      c.add(this.button(GAME_W / 2, 400, 240, 54, 'Try again', 0x5fae4e, () => this.scene.restart({ campaignLives: livesLeft }), 20).setDepth(OVERLAY_DEPTH + 1));
    } else this.showEnd(false);
  }

  private showEnd(won: boolean) {
    if (won) audio.play('victory');
    this.phase = 'over';
    const c = this.openOverlay();
    this.title(c, 260, won ? 'Groovy. Map cleared!' : 'Game over, man.');
    this.title(c, 310, won ? 'The boss wave and the next era come in later milestones.' : 'All 3 lives used. The campaign starts over.', 18);
    c.add(this.button(GAME_W / 2, 400, 240, 54, 'Play again', 0x5fae4e, () => this.scene.restart({ campaignLives: 3 }), 20).setDepth(OVERLAY_DEPTH + 1));
  }
}
