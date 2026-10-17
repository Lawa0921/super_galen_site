import {chromium,expect} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const run=path.resolve('art-factory/rts/runs/original-articulated-glove/2026-10-06-v1'),out=path.join(run,'qa/browser');await mkdir(out,{recursive:true});
const expected=JSON.parse(await readFile(path.join(run,'qa/authoring.json'),'utf8')).files;
const browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[],rows=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:4334/articulated-glove/');await page.waitForFunction(()=>window.gloveReview?.state().ready);
 for(const side of ['r','l'])for(const lod of [0,1]){
  await page.selectOption('#side',side);await page.selectOption('#lod',String(lod));await page.waitForFunction(({side,lod})=>{const s=window.gloveReview.state();return s.ready&&s.side===side&&s.lod===lod},{side,lod});
  for(const frame of [0,6,12,18])for(const view of ['palm','back','threequarter']){
   await page.locator('#timeline').evaluate((el,time)=>{el.value=String(time);el.dispatchEvent(new Event('input',{bubbles:true}));},frame/24);await page.selectOption('#view',view);await page.waitForTimeout(60);
   const state=await page.evaluate(()=>{const {pose,...s}=window.gloveReview.state();return s});expect(state.sha).toBe(expected[`glove-${side}-lod${lod}.glb`]);expect(state.boneCount).toBe(16);expect(state.duration).toBeCloseTo(2);expect(state.time).toBeCloseTo(frame/24,3);
   const file=`${side}-lod${lod}-${frame}-${view}.png`;await page.locator('#stage').screenshot({path:path.join(out,file)});rows.push({...state,frame,view,file});
  }
 }
 await page.locator('[data-frame="0"]').click();const before=(await page.evaluate(()=>window.gloveReview.state())).pose;await page.click('#play');await page.waitForTimeout(430);await page.click('#pause');const after=await page.evaluate(()=>window.gloveReview.state());expect(after.pose).not.toEqual(before);expect(after.time).toBeGreaterThan(.2);await page.waitForTimeout(100);expect((await page.evaluate(()=>window.gloveReview.state())).time).toBe(after.time);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'mobile.png')});expect(errors).toEqual([]);
 await writeFile(path.join(out,'report.json'),JSON.stringify({pass:true,rows,play_pause:true,errors},null,2));console.log(JSON.stringify({pass:true,poses:rows.length,errors}));
}finally{await browser.close();}
