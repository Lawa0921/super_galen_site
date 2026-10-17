import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const worktree=path.resolve(here,'../../..');
const run='art-factory/rts/runs/original-guard-clean-arm/2026-10-05';
const qa=path.join(worktree,run,'qa/browser');
const require=createRequire('C:/Users/bag57/projects/super_galen_site/package.json');
const {chromium}=require('@playwright/test');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.glb':'model/gltf-binary','.png':'image/png'};
const server=createServer(async(req,res)=>{try{
  const filename=path.resolve(worktree,decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1));
  if(!filename.startsWith(worktree+path.sep)||(await stat(filename)).isFile()===false)throw Error('bad path');
  res.writeHead(200,{'Content-Type':types[path.extname(filename)]??'application/octet-stream'});
  createReadStream(filename).pipe(res);
}catch(error){res.writeHead(404);res.end(String(error))}});
const serve=process.argv.includes('--serve');
await new Promise(resolve=>server.listen(serve?4341:0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/${run}/review.html`;
if(serve){console.log('CLEAN_ARM_PREVIEW',url);await new Promise(()=>{});}
const browser=await chromium.launch({headless:true,args:['--enable-gpu']});
const record={url,viewport:[1280,900],poses:[],errors:[],runtime_publish_allowed:false};
try{
  await mkdir(qa,{recursive:true});
  const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1});
  page.on('pageerror',error=>record.errors.push(error.message));
  await page.goto(url);await page.waitForFunction(()=>window.cleanArmReview?.ready,{timeout:30000});
  record.timing=await page.evaluate(()=>window.cleanArmReview.timing());
  const points={};
  const review=[['neutral',['front','back']],['bend75',['side']],
    ['bend90',['front','side','back']],['bend120',['front','side','back']],
    ['roll45',['front','side','back']]];
  for(const [pose,views] of review){
    let canonical=null;
    for(const view of views){
      await page.locator(`button[data-view="${view}"]`).click();
      await page.locator(`button[data-pose="${pose}"]`).click();
      const screenshot=`${pose}-${view}.png`;
      await page.screenshot({path:path.join(qa,screenshot)});
      const evaluated=await page.evaluate(()=>window.cleanArmReview.positions());
      if(canonical===null)canonical=evaluated;
      record.poses.push({pose,view,screenshot,objects:Object.fromEntries(Object.entries(evaluated).map(([name,p])=>[name,p.length]))});
    }
    points[pose]=canonical;
  }
  record.viewsExercised=['front','side','back'];
  await page.locator('button[data-pose="neutral"]').click();
  points.returnNeutral=await page.evaluate(()=>window.cleanArmReview.positions());
  await writeFile(path.join(qa,'browser-evaluated-vertices.json.gz'),gzipSync(JSON.stringify(points),{level:9}));
  record.status=record.errors.length?'browser_errors':'browser_rendered_pending_parity';
  await writeFile(path.join(qa,'capture.json'),JSON.stringify(record,null,2)+'\n');
  console.log('CLEAN_ARM_BROWSER',record.status,record.timing,record.poses.map(p=>p.screenshot));
  if(record.errors.length)throw Error(record.errors.join('; '));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
