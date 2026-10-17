import {chromium,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const run=path.resolve('art-factory/rts/runs/original-crossbow-cuff-motion/2026-10-07-v1'),out=path.join(run,'qa/browser');await mkdir(out,{recursive:true});
const url='http://127.0.0.1:4334/crossbow-cuff/',manifest=JSON.parse(await readFile(path.join(run,'qa/export.json'),'utf8'));
const browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],rows=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.waitForFunction(()=>window.rtsHandoffReview?.state().ready);
 for(const lod of [0,1])for(const clip of ['Idle','Walk','Attack','Hurt','Death']){
  await page.selectOption('#lod',String(lod));await page.waitForFunction(lod=>{const s=window.rtsHandoffReview.state();return s.ready&&s.lod===lod},lod);
  await page.click(`[data-clip="${clip}"]`);const duration=(await page.evaluate(()=>window.rtsHandoffReview.state())).duration;
  await page.locator('#timeline').evaluate((el,t)=>{el.value=String(t);el.dispatchEvent(new Event('input',{bubbles:true}));},duration*.625);
  const state=await page.evaluate(()=>window.rtsHandoffReview.state());expect(state.sha).toBe(manifest.rows[lod].sha256);expect(state.pose.length/16).toBe(42);expect(state.draws).toBeGreaterThan(1);
  await page.locator('#stage').screenshot({path:path.join(out,`lod${lod}-${clip}.png`)});const {pose,...record}=state;rows.push(record);
 }
 await page.click('[data-clip="Attack"]');const before=(await page.evaluate(()=>window.rtsHandoffReview.state())).pose;
 await page.click('#play');await page.waitForTimeout(430);let state=await page.evaluate(()=>window.rtsHandoffReview.state());expect(state.pose).not.toEqual(before);expect(state.time).toBeGreaterThan(.15);
 await page.click('#pause');const paused=(await page.evaluate(()=>window.rtsHandoffReview.state())).time;await page.waitForTimeout(120);expect((await page.evaluate(()=>window.rtsHandoffReview.state())).time).toBe(paused);
 await page.selectOption('#team','1');await page.waitForFunction(()=>{const s=window.rtsHandoffReview.state();return s.ready&&s.team===1});
 await page.selectOption('#view','back');await page.locator('#stage').screenshot({path:path.join(out,'red-back.png')});
 await page.selectOption('#team','0');await page.waitForFunction(()=>{const s=window.rtsHandoffReview.state();return s.ready&&s.team===0});await page.selectOption('#view','threequarter');await page.click('[data-clip="Idle"]');await page.screenshot({path:path.join(out,'desktop.png')});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'mobile.png')});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const broken=await browser.newPage();await broken.route('**/*.glb',route=>route.fulfill({status:503,body:'intentional QA failure'}));await broken.goto(url);await expect(broken.locator('#error')).toBeVisible();expect((await broken.evaluate(()=>window.rtsHandoffReview.state())).ready).toBe(false);
 expect(errors).toEqual([]);const report={pass:true,url,rows,bones:42,play_pause:true,timeline:true,team_switch:true,mobile_no_overflow:true,load_failure_visible:true,errors,runtime_publish_allowed:false};await writeFile(path.join(run,'qa/browser.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pass:true,poses:rows.length,url,errors}));
}finally{await browser.close();}
