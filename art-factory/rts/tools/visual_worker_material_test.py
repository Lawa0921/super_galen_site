"""Check real apron UV samples and continuous per-texel team tinting."""
import argparse,json,sys
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector

p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--report',type=Path,required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()))
rows=[];failures=[]
for lod in (0,1):
    body=bpy.data.objects[f'workerOriginalBody_LOD{lod}'];images={};black=[];pocket=0
    for face in body.data.polygons:
        mat=body.data.materials[face.material_index]
        if not mat.get('teamTintMask','').startswith('data:image/png;base64,'):
            failures.append(f'LOD{lod}: body face {face.index} lacks the embedded texel mask');break
    for face in body.data.polygons:
        center=face.center
        if not (.58<center.z<.78 and abs(center.x)<.15 and abs(center.y)>.10):continue
        pocket+=1;mat=body.data.materials[face.material_index]
        image=next(n.image for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image)
        if image.name not in images:
            values=np.empty(len(image.pixels),np.float32);image.pixels.foreach_get(values);images[image.name]=values.reshape(image.size[1],image.size[0],4)
        uv=sum((body.data.uv_layers.active.data[i].uv for i in face.loop_indices),start=Vector((0,0)))/len(face.loop_indices)
        x=min(image.size[0]-1,max(0,round(uv.x*(image.size[0]-1))));y=min(image.size[1]-1,max(0,round(uv.y*(image.size[1]-1))))
        if max(images[image.name][y,x,:3])<.015:black.append(face.index)
    if not pocket:failures.append(f'LOD{lod}: missing apron test region')
    if black:failures.append(f'LOD{lod}: black atlas gaps on apron faces {black}')
    rows.append({'lod':lod,'pocket_faces_sampled':pocket,'black_face_centers':black})
a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_text(json.dumps({'source':str(a.source),'rows':rows,'failures':failures},indent=2)+'\n');print(json.dumps({'rows':rows,'failures':failures}))
if failures:raise AssertionError('; '.join(failures))
