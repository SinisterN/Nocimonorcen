"""Mixes a layered sound's parts into its takes: take n = part 1 take n + part 2 take n ..., each part placed at its
offset (seconds) with its gain (dB), then trimmed, peak-normalised and faded, written as <out dir>/<id>_v<n>.flac.

usage: python tools/era/studio/layer_sound.py <job.json> <folder with the parts' takes> <out dir>
  job.json: the job from `studio.py job` (its `layers`); part takes are <part id>_v<n>.<ext> in the folder
prints the takes made, as JSON {"<id>": {"<n>": "<file>"}}
"""
import json, sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from process_audio import SR, decode, fade_out, peak_normalise, trim  # noqa: E402
import subprocess  # noqa: E402


def find(folder, pid, n):
    hits = sorted(Path(folder).rglob(f'{pid}_v{n}.*'))
    return hits[0] if hits else None


def mix(parts):
    """parts: [(audio, at seconds, gain dB)] -> one stereo clip."""
    end = max(int(at * SR) + len(a) for a, at, _ in parts)
    out = np.zeros((end, 2), np.float32)
    for a, at, g in parts:
        i = int(at * SR)
        out[i:i + len(a)] += a * (10 ** (g / 20))
    return fade_out(peak_normalise(trim(out, -50)), 80)


def main():
    job, folder, out = json.loads(Path(sys.argv[1]).read_text()), Path(sys.argv[2]), Path(sys.argv[3])
    out.mkdir(parents=True, exist_ok=True)
    made = {}
    for sid, layers in (job.get('layers') or {}).items():
        n = 1
        while True:
            files = [find(folder, l['part'], n) for l in layers]
            if not all(files): break
            clip = mix([(decode(f), l['at'], l['gain']) for f, l in zip(files, layers)])
            dst = out / f'{sid}_v{n}.flac'
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-i', '-', str(dst)],
                           input=np.clip(clip, -1, 1).astype(np.float32).tobytes(), check=True)
            made.setdefault(sid, {})[str(n)] = str(dst)
            n += 1
    print(json.dumps(made, indent=1))


if __name__ == '__main__':
    main()
