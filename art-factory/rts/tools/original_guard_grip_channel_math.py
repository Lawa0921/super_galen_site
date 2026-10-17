"""Fit only the exposed handle ends in the original generated grip study."""
import numpy as np

def unchanged_coordinate_count(reference,candidate):
    keys={tuple(point) for point in np.asarray(candidate)}
    return sum(tuple(point) in keys for point in np.asarray(reference))

def area_counts(areas):
    values=np.asarray(areas,dtype=np.float64)
    return {"zero_area_faces":int(np.sum(values==0)),
            "micro_faces_below_1e_14_m2":int(np.sum(values<1e-14))}

def fit_handle_axis(vertices):
    vertices=np.asarray(vertices,dtype=np.float64)
    centers=[]; samples=[]
    for height in [.015,.04,.29,.315]:
        points=vertices[(np.abs(vertices[:,2]-height)<.003)&(vertices[:,0]>.03)]
        if len(points)<48: raise ValueError("Insufficient exposed handle sections")
        xy=points[:,:2]
        fit=np.linalg.lstsq(np.column_stack((2*xy,np.ones(len(xy)))),np.sum(xy*xy,axis=1),rcond=None)[0]
        radius=np.linalg.norm(xy-fit[:2],axis=1)
        if np.quantile(np.abs(radius-np.median(radius)),.95)>.0015:
            raise ValueError("Exposed handle section is not circular enough")
        centers.append([*fit[:2],float(np.mean(points[:,2]))]); samples.append(points)
    centers=np.asarray(centers)
    coefficients=np.linalg.lstsq(np.column_stack((centers[:,2],np.ones(4))),centers[:,:2],rcond=None)[0]
    origin=np.array([*(coefficients[0]*.17+coefficients[1]),.17])
    direction=np.array([*coefficients[0],1.]); direction/=np.linalg.norm(direction)
    samples=np.concatenate(samples); delta=samples-origin
    radial=np.linalg.norm(delta-np.outer(delta@direction,direction),axis=1)
    if radial.max()>np.median(radial)*1.2: raise ValueError("Handle fit contains an off-axis outlier")
    return {"origin":origin.tolist(),"direction":direction.tolist(),
            "radius":float(radial.max()+.0005),"median_radius":float(np.median(radial)),
            "clearance":.0005,"sample_count":len(samples),"section_centers":centers.tolist()}
