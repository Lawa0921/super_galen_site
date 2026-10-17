"""Original editable ruined-architecture kit; candidate exports only.

Each component is a solid sculpted control mesh, curved extrusion or turned
profile, with capped sections, bevels, physical joinery and original PBR pixels.
No third-party geometry, no generated texture noise, no runtime writes.
"""
import bpy,bmesh,json,math,sys,hashlib,gzip
from pathlib import Path
from mathutils import Vector
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parent))
from landmark_kit_geometry import arch_profile,extruded_profile,assert_footprint
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/landmark-kit/2026-10-08-v1'
M={};PARTS=[];SERIAL=0
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def material(name,surface):
    mat=bpy.data.materials.new(name);mat.use_nodes=True;n=mat.node_tree.nodes;l=mat.node_tree.links;bs=n.get('Principled BSDF')
    for kind,socket in [('color','Base Color'),('normal','Normal'),('mr',None)]:
        tex=n.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(RUN/'candidate/textures'/(f'{surface}-{kind}.'+('jpg' if kind=='color' else 'png'))),check_existing=True)
        tex.image.pack()
        if kind!='color':tex.image.colorspace_settings.name='Non-Color'
        if kind=='color':l.new(tex.outputs['Color'],bs.inputs[socket])
        elif kind=='normal':
            normal=n.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.32;l.new(tex.outputs['Color'],normal.inputs['Color']);l.new(normal.outputs['Normal'],bs.inputs[socket])
        else:
            sep=n.new('ShaderNodeSeparateColor');l.new(tex.outputs['Color'],sep.inputs['Color']);l.new(sep.outputs['Green'],bs.inputs['Roughness']);l.new(sep.outputs['Blue'],bs.inputs['Metallic'])
    M[surface]=mat;return mat
def reset():
    global PARTS,SERIAL,M
    bpy.ops.wm.read_factory_settings(use_empty=True);PARTS=[];SERIAL=0;M={}
    for name,surf in [('OriginalIvoryAshlar','ashlar'),('OriginalCutLimestone','cutstone'),('OriginalHewnOak','oak'),('OriginalWarmBrass','brass')]:material(name,surf)
def uv(obj,surface):
    mesh=obj.data;layer=mesh.uv_layers.new(name='Landmark module UV') if not mesh.uv_layers else mesh.uv_layers.active
    for poly in mesh.polygons:
        axes=sorted(range(3),key=lambda k:abs(poly.normal[k]))[:2]
        if surface=='oak':
            long=max(range(3),key=lambda k:max(v.co[k] for v in mesh.vertices)-min(v.co[k] for v in mesh.vertices))
            if long in axes:axes=[long,next(k for k in axes if k!=long)]
        for li in poly.loop_indices:
            p=mesh.vertices[mesh.loops[li].vertex_index].co
            layer.data[li].uv=(p[axes[0]]*(.5 if surface=='oak' else 1.1)+.13,p[axes[1]]*1.1+.07)
def solid(name,verts,faces,surface='cutstone',bevel=.018,segments=3,loc=(0,0,0),rotation=0,family='hewn-stone'):
    global SERIAL
    SERIAL+=1;mesh=bpy.data.meshes.new(f'{family}:control:{SERIAL}');mesh.from_pydata(verts,[],faces);mesh.update()
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
    mesh.use_fake_user=True
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);obj.data.materials.append(M[surface]);obj.location=loc;obj.rotation_euler.z=rotation
    obj['module_family']=family;obj['source_recipe']='landmark_kit_build.py';obj['joint_interface']='local XY face; solid capped ends; dimensions in metres'
    obj['original_control_vertices']=json.dumps(verts);obj['original_control_faces']=json.dumps(faces)
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    if bevel:
        mod=obj.modifiers.new('Worn/chamfered physical edges','BEVEL');mod.width=bevel;mod.segments=segments;mod.limit_method='ANGLE';mod.angle_limit=.24
        bpy.ops.object.modifier_apply(modifier=mod.name)
    clean_mesh(obj);uv(obj,surface)
    for p in obj.data.polygons:p.use_smooth=True
    norm=obj.modifiers.new('Area weighted corner normals','WEIGHTED_NORMAL');norm.keep_sharp=True;norm.weight=40
    bpy.ops.object.modifier_apply(modifier=norm.name)
    obj.select_set(False);PARTS.append(obj);return obj
def clean_mesh(obj):
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0000001)
    bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.0000001)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update()
def block(name,loc,size,surface='cutstone',chip=0,rotation=0):
    x,y,z=[v/2 for v in size]
    # Individually cut sloping corners survive the bevel and LOD. Chipping is
    # deliberately restrained so stacked load-bearing bed faces remain level.
    verts=[(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x+chip,-y,z),(x,-y+chip,z-chip*.5),(x-chip*.5,y,z),(-x,y-chip*.4,z-chip*.7)]
    return solid(name,verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],surface,min(.022,min(size)*.15),3,loc,rotation,'mortised-timber' if surface=='oak' else 'chipped-ashlar')
def profile(name,p,depth,loc=(0,0,0),rotation=0,surface='cutstone',bevel=.012):
    v,f=extruded_profile(p,depth);return solid(name,v,f,surface,bevel,3,loc,rotation,'thick-profile')
def arc(name,inner,outer,start,end,loc,depth=.3,rotation=0,surface='cutstone'):
    p=arch_profile(inner,outer,start,end,max(3,round((end-start)*22)))
    return profile(name,p,depth,loc,rotation,surface,.01)
def turned(name,levels,loc,surface='cutstone',segments=40,flute=0):
    v=[]
    for z,r in levels:
        for i in range(segments):
            a=math.tau*i/segments;rr=r*(1-flute*(.5+.5*math.cos(a*10)))
            v.append((rr*math.cos(a),rr*math.sin(a),z))
    f=[tuple(reversed(range(segments))),tuple(range((len(levels)-1)*segments,len(levels)*segments))]
    for j in range(len(levels)-1):
        for i in range(segments):a=j*segments+i;b=j*segments+(i+1)%segments;f.append((a,b,b+segments,a+segments))
    return solid(name,v,f,surface,min(.006,min(abs(levels[j+1][0]-levels[j][0]) for j in range(len(levels)-1))*.2),2,loc,0,'turned-profile')
def beam(name,a,b,width=.14,depth=None,surface='oak'):
    a,b=Vector(a),Vector(b);obj=block(name,(a+b)/2,(width,depth or width,(b-a).length),surface,chip=.014 if surface=='oak' else 0)
    obj.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return obj
def annular(name,profile_rz,loc,segments=8):
    verts=[(r*math.cos(math.tau*i/segments+math.pi/8),r*math.sin(math.tau*i/segments+math.pi/8),z) for r,z in profile_rz for i in range(segments)]
    faces=[]
    for j in range(len(profile_rz)):
        k=(j+1)%len(profile_rz)
        for i in range(segments):ii=(i+1)%segments;faces.append((j*segments+i,j*segments+ii,k*segments+ii,k*segments+i))
    return solid(name,verts,faces,'cutstone',.009,2,loc,family='hollow-cornice-ring')
def tube(name,points,r=.025,surface='oak',sides=10):
    verts=[]
    for i,p in enumerate(points):
        p=Vector(p);t=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)]);t.normalize()
        u=t.cross(Vector((0,0,1)) if abs(t.z)<.9 else Vector((0,1,0))).normalized();w=t.cross(u).normalized()
        for j in range(sides):v=p+r*(math.cos(math.tau*j/sides)*u+math.sin(math.tau*j/sides)*w);verts.append(tuple(v))
    f=[tuple(reversed(range(sides))),tuple(range((len(points)-1)*sides,len(points)*sides))]
    for i in range(len(points)-1):
        for j in range(sides):a=i*sides+j;b=i*sides+(j+1)%sides;f.append((a,b,b+sides,a+sides))
    return solid(name,verts,f,surface,0,1,family='capped-cord')
def debris(seed,count,bounds,ground=0):
    import random
    rng=random.Random(seed)
    for i in range(count):
        x,y=rng.uniform(*bounds[0]),rng.uniform(*bounds[1]);sx,sy,sz=rng.uniform(.18,.36),rng.uniform(.18,.32),rng.uniform(.1,.22)
        o=block(f'Fallen cut stone {seed}:{i}',(x,y,ground+sz/2),(sx,sy,sz),chip=.04,rotation=rng.uniform(-1,1))
def foundation(size=(3.52,3.26)):
    block('Buried stone footing',(0,0,.02),(*size,.16),'ashlar',.025)
def course_wall(prefix,center,length,courses,rotation=0,height=.28,depth=.34):
    for j in range(courses):
        # Course-end break pattern is authored rather than random block scatter.
        n=round(length/.52);unit=length/n
        for i in range(n):
            x=(i+.5)*unit-length/2;z=(j+.5)*height
            xx=center[0]+x*math.cos(rotation);yy=center[1]+x*math.sin(rotation)
            block(f'{prefix} course{j+1} ashlar{i+1}',(xx,yy,z),(unit-.009,depth,height-.008),'cutstone',.012+(i+j)%3*.006,rotation)
    for i in range(max(2,round(length/.7))):
        n=max(2,round(length/.7));x=(i+.5)*length/n-length/2
        block(f'{prefix} weathered coping{i}',(center[0]+x*math.cos(rotation),center[1]+x*math.sin(rotation),courses*height+.04),(length/n-.012,depth+.08,.09),'cutstone',.022,rotation)
def gatehouse():
    foundation();course_wall('Left gate pier',(-1.11,0),.58,6,depth=.62);course_wall('Right gate pier',(1.11,0),.58,7,depth=.62)
    for i in range(13):
        a=i*math.pi/13+.008;b=(i+1)*math.pi/13-.008
        arc(f'Curved load-bearing voussoir {i}',.82,1.16,a,b,(0,0,1.66),.62)
    # Broken spandrel terminates against the arch, never a floating masonry cap.
    profile('Left ruined spandrel',[(-1.38,1.61),(-1.16,1.61),(-.91,2.35),(-.62,2.63),(-.35,2.77),(-.35,3.13),(-.67,3.27),(-.76,3.03),(-1.17,3.31),(-1.38,3.06)],.57)
    profile('Right broken spandrel',[(.35,2.77),(.7,2.57),(1.16,1.66),(1.38,1.66),(1.38,2.55),(1.14,2.73),(.98,2.7),(.8,2.97),(.35,2.96)],.57)
    course_wall('Broken river retaining wing',(-1.2,.96),1.0,3,math.pi/2,depth=.31)
    course_wall('Short river retaining wing',(1.2,.72),.64,2,math.pi/2,depth=.31)
    # Full-height barricade makes the visually solid obstruction consistent
    # with the complete blocked footprint in districts.ts.
    for i in range(8):
        x=(i-3.5)*.202
        profile(f'Old oak barricade pointed stave{i}',[(-.092,0),(.092,0),(.092,1.50),(.018,1.64),(-.092,1.52)],.105,(x,-.29,.13),surface='oak')
    beam('Barricade lower transverse ledger',(-.83,-.36,.62),(.83,-.36,.62),.12)
    beam('Barricade upper transverse ledger',(-.83,-.36,1.30),(.83,-.36,1.30),.12)
    beam('Barricade braced diagonal',(-.78,-.40,.49),(.72,-.40,1.38),.11)
    for x in (-.75,.75):
        for z in (.62,1.30):turned('Brass barricade peg',[(0,.026),(.045,.026)],(x,-.44,z),'brass',12)
    debris(11,13,((-1.62,1.62),(-1.48,-.7)),.10)
def shrine():
    foundation();block('Lowest worn terrace',(0,0,.19),(2.64,2.35,.27),'cutstone',.045)
    block('Upper receding terrace',(0,.12,.40),(2.18,1.98,.18),'cutstone',.037)
    for i in range(3):block(f'Carved approach tread{i}',(0,-1.30+i*.22,.1+i*.085),(1.28,.30,.18),'cutstone',.022)
    turned('Sun altar lower torus moulding',[(0,.56),(.10,.57),(.16,.49),(.22,.47)],(0,.16,.49))
    turned('Waisted limestone altar drum',[(0,.47),(.14,.43),(.46,.36),(.58,.43)],(0,.16,.69),segments=48,flute=.055)
    turned('Carved altar table overhang',[(0,.43),(.08,.56),(.18,.58),(.23,.53)],(0,.16,1.25))
    # Original inset eight-ray dawn motif, inset into table, not a resource icon.
    turned('Inset aged brass sun disc',[(0,.25),(.012,.25)],(0,.16,1.483),'brass',48)
    for i in range(8):
        a=i*math.tau/8
        v=[(.29,-.025,0),(.46,0,0),(.29,.025,0),(.29,-.025,.012),(.46,0,.012),(.29,.025,.012)]
        solid(f'Original inset dawn ray{i}',v,[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)],'brass',.002,2,(0,.16,1.483),a,'original-dawn-inlay')
    for i,(x,y,h) in enumerate([(-.91,.66,1.50),(.91,.66,.83),(-.98,-.37,.59)]):
        turned(f'Column{i} profiled plinth',[(0,.26),(.11,.26),(.15,.20),(.23,.19)],(x,y,.49),segments=32)
        turned(f'Column{i} fluted broken shaft',[(0,.18),(.12,.185),(h-.18,.16),(h,.15)],(x,y,.72),segments=40,flute=.065)
        # Jagged break lid is a solid irregular crown, not an uncapped tube.
        p=[(-.14,0),(.14,0),(.14,.09),(.045,.145),(-.018,.095),(-.09,.17),(-.14,.14)]
        profile(f'Column{i} fractured capital',p,.26,(x,y,.72+h-.025),bevel=.005)
    course_wall('Shrine back enclosure',(0,1.42),3.02,2,depth=.24)
    course_wall('Shrine left enclosure',(-1.47,.2),2.38,2,math.pi/2,depth=.24)
    course_wall('Shrine right surviving enclosure',(1.47,.72),1.32,1,math.pi/2,depth=.24)
    # Fallen curved column lies flat on a terrace, preserving contact.
    o=turned('Fallen carved column drum',[(0,.16),(.22,.18),(.45,.16)],(.78,-.57,.67),segments=32,flute=.07);o.rotation_euler.y=math.pi/2
    debris(23,8,((-.75,.75),(-.6,.70)),.50)
def difference(obj,cutter):
    cutter.data.materials.clear();cutter.data.materials.append(obj.active_material)
    bpy.context.view_layer.objects.active=obj;mod=obj.modifiers.new('True thick through-window','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter;bpy.ops.object.modifier_apply(modifier=mod.name)
    PARTS.remove(cutter);bpy.data.objects.remove(cutter,do_unlink=True)
def watchtower():
    foundation();n=8;outer=1.26;inner=.94;heights=[4.47,4.65,4.37,4.81,4.44,4.29,4.64,4.42]
    verts=[]
    for r,top in [(outer,False),(inner,False),(outer,True),(inner,True)]:
        for i in range(n):a=math.tau*i/n+math.pi/8;verts.append((r*math.cos(a),r*math.sin(a),heights[i] if top else .08))
    faces=[]
    for i in range(n):j=(i+1)%n;faces.extend([(i,j,16+j,16+i),(8+j,8+i,24+i,24+j),(16+i,16+j,24+j,24+i),(j,i,8+i,8+j)])
    shell=solid('Octagonal thick roofless tower shell',verts,faces,'ashlar',.015,3,family='thick-octagonal-shell')
    for name,angle,z in [('South deep window',0,2.8),('North deep window',math.pi,3.28)]:
        p=[(-.24,0),(.24,0),(.24,.45)]+[(.24*math.cos(a),.45+.24*math.sin(a)) for a in [math.pi*i/12 for i in range(1,13)]]
        cut=profile(name+' cutter',p,1.10,(0,-1.08,z),bevel=0)
        if angle:cut.location.y=1.08
        difference(shell,cut)
        for sign in (-1,1):
            block(name+f' stone jamb{sign}',(sign*.30,-1.155 if not angle else 1.155,z+.23),(.115,.35,.50),chip=.015)
        arc(name+' carved curved lintel',.24,.37,0,math.pi,(0,-1.155 if not angle else 1.155,z+.45),.36)
        block(name+' thick window sill',(0,-1.155 if not angle else 1.155,z-.055),(.74,.42,.12),chip=.021)
    uv(shell,'ashlar')
    # Projecting octagonal moulding and buttresses support the tall, ruined shell.
    for z in (.20,1.42,4.05):
        annular(f'Octagonal hollow horizontal cornice{z}',[(.94,0),(1.28,0),(1.33,.075),(1.29,.15),(.94,.15)],(0,0,z))
    for i in range(8):
        a=math.tau*i/8+math.pi/8;x,y=1.25*math.cos(a),1.25*math.sin(a)
        for j in range(5):
            block(f'Tower corner dressed quoin{i}:{j}',(x,y,.45+j*.70),(.23,.23,.36),'cutstone',.014,a)
    # Interior timber remnants span and attach to masonry at both ends.
    beam('Interior oak floor remnant',(-.90,0,2.22),(.90,0,2.22),.15)
    beam('Interior crossing floor beam',(0,-.9,2.22),(0,.9,2.22),.15)
    for x in (-.68,-.45,.20):beam('Incomplete floor board',(x,-.73,2.32),(x,.75,2.32),.11,.06)
    beam('Ruined pitched roof remnant',(-1.02,.27,4.29),(.12,.27,4.94),.14)
    beam('Roof brace remains',(-1.02,.27,3.80),(-.38,.27,4.60),.12)
    beam('Roof joint ridge stub',(.12,-.13,4.94),(.12,.56,4.94),.13)
    debris(37,12,((-1.68,1.68),(-1.58,-1.08)),.10)
def quarry():
    foundation();
    # Three shaped bench faces have cracked silhouettes and horizontal quarry
    # beds, with real V-cut wedge sockets along the accessible front cut.
    lower=profile('Cut quarry lowest limestone bench',[(-1.50,0),(1.32,0),(1.32,.50),(.68,.48),(.57,.66),(-.7,.70),(-1.50,.60)],1.45,(0,.67,.12),surface='ashlar',bevel=.025)
    mid=profile('Receding quarry middle bench',[(-1.47,0),(.46,0),(.46,.63),(.15,.79),(-.3,.72),(-.68,.89),(-1.47,.73)],1.01,(0,.91,.73),surface='ashlar',bevel=.028)
    profile('Highest fractured quarry shelf',[(-1.42,0),(-.37,0),(-.37,.65),(-.6,.86),(-.88,.73),(-1.01,1.01),(-1.42,.85)],.69,(0,1.09,1.53),surface='ashlar',bevel=.03)
    for i in range(7):
        x=-1.3+i*.35
        cutter=profile(f'Quarry wedge socket cutter{i}',[(-.04,-.1),(.04,-.1),(.04,.06),(0,.025),(-.04,.06)],.19,(x,-.07,.68),bevel=0)
        difference(lower,cutter)
    # Cut fracture physically intersects the quarry face, leaving a deep notch.
    cutter=profile('Worked-rock fracture cutter',[(-.027,0),(.028,0),(.055,.42),(-.028,.63)],.17,(-.72,.38,1.0),bevel=0);difference(mid,cutter)
    uv(lower,'ashlar');uv(mid,'ashlar')
    # Asymmetric braced gantry; feet embedded in solid hewn blocks.
    for x,y in [(.98,-.85),(.98,1.12)]:
        block('Quarry crane stone shoe',(x,y,.23),(.43,.43,.32),'cutstone',.025)
        beam('Mortised crane upright',(x,y,.31),(x,y,2.87),.21)
    beam('Gantry top crossbeam',(.98,-1.05,2.88),(.98,1.30,2.88),.25)
    beam('Main crane lifting jib',(.98,-.74,2.77),(-.85,-.74,3.30),.19)
    beam('Jib compression brace',(.98,-.74,1.61),(-.47,-.74,3.19),.16)
    beam('Back gantry angled brace',(.98,.2,.50),(.98,1.12,2.4),.14)
    beam('Spreader on stone base',(.48,-.85,.32),(1.45,-.85,.32),.18)
    for y in (-.85,1.12):
        for z in (.60,2.63):block('Brass mortise collar',(.98,y,z),(.24,.24,.065),'brass')
    # Detailed winch: turned spool, cheek flanges, cranked axle and helical rope.
    spool=turned('Turned hand-winch spool',[(0,.13),(.05,.23),(.12,.23),(.14,.15),(.40,.15),(.42,.23),(.49,.23),(.54,.13)],(.70,-.86,1.16),'oak',32);spool.rotation_euler.y=math.pi/2
    beam('Winch axle',(.53,-.86,1.16),(1.51,-.86,1.16),.055,surface='brass')
    beam('Bent winch crank handle',(1.50,-.86,1.16),(1.50,-.86,1.49),.047,surface='brass')
    beam('Winch oak hand grip',(1.50,-.86,1.49),(1.50,-1.05,1.49),.08)
    points=[(.88+i*.27/120,-.86+.165*math.cos(math.tau*6*i/120),1.16+.165*math.sin(math.tau*6*i/120)) for i in range(121)]
    tube('Six wraps on winch barrel',points,.014,sides=8)
    tube('Sagging lifting cord',[(.97,-.70,1.30),(.83,-.70,2.0),(.58,-.71,2.64),(-.27,-.73,3.1),(-.76,-.73,3.23),(-.79,-.74,2.7),(-.78,-.74,2.0),(-.76,-.74,.71)],.022)
    block('Dressed stone beneath broken lifting frame',(-.78,-.74,.35),(.62,.65,.47),'cutstone',.035)
    tube('Crossed rope securing grounded stone',[(-1.10,-.74,.24),(-1.11,-.74,.61),(-.79,-.74,.63),(-.45,-.74,.61),(-.45,-.74,.24)],.022)
    for i in range(3):block('Grounded worked stone stock',(i*.37-.35,-1.36,.23),(.33,.40,.27),'cutstone',.021,rotation=.04*i)
    debris(49,8,((-1.5,.28),(-.1,.43)),.10)
BUILDERS={'river-gatehouse':gatehouse,'river-shrine':shrine,'highland-watchtower':watchtower,'quarry-ruins':quarry}
def triangles(objects):return sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects)
def build(asset):
    reset();BUILDERS[asset]();bpy.context.view_layer.update()
    vertices=[tuple(o.matrix_world@v.co) for o in PARTS for v in o.data.vertices];assert_footprint(vertices)
    bounds=[[min(v[k] for v in vertices) for k in range(3)],[max(v[k] for v in vertices) for k in range(3)]]
    for o in PARTS:o['prefab_id']=asset
    source=RUN/'raw'/f'{asset}.blend';bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(source))
    module_rows=[{'name':o.name,'module_family':o['module_family'],'position':list(o.location),'dimensions':list(o.dimensions),'surface':o.active_material.name,'contact':'ground / supporting masonry / joinery; see authored recipe'} for o in PARTS]
    (RUN/'raw'/f'{asset}-modules.json').write_text(json.dumps(module_rows,indent=2)+'\n')
    # Join by shared material, bake transforms and root all mesh groups at zero.
    joined=[];groups=[(mat,[o for o in PARTS if o.active_material==mat]) for mat in M.values()]
    for mat,objects in groups:
        if not objects:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        if len(objects)>1:bpy.ops.object.join()
        obj=objects[0]
        bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR');bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
        obj.name=asset+':'+mat.name;joined.append(obj)
    source_triangles=triangles(joined)
    # Source retains its editable bevel/control detail; runtime LOD0 removes
    # only oversampling above 13.5k, before its separate 3.6k LOD1 collapse.
    if source_triangles>13500:
        for o in joined:
            if o.active_material==M['brass']:continue
            bpy.context.view_layer.objects.active=o;d=o.modifiers.new('LOD0 curve sampling budget','DECIMATE');d.ratio=13500/source_triangles;bpy.ops.object.modifier_apply(modifier=d.name);clean_mesh(o)
    rows=[];t0=triangles(joined)
    for lod in (0,1):
        if lod:
            for o in joined:
                bpy.context.view_layer.objects.active=o;d=o.modifiers.new('LOD silhouette preserving collapse','DECIMATE');d.ratio=max(.60 if o.active_material==M['brass'] else 0,min(.65,3600/t0));bpy.ops.object.modifier_apply(modifier=d.name);clean_mesh(o)
        for o in joined:
            bpy.context.view_layer.objects.active=o
            # Collapse recalculates mesh normals; restore area-weighted shading
            # at each LOD before tangent generation to avoid dark facet patches.
            norm=o.modifiers.new('Final LOD area weighted normals','WEIGHTED_NORMAL');norm.keep_sharp=True;norm.weight=40;bpy.ops.object.modifier_apply(modifier=norm.name)
            bpy.context.view_layer.objects.active=o;tri=o.modifiers.new('Explicit stable glTF tangent triangles','TRIANGULATE');tri.keep_custom_normals=True;bpy.ops.object.modifier_apply(modifier=tri.name)
        bpy.ops.object.select_all(action='DESELECT')
        for o in joined:o.select_set(True)
        bpy.context.view_layer.objects.active=joined[0]
        out=RUN/'candidate'/f'{asset}-lod{lod}.glb'
        bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_normals=True,export_tangents=True,export_texcoords=True,export_materials='EXPORT',export_extras=True)
        rows.append({'id':asset,'lod':lod,'source':source.relative_to(ROOT).as_posix(),'source_sha256':sha(source),'source_triangles':source_triangles,'candidate':out.relative_to(ROOT).as_posix(),'sha256':sha(out),'bytes':out.stat().st_size,'gzip_bytes':len(gzip.compress(out.read_bytes(),mtime=0)),'triangles':triangles(joined),'mesh_nodes':len(joined),'materials':len(joined),'bounds_source_z_up':bounds,'module_count':len(module_rows),'runtime_publish_allowed':False})
    print(json.dumps(rows));return rows
if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    ids=args or list(BUILDERS);rows=[]
    for a in ids:rows+=build(a)
    path=RUN/'qa/build.json';previous=json.loads(path.read_text()) if path.exists() else []
    rows=[r for r in previous if r['id'] not in ids]+rows;path.write_text(json.dumps(rows,indent=2)+'\n')
