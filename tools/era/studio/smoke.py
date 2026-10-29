"""Smoke test for an Era Studio sandbox build: plays the era headless with a sensible bot for a few waves and reports
script errors, missing art and how the defence held up. The sandbox is only published when this passes.

usage: python tools/era/studio/smoke.py <dist dir> <era id> [waves=6] [port=8765]
prints JSON: {"ok": bool, "waves": n, "hp": .., "hp0": .., "errors": [...], "missing": [...], "towers": "..."}
"""
import asyncio, json, subprocess, sys
from pathlib import Path
from playwright.async_api import async_playwright

DIST, ERA = sys.argv[1], sys.argv[2]
WAVES = int(sys.argv[3]) if len(sys.argv) > 3 else 6
PORT = sys.argv[4] if len(sys.argv) > 4 else '8765'
ROOT = Path(__file__).resolve().parents[3]
KINDS = json.loads((ROOT / 'src' / 'eras' / f'{ERA}.json').read_text())['towerOrder']

# builds towers on the plots nearest the road, then upgrades; starts the next wave at 8x speed
BOT = r"""
(() => {
  const s = game.scene.getScene('Game');
  if (s.phase !== 'build' || s.overlay) return false;
  if (!window.RANK) {
    const pts = [];
    for (const p of s.paths) for (let d = 0; d <= p.length; d += 0.25) pts.push(p.at(d));
    window.RANK = s.plots.map(pl => ({ pl, c: pts.filter(q => Math.hypot(q.gx - pl.def.x, q.gy - pl.def.y) <= 3.3).length }))
      .sort((a, b) => b.c - a.c).map(o => o.pl);
  }
  const towers = () => s.plots.filter(p => p.tower).map(p => p.tower);
  for (let guard = 0; guard < 40; guard++) {
    const ts = towers();
    const free = window.RANK.find(p => !p.tower);
    const kind = window.KINDS[ts.length % window.KINDS.length];
    const up = ts.filter(t => t.level < 3).sort((a, b) => a.level - b.level)[0];
    const cost = window.DEFS[kind].cost;
    const upCost = up ? s.upgradeCost(up) : Infinity;
    if (free && s.gold >= cost && (ts.length < 4 || cost <= upCost)) { s.build(free, kind); continue; }
    if (up && s.gold >= upCost) { s.upgrade(up.plot); continue; }
    if (free && s.gold >= cost) { s.build(free, kind); continue; }
    break;
  }
  s.startWave(); s.speed = 8;
  return true;
})()
"""


async def main():
    srv = subprocess.Popen(['python3', '-m', 'http.server', PORT], cwd=DIST, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    await asyncio.sleep(1.5)
    out = {'era': ERA, 'ok': False, 'errors': [], 'missing': []}
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(args=['--use-gl=swiftshader'])
            pg = await b.new_page(viewport={'width': 640, 'height': 360})
            pg.on('pageerror', lambda e: out['errors'].append(str(e)[:300]))
            pg.on('console', lambda m: m.type == 'error' and out['errors'].append(m.text[:300]))
            pg.on('requestfailed', lambda r: out['missing'].append(r.url.split(f':{PORT}/', 1)[-1]))
            pg.on('response', lambda r: r.status >= 400 and out['missing'].append(r.url.split(f':{PORT}/', 1)[-1]))
            await pg.goto(f'http://localhost:{PORT}/index.html')
            await pg.wait_for_timeout(2500)
            await pg.evaluate(f"game.scene.getScene('Menu').scene.start('Game', {{mode: '{ERA}', campaignLives: 3}})")
            await pg.wait_for_timeout(6000)
            await pg.evaluate(f'window.KINDS = {json.dumps(KINDS)}')
            # measure each tower's cost by building it once with borrowed gold
            await pg.evaluate("""(() => { const s = game.scene.getScene('Game'); window.DEFS = {};
              for (const k of window.KINDS) { const pl = s.plots.find(p => !p.tower); const g = s.gold; s.gold = 99999; s.build(pl, k);
                window.DEFS[k] = { cost: pl.tower.def.cost }; s.crews?.get?.(pl.tower)?.destroy?.(); s.crews?.delete?.(pl.tower);
                pl.tower.destroy(); pl.tower = null; pl.draw(); s.gold = g; } })()""")
            # textures the game asked for but couldn't load show up as Phaser's __MISSING placeholder
            out['missing'] += await pg.evaluate("""(() => { const t = game.textures; return Object.keys(t.list)
              .filter(k => t.get(k).key === '__MISSING' && k !== '__MISSING') })()""")
            t0 = asyncio.get_event_loop().time()
            while True:
                st = await pg.evaluate("""(() => { const s = game.scene.getScene('Game');
                  return { phase: s.phase, wave: s.waveIndex, hp: s.baseHp, hp0: s.perf?.hp0, overlay: !!s.overlay,
                           towers: s.plots.filter(x => x.tower).map(x => x.tower.def.kind + x.tower.level).join(' ') } })()""")
                if st['overlay']:
                    await pg.evaluate("game.scene.getScene('Game').closeOverlay()")
                    await pg.wait_for_timeout(300)
                    continue
                if st['phase'] == 'over' or st['wave'] >= WAVES:
                    out.update(waves=st['wave'], hp=st['hp'], hp0=st['hp0'], towers=st['towers'], phase=st['phase'])
                    break
                if asyncio.get_event_loop().time() - t0 > 900:
                    out.update(timeout=True, waves=st['wave']); break
                await pg.evaluate(BOT)
                await pg.wait_for_timeout(1000)
            await b.close()
    finally:
        srv.terminate()
    out['missing'] = sorted(set(out['missing']))
    out['errors'] = out['errors'][:10]
    out['ok'] = not out['errors'] and not out['missing'] and not out.get('timeout')
    print(json.dumps(out))


asyncio.run(main())
