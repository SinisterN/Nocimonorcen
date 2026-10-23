"""Per-level tower attacks for Era Studio eras (the game side is src/levels.ts): checks a tower's confirmed levels
against the game's limits, estimates how strong each level is, and says in plain words what each level does (for the
"How it plays" round).

A tower's levels, as confirmed in "How it plays" (work file: mechanics[<kind>].levels), levels 1-3:
  {"name": "Archmage", "attack": {<blocks>}, "special": {<blocks>, "every": 3 | "everySec": 10, "name": "Frozen Orb"},
   "units": 1 | 2}
Blocks (all optional): damage (multiplier), splash (tiles), pierce (enemies behind), spread (enemies around, 60%),
  chill {seconds, factor}, burn {seconds, dps, radius}, homing, multi (shots at once), second (another target),
  line {range, speed, width} (a travelling shot that hits everything it passes).

usage: python tools/era/abilities.py <levels.json> [fireDelay seconds]   -> checked levels, power and text as JSON
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _limits():
    """LIMITS from src/levels.ts, so the studio and the game can never disagree."""
    src = (ROOT / 'src' / 'levels.ts').read_text()
    body = re.search(r'export const LIMITS = \{(.*?)\} as const', src, re.S).group(1)
    return {k: (float(a), float(b)) for k, a, b in re.findall(r'(\w+): \[([\d.]+), ([\d.]+)\]', body)}


LIMITS = _limits()
BLOCKS = {'damage', 'splash', 'pierce', 'spread', 'chill', 'burn', 'homing', 'multi', 'second', 'line'}
# how strong a level may be against a plain shot at that level, before the owner has to OK it
# (the built-in level 3 traits roughly double a tower: Twin Archers, Dual Rail)
POWER_CAP = {1: 1.35, 2: 1.7, 3: 2.3}


def _clamp(v, key, problems, where):
    lo, hi = LIMITS[key]
    if not isinstance(v, (int, float)): problems.append(f'{where}: {key} must be a number'); return lo
    if v < lo or v > hi: problems.append(f'{where}: {key} {v} is outside {lo:g}-{hi:g}, set to {min(hi, max(lo, v)):g}')
    return min(hi, max(lo, v))


def check_blocks(b, where, problems):
    out = {}
    for k in b:
        if k not in BLOCKS | {'every', 'everySec', 'name', 'text'}: problems.append(f'{where}: unknown block {k}')
    if 'damage' in b: out['damage'] = _clamp(b['damage'], 'damage', problems, where)
    if b.get('splash'): out['splash'] = _clamp(b['splash'], 'splash', problems, where)
    for k in ('pierce', 'spread', 'multi'):
        if b.get(k): out[k] = round(_clamp(b[k], k, problems, where))
    if b.get('chill'):
        out['chill'] = {'seconds': _clamp(b['chill'].get('seconds', 1), 'chillSeconds', problems, where),
                        'factor': _clamp(b['chill'].get('factor', 0.7), 'chillFactor', problems, where)}
    if b.get('burn'):
        out['burn'] = {'seconds': _clamp(b['burn'].get('seconds', 3), 'burnSeconds', problems, where),
                       'dps': _clamp(b['burn'].get('dps', 0.35), 'burnDps', problems, where),
                       'radius': _clamp(b['burn'].get('radius', 0.8), 'burnRadius', problems, where)}
    if b.get('homing'): out['homing'] = True
    if b.get('second'): out['second'] = True
    if b.get('line'):
        out['line'] = {'range': _clamp(b['line'].get('range', 5), 'lineRange', problems, where),
                       'speed': _clamp(b['line'].get('speed', 3), 'lineSpeed', problems, where),
                       'width': _clamp(b['line'].get('width', 0.5), 'lineWidth', problems, where)}
    return out


def strength(b):
    """Rough damage of one attack against a plain shot (1.0): extra hits, lasting effects and slows count."""
    hits = 1 + 0.5 * b.get('pierce', 0) + 0.3 * b.get('spread', 0) + (1.5 if b.get('line') else 0)
    v = b.get('damage', 1) * b.get('multi', 1) * hits * (2 if b.get('second') else 1)
    if b.get('burn'): v += b['burn']['dps'] * b['burn']['seconds'] * 0.5 * b.get('damage', 1)
    if b.get('chill'): v *= 1 + 0.25 * (1 - b['chill']['factor']) * min(1, b['chill']['seconds'])
    if b.get('splash'): v *= 1 + 0.6 * b['splash']   # splash towers have splash already; only extra counts much
    return v


def check_levels(levels, fire_delay=1.0, base_splash=0.0):
    """-> (clean levels, problems, power per level). Power = the level's damage against a plain shot at that level."""
    problems, clean, power = [], [], []
    if not isinstance(levels, list) or not 1 <= len(levels) <= 3: return [], ['levels: give 1 to 3 levels'], []
    for i, L in enumerate(levels, 1):
        w = f'level {i}'
        a = check_blocks(L.get('attack') or {}, w, problems)
        out = {k: L[k] for k in ('name', 'text') if L.get(k)}
        out['attack'] = a
        out['units'] = 2 if L.get('units') == 2 else 1
        p = strength(a) / strength({'splash': base_splash} if base_splash else {})
        s = L.get('special')
        if s:
            sb = check_blocks(s, f'{w} special', problems)
            if s.get('every'):
                sb['every'] = round(_clamp(s['every'], 'every', problems, f'{w} special'))
                # every Nth shot is the special instead
                p += (strength(sb) - strength(a)) / sb['every'] / strength({'splash': base_splash} if base_splash else {})
            elif s.get('everySec'):
                sb['everySec'] = _clamp(s['everySec'], 'everySec', problems, f'{w} special')
                # on top: one special per everySec, against the shots fired in that time
                p += strength(sb) * fire_delay / sb['everySec'] / strength({'splash': base_splash} if base_splash else {})
            else:
                problems.append(f'{w} special: say how often (every Nth shot, or every N seconds)')
            if s.get('name'): sb['name'] = s['name']
            out['special'] = sb
        p = round(p, 2)
        power.append(p)
        if p > POWER_CAP[i]: problems.append(f'{w}: about {p:g}x a plain shot, over the {POWER_CAP[i]:g}x guide (needs the owner\'s OK)')
        clean.append(out)
    return clean, problems, power


def say(b):
    """Plain words for one attack's blocks."""
    bits = []
    if b.get('damage', 1) != 1: bits.append(f"{round(b['damage'] * 100)}% damage")
    if b.get('multi', 1) > 1: bits.append(f"{b['multi']} shots at once")
    if b.get('second'): bits.append('a second shot at another target')
    if b.get('line'): bits.append(f"flies on {b['line']['range']:g} tiles, hitting everything it passes")
    if b.get('splash'): bits.append(f"hits everything within {b['splash']:g} tiles")
    if b.get('pierce'): bits.append(f"goes through into {b['pierce']} enem{'y' if b['pierce'] == 1 else 'ies'} behind")
    if b.get('spread'): bits.append(f"shards hit {b['spread']} nearby enem{'y' if b['spread'] == 1 else 'ies'}")
    if b.get('homing'): bits.append('chases its target')
    if b.get('chill'): bits.append(f"slows to {round(b['chill']['factor'] * 100)}% speed for {b['chill']['seconds']:g} s")
    if b.get('burn'): bits.append(f"leaves burning ground for {b['burn']['seconds']:g} s")
    return ', '.join(bits)


def _nth(n):
    return {2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth'}.get(n, f'{n}th')


def describe(levels):
    """One line per level for the designer to confirm."""
    lines = []
    for i, L in enumerate(levels, 1):
        a = say(L.get('attack') or {}) or 'its plain shot'
        line = f"Level {i}{' – ' + L['name'] if L.get('name') else ''}: {a}"
        if L.get('units') == 2: line += '; two units'
        s = L.get('special')
        if s:
            how = f"every {_nth(s['every'])} shot" if s.get('every') else f"every {s['everySec']:g} s"
            line += f". Special{' – ' + s['name'] if s.get('name') else ''}, {how}: {say(s) or 'a stronger shot'}"
        lines.append(line + '.')
    return '\n'.join(lines)


if __name__ == '__main__':
    lv = json.loads(Path(sys.argv[1]).read_text())
    clean, problems, power = check_levels(lv, float(sys.argv[2]) if len(sys.argv) > 2 else 1.0)
    print(json.dumps({'levels': clean, 'problems': problems, 'power': power, 'text': describe(clean)}, indent=1))
