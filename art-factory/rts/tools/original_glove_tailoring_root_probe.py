"""Isolate local palm subdivision without changing any candidate geometry."""
import bpy,hashlib,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import original_glove_build as base
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'tmp/rts/glove-root-topology-probe'
source=Path(__file__).with_name('original_glove_tailoring_geometry.py')
text=source.read_text(encoding='utf-8')
condition="if len(face)==4 and all(tags[i]=='palm' for i in face) and all(p[1]<0 for p in points) and .010<z<.075:"
assert text.count(condition)==1
namespace={};exec(compile(text.replace(condition,'if False:'),str(source)+' [no local subdivision probe]','exec'),namespace)
data=namespace['cage']()
(OUT/'qa').mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.render.fps=24;scene.frame_start=0;scene.frame_end=48
rig=base.make_rig(data,'R');mat=bpy.data.materials.new('InspectionClayOnly');mat.use_nodes=True
shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.32,.36,.38,1);shader.inputs['Roughness'].default_value=.65
obj=base.make_mesh(data,rig,mat,'R',0);base.animate(rig,'R');base.RUN=OUT;base.render(rig,[obj],'R')
(OUT/'report.json').write_text(json.dumps({'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'only_change':'Disable local palm face splitting. Keep identical relief sampled at the original cage vertices, same bind, pose, subdivision, camera and material.','candidate_written':False,'vertices':len(obj.data.vertices)},indent=2)+'\n',encoding='utf-8')
