// Frame-by-frame tower animations, made from each tower level's own art with the WAN 2.2 video model
// (tools/anim/build_tower_sheets.py writes the sheets and src/anims/towers.json). A tower level that has sheets
// plays them in its existing Phaser image: an idle loop (flames, banners, glow), a fire one-shot on each shot,
// and for era 2 a damaged loop (smoke and sparks) while the tower is below half health.
import Phaser from 'phaser';
import { DATA_ERAS } from './eras';

export interface TowerAnimMeta {
  file: string;
  frames: number;
  fps: number;
  /** loop: idle and damaged; once: fire, which then returns to the loop. */
  mode: 'loop' | 'once' | 'pingpong';
  /** Arrow tower: the same frames masked to the front battlements and rim, drawn over the archer. */
  front?: string;
}
export interface TowerSheetMeta {
  /** Frame size in the file (stored at 2x the on-screen size). */
  w: number;
  h: number;
  /** Where the tower stands on its plot, as a fraction of the frame. */
  originX: number;
  originY: number;
  /** Arrow tower (older sheets): the front parapet band (fractions of the frame), redrawn over the archer. */
  band?: [number, number];
  /** Arrow tower: where the archer stands on the platform, as a fraction of the frame. */
  feet?: [number, number];
  anims: Record<string, TowerAnimMeta>;
}

// src/anims/towers.json, written by the build script; absent until the first tower is built
const FILES = import.meta.glob('./anims/towers.json', { eager: true, import: 'default' }) as Record<string, Record<string, TowerSheetMeta>>;
export const TOWER_ANIMS: Record<string, TowerSheetMeta> = { ...(Object.values(FILES)[0] ?? {}) };
// Era Studio eras bring sheets for their own tower units (a wizard instead of the archer)
for (const e of DATA_ERAS) Object.assign(TOWER_ANIMS, (e.towerAnims ?? {}) as Record<string, TowerSheetMeta>);

const texKey = (key: string, anim: string) => `tanim_${key}_${anim}`;

export function preloadTowerAnims(scene: Phaser.Scene) {
  for (const [key, set] of Object.entries(TOWER_ANIMS)) {
    for (const [name, a] of Object.entries(set.anims)) {
      scene.load.spritesheet(texKey(key, name), a.file, { frameWidth: set.w, frameHeight: set.h });
      if (a.front) scene.load.spritesheet(texKey(key, `${name}_front`), a.front, { frameWidth: set.w, frameHeight: set.h });
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

/** The frame of a looping animation at time t; a ping-pong loop runs forward then back, so a take that drifts loops without a jump. */
function loopFrame(a: TowerAnimMeta, t: number) {
  const i = Math.floor(t * a.fps);
  if (a.mode !== 'pingpong' || a.frames < 2) return i % a.frames;
  const n = 2 * (a.frames - 1), j = i % n;
  return j < a.frames ? j : n - j;
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
  get feet(): [number, number] | undefined { return this.meta.feet; }
  /** The occluder texture matching what is on screen now, when this sheet has one. */
  get frontKey(): string | null {
    const key = texKey(this.key, `${this.current}_front`);
    return this.meta.anims[this.current]?.front && this.scene.textures.exists(key) ? key : null;
  }
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
    this.show(name, loopFrame(a, this.clock));
  }

  private show(name: string, frame: number) {
    const key = texKey(this.key, name);
    if (this.img.texture.key !== key) {
      const [w, h] = [this.img.displayWidth, this.img.displayHeight];
      this.img.setTexture(key, frame).setDisplaySize(w, h);   // keep any kick tween's size mid-flight
    }
    else if (this.frame !== frame) this.img.setFrame(frame);
    this.current = name;
  }
}

/**
 * The arrow tower's archer, animated from his own art: a breathing idle at full draw and a shot (release, reach
 * for a new arrow, draw again) that ends where the idle starts. Faces the target by flipping.
 */
export class ArcherSheet {
  private clock = Math.random() * 5;
  private act: { t: number; rate: number; name: string } | null = null;

  /** key: 'archer', or an Era Studio era's unit sheet (its idle loop and 'shoot' one-shot). */
  static available(scene: Phaser.Scene, key = 'archer') {
    const set = TOWER_ANIMS[key];
    return !!set && !!set.anims.idle && !!set.anims.shoot && Object.keys(set.anims).every(n => scene.textures.exists(texKey(key, n)));
  }

  constructor(readonly img: Phaser.GameObjects.Image, readonly key = 'archer') {
    const m = TOWER_ANIMS[key];
    img.setTexture(texKey(key, 'idle'), 0).setOrigin(m.originX, m.originY).setDisplaySize(m.w / 2, m.h / 2);
  }

  /** On-screen size. */
  get size(): [number, number] { const m = TOWER_ANIMS[this.key]; return [m.w / 2, m.h / 2]; }

  /** Plays the shot, sped up when needed so he is back at full draw before the tower fires again. */
  shoot(within = Infinity, name = 'shoot') {
    const a = TOWER_ANIMS[this.key].anims[name] ?? TOWER_ANIMS[this.key].anims.shoot;
    this.act = { t: 0, rate: Math.max(1, a.frames / a.fps / (within * 0.92)), name: TOWER_ANIMS[this.key].anims[name] ? name : 'shoot' };
  }

  /** An Era Studio unit's special: its cast animation when it has one, else its shot. */
  cast(within = Infinity) { this.shoot(within, 'cast'); }

  update(dt: number) {
    const anims = TOWER_ANIMS[this.key].anims;
    this.clock += dt;
    let name = 'idle', frame: number;
    if (this.act) {
      this.act.t += dt * this.act.rate;
      const a = anims[this.act.name];
      if (this.act.t < a.frames / a.fps) { name = this.act.name; frame = Math.floor(this.act.t * a.fps); }
      else this.act = null;
    }
    if (name === 'idle') frame = loopFrame(anims.idle, this.clock);
    const key = texKey(this.key, name);
    if (this.img.texture.key !== key) this.img.setTexture(key, frame!);
    else this.img.setFrame(frame!);
    // his feet aren't centred in the frame (the bow reaches out in front), so a flip mirrors the origin too
    const m = TOWER_ANIMS[this.key];
    this.img.setOrigin(this.img.flipX ? 1 - m.originX : m.originX, m.originY);
  }
}
