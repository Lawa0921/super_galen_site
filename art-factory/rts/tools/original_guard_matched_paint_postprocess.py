"""Reproduce bbox-only registration; this cannot prove semantic correspondence."""
from pathlib import Path
import hashlib
import json

import numpy as np
from PIL import Image
from scipy.ndimage import binary_closing, binary_fill_holes, label

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / 'art-factory/rts/runs/original-guard-matched-paint/2026-10-05'
TARGET = ROOT / 'art-factory/rts/runs/original-guard-portrait-study/2026-10-05/qa/renders/candidate-front.png'
STYLE = ROOT / 'art-factory/rts/runs/guard-neural-pilot/v3/raw/front-input.png'
PINNED = {
    TARGET: '51fad45bd3b20f0f3584f50c0d6f628480625c90ecca36b676e7d68b846dc3a5',
    STYLE: '42f9d67e25d0fc1530554c6a25d461c51a47aa2ccf44cd7a5ec4df67aeaf6d0b',
    RUN / 'raw/front-paintover.png': '1d8476af3c5b5517eaa636b1da6d5529f50ee0753a0ebc895b5dfc16395e999b',
}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def foreground_bbox(image):
    pixels = np.asarray(image.convert('RGB'), dtype=np.int16)
    mask = (pixels.max(axis=2) > 90) | ((pixels[:, :, 2] - pixels[:, :, 0] > 20) & (pixels[:, :, 2] > 60))
    mask = binary_fill_holes(binary_closing(mask, iterations=2))
    components, count = label(mask)
    if not count:
        raise ValueError('No threshold foreground; registration is undefined')
    sizes = np.bincount(components.ravel())
    sizes[0] = 0
    mask = components == sizes.argmax()
    y, x = np.where(mask)
    return (int(x.min()), int(y.min()), int(x.max()) + 1, int(y.max()) + 1), mask


def register_bbox(target, generated):
    target_box, target_mask = foreground_bbox(target)
    generated_box, generated_mask = foreground_bbox(generated)
    size = (target_box[2] - target_box[0], target_box[3] - target_box[1])
    result = target.convert('RGB').copy()
    result.paste(generated.convert('RGB').crop(generated_box).resize(size, Image.Resampling.LANCZOS), target_box[:2])
    warped_mask = Image.new('L', target.size, 0)
    warped_mask.paste(Image.fromarray(generated_mask.astype(np.uint8) * 255).crop(generated_box).resize(size, Image.Resampling.NEAREST), target_box[:2])
    aligned_mask = np.asarray(warped_mask) > 0
    iou = float(np.count_nonzero(target_mask & aligned_mask) / np.count_nonzero(target_mask | aligned_mask))
    return result, {'target_foreground_bbox': list(target_box), 'generated_foreground_bbox': list(generated_box),
                    'mask_iou_after_bbox_alignment': iou}


def main():
    for path, expected in PINNED.items():
        if sha(path) != expected:
            raise ValueError(f'Pinned input changed: {path.name}')
    target, generated = Image.open(TARGET).convert('RGB'), Image.open(RUN / 'raw/front-paintover.png').convert('RGB')
    result, registration = register_bbox(target, generated)
    result.save(RUN / 'candidate/front-bbox-registered.png')
    Image.blend(target, result, .5).save(RUN / 'qa/registration-overlay.png')
    pair = Image.new('RGB', (target.width * 2, target.height))
    pair.paste(target, (0, 0))
    pair.paste(result, (target.width, 0))
    pair.save(RUN / 'qa/source-and-paintover.png')
    report_path = RUN / 'qa/generation-and-registration.json'
    report = json.loads(report_path.read_text(encoding='utf-8'))
    report.update(registration)
    report['registered_sha256'] = sha(RUN / 'candidate/front-bbox-registered.png')
    report['postprocess_tool'] = str(Path(__file__).relative_to(ROOT)).replace('\\', '/')
    report['mask_limits'] = 'Thresholded visible-bright/chromatic largest component; dark cloth and seams can exclude connected regions. Not exact alpha/depth silhouette proof. Internal visor and plate-edge alignment require separate review.'
    report_path.write_bytes((json.dumps(report, indent=2, ensure_ascii=False) + '\n').encode('utf-8'))
    print(json.dumps({'registered_sha256': report['registered_sha256'], **registration}))


if __name__ == '__main__':
    main()
