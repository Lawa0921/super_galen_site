"""Finite constrained-inner-surface experiment, with the outer held unchanged."""
import hashlib,json
from pathlib import Path
import numpy as np
from scipy.optimize import linprog,minimize,LinearConstraint
from local_shell_offset import miter_offsets

ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-guard-arm-local-shell/2026-10-05'
SOURCE=ROOT/'art-factory/rts/runs/original-guard-arm-articulation/2026-10-05/candidate/original-guard-arm-articulation.json'


def main():
    data=json.loads(SOURCE.read_text(encoding='utf8'));parts={}
    neighborhoods={
        'UpperArmArmor':[(range(4),range(8,15))],
        'ForearmArmor':[(range(4),range(5,12))],
        'FlexibleElbowSleeve':[(range(3),range(0,5)),(range(5),range(24,29))],
    }
    for name,patches in neighborhoods.items():
        component=data['components'][name];v=np.asarray(component['vertices']);f=np.asarray(component['faces'])
        count=len(v)//2;rows=len(component['stations']);width=count//rows;outer=v[:count].copy()
        faces=f[np.all(f<count,axis=1)]
        indices=sorted({row*width+column for rr,cc in patches for row in rr for column in cc})
        solved=[];failed=[]
        for index in indices:
            try:
                offset=miter_offsets(outer,faces,[index],.002,.006)[index]
                v[count+index]=outer[index]+offset
                solved.append({'vertex':index,'row':index//width,'column':index%width,'displacement_m':float(np.linalg.norm(offset))})
            except ValueError as error:
                incident=faces[np.any(faces==index,axis=1)]
                n=np.cross(outer[incident[:,1]]-outer[incident[:,0]],outer[incident[:,2]]-outer[incident[:,0]])
                n/=np.linalg.norm(n,axis=1)[:,None]
                linear=linprog(np.zeros(3),A_ub=np.concatenate([n,-n]),
                    b_ub=np.r_[np.full(len(n),-.75),np.full(len(n),1.25)],bounds=[(None,None)]*3,method='highs')
                evidence={'linear_feasibility_status':int(linear.status),'linear_message':linear.message}
                if linear.success:
                    minimum=minimize(lambda d:np.dot(d,d),linear.x,jac=lambda d:2*d,method='SLSQP',
                        constraints=LinearConstraint(n,-1.25,-.75),options={'ftol':1e-12,'maxiter':120})
                    evidence.update(minimum_norm_success=bool(minimum.success),
                        minimum_displacement_m=float(np.linalg.norm(minimum.x)*.002),
                        normal_projections=(n@minimum.x).tolist())
                failed.append({'vertex':index,'row':index//width,'column':index%width,'reason':str(error),
                    'independent_feasibility_check':evidence})
        assert np.array_equal(v[:count],outer)
        parts[name]={'attempted_vertices':len(indices),'solved':solved,'infeasible':failed,'outer_unchanged':True}
        component['vertices']=v.tolist()
    feasible=all(not part['infeasible'] for part in parts.values())
    report={'status':'local_constraint_candidate_pending_surface_qa' if feasible else 'qa_failed_infeasible_local_thickness',
        'runtime_publish_allowed':False,'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'tools_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__),Path(__file__).with_name('local_shell_offset.py')]},
        'target_thickness_m':.002,'incident_normal_bounds_m':[.0015,.0025],'max_displacement_m':.006,
        'components':parts,'non_claim':'Local feasible constraints are not full-surface or posed collision acceptance.'}
    (RUN/'qa').mkdir(parents=True,exist_ok=True)
    (RUN/'qa/local-offset.json').write_bytes((json.dumps(report,indent=2)+'\n').encode('utf8'))
    if feasible:
        data.update(status='candidate_pending_surface_qa',runtime_publish_allowed=False)
        (RUN/'candidate').mkdir(exist_ok=True)
        (RUN/'candidate/local-offset.json').write_bytes((json.dumps(data,indent=2)+'\n').encode('utf8'))
    print(json.dumps({'status':report['status'],'parts':{k:{'solved':len(v['solved']),'infeasible':len(v['infeasible'])} for k,v in parts.items()}}))


if __name__=='__main__':main()
