"""Composes the layered, perfectly looping start-menu title (option C, the broken clock).

Every moving part except the two fighters is drawn here, mathematically, so the loop has no seam:
- plate: the 3D title with the clock hands and cogwheels painted out (FLUX.2 Klein edit)
- vortex: bands of light run along its spiral arms (procedural, masked to the painted vortex), one turn per loop
- clock hands: the minute hand makes one full turn per loop (the loop starts and ends on 12), the hour hand stays put
- cogwheels: rotate by whole numbers of teeth per loop, meshing pairs in opposite directions at their tooth ratio
- fighters: the archer and the demon come from a WAN clip of the plate, pasted in through feathered masks and
  cross-faded over the first frames so their gestures wrap smoothly
- letters: cut from the plate through their mask and drawn last, so hands and cogs pass behind them; they pulse
  with a soft cold glow twice per loop

usage: python tools/anim/compose_title.py <fight take folder> [--frames 72] [--fps 16] [--xfade 8] [--start 1]
Writes public/sprites/title/title_0.webp (8-column sheet) and src/anims/title.json, same format as build_title.py.
"""
import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as nd

ROOT = Path(__file__).resolve().parents[2]
ASSETS = Path('/mnt/user-data/uploads/dev/game-asset-mcp/assets')
LAYERS = ASSETS / 'title' / 'layers'
MASKS = Path(__file__).resolve().parent / 'title_layers'      # letters_mask.png lives in the repo
W, H = 1440, 720                                               # plate size; output is downsampled at the end
CENTER = (720, 360)                                            # clock centre on the plate


def rgba(p): return Image.open(p).convert('RGBA')


def feather(mask, r):
    return Image.fromarray((np.clip(mask, 0, 1) * 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(r))


def sprite_on_canvas(sprite, pivot, scale, angle_deg, at):
    """Paste `sprite` (RGBA) scaled about its pivot, rotated clockwise by angle_deg, with the pivot placed at `at`."""
    s = sprite.resize((max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale))), Image.LANCZOS)
    px, py = pivot[0] * scale, pivot[1] * scale
    # pad so the pivot is the centre, then rotate about the centre
    half = math.ceil(max(px, s.width - px, py, s.height - py)) + 2
    pad = Image.new('RGBA', (2 * half, 2 * half))
    pad.alpha_composite(s, (round(half - px), round(half - py)))
    rot = pad.rotate(-angle_deg, resample=Image.BICUBIC)
    canvas = Image.new('RGBA', (W, H))
    canvas.paste(rot, (round(at[0] - half), round(at[1] - half)), rot)
    return canvas


def with_shadow(layer, offset=(4, 6), blur=5, alpha=0.45):
    a = np.asarray(layer)[..., 3].astype(np.float32) / 255 * alpha
    sh = Image.fromarray((a * 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(blur))
    shadow = Image.new('RGBA', layer.size, (8, 14, 24, 0)); shadow.putalpha(sh)
    out = Image.new('RGBA', layer.size)
    out.alpha_composite(shadow, offset); out.alpha_composite(layer)
    return out


def vortex_mask(plate_rgb, letters_m):
    """Where the painted vortex is (not the clock face, gold rim, letters or dark backdrop), softly feathered."""
    p = plate_rgb.astype(np.float32)
    r, g, b = p[..., 0], p[..., 1], p[..., 2]
    yy, xx = np.mgrid[0:H, 0:W]
    dist = np.hypot(xx - CENTER[0], yy - CENTER[1])
    not_letters = nd.binary_dilation(letters_m > 0.5, iterations=4) == 0
    mx = p.max(2); sat = (mx - p.min(2)) / np.maximum(mx, 1)
    face = (np.abs(r - b) < 22) & (sat < 0.2)
    gold = r > b + 18
    vm = (dist < 380) & not_letters & ~face & ~gold & (mx > 70) & (b >= r + 10)
    vm = nd.binary_opening(vm, iterations=1).astype(np.float32)
    # brighter vortex pixels carry more of the light
    return np.clip(nd.gaussian_filter(vm, 2.0), 0, 1) * np.clip((mx - 70) / 120, 0, 1)


def swirl_light(t, arms=3, twist=2.6):
    """Bands of light along logarithmic spiral arms, turning once per loop (t in 0..1); 0..1 brightness."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    dx, dy = xx - CENTER[0], yy - CENTER[1]
    rad = np.hypot(dx, dy) + 1
    th = np.arctan2(dy, dx)
    phase = arms * (th + twist * np.log(rad / 60)) + 2 * np.pi * arms * t
    band = np.clip(np.cos(phase), 0, 1) ** 6
    fall = np.clip(1 - rad / 400, 0, 1) ** 0.6
    return band * fall


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('fight'); ap.add_argument('--frames', type=int, default=72); ap.add_argument('--fps', type=int, default=16)
    ap.add_argument('--xfade', type=int, default=8); ap.add_argument('--start', type=int, default=1)
    ap.add_argument('--width', type=int, default=460)
    ap.add_argument('--out', default='public/sprites/title/title_0.webp'); ap.add_argument('--meta', default='src/anims/title.json')
    ap.add_argument('--preview', help='also write a few full-size frames to this folder')
    o = ap.parse_args()
    N, K = o.frames, o.xfade

    plate = rgba(LAYERS / 'title_C_plate_v1.png').resize((W, H))
    plate_rgb = np.asarray(plate.convert('RGB'))
    letters_m = np.asarray(Image.open(MASKS / 'letters_mask.png').convert('L').resize((W, H))).astype(np.float32) / 255
    letters_a = feather(letters_m, 1.2)
    letters = plate.copy(); letters.putalpha(letters_a)
    glow_a = np.asarray(feather(letters_m, 10)).astype(np.float32) / 255

    vmask = vortex_mask(plate_rgb, letters_m)

    def tone(im):
        a = np.asarray(im).astype(np.float32); grey = a[..., :3].mean(2, keepdims=True)
        a[..., :3] = (a[..., :3] * 0.8 + grey * 0.2) * 0.86
        return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')
    cog12 = tone(rgba(LAYERS / 'title_cog_v1.png')); cog16 = tone(rgba(LAYERS / 'title_cog_v3.png'))
    hand = rgba(LAYERS / 'title_hand_v2.png')
    hand = hand.resize((round(hand.width * 1.6), hand.height), Image.LANCZOS)   # bolder at title size
    hand_pivot = (258 * 1.6, 905)
    cog_pivot = (cog12.width / 2, cog12.height / 2 + 2)
    # (sprite, teeth, screen centre, radius in px, teeth advanced per loop, direction)
    cogs = [
        (cog12, 12, (415, 520), 80, 12, +1),     # left cog: one full turn per loop
        (cog16, 16, (985, 590), 82, 16, -1),     # right big cog, meshing with the small one
        (cog12, 12, (1088, 527), 56, 16, +1),    # small cog: the same 16 teeth pass, so 16/12 of a turn
    ]

    # fighters: WAN clip of the plate, upscaled to plate size
    take = ASSETS / 'animations' / o.fight
    sheet_meta = json.loads((take / 'sheet.json').read_text()) if (take / 'sheet.json').exists() else {'frameWidth': 832, 'frameHeight': 416, 'columns': 8, 'frames': 81}
    cw, ch, cols = sheet_meta['frameWidth'], sheet_meta['frameHeight'], sheet_meta['columns']
    fsheet = Image.open(take / 'sheet.png').convert('RGBA')
    count = (fsheet.width // cw) * (fsheet.height // ch)
    need = o.start + N + K
    if count < need: raise SystemExit(f'take has {count} frames, needs {need}')
    # the cut-out frames: the fighters over transparency, so only they (not the take's backdrop) reach the plate
    vid = lambda i: np.asarray(fsheet.crop(((i % cols) * cw, (i // cols) * ch, (i % cols + 1) * cw, (i // cols + 1) * ch))
                               .resize((W, H), Image.LANCZOS), dtype=np.float32)
    fm = np.zeros((H, W), np.float32)
    fm[20:300, 170:490] = 1            # left: castle banner and archer
    fm[20:320, 1090:1320] = 1          # right: the demon on the red tower
    fight_a = np.asarray(feather(fm * (1 - letters_m), 14)).astype(np.float32) / 255

    frames = []
    for i in range(N):
        t = i / N
        base = plate_rgb.astype(np.float32)
        # fighters, cross-faded over the last K frames into the first ones
        # the first K frames fade in from the frames that follow the loop's end, so frame N-1 flows into frame 0
        f = vid(o.start + i)
        if i < K:
            wgt = (i + 1) / (K + 1)
            f = vid(o.start + N + i) * (1 - wgt) + f * wgt
        fa = fight_a[..., None] * f[..., 3:4] / 255
        base = base * (1 - fa) + f[..., :3] * fa
        # vortex: bands of light run along the spiral arms, one full turn per loop (an additive, screen-like glow)
        light = swirl_light(t)[..., None] * vmask[..., None]
        base = base + (255 - base) * light * 0.75
        frame = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')
        # clock hands: hour hand fixed at ten past two, minute hand one full turn from 12
        hands = Image.new('RGBA', (W, H))
        hands.alpha_composite(sprite_on_canvas(hand, hand_pivot, 150 / 840, 62, CENTER))
        hands.alpha_composite(sprite_on_canvas(hand, hand_pivot, 225 / 840, 360 * t, CENTER))
        frame.alpha_composite(with_shadow(hands, (5, 7), 4, 0.5))
        # cogs
        cl = Image.new('RGBA', (W, H))
        for spr, teeth, at, rad, adv, d in cogs:
            ang = d * 360 * adv / teeth * t
            cl.alpha_composite(sprite_on_canvas(spr, cog_pivot, (2 * rad) / 660, ang, at))
        frame.alpha_composite(with_shadow(cl, (5, 8), 6, 0.5))
        # letters on top, pulsing twice per loop
        pulse = 0.5 + 0.5 * math.sin(2 * math.pi * 2 * t - math.pi / 2)
        glow = Image.new('RGBA', (W, H), (150, 220, 255, 0)); glow.putalpha(Image.fromarray((glow_a * 120 * pulse).astype(np.uint8), 'L'))
        frame.alpha_composite(glow)
        lit = np.asarray(letters).astype(np.float32)
        lit[..., :3] = np.clip(lit[..., :3] * (1 + 0.10 * pulse) + 8 * pulse, 0, 255)
        frame.alpha_composite(Image.fromarray(lit.astype(np.uint8), 'RGBA'))
        frames.append(frame)
        if o.preview and i % 12 == 0:
            Path(o.preview).mkdir(parents=True, exist_ok=True); frame.save(Path(o.preview) / f'f{i:03d}.png')

    # cut to content: alpha from the plate's own transparency
    alpha = np.asarray(plate)[..., 3]
    bb = Image.fromarray((alpha > 12).astype(np.uint8) * 255).getbbox() or (0, 0, W, H)
    pa = Image.fromarray(alpha)
    w = o.width; h = round((bb[3] - bb[1]) * w / (bb[2] - bb[0]))
    cells = []
    for fr in frames:
        fr.putalpha(Image.fromarray(np.minimum(np.asarray(fr)[..., 3], alpha)))
        cells.append(fr.crop(bb).resize((w, h), Image.LANCZOS))
    COLS = 8; rows = -(-len(cells) // COLS)
    sheet = Image.new('RGBA', (COLS * w, rows * h))
    for i, c in enumerate(cells): sheet.alpha_composite(c, ((i % COLS) * w, (i // COLS) * h))
    out = Path(o.out) if o.out.startswith('/') else ROOT / o.out; out.parent.mkdir(parents=True, exist_ok=True)
    for old in out.parent.glob('title_*.webp'): old.unlink()
    sheet.save(out, 'WEBP', quality=86, method=6, alpha_quality=90)
    meta = {'files': [{'file': str(out.relative_to(ROOT / 'public')) if out.is_relative_to(ROOT / 'public') else out.name, 'frames': len(cells)}], 'w': w, 'h': h, 'scale': 1,
            'frames': len(cells), 'fps': o.fps, 'source': f'layered: plate + {o.fight} fighters {o.start}..{o.start + N} xfade {K}'}
    (Path(o.meta) if o.meta.startswith('/') else ROOT / o.meta).write_text(json.dumps(meta, indent=1))
    print(meta, sheet.size, f'{out.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
