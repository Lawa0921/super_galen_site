"""Expose the generated saddle and refit its supplementary functional tack."""
import argparse,base64,json,math,sys
from pathlib import Path
import bpy,bmesh,numpy as np
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
from visual_knight_seat_test import select_clip,sole_sets
from visual_knight_motion_test import positions
from visual_hand_rework import mesh_fingerprint

def surface(name,vertices,faces,material,rig,skin,uvs):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata([skin.inverted()@Vector(v) for v in vertices],[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);mesh.materials.append(material)
    uv=mesh.uv_layers.new(name='UVMap')
    for face in mesh.polygons:
        face.use_smooth=True
        for i in face.loop_indices:uv.data[i].uv=uvs[mesh.loops[i].vertex_index]
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
    obj.vertex_groups.new(name='HorseBody').add(list(range(len(mesh.vertices))),1,'REPLACE')
    mod=obj.modifiers.new('Horse tack skin','ARMATURE');mod.object=rig
    obj['source']='knight_build.py existing ForgedStirrup cross section and saddle leather; refitted to actual generated boot sole'
    return obj

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--run',type=Path,required=True);p.add_argument('--lod',type=int,required=True)
    p.add_argument('--prepare-mask',action='store_true')
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run=a.run.resolve();lod=a.lod
    for part in ('raw','candidate','qa'):(run/part).mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));select_clip('Idle');bpy.context.scene.frame_set(1)
    horse=next(o for o in bpy.data.objects if o.name.startswith('NeuralWarhorse_'));body=next(o for o in bpy.data.objects if o.name.startswith('MountedKnightBody_'))
    if a.prepare_mask:
        uv=horse.data.uv_layers.active;polygons=[]
        for face in horse.data.polygons:
            center=horse.matrix_world@face.center
            if abs(center.x)>.20 and -.72<center.y<.45 and .88<center.z<1.50:
                polygons.append([list(uv.data[i].uv) for i in face.loop_indices])
        assert len(polygons)>20,'Missing generated saddlecloth surface'
        (run/'qa/horse-cloth-region.json').write_text(json.dumps({'source':str(a.source),'uv_polygons':polygons})+'\n');return
    rig=bpy.data.objects['WarhorseRig'];unchanged={o.name:mesh_fingerprint(o) for o in bpy.data.objects if o.type=='MESH' and not o.name.startswith(('ForgedStirrup','SaddleTeamCloth','LeatherRein'))}
    brass=next(m for m in bpy.data.materials if m.name.startswith('AgedBrassTack')).copy();brass.name='RefittedAgedBrassTack'
    shader=next(n for n in brass.node_tree.nodes if n.type=='BSDF_PRINCIPLED');shader.inputs['Base Color'].default_value=(.22,.145,.064,1);shader.inputs['Roughness'].default_value=.62
    leather=next(m for m in bpy.data.materials if m.name.startswith('DarkSaddleLeather'))
    removed=[]
    for obj in list(bpy.data.objects):
        if obj.type=='MESH' and obj.name.startswith(('ForgedStirrup','SaddleTeamCloth','LeatherRein')):
            removed.append({'name':obj.name,'source_fingerprint':mesh_fingerprint(obj)});bpy.data.objects.remove(obj,do_unlink=True)
    root=rig.pose.bones['HorseBody'];skin=rig.matrix_world@root.matrix@root.bone.matrix_local.inverted()@rig.matrix_world.inverted()
    points=positions(body);sets=sole_sets(body);rows=[]
    surface_tree=BVHTree.FromPolygons([Vector(v) for v in points],[list(p.vertices) for p in body.data.polygons])
    for side in 'LR':
        boot=points[sets[side]['all']];x,y=(-.48595,.11541) if side=='L' else (.44865,.22635)
        support=boot[(abs(boot[:,1]-y)<.04)&(abs(boot[:,0]-x)<.055)]
        assert len(support)>2,('Missing boot ball region',side)
        hit=surface_tree.ray_cast(Vector((x,y,.5)),Vector((0,0,1)))
        assert hit[0] and .75<hit[0].z<1.05,('Missing actual boot sole surface',side,hit[0])
        z=float(hit[0].z)-.0055;center=Vector((x,y,z));width=.070;height=.185
        # Refit the source U-shaped metal section into a compact closed D
        # ring. The wider, flatter bottom section is the functional tread.
        profile=[(-width,0),(width,0),(width,.065),(.062,.135),(.037,.175),(0,height),(-.037,.175),(-.062,.135),(-width,.065)]
        vertices=[];faces=[];uvs=[];sides=8 if lod==0 else 6
        for row,(px,pz) in enumerate(profile):
            prev=Vector((profile[row-1][0],0,profile[row-1][1]));nxt=Vector((profile[(row+1)%len(profile)][0],0,profile[(row+1)%len(profile)][1]))
            tangent=(nxt-prev).normalized();radial=Vector((tangent.z,0,-tangent.x));c=center+Vector((px,0,pz))
            for j in range(sides):
                angle=2*math.pi*j/sides;radius=.004 if row<2 else .006
                vertices.append(c+radial*(radius*math.cos(angle))+Vector((0,(.015 if row<2 else .008)*math.sin(angle),0)));uvs.append((row/len(profile),j/sides))
        for row in range(len(profile)):
            for j in range(sides):faces.append((row*sides+j,row*sides+(j+1)%sides,((row+1)%len(profile))*sides+(j+1)%sides,((row+1)%len(profile))*sides+j))
        surface(f'ForgedStirrup_{side}_LOD{lod}',vertices,faces,brass,rig,skin,uvs)
        top=Vector((-.31 if side=='L' else .31,-.02,1.35));bottom=center+Vector((0,0,height+.006));mid=top.lerp(bottom,.50);mid.x+=(-.02 if side=='L' else .02)
        # The source's long metal hanger becomes a narrow leather strap;
        # eight bevel corners give thickness without a coarse rectangular bar.
        section=[(-.010,-.002),(.010,-.002),(.012,-.001),(.012,.001),(.010,.002),(-.010,.002),(-.012,.001),(-.012,-.001)]
        vertices=[];faces=[];uvs=[]
        for row,c in enumerate((top,mid,bottom)):
            for j,(dx,dy) in enumerate(section):vertices.append(c+Vector((dx,dy,0)));uvs.append((j/8,row/2))
        for row in range(2):
            for j in range(8):faces.append((row*8+j,row*8+(j+1)%8,(row+1)*8+(j+1)%8,(row+1)*8+j))
        faces.extend((tuple(reversed(range(8))),tuple(range(16,24))))
        surface(f'StirrupLeather_{side}_LOD{lod}',vertices,faces,leather,rig,skin,uvs)
        rows.append({'side':side,'tread_center_world':list(center),'strap_top_world':list(top),'ring_height_m':height})
    # Preserve the source horse's embroidered blue cloth, gold sun and
    # leather saddle. Only its blue texels participate in team tinting.
    material=horse.data.materials[0].copy();material.name='TeamClothMasked_HorseChestnut'
    material['teamTintMask']='data:image/png;base64,'+base64.b64encode((run/'candidate/horse-team-mask-1024.png').read_bytes()).decode()
    horse.data.materials[0]=material
    for name,digest in unchanged.items():assert mesh_fingerprint(bpy.data.objects[name])==digest,('Unrelated source mesh changed',name)
    bpy.ops.file.pack_all();bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(run/f'raw/knight-lod{lod}.blend'))
    for obj in bpy.data.objects:
        if obj.animation_data:
            obj.animation_data.action=None
            for track in obj.animation_data.nla_tracks:track.mute=False
    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.data.objects:
        if obj.type in ('MESH','ARMATURE'):obj.select_set(True)
    bpy.context.view_layer.objects.active=rig
    bpy.ops.export_scene.gltf(filepath=str(run/'candidate'/('knight.glb' if lod==0 else 'knight-lod1.glb')),export_format='GLB',use_selection=True,export_yup=True,export_normals=True,export_texcoords=True,export_materials='EXPORT',export_extras=True,export_skins=True,export_def_bones=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_anim_slide_to_zero=True,export_image_format='JPEG',export_jpeg_quality=90)
    (run/f'qa/tack-build-lod{lod}.json').write_text(json.dumps({'source':str(a.source),'removed_duplicate_overlays':removed,'stirrups':rows,'death_foot_release_after_phase':.02,'unchanged_mesh_fingerprints':unchanged,'runtime_publish_allowed':False},indent=2)+'\n')

if __name__=='__main__':main()
