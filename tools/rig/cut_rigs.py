"""Cuts each enemy's keeper original into cut-out rig parts (everything not claimed by a part stays on the torso).

usage: python tools/rig/cut_rigs.py <keepers dir> [kind ...]
Writes public/sprites/<era>/rig/<kind>/<part>.png + rig.json. Coordinates below are in the 1024 px original;
rig units are half that (the lab and game work in 512 px rig space). Parts are listed back to front; a part listed
earlier in `claim` order wins pixels it shares with a later one.
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
U = 0.5          # rig units per original pixel
FILE = 0.5       # file pixels per rig unit

# part: (polygon, pivot, parent)   parents: root (stays put), body (leans at the hip), or another part
RIGS = {
 'fast': dict(era='era1', src='era1/enemies/enemy_fast_walk0.png', facesLeft=True, hip=(700, 600), ground=940,
   claim=['head', 'legsF', 'legsB', 'tail'],
   order=['legsB', 'tail', 'torso', 'legsF', 'head'],
   parts={
    'head': ([(318,440),(380,425),(470,430),(500,480),(500,560),(470,630),(400,640),(340,620),(318,560)], (485,560), 'body'),
    'legsF': ([(430,605),(530,560),(620,560),(620,700),(580,760),(560,830),(530,945),(265,945),(285,870),(395,850),(420,760),(445,700)], (560,600), 'body'),
    'legsB': ([(590,760),(720,740),(780,760),(860,770),(900,800),(945,890),(945,945),(575,945),(600,860)], (790,790), 'body'),
    'tail': ([(95,560),(110,320),(200,200),(330,115),(480,90),(620,105),(725,165),(805,245),(855,380),(865,520),(825,565),(760,565),(745,470),(700,330),(630,240),(540,195),(450,195),(360,225),(285,290),(235,380),(215,470),(245,560),(250,700),(220,760),(95,760)], (790,545), 'body'),
   }),
 'armored': dict(era='era1', src='era1/enemies/enemy_armored_walk0.png', facesLeft=False, hip=(540,640), ground=935,
   claim=['head', 'legL', 'legR', 'armR', 'armL'],
   order=['armR', 'legR', 'legL', 'torso', 'head', 'armL'],
   parts={
    'head': ([(465,120),(520,72),(620,62),(672,110),(668,322),(600,334),(560,300),(470,252)], (590,322), 'body'),
    'armL': ([(330,400),(410,388),(452,440),(452,570),(412,642),(332,722),(332,822),(272,902),(200,952),(118,932),(68,800),(78,680),(118,628),(258,700),(330,620),(325,560)], (400,420), 'body'),
    'armR': ([(668,408),(742,418),(792,558),(802,602),(762,642),(712,632),(688,560),(660,480)], (690,430), 'body'),
    'legL': ([(378,700),(542,700),(532,820),(535,935),(348,948),(348,860),(378,780)], (450,700), 'root'),
    'legR': ([(570,700),(702,688),(722,760),(792,880),(782,925),(600,932),(578,860),(570,780)], (630,700), 'root'),
   }),
 'shaman': dict(era='era1', src='era1/enemies/enemy_shaman.png', facesLeft=True, hip=(550,600), ground=818,
   claim=['head', 'staff', 'armR', 'legL', 'legR'],
   order=['legL', 'legR', 'armR', 'torso', 'head', 'staff'],
   parts={
    'head': ([(430,330),(470,220),(540,168),(640,173),(702,240),(717,330),(692,420),(620,470),(550,482),(490,450),(440,400)], (570,470), 'body'),
    'staff': ([(105,180),(160,168),(198,98),(272,98),(302,180),(342,240),(342,330),(322,390),(350,410),(400,398),(422,430),(412,522),(360,522),(352,570),(382,700),(404,815),(356,822),(328,700),(298,560),(258,500),(248,430),(278,350),(248,300),(148,262)], (405,420), 'body'),
    'armR': ([(648,478),(702,458),(762,498),(804,558),(812,622),(782,682),(718,682),(638,642),(638,560)], (670,482), 'body'),
    'legL': ([(378,738),(492,738),(492,812),(378,817)], (440,740), 'root'),
    'legR': ([(578,738),(692,758),(702,822),(588,822)], (630,742), 'root'),
   }),
 'brute': dict(era='era1', src='era1/enemies/enemy_brute.png', facesLeft=True, hip=(520,560), ground=875,
   claim=['head', 'armL', 'armR', 'legL', 'legR'],
   order=['legL', 'legR', 'torso', 'head', 'armR', 'armL'],
   parts={
    'head': ([(450,250),(480,180),(560,143),(642,158),(692,230),(692,330),(652,432),(600,472),(520,462),(490,400),(470,330)], (570,450), 'body'),
    'armL': ([(158,420),(188,378),(250,348),(300,250),(330,208),(402,198),(422,280),(392,360),(332,422),(302,520),(312,600),(342,742),(302,852),(218,892),(138,822),(88,650),(108,598),(168,578),(158,500)], (370,285), 'body'),
    'armR': ([(700,198),(762,238),(802,330),(842,398),(872,500),(862,622),(822,692),(738,702),(708,600),(718,500),(698,420),(688,330)], (735,285), 'body'),
    'legL': ([(348,560),(482,560),(482,700),(442,800),(442,882),(298,872),(318,760),(338,700)], (420,580), 'root'),
    'legR': ([(518,560),(652,560),(672,700),(722,800),(722,852),(538,802),(558,700)], (590,580), 'root'),
   }),
 'robot': dict(era='era2', src='era2/enemies/enemy_robot.png', facesLeft=False, hip=(520,560), ground=940,
   claim=['head', 'armL', 'armR', 'legL', 'legR'],
   order=['legL', 'armL', 'torso', 'legR', 'head', 'armR'],
   parts={
    'head': ([(458,140),(520,103),(622,98),(682,150),(702,250),(692,330),(642,392),(560,402),(478,362),(458,280)], (580,390), 'body'),
    'armL': ([(118,500),(138,368),(200,338),(240,308),(300,278),(332,320),(302,380),(292,450),(272,560),(252,632),(188,632),(118,560)], (300,320), 'body'),
    'armR': ([(688,338),(742,338),(762,420),(802,438),(852,458),(902,620),(952,752),(922,782),(868,762),(828,702),(788,752),(758,742),(778,680),(718,652),(688,600),(668,480)], (722,362), 'body'),
    'legL': ([(378,560),(472,560),(482,650),(422,762),(382,802),(298,802),(278,700),(298,628),(358,618)], (430,565), 'root'),
    'legR': ([(518,598),(642,598),(702,690),(702,830),(752,878),(742,942),(598,942),(558,880),(558,740),(528,680)], (580,610), 'root'),
   }),
 'droid': dict(era='era2', src='era2/enemies/enemy_droid.png', facesLeft=True, hip=(480,620), ground=915,
   claim=['trackL', 'trackR', 'pack'],
   order=['trackR', 'pack', 'torso', 'trackL'],
   parts={
    'trackL': ([(180,610),(300,595),(380,590),(552,700),(552,852),(432,922),(298,902),(188,762)], (370,760), 'root'),
    'trackR': ([(598,582),(802,578),(862,640),(862,762),(762,812),(642,762),(598,702)], (730,690), 'root'),
    'pack': ([(212,250),(238,188),(320,148),(420,122),(502,118),(562,178),(452,230),(402,262),(352,350),(342,502),(268,512),(218,452)], (390,300), 'body'),
   }),
 'walker': dict(era='era2', src='era2/enemies/enemy_walker.png', facesLeft=True, hip=(480,560), ground=938,
   claim=['podL', 'podR', 'armL', 'armR', 'legL', 'legR'],
   order=['legR', 'armR', 'legL', 'torso', 'armL', 'podR', 'podL'],
   parts={
    'podL': ([(195,170),(250,138),(522,123),(527,175),(442,205),(330,232),(258,242),(198,225)], (350,215), 'body'),
    'podR': ([(560,232),(642,168),(802,138),(842,150),(802,212),(722,262),(642,282),(580,282)], (650,255), 'body'),
    'armL': ([(243,408),(300,393),(347,420),(342,560),(322,612),(263,612),(243,520)], (300,420), 'body'),
    'armR': ([(678,418),(742,398),(792,428),(822,600),(782,662),(738,662),(718,600),(688,500)], (720,420), 'body'),
    'legL': ([(268,598),(402,558),(422,620),(412,720),(432,782),(402,802),(300,852),(228,832),(238,770),(268,700)], (350,600), 'root'),
    'legR': ([(578,518),(692,518),(722,600),(722,740),(762,800),(762,882),(702,942),(588,932),(588,840),(598,780),(588,650)], (640,560), 'root'),
   }),
 'shield': dict(era='era2', src='era2/enemies/enemy_shield.png', facesLeft=False, hip=(470,560), ground=832,
   claim=['head', 'shield', 'gun', 'legL', 'legR'],
   order=['legR', 'legL', 'gun', 'torso', 'head', 'shield'],
   parts={
    'head': ([(458,208),(520,183),(602,188),(662,240),(662,300),(622,342),(540,352),(468,320)], (560,340), 'body'),
    'gun': ([(198,450),(238,388),(300,358),(342,328),(362,370),(332,440),(302,560),(262,622),(242,702),(198,702),(218,600),(198,560)], (340,352), 'body'),
    'shield': ([(438,450),(500,418),(842,293),(862,330),(832,672),(480,832),(443,802)], (520,450), 'body'),
    'legL': ([(318,598),(422,558),(442,700),(382,722),(328,712)], (390,580), 'root'),
    'legR': ([(558,778),(662,768),(672,822),(568,832)], (600,778), 'root'),
   }),
 'tank': dict(era='era2', src='era2/enemies/enemy_tank.png', facesLeft=False, hip=(500,700), ground=912,
   claim=['turret'],
   order=['torso', 'turret'],
   parts={
    'turret': ([(228,330),(258,290),(330,290),(248,220),(268,182),(460,238),(702,348),(722,388),(762,448),(892,498),(942,560),(902,612),(830,602),(700,562),(620,562),(560,582),(480,582),(380,562),(300,542),(240,420)], (480,500), 'body'),
   }),
}


def poly(points, size, grow=0):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).polygon(points, fill=255)
    if grow:
        m = m.filter(ImageFilter.MaxFilter(grow * 2 + 1))
    return np.array(m) > 0


def cut(kind, keepers):
    r = RIGS[kind]
    A = np.array(Image.open(Path(keepers) / r['src']).convert('RGBA'))
    H, W = A.shape[:2]
    alpha = A[..., 3] > 0
    taken = np.zeros((H, W), bool)
    masks = {}
    for name in r['claim']:
        pts, _, _ = r['parts'][name]
        m = poly(pts, (W, H), 6) & alpha & ~poly_core(taken)
        masks[name] = m
        taken |= poly(pts, (W, H)) & alpha
    torso = alpha & ~taken
    n, lab, st, _ = cv2.connectedComponentsWithStats(torso.astype(np.uint8), 8)
    if n > 1:
        torso = lab == (1 + np.argmax(st[1:, cv2.CC_STAT_AREA]))
    masks['torso'] = torso
    out_dir = ROOT / 'public' / 'sprites' / r['era'] / 'rig' / kind
    out_dir.mkdir(parents=True, exist_ok=True)
    rig = {'name': kind, 'fileScale': FILE, 'ground': [256, r['ground'] * U], 'hip': [r['hip'][0] * U, r['hip'][1] * U],
           'facesLeft': r['facesLeft'], 'parts': {}, 'order': r['order']}
    for name in r['order']:
        m = masks[name]
        a = A.copy()
        a[~m, 3] = 0
        ys, xs = np.nonzero(m)
        x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
        im = Image.fromarray(a[y0:y1, x0:x1])
        s = U * FILE
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
        im.save(out_dir / f'{name}.png')
        if name == 'torso':
            pv, parent = r['hip'], 'body'
        else:
            _, pv, parent = r['parts'][name]
        rig['parts'][name] = {'x': x0 * U, 'y': y0 * U, 'w': im.width / FILE, 'h': im.height / FILE,
                              'px': pv[0] * U, 'py': pv[1] * U, 'parent': parent}
    (out_dir / 'rig.json').write_text(json.dumps(rig, indent=1))
    print(kind, {k: v['parent'] for k, v in rig['parts'].items()})


def poly_core(taken):
    return taken


if __name__ == '__main__':
    kinds = sys.argv[2:] or list(RIGS)
    for k in kinds:
        cut(k, sys.argv[1])
