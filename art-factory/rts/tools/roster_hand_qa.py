"""Whole-clip closed-grip and cuff contact acceptance for roster-expansion units (source poses).

Same gates as all_models_hand_qa.py: grip gap -6..+8 mm to the leather grip surface, at least
12 of 16 wrap sectors, and zero strict cuff/equipment triangle crossings, sampled 31 times per
clip on both LODs. A hand the brief lets go of (pikeman support hand while falling) is recorded
as released from the release frame on and is still checked for cuff crossings.

Blender: blender -b --python roster_hand_qa.py -- <run> <unit> <weapon-prefix[,prefix...]> [release-json]
"""
import bpy, json, sys, math, hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0, str(Path(__file__).parent))
import procedural_gauntlet_build as g
from commander_assembly_qa import posed
from commander_assembly_collision import evaluated, exact_pairs


def components(hand):
    adj = [set() for _ in hand.data.vertices]
    for e in hand.data.edges:
        a, b = e.vertices
        adj[a].add(b)
        adj[b].add(a)
    seen, out = set(), []
    for i in range(len(adj)):
        if i in seen:
            continue
        todo, found = [i], set()
        while todo:
            v = todo.pop()
            if v in found:
                continue
            found.add(v)
            todo.extend(adj[v] - found)
        seen |= found
        out.append(found)
    return out


def main():
    args = sys.argv[sys.argv.index('--') + 1:]
    run, unit, prefix = Path(args[0]).resolve(), args[1], args[2]
    release = json.loads(args[3]) if len(args) > 3 else {}
    source = run / f'raw/{unit}-assembly.blend'
    bpy.ops.wm.open_mainfile(filepath=str(source))
    rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    build = json.loads((run / 'qa/build.json').read_text(encoding='utf-8'))
    hands = []
    for record in build['hands']:
        hand = bpy.data.objects[f"AssemblyHand_{record['side']}_LOD{record['lod']}"]
        names = json.loads(hand['original_gauntlet_parts'])
        parts = components(hand)
        assert len(parts) == len(names), (hand.name, 'part topology', len(parts), len(names))
        cuff = parts[names.index('cuff')]
        hand.data.calc_loop_triangles()
        faces = np.array([list(t.vertices) for t in hand.data.loop_triangles if all(i in cuff for i in t.vertices)])
        # Each hand is judged against the leather grip nearest to it (one prefix, or several
        # comma-separated prefixes such as a bow held in one hand and an arrow in the other).
        best = None
        for name in prefix.split(','):
            weapon = bpy.data.objects[f"{name}_LOD{record['lod']}"]
            leather = {i for p in weapon.data.polygons if 'leather' in weapon.data.materials[p.material_index].name.lower() for i in p.vertices}
            if not leather:
                continue
            g.set_action(rig, 'Idle')
            bpy.context.scene.frame_set(0)  # the hand records are in the Idle frame-0 reference pose
            points = posed(weapon)
            center = np.array(record['grip'])
            near = min(float(np.linalg.norm(points[i] - center)) for i in leather)
            if best is None or near < best[0]:
                best = (near, weapon, leather)
        hands.append((record, hand, best[1], best[2], faces))
    rows, failures = [], []
    for action in bpy.data.actions:
        g.set_action(rig, action.name)
        start, end = action.frame_range
        for frame in np.linspace(start, end, 31):
            bpy.context.scene.frame_set(int(frame), subframe=float(frame % 1))
            for record, hand, weapon, leather, faces in hands:
                hp = posed(hand)
                wp, wf, wt = evaluated(weapon)
                ids = list(leather)
                hand_center = hp.mean(axis=0)
                # Only the grip wrap under this hand (the pike carries two wraps).
                local = [i for i in ids if np.linalg.norm(wp[i] - hand_center) < .14]
                shaft = wp[local] if len(local) >= 12 else wp[ids]
                center = shaft.mean(axis=0)
                _, _, axes = np.linalg.svd(shaft - center)
                axis = axes[0]
                radial = shaft - center - np.outer((shaft - center) @ axis, axis)
                radius = float(np.percentile(np.linalg.norm(radial, axis=1), 80))
                d = hp - center
                along = d @ axis
                radial = d - np.outer(along, axis)
                dist = np.linalg.norm(radial, axis=1)
                near = (abs(along) < .045) & (dist > radius * .8) & (dist < radius + .026)
                gap = float(dist[near].min() - radius) if near.any() else math.inf
                trial = np.array([1., 0, 0]) if abs(axis[0]) < .9 else np.array([0., 1, 0])
                u = np.cross(axis, trial)
                u /= np.linalg.norm(u)
                v = np.cross(axis, u)
                angles = np.arctan2(radial[near] @ v, radial[near] @ u)
                sectors = len(set(np.floor((angles + math.pi) / math.tau * 16).astype(int) % 16))
                ct = BVHTree.FromPolygons(hp.tolist(), faces.tolist(), all_triangles=True)
                hits = len(exact_pairs(hp[faces], wp[wf], ct.overlap(wt)))
                released = frame >= release.get(f"{action.name}:{record['side']}", math.inf)
                row = {'clip': action.name, 'frame': float(frame), 'lod': record['lod'], 'side': record['side'],
                       'released': bool(released), 'gap_m': gap if math.isfinite(gap) else None,
                       'wrap_sectors': sectors, 'cuff_weapon_crossings': hits}
                rows.append(row)
                # A draw hand hooked on the string wraps it by design about half way round.
                min_sectors = 8 if record.get('grip_type') == 'hook' else 12
                if hits or (not released and not (-.006 <= gap <= .008 and sectors >= min_sectors)):
                    failures.append(row)
    held = [r for r in rows if not r['released']]
    report = {'unit': unit, 'source': source.as_posix(), 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
              'method': 'all_models_hand_qa gates: closed finger wrap, grip gap and strict cuff/equipment intersections; source poses',
              'gates': {'gap_m': [-.006, .008], 'min_wrap_sectors_of_16': 12, 'min_wrap_sectors_hook_of_16': 8, 'cuff_weapon_crossings': 0, 'samples_per_clip': 31},
              'release': release, 'checks': len(rows), 'held_checks': len(held),
              'gap_range_m': [min(r['gap_m'] for r in held), max(r['gap_m'] for r in held)] if held else None,
              'min_wrap_sectors': min(r['wrap_sectors'] for r in held) if held else None,
              'failures': failures, 'rows': rows}
    (run / f'qa/{unit}-hand-contact.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps({'unit': unit, 'checks': len(rows), 'held': len(held), 'gap_range_m': report['gap_range_m'],
                      'min_wrap': report['min_wrap_sectors'], 'failures': len(failures), 'first': failures[:4]}))
    assert not failures


if __name__ == '__main__':
    main()
