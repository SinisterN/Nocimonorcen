// Developer previews of era 2 effects, opened with ?preview=forcefield in the URL. Not part of the game flow.
import Phaser from 'phaser';
import { ForceField } from '../forcefield';

export class PreviewScene extends Phaser.Scene {
  constructor() { super('Preview'); }

  preload() {
    this.load.image('pv_map', 'sprites/era2/map_ground.jpg');
    this.load.image('pv_turret', 'sprites/era2/e2_tower_gun_l3.png');
  }

  create() {
    this.add.image(0, 0, 'pv_map').setOrigin(0, 0).setDisplaySize(1280, 720);
    // the turret at three sizes: in-game size, and zoomed in so the effect can be judged
    const sizes = [[340, 470, 120], [760, 520, 300]] as const;
    const fields: { f: ForceField; img: Phaser.GameObjects.Image }[] = [];
    for (const [x, y, w] of sizes) {
      const img = this.add.image(x, y, 'pv_turret').setOrigin(0.5, 0.8).setDepth(10);
      img.setDisplaySize(w, w * img.height / img.width);
      fields.push({ f: new ForceField(this, img), img });
    }
    this.add.text(20, 20, 'Forcefield preview: idle shimmer, hits from random directions', {
      fontFamily: 'Verdana', fontSize: '18px', color: '#e8fcff', stroke: '#000', strokeThickness: 4,
    });
    // incoming fire from random directions
    this.time.addEvent({
      delay: 700, loop: true, callback: () => {
        for (const { f, img } of fields) {
          const a = Phaser.Math.FloatBetween(Math.PI * 0.9, Math.PI * 2.1);
          f.hit(img.x + Math.cos(a) * 400, img.y - 60 + Math.sin(a) * 300);
        }
      },
    });
    (window as unknown as { PREVIEW_READY: boolean }).PREVIEW_READY = true;
  }
}
