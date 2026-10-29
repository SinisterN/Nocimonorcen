// The tuning panel of an Era Studio sandbox (builds made with VITE_SANDBOX_ERA): change the era's gameplay numbers
// while playing (tower cost, damage, range, fire rate; enemy health, speed, armour, gold; start gold), feel the
// difference at once, and copy the changes as a note for the studio, which writes them into the era. Changes are
// kept in this browser until reset. Nothing here exists in the live game.
import { dataEra } from './eras';

type Field = { key: string; label: string; min: number; max: number; step: number };
const TOWER_FIELDS: Field[] = [
  { key: 'cost', label: 'Cost', min: 10, max: 500, step: 5 },
  { key: 'damage', label: 'Damage', min: 1, max: 2000, step: 1 },
  { key: 'range', label: 'Range (tiles)', min: 1, max: 8, step: 0.1 },
  { key: 'fireDelay', label: 'Seconds between shots', min: 0.05, max: 10, step: 0.05 },
];
const ENEMY_FIELDS: Field[] = [
  { key: 'hp', label: 'Health', min: 1, max: 100000, step: 1 },
  { key: 'speed', label: 'Speed (tiles/s)', min: 0.1, max: 5, step: 0.05 },
  { key: 'armor', label: 'Armour', min: 0, max: 20, step: 1 },
  { key: 'reward', label: 'Gold on kill', min: 0, max: 500, step: 1 },
  { key: 'leakDamage', label: 'Lives lost if it gets through', min: 1, max: 20, step: 1 },
];
const ERA_FIELDS: Field[] = [
  { key: 'startGold', label: 'Start gold', min: 50, max: 2000, step: 10 },
  { key: 'hpStep', label: 'Enemy health growth per wave', min: 0.02, max: 0.3, step: 0.01 },
  { key: 'killGoldPerWave', label: 'Extra kill gold per wave', min: 0, max: 0.3, step: 0.01 },
];

type Row = { path: string; label: string; obj: Record<string, number>; f: Field };
const nice = (k: string) => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

/** Sets up the panel for a sandbox era: applies saved changes and adds a Tune button to the page. Call once. */
export function mountTuning(id: string) {
  const era = dataEra(id);
  if (!era || document.getElementById('tune-btn')) return;
  const store = `nocimonorcen.tune.${id}`;
  const rows: Row[] = [];
  const eraObj = era as unknown as Record<string, number>;
  // the game's own defaults where the era doesn't set them (config.ts HP_STEP, no extra kill gold)
  eraObj.hpStep ??= 0.1; eraObj.killGoldPerWave ??= 0;
  for (const f of ERA_FIELDS) if (typeof eraObj[f.key] === 'number') rows.push({ path: f.key, label: f.label, obj: eraObj, f });
  for (const k of era.towerOrder) {
    const t = era.towers[k] as unknown as Record<string, number>;
    for (const f of TOWER_FIELDS) if (typeof t?.[f.key] === 'number') rows.push({ path: `towers.${k}.${f.key}`, label: `${era.towers[k].name || nice(k)}: ${f.label}`, obj: t, f });
  }
  for (const [k, e] of Object.entries(era.enemies)) {
    const o = e as unknown as Record<string, number>;
    for (const f of ENEMY_FIELDS) if (typeof o?.[f.key] === 'number') rows.push({ path: `enemies.${k}.${f.key}`, label: `${e.name || nice(k)}: ${f.label}`, obj: o, f });
  }
  const field = (r: Row) => r.path.split('.').pop()!;
  const base: Record<string, number> = Object.fromEntries(rows.map(r => [r.path, r.obj[field(r)] ?? 0]));
  let saved: Record<string, number> = {};
  try { saved = JSON.parse(localStorage.getItem(store) || '{}') || {}; } catch { saved = {}; }
  const set = (r: Row, v: number) => { r.obj[field(r)] = v; };
  for (const r of rows) if (typeof saved[r.path] === 'number') set(r, saved[r.path]);
  const save = () => { try { localStorage.setItem(store, JSON.stringify(saved)); } catch { /* not kept: fine */ } };

  const css = document.createElement('style');
  css.textContent = `
#tune-btn{position:fixed;right:10px;top:10px;z-index:20;font:700 13px system-ui,sans-serif;padding:6px 12px;border-radius:8px;
  border:1.5px solid #e8c37a;background:#2a2118;color:#ffe08a;cursor:pointer;opacity:.9}
#tune{position:fixed;right:10px;top:48px;z-index:21;width:min(380px,calc(100vw - 20px));max-height:calc(100vh - 70px);overflow:auto;
  background:#1d1814f2;color:#f3e9dc;border:1.5px solid #e8c37a;border-radius:10px;padding:10px 12px;font:13px system-ui,sans-serif;display:none}
#tune h3{margin:10px 0 4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#e8c37a}
#tune label{display:grid;grid-template-columns:minmax(0,1fr) 88px;gap:8px;align-items:center;margin:3px 0}
#tune input{width:100%;box-sizing:border-box;background:#2c231b;color:#f3e9dc;border:1px solid #5a4a3a;border-radius:6px;padding:3px 6px;font:inherit}
#tune label.changed span{color:#ffe08a;font-weight:700} #tune label.changed input{border-color:#e8c37a}
#tune .row{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px} #tune button{font:700 12px system-ui,sans-serif;padding:5px 10px;border-radius:7px;
  border:1px solid #e8c37a;background:#3a2d20;color:#ffe08a;cursor:pointer} #tune textarea{width:100%;box-sizing:border-box;margin-top:8px;
  background:#2c231b;color:#f3e9dc;border:1px solid #5a4a3a;border-radius:6px;font:12px system-ui,sans-serif;display:none}
#tune small{color:#b9a68f;display:block;margin-top:4px}`;
  document.head.append(css);
  const btn = document.createElement('button');
  btn.id = 'tune-btn'; btn.type = 'button'; btn.textContent = 'Tune numbers';
  const panel = document.createElement('div');
  panel.id = 'tune';
  // typing a number must not build towers or start waves: keep the game's keyboard out of the panel
  for (const ev of ['keydown', 'keyup', 'keypress']) panel.addEventListener(ev, e => e.stopPropagation());
  const note = document.createElement('textarea');
  note.rows = 4; note.readOnly = true;
  const head = document.createElement('div');
  head.innerHTML = '<strong>Tune numbers</strong><small>Changes count from the next tower you build and the next enemy that appears (start gold from the next game). Kept in this browser until you reset them.</small>';
  panel.append(head);
  let group = '';
  const inputs = new Map<string, { label: HTMLLabelElement; input: HTMLInputElement }>();
  for (const r of rows) {
    const g = r.path.startsWith('towers.') ? 'Towers' : r.path.startsWith('enemies.') ? 'Enemies' : 'Whole era';
    if (g !== group) { const h = document.createElement('h3'); h.textContent = g; panel.append(h); group = g; }
    const label = document.createElement('label');
    const span = document.createElement('span'); span.textContent = r.label;
    const input = document.createElement('input');
    Object.assign(input, { type: 'number', min: String(r.f.min), max: String(r.f.max), step: String(r.f.step), value: String(r.obj[field(r)]) });
    input.addEventListener('change', () => {
      const v = Math.min(r.f.max, Math.max(r.f.min, Number(input.value)));
      if (!Number.isFinite(v)) { input.value = String(r.obj[field(r)]); return; }
      input.value = String(v);
      set(r, v);
      if (v === base[r.path]) delete saved[r.path]; else saved[r.path] = v;
      save(); mark();
    });
    label.append(span, input); panel.append(label);
    inputs.set(r.path, { label, input });
  }
  const mark = () => { for (const [p, x] of inputs) x.label.classList.toggle('changed', p in saved); };
  const text = () => {
    const changed = rows.filter(r => r.path in saved);
    if (!changed.length) return '';
    return `Numbers from the sandbox tuning panel: ${changed.map(r => `${r.label} ${base[r.path]} → ${saved[r.path]}`).join('; ')}.\n`
      + `[tune] ${changed.map(r => `${r.path}=${saved[r.path]}`).join('; ')}`;
  };
  const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = 'Copy for the studio';
  copy.addEventListener('click', async () => {
    const t = text();
    note.style.display = 'block';
    note.value = t || 'Nothing changed yet.';
    if (!t) return;
    note.select();
    try { await navigator.clipboard.writeText(t); copy.textContent = 'Copied: paste it in your sandbox notes'; }
    catch { copy.textContent = 'Select the text below and copy it'; }
  });
  const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = 'Reset all';
  reset.addEventListener('click', () => {
    for (const r of rows) { set(r, base[r.path]); const x = inputs.get(r.path); if (x) x.input.value = String(base[r.path]); }
    saved = {}; save(); mark(); note.style.display = 'none'; copy.textContent = 'Copy for the studio';
  });
  const actions = document.createElement('div'); actions.className = 'row'; actions.append(copy, reset);
  const help = document.createElement('small');
  help.textContent = 'Paste the copied text into “Notes after playing the sandbox” in the Era Studio and send: the studio writes these numbers into the era.';
  panel.append(actions, note, help);
  btn.addEventListener('click', () => { panel.style.display = panel.style.display === 'block' ? 'none' : 'block'; });
  document.body.append(btn, panel);
  mark();
}
