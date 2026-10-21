"""Own construction diagram of a twin-track torsion ballista, drawn in the tower's isometric view, pasted onto the
level 2 tower in place of its crossbow. Used only as a shape guide for the image model."""
import numpy as np
from PIL import Image, ImageDraw

F = np.array([-0.863, -0.506])        # forward on screen (same aim as the level 2 crossbow)
L = np.array([-0.894, 0.447])         # lateral on screen
U = np.array([0.0, -1.0])
O = np.array([476.0, 470.0])          # mount point on the deck
S = 0.6
ZOFF = 80

def P(x, y, z): return tuple(O + S * (x * F + y * L + (z + ZOFF) * U))

WOOD, WOOD_D, WOOD_L = (150, 98, 52), (104, 64, 32), (186, 132, 78)
ROPE, ROPE_D = (214, 192, 140), (150, 126, 82)
IRON, IRON_D = (120, 122, 128), (70, 72, 78)
OUT = (34, 24, 16)

def box(d, x0, x1, y0, y1, z0, z1, top, side, front):
    c = lambda x, y, z: P(x, y, z)
    faces = [
        ([c(x0, y0, z1), c(x1, y0, z1), c(x1, y1, z1), c(x0, y1, z1)], top),
        ([c(x0, y1, z0), c(x1, y1, z0), c(x1, y1, z1), c(x0, y1, z1)], side),
        ([c(x1, y0, z0), c(x1, y1, z0), c(x1, y1, z1), c(x1, y0, z1)], front),
        ([c(x0, y0, z0), c(x1, y0, z0), c(x1, y0, z1), c(x0, y0, z1)], side),
    ]
    for poly, col in faces: d.polygon(poly, fill=col, outline=OUT)

def line(d, a, b, col, w): d.line([P(*a), P(*b)], fill=OUT, width=w + 2); d.line([P(*a), P(*b)], fill=col, width=w)

def wheel(d, x, y, z, r):
    pts = [P(x, y + r * np.cos(t), z + r * np.sin(t)) for t in np.linspace(0, 2 * np.pi, 24)]
    d.polygon(pts, outline=OUT, fill=WOOD_D)
    for t in np.linspace(0, np.pi, 4, endpoint=False):
        line(d, (x, y + 1.25 * r * np.cos(t), z + 1.25 * r * np.sin(t)), (x, y - 1.25 * r * np.cos(t), z - 1.25 * r * np.sin(t)), WOOD_L, 4)

def draw(canvas):
    d = ImageDraw.Draw(canvas)
    # pedestal and swivel
    box(d, -70, 70, -70, 70, -80, 70, WOOD_L, WOOD_D, WOOD)
    box(d, -55, 55, -55, 55, 70, 86, IRON, IRON_D, IRON)
    # rear winches (far side first)
    for y in (48, -48):
        wheel(d, -175, y, 112, 22)
    # two parallel launch tracks with grooves
    for y in (48, -48):
        box(d, -190, 250, y - 15, y + 15, 92, 112, WOOD_L, WOOD_D, WOOD)
        line(d, (-185, y, 112.5), (245, y, 112.5), WOOD_D, 3)
    # torsion frame at the front: base, top beam, posts, rope spring bundles
    box(d, 150, 205, -150, 150, 70, 92, WOOD_L, WOOD_D, WOOD)
    for y in (140, 75, 20, -20, -75, -140):
        box(d, 160, 195, y - 9, y + 9, 92, 210, WOOD_L, WOOD_D, WOOD)
    for y in (108, -108):
        for k in range(6):
            z = 100 + k * 18
            box(d, 166, 189, y - 22, y + 22, z, z + 14, ROPE, ROPE_D, ROPE)
    box(d, 150, 205, -150, 150, 210, 232, WOOD_L, WOOD_D, WOOD)
    # throwing arms out of the springs, strings back to the sliders
    for y, s in ((108, 1), (-108, -1)):
        tip = (110, y + s * 120, 160)
        line(d, (178, y, 160), tip, WOOD, 9)
        for ty in (48, -48):
            if (ty > 0) == (s > 0):
                line(d, tip, (-70, ty, 118), (60, 50, 40), 2)
    # sliders with trigger claws and the two bolts in the tracks
    for y in (48, -48):
        box(d, -95, -55, y - 17, y + 17, 112, 126, IRON, IRON_D, IRON)
        line(d, (-60, y, 120), (320, y, 120), (120, 84, 50), 7)
        tip = [P(320, y - 9, 120), P(358, y, 120), P(320, y + 9, 120)]
        d.polygon(tip, fill=IRON, outline=OUT)

if __name__ == '__main__':
    src = Image.open('l2_fixed_v2.png').convert('RGBA'); arr = np.asarray(src).copy()
    H, W = arr.shape[:2]; yy, xx = np.mgrid[0:H, 0:W]
    from big2 import mask_of
    from scipy import ndimage as nd
    old = nd.binary_dilation(mask_of(arr.astype(np.int32)), iterations=3)
    deck = arr[440:520, 400:560, :3].reshape(-1, 3).mean(0).astype(np.uint8)   # plank colour
    under = old & (yy >= 335)
    arr[under, :3] = deck; arr[under, 3] = 255                  # fill where the tripod stood with deck planks
    arr[(yy < 335) | ((xx < 240) & (yy < 420)), 3] = 0          # remove the old crossbow
    pad = 120
    can = Image.new('RGBA', (W + 2 * pad, H + 2 * pad))
    can.alpha_composite(Image.fromarray(arr, 'RGBA'), (pad, pad))
    O[:] = O + pad
    draw(can)
    can = can.crop(can.getbbox())
    bg = Image.new('RGBA', can.size, (255, 255, 255, 255)); bg.alpha_composite(can)
    bg.convert('RGB').save('twin_guide.png'); print(bg.size)
