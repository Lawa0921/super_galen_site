import unittest
import json
import struct
import hashlib
from pathlib import Path
import numpy as np
import original_guard_helmet_rebuild_math as helmet_math
from original_guard_helmet_rebuild_math import crown_cage, visor_cage, visor_point


class HelmetCageTests(unittest.TestCase):
    def test_crown_has_one_clean_lower_boundary_and_no_degenerate_faces(self):
        vertices, faces = crown_cage(48)
        edges = {}
        for face in faces:
            points = vertices[face]
            self.assertGreater(np.linalg.norm(np.cross(points[1]-points[0], points[2]-points[0])), 1e-10)
            for a,b in zip(face, np.roll(face, -1)):
                key=tuple(sorted((int(a),int(b))));edges[key]=edges.get(key,0)+1
        self.assertEqual(sum(n==1 for n in edges.values()),48)
        self.assertTrue(all(n in (1,2) for n in edges.values()))

    def test_visor_is_symmetric_and_has_a_continuous_chin_edge(self):
        vertices,faces=visor_cage(48)
        rings=vertices.reshape(-1,49,3)
        np.testing.assert_allclose(rings[:,:,0],-rings[:,::-1,0],atol=1e-12)
        np.testing.assert_allclose(rings[:,:,1:],rings[:,::-1,1:],atol=1e-12)
        self.assertGreater(rings[-1,0,2]-rings[-1,24,2],.025)
        self.assertTrue(np.isfinite(vertices).all())
        self.assertTrue(all(len(face)==4 for face in faces))

    def test_actual_eye_gap_is_open_in_front_not_a_painted_black_line(self):
        vertices,_=crown_cage(48)
        top=visor_point(0,0)
        self.assertGreater(vertices[0,2]-top[2],.007)
        self.assertLess(vertices[0,2]-top[2],.018)

    def test_invalid_resolution_rejected(self):
        for factory in [crown_cage,visor_cage]:
            with self.assertRaises(ValueError):factory(3)


class HelmetLOD0Tests(unittest.TestCase):
    def test_reduced_visor_cage_preserves_the_original_open_rims(self):
        vertices, faces = visor_cage(32, rows=(0,.33,.67,1))
        self.assertLessEqual(sum(len(face)-2 for face in faces), 192)
        for i, theta in [(0,-1.65),(16,0),(32,1.65)]:
            np.testing.assert_allclose(vertices[i], visor_point(theta,0))
            np.testing.assert_allclose(vertices[-33+i], visor_point(theta,1))
        with self.assertRaises(ValueError):
            visor_cage(32, rows=(.3,1))

    def test_actual_built_helmet_is_within_rts_triangle_budget(self):
        path = Path(__file__).resolve().parents[3]/'art-factory/rts/runs/original-guard-helmet-rebuild/2026-10-05/qa/geometry.json'
        components = json.loads(path.read_text())['components']
        self.assertLessEqual(sum(part['triangles'] for part in components.values()), 6000)

    def test_actual_built_parts_have_no_degenerate_or_open_surface(self):
        path = Path(__file__).resolve().parents[3]/'art-factory/rts/runs/original-guard-helmet-rebuild/2026-10-05/qa/geometry.json'
        components = json.loads(path.read_text())['components']
        for name, part in components.items():
            with self.subTest(part=name):
                self.assertEqual(part['zero_area_faces'], 0)
                self.assertEqual(part['nonmanifold_edges'], 0)
                self.assertEqual(part['boundary_edges'], 0)


    def test_actual_exported_glb_matches_closed_lod0_surfaces(self):
        run = Path(__file__).resolve().parents[3]/'art-factory/rts/runs/original-guard-helmet-rebuild/2026-10-05'
        report = json.loads((run/'qa/geometry.json').read_text())
        raw = (run/'candidate/original-guard-helmet-rebuild.glb').read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), report['glb_sha256'])
        json_size = struct.unpack_from('<I', raw, 12)[0]
        doc = json.loads(raw[20:20+json_size])
        binary = raw[28+json_size:]
        def accessor(index):
            item=doc['accessors'][index];view=doc['bufferViews'][item['bufferView']]
            components={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[item['type']]
            fmt='<'+{5121:'B',5123:'H',5125:'I',5126:'f'}[item['componentType']]*components
            stride=view.get('byteStride',struct.calcsize(fmt));offset=view.get('byteOffset',0)+item.get('byteOffset',0)
            return np.asarray([struct.unpack_from(fmt,binary,offset+i*stride) for i in range(item['count'])])
        meshes={mesh['name']:mesh for mesh in doc['meshes']}
        self.assertFalse(any('AuthoredCage' in name for name in meshes))
        for name, expected in report['components'].items():
            self.assertIn(name,meshes)
            triangle_count=0
            for primitive in meshes[name]['primitives']:
                self.assertEqual(primitive.get('mode',4),4)
                positions=accessor(primitive['attributes']['POSITION'])
                indices=accessor(primitive['indices']).reshape(-1,3).astype(int)
                triangle_count+=len(indices)
                points=positions[indices]
                self.assertTrue((np.linalg.norm(np.cross(points[:,1]-points[:,0],points[:,2]-points[:,0]),axis=1)>1e-13).all(),name)
                _,welded=np.unique(positions,axis=0,return_inverse=True)
                triangles=welded[indices]
                edges=np.sort(np.concatenate((triangles[:,[0,1]],triangles[:,[1,2]],triangles[:,[2,0]])),axis=1)
                _,counts=np.unique(edges,axis=0,return_counts=True)
                self.assertTrue((counts==2).all(),name)
            self.assertEqual(triangle_count,expected['triangles'],name)


class HelmetSurfaceUVTests(unittest.TestCase):
    def test_front_and_sides_keep_identical_uvs_across_shared_faces(self):
        self.assertTrue(hasattr(helmet_math, 'cylindrical_surface_uvs'))
        for vertices, faces in [crown_cage(48), visor_cage(48)]:
            uvs = helmet_math.cylindrical_surface_uvs(vertices, faces)
            seen = {}
            for face, coords in zip(faces, uvs):
                for vertex_id, uv in zip(face, coords):
                    point = vertices[vertex_id]
                    if (point[1] < -.026 and abs(point[0]) < 1e-9) or abs(point[0]) + abs(point[1]+.026) < 1e-9:
                        continue
                    if vertex_id in seen:
                        np.testing.assert_allclose(uv, seen[vertex_id], atol=1e-10)
                    seen[vertex_id] = uv

    def test_wrap_is_at_rear_and_no_face_stretches_across_whole_texture(self):
        self.assertTrue(hasattr(helmet_math, 'cylindrical_surface_uvs'))
        vertices, faces = crown_cage(48)
        uvs = helmet_math.cylindrical_surface_uvs(vertices, faces, repeat=.10)
        seen = {}
        seam_vertices = set()
        for face, coords in zip(faces, uvs):
            self.assertLess(np.ptp(np.asarray(coords)[:,0]), .8)
            for vertex_id, uv in zip(face, coords):
                if abs(vertices[vertex_id,0]) + abs(vertices[vertex_id,1]+.026) < 1e-9:
                    continue  # The crown pole has no unique circumferential coordinate.
                if vertex_id in seen and abs(uv[0]-seen[vertex_id][0]) > .01:
                    seam_vertices.add(vertex_id)
                    self.assertLess(vertices[vertex_id,1], -.026+1e-8)
                    self.assertAlmostEqual(abs(uv[0]-seen[vertex_id][0]) % 1, 0, places=8)
                seen[vertex_id] = uv
        self.assertTrue(seam_vertices)

    def test_physical_vertical_sampling_and_invalid_repeat(self):
        self.assertTrue(hasattr(helmet_math, 'cylindrical_surface_uvs'))
        vertices, faces = visor_cage(48)
        uvs = helmet_math.cylindrical_surface_uvs(vertices, faces, repeat=.10)
        for face, coords in zip(faces, uvs):
            np.testing.assert_allclose(np.asarray(coords)[:,1], vertices[face,2]/.10)
        with self.assertRaises(ValueError):
            helmet_math.cylindrical_surface_uvs(vertices, faces, repeat=0)

    def test_box_sampling_attenuates_fine_grain_without_repainting_mean(self):
        self.assertTrue(hasattr(helmet_math, 'resample_texture_box'))
        pixels = np.zeros((8,8,4), dtype=float)
        pixels[:,:,3] = 1
        pixels[::2,::2,:3] = 1
        pixels[1::2,1::2,:3] = 1
        sampled = helmet_math.resample_texture_box(pixels, 2)
        self.assertEqual(sampled.shape, (4,4,4))
        np.testing.assert_allclose(sampled.mean(axis=(0,1)), pixels.mean(axis=(0,1)))
        self.assertLess(sampled[:,:,:3].std(), pixels[:,:,:3].std())
        with self.assertRaises(ValueError):
            helmet_math.resample_texture_box(pixels, 3)


if __name__=='__main__':unittest.main()
