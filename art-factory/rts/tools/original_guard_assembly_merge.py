"""Fail-closed, data-preserving GLB core draw merge for original guard LODs.

Only merges identity-transformed, same-parent, same-skin, non-animated core mesh
nodes by exact material index. Equipment mesh nodes stay individually named.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from pathlib import Path
import struct
import tempfile

GLB_MAGIC = b"glTF"
JSON_CHUNK = b"JSON"
BIN_CHUNK = b"BIN\0"
COMPONENTS = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2),
              5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
TYPE_WIDTH = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4,
              "MAT2": 4, "MAT3": 9, "MAT4": 16}


class MergeRejected(ValueError):
    """Input cannot be safely merged without changing runtime behavior."""


def _parse_glb(raw):
    if len(raw) < 20:
        raise MergeRejected("GLB is truncated")
    magic, version, total = struct.unpack_from("<4sII", raw, 0)
    if magic != GLB_MAGIC or version != 2 or total != len(raw):
        raise MergeRejected("Expected a well-formed GLB 2.0 file")
    cursor = 12
    root = binary = None
    while cursor < len(raw):
        if cursor + 8 > len(raw):
            raise MergeRejected("Truncated GLB chunk header")
        size, kind = struct.unpack_from("<I4s", raw, cursor)
        cursor += 8
        chunk = raw[cursor:cursor+size]
        if len(chunk) != size:
            raise MergeRejected("Truncated GLB chunk")
        cursor += size
        if kind == JSON_CHUNK:
            if root is not None:
                raise MergeRejected("Multiple JSON chunks")
            root = json.loads(chunk.decode("utf-8").rstrip(" \\t\\r\\n\\0"))
        elif kind == BIN_CHUNK:
            if binary is not None:
                raise MergeRejected("Multiple BIN chunks")
            binary = chunk
        else:
            raise MergeRejected(f"Unsupported GLB chunk {kind!r}")
    if root is None or binary is None:
        raise MergeRejected("Expected one JSON and one BIN chunk")
    buffers = root.get("buffers", [])
    if len(buffers) != 1 or "uri" in buffers[0]:
        raise MergeRejected("Expected one embedded GLB buffer")
    if buffers[0].get("byteLength", 0) > len(binary):
        raise MergeRejected("Buffer declaration exceeds BIN chunk")
    return root, binary


def read_glb(path):
    return _parse_glb(Path(path).read_bytes())


def write_glb(path, root, binary):
    binary = bytes(binary)
    while len(binary) % 4:
        binary += b"\0"
    root["buffers"][0]["byteLength"] = len(binary)
    raw_json = json.dumps(root, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    raw_json += b" " * ((4 - len(raw_json) % 4) % 4)
    total = 12 + 8 + len(raw_json) + 8 + len(binary)
    data = (struct.pack("<4sII", GLB_MAGIC, 2, total)
            + struct.pack("<I4s", len(raw_json), JSON_CHUNK) + raw_json
            + struct.pack("<I4s", len(binary), BIN_CHUNK) + binary)
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=path.name + ".", suffix=".tmp", delete=False) as stream:
        temp = Path(stream.name)
        stream.write(data)
    temp.replace(path)


def _accessor_bytes(root, binary, accessor_index):
    accessors = root.get("accessors", [])
    views = root.get("bufferViews", [])
    try:
        acc = accessors[accessor_index]
        view = views[acc["bufferView"]]
    except (IndexError, KeyError, TypeError):
        raise MergeRejected(f"Invalid accessor {accessor_index}") from None
    if acc.get("sparse") or acc.get("extensions") or view.get("extensions"):
        raise MergeRejected("Sparse or extension-backed accessors are unsupported")
    try:
        buffer = root["buffers"][view.get("buffer", 0)]
    except (IndexError, TypeError):
        raise MergeRejected("Accessor references an invalid buffer") from None
    if "uri" in buffer:
        raise MergeRejected("External buffers are unsupported")
    if view.get("buffer", 0) != 0:
        raise MergeRejected("Multiple buffers are unsupported")
    ctype = acc.get("componentType")
    typ = acc.get("type")
    if ctype not in COMPONENTS or typ not in TYPE_WIDTH:
        raise MergeRejected(f"Unsupported accessor shape/type: {ctype}/{typ}")
    fmt, scalar_size = COMPONENTS[ctype]
    element_size = scalar_size * TYPE_WIDTH[typ]
    stride = view.get("byteStride", element_size)
    if stride != element_size:
        raise MergeRejected("Interleaved accessors are unsupported")
    if acc.get("byteOffset", 0) % scalar_size or view.get("byteOffset", 0) % scalar_size:
        raise MergeRejected("Misaligned accessor data")
    count = acc.get("count", -1)
    start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    end = start + count * element_size
    if count < 0 or start < 0 or end > len(binary):
        raise MergeRejected("Accessor extends beyond BIN chunk")
    return bytes(binary[start:end]), acc, element_size, fmt, scalar_size


def _decode_accessor(root, binary, accessor_index):
    data, acc, _, fmt, _ = _accessor_bytes(root, binary, accessor_index)
    width = TYPE_WIDTH[acc["type"]]
    n = acc["count"] * width
    return struct.unpack("<" + fmt*n, data)


def _add_blob(root, binary, data, target=None):
    while len(binary) % 4:
        binary += b"\0"
    offset = len(binary)
    binary += data
    view = {"buffer": 0, "byteOffset": offset, "byteLength": len(data)}
    if target is not None:
        view["target"] = target
    root.setdefault("bufferViews", []).append(view)
    return len(root["bufferViews"])-1, binary


def _identity(node, name):
    def matches(actual, expected):
        return (isinstance(actual, list) and len(actual) == len(expected)
                and all(math.isfinite(float(a)) and abs(float(a)-b) <= 1e-8
                        for a, b in zip(actual, expected)))
    if "matrix" in node:
        expected = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]
        if not matches(node["matrix"], expected):
            raise MergeRejected(f"Non-identity matrix on core node {name}")
    if not matches(node.get("translation", [0,0,0]), [0,0,0]):
        raise MergeRejected(f"Non-identity translation on core node {name}")
    if not matches(node.get("rotation", [0,0,0,1]), [0,0,0,1]):
        raise MergeRejected(f"Non-identity rotation on core node {name}")
    if not matches(node.get("scale", [1,1,1]), [1,1,1]):
        raise MergeRejected(f"Non-identity scale on core node {name}")


def _optional_core_node(name, lod):
    """Exact authored-part allowlist; equipment and unknown parts stay separate/rejected."""
    suffix = f"_LOD{lod}"
    exact = {
        f"GuardHandGrip_R{suffix}", f"GuardHandGrip_L{suffix}",
        f"GuardPaddedLegLayer{suffix}",
        f"GuardBoot_R{suffix}", f"GuardBoot_L{suffix}",
    }
    if name in exact:
        return True
    return re.fullmatch(
        rf"GuardLegArmor_(?:thigh|shin|kneecap)_[RL]_LOD{lod}", name
    ) is not None


def _bounds_union(nodes):
    rows = []
    production_schema = False
    for node in nodes:
        bounds = node.get("extras", {}).get("rtsConservativeBounds")
        if not isinstance(bounds, dict):
            raise MergeRejected(f"Missing rtsConservativeBounds on {node.get('name')}")
        center_key = "sphere_center_y_up_m" if "sphere_center_y_up_m" in bounds else "center"
        radius_key = "sphere_radius_m" if "sphere_radius_m" in bounds else "radius"
        margin_key = "sampling_margin_m" if "sampling_margin_m" in bounds else "margin_m"
        production_schema = production_schema or center_key != "center" or radius_key != "radius"
        center = bounds.get(center_key)
        radius = bounds.get(radius_key)
        if not isinstance(center, list) or len(center) != 3 or not all(math.isfinite(float(v)) for v in center):
            raise MergeRejected(f"Invalid bounds center on {node.get('name')}")
        if not isinstance(radius, (int, float)) or not math.isfinite(radius) or radius < 0:
            raise MergeRejected(f"Invalid bounds radius on {node.get('name')}")
        rows.append((bounds, [float(v) for v in center], float(radius), node.get("name"), margin_key))
    lows = [min(c[i]-r for _,c,r,_,_ in rows) for i in range(3)]
    highs = [max(c[i]+r for _,c,r,_,_ in rows) for i in range(3)]
    center = [(lows[i]+highs[i])*0.5 for i in range(3)]
    radius = max(math.dist(center, c)+r for _,c,r,_,_ in rows)
    clips, margins, distances = {}, [], []
    for b, source_center, _, _, margin_key in rows:
        samples = b.get("sampled_clip_frames", {})
        if isinstance(samples, dict):
            for name, count in samples.items():
                clips[name] = max(int(count), clips.get(name, 0))
        if isinstance(b.get(margin_key), (int,float)):
            margins.append(float(b[margin_key]))
        if isinstance(b.get("max_sampled_vertex_distance_m"), (int,float)):
            distances.append((math.dist(center, source_center), float(b["max_sampled_vertex_distance_m"])))
    if production_schema:
        result = {"sphere_center_y_up_m": center, "sphere_radius_m": radius}
        if margins: result["sampling_margin_m"] = max(margins)
    else:
        result = {"center": center, "radius": radius}
        if margins: result["margin_m"] = max(margins)
    if clips: result["sampled_clip_frames"] = dict(sorted(clips.items()))
    if distances: result["max_sampled_vertex_distance_m"] = max(offset + distance for offset, distance in distances)
    result["union_sources"] = [
        {"node": name, "center": c, "radius": r} for _, c, r, name, _ in rows
    ]
    return result


def _primitive_checks(root, binary, mesh, node_name):
    if mesh.get("weights") or mesh.get("extras", {}).get("targetNames"):
        raise MergeRejected(f"Morph targets are unsupported on {node_name}")
    result = []
    for primitive in mesh.get("primitives", []):
        if primitive.get("mode", 4) != 4:
            raise MergeRejected(f"Non-triangle primitive on {node_name}")
        if primitive.get("targets") or primitive.get("extensions"):
            raise MergeRejected(f"Primitive targets/extensions unsupported on {node_name}")
        attrs = primitive.get("attributes", {})
        required = {"POSITION", "NORMAL", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0"}
        if set(attrs) != required:
            raise MergeRejected(f"Unexpected attribute set on {node_name}: {sorted(attrs)}")
        if "material" not in primitive or not (0 <= primitive["material"] < len(root.get("materials", []))):
            raise MergeRejected(f"Invalid material index on {node_name}")
        if "indices" not in primitive:
            raise MergeRejected(f"Indexed triangles required on {node_name}")
        # Ensure every attribute's count matches POSITION and each accessor is readable.
        pos = root["accessors"][attrs["POSITION"]]
        for semantic, index in attrs.items():
            data, acc, _, _, _ = _accessor_bytes(root, binary, index)
            if acc["count"] != pos["count"]:
                raise MergeRejected(f"Attribute count mismatch for {semantic} on {node_name}")
            if semantic in ("POSITION","NORMAL","WEIGHTS_0") and (acc["componentType"] != 5126 or acc["type"] != "VEC3" and semantic != "WEIGHTS_0" or semantic == "WEIGHTS_0" and acc["type"] != "VEC4"):
                raise MergeRejected(f"Unexpected {semantic} accessor type on {node_name}")
            if semantic == "TEXCOORD_0" and (acc["type"] != "VEC2" or acc["componentType"] not in (5121,5123,5126)):
                raise MergeRejected(f"Unexpected UV accessor type on {node_name}")
            if semantic == "JOINTS_0" and (acc["type"] != "VEC4" or acc["componentType"] not in (5121,5123)):
                raise MergeRejected(f"Unexpected joints accessor type on {node_name}")
        _, ia, _, _, _ = _accessor_bytes(root, binary, primitive["indices"])
        if ia["type"] != "SCALAR" or ia["componentType"] not in (5121,5123,5125):
            raise MergeRejected(f"Invalid index accessor on {node_name}")
        result.append(primitive)
    return result


def _make_merged_primitive(root, binary, material, contributions):
    semantics = ["POSITION", "NORMAL", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0"]
    signatures = {}
    buffers = {s: bytearray() for s in semantics}
    positions = []
    indices = []
    vertex_offset = 0
    triangles_before = 0
    for primitive, node_name in contributions:
        attrs = primitive["attributes"]
        position_acc = root["accessors"][attrs["POSITION"]]
        vertex_count = position_acc["count"]
        decoded_indices = _decode_accessor(root, binary, primitive["indices"])
        if len(decoded_indices) % 3 or any(i < 0 or i >= vertex_count for i in decoded_indices):
            raise MergeRejected(f"Invalid triangle indices on {node_name}")
        triangles_before += len(decoded_indices)//3
        for semantic in semantics:
            raw, acc, element_size, _, _ = _accessor_bytes(root, binary, attrs[semantic])
            signature = (acc["componentType"], acc["type"], bool(acc.get("normalized", False)))
            if semantic in signatures and signatures[semantic] != signature:
                raise MergeRejected(f"Incompatible {semantic} accessor encodings for material {material}")
            signatures[semantic] = signature
            buffers[semantic].extend(raw)
            if semantic == "POSITION":
                positions.extend(_decode_accessor(root, binary, attrs[semantic]))
        indices.extend(int(i)+vertex_offset for i in decoded_indices)
        vertex_offset += vertex_count
    merged_attrs = {}
    for semantic in semantics:
        first_primitive = contributions[0][0]
        source_acc = root["accessors"][first_primitive["attributes"][semantic]]
        target = 34962
        view_index, binary = _add_blob(root, binary, buffers[semantic], target)
        new_acc = dict(source_acc)
        new_acc.pop("sparse", None)
        new_acc["bufferView"] = view_index
        new_acc.pop("byteOffset", None)
        new_acc["count"] = vertex_offset
        if semantic == "POSITION":
            xyz = list(zip(positions[0::3], positions[1::3], positions[2::3]))
            new_acc["min"] = [min(v[i] for v in xyz) for i in range(3)]
            new_acc["max"] = [max(v[i] for v in xyz) for i in range(3)]
        acc_index = len(root["accessors"])
        root["accessors"].append(new_acc)
        merged_attrs[semantic] = acc_index
    max_index = max(indices, default=0)
    index_type, index_fmt = (5123, "H") if max_index <= 65535 else (5125, "I")
    if vertex_offset <= 255 and max_index <= 255:
        index_type, index_fmt = 5121, "B"
    index_data = struct.pack("<" + index_fmt*len(indices), *indices)
    index_view, binary = _add_blob(root, binary, index_data, 34963)
    index_acc = {"bufferView": index_view, "componentType": index_type, "count": len(indices),
                 "type": "SCALAR", "min": [min(indices)] if indices else [0],
                 "max": [max(indices)] if indices else [0]}
    index_accessor = len(root["accessors"])
    root["accessors"].append(index_acc)
    return {"attributes": merged_attrs, "indices": index_accessor, "material": material, "mode": 4}, binary, triangles_before


def merge_core_glb(source_path, output_path, lod, snapshot_source=None):
    if lod not in (0,1):
        raise MergeRejected("LOD must be 0 or 1")
    source_bytes = Path(source_path).read_bytes()
    source_sha256 = hashlib.sha256(source_bytes).hexdigest()
    if snapshot_source is not None:
        snapshot = Path(snapshot_source)
        snapshot.parent.mkdir(parents=True, exist_ok=True)
        snapshot.write_bytes(source_bytes)
    root,binary = _parse_glb(source_bytes)
    names = {node.get("name"): i for i,node in enumerate(root.get("nodes", []))}
    suffix=f"_LOD{lod}"
    required=[f"GuardBody{suffix}",f"GuardArms{suffix}",f"HelmetAssembly{suffix}",
              f"Tabard_OriginalGuardFrontTabard{suffix}"]
    for name in required:
        if name not in names: raise MergeRejected(f"Required core node missing: {name}")
    if "GuardRig20" not in names: raise MergeRejected("GuardRig20 node missing")
    mesh_node_indices=[i for i,n in enumerate(root["nodes"]) if "mesh" in n]
    core_indices=[i for i in mesh_node_indices if root["nodes"][i].get("name") in required
                  or _optional_core_node(root["nodes"][i].get("name",""),lod)]
    equipment={f"KingdomSteelSword{suffix}",f"KingdomSunShield{suffix}"}
    unexpected=[root["nodes"][i].get("name") for i in mesh_node_indices
                if i not in core_indices and root["nodes"][i].get("name") not in equipment]
    if unexpected: raise MergeRejected(f"Unrecognized mesh nodes would be omitted from grouping: {unexpected}")
    if len(core_indices)<4: raise MergeRejected("Too few core nodes")
    parent={}
    for i,node in enumerate(root["nodes"]):
        for child in node.get("children",[]): parent[child]=i
    rig_i=names["GuardRig20"]
    expected_parent=parent.get(core_indices[0])
    if expected_parent != rig_i: raise MergeRejected("Core mesh nodes are not direct GuardRig20 children")
    skin_index=None
    for i in core_indices:
        node=root["nodes"][i]; name=node.get("name",str(i))
        _identity(node,name)
        if parent.get(i)!=expected_parent: raise MergeRejected(f"Parent mismatch on {name}")
        if "skin" not in node: raise MergeRejected(f"Missing skin on {name}")
        if skin_index is None: skin_index=node["skin"]
        if node["skin"]!=skin_index: raise MergeRejected(f"Skin mismatch on {name}")
        if not 0<=skin_index<len(root.get("skins",[])): raise MergeRejected("Invalid skin index")
        if "mesh" not in node or not 0<=node["mesh"]<len(root.get("meshes",[])): raise MergeRejected(f"Invalid mesh on {name}")
    for animation in root.get("animations",[]):
        for channel in animation.get("channels",[]):
            if channel.get("target",{}).get("node") in core_indices:
                raise MergeRejected("Animation directly targets a core mesh node")
    if root["skins"][skin_index].get("skeleton") is not None:
        if root["skins"][skin_index]["skeleton"] != rig_i: raise MergeRejected("Skin skeleton does not match GuardRig20")
    contributions={}
    before_draws=0; triangle_by_material={}
    for node_i in core_indices:
        node=root["nodes"][node_i]; mesh=root["meshes"][node["mesh"]]
        for prim in _primitive_checks(root,binary,mesh,node["name"]):
            before_draws+=1
            mat=prim["material"]
            contributions.setdefault(mat,[]).append((prim,node["name"]))
            _,_,_,_,_=_accessor_bytes(root,binary,prim["indices"])
            triangle_by_material[mat]=triangle_by_material.get(mat,0)+root["accessors"][prim["indices"]]["count"]//3
    merged_primitives=[]; after_triangles={}
    for mat in sorted(contributions):
        merged,binary,tris=_make_merged_primitive(root,binary,mat,contributions[mat])
        merged_primitives.append(merged); after_triangles[mat]=tris
    if after_triangles!=triangle_by_material: raise MergeRejected("Per-material triangle totals changed")
    bounds=_bounds_union([root["nodes"][i] for i in core_indices])
    anchor_i=names[f"GuardBody{suffix}"]
    anchor=root["nodes"][anchor_i]
    extras=anchor.setdefault("extras",{})
    extras["rtsConservativeBounds"]=bounds
    mesh_index=len(root["meshes"])
    root["meshes"].append({"name":f"GuardCoreMerged{suffix}","primitives":merged_primitives})
    anchor["mesh"]=mesh_index
    for i in core_indices:
        if i!=anchor_i:
            root["nodes"][i].pop("mesh",None)
    after_draws=len(merged_primitives)
    # Equipment remain distinct; report total model draws, while enforcing exact 2 equipment roots.
    for name in equipment:
        if name not in names or "mesh" not in root["nodes"][names[name]]:
            raise MergeRejected(f"Equipment diagnostic node missing: {name}")
    equipment_draws=sum(len(root["meshes"][root["nodes"][names[n]]["mesh"]].get("primitives",[])) for n in equipment)
    result={"lod":lod,"draws_before":before_draws+equipment_draws,
            "draws_after":after_draws+equipment_draws,"core_draws_before":before_draws,
            "core_draws_after":after_draws,
            "material_triangle_counts_before":{
                root["materials"][m].get("name",str(m)):count for m,count in sorted(triangle_by_material.items())},
            "material_triangle_counts":{
                root["materials"][m].get("name",str(m)):count for m,count in sorted(after_triangles.items())},
            "bounds":bounds,"merged_nodes":[root["nodes"][i]["name"] for i in core_indices],
            "equipment_nodes":sorted(equipment)}
    write_glb(output_path,root,binary)
    result["source_glb_sha256"] = source_sha256
    result["merged_glb_sha256"] = hashlib.sha256(Path(output_path).read_bytes()).hexdigest()
    if snapshot_source is not None:
        result["snapshot_source"] = str(Path(snapshot_source))
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input",type=Path,required=True)
    parser.add_argument("--output",type=Path,required=True)
    parser.add_argument("--lod",type=int,choices=(0,1),required=True)
    parser.add_argument("--snapshot-source",type=Path,help="Write the exact input bytes used for this merge")
    args=parser.parse_args()
    result=merge_core_glb(args.input,args.output,args.lod,args.snapshot_source)
    print(json.dumps(result,indent=2))


if __name__=="__main__":
    main()
