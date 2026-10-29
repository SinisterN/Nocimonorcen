# Era Studio runbook: briefs, How it plays, the road

Part of `tools/era/studio/RUNBOOK.md` (read that first; its hard rules apply here too). Read this when an era has a `brief` send, is in its "How it plays" round (`studio.py next` answers `mechanics`), or has a road to make or pick.

**A brief** (no work file yet): pick the era id — the lowest `eraN` (N ≥ 4) not used by `src/eras/*.json` or any
`work/*` document. Save the brief's `spec` to `spec.json`, then
`python tools/era/studio/studio.py new work.json spec.json eraN <budgetMinutesPerEra>`.
If it reports problems, set status `your_turn` with a message listing them in plain words and stop on this era.
Otherwise write `out/...` (`eraId`, `name`, `budgetMinutes`, `gpuMinutesUsed: 0`, status `running`, a log line with
the plan's first-pass estimate) and continue below.

**How it plays (first round of every brief).** Briefs describe towers and enemies freely, with the designer's
own stats; the game's mechanics are fixed code. While `studio.py next` answers `{"step": "mechanics"}`, no art is made:

- Read `tools/era/behaviours.json` (each behaviour's label, description, level 3 upgrade, stats, `boss`) and the
  projectile details in `tools/era/builtins.json`. For each tower pick the behaviour whose way of attacking best
  matches its `extras` and levels (single shots, arcing shells with splash, fast tracer fire, piercing beam, heavy
  bolts, fighter crew…). For each enemy pick the one that best matches its `description` (fast and fragile, heals
  others, charges towers, explodes, shields, climbs…). The boss only gets a boss behaviour, the others never do.
  Two towers may share a behaviour, except the fighter crew (`killer`), which only one tower may use.
- **Towers evolve per level.** Besides its behaviour (the base way of attacking: shot type, range, the rest), map
  each tower's three levels (`levels[n].does` and `levels[n].special` in the brief, plus `extras`) onto the blocks
  in `tools/era/abilities.py` (read its header): `damage`, `splash`, `pierce`, `spread`, `chill`, `burn`, `homing`,
  `multi`, `second`, `line`, and a special every Nth shot (`every`, it replaces that shot) or every N seconds
  (`everySec`, on top). Give each level a short `name` and `text` (shown in the game's upgrade menu), and `units: 2`
  only when the designer asks for two units. Fill the levels the designer left plain with a modest step up (the
  game's own levels already add damage, rate and range); don't add specials they didn't ask for. Check them with
  `python tools/era/abilities.py levels.json <fireDelay>`: fix anything under `problems` that's out of range; a
  level over the power guide needs the owner's OK (status `approval`, kind `review`) before the art starts. The
  behaviour's own level 3 trait (Twin Archers, Hellfire…) does **not** apply to a tower with levels: say what each
  level does instead. A level may have up to 3 specials (`specials`: a frost bolt every third cast **and** a frozen
  orb every 10 s). A continuous attack (a flame jet, an ice breath) is the `stream` block: in bursts it hits
  everything in a cone; its `length` is also how far it reaches, so say on the card when that's shorter than the
  tower's range; `burn` with a stream leaves a burning trail under its target. A special the designer keeps from an earlier level is listed again at the later level under the
  same `name` (it shares its pictures).
- **Damage types and resistances.** When the brief talks about kinds of damage (ice, fire…), give each tower a
  `type` in its mapping (`{"behaves", "type": "ice", "levels"}`; a level's attack or special may have its own
  `type`), and give each enemy that resists or suffers from a type a `resist` map from its "Resists or is weak to"
  field or description: `{"ice": 0.5, "fire": -0.5}` = half damage from ice, 50% more from fire (range -0.5 to 0.8).
  Say it on the cards ("Takes 50% less ice damage and 50% more fire damage", from `say_resist`). Use one word per
  type, the same word for towers and enemies.
- **Enemies with more than one form** (a wolf that rises into a werewolf, a golem that cracks open…): give the
  mapping `forms` (`{"upright": {"look": "<the other form, in the designer's words>", "speed": 1.0, "armor": 1}}`,
  speed 0.5–2, armour 0–8) and `transform` (`{"when": "firstHit", "to": "upright", "heal": {"lethal": 0.5,
  "missing": 0.5}, "text": "rears up onto its hind legs"}`). `firstHit` is the only trigger so far; other triggers
  are owner ideas. `heal` is only for enemies whose designer asked for it (`lethal`: a killing first hit makes it
  change instead, back on that share of its health; `missing`: otherwise it heals that share of what it lost).
  Say it on the card with `say_forms`. The plan then adds the form's pictures (`forms`, `forms_back`) and its own
  walk, walk away, attack and death, plus a `transform` animation from the first form.
- **Use the designer's own words.** Before acting on any note, record it in the work file (for a "How it plays"
  card: append `{round, note}` to `mechanics[<kind>].notes`; for art items it's in the round record), and check the
  new card against *every* note for that card, not only the last one. Never add effects they didn't ask for (a slow,
  a damage type…) to make a level feel stronger: a plain step up in damage is enough. When a note is ambiguous
  ("10%" could be the slow or the speed), say on the card how you read it.
- Write one item per tower and enemy: `out/.../items/mech_<kind>` with `step: "mechanics"`, `title` (its name),
  `kind: "text"`, `round`, `status: "awaiting"` and one take `{n: 1, text}`. The text, in plain words:
  "Plays like the <label> (the <example>): <description>." / for towers, one line per level from `describe` in
  abilities.py (what the level does and its special) / "Your stats: …" /
  "New mechanic: <anything they asked for that the game can't do yet>. The studio builds it on its own branch, so
  you can try it in your sandbox; meanwhile it plays as described above." (leave the last line out when everything
  fits). Add each one to the `out` document's `ideas` list (runbook/ideas.md) with state `proposed`.
- Status `your_turn`, message "Here's how your towers and enemies will play. Confirm each one, or say how it should
  play instead."
- On their picks: a take means confirmed (keep `{behaves, text}` for that kind, and for towers `levels`); a redo note means map that one
  again with the note in mind (round + 1, same item). When every one is confirmed, write the mapping to
  `mapping.json` and run `studio.py mechanics work.json mapping.json`, which builds the art plan. Then carry on
  with the working loop (RUNBOOK.md, section 4) in the same run: `studio.py ready` now lists the road and every
  first round that needs nothing picked yet (towers, shots, enemies, sounds, music, hero lines).
- **Again for some towers or enemies (`remap`).** When `studio.py next` answers `{"step": "mechanics", "remap":
  [kinds]}`, an era already past this round needs those confirmed again (the tools learned per-level attacks,
  damage types and resistances). Do the round for just those kinds (their behaviour stays; map levels, types and
  resistances), as a new round of their `mech_<kind>` items,
  message "Your towers can now change per level. Here's what each level does; confirm or say what to change." Art
  steps wait until they're confirmed; then `studio.py mechanics` with those towers (keep `behaves`, add `levels`)
  clears the remap and replans: steps that gained items (shots, units…) make only the new ones.
- A tower whose power (damage / fireDelay / cost × 100) is over 70 needs the owner's OK before the art starts:
  status `approval`, reason "<tower> is much stronger than the game's towers (power N)".

**Road (first art round, no GPU, no PC).** Every era gets its own winding road. When `studio.py ready` lists
`road`: run `studio.py roads work.json roads/`. It draws 3 road options (`roads/<era>_road_<n>.png`: the road,
tower pads and the start and end buildings, which is also the guide the map painter follows). Upload the 3
pictures and write the item `out/.../items/<era>_road`: `step: "road"`, `title: "Road"`, `kind: "image"`,
`wide: true`, `hint: "Where the enemies walk and where towers can stand. The map gets painted around the road you
pick."`, the takes, `round`, `status: "awaiting"`, and `recommended`: the option whose shape best fits the brief
(say why in the log). Status `your_turn`, message "Pick the road for your map: 3 options." Each option's
`toughness` is the enemy health it brings (how much road the best 8 pads can reach, against Era 3's layout; the
Frozen Pass's serpentine was 1.74x and played right): add it to the hint per option, e.g. "Option 2: 58 tiles,
enemies 2.05x tougher (pads beside several bends)". The installer applies it, times `spec.difficulty`.
- A take → `studio.py pick work.json <era>_road <n>`. Then, before the map job: `studio.py road-guide work.json
  <fresh outputs folder>/<era>_road.png`, copy it to `D:\dev\game-asset-mcp\guides\studio\<era>_road.png` with
  `device_commit_files`, and run the map (`world`) job, which follows that guide. Before putting map takes up, look
  at them: only show takes whose road follows the guide's road (same bends, pads beside it) and whose start building
  (the brief's start: cave, gate…) stands where the road begins, not somewhere else; at most 4 of the 6. If fewer
  than 2 pass, run the job once more with a new seed before asking the owner.
- A redo note → `studio.py roads` again (each round draws new roads). The generator can't read the note; from a
  larger set (run it twice) put up the 3 that fit the note best, and say so in the message.
- A map redo note that asks for a different road shape (longer, more bends, another direction…) means a new Road
  round: run `studio.py roads` and go back to picking the road, no owner approval needed.
