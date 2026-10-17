"""Actual sleeve-plane interface and original anatomy guide authoring helpers."""
import math
from guard_hand_foundation_math import add,sub,mul,dot,cross,norm,unit

def validate_cut_integrity(before_bounds,after_bounds,cutter_bounds,tolerance=1e-6):
    for axis in range(3):
        for side in ('min','max'):
            value=before_bounds[side][axis]
            if value<cutter_bounds['min'][axis]-tolerance or value>cutter_bounds['max'][axis]+tolerance:
                if abs(value-after_bounds[side][axis])>tolerance:raise ValueError('Negative cutter lost untouched source extremum: '+side+str(axis))
    return True

def angular_collar_zipper(inner,outer,inner_center,outer_center,normal):
    normal=unit(normal);start=sub(inner[0],inner_center);x=unit(sub(start,mul(normal,dot(start,normal))))
    area=(0,0,0)
    for a,b in zip(inner,inner[1:]+inner[:1]):area=add(area,cross(sub(a,inner_center),sub(b,inner_center)))
    y=mul(cross(normal,x),1 if dot(area,normal)>0 else -1)
    def phase(p,center):
        delta=sub(p,center);value=math.atan2(dot(delta,y),dot(delta,x))%(2*math.pi)
        return 0 if abs(value)<1e-8 or abs(value-2*math.pi)<1e-8 else value
    ip=[phase(p,inner_center) for p in inner]
    if any(b<a-1e-7 for a,b in zip(ip,ip[1:])):raise ValueError('Actual sculpt wrist contour is not a radial star; refuse fake seam mapping')
    order=sorted(range(len(outer)),key=lambda i:phase(outer[i],outer_center));op=[phase(outer[i],outer_center) for i in order]
    steps={(b-a)%len(outer) for a,b in zip(order,order[1:]+order[:1])}
    if not (steps=={1} or steps=={len(outer)-1}):raise ValueError('Source sleeve contour order cannot be replaced by a fake radial socket')
    ip.append(2*math.pi);op.append(op[0]+2*math.pi);n=len(inner);m=len(outer);a=b=0;faces=[];gaps=[]
    while a<n or b<m:
        na=ip[a+1] if a<n else math.inf;nb=op[b+1] if b<m else math.inf
        current,new=a%n,n+b%m;gaps.append(min(abs(ip[min(a,n)]-op[min(b,m)]),2*math.pi-abs(ip[min(a,n)]-op[min(b,m)])))
        if abs(na-nb)<1e-9:faces.append([current,new,n+(b+1)%m,(a+1)%n]);a+=1;b+=1
        elif na<nb:faces.append([current,new,(a+1)%n]);a+=1
        else:faces.append([current,new,n+(b+1)%m]);b+=1
    return {'outer_order':order,'faces':faces,'paired_phase_gap_radians':gaps,
        'method':'Finite monotone source/sculpt polar phases on explicit actual Forearm_R plane; preserves both contours and refuses reentrant topology'}

def sleeve_plane_contour(vertices,triangles,center,normal):
    normal=unit(normal);segments=[];coords={};adj={}
    key=lambda p:tuple(round(x,8) for x in p)
    for face_id,face in enumerate(triangles):
        values=[dot(sub(vertices[i],center),normal) for i in face]
        if all(abs(x)<1e-10 for x in values):raise ValueError('Coplanar triangle cannot define a unique interface')
        hits={}
        for a,b,da,db in zip(face,face[1:]+face[:1],values,values[1:]+values[:1]):
            if abs(da)<1e-10:
                p=tuple(vertices[a]);hits[key(p)]={'position_m':p,'source_edge_vertex_ids':[a,b],'edge_fraction':0.0}
            elif da*db<0:
                amount=da/(da-db);p=add(mul(vertices[a],1-amount),mul(vertices[b],amount))
                hits[key(p)]={'position_m':p,'source_edge_vertex_ids':[a,b],'edge_fraction':amount}
        if len(hits)==2:
            endpoints=list(hits.values());a,b=[key(e['position_m']) for e in endpoints]
            if a==b:continue
            coords[a]=endpoints[0]['position_m'];coords[b]=endpoints[1]['position_m']
            adj.setdefault(a,set()).add(b);adj.setdefault(b,set()).add(a)
            segments.append({'source_triangle_id':face_id,'source_triangle_vertex_ids':list(face),'endpoints':endpoints})
    if not adj or any(len(x)!=2 for x in adj.values()):raise ValueError('Actual triangle slice must form closed contour(s)')
    loops=[];unused=set(adj)
    while unused:
        start=min(unused);current=start;previous=None;loop=[]
        while True:
            loop.append(coords[current]);unused.discard(current)
            choices=adj[current]-({previous} if previous is not None else set());following=min(choices)
            if following==start:break
            if following not in unused:raise ValueError('Contour unexpectedly revisits a vertex')
            previous,current=current,following
        loops.append(loop)
    return {'loops':loops,'segments':segments,'plane_center_m':list(center),'plane_normal':list(normal),
        'method':'Exact source triangle edge/plane intersections with source IDs and interpolation fractions; no inferred socket/PCA/projection'}

def anatomy_strokes():
    # Local r/t/Z in metres. These are original authored anatomical choices,
    # tied by name to semantic source anchors, not copies of the rejected mesh.
    guides={
        'INDEX':[(.015,.027,.026),(-.009,.029,.028),(-.025,.011,.024),(-.023,-.008,.022)],
        'MIDDLE':[(.014,.029,.006),(-.015,.026,.009),(-.028,.007,.007),(-.022,-.014,.005)],
        'RING':[(.016,.028,-.014),(-.012,.028,-.013),(-.028,.009,-.016),(-.025,-.010,-.017)],
        'LITTLE':[(.023,.024,-.034),(.001,.029,-.034),(-.018,.021,-.036),(-.026,.009,-.035)],
        'THUMB':[(.030,-.017,.027),(.013,-.029,.030),(-.007,-.029,.026),(-.012,-.025,.022)]}
    widths={'INDEX':[.0071,.0078,.0067,.0062],'MIDDLE':[.0076,.0080,.0070,.0066],
        'RING':[.0068,.0074,.0063,.0060],'LITTLE':[.0052,.0057,.0051,.0048],'THUMB':[.0115,.0092,.0079,.0070]}
    depths={'INDEX':[.0067,.0084,.0065,.0064],'MIDDLE':[.0070,.0086,.0067,.0067],
        'RING':[.0067,.0080,.0061,.0061],'LITTLE':[.0053,.0064,.0052,.0053],'THUMB':[.0110,.0090,.0072,.0070]}
    digits={};strokes=[]
    def brush(region,center,radii,axis=None):
        return {'region':region,'center_local_m':list(center),'radii_m':list(radii),'longitudinal_axis_local':list(axis or (1,0,0))}
    for name,points in guides.items():
        own=[]
        for bone,(a,b) in enumerate(zip(points,points[1:])):
            direction=unit(sub(b,a));length=norm(sub(b,a))
            # Each short straight phalanx has distinct thickness/taper and a
            # concentrated endpoint joint; these are volume-sculpt controls.
            for amount in (.12,.42,.72,.93):
                center=add(mul(a,1-amount),mul(b,amount));width=widths[name][bone]*(1-amount)+widths[name][bone+1]*amount
                depth=depths[name][bone]*(1-amount)+depths[name][bone+1]*amount
                own.append(brush('DIGIT_'+name,center,(max(length*.43,.0068),depth,width),direction))
        for k,p in enumerate(points):
            direction=unit(sub(points[min(k+1,3)],points[max(k-1,0)]))
            own.append(brush('DIGIT_'+name,p,(.0068 if k<3 else .0065,depths[name][k],widths[name][k]),direction))
        digits[name]={'landmark_names':['CMC','MCP','IP','TIP'] if name=='THUMB' else ['MCP','PIP','DIP','TIP'],
            'landmarks_local_m':points,'volume_strokes':own,'source_anchor_name':'THUMB_BASE' if name=='THUMB' else 'MCP_'+name,
            'anatomy_choice':'Three straight phalange volumes with individual endpoint joints and short broad distal pad; thumb CMC thenar-root opposition'}
        strokes.extend(own)
    palm=[brush('PALM_BACK',(.039,.001,-.002),(.020,.018,.033)),
        brush('PALM_BACK',(.021,.019,-.002),(.018,.014,.035)),
        brush('PALM_BACK',(.046,.004,.018),(.018,.018,.022)),
        brush('THENAR',(.033,-.013,.021),(.016,.016,.019)),
        brush('THENAR',(.034,-.020,.028),(.010,.012,.016)),
        brush('HYPOTHENAR',(.034,.006,-.024),(.014,.015,.016)),
        brush('HYPOTHENAR',(.027,.013,-.025),(.011,.014,.012))]
    for name in ('INDEX','MIDDLE','RING','LITTLE'):
        end=guides[name][0];start=(.048,.000,.023);axis=unit(sub(end,start))
        for amount in (.30,.60,.90):
            center=add(mul(start,1-amount),mul(end,amount))
            palm.append(brush('PALM_BACK',center,(.012,.0105,widths[name][0]*1.22),axis))
    # Wrists are subsequently authored in the actual Forearm_R semantic frame.
    palm.append({'region':'WRIST','semantic_forearm_stroke':True})
    return {'digits':digits,'palm_strokes':palm,'digit_strokes':strokes,
        'central_hollow':{'subtract':True,'center_local_m':(.023,.002,-.002),'radii_m':(.007,.014,.020),'longitudinal_axis_local':(1,0,0)},
        'individual_finger_bones_required':False,'source_generation':'Fresh original anatomical volume strokes; old mesh grid/IDs never read'}
