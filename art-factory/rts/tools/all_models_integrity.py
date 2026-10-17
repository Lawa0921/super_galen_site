"""Whole registry asset, skin, track, surface and LOD acceptance."""
import json,hashlib,math,sys
from pathlib import Path
from commander_assembly_integrity import values
from procedural_gauntlet_publish import read_glb
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/all-models/2026-10-14-v1'
def main():
 manifest=json.loads((RUN/'review-manifest.json').read_bytes());rows=[];failures=[]
 for name,entry in manifest['assets'].items():
  previous=None
  for lod,key in enumerate(('url','lod1')):
   if not entry.get(key):continue
   baseline=ROOT/'public'/entry[key].lstrip('/');candidate=RUN/'candidate'/baseline.name;file=candidate if candidate.exists()else baseline
   doc,raw=read_glb(file);old,oldraw=read_glb(baseline);tris=draws=vertices=0;max_error=0
   try:
    assert sorted(a['name']for a in doc.get('animations',[]))==sorted(a['name']for a in old.get('animations',[])),'Clip coverage changed'
    bones=[[doc['nodes'][j]['name']for j in skin['joints']]for skin in doc.get('skins',[])]
    assert sorted(map(len,bones))==sorted(len(s['joints'])for s in old.get('skins',[])),'Rig count changed'
    for skin in doc.get('skins',[]):
     assert len(set(skin['joints']))==len(skin['joints']),'Duplicate joints'
     assert len(values(doc,raw,skin['inverseBindMatrices']))==len(skin['joints'])
    for node in doc['nodes']:
     if 'mesh'not in node:continue
     skin=doc['skins'][node['skin']]if 'skin'in node else None
     for p in doc['meshes'][node['mesh']]['primitives']:
      attrs=p['attributes'];count=doc['accessors'][attrs['POSITION']]['count'];vertices+=count;draws+=1;tris+=(doc['accessors'][p['indices']]['count']if 'indices'in p else count)//3
      for attribute,index in attrs.items():assert all(math.isfinite(x)for row in values(doc,raw,index)for x in row),(node['name'],attribute,'non-finite')
      if skin:
       weights=values(doc,raw,attrs['WEIGHTS_0']);joints=values(doc,raw,attrs['JOINTS_0'])
       assert len(weights)==len(joints)==count
       for w,j in zip(weights,joints):
        assert all(x>=0 for x in w);error=abs(sum(w)-1);max_error=max(max_error,error);assert error<1e-5,'Unnormalized skin weights'
        assert all(0<=i<len(skin['joints'])for i in j),'Joint out of range'
      material=doc['materials'][p['material']]
      # Three supports cotangent-frame derivatives for authored assets without
      # exported tangents. Normals and UVs are required in either path.
      if 'normalTexture'in material:assert 'NORMAL'in attrs and 'TEXCOORD_0'in attrs,(node['name'],'missing normal-map inputs')
    for a in doc.get('animations',[]):
     original=next(x for x in old['animations']if x['name']==a['name'])
     duration=max(values(doc,raw,s['input'])[-1][0]for s in a['samplers']);old_duration=max(values(old,oldraw,s['input'])[-1][0]for s in original['samplers']);assert abs(duration-old_duration)<1e-5,(a['name'],'retimed')
     for s in a['samplers']:
      times=[r[0]for r in values(doc,raw,s['input'])];assert all(b>a for a,b in zip(times,times[1:])),'Non-increasing keys'
      assert all(math.isfinite(v)for r in values(doc,raw,s['output'])for v in r),'Non-finite animation'
    for im in doc.get('images',[]):
     if 'uri'in im and not im['uri'].startswith('data:'):assert (baseline.parent/im['uri']).is_file(),('Missing material',im['uri'])
    if name in ('worker','crossbow','guard'):
     assert (4000 if lod else 8000)<tris<=(10000 if lod else 20000),(name,lod,'Infantry release triangle budget',tris)
    if previous is not None:assert tris<previous,(name,'LOD does not reduce geometry')
    previous=tris
   except AssertionError as e:failures.append({'id':name,'lod':lod,'error':str(e)})
   rows.append({'id':name,'lod':lod,'file':file.relative_to(ROOT).as_posix(),'candidate':candidate.exists(),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'bytes':file.stat().st_size,'triangles':tris,'draws':draws,'weighted_vertices':vertices if bones else 0,'bones':list(map(len,bones)),'clips':[a['name']for a in doc.get('animations',[])],'max_weight_sum_error':max_error})
 report={'status':'failed'if failures else 'passed','models':len(manifest['assets']),'files':len(rows),'rows':rows,'failures':failures};(RUN/'qa/integrity.json').write_bytes((json.dumps(report,indent=2)+'\n').encode());print(json.dumps({k:v for k,v in report.items()if k!='rows'}));assert not failures
if __name__=='__main__':main()
