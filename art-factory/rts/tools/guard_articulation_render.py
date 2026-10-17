"""Actual-material static views of a bounded original armor shape prototype."""
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Vector

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from guard_articulation_source import ROOT, RUN, SOURCE, SHA
from original_guard_articulated_armor import module_skin_matrices, frame
from guard_armor_relief_inventory import components

RUN = RUN.with_name('2026-10-08-v30-armor-interface-fit')
SOURCE = SOURCE.parents[2]/'2026-10-08-v29-attack-start-exterior-tangent/candidate/guard-authored-attack.blend'
SHA = 'd010152889219efed40023ef689b14b9440562c6bb3f3e2d00acc5da62381d54'


def main():
    lod = int('--lod1' in sys.argv)
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == SHA
    models = json.loads((RUN/'raw/modules-v3.json').read_text(encoding='utf-8'))
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    scene, rig = bpy.context.scene, bpy.data.objects['GuardRig20']
    arm = bpy.data.objects['GuardArms_LOD'+str(lod)]
    islands = components(arm.data)
    remove = set(v for ci in (0, 1, 2, 3, 4, 6, 7, 8, 9, 10) for v in islands[ci])
    mats = list(arm.data.materials)
    for obj in bpy.data.objects:
        obj.hide_render = not (obj.type == 'MESH' and obj.name.endswith('LOD'+str(lod)))
    arm.hide_render = True
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x, scene.render.resolution_y = 900, 1000
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.world = bpy.data.worlds.new('Original armor shape preflight')
    scene.world.color = (.045, .045, .045)
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = -1
    for delta, energy in (((2, 3, 4), 500), ((-3, 1, 2), 300), ((1, -3, 3), 450)):
        data = bpy.data.lights.new('Shape preflight softbox', 'AREA')
        data.energy, data.size = energy, 2
        light = bpy.data.objects.new(data.name, data)
        scene.collection.objects.link(light)
        light.location = Vector((0, .08, 1))+Vector(delta)
        light.rotation_euler = (Vector((0, .08, 1))-light.location).to_track_quat('-Z', 'Y').to_euler()
    data = bpy.data.cameras.new('Shape preflight fixed camera')
    data.type, data.clip_start = 'ORTHO', .001
    camera = bpy.data.objects.new(data.name, data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    out = RUN/('qa/renders-v3-lod'+str(lod))
    out.mkdir(parents=True, exist_ok=True)
    rows, temporary = [], []
    for clip, time, side in (('Idle', 0, 'R'), ('Attack', 16, 'R'), ('Death', 48, 'L'), ('Attack', 1.5, 'R')):
        for obj in temporary:
            mesh = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            bpy.data.meshes.remove(mesh)
        temporary = []
        rig.animation_data.action = bpy.data.actions[clip]
        scene.frame_set(math.floor(time), subframe=time % 1)
        evaluated = arm.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh().copy()
        evaluated.to_mesh_clear()
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bm.verts.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index in remove], context='VERTS')
        bm.to_mesh(mesh)
        bm.free()
        retained = bpy.data.objects.new('Retained exact original sleeve surfaces', mesh)
        scene.collection.objects.link(retained)
        temporary.append(retained)
        for part_side in ('R', 'L'):
            rest = np.array([rig.data.bones[n+'_'+part_side].head_local[:] for n in ('UpperArm', 'Forearm', 'Hand')])
            posed = np.array([rig.pose.bones[n+'_'+part_side].head[:] for n in ('UpperArm', 'Forearm', 'Hand')])
            matrices = module_skin_matrices(rest, posed)
            bindings = dict(zip(('UpperArmArmor', 'ForearmArmor', 'ElbowArmor'), matrices))
            for name, bone in (('ShoulderSpaulder', 'UpperArm_'), ('WristCuff', 'Forearm_')):
                b = bone+part_side
                bindings[name] = np.array(rig.pose.bones[b].matrix @ rig.data.bones[b].matrix_local.inverted())
            for name, part in models[part_side+str(lod)].items():
                matrix = bindings[name]
                points = np.array(part['points']) @ matrix[:3, :3].T+matrix[:3, 3]
                mesh = bpy.data.meshes.new('Authored '+part_side+' '+name)
                mesh.from_pydata(points.tolist(), [], part['faces'])
                mesh.update()
                for material in mats:
                    mesh.materials.append(material)
                uv = mesh.uv_layers.new(name='Authored surface coordinates')
                for polygon in mesh.polygons:
                    polygon.use_smooth = True
                    polygon.material_index = part['materials'][polygon.index]
                    coords = [part['uv'][v] for v in polygon.vertices]
                    periodic = part.get('periodic_columns') and max(c[0] for c in coords)-min(c[0] for c in coords) > .875
                    for li in polygon.loop_indices:
                        coord = list(part['uv'][mesh.loops[li].vertex_index])
                        if periodic and coord[0] < .875:
                            coord[0] += 1.75
                        uv.data[li].uv = coord
                obj = bpy.data.objects.new(mesh.name, mesh)
                scene.collection.objects.link(obj)
                temporary.append(obj)
        joints = np.array([rig.pose.bones[n+'_'+side].head[:] for n in ('UpperArm', 'Forearm', 'Hand')])
        axes = np.diff(joints, axis=0)
        axes /= np.linalg.norm(axes, axis=1)[:, None]
        basis = frame(axes[0]+axes[1], axes[1]-axes[0])
        views = [('elbow', Vector(joints[1]), Vector(-basis[:, 2]+basis[:, 0]*(.65 if side == 'R' else -.65)), .50)]
        if clip != 'Death':
            views.append(('body', Vector((0, .08, 1)), Vector((4.5, 4.5, 1.5)), 2.35))
        for view, target, direction, span in views:
            camera.location = target+direction.normalized()*5
            camera.rotation_euler = (target-camera.location).to_track_quat('-Z', 'Y').to_euler()
            data.ortho_scale = span
            path = out/f'{clip}-{time}-{side}-{view}.png'
            scene.render.filepath = str(path)
            bpy.ops.render.render(write_still=True)
            rows.append({'path': str(path.relative_to(ROOT)).replace('\\', '/'), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                         'clip': clip, 'frame': time, 'side': side, 'target': list(target), 'direction': list(direction), 'ortho_scale': span})
    (RUN/('qa/renders-v3-lod'+str(lod)+'.json')).write_text(json.dumps({'source_sha256': SHA, 'lod': lod, 'runtime_publish_allowed': False,
                                                    'source_saved': False, 'scope': 'Static shape only; analytic helper motion is rejected', 'renders': rows}, indent=2)+'\n', encoding='utf-8')


if __name__ == '__main__':
    main()
