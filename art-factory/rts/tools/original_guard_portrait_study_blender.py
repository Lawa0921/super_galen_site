"""One source-preserving upper-bust reduction and original portrait rig."""
from pathlib import Path
import hashlib,json,sys
import bpy,bmesh,numpy as np
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from original_guard_tabard_blender import source,create,evaluated,strict_self
from original_guard_portrait_study_math import portrait_weights,portrait_motion
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-guard-portrait-study/2026-10-05'
QA=RUN/'qa';CANDIDATE=RUN/'candidate'
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def write(path,data):path.write_bytes((json.dumps(data,indent=2)+'\n').encode())

def topology(obj):
    bm=bmesh.new();bm.from_mesh(obj.data)
    result={'vertices':len(bm.verts),'triangles':sum(len(f.verts)-2 for f in bm.faces),
      'boundary_edges':sum(e.is_boundary for e in bm.edges),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),
      'winding_errors':sum(e.is_manifold and not e.is_contiguous for e in bm.edges),'zero_area_faces':sum(f.calc_area()==0 for f in bm.faces)}
    bm.free();return result

def main():
    QA.mkdir(parents=True,exist_ok=True);CANDIDATE.mkdir(parents=True,exist_ok=True)
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    vertices,faces,source_bvh=source();obj=create('OriginalGuardPortraitBust',vertices.tolist(),faces.tolist())
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-8,plane_co=(0,0,1.30),plane_no=(0,0,1),clear_inner=True)
    boundary=[e for e in bm.edges if e.is_boundary]
    if any(abs(v.co.z-1.30)>1e-6 for e in boundary for v in e.verts):raise ValueError('Unexpected source boundary beyond lower crop')
    caps=bmesh.ops.holes_fill(bm,edges=boundary,sides=0)['faces']
    bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update()
    before=topology(obj);print('PORTRAIT_SOURCE_CROPPED',json.dumps(before),flush=True)
    # Exact high crop retained separately for matching-camera comparisons.
    high=obj.copy();high.data=obj.data.copy();high.name='OriginalHighBustReference';bpy.context.collection.objects.link(high)
    high.hide_render=True;high.hide_set(True)
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    decimate=obj.modifiers.new('SourcePreservingReduction','DECIMATE');decimate.ratio=min(1.,16000/before['triangles']);decimate.use_collapse_triangulate=True
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    for face in obj.data.polygons:face.use_smooth=True
    report=topology(obj);print('PORTRAIT_REDUCED',json.dumps(report),flush=True)
    if any(report[k] for k in ['boundary_edges','nonmanifold_edges','winding_errors','zero_area_faces']):raise ValueError('Reduction topology rejected')
    if report['triangles']>18000:raise ValueError('Portrait triangle budget exceeded')
    rest=np.asarray([v.co[:] for v in obj.data.vertices]);weights=portrait_weights(rest)
    material=bpy.data.materials.new('Original source inspection clay');material.use_nodes=True;material.diffuse_color=(.31,.38,.45,1)
    bsdf=material.node_tree.nodes['Principled BSDF'];bsdf.inputs['Base Color'].default_value=material.diffuse_color;bsdf.inputs['Roughness'].default_value=.58
    obj.data.materials.append(material);high.data.materials.append(material)
    for face in high.data.polygons:face.use_smooth=True
    arm=bpy.data.armatures.new('OriginalPortraitControls');rig=bpy.data.objects.new(arm.name,arm);bpy.context.collection.objects.link(rig)
    bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
    chest=arm.edit_bones.new('PortraitChest');chest.head=(0,0,1.32);chest.tail=(0,0,1.57)
    head=arm.edit_bones.new('PortraitHead');head.head=(0,0,1.58);head.tail=(0,0,1.84);head.parent=chest
    bpy.ops.object.mode_set(mode='OBJECT')
    for column,name in enumerate(['PortraitChest','PortraitHead']):
        group=obj.vertex_groups.new(name=name)
        for i,w in enumerate(weights[:,column]):
            if w:group.add([i],float(w),'REPLACE')
    mod=obj.modifiers.new('OriginalPortraitRig','ARMATURE');mod.object=rig;obj.parent=rig
    scene=bpy.context.scene;scene.frame_start=0;scene.frame_end=120;scene.render.fps=30
    for frame in range(121):
        pose=portrait_motion(frame)
        for name,key in [('PortraitChest','chest'),('PortraitHead','head')]:
            bone=rig.pose.bones[name];bone.rotation_mode='XYZ'
            # Bone local Y is canonical up; map authored world Euler axes.
            bone.rotation_euler=(pose[key][0],pose[key][2],-pose[key][1]);bone.keyframe_insert(data_path='rotation_euler',frame=frame)
    rig.animation_data.action.name='OriginalGuardPortraitIdle'
    scene.frame_set(0);bpy.context.view_layer.update();bpy.context.preferences.filepaths.save_version=0
    blend=CANDIDATE/'original-guard-portrait-study.blend';glb=CANDIDATE/'original-guard-portrait-study.glb'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);rig.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_animations=True)
    print('PORTRAIT_CHECKPOINT_SAVED',flush=True)
    reference={};poses={};base,triangles=evaluated(obj);rigid=np.flatnonzero(weights[:,1]==1)
    rigid_set=set(rigid);edges=np.unique(np.sort(np.concatenate([triangles[:,[0,1]],triangles[:,[1,2]],triangles[:,[2,0]]]),axis=1),axis=0)
    helmet_edges=np.asarray([edge for edge in edges if all(int(i) in rigid_set for i in edge)],int)
    lengths=np.linalg.norm(base[helmet_edges[:,0]]-base[helmet_edges[:,1]],axis=1)
    distances=[float(source_bvh.find_nearest(p)[3]) for p in base if p[2]>1.305]
    low_bvh=BVHTree.FromPolygons(base.tolist(),triangles.tolist(),all_triangles=True)
    source_distances=[float(low_bvh.find_nearest(p)[3]) for p in vertices[::5] if p[2]>1.305]
    for frame in [0,15,30,45,60,75,90,105,120]:
        scene.frame_set(frame);bpy.context.view_layer.update();p,f=evaluated(obj)
        error=float(np.max(np.abs(np.linalg.norm(p[helmet_edges[:,0]]-p[helmet_edges[:,1]],axis=1)-lengths)))
        crossings=strict_self(p,f)
        poses[str(frame)]={'strict_self_pairs':crossings,'rigid_helmet_edge_error_m':error,'max_vertex_motion_m':float(np.linalg.norm(p-base,axis=1).max())}
        if frame in [0,30,60,90,120]:reference[str(frame)]={'positions_gltf':np.column_stack((p[:,0],p[:,2],-p[:,1])).tolist()}
        print('PORTRAIT_POSE_QA',frame,len(crossings),error,flush=True)
    scene.frame_set(0)
    write(QA/'browser-reference.json',{'glb_sha256':sha(glb),'frames':reference})
    failed=any(p['strict_self_pairs'] or p['rigid_helmet_edge_error_m']>1e-6 for p in poses.values())
    write(QA/'geometry.json',{'status':'qa_failed' if failed else 'local_geometry_motion_pass_pending_visual_review','runtime_publish_allowed':False,
       'source_topology':before,'candidate_topology':report,'source_crop_z_m':1.30,'crop_caps':len(caps),'original_generated_source_unchanged':True,
       'reduction':'Single Blender collapse decimation to 16000 target; no global remesh or replacement primitives',
       'low_vertex_to_source_samples':{'count':len(distances),'p95_m':float(np.percentile(distances,95)),'max_m':max(distances)},
       'source_vertex_to_low_samples':{'count':len(source_distances),'p95_m':float(np.percentile(source_distances,95)),'max_m':max(source_distances)},
       'rigid_helmet_vertices':len(rigid),'poses':poses,'blend_sha256':sha(blend),'glb_sha256':sha(glb),
       'limits':['Sampled distances are not Hausdorff bounds','Inspection material, sealed helmet, no facial rig','Cropped bust is not complete character assembly']})
    print('PORTRAIT_QA_DONE',flush=True)

if __name__=='__main__':main()
