"""Render the saved channel candidate without repeating Boolean surgery."""
from pathlib import Path
import hashlib,json,sys
import bpy
import numpy as np
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/"art-factory/rts/runs/original-guard-grip-channel/2026-10-05"
QA=RUN/"qa"

def main():
    candidate=RUN/"candidate/original-guard-grip-channel.blend"
    bpy.ops.wm.open_mainfile(filepath=str(candidate))
    body=bpy.data.objects["OriginalGripChannelCandidate"]
    geometry=json.loads((QA/"geometry.json").read_text(encoding="utf-8"))
    if hashlib.sha256(candidate.read_bytes()).hexdigest()!=geometry["sha256"][candidate.name]:
        raise ValueError("Checkpoint hash mismatch")
    source_mode="--source" in sys.argv
    if source_mode:
        body.hide_render=True
        data=np.load(ROOT/"tmp/rts/grip-channel-input.npz")
        mesh=bpy.data.meshes.new("OriginalSourceSameCoordinates")
        mesh.from_pydata(data["vertices"].tolist(),[],data["faces"].tolist());mesh.update()
        body=bpy.data.objects.new("OriginalSourceSameCoordinates",mesh);bpy.context.collection.objects.link(body)
    mat=bpy.data.materials.new("Inspection clay");mat.use_nodes=True
    shader=mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value=(.42,.47,.53,1)
    shader.inputs["Roughness"].default_value=.56
    body.data.materials.clear();body.data.materials.append(mat)
    for face in body.data.polygons: face.use_smooth=True
    target=Vector((0,0,.17));scene=bpy.context.scene
    scene.render.engine="BLENDER_EEVEE";scene.render.resolution_x=900;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format="PNG";scene.world=bpy.data.worlds.new("Inspection world");scene.world.color=(.06,.075,.095)
    scene.view_settings.look="AgX - Medium High Contrast"
    for loc,power,size in [((.8,1,.9),80,.7),((-.8,.5,.4),45,.6),((0,-.7,.7),65,.5)]:
        data=bpy.data.lights.new("Inspection softbox","AREA");data.energy=power;data.size=size
        light=bpy.data.objects.new("Inspection softbox",data);bpy.context.collection.objects.link(light);light.location=loc
        light.rotation_euler=(target-light.location).to_track_quat("-Z","Y").to_euler()
    fit=json.loads((QA/"input.json").read_text(encoding="utf-8"))["fit"]
    origin=Vector(fit["origin"]);axis=Vector(fit["direction"])
    views={"front":((0,1,.22),target,.4),"back":((0,-1,.22),target,.4),
           "palm-three-quarter":((.8,1,.35),target,.4),
           "channel-top":(origin+axis*.65,origin,.25),
           "channel-bottom":(origin-axis*.65,origin,.25)}
    out=QA/"renders";out.mkdir(parents=True,exist_ok=True);files={}
    for name,(loc,aim,scale) in views.items():
        data=bpy.data.cameras.new(name);data.type="ORTHO";data.ortho_scale=scale
        camera=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(camera);camera.location=loc
        camera.rotation_euler=(aim-camera.location).to_track_quat("-Z","Y").to_euler();scene.camera=camera
        path=out/(("source-" if source_mode else "")+name+".png");scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
        files[name]={"path":str(path.relative_to(ROOT)).replace("\\","/"),"sha256":hashlib.sha256(path.read_bytes()).hexdigest()}
    report={"status":"visual_review_pending","runtime_publish_allowed":False,"candidate_sha256":geometry["sha256"],"renders":files,"geometry_resaved":False}
    report["source_mode"]=source_mode
    (QA/("renders-source.json" if source_mode else "renders.json")).write_bytes((json.dumps(report,indent=2)+"\n").encode())
    print(json.dumps(report))

if __name__=="__main__": main()
