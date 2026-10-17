"""Actual six same-camera clay views plus finite wrist orientation witnesses."""
import sys
from pathlib import Path
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path(__file__).parent))
import bpy,bmesh
from mathutils import Vector
from guard_hand_glove_v2_build import RUN,WC,CC,R,T,read,write,sha,render,material
def main():
    blend=RUN/'candidate/guard-right-hand-soft-glove-clay.blend';before=sha(blend)
    bpy.ops.wm.open_mainfile(filepath=str(blend));obj=bpy.data.objects['GuardRightSoftGlove_ClayLOD0'];render(obj)
    for o in bpy.data.objects:
        if o.type=='MESH' and o!=obj:o.hide_render=True
    collar=read(RUN/'qa/collar-transport.json');highlight=material('QA ONLY outward collar orientation',(.16,.43,.56));obj.data.materials.append(highlight)
    for i in collar['collar_polygon_ids']:obj.data.polygons[i].material_index=1
    wire=obj.copy();wire.data=obj.data.copy();bpy.context.collection.objects.link(wire);wire.name='QA ONLY collar wire';wire.data.materials.clear();wire.data.materials.append(material('QA ONLY black wire',(.012,.012,.012)))
    bm=bmesh.new();bm.from_mesh(wire.data);bm.faces.ensure_lookup_table();keep=set(collar['collar_polygon_ids']);bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.index not in keep],context='FACES');bm.to_mesh(wire.data);bm.free()
    modifier=wire.modifiers.new('QA wire','WIREFRAME');modifier.thickness=.00020;modifier.use_replace=True
    scene=bpy.context.scene;camera=scene.camera;camera.data.ortho_scale=.13;axis=Vector(read(RUN/'qa/v35-interface.json')['actual_right_cloth_terminal']['forearm_axis_world']);aim=WC-axis*.012;camera.location=aim+R*.4-T*.6;camera.rotation_euler=(aim-camera.location).to_track_quat('-Z','Y').to_euler()
    path=RUN/'qa/renders/collar-wire-orientation.png';scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
    report={'path':path.as_posix(),'sha256':sha(path),'collar_faces':collar['collar_polygon_ids'],'edge_orientation_source':'qa/collar-transport.json all_two_uses_opposed_before_recalc; normal shading is only a visual witness','camera_location':list(camera.location),'camera_rotation':list(camera.rotation_euler),'ortho_scale':.13,'source_candidate_sha256':before,'guides_saved':False}
    write(RUN/'qa/collar-wire-render.json',report);assert sha(blend)==before
if __name__=='__main__':main()
