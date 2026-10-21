"""frames dir (frame_###.png) or a take sheet.png → looping animated webp preview for a gate page.
usage: python tools/era3/anim_preview.py <dir|sheet.png> <out.anim.webp> [--frames 33] [--fps 16] [--size 240] [--bg]"""
import argparse
from pathlib import Path
from PIL import Image

ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('out')
ap.add_argument('--frames', type=int, default=33); ap.add_argument('--fps', type=int, default=16)
ap.add_argument('--size', type=int, default=240); ap.add_argument('--start', type=int, default=0); ap.add_argument('--end', type=int, default=0, help='exclusive; 0 = all')
ap.add_argument('--pause', type=int, default=0, help='ms to hold the last frame')
o = ap.parse_args()
src = Path(o.src)
if src.is_dir():
    fr = [Image.open(p).convert('RGBA') for p in sorted(src.glob('frame_*.png'))]
else:
    sh = Image.open(src).convert('RGBA')
    fr = [sh.crop(((i % 8) * 512, (i // 8) * 512, (i % 8 + 1) * 512, (i // 8 + 1) * 512)) for i in range(o.frames)]
fr = fr[o.start:o.end or None]
fr = [f.resize((o.size, o.size), Image.LANCZOS) for f in fr]
d = [1000 // o.fps] * len(fr); d[-1] += o.pause
fr[0].save(o.out, save_all=True, append_images=fr[1:], duration=d, loop=0, lossless=False, quality=80)
print(o.out, len(fr))
