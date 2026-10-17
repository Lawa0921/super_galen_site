"""Asset regression: eliminate duplicate equipment draws with exact art parity."""
import json
import os
import unittest
from copy import deepcopy
from pathlib import Path
from detail_materials import read_glb

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / 'art-factory/rts/runs/visual-revision/2026-10-16-complete-v3'
RUN = Path(os.environ.get('RTS_ALIAS_RUN', str(BASE)))
ALIASES = {8: 0, 9: 1, 6: 5}


def resolved_material(doc, index):
    value = deepcopy(doc['materials'][index])
    value.pop('name', None)
    def visit(item):
        if isinstance(item, dict):
            for key, child in item.items():
                if key.endswith('Texture'):
                    child['index'] = deepcopy(doc['textures'][child['index']])
                else:
                    visit(child)
    visit(value)
    return value


class KnightMaterialAliasTests(unittest.TestCase):
    def test_equipment_uses_single_material_identity_per_exact_surface(self):
        for name in ('knight', 'knight-lod1'):
            with self.subTest(name=name):
                doc, _ = read_glb(RUN / 'candidate' / (name + '.glb'))
                used = {p['material'] for m in doc['meshes'] for p in m['primitives']}
                self.assertTrue(used.isdisjoint(ALIASES), 'Duplicate equipment materials still referenced')

    def test_every_primitive_keeps_geometry_weights_bounds_animation_and_surface(self):
        for name in ('knight', 'knight-lod1'):
            with self.subTest(name=name):
                before, raw = read_glb(BASE / 'candidate' / (name + '.glb'))
                after, binary = read_glb(RUN / 'candidate' / (name + '.glb'))
                self.assertEqual(raw, binary)
                restored = deepcopy(after)
                for old_mesh, new_mesh, restore_mesh in zip(before['meshes'], after['meshes'], restored['meshes']):
                    for old, new, restore in zip(old_mesh['primitives'], new_mesh['primitives'], restore_mesh['primitives']):
                        self.assertEqual(resolved_material(before, old['material']), resolved_material(after, new['material']))
                        self.assertEqual('teamcloth' in before['materials'][old['material']]['name'].lower(),
                                         'teamcloth' in after['materials'][new['material']]['name'].lower())
                        restore['material'] = old['material']
                self.assertEqual(before, restored)


if __name__ == '__main__':
    unittest.main()
