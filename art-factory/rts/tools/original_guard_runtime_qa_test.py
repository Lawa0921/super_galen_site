"""Adversarial tests use real packed GLBs, not mocked parser results."""
import base64
import json
from pathlib import Path
import struct
import tempfile
import unittest
import numpy as np

try:
    import original_guard_runtime_qa as qa
except ModuleNotFoundError:
    qa = None

JOINTS = ["Root","Pelvis","SpineLower","SpineUpper","Neck","Head",
          "Shoulder_L","UpperArm_L","Forearm_L","Hand_L",
          "Shoulder_R","UpperArm_R","Forearm_R","Hand_R",
          "Thigh_L","Shin_L","Foot_L","Thigh_R","Shin_R","Foot_R"]
DURATIONS = {"Idle":2.4,"Walk":2/3,"Attack":1.2,"Hurt":.5,"Death":1.6}
CONTRACT = {
    "clips": {name: {"durationSeconds": duration} for name,duration in DURATIONS.items()},
    "runtime_extras": {
        "version":1,
        "locomotion":{"clip":"Walk","strideMeters":2.0,"cycleSeconds":2/3},
        "attack":{"clip":"Attack","durationSeconds":1.2,"contactSeconds":16/30},
    },
}


def fixture(path, fault=None, attack_duration=None, motion_delta=0):
    binary=bytearray()
    doc={"asset":{"version":"2.0"},"bufferViews":[],"accessors":[]}
    def view(raw):
        offset=len(binary);binary.extend(raw)
        while len(binary)%4:binary.append(0)
        doc["bufferViews"].append({"buffer":0,"byteOffset":offset,"byteLength":len(raw)})
        return len(doc["bufferViews"])-1
    def access(values, component=5126, kind="VEC3"):
        array=np.asarray(values,dtype={5126:"<f4",5123:"<u2"}[component])
        doc["accessors"].append({"bufferView":view(array.tobytes()),"componentType":component,
                                 "count":len(array),"type":kind})
        return len(doc["accessors"])-1
    positions=np.array([[0,0,0],[1,0,0],[0,1,0]],dtype=float)
    normals=np.tile([0,0,1.],(3,1));uv=np.array([[0,0],[1,0],[0,1.]],dtype=float)
    weights=np.tile([1.,0,0,0],(3,1));indices=[[0],[1],[2]]
    if fault=="position_nan":positions[0,0]=np.nan
    if fault=="normal_nan":normals[0,0]=np.nan
    if fault=="uv_nan":uv[0,0]=np.nan
    if fault=="zero_area":positions[2]=[2,0,0]
    if fault=="negative_weight":weights[0]=[1.2,-.2,0,0]
    if fault=="bad_index":indices[2]=[90]
    attributes={"POSITION":access(positions),"NORMAL":access(normals),
                "TEXCOORD_0":access(uv,kind="VEC2"),
                "JOINTS_0":access(np.zeros((3,4)),5123,"VEC4"),
                "WEIGHTS_0":access(weights,kind="VEC4")}
    primitive={"attributes":attributes,"indices":access(indices,5123,"SCALAR"),"material":0}
    doc["meshes"]=[{"name":"fixture_geometry","primitives":[primitive]}]
    ibm=access(np.tile(np.eye(4).reshape(1,16),(20,1)),kind="MAT4")
    doc["nodes"]=[{"name":"GuardRig20","children":[1,21,22,23]}]
    doc["nodes"] += [{"name":name} for name in JOINTS]
    doc["nodes"][1]["children"]=list(range(2,21))
    bounds={"sphere_center_y_up_m":[0,0,0],"sphere_radius_m":2}
    for name in ["GuardBody_LOD0","KingdomSteelSword_LOD0","KingdomSunShield_LOD0"]:
        doc["nodes"].append({"name":name,"mesh":0,"skin":0,
                             "extras":{"rtsConservativeBounds":bounds}})
    doc["skins"]=[{"joints":list(range(1,21)),"inverseBindMatrices":ibm}]
    doc["scene"]=0
    doc["scenes"]=[{"nodes":[0],"extras":{"rtsMotion":CONTRACT["runtime_extras"]}}]
    if fault=="missing_extras":doc["scenes"][0].pop("extras")
    doc["animations"]=[]
    for name,duration in DURATIONS.items():
        if name=="Attack" and attack_duration is not None:duration=attack_duration
        times=[[0],[duration]]
        values=[[0,0,0],[0,.1+motion_delta,0]]
        if fault=="animation_nan" and name=="Walk":values[1][0]=float("nan")
        sampler={"input":access(times,kind="SCALAR"),"output":access(values),"interpolation":"LINEAR"}
        doc["animations"].append({"name":name,"samplers":[sampler],
                                   "channels":[{"sampler":0,"target":{"node":1,"path":"translation"}}]})
    png=base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=")
    doc["images"]=[{"bufferView":view(png),"mimeType":"image/png"}]
    doc["textures"]=[{"source":0}]
    doc["materials"]=[{"name":"OriginalFixtureSurface",
                       "pbrMetallicRoughness":{"baseColorTexture":{"index":0}}}]
    doc["buffers"]=[{"byteLength":len(binary)}]
    if fault=="accessor_overrun":doc["accessors"][0]["count"]=100000
    encoded=json.dumps(doc,separators=(",",":"),allow_nan=False).encode()
    encoded += b" "*((-len(encoded))%4)
    blob=struct.pack("<4sII",b"glTF",2,28+len(encoded)+len(binary))
    blob += struct.pack("<II",len(encoded),0x4E4F534A)+encoded
    blob += struct.pack("<II",len(binary),0x004E4942)+binary
    path.write_bytes(blob)
    return path


class RuntimeStructureTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(qa,"The independent runtime GLB QA module is not implemented")
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder=Path(self.temp.name)

    def test_valid_pair_has_hashes_but_never_grants_art_or_publish_approval(self):
        one=fixture(self.folder/"one.glb");two=fixture(self.folder/"two.glb")
        report=qa.audit_pair(one,two,CONTRACT)
        self.assertTrue(report["passed"],report)
        self.assertEqual(report["status"],"pass")
        self.assertFalse(report["runtime_publish_allowed"])
        self.assertIsInstance(report["lods"],list)
        rows={r["lod"]:r for r in report["lods"]}
        self.assertEqual(set(rows),{"lod0","lod1"})
        self.assertEqual(len(rows["lod0"]["sha256"]),64)
        self.assertTrue(rows["lod0"]["all_skinned_meshes_have_bounds"])
        self.assertTrue(report["pair"]["motion_matches"])

    def test_malformed_and_nonfinite_payloads_are_rejected_from_actual_bytes(self):
        faults=["position_nan","normal_nan","uv_nan","animation_nan",
                "negative_weight","bad_index","missing_extras","accessor_overrun"]
        for fault in faults:
            with self.subTest(fault=fault):
                path=fixture(self.folder/(fault+".glb"),fault=fault)
                row,_=qa.inspect_guard(path,CONTRACT,"lod0")
                self.assertFalse(row["passed"],fault)
                self.assertTrue(row["errors"],fault)
        path=self.folder/"truncated.glb";path.write_bytes(b"glTF")
        row,_=qa.inspect_guard(path,CONTRACT,"lod0")
        self.assertFalse(row["passed"])
        self.assertTrue(row["sha256"])

    def test_zero_area_triangle_is_counted_and_rejected(self):
        row,_=qa.inspect_guard(fixture(self.folder/"flat.glb","zero_area"),CONTRACT,"lod0")
        self.assertFalse(row["passed"])
        self.assertGreater(row["zero_area_triangles"],0)

    def test_sampler_duration_and_lod_motion_mismatch_are_distinct_failures(self):
        one=fixture(self.folder/"one.glb")
        wrong_duration=fixture(self.folder/"duration.glb",attack_duration=.7)
        row,_=qa.inspect_guard(wrong_duration,CONTRACT,"lod1")
        self.assertFalse(row["passed"])
        self.assertAlmostEqual(row["clips"]["Attack"]["duration_seconds"],.7,places=6)
        changed=fixture(self.folder/"changed.glb",motion_delta=.2)
        report=qa.audit_pair(one,changed,CONTRACT)
        self.assertTrue(next(r for r in report["lods"] if r["lod"]=="lod1")["passed"])
        self.assertFalse(report["passed"])
        self.assertEqual(report["status"],"fail")
        self.assertFalse(report["pair"]["motion_matches"])


if __name__=="__main__":
    unittest.main()
