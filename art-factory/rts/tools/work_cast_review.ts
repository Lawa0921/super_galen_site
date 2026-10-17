/** Candidate-only WebGL pose review; routes never modify the runtime files. */
import {chromium,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const run='art-factory/rts/runs/work-cast/2026-10-11-v2';
const clips:Record<string,string[]>={worker:['Mine','Chop','Build'],priest:['Cast'],commander:['CastCleave','CastMend','CastBanner']};
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--enable-gpu','--force_high_performance_gpu']});
const report:any[]=[];
try{
  for(const [unit,names] of Object.entries(clips)){
    const page=await browser.newPage({viewport:{width:1500,height:850}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    const buffers=await Promise.all([0,1].map(lod=>readFile(`${run}/candidate/${unit}-lod${lod}.glb`)));
    await page.route('**/assets/games/rts/models/*.glb',route=>route.fulfill({contentType:'model/gltf-binary',body:buffers[route.request().url().includes('-lod1')?1:0]}));
    await page.route('**/rts-work-cast-review?*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><script type="module" src="/art-factory/rts/tools/work_cast_scene.ts"></script></body></html>'}));
    await page.goto(`${process.env.RTS_BASE_URL??'http://127.0.0.1:4321'}/rts-work-cast-review?unit=${unit}`);
    await page.waitForFunction(()=>!!(window as any).workCastAudit);
    const rows:any[]=[];await mkdir(`${run}/qa/${unit}`,{recursive:true});
    for(const name of names){
      const poses:any[]=[];
      for(const fraction of [0,.25,.5,.75,1]){
        const state=await page.evaluate(({name,fraction})=>(window as any).workCastAudit.render(name,fraction),{name,fraction});
        expect(state.contextLost).toBe(false);expect(state.draws).toBeGreaterThan(0);
        expect(state.samples.map((s:any)=>s.visible)).toEqual([[true,false],[true,false],[false,true],[false,true]]);
        const file=`${run}/qa/${unit}/${name}-${Math.round(fraction*100)}.png`;await page.screenshot({path:file});
        poses.push({fraction,file,...state});
      }
      expect(poses[2].samples[0].pose).not.toEqual(poses[0].samples[0].pose);
      rows.push({clip:name,poses});
    }
    expect(errors).toEqual([]);report.push({unit,assets:buffers.map((b,lod)=>({lod,sha256:createHash('sha256').update(b).digest('hex')})),rows,errors});
    await page.close();
  }
  await writeFile(`${run}/qa/webgl.json`,JSON.stringify({status:'captured-not-approved',runtime_publish_allowed:false,units:report},null,2)+'\n');
  console.log(JSON.stringify(report.map(r=>({unit:r.unit,clips:r.rows.map((c:any)=>({name:c.clip,maxBoundsExcess:Math.max(...c.poses.flatMap((p:any)=>p.samples.map((s:any)=>s.largestExcess))),lowest:Math.min(...c.poses.flatMap((p:any)=>p.samples.map((s:any)=>s.lowest)))})),errors:r.errors}))));
}finally{await browser.close();}
