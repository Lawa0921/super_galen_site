"""Reject anatomically reversed support wrists, independently of contact QA."""
import bpy,json,math,sys,hashlib
from pathlib import Path
from mathutils import Matrix,Vector
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_attack_probe import activate
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-crossbow-articulated-hand/2026-10-07-v1'
source=Path(sys.argv[sys.argv.index('--source')+1]) if '--source' in sys.argv else RUN/'candidate/articulated-connector.blend'
bpy.ops.wm.open_mainfile(filepath=str(source));rig=bpy.data.objects['crossbowRig20']
author=json.loads((RUN/'qa/attachment-preflight.json').read_text());anchor=Matrix(author['source_bones']['Hand_L']['matrix']);rows=[]
palm_axis=(sum((Matrix(author['source_bones'][n+'1_L']['matrix']).translation for n in ['Index','Middle','Ring','Little']),Vector())/4-anchor.translation).normalized()
for clip in ['Idle','Walk','Attack','Hurt','Death']:
    a=activate(rig,clip,0);angles=[]
    for sample in range(round(a.frame_range[1])*8+1):
        frame=sample/8;activate(rig,clip,frame);wrist=rig.pose.bones['HandPalm_L'].head;elbow=rig.pose.bones['Forearm_L'].head
        direction=(rig.pose.bones['HandPalm_L'].matrix@anchor.inverted()).to_3x3()@palm_axis
        angles.append((math.degrees((wrist-elbow).angle(direction)),frame))
    worst=max(angles);rows.append({'clip':clip,'samples':len(angles),'max_forearm_palm_angle_degrees':worst[0],'worst_frame':worst[1]})
report={'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'rows':rows,'limit_degrees':75,'pass':all(r['max_forearm_palm_angle_degrees']<=75 for r in rows),'scope':'Geometric forearm-to-original wrist-to-four-MCP-centroid direction. This rejects a reversed wrist; it is not a complete anatomical or artistic acceptance.','runtime_publish_allowed':False}
name='posture-baseline.json' if '--baseline' in sys.argv else 'posture.json';(RUN/'qa'/name).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));assert report['pass'],'Support wrist is folded beyond the original hand posture limit'
