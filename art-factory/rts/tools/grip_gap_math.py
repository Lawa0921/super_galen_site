"""Branch-aware radial air checks and inclusive triangle clearance witnesses."""
import math
import numpy as np
from original_guard_quadri_repair_math import segment_triangle_intersection


def audit_intervals(source,cage,tolerance,*,required_branches=()):
    if not math.isfinite(tolerance) or tolerance<0:raise ValueError('Invalid air tolerance')
    for row in [*source,*cage]:
        if not 0<=row['lo']<row['hi'] or not all(math.isfinite(row[k]) for k in ('lo','hi')):raise ValueError('Invalid interval')
    failures=[];maximum=0.
    for a,first in enumerate(cage):
        for b in range(a+1,len(cage)):
            second=cage[b];lo=max(first['lo'],second['lo']);hi=min(first['hi'],second['hi'])
            if hi>=lo-1e-12:
                failures.append({'cage_pair':[a,b],'reason':'cage_interval_overlap' if hi>lo+1e-12 else 'cage_interval_contact',
                    'depth':max(0.,hi-lo),'radial_witness':[lo,hi]})
    for branch in required_branches:
        count=sum(c['branch']==branch for c in cage)
        if count!=1:failures.append({'branch':branch,'reason':'required_cage_branch_count','count':count})
    for index,interval in enumerate(cage):
        overlap=lambda other:max(0.,min(interval['hi'],other['hi'])-max(interval['lo'],other['lo']))
        matches=[s for s in source if s['branch']==interval['branch'] and overlap(s)>1e-12]
        if len(matches)!=1:
            failures.append({'cage':index,'reason':'missing_or_ambiguous_source_branch'});continue
        selected=matches[0]
        intrusion=max(0.,selected['lo']-interval['lo'],interval['hi']-selected['hi']);maximum=max(maximum,intrusion)
        if intrusion>tolerance+1e-12:failures.append({'cage':index,'reason':'source_air_intrusion','depth':intrusion})
        if any(s is not selected and overlap(s)>1e-12 for s in source):failures.append({'cage':index,'reason':'other_source_solid_overlap'})
    return {'passed':not failures,'max_air_intrusion':maximum,'failures':failures}


def point_segment(point,a,b):
    vector=b-a;denom=float(vector@vector)
    t=float(np.clip((point-a)@vector/denom,0,1)) if denom>1e-30 else 0.
    return a+t*vector


def excess_contact_gap(exact_distance,sample_distances,maximum_gap):
    if any(not math.isfinite(v) or v<0 for v in [exact_distance,maximum_gap,*sample_distances]):
        raise ValueError('Expected finite nonnegative contact measurements')
    return bool(sample_distances) and exact_distance>maximum_gap and min(sample_distances)>maximum_gap


def point_triangle(point,triangle):
    a,b,c=triangle;ab=b-a;ac=c-a;normal=np.cross(ab,ac);normal2=float(normal@normal)
    if normal2>1e-30:
        projected=point-normal*float((point-a)@normal/normal2);ap=projected-a
        aa,bb,cc=float(ab@ab),float(ab@ac),float(ac@ac);denom=aa*cc-bb*bb
        if denom>1e-30:
            u=(cc*float(ap@ab)-bb*float(ap@ac))/denom;v=(aa*float(ap@ac)-bb*float(ap@ab))/denom
            if u>=0 and v>=0 and u+v<=1:return projected
    candidates=[point_segment(point,triangle[i],triangle[(i+1)%3]) for i in range(3)]
    return min(candidates,key=lambda p:float((point-p)@(point-p)))


def segment_closest(p1,q1,p2,q2):
    d1,d2,r=q1-p1,q2-p2,p1-p2;a,e=float(d1@d1),float(d2@d2)
    if a<=1e-30 and e<=1e-30:return p1,p2
    if a<=1e-30:return p1,point_segment(p1,p2,q2)
    if e<=1e-30:return point_segment(p2,p1,q1),p2
    b,c,f=float(d1@d2),float(d1@r),float(d2@r);denom=a*e-b*b
    s=float(np.clip((b*f-c*e)/denom,0,1)) if denom>1e-30 else 0.
    t=(b*s+f)/e
    if t<0:t=0.;s=float(np.clip(-c/a,0,1))
    elif t>1:t=1.;s=float(np.clip((b-c)/a,0,1))
    return p1+d1*s,p2+d2*t


def triangle_clearance(first,second):
    first,second=np.asarray(first,dtype=float),np.asarray(second,dtype=float)
    if first.shape!=(3,3) or second.shape!=(3,3) or not np.isfinite([first,second]).all():raise ValueError('Expected two finite triangles')
    combined=np.concatenate((first,second));origin=combined.min(axis=0);scale=float(np.max(np.ptp(combined,axis=0)))
    if scale<=1e-30:return {'distance':0.,'first':first[0].tolist(),'second':second[0].tolist()}
    normalized=[(first-origin)/scale,(second-origin)/scale]
    for a,b in (normalized,normalized[::-1]):
        for i in range(3):
            hit=segment_triangle_intersection(a[i],a[(i+1)%3],b)
            if hit:
                point=origin+np.asarray(hit['point'])*scale
                return {'distance':0.,'first':point.tolist(),'second':point.tolist()}
    candidates=[(p,point_triangle(p,second)) for p in first]+[(point_triangle(p,first),p) for p in second]
    candidates.extend(segment_closest(first[a],first[(a+1)%3],second[b],second[(b+1)%3]) for a in range(3) for b in range(3))
    p,q=min(candidates,key=lambda pair:float((pair[0]-pair[1])@(pair[0]-pair[1])))
    return {'distance':float(np.linalg.norm(p-q)),'first':p.tolist(),'second':q.tolist()}


def mesh_clearance(first,second,initial_pair=(0,0)):
    """Exact triangle feature distances, pruned only by conservative AABB bounds."""
    first,second=np.asarray(first,dtype=float),np.asarray(second,dtype=float)
    if first.ndim!=3 or second.ndim!=3 or first.shape[1:]!=(3,3) or second.shape[1:]!=(3,3) or not len(first) or not len(second):
        raise ValueError('Expected nonempty triangle arrays')
    if not np.isfinite(first).all() or not np.isfinite(second).all():raise ValueError('Expected finite meshes')
    i,j=initial_pair;best=triangle_clearance(first[i],second[j]);best['triangle_pair']=[int(i),int(j)];checks=1
    a_min,a_max=first.min(axis=1),first.max(axis=1);b_min,b_max=second.min(axis=1),second.max(axis=1)
    for start in range(0,len(first),128):
        if best['distance']==0:break
        delta=np.maximum(np.maximum(a_min[start:start+128,None,:]-b_max[None,:,:],b_min[None,:,:]-a_max[start:start+128,None,:]),0)
        lower=np.sqrt(np.sum(delta*delta,axis=2));indices=np.argwhere(lower<=best['distance']+1e-12)
        ordered=sorted(indices.tolist(),key=lambda pair:lower[pair[0],pair[1]])
        for local,j in ordered:
            if lower[local,j]>best['distance']+1e-12:break
            i=start+local;result=triangle_clearance(first[i],second[j]);checks+=1
            if result['distance']<best['distance']:
                best={**result,'triangle_pair':[int(i),int(j)]}
                if best['distance']==0:break
    return {**best,'triangle_pairs_evaluated':checks,'triangle_pair_count':len(first)*len(second)}
