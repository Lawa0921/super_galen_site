"""Blender regression against real candidate geometry, not its claimed qa_pass."""
from pathlib import Path
import bpy,bmesh,json,sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from human_units_candidate_verify import inspect_glb

args=sys.argv[sys.argv.index('--')+1:]
run=Path(args[0]).resolve();output=Path(args[1]).resolve()
report=json.loads((run/'qa/grip-refine.json').read_text(encoding='utf-8'))
bpy.ops.wm.open_mainfile(filepath=str(run/'candidate/worker-grip-refine.blend'))
arm=bpy.data.objects['workerRig20'];arm.data.pose_position='REST';bpy.context.view_layer.update()
point=Vector(report['wrist_target_world_m']);normal=Vector(report['forearm_axis_world']).normalized()
failures=[];rows={};cap_indices={}
for lod in (0,1):
    body=bpy.data.objects[f'workerOriginalBody_LOD{lod}'];grip=bpy.data.objects[f'WorkerOriginalGrip_LOD{lod}']
    bm=bmesh.new();bm.from_mesh(body.data)
    boundaries=0
    for edge in bm.edges:
        points=[body.matrix_world@v.co for v in edge.verts]
        if edge.is_boundary and all(abs((p-point).dot(normal))<0.002 and (p-point).length<0.145 for p in points):boundaries+=1
    bm.free()
    tree=BVHTree.FromPolygons([grip.matrix_world@v.co for v in grip.data.vertices],[tuple(p.vertices) for p in grip.data.polygons])
    cap=[];max_excess=0.0;missed=0
    for v in body.data.vertices:
        delta=body.matrix_world@v.co-point;side=delta.dot(normal);radial=delta-normal*side
        if abs(side)>0.00005 or radial.length>0.145:continue
        cap.append(v.index)
        if radial.length<1e-5:continue
        _,_,_,radius=tree.ray_cast(point,radial.normalized(),0.145)
        if radius is None:missed+=1
        else:max_excess=max(max_excess,radial.length-radius)
    cap_indices[lod]=cap
    exported=inspect_glb(run/f'candidate/worker-grip-refine-lod{lod}.glb','worker')
    count=exported['triangle_count']
    budget=(0<count<20000) if lod==0 else (7000<=count<=10000)
    if boundaries:failures.append(f'LOD{lod}: {boundaries} open wrist edges')
    if not cap or missed:failures.append(f'LOD{lod}: cap sampling incomplete')
    if max_excess>0.001:failures.append(f'LOD{lod}: flared skin {max_excess:.6f}m outside actual glove')
    if not budget:failures.append(f'LOD{lod}: triangle budget {count}')
    rows[f'lod{lod}']={'cap_vertices':len(cap),'wrist_boundary_edges':boundaries,'max_skin_excess_m':max_excess,'missing_cuff_rays':missed,'exported_triangles':count,'sha256':exported['sha256']}
arm.data.pose_position='POSE';errors=[]
for clip in ['Idle','Walk','Attack','Hurt','Death']:
    action=bpy.data.actions[clip];arm.animation_data.action=action
    start,end=action.frame_range
    for fraction in [0,.25,.5,.75,1]:
        frame=start+(end-start)*fraction;bpy.context.scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update()
        matrix=arm.matrix_world@arm.pose.bones['Hand_R'].matrix@arm.data.bones['Hand_R'].matrix_local.inverted()@arm.matrix_world.inverted()
        for lod in (0,1):
            body=bpy.data.objects[f'workerOriginalBody_LOD{lod}'];evaluated=body.evaluated_get(bpy.context.evaluated_depsgraph_get())
            for index in cap_indices[lod]:
                expected=matrix@(body.matrix_world@body.data.vertices[index].co)
                actual=evaluated.matrix_world@evaluated.data.vertices[index].co
                errors.append((expected-actual).length)
maximum=max(errors,default=1.0)
if maximum>1e-5:failures.append(f'Animated cuff detached by {maximum}m')
result={'passed':not failures,'failures':failures,'geometry':rows,'sampled_clips':['Idle','Walk','Attack','Hurt','Death'],'samples_per_clip':5,'animated_cuff_max_error_m':maximum,'visual_approval':False}
output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result))
if failures:raise AssertionError('; '.join(failures))
