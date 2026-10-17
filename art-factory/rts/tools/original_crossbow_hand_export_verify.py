"""Compare actual reimported GLB surfaces to the complete authored character."""
import bpy,json,hashlib,sys
from pathlib import Path
from mathutils.kdtree import KDTree
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_attack_probe import activate
from original_glove_deformation import evaluated
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-crossbow-articulated-hand/2026-10-07-v1';source=RUN/'candidate/articulated-connector.blend'
bpy.ops.wm.open_mainfile(filepath=str(source));rig=bpy.data.objects['crossbowRig20'];names=['OriginalCrossbowArticulatedHand_L','OriginalCrossbowClosedGrip_R','CrossbowWeapon_LOD0','CrossbowWeapon_LOD1','crossbowOriginalBody_LOD0','crossbowOriginalBody_LOD1'];rest={n:[v.co.copy() for v in bpy.data.objects[n].data.vertices] for n in names};poses={}
for clip in ['Idle','Walk','Attack','Hurt','Death']:
    a=activate(rig,clip,0);end=round(a.frame_range[1]);frames=[0,8,12,20,22,25,28,32,36,37,38,39,40] if clip=='Attack' else [0,end*.25,end*.5,end*.75,end]
    for frame in frames:
        activate(rig,clip,frame);poses[(clip,frame)]={n:evaluated(bpy.data.objects[n])[0] for n in names}
rows=[]
for lod in (0,1):
    path=RUN/f'candidate/original-crossbow-grip-lod{lod}.glb';bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(path));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
    for action in bpy.data.actions:
        if '|' in action.name:action.name=action.name.split('|')[-1]
    selected=[n for n in names if not n.endswith(f'LOD{1-lod}')];maps={};max_rest=0.;errors={n:0. for n in selected}
    rig.data.pose_position='REST';bpy.context.view_layer.update()
    for name in selected:
        points,_=evaluated(bpy.data.objects[name]);tree=KDTree(len(rest[name]))
        for i,p in enumerate(rest[name]):tree.insert(p,i)
        tree.balance();matches=[tree.find(p) for p in points];maps[name]=[r[1] for r in matches];max_rest=max(max_rest,max(r[2] for r in matches))
    rig.data.pose_position='POSE';bpy.context.view_layer.update()
    for (clip,frame),expected in poses.items():
        activate(rig,clip,frame)
        for name in selected:
            actual,_=evaluated(bpy.data.objects[name]);errors[name]=max(errors[name],max((p-expected[name][i]).length for p,i in zip(actual,maps[name])))
    rows.append({'lod':lod,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'poses':len(poses),'rest_surface_error_m':max_rest,'posed_surface_errors_m':errors})
report={'candidate_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'rows':rows,'pass':all(r['rest_surface_error_m']<1e-5 and max(r['posed_surface_errors_m'].values())<1e-5 for r in rows),'runtime_publish_allowed':False};(RUN/'qa/glb-surface-parity.json').write_text(json.dumps(report,indent=2)+'\n');print('GLB_PARITY',json.dumps(report));assert report['pass']
