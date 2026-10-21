"""Builds the titan killer fighters' sprite sheets (src/anims/crew.json + public/sprites/era3/anim/crew/*.webp).

usage: python tools/era3/build_crew.py
Every animation shares one scale (the fighter stands GAME_H px tall), stored at SCALE x. Anchors: the feet of the
take's first (standing) frame, except the swing, whose airborne frames are anchored at the body's middle, where the
grapple lines pull.
"""
import json
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
TAKES = Path('/mnt/user-data/uploads/dev/game-asset-mcp/assets/animations/era3')
OUT = ROOT / 'public' / 'sprites' / 'era3' / 'anim' / 'crew'
GAME_H, SCALE, CELL = 30, 3, 512
# name: (take, first, end, step, fps, loop, anchor)
ANIMS = {
    'idle': ('hunter_slash_v1', 0, 1, 1, 1, True, 'feet'),
    'swing': ('hunter_swing_v1', 14, 33, 1, 16, True, 'centre'),
    'slash': ('hunter_slash_v1', 4, 30, 1, 52, False, 'feet'),
    'lance_idle': ('hunter_lance_fire_a_v2', 0, 1, 1, 1, True, 'feet'),
    'fire': ('hunter_lance_fire_a_v2', 0, 33, 1, 24, False, 'feet'),
}


def frames(take, a, b, step):
    sh = Image.open(TAKES / take / 'sheet.png').convert('RGBA')
    out = []
    for i in range(a, b, step):
        f = sh.crop(((i % 8) * CELL, (i // 8) * CELL, (i % 8 + 1) * CELL, (i // 8 + 1) * CELL))
        al = np.array(f.split()[3]); al[al < 40] = 0; f.putalpha(Image.fromarray(al))
        out.append(f)
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    f0 = frames('hunter_slash_v1', 0, 1, 1)[0]
    bb = f0.getbbox(); k = GAME_H * SCALE / (bb[3] - bb[1])
    meta = {'scale': SCALE, 'anims': {}}
    for name, (take, a, b, step, fps, loop, anchor) in ANIMS.items():
        fr = frames(take, a, b, step)
        first = frames(take, 0, 1, 1)[0].getbbox()
        box = [CELL, CELL, 0, 0]
        for f in fr:
            g = f.getbbox()
            if g: box = [min(box[0], g[0]), min(box[1], g[1]), max(box[2], g[2]), max(box[3], g[3])]
        box = [max(0, box[0] - 4), max(0, box[1] - 4), min(CELL, box[2] + 4), min(CELL, box[3] + 4)]
        w, h = round((box[2] - box[0]) * k), round((box[3] - box[1]) * k)
        cells = [f.crop(tuple(box)).resize((w, h), Image.LANCZOS) for f in fr]
        cols = min(8, len(cells)); rows = -(-len(cells) // cols)
        sheet = Image.new('RGBA', (cols * w, rows * h))
        for i, c in enumerate(cells): sheet.alpha_composite(c, ((i % cols) * w, (i // cols) * h))
        sheet.save(OUT / f'{name}.webp', 'WEBP', quality=88, method=6, alpha_quality=90)
        cx = (first[0] + first[2]) / 2
        oy = (first[3] - box[1]) / (box[3] - box[1]) if anchor == 'feet' else 0.55
        meta['anims'][name] = {'file': f'sprites/era3/anim/crew/{name}.webp', 'w': w, 'h': h, 'frames': len(cells), 'fps': fps,
                               'loop': loop, 'originX': round((cx - box[0]) / (box[2] - box[0]), 4), 'originY': round(min(1, oy), 4)}
        print(name, len(cells), f'{w}x{h}')
    (ROOT / 'src' / 'anims' / 'crew.json').write_text(json.dumps(meta, indent=1))


if __name__ == '__main__':
    main()
