"""Ballista bowstring fix, robust: erase the old strings along their known segments (only where the line is thin),
then draw the new strings from the bow tips back to a catch on the stock."""
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd

def seg_dist(xx, yy, a, b):
    ax, ay = a; bx, by = b; dx, dy = bx - ax, by - ay
    t = np.clip(((xx - ax) * dx + (yy - ay) * dy) / (dx * dx + dy * dy), 0, 1)
    return np.hypot(xx - ax - t * dx, yy - ay - t * dy)

def fix(src, segs, bowL, bowR, nut, out):
    arr = np.asarray(Image.open(src).convert('RGBA')).copy()
    H, W = arr.shape[:2]; yy, xx = np.mgrid[0:H, 0:W]
    a = arr[..., 3] > 60
    thick = nd.binary_opening(a, structure=np.ones((9, 9)))
    near = np.zeros_like(a)
    for p, q in segs:
        near |= seg_dist(xx, yy, p, q) < 8
    kill = near & ~thick
    arr[kill, 3] = 0
    img = Image.fromarray(arr, 'RGBA'); d = ImageDraw.Draw(img)
    for t in (bowL, bowR):
        d.line([t, nut], fill=(58, 52, 48, 255), width=4)
        d.line([t, nut], fill=(150, 140, 125, 255), width=2)
    img.save(out)
    return kill.sum()

if __name__ == '__main__':
    S = '/mnt/user-data/uploads/dev/game-asset-mcp/assets/era3/gate2/'
    for v in (1, 2, 3):
        print(v, fix(S + f'e3_tower_ballista_l2_v{v}.png', [((166, 78), (590, 118)), ((134, 120), (167, 328))], (163, 326), (591, 116), (548, 322), f'l2_fixed_v{v}.png'))
    print('l1', fix(S + 'e3_tower_ballista_v2.png', [((145, 74), (512, 108)), ((116, 104), (147, 287))], (145, 284), (513, 103), (478, 281), 'l1_fixed.png'))
