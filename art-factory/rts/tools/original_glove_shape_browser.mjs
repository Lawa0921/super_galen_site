import {chromium,expect} from '@playwright/test';
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
const run=path.resolve('art-factory/rts/runs/original-glove-shape/2026-10-06-v1'),site=path.resolve('tmp/rts/handoff-20261006/review-site/glove-sculpt');
const bytes=await readFile(path.join(run,'candidate/candidate.glb')),sha=createHash('sha256').update(bytes).digest('hex');
const browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1500,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4334/glove-sculpt/');await expect(page.locator('#stage')).toBeVisible({timeout:3000});await page.waitForFunction(()=>window.sculptReview?.state().ready);
 const loaded=await page.evaluate(()=>window.sculptReview.state());expect(loaded.sha).toBe(sha);expect(loaded.triangles).toBe(629620);expect(loaded.bones).toBe(0);
 expect(loaded.validNormalVertices).toBeGreaterThan(314812*.99);
 expect(await page.locator('#reference').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
 const poses=[];
 for(const view of ['palm','back','side','threequarter']){await page.locator(`[data-view="${view}"]`).click();await page.waitForTimeout(100);poses.push(await page.evaluate(()=>window.sculptReview.state()));await page.locator('#stage').screenshot({path:path.join(run,`qa/browser-${view}.png`)});}
 const before=poses.at(-1).camera;await page.locator('#rotate').check();await page.waitForTimeout(500);await page.locator('#rotate').uncheck();const rotated=await page.evaluate(()=>window.sculptReview.state());expect(Math.max(...rotated.camera.map((v,i)=>Math.abs(v-before[i])))).toBeGreaterThan(.01);
 await page.waitForTimeout(300);const stopped=await page.evaluate(()=>window.sculptReview.state());await page.waitForTimeout(200);const paused=await page.evaluate(()=>window.sculptReview.state());expect(Math.max(...stopped.camera.map((v,i)=>Math.abs(v-paused.camera[i])))).toBeLessThan(1e-6);
 await page.locator('[data-view="palm"]').click();const canvas=await page.locator('#stage').boundingBox();await page.mouse.move(canvas.x+canvas.width*.5,canvas.y+canvas.height*.5);await page.mouse.down();await page.mouse.move(canvas.x+canvas.width*.65,canvas.y+canvas.height*.5,{steps:6});await page.mouse.up();await page.waitForTimeout(300);const orbit=await page.evaluate(()=>window.sculptReview.state());expect(Math.abs(orbit.camera[0])).toBeGreaterThan(.1);
 await page.locator('[data-view="threequarter"]').click();await page.waitForTimeout(200);await page.screenshot({path:path.join(run,'qa/browser-still.png')});await copyFile(path.join(run,'qa/browser-still.png'),path.join(site,'still.png'));
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(run,'qa/browser-mobile.png')});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.locator('body').textContent()).toContain('尚未綁骨');expect(await page.locator('body').textContent()).not.toContain('\uFFFD');
 const fail=await browser.newPage();await fail.route('**/source.glb',r=>r.fulfill({status:503,body:''}));await fail.goto('http://127.0.0.1:4334/glove-sculpt/');await expect(fail.locator('#error')).toHaveText('Error: 模型載入失敗');await fail.close();
 expect(errors).toEqual([]);
 const require=createRequire(import.meta.url),validator=require(path.resolve('tmp/rts/handoff-20261006/validator/node_modules/gltf-validator'));const validation=await validator.validateBytes(bytes,{uri:'source.glb',maxIssues:100});expect(validation.issues.numErrors).toBe(0);await writeFile(path.join(run,'qa/gltf-validator.json'),JSON.stringify({source_sha256:sha,...validation},null,2));
 await writeFile(path.join(run,'qa/browser.json'),JSON.stringify({pass:true,source_sha256:sha,loaded,poses,rotate_pause:true,mouse_orbit:true,reference_loaded:true,mobile_overflow:false,load_error:true,errors},null,2));console.log(JSON.stringify({pass:true,views:poses.length,triangles:loaded.triangles,errors}));
}finally{await browser.close();}
