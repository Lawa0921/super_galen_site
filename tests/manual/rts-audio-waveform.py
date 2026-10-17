"""Inspect exact IEEE float32 PCM frame mechanics; never listening approval."""
import argparse
import hashlib
import json
import os
import shutil
import struct
import subprocess
from pathlib import Path

import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument('folder', type=Path)
args = parser.parse_args()
folder = args.folder.resolve()
capture_path = folder/'capture.json'
capture = json.loads(capture_path.read_text(encoding='utf-8'))
audio = folder/capture.get('audioFile', 'battle-audio.wav')

def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1024*1024), b''):
            digest.update(block)
    return digest.hexdigest()

source_sha = sha(audio)
errors = list(capture.get('errors', []))
if source_sha != capture.get('audioSha256'):
    errors.append('Recording differs from capture SHA')
probe = shutil.which('ffprobe')
if not probe:
    raise RuntimeError('ffprobe is required')
flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
meta = json.loads(subprocess.run([probe, '-v', 'error', '-show_entries',
    'stream=codec_name,codec_type,sample_rate,channels,sample_fmt,bits_per_sample,duration',
    '-of', 'json', str(audio)], check=True, capture_output=True, text=True, creationflags=flags).stdout)
streams = meta['streams']
with audio.open('rb') as handle:
    header = handle.read(56)
if len(header) != 56 or header[:4] != b'RIFF' or header[8:16] != b'WAVEfmt ' or header[36:40] != b'fact' or header[48:52] != b'data':
    raise ValueError('Expected direct float32 PCM WAV with fmt/fact/data chunks; compressed capture is not supported')
fmt_size, codec, channels, rate, byte_rate, align, bits = struct.unpack_from('<IHHIIHH', header, 16)
fact_size, fact_frames = struct.unpack_from('<II', header, 40)
data_bytes = struct.unpack_from('<I', header, 52)[0]
if fmt_size != 16 or codec != 3 or bits != 32 or channels not in (1, 2) or align != channels*4 or byte_rate != rate*align or fact_size != 4:
    raise ValueError('Invalid IEEE float32 PCM WAV format')
if audio.stat().st_size != 56+data_bytes or struct.unpack_from('<I', header, 4)[0] != 48+data_bytes or data_bytes % align:
    raise ValueError('WAV size does not describe complete PCM frames')
frame_count = data_bytes//align
first = capture.get('firstFrame')
last = capture.get('lastFrameExclusive')
interval_frames = last-first if isinstance(first, int) and isinstance(last, int) and 0 <= first <= last else None
if len(streams) != 1 or streams[0]['codec_name'] != 'pcm_f32le' or streams[0]['codec_type'] != 'audio' or int(streams[0]['sample_rate']) != rate or int(streams[0]['channels']) != channels:
    errors.append('ffprobe does not confirm direct float32 audio-only format')
if fact_frames != frame_count or frame_count != capture.get('frames') or frame_count != capture.get('writtenFrames') or frame_count != interval_frames:
    errors.append('Exact WAV/capture/acknowledged interval frame count mismatch')
ack = capture.get('stopAck') or {}
if ack.get('firstFrame') != capture.get('firstFrame') or ack.get('lastFrameExclusive') != capture.get('lastFrameExclusive') or ack.get('nextSequence') != capture.get('nextSequence'):
    errors.append('stopAck does not equal final capture interval')
ledger = capture.get('pcmLedger', [])
expected = capture.get('firstFrame')
ledger_frames = 0
inactive_input_frames = 0
native_quantums = global_frame_anomalies = 0
maximum_native_decode_error = 0.0
for sequence, row in enumerate(ledger):
    if not row.get('accepted') or row['sequence'] != sequence or row['startFrame'] != expected or row['frameCount'] <= 0 or row['channelCount'] != channels or row['sampleRate'] != rate or row['bytes'] != row['frameCount']*align:
        errors.append(f'PCM ledger discontinuity or invalid packet at sequence {sequence}')
    expected = row['startFrame']+row['frameCount']
    ledger_frames += row['frameCount']
    inactive = row.get('inactiveInputFrames', 0)
    if not isinstance(inactive, int) or not 0 <= inactive <= row['frameCount']:
        errors.append(f'Invalid inactive-input frame classification at sequence {sequence}')
    else:
        inactive_input_frames += inactive
    if capture.get('frameClock', {}).get('mode') == 'native-a-rate-low20-epoch':
        witnesses = row.get('renderQuanta', [])
        quantum_expected = row['startFrame']
        if not witnesses:
            errors.append(f'Missing native frame witness at sequence {sequence}')
        for q in witnesses:
            low_first, low_last = q.get('nativeLowFirst'), q.get('nativeLowLast')
            epoch_first, epoch_last = q.get('nativeEpochFirst'), q.get('nativeEpochLast')
            decode_error = q.get('maximumClockDecodeError', float('inf'))
            if not all(isinstance(v, (int, float)) and np.isfinite(v) for v in (low_first, low_last, epoch_first, epoch_last, decode_error)):
                errors.append(f'Invalid native frame witness numbers at sequence {sequence}')
                continue
            actual_first = epoch_first*1048576+round(low_first)
            actual_last = epoch_last*1048576+round(low_last)
            if q.get('startFrame') != quantum_expected or not isinstance(q.get('frameCount'), int) or q['frameCount'] <= 0 or q.get('nativeEverySampleValidated') is not True or actual_first != quantum_expected or actual_last != quantum_expected+q['frameCount']-1 or not 0 <= decode_error <= .125 or abs(low_first-round(low_first)) > .125 or abs(low_last-round(low_last)) > .125:
                errors.append(f'Invalid native frame witness at sequence {sequence}')
            quantum_expected += q.get('frameCount', 0)
            native_quantums += 1
            global_frame_anomalies += q.get('globalFrame') != q.get('startFrame')
            maximum_native_decode_error = max(maximum_native_decode_error, decode_error)
        if quantum_expected != row['startFrame']+row['frameCount']:
            errors.append(f'Incomplete native frame witness interval at sequence {sequence}')
if not ledger or ledger_frames != frame_count or expected != capture.get('lastFrameExclusive') or len(ledger) != capture.get('nextSequence'):
    errors.append('PCM ledger does not span the exact written frame interval')
if inactive_input_frames != capture.get('inactiveInputFrames', 0) or inactive_input_frames != ack.get('inactiveInputFrames', 0):
    errors.append('Inactive-input frame classification does not match ledger/ack')
if capture.get('frameClock', {}).get('mode') == 'native-a-rate-low20-epoch' and (native_quantums != capture.get('quantumCount') or native_quantums != ack.get('quantumCount') or global_frame_anomalies != capture.get('globalFrameAnomalies') or global_frame_anomalies != ack.get('globalFrameAnomalies')):
    errors.append('Native frame witness totals do not match capture/ack')
if capture.get('status') != 'passed_lossless_capture' or capture.get('format') != 'IEEE_FLOAT32_WAV':
    errors.append('Capture did not pass lossless finalization')
if rate != capture.get('sampleRate') or channels != capture.get('channelCount'):
    errors.append('Capture format differs from WAV')
parameters = capture.get('mainParameters', {})
if len(parameters) != 4 or any(value != parameters.get('before') for value in parameters.values()):
    errors.append('Main master/compressor parameters were not proven unchanged')
invalid = clipped = sample_count = 0
peak = energy = 0.0
rms_windows = []
window = max(1, round(rate*.1))
if frame_count:
    frames = np.memmap(audio, dtype='<f4', mode='r', offset=56, shape=(frame_count, channels))
    for start in range(0, frame_count, window):
        part = np.asarray(frames[start:start+window], dtype=np.float64)
        invalid += int((~np.isfinite(part)).sum())
        finite = np.where(np.isfinite(part), part, 0.)
        peak = max(peak, float(np.max(np.abs(finite))))
        clipped += int((np.abs(finite) >= 1).sum())
        total = float(np.sum(finite**2));energy += total;sample_count += part.size
        rms_windows.append(float(np.sqrt(total/part.size)))
    tail = np.asarray(frames[-window:], dtype=np.float64)
    last_peak = float(np.max(np.abs(np.where(np.isfinite(tail), tail, 0.))))
    del frames
else:
    last_peak = 0.
if invalid or clipped or peak <= 1e-5 or not frame_count:
    errors.append('Nonfinite, clipped, silent or empty direct PCM recording')
if sha(audio) != source_sha:
    errors.append('Recording changed during inspection')
scheduled = [e for e in capture.get('events', []) if e.get('scheduled')]
cue_witnesses = []
if frame_count and isinstance(first, int):
    pcm = np.memmap(audio, dtype='<f4', mode='r', offset=56, shape=(frame_count, channels))
    for event in scheduled:
        time = event.get('audioTime')
        if not isinstance(time, (int, float)) or not np.isfinite(time):
            continue
        start = round(time*rate)-first
        if not 0 <= start < frame_count:
            continue
        part = np.asarray(pcm[start:min(frame_count, start+round(rate*.9))], dtype=np.float64)
        cue_peak = float(np.max(np.abs(np.where(np.isfinite(part), part, 0.))))
        if cue_peak > 1e-5:
            cue_witnesses.append({'kind': event['kind'], 'context_seconds': time, 'pcm_start_frame': start, 'window_seconds': .9, 'peak': cue_peak})
    del pcm
if not cue_witnesses:
    errors.append('No naturally scheduled runtime cue with nonzero PCM inside capture interval')
duration = frame_count/rate
if duration != capture.get('audioSeconds'):
    errors.append('Capture seconds are not exactly derived from integer PCM frames')
report = {'status': 'passed_signal_mechanics' if not errors else 'failed_signal_mechanics', 'errors': errors,
    'audio_sha256': source_sha, 'capture_sha256': sha(capture_path), 'streams': streams,
    'format': 'IEEE_FLOAT32_WAV', 'decoded_seconds': duration, 'captured_pcm_seconds': capture.get('audioSeconds'),
    'duration_difference_seconds': duration-capture.get('audioSeconds', 0), 'frames': frame_count, 'first_frame': capture.get('firstFrame'),
    'last_frame_exclusive': capture.get('lastFrameExclusive'), 'frame_count_equals_acknowledged_interval': frame_count == interval_frames,
    'inactive_input_frames': inactive_input_frames, 'ledger_packets': len(ledger), 'invalid_samples': invalid, 'clipped_samples': clipped, 'peak': peak,
    'native_frame_clock': capture.get('frameClock', {}).get('mode'), 'native_render_quantums': native_quantums,
    'global_frame_anomalies': global_frame_anomalies, 'maximum_native_clock_decode_error_frames': maximum_native_decode_error,
    'rms': float(np.sqrt(energy/max(1, sample_count))), 'last_100ms_peak': last_peak,
    'rms_windows_seconds': .1, 'rms_windows': rms_windows, 'scheduled_cues_with_nonzero_pcm': cue_witnesses, 'scheduled_cues': sorted({e['kind'] for e in scheduled}),
    'max_reported_voices': max((e['voices'] for e in scheduled), default=0), 'max_reported_sources': max((e['sources'] for e in scheduled), default=0),
    'artistic_listening_approved': False,
    'limitations': ['RMS/cue-window witnesses do not isolate concurrent instruments or prove perceptual masking or artistic quality.', 'First captured worklet frame defines the interval; earlier graph audio is outside it.', 'No resampling, padding, Opus decoding or duration tolerance is used.']}
(folder/'waveform-qa.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8', newline='\n')
print(json.dumps({k:v for k,v in report.items() if k != 'rms_windows'}))
if errors:
    raise SystemExit(1)
