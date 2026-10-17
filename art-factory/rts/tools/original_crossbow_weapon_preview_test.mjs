import {chromium,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const run=path.resolve('art-factory/rts/runs/original-crossbow-weapon/2026-10-06-v1'),out=path.join(run,'qa/weapon-only-browser');await mkdir(out,{recursive:true});
const expected=JSON.parse(await readFile(path.join(run,'geometry-candidate/weapon-candidate-report.json'),'utf8')).files;
const browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[],rows=[];page.on('pageerror',e=>errors.push(e.message));
 const response=await page.goto('http://127.0.0.1:4334/crossbow-weapon.html');expect(response.status()).toBe(200);await page.waitForFunction(()=>window.weaponReview?.state().ready);
 for(const lod of [0,1]){
  await page.selectOption('#lod',String(lod));await page.waitForFunction(l=>{const s=window.weaponReview.state();return s.ready&&s.lod===l},lod);
  const state=await page.evaluate(()=>window.weaponReview.state());expect(state.sha).toBe(expected[`original-crossbow-grip-lod${lod}.glb`]);expect(state.visible.length).toBeGreaterThan(0);expect(state.visible.every(name=>name.startsWith(`CrossbowWeapon_LOD${lod}`))).toBe(true);expect(state.triangles).toBe(lod?416:960);expect(state.draws).toBeGreaterThan(0);
  await page.screenshot({path:path.join(out,`lod${lod}.png`)});rows.push(state);
 }
 await page.selectOption('#lod','0');await page.waitForFunction(()=>window.weaponReview.state().ready&&window.weaponReview.state().lod===0);
 const camera=(await page.evaluate(()=>window.weaponReview.state())).camera;
 const box=await page.locator('#stage').boundingBox();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.65,box.y+box.height*.55,{steps:10});await page.mouse.up();await page.waitForTimeout(150);
 expect((await page.evaluate(()=>window.weaponReview.state())).camera).not.toEqual(camera);
 await page.click('#spin');expect((await page.evaluate(()=>window.weaponReview.state())).spinning).toBe(true);await page.waitForTimeout(200);await page.click('#spin');expect((await page.evaluate(()=>window.weaponReview.state())).spinning).toBe(false);
 await page.click('#reset');await page.waitForTimeout(150);await page.screenshot({path:path.join(out,'desktop.png')});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});expect(errors).toEqual([]);
 await writeFile(path.join(out,'report.json'),JSON.stringify({pass:true,url:page.url(),rows,drag:true,spin_toggle:true,reset:true,mobile:true,errors},null,2));console.log(JSON.stringify({pass:true,lods:2,drag:true,spin_toggle:true,mobile:true,errors}));
}finally{await browser.close();}
