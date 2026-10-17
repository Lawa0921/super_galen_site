"""Refine original glove surfaces while reusing the frozen original rig/motion."""
import bpy,hashlib,json,sys
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
import original_glove_build as base
from original_glove_tailoring_geometry import cage
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-glove-tailoring/2026-10-06-v1'
BASE=ROOT/'art-factory/rts/runs/original-articulated-glove/2026-10-06-v1'
render_base=base.render

def render(rig,objects,side):
    render_base(rig,objects,side)
    scene=bpy.context.scene;cam=scene.camera
    clay=bpy.data.materials.new('InspectionClayOnly');clay.use_nodes=True
    shader=clay.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.32,.36,.38,1);shader.inputs['Roughness'].default_value=.65
    scene.view_layers[0].material_override=clay
    (RUN/'qa/clay').mkdir(parents=True,exist_ok=True)
    for frame,name in [(0,'open'),(9,'half'),(18,'grip')]:
        scene.frame_set(frame);bpy.context.view_layer.update()
        for view,loc in [('palm',(0,-.38,.09)),('back',(0,.38,.09)),('threequarter',(.24,-.32,.23))]:
            cam.location=loc;cam.rotation_euler=(Vector((0,0,.070))-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(RUN/f'qa/clay/{side}-{name}-{view}.png');bpy.ops.render.render(write_still=True)
    scene.view_layers[0].material_override=None

def main():
    contract=json.loads((ROOT/'art-factory/rts/contracts/original-glove-tailoring.json').read_text(encoding='utf-8'))
    for name,sha in contract['baseline_sha256'].items():assert hashlib.sha256((BASE/'candidate'/name).read_bytes()).hexdigest()==sha
    base.RUN=RUN;base.cage=cage;base.render=render;base.main()
    report=json.loads((RUN/'qa/authoring.json').read_text(encoding='utf-8'))
    report['surface_revision']='Original continuous pad/finger/web/cuff sculpture. Original v6 16-bone bind and OpenClose retained; material unchanged to isolate shape review.'
    report['baseline_sha256']=contract['baseline_sha256']
    report['tools']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__),Path(__file__).with_name('original_glove_tailoring_geometry.py'),Path(base.__file__),Path(__file__).with_name('original_glove_geometry.py')]}
    (RUN/'qa/authoring.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
if __name__=='__main__':main()
