import {chromium, expect} from '@playwright/test';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const run=path.resolve(process.argv[2]);
const out=path.join(run,'qa','waist-poses');await mkdir(out,{recursive:true});
const base=process.env.RTS_BASE_URL??'http://127.0.0.1:4324';
const url=base+'/@fs/'+run.replaceAll('\\','/')+'/qa/crossbow-preview.html';
const hashes=await Promise.all([0,1].map(async lod=>createHash('sha256').update(await readFile(path.join(run,'candidate',`original-crossbow-grip-lod${lod}.glb`))).digest('hex')));
const record={crossbow:{name:'原創弩兵 · 腰帶與裙甲',status:'腰部綁定修正候選',notes:'檢查受擊時腰扣形狀、行走時裙身過渡；原創模型與五種動作保留。',base:'/@fs/'+run.replaceAll('\\','/')+'/candidate',stem:'original-crossbow-grip',hashes}};
await writeFile(path.join(run,'qa','crossbow-preview.json'),JSON.stringify(record,null,2));
const browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[],rows=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.waitForFunction(()=>window.rtsHandoffReview?.state().ready);
 for(const lod of [0,1]){
  await page.selectOption('#lod',String(lod));await page.waitForFunction(l=>{const s=window.rtsHandoffReview.state();return s.ready&&s.lod===l},lod);
  for(const [clip,frames,end] of [['Idle',[0],40],['Hurt',[4,8,12],28],['Walk',[0,10,20,30,40],40],['Attack',[16],40],['Death',[35,50],50]]){
   await page.click(`[data-clip="${clip}"]`);
   await page.locator('#zoom').evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},clip==='Death'?.65:1.65);
   const duration=(await page.evaluate(()=>window.rtsHandoffReview.state())).duration;
   for(const frame of frames){
    await page.locator('#timeline').evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},duration*frame/end);
    for(const view of ['front','side']){
     await page.selectOption('#view',view);await page.waitForTimeout(60);
     const state=await page.evaluate(()=>{const {pose,...rest}=window.rtsHandoffReview.state();return rest});
     expect(state.sha).toBe(hashes[lod]);expect(state.time).toBeCloseTo(duration*frame/end,2);expect(state.draws).toBeGreaterThan(1);
     const file=`lod${lod}-${clip}-${frame}-${view}.png`;await page.locator('#stage').screenshot({path:path.join(out,file)});
     rows.push({...state,frame,view,file});
    }
   }
  }
 }
 expect(errors).toEqual([]);
 await writeFile(path.join(out,'report.json'),JSON.stringify({pass:true,url,hashes,rows,errors},null,2));
 console.log(JSON.stringify({pass:true,poses:rows.length,url,errors}));
}finally{await browser.close();}
