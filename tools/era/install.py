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


INSTANT = {k for k, v in BUILTINS['towers'].items() if not v.get('flightTime')}


def main_colour(img):
    """The picture's main colour as '#rrggbb' (saturated, opaque pixels weigh most), brightened for glows and trails."""
    import numpy as np
    a = np.asarray(img.convert('RGBA')).reshape(-1, 4).astype(float)
    a = a[a[:, 3] > 128]
    if not len(a): return None
    rgb = a[:, :3]
    sat = rgb.max(1) - rgb.min(1) + 1
    c = (rgb * sat[:, None]).sum(0) / sat.sum()
    c = c + (255 - c) * 0.25
    return '#%02x%02x%02x' % tuple(int(v) for v in c.clip(0, 255))


def save_fx(src, era, name, longest):
    """An effect picture (shot or hit): cut out, stored at 2x, its display size = longest side in game px."""
    im = cutout(src)
    w, h = im.size
    k = longest / max(w, h)
    dw, dh = max(1, round(w * k)), max(1, round(h * k))
    out = ROOT / 'public' / 'sprites' / era / 'fx' / f'{name}.png'
    out.parent.mkdir(parents=True, exist_ok=True)
    im.resize((dw * 2, dh * 2), Image.LANCZOS).save(out, optimize=True)
    return {'key': f'sp_{name}', 'file': f'sprites/{era}/fx/{name}.png', 'origin': [0.5, 0.5], 'display': [dw, dh]}, im


def _fx_pair(state, staged, sprites, era, shot, hit, name, instant, shot_size, hit_size):
    """One shot-and-hit look from picked pictures: sprites under fx/, and its TowerFx entry."""
    has = lambda aid: aid in state['assets'] and state['assets'][aid].get('picked')
    f = {}
    if has(shot) and not instant:
        meta, im = save_fx(picked(state, staged, shot), era, f'{name}_shot', 48)
        sprites[f'{name}_shot'] = meta
        w, h = im.size
        f.update({'projectile': f'{name}_shot', 'size': shot_size,
                  'spin': max(w, h) / max(1, min(w, h)) < 1.4,     # round shots spin, long ones point along the flight
                  'trail': main_colour(im), 'glow': main_colour(im)})
    if has(hit):
        meta, im = save_fx(picked(state, staged, hit), era, f'{name}_hit', 96)
        sprites[f'{name}_hit'] = meta
        f.update({'impact': f'{name}_hit', 'impactSize': hit_size})
        if instant: f['beam'] = main_colour(im)
    return f


def install_visuals(spec, state, staged, sprites, muzzles):
    """Each tower's own shots, hits and (arrow-type mechanics) units, per level and per special: sprites, the era's
    fx and units entries, per-level looks for `levels`, and the firing points and unit spots the studio marked."""
    era = spec['id']
    fx, units, per_level = {}, {}, {}
    has = lambda aid: aid in state['assets'] and state['assets'][aid].get('picked')
    for t in spec['towers']:
        k = t['kind']
        splashy = BUILTINS['towers'][t['behaves']].get('splash', 0) > 0
        instant = t['behaves'] in INSTANT
        f = _fx_pair(state, staged, sprites, era, f'{era}_shot_{k}', f'{era}_hit_{k}', f'{era}_fx_{k}', instant, 18 if splashy else 24, 44)
        if f: fx[k] = f
        looks = []
        for n in (1, 2, 3):
            L = {}
            if n > 1:
                fn = _fx_pair(state, staged, sprites, era, f'{era}_shot_{k}_l{n}', f'{era}_hit_{k}_l{n}', f'{era}_fx_{k}_l{n}',
                              instant, 18 if splashy else 24, 44)
                if fn: L['fx'] = {**(looks[-1].get('fx') or f), **fn}
                elif looks and looks[-1].get('fx'): L['fx'] = looks[-1]['fx']
            # a special is always a flying shot (the orb, the bolt), even on a tower whose own shots hit at once;
            # its pictures are named after the special, so one used at two levels has one set
            from plan import specials_of
            L['specialFx'] = []
            for slug, _ in specials_of(t, n):
                sp = _fx_pair(state, staged, sprites, era, f'{era}_shot_{k}_{slug}', f'{era}_hit_{k}_{slug}', f'{era}_fx_{k}_{slug}', False, 30, 64)
                L['specialFx'].append(sp or None)
            unit = f'{era}_unit_{k}' if n == 1 else f'{era}_unit_{k}_l{n}'
            if has(unit):
                sprites[unit] = {**save_sprite(picked(state, staged, unit), era, unit, 40 + 2 * (n - 1), 'feet'), 'origin': [0.5, 0.97]}
                L['unit'] = {'sprite': unit}
            elif looks and looks[-1].get('unit'): L['unit'] = dict(looks[-1]['unit'])
            looks.append(L)
        per_level[k] = looks
        if looks[0].get('unit'):
            units[k] = {'sprite': looks[0]['unit']['sprite'], 'feet': state.get('unitFeet', {}).get(k) or [[0.5, 0.14]] * 3}
        # where shots leave the tower, marked by the studio on the level 1 picture (fractions of its width and height)
        mark = state.get('muzzle', {}).get(k)
        lv1 = sprites.get(f'{era}_tower_{k}')
        if mark and lv1:
            (w, h), (ox, oy) = lv1['display'], lv1['origin']
            muzzles[k] = {**muzzles.get(k, {'turns': True}), 'x': round((mark[0] - ox) * w), 'y': round((mark[1] - oy) * h),
                          'facesLeft': mark[0] < 0.5}
    return fx, units, per_level


def take_frames(folder, cell=512, cols=8):
    """How many frames an animation take's sheet.png holds (its grid's trailing empty cells don't count)."""
    im = Image.open(Path(folder) / 'sheet.png')
    n = (im.width // cell) * (im.height // cell)
    alpha = im.convert('RGBA').split()[3]
    while n > 1:
        i = n - 1
        if alpha.crop(((i % cols) * cell, (i // cols) * cell, (i % cols + 1) * cell, (i // cols + 1) * cell)).getbbox(): break
        n -= 1
    return n


def install_unit_anims(spec, state, staged):
    """Unit animation sheets per level (idle loop, attack, and the cast for a level with a special), like the
    archer's (tools/anim). Sheet keys: <era>_unit_<kind> for level 1, <era>_unit_<kind>_l2 and _l3."""
    import build_tower_sheets as bts
    era = spec['id']
    bts.TAKES = staged / 'assets'
    picks = state.get('anims', {})
    anims = {}
    for t in spec['towers']:
        for n in (1, 2, 3):
            sfx = '' if n == 1 else f'_l{n}'
            idle, shoot, cast = (picks.get(f"{t['kind']}_unit{sfx}_{a}") for a in ('idle', 'shoot', 'cast'))
            if not (idle and shoot): continue
            key = f"{era}_unit_{t['kind']}{sfx}"
            a = {'idle': [idle['file'], 0, take_frames(bts.TAKES / idle['file']), 12, 'pingpong'],
                 'shoot': [shoot['file'], 0, take_frames(bts.TAKES / shoot['file']), 16, 'once']}
            if cast: a['cast'] = [cast['file'], 0, take_frames(bts.TAKES / cast['file']), 16, 'once']
            anims[key] = bts.build_unit(key, {'era': era, 'unit': True, 'height': 38 + 2 * (n - 1), 'anims': a})
    return anims


def build_levels(spec, per_level, tower_anims):
    """The era's `levels` (src/levels.ts) for towers whose levels were confirmed in "How it plays" (spec tower
    `play`, checked by tools/era/abilities.py), with each level's looks and unit."""
    from abilities import check_levels
    out = {}
    for t in spec['towers']:
        if not t.get('play'): continue
        stats = tower_stats(t)
        clean, _, _ = check_levels(t['play'], stats.get('fireDelay') or BUILTINS['towers'][t['behaves']]['fireDelay'],
                                   BUILTINS['towers'][t['behaves']].get('splash', 0))
        while len(clean) < 3: clean.append(dict(clean[-1]))
        looks = per_level.get(t['kind']) or [{}, {}, {}]
        levels = []
        for n, (L, look) in enumerate(zip(clean, looks), 1):
            L = dict(L)
            if look.get('fx'): L['fx'] = look['fx']
            sfx = look.get('specialFx') or []
            if L.get('specials'): L['specials'] = [{**sp, **({'fx': sfx[j]} if j < len(sfx) and sfx[j] else {})} for j, sp in enumerate(L['specials'])]
            if look.get('unit'):
                u = dict(look['unit'])
                key = f"{spec['id']}_unit_{t['kind']}{'' if n == 1 else f'_l{n}'}"
                if key in tower_anims: u['anim'] = key
                elif levels and levels[-1].get('unit', {}).get('anim') and levels[-1]['unit']['sprite'] == u['sprite']:
                    u['anim'] = levels[-1]['unit']['anim']
                L['unit'] = u
            levels.append(L)
        out[t['kind']] = levels
    return out


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
    new = sorted(enemies, key=lambda e: (e.get('stats') or {}).get('hp') or CAT['enemies'][e['behaves']]['stats']['hp'])
    return {o: n['kind'] for o, n in zip(old, new)}


def tower_stats(t):
    """The designer's slider values (cost, range, damage, fireDelay), when the brief has them."""
    s = t.get('stats') or {}
    out = {k: s[k] for k in ('cost', 'range', 'damage', 'fireDelay') if isinstance(s.get(k), (int, float)) and s[k] > 0}
    if t.get('damageType'): out['damageType'] = t['damageType']    # confirmed in "How it plays"
    return out


def enemy_stats(e):
    s = e.get('stats') or {}
    out = {k: s[k] for k in ('hp', 'speed') if isinstance(s.get(k), (int, float)) and s[k] > 0}
    if isinstance(s.get('armor'), (int, float)) and s['armor'] >= 0: out['armor'] = s['armor']
    if e.get('resist'): out['resist'] = e['resist']                # confirmed in "How it plays"
    return out


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
        towers[t['kind']] = {**d, **tower_stats(t), 'kind': t['kind'], 'behaves': t['behaves'], 'name': t['name'], 'note': t.get('note') or b.get('note')}
    enemies = {}
    for e in spec['enemies'] + [spec['boss']]:
        b = BUILTINS['enemies'][e['behaves']]
        d = {k: v for k, v in b.items() if k != 'era'}
        enemies[e['kind']] = {**d, **enemy_stats(e), 'kind': e['kind'], 'behaves': e['behaves'], **({'name': e['name']} if d.get('boss') else {})}
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
    lay = state.get('layout') or {}
    lanes, plots = lay.get('lanes') or tpl['lanes'], lay.get('plots') or tpl['plots']
    # enemies spend longer under fire on a longer road: health grows with the road (Era 3's lanes are ~24 tiles).
    # A first guess, to be tuned with the balance bot in the sandbox.
    road = max(sum(abs(b[0] - a[0]) + abs(b[1] - a[1]) for a, b in zip(l, l[1:])) for l in lanes)
    factor = round(max(1.0, (road / 24) ** 0.75), 2)
    for k, e in enemies.items(): e['hp'] = round(e['hp'] * factor)
    return {
        'id': era, 'name': spec['name'], 'live': False, 'roadLength': road, 'roadHpFactor': factor,
        'lanes': lanes, 'plots': plots, 'towers': towers, 'towerOrder': [t['kind'] for t in spec['towers']],
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
    fx, units, per_level = (install_visuals(spec, state, staged, sprites, muzzles) if 'sprites' in only
                            else (prev.get('fx', {}), prev.get('units', {}), prev.get('_looks', {})))
    if 'anims' in only: install_anims(spec, state, staged)
    tower_anims = install_unit_anims(spec, state, staged) if 'anims' in only else prev.get('towerAnims', {})
    for k, key in ((k, f"{spec['id']}_unit_{k}") for k in units):
        if key in tower_anims: units[k]['anim'] = key
    sfx, music, voice = install_audio(spec, state, staged) if 'audio' in only else (prev.get('sfx', {}), prev.get('music', {}), prev.get('voice', []))
    if 'era' in only:
        data = build_era(spec, state, sprites, tower_sprites, muzzles, sfx, music, voice)
        data.update({'fx': fx, 'units': units, 'towerAnims': tower_anims, 'levels': build_levels(spec, per_level, tower_anims),
                     '_looks': per_level})
        data['live'] = prev.get('live', False)
        era_file.write_text(json.dumps(data, indent=1))
        print('wrote', era_file.relative_to(ROOT))


if __name__ == '__main__':
    main()
