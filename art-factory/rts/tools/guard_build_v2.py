"""Original Dawnrealm guard revision v2: shaped topology and exportable PBR maps.

Run with blender --background --python guard_build_v2.py. No downloaded meshes or textures.
The character faces Blender +Y; glTF conversion maps Blender +Y to glTF -Z.
"""
import bpy
import math
import json
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
RUN = ROOT / 'runs' / 'guard-pilot' / '2026-10-04-revision-v2'
RAW = RUN / 'raw'
CANDIDATE = RUN / 'candidate'
QA = RUN / 'qa'
for folder in (RAW, CANDIDATE, QA):
    folder.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for collection in list(bpy.data.collections):
    if collection.name != bpy.context.scene.collection.name and collection.users == 0:
        bpy.data.collections.remove(collection)

def material(name, color, metallic=0, roughness=.5):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    return m

def procedural_image(name, rgba, path):
    """Rasterize authored material math without lighting into an exportable PNG."""
    h,w,_=rgba.shape
    image=bpy.data.images.new(name,width=w,height=h,alpha=True,float_buffer=False)
    image.colorspace_settings.name='Non-Color'
    image.pixels.foreach_set(rgba.astype(np.float32).ravel())
    path.parent.mkdir(parents=True,exist_ok=True)
    image.filepath_raw=str(path)
    image.file_format='PNG'
    image.save()
    return image

def scalar_rgba(field):
    return np.stack((field,field,field,np.ones_like(field)),axis=2)

# These are material-space properties only: no key/fill/shadow or scene light in maps.
N=512
yy,xx=np.meshgrid(np.arange(N,dtype=np.float32)/N,np.arange(N,dtype=np.float32)/N,indexing='ij')
weave=np.sin(2*np.pi*32*xx)*np.sin(2*np.pi*32*yy)
height=.55*np.cos(2*np.pi*32*xx)+.45*np.cos(2*np.pi*32*yy)+.18*weave
dx=(np.roll(height,-1,1)-np.roll(height,1,1))*.095
dy=(np.roll(height,-1,0)-np.roll(height,1,0))*.095
normal=np.stack((-dx,-dy,np.ones_like(dx)),axis=2)
normal/=np.linalg.norm(normal,axis=2,keepdims=True)
cloth_normal=procedural_image('Cloth handwoven tangent normal',
    np.concatenate((normal*.5+.5,np.ones((N,N,1),dtype=np.float32)),axis=2),
    RAW/'textures'/'cloth-handwoven-normal.png')
cloth_rough=procedural_image('Cloth filament roughness',
    scalar_rgba(np.clip(.75+.065*weave+.035*np.sin(2*np.pi*64*xx),.5,.9)),
    RAW/'textures'/'cloth-filament-roughness.png')
metal_rng=np.random.default_rng(4217)
def value_noise(grid):
    seed=metal_rng.random((grid,grid),dtype=np.float32)-.5
    expanded=np.repeat(np.repeat(seed,N//grid,axis=0),N//grid,axis=1)
    for _ in range(4):
        expanded=(expanded+np.roll(expanded,1,0)+np.roll(expanded,-1,0)+
                  np.roll(expanded,1,1)+np.roll(expanded,-1,1))/5
    return expanded
metal_field=.075*value_noise(16)+.025*value_noise(64)
metal_rough=procedural_image('Forged steel micro roughness',
    scalar_rgba(np.clip(.41+metal_field,.32,.52)),
    RAW/'textures'/'steel-micro-roughness.png')

def attach_surface_maps(mat, roughness_image=None, normal_image=None, normal_strength=.4):
    nodes=mat.node_tree.nodes
    links=mat.node_tree.links
    bsdf=nodes.get('Principled BSDF')
    if roughness_image:
        tex=nodes.new('ShaderNodeTexImage');tex.image=roughness_image
        tex.label='Exported linear roughness source'
        links.new(tex.outputs['Color'],bsdf.inputs['Roughness'])
    if normal_image:
        tex=nodes.new('ShaderNodeTexImage');tex.image=normal_image
        tex.label='Exported tangent-space woven normal'
        nm=nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=normal_strength
        links.new(tex.outputs['Color'],nm.inputs['Color'])
        links.new(nm.outputs['Normal'],bsdf.inputs['Normal'])

steel = material('Steel · blue gray forged', (.21,.255,.29), .82,.34)
steel_light = material('Steel · polished edges', (.43,.49,.50), .91,.25)
steel_dark = material('Steel · recessed joints', (.055,.068,.080), .75,.48)
brass = material('Brass · warm dawn', (.61,.39,.13), .78,.31)
brass_light = material('Brass · edge glint', (.82,.61,.26), .83,.24)
cloth = material('TeamCloth · royal blue', (.025,.092,.33), .03,.82)
cloth_dark = material('Cloth · indigo folds', (.018,.035,.12), .01,.88)
cloth_light = material('Cloth · blue woven piping', (.072,.17,.43), .0,.73)
leather = material('Leather · walnut', (.19,.095,.045), .03,.67)
leather_dark = material('Leather · stitched edge', (.08,.043,.024), .0,.79)
skin = material('Skin · shaded exposed', (.48,.28,.17), .0,.76)
for m in (steel,steel_light,steel_dark):attach_surface_maps(m,metal_rough)
for m in (cloth,cloth_dark,cloth_light):attach_surface_maps(m,cloth_rough,cloth_normal,.53)

mesh_objects = []
binds = []

def mesh_obj(name, verts, faces, mat, bone='Torso', uv=True, bevel=0):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    for poly in me.polygons:
        poly.use_smooth = len(poly.vertices) > 3
    if uv:
        layer = me.uv_layers.new(name='UV0')
        for poly in me.polygons:
            normal=poly.normal
            for li in poly.loop_indices:
                xyz=me.vertices[me.loops[li].vertex_index].co
                if abs(normal.z)>.75:u,v=xyz.x,xyz.y
                elif abs(normal.x)>.75:u,v=xyz.y,xyz.z
                else:u,v=xyz.x,xyz.z
                layer.data[li].uv=(u*5,v*5)
    if bevel:
        mod = obj.modifiers.new('Soft forged edge', 'BEVEL')
        mod.width = bevel
        mod.segments = 1
        obj.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
    mesh_objects.append(obj)
    binds.append((obj,bone))
    return obj

def loft(name, rings, mat, bone='Torso', sides=12, bevel=0):
    """Elliptical sculpted section loft, each ring=(x,y,z,rx,ry)."""
    verts=[]
    for x,y,z,rx,ry in rings:
        for i in range(sides):
            a=2*math.pi*i/sides
            verts.append((x+rx*math.cos(a), y+ry*math.sin(a),z))
    faces=[]
    faces.append(tuple(reversed(tuple(range(sides)))))
    for j in range(len(rings)-1):
        for i in range(sides):
            ni=(i+1)%sides
            faces.append((j*sides+i,j*sides+ni,(j+1)*sides+ni,(j+1)*sides+i))
    faces.append(tuple((len(rings)-1)*sides+i for i in range(sides)))
    return mesh_obj(name,verts,faces,mat,bone,bevel=bevel)

def polygon_prism(name, points, depth, mat, bone='Torso', bevel=.004):
    """Contoured plate in XYZ, offset along Y to retain a front and rear wall."""
    v=list(points)+[(x,y-depth,z) for x,y,z in points]
    n=len(points)
    faces=[tuple(range(n)),tuple(reversed(tuple(range(n,n*2))))]
    for i in range(n):
        j=(i+1)%n
        faces.append((i,j,j+n,i+n))
    return mesh_obj(name,v,faces,mat,bone,bevel=bevel)

def tube(name, pts, radius, mat, bone='Torso', sides=8):
    verts=[]
    for k,p in enumerate(pts):
        p=Vector(p)
        tangent=Vector(pts[min(k+1,len(pts)-1)])-Vector(pts[max(0,k-1)])
        tangent.normalize()
        ref=Vector((0,1,0)) if abs(tangent.y)<.85 else Vector((1,0,0))
        u=tangent.cross(ref).normalized(); v=tangent.cross(u).normalized()
        for i in range(sides):
            q=p+radius*(math.cos(2*math.pi*i/sides)*u+math.sin(2*math.pi*i/sides)*v)
            verts.append(tuple(q))
    faces=[tuple(reversed(range(sides)))]
    for k in range(len(pts)-1):
        for i in range(sides):
            j=(i+1)%sides
            faces.append((k*sides+i,k*sides+j,(k+1)*sides+j,(k+1)*sides+i))
    faces.append(tuple((len(pts)-1)*sides+i for i in range(sides)))
    return mesh_obj(name,verts,faces,mat,bone)

def stud(name, loc, r, mat, bone='Torso'):
    x,y,z=loc
    return loft(name,[(x,y,z-r*.35,r*.7,r*.33),(x,y,z,r,r*.55),(x,y,z+r*.35,r*.7,r*.33)],mat,bone,10)

def shaped_plate(name, rows, mat, bone='Torso', steps=12, depth=.012):
    """Curved contiguous shell; row=(z,left_x,right_x,side_y,crown_depth)."""
    front=[]
    for z,left,right,side_y,crown in rows:
        for i in range(steps+1):
            t=i/steps
            x=left+(right-left)*t
            y=side_y+crown*math.sin(math.pi*t)
            front.append((x,y,z))
    n=len(front)
    verts=front+[(x,y-depth,z) for x,y,z in front]
    faces=[]
    cols=steps+1
    for r in range(len(rows)-1):
        for c in range(steps):
            a=r*cols+c;b=a+cols
            faces.append((a,a+1,b+1,b))
            faces.append((n+b,n+b+1,n+a+1,n+a))
    perimeter=list(range(cols))+[r*cols+steps for r in range(1,len(rows))]
    perimeter+=list(reversed(range((len(rows)-1)*cols,(len(rows))*cols-1)))
    perimeter+=[r*cols for r in reversed(range(1,len(rows)-1))]
    for i,a in enumerate(perimeter):
        b=perimeter[(i+1)%len(perimeter)]
        faces.append((a,b,n+b,n+a))
    return mesh_obj(name,verts,faces,mat,bone)

def foot_last(name,x,stations,mat,bone):
    """Anatomical forefoot wedge, sectioned along forward +Y rather than vertical."""
    sides=12
    verts=[]
    for y,z,rx,rz in stations:
        for i in range(sides):
            a=2*math.pi*i/sides
            verts.append((x+rx*math.cos(a),y,z+rz*math.sin(a)))
    faces=[tuple(reversed(range(sides)))]
    for k in range(len(stations)-1):
        for i in range(sides):
            j=(i+1)%sides
            faces.append((k*sides+i,k*sides+j,(k+1)*sides+j,(k+1)*sides+i))
    faces.append(tuple((len(stations)-1)*sides+i for i in range(sides)))
    return mesh_obj(name,verts,faces,mat,bone,bevel=.002)

# Body: shaped torso, articulated cuirass, cloth hauberk and layered waist tassets.
loft('Padded gambeson silhouette',[(0,0,.94,.18,.115),(0,0,1.06,.215,.13),(0,0,1.27,.255,.15),(0,0,1.43,.21,.125),(0,0,1.48,.115,.09)],cloth_dark)
loft('Forged breastplate',[(0,.004,1.055,.179,.149),(0,.005,1.14,.204,.160),(0,.005,1.22,.238,.173),(0,.003,1.33,.258,.176),(0,-.003,1.41,.220,.152),(0,-.009,1.47,.116,.087)],steel,bevel=.006)
for side in (-1,1):
    lo,hi=(-.245,-.012) if side<0 else (.012,.245)
    shaped_plate(f'Anatomical pectoral cuirass {side}',[
        (1.23,lo*.78,hi*.78,.153,.022),
        (1.29,lo,hi,.168,.026),
        (1.37,lo*.92,hi*.92,.149,.027),
        (1.415,lo*.70,hi*.70,.135,.016)],steel_light,steps=10,depth=.010)
    tube(f'Pectoral lower chase {side}',[(side*.012,.182,1.235),(side*.10,.181,1.226),(side*.205,.155,1.245)],.004,brass)
shaped_plate('Articulated abdominal upper lame',[(1.102,-.17,.17,.144,.030),(1.16,-.205,.205,.153,.035),(1.205,-.217,.217,.165,.026)],steel,steps=14,depth=.008)
shaped_plate('Articulated abdominal lower lame',[(1.065,-.166,.166,.113,.023),(1.105,-.192,.192,.122,.032),(1.144,-.207,.207,.132,.033)],steel_light,steps=14,depth=.008)
polygon_prism('Rear cuirass central backplate',[(-.19,-.125,1.13),(.19,-.125,1.13),(.23,-.119,1.34),(.14,-.103,1.46),(-.14,-.103,1.46),(-.23,-.119,1.34)],.026,steel,bevel=.007)
polygon_prism('Rear cuirass articulated lower lames',[(-.18,-.156,1.14),(.18,-.156,1.14),(.20,-.148,1.07),(-.20,-.148,1.07)],.012,steel_light,bevel=.002)
tube('Rear armor hammered spine',[(0,-.155,1.11),(0,-.154,1.22),(0,-.146,1.34),(0,-.132,1.43)],.009,steel_light)
for side in (-1,1):
    tube(f'Rear cuirass side seam {side}',[(side*.18,-.145,1.12),(side*.22,-.13,1.28),(side*.19,-.119,1.40)],.005,brass)
    for zz in (1.14,1.29,1.39):
        stud(f'Rear armor rivet {side} {zz}',(side*.17,-.164,zz),.008,brass)
polygon_prism('Breastplate central ridge',[(0,.171,1.11),(.022,.162,1.18),(.019,.158,1.36),(0,.146,1.43),(-.019,.158,1.36),(-.022,.162,1.18)],.011,steel_light,bevel=.002)
for z,r in [(1.13,.197),(1.29,.259)]:
    tube('Cuirass chased seam',[(r*math.cos(a),.154+(.004 if z==1.29 else 0),z+.012*math.cos(2*a)) for a in [i*math.pi/12 for i in range(13)]],.005,steel_light)
loft('Rolled neck gorget',[(0,-.005,1.46,.116,.096),(0,-.006,1.52,.105,.09),(0,-.007,1.55,.082,.071)],steel_dark,bevel=.003)
loft('Gorget bright lip',[(0,-.005,1.52,.114,.101),(0,-.005,1.54,.103,.09)],brass,bevel=.002)

# Sun crest on the chest: custom faceted rays and paired concentric stamped bosses.
sun_z=1.31
stud('Sun · forged boss', (0,.19,sun_z),.054,brass)
stud('Sun · inner disk',(0,.223,sun_z),.029,brass_light)
for i in range(12):
    a=2*math.pi*i/12
    x0,z0=.063*math.sin(a),sun_z+.063*math.cos(a)
    x1,z1=.105*math.sin(a),sun_z+.105*math.cos(a)
    perp=(math.cos(a),-math.sin(a))
    polygon_prism(f'Sun ray {i:02}',[(x0-.011*perp[0],.182,z0-.011*perp[1]),(x1,.175,z1),(x0+.011*perp[0],.182,z0+.011*perp[1])],.006,brass_light,bevel=.001)

# Below the cuirass: tapered, split cloth panels with formed hem and brass piping.
loft('Fauld · layered waist',[(0,0,.90,.20,.12),(0,0,1.02,.225,.13),(0,0,1.09,.203,.125)],steel_dark)
for side in (-1,1):
    x=side*.13
    polygon_prism(f'Tasset upper {side}',[(x-side*.11,.117,1.02),(x+side*.10,.118,1.02),(x+side*.135,.10,.90),(x,.131,.87),(x-side*.105,.10,.91)],.035,steel,bevel=.007)
    polygon_prism(f'Tasset lower {side}',[(x-side*.085,.12,.90),(x+side*.118,.102,.90),(x+side*.11,.089,.78),(x,.119,.75),(x-side*.067,.102,.79)],.026,steel_light,bevel=.004)
    for zz in (.995,.88):
        stud(f'Tasset brass rivet {side} {zz}',(x,.147,zz),.013,brass)

shaped_plate('Royal tabard tension-draped front',[(.53,-.070,.070,.158,.025),(.59,-.123,.123,.153,.029),(.78,-.110,.110,.148,.023),(1.04,-.102,.102,.145,.014)],cloth,'Pelvis',steps=14,depth=.010)
shaped_plate('Royal tabard tension-draped back',[(.53,-.070,.070,-.152,-.024),(.59,-.121,.121,-.147,-.028),(.78,-.110,.110,-.139,-.021),(1.04,-.101,.101,-.132,-.013)],cloth,'Pelvis',steps=14,depth=.010)
for side in (-1,1):
    tube(f'Tabard brass hem {side}',[(side*.104,.16,1.01),(side*.111,.169,.76),(side*.12,.174,.57),(side*.075,.18,.525)],.004,brass,'Pelvis')
    tube(f'Tabard indigo fold {side}',[(side*.035,.17,1.01),(side*.04,.18,.79),(side*.028,.181,.58)],.006,cloth_dark,'Pelvis')
for i in range(7):
    x=-.087+i*.029
    tube(f'Tabard stitched lower seam {i}',[(x,.179,.558),(x+.002,.178,.535)],.0018,brass,'Pelvis')

# Leather waist belt with buckle, rear straps and a small side pouch.
loft('Waist belt',[(0,0,1.00,.22,.137),(0,0,1.048,.223,.14)],leather,'Pelvis')
polygon_prism('Belt buckle face',[(-.047,.157,1.051),(.047,.157,1.051),(.047,.157,.998),(-.047,.157,.998)],.009,brass,'Pelvis',.003)
polygon_prism('Belt buckle opening',[(-.029,.171,1.039),(.029,.171,1.039),(.029,.171,1.008),(-.029,.171,1.008)],.004,leather_dark,'Pelvis',.001)
polygon_prism('Leather utility pouch',[(.22,.007,1.00),(.292,.005,.99),(.292,.005,.88),(.224,.005,.87)],.066,leather,'Pelvis')

# The closed helmet is a continuous bowl and curved visor shells, with a real gap
# between its upper brow and lower face shell. No square plate is laid over the eyes.
loft('Helmet enclosed skull',[(0,-.003,1.52,.091,.087),(0,-.004,1.56,.117,.112),(0,-.007,1.64,.133,.127),(0,-.008,1.72,.137,.131),(0,-.01,1.79,.104,.106),(0,-.01,1.838,.025,.028)],steel,'Head',24,.003)
loft('Helmet rolled brow circlet',[(0,-.002,1.68,.137,.132),(0,-.002,1.702,.137,.131),(0,-.005,1.711,.130,.123)],steel_light,'Head',24,.001)
shaped_plate('Visor curved brow shell',[(1.642,-.115,.115,.106,.030),(1.675,-.129,.129,.105,.037),(1.702,-.118,.118,.099,.030)],steel,'Head',steps=18,depth=.010)
shaped_plate('Visor curved lower face shell',[(1.546,-.052,.052,.117,.033),(1.572,-.094,.094,.115,.047),(1.608,-.114,.114,.111,.051)],steel,'Head',steps=18,depth=.013)
shaped_plate('Eye slit shadow cavity',[(1.609,-.110,.110,.115,.039),(1.642,-.110,.110,.112,.036)],steel_dark,'Head',steps=18,depth=.012)
tube('Visor continuous nasal crest',[(0,.143,1.696),(0,.156,1.645),(0,.160,1.607),(0,.151,1.555)],.009,steel_light,'Head',10)
for side in (-1,1):
    shaped_plate(f'Curved cheek wing {side}',[(1.55,side*.062,side*.112,.091,.017),(1.60,side*.084,side*.126,.090,.016),(1.655,side*.106,side*.128,.083,.012)],steel_light,'Head',steps=5,depth=.009)
    stud(f'Helmet hinge pin {side}',(side*.121,.091,1.644),.012,brass,'Head')
for z in (1.53,1.56,1.59):
    loft(f'Helmet nape lamella {z}',[(0,-.031,z-.012,.106,.096),(0,-.026,z+.014,.118,.110)],steel_dark,'Head',12,.002)
tube('Helmet raised comb',[(0,-.01,1.80),(0,-.012,1.843),(0,-.014,1.86),(0,-.025,1.825)],.012,brass,'Head')

# Each limb is a shaped assembly with identifiable joints, chased seams and rivets.
for side in (-1,1):
    ax=side*.335
    shoulder_bone='Arm.L' if side<0 else 'Arm.R'
    forearm_bone='Forearm.L' if side<0 else 'Forearm.R'
    thigh_bone='Thigh.L' if side<0 else 'Thigh.R'
    shin_bone='Shin.L' if side<0 else 'Shin.R'
    loft(f'Shoulder pauldron domed bowl {side}',[(ax,0,1.36,.112,.107),(ax,0,1.39,.136,.132),(ax,0,1.445,.150,.143),(ax,0,1.49,.134,.128),(ax,0,1.525,.075,.076),(ax,0,1.543,.012,.014)],steel_light,shoulder_bone,20,.002)
    for j,(z,r) in enumerate(((1.34,.126),(1.372,.140),(1.404,.148))):
        loft(f'Pauldron descending articulated lame {side} {j}',[(ax,0,z-.011,r*.88,r*.82),(ax,0,z+.011,r,r*.94)],steel if j%2==0 else steel_dark,shoulder_bone,16,.002)
        tube(f'Pauldron lame rolled lip {side} {j}',[(ax-side*r*.85,.065,z),(ax,.12,z-.005),(ax+side*r*.85,.065,z)],.004,steel_light,shoulder_bone)
    tube(f'Pauldron crest ridge {side}',[(ax-side*.075,.108,1.48),(ax,.137,1.496),(ax+side*.075,.108,1.48)],.005,brass,shoulder_bone)
    stud(f'Pauldron boss {side}',(ax,.141,1.425),.015,brass,shoulder_bone)
    loft(f'Upper arm mail {side}',[(side*.405,.0,1.18,.071,.074),(side*.385,.0,1.31,.082,.084),(side*.356,.0,1.40,.085,.086)],steel_dark,shoulder_bone)
    polygon_prism(f'Upper arm plate {side}',[(side*.33,.075,1.37),(side*.445,.066,1.35),(side*.46,.06,1.205),(side*.38,.075,1.19),(side*.337,.068,1.24)],.018,steel,shoulder_bone,.004)
    loft(f'Elbow pointed couter {side}',[(side*.457,.0,1.12,.076,.08),(side*.462,.0,1.165,.096,.10),(side*.449,.0,1.197,.071,.077)],steel_light,forearm_bone,10,.003)
    loft(f'Forearm vambrace {side}',[(side*.514,.0,.96,.058,.061),(side*.496,.0,1.04,.077,.071),(side*.47,.0,1.13,.08,.076)],steel,forearm_bone,12,.003)
    for z in (1.05,1.11):
        tube(f'Vambrace band {side} {z}',[(side*.496-.06,.052,z),(side*.496,.077,z),(side*.496+.06,.052,z)],.004,brass,forearm_bone)
    loft(f'Articulated gauntlet {side}',[(side*.532,.0,.885,.049,.054),(side*.524,.0,.948,.063,.061),(side*.514,.0,.977,.059,.06)],steel_dark,forearm_bone,10)
    for z in (.900,.918,.936):
        loft(f'Gauntlet finger lames {side} {z}',[(side*.532,.0,z-.007,.052,.055),(side*.532,.0,z+.007,.055,.057)],steel_light,forearm_bone,10)

    lx=side*.145
    loft(f'Thigh padded shape {side}',[(lx,0,.50,.091,.09),(lx,0,.63,.108,.102),(lx*.93,0,.78,.126,.118),(lx*.90,0,.88,.132,.123),(lx*.87,0,.99,.114,.117)],cloth_dark,thigh_bone,16)
    loft(f'Thigh plate cuisse {side}',[(lx,0,.555,.092,.095),(lx,0,.64,.112,.112),(lx*.95,0,.76,.127,.119),(lx*.92,0,.86,.134,.124),(lx*.90,0,.925,.11,.111)],steel,thigh_bone,16,.003)
    polygon_prism(f'Cuisse front engraved spine {side}',[(lx-.012,.129,.865),(lx+.012,.129,.865),(lx+.009,.122,.645),(lx-.009,.122,.645)],.005,steel_light,thigh_bone,.001)
    loft(f'Knee poleyn {side}',[(lx,0,.43,.114,.11),(lx,0,.49,.135,.13),(lx,0,.555,.10,.11)],steel_light,shin_bone,12,.003)
    stud(f'Knee star boss {side}',(lx,.141,.493),.025,brass,shin_bone)
    loft(f'Shin greave {side}',[(lx,0,.145,.079,.08),(lx,0,.20,.083,.087),(lx,0,.29,.096,.101),(lx,0,.36,.108,.108),(lx,0,.42,.105,.102),(lx,0,.45,.092,.09)],steel,shin_bone,16,.002)
    polygon_prism(f'Greeve raised shin ridge {side}',[(lx-.013,.113,.413),(lx+.013,.113,.413),(lx+.008,.102,.183),(lx-.008,.102,.183)],.007,steel_light,shin_bone,.001)
    foot_last(f'Sabaton shaped leather sole {side}',lx,[(-.115,.027,.065,.018),(-.055,.028,.080,.018),(.05,.028,.099,.018),(.15,.028,.104,.017),(.245,.027,.075,.015)],leather,shin_bone)
    foot_last(f'Sabaton forged articulated upper {side}',lx,[(-.110,.083,.064,.045),(-.050,.083,.078,.051),(.055,.075,.099,.047),(.15,.064,.107,.040),(.218,.052,.090,.030),(.25,.046,.045,.022)],steel,shin_bone)
    for yy in (.105,.158,.205):
        tube(f'Sabaton articulated toe seam {side} {yy}',[(lx-.09,yy,.07),(lx,yy+.009,.102-(yy-.1)*.26),(lx+.09,yy,.07)],.0025,steel_dark,shin_bone)

# Shield is an original bevelled kite silhouette: ash core, steel rim, dyed face and sunburst.
SX,SY,SZ=-.58,.18,1.13
shield_bone='Forearm.L'
def shield_points(scale=1.0,y=SY):
    shape=[(-.21,.245),(-.09,.30),(.09,.30),(.21,.245),(.23,.055),(.195,-.17),(.11,-.355),(0,-.49),(-.11,-.355),(-.195,-.17),(-.23,.055)]
    return [(SX+x*scale,y,SZ+z*scale) for x,z in shape]
polygon_prism('Kite shield carved ash core',shield_points(1,SY-.018),.046,leather_dark,shield_bone,.01)
shield_verts=[]
for scale,y in ((.08,SY+.055),(.44,SY+.046),(.72,SY+.033),(.91,SY+.020)):
    shield_verts.extend(shield_points(scale,y))
edge_count=len(shield_points())
shield_faces=[tuple(reversed(tuple(range(edge_count))))]
for ring in range(3):
    for i in range(edge_count):
        nxt=(i+1)%edge_count
        shield_faces.append((ring*edge_count+i,ring*edge_count+nxt,(ring+1)*edge_count+nxt,(ring+1)*edge_count+i))
mesh_obj('Kite shield tension-curved woven face',shield_verts,shield_faces,cloth,shield_bone)
outer=shield_points(1.02,SY+.020);inner=shield_points(.91,SY+.03)
for i in range(len(outer)):
    j=(i+1)%len(outer)
    polygon_prism(f'Kite shield forged rim {i}',[outer[i],outer[j],inner[j],inner[i]],.014,steel_light,shield_bone,.002)
for i,p in enumerate(outer):
    stud(f'Shield edge rivet {i}',(p[0],SY+.047,p[2]),.009,brass,shield_bone)
stud('Shield sun brass boss',(SX,SY+.057,SZ+.075),.067,brass,shield_bone)
stud('Shield sun raised disk',(SX,SY+.087,SZ+.075),.035,brass_light,shield_bone)
for i in range(12):
    a=2*math.pi*i/12
    radial=Vector((math.sin(a),math.cos(a)))
    tangent=Vector((math.cos(a),-math.sin(a)))
    center=Vector((SX,SZ+.075))
    p=center+.078*radial; tip=center+.154*radial
    polygon_prism(f'Shield sun ray {i}',[(p.x-.010*tangent.x,SY+.071,p.y-.010*tangent.y),(tip.x,SY+.068,tip.y),(p.x+.010*tangent.x,SY+.071,p.y+.010*tangent.y)],.005,brass_light,shield_bone,.001)
for z in (SZ-.27,SZ+.225):
    tube(f'Shield leather back grip {z}',[(SX-.11,SY-.07,z),(SX,SY-.107,z+.015),(SX+.11,SY-.07,z)],.016,leather,shield_bone)

# Straight long sword with diamond-section blade, fuller, quillons and wrapped grip.
sword_bone='Forearm.R';WX,WY=.57,.0
blade_v=[(WX-.043,WY, .93),(WX,WY+.016,.93),(WX+.043,WY,.93),(WX,WY-.016,.93),
         (WX-.049,WY, .59),(WX,WY+.014,.59),(WX+.049,WY,.59),(WX,WY-.014,.59),
         (WX-.037,WY,.27),(WX,WY+.011,.27),(WX+.037,WY,.27),(WX,WY-.011,.27),
         (WX,WY,.12)]
blade_f=[]
for k in range(2):
    for i in range(4): blade_f.append((k*4+i,k*4+(i+1)%4,(k+1)*4+(i+1)%4,(k+1)*4+i))
for i in range(4): blade_f.append((8+i,8+(i+1)%4,12))
blade_f.append((3,2,1,0))
mesh_obj('Longsword · tapered diamond blade',blade_v,blade_f,steel_light,sword_bone)
tube('Longsword fuller',[(WX,WY+.018,.91),(WX,WY+.016,.66),(WX,WY+.012,.45)],.005,steel,sword_bone)
loft('Sword brown leather grip',[(WX,WY,.95,.027,.027),(WX,WY,1.12,.03,.03)],leather,sword_bone,10)
for i in range(7):
    z=.967+i*.022
    tube(f'Sword grip cord {i}',[(WX-.026,WY+.01,z),(WX,WY+.032,z+.009),(WX+.026,WY+.01,z+.018)],.003,leather_dark,sword_bone)
polygon_prism('Sword swept crossguard',[(WX-.165,WY, .93),(WX-.12,WY,.96),(WX+.12,WY,.96),(WX+.165,WY,.93),(WX+.115,WY,.92),(WX-.115,WY,.92)],.025,brass,sword_bone,.004)
loft('Sword brass pommel',[(WX,WY,1.10,.031,.031),(WX,WY,1.135,.052,.052),(WX,WY,1.16,.018,.018)],brass,sword_bone,10,.002)

# Armature. Each sculptural part has one full-weight deformation bone. Joint covers hide
# the rigid attachment boundary; the five actions articulate all major body regions.
bpy.ops.object.armature_add(enter_editmode=True, location=(0,0,0))
rig=bpy.context.object; rig.name='GuardRig'
arm=rig.data; arm.name='GuardRig · authored bones'
arm.edit_bones.remove(arm.edit_bones[0])
def bone(name, head, tail, parent=None):
    b=arm.edit_bones.new(name)
    b.head=head;b.tail=tail
    if parent:b.parent=arm.edit_bones[parent]
bone('Root',(0,0,0),(0,0,.20))
bone('Pelvis',(0,0,.95),(0,0,1.08),'Root')
bone('Torso',(0,0,1.08),(0,0,1.49),'Pelvis')
bone('Head',(0,0,1.50),(0,0,1.80),'Torso')
for side,suf in [(-1,'L'),(1,'R')]:
    bone('Arm.'+suf,(side*.31,0,1.43),(side*.45,0,1.17),'Torso')
    bone('Forearm.'+suf,(side*.45,0,1.17),(side*.53,0,.92),'Arm.'+suf)
    bone('Thigh.'+suf,(side*.13,0,.96),(side*.145,0,.51),'Pelvis')
    bone('Shin.'+suf,(side*.145,0,.51),(side*.145,0,.11),'Thigh.'+suf)
bpy.ops.object.mode_set(mode='OBJECT')
rig.show_in_front=True
for obj,name in binds:
    obj.parent=rig
    group=obj.vertex_groups.new(name=name)
    group.add(list(range(len(obj.data.vertices))),1.0,'REPLACE')
    mod=obj.modifiers.new('Skinned to authored rig','ARMATURE')
    mod.object=rig

def action(name, frames, poses):
    act=bpy.data.actions.new(name)
    act.use_fake_user=True
    if not rig.animation_data:rig.animation_data_create()
    rig.animation_data.action=act
    for pb in rig.pose.bones:pb.rotation_mode='XYZ'
    for frame in frames:
        bpy.context.scene.frame_set(frame)
        for pb in rig.pose.bones:
            pb.rotation_euler=(0,0,0)
            pb.location=(0,0,0)
        for bn,values in poses[frame].items():
            if bn.endswith('.location'):
                rig.pose.bones[bn[:-9]].location=values
            else:
                rig.pose.bones[bn].rotation_euler=values
        for pb in rig.pose.bones:
            pb.keyframe_insert(data_path='rotation_euler',frame=frame,group=pb.name)
            pb.keyframe_insert(data_path='location',frame=frame,group=pb.name)
    act.frame_range=(min(frames),max(frames))
    track=rig.animation_data.nla_tracks.new()
    track.name=name
    track.strips.new(name, min(frames), act)
    rig.animation_data.action=None
    return act

def rad(v):return math.radians(v)
idle={1:{},16:{'Torso':(rad(1.3),0,0),'Head':(rad(-1),0,0),'Arm.R':(rad(1),0,0)},31:{}}
walk={1:{'Thigh.L':(rad(19),0,0),'Thigh.R':(rad(-19),0,0),'Shin.R':(rad(17),0,0),'Arm.L':(rad(-10),0,0),'Arm.R':(rad(10),0,0)},
      9:{'Pelvis':(rad(-1.5),0,0),'Shin.L':(rad(25),0,0),'Shin.R':(rad(2),0,0)},
      17:{'Thigh.L':(rad(-19),0,0),'Thigh.R':(rad(19),0,0),'Shin.L':(rad(17),0,0),'Arm.L':(rad(10),0,0),'Arm.R':(rad(-10),0,0)},
      25:{'Pelvis':(rad(1.5),0,0),'Shin.L':(rad(2),0,0),'Shin.R':(rad(25),0,0)},
      33:{'Thigh.L':(rad(19),0,0),'Thigh.R':(rad(-19),0,0),'Shin.R':(rad(17),0,0),'Arm.L':(rad(-10),0,0),'Arm.R':(rad(10),0,0)}}
attack={1:{},8:{'Torso':(0,0,rad(-12)),'Arm.R':(rad(-65),rad(-16),rad(20)),'Forearm.R':(rad(-28),0,0),'Arm.L':(rad(-12),0,rad(-7))},
        15:{'Torso':(rad(8),0,rad(17)),'Arm.R':(rad(74),rad(9),rad(-18)),'Forearm.R':(rad(29),0,0),'Arm.L':(rad(-18),0,rad(10))},
        25:{'Arm.R':(rad(20),0,0)},35:{}}
hurt={1:{},5:{'Pelvis':(rad(-7),0,0),'Torso':(rad(-22),0,rad(5)),'Head':(rad(15),0,0),'Arm.R':(rad(12),0,rad(18)),'Arm.L':(rad(12),0,rad(-18))},14:{'Torso':(rad(-9),0,0)},25:{}}
death={1:{},10:{'Root':(rad(15),0,0),'Torso':(rad(6),0,rad(5)),'Arm.R':(rad(-8),0,rad(10))},
       24:{'Root':(rad(50),0,rad(4)),'Root.location':(0,.09,0),'Torso':(rad(4),0,0),'Head':(rad(-9),0,0),'Thigh.L':(rad(-8),0,0),'Thigh.R':(rad(6),0,0),'Arm.R':(rad(-13),0,rad(20)),'Arm.L':(rad(-10),0,rad(-20))},
       40:{'Root':(rad(85),0,rad(4)),'Root.location':(0,.06,0),'Torso':(rad(-3),0,0),'Head':(rad(-8),0,0),'Thigh.L':(rad(10),0,0),'Thigh.R':(rad(5),0,0),'Arm.R':(rad(-12),0,rad(28)),'Arm.L':(rad(-10),0,rad(-27))}}
for name,poses in [('Idle',idle),('Walk',walk),('Attack',attack),('Hurt',hurt),('Death',death)]:
    action(name,list(poses),poses)

# Preserve all individually editable components in the native source. The export path
# below merges them by PBR material, so one guard costs nine mesh draws instead of 176.
bpy.context.scene.frame_set(1)
rig.animation_data.action=None
bpy.ops.wm.save_as_mainfile(filepath=str(RAW/'dawnrealm-guard-pilot.blend'))
source_mesh_count=len(mesh_objects)
source_mesh_tris=sum(len(p.vertices)-2 for obj in mesh_objects for p in obj.data.polygons)
for obj in mesh_objects:
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    for mod in list(obj.modifiers):
        if mod.type != 'ARMATURE':
            bpy.ops.object.modifier_apply(modifier=mod.name)
by_mat={}
for obj in mesh_objects:
    by_mat.setdefault(obj.data.materials[0].name,[]).append(obj)
merged=[]
for mat,group in by_mat.items():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in group:obj.select_set(True)
    bpy.context.view_layer.objects.active=group[0]
    bpy.ops.object.join()
    group[0].name='Guard · '+mat
    merged.append(group[0])
mesh_objects=merged

# Export only skinned asset, excluding studio cameras and lights.
for obj in bpy.context.selected_objects:obj.select_set(False)
rig.select_set(True)
for obj in mesh_objects:obj.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.context.scene.frame_set(1)
glb=CANDIDATE/'dawnrealm-guard-pilot.glb'
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,
    export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,
    export_apply=True,export_skins=True,export_materials='EXPORT')

# A separate topology-decimated LOD1 candidate; original skinned LOD0 meshes remain
# untouched and keep the source sculpt parts in the saved .blend.
lod_meshes=[]
for obj in mesh_objects:
    dup=obj.copy();dup.data=obj.data.copy();dup.name='LOD1 · '+obj.name
    bpy.context.collection.objects.link(dup)
    bpy.ops.object.select_all(action='DESELECT')
    dup.select_set(True);bpy.context.view_layer.objects.active=dup
    dec=dup.modifiers.new('LOD1 simplify','DECIMATE');dec.ratio=.48
    bpy.ops.object.modifier_move_up(modifier=dec.name)
    bpy.ops.object.modifier_apply(modifier=dec.name)
    lod_meshes.append(dup)
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
for obj in lod_meshes:obj.select_set(True)
bpy.context.view_layer.objects.active=rig
lod_glb=CANDIDATE/'dawnrealm-guard-pilot-lod1.glb'
bpy.ops.export_scene.gltf(filepath=str(lod_glb),export_format='GLB',use_selection=True,
    export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,
    export_apply=True,export_skins=True,export_materials='EXPORT')
for obj in lod_meshes:obj.hide_render=True

# Studio setup is stored in .blend but excluded from glTF. Orthographic review views.
for obj in mesh_objects:obj.select_set(False)
rig.select_set(False)
bpy.ops.mesh.primitive_plane_add(size=200, location=(0,0,.008))
floor=bpy.context.object;floor.name='Studio floor · excluded from GLB'
floor.data.materials.append(material('Studio neutral',(.34,.35,.37),0,.9))
def area(name, loc, power, size, color):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
    obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);obj.location=loc
    direction=Vector((0,0,1.05))-obj.location;obj.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
area('Key softbox',(-2.4,2.5,4.2),290,3.8,(1,.92,.78))
area('Cool fill',(2.2,1.7,2.9),170,3.0,(.7,.82,1.0))
area('Rim',(0,-2.5,3.8),350,2.5,(1,.81,.56))
camera_data=bpy.data.cameras.new('Studio orthographic camera')
camera=bpy.data.objects.new('Studio orthographic camera',camera_data);bpy.context.collection.objects.link(camera)
bpy.context.scene.camera=camera
camera_data.type='ORTHO';camera_data.ortho_scale=2.35
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=32
scene.render.resolution_x=600;scene.render.resolution_y=750;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.world.color=(.21,.22,.24)
scene.view_settings.view_transform='AgX'
for name,loc in [('front',(2.55,4.0,2.65)),('three-quarter',(3.35,3.2,2.80)),('side',(4.5,.4,2.45)),('back',(-2.55,-4.0,2.65))]:
    camera.location=loc
    direction=Vector((0,0,.98))-camera.location
    camera.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(QA/f'{name}.png')
    bpy.ops.render.render(write_still=True)

# Actual game-scale camera: 64 physical pixels, elevated isometric-style view.
scene.render.resolution_x=64;scene.render.resolution_y=64
camera_data.ortho_scale=2.40
camera.location=(3.0,3.3,4.0)
camera.rotation_euler=(Vector((0,0,.90))-camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=str(QA/'game-64px.png')
bpy.ops.render.render(write_still=True)
for obj in mesh_objects:obj.hide_render=True
for obj in lod_meshes:obj.hide_render=False
scene.render.filepath=str(QA/'game-lod1-64px.png')
bpy.ops.render.render(write_still=True)
for obj in mesh_objects:obj.hide_render=False
for obj in lod_meshes:bpy.data.objects.remove(obj,do_unlink=True)
scene.render.resolution_x=600;scene.render.resolution_y=750
camera_data.ortho_scale=2.35

# Preserve a small pair of action review renders with the NLA tracks muted.
for track in rig.animation_data.nla_tracks:track.mute=True
for name,frame in [('Attack',15),('Death',40)]:
    rig.animation_data.action=bpy.data.actions[name]
    scene.frame_set(frame)
    if name=='Death':
        camera.location=(3.9,4.5,3.1)
        target=Vector((0,-.78,.26))
        camera_data.ortho_scale=3.05
    else:
        camera.location=(3.35,3.2,2.80)
        target=Vector((0,0,.98))
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(QA/f'pose-{name.lower()}.png')
    bpy.ops.render.render(write_still=True)
rig.animation_data.action=None
scene.frame_set(1)

report={'source':'manual original procedural Blender mesh modeling, no external model or texture',
        'source_reference':'concept image 01a105df-d576-7703-84fa-155fdc78b299',
        'blender_version':bpy.app.version_string,'source_mesh_objects':source_mesh_count,
        'export_mesh_objects':len(mesh_objects),
        'source_mesh_triangles_before_bevel':source_mesh_tris,
        'blender_forward':'+Y','glTF_forward':'-Z',
        'height_m':1.86,'armature_bones':len(arm.bones),
        'actions':{a.name:list(a.frame_range) for a in bpy.data.actions if a.name in ('Idle','Walk','Attack','Hurt','Death')},
        'glb_bytes':glb.stat().st_size,
        'lod1_glb_bytes':lod_glb.stat().st_size,
        'texture_sources':['raw/textures/cloth-handwoven-normal.png','raw/textures/cloth-filament-roughness.png','raw/textures/steel-micro-roughness.png'],
        'runtime_publish_allowed':False,'status':'needs-review',
        'visual_qa':'Revision v2; compare 45-degree and 64px render with source concept before any production decision.'}
(QA/'build-report.json').write_bytes((json.dumps(report,indent=2)+'\n').encode('utf-8'))
print('GUARD_REPORT '+json.dumps(report))
