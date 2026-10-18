// Renders every code-drawn asset as a 1024×1024 guide image on white, for ControlNet / reference-image generation.
// Open http://localhost:5173/guides.html while `npm run dev` is running.
import Phaser from 'phaser';
import * as art from '../art';

// Drop shadows confuse ControlNet (they come back as pedestals), so guides are drawn without them.
art.artOptions.shadows = false;

type Draw = (g: Phaser.GameObjects.Graphics) => void;
const SIZE = 1024;
const BASELINE = 760; // where every asset's feet land, so all guides share one anchor

const GUIDES: [name: string, scale: number, draw: Draw][] = [
  ['tower_arrow', 8, g => art.tower(g, 'arrow', Math.PI * 0.25)],
  ['tower_arrow_base', 8, g => art.tower(g, 'arrow', Math.PI * 0.25, 0, { archer: false })],
  ['archer', 22, g => art.archer(g, Math.PI * 0.12, 0.6)],
  ...(['idle', 'nock', 'draw', 'release', 'back_draw', 'back_idle'] as art.ArcherPose[]).map(
    (p): [string, number, Draw] => [`archer_pose_${p}`, 22, g => art.archerPose(g, p)]),
  ['tower_mg', 10, g => art.tower(g, 'mg', Math.PI * 0.25)],
  ['tower_mortar', 10, g => art.tower(g, 'mortar', Math.PI * 0.25)],
  ['enemy_grunt', 16, g => art.enemy(g, 'grunt', 0.6, 1, false)],
  ['enemy_grunt_milky', 16, g => { art.artOptions.milkyEyes = true; art.enemy(g, 'grunt', 0.6, 1, false); art.artOptions.milkyEyes = false; }],
  ['enemy_fast', 18, g => art.enemy(g, 'fast', 0.6, 1, false)],
  ['enemy_crawler', 13, g => art.crawlerGuide(g)],
  ['enemy_armored', 13, g => art.enemy(g, 'armored', 0.6, 1, false)],
  ['plot', 11, g => art.plot(g, 0, false, false, 13)],
  ['plot_high', 9, g => art.plot(g, 16, true, false, 13)],
  ['cabin', 5, g => art.cabin(g)],
  ['crypt', 6.5, g => art.crypt(g)],
  ['tree', 8, g => art.tree(g, 1, art.rng(5))],
  ['pine', 8, g => art.pine(g, 1)],
  ['bush', 12, g => art.bush(g, 1)],
  ['rock', 14, g => art.rock(g, 1)],
];

class GuideScene extends Phaser.Scene {
  create() {
    const out: Record<string, string> = {};
    const grid = document.getElementById('grid')!;
    for (const [name, scale, draw] of GUIDES) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff).fillRect(0, 0, SIZE, SIZE);
      g.translateCanvas(SIZE / 2, BASELINE);
      g.scaleCanvas(scale, scale);
      draw(g);
      g.generateTexture(name, SIZE, SIZE);
      g.destroy();
      const canvas = this.textures.get(name).getSourceImage() as HTMLCanvasElement;
      out[name] = canvas.toDataURL('image/png');
      grid.insertAdjacentHTML('beforeend', `<figure><img alt="${name}" src="${out[name]}"><figcaption>${name}.png</figcaption></figure>`);
    }
    (window as unknown as { guides: Record<string, string> }).guides = out;
  }
}

new Phaser.Game({ type: Phaser.CANVAS, width: 8, height: 8, parent: document.body, scene: [GuideScene] });
