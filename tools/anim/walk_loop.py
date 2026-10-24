"""Finds where a generated walk take loops: one walking cycle (two steps) with the smallest jump at the seam.

A WAN take is about 3 seconds (49 frames) and usually holds several walking cycles. The game plays a walk sheet as
exactly one cycle per two strides of ground covered, so a whole take makes the legs run several times too fast.
For eras 1-3 the loop was cut by hand (tools/anim/loop_range.py); the Era Studio installer uses this.

find_loop(frames) -> {'range': [a, b], 'jump', 'step', 'drift', 'legs', 'ok', 'why'}: play frames a..b-1 (frame 0, the
source still, is skipped). Among all loops at least MIN_LEN frames long, the best seam is found and then the shortest
loop whose seam is nearly as good, so one cycle wins over two. 'ok' is False when there is no clean loop (the seam
jumps much more than a normal frame step), the body sways sideways a lot, or the legs barely move (a take that loops
because it hardly moves); the studio leaves such takes out and makes a new one.

usage (check a take or an installed sheet): python tools/anim/walk_loop.py <sheet> [cell_w cell_h]
"""
import sys
import numpy as np
from PIL import Image

MIN_LEN = 10        # 10 frames at 16 fps: the shortest believable walking cycle
NEAR_BEST = 1.15    # a shorter loop wins when its seam is within 15% of the best one
MAX_JUMP = 1.6      # seam jump allowed, in normal frame steps
MAX_DRIFT = 0.08    # sideways sway of the body allowed, as a share of the frame width
MIN_LEGS = 0.06     # how much the legs must move: mean change from the loop's average picture over the lower 40% of
                    # the body, as a share of full scale. Eras 1-4's walks measure 0.106-0.243; the same walks with
                    # their motion cut to a fifth measure 0.020-0.049 (a take that barely moves, 25 Oct)


def _small(frames):
    return [np.asarray(f.convert('RGBA').resize((96, 96)), dtype=np.float32) for f in frames]


def find_loop(frames, min_len=MIN_LEN):
    a = _small(frames)
    n = len(a)
    if n < min_len + 2:
        return {'range': [0, n], 'jump': 0, 'step': 0, 'drift': 0, 'ok': False, 'why': f'only {n} frames'}
    diff = lambda i, j: float(np.abs(a[i] - a[j]).mean())
    step = float(np.mean([diff(k, k + 1) for k in range(1, n - 1)])) or 1.0
    # how alike frames are `lag` apart, on average: a walk that repeats every P frames dips at lag P
    D = {L: float(np.mean([diff(s, s + L) for s in range(1, n - L)])) for L in range(1, n - 2)}
    period = None
    for L in range(min_len, n - 3):
        if D[L] < D[L - 1] and D[L] <= D[L + 1] and D[L] < 0.8 * max(D[k] for k in range(1, L)):
            period = L
            break
    if period:
        # one cycle: the best start for that length (one frame either way allowed)
        jump, s, e = min((diff(s, s + L), s, s + L) for L in (period - 1, period, period + 1) for s in range(1, n - L))
    else:
        # the whole take is one cycle: the best seam among long loops
        pairs = [(diff(s, e), s, e) for s in range(1, n) for e in range(s + min_len, n)]
        best = min(p[0] for p in pairs)
        jump, s, e = min((p for p in pairs if p[0] <= best * NEAR_BEST), key=lambda p: (-(p[2] - p[1]), p[0]))
    xs = []
    for f in a[s:e]:
        al = f[..., 3] > 100
        if al.any(): xs.append(np.nonzero(al)[1].mean())
    drift = (max(xs) - min(xs)) / a[0].shape[1] if xs else 0.0
    legs = leg_motion(a[s:e])
    why = []
    if legs < MIN_LEGS: why.append(f'the legs barely move ({legs:.3f}, a walk needs at least {MIN_LEGS})')
    if jump > MAX_JUMP * step: why.append(f'no clean loop (the seam jumps {jump / step:.1f}x a normal frame step)')
    if drift > MAX_DRIFT: why.append(f'the body sways sideways ({drift:.0%} of its width)')
    return {'range': [s, e], 'jump': round(jump / step, 2), 'step': round(step, 2), 'drift': round(drift, 3),
            'legs': round(legs, 3), 'ok': not why, 'why': '; '.join(why)}


def leg_motion(a):
    """Mean change from the loop's average picture over the lower 40% of the body (the legs), 0..1."""
    a = np.stack(a)
    body = (a[..., 3] > 100).any(0)
    if not body.any(): return 0.0
    rows = np.nonzero(body.any(1))[0]
    top, bot = rows.min(), rows.max()
    legs = body.copy()
    legs[: int(bot - 0.4 * (bot - top))] = False
    return float(np.abs(a - a.mean(0))[:, legs].mean() / 255)


def sheet_frames(path, w=512, h=512, count=None):
    sh = Image.open(path).convert('RGBA')
    cols, rows = sh.width // w, sh.height // h
    out = [sh.crop(((i % cols) * w, (i // cols) * h, (i % cols + 1) * w, (i // cols + 1) * h)) for i in range(cols * rows)]
    out = [f for f in out if f.getbbox()]
    return out[:count] if count else out


if __name__ == '__main__':
    w, h = (int(sys.argv[2]), int(sys.argv[3])) if len(sys.argv) > 3 else (512, 512)
    print(find_loop(sheet_frames(sys.argv[1], w, h)))
