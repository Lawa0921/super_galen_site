/** Capture early mounted death and the previously missing low-detail views. */
import {chromium} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const run='art-factory/rts/runs/visual-revision/2026-10-16-complete-v1',out=run+'/qa/coverage';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio','--enable-gpu','--force_high_performance_gpu']});
const errors=[],rows=[],served=[];
try{
 const page=await browser.newPage({viewport:{width:1400,height:930}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*.glb*',async route=>{const name=new URL(route.request().url()).pathname.split('/').at(-1);try{const bytes=await readFile(run+'/candidate/'+name);served.push({name,sha256:createHash('sha256').update(bytes).digest('hex')});await route.fulfill({body:bytes,contentType:'model/gltf-binary'});}catch{await route.continue();}});
 await page.goto('http://127.0.0.1:4338/');await page.waitForFunction(()=>!!window.allModels);
 for(const id of ['knight','siege','river-gatehouse','river-shrine','highland-watchtower','quarry-ruins']){
  const loaded=await page.evaluate(id=>window.allModels.load(id),id);
  for(const lod of id==='knight'?[0,1]:[1])for(const clip of id==='knight'?['Death']:loaded.clips.length?loaded.clips:['Static'])for(const fraction of id==='knight'?[0,.10,.25]:[.5,1])for(const view of ['front','side','back']){
   const state=await page.evaluate(options=>window.allModels.set(options),{lod,clip,fraction,view,fit:true});assert(!state.contextLost);
   const name=`${id}-lod${lod}-${clip}-${fraction}-${view}.png`;await page.screenshot({path:out+'/'+name});rows.push({name,state});
  }
 }
 assert.deepEqual(errors,[]);
}finally{await writeFile(out+'/coverage.json',JSON.stringify({rows,served,errors,whole_batch_complete:false},null,2)+'\n');await browser.close();}
