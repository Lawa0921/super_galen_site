"""Original, editable Blender mesh construction for the kingdom RTS set.

Run with Blender 5.2: blender -b -t 4 --python buildings_generate.py -- [asset-id|all]
The geometry is authored here as architectural profiles, masonry, roof courses,
joinery and trade-specific equipment. No third-party mesh or texture is used.
"""
import bpy
import math
import sys
import json
import hashlib
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
RUN = ROOT / "runs" / "kingdom-buildings" / "2026-10-04-original-blender"
ASSETS = {
    "townhall": (8, 8), "townhall-tier2": (8, 8), "townhall-tier3": (8, 8),
    "house": (4, 4), "barracks": (6, 6), "lumbermill": (5, 5),
    "forge": (5, 5), "altar": (5, 5), "tower": (3, 3),
    "chapel": (6, 6), "stable": (7, 6), "workshop": (7, 6),
}
M = {}


def material(name, color, roughness=0.78, metallic=0.0, emission=None):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*color, 1)
        bsdf.inputs["Emission Strength"].default_value = emission
    M[name] = mat


def setup():
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)
    material("IvoryLimestone", (0.76, 0.71, 0.59))
    material("LightCutStone", (0.91, 0.85, 0.70))
    material("ShadowMortar", (0.43, 0.41, 0.38))
    material("NavySlate", (0.025, 0.045, 0.078), 0.58)
    material("SlateHighlight", (0.047, 0.072, 0.112), 0.60)
    material("DarkTimber", (0.19, 0.115, 0.070))
    material("TimberEdge", (0.31, 0.20, 0.11))
    material("WeatheredBrass", (0.52, 0.38, 0.14), 0.45, 0.72)
    material("TeamCloth", (0.055, 0.13, 0.32), 0.88)
    material("DoorRecess", (0.055, 0.061, 0.066))
    material("GlassAmber", (0.40, 0.22, 0.055), 0.28, 0.16, 0.16)
    material("Ironwork", (0.10, 0.11, 0.11), 0.50, 0.78)
    material("HearthGlow", (0.82, 0.26, 0.035), 0.52, 0.10, 0.70)
    material("Hay", (0.60, 0.43, 0.15))


def tag(obj, mat):
    obj.data.materials.append(M[mat])
    return obj


def box(name, loc, size, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.object
    ob.name = name
    ob.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    tag(ob, mat)
    if bevel:
        mod = ob.modifiers.new("Cut stone softened arris", "BEVEL")
        mod.width = bevel
        mod.segments = 1
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=mod.name)
        ob.modifiers.new("Weighted corner normals", "WEIGHTED_NORMAL")
    return ob


def cyl(name, loc, radius, depth, mat, verts=16, rotation=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc)
    ob = bpy.context.object
    ob.name = name
    if rotation:
        ob.rotation_euler = rotation
    tag(ob, mat)
    return ob


def mesh(name, verts, faces, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    tag(ob, mat)
    return ob


def beam(name, a, b, width, mat, depth=None):
    a, b = Vector(a), Vector(b)
    ob = box(name, (a+b)*0.5, (width, width if depth is None else depth, (b-a).length), mat)
    ob.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
    return ob


def ring(name, loc, radius, minor, mat, major=20, rotation=None):
    bpy.ops.mesh.primitive_torus_add(major_segments=major, minor_segments=6,
                                    location=loc, major_radius=radius, minor_radius=minor)
    ob = bpy.context.object
    ob.name = name
    if rotation:
        ob.rotation_euler = rotation
    tag(ob, mat)
    return ob


def base(w, d):
    box("Chamfered foundation plinth", (0, 0, 0.18), (w-0.10, d-0.10, 0.36), "IvoryLimestone", 0.055)
    box("Raised dressed-stone foundation", (0, 0, 0.42), (w-0.34, d-0.34, 0.17), "LightCutStone", 0.025)
    for k in range(3):
        box(f"Entry stair {k+1}", (0, -d/2+0.21+(k+0.5)*0.25, 0.035+(2-k)*0.07),
            (min(2.4,w*0.53), 0.26, 0.07+(2-k)*0.14), "LightCutStone", 0.012)


def stone_hall(w, d, h, *, timber=False, front_opening=1.4):
    base(w, d)
    box("Load-bearing limestone walls", (0, 0, 0.53+h/2), (w-0.68, d-0.68, h), "IvoryLimestone")
    box("Continuous sill course", (0, 0, 0.72), (w-0.50,d-0.50,0.10), "LightCutStone")
    box("Cornice below eaves", (0,0,0.53+h-0.13), (w-0.44,d-0.44,0.19), "LightCutStone",0.025)
    for side in (-1,1):
        for i in range(max(3,int(h/0.48))):
            z = 0.72+i*0.48
            box("Alternating cut-stone quoin", (side*(w/2-0.38), -d/2+0.37, z),
                (0.46, 0.54 if i%2 else 0.40, 0.32), "LightCutStone", 0.008)
            box("Rear quoin", (side*(w/2-0.38), d/2-0.37, z),
                (0.46, 0.54 if i%2 else 0.40, 0.32), "LightCutStone", 0.008)
    for i in range(1,max(2,int(h/0.62))):
        z=0.56+i*0.62
        for y in (-d/2+0.337, d/2-0.337):
            box("Horizontal ashlar joint", (0,y,z), (w-1.38,0.012,0.018), "ShadowMortar")
    if timber:
        y=-d/2+0.32
        for x in (-w/2+0.80,w/2-0.80):
            box("Exposed upright timber", (x,y,0.53+h/2), (0.13,0.16,h-0.27), "DarkTimber")
        beam("Expressed half-timber diagonal",(-w/2+0.85,y,0.8),(0,y,0.53+h-0.18),0.105,"DarkTimber")
        beam("Expressed half-timber diagonal",(w/2-0.85,y,0.8),(0,y,0.53+h-0.18),0.105,"DarkTimber")
    if front_opening:
        doorway(front_opening, min(h*0.78,2.25), -d/2+0.29)
    if w>=5.0:
        for yy in (-d*0.20,d*0.20):
            window(w/2-0.27,yy,1.36,0.40,min(0.96,h*0.40),True)


def arch(name, x, y, z, width, height, mat="LightCutStone", radius_thick=0.14, voussoirs=True):
    """Moulded segmental/lancet surround in the vertical XZ facade plane."""
    r=width/2
    spring=z+height-r
    for sx in (-1,1):
        box(name+" jamb", (x+sx*(r+radius_thick*0.45),y,z+(height-r)/2),
            (radius_thick,0.13,height-r),mat,0.015)
    for i in range(12):
        a0=math.pi*i/12
        a1=math.pi*(i+1)/12
        def p(a, rad, yy): return (x+math.cos(a)*rad, yy, spring+math.sin(a)*rad)
        r0=r+0.012; r1=r+radius_thick
        v=[p(a0,r0,y-0.075),p(a1,r0,y-0.075),p(a1,r1,y-0.075),p(a0,r1,y-0.075),
           p(a0,r0,y+0.075),p(a1,r0,y+0.075),p(a1,r1,y+0.075),p(a0,r1,y+0.075)]
        mesh(name+(" voussoir" if voussoirs else " moulding"),v,
             [(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],mat)
    box(name+" keystone",(x,y-0.007,spring+r+radius_thick*0.5),
        (radius_thick*1.1,0.19,radius_thick*1.45),"WeatheredBrass" if name.startswith("Main") else mat,0.01)


def doorway(width, height, y, x=0):
    box("Deep shadow of open entrance",(x,y-0.020,0.52+height/2),
        (width,0.024,height),"DoorRecess")
    for xx in (-width*0.30,0,width*0.30):
        box("Vertical oak door plank",(x+xx,y-0.049,0.52+(height-width*0.5)/2),
            (width*0.26,0.05,height-width*0.5),"DarkTimber",0.012)
    arch("Main portal",x,y-0.10,0.52,width,height)
    for sx in (-1,1):
        ring("Brass door pull",(x+sx*0.18,y-0.087,1.35),0.052,0.012,"WeatheredBrass",12,(math.pi/2,0,0))


def window(x,y,z,w=0.50,h=0.95,side=False):
    if side:
        # The same lancet assembly is turned to a side wall.
        before=set(bpy.context.scene.objects)
        window(0,0,z,w,h,False)
        created=set(bpy.context.scene.objects)-before
        for ob in created:
            ob.location.x,ob.location.y=x-ob.location.y,y+ob.location.x
            ob.rotation_euler.z+=math.pi/2
        return
    box("Recessed amber window",(x,y,z+h/2),(w,0.035,h),"GlassAmber")
    arch("Lancet window",x,y-0.065,z,w,h,"LightCutStone",0.085,False)
    box("Stone sill",(x,y-0.09,z+0.04),(w+0.24,0.24,0.09),"LightCutStone",0.01)
    box("Lead vertical mullion",(x,y-0.11,z+h/2),(0.030,0.024,h*0.75),"Ironwork")
    for dz in (0.30,0.50):
        box("Lead horizontal cames",(x,y-0.115,z+dz),(w*0.74,0.024,0.025),"Ironwork")


def gable_roof(w,d,eave,rise,slates=True):
    """Actual overlapping slate plates, ridge roll and carved barge boards."""
    half=w/2
    y0=-d/2
    for sx in (-1,1):
        a=(-half*sx,y0,eave); b=(0,y0,eave+rise)
        c=(0,-y0,eave+rise); dd=(-half*sx,-y0,eave)
        mesh("Structural pitched roof plane",[a,b,c,dd],[(0,1,2,3)],"NavySlate")
        beam("Carved front rake board",a,b,0.10,"DarkTimber")
        beam("Carved rear rake board",dd,c,0.10,"DarkTimber")
        beam("Timber eaves fascia",a,dd,0.11,"DarkTimber")
    beam("Brass capped ridge",(0,y0-0.08,eave+rise+0.015),
         (0,-y0+0.08,eave+rise+0.015),0.085,"WeatheredBrass")
    if not slates:return
    verts=[]; faces=[]
    cols=max(7,round(half/0.24)); rows=max(9,round(d/0.28))
    for sx in (-1,1):
        for j in range(rows):
            ya=y0+(j-0.12)*d/rows
            yb=y0+(j+0.87)*d/rows
            for i in range(cols):
                t0=i/cols; t1=(i+0.96)/cols
                xa=sx*(half*(1-t0)); xb=sx*(half*(1-t1))
                za=eave+rise*t0+0.025; zb=eave+rise*t1+0.025
                idx=len(verts)
                verts.extend([(xa,ya,za),(xb,ya,zb),(xb,yb,zb),(xa,yb,za),
                              (xa,ya,za+0.024),(xb,ya,zb+0.024),(xb,yb,zb+0.024),(xa,yb,za+0.024)])
                # The structural pitch closes the underside; the slate needs
                # only its exposed surface and lower drip edge.
                faces.extend([(idx+4,idx+7,idx+6,idx+5),
                              (idx,idx+4,idx+5,idx+1)])
    mesh("Individually coursed overlapping slate shingles",verts,faces,"SlateHighlight")


def sun(x,y,z,scale=1,front=True):
    rot=(math.pi/2,0,0) if front else None
    cyl("Radiant sun boss",(x,y,z),0.19*scale,0.060*scale,"WeatheredBrass",24,rot)
    ring("Embossed sun corona",(x,y-0.05*scale,z),0.28*scale,0.025*scale,
         "WeatheredBrass",24,rot)
    for i in range(12):
        a=2*math.pi*i/12
        p=(x+math.cos(a)*0.31*scale,y-0.07*scale,z+math.sin(a)*0.31*scale)
        q=(x+math.cos(a)*0.47*scale,y-0.07*scale,z+math.sin(a)*0.47*scale)
        beam("Forged sun ray",p,q,0.035*scale,"WeatheredBrass")


def banner(x,y,top,height=1.05):
    box("TeamCloth removable hanging banner",(x,y,top-height/2),
        (0.40,0.035,height),"TeamCloth")
    box("Banner border left",(x-0.215,y-0.02,top-height/2),(0.018,0.040,height),"WeatheredBrass")
    box("Banner border right",(x+0.215,y-0.02,top-height/2),(0.018,0.040,height),"WeatheredBrass")
    cyl("Banner brass top rod",(x,y,top+0.025),0.035,0.53,"WeatheredBrass",12,(0,math.pi/2,0))
    sun(x,y-0.04,top-height*0.43,0.31)


def chimney(x,y,h):
    box("Massive furnace chimney stack",(x,y,h/2),(0.53,0.53,h),"IvoryLimestone")
    for i in range(3):
        box("Chimney cut-stone course",(x,y,h*0.60+i*0.21),(0.61,0.61,0.06),"LightCutStone")
    box("Chimney flared crown",(x,y,h+0.06),(0.72,0.72,0.15),"LightCutStone",0.025)
    box("Open smoke flue",(x,y,h+0.143),(0.39,0.39,0.015),"DoorRecess")


def round_tower(x,y,r,h,battlements=True,roof=False):
    cyl("Round ashlar defensive tower",(x,y,0.45+h/2),r,h,"IvoryLimestone",24)
    for z in [0.47+i*0.43 for i in range(int(h/0.43))]:
        ring("Carved tower masonry bed joint",(x,y,z),r+0.007,0.013,"ShadowMortar",24)
    cyl("Projecting machicolation cornice",(x,y,0.45+h),r+0.13,0.14,"LightCutStone",24)
    if battlements:
        for i in range(12):
            a=i*2*math.pi/12
            ob=box("Merlon with open crenels",(x+math.cos(a)*r,y+math.sin(a)*r,0.57+h+0.18),
                   (0.32,0.23,0.37),"LightCutStone",0.015)
            ob.rotation_euler.z=a
    if roof:
        bpy.ops.mesh.primitive_cone_add(vertices=24,radius1=r+0.16,radius2=0.06,depth=1.25,
                                        location=(x,y,0.60+h+0.625))
        tag(bpy.context.object,"NavySlate")
        cyl("Gilded turret finial",(x,y,0.60+h+1.30),0.07,0.25,"WeatheredBrass",12)


def wheel(x,y,z,r,axis='Y',saw=False):
    rot=(math.pi/2,0,0) if axis=='Y' else (0,math.pi/2,0)
    ring("Spoked mechanism wheel rim",(x,y,z),r,0.085,"DarkTimber",20,rot)
    for i in range(10):
        a=i*math.pi/5
        if axis=='Y':
            p=(x+math.cos(a)*r*0.14,y,z+math.sin(a)*r*0.14)
            q=(x+math.cos(a)*r*0.94,y,z+math.sin(a)*r*0.94)
        else:
            p=(x,y+math.cos(a)*r*0.14,z+math.sin(a)*r*0.14)
            q=(x,y+math.cos(a)*r*0.94,z+math.sin(a)*r*0.94)
        beam("Wheel radial timber spoke",p,q,0.065,"TimberEdge")
    cyl("Iron wheel hub",(x,y,z),0.13,0.20,"Ironwork",16,rot)
    if saw:
        for i in range(12):
            a=i*math.pi/6
            p=(x+math.cos(a)*r*1.04,y,z+math.sin(a)*r*1.04)
            q=(x+math.cos(a+0.13)*r*1.18,y,z+math.sin(a+0.13)*r*1.18)
            beam("Saw tooth",p,q,0.055,"Ironwork")


def timber_awning(w,d,z):
    for x in (-w/2+0.45,w/2-0.45):
        box("Open timber awning post",(x,-d/2+0.40,z/2),(0.16,0.16,z),"DarkTimber")
    gable_roof(w-0.4,d*0.52,z,0.62)


def decorate_facade(w,d,h,windows=2):
    y=-d/2+0.245
    for x in [-w*0.28,w*0.28][:windows]:
        window(x,y,1.30,0.44,0.78)
    sun(0,y-0.22,0.53+h-0.40,0.55)
    banner(-w/2+0.58,y-0.17,0.53+h-0.40,min(1.07,h*0.55))
    banner(w/2-0.58,y-0.17,0.53+h-0.40,min(1.07,h*0.55))


def townhall(tier):
    w=d=8
    h={1:3.20,2:3.54,3:3.80}[tier]
    stone_hall(w,d,h,timber=True,front_opening=1.72)
    gable_roof(6.90,7.38,0.53+h+0.20,1.55)
    decorate_facade(w,d,h)
    for x in (-2.45,2.45):
        for z in (1.25,2.25):
            window(x,-d/2+0.235,z,0.48,0.82)
    for x in (-3.10,3.10):
        box("Gatehouse pilaster",(x,-3.77,1.55),(0.41,0.39,2.20),"LightCutStone",0.03)
        cyl("Pilaster brass beacon",(x,-3.77,2.81),0.13,0.20,"WeatheredBrass",12)
    if tier>=2:
        round_tower(-2.87,-2.85,0.64,4.70,battlements=True,roof=False)
        box("Second-tier broad gallery",(0,2.18,3.32),(4.50,1.30,0.35),"LightCutStone",0.025)
        for x in (-1.75,-0.58,0.58,1.75):
            box("Gallery arcaded pier",(x,1.55,3.65),(0.18,0.18,0.55),"LightCutStone")
        banner(-3.08,-3.87,3.50,1.42)
    if tier>=3:
        round_tower(2.87,-2.85,0.64,5.10,battlements=True,roof=False)
        box("Third-tier central keep parapet",(0,0,4.55),(2.78,2.48,0.30),"LightCutStone",0.025)
        for x in (-1.19,-0.71,-0.24,0.24,0.71,1.19):
            box("Upper keep castellations",(x,-1.20,4.95),(0.25,0.29,0.50),"LightCutStone")
        chimney(1.50,1.15,5.05)
        for x in (-1.1,1.1):
            banner(x,-3.96,4.0,1.48)


def house():
    w=d=4;h=2.07
    stone_hall(w,d,h,timber=True,front_opening=0.82)
    gable_roof(3.62,3.55,0.53+h+0.15,1.10)
    window(-1.10,-1.78,1.17,0.45,0.76)
    window(1.12,-1.78,1.17,0.45,0.76)
    chimney(1.05,0.65,3.58)
    sun(0,-1.86,2.33,0.34)
    banner(1.44,-1.84,2.50,0.68)


def barracks():
    w=d=6;h=2.65
    stone_hall(w,d,h,timber=True,front_opening=1.43)
    gable_roof(5.60,5.43,0.53+h+0.16,1.34)
    decorate_facade(w,d,h)
    for x in (-2.06,2.06):
        window(x,-2.77,1.35,0.48,0.80)
    for x in (-2.05,2.05):
        box("Spear training rack upright",(x,-2.81,1.12),(0.10,0.10,1.40),"DarkTimber")
        beam("Spear on rack",(x,-2.86,0.62),(x,-2.86,2.24),0.045,"Ironwork")
    for x in (-1.75,1.75):
        cyl("Shield display",(x,-2.91,2.05),0.30,0.06,"WeatheredBrass",12,(math.pi/2,0,0))
    box("Barracks square sentry post",(2.00,1.66,3.76),(0.91,0.91,3.13),"IvoryLimestone")
    box("Battlement parapet course",(2.00,1.66,5.37),(1.12,1.12,0.17),"LightCutStone")
    for xx in (-0.44,0.44):
        for yy in (-0.44,0.44):
            box("Sentry post merlon",(2.00+xx,1.66+yy,5.62),(0.25,0.25,0.40),"LightCutStone")
    box("Sentry arrow slit",(2.00,1.18,4.82),(0.11,0.035,0.51),"DoorRecess")


def lumbermill():
    w=d=5
    base(w,d)
    box("Low millhouse stone rear",(0,0.73,1.37),(4.25,2.44,1.86),"IvoryLimestone")
    for x in (-1.82,1.82):
        box("Millhouse timber corner",(x,-0.51,1.40),(0.15,0.18,1.79),"DarkTimber")
    gable_roof(4.48,2.95,2.42,1.0)
    for x in (-1.88,1.88):
        box("Saw shed post",(x,-1.89,1.48),(0.15,0.15,2.04),"DarkTimber")
    beam("Raised saw shed beam",(-1.88,-1.89,2.45),(1.88,-1.89,2.45),0.15,"TimberEdge")
    wheel(1.57,-0.74,1.20,0.63,'Y',True)
    box("Saw bench trestle",(0,-1.48,0.90),(2.54,0.66,0.16),"TimberEdge")
    for k in range(3):
        cyl("Piled timber trunk",(-1.27+k*0.40,1.63,0.65),0.17,2.20,"DarkTimber",12,(0,math.pi/2,0))
    banner(-1.66,-2.04,2.37,0.85)
    sun(0,-1.97,2.06,0.31)


def forge():
    w=d=5;h=2.20
    stone_hall(w,d,h,timber=True,front_opening=1.48)
    gable_roof(4.52,4.48,0.53+h+0.12,1.13)
    chimney(1.25,1.05,4.52)
    box("Red-hot forge mouth",(1.11,-2.29,1.15),(0.78,0.04,0.63),"HearthGlow")
    arch("Forge hearth",1.11,-2.34,0.84,0.78,0.93,"ShadowMortar",0.10)
    box("Anvil stump",(-1.57,-2.22,0.73),(0.44,0.43,0.55),"DarkTimber")
    box("Forged iron anvil waist",(-1.57,-2.22,1.08),(0.31,0.25,0.23),"Ironwork",0.04)
    box("Anvil horn and face",(-1.57,-2.22,1.24),(0.85,0.31,0.12),"Ironwork",0.03)
    banner(-1.91,-2.41,2.67,0.82)
    sun(0,-2.41,2.45,0.35)


def altar():
    w=d=5
    base(w,d)
    for level in range(3):
        box("Terraced limestone altar platform",(0,0,0.55+level*0.23),
            (4.24-level*0.62,4.24-level*0.62,0.20),"LightCutStone",0.025)
    for x in (-1.50,1.50):
        for y in (-1.50,1.50):
            cyl("Carved freestanding sanctuary column",(x,y,1.90),0.17,1.75,"IvoryLimestone",12)
            cyl("Lotus column capital",(x,y,2.82),0.29,0.18,"LightCutStone",12)
    for y in (-1.50,1.50):
        box("Open ritual architrave",(0,y,2.97),(3.35,0.40,0.24),"LightCutStone",0.025)
    box("Sun altar monolith",(0,0.15,1.50),(1.48,0.69,0.65),"IvoryLimestone",0.07)
    sun(0,-0.25,1.62,0.95)
    for x in (-1.50,1.50):
        banner(x,-1.70,2.68,0.94)


def tower():
    base(3,3)
    round_tower(0,0,1.08,4.65,True,False)
    box("Shadowed tower entrance",(0,-1.082,1.22),(0.75,0.035,1.40),"DoorRecess")
    arch("Watchtower portal",0,-1.12,0.53,0.75,1.54)
    for z in (2.05,3.42):
        for x in (-0.50,0.50):
            box("Arrow slit",(x,-0.954,z),(0.10,0.03,0.48),"DoorRecess")
    banner(0,-1.14,4.58,0.97)
    sun(0,-1.16,3.95,0.32)


def chapel():
    w=d=6;h=3.07
    stone_hall(w,d,h,timber=False,front_opening=1.34)
    gable_roof(5.60,5.48,0.53+h+0.13,1.75)
    for x in (-2.00,2.00):
        window(x,-2.76,1.28,0.47,1.44)
    for y in (-1.15,0,1.15):
        window(2.78,y,1.45,0.42,1.28,True)
    box("Square chapel bell tower shaft",(-1.78,-1.54,4.62),(1.30,1.28,3.45),"LightCutStone")
    for x in (-2.08,-1.48):
        box("Open belfry louver",(x,-2.195,5.53),(0.21,0.035,0.77),"DoorRecess")
    box("Belfry carved cornice",(-1.78,-1.54,6.42),(1.51,1.49,0.17),"IvoryLimestone")
    mesh("Pyramidal slate bell-tower roof",
         [(-2.59,-2.35,6.51),(-0.97,-2.35,6.51),(-0.97,-0.73,6.51),(-2.59,-0.73,6.51),(-1.78,-1.54,7.18)],
         [(0,1,4),(1,2,4),(2,3,4),(3,0,4)],"NavySlate")
    cyl("Chapel gilded sun finial",(-1.78,-1.54,7.24),0.09,0.22,"WeatheredBrass",12)
    sun(0,-2.89,3.31,0.65)
    sun(0,0.71,5.20,0.40)
    banner(-2.49,-2.87,3.38,0.95)
    banner(2.49,-2.87,3.38,0.95)


def stable():
    w=7;d=6;h=2.50
    stone_hall(w,d,h,timber=True,front_opening=2.34)
    gable_roof(6.58,5.50,0.53+h+0.20,1.32)
    for x in (-2.35,2.35):
        window(x,-2.75,1.40,0.48,0.79)
        box("Stable stall division visible in bay",(x,-2.92,0.79),(0.11,0.35,0.80),"DarkTimber")
    box("Long timber horse trough",(2.43,-2.81,0.70),(0.72,0.38,0.34),"DarkTimber")
    for x in (-2.30,2.30):
        box("Woven hay bale",(x,-2.73,0.48),(0.63,0.52,0.34),"Hay",0.035)
    box("Raised hayloft dormer",(0,-2.39,3.76),(1.31,0.79,1.16),"IvoryLimestone")
    box("Open hayloft door",(0,-2.80,3.70),(0.73,0.025,0.81),"DoorRecess")
    beam("Hayloft left pitched roof",(-0.76,-2.89,4.32),(0,-2.89,4.94),0.10,"DarkTimber")
    beam("Hayloft right pitched roof",(0,-2.89,4.94),(0.76,-2.89,4.32),0.10,"DarkTimber")
    box("Hay pulley projecting arm",(0,-2.78,4.79),(0.10,0.47,0.10),"DarkTimber")
    sun(0,-2.85,2.77,0.42)
    banner(-2.97,-2.85,2.79,0.90)


def workshop():
    w=7;d=6;h=2.55
    stone_hall(w,d,h,timber=True,front_opening=1.48)
    gable_roof(6.56,5.45,0.53+h+0.17,1.31)
    for x in (-2.31,2.31):
        window(x,-2.73,1.23,0.47,0.88)
    # An exposed hoist and turned machine wheel make the workshop legible at RTS scale.
    beam("Heavy engineering crane kingpost",(2.15,-2.47,0.47),(2.15,-2.47,4.72),0.16,"DarkTimber")
    beam("Cantilever crane jib",(2.15,-2.47,4.67),(0.56,-2.83,4.74),0.14,"TimberEdge")
    beam("Crane diagonal brace",(2.15,-2.47,2.48),(0.93,-2.75,4.67),0.11,"DarkTimber")
    beam("Suspended iron chain",(0.59,-2.83,4.72),(0.59,-2.83,1.57),0.034,"Ironwork")
    wheel(-2.09,-2.86,1.05,0.57,'Y')
    box("Work table",(-0.86,-2.70,0.88),(1.35,0.42,0.15),"TimberEdge")
    for x in (-1.30,-0.43):
        box("Workbench trestle",(x,-2.70,0.58),(0.11,0.36,0.54),"DarkTimber")
    sun(0,-2.84,2.81,0.36)
    banner(-2.94,-2.84,2.89,0.93)


BUILD = {
    "townhall":lambda:townhall(1),
    "townhall-tier2":lambda:townhall(2),
    "townhall-tier3":lambda:townhall(3),
    "house":house,"barracks":barracks,"lumbermill":lumbermill,
    "forge":forge,"altar":altar,"tower":tower,"chapel":chapel,
    "stable":stable,"workshop":workshop,
}


def uv_all(objects):
    # Every authored surface receives a deterministic per-face projected UV.
    for ob in objects:
        if ob.type != 'MESH':continue
        uv = ob.data.uv_layers.active or ob.data.uv_layers.new(name="Architectural UV")
        for poly in ob.data.polygons:
            n=poly.normal
            axes=(0,1) if abs(n.z)>=max(abs(n.x),abs(n.y)) else ((1,2) if abs(n.x)>abs(n.y) else (0,2))
            for li in poly.loop_indices:
                co=ob.data.vertices[ob.data.loops[li].vertex_index].co
                uv.data[li].uv=(co[axes[0]]*0.5,co[axes[1]]*0.5)


def render_preview(asset, objects):
    bpy.context.scene.render.engine='BLENDER_EEVEE'
    bpy.context.scene.render.resolution_x=560
    bpy.context.scene.render.resolution_y=560
    bpy.context.scene.render.resolution_percentage=100
    bpy.context.scene.render.film_transparent=True
    bpy.context.scene.render.image_settings.file_format='PNG'
    bpy.context.scene.world.color=(0.23,0.23,0.23)
    bpy.ops.object.camera_add(location=(11,-15,12))
    cam=bpy.context.object
    cam.name="Isometric review camera"
    height=max((ob.matrix_world @ Vector(corner)).z for ob in objects for corner in ob.bound_box)
    cam.rotation_euler=(Vector((0,0,height*0.48))-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO'
    w,d=ASSETS[asset]
    cam.data.ortho_scale=max(w,d,height)*1.46+1.55
    bpy.context.scene.camera=cam
    bpy.ops.object.light_add(type='AREA',location=(2,-5,11))
    light=bpy.context.object
    light.data.energy=1700
    light.data.shape='DISK'
    light.data.size=7
    bpy.ops.object.light_add(type='AREA',location=(-7,4,8))
    bpy.context.object.data.energy=1150
    bpy.context.object.data.size=6
    p=RUN/'qa'/'renders'/f'{asset}.png'
    p.parent.mkdir(parents=True,exist_ok=True)
    bpy.context.scene.render.filepath=str(p)
    bpy.ops.render.render(write_still=True)


def generate(asset):
    setup()
    BUILD[asset]()
    objects=[ob for ob in bpy.context.scene.objects if ob.type=='MESH']
    uv_all(objects)
    render_preview(asset,objects)
    source=RUN/'raw'/f'{asset}.blend'
    source.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(source))
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects:ob.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    out=RUN/'candidate'/f'{asset}.glb'
    out.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,
                              export_yup=True,export_apply=True,export_normals=True,
                              export_texcoords=True,export_materials='EXPORT')
    tri=sum(sum(len(poly.vertices)-2 for poly in ob.data.polygons) for ob in objects)
    bounds=[]
    for ob in objects:
        bounds.extend([ob.matrix_world @ Vector(corner) for corner in ob.bound_box])
    minimum=[round(min(v[k] for v in bounds),4) for k in range(3)]
    maximum=[round(max(v[k] for v in bounds),4) for k in range(3)]
    dims=[round(max(v[k] for v in bounds)-min(v[k] for v in bounds),3) for k in range(3)]
    return {"id":asset,"status":"candidate","runtime_publish_allowed":False,
            "triangles":tri,"object_count":len(objects),"uv_meshes":sum(bool(ob.data.uv_layers) for ob in objects),
            "material_slots":sorted({mat.name for ob in objects for mat in ob.data.materials}),
            "dimensions_blender_xyz_m":dims,"bounds_min_blender_xyz_m":minimum,
            "bounds_max_blender_xyz_m":maximum,"source":str(source.relative_to(ROOT)),
            "candidate":str(out.relative_to(ROOT)),"render":str((RUN/'qa'/'renders'/f'{asset}.png').relative_to(ROOT)),
            "glb_bytes":out.stat().st_size,"sha256_glb":hashlib.sha256(out.read_bytes()).hexdigest(),
            "sha256_blend":hashlib.sha256(source.read_bytes()).hexdigest()}


if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['all']
    ids=list(ASSETS) if not args or args[0]=='all' else args
    RUN.mkdir(parents=True,exist_ok=True)
    results=[]
    for asset in ids:
        if asset not in ASSETS:raise SystemExit(f'Unknown building: {asset}')
        print(f'BUILDING {asset}',flush=True)
        results.append(generate(asset))
        (RUN/'qa'/'mechanical.json').write_bytes(json.dumps(results,indent=2).encode('utf-8'))
        print(f'DONE {asset}: {results[-1]["triangles"]} triangles, {results[-1]["glb_bytes"]} bytes',flush=True)
