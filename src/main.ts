import Phaser from 'phaser';
import { GAME_H, GAME_W } from './config';
import { GameScene } from './scenes/GameScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#1d1a17',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [GameScene],
});

// Handy for debugging in the browser console: game.scene.getScene("Game")
(window as unknown as { game: Phaser.Game }).game = game;
