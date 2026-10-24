"""Eras 1-3 must play exactly the same after any engine change: builds every tower at level 3 on each built-in era,
plays a wave at 4x and prints what happened (towers, twin archers, shields, burning ground, kills). Run it on a build
of origin/era-studio and on the changed build (`npx vite build`, then from the repo root: python tools/era/legacy_test.py)
and compare: the lines must be identical.
"""
import asyncio, subprocess, sys, json
from playwright.async_api import async_playwright
ERAS = {'era1': ['arrow', 'mg', 'mortar'], 'era2': ['gun', 'rocket', 'rail'], 'era3': ['rifle', 'ballista', 'killer']}
async def main():
    srv = subprocess.Popen(['python3', '-m', 'http.server', '8822'], cwd='dist', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    await asyncio.sleep(1.2)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=swiftshader'])
        for era, kinds in ERAS.items():
            pg = await b.new_page(viewport={'width': 1280, 'height': 720})
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto('http://localhost:8822/index.html'); await pg.wait_for_timeout(2500)
            await pg.evaluate(f"game.scene.getScene('Menu').scene.start('Game',{{mode:'{era}',campaignLives:3}})"); await pg.wait_for_timeout(4000)
            await pg.evaluate(f"""(()=>{{const s=game.scene.getScene('Game'); s.gold=20000; const k={json.dumps(kinds)};
              s.plots.slice(0,9).forEach((p,i)=>s.build(p,k[i%3])); s.plots.slice(0,9).forEach(p=>{{ if(p.tower){{ s.upgrade(p); s.upgrade(p);}} }});
              window.T={{burn:0,twin:0,home:0,shield:0}};
              const o=s.addFire.bind(s); s.addFire=(...a)=>{{T.burn++; return o(...a)}};
              s.startWave(); s.speed=4;}})()""")
            await pg.wait_for_timeout(25000)
            r = await pg.evaluate("""(()=>{const s=game.scene.getScene('Game'); const tw=s.plots.filter(p=>p.tower).map(p=>p.tower);
              return {towers: tw.map(t=>t.def.kind+t.level).join(' '), twin: tw.filter(t=>t.archer2).length, shield: tw.filter(t=>t.shield).length,
                burn: T.burn, hp: s.lives ?? s.hp, killed: s.perf ? s.perf.reach.length : null}})()""")
            print(era, json.dumps(r), 'errors:', errs[:3])
            await pg.close()
        await b.close()
    srv.terminate()
asyncio.run(main())
