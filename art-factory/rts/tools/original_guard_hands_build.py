"""Build a review-only library of original guard closed-grip hands.

The exact source grip and frozen guard bytes are checked before geometry work.
Sword, shield, rig, and actions are only read. Output mesh objects are standalone,
identity-transform library assets with one canonical rigid Hand_L/Hand_R group.
"""
from __future__ import annotations
import hashlib, json, math
from pathlib import Path
import bpy, bmesh
from mathutils import Vector, Quaternion

ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-guard-hands/2026-10-05'
BASE=RUN/'candidate/original-guard-hands-base.blend'
GRIP=ROOT/'art-factory/rts/runs/original-guard-grip-local/2026-10-05/candidate/original-guard-grip-local-flip.blend'
LIBRARY=RUN/'candidate/original-guard-hands-library.blend'
REPORT=RUN/'qa/hand-library.json'
PREVIEW=RUN/'qa/hands-preview-front.png'
EXPECTED_BASE_SHA='9e61e51fc455527dda0fe9d3c1f9f83c41674b5e36b7ae9f648906d19ab75228'
EXPECTED_GRIP_SHA='3c6350ca9e969eb173ca1b8e015a9826b82222e6ea778d208f658cd6b61a3d94'
SOURCE_OBJECT='OriginalGripLowCandidate'
SOURCE_CAP=Vector((-.0926789895554,-.0120840780013,.0739744958270))
SOURCE_CAP_N=Vector((-.9189973812065,-.1528174345587,-.3634427672007)).normalized()
SOURCE_CHANNEL=Vector((.0696278259687629,.020799771149057955,.17))
SOURCE_CHANNEL_N=Vector((-.011295106135510071,.0011887328837747986,.9999355016657416)).normalized()
SOURCE_FINGER=Vector((1,0,0))
SCALE=.55
CUFF_SHORTEN=.047
CUFF_OVERLAP=.015
LOD_RATIOS={'LOD0':.25,'LOD1':.12}

def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''): h.update(block)
    return h.hexdigest()
def vec(v): return [round(float(x),7) for x in v]
def angle_undirected(a,b):
    return math.degrees(math.acos(max(-1.0,min(1.0,abs(a.normalized().dot(b.normalized()))))))
def assert_source(path,expected,label):
    if not path.is_file(): raise RuntimeError(f'{label} file missing: {path}')
    got=digest(path)
    if got!=expected: raise RuntimeError(f'{label} SHA mismatch: expected {expected}, got {got}')
    return got

def capped_source_mesh():
    with bpy.data.libraries.load(str(GRIP),link=False) as (src,dst):
        if SOURCE_OBJECT not in src.objects: raise RuntimeError('OriginalGripLowCandidate is missing')
        dst.objects=[SOURCE_OBJECT]
    obj=next((o for o in dst.objects if o and o.type=='MESH'),None)
    if obj is None: raise RuntimeError('Original grip source is not a mesh')
    mesh=obj.data.copy()
    source_matrix=obj.matrix_world.copy()
    bpy.data.objects.remove(obj,do_unlink=True)
    # This source is authored with identity object transform; fail if that ever changes.
    if max(abs(source_matrix[i][j]-(1.0 if i==j else 0.0)) for i in range(4) for j in range(4))>1e-6:
        raise RuntimeError('Source grip object transform is not identity')
    bm=bmesh.new(); bm.from_mesh(mesh)
    plane=SOURCE_CAP-SOURCE_CAP_N*CUFF_SHORTEN
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
        dist=1e-6,plane_co=plane,plane_no=SOURCE_CAP_N,clear_inner=False,clear_outer=True,use_snap_center=False)
    boundary=[e for e in bm.edges if e.is_boundary]
    if not boundary: bm.free(); raise RuntimeError('Cuff cut produced no boundary')
    cap_vertices={v for e in boundary for v in e.verts}
    cap_center=sum((v.co for v in cap_vertices),Vector())/len(cap_vertices)
    bmesh.ops.holes_fill(bm,edges=boundary,sides=0)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(mesh); bm.free(); mesh.update()
    stats=topology_stats(mesh)
    if stats['components']!=1 or stats['open_boundary_edges'] or stats['nonmanifold_edges']:
        raise RuntimeError(f'Closed grip failed topology after cuff cap: {stats}')
    return mesh,cap_center,{'plane_point':vec(plane),'plane_normal':vec(SOURCE_CAP_N),
        'shorten_m':CUFF_SHORTEN,'cut_boundary_edges':len(boundary),
        'cut_boundary_vertices':len(cap_vertices),'topology_after_cap':stats}

def topology_stats(mesh):
    bm=bmesh.new(); bm.from_mesh(mesh)
    boundary=sum(1 for e in bm.edges if len(e.link_faces)==1)
    nonmanifold=sum(1 for e in bm.edges if len(e.link_faces)!=2)
    unseen=set(bm.verts); components=0
    while unseen:
        components+=1; stack=[unseen.pop()]
        while stack:
            v=stack.pop()
            for e in v.link_edges:
                other=e.other_vert(v)
                if other in unseen: unseen.remove(other); stack.append(other)
    bm.free()
    return {'vertices':len(mesh.vertices),'faces':len(mesh.polygons),'triangles':sum(len(p.vertices)-2 for p in mesh.polygons),
        'components':components,'open_boundary_edges':boundary,'nonmanifold_edges':nonmanifold}

def material_axis(obj,material_name):
    points=[]
    for poly in obj.data.polygons:
        if poly.material_index>=len(obj.data.materials) or not obj.data.materials[poly.material_index] or obj.data.materials[poly.material_index].name!=material_name: continue
        points.extend(obj.matrix_world@obj.data.vertices[i].co for i in poly.vertices)
    if len(points)<3: raise RuntimeError(f'{obj.name} lacks handle geometry using {material_name}')
    center=sum(points,Vector())/len(points)
    # Principal direction via power iteration on the covariance matrix.
    cov=[[sum((p[i]-center[i])*(p[j]-center[j]) for p in points) for j in range(3)] for i in range(3)]
    axis=Vector((1,0,0))
    for _ in range(48):
        q=Vector(tuple(sum(cov[i][j]*axis[j] for j in range(3)) for i in range(3)))
        if q.length<1e-12: raise RuntimeError(f'Cannot determine {obj.name} hilt axis')
        axis=q.normalized()
    return center,axis

def best_roll(normal_rotation, forearm_axis, channel_axis, handle_axis, finger_side):
    """Keep cap normal exactly on forearm; choose roll that best aligns haft projection."""
    base_channel=(normal_rotation@channel_axis).normalized()
    channel_plane=base_channel-forearm_axis*base_channel.dot(forearm_axis)
    handle_plane=handle_axis-forearm_axis*handle_axis.dot(forearm_axis)
    if channel_plane.length<1e-6 or handle_plane.length<1e-6:
        raise RuntimeError('Grip axis projection around the forearm is degenerate')
    channel_plane.normalize(); handle_plane.normalize()
    front=Vector((0,1,0))
    candidates=[]
    for sign in (1,-1):
        target_plane=handle_plane*sign
        roll=math.atan2(forearm_axis.dot(channel_plane.cross(target_plane)),channel_plane.dot(target_plane))
        rotation=Quaternion(forearm_axis,roll)@normal_rotation
        axis=(rotation@channel_axis).normalized()
        finger=rotation@finger_side
        err=angle_undirected(axis,handle_axis)
        # Prefer the sign with the palm/finger side facing the model front when errors tie.
        candidates.append((err,-finger.dot(front),rotation,roll,axis))
    candidates.sort(key=lambda item:(round(item[0],6),item[1]))
    err,_,rotation,roll,axis=candidates[0]
    return rotation,roll,axis,err

def copy_mesh_for_side(source_mesh,side):
    mesh=source_mesh.copy()
    mirrored=side=='L'
    if mirrored:
        for v in mesh.vertices: v.co.x=-v.co.x
        for poly in mesh.polygons: poly.flip()
        mesh.update()
    return mesh

def make_lod_object(source_mesh,source_cap,armature,bone_name,side,lod_name,
                    wrist,elbow,handle_center,handle_axis,rotation,roll,channel_axis,cap_normal,channel_origin):
    mesh=copy_mesh_for_side(source_mesh,side)
    mirrored=side=='L'
    source_cap_local=Vector((-source_cap.x if mirrored else source_cap.x,source_cap.y,source_cap.z))
    channel_origin_local=Vector((-channel_origin.x if mirrored else channel_origin.x,channel_origin.y,channel_origin.z))
    forearm=(elbow-wrist).normalized()
    # Translate the actual source channel center to the handle center. This yields a required
    # wrist anchor and does not mutate either prop; arm animation/IK must honor that anchor.
    mapped_cap=handle_center-rotation@((channel_origin_local-source_cap_local)*SCALE)
    required_wrist=mapped_cap-forearm*CUFF_OVERLAP
    for v in mesh.vertices: v.co=mapped_cap+rotation@((v.co-source_cap_local)*SCALE)
    bm=bmesh.new(); bm.from_mesh(mesh); bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces)); bm.to_mesh(mesh); bm.free(); mesh.update()
    # Standalone library vertices are armature-local for this identity-root rig.
    inv=armature.matrix_world.inverted()
    for v in mesh.vertices: v.co=inv@v.co
    mesh.calc_loop_triangles()
    obj=bpy.data.objects.new(f'GuardHandGrip_{side}_{lod_name}',mesh)
    bpy.context.collection.objects.link(obj)
    obj.location=(0,0,0); obj.rotation_euler=(0,0,0); obj.scale=(1,1,1)
    group=obj.vertex_groups.new(name=bone_name)
    group.add(list(range(len(mesh.vertices))),1.0,'REPLACE')
    leather=bpy.data.materials.get('GuardLeather_Surface')
    if leather is None: raise RuntimeError('Frozen assembly has no GuardLeather_Surface material')
    mesh.materials.clear(); mesh.materials.append(leather)
    for poly in mesh.polygons: poly.material_index=0; poly.use_smooth=True
    if abs(obj.matrix_world.determinant()-1)>1e-6: raise RuntimeError('Generated hand object transform is not identity')
    # Contact and structural fail-closed assertions before any decimation.
    weights=[]
    for vertex in mesh.vertices:
        entries=[g.weight for g in vertex.groups if g.group==group.index]
        weights.append(entries[0] if len(entries)==1 else 0.0)
    if min(weights,default=0)<.99999 or max(weights,default=0)>1.00001: raise RuntimeError(f'{obj.name} is not a rigid {bone_name} skin')
    base_stats=topology_stats(mesh)
    if base_stats['components']!=1 or base_stats['open_boundary_edges'] or base_stats['nonmanifold_edges']:
        raise RuntimeError(f'{obj.name} has invalid closed-grip topology: {base_stats}')
    ratio=LOD_RATIOS[lod_name]
    dec=obj.modifiers.new('OriginalGripLOD','DECIMATE'); dec.decimate_type='COLLAPSE'; dec.ratio=ratio; dec.use_collapse_triangulate=False
    bpy.context.view_layer.objects.active=obj; obj.select_set(True); bpy.ops.object.modifier_apply(modifier=dec.name); obj.select_set(False)
    final_stats=topology_stats(mesh)
    if final_stats['components']!=1 or final_stats['open_boundary_edges'] or final_stats['nonmanifold_edges']:
        raise RuntimeError(f'{obj.name} decimation damaged closed topology: {final_stats}')
    # Recheck every indexed source vertex retains its rigid group after the modifier.
    group=obj.vertex_groups.get(bone_name)
    for vertex in mesh.vertices:
        if abs(group.weight(vertex.index)-1.0)>1e-5: raise RuntimeError(f'{obj.name} lost rigid weights after decimation')
    return obj,{'name':obj.name,'bone':bone_name,'lod_ratio':ratio,'topology_before_decimate':base_stats,
        'topology_after_decimate':final_stats,'handle_center_world':vec(handle_center),
        'required_wrist_world':vec(required_wrist),'current_wrist_world':vec(wrist),
        'wrist_delta_world':vec(required_wrist-wrist),'wrist_shift_m':round((required_wrist-wrist).length,7),
        'rest_forearm_axis':vec(forearm),'source_channel_axis_fit':vec(channel_axis),
        'target_handle_axis':vec(handle_axis),'channel_handle_axis_error_deg':round(angle_undirected(channel_axis,handle_axis),4),
        'cap_normal_fit_error_deg':round(angle_undirected(rotation@cap_normal,forearm),4),
        'channel_to_handle_center_error_m':0.0,'roll_to_handle_projection_degrees':round(math.degrees(roll),4),
        'assigned_material':'GuardLeather_Surface','rigid_weight':1.0,'matrix_world_identity':True}

def render_preview(scene,target):
    scene.render.engine='BLENDER_EEVEE'
    scene.render.resolution_x=1280; scene.render.resolution_y=1000; scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'
    scene.view_settings.view_transform='AgX'; scene.view_settings.exposure=-.7
    if scene.world is None: scene.world=bpy.data.worlds.new('HandsReviewWorld')
    scene.world.color=(.035,.043,.055)
    bpy.ops.object.camera_add(location=(0,3.4,1.08))
    cam=bpy.context.object; cam.name='GuardHandsReviewCamera'; cam.data.type='ORTHO'; cam.data.ortho_scale=2.15
    cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler(); scene.camera=cam
    for name,offset,power,size in (
        ('HandsKey',Vector((1.8,2.0,2.0)),550,2.4),('HandsFill',Vector((-1.7,1.2,.9)),230,2.8),
        ('HandsRim',Vector((.2,-2.0,1.6)),360,1.7)):
        bpy.ops.object.light_add(type='AREA',location=Vector((0,0,0))+offset)
        lamp=bpy.context.object; lamp.name=name; lamp.data.energy=power; lamp.data.shape='DISK'; lamp.data.size=size
        lamp.rotation_euler=(Vector(target)-lamp.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(PREVIEW)
    bpy.ops.render.render(write_still=True)
    scene.render.resolution_x=900; scene.render.resolution_y=700
    cam.data.ortho_scale=.48
    for label,point in (('right-sword',Vector((.45,.075,.904))),('left-shield',Vector((-.455,.065,1.065)))):
        cam.location=point+Vector((0,1.0,0))
        cam.rotation_euler=(point-cam.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(RUN/f'qa/hands-preview-{label}.png')
        bpy.ops.render.render(write_still=True)
    for obj in list(bpy.data.objects):
        if obj.name.startswith('GuardHandsReviewCamera') or obj.name.startswith('HandsKey') or obj.name.startswith('HandsFill') or obj.name.startswith('HandsRim'):
            bpy.data.objects.remove(obj,do_unlink=True)

def main():
    RUN.mkdir(parents=True,exist_ok=True); (RUN/'candidate').mkdir(exist_ok=True); (RUN/'qa').mkdir(exist_ok=True)
    base_sha=assert_source(BASE,EXPECTED_BASE_SHA,'frozen assembly')
    grip_sha=assert_source(GRIP,EXPECTED_GRIP_SHA,'original grip')
    bpy.ops.wm.open_mainfile(filepath=str(BASE))
    arm=bpy.data.objects.get('GuardRig20'); sword=bpy.data.objects.get('KingdomSteelSword_LOD0'); shield=bpy.data.objects.get('KingdomSunShield_LOD0')
    if not arm or not sword or not shield: raise RuntimeError('Frozen guard rig and both props are required')
    if arm.matrix_world.determinant()<0.99999 or arm.matrix_world.determinant()>1.00001: raise RuntimeError('Guard rig transform is not identity')
    leather=bpy.data.materials.get('GuardLeather_Surface')
    if leather is None: raise RuntimeError('GuardLeather_Surface is missing from frozen base')
    unchanged={'sword_matrix':[[round(float(v),8) for v in row] for row in sword.matrix_world],
        'shield_matrix':[[round(float(v),8) for v in row] for row in shield.matrix_world],
        'sword_mesh_sha':hashlib.sha256(bytes(sword.data.vertices[0].co) if False else str([(tuple(v.co),tuple(p.vertices)) for v in sword.data.vertices for p in []]).encode()).hexdigest()}
    source_mesh,source_cap,cuff_record=capped_source_mesh()
    source_mesh.calc_loop_triangles()
    original_tris=len(source_mesh.loop_triangles)
    fits={}; outputs=[]
    sides=(('R','Hand_R','Forearm_R',sword),('L','Hand_L','Forearm_L',shield))
    for side,hand_name,fore_name,prop in sides:
        wrist=arm.matrix_world@arm.data.bones[hand_name].head_local
        elbow=arm.matrix_world@arm.data.bones[fore_name].head_local
        fore=(elbow-wrist).normalized()
        mirrored=side=='L'
        cap_n=Vector((-SOURCE_CAP_N.x if mirrored else SOURCE_CAP_N.x,SOURCE_CAP_N.y,SOURCE_CAP_N.z))
        channel_n=Vector((-SOURCE_CHANNEL_N.x if mirrored else SOURCE_CHANNEL_N.x,SOURCE_CHANNEL_N.y,SOURCE_CHANNEL_N.z))
        finger=Vector((-SOURCE_FINGER.x if mirrored else SOURCE_FINGER.x,SOURCE_FINGER.y,SOURCE_FINGER.z))
        handle_center,handle_axis=material_axis(prop,'WornLeather')
        normal_rotation=cap_n.rotation_difference(fore)
        rotation,roll,shaft_axis,axis_error=best_roll(normal_rotation,fore,channel_n,handle_axis,finger)
        channel_origin=Vector((-SOURCE_CHANNEL.x if mirrored else SOURCE_CHANNEL.x,SOURCE_CHANNEL.y,SOURCE_CHANNEL.z))
        fit_meta={'side':side,'target_prop':prop.name,'target_handle_center':vec(handle_center),
            'target_handle_axis_undirected':vec(handle_axis),'wrist_rest':vec(wrist),'elbow_rest':vec(elbow),
            'forearm_axis':vec(fore),'source_cap_center_after_cut':vec(Vector((-source_cap.x if mirrored else source_cap.x,source_cap.y,source_cap.z))),
            'source_channel_origin':vec(channel_origin),'source_cuff_record':cuff_record,
            'intrinsic_cap_channel_angle_deg':round(angle_undirected(cap_n,channel_n),4),
            'forearm_handle_axis_angle_deg':round(angle_undirected(fore,handle_axis),4),
            'required_cap_normal_error_deg':round(angle_undirected(rotation@cap_n,fore),4),
            'channel_axis_fit_error_deg':round(axis_error,4),
            'channel_center_offset_length_m':round(((channel_origin-Vector((-source_cap.x if mirrored else source_cap.x,source_cap.y,source_cap.z)))*SCALE).length,7),
            'rotation_roll_deg':round(math.degrees(roll),4)}
        fits[side]=fit_meta
        for lod_name in ('LOD0','LOD1'):
            obj,meta=make_lod_object(source_mesh,source_cap,arm,hand_name,side,lod_name,
                wrist,elbow,handle_center,handle_axis,rotation,roll,shaft_axis,cap_n,channel_origin)
            outputs.append(obj); fits[side].setdefault('lods',{})[lod_name]=meta
    scene=bpy.context.scene
    render_preview(scene,Vector((0,0,.95)))
    # Preserve actual original sword/shield/armature/action scene and transforms by SHA-protected base;
    # the library intentionally contains only the authored hand mesh nodes and materials.
    for obj in list(bpy.data.objects):
        if obj not in outputs: bpy.data.objects.remove(obj,do_unlink=True)
    report={'status':'prototype-library-generated','runtime_publish_allowed':False,
        'frozen_base_sha256':base_sha,'grip_source_sha256':grip_sha,
        'source_object':SOURCE_OBJECT,'source_original_triangles':original_tris,
        'source_cuff_processing':cuff_record,'uniform_scale':SCALE,
        'lod_ratios':LOD_RATIOS,'hand_material':'GuardLeather_Surface',
        'hand_vertex_weighting':'All vertices exactly weight 1.0 to canonical Hand_L/Hand_R group.',
        'library_blend':str(LIBRARY),'preview_png':str(PREVIEW),
        'fit_constraints':fits,
        'prop_transform_policy':'No sword/shield geometry, transforms, rig bones, or animation actions were changed. Library contains only hand mesh nodes.',
        'review_note':'This is a prototype hand library and fit report. Arm IK, all-five-clip animation bake, WebGL/material review, and artistic approval remain outstanding.'}
    LIBRARY.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(LIBRARY))
    REPORT.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
    print('GUARD_HAND_LIBRARY='+json.dumps(report),flush=True)
if __name__=='__main__': main()
