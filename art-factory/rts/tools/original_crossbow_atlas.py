"""Offline UV parameterization of original geometry, with exact face mapping.

Run in the existing TripoSR tooling venv (xatlas 0.0.9), not Blender's Python.
No model, rig, animation, or texture is obtained from xatlas.
"""
import hashlib
import importlib.metadata
import json
import sys
from pathlib import Path

import numpy as np
import xatlas


def main():
    source, target = map(Path, sys.argv[1:3])
    data = json.loads(source.read_text())
    vertices = np.asarray(data['vertices'], dtype=np.float32)
    faces = np.asarray(data['faces'], dtype=np.uint32)
    atlas = xatlas.Atlas()
    atlas.add_mesh(vertices, faces)
    pack = xatlas.PackOptions()
    pack.resolution = 1024
    pack.padding = 16
    pack.bilinear = True
    atlas.generate(pack_options=pack)
    mapping, indices, uv = atlas[0]
    assert np.array_equal(mapping[indices], faces), 'Atlas changed face/corner correspondence'
    assert np.isfinite(uv).all() and uv.min() >= 0 and uv.max() <= 1
    assert atlas.atlas_count == 1, 'Expected one local skirt atlas'
    result = {
        'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'tool': 'xatlas', 'version': importlib.metadata.version('xatlas'),
        'atlas_size': [atlas.width, atlas.height],
        'charts': atlas.chart_count,
        'padding_at_1024': [16 * 1024 / atlas.width, 16 * 1024 / atlas.height],
        'face_corners': uv[indices].tolist(),
    }
    target.write_text(json.dumps(result) + '\n')
    print('ORIGINAL_SKIRT_ATLAS', json.dumps({k:v for k,v in result.items() if k != 'face_corners'}))


if __name__ == '__main__':
    main()
