"""Replace only worker body materials, preserving mesh, skin and animations."""
import argparse,base64,json,sys
from pathlib import Path
import bpy
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from visual_hand_rework import mesh_fingerprint

p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--run',type=Path,required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run=a.run.resolve()
bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
fingerprints={o.name:mesh_fingerprint(o) for o in bpy.data.objects if o.type=='MESH'}
uri='data:image/png;base64,'+base64.b64encode((run/'candidate/team-mask-1024.png').read_bytes()).decode()
image=bpy.data.images.load(str(run/'candidate/body-1024-q90.jpg'),check_existing=False);image.pack()
original=next(m for m in bpy.data.objects['workerOriginalBody_LOD0'].data.materials if 'TeamCloth' not in m.name)
material=original.copy();material.name='TeamClothMasked_worker_original';material['teamTintMask']=uri
for node in material.node_tree.nodes:
    if node.type=='TEX_IMAGE':node.image=image
for lod in (0,1):
    body=bpy.data.objects[f'workerOriginalBody_LOD{lod}'];body.data.materials.clear();body.data.materials.append(material)
    for face in body.data.polygons:face.material_index=0
for name,fingerprint in fingerprints.items():assert mesh_fingerprint(bpy.data.objects[name])==fingerprint,('Unexpected geometry change',name)
g.set_action(rig,'Idle');bpy.context.scene.frame_set(0);bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(run/'raw/worker-assembly.blend'))
objects=[o for o in bpy.data.objects if o.type=='MESH']
for lod in (0,1):g.export_lod(run/'candidate'/('worker.glb' if lod==0 else 'worker-lod1.glb'),rig,[o for o in objects if o.name.endswith(f'_LOD{lod}')])
(run/'qa/worker-material-build.json').write_text(json.dumps({'source':str(a.source),'all_mesh_fingerprints_unchanged':True,'runtime_publish_allowed':False},indent=2)+'\n')
