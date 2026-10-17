/** Same GLTFLoader, ModelInstance, light, camera and frame before/after packing. */
import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const [source,run]=process.argv.slice(2);assert(source&&run);const report=JSON.parse(await readFile(run+'/qa/lossless-packing.json','utf8')),out=run+'/qa/packing-framebuffers';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio','--enable-gpu','--force_high_performance_gpu']}),rows=[],errors=[];
try{
 for(const mode of ['source','packed','source-repeat','packed-repeat']){
  const page=await browser.newPage({viewport:{width:1400,height:930}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/assets/games/rts/**',async route=>{const url=new URL(route.request().url()).pathname;const model=report.models.find(m=>m.url===url),material=report.materials.find(m=>m.url===url);
   if(model)await route.fulfill({path:mode.startsWith('source')?source+'/candidate/'+url.split('/').at(-1):run+'/'+model.file,contentType:'model/gltf-binary'});
   else if(mode.startsWith('packed')&&material)await route.fulfill({path:run+'/'+material.file,contentType:url.endsWith('.webp')?'image/webp':url.endsWith('.png')?'image/png':'image/jpeg'});else await route.continue();
  });await page.goto('http://127.0.0.1:4338/');await page.waitForFunction(()=>!!window.allModels);
  for(const id of ['worker','guard','knight','oak','gold-mine']){
   await page.evaluate(id=>window.allModels.load(id),id);await page.evaluate(()=>window.allModels.set({view:'three-quarter',fraction:.5,fit:true}));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const file=`${id}-${mode}.png`,bytes=await page.locator('#stage canvas').screenshot({path:out+'/'+file});rows.push({id,mode,file,sha256:createHash('sha256').update(bytes).digest('hex')});
  }await page.close();
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();await writeFile(out+'/capture.json',JSON.stringify({rows,errors,scope:'Actual original/packed GLTFLoader framebuffer with base color, normal, metallic-roughness and alpha foliage.'},null,2)+'\n');}
