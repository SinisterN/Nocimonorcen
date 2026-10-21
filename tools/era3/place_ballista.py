"""Seats the rendered twin-track ballista on the empty-deck level 2 tower; the near battlements are drawn back over
its base so it stands inside the parapet."""
import numpy as np
from PIL import Image

def below_front_edge(W, H, L, B, R, lift):
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    def edge(a, b):
        t = (xx - a[0]) / (b[0] - a[0])
        return a[1] + t * (b[1] - a[1])
    y_edge = np.where(xx <= B[0], edge(L, B), edge(B, R))
    return yy > y_edge - lift

def build(tower_p, mach_p, out_p, k, foot_m, foot_t, deck_L, deck_B, deck_R):
    tower = Image.open(tower_p).convert('RGBA'); mach = Image.open(mach_p).convert('RGBA')
    m = mach.resize((round(mach.width * k), round(mach.height * k)), Image.LANCZOS)
    pad = 300
    W, H = tower.width + 2 * pad, tower.height + 2 * pad
    can = Image.new('RGBA', (W, H)); can.alpha_composite(tower, (pad, pad))
    can.alpha_composite(m, (round(foot_t[0] - foot_m[0] * k) + pad, round(foot_t[1] - foot_m[1] * k) + pad))
    # the near battlements in front of the machine
    tw = Image.new('RGBA', (W, H)); tw.alpha_composite(tower, (pad, pad))
    front = below_front_edge(W, H, (deck_L[0] + pad, deck_L[1] + pad), (deck_B[0] + pad, deck_B[1] + pad),
                             (deck_R[0] + pad, deck_R[1] + pad), lift=34)
    t = np.asarray(tw); c = np.asarray(can).copy()
    mx = t[..., :3].max(2).astype(int); mn = t[..., :3].min(2).astype(int)
    sat = (mx - mn) / np.maximum(mx, 1)
    wood = (t[..., 0].astype(int) > t[..., 2].astype(int) + 30) & (sat > 0.3)    # deck planks stay behind the machine
    sel = front & (t[..., 3] > 0) & ~wood
    c[sel] = t[sel]
    out = Image.fromarray(c, 'RGBA'); out.crop(out.getbbox()).save(out_p)

if __name__ == '__main__':
    S = '/mnt/user-data/uploads/dev/game-asset-mcp/assets/era3/gate2/'
    for v in (1, 2, 3, 4):
        build(S + 'e3_ballista_tower_empty_v1.png', S + f'e3_twin_machine_v{v}.png', f'l3_twin_v{v}.png',
              0.42, (400, 690), (520, 430), (300, 450), (500, 570), (710, 460))
