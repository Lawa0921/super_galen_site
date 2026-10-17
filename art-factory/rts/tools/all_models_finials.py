"""Deepen existing finial socket joints; retain original staged GLB payload."""
import bpy,sys,json,struct,hashlib,copy
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from procedural_gauntlet_publish import read_glb
from commander_assembly_integrity import values
from building_rubble_build import write_glb
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/all-models/2026-10-14-v1'
def key(v):return tuple(round(float(x),5)for x in v)
def main(name,check=False):
 row=next(r for r in json.loads((ROOT/'art-factory/rts/manifests/building-registry.json').read_bytes())['assets']if r['id']==name)
 bpy.ops.wm.open_mainfile(filepath=str(ROOT/row['source']));finials=[o for o in bpy.data.objects if o.type=='MESH'and o.name.startswith('Tower gilded finial')];assert len(finials)==(2 if name.endswith('2')else 4)
 before=[];points=set()
 for obj in finials:
  world=[obj.matrix_world@v.co for v in obj.data.vertices];z=min(p.z for p in world);x,y=obj.matrix_world.translation.xy
  near=[o.matrix_world@v.co for o in bpy.data.objects if o.type=='MESH'and o not in finials for v in o.data.vertices if ((o.matrix_world@v.co).xy-obj.matrix_world.translation.xy).length<.10]
  assert near,(obj.name,'no supporting roof apex');apex=max(p.z for p in near);gap=z-apex;before.append({'object':obj.name,'gap_m':gap,'stage':obj['rtsConstructionStage']})
  points.update(key((p.x,p.z,-p.y))for p in world)
 (RUN/f'qa/{name}-finial-before.json').write_bytes((json.dumps(before,indent=2)+'\n').encode())
 if check:assert all(r['gap_m']<=-.03 for r in before),before;return
 for obj in finials:obj.location.z-=.03
 bpy.context.view_layer.update();source=RUN/f'raw/{name}-finials.blend';bpy.ops.wm.save_as_mainfile(filepath=str(source))
 original=ROOT/'public/assets/games/rts/models'/f'{name}.glb';doc,raw=read_glb(original);new=bytearray(raw);changed=[];seen=set();allow=set()
 for mesh in doc['meshes']:
  for p in mesh['primitives']:
   index=p['attributes']['POSITION']
   if index in seen:continue
   seen.add(index);acc=doc['accessors'][index];view=doc['bufferViews'][acc['bufferView']];assert acc['componentType']==5126 and acc['type']=='VEC3'
   rows=values(doc,raw,index);count=0
   for i,v in enumerate(rows):
    if key(v)in points:
     offset=view.get('byteOffset',0)+acc.get('byteOffset',0)+i*view.get('byteStride',12)+4
     struct.pack_into('<f',new,offset,v[1]-.03);allow.update(range(offset,offset+4));count+=1
   if count:
    updated=values(doc,new,index);acc['min']=[min(v[k]for v in updated)for k in range(3)];acc['max']=[max(v[k]for v in updated)for k in range(3)];changed.append({'accessor':index,'vertices':count})
 assert changed and all(i in allow for i,(a,b)in enumerate(zip(raw,new))if a!=b),'Unexpected binary mutation'
 out=RUN/f'candidate/{name}.glb';write_glb(out,doc,bytes(new))
 report={'id':name,'source':str(source.relative_to(ROOT)),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'candidate_sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'before':before,'after':[dict(r,gap_m=r['gap_m']-.03)for r in before],'changed':changed,'only_finial_y_floats_changed':True,'normal_uv_index_material_extras_unchanged':True,'original':row['source']}
 (RUN/f'qa/{name}-finial.json').write_bytes((json.dumps(report,indent=2)+'\n').encode());print(json.dumps(report));assert all(r['gap_m']<=-.03 for r in report['after'])
if __name__=='__main__':
 args=sys.argv[sys.argv.index('--')+1:];main(args[0],'--check-baseline'in args)
