"""Synthesised sci-fi sound effects for era 2 (the ones a sound model gets wrong): droid warning beeps,
railgun charge-and-zap, minigun barrel spin-up and a hydraulic hiss.

usage: python tools/synth_scifi.py <out_dir>
Writes <name>_synth_<n>.mp3 files to listen to.
"""
import subprocess
import sys
from pathlib import Path

import numpy as np

SR = 44100
rng = np.random.default_rng(7)


def t_(sec):
    return np.arange(int(SR * sec)) / SR


def env_adsr(n, a=0.005, r=0.05):
    e = np.ones(n)
    na, nr = int(SR * a), int(SR * r)
    e[:na] = np.linspace(0, 1, na)
    e[-nr:] *= np.linspace(1, 0, nr)
    return e


def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def highpass(x, cutoff):
    return x - lowpass(x, cutoff)


def norm(x, db=-1.0):
    return x / (np.abs(x).max() + 1e-9) * 10 ** (db / 20)


def save(x, path):
    st = np.stack([x, x], 1).astype(np.float32)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ac", "2", "-ar", str(SR), "-i", "-",
                    "-codec:a", "libmp3lame", "-q:a", "3", str(path)], input=st.tobytes(), check=True)
    print(path)


def beep(freq, dur, square=True):
    t = t_(dur)
    w = np.sign(np.sin(2 * np.pi * freq * t)) if square else np.sin(2 * np.pi * freq * t)
    return lowpass(w * 0.6, 6000) * env_adsr(len(t), 0.002, 0.01)


def droid_beeps(variant):
    """Warning beeps that speed up and rise in pitch, ending in a long high tone."""
    out = []
    gaps = [0.18, 0.14, 0.11, 0.08, 0.06, 0.045, 0.035][: 5 + variant % 3]
    f0 = [1200, 1500, 900][variant % 3]
    for i, g in enumerate(gaps):
        out += [beep(f0 * (1 + i * 0.07), 0.05, square=variant != 2), np.zeros(int(SR * g))]
    out.append(beep(f0 * 1.6, 0.28, square=variant != 2))
    return norm(np.concatenate(out), -3)


def railgun(variant):
    """Rising electric charge whine with crackle, then a hard electric zap with a ringing tail."""
    charge_s = [0.75, 0.6, 0.9][variant % 3]
    t = t_(charge_s)
    f = 300 + (2600 + 600 * variant) * (t / charge_s) ** 1.6
    whine = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.35 * np.sin(4 * np.pi * np.cumsum(f) / SR)
    crackle = (rng.random(len(t)) < 0.002 + 0.02 * (t / charge_s) ** 2) * rng.standard_normal(len(t)) * 3
    charge = (whine * 0.5 + highpass(crackle, 2000)) * np.linspace(0.05, 1, len(t)) ** 1.5
    z = t_(0.9)
    noise = rng.standard_normal(len(z))
    crack = highpass(noise, 1500) * np.exp(-z / 0.03) * 1.6
    zap_f = 1800 * np.exp(-z / 0.08) + 120
    zap = np.sign(np.sin(2 * np.pi * np.cumsum(zap_f) / SR)) * np.exp(-z / 0.12) * 0.8
    ring = np.sin(2 * np.pi * 3200 * z) * np.exp(-z / 0.25) * 0.15
    boom = np.sin(2 * np.pi * np.cumsum(90 * np.exp(-z / 0.1) + 40) / SR) * np.exp(-z / 0.18)
    shot = lowpass(crack + zap, 9000) + ring + boom
    return norm(np.concatenate([charge, shot]), -1)


def minigun_spin(variant):
    """Barrels spinning up: a rising motor whine with a rattling click rate that speeds up."""
    dur = [0.8, 0.6, 1.0][variant % 3]
    t = t_(dur)
    k = (t / dur) ** 0.7
    motor_f = 120 + 900 * k
    motor = np.sin(2 * np.pi * np.cumsum(motor_f) / SR) * 0.4 + 0.2 * np.sign(np.sin(2 * np.pi * np.cumsum(motor_f * 2) / SR))
    click_rate = 8 + 70 * k
    phase = np.cumsum(click_rate) / SR
    clicks = (np.diff(np.floor(phase), prepend=0) > 0).astype(float)
    clicks = np.convolve(clicks, np.exp(-np.arange(200) / 25) * rng.standard_normal(200), mode="same")
    return norm(lowpass(motor, 3000) * np.linspace(0.3, 1, len(t)) + highpass(clicks, 1200) * 0.8, -3)


def hydraulic(variant):
    """Pneumatic hiss: filtered noise burst that swells and dies, with a low piston thunk at the start."""
    dur = [0.45, 0.35, 0.6][variant % 3]
    t = t_(dur)
    hiss = highpass(rng.standard_normal(len(t)), [2500, 3500, 1800][variant % 3])
    e = np.minimum(1, t / 0.03) * np.exp(-t / (dur * 0.45))
    thunk = np.sin(2 * np.pi * np.cumsum(140 * np.exp(-t / 0.05) + 50) / SR) * np.exp(-t / 0.06)
    return norm(hiss * e * 0.7 + thunk * 0.8, -3)


def main():
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    for name, fn in (("droid_beep", droid_beeps), ("railgun", railgun), ("minigun_spin", minigun_spin), ("hydraulic", hydraulic)):
        for v in range(3):
            save(fn(v), out / f"{name}_synth_{v + 1}.mp3")


if __name__ == "__main__":
    main()
