# Nocimonorcen TD

Isometric tower defense with puzzle-driven upgrades. Built with Phaser 4, TypeScript and Vite.

## Run it

1. Install [Node.js](https://nodejs.org) (version 20 or newer).
2. In this folder, run `npm install` once.
3. Run `npm run dev` and open the address it prints (usually http://localhost:5173).
   Saving a file reloads the game automatically.
4. `npm run build` writes the finished game to `dist/`. Run `npm run preview` to play that build,
   or upload the whole `dist/` folder to any static host (itch.io, Netlify, GitHub Pages).

## Play online

Every push to `main` rebuilds the game and publishes it to GitHub Pages:
https://sinistern.github.io/Nocimonorcen/

## Controls

| Action | Mouse / touch | Keyboard |
| --- | --- | --- |
| Pick a tower to build | Bottom buttons | 1, 2, 3 |
| Build | Click a grass tile | |
| Select a built tower (shows range, sell) | Click it | |
| Cancel | Right-click | Esc |
| Start the next wave | Start wave button | Space |
| Game speed 1x / 2x / 3x | Speed button | F |

## Where things live

| File | What it holds |
| --- | --- |
| `src/config.ts` | All tunable numbers: towers, enemies, waves, gold, path. Start balancing here. |
| `src/upgrades.ts` | The 6-option draft, reward tiers, failure penalty, pity floor. |
| `src/entities.ts` | Enemy, Tower and Path classes, plus their placeholder drawings. |
| `src/iso.ts` | Grid ↔ isometric screen conversion. |
| `src/scenes/GameScene.ts` | The game loop: building, waves, shooting, HUD, draft screen, win and lose. |

## Status (milestone 1)

Done: isometric map and path, 3 enemy types, 3 towers (arcing, straight, splash), 9 waves,
gold and selling, cabin HP and 3 campaign lives, range overlay, upgrade draft after waves 3 and 6.

Placeholder: the puzzle break lets you *choose* a result (Failed to Gold) so the draft can be tested.

Next: the three real puzzles (tangram, pattern memory, falling blocks) replacing that placeholder.

Debugging tip: in the browser console, `game.scene.getScene('Game').gold = 9999`.
