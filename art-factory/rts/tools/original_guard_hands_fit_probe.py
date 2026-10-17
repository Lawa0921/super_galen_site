"""Measure anatomical closed-grip fit constraints against frozen original guard props."""
from __future__ import annotations
import hashlib, json, math
from pathlib import Path
import bpy, bmesh
from mathutils import Vector, Quaternion

ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-guard-hands/2026-10-05'
BASE=RUN/'candidate/original-guard-hands-base.blend'
GRIP=ROOT/'art-factory/rts/runs/original-guard-grip-local/2026-10-05/candidate/original-guard-grip-local-flip.blend'
OUT=RUN/'qa/fit-probe.json'
CAP=Vector((-.0926789895554,-.0120840780013,.0739744958270))
CAP_N=Vector((-.9189973812065,-.1528174345587,-.3634427672007)).normalized()
CHANNEL=Vector((.0696278259687629,.020799771149057955,.17))
CHANNEL_N=Vector((-.011295106135510071,.0011887328837747986,.9999355016657416)).normalized()
FINGER=Vector((1,0,0))
SCALE=.55
SHORT=.047
OVERLAP=.015

def vec(v): return [round(float(x),7) for x in v]
def angle(a,b):
    return round(math.degrees(math.acos(max(-1,min(1,a.normalized().dot(b.normalized()))))),4)
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def cap_after_cut(mesh):
    bm=bmesh.new(); bm.from_mesh(mesh)
    point=CAP-CAP_N*SHORT
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
        dist=1e-6,plane_co=point,plane_no=CAP_N,clear_inner=False,clear_outer=True,use_snap_center=False)
    boundary=[e for e in bm.edges if e.is_boundary]
    verts={v for e in boundary for v in e.verts}
    center=sum((v.co for v in verts),Vector())/len(verts)
    topology={'boundary_edges':len(boundary),'boundary_vertices':len(verts)}
    bmesh.ops.holes_fill(bm,edges=boundary,sides=0)
    out=bpy.data.meshes.new('FitProbeCapCut'); bm.to_mesh(out); bm.free()
    return center,topology,out
def dominant_axis(points):
    center=sum(points,Vector())/len(points)
    cov=[[sum((p[i]-center[i])*(p[j]-center[j]) for p in points) for j in range(3)] for i in range(3)]
    axis=Vector((1,0,0))
    for _ in range(40):
        q=Vector(tuple(sum(cov[i][j]*axis[j] for j in range(3)) for i in range(3)))
        if q.length<1e-12: break
        axis=q.normalized()
    return center,axis
def mat_points(obj,mat_name):
    pts=[]
    for poly in obj.data.polygons:
        if poly.material_index>=len(obj.data.materials) or not obj.data.materials[poly.material_index] or obj.data.materials[poly.material_index].name!=mat_name: continue
        pts.extend(obj.matrix_world@obj.data.vertices[i].co for i in poly.vertices)
    return pts
def weapon_probe(obj,material):
    pts=mat_points(obj,material)
    center,axis=dominant_axis(pts)
    radii=[]
    for p in pts:
        delta=p-center; radii.append((delta-axis*delta.dot(axis)).length)
    return {'material':material,'point_count':len(pts),'center_blender_xyz_m':vec(center),
        'axis_undirected_blender':vec(axis),'half_extent_axis_m':round(max(abs((p-center).dot(axis)) for p in pts),7),
        'radial_range_m':[round(min(radii),7),round(max(radii),7)],'mean_radial_m':round(sum(radii)/len(radii),7)}
def main():
    frozen=BASE.read_bytes()
    bpy.ops.wm.open_mainfile(filepath=str(BASE))
    arm=bpy.data.objects.get('GuardRig20'); sword=bpy.data.objects.get('KingdomSteelSword_LOD0'); shield=bpy.data.objects.get('KingdomSunShield_LOD0')
    if not arm or not sword or not shield: raise RuntimeError('frozen base is missing expected guard rig/props')
    with bpy.data.libraries.load(str(GRIP),link=False) as (src,dst):
        if 'OriginalGripLowCandidate' not in src.objects: raise RuntimeError('OriginalGripLowCandidate missing')
        dst.objects=['OriginalGripLowCandidate']
    grip=next(o for o in dst.objects if o and o.type=='MESH')
    mesh=grip.data.copy(); cap,cap_stats,cut=cap_after_cut(mesh)
    fwd={}
    weapon={'sword':weapon_probe(sword,'WornLeather'),'shield':weapon_probe(shield,'WornLeather')}
    bone_catalog={b.name:{'head':vec(arm.matrix_world@b.head_local),'tail':vec(arm.matrix_world@b.tail_local),
        'length_m':round(float(b.length),7),'parent':b.parent.name if b.parent else None} for b in arm.data.bones}
    for side in ('R','L'):
        suffix={'R':'R','L':'L'}[side]
        elbow=arm.matrix_world@arm.data.bones['Forearm_'+suffix].head_local
        wrist=arm.matrix_world@arm.data.bones['Hand_'+suffix].head_local
        fore=(elbow-wrist).normalized()
        mirrored=side=='L'
        n=Vector((-CAP_N.x if mirrored else CAP_N.x,CAP_N.y,CAP_N.z))
        ch=Vector((-CHANNEL_N.x if mirrored else CHANNEL_N.x,CHANNEL_N.y,CHANNEL_N.z))
        finger=Vector((-FINGER.x if mirrored else FINGER.x,FINGER.y,FINGER.z))
        rotation0=n.rotation_difference(fore)
        finger_plane=rotation0@finger
        front=Vector((0,1,0))
        fp=(finger_plane-fore*finger_plane.dot(fore)).normalized()
        bp=(front-fore*front.dot(fore)).normalized()
        roll=math.atan2(fore.dot(fp.cross(bp)),fp.dot(bp))
        rot=Quaternion(fore,roll)@rotation0
        mapped_cap=wrist+fore*OVERLAP
        channel_origin=Vector((-CHANNEL.x if mirrored else CHANNEL.x,CHANNEL.y,CHANNEL.z))
        source_cap=Vector((-cap.x if mirrored else cap.x,cap.y,cap.z))
        channel_center=mapped_cap+rot@((channel_origin-source_cap)*SCALE)
        shaft_axis=(rot@ch).normalized()
        handle=weapon['sword' if side=='R' else 'shield']
        target_axis=Vector(handle['axis_undirected_blender'])
        unsigned=math.degrees(math.acos(max(-1,min(1,abs(shaft_axis.dot(target_axis))))))
        predicted={'wrist_rest':vec(wrist),'elbow_rest':vec(elbow),'forearm_axis_elbow_from_wrist':vec(fore),
            'cap_world':vec(mapped_cap),'cap_overlap_m':OVERLAP,
            'predicted_channel_center':vec(channel_center),'target_handle_center':handle['center_blender_xyz_m'],
            'channel_center_error_m':round((channel_center-Vector(handle['center_blender_xyz_m'])).length,7),
            'fitted_channel_axis':vec(shaft_axis),'target_handle_axis_undirected':vec(target_axis),
            'channel_handle_axis_error_deg':round(unsigned,4),
            'source_cap_channel_unsigned_angle_deg':round(math.degrees(math.acos(abs(CAP_N.dot(CHANNEL_N)))),4),
            'forearm_handle_unsigned_angle_deg':round(math.degrees(math.acos(abs(fore.dot(target_axis))),),4),
            'roll_degrees':round(math.degrees(roll),4)}
        fwd[side]=predicted
    report={'status':'fit-constraint-probe','runtime_publish_allowed':False,
       'frozen_base_sha256':hashlib.sha256(frozen).hexdigest(),'grip_source_sha256':sha(GRIP),
       'source_cuff':{'measured_cap_center_after_cut':vec(cap),'plane_point':vec(CAP-CAP_N*SHORT),
         'plane_normal':vec(CAP_N),'boundary':cap_stats,'uniform_scale':SCALE},
       'handle_geometry':weapon,'bones':bone_catalog,'fits':fwd,
       'materials_in_frozen_guard':[m.name for m in bpy.data.materials],
       'source_grip_materials':[m.name if m else None for m in grip.data.materials],
       'interpretation':'No props, bones, or animations were changed. This probe fits the source cuff to each current rest wrist; channel direction and center are derived from the same rigid transform.'}
    OUT.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
    print('GUARD_HAND_FIT_PROBE='+json.dumps(report),flush=True)
if __name__=='__main__': main()
