"""Art-pixel grid detection/snap, palette-index maps, temporal flicker filter and frame selection (art bible 9.2).

Productionised from art/_factory/runs/spike-veo-pipeline-20260923/round2/{grid_d.py,run_E.py}. Pure numpy; no I/O.
"""
import itertools
import numpy as np
from PIL import Image


def key_mask(rgb, margin=45):
    """True where a pixel is magenta key (r and b both exceed g by more than margin)."""
    a = np.asarray(rgb, dtype=np.int16)
    return ((a[..., 0] - a[..., 1]) > margin) & ((a[..., 2] - a[..., 1]) > margin)


def edge_signals(rgb):
    """1-D colour-change strength between adjacent columns (dx) and rows (dy)."""
    a = np.asarray(rgb, dtype=np.int16)
    dx = np.abs(np.diff(a, axis=1)).sum(-1).sum(0).astype(float)
    dy = np.abs(np.diff(a, axis=0)).sum(-1).sum(1).astype(float)
    return dx, dy


def coherence(sig, period):
    """(|z|, phase) of the weighted circular mean of strong-edge positions modulo period."""
    thr = np.percentile(sig, 85); e = np.nonzero(sig > thr)[0]
    if len(e) == 0: return 0.0, 0.0
    w = sig[e]; z = (w*np.exp(2j*np.pi*(e % period)/period)).sum()/w.sum()
    return float(abs(z)), float((np.angle(z) % (2*np.pi))/(2*np.pi)*period)


def best_period(sig, lo, hi, coarse=0.05, fine=0.01, keep=0.8):
    """Largest period in [lo, hi] whose coherence >= keep * max (sub-harmonics p/2, p/3 also score ~1), refined."""
    grid = np.arange(lo, hi + 1e-9, coarse)
    scores = [coherence(sig, p)[0] for p in grid]
    top = max(scores)
    p0 = max(p for p, sc in zip(grid, scores) if sc >= keep*top)
    fine_grid = np.arange(max(lo, p0 - coarse), min(hi, p0 + coarse) + 1e-9, fine)
    best = max(((coherence(sig, p)[0], p) for p in fine_grid))
    c, p = best
    return {'period': float(p), 'phase': coherence(sig, p)[1], 'coherence': float(c)}


def detect_grid(rgb, lo=3.0, hi=24.0):
    """Detect the art-pixel block size/phase of a crop (magenta already cropped away as far as possible)."""
    dx, dy = edge_signals(rgb)
    gx, gy = best_period(dx, lo, hi), best_period(dy, lo, hi)
    return {'block_x': gx['period'], 'block_y': gy['period'], 'phase_x': gx['phase'], 'phase_y': gy['phase'],
            'coherence_x': gx['coherence'], 'coherence_y': gy['coherence']}


def common_grid(grids):
    """One fixed grid for a clip: median block, circular-mean phase (phase stability R reported)."""
    bx = float(np.median([g['block_x'] for g in grids])); by = float(np.median([g['block_y'] for g in grids]))
    def circ(vals, p):
        z = np.exp(2j*np.pi*np.array(vals)/p).mean(); return float((np.angle(z) % (2*np.pi))/(2*np.pi)*p), float(abs(z))
    px, rx = circ([g['phase_x'] for g in grids], bx); py, ry = circ([g['phase_y'] for g in grids], by)
    return {'block_x': bx, 'block_y': by, 'phase_x': px, 'phase_y': py, 'stability_x': rx, 'stability_y': ry}


def snap_to_grid(rgb, fg, grid):
    """One sample per art pixel: median of the inner 40% of each block over foreground pixels.

    Returns (colours uint8 (ny, nx, 3), opaque bool (ny, nx)). A block is opaque when >= 50% of its inner window is fg.
    """
    a = np.asarray(rgb, dtype=np.int16); fg = np.asarray(fg, dtype=bool)
    bx, by = grid['block_x'], grid['block_y']
    gx0 = (grid['phase_x'] + 0.5) % bx - bx; gy0 = (grid['phase_y'] + 0.5) % by - by
    h, w = fg.shape; nx = int((w - gx0)//bx); ny = int((h - gy0)//by)
    out = np.zeros((ny, nx, 3), np.uint8); opaque = np.zeros((ny, nx), bool)
    for j in range(ny):
        ya, yb = int(round(gy0 + j*by + by*0.3)), int(round(gy0 + (j + 1)*by - by*0.3)) + 1
        for i in range(nx):
            xa, xb = int(round(gx0 + i*bx + bx*0.3)), int(round(gx0 + (i + 1)*bx - bx*0.3)) + 1
            m = fg[max(ya, 0):yb, max(xa, 0):xb]; block = a[max(ya, 0):yb, max(xa, 0):xb]
            if m.size == 0 or m.mean() < 0.5: continue
            out[j, i] = np.median(block[m], axis=0); opaque[j, i] = True
    return out, opaque


def to_indices(colours, opaque, palette):
    """Nearest palette index per art pixel; transparent pixels get index len(palette)."""
    pal = np.array([c[:3] for c in palette], np.int32)
    idx = np.argmin(((colours[..., None, :].astype(np.int32) - pal[None, None]) ** 2).sum(-1), axis=-1)
    idx[~opaque] = len(palette)
    return idx


def indices_to_rgba(idx, palette):
    pal = np.array([c[:3] for c in palette], np.uint8); t = len(palette)
    out = np.zeros(idx.shape + (4,), np.uint8); op = idx != t
    out[op, :3] = pal[idx[op]]; out[op, 3] = 255
    return Image.fromarray(out, 'RGBA')


def temporal_mode3(stack):
    """Remove single-frame flicker: where frame t-1 == t+1 != t, set t to t-1 (palette indices; ends untouched)."""
    stack = np.asarray(stack); out = stack.copy()
    flip = (stack[:-2] == stack[2:]) & (stack[1:-1] != stack[:-2])
    out[1:-1][flip] = stack[:-2][flip]
    return out


def index_distance(a, b):
    return float((np.asarray(a) != np.asarray(b)).mean())


def select_loop_window(stack, fps, min_s=0.8, max_s=1.2):
    """(start, end) with end-start in [round(min_s*fps), round(max_s*fps)] minimising endpoint difference.

    Frame `end` is the repeat of `start`, so the loop plays start..end-1. Ties prefer longer, then earlier.
    """
    n = len(stack); lo, hi = round(min_s*fps), round(max_s*fps)
    if n <= lo: raise ValueError(f'clip has {n} frames; a {min_s}s loop needs more than {lo}')
    best = min((index_distance(stack[s], stack[s + L]), -L, s) for L in range(lo, hi + 1) for s in range(n - L))
    return best[2], best[2] - best[1]


def select_even(start, end, n=4):
    return [start + (k*(end - start))//n for k in range(n)]


def select_extremes(stack, start, end, n=4):
    """n frames from [start, end) in temporal order maximising summed pairwise difference (walk pose extremes)."""
    seg = range(start, end)
    return list(max(itertools.combinations(seg, n),
                    key=lambda c: (sum(index_distance(stack[a], stack[b]) for a, b in itertools.combinations(c, 2)), [-x for x in c])))


def select_span(stack, n=4, threshold=0.002):
    """n evenly spaced frames over the moving part of a one-shot clip (static head/tail trimmed)."""
    moving = [i for i in range(len(stack) - 1) if index_distance(stack[i], stack[i + 1]) > threshold]
    start, end = (moving[0], moving[-1] + 1) if moving else (0, len(stack) - 1)
    if end - start + 1 < n: start, end = 0, len(stack) - 1
    if end - start + 1 < n: raise ValueError('Not enough frames to select from')
    return [round(start + k*(end - start)/(n - 1)) for k in range(n)]
