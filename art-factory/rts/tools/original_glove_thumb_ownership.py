"""Repair thumb ownership using original high-sculpt component and mesh paths."""
import json,hashlib
from pathlib import Path
import numpy as np
import trimesh
from scipy.spatial import cKDTree
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra
from original_glove_thumb_skin import repair
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-glove-power-grip/2026-10-07-v1'
SOURCE=ROOT/'art-factory/rts/runs/original-glove-sculpt/2026-10-06-v1/candidate/sculpt.glb'
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()=='1c6e1129c1fa00c9839ace8fd3ef1fea233740b77814a22c9b4c266744ea60b0'
raw=json.loads((ROOT/'art-factory/rts/runs/original-glove-joints/2026-10-07-v1/raw/joint-surface.json').read_text());original=json.loads((ROOT/'art-factory/rts/runs/original-glove-weapon-fit/2026-10-07-v1/raw/hand.json').read_text());points=np.array(original['points']);faces=original['faces']
high=trimesh.load(SOURCE,force='mesh',process=False);high.vertices=np.asarray(high.vertices)[:,[0,2,1]]*np.array([1,-1,1])
upper=high.submesh([np.flatnonzero((high.vertices[high.faces][:,:,2]>.27).all(axis=1))],append=True);parts=[p for p in upper.split(only_watertight=False) if len(p.vertices)>100];assert len(parts)==5
thumb=min(parts,key=lambda p:p.vertices[:,1].mean());distances=cKDTree(thumb.vertices).query(np.array(raw['vertices']))[0]
thumb_seeds=np.flatnonzero((distances<.015)&(np.array(raw['vertices'])[:,2]>.29)).tolist();assert len(thumb_seeds)>15
adj=[set() for _ in points];edges=set()
for face in faces:
    for a,b in zip(face,face[1:]+face[:1]):adj[a].add(b);adj[b].add(a);edges.add(tuple(sorted((a,b))))
owners=[set() for _ in points]
for name,port in raw['ports'].items():
    collar=set(port)|{j for i in port for j in adj[i]}
    for i in collar:owners[i].add(name)
competitors=sorted({i for i,owner in enumerate(owners) if owner}|set(np.flatnonzero(points[:,2]<original['bones']['Thumb1_L']['head'][2]).tolist()))
assert not set(thumb_seeds)&set(competitors),'Thumb source seeds must be distinct from named finger collars/wrist'
rows=[];cols=[];values=[]
for a,b in sorted(edges):
    distance=float(np.linalg.norm(points[a]-points[b]));rows.extend([a,b]);cols.extend([b,a]);values.extend([distance,distance])
graph=csr_matrix((values,(rows,cols)),shape=(len(points),len(points)))
to_thumb=dijkstra(graph,directed=False,indices=thumb_seeds,min_only=True);to_other=dijkstra(graph,directed=False,indices=competitors,min_only=True);shaft=to_thumb<to_other
bands=[]
for joint,angle in [(2,55),(3,40)]:
    prior=original['bones'][f'Thumb{joint-1}_L'];bone=original['bones'][f'Thumb{joint}_L'];a=np.array(prior['tail'])-prior['head'];b=np.array(bone['tail'])-bone['head'];axis=a/np.linalg.norm(a)+b/np.linalg.norm(b);axis/=np.linalg.norm(axis)
    delta=points-bone['head'];along=delta@axis;section=shaft&(abs(along)<.003);assert section.sum()>=3
    radius=float(np.linalg.norm(delta[section]-along[section,None]*axis,axis=1).max());bands.append(1.5*radius*np.tan(np.deg2rad(angle/2))*1.15)
result=[repair(old,p,original['bones'],bool(owned),owner,bands) for old,p,owned,owner in zip(original['weights'],points,shaft,owners)]
changed=[i for i,(a,b) in enumerate(zip(original['weights'],result)) if a!=b]
assert all(not owner or not {'Thumb2_L','Thumb3_L'}&set(weights) for owner,weights in zip(owners,result))
assert all(new==old for old,new in zip(original['weights'],result) if not any(n.startswith('Thumb') for n in old))
assert all(shaft[i] or not {'Thumb2_L','Thumb3_L'}&set(weights) for i,weights in enumerate(result))
assert all(len(weights)<=4 and abs(sum(weights.values())-1)<1e-6 for weights in result)
patched={**original,'weights':result,'binding_patch':'Original high-sculpt Thumb component seeds; mesh-geodesic ownership against named four-finger port collars and wrist. Thumb joint skin follows local chain projection.'}
(RUN/'raw/hand.json').write_text(json.dumps(patched,indent=2)+'\n')
report={'status':'candidate','source_hand_sha256':original['source_sha256'],'source_sculpt_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'thumb_component_vertices':len(thumb.vertices),'thumb_source_seeds':thumb_seeds,'shaft_vertex_ids':np.flatnonzero(shaft).tolist(),'port_collars':{name:[i for i,owner in enumerate(owners) if name in owner] for name in raw['ports']},'changed_vertex_ids':changed,'before_after_examples':{str(i):{'before':original['weights'][i],'after':result[i]} for i in [914,919]},'semantic_gates_pass':True,'geometry_and_bones_changed':False,'requires_local_and_whole_motion_revalidation':True,'runtime_publish_allowed':False}
report['thumb_local_half_widths_m']=bands
report['nonthumb_foreign_distal_corrections']=[{'vertex':i,'removed':{n:v for n,v in original['weights'][i].items() if not n.startswith('Thumb') and n[-3] in ['2','3'] and n not in result[i]}} for i in changed if any(not n.startswith('Thumb') and n[-3] in ['2','3'] and n not in result[i] for n in original['weights'][i])]
assert report['nonthumb_foreign_distal_corrections']==[]
(RUN/'qa/thumb-ownership.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'changed_vertices':len(changed),'shaft_vertices':int(shaft.sum()),'source_seeds':len(thumb_seeds),'half_widths_m':bands,'port_examples':report['before_after_examples']}))
