"""Build an original editable helmet, then inspect actual exported surfaces."""
from pathlib import Path
import sys,json,hashlib,math
import bpy,bmesh,numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from original_guard_helmet_rebuild_math import crown_cage,visor_cage,crown_point,visor_point,cylindrical_surface_uvs,resample_texture_box
from original_guard_tabard_blender import evaluated
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-guard-helmet-rebuild/2026-10-05'
PARTS=[];CAGES=[]


def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def write(path,data):path.write_bytes((json.dumps(data,indent=2)+'\n').encode())


def activate(obj):
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj


def apply(obj,modifier):
    activate(obj);bpy.ops.object.modifier_apply(modifier=modifier.name)


def surface(name,vertices,faces,subdiv=0,thickness=0,authored=None):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
    cage=obj.copy();cage.data=obj.data.copy();cage.name=name+'_AuthoredCage'
    if authored is not None:
        cage.data=bpy.data.meshes.new(cage.name);cage.data.from_pydata(authored[0],[],authored[1]);cage.data.update()
    bpy.context.collection.objects.link(cage);cage.hide_render=True;cage.hide_set(True);CAGES.append(cage)
    preview=cage.modifiers.new('Non-destructive high quality cage preview','SUBSURF');preview.levels=2;preview.render_levels=2
    if thickness:
        preview=cage.modifiers.new('Non-destructive authored plate thickness','SOLIDIFY');preview.thickness=thickness;preview.offset=-1
    if subdiv:
        mod=obj.modifiers.new('Original smooth control surface','SUBSURF');mod.levels=subdiv;mod.render_levels=subdiv;apply(obj,mod)
    if thickness:
        mod=obj.modifiers.new('Physical plate thickness','SOLIDIFY');mod.thickness=thickness;mod.offset=-1;apply(obj,mod)
        # Brass covers the plate hems; avoiding a repeated geometric bevel keeps LOD0 clean.
    for p in obj.data.polygons:p.use_smooth=True
    PARTS.append(obj);return obj


def trim(name,points,radius=.0016):
    # Original four-sided fine rolled strip: cyclic rings and capped open ends.
    points=np.asarray(points,float);closed=np.linalg.norm(points[0]-points[-1])<1e-8
    if closed:points=points[:-1]
    sides=4;vertices=[];previous=None
    for i,point in enumerate(points):
        before=points[(i-1)%len(points)] if closed or i else point
        after=points[(i+1)%len(points)] if closed or i<len(points)-1 else point
        tangent=Vector(after-before).normalized()
        if previous is None:
            reference=Vector((0,0,1)) if abs(tangent.z)<.9 else Vector((0,1,0))
            normal=tangent.cross(reference).normalized()
        else:
            normal=(previous-tangent*previous.dot(tangent)).normalized()
        binormal=tangent.cross(normal).normalized();previous=normal
        for angle in np.linspace(0,2*math.pi,sides,endpoint=False):
            vertices.append(Vector(point)+radius*(math.cos(angle)*normal+math.sin(angle)*binormal))
    faces=[];segments=len(points) if closed else len(points)-1
    for i in range(segments):
        for j in range(sides):
            a=i*sides+j;b=i*sides+(j+1)%sides;c=((i+1)%len(points))*sides+(j+1)%sides;d=((i+1)%len(points))*sides+j
            faces.append([a,b,c,d])
    if not closed:
        faces.append(list(reversed(range(sides))))
        faces.append(list(range((len(points)-1)*sides,len(points)*sides)))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
    for p in mesh.polygons:p.use_smooth=True
    PARTS.append(obj);return obj


def cleanup(obj):
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
    bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=1e-9)
    bmesh.ops.triangulate(bm,faces=list(bm.faces),quad_method='BEAUTY',ngon_method='BEAUTY')
    bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=1e-9)
    degenerate=[f for f in bm.faces if f.calc_area()<1e-13]
    if degenerate:bmesh.ops.delete(bm,geom=degenerate,context='FACES_ONLY')
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    for face in bm.faces:face.smooth=True
    for edge in bm.edges:
        edge.smooth=edge.is_manifold and edge.calc_face_angle(0)<math.radians(100 if 'Brass' in obj.name or 'Rim' in obj.name or 'Crest' in obj.name or 'RolledEdge' in obj.name else 45)
    bm.to_mesh(obj.data);bm.free();obj.data.update()


def uv_and_material(obj,material,repeat=.035,center_y=-.026,radii=(.110,.141)):
    obj.data.materials.clear();obj.data.materials.append(material)
    mesh=obj.data
    while mesh.uv_layers:mesh.uv_layers.remove(mesh.uv_layers[0])
    layer=mesh.uv_layers.new(name='ContinuousSurfaceUV')
    coordinates=cylindrical_surface_uvs([v.co[:] for v in mesh.vertices],[list(p.vertices) for p in mesh.polygons],repeat,center_y,radii)
    for polygon,uvs in zip(mesh.polygons,coordinates):
        for loop,uv in zip(polygon.loop_indices,uvs):layer.data[loop].uv=uv
    obj['surface_uv_method']='continuous angular; integer-tile rear seam; physical vertical repeat'
    obj['surface_repeat_m']=repeat


def material(name,file,metallic,roughness,sample_factor=1):
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    bsdf=mat.node_tree.nodes['Principled BSDF'];bsdf.inputs['Metallic'].default_value=metallic;bsdf.inputs['Roughness'].default_value=roughness
    path=ROOT/'art-factory/rts/runs/original-guard-surface-materials/2026-10-05/candidate'/file
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(path),check_existing=True);tex.extension='REPEAT';tex.interpolation='Linear'
    if sample_factor>1:
        source=tex.image;width,height=source.size
        pixels=np.asarray(source.pixels[:]).reshape(height,width,4)
        # Exact crop from the existing generated tile removes its baked broad light band.
        patch=pixels[96:160,96:160,:]
        horizontal=np.concatenate((patch,patch[:,::-1,:]),axis=1)
        source_tile=np.concatenate((horizontal,horizontal[::-1,:,:]),axis=0)
        sampled=resample_texture_box(source_tile,sample_factor)
        filtered=bpy.data.images.new('Original steel area-sampled detail',width=sampled.shape[1],height=sampled.shape[0],alpha=True)
        filtered.colorspace_settings.name=source.colorspace_settings.name
        filtered.pixels.foreach_set(sampled.astype(np.float32).reshape(-1));filtered.update()
        filtered.filepath_raw=str(RUN/'candidate'/f'steel-sampled-{sampled.shape[1]}.png');filtered.file_format='PNG';filtered.save()
        tex.image=filtered;mat['source_sha256']=sha(path);mat['sample_factor']=sample_factor
        mat['sampling_mean_error']=float(np.abs(patch.mean(axis=(0,1))-sampled.mean(axis=(0,1))).max())
        mat['source_crop_px']=[96,96,160,160]
    tex.image.pack()
    mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
    return mat


def bind(obj,rig,bone):
    vg=obj.vertex_groups.new(name=bone);vg.add(list(range(len(obj.data.vertices))),1.,'REPLACE')
    mod=obj.modifiers.new('Original portrait rigid part','ARMATURE');mod.object=rig;obj.parent=rig


def topology(obj):
    bm=bmesh.new();bm.from_mesh(obj.data)
    result={'vertices':len(bm.verts),'triangles':sum(len(f.verts)-2 for f in bm.faces),'boundary_edges':sum(e.is_boundary for e in bm.edges),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),'zero_area_faces':sum(f.calc_area()<1e-13 for f in bm.faces)}
    bm.free();return result


def main():
    for folder in ['candidate','qa/renders']:(RUN/folder).mkdir(parents=True,exist_ok=True)
    source=ROOT/'art-factory/rts/runs/original-guard-portrait-study/2026-10-05/candidate/original-guard-portrait-study.blend'
    bpy.ops.wm.open_mainfile(filepath=str(source));scene=bpy.context.scene;scene.frame_set(0)
    rig=bpy.data.objects['OriginalPortraitControls'];body=bpy.data.objects['OriginalGuardPortraitBust']
    for obj in list(bpy.data.objects):
        if obj not in [body,rig]:bpy.data.objects.remove(obj,do_unlink=True)
    body.name='UnfinishedOriginalTorsoContext'
    bm=bmesh.new();bm.from_mesh(body.data)
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-8,plane_co=(0,0,1.532),plane_no=(0,0,1),clear_outer=True)
    bm.to_mesh(body.data);bm.free();body.data.update()
    steel=material('Original generated silver steel','steel-512.png',.78,.53,sample_factor=2)
    brass=material('Original generated pale brass','brass-512.png',.76,.39)
    cloth=material('Original generated navy padded lining','cloth-512.png',0,.91)
    crown=surface('OriginalCrownShell',*crown_cage(32,rows=(0,.08,.16,.24,.32,.40,.48,.56,.64,.72,.80,.88,.94,.98)),thickness=.0025,authored=crown_cage())
    visor=surface('OriginalPerforatedVisor',*visor_cage(32,rows=(0,.33,.67,1)),thickness=.0026,authored=visor_cage())
    # Actual through-holes are cut only through the visor; no painted black dots.
    cutters=bpy.data.collections.new('Original visor drill tools');scene.collection.children.link(cutters)
    centers=[]
    for sign in [-1,1]:
        for row,t in enumerate([.27,.43,.60,.76]):
            for theta in [.27,.48,.69]:
                angle=sign*(theta+(row%2)*.018);point=Vector(visor_point(angle,t));normal=Vector((math.sin(angle),math.cos(angle),0))
                bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.00185,depth=.038,location=point)
                cutter=bpy.context.object;cutter.rotation_euler=normal.to_track_quat('Z','Y').to_euler()
                for col in list(cutter.users_collection):col.objects.unlink(cutter)
                cutters.objects.link(cutter);centers.append((point,normal))
    mod=visor.modifiers.new('Twenty four true breathing apertures','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.operand_type='COLLECTION';mod.collection=cutters;apply(visor,mod)
    for obj in list(cutters.objects):bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.collections.remove(cutters)
    # Tiny aperture bevels produced degenerate fragments; LOD0 keeps clean drilled walls.
    # Brass is separate modeled metal, never a face-center texture mask.
    trims=[]
    for name,t in [('VisorLowerRolledBrass',1),('VisorUpperRolledBrass',0)]:
        pts=[np.asarray(visor_point(a,t))+[0,.0012,0] for a in np.linspace(-1.65,1.65,33)]
        trims.append(trim(name,pts,.00125 if t==0 else .00165))
    pts=[np.asarray(crown_point(a,0))+[0,0,-.0004] for a in np.linspace(0,2*math.pi,33)]
    trims.append(trim('CrownContinuousBrowRim',pts,.00145))
    pts=[np.asarray(crown_point(0,t))+[0,.0008,.0012] for t in np.linspace(0,.985,17)]
    pts += [np.asarray(crown_point(math.pi,t))+[0,-.0008,.0012] for t in np.linspace(.985,0,17)]
    trims.append(trim('CrownOriginalCentralCrest',pts,.0019))
    # Padded inner neck and overlapping chest collar have independent surfaces.
    def rings(name,levels,subdiv,thickness):
        count=32;v=[]
        for z,xr,yr in levels:
            for a in np.linspace(0,2*math.pi,count,endpoint=False):v.append([xr*math.sin(a),-.016+yr*math.cos(a),z])
        f=[]
        for j in range(len(levels)-1):
            for i in range(count):a=j*count+i;b=j*count+(i+1)%count;f.append([a,b,b+count,a+count])
        return surface(name,v,f,subdiv,thickness)
    lining=rings('OriginalPaddedHelmetLiner',[(1.525,.074,.080),(1.535,.078,.085),(1.66,.080,.10),(1.700,.078,.101)],0,.004)
    collar=rings('OriginalLayeredGorget',[(1.505,.137,.117),(1.535,.115,.108),(1.553,.102,.104),(1.563,.101,.104)],0,.0025)
    collar_trim=trim('GorgetRolledEdge',[[.101*math.sin(a),-.016+.104*math.cos(a),1.563] for a in np.linspace(0,2*math.pi,33)],.0013)
    for obj in PARTS:cleanup(obj)
    uv_and_material(crown,steel)
    uv_and_material(visor,steel,center_y=-.024,radii=(.110,.141))
    uv_and_material(collar,steel,center_y=-.016,radii=(.119,.111))
    for obj in trims+[collar_trim]:uv_and_material(obj,brass,.055)
    uv_and_material(lining,cloth,.03,center_y=-.016,radii=(.078,.09))
    for obj in PARTS:bind(obj,rig,'PortraitChest' if obj in [collar,collar_trim] else 'PortraitHead')
    # Preserve original four-second authored motion and its explicit timebase.
    scene.render.fps=30;scene.render.fps_base=1.;scene.frame_start=0;scene.frame_end=120
    scene.frame_set(0);bpy.context.view_layer.update()
    visor_vertices,visor_faces=evaluated(visor);bvh=BVHTree.FromPolygons(visor_vertices.tolist(),visor_faces.tolist(),all_triangles=True)
    hole_rays=[]
    for point,normal in centers:
        hit=bvh.ray_cast(point+normal*.012,-normal,.024)
        hole_rays.append(hit[0] is None)
    report={'status':'candidate_pending_visual_review','runtime_publish_allowed':False,'source_original_motion_blend_sha256':sha(source),'components':{obj.name:topology(obj) for obj in PARTS},'breathing_holes_expected':24,'breathing_holes_clear_rays':sum(hole_rays),'unfinished_torso_context':True,'original_control_cages':[obj.name for obj in CAGES],'source_policy':'Original authored cage mesh and project-generated material tiles only; no rejected neural helmet faces retained.'}
    report['total_triangles']=sum(v['triangles'] for v in report['components'].values())
    report['lod0_triangle_budget']=6000
    report['surface_sampling']={'uv':'continuous angular with rear integer-tile seam','steel_repeat_m':.035,'steel_area_sample_factor':2,'steel_source_crop_px':[96,96,160,160],'steel_roughness':.53,'color_mean_error':steel.get('sampling_mean_error'),'before_renders':'qa/renders/before'}
    report['mesh_gate_passed']=report['total_triangles']<=6000 and all(v['boundary_edges']==v['nonmanifold_edges']==v['zero_area_faces']==0 for v in report['components'].values())
    if not report['mesh_gate_passed']:report['status']='qa_failed'
    bpy.context.preferences.filepaths.save_version=0
    blend=RUN/'candidate/original-guard-helmet-rebuild.blend';glb=RUN/'candidate/original-guard-helmet-rebuild.glb'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in PARTS+[body,rig]:obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_animations=True)
    report.update({'blend_sha256':sha(blend),'glb_sha256':sha(glb)})
    reference={}
    for frame in [0,30,60,90,120]:
        scene.frame_set(frame);bpy.context.view_layer.update();reference[str(frame)]={}
        for obj in PARTS:
            p,_=evaluated(obj);reference[str(frame)][obj.name]=np.column_stack((p[:,0],p[:,2],-p[:,1])).tolist()
    write(RUN/'qa/geometry.json',report);write(RUN/'qa/browser-reference.json',{'glb_sha256':sha(glb),'frames':reference})
    scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=900;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.world=bpy.data.worlds.new('Original helmet inspection');scene.world.color=(.065,.07,.08)
    scene.view_settings.look='AgX - Medium High Contrast';target=Vector((0,-.02,1.705))
    for name,loc,power,size in [('Key',(1.2,2,3),100,1.4),('Fill',(-1,1,2),55,1.1),('Rim',(.4,-1,2.4),120,1.)]:
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.size=size;obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=loc;obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
    renders={}
    for name,offset,frame,scale in [('front',(0,2,.04),0,.43),('right',(2,0,.04),0,.43),('back',(0,-2,.04),0,.43),('three-quarter',(1.4,2,.1),0,.43),('pose-30',(0,2,.04),30,.43),('pose-90',(0,2,.04),90,.43),('bust',(0,2,.03),0,.70)]:
        scene.frame_set(frame);look=target if name!='bust' else Vector((0,0,1.60))
        camera_data=bpy.data.cameras.new(name);camera_data.type='ORTHO';camera_data.ortho_scale=scale;camera=bpy.data.objects.new(name,camera_data);scene.collection.objects.link(camera)
        camera.location=look+Vector(offset);camera.rotation_euler=(look-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
        path=RUN/'qa/renders'/f'{name}.png';scene.render.filepath=str(path);bpy.ops.render.render(write_still=True);renders[name]=sha(path);bpy.data.objects.remove(camera,do_unlink=True)
    write(RUN/'qa/renders.json',renders);print('ORIGINAL_HELMET_DONE',json.dumps({'parts':len(PARTS),'hole_rays_clear':sum(hole_rays),'triangles':sum(v['triangles'] for v in report['components'].values())}),flush=True)


if __name__=='__main__':main()
