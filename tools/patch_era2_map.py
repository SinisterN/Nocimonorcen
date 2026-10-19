"""Touches up the painted era 2 map: paints out the cabin left over from the guide (the police station stands at the
road's end instead) and the painted build pads of plots that were moved, by cloning nearby clean ground over them.

usage: python tools/patch_era2_map.py   (reads art/era2/map_fix/map_ground_original.jpg, writes public/sprites/era2/map_ground.jpg)
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art/era2/map_fix/map_ground_original.jpg"
OUT = ROOT / "public/sprites/era2/map_ground.jpg"


def screen(gx, gy):
    return 640 + (gx - gy) * 40, 95 + (gx + gy) * 20


def main():
    src = Image.open(SRC).convert("RGB")
    out = src.copy()

    def clone(mask_draw, dx, dy, feather=6):
        """Copies the ground (dx, dy) pixels away over the masked area."""
        m = Image.new("L", src.size, 0)
        mask_draw(ImageDraw.Draw(m))
        m = m.filter(ImageFilter.GaussianBlur(feather))
        shifted = Image.new("RGB", src.size)
        shifted.paste(src, (-dx, -dy))
        out.paste(shifted, (0, 0), m)

    # the cabin at the end of the road
    clone(lambda d: d.polygon([(436, 520), (468, 465), (498, 436), (600, 436), (606, 600), (560, 630), (510, 645), (440, 615)],
                              fill=255), 260, 40)
    # painted pads of moved plots: (old plot, ground to copy from = the plot's new spot, which its pad covers anyway)
    for old, new in [((5, -1), (6, -2)), ((9, -2), (8, -3))]:
        ox, oy = screen(*old)
        nx, ny = screen(*new)
        clone(lambda d: d.ellipse([ox - 46, oy - 26, ox + 46, oy + 26], fill=255), nx - ox, ny - oy, 4)
    out.save(OUT, quality=90)


if __name__ == "__main__":
    main()
