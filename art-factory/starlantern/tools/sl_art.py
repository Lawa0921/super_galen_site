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


STRONG_DEFRINGE = 120   # defringe(strong=True): near-magenta reach (colours this close to the key are peeled at the edge)


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
        bad = (_near_magenta(arr[..., :3], STRONG_DEFRINGE) | _dark_magenta(arr[..., :3])) if strong else _near_magenta(arr[..., :3], 90)
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


SPILL_STEP = 30          # magenta spill: red and blue both at least this far above green ...
SPILL_HUE = (280, 345)   # ... with a hue between dark violet and hot pink (magenta is 300; violet 270 and below is art)
SPILL_BAND = 2           # despill reaches this many pixels in from the transparent edge
MAGENTA_SPILL_MAX = 2    # QA: at most this many spill pixels left in the outline band (registry `allow_magenta_spill` overrides)
KEY_TINT_INSIDE_MAX = 2  # QA: at most this many key-tinted pixels (_dark_magenta | _magenta_tint) deeper than the outline band


def magenta_spill(arr, step=SPILL_STEP):
    """Opaque pixels where red and blue stand well above green with a magenta-ward hue: what the #FF00FF key leaves when
    it is anti-aliased into an outline (dark: (48,4,56); grey: (137,52,136); red: (250,42,136))."""
    a = np.asarray(arr); c = a[..., :3].astype(np.float32); r, g, b = c[..., 0], c[..., 1], c[..., 2]
    op = a[..., 3] == 255 if a.shape[-1] == 4 else np.ones(a.shape[:2], bool)
    mx = np.maximum(r, b); d = np.maximum(mx - g, 1e-6)
    hue = np.where(r >= b, (60 * (g - b) / d) % 360, 240 + 60 * (r - g) / d)
    return op & (np.minimum(r, b) - g >= step) & (hue >= SPILL_HUE[0]) & (hue <= SPILL_HUE[1])


def near_edge(alpha, band=SPILL_BAND):
    """Pixels within `band` pixels (square neighbourhood) of a transparent pixel or the canvas edge: the outline band."""
    h, w = alpha.shape; clear = np.pad(alpha == 0, band, constant_values=True); near = np.zeros((h, w), bool)
    for dy in range(-band, band + 1):
        for dx in range(-band, band + 1): near |= clear[band + dy:band + dy + h, band + dx:band + dx + w]
    return near


def magenta_spill_count(img, band=SPILL_BAND):
    """Spill pixels in the outline band only (controller ruling 2026-10-20, G2): spill is the key colour mixed into the
    outline. Spill-like colours deeper inside are the art's own shading; key colour left inside is the residue gate's."""
    arr = np.asarray(img.convert('RGBA'))
    return int((magenta_spill(arr) & near_edge(arr[..., 3], band)).sum())


def key_tint_inside_count(img, band=SPILL_BAND):
    """Opaque pixels deeper than the outline band that look like the key blended dark (_dark_magenta) or bright
    (_magenta_tint): key colour left inside the subject (controller ruling after the G2 review; the residue gate's
    distance 90 does not reach these). The art's own dark violet / maroon shading matches neither."""
    arr = np.asarray(img.convert('RGBA')); rgb = arr[..., :3]
    inside = (arr[..., 3] == 255) & ~near_edge(arr[..., 3], band)
    return int((inside & (_dark_magenta(rgb) | _magenta_tint(rgb))).sum())


def despill(img, band=SPILL_BAND):
    """Deterministic: in the outer `band` pixels of the subject, take the magenta component out of spill pixels by
    lowering red and blue by min(R, B) - G. A dark outline blend goes back to near-black, a red one back to red.
    Alpha never changes; pixels deeper inside are left for the QA count (they may be real art)."""
    arr = np.asarray(img.convert('RGBA')).copy()
    hit = near_edge(arr[..., 3], band) & magenta_spill(arr)
    if hit.any():
        c = arr[..., :3].astype(np.int16); m = np.minimum(c[..., 0], c[..., 2]) - c[..., 1]
        c[..., 0] -= m; c[..., 2] -= m
        arr[hit, :3] = np.clip(c, 0, 255).astype(np.uint8)[hit]
    return Image.fromarray(arr, 'RGBA')


def _spill_gate(qa, final, entry):
    qa['magenta_spill'] = magenta_spill_count(final)
    if qa['magenta_spill'] > entry.get('allow_magenta_spill', MAGENTA_SPILL_MAX):
        qa['reasons'].append('magenta spill'); qa['pass'] = False
    qa['key_tint_inside'] = key_tint_inside_count(final)
    if qa['key_tint_inside'] > KEY_TINT_INSIDE_MAX:
        if 'magenta residue' not in qa['reasons']: qa['reasons'].append('magenta residue')
        qa['pass'] = False


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


PLAN5D_BATCH = 'gear-5d-'


def _plan5d(entry):
    """Plan 5d art is approved and published only through gear_art.py (approval tied to the review page)."""
    return str(entry.get('batch', '')).startswith(PLAN5D_BATCH)


ROSTER_BATCH = 'roster-'


def _roster(entry):
    """The monster roster's art is approved and published only through roster_art.py (roster plan PR D)."""
    return str(entry.get('batch', '')).startswith(ROSTER_BATCH)


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
        if _plan5d(self.get(aid)):
            raise PermissionError(f'{aid} belongs to plan 5d batch {self.get(aid)["batch"]}: approve it with '
                                  '`gear_art.py approve --batch B --by ...` after the user approves its review page')
        if _roster(self.get(aid)):
            raise PermissionError(f'{aid} belongs to roster round {self.get(aid)["batch"]}: approve it with `roster_art.py approve --batch rN`')
        if self.get(aid).get('status') not in ('qa_passed', 'published'):
            raise PermissionError(f'{aid} has not passed QA')
        self.set(aid, status='approved')

    def _target(self, aid, public_root):
        return Path(public_root) / self.get(aid)['runtime'].lstrip('/')

    def publish(self, aid, public_root, plan5d=False, roster=False):
        """plan5d=True only from gear_art.py publish and roster=True only from roster_art.py publish, which first check the
        batch approval and the shown images."""
        e = self.get(aid)
        if _plan5d(e) and not plan5d:
            raise PermissionError(f'{aid} belongs to plan 5d batch {e["batch"]}: publish it with `gear_art.py publish --batch B`')
        if _roster(e) and not roster:
            raise PermissionError(f'{aid} belongs to roster round {e["batch"]}: publish it with `roster_art.py publish --batch rN`')
        if e.get('status') != 'approved':
            raise PermissionError(f'{aid} is not approved')
        if not e.get('runtime'): raise ValueError(f'{aid} has no runtime path')
        dst = self._target(aid, public_root); dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(_final_path(e['final']), dst); self.set(aid, status='published')

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

    def retire_target(self, aid, public_root):
        """The file `retire` would delete, after every check it makes (raises instead of deleting anything)."""
        url = self.get(aid).get('runtime')
        if not url: raise ValueError(f'{aid} has no runtime to retire')
        base = (Path(public_root) / BASE.strip('/')).resolve(); dst = self._target(aid, public_root).resolve()
        if not dst.is_relative_to(base): raise PermissionError(f'{dst} is outside {base}; refusing to delete')
        if dst.exists():
            tracked = subprocess.run(['git', 'ls-files', '--error-unmatch', dst.name], cwd=dst.parent, capture_output=True,
                                     **({'creationflags': subprocess.CREATE_NO_WINDOW} if sys.platform == 'win32' else {}))
            if tracked.returncode: raise PermissionError(f'{dst} is not tracked by git; refusing to delete it')
        return dst

    def retire(self, aid, public_root, reason):
        """Take published art out of the game (plan 5d: an old base icon replaced by its gear art).

        The runtime file is deleted only when it lies under public/assets/games/starlantern/ and git tracks it, so it
        can always be restored from git. The entry keeps its history: `runtime` moves to `retired_runtime`, and the
        final, raw, QA and approval fields stay. The manifest is rewritten without the url.
        """
        dst = self.retire_target(aid, public_root); e = self.get(aid); url = e['runtime']
        if dst.exists(): dst.unlink()
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


def _finish(reg, aid, img, kind, workdir, raw, block=None, height=None, fit=None, canvas=None, despill_=False, long_side=None,
            sampler=None):
    """fit=(w, h): opaque art sampled to exactly w x h. canvas=n: a sprite centred on an n x n transparent canvas.
    despill_=True (plan 5d): take key spill out of the outline and fail on spill left anywhere (`magenta spill`).
    long_side=n (plan 5d addendum 2, sprites): `normalize_subject` instead of the block downscale, so the subject's
    longer side is exactly n; the magenta hint is sampled from the raw cell with the same scale. An upsample fails QA
    with `cell too small to sample`."""
    if long_side and kind != 'opaque':
        return _finish_normalized(reg, aid, img, workdir, raw, long_side, canvas, despill_, sampler)
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
            src = Image.new('RGB', pad.size, (255, 0, 255)); src.paste(img.crop(bbox), (block, block))
            final, qa = _sprite_tail(reg, aid, img, bbox, to_art_pixels(pad, block), to_art_pixels(src, block), canvas, despill_)
    qa.update(block=block, size=list(final.size))
    return _save_final(reg, aid, final, qa, workdir, raw)


def _sprite_tail(reg, aid, img, bbox, small, small_src, canvas, despill_):
    """Shared sprite repair and QA after the downscale: `small` is the sampled subject (transparent pad), `small_src`
    the raw pixels sampled the same way on magenta (the hint that tells real gaps from erased colour)."""
    entry = reg.data['assets'].get(aid, {})
    final = defringe(small, strong=entry.get('defringe') == 'strong')
    # Opt-in (registry `deblend: true`) for art far from magenta: outline pixels mixed with the key are
    # replaced by the neighbouring colour they were mixed from (same repair the fx-anim sheets use).
    if entry.get('deblend'): final = deblend(final)
    if entry.get('neutralize_tint'): final = neutralize_key_tint(final)
    if despill_: final = despill(final)
    hint = _near_magenta(np.asarray(small_src.convert('RGB')), 30)
    qa = alpha_qa(final, entry.get('allow_holes', 0), hint, entry.get('allow_residue', 0))
    if despill_: _spill_gate(qa, final, entry)
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
    return final, qa


def _finish_normalized(reg, aid, img, workdir, raw, long_side, canvas, despill_, sampler=None):
    cut = cutout(img); bbox = _cut_box(cut)   # a stray speck in the cell neither shrinks nor shifts the subject
    if bbox is None:
        final, qa = cut, {'pass': False, 'reasons': ['no foreground']}; scale = None
    else:
        try:
            w, h, scale = _subject_dims(bbox, long_side)
        except ValueError as e:
            final = Image.new('RGBA', (canvas, canvas) if canvas else cut.size)
            qa = {'pass': False, 'reasons': [str(e)], 'warnings': []}; scale = round((max(bbox[2] - bbox[0], bbox[3] - bbox[1])) / long_side, 3)
        else:
            small = (sampler or _sample_padded)(cut.crop(bbox), w, h, (0, 0, 0, 0))   # gear: centre sample; skills: coverage
            small_src = _sample_padded(img.convert('RGB').crop(bbox), w, h, (255, 0, 255))
            final, qa = _sprite_tail(reg, aid, img, bbox, small, small_src, canvas, despill_)
            scale = round(scale, 3)
    qa.update(block=scale, scale=scale, size=list(final.size))
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


# Plan 5d addendum 2 §1: every gear subject is sampled so its longer side is exactly the target (22 icon / 56 large),
# then gated on the final PNG (alpha 255 only). Thresholds are constants; changing one needs a controller ruling.
SUBJECT_CLASS = {'weapon': 'long', 'offhand': 'broad', 'head': 'broad', 'body': 'broad', 'hands': 'broad', 'feet': 'broad',
                 'neck': 'small', 'ring': 'small'}
MIN_SHORT = {'weapon': 0.70, 'offhand': 0.75, 'head': 0.65, 'body': 0.80, 'hands': 0.70, 'feet': 0.70, 'neck': 0.60, 'ring': 0.60}
MASS_BAND = {'long': (0.28, 0.65), 'thin': (0.20, 0.65), 'broad': (0.50, 0.92), 'small': (0.35, 0.80)}
GEAR_LARGE, GEAR_ICON = (56, 64), (22, 26)   # (subject long edge exactly, canvas): the large image and the bag icon (§1)
# Controller ruling 2026-10-20 (G3): skill icons are native size like gear. The game shows them in two boxes only
# (statusTabs.ts, .slx-skill-ico): the skill tab at 16 x 16 and the tree at 14 x 14. One asset per box, the subject's long
# edge one art pixel short of the box on each side (14 / 12), so neither view rescales.
SKILL_TAB, SKILL_TREE = (14, 16), (12, 14)
# Controller rulings 2026-10-20: the long floor 0.28 was calibrated on 24-px icons; thin weapons cannot carry it: a polearm
# (a thin shaft with a head; after Task E) and a bow (a thin arc and a string; after G2, 0.22-0.27 over 4 attempts). They
# are told by the game's WeaponKind (engine/types.ts), never by id. Staves keep the long floor (a big head passes).
THIN_WEAPON_KINDS = ('spear', 'bow')
# The rule logic each QA spec stamp covers, in words (qa_spec hashes it with the constants; edit it when a rule changes).
GEAR_CELL_RULES = ('normalize to one long edge; long edge +-LONG_TOL, centre <= CENTRE_TOL; short floor by slot; mass band by '
                   'subject_class(slot, weapon kind): thin weapon kinds (polearms, bows) use the thin band; speckless bbox; '
                   'magenta spill counted in the outline band only; key tint deeper inside counted as residue')
SKILL_CELL_RULES = ('normalize to one long edge per box (tab, tree) by coverage sampling; long edge +-LONG_TOL, centre <= CENTRE_TOL; speckless bbox; '
                    'magenta spill counted in the outline band only; key tint deeper inside counted as residue')
NINE_SLICE_RULES = ('cover_sample; centre clear; roles frame / glow / overlay / corners; band colour from the chromatic hue '
                    'cluster; seam ratio (frame, glow) or edge joint (overlay); corners: nothing outside the corners, a whole '
                    'four-point star in each (four points beyond a white core, empty diagonal corners, off the tile edge); '
                    'magenta spill counted in the outline band only; key tint deeper inside counted as residue')
LONG_TOL = 1      # the long edge may miss the target by one art pixel (a thin tip the centre sample steps over)
CENTRE_TOL = 1    # distance between the subject bbox centre and the canvas centre, in art pixels


SPECK_MAX = 4   # connected opaque components of at most this many pixels are specks: they never set a subject's bbox


def _components(op):
    """8-connected components of a boolean mask as (sizes, runs): runs[i] = (y, x0, x1, root); row runs joined with a
    union-find, so a 400 x 400 cell costs a few thousand Python steps, not one per pixel."""
    runs, parent = [], []
    def find(i):
        while parent[i] != i: parent[i] = parent[parent[i]]; i = parent[i]
        return i
    prev = []
    for y in range(op.shape[0]):
        e = np.flatnonzero(np.diff(np.r_[False, op[y], False]))
        cur = []
        for x0, x1 in e.reshape(-1, 2):
            i = len(parent); parent.append(i); runs.append([y, int(x0), int(x1)]); cur.append(i)
            for j in prev:   # 8-connected: the runs overlap once each is widened by one pixel
                if runs[j][1] <= x1 and x0 <= runs[j][2]:
                    a, b = find(i), find(j)
                    if a != b: parent[a] = b
        prev = cur
    sizes = {}
    for i, (y, x0, x1) in enumerate(runs):
        r = find(i); sizes[r] = sizes.get(r, 0) + x1 - x0
    return sizes, [(y, x0, x1, find(i)) for i, (y, x0, x1) in enumerate(runs)]


def speckless_box(op, speck=SPECK_MAX):
    """(x0, y0, x1, y1) bbox (exclusive ends) of a mask without its specks (components of <= `speck` pixels); when
    everything is a speck, the plain bbox. None when the mask is empty."""
    if not op.any(): return None
    sizes, runs = _components(op)
    keep = [(y, x0, x1) for y, x0, x1, r in runs if sizes[r] > speck] or [(y, x0, x1) for y, x0, x1, _ in runs]
    ys = [y for y, _, _ in keep]
    return min(x0 for _, x0, _ in keep), min(ys), max(x1 for _, _, x1 in keep), max(ys) + 1


def _cut_box(cut):
    return speckless_box(np.asarray(cut.convert('RGBA'))[..., 3] > 0)


def short_floor(slot, target):
    """Smallest allowed short edge for `slot` at `target`: ceil(MIN_SHORT[slot] x target)."""
    return math.ceil(round(MIN_SHORT[slot] * target, 6))


def _subject_dims(box, target):
    """(w, h, scale) that bring the bbox's longer side to exactly `target` with one centre sample."""
    bw, bh = box[2] - box[0], box[3] - box[1]; scale = max(bw, bh) / target
    if scale < 1.0: raise ValueError('cell too small to sample')
    return max(1, round(bw / scale)), max(1, round(bh / scale)), scale


def _sample_padded(img, w, h, fill):
    """Centre-sample `img` to w x h and add one art pixel of `fill` on every side."""
    small = _sample(img, w, h); out = Image.new(img.mode, (w + 2, h + 2), fill); out.paste(small, (1, 1))
    return out


def normalize_subject(cut, target):
    """A cut-out high-resolution cell -> (subject, scale): crop to the alpha bbox, one centre sample (no new colours)
    so the longer side is exactly `target`, one transparent art pixel on every side. scale = raw long side / target.
    Raises ValueError('cell too small to sample') when that would upsample (scale < 1)."""
    cut = cut.convert('RGBA'); box = _cut_box(cut)
    if box is None: raise ValueError('no foreground')
    w, h, scale = _subject_dims(box, target)
    return _sample_padded(cut.crop(box), w, h, (0, 0, 0, 0)), scale


def subject_metrics(final, target):
    """Size of the subject on a final PNG (alpha 255 only): long and short bbox edges, mass = opaque / target²,
    box [x0, y0, x1, y1] (x1, y1 exclusive; specks of <= SPECK_MAX pixels do not count) and the distance of the bbox
    centre from the canvas centre."""
    op = np.asarray(final.convert('RGBA'))[..., 3] == 255; H, W = op.shape
    if not op.any(): return {'long': 0, 'short': 0, 'mass': 0.0, 'box': [0, 0, 0, 0], 'centre_off': float(max(W, H))}
    x0, y0, x1, y1 = speckless_box(op)
    bw, bh = x1 - x0, y1 - y0
    off = math.hypot((x0 + x1) / 2 - W / 2, (y0 + y1) / 2 - H / 2)
    return {'long': max(bw, bh), 'short': min(bw, bh), 'mass': round(float(op.sum()) / target ** 2, 3),
            'box': [x0, y0, x1, y1], 'centre_off': round(off, 3)}


def subject_class(slot, kind=None):
    """The size class of a gear subject: a weapon of a thin kind (THIN_WEAPON_KINDS) is `thin`, otherwise SUBJECT_CLASS[slot]."""
    return 'thin' if slot == 'weapon' and kind in THIN_WEAPON_KINDS else SUBJECT_CLASS[slot]


# Every threshold and rule a QA kind depends on (review round 2: the stamp is derived, never bumped by hand; a test checks
# that every upper-case constant the gate code reads, in a body or as a default argument, is listed here). Kinds not listed here (material icons, scenes,
# NPCs) are not versioned.
SPEC_INPUTS = {
    'gear-cell': ('SUBJECT_CLASS', 'MIN_SHORT', 'MASS_BAND', 'THIN_WEAPON_KINDS', 'LONG_TOL', 'CENTRE_TOL', 'SPECK_MAX',
                  'GEAR_LARGE', 'GEAR_ICON', 'MAGENTA', 'MAGENTA_SPILL_MAX', 'KEY_TINT_INSIDE_MAX', 'SPILL_HUE', 'SPILL_STEP', 'SPILL_BAND',
                  'STRONG_DEFRINGE', '_SHIFTS', 'GEAR_CELL_RULES'),
    'skill-cell': ('SKILL_TAB', 'SKILL_TREE', 'LONG_TOL', 'CENTRE_TOL', 'SPECK_MAX', 'SUBJECT_CLASS', 'MIN_SHORT', 'MASS_BAND',
                   'THIN_WEAPON_KINDS', 'COVER_MIN', 'MAGENTA', 'MAGENTA_SPILL_MAX',
                   'KEY_TINT_INSIDE_MAX', 'SPILL_HUE', 'SPILL_STEP', 'SPILL_BAND', 'STRONG_DEFRINGE', '_SHIFTS', 'SKILL_CELL_RULES'),
    'nine-slice': ('FRAME_STROKE', 'EDGE_REACH_MAX', 'CORNER_REACH_MAX', 'HUE_TOL', 'SAT_MIN', 'DISTINCT_DE', 'GLOW_HUE',
                   'GLOW_SAT_MIN', 'GLOW_STROKE', 'STARLIT_CORNER_MIN', 'STARLIT_EDGE_COVER_MAX', 'STAR_MIN_SIDE', 'CHROMA_S',
                   'CHROMA_V', 'HUE_BIN', 'CHROMA_SHARE_MIN', 'EDGE_FLAT', 'SEAM_RATIO_MAX', 'MAGENTA', 'MAGENTA_SPILL_MAX',
                   'SPILL_HUE', 'SPILL_STEP', 'SPILL_BAND', 'KEY_TINT_INSIDE_MAX', 'STRONG_DEFRINGE', 'COVER_MIN', 'STARLIGHT_HUE', 'STARLIGHT_S_MIN',
                   'STARLIGHT_V_MIN', 'STAR_WHITE_S_MAX', 'STAR_WHITE_V_MIN', 'STAR_CORNER', 'EDGE_OUTER_ROWS',
                   'NINE_SLICE_RULES'),
}


def qa_spec(kind):
    """The QA spec stamp of a versioned kind: '<kind>:<first 12 hex of sha256>' over the current values of
    SPEC_INPUTS[kind] (sorted JSON), so changing any covered threshold or rule text moves the stamp by itself."""
    import hashlib
    g = globals(); blob = json.dumps({n: g[n] for n in SPEC_INPUTS[kind]}, sort_keys=True, default=repr)
    return f'{kind}:{hashlib.sha256(blob.encode()).hexdigest()[:12]}'


def qa_stale(entry):
    """True when a registry entry's QA was recorded under another spec than the current qa_spec of its kind."""
    q = entry.get('qa'); kind = entry.get('kind')
    return bool(q) and kind in SPEC_INPUTS and q.get('spec') != qa_spec(kind)


def subject_gate(m, target, slot, kind=None):
    """Reasons a subject fails the size gate. slot None (plan 5f before it passes a slot): long edge and centre only.
    kind is the weapon kind (engine WeaponKind) of a weapon; thin kinds (polearms, bows) use the thin mass band."""
    reasons = []
    if abs(m['long'] - target) > LONG_TOL: reasons.append('subject long edge off target')
    if m['centre_off'] > CENTRE_TOL: reasons.append('subject off centre')
    if slot is not None:
        lo, hi = MASS_BAND[subject_class(slot, kind)]
        if m['short'] < short_floor(slot, target): reasons.append('subject too narrow')
        if m['mass'] < lo: reasons.append('subject too light')
        if m['mass'] > hi: reasons.append('subject too heavy')
    return reasons


def process_gear_cell(reg, gid, cell, workdir, raw, large=GEAR_LARGE, icon=GEAR_ICON, slot=None, kind=None):
    """One sheet cell -> two transparent finals from the same pixels: `gear-<gid>-large` (longer side exactly
    `large[0]`, centred on a large[1] square canvas) and `gear-<gid>` (longer side `icon[0]` on an icon[1] canvas).

    Both are sampled once from the high-resolution cell (`normalize_subject`), run the usual `_finish` QA (residue, semi
    alpha, raw-canvas cut, holes warning, larger than the canvas, magenta spill) and the size gate (`subject_gate`;
    without a slot only the long edge and the centre). QA records `subject` (metrics) and `scale`; the registry records
    the same `source` ({raw, cell}), the slot and the weapon kind (`weapon_kind`; thin kinds have their own mass floor)
    and stamps the QA with qa_spec('gear-cell'). Any id works (plan 5f passes its own uniques with their slot and kind).
    """
    out = {}
    for aid, (side, size) in ((f'gear-{gid}-large', large), (f'gear-{gid}', icon)):
        qa = _finish(reg, aid, cell, 'sprite', workdir, raw, canvas=size, despill_=True, long_side=side)
        final = Image.open(_final_path(reg.get(aid)['final'])).convert('RGBA')
        qa['subject'] = subject_metrics(final, side)
        if 'cell too small to sample' not in qa['reasons']:
            qa['reasons'] += [r for r in subject_gate(qa['subject'], side, slot, kind) if r not in qa['reasons']]
        qa['pass'] = not qa['reasons']; qa['spec'] = qa_spec('gear-cell')
        _save_final(reg, aid, final, qa, workdir, raw)
        reg.set(aid, kind='gear-cell', source={'raw': str(raw), 'cell': gid}, **({'slot': slot} if slot else {}),
                **({'weapon_kind': kind} if kind else {}))
        out[aid] = qa
    return out


def _cover_padded(img, w, h, fill):
    """Coverage-sample `img` to w x h (cover_sample: an output pixel is opaque when at least COVER_MIN of its block is, in
    the block's most common colour; no new colours) and add one art pixel of `fill` on every side."""
    small = cover_sample(img, w, h); out = Image.new(img.mode, (w + 2, h + 2), fill); out.paste(small, (1, 1))
    return out


def process_skill_cell(reg, sid, cell, workdir, raw, tab=SKILL_TAB, tree=SKILL_TREE):
    """One skill-sheet cell -> two native icons from the same pixels: `icon-<sid>-16` for the skill tab and
    `icon-<sid>-14` for the tree (controller ruling 2026-10-20). Each is sampled once from the high-resolution cell
    (bbox normalization, never an upsample) by coverage (`_cover_padded`, ruling 2026-10-20 option a: a 14 / 12 px long
    edge keeps about one of every 2 x 2 art pixels, and a centre sample would drop 1-art-px lines and sparkles), runs the
    `_finish` QA (residue, semi alpha, raw-canvas cut, spill, key
    tint) and the size gate without a slot (long edge exact, centred). QA records `subject` and `scale` and is stamped
    with qa_spec('skill-cell'); the registry records kind 'skill-cell' and the source {raw, cell}."""
    out = {}
    for aid, (side, size) in ((f'icon-{sid}-{tab[1]}', tab), (f'icon-{sid}-{tree[1]}', tree)):
        qa = _finish(reg, aid, cell, 'sprite', workdir, raw, canvas=size, despill_=True, long_side=side, sampler=_cover_padded)
        final = Image.open(_final_path(reg.get(aid)['final'])).convert('RGBA')
        qa['subject'] = subject_metrics(final, side)
        if 'cell too small to sample' not in qa['reasons']:
            qa['reasons'] += [r for r in subject_gate(qa['subject'], side, None) if r not in qa['reasons']]
        qa['pass'] = not qa['reasons']; qa['spec'] = qa_spec('skill-cell')
        _save_final(reg, aid, final, qa, workdir, raw)
        reg.set(aid, kind='skill-cell', source={'raw': str(raw), 'cell': sid})
        out[aid] = qa
    return out


EDGE_FLAT = 6.0   # nine-slice edges: a mean step inside the band at or below this (of 255) counts as a flat bar


def edge_repeat(final, slice_, detail=False):
    """Seam ratio of the middle segment of each of the four edge bands of a nine-slice frame (wrap_seam's seam and
    interior steps, x only; left and right bands are turned on their side, so every band repeats left to right).

    ratio = seam / max(interior, EDGE_FLAT). A plain bar has an interior step near 0 (codec jitter of a few RGB), so a
    bare seam/interior would divide noise by noise; with the floor a uniform bar passes and a real colour jump at the
    joint still fails. detail=True also returns {side: {seam, interior}}."""
    a = np.asarray(final.convert('RGBA')); n = a.shape[0]; s = slice_
    bands = {'top': a[:s, s:n - s], 'bottom': a[n - s:, s:n - s],
             'left': a[s:n - s, :s].transpose(1, 0, 2), 'right': a[s:n - s, n - s:].transpose(1, 0, 2)}
    steps = {k: wrap_seam(Image.fromarray(np.ascontiguousarray(b), 'RGBA'), 'x')['x'] for k, b in bands.items()}
    ratios = {k: round(m['seam'] / max(m['interior'], EDGE_FLAT), 3) for k, m in steps.items()}
    return (ratios, {k: {'seam': m['seam'], 'interior': m['interior']} for k, m in steps.items()}) if detail else ratios


COVER_MIN = 0.4   # cover_sample: an output pixel is opaque when at least this share of its source block is


def cover_sample(img, w, h, min_cover=COVER_MIN):
    """Coverage sample to w x h art pixels: an output pixel is opaque when at least `min_cover` of its source block is
    opaque, and takes the most common opaque colour of that block (no new colours). Unlike a centre sample, a band
    that covers most of a block is never stepped over, so a 2-pixel frame band stays 2 pixels."""
    a = np.asarray(img.convert('RGBA')); H, W = a.shape[:2]
    ye = np.floor(np.arange(h + 1) * H / h).astype(int); xe = np.floor(np.arange(w + 1) * W / w).astype(int)
    out = np.zeros((h, w, 4), np.uint8)
    for i in range(h):
        y0, y1 = ye[i], max(ye[i + 1], ye[i] + 1)
        for j in range(w):
            x0, x1 = xe[j], max(xe[j + 1], xe[j] + 1)
            blk = a[y0:y1, x0:x1]; op = blk[..., 3] == 255
            if not op.any() or op.mean() < min_cover: continue
            c = blk[op][:, :3].astype(np.uint32); packed = (c[:, 0] << 16) | (c[:, 1] << 8) | c[:, 2]
            vals, counts = np.unique(packed, return_counts=True); v = int(vals[counts.argmax()])
            out[i, j] = (v >> 16, (v >> 8) & 255, v & 255, 255)
    return Image.fromarray(out, 'RGBA')


# Plan 5d addendum 2 §2: frame band, hue and distinctness gates (constants; changing one needs a controller ruling).
FRAME_STROKE = (2, 3)      # band thickness in the edge middles (min, max)
EDGE_REACH_MAX = 3         # deepest opaque pixel in an edge middle, counted from the outer edge
CORNER_REACH_MAX = 4       # corner ornaments stay inside a 4 x 4 corner square
HUE_TOL = 15               # band hue within the tier hue +- this many degrees
SAT_MIN = 0.45             # ... and at least this saturated
DISTINCT_DE = 25.0         # CIE76 between any two tier band colours
GLOW_HUE, GLOW_SAT_MIN, GLOW_STROKE = 35, 0.30, (1, 2)   # legendary inner glow: soft warm light, 1-2 px thick
STARLIT_CORNER_MIN = 3          # starlit: opaque pixels in each 5 x 5 corner
STARLIT_EDGE_COVER_MAX = 0.35   # starlit: share of the outer 2 rows of an edge middle it may cover (the frame shows)
STAR_MIN_SIDE = 3               # corner-only starlit: each corner star's bbox is at least 3 x 3 and square within 1 px
STARLIGHT_HUE, STARLIGHT_S_MIN, STARLIGHT_V_MIN = (170, 215), 0.2, 0.7   # a starlit pixel: cyan light (hue range, S, V) ...
STAR_WHITE_S_MAX, STAR_WHITE_V_MIN = 0.15, 0.85                         # ... or white (S at most, V at least): the star core
STAR_CORNER = 5        # starlit: the corner square the stars are counted in (corner_px)
EDGE_OUTER_ROWS = 2    # the outer rows of an edge middle: the glow keeps them clear; the overlay's edge_cover is measured there
# Band colour (controller ruling, fix round 1): measured on the chromatic pixels of the whole band span, so a dark outline
# or a thin gold inner line never becomes "the colour".
CHROMA_S, CHROMA_V = 0.25, 0.30   # a pixel counts as coloured at S >= 0.25 and V >= 0.30
HUE_BIN = 30                      # degrees per circular hue bin; the fullest bin seeds the cluster (+- HUE_BIN / 2)
CHROMA_SHARE_MIN = 0.3            # below this share of coloured pixels in the span: `band colour unreadable`


def _hsv(rgb):
    """(hue degrees, saturation, value) arrays for any (..., 3) RGB array, flattened."""
    c = np.asarray(rgb, np.float32).reshape(-1, 3) / 255.0; r, g, b = c[:, 0], c[:, 1], c[:, 2]
    mx, mn = c.max(axis=1), c.min(axis=1); d = mx - mn; dd = np.where(d == 0, 1, d)
    h = np.where(mx == r, ((g - b) / dd) % 6, np.where(mx == g, (b - r) / dd + 2, (r - g) / dd + 4)) * 60
    return np.where(d == 0, 0, h), np.where(mx == 0, 0, d / np.where(mx == 0, 1, mx)), mx


def _hue_dist(a, b):
    return float(abs((a - b + 180) % 360 - 180))


def band_hue(rgb):
    """Median HSV hue of the given pixels, around the circle (red 354 and 2 are 8 degrees apart, not 352)."""
    h, _, _ = _hsv(rgb)
    if not h.size: return None
    ang = np.deg2rad(h); m = np.rad2deg(np.arctan2(np.sin(ang).mean(), np.cos(ang).mean()))
    return round(float((np.median((h - m + 180) % 360 - 180) + m) % 360), 1)


def _lab(rgb):
    c = np.asarray(rgb, np.float64) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    xyz = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]) @ c
    t = xyz / np.array([0.95047, 1.0, 1.08883])
    f = np.where(t > 0.008856, np.cbrt(t), 7.787 * t + 16 / 116)
    return np.array([116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])])


def delta_e(c1, c2):
    """CIE76 colour difference between two sRGB colours (D65)."""
    return float(np.linalg.norm(_lab(c1) - _lab(c2)))


def frames_distinct(colours, min_de=DISTINCT_DE):
    """{aid: band RGB} -> {aid: reasons}; every pair closer than `min_de` (CIE76) fails both frames."""
    out = {aid: [] for aid in colours}; ids = list(colours)
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            de = delta_e(colours[a], colours[b])
            if de < min_de:
                out[a].append(f'too close to {b} (ΔE {de:.1f})'); out[b].append(f'too close to {a} (ΔE {de:.1f})')
    return out


def _edge_middles(a, s, rows):
    """The outer `rows` rows of the four edge middles (slice to size - slice), each turned so row 0 is the outer edge."""
    n = a.shape[0]
    return {'top': a[:rows, s:n - s], 'bottom': a[n - rows:, s:n - s][::-1],
            'left': a[s:n - s, :rows].swapaxes(0, 1), 'right': a[s:n - s, n - rows:][:, ::-1].swapaxes(0, 1)}


def band_colour(px):
    """The band's own colour from the opaque RGB of its span: keep the chromatic pixels (S >= CHROMA_S, V >= CHROMA_V),
    bin their hues into HUE_BIN-degree circular bins, seed on the fullest bin and keep the pixels within HUE_BIN / 2 of
    its circular mean. Returns {hue (circular median), rgb (median), saturation (median), share (chromatic / all)};
    hue, rgb and saturation are None when nothing is chromatic."""
    px = np.asarray(px, np.uint8).reshape(-1, 3)
    if not len(px): return {'hue': None, 'rgb': None, 'saturation': None, 'share': 0.0}
    h, sat, v = _hsv(px); chroma = (sat >= CHROMA_S) & (v >= CHROMA_V); share = float(chroma.mean())
    if not chroma.any(): return {'hue': None, 'rgb': None, 'saturation': None, 'share': round(share, 3)}
    hc = h[chroma]; bins = np.floor(((hc + HUE_BIN / 2) % 360) / HUE_BIN).astype(int)
    top = np.bincount(bins, minlength=360 // HUE_BIN).argmax(); ang = np.deg2rad(hc[bins == top])
    seed = float(np.rad2deg(np.arctan2(np.sin(ang).mean(), np.cos(ang).mean())) % 360)
    near = np.abs((hc - seed + 180) % 360 - 180) <= HUE_BIN / 2
    cl = px[chroma][near]
    return {'hue': band_hue(cl), 'rgb': [int(c) for c in np.median(cl, axis=0).round()],
            'saturation': round(float(np.median(sat[chroma][near])), 3), 'share': round(share, 3)}


def _band_measures(arr, s, pad):
    """stroke [min, max] (opaque pixels per edge-middle column inside the slice), reach {edge, corner} (deepest opaque
    pixel from the outer edge; in the corner squares a pixel's depth is min(depth x, depth y)) and the opaque RGB of
    the band span of the edge middles (rows `pad` to the edge reach)."""
    op = arr[..., 3] == 255; n = op.shape[0]
    bands = _edge_middles(op, s, s)
    cols = np.concatenate([b.sum(axis=0) for b in bands.values()])
    depth = [int(np.flatnonzero(b.any(axis=1))[-1]) + 1 for b in bands.values() if b.any()]
    d = np.arange(n); dist = np.minimum(d, n - 1 - d) + 1; corner = np.minimum.outer(dist, dist)
    cmask = np.zeros_like(op); cmask[:s, :s] = cmask[:s, n - s:] = cmask[n - s:, :s] = cmask[n - s:, n - s:] = True
    reach = {'edge': max(depth, default=0), 'corner': int(corner[op & cmask].max()) if (op & cmask).any() else 0}
    px = np.concatenate([b[pad:max(reach['edge'], pad + 1)].reshape(-1, 4) for b in _edge_middles(arr, s, s).values()])
    return [int(cols.min()), int(cols.max())], reach, px[px[:, 3] == 255][:, :3]


def nine_slice(reg, aid, cell, workdir, raw, size, slice_, role='frame', hue=None, pad=0):
    """A frame drawn on magenta -> exactly size x size art pixels for CSS border-image (slice `slice_`).

    Cutout, crop to the subject, coverage sample to size - 2*pad (`cover_sample`, no new colours), `pad` rings of
    transparency, then QA: the usual alpha checks (the ring must reach the canvas edge, so `touches edge` is expected),
    `center_clear` (inside the slice fully transparent), `ring_closed` (inside the pad, every column of the top and
    bottom bands and every row of the side bands has an opaque pixel), `edge_repeat` (seam ratio of each edge middle
    <= SEAM_RATIO_MAX) and, by role (plan 5d addendum 2 §2):
      'frame'   band thickness FRAME_STROKE, reach EDGE_REACH_MAX / CORNER_REACH_MAX, and when `hue` is given the band
                hue within HUE_TOL of it with saturation >= SAT_MIN;
      'glow'    the outer 2 rows of the edge middles clear (`glow outside its ring`), thickness at most GLOW_STROKE[1],
                hue GLOW_HUE (or `hue`) with saturation >= GLOW_SAT_MIN;
      'overlay' (starlit) no closed ring and no band thickness: every opaque pixel a starlight colour, at least
                STARLIT_CORNER_MIN pixels in each 5 x 5 corner, at most STARLIT_EDGE_COVER_MAX of the outer 2 rows of
                any edge middle covered (the frame under it must show).
    QA records stroke [min, max], reach {edge, corner}, and from `band_colour` (the chromatic hue cluster of the band
    span, so dark outlines and thin inner lines are left out) stroke_colour, hue, saturation and chroma_share; a band
    with less than CHROMA_SHARE_MIN coloured pixels fails `band colour unreadable` (frame and glow).
    The overlay's `edge_repeat` is `edge_joint` instead: sparse star dots only fail when the repeated edge middle puts
    two of them side by side across the joint (a dot in both its first and its last column on the same row).
      'corners' (the redrawn starlit, controller ruling 2026-10-20) starlight colours only; nothing outside the four
                slice x slice corners (`starlit outside its corners`: the edge middles and the centre stay fully
                transparent, so nothing repeats into dashes); in each corner one whole star: at least STARLIT_CORNER_MIN
                pixels (`starlit corners missing`), a bbox of at least STAR_MIN_SIDE square within 1 px (`starlit corner
                star cut or too small`), a white core (`starlit star too dim`), a four-point shape (a point beyond the core
                to the north, south, west and east, and the four corners of its bbox empty: `starlit star is not a
                four-point star`) and nothing on the tile's outer edge (`starlit star touches the tile edge`; the job
                pads 1, so a drawn star never sits on the edge). QA records `outside` and per corner `stars`
                ({px, w, h, core, arms, diagonal, edge}).
    Every record is stamped with qa_spec('nine-slice').
    """
    entry = reg.data['assets'].get(aid, {})
    cut = cutout(cell); box = cut.getbbox(); reasons = []
    if box is None:
        final = Image.new('RGBA', (size, size)); reasons.append('no foreground')
    else:
        inner = despill(defringe(cover_sample(cut.crop(box), size - 2 * pad, size - 2 * pad), strong=entry.get('defringe') == 'strong'))
        final = Image.new('RGBA', (size, size)); final.paste(inner, (pad, pad))
        if box[0] == 0 or box[1] == 0 or box[2] == cell.width or box[3] == cell.height:
            reasons.append('subject cut by the canvas edge')
    s = slice_
    # The frame's intended transparent centre is background, never a hole; a pocket inside the ring band still counts.
    centre = np.zeros((size, size), bool); centre[s:size - s, s:size - s] = True
    qa = alpha_qa(final, entry.get('allow_holes', 0), bg_hint=centre, allow_residue=entry.get('allow_residue', 0))
    _spill_gate(qa, final, entry)
    reasons = [r for r in qa['reasons'] if r != 'touches edge'] + reasons
    arr = np.asarray(final); op = arr[..., 3] == 255
    qa['center_clear'] = bool(not op[s:size - s, s:size - s].any())
    io, si = op[pad:size - pad, pad:size - pad], s - pad
    qa['ring_closed'] = bool(io[:si].any(axis=0).all() and io[-si:].any(axis=0).all()
                             and io[:, :si].any(axis=1).all() and io[:, -si:].any(axis=1).all())
    qa['edge_repeat'], qa['edge_steps'] = edge_repeat(final, s, detail=True)
    qa['stroke'], qa['reach'], band_px = _band_measures(arr, s, pad)
    bc = band_colour(band_px)
    qa.update(stroke_colour=bc['rgb'], hue=bc['hue'], saturation=bc['saturation'], chroma_share=bc['share'])
    if not qa['center_clear']: reasons.append('centre not clear')
    starry = role in ('overlay', 'corners')
    if not starry and not qa['ring_closed']: reasons.append('ring not closed')
    if role == 'overlay':
        qa['edge_joint'] = {k: int((m[:, 0] & m[:, -1]).sum()) for k, m in _edge_middles(op, s, s).items()}
        if any(qa['edge_joint'].values()): reasons.append('edge does not repeat')
    elif role != 'corners' and any(v > SEAM_RATIO_MAX for v in qa['edge_repeat'].values()): reasons.append('edge does not repeat')
    if not starry and len(band_px) and bc['share'] < CHROMA_SHARE_MIN: reasons.append('band colour unreadable')
    deep = qa['reach']['corner'] > CORNER_REACH_MAX
    if role == 'frame':
        if qa['stroke'][0] < FRAME_STROKE[0]: reasons.append('band thinner than 2 px')
        deep = deep or qa['stroke'][1] > FRAME_STROKE[1] or qa['reach']['edge'] > EDGE_REACH_MAX
    elif role == 'glow':
        if any(m.any() for m in _edge_middles(op, s, EDGE_OUTER_ROWS).values()): reasons.append('glow outside its ring')
        # The glow lies on the slot's third ring (inside the 2 px frame band), so it may reach one ring deeper.
        deep = deep or qa['stroke'][1] > GLOW_STROKE[1] or qa['reach']['edge'] > 2 + GLOW_STROKE[1]
    else:
        deep = deep or qa['reach']['edge'] > EDGE_REACH_MAX
    if deep: reasons.append('band reaches into the icon')
    tier = GLOW_HUE if role == 'glow' and hue is None else hue
    if not starry and tier is not None:
        if qa['hue'] is None or _hue_dist(qa['hue'], tier) > HUE_TOL or qa['saturation'] < (GLOW_SAT_MIN if role == 'glow' else SAT_MIN):
            reasons.append('hue off tier')
    if starry:
        h, sv, v = _hsv(arr[op][:, :3])
        star = (((h >= STARLIGHT_HUE[0]) & (h <= STARLIGHT_HUE[1]) & (sv >= STARLIGHT_S_MIN) & (v >= STARLIGHT_V_MIN))
                | ((sv <= STAR_WHITE_S_MAX) & (v >= STAR_WHITE_V_MIN)))
        qa['off_colour'] = int((~star).sum())
        if qa['off_colour']: reasons.append('not starlight colours')
        k = STAR_CORNER; qa['corner_px'] = [int(c.sum()) for c in (op[:k, :k], op[:k, size - k:], op[size - k:, :k], op[size - k:, size - k:])]
        if min(qa['corner_px']) < STARLIT_CORNER_MIN: reasons.append('starlit corners missing')
        qa['edge_cover'] = round(max(float(m.mean()) for m in _edge_middles(op, s, EDGE_OUTER_ROWS).values()), 3)
        if role == 'overlay' and qa['edge_cover'] > STARLIT_EDGE_COVER_MAX: reasons.append('overlay hides the frame')
    if role == 'corners':
        corners = np.zeros_like(op); corners[:s, :s] = corners[:s, size - s:] = corners[size - s:, :s] = corners[size - s:, size - s:] = True
        qa['outside'] = int((op & ~corners).sum())
        if qa['outside']: reasons.append('starlit outside its corners')
        _, wsat, wv = _hsv(arr[..., :3]); white = ((wsat <= STAR_WHITE_S_MAX) & (wv >= STAR_WHITE_V_MIN)).reshape(size, size) & op
        rim = np.zeros_like(op); rim[0, :] = rim[-1, :] = rim[:, 0] = rim[:, -1] = True
        qa['stars'] = []
        for ys, xs in ((slice(0, s), slice(0, s)), (slice(0, s), slice(size - s, size)), (slice(size - s, size), slice(0, s)),
                       (slice(size - s, size), slice(size - s, size))):
            c = op[ys, xs]; yy, xx = np.nonzero(c); core = white[ys, xs]
            w, hh = (int(xx.max() - xx.min() + 1), int(yy.max() - yy.min() + 1)) if c.any() else (0, 0)
            arms, diagonal = 0, False
            if core.any():
                cy, cx = np.nonzero(core); y0, y1, x0, x1 = cy.min(), cy.max(), cx.min(), cx.max()
                arms = int(c[:y0, x0:x1 + 1].any()) + int(c[y1 + 1:, x0:x1 + 1].any()) + int(c[y0:y1 + 1, :x0].any()) + int(c[y0:y1 + 1, x1 + 1:].any())
                by0, by1, bx0, bx1 = yy.min(), yy.max(), xx.min(), xx.max()
                diagonal = bool(c[by0, bx0] or c[by0, bx1] or c[by1, bx0] or c[by1, bx1])
            qa['stars'].append({'px': int(c.sum()), 'w': w, 'h': hh, 'core': int(core.sum()), 'arms': arms, 'diagonal': diagonal,
                                'edge': bool((op & rim)[ys, xs].any())})
        if any(st['px'] >= STARLIT_CORNER_MIN and (min(st['w'], st['h']) < STAR_MIN_SIDE or abs(st['w'] - st['h']) > 1) for st in qa['stars']):
            reasons.append('starlit corner star cut or too small')
        if any(st['px'] >= STARLIT_CORNER_MIN and not st['core'] for st in qa['stars']): reasons.append('starlit star too dim')
        if any(st['px'] >= STARLIT_CORNER_MIN and st['core'] and (st['arms'] < 4 or st['diagonal']) for st in qa['stars']):
            reasons.append('starlit star is not a four-point star')
        if any(st['edge'] for st in qa['stars']): reasons.append('starlit star touches the tile edge')
    qa.update(reasons=reasons, size=[size, size], slice=s, role=role, pad=pad, tier_hue=tier, spec=qa_spec('nine-slice'),
              block=round(max(box[2] - box[0], box[3] - box[1]) / (size - 2 * pad), 3) if box else None)
    qa['pass'] = not reasons
    out = _save_final(reg, aid, final, qa, workdir, raw)
    reg.set(aid, kind='nine-slice', slice=s, role=role, source={'raw': str(raw), 'cell': aid})
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


# --- the monster roster (roster plan PR D, Task D2; spec §13.1, §13.4) ---------------------------------------------------
# Target art-pixel heights by class (--height) and the band the final subject must land in. A swarm foe comes three to a
# row, so it also has a width cap. Changing any of these needs a controller ruling; the QA stamp moves by itself.
ROSTER_HEIGHT = {'swarm': 52, 'normal': 64, 'heavy': 76, 'warden': 96, 'boss': 150}
ROSTER_HEIGHT_BAND = {'swarm': (40, 64), 'normal': (48, 112), 'heavy': (48, 112), 'warden': (80, 120), 'boss': (120, 200)}
ROSTER_SWARM_MAX_W = 72
PALETTE_MAX = 32         # distinct opaque colours: recorded only (controller ruling 2026-10-26, roster plan ruling 26)
LUM_RANGE_MIN = 0.35     # 5th to 95th percentile of opaque luminance (0..1): less is `too flat to tint`
LUM_MEAN_MIN = 0.35      # a main-road species (recoloured by region: brightness x colour) must not be mostly dark
LUM_PCT = (5, 95)
ROSTER_ERASED_MAX = 8    # enclosed transparent pixels whose raw was not the key: more is an over-erased interior
KEY_BLEND_G_MAX = 64     # erased check: a raw pixel with green at most this ...
KEY_BLEND_STEP = 80      # ... and red and blue this far above it is the key blended into an outline (a real gap)
ICON_HEIGHT = 32         # roster ruling 23: the material icons follow 5d's actual output (icon-blaze-core 33 x 35) ...
ICON_BOX = 36            # ... so the final canvas fits a 36 x 36 box
ROSTER_SPRITE_RULES = ('block downscale to the class height; alpha QA (residue, semi alpha, raw-canvas cut, spill, key tint); '
                       'speckless subject height inside the class band, swarm width cap; opaque colours over PALETTE_MAX recorded, never failed; '
                       'luminance p5-p95 spread >= LUM_RANGE_MIN, main-road mean >= LUM_MEAN_MIN; enclosed pockets of any size '
                       'whose sampled raw is neither the key nor a dark key blend count as erased')
ROSTER_ICON_RULES = ('block downscale to ICON_HEIGHT, or to fit a wide subject inside ICON_BOX with its pad; alpha QA with spill '
                     'and key tint; final canvas inside ICON_BOX')
SPEC_INPUTS['roster-sprite'] = ('ROSTER_HEIGHT', 'ROSTER_HEIGHT_BAND', 'ROSTER_SWARM_MAX_W', 'PALETTE_MAX', 'LUM_RANGE_MIN',
                                'LUM_MEAN_MIN', 'LUM_PCT', 'ROSTER_ERASED_MAX', 'KEY_BLEND_G_MAX', 'KEY_BLEND_STEP', 'SPECK_MAX', 'MAGENTA', 'MAGENTA_SPILL_MAX',
                                'KEY_TINT_INSIDE_MAX', 'SPILL_HUE', 'SPILL_STEP', 'SPILL_BAND', 'STRONG_DEFRINGE', '_SHIFTS',
                                'ROSTER_SPRITE_RULES')
SPEC_INPUTS['roster-icon'] = ('ICON_HEIGHT', 'ICON_BOX', 'SPECK_MAX', 'MAGENTA', 'MAGENTA_SPILL_MAX', 'KEY_TINT_INSIDE_MAX', 'SPILL_HUE',
                              'SPILL_STEP', 'SPILL_BAND', 'STRONG_DEFRINGE', '_SHIFTS', 'ROSTER_ICON_RULES')


def _opaque(final):
    arr = np.asarray(final.convert('RGBA')); return arr, arr[..., 3] == 255


def subject_size(final):
    """(width, height) of the subject on a final PNG: alpha 255 only, specks of <= SPECK_MAX pixels left out."""
    _, op = _opaque(final); box = speckless_box(op, SPECK_MAX)
    return (0, 0) if box is None else (box[2] - box[0], box[3] - box[1])


def height_band(final, cls):
    """Spec §13.1: the subject's height inside its class band; a swarm foe also no wider than ROSTER_SWARM_MAX_W."""
    w, h = subject_size(final); lo, hi = ROSTER_HEIGHT_BAND[cls]; out = []
    if not lo <= h <= hi: out.append('subject height off its band')
    if cls == 'swarm' and w > ROSTER_SWARM_MAX_W: out.append('swarm wider than its band')
    return out


def palette_count(final):
    arr, op = _opaque(final)
    return int(len(np.unique(arr[op][:, :3], axis=0))) if op.any() else 0


def palette_max(final):
    """Notes (never reasons) for a final over PALETTE_MAX colours: controller ruling 2026-10-26 (roster plan ruling 26) made
    the palette record-only, since codex never draws <= 32 colours (the approved legacy foes have 1.2k-10k) and quantizing
    would change the images the user approved."""
    return ['over the 32-colour palette (recorded only)'] if palette_count(final) > PALETTE_MAX else []


def lum_stats(final):
    """(p5, p95, mean) of the opaque pixels' luminance (Rec. 601, 0..1)."""
    arr, op = _opaque(final)
    if not op.any(): return (0.0, 0.0, 0.0)
    y = (arr[op][:, :3].astype(np.float64) @ np.array([0.299, 0.587, 0.114])) / 255.0
    lo, hi = np.percentile(y, LUM_PCT)
    return (round(float(lo), 3), round(float(hi), 3), round(float(y.mean()), 3))


def lum_range(final, mainline):
    """Spec §13.4: the game tints a foe by brightness x colour (BattleView tintMatrix), so flat art turns into a blot and a
    dark main-road foe turns black in every region."""
    p5, p95, mean = lum_stats(final); out = []
    if p95 - p5 < LUM_RANGE_MIN: out.append('too flat to tint')
    if mainline and mean < LUM_MEAN_MIN: out.append('too dark to tint')
    return out


def _erased_pixels(img, final, block):
    """Enclosed transparent pixels (pockets of any size) whose raw, sampled the way the final was, is not the key: art the
    cutout took for magenta. True gaps between legs or arms are key-coloured in the raw and do not count."""
    cut = cutout(img); bbox = cut.getbbox()
    if bbox is None or not block: return 0
    src = Image.new('RGB', (bbox[2] - bbox[0] + 2 * block, bbox[3] - bbox[1] + 2 * block), (255, 0, 255))
    src.paste(img.convert('RGB').crop(bbox), (block, block))
    rgb = np.asarray(to_art_pixels(src, block).convert('RGB')); c = rgb.astype(np.int16); r, g, bl = c[..., 0], c[..., 1], c[..., 2]
    # the key and its blends into a dark outline (green almost gone, red and blue far above it) are background, never art
    hint = _near_magenta(rgb, 30) | ((g <= KEY_BLEND_G_MAX) & (r - g >= KEY_BLEND_STEP) & (bl - g >= KEY_BLEND_STEP))
    a = np.asarray(final.convert('RGBA'))[..., 3]
    if hint.shape != a.shape: return 0
    return int((_enclosed_transparent(a, small=a.size) & ~hint).sum())


def process_roster_sprite(reg, aid, img, workdir, raw, cls, mainline):
    """One roster foe raw -> its final (block downscale to ROSTER_HEIGHT[cls], despill) and the roster gates on top of the
    usual sprite QA: height band, palette, luminance spread (and a main-road foe's brightness), erased interior. QA records
    `height`, `width`, `colours`, `lum` [p5, p95, mean] and `erased`, stamped with qa_spec('roster-sprite')."""
    img = img.convert('RGB')
    qa = _finish(reg, aid, img, 'sprite', workdir, raw, height=ROSTER_HEIGHT[cls], despill_=True)
    final = Image.open(_final_path(reg.get(aid)['final'])).convert('RGBA')
    w, h = subject_size(final); erased = _erased_pixels(img, final, qa.get('block'))
    gates = height_band(final, cls) + lum_range(final, mainline) + (['interior erased'] if erased > ROSTER_ERASED_MAX else [])
    qa['reasons'] += [r for r in gates if r not in qa['reasons']]
    qa.update({'pass': not qa['reasons'], 'height': h, 'width': w, 'colours': palette_count(final), 'lum': list(lum_stats(final)),
               'erased': erased, 'palette_over': bool(palette_max(final)), 'spec': qa_spec('roster-sprite')})
    _save_final(reg, aid, final, qa, workdir, raw)
    reg.set(aid, kind='roster-sprite', roster_class=cls, mainline=bool(mainline))
    return qa


def process_roster_icon(reg, aid, cell, workdir, raw):
    """A roster material icon: the 5d material path (`_finish`, --height ICON_HEIGHT, despill) and the final canvas inside
    ICON_BOX x ICON_BOX (roster ruling 23), stamped with qa_spec('roster-icon')."""
    cell = cell.convert('RGB'); box = cutout(cell).getbbox()
    # the block that brings the subject to ICON_HEIGHT, or, for a wide item, the one that fits its width in the box (with
    # the one-pixel pad on each side): never the 58-wide icon a 32-tall rule would make of a lying key (R0 a1)
    block = max(1, round((box[3] - box[1]) / ICON_HEIGHT), math.ceil((box[2] - box[0]) / (ICON_BOX - 2))) if box else None
    qa = _finish(reg, aid, cell, 'sprite', workdir, raw, block=block, height=ICON_HEIGHT, despill_=True)
    final = Image.open(_final_path(reg.get(aid)['final'])).convert('RGBA')
    if max(final.size) > ICON_BOX and 'larger than the icon box' not in qa['reasons']: qa['reasons'].append('larger than the icon box')
    qa.update({'pass': not qa['reasons'], 'spec': qa_spec('roster-icon')})
    _save_final(reg, aid, final, qa, workdir, raw)
    reg.set(aid, kind='roster-icon')
    return qa


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
        todo = [aid for aid, a in reg.data['assets'].items() if a.get('status') == 'approved']
        own = [aid for aid in todo if _plan5d(reg.get(aid))]
        if own:   # refused before anything is copied
            raise PermissionError(f'{own} belong to plan 5d batches: publish them with `gear_art.py publish --batch B`; nothing was published')
        roster = [aid for aid in todo if _roster(reg.get(aid))]
        if roster:
            raise PermissionError(f'{roster} belong to roster rounds: publish them with `roster_art.py publish --batch rN`; nothing was published')
        for aid in todo: reg.publish(aid, public)
        reg.write_manifest(public)
    if args.cmd == 'status':
        counts = {}
        for a in reg.data['assets'].values(): counts[a.get('status', 'todo')] = counts.get(a.get('status', 'todo'), 0) + 1
        print(json.dumps(counts, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
