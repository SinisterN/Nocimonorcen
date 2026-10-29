"""Splits a game build into publish batches for an Era Studio sandbox artifact: one publish may carry at most 255
files and 64 MB, so a ~450-file build goes up in two or three publishes to the same artifact. index.html is the page
itself (passed as file_path), so it isn't in any batch.

usage: python tools/era/studio/sandbox_batches.py <dist dir> [--keep <era id>]
  --keep: first removes every other era's pictures and sounds from the build (era 1's shared art stays); build it
          with VITE_SANDBOX_ERA=<era id> so its menu offers only that era. An artifact version holds at most 511
          files; the script stops with an error when the build would still be over 500.
prints JSON: [[relative path, ...], ...]  (publish batch 1 with file_path dist/index.html and no url, the rest with
the artifact's url; always pass root = the dist dir)
"""
import json, re, shutil, sys
from pathlib import Path

MAX_FILES, MAX_BYTES = 240, 60 * 1024 * 1024

dist = Path(sys.argv[1])
if '--keep' in sys.argv:
    keep = {'era1', sys.argv[sys.argv.index('--keep') + 1]}
    for top in ('sprites', 'sounds'):
        for d in (dist / top).glob('era*'):
            if re.fullmatch(r'era\d+', d.name) and d.name not in keep: shutil.rmtree(d)
total = sum(1 for p in dist.rglob('*') if p.is_file())
if total > 500: sys.exit(f'the build has {total} files; an artifact holds at most 511 (keep it under 500)')
batches, cur, size = [], [], 0
for f in sorted(p for p in dist.rglob('*') if p.is_file() and p.name != 'index.html' or (p.is_file() and p.parent != dist)):
    rel = f.relative_to(dist).as_posix()
    if rel == 'index.html': continue
    n = f.stat().st_size
    if cur and (len(cur) >= MAX_FILES or size + n > MAX_BYTES):
        batches.append(cur); cur, size = [], 0
    cur.append(rel); size += n
if cur: batches.append(cur)
print(json.dumps(batches))
