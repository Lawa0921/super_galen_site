"""Check original source art and all retained body topology independently."""
import bpy,json,hashlib,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-crossbow-articulated-hand/2026-10-07-v1'
SOURCE=ROOT/'art-factory/rts/runs/original-crossbow-attack/2026-10-06-v1/candidate/original-crossbow-grip.blend'
FINAL=RUN/'candidate/articulated-connector.blend'
def mesh_record(obj):
    m=obj.data
    return {'vertices':[tuple(v.co) for v in m.vertices],'weights':[{obj.vertex_groups[g.group].name:g.weight for g in v.groups if g.weight>0} for v in m.vertices],
            'faces':[(tuple(p.vertices),p.material_index,tuple(tuple(m.uv_layers.active.data[i].uv) for i in p.loop_indices)) for p in m.polygons],
            'materials':[m.name for m in m.materials]}
def curves():
    result={}
    for a in bpy.data.actions:
        result[a.name]={}
        for layer in a.layers:
            for strip in layer.strips:
                for slot in a.slots:
                    bag=strip.channelbag(slot)
                    if not bag:continue
                    for f in bag.fcurves:result[a.name][(f.data_path,f.array_index)]=[(tuple(k.co),tuple(k.handle_left),tuple(k.handle_right),k.interpolation) for k in f.keyframe_points]
    return result
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['crossbowRig20'];bind={b.name:[list(r) for r in b.matrix_local] for b in rig.data.bones};old_curves=curves()
names=['crossbowOriginalBody_LOD0','crossbowOriginalBody_LOD1','CrossbowWeapon_LOD0','OriginalCrossbowClosedGrip_R'];original={n:mesh_record(bpy.data.objects[n]) for n in names}
bpy.ops.wm.open_mainfile(filepath=str(FINAL));rig=bpy.data.objects['crossbowRig20'];new_curves=curves();rows=[]
assert len(rig.data.bones)==36 and {a.name for a in bpy.data.actions}=={'Idle','Walk','Attack','Hurt','Death'}
assert all(bind[n]==[list(r) for r in rig.data.bones[n].matrix_local] for n in bind)
for n in ['CrossbowWeapon_LOD0','OriginalCrossbowClosedGrip_R']:assert mesh_record(bpy.data.objects[n])==original[n],('Original object changed',n)
assert mesh_record(bpy.data.objects['CrossbowWeapon_LOD1'])==original['CrossbowWeapon_LOD0'],'Both LODs must use the exact original critical-contact weapon'
for lod in (0,1):
    n=f'crossbowOriginalBody_LOD{lod}';obj=bpy.data.objects[n];actual=mesh_record(obj);old=original[n];ids=[v.value-1 for v in obj.data.attributes['ArticulatedSourceVertex'].data]
    assert actual['materials']==old['materials']
    retained=0
    for i,source in enumerate(ids):
        if source<0:continue
        assert actual['vertices'][i]==old['vertices'][source],('Retained position',lod,i)
        assert actual['weights'][i]==old['weights'][source],('Retained skin',lod,i)
        retained+=1
    lookup={f[0]:f[1:] for f in old['faces']};faces=0
    for indices,material,uv in actual['faces']:
        mapped=tuple(ids[i] for i in indices)
        if min(mapped)<0:continue
        assert lookup[mapped]==(material,uv),('Retained UV/material',lod,mapped)
        faces+=1
    rows.append({'lod':lod,'exact_retained_vertices':retained,'exact_retained_faces_uv_material':faces})
edited=['Shoulder_L','UpperArm_L','Forearm_L','Hand_L'];kept=0
for clip in ['Idle','Walk','Hurt','Death']:
    for key,value in old_curves[clip].items():
        if any('"'+name+'"' in key[0] for name in edited):continue
        assert new_curves[clip][key]==value,('Untouched source curve changed',clip,key)
        kept+=1
report={'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'candidate_sha256':hashlib.sha256(FINAL.read_bytes()).hexdigest(),'rows':rows,'unchanged_non_attack_non_left_arm_curves':kept,'original_bind_bones_exact':len(bind),'original_weapon_and_right_hand_exact':True,'lod1_uses_exact_original_lod0_weapon':True,'attack_scope':'Original aim/shot up to frame20 retained by sampled transforms; later recovery is reauthored.','pass':True,'runtime_publish_allowed':False}
(RUN/'qa/identity.json').write_text(json.dumps(report,indent=2)+'\n');print('IDENTITY',json.dumps(report))
