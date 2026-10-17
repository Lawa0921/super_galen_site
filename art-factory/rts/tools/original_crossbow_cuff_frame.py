"""Proper rigid fit for a closed original sleeve contour."""
import numpy as np

def rigid_fit(source,target):
    p=np.asarray(source,dtype=float);q=np.asarray(target,dtype=float)
    if p.shape!=q.shape or p.ndim!=2 or p.shape[0]<3 or p.shape[1]!=3 or not np.isfinite(p).all() or not np.isfinite(q).all():
        raise ValueError('Rigid fit requires matching finite point sets')
    a=p.mean(axis=0);b=q.mean(axis=0);x=p-a;y=q-b
    if np.linalg.matrix_rank(x,tol=1e-10)<2 or np.linalg.matrix_rank(y,tol=1e-10)<2:raise ValueError('Contour is degenerate')
    u,_,vt=np.linalg.svd(x.T@y);fix=np.eye(3);fix[2,2]=np.linalg.det(vt.T@u.T);r=vt.T@fix@u.T
    m=np.eye(4);m[:3,:3]=r;m[:3,3]=b-r@a
    return m,float(np.linalg.norm(p@r.T+m[:3,3]-q,axis=1).max())
