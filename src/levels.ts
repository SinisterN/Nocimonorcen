// Era Studio towers can evolve per level: each level has its own attack, built from blocks the game already knows
// (splash, piercing, burning ground, homing, ...), an optional special (every Nth shot or every N seconds), its
// own shot and hit art and its own unit. Only data eras that give a tower `levels` use this; the built-in eras keep
// their fixed level 3 traits (Twin Archers, Hellfire, ...) and never come through here.
//
// Every number is held inside the ranges below, whatever the era file says, so a design can't break the game.
import { ERA_ID, TowerDef } from './config';
import { TowerFx, dataEra } from './eras';
import { clamp } from './eraFx';

/** The building blocks of an attack. All optional; a level with none plays like the copied behaviour's level 1. */
export interface Blocks {
  /** Damage type (ice, fire…): enemies with a resistance take less of it, or more with a weakness. */
  type?: string;
  /** Damage multiplier on the tower's damage at this level (specials mostly). */
  damage?: number;
  /** Area damage radius in tiles (replaces the behaviour's own splash). */
  splash?: number;
  /** Carries on through into up to this many enemies behind the target, along the line of flight. */
  pierce?: number;
  /** Also hits up to this many enemies bunched up around the target, at 60% damage (shards, buckshot). */
  spread?: number;
  /** Slows the enemies it hits (bosses shrug it off). factor: their speed is multiplied by this. */
  chill?: { seconds: number; factor: number };
  /** Leaves burning ground where it hits. dps: a share of the hit's damage per second. */
  burn?: { seconds: number; dps: number; radius?: number };
  /**
   * Keeps hurting the enemies it hits for `seconds` (a draining bite, poison, bleeding): dps is a share of the hit's
   * damage per second. A new drain on the same enemy refreshes it (the stronger one wins), it doesn't stack.
   */
  drain?: { seconds: number; dps: number };
  /** Lifts the enemies it hits off the road and holds them completely still for `seconds` (bosses can't be held). */
  hold?: { seconds: number };
  /**
   * Ricochets: after a hit the shot bounces on to the nearest enemy it hasn't hit yet, `times` times in all, each bounce
   * doing `falloff` of the hit before it.
   */
  bounce?: { times: number; falloff?: number };
  /** The shot chases its target. */
  homing?: boolean;
  /** Shots fired at the same target in one go. */
  multi?: number;
  /** A second shot at another target (with two units, the second unit fires it). */
  second?: boolean;
  /**
   * A travelling shot: flies straight on past its target for `range` tiles at `speed`, hitting everything it passes.
   * `back`: at the end of its run it turns and flies back to the tower like a boomerang, hitting everything it passes
   * again on the way back.
   */
  line?: { range: number; speed: number; width?: number; back?: boolean };
  /**
   * A continuous stream (a flame jet, an ice breath): in bursts of `burst` seconds with a `pause` between, it hits
   * everything in a cone `length` tiles long (that is also how far it reaches), several times a second, for the
   * tower's normal damage per second times `damage`. Specials go off with the bursts.
   */
  stream?: { length: number; width: number; burst: number; pause: number };
}

export interface Special extends Blocks {
  /** Every Nth shot is the special (it replaces that shot). */
  every?: number;
  /** Or: cast every so many seconds, on top of the normal shots. */
  everySec?: number;
  name?: string;
  /** The special's own shot and hit art. */
  fx?: TowerFx;
}

export interface LevelSpec {
  /** Shown in the upgrade menu, e.g. 'Archmage' / 'Casts a frozen orb every 10 s'. */
  name?: string;
  text?: string;
  attack?: Blocks;
  /** One special, or several (`specials`): each goes off on its own count or timer. */
  special?: Special;
  specials?: Special[];
  /** This level's shot and hit art (falls back to the era's fx for the tower). */
  fx?: TowerFx;
  /** This level's unit (sprite, and its animation sheet with idle, shoot and optionally cast). */
  unit?: { sprite: string; anim?: string };
  /** Units standing on the tower: 1 or 2. */
  units?: number;
}

export const LIMITS = {
  damage: [0.3, 4], splash: [0, 1.6], pierce: [0, 4], spread: [0, 4],
  chillSeconds: [0.3, 3], chillFactor: [0.4, 0.9],
  burnSeconds: [1, 5], burnDps: [0.1, 0.6], burnRadius: [0.4, 1.4],
  drainSeconds: [1, 6], drainDps: [0.1, 0.6],
  holdSeconds: [0.5, 3],
  bounceTimes: [1, 4], bounceFalloff: [0.4, 1],
  multi: [1, 3], lineRange: [2, 9], lineSpeed: [1.5, 8], lineWidth: [0.3, 0.9],
  every: [2, 10], everySec: [4, 30],
  streamLength: [1.5, 5], streamWidth: [0.4, 1.2], streamBurst: [1, 4], streamPause: [1, 6],
} as const;
const c = (v: number | undefined, k: keyof typeof LIMITS, dflt: number) => clamp(v, LIMITS[k][0], LIMITS[k][1], dflt);

/** The blocks with every number held in range. */
export function safeBlocks(b: Blocks | undefined): Blocks {
  if (!b) return {};
  const o: Blocks = {};
  if (typeof b.type === 'string' && /^[a-z]{1,16}$/.test(b.type)) o.type = b.type;
  if (b.damage !== undefined) o.damage = c(b.damage, 'damage', 1);
  if (b.splash !== undefined) o.splash = c(b.splash, 'splash', 0);
  if (b.pierce) o.pierce = Math.round(c(b.pierce, 'pierce', 0));
  if (b.spread) o.spread = Math.round(c(b.spread, 'spread', 0));
  if (b.chill) o.chill = { seconds: c(b.chill.seconds, 'chillSeconds', 1), factor: c(b.chill.factor, 'chillFactor', 0.7) };
  if (b.burn) o.burn = { seconds: c(b.burn.seconds, 'burnSeconds', 3), dps: c(b.burn.dps, 'burnDps', 0.35), radius: c(b.burn.radius, 'burnRadius', 0.8) };
  if (b.drain) o.drain = { seconds: c(b.drain.seconds, 'drainSeconds', 3), dps: c(b.drain.dps, 'drainDps', 0.3) };
  if (b.hold) o.hold = { seconds: c(b.hold.seconds, 'holdSeconds', 1.5) };
  if (b.bounce) o.bounce = { times: Math.round(c(b.bounce.times, 'bounceTimes', 2)), falloff: c(b.bounce.falloff, 'bounceFalloff', 0.75) };
  if (b.homing) o.homing = true;
  if (b.multi) o.multi = Math.round(c(b.multi, 'multi', 1));
  if (b.second) o.second = true;
  if (b.stream) o.stream = { length: c(b.stream.length, 'streamLength', 3), width: c(b.stream.width, 'streamWidth', 0.7),
    burst: c(b.stream.burst, 'streamBurst', 2), pause: c(b.stream.pause, 'streamPause', 2) };
  if (b.line) {
    o.line = { range: c(b.line.range, 'lineRange', 5), speed: c(b.line.speed, 'lineSpeed', 3), width: c(b.line.width, 'lineWidth', 0.5) };
    if (b.line.back) o.line.back = true;
  }
  return o;
}

/** Does this tower evolve per level (an Era Studio tower with `levels`)? Crew towers never do. */
export function hasLevels(def: TowerDef): boolean {
  return !def.crew && !!dataEra(ERA_ID)?.levels?.[def.kind]?.length;
}

/** The tower's spec at a level (1-3), with the numbers held in range; a missing level repeats the one below. */
export function levelSpec(def: TowerDef, level: number): LevelSpec | undefined {
  const list = dataEra(ERA_ID)?.levels?.[def.kind];
  if (!list?.length || def.crew) return undefined;
  const L = list[Math.min(level, list.length) - 1];
  const specials = [...(L.special ? [L.special] : []), ...(L.specials ?? [])].slice(0, 3)
    .filter(s => s.every || s.everySec)
    .map((s): Special => ({
      ...safeBlocks(s), name: s.name, fx: s.fx,
      ...(s.every ? { every: Math.round(c(s.every, 'every', 3)) } : { everySec: c(s.everySec, 'everySec', 10) }),
    }));
  return { ...L, attack: safeBlocks(L.attack), special: undefined, specials, units: L.units === 2 ? 2 : 1 };
}

/** A special's name as an id part ('Frozen Orb' -> 'frozen_orb'); the studio names its pictures and sounds so. */
export const specialSlug = (name: string | undefined) => (name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 20);

/** How much of a hit of this damage type the enemy takes (its `resist`, held between -0.5 and 0.8). */
export function resistMult(def: { resist?: Record<string, number> }, type: string | undefined): number {
  if (!type || !def.resist) return 1;
  const r = def.resist[type];
  return typeof r === 'number' && isFinite(r) ? 1 - Math.max(-0.5, Math.min(0.8, r)) : 1;
}
