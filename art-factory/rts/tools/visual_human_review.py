"""Render every actual unit clip with a floor, both body and equipment visible."""
import argparse,sys
from pathlib import Path
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from visual_knight_motion_test import positions


def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--run',type=Path,required=True);p.add_argument('--lod',type=int,default=0);p.add_argument('--clip');p.add_argument('--frame',type=int)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run=a.run.resolve();run.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));scene=bpy.context.scene
    rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
    objects=[o for o in bpy.data.objects if o.type=='MESH' and o.name.endswith(f'_LOD{a.lod}')]
    scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.render.film_transparent=False
    scene.world=scene.world or bpy.data.worlds.new('Review world');scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.11,.14,.16,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.65
    for obj in list(bpy.data.objects):
        if obj.type in ('CAMERA','LIGHT'):bpy.data.objects.remove(obj,do_unlink=True)
        elif obj.type=='MESH':obj.hide_render=obj not in objects
    for name,pos,energy in [('Key',(3,4,5),650),('Fill',(-3,1,3),350),('Rim',(1,-3,4),400)]:
        light=bpy.data.objects.new(name,bpy.data.lights.new(name,'AREA'));light.location=pos;light.data.energy=energy;light.data.size=4
        light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat('-Z','Y').to_euler();scene.collection.objects.link(light)
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.005));floor=bpy.context.object;floor.name='QA only ground'
    material=bpy.data.materials.new('QA floor');material.use_nodes=True;material.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.10,.125,.14,1);material.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.9;floor.data.materials.append(material)
    camera=bpy.data.objects.new('Review camera',bpy.data.cameras.new('Review camera'));scene.collection.objects.link(camera);scene.camera=camera;camera.data.type='ORTHO'
    for action in list(bpy.data.actions):
        if a.clip and action.name!=a.clip:continue
        g.set_action(rig,action.name);start,end=map(int,action.frame_range)
        frame=end if action.name=='Death' else start if action.name=='Idle' else start+(end-start)//3
        if a.frame is not None:frame=a.frame
        scene.frame_set(frame);bpy.context.view_layer.update()
        points=[Vector(p) for obj in objects for p in positions(obj)];minimum=Vector([min(p[i] for p in points) for i in range(3)]);maximum=Vector([max(p[i] for p in points) for i in range(3)]);target=(minimum+maximum)/2
        for view,direction in [('front',(0,1,.1)),('back',(0,-1,.1)),('side',(1,0,.1)),('game',(3,4,3))]:
            camera.location=target+Vector(direction).normalized()*6;camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
            inv=camera.rotation_euler.to_matrix().transposed();coords=[inv@(point-target) for point in points]
            camera.data.ortho_scale=max(max(p[i] for p in coords)-min(p[i] for p in coords) for i in (0,1))*1.18
            scene.render.filepath=str(run/f'{action.name}-{frame}-{view}.png');bpy.ops.render.render(write_still=True)


if __name__=='__main__':main()
