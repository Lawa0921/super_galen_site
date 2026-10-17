import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const out=path.resolve('art-factory/rts/runs/original-crossbow-cuff-motion/2026-10-07-v1/qa/browser');await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chromium',headless:true}),rows=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 for(const version of ['crossbow-articulated','crossbow-cuff']){
  await page.goto(`http://127.0.0.1:4334/${version}/`);await page.waitForFunction(()=>window.rtsHandoffReview?.state().ready);
  for(const lod of [0,1]){
   await page.selectOption('#lod',String(lod));await page.waitForFunction(lod=>window.rtsHandoffReview.state().ready&&window.rtsHandoffReview.state().lod===lod,lod);
   await page.click('[data-clip="Attack"]');
   for(const frame of [4.875,14.5]){
    await page.locator('#timeline').evaluate((el,t)=>{el.value=String(t);el.dispatchEvent(new Event('input',{bubbles:true}));},frame/24);
    await page.locator('#zoom').evaluate(el=>{el.value='1.8';el.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.waitForTimeout(100);
    const state=await page.evaluate(()=>window.rtsHandoffReview.state());const file=`${version}-lod${lod}-frame${frame}.png`;await page.locator('#stage').screenshot({path:path.join(out,file)});
    rows.push({version,lod,requested_frame:frame,actual_seconds:state.time,sha:state.sha,file});
   }
  }
 }
 await writeFile(path.join(out,'close-comparison.json'),JSON.stringify({rows},null,2)+'\n');console.log(JSON.stringify({screenshots:rows.length}));
}finally{await browser.close();}
