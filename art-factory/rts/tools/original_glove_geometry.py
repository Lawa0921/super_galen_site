"""Original continuous glove cage; every digit branches from the palm surface.

Coordinates are metres: X across the palm, -Y palm side, +Z fingertips.
No external hand, rig or motion is used. This is an editable art candidate.
"""
import math

def add(a,b):return tuple(x+y for x,y in zip(a,b))
def sub(a,b):return tuple(x-y for x,y in zip(a,b))
def mul(a,t):return tuple(x*t for x in a)
def lerp(a,b,t):return add(mul(a,1-t),mul(b,t))
def length(a):return math.sqrt(sum(x*x for x in a))
def unit(a):return mul(a,1/length(a))
def smooth(t):t=max(0,min(1,t));return t*t*(3-2*t)

DIGITS=[('Index',-.030,(.032,.022,.018),.0095),('Middle',-.010,(.036,.025,.019),.0100),('Ring',.010,(.033,.024,.018),.0090),('Little',.028,(.025,.019,.016),.0075)]
SECTION=[(-.8660254,-.5),(0,-1),(.8660254,-.5),(.8660254,.5),(0,1),(-.8660254,.5)]

def cage():
    vertices=[];faces=[];weights=[];tags=[];bones=[{'name':'Hand','head':(0,0,0),'tail':(0,0,.060),'parent':None}];tips={}
    def vertex(co,w=None,tag='palm'):
        vertices.append(tuple(co));weights.append(w or {'Hand':1});tags.append(tag);return len(vertices)-1
    def strip(a,b):
        assert len(a)==len(b)
        for j in range(len(a)):faces.append((a[j],a[(j+1)%len(a)],b[(j+1)%len(b)],b[j]))
    # Both broad surfaces are one cage, with a thumb port in the radial side.
    levels=[(-.026,.025,.017),(-.022,.027,.018),(-.006,.024,.015),(.014,.030,.015),(.032,.038,.016),(.053,.039,.015),(.075,.038,.012)]
    top_x=[-.040,-.030,-.020,-.010,0,.010,.020,.028,.036]
    grid={}
    for surface in ['palm','back']:
        sign=-1 if surface=='palm' else 1
        for row,(z,width,depth) in enumerate(levels):
            for col in range(9):
                norm=(col-4)/4;x=top_x[col] if row==6 else norm*width
                y=sign*depth*(.78+.22*math.cos(norm*math.pi/2))
                if surface=='palm':y-=.003*math.exp(-((norm+.55)/.40)**2-((z-.032)/.025)**2)
                if row==6:y=sign*(.009 if col%2==0 else .012)
                grid[surface,row,col]=vertex((x,y,z))
        for row in range(6):
            for col in range(8):faces.append(tuple(grid[surface,r,c] for r,c in [(row,col),(row,col+1),(row+1,col+1),(row+1,col)]))
    for col in [0,8]:
        for row in range(6):
            if col==0 and row in [3,4]:continue
            faces.append((grid['palm',row,col],grid['palm',row+1,col],grid['back',row+1,col],grid['back',row,col]))
    cap=[grid['palm',0,c] for c in range(9)]+[grid['back',0,c] for c in reversed(range(9))];faces.append(tuple(cap))
    wrist=[i for i,p in enumerate(vertices) if p[2]<=0]
    for finger,(name,x,segments,radius) in enumerate(DIGITS):
        col=finger*2;ring=[grid['palm',6,col],grid['palm',6,col+1],grid['palm',6,col+2],grid['back',6,col+2],grid['back',6,col+1],grid['back',6,col]]
        joints=[0,segments[0],segments[0]+segments[1],sum(segments)]
        for i in range(3):bones.append({'name':f'{name}{i+1}','head':(x,0,.075+joints[i]),'tail':(x,0,.075+joints[i+1]),'parent':'Hand' if i==0 else f'{name}{i}'})
        def skin(z):
            hand=1-smooth(z/.024)
            a=smooth((z-joints[1]+.012)/.024);b=smooth((z-joints[2]+.009)/.018)
            ws={'Hand':hand,f'{name}1':(1-hand)*(1-a),f'{name}2':(1-hand)*a*(1-b),f'{name}3':(1-hand)*b}
            return {k:v for k,v in ws.items() if v>1e-8}
        positions=sorted(set([.008,joints[1]-.005,joints[1],joints[1]+.005,joints[2]-.004,joints[2],joints[2]+.004,joints[3]-.004,joints[3]]))
        for z in positions:
            t=z/joints[3];r=radius*(1-.33*t)
            r+=radius*.065*(math.exp(-((z-joints[1])/.004)**2)+math.exp(-((z-joints[2])/.0035)**2))
            if z==joints[3]:r*=.50
            next_ring=[vertex((x+u*r,v*r*1.08,.075+z),skin(z),name) for u,v in SECTION];strip(ring,next_ring);ring=next_ring
        tips[name]=ring.copy();faces.append(tuple(reversed(ring)))
    # Thumb web shares the palm boundary; no isolated capsules or overlap union.
    ring=[grid['palm',r,0] for r in [3,4,5]]+[grid['back',r,0] for r in [5,4,3]]
    thumb=[(-.034,0,.029),(-.062,-.004,.062),(-.0746,-.0058,.077),(-.083,-.007,.087)]
    for i in range(3):bones.append({'name':f'Thumb{i+1}','head':thumb[i],'tail':thumb[i+1],'parent':'Hand' if i==0 else f'Thumb{i}'})
    # Three connected bridge loops carry the opposition turn outside the fixed
    # palm. The earlier moving palm patch folded across its fixed neighbours.
    port=ring.copy();t=.86;axis=unit(sub(thumb[1],thumb[0]));u=unit((axis[2],0,-axis[0]));v=(0,1,0)
    center=lerp(thumb[0],thumb[1],t);radius=.015-.0035*t
    bridge_end=[add(center,add(mul(u,a*radius),mul(v,b*radius*.90))) for a,b in SECTION]
    for fraction in [.25,.50,.75]:
        weight=smooth(fraction)
        next_ring=[vertex(lerp(vertices[p],q,fraction),{'Hand':1-weight,'Thumb1':weight},'Thumb') for p,q in zip(port,bridge_end)]
        strip(ring,next_ring);ring=next_ring
    for t in [.86,1,1.14,1.30,1.45,1.60,1.75,1.87,2]:
        start,end,q=(thumb[0],thumb[1],t) if t<=1 else (thumb[1],thumb[3],t-1)
        center=lerp(start,end,q);axis=unit(sub(end,start));u=unit((axis[2],0,-axis[0]));v=(0,1,0)
        radius=.015-.0035*t
        if t==2:radius*=.5
        # Spread the 70-degree IP bend over ~19.7mm, wider than the 9.4mm
        # surface radius; the former 9.8mm transition inverted its inner arc.
        proximal=smooth((t-.72)/.56);distal=smooth((t-1.30)/.60)
        w={'Thumb1':1-proximal,'Thumb2':proximal*(1-distal),'Thumb3':proximal*distal};w={k:value for k,value in w.items() if value>1e-8}
        next_ring=[vertex(add(center,add(mul(u,a*radius),mul(v,b*radius*.90))),w,'Thumb') for a,b in SECTION];strip(ring,next_ring);ring=next_ring
    tips['Thumb']=ring.copy();faces.append(tuple(reversed(ring)))
    return {'vertices':vertices,'faces':faces,'weights':weights,'tags':tags,'bones':bones,'wrist':wrist,'tips':tips,'source':'Original connected surface authored for Kingdom human units'}

def topology(data):
    edges={};adj={i:set() for i in range(len(data['vertices']))}
    for face in data['faces']:
        for a,b in zip(face,face[1:]+face[:1]):
            key=tuple(sorted((a,b)));edges[key]=edges.get(key,0)+1;adj[a].add(b);adj[b].add(a)
    unseen=set(adj);components=0
    while unseen:
        components+=1;stack=[unseen.pop()]
        while stack:
            for n in adj[stack.pop()]&unseen:unseen.remove(n);stack.append(n)
    chi=len(data['vertices'])-len(edges)+len(data['faces'])
    return {'vertices':len(data['vertices']),'edges':len(edges),'faces':len(data['faces']),'components':components,'nonmanifold_edges':sum(n!=2 for n in edges.values()),'euler':chi,'genus':(2-chi)/2 if components==1 and all(n==2 for n in edges.values()) else None}
