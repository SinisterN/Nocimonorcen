"""Draws shape guides for Era 3's square build pads: an isometric (2:1) square stone platform, flat and raised.
usage: python tools/era3/pad_guide.py <out dir>"""
import sys
from PIL import Image, ImageDraw

def pad(depth, out):
    W, H = 768, 512
    im = Image.new('RGB', (W, H), 'white'); d = ImageDraw.Draw(im)
    cx, cy, hw = W // 2, 200, 330          # top diamond centre and half width
    hh = hw // 2
    top = [(cx, cy - hh), (cx + hw, cy), (cx, cy + hh), (cx - hw, cy)]
    # side faces (darker grey), then the top (light grey) with a slab grid and a kerb border
    d.polygon([(cx - hw, cy), (cx, cy + hh), (cx, cy + hh + depth), (cx - hw, cy + depth)], fill=(120, 120, 120), outline='black')
    d.polygon([(cx + hw, cy), (cx, cy + hh), (cx, cy + hh + depth), (cx + hw, cy + depth)], fill=(90, 90, 90), outline='black')
    d.polygon(top, fill=(200, 200, 200), outline='black')
    k = 0.86   # inner edge of the kerb
    inner = [(cx + (x - cx) * k, cy + (y - cy) * k) for x, y in top]
    d.polygon(inner, fill=(185, 185, 185), outline='black')
    n = 5
    for i in range(1, n):
        t = i / n
        a = (inner[3][0] + (inner[0][0] - inner[3][0]) * t, inner[3][1] + (inner[0][1] - inner[3][1]) * t)
        b = (inner[2][0] + (inner[1][0] - inner[2][0]) * t, inner[2][1] + (inner[1][1] - inner[2][1]) * t)
        d.line([a, b], fill='black', width=2)
        a = (inner[3][0] + (inner[2][0] - inner[3][0]) * t, inner[3][1] + (inner[2][1] - inner[3][1]) * t)
        b = (inner[0][0] + (inner[1][0] - inner[0][0]) * t, inner[0][1] + (inner[1][1] - inner[0][1]) * t)
        d.line([a, b], fill='black', width=2)
    # stone courses on the sides
    for j in range(1, depth // 22 + 1):
        y = j * 22
        d.line([(cx - hw, cy + y), (cx, cy + hh + y)], fill='black', width=2)
        d.line([(cx + hw, cy + y), (cx, cy + hh + y)], fill='black', width=2)
    im.save(out)

o = sys.argv[1]
pad(30, f'{o}/pad_guide.png')
pad(96, f'{o}/pad_high_guide.png')
