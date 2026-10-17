"""Re-chart the fixed surface by authored regions; never mutate geometry/rig."""
from pathlib import Path
import hashlib, json, sys, math
import bpy, bmesh, numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent))
ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT/'art-factory/rts/runs/original-guard-semantic-material/2026-10-05'
SOURCE = ROOT/'art-factory/rts/runs/original-guard-portrait-material/2026-10-05/candidate/atlas-prepared.blend'


def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    contract=json.loads((ROOT/'art-factory/rts/contracts/original-guard-semantic-material.json').read_text(encoding='utf-8'))
    if sha(SOURCE)!=contract['source_blend_sha256']:raise ValueError('Frozen source blend changed')
    source_qa = json.loads((ROOT/'art-factory/rts/runs/original-guard-portrait-material/2026-10-05/qa/preparation.json').read_text(encoding='utf-8'))
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    obj=bpy.data.objects['OriginalGuardPortraitBust']
    scene=bpy.context.scene; scene.frame_set(0)
    vertices=np.asarray([v.co[:] for v in obj.data.vertices]);faces=np.asarray([p.vertices[:] for p in obj.data.polygons])
    normals=np.asarray([v.normal[:] for v in obj.data.vertices])
    before=hashlib.sha256(vertices.tobytes()+faces.tobytes()).hexdigest()
    if before != source_qa['geometry_sha256_before']: raise ValueError('Frozen source geometry changed')
    # Separate major pieces and each normal-facing hemisphere before projecting.
    # These are UV chart boundaries only, not visible geometry cuts.
    # Chart seams stay frozen when visible material regions change.
    chart_path=ROOT/contract['uv_chart_labels']['path']
    if sha(chart_path)!=contract['uv_chart_labels']['sha256']:raise ValueError('Frozen chart seams changed')
    group=np.asarray(json.loads(chart_path.read_text(encoding='utf-8')))
    if len(group)!=len(faces):raise ValueError('Frozen chart labels no longer match source mesh')
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.context.tool_settings.mesh_select_mode=(False,False,True)
    bpy.ops.object.mode_set(mode='EDIT')
    mesh=bmesh.from_edit_mesh(obj.data);mesh.faces.ensure_lookup_table()
    counts={}
    for label in np.unique(group):
        bpy.ops.mesh.select_all(action='DESELECT')
        for face in mesh.faces: face.select_set(int(group[face.index])==int(label))
        bmesh.update_edit_mesh(obj.data)
        bpy.ops.uv.smart_project(angle_limit=math.radians(25),island_margin=.008)
        counts[str(int(label))]=int((group==label).sum())
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.seams_from_islands()
    bpy.ops.uv.unwrap(method='ANGLE_BASED',margin=.001)
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(margin=.001)
    bpy.ops.object.mode_set(mode='OBJECT');obj.data.calc_loop_triangles()
    after=hashlib.sha256(np.asarray([v.co[:] for v in obj.data.vertices]).tobytes()+np.asarray([p.vertices[:] for p in obj.data.polygons]).tobytes()).hexdigest()
    if before != after: raise ValueError('UV preparation changed original geometry')
    uv=np.asarray([[obj.data.uv_layers.active.data[i].uv[:] for i in tri.loops] for tri in obj.data.loop_triangles])
    np.savez_compressed(RUN/'candidate/projection-mesh.npz',vertices=vertices,faces=faces,uv=uv,normals=normals)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(RUN/'candidate/atlas-prepared.blend'))
    report={'status':'recharted_pending_overlap_check','runtime_publish_allowed':False,'source_blend_sha256':sha(SOURCE),'geometry_sha256_before':before,'geometry_sha256_after':after,'vertices':len(vertices),'triangles':len(faces),'chart_face_groups':counts,'method':'Major piece/material/normal-facing groups establish seams; angle-based unwrap removes within-chart projection folds, followed by physical-area scaling and joint packing.'}
    (RUN/'qa/preparation.json').write_bytes((json.dumps(report,indent=2)+'\n').encode())
    print('SEMANTIC_PREPARED',json.dumps(report),flush=True)


if __name__=='__main__': main()
