"""Root-only harmonic binding on the actual original glove mesh."""
import json
from pathlib import Path
import numpy as np
from scipy.sparse import csr_matrix
from scipy.sparse.linalg import spsolve
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-glove-joints/2026-10-07-v2'
PREVIOUS=RUN.parent/'2026-10-07-v1'
NAMES=['Hand_L','Index1_L','Middle1_L','Ring1_L','Little1_L','Thumb1_L']

def harmonic_fields(points,faces,anchors):
    """Positive inverse-edge Laplacian with exact boundary conditions."""
    points=np.asarray(points,float);edges=set()
    for f in faces:
        for a,b in zip(f,f[1:]+f[:1]):edges.add(tuple(sorted((a,b))))
    row=[];col=[];values=[];diagonal=np.zeros(len(points))
    for a,b in sorted(edges):
        length=np.linalg.norm(points[a]-points[b]);assert length>1e-10
        weight=1/length;row.extend([a,b]);col.extend([b,a]);values.extend([-weight,-weight]);diagonal[a]+=weight;diagonal[b]+=weight
    row.extend(range(len(points)));col.extend(range(len(points)));values.extend(diagonal)
    lap=csr_matrix((values,(row,col)),shape=(len(points),len(points)))
    fixed=np.array(sorted(anchors));free=np.array(sorted(set(range(len(points)))-set(fixed)))
    result=np.zeros((len(points),len(next(iter(anchors.values())))))
    result[fixed]=[anchors[i] for i in fixed]
    if len(free):result[free]=spsolve(lap[free][:,free],-lap[free][:,fixed]@result[fixed])
    assert np.isfinite(result).all() and result.min()>-1e-8
    result=np.maximum(result,0);result/=result.sum(axis=1)[:,None]
    return result

def main():
    binding=json.loads((RUN/'raw/original-binding.json').read_text());surface=json.loads((PREVIOUS/'raw/joint-surface.json').read_text());points=np.array(surface['vertices']);anchors={}
    def fixed(i,name):anchors[i]=[float(n==name) for n in NAMES]
    for i,(p,tag,weights) in enumerate(zip(points,surface['tags'],binding['weights'])):
        if tag in surface['digits'] and p[2]>=surface['digits'][tag]['joint_guides_z'][0]-1e-6:fixed(i,tag+'1_L')
        elif sum(w for n,w in weights.items() if n.startswith('Thumb'))>.995:fixed(i,'Thumb1_L')
        elif p[2]<-.46:fixed(i,'Hand_L')
    fields=harmonic_fields(points,surface['faces'],anchors)
    result=[];discarded=0
    for old,field in zip(binding['weights'],fields):
        distal={k:v for k,v in old.items() if k[-3] in ['2','3']}
        residual=max(0.,1-sum(distal.values()));slots=4-len(distal)
        entries=sorted(zip(NAMES,field),key=lambda x:x[1],reverse=True)[:slots]
        total=sum(w for _,w in entries);assert total>0
        weights={**distal,**{k:residual*w/total for k,w in entries if residual*w/total>1e-9}}
        assert len(weights)<=4 and abs(sum(weights.values())-1)<1e-6
        result.append(weights)
    report={'method':'Intrinsic positive harmonic root fields, hard anchors from actual PIP rings distally, thumb distal region and wrist. Proximal finger/web remains continuous instead of forcing separate port ownership. Existing distal weights retained; residual root mass limited to remaining four-weight slots.','source_sha256':binding['source_sha256'],'anchors':len(anchors),'weights':result,'runtime_publish_allowed':False}
    (RUN/'raw/root-weights.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'anchors':len(anchors),'vertices':len(result)}))
if __name__=='__main__':main()
