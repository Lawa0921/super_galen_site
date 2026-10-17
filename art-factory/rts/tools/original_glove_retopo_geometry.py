"""Build an original connected retopology using measured sculpt cross sections."""
import hashlib,json
from pathlib import Path
import numpy as np
import trimesh
from original_glove_retopo_math import radial_samples,smooth

ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-glove-retopo/2026-10-07-v1'
SOURCE=ROOT/'art-factory/rts/runs/original-glove-sculpt/2026-10-06-v1/candidate/sculpt.glb'
EXPECTED='1c6e1129c1fa00c9839ace8fd3ef1fea233740b77814a22c9b4c266744ea60b0'
ANGLES=np.deg2rad(-18-np.arange(10)*36)
NAMES=['Index','Middle','Ring','Little']

def main():
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==EXPECTED
    for folder in ['raw','candidate','qa']:(RUN/folder).mkdir(parents=True,exist_ok=True)
    high=trimesh.load(SOURCE,force='mesh',process=False)
    high.vertices=np.asarray(high.vertices)[:,[0,2,1]]*np.array([1,-1,1])
    upper=high.submesh([np.flatnonzero((high.vertices[high.faces][:,:,2]>.27).all(axis=1))],append=True)
    parts=list(upper.split(only_watertight=False));parts=[p for p in parts if len(p.vertices)>100]
    assert len(parts)==5
    thumb=min(parts,key=lambda p:p.vertices[:,1].mean())
    fingers=sorted([p for p in parts if p is not thumb],key=lambda p:p.vertices[:,0].mean(),reverse=True)
    parts=dict(zip(NAMES,fingers));parts['Thumb']=thumb
    sections={};paths={};landmarks={}
    def slice_loops(mesh,center,normal):
        section=mesh.section(plane_origin=center,plane_normal=normal)
        if section is None:raise ValueError(f'missing source section {center}')
        return [v for v in section.discrete if len(v)>5 and np.linalg.norm(v[0]-v[-1])<1e-5]
    for name,part in parts.items():
        top=float(part.vertices[:,2].max());tip=part.vertices[part.vertices[:,2]>top-.008].mean(axis=0);tip[2]=top
        zs=np.arange(.30,top-.018,.04);centers=[]
        for z in zs:
            loops=slice_loops(part,[0,0,z],[0,0,1]);loop=max(loops,key=len)
            centers.append((loop.min(axis=0)+loop.max(axis=0))/2)
        paths[name]=np.vstack([centers,tip]);landmarks[name]={'tip':tip.tolist()}
    roots={'Index':.13,'Middle':.17,'Ring':.13,'Little':.065}
    joints={'Index':[.13,.46,.68],'Middle':[.17,.50,.76],'Ring':[.13,.45,.72],'Little':[.065,.34,.56]}
    def center_at(name,z):
        path=paths[name]
        if z<path[0,2]:return path[0]+(path[1]-path[0])*(z-path[0,2])/(path[1,2]-path[0,2])
        return np.array([np.interp(z,path[:,2],path[:,axis]) for axis in range(3)])
    def frame_at(name,z):
        center=center_at(name,z);direction=center_at(name,z+.008)-center_at(name,z-.008)
        direction/=np.linalg.norm(direction)
        u=np.array([1.,0,0]);u-=direction*np.dot(u,direction);u/=np.linalg.norm(u)
        return center,direction,u,np.cross(direction,u)
    records=[]
    def source_ring(name,z):
        center,axis,u,v=frame_at(name,z)
        mesh=parts[name] if z>.37 else high
        loops=slice_loops(mesh,center,axis)
        loop=min(loops,key=lambda row:np.linalg.norm(row.mean(axis=0)-center))
        projected=np.column_stack([(loop-center)@u,(loop-center)@v])
        # Polygon area centroid, independent of marching-cubes vertex density.
        a=projected[:-1];b=projected[1:];cross=a[:,0]*b[:,1]-b[:,0]*a[:,1]
        offset=((a+b)*cross[:,None]).sum(axis=0)/(3*cross.sum())
        center+=u*offset[0]+v*offset[1];projected-=offset
        ring=radial_samples(projected,ANGLES)
        result=center+ring[:,0,None]*u+ring[:,1,None]*v
        records.append({'digit':name,'z':float(z),'center':center.tolist(),'axis':axis.tolist(),'source_section_vertices':len(loop),'width':float(np.ptp(projected[:,0])),'depth':float(np.ptp(projected[:,1]))})
        return result
    horizontal={}
    def horizontal_loops(z):
        key=round(float(z),6)
        if key not in horizontal:horizontal[key]=slice_loops(high,[0,0,key],[0,0,1])
        return horizontal[key]
    def surface_pair(x,z,guide=None):
        loops=horizontal_loops(z)
        eligible=[p for p in loops if p[:,0].min()<=x<=p[:,0].max()]
        if not eligible:
            p=min(loops,key=lambda p:min(abs(x-p[:,0].min()),abs(x-p[:,0].max())))
            x=np.clip(x,p[:,0].min()+.001,p[:,0].max()-.001);eligible=[p]
        loop=max(eligible,key=lambda p:np.ptp(p[:,0])) if guide is None else min(eligible,key=lambda p:abs(p[:,1].mean()-guide))
        a=loop[:-1];b=loop[1:];dx=b[:,0]-a[:,0]
        t=np.divide(x-a[:,0],dx,out=np.zeros(len(a)),where=abs(dx)>1e-12)
        mask=(abs(dx)>1e-12)&(t>=0)&(t<=1)
        ys=(a[:,1]+t*(b[:,1]-a[:,1]))[mask]
        if len(ys)<2:raise ValueError(f'missing palm surface pair {x,z}')
        return np.array([x,ys.min(),z]),np.array([x,ys.max(),z])
    vertices=[];faces=[];weights=[];tags=[]
    def vertex(point,skin=None,tag='palm'):
        vertices.append(np.asarray(point).tolist());weights.append(skin or {'Hand':1.});tags.append(tag);return len(vertices)-1
    def bridge(a,b):
        assert len(a)==len(b)
        for i in range(len(a)):faces.append([a[i],a[(i+1)%len(a)],b[(i+1)%len(b)],b[i]])
    def digit_skin(name,z):
        j=joints[name];tip=landmarks[name]['tip'][2]
        hand=1-smooth((z-j[0])/(.19 if name!='Little' else .16))
        a=smooth((z-j[1]+.055)/.11);b=smooth((z-j[2]+.045)/.09)
        result={'Hand':float(hand),name+'1':float((1-hand)*(1-a)),name+'2':float((1-hand)*a*(1-b)),name+'3':float((1-hand)*b)}
        return {key:value for key,value in result.items() if value>1e-8}
    # Twenty columns give each digit an independent ten-point port. Three
    # explicit strips join adjacent ports into broad U webs, not shared apices.
    topx=[];topz=[];guide=[]
    web=[.205,.212,.135]
    centers=[center_at(name,.28) for name in NAMES]
    gaps=[(centers[i][0]+centers[i+1][0])/2 for i in range(3)]
    for i,name in enumerate(NAMES):
        center=centers[i]
        right=center[0]+.114 if i==0 else gaps[i-1]-.007
        left=center[0]-.112 if i==3 else gaps[i]+.007
        edge_right=.13 if i==0 else web[i-1]
        edge_left=.065 if i==3 else web[i]
        for j,co in enumerate(np.cos(ANGLES[:5])):
            topx.append(left+(right-left)*(co/np.cos(ANGLES[0])+1)/2)
            topz.append([edge_right,roots[name]+.025,roots[name]+.035,roots[name]+.025,edge_left][j])
            guide.append(center[1])
    assert np.all(np.diff(topx)<0),'palm column order must not reverse at a digit port'
    levels=[-.695,-.635,-.53,-.42,-.31,-.20,-.08,.035,None]
    grid={};wrist_origin=np.array([-.125846717,-.125849485,-.62]);wrist_axis=np.array([.0116521903,.0607376173,.998085752]);wrist_axis/=np.linalg.norm(wrist_axis)
    wrist_u=np.array([1.,0,0]);wrist_u-=wrist_axis*np.dot(wrist_u,wrist_axis);wrist_u/=np.linalg.norm(wrist_u);wrist_v=np.cross(wrist_axis,wrist_u)
    for row,z in enumerate(levels):
        if 0<row<len(levels)-1:
            loop=max(horizontal_loops(z),key=lambda p:np.ptp(p[:,0]));low,high_x=np.quantile(loop[:,0],[.015,.985])
        for col in range(20):
            if row==0:
                angle=-.09-(np.pi-.18)*col/19
                base=wrist_origin+wrist_axis*(-.085)
                front=base+np.cos(angle)*.334895634*wrist_u+np.sin(angle)*.294486018*wrist_v
                back=base+np.cos(angle)*.334895634*wrist_u-np.sin(angle)*.294486018*wrist_v
            else:
                if z is None:x=topx[col];height=topz[col];g=guide[col]
                else:
                    fraction=(topx[col]-min(topx))/(max(topx)-min(topx));x=low+fraction*(high_x-low);height=z;g=None
                front,back=surface_pair(x,height,g)
            name=NAMES[col//5];skin=digit_skin(name,front[2]) if row==8 else None
            grid['front',row,col]=vertex(front,skin);grid['back',row,col]=vertex(back,skin)
    for side in ['front','back']:
        for row in range(8):
            for col in range(19):faces.append([grid[side,row,col],grid[side,row,col+1],grid[side,row+1,col+1],grid[side,row+1,col]])
    for col in [0,19]:
        for row in range(8):
            if col==0 and row in [2,3,4,5]:continue
            faces.append([grid['front',row,col],grid['front',row+1,col],grid['back',row+1,col],grid['back',row,col]])
    for col in [4,9,14]:faces.append([grid['front',8,col],grid['front',8,col+1],grid['back',8,col+1],grid['back',8,col]])
    bones=[{'name':'Hand','head':(wrist_origin+wrist_axis*(-.085)).tolist(),'tail':[-.10,.10,.07],'parent':None}]
    for i,name in enumerate(NAMES):
        ring=[grid['front',8,c] for c in range(i*5,i*5+5)]+[grid['back',8,c] for c in reversed(range(i*5,i*5+5))]
        tip=landmarks[name]['tip'][2];js=joints[name]+[tip]
        for k in range(3):bones.append({'name':name+str(k+1),'head':center_at(name,js[k]).tolist(),'tail':center_at(name,js[k+1]).tolist(),'parent':'Hand' if k==0 else name+str(k)})
        start=max(max(topz[i*5:i*5+5])+.045,{'Index':.295,'Middle':.302,'Ring':.257,'Little':.18}[name])
        zs=sorted(set([start,start+.045,*[v for joint in js[1:3] for v in [joint-.045,joint,joint+.045]],tip-.06,tip-.025]))
        for z in zs:
            if z<=max(topz[i*5:i*5+5])+.012 or z>=tip-.008:continue
            coords=source_ring(name,z);next_ring=[vertex(p,digit_skin(name,z),name) for p in coords];bridge(ring,next_ring);ring=next_ring
        cap=vertex(landmarks[name]['tip'],{name+'3':1.},name)
        for j in range(10):faces.append([ring[j],ring[(j+1)%10],cap])
    # Thenar port spans five independent palm rows. The bridge follows the
    # original surface by nearest-point fitting after a curved CMC transition.
    ring=[grid['front',r,0] for r in range(2,7)]+[grid['back',r,0] for r in reversed(range(2,7))]
    thumb_points=np.array([[.22,-.16,-.28],[.365,-.319,.045],[.49,-.336,.255],landmarks['Thumb']['tip']])
    for k in range(3):bones.append({'name':'Thumb'+str(k+1),'head':thumb_points[k].tolist(),'tail':thumb_points[k+1].tolist(),'parent':'Hand' if k==0 else 'Thumb'+str(k)})
    thumb_first=source_ring('Thumb',.04)
    port=np.asarray([vertices[v] for v in ring])
    # Match circular ordering to the port before creating C-shaped bridges.
    candidates=[np.roll(candidate,shift,axis=0) for candidate in [thumb_first,thumb_first[::-1]] for shift in range(10)]
    thumb_first=min(candidates,key=lambda p:np.linalg.norm(p-port,axis=1).sum())
    for t in [.25,.50,.75,1.]:
        coords=port*(1-t)+thumb_first*t
        skin={'Hand':float(1-smooth(t)), 'Thumb1':float(smooth(t))}
        next_ring=[vertex(p,{k:v for k,v in skin.items() if v>1e-8},'Thumb') for p in coords];bridge(ring,next_ring);ring=next_ring
    previous=thumb_first
    for z in [.09,.15,.20,.245,.285,.33,.365]:
        if z>=landmarks['Thumb']['tip'][2]-.012:continue
        coords=source_ring('Thumb',z)
        candidates=[np.roll(candidate,shift,axis=0) for candidate in [coords,coords[::-1]] for shift in range(10)]
        coords=min(candidates,key=lambda p:np.linalg.norm(p-previous,axis=1).sum());previous=coords
        a=float(smooth((z-.015)/.11));b=float(smooth((z-.195)/.11));skin={'Thumb1':1-a,'Thumb2':a*(1-b),'Thumb3':a*b}
        next_ring=[vertex(p,{k:v for k,v in skin.items() if v>1e-8},'Thumb') for p in coords];bridge(ring,next_ring);ring=next_ring
    cap=vertex(landmarks['Thumb']['tip'],{'Thumb3':1.},'Thumb')
    for j in range(10):faces.append([ring[j],ring[(j+1)%10],cap])
    wrist=[grid['front',0,c] for c in range(20)]+[grid['back',0,c] for c in reversed(range(20))]
    base=wrist_origin+wrist_axis*(-.085);outside=np.array([vertices[v] for v in wrist])
    ring=wrist
    for rise in [0,.035]:
        coords=base+(outside-base)*.945+wrist_axis*rise
        next_ring=[vertex(p,tag='wrist_inner') for p in coords];bridge(ring,next_ring);ring=next_ring
    origin=base;scale=.105
    data={'source_sha256':EXPECTED,'coordinate_contract':'Original left hand; Blender +Z fingers, -Y palm. Source fitted then scaled by .105 m/unit around wrist origin.','origin':origin.tolist(),'scale':scale,'vertices':((np.array(vertices)-origin)*scale).tolist(),'faces':faces,'weights':weights,'tags':tags,'bones':[{**b,'head':((np.array(b['head'])-origin)*scale).tolist(),'tail':((np.array(b['tail'])-origin)*scale).tolist()} for b in bones],'wrist_boundary':ring,'sections':records,'landmarks':landmarks,'runtime_publish_allowed':False}
    (RUN/'raw/source-fitted-cage.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'vertices':len(vertices),'triangles':sum(len(f)-2 for f in faces),'bones':len(bones),'sections':len(records)}))

if __name__=='__main__':main()
