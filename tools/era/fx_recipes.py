"""Layered effect recipes for Era Studio towers (src/fxRecipe.ts): what a hit looks like (hitFx), what a shot leaves
behind in flight or what a stream's jet looks like (shotFx), and burning ground (burnFx), drawn in code by the game.
The picked pictures can take part as a small element (`image` layer) or as the texture of flung `shards`.

A spec tower carries them as `recipes` (written in the effects round, see studio/RUNBOOK.md):
  {"l1": {"hitFx": {...}, "shotFx": {...}, "burnFx": {...}}, "l2": {...}, "l3": {...}, "<special slug>": {...}}
A level without its own part keeps the level below's. Start from tools/era/fx_presets.json (named starting points).

usage: python tools/era/fx_recipes.py check <recipes.json>                 problems per tower, as JSON
       python tools/era/fx_recipes.py apply <src/eras/<era>.json> <recipes.json> [impactScale per tower JSON]
         puts recipes into an installed era file (what install.py does), e.g. to try recipes on a built era
"""
import copy, json, re, sys
from pathlib import Path

PARTS = ('hitFx', 'shotFx', 'burnFx')
# the same ranges as FX_LIMITS in src/fxRecipe.ts (the game clamps again whatever it gets)
TYPES = {'flash': (1, 1), 'fireball': (1, 16), 'smoke': (1, 10), 'sparks': (1, 24), 'embers': (1, 16), 'shards': (1, 12),
         'mist': (1, 10), 'ring': (1, 1), 'mark': (1, 1), 'spikes': (1, 10), 'image': (1, 1), 'core': (1, 1)}
NUM = {'size': (0.2, 2), 'speed': (0.3, 2), 'rise': (0, 2), 'life': (80, 2500), 'delay': (0, 600), 'every': (15, 400), 'cracks': (0, 10)}
RECIPE_NUM = {'scale': (0.3, 1.2), 'size': (12, 80)}
MAX_LAYERS = 10
HEX = re.compile(r'^#[0-9a-fA-F]{6}$')


def special_slug(name):
    """'Frozen Orb' -> 'frozen_orb' (as src/levels.ts specialSlug and abilities.special_slug)."""
    return re.sub(r'[^a-z0-9]+', '_', (name or '').lower()).strip('_')[:20]


def clean_recipe(r, where, problems):
    """The recipe with unknown keys dropped and numbers held in range; what was changed goes into problems."""
    if not isinstance(r, dict) or not isinstance(r.get('layers'), list):
        problems.append(f'{where}: needs a list of layers'); return None
    out = {}
    for k, (lo, hi) in RECIPE_NUM.items():
        if k in r:
            v = r[k]
            if not isinstance(v, (int, float)): problems.append(f'{where}: {k} must be a number'); continue
            if not lo <= v <= hi: problems.append(f'{where}: {k} {v} outside {lo}-{hi}')
            out[k] = min(hi, max(lo, v))
    for k in ('shake', 'sprite'):
        if k in r: out[k] = bool(r[k])
    layers = []
    for i, l in enumerate(r['layers']):
        w = f'{where} layer {i + 1}'
        if not isinstance(l, dict) or l.get('type') not in TYPES:
            problems.append(f"{w}: unknown type {l.get('type') if isinstance(l, dict) else l!r}"); continue
        if len(layers) >= MAX_LAYERS: problems.append(f'{where}: more than {MAX_LAYERS} layers, the rest dropped'); break
        c = {'type': l['type']}
        cols = l.get('colors')
        if cols is not None:
            good = [x for x in cols if isinstance(x, str) and HEX.match(x)][:4] if isinstance(cols, list) else []
            if not isinstance(cols, list) or len(good) != len(cols): problems.append(f'{w}: colours must be up to 4 "#rrggbb"')
            if good: c['colors'] = good
        if 'count' in l:
            lo, hi = TYPES[l['type']]
            v = l['count']
            if not isinstance(v, (int, float)): problems.append(f'{w}: count must be a number')
            else:
                if not lo <= v <= hi: problems.append(f"{w}: count {v} outside {lo}-{hi} for {l['type']}")
                c['count'] = int(min(hi, max(lo, round(v))))
        for k, (lo, hi) in NUM.items():
            if k not in l: continue
            v = l[k]
            if k == 'life' and l['type'] == 'mark': lo, hi = 300, 5000
            if not isinstance(v, (int, float)): problems.append(f'{w}: {k} must be a number'); continue
            if not lo <= v <= hi: problems.append(f'{w}: {k} {v} outside {lo}-{hi}')
            c[k] = min(hi, max(lo, v))
        if 'texture' in l:
            if isinstance(l['texture'], str) and re.fullmatch(r'[a-z0-9_]{1,64}', l['texture']): c['texture'] = l['texture']
            else: problems.append(f'{w}: texture must be "impact", "projectile" or a sprite name')
        if l.get('blend') in ('add', 'normal'): c['blend'] = l['blend']
        if l.get('trail'): c['trail'] = True
        layers.append(c)
    if not layers: problems.append(f'{where}: no usable layer'); return None
    out['layers'] = layers
    return out


def check(recipes):
    """recipes: {tower kind: {"l1"|"l2"|"l3"|special slug: {hitFx, shotFx, burnFx}}} -> (clean copy, problems)."""
    problems, out = [], {}
    for kind, parts in (recipes or {}).items():
        for key, look in (parts or {}).items():
            if key.startswith('_'): continue      # notes
            for part, r in (look or {}).items():
                if part not in PARTS: problems.append(f'{kind} {key}: unknown part {part} (hitFx, shotFx, burnFx)'); continue
                c = clean_recipe(r, f'{kind} {key} {part}', problems)
                if c: out.setdefault(kind, {}).setdefault(key, {})[part] = c
    return out, problems


def scale_recipe(f, s):
    """The designer's effect size tuning (spec.tuning.impactScale) applied to a look's hit recipe."""
    h = f.get('hitFx')
    if not h or s == 1.0: return
    if 'size' in h or 'scale' not in h: h['size'] = round(min(80, max(12, (h.get('size') or 32) * s)), 1)
    h['scale'] = round(min(1.2, max(0.3, (h.get('scale') or 0.8) * s)), 3)


def apply(data, recipes, tuning=None):
    """Puts each tower's recipes into an era's data (its level-1 look `fx[kind]`, each level's `fx` and each special's
    `fx`), a level without its own part keeping the level below's. tuning: {kind: impactScale} (0.3-1.5)."""
    clean, problems = check(recipes)
    for kind, parts in clean.items():
        fx = data.setdefault('fx', {})
        base = fx.setdefault(kind, {})
        levels = (data.get('levels') or {}).get(kind) or []
        s = min(1.5, max(0.3, float((tuning or {}).get(kind, 1.0))))
        cur = {}
        for n in (1, 2, 3):
            cur = {**cur, **(parts.get(f'l{n}') or {})}
            L = levels[n - 1] if n - 1 < len(levels) else None
            if n == 1:
                base.update(copy.deepcopy(cur)); scale_recipe(base, s)
            if L is not None and cur and (L.get('fx') or n > 1):
                # a level with its own pictures keeps them; one without gets the level-1 look plus its recipes
                L['fx'] = {**(L.get('fx') or {k: v for k, v in base.items() if k not in PARTS}), **copy.deepcopy(cur)}
                scale_recipe(L['fx'], s)
            for sp in (L or {}).get('specials') or []:
                own = parts.get(special_slug(sp.get('name')))
                if own:
                    sp['fx'] = {**(sp.get('fx') or {}), **copy.deepcopy(own)}
                    scale_recipe(sp['fx'], s)
    return problems


def main():
    if len(sys.argv) >= 3 and sys.argv[1] == 'check':
        _, problems = check(json.loads(Path(sys.argv[2]).read_text()))
        print(json.dumps({'ok': not problems, 'problems': problems}, indent=1))
    elif len(sys.argv) >= 4 and sys.argv[1] == 'apply':
        era = Path(sys.argv[2])
        data = json.loads(era.read_text())
        problems = apply(data, json.loads(Path(sys.argv[3]).read_text()), json.loads(sys.argv[4]) if len(sys.argv) > 4 else None)
        era.write_text(json.dumps(data, indent=1))
        print(json.dumps({'wrote': str(era), 'problems': problems}, indent=1))
    else:
        print(__doc__); sys.exit(1)


if __name__ == '__main__':
    main()
