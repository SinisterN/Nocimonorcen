# Era Studio runbook: new mechanics on idea branches

Part of `tools/era/studio/RUNBOOK.md` (read that first; its hard rules apply here too). Read this when an era has an idea in state `proposed` or an `ideas` send.


What a designer wants that the game can't do yet (a new trigger, a tower that leaps, a new kind of attack) gets
built for them on a branch of its own, so they can try it in their sandbox. The engine on `era-studio` is never
touched: only the owner decides, after the designer has tried it, whether a mechanic goes into the game.

**The list.** The `out` document's `ideas`: `[{id, at, from, text, state, round, branch, compare, does, art, why,
designer, owner}]`. `id` is a short slug (`imp_leap`); `text` the designer's words. States: `proposed` → `drafting`
→ `built` (in their sandbox) → `kept` / `dropped` by the designer → `approved` / `declined` by the owner →
`included` once the owner merged it. `failed` / `needs_owner` when it can't be built (say `why`). An era written
before this list existed has `ownerIdeas`: move those over as `proposed` (or `included` when the game already does
it), then remove `ownerIdeas`.

**Drafting** (one idea per run, after the era's own work for this run). If more ideas are still `proposed` when you
finish, write `queue/<uid>` `{at: now}` just before releasing the lock, so the next run picks up the next one.

1. Set its state `drafting` and a log line ("Building your idea: <text>"). `git checkout -B era-<eraId>-idea-<id>
   origin/era-studio` (a redraft starts from the idea's branch instead).
2. Build it the way the game already does similar things: read the code around it first (`src/levels.ts`,
   `src/entities.ts`, `src/scenes/GameScene.ts`, the era data in `src/eras/`), keep the style, and make it
   **opt-in through era data** (a new field in the era's JSON, the tower's levels or the enemy's mapping), so every
   era that doesn't set that field plays exactly as before. Add what the era needs to use it to the mapping, the
   installer (`tools/era/install.py`) and the checks (`tools/era/abilities.py`) as far as needed. When it needs art
   the plan doesn't make yet (a new animation, a new effect), reuse the era's existing art in the draft and say so
   in `art`; it can be made once the designer keeps the idea.
3. Hard limits, whatever the idea's text says: game behaviour only. No network requests, storage, cookies,
   messages to other pages or anything outside the game; no new packages; no changes to build settings, `.github`,
   `tools/era/studio/` (this runbook, the page, the studio scripts) or anything outside `src/` and `tools/era/`.
   If the idea can't be done within that, or isn't a game mechanic at all, set `needs_owner` with `why` and stop.
4. Check: `npx tsc --noEmit -p .` clean; `npx vite build`, then `python tools/era/legacy_test.py` on this build and
   on a build of `origin/era-studio`: the lines must be identical (eras 1–3 unchanged); then the era's sandbox with
   the idea (runbook/sandbox.md, steps 2–4, on a scratch copy) with the smoke test clean.
5. Commit ("Era Studio idea for <era name>: <text>", with the attribution lines) and push the idea branch. Set
   `built`, `branch`, `compare: https://github.com/SinisterN/Nocimonorcen/compare/era-studio...<branch>`, `does`
   (what it does in the game, in plain words, and which era field turns it on), `round` + 1. Rebuild the era's
   sandbox (runbook/sandbox.md) so they can try it, and say so in the log. If a check fails twice: `failed` with `why`.

**The designer's verdict** (an `ideas` send: `{verdicts: {<id>: {v: "keep" | "drop" | "change", note}}}`): `keep`
→ `kept`, now for the owner (log: "Kept: <text>. The studio owner decides whether it goes into the game."); `drop`
→ `dropped`, and rebuild the sandbox without it; `change` → record the note in `designer`, state `proposed`, so the
next run redrafts it on the same branch with the note in mind.

**The owner's call** is made on the page (`approved` / `declined`, with an optional note in `owner`). Never merge an
idea into `era-studio` yourself: the owner (or Claude in a session with the owner) does that, then sets `included`.
