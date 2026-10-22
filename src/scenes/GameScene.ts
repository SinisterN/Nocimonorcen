import Phaser from 'phaser';
import * as art from '../art';
import {
  ENEMIES, GAME_H, GAME_W, HIGH_GROUND_RANGE, WAVE_SIZE, hpScaleForWave, LEVEL3_TRAIT, PATH_WAYPOINTS, PLOTS, PUZZLE_EVERY,
  ENEMY_ATTACKS, ERA_ID, KILL_GOLD_PER_WAVE, KILLER, PATH_LANES, TITAN_ATTACKS, KNOCKBACK, REPAIR_COST, SHAMAN_HEAL, SELL_REFUND, START_GOLD, setEra, START_LIVES, TOWER_LEVELS, TOWER_ORDER, TOWERS, TRAITS, TowerKind, WAVES, waveClearBonus,
} from '../config';
import { DeathStyle, Enemy, LANE_MAX, Path, Plot, Projectile, Tower } from '../entities';
import { addAtmosphere } from '../atmosphere';
import { explosion, muzzleFlash, railBeam, rocketSmoke, shotgunBlast, sparkBurst, tracerBurst } from '../effects';
import { eraLook } from '../era';
import { SCENERY_LAYOUT } from '../sceneryLayout';
import { LayoutItem, SceneEditor, loadLayout } from '../editor';
import { Tutorial, TutorialEvent } from '../tutorial';
import { ERA2_READY, ERA3_READY, GameMode } from './MenuScene';
import { audio, preloadAudio } from '../audio';
import { preloadRigs } from '../rig/rigView';
import { preloadSheetAnims } from '../sheetAnim';
import { preloadTowerAnims } from '../towerAnim';
import { HeroPortrait } from '../hero';
import { KillerCrew } from '../killer';
import { preloadCrewAnims } from '../crewAnim';
import { depthOf, rangeEllipse, toScreen } from '../iso';
import {
  ARROW_TOWER, CABIN_CHIMNEY, SPRITES, SpriteMeta, SpriteName, TOWER_SPRITES, addSprite, hasSprite, preloadSprites, variants,
} from '../sprites';
import {
  Modifiers, PityTracker, UpgradeOption, applyOption, failurePick, freshModifiers, isUnlocked, rollDraft,
  Rating, freshPerf, ratePerf,
} from '../upgrades';

type Phase = 'build' | 'wave' | 'draft' | 'over';
interface PendingSpawn { at: number; kind: keyof typeof ENEMIES; group: number; lane: number }
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
  /** How this game was started from the menu. */
  private mode: GameMode = 'era1';
  private tutorial: Tutorial | null = null;
  /** Playing through the eras in order (the menu's Start Campaign): winning an era moves on to the next. */
  private inCampaign = false;

  // map state
  private path!: Path;
  /** Every lane of the road (era 3 forks around the market square); `path` is the first. */
  private paths: Path[] = [];
  /** Titan killer towers' fighters. */
  private crews = new Map<Tower, KillerCrew>();

  private plots: Plot[] = [];
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private spawns: PendingSpawn[] = [];
  private waveClock = 0;
  private waveIndex = 0; // index of the NEXT wave to start
  private phase: Phase = 'build';
  private gold = START_GOLD;
  private baseHp = START_LIVES;
  /** How the defence is doing in the current block of waves (between two upgrade drafts); rates the draft. */
  private perf = freshPerf(START_LIVES);
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

  init(data: { campaignLives?: number; mode?: GameMode; campaign?: boolean }) {
    this.campaignLives = data.campaignLives ?? 3;
    this.mode = data.mode ?? 'era1';
    this.inCampaign = data.mode === 'campaign' || !!data.campaign;
    setEra(this.mode === 'era2' ? 'era2' : this.mode === 'era3' ? 'era3' : 'era1');
    this.tutorial = null;
    this.plots = [];
    this.enemies = [];
    this.projectiles = [];
    this.fires = [];
    this.spawns = [];
    this.attackClock.clear();
    this.crews.clear();
    this.boss = null; this.bossBar = null; this.bossFill = null;
    this.waveIndex = 0;
    this.phase = 'build';
    this.gold = START_GOLD;
    this.baseHp = START_LIVES;
    this.perf = freshPerf(START_LIVES);
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
    preloadSprites(this, ERA_ID);
    preloadRigs(this);
    preloadSheetAnims(this, ERA_ID);
    preloadTowerAnims(this);
    if (ERA_ID === 'era3') preloadCrewAnims(this);
    preloadAudio(this, ERA_ID);
  }

  create() {
    this.cameras.main.setBackgroundColor(art.PAL.grass);
    audio.attach(this);
    audio.playMusic(eraLook().music.build);
    this.paths = PATH_LANES.map(l => new Path(l));
    this.path = this.paths[0];
    this.drawGround();
    this.plots = PLOTS.map((def, i) => new Plot(this, def, i));
    this.drawScenery();
    addAtmosphere(this, GAME_W, GAME_H, UI_DEPTH, eraLook().atmosphere);
    this.cursorGfx = this.add.graphics().setDepth(UI_DEPTH - 10);
    this.buildHud();
    if (hasSprite(this, 'hero_neutral')) this.hero = new HeroPortrait(this, UI_DEPTH + 5);
    this.bindInput();
    this.refreshHud();
    if (this.mode === 'editor' && this.editor) {
      this.editor.open();
      this.flash('Level editor: drag scenery around, press E to play-test');
    } else if (this.mode === 'tutorial') {
      this.gold = 400;
      this.refreshHud();
      const plot = this.plots[0];
      this.tutorial = new Tutorial(this, {
        plotPoint: () => plot.top,
        startButton: () => ({ x: this.startBtn.x, y: this.startBtn.y }),
        soundButton: () => ({ x: this.muteBtn.x, y: this.muteBtn.y }),
        waveCleared: () => this.waveIndex > 0 && this.phase !== 'wave',
        toMenu: () => this.scene.start('Menu'),
        playEra1: () => this.scene.start('Game', { mode: 'era1', campaignLives: 3 }),
        depth: OVERLAY_DEPTH - 100,
      });
    } else this.flash('Click a stone plot to build a tower');
    this.applySandbox();
  }

  /**
   * Preview builds only (never on the live site): ?sandbox gives lots of gold, &wave=N starts at wave N, so new
   * towers and titans can be tried without playing through.
   */
  private applySandbox() {
    const q = new URLSearchParams(location.search);
    const preview = import.meta.env.VITE_PREVIEW === '1';
    if ((!q.has('sandbox') && !preview) || location.hostname.endsWith('nocimonorcen-td.netlify.app')) return;
    // real starting gold, so the balance can be felt; a button tops it up for trying things out
    if (q.has('sandbox')) this.gold = 99999;
    const w = parseInt(q.get('wave') ?? '', 10);
    if (w >= 1 && w <= WAVES.length) this.waveIndex = w - 1;
    // N skips ahead a wave between waves, B goes back one
    const step = (d: number) => {
      if (this.phase !== 'build') return;
      this.waveIndex = Phaser.Math.Clamp(this.waveIndex + d, 0, WAVES.length - 1);
      this.refreshHud();
    };
    this.input.keyboard!.on('keydown-N', () => step(1));
    this.input.keyboard!.on('keydown-B', () => step(-1));
    // the same on screen, for touch
    this.button(GAME_W - 196, GAME_H - 100, 96, 40, 'Wave -', 0x7d8a99, () => step(-1), 15);
    this.button(GAME_W - 86, GAME_H - 100, 96, 40, 'Wave +', 0x7d8a99, () => step(1), 15);
    this.button(GAME_W - 316, GAME_H - 100, 120, 40, '+5000 gold', 0xb58a2a, () => { this.gold += 5000; this.refreshHud(); }, 15);
    this.refreshHud();
    this.flash('Preview: normal gold · +5000 gold button · N / B pick the wave');
  }

  private tut(ev: TutorialEvent) { this.tutorial?.notify(ev); }

  // ======================= MAP =======================
  /** Grass, the winding road and flat ground details: drawn once, underneath everything. */
  private drawGround() {
    if (hasSprite(this, eraLook().map)) {
      addSprite(this, eraLook().map, 0, 0).setDepth(0);
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
    const look = eraLook();
    // the map painting already has the start and end buildings (and no movable scenery)
    if (look.painted && hasSprite(this, look.map)) return;
    const [sdx, sdy] = look.startOffset;
    if (hasSprite(this, look.start)) {
      const c = toScreen(start[0] + sdx, start[1] + sdy);
      addSprite(this, look.start, c.x, c.y).setDepth(depthOf(start[0] + sdx, start[1] + sdy) + 3);
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
    if (look.end !== 'cabin' && hasSprite(this, look.end)) {
      const e = toScreen(end[0], end[1]);
      addSprite(this, look.end, e.x, e.y).setDepth(depthOf(end[0], end[1]) + 6);
    } else if (hasSprite(this, 'cabin')) this.placeCabinSprite(end[0], end[1]);
    else place('cabin', end[0], end[1], [180, 150, 88, 118], g => art.cabin(g), 6);

    // The painted map has a fixed layout (src/sceneryLayout.ts), editable in game with the scene editor (E).
    if (hasSprite(this, look.map)) {
      const shipped = look.map === 'map_ground' ? SCENERY_LAYOUT : [];
      const items = loadLayout(shipped).filter(i => hasSprite(this, i.name)).map(i => this.placeScenery(i));
      this.editor = new SceneEditor(this, items, {
        palette: look.editorPalette,
        shipped,
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
    // one press = one action: a second press within 200 ms (a double click, or a touch screen sending the same
    // tap as both a touch and a mouse event) is ignored, so the speed button can't jump from 1x straight to 3x
    let lastPress = -Infinity;
    zone.on('pointerover', () => paint(true)).on('pointerout', () => paint(false))
      .on('pointerdown', () => {
        const now = performance.now();
        if (now - lastPress < 200) return;
        lastPress = now;
        audio.play('click'); onClick();
      });
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
    // every bottom-bar button closes whatever popup is open (tower menu, sound panel) before it acts
    this.speedBtn = this.button(GAME_W - 300, GAME_H - 42, 92, 50, '1x', 0x7d8a99, () => { this.dismissPopups(); this.toggleSpeed(); }, 20);
    this.muteBtn = this.button(GAME_W - 430, GAME_H - 42, 140, 50, audio.settings.muted ? 'Muted' : 'Sound', 0x7d8a99,
      () => { this.closeMenu(); this.toggleSoundPanel(); }, 17);
    this.startBtn = this.button(GAME_W - 140, GAME_H - 42, 210, 50, '', 0x5fae4e, () => { this.dismissPopups(); this.startWave(); }, 18);
    this.button(GAME_W - 560, GAME_H - 42, 100, 50, 'Menu', 0x7d8a99, () => { this.dismissPopups(); this.scene.start('Menu'); }, 17);
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
    kb.on('keydown-SPACE', () => { this.dismissPopups(); this.startWave(); });
    kb.on('keydown-F', () => { this.dismissPopups(); this.toggleSpeed(); });
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

  /** Closes the tower menu and the sound panel. */
  private dismissPopups() {
    this.closeMenu();
    this.closeSoundPanel();
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
      if (t.damaged) {
        const cost = this.repairCost(t);
        this.menuOption(c, 60, 0, this.gold >= cost, `${cost}`,
          (ix, iy) => { const g = this.add.graphics().setPosition(ix, iy); this.wrenchIcon(g); return g; },
          () => this.repair(plot),
          on => this.setRepairHint(on ? `Repair  ${Math.ceil(t.hp)}/${t.maxHp} HP` : ''));
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
  /** Seconds until each attacking enemy fires again. */
  private attackClock = new Map<Enemy, number>();

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
    if (def.crew && KillerCrew.available(this)) this.crews.set(plot.tower, new KillerCrew(this, plot.tower, this.crewHost(plot.tower)));
    audio.play(eraLook().sfx.build, { x: plot.top.x });
    this.tut('built');
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
    this.crews.get(t)?.setLevel(t.level);
    t.drawHp();
    audio.play(eraLook().sfx.upgrade, { x: plot.top.x });
    this.tut('upgraded');
    this.hero?.react('towerBuilt');
    this.puff(plot.top.x, plot.top.y - 20, 0xfff3b0, 10);
    if (t.level === TOWER_LEVELS.max) this.flash(`${LEVEL3_TRAIT[t.def.kind].name}!`);
    this.refreshHud();
  }

  /** Index of the wave being fought (waveIndex already points at the next one once a wave ends). */
  private currentWaveIndex() { return this.phase === 'wave' ? this.waveIndex : Math.max(0, this.waveIndex - 1); }

  /** Repairing costs REPAIR_COST of what the tower is worth, times how much of it is broken. */
  private repairCost(t: Tower) {
    return Math.max(1, Math.ceil(t.spent * REPAIR_COST * (1 - t.hp / t.maxHp)));
  }

  private repair(plot: Plot) {
    const t = plot.tower;
    if (!t || !t.damaged || this.phase === 'over') return;
    const cost = this.repairCost(t);
    if (this.gold < cost) { this.noGold(); return; }
    this.gold -= cost;
    t.repairFull();
    audio.play(ERA_ID === 'era3' ? 'e3_repair' : 'e2_repair', { x: plot.top.x });   // era 3 reuses era 2's repair sound (copied)
    this.puff(plot.top.x, plot.top.y - 20, 0x9fd8ff, 8);
    this.refreshMenu();
    this.refreshHud();
  }

  private setRepairHint(text: string) {
    if (!this.upgradeInfo?.active) return;
    if (text) this.upgradeInfo.setText(text);
    else this.refreshUpgradeInfo();
  }

  /** A code-drawn spanner for the repair button. */
  private wrenchIcon(g: Phaser.GameObjects.Graphics) {
    g.setRotation(-Math.PI / 4);
    for (const [w, col] of [[7, art.OUTLINE], [4, 0xd8dde3]] as [number, number][]) {
      g.fillStyle(col).fillRect(-w / 2, -6, w, 18);
      g.fillCircle(0, -9, w + 2.5);
    }
    g.fillStyle(0x3a3f47).fillRect(-2.5, -18, 5, 8);
  }

  /** An enemy wrecked this tower: it blows up and the plot is free again. */
  private destroyTower(t: Tower) {
    const plot = t.plot;
    if (plot.tower !== t) return;
    this.perf.towersLost++;
    const { x, y } = plot.top;
    audio.play(ERA_ID === 'era3' ? 'e3_tower_destroyed' : 'e2_tower_destroyed', { x });
    explosion(this, x, y, 90, 45, UI_DEPTH - 34);
    this.cameras.main.shake(160, 0.006);
    this.flash(`${t.def.name} destroyed!`);
    this.crews.get(t)?.destroy(); this.crews.delete(t);
    t.destroy();
    plot.tower = null;
    plot.draw();
    if (this.menuPlot === plot) this.closeMenu();
    this.refreshHud();
  }

  /** Damages a tower; a wrecked tower is destroyed. */
  private hurtTower(t: Tower, amount: number, fromX: number, fromY: number) {
    if (t.plot.tower !== t) return;
    const wasWhole = !t.damaged;
    t.takeDamage(amount, fromX, fromY);
    this.perf.towerDamage += Math.min(amount, t.maxHp) / t.maxHp;
    audio.play(ERA_ID === 'era3' ? 'e3_structure_hit' : 'e2_structure_hit', { x: t.plot.top.x });
    if (t.hp <= 0) this.destroyTower(t);
    else if (wasWhole && this.menuPlot === t.plot) this.refreshMenu(); // show the repair button
  }

  /** Nearest tower that can be damaged within range (grid tiles) of an enemy. */
  private towerNear(e: Enemy, range: number): Tower | null {
    let best: Tower | null = null, bestD = range;
    for (const plot of this.plots) {
      const t = plot.tower;
      if (!t || !t.maxHp) continue;
      const d = Math.hypot(t.tx - e.gx, t.ty - e.gy);
      if (d <= bestD) { best = t; bestD = d; }
    }
    return best;
  }

  /** Era 2 machines shoot back: robots fire bursts, walkers launch twin rockets. */
  private enemyAttacks(dt: number) {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const kind = e.def.kind;
      if (kind !== 'robot' && kind !== 'walker' && kind !== 'shield' && kind !== 'tank') continue;
      const atk = ENEMY_ATTACKS[kind];
      const left = (this.attackClock.get(e) ?? atk.interval * (0.3 + Math.random() * 0.7)) - dt;
      if (left > 0) { this.attackClock.set(e, left); continue; }
      const t = this.towerNear(e, atk.range);
      if (!t) { this.attackClock.set(e, 0.3); continue; }
      this.attackClock.set(e, atk.interval);
      const from = e.screen, fx = from.x, fy = from.y - e.bodyHeight * 0.6;
      const to = t.plot.top;
      if (kind === 'robot' || kind === 'shield') {
        // stops, plants its feet and fires a burst
        // frame-by-frame robots raise the gun first: the burst goes off on the animation's firing frame
        const lag = e.fireAt;
        e.hold = 0.7 + lag;
        e.playAct('attack');
        this.time.delayedCall(lag * 1000, () => {
          if (!e.alive) return;
          audio.play('e2_robot_gunfire', { x: fx });
          tracerBurst(this, fx, fy, to.x, to.y - 30, UI_DEPTH - 22);
          this.time.delayedCall(120, () => this.hurtTower(t, atk.damage, fx, fy));
        });
      } else if (kind === 'tank') {
        // the siege tank braces, then fires one heavy shell
        const lag = e.fireAt || 0.65;
        e.hold = 0.75 + lag; e.brace = 0.75 + lag;
        e.playAct('attack');
        this.time.delayedCall(lag * 1000, () => {
          if (!e.alive) return;
          const mz = e.muzzleWorld();
          if (mz) muzzleFlash(this, mz.x, mz.y, mz.angle, UI_DEPTH - 21, 1.3);
          audio.play('e2_rocket_launch', { x: fx });
          this.cameras.main.shake(120, 0.004);
          this.enemyRocket(mz?.x ?? fx, mz?.y ?? fy - 10, t, atk.damage, true);
        });
      } else {
        // walkers brace on their legs before the rockets go
        e.hold = 1.3; e.brace = 1.3;
        e.playAct('attack');
        const rockets = ENEMY_ATTACKS.walker.rockets;
        for (let i = 0; i < rockets; i++) {
          this.time.delayedCall((e.fireAt || 0.55) * 1000 + i * 260, () => {
            if (!e.alive && i > 0) return;
            audio.play('e2_walker_rocket', { x: fx });
            this.enemyRocket(fx + (i ? 8 : -8), fy - 6, t, atk.damage / rockets);
          });
        }
      }
    }
  }

  /** A walker rocket: arcs to the tower trailing smoke, then blows up on it. */
  private enemyRocket(x0: number, y0: number, t: Tower, damage: number, heavy = false) {
    const tx = t.plot.top.x + (Math.random() - 0.5) * 16, ty = t.plot.top.y - 26;
    const body = this.add.graphics().setDepth(UI_DEPTH - 21);
    if (heavy) body.setScale(1.8);
    body.fillStyle(art.OUTLINE).fillRect(-6, -2.5, 12, 5);
    body.fillStyle(0xc9cdd2).fillRect(-5, -1.5, 9, 3);
    body.fillStyle(0xff7a2a).fillRect(-8, -1.5, 3, 3);
    const k = { v: 0 };
    let smoke = 0;
    this.tweens.add({
      targets: k, v: 1, duration: 650, ease: 'Sine.easeIn',
      onUpdate: () => {
        const v = k.v, x = x0 + (tx - x0) * v, y = y0 + (ty - y0) * v - Math.sin(v * Math.PI) * 60;
        const nx = x0 + (tx - x0) * (v + 0.02), ny = y0 + (ty - y0) * (v + 0.02) - Math.sin((v + 0.02) * Math.PI) * 60;
        body.setPosition(x, y).setRotation(Math.atan2(ny - y, nx - x));
        if (++smoke % 2 === 0) rocketSmoke(this, x, y, UI_DEPTH - 23);
      },
      onComplete: () => {
        body.destroy();
        explosion(this, tx, ty + 20, heavy ? 90 : 50, heavy ? 45 : 25, UI_DEPTH - 34);
        audio.play(eraLook().sfx.explosion, { x: tx });
        this.hurtTower(t, damage, x0, y0);
      },
    });
  }

  /**
   * Crowd steering, once a frame before enemies move: keeps space between enemies in the same lane
   * (faster ones swing out and overtake), syncs crawler packs and sends droids rushing at nearby towers.
   */
  private steerCrowd(_dt: number) {
    const list = this.enemies.filter(e => e.alive).sort((a, b) => b.distance - a.distance);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      e.pace = 1;
      if (e.def.kind === 'fast') e.syncClock(this.waveClock + (e.group % 7) * 0.37);
      if (e.def.kind === 'droid' && this.towerNear(e, 2.4)) e.pace = 1.5;
      if (e.def.boss) continue;
      // the nearest enemy ahead that is in the way
      let ahead: Enemy | null = null, gap = Infinity;
      for (let j = i - 1; j >= 0; j--) {
        const f = list[j], d = f.distance - e.distance;
        if (d > 1.2) break;
        if (f.path !== e.path && Math.hypot(f.gx - e.gx, f.gy - e.gy) > 0.6) continue;   // the other lane of a fork
        const room = (e.def.size + f.def.size) * 0.022 + 0.12;
        if (d < room + 0.25 && Math.abs(f.lane - e.lane) < 0.2 && d < gap) { ahead = f; gap = d; }
      }
      if (!ahead) continue;
      const room = (e.def.size + ahead.def.size) * 0.022 + 0.12;
      if (e.def.speed > ahead.def.speed * 1.15) {
        // swing out to the side with more room and go past
        e.laneTarget = ahead.lane > 0 ? Math.max(-LANE_MAX, ahead.lane - 0.4) : Math.min(LANE_MAX, ahead.lane + 0.4);
      } else {
        // fall in behind, keeping a little distance
        e.pace = Phaser.Math.Clamp((gap - room * 0.6) / (room * 0.6), 0.15, 1);
      }
    }
  }

  /** Zombie shamans pulse green and patch up the undead around them. */
  private shamanHeals(dt: number) {
    for (const e of this.enemies) {
      if (!e.alive || e.def.kind !== 'shaman') continue;
      const left = (this.attackClock.get(e) ?? SHAMAN_HEAL.interval * Math.random()) - dt;
      if (left > 0) { this.attackClock.set(e, left); continue; }
      this.attackClock.set(e, SHAMAN_HEAL.interval);
      e.playAct('attack');   // raises the staff as the pulse goes out
      let healed = 0;
      for (const o of this.enemies) {
        if (o === e || !o.alive || o.hp >= o.maxHp || Math.hypot(o.gx - e.gx, o.gy - e.gy) > SHAMAN_HEAL.radius) continue;
        o.heal(o.maxHp * SHAMAN_HEAL.share);
        healed++;
        const p = o.screen;
        const plus = this.add.text(p.x, p.y - o.bodyHeight - 12, '+', TEXT(16, '#9dff7a')).setOrigin(0.5).setDepth(UI_DEPTH - 20);
        this.tweens.add({ targets: plus, y: plus.y - 18, alpha: 0, duration: 700, onComplete: () => plus.destroy() });
      }
      // the pulse is drawn even with nobody to heal, so players learn what the shaman does
      const s = e.screen, { w, h } = rangeEllipse(SHAMAN_HEAL.radius);
      const ring = this.add.graphics().setPosition(s.x, s.y).setDepth(UI_DEPTH - 36);
      ring.lineStyle(3, 0x9dff7a, healed ? 0.9 : 0.45).strokeEllipse(0, 0, w, h);
      ring.fillStyle(0x9dff7a, healed ? 0.16 : 0.06).fillEllipse(0, 0, w, h);
      ring.setScale(0.2);
      this.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: 650, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    }
  }

  /** A blue spark where a riot shield stopped a shot. */
  private shieldSpark(e: Enemy, from: { gx: number; gy: number }) {
    const s = e.screen, f = toScreen(from.gx, from.gy);
    const a = Math.atan2(f.y - s.y, f.x - s.x);
    const x = s.x + Math.cos(a) * 12, y = s.y - e.bodyHeight * 0.6 + Math.sin(a) * 6;
    audio.play('e2_structure_hit', { x });
    const g = this.add.graphics().setDepth(UI_DEPTH - 21);
    g.fillStyle(0x9fe4ff, 0.9).fillCircle(x, y, 7);
    for (let i = 0; i < 6; i++) {
      const b = a + (Math.random() - 0.5) * 1.8;
      g.lineStyle(2, 0xd8f4ff, 1).lineBetween(x, y, x + Math.cos(b) * 14, y + Math.sin(b) * 9);
    }
    this.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
  }

  /** Dust, sparks or an explosion to go with each kind of death. */
  private deathFx(e: Enemy, style: DeathStyle) {
    const s = e.screen;
    if (style === 'sink' || style === 'collapse') this.puff(s.x, s.y - 4, 0x6b5a48, 7);
    else if (style === 'topple') {
      this.time.delayedCall(e.def.boss ? 500 : 280, () => {
        this.puff(s.x - 14, s.y - 2, 0x8a7a68, e.def.boss ? 14 : 8);
        if (e.def.boss) this.cameras.main.shake(260, 0.008);
      });
    } else if (style === 'machine') {
      sparkBurst(this, s.x, s.y - e.bodyHeight * 0.6, UI_DEPTH - 22, 0.8);
    } else if (style === 'buckle') {
      this.time.delayedCall(e.def.boss ? 900 : 430, () => {
        const big = e.def.boss ? 2.2 : 1.2;
        explosion(this, s.x, s.y, 70 * big, 35 * big, UI_DEPTH - 34);
        audio.play(eraLook().sfx.explosion, { x: s.x });
        if (e.def.boss) this.cameras.main.shake(400, 0.012);
      });
    }
  }

  // ======================= ERA 3: TITANS AND THE TITAN KILLER CREW =======================
  /** Thrown rocks in flight and the tower each one is aimed at. */
  private rockTowers = new Map<Projectile, Tower>();

  /** What a titan killer tower's crew needs from the scene. */
  private crewHost(t: Tower) {
    return {
      targets: (range: number) => this.enemies
        .filter(e => e.alive && !e.busy && Math.hypot(e.gx - t.tx, e.gy - t.ty) <= range * (t.plot.def.high ? HIGH_GROUND_RANGE : 1) * this.mods.range)
        .sort((a, b) => b.distance - a.distance),
      slashDamage: () => this.towerDamage(t),
      restDelay: () => this.towerFireDelay(t),
      range: () => t.def.range * TOWER_LEVELS.range[t.level - 1],
      hit: (e: Enemy, amount: number) => this.damage(e, amount, 1, { gx: t.tx, gy: t.ty }, t.def.armorMult),
      fireLance: (x: number, y: number, target: Enemy) => {
        const L = KILLER.lance;
        this.projectiles.push({
          gfx: this.add.graphics(), sx: t.tx, sy: t.ty, tx: target.gx, ty: target.gy,
          startHeight: t.plot.top.y - y + t.plot.lift, endHeight: target.bodyHeight * 0.6, homing: target, t: 0, duration: 0.6,
          damage: L.damage * this.mods.rankDamage[t.def.rank], splash: L.splash, arcHeight: 26, kind: 'lance', armorMult: L.armorMult,
          last: { x, y },
        });
        muzzleFlash(this, x, y, target.screen.x < x ? Math.PI : 0, UI_DEPTH - 21, 0.9);
      },
      sound: (id: 'swing' | 'slash' | 'swat' | 'lance') => {
        const x = t.plot.top.x;
        if (id === 'swing') {
          // the grapple fires, then the rush of air as the fighter swings out
          audio.play('e3_grapple_fire', { x });
          this.time.delayedCall(140, () => audio.play('e3_swing_whoosh', { x }));
          return;
        }
        audio.play(id === 'slash' ? 'e3_blade_slash' : id === 'swat' ? 'e3_swat_hit' : 'e3_lance_fire', { x });
      },
      fxDepth: UI_DEPTH - 22,
    };
  }

  /** Nearest tower within range (tiles) of where a titan stands on the road. */
  private towerInReach(e: Enemy, range: number, skip?: Set<unknown>): Tower | null {
    let best: Tower | null = null, bestD = range;
    for (const plot of this.plots) {
      const t = plot.tower;
      if (!t || !t.maxHp || skip?.has(t)) continue;
      const d = Math.hypot(t.tx - e.gx, t.ty - e.gy);
      if (d <= bestD) { best = t; bestD = d; }
    }
    return best;
  }

  /**
   * Moves a titan off the road towards a tower and back (leap, stray, charge): the road position stays where it
   * is while the offset carries the body over. `stop` is how far short of the tower's centre it ends (tiles).
   */
  private titanMove(e: Enemy, t: Tower, opts: { out: number; back: number; stop: number; peak: number; endLift: number;
    onArrive: () => number }) {
    e.busy = true;
    const roadX = e.gx - e.offX, roadY = e.gy - e.offY;
    let dx = t.tx - roadX, dy = t.ty - roadY;
    const l = Math.hypot(dx, dy) || 1;
    const k = Math.max(0, (l - opts.stop) / l);
    dx *= k; dy *= k;
    const st = { v: 0 };
    this.tweens.add({
      targets: st, v: 1, duration: opts.out * 1000 / this.speed, ease: 'Sine.easeInOut',
      onUpdate: () => { e.offX = dx * st.v; e.offY = dy * st.v; e.lift = Math.sin(st.v * Math.PI) * opts.peak + st.v * opts.endLift; },
      onComplete: () => {
        if (!e.alive) return;
        const stay = opts.onArrive();
        this.time.delayedCall(stay * 1000 / this.speed, () => {
          if (!e.alive) return;
          const back = { v: 0 };
          this.tweens.add({
            targets: back, v: 1, duration: opts.back * 1000 / this.speed, ease: 'Sine.easeInOut',
            onUpdate: () => { e.offX = dx * (1 - back.v); e.offY = dy * (1 - back.v); e.lift = Math.sin(back.v * Math.PI) * opts.peak + (1 - back.v) * opts.endLift; },
            onComplete: () => { e.offX = 0; e.offY = 0; e.lift = 0; e.busy = false; },
          });
        });
      },
    });
  }

  /** Dust and stone chips bursting out where a titan slams into a tower's base. */
  private impactDust(x: number, y: number) {
    this.puff(x, y, 0x9a8a74, 14);
    for (let i = 0; i < 10; i++) {
      const g = this.add.graphics().setPosition(x, y - 8).setDepth(UI_DEPTH - 24);
      g.fillStyle(art.OUTLINE).fillRect(-3, -3, 6, 6).fillStyle(0x8f8676).fillRect(-2, -2, 4, 4);
      const a = -Math.PI * (0.1 + Math.random() * 0.8), v = 40 + Math.random() * 60;
      this.tweens.add({ targets: g, x: x + Math.cos(a) * v, y: y - 8 + Math.sin(a) * v * 0.6 + 30, angle: Math.random() * 360,
        alpha: 0, duration: 500 + Math.random() * 250, ease: 'Quad.easeIn', onComplete: () => g.destroy() });
    }
  }

  /** Per-titan countdowns for its special moves. */
  private titanClocks = new WeakMap<Enemy, Record<string, number>>();
  private clockFor(e: Enemy, what: string, first: number) {
    let c = this.titanClocks.get(e);
    if (!c) { c = {}; this.titanClocks.set(e, c); }
    if (c[what] === undefined) c[what] = first;
    return c;
  }

  /** Brawlers leap onto towers and throw rocks, wall walkers stray into towers, the giant charges each tower once. */
  private titanAttacks(dt: number) {
    const A = TITAN_ATTACKS;
    for (const e of this.enemies) {
      if (!e.alive || e.busy || e.age < 1) continue;
      const kind = e.def.kind;
      if (kind === 'brawler') {
        const c = this.clockFor(e, 'charge', A.brawler.charge.interval * (0.15 + Math.random() * 0.3));
        this.clockFor(e, 'rock', A.brawler.rock.interval * (0.3 + Math.random() * 0.5));
        c.charge -= dt; c.rock -= dt;
        if (c.charge <= 0) {
          const t = this.towerInReach(e, A.brawler.charge.range);
          if (!t) { c.charge = 0.5; continue; }
          c.charge = A.brawler.charge.interval;
          // head down, shoulder first, straight into the base of the tower; the charge animation's impact frame
          // lines up with reaching the tower
          const lead = e.playAct('charge') ? 0.6 : 0;   // the shoulder lands on frame 20 of the charge (18 fps)
          audio.play('e3_brawler_roar', { x: e.screen.x });
          this.time.delayedCall(lead * 1000 / this.speed, () => {
            if (!e.alive || t.plot.tower !== t) return;
            this.titanMove(e, t, { out: 0.5, back: 0.9, stop: 0.42, peak: 0, endLift: 0, onArrive: () => {
              const base = t.plot.top;
              this.hurtTower(t, A.brawler.charge.damage, e.screen.x, e.screen.y);
              t.shudder();
              this.cameras.main.shake(180, 0.007);
              this.impactDust(base.x + (e.screen.x - base.x) * 0.5, base.y - 6);
              audio.play('e3_charge_impact', { x: base.x });
              return 0.5;
            } });
          });
          continue;
        }
        if (c.rock <= 0) {
          const t = this.towerInReach(e, A.brawler.rock.range);
          if (!t) { c.rock = 0.5; continue; }
          c.rock = A.brawler.rock.interval;
          e.playAct('attack');
          e.hold = 2.7;
          // the rock leaves his hands late in the throw, after the long wind-up
          this.time.delayedCall(1.95 * 1000 / Math.max(1, this.speed), () => {
            if (!e.alive || t.plot.tower !== t) return;
            audio.play('e3_rock_throw', { x: e.screen.x });
            const p: Projectile = {
              gfx: this.add.graphics(), sx: e.gx, sy: e.gy, tx: t.tx, ty: t.ty, startHeight: e.bodyHeight * 1.1, endHeight: 40,
              t: 0, duration: 0.8, damage: A.brawler.rock.damage, splash: 0, arcHeight: 70, kind: 'rock',
            };
            this.rockTowers.set(p, t);
            this.projectiles.push(p);
          });
        }
      } else if (kind === 'wallwalker') {
        const c = this.clockFor(e, 'stray', A.wallwalker.stray.interval * (0.3 + Math.random() * 0.5));
        c.stray -= dt;
        if (c.stray > 0) continue;
        c.stray = A.wallwalker.stray.interval;
        if (Math.random() > A.wallwalker.stray.chance) continue;
        const t = this.towerInReach(e, A.wallwalker.stray.range);
        if (!t) continue;
        this.titanMove(e, t, { out: 1.4, back: 1.4, stop: 0.55, peak: 0, endLift: 0, onArrive: () => {
          e.playAct('attack');
          audio.play('e3_titan_footstep', { x: e.screen.x });
          this.time.delayedCall(700, () => {
            if (!e.alive || t.plot.tower !== t) return;
            audio.play('e3_charge_impact', { x: t.plot.top.x, volume: 0.8 });
            this.hurtTower(t, t.maxHp * A.wallwalker.stray.share, e.screen.x, e.screen.y);
            this.cameras.main.shake(200, 0.007);
            this.puff(t.plot.top.x, t.plot.top.y - 10, 0x8a7a68, 12);
          });
          return 1.3;
        } });
      } else if (kind === 'colossus') {
        const t = this.towerInReach(e, A.colossus.charge.range, e.charged);
        if (!t) continue;
        e.charged.add(t);
        this.flash('The Armored Giant charges!');
        e.playAct('attack');
        audio.play('e3_boss_roar', { x: e.screen.x });
        this.titanMove(e, t, { out: 0.8, back: 1.5, stop: 0.6, peak: 0, endLift: 0, onArrive: () => {
          this.hurtTower(t, t.maxHp * A.colossus.charge.share, e.screen.x, e.screen.y);
          audio.play('e3_charge_impact', { x: t.plot.top.x });
          this.cameras.main.shake(320, 0.012);
          this.puff(t.plot.top.x, t.plot.top.y - 10, 0x8a7a68, 16);
          return 0.6;
        } });
      }
    }
  }

  // ---------- bosses ----------
  private boss: Enemy | null = null;
  private bossBar: Phaser.GameObjects.Container | null = null;
  private bossFill: Phaser.GameObjects.Graphics | null = null;

  private bossArrives(e: Enemy) {
    this.boss = e;
    this.flash(`${e.def.name ?? 'Boss'} approaches!`);
    this.cameras.main.shake(500, 0.006);
    this.bossBar?.destroy();
    const w = 420, x = GAME_W / 2 + 70, y = 24;
    const c = this.add.container(x, y).setDepth(UI_DEPTH + 2);
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.4).fillRoundedRect(-w / 2 - 8, -14, w + 16, 40, 10);
    bg.fillStyle(art.OUTLINE).fillRect(-w / 2 - 2, 6, w + 4, 14);
    bg.fillStyle(0x4a1d1d).fillRect(-w / 2, 8, w, 10);
    this.bossFill = this.add.graphics();
    c.add([bg, this.bossFill, this.add.text(0, -4, (e.def.name ?? 'Boss').toUpperCase(), TEXT(15, '#ffb0a0')).setOrigin(0.5)]);
    this.bossBar = c;
  }

  private updateBossBar() {
    const e = this.boss;
    if (!e || !this.bossFill) return;
    if (!e.alive) {
      this.bossBar?.destroy(); this.bossBar = null; this.bossFill = null; this.boss = null;
      return;
    }
    const w = 420, frac = Math.max(0, e.hp / e.maxHp);
    this.bossFill.clear().fillStyle(0xe0553f).fillRect(-w / 2, 8, w * frac, 10).fillStyle(0xff9a80).fillRect(-w / 2, 8, w * frac, 3);
    if (e.maxShell > 0) {
      // the armour bar, over the health bar: it has to go before health starts dropping
      const a = Math.max(0, e.shell / e.maxShell);
      this.bossFill.fillStyle(art.OUTLINE).fillRect(-w / 2 - 2, 20, w + 4, 9).fillStyle(0x2a3038).fillRect(-w / 2, 22, w, 5);
      this.bossFill.fillStyle(0x9fb4c8).fillRect(-w / 2, 22, w * a, 5).fillStyle(0xe2ecf4).fillRect(-w / 2, 22, w * a, 1.5);
    }
  }

  /** A droid that dies (shot down or not) blows up and damages nearby towers. */
  private droidBlast(e: Enemy) {
    const { blastRadius, damage } = ENEMY_ATTACKS.droid;
    const s = e.screen;
    // it shorts out: sparks and smoke where it slumps (the blast still hurts towers around it)
    sparkBurst(this, s.x, s.y - 20, UI_DEPTH - 22, 1.1);
    for (const plot of this.plots) {
      const t = plot.tower;
      if (t?.maxHp && Math.hypot(t.tx - e.gx, t.ty - e.gy) <= blastRadius) this.hurtTower(t, damage, s.x, s.y);
    }
  }

  private sell(plot: Plot) {
    const t = plot.tower;
    if (!t) return;
    const refund = this.refund(t);
    this.gold += refund;
    this.goldPop(plot.top.x, plot.top.y - 30, refund);
    audio.play('sell', { x: plot.top.x });
    this.tut('sold');
    this.hero?.react('towerSold');
    this.crews.get(t)?.destroy(); this.crews.delete(t);
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
    this.tut('soundPanel');
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
    if (this.mode === 'tutorial' && this.waveIndex > 0) return; // the tutorial has one wave
    const wave = WAVES[this.waveIndex];
    this.spawns = [];
    wave.groups.forEach((g, gi) => {
      const count = ENEMIES[g.kind].boss ? g.count : Math.round(g.count * WAVE_SIZE);
      // a group walks as a loose formation: members take turns on the left, middle and right of the road
      const pattern = [0, -0.75, 0.75, -0.35, 0.35];
      for (let i = 0; i < count; i++) {
        const lane = (pattern[i % pattern.length] + (Math.random() - 0.5) * 0.3) * LANE_MAX;
        this.spawns.push({ at: g.delay + i * g.interval, kind: g.kind, group: this.waveIndex * 10 + gi + 1, lane });
      }
    });
    this.spawns.sort((a, b) => a.at - b.at);
    this.waveClock = 0;
    if (this.waveIndex % PUZZLE_EVERY === 0) this.perf = freshPerf(this.baseHp);
    this.phase = 'wave';
    this.refreshHud();
    const tough = hpScaleForWave(this.waveIndex);
    this.flash(`Wave ${this.waveIndex + 1}: here they come!${tough > 1 ? `  Enemies ${tough.toFixed(1)}x tougher` : ''}`);
    audio.play(eraLook().sfx.waveStart);
    audio.playMusic(eraLook().music.wave);
    this.hero?.react('waveStart');
    this.tut('waveStart');
  }

  private endWave() {
    const waveNumber = this.waveIndex + 1;
    const bonus = waveClearBonus(waveNumber);
    this.gold += bonus;
    this.waveIndex++;
    this.phase = 'build';
    audio.playMusic(eraLook().music.build);
    if (this.waveIndex < WAVES.length) audio.play(eraLook().sfx.waveClear);
    if (this.mode === 'tutorial') { this.refreshHud(); this.tut('waveCleared'); return; }
    if (this.waveIndex >= WAVES.length) { this.showEnd(true); return; }
    if (waveNumber % PUZZLE_EVERY === 0) this.openDraft(ratePerf(this.perf, this.baseHp));
    else this.flash(`Wave ${waveNumber} cleared  +${bonus} gold`);
    this.hero?.react('waveCleared');
    this.refreshHud();
  }

  // ======================= UPDATE LOOP =======================
  update(_time: number, deltaMs: number) {
    this.drawCursor();
    // tower idle/damaged frames run all the time, including between waves and in the build phase
    const animDt = Math.min(deltaMs / 1000, 0.05);
    for (const plot of this.plots) plot.tower?.tickAnim(animDt);
    if (this.phase !== 'wave' || this.editor?.active) {
      for (const c of this.crews.values()) c.update(animDt);
      return;
    }
    const dt = Math.min(deltaMs / 1000, 0.05) * this.speed;
    for (const c of this.crews.values()) c.update(dt);

    this.waveClock += dt;
    const hpScale = hpScaleForWave(this.waveIndex);
    while (this.spawns.length && this.spawns[0].at <= this.waveClock) {
      const s = this.spawns.shift()!;
      // on a forked road each titan picks a lane at random (the boss takes the first)
      const lanePath = ENEMIES[s.kind].boss ? this.paths[0] : this.paths[Math.floor(Math.random() * this.paths.length)];
      const enemy = new Enemy(this, ENEMIES[s.kind], hpScale, lanePath, { lane: s.lane, group: s.group });
      this.enemies.push(enemy);
      if (enemy.def.boss) this.bossArrives(enemy);
      const from = toScreen(...PATH_WAYPOINTS[0]);
      const spawnSfx = eraLook().sfx.spawn[s.kind];
      if (spawnSfx && (s.kind === 'fast' || s.kind === 'droid' || s.kind === 'walker' || ENEMIES[s.kind].boss || Math.random() < 0.4)) audio.play(spawnSfx, { x: from.x });
    }

    this.steerCrowd(dt);
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.move(dt)) {
        e.alive = false;
        this.baseHp -= e.def.leakDamage;
        this.perf.leaks++;
        this.perf.reach.push(1);
        this.hero?.react('baseHit');
        audio.play(eraLook().sfx.baseHit);
        this.cameras.main.shake(140, 0.005);
        const end = toScreen(...PATH_WAYPOINTS[PATH_WAYPOINTS.length - 1]);
        this.puff(end.x, end.y - 20, 0xd9473b, 6);
      }
    }

    this.enemyAttacks(dt);
    this.titanAttacks(dt);
    this.shamanHeals(dt);
    this.updateBossBar();
    for (const plot of this.plots) plot.tower?.tickDamage(dt);
    this.updateTowers(dt);
    this.updateProjectiles(dt);
    this.updateFires(dt);

    const before = this.enemies.length;
    this.enemies = this.enemies.filter(e => { if (!e.alive) { this.attackClock.delete(e); e.destroy(); } return e.alive; });
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
      if (t.def.crew) continue;
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
      audio.play(eraLook().sfx.shot[t.def.kind], { x: from.x });
      this.fire(t, target);
      if (t.def.kind === 'rail' && t.level >= 3) {
        // Dual Rail: the second barrel fires at another target a moment later
        const second = targets[1] ?? target;
        this.time.delayedCall(220, () => {
          if (!t.plot.tower || !second.alive) return;
          t.shoot(second.screen.x);
          audio.play(eraLook().sfx.shot.rail, { x: t.plot.top.x });
          this.fire(t, second);
        });
      }
      if (t.def.kind === 'rifle' && t.level >= 3) {
        // Second Gunner: the other soldier fires at another titan
        const second = targets[1] ?? target;
        this.time.delayedCall(200, () => {
          if (!t.plot.tower || !second.alive) return;
          audio.play(eraLook().sfx.shot.rifle, { x: t.plot.top.x });
          this.fire(t, second);
        });
      }
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
    const src = { gx: t.tx, gy: t.ty };
    if (t.def.flightTime === 0 && t.def.beam === 'tracer') {
      this.damage(target, dmg, 1, src, t.def.armorMult);
      const mp = t.muzzlePoint, to = target.screen;
      tracerBurst(this, mp?.x ?? from.x, mp?.y ?? from.y - t.muzzle, to.x, to.y - target.bodyHeight * 0.6, UI_DEPTH - 22);
      return;
    }
    if (t.def.flightTime === 0 && t.def.beam === 'rail') {
      // the beam goes from the muzzle through the target and on: every enemy near that line is hit
      const mp = t.muzzlePoint, to = target.screen;
      const mx = mp?.x ?? from.x, my = mp?.y ?? from.y - t.muzzle;
      const ty = to.y - target.bodyHeight * 0.6;
      const dx = to.x - mx, dy = ty - my, len = Math.hypot(dx, dy) || 1;
      const reach = Math.max(len, this.towerRange(t) * 60);
      const ex = mx + dx / len * reach, ey = my + dy / len * reach;
      const onLine = this.enemies.filter(e => {
        if (!e.alive) return false;
        const p = e.screen, py = p.y - e.bodyHeight * 0.6;
        const k = ((p.x - mx) * dx + (py - my) * dy) / (len * len);
        if (k < 0 || k * len > reach) return false;
        return Math.hypot(mx + dx * k - p.x, my + dy * k - py) < 18;
      }).sort((a, b) => Math.hypot(a.screen.x - mx, a.screen.y - my) - Math.hypot(b.screen.x - mx, b.screen.y - my))
        .slice(0, t.def.pierceLine ?? 1);
      if (!onLine.includes(target)) onLine.unshift(target);
      for (const e of onLine) this.damage(e, dmg, 1, src);
      railBeam(this, mx, my, ex, ey, onLine.map(e => ({ x: e.screen.x, y: e.screen.y - e.bodyHeight * 0.6 })), UI_DEPTH - 22);
      return;
    }
    if (t.def.flightTime === 0) {
      // Buckshot (level 3): the shot carries on into the enemies bunched up behind the target
      const pierced = t.def.kind === 'mg' && t.level >= 3
        ? this.enemies
          .filter(e => e !== target && e.alive && Math.hypot(e.gx - target.gx, e.gy - target.gy) <= TRAITS.pierceRadius)
          .sort((a, b) => Math.hypot(a.gx - target.gx, a.gy - target.gy) - Math.hypot(b.gx - target.gx, b.gy - target.gy))
          .slice(0, TRAITS.pierceTargets)
        : [];
      const pellets = t.def.pellets ?? 1;
      this.damage(target, dmg, pellets, src);
      const to = target.screen;
      const mp = t.muzzlePoint;
      const mx = mp?.x ?? from.x + Math.cos(t.aim) * 22, my = mp?.y ?? from.y - t.muzzle + Math.sin(t.aim) * 11;
      // shotgun blast: pellets to the target, and on with Buckshot into the enemies bunched up behind it
      const hits = [{ x: to.x, y: to.y - target.bodyHeight * 0.6, armored: target.def.armor > 0 }];
      for (const e of pierced) {
        const p = e.screen;
        hits.push({ x: p.x, y: p.y - e.bodyHeight * 0.6, armored: e.def.armor > 0 });
        this.damage(e, dmg * TRAITS.pierceDamage, pellets, src);
      }
      shotgunBlast(this, mx, my, hits, UI_DEPTH - 22);
      return;
    }
    if (t.def.kind === 'ballista') {
      // heavy bolts fly flat and fast; level 2 bolts pierce, level 3 fires two at once
      const pierce = t.level >= 2;
      const bolts = t.level >= 3 ? 2 : 1;
      for (let i = 0; i < bolts; i++) {
        this.time.delayedCall(i * 70, () => {
          if (!target.alive && i > 0) return;
          this.projectiles.push({
            gfx: this.add.graphics(), sx: t.tx + (i ? 0.12 : 0), sy: t.ty - (i ? 0.12 : 0), tx: target.gx, ty: target.gy,
            startHeight: t.muzzle, endHeight: target.bodyHeight * 0.7, homing: target, t: 0, duration: t.def.flightTime,
            damage: dmg, splash: 0, arcHeight: 10, kind: 'bolt', armorMult: (t.def.armorMult ?? 1) * (pierce ? 1.25 : 1), pierce,
            last: t.muzzlePoint ?? undefined,
          });
        });
      }
      return;
    }
    const isShell = t.def.splash > 0;
    const isRocket = t.def.kind === 'rocket';
    const mpr = t.muzzlePoint;
    this.projectiles.push({
      gfx: this.add.graphics(),
      sx: t.tx, sy: t.ty, tx: target.gx, ty: target.gy,
      startHeight: t.muzzle, endHeight: isShell ? 0 : target.bodyHeight,
      // arrows home in, shells land where the target WAS; Homing Missiles (rocket level 3) chase their target
      homing: isShell && !(isRocket && t.level >= 3) ? undefined : target,
      t: 0, duration: t.def.flightTime,
      damage: dmg, splash: t.def.splash * this.mods.splash,
      burns: t.def.kind === 'mortar' && t.level >= 3,
      arcHeight: isRocket ? 55 : isShell ? 130 : 45,
      kind: isRocket ? 'rocket' : isShell ? 'shell' : 'arrow',
      last: isRocket && mpr ? mpr : undefined,
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
      if (p.kind === 'rocket') {
        const last = p.last ?? { x: x - 1, y };
        const a = Math.atan2(y - last.y, x - last.x);
        const c = Math.cos(a), si = Math.sin(a);
        g.fillStyle(0xffb347, 0.9).fillCircle(x - c * 9, y - si * 9, 3.2);
        g.lineStyle(6, art.OUTLINE).lineBetween(x - c * 8, y - si * 8, x + c * 5, y + si * 5);
        g.lineStyle(4, 0x6b7068).lineBetween(x - c * 7, y - si * 7, x + c * 4, y + si * 4);
        g.fillStyle(0xd23a2a).fillCircle(x + c * 5, y + si * 5, 2.4);
        p.smokeIn = (p.smokeIn ?? 0) - dt;
        if (p.smokeIn <= 0) { p.smokeIn = 0.035; rocketSmoke(this, x - c * 10, y - si * 10, depthOf(gx, gy) + 49); }
      } else if (p.kind === 'bolt') {
        const last = p.last ?? { x: x - 1, y };
        const a = Math.atan2(y - last.y, x - last.x), len = 26;
        const bx = x - Math.cos(a) * len, by = y - Math.sin(a) * len;
        g.lineStyle(6, art.OUTLINE).lineBetween(bx, by, x, y);
        g.lineStyle(3.5, 0x9a6a3a).lineBetween(bx, by, x, y);
        g.fillStyle(0xcfd6dc).fillTriangle(x + Math.cos(a) * 6, y + Math.sin(a) * 6, x - Math.sin(a) * 4, y + Math.cos(a) * 4, x + Math.sin(a) * 4, y - Math.cos(a) * 4);
        g.fillStyle(0xe8e0d0).fillCircle(bx, by, 2.5);
      } else if (p.kind === 'lance') {
        const last = p.last ?? { x: x - 1, y };
        const a = Math.atan2(y - last.y, x - last.x);
        const c = Math.cos(a), si = Math.sin(a);
        g.fillStyle(0xffd27a, 0.95).fillCircle(x - c * 12, y - si * 12, 4.5);
        g.fillStyle(0xff7a2a, 0.8).fillCircle(x - c * 16, y - si * 16, 3.5);
        g.lineStyle(7, art.OUTLINE).lineBetween(x - c * 11, y - si * 11, x + c * 7, y + si * 7);
        g.lineStyle(4.5, 0x8f7a4a).lineBetween(x - c * 10, y - si * 10, x + c * 3, y + si * 3);
        g.fillStyle(0xcfd6dc).fillCircle(x + c * 6, y + si * 6, 3.4);
        p.smokeIn = (p.smokeIn ?? 0) - dt;
        if (p.smokeIn <= 0) { p.smokeIn = 0.025; rocketSmoke(this, x - c * 14, y - si * 14, depthOf(gx, gy) + 49); }
      } else if (p.kind === 'rock') {
        g.fillStyle(art.OUTLINE).fillCircle(x, y, 8);
        g.fillStyle(0x8a8478).fillCircle(x, y, 6.5);
        g.fillStyle(0xb5ae9f).fillCircle(x - 2, y - 2, 2.5);
      } else if (p.kind === 'arrow') {
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
      audio.play(eraLook().sfx.explosion, { x });
      explosion(this, x, y, w, h, UI_DEPTH - 34);
      for (const e of this.enemies) {
        if (e.alive && Math.hypot(e.gx - p.tx, e.gy - p.ty) <= p.splash) { this.damage(e, p.damage, 1, undefined, p.armorMult); e.knockBack(KNOCKBACK); }
      }
      if (p.burns) this.addFire(p.tx, p.ty, p.splash * TRAITS.fireRadius, p.damage * TRAITS.fireDps);
    } else if (p.kind === 'rock') {
      // a titan's thrown rock lands on its tower (the thrower set p.homing to null and the tower via rockTower)
      const t = this.rockTowers.get(p);
      this.rockTowers.delete(p);
      const { x, y } = toScreen(p.tx, p.ty);
      this.puff(x, y - 20, 0x8a8478, 8);
      audio.play('e3_rock_impact', { x });
      if (t) this.hurtTower(t, p.damage, x, y);
    } else if (p.homing && p.homing.alive) {
      const hitE = p.homing;
      audio.play(p.kind === 'bolt' ? 'e3_bolt_hit' : 'arrow_hit', { x: hitE.screen.x });
      this.damage(hitE, p.damage, 1, { gx: p.sx, gy: p.sy }, p.armorMult);
      if (p.pierce) {
        // carries on through into the next titan behind, along the line of flight
        const dx = p.tx - p.sx, dy = p.ty - p.sy, l = Math.hypot(dx, dy) || 1;
        const behind = this.enemies
          .filter(e => e !== hitE && e.alive)
          .map(e => ({ e, along: ((e.gx - p.tx) * dx + (e.gy - p.ty) * dy) / l, off: Math.abs((e.gx - p.tx) * dy - (e.gy - p.ty) * dx) / l }))
          .filter(o => o.along > 0 && o.along < 1.6 && o.off < 0.45)
          .sort((a, b) => a.along - b.along)[0];
        if (behind) {
          this.damage(behind.e, p.damage, 1, { gx: p.sx, gy: p.sy }, p.armorMult);
          const s = behind.e.screen;
          sparkBurst(this, s.x, s.y - behind.e.bodyHeight * 0.6, UI_DEPTH - 22, 0.4);
        }
      }
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

  private damage(e: Enemy, amount: number, pellets = 1, from?: { gx: number; gy: number }, armorMult = 1) {
    if (!e.alive) return;
    e.hit(amount, pellets, from, armorMult);
    if (e.blocked) this.shieldSpark(e, from!);
    if (!e.alive) {
      // how far along the road it got before it fell (0 = at the gate, 1 = at the base)
      this.perf.reach.push(Phaser.Math.Clamp(e.distance / e.path.length, 0, 1));
      this.deathFx(e, e.die());
      const reward = Math.round(e.def.reward * this.mods.gold * (1 + KILL_GOLD_PER_WAVE * this.currentWaveIndex()));
      this.gold += reward;
      const s = e.screen;
      this.puff(s.x, s.y - 10, 0x8fae78, 6);
      this.goldPop(s.x, s.y - 30, reward);
      audio.play(eraLook().sfx.death[e.def.kind], { x: s.x });
      // a dead titan's body boils away in steam
      if (ERA_ID === 'era3') this.time.delayedCall(450, () => audio.play('e3_steam_hiss', { x: s.x }));
      if (e.def.kind === 'droid') this.droidBlast(e);
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

  /** The upgrade draft after a block of waves: how well the defence held decides which cards can be taken. */
  private openDraft(rating: Rating) {
    const { tier, boosted } = this.pity.adjust(rating.tier);
    const draft = rollDraft();
    const c = this.openOverlay();
    const name = { fail: 'Shaky', bronze: 'Bronze', silver: 'Silver', gold: 'Gold' }[rating.tier];
    this.title(c, 72, `Defence rating: ${name}` + (boosted ? '  (lucky break: boosted to Silver)' : ''));
    this.title(c, 116, this.ratingLine(rating), 17);

    if (tier === 'fail') {
      const { option, pct } = failurePick(draft);
      this.title(c, 150, `The ${eraLook().baseName} took a beating: you get one random bronze upgrade, weakened.`, 17);
      this.card(c, GAME_W / 2, 330, option, true, pct, () => this.take(option, pct));
      return;
    }
    this.title(c, 150, 'Pick ONE upgrade. Greyed-out cards need a better defence rating.', 17);
    draft.forEach((opt, i) => {
      this.card(c, 130 + i * 204, 340, opt, isUnlocked(opt.tier, tier), opt.power, () => this.take(opt, opt.power));
    });
  }

  /** One line on what the rating was based on: damage to the base, how far the enemies got, towers lost. */
  private ratingLine(r: Rating) {
    const base = eraLook().baseName;
    const parts = [r.hpLost === 0 ? `The ${base} took no damage` : `The ${base} lost ${r.hpLost} health`];
    parts.push(r.towersLost ? `${r.towersLost} tower${r.towersLost > 1 ? 's' : ''} destroyed` : 'no towers lost');
    return parts.join('  ·  ');
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
    audio.play(eraLook().sfx.defeat);
    const c = this.openOverlay();
    if (livesLeft > 0) {
      this.title(c, 260, eraLook().lostLine);
      this.title(c, 310, `You lose a life. ${livesLeft} ${livesLeft === 1 ? 'life' : 'lives'} left. The map restarts.`, 18);
      c.add(this.button(GAME_W / 2, 400, 240, 54, 'Try again', 0x5fae4e, () => this.scene.restart({ campaignLives: livesLeft, mode: this.mode, campaign: this.inCampaign }), 20).setDepth(OVERLAY_DEPTH + 1));
    } else this.showEnd(false);
  }

  private showEnd(won: boolean) {
    if (won) audio.play(eraLook().sfx.victory);
    this.phase = 'over';
    const c = this.openOverlay();
    // the campaign runs Haunted Forest, Machine Wasteland, Fallen Village
    const next: GameMode | null = !won || !this.inCampaign ? null
      : this.mode === 'campaign' ? (ERA2_READY ? 'era2' : null) : this.mode === 'era2' ? (ERA3_READY ? 'era3' : null) : null;
    this.title(c, 250, won ? 'Groovy. Map cleared!' : 'Game over, man.');
    this.title(c, 300, !won ? 'All 3 lives used. The campaign starts over.'
      : next === 'era2' ? 'The machines are coming. On to Era 2!'
        : next === 'era3' ? 'The giants have broken through the wall. On to Era 3!'
          : this.inCampaign && this.mode === 'era3' ? 'The village is saved. You beat the campaign!'
            : 'Back to the menu, or play the map again.', 18);
    if (next) {
      c.add(this.button(GAME_W / 2, 380, 240, 54, `Continue to Era ${next === 'era2' ? 2 : 3}`, 0x5fae4e,
        () => this.scene.restart({ mode: next, campaignLives: this.campaignLives, campaign: true }), 20).setDepth(OVERLAY_DEPTH + 1));
    } else {
      c.add(this.button(GAME_W / 2, 380, 240, 54, 'Play again', 0x5fae4e, () => this.scene.restart({ campaignLives: 3, mode: this.mode }), 20).setDepth(OVERLAY_DEPTH + 1));
    }
    c.add(this.button(GAME_W / 2, 450, 240, 54, 'Main menu', 0x7d8a99, () => this.scene.start('Menu'), 20).setDepth(OVERLAY_DEPTH + 1));
  }
}
