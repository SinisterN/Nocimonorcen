"""Finds the best seamless loop in a WAN take: the frame pair (a, b) at least `min_len` apart whose images differ least,
so frames a..b-1 loop with almost no jump. Frame 0 is skipped (it's the source still, often slightly crisper).

usage: python tools/anim/loop_range.py <take folder under assets/animations> [min_len]
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

TAKES = Path('/mnt/user-data/uploads/dev/game-asset-mcp/assets/animations')
folder, min_len = sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 16
sh = np.asarray(Image.open(TAKES / folder / 'sheet.png').convert('RGBA').resize((1024, 640)), dtype=np.float32)
cell = 128
frames = [sh[(i // 8) * cell:(i // 8 + 1) * cell, (i % 8) * cell:(i % 8 + 1) * cell] for i in range(33)]
best = []
for a in range(1, 33):
    for b in range(a + min_len, 33):          # play a..b-1; frame b would come next, so it should match frame a
        best.append((np.abs(frames[a] - frames[b]).mean(), a, b))
best.sort()
for d, a, b in best[:5]: print(f'play {a}..{b - 1}  (picks: first {a}, end {b}), jump {d:.2f}')
