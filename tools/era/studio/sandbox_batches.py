"""Splits a game build into publish batches for an Era Studio sandbox artifact: one publish may carry at most 255
files and 64 MB, so a ~450-file build goes up in two or three publishes to the same artifact. index.html is the page
itself (passed as file_path), so it isn't in any batch.

usage: python tools/era/studio/sandbox_batches.py <dist dir>
prints JSON: [[relative path, ...], ...]  (publish batch 1 with file_path dist/index.html and no url, the rest with
the artifact's url; always pass root = the dist dir)
"""
import json, sys
from pathlib import Path

MAX_FILES, MAX_BYTES = 240, 60 * 1024 * 1024

dist = Path(sys.argv[1])
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
