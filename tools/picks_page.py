"""Builds pick.html for an image batch: every asset's variants side by side, tick boxes, redo notes and a picks export.
Same look and export format as the connector's listen.html for audio: {"picks": {id: [n, ...]}, "redo": {id: "note"}}.

usage: python tools/picks_page.py <manifest.json> <out pick.html> [section rules as id-prefix=Title ...]
The page is meant to sit in the batch's output folder, next to <id>_v<n>.png.
"""
import html
import json
import sys
from pathlib import Path


def main():
    manifest = json.loads(Path(sys.argv[1]).read_text())
    out = Path(sys.argv[2])
    rules = [a.split("=", 1) for a in sys.argv[3:]] or [["", "Assets"]]
    defaults = manifest.get("defaults", {})
    name = manifest["name"]

    sections: dict[str, list[str]] = {}
    for a in manifest["assets"]:
        title = next((t for p, t in rules if a["id"].startswith(p)), rules[-1][1])
        n = a.get("variants", defaults.get("variants", 1))
        wide = a.get("mode", defaults.get("mode")) == "scene"
        cards = "".join(
            f'<label class="take{" wide" if wide else ""}"><span class="top"><input type="checkbox" value="{i}"> v{i}</span>'
            f'<img loading="lazy" src="{a["id"]}_v{i}.png" alt="{a["id"]} v{i}"></label>'
            for i in range(1, n + 1))
        prompt = html.escape(a["prompt"].removeprefix("Edit image 1: ")[:260])
        sections.setdefault(title, []).append(
            f'<section class="sound" data-id="{a["id"]}"><div class="head"><h3>{a["id"]}</h3><span class="count"></span></div>'
            f'<p class="prompt">{prompt}…</p><div class="takes">{cards}</div>'
            f'<input class="note" type="text" placeholder="Not happy with any version? Say what to change and it gets redrawn"></section>')

    body = "".join(f"<h2>{t}</h2>" + "".join(s) for t, s in sections.items())
    page = TEMPLATE.replace("__NAME__", html.escape(name)).replace("__BODY__", body)
    out.write_text(page, encoding="utf-8")
    print(out)


TEMPLATE = """<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>__NAME__</title>
<style>
 :root{--bg:#f4efe4;--card:#fffdf8;--ink:#2b1d12;--muted:#7a6650;--accent:#b5652a;--ok:#4f8a3a;--warn:#a8432c;--line:#e3d8c4;--tile:#cfc6b8}
 body.darkbg{--tile:#2a2530}
 *{box-sizing:border-box} body{font-family:system-ui,"Segoe UI",sans-serif;background:var(--bg);color:var(--ink);margin:0;padding:24px 16px 170px}
 main{max-width:1280px;margin:0 auto} h1{font-size:24px;margin:0 0 4px} .lead{color:var(--muted);margin:0 0 12px}
 .tools{margin:0 0 16px;display:flex;gap:8px;align-items:center;font-size:13px;color:var(--muted)}
 .tools button{font:inherit;padding:6px 10px;border-radius:8px;border:1px solid var(--line);background:#fff;cursor:pointer}
 h2{font-size:15px;text-transform:uppercase;letter-spacing:.06em;color:var(--accent);margin:28px 0 10px}
 .sound{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:0 0 10px}
 .sound.done{border-color:var(--ok);box-shadow:inset 4px 0 0 var(--ok)} .sound.redo{border-color:var(--warn);box-shadow:inset 4px 0 0 var(--warn)}
 .head{display:flex;align-items:baseline;gap:10px} h3{font-size:16px;margin:0} .count{font-size:12px;color:var(--muted)}
 .prompt{margin:2px 0 10px;font-size:12px;color:var(--muted)}
 .takes{display:flex;flex-wrap:wrap;gap:10px}
 .take{display:flex;flex-direction:column;gap:6px;padding:8px;border:1px solid var(--line);border-radius:10px;cursor:pointer;background:#fff;width:240px}
 .take.wide{width:410px}
 .take:has(input:checked){border-color:var(--ok);background:#eef6e8}
 .take .top{font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px}
 .take input{width:18px;height:18px;accent-color:var(--ok)}
 .take img{width:100%;aspect-ratio:1;object-fit:contain;border-radius:6px;cursor:zoom-in;
   background:var(--tile) repeating-conic-gradient(#0000 0 25%,#ffffff14 0 50%) 0 0/20px 20px}
 .take.wide img{aspect-ratio:16/9}
 .note{margin-top:10px;width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font:inherit;font-size:13px;background:#fff}
 #zoom{position:fixed;inset:0;background:#000c;display:none;align-items:center;justify-content:center;z-index:10;cursor:zoom-out}
 #zoom img{max-width:94vw;max-height:90vh;background:var(--tile)} #zoom.on{display:flex}
 #export{position:fixed;left:0;right:0;bottom:0;background:#2b1d12;color:#fff7e6;padding:12px 16px;box-shadow:0 -4px 16px #0004}
 #export .inner{max-width:1280px;margin:0 auto;display:flex;gap:12px;align-items:stretch}
 #export textarea{flex:1;min-height:76px;max-height:120px;font:12px ui-monospace,Consolas,monospace;border-radius:8px;border:0;padding:8px;resize:vertical}
 #export .side{display:flex;flex-direction:column;gap:6px;min-width:190px}
 #export .stat{font-size:13px} #export button{font:inherit;font-weight:600;padding:8px 12px;border-radius:8px;border:0;cursor:pointer;background:#e9b44c;color:#2b1d12}
 #export button.secondary{background:#5a4636;color:#fff7e6}
 @media (max-width:700px){#export .inner{flex-direction:column} .take,.take.wide{width:100%}}
</style></head><body class="darkbg"><main>
<h1>__NAME__</h1>
<p class="lead">Tick the versions you like (click a picture to see it big), and leave a note on anything that needs another go. Your choices are kept if you close the page. When you're done, press <b>Copy picks</b> and paste the result into the chat.</p>
<div class="tools">Background: <button id="bg">Switch light / dark</button></div>
__BODY__
</main>
<div id="zoom"><img alt=""></div>
<div id="export"><div class="inner">
  <textarea id="out" readonly></textarea>
  <div class="side">
    <span class="stat" id="stat"></span>
    <button id="copy">Copy picks</button>
    <button id="download" class="secondary">Download picks.json</button>
    <button id="clear" class="secondary">Clear all</button>
  </div>
</div></div>
<script>
const KEY = "picks:" + document.title;
const items = [...document.querySelectorAll(".sound")];
function load() { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } }
function save(state) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }
function collect() {
  const picks = {}, redo = {};
  for (const s of items) {
    const id = s.dataset.id;
    const takes = [...s.querySelectorAll("input[type=checkbox]:checked")].map((c) => +c.value);
    const note = s.querySelector(".note").value.trim();
    if (takes.length) picks[id] = takes;
    if (note) redo[id] = note;
    s.classList.toggle("done", takes.length > 0 && !note);
    s.classList.toggle("redo", !!note);
    s.querySelector(".count").textContent = takes.length ? takes.length + " picked" : "";
  }
  return { picks, redo };
}
function pretty(r) {
  const block = (o) => Object.keys(o).length
    ? "{\\n" + Object.entries(o).map(([k, v]) => "  " + JSON.stringify(k) + ": " + JSON.stringify(v)).join(",\\n") + "\\n }"
    : "{}";
  return "{\\n \\"picks\\": " + block(r.picks) + ",\\n \\"redo\\": " + block(r.redo) + "\\n}";
}
function refresh() {
  const result = collect();
  save(result);
  document.getElementById("out").value = pretty(result);
  const done = items.filter((s) => s.classList.contains("done")).length;
  const redo = Object.keys(result.redo).length;
  document.getElementById("stat").textContent = done + " of " + items.length + " picked" + (redo ? ", " + redo + " to redo" : "");
}
const saved = load();
for (const s of items) {
  const id = s.dataset.id;
  for (const c of s.querySelectorAll("input[type=checkbox]")) {
    c.checked = (saved.picks?.[id] || []).includes(+c.value);
    c.addEventListener("change", refresh);
  }
  const n = s.querySelector(".note");
  n.value = saved.redo?.[id] || "";
  n.addEventListener("input", refresh);
}
// click a picture to see it big (without ticking it)
const zoom = document.getElementById("zoom");
document.querySelectorAll(".take img").forEach((img) => img.addEventListener("click", (e) => {
  e.preventDefault(); zoom.querySelector("img").src = img.src; zoom.classList.add("on");
}));
zoom.onclick = () => zoom.classList.remove("on");
document.addEventListener("keydown", (e) => { if (e.key === "Escape") zoom.classList.remove("on"); });
document.getElementById("bg").onclick = () => document.body.classList.toggle("darkbg");
document.getElementById("copy").onclick = async () => {
  const t = document.getElementById("out");
  try { await navigator.clipboard.writeText(t.value); } catch { t.select(); document.execCommand("copy"); }
  document.getElementById("copy").textContent = "Copied!";
  setTimeout(() => (document.getElementById("copy").textContent = "Copy picks"), 1500);
};
document.getElementById("download").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([document.getElementById("out").value], { type: "application/json" }));
  a.download = "picks.json"; a.click();
};
document.getElementById("clear").onclick = () => {
  if (!confirm("Clear all picks and notes?")) return;
  items.forEach((s) => { s.querySelectorAll("input[type=checkbox]").forEach((c) => (c.checked = false)); s.querySelector(".note").value = ""; });
  refresh();
};
refresh();
</script></body></html>
"""

if __name__ == "__main__":
    main()
