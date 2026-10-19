"""Starlantern art postprocess: cutout, alpha QA, art-pixel downscale, grid slicing, seam score, registry/publish."""
from pathlib import Path
import argparse, datetime, json, math, shutil, subprocess, sys
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sprite_grid as G  # noqa: E402

BASE = '/assets/games/starlantern/'
MAGENTA = np.array([255, 0, 255], np.int16)
ROOT = Path(__file__).resolve().parents[1]


def _near_magenta(rgb, margin):
    d = np.abs(rgb.astype(np.int16) - MAGENTA).max(axis=-1)
    return d <= margin


def cutout(img, margin=70):
    """Magenta (and near-magenta fringe) -> alpha 0; everything else alpha 255. No semi-alpha is produced."""
    rgb = np.asarray(img.convert('RGB'))
    bg = _near_magenta(rgb, margin) | _magenta_tint(rgb)
    # Anti-aliased fringe: near-magenta pixels that touch the background. The same colour inside the subject is kept.
    touch = np.zeros_like(bg)
    touch[1:] |= bg[:-1]; touch[:-1] |= bg[1:]; touch[:, 1:] |= bg[:, :-1]; touch[:, :-1] |= bg[:, 1:]
    bg |= touch & _near_magenta(rgb, 90)
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    out = np.dstack([rgb, alpha]); out[alpha == 0, :3] = 0
    return Image.fromarray(out, 'RGBA')


def _magenta_tint(rgb):
    """Bright pixels where red and blue dominate green: anti-aliased magenta fringe, not pinks or purples."""
    c = rgb.astype(np.int16); r, g, b = c[..., 0], c[..., 1], c[..., 2]
    return (r >= 150) & (b >= 150) & (g <= np.minimum(r, b) - 90)


def _dark_magenta(rgb):
    """Magenta blended into a dark outline: red and blue present, almost no green (real purples keep some green)."""
    c = rgb.astype(np.int16); r, g, b = c[..., 0], c[..., 1], c[..., 2]
    return (g <= 25) & (r >= 100) & (b >= 90) & (np.abs(r - b) <= 60)


def defringe(img, strong=False):
    """Make magenta fringe that touches transparency transparent.

    Default (every sprite): one pass, near-magenta within 90 only, so real lavender, violet and pink edges survive.
    strong=True (opt-in per asset via registry `defringe: strong`, for UI frames and logos): up to 3 passes, a wider
    120 threshold and dark-magenta outline blends.
    """
    arr = np.asarray(img.convert('RGBA')).copy()
    for _ in range(3 if strong else 1):
        clear = arr[..., 3] == 0
        touch = np.zeros_like(clear)
        touch[1:] |= clear[:-1]; touch[:-1] |= clear[1:]; touch[:, 1:] |= clear[:, :-1]; touch[:, :-1] |= clear[:, 1:]
        bad = (_near_magenta(arr[..., :3], 120) | _dark_magenta(arr[..., :3])) if strong else _near_magenta(arr[..., :3], 90)
        hit = touch & ~clear & bad
        if not hit.any(): break
        arr[hit] = 0
    return Image.fromarray(arr, 'RGBA')


def _enclosed_transparent(alpha, small=16):
    """Pixels in enclosed transparent pockets of at most `small` pixels (over-erasure); larger pockets are real gaps."""
    h, w = alpha.shape; clear = alpha == 0; seen = np.zeros_like(clear)
    stack = [(y, x) for y in range(h) for x in (0, w - 1) if clear[y, x]] + [(y, x) for x in range(w) for y in (0, h - 1) if clear[y, x]]
    while stack:
        y, x = stack.pop()
        if seen[y, x]: continue
        seen[y, x] = True
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and clear[ny, nx] and not seen[ny, nx]: stack.append((ny, nx))
    pockets = clear & ~seen; mask = np.zeros_like(clear)
    while pockets.any():
        y, x = map(int, np.argwhere(pockets)[0]); comp = [(y, x)]; pockets[y, x] = False; i = 0
        while i < len(comp):
            cy, cx = comp[i]; i += 1
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < h and 0 <= nx < w and pockets[ny, nx]: pockets[ny, nx] = False; comp.append((ny, nx))
        if len(comp) <= small:
            for cy, cx in comp: mask[cy, cx] = True
    return mask


def alpha_qa(img, allow_holes=0, bg_hint=None, allow_residue=0):
    arr = np.asarray(img.convert('RGBA')); a = arr[..., 3]
    opaque = a == 255
    residue = int((opaque & _near_magenta(arr[..., :3], 90)).sum())
    semi = int(((a > 0) & (a < 255)).sum())
    border = np.zeros_like(opaque); border[0, :] = border[-1, :] = True; border[:, 0] = border[:, -1] = True
    edge = int((opaque & border).sum())
    pocket = _enclosed_transparent(a)
    if bg_hint is not None: pocket &= ~bg_hint
    holes = int(pocket.sum())
    reasons = [r for r, bad in (('magenta residue', residue > allow_residue), ('semi alpha', semi), ('touches edge', edge)) if bad]
    # Narrow real gaps (hair strands, staff vs. body) are common in codex output, so small pockets are flagged for
    # visual review instead of failing; the contract records this exception.
    warnings = ['enclosed holes'] if holes > allow_holes else []
    return {'pass': not reasons, 'reasons': reasons, 'warnings': warnings, 'residue': residue, 'semi': semi, 'edge': edge, 'holes': holes}


def to_art_pixels(img, block):
    """Nearest-sample the centre of each block x block cell."""
    arr = np.asarray(img); h, w = arr.shape[:2]; b = float(block)
    ys = np.minimum((np.arange(int(round(h / b))) * b + b / 2).astype(int), h - 1)
    xs = np.minimum((np.arange(int(round(w / b))) * b + b / 2).astype(int), w - 1)
    return Image.fromarray(arr[ys][:, xs], img.mode)


def _runs(active):
    edges = np.flatnonzero(np.diff(np.r_[False, active, False]))
    return [(int(a), int(b)) for a, b in edges.reshape(-1, 2)]


def _trim_blended_edges(cell, share=0.3):
    """Drop outer rows/columns where at least `share` of the pixels are blended with the magenta gutter."""
    a = np.asarray(cell.convert('RGB'))
    bad = _near_magenta(a, 110) | _magenta_tint(a)
    y0, y1, x0, x1 = 0, a.shape[0], 0, a.shape[1]
    while y1 - y0 > 2 and bad[y0, x0:x1].mean() >= share: y0 += 1
    while y1 - y0 > 2 and bad[y1 - 1, x0:x1].mean() >= share: y1 -= 1
    while x1 - x0 > 2 and bad[y0:y1, x0].mean() >= share: x0 += 1
    while x1 - x0 > 2 and bad[y0:y1, x1 - 1].mean() >= share: x1 -= 1
    return cell.crop((x0, y0, x1, y1))


def slice_grid(img, cols, rows, trim=False):
    """Cells separated by full-magenta gutters, row-major. Raises ValueError when the count differs."""
    rgb = np.asarray(img.convert('RGB')); fg = ~(_near_magenta(rgb, 45) | _magenta_tint(rgb))
    xs, ys = _runs(fg.any(axis=0)), _runs(fg.any(axis=1))
    if len(xs) != cols or len(ys) != rows:
        raise ValueError(f'expected {cols}x{rows} cells, found {len(xs)}x{len(ys)}')
    cells = [img.crop((x0, y0, x1, y1)) for y0, y1 in ys for x0, x1 in xs]
    # Opaque tiles must not keep gutter-blended edge lines; transparent icons keep their magenta surroundings.
    return [_trim_blended_edges(c) for c in cells] if trim else cells


def seam_score(img):
    """Mean absolute difference between opposite edges (0 = wraps perfectly)."""
    a = np.asarray(img.convert('RGB'), np.int16)
    return float((np.abs(a[:, 0] - a[:, -1]).mean() + np.abs(a[0] - a[-1]).mean()) / 2)


SEAM_RATIO_MAX = 1.25   # tile-wrap: seam step / mean neighbour step inside the tile
OVERLAP = 6             # tile-wrap: art pixels consumed by the overlap cut on a repaired axis
FRAME_MAX = 16.0        # tile-wrap: luminance gap between the outer 1-3 px ring and the interior on a wrapped axis


def wrap_seam(img, axes):
    """Seam strength of a repeating tile, measured on the tiled preview (2x2 when y wraps, 1x3 when only x wraps).

    For each axis: `seam` is the mean RGB step across the joint between two copies, `interior` the mean step between
    neighbouring columns (x) or rows (y) inside one tile, `ratio` = seam / interior (about 1 = invisible joint).
    """
    a = np.asarray(img.convert('RGB'), np.float32); h, w = a.shape[:2]
    tiled = np.tile(a, (2, 2, 1)) if 'y' in axes else np.tile(a, (1, 3, 1))
    out = {}
    for ax in 'xy':
        if ax not in axes: continue
        if ax == 'x': seam, inner = np.abs(tiled[:h, w - 1] - tiled[:h, w]).mean(), np.abs(np.diff(a, axis=1)).mean()
        else: seam, inner = np.abs(tiled[h - 1, :w] - tiled[h, :w]).mean(), np.abs(np.diff(a, axis=0)).mean()
        out[ax] = {'seam': round(float(seam), 3), 'interior': round(float(inner), 3), 'ratio': round(float(seam / max(inner, 1e-6)), 3)}
    return out


def _lum(a):
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def edge_frame(img, axes):
    """Per wrapped axis, the largest luminance gap between the outer 1-3 px ring (both sides) and the interior.

    A tile drawn with its own border shows up here even when both edges match each other (a low seam ratio).
    """
    lum = _lum(np.asarray(img.convert('RGB'), np.float32)); out = {}
    for ax in 'xy':
        if ax not in axes: continue
        prof = lum.mean(axis=0) if ax == 'x' else lum.mean(axis=1)
        inner = prof[4:-4].mean()
        out[ax] = round(float(max(abs(np.r_[prof[:r], prof[-r:]].mean() - inner) for r in (1, 2, 3))), 3)
    return out


def _cut_rows(a, k):
    """Wrap a tile vertically by consuming a k-row overlap (image-quilting style, no blending).

    Output row i is source row k + i. In the last k output rows (source rows h-k..h-1) each column switches, at a cut
    row c in 1..k-1 chosen by a minimum-error path, to the source's first rows (0..k-1): above the cut it continues the
    rows above it, below the cut it runs into output row 0 (= source row k) exactly as the source did. Every pixel is a
    source pixel. Returns (rows, mean cut step / mean neighbour step inside the tile).
    """
    A = a.astype(np.float32); h, w = A.shape[:2]; cs = np.arange(1, k)
    cost = np.abs(A[h - k + cs - 1] - A[cs]).mean(-1)          # step across the cut if column switches at row c
    acc = cost.copy(); back = np.zeros(cost.shape, np.int64); n = len(cs)
    for x in range(1, w):
        prev = np.stack([np.r_[np.inf, acc[:-1, x - 1]], acc[:, x - 1], np.r_[acc[1:, x - 1], np.inf]])
        j = prev.argmin(0); back[:, x] = np.arange(n) + j - 1; acc[:, x] += prev[j, np.arange(n)]
    path = np.empty(w, np.int64); path[-1] = int(acc[:, -1].argmin())
    for x in range(w - 1, 0, -1): path[x - 1] = back[path[x], x]
    out = a[k:h].copy()
    for x, ci in enumerate(path):
        c = int(cs[ci]); out[h - 2 * k + c:h - k, x] = a[c:k, x]
    inner = np.abs(np.diff(A, axis=0)).mean()
    return out, float(cost[path, np.arange(w)].mean() / max(inner, 1e-6))


def make_seamless(img, axes, overlap=6):
    """Deterministic overlap cut on each axis in `axes` (y first, then x); the tile shrinks by `overlap` on each.

    Returns (image, {axis: {'overlap': k, 'cut_ratio': r}}); cut_ratio is the mean colour step along the hidden cut
    relative to the tile's own neighbour steps (about 1 = the cut reads like any other pixel boundary).
    """
    a = np.asarray(img.convert('RGB')); info = {}
    if 'y' in axes:
        a, r = _cut_rows(a, overlap); info['y'] = {'overlap': overlap, 'cut_ratio': round(r, 3)}
    if 'x' in axes:
        t, r = _cut_rows(a.transpose(1, 0, 2), overlap); a = t.transpose(1, 0, 2); info['x'] = {'overlap': overlap, 'cut_ratio': round(r, 3)}
    return Image.fromarray(np.ascontiguousarray(a), 'RGB'), info


def _sample(img, w, h):
    """Centre-sample an image to w x h art pixels (nearest, no new colours)."""
    a = np.asarray(img); H, W = a.shape[:2]
    ys = np.minimum(((np.arange(h) + 0.5) * H / h).astype(int), H - 1); xs = np.minimum(((np.arange(w) + 0.5) * W / w).astype(int), W - 1)
    return Image.fromarray(a[ys][:, xs], img.mode)


def fit_opaque(img, w, h):
    """Centre-crop to the w:h aspect, then centre-sample to exactly w x h art pixels (no new colours)."""
    W, H = img.size
    cw, ch = (W, round(W * h / w)) if W * h <= H * w else (round(H * w / h), H)
    x0, y0 = (W - cw) // 2, (H - ch) // 2
    return _sample(img.crop((x0, y0, x0 + cw, y0 + ch)), w, h)


def shared_block(cells, max_side):
    """One block for a whole sheet: the largest subject side over all cells becomes about `max_side` art pixels."""
    side = max((max(b[2] - b[0], b[3] - b[1]) for b in (cutout(c).getbbox() for c in cells) if b), default=0)
    return max(1, round(side / max_side))


def _final_path(final):
    p = Path(final); return p if p.is_absolute() else ROOT.parents[1] / p


def _process_tile_wrap(reg, aid, raw, img, workdir, wrap='xy', size=62):
    """Opaque repeating tile: centre-square crop, sample to size x size art pixels, seam/frame QA, feather if needed."""
    s = min(img.size); x0, y0 = (img.width - s) // 2, (img.height - s) // 2
    sq = img.crop((x0, y0, x0 + s, y0 + s)).convert('RGB')
    raw_seam = wrap_seam(_sample(sq, size, size), wrap)
    bad = ''.join(ax for ax, m in raw_seam.items() if m['ratio'] > SEAM_RATIO_MAX)
    if bad:
        # Sample the repaired axes OVERLAP pixels longer, then the overlap cut brings them back to `size`.
        final, cut = make_seamless(_sample(sq, size + OVERLAP * ('x' in bad), size + OVERLAP * ('y' in bad)), bad, OVERLAP)
    else:
        final, cut = _sample(sq, size, size), {}
    qa = {'raw_seam': raw_seam, 'seamless_fix': 'overlap-cut' if bad else 'none', 'fixed_axes': bad, 'cut': cut,
          'seam': wrap_seam(final, wrap), 'frame': edge_frame(final, wrap), 'reasons': []}
    if any(m['ratio'] > SEAM_RATIO_MAX for m in qa['seam'].values()): qa['reasons'].append('visible seam')
    if any(v > FRAME_MAX for v in qa['frame'].values()): qa['reasons'].append('edge frame')
    if aid.endswith('-wall-face'):
        top = reg.data['assets'].get(aid[:-len('-wall-face')] + '-wall-top', {}).get('final')
        if top and _final_path(top).exists():
            t = np.asarray(Image.open(_final_path(top)).convert('RGB'), np.float32); f = np.asarray(final, np.float32)
            if t.shape == f.shape:
                join, inner = np.abs(t[-1] - f[0]).mean(), np.abs(np.diff(f, axis=0)).mean()
                qa['top_join'] = {'seam': round(float(join), 3), 'interior': round(float(inner), 3), 'ratio': round(float(join / max(inner, 1e-6)), 3)}
    qa['pass'] = not qa['reasons']; qa.update(size=list(final.size), block=round(s / size, 3), wrap=wrap)
    workdir = Path(workdir); out = workdir / f'{aid}.png'; final.save(out)
    (workdir / f'{aid}.qa.json').write_text(json.dumps(qa, indent=2), encoding='utf-8')
    repo = ROOT.parents[1]
    final_path = out.relative_to(repo).as_posix() if out.is_relative_to(repo) else str(out)
    extra = {'runtime': f'{BASE}tiles/{aid[5:]}.png'} if aid.startswith('tile-') else {}
    reg.set(aid, kind='tile-wrap', wrap=wrap, final=final_path, raw=str(raw), qa=qa,
            status='qa_passed' if qa['pass'] else 'qa_failed', **extra)
    return qa


_SHIFTS = [(dy, dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx]


def _magenta_ward(rgb, m=30):
    c = rgb.astype(np.int16); return (c[..., 0] - c[..., 1] >= m) & (c[..., 2] - c[..., 1] >= m)


def _blend_fit(arr, t_range=(0.2, 0.95), max_res=20.0):
    """For every opaque magenta-ward pixel, the best opaque non-magenta-ward 8-neighbour C such that the pixel is
    t*magenta + (1-t)*C (an anti-aliased blend with the key). Returns (mask, source colours)."""
    rgb = arr[..., :3].astype(np.float32); op = arr[..., 3] == 255
    cand = op & _magenta_ward(arr[..., :3]); src_ok = op & ~_magenta_ward(arr[..., :3])
    h, w = op.shape; best = np.full((h, w), np.inf, np.float32); src = np.zeros((h, w, 3), np.float32)
    pad = np.pad(rgb, ((1, 1), (1, 1), (0, 0))); okp = np.pad(src_ok, 1)
    M = np.array([255, 0, 255], np.float32)
    for dy, dx in _SHIFTS:
        C = pad[1 + dy:1 + dy + h, 1 + dx:1 + dx + w]; ok = okp[1 + dy:1 + dy + h, 1 + dx:1 + dx + w]
        d = M - C; t = ((rgb - C) * d).sum(-1) / np.maximum((d * d).sum(-1), 1)
        res = np.sqrt(((C + t[..., None] * d - rgb) ** 2).sum(-1))
        good = cand & ok & (t >= t_range[0]) & (t <= t_range[1]) & (res <= max_res) & (res < best)
        best[good] = res[good]; src[good] = C[good]
    return np.isfinite(best), src


def magenta_blend(img):
    """Opaque pixels that are an anti-aliased mix of the magenta key and a neighbouring subject colour."""
    return _blend_fit(np.asarray(img.convert('RGBA')))[0]


def magenta_tint(rgb):
    """Bright pinkish pixels (red and blue both high and well above green): what is left of magenta after cutout."""
    c = np.asarray(rgb).astype(np.int16)
    return (c[..., 0] >= 130) & (c[..., 2] >= 110) & _magenta_ward(c, 40)


def deblend(img, passes=3):
    """Replace magenta blends with the neighbouring colour they were mixed from (repeats to peel thicker clusters)."""
    arr = np.asarray(img.convert('RGBA')).copy()
    for _ in range(passes):
        mask, src = _blend_fit(arr)
        if not mask.any(): break
        arr[mask, :3] = np.round(src[mask]).astype(np.uint8)
    return Image.fromarray(arr, 'RGBA')


def _key_tint(rgb):
    """Purple and pink pixels: red and blue both clearly above green, blue at least 0.6 of red (crimson and
    red gems, whose blue stays low, are not included)."""
    c = rgb.astype(np.int16); r, g, b = c[..., 0], c[..., 1], c[..., 2]
    return (r - g >= 30) & (b - g >= 15) & (b * 10 >= r * 6)


def neutralize_key_tint(img, passes=4):
    """Opt-in for art that has no intended purple or pink (registry `neutralize_tint: true`): every opaque
    purple or pink pixel (`_key_tint`) (a shadow or glow mixed with the key) takes the colour of its 8-neighbour that is clean and
    closest in luminance; pixels with no clean neighbour after `passes` become grey of their own luminance.
    Alpha is never changed, and only colours already in the sprite are used (plus that grey fallback)."""
    arr = np.asarray(img.convert('RGBA')).copy(); h, w = arr.shape[:2]
    for _ in range(passes):
        op = arr[..., 3] == 255; bad = op & _key_tint(arr[..., :3])
        if not bad.any(): break
        clean = op & ~bad; lum = _lum(arr[..., :3].astype(np.float32))
        best = np.full((h, w), np.inf, np.float32); src = np.zeros((h, w, 3), np.uint8)
        pad = np.pad(arr[..., :3], ((1, 1), (1, 1), (0, 0))); cp = np.pad(clean, 1); lp = np.pad(lum, 1)
        for dy, dx in _SHIFTS:
            ok = cp[1 + dy:1 + dy + h, 1 + dx:1 + dx + w]; d = np.abs(lp[1 + dy:1 + dy + h, 1 + dx:1 + dx + w] - lum)
            take = bad & ok & (d < best); best[take] = d[take]; src[take] = pad[1 + dy:1 + dy + h, 1 + dx:1 + dx + w][take]
        fix = np.isfinite(best); arr[fix, :3] = src[fix]
    op = arr[..., 3] == 255; rest = op & _key_tint(arr[..., :3])
    if rest.any():
        g = np.round(_lum(arr[..., :3].astype(np.float32))).astype(np.uint8); arr[rest, 0] = arr[rest, 1] = arr[rest, 2] = g[rest]
    return Image.fromarray(arr, 'RGBA')


def clear_edge_tint(img, passes=2):
    """Pinkish tint pixels that touch transparency are key fringe on effects: make them transparent."""
    arr = np.asarray(img.convert('RGBA')).copy()
    for _ in range(passes):
        clear = arr[..., 3] == 0; touch = np.zeros_like(clear)
        touch[1:] |= clear[:-1]; touch[:-1] |= clear[1:]; touch[:, 1:] |= clear[:, :-1]; touch[:, :-1] |= clear[:, 1:]
        hit = touch & ~clear & magenta_tint(arr[..., :3])
        if not hit.any(): break
        arr[hit] = 0
    return Image.fromarray(arr, 'RGBA')


def split_frames(img, n):
    """Column spans of n animation frames laid out left to right, cut at the n-1 widest magenta gutters.

    Spans cover the whole width and meet at gutter midpoints, so each frame keeps its position inside its cell.
    Small gaps inside a frame (scattered sparks) lose to the wider gutters between frames.
    """
    rgb = np.asarray(img.convert('RGB')); fg = ~(_near_magenta(rgb, 45) | _magenta_tint(rgb))
    runs = _runs(fg.any(axis=0))
    gaps = [(runs[k + 1][0] - runs[k][1], runs[k][1], runs[k + 1][0]) for k in range(len(runs) - 1)]
    if len(gaps) < n - 1: raise ValueError(f'expected {n} frames, found at most {len(gaps) + 1}')
    cuts = sorted((a + b) // 2 for _, a, b in sorted(gaps, reverse=True)[:n - 1])
    edges = [0] + cuts + [rgb.shape[1]]
    return list(zip(edges[:-1], edges[1:]))


def fx_frames(img, n, height=None, block=None):
    """Cut a raw effect strip into n transparent frames that share one scale, one canvas and one anchor.

    Each frame is centred on its cell, all frames are cropped to the union of their subjects (so motion inside the
    cell is preserved), then downscaled with the same block. Returns (frames, block, source_frames_rgb).
    """
    img = img.convert('RGB'); spans = split_frames(img, n); cw = max(b - a for a, b in spans)
    src = []
    for a, b in spans:
        canvas = Image.new('RGB', (cw, img.height), (255, 0, 255))
        canvas.paste(img.crop((a, 0, b, img.height)), ((cw - (b - a)) // 2, 0)); src.append(canvas)
    cuts = [cutout(c) for c in src]
    boxes = [c.getbbox() for c in cuts if c.getbbox()]
    if not boxes: raise ValueError('no foreground in any frame')
    box = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    if block is None:
        block = max(1, round((box[3] - box[1]) / height)) if height else 1
    frames, sources = [], []
    for cut, s in zip(cuts, src):
        w, h = box[2] - box[0] + 2 * block, box[3] - box[1] + 2 * block
        pad = Image.new('RGBA', (w, h)); pad.paste(cut.crop(box), (block, block))
        spad = Image.new('RGB', (w, h), (255, 0, 255)); spad.paste(s.crop(box), (block, block))
        frames.append(clear_edge_tint(deblend(defringe(to_art_pixels(pad, block))))); sources.append(to_art_pixels(spad, block))
    return frames, block, sources


def _process_fx_anim(reg, aid, raw, img, workdir, frames=4, height=None, block=None):
    entry = reg.data['assets'].get(aid, {})
    cells, block, sources = fx_frames(img, frames, height, block)
    fw, fh = cells[0].size
    sheet = Image.new('RGBA', (fw * frames, fh)); hint_sheet = Image.new('RGB', (fw * frames, fh), (255, 0, 255))
    for k, (c, s) in enumerate(zip(cells, sources)):
        sheet.paste(c, (k * fw, 0)); hint_sheet.paste(s, (k * fw, 0))
    hint = _near_magenta(np.asarray(hint_sheet), 30)
    qa = alpha_qa(sheet, entry.get('allow_holes', 0), hint, entry.get('allow_residue', 0))
    arrs = [np.asarray(c) for c in cells]
    border = np.zeros((fh, fw), bool); border[0, :] = border[-1, :] = True; border[:, 0] = border[:, -1] = True
    qa['per_frame_edge'] = int(sum(((a[..., 3] == 255) & border).sum() for a in arrs))
    if qa['per_frame_edge']: qa['reasons'].append('frame touches its cell edge')
    sa = np.asarray(sheet); op = sa[..., 3] == 255
    qa['blend'] = int(magenta_blend(sheet).sum()); qa['tint'] = int((op & magenta_tint(sa[..., :3])).sum())
    if qa['blend'] + qa['tint'] > entry.get('allow_tint', 0): qa['reasons'].append('magenta tint')
    if any(not a[..., 3].any() for a in arrs): qa['reasons'].append('empty frame')
    diffs = [float((np.abs(x.astype(np.int16) - y).max(axis=-1) > 0).mean()) for x, y in zip(arrs, arrs[1:])]
    qa['frame_diff'] = [round(d, 4) for d in diffs]
    if any(d < 0.02 for d in diffs): qa['reasons'].append('frames identical')
    bbox = cutout(img).getbbox()
    if bbox and (bbox[0] == 0 or bbox[1] == 0 or bbox[2] == img.width or bbox[3] == img.height):
        qa['reasons'].append('subject cut by the canvas edge')
    qa['pass'] = not qa['reasons']
    qa.update(block=block, size=list(sheet.size), frames=frames, frame_size=[fw, fh])
    workdir = Path(workdir); out = workdir / f'{aid}.png'; sheet.save(out)
    for k, c in enumerate(cells): c.save(workdir / f'{aid}-f{k}.png')
    (workdir / f'{aid}.qa.json').write_text(json.dumps(qa, indent=2), encoding='utf-8')
    repo = ROOT.parents[1]
    final_path = out.relative_to(repo).as_posix() if out.is_relative_to(repo) else str(out)
    extra = {}
    if 'runtime' not in entry and aid.startswith('fx-') and aid.endswith('-anim'):
        extra['runtime'] = f'{BASE}fx/{aid[3:]}.png'
    reg.set(aid, kind='fx-anim', frames=frames, frame_size=[fw, fh], final=final_path, raw=str(raw), qa=qa,
            status='qa_passed' if qa['pass'] else 'qa_failed', **extra)
    return qa


class Registry:
    def __init__(self, path):
        self.path = Path(path)
        self.data = json.loads(self.path.read_text(encoding='utf-8')) if self.path.exists() else {'assets': {}}

    def _save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    def get(self, aid):
        return self.data['assets'][aid]

    def set(self, aid, **fields):
        if 'runtime' in fields and not str(fields['runtime']).startswith(BASE):
            raise ValueError(f'runtime path must start with {BASE}')
        self.data['assets'].setdefault(aid, {}).update(fields); self._save()

    def approve(self, aid):
        if self.get(aid).get('status') not in ('qa_passed', 'published'):
            raise PermissionError(f'{aid} has not passed QA')
        self.set(aid, status='approved')

    def _target(self, aid, public_root):
        return Path(public_root) / self.get(aid)['runtime'].lstrip('/')

    def publish(self, aid, public_root):
        if self.get(aid).get('status') != 'approved':
            raise PermissionError(f'{aid} is not approved')
        dst = self._target(aid, public_root); dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(self.get(aid)['final'], dst); self.set(aid, status='published')

    def reject(self, aid, reason, public_root):
        if self.get(aid).get('runtime'):
            dst = self._target(aid, public_root)
            if dst.exists(): dst.unlink()
        self.set(aid, status='rejected', reason=reason)
        self.write_manifest(public_root)

    def write_manifest(self, public_root):
        urls = sorted(a['runtime'] for a in self.data['assets'].values() if a.get('status') == 'published')
        out = Path(public_root) / BASE.strip('/') / 'manifest.json'; out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps({'version': 1, 'urls': urls}, indent=2) + '\n', encoding='utf-8')

    def retire(self, aid, public_root, reason):
        """Take published art out of the game (plan 5d: an old base icon replaced by its gear art).

        The runtime file is deleted only when it lies under public/assets/games/starlantern/ and git tracks it, so it
        can always be restored from git. The entry keeps its history: `runtime` moves to `retired_runtime`, and the
        final, raw, QA and approval fields stay. The manifest is rewritten without the url.
        """
        e = self.get(aid); url = e.get('runtime')
        if not url: raise ValueError(f'{aid} has no runtime to retire')
        base = (Path(public_root) / BASE.strip('/')).resolve(); dst = self._target(aid, public_root).resolve()
        if not dst.is_relative_to(base): raise PermissionError(f'{dst} is outside {base}; refusing to delete')
        if dst.exists():
            tracked = subprocess.run(['git', 'ls-files', '--error-unmatch', dst.name], cwd=dst.parent, capture_output=True,
                                     **({'creationflags': subprocess.CREATE_NO_WINDOW} if sys.platform == 'win32' else {}))
            if tracked.returncode: raise PermissionError(f'{dst} is not tracked by git; refusing to delete it')
            dst.unlink()
        e.pop('runtime')
        self.set(aid, status='retired', retired_runtime=url, retired_reason=reason, retired_on=datetime.date.today().isoformat())
        self.write_manifest(public_root)


def process(reg, aid, raw, kind, ids=None, cols=None, rows=None, workdir=None, block=None, height=None, frames=4, wrap='xy', size=62, fit=None, canvas=None):
    """Postprocess one raw codex PNG into final file(s) under art-factory/starlantern/work/<aid>/ and record QA."""
    workdir = Path(workdir or ROOT / 'work' / aid); workdir.mkdir(parents=True, exist_ok=True)
    img = Image.open(raw).convert('RGB')
    if kind == 'tile-wrap':
        return {aid: _process_tile_wrap(reg, aid, raw, img, workdir, wrap, size)}
    if kind == 'fx-anim':
        return {aid: _process_fx_anim(reg, aid, raw, img, workdir, frames, height, block)}
    if kind in ('tile-sheet', 'icon-sheet'):
        cells = slice_grid(img, cols, rows, trim=kind == 'tile-sheet')
        targets = ids or []
        results = {}
        for cell, cid in zip(cells, targets):
            results[cid] = _finish(reg, cid, cell, 'opaque' if kind == 'tile-sheet' else 'sprite', workdir, raw, block, height)
        reg.set(aid, status='processed', raw=str(raw), parts=targets)
        return results
    return {aid: _finish(reg, aid, img, kind, workdir, raw, block, height, fit=fit, canvas=canvas)}


def _finish(reg, aid, img, kind, workdir, raw, block=None, height=None, fit=None, canvas=None):
    """fit=(w, h): opaque art sampled to exactly w x h. canvas=n: a sprite centred on an n x n transparent canvas."""
    if kind == 'opaque' and fit:
        final = fit_opaque(img.convert('RGB'), *fit).convert('RGBA')
        qa = {'pass': True, 'reasons': [], 'seam': seam_score(final),
              'block': round(min(img.width / fit[0], img.height / fit[1]), 3), 'size': list(final.size)}
        return _save_final(reg, aid, final, qa, workdir, raw)
    if block is None and height and kind != 'opaque':
        box = cutout(img).getbbox()
        block = max(1, round((box[3] - box[1]) / height)) if box else 1
    if block is None:
        probe = img if kind == 'opaque' else img.crop(cutout(img).getbbox() or (0, 0, img.width, img.height))
        info = G.detect_grid(np.asarray(probe, np.int16), 3.0, max(24.0, probe.height / 8))
        block = max(1, round((info['block_x'] + info['block_y']) / 2))
    if kind == 'opaque':
        final = to_art_pixels(img.convert('RGBA'), block)
        qa = {'pass': True, 'reasons': [], 'seam': seam_score(final)}
    else:
        cut = cutout(img)
        bbox = cut.getbbox()
        if bbox is None:
            final, qa = cut, {'pass': False, 'reasons': ['no foreground']}
        else:
            subject = cut.crop(bbox)
            pad = Image.new('RGBA', (subject.width + 2 * block, subject.height + 2 * block))
            pad.paste(subject, (block, block))
            final = defringe(to_art_pixels(pad, block), strong=reg.data['assets'].get(aid, {}).get('defringe') == 'strong')
            # Opt-in (registry `deblend: true`) for art far from magenta: outline pixels mixed with the key are
            # replaced by the neighbouring colour they were mixed from (same repair the fx-anim sheets use).
            if reg.data['assets'].get(aid, {}).get('deblend'): final = deblend(final)
            if reg.data['assets'].get(aid, {}).get('neutralize_tint'): final = neutralize_key_tint(final)
            src = Image.new('RGB', pad.size, (255, 0, 255)); src.paste(img.crop(bbox), (block, block))
            hint = _near_magenta(np.asarray(to_art_pixels(src, block)), 30)
            entry = reg.data['assets'].get(aid, {})
            qa = alpha_qa(final, entry.get('allow_holes', 0), hint, entry.get('allow_residue', 0))
            # The padded final can never touch its own edge, so check the raw canvas: a subject cut off by the
            # generator fails, except on sides the contract allows (bust portraits end at the bottom edge).
            sides = {'left': bbox[0] == 0, 'top': bbox[1] == 0, 'right': bbox[2] == img.width, 'bottom': bbox[3] == img.height}
            if any(cut_side and side not in entry.get('allow_edge', []) for side, cut_side in sides.items()):
                qa['reasons'].append('subject cut by the canvas edge'); qa['pass'] = False
            if canvas:
                # Map-cell overlay: the padded subject is centred on an n x n canvas and must fit inside it.
                qa['subject'] = [final.width - 2, final.height - 2]
                if final.width > canvas or final.height > canvas:
                    qa['reasons'].append('larger than the canvas'); qa['pass'] = False
                else:
                    cell = Image.new('RGBA', (canvas, canvas))
                    cell.paste(final, ((canvas - final.width) // 2, (canvas - final.height) // 2)); final = cell
    qa.update(block=block, size=list(final.size))
    return _save_final(reg, aid, final, qa, workdir, raw)


def _save_final(reg, aid, final, qa, workdir, raw):
    Path(workdir).mkdir(parents=True, exist_ok=True)
    out = Path(workdir) / f'{aid}.png'; final.save(out)
    (Path(workdir) / f'{aid}.qa.json').write_text(json.dumps(qa, indent=2), encoding='utf-8')
    repo = ROOT.parents[1]
    final_path = out.relative_to(repo).as_posix() if out.is_relative_to(repo) else str(out)
    reg.set(aid, final=final_path, raw=str(raw), qa=qa, status='qa_passed' if qa['pass'] else 'qa_failed')
    return qa


# --- plan 5d: gear cells, nine-slice frames, silhouettes ---

def fit_side(img, side):
    """Block that makes the subject's longer side at most `side` art pixels: ceil(longer bbox side / side)."""
    box = cutout(img).getbbox()
    if not box: return 1
    return max(1, math.ceil(max(box[2] - box[0], box[3] - box[1]) / side))


def process_gear_cell(reg, gid, cell, workdir, raw, large=(60, 64), icon=(24, 26)):
    """One sheet cell -> two transparent finals from the same pixels: `gear-<gid>-large` (longer side `large[0]`,
    centred on a large[1] square canvas) and `gear-<gid>` (longer side `icon[0]` on an icon[1] canvas).

    Both run the usual `_finish` QA (residue, semi alpha, raw-canvas cut, holes warning, larger than the canvas) and
    record the same `source` ({raw, cell}). Any id works (plan 5f reuses this for its own uniques).
    """
    out = {}
    for aid, (side, size) in ((f'gear-{gid}-large', large), (f'gear-{gid}', icon)):
        out[aid] = _finish(reg, aid, cell, 'sprite', workdir, raw, block=fit_side(cell, side), canvas=size)
        reg.set(aid, kind='gear-cell', source={'raw': str(raw), 'cell': gid})
    return out


def edge_repeat(final, slice_):
    """Seam ratio (wrap_seam, x only) of the middle segment of each of the four edge bands of a nine-slice frame.

    Each band is slice_ deep; left and right bands are turned on their side, so every band repeats left to right."""
    a = np.asarray(final.convert('RGBA')); n = a.shape[0]; s = slice_
    bands = {'top': a[:s, s:n - s], 'bottom': a[n - s:, s:n - s],
             'left': a[s:n - s, :s].transpose(1, 0, 2), 'right': a[s:n - s, n - s:].transpose(1, 0, 2)}
    return {k: wrap_seam(Image.fromarray(np.ascontiguousarray(b), 'RGBA'), 'x')['x']['ratio'] for k, b in bands.items()}


def nine_slice(reg, aid, cell, workdir, raw, size, slice_):
    """A frame drawn on magenta -> exactly size x size art pixels for CSS border-image (slice `slice_`).

    Cutout, crop to the subject, nearest centre-sample (no new colours), then QA: the usual alpha checks (the ring
    must reach the canvas edge, so `touches edge` is expected), `center_clear` (inside the slice fully transparent),
    `ring_closed` (every column of the top and bottom bands and every row of the side bands has an opaque pixel) and
    `edge_repeat` (seam ratio of each edge middle <= SEAM_RATIO_MAX).
    """
    entry = reg.data['assets'].get(aid, {})
    cut = cutout(cell); box = cut.getbbox(); reasons = []
    if box is None:
        final = Image.new('RGBA', (size, size)); reasons.append('no foreground')
    else:
        final = defringe(_sample(cut.crop(box), size, size), strong=entry.get('defringe') == 'strong')
        if box[0] == 0 or box[1] == 0 or box[2] == cell.width or box[3] == cell.height:
            reasons.append('subject cut by the canvas edge')
    s = slice_
    # The frame's intended transparent centre is background, never a hole; a pocket inside the ring band still counts.
    centre = np.zeros((size, size), bool); centre[s:size - s, s:size - s] = True
    qa = alpha_qa(final, entry.get('allow_holes', 0), bg_hint=centre, allow_residue=entry.get('allow_residue', 0))
    reasons = [r for r in qa['reasons'] if r != 'touches edge'] + reasons
    op = np.asarray(final)[..., 3] == 255
    qa['center_clear'] = bool(not op[s:size - s, s:size - s].any())
    qa['ring_closed'] = bool(op[:s].any(axis=0).all() and op[size - s:].any(axis=0).all()
                             and op[:, :s].any(axis=1).all() and op[:, size - s:].any(axis=1).all())
    qa['edge_repeat'] = edge_repeat(final, s)
    if not qa['center_clear']: reasons.append('centre not clear')
    if not qa['ring_closed']: reasons.append('ring not closed')
    if any(v > SEAM_RATIO_MAX for v in qa['edge_repeat'].values()): reasons.append('edge does not repeat')
    qa.update(reasons=reasons, size=[size, size], slice=s, block=round(max(box[2] - box[0], box[3] - box[1]) / size, 3) if box else None)
    qa['pass'] = not reasons
    out = _save_final(reg, aid, final, qa, workdir, raw)
    reg.set(aid, kind='nine-slice', slice=s, source={'raw': str(raw), 'cell': aid})
    return out


def silhouette_image(img, ink=(29, 26, 46), rim=(143, 134, 184)):
    """Pure transform: every opaque pixel -> ink; transparent pixels 8-touching one -> rim. The canvas grows by one
    pixel on every side so the rim always fits. Only ink, rim and full transparency appear."""
    a = np.asarray(img.convert('RGBA'))[..., 3] == 255
    op = np.pad(a, 1); ring = np.zeros_like(op); p = np.pad(op, 1)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            ring |= p[1 + dy:1 + dy + op.shape[0], 1 + dx:1 + dx + op.shape[1]]
    ring &= ~op
    out = np.zeros(op.shape + (4,), np.uint8); out[op] = (*ink, 255); out[ring] = (*rim, 255)
    return Image.fromarray(out, 'RGBA')


def silhouette(reg, gid, workdir, ink=(29, 26, 46), rim=(143, 134, 184), out=None):
    """`gear-<out or gid>-silhouette` from the approved (or published) icon `gear-<gid>` (a set passes its first
    piece as gid and the set id as out). QA: colours only ink and rim, no semi alpha, size = source + 2, at least as
    many opaque pixels as the source. Status qa_passed / qa_failed; approval is the caller's (gear_art.py)."""
    src_id = f'gear-{gid}'; e = reg.data['assets'].get(src_id, {})
    if e.get('status') not in ('approved', 'published'):
        raise PermissionError(f'{src_id} is not approved; silhouettes come only from approved art')
    src = Image.open(_final_path(e['final'])).convert('RGBA')
    final = silhouette_image(src, ink, rim)
    arr = np.asarray(final); op = arr[..., 3] == 255
    colours = {tuple(int(v) for v in c) for c in arr[op][:, :3]}
    reasons = []
    if not colours <= {tuple(ink), tuple(rim)}: reasons.append('colour other than ink and rim')
    if ((arr[..., 3] > 0) & (arr[..., 3] < 255)).any(): reasons.append('semi alpha')
    if op.sum() < (np.asarray(src)[..., 3] == 255).sum(): reasons.append('fewer opaque pixels than the source')
    if list(final.size) != [src.width + 2, src.height + 2]: reasons.append('wrong size')
    if not op.any(): reasons.append('no foreground')
    qa = {'pass': not reasons, 'reasons': reasons, 'size': list(final.size), 'opaque': int(op.sum()),
          'source_opaque': int((np.asarray(src)[..., 3] == 255).sum())}
    aid = f'gear-{out or gid}-silhouette'
    res = _save_final(reg, aid, final, qa, workdir, e['final'])
    reg.set(aid, kind='silhouette', source={'from': src_id})
    return res


def main(argv=None):
    ap = argparse.ArgumentParser(prog='sl_art'); sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('process'); p.add_argument('--id', required=True); p.add_argument('--raw', required=True, type=Path)
    p.add_argument('--kind', required=True, choices=['sprite', 'opaque', 'tile-sheet', 'icon-sheet', 'fx-anim', 'tile-wrap'])
    p.add_argument('--wrap', default='xy', choices=['xy', 'x'], help='tile-wrap: axes the tile must repeat on')
    p.add_argument('--size', type=int, default=62, help='tile-wrap: output size in art pixels (square)')
    p.add_argument('--frames', type=int, default=4, help='fx-anim: number of animation frames in the raw strip')
    p.add_argument('--ids'); p.add_argument('--cols', type=int); p.add_argument('--rows', type=int)
    p.add_argument('--block', type=int, help='art-pixel size override when grid detection misreads painterly art')
    p.add_argument('--height', type=int, help='target art-pixel height for sprites; sets the block from the subject height')
    p.add_argument('--fit', help='opaque: exact output size WxH (centre crop to the aspect, then sample)')
    p.add_argument('--canvas', type=int, help='sprite: centre the result on an N x N transparent canvas (map-cell overlay)')
    a = sub.add_parser('approve'); a.add_argument('--id', required=True)
    r = sub.add_parser('reject'); r.add_argument('--id', required=True); r.add_argument('--reason', required=True)
    rt = sub.add_parser('retire', help='take published art out of the game (file deleted only if git tracks it)')
    rt.add_argument('--id', required=True); rt.add_argument('--reason', required=True)
    pub = sub.add_parser('publish'); pub.add_argument('--approved', action='store_true', required=True)
    sub.add_parser('status')
    args = ap.parse_args(argv)
    reg = Registry(ROOT / 'registry.json'); public = ROOT.parents[1] / 'public'
    if args.cmd == 'process':
        out = process(reg, args.id, args.raw, args.kind, args.ids.split(',') if args.ids else None, args.cols, args.rows, block=args.block, height=args.height, frames=args.frames, wrap=args.wrap, size=args.size,
                      fit=tuple(int(v) for v in args.fit.lower().split('x')) if args.fit else None, canvas=args.canvas)
        print(json.dumps(out, ensure_ascii=False)); return 0 if all(q['pass'] for q in out.values()) else 1
    if args.cmd == 'approve': reg.approve(args.id)
    if args.cmd == 'reject': reg.reject(args.id, args.reason, public)
    if args.cmd == 'retire': reg.retire(args.id, public, args.reason)
    if args.cmd == 'publish':
        for aid, a in reg.data['assets'].items():
            if a.get('status') == 'approved': reg.publish(aid, public)
        reg.write_manifest(public)
    if args.cmd == 'status':
        counts = {}
        for a in reg.data['assets'].values(): counts[a.get('status', 'todo')] = counts.get(a.get('status', 'todo'), 0) + 1
        print(json.dumps(counts, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
