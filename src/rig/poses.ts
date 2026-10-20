// Poses for cut-out enemy rigs. Shared by the game (rigView.ts) and the rig lab page (tools/rig), so keep this
// file free of Phaser and DOM code. Units are rig units (the rig's own pixel space); angles in radians, positive
// = clockwise on screen. A pose names a rotation per joint; `lean` turns the whole upper body at the hip.

export interface Pose {
  x: number; y: number; lean: number; alpha: number; sink: number;
  /** Whole figure tipping over around its feet (falls), radians. */
  tilt: number;
  /** Rotation per joint (part name), e.g. head, foreL, handR. */
  rot: Record<string, number>;
  /** Vertical squash per part (legs when stepping or buckling). */
  sy: Record<string, number>;
  /** Claw curl, 0 = relaxed, 1 = raked shut, negative = spread. Parts with a `curl` sign turn with it. */
  curl: number;
  /** Picture frame per part, for parts painted in several frames (the droid's sliding treads). */
  frame: Record<string, number>;
  /** Parts not drawn (the head once it has rolled off). */
  hide: Record<string, boolean>;
}

export function basePose(): Pose { return { x: 0, y: 0, lean: 0, tilt: 0, alpha: 1, sink: 0, rot: {}, sy: {}, frame: {}, curl: 0, hide: {} }; }

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
  /** Effect drawn on the death: sparks and a smoke puff from the body. */
  deathFx?: 'sparks';
  /** Sparks fly off when it is hit or knocked back. */
  hitFx?: 'sparks';
  /** Muzzle flash on the attack: where on which part (rig units), the barrel's direction, and when in the attack. */
  muzzle?: { part: string; x: number; y: number; angle: number; at: number };
  /** A part that comes off during the death (the zombie's head, the robot's head, the tank's turret). */
  detach?: { part: string; at: number };
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
  detach: { part: 'head', at: 0.62 },
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

// ---------------------------------------------------------------- shared building blocks
// fwd: +1 when the painted enemy faces right (+x is forward in rig space), -1 when it faces left.
interface BipedCfg {
  fwd: 1 | -1;
  /** Stride swing of the legs, bob height, arm swing (radians / rig units). */
  stride: number; bob: number; swing: number;
  /** Parts swung like arms, and the head (if any). */
  arms: [string, string]; head?: string;
  attack: Act;
  death: 'topple' | 'collapse' | 'machine';
  detach?: { part: string; at: number };
  /** Extra motion added to the walk (e.g. a tail sway). */
  walkExtra?: (ph: number, p: Pose) => void;
}

function hitAct(c: BipedCfg): Act {
  return { dur: 0.45, pose(t, p) {
    const k = Math.exp(-8 * t);
    p.tilt += -c.fwd * 0.08 * k; p.lean += -c.fwd * 0.1 * k; p.x += -c.fwd * 8 * k;
    if (c.head) add(p, c.head, -c.fwd * 0.3 * k);
    add(p, c.arms[0], -c.fwd * 0.3 * k); add(p, c.arms[1], -c.fwd * 0.25 * k);
  } };
}
function blastAct(c: BipedCfg): Act {
  return { dur: 1.8, pose(t, p) {
    const fly = bump(t, 0, 0.55);
    p.x += -c.fwd * 80 * ease(t / 0.55) * (1 - ease((t - 0.75) / 1.05)); p.y += -45 * fly;
    // the whole figure tips back in the air; only a little bend at the hip so the legs stay attached
    p.tilt += -c.fwd * 0.4 * fly; p.lean += -c.fwd * 0.08 * fly; if (c.head) add(p, c.head, -c.fwd * 0.5 * fly);
    add(p, c.arms[0], -c.fwd * 0.7 * fly); add(p, c.arms[1], -c.fwd * 0.6 * fly);
    add(p, 'legL', c.fwd * 0.35 * fly); add(p, 'legR', -c.fwd * 0.3 * fly);
    const land = bump(t, 0.5, 0.8); squash(p, 'legL', -0.15 * land); squash(p, 'legR', -0.15 * land); p.y += 6 * land;
  } };
}
function stumbleAct(c: BipedCfg): Act {
  return { dur: 1.2, pose(t, p) {
    const k = bump(t, 0, 0.7);
    p.tilt += c.fwd * 0.3 * k; p.lean += c.fwd * 0.1 * k; p.x += c.fwd * 18 * k; p.y += 4 * k;
    add(p, 'legL', c.fwd * 0.3 * k); add(p, 'legR', -c.fwd * 0.2 * k);
    add(p, c.arms[0], 0.6 * Math.sin(t * 26) * k); add(p, c.arms[1], -0.5 * Math.sin(t * 22 + 1) * k);
    if (c.head) add(p, c.head, c.fwd * 0.3 * k);
  } };
}
function deathAct(c: BipedCfg): Act {
  if (c.death === 'collapse') return { dur: 2.6, pose(t, p) {
    const drop = ease(t / 0.45);
    squash(p, 'legL', -0.45 * drop); squash(p, 'legR', -0.45 * drop); add(p, 'legL', -0.5 * drop); add(p, 'legR', 0.5 * drop);
    add(p, 'legsF', -0.25 * drop); add(p, 'legsB', 0.25 * drop); squash(p, 'legsF', -0.45 * drop); squash(p, 'legsB', -0.45 * drop);
    p.y += 50 * drop; p.lean += c.fwd * 0.2 * drop;
    add(p, c.arms[0], 0.4 * drop); add(p, c.arms[1], -0.4 * drop); if (c.head) add(p, c.head, c.fwd * 0.4 * drop);
    if (c.detach) p.hide[c.detach.part] = t > c.detach.at;
    p.sink = ease((t - 1.6) / 0.8); p.alpha = 1 - ease((t - 1.8) / 0.7);
  } };
  // topple: knees give, then the whole body falls over backwards; machines fall forwards and lose a part
  const back = c.death === 'topple' ? -c.fwd : c.fwd;
  return { dur: 3.0, pose(t, p) {
    const jolt = bump(t, 0, 0.3);
    p.lean += -c.fwd * 0.2 * jolt;
    const buckle = ease((t - 0.2) / 0.5);
    add(p, 'legL', -c.fwd * 0.4 * buckle); add(p, 'legR', c.fwd * 0.3 * buckle); squash(p, 'legL', -0.3 * buckle); squash(p, 'legR', -0.3 * buckle);
    p.y += 45 * buckle;
    const fall = ease((t - 0.45) / 0.55);
    p.tilt += back * 1.45 * fall; p.lean += back * 0.15 * fall; p.x += back * 20 * fall; p.y -= 30 * fall;
    const limp = c.death === 'machine' ? 0.25 : 0.8;   // machine arms just go slack
    add(p, c.arms[0], back * 0.7 * limp * fall); add(p, c.arms[1], back * 0.9 * limp * fall);
    if (c.head) add(p, c.head, back * 0.3 * fall);
    if (c.detach) p.hide[c.detach.part] = t > c.detach.at;
    p.sink = ease((t - 2.0) / 0.9); p.alpha = 1 - ease((t - 2.2) / 0.8);
  } };
}
function biped(c: BipedCfg): RigMoves {
  return {
    walk(ph, p) {
      add(p, 'legL', c.stride * Math.sin(ph)); add(p, 'legR', -c.stride * Math.sin(ph));
      squash(p, 'legL', -0.04 * Math.max(0, -Math.cos(ph))); squash(p, 'legR', -0.04 * Math.max(0, Math.cos(ph)));
      p.y += -c.bob * Math.abs(Math.cos(ph));
      p.lean += c.fwd * (0.05 + 0.02 * Math.sin(ph * 2));
      add(p, c.arms[0], -c.swing * Math.sin(ph)); add(p, c.arms[1], c.swing * Math.sin(ph));
      if (c.head) add(p, c.head, 0.04 * Math.sin(ph * 2 + 0.6));
      c.walkExtra?.(ph, p);
    },
    idle(t, p) {
      const ph = t * Math.PI * 2 / 2.4;
      p.y += -1.5 * Math.sin(ph); p.lean += c.fwd * 0.02 * Math.sin(ph);
      add(p, c.arms[0], 0.04 * Math.sin(ph + 1)); add(p, c.arms[1], -0.04 * Math.sin(ph + 1.4));
      if (c.head) add(p, c.head, 0.05 * Math.sin(ph * 0.7));
      c.walkExtra?.(t * 2, p);
    },
    detach: c.detach,
    acts: { hit: hitAct(c), blast: blastAct(c), stumble: stumbleAct(c), attack: c.attack, death: deathAct(c) },
  };
}
/**
 * Overhead chop with a weapon hanging behind the body: up over the head (`up` radians), chopped down in front
 * (`chop`), then on round to rest (2π) as a follow-through. fwd as in BipedCfg.
 */
function overhead(arm: string, up: number, chop: number, fwd: 1 | -1, lunge = 16): Act {
  return { dur: 1.3, pose(t, p) {
    const u = ease(t / 0.42), c = ease((t - 0.42) / 0.14), through = ease((t - 0.7) / 0.5);
    const a = t < 0.42 ? up * u : t < 0.7 ? up + (chop - up) * c : chop + (Math.PI * 2 - chop) * through;
    add(p, arm, t >= 1.2 ? 0 : fwd * a);
    const s = bump(t, 0.42, 0.95);
    p.lean += fwd * (-0.12 * bump(t, 0, 0.45) + 0.28 * s); p.x += fwd * lunge * s;
    add(p, 'legL', fwd * 0.2 * s); add(p, 'legR', -fwd * 0.15 * s); add(p, 'head', fwd * 0.12 * s);
  } };
}
/** Wind-up then strike with one arm (radians: + raises a weapon held below-left of the shoulder, see each rig). */
function swing(arm: string, wind: number, strike: number, fwd: 1 | -1, dur = 1.1, lunge = 18): Act {
  return { dur, pose(t, p) {
    const w = ease(t / 0.4) * (1 - ease((t - 0.4) / 0.1));
    const s = ease((t - 0.4) / 0.12) * (1 - ease((t - 0.7) / 0.35));
    add(p, arm, wind * w + strike * s);
    p.lean += -fwd * 0.12 * w + fwd * 0.25 * s; p.x += fwd * lunge * s;
    add(p, 'legL', fwd * 0.2 * s); add(p, 'legR', -fwd * 0.12 * s);
  } };
}

// ---------------------------------------------------------------- era 1
const fast: RigMoves = {
  // skittering: front and back leg pairs paddle in turn from the shoulders and hips, quick hops, the tail sways
  walk(ph, p) {
    const q = ph * 1.6;
    add(p, 'legsF', 0.1 * Math.sin(q)); add(p, 'legsB', -0.1 * Math.sin(q));
    squash(p, 'legsF', -0.05 * Math.max(0, Math.cos(q))); squash(p, 'legsB', -0.05 * Math.max(0, -Math.cos(q)));
    p.y += -5 * Math.abs(Math.sin(q));
    add(p, 'tail', 0.06 * Math.sin(q * 0.5 + 1)); add(p, 'head', 0.06 * Math.sin(q + 0.5));
  },
  idle(t, p) {
    const ph = t * Math.PI * 2 / 1.8;
    add(p, 'tail', 0.05 * Math.sin(ph)); add(p, 'head', 0.07 * Math.sin(ph * 1.3));
    p.y += -1.5 * Math.sin(ph * 2);
  },
  acts: {
    hit: { dur: 0.4, pose(t, p) { const k = Math.exp(-9 * t); p.x += 10 * k; p.lean += 0.15 * k; add(p, 'head', 0.3 * k); add(p, 'tail', 0.12 * k); } },
    blast: { dur: 1.6, pose(t, p) {
      const fly = bump(t, 0, 0.5);
      p.x += 85 * ease(t / 0.5) * (1 - ease((t - 0.7) / 0.9)); p.y += -60 * fly; p.lean += 0.6 * fly;
      add(p, 'legsF', -0.5 * fly); add(p, 'legsB', 0.5 * fly); add(p, 'tail', 0.3 * fly);
    } },
    stumble: { dur: 0.9, pose(t, p) {
      // the front legs fold and it nose-dives for a moment; legs stay attached because they hang from the body
      const k = bump(t, 0, 0.6);
      p.tilt += -0.12 * k; squash(p, 'legsF', -0.25 * k); add(p, 'legsF', -0.12 * k); p.y += 10 * k;
      add(p, 'head', -0.25 * k); add(p, 'tail', 0.1 * k);
    } },
    // the tail cocks back, then lashes forward over the head like a scorpion
    attack: { dur: 0.9, pose(t, p) {
      const w = ease(t / 0.35) * (1 - ease((t - 0.35) / 0.08));
      const s = ease((t - 0.35) / 0.1) * (1 - ease((t - 0.6) / 0.3));
      add(p, 'tail', 0.22 * w - 0.38 * s); p.lean += 0.08 * w - 0.1 * s; add(p, 'head', -0.15 * s);
      add(p, 'legsF', 0.12 * w); p.x += -10 * s;
    } },
    death: { dur: 2.4, pose(t, p) {
      const drop = ease(t / 0.35);
      squash(p, 'legsF', -0.5 * drop); squash(p, 'legsB', -0.5 * drop); add(p, 'legsF', -0.35 * drop); add(p, 'legsB', 0.35 * drop);
      p.y += 45 * drop; add(p, 'tail', 0.25 * ease((t - 0.2) / 0.5)); add(p, 'head', 0.3 * drop);
      p.sink = ease((t - 1.5) / 0.8); p.alpha = 1 - ease((t - 1.7) / 0.7);
    } },
  },
};
const armored = biped({ fwd: 1, stride: 0.24, bob: 4, swing: 0.12, arms: ['armL', 'armR'], head: 'head', death: 'topple',
  // the big axe comes up from his side and chops down
  attack: overhead('armL', 2.6, 4.6, 1) });
const shaman: RigMoves = (() => {
  const m = biped({ fwd: 1, stride: 0.16, bob: 3, swing: 0.1, arms: ['staff', 'armR'], head: 'head', death: 'collapse',
    // lifts the lantern staff high, then plants it: the green healing pulse goes off on the thump
    attack: { dur: 1.2, pose(t, p) {
      const up = ease(t / 0.45) * (1 - ease((t - 0.55) / 0.15));
      const thump = bump(t, 0.6, 0.85);
      add(p, 'staff', 0.35 * up); p.y += -14 * up + 8 * thump; p.lean += 0.08 * up;
      add(p, 'armR', 0.5 * up); add(p, 'head', 0.15 * up - 0.1 * thump);
    } } });
  return m;
})();
const brute = biped({ fwd: 1, stride: 0.2, bob: 6, swing: 0.1, arms: ['armL', 'armR'], head: 'head', death: 'topple',
  // hauls the gravestone from behind him up over his head and slams it down in front
  attack: overhead('armL', 2.8, 5.2, 1, 10) });

// ---------------------------------------------------------------- era 2
const robot = biped({ fwd: 1, stride: 0.22, bob: 4, swing: 0.1, arms: ['armL', 'armR'], head: 'head', death: 'machine',
  detach: { part: 'head', at: 0.5 },
  // raises the rifle level and fires a juddering burst
  attack: { dur: 1.0, pose(t, p) {
    const aim = ease(t / 0.25) * (1 - ease((t - 0.8) / 0.2));
    const burst = t > 0.3 && t < 0.75 ? Math.abs(Math.sin(t * 60)) : 0;
    add(p, 'armR', -0.65 * aim + 0.08 * burst); p.x += -3 * burst; add(p, 'head', -0.05 * aim);
    add(p, 'armL', -0.2 * aim); p.lean += -0.04 * burst;
  } } });
const shield = biped({ fwd: 1, stride: 0.16, bob: 3, swing: 0.06, arms: ['gun', 'shield'], head: 'head', death: 'machine',
  detach: { part: 'head', at: 0.5 },
  // leans into the shield and pokes the rifle out past it for a burst
  attack: { dur: 1.0, pose(t, p) {
    const brace = ease(t / 0.25) * (1 - ease((t - 0.8) / 0.2));
    const burst = t > 0.3 && t < 0.75 ? Math.abs(Math.sin(t * 60)) : 0;
    p.lean += 0.08 * brace; add(p, 'shield', -0.08 * brace); add(p, 'gun', -0.85 * brace + 0.08 * burst);
    p.x += -2 * burst;
  } } });
const walker = biped({ fwd: -1, stride: 0.2, bob: 6, swing: 0.08, arms: ['armL', 'armR'], death: 'machine',
  detach: { part: 'podL', at: 0.55 },
  walkExtra(ph, p) { add(p, 'podL', 0.03 * Math.sin(ph * 2)); add(p, 'podR', 0.03 * Math.sin(ph * 2 + 1)); },
  // plants its feet, the rocket pods tilt up, and each one kicks back as it fires
  attack: { dur: 1.4, pose(t, p) {
    const brace = ease(t / 0.3) * (1 - ease((t - 1.1) / 0.3));
    squash(p, 'legL', -0.06 * brace); squash(p, 'legR', -0.06 * brace); p.y += 6 * brace;
    const kickL = t > 0.55 ? Math.exp(-10 * (t - 0.55)) : 0, kickR = t > 0.8 ? Math.exp(-10 * (t - 0.8)) : 0;
    add(p, 'podL', 0.35 * brace + 0.7 * kickL); add(p, 'podR', 0.35 * brace + 0.7 * kickR);
    p.lean += 0.06 * brace + 0.06 * (kickL + kickR); p.x += 10 * (kickL + kickR);
  } } });
const treads = (p: Pose, step: number) => { const f = ((Math.floor(step) % 4) + 4) % 4; p.frame.trackL = f; p.frame.trackR = f; };
const droid: RigMoves = {
  // the treads roll; the body rocks on its axle above them and the explosive pack wobbles with it
  walk(ph, p) {
    treads(p, ph * 1.4);
    p.lean += 0.05 + 0.035 * Math.sin(ph * 1.5); p.y += -1.2 * Math.abs(Math.sin(ph * 3));
  },
  idle(t, p) { p.lean += 0.008 * Math.sin(t * 38); },
  acts: {
    hit: { dur: 0.4, pose(t, p) { const k = Math.exp(-9 * t); p.lean += -0.18 * k; p.x += -6 * k; } },
    blast: { dur: 1.4, pose(t, p) { const fly = bump(t, 0, 0.5); p.x += -70 * ease(t / 0.5) * (1 - ease((t - 0.6) / 0.8)); p.y += -45 * fly; p.tilt += -0.35 * fly; p.lean += -0.15 * fly; } },
    stumble: { dur: 0.6, pose(t, p) { const k = bump(t, 0, 0.5); p.lean += 0.15 * k; p.tilt += 0.05 * k; } },
    // revs the treads in place, rocks back, then lurches forward
    attack: { dur: 0.9, pose(t, p) {
      const rev = ease(t / 0.35) * (1 - ease((t - 0.75) / 0.15)), l = bump(t, 0.35, 0.8);
      treads(p, t * 30); p.lean += -0.12 * rev * (1 - l) + 0.22 * l; p.x += 2 * Math.sin(t * 70) * rev + 28 * l;
    } },
    // shorts out: lurches, slumps forward on its axle, sags onto its tracks, then smoulders away
    death: { dur: 2.6, pose(t, p) {
      const jolt = bump(t, 0, 0.25), slump = ease((t - 0.15) / 0.5);
      p.lean += -0.1 * jolt + 0.4 * slump; p.y += 10 * slump + 3 * Math.sin(t * 40) * jolt;
      squash(p, 'trackL', -0.08 * slump); squash(p, 'trackR', -0.08 * slump);
      p.sink = ease((t - 1.7) / 0.8); p.alpha = 1 - ease((t - 1.9) / 0.7);
    } },
  },
  deathFx: 'sparks',
};
const tank: RigMoves = {
  // the treads roll under a heavy hull; the turret drifts a little as it tracks
  walk(ph, p) {
    const f = ((Math.floor(ph * 1.2) % 4) + 4) % 4; p.frame.torso = f;
    p.y += -0.8 * Math.abs(Math.sin(ph * 3)); p.lean += 0.006 * Math.sin(ph * 2); add(p, 'turret', 0.012 * Math.sin(ph * 0.7));
  },
  idle(t, p) { p.y += -0.5 * Math.sin(t * 34); add(p, 'turret', 0.02 * Math.sin(t * 0.8)); },
  hitFx: 'sparks',
  deathFx: 'sparks',
  muzzle: { part: 'barrel', x: 468, y: 284, angle: 0.4, at: 0.6 },
  acts: {
    hit: { dur: 0.35, pose(t, p) { const k = Math.exp(-10 * t); p.x += -5 * k; p.lean += -0.015 * k; add(p, 'turret', 0.03 * k); } },
    blast: { dur: 0.9, pose(t, p) { const k = bump(t, 0, 0.45); p.y += -10 * k; p.tilt += -0.06 * k; p.x += -8 * k; add(p, 'turret', 0.05 * k); } },
    stumble: { dur: 0.5, pose(t, p) { p.lean += 0.03 * bump(t, 0, 0.5); } },
    // the barrel lifts, then the whole tank rocks back on the shot
    attack: { dur: 1.4, pose(t, p) {
      const aim = ease(t / 0.5) * (1 - ease((t - 1.1) / 0.3));
      const kick = t > 0.6 ? Math.exp(-6 * (t - 0.6)) : 0;
      add(p, 'barrel', -0.1 * aim + 0.08 * kick); add(p, 'turret', -0.03 * aim); p.x += -22 * kick; p.lean += -0.04 * kick;
      if (t > 0.6) p.frame.torso = ((Math.floor((t - 0.6) * 12) % 4) + 4) % 4;
    } },
    // shudders, the barrel snaps off, the hull sags down on its tracks and smoulders
    death: { dur: 3.0, pose(t, p) {
      const shake = bump(t, 0, 0.6);
      p.x += 3 * Math.sin(t * 55) * shake; add(p, 'turret', 0.04 * Math.sin(t * 40) * shake);
      const sag = ease((t - 0.5) / 0.6);
      p.y += 10 * sag; p.lean += 0.03 * sag; add(p, 'turret', 0.12 * sag);
      // the barrel snaps at the mantlet and droops to the ground
      const snap = ease((t - 0.55) / 0.35); add(p, 'barrel', 0.24 * snap + 0.05 * Math.sin(t * 30) * bump(t, 0.85, 1.2));
      p.sink = ease((t - 2.1) / 0.8); p.alpha = 1 - ease((t - 2.2) / 0.8);
    } },
  },
};

export const RIG_MOVES: Record<string, RigMoves> = { grunt, fast, armored, shaman, brute, robot, shield, walker, droid, tank };
