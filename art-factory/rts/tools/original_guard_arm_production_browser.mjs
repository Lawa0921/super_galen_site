/** Real Chromium output parity, 1920×1080 world span 24, and portrait DOM rect. */
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonicalToGltf,mapVertices,comparePose} from './arm_pose_parity.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const worktree=path.resolve(here,'../../..');
const mainRoot='C:/Users/bag57/projects/super_galen_site';
const run='art-factory/rts/runs/original-guard-arm-production/2026-10-05';
const root=path.join(worktree,run),qa=path.join(root,'qa/browser');
const deps=path.join(mainRoot,'node_modules');
const require=createRequire(path.join(mainRoot,'package.json'));
const {chromium}=require('@playwright/test');
const sharp=require('sharp');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
             '.mjs':'text/javascript; charset=utf-8','.json':'application/json',
             '.glb':'model/gltf-binary','.png':'image/png','.css':'text/css'};
function server(){
  return createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://127.0.0.1'),pathname=decodeURIComponent(url.pathname);
      const external=pathname.startsWith('/__deps/');
      const base=external?deps:worktree;
      const relative=external?pathname.slice('/__deps/'.length):pathname.slice(1);
      const file=path.resolve(base,relative);
      if(!file.startsWith(path.resolve(base)+path.sep))throw Error('path outside server root');
      const info=await stat(file);
      if(!info.isFile())throw Error('not a file');
      res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream',
                         'Cache-Control':'no-store'});
      createReadStream(file).pipe(res);
    }catch(error){res.writeHead(404);res.end(String(error))}
  });
}
async function listen(s,port){await new Promise(resolve=>s.listen(port,'127.0.0.1',resolve))}
if(process.argv.includes('--serve')){
  const s=server();await listen(s,4340);console.log('ARM_PRODUCTION_PREVIEW http://127.0.0.1:4340/'+run+'/review.html');
}else{
  await mkdir(qa,{recursive:true});
  const s=server();await listen(s,0);
  const port=s.address().port,url=`http://127.0.0.1:${port}/${run}/review.html`;
  const browser=await chromium.launch({headless:true,args:['--enable-gpu','--force_high_performance_gpu']});
  const report={status:'browser_diagnostic',runtime_publish_allowed:false,url,
    glbSha256:sha(await readFile(path.join(root,'candidate/original-guard-arm-production-localanimated.glb'))),
    contextSha256:sha(await readFile(path.join(root,'candidate/original-guard-arm-production-source-context.glb'))),
    viewports:[],poses:[],errors:[]};
  try{
    const actual=JSON.parse(await readFile(path.join(root,'qa/blender-evaluated-vertices.json'),'utf8')).poses;
    const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
    page.on('pageerror',error=>report.errors.push(error.message));
    await page.goto(url);await page.waitForFunction(()=>window.armReview?.ready,{timeout:30000});
    const loaded=await page.evaluate(()=>window.armReview.sourceContextLoaded());
    if(!loaded)throw Error('Complete source context was not loaded');
    report.timing=await page.evaluate(()=>window.armReview.timing());
    const sourceNames=Object.keys(actual.idle).sort();
    const neutral=await page.evaluate(()=>window.armReview.positions());
    const mapping={};
    for(const name of sourceNames){
      if(!neutral[name])throw Error('Missing actual Three mesh '+name);
      mapping[name]=mapVertices(neutral[name],canonicalToGltf(actual.idle[name]),2e-5);
    }
    for(const pose of ['idle','bend60','bend75','bend90','combined']){
      await page.locator(`button[data-pose="${pose}"]`).click();
      const browserPoints=await page.evaluate(()=>window.armReview.positions());
      const objects={};
      for(const name of sourceNames)objects[name]=comparePose(
        browserPoints[name],canonicalToGltf(actual[pose][name]),mapping[name]);
      const file=`1920x1080-${pose}-full.png`;
      const full=await page.screenshot({path:path.join(qa,file)});
      const rect=await page.evaluate(()=>window.armReview.rect());
      const crop=file.replace('-full.png','-portrait-same-frame.png');
      await sharp(full).extract({left:Math.round(rect.x),top:Math.round(rect.y),
        width:Math.round(rect.width),height:Math.round(rect.height)}).toFile(path.join(qa,crop));
      report.poses.push({pose,fullScreenshot:file,portraitRect:rect,
        sameFramePortraitCrop:crop,objects});
    }
    report.viewports.push({width:1920,height:1080,worldSpanM:24,
      portraitOuterColumnPx:144,portraitContentRect:report.poses.at(-1).portraitRect});
    // Seeking after the clamped last frame must restart the same original clip.
    await page.locator('button[data-pose="idle"]').click();
    const restarted=await page.evaluate(()=>window.armReview.positions());
    report.afterEndIdle={};
    for(const name of sourceNames)report.afterEndIdle[name]=comparePose(
      restarted[name],canonicalToGltf(actual.idle[name]),mapping[name]);
    await page.setViewportSize({width:1024,height:768});
    await page.locator('button[data-pose="combined"]').click();
    const compactRect=await page.evaluate(()=>window.armReview.rect());
    const compactFull=await page.screenshot({path:path.join(qa,'1024x768-combined-full.png')});
    await sharp(compactFull).extract({left:Math.round(compactRect.x),top:Math.round(compactRect.y),
      width:Math.round(compactRect.width),height:Math.round(compactRect.height)})
      .toFile(path.join(qa,'1024x768-combined-portrait-same-frame.png'));
    report.viewports.push({width:1024,height:768,worldSpanM:24,
      portraitOuterColumnPx:96,portraitContentRect:compactRect,
      sameFramePortraitCrop:'1024x768-combined-portrait-same-frame.png'});
    report.maxThreeToBlenderM=Math.max(...report.poses.flatMap(row=>
      Object.values(row.objects).map(value=>value.maxDeviationM)),
      ...Object.values(report.afterEndIdle).map(value=>value.maxDeviationM));
    report.sourceContextLoaded=loaded;
    report.status=report.errors.length||report.maxThreeToBlenderM>2e-5?
      'browser_output_parity_failed':'browser_output_parity_pass_visual_rejected';
    await writeFile(path.join(qa,'report.json'),JSON.stringify(report,null,2)+'\n');
    console.log('ARM_PRODUCTION_BROWSER',report.status,report.maxThreeToBlenderM,
      report.viewports.map(v=>v.portraitContentRect.width+'x'+v.portraitContentRect.height),
      'errors',report.errors.length);
    if(report.status==='browser_output_parity_failed')throw Error('Browser pose parity failed; see saved report');
  }finally{await browser.close();await new Promise(resolve=>s.close(resolve))}
}
