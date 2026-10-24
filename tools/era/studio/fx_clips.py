"""Records in-game clips of an Era Studio era's tower effects: for each tower level (and each timed special, and each
stream) a short scene with the tower firing at a pack of the era's enemies on the road, the camera zoomed in on it.
The game loop is paused and stepped at 30 fps, one screenshot per frame, then ffmpeg makes an mp4. These clips are
the takes of an effects round (studio/RUNBOOK.md); the same clip name gives the same scene and camera on any build of
the era, so a before/after pair lines up.

usage: python tools/era/studio/fx_clips.py <dist dir> <era id> <out dir> [--only a,b] [--seconds 5] [--zoom 2]
                                           [--port 8791] [--list] [--keep-frames]
  clip names: <tower>_l1, <tower>_l2, <tower>_l3; <tower>_<special slug> (a timed special, cast at once, camera on its
  path); <tower>_stream (a stream level, closer). Writes <out dir>/<clip>.mp4 and prints JSON
  {"clips": [{"name", "file", "frames"}], "errors": [...], "missing": [...]}.
"""
import asyncio, json, re, shutil, subprocess, sys, tempfile, time
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[3]
args = sys.argv[1:]
flag = lambda k, d=None: args[args.index(k) + 1] if k in args else d
DIST, ERA, OUT = args[0], args[1], Path(args[2])
SECONDS = float(flag('--seconds', 5))
ZOOM = float(flag('--zoom', 2.0))
PORT = flag('--port', '8791')
ONLY = set(flag('--only', '').split(',')) - {''}
DATA = json.loads((ROOT / 'src' / 'eras' / f'{ERA}.json').read_text())


def slug(name): return re.sub(r'[^a-z0-9]+', '_', (name or '').lower()).strip('_')[:20]


def clips():
    """Every clip this era has: each tower at levels 1-3, its timed specials, its streams."""
    out = []
    for k in DATA['towerOrder']:
        levels = (DATA.get('levels') or {}).get(k) or []
        for n in (1, 2, 3):
            out.append({'name': f'{k}_l{n}', 'kind': k, 'level': n, 'focus': 'pack'})
        seen = set()
        for n, L in enumerate(levels, 1):
            for sp in [*([L['special']] if L.get('special') else []), *(L.get('specials') or [])]:
                s = slug(sp.get('name'))
                if sp.get('everySec') and s and s not in seen:
                    seen.add(s)
                    out.append({'name': f'{k}_{s}', 'kind': k, 'level': n, 'focus': 'path', 'special': s})
            if (L.get('attack') or {}).get('stream') and f'{k}_stream' not in [c['name'] for c in out]:
                out.append({'name': f'{k}_stream', 'kind': k, 'level': n, 'focus': 'stream', 'zoom': ZOOM * 1.25})
    return out


# The scene: picks the plot that sees the most road for this tower, builds and upgrades it, puts a pack of the era's
# middle enemies on the road just before its reach (sturdier than usual so they live through the clip), hides the
# HUD and zooms the camera on the action. Math.random is seeded from the clip name so every build gets the same scene.
SETUP = r"""
(cfg) => {
  let seed = [...cfg.name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
  Math.random = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const s = game.scene.getScene('Game');
  const def = cfg.def, lv = cfg.levelSpec || {};
  const reach = Math.min(def.range, lv.stream ? lv.stream.length : 99);
  const lo = Math.max(def.minRange || 0, 0.8) + 0.3, hi = reach * 0.9;
  const P = s.paths[0], pts = [];
  for (let d = 0; d <= P.length; d += 0.25) {
    const a = P.at(d), b = P.at(Math.min(P.length, d + 0.2));
    // enemies on road that runs down the screen face the camera: that road counts more
    pts.push({ d, ...a, w: (b.gx - a.gx) + (b.gy - a.gy) > 0.05 ? 1 : 0.35 });
  }
  const cx = 640, cy = 360;
  // road the tower can reach, past the first stretch (enemies have left their gate), on plots near the middle of the map
  const skip = Math.min(6, P.length * 0.15);
  const rank = s.plots.map(pl => {
    const near = pts.filter(q => { const r = Math.hypot(q.gx - pl.def.x, q.gy - pl.def.y); return q.d >= skip && r >= lo && r <= hi; });
    return { pl, n: near.reduce((t, q) => t + q.w, 0), first: near.length ? near[0].d : 0, mid: near.length ? near[Math.floor(near.length / 2)].d : 0,
             off: Math.hypot(pl.top.x - cx, pl.top.y - cy) };
  }).filter(o => o.n > 0).sort((a, b) => (b.n - b.off / 25) - (a.n - a.off / 25));
  const pick = rank[0];
  s.gold = 999999;
  s.build(pick.pl, cfg.kind);
  for (let i = 1; i < cfg.level; i++) s.upgrade(pick.pl);
  const t = pick.pl.tower;
  window.__clip = { s, t, pick };
  return { plot: pick.pl.index, first: pick.first, mid: pick.mid };
}
"""

SPAWN = r"""
(cfg) => {
  const { s, t, pick } = window.__clip;
  s.startWave();
  s.spawns = [];
  const kinds = cfg.pack;
  const pattern = [0, -0.6, 0.6, -0.3, 0.3, 0];
  const before = s.enemies.length;
  kinds.forEach((k, i) => s.spawns.push({ at: 0, kind: k, group: 1, lane: pattern[i % pattern.length] * 0.8 }));
  window.__step(1);
  const fresh = s.enemies.slice(before);
  // the pack walks into the tower's reach: the front one just before the first road it can hit
  const start = Math.max(0.5, (cfg.focus === 'path' ? pick.first : pick.first) - 0.6);
  fresh.forEach((e, i) => { e.distance = Math.max(0, start - i * 0.45); e.hp = e.maxHp * cfg.hpMult; e.age = 99; e.move(0); });
  // the camera: on the tower and the stretch of road it covers (a special's run: further along that road)
  // grid to screen, measured from an enemy (the game's iso map: half a tile is 40 x 20 px)
  const e0 = fresh[0], ox = e0.screen.x - (e0.gx - e0.gy) * 40, oy = e0.screen.y - (e0.gx + e0.gy) * 20;
  const iso = (gx, gy) => ({ x: (gx - gy) * 40 + ox, y: (gx + gy) * 20 + oy });
  const P = s.paths[0];
  const a = P.at(Math.max(0, start - 0.5)), b = P.at(Math.min(P.length, pick.mid + (cfg.focus === 'path' ? 2.5 : 0.5)));
  const ta = iso(a.gx, a.gy), tb = iso(b.gx, b.gy), tt = t.plot.top;
  const w = cfg.focus === 'stream' ? 0.5 : 0.34;
  const cam = s.cameras.main;
  cam.setBounds(0, 0, 1280, 720);   // the map's own picture, never the empty background beyond it
  cam.setZoom(cfg.zoom).centerOn(tt.x * w + (ta.x + tb.x) / 2 * (1 - w), (tt.y - 30) * w + (ta.y + tb.y) / 2 * (1 - w) - 10);
  return fresh.length;
}
"""

HIDE_UI = "(()=>{const s=game.scene.getScene('Game'); for (const o of s.children.list) if (o.depth >= 4990 && o.visible) o.setVisible(false);})()"


def pack_for():
    """The era's middle enemies (not the weakest, not the boss): what each clip's towers fire at."""
    regular = sorted([e for e in DATA['enemies'].values() if not e.get('boss')], key=lambda e: e['hp'])
    mid = regular[1:3] if len(regular) >= 3 else regular
    return [mid[i % len(mid)]['kind'] for i in range(6)]


async def record(pg, c, frames_dir):
    await pg.goto(f'http://localhost:{PORT}/index.html')
    await pg.wait_for_timeout(2500)
    await pg.evaluate(f"game.scene.getScene('Menu').scene.start('Game', {{mode: '{ERA}', campaignLives: 3}})")
    for _ in range(40):
        await pg.wait_for_timeout(500)
        if await pg.evaluate("(()=>{const s=game.scene.getScene('Game'); return !!(s && s.plots && s.plots.length && s.sys.isActive())})()"): break
    await pg.wait_for_timeout(1500)
    # freeze the real-time loop and drive it by hand at 30 fps; tweens keep their own clock from Date.now(), so that
    # clock is stepped too (otherwise effects would play at whatever speed the screenshots allow)
    await pg.evaluate("""(()=>{const g=game; g.loop.sleep(); window.__t=1e6; const now0=Date.now(); let vnow=now0; Date.now=()=>vnow; window.__step=(n)=>{for(let i=0;i<n;i++){window.__t+=1000/30; vnow+=1000/30; g.step(window.__t,1000/30);}};})()""")
    lv = ((DATA.get('levels') or {}).get(c['kind']) or [{}] * 3)
    L = lv[min(c['level'], len(lv)) - 1] if lv else {}
    cfg = {'name': c['name'], 'kind': c['kind'], 'level': c['level'], 'def': DATA['towers'][c['kind']],
           'levelSpec': (L.get('attack') or {}), 'pack': pack_for(), 'hpMult': 2.5, 'focus': c['focus'], 'zoom': c.get('zoom', ZOOM)}
    await pg.evaluate(SETUP, cfg)
    await pg.evaluate("window.__step(30)")        # the tower settles (build puff, upgrade flash)
    await pg.evaluate(SPAWN, cfg)
    if c['focus'] == 'path':
        # a timed special: due at once, so it goes off with the first shot
        await pg.evaluate("(()=>{const t=window.__clip.t; t.specialIn = t.specialIn.map(()=>0); t.cooldown = 0;})()")
    n = int(SECONDS * 30)
    frames_dir.mkdir(parents=True, exist_ok=True)
    for i in range(n):
        await pg.evaluate(HIDE_UI + ';window.__step(1)')   # hidden before the frame is drawn
        await pg.screenshot(path=str(frames_dir / f'f_{i:05d}.jpg'), type='jpeg', quality=90)
    return n


async def main():
    if '--list' in args:
        print(json.dumps([c['name'] for c in clips()])); return
    OUT.mkdir(parents=True, exist_ok=True)
    todo = [c for c in clips() if not ONLY or c['name'] in ONLY]
    srv = subprocess.Popen(['python3', '-m', 'http.server', PORT], cwd=DIST, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    await asyncio.sleep(1.5)
    out = {'era': ERA, 'clips': [], 'errors': [], 'missing': []}
    tmp = Path(tempfile.mkdtemp(prefix='fxclips_'))
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(args=['--use-gl=swiftshader'])
            for c in todo:
                pg = await b.new_page(viewport={'width': 1280, 'height': 720})
                pg.on('pageerror', lambda e, n=c['name']: out['errors'].append(f'{n}: {str(e)[:300]}'))
                pg.on('response', lambda r: r.status >= 400 and out['missing'].append(r.url.split(f':{PORT}/', 1)[-1]))
                t0 = time.time()
                frames = tmp / c['name']
                n = await record(pg, c, frames)
                mp4 = OUT / f"{c['name']}.mp4"
                subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '30', '-i', str(frames / 'f_%05d.jpg'),
                                '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', str(mp4)], check=True)
                if '--keep-frames' in args: shutil.copytree(frames, OUT / f"{c['name']}_frames", dirs_exist_ok=True)
                out['clips'].append({'name': c['name'], 'file': str(mp4), 'frames': n, 'secs': round(time.time() - t0)})
                await pg.close()
            await b.close()
    finally:
        srv.terminate()
        shutil.rmtree(tmp, ignore_errors=True)
    out['missing'] = sorted(set(out['missing']))
    print(json.dumps(out, indent=1))


asyncio.run(main())
