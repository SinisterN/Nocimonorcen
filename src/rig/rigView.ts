// Draws a cut-out enemy rig in Phaser: one nested container per joint, so a turning forearm carries its hand
// and claws with it. Poses come from poses.ts.
import Phaser from 'phaser';
import gruntRig from '../../public/sprites/era1/rig/grunt/rig.json';
import { Pose, RIG_MOVES, RigMoves, basePose } from './poses';

export interface RigPart { x: number; y: number; w: number; h: number; px: number; py: number; parent: string; curl?: number }
export interface RigDef {
  name: string;
  /** Pixels in the part files per rig unit. */
  fileScale: number;
  /** Where the feet touch the ground, and the hip the upper body bends at (rig units). */
  ground: [number, number];
  hip: [number, number];
  facesLeft: boolean;
  parts: Record<string, RigPart>;
  order: string[];
}

const DIRS: Record<string, string> = { grunt: 'sprites/era1/rig/grunt' };
export const RIG_DEFS: Record<string, RigDef> = { grunt: gruntRig as unknown as RigDef };

const key = (rig: string, part: string) => `rig_${rig}_${part}`;

export function preloadRigs(scene: Phaser.Scene) {
  for (const [name, def] of Object.entries(RIG_DEFS)) {
    for (const part of def.order) scene.load.image(key(name, part), `${DIRS[name]}/${part}.png`);
  }
}

/** True when this enemy kind has a rig and its pictures loaded. */
export function hasRig(scene: Phaser.Scene, kind: string) {
  const def = RIG_DEFS[kind];
  return !!def && def.order.every(p => scene.textures.exists(key(kind, p)));
}

export class RigView {
  readonly container: Phaser.GameObjects.Container;
  readonly def: RigDef;
  readonly moves: RigMoves;
  private root: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Container;
  private nodes: Record<string, Phaser.GameObjects.Container> = {};
  private images: Phaser.GameObjects.Image[] = [];
  private scale: number;
  private tinted = false;

  /** displayHeight: on-screen height of the standing figure, in game pixels. */
  constructor(private scene: Phaser.Scene, readonly kind: string, displayHeight: number) {
    this.def = RIG_DEFS[kind];
    this.moves = RIG_MOVES[kind];
    const d = this.def;
    const top = Math.min(...Object.values(d.parts).map(p => p.y));
    this.scale = displayHeight / (d.ground[1] - top);
    this.container = scene.add.container(0, 0);
    this.root = scene.add.container(-d.ground[0], -d.ground[1]);
    this.container.add(this.root);
    this.body = scene.add.container(d.hip[0], d.hip[1]);
    let bodyAdded = false;
    const pivotOf = (name: string): [number, number] =>
      name === 'root' ? [0, 0] : name === 'body' ? d.hip : [d.parts[name].px, d.parts[name].py];
    for (const name of d.order) {
      const p = d.parts[name];
      const parent = p.parent === 'root' ? this.root : p.parent === 'body' ? this.body : this.nodes[p.parent];
      if (p.parent === 'body' && !bodyAdded) { this.root.add(this.body); bodyAdded = true; }
      const [ppx, ppy] = pivotOf(p.parent);
      const node = scene.add.container(p.px - ppx, p.py - ppy);
      const img = scene.add.image(p.x - p.px, p.y - p.py, key(kind, name)).setOrigin(0, 0).setScale(1 / d.fileScale);
      node.add(img);
      parent.add(node);
      this.nodes[name] = node;
      this.images.push(img);
    }
  }

  /** Puts the feet at (x, y). facing: 1 = moving right, -1 = left. */
  place(x: number, y: number, facing: number, depth: number, extraScaleY = 1) {
    const flip = this.def.facesLeft ? facing > 0 : facing < 0;
    this.container.setPosition(x, y).setDepth(depth).setScale(this.scale * (flip ? -1 : 1), this.scale * extraScaleY);
  }

  apply(p: Pose) {
    const d = this.def;
    this.root.setPosition(-d.ground[0] + p.x, -d.ground[1] + p.y + p.sink * 40);
    this.body.setRotation(p.lean);
    for (const name of d.order) {
      const part = d.parts[name], node = this.nodes[name];
      node.setRotation((p.rot[name] ?? 0) + (part.curl ? p.curl * 0.45 * part.curl : 0));
      node.setScale(1, p.sy[name] ?? 1);
      node.setVisible(!p.hide[name]);
    }
    this.container.setAlpha(p.alpha);
  }

  flash(on: boolean) {
    if (on === this.tinted) return;
    this.tinted = on;
    for (const img of this.images) { if (on) img.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL); else img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY); }
  }

  setVisible(v: boolean) { this.container.setVisible(v); }

  /** Screen position of a part's joint (for things that come off it, like the zombie's head). */
  jointWorld(name: string) {
    const m = this.nodes[name].getWorldTransformMatrix();
    return { x: m.tx, y: m.ty, rotation: m.rotation };
  }

  /** A loose copy of one part, drawn where it currently is (it then gets its own tweens). */
  detach(name: string) {
    const part = this.def.parts[name], w = this.jointWorld(name);
    const s = Math.abs(this.container.scaleX);
    const img = this.scene.add.image(w.x, w.y, key(this.kind, name))
      .setOrigin((part.px - part.x) / part.w, (part.py - part.y) / part.h)
      .setScale(s / this.def.fileScale * Math.sign(this.container.scaleX), s / this.def.fileScale)
      .setRotation(w.rotation).setDepth(this.container.depth);
    return img;
  }

  /** Plays the death on its own clock (the enemy itself is already gone), then removes the rig. */
  playDeath(onHeadOff?: (head: Phaser.GameObjects.Image) => void) {
    const act = this.moves.acts.death;
    if (!act) { this.destroy(); return; }
    let t = 0, headDone = false;
    const tick = (_time: number, deltaMs: number) => {
      t += Math.min(deltaMs, 50) / 1000;
      const p = basePose(); act.pose(t, p);
      if (this.moves.headOff !== undefined && t >= this.moves.headOff && !headDone && this.nodes.head) {
        headDone = true;
        onHeadOff?.(this.detach('head'));
      }
      this.apply(p);
      if (t >= act.dur) { this.scene.events.off('update', tick); this.destroy(); }
    };
    this.scene.events.on('update', tick);
    this.scene.events.once('shutdown', () => this.scene.events.off('update', tick));
  }

  destroy() { this.container.destroy(); }
}
