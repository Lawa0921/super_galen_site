"""Restore the high-resolution generated surface, weld before LOD reduction."""
import argparse,json,math,sys,hashlib
from pathlib import Path
import bpy,bmesh

sys.path.insert(0,str(Path(__file__).parent))
from visual_knight_surface_test import audit
from knight_mouth_finalize import idle, camera, strip_faces
ROOT=Path(__file__).resolve().parents[3]


def main():
    p=argparse.ArgumentParser();p.add_argument('--run',type=Path,required=True);p.add_argument('--lod',type=int,required=True)
    p.add_argument('--source',type=Path)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run=a.run.resolve();lod=a.lod
    for f in ('raw','candidate','qa'):(run/f).mkdir(parents=True,exist_ok=True)
    source=a.source.resolve() if a.source else ROOT/f'art-factory/rts/runs/all-models/2026-10-15-knight-mouth/raw/knight-lod{lod}.blend'
    raw=ROOT/'art-factory/rts/runs/kingdom-knight/2026-10-05-v1/candidate/guard-neural-uv.obj'
    bpy.ops.wm.open_mainfile(filepath=str(source))
    old=bpy.data.objects[f'NeuralWarhorse_LOD{lod}'];name=old.name;before=audit(old)
    rig=next(m.object for m in old.modifiers if m.type=='ARMATURE')
    bpy.ops.wm.obj_import(filepath=str(raw),forward_axis='Y',up_axis='Z');horse=bpy.context.object
    horse.rotation_euler.z=math.pi;horse.scale=(1.7,3,2.7);horse.location.z=.350668*2.7
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    horse.data.materials.clear()
    for material in old.data.materials:horse.data.materials.append(material)
    bm=bmesh.new();bm.from_mesh(horse.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(horse.data);bm.free()
    triangles=sum(len(p.vertices)-2 for p in horse.data.polygons)
    mod=horse.modifiers.new('Welded source LOD','DECIMATE');mod.ratio=min(1,(16000 if lod==0 else 7500)/triangles)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    horse.matrix_world=old.matrix_world.copy();expected_world=horse.matrix_world.copy()
    rig.data.pose_position='REST'
    bpy.ops.object.select_all(action='DESELECT');horse.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO',keep_transform=True)
    rig.data.pose_position='POSE';rig.select_set(False);bpy.context.view_layer.objects.active=horse
    bpy.ops.object.vertex_group_limit_total(limit=4);bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    assert max(abs(horse.matrix_world[r][c]-expected_world[r][c]) for r in range(4) for c in range(4))<1e-6
    for poly in horse.data.polygons:poly.use_smooth=True
    bpy.data.objects.remove(old,do_unlink=True);horse.name=name
    # Preserve the final source's intentional muzzle cleanup when restoring
    # its higher-resolution ancestor. The lasso is the existing approved cut.
    idle();review_camera=camera();ids,_,_=strip_faces(horse,review_camera)
    bm=bmesh.new();bm.from_mesh(horse.data);bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm,geom=[bm.faces[i] for i in ids],context='FACES')
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    bm.to_mesh(horse.data);bm.free();bpy.data.objects.remove(review_camera,do_unlink=True)
    report={'source':str(source.relative_to(ROOT)),'raw_generated_source':str(raw.relative_to(ROOT)),
            'raw_source_sha256':hashlib.sha256(raw.read_bytes()).hexdigest(),'source_triangles':triangles,
            'method':'Original neural UV mesh; weld coincident positions before decimation; retain per-loop UV; rest-space heat weights on existing 12 bones, cap 4 normalized influences',
            'before':before,'after':audit(horse),'status':'candidate_requires_visual_review','runtime_publish_allowed':False,
            'muzzle_faces_removed':len(ids),'known_pending':'Leg anatomy and animated continuity need visual review'}
    bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(run/f'raw/knight-lod{lod}.blend'))
    (run/f'qa/source-restore-lod{lod}.json').write_bytes((json.dumps(report,indent=2)+'\n').encode())
    print(json.dumps({k:v for k,v in report.items() if k not in ('before','after')}))


if __name__=='__main__':main()
