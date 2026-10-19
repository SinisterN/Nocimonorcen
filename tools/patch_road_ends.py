"""Paints the road out beyond its two ends (past the cabin and behind the crypt) on the painted map.

usage: python tools/patch_road_ends.py <map.jpg> <map_without_road.png> <out.jpg>
map_without_road: the same map repainted with no road at all; only the road tails are taken from it,
with a soft edge, so the rest of the map stays untouched.
"""
import sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter

W, H = 1280, 720
# path ends in grid coordinates (see PATH_WAYPOINTS in src/config.ts)
START, END = (-2, 2), (13, 10)


def screen(gx, gy):
    return 640 + (gx - gy) * 40, 96 + (gx + gy) * 20


def tail_mask(start, direction, length=14, half_width=1.15, skip=0.35):
    """Soft mask over the road beyond an end point, running `length` cells further in `direction`."""
    m = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(m)
    steps = int(length / 0.1)
    for i in range(steps):
        t = skip + i * 0.1
        x, y = screen(start[0] + direction[0] * t, start[1] + direction[1] * t)
        rx, ry = half_width * 40 * 1.42, half_width * 20 * 1.42
        d.ellipse((x - rx, y - ry, x + rx, y + ry), fill=255)
    return m


def main():
    base = Image.open(sys.argv[1]).convert("RGB").resize((W, H))
    clean = Image.open(sys.argv[2]).convert("RGB").resize((W, H), Image.LANCZOS)
    mask = Image.new("L", (W, H), 0)
    for m in (tail_mask(END, (1, 0)), tail_mask(START, (-1, 0))):
        mask = ImageChops.lighter(mask, m)
    mask = mask.filter(ImageFilter.GaussianBlur(14))
    Image.composite(clean, base, mask).save(sys.argv[3], quality=92)
    if len(sys.argv) > 4:
        mask.save(sys.argv[4])


if __name__ == "__main__":
    main()
