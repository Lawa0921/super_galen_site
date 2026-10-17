"""Runtime download regression check, excluding unchanged external textures."""
import gzip,json
from pathlib import Path
RUN=Path(__file__).resolve().parents[3]/'art-factory/rts/runs/commander-grip/2026-10-14-v1'
def main():
    rows=[]
    for lod in (0,1):
        old=(RUN/f'raw/before/commander-lod{lod}.glb').read_bytes();new=(RUN/f'candidate/commander-lod{lod}.glb').read_bytes()
        row={'lod':lod,'before_bytes':len(old),'after_bytes':len(new),'before_gzip':len(gzip.compress(old,mtime=0)),'after_gzip':len(gzip.compress(new,mtime=0))};rows.append(row)
        assert row['after_bytes']<=row['before_bytes']*1.08,row
        assert row['after_gzip']<=row['before_gzip']*1.08,row
    report={'status':'passed','max_growth_ratio':1.08,'assets':rows};(RUN/'qa/download-budget.json').write_bytes((json.dumps(report,indent=2)+'\n').encode());print(json.dumps(report))
if __name__=='__main__':main()
