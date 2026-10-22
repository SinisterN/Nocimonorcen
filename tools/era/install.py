"""Installs an Era Studio era into the game: the picked takes become art, animation sheets and sounds under
public/<sprites|sounds>/<era>/, and src/eras/<era>.json describes the era (see src/eras/index.ts).

usage: python tools/era/install.py <spec.json> <state.json> <staged connector folder> [--only sprites,anims,audio,era]
  state.json: what the studio recorded: per asset its picked take ({"assets": {id: {"picked": {"file": ...}}}}),
              animation picks ({"anims": {"<enemy>_<anim>": {"file": "<take folder>", "range": [a, b]?}}}),
              hero lines ({"hero_lines": {id: text}}) and which have a picked recording.
  staged connector folder: where the owner's game-asset-mcp folder is staged (its assets/ paths resolve there).

Gameplay starts from the layout template (the map was painted over that template's guide) and the copied
behaviours' stats; waves follow the template's waves with each enemy swapped for the new enemy in the same role
(roles matched by toughness). Balance it afterwards with the bot in the sandbox.
"""
import json, re, sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).parent
sys.path.insert(0, str(ROOT / 'tools'))
sys.path.insert(0, str(ROOT / 'tools' / 'anim'))
CAT = json.loads((HERE / 'behaviours.json').read_text())
BUILTINS = json.loads((HERE / 'builtins.json').read_text())

SFX_VOLUME = {'build': 0.5, 'base_hit': 0.65, 'wave_start': 0.6, 'wave_clear': 0.6, 'victory': 0.7, 'defeat': 0.7,
              'explosion': 0.55, 'death_small': 0.5, 'death_big': 0.6}


def cutout(path):
    im = Image.open(path).convert('RGBA')
    return im.crop(im.getbbox())


def save_sprite(src, era, name, height, anchor):
    """Cuts the art out, stores it at 2x its on-screen size and returns its SPRITES entry."""
    im = cutout(src)
    w, h = im.size
    dw = max(1, round(w * height / h))
    out = ROOT / 'public' / 'sprites' / era / f'{name}.png'
    out.parent.mkdir(parents=True, exist_ok=True)
    im.resize((dw * 2, height * 2), Image.LANCZOS).save(out, optimize=True)
    # towers stand on a 2:1 iso footprint whose centre is a quarter of the art's width above its lowest point
    oy = 1 - (w * 0.25) / h if anchor == 'tower' else 0.985
    return {'key': f'sp_{name}', 'file': f'sprites/{era}/{name}.png', 'origin': [0.5, round(oy, 3)], 'display': [dw, height]}


def picked(state, staged, asset_id):
    return staged / state['assets'][asset_id]['picked']['file']


def install_sprites(spec, state, staged):
    era = spec['id']
    sprites, tower_sprites, muzzles = {}, {}, {}
    # the painted map: road, pads and buildings in one picture
    m = Image.open(picked(state, staged, f'{era}_map')).convert('RGB').resize((1280, 720), Image.LANCZOS)
    (ROOT / 'public' / 'sprites' / era).mkdir(parents=True, exist_ok=True)
    m.save(ROOT / 'public' / 'sprites' / era / 'map_ground.jpg', quality=90)
    sprites[f'map_ground_{era}'] = {'key': f'sp_map_ground_{era}', 'file': f'sprites/{era}/map_ground.jpg', 'origin': [0, 0], 'display': [1280, 720]}
    for t in spec['towers']:
        cat = CAT['towers'][t['behaves']]
        names = []
        for l, lv in enumerate(cat['art']['levels'], start=1):
            name = f"{era}_tower_{t['kind']}" + (f'_l{l}' if l > 1 else '')
            sprites[name] = save_sprite(picked(state, staged, name), era, name, lv['display'][1], 'tower')
            names.append(name)
        tower_sprites[t['kind']] = names
        mz = cat['art'].get('muzzle')
        if mz:   # the gun's muzzle at the same place relative to the art's size as on the copied tower
            k = sprites[names[0]]['display'][1] / cat['art']['levels'][0]['display'][1]
            muzzles[t['kind']] = {**mz, 'x': round(mz['x'] * k), 'y': round(mz['y'] * k)}
    for e in spec['enemies'] + [spec['boss']]:
        cat = CAT['enemies'][e['behaves']]['art']
        sprites[f"enemy_{e['kind']}"] = {**save_sprite(picked(state, staged, f"{era}_enemy_{e['kind']}"), era, f"enemy_{e['kind']}",
                                                       cat['front']['display'][1], 'feet'), 'facesLeft': e.get('facesLeft', True)}
        back = f"{era}_enemy_{e['kind']}_back"
        if back in state['assets'] and state['assets'][back].get('picked'):
            sprites[f"enemy_{e['kind']}_back"] = {**save_sprite(picked(state, staged, back), era, f"enemy_{e['kind']}_back",
                                                                (cat['back'] or cat['front'])['display'][1], 'feet'), 'facesLeft': e.get('facesLeft', True)}
    return sprites, tower_sprites, muzzles


def install_anims(spec, state, staged):
    """Animation sheets via tools/anim/build_sheets.py (src/anims/<kind>.json and public/sprites/<era>/anim/...)."""
    import build_sheets
    era = spec['id']
    for e in spec['enemies'] + [spec['boss']]:
        cat = CAT['enemies'][e['behaves']]
        anims = {}
        for a in cat['anims']:
            p = state.get('anims', {}).get(f"{e['kind']}_{a}")
            if not p: continue
            a0, a1 = p.get('range', [0, 49 if a in ('walk', 'walk_back') else 33])
            mode = 'loop' if a in ('walk', 'walk_back') else 'death' if a == 'death' else 'once'
            anims[a] = [p['file'], a0, a1, 16 if mode != 'once' else 18, mode, 'back' if a == 'walk_back' else 'front']
        if anims:
            build_sheets.build(staged / 'assets', e['kind'], {'era': era, 'gameH': cat['art']['front']['display'][1],
                                                              'frontFacesLeft': e.get('facesLeft', True), 'anims': anims})


def install_audio(spec, state, staged):
    from process_audio import decode, encode, fade_out, peak_normalise, rms_normalise, seamless_loop, trim
    era = spec['id']
    out = ROOT / 'public' / 'sounds' / era
    (out / 'voice').mkdir(parents=True, exist_ok=True)
    sfx, music, voice = {}, {}, []
    for aid, a in state['assets'].items():
        if not a.get('picked') or a.get('kind') not in ('sfx', 'music', 'voice'): continue
        clip = decode(staged / a['picked']['file'])
        if a['kind'] == 'music':
            encode(seamless_loop(rms_normalise(trim(clip, -55))), out / f'{aid}.mp3', quality=4)
            music[f'{era}_{aid}'] = {'available': True, 'volume': 0.45, 'src': f'{era}/{aid}'}
        elif a['kind'] == 'voice':
            encode(fade_out(rms_normalise(trim(clip, -50), -18), 120), out / 'voice' / f"{re.sub(r'^e[0-9]+_', '', aid)}.mp3", quality=5)
            voice.append(aid)
        else:
            stinger = aid in ('wave_clear', 'victory', 'defeat')
            clip = trim(clip, -55 if stinger else -45)
            clip = fade_out(rms_normalise(clip, -16), 400) if stinger else fade_out(peak_normalise(clip))
            encode(clip, out / f'{aid}_1.mp3', quality=4)
            sfx[f'{era}_{aid}'] = {'variants': 1, 'volume': SFX_VOLUME.get(aid, 0.45), 'cooldown': 80, 'detune': 80, 'src': f'{era}/{aid}'}
    return sfx, music, sorted(voice)


def roles(template_kinds, enemies):
    """Matches the template's regular enemies to the new ones by toughness (weakest to weakest)."""
    hp = lambda k: BUILTINS['enemies'][k]['hp']
    old = sorted([k for k in template_kinds if not BUILTINS['enemies'][k].get('boss')], key=hp)
    new = sorted(enemies, key=lambda e: CAT['enemies'][e['behaves']]['stats']['hp'])
    return {o: n['kind'] for o, n in zip(old, new)}


def build_era(spec, state, sprites, tower_sprites, muzzles, sfx, music, voice):
    era = spec['id']
    tpl = BUILTINS['templates'][spec.get('layout', 'era3')]
    swap = roles(tpl['enemies'], spec['enemies'])
    boss_old = next(k for k in tpl['enemies'] if BUILTINS['enemies'][k].get('boss'))
    swap[boss_old] = spec['boss']['kind']
    waves = [{'groups': [{**g, 'kind': swap[g['kind']]} for g in w['groups']]} for w in tpl['waves']]
    towers = {}
    for t in spec['towers']:
        b = BUILTINS['towers'][t['behaves']]
        d = {k: v for k, v in b.items() if k not in ('era', 'hp', 'trait')}
        towers[t['kind']] = {**d, 'kind': t['kind'], 'behaves': t['behaves'], 'name': t['name'], 'note': t.get('note') or b.get('note')}
    enemies = {}
    for e in spec['enemies'] + [spec['boss']]:
        b = BUILTINS['enemies'][e['behaves']]
        d = {k: v for k, v in b.items() if k != 'era'}
        enemies[e['kind']] = {**d, 'kind': e['kind'], 'behaves': e['behaves'], **({'name': e['name']} if d.get('boss') else {})}
    p = f'{era}_'
    has = lambda sid: f'{p}{sid}' in sfx
    fx = lambda sid, fallback: f'{p}{sid}' if has(sid) else fallback
    look = {
        'map': f'map_ground_{era}', 'start': 'crypt', 'end': 'cabin', 'startOffset': [0, 0], 'endSmoke': False, 'painted': True,
        'plot': 'plot', 'plotHigh': 'plot_high', 'editorPalette': [], 'atmosphere': tpl['atmosphere'],
        'baseName': spec['base']['name'], 'lostLine': f"They reached the {spec['base']['name']}.",
        'music': {'build': f'{p}music_build' if f'{p}music_build' in music else 'music_build',
                  'wave': f'{p}music_wave' if f'{p}music_wave' in music else 'music_wave'},
        'sfx': {
            'build': fx('build', 'build'), 'upgrade': fx('build', 'upgrade'), 'baseHit': fx('base_hit', 'base_hit'),
            'waveStart': fx('wave_start', 'wave_start'), 'waveClear': fx('wave_clear', 'wave_clear'),
            'victory': fx('victory', 'victory'), 'defeat': fx('defeat', 'defeat'), 'explosion': fx('explosion', 'explosion'),
            'shot': {t['kind']: fx(f"shot_{t['kind']}", 'arrow_shot') for t in spec['towers']},
            'death': {e['kind']: fx('death_big' if e is spec['boss'] or CAT['enemies'][e['behaves']]['stats']['size'] >= 14 else 'death_small', 'zombie_death')
                      for e in spec['enemies'] + [spec['boss']]},
            'spawn': {e['kind']: (f"{p}spawn_{e['kind']}" if has(f"spawn_{e['kind']}") else None) for e in spec['enemies'] + [spec['boss']]},
        },
    }
    hero = {}
    for lid, text in state.get('hero_lines', {}).items():
        ev = re.sub(r'^e[0-9]+_', '', lid).rsplit('_', 1)[0]
        hero.setdefault(ev, []).append((int(lid.rsplit('_', 1)[1]), text))
    hero = {ev: [t for _, t in sorted(v)] for ev, v in hero.items()}
    return {
        'id': era, 'name': spec['name'], 'live': False,
        'lanes': tpl['lanes'], 'plots': tpl['plots'], 'towers': towers, 'towerOrder': [t['kind'] for t in spec['towers']],
        'enemies': enemies, 'waves': waves, 'startGold': tpl['startGold'], 'killGoldPerWave': tpl['killGoldPerWave'],
        'look': look, 'sprites': sprites, 'towerSprites': tower_sprites, 'gunMuzzle': muzzles,
        'sfx': sfx, 'music': music, 'heroLines': hero, 'voice': voice,
        'traits': {t['kind']: {'name': t['trait'], 'text': CAT['towers'][t['behaves']]['level3']['text']} for t in spec['towers'] if t.get('trait')},
    }


def main():
    spec = json.loads(Path(sys.argv[1]).read_text())
    state = json.loads(Path(sys.argv[2]).read_text())
    staged = Path(sys.argv[3])
    only = set(sys.argv[sys.argv.index('--only') + 1].split(',')) if '--only' in sys.argv else {'sprites', 'anims', 'audio', 'era'}
    era_file = ROOT / 'src' / 'eras' / f"{spec['id']}.json"
    prev = json.loads(era_file.read_text()) if era_file.exists() else {}
    sprites, tower_sprites, muzzles = (install_sprites(spec, state, staged) if 'sprites' in only
                                       else (prev.get('sprites', {}), prev.get('towerSprites', {}), prev.get('gunMuzzle', {})))
    if 'anims' in only: install_anims(spec, state, staged)
    sfx, music, voice = install_audio(spec, state, staged) if 'audio' in only else (prev.get('sfx', {}), prev.get('music', {}), prev.get('voice', []))
    if 'era' in only:
        data = build_era(spec, state, sprites, tower_sprites, muzzles, sfx, music, voice)
        data['live'] = prev.get('live', False)
        era_file.write_text(json.dumps(data, indent=1))
        print('wrote', era_file.relative_to(ROOT))


if __name__ == '__main__':
    main()
