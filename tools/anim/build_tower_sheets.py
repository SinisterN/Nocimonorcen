"""Turns picked WAN 2.2 tower takes (sheet.png grids of 512 px frames from the asset connector) into game sprite sheets.

usage: python tools/anim/build_tower_sheets.py [<tower key> ...]        (default: every key in tower_picks.json)
Picks come from tools/anim/tower_picks.json. Writes public/sprites/<era>/anim/towers/<key>_<anim>.webp and
updates src/anims/towers.json.

Unlike enemies, towers are anchored to their plot by the static art's origin fractions. Frame 0 of a WAN take is
the source art, so the static origin maps onto frame 0's content box, and every frame of every animation of one
tower is cut to one shared box, so the tower doesn't shift when the game switches between idle, fire and damaged.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC_CELL, COLS = 512, 8
PICKS_FILE = ROOT / 'tools' / 'anim' / 'tower_picks.json'
ANIMS_DIR = ROOT / 'src' / 'anims'
TAKES = Path('/mnt/user-data/uploads/dev/game-asset-mcp/assets/animations')


def frames_of(folder, a, b):
    sh = Image.open(TAKES / folder / 'sheet.png').convert('RGBA')
    out = []
    for i in range(a, b):
        f = sh.crop(((i % COLS) * SRC_CELL, (i // COLS) * SRC_CELL, (i % COLS + 1) * SRC_CELL, (i // COLS + 1) * SRC_CELL))
        al = np.array(f.split()[3]); al[al < 40] = 0
        f.putalpha(Image.fromarray(al)); out.append(f)
    return out


def build(key, cfg):
    era, display, origin = cfg['era'], cfg['display'], cfg['origin']
    out_dir = ROOT / 'public' / 'sprites' / era / 'anim' / 'towers'; out_dir.mkdir(parents=True, exist_ok=True)
    all_frames = {name: frames_of(*spec[:3]) for name, spec in cfg['anims'].items()}
    # anchor: the static art's origin fractions, placed inside the idle's first-frame content box
    b0 = all_frames['idle'][0].getbbox()
    ax, ay = b0[0] + origin[0] * (b0[2] - b0[0]), b0[1] + origin[1] * (b0[3] - b0[1])
    k = display[1] * 2 / (b0[3] - b0[1])
    # one shared box over every frame of every animation
    box = [SRC_CELL, SRC_CELL, 0, 0]
    for fr in all_frames.values():
        for f in fr:
            b = f.getbbox()
            if b: box = [min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3])]
    box = [max(0, box[0] - 4), max(0, box[1] - 4), min(SRC_CELL, box[2] + 4), min(SRC_CELL, box[3] + 4)]
    w, h = round((box[2] - box[0]) * k), round((box[3] - box[1]) * k)
    meta = {'w': w, 'h': h, 'originX': round((ax - box[0]) / (box[2] - box[0]), 4),
            'originY': round((ay - box[1]) / (box[3] - box[1]), 4), 'anims': {}}
    if 'band' in cfg:   # arrow tower parapet band: fractions of the static art, mapped onto the shared box
        meta['band'] = [round((b0[1] + f * (b0[3] - b0[1]) - box[1]) / (box[3] - box[1]), 4) for f in cfg['band']]
    for name, spec in cfg['anims'].items():
        fps, mode = spec[3], spec[4]
        cells = [f.crop(tuple(box)).resize((w, h), Image.LANCZOS) for f in all_frames[name]]
        cols = min(len(cells), 8); rows = -(-len(cells) // cols)
        sheet = Image.new('RGBA', (cols * w, rows * h))
        for i, c in enumerate(cells): sheet.alpha_composite(c, ((i % cols) * w, (i // cols) * h))
        f = out_dir / f'{key}_{name}.webp'
        sheet.save(f, 'WEBP', quality=88, method=6, alpha_quality=90)
        meta['anims'][name] = {'file': f'sprites/{era}/anim/towers/{key}_{name}.webp', 'frames': len(cells), 'fps': fps, 'mode': mode}
        print(key, name, len(cells), 'frames', f'{w}x{h}', f'{f.stat().st_size // 1024} KB')
    return meta


def main():
    picks = json.loads(PICKS_FILE.read_text())
    keys = sys.argv[1:] or [k for k in picks if not k.startswith('_')]
    out_file = ANIMS_DIR / 'towers.json'
    data = json.loads(out_file.read_text()) if out_file.exists() else {}
    for key in keys:
        data[key] = build(key, picks[key])
    ANIMS_DIR.mkdir(exist_ok=True)
    out_file.write_text(json.dumps(data, indent=1))


if __name__ == '__main__':
    main()
