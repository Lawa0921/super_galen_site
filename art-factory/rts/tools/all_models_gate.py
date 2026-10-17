"""Inventory-wide browser evidence gate; baseline must expose real defects."""
import json,sys
from pathlib import Path
RUN=Path(__file__).resolve().parents[3]/'art-factory/rts/runs/all-models/2026-10-14-v1'
UNITS={'worker','guard','crossbow','priest','knight','siege','commander','neutral-raider'}
def floor_failure(sweep):
    if sweep['lowest']<-.005:return 'Visible unit geometry crosses the ground beyond 5 mm'
    if sweep['clip']=='Idle' and sweep['lowest']>.03:return 'Idle unit floats more than 3 cm above the ground'
    return None

def main():
    phase=sys.argv[1] if len(sys.argv)>1 else 'final'
    report=json.loads((RUN/f'qa/{phase}/browser.json').read_bytes());failures=[]
    assert len(report['rows'])==34 and not report['errors']
    for row in report['rows']:
        if row['id'] not in UNITS:continue
        assert len(row['sweep'])==len(row['data']['clips'])*2
        for sweep in row['sweep']:
            reason=floor_failure(sweep)
            if reason:failures.append({'id':row['id'],'lod':sweep['lod'],'clip':sweep['clip'],'lowest':sweep['lowest'],'reason':reason})
    result={'status':'failed' if failures else 'passed','checked_models':34,'unit_clip_lod_sweeps':sum(len(r['sweep']) for r in report['rows']),'failures':failures}
    (RUN/f'qa/{phase}/floor-gate.json').write_bytes((json.dumps(result,indent=2)+'\n').encode());print(json.dumps(result))
    assert not failures,'Full-model floor acceptance failed'
if __name__=='__main__':main()
