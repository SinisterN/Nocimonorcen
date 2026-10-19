"""Recolours the grassy bases of tower sprites so they blend into the map.

usage: python tools/recolor_grass.py <map image> <sprite.png> [...]
Samples the map's ground around the build plots (src/config.ts PLOTS) and shifts every grass-green pixel of each
sprite toward that colour, keeping its painted light and shade. Run it on the original (green) sprites.
"""
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent


def plot_points():
    src = (ROOT / "src" / "config.ts").read_text()
    block = src[src.index("export const PLOTS"):]
    block = block[:block.index("];")]
    return [(int(x), int(y)) for x, y in re.findall(r"x:\s*(-?\d+),\s*y:\s*(-?\d+)", block)]


def ground_colour(map_path):
    m = np.asarray(Image.open(map_path).convert("RGB").resize((1280, 720)), dtype=np.float32)
    samples = []
    for gx, gy in plot_points():
        sx, sy = 640 + (gx - gy) * 40, 96 + (gx + gy) * 20
        # a ring just outside the plot, where the tower's grass disc will sit
        for a in np.linspace(0, 2 * np.pi, 24, endpoint=False):
            x, y = int(sx + np.cos(a) * 44), int(sy + np.sin(a) * 22)
            if 0 <= x < 1280 and 0 <= y < 720:
                samples.append(m[y, x])
    s = np.array(samples)
    lum = s.mean(axis=1)
    keep = (lum > np.percentile(lum, 15)) & (lum < np.percentile(lum, 85))  # skip candles and deep shadow
    return s[keep].mean(axis=0)


def recolour(path, target, strength=0.85):
    im = np.asarray(Image.open(path).convert("RGBA"), dtype=np.float32)
    r, g, b, a = im[..., 0], im[..., 1], im[..., 2], im[..., 3]
    grass = (g > r + 12) & (g > b + 18) & (a > 20)
    if not grass.any():
        return 0
    px = im[grass][:, :3]
    lum = px.mean(axis=1, keepdims=True)
    mean_lum = lum.mean()
    # target colour, shaded by each pixel's brightness relative to the grass average
    new = np.clip(target[None, :] * (lum / max(mean_lum, 1)) * 1.08, 0, 255)
    im[grass, :3] = px * (1 - strength) + new * strength
    Image.fromarray(im.astype(np.uint8), "RGBA").save(path)
    return int(grass.sum())


if __name__ == "__main__":
    target = ground_colour(sys.argv[1])
    print("ground colour", target.round())
    for p in sys.argv[2:]:
        print(p, recolour(p, target), "grass pixels")
