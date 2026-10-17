"""Inspect actual forearm, sleeve interface and an explicitly diagnostic source placement."""
import bpy, hashlib, json, math, sys
from pathlib import Path
from mathutils import Matrix, Vector
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from guard_hand_frame_inventory import ROOT, RUN, GUARD, GUARD_SHA
from guard_hand_surface_chart import SOURCE, EXPECTED, RUN as CHART
from guard_digit02_grip_diagnose import DIGIT, DIGIT_SHA
from original_guard_grip_fit_math import rigid_fit


def mat(name, color):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    node = result.node_tree.nodes['Principled BSDF']
    node.inputs['Base Color'].default_value = (*color, 1)
    node.inputs['Roughness'].default_value = .7
    return result


def main():
    for path, expected in ((GUARD, GUARD_SHA), (SOURCE, EXPECTED), (DIGIT, DIGIT_SHA)):
        assert hashlib.sha256(path.read_bytes()).hexdigest() == expected
    bpy.ops.wm.open_mainfile(filepath=str(GUARD))
    bpy.data.objects['GuardRig20'].data.pose_position = 'REST'
    for obj in bpy.data.objects:
        obj.hide_render = obj.type != 'MESH' or not obj.name.endswith('_LOD0') or 'HandGrip_R' in obj.name
    arm = bpy.data.objects['GuardArms_LOD0']
    arm.data.materials.clear()
    arm.data.materials.append(mat('Actual arm surface', (.18, .25, .29)))
    for p in arm.data.polygons:
        p.material_index = 0
    for path, name in ((SOURCE, 'OriginalGripChannelCandidate'), (DIGIT, 'GuardRightDigit02_ShapeMaster')):
        with bpy.data.libraries.load(str(path), link=False) as (_, loaded):
            loaded.objects = [name]
        bpy.context.collection.objects.link(loaded.objects[0])
    source = bpy.data.objects['OriginalGripChannelCandidate']
    digit = bpy.data.objects['GuardRightDigit02_ShapeMaster']
    frame = json.loads((CHART / 'raw/control-chart.json').read_text(encoding='utf-8'))
    handle = json.loads((RUN.parent / '2026-10-08-v8-grip-diagnosis/qa/diagnosis.json').read_text(encoding='utf-8'))['handle']
    rotation, translation = rigid_fit(frame['origin'], frame['axis'], handle['center_m'], .9, math.pi / 2)
    matrix = np.eye(4)
    matrix[:3, :3] = rotation * .9
    matrix[:3, 3] = translation
    for obj, color in ((source, (.30, .31, .32)), (digit, (.16, .53, .39))):
        obj.matrix_world = Matrix(matrix.tolist())
        obj.hide_render = False
        obj.data.materials.clear()
        obj.data.materials.append(mat(obj.name + ' diagnostic', color))
    socket = json.loads((RUN / 'raw/current-sleeve-socket.json').read_text(encoding='utf-8'))
    curve = bpy.data.curves.new('Measured sleeve interface', 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = .0008
    spline = curve.splines.new('POLY')
    spline.points.add(len(socket['ordered_interface']) - 1)
    for point, item in zip(spline.points, socket['ordered_interface']):
        point.co = (*item['world_m'], 1)
    spline.use_cyclic_u = True
    curve.materials.append(mat('Measured interface annotation', (.85, .32, .04)))
    outline = bpy.data.objects.new('Measured interface annotation', curve)
    bpy.context.collection.objects.link(outline)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 1000
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.world = bpy.data.worlds.new('Current frame inspection')
    scene.world.color = (.05, .05, .05)
    scene.view_settings.look = 'AgX - Medium High Contrast'
    target = Vector((.43, .04, .92))
    for location, power in (((1.1, 1.1, 1.7), 150), ((-.25, .85, .9), 85), ((.8, -.9, 1.4), 100)):
        data = bpy.data.lights.new('Frame review softbox', 'AREA')
        data.energy = power
        data.size = .7
        obj = bpy.data.objects.new(data.name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (target - obj.location).to_track_quat('-Z', 'Y').to_euler()
    views = {
        'arm-and-historical-hand-front': ((1.6, 1.7, 1.1), (.37, .03, 1.08), .7, True),
        'sleeve-and-historical-hand-side': ((1.6, .04, .92), (.44, .02, .92), .38, True),
        'sleeve-and-fixed-digit': ((1.5, 1.1, 1.1), (.43, .04, .90), .33, False),
    }
    directory = RUN / 'qa/renders'
    directory.mkdir(parents=True, exist_ok=True)
    rendered = {}
    for name, (location, target, scale, show_source) in views.items():
        source.hide_render = not show_source
        data = bpy.data.cameras.new(name)
        data.type = 'ORTHO'
        data.ortho_scale = scale
        data.clip_start = .001
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()
        scene.camera = obj
        path = directory / (name + '.png')
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        rendered[name] = {'path': str(path.relative_to(ROOT)).replace('\\', '/'), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
    (RUN / 'qa/renders.json').write_text(json.dumps({
        'status': 'historical_placement_context_only', 'source_guard_sha256': GUARD_SHA,
        'source_high_sha256': EXPECTED, 'source_digit_sha256': DIGIT_SHA,
        'geometry_resaved': False, 'runtime_publish_allowed': False,
        'placement': 'Historical scale 0.9 spin90, not a frozen authoring transform', 'renders': rendered
    }, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
