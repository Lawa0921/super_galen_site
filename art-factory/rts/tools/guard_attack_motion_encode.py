"""Encode actual quarter-frame renders; keep source hashes beside the films."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT/'art-factory/rts/runs/guard-right-hand-cage'
BEFORE = BASE/'2026-10-08-v25-authored-attack/qa/motion/after'
RUN = BASE/'2026-10-08-v28-authored-attack-start-arc'
if '--exterior-tangent' in sys.argv:
    RUN = BASE/'2026-10-08-v29-attack-start-exterior-tangent'


def main():
    rows = []
    for view in ('front', 'oblique'):
        before, after = BEFORE/view, RUN/'qa/motion/after'/view
        for directory in (before, after):
            records = json.loads((directory/'frames.json').read_text(encoding='utf-8'))['renders']
            assert len(records) == 145
            for record in records:
                file = ROOT/record['path']
                assert hashlib.sha256(file.read_bytes()).hexdigest() == record['sha256']
        for speed, input_rate, output_rate, duration in (('normal', 120, 60, 1.2), ('quarter', 30, 30, 4.8)):
            path = RUN/f'qa/motion/compare-{view}-{speed}.mp4'
            args = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
                    '-framerate', str(input_rate), '-i', str(before/'%04d.png'),
                    '-framerate', str(input_rate), '-i', str(after/'%04d.png'),
                    '-filter_complex', 'hstack=inputs=2', '-t', str(duration), '-r', str(output_rate),
                    '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(path)]
            subprocess.run(args, check=True, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
            rows.append({'view': view, 'speed': speed, 'file': str(path.relative_to(ROOT)).replace('\\', '/'),
                         'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'duration_seconds': duration,
                         'inputs': [{'frame_manifest': str((p/'frames.json').relative_to(ROOT)).replace('\\', '/'),
                                     'manifest_sha256': hashlib.sha256((p/'frames.json').read_bytes()).hexdigest()} for p in (before, after)]})
            print('MOTION_ENCODED', view, speed, flush=True)
    (RUN/'qa/motion/encoding-sources.json').write_text(json.dumps({'runtime_publish_allowed': False, 'videos': rows}, indent=2)+'\n', encoding='utf-8')


if __name__ == '__main__':
    main()
