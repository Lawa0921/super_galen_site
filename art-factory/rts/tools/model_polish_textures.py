"""Deterministic postprocess of the codex-generated polish material sources (2026-10-16).

Per source: centred half-size crop -> 512 LANCZOS -> mirror 2x2 composition (seam-free by construction) -> 1024 colour
JPEG q90; 512 OpenGL normal map and 512 metal/roughness map derived from luminance exactly like detail_materials.py.
No painting, no added noise, no inpainting. Writes candidate maps + qa/textures.json; never touches public/.
Usage: python art-factory/rts/tools/model_polish_textures.py
"""
from pathlib import Path
import hashlib, json, sys
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / 'art-factory/rts/runs/model-polish/2026-10-16-v1'
OUT = RUN / 'candidate/materials'
sys.path.insert(0, str(Path(__file__).resolve().parent))
from detail_materials import normal_map, tile  # noqa: E402

# id: (source relative to the runs/ folder, roughness, metal, normal strength, method)
# Normal maps are 512 px (detail-v1 used 256 px at strength 3): masonry doubles the strength to keep its slope per metre.
# mirror   = centred half crop -> 512 -> mirror 2x2 (directionless / brushed surfaces)
# crossfade = full source -> 1024 LANCZOS -> detail_materials.tile opposite-edge crossfade (coursed masonry, slate)
SOURCES = {
    'blade-steel': ('model-polish/2026-10-16-v1/raw/blade-steel-a1.png', .34, .55, 2.0, 'mirror'),
    'dark-steel': ('model-polish/2026-10-16-v1/raw/dark-steel-a3.png', .46, .60, 2.6, 'mirror'),
    'aged-brass': ('model-polish/2026-10-16-v1/raw/aged-brass-a3.png', .40, .62, 2.2, 'mirror'),
    'grip-leather': ('model-polish/2026-10-16-v1/raw/grip-leather-a3.png', .80, 0, 4.8, 'mirror'),
    'shield-oak': ('model-polish/2026-10-16-v1/raw/shield-oak-a3.png', .74, 0, 4.5, 'mirror'),
    # LightCutStone surfaces are individually modelled blocks, so their map is a jointless stone face (cut-stone-face);
    # the coursed trim-stone-a1 source was generated, reviewed and set aside (it doubled the joints on block geometry).
    'cut-stone-face': ('model-polish/2026-10-16-v1/raw/cut-stone-face-a1.png', .86, 0, 5.0, 'mirror'),
    # Existing generated building sources (kingdom-buildings 2026-10-04-v2), re-derived at full resolution.
    'ivory-ashlar': ('kingdom-buildings/2026-10-04-v2/raw/textures/ivory-ashlar-source.png', .91, 0, 6.0, 'crossfade'),
    'navy-slate': ('kingdom-buildings/2026-10-04-v2/raw/textures/navy-slate-source.png', .73, 0, 6.0, 'crossfade'),
}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def mirror_tile(patch):
    a = np.asarray(patch)
    top = np.concatenate([a, a[:, ::-1]], axis=1)
    return Image.fromarray(np.concatenate([top, top[::-1]], axis=0))


def seam_error(img):
    a = np.asarray(img, dtype=float)
    return float(np.abs(a[:, 0] - a[:, -1]).mean()), float(np.abs(a[0] - a[-1]).mean())


def build(ids=None):
    OUT.mkdir(parents=True, exist_ok=True); (RUN / 'qa').mkdir(exist_ok=True)
    rows = []
    for name, (rel, rough, metal, strength, method) in SOURCES.items():
        if ids and name not in ids:
            continue
        src = ROOT / 'art-factory/rts/runs' / rel
        im = Image.open(src).convert('RGB'); w, h = im.size
        assert w == h and w >= 1024, (name, im.size)
        c = w // 4; crop = [w // 2 - c, h // 2 - c, w // 2 + c, h // 2 + c]
        if method == 'mirror':
            color = mirror_tile(im.crop(crop).resize((512, 512), Image.Resampling.LANCZOS))
        else:
            crop = [0, 0, w, h]; color = tile(im.resize((1024, 1024), Image.Resampling.LANCZOS))
        color.save(OUT / f'{name}-color.jpg', quality=85, subsampling=0, optimize=True)
        small = color.resize((512, 512), Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(.6))
        height = np.asarray(small.convert('L'), dtype=float) / 255
        Image.fromarray(normal_map(height, strength)).save(OUT / f'{name}-normal.jpg', quality=88, subsampling=0, optimize=True)
        mr = np.empty((512, 512, 3), np.uint8); mr[..., 0] = 255
        mr[..., 1] = np.rint(np.clip(rough + (height.mean() - height) * .30, .18, 1) * 255)
        mr[..., 2] = round(metal * 255)
        Image.fromarray(mr).resize((256, 256), Image.Resampling.LANCZOS).save(OUT / f'{name}-mr.png', optimize=True)  # low-frequency roughness
        rgb = np.asarray(color, dtype=float)
        rows.append({'id': name, 'source': str(src.relative_to(ROOT)).replace('\\', '/'), 'source_sha256': sha(src),
                     'source_dimensions': [w, h], 'method': method, 'crop': crop,
                     'color_dimensions': list(color.size), 'normal_dimensions': [512, 512], 'mr_dimensions': [256, 256],
                     'mean_srgb': [round(v, 1) for v in rgb.reshape(-1, 3).mean(0)], 'seam_mae_lr_tb': seam_error(color),
                     'roughness_base': rough, 'metal': metal, 'normal_convention': 'OpenGL +Y',
                     'derivation': 'mirror: centred crop, LANCZOS 512, mirror 2x2 / crossfade: LANCZOS 1024 + 20 px opposite-edge crossfade; normal = periodic central luminance differences; roughness artistic',
                     'outputs': {p.name: {'sha256': sha(p), 'bytes': p.stat().st_size} for p in sorted(OUT.glob(name + '-*'))}})
    path = RUN / 'qa/textures.json'
    old = json.loads(path.read_text(encoding='utf-8')) if path.exists() else []
    merged = {r['id']: r for r in old}; merged.update({r['id']: r for r in rows})
    path.write_text(json.dumps(list(merged.values()), indent=2) + '\n', encoding='utf-8')
    for r in rows:
        print(r['id'], r['mean_srgb'], r['seam_mae_lr_tb'])


# Equipment atlas: one material for every rigid weapon piece (team-painted faces stay on their team material), so a
# sword is one draw call and a shield two. Cells are fractions of the image, origin top-left like glTF UVs.
ATLAS_CELLS = {'blade': ('blade-steel', (0.0, 0.0, 0.5, 0.5)), 'darksteel': ('dark-steel', (0.5, 0.0, 1.0, 0.5)),
               'brass': ('aged-brass', (0.0, 0.5, 0.5, 1.0)), 'leather': ('grip-leather', (0.5, 0.5, 1.0, 0.75)),
               'oak': ('shield-oak', (0.5, 0.75, 1.0, 1.0))}
ATLAS_PAD = 12 / 2048
# Albedo value multipliers per cell (oak darkened to the walnut tone of the previous hafts/stocks; blade toned to steel).
ATLAS_TINT = {'oak': (0.62, 0.58, 0.54), 'blade': (0.86, 0.88, 0.92), 'brass': (0.80, 0.74, 0.62)}


def atlas():
    rows = {}
    for kind, size in (('color', 2048), ('mr', 512), ('normal', 1024)):
        canvas = Image.new('RGB', (size, size))
        for key, (name, (x0, y0, x1, y1)) in ATLAS_CELLS.items():
            ext = 'png' if kind == 'mr' else 'jpg'
            im = Image.open(OUT / f'{name}-{kind}.{ext}').convert('RGB')
            w, h = round((x1 - x0) * size), round((y1 - y0) * size)
            # Same texel scale in both axes: crop the square map to the cell aspect, then resize.
            side = im.size[0]; crop_h = round(side * h / w) if h < w else side
            im = im.crop((0, 0, side, crop_h)).resize((w, h), Image.Resampling.LANCZOS)
            if kind == 'color' and key in ATLAS_TINT:  # value-only multiply, recorded in qa/textures.json
                im = Image.fromarray(np.clip(np.asarray(im, dtype=float) * ATLAS_TINT[key], 0, 255).round().astype(np.uint8))
            canvas.paste(im, (round(x0 * size), round(y0 * size)))
        path = OUT / f'equipment-atlas-{kind}.{"png" if kind == "mr" else "jpg"}'
        if kind != 'mr':
            canvas.save(path, quality=84 if kind == 'color' else 88, subsampling=0, optimize=True)
        else:
            canvas.save(path, optimize=True)
        rows[path.name] = {'sha256': sha(path), 'bytes': path.stat().st_size, 'size': [size, size]}
    record = {'id': 'equipment-atlas', 'cells': {k: {'material': v[0], 'rect': v[1]} for k, v in ATLAS_CELLS.items()}, 'padding_uv': ATLAS_PAD,
              'tint': {k: list(v) for k, v in ATLAS_TINT.items()}, 'derivation': 'deterministic paste of the polish-v1 maps above (crop to cell aspect + LANCZOS) with per-cell value multiply; no new pixels', 'outputs': rows}
    path = RUN / 'qa/textures.json'
    old = json.loads(path.read_text(encoding='utf-8')) if path.exists() else []
    merged = {r['id']: r for r in old}; merged['equipment-atlas'] = record
    path.write_text(json.dumps(list(merged.values()), indent=2) + '\n', encoding='utf-8')
    print('equipment-atlas', rows)


if __name__ == '__main__':
    build(sys.argv[1:] or None)
    atlas()
