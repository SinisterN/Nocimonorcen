"""Turns picked WAN 2.2 takes (sheet.png grids of 512 px frames from the asset connector) into compact game sprite sheets.

usage: python tools/anim/build_sheets.py <takes dir> <kind> <era>
Writes public/sprites/<era>/anim/<kind>/<anim>.png and src/anims/<kind>.json.

Per animation: frames are picked (and cut to the loop for walks), trimmed to one shared box, scaled so the body is
SCALE x the in-game height, and anchored at the feet. Walk and back-walk frames have their lowest point pinned to the
ground line (a raised foot never goes lower than the planted one, so this removes the clip's bobbing drift without
killing the step). One-shots (attack, hit) keep the motion but share frame 0's anchor; deaths keep their fall.
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC_CELL, COLS = 512, 8
GAME_H, SCALE = 54, 2            # the zombie is drawn 54 px tall; frames are stored at 2x for sharpness

# anim: (take folder, first frame, end frame (exclusive), fps, mode, view)
PICKS = {
    'walk':       ('zombie_walk_v1',       11, 31, 16, 'loop', 'front'),
    'walk_back':  ('zombie_walk_back_v1',   2, 29, 16, 'loop', 'back'),
    'attack':     ('zombie_attack_v2',      0, 25, 18, 'once', 'front'),
    'hit':        ('zombie_hit_v2',         0, 17, 30, 'once', 'front'),
    'death_side': ('zombie_death_side_v1',  0, 25, 16, 'death', 'front'),
    'death_back': ('zombie_death_v2',       0, 25, 16, 'death', 'front'),
}

def frames_of(takes, folder, a, b):
    sh = Image.open(takes / folder / 'sheet.png').convert('RGBA')
    out = []
    for i in range(a, b):
        f = sh.crop(((i % COLS) * SRC_CELL, (i // COLS) * SRC_CELL, (i % COLS + 1) * SRC_CELL, (i // COLS + 1) * SRC_CELL))
        al = np.array(f.split()[3]); al[al < 40] = 0          # drop faint matte haze left by background removal
        f.putalpha(Image.fromarray(al)); out.append(f)
    return out

def feet_y(f):
    al = np.array(f.split()[3]) > 100
    rows = np.nonzero(al.any(1))[0]
    return int(rows.max()) if len(rows) else SRC_CELL - 1

def main():
    takes, kind, era = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
    out_dir = ROOT / 'public' / 'sprites' / era / 'anim' / kind; out_dir.mkdir(parents=True, exist_ok=True)
    # one scale for every animation: from the walk's standing body height
    # one scale per view, from that view's standing walk frame, so the front and back views match in size
    K = {}
    for view, anim in (('front', 'walk'), ('back', 'walk_back')):
        f0 = frames_of(takes, PICKS[anim][0], PICKS[anim][1], PICKS[anim][1] + 1)[0]
        bb = f0.getbbox(); K[view] = GAME_H * SCALE / (bb[3] - bb[1])
    meta = {'scale': SCALE, 'anims': {}}
    for name, (folder, a, b, fps, mode, view) in PICKS.items():
        fr = frames_of(takes, folder, a, b)
        k = K[view]
        base = feet_y(fr[0])
        if mode == 'loop':   # pin every frame's lowest point to frame 0's ground line
            shifted = []
            for f in fr:
                dy = base - feet_y(f)
                g = Image.new('RGBA', f.size); g.alpha_composite(f, (0, dy)) if dy >= 0 else g.alpha_composite(f.crop((0, -dy, SRC_CELL, SRC_CELL)), (0, 0))
                shifted.append(g)
            fr = shifted
        box = [SRC_CELL, SRC_CELL, 0, 0]
        for f in fr:
            b2 = f.getbbox()
            if b2: box = [min(box[0], b2[0]), min(box[1], b2[1]), max(box[2], b2[2]), max(box[3], b2[3])]
        box = [max(0, box[0] - 4), max(0, box[1] - 4), min(SRC_CELL, box[2] + 4), min(SRC_CELL, box[3] + 4)]
        w, h = round((box[2] - box[0]) * k), round((box[3] - box[1]) * k)
        cells = [f.crop(tuple(box)).resize((w, h), Image.LANCZOS) for f in fr]
        cols = min(len(cells), 8); rows = -(-len(cells) // cols)
        sheet = Image.new('RGBA', (cols * w, rows * h))
        for i, c in enumerate(cells): sheet.alpha_composite(c, ((i % cols) * w, (i // cols) * h))
        sheet.save(out_dir / f'{name}.png', optimize=True)
        # anchor: the feet, horizontally where frame 0's body centre is
        b0 = fr[0].getbbox(); cx = (b0[0] + b0[2]) / 2
        meta['anims'][name] = {'file': f'sprites/{era}/anim/{kind}/{name}.png', 'w': w, 'h': h, 'frames': len(cells), 'fps': fps, 'mode': mode, 'view': view,
                               'originX': round((cx - box[0]) / (box[2] - box[0]), 4), 'originY': round((base - box[1]) / (box[3] - box[1]), 4)}
        print(name, len(cells), 'frames', f'{w}x{h}', sheet.size, f'{(out_dir / f"{name}.png").stat().st_size // 1024} KB')
    (ROOT / 'src' / 'anims').mkdir(exist_ok=True)
    (ROOT / 'src' / 'anims' / f'{kind}.json').write_text(json.dumps(meta, indent=1))

if __name__ == '__main__':
    main()
