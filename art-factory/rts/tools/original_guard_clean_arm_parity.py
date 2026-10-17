"""Compare actual Three skinning with Blender output using local spatial lookup."""
import json
import gzip
import re
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/"art-factory/rts/runs/original-guard-clean-arm/2026-10-05"
CELL=1e-5


def gltf(points):
    p=np.asarray(points,float)
    return p[:,[0,2,1]]*np.array([1.,1.,-1.])


def component_name(export_name):
    return re.sub(r"_Quad_Cage(?:_\d+)?$", "", export_name)


def nearest_indices(expected, queries, cell=CELL, max_distance=2e-5):
    """Return nearest reference index per query using a 27-cell spatial hash."""
    reference=np.asarray(expected,dtype=float)
    query=np.asarray(queries,dtype=float)
    if reference.ndim!=2 or query.ndim!=2 or reference.shape[1]!=3 or query.shape[1]!=3:
        raise ValueError("Expected and query vertices must be N×3 arrays")
    if not len(reference) or not len(query):
        raise ValueError("Cannot map empty vertex sets")
    bins={}
    reference_cells=np.floor(reference/cell).astype(np.int64)
    for index,key in enumerate(map(tuple,reference_cells)):
        bins.setdefault(key,[]).append(index)
    indices=np.empty(len(query),dtype=np.int64)
    distances=np.empty(len(query),dtype=float)
    for row,point in enumerate(query):
        base=np.floor(point/cell).astype(np.int64)
        candidates=[]
        for dx in (-1,0,1):
            for dy in (-1,0,1):
                for dz in (-1,0,1):
                    candidates.extend(bins.get((base[0]+dx,base[1]+dy,base[2]+dz),()))
        if not candidates:
            raise ValueError("No reference vertex near browser point "+str(row))
        delta=reference[candidates]-point
        squared=np.einsum("ij,ij->i",delta,delta)
        best=int(np.argmin(squared))
        indices[row]=candidates[best]
        distances[row]=np.sqrt(squared[best])
    if not np.isfinite(distances).all() or distances.max()>max_distance:
        raise ValueError("Vertex mapping exceeds tolerance: "+str(float(distances.max())))
    return indices,distances


def main():
    qa=RUN/"qa"
    with gzip.open(qa/"blender-evaluated-vertices.json.gz","rt",encoding="utf-8") as file:
        reference=json.load(file)["poses"]
    with gzip.open(qa/"browser/browser-evaluated-vertices.json.gz","rt",encoding="utf-8") as file:
        browser=json.load(file)
    report={"method":"neutral spatial-hash nearest-vertex map, fixed mapping over actual Three poses",
            "poses":{},"runtime_publish_allowed":False}
    mappings={}
    for name,points in browser["neutral"].items():
        component=component_name(name)
        expected=gltf(reference["neutral"][component])
        index,distance=nearest_indices(expected,points)
        mappings[name]=index
    for pose in ("neutral","bend75","bend90","bend120","roll45","returnNeutral"):
        expected_pose="neutral" if pose=="returnNeutral" else pose
        stats={}
        for name,points in browser[pose].items():
            component=component_name(name)
            actual=np.asarray(points)
            expected=gltf(reference[expected_pose][component])[mappings[name]]
            distance=np.linalg.norm(actual-expected,axis=1)
            stats[name]={"vertices":len(actual),"max_deviation_m":float(distance.max()),
                         "rms_deviation_m":float(np.sqrt(np.mean(distance**2)))}
        report["poses"][pose]=stats
    report["max_deviation_m"]=max(row["max_deviation_m"] for pose in report["poses"].values() for row in pose.values())
    report["status"]="pass" if report["max_deviation_m"]<=2e-5 else "fail"
    (qa/"browser/parity.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print("CLEAN_ARM_PARITY",report["status"],report["max_deviation_m"])
    if report["status"]!="pass":
        raise ValueError("Actual browser output parity failed")


if __name__=="__main__":
    main()
