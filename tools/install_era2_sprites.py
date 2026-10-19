"""Installs the picked era 2 sprites: trims each one, scales it to twice its on-screen size, and works out where it
touches the ground. Prints the entries for src/sprites.ts.

usage: python tools/install_era2_sprites.py <staged batches dir>
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "public" / "sprites" / "era2"

# name: (source file, on-screen width, ground anchor rule)
#   'slab'  = stands on an isometric slab or pad: anchor at the slab's centre (a quarter of the width above the bottom)
#   'feet'  = anchor at the lowest pixel (characters, props)
#   'pad'   = flat build pad: anchor in the middle
SPRITES = {
    "e2_tower_gun": ("era2-redo-c/mg_l1_gunner3_v2.png", 92, "slab"),
    "e2_tower_gun_l2": ("era2-round3/mg_l2_v4.png", 98, "slab"),
    "e2_tower_gun_l3": ("era2-dome/mg_l3_dome_v6.png", 104, "slab"),
    "e2_tower_rocket": ("era2-redo-b/rocket_l1_s4.png", 84, "slab"),
    "e2_tower_rocket_l2": ("era2-round5/rocket_l2_v3.png", 104, "slab"),
    "e2_tower_rocket_l3": ("era2-round5/rocket_l3_v3.png", 104, "slab"),
    "e2_tower_rail": ("era2-art/tower_rail_l1_v1.png", 84, "slab"),
    "e2_tower_rail_l2": ("era2-art/tower_rail_l2_v1.png", 86, "slab"),
    "e2_tower_rail_l3": ("era2-round3/rail_l3_dual_v1.png", 90, "slab"),
    "enemy_robot": ("era2-art/enemy_robot_v4.png", 52, "feet"),
    "enemy_droid": ("era2-redo-b/droid_tracks_s3.png", 40, "feet"),
    "enemy_walker": ("era2-art/enemy_walker_v4.png", 66, "feet"),
    "enemy_walker_walk1": ("era2-round3/walker_stride_a_v3.png", 66, "feet"),
    "enemy_walker_walk2": ("era2-round3/walker_stride_b_v3.png", 66, "feet"),
    "e2_factory": ("era2-art/factory_v1.png", 170, "slab"),
    "e2_police": ("era2-redo-b/police_s1.png", 150, "slab"),
    "e2_plot": ("era2-art/plot_v2.png", 70, "pad"),
    "e2_plot_high": ("era2-art/plot_high_v2.png", 84, "slab"),
    "e2_prop_skulls": ("era2-art/prop_skulls_v1.png", 60, "feet"),
    "e2_prop_searchlight": ("era2-art/prop_searchlight_v1.png", 46, "feet"),
    "e2_prop_wreck": ("era2-art/prop_wreck_v1.png", 66, "feet"),
    "e2_prop_rubble": ("era2-art/prop_rubble_v3.png", 62, "feet"),
    "e2_prop_pit": ("era2-redo-b/pit_s2.png", 48, "feet"),
}


# animation frames drawn at the same scale as their first frame
SAME_SCALE_AS = {"enemy_walker_walk1": "enemy_walker", "enemy_walker_walk2": "enemy_walker"}


def main():
    root = Path(sys.argv[1])
    OUT.mkdir(parents=True, exist_ok=True)
    meta = {}
    scale_of = {}  # source pixels -> on-screen pixels, so animation frames can share their base frame's scale
    for name, (src, width, rule) in SPRITES.items():
        im = Image.open(root / src).convert("RGBA")
        a = np.array(im)[..., 3]
        a[a < 24] = 0  # ignore faint fringe from background removal when trimming
        ys, xs = np.nonzero(a)
        im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
        base = SAME_SCALE_AS.get(name)
        f = scale_of[base] if base else width / im.width
        scale_of[name] = f
        width = round(im.width * f)
        w2 = width * 2
        h2 = round(im.height * f * 2)
        im.resize((w2, h2), Image.LANCZOS).save(OUT / f"{name}.png")
        h = h2 / 2
        if rule == "pad":
            oy = 0.5
        elif rule == "slab":
            oy = max(0.5, 1 - (width * 0.25) / h)
        else:
            oy = 0.985
        meta[name] = {"display": [width, round(h)], "origin": [0.5, round(oy, 3)]}
        print(f"{name}: {meta[name]}")
    # animation frames are drawn at one size in game: pad them to a shared canvas, aligned at the feet
    groups = {}
    for frame, base in SAME_SCALE_AS.items():
        groups.setdefault(base, [base]).append(frame)
    for names in groups.values():
        ims = [Image.open(OUT / f"{n}.png") for n in names]
        W, H = max(i.width for i in ims), max(i.height for i in ims)
        for n, i in zip(names, ims):
            c = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            c.alpha_composite(i, ((W - i.width) // 2, H - i.height))
            c.save(OUT / f"{n}.png")
            meta[n] = {"display": [W // 2, H // 2], "origin": [0.5, 0.985]}
    (OUT / "meta.json").write_text(json.dumps(meta, indent=1))


if __name__ == "__main__":
    main()
