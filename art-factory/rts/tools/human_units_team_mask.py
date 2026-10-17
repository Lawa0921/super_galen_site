"""Deterministic blue-fabric texel mask; preserve original RGB body albedo."""

import argparse
import hashlib
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


UNITS = ('priest', 'commander')


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def blue_fabric_mask(rgb):
    """Royal-blue chroma in the generated atlas, excluding neutral metal and warm trim."""
    colors = np.asarray(rgb, dtype=np.float32)
    red, green, blue = colors[..., 0], colors[..., 1], colors[..., 2]
    selected = ((blue >= 43) & (blue > red * 1.26) & (blue > green * 1.17)
                & (blue - red >= np.maximum(21, blue * .23))
                & (blue - green >= np.maximum(13, blue * .13)))
    return (selected.astype(np.uint8) * 255)


def feather_mask(mask):
    image = Image.fromarray(mask, 'L')
    return np.asarray(image.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(.55)), dtype=np.uint8)


def srgb_to_linear(color):
    value = np.asarray(color, dtype=np.float32) / 255.0
    return np.where(value <= .04045, value / 12.92, ((value + .055) / 1.055) ** 2.4)


def linear_to_srgb(color):
    value = np.clip(color, 0, 1)
    return np.where(value <= .0031308, 12.92 * value, 1.055 * value ** (1 / 2.4) - .055)


def recolor_preview(rgb, mask, team_rgb):
    """Match the runtime luminance-preserving hue substitution for Blender QA."""
    original = np.asarray(rgb, dtype=np.uint8)
    linear = srgb_to_linear(original)
    hue = srgb_to_linear(team_rgb)
    weights = np.array([.2126, .7152, .0722], dtype=np.float32)
    hue /= max(float(np.dot(hue, weights)), .00001)
    luminance = np.einsum('...c,c->...', linear, weights)
    tinted = luminance[..., None] * hue
    amount = np.asarray(mask, dtype=np.float32)[..., None] / 255.0
    mixed = linear * (1 - amount) + tinted * amount
    result = np.rint(linear_to_srgb(mixed) * 255).astype(np.uint8)
    result[np.asarray(mask) == 0] = original[np.asarray(mask) == 0]
    return result


def category_statistics(rgb, mask):
    colors = np.asarray(rgb, dtype=np.float32)
    red, green, blue = colors[..., 0], colors[..., 1], colors[..., 2]
    opaque = np.max(colors, axis=2) > 26
    blue_cloth = blue_fabric_mask(rgb) > 0
    broad_blue = (blue > red * 1.15) & (blue > green * 1.07) & (blue - red > 12) & (blue - green > 7) & (blue > 38)
    silver = opaque & (red > 90) & (green > 90) & (blue > 90) & (np.max(colors, axis=2) - np.min(colors, axis=2) < 35)
    gold = opaque & (red > green * 1.15) & (green > blue * 1.15) & (red > 100)
    skin = opaque & (red > green * 1.20) & (green > blue * .92) & (red > 85)
    selected = mask.astype(np.float32) / 255
    result = {name:{'pixels':int(category.sum()),'mean_mask':round(float(selected[category].mean()),4) if category.any() else None}
              for name,category in [('royal_blue',blue_cloth),('neutral_silver',silver),('warm_gold',gold),('warm_skin_or_leather',skin)]}
    result['broad_blue_residual_pixels'] = int((broad_blue & (mask < 128)).sum())
    return result


def run(unit, root):
    if unit not in UNITS:
        raise ValueError(f'v2 mask production is scoped to {UNITS}')
    source = root / 'art-factory/rts/runs/unit-bodies' / unit / 'v1/projected/candidate/guard-projected-albedo-2048.png'
    run_dir = root / 'art-factory/rts/runs/human-units/2026-10-05-v2' / unit
    raw,candidate,qa = (run_dir/part for part in ('raw','candidate','qa'))
    for directory in (raw,candidate,qa):
        directory.mkdir(parents=True,exist_ok=True)
    raw_copy = raw/f'{unit}-projected-albedo-2048.png'
    shutil.copyfile(source,raw_copy)
    if sha256(source)!=sha256(raw_copy):
        raise ValueError('Source albedo bytes changed')
    with Image.open(raw_copy) as original:
        rgba = np.asarray(original.convert('RGBA'))
    if rgba.shape != (2048,2048,4):
        raise ValueError(f'Unexpected source image shape {rgba.shape}')
    mask_2048 = feather_mask(blue_fabric_mask(rgba[...,:3]) * (rgba[...,3]>8))
    raw_mask = raw/f'{unit}-team-mask-2048.png'
    Image.fromarray(mask_2048,'L').save(raw_mask)
    base = Image.fromarray(rgba[...,:3],'RGB').resize((1024,1024),Image.Resampling.LANCZOS)
    body_path = candidate/'body-1024-q90.jpg'
    base.save(body_path,'JPEG',quality=90,optimize=True,subsampling=0)
    with Image.open(body_path) as encoded:
        rgb = np.asarray(encoded.convert('RGB'))
    mask = feather_mask(blue_fabric_mask(rgb))
    mask_path = candidate/'team-mask-1024.png'
    Image.fromarray(mask,'L').save(mask_path)
    categories = category_statistics(rgb,mask)
    colors = rgb.astype(np.float32)
    red,green,blue = colors[...,0],colors[...,1],colors[...,2]
    broad_blue = (blue > red * 1.15) & (blue > green * 1.07) & (blue-red > 12) & (blue-green > 7) & (blue > 38)
    residual_path = qa/'broad-blue-residual.png'
    Image.fromarray(((broad_blue & (mask<128))*255).astype(np.uint8),'L').save(residual_path)
    if categories['royal_blue']['pixels']<2500 or categories['royal_blue']['mean_mask']<.95:
        raise ValueError(f'Royal blue coverage too low: {categories}')
    if any(categories[name]['mean_mask'] is not None and categories[name]['mean_mask']>.05 for name in ('neutral_silver','warm_gold','warm_skin_or_leather')):
        raise ValueError(f'Noncloth mask leakage: {categories}')
    previews = {}
    for name,color in [('blue',(40,87,125)),('red',(135,56,45))]:
        path = candidate/f'preview-{name}-1024-q90.jpg'
        Image.fromarray(recolor_preview(rgb,mask,color),'RGB').save(path,'JPEG',quality=90,optimize=True,subsampling=0)
        previews[name] = {'path':str(path),'sha256':sha256(path)}
    report = {'unit':unit,'source_albedo':str(source),'source_sha256':sha256(source),'raw_copy_sha256':sha256(raw_copy),
              'raw_mask_2048':{'path':str(raw_mask),'sha256':sha256(raw_mask)},
              'body_rgb_1024':{'path':str(body_path),'sha256':sha256(body_path)},
              'mask_1024':{'path':str(mask_path),'sha256':sha256(mask_path),'size':[1024,1024]},
              'categories':categories,'residual_map':{'path':str(residual_path),'sha256':sha256(residual_path)},
              'previews':previews,'runtime_publish_allowed':False}
    (qa/'team-mask-prep.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
    print('HUMAN_TEAM_MASK='+json.dumps({'unit':unit,'categories':categories,'mask_sha256':sha256(mask_path)}),flush=True)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--project-root',type=Path,required=True)
    parser.add_argument('--unit',choices=UNITS,required=True)
    args=parser.parse_args()
    run(args.unit,args.project_root.resolve())


if __name__=='__main__':
    main()
