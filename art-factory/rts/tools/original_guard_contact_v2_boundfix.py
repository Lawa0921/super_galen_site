"""Metadata-only enclosure fix, preserving exact GLB geometry/animation BIN bytes."""
from pathlib import Path
import bpy,json,sys,hashlib,struct,shutil
sys.path.insert(0,str(Path(__file__).resolve().parent))
from original_guard_contact_v2_bounds import refresh_bounds
from original_guard_walk_refine import action_fcurves
root=Path(__file__).resolve().parents[3]
old=root/'art-factory/rts/runs/original-guard-assembly/continuation-20261006-2/final'
new=root/'art-factory/rts/runs/original-guard-assembly/continuation-20261006-2/final-bounds'
(new/'candidate').mkdir(parents=True,exist_ok=True);(new/'qa').mkdir(exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(old/'candidate/original-guard-assembly.blend'))
rig=bpy.data.objects['GuardRig20'];meshes=[o for o in bpy.data.objects if o.type=='MESH' and o.name.endswith(('LOD0','LOD1'))]
def signature():
    data={'bones':[(b.name,list(map(list,b.matrix_local))) for b in rig.data.bones],
          'actions':[(a.name,[(f.data_path,f.array_index,[(list(k.co),k.interpolation,list(k.handle_left),list(k.handle_right)) for k in f.keyframe_points]) for f in action_fcurves(a)]) for a in bpy.data.actions],
          'meshes':[(o.name,[list(v.co) for v in o.data.vertices],[(v.index,[(g.group,g.weight) for g in v.groups]) for v in o.data.vertices], [list(p.vertices) for p in o.data.polygons]) for o in meshes]}
    return hashlib.sha256(json.dumps(data,separators=(',',':')).encode()).hexdigest()
before=signature();envelope=refresh_bounds(rig,meshes);assert before==signature()
metadata={o.name:dict(o['rtsConservativeBounds'].to_dict()) for o in meshes}
bpy.context.preferences.filepaths.save_version=0;source=new/'candidate/original-guard-assembly.blend';bpy.ops.wm.save_as_mainfile(filepath=str(source))
rows=[]
for lod in (0,1):
    src=old/f'candidate/original-guard-assembly-lod{lod}.glb';data=src.read_bytes();size=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+size]);remainder=data[20+size:];count=0
    for node in doc['nodes']:
        if 'mesh' in node:
            if node.get('name') not in metadata:raise ValueError('Unknown source mesh '+str(node.get('name')))
            node.setdefault('extras',{})['rtsConservativeBounds']=metadata[node['name']];count+=1
    payload=json.dumps(doc,separators=(',',':'),ensure_ascii=True).encode();payload+=b' '*((-len(payload))%4)
    output=struct.pack('<4sII',b'glTF',2,20+len(payload)+len(remainder))+struct.pack('<I4s',len(payload),b'JSON')+payload+remainder
    target=new/f'candidate/original-guard-assembly-lod{lod}.glb';target.write_bytes(output)
    assert output[20+len(payload):]==remainder
    rows.append({'lod':lod,'before_sha256':sha(src),'sha256':sha(target),'updatedMeshNodes':count,'binaryChunkUnchanged':True,'binaryChunkSHA256':hashlib.sha256(remainder).hexdigest()})
for name in ['blender-pose-extrema.json','contact-front.png','contact-side.png','hurt-mid.png','walk.png']:shutil.copy2(old/'qa'/name,new/'qa'/name)
(new/'qa/source-envelope.json').write_text(json.dumps(envelope,indent=2)+'\n')
report={'status':'metadata_corrected_pending_revalidation','runtime_publish_allowed':False,'oldRun':str(old),'source_sha256':sha(source),'unchangedGeometryRigWeightsActionSignature':before,'sourceSignatureUnchanged':True,'assets':rows}
(new/'qa/metadata-only-change.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
