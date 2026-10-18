"""Turns picked FLAC takes into game-ready MP3s in public/sounds/era1/.

usage: python tools/process_audio.py <batch_dir> <picks.json>
picks.json: {"arrow_shot": [1, 3], "music_build": [2], ...}   (take numbers, as on the listening page)
Sound effects: trimmed silence, peak-normalised, short fade-out -> <id>_1.mp3, <id>_2.mp3 ...
Stingers (wave_clear, victory, defeat): loudness-normalised, fade-out.
Music loops (music_*): loudness-normalised and made seamless by crossfading the tail into the head -> <id>.mp3
Prints the variants counts to paste into src/audio.ts.
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

SR = 44100
OUT = Path(__file__).resolve().parent.parent / "public" / "sounds" / "era1"


def decode(path: Path) -> np.ndarray:
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


def encode(audio: np.ndarray, path: Path, quality: int):
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ac", "2", "-ar", str(SR), "-i", "-",
         "-codec:a", "libmp3lame", "-q:a", str(quality), str(path)],
        input=np.clip(audio, -1, 1).astype(np.float32).tobytes(), check=True,
    )


def trim(audio: np.ndarray, threshold_db=-45.0, pad_ms=15) -> np.ndarray:
    level = np.abs(audio).max(axis=1)
    loud = np.where(level > 10 ** (threshold_db / 20))[0]
    if not len(loud):
        return audio
    pad = int(SR * pad_ms / 1000)
    return audio[max(0, loud[0] - pad): min(len(audio), loud[-1] + pad * 4)]


def fade_out(audio: np.ndarray, ms=60) -> np.ndarray:
    n = min(len(audio), int(SR * ms / 1000))
    audio[-n:] *= np.linspace(1, 0, n)[:, None]
    return audio


def peak_normalise(audio: np.ndarray, peak_db=-1.0) -> np.ndarray:
    peak = np.abs(audio).max()
    return audio * (10 ** (peak_db / 20) / peak) if peak > 0 else audio


def rms_normalise(audio: np.ndarray, target_db=-18.0, peak_db=-1.0) -> np.ndarray:
    rms = np.sqrt(np.mean(audio ** 2))
    if rms > 0:
        audio = audio * (10 ** (target_db / 20) / rms)
    peak = np.abs(audio).max()
    limit = 10 ** (peak_db / 20)
    return audio * (limit / peak) if peak > limit else audio


def seamless_loop(audio: np.ndarray, crossfade_s=2.0) -> np.ndarray:
    """Blends the last crossfade_s seconds into the first ones, so the end flows straight back into the start."""
    x = int(SR * crossfade_s)
    if len(audio) < x * 3:
        return audio
    head, body, tail = audio[:x], audio[x:-x], audio[-x:]
    ramp = np.linspace(0, 1, x)[:, None]
    blended = head * np.sqrt(ramp) + tail * np.sqrt(1 - ramp)
    return np.concatenate([blended, body])


def main():
    batch, picks_file = Path(sys.argv[1]), Path(sys.argv[2])
    picks = json.loads(picks_file.read_text())
    counts = {}
    for sound_id, takes in picks.items():
        for i, take in enumerate(takes, start=1):
            src = batch / f"{sound_id}_v{take}.flac"
            if not src.exists():
                src = batch / f"{sound_id}.flac"
            audio = decode(src)
            if sound_id.startswith("music_"):
                audio = seamless_loop(rms_normalise(trim(audio, -55)))
                encode(audio, OUT / f"{sound_id}.mp3", quality=4)
                counts[sound_id] = "available"
                break
            if sound_id in ("wave_clear", "victory", "defeat"):
                audio = fade_out(rms_normalise(trim(audio, -55), -16), 400)
            else:
                audio = fade_out(peak_normalise(trim(audio)))
            encode(audio, OUT / f"{sound_id}_{i}.mp3", quality=4)
            counts[sound_id] = i
        print(f"{sound_id}: {counts[sound_id]}")
    (OUT / "picks.json").write_text(json.dumps(picks, indent=2))


if __name__ == "__main__":
    main()
