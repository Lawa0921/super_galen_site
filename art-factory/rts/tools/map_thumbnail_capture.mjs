// Captures lobby map thumbnails from the actual running RTS page (dev server),
// using the dev-only window.__rtsDebug reveal/camera hooks. No HUD, overlay or fog.
// Usage: [RTS_THUMB_RUN=<run dir>] node art-factory/rts/tools/map_thumbnail_capture.mjs <river|pass> <centerX> <centerZ> <span> [baseUrl]
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const [map,cx,cz,span,base='http://127.0.0.1:4350']=process.argv.slice(2);
const run=process.env.RTS_THUMB_RUN??'art-factory/rts/runs/map-thumbnails/2026-10-09-v2',W=1800,H=1080,SEED=20261009;
await mkdir(`${run}/raw`,{recursive:true});await mkdir(`${run}/qa`,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:W,height:H},deviceScaleFactor:1}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  // Deterministic game seed: main.ts draws the seed from Math.random.
  await page.addInitScript(seed=>{let s=seed>>>0;Math.random=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};},SEED);
  await page.goto(`${base}/games/rts/`);
  await page.locator(`input[name="rts-map"][value="${map}"]`).check({force:true});
  await page.click('#rts-start');
  await page.waitForFunction(()=>!document.querySelector('#rts-battle')?.hidden&&window.__rtsDebug,null,{timeout:120000});
  await page.addStyleTag({content:'body *{visibility:hidden!important}#rts-overlay{display:none!important}#rts-canvas{visibility:visible!important;position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;z-index:2147483647!important}'});
  await page.evaluate(([x,z,s])=>{window.__rtsDebug.reveal(0);window.__rtsDebug.camera(x,z,s);},[Number(cx),Number(cz),Number(span)]);
  await page.waitForTimeout(1500);
  const time=await page.evaluate(()=>window.__rtsDebug.time());
  await page.screenshot({path:`${run}/raw/${map}.png`,clip:{x:0,y:0,width:W,height:H},timeout:300000});
  const qa={pass:errors.length===0,map,source:'actual /games/rts dev page (Battlefield renderer) with dev-only __rtsDebug.reveal(0)+camera(); HUD/overlay hidden via CSS; game paused at t=0',seed:SEED,camera:{center:[Number(cx),Number(cz)],span:Number(span)},gameTime:time,rawDimensions:[W,H],errors};
  await writeFile(`${run}/qa/${map}-capture.json`,JSON.stringify(qa,null,2)+'\n');
  console.log(JSON.stringify(qa));
}finally{await browser.close();}
