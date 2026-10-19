"""Cuts the painted grass patch out from under tower sprites, so each tower stands straight on the map's build plot.

usage: python tools/strip_tower_ground.py <original.png> <out.png> [...pairs]
       python tools/strip_tower_ground.py --all      (art/era1/tower_originals/*.png -> public/sprites/era1/)
Run it on the original sprites with their green grass base (kept in art/era1/tower_originals/).

1. grass-green pixels become transparent (yellows such as flags and dry straw are kept)
2. only the tower itself survives: loose pebbles, tufts and the patch's outline ring are dropped
3. a soft contact shadow is painted under the tower so it sits on the ground instead of floating
The canvas size is unchanged, so the sprite's origin in src/sprites.ts still puts the tower on its plot.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
ORIGINALS = ROOT / "art" / "era1" / "tower_originals"
OUT = ROOT / "public" / "sprites" / "era1"
SHADOW = (24, 14, 30)
# lowest grass hue per sprite; the default keeps yellows (flags), the hellfire bombard has dry yellow straw to remove
GRASS_HUE_MIN = {"tower_bombard_l3.png": 50}


def hue_sat(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    d = mx - mn + 1e-6
    h = np.where(mx == r, (60 * (g - b) / d) % 360, np.where(mx == g, 60 * (b - r) / d + 120, 60 * (r - g) / d + 240))
    return h, (mx - mn) / (mx + 1e-6)


def strip(src: Path, dst: Path):
    im = Image.open(src).convert("RGBA")
    px = np.asarray(im).astype(np.float32)
    rgb, alpha = px[..., :3] / 255, px[..., 3]
    h, s = hue_sat(rgb)
    grass = (h > GRASS_HUE_MIN.get(src.name, 68)) & (h < 165) & (s > 0.18) & (alpha > 0)
    keep = (alpha > 30) & ~grass
    # close tiny gaps (outlines between grass blades) so the tower stays one piece, then keep the big pieces
    solid = ndimage.binary_opening(keep, iterations=1)
    labels, n = ndimage.label(solid)
    if n == 0:
        raise SystemExit(f"{src.name}: nothing left after removing the grass")
    sizes = ndimage.sum(solid, labels, range(1, n + 1))
    main = sizes.max()
    big = [i + 1 for i, size in enumerate(sizes) if size >= main * 0.02]
    mask = np.isin(labels, big)
    # give back the 1-2 px of outline the opening shaved off the tower's own edges
    mask = ndimage.binary_dilation(mask, iterations=2) & keep
    out = px.copy()
    out[..., 3] = np.where(mask, alpha, 0)
    tower = Image.fromarray(out.astype(np.uint8))

    # contact shadow, sized from the tower's footprint (its lowest rows)
    ys, xs = np.nonzero(mask)
    bottom = ys.max()
    foot = xs[ys > bottom - (bottom - ys.min()) * 0.12]
    cx, w = float(foot.min() + foot.max()) / 2, float(foot.max() - foot.min()) * 1.2
    bottom = float(bottom)
    shadow = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse((cx - w / 2, bottom - w * 0.2, cx + w / 2, bottom + w * 0.1), fill=SHADOW + (150,))
    shadow = shadow.filter(ImageFilter.GaussianBlur(w * 0.05))
    shadow.alpha_composite(tower)
    shadow.save(dst)
    print(f"{src.name}: kept {int(mask.sum())} px, {len(big)} piece(s)")


def main():
    args = sys.argv[1:]
    if args == ["--all"]:
        for src in sorted(ORIGINALS.glob("*.png")):
            strip(src, OUT / src.name)
        return
    for src, dst in zip(args[::2], args[1::2]):
        strip(Path(src), Path(dst))


if __name__ == "__main__":
    main()
