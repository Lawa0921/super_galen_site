import {chromium} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const run='art-factory/rts/runs/visual-revision/2026-10-16-projectile-v2',out=run+'/qa/pixels';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio','--enable-gpu','--force_high_performance_gpu']});const rows=[],served=[];
try{
 const page=await browser.newPage({viewport:{width:1400,height:930}});
 page.on('response',response=>{const name=new URL(response.url()).pathname.split('/').at(-1);if(['bolt.glb','heavy-bolt.glb'].includes(name))served.push(response.body().then(bytes=>({name,sha256:createHash('sha256').update(bytes).digest('hex')})));});
 await page.route('**/*.glb*',async route=>{const id=new URL(route.request().url()).pathname.split('/').at(-1);if(['bolt.glb','heavy-bolt.glb'].includes(id))await route.fulfill({body:await readFile(run+'/candidate/'+id),contentType:'model/gltf-binary'});else await route.continue();});
 await page.goto('http://127.0.0.1:4338/');await page.waitForFunction(()=>!!window.allModels?.pixelView);
 for(const id of ['bolt','heavy-bolt'])for(const pixels of [32,64])for(const view of ['side','game']){
  await page.evaluate(id=>window.allModels.load(id),id);await page.evaluate(view=>window.allModels.set({view,fit:true}),view);
  const state=await page.evaluate(({pixels})=>window.allModels.pixelView(pixels,1.3),{pixels});assert(!state.contextLost);const file=`${id}-${pixels}px-${view}.png`;
  await page.locator('#stage canvas').screenshot({path:out+'/'+file});rows.push({file,state});
 }
 const actual=await Promise.all(served);for(const name of ['bolt.glb','heavy-bolt.glb']){const expected=createHash('sha256').update(await readFile(run+'/candidate/'+name)).digest('hex');assert(actual.some(r=>r.name===name));assert(actual.filter(r=>r.name===name).every(r=>r.sha256===expected));}
}finally{await writeFile(out+'/pixels.json',JSON.stringify({rows,served:await Promise.all(served),method:'Actual WebGL framebuffer at 32/64 pixels; shared 1.3 m orthographic span and unchanged production ModelInstance/materials/light.',artistic_quality_proven:false},null,2)+'\n');await browser.close();}
