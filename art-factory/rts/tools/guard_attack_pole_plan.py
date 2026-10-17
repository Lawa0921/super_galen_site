"""One bounded authored pole correction; frozen world wrist and shoulder path."""
import hashlib
import json
import sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from arm_pole_motion import transport_pole_basis, replace_angle_span

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / 'art-factory/rts/runs/guard-right-hand-cage'
INPUT = BASE / '2026-10-08-v19-wrist-export-exact-skin/qa'
RUN = BASE / '2026-10-08-v24-attack-pole-curve'


def main():
    meta = json.loads((INPUT / 'blender-reference.json').read_text(encoding='utf-8'))
    assert meta['source_sha256'] == 'cb1f0bf304b82b27792b7fe57abcdc4ff2ed48f302d9dcd97531652096f5a751'
    binary = INPUT / 'blender-skin-matrices.f32'
    assert hashlib.sha256(binary.read_bytes()).hexdigest() == meta['binary_sha256']
    clip = next(c for c in meta['clips'] if c['name'] == 'Attack')
    matrices = np.fromfile(binary, dtype='<f4').reshape(-1, len(meta['bones']), 4, 4)[clip['offset']:clip['offset']+clip['count']].astype(float)
    rests = {k: np.asarray(v, float) for k, v in meta['bone_rest_matrices'].items()}
    names = ('UpperArm_R', 'Forearm_R', 'Hand_R')
    positions = np.stack([(matrices[:, meta['bones'].index(n)] @ rests[n][:, 3])[:, :3] for n in names], axis=1)
    shoulder, elbow, wrist = (positions[:, j] for j in range(3))
    reach = wrist-shoulder
    distance = np.linalg.norm(reach, axis=1)
    axes = reach/distance[:, None]
    poles = elbow-shoulder
    poles -= np.sum(poles*axes, axis=1)[:, None]*axes
    poles /= np.linalg.norm(poles, axis=1)[:, None]
    first, second = transport_pole_basis(axes, poles[0])
    angles = np.unwrap(np.arctan2(np.sum(poles*second, axis=1), np.sum(poles*first, axis=1)))
    times = np.arange(len(angles))/meta['step_per_frame']
    corrected_angles = replace_angle_span(times, angles, 9., 18., blend_frames=2.)
    corrected_poles = first*np.cos(corrected_angles)[:, None] + second*np.sin(corrected_angles)[:, None]
    rest_points = np.array([rests[n][:3, 3] for n in names])
    lengths = np.linalg.norm(np.diff(rest_points, axis=0), axis=1)
    along = (lengths[0]**2-lengths[1]**2+distance**2)/(2*distance)
    radius = np.sqrt(lengths[0]**2-along**2)
    authored_elbow = shoulder+axes*along[:, None]+corrected_poles*radius[:, None]
    # The source outside the declared edit window is byte-for-byte retained.
    inside = (times>9)&(times<18)
    authored_elbow[~inside] = elbow[~inside]
    dt = 1/(meta['step_per_frame']*meta['fps'])
    def speed(p):
        v = np.linalg.norm(np.diff(p, axis=0), axis=1)/dt
        i = int(np.argmax(v))
        return {'maximum_m_s': float(v[i]), 'frame': float(times[i])}
    length_error = max(np.max(abs(np.linalg.norm(authored_elbow-shoulder, axis=1)-lengths[0])),
                       np.max(abs(np.linalg.norm(wrist-authored_elbow, axis=1)-lengths[1])))
    assert length_error <= 1e-6
    assert np.array_equal(authored_elbow[~inside], elbow[~inside])
    report = {'status': 'bounded_pole_plan_pending_actual_blender_and_visual_review', 'runtime_publish_allowed': False,
              'source_sha256': meta['source_sha256'], 'source_matrices_sha256': meta['binary_sha256'], 'clip': 'Attack', 'side': 'R',
              'authored_window_frames': [9.,18.], 'boundary_blend_frames': 2., 'source_curve_modified': False,
              'shoulder_and_wrist_world_positions_changed': False, 'source_geometry_changed': False,
              'source_elbow_speed': speed(elbow), 'authored_elbow_speed': speed(authored_elbow), 'wrist_speed': speed(wrist),
              'maximum_limb_length_error_m': float(length_error), 'maximum_elbow_displacement_m': float(np.linalg.norm(authored_elbow-elbow, axis=1).max()),
              'source_unwrapped_pole_range_degrees': np.rad2deg([angles.min(),angles.max()]).tolist(),
              'authored_unwrapped_pole_range_degrees': np.rad2deg([corrected_angles.min(),corrected_angles.max()]).tolist(),
              'samples_per_frame': meta['step_per_frame'], 'samples': len(times),
              'pending': ['Actual Blender pose and curve authoring', 'Whole-body motion and armor inspection', 'Saved-file and actual Three.js parity']}
    (RUN/'qa').mkdir(parents=True, exist_ok=True)
    np.savez_compressed(RUN/'qa/pole-plan.npz', times=times, shoulders=shoulder, wrists=wrist, source_elbows=elbow, authored_elbows=authored_elbow,
                        source_angles=angles, authored_angles=corrected_angles)
    report['plan_sha256'] = hashlib.sha256((RUN/'qa/pole-plan.npz').read_bytes()).hexdigest()
    (RUN/'qa/pole-plan.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
