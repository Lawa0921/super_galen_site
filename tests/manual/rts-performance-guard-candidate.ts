/** Deliberate load fixture, not a natural gameplay acceptance test.
 * Measures real RAF intervals with 80 durable combat units and 20 buildings.
 * Run after starting the preview: node node_modules/tsx/dist/cli.mjs <this>
 * --candidate-art is diagnostic only and never establishes final-art performance.
 */
import {chromium,expect} from '@playwright/test';
import {writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import os from 'node:os';
import {candidateArtFixture} from '../e2e/rts-candidate-fixture';

const candidate=process.argv.includes('--candidate-art');
const guardRun=process.env.RTS_GUARD_CANDIDATE;if(!guardRun)throw new Error('RTS_GUARD_CANDIDATE required');
const frozenGuard=await Promise.all([0,1].map(async lod=>{const p=path.join(guardRun,'candidate',`original-guard-assembly-lod${lod}.glb`),bytes=await readFile(p);return {lod,bytes,path:p,sha256:createHash('sha256').update(bytes).digest('hex')};}));
const profiling=process.argv.includes('--profile');
const dedicated=process.argv.includes('--dedicated-gpu');
const activePortrait=process.argv.includes('--portrait');
const launchArgs=['--enable-gpu',...(dedicated?['--force_high_performance_gpu']:[])];
// Full Chromium new-headless permits hardware GPU use; headless-shell used SwiftShader.
const browser=await chromium.launch({channel:'chromium',headless:true,args:launchArgs});
try{
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  if(process.argv.includes('--no-msaa'))await page.addInitScript("const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,options){if(this.id==='rts-canvas'&&type==='webgl2')options={...options,antialias:false};return original.call(this,type,options);};");
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')console.log('BROWSER_ERROR',message.text());});
  if(candidate)await candidateArtFixture(page);
  // Isolate Vite hot reload only; gameplay networking/simulation/render rules are unchanged.
  await page.routeWebSocket(url=>url.hostname==='127.0.0.1'&&url.port==='4324'&&url.pathname==='/',ws=>{
    const server=ws.connectToServer();server.onMessage(message=>{let type;try{type=JSON.parse(String(message)).type;}catch{}if(type!=='full-reload'&&type!=='update')ws.send(message);});
  });
  for(const asset of frozenGuard)await page.route('**/assets/games/rts/models/guard'+(asset.lod?'-lod1':'')+'.glb',route=>route.fulfill({contentType:'model/gltf-binary',body:asset.bytes}));

  await page.goto((process.env.RTS_PERF_URL??process.env.RTS_BASE_URL??'http://127.0.0.1:4321')+'/games/rts');
  await page.addScriptTag({type:'module',url:process.env.RTS_PERF_FIXTURE??'/tests/manual/rts-performance-fixture.ts'});
  await page.locator('#rts-start').click();await page.locator('#rts-battle').waitFor({state:'visible',timeout:60000});
  await page.mouse.move(960,400);for(let i=0;i<10;i++)await page.mouse.wheel(0,300);
  if(activePortrait){
    const point=await page.evaluate(()=>{const a=(window as any).__rtsPerf;return a.screen(a.state.entities.find((e:any)=>e.kind==='knight'&&e.team===0),1.6);});
    await page.mouse.click(point.x,point.y);
    try{await expect(page.locator('#rts-portrait-view')).toHaveAttribute('data-kind','knight');}catch(error){
      await page.screenshot({path:'tmp/rts/performance-selection-failure.png'});
      const detail=await page.evaluate(()=>{const a=(window as any).__rtsPerf,u=a.state.entities.find((e:any)=>e.kind==='knight'&&e.team===0),r=a.renderer();return {unit:u,point:a.screen(u,1.6),canvas:r.domElement.getBoundingClientRect().toJSON(),time:a.state.time,selection:document.getElementById('rts-selection')?.textContent};});
      await writeFile('tmp/rts/performance-selection-failure.json',JSON.stringify({clicked:point,...detail},null,2)+'\n');throw error;
    }
  }
  await page.waitForTimeout(process.argv.includes('--late-timing')?35000:6000);
  console.log('DRAW_LOAD',await page.evaluate(()=>{const a=(window as any).__rtsPerf,r=a.renderer();return {draws:a.draws(),memory:r.info.memory,shadow:r.shadowMap.enabled};}));
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
  }else if(process.argv.includes('--timing')){
    await page.evaluate('window.__name = fn => fn'); // tsx name-preservation helper for serialized diagnostic wrappers.
    await page.evaluate(async()=>{
      const audit=(window as any).__rtsPerf,r=audit.renderer(),gl=r.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
      const result:any={render:[],animate:[],battlefield:[],clock:[],hud:[],gpu:[],extension:!!ext};audit.timing=result;
      const wrap=(object:any,key:string,bucket:string)=>{const original=object[key];object[key]=function(...args:any[]){const start=performance.now();try{return original.apply(this,args);}finally{result[bucket].push(performance.now()-start);}};};
      for(const [url,name,key,bucket] of [['/src/scripts/games/rts/models.ts','ModelInstance','animate','animate'],['/src/scripts/games/rts/scene.ts','Battlefield','render','battlefield'],['/src/scripts/games/rts/clock.ts','SimulationClock','frame','clock'],['/src/scripts/games/rts/hud.ts','Hud','render','hud']]){const module=await import(url);wrap(module[name].prototype,key,bucket);}
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
    await writeFile(`tmp/rts/performance-timing${process.argv.includes('--late-timing')?'-late':''}.json`,JSON.stringify(timing,null,2)+'\n');console.log('TIMING',JSON.stringify(timing));
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
  const cdp=profiling?await page.context().newCDPSession(page):null;
  if(cdp){await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});await cdp.send('Profiler.start');}
  await page.evaluate(()=>{(window as any).__rtsPerf.recording=true;});
  // Pointer motion while combat, rendering, HUD and 20Hz simulation continue.
  // Picking/commands are covered by the separate actual interaction E2E suite.
  const started=Date.now();let sampleIndex=0;
  while(Date.now()-started<60000){const i=sampleIndex++;await page.mouse.move(650+(i%11)*50,260+(i%7)*40);await page.waitForTimeout(200);}
  if(cdp){const {profile}=await cdp.send('Profiler.stop');await writeFile('tmp/rts/performance.cpuprofile',JSON.stringify(profile));
    const counts=new Map<number,number>();for(const id of profile.samples??[])counts.set(id,(counts.get(id)??0)+1);
    console.log('CPU_SELF',JSON.stringify(profile.nodes.map(n=>({name:n.callFrame.functionName,url:n.callFrame.url,line:n.callFrame.lineNumber+1,samples:counts.get(n.id)??0})).sort((a,b)=>b.samples-a.samples).slice(0,40)));}
  const result=await page.evaluate(()=>{
    const audit=(window as any).__rtsPerf;audit.recording=false;
    const sorted=[...audit.samples].sort((a:number,b:number)=>a-b),median=sorted[Math.floor(sorted.length*.5)],p95=sorted[Math.floor(sorted.length*.95)];
    const view=audit.getTeamView(audit.state,0),canvas=document.getElementById('rts-canvas') as HTMLCanvasElement,gl=canvas.getContext('webgl2')!,debug=gl.getExtension('WEBGL_debug_renderer_info');
    const onScreen=view.entities.filter((e:any)=>{const p=audit.screen(e);return p.x>=0&&p.x<innerWidth&&p.y>=0&&p.y<innerHeight;});
    return {frames:sorted.length,medianMs:median,medianFps:1000/median,p95Ms:p95,maxMs:Math.max(...sorted),
      units:audit.state.entities.filter((e:any)=>e.category==='unit'&&e.alive).length,buildings:audit.state.entities.filter((e:any)=>e.category==='building'&&e.alive).length,
      visibleUnits:view.entities.filter((e:any)=>e.category==='unit'&&e.alive).length,visibleBuildings:view.entities.filter((e:any)=>e.category==='building'&&e.alive).length,
      screenUnits:onScreen.filter((e:any)=>e.category==='unit'&&e.alive).length,screenBuildings:onScreen.filter((e:any)=>e.category==='building'&&e.alive).length,
      status:audit.state.status,simulationTime:audit.state.time,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,draws:audit.draws(),portraitKind:document.getElementById('rts-portrait-view')?.dataset.kind??null};
  });
  const name='guard-candidate-'+(candidate?'candidate':'formal')+(process.env.RTS_PERF_URL?'-production':'')+(profiling?'-profile':'')+(process.argv.includes('--no-msaa')?'-no-msaa':'')+(process.argv.includes('--flush')?'-flush':'')+(dedicated?'-dedicated':'')+(activePortrait?'-portrait':'');
  await page.screenshot({path:`tmp/rts/performance-${name}.png`});
  await writeFile(`tmp/rts/performance-${name}.json`,JSON.stringify({...result,candidateGuardOverrides:frozenGuard.map(({bytes,...row})=>row),devHotReloadFrozen:true,candidateArtFixture:candidate,flushDiagnostic:process.argv.includes('--flush'),warmupSeconds:process.argv.includes('--late-timing')?35:6,browser:browser.version(),os:[os.platform(),os.release(),os.arch()],launchArgs,errors},null,2)+'\n');
  console.log(JSON.stringify({...result,candidateGuardOverrides:frozenGuard.map(({bytes,...row})=>row),devHotReloadFrozen:true,candidateArtFixture:candidate,errors}));
  expect(errors).toEqual([]);expect(result.units).toBe(80);expect(result.buildings).toBe(20);
  if(activePortrait){expect(result.portraitKind).toBe('knight');expect(result.draws.portrait).toBeGreaterThan(0);expect(result.draws.world).toBeGreaterThan(700);}
  expect(result.visibleUnits).toBe(80);expect(result.visibleBuildings).toBe(20);expect(result.status).toBe('playing');
  expect(result.screenUnits).toBe(80);expect(result.screenBuildings).toBe(20);
  expect(result.medianFps).toBeGreaterThanOrEqual(55);expect(result.p95Ms).toBeLessThan(33);expect(result.maxMs).toBeLessThan(500);
  }
}finally{await browser.close();}
