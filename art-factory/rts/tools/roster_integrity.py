"""Mechanical acceptance for a new roster-expansion unit GLB pair (no previous version exists).

Applies the all_models_integrity / human-units / runtime gates to both LODs:
exact clip set, one 20-joint skin with the published unit joint names and identical inverse binds in
both LODs (shared LOD rig), finite data, normalized weights (<1e-5) with <=4 influences, strictly
increasing keys and identical clip durations across LODs, external materials present, LOD0 8k..20k
and LOD1 4k..10k triangles with LOD1 < LOD0, identical rtsMotion metadata, conservative bounds on
every skinned node, an embedded team mask under 3 MB, a byte budget no larger than the guard pair,
and the floor gate (lowest point >= -5 mm, Idle <= 3 cm above ground) from the runtime samples.

Usage: python roster_integrity.py --run <run> --unit pikeman --clips Idle,Walk,Attack,Hurt,Death
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

from commander_assembly_integrity import values
from procedural_gauntlet_publish import read_glb

ROOT = Path(__file__).resolve().parents[3]
MODELS = ROOT / 'public/assets/games/rts/models'
JOINTS = ['Root', 'Pelvis', 'SpineLower', 'SpineUpper', 'Neck', 'Head', 'Shoulder_L', 'UpperArm_L', 'Forearm_L', 'Hand_L',
          'Shoulder_R', 'UpperArm_R', 'Forearm_R', 'Hand_R', 'Thigh_L', 'Shin_L', 'Foot_L', 'Thigh_R', 'Shin_R', 'Foot_R']


def inspect(path, clips, failures, label):
    doc, raw = read_glb(path)
    def check(ok, message):
        if not ok:
            failures.append(f'{label}: {message}')
        return ok
    check(sorted(a['name'] for a in doc['animations']) == sorted(clips), f"clips {[a['name'] for a in doc['animations']]}")
    check(len(doc['skins']) == 1, 'expected one skin')
    skin = doc['skins'][0]
    names = [doc['nodes'][j]['name'] for j in skin['joints']]
    check(sorted(names) == sorted(JOINTS), f'joint names {names}')
    ibm = values(doc, raw, skin['inverseBindMatrices'])
    tris = draws = 0
    max_error = 0.0
    max_influences = 0
    for node in doc['nodes']:
        if 'mesh' not in node:
            continue
        check('skin' in node, f"{node['name']} is not skinned")
        check('rtsConservativeBounds' in node.get('extras', {}), f"{node['name']} lacks conservative bounds")
        for p in doc['meshes'][node['mesh']]['primitives']:
            attrs = p['attributes']
            draws += 1
            tris += doc['accessors'][p['indices']]['count'] // 3
            for attribute, index in attrs.items():
                check(all(math.isfinite(x) for row in values(doc, raw, index) for x in row), f"{node['name']} {attribute} non-finite")
            weights = values(doc, raw, attrs['WEIGHTS_0'])
            joints = values(doc, raw, attrs['JOINTS_0'])
            for w, j in zip(weights, joints):
                max_error = max(max_error, abs(sum(w) - 1))
                max_influences = max(max_influences, sum(1 for x in w if x > 0))
                if not all(0 <= int(i) < len(skin['joints']) for i in j):
                    check(False, 'joint index out of range')
                    break
            material = doc['materials'][p['material']]
            if 'normalTexture' in material:
                check('NORMAL' in attrs and 'TEXCOORD_0' in attrs, f"{node['name']} missing normal-map inputs")
    check(max_error < 1e-5, f'unnormalized weights {max_error}')
    check(max_influences <= 4, f'{max_influences} influences')
    durations = {}
    for a in doc['animations']:
        durations[a['name']] = max(values(doc, raw, s['input'])[-1][0] for s in a['samplers'])
        for s in a['samplers']:
            times = [r[0] for r in values(doc, raw, s['input'])]
            check(all(b > a_ for a_, b in zip(times, times[1:])), f"{a['name']} non-increasing keys")
            check(all(math.isfinite(v) for r in values(doc, raw, s['output']) for v in r), f"{a['name']} non-finite animation")
        check(all(doc['nodes'][c['target']['node']]['name'] in JOINTS for c in a['channels']), f"{a['name']} targets a non-bone node")
    for im in doc.get('images', []):
        check('uri' in im and not im['uri'].startswith('data:'), 'embedded image')
        if 'uri' in im:
            check((path.parent / im['uri']).is_file() or (MODELS / im['uri']).is_file(), f"missing material {im['uri']}")
    masks = [m['extras']['teamTintMask'] for m in doc['materials'] if 'teamTintMask' in m.get('extras', {})]
    check(len(masks) == 1 and masks[0].startswith('data:image/png;base64,') and len(masks[0]) <= 3000000, 'team mask')
    check(any('TeamCloth' in m['name'] for m in doc['materials']), 'no TeamCloth material')
    motion = doc['scenes'][doc.get('scene', 0)].get('extras', {}).get('rtsMotion')
    return {'file': path.as_posix(), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'bytes': path.stat().st_size,
            'triangles': tris, 'draws': draws, 'joints': names, 'inverse_binds': [[round(x, 6) for x in r] for r in ibm],
            'clips': sorted(durations), 'durations_s': {k: round(v, 6) for k, v in durations.items()},
            'max_weight_sum_error': max_error, 'max_influences': max_influences, 'rtsMotion': motion,
            'team_mask_chars': len(masks[0]) if masks else 0}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', type=Path, required=True)
    parser.add_argument('--unit', required=True)
    parser.add_argument('--clips', required=True)
    parser.add_argument('--published', action='store_true')
    parser.add_argument('--budget-reference', default='guard')
    args = parser.parse_args()
    clips = args.clips.split(',')
    folder = MODELS if args.published else args.run / 'candidate'
    failures = []
    lod0 = inspect(folder / f'{args.unit}.glb', clips, failures, 'lod0')
    lod1 = inspect(folder / f'{args.unit}-lod1.glb', clips, failures, 'lod1')
    if not 8000 < lod0['triangles'] <= 20000:
        failures.append(f"lod0 triangles {lod0['triangles']}")
    if not 4000 < lod1['triangles'] <= 10000:
        failures.append(f"lod1 triangles {lod1['triangles']}")
    if not lod1['triangles'] < lod0['triangles']:
        failures.append('LOD1 does not reduce geometry')
    if lod0['joints'] != lod1['joints'] or lod0['inverse_binds'] != lod1['inverse_binds']:
        failures.append('LOD skeletons differ (shared LOD rig needs identical joints and inverse binds)')
    if lod0['durations_s'] != lod1['durations_s']:
        failures.append('LOD clip durations differ')
    if lod0['rtsMotion'] != lod1['rtsMotion']:
        failures.append('LOD rtsMotion differs')
    ref = args.budget_reference
    reference = {lod: (MODELS / f'{ref}{"-lod1" if lod else ""}.glb').stat().st_size for lod in (0, 1)}
    if lod0['bytes'] > reference[0] or lod1['bytes'] > reference[1]:
        failures.append(f'byte budget above {ref}: {lod0["bytes"]}/{lod1["bytes"]} vs {reference}')
    floor = None
    poses = args.run / f'qa/{args.unit}-runtime-collision.json'
    if poses.is_file():
        rows = json.loads(poses.read_text(encoding='utf-8'))['rows']
        floor = {'lowest_equipment_m': min(r['floor'] for r in rows)}
    build = json.loads((args.run / 'qa/build.json').read_text(encoding='utf-8'))
    ground = build['ground']
    lowest = min(v['min_z_m'] for lod in ground.values() for v in lod.values())
    idle_high = max(lod['Idle']['max_of_frame_minima_m'] for lod in ground.values())
    if lowest < -.005:
        failures.append(f'floor sink {lowest}')
    if idle_high > .03:
        failures.append(f'idle floats {idle_high}')
    for row in (lod0, lod1):
        row.pop('inverse_binds')
    report = {'unit': args.unit, 'status': 'failed' if failures else 'passed', 'scope': 'published' if args.published else 'candidate',
              'lods': [lod0, lod1], 'budget_reference_bytes': {ref: reference}, 'floor': {'lowest_m': lowest, 'idle_max_floor_m': idle_high, **(floor or {})},
              'failures': failures}
    name = 'integrity-published.json' if args.published else 'integrity.json'
    (args.run / 'qa' / name).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps({k: report[k] for k in ('status', 'failures')} | {'tris': [lod0['triangles'], lod1['triangles']], 'bytes': [lod0['bytes'], lod1['bytes']]}))
    assert not failures


if __name__ == '__main__':
    main()
