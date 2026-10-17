"""Stage a review batch with exact candidate provenance. No runtime writes."""
import hashlib,json,shutil,os
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
BASE=ROOT/'art-factory/rts/runs/all-models/2026-10-14-v1'
REV=ROOT/'art-factory/rts/runs/visual-revision'
RUN=Path(os.environ['RTS_BATCH_RUN']) if 'RTS_BATCH_RUN' in os.environ else REV/'2026-10-16-complete-v1'
REPLACEMENTS={
 'worker':'2026-10-16-worker-material-v1','guard':'2026-10-16-unit-bounds-v1',
 'crossbow':'2026-10-16-crossbow-motion-v5','priest':'2026-10-16-anatomical-grips-v1',
 'commander':'2026-10-16-anatomical-motion-v3','neutral-raider':'2026-10-16-raider-fullbody-v1',
 'knight':'2026-10-16-knight-material-alias-v1','stone-bridge':'2026-10-16-bridge-v1',
 'rock':'2026-10-16-rock-surface-v5','gold-mine':'2026-10-16-rock-surface-v5',
 'bolt':'2026-10-16-projectile-v2','heavy-bolt':'2026-10-16-projectile-v2'}
def main():
 manifest=json.loads((BASE/'review-manifest.json').read_text());rows=[]
 (RUN/'candidate').mkdir(parents=True,exist_ok=True);(RUN/'qa').mkdir(exist_ok=True)
 for asset,entry in manifest['assets'].items():
  for key in ('url','lod1'):
   if key not in entry:continue
   name=entry[key].split('/')[-1];source=(REV/REPLACEMENTS[asset] if asset in REPLACEMENTS else BASE)/'candidate'/name
   if asset not in REPLACEMENTS and not source.is_file():source=ROOT/'public'/entry[key].lstrip('/')
   assert source.is_file(),source;target=RUN/'candidate'/name;shutil.copy2(source,target)
   sha=hashlib.sha256(target.read_bytes()).hexdigest();assert sha==hashlib.sha256(source.read_bytes()).hexdigest()
   rows.append({'id':asset,'lod':int(key=='lod1'),'file':str(target.relative_to(ROOT)).replace('\\','/'),'source':str(source.relative_to(ROOT)).replace('\\','/'),'sha256':sha,'bytes':target.stat().st_size})
 (RUN/'review-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 (RUN/'batch-provenance.json').write_text(json.dumps({'models':len(manifest['assets']),'files':rows,'runtime_publish_allowed':False,'whole_batch_complete':False,'user_art_approval':False},indent=2)+'\n')
 print(json.dumps({'models':len(manifest['assets']),'glbs':len(rows),'bytes':sum(r['bytes'] for r in rows)}))
if __name__=='__main__':main()
