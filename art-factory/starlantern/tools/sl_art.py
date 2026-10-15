"""Starlantern art postprocess: cutout, alpha QA, art-pixel downscale, grid slicing, seam score, registry/publish."""
from pathlib import Path
import argparse, json, shutil, sys
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


def defringe(img, passes=3):
    """Make near-magenta (or dark-magenta) opaque pixels that touch transparency transparent, peeling up to `passes` layers."""
    arr = np.asarray(img.convert('RGBA')).copy()
    for _ in range(passes):
        clear = arr[..., 3] == 0
        touch = np.zeros_like(clear)
        touch[1:] |= clear[:-1]; touch[:-1] |= clear[1:]; touch[:, 1:] |= clear[:, :-1]; touch[:, :-1] |= clear[:, 1:]
        hit = touch & ~clear & (_near_magenta(arr[..., :3], 120) | _dark_magenta(arr[..., :3]))
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


def process(reg, aid, raw, kind, ids=None, cols=None, rows=None, workdir=None, block=None, height=None):
    """Postprocess one raw codex PNG into final file(s) under art-factory/starlantern/work/<aid>/ and record QA."""
    workdir = Path(workdir or ROOT / 'work' / aid); workdir.mkdir(parents=True, exist_ok=True)
    img = Image.open(raw).convert('RGB')
    if kind in ('tile-sheet', 'icon-sheet'):
        cells = slice_grid(img, cols, rows, trim=kind == 'tile-sheet')
        targets = ids or []
        results = {}
        for cell, cid in zip(cells, targets):
            results[cid] = _finish(reg, cid, cell, 'opaque' if kind == 'tile-sheet' else 'sprite', workdir, raw, block, height)
        reg.set(aid, status='processed', raw=str(raw), parts=targets)
        return results
    return {aid: _finish(reg, aid, img, kind, workdir, raw, block, height)}


def _finish(reg, aid, img, kind, workdir, raw, block=None, height=None):
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
            final = defringe(to_art_pixels(pad, block))
            src = Image.new('RGB', pad.size, (255, 0, 255)); src.paste(img.crop(bbox), (block, block))
            hint = _near_magenta(np.asarray(to_art_pixels(src, block)), 30)
            entry = reg.data['assets'].get(aid, {})
            qa = alpha_qa(final, entry.get('allow_holes', 0), hint, entry.get('allow_residue', 0))
            # The padded final can never touch its own edge, so check the raw canvas: a subject cut off by the
            # generator fails, except on sides the contract allows (bust portraits end at the bottom edge).
            sides = {'left': bbox[0] == 0, 'top': bbox[1] == 0, 'right': bbox[2] == img.width, 'bottom': bbox[3] == img.height}
            if any(cut_side and side not in entry.get('allow_edge', []) for side, cut_side in sides.items()):
                qa['reasons'].append('subject cut by the canvas edge'); qa['pass'] = False
    qa.update(block=block, size=list(final.size))
    out = Path(workdir) / f'{aid}.png'; final.save(out)
    (Path(workdir) / f'{aid}.qa.json').write_text(json.dumps(qa, indent=2), encoding='utf-8')
    repo = ROOT.parents[1]
    final_path = out.relative_to(repo).as_posix() if out.is_relative_to(repo) else str(out)
    reg.set(aid, final=final_path, raw=str(raw), qa=qa, status='qa_passed' if qa['pass'] else 'qa_failed')
    return qa


def main(argv=None):
    ap = argparse.ArgumentParser(prog='sl_art'); sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('process'); p.add_argument('--id', required=True); p.add_argument('--raw', required=True, type=Path)
    p.add_argument('--kind', required=True, choices=['sprite', 'opaque', 'tile-sheet', 'icon-sheet'])
    p.add_argument('--ids'); p.add_argument('--cols', type=int); p.add_argument('--rows', type=int)
    p.add_argument('--block', type=int, help='art-pixel size override when grid detection misreads painterly art')
    p.add_argument('--height', type=int, help='target art-pixel height for sprites; sets the block from the subject height')
    a = sub.add_parser('approve'); a.add_argument('--id', required=True)
    r = sub.add_parser('reject'); r.add_argument('--id', required=True); r.add_argument('--reason', required=True)
    pub = sub.add_parser('publish'); pub.add_argument('--approved', action='store_true', required=True)
    sub.add_parser('status')
    args = ap.parse_args(argv)
    reg = Registry(ROOT / 'registry.json'); public = ROOT.parents[1] / 'public'
    if args.cmd == 'process':
        out = process(reg, args.id, args.raw, args.kind, args.ids.split(',') if args.ids else None, args.cols, args.rows, block=args.block, height=args.height)
        print(json.dumps(out, ensure_ascii=False)); return 0 if all(q['pass'] for q in out.values()) else 1
    if args.cmd == 'approve': reg.approve(args.id)
    if args.cmd == 'reject': reg.reject(args.id, args.reason, public)
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
