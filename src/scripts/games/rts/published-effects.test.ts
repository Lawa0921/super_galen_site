import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {validateModelManifest} from './models';

const root=path.resolve(__dirname,'../../../..');
const read=(file:string)=>JSON.parse(readFileSync(path.join(root,file),'utf8'));
const ATLAS_SHA='b40154d5083a20264a8301cf56417cc4060beea0d6e728df82aa02dd8ec5e21e';
const URL='/assets/games/rts/effects/building-effects-atlas.png';

describe('published building FX atlas',()=>{
  it('is registered in the runtime model registry and passes the manifest boundary',()=>{
    const registry=read('public/assets/games/rts/model-registry.json');
    expect(()=>validateModelManifest(registry)).not.toThrow();
    expect(registry.effects?.building).toEqual({url:URL,status:'published'});
  });
  it('ships the exact approved candidate bytes and is declared in an audited factory registry',()=>{
    const file=path.join(root,'public',URL);expect(existsSync(file)).toBe(true);
    const bytes=readFileSync(file);expect(createHash('sha256').update(bytes).digest('hex')).toBe(ATLAS_SHA);expect(bytes.length).toBe(44966);
    const profile=read('art-factory/rts/profile.json') as {registries:string[]};
    const entries=profile.registries.flatMap(r=>(read('art-factory/rts/'+r).assets??[]) as Array<Record<string,unknown>>).filter(a=>(a.runtime??a.url)===URL);
    expect(entries).toHaveLength(1);expect(entries[0]).toMatchObject({status:'published',sha256:ATLAS_SHA,runtime_publish_allowed:true});
    expect(String(entries[0].visual_review)).toContain('qa/visual-review.json');
  });
  const delivery='art-factory/rts/runs/building-effects/2026-10-09-v1/delivery-manifest.json';
  const hasEvidence=existsSync(path.join(root,delivery));
  it.skipIf(!hasEvidence)('was allowed by its delivery manifest'+(hasEvidence?'':' (skipped: local-only art-factory/rts/runs/ evidence is absent from this checkout)'),()=>{
    expect(read(delivery).runtime_publish_allowed).toBe(true);
  });
});
