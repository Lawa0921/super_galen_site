"""Read-only derivation gates against the immutable pre-publication snapshots."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import unittest

from procedural_gauntlet_publish import read_glb
from rigid_weapon_transform import read_attribute

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / 'art-factory/rts/runs/work-cast/2026-10-11-v2'
CLIPS = {'worker': ['Mine', 'Chop', 'Build'], 'priest': ['Cast'],
         'commander': ['CastCleave', 'CastMend', 'CastBanner']}


class WorkCastCandidateTest(unittest.TestCase):
    def candidate(self, unit, lod):
        path = RUN / f'candidate/{unit}-lod{lod}.glb'
        self.assertTrue(path.is_file(), f'Missing candidate: {path.name}')
        return read_glb(path)

    def test_retains_every_existing_binary_byte_and_json_record_for_both_lods(self):
        for unit in CLIPS:
            for lod in (0, 1):
                with self.subTest(unit=unit, lod=lod):
                    base, original = read_glb(RUN / f'raw/input/{unit}-lod{lod}.glb')
                    document, binary = self.candidate(unit, lod)
                    self.assertEqual(binary[:len(original)], original)
                    restored = deepcopy(document)
                    restored['buffers'] = base['buffers']
                    for key in ('animations', 'accessors', 'bufferViews'):
                        restored[key] = restored[key][:len(base[key])]
                    if unit == 'commander':
                        mesh_id = next(n['mesh'] for n in base['nodes'] if n.get('name') == f'CommanderLongsword_LOD{lod}')
                        for new, old in zip(restored['meshes'][mesh_id]['primitives'], base['meshes'][mesh_id]['primitives']):
                            for attr in ('POSITION', 'NORMAL'):
                                new['attributes'][attr] = old['attributes'][attr]
                    # The sole non-animation exception: additive conservative
                    # envelope metadata. Transform/mesh/skin records stay exact.
                    for i, node in enumerate(restored['nodes']):
                        if 'mesh' not in node or 'skin' not in node:
                            continue
                        if 'rtsConservativeBounds' in node.get('extras', {}):
                            node['extras'].pop('rtsConservativeBounds')
                            old = base['nodes'][i].get('extras', {}).get('rtsConservativeBounds')
                            if old is not None:
                                node['extras']['rtsConservativeBounds'] = old
                            if not node['extras'] and 'extras' not in base['nodes'][i]:
                                node.pop('extras')
                    self.assertEqual(restored, base)

    def test_commander_blade_points_away_from_wrist_with_original_geometry(self):
        for lod in (0, 1):
            base, raw = read_glb(RUN / f'raw/input/commander-lod{lod}.glb')
            doc, binary = self.candidate('commander', lod)
            mesh_id = next(n['mesh'] for n in base['nodes'] if n.get('name') == f'CommanderLongsword_LOD{lod}')
            primitives = base['meshes'][mesh_id]['primitives']
            grip = next(p for p in primitives if base['materials'][p['material']]['name'] == 'WornLeatherGrip')
            positions = read_attribute(base, raw, grip['attributes']['POSITION'])
            pivot = [(min(v[i] for v in positions)+max(v[i] for v in positions))/2 for i in range(3)]
            for before, after in zip(primitives, doc['meshes'][mesh_id]['primitives']):
                for old, new in zip(read_attribute(base, raw, before['attributes']['POSITION']), read_attribute(doc, binary, after['attributes']['POSITION'])):
                    for actual, expected in zip(new, [old[0], 2*pivot[1]-old[1], 2*pivot[2]-old[2]]):
                        self.assertAlmostEqual(actual, expected, places=6)

    def test_new_named_clips_have_motion_and_identical_curves_across_lods(self):
        for unit, names in CLIPS.items():
            signatures = []
            for lod in (0, 1):
                with self.subTest(unit=unit, lod=lod):
                    document, binary = self.candidate(unit, lod)
                    self.assertEqual(sorted(a['name'] for a in document['animations']),
                                     sorted(['Idle', 'Walk', 'Attack', 'Hurt', 'Death', *names]))
                    clips = {}
                    for animation in document['animations']:
                        if animation['name'] not in names:
                            continue
                        channels = []
                        for channel in animation['channels']:
                            sampler = animation['samplers'][channel['sampler']]
                            data = []
                            for field in ('input', 'output'):
                                accessor = document['accessors'][sampler[field]]
                                view = document['bufferViews'][accessor['bufferView']]
                                data.append(binary[view['byteOffset']:view['byteOffset'] + view['byteLength']].hex())
                            channels.append([document['nodes'][channel['target']['node']]['name'], channel['target']['path'], *data])
                        self.assertGreater(len(channels), 10)
                        clips[animation['name']] = sorted(channels)
                    self.assertEqual(len({json.dumps(c) for c in clips.values()}), len(names), 'Distinct actions cannot duplicate curves')
                    signatures.append(clips)
            if len(signatures) == 2:
                self.assertEqual(signatures[0], signatures[1])

    def test_candidate_build_preserves_locked_sources_and_snapshots(self):
        lock = json.loads((RUN / 'source-lock.json').read_text(encoding='utf-8'))
        for unit in lock['units']:
            for record in [unit['source'], *unit['base_glbs']]:
                # Runtime paths intentionally change during the separate
                # checked publisher. Editable originals and input snapshots do not.
                for key in (('path', 'snapshot') if record is unit['source'] else ('snapshot',)):
                    self.assertEqual(hashlib.sha256((ROOT / record[key]).read_bytes()).hexdigest(), record['sha256'])
        report_path = RUN / 'qa/build.json'
        self.assertTrue(report_path.is_file(), 'Missing Blender preservation report')
        report = json.loads(report_path.read_text(encoding='utf-8'))
        self.assertFalse(report['runtime_publish_allowed'])
        self.assertEqual(len(report['units']), 3)
        for row in report['units']:
            self.assertEqual(row['source_fingerprint_before'], row['source_fingerprint_after'])


if __name__ == '__main__':
    unittest.main()
