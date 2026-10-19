"""Builds the layout guide for painting a map: plain ground, the road drawn exactly along the path, and the
build plots, start building and end building stamped where the game will put them. The painter (FLUX.2 Klein)
then turns this into a detailed scene and keeps everything in place.

usage: python tools/map_guide.py <layout.json> <plot.png> <plot_high.png> <start.png> <end.png> <out.png>
layout.json: {"path": [[gx, gy], ...], "plots": [{"x": gx, "y": gy, "high": true?}, ...],
              "start": {"at": [gx, gy], "width": px}, "end": {"at": [gx, gy], "width": px}}
Sprites are transparent PNGs (any size; they are trimmed and scaled to their in-game size).
"""
import json
import random
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 1280, 720
HIGH_LIFT = 16


def scr(gx, gy):
    return 640 + (gx - gy) * 40, 96 + (gx + gy) * 20


def sprite(path, width):
    im = Image.open(path).convert("RGBA")
    im = im.crop(im.getbbox())
    return im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)


def main():
    layout = json.load(open(sys.argv[1]))
    plot_f, high_f, start_f, end_f, out = sys.argv[2:7]
    path = layout["path"]
    rnd, rng = random.Random(3), np.random.default_rng(3)

    # ground: cold grey with soft blotches, cracks and dark scorch marks
    n = rng.standard_normal((H // 16 + 1, W // 16 + 1))
    blot = np.asarray(Image.fromarray(((n - n.min()) / (n.max() - n.min()) * 255).astype(np.uint8))
                      .resize((W, H), Image.BICUBIC)).astype(float) / 255
    g = Image.fromarray(np.stack([62 + 28 * blot, 64 + 28 * blot, 74 + 30 * blot], 2).clip(0, 255).astype(np.uint8)).convert("RGBA")
    d = ImageDraw.Draw(g)
    for _ in range(140):
        x, y = rnd.uniform(0, W), rnd.uniform(0, H)
        pts = [(x, y)]
        for _ in range(rnd.randint(3, 7)):
            x += rnd.uniform(-40, 40); y += rnd.uniform(-20, 20); pts.append((x, y))
        d.line(pts, fill=(28, 28, 34, 255), width=2)
    for _ in range(14):
        x, y, r = rnd.uniform(0, W), rnd.uniform(0, H), rnd.uniform(20, 55)
        d.ellipse((x - r, y - r / 2, x + r, y + r / 2), fill=(34, 32, 36, 255))

    # road: dark asphalt band exactly along the path, faded yellow centre dashes
    def band(radius, colour):
        m = Image.new("L", (W, H), 0)
        md = ImageDraw.Draw(m)
        for (ax, ay), (bx, by) in zip(path, path[1:]):
            steps = int(max(abs(bx - ax), abs(by - ay)) / 0.05) + 1
            for i in range(steps + 1):
                x, y = scr(ax + (bx - ax) * i / steps, ay + (by - ay) * i / steps)
                w, h = radius * 1.414 * 80, radius * 1.414 * 40
                md.ellipse((x - w / 2, y - h / 2, x + w / 2, y + h / 2), fill=255)
        g.paste(colour, mask=m)
    band(0.80, (40, 40, 46, 255))
    band(0.70, (52, 53, 60, 255))
    d = ImageDraw.Draw(g)
    for (ax, ay), (bx, by) in zip(path, path[1:]):
        steps = int(max(abs(bx - ax), abs(by - ay)) / 0.5)
        for i in range(0, steps, 2):
            p = scr(ax + (bx - ax) * i / steps, ay + (by - ay) * i / steps)
            q = scr(ax + (bx - ax) * (i + 0.6) / steps, ay + (by - ay) * (i + 0.6) / steps)
            d.line([p, q], fill=(170, 150, 70, 255), width=3)
    g = g.filter(ImageFilter.GaussianBlur(0.6))

    # stamps: plots (in path order of depth), then the buildings
    plot, high = sprite(plot_f, 66), sprite(high_f, 82)
    for p in sorted(layout["plots"], key=lambda p: p["x"] + p["y"]):
        x, y = scr(p["x"], p["y"])
        if p.get("high"):
            g.alpha_composite(high, (int(x - high.width / 2), int(y - HIGH_LIFT - high.height * 0.367)))
        else:
            g.alpha_composite(plot, (int(x - plot.width / 2), int(y - plot.height / 2)))
    for key, f, oy in (("start", start_f, 0.9), ("end", end_f, 0.82)):
        s = sprite(f, layout[key]["width"])
        x, y = scr(*layout[key]["at"])
        g.alpha_composite(s, (int(x - s.width / 2), int(y - s.height * oy)))
    g.convert("RGB").save(out)
    print(out)


if __name__ == "__main__":
    main()
