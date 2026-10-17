"""Transplant only original dense Walk data into a standard unmerged GLB.

Base mesh/skin/node data and every other animation remain byte-preserved.
Dense donor node indices are remapped by unique source names and checked binds.
"""
import copy,hashlib,json,math,struct
from pathlib import Path

WIDTH={"SCALAR":1,"VEC2":2,"VEC3":3,"VEC4":4,"MAT4":16}
SIZE={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}
LEGS={f"{part}_{side}" for side in ("L","R") for part in ("Thigh","Shin","Foot")}
def _sha(data):return hashlib.sha256(data).hexdigest()
def _read(path):
    data=Path(path).read_bytes()
    if len(data)<28 or data[:4]!=b"glTF" or struct.unpack_from("<II",data,4)!=(2,len(data)):
        raise ValueError("Invalid GLB header")
    n,kind=struct.unpack_from("<II",data,12)
    if kind!=0x4e4f534a:raise ValueError("GLB JSON chunk required")
    doc=json.loads(data[20:20+n]);size,kind=struct.unpack_from("<II",data,20+n)
    binary=data[28+n:28+n+size]
    if kind!=0x004e4942 or len(binary)!=size or len(doc.get("buffers",[]))!=1:
        raise ValueError("One embedded GLB binary buffer required")
    return doc,binary,data
def _pack(doc,binary):
    text=json.dumps(doc,separators=(",",":"),ensure_ascii=False).encode()
    text+=b" "*((-len(text))%4);binary+=b"\0"*((-len(binary))%4)
    return struct.pack("<4sII",b"glTF",2,28+len(text)+len(binary))+struct.pack("<II",len(text),0x4e4f534a)+text+struct.pack("<II",len(binary),0x004e4942)+binary
def _access(doc,binary,number):
    a=doc["accessors"][number]
    if "sparse" in a or "bufferView" not in a:raise ValueError("Unsupported sparse/missing animation accessor")
    v=doc["bufferViews"][a["bufferView"]];width=WIDTH[a["type"]]*SIZE[a["componentType"]]
    stride=v.get("byteStride",width);start=v.get("byteOffset",0)+a.get("byteOffset",0)
    if v.get("buffer",0)!=0 or stride<width or start+(a["count"]-1)*stride+width>len(binary):
        raise ValueError("Accessor range invalid")
    return b"".join(binary[start+i*stride:start+i*stride+width] for i in range(a["count"]))
def _floats(doc,binary,number):
    a=doc["accessors"][number]
    if a["componentType"]!=5126:raise ValueError("Animation values must be FLOAT")
    raw=_access(doc,binary,number);values=struct.unpack("<"+"f"*(len(raw)//4),raw)
    if not all(math.isfinite(v) for v in values):raise ValueError("Animation values must be finite")
    return values
def _names(doc):
    result={}
    for i,n in enumerate(doc["nodes"]):
        name=n.get("name")
        if not name:continue
        if name in result:raise ValueError(f"Ambiguous source node name: {name}")
        result[name]=i
    return result
def _skin_signature(doc,binary):
    names=lambda index:doc["nodes"][index].get("name","")
    return sorted(json.dumps({"joints":[names(i) for i in skin["joints"]],
        "skeleton":names(skin["skeleton"]) if "skeleton" in skin else None,
        "inverseBind":_sha(_access(doc,binary,skin["inverseBindMatrices"]))},sort_keys=True)
        for skin in doc.get("skins",[]))
def _mesh_signature(doc,binary):
    rows=[]
    for node in doc["nodes"]:
        if "mesh" not in node:continue
        primitives=doc["meshes"][node["mesh"]]["primitives"]
        sig=[]
        for p in primitives:
            attrs={name:_sha(_access(doc,binary,index)) for name,index in p["attributes"].items() if name in {"POSITION","JOINTS_0","WEIGHTS_0"}}
            sig.append(attrs)
        skin=doc["skins"][node["skin"]] if "skin" in node else None
        rows.append((node.get("name"),[doc["nodes"][i].get("name") for i in skin["joints"]] if skin else None,sig))
    return sorted(rows,key=lambda r:r[0])
def _animation_signature(doc,binary,animation):
    rows=[]
    for channel in animation["channels"]:
        sampler=animation["samplers"][channel["sampler"]]
        rows.append((doc["nodes"][channel["target"]["node"]].get("name"),channel["target"]["path"],
            sampler.get("interpolation","LINEAR"),_sha(_access(doc,binary,sampler["input"])),_sha(_access(doc,binary,sampler["output"]))))
    return _sha(json.dumps(sorted(rows),sort_keys=True).encode())
def transplant_walk(base_path,dense_path,output_path=None,minimum_leg_keys=81):
    """Replace Walk before core merge; retain standard interpolation of other clips."""
    base_path,dense_path=Path(base_path),Path(dense_path)
    output_path=Path(output_path) if output_path else base_path
    base,base_bin,base_bytes=_read(base_path);dense,dense_bin,dense_bytes=_read(dense_path)
    bn,dn=_names(base),_names(dense)
    if _skin_signature(base,base_bin)!=_skin_signature(dense,dense_bin):raise ValueError("Dense/base skin inverse bind correspondence differs")
    if _mesh_signature(base,base_bin)!=_mesh_signature(dense,dense_bin):raise ValueError("Dense/base skinned mesh correspondence differs")
    def walk(doc):
        found=[a for a in doc.get("animations",[]) if a.get("name")=="Walk"]
        if len(found)!=1:raise ValueError("Exactly one Walk required")
        return found[0]
    old=walk(base);donor=walk(dense)
    if donor.get("extensions"):raise ValueError("Unsupported donor animation extension")
    protected={a["name"]:_animation_signature(base,base_bin,a) for a in base["animations"] if a is not old}
    base_parents={child:i for i,n in enumerate(base["nodes"]) for child in n.get("children",[])}
    dense_parents={child:i for i,n in enumerate(dense["nodes"]) for child in n.get("children",[])}
    defaults={"translation":[0,0,0],"rotation":[0,0,0,1],"scale":[1,1,1],"matrix":None}
    correspondences=[];leg_counts={}
    for channel in donor["channels"]:
        ni=channel["target"]["node"];name=dense["nodes"][ni].get("name")
        if name not in bn:raise ValueError("Donor target missing from base: "+str(name))
        bi=bn[name];a,b=base["nodes"][bi],dense["nodes"][ni]
        for prop,default in defaults.items():
            if a.get(prop,default)!=b.get(prop,default):raise ValueError("Target rest transform differs: "+name+" "+prop)
        ap=base["nodes"][base_parents[bi]].get("name") if bi in base_parents else None
        bp=dense["nodes"][dense_parents[ni]].get("name") if ni in dense_parents else None
        if ap!=bp:raise ValueError("Target hierarchy differs: "+name)
        if channel["target"]["path"] not in {"translation","rotation","scale"}:raise ValueError("Only bone TRS Walk tracks are supported")
        sampler=donor["samplers"][channel["sampler"]]
        times=_floats(dense,dense_bin,sampler["input"]);values=_floats(dense,dense_bin,sampler["output"])
        if not times or any(times[i]>=times[i+1] for i in range(len(times)-1)):raise ValueError("Donor times not strictly increasing")
        if name in LEGS and channel["target"]["path"]=="rotation":
            leg_counts[name]=len(times)
            if len(times)<minimum_leg_keys:raise ValueError("Dense leg rotation sample count too low: "+name)
        correspondences.append((name,ni,bi,channel["target"]["path"]))
    if set(leg_counts)!=LEGS:raise ValueError("Dense donor lacks one or more leg rotations")
    duration=lambda doc,binary,anim:max(max(_floats(doc,binary,s["input"])) for s in anim["samplers"])
    if abs(duration(base,base_bin,old)-duration(dense,dense_bin,donor))>1e-5:raise ValueError("Walk duration differs")
    document=copy.deepcopy(base);binary=bytearray(base_bin);view_map={};accessor_map={}
    def copy_accessor(index):
        if index in accessor_map:return accessor_map[index]
        a=copy.deepcopy(dense["accessors"][index]);vi=a["bufferView"]
        if vi not in view_map:
            view=copy.deepcopy(dense["bufferViews"][vi])
            if view.get("buffer",0)!=0 or view.get("extensions"):raise ValueError("Unsupported donor animation buffer view")
            start=view.get("byteOffset",0);size=view["byteLength"]
            if start+size>len(dense_bin):raise ValueError("Invalid donor view range")
            binary.extend(b"\0"*((-len(binary))%4));view["byteOffset"]=len(binary);view["buffer"]=0
            binary.extend(dense_bin[start:start+size]);view_map[vi]=len(document["bufferViews"]);document["bufferViews"].append(view)
        a["bufferView"]=view_map[vi];accessor_map[index]=len(document["accessors"]);document["accessors"].append(a)
        return accessor_map[index]
    replacement=copy.deepcopy(donor)
    for s in replacement["samplers"]:
        s["input"]=copy_accessor(s["input"]);s["output"]=copy_accessor(s["output"])
    for c in replacement["channels"]:c["target"]["node"]=bn[dense["nodes"][c["target"]["node"]]["name"]]
    index=next(i for i,a in enumerate(document["animations"]) if a.get("name")=="Walk");document["animations"][index]=replacement
    document["buffers"][0]["byteLength"]=len(binary)
    after_protected={a["name"]:_animation_signature(document,bytes(binary),a) for a in document["animations"] if a.get("name")!="Walk"}
    if after_protected!=protected or not bytes(binary).startswith(base_bin):raise AssertionError("Non-Walk base data changed")
    output=_pack(document,bytes(binary));output_path.parent.mkdir(parents=True,exist_ok=True)
    tmp=output_path.with_name(output_path.name+".walk-tmp");tmp.write_bytes(output);tmp.replace(output_path)
    return {"status":"pass","runtime_publish_allowed":False,"visual_approval":False,
        "scope":"Only dense Walk animation, its accessors and buffer views copied. Base binary is unchanged prefix; all other animations retain exact decoded track hashes.",
        "base_sha256":_sha(base_bytes),"dense_sha256":_sha(dense_bytes),"output_sha256":_sha(output),"output_path":str(output_path),
        "base_bytes":len(base_bytes),"output_bytes":len(output),"appended_binary_bytes":len(binary)-len(base_bin),
        "copied_accessor_count":len(accessor_map),"copied_buffer_view_count":len(view_map),"leg_rotation_keys":leg_counts,
        "protected_animation_sha256":protected,"skin_correspondence_verified":True,"mesh_skin_weights_verified":True,
        "target_node_correspondence":[{"name":n,"dense":d,"base":b,"path":p} for n,d,b,p in correspondences]}
