"""Rigid frame transport for original articulated-hand attachment."""
import numpy as np

def frame_map(source,target):
    frames=[np.asarray(value,dtype=float) for value in [source,target]]
    for value in frames:
        if value.shape!=(4,4) or not np.isfinite(value).all():
            raise ValueError('Attachment requires finite 4x4 frames')
        rotation=value[:3,:3]
        if not np.allclose(value[3],[0,0,0,1],atol=1e-6,rtol=0) or not np.allclose(rotation.T@rotation,np.eye(3),atol=1e-5,rtol=0) or abs(np.linalg.det(rotation)-1)>1e-5:
            raise ValueError('Attachment requires proper rigid frames without reflection or scale')
    return frames[1]@np.linalg.inv(frames[0])
