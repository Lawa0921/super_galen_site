import {chromium,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const run='art-factory/rts/runs/original-guard-tabard/2026-10-05',out=run+'/qa/browser',url='http://127.0.0.1:4322/'+run+'/review.html';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function canvasPixels(path,minModelFraction){
 const {data,info}=await sharp(path).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let model=0,white=0,total=0;
 for(let y=4;y<info.height-4;y++)for(let x=4;x<info.width-4;x++){
  const i=(y*info.width+x)*4,r=data[i],g=data[i+1],b=data[i+2];total++;
  if(r>245&&g>245&&b>245)white++;
  if(r>60&&r<230&&g>70&&g<240&&b>80&&b<250)model++;
 }
 const result={width:info.width,height:info.height,model_fraction:model/total,white_fraction:white/total};
 expect(result.white_fraction,'canvas must not be a broken white bitmap').toBeLessThan(.05);
 expect(result.model_fraction,'visible cloth pixels').toBeGreaterThan(minModelFraction);return result;
}
if(process.argv.includes('--check-saved-canvas')||process.argv.includes('--check-rejected-canvas')){
 const fixture=process.argv.includes('--check-rejected-canvas')?run+'/qa/rejected-browser-capture/canvas-motion.png':out+'/canvas-motion.png';
 console.log(await canvasPixels(fixture,.08));process.exit(0);
}
await mkdir(out,{recursive:true});
const reference=JSON.parse(await readFile(run+'/qa/browser-reference.json','utf8'));
const browser=await chromium.launch({headless:true});
const errors=[],consoleIssues=[];let page;
try{
 page=await browser.newPage({viewport:{width:1440,height:1100}});
 page.on('console',msg=>{if(['error','warning'].includes(msg.type()))consoleIssues.push({type:msg.type(),text:msg.text()});});
 page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
 await expect(page.getByRole('heading',{level:1})).toHaveText('原創衛兵 · 布片分件與動作');
 const animations=await page.evaluate(()=>window.__tabardReview.ready);
 expect(animations).toHaveLength(1);expect(animations[0].name).toBe('OriginalTabardSwayStudy');
 const routes=await page.locator('img,a[download]').evaluateAll(nodes=>nodes.map(n=>new URL(n.src||n.href).pathname));
 expect(routes).toHaveLength(9);const assets=[];
 for(const route of routes){const r=await page.request.get('http://127.0.0.1:4322'+route);expect(r.status(),route).toBe(200);const expected=hash(await readFile(route.slice(1)));expect(hash(await r.body())).toBe(expected);assets.push({route,sha256:expected});}
 expect(assets.find(a=>a.route.endsWith('.glb')).sha256).toBe(reference.glb_sha256);
 const rest=await page.evaluate(()=>window.__tabardReview.seek(0));
 const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
 const expectedRest=reference.frames['0'].positions_gltf;
 const map=rest.map(p=>{let best=0,dist=Infinity;for(let i=0;i<expectedRest.length;i++){const d=distance(p,expectedRest[i]);if(d<dist){best=i;dist=d;}}expect(dist).toBeLessThan(1e-6);return best;});
 const poses=[];
 for(const frame of [0,5,10,15,20]){
  const actual=await page.evaluate(f=>window.__tabardReview.seek(f),frame);
  expect(actual.length).toBe(rest.length);const target=reference.frames[String(frame)].positions_gltf;
  const maxError=Math.max(...actual.map((p,i)=>distance(p,target[map[i]])));
  expect(maxError,`frame ${frame}`).toBeLessThan(5e-6);poses.push({frame,exported_vertices:actual.length,max_error_m:maxError});
 }
 await page.getByRole('button',{name:'播放擺動',exact:true}).click();
 await expect(page.getByRole('button',{name:'暫停擺動',exact:true})).toBeVisible();
 await page.waitForTimeout(200);await page.getByRole('button',{name:'暫停擺動',exact:true}).click();
 await page.locator('#frame').fill('5');await page.locator('#frame').dispatchEvent('input');
 await page.getByRole('button',{name:'正面',exact:true}).click();
 await page.locator('#motion').evaluate(n=>n.scrollIntoView({block:'start'}));
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 await page.screenshot({path:out+'/desktop-motion.png'});
 await page.locator('#cloth-view').screenshot({path:out+'/canvas-motion.png'});
 const desktopPixels=await canvasPixels(out+'/canvas-motion.png',.08);
 await page.getByRole('navigation').getByRole('link',{name:'正面',exact:true}).click();
 await page.locator('#front img').evaluateAll(nodes=>Promise.all(nodes.map(n=>n.decode())));await page.screenshot({path:out+'/front-comparison.png'});
 await page.setViewportSize({width:390,height:844});await page.getByRole('navigation').getByRole('link',{name:'3D 動作',exact:true}).click();
 await page.getByRole('button',{name:'側面',exact:true}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:out+'/mobile-motion.png'});
 await page.locator('#cloth-view').screenshot({path:out+'/mobile-canvas.png'});
 const mobilePixels=await canvasPixels(out+'/mobile-canvas.png',.002);expect(errors).toEqual([]);
 await writeFile(out+'/report.json',JSON.stringify({status:'browser_pose_parity_and_gallery_pass',runtime_publish_allowed:false,url,animations,assets,poses,desktopPixels,mobilePixels,consoleIssues,errors},null,2)+'\n');
 console.log(JSON.stringify({status:'browser_pose_parity_and_gallery_pass',assets:assets.length,poses,desktopPixels,mobilePixels,consoleIssues,errors}));
}catch(error){
 let capture;
 try{capture=await page.evaluate(()=>window.__tabardReview.capture());await writeFile(out+'/failed-render-buffer.png',Buffer.from(capture.png.split(',')[1],'base64'));delete capture.png;}catch(diagnosticError){capture={diagnostic_error:String(diagnosticError)};}
 await writeFile(out+'/report.json',JSON.stringify({status:'browser_failed',runtime_publish_allowed:false,url,error:String(error),capture,consoleIssues,errors},null,2)+'\n');
 throw error;
}finally{await browser.close();}
