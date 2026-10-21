"""Turns picked WAN 2.2 tower takes (sheet.png grids of 512 px frames from the asset connector) into game sprite sheets.

usage: python tools/anim/build_tower_sheets.py [<tower key> ...]        (default: every key in tower_picks.json)
Picks come from tools/anim/tower_picks.json. Writes public/sprites/<era>/anim/towers/<key>_<anim>.webp and
updates src/anims/towers.json.

Towers are anchored to their plot exactly like their static art. Frame 0 of a WAN take is that art, so it is
registered onto the art's solid silhouette (scale and offset, ignoring the soft painted shadow), and the art's
origin, size and any arrow-tower points are carried through that registration. Every frame of every animation of
one tower is cut to one shared box, so the tower doesn't shift when the game switches between idle and damaged.

Arrow levels also get an occluder sheet (<key>_<anim>_front.webp): the same frames masked down to the front
battlements and rim, which the game draws over the archer so he stands inside the parapet.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC_CELL, COLS = 512, 8
PICKS_FILE = ROOT / 'tools' / 'anim' / 'tower_picks.json'
ANIMS_DIR = ROOT / 'src' / 'anims'
TAKES = Path('/mnt/user-data/uploads/dev/game-asset-mcp/assets/animations')
SOLID = 128


def frames_of(folder, a, b=None):
    """Frames a..b-1 of a take, or the listed frame numbers when a is a list."""
    sh = Image.open(TAKES / folder / 'sheet.png').convert('RGBA')
    out = []
    for i in (a if isinstance(a, list) else range(a, b)):
        f = sh.crop(((i % COLS) * SRC_CELL, (i // COLS) * SRC_CELL, (i % COLS + 1) * SRC_CELL, (i // COLS + 1) * SRC_CELL))
        al = np.array(f.split()[3]); al[al < 40] = 0
        f.putalpha(Image.fromarray(al)); out.append(f)
    return out


def solid(img):
    return np.array(img.split()[3]) >= SOLID


def register(art, frame0):
    """Scale k and offset t with art_px = k * frame_px + t, fitting frame 0's solid silhouette onto the art's."""
    sa, sf = solid(art), solid(frame0)
    H, W = sa.shape

    def stats(m):
        ys, xs = np.nonzero(m)
        return np.array([xs.mean(), ys.mean()]), np.array([xs.max() - xs.min() + 1, ys.max() - ys.min() + 1])
    ca, da = stats(sa); cf, df = stats(sf)
    k0 = float(np.mean(da / df))
    fimg = Image.fromarray(sf.astype(np.uint8) * 255)
    best = (-1, None)
    for k in k0 * np.linspace(0.94, 1.06, 25):
        base_t = ca - k * cf
        for dx in (-2, -1, 0, 1, 2):
            for dy in (-2, -1, 0, 1, 2):
                t = base_t + (dx, dy)
                warped = np.array(fimg.transform((W, H), Image.AFFINE, (1 / k, 0, -t[0] / k, 0, 1 / k, -t[1] / k),
                                                 resample=Image.NEAREST)) > 127
                iou = (warped & sa).sum() / max(1, (warped | sa).sum())
                if iou > best[0]: best = (iou, (k, t))
    return best[1], best[0]


def build(key, cfg):
    era, origin = cfg['era'], cfg['origin']
    out_dir = ROOT / 'public' / 'sprites' / era / 'anim' / 'towers'; out_dir.mkdir(parents=True, exist_ok=True)
    art = Image.open(ROOT / cfg['art']).convert('RGBA')
    all_frames = {name: frames_of(*spec[:3]) for name, spec in cfg['anims'].items()}
    # the take's own frame 0 is the art (picked ranges can start later); the camera is static, so it registers every frame
    (k, t), iou = register(art, frames_of(cfg['anims']['idle'][0], 0, 1)[0])
    to_frame = lambda x, y: ((x - t[0]) / k, (y - t[1]) / k)     # art px -> frame px
    ax, ay = to_frame(origin[0] * art.width, origin[1] * art.height)
    # one shared box over every frame of every animation
    box = [SRC_CELL, SRC_CELL, 0, 0]
    for fr in all_frames.values():
        for f in fr:
            b = f.getbbox()
            if b: box = [min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3])]
    box = [max(0, box[0] - 4), max(0, box[1] - 4), min(SRC_CELL, box[2] + 4), min(SRC_CELL, box[3] + 4)]
    bw, bh = box[2] - box[0], box[3] - box[1]
    w, h = round(bw * k), round(bh * k)            # the art file is stored at 2x, so is the sheet
    frac = lambda x, y: [round((x - box[0]) / bw, 4), round((y - box[1]) / bh, 4)]
    meta = {'w': w, 'h': h, 'originX': frac(ax, ay)[0], 'originY': frac(ax, ay)[1], 'anims': {}}
    mask = None
    if 'feet' in cfg:
        meta['feet'] = frac(*to_frame(*cfg['feet']))
    if 'occluder' in cfg:
        mask = Image.new('L', (SRC_CELL, SRC_CELL), 0)
        d = ImageDraw.Draw(mask)
        for r in cfg['occluder']:
            (x0, y0), (x1, y1) = to_frame(r[0], r[1]), to_frame(r[2], r[3])
            d.rectangle((x0, y0, x1, y1), fill=255)
        mask = mask.filter(ImageFilter.GaussianBlur(0.8))
    for name, spec in cfg['anims'].items():
        fps, mode = spec[3], spec[4]
        layers = {'': all_frames[name]}
        if mask is not None:
            layers['_front'] = []
            for f in all_frames[name]:
                g = f.copy(); g.putalpha(Image.fromarray((np.array(f.split()[3]).astype(np.uint16) * np.array(mask) // 255).astype(np.uint8)))
                layers['_front'].append(g)
        for suffix, frames in layers.items():
            cells = [f.crop(tuple(box)).resize((w, h), Image.LANCZOS) for f in frames]
            cols = min(len(cells), 8); rows = -(-len(cells) // cols)
            sheet = Image.new('RGBA', (cols * w, rows * h))
            for i, c in enumerate(cells): sheet.alpha_composite(c, ((i % cols) * w, (i // cols) * h))
            f = out_dir / f'{key}_{name}{suffix}.webp'
            sheet.save(f, 'WEBP', quality=88, method=6, alpha_quality=90)
            if not suffix:
                meta['anims'][name] = {'file': f'sprites/{era}/anim/towers/{key}_{name}.webp', 'frames': len(cells), 'fps': fps, 'mode': mode}
            else:
                meta['anims'][name]['front'] = f'sprites/{era}/anim/towers/{key}_{name}{suffix}.webp'
            print(key, name + suffix, len(cells), 'frames', f'{w}x{h}', f'{f.stat().st_size // 1024} KB', f'fit {iou:.3f}')
    return meta


def build_unit(key, cfg):
    """A figure standing on a tower (the archer): scaled so his body is cfg['height'] game px tall, origin at his feet."""
    era = cfg['era']
    out_dir = ROOT / 'public' / 'sprites' / era / 'anim' / 'towers'; out_dir.mkdir(parents=True, exist_ok=True)
    all_frames = {name: frames_of(*spec[:3]) for name, spec in cfg['anims'].items()}
    ref = solid(frames_of(cfg['anims']['idle'][0], 0, 1)[0])
    ys, xs = np.nonzero(ref)
    feet_y = ys.max()
    low = ys > feet_y - (feet_y - ys.min()) * 0.06          # the soles: bottom 6% of the figure
    feet_x = xs[low].mean()
    k = cfg['height'] * 2 / (feet_y - ys.min() + 1)
    box = [SRC_CELL, SRC_CELL, 0, 0]
    for fr in all_frames.values():
        for f in fr:
            b = f.getbbox()
            if b: box = [min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3])]
    box = [max(0, box[0] - 4), max(0, box[1] - 4), min(SRC_CELL, box[2] + 4), min(SRC_CELL, box[3] + 4)]
    bw, bh = box[2] - box[0], box[3] - box[1]
    w, h = round(bw * k), round(bh * k)
    meta = {'w': w, 'h': h, 'originX': round((feet_x - box[0]) / bw, 4), 'originY': round((feet_y - box[1]) / bh, 4), 'anims': {}}
    for name, spec in cfg['anims'].items():
        cells = [f.crop(tuple(box)).resize((w, h), Image.LANCZOS) for f in all_frames[name]]
        cols = min(len(cells), 8); rows = -(-len(cells) // cols)
        sheet = Image.new('RGBA', (cols * w, rows * h))
        for i, c in enumerate(cells): sheet.alpha_composite(c, ((i % cols) * w, (i // cols) * h))
        f = out_dir / f'{key}_{name}.webp'
        sheet.save(f, 'WEBP', quality=90, method=6, alpha_quality=95)
        meta['anims'][name] = {'file': f'sprites/{era}/anim/towers/{key}_{name}.webp', 'frames': len(cells), 'fps': spec[3], 'mode': spec[4]}
        print(key, name, len(cells), 'frames', f'{w}x{h}', f'{f.stat().st_size // 1024} KB')
    return meta


def main():
    picks = json.loads(PICKS_FILE.read_text())
    keys = sys.argv[1:] or [k for k in picks if not k.startswith('_')]
    out_file = ANIMS_DIR / 'towers.json'
    data = json.loads(out_file.read_text()) if out_file.exists() else {}
    for key in keys:
        data[key] = (build_unit if picks[key].get('unit') else build)(key, picks[key])
    ANIMS_DIR.mkdir(exist_ok=True)
    out_file.write_text(json.dumps(data, indent=1))


if __name__ == '__main__':
    main()
