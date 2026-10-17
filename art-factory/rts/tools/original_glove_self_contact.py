"""Vectorized separating-axis margin for actual hand triangle pairs."""
import numpy as np
def triangle_pair_gaps(points,faces,pairs):
    if len(pairs)==0:return np.empty(0)
    triangles=np.asarray(points)[np.asarray(faces)[np.asarray(pairs)]]
    a,b=triangles[:,0],triangles[:,1]
    ea=np.roll(a,-1,axis=1)-a;eb=np.roll(b,-1,axis=1)-b
    na=np.cross(ea[:,0],ea[:,1]);nb=np.cross(eb[:,0],eb[:,1])
    axes=np.concatenate([na[:,None],nb[:,None],np.cross(ea[:,:,None],eb[:,None,:]).reshape(-1,9,3),np.cross(na[:,None],ea),np.cross(nb[:,None],eb)],axis=1)
    norms=np.linalg.norm(axes,axis=2);valid=norms>1e-12;axes=axes/np.maximum(norms[:,:,None],1e-12)
    pa=np.einsum('nvc,nac->nav',a,axes);pb=np.einsum('nvc,nac->nav',b,axes)
    gaps=np.maximum(pa.min(axis=2)-pb.max(axis=2),pb.min(axis=2)-pa.max(axis=2))
    gaps[~valid]=-np.inf
    return gaps.max(axis=1)
