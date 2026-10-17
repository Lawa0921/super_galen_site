import {chromium, expect} from '@playwright/test';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const run='art-factory/rts/runs/original-guard-grip-local/2026-10-05';
const out=run+'/qa/browser', url='http://127.0.0.1:4322/'+run+'/review.html';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1100}}), errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url);
  await expect(page.getByRole('heading',{level:1})).toHaveText('原創手套局部修補');
  const routes=await page.locator('img,a[download]').evaluateAll(nodes=>nodes.map(node=>new URL(node.src||node.href).pathname));
  expect(routes).toHaveLength(29);
  const assets=[];
  for(const route of routes) {
    const response=await page.request.get('http://127.0.0.1:4322'+route);
    expect(response.status()).toBe(200);
    const expected=hash(await readFile(route.slice(1)));
    expect(hash(await response.body())).toBe(expected);
    assets.push({route,sha256:expected});
  }
  await page.locator('img').evaluateAll(nodes=>Promise.all(nodes.map(node=>node.decode())));
  await page.screenshot({path:out+'/desktop.png'});
  await page.getByRole('img',{name:'局部修補 四指掌面',exact:true}).click();
  await expect(page).toHaveURL(/four-finger-palm.png$/);
  await page.goto(url);
  for(const name of ['可編輯 Blend','GLB']) {
    const downloaded=page.waitForEvent('download');
    await page.getByRole('link',{name,exact:true}).click();
    const item=await downloaded;
    expect(await item.failure()).toBeNull();
  }
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:out+'/mobile.png'});
  expect(errors).toEqual([]);
  await writeFile(out+'/report.json',JSON.stringify({status:'gallery_and_downloads_pass',runtime_publish_allowed:false,url,assets,downloads:2,errors},null,2)+'\n');
  console.log(JSON.stringify({assets:assets.length,downloads:2,errors}));
} finally {await browser.close();}
