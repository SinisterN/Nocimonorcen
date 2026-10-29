"""Road layouts for Era Studio eras: every era gets its own winding road, with tower pads along it and room for the
start and end buildings, inside the part of the 1280x720 screen the game's interface leaves free.

A road is a list of grid waypoints joined by straight stretches along the grid axes (enemies walk straight lines
between waypoints, like the hand-made eras). Stretches that aren't neighbours keep a gap of at least 3 tiles so
pads fit between them. Pads go 1.4-2.4 tiles from the road and are chosen greedily so every part of the road is
covered by a few towers; the best-covering ones become raised pads (+25% range).

usage:
  python tools/era/layout.py <era id> <out dir> [count=3]
      -> <out dir>/<era>_road_<n>.json and <era>_road_<n>.png (the guide the map painter follows), n = 1..count
"""
import json, math, random, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPR = ROOT / 'public' / 'sprites' / 'era1'


def scr(gx, gy):
    return 640 + (gx - gy) * 40, 96 + (gx + gy) * 20


# screen areas: the road's centre line stays inside ROAD, pads inside PAD (towers stand ~110 px tall on them);
# nothing goes under the HUD (top left), the hero portrait (bottom left) or the button row (bottom right)
ROAD = (70, 140, 1210, 600)
PAD = (60, 165, 1220, 610)
BLOCKED = [(0, 0, 500, 120), (0, 545, 175, 720), (640, 615, 1280, 720), (870, 575, 1280, 720)]
DIRS = [(1, 0), (0, 1), (-1, 0), (0, -1)]           # +gx (down-right), +gy (down-left), -gx, -gy


def inside(box, x, y, m=0):
    return box[0] + m <= x <= box[2] - m and box[1] + m <= y <= box[3] - m


def free(x, y, m=0):
    return not any(b[0] - m <= x <= b[2] + m and b[1] - m <= y <= b[3] + m for b in BLOCKED)


def ok_road(gx, gy):
    x, y = scr(gx, gy)
    return inside(ROAD, x, y) and free(x, y, 30)


def seg_points(a, b, step=0.25):
    n = max(1, int(round(max(abs(b[0] - a[0]), abs(b[1] - a[1])) / step)))
    return [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n + 1)]


def seg_dist(p, a, b):
    ax, ay = a; bx, by = b; px, py = p
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)


def road_dist(p, way):
    return min(seg_dist(p, a, b) for a, b in zip(way, way[1:]))


def length(way):
    return sum(abs(b[0] - a[0]) + abs(b[1] - a[1]) for a, b in zip(way, way[1:]))


def walk(rng, style, target):
    """One random road: a depth-first search over stretches, turning according to the style."""
    starts = [(gx, gy) for gx in range(-12, 30) for gy in range(-12, 30) if ok_road(gx, gy)]
    # start near the top or a side edge so enemies come from far away
    def edge_score(p):
        x, y = scr(*p)
        return min(y - ROAD[1], x - ROAD[0], ROAD[2] - x)
    starts.sort(key=edge_score)
    start = rng.choice(starts[:40])
    best = [None]

    def clear(way, nxt):
        a, b = way[-1], nxt
        pts = seg_points(a, b)
        if not all(ok_road(*p) for p in pts): return False
        # stretches that aren't neighbours keep 3 tiles apart (room for pads between them)
        for c, d in zip(way[:-2], way[1:-1]):
            if any(seg_dist(p, c, d) < 3 for p in pts[1:]): return False
        return True

    def turn_order(dir_i, n_turns, last_turn):
        left, right, straight = (dir_i + 1) % 4, (dir_i - 1) % 4, dir_i
        if style == 'serpentine':       # alternate turns: long parallel switchbacks
            order = [right, left] if last_turn == 'L' else [left, right]
        elif style == 'spiral':         # always the same way round, winding inwards
            order = [left, right]
        else:                           # meander: anything goes
            order = [left, right, straight]
            rng.shuffle(order)
        if straight not in order and rng.random() < 0.25: order.append(straight)
        return order

    def dfs(way, dir_i, last_turn, budget):
        if budget[0] <= 0: return
        budget[0] -= 1
        L = length(way)
        if L >= target:
            if L <= target + 8 and buildings_ok(way): best[0] = list(way)
            return
        for nd in turn_order(dir_i, len(way), last_turn):
            lens = list(range(3, 9)) if style != 'serpentine' or nd in ((dir_i + 1) % 4, (dir_i - 1) % 4) else [3, 4]
            rng.shuffle(lens)
            if style == 'serpentine': lens.sort(key=lambda n: -n if (len(way) % 2 == 0) else n)
            for n in lens[:4]:
                d = DIRS[nd]
                nxt = (way[-1][0] + d[0] * n, way[-1][1] + d[1] * n)
                if clear(way, nxt):
                    turn = 'L' if nd == (dir_i + 1) % 4 else 'R' if nd == (dir_i - 1) % 4 else last_turn
                    dfs(way + [nxt], nd, turn, budget)
                    if best[0]: return

    for _ in range(6):                       # a few starts and first directions
        dfs([start], rng.randrange(4), 'L', [5000])
        if best[0]: break
        start = rng.choice(starts[:60])
    return best[0]


def end_spot(way):
    """The base building sits just past the road's end, in the direction the road arrives."""
    (ax, ay), (bx, by) = way[-2], way[-1]
    dx, dy = (bx > ax) - (bx < ax), (by > ay) - (by < ay)
    return (bx + 1.2 * dx, by + 1.2 * dy)


def start_spot(way):
    (ax, ay), (bx, by) = way[0], way[1]
    dx, dy = (bx > ax) - (bx < ax), (by > ay) - (by < ay)
    return (ax - 0.9 * dx, ay - 0.9 * dy)


def footprints(way):
    """Screen boxes the start and end buildings cover (their art rises above the spot they stand on)."""
    out = []
    for (gx, gy), half_w, h in ((end_spot(way), 100, 165), (start_spot(way), 95, 115)):
        x, y = scr(gx, gy)
        out.append((x - half_w, y - h, x + half_w, y + 18))
    return out


def buildings_ok(way):
    # the road comes down: the base sits clearly lower on screen than where the enemies start
    if scr(*end_spot(way))[1] - scr(*start_spot(way))[1] < 220: return False
    end_box, start_box = footprints(way)
    for b in (end_box, start_box):
        if b[0] < 30 or b[2] > 1250 or b[1] < 10 or b[3] > 700: return False
        if any(not (b[2] < z[0] or b[0] > z[2] or b[3] < z[1] or b[1] > z[3]) for z in BLOCKED): return False
    # no other stretch of road runs under either building (only its own end of the road touches it)
    segs = list(zip(way, way[1:]))
    for box, own in ((end_box, segs[-1]), (start_box, segs[0])):
        for a, b in segs:
            if (a, b) == own: continue
            for p in seg_points(a, b, 0.25):
                x, y = scr(*p)
                if box[0] - 30 <= x <= box[2] + 30 and box[1] - 10 <= y <= box[3] + 20: return False
    return True


def pads(way, rng, count=17):
    samples = [p for a, b in zip(way, way[1:]) for p in seg_points(a, b, 0.5)]
    sx, sy = start_spot(way); ex, ey = end_spot(way)
    boxes = footprints(way)
    cands = []
    for i in range(-24, 60):
        for j in range(-24, 60):
            gx, gy = i / 2, j / 2
            x, y = scr(gx, gy)
            if not inside(PAD, x, y) or not free(x, y, 45): continue
            d = road_dist((gx, gy), way)
            if not 1.4 <= d <= 2.4: continue
            if math.hypot(gx - ex, gy - ey) < 2.6 or math.hypot(gx - sx, gy - sy) < 2.2: continue
            if any(b[0] - 40 <= x <= b[2] + 40 and b[1] - 20 <= y <= b[3] + 25 for b in boxes): continue
            cover = {k for k, s in enumerate(samples) if math.hypot(s[0] - gx, s[1] - gy) <= 3.3}
            cands.append(((gx, gy), cover))
    chosen, covered = [], [0] * len(samples)
    while len(chosen) < count and cands:
        def gain(c):
            (gx, gy), cov = c
            if any(math.hypot(gx - p[0], gy - p[1]) < 2.4 for p, _ in chosen): return -1
            return sum(1 / (1 + covered[k]) for k in cov) + rng.random() * 0.3
        c = max(cands, key=gain)
        if gain(c) <= 0: break
        chosen.append(c); cands.remove(c)
        for k in c[1]: covered[k] += 1
    best_high = sorted(chosen, key=lambda c: -len(c[1]))
    high = []
    for (p, cov) in best_high:
        if len(high) < 3 and all(math.hypot(p[0] - q[0], p[1] - q[1]) > 4 for q in high): high.append(p)
    gaps = sum(1 for c in covered if c == 0) / len(covered)
    return [{'x': p[0], 'y': p[1], **({'high': True} if p in high else {})} for p, _ in chosen], gaps


# How tough an era's enemies should be comes from how long they stay under fire: for each lane, the road the best
# REACH_PLOTS plots can reach within REACH tiles (a pad beside two passes of a winding road covers both), compared with
# Era 3, whose enemies and waves every Studio era starts from. The player decides which towers go where; this only
# measures what the road and pads allow. The Frozen Pass (serpentine, 50 tiles) came out at 1.74x and played right.
REACH, REACH_PLOTS, BASE_EXPOSURE = 3.5, 8, 51.6


def exposure(lanes, plots, reach=REACH, top=REACH_PLOTS, step=0.1):
    """Average over the lanes of the road length (tiles) the best `top` plots can reach."""
    per_lane = []
    for lane in lanes:
        pts = []
        for a, c in zip(lane, lane[1:]):
            n = max(1, int(math.hypot(c[0] - a[0], c[1] - a[1]) / step))
            pts += [(a[0] + (c[0] - a[0]) * k / n, a[1] + (c[1] - a[1]) * k / n) for k in range(n)]
        cov = sorted((sum(1 for x, y in pts if math.hypot(x - p['x'], y - p['y']) <= reach) * step for p in plots), reverse=True)
        per_lane.append(sum(cov[:top]))
    return sum(per_lane) / max(1, len(per_lane))


def toughness(lanes, plots):
    """Enemy health multiplier for this road and its pads (Era 3's own layout = 1)."""
    return round(min(2.2, max(0.8, exposure(lanes, plots) / BASE_EXPOSURE)), 2)


def make(era, seed, style, target):
    rng = random.Random(f'{era}-{seed}-{style}')
    for attempt in range(30):
        way = walk(rng, style, target)
        if not way or not buildings_ok(way): continue
        plots, gaps = pads(way, rng)
        if len(plots) < 14 or gaps > 0.12: continue
        return {'lanes': [way], 'plots': plots, 'start': {'at': list(start_spot(way)), 'width': 190},
                'end': {'at': list(end_spot(way)), 'width': 200}, 'style': 'clean',
                'meta': {'style': style, 'length': length(way), 'turns': len(way) - 2, 'pads': len(plots), 'uncovered': round(gaps, 3),
                         'toughness': toughness([way], plots)}}
    return None


def render(layout, png):
    """The guide picture for one layout (what the map painter follows; also what the designer picks from)."""
    j = Path(png).with_suffix('.json')
    j.write_text(json.dumps(layout, indent=1))
    subprocess.run([sys.executable, str(ROOT / 'tools' / 'map_guide.py'), str(j), str(SPR / 'plot.png'), str(SPR / 'plot_high.png'),
                    str(SPR / 'crypt.png'), str(SPR / 'cabin.png'), str(png)], check=True, stdout=subprocess.DEVNULL)


def generate(era, out, count=3, round_=1):
    out = Path(out); out.mkdir(parents=True, exist_ok=True)
    styles = ['serpentine', 'meander', 'spiral', 'meander', 'serpentine', 'spiral']
    made = []
    for n, style in enumerate(styles):
        if len(made) >= count: break
        seed = n + 10 * (round_ - 1)
        lay = make(era, seed, style, target=rng_target(era, seed))
        if not lay: continue
        k = len(made) + 1
        j = out / f'{era}_road_{k}.json'; png = out / f'{era}_road_{k}.png'
        render(lay, png)
        made.append({'n': k, 'json': str(j), 'png': str(png), **lay['meta']})
    return made


def rng_target(era, n):
    return 50 + (sum(map(ord, era)) * 7 + n * 5) % 13      # 50-62 tiles; Era 3's road is ~24


if __name__ == '__main__':
    print(json.dumps(generate(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 3,
                              int(sys.argv[4]) if len(sys.argv) > 4 else 1), indent=1))
