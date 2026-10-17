"""Preserve original 2048 projection and prepare neutral TeamCloth/JPEG atlases."""

import argparse
import hashlib
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def blue_cloth_mask(rgb):
    pixels = np.asarray(rgb, dtype=np.float32)
    return (pixels[..., 2] > pixels[..., 0] * 1.35) & (pixels[..., 2] > pixels[..., 1] * 1.17) & (pixels[..., 2] > 48)


def neutralize_blue(rgba):
    source = np.asarray(rgba, dtype=np.uint8)
    result = source.copy()
    mask = blue_cloth_mask(source[..., :3]) & (source[..., 3] > 8)
    value = np.clip(source[..., 2].astype(np.float32) * .85 + 50, 0, 255).astype(np.uint8)
    result[..., :3] = np.where(mask[..., None], value[..., None], result[..., :3])
    return result


def face_cloth_votes(mesh, image):
    uv = mesh.visual.uv
    if uv is None:
        raise ValueError('Original OBJ must contain UV coordinates')
    face_uv = uv[mesh.faces]
    samples = np.array([[1 / 3, 1 / 3, 1 / 3], [.65, .175, .175], [.175, .65, .175], [.175, .175, .65]], dtype=np.float32)
    points = np.einsum('sv,fvc->fsc', samples, face_uv)
    height, width = image.shape[:2]
    x = np.clip(np.rint(points[..., 0] * (width - 1)).astype(int), 0, width - 1)
    y = np.clip(np.rint((1 - points[..., 1]) * (height - 1)).astype(int), 0, height - 1)
    votes = blue_cloth_mask(image[y, x, :3]).sum(axis=1)
    return np.flatnonzero(votes >= 2).tolist()


def run(unit, project_root):
    import trimesh

    source = project_root / 'art-factory/rts/runs/unit-bodies' / unit / 'v1'
    obj_path = source / 'neural/candidate/guard-neural-uv.obj'
    albedo_path = source / 'projected/candidate/guard-projected-albedo-2048.png'
    run_dir = project_root / 'art-factory/rts/runs/human-units/2026-10-05-v1' / unit
    raw, candidate, qa = (run_dir / part for part in ('raw', 'candidate', 'qa'))
    for directory in (raw, candidate, qa):
        directory.mkdir(parents=True, exist_ok=True)
    with Image.open(albedo_path) as image:
        rgba = np.asarray(image.convert('RGBA'))
    if rgba.shape != (2048, 2048, 4):
        raise ValueError(f'Expected original 2048 atlas for {unit}: {rgba.shape}')
    raw_copy = raw / f'{unit}-projected-albedo-2048.png'
    shutil.copyfile(albedo_path, raw_copy)
    if sha256(raw_copy) != sha256(albedo_path):
        raise ValueError('Raw projection copy changed bytes')
    mesh = trimesh.load(obj_path, process=False)
    if not isinstance(mesh, trimesh.Trimesh) or mesh.visual.uv is None:
        raise ValueError(f'UV mesh unavailable for {unit}')
    has_cloth = unit != 'neutral-raider'
    cloth_faces = face_cloth_votes(mesh, rgba) if has_cloth else []
    (candidate / 'cloth-faces.json').write_text(json.dumps(cloth_faces) + '\n', encoding='utf-8', newline='\n')
    images = {}
    material_sources = [('body', rgba)]
    if has_cloth:
        neutral = neutralize_blue(rgba)
        neutral_path = raw / f'{unit}-teamcloth-neutral-2048.png'
        Image.fromarray(neutral, 'RGBA').save(neutral_path)
        images['neutral_2048'] = {'path': str(neutral_path), 'sha256': sha256(neutral_path)}
        material_sources.append(('teamcloth-neutral', neutral))
    for name, pixels in material_sources:
        image = Image.fromarray(pixels[..., :3], 'RGB').resize((1024, 1024), Image.Resampling.LANCZOS)
        path = candidate / f'{name}-1024-q90.jpg'
        image.save(path, 'JPEG', quality=90, optimize=True, subsampling=0)
        images[name] = {'path': str(path), 'sha256': sha256(path), 'bytes': path.stat().st_size}
    report = {
        'unit': unit, 'source_obj': str(obj_path), 'source_obj_sha256': sha256(obj_path),
        'source_albedo': str(albedo_path), 'source_albedo_sha256': sha256(albedo_path),
        'raw_copy_sha256': sha256(raw_copy), 'source_tris': len(mesh.faces),
        'cloth_faces': len(cloth_faces), 'has_teamcloth': has_cloth, 'images': images,
        'runtime_publish_allowed': False,
    }
    (qa / 'material-prep.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
    print('HUMAN_UNIT_PREP=' + json.dumps(report))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--project-root', type=Path, required=True)
    parser.add_argument('--unit', choices=('worker', 'crossbow', 'priest', 'commander', 'neutral-raider'), required=True)
    args = parser.parse_args()
    run(args.unit, args.project_root.resolve())


if __name__ == '__main__':
    main()
