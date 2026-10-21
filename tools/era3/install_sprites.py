"""Installs the approved Era 3 art into public/sprites/era3/ at 2x its on-screen size and prints the SPRITES entries.

usage: python tools/era3/install_sprites.py
Towers: cut to the art, anchored where the tower's footprint centre is (a 2:1 iso footprint: its bottom corner is the
art's lowest point, so the centre sits a quarter of the art's width above it). Titans and the fighter: anchored at
the feet. Back views come from the animation sources (the art they were animated from).
"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'art' / 'era3'
SRC = Path('/mnt/user-data/uploads/dev/game-asset-mcp/assets/anim_src/era3')
OUT = ROOT / 'public' / 'sprites' / 'era3'

# name: (source file, on-screen height, kind) kind: tower (iso footprint anchor) | feet
ITEMS = {
    'e3_tower_rifle': (ART / 'towers/rifle_l1.png', 118, 'tower'),
    'e3_tower_rifle_l2': (ART / 'towers/rifle_l2.png', 120, 'tower'),
    'e3_tower_rifle_l3': (ART / 'towers/rifle_l3.png', 120, 'tower'),
    'e3_tower_ballista': (ART / 'towers/ballista_l1.png', 124, 'tower'),
    'e3_tower_ballista_l2': (ART / 'towers/ballista_l2.png', 128, 'tower'),
    'e3_tower_ballista_l3': (ART / 'towers/ballista_l3.png', 128, 'tower'),
    'e3_tower_killer': (ART / 'towers/killer_l1.png', 218, 'tower'),
    'e3_tower_killer_l2': (ART / 'towers/killer_l2.png', 229, 'tower'),
    'e3_tower_killer_l3': (ART / 'towers/killer_l3.png', 237, 'tower'),
    'e3_hunter': (ART / 'towers/hunter.png', 40, 'feet'),
    'e3_hunter_lance': (SRC / 'lance/hunter_lance_v1.png', 40, 'feet'),
    'enemy_titan_s': (ART / 'enemies/titan_small.png', 64, 'feet'),
    'enemy_titan_m': (ART / 'enemies/titan_medium.png', 86, 'feet'),
    'enemy_brawler': (ART / 'enemies/brawler.png', 92, 'feet'),
    'enemy_wallwalker': (ART / 'enemies/wallwalker.png', 138, 'feet'),
    'enemy_colossus': (ART / 'enemies/armored.png', 126, 'feet'),
    'enemy_titan_s_back': (SRC / 'src_titan_small_back.png', 64, 'feet'),
    'enemy_titan_m_back': (SRC / 'medback/med_back_a_v3.png', 86, 'feet'),
    'enemy_brawler_back': (SRC / 'src_brawler_back.png', 92, 'feet'),
    'enemy_wallwalker_back': (SRC / 'src_wallwalker_back.png', 138, 'feet'),
    'enemy_colossus_back': (SRC / 'src_armored_back.png', 126, 'feet'),
}


def cutout(path):
    im = Image.open(path).convert('RGBA')
    # the animation sources sit on white: key it out
    if im.getextrema()[3][0] == 255:
        px = im.load()
        w, h = im.size
        from collections import deque
        seen = set(); q = deque([(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)])
        while q:
            x, y = q.popleft()
            if (x, y) in seen or not (0 <= x < w and 0 <= y < h): continue
            r, g, b, a = px[x, y]
            if min(r, g, b) < 236: continue
            seen.add((x, y)); px[x, y] = (255, 255, 255, 0)
            q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return im.crop(im.getbbox())


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    entries = {}
    for name, (src, height, kind) in ITEMS.items():
        im = cutout(src)
        w, h = im.size
        dw = round(w * height / h)
        im.resize((dw * 2, height * 2), Image.LANCZOS).save(OUT / f'{name}.png', optimize=True)
        oy = 1 - (w * 0.25) / h if kind == 'tower' else 0.985
        entries[name] = {'key': f'sp_{name}', 'file': f'sprites/era3/{name}.png', 'origin': [0.5, round(oy, 3)], 'display': [dw, height]}
        print(f"  {name}: {{ key: 'sp_{name}', file: 'sprites/era3/{name}.png', origin: [0.5, {round(oy, 3)}], display: [{dw}, {height}] }},")
    (ROOT / 'art' / 'era3' / 'sprites.json').write_text(json.dumps(entries, indent=1))


if __name__ == '__main__':
    main()
