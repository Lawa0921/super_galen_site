// Pin the large, uncommitted lineage binaries of the published unit provenance chain.
// Walks unit-registry.json exactly like src/scripts/games/rts/unit-source-rights.test.ts (refinement hop -> source lock
// backup -> previous_versions row, bound sources, baseline sources) and writes
// art-factory/rts/manifests/unit-lineage-binaries.json with sha256, size and (for GLBs) the geometry fingerprint digest
// of every referenced file that is not tracked by git. Refuses to pin a file whose bytes disagree with the lock/binding.
// Usage: node art-factory/rts/tools/lineage_binaries_pin.mjs
import {readFileSync,writeFileSync,existsSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {glbFingerprints} from './geometry_fingerprint.ts';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const OUT='art-factory/rts/manifests/unit-lineage-binaries.json';
const json=rel=>JSON.parse(readFileSync(path.join(ROOT,rel),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const tracked=new Set(execFileSync('git',['ls-files'],{cwd:ROOT,encoding:'utf8',maxBuffer:1<<28}).split('\n'));
const registry=json('art-factory/rts/manifests/unit-registry.json');
const baseline=json('art-factory/rts/runs/all-models/2026-10-14-v1/raw/baseline-unit-registry.json');
const same=(a,b)=>a.sha256===b.sha256&&a.source===b.source&&a.source_sha256===b.source_sha256;
const wanted=new Map();// path -> {sha256, role}
const want=(rel,expected,role)=>{const prev=wanted.get(rel);if(prev&&prev.sha256!==expected)throw new Error(`${rel}: conflicting pins`);wanted.set(rel,{sha256:expected,role});};
for(const unit of ['worker','crossbow','guard'])for(const lod of [0,1]){
  const id=lod?`${unit}-lod1`:unit,entry=registry.assets.find(a=>a.id===id),base=baseline.assets.find(a=>a.id===id);
  let row=entry;
  for(let hop=0;row.model_refinement&&!same(row,base);hop++){
    if(hop>8)throw new Error('chain too long');
    const revision=row.model_refinement,binding=json(revision.source_binding),bound=binding.assets.find(a=>a.url===entry.url);
    want(bound.source,bound.source_sha256,'source');
    const locked=json(revision.source_lock).assets.find(a=>a.url===entry.url);
    want(locked.backup,locked.sha256,'backup');
    row=entry.previous_versions.find(r=>r.sha256===locked.sha256);
  }
  want(row.source,row.source_sha256,'source');
}
const files=[];
for(const [rel,{sha256,role}] of [...wanted].sort(([a],[b])=>a.localeCompare(b))){
  if(tracked.has(rel))continue;
  const file=path.join(ROOT,rel);if(!existsSync(file))throw new Error(`${rel}: not tracked and not present; cannot pin`);
  const bytes=readFileSync(file),digest=sha(bytes);
  if(digest!==sha256)throw new Error(`${rel}: bytes ${digest} disagree with the lineage record ${sha256}`);
  files.push({path:rel,sha256,bytes:statSync(file).size,role,...(rel.endsWith('.glb')?{glb_fingerprints_sha256:sha(Buffer.from(JSON.stringify(glbFingerprints(bytes))))}:{})});
}
const manifest={schema:'rts-unit-lineage-binaries/v1',
  policy:'Large lineage binaries (pre-publication backup GLBs and assembly .blend sources) stay local and are not committed. Their sha256, size and GLB geometry fingerprint digest are pinned here; unit-source-rights.test.ts verifies the chain through these pins on a clean clone and verifies the bytes against them wherever the files exist.',
  generated_by:'art-factory/rts/tools/lineage_binaries_pin.mjs',files};
writeFileSync(path.join(ROOT,OUT),JSON.stringify(manifest,null,2)+'\n');
console.log(`${OUT}: ${files.length} pinned, ${(files.reduce((s,f)=>s+f.bytes,0)/1e6).toFixed(1)} MB kept out of git`);
