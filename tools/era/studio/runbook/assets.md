# Era Studio runbook: making and checking takes

Part of `tools/era/studio/RUNBOOK.md` (read that first; its hard rules apply here too). Read this before making or putting up shots, hits, units, sounds, hero lines or animations.

**Shots, hits and tower units.** Every tower has its own look for what it fires and what a hit looks like
(`shots` step: small effect pictures, no shape guide): level 1's, a level's own when the designer described a new
shot for it (`_l2`, `_l3`), and each special's shot and hit (`_sp<n>`, always a flying shot). Towers whose mechanic
has a unit standing on top (the Sharpshooter's archer) get their own unit per level (`units` for level 1, painted in
the tower's style; `units_l23` for the stronger level 2 and 3 versions, in the style of the picked level 1 unit) and
per level an idle and an attack animation, plus a cast animation for a level with a special (`unit_anims`).
When a replan adds items to a step that already has picks, `studio.py job` makes only the new ones. In the "How it plays" cards, say which
towers get a unit; a unit described for a tower whose mechanic has none goes to the owner as an idea, and a
Sharpshooter-type tower without a described unit gets one that fits its look (say so on the card).
- Show only effect takes that are one clean object on a plain background (a shot pointing right, a burst centred);
  leave out takes with scenery, several objects or text.
- **Mark the spots** once the pictures they belong to are picked (look at each picked picture yourself):
  - Unit towers, after levels 2 and 3 are picked: where the unit's feet stand on each level's picture (the floor of
    its top platform, centred), as fractions of the picture's width and height:
    `studio.py set-feet work.json <tower kind> x1 y1 x2 y2 x3 y3`.
  - Every other tower, after level 1 is picked: where its shots leave the picture (the barrel's mouth, the crystal's
    tip…): `studio.py set-muzzle work.json <tower kind> x y`.
  Fractions are measured on the picture with its plain background trimmed away (the installer trims the same way).

**Sounds.** Besides the shared moments, each tower's shot and each enemy's call, the sounds round has each tower's
own hit (`hit_<kind>`), each level that fires something new (`shot_<kind>_l2/_l3`; a stream's is as long as its
burst and should be one steady roar), each special (`special_<kind>_<special>`), burning ground (`burn`, when a
tower burns) and each form change (`transform_<enemy>`). Show only takes that fit their length (a stream that cuts
out halfway, a hit with a long tail…).
- **Layered sounds.** Sounds the plan marks with `parts` (the explosion, the base being hit, a big death) are
  layered from their first round: the job lists `layers`, handled as below. The sound model makes one simple sound per call; a sound that is really a sequence or a blend
  ("a whooshing build-up, then an icy release", "a big boom followed by ice shards falling", "bones cracking while it
  howls") comes out muddled or as only one of its parts. Build those from parts: whenever the designer asks to split
  or combine, *and* whenever a sound's notes have described a sequence or blend and a round has failed, write its
  redo as `{"note": "<their words>", "parts": [{"prompt": "<one simple sound>", "seconds": s, "at": offset, "gain": dB}, ...]}`
  (2–3 parts, each prompt a single plain sound event; `at` overlaps parts a little so they join, e.g. the release
  starts just before the build-up ends; a part that should sit under the others gets -3 to -6 dB). The job then
  makes each part separately and lists `layers`. After generating: stage the parts' takes, run
  `python tools/era/studio/layer_sound.py job.json <staged parts folder> <fresh outputs folder>`, copy the mixed
  `<id>_v<n>.flac` files to the PC with `device_commit_files` at `D:\dev\game-asset-mcp\assets\batches\<job output>\`
  (where a plain take would be), record those as the item's takes and put them on the page. Listen-check the mixes
  (length, no silence, the parts audible) and say in the log that the sound was built from parts and which ones.
- **A note on one part of a layered sound** ("a squeak at the start", "the crack is too quiet") usually means the
  balance is off, not the sounds: first remix the parts already made (no GPU) with new `at`/`gain` values or
  without the offending part, by writing a small job file whose `layers` point at the existing part ids and running
  `layer_sound.py` on the folder that holds those part takes; regenerate only the part the note is about.

**Hero lines.** Before the `hero_lines` job, write the 21 lines into the work file's `state.hero_lines` (ids from the
plan: `e<N>_<event>_<i>`). Same voice as the game's other eras: a wisecracking hero, short (under 8 words),
specific to this era's enemies, base and theme. Events: towerBuilt, kill, baseHit (panicked), waveStart,
waveCleared, towerSold. Show the text as each item's `hint`.

**Walk takes** (walk, walk away, and each form's walks): check each staged `sheet.png` with
`python tools/anim/walk_loop.py <sheet.png>` before putting it up. The game plays one walking cycle per two strides,
and the installer cuts the take to that cycle. A take reported not `ok` (no clean loop, the body sways sideways, or
the legs barely move: a take can loop cleanly because it hardly moves) will look wrong in the game: leave it out, like any off-brief take, and make another if fewer than 2 are
left. In the installer's output, a `WARNING` on a walk loop is a reason to reopen that walk.
