// Start menu: campaign, single eras, the level editor and the tutorial.
import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../config';
import { audio, preloadAudio } from '../audio';
import { SPRITES, addSprite, hasSprite, preloadSprites } from '../sprites';
import * as art from '../art';

export type GameMode = 'campaign' | 'era1' | 'era2' | 'editor' | 'tutorial';

/** Whether era 2 can be played yet (its map, towers and enemies are being built). */
export const ERA2_READY = false;

const FONT = '"Trebuchet MS", Verdana, sans-serif';
const TEXT = (size: number, color = '#fff7e6'): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: 'bold', stroke: '#2b1d12', strokeThickness: Math.max(3, size / 4),
});

export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  preload() {
    preloadSprites(this);
    preloadAudio(this);
  }

  create() {
    audio.attach(this);
    audio.playMusic('music_build');
    // the haunted map, darkened, behind the menu
    if (hasSprite(this, 'map_ground')) addSprite(this, 'map_ground', 0, 0).setDepth(0);
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x0c0814, 0.62).setOrigin(0, 0);
    const vignette = this.add.graphics();
    vignette.fillStyle(0x000000, 0.35).fillRect(0, 0, GAME_W, 90).fillRect(0, GAME_H - 70, GAME_W, 70);

    this.add.text(GAME_W / 2, 120, 'NOCIMONORCEN', TEXT(64, '#ffe08a')).setOrigin(0.5);
    this.add.text(GAME_W / 2, 176, 'tower defense', TEXT(24, '#f3e9dc')).setOrigin(0.5);
    if (hasSprite(this, 'hero_smug')) addSprite(this, 'hero_smug', 180, 430).setDisplaySize(220, 220);

    const items: { label: string; mode: GameMode; note?: string; enabled?: boolean }[] = [
      { label: 'Start Campaign', mode: 'campaign', note: ERA2_READY ? 'Era 1, then Era 2' : 'Era 1 (Era 2 follows once it is built)' },
      { label: 'Play Era 1', mode: 'era1', note: 'The haunted forest' },
      { label: 'Play Era 2', mode: 'era2', note: ERA2_READY ? 'The machine wasteland' : 'Under construction', enabled: ERA2_READY },
      { label: 'Level Editor', mode: 'editor', note: 'Place scenery on the map' },
      { label: 'Tutorial', mode: 'tutorial', note: 'Learn the basics in two minutes' },
    ];
    items.forEach((it, i) => this.menuButton(GAME_W / 2, 262 + i * 78, it.label, it.note ?? '', it.enabled ?? true, () => this.start(it.mode)));
    this.add.text(GAME_W - 16, GAME_H - 14, 'v0.5', TEXT(12, '#bfb3a3')).setOrigin(1, 1);
    (window as unknown as { MENU_READY: boolean }).MENU_READY = true;
  }

  private start(mode: GameMode) {
    this.scene.start('Game', { mode, campaignLives: 3 });
  }

  private menuButton(x: number, y: number, label: string, note: string, enabled: boolean, onClick: () => void) {
    const w = 340, h = 58;
    const c = this.add.container(x, y);
    const tint = enabled ? art.shade(0x8a6a44, 1.35) : 0x6b6560;
    let paint: (hover: boolean) => void;
    if (hasSprite(this, 'ui_button')) {
      const ns = this.add.nineslice(0, 0, SPRITES.ui_button.key, undefined, w * 2, h * 2, 44, 44, 36, 36).setScale(0.5);
      paint = hover => { ns.setTint(hover && enabled ? 0xffffff : tint); ns.setScale(hover && enabled ? 0.515 : 0.5); };
      c.add(ns);
    } else {
      const g = this.add.graphics();
      paint = hover => {
        g.clear().fillStyle(hover && enabled ? 0xa07a50 : 0x8a6a44).fillRoundedRect(-w / 2, -h / 2, w, h, 10);
        g.lineStyle(3, art.OUTLINE).strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
      };
      c.add(g);
    }
    paint(false);
    c.add(this.add.text(0, -7, label, TEXT(22, enabled ? '#fff7e6' : '#c9c0b4')).setOrigin(0.5));
    c.add(this.add.text(0, 16, note, TEXT(12, enabled ? '#ffe08a' : '#bfb3a3')).setOrigin(0.5));
    const zone = this.add.zone(0, 0, w, h).setInteractive({ useHandCursor: enabled });
    zone.on('pointerover', () => paint(true)).on('pointerout', () => paint(false))
      .on('pointerdown', () => {
        if (!enabled) { audio.play('denied'); return; }
        audio.play('click');
        onClick();
      });
    c.add(zone);
    return c;
  }
}
