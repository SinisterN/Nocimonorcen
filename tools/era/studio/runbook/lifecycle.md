# Era Studio runbook: an era's life (pause, resume, edit again, delete)

Part of `tools/era/studio/RUNBOOK.md` (read that first; its hard rules apply here too). Read this for a `pause`,
`resume`, `edit` or `delete` send.

Everything an era has is saved as it happens (the brief and picks in `in/`, the takes and log in `out/`, the studio's
state in `work/`, the picked files on the PC), so an era can always be opened again and carried on. Its sandbox can
be built again at any time from those: the era branch `era-<eraId>` is only build output.

**Never clean up an era's picked files** (the files its work file records as picked) while the era exists, live or
not: they are what its sandbox and any later edit are rebuilt from.

## Pause and resume

- `pause`: mark the send processed, set `out.status` to `paused` and the message "Paused. Everything is saved." Don't
  start any job for a paused era (`in/<uid>/eras/<draft>.paused` is true); a job already on the PC may finish, and
  its takes go up as usual. Picks sent while paused are read but start nothing.
- `resume`: mark it processed, then carry on as the working loop says (everything `studio.py ready` lists). If the
  era already had a sandbox, rebuild it now (runbook/sandbox.md, same `sandboxUrl`): the game code may have changed
  while it was paused. Status and message as usual ("Welcome back: …").

## Edit a live era again (`edit`, owner only)

The era is in the game (`out.golive.live`). Mark the send processed, set `out.editing: true`, clear
`golive.approvedFor`, `golive.playedAt`, `golive.remarksDoneAt` (keep `golive.live`), rebuild the sandbox from its
work file and picks (runbook/sandbox.md, same `sandboxUrl`; it was kept), and say so: "Open for editing. Play the
sandbox and send notes: redos, balance and new mechanics work as before. When you're done, the owner reviews it again
and decides whether it replaces the live version or is added as another era." From there it is a normal era:
notes reopen items, ideas go on idea branches, the effects round runs again only when the notes ask about effects.
Never touch the live game: the owner brings the new version in with Claude (`golive.mode`: `overwrite` replaces the
live era's files; `add` puts it in as a new era with its own id and name).

## Delete (`delete`)

Only for an era that isn't live (`golive.live`); if it is, mark the send processed and set `approval` (kind
`review`): "A live era can't be deleted from the studio; the owner takes it out of the game with Claude." Anyone may
delete their own era; the page asks them to type its name first.

1. Set `out.status` to `deleting`, message "Deleting this era and everything made for it."
2. **The PC files**: list every file the era's work file knows (every round's takes, not only picks), its folders
   under `assets/studio/<eraId>/`, `assets/batches/studio/<eraId>/`, its animation folders, `guides/studio/<eraId>_*`
   and `manifests/studio/<eraId>-*`. You never delete files on the PC: write
   `D:\dev\game-asset-mcp\assets\delete_<eraId>.bat` (with `device_commit_files`) that moves exactly those into
   `assets\_to_delete\<eraId>\` (like `move_old_batches.bat`: `move`, a summary line, `pause`), and tell the owner to run
   it and delete the folder when they're happy.
3. **Code**: delete the era's build branch and idea branches on GitHub (`git push origin --delete era-<eraId>
   era-<eraId>-idea-<id> …`). Only these; never `main` or `era-studio`. Ideas already put in the game stay.
   Deleting a branch may be refused from a cloud session (it was on 24 Oct, HTTP 403): then don't retry or work
   around it; list the branches in the owner's summary to delete on GitHub's Branches page.
4. **The studio page's files**: delete every take uploaded for this era from STUDIO's asset store (`Artifact`
   delete with STUDIO's url and each take's `blob` id, from the era's items), then the database documents:
   `out/<uid>/eras/<draft>/items/*`, `in/<uid>/eras/<draft>/picks/*`, `in/<uid>/eras/<draft>/sends/*`,
   `work/<draft>`, `out/<uid>/eras/<draft>`, and finally set `in/<uid>/eras/<draft>` to `{deleted: true, name,
   deletedAt}` (a tombstone, so a late send can't bring it back). For a team era (`team/crew/...`, `teamout/crew/...`) also delete
   `crew/<draft>` and `team/crew/eras/<draft>/editor/lock`.
5. **The sandbox page**: delete it (`Artifact` delete with its `sandboxUrl`). If that needs the owner's
   confirmation and nobody can give it in this run, leave it and write an `approval` (kind `review`) for the owner:
   "Delete the old sandbox page <url> from your artifacts."
6. Log a summary for the owner on `studio/status` (`lastDeleted: {era, at, pcScript, left}`) and stop on this era.
