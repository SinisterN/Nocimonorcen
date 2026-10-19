import Phaser from 'phaser';
import { GAME_H, GAME_W } from './config';
import { GameScene } from './scenes/GameScene';
import { PreviewScene } from './scenes/PreviewScene';
import { MenuScene } from './scenes/MenuScene';

const preview = new URLSearchParams(location.search).get('preview');

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#1d1a17',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: preview ? [PreviewScene] : [MenuScene, GameScene],
});

// ---------- mobile: full screen in landscape ----------
// Browsers only allow full screen after a tap, so the first tap with the device held sideways switches to
// full screen and locks landscape (Android). iPhone Safari has no full screen for pages: there the game is
// installed with "Add to Home Screen" (see public/manifest.webmanifest) and then opens full screen by itself.
const isTouch = window.matchMedia('(pointer: coarse)').matches;
const isInstalled = window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
const canFullscreen = !!document.documentElement.requestFullscreen;
function goFullscreenIfSideways() {
  if (!isTouch || isInstalled || !canFullscreen || document.fullscreenElement) return;
  if (window.innerWidth < window.innerHeight) return; // still upright: the rotate screen is showing
  document.documentElement.requestFullscreen({ navigationUI: 'hide' })
    .then(() => {
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      return o.lock?.('landscape');
    })
    .catch(() => { /* refused (e.g. iOS): the game keeps running in the page */ });
}
window.addEventListener('pointerdown', goFullscreenIfSideways, { capture: true });
// keep the canvas fitted when the device turns or the browser bars move
window.addEventListener('orientationchange', () => setTimeout(() => game.scale.refresh(), 250));
document.addEventListener('fullscreenchange', () => setTimeout(() => game.scale.refresh(), 100));

// Handy for debugging in the browser console: game.scene.getScene("Game")
(window as unknown as { game: Phaser.Game }).game = game;
