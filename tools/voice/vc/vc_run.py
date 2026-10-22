"""Turns recordings into the hero's voice with Chatterbox VC, keeping the recording's timing and emphasis.

usage: python vc_run.py <recordings folder> <output folder> <target voice wav>
Reads every .wav .mp3 .m4a .flac .ogg .webm in the recordings folder (any phone or PC recorder app works) and writes
<output>/<same name>.flac. Name the recordings after the line, e.g. e2_baseHit_4.m4a, or e2_baseHit_4_b.m4a for a
second try. Files that were already converted and haven't changed since are skipped.
"""
import os
import sys
import tempfile

import av
import numpy as np
import soundfile as sf
import torch

EXTS = ('.wav', '.mp3', '.m4a', '.flac', '.ogg', '.webm', '.aac')


def decode(path):
    """Any audio file -> mono float32 at 24 kHz, via PyAV (it bundles ffmpeg)."""
    with av.open(path) as f:
        rs = av.AudioResampler(format='flt', layout='mono', rate=24000)
        chunks = []
        for frame in f.decode(audio=0):
            for out in rs.resample(frame):
                chunks.append(out.to_ndarray().reshape(-1))
        for out in rs.resample(None):
            chunks.append(out.to_ndarray().reshape(-1))
    a = np.concatenate(chunks).astype(np.float32)
    peak = np.abs(a).max() or 1.0
    return a / peak * 0.9


def main():
    src, out, target = sys.argv[1:4]
    os.makedirs(out, exist_ok=True)
    todo = []
    for name in sorted(os.listdir(src)):
        if not name.lower().endswith(EXTS):
            continue
        dst = os.path.join(out, os.path.splitext(name)[0] + '.flac')
        if os.path.exists(dst) and os.path.getmtime(dst) > os.path.getmtime(os.path.join(src, name)):
            continue
        todo.append((name, dst))
    if not todo:
        print('[vc] nothing new to convert')
        return
    from chatterbox.vc import ChatterboxVC
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    model = ChatterboxVC.from_pretrained(device)
    model.set_target_voice(target)
    print(f'[vc] model ready on {device}', flush=True)
    for name, dst in todo:
        try:
            audio = decode(os.path.join(src, name))
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
                sf.write(tmp.name, audio, 24000)
            wav = model.generate(tmp.name)
            os.unlink(tmp.name)
            sf.write(dst, wav.squeeze(0).numpy(), model.sr, format='FLAC')
            print(f'[vc] {name} -> {os.path.basename(dst)}', flush=True)
        except Exception as e:  # keep going with the others
            print(f'[vc] FAILED {name}: {e}', flush=True)


if __name__ == '__main__':
    main()
