"""Original belt/skirt skinning repair; frozen geometry and original animations."""
import ast
import bpy
import hashlib
import json
import os
from pathlib import Path
import sys


def smooth(low, high, value):
    t = max(0.0, min(1.0, (value - low) / (high - low)))
    return t * t * (3 - 2 * t)


def weights_for_waist(co, old):
    x, y, z = co
    if not (.66 < z < 1.21 and abs(x) < .325):
        return old
    if any(('Arm' in name or 'Hand' in name or 'Shoulder' in name) and weight > 1e-7
           for name, weight in old.items()):
        return old
    influence = (smooth(.66, .73, z) * (1 - smooth(1.09, 1.21, z)) *
                 (1 - smooth(.27, .325, abs(x))))
    if influence == 0:
        return old
    spine = smooth(.78, .84, z)
    upper = smooth(1.04, 1.18, z)
    thigh = (1 - smooth(.68, .79, z)) * smooth(.035, .15, abs(x))
    desired = {'Pelvis': (1 - spine) * (1 - thigh),
               'Thigh_' + ('L' if x < 0 else 'R'): (1 - spine) * thigh,
               'SpineLower': spine * (1 - upper), 'SpineUpper': spine * upper}
    mixed = {name: old.get(name, 0) * (1 - influence) + desired.get(name, 0) * influence
             for name in old.keys() | desired.keys()}
    mixed = dict(sorted(((name, weight) for name, weight in mixed.items() if weight > 1e-7),
                        key=lambda item: (-item[1], item[0]))[:4])
    total = sum(mixed.values())
    return {name: weight / total for name, weight in mixed.items()}


def main():
    source, run = [Path(p).resolve() for p in sys.argv[sys.argv.index('--') + 1:][:2]]
    expected = 'ac7c8b91f31ac44222e1f1924939828630cbaadec9b380f5280123bc499cae55'
    assert hashlib.sha256(source.read_bytes()).hexdigest() == expected, 'Source changed'
    candidate = run / 'candidate'; candidate.mkdir(parents=True, exist_ok=True)
    (run / 'qa').mkdir(exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(source))
    rig = bpy.data.objects['crossbowRig20']
    bodies = [bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'] for lod in (0, 1)]
    weapons = [bpy.data.objects[f'CrossbowWeapon_LOD{lod}'] for lod in (0, 1)]
    hands = [bpy.data.objects['OriginalCrossbowClosedGrip_' + side] for side in ('L', 'R')]
    changed = {}
    for obj in bodies:
        count = 0
        for vertex in obj.data.vertices:
            old = {obj.vertex_groups[g.group].name: g.weight for g in vertex.groups}
            new = weights_for_waist(vertex.co, old)
            if new == old:
                continue
            for g in list(vertex.groups):
                obj.vertex_groups[g.group].remove([vertex.index])
            for name, weight in new.items():
                obj.vertex_groups[name].add([vertex.index], weight, 'REPLACE')
            count += 1
        changed[obj.name] = count
    bpy.ops.wm.save_as_mainfile(filepath=str(candidate / 'original-crossbow-grip.blend'))
    # Use the accepted exporter verbatim, without executing its build/main body.
    # Its decimation, four-times subframe sampling and material settings stay fixed.
    exporter = Path(__file__).with_name('original_crossbow_grip_build.py')
    tree = ast.parse(exporter.read_text(encoding='utf-8'))
    definition = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'export_lod')
    namespace = {'bpy': bpy, 'os': os}
    exec(compile(ast.Module(body=[definition], type_ignores=[]), str(exporter), 'exec'), namespace)
    for lod in (0, 1):
        namespace['export_lod'](rig, bodies, weapons, [], hands,
            str(candidate / f'original-crossbow-grip-lod{lod}.glb'), bodies[lod].name, weapons[lod].name)
    report = {'source_sha256': expected, 'changed_weight_vertices': changed,
              'status': 'candidate', 'runtime_publish_allowed': False,
              'files': {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                        for p in candidate.iterdir() if p.suffix in ('.blend', '.glb')},
              'exporter_sha256': hashlib.sha256(exporter.read_bytes()).hexdigest()}
    (candidate / 'waist-candidate-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print('WAIST_CANDIDATE', json.dumps(report))


if __name__ == '__main__':
    main()
