"""Extends a titan death take with a steaming disintegration: the body keeps venting steam, then crumbles away
under a noise mask from the edges inward while the steam billows up and thins out.

usage: python tools/era3/steam_death.py <take sheet.png> <out frames dir> [--frames 33] [--extra 32] [--hold 6] [--seed 1]
Writes frame_000.png… (512 px RGBA): the take's frames, then `extra` frames of steam and dissolve.
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, distance_transform_edt

CELL, COLS = 512, 8


def cells(sheet, n):
    im = Image.open(sheet).convert('RGBA')
    return [im.crop(((i % COLS) * CELL, (i // COLS) * CELL, (i % COLS + 1) * CELL, (i // COLS + 1) * CELL)) for i in range(n)]


def puff_field(rng, n_puffs, H, W, body):
    """Steam puffs that start on the body and rise, swelling and fading."""
    ys, xs = np.nonzero(body)
    sel = rng.integers(0, len(ys), n_puffs)
    return [dict(x=float(xs[i]), y=float(ys[i]), r=rng.uniform(10, 22), vx=rng.uniform(-0.6, 0.6),
                 vy=-rng.uniform(1.6, 3.4), grow=rng.uniform(0.9, 1.6), born=int(rng.integers(0, 30)),
                 life=int(rng.integers(14, 26))) for i in sel]


def render_steam(puffs, t, H, W):
    acc = np.zeros((H, W), np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    for p in puffs:
        a = t - p['born']
        if a < 0 or a > p['life']: continue
        cx, cy = p['x'] + p['vx'] * a, p['y'] + p['vy'] * a
        r = p['r'] + p['grow'] * a
        k = np.sin(np.pi * a / p['life']) ** 0.8
        x0, x1 = int(max(0, cx - 2 * r)), int(min(W, cx + 2 * r)); y0, y1 = int(max(0, cy - 2 * r)), int(min(H, cy + 2 * r))
        if x1 <= x0 or y1 <= y0: continue
        d2 = ((xx[y0:y1, x0:x1] - cx) ** 2 + (yy[y0:y1, x0:x1] - cy) ** 2) / (r * r)
        acc[y0:y1, x0:x1] += 0.55 * k * np.exp(-d2 * 1.6)
    return np.clip(acc, 0, 0.9)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('sheet'); ap.add_argument('out')
    ap.add_argument('--frames', type=int, default=33); ap.add_argument('--extra', type=int, default=44)
    ap.add_argument('--hold', type=int, default=8); ap.add_argument('--seed', type=int, default=1)
    o = ap.parse_args()
    rng = np.random.default_rng(o.seed)
    frames = cells(o.sheet, o.frames)
    out = Path(o.out); out.mkdir(parents=True, exist_ok=True)
    last = np.asarray(frames[-1], np.float32)
    H, W = last.shape[:2]
    body = last[..., 3] > 128
    # dissolve order: edges go first, then inward, broken up by noise so it crumbles rather than shrinks
    depth = distance_transform_edt(body); depth /= max(depth.max(), 1)
    noise = gaussian_filter(rng.random((H, W)).astype(np.float32), 3); noise = (noise - noise.min()) / (np.ptp(noise) + 1e-6)
    order = 0.55 * depth + 0.45 * noise   # 0 = goes first
    puffs = puff_field(rng, 110, H, W, body)
    steam_col = np.array([236, 232, 226], np.float32)
    ember_col = np.array([255, 150, 70], np.float32)
    for i, f in enumerate(frames): f.save(out / f'frame_{i:03d}.png')
    # a little steam already rising over the take's last frames is added by the game; here: the extension
    for j in range(o.extra):
        t = j
        cut = max(0.0, (j - o.hold) / max(1, o.extra - o.hold - 4))   # 0 → 1 over the dissolve
        rgb, a = last[..., :3].copy(), last[..., 3] / 255
        if cut > 0:
            thr = cut * 1.08
            keep = order > thr
            edge = (order > thr) & (order < thr + 0.06)          # glowing crumbling rim
            a = a * keep
            rgb[edge] = rgb[edge] * 0.35 + ember_col * 0.65
        # body darkens and dries out as it steams away
        rgb *= 1 - 0.35 * min(1, j / o.extra)
        s = render_steam(puffs, t, H, W) * (1 - max(0, (j - o.extra + 8) / 8))
        # steam over the body: plain "over" compositing
        out_a = s + a * (1 - s)
        out_rgb = (steam_col * s[..., None] + rgb * (a * (1 - s))[..., None]) / np.maximum(out_a[..., None], 1e-3)
        img = np.dstack([np.clip(out_rgb, 0, 255), np.clip(out_a * 255, 0, 255)]).astype(np.uint8)
        Image.fromarray(img, 'RGBA').save(out / f'frame_{o.frames + j:03d}.png')
    print('wrote', o.frames + o.extra, 'frames to', out)


if __name__ == '__main__':
    main()
