"""Turns an era spec (tools/era/example_spec.json) into a build plan: the generation steps per gate, what each step
makes, which earlier pick it builds on, and a GPU time estimate. The Era Studio page shows the plan and its
estimate; the orchestrator runs it one step at a time (tools/era/manifest.py writes each step's generator job).

usage: python tools/era/plan.py <spec.json> [out plan.json]
"""
import re
import json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from abilities import special_slug  # noqa: E402

HERE = Path(__file__).parent
CAT = json.loads((HERE / 'behaviours.json').read_text())

# GPU seconds per take, measured on the owner's 24 GB card (Era 3 and the trailer work)
COST = {'layout': 0, 'map': 20, 'image': 10, 'anim': 140, 'sfx': 6, 'music': 20, 'voice': 10}  # seconds per take; anim measured
# in the Frozen Pass dry run (about 2.3 min a take, was guessed at 3), sfx/voice per the generator's own estimate
TAKES = {'map': 6, 'image': 4, 'back': 2, 'anim': 2, 'sfx': 4, 'music': 2, 'voice': 3}

# mechanics with a unit standing on the tower (the arrow tower's archer): an era can give it its own unit
UNIT_BEHAVIOURS = {'arrow'}
# mechanics whose shots hit at once (tracers, beams, buckshot): no projectile picture, only an impact and a colour
INSTANT = {k for k, v in json.loads((HERE / 'builtins.json').read_text())['towers'].items() if not v.get('flightTime')}

HERO_EVENTS = {'towerBuilt': 4, 'kill': 5, 'baseHit': 4, 'waveStart': 3, 'waveCleared': 3, 'towerSold': 2}



def the(name):
    """'the' + a name, without doubling an article the designer already wrote ('a frost wizard' -> 'the frost wizard')."""
    return 'the ' + re.sub(r'^(a|an|the)\s+', '', name.strip(), flags=re.I)

def lv(t, n, key):
    """The designer's text for one tower level (1-3): `levels[n-1][key]`, level 1 also from the tower's own fields."""
    L = (t.get('levels') or [{}, {}, {}])
    v = (L[n - 1] if n - 1 < len(L) else {}).get(key)
    if not v and n == 1: v = t.get(key)
    return (v or '').strip() or None


def specials_of(t, n):
    """Level n's specials as [(slug, name)]: the confirmed "How it plays" levels decide; before that, the
    designer's text. A special keeps its slug across levels, so its pictures are made once."""
    play = t.get('play')
    if play:
        L = play[n - 1] if n - 1 < len(play) else {}
        sps = ([L['special']] if L.get('special') else []) + list(L.get('specials') or [])
        return [(special_slug(sp, n, j), sp.get('name')) for j, sp in enumerate(sps, 1)]
    return [(f'sp{n}', None)] if lv(t, n, 'special') else []


def special_of(t, n): return bool(specials_of(t, n))


def unit_text(t, n):
    """Who stands on the tower at level n: the designer's words, else a stronger version of the level below."""
    u1 = lv(t, 1, 'unit') or f"the figure who mans the {t['name']}"
    return lv(t, n, 'unit') or (u1 if n == 1 else f"{u1}, now {'more powerful, with stronger gear and a brighter aura' if n == 2 else 'at the height of their power, grand and radiant'}")


def validate(spec):
    errs = []
    for k in ('id', 'name', 'theme', 'style', 'towers', 'enemies', 'boss'):
        if not spec.get(k): errs.append(f'missing {k}')
    if len(spec.get('towers', [])) != 3: errs.append('exactly 3 towers')
    if len(spec.get('enemies', [])) != 4: errs.append('exactly 4 enemies')
    seen = set()
    for t in spec.get('towers', []):
        if t.get('behaves') not in CAT['towers']: errs.append(f"tower {t.get('kind')}: unknown behaviour {t.get('behaves')}")
    for e in spec.get('enemies', []) + [spec.get('boss') or {}]:
        b = CAT['enemies'].get(e.get('behaves'))
        if not b: errs.append(f"enemy {e.get('kind')}: unknown behaviour {e.get('behaves')}")
        elif b['boss'] != (e is spec.get('boss')): errs.append(f"{e.get('kind')}: {'a boss needs a boss behaviour' if e is spec.get('boss') else 'boss behaviours are for the boss only'}")
    return errs


def layered(sid, spec):
    """Sounds that are really two events at once come out muddled from one call (the Frozen Pass dry run redid every
    one of these): they are made from parts from the first round, mixed by tools/era/studio/layer_sound.py."""
    t = spec.get('sounds', '')
    base = spec['base']['name']
    return {
        'explosion': [{'prompt': f'a deep heavy boom, a single low explosion thump, {t}', 'seconds': 0.9, 'at': 0, 'gain': 0},
                      {'prompt': f'debris and rubble scattering and settling after a blast, {t}', 'seconds': 1.2, 'at': 0.15, 'gain': -5}],
        'base_hit': [{'prompt': f'a hard heavy impact thud against the {base}', 'seconds': 0.8, 'at': 0, 'gain': 0},
                     {'prompt': f'creaking and cracking of a damaged {base}, small debris falling', 'seconds': 1.4, 'at': 0.2, 'gain': -4}],
        'death_big': [{'prompt': f'a huge creature\'s dying roar fading out, {t}', 'seconds': 1.6, 'at': 0, 'gain': 0},
                      {'prompt': 'a massive body crashing onto the ground, a heavy thud', 'seconds': 1.0, 'at': 0.7, 'gain': -2}],
    }.get(sid)


def sound_slots(spec):
    """The era's sound effects: shared moments, one shot per tower, spawn calls per enemy, two deaths."""
    t = spec.get('sounds', '')
    slots = [
        ('build', f'placing and building a defence tower, {t}', 1.5),
        ('base_hit', f"the {spec['base']['name']} is hit hard, impact and damage, {t}", 2.0),
        ('wave_start', f'an alarm signal announcing an attack, {t}', 2.5),
        ('wave_clear', f'short triumphant stinger, the wave is beaten, {t}', 3.0),
        ('victory', f'triumphant victory fanfare stinger, {t}', 5.0),
        ('defeat', f'sad defeat stinger, {t}', 4.0),
        ('explosion', f'impact explosion, {t}', 1.5),
        ('death_small', f'a small creature dies, {t}', 1.2),
        ('death_big', f'a huge creature collapses, {t}', 2.0),
    ]
    for tw in spec['towers']:
        slots.append((f"shot_{tw['kind']}", f"{tw['name']} firing: {tw['look']}", 1.2))
    burns = False
    for tw in spec['towers']:
        # each tower's own hit, each level that fires something new (a stream roars for its whole burst), each special
        k, play = tw['kind'], tw.get('play') or []
        shot = lv(tw, 1, 'shot') or tw['look']
        slots.append((f"hit_{k}", f"{lv(tw, 1, 'impact') or shot + ' hitting its target'}, impact sound", 1.0))
        for n in (2, 3):
            L = play[n - 1] if n - 1 < len(play) else {}
            st, s_n = (L.get('attack') or {}).get('stream'), lv(tw, n, 'shot')
            if st: slots.append((f"shot_{k}_l{n}", f"{tw['name']}: {s_n or shot}, as one continuous roaring stream, steady with no breaks", st['burst']))
            elif s_n: slots.append((f"shot_{k}_l{n}", f"{tw['name']} firing: {s_n}", 1.2))
        seen = set()
        for n in (1, 2, 3):
            for slug, name in specials_of(tw, n):
                if slug in seen: continue
                seen.add(slug)
                said = lv(tw, n, 'special') or ''
                slots.append((f"special_{k}_{slug}", f"{tw['name']} unleashing {name or 'a special attack'}{': ' + said if said else ''}", 1.6))
        burns = burns or any((L.get('attack') or {}).get('burn') or any(s.get('burn') for s in L.get('specials') or [])
                             for L in play)
    if burns: slots.append(('burn', f'crackling burning ground, flames licking at the feet of enemies, {t}', 1.5))
    for en in spec['enemies'] + [spec['boss']]:
        slots.append((f"spawn_{en['kind']}", f"{en['name']} cry or call: {en['look']}", 1.5))
        tr = en.get('transform')
        if tr and (en.get('forms') or {}).get(tr['to']):
            slots.append((f"transform_{en['kind']}", f"{en['name']} {tr.get('text') or 'transforms'}, changing into "
                                                      f"{en['forms'][tr['to']]['look']}, a snarl rising into a roar", 2.0))
    return slots


def anim_prompt(e, a):
    """The motion for one animation: the designer's own words when given, else a default for that motion."""
    m = e.get('anims') or {}
    n = e['name']
    if a == 'walk' and m.get('walk'): return f"{the(n)} moves forward in place: {m['walk']}"
    if a == 'walk_back' and m.get('walk'): return f"{the(n)} moves away from the viewer in place: {m['walk']}"
    if a == 'attack' and m.get('attack'): return f"{the(n)} attacks: {m['attack']}, then recovers"
    if a == 'death' and m.get('death'): return f"{the(n)} dies: {m['death']}"
    return {'walk': f"{the(n)} walks forward in place, a steady stride",
            'walk_back': f"{the(n)} walks away from the viewer in place, a steady stride",
            'attack': f"{the(n)} attacks, a strong swing forward, then recovers",
            'death': f"{the(n)} is struck down and collapses to the ground",
            'charge': f"{the(n)} lowers its shoulder and charges forward"}[a]


def build_plan(spec):
    era = spec['id']
    steps = []

    def step(sid, gate, kind, title, items, needs=None):
        takes = sum(i.get('variants', 1) for i in items)
        cost = COST[kind if kind in COST else 'image']
        steps.append({'id': sid, 'gate': gate, 'kind': kind, 'title': title, 'needs': needs, 'items': items,
                      'gpu_minutes': round(takes * cost / 60, 1)})

    style = spec['style']
    # gate 1: the era's own road (drawn by tools/era/layout.py, no GPU), then the painted map over it
    step('road', 1, 'layout', 'Road', [{'id': f'{era}_road', 'variants': 3}])
    step('world', 1, 'map', 'Map', [{
        'id': f'{era}_map', 'variants': TAKES['map'],
        'prompt': f"{spec['theme']} Top-down isometric game map. A single winding dirt trail, worn and natural, follows "
                  f"the drawn road exactly. The trail begins inside the dark opening in the rock: {spec['start']['look']}. "
                  f"It ends at {spec['base']['look']}. Small square flat stone "
                  f"building pads stand beside the trail, a few raised stone platforms. No other roads. {style}",
        'guide': f"layout:{era}", 'width': 1280, 'height': 720,
    }], needs='road')
    # gate 2: towers, level 1 first, then levels 2 and 3 built on the picked level 1
    step('towers_l1', 2, 'image', 'Towers, level 1', [{
        'id': f"{era}_tower_{t['kind']}", 'variants': TAKES['image'],
        'prompt': f"{t['look']}{', ' + t['stages']['l1'] if t.get('stages', {}).get('l1') else ''}, a single defence building standing on "
                  f"its own, nothing beside it, isometric 3/4 view, full building isolated on a plain background. {style}",
        'guide': 'neutral:tower',
    } for t in spec['towers']])
    step('towers_l23', 2, 'image', 'Towers, levels 2 and 3', [{
        'id': f"{era}_tower_{t['kind']}_l{l}", 'variants': TAKES['image'] - 1,
        'prompt': f"{t['look']}, upgraded to level {l}: "
                  f"{t.get('stages', {}).get(f'l{l}') or ('bigger and reinforced' if l == 2 else 'grand, heavily armed, glowing details')}, "
                  f"same design, a single building on its own, isometric 3/4 view, isolated on a plain background. {style}",
        'guide': 'neutral:tower', 'style_from': f"{era}_tower_{t['kind']}",
    } for t in spec['towers'] for l in (2, 3)], needs='towers_l1')
    # gate 2: what each tower fires and what a hit looks like (small effect pictures, no shape guide): level 1's,
    # then each level that fires something new, and each level's special
    fx = []
    def shot_item(iid, what):
        return {'id': iid, 'variants': 3, 'guide': None, 'width': 512, 'height': 512,
                'prompt': f"{what}. A single projectile in flight seen from the side, pointing to the right, "
                          f"one small game effect sprite, centred and isolated on a plain background. {style}"}
    def hit_item(iid, what):
        return {'id': iid, 'variants': 3, 'guide': None, 'width': 512, 'height': 512,
                'prompt': f"{what}. One burst effect seen head-on, centred, a small game effect sprite isolated on a plain background. {style}"}
    for t in spec['towers']:
        k = t['kind']
        shot = lv(t, 1, 'shot') or t.get('extras') or f"the shot of the {t['name']}"
        if t['behaves'] not in INSTANT: fx.append(shot_item(f"{era}_shot_{k}", shot))
        fx.append(hit_item(f"{era}_hit_{k}", lv(t, 1, 'impact') or shot + ', the moment it hits its target'))
        for n in (2, 3):
            s_n = lv(t, n, 'shot')
            if s_n and t['behaves'] not in INSTANT: fx.append(shot_item(f"{era}_shot_{k}_l{n}", s_n))
            if s_n or lv(t, n, 'impact'): fx.append(hit_item(f"{era}_hit_{k}_l{n}", lv(t, n, 'impact') or s_n + ', the moment it hits its target'))
        made = set()
        for n in (1, 2, 3):
            for slug, name in specials_of(t, n):
                if slug in made: continue
                made.add(slug)
                said = lv(t, n, 'specialShot') or lv(t, n, 'special') or ''
                what = f"{name}: {said}" if name and said else (name or said or f"a powerful special attack of the {t['name']}")
                fx.append(shot_item(f"{era}_shot_{k}_{slug}", what))
                fx.append(hit_item(f"{era}_hit_{k}_{slug}", lv(t, n, 'specialImpact') or f"{name or what}, the moment it hits"))
    step('shots', 2, 'image', 'Shots and hits', fx)
    # gate 2: the unit standing on towers whose mechanic has one (the archer's place), in the tower's style
    # each level has its own unit (a new model as the tower grows), levels 2 and 3 in the style of the picked level 1
    units = [t for t in spec['towers'] if t['behaves'] in UNIT_BEHAVIOURS]
    UNIT = 'a small game character, full body, standing, 3/4 view facing right, isolated on a plain background.'
    if units:
        step('units', 2, 'image', 'Tower units', [{
            'id': f"{era}_unit_{t['kind']}", 'variants': TAKES['image'],
            'prompt': f"{unit_text(t, 1)}, {UNIT} {style}",
            'guide': 'neutral:enemy', 'style_from': f"{era}_tower_{t['kind']}",
        } for t in units], needs='towers_l1')
        step('units_l23', 2, 'image', 'Tower units, levels 2 and 3', [{
            'id': f"{era}_unit_{t['kind']}_l{n}", 'variants': TAKES['image'] - 1,
            'prompt': f"{unit_text(t, n)}, the same character as before, {UNIT} {style}",
            'guide': 'neutral:enemy', 'style_from': f"{era}_unit_{t['kind']}",
        } for t in units for n in (2, 3)], needs='units')
    # gate 3: enemies front view, then the back view (walking away up the road) from the pick
    foes = spec['enemies'] + [spec['boss']]
    step('enemies', 3, 'image', 'Enemies', [{
        'id': f"{era}_enemy_{e['kind']}", 'variants': TAKES['image'],
        'prompt': f"{e['look']}, full body, walking towards the viewer at a 3/4 angle, plain background. {style}",
        'guide': 'neutral:enemy',
    } for e in foes])
    step('enemies_back', 3, 'image', 'Enemies from behind', [{
        'id': f"{era}_enemy_{e['kind']}_back", 'variants': TAKES['back'],
        'prompt': f"{e['look']}, full body seen from behind, walking away from the viewer, plain background. {style}",
        'guide': 'neutral:enemy', 'style_from': f"{era}_enemy_{e['kind']}",
    } for e in foes], needs='enemies')
    # gate 3: enemies with a second form (a wolf that rises into a werewolf): that form's pictures, front then back
    shifters = [e for e in foes if e.get('forms')]
    if shifters:
        step('forms', 3, 'image', 'Enemy forms', [{
            'id': f"{era}_enemy_{e['kind']}__{f}", 'variants': TAKES['image'],
            'prompt': f"{fm['look']}, full body, walking towards the viewer at a 3/4 angle, plain background. {style}",
            'guide': 'neutral:enemy', 'style_from': f"{era}_enemy_{e['kind']}",
        } for e in shifters for f, fm in e['forms'].items()], needs='enemies')
        step('forms_back', 3, 'image', 'Enemy forms from behind', [{
            'id': f"{era}_enemy_{e['kind']}__{f}_back", 'variants': TAKES['back'],
            'prompt': f"{fm['look']}, full body seen from behind, walking away from the viewer, plain background. {style}",
            'guide': 'neutral:enemy', 'style_from': f"{era}_enemy_{e['kind']}__{f}",
        } for e in shifters for f, fm in e['forms'].items()], needs='forms')
    # gate 4: animations from the picked pictures
    anims = []
    for e in foes:
        for a in CAT['enemies'][e['behaves']]['anims']:
            anims.append({'id': f"{e['kind']}_{a}", 'variants': TAKES['anim'], 'enemy': e['kind'], 'anim': a,
                          'from': f"{era}_enemy_{e['kind']}{'_back' if a == 'walk_back' else ''}",
                          'loop': a in ('walk', 'walk_back'),
                          'prompt': anim_prompt(e, a)})
        for f, fm in (e.get('forms') or {}).items():
            # the other form moves, attacks and dies in its own body; the change itself starts from the first form
            fe = {**e, 'name': fm['look']}
            for a in CAT['enemies'][e['behaves']]['anims']:
                if a == 'charge': continue
                anims.append({'id': f"{e['kind']}_{a}__{f}", 'variants': TAKES['anim'], 'enemy': e['kind'], 'anim': f'{a}__{f}',
                              'from': f"{era}_enemy_{e['kind']}__{f}{'_back' if a == 'walk_back' else ''}",
                              'loop': a in ('walk', 'walk_back'), 'prompt': anim_prompt({**fe, 'anims': {}}, a)})
            tr = e.get('transform') or {}
            if tr.get('to') == f:
                anims.append({'id': f"{e['kind']}_transform", 'variants': TAKES['anim'], 'enemy': e['kind'], 'anim': 'transform',
                              'from': f"{era}_enemy_{e['kind']}", 'loop': False,
                              'prompt': f"{the(e['name'])} {tr.get('text') or 'transforms'}: it rises and changes into {fm['look']}, "
                                        f"a dramatic change in place, ending standing in its new form"})
    step('anims', 4, 'anim', 'Animations', anims, needs='forms_back' if shifters else 'enemies_back')
    if units:   # per level, its unit's breathing idle loop, its attack and (with a special) its cast
        ua = []
        for t in units:
            for n in (1, 2, 3):
                sfx = '' if n == 1 else f'_l{n}'
                src = f"{era}_unit_{t['kind']}{sfx}"
                who = the(lv(t, 1, 'unit') or 'figure')
                attack = lv(t, n, 'unitAttack') or lv(t, 1, 'unitAttack') or 'fires at an enemy below'
                ua.append({'id': f"{t['kind']}_unit{sfx}_idle", 'variants': TAKES['anim'], 'from': src, 'loop': True,
                           'prompt': f"{who} stands ready on top of a tower, breathing, a small idle motion, feet planted"
                                     + ('' if n == 1 else ', power glowing around them')})
                ua.append({'id': f"{t['kind']}_unit{sfx}_shoot", 'variants': TAKES['anim'], 'from': src, 'loop': False,
                           'prompt': f"{who} attacks: {attack}, then returns to ready, feet planted"})
                if special_of(t, n):
                    cast = lv(t, n, 'specialCast') or f"gathers power and unleashes {lv(t, n, 'special') or 'a mighty special attack'}"
                    ua.append({'id': f"{t['kind']}_unit{sfx}_cast", 'variants': TAKES['anim'], 'from': src, 'loop': False,
                               'prompt': f"{who} {cast}, a big dramatic motion, then returns to ready, feet planted"})
        step('unit_anims', 4, 'anim', 'Tower unit animations', ua, needs='units_l23')
    # gate 5: sounds, music, hero lines
    step('sounds', 5, 'sfx', 'Sound effects', [{'id': sid, 'prompt': p, 'seconds': s, 'variants': TAKES['sfx'],
                                                 **({'parts': layered(sid, spec)} if layered(sid, spec) else {})}
                                                for sid, p, s in sound_slots(spec)])
    step('music', 5, 'music', 'Music', [
        {'id': 'music_build', 'prompt': spec['music']['build'], 'seconds': 90, 'variants': TAKES['music']},
        {'id': 'music_wave', 'prompt': spec['music']['wave'], 'seconds': 90, 'variants': TAKES['music']},
    ])
    if spec.get('hero_lines', 'voiced') == 'voiced':
        step('hero_lines', 5, 'voice', 'Hero lines', [
            {'id': f"e{era[3:]}_{ev}_{i + 1}", 'event': ev, 'prompt': None, 'variants': TAKES['voice']}
            for ev, n in HERO_EVENTS.items() for i in range(n)])
    total = round(sum(s['gpu_minutes'] for s in steps), 1)
    return {'era': era, 'name': spec['name'], 'steps': steps, 'gpu_minutes_first_pass': total}


def main():
    spec = json.loads(Path(sys.argv[1]).read_text())
    errs = validate(spec)
    if errs:
        print('spec problems:', *errs, sep='\n  '); sys.exit(1)
    plan = build_plan(spec)
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    if out: out.write_text(json.dumps(plan, indent=1))
    for s in plan['steps']:
        print(f"gate {s['gate']}  {s['title']:<26} {len(s['items']):3d} items  {s['gpu_minutes']:6.1f} GPU min"
              + (f"  (after {s['needs']})" if s['needs'] else ''))
    print(f"first pass, no redos: {plan['gpu_minutes_first_pass']} GPU min")


if __name__ == '__main__':
    main()
