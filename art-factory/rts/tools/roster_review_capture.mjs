// Headless WebGL review captures for a roster-expansion unit through the runtime ModelInstance.
// Needs an Astro dev server of THIS worktree (Vite compiles the scene module), e.g.
//   node node_modules/astro/bin/astro.mjs dev --host 127.0.0.1 --port 4398
// Usage: node roster_review_capture.mjs <run> <unit> <outDir> [port=4398] [compare=guard,knight]
import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const [run,unit,out,port='4398',compareArg='guard,knight']=process.argv.slice(2);
const base=`http://127.0.0.1:${port}`,compare=compareArg.split(',');
await mkdir(out,{recursive:true});
const registry=JSON.parse(await readFile('public/assets/games/rts/model-registry.json','utf8'));
const manifest={assets:{}};
for(const id of compare)manifest.assets[id]=registry.assets[id];
manifest.assets[unit]={url:`/roster-review/candidate/${unit}.glb`,lod1:`/roster-review/candidate/${unit}-lod1.glb`,status:'published',scale:1,yaw:0};
const html=`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#2a3438}</style></head><body><main id="stage"></main><script type="module" src="/art-factory/rts/tools/roster_review_scene.ts"></script></body></html>`;
const browser=await chromium.launch({headless:true,args:['--mute-audio','--enable-gpu','--force_high_performance_gpu']});
const shots=[],errors=[],served=[];
try{
  const page=await browser.newPage({viewport:{width:1400,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route(`${base}/roster-review/**`,async route=>{
    const url=new URL(route.request().url()),rel=url.pathname.replace('/roster-review/','');
    if(rel===''||rel==='index.html')return route.fulfill({contentType:'text/html',body:html});
    if(rel==='manifest.json')return route.fulfill({contentType:'application/json',body:JSON.stringify(manifest)});
    let file;
    if(rel.startsWith('candidate/'))file=path.join(run,rel);
    else if(rel.startsWith('materials/unit-shared/'))file=path.join(run,rel);
    else if(rel.startsWith('materials/detail-v1/'))file=path.join('public/assets/games/rts',rel);
    if(!file)return route.fulfill({status:404,body:''});
    const body=await readFile(file);served.push({path:rel,sha256:createHash('sha256').update(body).digest('hex'),bytes:body.length});
    return route.fulfill({body,contentType:file.endsWith('.glb')?'model/gltf-binary':file.endsWith('.png')?'image/png':'image/jpeg'});
  });
  await page.goto(`${base}/roster-review/`);
  try{await page.waitForFunction(()=>!!window.rosterReview,null,{timeout:180000});}catch(e){console.error(JSON.stringify(errors));throw e;}
  const R=(fn,...a)=>page.evaluate(([fn,a])=>window.rosterReview[fn](...a),[fn,a]);
  const shot=async(name,meta)=>{const file=path.join(out,name);await page.locator('canvas').screenshot({path:file});shots.push({file:name,...meta});};
  // Turntable stills, LOD0 and LOD1, at one shared scale.
  await R('show',[unit],0);const info=await R('info');
  const turn={min:[-1.5,0,-1.5],max:[1.5,2.7,1.5]};
  for(const lod of [0,1])for(const yaw of [0,45,90,135,180,225,270,315]){
    await R('pose','Idle',0,lod,yaw*Math.PI/180);await R('frame','front',turn,420,520);
    await shot(`turntable-lod${lod}-${String(yaw).padStart(3,'0')}.png`,{kind:'turntable',lod,yaw});
  }
  // Team colours, both teams, both LODs.
  for(const team of [0,1]){await R('show',[unit],team);for(const lod of [0,1]){await R('pose','Idle',0,lod,0);await R('frame','three-quarter',turn,420,520);await shot(`team-${team?'red':'blue'}-lod${lod}.png`,{kind:'team',team,lod});}}
  // Every clip as an 8-frame strip with a shared per-clip frame box; LOD0 and LOD1 for the clip set.
  await R('show',[unit],0);
  const clips=info[0].clips;
  for(const c of clips){
    const box=await R('sweepBox',c.name,30,0);
    for(const view of ['three-quarter','side'])for(let i=0;i<8;i++){
      const fraction=i/7;await R('pose',c.name,fraction,0,0);await R('frame',view,box,300,360);
      await shot(`clip-${c.name.toLowerCase()}-${view}-${i}.png`,{kind:'clip',clip:c.name,view,fraction,time:+(fraction*c.duration).toFixed(4)});
    }
    for(let i=0;i<8;i++){const fraction=i/7;await R('pose',c.name,fraction,1,0);await R('frame','three-quarter',box,300,360);await shot(`clip-${c.name.toLowerCase()}-lod1-${i}.png`,{kind:'clip-lod1',clip:c.name,fraction});}
  }
  // Side-by-side size comparison with published units (same team, same scale).
  const row=[compare[0],unit,...compare.slice(1)];await R('show',row,0,1.7);await R('ground',true);
  const cmp=await R('info');
  for(const view of ['front','three-quarter','game']){await R('pose','Idle',0,0,0);const b=await R('bounds');await R('frame',view,{min:[b.min[0]-.3,0,b.min[2]-.3],max:[b.max[0]+.3,b.max[1]+.1,b.max[2]+.3]},1100,560);await shot(`compare-${view}.png`,{kind:'compare',view,ids:row});}
  // Hand close-ups (LOD0): idle and the attack/cast key frames, both hands, two angles.
  await R('show',[unit],0);
  const keyFrames={Idle:[0],Attack:[.45,.53],CastBlast:[.33,.62]};
  for(const c of clips){const fr=keyFrames[c.name];if(!fr)continue;
    for(const fraction of fr)for(const side of ['R','L'])for(const view of ['three-quarter','front']){
      await R('pose',c.name,fraction,0,0);const box=await R('boneBox','Hand_'+side,.14);await R('frame',view,box,300,300,true);
      await shot(`hand-${c.name.toLowerCase()}-${Math.round(fraction*100)}-${side}-${view}.png`,{kind:'hand',clip:c.name,fraction,side,view});
    }}
  // RTS camera distance readability (LOD1 as the game switches below 48 px).
  await R('show',[unit],0);for(const team of [0,1]){await R('show',[unit],team);await R('pose','Idle',0,1,0);await R('frame','game',turn,96,96);await shot(`game-96-${team?'red':'blue'}.png`,{kind:'game-scale',team});}
  const report={unit,run,port:Number(port),errors,unitInfo:info,compare:cmp,shots,served:served.filter((v,i,s)=>s.findIndex(x=>x.path===v.path)===i)};
  await writeFile(path.join(out,'capture.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({shots:shots.length,errors,heights:cmp.map(c=>[c.id,+c.height.toFixed(3)])}));
  if(errors.length)process.exitCode=1;
}finally{await browser.close();}
