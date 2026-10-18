// The hero's portrait in the bottom-left corner: swaps expression and delivers a one-liner on game events.
import Phaser from 'phaser';
import { GAME_H } from './config';
import { SPRITES, addSprite, hasSprite } from './sprites';

export type HeroMood = 'neutral' | 'furious' | 'smug' | 'laugh';
export type HeroEvent = 'towerBuilt' | 'kill' | 'baseHit' | 'waveStart' | 'waveCleared' | 'towerSold';

// Original lines in a 90s B-movie spirit. Add freely; one is picked at random per event.
const LINES: Record<HeroEvent, string[]> = {
  towerBuilt: ['Construction is my second-favourite hobby.', 'Knock knock, deadheads.', 'Built tough. Like me.', 'Another one for the welcome committee.'],
  kill: ['Rest in pieces.', 'Back to the dirt, sweetheart.', 'Two for one. Tuesday special.', "That's gotta sting.", 'Next!'],
  baseHit: ['Hey! I just fixed that porch!', 'Okay. Now I’m annoyed.', 'Nobody touches the cabin!', 'That’s coming out of your hide.'],
  waveStart: ['Here comes the ugly parade.', 'Lock and load.', 'Time to take out the trash.'],
  waveCleared: ['Book club’s over, boys.', 'Is that all you got?', 'Smells like victory. And rot.'],
  towerSold: ['Cash is cash.', 'Downsizing.'],
};

const MOOD: Record<HeroEvent, HeroMood> = {
  towerBuilt: 'smug', kill: 'laugh', baseHit: 'furious', waveStart: 'neutral', waveCleared: 'laugh', towerSold: 'smug',
};

// How often an event is allowed to speak (kills are frequent, so only some of them talk).
const CHANCE: Record<HeroEvent, number> = {
  towerBuilt: 1, kill: 0.18, baseHit: 1, waveStart: 1, waveCleared: 1, towerSold: 0.6,
};

const FONT = '"Trebuchet MS", Verdana, sans-serif';

export class HeroPortrait {
  private face: Phaser.GameObjects.Image;
  private bubble: Phaser.GameObjects.Container;
  private bubbleBg: Phaser.GameObjects.Graphics;
  private bubbleText: Phaser.GameObjects.Text;
  private busyUntil = 0;
  private resetTimer?: Phaser.Time.TimerEvent;
  private readonly size = 120;
  private readonly cx: number;
  private readonly cy: number;

  constructor(private scene: Phaser.Scene, depth: number) {
    this.cx = 14 + this.size / 2;
    this.cy = GAME_H - 14 - this.size / 2;
    const half = this.size / 2;
    // dark backdrop and a chunky wooden frame
    const frame = scene.add.graphics().setDepth(depth);
    frame.fillStyle(0x000000, 0.35).fillRoundedRect(this.cx - half - 4, this.cy - half - 2, this.size + 12, this.size + 12, 14);
    frame.fillStyle(0x3a2a1c).fillRoundedRect(this.cx - half - 8, this.cy - half - 8, this.size + 16, this.size + 16, 14);
    frame.fillStyle(0x2a3540).fillRoundedRect(this.cx - half, this.cy - half, this.size, this.size, 8);
    this.face = addSprite(scene, 'hero_neutral', this.cx, this.cy).setDisplaySize(this.size, this.size).setDepth(depth + 0.1);
    const rim = scene.add.graphics().setDepth(depth + 0.2);
    rim.lineStyle(6, 0x6e4626).strokeRoundedRect(this.cx - half - 3, this.cy - half - 3, this.size + 6, this.size + 6, 10);
    rim.lineStyle(2.5, 0x2b1d12).strokeRoundedRect(this.cx - half - 6, this.cy - half - 6, this.size + 12, this.size + 12, 12);
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      rim.fillStyle(0x8a909c).fillCircle(this.cx + x * (half - 2), this.cy + y * (half - 2), 4);
      rim.lineStyle(1.5, 0x2b1d12).strokeCircle(this.cx + x * (half - 2), this.cy + y * (half - 2), 4);
    }

    this.bubbleBg = scene.add.graphics();
    this.bubbleText = scene.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: '#2b1d12', wordWrap: { width: 260 },
    });
    this.bubble = scene.add.container(this.cx + half + 22, this.cy - 24, [this.bubbleBg, this.bubbleText])
      .setDepth(depth + 0.3).setAlpha(0);
  }

  /** Reacts to a game event: changes expression, maybe says a line, then relaxes back to neutral. */
  react(event: HeroEvent) {
    const now = this.scene.time.now;
    const urgent = event === 'baseHit';
    if (!urgent && now < this.busyUntil) return;
    if (Math.random() > CHANCE[event]) return;
    const lines = LINES[event];
    this.say(lines[Math.floor(Math.random() * lines.length)], MOOD[event]);
    this.busyUntil = now + (urgent ? 1500 : 3500);
  }

  private setMood(mood: HeroMood) {
    const key = `hero_${mood}` as keyof typeof SPRITES;
    if (hasSprite(this.scene, key)) this.face.setTexture(SPRITES[key].key);
    this.face.setDisplaySize(this.size, this.size);
    this.scene.tweens.killTweensOf(this.face);
    this.face.setPosition(this.cx, this.cy);
    if (mood === 'furious') {
      this.scene.tweens.add({ targets: this.face, x: this.cx + 4, duration: 40, yoyo: true, repeat: 5 });
    } else {
      this.face.setDisplaySize(this.size * 1.08, this.size * 1.08);
      this.scene.tweens.add({ targets: this.face, displayWidth: this.size, displayHeight: this.size, duration: 260, ease: 'Back.easeOut' });
    }
  }

  private say(line: string, mood: HeroMood) {
    this.setMood(mood);
    const t = this.bubbleText.setText(line);
    const w = t.width + 24, h = t.height + 18;
    t.setPosition(12, -h / 2 + 9);
    this.bubbleBg.clear();
    this.bubbleBg.fillStyle(0x000000, 0.25).fillRoundedRect(3, -h / 2 + 4, w, h, 12);
    this.bubbleBg.fillStyle(0xfff7e6).fillRoundedRect(0, -h / 2, w, h, 12);
    this.bubbleBg.fillTriangle(2, -6, 2, 8, -12, 6);
    this.bubbleBg.lineStyle(3, 0x2b1d12).strokeRoundedRect(0, -h / 2, w, h, 12);
    this.bubbleBg.lineStyle(3, 0x2b1d12).lineBetween(1, -6, -12, 6).lineBetween(-12, 6, 1, 8);
    this.scene.tweens.killTweensOf(this.bubble);
    this.bubble.setAlpha(1).setScale(0.85);
    this.scene.tweens.add({ targets: this.bubble, scale: 1, duration: 180, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: this.bubble, alpha: 0, delay: 2600, duration: 400 });
    this.resetTimer?.remove();
    this.resetTimer = this.scene.time.delayedCall(3000, () => this.setMood('neutral'));
  }
}
