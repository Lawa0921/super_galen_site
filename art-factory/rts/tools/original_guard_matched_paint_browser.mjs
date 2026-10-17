import {chromium,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const run='art-factory/rts/runs/original-guard-matched-paint/2026-10-05',out=run+'/qa/browser',url='http://127.0.0.1:4322/'+run+'/review.html';
const sha=b=>createHash('sha256').update(b).digest('hex');await mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true});
try{const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
 await expect(page.getByRole('heading',{level:1})).toHaveText('依模型產生的原創上色參考');
 const routes=await page.locator('img').evaluateAll(nodes=>nodes.map(n=>new URL(n.src).pathname)),assets=[];
 for(const route of routes){const response=await page.request.get('http://127.0.0.1:4322'+route);expect(response.status()).toBe(200);const expected=sha(await readFile(route.slice(1)));expect(sha(await response.body())).toBe(expected);assets.push({route,sha256:expected});}
 await page.locator('img').evaluateAll(nodes=>Promise.all(nodes.map(n=>n.decode())));await page.screenshot({path:out+'/desktop.png'});
 await page.getByRole('link',{name:'原始生成圖',exact:true}).click();await expect(page).toHaveURL(/front-paintover.png$/);await page.goto(url);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:out+'/mobile.png'});expect(errors).toEqual([]);
 await writeFile(out+'/report.json',JSON.stringify({status:'reference_gallery_pass_projection_source_rejected',runtime_publish_allowed:false,url,assets,errors},null,2)+'\n');console.log(JSON.stringify({assets:assets.length,errors}));
}finally{await browser.close();}
