// Frame-by-frame tower animations, made from each tower level's own art with the WAN 2.2 video model
// (tools/anim/build_tower_sheets.py writes the sheets and src/anims/towers.json). A tower level that has sheets
// plays them in its existing Phaser image: an idle loop (flames, banners, glow), a fire one-shot on each shot,
// and for era 2 a damaged loop (smoke and sparks) while the tower is below half health.
import Phaser from 'phaser';

export interface TowerAnimMeta {
  file: string;
  frames: number;
  fps: number;
  /** loop: idle and damaged; once: fire, which then returns to the loop. */
  mode: 'loop' | 'once';
}
export interface TowerSheetMeta {
  /** Frame size in the file (stored at 2x the on-screen size). */
  w: number;
  h: number;
  /** Where the tower stands on its plot, as a fraction of the frame. */
  originX: number;
  originY: number;
  /** Arrow tower: the front parapet band (fractions of the frame), redrawn over the archer. */
  band?: [number, number];
  anims: Record<string, TowerAnimMeta>;
}

// src/anims/towers.json, written by the build script; absent until the first tower is built
const FILES = import.meta.glob('./anims/towers.json', { eager: true, import: 'default' }) as Record<string, Record<string, TowerSheetMeta>>;
export const TOWER_ANIMS: Record<string, TowerSheetMeta> = Object.values(FILES)[0] ?? {};

const texKey = (key: string, anim: string) => `tanim_${key}_${anim}`;

export function preloadTowerAnims(scene: Phaser.Scene) {
  for (const [key, set] of Object.entries(TOWER_ANIMS)) {
    for (const name of Object.keys(set.anims)) {
      scene.load.spritesheet(texKey(key, name), set.anims[name].file, { frameWidth: set.w, frameHeight: set.h });
    }
  }
}

/** The best animated set for this tower kind at this level: the level's own, or the nearest lower level's. */
function resolve(scene: Phaser.Scene, kind: string, level: number): string | null {
  for (let l = Math.min(3, level); l >= 1; l--) {
    const key = `${kind}_l${l}`;
    if (TOWER_ANIMS[key] && scene.textures.exists(texKey(key, 'idle'))) return key;
  }
  return null;
}

/**
 * Drives a tower's Phaser image through its animated frames. The image stays the same object, so everything the
 * game already does to it (kick tweens, flips, tints, the force field) keeps working on top.
 */
export class TowerSheet {
  private key: string;
  private meta: TowerSheetMeta;
  private clock = Math.random() * 7;   // towers start at different points in the idle
  private act: { t: number } | null = null;
  private dmg = false;
  private current = '';

  /** Returns null when this tower kind has no animated sheets loaded. */
  static tryCreate(scene: Phaser.Scene, img: Phaser.GameObjects.Image, kind: string, level: number): TowerSheet | null {
    return resolve(scene, kind, level) ? new TowerSheet(scene, img, kind, level) : null;
  }

  private constructor(private scene: Phaser.Scene, readonly img: Phaser.GameObjects.Image, private kind: string, level: number) {
    this.key = resolve(scene, kind, level)!;
    this.meta = TOWER_ANIMS[this.key];
    this.apply();
  }

  /** On-screen size, which replaces the static art's display size in the kick tweens. */
  get size(): [number, number] { return [this.meta.w / 2, this.meta.h / 2]; }
  get band(): [number, number] | undefined { return this.meta.band; }
  get frame(): number { return typeof this.img.frame.name === 'string' ? parseInt(this.img.frame.name, 10) || 0 : (this.img.frame.name as unknown as number); }

  setLevel(level: number) {
    const key = resolve(this.scene, this.kind, level);
    if (!key) return;
    this.key = key;
    this.meta = TOWER_ANIMS[key];
    this.act = null;
    this.current = '';
    this.apply();
  }

  private apply() {
    this.img.setTexture(texKey(this.key, 'idle'), 0)
      .setOrigin(this.meta.originX, this.meta.originY)
      .setDisplaySize(this.meta.w / 2, this.meta.h / 2);
    this.current = 'idle';
  }

  /** Plays the fire one-shot, if this tower has one. */
  fire() {
    if (this.meta.anims.fire) this.act = { t: 0 };
  }

  /** Era 2: switches to the smoking damaged loop below half health. */
  setDamaged(frac: number) {
    this.dmg = frac < 0.5;
  }

  update(dt: number) {
    this.clock += dt;
    let name = this.dmg && this.meta.anims.damaged ? 'damaged' : 'idle';
    let frame: number;
    if (this.act) {
      this.act.t += dt;
      const a = this.meta.anims.fire;
      if (this.act.t >= a.frames / a.fps) this.act = null;
      else {
        name = 'fire';
        frame = Math.min(a.frames - 1, Math.floor(this.act.t * a.fps));
        return this.show(name, frame);
      }
    }
    const a = this.meta.anims[name];
    this.show(name, Math.floor(this.clock * a.fps) % a.frames);
  }

  private show(name: string, frame: number) {
    const key = texKey(this.key, name);
    if (this.img.texture.key !== key) {
      const [w, h] = [this.img.displayWidth, this.img.displayHeight];
      this.img.setTexture(key, frame).setDisplaySize(w, h);   // keep any kick tween's size mid-flight
      this.current = name;
    } else if (this.frame !== frame) this.img.setFrame(frame);
  }
}
