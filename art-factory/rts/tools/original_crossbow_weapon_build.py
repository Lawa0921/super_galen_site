"""Author the complete original crossbow, preserving accepted character and motion.

Mesh sections, UVs and fittings are authored here. Existing generated surface
tiles are packed unchanged. This produces factory candidates, never runtime.
"""
import ast
import bpy
import bmesh
import hashlib
import json
import math
import os
from pathlib import Path
import sys
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'art-factory/rts/runs/original-crossbow-waist/2026-10-06-v1/candidate/original-crossbow-grip.blend'
EXPECTED = '6936e824a34253f6c60dbdb9fc3b707ed9d7eb9fd51081b562ba4fd490315fdc'
RUN = ROOT / 'art-factory/rts/runs/original-crossbow-weapon/2026-10-06-v1'
CX = .4756327
RIGHT = Vector((.4737280011, .0082399929, 1.0032651424))
RIGHT_AXIS = Vector((.0174523499, 0, .9998477101))
LEFT = Vector((.4756326973, .1482384652, 1.0090498924))


def material(name, source, metallic, roughness):
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    image = bpy.data.images.load(str(ROOT / source), check_existing=True); image.pack()
    texture = mat.node_tree.nodes.new('ShaderNodeTexImage'); texture.image = image
    mat.node_tree.links.new(texture.outputs['Color'], bsdf.inputs['Base Color'])
    return mat


class Author:
    def __init__(self):
        self.vertices = []; self.faces = []; self.uvs = []; self.materials = []; self.parts = {}

    def loft(self, name, centres, widths, heights, axis_hint, sides, mat, closed=False, exponent=.65):
        """Closed swept section, with longitudinal wood-grain UV and semantic IDs."""
        centres = list(map(Vector, centres)); base = len(self.vertices); first_face = len(self.faces)
        distance = [0.0]
        for a, b in zip(centres, centres[1:]): distance.append(distance[-1]+(b-a).length)
        for i, centre in enumerate(centres):
            if closed:
                tangent = centres[(i+1) % len(centres)]-centres[(i-1) % len(centres)]
            else:
                tangent = centres[min(i+1, len(centres)-1)]-centres[max(0, i-1)]
            tangent.normalize(); u = Vector(axis_hint)
            u = (u - tangent*u.dot(tangent)).normalized(); v = tangent.cross(u).normalized()
            for j in range(sides):
                angle = 2*math.pi*(j+.5)/sides
                # Superellipse section: broad carved facets and rounded corners.
                a, b = math.cos(angle), math.sin(angle)
                a = math.copysign(abs(a)**exponent, a); b = math.copysign(abs(b)**exponent, b)
                self.vertices.append(tuple(centre+u*a*widths[i]+v*b*heights[i]))
        limit = len(centres) if closed else len(centres)-1
        for i in range(limit):
            for j in range(sides):
                k = (j+1) % sides; ni = (i+1) % len(centres)
                self.faces.append((base+i*sides+j, base+i*sides+k, base+ni*sides+k, base+ni*sides+j))
                x0=distance[i]/.44; x1=(distance[ni] if ni else distance[-1]+(centres[0]-centres[-1]).length)/.44
                self.uvs.append(((x0,j/sides),(x0,(j+1)/sides),(x1,(j+1)/sides),(x1,j/sides)))
                self.materials.append(mat)
        if not closed:
            for i, reverse in [(0,True),(len(centres)-1,False)]:
                ids = list(range(sides)); ids = list(reversed(ids)) if reverse else ids
                self.faces.append(tuple(base+i*sides+j for j in ids))
                self.uvs.append(tuple((.5+.45*math.cos(2*math.pi*(j+.5)/sides), .5+.45*math.sin(2*math.pi*(j+.5)/sides)) for j in ids))
                self.materials.append(mat)
        self.parts[name] = {'vertex_start': base, 'vertex_end': len(self.vertices),
                            'polygon_start': first_face, 'polygon_end': len(self.faces)}

    def tube(self, name, points, radius, sides, mat, hint=(1,0,0), closed=False):
        self.loft(name, points, [radius]*len(points), [radius]*len(points), hint, sides, mat, closed, exponent=1)

    def make(self, name, rig, materials):
        mesh = bpy.data.meshes.new(name+'Mesh'); mesh.from_pydata(self.vertices, [], self.faces); mesh.update()
        uv = mesh.uv_layers.new(name='AuthoredGrainUV')
        for poly, coords, mat in zip(mesh.polygons, self.uvs, self.materials):
            poly.material_index = mat
            poly.use_smooth = len(poly.vertices) == 4
            for loop, value in zip(poly.loop_indices, coords): uv.data[loop].uv = value
        bm = bmesh.new(); bm.from_mesh(mesh); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(mesh); bm.free()
        obj = bpy.data.objects.new(name, mesh); bpy.context.scene.collection.objects.link(obj)
        for mat in materials: mesh.materials.append(mat)
        obj.parent = rig; vg = obj.vertex_groups.new(name='Hand_R'); vg.add(list(range(len(mesh.vertices))), 1, 'REPLACE')
        modifier = obj.modifiers.new('OriginalRigidWeapon', 'ARMATURE'); modifier.object = rig
        obj['original_weapon_parts'] = json.dumps(self.parts)
        obj['authorship'] = 'Original authored crossbow; original generated surface tiles; no external meshes or motion.'
        return obj


def build(lod, rig, materials):
    a = Author(); high = lod == 0; sides = 8 if high else 6
    # Tiller has a downturned heel, raised cheek and taper into the steel nose.
    rows = [(-.097,1.080,.023,.025),(-.086,1.087,.032,.031),(-.048,1.103,.032,.030),
            (.015,1.109,.028,.027),(.076,1.112,.023,.024),(.17,1.111,.021,.023),
            (.295,1.105,.020,.025),(.422,1.100,.024,.026),(.494,1.101,.026,.027),(.558,1.104,.015,.020)]
    if not high: rows = [rows[i] for i in (0,1,3,5,7,9)]
    a.loft('carved_stock',[(CX,y,z) for y,z,w,h in rows],[w for y,z,w,h in rows],[h for y,z,w,h in rows],(1,0,0),sides,0)
    # Each grip passes through the actual authored closed-glove channel.
    offsets = [-.083,-.072,-.047,.043,.075,.095] if high else [-.083,-.063,.054,.095]
    radii = [.012,.015,.0135,.0135,.014,.017] if high else [.012,.0135,.0135,.017]
    a.loft('trigger_grip',[RIGHT+RIGHT_AXIS*t for t in offsets],radii,radii,(1,0,0),sides,2,exponent=1)
    a.tube('support_grip',[LEFT+Vector((0,-.080,0)),LEFT+Vector((0,.080,0))],.0135,8 if high else 6,0)
    a.tube('support_rear',[(CX,.047,1.087),(CX,.047,1.016),(CX,.073,LEFT.z)],.011,6 if high else 4,0)
    a.tube('support_front',[(CX,.225,LEFT.z),(CX,.256,1.015),(CX,.274,1.045),(CX,.274,1.088)],.012,6 if high else 4,0)
    # Recurved prod: symmetric around the arrow axis, a solid tapered forging.
    half = [(0,.506,1.113,.023,.012),(.07,.501,1.114,.022,.011),(.14,.482,1.115,.020,.010),
            (.215,.451,1.116,.017,.009),(.278,.425,1.117,.014,.008),(.324,.420,1.118,.011,.007),(.344,.438,1.119,.008,.006)]
    if not high: half = [half[i] for i in (0,2,4,6)]
    prod = [(-x,y,z,w,h) for x,y,z,w,h in reversed(half[1:])] + half
    a.loft('solid_prod',[(CX+x,y,z) for x,y,z,w,h in prod],[w for x,y,z,w,h in prod],[h for x,y,z,w,h in prod],(0,0,1),8 if high else 4,1)
    for sign in (-1,1):
        a.tube('string_'+str(sign),[(CX+sign*.344,.438,1.119),(CX,.080,1.143)],.0021,6 if high else 4,2,hint=(0,0,1))
    # Recessed arrow bed, paired guide lips and a readable lock collar.
    for sign in (-1,1):
        rail=[(CX+sign*.009,.036,1.139),(CX+sign*.009,.12,1.138),(CX+sign*.009,.54,1.13)]
        if not high: rail = [rail[0],rail[-1]]
        a.loft('guide_'+str(sign),rail,[.003]*len(rail),[.004]*len(rail),(1,0,0),4,1)
    a.loft('lock',[(CX,.061,1.139),(CX,.098,1.139)],[.024,.022],[.014,.013],(1,0,0),8 if high else 6,1)
    # Trigger ahead of the fist, visible through its open guard.
    trigger=[(CX,.049,1.086),(CX,.057,1.066),(CX,.066,1.047)]
    a.tube('trigger',trigger,.004,6 if high else 4,1)
    guard=[(CX,.041,1.087),(CX,.061,1.072),(CX,.066,.973),(CX,.045,.932),(CX,.009,.929)]
    a.tube('trigger_guard',guard,.0045,6 if high else 4,1)
    # Stirrup is a real open ring at the nose, not a painted or solid disc.
    ring=[(CX-.019,.55,1.087),(CX-.046,.575,1.087),(CX-.045,.643,1.087),
          (CX-.026,.663,1.087),(CX+.026,.663,1.087),(CX+.045,.643,1.087),
          (CX+.046,.575,1.087),(CX+.019,.55,1.087)]
    if not high: ring=[ring[i] for i in (0,1,3,4,6,7)]
    a.tube('open_stirrup',ring,.006,6 if high else 4,1,hint=(0,0,1),closed=True)
    # Broad forged binding around the prod/stock joint, following the stock form.
    collar=[(CX,.480,1.102),(CX,.493,1.102)]
    a.loft('prod_binding',collar,[.030,.030],[.029,.029],(1,0,0),8 if high else 4,1)
    if high:
        a.loft('heel_cap',[(CX,-.101,1.080),(CX,-.094,1.082)],[.025,.027],[.026,.028],(1,0,0),8,1)
        for sign in (-1,1):
            a.tube('lock_pin_'+str(sign),[(CX+sign*.022,.080,1.139),(CX+sign*.026,.080,1.139)],.006,8,1,hint=(0,1,0))
    return a.make('CrossbowWeapon_LOD'+str(lod),rig,materials), a.parts


def main():
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == EXPECTED
    candidate = RUN/'candidate'; candidate.mkdir(parents=True,exist_ok=True); (RUN/'qa').mkdir(exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE)); rig=bpy.data.objects['crossbowRig20']
    paths=[('CarvedKingdomOak','art-factory/rts/runs/kingdom-siege/2026-10-04-original/candidate/textures/hewn-oak-basecolor.jpg',0,.66),
           ('ForgedKingdomSteel','art-factory/rts/runs/original-guard-surface-materials/2026-10-05/candidate/steel-512.png',.82,.38),
           ('WrappedKingdomLeather','art-factory/rts/runs/original-guard-surface-materials/2026-10-05/candidate/leather-512.png',0,.8)]
    materials=[material(*p) for p in paths]
    for lod in (0,1): bpy.data.objects.remove(bpy.data.objects[f'CrossbowWeapon_LOD{lod}'],do_unlink=True)
    made=[build(lod,rig,materials) for lod in (0,1)]; weapons=[m[0] for m in made]
    bodies=[bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'] for lod in (0,1)]
    hands=[bpy.data.objects['OriginalCrossbowClosedGrip_'+s] for s in ('L','R')]
    rig.animation_data.action=bpy.data.actions['Idle']; rig.animation_data.action_slot=bpy.data.actions['Idle'].slots[0]
    bpy.context.scene.frame_set(0); bpy.context.view_layer.update()
    for lod in (0,1): bodies[lod].hide_render=weapons[lod].hide_render=lod==1
    bpy.ops.wm.save_as_mainfile(filepath=str(candidate/'original-crossbow-grip.blend'))
    exporter=Path(__file__).with_name('original_crossbow_grip_build.py'); tree=ast.parse(exporter.read_text(encoding='utf-8'))
    fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='export_lod')
    ns={'bpy':bpy,'os':os};exec(compile(ast.Module(body=[fn],type_ignores=[]),str(exporter),'exec'),ns)
    for lod in (0,1):
        ns['export_lod'](rig,bodies,weapons,[],hands,str(candidate/f'original-crossbow-grip-lod{lod}.glb'),bodies[lod].name,weapons[lod].name)
    report={'source_sha256':EXPECTED,'status':'candidate','runtime_publish_allowed':False,
            'grip_channel_bind_space':{'R':{'center':list(RIGHT),'axis':list(RIGHT_AXIS)},'L':{'center':list(LEFT),'axis':[0,1,0]}},
            'parts':{str(lod):m[1] for lod,m in enumerate(made)},
            'materials':[{'name':p[0],'path':p[1],'sha256':hashlib.sha256((ROOT/p[1]).read_bytes()).hexdigest(),'metallic':p[2],'roughness':p[3]} for p in paths],
            'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in candidate.iterdir() if p.suffix in ('.blend','.glb')},
            'exporter_sha256':hashlib.sha256(exporter.read_bytes()).hexdigest()}
    (candidate/'weapon-candidate-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print('ORIGINAL_WEAPON_CANDIDATE',json.dumps(report['files']))


if __name__=='__main__': main()
