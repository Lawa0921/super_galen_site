import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {auditBoundsGlb} from './original_guard_bounds_qa.mjs';
const run='art-factory/rts/runs/work-cast/2026-10-11-v2',out=run+'/qa/diagnosis';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chromium',headless:true});
const results:any[]=[];
try{
 for(const unit of ['worker','priest','commander']){
  const page=await browser.newPage({viewport:{width:1500,height:850}});
  const buffers=await Promise.all([0,1].map(lod=>readFile(`${run}/candidate/${unit}-lod${lod}.glb`)));
  await page.route('**/assets/games/rts/models/*.glb',r=>r.fulfill({contentType:'model/gltf-binary',body:buffers[r.request().url().includes('-lod1')?1:0]}));
  await page.route('**/rts-work-cast-review?*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script><script type="module" src="/art-factory/rts/tools/work_cast_scene.ts"></script>'}));
  await page.goto(`http://127.0.0.1:4321/rts-work-cast-review?unit=${unit}`);await page.waitForFunction(()=>!!(window as any).workCastAudit);
  const names=await page.evaluate(()=>(window as any).workCastAudit.clips);
  const bounds=[];
  for(const lod of [0,1])bounds.push(await page.evaluate(auditBoundsGlb,{url:`http://127.0.0.1:4321/assets/games/rts/models/${unit}${lod?'-lod1':''}.glb`,expectedClips:names}));
  const sweep=await page.evaluate(()=>(window as any).workCastAudit.sweep());
  const clip=unit==='worker'?'Mine':unit==='priest'?'Cast':'CastCleave';
  const pictures=[];
  for(const [id,name,fraction,options] of [['idle','Idle',0,{}],['cast',clip,.5,{}],['no-cull',clip,.5,{cull:false}],['double-side',clip,.5,{doubleSide:true}],['side',clip,.5,{camera:[-10,6,-8]}]] as const){
   const materials=await page.evaluate(options=>(window as any).workCastAudit.diagnose(options),options);
   const state=await page.evaluate(({name,fraction})=>(window as any).workCastAudit.render(name,fraction),{name,fraction});
   const file=`${out}/${unit}-${id}.png`;await page.screenshot({path:file});pictures.push({id,file,state,materials});
  }
  results.push({unit,assets:buffers.map((b,lod)=>({lod,sha256:createHash('sha256').update(b).digest('hex')})),bounds,sweep,pictures});await page.close();
 }
 await writeFile(out+'/report.json',JSON.stringify(results,null,2)+'\n');
 const failures=results.flatMap(r=>r.sweep.filter((s:any)=>s.clip!=='Death'&&(s.lowest<-.015||s.boundsExcess>.001||r.unit==='priest'&&s.clip==='Cast'&&s.maxStaffTilt>2)).map((s:any)=>({unit:r.unit,...s})));
 await writeFile(out+'/ground.json',JSON.stringify({status:failures.length?'fail':'pass',runtime_publish_allowed:false,failures,units:results.map(r=>({unit:r.unit,assets:r.assets,clips:r.sweep}))},null,2)+'\n');
 if(failures.length)process.exitCode=1;
 console.log(JSON.stringify(results.map(r=>({unit:r.unit,bounds:r.bounds.map((b:any)=>({status:b.status,errors:b.errors,nodes:b.sourceNodes.map((n:any)=>({name:n.nodeName,excess:n.maxOutsideDistanceM,missing:!n.declaredBoundsValid}))})),draws:r.pictures.map((p:any)=>[p.id,p.state.draws])})),null,2));
}finally{await browser.close();}
