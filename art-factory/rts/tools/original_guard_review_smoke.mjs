import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..','..');
const base=process.env.RTS_REVIEW_URL??'http://127.0.0.1:4322/art-factory/rts/review/original-guard.html';
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--enable-gpu','--force_high_performance_gpu']});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  if(process.env.RTS_REVIEW_BUNDLE){
    await page.route('**/art-factory/rts/review/original-guard.js',route=>route.fulfill({path:path.resolve(process.env.RTS_REVIEW_BUNDLE),contentType:'text/javascript'}));
  }
  await page.goto(base,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.guardReview?.ready===true,{timeout:30000});
  assert.equal(await page.locator('[data-state="load-error"]').count(),0);
  assert.equal((await page.locator('[data-status]').textContent()).trim(),'候選模型 · 全身驗收中');
  for(const id of ['idle','walk','attack','hurt','death'])assert.equal(await page.locator(`[data-action="${id}"]`).count(),1);
  for(const id of ['front','side','back','threequarter'])assert.equal(await page.locator(`[data-view="${id}"]`).count(),1);
  for(const id of ['blue','red'])assert.equal(await page.locator(`[data-team="${id}"]`).count(),1);
  for(const id of ['0','1'])assert.equal(await page.locator(`[data-lod="${id}"]`).count(),1);
  const initial=await page.evaluate(()=>window.guardReview.state());
  assert.ok(initial.meshes>0,'GLB mesh must be rendered');
  assert.ok(initial.drawCalls>0,'WebGL renderer must draw the selected model');
  assert.equal(initial.selectedModel,'original-guard-assembly-lod0.glb');
  assert.equal(initial.animation,'Idle');
  for(const [action,clip] of [['idle','Idle'],['walk','Walk'],['attack','Attack'],['hurt','Hurt'],['death','Death']]){
    await page.locator(`[data-action="${action}"]`).click();
    assert.equal((await page.evaluate(()=>window.guardReview.state())).animation,clip);
  }
  await page.locator('[data-action="attack"]').click();
  const attack=await page.evaluate(()=>window.guardReview.state());
  assert.equal(attack.animation,'Attack');
  assert.equal(await page.locator('[data-contact-marker]').count(),1);
  await page.locator('[data-play]').click();
  await page.waitForTimeout(180);
  const playing=await page.evaluate(()=>window.guardReview.state());
  assert.ok(playing.time>.08&&playing.playing,'play must advance the selected clip');
  await page.locator('[data-pause]').click();
  assert.equal((await page.evaluate(()=>window.guardReview.state())).playing,false);
  const seek=async(seconds)=>page.locator('[data-scrubber]').evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},seconds);
  const pose=()=>page.evaluate(()=>window.guardReview.state().poseSignature);
  const poseChecks=[];
  for(const lodId of ['0','1']){
    await page.locator(`[data-lod="${lodId}"]`).click();
    await page.locator('[data-action="attack"]').click();
    await seek(.5333);
    await page.locator('[data-pause]').click();
    const immediateSeekPose=await pose();
    await page.waitForTimeout(200);
    assert.ok((await pose())===immediateSeekPose,`LOD ${lodId} selectAction → immediate seek .533 → pause must hold the actual pose`);
    await seek(.2);
    const poseAt02=await pose();
    await seek(.5333);
    const poseAtContact=await pose();
    assert.ok(typeof poseAt02==='string'&&poseAt02.length>0,`LOD ${lodId} must expose a real bone/world pose signature`);
    assert.ok(poseAtContact!==poseAt02,`LOD ${lodId} scrub from .2 to .533 must change the actual pose`);
    const scrubState=await page.evaluate(()=>window.guardReview.state());
    assert.ok(Math.abs(scrubState.time-.5333)<.002,'scrubber must seek the real clip time: '+JSON.stringify(scrubState));
    await page.waitForTimeout(50);
    await page.locator('[data-pause]').click();
    const pausedPose=await pose();
    await page.waitForTimeout(200);
    assert.ok((await pose())===pausedPose,`LOD ${lodId} pose must stay fixed while paused`);
    await page.locator('[data-play]').click();
    await page.waitForTimeout(200);
    const playedPose=await pose();
    assert.ok(playedPose!==pausedPose,`LOD ${lodId} pose must advance after play`);
    poseChecks.push({lod:lodId,scrubChangedPose:poseAtContact!==poseAt02,pauseStable:true,playAdvanced:playedPose!==pausedPose,immediateSeekStable:true});
    await page.locator('[data-pause]').click();
  }
  await page.locator('[data-lod="1"]').click();
  const lod1=await page.evaluate(()=>window.guardReview.state());
  assert.equal(lod1.selectedModel,'original-guard-assembly-lod1.glb');
  assert.notEqual(lod1.triangles,initial.triangles,'LOD switch must display the distinct authored GLB');
  await page.locator('[data-team="red"]').click();
  assert.equal((await page.evaluate(()=>window.guardReview.state())).team,'red');
  await page.locator('[data-view="back"]').click();
  assert.equal((await page.evaluate(()=>window.guardReview.state())).view,'back');
  await page.locator('[data-action="idle"]').click();
  await page.locator('[data-view="front"]').click();
  await page.locator('[data-team="blue"]').click();
  await page.locator('[data-lod="0"]').click();
  await page.screenshot({path:path.join(repoRoot,'art-factory','rts','runs','original-guard-assembly','2026-10-05','qa','review-page.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'pass',url:base,initial:{meshes:initial.meshes,vertices:initial.vertices,triangles:initial.triangles,drawCalls:initial.drawCalls,selectedModel:initial.selectedModel},attack:{animation:attack.animation,time:attack.time,duration:attack.duration,contactGate:attack.contactGate},poseChecks,errors}));
} finally { await browser.close(); }
