import {chromium,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const run=path.resolve(process.argv[2]),out=path.join(run,'qa','attack-poses');await mkdir(out,{recursive:true});
const url=process.env.RTS_REVIEW_URL??'http://127.0.0.1:4334/crossbow-attack/';
const hashes=await Promise.all([0,1].map(async lod=>createHash('sha256').update(await readFile(path.join(run,'candidate',`original-crossbow-grip-lod${lod}.glb`))).digest('hex')));
const browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[],rows=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.waitForFunction(()=>window.rtsHandoffReview?.state().ready);
 for(const lod of [0,1])for(const team of [0,1]){
  await page.selectOption('#lod',String(lod));await page.selectOption('#team',String(team));
  await page.waitForFunction(({lod,team})=>{const s=window.rtsHandoffReview.state();return s.ready&&s.lod===lod&&s.team===team},{lod,team});
  await page.click('[data-clip="Attack"]');
  await page.locator('#zoom').evaluate(el=>{el.value='1.2';el.dispatchEvent(new Event('input',{bubbles:true}));});
  const duration=(await page.evaluate(()=>window.rtsHandoffReview.state())).duration;
  for(const frame of [0,4,8,12,14,20,25,28,31,36,40])for(const view of ['front','side','threequarter']){
   await page.locator('#timeline').evaluate((el,t)=>{el.value=String(t);el.dispatchEvent(new Event('input',{bubbles:true}));},duration*frame/40);
   await page.selectOption('#view',view);await page.waitForTimeout(60);
   const state=await page.evaluate(()=>{const {pose,...s}=window.rtsHandoffReview.state();return s});
   expect(state.sha).toBe(hashes[lod]);expect(state.time).toBeCloseTo(duration*frame/40,2);expect(state.draws).toBeGreaterThan(1);
   const file=`lod${lod}-team${team}-Attack-${frame}-${view}.png`;await page.locator('#stage').screenshot({path:path.join(out,file)});rows.push({...state,frame,view,file});
  }
 }
 await page.click('[data-clip="Attack"]');const start=(await page.evaluate(()=>window.rtsHandoffReview.state())).pose;
 await page.click('#play');await page.waitForTimeout(450);const moved=await page.evaluate(()=>window.rtsHandoffReview.state());expect(moved.time).toBeGreaterThan(.2);expect(moved.pose).not.toEqual(start);await page.click('#pause');
 const paused=(await page.evaluate(()=>window.rtsHandoffReview.state())).time;await page.waitForTimeout(120);expect((await page.evaluate(()=>window.rtsHandoffReview.state())).time).toBe(paused);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'mobile.png')});expect(errors).toEqual([]);
 await writeFile(path.join(out,'report.json'),JSON.stringify({pass:true,url,hashes,rows,play_pause:true,errors},null,2));console.log(JSON.stringify({pass:true,poses:rows.length,url,errors}));
}finally{await browser.close();}
