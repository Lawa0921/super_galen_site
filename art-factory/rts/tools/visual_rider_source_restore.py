"""Restore the generated knight body before seam-destroying reductions."""
import argparse,hashlib,json,sys
from pathlib import Path
import bpy,bmesh
from mathutils import Matrix

sys.path.insert(0,str(Path(__file__).parent))
from neural_guard_production_spec import transformed_point
from visual_rider_surface_test import audit
import procedural_gauntlet_build as g
ROOT=Path(__file__).resolve().parents[3]


def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--run',type=Path,required=True);p.add_argument('--lod',type=int,required=True)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run=a.run.resolve();lod=a.lod
    for f in ('raw','candidate','qa'):(run/f).mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()))
    old=bpy.data.objects[f'MountedKnightBody_LOD{lod}'];name=old.name
    rig=next(m.object for m in old.modifiers if m.type=='ARMATURE');before=audit(old,rig)
    raw=ROOT/'art-factory/rts/runs/guard-neural-pilot/v2/candidate/guard-neural-uv.obj'
    cloth=ROOT/'art-factory/rts/runs/guard-neural-pilot/production-v1/candidate/cloth-faces.json'
    bpy.ops.wm.obj_import(filepath=str(raw),forward_axis='Y',up_axis='Z');body=bpy.context.object
    bottom=min(v.co.z for v in body.data.vertices);top=max(v.co.z for v in body.data.vertices);scale=1.86/(top-bottom)
    for v in body.data.vertices:v.co=transformed_point(v.co,bottom,scale)
    cloth_faces=set(json.loads(cloth.read_bytes()));body.data.materials.clear()
    for material in old.data.materials:body.data.materials.append(material)
    for poly in body.data.polygons:poly.material_index=int(poly.index in cloth_faces);poly.use_smooth=True
    bm=bmesh.new();bm.from_mesh(body.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(body.data);bm.free()
    mod=body.modifiers.new('Welded source LOD','DECIMATE');mod.ratio=min(1,(10000 if lod==0 else 5200)/g.tri_count(body))
    bpy.ops.object.modifier_apply(modifier=mod.name)
    # Heat weights are computed on a complete closed mesh in true rest space.
    # Copying the old fragmented mesh's seam weights also copies its tears.
    rig_world=rig.matrix_world.copy();rig.matrix_world=Matrix.Identity(4);rig.data.pose_position='REST'
    body.matrix_world=Matrix.Identity(4)
    bpy.ops.object.select_all(action='DESELECT');body.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO',keep_transform=True)
    body.matrix_parent_inverse=Matrix.Identity(4);body.matrix_basis=Matrix.Identity(4)
    rig.matrix_world=rig_world;rig.data.pose_position='POSE';bpy.context.view_layer.update()
    bpy.context.view_layer.objects.active=body;rig.select_set(False)
    bpy.ops.object.vertex_group_limit_total(limit=4);bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    trimmed={side:g.trim_open_hand(body,rig,side) for side in 'LR'}
    bpy.data.objects.remove(old,do_unlink=True);body.name=name
    report={'source':str(a.source),'raw_generated_source':str(raw.relative_to(ROOT)),
            'raw_source_sha256':hashlib.sha256(raw.read_bytes()).hexdigest(),'source_ground':bottom,'source_scale':scale,
            'method':'Original generated body; preserve per-loop UV, weld before decimation, rest-space heat weights on existing 20-bone rig',
            'before':before,'after':audit(body,rig),'trimmed_source_hands':trimmed,'status':'candidate_requires_visual_review',
            'runtime_publish_allowed':False,'artistic_quality_proven':False}
    bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(run/f'raw/knight-lod{lod}.blend'))
    (run/f'qa/rider-restore-lod{lod}.json').write_bytes((json.dumps(report,indent=2)+'\n').encode());print(json.dumps(report))


if __name__=='__main__':main()
