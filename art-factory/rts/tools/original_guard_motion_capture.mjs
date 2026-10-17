/** Capture authored poses through the review UI and the real runtime loader. */
import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const run=path.resolve(repo,process.argv[2]??'art-factory/rts/runs/original-guard-assembly/2026-10-05');
const out=path.join(run,'qa/motion-frames');await mkdir(out,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytes=await Promise.all([0,1].map(lod=>readFile(path.join(run,'candidate',`original-guard-assembly-lod${lod}.glb`))));
const assets=bytes.map((value,lod)=>({lod,sha256:hash(value),bytes:value.length,snapshot:`motion-frames/source-lod${lod}.glb`}));
for(const asset of assets)await writeFile(path.join(run,'qa',asset.snapshot),bytes[asset.lod]);
const groups=[
  {lod:0,team:'blue',view:'front',action:'walk',times:[0,1/12,1/6,1/4,1/3,5/12,1/2,7/12]},
  {lod:0,team:'blue',view:'side',action:'walk',times:[0,1/12,1/6,1/4,1/3,5/12,1/2,7/12]},
  {lod:0,team:'blue',view:'threequarter',action:'attack',times:[0,.15,.3,.4,.5,16/30,.6,.75,.9,1.1]},
  {lod:0,team:'blue',view:'side',action:'attack',times:[0,.2,.4,16/30,.6,.8,1,1.2]},
  {lod:0,team:'blue',view:'threequarter',action:'death',times:[0,.2,.4,.6,.8,1,1.3,1.6]},
  {lod:0,team:'blue',view:'front',action:'hurt',times:[0,.1,.25,.5]},
  {lod:0,team:'blue',view:'threequarter',action:'idle',times:[0,.6,1.2,1.8]},
  {lod:1,team:'red',view:'threequarter',action:'walk',times:[0,1/6,1/3,1/2]},
  {lod:1,team:'red',view:'threequarter',action:'attack',times:[0,.3,16/30,.8]},
  {lod:1,team:'red',view:'threequarter',action:'death',times:[0,.4,.8,1.6]}
];
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--enable-gpu','--force_high_performance_gpu']});
const errors=[],captures=[],samePose=new Map();
try{
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/original-guard-assembly-lod*.glb',route=>route.fulfill({contentType:'model/gltf-binary',body:bytes[route.request().url().includes('lod1')?1:0]}));
  await page.goto(process.env.RTS_REVIEW_URL??'http://127.0.0.1:4322/art-factory/rts/review/original-guard.html',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.guardReview?.ready===true);
  const canvas=page.locator('#model-stage'),box=await canvas.boundingBox();
  if(!box)throw new Error('Review canvas is unavailable');
  const clip={x:Math.round(box.x+(box.width-Math.min(700,box.width))/2),y:Math.round(box.y),width:Math.round(Math.min(700,box.width)),height:Math.round(box.height)};
  for(const group of groups){
    for(const [key,value] of Object.entries(group).filter(([key])=>key!=='times'))await page.locator(`[data-${key}="${value}"]`).click();
    for(let index=0;index<group.times.length;index++){
      const time=group.times[index];
      await page.locator('[data-scrubber]').evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},time);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      const state=await page.evaluate(()=>window.guardReview.state());
      if(state.sha!==assets[group.lod].sha256||state.playing||Math.abs(state.time-time)>.0011)throw new Error('Loaded bytes or pose time differs from requested capture');
      if(state.animation.toLowerCase()!==group.action||state.lod!==group.lod||state.team!==group.team||state.view!==group.view)throw new Error('Visible selection differs from requested capture');
      const poseSha256=hash(state.poseSignature),poseKey=group.action+':'+state.time;
      if(samePose.has(poseKey)&&samePose.get(poseKey)!==poseSha256)throw new Error('The same authored pose differs across camera, team or LOD: '+poseKey);
      samePose.set(poseKey,poseSha256);
      const filename=`lod${group.lod}-${group.team}-${group.view}-${group.action}-${String(index).padStart(2,'0')}.jpg`;
      await page.screenshot({path:path.join(out,filename),type:'jpeg',quality:90,clip});
      captures.push({...group,times:undefined,time:state.time,filename,sha256:state.sha,poseSha256});
    }
    console.log(`Captured LOD${group.lod} ${group.view} ${group.action}: ${group.times.length} poses`);
  }
}catch(error){errors.push(error instanceof Error?error.message:String(error));}finally{await browser.close();}
const current=await Promise.all([0,1].map(lod=>readFile(path.join(run,'candidate',`original-guard-assembly-lod${lod}.glb`))));
const stale=current.some((value,lod)=>hash(value)!==assets[lod].sha256);
const report={status:errors.length||stale?'fail':'captured-for-visual-review',assets,errors,stale,visualApproval:false,captures};
await writeFile(path.join(run,'qa/motion-capture.json'),JSON.stringify(report,null,2)+'\n');
if(errors.length||stale)throw new Error('Capture has errors or candidate changed during review');
console.log(JSON.stringify({status:report.status,assets,frames:captures.length,out}));
