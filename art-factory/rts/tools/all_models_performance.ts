/** Deliberate load fixture, not a natural gameplay acceptance test.
 * Measures real RAF intervals with 80 durable combat units and 20 buildings.
 * Run after starting the preview: node node_modules/tsx/dist/cli.mjs <this>
 * --candidate-art is diagnostic only and never establishes final-art performance.
 */
import {chromium,expect} from '@playwright/test';
import {writeFile,readFile,mkdir,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import os from 'node:os';
import {candidateArtFixture} from '../../../tests/e2e/rts-candidate-fixture';
import {installStallTrace} from '../../../tests/manual/rts-performance-stall-trace';
import {readTraceStream} from '../../../tests/manual/rts-performance-trace-stream';
import {installMainThreadMonitor,performanceGates} from '../../../tests/manual/rts-performance-main-thread';

const candidate=process.argv.includes('--candidate-art');
if(candidate)throw new Error('Release performance cannot use candidate art');
const releaseOut=process.env.RTS_PERF_OUT??'tmp/rts/continuation-20261006-2';await mkdir(releaseOut,{recursive:true});
const reportOut=process.env.RTS_PERF_OUT??'tmp/rts';
const comparison=undefined;
const assemblyRun=process.env.RTS_ASSEMBLY_RUN??'art-factory/rts/runs/all-models/2026-10-14-v1';
const published=process.env.RTS_ASSEMBLY_PUBLISHED==='1';
const manifest=JSON.parse(await readFile(assemblyRun+'/review-manifest.json','utf8'));
const urls=[...new Set(Object.values(manifest.assets).flatMap((a:any)=>[a.url,...(a.lod1?[a.lod1]:[])]))] as string[];
const auditedIds=urls.map(url=>url.replace('/assets/games/rts/models/','').replace(/\.glb$/,''));
const auditedPaths=new Map<string,string>();
const auditedBytes=new Map(await Promise.all(auditedIds.map(async id=>{
 let bytes,path='public/assets/games/rts/models/'+id+'.glb';
 if(!published){const staged=assemblyRun+'/candidate/'+id.split('/').pop()+'.glb';try{bytes=await readFile(staged);path=staged;}catch{}}
 bytes??=await readFile(path);auditedPaths.set('/assets/games/rts/models/'+id+'.glb',path);return [id,bytes] as const;
})));
const releasedAssets=auditedIds.map(id=>({url:'/assets/games/rts/models/'+id+'.glb',sha256:createHash('sha256').update(auditedBytes.get(id)!).digest('hex')}));
const candidateMaterials=new Map<string,string>();
if(!published){
  let packing:any;try{packing=JSON.parse(await readFile(assemblyRun+'/qa/lossless-packing.json','utf8'));}catch(error:any){if(error.code!=='ENOENT')throw error;}
  for(const material of packing?.materials??[]){const path=assemblyRun+'/'+material.file;candidateMaterials.set(material.url,path);auditedPaths.set(material.url,path);releasedAssets.push({url:material.url,sha256:material.sha256});}
}

const profiling=process.argv.includes('--profile');
const finishDiagnostic=process.argv.includes('--finish');
const chromeTrace=process.argv.includes('--chrome-trace');
if(chromeTrace&&(profiling||finishDiagnostic))throw new Error('Chrome process trace must run without V8 profiler or finish');
const stallTrace=process.argv.includes('--stall-trace')||finishDiagnostic||chromeTrace;
const dedicated=process.argv.includes('--dedicated-gpu');
const activePortrait=process.argv.includes('--portrait');
if(process.argv.includes('--shadow-proxy-experiment')&&!process.argv.includes('--timing'))throw new Error('Shadow proxy experiment is diagnostic only');
const launchArgs=['--mute-audio','--enable-gpu',...(dedicated?['--force_high_performance_gpu']:[])];
// Full Chromium new-headless permits hardware GPU use; headless-shell used SwiftShader.
const browser=await chromium.launch({channel:'chromium',headless:true,args:launchArgs});
try{
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  if(process.argv.includes('--cpu-overlay')){
    if(!process.argv.includes('--timing'))throw new Error('CPU overlay experiment is diagnostic only');
    await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type:any,options:any){return original.call(this,type,type==='2d'&&this.id==='rts-overlay'?{...options,willReadFrequently:true}:options);};});
  }
  if(!published)await page.route('**/assets/games/rts/models/**/*.glb',async route=>{
    const id=new URL(route.request().url()).pathname.replace('/assets/games/rts/models/','').replace(/\.glb$/,'');
    const bytes=auditedBytes.get(id);
    if(bytes)await route.fulfill({contentType:'model/gltf-binary',body:bytes});else await route.continue();
  });
  if(!published)await page.route('**/assets/games/rts/materials/unit-shared/*',async route=>{const url=new URL(route.request().url()).pathname,path=candidateMaterials.get(url);if(path)await route.fulfill({path,contentType:url.endsWith('.webp')?'image/webp':url.endsWith('.png')?'image/png':'image/jpeg'});else await route.continue();});
  if(process.argv.includes('--no-msaa'))await page.addInitScript("const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,options){if(this.id==='rts-canvas'&&type==='webgl2')options={...options,antialias:false};return original.call(this,type,options);};");
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')console.log('BROWSER_ERROR',message.text());});
  if(candidate)await candidateArtFixture(page);
  const servedAssets:Promise<{url:string;sha256:string}>[]=[],failedRequests:string[]=[];
  page.on('response',response=>{const url=new URL(response.url()).pathname;if(releasedAssets.some(a=>a.url===url))servedAssets.push(response.body().then(bytes=>({url,sha256:createHash('sha256').update(bytes).digest('hex')})));});
  page.on('requestfailed',request=>failedRequests.push(request.url()+': '+request.failure()?.errorText));

  await page.goto((process.env.RTS_PERF_URL??process.env.RTS_BASE_URL??'http://127.0.0.1:4321')+'/games/rts');
  await page.addScriptTag({type:'module',url:process.env.RTS_PERF_FIXTURE??'/tests/manual/rts-performance-fixture.ts'});
  try{
    await page.waitForFunction(()=>(window as any).__rtsPerfFixtureReady===true);
    await page.locator('#rts-start').click();await page.locator('#rts-battle').waitFor({state:'visible',timeout:60000});
  }catch(error){
    await page.screenshot({path:releaseOut+'/performance-startup-failure.png'});
    await writeFile(releaseOut+'/performance-startup-failure.json',JSON.stringify({error:String(error),errors,failedRequests,bodyText:await page.locator('body').innerText(),fixtureReady:await page.evaluate(()=>(window as any).__rtsPerfFixtureReady??false)},null,2));throw error;
  }

  // Zoom out to the fixture camera's 60 m span (the gameplay maximum): default 48 m + 3 wheel steps of 4 m.
  await page.mouse.move(960,400);for(let i=0;i<3;i++)await page.mouse.wheel(0,300);
  if(activePortrait){
    // Combat units are moving and can occlude the first knight. Reacquire a
    // live screen position and use another knight before recording performance.
    // This only changes portrait selection, never fixture positions or orders.
    let point={x:0,y:0};
    for(let attempt=0;attempt<15;attempt++){
      point=await page.evaluate(attempt=>{const a=(window as any).__rtsPerf,knights=a.state.entities.filter((e:any)=>e.kind==='knight'&&e.team===0);return a.screen(knights[attempt%knights.length],[2.1,1.6,.8][Math.floor(attempt/knights.length)%3]);},attempt);
      await page.mouse.click(point.x,point.y);await page.waitForTimeout(120);
      if(await page.locator('#rts-portrait-view').getAttribute('data-kind')==='knight')break;
    }
    try{await expect(page.locator('#rts-portrait-view')).toHaveAttribute('data-kind','knight');}catch(error){
      await page.screenshot({path:'tmp/rts/performance-selection-failure.png'});
      const detail=await page.evaluate(()=>{const a=(window as any).__rtsPerf,u=a.state.entities.find((e:any)=>e.kind==='knight'&&e.team===0),r=a.renderer();return {unit:u,point:a.screen(u,1.6),canvas:r.domElement.getBoundingClientRect().toJSON(),time:a.state.time,selection:document.getElementById('rts-selection')?.textContent};});
      await writeFile('tmp/rts/performance-selection-failure.json',JSON.stringify({clicked:point,...detail},null,2)+'\n');throw error;
    }
  }
  await page.waitForTimeout(process.argv.includes('--late-timing')?35000:6000);
  console.log('DRAW_LOAD',await page.evaluate(()=>{const a=(window as any).__rtsPerf,r=a.renderer();return {draws:a.draws(),memory:r.info.memory,shadow:r.shadowMap.enabled};}));
  const shadowRate=process.argv.find(a=>a.startsWith('--shadow-rate='));
  if(shadowRate){
    if(!process.argv.includes('--timing'))throw new Error('Shadow rate override is diagnostic only');
    await page.evaluate(rate=>{const a=(window as any).__rtsPerf,r=a.renderer(),render=r.render.bind(r);let last=-Infinity;r.shadowMap.autoUpdate=false;
      r.render=(scene:any,camera:any)=>{if(!scene.userData.rtsPortrait){const now=performance.now(),due=now-last>=1000/rate;r.shadowMap.needsUpdate=due;if(due)last=now;}return render(scene,camera);};
    },Number(shadowRate.split('=')[1]));
  }
  if(process.argv.includes('--flush'))await page.evaluate('(()=>{const r=window.__rtsPerf.renderer(),original=r.render.bind(r);r.render=(...args)=>{const result=original(...args);r.getContext().flush();return result;};})()');
  if(process.argv.includes('--textures')||process.argv.includes('--inventory')){
    const textures=await page.evaluate(()=>{const a=(window as any).__rtsPerf,textures=new Map(),images=new Set(),skeletons=new Set(),boneGroups=new Set();let skinnedMeshes=0,meshes=0;a.scene().traverse((o:any)=>{if(o.isSkinnedMesh){skinnedMeshes++;skeletons.add(o.skeleton);boneGroups.add(o.skeleton.bones.map((b:any)=>b.uuid).join(','));}if(o.isMesh){meshes++;for(const m of Array.isArray(o.material)?o.material:[o.material])for(const [slot,t] of Object.entries(m))if((t as any)?.isTexture){const texture=t as any;images.add(texture.source.data);textures.set(texture.uuid,{name:texture.name,slot,width:texture.image.width,height:texture.image.height,source:texture.source.uuid});}}});return {textures:[...textures.values()],images:images.size,meshes,skinnedMeshes,skeletons:skeletons.size,boneGroups:boneGroups.size};});
    await writeFile('tmp/rts/performance-textures.json',JSON.stringify(textures,null,2)+'\n');console.log('TEXTURES',JSON.stringify({...textures,textures:undefined,count:textures.textures.length,pixels:textures.textures.reduce((sum,t)=>sum+t.width*t.height,0)}));
  }
  if(process.argv.includes('--flush-pair')){
    await page.evaluate('(()=>{const a=window.__rtsPerf,r=a.renderer(),original=r.render.bind(r);a.flushEnabled=false;r.render=(...args)=>{const result=original(...args);if(a.flushEnabled)r.getContext().flush();return result;};})()');
    const stages=[];
    for(const stage of ['baseline','flush','baseline-after']){
      await page.evaluate(stage=>{const a=(window as any).__rtsPerf;a.flushEnabled=stage==='flush';a.samples=[];a.recording=true;},stage);
      for(let i=0;i<60;i++){await page.mouse.move(650+(i%11)*50,260+(i%7)*40);await page.waitForTimeout(200);}
      const result=await page.evaluate(()=>{const a=(window as any).__rtsPerf;a.recording=false;const s=a.samples.sort((x:number,y:number)=>x-y);return {frames:s.length,medianFps:1000/s[Math.floor(s.length*.5)],p95Ms:s[Math.floor(s.length*.95)],maxMs:Math.max(...s),render:a.renderer().info.render,projectiles:a.state.projectiles.length};});
      stages.push({stage,...result});console.log('FLUSH_PAIR',JSON.stringify(stages.at(-1)));
    }
    await writeFile('tmp/rts/performance-flush-pair.json',JSON.stringify(stages,null,2)+'\n');
  }else if(process.argv.includes('--shadow-inventory')){
    const inventory=await page.evaluate(async()=>{
      const a=(window as any).__rtsPerf,scene=a.scene(),rows:any[]=[],saved:any[]=[];
      scene.traverse((o:any)=>{if(!o.isMesh)return;const original=o.onBeforeShadow;saved.push([o,original]);o.onBeforeShadow=function(...args:any[]){
        original.apply(this,args);const g=args[4],group=args[6];let owner=o;while(owner.parent&&!owner.userData.entityId)owner=owner.parent;
        rows.push({name:o.name,owner:owner.userData.entityId??null,skinned:!!o.isSkinnedMesh,instances:o.isInstancedMesh?o.count:1,triangles:(group?.count??g.index?.count??g.attributes.position.count)/3*(o.isInstancedMesh?o.count:1),material:Array.isArray(o.material)?o.material.map((m:any)=>m.name):o.material.name,side:Array.isArray(o.material)?o.material.map((m:any)=>m.side):o.material.side});
      };});
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      for(const [o,original]of saved)o.onBeforeShadow=original;
      return {rows,entities:a.state.entities.map((e:any)=>({id:e.id,kind:e.kind})),draws:a.draws()};
    });
    await writeFile(`${reportOut}/shadow-inventory.json`,JSON.stringify(inventory,null,2)+'\n');
    console.log('SHADOW_INVENTORY',JSON.stringify({draws:inventory.rows.length,triangles:inventory.rows.reduce((s:number,r:any)=>s+r.triangles,0),skinnedTriangles:inventory.rows.filter((r:any)=>r.skinned).reduce((s:number,r:any)=>s+r.triangles,0)}));
  }else if(process.argv.includes('--timing')){
    if(process.argv.includes('--shadow-proxy-experiment'))console.log('SHADOW_PROXY',await page.evaluate(()=>{
      const w=window as any;w.__shadowProxyCounts=w.__installShadowProxyExperiment(w.__rtsPerf.renderer(),w.__rtsPerf.scene());return w.__shadowProxyCounts;
    }));
    await page.evaluate('window.__name = fn => fn'); // tsx name-preservation helper for serialized diagnostic wrappers.
    await page.evaluate(async()=>{
      const audit=(window as any).__rtsPerf,r=audit.renderer(),gl=r.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
      const result:any={render:[],animate:[],battlefield:[],clock:[],hud:[],gpu:[],extension:!!ext};audit.timing=result;
      const wrap=(object:any,key:string,bucket:string)=>{const original=object[key];object[key]=function(...args:any[]){const start=performance.now();try{return original.apply(this,args);}finally{result[bucket].push(performance.now()-start);}};};
      for(const [url,name,key,bucket] of [['/src/scripts/games/rts/models.ts','ModelInstance','animate','animate'],['/src/scripts/games/rts/scene.ts','Battlefield','render','battlefield'],['/src/scripts/games/rts/clock.ts','SimulationClock','frame','clock'],['/src/scripts/games/rts/hud.ts','Hud','render','hud']]){const constructor=(window as any).__rtsTimingHooks?.[name]??(await import(url))[name];wrap(constructor.prototype,key,bucket);}
      const original=r.render,queries:WebGLQuery[]=[];
      r.render=function(...args:any[]){
        while(queries.length&&gl.getQueryParameter(queries[0],gl.QUERY_RESULT_AVAILABLE)){const query=queries.shift()!;if(!gl.getParameter(ext.GPU_DISJOINT_EXT))result.gpu.push(gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6);gl.deleteQuery(query);}
        const query=ext?gl.createQuery():null;if(query)gl.beginQuery(ext.TIME_ELAPSED_EXT,query);
        const start=performance.now();const value=original.apply(this,args);result.render.push(performance.now()-start);
        if(query){gl.endQuery(ext.TIME_ELAPSED_EXT);queries.push(query);}return value;
      };audit.samples=[];audit.recording=true;
    });
    for(let i=0;i<60;i++){await page.mouse.move(650+(i%11)*50,260+(i%7)*40);await page.waitForTimeout(200);}
    const timing=await page.evaluate(()=>{const a=(window as any).__rtsPerf;a.recording=false;const summary:any={renderLoad:a.renderer().info.render,projectiles:a.state.projectiles.length};for(const [key,values] of Object.entries({...a.timing,frames:a.samples})){if(!Array.isArray(values)){summary[key]=values;continue;}const sorted=(values as number[]).sort((x,y)=>x-y);summary[key]={count:sorted.length,total:sorted.reduce((a,b)=>a+b,0),median:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)]};}return summary;});
    await writeFile(`${reportOut}/performance-timing${process.argv.includes('--late-timing')?'-late':''}.json`,JSON.stringify(timing,null,2)+'\n');console.log('TIMING',JSON.stringify(timing));
    if(process.argv.includes('--shadow-proxy-experiment')){const counts=await page.evaluate(()=>(window as any).__shadowProxyCounts);console.log('SHADOW_PROXY_COUNTS',JSON.stringify(counts));await writeFile(`${reportOut}/shadow-proxy-counts.json`,JSON.stringify(counts,null,2)+'\n');}
  }else if(process.argv.includes('--inventory')){console.log('INVENTORY_ONLY');}
  else if(process.argv.includes('--diagnose')){
    const diagnostic=[];
    const stages=process.argv.includes('--fog')?['baseline','no-fog','no-fog-half-resolution']:['baseline','no-shadow','half-resolution'];
    for(const stage of stages){
      await page.evaluate(stage=>{const a=(window as any).__rtsPerf,r=a.renderer();a.samples=[];a.recording=false;if(stage==='no-shadow')r.shadowMap.enabled=false;if(stage.includes('half-resolution')){r.shadowMap.enabled=true;r.setPixelRatio(.5);}if(stage==='no-fog')a.scene().traverse((o:any)=>{if(o.isMesh&&o.material?.map?.image?.width===192&&o.material?.transparent)o.visible=false;});},stage);
      await page.waitForTimeout(2000);await page.evaluate(()=>{(window as any).__rtsPerf.recording=true;});
      for(let i=0;i<35;i++){await page.mouse.move(650+(i%11)*50,260+(i%7)*40);await page.waitForTimeout(200);}
      const metrics=await page.evaluate(()=>{const a=(window as any).__rtsPerf;a.recording=false;const s=a.samples.sort((x:number,y:number)=>x-y);return {frames:s.length,medianFps:1000/s[Math.floor(s.length*.5)],p95Ms:s[Math.floor(s.length*.95)],render:a.renderer().info.render};});
      diagnostic.push({stage,...metrics});console.log('DIAGNOSTIC',JSON.stringify(diagnostic.at(-1)));
    }
    await writeFile('tmp/rts/performance-diagnostic.json',JSON.stringify(diagnostic,null,2)+'\n');
    process.exitCode=0;
  }else{
  const cdp=profiling||chromeTrace?await page.context().newCDPSession(page):null;
  if(chromeTrace)await cdp!.send('Tracing.start',{transferMode:'ReturnAsStream',streamFormat:'json',streamCompression:'gzip',traceConfig:{recordMode:'recordContinuously',traceBufferSizeInKb:65536,includedCategories:['viz','devtools.timeline','blink.user_timing','disabled-by-default-devtools.timeline.frame']}});
  await page.evaluate('window.__name = fn => fn');
  await page.evaluate(installMainThreadMonitor);
  if(stallTrace){await page.evaluate('window.__name = fn => fn');await page.evaluate(installStallTrace,{finish:finishDiagnostic});}
  const profileAnchor:any={};if(stallTrace)profileAnchor.beforeStart=await page.evaluate(()=>performance.now());
  if(profiling&&cdp){await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});await cdp.send('Profiler.start');}
  if(stallTrace)profileAnchor.afterStart=await page.evaluate(()=>performance.now());
  await page.evaluate(trace=>{const audit=(window as any).__rtsPerf;audit.recording=true;audit.mainThreadMonitor.start();if(trace)performance.mark('rts-trace-measurement-start');},chromeTrace);
  // Pointer motion while combat, rendering, HUD and 20Hz simulation continue.
  // Picking/commands are covered by the separate actual interaction E2E suite.
  const started=Date.now();let sampleIndex=0,triggeredAt:number|null=null,traceChecked=0;
  while(Date.now()-started<60000){const i=sampleIndex++;await page.mouse.move(650+(i%11)*50,260+(i%7)*40);await page.waitForTimeout(200);
    if(chromeTrace){const sample=await page.evaluate(from=>{const a=(window as any).__rtsPerf;return {count:a.samples.length,stall:a.samples.slice(from).some((n:number)=>n>=500)};},traceChecked);traceChecked=sample.count;if(sample.stall&&triggeredAt===null)triggeredAt=Date.now();if(triggeredAt!==null&&Date.now()-triggeredAt>=2000)break;}
  }
  const measurementEnd=await page.evaluate(()=>{const audit=(window as any).__rtsPerf;audit.recording=false;audit.mainThreadMonitor.finish();return performance.now();});
  if(stallTrace)profileAnchor.beforeStop=measurementEnd;
  if(profiling&&cdp){const {profile}=await cdp.send('Profiler.stop');await writeFile(`${reportOut}/performance.cpuprofile`,JSON.stringify(profile));
    const counts=new Map<number,number>();for(const id of profile.samples??[])counts.set(id,(counts.get(id)??0)+1);
    console.log('CPU_SELF',JSON.stringify(profile.nodes.map(n=>({name:n.callFrame.functionName,url:n.callFrame.url,line:n.callFrame.lineNumber+1,samples:counts.get(n.id)??0})).sort((a,b)=>b.samples-a.samples).slice(0,40)));}
  if(stallTrace)profileAnchor.afterStop=await page.evaluate(()=>performance.now());
  if(chromeTrace){
    await page.evaluate(()=>performance.mark('rts-trace-measurement-stop'));
    const completed=new Promise<any>((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Chrome trace completion timed out')),60000);cdp!.once('Tracing.tracingComplete',event=>{clearTimeout(timeout);resolve(event);});});
    await cdp!.send('Tracing.end');const info=await completed;if(!info.stream)throw new Error('Chrome trace stream missing');
    const file=await open(`${reportOut}/chrome-process-trace.json.gz`,'wx');let bytes=0;
    try{bytes=await readTraceStream(cdp as any,info.stream,async chunk=>{await file.write(chunk);});}finally{await file.close();}
    await writeFile(`${reportOut}/chrome-process-trace-meta.json`,JSON.stringify({scope:'diagnostic only; 64MiB rolling buffer; stopped two seconds after >=500ms RAF or at 60s',...info,bytes,triggeredAt,elapsedWallMs:Date.now()-started,profileAnchor},null,2)+'\n');
  }
  if(stallTrace){
    const trace=await page.evaluate(()=>{const trace=(window as any).__rtsPerf.stallTrace;trace.dispose();const {dispose,...data}=trace;return data;});
    await writeFile(`${reportOut}/stall-trace.json`,JSON.stringify({scope:'diagnostic only; wrappers/profile can affect timing',finishDiagnostic,profileAnchor,...trace},null,2)+'\n');
  }
  const mainThread=await page.evaluate(()=>{const {start,finish,...data}=(window as any).__rtsPerf.mainThreadMonitor;return data;});
  const mainThreadEvidence=JSON.stringify({scope:'design:148; 25ms timer lateness and Long Tasks within the measured window; visibility required',...mainThread},null,2)+'\n';
  await writeFile(`${reportOut}/main-thread-health.json`,mainThreadEvidence);
  const {heartbeats,longTasks,...mainThreadSummary}=mainThread;
  const result=await page.evaluate(()=>{
    const audit=(window as any).__rtsPerf;audit.recording=false;
    const sorted=[...audit.samples].sort((a:number,b:number)=>a-b),median=sorted[Math.floor(sorted.length*.5)],p95=sorted[Math.floor(sorted.length*.95)];
    const view=audit.getTeamView(audit.state,0),canvas=document.getElementById('rts-canvas') as HTMLCanvasElement,gl=canvas.getContext('webgl2')!,debug=gl.getExtension('WEBGL_debug_renderer_info');
    const onScreen=view.entities.filter((e:any)=>{const p=audit.screen(e);return p.x>=0&&p.x<innerWidth&&p.y>=0&&p.y<innerHeight;});
    return {frames:sorted.length,medianMs:median,medianFps:1000/median,p95Ms:p95,maxMs:Math.max(...sorted),contextLost:gl.isContextLost(),
      units:audit.state.entities.filter((e:any)=>e.category==='unit'&&e.alive).length,buildings:audit.state.entities.filter((e:any)=>e.category==='building'&&e.alive).length,
      visibleUnits:view.entities.filter((e:any)=>e.category==='unit'&&e.alive).length,visibleBuildings:view.entities.filter((e:any)=>e.category==='building'&&e.alive).length,
      screenUnits:onScreen.filter((e:any)=>e.category==='unit'&&e.alive).length,screenBuildings:onScreen.filter((e:any)=>e.category==='building'&&e.alive).length,
      status:audit.state.status,simulationTime:audit.state.time,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,draws:audit.draws(),portraitKind:document.getElementById('rts-portrait-view')?.dataset.kind??null};
  });
  const name=(comparison?'packaging-comparison-'+comparison:'release-'+(candidate?'candidate':'formal'))+(process.env.RTS_PERF_URL?'-production':'')+(profiling?'-profile':'')+(process.argv.includes('--no-msaa')?'-no-msaa':'')+(process.argv.includes('--flush')?'-flush':'')+(dedicated?'-dedicated':'')+(activePortrait?'-portrait':'');
  const scenarioAssets=await Promise.all(servedAssets);
  // The combat fixture does not instantiate every scenery/rubble model. Audit
  // their served bytes after the timed window; do not count them as rendered.
  const auditOnlyFetchedUrls=releasedAssets.filter(asset=>!scenarioAssets.some(row=>row.url===asset.url)).map(asset=>asset.url);
  await page.evaluate(async urls=>{await Promise.all(urls.map(async url=>{
    const response=await fetch(url);if(!response.ok)throw new Error(`Model audit HTTP ${response.status}: ${url}`);
    await response.arrayBuffer();
  }));},auditOnlyFetchedUrls);
  const browserAssets=await Promise.all(servedAssets);
  const gates=performanceGates(result,mainThread);
  for(const asset of releasedAssets){expect(browserAssets.find(a=>a.url===asset.url)?.sha256).toBe(asset.sha256);expect(createHash('sha256').update(await readFile(auditedPaths.get(asset.url)!)).digest('hex')).toBe(asset.sha256);}
  await writeFile(releaseOut+'/release-performance-served-assets.json',JSON.stringify({releasedAssets,browserAssets,failedRequests,auditOnlyFetchedUrls,scenarioAssets},null,2)+'\n');
  await page.screenshot({path:`${reportOut}/performance-${name}.png`});
  const report={...result,releasedAssets,browserAssets,auditOnlyFetchedUrls,scenarioAssets,candidateArtFixture:candidate,
    productionHarness:process.env.RTS_PRODUCTION_HARNESS?JSON.parse(process.env.RTS_PRODUCTION_HARNESS):null,verificationCompleted:false,
    packagingComparison:comparison??null,performanceThresholdPassed:gates.passed,performanceChecks:gates.checks,mainThread:mainThreadSummary,
    mainThreadEvidence:{path:`${reportOut}/main-thread-health.json`,sha256:createHash('sha256').update(mainThreadEvidence).digest('hex')},maxRafDiagnosticOnly:true,
    formalAcceptance:!comparison&&!profiling&&!stallTrace&&!process.argv.includes('--no-msaa')&&!process.argv.includes('--flush'),stallTraceDiagnostic:stallTrace,flushDiagnostic:process.argv.includes('--flush'),warmupSeconds:process.argv.includes('--late-timing')?35:6,browser:browser.version(),os:[os.platform(),os.release(),os.arch()],launchArgs,errors};
  await writeFile(`${reportOut}/performance-${name}.json`,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...result,mainThread:mainThreadSummary,performanceChecks:gates.checks,releasedAssets,browserAssets,candidateArtFixture:candidate,errors}));
  expect(errors).toEqual([]);expect(result.contextLost).toBe(false);expect(failedRequests).toEqual([]);expect(result.units).toBe(80);expect(result.buildings).toBe(20);
  // World-draw floor only proves the 80/20 workload rendered. Model polish merged guard/worker/knight/commander/raider
  // material primitives (24 fewer per 8-kind set), so the full scene now issues ~680 world draws instead of ~860.
  if(activePortrait){expect(result.portraitKind).toBe('knight');expect(result.draws.portrait).toBeGreaterThan(0);expect(result.draws.world).toBeGreaterThan(600);}
  expect(result.visibleUnits).toBe(80);expect(result.visibleBuildings).toBe(20);expect(result.status).toBe('playing');
  expect(result.screenUnits).toBe(80);expect(result.screenBuildings).toBe(20);
  if(!comparison)expect(gates.checks).toEqual({medianFps:true,p95FrameTime:true,completeMeasurement:true,timerResponsiveness:true,longTasks:true});
  report.verificationCompleted=true;await writeFile(`${reportOut}/performance-${name}.json`,JSON.stringify(report,null,2)+'\n');
  }
}finally{await browser.close();}
