"""Builds the era 2 game sounds from the picked takes: plain sounds are cleaned up, multi-part sounds are
layered from their picked parts (e.g. drill then plate clang = build), music is made into seamless loops.

usage: python tools/build_era2_audio.py <staged batches dir>   (the folder holding era2-audio/ and era2-audio-redo/)
Writes public/sounds/era2/<id>_<n>.mp3 (and music_*.mp3) and prints the variant counts for the audio registry.
"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from process_audio import (SR, decode, encode, fade_out, peak_normalise, rms_normalise,  # noqa: E402
                           seamless_loop, trim)

OUT = Path(__file__).resolve().parent.parent / "public" / "sounds" / "era2"
A, R = "era2-audio", "era2-audio-redo"
SYN = "synth"  # sounds made with tools/synth_scifi.py, kept in art/era2/synth/<name>_<n>.mp3
SYNTH_DIR = Path(__file__).resolve().parent.parent / "art" / "era2"

# id -> list of variants; each variant is one take, or several parts played one after the other
# (part, start offset in seconds relative to the end of the previous part; negative = overlap)
SFX = {
    "mg_turret_shot": [[(A, "mg_turret_shot", 1, 0)]],
    "rocket_launch": [[(R, "rocket_launch", 4, 0)],
                      # bazooka: the grenade's sharp pop right under the start of the rocket whoosh
                      [(R, "grenade_explosion", 6, 0), (R, "rocket_launch", 4, -0.95)]],
    "rocket_explosion": [[(A, "rocket_explosion", 4, 0)]],
    "railgun_fire": [[(R, "rail_charge", 5, 0), (R, "rail_zap", 3, -0.08)], [(R, "railgun_fire", 5, 0)],
                     [(SYN, "railgun_synth", 3, 0)]],
    "build": [[(R, "power_drill", 2, 0), (R, "metal_plate", 6, -0.1)]],
    "repair": [[(R, "ratchet", 6, 0), (R, "welding_torch", 6, -0.05)]],
    "structure_hit": [[(A, "structure_hit", 2, 0)]],
    "tower_destroyed": [[(R, "tower_destroyed", 5, 0)], [(R, "tower_destroyed_b", 6, 0)]],
    "robot_gunfire": [[(R, "minigun_spin", 6, 0), (R, "minigun_fire", 6, -0.05)],
                      [(SYN, "minigun_spin_synth", 1, 0), (R, "minigun_fire", 6, -0.05)]],
    "droid_beep": [[(SYN, "droid_beep_synth", 3, 0)]],
    "robot_death": [[(A, "robot_death", 3, 0)]],
    "droid_explode": [[(R, "bomb_explosion", 1, 0)], [(R, "grenade_explosion", 6, 0)]],
    "walker_stomp": [[(R, "hydraulic_hiss", 6, 0), (R, "walker_clank", 3, -0.12)],
                     [(SYN, "hydraulic_synth", 2, 0), (R, "walker_clank", 3, -0.12)]],
    "walker_rocket": [[(A, "walker_rocket", 4, 0)]],
    "walker_death": [[(A, "walker_death", 3, 0)]],
    "factory_spawn": [[(R, "factory_door", 1, 0), (R, "factory_alarm", 1, -0.6)]],
    "base_hit": [[(A, "base_hit", 3, 0)]],
}
STINGERS = {"wave_clear": (R, 1), "victory": (A, 2), "defeat": (A, 3)}
MUSIC = {"music_build": (R, 3), "music_wave": (R, 4)}


def take(root, batch, name, n, threshold=-45.0):
    if batch == SYN:
        return trim(decode(SYNTH_DIR / SYN / f"{name}_{n}.mp3"), threshold)
    return trim(decode(root / batch / f"{name}_v{n}.flac"), threshold)


def layer(parts, root):
    """Plays the parts one after another; each part's offset is relative to the end of the previous one."""
    out = np.zeros((0, 2), np.float32)
    for batch, name, n, offset in parts:
        clip = peak_normalise(take(root, batch, name, n))
        start = max(0, len(out) + int(SR * offset))
        end = start + len(clip)
        if end > len(out):
            out = np.concatenate([out, np.zeros((end - len(out), 2), np.float32)])
        out[start:end] += clip
    return out


def main():
    root = Path(sys.argv[1])
    OUT.mkdir(parents=True, exist_ok=True)
    for sid, variants in SFX.items():
        for i, parts in enumerate(variants, start=1):
            encode(fade_out(peak_normalise(layer(parts, root))), OUT / f"{sid}_{i}.mp3", quality=4)
        print(f"{sid}: {len(variants)}")
    for sid, (batch, n) in STINGERS.items():
        encode(fade_out(rms_normalise(take(root, batch, sid, n, -55), -16), 400), OUT / f"{sid}_1.mp3", quality=4)
        print(f"{sid}: 1")
    for sid, (batch, n) in MUSIC.items():
        encode(seamless_loop(rms_normalise(take(root, batch, sid, n, -55))), OUT / f"{sid}.mp3", quality=4)
        print(f"{sid}: loop")


if __name__ == "__main__":
    main()
