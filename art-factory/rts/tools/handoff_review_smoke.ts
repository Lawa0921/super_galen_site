import {chromium,expect} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),out=path.join(root,'tmp/rts/handoff-20261006/review-qa');
await mkdir(out,{recursive:true});
const entries=JSON.parse(await readFile(path.join(root,'art-factory/rts/review/handoff-20261006.json'),'utf8'));
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--enable-gpu','--force_high_performance_gpu']});
try{
 const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.RTS_REVIEW_URL??'http://127.0.0.1:4334/');
 const rows:any[]=[];
 for(const unit of ['worker','guard','crossbow'])for(const lod of [0,1]){
  await page.selectOption('#unit',unit);await page.selectOption('#lod',String(lod));
  await page.waitForFunction(({u,l})=>{const s=(window as any).rtsHandoffReview?.state();return s?.ready&&s.unit===u&&s.lod===l;},{u:unit,l:lod});
  for(const clip of ['Idle','Walk','Attack','Hurt','Death']){
   await page.click(`[data-clip="${clip}"]`);
   await page.locator('#timeline').evaluate((input:HTMLInputElement)=>{input.value=String(Number(input.max)*.2);input.dispatchEvent(new Event('input',{bubbles:true}));});
   const earlier=await page.evaluate(()=>(window as any).rtsHandoffReview.state());
   await page.locator('#timeline').evaluate((input:HTMLInputElement)=>{input.value=String(Number(input.max)*.48);input.dispatchEvent(new Event('input',{bubbles:true}));});
   const before=await page.evaluate(()=>(window as any).rtsHandoffReview.state());
   await page.waitForTimeout(100);
   const after=await page.evaluate(()=>(window as any).rtsHandoffReview.state());
   expect(after.pose.length).toBeGreaterThan(16);if(clip!=='Idle')expect(after.pose).not.toEqual(earlier.pose);
   expect(after.pose).toEqual(before.pose);expect(after.time).toBeCloseTo(after.duration*.48,2);
   expect(after.sha).toBe(entries[unit].hashes[lod]);expect(after.draws).toBeGreaterThan(1);
   rows.push({unit,lod,clip,sha:after.sha,pausedPoseStable:true});
   if(lod===0&&(clip==='Idle'||clip==='Attack'||clip==='Death'))await page.screenshot({path:path.join(out,`${unit}-${clip.toLowerCase()}.png`),fullPage:true});
  }
 }
 await page.click('[data-clip="Walk"]');await page.click('#play');await page.waitForTimeout(250);await page.click('#pause');
 const paused=await page.evaluate(()=>(window as any).rtsHandoffReview.state());expect(paused.time).toBeGreaterThan(0);
 await page.waitForTimeout(150);const stable=await page.evaluate(()=>(window as any).rtsHandoffReview.state());expect(stable.pose).toEqual(paused.pose);
 await page.selectOption('#team','1');await page.waitForFunction(()=>(window as any).rtsHandoffReview.state().ready);
 expect((await page.evaluate(()=>(window as any).rtsHandoffReview.state())).team).toBe(1);
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});expect(errors).toEqual([]);
 const report={passed:true,poseChecks:rows.length,checks:rows,playPause:true,redTeamSwitch:true,mobileNoOverflow:true,errors};
 await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:true,poseChecks:rows.length,errors,report:path.join(out,'report.json')}));
}finally{await browser.close();}
