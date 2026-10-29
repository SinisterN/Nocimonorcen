"""An era's gameplay numbers, apart from its art: what a sandbox reads from `era-data/<id>.json` beside its page
(src/eras/index.ts TUNABLE), so a numbers-only change is published as that one file, with no rebuild and no PC.

  python tools/era/studio/era_numbers.py data  <src/eras/id.json> <out era-data file>    (write the numbers file)
  python tools/era/studio/era_numbers.py apply <src/eras/id.json> "<path=value; ...>"   (change numbers in place)
  python tools/era/studio/era_numbers.py parse "<sandbox notes text>"                     -> {path: value} from a [tune] line

Paths: towers.<kind>.<cost|damage|range|fireDelay>, enemies.<kind>.<hp|speed|armor|reward|leakDamage>, startGold,
hpStep, killGoldPerWave. Values are checked against the same ranges as the sandbox's tuning panel (src/tuning.ts).
The same changes are kept in the work file's `spec.overrides` ({path: value}), which install.py applies after every
full install, so a later rebuild keeps them.
"""
import json, re, sys
from pathlib import Path

TUNABLE = ['towers', 'enemies', 'waves', 'startGold', 'killGoldPerWave', 'hpStep', 'levels']
RANGES = {
    'towers': {'cost': (10, 500), 'damage': (1, 2000), 'range': (1, 8), 'fireDelay': (0.05, 10)},
    'enemies': {'hp': (1, 100000), 'speed': (0.1, 5), 'armor': (0, 20), 'reward': (0, 500), 'leakDamage': (1, 20)},
    None: {'startGold': (50, 2000), 'hpStep': (0.02, 0.3), 'killGoldPerWave': (0, 0.3)},
}


def check(data, path, value):
    """Returns (container, key, clamped value) for a valid path, or raises ValueError saying why."""
    parts = path.split('.')
    if len(parts) == 1 and parts[0] in RANGES[None]:
        lo, hi = RANGES[None][parts[0]]
        return data, parts[0], min(hi, max(lo, value))
    if len(parts) == 3 and parts[0] in ('towers', 'enemies') and parts[2] in RANGES[parts[0]]:
        group = data.get(parts[0]) or {}
        if parts[1] not in group: raise ValueError(f'{path}: no {parts[0][:-1]} called {parts[1]} in this era')
        lo, hi = RANGES[parts[0]][parts[2]]
        return group[parts[1]], parts[2], min(hi, max(lo, value))
    raise ValueError(f'{path}: not a number the studio may change this way')


def apply_overrides(data, overrides):
    """Applies {path: value}; returns [(path, old, new)]. Invalid paths raise ValueError."""
    done = []
    for path, value in (overrides or {}).items():
        obj, key, v = check(data, path, float(value))
        v = int(v) if float(v).is_integer() and key not in ('range', 'fireDelay', 'speed', 'hpStep', 'killGoldPerWave') else round(v, 3)
        done.append((path, obj.get(key), v))
        obj[key] = v
    return done


def parse(text):
    """The [tune] line the sandbox's tuning panel copies: '[tune] towers.x.cost=65; enemies.y.reward=16'."""
    m = re.search(r'\[tune\]([^\n]*)', text or '')
    out = {}
    for part in (m.group(1).split(';') if m else []):
        if '=' in part:
            k, v = part.split('=', 1)
            try: out[k.strip()] = float(v.strip())
            except ValueError: pass
    return out


def numbers(data):
    return {'id': data['id'], **{k: data[k] for k in TUNABLE if k in data}}


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'parse':
        print(json.dumps(parse(sys.argv[2])))
        sys.exit()
    era = Path(sys.argv[2]); data = json.loads(era.read_text())
    if cmd == 'data':
        out = Path(sys.argv[3]); out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(numbers(data), separators=(',', ':')))
        print('wrote', out)
    elif cmd == 'apply':
        arg = sys.argv[3]
        ov = json.loads(arg) if arg.strip().startswith('{') else {k.strip(): float(v) for k, v in (p.split('=', 1) for p in arg.split(';') if '=' in p)}
        changes = apply_overrides(data, ov)
        era.write_text(json.dumps(data, indent=1))
        print(json.dumps([{'path': p, 'from': a, 'to': b} for p, a, b in changes]))
