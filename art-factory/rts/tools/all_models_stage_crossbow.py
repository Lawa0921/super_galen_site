"""Import editable crossbow source and losslessly reuse existing encoded textures."""
import sys,json,shutil,hashlib
from pathlib import Path
from procedural_gauntlet_publish import read_glb,write_glb
from unit_shared_textures import externalize_images,verify_externalization
ROOT=Path(__file__).resolve().parents[3]
REL=Path('art-factory/rts/runs/all-models/2026-10-14-crossbow')
RUN=ROOT/'art-factory/rts/runs/all-models/2026-10-14-v1'
def main(other):
 known={hashlib.sha256(p.read_bytes()).hexdigest():p for p in (ROOT/'public/assets/games/rts/materials').rglob('*')if p.is_file()}
 records=[]
 for name in ('final/raw/crossbow-assembly.blend','final/qa/crossbow-finalize.json'):
  target=ROOT/REL/name;target.parent.mkdir(parents=True,exist_ok=True)
  if (other/REL/name).resolve()!=target.resolve():shutil.copy2(other/REL/name,target)
 for lod in (0,1):
  source=other/REL/f'final/raw/crossbow-edited-lod{lod}.glb';dest=ROOT/REL/f'final/raw/crossbow-edited-lod{lod}.glb'
  if source.resolve()!=dest.resolve():shutil.copy2(source,dest)
  d,b=read_glb(dest);o,ob,images=externalize_images(d,b);blob=bytearray(ob);remain=dict(images);embedded=[];reused=[]
  for item in o['images']:
   uri=item['uri'];data=images[uri];digest=hashlib.sha256(data).hexdigest()
   if digest not in known:
    blob.extend(b'\0'*((-len(blob))%4));item['bufferView']=len(o['bufferViews']);o['bufferViews'].append({'buffer':0,'byteOffset':len(blob),'byteLength':len(data)});blob.extend(data);del item['uri'];del remain[uri];embedded.append(item['name'])
  o['buffers'][0]['byteLength']=len(blob);verify_externalization(d,b,o,bytes(blob),remain)
  for item in o['images']:
   if 'uri' in item:
    raw=remain[item['uri']];path=known[hashlib.sha256(raw).hexdigest()];assert path.read_bytes()==raw
    item['uri']='../materials/'+path.relative_to(ROOT/'public/assets/games/rts/materials').as_posix();reused.append(item['name'])
  out=RUN/f'candidate/crossbow{"-lod1"if lod else""}.glb';write_glb(out,o,bytes(blob))
  candidate=other/REL/f'final/candidate/{out.name}';candidate.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(out,candidate)
  records.append({'lod':lod,'file':out.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'embedded_sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'lossless_verified':True,'reused_images':reused,'retained_embedded_images':embedded})
 for name in ('crossbow_rig_rebuild_blender.py','crossbow_clearance.py','crossbow_carry_refine.py','crossbow_death.py','crossbow_finalize.py','crossbow_glb_acceptance_blender.py'):
  source=other/'art-factory/rts/tools'/name;target=ROOT/'art-factory/rts/tools'/name
  if source.resolve()!=target.resolve():shutil.copy2(source,target)
 (RUN/'qa/crossbow-externalization.json').write_text(json.dumps(records,indent=2)+'\n',encoding='utf8')
 print(json.dumps([{'lod':r['lod'],'sha256':r['sha256']}for r in records]))
if __name__=='__main__':main(Path(sys.argv[1]).resolve()if len(sys.argv)>1 else ROOT)
