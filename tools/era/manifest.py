"""Writes the generator job for one plan step: a batch manifest (images, sounds, music, voice) or a list of
animation calls. First round: every item. Later rounds: only the items that got a redo note, with the note added
to the prompt. Items that build on an earlier pick (level 2 and 3 towers, back views, animations) use that pick.

The era's state file keeps what happened so far: per asset, the rounds run, their output folder and the take
that was picked. Paths are as the generator connector sees them (relative to its folder on the owner's PC).

usage:
  python tools/era/manifest.py <plan.json> <state.json> <step id> [redo.json]   -> prints the job as JSON
  redo.json: {"<asset id>": "what to change", ...}   (a later round of that step)
"""
import json, sys
from pathlib import Path

# shape guides on the owner's PC (copied there by guide_files below); the map layouts are the hand-made ones
LAYOUT_GUIDES = {'era3': 'guides/e3_map_guide.png'}


def guide_path(g):
    kind, *rest = g.split(':')
    if kind == 'layout':   # a hand-made layout, or an Era Studio era's own road (copied to the PC when picked)
        return LAYOUT_GUIDES.get(rest[0]) or f'guides/studio/{rest[0]}_road.png'
    if kind == 'tower':
        return f'guides/era-studio/tower_{rest[0]}_l{rest[1]}.png'
    if kind == 'enemy':
        return f"guides/era-studio/enemy_{rest[0]}{'_back' if rest[1] == 'back' else ''}.png"
    raise ValueError(g)


def guide_files(catalogue):
    """Which repo sprite files to copy to the PC as shape guides: {guide path on PC: file in public/}."""
    out = {}
    for b, t in catalogue['towers'].items():
        for l, lv in enumerate(t['art']['levels'], start=1):
            out[guide_path(f'tower:{b}:{l}')] = lv['name']
    for b, e in catalogue['enemies'].items():
        out[guide_path(f'enemy:{b}:front')] = f'enemy_{b}'
        if e['art']['back']: out[guide_path(f'enemy:{b}:back')] = f'enemy_{b}_back'
    return out


def picked_file(state, asset_id):
    a = state['assets'].get(asset_id)
    if not a or not a.get('picked'):
        raise SystemExit(f'{asset_id} has no pick yet')
    return a['picked']['file']


def job(plan, state, step_id, redo=None):
    step = next(s for s in plan['steps'] if s['id'] == step_id)
    if step['kind'] == 'layout':
        raise SystemExit('the road step has no generator job: use studio.py roads')
    era = plan['era']
    rounds = state.setdefault('rounds', {})
    n = rounds.get(step_id, 0) + 1
    items = [i for i in step['items'] if not redo or i['id'] in redo]
    out = f'studio/{era}/{step_id}' + (f'_r{n}' if n > 1 else '')
    seed = 90000 + 1000 * (sum(map(ord, era)) % 50) + 100 * n  # stable across runs

    def prompt(i):
        p = i['prompt']
        if redo and redo.get(i['id']):
            p = f"{p.rstrip('.')}. Change from the last version: {redo[i['id']]}"
        return p

    if step['kind'] == 'anim':
        calls = [{'image': picked_file(state, i['from']), 'prompt': prompt(i), 'name': i['id'], 'folder': out,
                  'variants': i['variants'], 'loop': i['loop'], 'frames': 49 if i['loop'] else 33, 'seed': seed + k}
                 for k, i in enumerate(items)]
        return {'type': 'animation', 'step': step_id, 'round': n, 'output': out, 'calls': calls}

    if step['kind'] in ('sfx', 'music', 'voice'):
        assets = []
        for i in items:
            a = {'id': i['id'], 'kind': step['kind'], 'prompt': prompt(i), 'variants': i['variants']}
            if step['kind'] in ('sfx', 'music'): a['seconds'] = i['seconds']
            if step['kind'] == 'music': a.update({'lyrics': '[instrumental]', 'bpm': 100})
            if step['kind'] == 'voice':
                a.update({'mode': 'clone', 'ref_audio': 'assets/voice_ref/hero_ref.wav',
                          'ref_text': 'Knock knock, deadheads. Time to take out the trash.'})
                a['prompt'] = state['hero_lines'][i['id']]
            assets.append(a)
        return {'type': 'batch', 'step': step_id, 'round': n, 'output': out,
                'manifest': {'name': f'{era}-{step_id}-r{n}', 'type': 'audio', 'output': f'batches/{out}',
                             'defaults': {'seed': seed}, 'assets': assets}}

    assets = []
    for i in items:
        a = {'id': i['id'], 'prompt': prompt(i), 'variants': i['variants'], 'guide_image': guide_path(i['guide'])}
        if step['kind'] == 'map':
            a.update({'mode': 'scene', 'width': i['width'], 'height': i['height'], 'guide_strength': 0.7})
        else:
            a['guide_strength'] = 0.55
        if i.get('style_from'):
            a['style_image'] = picked_file(state, i['style_from'])
        assets.append(a)
    return {'type': 'batch', 'step': step_id, 'round': n, 'output': out,
            'manifest': {'name': f'{era}-{step_id}-r{n}', 'output': out, 'defaults': {'seed': seed}, 'assets': assets}}


def main():
    plan = json.loads(Path(sys.argv[1]).read_text())
    state_path = Path(sys.argv[2])
    state = json.loads(state_path.read_text()) if state_path.exists() else {'assets': {}, 'rounds': {}}
    redo = json.loads(Path(sys.argv[4]).read_text()) if len(sys.argv) > 4 else None
    print(json.dumps(job(plan, state, sys.argv[3], redo), indent=1))


if __name__ == '__main__':
    main()
