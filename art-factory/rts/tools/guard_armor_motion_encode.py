"""Encode hash-verified raw/controlled Death comparison at actual source speed."""
import hashlib
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT/'art-factory/rts/runs/guard-right-hand-cage/2026-10-08-v33-armor-sleeve-winding'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    frames = RUN/'qa/motion-frames'
    manifest = json.loads((frames/'renders.json').read_text(encoding='utf-8'))
    assert len(manifest['images']) == 194
    for record in manifest['images']:
        assert sha(frames/record['file']) == record['sha256'] and record['render_pose_error'] < 2e-6
    out = RUN/'qa/motion'
    out.mkdir(parents=True, exist_ok=True)
    videos = []
    for speed, rate, duration in (('normal', 60, 1.6), ('quarter', 15, 6.4)):
        path = out/f'compare-{speed}.mp4'
        command = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
                   '-framerate', str(rate), '-i', str(frames/'raw-%04d.png'),
                   '-framerate', str(rate), '-i', str(frames/'controlled-%04d.png'),
                   '-filter_complex', 'hstack=inputs=2', '-t', str(duration), '-r', '60' if speed == 'normal' else '30',
                   '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(path)]
        subprocess.run(command, check=True, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        videos.append({'file': path.name, 'sha256': sha(path), 'speed': speed, 'duration_seconds': duration})
    (out/'encoding-sources.json').write_text(json.dumps({'candidate_sha256': manifest['candidate_sha256'],
        'frame_manifest_sha256': sha(frames/'renders.json'), 'runtime_publish_allowed': False, 'videos': videos}, indent=2)+'\n', encoding='utf-8', newline='\n')
    print('ARMOR_MOTION_ENCODED', len(videos))


if __name__ == '__main__':
    main()
