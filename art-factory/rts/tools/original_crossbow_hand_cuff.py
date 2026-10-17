"""Adapt the original textured left cuff; retain every vertex outside its ROI."""
import bpy,json,sys,hashlib
from pathlib import Path
from collections import Counter,defaultdict
from mathutils import Vector,Matrix
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_attack_probe import activate
from original_glove_deformation import evaluated
from original_crossbow_cuff_rebuild import geodesic,skin_matrix
from original_crossbow_cuff_boundary import complete_boundary
from original_crossbow_cuff_fit_math import boundary_point,palm_weight

ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-crossbow-articulated-hand/2026-10-07-v1'
SOURCE=RUN/'candidate/articulated-crossbow.blend'

def terminal(obj,lod):
    marker=obj.data.attributes.get('WristTerminalSide')
    if marker:
        ids={i for i,v in enumerate(marker.data) if v.value==2}
        if ids:return ids
    original=json.loads((ROOT/'art-factory/rts/runs/original-crossbow-carry/2026-10-06-v1/interface-candidate/cuff-rebuild-report.json').read_text())
    ids={v.value-1:i for i,v in enumerate(obj.data.attributes['OriginalSourceVertex'].data) if v.value>0}
    seeds={ids[i] for i in original['records']['L']['bodies'][obj.name]['terminal_indices']}
    return complete_boundary(obj.data,seeds)[0]

def hand_section(hand,rest_map):
    counts=Counter(e for p in hand.data.polygons for e in p.edge_keys);adj=defaultdict(list)
    for (i,j),n in counts.items():
        if n==1:adj[i].append(j);adj[j].append(i)
    assert len(adj)==37 and all(len(v)==2 for v in adj.values())
    order=[min(adj)]
    while len(order)<len(adj):order.append(next(v for v in adj[order[-1]] if v not in order))
    assert order[0] in adj[order[-1]]
    return [rest_map.inverted()@hand.data.vertices[i].co for i in order]

def main():
    source_hash=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['crossbowRig20'];activate(rig,'Idle',0)
    meta=json.loads((RUN/'qa/attachment-preflight.json').read_text());anchor=Matrix(meta['source_bones']['Hand_L']['matrix']);rest_map=Matrix(meta['rest_map'])
    hand=bpy.data.objects['OriginalCrossbowArticulatedHand_L'];ring=hand_section(hand,rest_map)
    pose_map=rig.pose.bones['HandPalm_L'].matrix@anchor.inverted()
    axis=(rig.pose.bones['Forearm_L'].head-rig.pose.bones['Forearm_L'].tail).normalized()
    u=pose_map.to_3x3()@Vector((1,0,0));u=(u-axis*u.dot(axis)).normalized();v=axis.cross(u)
    rows=[]
    for lod in (0,1):
        obj=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'];points,_=evaluated(obj);seeds=terminal(obj,lod)
        cap_faces=[p for p in obj.data.polygons if set(p.vertices)<=seeds]
        cap_counts=Counter(e for p in cap_faces for e in p.edge_keys)
        rim={i for e,n in cap_counts.items() if n==1 for i in e};interior=seeds-rim
        assert len(interior)==1 and len(rim)==len(seeds)-1
        cap_center=next(iter(interior));old_center=points[cap_center]
        distances=geodesic(obj.data,points,seeds,.06);group=obj.vertex_groups.get('HandPalm_L') or obj.vertex_groups.new(name='HandPalm_L');changes=[]
        for index,d in distances.items():
            vertex=obj.data.vertices[index];p=points[index];radial=p-old_center;direction=Vector((radial.dot(u),radial.dot(v)))
            if index==cap_center or direction.length<1e-6:
                local=Vector((0,0,.006-d*.75))
            else:
                local=Vector(boundary_point(ring,direction).tolist());radial_length=Vector((local.x,local.y)).length
                scale=.90+.004*(1-palm_weight(d,.06))/radial_length
                local.x*=scale;local.y*=scale;local.z+=.006-d*.75
            blend=palm_weight(d,.06);final=p.lerp(pose_map@local,blend)
            before=vertex.co.copy();old_weights={obj.vertex_groups[g.group].name:g.weight for g in vertex.groups}
            for name,weight in old_weights.items():obj.vertex_groups[name].add([index],weight*(1-blend),'REPLACE')
            group.add([index],blend,'REPLACE');vertex.co=skin_matrix(obj,rig,vertex).inverted()@final
            changes.append({'index':index,'distance_m':d,'palm_weight':blend,'rest_delta_m':(vertex.co-before).length,'old_weights':old_weights})
        obj.data.update();rows.append({'lod':lod,'terminal_indices':sorted(seeds),'roi_vertices':len(changes),'changes':changes})
    output=RUN/'candidate/articulated-cuff.blend';bpy.ops.wm.save_as_mainfile(filepath=str(output))
    report={'input_sha256':source_hash,'candidate_sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'hand_boundary_vertices':len(ring),'roi_limit_m':.06,'terminal_inset_m':.006,'terminal_section_scale':.90,'records':rows,'runtime_publish_allowed':False}
    (RUN/'qa/cuff-adaptation.json').write_text(json.dumps(report,indent=2)+'\n');print('CUFF_ADAPT',json.dumps({k:v for k,v in report.items() if k!='records'}))

if __name__=='__main__':main()
