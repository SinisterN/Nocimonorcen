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
| Open the build menu | Click an empty stone plot | |
| Build a tower | Click it in the ring (hover to preview its range) | 1, 2, 3 while the ring is open |
| Sell a tower | Click the tower, then the coin | |
| Close the menu | Click anywhere else | Esc |
| Start the next wave | Start wave button | Space |
| Game speed 1x / 2x / 3x | Speed button | F |

There are 17 plots but you can only afford about 10 towers, so placement still matters.
Raised plots on rocky mounds are high ground: +25% range.

## Where things live

| File | What it holds |
| --- | --- |
| `src/config.ts` | All tunable numbers: towers, enemies, waves, gold, the road and the build plots. Start balancing here. |
| `src/upgrades.ts` | The 6-option draft, reward tiers, failure penalty, pity floor. |
| `src/entities.ts` | Enemy, Tower, Plot and Path classes. |
| `src/art.ts` | All code-drawn art: ground, scenery, plots, towers, enemies, HUD icons. Each drawing is anchored at its feet, so it can be swapped for a sprite later. |
| `src/iso.ts` | Grid ↔ isometric screen conversion. |
| `src/scenes/GameScene.ts` | The game loop: building, waves, shooting, HUD, draft screen, win and lose. |

## Status (milestone 1)

Done: painted-style map with build plots and high ground, winding road, 3 enemy types, 3 towers (arcing, straight, splash), 9 waves,
gold and selling, cabin HP and 3 campaign lives, range overlay, upgrade draft after waves 3 and 6.

Placeholder: the puzzle break lets you *choose* a result (Failed to Gold) so the draft can be tested.

Next: the three real puzzles (tangram, pattern memory, falling blocks) replacing that placeholder.

Debugging tip: in the browser console, `game.scene.getScene('Game').gold = 9999`.
