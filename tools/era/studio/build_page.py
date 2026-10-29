"""Builds the Era Studio page: the template with the behaviour catalogue (and, once the relay exists, its link and
key) filled in. The output is what gets published as the studio artifact.

usage: python tools/era/studio/build_page.py <out.html> [relay url] [relay key]
"""
import json, sys
from pathlib import Path

HERE = Path(__file__).parent
CAT = json.loads((HERE.parent / 'behaviours.json').read_text())
ERA_NAMES = {'era1': 'the Haunted Forest', 'era2': 'the Machine Wasteland', 'era3': 'the Fallen Village'}


def nice(example, era):
    name = example if example[:1].isupper() else example.replace('_', ' ').title()
    return f"{name} in {ERA_NAMES.get(era, era)}"


def compact():
    towers = {}
    for k, t in CAT['towers'].items():
        s = t['stats']
        towers[k] = {'label': t['label'], 'desc': t['description'], 'example': nice(t['example'], t['from_era']),
                     'l3': f"{t['level3']['name']}: {t['level3']['text'].rstrip('.').lower()}", 'note': t.get('note'),
                     'cost': s['cost'], 'range': s['range']}
    enemies = {}
    for k, e in CAT['enemies'].items():
        s = e['stats']
        enemies[k] = {'label': e['label'], 'desc': e['description'], 'boss': e['boss'], 'example': nice(e['example'], e['from_era']),
                      'hp': s['hp'], 'speed': s['speed'], 'armor': s['armor']}
    return {'towers': towers, 'enemies': enemies}


def main():
    out = Path(sys.argv[1])
    relay = sys.argv[2] if len(sys.argv) > 2 else ''
    key = sys.argv[3] if len(sys.argv) > 3 else ''
    page = (HERE / 'studio.template.html').read_text()
    for mark, val in (('/*CATALOGUE*/null', json.dumps(compact(), separators=(',', ':'))),
                      ("/*RELAY*/''", json.dumps(relay)), ("/*RELAY_KEY*/''", json.dumps(key))):
        assert mark in page, mark
        page = page.replace(mark, val)
    out.write_text(page)
    print(f'{out}: {len(page) // 1024} KB')


if __name__ == '__main__':
    main()
