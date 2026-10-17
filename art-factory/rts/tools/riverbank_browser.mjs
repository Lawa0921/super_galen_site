import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const run=path.resolve('art-factory/rts/runs/riverbank/2026-10-07-v1'),out=path.join(run,'qa/runtime/channel');await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chromium',headless:true});const rows=[],errors=[];
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 const response=await page.goto('http://127.0.0.1:4334/riverbank/');expect(response.status()).toBe(200);await page.waitForFunction(()=>window.riverbankReview?.state().ready,{},{timeout:60000});
 for(const candidate of [false,true]){
  await page.click(candidate?'#candidate':'#original');await page.waitForFunction(candidate=>{const s=window.riverbankReview.state();return s.ready&&s.candidate===candidate;},candidate);
  for(const view of ['north','south','bank','overview']){
   await page.selectOption('#view',view);await page.waitForTimeout(180);const state=await page.evaluate(()=>window.riverbankReview.state());expect(state.pieces).toBe(candidate?2716:2);expect(state.batches).toBe(1);
   await page.screenshot({path:path.join(out,`${candidate?'candidate':'original'}-${view}.png`)});rows.push({view,...state});
  }
 }
 const bridge=await page.evaluate(()=>window.riverbankReview.bridgeProbe());for(const b of bridge){expect(b.finite).toBe(true);expect(b.max).toBeLessThan(.03);expect(b.min).toBeGreaterThanOrEqual(0);}expect(bridge).toHaveLength(2);
 const walks=[];
 for(const view of ['north','south']){
  await page.selectOption('#view',view);await page.click('#walk');await page.waitForFunction(()=>window.riverbankReview.state().walking);
  await page.waitForFunction(()=>{const s=window.riverbankReview.state();return s.walker&&s.walker.x>=47.5;},{},{timeout:20000});await page.screenshot({path:path.join(out,`walk-${view}.png`)});
  await page.waitForFunction(()=>!window.riverbankReview.state().walking,{},{timeout:20000});const s=await page.evaluate(()=>window.riverbankReview.state());expect(s.walker.x).toBeGreaterThan(53.5);walks.push({view,...s.walker});
 }
 await page.click('#scouted');await page.waitForFunction(()=>{const s=window.riverbankReview.state();return s.ready&&s.scouted;});await page.waitForTimeout(150);await page.screenshot({path:path.join(out,'scouted.png')});
 await page.click('#fog');await page.waitForFunction(()=>{const s=window.riverbankReview.state();return s.ready&&!s.reveal;});await page.waitForTimeout(150);await page.screenshot({path:path.join(out,'fog.png')});
 await page.selectOption('#map','pass');await page.waitForFunction(()=>{const s=window.riverbankReview.state();return s.ready&&s.map==='pass';});expect((await page.evaluate(()=>window.riverbankReview.state())).pieces).toBe(2);
 await page.selectOption('#map','river');await page.waitForFunction(()=>{const s=window.riverbankReview.state();return s.ready&&s.map==='river';});await page.click('#reveal');await page.waitForFunction(()=>{const s=window.riverbankReview.state();return s.ready&&s.reveal;});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'mobile.png')});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(errors).toEqual([]);await writeFile(path.join(run,'qa/runtime/channel-browser.json'),JSON.stringify({pass:true,rows,bridge,walks,fog_capture:true,map_switch:true,mobile_no_overflow:true,errors,runtime_integration:true},null,2)+'\n');console.log(JSON.stringify({pass:true,shots:rows.length,bridge,walks,errors}));
}finally{await browser.close();}
