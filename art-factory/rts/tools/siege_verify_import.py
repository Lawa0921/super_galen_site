"""Round-trip import, clip sampling and visual proof for both siege GLBs."""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
RUN=ROOT/'runs'/'kingdom-siege'/'2026-10-04-original'
OUT=RUN/'qa'/'roundtrip'
REST={}


def select_clip(clip,frame):
    for ob in bpy.data.objects:
        if not ob.animation_data:continue
        for track in ob.animation_data.nla_tracks:track.mute=True
        if ob.name in REST:
            location,rotation,scale=REST[ob.name]
            ob.location=location;ob.rotation_quaternion=rotation;ob.scale=scale
    bpy.context.scene.frame_set(0)
    bpy.context.view_layer.update()
    for ob in bpy.data.objects:
        if not ob.animation_data:continue
        for track in ob.animation_data.nla_tracks:
            if track.name==clip:track.mute=False
    bpy.context.scene.frame_set(frame)
    # Blender 5.2's glTF-imported NLA can update TRS properties without
    # dirtying matrix_world; force dependency graph transforms before QA.
    for ob in bpy.data.objects:
        if ob.animation_data:ob.update_tag(refresh={'OBJECT'})
    bpy.context.view_layer.update()


def camera_and_lights(view):
    loc=(3.8,5.7,3.6) if view=='quarter' else (5.9,.65,3.0)
    bpy.ops.object.camera_add(location=loc)
    cam=bpy.context.object;cam.name='Roundtrip QA '+view
    cam.rotation_euler=(Vector((0,0,.91))-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO';cam.data.ortho_scale=3.12
    bpy.context.scene.camera=cam
    for pos,power,size in [((3,2,5),750,3.4),((-3,-2,4),520,3.0)]:
        bpy.ops.object.light_add(type='AREA',location=pos)
        bpy.context.object.data.energy=power;bpy.context.object.data.size=size


def render(name):
    OUT.mkdir(parents=True,exist_ok=True)
    bpy.context.scene.render.filepath=str(OUT/name)
    bpy.ops.render.render(write_still=True)


def bounds(mesh):
    points=[ob.matrix_world@Vector(c) for ob in mesh for c in ob.bound_box]
    return [[round(min(v[i] for v in points),4) for i in range(3)],
            [round(max(v[i] for v in points),4) for i in range(3)]]


def inspect(lod):
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(RUN/'candidate'/f'siege-lod{lod}.glb'))
    scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE'
    scene.render.resolution_x=640;scene.render.resolution_y=640
    scene.render.resolution_percentage=100;scene.render.film_transparent=True
    scene.world.color=(.22,.24,.26)
    mesh=[ob for ob in scene.objects if ob.type=='MESH']
    for ob in scene.objects:
        if ob.animation_data:
            for track in ob.animation_data.nla_tracks:track.mute=True
    scene.frame_set(0);bpy.context.view_layer.update()
    REST.clear()
    for ob in scene.objects:
        if ob.animation_data:
            REST[ob.name]=(ob.location.copy(),ob.rotation_quaternion.copy(),ob.scale.copy())
    low,high=bounds(mesh)
    world_rest={ob.name:ob.matrix_world.copy() for ob in scene.objects}
    triangles=sum(sum(len(poly.vertices)-2 for poly in ob.data.polygons) for ob in mesh)
    imported_clips=sorted({track.name for ob in scene.objects if ob.animation_data
                           for track in ob.animation_data.nla_tracks})
    root=scene.objects.get('SiegeRoot')
    metadata={k:root[k] for k in root.keys()} if root else {}
    camera_and_lights('quarter')
    select_clip('Idle',1);render(f'siege-lod{lod}-idle-quarter.png')
    if lod==0:
        select_clip('Walk',5)
        wheel=scene.objects.get('WheelPivot_FL')
        walk_angle=round(world_rest['WheelPivot_FL'].to_quaternion().rotation_difference(
            wheel.matrix_world.to_quaternion()).angle,4)
        render('siege-lod0-walk-quarter.png')
        select_clip('Attack',10)
        bolt=scene.objects.get('LoadedQuarrelPivot')
        string=scene.objects.get('WaxedBowstring_1')
        attack={'bolt_world_y':round(bolt.matrix_world.translation.y,4),
                'bolt_travel_m':round(bolt.matrix_world.translation.y-world_rest['LoadedQuarrelPivot'].translation.y,4),
                'bowstring_center_y':round(string.matrix_world.translation.y,4)}
        render('siege-lod0-attack-release.png')
        select_clip('Hurt',4);render('siege-lod0-hurt.png')
        select_clip('Death',24)
        bow=scene.objects.get('BowFlexPivot')
        death_bow_angle=round(world_rest['BowFlexPivot'].to_quaternion().rotation_difference(
            bow.matrix_world.to_quaternion()).angle,4)
        render('siege-lod0-death.png')
        # Side view of the restored unloaded/loaded idle silhouette.
        cam=scene.camera;cam.location=(5.9,.65,3.0)
        cam.rotation_euler=(Vector((0,0,.91))-cam.location).to_track_quat('-Z','Y').to_euler()
        select_clip('Idle',1);render('siege-lod0-idle-side.png')
    else:
        walk_angle=None;attack=None;death_bow_angle=None
    return {'lod':lod,'import_triangle_count':triangles,'import_mesh_count':len(mesh),
            'bounds_min_blender_xyz_m':low,'bounds_max_blender_xyz_m':high,
            'imported_clips':imported_clips,'root_extras':metadata,
            'walk_wheel_angle_rad_sample':walk_angle,'attack_sample':attack,
            'death_bow_angle_rad_sample':death_bow_angle}


if __name__=='__main__':
    rows=[inspect(0),inspect(1)]
    (RUN/'qa'/'roundtrip.json').write_bytes(json.dumps(rows,indent=2).encode('utf-8'))
    print(json.dumps(rows,indent=2),flush=True)
