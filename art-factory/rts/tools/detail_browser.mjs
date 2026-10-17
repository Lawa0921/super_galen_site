import {chromium,expect} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const run='art-factory/rts/runs/detail-refinement/2026-10-07-v1',out=`${run}/qa/browser`;
await mkdir(out,{recursive:true});const errors=[];
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--enable-gpu','--force_high_performance_gpu']});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:4334/model-detail/');await page.waitForFunction(()=>window.detailReady,{timeout:60000});
 const assets=JSON.parse(await readFile('tmp/rts/handoff-20261006/review-site/model-detail/assets.json','utf8'));
 const rows=[];
 for(const asset of assets){
  await page.evaluate(async asset=>await window.detailReview.load(asset),asset);
  await page.evaluate(()=>window.detailReview.frame(0));await page.waitForTimeout(120);
  await page.screenshot({path:`${out}/${asset}.png`});
  if(/^(guard|crossbow)(-lod1)?$/.test(asset))for(const clip of ['Idle','Walk','Attack','Hurt','Death']){
    await page.evaluate(clip=>{window.detailReview.play(clip);window.detailReview.frame(.3);},clip);
    await page.waitForTimeout(80);await page.screenshot({path:`${out}/${asset}-${clip}.png`});
  }
  rows.push(await page.evaluate(asset=>({asset,clips:window.detailReview.panels.map(p=>p.clips.map(c=>c.name)),calls:window.detailReview.panels.map(p=>p.renderer.info.render.calls)}),asset));
 }
 expect(errors).toEqual([]);await writeFile(`${out}/report.json`,JSON.stringify({status:'passed',errors,rows},null,2)+'\n');console.log(JSON.stringify({models:rows.length,errors}));
}finally{await browser.close();}
