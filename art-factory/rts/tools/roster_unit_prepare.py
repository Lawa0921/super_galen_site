"""Roster-expansion body texture prep: the human-units v2 team-mask method on a new run.

Reuses human_units_team_mask (royal-blue fabric texel mask, luminance-preserving
preview recolor, leakage gates) so new units follow the published priest /
commander TeamClothMasked convention. Never writes runtime paths.
"""
import argparse
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

from human_units_team_mask import blue_fabric_mask, category_statistics, feather_mask, recolor_preview, sha256


def steel_safe_mask(rgb):
    """Royal-blue fabric only: blue-steel armour shares the generic blue chroma, so require a
    strong blue/red ratio, drop speckle with an opening, then feather like the v2 method."""
    colors = np.asarray(rgb, dtype=np.float32)
    strict = (blue_fabric_mask(rgb) > 0) & (colors[..., 2] > colors[..., 0] * 2.0)
    opened = Image.fromarray((strict * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(3))
    keep = (np.asarray(opened) > 0) & (colors[..., 2] > colors[..., 0] * 1.6)
    return (keep * 255).astype(np.uint8)


def run(unit, run_dir, profile='v2'):
    select = steel_safe_mask if profile == 'steel-safe' else blue_fabric_mask
    source = run_dir / 'body/projected/candidate/guard-projected-albedo-2048.png'
    prep = run_dir / 'prep'
    raw, candidate, qa = (prep / part for part in ('raw', 'candidate', 'qa'))
    for directory in (raw, candidate, qa):
        directory.mkdir(parents=True, exist_ok=True)
    raw_copy = raw / f'{unit}-projected-albedo-2048.png'
    shutil.copyfile(source, raw_copy)
    if sha256(source) != sha256(raw_copy):
        raise ValueError('Source albedo bytes changed')
    with Image.open(raw_copy) as original:
        rgba = np.asarray(original.convert('RGBA'))
    if rgba.shape != (2048, 2048, 4):
        raise ValueError(f'Unexpected source image shape {rgba.shape}')
    raw_mask = raw / f'{unit}-team-mask-2048.png'
    Image.fromarray(feather_mask(select(rgba[..., :3]) * (rgba[..., 3] > 8)), 'L').save(raw_mask)
    body_path = candidate / 'body-1024-q90.jpg'
    Image.fromarray(rgba[..., :3], 'RGB').resize((1024, 1024), Image.Resampling.LANCZOS).save(
        body_path, 'JPEG', quality=90, optimize=True, subsampling=0)
    with Image.open(body_path) as encoded:
        rgb = np.asarray(encoded.convert('RGB'))
    mask = feather_mask(select(rgb))
    mask_path = candidate / 'team-mask-1024.png'
    Image.fromarray(mask, 'L').save(mask_path, optimize=True)
    categories = category_statistics(rgb, mask)
    if profile == 'steel-safe':
        # The generic royal_blue category also contains blue-steel plate; gate the
        # saturated fabric and the steel separately so neither leaks.
        colors, selected = rgb.astype(np.float32), mask.astype(np.float32) / 255
        generic = blue_fabric_mask(rgb) > 0
        fabric = generic & (colors[..., 2] > colors[..., 0] * 2.3)
        steel = generic & (colors[..., 2] < colors[..., 0] * 1.6)
        categories['saturated_fabric'] = {'pixels': int(fabric.sum()), 'mean_mask': round(float(selected[fabric].mean()), 4)}
        categories['blue_steel'] = {'pixels': int(steel.sum()), 'mean_mask': round(float(selected[steel].mean()), 4)}
        categories['royal_blue'] = categories['saturated_fabric']
        if categories['blue_steel']['mean_mask'] > .05:
            raise ValueError(f'Blue-steel mask leakage: {categories}')
    if categories['royal_blue']['pixels'] < 2500 or categories['royal_blue']['mean_mask'] < .95:
        raise ValueError(f'Royal blue coverage too low: {categories}')
    leaks = {name: categories[name]['mean_mask'] for name in ('neutral_silver', 'warm_gold', 'warm_skin_or_leather')}
    if any(value is not None and value > .05 for value in leaks.values()):
        raise ValueError(f'Noncloth mask leakage: {categories}')
    previews = {}
    for name, color in [('blue', (40, 87, 125)), ('red', (135, 56, 45))]:
        path = candidate / f'preview-{name}-1024-q90.jpg'
        Image.fromarray(recolor_preview(rgb, mask, color), 'RGB').save(path, 'JPEG', quality=90, optimize=True, subsampling=0)
        previews[name] = {'path': path.as_posix(), 'sha256': sha256(path)}
    report = {'unit': unit, 'method': 'human_units_team_mask v2 royal-blue fabric texel mask', 'profile': profile,
              'source_albedo': source.as_posix(), 'source_sha256': sha256(source), 'raw_copy_sha256': sha256(raw_copy),
              'raw_mask_2048': {'path': raw_mask.as_posix(), 'sha256': sha256(raw_mask)},
              'body_rgb_1024': {'path': body_path.as_posix(), 'sha256': sha256(body_path), 'bytes': body_path.stat().st_size},
              'mask_1024': {'path': mask_path.as_posix(), 'sha256': sha256(mask_path), 'bytes': mask_path.stat().st_size},
              'categories': categories, 'previews': previews, 'runtime_publish_allowed': False}
    (qa / 'team-mask-prep.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
    print('ROSTER_PREP=' + json.dumps({'unit': unit, 'categories': categories}), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--unit', required=True)
    parser.add_argument('--run', type=Path, required=True)
    parser.add_argument('--profile', choices=('v2', 'steel-safe'), default='v2')
    args = parser.parse_args()
    run(args.unit, args.run, args.profile)


if __name__ == '__main__':
    main()
