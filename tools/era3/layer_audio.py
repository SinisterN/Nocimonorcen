"""Assembles Era 3's multi-part sounds from separately generated parts, as candidate takes to listen to.

usage: python tools/era3/layer_audio.py <redo batch dir> <out dir>
Writes <out>/<id>_mix<n>.flac. Each part is trimmed, levelled and placed at an absolute start time (seconds);
a gain (dB) balances it in the mix. The finished mix is peak-normalised.
"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from process_audio import SR, decode, encode, fade_out, peak_normalise, trim  # noqa: E402

# id -> list of mixes; a mix is a list of (part, take, start s, gain dB)
# In the game: charge_impact uses take v2 (not a mix), base_hit uses mix 4, wave_start uses mix 2.
MAX_SECONDS = {'structure_hit': 1.1}
MIXES = {
    # the shoulder hits: a deep boom, the timber gives a moment later, then stones come down
    'charge_impact': [
        [('impact_boom', 1, 0.0, 0), ('timber_crack', 1, 0.06, -4), ('rubble_fall', 1, 0.35, -7)],
        [('impact_boom', 2, 0.0, 0), ('timber_crack', 2, 0.06, -4), ('rubble_fall', 2, 0.35, -7)],
        [('impact_boom', 3, 0.0, 0), ('timber_crack', 3, 0.06, -4), ('rubble_fall', 3, 0.35, -7)],
        [('impact_boom', 4, 0.0, 0), ('timber_crack', 4, 0.06, -4), ('rubble_fall', 4, 0.35, -7)],
    ],
    # the chapel is hit: the door gives, wood splinters, the cracked bell rings, the crowd inside cries out
    'base_hit': [
        [('door_smash', n, 0.0, 0), ('wood_splinter', n, 0.12, -5), ('cracked_bell', n, 0.25, -6), ('crowd_gasp', n, 0.45, -8)]
        for n in (1, 2, 3, 4)
    ],
    # a tower struck: the same deep boom as the charge, shorter, with a little rubble (picked: none yet)
    'structure_hit': [
        [('impact_boom', n, 0.0, 0), ('rubble_fall', n, 0.08, -9)] for n in (1, 2, 3, 4)
    ],
    # the alarm bell with the war horn underneath
    'wave_start': [
        [('wave_start', n, 0.0, 0), ('war_horn', n, 0.4, -6)] for n in (1, 2)
    ],
}


def db(x):
    return 10 ** (x / 20)


def mix(parts, root):
    out = np.zeros((0, 2), np.float32)
    for name, n, start, gain in parts:
        clip = peak_normalise(trim(decode(root / f'{name}_v{n}.flac'))) * db(gain)
        a = int(start * SR)
        if a + len(clip) > len(out):
            out = np.concatenate([out, np.zeros((a + len(clip) - len(out), 2), np.float32)])
        out[a:a + len(clip)] += clip
    return fade_out(peak_normalise(out), 120)


def main():
    root, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    for sid, mixes in MIXES.items():
        for i, parts in enumerate(mixes, start=1):
            m = mix(parts, root)
            if sid in MAX_SECONDS:
                m = fade_out(m[:int(MAX_SECONDS[sid] * SR)], 250)
            encode(m, out / f'{sid}_mix{i}.mp3', quality=4)
        print(sid, len(mixes), 'mixes')


if __name__ == '__main__':
    main()
