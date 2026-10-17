import {chromium,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const run='art-factory/rts/runs/original-guard-grip-channel/2026-10-05',out=run+'/qa/browser',url='http://127.0.0.1:4322/'+run+'/review.html';
const hash=b=>createHash('sha256').update(b).digest('hex');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
 await expect(page.getByRole('heading',{level:1})).toHaveText('原創衛兵 · 握柄通道修整');
 const routes=await page.locator('img,a[download]').evaluateAll(nodes=>nodes.map(n=>new URL(n.src||n.href).pathname));
 expect(routes).toHaveLength(12);
 const assets=[];
 for(const route of routes){const r=await page.request.get('http://127.0.0.1:4322'+route);expect(r.status(),route).toBe(200);const expected=hash(await readFile(route.slice(1)));expect(hash(await r.body())).toBe(expected);assets.push({route,sha256:expected});}
 await page.locator('#front img').evaluateAll(nodes=>Promise.all(nodes.map(n=>n.decode())));
 await page.screenshot({path:out+'/desktop.png'});
 await page.getByRole('navigation').getByRole('link',{name:'通道上方',exact:true}).click();
 await page.locator('#channel-top img').evaluateAll(nodes=>Promise.all(nodes.map(n=>n.decode())));
 await page.screenshot({path:out+'/channel.png'});
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('navigation').getByRole('link',{name:'指節側',exact:true}).click();
 await page.locator('#back img').evaluateAll(nodes=>Promise.all(nodes.map(n=>n.decode())));
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:out+'/mobile.png'});expect(errors).toEqual([]);
 await writeFile(out+'/report.json',JSON.stringify({status:'gallery_browser_pass',runtime_publish_allowed:false,url,assets,errors},null,2)+'\n');
 console.log(JSON.stringify({status:'gallery_browser_pass',assets:assets.length,errors}));
}finally{await browser.close();}
