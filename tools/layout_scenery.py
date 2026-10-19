"""Plans where the scenery sprites stand on the painted map, so nothing overlaps and everything sits somewhere sensible.

usage: python tools/layout_scenery.py [preview.png]
Writes src/sceneryLayout.ts (used by GameScene when the painted map is loaded).

Rules:
- nothing on the road, on a build plot or where a tower will stand, on the crypt or cabin, or under the HUD
- nothing on the big trees painted into the map, or covering its painted pumpkins and candles
- no two sprites overlap (each sprite's box, trees slightly trimmed since their branch tips are sparse)
- gravestones form a small graveyard on the walled ground to the right, pumpkins sit by the cabin and the road,
  and creepy trees fill the forest edges, outermost first
"""
import json
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
W, H = 1280, 720
WAYPOINTS = [(-2, 2), (6, 2), (6, 7), (2, 7), (2, 10), (13, 10)]
PLOTS = [(3, 1), (5, 0), (7, 1), (1, 4), (4, 4), (8, 4), (1, 6), (3, 6), (8, 6), (1, 8), (8, 8),
         (3, 9), (5, 9), (10, 9), (4, 11), (7, 11), (10, 11)]
HIGH = {(4, 4), (8, 4), (5, 9)}

# sprite sizes on screen [w, h] and ground anchor (see src/sprites.ts)
SIZES = {
    "tree_1": (83, 90), "tree_2": (87, 90), "tree_3": (89, 90), "tree_4": (83, 90),
    "bush_1": (52, 50), "bush_2": (54, 41), "bush_3": (54, 44),
    "rock_1": (45, 46), "rock_2": (44, 46),
}
ORIGIN_Y = {"tree": 0.97, "bush": 0.9, "rock": 0.9}

# screen rectangles [x0, y0, x1, y1] that stay clear
HUD = [(0, 0, 470, 95), (0, 565, 155, 720), (765, 640, 1255, 720)]
PAINTED_TREES = [(560, 0, 1000, 75), (0, 0, 255, 340), (255, 0, 300, 70), (1045, 0, 1280, 345), (995, 0, 1045, 70), (0, 445, 125, 720)]
# the raised walled ground at the bottom right: a natural little graveyard
GRAVEYARD = (900, 470, 1240, 640)


def screen(gx, gy):
    return 640 + (gx - gy) * 40, 96 + (gx + gy) * 20


def grid(x, y):
    a, b = (x - 640) / 40, (y - 96) / 20
    return (a + b) / 2, (b - a) / 2


def blocked_mask():
    """White where nothing may stand."""
    m = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(m)
    # road (and a margin either side)
    for (ax, ay), (bx, by) in zip(WAYPOINTS, WAYPOINTS[1:]):
        steps = int(max(abs(bx - ax), abs(by - ay)) / 0.1) + 1
        for i in range(steps + 1):
            gx, gy = ax + (bx - ax) * i / steps, ay + (by - ay) * i / steps
            x, y = screen(gx, gy)
            d.ellipse((x - 80, y - 40, x + 80, y + 40), fill=255)
    # build plots and the towers that will stand on them
    for p in PLOTS:
        x, y = screen(*p)
        y -= 16 if p in HIGH else 0
        d.rectangle((x - 52, y - 100, x + 52, y + 26), fill=255)
    # crypt and cabin
    cx, cy = screen(-2, 1.4)
    d.rectangle((cx - 80, cy - 90, cx + 80, cy + 20), fill=255)
    cx, cy = screen(13, 10)
    d.rectangle((cx - 85, cy - 155, cx + 90, cy + 45), fill=255)
    for r in HUD + PAINTED_TREES:
        d.rectangle(r, fill=255)
    # painted pumpkins and candles on the map: bright warm pixels, grown a little
    px = np.asarray(Image.open(ROOT / "public/sprites/era1/map_ground.jpg").convert("RGB").resize((W, H))).astype(int)
    warm = (px[..., 0] > 200) & (px[..., 0] - px[..., 2] > 70) & (px[..., 1] > 90)
    glow = Image.fromarray((warm * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(25))
    m.paste(255, mask=glow)
    return np.asarray(m) > 0


def box(name, x, y, scale):
    w, h = SIZES[name]
    w, h = w * scale, h * scale
    oy = ORIGIN_Y[name.split("_")[0]]
    trim = 0.8 if name.startswith("tree") else 1.0  # sparse branch tips may brush
    return (x - w * trim / 2, y - h * oy, x + w * trim / 2, y + h * (1 - oy))


def overlaps(a, b, pad=4):
    return not (a[2] + pad <= b[0] or b[2] + pad <= a[0] or a[3] + pad <= b[1] or b[3] + pad <= a[1])


def fits(b, blocked, placed):
    x0, y0, x1, y1 = (int(round(v)) for v in b)
    if x0 < -20 or x1 > W + 20 or y1 > H + 10 or y0 < -40:
        return False
    # the sprite's lower half (where it meets the ground) must be entirely free; the top may overhang a little
    ym = int((y0 + y1) / 2)
    region = blocked[max(0, ym):max(0, min(H, y1)), max(0, x0):max(0, min(W, x1))]
    if region.size and region.any():
        return False
    top = blocked[max(0, y0):max(0, min(H, ym)), max(0, x0):max(0, min(W, x1))]
    if top.size and top.mean() > 0.15:
        return False
    return not any(overlaps(b, p["box"]) for p in placed)


def main():
    rnd = random.Random(7)
    blocked = blocked_mask()
    placed = []

    def try_place(names, candidates, count, scale_range):
        n = 0
        for x, y in candidates:
            if n >= count:
                break
            name = rnd.choice(names)
            scale = rnd.uniform(*scale_range)
            b = box(name, x, y, scale)
            if fits(b, blocked, placed):
                placed.append({"name": name, "x": x, "y": y, "scale": round(scale, 3), "flip": rnd.random() < 0.5, "box": b})
                n += 1
        return n

    # 1. a small graveyard on the walled ground: loose rows of gravestones
    gx0, gy0, gx1, gy1 = GRAVEYARD
    rows = [(x + (r % 2) * 30 + rnd.uniform(-16, 16), y + rnd.uniform(-9, 9))
            for r, y in enumerate(range(gy0 + 40, gy1, 50)) for x in range(gx0 + 10, gx1, 74)]
    rnd.shuffle(rows)
    try_place(["rock_1", "rock_2"], rows, 6, (0.9, 1.1))

    # 2. pumpkins by the cabin porch and along the road
    cx, cy = screen(13, 10)
    near_cabin = [(cx + dx, cy + dy) for dx, dy in [(-120, 30), (-150, 70), (110, 70), (-95, 75), (140, 30)]]
    try_place(["bush_2", "bush_3"], near_cabin, 2, (0.9, 1.0))
    along = []
    for (ax, ay), (bx, by) in zip(WAYPOINTS[1:], WAYPOINTS[2:]):
        for t in (0.3, 0.7):
            x, y = screen(ax + (bx - ax) * t, ay + (by - ay) * t)
            along += [(x + 0, y + 72), (x - 95, y + 30), (x + 95, y + 30), (x, y - 50)]
    rnd.shuffle(along)
    try_place(["bush_1", "bush_2", "bush_3"], along, 4, (0.85, 1.0))

    # 3. creepy trees: forest edges first, then inward, never in the open middle
    cand = [(x + rnd.uniform(-12, 12), y + rnd.uniform(-8, 8)) for y in range(40, H + 10, 26) for x in range(10, W, 34)]
    centre = (640, 380)
    def edginess(p):
        dx, dy = (p[0] - centre[0]) / 640, (p[1] - centre[1]) / 360
        return max(abs(dx), abs(dy)) + rnd.uniform(0, 0.12)
    cand = [p for p in cand if edginess(p) > 0.55]
    cand.sort(key=edginess, reverse=True)
    try_place(["tree_1", "tree_2", "tree_3", "tree_4"], cand, 34, (0.9, 1.15))

    out = []
    for p in placed:
        gx, gy = grid(p["x"], p["y"])
        out.append({"name": p["name"], "gx": round(gx, 3), "gy": round(gy, 3), "scale": p["scale"], "flip": p["flip"]})
    ts = ("// Generated by tools/layout_scenery.py: where each scenery sprite stands on the painted haunted map.\n"
          "// Re-run the tool after changing the map, the road or the plots.\n"
          "import type { SpriteName } from './sprites';\n\n"
          "export const SCENERY_LAYOUT: { name: SpriteName; gx: number; gy: number; scale: number; flip: boolean }[] = [\n"
          + "".join(f"  {json.dumps(o)},\n".replace('"name"', "name").replace('"gx"', "gx").replace('"gy"', "gy")
                    .replace('"scale"', "scale").replace('"flip"', "flip").replace('"', "'") for o in out)
          + "];\n")
    (ROOT / "src/sceneryLayout.ts").write_text(ts)
    print(len(out), "sprites:", {k: sum(1 for o in out if o["name"].startswith(k)) for k in ("tree", "bush", "rock")})

    if len(sys.argv) > 1:
        im = Image.open(ROOT / "public/sprites/era1/map_ground.jpg").convert("RGBA").resize((W, H))
        shade = Image.fromarray((blocked * 90).astype(np.uint8))
        im.paste((255, 0, 0, 255), mask=shade)
        for p in sorted(placed, key=lambda p: p["y"]):
            w, h = SIZES[p["name"]]
            spr = Image.open(ROOT / f"public/sprites/era1/{p['name']}.png").convert("RGBA")
            spr = spr.resize((max(1, int(w * p["scale"])), max(1, int(h * p["scale"]))))
            if p["flip"]:
                spr = spr.transpose(Image.FLIP_LEFT_RIGHT)
            oy = ORIGIN_Y[p["name"].split("_")[0]]
            im.alpha_composite(spr, (int(p["x"] - spr.width / 2), int(p["y"] - spr.height * oy)))
        im.save(sys.argv[1])


if __name__ == "__main__":
    main()
