"""Installs the picked Era 3 sounds and music into the game.

usage: python tools/era3/build_audio.py <batch dir> <picks.json>
  <batch dir>: the staged assets/batches/era3-audio folder (<id>_v<n>.flac takes)
  <picks.json>: the listening page's export, {"picks": {id: [n, ...]}, "redo": {...}} (or just the picks object)
Writes public/sounds/era3/<id>_<n>.mp3 (effects and stingers) and music_*.mp3 (seamless loops), then sets each
e3_* sound's variant count in src/audio.ts and marks the music loops available.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from process_audio import decode, encode, fade_out, peak_normalise, rms_normalise, seamless_loop, trim  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'sounds' / 'era3'
STINGERS = {'wave_clear', 'victory', 'defeat'}
MUSIC = {'music_build', 'music_wave'}


def main():
    batch = Path(sys.argv[1])
    picks = json.loads(Path(sys.argv[2]).read_text())
    picks = picks.get('picks', picks)
    OUT.mkdir(parents=True, exist_ok=True)
    counts = {}
    for sid, takes in picks.items():
        takes = takes if isinstance(takes, list) else [takes]
        if not takes: continue
        if sid in MUSIC:
            clip = rms_normalise(trim(decode(batch / f'{sid}_v{takes[0]}.flac'), -55))
            encode(seamless_loop(clip), OUT / f'{sid}.mp3', quality=4)
            counts[sid] = 'loop'
            continue
        for i, n in enumerate(takes, start=1):
            clip = trim(decode(batch / f'{sid}_v{n}.flac'), -55 if sid in STINGERS else -45)
            clip = fade_out(rms_normalise(clip, -16), 400) if sid in STINGERS else fade_out(peak_normalise(clip))
            encode(clip, OUT / f'{sid}_{i}.mp3', quality=4)
        counts[sid] = len(takes)
    # registry: variants for every e3_<id> sound, music loops available
    p = ROOT / 'src' / 'audio.ts'
    s = p.read_text()
    for sid, c in counts.items():
        if c == 'loop':
            s = re.sub(rf"(e3_{sid}: \{{ available: )(true|false)", r"\1true", s)
        else:
            s = re.sub(rf"(  e3_{sid}: \{{ variants: )\d+", rf"\g<1>{c}", s)
    p.write_text(s)
    for sid, c in counts.items(): print(f'{sid}: {c}')


if __name__ == '__main__':
    main()
