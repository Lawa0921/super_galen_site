"""Connected high-poly patch repair with a position-fixed boundary collar."""
import numpy as np
from scipy.sparse import coo_matrix,diags,eye
from scipy.sparse.csgraph import connected_components
from scipy.sparse.linalg import spsolve

def fair_patch(points,faces,roi):
    points=np.asarray(points,dtype=float);faces=np.asarray(faces,dtype=int)
    roi=np.asarray(roi,dtype=bool)
    if not roi.any():raise ValueError('empty patch')
    edges=np.concatenate([faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]])
    edges=np.unique(np.sort(edges,axis=1),axis=0)
    a,b=edges.T
    graph=coo_matrix((np.ones(len(edges)*2),(np.r_[a,b],np.r_[b,a])),shape=(len(points),len(points))).tocsr()
    degree=np.asarray(graph.sum(axis=1)).ravel()
    roi_indices=np.flatnonzero(roi)
    roi_components,_=connected_components(graph[roi_indices][:,roi_indices],directed=False)
    if roi_components!=1:raise ValueError(f'patch has {roi_components} disconnected ROI components')
    # Freeze the first inner ring as well as the whole exterior. Do not select
    # by normal direction: steep fold walls are part of the connected patch.
    collar=roi&((graph@(~roi).astype(float))>0)
    free=roi&~collar
    if not free.any():raise ValueError('empty patch interior')
    indices=np.flatnonzero(free)
    components,_=connected_components(graph[indices][:,indices],directed=False)
    if components!=1:raise ValueError(f'patch has {components} disconnected interiors')
    lap=eye(len(points),format='csr')-diags(1/np.maximum(degree,1))@graph
    operator=lap[:,indices]
    # Minimize squared Laplacian in XYZ with fixed boundary vertices. Including
    # the collar rows penalizes bending at the transition. This is not an exact
    # normal or first-derivative constraint; visual continuity needs inspection.
    fixed=points.copy();fixed[free]=0
    matrix=(operator.T@operator).tocsc()
    rhs=-operator.T@(lap@fixed)
    result=points.copy();result[free]=spsolve(matrix,rhs)
    if not np.isfinite(result).all():raise ValueError('non-finite fairing result')
    return result,{'components':int(components),'roi_components':int(roi_components),'free_vertices':int(free.sum()),
        'collar_vertices':int(collar.sum()),'free_mask':free,
        'max_displacement':float(np.linalg.norm(result-points,axis=1).max()),
        'relative_linear_residual':float(np.linalg.norm(matrix@result[free]-rhs)/max(np.linalg.norm(rhs),1e-12))}
