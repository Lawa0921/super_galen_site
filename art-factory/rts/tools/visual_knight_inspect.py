"""Measure the existing generated horse limb surfaces before source refinement."""
import argparse
import json
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).parent))
import procedural_gauntlet_build as g

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'art-factory/rts/runs/all-models/2026-10-15-knight-mouth/raw/knight-lod0.blend'


def inspect(source, run, render=True, clip='Idle', frame=1):
    run.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(source))
    horse = next(o for o in bpy.data.objects if o.name.startswith('NeuralWarhorse_'))
    rig = next(m.object for m in horse.modifiers if m.type == 'ARMATURE')
    for obj in bpy.context.scene.objects:
        if obj.animation_data:
            obj.animation_data.action = None
            for track in obj.animation_data.nla_tracks:
                track.mute = track.name != clip
    bpy.context.scene.frame_set(frame)
    limbs = []
    for group in horse.vertex_groups:
        if not group.name.startswith(('Front_', 'Rear_')):
            continue
        vertices = [v for v in horse.data.vertices if any(w.group == group.index and w.weight > .5 for w in v.groups)]
        if len(vertices) < 3:
            continue
        bone = rig.data.bones[group.name]
        points = np.array([list(v.co) for v in vertices])
        bands = []
        for z in np.linspace(points[:, 2].min(), points[:, 2].max(), 9):
            section = points[np.abs(points[:, 2] - z) < .035]
            if len(section) < 4:
                continue
            bands.append({'z': float(z), 'count': len(section), 'center': section.mean(axis=0).tolist(),
                          'extent': np.ptp(section, axis=0).tolist()})
        limbs.append({'group': group.name, 'vertices': len(points), 'min': points.min(axis=0).tolist(),
                      'max': points.max(axis=0).tolist(), 'bone_head': list(bone.head_local),
                      'bone_tail': list(bone.tail_local), 'bands': bands})
    report = {'source': str(source), 'limbs': limbs,
              'meshes': [{'name': o.name, 'triangles': g.tri_count(o)} for o in bpy.data.objects if o.type == 'MESH'],
              'actions': [{'name': a.name, 'frames': list(a.frame_range)} for a in bpy.data.actions]}
    (run / 'source-inspection.json').write_bytes((json.dumps(report, indent=2) + '\n').encode())
    if not render:
        return
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.world = scene.world or bpy.data.worlds.new('Review world')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.11, .14, .16, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .65
    for obj in list(bpy.data.objects):
        if obj.type in ('CAMERA', 'LIGHT'):
            bpy.data.objects.remove(obj, do_unlink=True)
        elif obj.type == 'MESH':
            obj.hide_render = obj.type == 'MESH' and obj.hide_get()
    for name, pos, energy in [('Key', (3, -4, 5), 650), ('Fill', (-3, -1, 3), 350), ('Rim', (1, 3, 4), 400)]:
        light = bpy.data.objects.new(name, bpy.data.lights.new(name, 'AREA'))
        light.location = pos; light.data.energy = energy; light.data.size = 4
        light.rotation_euler = (Vector((0, 0, 1)) - light.location).to_track_quat('-Z', 'Y').to_euler()
        scene.collection.objects.link(light)
    camera = bpy.data.objects.new('Review camera', bpy.data.cameras.new('Review camera'))
    scene.collection.objects.link(camera); scene.camera = camera; camera.data.type = 'ORTHO'
    for view, direction, target, scale in [('front', (0, 1, .1), (0, 0, 1.25), 3.2),
                                         ('side', (1, 0, .1), (0, 0, 1.25), 3.2),
                                         ('legs-front', (0, 1, .05), (0, 0, .45), 1.25),
                                         ('legs-side', (1, 0, .05), (0, 0, .50), 2.6)]:
        target = Vector(target)
        camera.data.ortho_scale = scale; camera.location = target + Vector(direction).normalized() * 5
        camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(run / ('knight-' + view + '.png'))
        bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--source', type=Path, default=SOURCE)
    p.add_argument('--run', type=Path, required=True)
    p.add_argument('--skip-render', action='store_true')
    p.add_argument('--clip', default='Idle')
    p.add_argument('--frame', type=int, default=1)
    a = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
    inspect(a.source.resolve(), a.run.resolve(), not a.skip_render, a.clip, a.frame)
