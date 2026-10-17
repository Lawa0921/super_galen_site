// Controlled UI fixture; validates real commands and simulation, not a natural match.
import {chromium,firefox,webkit,expect,type Page} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const output=process.env.RTS_LIFECYCLE_OUT??'art-factory/rts/runs/commercial-readiness/2026-10-09/qa/building-lifecycle-cues';
const candidatePath=process.env.RTS_LIFECYCLE_GLB,atlasPath=process.env.RTS_LIFECYCLE_FX;
if(!!candidatePath!==!!atlasPath)throw new Error('Candidate FX review requires both RTS_LIFECYCLE_GLB and RTS_LIFECYCLE_FX');
const candidate=candidatePath?await readFile(candidatePath):null,atlas=atlasPath?await readFile(atlasPath):null;
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const bindings={candidate:candidate?{path:candidatePath,sha256:sha(candidate)}:null,atlas:atlas?{path:atlasPath,sha256:sha(atlas)}:null};
const sourceHashes=[];for(const file of ['building-effects.ts','models.ts','scene.ts','building-lifecycle.ts','building-lifecycle-presentation.ts'])sourceHashes.push({path:file,sha256:sha(await readFile('src/scripts/games/rts/'+file))});
await mkdir(output,{recursive:true});const results=[];
const engines=Object.entries({chromium,firefox,webkit}).filter(([name])=>!process.env.RTS_LIFECYCLE_BROWSER||name===process.env.RTS_LIFECYCLE_BROWSER);
if(!engines.length)throw new Error('Unknown RTS_LIFECYCLE_BROWSER');
for(const [name,engine] of engines){
  const browser=await engine.launch(name==='chromium'?{channel:'chromium',headless:true,args:['--enable-gpu','--force_high_performance_gpu']}:{headless:true});
  let page:Page|undefined;const errors:string[]=[],requests:any[]=[],pending=new Set<string>();let beforeClick:unknown;
  try{
    page=await browser.newPage({viewport:{width:1600,height:1000}});
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('request',r=>{pending.add(r.url());requests.push({event:'request',url:r.url()});});
    page.on('requestfinished',r=>{pending.delete(r.url());requests.push({event:'finished',url:r.url()});});
    page.on('requestfailed',r=>{pending.delete(r.url());requests.push({event:'failed',url:r.url(),error:r.failure()?.errorText});});
    if(candidate&&atlas){
      await page.route('**/assets/games/rts/model-registry.json',async route=>{const response=await route.fetch(),data=await response.json();data.effects={building:{status:'published',url:'/assets/games/rts/effects/building-effects-atlas.png'}};await route.fulfill({json:data});});
      await page.route('**/assets/games/rts/models/house.glb',route=>route.fulfill({contentType:'model/gltf-binary',body:candidate}));
      await page.route('**/assets/games/rts/effects/building-effects-atlas.png',route=>route.fulfill({contentType:'image/png',body:atlas}));
    }
    await page.goto(`${process.env.RTS_BASE_URL??'http://127.0.0.1:4344'}/games/rts`);await page.waitForLoadState('networkidle');
    await page.addScriptTag({type:'module',content:`
      const path='/src/scripts/games/rts/main.ts',source=await(await fetch(path)).text();
      const {Battlefield}=await import(source.match(new RegExp('from "([^"]*scene[.]ts[^"]*)"'))[1]);
      const {mountRts}=await import(path),{createGame}=await import('/src/scripts/games/rts/simulation.ts');
      const {addUnit,addBuilding}=await import('/src/scripts/games/rts/state.ts'),{updateVisibility}=await import('/src/scripts/games/rts/visibility.ts');
      const {BuildingCueHistory}=await import('/src/scripts/games/rts/building-lifecycle.ts');
      const a={histories:new Map(),impacts:[],repairs:0,effectWitnesses:{},updateVisibility};window.buildingLifecycleReview=a;
      const render=Battlefield.prototype.render;Battlefield.prototype.render=function(view,dt,alpha){
        a.field=this;a.view=view;if(!a.focused){a.focused=true;this.focus({x:25,z:40});}
        for(const e of view.entities){if(e.category!=='building')continue;let h=a.histories.get(e.id);if(!h){h=new BuildingCueHistory();a.histories.set(e.id,h);}
          const cues=h.observe(e,view.time);a.impacts.push(...cues.impacts.map(c=>({...c,entityId:e.id})));a.repairs+=Number(cues.repair);}
        const result=render.call(this,view,dt,alpha);
        if(this.buildingEffects)for(const s of this.buildingEffects.root.children){if(s.visible&&!a.effectWitnesses[s.name])a.effectWitnesses[s.name]={time:view.time,position:s.position.toArray(),opacity:s.material.opacity,png:this.canvas.toDataURL()};}
        if(a.snapshot){const done=a.snapshot;a.snapshot=null;done(this.canvas.toDataURL());}return result;
      };
      const old=document.getElementById('rts'),root=old.cloneNode(true);old.replaceWith(root);
      mountRts(root,(...args)=>{const s=createGame(...args);s.aiEnabled=[false,false];s.entities=[];s.resources=[];s.map.blocked.fill(0);s.map.noBuild.fill(0);
        a.hall=addBuilding(s,0,'townhall',{x:14,z:48},true);addBuilding(s,1,'townhall',{x:82,z:78},true);
        a.cancel=addBuilding(s,0,'house',{x:22,z:36});a.cancel.construction=.5;a.cancel.hp=a.cancel.maxHp*.55;
        a.repair=addBuilding(s,0,'house',{x:30,z:45},true);a.repair.hp=a.repair.maxHp*.5;
        a.worker=addUnit(s,0,'worker',{x:33,z:45});a.worker.order={type:'hold'};
        a.enemy=addBuilding(s,1,'house',{x:32,z:34},true);a.enemy.hp=4;
        a.guard=addUnit(s,0,'guard',{x:27,z:33});a.guard.order={type:'hold'};
        a.state=s;updateVisibility(s);return s;
      });a.mounted=true;
    `});
    // Inline module load resolves before its top-level async imports complete.
    // Do not click the original root before the controlled mount replaces it.
    await page.waitForFunction(()=>!!(window as any).buildingLifecycleReview?.mounted);
    beforeClick=await page.evaluate(()=>({mounted:!!(window as any).buildingLifecycleReview?.mounted,status:document.getElementById('rts-load-status')?.textContent,disabled:(document.getElementById('rts-start') as HTMLButtonElement).disabled}));
    await page.locator('#rts-start').click();await expect(page.locator('#rts-battle')).toBeVisible({timeout:60000});
    await page.waitForFunction(()=>!!(window as any).buildingLifecycleReview?.field);
    const point=async(key:string)=>page!.evaluate(k=>{
      const a=(window as any).buildingLifecycleReview,e=a[k],f=a.field,r=f.canvas.getBoundingClientRect();
      for(const y of [.8,1.4,2.2,.1])for(const dx of [0,-.5,.5])for(const dz of [0,-.5,.5]){
        const p=f.screen({x:e.x+dx,z:e.z+dz},y),client={x:Math.round(p.x+r.left),y:Math.round(p.y+r.top)};
        if([[0,0],[-1,0],[1,0],[0,-1],[0,1]].every(([x,z])=>f.pick(client.x+x,client.y+z)?.entityId===e.id))return client;
      }throw new Error('No integer mouse target: '+k);
    },key);
    const click=async(key:string,right=false)=>{const p=await point(key);await page!.mouse.click(p.x,p.y,{button:right?'right':'left'});};
    const capture=async(file:string)=>{
      if(name==='webkit'){const png=await page!.evaluate(()=>new Promise<string>(resolve=>{(window as any).buildingLifecycleReview.snapshot=resolve;}));await writeFile(`${output}/${name}-${file}-native.png`,Buffer.from(png.split(',')[1],'base64'));}
      await page!.screenshot({path:`${output}/${name}-${file}.png`});
    };
    await click('cancel');await expect(page.locator('#rts-commands button[data-label="取消施工"]')).toBeVisible();
    const gold=await page.evaluate(()=>(window as any).buildingLifecycleReview.state.teams[0].gold);
    await page.locator('#rts-commands button[data-label="取消施工"]').click();
    await page.waitForFunction(()=>{const a=(window as any).buildingLifecycleReview;return a.cancel.removalReason==='cancelled'&&!a.view.entities.some((e:any)=>e.id===a.cancel.id)&&!a.field.models.has(a.cancel.id);});
    const cancellation=await page.evaluate(()=>{const a=(window as any).buildingLifecycleReview;return {reason:a.cancel.removalReason,gold:a.state.teams[0].gold,events:a.state.events.filter((e:any)=>e.entityId===a.cancel.id).map((e:any)=>e.type)};});
    expect(cancellation.gold).toBeGreaterThan(gold);expect(cancellation.events).toEqual(['construction-cancelled']);await capture('cancelled');
    await click('worker');await click('repair',true);
    await page.waitForFunction(()=>{const a=(window as any).buildingLifecycleReview;return a.worker.order.type==='repair'&&a.repair.repairCue?.sequence>2&&a.repairs>0;});
    const repair=await page.evaluate(()=>{const a=(window as any).buildingLifecycleReview;return {hp:a.repair.hp,maxHp:a.repair.maxHp,cue:a.repair.repairCue,observed:a.repairs};});
    expect(repair.hp).toBeGreaterThan(repair.maxHp*.5);await capture('repair');
    await click('guard');await click('enemy',true);
    await page.waitForFunction(()=>{const a=(window as any).buildingLifecycleReview;return !a.enemy.alive&&a.field.models.has(a.enemy.id)&&a.field.models.get(a.enemy.id).instance.root.userData.entityId===undefined;},undefined,{timeout:15000});
    // Pause through the actual UI so the dying instance stays available for QA.
    await page.locator('#rts-pause').click();
    const death=await page.evaluate(()=>{const a=(window as any).buildingLifecycleReview,v=a.field.models.get(a.enemy.id);return {reason:a.enemy.removalReason,deathTime:a.enemy.deathTime,time:a.state.time,paused:a.state.paused,cues:a.enemy.damageCues,observed:a.impacts.filter((c:any)=>c.entityId===a.enemy.id),pickable:v?.instance.root.userData.entityId!==undefined,visible:!!v};});
    expect(death.reason).toBe('combat');expect(death.paused).toBe(true);expect(death.visible).toBe(true);expect(death.pickable).toBe(false);expect(death.observed).toHaveLength(1);expect(death.cues[0].source).toBeDefined();
    const effects=()=>page!.evaluate(()=>{const a=(window as any).buildingLifecycleReview;return a.field.buildingEffects?.root.children.filter((s:any)=>s.visible).map((s:any)=>({name:s.name,position:s.position.toArray(),scale:s.scale.toArray(),opacity:s.material.opacity,rotation:s.material.rotation}));});
    const pausedEffects=atlas?await effects():null;
    await page.waitForTimeout(400);expect(await page.evaluate(()=>(window as any).buildingLifecycleReview.state.time)).toBe(death.time);await capture('combat-death-paused');
    if(atlas)expect(await effects()).toEqual(pausedEffects);
    await page.locator('#rts-resume').click();
    await page.waitForFunction(()=>{const a=(window as any).buildingLifecycleReview;return !a.field.models.has(a.enemy.id);},undefined,{timeout:8000});
    let effectReport:unknown=null;
    if(atlas){
      const witnesses=await page.evaluate(()=>(window as any).buildingLifecycleReview.effectWitnesses);
      expect(Object.keys(witnesses).sort()).toEqual(['damage-smoke','fire-ember','impact-dust','repair-sparks']);
      for(const [kind,w] of Object.entries(witnesses) as Array<[string,any]>){await writeFile(`${output}/${name}-${kind}-native.png`,Buffer.from(w.png.split(',')[1],'base64'));delete w.png;}
      expect(await page.evaluate(()=>{const a=(window as any).buildingLifecycleReview;return a.field.buildingEffects.timeline.observers.has(a.cancel.id);})).toBe(false);
      // A controlled visibility transition through the real team-visibility path.
      await page.locator('#rts-pause').click();
      await page.evaluate(()=>{const a=(window as any).buildingLifecycleReview;a.repair.team=1;a.repair.hp=a.repair.maxHp*.2;a.updateVisibility(a.state);a.state.tick++;});
      await page.waitForFunction(()=>{const a=(window as any).buildingLifecycleReview;return a.view.entities.some((e:any)=>e.id===a.repair.id&&e.team===1);});
      // Paused simulation does not refresh visibility: call the same real updater explicitly for this controlled fixture.
      await page.evaluate(()=>{const a=(window as any).buildingLifecycleReview;for(const e of a.state.entities)if(e.team===0){e.x=2;e.z=2;}a.updateVisibility(a.state);a.state.tick++;});
      await page.waitForFunction(()=>{const a=(window as any).buildingLifecycleReview;return !a.view.entities.some((e:any)=>e.id===a.repair.id)&&a.view.knownBuildings.some((e:any)=>e.id===a.repair.id);});
      expect(await effects()).toEqual([]);await capture('fog-effects-cleared');
      const pressure=await page.evaluate(async()=>{
        const modulePath='/src/scripts/games/rts/building-effects.ts',scenePath='/src/scripts/games/rts/scene.ts';
        const {BuildingEffectLayer}=await import(modulePath),sceneSource=await(await fetch(scenePath)).text();
        const THREE=await import(sceneSource.match(/import \* as THREE from "([^"]+)"/)![1]);
        const a=(window as any).buildingLifecycleReview,f=a.field,texture=f.library.buildingEffects(),cycles=[];
        const baseline={...f.renderer.info.memory,programs:f.renderer.info.programs.length},inputs=Array.from({length:100},(_,id)=>({building:{...a.repair,id,alive:true,construction:1,hp:1,damageCues:[],repairCue:undefined,removalReason:undefined},anchors:{impact:[[25,1,40]],repair:[[25,.2,40]]}}));
        for(let cycle=0;cycle<3;cycle++){
          const layer=new BuildingEffectLayer(texture),isolated=new THREE.Scene();isolated.add(layer.root);layer.update(inputs,a.state.time);
          f.renderer.info.reset();f.renderer.render(isolated,f.camera);const active={...f.renderer.info.memory,programs:f.renderer.info.programs.length},drawCalls=f.renderer.info.render.calls,pool=layer.root.children.length;
          layer.update([],a.state.time);const hidden=layer.root.children.every((s:any)=>!s.visible);layer.dispose();const after={...f.renderer.info.memory,programs:f.renderer.info.programs.length};cycles.push({pool,drawCalls,active,after,hidden});
        }
        f.render(a.view,0,1);return {baseline,cycles,glError:f.renderer.getContext().getError(),contextLost:f.renderer.getContext().isContextLost()};
      });
      for(const cycle of pressure.cycles){expect(cycle.pool).toBe(64);expect(cycle.drawCalls).toBe(64);expect(cycle.hidden).toBe(true);expect(cycle.after).toEqual(pressure.baseline);}
      expect(pressure.glError).toBe(0);expect(pressure.contextLost).toBe(false);
      effectReport={witnesses,pausedEffects,fogCleared:true,cancelObserverAbsent:true,pressure};
    }
    expect(errors).toEqual([]);results.push({browser:name,beforeClick,cancellation,repair,death,effects:effectReport,errors});
    await writeFile(`${output}/report.json`,JSON.stringify({status:results.length===engines.length?'passed':'partial',expectedBrowsers:engines.map(([name])=>name),fixture:'controlled UI, real command/simulation; candidate response overrides only; no destruction art approval or publication',bindings,sourceHashes,results},null,2)+'\n');
  }catch(error){
    const state=page?await page.evaluate(()=>({mounted:!!(window as any).buildingLifecycleReview?.mounted,hasState:!!(window as any).buildingLifecycleReview?.state,hasField:!!(window as any).buildingLifecycleReview?.field,status:document.getElementById('rts-load-status')?.textContent,disabled:(document.getElementById('rts-start') as HTMLButtonElement)?.disabled})).catch(()=>null):null;
    await writeFile(`${output}/${name}-failure.json`,JSON.stringify({failure:String(error),beforeClick,state,errors,pending:[...pending],requests},null,2)+'\n');
    if(page)await page.screenshot({path:`${output}/${name}-failure.png`});throw error;
  }
  finally{await browser.close();}
}
console.log(JSON.stringify({status:'passed',browsers:results.length,scenarios:['cancel with refund','real paid repair','real guard impact','dead picking disabled','pause and expiry']}));
