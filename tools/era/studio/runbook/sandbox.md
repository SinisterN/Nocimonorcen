# Era Studio runbook: the sandbox

Part of `tools/era/studio/RUNBOOK.md` (read that first; its hard rules apply here too). Read this when every step is picked (effects round, then the sandbox), or for a `sandboxNotes` or `rebuild` send.

## Effects round (when every step is picked, before the first sandbox build)

Hits, shots in flight, streams and burning ground are drawn by the game from a recipe of layers (flash, fireball,
smoke, sparks, embers, shards, mist, ring, ground mark, ice spikes, a small picture, a glowing core;
`src/fxRecipe.ts`), not shown as one picture: that is what makes them sit in the battlefield. The designer judges
them as clips recorded in the game, never as stills. Skip this round when the work file has `effectsDone`.

1. The plan's `effects` list (`plan.py`) has one item per tower level and per special: the designer's words for its
   hit and shot, the pictures from the shots step that may steer it (colours, shapes they liked) and its clip name.
   For each, write two recipe variants ("A" closest to their words, "B" a clearly different take: more smoke and
   less fire, shards instead of a fireball, a frost crust instead of a mark…), starting from the closest entries in
   `tools/era/fx_presets.json` and `tools/era/recipes/*.json` (The Frozen Pass's, which the owner liked). Keep sizes
   modest (splash `scale` 0.6–0.75 of the blast, direct hits 24–40 px); on bright maps give fire `"blend": "normal"`
   and keep `add` for small hot cores. A picked hit picture may be a small `image` layer or the `texture` of
   `shards`, never the whole effect. Check with `python tools/era/fx_recipes.py check <recipes.json>` and fix every
   problem.
2. Install (steps 1–3 below, without publishing) once with every tower's A recipes and once with its B recipes in
   `spec.towers[].recipes` (`{"l1": {"hitFx", "shotFx", "burnFx"}, "l2": …, "<special slug>": …}`), and record each
   build: `python tools/era/studio/fx_clips.py dist <eraId> <clips folder> [--only <clip>,…]` (5 s each, same scene
   and camera on both builds). Watch each clip yourself before it goes up: nothing bigger than the blast area, the
   hit units clearly marked, no picture popping up.
3. Put them up as items `step: "effects"`, `kind: "video"`, `title` ("Fire Cannon, level 2: hit"), `hint` (the
   designer's words), takes 1 = A and 2 = B (section 7 of RUNBOOK.md); status `your_turn`, message "See how your
   towers' hits look in the game: pick A or B for each, or say what to change."
4. A take → that variant's recipe goes into the spec tower's `recipes`. A redo note ("smaller", "more smoke", "the
   orb should leave frost on the road") → change the recipe only (layers, colours, sizes, counts within the limits),
   record that clip again and put it up as the next round. When every effect is picked: `studio.py effects-done
   <work>`, then build the sandbox.

Sandbox notes about how hits look ("explosions too big", "the frost hits are hard to see") are recipe changes too:
change the recipe (and `spec.tuning.impactScale`, which scales recipes) and rebuild.

## Build the sandbox (when every step is picked)

Set status `running`, message "Everything is picked. Building your playable sandbox (about 15 min)."

1. `studio.py install-state work.json state.json spec.json` and `studio.py stage-list work.json`. Stage each group
   with `device_stage_files`; the files land under `/mnt/user-data/uploads/`, keeping their path below the connected
   folder (check `stagedPath` in the result). The staged generator folder is the one that contains `output/`,
   `batches/` and `assets/` (normally `/mnt/user-data/uploads/dev/game-asset-mcp`).
2. In the repo: `git fetch origin` (a long run's clone can be behind), then `git checkout -B era-<eraId> origin/era-studio` (also when rebuilding: the era branch is only the
   build's output, the tools and game code come from era-studio). Merge every idea branch of this era whose state is
   `built`, `kept` or `approved` (`git merge --no-edit origin/era-<eraId>-idea-<id>`); if two ideas clash, leave the
   later one out and set it `failed` with why. Then `python tools/era/install.py spec.json state.json <staged generator folder>`. It writes
   `src/eras/<eraId>.json`, `public/sprites/<eraId>/...`, `public/sounds/<eraId>/...` and `src/anims/...`.
3. `npm ci`, then `VITE_PREVIEW=1 VITE_SANDBOX_ERA=<eraId> npx vite build` (its menu offers only this era), then
   `python tools/era/studio/sandbox_batches.py dist --keep <eraId> > batches.json`: this removes the other eras'
   pictures and sounds (era 1's shared art stays) so the build fits an artifact (at most 511 files per version;
   about 325 for one era), and fails if it would still be over 500.
4. `python tools/era/studio/smoke.py dist <eraId>` plays 6 waves headless on that trimmed build (a missing file
   shows up here, before anything is published). If `ok` is false: status `approval`,
   `approval.reason` "The sandbox failed its test: ..." with the errors or missing files, and stop on this era
   (don't publish).
5. Commit on `era-<eraId>` ("Era Studio: <name> sandbox build") with the usual attribution lines and push that
   branch. Never push to `main` or `era-studio`.
6. Publish the batches from step 3 (`batches.json`).
   - First time (no `sandboxUrl` in the work file): `Artifact` publish with `file_path: dist/index.html`,
     `root: dist`, `files: <batch 1>`, `title: "<era name> sandbox"`, `icon: "castle"`; then publish each other batch
     with the returned `url`, the same `file_path` and `root`.
   - Rebuild: `Artifact` `read` of the `sandboxUrl` first, then publish every batch with that `url`.
   - A publish that failed partway leaves a half-filled page whose files count against the limit (files left out
     of a later publish are kept): start a fresh sandbox page instead (no `url`), and leave the broken one for the
     owner to delete.
   Save the url in the work file as `sandboxUrl`.
7. Update `out/...`: `sandboxUrl`, `sandboxBuiltAt`, status `done`, message "Your sandbox is built. The studio owner
   shares it with you; then the Play button appears here." Leave `sandboxShared` alone (the owner sets it after
   sharing the sandbox page with the requester; on a rebuild it is already true). Add a log line with the smoke
   test result (waves played, base health left).

## Sends about the sandbox

**Sandbox notes** (a `sandboxNotes` send, after the designer played the sandbox): the send's `notes` are their
own words. Record them in the work file (`sandboxNotes`: append `{at, notes}`), mark the send processed, then sort
every point in the notes into one of these and act:
- **Art, animation or sound** of something that exists ("the yeti's attack looks stiff", "the boss call is too
  quiet"): a redo of that item with their words as the note (`studio.py job work.json <its step> redo.json`), which
  reopens it; the takes go on the page as usual and the sandbox is rebuilt once they're picked.
- **Balance** ("too easy", "the Fire Cannon is too strong", "the werewolves are too fast"): change the spec in the
  work file and say exactly what changed: tower stats (`spec.towers[].stats`) and enemy stats
  (`spec.enemies[].stats`, `spec.boss.stats`) within the brief form's slider ranges (`LIMITS` in
  `tools/era/studio/studio.template.html`), level blocks within `abilities.py`'s limits, or the whole era's
  difficulty `spec.difficulty` (enemy health, 0.6–1.6, default 1). Small steps (10–25%) per round.
- **Presentation** (sizes, loudness, how often a sound plays): set `spec.tuning` in the work file and say what
  changed: `enemyScale: {<enemy>: 0.6–1.6}` (only how big it's drawn: health, damage and where shots aim stay as they are), `impactScale: {<tower>: 0.3–1.5}` (its hit
  pictures, splash ones included), `sounds: {<sound id>: {volume 0.05–1, cooldown ms 40–10000, maxVoices 1–6}}`
  (enemy calls already get a 1.8 s gap and one voice). Then reinstall and rebuild; no new art needed.
- **How something plays** that the game's blocks can do (a level, a special, a resistance, a form): update the
  mapping and show it as a new round of that `mech_<kind>` card for them to confirm first.
- **What the game can't do yet**: a new mechanic, added to `ideas` (runbook/ideas.md).
Then write a log line per point ("Too easy → enemy health +15% (difficulty 1.15)", "Yeti attack → new takes up for
you"). When only balance changed, rebuild the sandbox straight away ("Build the sandbox" above, same `sandboxUrl`); when items
were reopened, the rebuild waits until they're picked. Status `your_turn` with a message saying what to expect.

**Rebuild** (a `rebuild` send, from the studio owner after a game engine fix on `era-studio`): mark the send
processed, add a log line with the send's `reason` ("Rebuilding your sandbox: <reason>"), and rebuild the sandbox
straight away ("Build the sandbox" above, same `sandboxUrl`), with nothing else changed: no new art, no spec changes. Act on it
only when every step is picked; otherwise mark it processed and say in the log that the sandbox will be built
once the steps are done.
