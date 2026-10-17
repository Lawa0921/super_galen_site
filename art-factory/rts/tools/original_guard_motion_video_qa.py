"""Verify continuous preview media with ffprobe and record hashes."""

import hashlib
import json
import subprocess
import sys
from pathlib import Path

from original_guard_motion_spec import CLIP_DURATIONS_S


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def probe(path):
    completed = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    data = json.loads(completed.stdout)
    video = next(stream for stream in data["streams"] if stream["codec_type"] == "video")
    return {
        "path": str(path),
        "sha256": sha256(path),
        "bytes": path.stat().st_size,
        "codec": video["codec_name"],
        "width": video["width"],
        "height": video["height"],
        "frame_rate": video["r_frame_rate"],
        "frames": int(video.get("nb_frames", 0)),
        "duration_s": float(data["format"]["duration"]),
    }


def main():
    run = Path(sys.argv[1]).resolve()
    qa = run / "qa"
    attack_only = "--attack-only" in sys.argv[2:]
    if attack_only:
        media = probe(qa / "attack-target.mp4")
        if media["codec"] != "h264" or media["frame_rate"] != "30/1":
            raise AssertionError(f"Unexpected Attack target video encoding: {media}")
        if media["width"] != 384 or media["height"] != 480:
            raise AssertionError(f"Unexpected Attack target video dimensions: {media}")
        if abs(media["duration_s"] - CLIP_DURATIONS_S["Attack"]) > 1.0 / 30.0:
            raise AssertionError(f"Unexpected Attack target video duration: {media}")
        result = {
            "status": "pass",
            "runtime_publish_allowed": False,
            "attack_target_preview": media,
            "unchanged_clip_evidence": "../revision-v2/qa/video-qa.json",
        }
        (qa / "attack-video-qa.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8", newline="\n")
        print("ORIGINAL_GUARD_ATTACK_VIDEO_QA=" + json.dumps(result, sort_keys=True))
        return
    result = {"ffprobe": "ffprobe 8.1.1", "continuous_previews": {}}
    for name, expected_duration in CLIP_DURATIONS_S.items():
        path = qa / f"{name.lower()}.mp4"
        media = probe(path)
        if media["codec"] != "h264" or media["frame_rate"] != "30/1":
            raise AssertionError(f"Unexpected {name} video encoding: {media}")
        if media["width"] != 384 or media["height"] != 480:
            raise AssertionError(f"Unexpected {name} video dimensions: {media}")
        if abs(media["duration_s"] - expected_duration) > 1.0 / 30.0:
            raise AssertionError(f"Unexpected {name} video duration: {media}")
        result["continuous_previews"][name] = media
    evidence = {
        "AttackTargetPlane": (qa / "attack-target.mp4", CLIP_DURATIONS_S["Attack"], 384, 480),
        "WalkActual3mpsFixedGrid": (qa / "walk-3mps-side.mp4", 2.0, 480, 360),
    }
    result["qa_measurement_previews"] = {}
    for name, (path, expected_duration, width, height) in evidence.items():
        media = probe(path)
        if media["codec"] != "h264" or media["frame_rate"] != "30/1":
            raise AssertionError(f"Unexpected {name} video encoding: {media}")
        if media["width"] != width or media["height"] != height:
            raise AssertionError(f"Unexpected {name} video dimensions: {media}")
        if abs(media["duration_s"] - expected_duration) > 1.0 / 30.0:
            raise AssertionError(f"Unexpected {name} video duration: {media}")
        result["qa_measurement_previews"][name] = media
    result["gif_previews"] = {name: probe(qa / f"{name}.gif") for name in ("walk", "attack")}
    result["status"] = "pass"
    result["runtime_publish_allowed"] = False
    (qa / "video-qa.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8", newline="\n")
    print("ORIGINAL_GUARD_VIDEO_QA=" + json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
