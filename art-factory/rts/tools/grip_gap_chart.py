"""Conservative sampled charts: transitions stay unresolved, never get capped."""
import math
import numpy as np


def classify_layers(hits,*,owners=None,min_normal=.05,min_thickness=.00025):
    def reject(reason):return {'complete':False,'intervals':[],'reason':reason}
    if len(hits)%2:return reject('unpaired_open_boundary_or_source_tangent')
    if any(not math.isfinite(h['radius']) or h['radius']<=0 for h in hits):return reject('invalid_radius')
    if any(b['radius']<=a['radius'] for a,b in zip(hits,hits[1:])):return reject('unsorted_hits')
    intervals=[]
    for a,b in zip(hits[::2],hits[1::2]):
        if not a['normal_dot'] < -min_normal or not b['normal_dot'] > min_normal:return reject('winding_or_tangent')
        if b['radius']-a['radius']<min_thickness:return reject('thin_interval')
        if owners is not None:
            branches=[branch for branch,faces in owners.items() if a['face'] in faces['inner'] and b['face'] in faces['outer']]
            if len(branches)>1:return reject('overlapping_source_ownership')
            branch=branches[0] if branches else 'other-source'
        else:
            branch=a.get('branch')
            if not branch or branch!=b.get('branch') or a.get('surface')!='inner' or b.get('surface')!='outer':
                return reject('branch_or_surface_mismatch')
        intervals.append({'lo':a['radius'],'hi':b['radius'],'branch':branch,'faces':[a['face'],b['face']]})
    return {'complete':True,'intervals':intervals,'reason':None}


def adaptive_cells(trace,angles,heights,*,max_depth,tolerance):
    """Nine-point cells, one mandatory refinement, then refine instability twice.

    Acceptance is explicitly sampled. Both parent and child must have the same
    semantic signature and bilinear endpoint error within world-space tolerance.
    No guarantee about unsampled features or a continuous anatomical gap.
    """
    if max_depth<1 or not math.isfinite(tolerance) or tolerance<0:raise ValueError('Invalid refinement policy')
    accepted=[];unresolved=[];cache={}
    def sample(x,y):
        key=(round(x,12),round(y,12))
        if key not in cache:cache[key]=trace(x,y)
        return cache[key]
    def visit(bounds,level,parent=None):
        x0,x1,y0,y1=bounds;probes={}
        for u in (0,.5,1):
            for v in (0,.5,1):probes[u,v]=sample(x0+(x1-x0)*u,y0+(y1-y0)*v)
        values=list(probes.values());signature=values[0]['signature']
        consistent=all(p['complete'] and p['passed'] and p['signature']==signature for p in values)
        error=None
        if consistent:
            corners=[np.asarray(probes[key]['endpoints'],float) for key in ((0,0),(1,0),(1,1),(0,1))]
            error=0.
            for (u,v),probe in probes.items():
                actual=np.asarray(probe['endpoints'],float)
                if actual.size:
                    predicted=corners[0]*(1-u)*(1-v)+corners[1]*u*(1-v)+corners[2]*u*v+corners[3]*(1-u)*v
                    error=max(error,float(np.max(np.linalg.norm(actual-predicted,axis=1))))
        stable=consistent and error<=tolerance
        cell={'bounds':list(bounds),'level':level,'signature':signature if consistent else None,'error_m':error,
            'parent_error_m':parent['error_m'] if parent else None,'sampled_only':True}
        if stable and parent and parent['signature']==signature and parent['error_m'] is not None and parent['error_m']<=tolerance:
            accepted.append(cell);return
        if level==max_depth:
            cell['reason']='unresolved_transition_or_failed_probe' if not consistent else 'world_space_refinement_not_converged'
            unresolved.append(cell);return
        xm,ym=(x0+x1)/2,(y0+y1)/2
        for a,b in ((x0,xm),(xm,x1)):
            for c,d in ((y0,ym),(ym,y1)):visit((a,b,c,d),level+1,cell)
    for a,b in zip(angles,angles[1:]):
        for c,d in zip(heights,heights[1:]):visit((a,b,c,d),0)
    return {'accepted':accepted,'unresolved':unresolved,'unique_samples':len(cache)}


def assess_coverage(accepted,branches):
    counts={branch:sum(c['signature']==[[branch],[branch]] for c in accepted) for branch in branches}
    air=sum(c['signature']==[[],[]] for c in accepted)
    missing=[branch for branch,count in counts.items() if count==0]
    return {'passed':not missing and air>0,'accepted_by_branch':counts,'sampled_air_cells':air,
        'missing_branches':missing,'other_accepted_cells':len(accepted)-air-sum(counts.values())}
