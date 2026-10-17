"""Measure actual evaluated gauntlet and wrist; a successful export is not art QA."""
import bpy,json,sys,math,hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_attack_probe import activate
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-crossbow-complete/2026-10-07-v1'
SOURCE=RUN/'candidate/complete-crossbow-export.blend'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['crossbowRig20']
def evaluated(obj):
    obj=bpy.data.objects[obj] if isinstance(obj,str) else obj
    e=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh();m.calc_loop_triangles()
    points=[e.matrix_world@v.co for v in m.vertices];faces=[tuple(t.vertices) for t in m.loop_triangles]
    e.to_mesh_clear();return points,faces
def area(points,face):
    a,b,c=[points[i] for i in face];return (b-a).cross(c-a).length*.5
activate(rig,'Idle',0);initial={};rows=[];collisions=[]
for lod in [0,1]:
    name='OriginalCrossbowArticulatedHand_L'+('_LOD1' if lod else '')
    p,f=evaluated(name);mark=bpy.data.objects[name].data.attributes['TailoredGauntlet']
    ids=[i for i,face in enumerate(f) if any(mark.data[v].value for v in face)]
    initial[lod]={'faces':f,'ids':ids,'areas':{i:area(p,f[i]) for i in ids}}
    assert min(initial[lod]['areas'].values())>1e-10
for clip in ['Idle','Walk','Attack','Hurt','Death']:
    end=round(activate(rig,clip).frame_range[1])
    for k in range(end*2+1):
        frame=k/2;activate(rig,clip,frame)
        palm=rig.pose.bones['HandPalm_L'].matrix.translation
        roots=sum((rig.pose.bones[n+'1_L'].matrix.translation for n in ['Index','Middle','Ring','Little']),Vector())/4
        fore=palm-rig.pose.bones['Forearm_L'].matrix.translation
        bend=math.degrees(fore.angle(roots-palm))
        for lod in [0,1]:
            name='OriginalCrossbowArticulatedHand_L'+('_LOD1' if lod else '')
            p,f=evaluated(name);base=initial[lod];ratios=[area(p,f[i])/base['areas'][i] for i in base['ids']]
            rows.append({'clip':clip,'frame':frame,'lod':lod,'min_area_ratio':min(ratios),'max_area_ratio':max(ratios),'wrist_bend_degrees':bend})
        if clip=='Attack' and frame.is_integer() and int(frame) in [0,8,12,20,24,29,32,36,38]:
            hp,hf=evaluated('OriginalCrossbowArticulatedHand_L');wp,wf=evaluated('CrossbowWeapon_LOD0')
            hits=BVHTree.FromPolygons(hp,hf,all_triangles=True).overlap(BVHTree.FromPolygons(wp,wf,all_triangles=True))
            collisions.append({'clip':clip,'frame':frame,'hand_weapon_overlap_pairs':len(hits)})
report={'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'samples':rows,'collision_samples':collisions,'minimum_gauntlet_area_ratio':min(r['min_area_ratio'] for r in rows),'maximum_gauntlet_area_ratio':max(r['max_area_ratio'] for r in rows),'maximum_wrist_bend_degrees':max(r['wrist_bend_degrees'] for r in rows),'runtime_publish_allowed':False,'scope':'Dense evaluated surfaces and semantic wrist angle; collision pair count is an investigation signal, not clearance approval.'}
(RUN/'qa/deformation.json').write_text(json.dumps(report,indent=2)+'\n')
print('DEFORMATION',json.dumps({k:v for k,v in report.items() if k!='samples'}))
