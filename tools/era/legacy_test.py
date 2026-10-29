"""Eras 1-3 must play exactly the same after any engine change. Builds every tower at level 3 on each built-in era, then
plays a wave with Math.random seeded and the game stepped at a fixed 60 fps (no real-time clock, so it gives the same
result on any machine). From the repo root after `npx vite build`: python tools/era/legacy_test.py
The output must match tools/era/legacy_baseline.txt line for line (diff the two).
"""
import asyncio, subprocess, json
from playwright.async_api import async_playwright
ERAS = {'era1': ['arrow', 'mg', 'mortar'], 'era2': ['gun', 'rocket', 'rail'], 'era3': ['rifle', 'ballista', 'killer']}
SEED = "window.__seed=(s)=>{Math.random=function(){s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}};"

async def one(b, era, kinds):
    pg = await b.new_page(viewport={'width': 1280, 'height': 720})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    try:
        await pg.add_init_script(SEED)
        await pg.goto('http://localhost:8823/index.html'); await pg.wait_for_timeout(2500)
        await pg.evaluate(f"game.scene.getScene('Menu').scene.start('Game',{{mode:'{era}',campaignLives:3}})"); await pg.wait_for_timeout(5000)
        await pg.evaluate("(()=>{const g=game; g.loop.sleep(); window.__t=1e6; window.__step=(n)=>{for(let i=0;i<n;i++){window.__t+=1000/60; g.headlessStep(window.__t,1000/60);}}; window.__seed(12345);})()")
        await pg.evaluate(f"""(()=>{{const s=game.scene.getScene('Game'); s.gold=20000; const k={json.dumps(kinds)};
          s.plots.slice(0,9).forEach((p,i)=>s.build(p,k[i%3])); s.plots.slice(0,9).forEach(p=>{{ if(p.tower){{ s.upgrade(p); s.upgrade(p);}} }});
          window.T={{burn:0}};
          const o=s.addFire.bind(s); s.addFire=(...a)=>{{T.burn++; return o(...a)}};
          s.startWave(); s.speed=4;}})()""")
        for _ in range(15): await pg.evaluate("window.__step(100)")
        r = await pg.evaluate("""(()=>{const s=game.scene.getScene('Game'); const tw=s.plots.filter(p=>p.tower).map(p=>p.tower);
          return {towers: tw.map(t=>t.def.kind+t.level).join(' '), twin: tw.filter(t=>t.archer2).length, shield: tw.filter(t=>t.shield).length,
            burn: T.burn, killed: s.perf ? s.perf.reach.length : null, gold: s.gold, hp: s.baseHp,
            enemies: s.enemies.map(e=>Math.round(e.hp)+'@'+e.distance.toFixed(2)).join(',')}})()""")
        return r, errs
    finally:
        await pg.close()

async def main():
    srv = subprocess.Popen(['python3', '-m', 'http.server', '8823'], cwd=str(__import__('pathlib').Path.cwd() / 'dist'), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    await asyncio.sleep(1.2)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=swiftshader'])
        for era, kinds in ERAS.items():
            for attempt in range(3):
                try:
                    r, errs = await one(b, era, kinds)
                    print(era, json.dumps(r), 'errors:', errs[:3], flush=True); break
                except Exception as e:
                    print(era, 'attempt', attempt + 1, 'failed:', str(e)[:120], flush=True)
        await b.close()
    srv.terminate()
asyncio.run(main())
