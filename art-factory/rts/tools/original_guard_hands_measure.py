"""Freeze and measure the current original guard assembly before hand fitting.

Read-only with respect to assembly inputs: the exact source bytes are copied
into the original-guard-hands run before Blender opens them.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / 'art-factory/rts/runs/original-guard-hands/2026-10-05'
SOURCE = ROOT / 'art-factory/rts/runs/original-guard-assembly/2026-10-05/candidate/original-guard-assembly.blend'
FROZEN = RUN / 'candidate/original-guard-hands-base.blend'


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def vec(value):
    return [round(float(x), 7) for x in value]


def gltf_y_up(v):
    # Blender +Y is the model front; glTF front is -Z.
    return Vector((v.x, v.z, -v.y))


def object_bounds(obj):
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    minimum = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    maximum = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    return {'min_blender_xyz_m': vec(minimum), 'max_blender_xyz_m': vec(maximum),
            'min_gltf_y_up_m': [minimum.x, minimum.z, -maximum.y],
            'max_gltf_y_up_m': [maximum.x, maximum.z, -minimum.y]}


def material_bounds(obj):
    rows = {}
    for poly in obj.data.polygons:
        name = obj.data.materials[poly.material_index].name if poly.material_index < len(obj.data.materials) else 'unassigned'
        points = [obj.matrix_world @ obj.data.vertices[index].co for index in poly.vertices]
        row = rows.setdefault(name, {'points': []})
        row['points'].extend(tuple(point) for point in points)
    result = {}
    for name, row in rows.items():
        points = row.pop('points')
        low = Vector(tuple(min(point[i] for point in points) for i in range(3)))
        high = Vector(tuple(max(point[i] for point in points) for i in range(3)))
        center = (low + high) * .5
        result[name] = {'min_blender_xyz_m': vec(low), 'max_blender_xyz_m': vec(high),
                        'center_blender_xyz_m': vec(center),
                        'min_gltf_y_up_m': [low.x, low.z, -high.y],
                        'max_gltf_y_up_m': [high.x, high.z, -low.y]}
    return result


def main():
    RUN.mkdir(parents=True, exist_ok=True)
    (RUN / 'candidate').mkdir(parents=True, exist_ok=True)
    (RUN / 'qa').mkdir(parents=True, exist_ok=True)
    if not FROZEN.exists():
        FROZEN.write_bytes(SOURCE.read_bytes())
    frozen_bytes = FROZEN.read_bytes()
    frozen_sha = sha(frozen_bytes)
    bpy.ops.wm.open_mainfile(filepath=str(FROZEN))

    armature = bpy.data.objects.get('GuardRig20')
    if armature is None or armature.type != 'ARMATURE':
        candidates = [obj for obj in bpy.data.objects if obj.type == 'ARMATURE']
        if len(candidates) != 1:
            raise RuntimeError('Cannot identify the single GuardRig20 armature')
        armature = candidates[0]
    sword = bpy.data.objects.get('KingdomSteelSword_LOD0')
    shield = bpy.data.objects.get('KingdomSunShield_LOD0')
    arms = bpy.data.objects.get('GuardArms_LOD0')
    required = {obj.name: obj for obj in (sword, shield, arms) if obj is not None}
    if len(required) != 3:
        raise RuntimeError(f'Missing expected hand-fit objects: {list(required)}')

    bones = {}
    for name in ('Forearm_L', 'Hand_L', 'Forearm_R', 'Hand_R'):
        bone = armature.data.bones.get(name)
        if bone is None:
            raise RuntimeError(f'Missing canonical hand-fit bone {name}')
        head = armature.matrix_world @ bone.head_local
        tail = armature.matrix_world @ bone.tail_local
        bones[name] = {
            'head_blender_xyz_m': vec(head), 'tail_blender_xyz_m': vec(tail),
            'head_gltf_y_up_m': vec(gltf_y_up(head)), 'tail_gltf_y_up_m': vec(gltf_y_up(tail)),
            'length_m': round(float((tail - head).length), 7),
        }

    meshes = {}
    for name, obj in required.items():
        if obj.type != 'MESH':
            raise RuntimeError(f'{name} is not a mesh object')
        meshes[name] = {'bounds': object_bounds(obj), 'material_slot_bounds': material_bounds(obj),
                        'material_names': [mat.name if mat else None for mat in obj.data.materials],
                        'vertex_count': len(obj.data.vertices), 'triangle_count': sum(len(poly.vertices) - 2 for poly in obj.data.polygons),
                        'matrix_world': [[round(float(value), 7) for value in row] for row in obj.matrix_world]}

    # Relevant rig context helps evaluate wrist/cuff overlap in relation to the arm shell.
    arms.data.calc_loop_triangles()
    report = {
        'status': 'measured-frozen-source',
        'runtime_publish_allowed': False,
        'source_blend': str(SOURCE),
        'frozen_blend': str(FROZEN),
        'frozen_blend_sha256': frozen_sha,
        'coordinate_note': 'Blender world XYZ in meters; glTF Y-up conversion is (x,z,-y); Blender +Y faces model front/glTF -Z.',
        'armature': armature.name,
        'skin_bones': len(armature.data.bones),
        'bones': bones,
        'objects': meshes,
    }
    out = RUN / 'qa/measurement-base.json'
    out.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
    print('GUARD_HANDS_BASE=' + json.dumps({
        'source_sha256': frozen_sha,
        'bones': bones,
        'objects': {name: {'bounds': item['bounds'],
                           'material_slot_bounds': item['material_slot_bounds'],
                           'materials': item['material_names']} for name, item in meshes.items()},
    }), flush=True)


if __name__ == '__main__':
    main()
