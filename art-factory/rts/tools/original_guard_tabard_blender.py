"""Source-projected front cloth retopology, original rig and bounded QA."""
from pathlib import Path
import hashlib,json,math,sys
import bpy,bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from original_guard_tabard_math import closed_cloth,cloth_weights
from original_guard_quadri_repair_math import segment_triangle_intersection
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-guard-tabard/2026-10-05'
QA=RUN/'qa'; CANDIDATE=RUN/'candidate'
ROWS,COLS=25,13
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def write(path,data):path.write_bytes((json.dumps(data,indent=2)+'\n').encode())

def source():
    prepared=ROOT/'art-factory/rts/runs/original-guard-quadri/2026-10-05/candidate/source-primary-exact.npz'
    if sha(prepared)!='7851c7d91364e773b4e32e358740f37f43660e2d0cfbc9159f13245470a86edd':raise ValueError('Original source hash mismatch')
    raw=np.load(prepared);p=raw['vertices'].astype(float)
    v=np.column_stack((-p[:,0],p[:,2],p[:,1]+.9685986638069153))*.9481278155956246
    faces=raw['triangles']
    return v,faces,BVHTree.FromPolygons(v.tolist(),faces.tolist(),all_triangles=True)

def create(name,vertices,faces):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
    return obj

def projected_front(bvh):
    points=[];hits=[]
    for t in np.linspace(0,1,ROWS):
        for u in np.linspace(-1,1,COLS):
            # The generated panel is visibly asymmetric. Its left edge narrows
            # at z=.90; a mirrored right-edge trace would hit the skirt behind.
            width=(np.interp(t,[0,.13,.30,.43,1],[.087,.095,.104,.108,.108]) if u<0
                   else np.interp(t,[0,.13,.30,1],[.091,.104,.112,.112]))
            top=1.050-.030*(1-abs(u));bottom=.545+.057*abs(u)
            z=top*(1-t)+bottom*t;x=u*width
            loc,normal,face,distance=bvh.ray_cast((x,1,z),(0,-1,0),2)
            if loc is None or loc.y<.105:raise ValueError(f'Cloth trace left visible source at {x,z}')
            points.append(tuple(loc));hits.append(int(face))
    return np.asarray(points),hits

def evaluated(obj):
    ev=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh();mesh.calc_loop_triangles()
    v=np.asarray([ev.matrix_world@p.co for p in mesh.vertices],float)
    f=np.asarray([t.vertices[:] for t in mesh.loop_triangles],int)
    ev.to_mesh_clear();return v,f

def strict_self(v,f):
    bvh=BVHTree.FromPolygons(v.tolist(),f.tolist(),all_triangles=True);hits=[]
    for a,b in bvh.overlap(bvh):
        if a>=b or set(f[a]).intersection(f[b]):continue
        first,second=v[f[a]],v[f[b]]
        if any((hit:=segment_triangle_intersection(s[e],s[(e+1)%3],d)) is not None and hit['kind']=='interior_crossing'
               for s,d in [(first,second),(second,first)] for e in range(3)):
            hits.append([int(a),int(b)])
    return hits

def build():
    QA.mkdir(parents=True,exist_ok=True);CANDIDATE.mkdir(parents=True,exist_ok=True)
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    sv,sf,bvh=source();front,source_ids=projected_front(bvh)
    vertices,faces=closed_cloth(front,ROWS,COLS,.003)
    obj=create('OriginalGuardFrontTabard',vertices.tolist(),faces)
    for face in obj.data.polygons:face.use_smooth=True
    uv=obj.data.uv_layers.new(name='OriginalClothGrid')
    for poly in obj.data.polygons:
        for loop in poly.loop_indices:
            idx=obj.data.loops[loop].vertex_index%(ROWS*COLS)
            uv.data[loop].uv=(idx%COLS/(COLS-1),1-idx//COLS/(ROWS-1))
    mat=bpy.data.materials.new('Inspection clay only');mat.diffuse_color=(.28,.36,.44,1);mat.use_nodes=True
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=mat.diffuse_color
    mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.78;obj.data.materials.append(mat)
    arm=bpy.data.armatures.new('OriginalTabardControls');rig=bpy.data.objects.new(arm.name,arm);bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    names=['TabardAnchor','TabardMiddle','TabardTip']
    for i,(name,z,tail) in enumerate(zip(names,[1.08,.98,.77],[.98,.77,.54])):
        bone=arm.edit_bones.new(name);bone.head=(0,.15,z);bone.tail=(0,.15,tail)
        if i:bone.parent=arm.edit_bones[names[i-1]]
    bpy.ops.object.mode_set(mode='OBJECT')
    weights=cloth_weights(np.repeat(np.linspace(0,1,ROWS),COLS));weights=np.vstack((weights,weights))
    for i,name in enumerate(names):
        group=obj.vertex_groups.new(name=name)
        for index,weight in enumerate(weights[:,i]):
            if weight:group.add([index],float(weight),'REPLACE')
    mod=obj.modifiers.new('OriginalClothDeformation','ARMATURE');mod.object=rig;obj.parent=rig
    scene=bpy.context.scene;scene.frame_start=0;scene.frame_end=20;scene.render.fps=30
    for frame in range(21):
        phase=frame/20*2*math.pi
        for name,amplitude in zip(names,[0,4,7]):
            bone=rig.pose.bones[name];bone.rotation_mode='XYZ';bone.rotation_euler=(math.radians(amplitude)*math.sin(phase),0,0)
            bone.keyframe_insert(data_path='rotation_euler',frame=frame)
    rig.animation_data.action.name='OriginalTabardSwayStudy'
    scene.frame_set(0);bpy.context.view_layer.update()
    np.savez_compressed(CANDIDATE/'source-projected-grid.npz',vertices=vertices,faces=np.asarray(faces),source_triangle_ids=source_ids,weights=weights)
    bpy.context.preferences.filepaths.save_version=0
    blend=CANDIDATE/'original-guard-tabard.blend';glb=CANDIDATE/'original-guard-tabard.glb'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);rig.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_animations=True,export_materials='EXPORT')
    print('TABARD_CHECKPOINT_SAVED',flush=True)
    bm=bmesh.new();bm.from_mesh(obj.data)
    topology={'vertices':len(bm.verts),'polygons':len(bm.faces),'triangles':sum(len(f.verts)-2 for f in bm.faces),
              'boundary_edges':sum(e.is_boundary for e in bm.edges),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),
              'winding_errors':sum(e.is_manifold and not e.is_contiguous for e in bm.edges),
              'true_zero_area_faces':sum(f.calc_area()==0 for f in bm.faces)};bm.free()
    rest,triangles=evaluated(obj)
    # Test triangle centers and interior barycentric samples, not only exact ray-hit vertices.
    front_tris=triangles[np.all(triangles<ROWS*COLS,axis=1)]
    distances=[]
    for tri in rest[front_tris]:
        for bc in [[1/3]*3,[.6,.2,.2],[.2,.6,.2],[.2,.2,.6]]:
            p=np.asarray(bc)@tri;distances.append(float(bvh.find_nearest(p)[3]))
    poses={};anchor=np.flatnonzero(weights[:,0]==1)
    for frame in range(21):
        scene.frame_set(frame);bpy.context.view_layer.update();v,f=evaluated(obj)
        poses[str(frame)]={'self_intersection_pairs':strict_self(v,f),
          'anchor_max_motion_m':float(np.linalg.norm(v[anchor]-rest[anchor],axis=1).max()),
          'tip_max_motion_m':float(np.linalg.norm(v-rest,axis=1).max())}
    scene.frame_set(0)
    failed=any(topology[k] for k in ['boundary_edges','nonmanifold_edges','winding_errors','true_zero_area_faces']) or topology['triangles']>1600 or np.percentile(distances,95)>.003 or any(p['self_intersection_pairs'] or p['anchor_max_motion_m']>1e-6 for p in poses.values())
    write(QA/'geometry.json',{'status':'qa_failed' if failed else 'mechanical_pass_pending_visual_review','runtime_publish_allowed':False,
       'blender':bpy.app.version_string,'topology':topology,'thickness_y_m':.003,
       'front_sample_count':len(distances),'front_surface_sample_p95_m':float(np.percentile(distances,95)),
       'front_surface_sample_max_m':max(distances),'front_all_vertices_are_source_ray_hits':True,
       'poses':poses,'blend_sha256':sha(blend),'glb_sha256':sha(glb),
       'limitations':['Standalone original cloth study; final body/legs/tassets are not assembled.','UV grid and inspection clay only; original material/normal bake pending.','Sampled surface distance is not a Hausdorff bound.']})
    print('TABARD_QA_DONE',json.dumps(topology),float(np.percentile(distances,95)),flush=True)

if __name__=='__main__':build()
