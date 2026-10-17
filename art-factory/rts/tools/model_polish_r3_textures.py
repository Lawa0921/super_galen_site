"""Deterministic polish-v2 material maps for the model polish round 3 (2026-10-17).

Landmarks and props shipped 128-384 px maps embedded in every GLB (the oak bark alone was embedded four times).
This pass re-derives them at 1024 px from the original generated sources they were made from (tracked raw PNGs,
1254 px) and publishes them once as shared files under materials/polish-v2/:
  hewn-oak    <- kingdom-siege/2026-10-04-original/raw/textures/hewn-oak-source.png   (landmark timber; was 256 px)
  oak-bark    <- kingdom-props/2026-10-04-original/raw/textures/oak-bark-source.png   (trees, timber pile, mine; 384)
  oak-endgrain<- kingdom-props/2026-10-04-original/raw/textures/oak-endgrain-source.png (timber pile log ends; 384)
  gold-ore    <- kingdom-props/2026-10-04-original/raw/textures/gold-ore-source.png   (gold mine; 384)
  weathered-limestone <- model-polish/2026-10-17-v1/raw/weathered-limestone-face-a1.png (new codex builtin image_gen
                original for the landmarks' individually modelled cut-stone blocks; the jointless polish-v1
                cut-stone-face read as flat white on the ruins). Per-channel gain matches the mean colour of the
                landmark's previous cut-stone map so the ruins keep their ivory palette.
Same framing as the published maps (full source, no crop), so every UV keeps its texel mapping:
full source -> LANCZOS 1024 -> opposite-edge crossfade (detail_materials.tile) -> JPEG q85;
512 OpenGL normal + 256 metal/roughness from luminance exactly like model_polish_textures.py. No painting.
Also writes the walnut equipment atlas: the polish-v1 atlas re-pasted from the same polish-v1 maps with the oak cell
desaturated 40 % toward its luminance and darkened (user feedback: hafts and stocks too bright / yellow).
Usage: python art-factory/rts/tools/model_polish_r3_textures.py   (writes the run's candidate/materials + qa only)
"""
from pathlib import Path
import hashlib, json, sys
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / 'art-factory/rts/runs/model-polish/2026-10-17-v1'
OUT = RUN / 'candidate/materials'
V1 = ROOT / 'art-factory/rts/runs/model-polish/2026-10-16-v1/candidate/materials'
sys.path.insert(0, str(Path(__file__).resolve().parent))
from detail_materials import normal_map, tile  # noqa: E402
import model_polish_textures as T  # noqa: E402  (atlas cell layout of polish-v1)

# id: (source relative to runs/, roughness, metal, normal strength at 512 px)
SOURCES = {
    'hewn-oak': ('kingdom-siege/2026-10-04-original/raw/textures/hewn-oak-source.png', .79, 0, 4.6),
    'oak-bark': ('kingdom-props/2026-10-04-original/raw/textures/oak-bark-source.png', .88, 0, 4.6),
    'oak-endgrain': ('kingdom-props/2026-10-04-original/raw/textures/oak-endgrain-source.png', .82, 0, 3.6),
    'gold-ore': ('kingdom-props/2026-10-04-original/raw/textures/gold-ore-source.png', .62, .35, 4.6),
    'weathered-limestone': ('model-polish/2026-10-17-v1/raw/weathered-limestone-face-a1.png', .87, 0, 5.0),
}
# Colour balance targets (mean sRGB of the map the asset used before), applied as one per-channel gain.
MEAN_MATCH = {'weathered-limestone': 'public/assets/games/rts/materials/detail-v1/cutstone-color.jpg'}
# Walnut grade for the atlas oak cell (sRGB value space): lerp toward Rec.709 luminance by WALNUT_SAT, then scale.
WALNUT_SAT, WALNUT_GAIN = 0.60, 0.82


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def seam_error(img):
    a = np.asarray(img, dtype=float)
    return [round(float(np.abs(a[:, 0] - a[:, -1]).mean()), 2), round(float(np.abs(a[0] - a[-1]).mean()), 2)]


def walnut(rgb):
    a = np.asarray(rgb, dtype=float)
    lum = a @ np.array([0.2126, 0.7152, 0.0722])
    out = (lum[..., None] + (a - lum[..., None]) * WALNUT_SAT) * WALNUT_GAIN
    return Image.fromarray(np.clip(out, 0, 255).round().astype(np.uint8))


def build():
    OUT.mkdir(parents=True, exist_ok=True); (RUN / 'qa').mkdir(parents=True, exist_ok=True)
    rows = []
    for name, (rel, rough, metal, strength) in SOURCES.items():
        src = ROOT / 'art-factory/rts/runs' / rel
        im = Image.open(src).convert('RGB'); w, h = im.size
        assert w == h and w >= 1024, (name, im.size)
        color = tile(im.resize((1024, 1024), Image.Resampling.LANCZOS))
        gain = None
        if name in MEAN_MATCH:
            target = np.asarray(Image.open(ROOT / MEAN_MATCH[name]).convert('RGB'), dtype=float).reshape(-1, 3).mean(0)
            a = np.asarray(color, dtype=float); gain = target / a.reshape(-1, 3).mean(0)
            color = Image.fromarray(np.clip(a * gain, 0, 255).round().astype(np.uint8))
        color.save(OUT / f'{name}-color.jpg', quality=85, subsampling=0, optimize=True)
        small = color.resize((512, 512), Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(.6))
        height = np.asarray(small.convert('L'), dtype=float) / 255
        Image.fromarray(normal_map(height, strength)).save(OUT / f'{name}-normal.jpg', quality=88, subsampling=0, optimize=True)
        mr = np.empty((512, 512, 3), np.uint8); mr[..., 0] = 255
        mr[..., 1] = np.rint(np.clip(rough + (height.mean() - height) * .30, .18, 1) * 255)
        mr[..., 2] = round(metal * 255)
        Image.fromarray(mr).resize((256, 256), Image.Resampling.LANCZOS).save(OUT / f'{name}-mr.png', optimize=True)
        rgb = np.asarray(color, dtype=float)
        rows.append({'id': name, 'source': str(src.relative_to(ROOT)).replace('\\', '/'), 'source_sha256': sha(src),
                     'source_dimensions': [w, h], 'source_origin': 'original generated material source (tracked raw PNG of the run named in the path)',
                     'method': 'full source, LANCZOS 1024, detail_materials.tile 20 px opposite-edge crossfade', 'crop': [0, 0, w, h],
                     'color_dimensions': [1024, 1024], 'normal_dimensions': [512, 512], 'mr_dimensions': [256, 256],
                     'mean_srgb': [round(v, 1) for v in rgb.reshape(-1, 3).mean(0)], 'seam_mae_lr_tb': seam_error(color),
                     'roughness_base': rough, 'metal': metal, 'normal_strength': strength, 'normal_convention': 'OpenGL +Y',
                     'mean_match': None if gain is None else {'target': MEAN_MATCH[name], 'gain_rgb': [round(float(v), 4) for v in gain]},
                     'outputs': {p.name: {'sha256': sha(p), 'bytes': p.stat().st_size} for p in sorted(OUT.glob(name + '-*'))}})
    # Walnut equipment atlas (colour only; the polish-v1 normal / metal-roughness atlases stay valid and shared).
    size = 2048; canvas = Image.new('RGB', (size, size))
    for key, (name, (x0, y0, x1, y1)) in T.ATLAS_CELLS.items():
        im = Image.open(V1 / f'{name}-color.jpg').convert('RGB')
        cw, ch = round((x1 - x0) * size), round((y1 - y0) * size)
        side = im.size[0]; crop_h = round(side * ch / cw) if ch < cw else side
        im = im.crop((0, 0, side, crop_h)).resize((cw, ch), Image.Resampling.LANCZOS)
        if key in T.ATLAS_TINT:
            im = Image.fromarray(np.clip(np.asarray(im, dtype=float) * T.ATLAS_TINT[key], 0, 255).round().astype(np.uint8))
        if key == 'oak':
            im = walnut(im)
        canvas.paste(im, (round(x0 * size), round(y0 * size)))
    atlas = OUT / 'equipment-atlas-color.jpg'
    canvas.save(atlas, quality=84, subsampling=0, optimize=True)
    oak = np.asarray(canvas, dtype=float)[int(.75 * size) + 20:size - 20, size // 2 + 20:size - 20].reshape(-1, 3).mean(0)
    rows.append({'id': 'equipment-atlas-walnut', 'derivation': 'polish-v1 equipment atlas re-pasted from the same polish-v1 maps (model_polish_textures.ATLAS_CELLS / ATLAS_TINT); oak cell additionally desaturated toward Rec.709 luminance and darkened; no new pixels',
                 'sources': {n: {'path': str((V1 / f'{n}-color.jpg').relative_to(ROOT)).replace('\\', '/'), 'sha256': sha(V1 / f'{n}-color.jpg')} for n, _ in T.ATLAS_CELLS.values()},
                 'walnut': {'saturation': WALNUT_SAT, 'gain': WALNUT_GAIN}, 'oak_cell_mean_srgb': [round(v, 1) for v in oak],
                 'outputs': {atlas.name: {'sha256': sha(atlas), 'bytes': atlas.stat().st_size, 'size': [size, size]}}})
    # Courtyard earth: the published terrain/dirt-road.png is a lossless PNG decode of the lossy terrain dirt-road.webp
    # (terrain-registry 'courtyard-earth'); re-encode it once as JPEG q90 for the five GLBs that reference it.
    src = RUN / 'raw/publication-before/terrain/dirt-road.png'
    if not src.exists():
        src.parent.mkdir(parents=True, exist_ok=True); src.write_bytes((ROOT / 'public/assets/games/rts/terrain/dirt-road.png').read_bytes())
    im = Image.open(src).convert('RGB'); out = OUT / 'courtyard-earth-color.jpg'
    im.save(out, quality=90, subsampling=0, optimize=True)
    err = float(np.abs(np.asarray(im, dtype=float) - np.asarray(Image.open(out).convert('RGB'), dtype=float)).mean())
    rows.append({'id': 'courtyard-earth', 'source': 'public/assets/games/rts/terrain/dirt-road.png (snapshot raw/publication-before/terrain/dirt-road.png)',
                 'source_sha256': sha(src), 'source_bytes': src.stat().st_size, 'method': 'lossless decode -> JPEG q90 4:4:4, same 1024 px; no resize',
                 'mean_abs_error_8bit': round(err, 3), 'outputs': {out.name: {'sha256': sha(out), 'bytes': out.stat().st_size}}})
    (RUN / 'qa/textures.json').write_text(json.dumps(rows, indent=2) + '\n', encoding='utf-8')
    for r in rows:
        print(r['id'], r.get('mean_srgb', r.get('oak_cell_mean_srgb')), r.get('seam_mae_lr_tb', ''), {k: v['bytes'] for k, v in r['outputs'].items()})


if __name__ == '__main__':
    build()
