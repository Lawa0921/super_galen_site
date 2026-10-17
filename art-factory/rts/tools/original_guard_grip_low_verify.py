"""Check frozen source, saved candidate and review references without rebuilding."""
from pathlib import Path
import hashlib
import json
import re

import trimesh

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-grip-low/2026-10-05"
CONTRACT = ROOT / "art-factory/rts/contracts/original-guard-grip-low.json"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    build = json.loads((RUN / "qa/build.json").read_text(encoding="utf-8"))
    geometry = json.loads((RUN / "qa/geometry.json").read_text(encoding="utf-8"))
    local = json.loads((RUN / "qa/vertex-3262-containment-diagnosis.json").read_text(encoding="utf-8"))
    renders = json.loads((RUN / "qa/renders.json").read_text(encoding="utf-8"))
    first = RUN / "rejected/attempt-1/geometry.json"
    delta = json.loads((RUN / "qa/attempt-delta.json").read_text(encoding="utf-8"))
    supplement = json.loads((RUN / "qa/closed-shell-and-self.json").read_text(encoding="utf-8"))
    blend = RUN / "candidate/original-guard-grip-low.blend"
    glb = RUN / "candidate/original-guard-grip-low.glb"
    assert sha(ROOT / contract["source_fit_blend"]) == contract["source_fit_blend_sha256"]
    assert sha(ROOT / contract["source_fit_blend"].replace(".blend", ".glb")) == contract["source_fit_glb_sha256"]
    assert sha(blend) == contract["candidate_blend_sha256"] == build["sha256"]["blend"]
    assert sha(glb) == contract["candidate_glb_sha256"] == build["sha256"]["glb"]
    assert sha(first) == build["first_pass_rejection_sha256"]
    assert sha(RUN / "rejected/attempt-1/original-guard-grip-low.blend") == delta["first_pass"]["blend_sha256"]
    assert sha(RUN / "rejected/attempt-1/original-guard-grip-low.glb") == delta["first_pass"]["glb_sha256"]
    assert geometry["candidate_sha256"] == renders["candidate_sha256"] == build["sha256"]
    assert local["candidate_blend_sha256"] == build["sha256"]["blend"]
    assert local["point_inside_any_closed_component_by_majority"] is False
    assert len(local["incident_glove_edges"]) == 5
    assert all(not edge["whole_sword_segment_hit_from_point"]
               and not edge["whole_sword_segment_hit_from_neighbor"]
               for edge in local["incident_glove_edges"])
    assert geometry["metrics"]["closed_sword_component_containment_complete"] is False
    assert supplement['candidate_blend_sha256'] == build['sha256']['blend']
    assert supplement['candidate_glb_sha256'] == build['sha256']['glb']
    assert supplement['geometry_changed'] is False
    assert len(supplement['strict_nonincident_self_pairs']) == 18
    assert supplement['glove_vertices_inside_closed_shell_union'] == []
    assert supplement['glove_vertices_on_closed_shell_boundaries'] == []
    assert sum(c['closed_consistent_shell'] for c in supplement['sword_components']) == 14
    assert not geometry["verdict"]["pass"] and not contract["runtime_publish_allowed"]
    assert build["source_sword_local_mesh_sha256"] == build["candidate_sword_local_mesh_sha256"]
    assert build["original_glove_matrix_world"] == build["candidate_glove_matrix_world"]
    assert len(geometry["metrics"]["near_source_normal_opposition_records"]) == 31
    document = (RUN / "review.html").read_text(encoding="utf-8")
    images = re.findall(r'<img src="([^"]+)"', document)
    assert len(images) == 13 and all((RUN / name).is_file() for name in images)
    for record in renders["renders"].values():
        assert sha(ROOT / record["path"]) == record["sha256"]
    scene = trimesh.load(glb, force="scene")
    glove = [mesh for name, mesh in scene.geometry.items() if name.startswith("OriginalGripSource")]
    assert len(glove) == 1 and len(glove[0].faces) == 11846
    output = {"status": "verified_rejected_candidate", "source_unchanged": True,
              "candidate_hashes_match": True, "sword_mesh_and_fit_matrix_unchanged": True,
              "review_images_valid": len(images), "glb_glove_triangles": len(glove[0].faces),
              "joined_parity_counterexample_locally_resolved": True,
              "full_closed_component_containment_verified": True,
              "open_sword_components_without_volume_claim": 1,
              "strict_nonincident_self_pairs": 18,
              "runtime_publish_allowed": False}
    (RUN / "qa/verify.json").write_bytes((json.dumps(output, indent=2) + "\n").encode("utf-8"))
    print("GRIP_LOW_VERIFY " + json.dumps(output))


if __name__ == "__main__":
    main()
