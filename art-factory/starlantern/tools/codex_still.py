"""codex CLI image_gen wrapper for art stills (art bible 9.2): one generation per call, logged, never approves art.

Rules enforced: reference images passed as --image=PATH (never -i), stdin closed, background snapped to exact
#FF00FF, 16:9 padding for Veo references, art-pixel grid detection with height rejection, strip slicing for keyframes.
Each call writes <name>.gen.json next to the output; art_registry.py sync collects them.
"""
from datetime import datetime, timezone
from pathlib import Path
import argparse, hashlib, json, shutil, subprocess, sys, time
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sprite_grid as G  # noqa: E402

MAGENTA = (255, 0, 255)
GENERATED = Path.home()/'.codex'/'generated_images'
COPY_SUFFIX = ('\nThen copy the resulting PNG from {gen} (newest session folder) into the current directory as {name}. '
               'Do not create or modify any other files.')


def _sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def _now(): return datetime.now(timezone.utc).isoformat(timespec='seconds')


def codex_command(prompt, images=(), codex='codex'):
    argv = [codex, 'exec', '--skip-git-repo-check', '-s', 'workspace-write']
    argv += [f'--image={Path(p).resolve()}' for p in images]
    return argv + [prompt]


def hidden_window():
    """Windows: run codex (an npm .cmd shim) without opening a console window; no-op elsewhere."""
    return {'creationflags': 0x08000000} if sys.platform == 'win32' else {}  # CREATE_NO_WINDOW


def newest_generated(since, root=GENERATED):
    found = [p for p in Path(root).rglob('*.png') if p.stat().st_mtime >= since] if Path(root).exists() else []
    return max(found, key=lambda p: p.stat().st_mtime) if found else None


def run_codex(prompt, workdir, name, images=(), runner=subprocess.run, codex=None, generated_root=GENERATED, timeout=900):
    """Run one codex image_gen call in workdir; returns the .gen.json record (output may be None on failure)."""
    workdir = Path(workdir); workdir.mkdir(parents=True, exist_ok=True)
    if (workdir/name).exists(): raise FileExistsError(f'{workdir/name} exists; use a new name for a new generation')
    full = prompt.rstrip() + COPY_SUFFIX.format(gen=generated_root, name=name)
    (workdir/f'{Path(name).stem}.prompt.txt').write_text(full, encoding='utf-8')
    argv = codex_command(full, images, codex or shutil.which('codex') or 'codex')
    start = time.time()
    with open(workdir/f'{Path(name).stem}.codex.log', 'w', encoding='utf-8') as log:
        proc = runner(argv, cwd=str(workdir), stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, timeout=timeout,
                      **hidden_window())
    out = workdir/name
    if not out.exists():
        fallback = newest_generated(start - 2, generated_root)  # 2 s slack for file-time granularity
        if fallback is not None: shutil.copyfile(fallback, out)
    record = {'tool': 'codex', 'name': name, 'started': datetime.fromtimestamp(start, timezone.utc).isoformat(timespec='seconds'),
              'finished': _now(), 'argv_without_prompt': argv[:-1], 'prompt_file': f'{Path(name).stem}.prompt.txt',
              'prompt_sha256': hashlib.sha256(full.encode('utf-8')).hexdigest(),
              'inputs': [{'path': str(Path(p).resolve()), 'sha256': _sha(p)} for p in images],
              'returncode': getattr(proc, 'returncode', None), 'output': name if out.exists() else None,
              'output_sha256': _sha(out) if out.exists() else None, 'status': 'generated' if out.exists() else 'no_output',
              'visual_review': 'pending', 'runtime_publish_allowed': False}
    write_record(workdir, name, record)
    return record


def write_record(workdir, name, record):
    (Path(workdir)/f'{Path(name).stem}.gen.json').write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding='utf-8')


def snap_background(img, margin=45):
    """Transparent (alpha < 128) and near-magenta pixels become exact #FF00FF; returns RGB."""
    rgba = np.asarray(img.convert('RGBA'), dtype=np.uint8).copy()
    bg = (rgba[..., 3] < 128) | G.key_mask(rgba[..., :3], margin)
    rgb = rgba[..., :3]; rgb[bg] = MAGENTA
    return Image.fromarray(rgb, 'RGB')


def pad_16x9(img):
    w, h = img.size
    if abs(w/h - 16/9) < 0.01: return img
    W, H = (round(h*16/9), h) if w/h < 16/9 else (w, round(w*9/16))
    canvas = Image.new('RGB', (W, H), MAGENTA); canvas.paste(img, ((W - w)//2, (H - h)//2)); return canvas


def measure_art(img):
    """Foreground bbox + detected art-pixel grid -> height/width in art pixels."""
    rgb = np.asarray(img.convert('RGB'), dtype=np.int16); fg = ~G.key_mask(rgb)
    if not fg.any(): raise ValueError('image has no foreground')
    ys, xs = np.nonzero(fg); y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    crop = rgb[y0:y1, x0:x1]
    g = G.detect_grid(crop, 3.0, max(24.0, (y1 - y0)/8))
    return {'bbox': [int(x0), int(y0), int(x1), int(y1)], 'block_x': g['block_x'], 'block_y': g['block_y'],
            'art_height': round((y1 - y0)/g['block_y']), 'art_width': round((x1 - x0)/g['block_x']),
            'coherence': [g['coherence_x'], g['coherence_y']],
            'touches_edge': bool(x0 == 0 or y0 == 0 or x1 == rgb.shape[1] or y1 == rgb.shape[0])}


def gate(img, height_range=None):
    info = measure_art(img); reasons = []
    if info['touches_edge']: reasons.append('foreground touches the canvas edge')
    if height_range and not height_range[0] <= info['art_height'] <= height_range[1]:
        reasons.append(f"art height {info['art_height']} outside {height_range[0]}-{height_range[1]}")
    return {'pass': not reasons, 'reasons': reasons, **info}


def slice_strip(img, n, margin=2):
    """Split a strip of n equal cells (left to right) on magenta; each cell must hold art and no art may cross a cut."""
    rgb = np.asarray(img.convert('RGB'), dtype=np.int16); fg = ~G.key_mask(rgb)
    w = rgb.shape[1]; cuts = [round(k*w/n) for k in range(n + 1)]
    for c in cuts[1:-1]:
        if fg[:, max(0, c - margin):c + margin].any(): raise ValueError(f'art crosses the cut at x={c}')
    cells = []
    for a, b in zip(cuts[:-1], cuts[1:]):
        if not fg[:, a:b].any(): raise ValueError(f'empty cell at x={a}-{b}')
        cells.append(img.convert('RGB').crop((a, 0, b, rgb.shape[0])))
    width = max(c.width for c in cells)
    out = []
    for c in cells:
        canvas = Image.new('RGB', (width, c.height), MAGENTA); canvas.paste(c, (0, 0)); out.append(canvas)
    return out


def slice_strip_auto(img, n):
    """Find n poses separated by magenta gutters, then centre each in a common canvas.

    Generated strips often have unequal spacing, so an equal-width cut can bisect a pose.
    Only magenta columns separate poses; small internal gaps remain part of a pose.
    """
    rgb = np.asarray(img.convert('RGB'), dtype=np.int16)
    active = (~G.key_mask(rgb)).any(axis=0)
    starts = np.flatnonzero(np.diff(np.r_[False, active, False]))
    runs = [(int(a), int(b)) for a, b in starts.reshape(-1, 2)]
    max_internal_gap = max(6, round(img.width / n * 0.03))
    groups = []
    for left, right in runs:
        if groups and left - groups[-1][1] <= max_internal_gap:
            groups[-1] = (groups[-1][0], right)
        else:
            groups.append((left, right))
    if len(groups) != n:
        raise ValueError(f'auto strip expected {n} poses, found {len(groups)}')
    width = max(right - left for left, right in groups) + 4
    frames = []
    for left, right in groups:
        crop = img.convert('RGB').crop((left, 0, right, img.height))
        frame = Image.new('RGB', (width, img.height), MAGENTA)
        frame.paste(crop, ((width - crop.width)//2, 0))
        frames.append(frame)
    return frames


def postprocess(raw_path, height_range=None, strip=None, veo_reference=False, strip_auto=None):
    """Snap background; strip -> frames/<k>.png; Veo reference -> 16:9; writes <stem>.gate.json. Returns gate dict."""
    raw_path = Path(raw_path); stem = raw_path.stem
    snapped = snap_background(Image.open(raw_path))
    if strip or strip_auto:
        frames = slice_strip_auto(snapped, strip_auto) if strip_auto else slice_strip(snapped, strip)
        folder = raw_path.parent/f'{stem}-frames'; folder.mkdir(exist_ok=True)
        for k, f in enumerate(frames): f.save(folder/f'{k}.png')
        per = [gate(f, height_range) for f in frames]
        bad = [f'frame {k}: {r}' for k, g in enumerate(per) for r in g['reasons']]
        result = {'pass': not bad, 'reasons': bad, 'frames_dir': folder.name, 'frames': len(frames),
                  'strip_mode': 'auto' if strip_auto else 'equal', 'per_frame': per}
    else:
        out = pad_16x9(snapped) if veo_reference else snapped
        out.save(raw_path.parent/f'{stem}-magenta.png')
        result = gate(out, height_range); result['magenta'] = f'{stem}-magenta.png'
    (raw_path.parent/f'{stem}.gate.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    gen = raw_path.parent/f'{stem}.gen.json'
    if gen.exists():
        record = json.loads(gen.read_text(encoding='utf-8'))
        record.update(gate=f'{stem}.gate.json', status='gate_passed' if result['pass'] else 'gate_failed')
        gen.write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding='utf-8')
    return result


def _range(text):
    lo, sep, hi = text.partition('-')
    if sep and not hi: raise ValueError(f'invalid height range {text!r}: missing upper bound after "-"')
    return int(lo), int(hi or lo)


def main(argv=None):
    ap = argparse.ArgumentParser(prog='codex_still')
    sub = ap.add_subparsers(dest='command', required=True)
    g = sub.add_parser('generate', help='one codex image_gen call + postprocess + gate')
    g.add_argument('--workdir', required=True, type=Path)
    g.add_argument('--name', required=True, help='output PNG file name inside workdir (new name per attempt)')
    g.add_argument('--prompt-file', required=True, type=Path)
    g.add_argument('--image', action='append', default=[], type=Path, help='reference image (passed as --image=PATH)')
    for p in (g, sub.add_parser('postprocess', help='re-run postprocess + gate on an existing raw PNG')):
        p.add_argument('--height-range', type=_range, help='accepted art-pixel height, e.g. 54-62')
        strips = p.add_mutually_exclusive_group()
        strips.add_argument('--strip', type=int, help='slice an N-frame equal-width horizontal strip')
        strips.add_argument('--strip-auto', type=int, help='slice N poses at magenta gutters')
        p.add_argument('--veo-reference', action='store_true', help='pad to 16:9 for Veo')
    sub.choices['postprocess'].add_argument('--raw', required=True, type=Path)
    args = ap.parse_args(argv)
    if args.command == 'generate':
        record = run_codex(args.prompt_file.read_text(encoding='utf-8'), args.workdir, args.name, args.image)
        if record['output'] is None: print(json.dumps(record, ensure_ascii=False)); return 2
        raw = args.workdir/args.name
    else:
        raw = args.raw
    result = postprocess(raw, args.height_range, args.strip, args.veo_reference, args.strip_auto)
    print(json.dumps({'raw': str(raw), 'pass': result['pass'], 'reasons': result['reasons']}, ensure_ascii=False))
    return 0 if result['pass'] else 1


if __name__ == '__main__':
    sys.exit(main())
