"""Actual evaluated glove/weapon intersections and named grip contact witnesses."""
import bpy
import hashlib
import json
import math
from pathlib import Path
import sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri

run=Path(sys.argv[sys.argv.index('--')+1]).resolve()
baseline='--geometry-baseline' in sys.argv
source=run/('geometry-candidate' if baseline else 'candidate')/'original-crossbow-grip.blend'
source_sha256=hashlib.sha256(source.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(source))
rig=bpy.data.objects['crossbowRig20']
reference=json.loads((run/'candidate/weapon-candidate-report.json').read_text())
original=json.loads((run.parent.parent/'original-crossbow-waist/2026-10-06-v1/candidate/grip-candidate-report.json').read_text())

def evaluated(obj):
    e=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh();m.calc_loop_triangles()
    points=[e.matrix_world@v.co for v in m.vertices]
    triangles=[tuple(t.vertices) for t in m.loop_triangles];polygons=[t.polygon_index for t in m.loop_triangles]
    e.to_mesh_clear();return points,triangles,polygons

def crosses(a,b):
    for t,other in [(a,b),(b,a)]:
        for p,q in zip(t,t[1:]+t[:1]):
            d=q-p
            if d.length < 1e-9:continue
            hit=intersect_ray_tri(*other,d,p,True)
            if hit is not None:
                parameter=(hit-p).dot(d)/d.length_squared
                if 1e-6 < parameter < 1-1e-6:return True
    return False

rows=[]
for lod in (0,1):
    weapon=bpy.data.objects[f'CrossbowWeapon_LOD{lod}'];parts=json.loads(weapon['original_weapon_parts'])
    for clip in ('Idle','Walk','Attack','Hurt','Death'):
        action=bpy.data.actions[clip];rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
        end=round(action.frame_range[1]);worst={s:{'max_intersections':0,'max_channel_drift_m':0,'max_nearest_named_grip_m':0,'parts':{}} for s in ('R','L')}
        floor_min=100;body_crossings={'maximum':0,'parts':{}};body_frames=[]
        frames=[n/2 for n in range(end*2+1)] if '--dense' in sys.argv else sorted(set(list(range(0,end+1,2))+[end]))
        for frame in frames:
            bpy.context.scene.frame_set(int(frame),subframe=frame%1);bpy.context.view_layer.update()
            wp,wt,polys=evaluated(weapon);wb=BVHTree.FromPolygons(wp,wt,all_triangles=True)
            skin=rig.pose.bones['Hand_R'].matrix@rig.data.bones['Hand_R'].matrix_local.inverted()
            floor_min=min(floor_min,min(p.z for p in wp))
            if True:
                body=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'];bp,bt,_=evaluated(body)
                bb=BVHTree.FromPolygons(bp,bt,all_triangles=True);body_hits={};regions={}
                for i,j in wb.overlap(bb):
                    if crosses([wp[k] for k in wt[i]],[bp[k] for k in bt[j]]):
                        name=next(k for k,v in parts.items() if v['polygon_start']<=polys[i]<v['polygon_end'])
                        body_hits[name]=body_hits.get(name,0)+1
                        weights={}
                        for index in bt[j]:
                            for g in body.data.vertices[index].groups:
                                group=body.vertex_groups[g.group].name;weights[group]=weights.get(group,0)+g.weight
                        region=max(weights,key=weights.get);regions[region]=regions.get(region,0)+1
                body_frames.append({'frame':frame,'parts':body_hits,'regions':regions})
                if sum(body_hits.values())>body_crossings['maximum']:
                    body_crossings={'maximum':sum(body_hits.values()),'frame':frame,'parts':body_hits,'regions':regions}
            for side,part in [('R','trigger_grip'),('L','support_grip')]:
                hp,ht,_=evaluated(bpy.data.objects['OriginalCrossbowClosedGrip_'+side]);hb=BVHTree.FromPolygons(hp,ht,all_triangles=True)
                exact=[]
                for i,j in wb.overlap(hb):
                    if crosses([wp[k] for k in wt[i]],[hp[k] for k in ht[j]]):exact.append((i,j))
                bypart={}
                for i,j in exact:
                    name=next(k for k,v in parts.items() if v['polygon_start']<=polys[i]<v['polygon_end'])
                    bypart[name]=bypart.get(name,0)+1
                w=worst[side]
                if len(exact)>w['max_intersections']:w.update(max_intersections=len(exact),worst_frame=frame,parts=bypart)
                intended=rig.matrix_world@skin@Vector(reference['grip_channel_bind_space'][side]['center'])
                actual=rig.matrix_world@rig.pose.bones['Hand_'+side].matrix@Vector(original['fitted_grips'][side]['channel_local_bone'])
                w['max_channel_drift_m']=max(w['max_channel_drift_m'],(actual-intended).length)
                v=parts[part];named=[t for t,p in zip(wt,polys) if v['polygon_start']<=p<v['polygon_end']]
                nb=BVHTree.FromPolygons(wp,named,all_triangles=True)
                # Independent nearest actual hand points to this named grip only.
                near=min(nb.find_nearest(p)[3] for p in hp)
                w['max_nearest_named_grip_m']=max(w['max_nearest_named_grip_m'],near)
                if clip=='Idle' and frame==0:
                    w['channel_world']=list(actual)
                    w['channel_nearest_glove_surface_m']=hb.find_nearest(actual)[3]
        rows.append({'lod':lod,'clip':clip,'samples':len(frames),'hands':worst,'weapon_floor_min_m':floor_min,'body_crossings':body_crossings,'body_frames':body_frames})
report={'scope':'Evaluated source; exact noncoplanar edge/triangle crossings after BVH broad phase. Named-grip closest vertex distances are samples, not full finger contact area.','step_frames':.5 if '--dense' in sys.argv else 2,
        'rows':rows,'pass':all(h['max_intersections']==0 and h['max_channel_drift_m']<.005 and h['max_nearest_named_grip_m']<.004 and r['weapon_floor_min_m']>.005 and r['body_crossings']['maximum']==0 for r in rows for h in r['hands'].values())}
assert hashlib.sha256(source.read_bytes()).hexdigest()==source_sha256,'Source changed during verification'
report['source_sha256']=source_sha256
(run/('qa/contact-geometry-baseline.json' if baseline else 'qa/contact.json')).write_text(json.dumps(report,indent=2)+'\n');print('WEAPON_CONTACT',json.dumps({'pass':report['pass'],'body_crossings':[{'clip':r['clip'],'lod':r['lod'],**r['body_crossings']} for r in rows]}))
assert report['pass'],'Weapon contact checks failed; inspect exact parts and poses'
