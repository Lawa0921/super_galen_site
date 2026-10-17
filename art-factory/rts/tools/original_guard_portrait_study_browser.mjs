import {chromium,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const run='art-factory/rts/runs/original-guard-portrait-study/2026-10-05',out=run+'/qa/browser',url='http://127.0.0.1:4322/'+run+'/review.html';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function pixels(path){const {data,info}=await sharp(path).removeAlpha().raw().toBuffer({resolveWithObject:true});let white=0,model=0;for(let i=0;i<data.length;i+=3){if(data[i]>245&&data[i+1]>245&&data[i+2]>245)white++;if(data[i]>60&&data[i]<230&&data[i+1]>70&&data[i+1]<240&&data[i+2]>80&&data[i+2]<250)model++;}const report={width:info.width,height:info.height,white_fraction:white/(info.width*info.height),model_fraction:model/(info.width*info.height)};expect(report.white_fraction).toBeLessThan(.05);expect(report.model_fraction).toBeGreaterThan(.04);return{data,report};}
await mkdir(out,{recursive:true});const reference=JSON.parse(await readFile(run+'/qa/browser-reference.json','utf8'));
const browser=await chromium.launch({headless:true});let page;const errors=[],consoleIssues=[];
try{
 page=await browser.newPage({viewport:{width:1440,height:1100}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))consoleIssues.push({type:m.type(),text:m.text()});});
 await page.goto(url);await expect(page.getByRole('heading',{level:1})).toHaveText('原創守衛 · 會動的 3D 肖像');
 const animations=await page.evaluate(()=>window.__portraitReview.ready);expect(animations).toEqual([{name:'OriginalGuardPortraitIdle',duration:4}]);
 await page.evaluate(()=>window.__portraitReview.seek(0));const framing=await page.evaluate(()=>window.__portraitReview.framing());expect(framing.maxY-framing.minY,'helmet occupies at least half the portrait height').toBeGreaterThan(.98);expect(Math.max(framing.maxX,framing.maxY)).toBeLessThan(1);expect(Math.min(framing.minX,framing.minY)).toBeGreaterThan(-1);
 const routes=await page.locator('img,a[download]').evaluateAll(nodes=>nodes.map(n=>new URL(n.src||n.href).pathname));expect(routes).toHaveLength(9);const assets=[];
 for(const route of routes){const response=await page.request.get('http://127.0.0.1:4322'+route);expect(response.status()).toBe(200);const expected=hash(await readFile(route.slice(1)));expect(hash(await response.body())).toBe(expected);assets.push({route,sha256:expected});}
 expect(assets.find(a=>a.route.endsWith('.glb')).sha256).toBe(reference.glb_sha256);
 const rest=await page.evaluate(()=>window.__portraitReview.seek(0)),expectedRest=reference.frames['0'].positions_gltf;
 const key=p=>p.map(x=>Math.round(x/1e-5)).join(','),bins=new Map();expectedRest.forEach((p,i)=>{const k=key(p);if(!bins.has(k))bins.set(k,[]);bins.get(k).push(i);});
 const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
 const mapping=rest.map(p=>{const q=p.map(x=>Math.round(x/1e-5));let best=-1,d=Infinity;for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)for(const i of bins.get([q[0]+x,q[1]+y,q[2]+z].join(','))||[]){const value=distance(p,expectedRest[i]);if(value<d){d=value;best=i;}}expect(d).toBeLessThan(1e-6);return best;});
 const poses=[];
 for(const frame of [0,30,60,90,120]){const points=await page.evaluate(f=>window.__portraitReview.seek(f),frame);expect(points).toHaveLength(rest.length);const target=reference.frames[String(frame)].positions_gltf;const max_error_m=Math.max(...points.map((p,i)=>distance(p,target[mapping[i]])));expect(max_error_m).toBeLessThan(5e-6);const bounds=await page.evaluate(()=>window.__portraitReview.framing());expect(Math.max(bounds.maxX,bounds.maxY)).toBeLessThan(1);expect(Math.min(bounds.minX,bounds.minY)).toBeGreaterThan(-1);poses.push({frame,vertices:points.length,max_error_m,helmet_bounds:bounds});}
 await page.locator('#motion').evaluate(n=>n.scrollIntoView({block:'start'}));await page.getByRole('button',{name:'正面',exact:true}).click();
 for(const frame of [30,90]){await page.locator('#frame').fill(String(frame));await page.locator('#frame').dispatchEvent('input');await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.locator('#portrait-view').screenshot({path:out+'/pose-'+frame+'.png'});}
 const a=await pixels(out+'/pose-30.png'),b=await pixels(out+'/pose-90.png');expect(a.data.length).toBe(b.data.length);let changed=0;for(let i=0;i<a.data.length;i+=3)if(Math.max(...[0,1,2].map(c=>Math.abs(a.data[i+c]-b.data[i+c])))>8)changed++;
 const changed_fraction=changed/(a.data.length/3);expect(changed_fraction,'visible original head turn with fixed camera').toBeGreaterThan(.015);
 await page.getByRole('button',{name:'播放肖像',exact:true}).click();const start=Number(await page.locator('#frame').inputValue());await page.waitForTimeout(400);expect(Number(await page.locator('#frame').inputValue())).not.toBe(start);await page.getByRole('button',{name:'暫停肖像',exact:true}).click();
 const paused=await page.locator('#frame').inputValue();await page.waitForTimeout(100);expect(await page.locator('#frame').inputValue()).toBe(paused);
 await page.locator('#frame').fill('30');await page.locator('#frame').dispatchEvent('input');await page.screenshot({path:out+'/desktop.png'});
 await page.getByRole('button',{name:'側面',exact:true}).click();await page.locator('#portrait-view').screenshot({path:out+'/side.png'});await pixels(out+'/side.png');
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'正面',exact:true}).click();await page.locator('#motion').evaluate(n=>n.scrollIntoView({block:'start'}));expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:out+'/mobile.png'});await page.locator('#portrait-view').screenshot({path:out+'/mobile-canvas.png'});const mobile=await pixels(out+'/mobile-canvas.png');expect(errors).toEqual([]);
 const report={status:'portrait_browser_pose_and_visible_motion_pass',runtime_publish_allowed:false,url,animations,assets,poses,framing,desktop_pixels:a.report,mobile_pixels:mobile.report,changed_fraction,consoleIssues,errors};await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,poses,framing,changed_fraction,desktop_pixels:a.report,mobile_pixels:mobile.report,errors}));
}catch(error){await writeFile(out+'/report.json',JSON.stringify({status:'browser_failed',runtime_publish_allowed:false,error:String(error),consoleIssues,errors},null,2)+'\n');throw error;}finally{await browser.close();}
