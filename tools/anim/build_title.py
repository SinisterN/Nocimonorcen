"""Builds the animated start-menu title from a WAN take (assets/animations/title/<take>/).

usage: python tools/anim/build_title.py <take folder> [--out public/sprites/title/title.webp] [--meta src/anims/title.json]
                                       [--first 1] [--end 33] [--fps 12] [--xfade 6] [--width 460]

- Glow recovery: background removal cuts away soft glows (energy rings, vortex halos). The take's raw frames still
  have them over the plain backdrop the logo was rendered on, so the backdrop is estimated (from what background
  removal threw away) and anything brighter than it comes back as semi-transparent glow, un-mixed from the backdrop.
- Seamless loop: the last `xfade` frames are cross-faded into the first ones, so the whole take loops with no jump
  (characters keep moving, so no single pair of frames matches).
- Frames are cut to the take's shared content box and stored at 2x the on-screen width in a 4-column sheet, which
  keeps the texture inside 4096 px.
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

ROOT = Path(__file__).resolve().parents[2]
TAKES = Path('/mnt/user-data/uploads/dev/game-asset-mcp/assets/animations')
COLS = 8


def load(folder, first, end):
    jf = TAKES / folder / 'sheet.json'
    meta = json.loads(jf.read_text()) if jf.exists() else {'frameWidth': 832, 'frameHeight': 416, 'columns': 8}
    cw, ch, cols = meta['frameWidth'], meta['frameHeight'], meta['columns']
    sheet = Image.open(TAKES / folder / 'sheet.png').convert('RGBA')
    cut = [sheet.crop(((i % cols) * cw, (i // cols) * ch, (i % cols + 1) * cw, (i // cols + 1) * ch)) for i in range(first, end)]
    alpha = [np.asarray(f, dtype=np.float32)[..., 3] / 255 for f in cut]
    raw = [np.asarray(Image.open(TAKES / folder / 'raw' / f'frame_{i:03d}.png').convert('RGB').resize((cw, ch)), dtype=np.float32)
           for i in range(first, end)]
    return raw, alpha


def backdrop(raw, alpha):
    """The plain backdrop behind the logo: averaged where background removal found nothing, filled in by blurring."""
    acc = np.zeros_like(raw[0]); cnt = np.zeros(raw[0].shape[:2], np.float32)
    for r, a in zip(raw, alpha):
        m = (a < 0.02).astype(np.float32)
        acc += r * m[..., None]; cnt += m
    blur = lambda x: gaussian_filter(x, 40)
    num = np.dstack([blur(acc[..., c]) for c in range(3)]); den = blur(cnt)[..., None]
    return num / np.maximum(den, 1e-3)


def recover(raw, alpha, bg):
    lum = lambda x: x[..., 0] * 0.3 + x[..., 1] * 0.59 + x[..., 2] * 0.11
    glow = np.clip((lum(raw) - lum(bg) - 10) / 70, 0, 1)
    a = np.maximum(alpha, glow)
    col = (raw - bg * (1 - a[..., None])) / np.maximum(a[..., None], 1e-3)
    out = np.dstack([np.clip(col, 0, 255), a * 255]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('take'); p.add_argument('--out', default='public/sprites/title/title.webp')
    p.add_argument('--meta', default='src/anims/title.json'); p.add_argument('--first', type=int, default=1)
    p.add_argument('--end', type=int, default=33); p.add_argument('--fps', type=int, default=12)
    p.add_argument('--xfade', type=int, default=6); p.add_argument('--width', type=int, default=460)
    p.add_argument('--scale', type=int, default=1, help='stored size relative to on-screen size; the game renders a fixed 1280x720 canvas, so 1x is pixel-exact')
    p.add_argument('--no-glow', action='store_true')
    p.add_argument('--loop', action='store_true', help='the take was pinned to end on its first picture (connector loop:true): drop the duplicate last frame and ease the final frames into the first instead of cross-fading')
    p.add_argument('--per-sheet', type=int, default=80, help='frames per sheet file (8 columns), so each stays inside a 4096 px texture')
    p.add_argument('--vignette', action='store_true', help='keep the whole painted scene inside a soft oval')
    o = p.parse_args()
    raw, alpha = load(o.take, o.first, o.end)
    if o.vignette:
        # the concept is a painted vignette: keep the whole scene, fading out in a soft oval, plus the cut-out
        h0, w0 = raw[0].shape[:2]
        yy, xx = np.mgrid[0:h0, 0:w0]
        d = np.sqrt(((xx - w0 / 2) / (w0 * 0.47)) ** 2 + ((yy - h0 * 0.5) / (h0 * 0.49)) ** 2)
        oval = np.clip((1 - d) / 0.16, 0, 1)
        frames = [Image.fromarray(np.dstack([r, np.maximum(a, oval) * 255]).astype(np.uint8), 'RGBA') for r, a in zip(raw, alpha)]
    elif o.no_glow:
        frames = [Image.fromarray(np.dstack([r, a * 255]).astype(np.uint8), 'RGBA') for r, a in zip(raw, alpha)]
    else:
        bg = backdrop(raw, alpha)
        frames = [recover(r, a, bg) for r, a in zip(raw, alpha)]
    k, n = o.xfade, len(frames)
    if o.loop:
        # frames[-1] is the pinned copy of frames[0]: drop it, and ease the last few frames toward frame 0 so the
        # small remaining difference is spread out rather than a single pop
        frames = frames[:-1]; n -= 1; e = 4
        for j in range(e):
            frames[n - e + j] = Image.blend(frames[n - e + j], frames[0], 0.5 * (j + 1) / (e + 1))
        k = 0
    # seamless loop: the last k frames fade into the first k, and playback starts at frame k
    if k:
        head = [Image.blend(frames[n - k + j], frames[j], (j + 1) / (k + 1)) for j in range(k)]
        frames = head + frames[k:n - k]
    box = [10 ** 6, 10 ** 6, 0, 0]
    for f in frames:
        bb = Image.fromarray((np.asarray(f)[..., 3] > 12).astype(np.uint8) * 255).getbbox()
        if bb: box = [min(box[0], bb[0]), min(box[1], bb[1]), max(box[2], bb[2]), max(box[3], bb[3])]
    box = [max(0, box[0] - 6), max(0, box[1] - 6), box[2] + 6, box[3] + 6]
    bw, bh = box[2] - box[0], box[3] - box[1]
    w = o.width * o.scale; h = round(bh * w / bw)
    cells = [f.crop(tuple(box)).resize((w, h), Image.LANCZOS) for f in frames]
    out = ROOT / o.out if not o.out.startswith('/') else Path(o.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    files, total = [], 0
    for si in range(0, len(cells), o.per_sheet):
        part = cells[si:si + o.per_sheet]
        rows = -(-len(part) // COLS)
        sheet = Image.new('RGBA', (COLS * w, rows * h))
        for i, c in enumerate(part): sheet.alpha_composite(c, ((i % COLS) * w, (i // COLS) * h))
        f = out.with_name(f'{out.stem}_{si // o.per_sheet}{out.suffix}')
        sheet.save(f, 'WEBP', quality=84, method=6, alpha_quality=88)
        total += f.stat().st_size
        rel = str(f.relative_to(ROOT / 'public')) if str(f).startswith(str(ROOT / 'public')) else f.name
        files.append({'file': rel, 'frames': len(part)})
    meta = {'files': files, 'w': w, 'h': h, 'scale': o.scale, 'frames': len(cells), 'fps': o.fps, 'source': f'{o.take} {o.first}-{o.end} xfade {k}'}
    mp = ROOT / o.meta if not o.meta.startswith('/') else Path(o.meta)
    mp.write_text(json.dumps(meta, indent=1))
    print(meta, f'{total // 1024} KB')


if __name__ == '__main__':
    main()
