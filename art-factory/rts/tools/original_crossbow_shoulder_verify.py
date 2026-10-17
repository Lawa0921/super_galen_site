"""Actual animated separation at coincident original shoulder mesh seams."""
import bpy,json,sys
from pathlib import Path
from mathutils.kdtree import KDTree
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_interface_probe import RUN,QA,evaluated

def main():
    folder='seam-candidate' if '--seam' in sys.argv else 'candidate'
    bpy.ops.wm.open_mainfile(filepath=str(RUN/folder/'original-crossbow-grip.blend'));rig=bpy.data.objects['crossbowRig20']
    pairs={};objects={}
    for lod in (0,1):
        body=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'];objects[lod]=body;tree=KDTree(len(body.data.vertices))
        for vertex in body.data.vertices:tree.insert(vertex.co,vertex.index)
        tree.balance();pairs[lod]=[]
        for v in body.data.vertices:
            if not (1.18<v.co.z<1.66 and abs(v.co.x)<.40):continue
            for _,index,distance in tree.find_range(v.co,.000005):
                if index>v.index:pairs[lod].append((v.index,index,distance))
    rows=[]
    for clip in ('Idle','Walk','Attack','Hurt','Death'):
        action=bpy.data.actions[clip];rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
        end=round(action.frame_range[1]);worst={lod:{'lod':lod,'clip':clip,'pairs':len(pairs[lod]),'max_gap_m':0,'samples':0} for lod in (0,1)}
        for tick in range(end*2+1):
            f=tick/2;bpy.context.scene.frame_set(int(f),subframe=f%1);bpy.context.view_layer.update()
            for lod,body in objects.items():
                points,_,_=evaluated(body);row=worst[lod];row['samples']+=1
                for i,j,rest_gap in pairs[lod]:
                    gap=(points[i]-points[j]).length
                    if gap>row['max_gap_m']:row.update(max_gap_m=gap,frame=f,indices=[i,j],rest_gap_m=rest_gap,rest_point=list(body.data.vertices[i].co))
        rows.extend(worst.values())
    result={'source_folder':folder,'rows':rows,'pass':all(r['max_gap_m']<.0001 for r in rows),'runtime_publish_allowed':False}
    output='shoulder-seam-geometry.json' if folder=='seam-candidate' else ('shoulder-seam-baseline.json' if '--baseline' in sys.argv else 'shoulder-seam-motion.json')
    (QA/output).write_text(json.dumps(result,indent=2)+'\n');print('SHOULDER_SEAM',json.dumps(result));assert result['pass']
if __name__=='__main__':main()
