"""Original continuous leather glove sculpture on the preserved v6 finger bind."""
import math
from original_glove_geometry import DIGITS,SECTION,add,sub,mul,lerp,unit,smooth,cage as baseline

def bell(value,center,width):return math.exp(-((value-center)/width)**2)

def refine_palm(vertices,faces,weights,tags):
    """Add connected control quads only where the palm needs sculpt detail.

    Neighbour polygons inherit split edge vertices, keeping single-cycle links
    at the original thumb port and finger roots without a disconnected patch.
    """
    selected=[];edges={}
    for index,face in enumerate(faces):
        points=[vertices[i] for i in face];z=sum(p[2] for p in points)/len(points)
        if len(face)==4 and all(tags[i]=='palm' for i in face) and all(p[1]<0 for p in points) and .010<z<.075:
            selected.append(index)
            for a,b in zip(face,face[1:]+face[:1]):edges[tuple(sorted((a,b)))]=None
    def average(ids):
        co=tuple(sum(vertices[i][axis] for i in ids)/len(ids) for axis in range(3));w={}
        for i in ids:
            for name,value in weights[i].items():w[name]=w.get(name,0)+value/len(ids)
        vertices.append(co);weights.append(w);tags.append('palm');return len(vertices)-1
    for edge in edges:edges[edge]=average(edge)
    output=[];selected=set(selected)
    for index,face in enumerate(faces):
        if index in selected:
            center=average(face)
            for j,v in enumerate(face):output.append((v,edges[tuple(sorted((v,face[(j+1)%len(face)])))],center,edges[tuple(sorted((face[j-1],v)))]))
        else:
            expanded=[]
            for a,b in zip(face,face[1:]+face[:1]):
                expanded.append(a)
                if tuple(sorted((a,b))) in edges:expanded.append(edges[tuple(sorted((a,b)))])
            output.append(tuple(expanded))
    faces[:]=output
    for i,(x,y,z) in enumerate(vertices):
        if tags[i]!='palm' or y>=0 or z<=0:continue
        # Keep the outer thumb attachment and wrist fixed. Sculpted palm pads
        # are now sampled by real control rows, rather than a sparse bump.
        edge_fade=smooth((.037-abs(x))/.014)*smooth(z/.014)*(1-smooth((z-.069)/.006))
        relief=.0050*bell(x,-.022,.012)*bell(z,.027,.017)
        relief+=.0035*bell(x,.025,.009)*bell(z,.035,.021)
        relief+=.0026*bell(x,-.005,.028)*bell(z,.063,.007)
        relief-=.0022*bell(x,.003,.014)*bell(z,.038,.016)
        vertices[i]=(x,y-relief*edge_fade,z)

def cage():
    vertices=[];faces=[];weights=[];tags=[];tips={};grid={}
    def vertex(co,w=None,tag='palm'):
        vertices.append(tuple(co));weights.append(w or {'Hand':1});tags.append(tag);return len(vertices)-1
    def strip(a,b):
        assert len(a)==len(b)
        for j in range(len(a)):faces.append((a[j],a[(j+1)%len(a)],b[(j+1)%len(b)],b[j]))
    # Separate finger boundaries leave a real 5mm web floor, not one V apex.
    top_x=[-.040,-.030,-.0225,-.0175,-.010,-.0025,.0025,.010,.0175,.0225,.028,.036]
    levels=[(-.029,.026,.019),(-.027,.027,.020),(-.023,.027,.020),(-.020,.0255,.017),(-.006,.024,.015),(.014,.030,.015),(.032,.038,.016),(.053,.039,.015),(.069,.0385,.013),(.073,.038,.0125),(.075,.038,.012)]
    top=len(levels)-1;cols=len(top_x)
    for surface in ['palm','back']:
        sign=-1 if surface=='palm' else 1
        for row,(z,width,depth) in enumerate(levels):
            for col in range(cols):
                norm=2*(top_x[col]-top_x[0])/(top_x[-1]-top_x[0])-1
                x=top_x[col] if row==top else norm*width-.002*smooth((z-.053)/.022)
                y=sign*depth*(.78+.22*math.cos(norm*math.pi/2))
                if surface=='back' and z>0:
                    y+=.0018*bell(x,0,.030)*bell(z,.043,.025)*math.sin(math.pi*col/(cols-1))
                if z>=.053:
                    # Approach the finger-root section gradually. An abrupt
                    # 2-3.5mm depth change in the final 2mm made a false ridge.
                    target=sign*(.012 if col%3==1 else .009)
                    y+=(target-y)*smooth((z-.053)/.022)
                grid[surface,row,col]=vertex((x,y,z))
        for row in range(top):
            for col in range(cols-1):faces.append(tuple(grid[surface,r,c] for r,c in [(row,col),(row,col+1),(row+1,col+1),(row+1,col)]))
    for col in [0,cols-1]:
        for row in range(top):
            if col==0 and row in [5,6]:continue
            faces.append((grid['palm',row,col],grid['palm',row+1,col],grid['back',row+1,col],grid['back',row,col]))
    faces.append(tuple([grid['palm',0,c] for c in range(cols)]+[grid['back',0,c] for c in reversed(range(cols))]))
    for col in [2,5,8]:faces.append((grid['palm',top,col],grid['palm',top,col+1],grid['back',top,col+1],grid['back',top,col]))
    wrist=[i for i,p in enumerate(vertices) if p[2]<=0]
    for finger,(name,x,segments,radius) in enumerate(DIGITS):
        col=finger*3;ring=[grid['palm',top,col],grid['palm',top,col+1],grid['palm',top,col+2],grid['back',top,col+2],grid['back',top,col+1],grid['back',top,col]]
        root_section=[vertices[i] for i in ring]
        joints=[0,segments[0],segments[0]+segments[1],sum(segments)]
        midpoints=[(a+b)/2 for a,b in zip(joints,joints[1:])]
        def skin(z):
            hand=1-smooth(z/.024);a=smooth((z-joints[1]+.012)/.024);b=smooth((z-joints[2]+.009)/.018)
            ws={'Hand':hand,f'{name}1':(1-hand)*(1-a),f'{name}2':(1-hand)*a*(1-b),f'{name}3':(1-hand)*b}
            return {k:v for k,v in ws.items() if v>1e-8}
        positions=sorted(set([.0015,.003,.006,.010,.014,*midpoints,joints[1]-.005,joints[1],joints[1]+.005,joints[2]-.004,joints[2],joints[2]+.004,joints[3]-.007,joints[3]-.004,joints[3]-.002,joints[3]]))
        for z in positions:
            t=z/joints[3];r=radius*(1-.33*t);joint=bell(z,joints[1],.005)+.70*bell(z,joints[2],.004)
            pad=max(bell(z,m,.007) for m in midpoints)
            end_distance=joints[3]-z;cap=1 if end_distance>=.007 else .55+.45*math.sin((end_distance/.007)*math.pi/2)
            rx=r*(1-.035*pad+.025*joint)*cap
            coords=[]
            for u,v in SECTION:
                if v<0:y=v*(r*(.94-.10*joint)+.0008*pad)*cap
                else:y=v*(r*.89+.0012*joint)*cap
                if end_distance<.007:y-=.0007*math.sin(end_distance/.007*math.pi)
                coords.append((x+u*rx,y,.075+z))
            # Match the almost vertical palm tangent before narrowing into
            # the finger. The previous first ring contracted by up to 5.4mm
            # in 6mm, creating a transverse shoulder independent of topology.
            blend=smooth(z/.014)
            coords=[lerp((root[0],root[1],.075+z),co,blend) for root,co in zip(root_section,coords)]
            next_ring=[vertex(co,skin(z),name) for co in coords];strip(ring,next_ring);ring=next_ring
        end=vertex((x,-.0003,.075+joints[3]+.0015),skin(joints[3]),name)
        tips[name]=ring+[end]
        for j in range(len(ring)):faces.append((ring[(j+1)%len(ring)],ring[j],end))
    # Keep the validated thenar bridge and thumb bind; only sculpt the pad/tip.
    ring=[grid['palm',r,0] for r in [5,6,7]]+[grid['back',r,0] for r in [7,6,5]]
    thumb=[(-.034,0,.029),(-.062,-.004,.062),(-.0746,-.0058,.077),(-.083,-.007,.087)]
    port=ring.copy();t=.86;axis=unit(sub(thumb[1],thumb[0]));u=unit((axis[2],0,-axis[0]));v=(0,1,0)
    center=lerp(thumb[0],thumb[1],t);radius=.015-.0035*t
    bridge_end=[add(center,add(mul(u,a*radius),mul(v,b*radius*.90))) for a,b in SECTION]
    for fraction in [.25,.50,.75]:
        weight=smooth(fraction);next_ring=[vertex(lerp(vertices[p],q,fraction),{'Hand':1-weight,'Thumb1':weight},'Thumb') for p,q in zip(port,bridge_end)];strip(ring,next_ring);ring=next_ring
    for t in [.86,1,1.14,1.30,1.45,1.60,1.75,1.87,1.94,2]:
        start,end,q=(thumb[0],thumb[1],t) if t<=1 else (thumb[1],thumb[3],t-1)
        center=lerp(start,end,q);axis=unit(sub(end,start));u=unit((axis[2],0,-axis[0]));v=(0,1,0)
        radius=.015-.0035*t;cap=1 if t<=1.80 else .55+.45*math.sin((2-t)/.20*math.pi/2)
        proximal=smooth((t-.72)/.56);distal=smooth((t-1.30)/.60)
        w={'Thumb1':1-proximal,'Thumb2':proximal*(1-distal),'Thumb3':proximal*distal};w={k:value for k,value in w.items() if value>1e-8}
        next_ring=[]
        for a,b in SECTION:
            palmar_pad=.0005*bell(t,1.72,.15) if b<0 else 0
            co=add(center,add(mul(u,a*radius*cap),mul(v,b*(radius*.90+palmar_pad)*cap)))
            next_ring.append(vertex(co,w,'Thumb'))
        strip(ring,next_ring);ring=next_ring
    end=vertex(add(thumb[3],add(mul(unit(sub(thumb[3],thumb[2])),.0012),(0,-.0003,0))),{'Thumb3':1},'Thumb')
    tips['Thumb']=ring+[end]
    for j in range(len(ring)):faces.append((ring[(j+1)%len(ring)],ring[j],end))
    refine_palm(vertices,faces,weights,tags)
    return {'vertices':vertices,'faces':faces,'weights':weights,'tags':tags,'bones':baseline()['bones'],'wrist':wrist,'tips':tips,'source':'Original continuous glove surface sculpture: broad webs, directional pads and integrated cuff; preserved original v6 bind'}
