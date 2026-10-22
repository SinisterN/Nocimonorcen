// Step-by-step tutorial that runs on top of a normal game of era 1. It points at what to click and waits for
// the player to do it: build, upgrade, adjust the sound, start a wave, sell, and finish the wave.
import Phaser from 'phaser';

/** Things the game reports to the tutorial. */
export type TutorialEvent = 'built' | 'upgraded' | 'sold' | 'soundPanel' | 'waveStart' | 'waveCleared';

export interface TutorialHooks {
  /** Screen point of the plot the tutorial uses. */
  plotPoint(): { x: number; y: number };
  /** Screen point of the Start wave and Sound buttons. */
  startButton(): { x: number; y: number };
  soundButton(): { x: number; y: number };
  /** The tutorial's one wave has been fought and cleared. */
  waveCleared(): boolean;
  /** Back to the start menu, or straight into era 1. */
  toMenu(): void;
  playEra1(): void;
  depth: number;
}

interface Step {
  text: string;
  /** What to point at; null = nothing. */
  target: (() => { x: number; y: number }) | null;
  /** Event that completes the step; null = a Next button. */
  waitFor: TutorialEvent | null;
  /** Skip the step when this is already true on arriving at it (the player got ahead of the tutorial). */
  done?: () => boolean;
}

const FONT = '"Trebuchet MS", Verdana, sans-serif';
const PANEL = { x: 422, y: 645, w: 480, h: 118 };

export class Tutorial {
  private steps: Step[];
  private index = -1;
  private panel: Phaser.GameObjects.Container | null = null;
  private pointer: Phaser.GameObjects.Graphics;
  private pulse = 0;
  /** Real-clock time (ms) at which to move on to the next step, after the player did what it asked; 0 = waiting. */
  private advanceAt = 0;
  private onUpdate: (t: number, dt: number) => void;

  constructor(private scene: Phaser.Scene, private hooks: TutorialHooks) {
    const plot = () => hooks.plotPoint();
    this.steps = [
      { text: 'Welcome, defender! The dead crawl out of the crypt and follow the road to your cabin. Build towers along the road to stop them before they get there.', target: null, waitFor: null },
      { text: 'Build a tower: click the glowing build plot, then pick a tower from the ring. Its price is shown under it; your gold is at the top left.', target: plot, waitFor: 'built' },
      { text: 'Upgrade it: click your tower and press the arrow button on top. Each level adds damage, range and speed, and level 3 unlocks a special skill.', target: plot, waitFor: 'upgraded' },
      { text: 'Sound: click the Sound button to set the effects, music and voice volume, or mute everything. The M key mutes too.', target: () => hooks.soundButton(), waitFor: 'soundPanel' },
      { text: 'Start a wave: press Start wave (or Space). Enemies walk the road and your towers fire on their own. The 1x button speeds the game up.', target: () => hooks.startButton(), waitFor: 'waveStart' },
      { text: 'Selling: a tower can be sold any time for 70% of everything you spent on it. Click your tower and press the coin button underneath.', target: plot, waitFor: 'sold' },
      // the wave may already be over by now (a strong first tower clears it before the selling step): then the
      // last two steps are skipped and the tutorial ends
      { text: 'Quick, build a tower again so the zombies don\'t reach your cabin!', target: plot, waitFor: 'built', done: () => hooks.waveCleared() },
      { text: 'Now hold the line until the wave is cleared…', target: null, waitFor: 'waveCleared', done: () => hooks.waveCleared() },
    ];
    this.pointer = scene.add.graphics().setDepth(hooks.depth - 1);
    this.onUpdate = (_t, dt) => {
      if (this.advanceAt && performance.now() >= this.advanceAt) { this.advanceAt = 0; this.next(); }
      this.drawPointer(dt / 1000);
    };
    scene.events.on('update', this.onUpdate);
    scene.events.once('shutdown', () => this.destroy());
    this.next();
  }

  /** Called by the game whenever something the tutorial may be waiting for happens. */
  notify(ev: TutorialEvent) {
    const step = this.steps[this.index];
    if (step && step.waitFor === ev && !this.advanceAt) this.advanceAt = performance.now() + 350;
  }

  destroy() {
    this.scene.events.off('update', this.onUpdate);
    this.panel?.destroy();
    this.pointer.destroy();
  }

  private next() {
    this.index++;
    this.panel?.destroy();
    this.panel = null;
    while (this.index < this.steps.length && this.steps[this.index].done?.()) this.index++;
    if (this.index >= this.steps.length) return this.finish();
    const step = this.steps[this.index];
    this.showPanel(`${this.index + 1}/${this.steps.length}`, step.text, step.waitFor === null ? [['Next', () => this.next()]] : []);
  }

  private finish() {
    this.showPanel('Done!', 'That\'s all you need. Between some waves you\'ll also pick upgrades for your whole defence. Good luck out there!',
      [['Play Era 1', () => this.hooks.playEra1()], ['Main menu', () => this.hooks.toMenu()]]);
  }

  private showPanel(head: string, text: string, buttons: [string, () => void][]) {
    const s = this.scene, { x, y, w, h } = PANEL;
    const c = s.add.container(x, y).setDepth(this.hooks.depth);
    const bg = s.add.graphics();
    bg.fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2 + 3, -h / 2 + 5, w, h, 14);
    bg.fillStyle(0x2b1d12, 0.94).fillRoundedRect(-w / 2, -h / 2, w, h, 14);
    bg.lineStyle(3, 0xe9b44c, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
    c.add(bg);
    c.add(s.add.zone(0, 0, w, h).setInteractive()); // clicks on the panel don't reach the map
    c.add(s.add.text(-w / 2 + 16, -h / 2 + 10, `TUTORIAL  ${head}`, { fontFamily: FONT, fontSize: '13px', color: '#e9b44c', fontStyle: 'bold' }));
    c.add(s.add.text(-w / 2 + 16, -h / 2 + 30, text, {
      fontFamily: FONT, fontSize: '15px', color: '#fff7e6', wordWrap: { width: w - 32 - (buttons.length ? 0 : 0) }, lineSpacing: 3,
    }));
    buttons.forEach(([label, fn], i) => {
      const bx = w / 2 - 70 - i * 128, by = h / 2 - 22;
      const r = s.add.rectangle(bx, by, 116, 32, 0x5fae4e).setStrokeStyle(2, 0x1a120b).setInteractive({ useHandCursor: true });
      r.on('pointerover', () => r.setFillStyle(0x76c463)).on('pointerout', () => r.setFillStyle(0x5fae4e)).on('pointerdown', fn);
      c.add([r, s.add.text(bx, by, label, { fontFamily: FONT, fontSize: '15px', color: '#fff7e6', fontStyle: 'bold' }).setOrigin(0.5)]);
    });
    this.panel = c;
  }

  /** A pulsing ring and a bobbing arrow over the thing to click. */
  private drawPointer(dt: number) {
    this.pulse += dt;
    const g = this.pointer.clear();
    const step = this.steps[this.index];
    if (!step?.target) return;
    const { x, y } = step.target();
    const k = (this.pulse % 1.1) / 1.1;
    g.lineStyle(4, 0xffe08a, 1 - k).strokeEllipse(x, y, 60 + 50 * k, 30 + 25 * k);
    g.lineStyle(3, 0xffe08a, 0.9).strokeEllipse(x, y, 58, 29);
    const by = y - 70 - Math.abs(Math.sin(this.pulse * 4)) * 12;
    g.fillStyle(0x2b1d12, 1).fillTriangle(x - 15, by - 3, x + 15, by - 3, x, by + 23);
    g.fillStyle(0xffe08a, 1).fillTriangle(x - 11, by, x + 11, by, x, by + 17);
    g.fillStyle(0x2b1d12, 1).fillRect(x - 6, by - 25, 12, 24);
    g.fillStyle(0xffe08a, 1).fillRect(x - 3, by - 23, 6, 22);
  }
}
