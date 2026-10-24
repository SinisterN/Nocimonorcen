"""Pipeline state for one Era Studio era, kept as a JSON "work" file (stored in the studio page's database at
work/<draft>, owner-only). The orchestrator routine downloads it, runs one of these commands, and uploads it again.

  python tools/era/studio/studio.py new  <work.json> <spec.json> <era id> <budget minutes>
  python tools/era/studio/studio.py mechanics <work.json> <mapping.json>   (the confirmed "how it plays"; builds the plan)
  python tools/era/studio/studio.py next <work.json>                 -> next step to run, as JSON (or {"done": true})
  python tools/era/studio/studio.py ready <work.json>                -> everything that can be made now, as jobs in run order
  python tools/era/studio/studio.py job  <work.json> <step> [redo.json]  -> generator job JSON; records the round
  python tools/era/studio/studio.py pick <work.json> <asset id> <file on the PC>
  python tools/era/studio/studio.py spend <work.json> <minutes>
  python tools/era/studio/studio.py roads <work.json> <out dir>        (Road round: 3 road options + their pictures)
  python tools/era/studio/studio.py pick <work.json> <era>_road <n>    (picks road option n)
  python tools/era/studio/studio.py road-guide <work.json> <out.png>   (the picked road's guide, for the PC)
  python tools/era/studio/studio.py replan <work.json>                 (rebuild the plan after a tools update)
  python tools/era/studio/studio.py remap <work.json> <kind> ...       (ask "How it plays" again for these towers)
  python tools/era/studio/studio.py progress <work.json>               -> every round and how far it is (out.progress)
  python tools/era/studio/studio.py set-feet <work.json> <tower kind> x1 y1 x2 y2 x3 y3   (unit's spot per level)
  python tools/era/studio/studio.py set-muzzle <work.json> <tower kind> x y                 (firing point, level 1)
  python tools/era/studio/studio.py install-state <work.json> <out state.json> <out spec.json>   (for install.py)
  python tools/era/studio/studio.py stage-list <work.json> [PC folder]   -> picked files to stage, in groups of 50

A step is finished when every item in it has a pick. Items don't wait for whole steps: an item can be made as soon as
the pictures it is built from (`from`, `style_from`; the map's road) are picked, so the PC keeps making what comes
next while the designer picks (`ready`).
"""
import json, re, sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent))
from plan import validate, build_plan  # noqa: E402
from abilities import check_forms, check_levels, check_resist, describe, say_forms, say_resist  # noqa: E402
from manifest import job as make_job  # noqa: E402
import layout as roads_mod  # noqa: E402


def load(p): return json.loads(Path(p).read_text())
def save(p, w): Path(p).write_text(json.dumps(w, indent=1))


def item_ids(step): return [i['id'] for i in step['items']]


def finished(w, step):
    return all(w['state']['assets'].get(i, {}).get('picked') for i in item_ids(step))


def deps(w, step, item):
    """The assets an item is made from: its source picture (animations), its style picture, the map's road."""
    ids = {i['id'] for s in w['plan']['steps'] for i in s['items']}
    out = [item[k] for k in ('from', 'style_from') if isinstance(item.get(k), str) and item[k] in ids]
    if step['id'] == 'world':
        out += [i['id'] for s in w['plan']['steps'] if s['id'] == 'road' for i in s['items']]
    return out


# quick pictures first (they unblock what follows and give the designer something to pick), then sound, music and
# voice, the long animations last
PRIORITY = {'layout': 0, 'map': 1, 'image': 1, 'voice': 2, 'sfx': 2, 'music': 2, 'anim': 3}


def ready(w):
    """Items that can be made now (sources picked, nothing made yet), grouped per step in the order to run them."""
    A = w['state']['assets']
    jobs = []
    for s in w['plan']['steps']:
        items = [i for i in s['items'] if not A.get(i['id'], {}).get('rounds') and not A.get(i['id'], {}).get('picked')
                 and all(A.get(d, {}).get('picked') for d in deps(w, s, i))]
        if not items: continue
        per = s['gpu_minutes'] / max(1, sum(i['variants'] for i in s['items']))
        jobs.append({'step': s['id'], 'kind': s['kind'], 'title': s['title'], 'items': [i['id'] for i in items],
                     'gpu_minutes': round(per * sum(i['variants'] for i in items), 1)})
    return sorted(jobs, key=lambda j: PRIORITY.get(j['kind'], 2))


# what the designer sees for each round: (stage, title, what happens)
STEP_INFO = {
    'mechanics': ('mechanics', 'How it plays', 'Each tower and enemy matched to what the game can do, level by level'),
    'road': ('world', 'Road', 'Three road layouts to choose from'),
    'world': ('world', 'Map', 'The map painted around your road'),
    'towers_l1': ('towers', 'Towers, level 1', 'Each tower as you described it'),
    'towers_l23': ('towers', 'Towers, levels 2 and 3', 'The stronger versions of each tower'),
    'shots': ('towers', 'Shots and hits', 'What each tower fires, its hits and its specials'),
    'units': ('towers', 'Tower units', 'Who stands on the tower'),
    'units_l23': ('towers', 'Units, levels 2 and 3', 'The unit growing stronger with the tower'),
    'enemies': ('enemies', 'Enemies', 'Every enemy and the boss, walking towards you'),
    'enemies_back': ('enemies', 'Enemies from behind', 'The same enemies walking away up the road'),
    'forms': ('enemies', 'Enemy forms', 'Second forms, like a wolf rising into a werewolf'),
    'forms_back': ('enemies', 'Enemy forms from behind', 'Those forms walking away'),
    'anims': ('anims', 'Enemy animations', 'Walking, attacking, dying and changing form'),
    'unit_anims': ('anims', 'Tower unit animations', 'Standing ready, attacking and casting, per level'),
    'sounds': ('audio', 'Sound effects', 'Shots, hits, specials, calls and the moments of a fight'),
    'music': ('audio', 'Music', 'One loop while you build, one while you fight'),
    'hero_lines': ('audio', 'Hero lines', 'Your hero\'s quips for this map'),
    'sandbox': ('sandbox', 'Sandbox', 'Play your era before it goes live'),
}


def progress(w):
    """Every round of the era in order, with how far it is: for the studio page's overview (out.progress)."""
    out, now_seen = [], False
    mech_done = bool(w.get('plan')) and not w.get('remap')
    out.append({'id': 'mechanics', 'state': 'done' if mech_done else 'now'})
    now_seen = not mech_done
    for s in (w.get('plan') or {}).get('steps', []):
        ids = item_ids(s)
        picked = sum(1 for i in ids if w['state']['assets'].get(i, {}).get('picked'))
        started = any(w['state']['assets'].get(i, {}).get('rounds') for i in ids)
        state = 'done' if picked == len(ids) else 'now' if started and mech_done else 'next'
        if state == 'now': now_seen = True
        out.append({'id': s['id'], 'state': state, 'picked': picked, 'total': len(ids)})
    out.append({'id': 'sandbox', 'state': 'next' if now_seen else 'now'})
    for x in out:
        g, t, what = STEP_INFO.get(x['id'], ('brief', x['id'], ''))
        x.update({'gate': g, 'title': t, 'what': what})
    return out


def next_step(w):
    steps = {s['id']: s for s in w['plan']['steps']}
    for s in w['plan']['steps']:
        if finished(w, s): continue
        if s['needs'] and not finished(w, steps[s['needs']]): return {'waiting_for': s['needs']}
        return {'step': s['id'], 'title': s['title'], 'gpu_minutes': s['gpu_minutes'],
                'unpicked': [i for i in item_ids(s) if not w['state']['assets'].get(i, {}).get('picked')]}
    return {'done': True}


def main():
    cmd, path = sys.argv[1], sys.argv[2]
    if cmd == 'new':
        spec = load(sys.argv[3]); spec['id'] = sys.argv[4]
        w = {'eraId': spec['id'], 'spec': spec, 'plan': None, 'budgetMinutes': float(sys.argv[5]), 'gpuMinutesUsed': 0,
             'state': {'assets': {}, 'rounds': {}, 'hero_lines': {}}, 'processedSends': [], 'mechanics': {}}
        if all(x.get('behaves') for x in spec['towers'] + spec['enemies'] + [spec['boss']]):
            errs = validate(spec)
            if errs: print(json.dumps({'problems': errs})); sys.exit(1)
            w['plan'] = build_plan(spec)
        save(path, w)
        print(json.dumps({'era': spec['id'], 'next': 'mechanics' if not w['plan'] else 'world',
                          **({'first_pass_gpu_minutes': w['plan']['gpu_minutes_first_pass']} if w['plan'] else {})})); return
    w = load(path)
    if cmd == 'mechanics':
        # the confirmed "how it plays" mapping: {"<kind>": {"behaves": "<behaviour>", "text": "what was shown",
        # "unsupported": [...], "levels": [...]}}; towers' levels: see tools/era/abilities.py
        m = load(sys.argv[3])
        w['mechanics'].update(m)
        spec = w['spec']
        report = {}
        for x in spec['towers'] + spec['enemies'] + [spec['boss']]:
            if x['kind'] not in w['mechanics']: continue
            mk = w['mechanics'][x['kind']]
            x['behaves'] = mk['behaves']
            if x in spec['towers'] and mk.get('type'):
                x['damageType'] = mk['type'] if re.fullmatch(r'[a-z]{1,16}', str(mk['type'])) else None
            if x not in spec['towers'] and 'resist' in mk:
                probs = []
                x['resist'] = check_resist(mk['resist'], x['kind'], probs)
                report[x['kind']] = {'resist': say_resist(x['resist']), 'problems': probs}
            if x not in spec['towers'] and (mk.get('forms') or mk.get('transform')):
                probs = report.setdefault(x['kind'], {'problems': []})['problems']
                x['forms'], x['transform'] = check_forms(mk.get('forms'), mk.get('transform'), x['kind'], probs)
                report[x['kind']]['forms'] = say_forms(x['forms'], x['transform'])
            if mk.get('levels') and x in spec['towers']:
                bt = json.loads((HERE.parent / 'builtins.json').read_text())['towers'][mk['behaves']]
                clean, problems, power = check_levels(mk['levels'], (x.get('stats') or {}).get('fireDelay') or bt['fireDelay'], bt.get('splash', 0))
                x['play'] = clean
                report[x['kind']] = {'levels': describe(clean), 'power': power, 'problems': problems}
        w['remap'] = [k for k in w.get('remap', []) if k not in m]
        if not w['remap']: w.pop('remap')
        missing = [x['kind'] for x in spec['towers'] + spec['enemies'] + [spec['boss']] if not x.get('behaves')]
        if missing: save(path, w); print(json.dumps({'missing': missing})); return
        errs = validate(spec)
        if errs: print(json.dumps({'problems': errs})); sys.exit(1)
        w['plan'] = build_plan(spec)
        save(path, w); print(json.dumps({'first_pass_gpu_minutes': w['plan']['gpu_minutes_first_pass'], 'towers': report}, indent=1))
    elif cmd == 'ready':
        if w.get('remap') or not w['plan']: print(json.dumps([])); return
        print(json.dumps(ready(w), indent=1))
    elif cmd == 'next':
        # `remap`: towers whose "How it plays" must be confirmed again (a tools update added per-level attacks)
        if w.get('remap'): print(json.dumps({'step': 'mechanics', 'remap': w['remap']})); return
        print(json.dumps(next_step(w) if w['plan'] else {'step': 'mechanics'}))
    elif cmd == 'job':
        step_id = sys.argv[3]
        redo = load(sys.argv[4]) if len(sys.argv) > 4 else None
        step0 = next(s for s in w['plan']['steps'] if s['id'] == step_id)
        if not redo and any(w['state']['assets'].get(i, {}).get('picked') for i in item_ids(step0)):
            # the step grew (a replan added items): make only what has no pick yet, with no change note
            redo = {i: '' for i in item_ids(step0) if not w['state']['assets'].get(i, {}).get('picked')}
        j = make_job(w['plan'], w['state'], step_id, redo)
        w['state']['rounds'][step_id] = j['round']
        step = next(s for s in w['plan']['steps'] if s['id'] == step_id)
        for i in step['items']:
            if redo and i['id'] not in redo: continue
            a = w['state']['assets'].setdefault(i['id'], {'kind': step['kind'], 'rounds': []})
            r = (redo or {}).get(i['id'])
            a['rounds'].append({'round': j['round'], 'output': j['output'], 'redo': r.get('note') if isinstance(r, dict) else r})
            a.pop('picked', None)
        # rough GPU estimate of this job, for the budget check before it runs
        per = step['gpu_minutes'] / max(1, sum(i['variants'] for i in step['items']))
        j['gpu_minutes'] = round(per * sum(i['variants'] for i in step['items'] if not redo or i['id'] in redo), 1)
        save(path, w); print(json.dumps(j, indent=1))
    elif cmd == 'pick':
        a = w['state']['assets'][sys.argv[3]]
        if a.get('kind') == 'layout':   # picking a road: the take number chooses one of the road options
            opt = next(o for o in w['roadOptions'] if o['n'] == int(sys.argv[4]))
            w['layout'] = {**opt['layout'], 'meta': opt['meta']}
            a['picked'] = {'file': f"road:{opt['n']}"}
        else:
            a['picked'] = {'file': sys.argv[4]}
        save(path, w); print(json.dumps(next_step(w)))
    elif cmd == 'roads':
        # the Road round: fresh road options (round 2+ gives new ones); their pictures go on the page as takes
        out_dir = sys.argv[3]
        n = w['state']['rounds'].get('road', 0) + 1
        made = roads_mod.generate(w['eraId'], out_dir, 3, n)
        w['state']['rounds']['road'] = n
        w['roadOptions'] = [{'n': m['n'], 'png': Path(m['png']).name, 'meta': {k: m[k] for k in ('style', 'length', 'turns', 'pads', 'toughness') if k in m},
                             'layout': load(m['json'])} for m in made]
        a = w['state']['assets'].setdefault(f"{w['eraId']}_road", {'kind': 'layout', 'rounds': []})
        a['rounds'].append({'round': n, 'output': out_dir}); a.pop('picked', None)
        save(path, w); print(json.dumps([{**{k: o[k] for k in ('n', 'png')}, **o['meta']} for o in w['roadOptions']]))
    elif cmd == 'road-guide':
        # the picked road's guide picture, to copy to the PC as guides/studio/<era>_road.png before the map round
        roads_mod.render({**{k: v for k, v in w['layout'].items() if k != 'meta'}, 'style': 'clean'}, sys.argv[3]); print(sys.argv[3])
    elif cmd == 'set-feet':
        # where the tower's unit stands on each level's picked picture: fractions of the picture's width and height
        v = [float(x) for x in sys.argv[4:10]]
        if len(v) != 6 or not all(0 <= x <= 1 for x in v): sys.exit('give x y for levels 1, 2 and 3, each between 0 and 1')
        w.setdefault('unitFeet', {})[sys.argv[3]] = [v[0:2], v[2:4], v[4:6]]
        save(path, w); print(json.dumps(w['unitFeet'][sys.argv[3]]))
    elif cmd == 'set-muzzle':
        # where shots leave the tower, on its level 1 picture: fractions of the picture's width and height
        x, y = float(sys.argv[4]), float(sys.argv[5])
        if not (0 <= x <= 1 and 0 <= y <= 1): sys.exit('x and y are fractions between 0 and 1')
        w.setdefault('muzzle', {})[sys.argv[3]] = [x, y]
        save(path, w); print(json.dumps(w['muzzle'][sys.argv[3]]))
    elif cmd == 'progress':
        print(json.dumps(progress(w), indent=1))
    elif cmd == 'remap':
        w['remap'] = sys.argv[3:]; save(path, w); print(json.dumps({'remap': w['remap']}))
    elif cmd == 'replan':
        # rebuild the plan from the spec (after a tools update); picks and rounds are kept
        w['plan'] = build_plan(w['spec']); save(path, w); print(json.dumps(next_step(w)))
    elif cmd == 'install-state':
        # the installer's state format (tools/era/install.py) from the picks; picked files are paths relative to the
        # generator's folder on the PC; an animation pick is its take's sheet.png (assets/<take folder>/sheet.png)
        st = {'assets': {}, 'anims': {}, 'hero_lines': w['state'].get('hero_lines', {}), 'layout': w.get('layout'),
              'unitFeet': w.get('unitFeet', {}), 'muzzle': w.get('muzzle', {})}
        for aid, a in w['state']['assets'].items():
            if not a.get('picked') or a.get('kind') == 'layout': continue
            f = a['picked']['file'].replace('\\', '/')
            if a.get('kind') == 'anim':
                folder = f[len('assets/'):] if f.startswith('assets/') else f
                st['anims'][aid] = {'file': folder.rsplit('/sheet.png', 1)[0]}
            else:
                st['assets'][aid] = {'kind': a.get('kind'), 'picked': {'file': f}}
        Path(sys.argv[3]).write_text(json.dumps(st, indent=1))
        Path(sys.argv[4]).write_text(json.dumps(w['spec'], indent=1))
        print(json.dumps({'assets': len(st['assets']), 'anims': len(st['anims']), 'hero_lines': len(st['hero_lines'])}))
    elif cmd == 'stage-list':
        # the picked files to copy from the PC, as Windows paths in groups of 50 (device_stage_files' limit)
        root = sys.argv[3] if len(sys.argv) > 3 else 'D:\\dev\\game-asset-mcp'
        files = []
        for a in w['state']['assets'].values():
            if a.get('picked') and a.get('kind') != 'layout':
                f = a['picked']['file'].replace('\\', '/')
                if a.get('kind') == 'anim' and not f.endswith('sheet.png'): f += '/sheet.png'
                files.append(root + '\\' + f.replace('/', '\\'))
        print(json.dumps([files[i:i + 50] for i in range(0, len(files), 50)], indent=1))
    elif cmd == 'spend':
        w['gpuMinutesUsed'] = round(w['gpuMinutesUsed'] + float(sys.argv[3]), 1)
        save(path, w); print(w['gpuMinutesUsed'])
    else:
        sys.exit(__doc__)


if __name__ == '__main__':
    main()
