"""Find rigid hand/prop fits and check two-bone reach without mutating the frozen guard."""
from __future__ import annotations
import hashlib,json,math
from pathlib import Path
import bpy,bmesh
from mathutils import Vector,Quaternion
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-guard-hands/2026-10-05'
BASE=RUN/'candidate/original-guard-hands-base.blend'
GRIP=ROOT/'art-factory/rts/runs/original-guard-grip-local/2026-10-05/candidate/original-guard-grip-local-flip.blend'
OUT=RUN/'qa/ik-roll-scan.json'
CAP=Vector((-.0926789895554,-.0120840780013,.0739744958270))
CAP_N=Vector((-.9189973812065,-.1528174345587,-.3634427672007)).normalized()
CHANNEL=Vector((.0696278259687629,.020799771149057955,.17))
CHANNEL_N=Vector((-.011295106135510071,.0011887328837747986,.9999355016657416)).normalized()
SCALE=.55; CUT=.047; OVERLAP=.015
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def v(x): return [round(float(a),7) for a in x]
def angle(a,b): return math.degrees(math.acos(max(-1,min(1,a.normalized().dot(b.normalized())))))
def undirected(a,b): return math.degrees(math.acos(max(-1,min(1,abs(a.normalized().dot(b.normalized()))))))
def source_cap(mesh):
    bm=bmesh.new();bm.from_mesh(mesh); plane=CAP-CAP_N*CUT
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-6,
        plane_co=plane,plane_no=CAP_N,clear_inner=False,clear_outer=True,use_snap_center=False)
    boundary=[e for e in bm.edges if e.is_boundary]
    verts={x for e in boundary for x in e.verts}
    center=sum((x.co for x in verts),Vector())/len(verts)
    bm.free(); return center,len(boundary)
def handle(obj):
    pts=[]
    for poly in obj.data.polygons:
        if poly.material_index<len(obj.data.materials) and obj.data.materials[poly.material_index] and obj.data.materials[poly.material_index].name=='WornLeather':
            pts.extend(obj.matrix_world@obj.data.vertices[i].co for i in poly.vertices)
    center=sum(pts,Vector())/len(pts)
    cov=[[sum((p[i]-center[i])*(p[j]-center[j]) for p in pts) for j in range(3)] for i in range(3)]
    axis=Vector((1,0,0))
    for _ in range(40):
        q=Vector(tuple(sum(cov[i][j]*axis[j] for j in range(3)) for i in range(3)))
        axis=q.normalized()
    return center,axis
def main():
    base=BASE.read_bytes(); grip_bytes=GRIP.read_bytes()
    bpy.ops.wm.open_mainfile(filepath=str(BASE))
    arm=bpy.data.objects.get('GuardRig20'); srcobj=None
    with bpy.data.libraries.load(str(GRIP),link=False) as (src,dst): dst.objects=['OriginalGripLowCandidate']
    srcobj=next(o for o in dst.objects if o and o.type=='MESH')
    cap,cap_edges=source_cap(srcobj.data)
    rows={}
    for side,tool_name,arm_name in (('R','KingdomSteelSword_LOD0','Sword'),('L','KingdomSunShield_LOD0','Shield')):
        prop=bpy.data.objects[tool_name]; center,axis=handle(prop); mirrored=side=='L'
        forebone=arm.data.bones['Forearm_'+side]; handbone=arm.data.bones['Hand_'+side]; upper=arm.data.bones['UpperArm_'+side]
        wrist=arm.matrix_world@handbone.head_local; elbow=arm.matrix_world@forebone.head_local; shoulder=arm.matrix_world@upper.head_local
        fore_len=float(forebone.length); upper_len=float(upper.length)
        n=Vector((-CAP_N.x if mirrored else CAP_N.x,CAP_N.y,CAP_N.z))
        ch=Vector((-CHANNEL_N.x if mirrored else CHANNEL_N.x,CHANNEL_N.y,CHANNEL_N.z))
        finger=Vector((-1 if mirrored else 1,0,0))
        src_cap=Vector((-cap.x if mirrored else cap.x,cap.y,cap.z))
        src_channel=Vector((-CHANNEL.x if mirrored else CHANNEL.x,CHANNEL.y,CHANNEL.z))
        candidates=[]
        for target_sign in (1,-1):
            target=axis*target_sign
            base_rot=ch.rotation_difference(target)
            for step in range(720):
                phi=math.tau*step/720
                rot=Quaternion(target,phi)@base_rot
                cap_out=(rot@n).normalized()
                channel_axis=(rot@ch).normalized()
                mapped_cap=center-rot@((src_channel-src_cap)*SCALE)
                wrist_target=mapped_cap-cap_out*OVERLAP
                elbow_target=wrist_target+cap_out*fore_len
                se_len=(elbow_target-shoulder).length
                reach_delta=abs(se_len-upper_len)
                bend_current=elbow-shoulder
                bend_angle=undirected(elbow_target-shoulder,bend_current)
                # score minimizes stretch error, then prefers existing elbow plane and then palm front
                palm=(rot@finger).normalized()
                palm_front=abs(palm.dot(Vector((0,1,0))))
                score=reach_delta + bend_angle/180*0.008 + (1-palm_front)*0.001
                candidates.append((score,reach_delta,bend_angle,-palm_front,target_sign,step,rot,cap_out,channel_axis,wrist_target,elbow_target,se_len))
        candidates.sort(key=lambda z:z[0])
        best=candidates[0]
        candidates_out=[]
        for row in candidates[:12]:
            score,delta,bend,pfront,sign,step,rot,capout,chaxis,wt,et,se_len=row
            candidates_out.append({'score':round(score,8),'roll_deg':round(step/720*360,3),'channel_target_sign':sign,
                'channel_axis':v(chaxis),'cap_outward_forearm_axis':v(capout),
                'channel_axis_error_deg':round(undirected(chaxis,axis),4),
                'wrist_target':v(wt),'wrist_delta_from_rest':v(wt-wrist),
                'wrist_shift_m':round((wt-wrist).length,6),'elbow_target':v(et),
                'shoulder_to_elbow_m':round(se_len,6),'upper_arm_length_m':round(upper_len,6),
                'upper_arm_reach_error_m':round(delta,6),'elbow_bend_delta_deg':round(bend,3),
                'hand_front_alignment_abs':round(-pfront,4)})
        rows[side]={'prop':tool_name,'handle_center':v(center),'handle_axis_undirected':v(axis),
            'rest':{'shoulder':v(shoulder),'elbow':v(elbow),'wrist':v(wrist),
                'upper_arm_length_m':round(upper_len,6),'forearm_length_m':round(fore_len,6),
                'arm_reach_total_m':round(upper_len+fore_len,6)},
            'source':{'cap_center_after_47mm_cut':v(src_cap),'cut_boundary_edges':cap_edges,
                'cuff_outward_normal':v(n),'channel_origin':v(src_channel),'channel_axis':v(ch),
                'cap_channel_angle_deg':round(undirected(n,ch),4)},
            'best_channel_locked_rolls':candidates_out}
    report={'status':'read-only-IK-roll-scan','runtime_publish_allowed':False,
        'base_sha256':hashlib.sha256(base).hexdigest(),'grip_sha256':hashlib.sha256(grip_bytes).hexdigest(),
        'scan_steps_per_axis_sign':720,'scale':SCALE,'cuff_overlap_m':OVERLAP,'hands':rows,
        'note':'Handle center/axis are measured from WornLeather triangles. Every candidate locks source channel to prop axis, derives cuff outward axis from the same rigid rotation, and uses a two-bone length check; no prop/rig/action changes.'}
    OUT.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
    print('GUARD_HAND_IK_SCAN='+json.dumps(report),flush=True)
if __name__=='__main__': main()
