"""Sample the existing UV atlas and distinguish shared edges from true overlaps."""
from pathlib import Path
import json
import hashlib
import numpy as np
from original_guard_semantic_material_math import atlas_conflicts, material_regions, sample_face_materials

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / 'art-factory/rts/runs/original-guard-semantic-material/2026-10-05'
SOURCE = RUN / 'candidate/projection-mesh.npz'
SIZE = 2048
CACHE = ROOT / 'tmp/rts/semantic-material/surface-samples.npz'


def raster_samples(mesh, size=SIZE):
    vertices, faces, uv, normals = [mesh[k] for k in ('vertices', 'faces', 'uv', 'normals')]
    indices, points, sample_normals, face_ids = [], [], [], []
    for face_id, (triangle, coordinates) in enumerate(zip(faces, uv)):
        xy = coordinates.copy() * size
        xy[:, 1] = size - xy[:, 1]
        lo = np.maximum(np.floor(xy.min(axis=0)).astype(int), 0)
        hi = np.minimum(np.ceil(xy.max(axis=0)).astype(int), size - 1)
        if np.any(hi < lo):
            continue
        yy, xx = np.mgrid[lo[1]:hi[1]+1, lo[0]:hi[0]+1]
        p = np.column_stack((xx.ravel()+.5, yy.ravel()+.5))
        transform = np.column_stack((xy[1]-xy[0], xy[2]-xy[0]))
        if abs(np.linalg.det(transform)) < 1e-10:
            continue
        bc12 = (p-xy[0]) @ np.linalg.inv(transform).T
        bc = np.column_stack((1-bc12.sum(axis=1), bc12))
        keep = np.all(bc >= -1e-9, axis=1)
        if not np.any(keep):
            continue
        bc = bc[keep]
        indices.append((yy.ravel()[keep]*size+xx.ravel()[keep]).astype(int))
        points.append(bc @ vertices[triangle])
        sample_normals.append(bc @ normals[triangle])
        face_ids.append(np.full(len(bc), face_id, dtype=int))
    samples = {'indices': np.concatenate(indices), 'points': np.concatenate(points),
               'normals': np.concatenate(sample_normals), 'face_ids': np.concatenate(face_ids)}
    samples['normals'] /= np.maximum(np.linalg.norm(samples['normals'], axis=1, keepdims=True), 1e-12)
    return samples


def main():
    for name in ('candidate', 'qa'):
        (RUN/name).mkdir(parents=True, exist_ok=True)
    mesh = np.load(SOURCE)
    samples = raster_samples(mesh)
    report = atlas_conflicts(samples['indices'], samples['points'])
    report.update({'source_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                   'raster_samples': len(samples['indices']), 'unique_covered_texels': len(np.unique(samples['indices']))})
    centers = mesh['vertices'][mesh['faces']].mean(axis=1)
    face_normals = mesh['normals'][mesh['faces']].mean(axis=1)
    face_regions = material_regions(centers, face_normals)
    # Collar textile must cover whole faces contained in the recessed region.
    corner_regions = material_regions(mesh['vertices'][mesh['faces']].reshape(-1, 3), mesh['normals'][mesh['faces']].reshape(-1, 3))
    face_regions['material'][(face_regions['material'] == 2) & ~corner_regions['neck'].reshape(-1, 3).all(axis=1)] = 0
    samples['material'] = sample_face_materials(face_regions['material'], samples['face_ids'])
    labels = {'material_ids': {'steel': 0, 'brass': 1, 'textile': 2},
              'face_labels': face_regions['material'].tolist(),
              'face_counts': np.bincount(face_regions['material'], minlength=3).tolist(),
              'texel_sample_counts': np.bincount(samples['material'], minlength=3).tolist(),
              'assignment': 'Complete source face IDs; raster samples inherit face_labels[face_ids]. Textile only on faces wholly inside the narrow recessed collar. Fused arms remain steel.',
              'limits': 'Authored face selection on the original surface; labels require visual review, not automatic semantic truth.'}
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(CACHE, **samples)
    report['cache_sha256'] = hashlib.sha256(CACHE.read_bytes()).hexdigest()
    report['cache_path'] = CACHE.relative_to(ROOT).as_posix()
    (RUN/'qa/atlas.json').write_bytes((json.dumps(report, indent=2)+'\n').encode())
    (RUN/'qa/regions.json').write_bytes((json.dumps(labels, indent=2)+'\n').encode())
    print(json.dumps({k:v for k,v in {**report, 'conflict_count':len(report['conflicting_pixels']), 'face_counts': labels['face_counts'], 'texel_counts': labels['texel_sample_counts']}.items() if k!='conflicting_pixels'}))
    if report['conflicting_pixels']:
        raise ValueError('Existing UV atlas overlaps unrelated surface points')


if __name__ == '__main__':
    main()
