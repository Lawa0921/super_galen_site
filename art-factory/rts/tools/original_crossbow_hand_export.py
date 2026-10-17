"""Export complete diagnostic characters without decimating articulated loops."""
import bpy,json,hashlib,sys,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-crossbow-articulated-hand/2026-10-07-v1'
source=RUN/'candidate/articulated-connector.blend';bpy.ops.wm.open_mainfile(filepath=str(source));rig=bpy.data.objects['crossbowRig20']
assert len(rig.data.bones)==36
assert {a.name for a in bpy.data.actions}=={'Idle','Walk','Attack','Hurt','Death'}
scene=bpy.context.scene;source_fps=scene.render.fps;step=8
curves=[fc for a in bpy.data.actions for layer in a.layers for strip in layer.strips for slot in a.slots for bag in [strip.channelbag(slot)] if bag for fc in bag.fcurves]
for fc in curves:
    for key in fc.keyframe_points:
        key.co.x*=step;key.handle_left.x*=step;key.handle_right.x*=step
    fc.update()
scene.render.fps=source_fps*step
rows=[]
def promote_identity_skin_roots(path):
    data=path.read_bytes();length,kind=struct.unpack_from('<II',data,12);assert kind==0x4e4f534a
    gltf=json.loads(data[20:20+length]);parents={child:i for i,n in enumerate(gltf['nodes']) for child in n.get('children',[])}
    animated={c['target']['node'] for a in gltf['animations'] for c in a['channels']}
    for i,node in enumerate(gltf['nodes']):
        if 'skin' not in node or 'mesh' not in node or i not in parents:continue
        parent_index=parents[i];parent=gltf['nodes'][parent_index]
        assert parent_index not in parents and parent_index not in animated
        assert not any(k in parent for k in ['matrix','translation','rotation','scale']),'Only identity nonanimated armature containers may be flattened'
        parent['children'].remove(i)
        for scene_record in gltf['scenes']:
            if parent_index in scene_record['nodes']:scene_record['nodes'].append(i)
    raw=json.dumps(gltf,separators=(',',':')).encode();raw+=b' '*((-len(raw))%4);tail=data[20+length:]
    path.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(raw)+len(tail))+struct.pack('<II',len(raw),0x4e4f534a)+raw+tail)
for lod in (0,1):
    bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
    names=[f'crossbowOriginalBody_LOD{lod}',f'CrossbowWeapon_LOD{lod}','OriginalCrossbowClosedGrip_R','OriginalCrossbowArticulatedHand_L']
    for name in names:bpy.data.objects[name].select_set(True)
    bpy.context.view_layer.objects.active=rig
    output=RUN/f'candidate/original-crossbow-grip-lod{lod}.glb'
    bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_animations=True,export_nla_strips=False,export_force_sampling=True,export_optimize_animation_size=False,export_frame_step=1,export_skins=True,export_morph=False,export_materials='EXPORT',export_apply=True,export_yup=True,export_extras=True)
    promote_identity_skin_roots(output)
    rows.append({'lod':lod,'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'bytes':output.stat().st_size,'source_triangles':{n:sum(len(p.vertices)-2 for p in bpy.data.objects[n].data.polygons) for n in names}})
report={'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'rows':rows,'sample_step_frames':1/step,'source_fps':source_fps,'scope':'Exact diagnostic surfaces; no export decimation. Runtime performance budget has not been accepted.','runtime_publish_allowed':False}
(RUN/'qa/export.json').write_text(json.dumps(report,indent=2)+'\n');print('ARTICULATED_EXPORT',json.dumps(report))
