"""Guard publication with strict budget, source/export parity and real-contact gates."""
from pathlib import Path
import argparse,json,math,hashlib
import publish_original_guard as base


def lod_number(value):
    if value in (0,'lod0'):return 0
    if value in (1,'lod1'):return 1
    raise ValueError('Unknown LOD label')

def rows_by_lod(rows):
    if not isinstance(rows,list) or len(rows)!=2:raise ValueError('Both LOD hashes required')
    result={lod_number(row.get('lod')):row for row in rows}
    if len(result)!=2:raise ValueError('Duplicate LOD hash')
    return result

def finite_within(value,maximum):
    return type(value) in (int,float) and math.isfinite(value) and 0<=value<=maximum

def validate_additional_gates(assets,structure,parity,contact):
    expected={l:r['sha256'] for l,r in rows_by_lod(assets).items()}
    for name,rows in [('structure',structure.get('lods')),('parity',parity.get('lods')),('contact',contact.get('sourceAssets'))]:
        if {l:r.get('sha256') for l,r in rows_by_lod(rows).items()}!=expected:raise ValueError(name+' hash differs from exact candidate')
    for lod,row in rows_by_lod(structure['lods']).items():
        triangles=row.get('triangles')
        if type(triangles)!=int or not ((0<triangles<20000) if lod==0 else (7000<=triangles<=10000)):raise ValueError('Production triangle budget failed')
    if parity.get('status')!='pass':raise ValueError('Source/export parity failed')
    for row in parity['lods']:
        if not finite_within(row.get('maxErrorM'),1e-4) or not finite_within(row.get('maxBoneMatrixError'),1e-4):raise ValueError('Strict geometry/bone parity failed')
    cases=contact.get('cases',[])
    if contact.get('status')!='pass' or len(cases)!=4 or {(r.get('lod'),r.get('groupMode')) for r in cases}!={(l,g) for l in (0,1) for g in (False,True)}:raise ValueError('Real-contact 1v1/group/LOD coverage incomplete')
    for case in cases:
        count=4 if case['groupMode'] else 1
        if case.get('passed') is not True or case.get('missingAttackers')!=[]:raise ValueError('Not every attacker exercised actual contact')
        gaps=case.get('surfaceGaps',[])
        if len(gaps)<count or not all(finite_within(v,.001) for v in gaps):raise ValueError('Damage before physical contact')
        authored=case.get('authoredContacts',[])
        if len(authored)!=count or not all(finite_within(r.get('gap'),.001) for r in authored):raise ValueError('Missing or failed authored-contact pose')
        clearance=case.get('minFootClearance')
        if type(clearance) not in (float,int) or not math.isfinite(clearance) or clearance < -1e-6:raise ValueError('Overlapping melee feet')

def preflight(run):
    run=Path(run).resolve();checked=base.preflight(run)
    read=lambda n:json.loads((run/'qa'/n).read_text(encoding='utf-8'))
    validate_additional_gates(checked['assets'],read('runtime-structure.json'),read('three-pose-parity.json'),read('motion-contact-acceptance.json'))
    return checked

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--run',type=Path,required=True);parser.add_argument('--publish',action='store_true');args=parser.parse_args()
    checked=preflight(args.run)
    if args.publish:result=base.publish(args.run)
    else:result={'status':'preflight-passed','dry_run':True,'assets':checked['assets'],'writes':[]}
    print(json.dumps(result,indent=2))
