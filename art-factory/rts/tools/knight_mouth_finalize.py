"""Finish the approved Knight assembly's muzzle and authored leather reins."""
import bpy, bmesh, json, sys, hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from bpy_extras.object_utils import world_to_camera_view

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / 'art-factory/rts/runs/all-models/2026-10-14-knight-v3'
RUN = ROOT / 'art-factory/rts/runs/all-models/2026-10-15-knight-mouth'
# Frozen final-V3 side camera; every depth layer is classified by projection.
LASSO = [(648,449),(680,454),(685,482),(658,526),(625,562),(585,590),
         (545,610),(488,621),(422,617),(421,579),(475,567),(527,547),
         (571,518),(604,475),(625,449)]

def inside(point):
    x,y=point; hit=False
    for (ax,ay),(bx,by) in zip(LASSO,LASSO[1:]+LASSO[:1]):
        if (ay>y)!=(by>y) and x<(bx-ax)*(y-ay)/(by-ay)+ax: hit=not hit
    return hit

def idle():
    for o in bpy.context.scene.objects:
        if o.animation_data:
            o.animation_data.action=None
            for t in o.animation_data.nla_tracks:t.mute=t.name!='Idle'
    bpy.context.scene.frame_set(1);bpy.context.view_layer.update()

def camera():
    s=bpy.context.scene;s.render.resolution_x=1000;s.render.resolution_y=700;s.render.resolution_percentage=100
    target=Vector((-.12,.91,1.43));bpy.ops.object.camera_add(location=target+Vector((3.35,.1,.14)))
    c=bpy.context.object;c.data.type='ORTHO';c.data.ortho_scale=1.18
    c.rotation_euler=(target-c.location).to_track_quat('-Z','Y').to_euler();s.camera=c
    bpy.context.view_layer.update();return c

def evaluated_points(o):
    e=o.evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh()
    points=[e.matrix_world@v.co for v in m.vertices];faces=[list(p.vertices) for p in m.polygons]
    e.to_mesh_clear();return points,faces

def strip_faces(horse,c):
    points,faces=evaluated_points(horse)
    q=[world_to_camera_view(bpy.context.scene,c,p) for p in points]
    px=[(p.x*1000,(1-p.y)*700) for p in q]
    # Any vertex or face centre catches narrow faces; no front-layer ray occlusion.
    ids=[i for i,f in enumerate(faces) if any(inside(px[v]) for v in f) or
         inside(tuple(sum(px[v][a] for v in f)/len(f) for a in (0,1)))]
    return ids,points,px

def repair_reins(horse,reins,c):
    hp,hf=evaluated_points(horse);tree=BVHTree.FromPolygons(hp,hf)
    # Blender's actual camera frame, not a hand-derived aspect convention.
    frame=c.data.view_frame(scene=bpy.context.scene)
    xmin,xmax=min(p.x for p in frame),max(p.x for p in frame)
    ymin,ymax=min(p.y for p in frame),max(p.y for p in frame)
    x=xmin+(680.5/1000)*(xmax-xmin);y=ymax-(440.5/700)*(ymax-ymin)
    origin=c.matrix_world@Vector((x,y,-c.data.clip_start));direction=c.matrix_world.to_3x3()@Vector((0,0,-1))
    near=tree.ray_cast(origin,direction)[0];far=tree.ray_cast(origin+direction*8,-direction)[0]
    assert near is not None and far is not None,'Both lip corners must lie on the horse'
    anchors=sorted([near,far],key=lambda p:p.x)
    assert (anchors[1]-anchors[0]).length>.025,'Mouth corners collapse to one side'
    old,_=evaluated_points(reins)
    rig=next(m.object for m in reins.modifiers if m.type=='ARMATURE')
    skins={name:rig.matrix_world@rig.pose.bones[name].matrix@rig.data.bones[name].matrix_local.inverted()@rig.matrix_world.inverted() for name in ('Neck','HorseBody')}
    groups={name:reins.vertex_groups.get(name) or reins.vertex_groups.new(name=name) for name in skins}
    for g in reins.vertex_groups:g.remove(list(range(len(reins.data.vertices))))
    inv=reins.matrix_world.inverted();desired={};chain=[]
    for side,start in enumerate((0,24)):
        sign=-1 if side==0 else 1
        skin_hit=tree.ray_cast(Vector((sign*3,.55,1.36)),Vector((-sign,0,0)))[0]
        assert skin_hit is not None
        middle=skin_hit+Vector((sign*.025,0,0))
        rear=sum(old[start+18:start+24],Vector())/6
        endpoints=[anchors[side],middle,rear];chain.append([list(p) for p in endpoints])
        for segment in range(2):
            offset=start+segment*12
            centers=[sum(old[offset+j*6:offset+j*6+6],Vector())/6 for j in range(2)]
            turn=(centers[1]-centers[0]).normalized().rotation_difference((endpoints[segment+1]-endpoints[segment]).normalized())
            for j in range(2):
                neck_weight=(1,.5,0)[segment+j]
                blended=skins['Neck']*neck_weight+skins['HorseBody']*(1-neck_weight)
                for k in range(6):
                    i=offset+j*6+k;world=endpoints[segment+j]+turn@(old[i]-centers[j]);desired[i]=world
                    reins.data.vertices[i].co=inv@(blended.inverted()@world)
                    if neck_weight:groups['Neck'].add([i],neck_weight,'REPLACE')
                    if neck_weight<1:groups['HorseBody'].add([i],1-neck_weight,'REPLACE')
    reins.data.update();bpy.context.view_layer.update();current,_=evaluated_points(reins)
    residual=max((current[i]-p).length for i,p in desired.items());assert residual<1e-5,('Rein rest/pose conversion',residual)
    return {'anchors':[list(p) for p in anchors],'chains':chain,'idle_fit_residual_m':residual,
            'method':'Reshape existing four leather segments; coincident joint rings share identical blended skin weights'}

def main():
    args=sys.argv[sys.argv.index('--')+1:];lod=int(args[0]);audit='--audit' in args
    for folder in ('raw','candidate','qa'):(RUN/folder).mkdir(parents=True,exist_ok=True)
    source=BASE/f'raw/knight-lod{lod}-repaired.blend';bpy.ops.wm.open_mainfile(filepath=str(source));idle();c=camera()
    horse=next(o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith('NeuralWarhorse'))
    reins=next(o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith('LeatherRein'))
    ids,points,px=strip_faces(horse,c);rp,rf=evaluated_points(reins)
    report={'lod':lod,'source':str(source.relative_to(ROOT)),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
            'remaining_strip_faces':len(ids),'rein_vertices':[list(p) for p in rp]}
    (RUN/f'qa/mouth-baseline-lod{lod}.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    print(json.dumps(report),flush=True)
    if audit:assert not ids,'Dangling mouth strip remains';return
    bm=bmesh.new();bm.from_mesh(horse.data);bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm,geom=[bm.faces[i] for i in ids],context='FACES');bm.to_mesh(horse.data);bm.free();horse.data.update()
    bpy.context.view_layer.update();remaining,_,_=strip_faces(horse,c)
    assert not remaining,('Mouth strip survived all-depth removal',len(remaining))
    report['removed_faces']=len(ids);report['remaining_strip_faces']=len(remaining)
    report['reins']=repair_reins(horse,reins,c)
    bpy.data.objects.remove(c,do_unlink=True)
    for o in bpy.context.scene.objects:
        if o.animation_data:
            o.animation_data.action=None
            for t in o.animation_data.nla_tracks:t.mute=False
    bpy.ops.file.pack_all();bpy.context.preferences.filepaths.save_version=0
    blend=RUN/f'raw/knight-lod{lod}.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.context.scene.objects:
        if o.type in ('MESH','ARMATURE'):o.select_set(True)
    target=RUN/f'candidate/knight-lod{lod}.glb'
    bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,export_yup=True,
        export_normals=True,export_texcoords=True,export_materials='EXPORT',export_extras=True,export_skins=True,
        export_def_bones=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,
        export_anim_slide_to_zero=True,export_image_format='JPEG',export_jpeg_quality=90)
    report.update(status='passed-mouth-geometry',source_output=str(blend.relative_to(ROOT)),source_output_sha256=hashlib.sha256(blend.read_bytes()).hexdigest(),
        candidate=str(target.relative_to(ROOT)),candidate_sha256=hashlib.sha256(target.read_bytes()).hexdigest())
    (RUN/f'qa/mouth-final-lod{lod}.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    print(json.dumps({k:v for k,v in report.items() if k!='rein_vertices'}),flush=True)

if __name__=='__main__':main()
