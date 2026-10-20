// Frame-by-frame enemy animations: sprite sheets made from the enemy's own painted art with the WAN 2.2 video
// model (tools/anim/build_sheets.py writes the sheets and src/anims/<kind>.json). An enemy kind that has sheets
// uses them instead of its cut-out rig: walk (front and back), attack, hit and one or more deaths.
import Phaser from 'phaser';

export interface SheetAnimMeta {
  file: string;
  /** Frame size in the file (the sheet is stored at `scale` times the on-screen size). */
  w: number;
  h: number;
  frames: number;
  fps: number;
  /** loop: walk cycles; once: plays and returns to walking; death: plays, holds the last frame, fades. */
  mode: 'loop' | 'once' | 'death';
  view: 'front' | 'back';
  /** Where the feet are, as a fraction of the frame. */
  originX: number;
  originY: number;
}
interface SheetSet {
  scale: number;
  frontFacesLeft?: boolean;
  /** Gun muzzle in game px from the feet while facing right, and the barrel's angle (radians, screen y down). */
  muzzle?: [number, number, number];
  anims: Record<string, SheetAnimMeta>;
}

// every src/anims/<kind>.json written by tools/anim/build_sheets.py
const FILES = import.meta.glob('./anims/*.json', { eager: true, import: 'default' }) as Record<string, SheetSet>;
export const SHEET_ANIMS: Record<string, SheetSet> = Object.fromEntries(
  Object.entries(FILES).map(([path, set]) => [path.replace(/^.*\/(\w+)\.json$/, '$1'), set]));

const texKey = (kind: string, anim: string) => `anim_${kind}_${anim}`;

export function preloadSheetAnims(scene: Phaser.Scene) {
  for (const [kind, set] of Object.entries(SHEET_ANIMS)) {
    for (const [name, a] of Object.entries(set.anims)) {
      scene.load.spritesheet(texKey(kind, name), a.file, { frameWidth: a.w, frameHeight: a.h });
    }
  }
}

/** True when every sheet of this enemy kind loaded, so the game can use them. */
export function hasSheetAnims(scene: Phaser.Scene, kind: string) {
  const set = SHEET_ANIMS[kind];
  return !!set && Object.keys(set.anims).every(n => scene.textures.exists(texKey(kind, n)));
}

export interface SheetDraw {
  x: number; y: number; depth: number;
  /** +1 moving right on screen, -1 left. */
  facing: number;
  goingUp: boolean;
  /** Walk phase in radians: one full walk loop per 2π. */
  phase: number;
  flash: boolean;
  rotation: number;
  /** Extra vertical squash (entrance) and offsets. */
  squashY: number;
  dx: number; dy: number;
  alpha: number;
}

export class SheetView {
  readonly sprite: Phaser.GameObjects.Image;
  private readonly set: SheetSet;
  private act: { name: string; t: number } | null = null;

  /**
   * frontFacesLeft / backFacesLeft: which way the painted front and back views face, so they flip the right way.
   */
  constructor(private scene: Phaser.Scene, readonly kind: string, private frontFacesLeft: boolean, private backFacesLeft: boolean) {
    this.set = SHEET_ANIMS[kind];
    // the sheet's own record of which way the painted front faces wins over the sprite's
    if (this.set.frontFacesLeft !== undefined) this.frontFacesLeft = this.set.frontFacesLeft;
    this.sprite = scene.add.image(0, 0, texKey(kind, 'walk'), 0);
  }

  has(name: string) { return !!this.set.anims[name]; }
  playing(name?: string) { return name ? this.act?.name === name : !!this.act; }

  /** Length of an animation in seconds. */
  duration(name: string) {
    const a = this.set.anims[name];
    return a ? a.frames / a.fps : 0;
  }

  /** Starts a one-shot (attack, hit); returns its length in seconds. */
  play(name: string) {
    if (!this.has(name)) return 0;
    this.act = { name, t: 0 };
    return this.duration(name);
  }

  update(dt: number) {
    if (!this.act) return;
    this.act.t += dt;
    if (this.act.t >= this.duration(this.act.name)) this.act = null;
  }

  draw(d: SheetDraw) {
    let name: string, frame: number;
    if (this.act) {
      name = this.act.name;
      const a = this.set.anims[name];
      frame = Math.min(a.frames - 1, Math.floor(this.act.t * a.fps));
    } else {
      name = d.goingUp && this.has('walk_back') ? 'walk_back' : 'walk';
      const a = this.set.anims[name];
      const cyc = ((d.phase / (Math.PI * 2)) % 1 + 1) % 1;
      frame = Math.floor(cyc * a.frames) % a.frames;
    }
    this.show(name, frame, d);
  }

  private show(name: string, frame: number, d: SheetDraw) {
    const a = this.set.anims[name], s = this.set.scale, sp = this.sprite;
    const key = texKey(this.kind, name);
    if (sp.texture.key !== key) sp.setTexture(key, frame); else sp.setFrame(frame);
    const facesLeft = a.view === 'back' ? this.backFacesLeft : this.frontFacesLeft;
    sp.setOrigin(a.originX, a.originY)
      .setDisplaySize(a.w / s, (a.h / s) * d.squashY)
      .setPosition(d.x + d.dx, d.y + d.dy)
      .setRotation(d.rotation)
      .setDepth(d.depth)
      .setAlpha(d.alpha)
      .setFlipX(facesLeft ? d.facing > 0 : d.facing < 0)
      .setVisible(true);
    if (d.flash) sp.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else sp.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
  }

  /** Where the muzzle is on screen (for the muzzle flash and shells), or null when this kind has no gun. */
  muzzle(x: number, y: number, facing: number) {
    const m = this.set.muzzle;
    if (!m) return null;
    const dir = facing < 0 ? -1 : 1;
    return { x: x + m[0] * dir, y: y + m[1], angle: dir > 0 ? m[2] : Math.PI - m[2] };
  }

  /** On-screen height of the standing body, for health bars and aiming. */
  get bodyHeight() {
    const a = this.set.anims.walk;
    return (a.h / this.set.scale) * a.originY;
  }

  /**
   * Plays one of the deaths (picked at random when there are several), holds the last frame, fades out and
   * removes itself. The sheet view must not be used afterwards.
   */
  playDeath(x: number, y: number, depth: number, facing: number) {
    const deaths = Object.keys(this.set.anims).filter(n => this.set.anims[n].mode === 'death');
    if (!deaths.length) { this.destroy(); return; }
    const name = deaths[Math.floor(Math.random() * deaths.length)];
    const a = this.set.anims[name], k = { t: 0 };
    const d: SheetDraw = { x, y, depth, facing, goingUp: false, phase: 0, flash: false, rotation: 0, squashY: 1, dx: 0, dy: 0, alpha: 1 };
    this.act = null;
    this.show(name, 0, d);
    this.scene.tweens.add({
      targets: k, t: a.frames - 1, duration: (a.frames / a.fps) * 1000, ease: 'Linear',
      onUpdate: () => this.show(name, Math.floor(k.t), d),
      onComplete: () => this.scene.tweens.add({
        targets: this.sprite, alpha: 0, delay: 900, duration: 600, onComplete: () => this.destroy(),
      }),
    });
  }

  setVisible(v: boolean) { this.sprite.setVisible(v); }
  destroy() { this.sprite.destroy(); }
}
