import {chromium,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const run='art-factory/rts/runs/modular-kingdom/2026-10-08-v1',out=run+'/qa/browser';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--enable-gpu','--force_high_performance_gpu']}),errors=[];
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:4334/modular-kingdom/');await page.waitForFunction(()=>window.modularReady);
 const kit=JSON.parse(await readFile(run+'/kit.json','utf8')),rows=[];
 for(const {id} of kit.recipes){
  await page.selectOption('#asset',id);await page.waitForFunction(()=>window.modularReady);
  const count=await page.locator('#part option').count();expect(count).toBeGreaterThan(3);
  await page.screenshot({path:out+'/'+id+'.png'});
  await page.locator('#explode').focus();await page.keyboard.press('End');
  await expect(page.locator('#explode')).toHaveValue('1');
  expect(await page.evaluate(()=>window.modularReview.groups().some(g=>g.position.length()>0))).toBe(true);
  if(id==='townhall-tier2'||id==='stone-bridge')await page.screenshot({path:out+'/'+id+'-exploded.png'});
  await page.getByRole('button',{name:'還原組裝'}).click();
  expect(await page.evaluate(()=>window.modularReview.groups().every(g=>g.position.length()===0))).toBe(true);
  if(id==='townhall-tier2'||id==='townhall-tier3'){
   const windowSlot=await page.locator('#part option[value^="window-00"]').getAttribute('value');
   await page.selectOption('#part',windowSlot);await expect(page.locator('#details')).toContainText('二階主城、三階主城');
   const visible=await page.evaluate(()=>window.modularReview.groups().filter(g=>g.visible).length);expect(visible).toBe(1);
   await page.screenshot({path:out+'/'+id+'-shared-window.png'});await page.getByRole('button',{name:'還原組裝'}).click();
  }
  rows.push({asset:id,instances:count-1,explodeAndReset:true});
 }
 const canvas=page.locator('canvas'),box=await canvas.boundingBox();
 await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.6,box.y+box.height*.6,{steps:8});await page.mouse.up();
 const link=await page.locator('#recipe').getAttribute('href');expect((await page.request.get(new URL(link,page.url()).href)).status()).toBe(200);
 expect((await page.request.get('http://127.0.0.1:4334/modular-kingdom/kingdom-kit.blend')).status()).toBe(200);
 expect(errors).toEqual([]);await writeFile(out+'/report.json',JSON.stringify({status:'passed',rows,sharedWindowPreview:true,recipeAndLibraryDownloads:true,errors},null,2)+'\n');console.log(JSON.stringify({models:rows.length,errors}));
}finally{await browser.close();}
