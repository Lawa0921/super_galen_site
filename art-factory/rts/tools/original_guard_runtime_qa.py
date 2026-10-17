"""Independent GLB byte audit. Structural success never grants art/publish approval."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import struct

import numpy as np

from knight_optimization_qa import accessor, COMPONENTS, DTYPES

ROOT = Path(__file__).resolve().parents[3]
TOLERANCE = 1e-4
CORE_JOINTS = {
    "Root","Pelvis","SpineLower","SpineUpper","Neck","Head",
    "Shoulder_L","UpperArm_L","Forearm_L","Hand_L",
    "Shoulder_R","UpperArm_R","Forearm_R","Hand_R",
    "Thigh_L","Shin_L","Foot_L","Thigh_R","Shin_R","Foot_R",
}
BUDGETS = {"lod0":25000,"lod1":12000}


class InvalidAsset(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise InvalidAsset(message)


def finite_json(value):
    if isinstance(value, float):
        require(math.isfinite(value), "Non-finite number in GLB JSON")
    elif isinstance(value, dict):
        for child in value.values():
            finite_json(child)
    elif isinstance(value, list):
        for child in value:
            finite_json(child)


def close_tree(actual, expected):
    if isinstance(actual, dict) and isinstance(expected, dict):
        return actual.keys()==expected.keys() and all(close_tree(actual[k],expected[k]) for k in actual)
    if isinstance(actual, list) and isinstance(expected, list):
        return len(actual)==len(expected) and all(close_tree(a,b) for a,b in zip(actual,expected))
    if isinstance(actual,(int,float)) and isinstance(expected,(int,float)):
        return math.isfinite(actual) and math.isfinite(expected) and abs(actual-expected)<=TOLERANCE
    return actual==expected


class Snapshot:
    """Hash and inspect the same immutable byte snapshot, even during a WIP export."""
    def __init__(self, raw):
        require(len(raw)>=28, "Truncated GLB header")
        magic,version,total=struct.unpack_from("<4sII",raw)
        require(magic==b"glTF" and version==2 and total==len(raw), "Invalid GLB header/version/length")
        length,kind=struct.unpack_from("<II",raw,12)
        require(kind==0x4E4F534A and length%4==0 and 20+length+8<=len(raw), "Invalid GLB JSON chunk")
        self.doc=json.loads(raw[20:20+length])
        finite_json(self.doc)
        start=20+length
        bin_length,bin_kind=struct.unpack_from("<II",raw,start)
        require(bin_kind==0x004E4942 and start+8+bin_length<=len(raw), "Invalid GLB BIN chunk")
        self.binary=raw[start+8:start+8+bin_length]
        self.cache={}
        buffers=self.doc.get("buffers",[])
        require(len(buffers)==1 and not buffers[0].get("uri"), "Expected one embedded binary buffer")
        require(0<=buffers[0]["byteLength"]<=len(self.binary), "Declared binary buffer exceeds GLB bytes")

    @staticmethod
    def item(items, index, label):
        require(type(index) is int and 0<=index<len(items), f"Invalid {label} index {index!r}")
        return items[index]

    def view(self, number):
        view=self.item(self.doc.get("bufferViews",[]),number,"bufferView")
        offset=view.get("byteOffset",0);length=view["byteLength"]
        require(view.get("buffer",0)==0 and type(offset) is int and type(length) is int
                and offset>=0 and length>=0 and offset+length<=len(self.binary), "Buffer view exceeds GLB binary")
        return view

    def array(self, number):
        if number in self.cache:
            return self.cache[number]
        entry=self.item(self.doc.get("accessors",[]),number,"accessor")
        require(not entry.get("sparse"), "Sparse accessor is unsupported by this audit")
        require(entry.get("componentType") in DTYPES and entry.get("type") in COMPONENTS,
                "Unsupported accessor component/type")
        view=self.view(entry["bufferView"])
        count=entry["count"];offset=entry.get("byteOffset",0)
        dtype=np.dtype(DTYPES[entry["componentType"]])
        size=dtype.itemsize*COMPONENTS[entry["type"]]
        stride=view.get("byteStride",size)
        require(type(count) is int and count>0 and type(offset) is int and offset>=0
                and type(stride) is int and stride>=size, "Invalid accessor count/offset/stride")
        require(offset+(count-1)*stride+size<=view["byteLength"], "Accessor exceeds declared buffer view")
        require(not entry.get("normalized") or np.issubdtype(dtype,np.integer),
                "Floating accessor cannot be normalized")
        self.cache[number]=accessor(self.doc,self.binary,number)
        return self.cache[number]


def inspect_guard(path, contract, label):
    path=Path(path)
    row={"lod":label,"path":str(path.resolve()),"sha256":None,"bytes":None,"passed":False,
         "errors":[],"warnings":[],"triangles":0,"zero_area_triangles":0,"primitive_draw_count":0,
         "runtime_publish_allowed":False}
    state={}
    def error(code,message):
        row["errors"].append({"code":code,"message":str(message)})
    def check(condition,code,message):
        if not condition:
            error(code,message)
        return bool(condition)
    try:
        raw=path.read_bytes()
        row.update(sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw))
        snap=Snapshot(raw);doc=snap.doc
        nodes=doc.get("nodes",[]);meshes=doc.get("meshes",[]);skins=doc.get("skins",[])
        scene=Snapshot.item(doc.get("scenes",[]),doc.get("scene",0),"scene")
        extras=scene.get("extras",{}).get("rtsMotion")
        row["rtsMotion"]=extras
        check(extras is not None and close_tree(extras,contract["runtime_extras"]),
              "runtime_extras","Active scene extras.rtsMotion is absent or differs from assembly contract")
        active=set()
        def visit(number,ancestors):
            require(number not in ancestors,"Cycle in active scene node hierarchy")
            if number in active:
                return
            node=Snapshot.item(nodes,number,"node");active.add(number)
            for child in node.get("children",[]):
                visit(child,ancestors|{number})
        for root in scene.get("nodes",[]):
            visit(root,set())
        active_meshes=[i for i in sorted(active) if "mesh" in nodes[i]]
        require(active_meshes,"Active scene has no meshes")
        row["active_mesh_node_count"]=len(active_meshes)
        row["all_position_normal_uv_finite"]=True
        row["all_vertex_weights_valid"]=True
        joint_names=[]
        for skin_index,skin in enumerate(skins):
            names=[Snapshot.item(nodes,j,"joint") .get("name","") for j in skin.get("joints",[])]
            require(names and len(set(names))==len(names),f"Empty/ambiguous skin joints: {skin_index}")
            joint_names.append(names)
            if "inverseBindMatrices" in skin:
                matrices=snap.array(skin["inverseBindMatrices"])
                check(len(matrices)==len(names) and matrices.shape[1]==16 and np.isfinite(matrices).all(),
                      "inverse_bind",f"Invalid inverse bind matrices in skin {skin_index}")
        row["skin_joint_names"]=joint_names
        available={name for names in joint_names for name in names}
        row["missing_core_joints"]=sorted(CORE_JOINTS-available)
        check(not row["missing_core_joints"],"core_joints",row["missing_core_joints"])
        row["guard_rig_node_present"]=any(n.get("name")=="GuardRig20" for n in nodes)
        names=[nodes[i].get("name","") for i in active_meshes]
        row["has_sword"]=any("sword" in name.lower() for name in names)
        row["has_shield"]=any("shield" in name.lower() for name in names)
        check(row["has_sword"] and row["has_shield"],"equipment","Active scene must contain Sword and Shield mesh nodes")
        bounds_rows=[]
        for node_index in active_meshes:
            node=nodes[node_index];name=node.get("name",f"node_{node_index}")
            mesh=Snapshot.item(meshes,node["mesh"],"mesh")
            try:
                skin=Snapshot.item(skins,node.get("skin"),"skin")
                bounds=node.get("extras",{}).get("rtsConservativeBounds")
                valid_bounds=(isinstance(bounds,dict) and
                    isinstance(bounds.get("sphere_center_y_up_m"),list) and
                    len(bounds["sphere_center_y_up_m"])==3 and
                    all(isinstance(v,(int,float)) and math.isfinite(v) for v in bounds["sphere_center_y_up_m"]) and
                    isinstance(bounds.get("sphere_radius_m"),(int,float)) and
                    math.isfinite(bounds["sphere_radius_m"]) and bounds["sphere_radius_m"]>0)
                bounds_rows.append({"node":name,"node_extras_present":bounds is not None,
                                    "shape_valid":bool(valid_bounds),
                                    "mesh_definition_only":bool(mesh.get("extras",{}).get("rtsConservativeBounds"))})
                if bounds is not None:
                    check(valid_bounds,"skin_bounds",f"Malformed rtsConservativeBounds: {name}")
                for primitive_index,primitive in enumerate(mesh.get("primitives",[])):
                    row["primitive_draw_count"]+=1
                    attributes=primitive.get("attributes",{})
                    require({"POSITION","NORMAL","TEXCOORD_0","JOINTS_0","WEIGHTS_0"}<=attributes.keys(),
                            f"Missing position/normal/UV/skin attributes: {name}")
                    require(primitive.get("mode",4)==4,"Non-triangle primitive")
                    arrays={key:snap.array(number) for key,number in attributes.items()
                            if key in {"POSITION","NORMAL"} or key.startswith(("TEXCOORD_","JOINTS_","WEIGHTS_"))}
                    count=len(arrays["POSITION"])
                    require(arrays["POSITION"].shape[1]==3 and arrays["NORMAL"].shape==(count,3),
                            f"Position/normal shape mismatch: {name}")
                    for key,values in arrays.items():
                        require(len(values)==count,f"Attribute vertex count mismatch: {name} {key}")
                        if key in {"POSITION","NORMAL"} or key.startswith("TEXCOORD_"):
                            good=np.isfinite(values).all()
                            row["all_position_normal_uv_finite"] &= check(good,"nonfinite_attribute",f"{name}: {key}")
                    total_weight=np.zeros(count)
                    weight_valid=True
                    for key in sorted(k for k in arrays if k.startswith("WEIGHTS_")):
                        suffix=key.split("_",1)[1];joint_key="JOINTS_"+suffix
                        require(joint_key in arrays,f"Missing {joint_key}: {name}")
                        weights=arrays[key];joints=arrays[joint_key]
                        require(weights.shape==(count,4) and joints.shape==(count,4),"Invalid joint/weight shape")
                        weight_valid &= bool(np.isfinite(weights).all() and (weights>=0).all() and
                                             np.isfinite(joints).all() and (joints>=0).all() and
                                             (joints==np.floor(joints)).all() and (joints<len(skin["joints"])).all())
                        total_weight+=weights.sum(axis=1)
                    weight_valid &= bool(np.isfinite(total_weight).all() and np.max(np.abs(total_weight-1))<=TOLERANCE)
                    row["all_vertex_weights_valid"] &= check(weight_valid,"weights",f"Invalid/negative/unnormalized weights or joints: {name}")
                    indices=snap.array(primitive["indices"])
                    require(indices.shape[1]==1 and indices.size%3==0,"Invalid triangle index count")
                    require(np.isfinite(indices).all() and (indices>=0).all() and
                            (indices==np.floor(indices)).all() and (indices<count).all(),f"Triangle index out of bounds: {name}")
                    triangles=indices.reshape(-1,3).astype(np.int64);row["triangles"]+=len(triangles)
                    if np.isfinite(arrays["POSITION"]).all():
                        points=arrays["POSITION"][triangles].astype(np.float64)
                        double_area=np.linalg.norm(np.cross(points[:,1]-points[:,0],points[:,2]-points[:,0]),axis=1)
                        flat=int(np.count_nonzero(double_area<=1e-12))
                        row["zero_area_triangles"]+=flat
                        check(flat==0,"zero_area",f"{name} primitive {primitive_index}: {flat} zero-area triangles")
            except (InvalidAsset,KeyError,ValueError,IndexError,TypeError) as exc:
                error("mesh_structure",f"{name}: {exc}")
        row["conservative_skin_bounds"]=bounds_rows
        row["all_skinned_meshes_have_bounds"]=bool(bounds_rows) and all(b["shape_valid"] for b in bounds_rows)
        if not row["all_skinned_meshes_have_bounds"]:
            row["warnings"].append("Conservative skinned bounds missing on one or more active mesh nodes; animation-envelope coverage is not proved by this audit.")
        materials=doc.get("materials",[])
        row["all_materials_pbr"]=bool(materials) and all("pbrMetallicRoughness" in m for m in materials)
        row["untextured_base_color_materials"]=[m.get("name",str(i)) for i,m in enumerate(materials)
            if "baseColorTexture" not in m.get("pbrMetallicRoughness",{})]
        images=doc.get("images",[])
        row["texture_image_count"]=len(images)
        embedded=[]
        for image in images:
            if "bufferView" in image:
                snap.view(image["bufferView"]);embedded.append(True)
            else:
                embedded.append(str(image.get("uri","")).startswith("data:"))
        row["all_textures_embedded"]=bool(images) and all(embedded)
        if not row["all_materials_pbr"] or not row["all_textures_embedded"]:
            row["warnings"].append("PBR material or embedded-image availability requires packaging/visual review.")
        animations=doc.get("animations",[]);clip_names=[a.get("name","") for a in animations]
        check(len(clip_names)==len(set(clip_names)) and set(clip_names)==set(contract["clips"]),
              "clip_set",f"Expected five contract clips; found {clip_names}")
        row["clips"]={};tracks={}
        for animation in animations:
            clip=animation.get("name","");samples=[];starts=[];ends=[]
            for sampler_index,sampler in enumerate(animation.get("samplers",[])):
                times=snap.array(sampler["input"]);values=snap.array(sampler["output"])
                require(times.shape[1]==1,"Animation sampler times must be scalar")
                good=np.isfinite(times).all() and np.isfinite(values).all()
                check(good,"animation_finite",f"{clip} sampler {sampler_index} contains non-finite values")
                if np.isfinite(times).all():
                    flat=times.reshape(-1);starts.append(float(flat[0]));ends.append(float(flat[-1]))
                    check(bool((np.diff(flat)>0).all()),"animation_time_order",f"{clip} sampler {sampler_index}")
                interpolation=sampler.get("interpolation","LINEAR")
                require(interpolation in {"LINEAR","STEP","CUBICSPLINE"},"Unsupported animation interpolation")
                samples.append((interpolation,times,values))
            duration=max(ends)-min(starts) if starts else None
            expected=contract["clips"].get(clip,{}).get("durationSeconds")
            row["clips"][clip]={"sampler_count":len(samples),"duration_seconds":duration,
                                "start_seconds":min(starts) if starts else None,
                                "expected_duration_seconds":expected}
            check(duration is not None and expected is not None and abs(duration-expected)<=TOLERANCE
                  and abs(min(starts))<=TOLERANCE,"clip_duration",f"{clip}: actual={duration}, expected={expected}")
            clip_tracks={}
            for channel in animation.get("channels",[]):
                target=channel["target"];node=Snapshot.item(nodes,target["node"],"animation target")
                name=re.sub(r"_LOD[01]$","_LOD",node.get("name",f"node_{target['node']}"),flags=re.IGNORECASE)
                key=(name,target["path"])
                require(key not in clip_tracks,f"Duplicate animation target: {clip} {key}")
                sample=Snapshot.item(samples,channel["sampler"],"animation sampler")
                interpolation,times,values=sample
                expected_rows=len(times)*(3 if interpolation=="CUBICSPLINE" else 1)
                if target["path"]!="weights":
                    width=4 if target["path"]=="rotation" else 3
                    check(values.shape==(expected_rows,width),"animation_shape",f"{clip} {key}")
                clip_tracks[key]=sample
            tracks[clip]=clip_tracks
        row["triangle_budget_target"]=BUDGETS[label]
        row["within_triangle_budget"]=row["triangles"]<=BUDGETS[label]
        if not row["within_triangle_budget"]:
            row["warnings"].append(f"Triangle target exceeded: {row['triangles']} > {BUDGETS[label]}; performance tradeoff requires root review.")
        state={"joints":joint_names,"tracks":tracks,"extras":extras}
    except (OSError,InvalidAsset,AssertionError,KeyError,ValueError,IndexError,TypeError,struct.error) as exc:
        error("invalid_glb",exc)
    row["passed"]=not row["errors"]
    return row,state


def audit_pair(lod0,lod1,contract):
    rows={};states={}
    for label,path in (("lod0",lod0),("lod1",lod1)):
        rows[label],states[label]=inspect_guard(path,contract,label)
    pair={"joints_match":False,"motion_matches":False,"runtime_extras_match":False,
          "maximum_motion_sample_delta":None,"errors":[]}
    if all(row["passed"] for row in rows.values()):
        a,b=states["lod0"],states["lod1"]
        pair["joints_match"]=a["joints"]==b["joints"]
        pair["runtime_extras_match"]=close_tree(a["extras"],b["extras"])
        maximum=0.0;motion_ok=a["tracks"].keys()==b["tracks"].keys()
        for clip,tracks in a["tracks"].items():
            other=b["tracks"].get(clip,{})
            if tracks.keys()!=other.keys():
                motion_ok=False;continue
            for target,(interpolation,times,values) in tracks.items():
                other_interpolation,other_times,other_values=other[target]
                if interpolation!=other_interpolation or times.shape!=other_times.shape or values.shape!=other_values.shape:
                    motion_ok=False;continue
                maximum=max(maximum,float(np.max(np.abs(times-other_times))),float(np.max(np.abs(values-other_values))))
        pair["maximum_motion_sample_delta"]=maximum
        pair["motion_matches"]=motion_ok and maximum<=TOLERANCE
        for key in ("joints_match","motion_matches","runtime_extras_match"):
            if not pair[key]:
                pair["errors"].append(key)
    else:
        pair["errors"].append("Pair comparison unavailable until both LOD structure checks pass")
    passed=all(row["passed"] for row in rows.values()) and not pair["errors"]
    return {"status":"pass" if passed else "fail",
            "passed":passed,"runtime_publish_allowed":False,"visual_approval":False,
            "proof_scope":"Actual GLB bytes, not Blender source or screenshots. Tool success does not approve appearance, shield facing, contact, deformations, or animation bounds coverage.",
            "lods":list(rows.values()),"pair":pair}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run",type=Path,required=True)
    parser.add_argument("--contract",type=Path,default=ROOT/"art-factory/rts/contracts/original-guard-assembly.json")
    parser.add_argument("--lod0",type=Path)
    parser.add_argument("--lod1",type=Path)
    args=parser.parse_args()
    raw_contract=args.contract.read_bytes();contract=json.loads(raw_contract)
    finite_json(contract)
    report=audit_pair(args.lod0 or args.run/"candidate/original-guard-assembly-lod0.glb",
                      args.lod1 or args.run/"candidate/original-guard-assembly-lod1.glb",contract)
    report["contract"]={"path":str(args.contract.resolve()),"sha256":hashlib.sha256(raw_contract).hexdigest()}
    out=args.run/"qa/runtime-structure.json";out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(report,indent=2,allow_nan=False)+"\n",encoding="utf-8")
    print(json.dumps({"status":report["status"],"report":str(out),
                      "lods":[{"lod":r["lod"],"sha256":r["sha256"],"triangles":r["triangles"],
                               "draws":r["primitive_draw_count"],"errors":r["errors"],
                               "warnings":r["warnings"]} for r in report["lods"]],
                      "pair":report["pair"]},indent=2,allow_nan=False))
    return 0 if report["passed"] else 1


if __name__=="__main__":
    raise SystemExit(main())
