/** Browser mechanics and screenshots only; does not approve model quality. */
import {chromium,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const run=process.argv[2]??'art-factory/rts/runs/original-crossbow-complete/2026-10-07-v1',out=run+'/qa/browser';
const previewUrl=process.argv[3]??'http://127.0.0.1:4334/crossbow-complete/';
const authoring=JSON.parse(await readFile(`${run}/qa/authoring.json`,'utf8'));
const fullbody=Boolean(authoring.equipment);
const attackFrames=fullbody?[0,8,12,14,20,26,32,36,40,44,46,48,50,54,58,60,62,68,72]:[0,8,12,14,20,24,29,32,34,36,38,40];
await mkdir(out,{recursive:true});
const hashes=await Promise.all([0,1].map(async l=>createHash('sha256').update(await readFile(`${run}/candidate/original-crossbow-grip-lod${l}.glb`)).digest('hex')));
const browser=await chromium.launch({channel:'chromium',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[],rows=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(previewUrl);await page.waitForFunction(()=>window.rtsHandoffReview?.state().ready);
 for(const lod of [0,1])for(const team of [0,1]){
  await page.selectOption('#lod',String(lod));await page.selectOption('#team',String(team));
  await page.waitForFunction(({lod,team})=>{const s=window.rtsHandoffReview.state();return s.ready&&s.lod===lod&&s.team===team;},{lod,team});
  for(const clip of ['Idle','Walk','Attack','Hurt','Death']){
   await page.click(`[data-clip="${clip}"]`);
   const initial=await page.evaluate(()=>window.rtsHandoffReview.state());expect(initial.sha).toBe(hashes[lod]);
   if(fullbody&&clip==='Attack')expect(initial.duration).toBeCloseTo(3,5);
   await page.click('#play');await page.waitForTimeout(240);const moved=await page.evaluate(()=>window.rtsHandoffReview.state());
   expect(moved.time).toBeGreaterThan(.1);expect(moved.pose).not.toEqual(initial.pose);await page.click('#pause');
   const paused=await page.evaluate(()=>window.rtsHandoffReview.state().time);await page.waitForTimeout(60);expect(await page.evaluate(()=>window.rtsHandoffReview.state().time)).toBe(paused);
   for(const view of ['front','threequarter','side']){
    await page.selectOption('#view',view);await page.locator('#timeline').evaluate((el,t)=>{el.value=String(t);el.dispatchEvent(new Event('input',{bubbles:true}));},clip==='Death'?initial.duration*.92:initial.duration*.25);
    await page.waitForTimeout(30);const file=`lod${lod}-team${team}-${clip}-${view}.png`;await page.locator('#stage').screenshot({path:`${out}/${file}`});
    rows.push({lod,team,clip,view,file,sha:initial.sha});
   }
  }
 }
 await page.selectOption('#lod','0');await page.selectOption('#team','0');await page.waitForFunction(()=>window.rtsHandoffReview.state().ready);await page.click('[data-clip="Attack"]');
 for(const frame of attackFrames){
  await page.locator('#timeline').evaluate((el,t)=>{el.value=String(t);el.dispatchEvent(new Event('input',{bubbles:true}));},frame/24);await page.selectOption('#view','threequarter');await page.waitForTimeout(25);
  await page.locator('#stage').screenshot({path:`${out}/attack-${frame}.png`});
 }
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${out}/mobile.png`});expect(errors).toEqual([]);
 await writeFile(`${out}/report.json`,JSON.stringify({previewUrl,browser_interaction_pass:true,art_approved:false,runtime_publish_allowed:false,rows,attackFrames,pose_screenshots:rows.length+attackFrames.length,play_pause_cases:20,errors},null,2)+'\n');
 console.log(JSON.stringify({browser_interaction_pass:true,art_approved:false,poses:rows.length+attackFrames.length,play_pause_cases:20,errors}));
}finally{await browser.close();}
