"""Check held lance/shield against both actual mounted character surfaces."""
import argparse,json,sys
from pathlib import Path
import bpy,numpy as np
sys.path.insert(0,str(Path(__file__).parent))
from commander_assembly_collision import evaluated,exact_pairs
from visual_knight_seat_test import select_clip
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--report',type=Path,required=True);p.add_argument('--samples-per-frame',type=int,default=4)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()))
rig=bpy.data.objects['MountedKnightRig'];bodies=[o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith(('MountedKnightBody_','NeuralWarhorse_'))]
weapons=[o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith(('KnightLance_','KnightSunShield_'))]
assert len(bodies)==2 and len(weapons)==2
rows=[];failures=[]
for track in rig.animation_data.nla_tracks:
    select_clip(track.name);start,end=map(int,track.strips[0].action.frame_range)
    for frame in np.linspace(start,end,(end-start)*a.samples_per_frame+1):
        bpy.context.scene.frame_set(int(frame),subframe=float(frame%1));bodydata={o.name:evaluated(o) for o in bodies}
        for weapon in weapons:
            wp,wf,wt=evaluated(weapon)
            for body in bodies:
                bp,bf,bt=bodydata[body.name];hits=exact_pairs(bp[bf],wp[wf],bt.overlap(wt))
                row={'clip':track.name,'frame':float(frame),'weapon':weapon.name,'body':body.name,'crossings':len(hits)};rows.append(row)
                if len(hits):
                    ids=set(bf[hits[:,0]].flatten().tolist());groups={}
                    for i in ids:
                        for weight in body.data.vertices[i].groups:groups[body.vertex_groups[weight.group].name]=groups.get(body.vertex_groups[weight.group].name,0)+weight.weight
                    failures.append({**row,'body_regions':sorted(groups.items(),key=lambda x:-x[1])[:3],'bounds':[bp[list(ids)].min(axis=0).tolist(),bp[list(ids)].max(axis=0).tolist()]})
report={'source':str(a.source),'checks':len(rows),'max_crossings':max(r['crossings'] for r in rows),'failures':failures,'rows':rows,'artistic_quality_proven':False}
a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k not in ('rows','failures')}))
assert not failures,'Held equipment crosses the horse or rider surface'
