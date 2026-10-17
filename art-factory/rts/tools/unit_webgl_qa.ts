/** Usage: node node_modules/tsx/dist/cli.mjs <this> RUN_DIR FILE_STEM [neutral]
 * Uses RTS_BASE_URL (default port 4321). Routes only this isolated page.
 */
import {chromium,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const [run,stem,neutral]=process.argv.slice(2);
if(!run||!stem)throw new Error('Expected run directory and model filename stem');
const root=path.resolve(run);
// Freeze both files for this review so a concurrent rebuild cannot change a
// route halfway through capture. Publication must match these exact hashes.
const buffers=await Promise.all([0,1].map(lod=>readFile(path.join(root,'candidate',`${stem}-lod${lod}.glb`))));
const sourceAssets=buffers.map((bytes,lod)=>({lod,path:`candidate/${stem}-lod${lod}.glb`,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}));
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--enable-gpu','--force_high_performance_gpu']});
try{
  const page=await browser.newPage({viewport:{width:1500,height:850}});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&message.text().includes('THREE'))errors.push(message.text());});
  await page.route('**/rts-art-audit',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><script type="module" src="/art-factory/rts/tools/unit_webgl_scene.ts"></script></body></html>'}));
  await page.route('**/rts-qa-*.glb',route=>route.fulfill({contentType:'model/gltf-binary',body:buffers[route.request().url().includes('high')?0:1]}));
  await page.goto(`${process.env.RTS_BASE_URL??'http://127.0.0.1:4321'}/rts-art-audit`);
  await page.waitForFunction(()=>!!(window as any).artAudit);
  const initial=await page.evaluate(()=>({details:(window as any).artAudit.details(),clips:(window as any).artAudit.clips,lowClips:(window as any).artAudit.lowClips,gpu:(window as any).artAudit.renderer()}));
  const clips=['Attack','Death','Hurt','Idle','Walk'];
  expect(initial.clips.sort()).toEqual(clips);expect(initial.lowClips.sort()).toEqual(clips);
  expect(initial.gpu.lost).toBe(false);expect(initial.gpu.draws).toBeGreaterThan(0);
  expect(initial.details.map((x:any)=>x.visible)).toEqual([[true,false],[true,false],[false,true],[false,true]]);
  if(neutral!=='neutral')expect(initial.details.map((x:any)=>x.teams)).toEqual([['28577d'],['87382d'],['28577d'],['87382d']]);
  await page.screenshot({path:path.join(root,'qa/three-idle-teams-lods.png')});
  const changed:Record<string,boolean>={};
  for(const clip of ['walk','attack','hurt','death']){
    const previous=await page.evaluate(()=>(window as any).artAudit.transforms());
    await page.evaluate(name=>(window as any).artAudit.render(name,.45),clip);
    const next=await page.evaluate(()=>(window as any).artAudit.transforms());
    changed[clip]=previous.every((item:number[],index:number)=>JSON.stringify(item)!==JSON.stringify(next[index]));
    expect(changed[clip]).toBe(true);
    await page.screenshot({path:path.join(root,`qa/three-${clip}-teams-lods.png`)});
  }
  expect(errors).toEqual([]);
  const report={status:'pass',renderer:'Three.js ModelInstance in Chromium WebGL',sourceAssets,...initial,changed,errors};
  await writeFile(path.join(root,'qa/three.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
}finally{await browser.close();}
