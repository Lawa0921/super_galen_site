"""Reconstruct original finger joint annuli from actual sculpt contours."""
import hashlib,json,math
from pathlib import Path
import numpy as np
import trimesh
from original_glove_retopo_math import radial_samples
from original_glove_joint_math import bridge_loops

ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-glove-joints/2026-10-07-v1'
SOURCE=ROOT/'art-factory/rts/runs/original-glove-sculpt/2026-10-06-v1/candidate/sculpt.glb'
EXPECTED='1c6e1129c1fa00c9839ace8fd3ef1fea233740b77814a22c9b4c266744ea60b0'
NAMES=['Index','Middle','Ring','Little'];N=12

def centroid(loop):
    xy=loop[:,:2];nxt=np.roll(xy,-1,axis=0);cross=xy[:,0]*nxt[:,1]-nxt[:,0]*xy[:,1]
    area=cross.sum()/2
    assert abs(area)>1e-8
    center=np.r_[((xy+nxt)*cross[:,None]).sum(axis=0)/(6*area),loop[:,2].mean()]
    return center,area

def main():
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==EXPECTED
    base=json.loads((RUN/'raw/palm-with-ports.json').read_text());vertices=base['vertices'];faces=base['faces']
    high=trimesh.load(SOURCE,force='mesh',process=False);high.vertices=np.asarray(high.vertices)[:,[0,2,1]]*np.array([1,-1,1])
    upper=high.submesh([np.flatnonzero((high.vertices[high.faces][:,:,2]>.27).all(axis=1))],append=True)
    parts=[p for p in upper.split(only_watertight=False) if len(p.vertices)>100];assert len(parts)==5
    thumb=min(parts,key=lambda p:p.vertices[:,1].mean())
    parts=dict(zip(NAMES,sorted([p for p in parts if p is not thumb],key=lambda p:p.vertices[:,0].mean(),reverse=True)))
    guides={'Index':[.46,.68],'Middle':[.50,.76],'Ring':[.45,.72],'Little':[.34,.56]}
    records={};tags=['preserved-base']*len(vertices)
    for name in NAMES:
        mesh=parts[name];port=base['ports'][name];coords=np.asarray([vertices[i] for i in port]);center,area=centroid(coords)
        if area<0:port=port[::-1]
        angles=np.array([math.atan2(vertices[i][1]-center[1],vertices[i][0]-center[0]) for i in port])
        start=int(np.argmin(abs(angles)));port=port[start:]+port[:start]
        coords=np.asarray([vertices[i] for i in port]);lengths=np.linalg.norm(np.roll(coords,-1,axis=0)-coords,axis=1);assert np.all(lengths>1e-8)
        # A real cut boundary may be locally concave. Preserve its actual edge
        # order and use perimeter distance, not a star-shaped angular premise.
        phase=math.atan2(coords[0,1]-center[1],coords[0,0]-center[0]);parameters=(np.r_[0,np.cumsum(lengths[:-1])]/lengths.sum()).tolist()
        uniform=np.arange(N)/N;sample_angles=phase+uniform*2*np.pi
        top=float(mesh.vertices[:,2].max());tip=mesh.vertices[mesh.vertices[:,2]>top-.006].mean(axis=0);tip[2]=top
        cut=base['cut_heights'][name];first=cut+.03
        supports=[.025,.035] if name=='Little' else [.04,.04]
        joint_heights=guides[name];zs=[first,top-.045,top-.018]
        for z,width in zip(joint_heights,supports):zs.extend([z-width,z,z+width])
        zs=sorted(set(round(z,6) for z in zs if first-1e-6<=z<top-.009))
        expanded=[zs[0]]
        for z in zs[1:]:
            previous=expanded[-1]
            if z-previous>.09:expanded.append((z+previous)/2)
            expanded.append(z)
        ring_records=[];last=port;last_parameters=parameters
        for z in expanded:
            section=mesh.section(plane_origin=[0,0,z],plane_normal=[0,0,1]);assert section is not None
            closed=[p[:-1] for p in section.discrete if len(p)>5 and np.linalg.norm(p[0]-p[-1])<1e-5];assert len(closed)==1,(name,z,len(closed))
            loop=closed[0];origin,area=centroid(loop)
            xy=radial_samples(np.vstack([loop[:,:2]-origin[:2],loop[0,:2]-origin[:2]]),sample_angles)
            points=np.column_stack([xy+origin[:2],np.full(N,z)])
            ids=list(range(len(vertices),len(vertices)+N));vertices.extend(points.tolist());tags.extend([name]*N)
            faces.extend(bridge_loops(last,ids,last_parameters,uniform.tolist()));last=ids;last_parameters=uniform.tolist()
            ring_records.append({'z':z,'center':origin.tolist(),'indices':ids,'source_section_vertices':len(loop),'section_area':abs(area),'is_joint':any(abs(z-j)<1e-6 for j in joint_heights),'local_axis_reference':'centerline between adjacent source-section area centroids; horizontal contour plane is not itself the hinge axis'})
        apex=len(vertices);vertices.append(tip.tolist());tags.append(name)
        faces.extend([[last[i],last[(i+1)%N],apex] for i in range(N)])
        records[name]={'port':port,'cut_height':cut,'rings':ring_records,'tip':tip.tolist(),'joint_guides_z':joint_heights,'note':'Z guides identify intended joint bands; actual center is measured from each original contour. Bind and flexion remain to be validated.'}
    result={**base,'sculpt_sha256':EXPECTED,'vertices':vertices,'faces':faces,'tags':tags,'digits':records,'stage':'Four-finger source-contour joint topology; original palm/CMC retained. No rig or animation yet.','runtime_publish_allowed':False}
    (RUN/'raw/joint-surface.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'vertices':len(vertices),'triangles':sum(len(f)-2 for f in faces),'joint_rings':sum(sum(r['is_joint'] for r in d['rings']) for d in records.values()),'finger_rings':{k:len(v['rings']) for k,v in records.items()},'protected_vertices':base['protected_source_vertices']}))

if __name__=='__main__':main()
