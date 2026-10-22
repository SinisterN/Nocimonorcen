"""Plays an era headlessly at a given skill level and records the defence performance (s.perf) at each draft.
usage: bot_perf.py <dist dir> <era> <profile> <port> [seed]
profiles: strong (best plots, spends all, upgrades) | average (keeps a 30% reserve) | casual (random plots)
          | weak (3 towers, no upgrades) | poor (2 towers on the worst plots)"""
import asyncio, subprocess, sys, json, random
from playwright.async_api import async_playwright
DIST, ERA, PROF, PORT = sys.argv[1:5]
SEED = int(sys.argv[5]) if len(sys.argv) > 5 else 1
P = {'strong': dict(order='best', reserve=0, maxT=99, up=True),
     'average': dict(order='best', reserve=0.3, maxT=99, up=True),
     'casual': dict(order='random', reserve=0.15, maxT=99, up=True),
     'weak': dict(order='random', reserve=0, maxT=3, up=False),
     'poor': dict(order='worst', reserve=0, maxT=2, up=False)}[PROF]
BOT = r"""
((P, seed) => {
  const s = game.scene.getScene('Game');
  if (s.phase !== 'build' || s.overlay) return null;
  if (!window.RANK) {
    const pts = [];
    for (const p of s.paths) for (let d = 0; d <= p.length; d += 0.25) pts.push(p.at(d));
    let r = s.plots.map(pl => ({ pl, c: pts.filter(q => Math.hypot(q.gx - pl.def.x, q.gy - pl.def.y) <= 3.3).length }));
    let x = seed; const rnd = () => (x = (x * 16807) % 2147483647) / 2147483647;
    if (P.order === 'best') r.sort((a, b) => b.c - a.c);
    else if (P.order === 'worst') r = r.filter(o => o.c > 0).sort((a, b) => a.c - b.c);
    else r.sort(() => rnd() - 0.5);
    window.RANK = r.map(o => o.pl);
  }
  const order = window.KINDS;
  const towers = () => s.plots.filter(p => p.tower).map(p => p.tower);
  for (const t of towers()) if (t.damaged) { const c = s.repairCost(t); if (s.gold >= c) s.repair(t.plot); }
  const budget = () => s.gold - Math.round((s.gold) * P.reserve);
  for (let guard = 0; guard < 40; guard++) {
    const ts = towers();
    const free = ts.length < P.maxT ? window.RANK.find(p => !p.tower) : null;
    const kind = order[ts.length % order.length];
    const def = window.DEFS[kind];
    const up = P.up ? ts.filter(t => t.level < 3).sort((a, b) => a.level - b.level || s.upgradeCost(a) - s.upgradeCost(b))[0] : null;
    const upCost = up ? s.upgradeCost(up) : Infinity;
    const wantBuild = free && (ts.length < 4 || def.cost <= upCost);
    if (wantBuild && budget() >= def.cost) { s.build(free, kind); continue; }
    if (up && budget() >= upCost) { s.upgrade(up.plot); continue; }
    if (free && budget() >= def.cost) { s.build(free, kind); continue; }
    break;
  }
  s.startWave(); s.speed = 8;
  return true;
})
"""
async def main():
    srv = subprocess.Popen(["python3", "-m", "http.server", PORT], cwd=DIST, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    await asyncio.sleep(1.5)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=swiftshader"])
        pg = await b.new_page(viewport={"width": 640, "height": 360}); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(f"http://localhost:{PORT}/index.html"); await pg.wait_for_timeout(2500)
        await pg.evaluate(f"game.scene.getScene('Menu').scene.start('Game',{{mode:'{ERA}',campaignLives:3}})")
        await pg.wait_for_timeout(6000)
        await pg.evaluate("""(()=>{const s=game.scene.getScene('Game');
          const names={era1:['arrow','mg','mortar'],era2:['gun','rocket','rail'],era3:['rifle','ballista','killer']}['%s'];
          window.KINDS=names; window.DEFS={};
          for (const k of names) { const pl=s.plots.find(p=>!p.tower); const g=s.gold; s.gold=99999; s.build(pl,k); window.DEFS[k]={cost:pl.tower.def.cost};
            s.crews?.get?.(pl.tower)?.destroy?.(); s.crews?.delete?.(pl.tower); pl.tower.destroy(); pl.tower=null; pl.draw(); s.gold=g; }
        })()""" % ERA)
        out = {'era': ERA, 'profile': PROF, 'seed': SEED, 'blocks': []}
        t0 = asyncio.get_event_loop().time()
        while True:
            st = await pg.evaluate("""(()=>{const s=game.scene.getScene('Game'); const p=s.perf;
              return {phase:s.phase, wave:s.waveIndex, hp:s.baseHp, overlay:!!s.overlay,
                      perf:{hp0:p.hp0, leaks:p.leaks, n:p.reach.length, reach:p.reach.length? p.reach.reduce((a,b)=>a+b,0)/p.reach.length:0,
                            towerDamage:+p.towerDamage.toFixed(2), towersLost:p.towersLost},
                      towers:s.plots.filter(x=>x.tower).map(x=>x.tower.def.kind[0]+x.tower.level).join(' ')}})()""")
            if st['overlay'] and st['phase'] == 'draft':
                out['blocks'].append({'after_wave': st['wave'], 'hp': st['hp'], **st['perf'], 'towers': st['towers']})
                await pg.evaluate("game.scene.getScene('Game').closeOverlay()")
                if len(out['blocks']) >= 2: break
                continue
            if st['phase'] == 'over' or st['wave'] >= 9:
                out['final'] = {'wave': st['wave'], 'hp': st['hp'], 'phase': st['phase'], **st['perf']}
                break
            if asyncio.get_event_loop().time() - t0 > 1500: out['timeout'] = True; break
            await pg.evaluate(BOT + f"({json.dumps(P)}, {SEED * 7919 + 13})")
            await pg.wait_for_timeout(1000)
        out['errors'] = errs[:3]
        print(json.dumps(out), flush=True)
        await b.close()
    srv.terminate()
asyncio.run(main())
