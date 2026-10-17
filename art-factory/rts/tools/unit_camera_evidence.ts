/** Usage: node node_modules/tsx/dist/cli.mjs <this> OUT_DIR unit=LOD0.glb,LOD1.glb [...]
 * Renders acceptance evidence with the real ModelInstance at the in-game camera (1080p, default span 48 and
 * max-zoom span 24) and at PORTRAIT_FRAMING. Uses RTS_BASE_URL (a dev server of this worktree).
 */
import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const [out,...specs]=process.argv.slice(2);
if(!out||!specs.length)throw new Error('Expected OUT_DIR and unit=lod0,lod1 specs');
await mkdir(out,{recursive:true});
const files:Record<string,Buffer>={};const sources:Record<string,unknown>={};
for(const spec of specs){
  const [unit,pair]=spec.split('=');const [lod0,lod1]=pair.split(',');
  for(const [lod,file] of [[0,lod0],[1,lod1]] as const){
    const bytes=await readFile(file);files[`${unit}-lod${lod}`]=bytes;
    sources[`${unit}-lod${lod}`]={path:file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  }
}
const units=[...new Set(specs.map(s=>s.split('=')[0]))];
const browser=await chromium.launch({headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11']});
const save=async(name:string,dataUrl:string)=>writeFile(path.join(out,name),Buffer.from(dataUrl.split(',')[1],'base64'));
try{
  const page=await browser.newPage({viewport:{width:1920,height:1080}});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/rts-unit-evidence*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><script type="module" src="/art-factory/rts/tools/unit_camera_evidence_scene.ts"></script></body></html>'}));
  await page.route('**/rts-ev-*.glb',route=>{const key=/rts-ev-(.+)\.glb/.exec(route.request().url())![1];return route.fulfill({contentType:'model/gltf-binary',body:files[key]});});
  await page.goto(`${process.env.RTS_BASE_URL??'http://127.0.0.1:4361'}/rts-unit-evidence?units=${units.join(',')}`);
  await page.waitForFunction(()=>!!(window as any).evidence,null,{timeout:120000});
  const clips=await page.evaluate(()=>(window as any).evidence.clips);
  const report:any={sources,clips,game:[],portrait:[],errors};
  const canvasShot=async(name:string)=>{const data=await page.evaluate(()=>document.querySelector('canvas')!.toDataURL('image/png'));await save(name,data);};
  for(const [label,span,scale] of [['default',48,4],['maxzoom',24,2]] as const){
    for(const phase of [.2,.45,.75]){
      const info=await page.evaluate(([s,p])=>(window as any).evidence.game(s,['idle','walk','attack'],p),[span,phase] as const);
      const stem=`game-${label}-p${Math.round(phase*100)}`;await canvasShot(`${stem}.png`);
      const w=span===48?440:820,h=span===48?330:620;
      await save(`${stem}-crop${scale}x.png`,await page.evaluate(([w,h,sc])=>(window as any).evidence.crop(960-w/2,540-h/2,w,h,sc),[w,h,scale] as const));
      report.game.push({file:`${stem}.png`,span,phase,...info});
    }
  }
  for(const unit of units)for(const clip of ['idle','walk','attack'])for(const phase of [.25,.6]){
    for(const size of [180,720]){
      await page.evaluate(([u,c,p,s])=>(window as any).evidence.portrait(u,c,p,s),[unit,clip,phase,size] as const);
      const file=`portrait-${unit}-${clip}-p${Math.round(phase*100)}-${size}.png`;await canvasShot(file);report.portrait.push({file,unit,clip,phase,size});
    }
  }
  if(process.env.RTS_INSPECT)for(const unit of units)for(const clip of ['idle','walk','attack'])for(const [fname,facing] of [['front',.6],['side',.6+Math.PI/2],['back',.6+Math.PI]] as const){
    await page.evaluate(([u,c,f])=>(window as any).evidence.inspect(u,c,.45,f,2.4),[unit,clip,facing] as const);
    await canvasShot(`inspect-${unit}-${clip}-${fname}.png`);
  }
  await writeFile(path.join(out,'evidence.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({errors,clips,files:report.game.length+report.portrait.length}));
}finally{await browser.close();}
