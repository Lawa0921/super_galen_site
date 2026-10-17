"""Read-only Death48 sleeve comparison; strict arm whitelist, actual pixel rays."""
import bpy
import bmesh
import hashlib
import json
import math
import sys
from pathlib import Path
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from bpy_extras.object_utils import world_to_camera_view

sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[3]
MAIN=Path('C:/Users/bag57/projects/super_galen_site/.claude/worktrees/rts')
TOOLS=MAIN/'art-factory/rts/tools';sys.path.insert(0,str(TOOLS))
from original_guard_articulated_armor import frame
BASE=MAIN/'art-factory/rts/runs/guard-right-hand-cage'
RUN=ROOT/'art-factory/rts/runs/guard-sleeve-comparison/2026-10-09-v1/qa'
SOURCES={'v33':BASE/'2026-10-08-v33-armor-sleeve-winding/candidate/guard-controlled-armor.blend',
         'v35':BASE/'2026-10-09-v35-shared-left-cloth-lod/candidate/guard-controlled-armor.blend'}
ARMOR=['UpperArmArmor','ForearmArmor','ElbowArmor','ShoulderSpaulder','WristCuff']
SIZE=720
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def save(path,data):path.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
def whitelist(lod):return [f'GuardArms_LOD{lod}']+[f'Guard{part}_L_LOD{lod}' for part in ARMOR]
def pose():
    scene=bpy.context.scene;rig=bpy.data.objects['GuardRig20'];rig.animation_data.action=bpy.data.actions['Death']
    scene.frame_set(48,subframe=0);bpy.context.view_layer.update()
    return np.array([rig.pose.bones[n+'_L'].head[:] for n in ('UpperArm','Forearm','Hand')])
def setup(camera_state):
    scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=scene.render.resolution_y=SIZE
    scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
    scene.world=bpy.data.worlds.new('Sleeve LOD review world');scene.world.color=(.045,.045,.045)
    scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-1
    inherited=[]
    for obj in bpy.data.objects:
        if obj.type=='LIGHT':inherited.append({'name':obj.name,'type':obj.data.type,'energy':obj.data.energy,'location':list(obj.location),'rotation':list(obj.rotation_euler),'hide_render':obj.hide_render})
    for delta,energy in (((2,3,4),500),((-3,1,2),400),((1,-3,3),450)):
        data=bpy.data.lights.new('Sleeve review light','AREA');data.energy=energy;data.size=2
        obj=bpy.data.objects.new(data.name,data);scene.collection.objects.link(obj);obj.location=Vector((0,.08,1))+Vector(delta)
        obj.rotation_euler=(Vector((0,.08,1))-obj.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new('Sleeve fixed camera');data.type='ORTHO';data.clip_start=.001;data.ortho_scale=.56
    camera=bpy.data.objects.new(data.name,data);scene.collection.objects.link(camera);scene.camera=camera
    camera.location=camera_state['position'];camera.rotation_euler=camera_state['rotation_euler']
    return scene,camera,inherited
def visibility(names):
    expected=set(names)
    assert expected<=set(bpy.data.objects.keys()),'Missing exact arm whitelist objects'
    for obj in bpy.data.objects:
        if obj.type=='MESH':
            obj.hide_render=obj.name not in expected
            if obj.name in expected:obj.hide_set(False)
    bpy.context.view_layer.update()
    actual=sorted(obj.name for obj in bpy.data.objects if obj.type=='MESH' and not obj.hide_render)
    assert actual==sorted(names),actual
    return [bpy.data.objects[name] for name in actual]
def evaluated_geometry(objects):
    deps=bpy.context.evaluated_depsgraph_get();rows=[]
    for obj in objects:
        evaluated=obj.evaluated_get(deps);mesh=evaluated.to_mesh(preserve_all_data_layers=True,depsgraph=deps);mesh.calc_loop_triangles()
        vertices=[evaluated.matrix_world@v.co for v in mesh.vertices];triangles=[tuple(t.vertices) for t in mesh.loop_triangles]
        normals=[tuple(t.normal) for t in mesh.loop_triangles];matrix=evaluated.matrix_world.to_3x3().inverted().transposed()
        normals=[tuple((matrix@Vector(n)).normalized()) for n in normals]
        bm=bmesh.new();bm.from_mesh(mesh)
        topology={'vertices':len(mesh.vertices),'triangles':len(triangles),'boundary_edges':sum(e.is_boundary for e in bm.edges),
                  'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),'signed_volume':bm.calc_volume(signed=True)}
        bm.free()
        tree=BVHTree.FromPolygons(vertices,triangles,all_triangles=True)
        edges=[tuple(e.vertices) for e in mesh.edges]
        rows.append({'name':obj.name,'tree':tree,'vertices':vertices,'triangles':triangles,'normals':normals,'topology':topology,'edges':edges})
        evaluated.to_mesh_clear()
    return rows
def ray(scene,camera,x,y):
    # Pixel centres; PNG coordinates have top-left origin. Orthographic camera local +Z points backwards.
    half=.56/2;local=Vector((((x+.5)/SIZE-.5)*.56,(.5-(y+.5)/SIZE)*.56,0))
    origin=camera.matrix_world@local;direction=(camera.matrix_world.to_3x3()@Vector((0,0,-1))).normalized()
    return origin,direction
def cast(rows,origin,direction):
    hits=[]
    for row in rows:
        point,normal,index,distance=row['tree'].ray_cast(origin,direction,100)
        if point is not None:hits.append({'object':row['name'],'distance':float(distance),'triangle':int(index),'position':list(point),
                                        'face_normal':list(normal),'front_facing':normal.dot(direction)<0,'normal_dot_ray':float(normal.dot(direction))})
    return sorted(hits,key=lambda h:h['distance'])
def ray_grid(scene,camera,geometry,version,lod):
    # Parent review black V is near x~350,y~275 in the original 720x720 Death48 view.
    roi=[290,215,410,325];hits=[];cloth=[r for r in geometry if r['name']==f'GuardArms_LOD{lod}']
    for y in range(roi[1],roi[3]+1,2):
        for x in range(roi[0],roi[2]+1,2):
            origin,direction=ray(scene,camera,x,y);surface=cast(geometry,origin,direction);sleeve=cast(cloth,origin,direction)
            hits.append({'pixel':[x,y],'visible_first':surface[0] if surface else None,'cloth_first':sleeve[0] if sleeve else None})
    save(RUN/f'{version}-LOD{lod}-pixel-rays.json',{'source_sha256':sha(SOURCES[version]),'pose':'Death48','camera':camera_state,'roi_top_left_pixels':roi,'step':2,'rays':hits,
             'topology':[{'name':row['name'],**row['topology']} for row in geometry]})
def render(version,lod,camera_state,reference_joints):
    source=SOURCES[version];before=sha(source);report=json.loads((source.parent.parent/'qa/authoring.json').read_text(encoding='utf-8'))
    assert before==report['candidate_sha256']
    bpy.ops.wm.open_mainfile(filepath=str(source));joints=pose();delta=float(np.max(np.abs(joints-reference_joints)));assert delta<1e-6,delta
    scene,camera,inherited=setup(camera_state);objects=visibility(whitelist(lod));geometry=evaluated_geometry(objects)
    ray_grid(scene,camera,geometry,version,lod)
    output=RUN/f'{version}-Death48-inner-elbow-LOD{lod}.png';scene.render.filepath=str(output);bpy.ops.render.render(write_still=True)
    image={'file':output.name,'sha256':sha(output),'source':str(source),'source_sha256':before,'version':version,'lod':lod,
           'visible_objects':sorted(o.name for o in objects),'camera':camera_state,'pose_joint_max_delta':delta,'inherited_lights':inherited,
           'view_transform':scene.view_settings.view_transform,'look':scene.view_settings.look,'exposure':scene.view_settings.exposure,'gamma':scene.view_settings.gamma,'pose':'Death48','source_saved':False}
    if version=='v35':
        cloth_objects=visibility([f'GuardArms_LOD{lod}']);cloth_geometry=evaluated_geometry(cloth_objects)
        output=RUN/f'{version}-Death48-cloth-only-LOD{lod}.png';scene.render.filepath=str(output);bpy.ops.render.render(write_still=True)
        row=cloth_geometry[0];projected=[]
        for point in row['vertices']:
            value=world_to_camera_view(scene,camera,point);projected.append([float(value.x*SIZE),float((1-value.y)*SIZE),float(value.z)])
        save(RUN/f'v35-LOD{lod}-cloth-wireframe.json',{'camera':camera_state,'source_sha256':before,'visible_objects':[o.name for o in cloth_objects],'image':output.name,'image_sha256':sha(output),
                    'vertices_png_pixels':projected,'edges':row['edges'],'topology':row['topology'],'overlay_policy':'2D projection of real evaluated mesh edges; QA-only, no geometry changes'})
        image['cloth_only_image']={'file':output.name,'sha256':sha(output)}
    assert sha(source)==before,'Read-only source changed during QA'
    return image

if __name__=='__main__':
    RUN.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCES['v35']));joints=pose();axes=np.diff(joints,axis=0);axes/=np.linalg.norm(axes,axis=1)[:,None]
    basis=frame(axes.sum(axis=0),axes[1]-axes[0]);direction=Vector(-basis[:,2]+basis[:,0]*.65);target=Vector(joints[1]);position=target+direction.normalized()*5
    camera_state={'target':list(target),'direction':list(direction),'position':list(position),'rotation_euler':list((target-position).to_track_quat('-Z','Y').to_euler()),
                  'span':.56,'resolution':[SIZE,SIZE],'projection':'ORTHO','clip_start':.001,'exposure':-1}
    rows=[render(version,lod,camera_state,joints) for version in ['v33','v35'] for lod in [0,1]]
    save(RUN/'renders.json',{'images':rows,'camera':camera_state,'source_saved':False,'pose_joint_heads':joints.tolist(),'strict_whitelist':{str(lod):whitelist(lod) for lod in [0,1]}})
    print('READ_ONLY_SLEEVE_COMPARE',len(rows),flush=True)
