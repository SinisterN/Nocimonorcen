"""Builds the layout guide for painting a map: plain ground, the road drawn exactly along the path, and the
build plots, start building and end building stamped where the game will put them. The painter (FLUX.2 Klein)
then turns this into a detailed scene and keeps everything in place.

usage: python tools/map_guide.py <layout.json> <plot.png> <plot_high.png> <start.png> <end.png> <out.png>
layout.json: {"path": [[gx, gy], ...] or "lanes": [[[gx, gy], ...], ...], "plots": [{"x": gx, "y": gy, "high": true?}, ...],
              "start": {"at": [gx, gy], "width": px}, "end": {"at": [gx, gy], "width": px},
              optional "style": "asphalt" | "village", "props": [{"file", "at", "width", "oy"}]}
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
    lanes = layout.get("lanes") or [layout["path"]]
    style = layout.get("style", "asphalt")
    rnd, rng = random.Random(3), np.random.default_rng(3)
    if style == "clean":
        return clean_guide(layout, lanes, plot_f, high_f, start_f, end_f, out)

    # ground: cold grey with soft blotches, cracks and dark scorch marks (era 3 "village": earthy green-brown)
    n = rng.standard_normal((H // 16 + 1, W // 16 + 1))
    blot = np.asarray(Image.fromarray(((n - n.min()) / (n.max() - n.min()) * 255).astype(np.uint8))
                      .resize((W, H), Image.BICUBIC)).astype(float) / 255
    base = (62, 64, 74) if style == "asphalt" else (96, 104, 70)
    g = Image.fromarray(np.stack([base[0] + 28 * blot, base[1] + 28 * blot, base[2] + 30 * blot], 2).clip(0, 255).astype(np.uint8)).convert("RGBA")
    d = ImageDraw.Draw(g)
    crack = (28, 28, 34, 255) if style == "asphalt" else (70, 62, 44, 255)
    for _ in range(140):
        x, y = rnd.uniform(0, W), rnd.uniform(0, H)
        pts = [(x, y)]
        for _ in range(rnd.randint(3, 7)):
            x += rnd.uniform(-40, 40); y += rnd.uniform(-20, 20); pts.append((x, y))
        d.line(pts, fill=crack, width=2)
    for _ in range(14):
        x, y, r = rnd.uniform(0, W), rnd.uniform(0, H), rnd.uniform(20, 55)
        d.ellipse((x - r, y - r / 2, x + r, y + r / 2), fill=(34, 32, 36, 255) if style == "asphalt" else (58, 52, 40, 255))

    # road: dark asphalt band exactly along the path, faded yellow centre dashes
    def band(radius, colour):
        m = Image.new("L", (W, H), 0)
        md = ImageDraw.Draw(m)
        for path in lanes:
            for (ax, ay), (bx, by) in zip(path, path[1:]):
                steps = int(max(abs(bx - ax), abs(by - ay)) / 0.05) + 1
                for i in range(steps + 1):
                    x, y = scr(ax + (bx - ax) * i / steps, ay + (by - ay) * i / steps)
                    w, h = radius * 1.414 * 80, radius * 1.414 * 40
                    md.ellipse((x - w / 2, y - h / 2, x + w / 2, y + h / 2), fill=255)
        g.paste(colour, mask=m)
    if style == "asphalt":
        band(0.80, (40, 40, 46, 255))
        band(0.70, (52, 53, 60, 255))
        d = ImageDraw.Draw(g)
        for path in lanes:
            for (ax, ay), (bx, by) in zip(path, path[1:]):
                steps = int(max(abs(bx - ax), abs(by - ay)) / 0.5)
                for i in range(0, steps, 2):
                    p = scr(ax + (bx - ax) * i / steps, ay + (by - ay) * i / steps)
                    q = scr(ax + (bx - ax) * (i + 0.6) / steps, ay + (by - ay) * (i + 0.6) / steps)
                    d.line([p, q], fill=(170, 150, 70, 255), width=3)
    else:
        # cobbled village street: worn grey cobbles with a darker kerb
        band(0.82, (92, 84, 72, 255))
        band(0.70, (150, 140, 124, 255))
        d = ImageDraw.Draw(g)
        cm = Image.new("L", (W, H), 0); band_mask = ImageDraw.Draw(cm)
        for path in lanes:
            for (ax, ay), (bx, by) in zip(path, path[1:]):
                steps = int(max(abs(bx - ax), abs(by - ay)) / 0.05) + 1
                for i in range(steps + 1):
                    x, y = scr(ax + (bx - ax) * i / steps, ay + (by - ay) * i / steps)
                    band_mask.ellipse((x - 79, y - 39, x + 79, y + 39), fill=255)
        cob = Image.new("RGBA", (W, H)); cd = ImageDraw.Draw(cob)
        for _ in range(9000):
            x, y = rnd.uniform(0, W), rnd.uniform(0, H)
            c = rnd.randint(118, 172)
            cd.ellipse((x - 6, y - 3, x + 6, y + 3), fill=(c, c - 8, c - 22, 255), outline=(84, 76, 64, 255))
        ca = np.minimum(np.asarray(cob)[..., 3], np.asarray(cm))
        cob.putalpha(Image.fromarray(ca))
        g.alpha_composite(cob)
    g = g.filter(ImageFilter.GaussianBlur(0.6))

    # stamps: plots (in path order of depth), then the buildings
    plot, high = sprite(plot_f, 66), sprite(high_f, 82)
    for p in sorted(layout["plots"], key=lambda p: p["x"] + p["y"]):
        x, y = scr(p["x"], p["y"])
        if p.get("high"):
            g.alpha_composite(high, (int(x - high.width / 2), int(y - HIGH_LIFT - high.height * 0.367)))
        else:
            g.alpha_composite(plot, (int(x - plot.width / 2), int(y - plot.height / 2)))
    for pr in sorted(layout.get("props", []), key=lambda p: p["at"][0] + p["at"][1]):
        s = sprite(pr["file"], pr["width"])
        x, y = scr(*pr["at"])
        g.alpha_composite(s, (int(x - s.width / 2), int(y - s.height * pr.get("oy", 0.8))))
    for key, f, oy in (("start", start_f, 0.9), ("end", end_f, 0.82)):
        s = sprite(f, layout[key]["width"])
        x, y = scr(*layout[key]["at"])
        g.alpha_composite(s, (int(x - s.width / 2), int(y - s.height * oy)))
    g.convert("RGB").save(out)
    print(out)


def clean_guide(layout, lanes, plot_f, high_f, start_f, end_f, out):
    """A guide made for the painter's edge-following (Canny): plain ground with no texture, the road a smooth band
    with crisp borders and a dashed centre line, pads as clean outlined tiles. Only the shapes that matter make
    edges, so long winding roads with narrow gaps between stretches stay readable."""
    g = Image.new("RGBA", (W, H), (110, 120, 96, 255))
    radius = 0.62                                   # road half-width in tiles (keeps 1.7+ tiles of ground between stretches)

    def band_mask(r):
        m = Image.new("L", (W, H), 0)
        md = ImageDraw.Draw(m)
        for path in lanes:
            for (ax, ay), (bx, by) in zip(path, path[1:]):
                steps = int(max(abs(bx - ax), abs(by - ay)) / 0.05) + 1
                for i in range(steps + 1):
                    x, y = scr(ax + (bx - ax) * i / steps, ay + (by - ay) * i / steps)
                    w, h = r * 2 * 40 * 1.414, r * 2 * 20 * 1.414
                    md.ellipse((x - w / 2, y - h / 2, x + w / 2, y + h / 2), fill=255)
        return m
    outer, inner = band_mask(radius), band_mask(radius - 0.07)
    g.paste((58, 52, 46, 255), mask=outer)            # dark kerb: a crisp edge on both sides of the road
    g.paste((196, 184, 160, 255), mask=inner)         # light, untextured road surface
    d = ImageDraw.Draw(g)
    for path in lanes:                                # dashed centre line shows which way the road runs
        for (ax, ay), (bx, by) in zip(path, path[1:]):
            steps = max(1, int(max(abs(bx - ax), abs(by - ay)) / 0.5))
            for i in range(0, steps, 2):
                p = scr(ax + (bx - ax) * i / steps, ay + (by - ay) * i / steps)
                q = scr(ax + (bx - ax) * (i + 0.7) / steps, ay + (by - ay) * (i + 0.7) / steps)
                d.line([p, q], fill=(120, 108, 90, 255), width=3)
    for p in sorted(layout["plots"], key=lambda p: p["x"] + p["y"]):
        x, y = scr(p["x"], p["y"])
        hw, hh = (34, 17) if not p.get("high") else (40, 20)
        lift = 14 if p.get("high") else 0
        if lift:                                      # raised pad: a block with a visible front face
            d.polygon([(x - hw, y - lift), (x, y + hh - lift), (x + hw, y - lift), (x + hw, y), (x, y + hh), (x - hw, y)], fill=(70, 66, 60, 255))
        d.polygon([(x, y - hh - lift), (x + hw, y - lift), (x, y + hh - lift), (x - hw, y - lift)], fill=(150, 146, 138, 255), outline=(40, 38, 34, 255), width=3)
    for key, f, oy in (("start", start_f, 0.9), ("end", end_f, 0.82)):
        s = sprite(f, layout[key]["width"])
        x, y = scr(*layout[key]["at"])
        g.alpha_composite(s, (int(x - s.width / 2), int(y - s.height * oy)))
    g.convert("RGB").save(out)
    print(out)


if __name__ == "__main__":
    main()
