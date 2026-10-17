import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const run=process.argv.find(arg=>arg.startsWith('--run='))?.slice(6)??'art-factory/rts/runs/map-previews/2026-10-05-v2';await mkdir(run+'/raw',{recursive:true});await mkdir(run+'/qa',{recursive:true});
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:1000,height:600},deviceScaleFactor:1}),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  // Preserve pixels for reproducible screenshots, without changing the shipped renderer.
  await page.addInitScript("const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,options){if(type==='webgl2')options={...options,preserveDrawingBuffer:true};return original.call(this,type,options);};");
  await page.route('**/rts-map-preview*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><script type="module" src="/art-factory/rts/tools/map_preview_scene.ts"></script></body></html>'}));
  const scenes=[];
  // Fresh context/canvas per map, matching release/recreate lifecycle.
  for(const map of ['river','pass'] as const){await page.goto('http://127.0.0.1:4321/rts-map-preview'+(process.argv.includes('--terrain-candidate')?'?terrain-candidate=1':''));await page.waitForFunction(()=>!!(window as any).mapPreview);const result=await page.evaluate(map=>(window as any).mapPreview.render(map),map);expect(result.draws).toBeGreaterThan(0);scenes.push(result);await page.screenshot({path:`${run}/raw/${map}.png`});}
  await page.goto('http://127.0.0.1:4321/rts-map-preview');await page.waitForFunction(()=>!!(window as any).mapPreview);
  const fog=await page.evaluate(()=>(window as any).mapPreview.render('river',true));await page.screenshot({path:`${run}/qa/roads-under-fog.png`});
  console.log('ROAD_FOG',JSON.stringify(fog));for(const sample of fog.fogPixels)expect(Math.max(...sample.color.slice(0,3)),JSON.stringify(sample.point)).toBeLessThan(40);
  expect(errors).toEqual([]);await writeFile(run+'/qa/three.json',JSON.stringify({status:'pass',scenes,errors},null,2)+'\n');console.log(JSON.stringify({scenes,errors}));
}finally{await browser.close();}
