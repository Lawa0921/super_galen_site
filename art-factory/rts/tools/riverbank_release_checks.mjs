import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),validator=require(path.resolve('tmp/rts/handoff-20261006/validator/node_modules/gltf-validator'));
const run='art-factory/rts/runs/riverbank/2026-10-07-v1';
await mkdir(`${run}/qa/runtime`,{recursive:true});
const validation=await validator.validateBytes(new Uint8Array(await readFile('public/assets/games/rts/models/stone-bridge.glb')),{uri:'stone-bridge-level.glb',maxIssues:100});
await writeFile(`${run}/qa/runtime/bridge-validator.json`,JSON.stringify(validation,null,2)+'\n');
expect(validation.issues.numErrors).toBe(0);expect(validation.issues.numWarnings).toBe(0);
const browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/models/stone-bridge-baseline.glb',route=>route.fulfill({status:404,body:'Expected test failure'}));
 await page.goto('http://127.0.0.1:4334/riverbank/');await page.waitForFunction(()=>window.riverbankReview?.state().ready);await page.click('#original');await expect(page.locator('#error')).toBeVisible();
 expect((await page.evaluate(()=>window.riverbankReview.state())).ready).toBe(false);
 await page.click('#candidate');await page.waitForFunction(()=>window.riverbankReview.state().ready);await expect(page.locator('#error')).toBeHidden();
 await page.unroute('**/models/stone-bridge-baseline.glb');const rows=[];
 for(const candidate of [false,true]){
  await page.click(candidate?'#candidate':'#original');await page.waitForFunction(v=>{const s=window.riverbankReview.state();return s.ready&&s.candidate===v;},candidate);
  await page.selectOption('#view','overview');await page.waitForTimeout(500);
  const sample=await page.evaluate(()=>new Promise(resolve=>{const deltas=[];let previous=performance.now();function frame(now){deltas.push(now-previous);previous=now;if(deltas.length<180)requestAnimationFrame(frame);else{const sorted=deltas.slice(10).sort((a,b)=>a-b);resolve({median:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],...window.riverbankReview.state()});}}requestAnimationFrame(frame);}));rows.push(sample);
 }
 expect(rows[1].p95).toBeLessThanOrEqual(Math.max(50,rows[0].p95*1.5+5));expect(errors).toEqual([]);
 const report={pass:true,device:'local headless Chromium; preview scene, not army stress benchmark',rows,missing_baseline_error_and_recovery:true,page_errors:errors,validator:{errors:validation.issues.numErrors,warnings:validation.issues.numWarnings,infos:validation.issues.numInfos},runtime_integration:true};
 await writeFile(`${run}/qa/runtime/release-checks.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}
