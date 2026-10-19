"""Synthesises shotgun blasts: a sharp crack, a dense powder burst, a low boom and a forest echo tail.

usage: python tools/synth_shotgun.py <out_dir> [variants]
Writes shotgun_synth_<n>.mp3 files to listen to; copy a favourite to public/sounds/era1/boomstick_shot_1.mp3.
"""
import subprocess
import sys
from pathlib import Path

import numpy as np

SR = 44100


def one_pole_lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def env(n, attack_ms, tau_ms):
    t = np.arange(n) / SR
    a = np.clip(t / (attack_ms / 1000), 0, 1)
    return a * np.exp(-t / (tau_ms / 1000))


def blast(rng, length=1.4, boom_hz=(120, 42), crack_tau=10, body_tau=70, tail_tau=420, brightness=2400):
    n = int(SR * length)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    # crack: the supersonic snap, very bright and very short
    crack = np.diff(noise, prepend=0) * env(n, 0.3, crack_tau) * 0.9
    # body: the powder burst, a mid-heavy noise blast
    body = one_pole_lowpass(noise, brightness) * env(n, 0.8, body_tau) * 2.2
    # boom: a falling low sine thump you feel more than hear
    f = boom_hz[1] + (boom_hz[0] - boom_hz[1]) * np.exp(-t / 0.05)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 2, 160) * 1.1
    # tail: dark rumble, then two softer echoes coming back off the trees
    tail = one_pole_lowpass(rng.standard_normal(n), 700) * env(n, 10, tail_tau) * 0.9
    dry = crack + body + boom
    out = dry + tail
    for delay, gain in ((0.21, 0.28), (0.47, 0.13)):
        d = int(SR * delay)
        echo = one_pole_lowpass(np.concatenate([np.zeros(d), dry[:-d]]), 1200) * gain
        out += echo
    out = np.tanh(out * 1.6)  # a little saturation for weight
    return out / np.abs(out).max() * 10 ** (-1 / 20)


def encode(mono, path, rng):
    # slightly different left/right tails give a bit of width
    right = mono.copy()
    k = int(SR * 0.012)
    right[k:] = 0.85 * mono[k:] + 0.15 * mono[:-k]
    stereo = np.stack([mono, right], axis=1).astype(np.float32)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ac", "2", "-ar", str(SR), "-i", "-",
                    "-codec:a", "libmp3lame", "-q:a", "3", str(path)], input=stereo.tobytes(), check=True)


def main():
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    count = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    presets = [
        dict(),                                                                 # balanced
        dict(boom_hz=(100, 36), body_tau=90, brightness=1800, tail_tau=520),    # heavier, darker
        dict(crack_tau=14, brightness=3200, body_tau=55, tail_tau=360),         # sharper, snappier
        dict(boom_hz=(140, 50), body_tau=110, tail_tau=600, brightness=2000),   # big, long echo
    ]
    for i in range(count):
        rng = np.random.default_rng(100 + i)
        encode(blast(rng, **presets[i % len(presets)]), out / f"shotgun_synth_{i + 1}.mp3", rng)
        print(out / f"shotgun_synth_{i + 1}.mp3")


if __name__ == "__main__":
    main()
