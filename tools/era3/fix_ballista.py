"""Fixes the picked ballista's bowstring (it was tied to the bolt tip) and builds the twin version."""
import sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd

def strings(arr):
    a = arr[..., 3] > 100
    op = nd.binary_opening(a, structure=np.ones((7, 7)))
    mx = arr[..., :3].max(2); mn = arr[..., :3].min(2); sat = (mx - mn) / np.maximum(mx, 1)
    cand = a & ~op & (sat < 0.3)
    yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
    cand &= yy < 420
    lab, n = nd.label(nd.binary_dilation(cand, iterations=2))
    sz = nd.sum(cand, lab, range(1, n + 1))
    keep = np.isin(lab, [i + 1 for i, s in enumerate(sz) if s > 400])
    return nd.binary_dilation(keep & a, iterations=1)

def fix(img, tipL, tipR, nut):
    arr = np.asarray(img.convert('RGBA')).copy()
    m = strings(arr)
    arr[m, 3] = 0
    out = Image.fromarray(arr, 'RGBA')
    d = ImageDraw.Draw(out)
    for t in (tipL, tipR):
        d.line([t, nut], fill=(58, 52, 48, 255), width=4)
        d.line([t, nut], fill=(150, 140, 125, 255), width=2)
    return out

def twin(img, shift):
    arr = np.asarray(img).astype(np.int32)
    H, W = arr.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W]
    mx = arr[..., :3].max(2); mn = arr[..., :3].min(2); sat = (mx - mn) / np.maximum(mx, 1)
    a = arr[..., 3] > 30
    stone = (sat < 0.18) & (mx > 120)
    metal = (sat < 0.25) & (mx < 115)
    m = a & ((yy < 395) | (metal & (yy < 520))) & ~(stone & (yy > 300))
    m = nd.binary_opening(m, iterations=1)
    lab, n = nd.label(m)
    if n:
        sz = nd.sum(m, lab, range(1, n + 1))
        m = lab == (int(np.argmax(sz)) + 1)          # just the ballista itself, no stray parapet bits
        m = nd.binary_fill_holes(m)
    layer = np.zeros_like(arr); layer[m] = arr[m]
    layer[..., :3] = (layer[..., :3] * 0.88).astype(np.int32)       # a touch darker: it sits behind
    lay = Image.fromarray(layer.astype(np.uint8), 'RGBA')
    out = Image.new('RGBA', img.size)
    out.alpha_composite(img)
    sh = Image.new('RGBA', img.size); sh.alpha_composite(lay, (max(0, shift[0]), 0) if False else (0, 0))
    moved = Image.new('RGBA', img.size); moved.paste(lay, shift, lay)
    res = Image.new('RGBA', img.size)
    res.alpha_composite(moved)            # twin behind
    res.alpha_composite(img)              # original in front
    return res

if __name__ == '__main__':
    S = '/mnt/user-data/uploads/dev/game-asset-mcp/assets/era3/gate2/'
    for v in (1, 2, 3):
        im = Image.open(S + f'e3_tower_ballista_l2_v{v}.png').convert('RGBA')
        f = fix(im, (163, 326), (591, 116), (548, 322))
        f.save(f'l2_fixed_v{v}.png')
        twin(f, (40, -62)).save(f'l3_twin_v{v}.png')
