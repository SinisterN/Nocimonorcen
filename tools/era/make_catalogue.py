"""Builds tools/era/behaviours.json: the built-in tower and enemy behaviours a new era can copy, with their stats,
art sizes and a plain description for the Era Studio page.

usage (from the repo root):
  npx vite-node tools/era/dump_builtins.ts > /tmp/builtins.json
  npx vite-node tools/era/dump_builtin_art.ts > /tmp/builtin_art.json
  python tools/era/make_catalogue.py /tmp/builtins.json /tmp/builtin_art.json
"""
import json, sys
from pathlib import Path

TOWER_TEXT = {
    'arrow': ('Sharpshooter', 'Steady single-target shots at medium range.', 'A second shooter fires at another target'),
    'mg': ('Blaster', 'Short-range spread of pellets: great against crowds, weak against armour.', 'Shots pierce up to 2 more enemies'),
    'mortar': ('Artillery', 'Lobbed shells with area damage at long range.', 'Shells leave burning ground'),
    'gun': ('Rapid turret', 'Very fast weak shots: shreds light enemies, struggles against armour.', 'A forcefield shields the turret'),
    'rocket': ('Rocket battery', 'Area damage rockets at long range.', 'Rockets chase their target'),
    'rail': ('Piercing beam', 'Slow, heavy beam that hits every enemy in a line.', 'A second beam fires at another target'),
    'rifle': ('Cheap shooter', 'Cheap, fast single shots; weak against armour.', 'A second gunner fires at another target'),
    'ballista': ('Heavy bolts', 'Long-range bolts that punch through armour.', 'Fires two piercing bolts at once'),
    'killer': ('Fighter crew', 'Fighters swing out on grapple lines to strike big enemies up close.', 'One fighter fires a long-range rocket lance'),
}
ENEMY_TEXT = {
    'grunt': ('Shambler', 'Basic walker; stumbles now and then.'),
    'fast': ('Sprinter', 'Small and quick, runs in packs with short pauses.'),
    'armored': ('Armoured', 'Slow and armoured; braces against hits.'),
    'shaman': ('Healer', 'Heals the enemies around it.'),
    'brute': ('Boss: brute', 'Huge, slow and armoured final boss.'),
    'robot': ('Gunner', 'Stops to shoot at towers.'),
    'droid': ('Kamikaze', 'Fast; explodes when it reaches a tower.'),
    'walker': ('Heavy walker', 'Armoured, fires rockets at towers.'),
    'shield': ('Shield bearer', 'Blocks shots from the front, shoots towers.'),
    'tank': ('Boss: siege tank', 'Heavily armoured boss that shells towers.'),
    'titan_s': ('Small giant', 'Basic giant; plods along the road.'),
    'titan_m': ('Medium giant', 'Tougher giant.'),
    'brawler': ('Brawler', 'Charges into towers and throws rocks at them.'),
    'wallwalker': ('Wall crawler', 'Slow and armoured; strays off the road into towers.'),
    'colossus': ('Boss: armoured giant', 'Armour bar first, then health; charges each tower once.'),
}
# enemy behaviours with extra animations besides walk, walk_back, attack and death
EXTRA_ANIMS = {'brawler': ['charge']}
# behaviours whose look depends on extra figures from their original era (shown to requesters as a note)
BORROWED = {
    'arrow': 'Its archers come from the Haunted Forest.',
    'rifle': 'Its level 3 second gunner comes from the Fallen Village.',
    'killer': 'Its fighters come from the Fallen Village.',
}

def main():
    b = json.loads(Path(sys.argv[1]).read_text())
    art = json.loads(Path(sys.argv[2]).read_text())
    out = {'towers': {}, 'enemies': {}}
    for k, d in b['towers'].items():
        label, desc, l3 = TOWER_TEXT[k]
        out['towers'][k] = {
            'label': label, 'description': desc, 'level3': {'name': d['trait']['name'], 'text': l3},
            'from_era': d['era'], 'example': d['name'], 'note': BORROWED.get(k),
            'stats': {x: d[x] for x in ('rank', 'cost', 'range', 'minRange', 'fireDelay', 'damage', 'splash', 'projectile', 'flightTime')
                      if x in d} | {x: d[x] for x in ('pellets', 'beam', 'pierceLine', 'armorMult', 'crew') if x in d},
            'takes_damage': d.get('hp') is not None,
            'art': art['towers'].get(k),
        }
    for k, d in b['enemies'].items():
        label, desc = ENEMY_TEXT[k]
        front, back = art['enemies'].get(k), art['enemies'].get(k + '_back')
        out['enemies'][k] = {
            'label': label, 'description': desc, 'boss': bool(d.get('boss')), 'from_era': d['era'], 'example': d.get('name') or k,
            'stats': {x: d[x] for x in ('hp', 'speed', 'armor', 'reward', 'leakDamage', 'size') if x in d} | ({'shell': d['shell']} if 'shell' in d else {}),
            'anims': ['walk', 'walk_back', 'attack', 'death'] + EXTRA_ANIMS.get(k, []),
            'art': {'front': front, 'back': back},
        }
    Path(__file__).with_name('behaviours.json').write_text(json.dumps(out, indent=1))
    print(len(out['towers']), 'towers,', len(out['enemies']), 'enemies')

if __name__ == '__main__':
    main()
