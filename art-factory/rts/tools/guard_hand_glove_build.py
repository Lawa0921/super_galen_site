"""Fresh original whole-glove volume sculpt and actual-source collar retopology.

Sculpt strokes are editable raw authoring controls. Only their fused, clipped,
connected skin is exported; no original/rejected cage or primitive guide is used.
"""
import sys,json,hashlib,math
from pathlib import Path
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).parent))
import bpy,bmesh,numpy as np
from mathutils import Vector,Matrix
from guard_hand_glove_geometry import anatomy_strokes,sleeve_plane_contour,angular_collar_zipper,validate_cut_integrity
from guard_hand_foundation_math import topology,ordered_boundary_loops,exact_clearance,capped_signed_volume,edge_uses
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/guard-hand-glove/2026-10-09-v1'
MAIN=Path('C:/Users/bag57/projects/super_galen_site/.claude/worktrees/rts')
SOURCE=MAIN/'art-factory/rts/runs/original-guard-grip-channel/2026-10-05/candidate/original-guard-grip-channel.blend'
SOURCE_SHA='314e914e04a8a6a095338afe1c6d558a7976639796ebc6c81a7dad71001f9628'
WC=Vector((.4293556809425354,0,.8472006916999817));CC=Vector((.48789501190185547,-.008239989168941975,.8149818778038025))
R=Vector((WC.x-CC.x,WC.y-CC.y,0)).normalized();T=Vector((0,0,1)).cross(R);Z=Vector((0,0,1));BASIS=Matrix((R,T,Z)).transposed()
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text(encoding='utf8'))
def write(p,x):p.write_text(json.dumps(x,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
def world(local):return CC+BASIS@Vector(local)
def material(name,color):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.76;return m
def ellipsoid(name,center,radii,axis,width_axis=Z):
    axis=Vector(axis).normalized();width=Vector(width_axis)-axis*Vector(width_axis).dot(axis)
    if width.length<1e-7:width=T-axis*T.dot(axis)
    width.normalize();depth=width.cross(axis).normalized();basis=Matrix((axis,depth,width)).transposed()
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,radius=1,location=center)
    obj=bpy.context.object;obj.name=name
    for vertex in obj.data.vertices:vertex.co=basis@Vector((vertex.co.x*radii[0],vertex.co.y*radii[1],vertex.co.z*radii[2]))
    obj.data.update();bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update()
    return obj
def difference(obj,cut,name):
    bounds=lambda o:{'min':np.array([list(o.matrix_world@v.co) for v in o.data.vertices]).min(axis=0).tolist(),'max':np.array([list(o.matrix_world@v.co) for v in o.data.vertices]).max(axis=0).tolist()}
    before=bounds(obj);cutter=bounds(cut)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    mod=obj.modifiers.new(name,'BOOLEAN');mod.operation='DIFFERENCE';mod.solver='MANIFOLD';mod.object=cut
    result=bpy.ops.object.modifier_apply(modifier=mod.name)
    if result!={'FINISHED'} or not len(obj.data.polygons):raise ValueError('Negative sculpt cutter failed')
    obj.data.update();after=bounds(obj);validate_cut_integrity(before,after,cutter)
    write(RUN/'qa'/('cut-integrity-'+str(len(list((RUN/'qa').glob('cut-integrity-*'))))+'.json'),{'name':name,'before':before,'cutter':cutter,'after':after,'untouched_extrema_preserved':True})
    bpy.data.objects.remove(cut,do_unlink=True)
def meshdata(obj):
    obj.data.calc_loop_triangles();v=[list(obj.matrix_world@p.co) for p in obj.data.vertices];tri=[list(t.vertices) for t in obj.data.loop_triangles]
    return v,tri
def contact_samples(v,faces):
    totals={'area_m2':0,'area_within_0_to_2mm_m2':0,'area_within_0_3_to_0_8mm_m2':0};points=[]
    for tri in faces:
        a,b,c=(Vector(v[i]) for i in tri);area=(b-a).cross(c-a).length*.5;gaps=[]
        for i in range(5):
            for j in range(5-i):
                p=a*(1-(i+j)/4)+b*(i/4)+c*(j/4);gaps.append(math.hypot(p.x-CC.x,p.y-CC.y)-.022)
        totals['area_m2']+=area;totals['area_within_0_to_2mm_m2']+=area*sum(0<=x<=.002 for x in gaps)/len(gaps)
        totals['area_within_0_3_to_0_8mm_m2']+=area*sum(.0003<=x<=.0008 for x in gaps)/len(gaps);points.extend(gaps)
    return {**totals,'near_contact_area_mm2':totals['area_within_0_to_2mm_m2']*1e6,
        'fraction_within_0_3_to_0_8mm_diagnostic':totals['area_within_0_3_to_0_8mm_m2']/totals['area_m2'] if totals['area_m2'] else 0,
        'minimum_sample_gap_mm':min(points)*1000 if points else None,'method':'Area weighted actual triangle barycentric samples; 25% is diagnostic only'}

def stage_diagnostic(obj,name):
    v,f=meshdata(obj);bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table();bm.edges.ensure_lookup_table();bm.faces.ensure_lookup_table();bm.normal_update()
    adjacency={p.index:set(e.other_vert(p).index for e in p.link_edges) for p in bm.verts};unused=set(adjacency);components=[]
    while unused:
        todo=[min(unused)];visited=set()
        while todo:
            i=todo.pop()
            if i not in visited:visited.add(i);todo.extend(adjacency[i]-visited)
        unused-=visited;components.append({'vertices':len(visited),'bounds_min_m':np.array([v[i] for i in visited]).min(axis=0).tolist(),'bounds_max_m':np.array([v[i] for i in visited]).max(axis=0).tolist()})
    result={'stage':name,'topology':topology(v,f),'signed_volume_m3':capped_signed_volume(v,f),
        'nonmanifold_vertex_ids':[p.index for p in bm.verts if not p.is_manifold],
        'nonmanifold_edge_ids':[e.index for e in bm.edges if not e.is_manifold],
        'zero_face_normals':[p.index for p in bm.faces if p.normal.length<1e-8],'components':components,
        'object_scale':list(obj.scale),'object_origin_m':list(obj.location)}
    bm.free();write(RUN/'qa'/('stage-'+name+'.json'),result);return result

def main():
    if sha(SOURCE)!=SOURCE_SHA:raise ValueError('Original high source changed')
    interface=read(RUN/'qa/v35-interface.json');v35=Path(interface['source_path']);v35before=sha(v35)
    if v35before!=interface['source_sha256']:raise ValueError('Actual sleeve source changed')
    axis=Vector(interface['actual_right_cloth_terminal']['forearm_axis_world']);seam_center=WC-axis*.025
    cloth=interface['actual_cloth_mesh'];slice_result=sleeve_plane_contour(cloth['vertices_m'],cloth['triangles'],seam_center,axis)
    contour=min(slice_result['loops'],key=lambda loop:(sum((Vector(p)-seam_center).length for p in loop)/len(loop)))
    if (sum((Vector(p) for p in contour),Vector())/len(contour)-seam_center).length>.01:raise ValueError('Actual right wrist slice misplaced')
    write(RUN/'raw/actual-wrist-interface.json',{'source_sha256':v35before,'object':'GuardArms_LOD0','canonical_wrist_m':list(WC),'contour_m':contour,'slice':slice_result,
        'integration_plan':'Future v35-only integration trims closed right cloth distal cap at this exact measured plane; bridge shares this real sleeve ring. No v35 writes or cap removal performed here. Cuff is unchanged.'})
    authored=anatomy_strokes();semantic=read(ROOT/'art-factory/rts/runs/guard-hand-foundation/2026-10-09-v1/raw/source-anchors.json')
    for name,d in authored['digits'].items():
        anchor=semantic['anchors'][d['source_anchor_name']];d['source_semantic_anchor']=anchor
        d['landmarks_world_m']=[list(world(p)) for p in d['landmarks_local_m']]
        d['target_landmarks_are_original_reauthoring_not_uniform_source_fit']=True
    authored['canonical_wrist_m']=list(WC);authored['canonical_grip_m']=list(CC);authored['source_sha256']=SOURCE_SHA
    authored['voxel_size_m']=.0028;authored['method']='Original manually chosen anatomy volume sculpt strokes; fine fused sculpt skin; Blender QuadriFlow new retopology base and hand-authored actual sleeve collar; no old cage/grid input'
    authored['retopology']={'body_base':'Blender native QuadriFlow on the newly authored sculpture only','target_quad_faces':1500,'seed':0,'manual_work':'Anatomical volume/landmarks and source-plane angular collar retopology','not_claimed':'The body QuadriFlow layout is not manually laid out edge by edge'}
    write(RUN/'raw/original-sculpt-controls.json',authored)
    bpy.ops.wm.read_factory_settings(use_empty=True);stroke_objects=[]
    for i,s in enumerate(authored['palm_strokes']+authored['digit_strokes']):
        if s.get('semantic_forearm_stroke'):continue
        obj=ellipsoid('RAW authored '+s['region']+' '+str(i),world(s['center_local_m']),s['radii_m'],BASIS@Vector(s['longitudinal_axis_local']))
        obj['source_stroke_id']=i;obj['anatomical_region']=s['region'];stroke_objects.append(obj)
    for i,(offset,length,radial,tangent) in enumerate(((-.024,.025,.034,.030),(-.006,.022,.029,.027),(.012,.021,.025,.024))):
        obj=ellipsoid('RAW authored WRIST '+str(i),WC+axis*offset,(length,radial,tangent),axis,T);stroke_objects.append(obj)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in stroke_objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=stroke_objects[0];bpy.ops.object.join();raw=bpy.context.object;raw.name='OriginalGloveSculptStrokeSource'
    # Raw editable stroke shell remains source-only; no stroke primitives export.
    glove=raw.copy();glove.data=raw.data.copy();bpy.context.collection.objects.link(glove);glove.name='GuardRightSoftGlove_ClayLOD0'
    raw.hide_render=True;raw.hide_set(True);raw.select_set(False);glove.select_set(True);bpy.context.view_layer.objects.active=glove
    glove.data.remesh_voxel_size=authored['voxel_size_m'];glove.data.remesh_voxel_adaptivity=0
    bpy.ops.object.voxel_remesh()
    mod=glove.modifiers.new('Clay sculpt tissue blending','SMOOTH');mod.factor=.42;mod.iterations=6;bpy.ops.object.modifier_apply(modifier=mod.name)
    stage_diagnostic(glove,'fused-sculpt')
    bm=bmesh.new();bm.from_mesh(glove.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(glove.data);bm.free();glove.data.update()
    stage_diagnostic(glove,'retopology-input')
    readyv,readyf=meshdata(glove);readytopology=topology(readyv,readyf);write(RUN/'qa/sculpt-retopology-input.json',{'topology':readytopology,'volume_m3':capped_signed_volume(readyv,readyf),'manifold_before_QuadriFlow':not any(readytopology[k] for k in ('nonmanifold_edges','winding_edges','boundary_edges','degenerate_triangles'))})
    if any(readytopology[k] for k in ('nonmanifold_edges','winding_edges','boundary_edges','degenerate_triangles')):raise ValueError('New sculpt is not a legal manifold retopology input')
    if '--diagnose-retopo' in sys.argv:
        v,f=meshdata(glove);write(RUN/'qa/retopology-input-mesh.json',{'vertices_m':v,'triangles':f,'original_controls_sha256':sha(RUN/'raw/original-sculpt-controls.json')})
        bpy.ops.wm.save_as_mainfile(filepath=str(RUN/'qa/retopology-input-snapshot.blend'))
        print('Diagnostic input saved; QuadriFlow not retried',flush=True);return
    sculpt=glove.copy();sculpt.data=glove.data.copy();sculpt.name='OriginalSoftGloveSculptedSource';bpy.context.collection.objects.link(sculpt);sculpt.hide_render=True;sculpt.hide_set(True)
    bpy.context.view_layer.objects.active=glove
    result=bpy.ops.object.quadriflow_remesh(use_mesh_symmetry=False,use_preserve_sharp=False,use_preserve_boundary=False,target_faces=1500,seed=0)
    if result!={'FINISHED'} or not len(glove.data.polygons):raise ValueError('QuadriFlow cancelled; no candidate skin produced')
    stage_diagnostic(glove,'new-retopology-base')
    hollow=authored['central_hollow'];cut=ellipsoid('QA sculpt central palmar hollow',world(hollow['center_local_m']),hollow['radii_m'],R)
    difference(glove,cut,'Original central palm hollow sculpt')
    bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=.0230,depth=.205,location=CC)
    difference(glove,bpy.context.object,'True 22mm grip pad imprint plus 1mm retopology allowance')
    stage_diagnostic(glove,'after-imprints')
    cut_center=WC-axis*.008;bm=bmesh.new();bm.from_mesh(glove.data)
    # Coordinates below are object-local; joined raw retained its original origin.
    local_center=glove.matrix_world.inverted()@cut_center;local_axis=glove.matrix_world.to_3x3().inverted()@axis
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,plane_co=local_center,plane_no=local_axis,clear_inner=True,clear_outer=False)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(glove.data);bm.free();glove.data.update()
    verts,tri=meshdata(glove);loops=ordered_boundary_loops(tri)
    if len(loops)!=1:raise ValueError('Sculpt wrist cut did not yield sole true boundary: '+str(list(map(len,loops))))
    loop=loops[0];zipper=angular_collar_zipper([verts[i] for i in loop],contour,list(cut_center),list(seam_center),list(axis));mouth=[Vector(contour[i]) for i in zipper['outer_order']]
    newids=list(range(len(verts),len(verts)+len(mouth)));verts.extend([list(p) for p in mouth]);faces=[list(p.vertices) for p in glove.data.polygons]
    collar_faces=[]
    # A new finite zipper retopology joins the actual source ring to the single
    # sculpt opening. It reuses skin boundary edges; no caps hide a seam.
    mapping=loop+newids
    for ids in zipper['faces']:
        face=[mapping[i] for i in ids]
        collar_faces.append(len(faces));faces.append(face)
    write(RUN/'qa/collar-transport.json',zipper)
    mesh=bpy.data.meshes.new('New continuous original soft glove skin with source wrist ring');mesh.from_pydata([Vector(p)-WC for p in verts],[],faces);mesh.update()
    glove.data=mesh;glove.location=WC;glove.rotation_euler=(0,0,0);glove.scale=(1,1,1)
    mat=material('Original soft glove clay shape pending detail',(.48,.45,.42));mesh.materials.append(mat)
    for p in mesh.polygons:p.use_smooth=True
    glove.vertex_groups.new(name='ACTUAL_V35_WRIST_INTERFACE').add(newids,1,'REPLACE')
    glove['runtime_publish_allowed']=False;glove['commercial_approved']=False;glove['source_sha256']=SOURCE_SHA;glove['actual_sleeve_source_sha256']=v35before
    glove['original_sculpt_recipe']='raw/original-sculpt-controls.json';glove['binding_plan']='Hand_R fixed grip; actual sleeve collar Forearm_R/Hand_R transition; no finger bones/open-curl'
    glove['canonical_grip_center']=list(CC);glove['canonical_wrist']=list(WC)
    bpy.ops.object.select_all(action='DESELECT');glove.select_set(True);bpy.context.view_layer.objects.active=glove
    blend=RUN/'candidate/guard-right-hand-soft-glove-clay.blend';glb=RUN/'candidate/guard-right-hand-soft-glove-clay-lod0.glb'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend));bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_animations=False,export_extras=True,export_yup=True)
    verts,tri=meshdata(glove);topo=topology(verts,tri);boundaries=ordered_boundary_loops(tri);gap=exact_clearance(verts,tri,CC,Z,.022)
    sys.path.insert(0,str(MAIN/'art-factory/rts/tools'));from guard_armor_self_qa import inspect
    selfqa=inspect(np.asarray(verts),np.asarray(tri));adj={i:set() for i in range(len(verts))}
    for f in tri:
        for i in f:adj[i].update(f)
    visited=set();pending=[0]
    while pending:
        i=pending.pop()
        if i not in visited:visited.add(i);pending.extend(adj[i]-visited)
    # Region ownership is explicit authored brush membership at face centroid.
    # This labels diagnostics only, never fits or changes surface geometry.
    regions={name:[] for name in ('PALM','THENAR','HYPOTHENAR','INDEX','MIDDLE','RING','LITTLE','THUMB')}
    source_strokes=[s for s in authored['palm_strokes']+authored['digit_strokes'] if not s.get('semantic_forearm_stroke')]
    for f in tri:
        p=sum((Vector(verts[i]) for i in f),Vector())/3;local=BASIS.transposed()@(p-CC);rank=[]
        for s in source_strokes:
            center=Vector(s['center_local_m']);long=Vector(s['longitudinal_axis_local']).normalized();wide=Z-long*Z.dot(long)
            if wide.length<1e-7:wide=T-long*T.dot(long)
            wide.normalize();depth=wide.cross(long).normalized();delta=local-center
            value=sum((delta.dot(axis)/radius)**2 for axis,radius in zip((long,depth,wide),s['radii_m']))
            rank.append((value,s['region']))
        _,region=min(rank)
        name=region.replace('DIGIT_','') if region.startswith('DIGIT_') else region if region in ('THENAR','HYPOTHENAR') else 'PALM'
        regions[name].append(f)
    contacts={name:contact_samples(verts,selected) for name,selected in regions.items()};failures=[]
    if len(visited)!=len(verts):failures.append('Single connected skin')
    if len(boundaries)!=1 or set(boundaries[0])!=set(newids):failures.append('Sole actual source wrist boundary')
    if any(topo[k] for k in ('degenerate_triangles','nonmanifold_edges','winding_edges')):failures.append('Valid exterior topology')
    if any(selfqa.values()):failures.append('Actual triangle self-contact')
    if gap['violating_triangles']:failures.append('True 22mm handle penetration')
    if capped_signed_volume(verts,tri)<=0:failures.append('Exterior winding')
    report={'status':'qa_failed' if failures else 'mechanical_candidate_pending_independent_wholehand_clay_review','runtime_publish_allowed':False,'commercial_approved':False,
        'candidate_blend_sha256':sha(blend),'candidate_glb_sha256':sha(glb),'source_sha256':SOURCE_SHA,'actual_v35_sleeve_sha256':v35before,
        'topology':topo,'boundary_loop_lengths':list(map(len,boundaries)),'connected_vertices':len(visited),'vertex_count':len(verts),
        'self_contacts':selfqa,'self_tolerance_m':1e-7,'whole_triangle_handle_clearance':gap,'contact_diagnostics':contacts,
        'pivot_m':list(glove.location),'scale':list(glove.scale),'canonical_Wc_m':list(WC),'canonical_Cc_m':list(CC),
        'wrist_interface_source_object':'GuardArms_LOD0','wrist_interface_vertex_ids':newids,'wrist_interface_positions_m':[verts[i] for i in newids],
        'wrist_interface_source_slice_plane_m':list(seam_center),'wrist_interface_source_normal':list(axis),'collar_retopology_face_ids':collar_faces,
        'old_v35_hand_triangles':2818,'v35_full_character_triangles_reference':23562,'estimated_full_character_after_replace':23562-2818+topo['triangles'],
        'full_character_8k_to_20k_target_pass_claim':False,'volume_m3_diagnostic':capped_signed_volume(verts,tri),
        'actual_skin_mesh_authoring':'Fresh sculpt skin, fine voxel fusion and QuadriFlow body base, hand-authored angular collar zipper; no old cage, no decimation, no nearest fitting to original high reference','failures':failures}
    write(RUN/'qa/geometry.json',report)
    write(RUN/'raw/actual-candidate-mesh.json',{'vertices_m':verts,'triangles':tri,'candidate_sha256':sha(glb)})
    # QA guides are added only after save/export and never saved back.
    bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=.022,depth=.195,location=CC);guide=bpy.context.object;guide.name='QA ONLY actual 22mm radius 195mm handle';guide.data.materials.append(material('QA true handle',(.10,.13,.16)))
    scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.world=bpy.data.worlds.new('Soft glove QA world');scene.world.color=(.045,.045,.045);scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-1
    target=CC+R*.012+Z*.002
    for delta,power in (((.5,.7,.7),25),((-.4,.4,.4),15),((.2,-.6,.6),20)):
        data=bpy.data.lights.new('Soft glove QA softbox','AREA');data.energy=power;data.size=.5;obj=bpy.data.objects.new(data.name,data);bpy.context.collection.objects.link(obj);obj.location=target+Vector(delta);obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
    views={'fullhand-palm':(target-R*.4-T*.6+Z*.14,target,False),'fullhand-back':(target+R*.4+T*.6+Z*.14,target,False),
        'fullhand-thumb-opposition':(target-R*.5-T*.5+Z*.20,target,True),'fullhand-finger-pads':(CC-R*.8+Z*.03,CC,False),
        'fullhand-handle-axis':(CC+Z*.8,CC,True),'fullhand-three-quarter':(target+R*.6-T*.4+Z*.20,target,True)}
    renders={}
    for name,(location,aim,show) in views.items():
        guide.hide_render=not show;data=bpy.data.cameras.new(name);data.type='ORTHO';data.ortho_scale=.19;data.clip_start=.001;camera=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(camera);camera.location=location;camera.rotation_euler=(aim-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
        path=RUN/'qa/renders'/(name+'.png');scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
        renders[name]={'path':path.relative_to(ROOT).as_posix(),'sha256':sha(path),'camera_location':list(camera.location),'camera_rotation':list(camera.rotation_euler),'ortho_scale':.19,'exposure':-1,'handle_visible':show,'visible_meshes':[glove.name]+([guide.name] if show else [])}
    write(RUN/'qa/renders.json',{'candidate_blend_sha256':sha(blend),'candidate_glb_sha256':sha(glb),'saved_before_QA_guides':True,'runtime_publish_allowed':False,'renders':renders})
    if sha(SOURCE)!=SOURCE_SHA or sha(v35)!=v35before:raise ValueError('Read-only source changed')
    print(json.dumps({'triangles':topo['triangles'],'boundary_lengths':list(map(len,boundaries)),'self_counts':{k:len(v) for k,v in selfqa.items()},'min_gap_mm':gap['min_clearance_m']*1000,'contact_mm2':{k:v['near_contact_area_mm2'] for k,v in contacts.items()},'failures':failures,'blend_sha256':sha(blend),'glb_sha256':sha(glb)},indent=2),flush=True)
    if failures:raise ValueError('Critical skin QA failed; actual evidence retained')
if __name__=='__main__':main()
