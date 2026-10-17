import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const run='art-factory/rts/runs/work-cast/2026-10-11-v2',out=run+'/qa/moving';
await mkdir(out,{recursive:true});
const sha=(data:Buffer)=>createHash('sha256').update(data).digest('hex');
const sources=await Promise.all(['src/scripts/games/rts/models.ts','src/scripts/games/rts/cast-locomotion.ts','art-factory/rts/tools/work_cast_scene.ts',import.meta.filename].map(async path=>({path,sha256:sha(await readFile(path))})));
const browser=await chromium.launch({channel:'chromium',headless:true});
const units:any[]=[],errors:string[]=[];
try{
  for(const unit of ['priest','commander']){
    const page=await browser.newPage({viewport:{width:1500,height:850}});page.on('pageerror',e=>errors.push(e.message));
    const buffers=await Promise.all([0,1].map(lod=>readFile(`${run}/candidate/${unit}-lod${lod}.glb`)));
    await page.route('**/assets/games/rts/models/*.glb',r=>r.fulfill({contentType:'model/gltf-binary',body:buffers[r.request().url().includes('-lod1')?1:0]}));
    await page.route('**/rts-work-cast-review?*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script><script type="module" src="/art-factory/rts/tools/work_cast_scene.ts"></script>'}));
    await page.goto(`http://127.0.0.1:4321/rts-work-cast-review?unit=${unit}`);await page.waitForFunction(()=>!!(window as any).workCastAudit);
    const sweep=await page.evaluate(()=>(window as any).workCastAudit.movingSweep());
    const pictures=[];
    for(const kind of unit==='priest'?['heal']:['cleave','mend','banner'])for(const phase of [.25,.75]){
      const state=await page.evaluate(({kind,phase})=>(window as any).workCastAudit.moving(kind,phase,.3),{kind,phase});
      const file=`${out}/${unit}-${kind}-${phase}.png`;await page.screenshot({path:file});pictures.push({file,kind,phase,state});
    }
    units.push({unit,assets:buffers.map((b,lod)=>({lod,sha256:sha(b)})),sweep,pictures});await page.close();
  }
  const failures=units.flatMap(u=>u.sweep.filter((s:any)=>s.lowest<-.015||s.boundsExcess>.001).map((s:any)=>({unit:u.unit,...s})));
  const report={status:failures.length||errors.length?'fail':'pass',runtime_publish_allowed:false,sources,units,failures,errors};
  await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,units:units.map(u=>({unit:u.unit,sweep:u.sweep})),failures,errors},null,2));
  if(report.status!=='pass')process.exitCode=1;
}finally{await browser.close();}
