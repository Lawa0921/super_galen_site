/** Actual UI / renderer with controlled, paused state fixtures; not a natural campaign. */
import {chromium,expect,type Page} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const work=resolve('.'),main=work;
const folder=resolve(work,'art-factory/rts/runs/building-stages-remaining/2026-10-09-runtime/qa/runtime-browser');
const candidates=main+'/art-factory/rts/runs/building-stages-remaining/2026-10-09-runtime/candidate-runtime';
const base='http://127.0.0.1:4344';
const hash=(data:Buffer)=>createHash('sha256').update(data).digest('hex');
await mkdir(folder,{recursive:true});
const codePaths=['models.ts','scene.ts','types.ts','visibility.ts','construction-presentation.ts','input.ts','hud.ts','main.ts'].map(file=>'src/scripts/games/rts/'+file);
const rootCodeSHA=[];for(const path of codePaths)rootCodeSHA.push({path,sha256:hash(await readFile(main+'/'+path))});
const glbs=[];for(const id of ['townhall','townhall-tier2','townhall-tier3','house','forge','altar','tower','chapel'])glbs.push({id,path:candidates+'/'+id+'.glb',sha256:hash(await readFile(candidates+'/'+id+'.glb'))});
const browser=await chromium.launch({channel:'chromium',headless:true});
const errors:string[]=[],requestFailures:any[]=[],responses:any[]=[],textureRequests:string[]=[],routeHits:string[]=[];
let phase='navigation';const requestStarts=new WeakMap<object,any>(),successfulFinished:any[]=[];
const report:any={pass:false,fixture:'Controlled paused roster/positions/construction snapshots on the real game UI. Mouse interactions are real. This is not a natural campaign or publishing approval.',base,rootCodeSHA,glbs,stages:[],selection:[],independence:[],hiddenRoof:[],fog:[],errors,requestFailures,routeHits};
let page!:Page;
try{
  page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
  page.on('pageerror',(e:any)=>errors.push(e.message));
  page.on('console',(m:any)=>{if(m.type()==='error')errors.push(m.text());});
  page.on('requestfailed',(r:any)=>requestFailures.push({url:r.url(),failure:r.failure(),started:requestStarts.get(r),failedAt:new Date().toISOString(),failedPhase:phase,timing:r.timing()}));
  page.on('requestfinished',(r:any)=>successfulFinished.push({url:r.url(),finishedAt:new Date().toISOString(),finishedPhase:phase,timing:r.timing()}));
  page.on('response',(r:any)=>{if(r.status()>=400)responses.push({url:r.url(),status:r.status()});});
  page.on('request',(r:any)=>{requestStarts.set(r,{phase,at:new Date().toISOString()});if(/\.(?:png|jpe?g|webp)(?:\?|$)/i.test(r.url()))textureRequests.push(r.url());});
  for(const id of ['townhall','townhall-tier2','townhall-tier3','house','forge','altar','tower','chapel'])await page.route(`**/assets/games/rts/models/${id}.glb`,async(route:any)=>{
    routeHits.push(id);await route.fulfill({contentType:'model/gltf-binary',body:await readFile(candidates+'/'+id+'.glb')});
  });
  await page.goto(base+'/games/rts/');await page.waitForLoadState('networkidle');
  phase='fixture-remount';report.remountStartedAt=new Date().toISOString();
  await page.addScriptTag({type:'module',content:`
    const mainPath='/src/scripts/games/rts/main.ts',source=await(await fetch(mainPath)).text();
    const scenePath=source.match(new RegExp('from "([^"\\n]*scene[.]ts[^"\\n]*)"'))[1];
    const simulationPath=source.match(new RegExp('from "([^"\\n]*simulation[.]ts[^"\\n]*)"'))[1];
    const sceneSource=await(await fetch(scenePath)).text(),threePath=sceneSource.match(/import \\* as THREE from "([^"]+)"/)[1];
    const THREE=await import(threePath),{Battlefield}=await import(scenePath),{mountRts}=await import(mainPath),{createGame}=await import(simulationPath);
    const {addBuilding,addUnit,footprint}=await import('/src/scripts/games/rts/state.ts');
    const {updateVisibility,getTeamView}=await import('/src/scripts/games/rts/visibility.ts');
    const a={field:null,state:null,THREE,addBuilding,addUnit,footprint,updateVisibility,getTeamView,lastView:null,renderedTick:-1};window.buildingStageAudit=a;
    const render=Battlefield.prototype.render;Battlefield.prototype.render=function(view,dt,alpha){a.field=this;a.lastView=view;const result=render.call(this,view,dt,alpha);if(a.state)a.renderedTick=a.state.tick;return result;};
    const old=document.getElementById('rts'),root=old.cloneNode(true);old.replaceWith(root);
    mountRts(root,(...args)=>{const s=createGame(...args);s.aiEnabled=[false,false];s.paused=true;s.entities=[];s.resources=[];a.state=s;return s;});a.mounted=true;
  `});
  await page.waitForFunction(()=>!!(window as any).buildingStageAudit?.mounted);
  report.remountFinishedAt=new Date().toISOString();phase='battle-load';
  await page.locator('#rts-start').click();await page.locator('#rts-battle').waitFor({state:'visible',timeout:60000});
  await page.waitForFunction(()=>!!(window as any).buildingStageAudit?.field,{timeout:60000});
  phase='fixtures';report.battleReadyAt=new Date().toISOString();
  const refresh=async()=>{
    const tick=await page.evaluate(()=>{const a=(window as any).buildingStageAudit;a.updateVisibility(a.state);a.state.tick++;a.state.time=a.state.tick*.05;return a.state.tick;});
    await page.waitForFunction(tick=>(window as any).buildingStageAudit.renderedTick===tick,tick);
    await page.evaluate(()=>new Promise<void>(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done()))));
  };
  const target=async(id:number)=>page.evaluate(id=>{
    const a=(window as any).buildingStageAudit,f=a.field,e=a.state.entities.find((e:any)=>e.id===id),r=f.canvas.getBoundingClientRect();
    for(const y of [.06,.25,.5,1,2,3])for(const dz of [0,-1,1,-2,2])for(const dx of [0,-1,1,-2,2]){
      const p=f.screen({x:e.x+dx,z:e.z+dz},y),client={x:p.x+r.left,y:p.y+r.top};if(f.pick(client.x,client.y)?.entityId===id)return client;
    }throw new Error('No real mouse pick target for '+id);
  },id);
  const summary=async(id:number)=>page.evaluate(id=>{
    const a=(window as any).buildingStageAudit,v=a.field.models.get(id),entity=a.state.entities.find((e:any)=>e.id===id),meshes:any[]=[];
    v.instance.root.traverseVisible((o:any)=>{if(o.isMesh)meshes.push({name:o.name,material:o.material.name,stage:o.userData.rtsConstructionStage??null,sourceCount:o.userData.rtsConstructionSources?.length??0,hasTangent:!!o.geometry.attributes.tangent});});
    return {id,kind:entity.kind,progress:entity.construction,groundY:v.instance.root.position.y,scale:v.instance.root.scale.toArray(),footprint:a.footprint(entity),visibleMeshes:meshes.length,meshes};
  },id);
  const screenshot=async(name:string)=>{await page.screenshot({path:folder+'/'+name+'.png'});};
  const expectedCounts:any={altar:[2,4,4,5,8,4],chapel:[2,6,6,11,18,11],forge:[2,7,7,12,20,12],house:[2,7,7,12,19,11],tower:[2,5,5,6,9,6],'townhall-tier2':[2,5,5,10,17,10],'townhall-tier3':[2,5,5,10,17,10],townhall:[2,8,8,12,19,11]};
  const names:any={townhall:'領主府','townhall-tier2':'領主府','townhall-tier3':'領主府',house:'民居',forge:'鍛造所',altar:'誓約祭壇',tower:'守望塔',chapel:'禮拜堂'};
  for(const kind of ['townhall','townhall-tier2','townhall-tier3','house','forge','altar','tower','chapel']){
    const fixture=await page.evaluate(kind=>{
      const a=(window as any).buildingStageAudit,s=a.state;s.entities=[];
      const actual=kind.startsWith('townhall')?'townhall':kind,tier=kind.endsWith('tier2')?2:kind.endsWith('tier3')?3:1;
      const building=a.addBuilding(s,0,actual,{x:20,z:36},false),peer=a.addBuilding(s,0,actual,{x:34,z:36},true);building.tier=peer.tier=tier;
      a.field.focus({x:26,z:36});a.field.zoom(-100);return {id:building.id,peer:peer.id,footprint:a.footprint(building)};
    },kind);await refresh();
    const texturesAtStart=new Set(textureRequests);
    for(const [i,progress] of [0,.2,.5,.75,.9,1].entries()){
      await page.evaluate(({id,progress})=>{(window as any).buildingStageAudit.state.entities.find((e:any)=>e.id===id).construction=progress;},{id:fixture.id,progress});await refresh();
      const current=await summary(fixture.id),peer=await summary(fixture.peer);expect(current.groundY).toBe(0);expect(current.scale).toEqual([1,1,1]);expect(current.footprint).toEqual(fixture.footprint);
      expect(current.visibleMeshes).toBe(expectedCounts[kind][i]);expect(peer.visibleMeshes).toBe(expectedCounts[kind][5]);expect(peer.progress).toBe(1);
      if(progress===0||progress===1){
        const p=await target(fixture.id);await page.mouse.click(p.x,p.y);
        await page.waitForFunction(id=>(window as any).buildingStageAudit.field.selection[0]===id,fixture.id);
        await expect(page.locator('#rts-selection h2')).toHaveText(names[kind]);
        await expect(page.locator('#rts-selection [data-meta]')).toHaveText(progress===1?(kind.startsWith('townhall')?`主城第 ${kind.endsWith('tier2')?2:kind.endsWith('tier3')?3:1} 階`:'建築已就緒'):`施工 ${progress*100}%`);
        report.selection.push({kind,progress,mouse:p,selected:fixture.id,hud:await page.locator('#rts-selection').innerText()});
      }
      await expect(page.locator('#rts-selection [data-meta]')).toHaveText(progress===1?(kind.startsWith('townhall')?`主城第 ${kind.endsWith('tier2')?2:kind.endsWith('tier3')?3:1} 階`:'建築已就緒'):`施工 ${progress*100}%`);
      const screenshotName=kind+'-'+String(progress).replace('.','p');await screenshot(screenshotName);
      report.stages.push({...current,screenshot:screenshotName+'.png'});report.independence.push({kind,main:progress,peer:peer.progress,mainMeshes:current.visibleMeshes,peerMeshes:peer.visibleMeshes});
    }
    const calls=await page.evaluate(id=>{
      const a=(window as any).buildingStageAudit,f=a.field,root=f.models.get(id).instance.root,parent=root.parent,isolated=new a.THREE.Scene();
      isolated.add(root);f.renderer.info.reset();f.renderer.render(isolated,f.camera);const result={drawcalls:f.renderer.info.render.calls,triangles:f.renderer.info.render.triangles};parent.add(root);f.render(a.getTeamView(a.state,0),0,1);return result;
    },fixture.id);expect(calls.drawcalls).toBe(expectedCounts[kind][5]);report.stages.at(-1).isolatedGpuRender=calls;
    // Research icons are lazily requested on first completed selection. Only
    // 3D material/terrain textures must already be resident across these phases.
    expect(textureRequests.filter(url=>!texturesAtStart.has(url)&&!new URL(url).pathname.startsWith('/assets/games/rts/ui/'))).toEqual([]);
    // Find a pixel genuinely covered by an invisible stage-2 roof, with only ground behind it.
    await page.evaluate(id=>{(window as any).buildingStageAudit.state.entities.find((e:any)=>e.id===id).construction=0;},fixture.id);await refresh();
    const roof=await page.evaluate(id=>{
      const a=(window as any).buildingStageAudit,f=a.field,root=f.models.get(id).instance.root,r=f.canvas.getBoundingClientRect(),candidates:any[]=[];
      root.traverse((o:any)=>{if(o.userData.rtsConstructionStage===2&&o.isMesh)candidates.push(o);});
      for(const mesh of candidates){const positions=mesh.geometry.attributes.position,index=mesh.geometry.index;
        for(let i=0;i<(index?.count??positions.count);i+=Math.max(3,Math.floor((index?.count??positions.count)/180/3)*3)){
          const point=new a.THREE.Vector3();for(let k=0;k<3;k++)point.add(new a.THREE.Vector3().fromBufferAttribute(positions,index?.getX(i+k)??i+k));point.multiplyScalar(1/3).applyMatrix4(mesh.matrixWorld).project(f.camera);
          const p={x:r.left+(point.x+1)*f.size.width/2,y:r.top+(1-point.y)*f.size.height/2};if(p.x<r.left||p.y<r.top||p.x>r.right||p.y>r.bottom)continue;
          const picked=f.pick(p.x,p.y),raw=f.ray.intersectObject(root,true);if(!picked&&raw.some((h:any)=>{let owner=h.object;while(owner){if(owner.userData.rtsConstructionStage===2)return !owner.visible;owner=owner.parent;}return false;}))return {mouse:p,ground:f.world(p.x,p.y),rawHiddenRoofHits:raw.length};
        }
      }throw new Error('No invisible roof pixel with ground behind it: '+id);
    },fixture.id);expect(roof.ground).not.toBeNull();await page.mouse.click(roof.mouse.x,roof.mouse.y);
    expect(await page.evaluate(()=>(window as any).buildingStageAudit.field.selection)).toEqual([]);
    const worker=await page.evaluate(point=>{const a=(window as any).buildingStageAudit;return a.addUnit(a.state,0,'worker',point).id;},roof.ground);await refresh();
    const through=await page.evaluate(({worker,id,p})=>{
      const a=(window as any).buildingStageAudit,f=a.field,root=f.models.get(id).instance.root;
      for(const dy of [0,-3,3,-6,6,-10,10])for(const dx of [0,-3,3,-6,6,-10,10]){
        const mouse={x:p.x+dx,y:p.y+dy};if(f.pick(mouse.x,mouse.y)?.entityId!==worker)continue;
        const raw=f.ray.intersectObject(root,true);if(raw.some((h:any)=>{let owner=h.object;while(owner){if(owner.userData.rtsConstructionStage===2)return !owner.visible;owner=owner.parent;}return false;}))return {mouse,rawHiddenRoofHits:raw.length};
      }throw new Error('Visible worker cannot be selected through hidden roof');
    },{worker,id:fixture.id,p:roof.mouse});await page.mouse.click(through.mouse.x,through.mouse.y);
    await page.waitForFunction(id=>(window as any).buildingStageAudit.field.selection[0]===id,worker);
    await expect(page.locator('#rts-portrait-view')).toHaveAttribute('data-kind','worker');await screenshot(kind+'-hidden-roof-worker');
    report.hiddenRoof.push({kind,ground:roof,worker:{id:worker,...through,selected:true}});
  }
  // Actual visibility update boundary: scout sees .2, leaves, truth reaches 1, then returns.
  const fogFixture=await page.evaluate(()=>{
    const a=(window as any).buildingStageAudit,s=a.state;s.entities=[];s.visibility[0].knownBuildings={};s.visibility[1].knownBuildings={};
    const enemy=a.addBuilding(s,1,'house',{x:20,z:36},false);enemy.construction=.2;
    const scout=a.addUnit(s,0,'guard',{x:20,z:42});a.field.focus(enemy);return {enemy:enemy.id,scout:scout.id};
  });await refresh();
  const fogState=async(label:string)=>page.evaluate(({label,id})=>{
    const a=(window as any).buildingStageAudit,s=a.state,e=s.entities.find((e:any)=>e.id===id),cell=Math.floor(e.z)*s.map.width+Math.floor(e.x),memory=s.visibility[0].knownBuildings[id],visual=a.field.models.get(id)??a.field.memories.get(id),meshes:any[]=[];
    visual?.instance.root.traverseVisible((o:any)=>{if(o.isMesh)meshes.push({name:o.name,stage:o.userData.rtsConstructionStage??null});});
    return {label,trueConstruction:e.construction,rememberedConstruction:memory?.construction,viewVisible:s.visibility[0].visible[cell],visualType:a.field.models.has(id)?'visible':a.field.memories.has(id)?'memory':'absent',groundY:visual?.instance.root.position.y,visibleMeshes:meshes.length,meshes};
  },{label,id:fogFixture.enemy});
  report.fog.push(await fogState('visible-.2'));expect(report.fog.at(-1).visibleMeshes).toBe(7);
  await page.evaluate(id=>{const a=(window as any).buildingStageAudit,scout=a.state.entities.find((e:any)=>e.id===id);scout.x=75;scout.z=75;},fogFixture.scout);await refresh();
  report.fog.push(await fogState('fog-.2'));expect(report.fog.at(-1).visualType).toBe('memory');expect(report.fog.at(-1).rememberedConstruction).toBe(.2);
  await page.evaluate(id=>{(window as any).buildingStageAudit.state.entities.find((e:any)=>e.id===id).construction=1;},fogFixture.enemy);await refresh();
  const frozen=await fogState('fog-truth-1');expect(frozen.rememberedConstruction).toBe(.2);expect(frozen.visibleMeshes).toBe(7);expect(frozen.groundY).toBe(0);report.fog.push(frozen);await screenshot('fog-remembered-0p2-truth-1');
  await page.evaluate(id=>{const a=(window as any).buildingStageAudit,scout=a.state.entities.find((e:any)=>e.id===id);scout.x=20;scout.z=42;},fogFixture.scout);await refresh();
  const revealed=await fogState('revealed-1');expect(revealed.rememberedConstruction).toBe(1);expect(revealed.visibleMeshes).toBe(11);expect(revealed.visualType).toBe('visible');report.fog.push(revealed);await screenshot('fog-revealed-complete');
  report.textureRequests=[...new Set(textureRequests)].sort();report.textureCounts=Object.fromEntries(report.textureRequests.map((url:string)=>[url,textureRequests.filter(u=>u===url).length]));
  expect(report.textureRequests.filter((url:string)=>/\/models\/textures\//.test(url))).toEqual([]);
  report.successfulFinished=successfulFinished;
  for(const failure of requestFailures)failure.sameUrlFinished=successfulFinished.filter(r=>r.url===failure.url);
  // Only a reproduced remount cancellation followed by successful same-URL
  // completion can be classified separately. Actual fixture/battle failures fail.
  const remountCancellations=requestFailures.filter(r=>r.failure?.errorText==='net::ERR_ABORTED'&&['navigation','fixture-remount'].includes(r.started?.phase)&&
    r.failedPhase==='fixture-remount'&&r.sameUrlFinished.some((success:any)=>success.finishedAt>r.failedAt));
  const runtimeFailures=requestFailures.filter(r=>!remountCancellations.includes(r));report.remountCancellations=remountCancellations;report.runtimeFailures=runtimeFailures;
  expect([...new Set(routeHits)].sort()).toEqual(['townhall','townhall-tier2','townhall-tier3','house','forge','altar','tower','chapel'].sort());expect(errors).toEqual([]);expect(runtimeFailures).toEqual([]);expect(responses).toEqual([]);
  for(const row of rootCodeSHA)expect(hash(await readFile(main+'/'+row.path))).toBe(row.sha256);
  for(const stage of report.stages)expect(stage.meshes.every((m:any)=>m.hasTangent)).toBe(true);
  report.httpErrors=responses;report.pass=true;
  for(const kind of ['townhall','townhall-tier2','townhall-tier3','house','forge','altar','tower','chapel']){
    const html=`<!doctype html><html><meta charset="utf-8"><title>${kind} controlled construction QA</title><style>body{margin:0;padding:24px;background:#162126;color:#eee;font:16px sans-serif}h1{font-size:24px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}figure{margin:0}img{width:100%;display:block}figcaption{padding:8px}</style><h1>${names[kind]} · 受控 fixture · 左側施工／右側獨立完成 instance</h1><div class="grid">${[0,.2,.5,.75,.9,1].map(p=>`<figure><img src="${kind+'-'+String(p).replace('.','p')}.png"><figcaption>施工 ${p*100}%</figcaption></figure>`).join('')}</div></html>`;
    const file=folder+'/'+kind+'-contact.html';await writeFile(file,html,'utf8');const contact=await browser.newPage({viewport:{width:1600,height:1800}});await contact.goto('file:///'+file.replace(/\\/g,'/'));await contact.screenshot({path:folder+'/'+kind+'-contact.png',fullPage:true});await contact.close();
  }
}catch(error){report.failure=String(error);if(page)await page.screenshot({path:folder+'/failure.png'}).catch(()=>{});throw error;}
finally{
  await writeFile(folder+'/browser-report.json',JSON.stringify(report,null,2)+'\n');await writeFile(folder+'/browser-errors.json',JSON.stringify({errors,requestFailures,httpErrors:responses},null,2)+'\n');await browser.close();
  console.log(JSON.stringify({pass:report.pass,stages:report.stages.length,selection:report.selection.length,hiddenRoof:report.hiddenRoof.length,fog:report.fog.length,failure:report.failure??null,evidence:folder}));
}
