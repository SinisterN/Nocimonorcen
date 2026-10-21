"""Finds the best seamless loop in a WAN take: the frame pair (a, b) at least `min_len` apart whose images differ least,
so frames a..b-1 loop with almost no jump. Frame 0 is skipped (it's the source still, often slightly crisper).

usage: python tools/anim/loop_range.py <take folder under assets/animations> [min_len] [frames=33]
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

TAKES = Path('/mnt/user-data/uploads/dev/game-asset-mcp/assets/animations')
folder, min_len = sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 16
N = int(sys.argv[3]) if len(sys.argv) > 3 else 33
im = Image.open(TAKES / folder / 'sheet.png').convert('RGBA')
cell = 128
sh = np.asarray(im.resize((im.width // 4, im.height // 4)), dtype=np.float32)
frames = [sh[(i // 8) * cell:(i // 8 + 1) * cell, (i % 8) * cell:(i % 8 + 1) * cell] for i in range(N)]
best = []
for a in range(1, N):
    for b in range(a + min_len, N):          # play a..b-1; frame b would come next, so it should match frame a
        best.append((np.abs(frames[a] - frames[b]).mean(), a, b))
best.sort()
for d, a, b in best[:5]: print(f'play {a}..{b - 1}  (picks: first {a}, end {b}), jump {d:.2f}')
