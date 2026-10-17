/** Browser verification of the original guard's source/candidate inspection gallery. */
import {chromium, expect} from '@playwright/test';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';

const review='art-factory/rts/runs/original-guard-quadri-scaled-review/2026-10-05';
const output=review+'/qa/browser';
const url='http://127.0.0.1:4322/'+review+'/review.html';
const hash=(value:Buffer)=>createHash('sha256').update(value).digest('hex');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1100}});
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url);
  await expect(page.getByRole('heading',{level:1})).toHaveText('原創衛兵 · 模型製作比較');
  const imagePaths=await page.locator('img').evaluateAll(nodes=>nodes.map(node=>new URL(node.src).pathname));
  expect(imagePaths.length).toBeGreaterThanOrEqual(16);
  const assets=[];
  for (const route of imagePaths) {
    const response=await page.request.get('http://127.0.0.1:4322'+route);
    expect(response.status(),route).toBe(200);
    const expected=hash(await readFile(route.slice(1)));
    expect(hash(await response.body()),route).toBe(expected);
    assets.push({path:route,sha256:expected});
  }
  await page.locator('#front img').evaluateAll(nodes=>Promise.all(nodes.map(node=>node.decode())));
  await page.screenshot({path:output+'/desktop-front.png'});
  await page.getByRole('navigation').getByRole('link',{name:'右手',exact:true}).click();
  await page.locator('#right-hand img').evaluateAll(nodes=>Promise.all(nodes.map(node=>node.decode())));
  expect(await page.evaluate(()=>location.hash)).toBe('#right-hand');
  await page.screenshot({path:output+'/desktop-hand.png'});
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('navigation').getByRole('link',{name:'頭盔與肩甲',exact:true}).click();
  await page.locator('#head-shoulders img').evaluateAll(nodes=>Promise.all(nodes.map(node=>node.decode())));
  const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
  await page.screenshot({path:output+'/mobile-head.png'});
  const downloads=await page.locator('a[download]').evaluateAll(nodes=>nodes.map(node=>new URL(node.href).pathname));
  for (const route of downloads) {
    const response=await page.request.get('http://127.0.0.1:4322'+route);
    expect(response.status()).toBe(200);
    const expected=hash(await readFile(route.slice(1)));
    expect(hash(await response.body())).toBe(expected);
    assets.push({path:route,sha256:expected});
  }
  expect(errors).toEqual([]);
  const report={status:'gallery_browser_pass',url,runtime_publish_allowed:false,assets,
    desktop:{width:1440,height:1100},mobile:dimensions,errors,
    nonClaim:'Inspection gallery and download parity only; this does not approve geometry, character art, rigging or animation.'};
  await writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,images:imagePaths.length,downloads:downloads.length,errors}));
} finally { await browser.close(); }
