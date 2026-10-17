import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const run='art-factory/rts/runs/map-previews/2026-10-07-river';
await mkdir(`${run}/raw`,{recursive:true});await mkdir(`${run}/qa`,{recursive:true});
const browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1000,height:600},deviceScaleFactor:1}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4334/riverbank/');
 await page.waitForFunction(()=>window.riverbankReview?.state().ready);
 await page.selectOption('#view','overview');
 // Screenshot the actual game canvas at the existing thumbnail aspect ratio.
 // Hide review controls/captions: translated UI text must remain outside pixels.
 await page.addStyleTag({content:'body{padding:0}header,aside,.stage-caption{display:none!important}main{display:block;width:1000px;margin:0}.viewer{width:1000px;height:600px;min-height:600px;border:0;border-radius:0}'});
 await page.waitForTimeout(250);
 const box=await page.locator('#world').boundingBox();expect(box.width).toBe(1000);expect(box.height).toBe(600);
 const state=await page.evaluate(()=>window.riverbankReview.state());expect(state.candidate).toBe(true);expect(state.pieces).toBe(2716);expect(state.reveal).toBe(true);
 await page.locator('#world').screenshot({path:`${run}/raw/river.png`});expect(errors).toEqual([]);
 const bridge=await readFile('public/assets/games/rts/models/stone-bridge.glb');
 await writeFile(`${run}/qa/capture.json`,JSON.stringify({pass:true,source:'actual Battlefield via riverbank_review_scene.ts; no geometry or current asset overrides',state,rawDimensions:[1000,600],bridge_sha256:createHash('sha256').update(bridge).digest('hex'),errors},null,2)+'\n');
 console.log(JSON.stringify({pass:true,raw:`${run}/raw/river.png`,state}));
}finally{await browser.close();}
