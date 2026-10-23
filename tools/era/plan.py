"""Turns an era spec (tools/era/example_spec.json) into a build plan: the generation steps per gate, what each step
makes, which earlier pick it builds on, and a GPU time estimate. The Era Studio page shows the plan and its
estimate; the orchestrator runs it one step at a time (tools/era/manifest.py writes each step's generator job).

usage: python tools/era/plan.py <spec.json> [out plan.json]
"""
import json, sys
from pathlib import Path

HERE = Path(__file__).parent
CAT = json.loads((HERE / 'behaviours.json').read_text())

# GPU seconds per take, measured on the owner's 24 GB card (Era 3 and the trailer work)
COST = {'layout': 0, 'map': 20, 'image': 10, 'anim': 180, 'sfx': 6, 'music': 20, 'voice': 10}  # sfx/voice per the generator's own estimate
TAKES = {'map': 6, 'image': 4, 'back': 2, 'anim': 2, 'sfx': 4, 'music': 2, 'voice': 3}

HERO_EVENTS = {'towerBuilt': 4, 'kill': 5, 'baseHit': 4, 'waveStart': 3, 'waveCleared': 3, 'towerSold': 2}


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
    for en in spec['enemies'] + [spec['boss']]:
        slots.append((f"spawn_{en['kind']}", f"{en['name']} cry or call: {en['look']}", 1.5))
    return slots


def anim_prompt(e, a):
    """The motion for one animation: the designer's own words when given, else a default for that motion."""
    m = e.get('anims') or {}
    n = e['name']
    if a == 'walk' and m.get('walk'): return f"the {n} moves forward in place: {m['walk']}"
    if a == 'walk_back' and m.get('walk'): return f"the {n} moves away from the viewer in place: {m['walk']}"
    if a == 'attack' and m.get('attack'): return f"the {n} attacks: {m['attack']}, then recovers"
    if a == 'death' and m.get('death'): return f"the {n} dies: {m['death']}"
    return {'walk': f"the {n} walks forward in place, a steady stride",
            'walk_back': f"the {n} walks away from the viewer in place, a steady stride",
            'attack': f"the {n} attacks, a strong swing forward, then recovers",
            'death': f"the {n} is struck down and collapses to the ground",
            'charge': f"the {n} lowers its shoulder and charges forward"}[a]


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
    # gate 4: animations from the picked pictures
    anims = []
    for e in foes:
        for a in CAT['enemies'][e['behaves']]['anims']:
            anims.append({'id': f"{e['kind']}_{a}", 'variants': TAKES['anim'], 'enemy': e['kind'], 'anim': a,
                          'from': f"{era}_enemy_{e['kind']}{'_back' if a == 'walk_back' else ''}",
                          'loop': a in ('walk', 'walk_back'),
                          'prompt': anim_prompt(e, a)})
    step('anims', 4, 'anim', 'Animations', anims, needs='enemies_back')
    # gate 5: sounds, music, hero lines
    step('sounds', 5, 'sfx', 'Sound effects', [{'id': sid, 'prompt': p, 'seconds': s, 'variants': TAKES['sfx']}
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
