"""Continuous UV triangle overlap gate, including shared-edge foldovers."""
import bpy,hashlib,json,sys
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_drape_uv import RUN,charts

EPS=1e-12
def cross(a,b):return a[0]*b[1]-a[1]*b[0]
def signed(points):return sum(cross(a,b) for a,b in zip(points,np.roll(points,-1,axis=0)))/2
def intersection(a,b):
    output=list(a)
    if signed(b)<0:b=b[::-1]
    for start,end in zip(b,np.roll(b,-1,axis=0)):
        incoming=output;output=[]
        if not incoming:break
        previous=incoming[-1];old=cross(end-start,previous-start)
        for point in incoming:
            distance=cross(end-start,point-start)
            if (distance>=-EPS)!=(old>=-EPS):output.append(previous+(point-previous)*old/(old-distance))
            if distance>=-EPS:output.append(point)
            previous=point;old=distance
    return abs(signed(np.asarray(output))) if len(output)>=3 else 0

def inspect(body):
    mesh=body.data;rows=[]
    for p in mesh.polygons:
        if p.material_index!=1:continue
        uv=np.asarray([list(mesh.uv_layers.active.data[i].uv) for i in p.loop_indices],dtype=np.float64)
        assert uv.shape==(3,2)
        rows.append((p.index,uv,uv.min(axis=0),uv.max(axis=0),set(p.vertices)))
    active=[];positive=[];candidates=shared=0
    for row in sorted(rows,key=lambda r:r[2][0]):
        active=[r for r in active if r[3][0]>=row[2][0]-EPS]
        for other in active:
            if other[3][1]<row[2][1]-EPS or row[3][1]<other[2][1]-EPS:continue
            candidates+=1;shared+=len(row[4]&other[4])==2
            area=intersection(row[1],other[1])
            if area>EPS:positive.append({'faces':[row[0],other[0]],'area_uv2':area})
        active.append(row)
    chart_ids,_,_=charts(mesh);orientations={}
    for row in rows:orientations.setdefault(chart_ids[row[0]],set()).add(1 if signed(row[1])>0 else -1)
    return {'triangles':len(rows),'aabb_pairs_checked':candidates,'shared_edge_pairs_checked':shared,'positive_overlaps':positive,'chart_count':len(orientations),'mixed_chart_orientations':sum(len(s)>1 for s in orientations.values()),'zero_area':int(sum(abs(signed(r[1]))<=EPS for r in rows)),'minimum_uv_triangle_area':float(min(abs(signed(r[1])) for r in rows))}

def main():
    a=np.array([[0.,0.],[1,0],[0,1]])
    assert abs(intersection(a,a)-.5)<EPS
    assert intersection(a,np.array([[1.,0.],[1,1],[0,1]]))<=EPS
    assert intersection(a,a+2)<=EPS
    assert intersection(a,np.array([[0.,0.],[.00002,0],[0,.00002]]))>EPS
    source=RUN/'candidate/original-crossbow-grip.blend';bpy.ops.wm.open_mainfile(filepath=str(source))
    rows=[{'lod':lod,**inspect(bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'])} for lod in (0,1)]
    result={'candidate_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'coordinate_epsilon_uv':EPS,'area_threshold_uv2':EPS,'controls_passed':4,'rows':rows,'pass':all(not r['positive_overlaps'] and r['mixed_chart_orientations']==r['zero_area']==0 for r in rows),'runtime_publish_allowed':False}
    (RUN/'qa/continuous-uv.json').write_text(json.dumps(result,indent=2)+'\n');print('CONTINUOUS_UV',json.dumps(result));assert result['pass']
if __name__=='__main__':main()
