"""Own construction diagram of a twin-track torsion ballista, aimed toward the viewer so the front wall with its two
bolt holes faces the camera. Only the faces that point at the viewer are drawn, nearest parts last."""
import numpy as np
from PIL import Image, ImageDraw

F = np.array([0.894, 0.447])          # forward: toward the viewer, down-right
L = np.array([-0.894, 0.447])         # lateral (+y is the near, down-left side)
U = np.array([0.0, -1.0])
O = np.array([0.0, 0.0]); S = 1.0

def P(x, y, z): return tuple(O + S * (x * F + y * L + z * U))

WOOD, WOOD_D, WOOD_L = (150, 98, 52), (104, 64, 32), (186, 132, 78)
ROPE, ROPE_D = (214, 192, 140), (150, 126, 82)
IRON, IRON_D = (120, 122, 128), (70, 72, 78)
OUT = (34, 24, 16)

def box(d, x0, x1, y0, y1, z0, z1, top, side, front):
    c = P
    d.polygon([c(x0, y0, z1), c(x1, y0, z1), c(x1, y1, z1), c(x0, y1, z1)], fill=top, outline=OUT)
    d.polygon([c(x0, y1, z0), c(x1, y1, z0), c(x1, y1, z1), c(x0, y1, z1)], fill=side, outline=OUT)   # near side
    d.polygon([c(x1, y0, z0), c(x1, y1, z0), c(x1, y1, z1), c(x1, y0, z1)], fill=front, outline=OUT)  # front

def line(d, a, b, col, w): d.line([P(*a), P(*b)], fill=OUT, width=w + 2); d.line([P(*a), P(*b)], fill=col, width=w)

def wheel(d, x, y, z, r):
    pts = [P(x, y + r * np.cos(t), z + r * np.sin(t)) for t in np.linspace(0, 2 * np.pi, 24)]
    d.polygon(pts, outline=OUT, fill=WOOD_D)
    for t in np.linspace(0, np.pi, 4, endpoint=False):
        line(d, (x, y + 1.3 * r * np.cos(t), z + 1.3 * r * np.sin(t)), (x, y - 1.3 * r * np.cos(t), z - 1.3 * r * np.sin(t)), WOOD_L, 4)

def draw(canvas):
    d = ImageDraw.Draw(canvas)
    # pedestal and swivel plate
    box(d, -90, 90, -90, 90, 0, 110, WOOD_L, WOOD_D, WOOD)
    box(d, -105, 105, -105, 105, 110, 126, IRON, IRON_D, IRON)
    # the far track first, then the near one: track, groove, winch at the rear, slider, bolt
    for y in (-48, 48):
        wheel(d, -200, y, 160, 24)
        line(d, (-200, y, 160), (-160, y, 150), IRON_D, 4)
        box(d, -190, 150, y - 15, y + 15, 132, 152, WOOD_L, WOOD_D, WOOD)
        line(d, (-185, y, 152.5), (148, y, 152.5), WOOD_D, 3)
        box(d, -95, -55, y - 17, y + 17, 152, 166, IRON, IRON_D, IRON)
        line(d, (-60, y, 160), (150, y, 160), (120, 84, 50), 7)
    # torsion frame: sill, top beam, posts, rope bundles in the outer bays, a front wall with two square holes
    box(d, 150, 205, -165, 165, 110, 132, WOOD_L, WOOD_D, WOOD)
    for y in (-120, 120):
        for k in range(4):
            z = 136 + k * 16
            box(d, 160, 195, y - 26, y + 26, z, z + 12, ROPE, ROPE_D, ROPE)
    for y0, y1 in ((-165, -150), (-90, -66), (-18, 18), (66, 90), (150, 165)):
        box(d, 150, 205, y0, y1, 132, 200, WOOD_L, WOOD_D, WOOD)
    for y0, y1 in ((-66, -30), (30, 66)):                                  # wall panels around each hole
        box(d, 196, 205, y0, y1, 132, 142, WOOD, WOOD_D, WOOD)
        box(d, 196, 205, y0, y1, 178, 200, WOOD, WOOD_D, WOOD)
    for y in (-48, 48):
        box(d, 196, 205, y - 30, y - 18, 142, 178, WOOD, WOOD_D, WOOD)
        box(d, 196, 205, y + 18, y + 30, 142, 178, WOOD, WOOD_D, WOOD)
        hole = [P(205, y - 18, 142), P(205, y + 18, 142), P(205, y + 18, 178), P(205, y - 18, 178)]
        d.polygon(hole, fill=(26, 18, 12), outline=OUT)
    box(d, 150, 205, -165, 165, 200, 222, WOOD_L, WOOD_D, WOOD)
    # throwing arms out of the spring bundles, bowstrings back to the sliders
    for y, s in ((-120, -1), (120, 1)):
        tip = (110, y + s * 110, 168)
        line(d, (178, y, 168), tip, WOOD, 10)
        line(d, tip, (-70, 48 * s, 160), (60, 50, 40), 2)
    # bolts coming out of the holes toward the viewer
    for y in (-48, 48):
        line(d, (205, y, 160), (330, y, 160), (120, 84, 50), 8)
        d.polygon([P(330, y - 10, 160), P(372, y, 160), P(330, y + 10, 160)], fill=IRON, outline=OUT)

if __name__ == '__main__':
    S = 2.0
    O[:] = [700, 640]
    can = Image.new('RGBA', (1500, 1200)); draw(can)
    can = can.crop(can.getbbox())
    pad = 40
    out = Image.new('RGBA', (can.width + 2 * pad, can.height + 2 * pad), (255, 255, 255, 255)); out.alpha_composite(can, (pad, pad))
    out.convert('RGB').save('machine_guide.png'); print(out.size)
