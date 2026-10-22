// The upgrade draft: 6 options (2 gold, 2 silver, 2 bronze), locked by the reward tier the player earned.
// The tier comes from how well the defence held during the waves since the last draft (see ratePerf).
// Effects stack multiplicatively.
import { WeaponRank } from './config';

export type RewardTier = 'fail' | 'bronze' | 'silver' | 'gold';
export type OptionTier = 'bronze' | 'silver' | 'gold';
export type Category = 'offense' | 'economy' | 'utility';

export interface Modifiers {
  rankDamage: Record<WeaponRank, number>;
  fireRate: number;   // multiplier on shots per second
  range: number;
  gold: number;       // multiplier on kill gold
  splash: number;
  upgradeCost: number; // multiplier on tower upgrade prices (puzzle rewards can lower it)
}

export const freshModifiers = (): Modifiers => ({
  rankDamage: { 1: 1, 2: 1, 3: 1, 4: 1 },
  fireRate: 1, range: 1, gold: 1, splash: 1, upgradeCost: 1,
});

export interface UpgradeOption {
  id: string;
  tier: OptionTier;
  category: Category;
  title: string;
  describe: (pct: number) => string;
  apply: (m: Modifiers, factor: number) => void;
  power: number;      // base percentage for this tier
}

const TIER_POWER: Record<OptionTier, number> = { bronze: 12, silver: 22, gold: 38 };
const RANK_NAMES: Record<WeaponRank, string> = { 1: 'Rank 1', 2: 'Rank 2', 3: 'Rank 3', 4: 'Rank 4' };

type Template = Omit<UpgradeOption, 'tier' | 'power' | 'id'> & { key: string };

const TEMPLATES: Template[] = [
  ...([1, 2, 3] as WeaponRank[]).map((r): Template => ({
    key: `rank${r}`, category: 'offense', title: `${RANK_NAMES[r]} weapons`,
    describe: (p) => `+${p}% damage for rank ${r} towers`,
    apply: (m, f) => { m.rankDamage[r] *= f; },
  })),
  { key: 'all', category: 'offense', title: 'Groovy firepower', describe: (p) => `+${Math.round(p * 0.6)}% damage for all towers`,
    apply: (m, f) => { const g = 1 + (f - 1) * 0.6; ([1, 2, 3, 4] as WeaponRank[]).forEach(r => (m.rankDamage[r] *= g)); } },
  { key: 'rate', category: 'utility', title: 'Itchy trigger', describe: (p) => `+${Math.round(p * 0.7)}% fire rate`,
    apply: (m, f) => { m.fireRate *= 1 + (f - 1) * 0.7; } },
  { key: 'range', category: 'utility', title: 'Eagle eye', describe: (p) => `+${Math.round(p * 0.5)}% tower range`,
    apply: (m, f) => { m.range *= 1 + (f - 1) * 0.5; } },
  { key: 'splash', category: 'utility', title: 'Bigger boom', describe: (p) => `+${p}% splash radius`,
    apply: (m, f) => { m.splash *= f; } },
  { key: 'gold', category: 'economy', title: 'Loot the dead', describe: (p) => `+${p}% gold from kills`,
    apply: (m, f) => { m.gold *= f; } },
];

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const shuffle = <T,>(arr: T[]): T[] => arr.map(v => [Math.random(), v] as const).sort((a, b) => a[0] - b[0]).map(x => x[1]);

function make(t: Template, tier: OptionTier, i: number): UpgradeOption {
  return { ...t, id: `${t.key}-${tier}-${i}`, tier, power: TIER_POWER[tier] };
}

export function rollDraft(): UpgradeOption[] {
  // 6 different upgrades per draft: gold and silver pairs first, then a bronze pair
  // that always comes from two different categories, so it is a real choice.
  const pool = shuffle(TEMPLATES);
  const out: UpgradeOption[] = [];
  for (const tier of ['gold', 'silver'] as OptionTier[]) {
    pool.splice(0, 2).forEach((t, i) => out.push(make(t, tier, i)));
  }
  const first = pool.shift()!;
  const second = pool.find(t => t.category !== first.category)
    ?? pick(TEMPLATES.filter(t => t.category !== first.category));
  out.push(make(first, 'bronze', 0), make(second, 'bronze', 1));
  return out;
}

export function isUnlocked(opt: OptionTier, earned: RewardTier): boolean {
  const order = { fail: 0, bronze: 1, silver: 2, gold: 3 } as const;
  return order[earned] >= order[opt];
}

// Failure: one random bronze option, weakened by a random 15–30%.
export function failurePick(draft: UpgradeOption[]): { option: UpgradeOption; pct: number } {
  const bronze = draft.filter(d => d.tier === 'bronze');
  const option = pick(bronze);
  const penalty = 0.15 + Math.random() * 0.15;
  return { option, pct: Math.max(1, Math.round(option.power * (1 - penalty))) };
}

export function applyOption(m: Modifiers, option: UpgradeOption, pct = option.power) {
  option.apply(m, 1 + pct / 100);
}

// Pity floor: after 2 results of bronze or worse in a row, the next one is at least silver.
export class PityTracker {
  private lowStreak = 0;
  adjust(earned: RewardTier): { tier: RewardTier; boosted: boolean } {
    let tier = earned;
    let boosted = false;
    if (this.lowStreak >= 2 && (earned === 'fail' || earned === 'bronze')) {
      tier = 'silver';
      boosted = true;
    }
    this.lowStreak = tier === 'fail' || tier === 'bronze' ? this.lowStreak + 1 : 0;
    return { tier, boosted };
  }
}

// ---------- rating the defence ----------
/** What happened during one block of waves (the waves between two drafts). */
export interface Perf {
  /** Base health at the start of the block. */
  hp0: number;
  /** Enemies that reached the base. */
  leaks: number;
  /** For every enemy that fell or leaked: how far along the road it got (0 = the gate, 1 = the base). */
  reach: number[];
  /** Damage the towers took, in whole towers' worth of health (era 2 and 3 enemies hit back). */
  towerDamage: number;
  towersLost: number;
}

export const freshPerf = (hp0: number): Perf => ({ hp0, leaks: 0, reach: [], towerDamage: 0, towersLost: 0 });

export interface Rating {
  tier: RewardTier;
  /** 0..100 */
  score: number;
  hpLost: number;
  /** Average share of the road the enemies covered, 0..1. */
  reach: number;
  towersLost: number;
}

/** PLACEHOLDER weights, to be calibrated with bot runs. */
export function ratePerf(p: Perf, hpNow: number): Rating {
  const hpLost = Math.max(0, p.hp0 - hpNow);
  const reach = p.reach.length ? p.reach.reduce((a, b) => a + b, 0) / p.reach.length : 0;
  const score = Math.max(0, Math.min(100, Math.round(100 - hpLost * 6 - Math.max(0, reach - 0.3) * 100 - p.towersLost * 10)));
  const tier: RewardTier = score >= 85 ? 'gold' : score >= 65 ? 'silver' : score >= 40 ? 'bronze' : 'fail';
  return { tier, score, hpLost, reach, towersLost: p.towersLost };
}
