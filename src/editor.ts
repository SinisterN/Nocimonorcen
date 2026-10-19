// In-game scene editor for the scenery sprites on a painted map.
// Press E in the game to open it: drag sprites around, add new ones from the strip at the top, resize, flip,
// duplicate or delete them. Every change is saved in this browser right away and shows up in the game;
// "Export" downloads the layout as a file (and copies it), so it can be committed as the map's shipped layout.
import Phaser from 'phaser';
import { ERA_ID } from './config';
import { SPRITES, SpriteMeta, SpriteName } from './sprites';

export interface LayoutItem { name: SpriteName; gx: number; gy: number; scale: number; flip: boolean }

/** Browser storage key for the edited layout of the active era. */
const store = () => `nocimonorcen.layout.${ERA_ID}`;
const FONT = '"Trebuchet MS", Verdana, sans-serif';
const BAR_H = 92;
const MIN_SCALE = 0.4, MAX_SCALE = 2.5;

/** The layout to show: the one edited in this browser if there is one, otherwise the shipped one. */
export function loadLayout(shipped: LayoutItem[]): LayoutItem[] {
  try {
    const raw = localStorage.getItem(store());
    if (raw) {
      const items = JSON.parse(raw) as LayoutItem[];
      if (Array.isArray(items)) return items.filter(i => i && i.name in SPRITES);
    }
  } catch { /* storage blocked or bad data: use the shipped layout */ }
  return shipped;
}

function saveLayout(items: LayoutItem[]) {
  try { localStorage.setItem(store(), JSON.stringify(items)); } catch { /* not saved: still fine for this session */ }
}

function clearLayout() {
  try { localStorage.removeItem(store()); } catch { /* nothing stored */ }
}

export interface EditorHooks {
  /** Sprites the editor can add, in palette order. */
  palette: SpriteName[];
  /** The shipped layout (what Reset goes back to). */
  shipped: LayoutItem[];
  /** Adds one scenery sprite to the map and returns it. */
  place(item: LayoutItem): Phaser.GameObjects.Image;
  /** Screen point -> grid point. */
  toGrid(x: number, y: number): { gx: number; gy: number };
  /** Draw depth for something standing at a grid point. */
  depthAt(gx: number, gy: number): number;
  /** Draws the areas that must stay clear (road, build plots, tower footprints) into g. */
  drawKeepClear(g: Phaser.GameObjects.Graphics): void;
  /** Shows a short message. */
  flash(msg: string): void;
  /** Depth for the editor's own interface. */
  depth: number;
}

export class SceneEditor {
  active = false;
  private items: Phaser.GameObjects.Image[];
  private selected: Phaser.GameObjects.Image | null = null;
  private bar: Phaser.GameObjects.Container | null = null;
  private guide: Phaser.GameObjects.Graphics | null = null;
  private selBox: Phaser.GameObjects.Graphics | null = null;
  private resetArmed = false;

  constructor(private scene: Phaser.Scene, items: Phaser.GameObjects.Image[], private hooks: EditorHooks) {
    this.items = items;
    const input = scene.input;
    input.on('dragstart', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      if (this.active && this.isItem(obj)) this.select(obj as Phaser.GameObjects.Image);
    });
    input.on('drag', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject, x: number, y: number) => {
      if (!this.active || !this.isItem(obj)) return;
      const img = obj as Phaser.GameObjects.Image;
      img.setPosition(Math.round(x), Math.round(y));
      this.restack(img);
    });
    input.on('dragend', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      if (this.active && this.isItem(obj)) this.save();
    });
    input.on('pointerdown', (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (this.active && !over.length) this.select(null);
    });
    input.on('wheel', (_p: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
      if (this.active && this.selected) this.resize(dy > 0 ? 0.95 : 1.05);
    });
    input.keyboard!.on('keydown', (ev: KeyboardEvent) => this.onKey(ev));
    scene.events.on('update', () => this.drawSelection());
  }

  toggle() { if (this.active) this.close(); else this.open(); }

  open() {
    if (this.active) return;
    this.active = true;
    for (const it of this.items) this.makeEditable(it);
    this.guide = this.scene.add.graphics().setDepth(2).setAlpha(0.9);
    this.hooks.drawKeepClear(this.guide);
    this.selBox = this.scene.add.graphics().setDepth(this.hooks.depth + 1);
    this.buildBar();
  }

  close() {
    if (!this.active) return;
    this.active = false;
    this.select(null);
    for (const it of this.items) it.disableInteractive();
    this.guide?.destroy(); this.guide = null;
    this.selBox?.destroy(); this.selBox = null;
    this.bar?.destroy(); this.bar = null;
    this.scene.input.setDefaultCursor('default');
  }

  // ---------- editing ----------
  private isItem(obj: Phaser.GameObjects.GameObject) { return this.items.includes(obj as Phaser.GameObjects.Image); }

  private makeEditable(img: Phaser.GameObjects.Image) {
    img.setInteractive({ pixelPerfect: true, alphaTolerance: 40, draggable: true, useHandCursor: true });
  }

  private select(img: Phaser.GameObjects.Image | null) {
    this.selected = img;
    this.drawSelection();
  }

  private restack(img: Phaser.GameObjects.Image) {
    const g = this.hooks.toGrid(img.x, img.y);
    img.setDepth(this.hooks.depthAt(g.gx, g.gy));
  }

  private add(name: SpriteName, x = 640, y = 400) {
    const g = this.hooks.toGrid(x, y);
    const img = this.hooks.place({ name, gx: g.gx, gy: g.gy, scale: 1, flip: false });
    this.items.push(img);
    this.makeEditable(img);
    this.select(img);
    this.save();
  }

  private remove(img: Phaser.GameObjects.Image) {
    this.items = this.items.filter(i => i !== img);
    img.destroy();
    this.select(null);
    this.save();
  }

  private resize(factor: number) {
    const img = this.selected!;
    const name = img.getData('name') as SpriteName;
    const meta: SpriteMeta = SPRITES[name];
    const scale = Phaser.Math.Clamp(img.displayWidth / meta.display[0] * factor, MIN_SCALE, MAX_SCALE);
    img.setDisplaySize(meta.display[0] * scale, meta.display[1] * scale);
    this.save();
  }

  private onKey(ev: KeyboardEvent) {
    if (!this.active) return;
    const img = this.selected;
    const k = ev.key.toLowerCase();
    if (k === 'escape') { if (img) this.select(null); else this.close(); return; }
    if (!img) return;
    const step = ev.shiftKey ? 10 : 1;
    if (k === 'delete' || k === 'backspace') this.remove(img);
    else if (k === 'f') { img.setFlipX(!img.flipX); this.save(); }
    else if (k === 'd') {
      const name = img.getData('name') as SpriteName;
      this.add(name, img.x + 30, img.y + 15);
      const copy = this.selected!;
      copy.setDisplaySize(img.displayWidth, img.displayHeight).setFlipX(img.flipX);
      this.save();
    } else if (k === '+' || k === '=' || k === ']') this.resize(1.05);
    else if (k === '-' || k === '_' || k === '[') this.resize(0.95);
    else if (k.startsWith('arrow')) {
      const dx = k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0;
      const dy = k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0;
      img.setPosition(img.x + dx, img.y + dy);
      this.restack(img);
      this.save();
      ev.preventDefault();
    }
  }

  private drawSelection() {
    const g = this.selBox;
    if (!g) return;
    g.clear();
    const img = this.selected;
    if (!img || !img.active) return;
    const b = img.getBounds();
    g.lineStyle(2, 0xffe08a, 1).strokeRect(b.x, b.y, b.width, b.height);
    // the ground point: where the sprite stands (this decides what it is drawn in front of)
    g.fillStyle(0xffe08a, 1).fillCircle(img.x, img.y, 4);
    g.lineStyle(2, 0x2b1d12, 1).strokeCircle(img.x, img.y, 4);
  }

  // ---------- saving ----------
  private serialize(): LayoutItem[] {
    return this.items.map(img => {
      const name = img.getData('name') as SpriteName;
      const meta: SpriteMeta = SPRITES[name];
      const g = this.hooks.toGrid(img.x, img.y);
      return {
        name, gx: +g.gx.toFixed(3), gy: +g.gy.toFixed(3),
        scale: +(img.displayWidth / meta.display[0]).toFixed(3), flip: img.flipX,
      };
    });
  }

  private save() { saveLayout(this.serialize()); }

  private exportLayout() {
    const json = JSON.stringify(this.serialize(), null, 1);
    try { void navigator.clipboard?.writeText(json); } catch { /* clipboard not allowed: the download still works */ }
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scenery-layout.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.hooks.flash('Layout downloaded (and copied): send scenery-layout.json to Claude');
  }

  private reset(btnText: Phaser.GameObjects.Text) {
    if (!this.resetArmed) {
      this.resetArmed = true;
      btnText.setText('Sure?');
      this.scene.time.delayedCall(2500, () => { this.resetArmed = false; if (btnText.active) btnText.setText('Reset'); });
      return;
    }
    this.resetArmed = false;
    btnText.setText('Reset');
    clearLayout();
    for (const it of this.items) it.destroy();
    this.items = this.hooks.shipped.map(i => this.hooks.place(i));
    for (const it of this.items) this.makeEditable(it);
    this.select(null);
    this.hooks.flash('Back to the shipped layout');
  }

  // ---------- interface ----------
  private buildBar() {
    const s = this.scene, W = s.scale.width;
    const c = s.add.container(0, 0).setDepth(this.hooks.depth);
    this.bar = c;
    const bg = s.add.rectangle(0, 0, W, BAR_H, 0x140d1c, 0.88).setOrigin(0, 0).setInteractive();
    c.add(bg);
    c.add(s.add.text(12, 22, 'SCENE\nEDITOR', { fontFamily: FONT, fontSize: '14px', color: '#ffe08a', fontStyle: 'bold' }));
    c.add(s.add.text(12, BAR_H - 20,
      'Click a sprite to add it · drag to move · wheel or +/- size · F flip · D duplicate · Del remove · arrows nudge · E close',
      { fontFamily: FONT, fontSize: '12px', color: '#d8cfe8' }));
    // palette
    let x = 112;
    for (const name of this.hooks.palette) {
      if (!s.textures.exists(SPRITES[name].key)) continue;
      const meta: SpriteMeta = SPRITES[name];
      const fit = Math.min(52 / meta.display[0], 52 / meta.display[1]);
      const slot = s.add.rectangle(x, 38, 58, 58, 0x2a1f36, 1).setStrokeStyle(1, 0x5a4a6e)
        .setInteractive({ useHandCursor: true });
      const img = s.add.image(x, 38, meta.key).setDisplaySize(meta.display[0] * fit, meta.display[1] * fit);
      slot.on('pointerover', () => slot.setStrokeStyle(2, 0xffe08a));
      slot.on('pointerout', () => slot.setStrokeStyle(1, 0x5a4a6e));
      slot.on('pointerdown', () => this.add(name));
      c.add([slot, img]);
      x += 64;
    }
    // buttons
    const button = (bx: number, label: string, color: number, onClick: (t: Phaser.GameObjects.Text) => void) => {
      const r = s.add.rectangle(bx, 38, 92, 40, color, 1).setStrokeStyle(2, 0x2b1d12).setInteractive({ useHandCursor: true });
      const t = s.add.text(bx, 38, label, { fontFamily: FONT, fontSize: '16px', color: '#fff7e6', fontStyle: 'bold' }).setOrigin(0.5);
      r.on('pointerdown', () => onClick(t));
      c.add([r, t]);
    };
    button(W - 270, 'Export', 0x4f8a3f, () => this.exportLayout());
    button(W - 170, 'Reset', 0x8a4a3f, t => this.reset(t));
    button(W - 70, 'Done', 0x5a6a7d, () => this.close());
  }
}
