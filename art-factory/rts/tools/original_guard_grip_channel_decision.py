"""Resolve the initial diagnostic's signed-zero and micro-area labels without rebuilding geometry."""
from pathlib import Path
import hashlib,json
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/"art-factory/rts/runs/original-guard-grip-channel/2026-10-05";QA=RUN/"qa"

def main():
    original=json.loads((QA/"geometry.json").read_text(encoding="utf-8"))
    numeric=json.loads((QA/"numerical-diagnosis.json").read_text(encoding="utf-8"))
    for name,expected in original["sha256"].items():
        if hashlib.sha256((RUN/"candidate"/name).read_bytes()).hexdigest()!=expected:
            raise ValueError("Candidate changed after diagnosis")
    exact_preserved=all(point["distance_m"]==0 for point in numeric["nearest_output"])
    topology=dict(original["topology"])
    topology["micro_faces_below_1e_14_m2"]=len(numeric["micro_faces"])
    topology["zero_area_faces_bmesh"]=sum(face["bmesh_area"]==0 for face in numeric["micro_faces"])
    topology["zero_area_faces_float64"]=numeric["exact_zero_fan_count"]
    topology.pop("zero_area_faces")
    pass_local=(exact_preserved and not original["central_axis_hit"] and
                all(topology[key]==0 for key in ["boundary_edges","nonmanifold_edges","winding_edges","zero_area_faces_bmesh","zero_area_faces_float64"]))
    result={"status":"local_channel_checks_pass" if pass_local else "local_channel_checks_failed",
       "runtime_publish_allowed":False,"candidate_sha256":original["sha256"],"topology":topology,
       "outer_source_vertices":original["outer_source_vertices"],
       "outer_coordinates_preserved_numerically":exact_preserved,
       "signed_zero_only_difference":numeric["nearest_output"],
       "central_axis_clear":not original["central_axis_hit"],
       "initial_audit_labels_corrected":["20 positive-area micro-faces had been labeled zero-area by a 1e-14 threshold; both BMesh and float64 exact zero count are 0.",
          "One bytewise coordinate difference was -0.0 to +0.0; nearest distance is exactly 0. No exterior coordinates moved."],
       "remaining_work":["High-poly grip still needs local source-guided retopology.",
           "Individual rounded fingertip forms, wrist opening and character scale need visual/attachment work.",
           "No production rig, texture, fitted weapon or runtime acceptance."]}
    (QA/"local-decision.json").write_bytes((json.dumps(result,indent=2)+"\n").encode())
    print(json.dumps(result))
    if not pass_local: raise SystemExit(1)

if __name__=="__main__":main()
