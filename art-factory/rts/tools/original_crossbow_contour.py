"""Continuous perimeter coordinates for irregular original mesh contours."""
import numpy as np

def fractions(points):
    p=np.asarray(points,dtype=float)
    if p.ndim!=2 or p.shape[0]<3 or p.shape[1]!=3 or not np.isfinite(p).all():
        raise ValueError('Contour requires at least three finite 3D points')
    length=np.linalg.norm(np.roll(p,-1,axis=0)-p,axis=1)
    if np.any(length<=1e-10):raise ValueError('Contour has a zero-length edge')
    return np.r_[0.,np.cumsum(length[:-1])]/length.sum()
