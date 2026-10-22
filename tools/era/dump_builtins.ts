// Dumps the built-in towers, enemies and era layouts as JSON for tools/era (behaviour catalogue and era templates).
// usage: npx vite-node tools/era/dump_builtins.ts > /tmp/builtins.json
import * as C from '../../src/config';
import { eraLook } from '../../src/era';
const out: any = { towers: {}, enemies: {}, templates: {} };
for (const e of ['era1', 'era2', 'era3']) {
  C.setEra(e);
  for (const k of C.TOWER_ORDER) out.towers[k] = { era: e, ...C.TOWERS[k], hp: C.TOWER_HP[k] ?? null, trait: C.LEVEL3_TRAIT[k] };
  for (const [k, d] of Object.entries(C.ENEMIES)) out.enemies[k] = { era: e, ...d };
  out.templates[e] = { lanes: C.PATH_LANES, plots: C.PLOTS, waves: C.WAVES, startGold: C.START_GOLD,
    killGoldPerWave: C.KILL_GOLD_PER_WAVE, enemies: Object.keys(C.ENEMIES), atmosphere: eraLook().atmosphere };
}
console.log(JSON.stringify(out));
