import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=path.resolve(process.argv[2]);
const url='http://127.0.0.1:4324/@fs/'+root.replaceAll('\\','/')+'/qa/crossbow-preview.html';
const hashes=await Promise.all([0,1].map(async lod=>createHash('sha256').update(await readFile(path.join(root,'candidate',`original-crossbow-grip-lod${lod}.glb`))).digest('hex')));
await writeFile(path.join(root,'qa','crossbow-preview.json'),JSON.stringify({crossbow:{name:'原創弩兵',status:'局部修正版 · 待獨立複核',notes:'原始骨架、五動作、兩級模型；檢查肩袖與腕端。',base:'/@fs/'+root.replaceAll('\\','/')+'/candidate',stem:'original-crossbow-grip',hashes}},null,2));
const browser=await chromium.launch({channel:'chromium',headless:true});
const page=await browser.newPage({viewport:{width:1500,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const rows=[];
try{
 await page.goto(url);await page.waitForFunction(()=>window.rtsHandoffReview?.state().ready);
 for(const lod of [0,1])for(const team of [0,1]){
  await page.selectOption('#lod',String(lod));await page.selectOption('#team',String(team));
  await page.waitForFunction(([l,t])=>{const s=window.rtsHandoffReview?.state();return s?.ready&&s.lod===l&&s.team===t},[lod,team]);
  for(const clip of ['Idle','Walk','Attack','Hurt','Death']){
   await page.click(`[data-clip="${clip}"]`);const before=await page.evaluate(()=>window.rtsHandoffReview.state());
   await page.locator('#timeline').evaluate((el,t)=>{el.value=String(t);el.dispatchEvent(new Event('input',{bubbles:true}));},before.duration*.42);
   const after=await page.evaluate(()=>window.rtsHandoffReview.state());
   if(after.sha!==hashes[lod]||!after.draws)throw new Error('Wrong bytes or no draws');
   if(!after.teamColors.includes(team?'87382d':'28577d'))throw new Error('Team cloth color missing');
   if(JSON.stringify(before.pose)===JSON.stringify(after.pose))throw new Error('Frozen '+clip);
   rows.push({lod,team,clip,sha:after.sha,draws:after.draws,teamColors:after.teamColors,changed:true});
   if(team===0){await page.screenshot({path:path.join(root,'qa',`browser-lod${lod}-${clip.toLowerCase()}.png`)});}
  }
 }
 await page.selectOption('#lod','0');await page.selectOption('#team','0');await page.click('[data-clip="Idle"]');
 for(const view of ['threequarter','side','back']){
   await page.selectOption('#view',view);await page.locator('#zoom').evaluate(el=>{el.value='2.4';el.dispatchEvent(new Event('input',{bubbles:true}));});
   await page.screenshot({path:path.join(root,'qa',`browser-contact-${view}.png`)});
 }
 if(errors.length)throw new Error(errors.join('\n'));
 await writeFile(path.join(root,'qa','browser-verification.json'),JSON.stringify({pass:true,url,hashes,rows,errors},null,2));console.log(JSON.stringify({pass:true,url,checks:rows.length,errors}));
}finally{await browser.close();}
