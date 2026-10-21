"""Builds an Era 3 sign-off picks page: one row of takes per asset, a redo note each, and a picks export to paste
into the chat ({"picks": {id: n}, "redo": {id: "note"}}).

usage: python tools/gate_page.py <spec.json> <out folder>
spec.json: {"kicker", "title", "intro", "assets": [{"id", "title", "note", "files": [png paths, one per version]}]}
Writes <out>/index.html and a .webp thumbnail per take next to it.
"""
import html
import json
import sys
from pathlib import Path

from PIL import Image

STYLE = """
/* Layout: one column of decisions, each asset a row of takes to pick from; picks export pinned at the bottom. */
:root { --bg:#f3efe6; --panel:#fffdf8; --ink:#1f1a17; --dim:#6d645b; --line:#d9d0c2; --accent:#b23a2a; --sel:#1f1a17;
  --display:"Zen Kaku Gothic New", "Hiragino Sans", "Segoe UI", sans-serif; --body:"Noto Sans", "Segoe UI", sans-serif; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#16130f; --panel:#211c17; --ink:#f1e9dd; --dim:#a99c8c; --line:#3a3229; --accent:#e0644f; --sel:#f1e9dd; color-scheme:dark; } }
:root[data-theme="dark"] { --bg:#16130f; --panel:#211c17; --ink:#f1e9dd; --dim:#a99c8c; --line:#3a3229; --accent:#e0644f; --sel:#f1e9dd; color-scheme:dark; }
body { background:var(--bg); color:var(--ink); font:15px/1.55 var(--body);
  padding-left:max(16px, env(safe-area-inset-left, 0px)); padding-right:max(16px, env(safe-area-inset-right, 0px)); padding-block:28px 64px; }
.wrap { max-width:1100px; margin:0 auto; display:flex; flex-direction:column; gap:20px; }
header .kicker { font:700 12px var(--display); letter-spacing:.18em; text-transform:uppercase; color:var(--accent); }
header h1 { font:900 clamp(26px,4vw,38px)/1.1 var(--display); margin:4px 0 8px; text-wrap:balance; }
header p { margin:0; color:var(--dim); max-width:70ch; }
.asset { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; display:flex; flex-direction:column; gap:10px; }
.head { display:flex; justify-content:space-between; align-items:baseline; gap:12px; }
.head h3 { margin:0; font:700 17px var(--display); }
.pickcount { font-size:13px; color:var(--accent); font-weight:600; }
.note { margin:0; color:var(--dim); font-size:14px; max-width:80ch; }
.takes { display:grid; grid-template-columns:repeat(auto-fill, minmax(min(100%, 200px), 1fr)); gap:12px; }
.take { position:relative; display:flex; border:2px solid var(--line); border-radius:8px; cursor:pointer; overflow:hidden;
  background:repeating-conic-gradient(color-mix(in srgb, var(--line) 45%, transparent) 0 25%, transparent 0 50%) 0 0/18px 18px; }
.take img { width:100%; aspect-ratio:3/4; object-fit:contain; padding:10px; }
.take input { position:absolute; opacity:0; }
.take .v { position:absolute; top:6px; left:8px; font:700 12px var(--display); background:var(--panel); border:1px solid var(--line); border-radius:4px; padding:1px 6px; }
.take:has(input:checked) { border-color:var(--sel); box-shadow:0 0 0 2px var(--sel); }
.take:has(input:checked) .v { background:var(--sel); color:var(--bg); }
.take:has(input:focus-visible) { outline:3px solid var(--accent); outline-offset:2px; }
.redo, textarea { width:100%; box-sizing:border-box; font:14px var(--body); color:var(--ink); background:var(--bg); border:1px solid var(--line); border-radius:6px; padding:8px 10px; }
.export { position:sticky; bottom:0; background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:14px 16px; display:flex; flex-direction:column; gap:10px; box-shadow:0 -6px 18px rgba(0,0,0,.08); }
.export .row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
button { font:700 14px var(--display); background:var(--ink); color:var(--bg); border:0; border-radius:6px; padding:9px 16px; cursor:pointer; }
button:focus-visible { outline:3px solid var(--accent); outline-offset:2px; }
#status { font-size:13px; color:var(--dim); }
textarea { min-height:60px; font-family:ui-monospace, Menlo, Consolas, monospace; font-size:12.5px; }
"""

SCRIPT = """
const ids = [...document.querySelectorAll('.asset')].map(s => s.dataset.id);
function build() {
  const picks = {}, redo = {};
  for (const id of ids) {
    const c = document.querySelector(`input[name="${id}"]:checked`);
    if (c) picks[id] = Number(c.value);
    const r = document.getElementById('redo_' + id).value.trim();
    if (r) redo[id] = r;
    document.querySelector(`.asset[data-id="${id}"] .pickcount`).textContent = c ? 'Picked v' + c.value : (r ? 'Redo requested' : '');
  }
  document.getElementById('out').value = JSON.stringify({ picks, redo });
  const done = ids.filter(id => picks[id] || redo[id]).length;
  document.getElementById('status').textContent = done + ' of ' + ids.length + ' decided.';
}
document.addEventListener('input', build); document.addEventListener('change', build); build();
document.getElementById('copy').addEventListener('click', () => {
  const t = document.getElementById('out');
  navigator.clipboard.writeText(t.value).then(() => { document.getElementById('status').textContent = 'Copied. Paste it into the chat.'; },
    () => { t.select(); document.getElementById('status').textContent = 'Press Ctrl+C to copy the selected text.'; });
});
"""


def main():
    spec = json.loads(Path(sys.argv[1]).read_text())
    out = Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
    secs = []
    for a in spec["assets"]:
        takes = []
        for v, src in enumerate(a["files"], 1):
            im = Image.open(src).convert("RGBA"); im = im.crop(im.getbbox()); im.thumbnail((520, 520), Image.LANCZOS)
            fn = f'{a["id"]}_v{v}.webp'; im.save(out / fn, "WEBP", quality=88)
            takes.append(f'<label class="take"><input type="radio" name="{a["id"]}" value="{v}"><span class="v">v{v}</span>'
                         f'<img src="{fn}" alt="{html.escape(a["title"])} v{v}" loading="lazy"></label>')
        secs.append(f'<section class="asset" data-id="{a["id"]}"><div class="head"><h3>{html.escape(a["title"])}</h3>'
                    f'<span class="pickcount" aria-live="polite"></span></div><p class="note">{html.escape(a["note"])}</p>'
                    f'<div class="takes">{"".join(takes)}</div><input class="redo" id="redo_{a["id"]}" type="text" '
                    f'placeholder="Not happy with any of these? Say what to change and it gets redrawn"></section>')
    page = (f'<title>{html.escape(spec.get("page_title", "Fallen Village Picks"))}</title>\n'
            '<meta name="claude:viewport-fit-sides" content="cover">\n'
            '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@500;700;900&family=Noto+Sans:wght@400;600&display=swap">\n'
            f'<style>{STYLE}</style>\n<div class="wrap"><header><div class="kicker">{html.escape(spec["kicker"])}</div>'
            f'<h1>{html.escape(spec["title"])}</h1><p>{html.escape(spec["intro"])}</p></header>{"".join(secs)}'
            '<div class="export"><div class="row"><button id="copy" type="button">Copy picks</button>'
            '<span id="status"></span></div><textarea id="out" readonly aria-label="Picks to paste into the chat"></textarea></div></div>'
            f'<script>{SCRIPT}</script>\n')
    (out / "index.html").write_text(page)
    print(json.dumps({p.name: str(p) for p in sorted(out.glob("*.webp"))}))


if __name__ == "__main__":
    main()
