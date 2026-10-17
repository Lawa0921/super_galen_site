"""neural_pilot_v3 front/rear projection with wider facing/depth gates (same CLI).

Wide, layered robes leave many oblique texels below the stock gates (facing > 0.15, nearest depth
gap < 35 mm); those keep the blurry neural colour, which reads as rust/grey blotches on an ivory
robe. This keeps the generated front/rear reference down to grazing angles (facing > -0.1, so the
front and rear weights can never sum past 1) and tolerates a 70 mm depth gap. Deterministic; no
pixels are painted. Usage is identical to neural_pilot_v3.py.
"""
import numpy as np

import neural_pilot_v3 as v3


def wide_weight(signed_normal, alpha, depth_gap):
    facing = np.clip((np.asarray(signed_normal) + 0.10) / 0.5, 0, 1)
    visible = np.clip((0.07 - np.asarray(depth_gap)) / 0.02, 0, 1)
    return facing * np.clip(np.asarray(alpha), 0, 1) * visible


v3.projection_weight = wide_weight

if __name__ == '__main__':
    v3.main()
