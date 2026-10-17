"""Locate real cuff strain and distinguish triangle quality from whole patches."""
import bpy,json,sys,hashlib,numpy as np
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_attack_probe import activate
from original_glove_deformation import evaluated
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-crossbow-cuff-motion/2026-10-07-v1'
SOURCE=ROOT/'art-factory/rts/runs/original-crossbow-articulated-hand/2026-10-07-v1/candidate/articulated-connector.blend'
if '--source' in sys.argv:SOURCE=Path(sys.argv[sys.argv.index('--source')+1])
for folder in ('raw','candidate','qa','iterations'):(RUN/folder).mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['crossbowRig20'];activate(rig,'Idle',0)
def areas(points,tri):
    p=points[tri];return np.linalg.norm(np.cross(p[:,1]-p[:,0],p[:,2]-p[:,0]),axis=1)*.5
def edges(points,tri):
    p=points[tri];return np.linalg.norm(p-np.roll(p,-1,axis=1),axis=2)
def points(obj):
    e=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=e.to_mesh()
    assert len(mesh.vertices)==len(obj.data.vertices),'Skin evaluation changed topology'
    p=np.empty(len(mesh.vertices)*3,dtype=np.float32);mesh.vertices.foreach_get('co',p);e.to_mesh_clear()
    M=np.asarray(e.matrix_world,dtype=float);return p.reshape(-1,3)@M[:3,:3].T+M[:3,3]
prepared={};result=[]
for lod in (0,1):
    obj=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'];mesh=obj.data;mesh.calc_loop_triangles();marks=mesh.attributes['ArticulatedCuffFace']
    tris=[t for t in mesh.loop_triangles if marks.data[t.polygon_index].value==1];tri=np.asarray([list(t.vertices) for t in tris]);face=np.asarray([t.polygon_index for t in tris]);base=points(obj);area=areas(base,tri);edge=edges(base,tri)
    row={'lod':lod,'samples':0,'triangle_count':len(tri),'minimum':None,'maximum':None,'quad_ratio_min':1.,'quad_ratio_max':1.,'edge_ratio_min':1.,'edge_ratio_max':1.,'minimum_temporal_normal_dot':1.};result.append(row)
    prepared[lod]=(obj,tri,face,base,area,edge,row)
for clip in ['Idle','Walk','Attack','Hurt','Death']:
    a=activate(rig,clip,0);previous={};steps=1 if '--coarse' in sys.argv else 8
    for sample in range(round(a.frame_range[1])*steps+1):
        frame=sample/steps;activate(rig,clip,frame)
        for lod,(obj,tri,face,base,area0,edge0,row) in prepared.items():
            p=points(obj);area=areas(p,tri);ratio=area/area0
            q=p[tri];normal=np.cross(q[:,1]-q[:,0],q[:,2]-q[:,0]);normal/=np.linalg.norm(normal,axis=1)[:,None]
            if lod in previous:row['minimum_temporal_normal_dot']=min(row['minimum_temporal_normal_dot'],float(np.einsum('ij,ij->i',normal,previous[lod]).min()))
            previous[lod]=normal
            edge_ratio=edges(p,tri)/edge0;row['edge_ratio_min']=min(row['edge_ratio_min'],float(edge_ratio.min()));row['edge_ratio_max']=max(row['edge_ratio_max'],float(edge_ratio.max()))
            total=np.bincount(face,weights=area);total0=np.bincount(face,weights=area0);quad=total[total0>0]/total0[total0>0]
            row['quad_ratio_min']=min(row['quad_ratio_min'],float(quad.min()));row['quad_ratio_max']=max(row['quad_ratio_max'],float(quad.max()));row['samples']+=1
            for label,index in [('minimum',int(ratio.argmin())),('maximum',int(ratio.argmax()))]:
                prior=row[label]
                if prior and ((label=='minimum' and ratio[index]>=prior['ratio']) or (label=='maximum' and ratio[index]<=prior['ratio'])):continue
                ids=tri[index];edges_now=edges(p,tri[index:index+1])[0]
                row[label]={'clip':clip,'frame':frame,'triangle_index_in_strip':index,'polygon_index':int(face[index]),'vertices':ids.tolist(),'ratio':float(ratio[index]),'base_area_m2':float(area0[index]),'posed_area_m2':float(area[index]),'base_edges_m':edge0[index].tolist(),'posed_edges_m':edges_now.tolist(),'edge_ratios':(edges_now/edge0[index]).tolist(),'base_points':base[ids].tolist(),'posed_points':p[ids].tolist(),'weights':[{obj.vertex_groups[g.group].name:g.weight for g in obj.data.vertices[int(i)].groups if g.weight>0} for i in ids]}
report={'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'rows':result,'pass':all(r['minimum']['ratio']>.25 and r['maximum']['ratio']<4 and r['minimum_temporal_normal_dot']>0 for r in result),'runtime_publish_allowed':False}
name='strain-baseline.json' if '--baseline' in sys.argv else 'strain-coarse.json' if '--coarse' in sys.argv else 'strain.json';(RUN/'qa'/name).write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n');print(json.dumps({**report,'rows':[{k:v for k,v in r.items() if k not in ('minimum','maximum')}|{'min':r['minimum']['ratio'],'max':r['maximum']['ratio']} for r in result]}))
