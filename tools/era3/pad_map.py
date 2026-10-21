"""Lays square stone build pads over the painted round plots of the Era 3 map, so the square towers stand on
square ground. Raised (high ground) pads are the flat pad with its stone courses stacked HIGH_LIFT px higher.

usage: python tools/era3/pad_map.py <pad.png> <map in> <map out> [--width 116]
"""
import argparse, json
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
HIGH_LIFT = 16


def scr(gx, gy):
    return 640 + (gx - gy) * 40, 96 + (gx + gy) * 20


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('pad'); ap.add_argument('map_in'); ap.add_argument('map_out')
    ap.add_argument('--width', type=int, default=116)
    o = ap.parse_args()
    pad = Image.open(o.pad).convert('RGBA'); pad = pad.crop(pad.getbbox())
    k = o.width / pad.width
    pad = pad.resize((o.width, round(pad.height * k)), Image.LANCZOS)
    m = Image.open(o.map_in).convert('RGBA')
    # colour-match the stone to the map's own painted plots (warm, dusty), and soften the slab grid a little
    ref = np.asarray(m.convert('RGB'), np.float32)[290:330, 690:750].reshape(-1, 3).mean(0)
    pa = np.asarray(pad, np.float32); solid = pa[..., 3] > 200
    cur = pa[solid][:, :3].mean(0)
    grey = pa[..., :3].mean(2, keepdims=True)
    pa[..., :3] = grey + (pa[..., :3] - grey) * 0.55                      # less saturated (no blue cast)
    pa[..., :3] *= (ref / cur) ** 0.8                                    # towards the map's plot colour
    pa[..., :3] = np.clip(pa[..., :3], 0, 255)
    pad = Image.fromarray(pa.astype(np.uint8), 'RGBA')
    # the top face is a 2:1 diamond as wide as the pad: its centre is a quarter of the width below the top
    cy = o.width / 4
    # raised pad: the stone sides (everything below the top face's side corners) stretched taller
    split = round(cy)
    top, sides = pad.crop((0, 0, pad.width, split)), pad.crop((0, split, pad.width, pad.height))
    sides = sides.resize((pad.width, sides.height + HIGH_LIFT), Image.LANCZOS)
    high = Image.new('RGBA', (pad.width, pad.height + HIGH_LIFT))
    high.alpha_composite(sides, (0, split))
    high.alpha_composite(top, (0, 0))
    plots = json.loads((ROOT / 'art/era3/layout.json').read_text())['plots']
    for p in sorted(plots, key=lambda p: p['x'] + p['y']):
        x, y = scr(p['x'], p['y'])
        img = high if p.get('high') else pad
        lift = HIGH_LIFT if p.get('high') else 0
        # soft contact shadow, then the pad with its top face centred on the plot (raised by `lift`)
        sh = Image.new('RGBA', m.size)
        a = np.zeros((m.size[1], m.size[0]), np.uint8)
        from PIL import ImageDraw
        d = ImageDraw.Draw(Image.fromarray(a))
        sl = Image.new('L', m.size, 0); ImageDraw.Draw(sl).polygon(
            [(x, y - o.width / 4 + 6), (x + o.width / 2 + 6, y + 6), (x, y + o.width / 4 + 10), (x - o.width / 2 - 2, y + 6)], fill=110)
        sl = sl.filter(ImageFilter.GaussianBlur(6))
        sh.putalpha(sl)
        m.alpha_composite(sh)
        m.alpha_composite(img, (round(x - img.width / 2), round(y - lift - cy)))
    m.convert('RGB').save(o.map_out, quality=92)
    print('wrote', o.map_out)


if __name__ == '__main__':
    main()
