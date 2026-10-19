// Haunted-forest atmosphere drawn in code on top of the painted map: dusk grade, drifting ground fog,
// floating will-o'-wisps and a dark vignette. All tunables are in ATMOSPHERE; set enabled: false to turn it off.
import Phaser from 'phaser';

export const ATMOSPHERE = {
  enabled: true,
  /** Colour multiplied over the ground only (towers, enemies and UI stay bright). 0xffffff = no change. */
  duskTint: 0xb3a6d6,
  duskAlpha: 0.55,
  fogPatches: 9,
  fogColor: 0xc9c2ee,
  fogAlpha: 0.16,
  wisps: 14,
  wispColors: [0xffa53a, 0x9dff7a, 0xffd36e],
  vignetteAlpha: 0.55,
};

/** Depths: just above the ground, under plots and decals (60) and everything standing on the map. */
const GROUND_GRADE_DEPTH = 1;
const FOG_DEPTH = 55;

/** A soft round glow texture (white, fading to transparent), generated once. */
function softTexture(scene: Phaser.Scene, key: string, size: number) {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, size, size)!;
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  tex.refresh();
  return key;
}

function vignetteTexture(scene: Phaser.Scene, w: number, h: number) {
  const key = 'atmo_vignette';
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.45, w / 2, h / 2, w * 0.62);
  g.addColorStop(0, 'rgba(10,6,20,0)');
  g.addColorStop(1, 'rgba(10,6,20,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  tex.refresh();
  return key;
}

/** Adds the atmosphere to a scene. uiDepth: everything at or above it (HUD, menus) stays untouched. */
export function addAtmosphere(scene: Phaser.Scene, width: number, height: number, uiDepth: number,
  overrides: Partial<typeof ATMOSPHERE> = {}) {
  const A = { ...ATMOSPHERE, ...overrides };
  if (!A.enabled) return;

  // dusk grade over the ground only
  if (A.duskAlpha > 0) {
    scene.add.rectangle(0, 0, width, height, A.duskTint, A.duskAlpha)
      .setOrigin(0, 0).setDepth(GROUND_GRADE_DEPTH).setBlendMode(Phaser.BlendModes.MULTIPLY);
  }

  // low ground fog: big soft patches drifting slowly sideways, wrapping around
  const fogKey = softTexture(scene, 'atmo_soft', 256);
  for (let i = 0; i < A.fogPatches; i++) {
    const w = Phaser.Math.Between(320, 560), h = w * Phaser.Math.FloatBetween(0.28, 0.4);
    const fog = scene.add.image(Phaser.Math.Between(-100, width + 100), Phaser.Math.Between(120, height - 40), fogKey)
      .setDisplaySize(w, h).setTint(A.fogColor).setAlpha(0).setDepth(FOG_DEPTH);
    const alpha = A.fogAlpha * Phaser.Math.FloatBetween(0.6, 1.2);
    scene.tweens.add({ targets: fog, alpha, duration: 2500, delay: i * 200 });
    const speed = Phaser.Math.FloatBetween(6, 14) * (Math.random() < 0.5 ? -1 : 1);
    scene.events.on('update', (_t: number, dt: number) => {
      fog.x += (speed * dt) / 1000;
      if (fog.x > width + w / 2) fog.x = -w / 2;
      if (fog.x < -w / 2) fog.x = width + w / 2;
    });
    // slow breathing
    scene.tweens.add({ targets: fog, scaleY: fog.scaleY * 1.15, duration: Phaser.Math.Between(5000, 9000), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  // will-o'-wisps: small glowing lights wandering above the ground
  for (let i = 0; i < A.wisps; i++) {
    const color = A.wispColors[i % A.wispColors.length];
    const x0 = Phaser.Math.Between(40, width - 40), y0 = Phaser.Math.Between(110, height - 30);
    const glow = scene.add.image(x0, y0, fogKey).setDisplaySize(26, 26).setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setDepth(uiDepth - 50);
    const core = scene.add.image(x0, y0, fogKey).setDisplaySize(7, 7).setTint(0xffffff)
      .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setDepth(uiDepth - 49);
    const phase = Math.random() * Math.PI * 2, rx = Phaser.Math.Between(20, 60), ry = Phaser.Math.Between(8, 22);
    const period = Phaser.Math.Between(7000, 13000);
    scene.events.on('update', (t: number) => {
      const a = phase + (t / period) * Math.PI * 2;
      const x = x0 + Math.cos(a) * rx, y = y0 + Math.sin(a * 2) * ry - Math.abs(Math.sin(a * 3)) * 6;
      glow.setPosition(x, y); core.setPosition(x, y);
    });
    // fade in and out at random so they seem to come and go
    const pulse = () => scene.tweens.add({
      targets: [glow, core], alpha: { from: 0, to: Phaser.Math.FloatBetween(0.5, 0.9) },
      duration: Phaser.Math.Between(1500, 2600), yoyo: true, hold: Phaser.Math.Between(1500, 5000),
      delay: Phaser.Math.Between(0, 5000), onComplete: pulse,
    });
    pulse();
  }

  // dark corners
  if (A.vignetteAlpha > 0) {
    scene.add.image(0, 0, vignetteTexture(scene, width, height)).setOrigin(0, 0)
      .setAlpha(A.vignetteAlpha).setDepth(uiDepth - 60);
  }
}
