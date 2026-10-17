import {chromium,expect} from '@playwright/test';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import path from 'node:path';
const require=createRequire(import.meta.url),validator=require(path.resolve('tmp/rts/handoff-20261006/validator/node_modules/gltf-validator'));
const run=path.resolve('art-factory/rts/runs/original-glove-tailoring/2026-10-06-v1'),baseline=path.resolve('art-factory/rts/runs/original-articulated-glove/2026-10-06-v1');
const out=path.join(run,'qa/browser'),site=path.resolve('tmp/rts/handoff-20261006/review-site/glove-tailoring');await mkdir(out,{recursive:true});
const expected={current:JSON.parse(await readFile(path.join(run,'qa/authoring.json'),'utf8')).files,baseline:JSON.parse(await readFile(path.join(baseline,'qa/authoring.json'),'utf8')).files};
const validators={};for(const side of ['r','l'])for(const lod of [0,1]){const file=`glove-${side}-lod${lod}.glb`,bytes=await readFile(path.join(run,'candidate',file));validators[file]=await validator.validateBytes(bytes,{uri:file,maxIssues:100});validators[file].source_sha256=createHash('sha256').update(bytes).digest('hex');expect(validators[file].issues.numErrors).toBe(0);}
await writeFile(path.join(run,'qa/gltf-validator.json'),JSON.stringify(validators,null,2));
const browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1500,height:1100}}),errors=[],rows=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4334/glove-tailoring/');await page.waitForFunction(()=>window.gloveReview?.state().ready);
 for(const revision of ['current','baseline'])for(const side of ['r','l'])for(const lod of [0,1]){
  await page.selectOption('#revision',revision);await page.selectOption('#side',side);await page.selectOption('#lod',String(lod));
  await page.waitForFunction(({revision,side,lod})=>{const s=window.gloveReview.state();return s.ready&&s.revision===revision&&s.side===side&&s.lod===lod},{revision,side,lod});
  const frames=revision==='current'?[0,9,18]:[0,18];
  for(const frame of frames)for(const view of ['palm','back','threequarter'])for(const surface of ['leather','clay']){
   await page.locator(`[data-frame="${frame}"]`).click();await page.selectOption('#view',view);await page.selectOption('#surface',surface);await page.waitForTimeout(60);
   const state=await page.evaluate(()=>{const {pose,...s}=window.gloveReview.state();return s;});expect(state.sha).toBe(expected[revision][`glove-${side}-lod${lod}.glb`]);expect(state.time).toBeCloseTo(frame/24);expect(state.clay).toBe(surface==='clay');expect(state.boneCount).toBe(16);
   const file=`${revision}-${side}-lod${lod}-${frame}-${view}-${surface}.png`;await page.locator('#stage').screenshot({path:path.join(out,file)});rows.push({...state,frame,view,surface,file});
  }
 }
 await page.selectOption('#revision','current');await page.selectOption('#side','r');await page.selectOption('#lod','0');await page.waitForFunction(()=>{const s=window.gloveReview.state();return s.ready&&s.revision==='current'&&s.side==='r'&&s.lod===0;});
 await page.locator('[data-frame="9"]').click();const currentPose=(await page.evaluate(()=>window.gloveReview.state())).pose;
 await page.selectOption('#revision','baseline');await page.waitForFunction(()=>{const s=window.gloveReview.state();return s.ready&&s.revision==='baseline';});
 const baselinePose=await page.evaluate(()=>window.gloveReview.state());expect(baselinePose.time).toBeCloseTo(.375);expect(baselinePose.pose.length).toBe(currentPose.length);
 const poseError=Math.max(...currentPose.map((v,i)=>Math.abs(v-baselinePose.pose[i])));expect(poseError).toBeLessThan(1e-6);
 await page.selectOption('#revision','current');await page.waitForFunction(()=>window.gloveReview.state().ready);await page.selectOption('#surface','leather');await page.selectOption('#view','threequarter');
 await page.locator('[data-frame="0"]').click();await page.click('#play');await page.waitForTimeout(430);await page.click('#pause');const stopped=await page.evaluate(()=>window.gloveReview.state());expect(stopped.time).toBeGreaterThan(.2);await page.waitForTimeout(100);expect((await page.evaluate(()=>window.gloveReview.state())).time).toBe(stopped.time);
 await page.locator('[data-frame="18"]').click();await expect(page.locator('#name')).toHaveText('掌面與指形修整 · 右手');await expect(page.locator('#clock')).toHaveText('0.75 / 2.00 秒');expect(await page.locator('body').textContent()).not.toContain('\uFFFD');
 await page.screenshot({path:path.join(run,'qa/still.png')});await copyFile(path.join(run,'qa/still.png'),path.join(site,'still.png'));
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'mobile.png')});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const failure=await browser.newPage();await failure.route('**/models/current/glove-r-lod0.glb',route=>route.fulfill({status:503,body:''}));await failure.goto('http://127.0.0.1:4334/glove-tailoring/');await expect(failure.locator('#error')).toHaveText('Error: 模型載入失敗');await failure.close();
 expect(errors).toEqual([]);await writeFile(path.join(out,'report.json'),JSON.stringify({pass:true,rows,pose_switch_error:poseError,play_pause:true,chinese_dom_and_load_error:true,mobile_overflow:false,errors},null,2));console.log(JSON.stringify({pass:true,views:rows.length,poseError,errors}));
}finally{await browser.close();}
