// @vitest-environment node
/** Pinned lineage binaries: large pre-publication backup GLBs and assembly .blend sources stay local (not committed);
 *  their sha256 is pinned in a small committed manifest. Present files must match the pin; absent files resolve to the
 *  pin only when listed, so a clean clone still verifies the whole provenance chain and a forged file never passes. */
import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {resolveLineageFile,fingerprintDigest,type LineageManifest} from '../../../../art-factory/rts/tools/lineage_binaries';

const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const real=Buffer.from('backup bytes'),forged=Buffer.from('forged bytes');
const manifest:LineageManifest={schema:'rts-unit-lineage-binaries/v1',policy:'test',
  files:[{path:'runs/a/backup.glb',sha256:sha(real),bytes:real.length,role:'backup'}]};
const fs=(files:Record<string,Buffer>)=>({exists:(p:string)=>p in files,read:(p:string)=>{if(!(p in files))throw new Error('ENOENT '+p);return files[p];}});

describe('resolveLineageFile',()=>{
  it('hashes a present pinned file and reports it present',()=>{
    const r=resolveLineageFile('runs/a/backup.glb',manifest,fs({'runs/a/backup.glb':real}));
    expect(r).toMatchObject({sha256:sha(real),present:true});expect(r.bytes?.equals(real)).toBe(true);
  });
  it('resolves an absent pinned file to the pinned sha256 without bytes (clean clone)',()=>{
    const r=resolveLineageFile('runs/a/backup.glb',manifest,fs({}));
    expect(r).toEqual({path:'runs/a/backup.glb',sha256:sha(real),present:false,entry:manifest.files[0]});
  });
  it('rejects a present file whose bytes differ from the pin',()=>{
    expect(()=>resolveLineageFile('runs/a/backup.glb',manifest,fs({'runs/a/backup.glb':forged}))).toThrow(/differ from the pinned sha256/);
  });
  it('rejects an absent file that is not pinned',()=>{
    expect(()=>resolveLineageFile('runs/b/other.glb',manifest,fs({}))).toThrow(/neither present nor pinned/);
  });
  it('hashes a present unpinned (committed) file normally',()=>{
    expect(resolveLineageFile('runs/c/tracked.json',manifest,fs({'runs/c/tracked.json':forged})).sha256).toBe(sha(forged));
  });
  it('fingerprintDigest is stable and order-sensitive JSON of the fingerprints',()=>{
    expect(fingerprintDigest([{node:'a',mesh:'m',primitive:0,vertices:3,componentType:5126,sha1:'x'}])).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprintDigest([])).toBe(sha(Buffer.from('[]')));
  });
});
