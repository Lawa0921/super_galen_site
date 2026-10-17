import {chromium,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const run=path.resolve(process.argv[2]),out=path.join(run,'qa','weapon-poses');await mkdir(out,{recursive:true});
const base=process.env.RTS_BASE_URL??'http://127.0.0.1:4324';
const url=process.env.RTS_REVIEW_URL??base+'/@fs/'+run.replaceAll('\\','/')+'/qa/crossbow-preview.html';
const hashes=await Promise.all([0,1].map(async lod=>createHash('sha256').update(await readFile(path.join(run,'candidate',`original-crossbow-grip-lod${lod}.glb`))).digest('hex')));
await writeFile(path.join(run,'qa','crossbow-preview.json'),JSON.stringify({crossbow:{name:'原創弩兵 · 木托與鋼弩',status:'原創武器與倒地動作候選',notes:'檢查弩臂、握持和完整倒地過程；候選尚未替換正式遊戲模型。',base:'/@fs/'+run.replaceAll('\\','/')+'/candidate',stem:'original-crossbow-grip',hashes}},null,2));
const browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[],rows=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.waitForFunction(()=>window.rtsHandoffReview?.state().ready);
 for(const lod of [0,1]){
  await page.selectOption('#lod',String(lod));await page.waitForFunction(l=>{const s=window.rtsHandoffReview.state();return s.ready&&s.lod===l},lod);
  for(const [clip,frames,end] of [['Idle',[0],40],['Walk',[10],40],['Attack',[16],40],['Hurt',[8],28],['Death',[0,12,20,28,36,50],50]]){
   await page.click(`[data-clip="${clip}"]`);const duration=(await page.evaluate(()=>window.rtsHandoffReview.state())).duration;
   await page.locator('#zoom').evaluate((el,z)=>{el.value=String(z);el.dispatchEvent(new Event('input',{bubbles:true}));},clip==='Death'?.85:1.2);
   for(const frame of frames){
    await page.locator('#timeline').evaluate((el,t)=>{el.value=String(t);el.dispatchEvent(new Event('input',{bubbles:true}));},duration*frame/end);
    for(const view of ['front','side','back']){
     await page.selectOption('#view',view);await page.waitForTimeout(70);
     const state=await page.evaluate(()=>{const {pose,...s}=window.rtsHandoffReview.state();return s});
     expect(state.sha).toBe(hashes[lod]);expect(state.time).toBeCloseTo(duration*frame/end,2);expect(state.draws).toBeGreaterThan(1);
     const file=`lod${lod}-${clip}-${frame}-${view}.png`;await page.locator('#stage').screenshot({path:path.join(out,file)});rows.push({...state,frame,view,file});
    }
   }
  }
 }
 await page.click('[data-clip="Idle"]');await page.click('#play');await page.waitForTimeout(400);expect((await page.evaluate(()=>window.rtsHandoffReview.state())).time).toBeGreaterThan(.2);await page.click('#pause');
 const paused=(await page.evaluate(()=>window.rtsHandoffReview.state())).time;await page.waitForTimeout(120);expect((await page.evaluate(()=>window.rtsHandoffReview.state())).time).toBe(paused);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'mobile.png')});expect(errors).toEqual([]);
 await writeFile(path.join(out,'report.json'),JSON.stringify({pass:true,url,hashes,rows,play_pause:true,errors},null,2));console.log(JSON.stringify({pass:true,poses:rows.length,url,errors}));
}finally{await browser.close();}
