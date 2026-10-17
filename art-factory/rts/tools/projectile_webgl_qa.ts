import {chromium,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const run=path.resolve('art-factory/rts/runs/projectiles/2026-10-05-v1'),browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:1200,height:675}}),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/rts-projectile-audit',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><script type="module" src="/art-factory/rts/tools/projectile_webgl_scene.ts"></script></body></html>'}));
  await page.route('**/rts-projectile-*.glb',async route=>route.fulfill({contentType:'model/gltf-binary',body:await readFile(path.join(run,'candidate',path.basename(new URL(route.request().url()).pathname).replace('rts-projectile-','')))}));
  await page.goto('http://127.0.0.1:4321/rts-projectile-audit');await page.waitForFunction(()=>!!(window as any).projectileAudit);
  const initial=await page.evaluate(()=>(window as any).projectileAudit.details());
  expect(initial.count).toBe(4);expect(initial.triangles).toBe(208);expect(initial.lost).toBe(false);
  initial.directions.forEach((v:number[],i:number)=>{expect(v[0]).toBeCloseTo(i%2?1:-1);expect(v[2]).toBeCloseTo(0);});
  await page.screenshot({path:path.join(run,'qa/three-flight.png')});
  await page.evaluate(()=>(window as any).projectileAudit.travel());const moving=await page.evaluate(()=>(window as any).projectileAudit.details());
  moving.directions.forEach((v:number[],i:number)=>{expect(Math.sign(v[0])).toBe(i%2?1:-1);expect(v[2]).toBeGreaterThan(0);});
  expect(moving.positions).not.toEqual(initial.positions);
  await page.evaluate(()=>(window as any).projectileAudit.expire());const expired=await page.evaluate(()=>(window as any).projectileAudit.details());
  expect(expired.count).toBe(0);expect(expired.draws).toBe(0);expect(errors).toEqual([]);
  const report={status:'pass',initial,moving,expired,errors};await writeFile(path.join(run,'qa/three.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}
