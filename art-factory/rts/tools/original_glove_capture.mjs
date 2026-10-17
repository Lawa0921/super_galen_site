import {chromium,expect} from '@playwright/test';
import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const run=path.resolve('art-factory/rts/runs/original-articulated-glove/2026-10-06-v1'),qa=path.join(run,'qa'),preview=path.resolve('tmp/rts/handoff-20261006/review-site/articulated-glove');
const expected=JSON.parse(await readFile(path.join(qa,'authoring.json'),'utf8')).files;
await mkdir(path.join(qa,'video'),{recursive:true});
const browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1500,height:1000},recordVideo:{dir:path.join(qa,'video'),size:{width:1200,height:800}}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4334/articulated-glove/');await page.waitForFunction(()=>window.gloveReview?.state().ready);
 await page.locator('[data-frame="18"]').click();
 await expect(page.locator('#name')).toHaveText('原創右手 · 指節開合');await expect(page.locator('#clock')).toHaveText('0.75 / 2.00 秒');
 expect(await page.locator('body').textContent()).not.toContain('\uFFFD');await page.screenshot({path:path.join(qa,'still.png')});
 const before=await page.evaluate(()=>window.gloveReview.state());expect(before.sha).toBe(expected['glove-r-lod0.glb']);expect(before.boneCount).toBe(16);
 await page.locator('[data-frame="0"]').click();await page.click('#play');await page.waitForTimeout(2400);await page.click('#pause');
 const after=await page.evaluate(()=>window.gloveReview.state());expect(after.pose).not.toEqual(before.pose);expect(errors).toEqual([]);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(qa,'mobile-current.png')});
 const video=page.video();await context.close();await copyFile(await video.path(),path.join(qa,'playback.webm'));
 for(const file of ['still.png','playback.webm'])await copyFile(path.join(qa,file),path.join(preview,file));
 const failure=await browser.newPage();await failure.route('**/models/glove-r-lod0.glb',route=>route.fulfill({status:503,body:''}));await failure.goto('http://127.0.0.1:4334/articulated-glove/');await expect(failure.locator('#error')).toHaveText('Error: 模型載入失敗');await failure.close();
 const {pose,...state}=before;await writeFile(path.join(qa,'capture.json'),JSON.stringify({pass:true,source:state,playback_wait_ms:2400,errors,chinese_dom_and_load_error:true,scope:'Real Chromium Three.js playback and pause; local review only'},null,2));
 console.log(JSON.stringify({pass:true,sha:before.sha,errors}));
}finally{await browser.close();}
