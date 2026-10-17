/** Inspect exact static candidates, including low views below bridge decks. */
import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
const [id,run]=process.argv.slice(2);assert(id&&run,'Pass asset-id and candidate run folder');
const folder=`art-factory/rts/runs/visual-revision/${run}`,out=folder+'/qa/browser';await mkdir(out,{recursive:true});
const bytes=await readFile(`${folder}/candidate/${id}.glb`),sha256=createHash('sha256').update(bytes).digest('hex');
const validator=createRequire(import.meta.url)(path.resolve('tmp/rts/handoff-20261006/validator/node_modules/gltf-validator'));
const validation=await validator.validateBytes(new Uint8Array(bytes),{uri:id+'.glb',maxIssues:0,externalResourceFunction:async uri=>{const resource=new URL(uri,`http://127.0.0.1/assets/games/rts/models/${id}.glb`);assert(resource.pathname.startsWith('/assets/games/rts/'));return new Uint8Array(await readFile('public'+resource.pathname));}});
await writeFile(out+'/gltf.json',JSON.stringify(validation.issues,null,2)+'\n');
assert.equal(validation.issues.numErrors,0);
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio','--enable-gpu','--force_high_performance_gpu']});
const errors=[],rows=[],served=[];
try{
 const page=await browser.newPage({viewport:{width:1400,height:930}});page.on('pageerror',e=>errors.push(e.message));
 page.on('response',response=>{if(new URL(response.url()).pathname.endsWith('/'+id+'.glb'))served.push(response.body().then(body=>({url:response.url(),sha256:createHash('sha256').update(body).digest('hex')})));});
 await page.route(`**/${id}.glb*`,route=>route.fulfill({status:200,contentType:'model/gltf-binary',body:bytes}));
 await page.goto('http://127.0.0.1:4338/');await page.waitForFunction(()=>!!window.allModels);await page.evaluate(id=>window.allModels.load(id),id);
 for(const view of ['front','back','side','three-quarter','under-front','under-back']){
  const state=await page.evaluate(view=>window.allModels.set({view,fit:true}),view);assert(!state.contextLost&&state.maximum.every(Number.isFinite));
  await page.screenshot({path:`${out}/${id}-${view}.png`});rows.push({view,state});
 }
 assert.deepEqual(errors,[]);
 const actual=await Promise.all(served);assert(actual.length>0);assert(actual.every(r=>r.sha256===sha256),'Browser served a different candidate');
}finally{
 await writeFile(out+`/${id}-runtime.json`,JSON.stringify({id,run,sha256,served:await Promise.all(served),validation:validation.issues,errors,rows,runtime_published:false,artistic_quality_proven:false},null,2)+'\n');await browser.close();
}
