// Impact and shot effects drawn in code: the bombard's explosion and the Boomstick's shotgun blast.
// Everything is short-lived and cleans itself up; all tunables sit at the top of each effect.
import Phaser from 'phaser';
import { OUTLINE } from './art';
import type { SafeLayer, SafeRecipe } from './fxRecipe';

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
 * Built from the same pieces as an Era Studio era's layered effects (layeredHit below).
 */
export function explosion(scene: Phaser.Scene, x: number, y: number, w: number, h: number, depth: number) {
  const key = soft(scene);
  const size = Math.max(64, w * 0.9); // fireball size follows the blast radius

  // scorch mark left on the ground, under enemies and towers
  groundMark(scene, x, y, w, h);
  // shockwave: a thin ring on the ground racing out to the edge of the blast area
  shockRing(scene, x, y, w, h);
  // white-hot flash
  flashGlow(scene, key, x, y - 8, size, depth + 2);
  // fireball: glowing blobs that swell and rise, cooling from yellow to red
  fireBlobs(scene, key, x, y - 6, size, depth + 1);
  // smoke: dark puffs billowing up after the fire, drifting and fading slowly
  smokePuffs(scene, key, x, y, size, depth);
  // sparks and dirt thrown out in arcs (z = height above the ground, pulled back down by gravity)
  debris(scene, x, y, depth + 3);

  // a tiny camera kick, skipped while one is already running so a barrage doesn't turn into a blur
  const cam = scene.cameras.main;
  if (!cam.shakeEffect.isRunning) cam.shake(110, 0.0025);
}

// ---- the pieces an explosion (and a layered effect) is made of; the defaults are the explosion's own numbers ----

/** A ground decal (the explosion's scorch): two ellipses; it lingers, then fades. */
export function groundMark(scene: Phaser.Scene, x: number, y: number, w: number, h: number,
  o: { color?: number; hold?: number; fade?: number } = {}) {
  const scorch = scene.add.graphics().setPosition(x, y).setDepth(60);
  const c = o.color ?? 0x140a08;
  scorch.fillStyle(c, 0.5).fillEllipse(0, 0, w * 0.55, h * 0.55);
  scorch.fillStyle(c, 0.35).fillEllipse(0, 0, w * 0.8, h * 0.8);
  scene.tweens.add({ targets: scorch, alpha: 0, delay: o.hold ?? 1200, duration: o.fade ?? 1600, onComplete: () => scorch.destroy() });
}

/** A thin ring on the ground racing out to the edge of (w, h). */
export function shockRing(scene: Phaser.Scene, x: number, y: number, w: number, h: number,
  o: { color?: number; width?: number; life?: number } = {}) {
  const ring = scene.add.graphics().setPosition(x, y).setDepth(61);
  ring.lineStyle(o.width ?? 3, o.color ?? 0xffd9a0, 0.9).strokeEllipse(0, 0, w, h);
  ring.setScale(0.2);
  scene.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: o.life ?? 320, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
}

/** A white-hot additive glow that swells and vanishes. */
export function flashGlow(scene: Phaser.Scene, key: string, x: number, y: number, size: number, depth: number,
  o: { color?: number; life?: number } = {}) {
  const flash = scene.add.image(x, y, key).setTint(o.color ?? 0xfff4d0).setBlendMode(Phaser.BlendModes.ADD)
    .setDisplaySize(size * 0.6, size * 0.45).setDepth(depth);
  scene.tweens.add({ targets: flash, displayWidth: size * 1.5, displayHeight: size * 1.05, alpha: 0, duration: o.life ?? 180,
    ease: 'Quad.easeOut', onComplete: () => flash.destroy() });
}

/** Glowing blobs that swell and rise; the first third in the first colour, and so on (hot to cool). */
export function fireBlobs(scene: Phaser.Scene, key: string, x: number, y: number, size: number, depth: number,
  o: { count?: number; colors?: number[]; rise?: [number, number]; life?: [number, number]; blend?: number; alpha?: number; cool?: boolean } = {}) {
  const n = o.count ?? 12, cols = o.colors ?? [0xffe27a, 0xff9a2e, 0xff5a1f];
  const [r0, r1] = o.rise ?? [14, 34], [l0, l1] = o.life ?? [420, 620];
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), r = rand(0, size * 0.25);
    const b = scene.add.image(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.5, key)
      .setTint(cols[Math.min(cols.length - 1, Math.floor(i * cols.length / n))]).setBlendMode(o.blend ?? Phaser.BlendModes.ADD)
      .setDisplaySize(size * 0.35, size * 0.35).setDepth(depth).setAlpha(o.alpha ?? 0.7);
    // cool: each blob starts at its own colour and cools along the list as it rises (a layered fireball)
    const k0 = i / n * 0.5;
    scene.tweens.add({
      targets: b, displayWidth: size * rand(0.6, 0.9), displayHeight: size * rand(0.6, 0.9),
      y: b.y - rand(r0, r1), alpha: 0, duration: rand(l0, l1), ease: 'Quad.easeOut', onComplete: () => b.destroy(),
      ...(o.cool ? { onUpdate: (tw: Phaser.Tweens.Tween) => { b.setTint(along(cols, k0 + (1 - k0) * tw.progress)); } } : {}),
    });
  }
}

/** Dark puffs billowing up, drifting and fading slowly. rise and time stretch the explosion's own numbers. */
export function smokePuffs(scene: Phaser.Scene, key: string, x: number, y: number, size: number, depth: number,
  o: { count?: number; color?: number; rise?: number; time?: number; alpha?: number } = {}) {
  const n = o.count ?? 7, k = o.time ?? 1, up = o.rise ?? 1;
  for (let i = 0; i < n; i++) {
    const s = scene.add.image(x + rand(-size * 0.25, size * 0.25), y - rand(4, 14), key)
      .setTint(o.color === undefined ? Phaser.Display.Color.GetColor(120 + i * 8, 110 + i * 7, 128 + i * 8) : mix(o.color, 0xffffff, i * 0.04))
      .setDisplaySize(size * 0.3, size * 0.3).setDepth(depth).setAlpha(0);
    scene.tweens.add({ targets: s, alpha: o.alpha ?? 0.7, delay: (80 + i * 30) * k, duration: 160 });
    scene.tweens.add({
      targets: s, displayWidth: size * rand(0.7, 1.0), displayHeight: size * rand(0.6, 0.85),
      y: s.y - rand(28, 50) * up, x: s.x + rand(-10, 10) * up, delay: (80 + i * 30) * k, duration: rand(900, 1300) * k,
      ease: 'Sine.easeOut',
    });
    scene.tweens.add({ targets: s, alpha: 0, delay: (600 + i * 40) * k, duration: 700 * k, onComplete: () => s.destroy() });
  }
}

/** Sparks (and dirt) thrown out in arcs and pulled back down. */
export function debris(scene: Phaser.Scene, x: number, y: number, depth: number,
  o: { count?: number; sparks?: number; sparkColors?: number[]; dirtColor?: number; speed?: number; rise?: number; life?: number; size?: number } = {}) {
  const bits = scene.add.graphics().setDepth(depth);
  const n = o.count ?? 16, ns = o.sparks ?? 8, sc = o.sparkColors ?? [0xffd27a], sz = o.size ?? 1;
  const parts = Array.from({ length: n }, (_, i) => {
    const a = rand(0, Math.PI * 2), speed = rand(60, 150) * (o.speed ?? 1);
    return {
      spark: i < ns, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed * 0.5, vz: rand(90, 200) * (o.rise ?? 1),
      size: (i < ns ? rand(1.2, 2.2) : rand(2, 3.5)) * sz, color: i < ns ? sc[i % sc.length] : o.dirtColor ?? 0x2a1d18,
    };
  });
  const life = o.life ?? 650;
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
export function tracerBurst(scene: Phaser.Scene, mx: number, my: number, tx: number, ty: number, depth: number, tint?: number) {
  const key = soft(scene);
  const c1 = tint ?? 0xffe08a, c2 = tint ?? 0xffc860;
  const flash = scene.add.image(mx, my, key).setTint(tint ?? 0xffd27a).setBlendMode(Phaser.BlendModes.ADD)
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
          g.lineStyle(2, c1, 0.95).lineBetween(x - Math.cos(a) * 16, y - Math.sin(a) * 16, x, y);
        } else {
          const f = 1 - Math.min(1, (k - 1) * 1.5);
          if (f > 0) g.fillStyle(c2, f).fillCircle(ex, ey, 1.5 + 2 * f);
        }
      }
    },
    onComplete: () => g.destroy(),
  });
}

/** Railgun: a bright cyan beam from the muzzle through every enemy it hits, fading out with crackles. */
export function railBeam(scene: Phaser.Scene, mx: number, my: number, ex: number, ey: number, hits: { x: number; y: number }[], depth: number, tint?: number) {
  const key = soft(scene);
  const g = scene.add.graphics().setDepth(depth + 2).setBlendMode(Phaser.BlendModes.ADD);
  const outer = tint ?? 0x2fd8ff, mid = tint ?? 0x7af0ff, spark = tint ?? 0xbff8ff;
  const draw = (f: number) => {
    g.clear();
    g.lineStyle(14 * f + 2, outer, 0.25 * f).lineBetween(mx, my, ex, ey);
    g.lineStyle(6 * f + 1, mid, 0.7 * f).lineBetween(mx, my, ex, ey);
    g.lineStyle(2, 0xffffff, f).lineBetween(mx, my, ex, ey);
    // crackling side sparks along the beam
    for (let i = 0; i < 8; i++) {
      const k = Math.random(), x = mx + (ex - mx) * k, y = my + (ey - my) * k;
      g.lineStyle(1.5, spark, f).lineBetween(x, y, x + rand(-10, 10), y + rand(-8, 8));
    }
  };
  draw(1);
  scene.tweens.addCounter({ from: 1, to: 0, duration: 260, onUpdate: tw => draw(tw.getValue() ?? 0), onComplete: () => g.destroy() });
  const flash = scene.add.image(mx, my, key).setTint(tint ?? 0x9ff6ff).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(34, 34).setDepth(depth + 3);
  scene.tweens.add({ targets: flash, alpha: 0, displayWidth: 60, displayHeight: 60, duration: 180, onComplete: () => flash.destroy() });
  for (const h of hits) {
    const b = scene.add.image(h.x, h.y, key).setTint(mid).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(30, 30).setDepth(depth + 3);
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

/** A cannon's muzzle flash at (x, y), pointing along `angle` (screen radians). */
export function muzzleFlash(scene: Phaser.Scene, x: number, y: number, angle: number, depth: number, size = 1) {
  const key = soft(scene);
  const glow = scene.add.image(x, y, key).setDepth(depth).setTint(0xffb347).setBlendMode(Phaser.BlendModes.ADD)
    .setDisplaySize(60 * size, 60 * size);
  const g = scene.add.graphics().setDepth(depth + 1).setPosition(x, y).setRotation(angle);
  g.fillStyle(0xfff3b0, 1).fillTriangle(0, -9 * size, 0, 9 * size, 38 * size, 0);
  g.fillStyle(0xffd27a, 1).fillTriangle(4 * size, -16 * size, 4 * size, -4 * size, 26 * size, -14 * size);
  g.fillStyle(0xffd27a, 1).fillTriangle(4 * size, 16 * size, 4 * size, 4 * size, 26 * size, 14 * size);
  g.fillStyle(0xffffff, 1).fillCircle(0, 0, 8 * size);
  scene.tweens.add({ targets: [glow, g], alpha: 0, duration: 160, ease: 'Quad.easeOut', onComplete: () => { glow.destroy(); g.destroy(); } });
  scene.tweens.add({ targets: g, scaleX: 1.4, scaleY: 1.2, duration: 160 });
}

/** The soft round dot the effects are made of (for glows drawn elsewhere). */
export const softDot = soft;

/** A fading mote left behind a flying shot (an Era Studio era's trail colour). */
export function trailMote(scene: Phaser.Scene, x: number, y: number, tint: number, depth: number) {
  const m = scene.add.image(x, y, soft(scene)).setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(9, 9).setAlpha(0.8).setDepth(depth);
  scene.tweens.add({ targets: m, displayWidth: 3, displayHeight: 3, alpha: 0, duration: 320, onComplete: () => m.destroy() });
}

/** An Era Studio era's impact picture: pops up where a shot hits, swells a little and fades. */
export function impactBurst(scene: Phaser.Scene, textureKey: string, x: number, y: number, size: number, depth: number) {
  const img = scene.add.image(x, y, textureKey);
  const k = size / Math.max(img.width, img.height);
  img.setOrigin(0.5, 0.5).setDisplaySize(img.width * k * 0.5, img.height * k * 0.5).setDepth(depth).setRotation(Math.random() * 0.6 - 0.3);
  scene.tweens.add({ targets: img, displayWidth: img.width * k, displayHeight: img.height * k, duration: 120, ease: 'Quad.easeOut' });
  scene.tweens.add({ targets: img, alpha: 0, delay: 140, duration: 260, onComplete: () => img.destroy() });
}

// ======================= LAYERED EFFECTS (Era Studio eras; see src/fxRecipe.ts) =======================

/** a blended towards b by k (0-1). */
function mix(a: number, b: number, k: number) {
  const t = Math.max(0, Math.min(1, k));
  const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
/** The colour k (0-1) of the way along a hot-to-cool list. */
function along(cols: number[], k: number) {
  if (cols.length < 2) return cols[0];
  const f = Math.max(0, Math.min(0.9999, k)) * (cols.length - 1), i = Math.floor(f);
  return mix(cols[i], cols[i + 1], f - i);
}
const blendOf = (l: SafeLayer) => l.blend === 'add' ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL;
/** Runs onUpdate(k, ms) from k = 0 to 1 over `life` ms, after `delay`. */
function animate(scene: Phaser.Scene, life: number, onUpdate: (k: number, ms: number) => void, onDone: () => void, delay = 0) {
  onUpdate(0, 0);   // the starting state now: a piece made this frame must not be drawn at its texture's own size first
  scene.tweens.addCounter({ from: 0, to: 1, duration: life, delay, onUpdate: tw => { const k = tw.getValue() ?? 0; onUpdate(k, k * life); }, onComplete: onDone });
}

const SHARD = 'fx_shard';
/** A small ice/stone splinter (white with a dark edge), tinted per use. */
function shardTexture(scene: Phaser.Scene) {
  if (scene.textures.exists(SHARD)) return SHARD;
  const w = 24, h = 12;
  const tex = scene.textures.createCanvas(SHARD, w, h)!;
  const ctx = tex.getContext();
  // a crystal splinter: a lit facet and a shaded one (the tint colours both), a dark edge like the game's outlines
  const P = [[1, h / 2], [w * 0.35, 1], [w - 1, h * 0.45], [w * 0.4, h - 1]];
  ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); ctx.lineTo(P[1][0], P[1][1]); ctx.lineTo(P[2][0], P[2][1]); ctx.closePath();
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); ctx.lineTo(P[2][0], P[2][1]); ctx.lineTo(P[3][0], P[3][1]); ctx.closePath();
  ctx.fillStyle = '#9aa6b4'; ctx.fill();
  ctx.beginPath(); P.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(40,52,70,0.9)'; ctx.stroke();
  tex.refresh();
  return SHARD;
}

/**
 * Where a layered hit happens: (x, y) the point hit (an enemy's body, or the ground for a shell), gy the ground under
 * it, (w, h) the area on the ground it covers, size the effect's size in px, depth the draw depth above the ground.
 * tex turns a layer's `texture` ('impact', 'projectile' or a sprite name) into a loaded texture key.
 */
export interface FxSpot {
  x: number; y: number; gy: number; w: number; h: number; size: number; depth: number;
  tex: (name: string | undefined) => string | undefined;
}

/** An Era Studio hit drawn as a recipe of layers (the generalised explosion). */
export function layeredHit(scene: Phaser.Scene, rec: SafeRecipe, at: FxSpot, splash: boolean) {
  for (const l of rec.layers) {
    if (l.delay > 0) scene.time.delayedCall(l.delay, () => hitLayer(scene, l, at));
    else hitLayer(scene, l, at);
  }
  if (rec.shake && splash) {
    const cam = scene.cameras.main;
    if (!cam.shakeEffect.isRunning) cam.shake(90, 0.002);
  }
}

function hitLayer(scene: Phaser.Scene, l: SafeLayer, at: FxSpot) {
  const key = soft(scene);
  const S = at.size * l.size, w = at.w * l.size, h = at.h * l.size;
  // pieces thrown or rising travel in proportion to the effect's size (the explosion's numbers are for ~110 px)
  const reach = Math.max(0.3, Math.min(1.2, S / 110));
  const c0 = l.colors[0];
  switch (l.type) {
    case 'flash': flashGlow(scene, key, at.x, at.y - S * 0.05, S, at.depth + 2, { color: c0, life: l.life }); break;
    case 'fireball':
      fireBlobs(scene, key, at.x, at.y - S * 0.05, S, at.depth + 1, {
        count: l.count, colors: l.colors, rise: [S * 0.11 * l.rise, S * 0.27 * l.rise], life: [l.life * 0.8, l.life * 1.2], blend: blendOf(l),
        alpha: l.blend === 'add' ? 0.7 : 0.92, cool: true,
      });
      break;
    case 'smoke': smokePuffs(scene, key, at.x, at.y, S, at.depth, { count: l.count, color: c0, rise: reach * l.rise, time: l.life / 1100, alpha: 0.6 }); break;
    case 'sparks':
      debris(scene, at.x, at.y, at.depth + 3, { count: l.count, sparks: l.count, sparkColors: l.colors, speed: reach * l.speed, rise: reach * l.rise, life: l.life,
        size: Math.max(0.6, Math.min(1.2, S / 80)) });
      break;
    case 'embers': embers(scene, key, at.x, at.y, S, at.depth + 2, l); break;
    case 'shards': shards(scene, at, S, reach, l); break;
    case 'mist': mist(scene, key, at.x, at.gy, w, h, at.depth, l); break;
    case 'ring': shockRing(scene, at.x, at.gy, w, h, { color: c0, width: Math.max(1.5, Math.min(3, S / 40)), life: l.life }); break;
    case 'mark': softMark(scene, key, at.x, at.gy, w, h, l); break;
    case 'spikes': spikes(scene, at.x, at.gy, w, h, S, at.depth + 1, l); break;
    case 'image': {
      const tk = at.tex(l.texture ?? 'impact');
      if (tk) picture(scene, tk, at.x, at.y, S, at.depth + 2, l);
      break;
    }
    default: break;
  }
}

/** A feathered ground decal (scorch, frost patch) with optional crack lines: lingers, then fades. */
function softMark(scene: Phaser.Scene, key: string, x: number, y: number, w: number, h: number, l: SafeLayer) {
  const parts: Phaser.GameObjects.GameObject[] = [];
  for (const [k, a] of [[1.05, 0.45], [0.7, 0.4]] as const) {
    parts.push(scene.add.image(x, y, key).setTint(l.colors[0]).setDisplaySize(w * k, h * k).setAlpha(a).setDepth(60));
  }
  if (l.cracks) {
    const g = scene.add.graphics().setPosition(x, y).setDepth(60.1);
    g.lineStyle(1.5, l.colors[1] ?? l.colors[0], 0.85);
    for (let i = 0; i < l.cracks; i++) {
      const a0 = (i / l.cracks) * Math.PI * 2 + rand(-0.3, 0.3);
      let px = 0, py = 0;
      const len = rand(0.25, 0.42);
      for (let k = 1; k <= 3; k++) {
        const r = len * k / 3, aa = a0 + rand(-0.35, 0.35);
        const nx = Math.cos(aa) * w * r, ny = Math.sin(aa) * h * r;
        g.lineBetween(px, py, nx, ny); px = nx; py = ny;
      }
    }
    parts.push(g);
  }
  scene.tweens.add({ targets: parts, alpha: 0, delay: l.life * 0.45, duration: l.life * 0.55, onComplete: () => parts.forEach(o => o.destroy()) });
}

/** Small glowing motes rising slowly and flickering out. */
function embers(scene: Phaser.Scene, key: string, x: number, y: number, S: number, depth: number, l: SafeLayer) {
  const dots = Array.from({ length: l.count }, (_, i) => {
    const a = rand(0, Math.PI * 2), r = rand(0, S * 0.3);
    const d = Math.max(2, Math.min(5, S * 0.06)) * rand(0.7, 1.2);
    return {
      img: scene.add.image(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.5, key).setTint(l.colors[i % l.colors.length])
        .setBlendMode(blendOf(l)).setDisplaySize(d, d).setDepth(depth),
      x0: x + Math.cos(a) * r, y0: y + Math.sin(a) * r * 0.5, up: rand(0.25, 0.6) * S * l.rise + 6, drift: rand(-0.2, 0.2) * S,
      ph: rand(0, 6.28), life: rand(0.7, 1.15),
    };
  });
  animate(scene, l.life, k => {
    for (const p of dots) {
      const q = Math.min(1, k / p.life), e = 1 - (1 - q) * (1 - q);
      p.img.setPosition(p.x0 + p.drift * e + Math.sin(q * 9 + p.ph) * 2, p.y0 - p.up * e)
        .setAlpha(q >= 1 ? 0 : (1 - q) * (0.65 + 0.35 * Math.sin(q * 40 + p.ph)));
    }
  }, () => dots.forEach(p => p.img.destroy()));
}

/** Pieces flung out in arcs, spinning, landing and fading (ice chunks, burning splinters, a picture as the piece). */
function shards(scene: Phaser.Scene, at: FxSpot, S: number, reach: number, l: SafeLayer) {
  const tk = l.texture ? at.tex(l.texture) : undefined;
  const key = tk ?? shardTexture(scene), dot = soft(scene);
  const ground = at.gy - at.y;   // how far below the hit point the ground is (they land there)
  const parts = Array.from({ length: l.count }, (_, i) => {
    const a = rand(0, Math.PI * 2), sp = rand(70, 150) * reach * l.speed;
    const img = scene.add.image(at.x, at.y, key).setDepth(at.depth + 2).setBlendMode(blendOf(l));
    const len = Math.max(5, S * 0.26) * rand(0.7, 1.2);
    img.setScale(len / Math.max(img.width, img.height));
    if (!tk || l.ownColors) img.setTint(l.colors[i % l.colors.length]);
    return { img, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, vz: rand(110, 200) * Math.sqrt(reach) * l.rise, rot: rand(0, 6.28), spin: rand(-14, 14),
      col: l.colors[i % l.colors.length], land: null as null | { x: number; y: number; ms: number }, trailMs: 0 };
  });
  let last = 0;
  animate(scene, l.life, (k, ms) => {
    const t = ms / 1000, step = ms - last; last = ms;
    for (const p of parts) {
      let px: number, py: number;
      if (p.land) ({ x: px, y: py } = p.land);
      else {
        // height above the ground point under the hit, pulled down by gravity; they land on the ground
        const z = p.vz * t - 0.5 * 480 * Math.sqrt(reach) * t * t + Math.max(0, ground);
        px = at.x + p.vx * t; py = at.y + Math.max(0, ground) + p.vy * t - Math.max(0, z);
        p.img.setRotation(p.rot + p.spin * t);
        if (z <= 0 && t > 0.05) p.land = { x: px, y: py, ms };
        if (l.trail && !p.land) {
          p.trailMs -= step;
          if (p.trailMs <= 0) { p.trailMs = 35; mote(scene, dot, px, py, p.col, at.depth + 1, Math.max(3, S * 0.12), 260); }
        }
      }
      // in the air it stays bright; once down it melts away quickly
      const gone = p.land ? Math.min(1, (ms - p.land.ms) / 180) : 0;
      p.img.setPosition(px, py).setAlpha(Math.max(0, (k < 0.7 ? 1 : (1 - k) / 0.3) - gone));
    }
  }, () => parts.forEach(p => p.img.destroy()));
}

/** A fading glow dot (trails behind shards, shots and jets). */
function mote(scene: Phaser.Scene, key: string, x: number, y: number, tint: number, depth: number, size: number, life: number,
  o: { dy?: number; blend?: number; alpha?: number; grow?: number } = {}) {
  const m = scene.add.image(x, y, key).setTint(tint).setBlendMode(o.blend ?? Phaser.BlendModes.ADD).setDisplaySize(size, size)
    .setAlpha(o.alpha ?? 0.8).setDepth(depth);
  scene.tweens.add({ targets: m, displayWidth: size * (o.grow ?? 0.35), displayHeight: size * (o.grow ?? 0.35), y: y + (o.dy ?? 0), alpha: 0,
    duration: life, ease: 'Quad.easeOut', onComplete: () => m.destroy() });
}

/** A soft cold cloud spreading low over (w, h) and fading slowly. */
function mist(scene: Phaser.Scene, key: string, x: number, gy: number, w: number, h: number, depth: number, l: SafeLayer) {
  const puffs = Array.from({ length: l.count }, (_, i) => {
    const a = rand(0, Math.PI * 2), r = rand(0.05, 0.4);
    const x0 = x + Math.cos(a) * w * 0.5 * r, y0 = gy + Math.sin(a) * h * 0.5 * r - rand(2, 8);
    return {
      img: scene.add.image(x0, y0, key).setTint(l.colors[i % l.colors.length]).setBlendMode(blendOf(l)).setDepth(depth).setAlpha(0)
        .setDisplaySize(w * 0.28, w * 0.18),
      x0, y0, dx: Math.cos(a) * w * 0.2, dy: Math.sin(a) * h * 0.2 - rand(3, 10) * l.rise, life: rand(0.75, 1),
    };
  });
  animate(scene, l.life, k => {
    for (const p of puffs) {
      const q = Math.min(1, k / p.life), e = 1 - (1 - q) * (1 - q);
      p.img.setPosition(p.x0 + p.dx * e, p.y0 + p.dy * e).setDisplaySize(w * (0.28 + 0.32 * e), w * (0.18 + 0.2 * e))
        .setAlpha((q < 0.2 ? q / 0.2 : (1 - q) / 0.8) * 0.62);
    }
  }, () => puffs.forEach(p => p.img.destroy()));
}

/** Ice crystals jutting out of the ground around (x, gy), then breaking off and fading. */
function spikes(scene: Phaser.Scene, x: number, gy: number, w: number, h: number, S: number, depth: number, l: SafeLayer) {
  const g = scene.add.graphics().setDepth(depth);
  const light = l.colors[0], dark = l.colors[1] ?? mix(light, 0x2f6fb8, 0.45);
  const xs = Array.from({ length: l.count }, (_, i) => {
    const a = (i / l.count) * Math.PI * 2 + rand(-0.4, 0.4), r = rand(0.12, 0.5);
    const ht = S * rand(0.35, 0.7);
    return { bx: x + Math.cos(a) * w * 0.5 * r, by: gy + Math.sin(a) * h * 0.5 * r, ht, wd: ht * rand(0.28, 0.4),
      lean: Math.cos(a) * 0.45 + rand(-0.15, 0.15), at: rand(0, 0.12) };
  }).sort((a, b) => a.by - b.by);
  animate(scene, l.life, k => {
    g.clear();
    for (const c of xs) {
      const q = Math.max(0, (k - c.at) / (1 - c.at));
      if (q <= 0) continue;
      const grow = Math.min(1, q / 0.18), pop = grow < 1 ? 1 - Math.pow(1 - grow, 3) * 1.1 : 1;   // shoots up with a little overshoot
      const fade = q < 0.6 ? 1 : 1 - (q - 0.6) / 0.4, sink = q < 0.6 ? 0 : (q - 0.6) * c.ht * 0.5;
      const H = c.ht * pop, tipX = c.bx + c.lean * H, tipY = c.by - H + sink;
      g.fillStyle(light, 0.95 * fade).fillTriangle(c.bx - c.wd / 2, c.by, tipX, tipY, c.bx, c.by + 1);
      g.fillStyle(dark, 0.95 * fade).fillTriangle(c.bx, c.by + 1, tipX, tipY, c.bx + c.wd / 2, c.by);
      g.lineStyle(1.2, OUTLINE, 0.75 * fade).strokeTriangle(c.bx - c.wd / 2, c.by, tipX, tipY, c.bx + c.wd / 2, c.by);
      g.lineStyle(1, 0xffffff, 0.8 * fade).lineBetween(c.bx - c.wd * 0.15, c.by - H * 0.15, tipX - c.lean * 1.5, tipY + H * 0.2);
    }
  }, () => g.destroy());
}

/** The generated picture as a small element: pops, swells a little and fades. */
function picture(scene: Phaser.Scene, key: string, x: number, y: number, S: number, depth: number, l: SafeLayer) {
  const img = scene.add.image(x, y, key).setBlendMode(blendOf(l)).setDepth(depth).setRotation(rand(-0.3, 0.3));
  const k = S / Math.max(img.width, img.height);
  img.setScale(k * 0.5);
  scene.tweens.add({ targets: img, scale: k, duration: l.life * 0.3, ease: 'Quad.easeOut' });
  scene.tweens.add({ targets: img, alpha: 0, delay: l.life * 0.3, duration: l.life * 0.7, onComplete: () => img.destroy() });
}

// ---- shots in flight ----

/** One puff a flying shot leaves behind (x, y = the shot, dx, dy = its heading, size = the shot's size in px). */
export function flightPuff(scene: Phaser.Scene, l: SafeLayer, x: number, y: number, dx: number, dy: number, size: number, depth: number) {
  const key = soft(scene), S = size * l.size;
  const jx = rand(-0.15, 0.15) * S, jy = rand(-0.15, 0.15) * S;
  const bx = x - dx * S * 0.3 + jx, by = y - dy * S * 0.3 + jy;
  switch (l.type) {
    case 'fireball': {
      // a lick of flame: hot and bright at the shot, cooling and shrinking as it falls behind
      const b = scene.add.image(bx, by, key).setBlendMode(blendOf(l)).setDepth(depth - 0.2).setDisplaySize(S * 0.8, S * 0.8).setTint(l.colors[0]);
      const up = rand(3, 9) * l.rise;
      animate(scene, l.life * rand(0.8, 1.2), k => {
        b.setTint(along(l.colors, k)).setDisplaySize(S * (0.8 - 0.5 * k), S * (0.8 - 0.5 * k)).setY(by - up * k).setAlpha(0.85 * (1 - k));
      }, () => b.destroy());
      break;
    }
    case 'smoke': mote(scene, key, bx, by, l.colors[0], depth - 0.4, S * 0.5, l.life, { dy: -6 * l.rise, blend: Phaser.BlendModes.NORMAL, alpha: 0.5, grow: 2.2 }); break;
    case 'mist': mote(scene, key, bx, by, l.colors[0], depth - 0.4, S * 0.7, l.life, { dy: 5 * l.rise, blend: blendOf(l), alpha: 0.45, grow: 2.4 }); break;
    case 'sparks': case 'shards': mote(scene, key, bx, by, l.colors[(Math.random() * l.colors.length) | 0], depth - 0.1, Math.max(3, S * 0.22), l.life,
      { dy: rand(6, 14) * l.rise, alpha: 1, grow: 0.3 }); break;
    case 'embers': mote(scene, key, bx, by, l.colors[(Math.random() * l.colors.length) | 0], depth - 0.1, Math.max(3, S * 0.2), l.life,
      { dy: -rand(6, 14) * l.rise, alpha: 1, grow: 0.4 }); break;
    default: break;
  }
}

/** The pulsing glow on a flying shot (its `core` layer): two soft dots, made once and moved each frame. */
export function makeCore(scene: Phaser.Scene, l: SafeLayer, x: number, y: number, depth: number) {
  const key = soft(scene);
  const outer = scene.add.image(x, y, key).setTint(l.colors[1] ?? l.colors[0]).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth - 0.1).setAlpha(0.55);
  const inner = scene.add.image(x, y, key).setTint(l.colors[0]).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth + 0.6).setAlpha(0.9);
  return [outer, inner];
}
export function moveCore(core: Phaser.GameObjects.Image[], l: SafeLayer, x: number, y: number, size: number, depth: number, t: number) {
  const S = size * l.size, pulse = 1 + 0.12 * Math.sin(t * 18);
  core[0].setPosition(x, y).setDepth(depth - 0.1).setDisplaySize(S * 2 * pulse, S * 2 * pulse);
  core[1].setPosition(x, y).setDepth(depth + 0.6).setDisplaySize(S * 0.8 * pulse, S * 0.8 * pulse);
}

// ---- streams (a flame jet) ----

/**
 * One puff of a stream's jet: from the muzzle (mx, my) towards a point (ex, ey) at the far end of the cone,
 * W = the cone's half width there in px.
 */
export function jetPuff(scene: Phaser.Scene, l: SafeLayer, mx: number, my: number, ex: number, ey: number, W: number, depth: number) {
  const key = soft(scene);
  const life = l.life * rand(0.8, 1.2);
  switch (l.type) {
    case 'fireball': {
      // flame: small and white-hot at the nozzle, billowing out, cooling to orange and red, then licking upwards
      const b = scene.add.image(mx, my, key).setBlendMode(blendOf(l)).setDepth(depth).setTint(l.colors[0]);
      // stretched along the jet while it is young and fast (a tongue of flame, not a ball), rounder as it billows out
      const S0 = W * 0.3 * l.size, S1 = W * rand(1.0, 1.5) * l.size, up = rand(6, 16) * l.rise;
      b.setRotation(Math.atan2(ey - my, ex - mx));
      animate(scene, life, k => {
        const e = 1 - (1 - k) * (1 - k);
        const s = S0 + (S1 - S0) * e;
        b.setPosition(mx + (ex - mx) * e, my + (ey - my) * e - up * k * k).setDisplaySize(s * (1.7 - 0.7 * e), s * (0.4 + 0.5 * e))
          .setTint(along(l.colors, k)).setAlpha(k < 0.15 ? 0.25 + k * 3 : 0.7 * (1 - k) / 0.85);
      }, () => b.destroy());
      break;
    }
    case 'smoke': case 'mist': {
      // dark smoke (or vapour) curling off the end of the jet
      const k0 = rand(0.55, 0.9), sx = mx + (ex - mx) * k0, sy = my + (ey - my) * k0;
      const s = scene.add.image(sx, sy, key).setTint(l.colors[0]).setBlendMode(blendOf(l)).setDepth(depth - 0.5).setAlpha(0)
        .setDisplaySize(W * 0.6 * l.size, W * 0.6 * l.size);
      const up = rand(20, 40) * l.rise, drift = (ex - mx) * rand(0.1, 0.25);
      animate(scene, life, k => {
        const e = 1 - (1 - k) * (1 - k);
        s.setPosition(sx + drift * e, sy - up * e).setDisplaySize(W * (0.6 + 0.9 * e) * l.size, W * (0.6 + 0.9 * e) * l.size)
          .setAlpha((k < 0.25 ? k / 0.25 : (1 - k) / 0.75) * 0.42);
      }, () => s.destroy());
      break;
    }
    case 'sparks': case 'embers': {
      // bright embers riding the jet past its end and drifting up (embers) or falling (sparks)
      const d = Math.max(2, W * 0.12) * l.size;
      const m = scene.add.image(mx, my, key).setTint(l.colors[(Math.random() * l.colors.length) | 0]).setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(depth + 0.5).setDisplaySize(d, d);
      const over = rand(0.85, 1.2), fall = (l.type === 'sparks' ? 1 : -1) * rand(8, 22) * l.rise, ph = rand(0, 6.28);
      animate(scene, life, k => {
        const e = 1 - (1 - k) * (1 - k);
        m.setPosition(mx + (ex - mx) * e * over + Math.sin(k * 12 + ph) * 2, my + (ey - my) * e * over + fall * k * k)
          .setAlpha((1 - k) * (0.7 + 0.3 * Math.sin(k * 50 + ph)));
      }, () => m.destroy());
      break;
    }
    default: break;
  }
}

// ---- burning ground ----

/** One puff over a patch of burning ground centred on (x, y), (w, h) its ellipse on screen. */
export function groundPuff(scene: Phaser.Scene, l: SafeLayer, x: number, y: number, w: number, h: number, depth: number) {
  const key = soft(scene);
  const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * 0.42;
  const px = x + Math.cos(a) * w * r, py = y + Math.sin(a) * h * r;
  const life = l.life * rand(0.8, 1.2), S = Math.max(8, w * 0.22) * l.size;
  switch (l.type) {
    case 'fireball': {
      // a lick of flame: rises from the ground, grows, then narrows and cools away
      const b = scene.add.image(px, py, key).setBlendMode(blendOf(l)).setDepth(depth).setTint(l.colors[0]);
      const up = rand(10, 22) * l.rise * Math.max(0.6, Math.min(1.4, w / 90));
      animate(scene, life, k => {
        const grow = k < 0.3 ? k / 0.3 : 1 - (k - 0.3) * 0.8;
        b.setPosition(px + Math.sin(k * 7 + a) * 2, py - up * k).setDisplaySize(S * 0.55 * grow, S * (0.7 + 0.5 * k) * grow)
          .setTint(along(l.colors, k)).setAlpha(0.85 * (k < 0.15 ? k / 0.15 : (1 - k) / 0.85));
      }, () => b.destroy());
      break;
    }
    case 'smoke': case 'mist': mote(scene, key, px, py - 6, l.colors[0], depth - 0.5, S * 0.7, life,
      { dy: -rand(22, 40) * l.rise, blend: blendOf(l), alpha: 0.35, grow: 2.2 }); break;
    case 'sparks': case 'embers': mote(scene, key, px, py - 4, l.colors[(Math.random() * l.colors.length) | 0], depth + 0.5, Math.max(2.5, S * 0.14), life,
      { dy: -rand(18, 36) * l.rise, alpha: 1, grow: 0.5 }); break;
    default: break;
  }
}

/** The glowing ground under burning ground with a recipe: char, then an ember glow that breathes. */
export function drawBurnGround(g: Phaser.GameObjects.Graphics, rec: SafeRecipe, w: number, h: number, fade: number, t: number, seed: number) {
  const mark = rec.layers.find(l => l.type === 'mark'), core = rec.layers.find(l => l.type === 'core' || l.type === 'fireball');
  const char = mark?.colors[0] ?? 0x2a140c, glow = core?.colors[1] ?? core?.colors[0] ?? 0xff6a1f, hot = core?.colors[0] ?? 0xffc04a;
  const breathe = 0.8 + 0.2 * Math.sin(t * 5 + seed);
  g.fillStyle(char, 0.42 * fade).fillEllipse(0, 0, w, h);
  g.fillStyle(glow, 0.26 * fade * breathe).fillEllipse(0, 0, w * 0.78, h * 0.78);
  g.fillStyle(hot, 0.2 * fade * breathe).fillEllipse(0, 0, w * 0.42, h * 0.42);
}
