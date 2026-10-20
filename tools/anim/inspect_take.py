"""Checks connector takes before picking: best loop stretch (walks), feet drift, and a strip of every 4th frame.
usage: python tools/anim/inspect_take.py <strip.png> <take folder> [<take folder> ...]"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

def frames(folder):
    sh = Image.open(Path(folder) / 'sheet.png').convert('RGBA'); n = 0; out = []
    cols, rows = sh.width // 512, sh.height // 512
    for i in range(cols * rows):
        f = sh.crop(((i % cols) * 512, (i // cols) * 512, (i % cols + 1) * 512, (i // cols + 1) * 512))
        if f.getbbox(): out.append(f)
    return out

rows = []
for folder in sys.argv[2:]:
    fr = frames(folder); n = len(fr)
    a = [np.array(f.resize((128, 128))).astype(float) for f in fr]
    step = np.mean([np.abs(a[k] - a[k + 1]).mean() for k in range(n - 1)])
    best = min(((np.abs(a[x] - a[y]).mean(), x, y) for x in range(0, 12) for y in range(x + 12, n)), default=(0, 0, n))
    feet = [f.getbbox()[3] for f in fr]
    print(f'{Path(folder).name}: {n} frames, mean step {step:.1f}, best loop {best[1]}-{best[2]} (diff {best[0]:.1f}), feet {min(feet)}-{max(feet)}')
    pick = fr[::4]
    strip = Image.new('RGB', (len(pick) * 160, 160), (236, 232, 222))
    for i, f in enumerate(pick):
        t = f.resize((160, 160)); strip.paste(t, (i * 160, 0), t)
    rows.append(strip)
W = max(r.width for r in rows); out = Image.new('RGB', (W, 160 * len(rows)), (236, 232, 222))
for i, r in enumerate(rows): out.paste(r, (0, i * 160))
out.save(sys.argv[1])
