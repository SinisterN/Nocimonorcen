// Poses for cut-out enemy rigs. Shared by the game (rigView.ts) and the rig lab page (tools/rig), so keep this
// file free of Phaser and DOM code. Units are rig units (the rig's own pixel space); angles in radians, positive
// = clockwise on screen. A pose names a rotation per joint; `lean` turns the whole upper body at the hip.

export interface Pose {
  x: number; y: number; lean: number; alpha: number; sink: number;
  /** Rotation per joint (part name), e.g. head, foreL, handR. */
  rot: Record<string, number>;
  /** Vertical squash per part (legs when stepping or buckling). */
  sy: Record<string, number>;
  /** Claw curl, 0 = relaxed, 1 = raked shut, negative = spread. Parts with a `curl` sign turn with it. */
  curl: number;
  /** Parts not drawn (the head once it has rolled off). */
  hide: Record<string, boolean>;
}

export function basePose(): Pose { return { x: 0, y: 0, lean: 0, alpha: 1, sink: 0, rot: {}, sy: {}, curl: 0, hide: {} }; }

export const ease = (t: number) => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
export const bump = (t: number, a: number, b: number) => (t <= a || t >= b) ? 0 : Math.sin((t - a) / (b - a) * Math.PI);
const add = (p: Pose, k: string, v: number) => { p.rot[k] = (p.rot[k] ?? 0) + v; };
const squash = (p: Pose, k: string, v: number) => { p.sy[k] = (p.sy[k] ?? 1) + v; };

export interface Act { dur: number; pose(t: number, p: Pose): void }
export interface RigMoves {
  /** Looping moves; `ph` advances 2π per full stride (walk) or by time (idle). */
  walk(ph: number, p: Pose): void;
  idle(t: number, p: Pose): void;
  acts: Record<string, Act>;
  /** Seconds into the death at which the head comes off and rolls away (if it does). */
  headOff?: number;
}

// ---------------------------------------------------------------- the era 1 zombie
const grunt: RigMoves = {
  walk(ph, p) {
    add(p, 'legL', 0.3 * Math.sin(ph)); add(p, 'legR', -0.3 * Math.sin(ph));
    squash(p, 'legL', -0.05 * Math.max(0, -Math.cos(ph))); squash(p, 'legR', -0.05 * Math.max(0, Math.cos(ph)));
    p.y += -7 * Math.abs(Math.cos(ph));            // rises as a leg passes under the body
    p.lean += -0.1 + 0.035 * Math.sin(ph * 2);     // hunched forward, rocking
    add(p, 'foreL', -0.06 + 0.14 * Math.sin(ph + 0.9));   // arms reach out and bob a beat behind the legs
    add(p, 'foreR', 0.06 + 0.14 * Math.sin(ph + 0.9 + Math.PI));
    add(p, 'head', 0.09 * Math.sin(ph * 0.5) + 0.03 * Math.sin(ph * 2.3));   // lolling
    add(p, 'handL', 0.16 * Math.sin(ph + 0.1));     // the hands flop behind the arms
    add(p, 'handR', 0.16 * Math.sin(ph + 0.1 + Math.PI));
    p.curl += 0.25 + 0.2 * Math.sin(ph * 2 + 1);
  },
  idle(t, p) {
    const ph = t * Math.PI * 2 / 2.6;
    p.y += -2 * Math.sin(ph); p.lean += -0.04 + 0.025 * Math.sin(ph);
    add(p, 'foreL', 0.05 * Math.sin(ph + 1)); add(p, 'foreR', -0.05 * Math.sin(ph + 1.4));
    add(p, 'head', 0.06 * Math.sin(ph * 0.7) - 0.03);
    add(p, 'handL', 0.06 * Math.sin(ph + 0.4)); add(p, 'handR', -0.06 * Math.sin(ph + 0.8));
    p.curl += 0.2 + 0.25 * Math.max(0, Math.sin(ph * 3.1)) ** 4;
  },
  headOff: 0.62,
  acts: {
    stumble: { dur: 1.3, pose(t, p) {
      const k = bump(t, 0, 0.75);
      p.lean += -0.5 * k; p.x += -26 * k; p.y += 10 * k;
      add(p, 'legL', -0.45 * k); add(p, 'legR', 0.25 * k);
      add(p, 'foreL', 0.7 * Math.sin(t * 28) * k); add(p, 'foreR', -0.6 * Math.sin(t * 24 + 1) * k);
      add(p, 'handL', 0.5 * Math.sin(t * 28 - 1) * k); add(p, 'handR', -0.5 * Math.sin(t * 24) * k); p.curl += -0.5 * k;
      add(p, 'head', 0.35 * k);
    } },
    hit: { dur: 0.5, pose(t, p) {
      const k = Math.exp(-7 * t);
      p.lean += 0.32 * k; add(p, 'head', 0.45 * k); p.x += 14 * k;
      add(p, 'foreL', -0.5 * k); add(p, 'foreR', 0.45 * k);
      add(p, 'handL', -0.6 * k); add(p, 'handR', 0.6 * k); p.curl += -0.6 * k;
    } },
    /** Knocked back by a blast: thrown up and back, lands, then returns to its spot. */
    blast: { dur: 1.8, pose(t, p) {
      const fly = bump(t, 0, 0.55);
      p.x += 90 * ease(t / 0.55) * (1 - ease((t - 0.75) / 1.05)); p.y += -55 * fly;
      p.lean += 0.55 * fly; add(p, 'head', 0.6 * fly);
      add(p, 'foreL', -0.9 * fly); add(p, 'foreR', 0.8 * fly); add(p, 'legL', -0.5 * fly); add(p, 'legR', 0.4 * fly);
      add(p, 'handL', -0.7 * fly); add(p, 'handR', 0.7 * fly); p.curl += -0.6 * fly;
      const land = bump(t, 0.5, 0.8); squash(p, 'legL', -0.2 * land); squash(p, 'legR', -0.2 * land); p.y += 8 * land;
    } },
    attack: { dur: 1.0, pose(t, p) {
      const wind = ease(t / 0.35) * (1 - ease((t - 0.35) / 0.12));
      const strike = ease((t - 0.35) / 0.15) * (1 - ease((t - 0.62) / 0.35));
      p.lean += 0.14 * wind - 0.32 * strike; p.x += -30 * strike;
      add(p, 'foreL', 0.75 * wind - 0.55 * strike); add(p, 'foreR', -0.8 * wind + 0.55 * strike);
      add(p, 'head', 0.12 * wind - 0.25 * strike); add(p, 'legL', -0.25 * strike); add(p, 'legR', 0.12 * strike);
      const whip = ease((t - 0.42) / 0.12) * (1 - ease((t - 0.66) / 0.3));
      add(p, 'handL', 0.55 * wind - 0.75 * whip); add(p, 'handR', -0.55 * wind + 0.75 * whip);
      p.curl += -0.7 * wind + 1.1 * whip;
    } },
    death: { dur: 3.2, pose(t, p) {
      const jolt = bump(t, 0, 0.3);
      p.lean += 0.25 * jolt; add(p, 'head', 0.3 * jolt);
      const buckle = ease((t - 0.25) / 0.6);
      add(p, 'legL', 0.55 * buckle); add(p, 'legR', -0.45 * buckle); squash(p, 'legL', -0.35 * buckle); squash(p, 'legR', -0.35 * buckle);
      p.y += 70 * buckle;
      // drops to its knees, then topples face-first; the arms go limp along the body
      const fall = ease((t - 0.5) / 0.5);
      p.lean += -1.4 * fall; p.x += 30 * fall;
      add(p, 'foreL', 0.95 * fall); add(p, 'foreR', 1.2 * fall);
      add(p, 'handL', 0.5 * fall); add(p, 'handR', -0.4 * fall); p.curl += 0.5 * fall;
      add(p, 'legL', 0.35 * fall); add(p, 'legR', 0.2 * fall);
      p.hide.head = t > 0.62;
      p.sink = ease((t - 2.1) / 0.9); p.alpha = 1 - ease((t - 2.4) / 0.8);
    } },
  },
};

export const RIG_MOVES: Record<string, RigMoves> = { grunt };
