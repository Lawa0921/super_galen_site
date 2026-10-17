import {chromium,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=process.cwd(),run=path.resolve(process.argv[2]??'art-factory/rts/runs/original-crossbow-team-surface/2026-10-06-v1'),out=path.join(run,'qa/browser');
const slug=process.argv[3]??'crossbow-surface',beforeSlug=process.argv[4]??'crossbow-wrist';
await mkdir(out,{recursive:true});
const hashes=await Promise.all([0,1].map(async lod=>createHash('sha256').update(await readFile(path.join(run,'candidate',`original-crossbow-grip-lod${lod}.glb`))).digest('hex')));
const browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[],rows=[];
 page.on('pageerror',e=>errors.push(e.message));
 for(const variant of ['before','after']){
  await page.goto(`http://127.0.0.1:4334/${variant==='before'?beforeSlug:slug}/`);
  await page.waitForFunction(()=>window.rtsHandoffReview?.state().ready);
  for(const lod of variant==='before'?[0]:[0,1]){
   await page.selectOption('#lod',String(lod));await page.waitForFunction(l=>window.rtsHandoffReview.state().ready&&window.rtsHandoffReview.state().lod===l,lod);
   for(const team of [0,1]){
    await page.selectOption('#team',String(team));await page.waitForFunction(t=>window.rtsHandoffReview.state().ready&&window.rtsHandoffReview.state().team===t,team);
    await page.click('[data-clip="Idle"]');await page.click('#pause');
    await page.locator('#timeline').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));});
    for(const view of ['threequarter','front','back']){
     await page.selectOption('#view',view);
     await page.locator('#zoom').evaluate(el=>{el.value='1.7';el.dispatchEvent(new Event('input',{bubbles:true}));});await page.waitForTimeout(100);
     const state=await page.evaluate(()=>{const {pose,...s}=window.rtsHandoffReview.state();return s});
     if(variant==='after')expect(state.sha).toBe(hashes[lod]);
     expect(state.teamColors).toContain(team===0?'28577d':'87382d');
     const file=`${variant}-lod${lod}-team${team}-${view}.png`;await page.locator('#stage').screenshot({path:path.join(out,file)});
     rows.push({variant,lod,team,view,sha:state.sha,file});
    }
   }
  }
 }
 await page.selectOption('#lod','0');await page.selectOption('#team','0');
 await page.waitForFunction(()=>window.rtsHandoffReview.state().ready&&window.rtsHandoffReview.state().lod===0&&window.rtsHandoffReview.state().team===0);
 await page.selectOption('#view','threequarter');await page.locator('#zoom').evaluate(el=>{el.value='1';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.waitForTimeout(150);
 await page.screenshot({path:path.join(root,`tmp/rts/handoff-20261006/review-site/${slug}/still.png`),fullPage:true});
 expect(errors).toEqual([]);await writeFile(path.join(out,'report.json'),JSON.stringify({pass:true,hashes,rows,errors,scope:'Actual original material/shader before-after, blue/red and both LODs; no geometric closure claim'},null,2)+'\n');
 console.log(JSON.stringify({pass:true,views:rows.length,errors}));
}finally{await browser.close();}
