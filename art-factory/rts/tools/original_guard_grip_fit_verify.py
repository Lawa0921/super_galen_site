"""Read-only integrity check for the local grip fit review package."""
from html.parser import HTMLParser
from pathlib import Path
import ast
import hashlib
import json
import re

import trimesh
from original_guard_grip_fit_math import axis_local_finger_side, finger_side_fit_verdict

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-grip-fit/2026-10-05"


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attrs):
        self.paths.extend(value for key, value in attrs if key in ("href", "src"))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    qa = json.loads((RUN / "qa/diagnose-s0.900-spin90.json").read_text(encoding="utf-8"))
    side = json.loads((RUN / "qa/finger-side-contact.json").read_text(encoding="utf-8"))
    candidate = json.loads((RUN / "qa/candidate.json").read_text(encoding="utf-8"))
    renders = json.loads((RUN / "qa/renders.json").read_text(encoding="utf-8"))
    assert qa["verdict"]["pass"]
    assert qa["exact_triangle_crossings"] == qa["sword_vertices_contained_in_glove"] == 0
    assert len(qa["fingers"]) == 4
    assert side["frozen_diagnosis_sha256"] == sha(RUN / "qa/diagnose-s0.900-spin90.json")
    assert side["source_sha256"] == qa["source_sha256"]
    assert side["candidate_sha256"] == candidate["sha256"]
    channel = json.loads((ROOT / "art-factory/rts/runs/original-guard-grip-channel/2026-10-05/qa/input.json").read_text(encoding="utf-8"))
    axis = side["source_channel_axis"]
    assert axis["origin_m"] == channel["fit"]["origin"]
    assert axis["direction"] == channel["fit"]["direction"]
    assert len(side["zones"]) == 4 and side["verdict"]["pass"]
    assert finger_side_fit_verdict(side["zones"])["pass"]
    for previous, zone in zip(qa["fingers"], side["zones"]):
        assert previous["finger_from_guard"] == zone["finger_from_guard"]
        assert previous["samples_within_0p8mm"] == zone["recomputed_near_count"]
        assert zone["finger_side_near_count"] == len(zone["finger_side_samples"])
        assert zone["opposite_side_near_count"] == len(zone["opposite_side_samples"])
        assert zone["recomputed_near_count"] == zone["finger_side_near_count"] + zone["opposite_side_near_count"]
        for accepted, records in [(True, zone["finger_side_samples"]), (False, zone["opposite_side_samples"])]:
            for record in records:
                measured = axis_local_finger_side(record["nearest_glove_source_point_m"], axis["origin_m"], axis["direction"])
                assert measured["finger_side"] is accepted
                assert abs(measured["finger_side_offset_m"] - record["finger_side_offset_m"]) < 1e-10
                assert abs(measured["azimuth_degrees"] - record["azimuth_degrees"]) < 1e-8
                assert .0003 <= record["gap_m"] <= .0008
        angles = [item["azimuth_degrees"] for item in zone["finger_side_samples"]]
        assert zone["finger_side_azimuth_range_degrees"] == [min(angles), max(angles)]
    assert candidate["source_local_mesh_fingerprints"] == candidate["candidate_local_mesh_fingerprints"]
    for extension in ("blend", "glb"):
        artifact = RUN / "candidate" / ("original-guard-grip-fit." + extension)
        assert sha(artifact) == candidate["sha256"][extension], extension
    scene = trimesh.load(RUN / "candidate/original-guard-grip-fit.glb", force="scene", process=False)
    assert any("OriginalGrip" in node for node in scene.graph.nodes_geometry)
    assert any("KingdomSteelSword" in node for node in scene.graph.nodes_geometry)
    assert len(renders["renders"]) == 6
    for item in renders["renders"].values():
        assert sha(ROOT / item["path"]) == item["sha256"]
    parser = Links()
    parser.feed((RUN / "review.html").read_text(encoding="utf-8"))
    assert parser.paths and all((RUN / path).exists() for path in parser.paths)
    files = list((ROOT / "art-factory/rts/tools").glob("original_guard_grip_fit*.py"))
    files += [ROOT / "art-factory/rts/contracts/original-guard-grip-fit.json"]
    files += [RUN / "review.html"]
    files += list((RUN / "qa").glob("*.json"))
    for path in files:
        content = path.read_text(encoding="utf-8")
        if path.suffix == ".py":
            ast.parse(content)
        if path.suffix == ".json":
            json.loads(content)
        assert not re.search(r"AIza[0-9A-Za-z_-]{20}|sk-[0-9A-Za-z_-]{20}|-----BEGIN (?:RSA|OPENSSH|PRIVATE)", content)
    print(json.dumps({"fit": qa["verdict"], "finger_side": side["verdict"],
                      "finger_side_near_wrap": [z["finger_side_near_count"] for z in side["zones"]],
                      "opposite_excluded": [z["opposite_side_near_count"] for z in side["zones"]],
                      "glb_mesh_nodes": len(scene.graph.nodes_geometry), "renders": len(renders["renders"]),
                      "review_links": len(parser.paths), "hashes": "match", "text_scan": "clear"}))


if __name__ == "__main__":
    main()
