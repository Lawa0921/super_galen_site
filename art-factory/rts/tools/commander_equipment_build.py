"""Original fitted commander equipment. Produces a full-character candidate only.

The body is the original current master; no downloaded mesh/animation is used.
Authoring coordinates are metres, Blender Z-up / +Y forward. Every component
has its own contour and UVs before the assembled equipment is rigid-skinned.
"""
import bpy
import bmesh
import hashlib
import json
import math
import sys
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_weapon_build import Author

SOURCE=ROOT/'art-factory/rts/runs/human-units/2026-10-05-v2/commander/candidate/commander-production-v2.blend'
SOURCE_HASH='87f7ed4681487e38a3d3b4f26b4689ed16d96b179be7380ca62d42673482c515'
RUN=ROOT/'art-factory/rts/runs/commander-equipment/2026-10-08-v3'
RIGHT=Vector((.428,.156,.983))
LEFT=Vector((-.419,.137,.985))
SURFACES=ROOT/'public/assets/games/rts/materials/detail-v1'


def surface(name,metal,roughness):
    mat=bpy.data.materials.new('Commander_'+name);mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Metallic'].default_value=metal;bsdf.inputs['Roughness'].default_value=roughness
    for suffix,space in [('color.jpg','sRGB'),('normal.png','Non-Color')]:
        image=bpy.data.images.load(str(SURFACES/f'{name}-{suffix}'),check_existing=True);image.pack();image.colorspace_settings.name=space
        tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image
        if suffix.startswith('color'):mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
        else:
            normal=mat.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.24
            mat.node_tree.links.new(tex.outputs['Color'],normal.inputs['Color']);mat.node_tree.links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
    return mat


def add_mesh(a,name,vertices,faces,mat,uv_scale=.5):
    start=len(a.vertices);first=len(a.faces);a.vertices.extend(vertices)
    for face in faces:
        a.faces.append(tuple(start+i for i in face));a.materials.append(mat)
        a.uvs.append(tuple((vertices[i][0]/uv_scale,vertices[i][2]/uv_scale) for i in face))
    a.parts[name]={'vertex_start':start,'vertex_end':len(a.vertices),'polygon_start':first,'polygon_end':len(a.faces)}


def finish(a,name,rig,bone,materials):
    obj=a.make(name,rig,materials)
    obj.vertex_groups.clear();group=obj.vertex_groups.new(name=bone);group.add(list(range(len(obj.data.vertices))),1,'REPLACE')
    obj['authorship']='Original commander modular equipment; original generated PBR surfaces; no external mesh or motion.'
    obj['assembly_socket']=bone
    # Hard blade facets and shield embossing retain their authored bevel normals.
    for polygon in obj.data.polygons:polygon.use_smooth=False
    return obj


def sword(lod,rig,materials):
    a=Author();high=lod==0;sides=10 if high else 6
    def points(rows):return [RIGHT+Vector(row) for row in rows]
    # The actual fist channel is forward of the old heuristic hand-bone socket.
    rows=[(-.108,.013),(-.091,.017),(-.055,.019),(.035,.018),(.085,.020),(.096,.023)]
    a.loft('leather_grip',points([(0,0,z) for z,r in rows]),[r for z,r in rows],[r*.84 for z,r in rows],(1,0,0),sides,3,exponent=.85)
    if high:
        helix=[RIGHT+Vector((.020*math.cos(i*math.tau/10),.017*math.sin(i*math.tau/10),-.083+i*.17/60)) for i in range(61)]
        a.tube('stitched_grip_binding',helix,.0016,4,1,hint=(1,0,0))
    for z in (-.10,.09):a.loft('grip_ferrule_'+str(z),points([(0,0,z-.006),(0,0,z+.006)]),[.024]*2,[.020]*2,(1,0,0),sides,1)
    # Swept quillons have flared, downturned tips and a reinforced centre block.
    quillons=[(-.178,-.005,.079,.010),(-.169,-.003,.086,.019),(-.120,.008,.112,.016),(-.050,.010,.125,.017),(0,.008,.130,.022),(.05,.01,.125,.017),(.12,.008,.112,.016),(.169,-.003,.086,.019),(.178,-.005,.079,.010)]
    a.loft('swept_crossguard',points([(x,y,z) for x,y,z,r in quillons]),[r for x,y,z,r in quillons],[r*.8 for x,y,z,r in quillons],(0,1,0),sides,1)
    # A tapered diamond blade with a shallow fuller and individually bevelled edges.
    rows=[(.142,.030,.012),(.16,.037,.013),(.25,.034,.011),(.61,.026,.008),(.83,.014,.005),(.925,.0007,.0006)]
    section=[(-1,0),(-.83,-.6),(-.27,-1),(0,-.72),(.27,-1),(.83,-.6),(1,0),(.83,.6),(.27,1),(0,.72),(-.27,1),(-.83,.6)]
    if not high:section=[(-1,0),(-.24,-1),(.24,-1),(1,0),(.24,1),(-.24,1)]
    vertices=[tuple(RIGHT+Vector((x*w,y*d,z))) for z,w,d in rows for x,y in section];n=len(section)
    faces=[(r*n+i,r*n+(i+1)%n,(r+1)*n+(i+1)%n,(r+1)*n+i) for r in range(len(rows)-1) for i in range(n)]
    faces.extend([tuple(reversed(range(n))),tuple((len(rows)-1)*n+i for i in range(n))]);add_mesh(a,'fullered_blade',vertices,faces,0,.3)
    pommel=[(-.178,.009),(-.166,.025),(-.145,.034),(-.12,.026),(-.109,.017)]
    a.loft('pear_pommel',points([(0,0,z) for z,r in pommel]),[r for z,r in pommel],[r*.68 for z,r in pommel],(1,0,0),sides,1,exponent=1)
    return finish(a,'CommanderLongsword_LOD'+str(lod),rig,'Hand_R',materials)


def shield(lod,rig,materials):
    a=Author();high=lod==0;center=Vector((LEFT.x,.245,1.115))
    outline=[(-.223,.303),(-.182,.35),(0,.369),(.182,.35),(.223,.303),(.209,-.055),(.154,-.22),(0,-.365),(-.154,-.22),(-.209,-.055)]
    def front(x,z):return .047*(1-(x/.23)**2)+.009*(1-(z/.38)**2)
    def point(x,y,z):return tuple(center+Vector((x,y,z)))
    # Concentric, curved surfaces form a closed laminated shell; the front has
    # genuine depth across the width instead of a flat rectangle with a texture.
    vertices=[];rings=[1,.92,.62,.30];n=len(outline)
    for back in (False,True):
        for scale in rings:
            for x,z in outline:
                x*=scale;z*=scale;vertices.append(point(x,front(x,z)-(.033 if back else 0),z))
        vertices.append(point(0,front(0,0)-(.033 if back else 0),0))
    faces=[];side_vertices=len(rings)*n+1
    for back in (False,True):
        base=side_vertices if back else 0
        for ring in range(len(rings)-1):
            for i in range(n):
                face=(base+ring*n+i,base+ring*n+(i+1)%n,base+(ring+1)*n+(i+1)%n,base+(ring+1)*n+i)
                faces.append(tuple(reversed(face)) if back else face)
        for i in range(n):
            face=(base+(len(rings)-1)*n+i,base+(len(rings)-1)*n+(i+1)%n,base+side_vertices-1)
            faces.append(tuple(reversed(face)) if back else face)
    for i in range(n):faces.append((i,(i+1)%n,side_vertices+(i+1)%n,side_vertices+i))
    add_mesh(a,'bowed_shield',vertices,faces,4,.65)
    rim=[point(x,front(x,z)+.002,z) for x,z in outline]
    a.loft('formed_steel_rim',rim,[.014]*n,[.014]*n,(0,1,0),8 if high else 4,0,closed=True,exponent=.75)
    inlay=[point(x*.9,front(x*.9,z*.9)+.003,z*.9) for x,z in outline]
    a.tube('brass_inlay',inlay,.0034,6 if high else 4,1,hint=(0,1,0),closed=True)
    # Domed dawn boss and eight solid raised rays, reflecting the chest emblem.
    boss_z=.045;boss_center=center+Vector((0,front(0,boss_z)+.003,boss_z))
    rings=[(0,.058),(.012,.064),(.022,.057),(.037,.032),(.041,.009)]
    a.loft('dawn_boss',[boss_center+Vector((0,y,0)) for y,r in rings],[r for y,r in rings],[r for y,r in rings],(1,0,0),16 if high else 8,1,exponent=1)
    for i in range(8):
        angle=i*math.tau/8;length=.143 if i%2==0 else .111
        radial=Vector((math.sin(angle),0,math.cos(angle)));side=Vector((math.cos(angle),0,-math.sin(angle)))
        base=boss_center+radial*.045
        verts=[tuple(base-side*.019),tuple(base+side*.019),tuple(boss_center+radial*length),tuple(base+Vector((0,.017,0))+radial*.025)]
        add_mesh(a,'dawn_ray_'+str(i),verts,[(0,2,1),(0,1,3),(1,2,3),(2,0,3)],1,.2)
    # Rear grip and a bowed forearm strap are complete geometry, with anchors.
    a.loft('rear_grip',[LEFT+Vector((0,0,z)) for z in (-.078,-.057,.061,.080)],[.014,.018,.018,.014],[.014]*4,(1,0,0),8 if high else 6,3,exponent=.85)
    for z in (-.081,.083):
        a.tube('grip_anchor_'+str(z),[LEFT+Vector((0,0,z)),Vector((LEFT.x,.247,LEFT.z+z))],.013,8 if high else 6,0)
    strap=[(-.066,.020,.15),(-.083,-.044,.15),(-.053,-.096,.15),(.043,-.096,.15),(.078,-.044,.15),(.063,.020,.15)]
    a.loft('forearm_strap',[center+Vector(p) for p in strap],[.020]*len(strap),[.005]*len(strap),(0,0,1),6 if high else 4,3)
    if high:
        for i,(x,z) in enumerate(outline):
            x*=.91;z*=.91;p=center+Vector((x,front(x,z)+.009,z))
            a.loft('rim_rivet_'+str(i),[p,p+Vector((0,.005,0))],[.0055,.0035],[.0055,.0035],(1,0,0),6,1,exponent=1)
    return finish(a,'CommanderDawnShield_LOD'+str(lod),rig,'Hand_L',materials)


def topology(obj):
    bm=bmesh.new();bm.from_mesh(obj.data);bm.normal_update()
    report={'triangles':sum(len(p.vertices)-2 for p in obj.data.polygons),'vertices':len(obj.data.vertices),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),'zero_area_faces':sum(f.calc_area()<1e-12 for f in bm.faces),'materials':len(obj.data.materials)}
    bm.free();return report


def main():
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==SOURCE_HASH
    for directory in ('raw','candidate','qa'):(RUN/directory).mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['commanderRig20']
    rig.animation_data.action=bpy.data.actions['Idle'];rig.animation_data.action_slot=bpy.data.actions['Idle'].slots[0];bpy.context.scene.frame_set(0)
    for lod in (0,1):
        for name in ('CommanderLongsword','CommanderDawnShield'):bpy.data.objects.remove(bpy.data.objects[f'{name}_LOD{lod}'],do_unlink=True)
    materials=[surface('steel',.65,.36),surface('brass',.62,.38),surface('oak',0,.68),surface('leather',0,.75),bpy.data.materials['TeamCloth_Shield']]
    made={lod:[sword(lod,rig,materials),shield(lod,rig,materials)] for lod in (0,1)}
    report={'source_sha256':SOURCE_HASH,'runtime_publish_allowed':False,'status':'candidate','geometry':{obj.name:topology(obj) for objects in made.values() for obj in objects},'socket_bind_positions':{'sword':list(RIGHT),'shield':list(LEFT)},'body_geometry_weights_and_actions':'unchanged; full-cycle contacts must be checked before approval','materials':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for name in ('steel','brass','oak','leather') for p in (SURFACES/(name+'-color.jpg'),SURFACES/(name+'-normal.png'))},'files':{}}
    assert all(not data['nonmanifold_edges'] and not data['zero_area_faces'] for data in report['geometry'].values())
    bpy.context.scene.frame_set(0)
    for lod,objects in made.items():
        for obj in [bpy.data.objects[f'commanderOriginalBody_LOD{lod}'],*objects]:obj.hide_render=lod==1
    blend=RUN/'raw/commander-equipment-v3.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    report['files'][str(blend.relative_to(ROOT))]=hashlib.sha256(blend.read_bytes()).hexdigest()
    for lod,objects in made.items():
        bpy.ops.object.select_all(action='DESELECT')
        selected=[rig,bpy.data.objects[f'commanderOriginalBody_LOD{lod}'],*objects]
        for obj in selected:obj.hide_set(False);obj.select_set(True)
        bpy.context.view_layer.objects.active=rig
        path=RUN/f'candidate/commander-lod{lod}.glb'
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_image_format='JPEG',export_jpeg_quality=90,export_skins=True,export_yup=True,export_def_bones=True,export_extras=True)
        report['files'][str(path.relative_to(ROOT))]=hashlib.sha256(path.read_bytes()).hexdigest()
    (RUN/'qa/build.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print('COMMANDER_CANDIDATE',json.dumps(report['geometry']))


if __name__=='__main__':main()
