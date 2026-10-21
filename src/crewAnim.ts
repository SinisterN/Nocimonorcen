// Frame-by-frame animations for the titan killer tower's fighters (era 3), made from the fighter's art with the
// WAN 2.2 video model: idle, swinging on the lines, the spinning slash, and the rocket lance shot. Written by
// tools/era3/build_crew.py to src/anims/crew.json; until then the fighters use their still art moved in code.
import Phaser from 'phaser';

interface CrewAnim { file: string; w: number; h: number; frames: number; fps: number; originX: number; originY: number; loop: boolean }
interface CrewSet { scale: number; anims: Record<string, CrewAnim> }

const FILES = import.meta.glob('./anims/crew.json', { eager: true, import: 'default' }) as Record<string, CrewSet>;
const CREW: CrewSet | undefined = Object.values(FILES)[0];
const key = (n: string) => `crew_${n}`;

export function preloadCrewAnims(scene: Phaser.Scene) {
  if (!CREW) return;
  for (const [n, a] of Object.entries(CREW.anims)) scene.load.spritesheet(key(n), a.file, { frameWidth: a.w, frameHeight: a.h });
}

/** Plays the fighter's animations in his Phaser image (null when the sheets aren't there). */
export class SheetCycle {
  private name = 'idle';
  private t = Math.random() * 3;
  private once: { name: string; t: number } | null = null;

  static tryCreate(scene: Phaser.Scene, img: Phaser.GameObjects.Image) {
    if (!CREW || !Object.keys(CREW.anims).every(n => scene.textures.exists(key(n)))) return null;
    return new SheetCycle(img);
  }

  private constructor(private img: Phaser.GameObjects.Image) {}

  /** The lance shot, played once over whatever loop is running. */
  fire() { if (CREW?.anims.fire) this.once = { name: 'fire', t: 0 }; }

  update(dt: number, loop: string) {
    if (CREW?.anims[loop] && loop !== this.name) { this.name = loop; this.t = 0; }
    this.t += dt;
    if (this.once) { this.once.t += dt; const a = CREW!.anims[this.once.name]; if (this.once.t >= a.frames / a.fps) this.once = null; }
  }

  apply() {
    const name = this.once?.name ?? this.name, a = CREW!.anims[name];
    if (!a) return;
    const t = this.once?.t ?? this.t;
    const i = a.loop ? Math.floor(t * a.fps) % a.frames : Math.min(a.frames - 1, Math.floor(t * a.fps));
    const k = key(name);
    if (this.img.texture.key !== k) this.img.setTexture(k, i); else this.img.setFrame(i);
    this.img.setOrigin(a.originX, a.originY).setDisplaySize(a.w / CREW!.scale, a.h / CREW!.scale);
  }
}
