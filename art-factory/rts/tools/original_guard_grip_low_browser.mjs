import {chromium,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const run='art-factory/rts/runs/original-guard-grip-low/2026-10-05',out=run+'/qa/browser',url='http://127.0.0.1:4322/'+run+'/review.html';
const hash=b=>createHash('sha256').update(b).digest('hex');await mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true});
try{const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await expect(page.getByRole('heading',{level:1})).toHaveText('原創握柄低模候選：QA failed');
 const routes=await page.locator('img,a[download]').evaluateAll(nodes=>nodes.map(n=>new URL(n.src||n.href).pathname));expect(routes).toHaveLength(15);const assets=[];
 for(const route of routes){const response=await page.request.get('http://127.0.0.1:4322'+route);expect(response.status()).toBe(200);const expected=hash(await readFile(route.slice(1)));expect(hash(await response.body())).toBe(expected);assets.push({route,sha256:expected});}
 await page.locator('img').evaluateAll(nodes=>Promise.all(nodes.map(n=>n.decode())));await page.screenshot({path:out+'/desktop.png'});
 await page.getByRole('img',{name:'減面候選：四指掌面',exact:true}).click();await expect(page).toHaveURL(/four-finger-palm.png$/);await page.screenshot({path:out+'/finger-close.png'});
 await page.goto(url);await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:out+'/mobile.png'});
 await page.getByRole('region',{name:'局部量測表格，可水平捲動'}).scrollIntoViewIfNeeded();expect(await page.getByRole('region',{name:'局部量測表格，可水平捲動'}).evaluate(n=>n.scrollWidth>n.clientWidth)).toBe(true);expect(errors).toEqual([]);
 await writeFile(out+'/report.json',JSON.stringify({status:'rejected_candidate_gallery_pass',runtime_publish_allowed:false,url,assets,errors},null,2)+'\n');console.log(JSON.stringify({status:'rejected_candidate_gallery_pass',assets:assets.length,errors}));
}finally{await browser.close();}
