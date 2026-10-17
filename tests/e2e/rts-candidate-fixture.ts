/** Renderer/input integration fixture only. Candidate art is never published.
 * Shared unit meshes here do not verify final unit art or silhouettes.
 */
import type {Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {OrthographicCamera,Vector3} from 'three';
import {REQUIRED_MODELS} from '../../src/scripts/games/rts/models';

const buildingIds=new Set(['townhall','townhall-tier2','townhall-tier3','house','barracks','lumbermill','forge','altar','tower','chapel','stable','workshop','stone-bridge']);
const propIds=new Set(['oak','rock','gold-mine','timber-pile']);
export async function candidateArtFixture(page:Page){
  const candidateDir=path.resolve('art-factory/rts/runs/kingdom-buildings/2026-10-04-v2/candidate');
  const guard=await readFile(path.resolve('art-factory/rts/runs/guard-pilot/2026-10-04-revision-v2/candidate/dawnrealm-guard-pilot-lod1.glb'));
  await page.route('**/assets/games/rts/model-registry.json',route=>route.fulfill({json:{assets:Object.fromEntries(REQUIRED_MODELS.map(id=>[id,{status:'published',url:`/assets/games/rts/models/${id}.glb`}])),testFixture:true}}));
  await page.route('**/assets/games/rts/models/*.glb',async route=>{
    const id=path.basename(new URL(route.request().url()).pathname,'.glb');
    if(id==='bolt'||id==='heavy-bolt'){await route.fulfill({contentType:'model/gltf-binary',body:await readFile(path.resolve('art-factory/rts/runs/projectiles/2026-10-05-v1/candidate',id+'.glb'))});return;}
    const propRun=id==='oak'?'2026-10-04-oak-v2':'2026-10-04-original';
    const body=buildingIds.has(id)?await readFile(path.join(candidateDir,id+'.glb')):propIds.has(id)?await readFile(path.resolve('art-factory/rts/runs/kingdom-props',propRun,'candidate',id+'.glb')):guard;
    await route.fulfill({contentType:'model/gltf-binary',body});
  });
}
/** Screen point (1600×1000 viewport) under the opening camera: centred on the west spawn (24,144), span 48 m. */
export function initialScreen(x:number,z:number,height=0){
  const camera=new OrthographicCamera(-38.4,38.4,24,-24,.1,250);
  camera.position.set(48,52,179);camera.lookAt(24,0,144);camera.updateProjectionMatrix();camera.updateMatrixWorld();
  const p=new Vector3(x,height,z).project(camera);return {x:(p.x+1)*800,y:(1-p.y)*500};
}
