"""TDD coverage for conservative original guard GLB core merge."""
import importlib.util
import json
import math
from pathlib import Path
import struct
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("merge", HERE / "original_guard_assembly_merge.py")
MERGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MERGE)


def fixture(path, *, bad_matrix=False, bad_skin=False, animated_mesh=False, with_hands=False, with_authored_parts=False, with_unknown=False):
    blob = bytearray()
    views, accessors, meshes, nodes = [], [], [], []
    material_names = ["steel", "leather", "cloth", "brass", "sword", "shield"]
    mats = [{"name": n} for n in material_names]
    def view(data, target):
        while len(blob) % 4: blob.append(0)
        off = len(blob); blob.extend(data)
        views.append({"buffer": 0, "byteOffset": off, "byteLength": len(data), "target": target})
        return len(views)-1
    def accessor(values, ctype, typ, target, minimum=None, maximum=None):
        fmt = {5126:"f",5121:"B",5123:"H"}[ctype]
        width = {"SCALAR":1,"VEC2":2,"VEC3":3,"VEC4":4,"MAT4":16}[typ]
        raw = struct.pack("<" + fmt*len(values), *values)
        vi = view(raw, target)
        a = {"bufferView":vi,"componentType":ctype,"count":len(values)//width,"type":typ}
        if minimum is not None: a["min"] = minimum
        if maximum is not None: a["max"] = maximum
        accessors.append(a)
        return len(accessors)-1
    def primitive(material, base):
        # Two vertices and one repeated-index triangle keep the binary fixture tiny.
        pos = [base,0,0, base+1,1,0]
        attrs = {
          "POSITION":accessor(pos,5126,"VEC3",34962),
          "NORMAL":accessor([0,0,1,0,0,1],5126,"VEC3",34962),
          "TEXCOORD_0":accessor([0,0,1,1],5126,"VEC2",34962),
          "JOINTS_0":accessor([0,0,0,0]*2,5121,"VEC4",34962),
          "WEIGHTS_0":accessor([1,0,0,0]*2,5126,"VEC4",34962),
        }
        ix = accessor([0,1,1],5123,"SCALAR",34963, [0], [1])
        return {"attributes":attrs,"indices":ix,"material":material,"mode":4}
    names = ["GuardArms_LOD0","GuardBody_LOD0","HelmetAssembly_LOD0","Tabard_OriginalGuardFrontTabard_LOD0","KingdomSteelSword_LOD0","KingdomSunShield_LOD0"]
    mats_by_node = [[0,3],[1,0],[0,3],[2],[4],[5]]
    if with_hands:
        names.extend(["GuardHandGrip_R_LOD0","GuardHandGrip_L_LOD0"])
        mats_by_node.extend([[1],[1]])
    if with_authored_parts:
        names.extend([
            "GuardPaddedLegLayer_LOD0",
            "GuardLegArmor_thigh_R_LOD0","GuardLegArmor_thigh_L_LOD0",
            "GuardLegArmor_shin_R_LOD0","GuardLegArmor_shin_L_LOD0",
            "GuardLegArmor_kneecap_R_LOD0","GuardLegArmor_kneecap_L_LOD0",
            "GuardBoot_R_LOD0","GuardBoot_L_LOD0",
        ])
        mats_by_node.extend([[1],[0],[0],[0],[0],[0],[0],[1],[1]])
    if with_unknown:
        names.append("GuardLegArmor_boot_R_LOD0")
        mats_by_node.append([0])
    for i, (name, group) in enumerate(zip(names,mats_by_node)):
        prims = [primitive(mat,i*2+j) for j,mat in enumerate(group)]
        meshes.append({"name":name,"primitives":prims})
        node={"name":name,"mesh":i,"skin":(1 if bad_skin and name.startswith("Tabard") else 0),
              "extras":{"rtsConservativeBounds":{"center":[float(i),0,0],"radius":1.0,
                        "sampled_clip_frames":{"Idle":2},"margin_m":0.02}}}
        if bad_matrix and name.startswith("Helmet"): node["translation"]=[0.001,0,0]
        nodes.append(node)
    nodes.insert(0, {"name":"GuardRig20","children":list(range(2,8))})
    # Correct child list after shifting mesh nodes by one.
    for node in nodes[1:]:
        if "mesh" in node: node["parentHint"]="GuardRig20"; node.pop("parentHint")
    # rig children are mesh nodes at indexes 1..6, not the dummy root index.
    nodes[0]["children"]=list(range(1,len(nodes)+1))
    skin={"joints":[0],"inverseBindMatrices":accessor([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],5126,"MAT4",None)}
    # skin IBM accessor target must be omitted; rewrite its view target away.
    views[skin["inverseBindMatrices"] and accessors[skin["inverseBindMatrices"]]["bufferView"]].pop("target",None)
    animations=[]
    if animated_mesh:
        times=accessor([0,1],5126,"SCALAR",None,[0],[1])
        vals=accessor([0,0,0,1,0,0],5126,"VEC3",None)
        animations=[{"samplers":[{"input":times,"output":vals}],"channels":[{"sampler":0,"target":{"node":1,"path":"translation"}}]}]
    root={"asset":{"version":"2.0"},"scene":0,"scenes":[{"nodes":[0]}],"nodes":nodes,
          "meshes":meshes,"materials":mats,"skins":[skin],"animations":animations,
          "buffers":[{"byteLength":len(blob)}],"bufferViews":views,"accessors":accessors}
    raw=json.dumps(root,separators=(",",":")).encode()
    raw+=b" "*((4-len(raw)%4)%4)
    binary=bytes(blob)+b"\0"*((4-len(blob)%4)%4)
    total=12+8+len(raw)+8+len(binary)
    path.write_bytes(struct.pack("<4sII",b"glTF",2,total)+struct.pack("<I4s",len(raw),b"JSON")+raw+
                     struct.pack("<I4s",len(binary),b"BIN\0")+binary)


class MergeTests(unittest.TestCase):
    def run_fixture(self, **kwargs):
        tmp=tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        src=Path(tmp.name)/"in.glb"; dst=Path(tmp.name)/"out.glb"
        fixture(src, **kwargs)
        return src,dst

    def test_merges_core_by_exact_material_and_preserves_equipment(self):
        src,dst=self.run_fixture()
        source, source_bin=MERGE.read_glb(src)
        result=MERGE.merge_core_glb(src,dst,0)
        gltf, merged_bin=MERGE.read_glb(dst)
        self.assertEqual(result["draws_before"], 9)
        self.assertEqual(result["draws_after"], 6)
        names={n["name"]: n for n in gltf["nodes"] if "mesh" in n}
        self.assertEqual(set(names), {"GuardBody_LOD0","KingdomSteelSword_LOD0","KingdomSunShield_LOD0"})
        for equipment_name in ("KingdomSteelSword_LOD0","KingdomSunShield_LOD0"):
            before=next(n for n in source["nodes"] if n["name"]==equipment_name)
            after=names[equipment_name]
            self.assertEqual(after, before)
        self.assertEqual(gltf["materials"], source["materials"])
        self.assertEqual(gltf["meshes"][:len(source["meshes"])], source["meshes"])
        self.assertEqual(gltf["skins"], source["skins"])
        self.assertEqual(gltf["animations"], source["animations"])
        before_attrs={}
        before_triangles={}
        core_names={"GuardBody_LOD0","GuardArms_LOD0","HelmetAssembly_LOD0","Tabard_OriginalGuardFrontTabard_LOD0"}
        for node in source["nodes"]:
            if node.get("name") not in core_names: continue
            mesh=source["meshes"][node["mesh"]]
            for prim in mesh["primitives"]:
                mat=prim["material"]
                before_triangles[mat]=before_triangles.get(mat,0)+source["accessors"][prim["indices"]]["count"]//3
                attrs=before_attrs.setdefault(mat,{})
                for semantic,index in prim["attributes"].items():
                    attrs.setdefault(semantic,[]).extend(MERGE._decode_accessor(source,source_bin,index))
        body=names["GuardBody_LOD0"]
        merged_mesh=gltf["meshes"][body["mesh"]]
        after_attrs={}
        after_triangles={}
        for prim in merged_mesh["primitives"]:
            mat=prim["material"]
            after_triangles[mat]=gltf["accessors"][prim["indices"]]["count"]//3
            attrs={}
            for semantic,index in prim["attributes"].items():
                attrs[semantic]=list(MERGE._decode_accessor(gltf,merged_bin,index))
            after_attrs[mat]=attrs
            indices=MERGE._decode_accessor(gltf,merged_bin,prim["indices"])
            self.assertEqual(len(indices)%3,0)
            self.assertTrue(all(0<=idx<gltf["accessors"][prim["attributes"]["POSITION"]]["count"] for idx in indices))
        self.assertEqual(after_triangles,before_triangles)
        self.assertEqual(after_attrs,before_attrs)  # exact positions, normals, UVs, joints and weights
        self.assertEqual(set(after_attrs),set(before_attrs))  # material-index grouping stays exact
        b=result["bounds"]; c=b["center"]; r=b["radius"]
        for source_bound in b["union_sources"]:
            self.assertLessEqual(math.dist(c,source_bound["center"])+source_bound["radius"],r+1e-9)

    def test_includes_closed_grip_nodes_by_exact_leather_material(self):
        src,dst=self.run_fixture(with_hands=True)
        result=MERGE.merge_core_glb(src,dst,0)
        self.assertEqual(result["draws_before"],11)
        self.assertEqual(result["draws_after"],6)
        self.assertIn("GuardHandGrip_R_LOD0",result["merged_nodes"])
        self.assertIn("GuardHandGrip_L_LOD0",result["merged_nodes"])
        self.assertGreaterEqual(len(result["bounds"]["union_sources"]),6)

    def test_merges_only_exact_authored_hand_leg_and_boot_allowlist(self):
        src,dst=self.run_fixture(with_hands=True,with_authored_parts=True)
        result=MERGE.merge_core_glb(src,dst,0)
        self.assertEqual(result["draws_before"],20)
        self.assertEqual(result["draws_after"],6)
        for name in (
            "GuardHandGrip_R_LOD0","GuardHandGrip_L_LOD0","GuardPaddedLegLayer_LOD0",
            "GuardLegArmor_thigh_R_LOD0","GuardLegArmor_thigh_L_LOD0",
            "GuardLegArmor_shin_R_LOD0","GuardLegArmor_shin_L_LOD0",
            "GuardLegArmor_kneecap_R_LOD0","GuardLegArmor_kneecap_L_LOD0",
            "GuardBoot_R_LOD0","GuardBoot_L_LOD0",
        ):
            self.assertIn(name,result["merged_nodes"])

    def test_rejects_near_match_outside_authored_allowlist(self):
        src,dst=self.run_fixture(with_unknown=True)
        with self.assertRaisesRegex(MERGE.MergeRejected,"Unrecognized mesh"):
            MERGE.merge_core_glb(src,dst,0)

    def test_rejects_non_identity_core_transform(self):
        src,dst=self.run_fixture(bad_matrix=True)
        with self.assertRaises(MERGE.MergeRejected): MERGE.merge_core_glb(src,dst,0)

    def test_rejects_skin_mismatch(self):
        src,dst=self.run_fixture(bad_skin=True)
        with self.assertRaises(MERGE.MergeRejected): MERGE.merge_core_glb(src,dst,0)

    def test_rejects_animated_mesh_node(self):
        src,dst=self.run_fixture(animated_mesh=True)
        with self.assertRaises(MERGE.MergeRejected): MERGE.merge_core_glb(src,dst,0)


if __name__ == "__main__":
    unittest.main()
