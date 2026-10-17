"""Original RTS resource props with generated material maps and editable parts."""
import bpy
import hashlib
import json
import math
import random
import sys
from pathlib import Path
from mathutils import Vector

sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parent))
import buildings_generate as g

ROOT=Path(__file__).resolve().parents[1]
RUN=ROOT/'runs'/'kingdom-props'/'2026-10-04-original'
g.RUN=RUN
g.ASSETS={'oak':(7,6),'rock':(2.6,2.4),'gold-mine':(5,5),'timber-pile':(2,2)}
M={}
TEXTURES={'Bark':'oak-bark','GrayRock':'gray-rock','MineRock':'gray-rock',
          'GoldOre':'gold-ore','EndGrain':'oak-endgrain','MineTimber':'oak-bark'}


def material(name,color,roughness=0.78,metallic=0.0):
    g.material(name,color,roughness,metallic)
    M[name]=g.M[name]
    return M[name]


def map_texture(name,stem):
    mat=M[name];nodes=mat.node_tree.nodes;links=mat.node_tree.links
    bsdf=nodes.get('Principled BSDF')
    uv=nodes.new('ShaderNodeUVMap');uv.uv_map='Architectural UV'
    base=bpy.data.images.load(str(RUN/'candidate'/'textures'/f'{stem}-basecolor.jpg'),check_existing=True)
    base.pack()
    tex=nodes.new('ShaderNodeTexImage');tex.image=base
    links.new(uv.outputs['UV'],tex.inputs['Vector'])
    links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
    normal=bpy.data.images.load(str(RUN/'candidate'/'textures'/f'{stem}-normal.png'),check_existing=True)
    normal.colorspace_settings.name='Non-Color';normal.pack()
    texn=nodes.new('ShaderNodeTexImage');texn.image=normal
    links.new(uv.outputs['UV'],texn.inputs['Vector'])
    bump=nodes.new('ShaderNodeNormalMap');bump.inputs['Strength'].default_value=0.38
    links.new(texn.outputs['Color'],bump.inputs['Color'])
    links.new(bump.outputs['Normal'],bsdf.inputs['Normal'])


def leaf_material():
    mat=M['LeafCutout'];nodes=mat.node_tree.nodes;links=mat.node_tree.links
    bsdf=nodes.get('Principled BSDF')
    uv=nodes.new('ShaderNodeUVMap');uv.uv_map='Architectural UV'
    image=bpy.data.images.load(str(RUN/'candidate'/'textures'/'oak-leaf-atlas.png'),check_existing=True)
    image.pack()
    tex=nodes.new('ShaderNodeTexImage');tex.image=image;tex.interpolation='Linear'
    links.new(uv.outputs['UV'],tex.inputs['Vector'])
    links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
    clip=nodes.new('ShaderNodeMath');clip.operation='GREATER_THAN'
    clip.inputs[1].default_value=0.48
    links.new(tex.outputs['Alpha'],clip.inputs[0])
    links.new(clip.outputs[0],bsdf.inputs['Alpha'])
    mat.blend_method='CLIP'
    mat.alpha_threshold=0.48
    mat.use_backface_culling=False


def setup():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for mat in list(bpy.data.materials):bpy.data.materials.remove(mat)
    bpy.context.preferences.filepaths.save_version=0
    g.M.clear();M.clear()
    material('Bark',(0.30,0.22,0.16),0.86)
    material('LeafCutout',(0.18,0.32,0.11),0.92)
    material('EndGrain',(0.63,0.39,0.18),0.75)
    material('GrayRock',(0.40,0.42,0.42),0.89)
    material('MineRock',(0.39,0.40,0.38),0.91)
    material('GoldOre',(0.53,0.45,0.24),0.50,0.27)
    material('MineTimber',(0.31,0.22,0.14),0.82)
    material('TunnelDark',(0.035,0.038,0.036),0.95)
    material('HempRope',(0.51,0.39,0.21),0.92)
    for mat,tex in TEXTURES.items():map_texture(mat,tex)
    leaf_material()


def tube(name,points,radii,material_name,sides=10):
    """Continuous bent and tapering woody mesh, with longitudinal bark UV."""
    pts=[Vector(p) for p in points]
    verts=[];faces=[];dist=[0]
    for i in range(1,len(pts)):dist.append(dist[-1]+(pts[i]-pts[i-1]).length)
    for i,p in enumerate(pts):
        tangent=(pts[min(i+1,len(pts)-1)]-pts[max(i-1,0)]).normalized()
        helper=Vector((0,0,1)) if abs(tangent.z)<0.8 else Vector((0,1,0))
        e1=tangent.cross(helper).normalized();e2=tangent.cross(e1).normalized()
        for j in range(sides):
            a=math.tau*j/sides
            jitter=1+0.055*math.sin(i*2.3+j*4.7)
            v=p+(math.cos(a)*e1+math.sin(a)*e2)*radii[i]*jitter
            if i==0 and pts[0].z==0:v.z=max(0,v.z)
            verts.append(v)
    for i in range(len(pts)-1):
        for j in range(sides):
            j2=(j+1)%sides
            faces.append((i*sides+j,i*sides+j2,(i+1)*sides+j2,(i+1)*sides+j))
    ob=g.mesh(name,verts,faces,material_name)
    uv=ob.data.uv_layers.new(name='Architectural UV')
    for face in ob.data.polygons:
        for loop_id in face.loop_indices:
            vi=ob.data.loops[loop_id].vertex_index
            ring=vi//sides;side=vi%sides
            uv.data[loop_id].uv=(side/sides,dist[ring]/2.1)
    return ob


def leaf_card(center,size,angle,variant,name):
    c=Vector(center);u=Vector((math.cos(angle),math.sin(angle),0))*size[0]/2
    v=Vector((0.13*math.sin(angle),-0.13*math.cos(angle),1))*size[1]/2
    verts=[c-u-v,c+u-v,c+u+v,c-u+v]
    ob=g.mesh(name,verts,[(0,1,2,3)],'LeafCutout')
    uv=ob.data.uv_layers.new(name='Architectural UV')
    col=variant%3;row=variant//3
    u0=col/3+0.008;u1=(col+1)/3-0.008
    # Blender's UV origin is bottom-left; atlas raster origin is top-left.
    v0=1-(row+1)/2+0.008;v1=1-row/2-0.008
    coords=[(u0,v0),(u1,v0),(u1,v1),(u0,v1)]
    for poly in ob.data.polygons:
        for li in poly.loop_indices:
            vi=ob.data.loops[li].vertex_index
            uv.data[li].uv=coords[vi]


def oak():
    tube('Mature twisted oak trunk',[(0,0,0),(.06,.02,1.4),(-.08,.10,2.85),(.12,.04,4.05),(.19,.12,5.25)],
         [.67,.54,.42,.32,.21],'Bark',14)
    limbs=[
        ([(.05,.06,3.67),(-.62,-.32,4.90),(-1.69,-.76,6.64),(-2.55,-1.18,7.96)],[.32,.24,.15,.065]),
        ([(.09,.08,3.88),(.79,-.33,5.25),(1.64,-.99,6.94),(2.37,-1.35,8.48)],[.29,.21,.13,.055]),
        ([(.18,.10,4.50),(-.46,.76,6.16),(-1.25,1.58,7.81),(-1.91,1.85,9.12)],[.25,.18,.11,.048]),
        ([(.18,.10,4.72),(.73,.72,6.32),(1.54,1.35,7.76),(2.14,1.72,8.91)],[.24,.17,.10,.045]),
        ([(.19,.12,5.20),(.26,.13,6.50),(.42,.15,8.03),(.28,.20,9.42)],[.20,.15,.085,.04]),
    ]
    tips=[];interior=[]
    for i,(points,radii) in enumerate(limbs):
        tube(f'Primary fork {i+1}',points,radii,'Bark',10)
        tips.append(Vector(points[-1]))
        p=Vector(points[-2]);end=Vector(points[-1])
        interior.extend([Vector(points[1]),Vector(points[-2]),p.lerp(end,0.52)])
        side=Vector(((-1)**i*0.60,(-1)**(i+1)*0.68,0.28))
        side_end=(p+end)*0.5+side
        tube(f'Secondary fruiting branch {i+1}',[p.lerp(end,0.28),p.lerp(end,0.68)+side*0.32,side_end],
             [.105,.073,.029],'Bark',8)
        tips.append(side_end)
    for i,tip in enumerate(tips+interior):
        cards=7 if i<len(tips) else 5
        for k in range(cards):
            offset=Vector((0.32*math.cos(i*2.2+k*1.57),0.28*math.sin(i*1.7+k*1.57),
                           (-0.22 if k%2 else 0.27)+0.12*math.sin(i+k)))
            leaf_card(tip+offset,(1.12+0.13*(i%3),0.88+0.10*(k%2)),
                      i*0.75+k*math.pi/2,(i+k)%5,f'Oak leafy twig spray {i:02d}-{k}')


def rocky_mass(name,center,radius_xy,height,seed,mat):
    """Hand-scaffolded angular stratified profile; never a scaled primitive."""
    randomizer=random.Random(seed)
    n=11;rings=[(0.0,0.73),(0.21,1.0),(0.53,0.90),(0.78,0.65),(1.0,0.16)]
    angular=[0.88+randomizer.random()*0.23 for _ in range(n)]
    verts=[]
    for j,(zt,rad) in enumerate(rings):
        for i in range(n):
            a=math.tau*i/n+0.07*math.sin(seed+i*1.9)
            rr=rad*angular[i]*(1+0.09*math.sin(j*2.1+i*2.7))
            x=center[0]+radius_xy[0]*rr*math.cos(a)
            y=center[1]+radius_xy[1]*rr*math.sin(a)
            z=max(0,center[2]+height*zt+0.10*math.sin(i*3.4+j*1.8)*min(1,zt+0.1))
            verts.append((x,y,z))
    faces=[]
    for j in range(len(rings)-1):
        for i in range(n):
            a=j*n+i;b=j*n+(i+1)%n;c=(j+1)*n+(i+1)%n;d=(j+1)*n+i
            if (i+j+seed)%3==0:faces.extend([(a,b,d),(b,c,d)])
            else:faces.append((a,b,c,d))
    faces.append(tuple((len(rings)-1)*n+i for i in range(n)))
    return g.mesh(name,verts,faces,mat)


def rock():
    rocky_mass('Rifted granite central crest',(0,0,0),(1.06,0.93),1.46,4,'GrayRock')
    rocky_mass('Broken left apron',(-0.78,-0.25,0),(0.47,0.56),0.68,7,'GrayRock')
    rocky_mass('Sheared right stratum',(0.64,0.18,0),(0.46,0.55),0.92,11,'GrayRock')
    rocky_mass('Forward splinter ridge',(0.14,-0.72,0),(0.67,0.35),0.43,15,'GrayRock')


def gold_mine():
    # The boulder frame leaves an actual open bay across the front.
    rocky_mass('Mine rocky left buttress',(-1.54,0.35,0),(0.88,1.53),2.45,18,'MineRock')
    rocky_mass('Mine rocky right buttress',(1.49,0.31,0),(0.91,1.49),2.66,23,'MineRock')
    rocky_mass('Mine hill rear mass',(0,1.51,0),(1.92,0.68),3.02,31,'MineRock')
    rocky_mass('Mine weathered crest',(0,0.96,1.98),(1.54,0.93),1.06,34,'MineRock')
    rocky_mass('Glinting gold-vein outcrop',(-1.69,-0.31,0.67),(0.52,0.64),1.24,43,'GoldOre')
    rocky_mass('Glinting gold-vein high face',(1.76,0.35,1.22),(0.48,0.52),1.03,47,'GoldOre')
    rocky_mass('Exposed gold lode on entry cliff',(1.76,-0.93,0.56),(0.66,0.43),1.54,49,'GoldOre')
    rocky_mass('Loose gold-bearing ore at portal',(0.89,-1.58,0),(0.50,0.36),0.51,52,'GoldOre')
    # Deep shadow is 1m behind the mouth; the forward space is clear.
    g.box('Dark recessed mine tunnel end',(0,0.40,1.14),(1.45,0.035,1.91),'TunnelDark')
    for x in (-0.88,0.88):
        g.box('Square hewn mine portal upright',(x,-1.57,1.26),(0.24,0.28,2.24),'MineTimber',0.015)
        g.box('Foundation stone at mine portal',(x,-1.57,0.17),(0.41,0.42,0.34),'MineRock')
    g.box('Heavy lintel over mine mouth',(0,-1.59,2.38),(2.17,0.35,0.29),'MineTimber',0.018)
    for x in (-0.96,0.96):
        g.beam('Knee brace under portal beam',(x,-1.61,1.64),(x*0.59,-1.61,2.35),0.13,'MineTimber')
    g.box('Ore trolley timber track left',(-0.46,-1.72,0.13),(0.10,1.51,0.12),'MineTimber')
    g.box('Ore trolley timber track right',(0.46,-1.72,0.13),(0.10,1.51,0.12),'MineTimber')
    bpy.ops.object.empty_add(type='PLAIN_AXES',location=(0,-1.33,1.05))
    anchor=bpy.context.object;anchor.name='ResourceClickAnchor'
    anchor['resource_type']='gold';anchor['interaction']='mine-mouth'


def timber_pile():
    logs=[(-0.53,0.0,0.28,0.23),(0.0,0,0.29,0.24),(0.55,0.03,0.26,0.22),
          (-0.27,0.01,0.73,0.23),(0.30,-0.01,0.72,0.22),(0.02,0.04,1.13,0.22)]
    for i,(x,y,z,r) in enumerate(logs):
        length=1.58-0.09*(i%2)
        g.cyl(f'Rough cylindrical bark log {i+1}',(x,y,z),r,length,'Bark',16,(math.pi/2,0,0))
        for side in (-1,1):
            face_y=y+side*(length/2+0.006)
            ob=g.cyl(f'Sawn annual rings face {i+1} {side}',(x,face_y,z),r*0.93,0.012,
                     'EndGrain',16,(math.pi/2,0,0))
            ob['keep_native_uv']=True
    for x in (-0.80,0.80):
        g.box('Binding laid under log stack',(x,0,0.07),(0.08,1.87,0.12),'HempRope')
    for y in (-0.64,0.64):
        g.beam('Tensioned hemp binding',(0.72,y,0.23),(0.0,y,1.39),0.050,'HempRope')
        g.beam('Tensioned hemp binding',(-0.72,y,0.23),(0.0,y,1.39),0.050,'HempRope')


BUILD={'oak':oak,'rock':rock,'gold-mine':gold_mine,'timber-pile':timber_pile}


def assign_uv(objects):
    for ob in objects:
        if ob.data.uv_layers.active:ob.data.uv_layers.active.name='Architectural UV'
        if ob.name.startswith('Oak ') or ob.name.startswith('Mature twisted') or ob.name.startswith('Primary fork') or ob.name.startswith('Secondary fruiting'):
            continue
        if ob.get('keep_native_uv'):continue
        g.uv_all([ob])


def preview(name,mesh):
    high=max((ob.matrix_world@Vector(c)).z for ob in mesh for c in ob.bound_box)
    w,d=g.ASSETS[name]
    bpy.context.scene.render.engine='BLENDER_EEVEE'
    bpy.context.scene.render.resolution_x=640
    bpy.context.scene.render.resolution_y=640
    bpy.context.scene.render.resolution_percentage=100
    bpy.context.scene.render.film_transparent=True
    bpy.context.scene.world.color=(0.24,0.24,0.24)
    bpy.ops.object.camera_add(location=(11,-15,max(9,high*1.32)))
    cam=bpy.context.object
    cam.rotation_euler=(Vector((0,0,high*0.50))-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO'
    cam.data.ortho_scale=max(w,d,high*0.93)*1.38+1.15
    bpy.context.scene.camera=cam
    for loc,energy,size in [((2,-5,12),1900,7),((-7,4,9),1200,6)]:
        bpy.ops.object.light_add(type='AREA',location=loc)
        bpy.context.object.data.energy=energy;bpy.context.object.data.size=size
    path=RUN/'qa'/'renders'/f'{name}.png';path.parent.mkdir(parents=True,exist_ok=True)
    bpy.context.scene.render.filepath=str(path)
    bpy.ops.render.render(write_still=True)


def join_by_material(mesh):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in mesh:ob.select_set(True)
    bpy.context.view_layer.objects.active=mesh[0]
    bpy.ops.object.convert(target='MESH')
    groups={}
    for ob in mesh:groups.setdefault(ob.active_material.name,[]).append(ob)
    result=[]
    for mat,group in groups.items():
        data=bpy.data.meshes.new(mat+' export mesh')
        target=bpy.data.objects.new(mat+' joined geometry',data)
        bpy.context.collection.objects.link(target)
        target.data.materials.append(M[mat])
        bpy.ops.object.select_all(action='DESELECT')
        for ob in group:ob.select_set(True)
        target.select_set(True);bpy.context.view_layer.objects.active=target
        bpy.ops.object.join();result.append(target)
    return result


def generate(name):
    setup();BUILD[name]()
    mesh=[ob for ob in bpy.context.scene.objects if ob.type=='MESH']
    assign_uv(mesh)
    # Flush object transforms before camera framing and measured world bounds.
    bpy.context.view_layer.update()
    preview(name,mesh)
    source=RUN/'raw'/f'{name}.blend';source.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(source))
    triangles=sum(sum(len(poly.vertices)-2 for poly in ob.data.polygons) for ob in mesh)
    bounds=[ob.matrix_world@Vector(c) for ob in mesh for c in ob.bound_box]
    minimum=[round(min(v[i] for v in bounds),4) for i in range(3)]
    maximum=[round(max(v[i] for v in bounds),4) for i in range(3)]
    joined=join_by_material(mesh)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in joined:ob.select_set(True)
    if name=='gold-mine':
        anchor=bpy.data.objects.get('ResourceClickAnchor')
        if anchor:anchor.select_set(True)
    bpy.context.view_layer.objects.active=joined[0]
    out=RUN/'candidate'/f'{name}.glb';out.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,
                              export_yup=True,export_apply=True,export_normals=True,
                              export_texcoords=True,export_materials='EXPORT',export_extras=True)
    return {'id':name,'status':'candidate','runtime_publish_allowed':False,
            'triangles':triangles,'source_mesh_parts':len(mesh),'glb_mesh_nodes':len(joined),
            'glb_bytes':out.stat().st_size,'bounds_min_blender_xyz_m':minimum,
            'bounds_max_blender_xyz_m':maximum,'blend':str(source.relative_to(ROOT)),
            'glb':str(out.relative_to(ROOT)),
            'render':str((RUN/'qa'/'renders'/f'{name}.png').relative_to(ROOT)),
            'sha256_blend':hashlib.sha256(source.read_bytes()).hexdigest(),
            'sha256_glb':hashlib.sha256(out.read_bytes()).hexdigest()}


if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['all']
    ids=list(BUILD) if not args or args[0]=='all' else args
    path=RUN/'qa'/'mechanical.json';path.parent.mkdir(parents=True,exist_ok=True)
    rows=json.loads(path.read_text(encoding='utf-8')) if path.exists() else []
    by_id={row['id']:row for row in rows}
    for name in ids:
        print('PROP',name,flush=True)
        by_id[name]=generate(name)
        path.write_bytes(json.dumps(list(by_id.values()),indent=2).encode('utf-8'))
        print('DONE PROP',name,by_id[name]['triangles'],by_id[name]['glb_bytes'],flush=True)
