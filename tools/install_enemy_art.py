"""Installs picked enemy art (back views and new enemies): trims each picture, scales it to a target on-screen
height (twice that in the file) and prints the sprite registry entries for src/sprites.ts.

usage: python tools/install_enemy_art.py <picks.json>
picks.json: {"<sprite name>": {"src": "<png>", "era": "era1"|"era2", "height": <px on screen>,
              "facesLeft": bool, "gait": "stomp"|"scuttle"|"roll"|null}}
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent


def main():
    picks = json.loads(Path(sys.argv[1]).read_text())
    for name, p in picks.items():
        im = Image.open(p["src"]).convert("RGBA")
        a = np.array(im)[..., 3].copy()
        a[a < 24] = 0
        ys, xs = np.nonzero(a)
        im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
        h = p["height"]
        w = round(im.width * h / im.height)
        out = ROOT / "public" / "sprites" / p["era"] / f"{name}.png"
        im.resize((w * 2, h * 2), Image.LANCZOS).save(out)
        extra = ""
        if p.get("facesLeft"):
            extra += ", facesLeft: true"
        if p.get("gait"):
            extra += f", gait: '{p['gait']}'"
        print(f"  {name}: {{ key: 'sp_{name}', file: 'sprites/{p['era']}/{name}.png', origin: [0.5, 0.985], display: [{w}, {h}]{extra} }},")


if __name__ == "__main__":
    main()
