"""Installs picked hero voice takes for era 2 and 3, levelled like the era 1 lines.

usage: python tools/voice/install_voice.py <batch dir> <picks.json>
picks.json: {"picks": {"e2_kill_1": [2], ...}} (the listening page's export). Each take goes to
public/sounds/era<N>/voice/<event>_<n>.mp3, then src/audio.ts lists the recorded lines per era.
"""
import json, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from process_audio import decode, encode, fade_out, rms_normalise, trim  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]

def main():
    batch, picks = Path(sys.argv[1]), json.loads(Path(sys.argv[2]).read_text())
    picks = picks.get('picks', picks)
    for pid, takes in picks.items():
        m = re.match(r'e(\d)_(\w+_\d+)$', pid)
        if not m or not takes: continue
        audio = fade_out(rms_normalise(trim(decode(batch / f'{pid}_v{takes[0]}.flac'), -50), -18), 120)
        out = ROOT / 'public' / 'sounds' / f'era{m.group(1)}' / 'voice' / f'{m.group(2)}.mp3'
        out.parent.mkdir(parents=True, exist_ok=True)
        encode(audio, out, quality=5)
    # list every recording that exists per era in src/audio.ts
    p = ROOT / 'src' / 'audio.ts'; s = p.read_text()
    for era in ('era2', 'era3'):
        files = sorted(f.stem for f in (ROOT / 'public' / 'sounds' / era / 'voice').glob('*.mp3'))
        ids = ', '.join(f"'e{era[3]}_{f}'" for f in files)
        s = re.sub(rf"  {era}: \[[^\]]*\],[^\n]*", f"  {era}: [{ids}],", s)
    p.write_text(s)
    print('installed', len(picks))

if __name__ == '__main__':
    main()
