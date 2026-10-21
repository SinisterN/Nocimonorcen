// Start menu: campaign, single eras, the level editor and the tutorial.
import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../config';
import { audio, preloadAudio } from '../audio';
import { SPRITES, addSprite, hasSprite, preloadSprites } from '../sprites';
import * as art from '../art';

// the animated title (tools/anim/build_title.py writes the sheet and this file)
const TITLE_FILES = import.meta.glob('../anims/title.json', { eager: true, import: 'default' }) as Record<string, { files: { file: string; frames: number }[]; w: number; h: number; scale?: number; frames: number; fps: number }>;
const TITLE = Object.values(TITLE_FILES)[0];

export type GameMode = 'campaign' | 'era1' | 'era2' | 'editor' | 'tutorial';

/** Whether era 2 can be played yet (its map, towers and enemies are being built). */
export const ERA2_READY = true;

const FONT = '"Trebuchet MS", Verdana, sans-serif';
const TEXT = (size: number, color = '#fff7e6'): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: 'bold', stroke: '#2b1d12', strokeThickness: Math.max(3, size / 4),
});

export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  preload() {
    preloadSprites(this, 'era1');
    preloadAudio(this);
    // the loop is split over several sheets so each stays inside a GPU texture
    TITLE?.files.forEach((f, i) => this.load.spritesheet(`menu_title_${i}`, f.file, { frameWidth: TITLE.w, frameHeight: TITLE.h }));
  }

  create() {
    audio.attach(this);
    audio.playMusic('music_build');
    // the haunted map, darkened, behind the menu
    if (hasSprite(this, 'map_ground')) addSprite(this, 'map_ground', 0, 0).setDepth(0);
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x0c0814, 0.62).setOrigin(0, 0);
    const vignette = this.add.graphics();
    vignette.fillStyle(0x000000, 0.35).fillRect(0, 0, GAME_W, 90).fillRect(0, GAME_H - 70, GAME_W, 70);

    if (TITLE && TITLE.files.every((_, i) => this.textures.exists(`menu_title_${i}`))) {
      // the animated 3D title logo, looping, above the buttons; only the real frames, since the sheet's last
      // row has empty cells that would flash the logo away
      if (!this.anims.exists('menu_title')) {
        const frames = TITLE.files.flatMap((f, i) => this.anims.generateFrameNumbers(`menu_title_${i}`, { start: 0, end: f.frames - 1 }));
        this.anims.create({ key: 'menu_title', frames, frameRate: TITLE.fps, repeat: -1 });
      }
      this.add.sprite(GAME_W / 2, 112, 'menu_title_0').setDisplaySize(TITLE.w / (TITLE.scale ?? 2), TITLE.h / (TITLE.scale ?? 2)).play('menu_title');
    } else {
      this.add.text(GAME_W / 2, 120, 'NOCIMONORCEN', TEXT(64, '#ffe08a')).setOrigin(0.5);
      this.add.text(GAME_W / 2, 176, 'tower defense', TEXT(24, '#f3e9dc')).setOrigin(0.5);
    }
    if (hasSprite(this, 'hero_smug')) addSprite(this, 'hero_smug', 180, 430).setDisplaySize(220, 220);

    const items: { label: string; mode: GameMode; enabled?: boolean; construction?: boolean }[] = [
      { label: 'Start Campaign', mode: 'campaign' },
      { label: 'Play The Haunted Forest', mode: 'era1' },
      { label: 'Play The Machine Wasteland', mode: 'era2', enabled: ERA2_READY, construction: !ERA2_READY },
      // the editor is being reworked: shown, taped off, not clickable
      { label: 'Level Editor', mode: 'editor', enabled: false, construction: true },
      { label: 'Tutorial', mode: 'tutorial' },
    ];
    items.forEach((it, i) => {
      const b = this.menuButton(GAME_W / 2, 258 + i * 80, it.label, it.enabled ?? true, () => this.start(it.mode));
      if (it.construction) this.constructionTape(b, i);
    });
    this.add.text(GAME_W - 16, GAME_H - 14, 'v0.5', TEXT(12, '#bfb3a3')).setOrigin(1, 1);
    (window as unknown as { MENU_READY: boolean }).MENU_READY = true;
  }

  private start(mode: GameMode) {
    this.scene.start('Game', { mode, campaignLives: 3 });
  }

  private menuButton(x: number, y: number, label: string, enabled: boolean, onClick: () => void) {
    const [w, h] = SPRITES.ui_menu_button.display;
    const c = this.add.container(x, y);
    let face: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
    if (hasSprite(this, 'ui_menu_button')) {
      // soft drop shadow: the plaque itself, darkened and offset
      c.add(this.add.image(0, 5, SPRITES.ui_menu_button.key).setDisplaySize(w, h).setTint(0x000000).setAlpha(0.45));
      face = this.add.image(0, 0, SPRITES.ui_menu_button.key).setDisplaySize(w, h);
      if (!enabled) (face as Phaser.GameObjects.Image).setTint(0x8c8781);
    } else {
      face = this.add.graphics().fillStyle(enabled ? 0x8a6a44 : 0x6b6560).fillRoundedRect(-w / 2, -h / 2, w, h, 10)
        .lineStyle(3, art.OUTLINE).strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
    }
    c.add(face);
    const text = this.add.text(0, -1, label, {
      ...TEXT(24, enabled ? '#fff3d6' : '#b9b2a8'), stroke: enabled ? '#3a2312' : '#2e2a26', strokeThickness: 6,
    }).setOrigin(0.5).setShadow(0, 3, '#000000', 4, true, true);
    c.add(text);
    if (!enabled) { face.setAlpha(0.92); c.setData('disabled', true); }
    const lift = (hover: boolean, press = false) => {
      if (!enabled) return;
      this.tweens.killTweensOf(c);
      this.tweens.add({ targets: c, scale: press ? 0.97 : hover ? 1.04 : 1, duration: press ? 60 : 120, ease: 'Quad.easeOut' });
      if (face instanceof Phaser.GameObjects.Image) face.setTint(hover ? 0xfff4e0 : 0xffffff);
      text.setColor(hover ? '#ffe08a' : '#fff3d6');
    };
    const zone = this.add.zone(0, 0, w, h).setInteractive({ useHandCursor: enabled });
    zone.on('pointerover', () => lift(true)).on('pointerout', () => lift(false))
      .on('pointerdown', () => {
        if (!enabled) { audio.play('denied'); this.shakeTape(c); return; }
        lift(true, true);
        audio.play('click');
        this.time.delayedCall(90, onClick);
      });
    c.add(zone);
    return c;
  }

  /** Black-and-yellow hazard tape across a button that isn't available yet. */
  private constructionTape(button: Phaser.GameObjects.Container, i: number) {
    const key = 'menu_hazard_tape';
    if (!this.textures.exists(key)) {
      const W = 880, H = 64;   // drawn at 2x
      const tex = this.textures.createCanvas(key, W, H)!;
      const g = tex.getContext();
      // the tape, with slightly ragged torn ends
      g.beginPath();
      g.moveTo(10, 4); g.lineTo(W - 12, 2); g.lineTo(W - 4, 14); g.lineTo(W - 14, 26); g.lineTo(W - 3, 40); g.lineTo(W - 10, 62);
      g.lineTo(12, H - 2); g.lineTo(3, 48); g.lineTo(13, 34); g.lineTo(2, 20); g.closePath();
      g.save(); g.clip();
      g.fillStyle = '#f2c21b'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#16120d';
      for (let x = -H; x < W + H; x += 56) {
        g.beginPath(); g.moveTo(x, H); g.lineTo(x + 28, H); g.lineTo(x + 28 + H, 0); g.lineTo(x + H, 0); g.closePath(); g.fill();
      }
      // a clear yellow panel in the middle for the words
      g.fillStyle = '#f5c51f'; g.fillRect(W / 2 - 250, 0, 500, H);
      g.fillStyle = '#16120d'; g.font = 'bold 34px "Trebuchet MS", Verdana, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('UNDER CONSTRUCTION', W / 2, H / 2 + 2);
      // a faint plastic sheen along the top edge and a darker crease at the bottom
      const sheen = g.createLinearGradient(0, 0, 0, H);
      sheen.addColorStop(0, 'rgba(255,255,255,0.35)'); sheen.addColorStop(0.35, 'rgba(255,255,255,0)');
      sheen.addColorStop(0.8, 'rgba(0,0,0,0)'); sheen.addColorStop(1, 'rgba(0,0,0,0.25)');
      g.fillStyle = sheen; g.fillRect(0, 0, W, H);
      g.restore();
      tex.refresh();
    }
    // across the lower half, so the button's own name stays readable above it
    const angle = i % 2 ? 3 : -3;
    const label = button.list.find(o => o instanceof Phaser.GameObjects.Text) as Phaser.GameObjects.Text | undefined;
    label?.setY(-10);
    // its own layer above the button (not inside the container), so nothing on the plaque can draw over it;
    // it ignores input, so clicks still reach the button and play the "denied" sound
    const shadow = this.add.image(button.x + 2, button.y + 18, key).setDisplaySize(430, 27).setAngle(angle)
      .setTint(0x000000).setAlpha(0.4).setDepth(5);
    const tape = this.add.image(button.x, button.y + 14, key).setDisplaySize(430, 27).setAngle(angle).setDepth(6);
    button.setData('tape', [shadow, tape]);
  }

  /** The taped-off button wobbles a little when clicked. */
  private shakeTape(button: Phaser.GameObjects.Container) {
    const tape = (button.getData('tape') as Phaser.GameObjects.Image[] | undefined) ?? [];
    for (const o of [button, ...tape]) {
      this.tweens.killTweensOf(o);
      const home = o.getData('homeX') ?? o.x;
      o.setData('homeX', home).setX(home);
      this.tweens.add({ targets: o, x: home + 5, duration: 45, yoyo: true, repeat: 2, ease: 'Sine.easeInOut' });
    }
  }
}
