import {chromium,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const out='art-factory/rts/runs/landscape-districts/2026-10-07-v1/qa',base=process.env.RTS_BASE_URL??'http://127.0.0.1:4324';
const assets=[];
for(const name of ['valley-undergrowth','kingdom-ruins']){
  const path=`/assets/games/rts/terrain/${name}.webp`,response=await fetch(base+path);expect(response.ok).toBe(true);
  const actual=createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),expected=createHash('sha256').update(await readFile('public'+path)).digest('hex');
  expect(actual).toBe(expected);assets.push({path,sha256:actual});
}
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4334/landscape-districts/');
  for(const map of ['雙河谷地','灰脊隘口'])for(const frame of ['正常開局','地圖全景']){
    await page.getByRole('button',{name:map}).click();await page.getByRole('button',{name:frame}).click();
    await expect.poll(()=>page.locator('img').evaluateAll(images=>images.every(i=>i instanceof HTMLImageElement&&i.complete&&i.naturalWidth===1600))).toBe(true);
  }
  await page.getByRole('button',{name:'雙河谷地'}).click();await page.getByRole('button',{name:'正常開局'}).click();
  await page.screenshot({path:`${out}/review-gallery.png`,fullPage:true});expect(errors).toEqual([]);
  await writeFile(`${out}/published-paths.json`,JSON.stringify({assets,gallery:'http://127.0.0.1:4334/landscape-districts/',errors},null,2)+'\n');
}finally{await browser.close();}
