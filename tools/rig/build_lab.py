"""Builds the enemy rig lab page from the game's own rigs and poses.

usage: python tools/rig/build_lab.py <out.html>
Bundles src/rig/poses.ts (the same moves the game uses) and embeds every rig in public/sprites/*/rig/.
"""
import base64, json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
R = ROOT / 'public' / 'sprites'
H = {'grunt': 54, 'fast': 60, 'armored': 62, 'shaman': 62, 'brute': 112, 'robot': 52, 'droid': 48, 'walker': 83, 'shield': 56, 'tank': 96}
NAMES = {'grunt': 'Zombie', 'fast': 'Crawler', 'armored': 'Knight', 'shaman': 'Shaman', 'brute': 'Grave Brute', 'robot': 'Robot',
         'droid': 'Droid', 'walker': 'Walker', 'shield': 'Shield robot', 'tank': 'Siege Tank'}
WHOLE = {'grunt': 'era1/enemy_grunt_walk0.png', 'fast': 'era1/enemy_fast_walk0.png', 'armored': 'era1/enemy_armored_walk0.png',
         'shaman': 'era1/enemy_shaman.png', 'brute': 'era1/enemy_brute.png', 'robot': 'era2/enemy_robot.png', 'droid': 'era2/enemy_droid.png',
         'walker': 'era2/enemy_walker.png', 'shield': 'era2/enemy_shield.png', 'tank': 'era2/enemy_tank.png'}


def uri(p):
    return 'data:image/png;base64,' + base64.b64encode(Path(p).read_bytes()).decode()


def main():
    poses = subprocess.run(['npx', 'esbuild', 'src/rig/poses.ts', '--bundle', '--format=iife', '--global-name=Poses', '--minify'],
                           cwd=ROOT, capture_output=True, text=True, check=True).stdout
    rigs = {}
    for k, h in H.items():
        era = WHOLE[k].split('/')[0]
        d = R / era / 'rig' / k
        rig = json.loads((d / 'rig.json').read_text())
        rig['img'] = {n: uri(d / f'{n}.png') for n in rig['order']}
        rig.update(height=h, label=NAMES[k], era=era, whole=uri(R / WHOLE[k]))
        rigs[k] = rig
    t = (ROOT / 'tools/rig/rig_lab_template.html').read_text()
    Path(sys.argv[1]).write_text(t.replace('__POSES__', poses).replace('__RIGS__', json.dumps(rigs)))


if __name__ == '__main__':
    main()
