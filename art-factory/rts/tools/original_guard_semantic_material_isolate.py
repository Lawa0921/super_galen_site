"""Isolate measured conflicting UV triangles without changing model geometry."""
from pathlib import Path
import json, sys, hashlib
import bpy, numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent))
from original_guard_semantic_material_math import isolate_uv_faces
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-guard-semantic-material/2026-10-05'


def main():
    report=json.loads((RUN/'qa/atlas.json').read_text(encoding='utf-8'))
    if not report['conflicting_pixels']:raise ValueError('No measured conflicts to isolate; do not rerun on the isolated atlas')
    cache=ROOT/'tmp/rts/semantic-material/surface-samples.npz'
    if hashlib.sha256(cache.read_bytes()).hexdigest()!=report['cache_sha256']:raise ValueError('Measured raster cache changed')
    samples=np.load(cache)
    ids=np.unique(samples['face_ids'][np.isin(samples['indices'],report['conflicting_pixels'])])
    mesh_path=RUN/'candidate/projection-mesh.npz'
    source_hash=hashlib.sha256(mesh_path.read_bytes()).hexdigest()
    if source_hash!=report['source_sha256']:raise ValueError('Input UV snapshot changed')
    mesh=dict(np.load(mesh_path));new_uv=isolate_uv_faces(mesh['uv'],ids)
    bpy.ops.wm.open_mainfile(filepath=str(RUN/'candidate/atlas-prepared.blend'))
    obj=bpy.data.objects['OriginalGuardPortraitBust'];obj.data.calc_loop_triangles()
    for tri,uv in zip(obj.data.loop_triangles,new_uv):
        for loop,point in zip(tri.loops,uv):obj.data.uv_layers.active.data[loop].uv=point
    vertices=np.asarray([v.co[:] for v in obj.data.vertices]);faces=np.asarray([p.vertices[:] for p in obj.data.polygons])
    if not np.array_equal(vertices,mesh['vertices']) or not np.array_equal(faces,mesh['faces']):raise ValueError('UV isolation changed mesh')
    mesh['uv']=new_uv
    np.savez_compressed(mesh_path,**mesh)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(RUN/'candidate/atlas-prepared.blend'))
    result={'input_projection_sha256':source_hash,'isolated_source_face_ids':ids.tolist(),'unchanged_original_vertices':len(vertices),'unchanged_original_faces':len(faces),'method':'Preserve all other UVs up to uniform U scale .90; measured conflicting triangles each receive a disjoint cell in the reserved right strip. Object geometry and skin are unchanged.','scope':'Resolves measured 2048-texel-center conflicts; not a proof of all continuous UV intersections.'}
    (RUN/'qa/uv-isolation.json').write_bytes((json.dumps(result,indent=2)+'\n').encode())
    print('UV_ISOLATED',json.dumps(result),flush=True)


if __name__=='__main__':main()
