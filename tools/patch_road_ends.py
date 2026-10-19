"""Paints the road out beyond its two ends (past the cabin and behind the crypt) on the painted map.

usage: python tools/patch_road_ends.py <map.jpg> <map_without_road.png> <out.jpg> [mask_preview.png]
Behind the crypt: taken from map_without_road (the same map repainted with no road; any size, scaled back).
Past the cabin: filled with the map's own ground from beside the road (CLONE_SHIFT), because the AI repaints
leave blank white there. Both are blended in with a soft edge, so the rest of the map stays untouched.
"""
import sys
from PIL import Image, ImageDraw, ImageFilter

W, H = 1280, 720
# path ends in grid coordinates (see PATH_WAYPOINTS in src/config.ts)
START, END = (-2, 2), (13, 10)
# past the cabin, ground is copied from this far to the side (pure left: lands on the ground below the road)
CLONE_SHIFT = (-300, 0)


def screen(gx, gy):
    return 640 + (gx - gy) * 40, 96 + (gx + gy) * 20


def tail_mask(start, direction, length=14, half_width=1.15, skip=0.35):
    """Mask over the road beyond an end point, running `length` cells further in `direction`."""
    m = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(m)
    for i in range(int(length / 0.1)):
        t = skip + i * 0.1
        x, y = screen(start[0] + direction[0] * t, start[1] + direction[1] * t)
        rx, ry = half_width * 40 * 1.42, half_width * 20 * 1.42
        d.ellipse((x - rx, y - ry, x + rx, y + ry), fill=255)
    return m


def main():
    base = Image.open(sys.argv[1]).convert("RGB").resize((W, H))
    clean = Image.open(sys.argv[2]).convert("RGB").resize((W, H), Image.LANCZOS)
    cloned = base.copy()
    dx, dy = CLONE_SHIFT
    cloned.paste(base.crop((0, 0, W + dx, H)), (-dx, dy))  # shifts the map right, so each pixel shows its left neighbour
    out = base
    for name, src, start, direction in (("cabin", cloned, END, (1, 0)), ("crypt", clean, START, (-1, 0))):
        mask = tail_mask(start, direction).filter(ImageFilter.GaussianBlur(14))
        out = Image.composite(src, out, mask)
        if len(sys.argv) > 4:
            mask.save(sys.argv[4].replace(".png", f"_{name}.png"))
    out.save(sys.argv[3], quality=92)


if __name__ == "__main__":
    main()
