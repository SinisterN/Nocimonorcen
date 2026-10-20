// Impact and shot effects drawn in code: the bombard's explosion and the Boomstick's shotgun blast.
// Everything is short-lived and cleans itself up; all tunables sit at the top of each effect.
import Phaser from 'phaser';

const SOFT = 'fx_soft';

/** A soft round glow (white centre fading to transparent), made once and tinted per use. */
function soft(scene: Phaser.Scene) {
  if (scene.textures.exists(SOFT)) return SOFT;
  const size = 64;
  const tex = scene.textures.createCanvas(SOFT, size, size)!;
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  tex.refresh();
  return SOFT;
}

const rand = Phaser.Math.FloatBetween;

/**
 * A small explosion where a shell lands. (x, y) is the ground point, (w, h) the blast area on screen
 * (the iso ellipse of the splash radius), depth the draw depth for everything above the ground.
 */
export function explosion(scene: Phaser.Scene, x: number, y: number, w: number, h: number, depth: number) {
  const key = soft(scene);
  const size = Math.max(64, w * 0.9); // fireball size follows the blast radius

  // scorch mark left on the ground, under enemies and towers
  const scorch = scene.add.graphics().setPosition(x, y).setDepth(60);
  scorch.fillStyle(0x140a08, 0.5).fillEllipse(0, 0, w * 0.55, h * 0.55);
  scorch.fillStyle(0x140a08, 0.35).fillEllipse(0, 0, w * 0.8, h * 0.8);
  scene.tweens.add({ targets: scorch, alpha: 0, delay: 1200, duration: 1600, onComplete: () => scorch.destroy() });

  // shockwave: a thin ring on the ground racing out to the edge of the blast area
  const ring = scene.add.graphics().setPosition(x, y).setDepth(61);
  ring.lineStyle(3, 0xffd9a0, 0.9).strokeEllipse(0, 0, w, h);
  ring.setScale(0.2);
  scene.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: 320, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });

  // white-hot flash
  const flash = scene.add.image(x, y - 8, key).setTint(0xfff4d0).setBlendMode(Phaser.BlendModes.ADD)
    .setDisplaySize(size * 0.6, size * 0.45).setDepth(depth + 2);
  scene.tweens.add({ targets: flash, displayWidth: size * 1.5, displayHeight: size * 1.05, alpha: 0, duration: 180,
    ease: 'Quad.easeOut', onComplete: () => flash.destroy() });

  // fireball: glowing blobs that swell and rise, cooling from yellow to red
  for (let i = 0; i < 12; i++) {
    const a = rand(0, Math.PI * 2), r = rand(0, size * 0.25);
    const b = scene.add.image(x + Math.cos(a) * r, y - 6 + Math.sin(a) * r * 0.5, key)
      .setTint(i < 4 ? 0xffe27a : i < 8 ? 0xff9a2e : 0xff5a1f).setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(size * 0.35, size * 0.35).setDepth(depth + 1).setAlpha(0.7);
    scene.tweens.add({
      targets: b, displayWidth: size * rand(0.6, 0.9), displayHeight: size * rand(0.6, 0.9),
      y: b.y - rand(14, 34), alpha: 0, duration: rand(420, 620), ease: 'Quad.easeOut', onComplete: () => b.destroy(),
    });
  }

  // smoke: dark puffs billowing up after the fire, drifting and fading slowly
  for (let i = 0; i < 7; i++) {
    const s = scene.add.image(x + rand(-size * 0.25, size * 0.25), y - rand(4, 14), key)
      .setTint(Phaser.Display.Color.GetColor(120 + i * 8, 110 + i * 7, 128 + i * 8))
      .setDisplaySize(size * 0.3, size * 0.3).setDepth(depth).setAlpha(0);
    scene.tweens.add({ targets: s, alpha: 0.7, delay: 80 + i * 30, duration: 160 });
    scene.tweens.add({
      targets: s, displayWidth: size * rand(0.7, 1.0), displayHeight: size * rand(0.6, 0.85),
      y: s.y - rand(28, 50), x: s.x + rand(-10, 10), delay: 80 + i * 30, duration: rand(900, 1300),
      ease: 'Sine.easeOut',
    });
    scene.tweens.add({ targets: s, alpha: 0, delay: 600 + i * 40, duration: 700, onComplete: () => s.destroy() });
  }

  // sparks and dirt thrown out in arcs (z = height above the ground, pulled back down by gravity)
  const bits = scene.add.graphics().setDepth(depth + 3);
  const parts = Array.from({ length: 16 }, (_, i) => {
    const a = rand(0, Math.PI * 2), speed = rand(60, 150);
    return {
      spark: i < 8, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed * 0.5, vz: rand(90, 200),
      size: i < 8 ? rand(1.2, 2.2) : rand(2, 3.5), color: i < 8 ? 0xffd27a : 0x2a1d18,
    };
  });
  const life = 650;
  scene.tweens.addCounter({
    from: 0, to: life, duration: life,
    onUpdate: tw => {
      const t = (tw.getValue() ?? 0) / 1000, fade = 1 - (tw.getValue() ?? 0) / life;
      bits.clear();
      for (const p of parts) {
        const z = Math.max(0, p.vz * t - 0.5 * 600 * t * t);
        const px = x + p.vx * t, py = y + p.vy * t - z;
        bits.fillStyle(p.color, p.spark ? fade : Math.min(1, fade * 2)).fillCircle(px, py, p.size);
      }
    },
    onComplete: () => bits.destroy(),
  });

  // a tiny camera kick, skipped while one is already running so a barrage doesn't turn into a blur
  const cam = scene.cameras.main;
  if (!cam.shakeEffect.isRunning) cam.shake(110, 0.0025);
}

/**
 * The Boomstick's shotgun blast: muzzle flash and smoke, then a spread of pellets flying to each target point.
 * targets: where the pellets go (the first is the main target; Buckshot adds the enemies behind it).
 */
export function shotgunBlast(
  scene: Phaser.Scene, mx: number, my: number, targets: { x: number; y: number; armored?: boolean }[], depth: number,
) {
  const key = soft(scene);
  const main = targets[0];
  const aim = Math.atan2(main.y - my, main.x - mx);

  // muzzle flash: a hot glow plus a few short flame tongues pointing down the barrel
  const glow = scene.add.image(mx, my, key).setTint(0xffd27a).setBlendMode(Phaser.BlendModes.ADD)
    .setDisplaySize(30, 30).setDepth(depth + 2);
  scene.tweens.add({ targets: glow, alpha: 0, displayWidth: 44, displayHeight: 44, duration: 110, onComplete: () => glow.destroy() });
  const tongues = scene.add.graphics().setDepth(depth + 2);
  for (let i = -2; i <= 2; i++) {
    const a = aim + i * 0.22, len = (i === 0 ? 20 : 12) + rand(-3, 3);
    const tip = { x: mx + Math.cos(a) * len, y: my + Math.sin(a) * len };
    const side = { x: Math.cos(a + Math.PI / 2) * 3, y: Math.sin(a + Math.PI / 2) * 3 };
    tongues.fillStyle(0xffb03a, 0.95).fillTriangle(mx + side.x, my + side.y, mx - side.x, my - side.y, tip.x, tip.y);
    tongues.fillStyle(0xfff2c0, 0.95).fillTriangle(mx + side.x * 0.4, my + side.y * 0.4, mx - side.x * 0.4, my - side.y * 0.4,
      mx + Math.cos(a) * len * 0.55, my + Math.sin(a) * len * 0.55);
  }
  scene.tweens.add({ targets: tongues, alpha: 0, duration: 90, onComplete: () => tongues.destroy() });

  // gun smoke drifting off the muzzle
  for (let i = 0; i < 3; i++) {
    const s = scene.add.image(mx + Math.cos(aim) * (6 + i * 7), my + Math.sin(aim) * (6 + i * 7), key)
      .setTint(0xb8b0c0).setDisplaySize(10, 10).setAlpha(0.6).setDepth(depth + 1);
    scene.tweens.add({
      targets: s, displayWidth: 26 + i * 6, displayHeight: 22 + i * 5, alpha: 0, y: s.y - 14 - i * 4,
      x: s.x + Math.cos(aim) * 8, duration: 520 + i * 120, ease: 'Sine.easeOut', onComplete: () => s.destroy(),
    });
  }

  // pellets: each target point gets a small cloud of pellets with some spread, a short streak each
  // armoured targets: pellets glance off with white ricochet sparks instead of orange hits
  const pellets: { sx: number; sy: number; ex: number; ey: number; delay: number; dur: number; spark: number }[] = [];
  targets.forEach((p, ti) => {
    const count = ti === 0 ? 14 : 6;
    for (let i = 0; i < count; i++) {
      const spread = ti === 0 ? 16 : 10;
      pellets.push({
        sx: ti === 0 ? mx : targets[ti - 1].x, sy: ti === 0 ? my : targets[ti - 1].y,
        ex: p.x + rand(-spread, spread), ey: p.y + rand(-spread * 0.6, spread * 0.6),
        delay: ti * 90 + rand(0, 30), dur: rand(110, 160), spark: p.armored ? 0xe8eef6 : 0xffc860,
      });
    }
  });
  const g = scene.add.graphics().setDepth(depth + 1);
  const total = Math.max(...pellets.map(p => p.delay + p.dur)) + 160;
  scene.tweens.addCounter({
    from: 0, to: total, duration: total,
    onUpdate: tw => {
      const now = tw.getValue() ?? 0;
      g.clear();
      for (const p of pellets) {
        const k = (now - p.delay) / p.dur;
        if (k < 0) continue;
        if (k < 1) {
          const x = p.sx + (p.ex - p.sx) * k, y = p.sy + (p.ey - p.sy) * k;
          const a = Math.atan2(p.ey - p.sy, p.ex - p.sx);
          g.lineStyle(2.5, 0xffb84a, 0.85).lineBetween(x - Math.cos(a) * 11, y - Math.sin(a) * 11, x, y);
          g.fillStyle(0x2b1d12, 1).fillCircle(x, y, 2.6);
          g.fillStyle(0xfff2c8, 1).fillCircle(x, y, 1.8);
        } else {
          // the hit: a tiny spark that fades out where the pellet landed
          const f = 1 - Math.min(1, (now - p.delay - p.dur) / 140);
          if (f > 0) g.fillStyle(p.spark, f).fillCircle(p.ex, p.ey, 1.5 + 3 * f);
        }
      }
    },
    onComplete: () => g.destroy(),
  });
}

/** Twin MG: a short muzzle flash and a few fast tracer streaks to the target, with sparks where they hit. */
export function tracerBurst(scene: Phaser.Scene, mx: number, my: number, tx: number, ty: number, depth: number) {
  const key = soft(scene);
  const flash = scene.add.image(mx, my, key).setTint(0xffd27a).setBlendMode(Phaser.BlendModes.ADD)
    .setDisplaySize(20, 20).setDepth(depth + 2);
  scene.tweens.add({ targets: flash, alpha: 0, duration: 70, onComplete: () => flash.destroy() });
  const g = scene.add.graphics().setDepth(depth + 1).setBlendMode(Phaser.BlendModes.ADD);
  const shots = [0, 45, 90].map(delay => ({ delay, ox: rand(-5, 5), oy: rand(-4, 4) }));
  const total = 200;
  scene.tweens.addCounter({
    from: 0, to: total, duration: total,
    onUpdate: tw => {
      const now = tw.getValue() ?? 0;
      g.clear();
      for (const s of shots) {
        const k = (now - s.delay) / 60;
        if (k < 0) continue;
        const ex = tx + s.ox, ey = ty + s.oy;
        if (k < 1) {
          const x = mx + (ex - mx) * k, y = my + (ey - my) * k, a = Math.atan2(ey - my, ex - mx);
          g.lineStyle(2, 0xffe08a, 0.95).lineBetween(x - Math.cos(a) * 16, y - Math.sin(a) * 16, x, y);
        } else {
          const f = 1 - Math.min(1, (k - 1) * 1.5);
          if (f > 0) g.fillStyle(0xffc860, f).fillCircle(ex, ey, 1.5 + 2 * f);
        }
      }
    },
    onComplete: () => g.destroy(),
  });
}

/** Railgun: a bright cyan beam from the muzzle through every enemy it hits, fading out with crackles. */
export function railBeam(scene: Phaser.Scene, mx: number, my: number, ex: number, ey: number, hits: { x: number; y: number }[], depth: number) {
  const key = soft(scene);
  const g = scene.add.graphics().setDepth(depth + 2).setBlendMode(Phaser.BlendModes.ADD);
  const draw = (f: number) => {
    g.clear();
    g.lineStyle(14 * f + 2, 0x2fd8ff, 0.25 * f).lineBetween(mx, my, ex, ey);
    g.lineStyle(6 * f + 1, 0x7af0ff, 0.7 * f).lineBetween(mx, my, ex, ey);
    g.lineStyle(2, 0xffffff, f).lineBetween(mx, my, ex, ey);
    // crackling side sparks along the beam
    for (let i = 0; i < 8; i++) {
      const k = Math.random(), x = mx + (ex - mx) * k, y = my + (ey - my) * k;
      g.lineStyle(1.5, 0xbff8ff, f).lineBetween(x, y, x + rand(-10, 10), y + rand(-8, 8));
    }
  };
  draw(1);
  scene.tweens.addCounter({ from: 1, to: 0, duration: 260, onUpdate: tw => draw(tw.getValue() ?? 0), onComplete: () => g.destroy() });
  const flash = scene.add.image(mx, my, key).setTint(0x9ff6ff).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(34, 34).setDepth(depth + 3);
  scene.tweens.add({ targets: flash, alpha: 0, displayWidth: 60, displayHeight: 60, duration: 180, onComplete: () => flash.destroy() });
  for (const h of hits) {
    const b = scene.add.image(h.x, h.y, key).setTint(0x7af0ff).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(30, 30).setDepth(depth + 3);
    scene.tweens.add({ targets: b, alpha: 0, displayWidth: 50, displayHeight: 50, duration: 240, onComplete: () => b.destroy() });
  }
}

/** A small puff of rocket exhaust smoke left behind in the air. */
export function rocketSmoke(scene: Phaser.Scene, x: number, y: number, depth: number) {
  const s = scene.add.image(x, y, soft(scene)).setTint(0x9a969e).setDisplaySize(8, 8).setAlpha(0.55).setDepth(depth);
  scene.tweens.add({ targets: s, displayWidth: 20, displayHeight: 20, alpha: 0, y: y - 6, duration: 600, onComplete: () => s.destroy() });
}

/** Sparks spraying out of a broken machine with a puff of dark smoke rising from it. (x, y) = where it breaks. */
export function sparkBurst(scene: Phaser.Scene, x: number, y: number, depth: number, size = 1) {
  for (let i = 0; i < 16; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4, v = (60 + Math.random() * 110) * size;
    const g = scene.add.graphics().setDepth(depth + 1).setPosition(x, y);
    const col = [0xfff3b0, 0xffd27a, 0xff9a3a, 0x9fe4ff][i % 4];
    const k = { t: 0 };
    let px = 0, py = 0;
    scene.tweens.add({ targets: k, t: 1, duration: 350 + Math.random() * 350, ease: 'Linear',
      onUpdate: () => {
        const t = k.t * 0.6, nx = Math.cos(a) * v * t, ny = Math.sin(a) * v * t + 220 * t * t * size;
        g.clear().lineStyle(2, col, 1 - k.t).lineBetween(px, py, nx, ny); px = nx; py = ny;
      },
      onComplete: () => g.destroy() });
  }
  const key = soft(scene);
  for (let i = 0; i < 6; i++) {
    const s = scene.add.image(x + (Math.random() - 0.5) * 18 * size, y + 4, key).setDepth(depth)
      .setTint(i % 2 ? 0x3a3a42 : 0x55555e).setAlpha(0.75).setDisplaySize(22 * size, 22 * size);
    scene.tweens.add({ targets: s, y: y - (40 + Math.random() * 30) * size, displayWidth: 60 * size, displayHeight: 60 * size,
      alpha: 0, duration: 900 + Math.random() * 500, delay: i * 60, ease: 'Sine.easeOut', onComplete: () => s.destroy() });
  }
}
