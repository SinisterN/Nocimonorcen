"""Level 3 ballista: the level 2 ballista enlarged on its mount and loaded with two bolts side by side."""
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd

def mask_of(arr):
    H, W = arr.shape[:2]; yy, xx = np.mgrid[0:H, 0:W]
    mx = arr[..., :3].max(2); mn = arr[..., :3].min(2); sat = (mx - mn) / np.maximum(mx, 1)
    a = arr[..., 3] > 30
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    wood = (r > g + 20) & (g > b + 5) & (sat > 0.3)
    metal = (sat < 0.3) & (mx < 140)
    m = a & ((yy < 330) | ((yy < 520) & (wood | metal)))
    m = nd.binary_opening(m, iterations=2)
    lab, n = nd.label(m); sz = nd.sum(m, lab, range(1, n + 1))
    return nd.binary_closing(lab == (int(np.argmax(sz)) + 1), iterations=2)

def build(src, out, scale, pivot=(470, 330), tip=(98, 72), rear=(620, 378), bowL=(163, 326), bowR=(591, 116), nut=(548, 322)):
    img = Image.open(src).convert('RGBA'); arr = np.asarray(img).astype(np.int32)
    H, W = arr.shape[:2]; yy, xx = np.mgrid[0:H, 0:W]
    m = mask_of(arr)
    layer = np.zeros_like(arr); layer[m] = arr[m]
    # the second bolt: the stock's front section (tip to the bow), laid alongside the first
    d = np.array(rear, float) - np.array(tip, float); L = np.linalg.norm(d); d /= L
    t = (xx - tip[0]) * d[0] + (yy - tip[1]) * d[1]
    perp = (xx - tip[0]) * -d[1] + (yy - tip[1]) * d[0]
    sm = m & (t > -10) & (t < 0.5 * L) & (np.abs(perp) < 20)
    bolt = np.zeros_like(arr); bolt[sm] = arr[sm]; bolt[..., :3] = (bolt[..., :3] * 0.82).astype(np.int32)
    n = np.array([d[1], -d[0]]) * 24                          # toward the back of the view
    lay = Image.new('RGBA', img.size)
    bi = Image.fromarray(bolt.astype(np.uint8), 'RGBA'); lay.paste(bi, (int(n[0]), int(n[1])), bi)
    lay.alpha_composite(Image.fromarray(layer.astype(np.uint8), 'RGBA'))
    # enlarge about the mount head, then lay it over the tower (the bigger ballista covers the old one)
    px, py = pivot; Wn, Hn = round(W * scale), round(H * scale)
    big = lay.resize((Wn, Hn), Image.LANCZOS)
    pad = 160
    canvas = Image.new('RGBA', (W + 2 * pad, H + 2 * pad))
    base = arr.copy(); base[(yy < 335) | ((xx < 240) & (yy < 420)), 3] = 0           # the old ballista goes (above the parapet it is over open sky)
    canvas.alpha_composite(Image.fromarray(base.astype(np.uint8), 'RGBA'), (pad, pad))
    ox, oy = round(px - px * scale) + pad, round(py - py * scale) + pad
    canvas.alpha_composite(big, (ox, oy))
    S = lambda p: (ox + p[0] * scale, oy + p[1] * scale)
    dr = ImageDraw.Draw(canvas)
    for tp in (bowL, bowR):
        dr.line([S(tp), S(nut)], fill=(58, 52, 48, 255), width=5)
        dr.line([S(tp), S(nut)], fill=(150, 140, 125, 255), width=2)
    canvas = canvas.crop(canvas.getbbox()); canvas.save(out)

if __name__ == '__main__':
    for i, s in enumerate((1.18, 1.3, 1.42), 1):
        build('l2_fixed_v2.png', f'l3_big_v{i}.png', s)
