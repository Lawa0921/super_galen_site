"""Internal source/candidate comparison of the independently rejected armor overlap."""
import hashlib
import json
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / 'art-factory/rts/runs/guard-right-hand-cage'
RUN = BASE / '2026-10-08-v21-armor-collision-inspection'
SOURCES = [('before', BASE / '2026-10-08-v12-canonical-bind-adaptive/candidate/guard-canonical-hand-bind.blend', '987ed5120bd0dfc7e2fd193e546cef289b6ff77a7cd138676aba97324b65a82c'),
           ('after', BASE / '2026-10-08-v17-tabard-continuity/candidate/guard-tabard-continuity.blend', 'cb1f0bf304b82b27792b7fe57abcdc4ff2ed48f302d9dcd97531652096f5a751')]
inventory = json.loads((BASE / '2026-10-08-v9-character-frame/raw/current-arm-wrist-inventory.json').read_text(encoding='utf-8'))


def main():
    directory = RUN / 'qa/renders'
    directory.mkdir(parents=True, exist_ok=True)
    # Freeze view from the repaired pose so before/after use identical cameras.
    bpy.ops.wm.open_mainfile(filepath=str(SOURCES[1][1]))
    rig = bpy.data.objects['GuardRig20']
    rig.animation_data.action = bpy.data.actions['Attack']
    bpy.context.scene.frame_set(13, subframe=.09375)
    upper, fore = rig.pose.bones['UpperArm_R'], rig.pose.bones['Forearm_R']
    target = fore.head.copy()
    axis = (upper.head - target).cross(fore.tail - target).normalized()
    views = [('bend-profile', axis), ('elbow-oblique', (axis + Vector((.4, .6, .2))).normalized())]
    records = []
    for label, source, expected_sha in SOURCES:
        assert hashlib.sha256(source.read_bytes()).hexdigest() == expected_sha
        bpy.ops.wm.open_mainfile(filepath=str(source))
        scene = bpy.context.scene
        rig = bpy.data.objects['GuardRig20']
        rig.animation_data.action = bpy.data.actions['Attack']
        scene.frame_set(13, subframe=.09375)
        arm = bpy.data.objects['GuardArms_LOD0']
        evaluated = arm.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh().copy()
        evaluated.to_mesh_clear()
        keep = set(inventory['arm_components'][1]['vertex_ids'] + inventory['arm_components'][3]['vertex_ids'])
        assert len(mesh.vertices) == len(arm.data.vertices)
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bm.verts.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in keep], context='VERTS')
        bm.to_mesh(mesh)
        bm.free()
        for obj in bpy.data.objects:
            obj.hide_render = True
        isolated = bpy.data.objects.new('UpperArmArmor_R + ForearmArmor_R - diagnostic only', mesh)
        bpy.context.collection.objects.link(isolated)
        scene.render.engine = 'BLENDER_EEVEE'
        scene.render.resolution_x = scene.render.resolution_y = 1000
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = 'PNG'
        scene.world = bpy.data.worlds.new('Armor overlap inspection')
        scene.world.color = (.045, .045, .045)
        scene.view_settings.look = 'AgX - Medium High Contrast'
        scene.view_settings.exposure = -1
        for delta, energy in (((1, 1, 1), 140), ((-1, .5, .6), 80), ((.5, -1, 1), 110)):
            data = bpy.data.lights.new('Inspection softbox', 'AREA')
            data.energy, data.size = energy, .8
            light = bpy.data.objects.new(data.name, data)
            bpy.context.collection.objects.link(light)
            light.location = target + Vector(delta)
            light.rotation_euler = (target - light.location).to_track_quat('-Z', 'Y').to_euler()
        for name, direction in views:
            data = bpy.data.cameras.new(name)
            data.type, data.ortho_scale, data.clip_start = 'ORTHO', .26, .001
            camera = bpy.data.objects.new(name, data)
            bpy.context.collection.objects.link(camera)
            camera.location = target + direction
            camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
            scene.camera = camera
            output = directory / f'{label}-{name}.png'
            scene.render.filepath = str(output)
            bpy.ops.render.render(write_still=True)
            records.append({'file': str(output.relative_to(ROOT)).replace('\\', '/'), 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'source_sha256': expected_sha, 'frame': 13.09375, 'clip': 'Attack', 'parts': ['UpperArmArmor_R', 'ForearmArmor_R'], 'camera_target': list(target), 'camera_direction': list(direction)})
    (RUN / 'qa/renders.json').write_text(json.dumps({'status': 'inspection_only', 'runtime_publish_allowed': False, 'source_geometry_saved': False, 'renders': records}, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
