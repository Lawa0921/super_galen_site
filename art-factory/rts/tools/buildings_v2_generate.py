"""V2 authored kingdom architecture: distinct castle tiers and trade silhouettes.

Source .blend retains individually named, editable structural parts. GLB joins
the exported copy by material to limit renderer draw calls.
"""
import bpy
import hashlib
import json
import math
import sys
from pathlib import Path
from mathutils import Vector
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parent))
import buildings_generate as g

ROOT=Path(__file__).resolve().parents[1]
RUN=ROOT/'runs'/'kingdom-buildings'/'2026-10-04-v2'
g.RUN=RUN
g.ASSETS={**g.ASSETS,'stone-bridge':(8,5)}


def translate_created(offset, fn):
    before=set(bpy.context.scene.objects)
    fn()
    for ob in set(bpy.context.scene.objects)-before:
        ob.location+=Vector(offset)


def roof_at(x,y,w,d,eave,rise):
    translate_created((x,y,0),lambda:g.gable_roof(w,d,eave,rise))


def stone_volume(name,x,y,w,d,h,roof=True,timber=False,door=True):
    g.box(name+' ashlar load-bearing mass',(x,y,0.54+h/2),(w,d,h),'IvoryLimestone',0.025)
    g.box(name+' dressed sill',(x,y,0.65),(w+0.16,d+0.16,0.15),'LightCutStone',0.018)
    g.box(name+' projecting cornice',(x,y,0.54+h-0.09),(w+0.20,d+0.20,0.18),'LightCutStone',0.018)
    if timber:
        for xx in (-w/2+0.16,w/2-0.16):
            g.box(name+' timber stud',(x+xx,y-d/2-0.025,0.54+h/2),(0.15,0.15,h),'DarkTimber')
        g.beam(name+' timber diagonal',(x-w/2+0.20,y-d/2-0.09,0.90),
               (x,y-d/2-0.09,0.54+h-0.20),0.10,'TimberEdge')
        g.beam(name+' timber diagonal',(x+w/2-0.20,y-d/2-0.09,0.90),
               (x,y-d/2-0.09,0.54+h-0.20),0.10,'TimberEdge')
    if door:
        g.doorway(min(w*0.42,1.43),min(h*0.75,2.05),y-d/2-0.035,x)
    if roof:
        roof_at(x,y,w+0.40,d+0.38,0.54+h+0.10,max(0.70,w*0.26))
    return y-d/2


def cone_slate(x,y,r,z,rise):
    verts=[];faces=[]
    rings=5; seg=24
    for j in range(rings):
        t0=j/rings;t1=(j+1)/rings
        rr0=(r+0.15)*(1-t0);rr1=(r+0.15)*(1-t1)
        z0=z+rise*t0;z1=z+rise*t1
        for i in range(seg):
            a0=math.tau*i/seg;a1=math.tau*(i+1)/seg
            idx=len(verts)
            verts.extend([(x+rr0*math.cos(a0),y+rr0*math.sin(a0),z0),
                          (x+rr0*math.cos(a1),y+rr0*math.sin(a1),z0),
                          (x+rr1*math.cos(a1),y+rr1*math.sin(a1),z1),
                          (x+rr1*math.cos(a0),y+rr1*math.sin(a0),z1)])
            faces.append((idx,idx+1,idx+2,idx+3))
    g.mesh('Coursed conical slate tower roof',verts,faces,'NavySlate')
    g.cyl('Tower gilded finial',(x,y,z+rise+0.13),0.075,0.27,'WeatheredBrass',12)


def castle_tower(x,y,r,h):
    g.cyl('Full-height round ashlar tower',(x,y,0.45+h/2),r,h,'IvoryLimestone',24)
    for i in range(1,5):
        g.cyl('Expressed masonry belt course',(x,y,0.45+h*i/5),r+0.018,0.055,
              'LightCutStone',24)
    g.cyl('Turret top corbelled cornice',(x,y,0.45+h),r+0.13,0.14,'LightCutStone',24)
    g.cyl('Defensive eave overhang',(x,y,0.52+h),r+0.18,0.12,'LightCutStone',24)
    cone_slate(x,y,r,0.60+h,1.22 if h<5.2 else 1.42)
    # Arrow slits and a tall hanging heraldic panel identify the facade.
    g.box('Tower arrow slit',(x,y-r-0.018,2.02),(0.11,0.035,0.43),'DoorRecess')
    g.banner(x,y-r-0.09,0.46+h,0.98)


def crenel_wall(x,y,w,d,z_top=2.70,front=True):
    g.box('Cut-stone curtain wall',(x,y,(0.48+z_top)/2),(w,d,z_top-0.48),'IvoryLimestone')
    g.box('Wall walk ledge',(x,y,z_top+0.07),(w+0.12,d+0.12,0.18),'LightCutStone')
    count=max(2,int((w if front else d)/0.62))
    for i in range(count):
        t=(i+0.5)/count-0.5
        g.box('Alternating castle merlon',(x+t*w if front else x,
                                           y if front else y+t*d,z_top+0.37),
              (min(0.33,w/count*0.62) if front else d*0+0.32,
               0.33 if front else min(0.33,d/count*0.62),0.51),'LightCutStone')


def castle_court(tier):
    g.base(8,8)
    keep_h=3.68 if tier==2 else 5.18
    stone_volume('Central two-storey keep' if tier==2 else 'High royal keep',
                 0,0.72,3.24,3.55,keep_h,roof=True,timber=False,door=False)
    g.doorway(1.17,1.82,-1.16,0)
    for z in (2.14,3.21) if tier==2 else (2.15,3.40,4.70):
        for x in (-1.08,1.08):
            g.window(x,-1.08,z,0.36,0.70)
    g.sun(0,-1.25,0.54+keep_h-0.38,0.48)
    front_h=2.30 if tier==2 else 2.68
    # The gate is an actual clear bay between separate curtain segments.
    for x in (-1.77,1.77):
        crenel_wall(x,-2.91,1.95,0.45,front_h)
    g.arch('Castle open gateway',0,-3.16,0.46,1.63,2.25,'LightCutStone',0.18)
    g.box('Deep open gate shadow',(0,-2.86,1.42),(1.37,0.025,1.85),'DoorRecess')
    for x in (-3.06,3.06):
        crenel_wall(x,0,0.43,5.44,front_h,False)
    for x in (-3.02,3.02):
        castle_tower(x,-2.88,0.62,4.62 if tier==2 else 5.22)
    if tier==3:
        for x in (-3.02,3.02):
            castle_tower(x,2.82,0.61,5.68)
        for x in (-1.55,1.55):
            g.box('Inner courtyard arcade pier',(x,0.36,1.64),(0.22,0.22,2.03),'LightCutStone')
        g.beam('Royal balcony lintel',(-1.68,0.36,2.75),(1.68,0.36,2.75),0.20,'WeatheredBrass')
    for x in (-1.19,1.19):
        g.banner(x,-3.20,front_h+0.07,0.80)


def manor_hall():
    g.base(8,8)
    # First tier is a clustered manor, not a cropped-down version of the keep.
    stone_volume('Lord longhall',0,0.73,5.27,4.44,2.54,roof=True,timber=True,door=True)
    stone_volume('Left service wing',-2.66,1.70,1.92,3.45,1.93,roof=True,timber=True,door=False)
    stone_volume('Right pantry wing',2.65,1.46,1.86,2.88,1.70,roof=True,timber=True,door=False)
    for x in (-1.73,1.73):
        g.window(x,-1.60,1.31,0.45,0.78)
    for x in (-2.3,2.3):
        g.box('Terrace stone baluster',(x,-2.89,0.99),(0.17,0.17,0.81),'LightCutStone')
    g.box('Wide manor entry landing',(0,-2.18,0.55),(2.37,0.79,0.28),'LightCutStone',0.028)
    g.sun(0,-1.67,2.73,0.43)
    g.banner(-2.33,-1.68,2.69,0.83)
    g.banner(2.33,-1.68,2.69,0.83)


def barracks_l():
    g.base(6,6)
    stone_volume('Long low barracks dormitory',0,1.55,5.26,2.32,1.82,True,True,False)
    stone_volume('Perpendicular mess and armoury',-1.87,-0.77,1.74,3.42,1.75,True,True,False)
    for x in (-1.48,0,1.48):g.window(x,0.34,1.21,0.39,0.62)
    # Open L-plan yard and weapon racks face the camera.
    for x in (0.59,1.43,2.25):
        g.box('Polearm rack post',(x,-1.83,1.23),(0.12,0.12,1.42),'DarkTimber')
        g.beam('Training spear',(x,-1.93,0.67),(x+0.08,-1.93,2.34),0.048,'Ironwork')
    g.beam('Polearm rack rail',(0.42,-1.85,1.61),(2.41,-1.85,1.61),0.10,'DarkTimber')
    g.banner(-2.35,-2.63,2.02,0.81)


def stable_u():
    g.base(7,6)
    stone_volume('Back horse barn',0,1.72,6.05,1.62,1.92,True,True,False)
    for x in (-2.54,2.54):
        stone_volume('Open stall side wing',x,-0.62,1.48,3.66,1.75,True,True,False)
        for y in (-1.40,-0.20):
            g.box('Horse stall dark bay',(x,y,1.19),(0.75,0.035,1.05),'DoorRecess')
            g.box('Stall cross rail',(x,y-0.08,1.21),(0.85,0.10,0.13),'DarkTimber')
    g.box('U-court central horse trough',(0,-0.90,0.80),(2.06,0.55,0.40),'DarkTimber',0.045)
    for x in (-1.64,1.64):
        g.box('Hay bedding stack',(x,0.37,0.75),(0.67,0.65,0.48),'Hay',0.03)
    g.banner(-2.54,-2.36,2.24,0.79)
    g.banner(2.54,-2.36,2.24,0.79)


def workshop_open():
    g.base(7,6)
    g.box('Rear stone tool wall',(0,1.53,1.72),(6.14,0.46,2.42),'IvoryLimestone')
    for x in (-2.81,2.81):
        for y in (-1.64,1.46):
            g.box('Open engineering shelter post',(x,y,1.81),(0.18,0.18,2.58),'DarkTimber')
    roof_at(0,-0.04,6.28,3.73,3.17,1.26)
    for x,r in ((-1.55,0.79),(-0.17,0.56)):
        g.wheel(x,-1.74,1.37,r,'Y',False)
        for i in range(12):
            a=math.tau*i/12
            p=(x+math.cos(a)*r*1.02,-1.77,1.37+math.sin(a)*r*1.02)
            q=(x+math.cos(a+0.14)*r*1.19,-1.77,1.37+math.sin(a+0.14)*r*1.19)
            g.beam('Exposed drive gear tooth',p,q,0.055,'Ironwork')
    g.box('Broad engineering workbench',(0.63,-0.31,0.90),(1.70,0.70,0.15),'TimberEdge')
    for x in (0.03,1.22):g.box('Workbench leg',(x,-0.31,0.57),(0.14,0.50,0.62),'DarkTimber')
    g.beam('Large freestanding crane kingpost',(2.46,-1.68,0.53),(2.46,-1.68,4.84),0.18,'DarkTimber')
    g.beam('Cantilever hoist jib',(2.46,-1.68,4.81),(0.45,-2.52,4.87),0.16,'TimberEdge')
    g.beam('Hoist diagonal truss',(2.46,-1.68,2.22),(0.85,-2.35,4.82),0.13,'DarkTimber')
    g.beam('Suspended hook chain',(0.47,-2.52,4.84),(0.47,-2.52,2.44),0.035,'Ironwork')
    g.banner(2.84,-1.80,3.03,0.84)


def stone_bridge():
    # Road spans X across the water. Two open arch mouths face +/-Y.
    for x in (-3.14,3.14):
        g.box('Massive cut-stone bridge pier',(x,0,1.12),(1.66,4.72,2.24),'IvoryLimestone',0.05)
    for side in (-1,1):
        y=side*2.16
        g.arch('Bridge true masonry arch',0,y,0.28,4.73,2.10,'LightCutStone',0.24)
        for x in (-3.32,3.32):
            g.box('Bridge spandrel wing',(x,y,1.74),(1.27,0.40,1.50),'IvoryLimestone')
    g.box('Bridge thick stone road deck',(0,0,2.47),(7.97,4.77,0.45),'LightCutStone',0.045)
    for x in (-3.20,-2.35,-1.50,-0.65,0.20,1.05,1.90,2.75):
        g.box('Cambered dressed road paving',(x,0,2.75+0.21*(1-(x/4)**2)),
              (0.79,4.28,0.10),'IvoryLimestone',0.012)
    for side in (-1,1):
        y=side*2.33
        for i in range(10):
            x=-3.55+i*0.79
            g.box('Individual parapet limestone block',(x,y,3.17),(0.74,0.29,0.62),'LightCutStone',0.018)
        g.box('Continuous parapet coping',(0,y,3.54),(7.91,0.34,0.17),'LightCutStone',0.025)
    g.banner(-3.16,-2.51,3.48,0.66)


BUILD={
    'townhall':manor_hall,
    'townhall-tier2':lambda:castle_court(2),
    'townhall-tier3':lambda:castle_court(3),
    'barracks':barracks_l,
    'stable':stable_u,
    'workshop':workshop_open,
    'house':g.house,'lumbermill':g.lumbermill,'forge':g.forge,
    'altar':g.altar,'tower':g.tower,'chapel':g.chapel,
    'stone-bridge':stone_bridge,
}


def map_material(mat_name,texture_name):
    mat=g.M[mat_name]
    nt=mat.node_tree
    bsdf=nt.nodes.get('Principled BSDF')
    src=RUN/'candidate'/'textures'
    color=bpy.data.images.load(str(src/f'{texture_name}-basecolor.jpg'),check_existing=True)
    color.pack()
    uv=nt.nodes.new('ShaderNodeUVMap');uv.uv_map='Architectural UV'
    tex=nt.nodes.new('ShaderNodeTexImage');tex.name='Generated tileable color';tex.image=color
    nt.links.new(uv.outputs['UV'],tex.inputs['Vector'])
    nt.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
    normal=bpy.data.images.load(str(src/f'{texture_name}-normal.png'),check_existing=True)
    normal.colorspace_settings.name='Non-Color';normal.pack()
    normaltex=nt.nodes.new('ShaderNodeTexImage');normaltex.name='Generated derivative normal';normaltex.image=normal
    nt.links.new(uv.outputs['UV'],normaltex.inputs['Vector'])
    node=nt.nodes.new('ShaderNodeNormalMap');node.inputs['Strength'].default_value=0.38
    nt.links.new(normaltex.outputs['Color'],node.inputs['Color'])
    nt.links.new(node.outputs['Normal'],bsdf.inputs['Normal'])


def join_by_material(objects):
    # This happens after saving editable source; only the in-memory export scene
    # is joined. All objects keep their authored UV0 and exact material names.
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects:ob.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.convert(target='MESH')
    groups={}
    for ob in objects:
        name=ob.active_material.name
        groups.setdefault(name,[]).append(ob)
    joined=[]
    for material,group in groups.items():
        # An identity-transform target prevents Blender's active rotated mesh
        # from becoming the export node origin after join/export_apply.
        data=bpy.data.meshes.new(f'{material} export mesh')
        target=bpy.data.objects.new(f'{material} joined geometry',data)
        bpy.context.collection.objects.link(target)
        target.data.materials.append(g.M[material])
        bpy.ops.object.select_all(action='DESELECT')
        for ob in group:ob.select_set(True)
        target.select_set(True)
        bpy.context.view_layer.objects.active=target
        bpy.ops.object.join()
        joined.append(target)
    return joined


def generate(name):
    g.setup()
    map_material('IvoryLimestone','ivory-ashlar')
    map_material('NavySlate','navy-slate')
    map_material('SlateHighlight','navy-slate')
    BUILD[name]()
    objects=[ob for ob in bpy.context.scene.objects if ob.type=='MESH']
    for ob in objects:
        if ob.data.uv_layers.active:
            ob.data.uv_layers.active.name='Architectural UV'
    g.uv_all(objects)
    g.render_preview(name,objects)
    source=RUN/'raw'/f'{name}.blend'
    source.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(source))
    triangles=sum(sum(len(poly.vertices)-2 for poly in ob.data.polygons) for ob in objects)
    corners=[ob.matrix_world@Vector(c) for ob in objects for c in ob.bound_box]
    bounds_min=[round(min(v[i] for v in corners),4) for i in range(3)]
    bounds_max=[round(max(v[i] for v in corners),4) for i in range(3)]
    joined=join_by_material(objects)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in joined:ob.select_set(True)
    bpy.context.view_layer.objects.active=joined[0]
    out=RUN/'candidate'/f'{name}.glb'
    out.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,
                              export_yup=True,export_apply=True,export_normals=True,
                              export_texcoords=True,export_materials='EXPORT')
    result={'id':name,'status':'candidate','runtime_publish_allowed':False,
            'triangles':triangles,'source_mesh_parts':len(objects),'glb_mesh_nodes':len(joined),
            'glb_bytes':out.stat().st_size,'bounds_min_blender_xyz_m':bounds_min,
            'bounds_max_blender_xyz_m':bounds_max,
            'blend':str(source.relative_to(ROOT)),'glb':str(out.relative_to(ROOT)),
            'render':str((RUN/'qa'/'renders'/f'{name}.png').relative_to(ROOT)),
            'sha256_blend':hashlib.sha256(source.read_bytes()).hexdigest(),
            'sha256_glb':hashlib.sha256(out.read_bytes()).hexdigest()}
    return result


if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['all']
    ids=list(BUILD) if not args or args[0]=='all' else args
    path=RUN/'qa'/'mechanical.json'
    rows=json.loads(path.read_text(encoding='utf-8')) if path.exists() else []
    by_id={row['id']:row for row in rows}
    for name in ids:
        print('BUILDING V2',name,flush=True)
        by_id[name]=generate(name)
        path.write_bytes(json.dumps(list(by_id.values()),indent=2).encode('utf-8'))
        print('DONE V2',name,by_id[name]['triangles'],by_id[name]['glb_bytes'],flush=True)
