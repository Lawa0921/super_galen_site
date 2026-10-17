/** Exercise candidate GLBs with the real game ModelInstance, without publishing. */
import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
const root='art-factory/rts/runs/visual-revision';
const candidates=Object.fromEntries(process.argv.slice(2).map(value=>value.split('=')));
assert(Object.keys(candidates).length,'Pass unit=run-folder arguments');
const out=process.env.RTS_REVIEW_OUT??root+'/2026-10-16-runtime-review/qa';await mkdir(out,{recursive:true});
const validator=createRequire(import.meta.url)(path.resolve('tmp/rts/handoff-20261006/validator/node_modules/gltf-validator'));
const files=new Map(),validation=[];
for(const [unit,run] of Object.entries(candidates))for(const suffix of ['','-lod1']){
 const name=unit+suffix+'.glb',file=`${root}/${run}/candidate/${name}`,bytes=await readFile(file);
 const result=await validator.validateBytes(new Uint8Array(bytes),{uri:name,maxIssues:0});
 validation.push({unit,file,sha256:createHash('sha256').update(bytes).digest('hex'),issues:result.issues});
 files.set(name,bytes);assert.equal(result.issues.numErrors,0,`${file}: glTF errors`);
}
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio','--enable-gpu','--force_high_performance_gpu']});
const errors=[],rows=[],failures=[];
try{
 const page=await browser.newPage({viewport:{width:1400,height:930}});page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*.glb*',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').at(-1);
  if(files.has(name))await route.fulfill({status:200,contentType:'model/gltf-binary',body:files.get(name)});else await route.continue();
 });
 await page.goto('http://127.0.0.1:4338/');await page.waitForFunction(()=>!!window.allModels);
 for(const unit of Object.keys(candidates)){
  const loaded=await page.evaluate(id=>window.allModels.load(id),unit);
  const sweep=await page.evaluate(()=>window.allModels.sweep(31));
  const record={unit,candidate:candidates[unit],clips:loaded.clips,sweep,materials:[]};rows.push(record);
  assert(loaded.clips.length>0,`${unit}: missing clips`);assert.equal(sweep.length,loaded.clips.length*2);
  for(const row of sweep)if(row.lowest<-.02)failures.push(`${unit}/${row.clip}/LOD${row.lod} floor ${row.lowest}`);
  const workPeaks=unit==='worker'?{Mine:[9/24,13/24],Chop:[10/24,14/24],Build:[4/24,7/24],Attack:[6/40,13/40]}:unit==='neutral-raider'?{Attack:[6/40,13/40]}:{};
  const detail=process.env.RTS_REVIEW_DETAIL==='1';
  for(const lod of detail?[0,1]:[0])for(const clip of loaded.clips)for(const fraction of [...new Set([0,.25,.5,.75,1,...(workPeaks[clip]??[])])]){
   const state=await page.evaluate(options=>window.allModels.set(options),{clip,fraction,view:'game',fit:true,lod});
   assert(!state.contextLost);assert(state.maximum.every(Number.isFinite));
   const name=`${unit}${lod?'-lod1':''}-${clip}-${fraction}`;
   if(fraction===.5||fraction===1||(workPeaks[clip]??[]).includes(fraction))await page.screenshot({path:`${out}/${name}.png`});
   if(detail&&(fraction===.5||(clip==='Death'&&fraction===1)||(workPeaks[clip]??[]).includes(fraction)))for(const view of ['side','back']){
    await page.evaluate(options=>window.allModels.set(options),{view,fit:true});
    await page.screenshot({path:`${out}/${name}-${view}.png`});
   }
  }
  // Exercise actual controls, including the low-detail red-team material path.
  await page.selectOption('#lod','1');await page.waitForFunction(()=>window.allModels.geometry().lod===1);
  await page.selectOption('#team','1');await page.waitForFunction(()=>window.allModels.geometry().team===1);
  await page.screenshot({path:`${out}/${unit}-lod1-red.png`});
  const materials=await page.evaluate(()=>window.allModels.materials());assert(materials.some(row=>row.map&&row.uvs>0));
  record.materials=materials;
  console.log(JSON.stringify({unit,clips:loaded.clips.length,lods:2,floor:Math.min(...sweep.map(row=>row.lowest))}));
 }
 assert.deepEqual(errors,[]);
 assert.deepEqual(failures,[]);
}finally{
 await writeFile(out+'/runtime.json',JSON.stringify({candidates,validation,errors,failures,rows,runtime_published:false,artistic_quality_proven:false},null,2)+'\n');
 await browser.close();
}
