"""Pipeline state for one Era Studio era, kept as a JSON "work" file (stored in the studio page's database at
work/<draft>, owner-only). The orchestrator routine downloads it, runs one of these commands, and uploads it again.

  python tools/era/studio/studio.py new  <work.json> <spec.json> <era id> <budget minutes>
  python tools/era/studio/studio.py next <work.json>                 -> next step to run, as JSON (or {"done": true})
  python tools/era/studio/studio.py job  <work.json> <step> [redo.json]  -> generator job JSON; records the round
  python tools/era/studio/studio.py pick <work.json> <asset id> <file on the PC>
  python tools/era/studio/studio.py spend <work.json> <minutes>
  python tools/era/studio/studio.py install-state <work.json> <out state.json> <out spec.json>   (for install.py)
  python tools/era/studio/studio.py stage-list <work.json> [PC folder]   -> picked files to stage, in groups of 50

A step is finished when every item in it has a pick. Steps run in plan order; one whose `needs` isn't finished waits.
"""
import json, sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent))
from plan import validate, build_plan  # noqa: E402
from manifest import job as make_job  # noqa: E402


def load(p): return json.loads(Path(p).read_text())
def save(p, w): Path(p).write_text(json.dumps(w, indent=1))


def item_ids(step): return [i['id'] for i in step['items']]


def finished(w, step):
    return all(w['state']['assets'].get(i, {}).get('picked') for i in item_ids(step))


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
        errs = validate(spec)
        if errs: print(json.dumps({'problems': errs})); sys.exit(1)
        w = {'eraId': spec['id'], 'spec': spec, 'plan': build_plan(spec), 'budgetMinutes': float(sys.argv[5]), 'gpuMinutesUsed': 0,
             'state': {'assets': {}, 'rounds': {}, 'hero_lines': {}}, 'processedSends': []}
        save(path, w); print(json.dumps({'era': spec['id'], 'first_pass_gpu_minutes': w['plan']['gpu_minutes_first_pass']})); return
    w = load(path)
    if cmd == 'next':
        print(json.dumps(next_step(w)))
    elif cmd == 'job':
        step_id = sys.argv[3]
        redo = load(sys.argv[4]) if len(sys.argv) > 4 else None
        j = make_job(w['plan'], w['state'], step_id, redo)
        w['state']['rounds'][step_id] = j['round']
        step = next(s for s in w['plan']['steps'] if s['id'] == step_id)
        for i in step['items']:
            if redo and i['id'] not in redo: continue
            a = w['state']['assets'].setdefault(i['id'], {'kind': step['kind'], 'rounds': []})
            a['rounds'].append({'round': j['round'], 'output': j['output'], 'redo': (redo or {}).get(i['id'])})
            a.pop('picked', None)
        # rough GPU estimate of this job, for the budget check before it runs
        per = step['gpu_minutes'] / max(1, sum(i['variants'] for i in step['items']))
        j['gpu_minutes'] = round(per * sum(i['variants'] for i in step['items'] if not redo or i['id'] in redo), 1)
        save(path, w); print(json.dumps(j, indent=1))
    elif cmd == 'pick':
        w['state']['assets'][sys.argv[3]]['picked'] = {'file': sys.argv[4]}
        save(path, w); print(json.dumps(next_step(w)))
    elif cmd == 'install-state':
        # the installer's state format (tools/era/install.py) from the picks; picked files are paths relative to the
        # generator's folder on the PC; an animation pick is its take's sheet.png (assets/<take folder>/sheet.png)
        st = {'assets': {}, 'anims': {}, 'hero_lines': w['state'].get('hero_lines', {})}
        for aid, a in w['state']['assets'].items():
            if not a.get('picked'): continue
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
            if a.get('picked'):
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
