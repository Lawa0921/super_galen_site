/** Candidate-only, controlled game renderer QA. No publishing or natural-match claim. */
import {chromium,expect,type Page} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

const id=process.env.RTS_DESTRUCTION_MODEL??'house';
const candidate=process.env.RTS_DESTRUCTION_GLB,output=process.env.RTS_DESTRUCTION_OUT;
if(!['house','townhall-tier3'].includes(id)||!candidate||!output)throw new Error('Set RTS_DESTRUCTION_MODEL=house|townhall-tier3, RTS_DESTRUCTION_GLB and RTS_DESTRUCTION_OUT');
const bytes=await readFile(candidate),sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const sourcePaths=['models.ts','construction-presentation.ts','building-lifecycle.ts','building-lifecycle-presentation.ts','scene.ts','visibility.ts','state.ts'];
const sourceHashes=[];for(const file of sourcePaths){const path='src/scripts/games/rts/'+file;sourceHashes.push({path,sha256:sha(await readFile(path))});}
await mkdir(output,{recursive:true});
const errors:string[]=[],httpErrors:string[]=[],frames:any[]=[];
const report:any={status:'running',fixture:'Controlled real Battlefield with one candidate response override, paused time/roster. Not a natural match, visual approval or publication.',id,candidate:resolve(candidate),candidateSHA256:sha(bytes),sourceHashes,frames,errors,httpErrors};
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--enable-gpu','--force_high_performance_gpu']});let page:Page|undefined;
try{
  page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)httpErrors.push(r.status()+' '+r.url());});
  await page.route(`**/assets/games/rts/models/${id}.glb`,route=>route.fulfill({contentType:'model/gltf-binary',body:bytes}));
  await page.goto((process.env.RTS_BASE_URL??'http://127.0.0.1:4344')+'/games/rts');await page.waitForLoadState('networkidle');
  await page.addScriptTag({type:'module',content:`
    const path='/src/scripts/games/rts/main.ts',text=await(await fetch(path)).text();
    const scenePath=text.match(new RegExp('from "([^"]*scene[.]ts[^"]*)"'))[1],sceneSource=await(await fetch(scenePath)).text();
    const THREE=await import(sceneSource.match(/import \\* as THREE from "([^"]+)"/)[1]);
    const {Battlefield}=await import(scenePath),{mountRts}=await import(path),{createGame}=await import('/src/scripts/games/rts/simulation.ts');
    const {addBuilding,destroyEntity}=await import('/src/scripts/games/rts/state.ts'),{updateVisibility,getTeamView}=await import('/src/scripts/games/rts/visibility.ts');
    const a={THREE,addBuilding,destroyEntity,updateVisibility,getTeamView,renderedTick:-1};window.buildingDestructionReview=a;
    const render=Battlefield.prototype.render;Battlefield.prototype.render=function(view,dt,alpha){a.field=this;a.view=view;const result=render.call(this,view,dt,alpha);a.renderedTick=a.state?.tick;return result;};
    const old=document.getElementById('rts'),root=old.cloneNode(true);old.replaceWith(root);
    mountRts(root,(...args)=>{const s=createGame(...args);s.aiEnabled=[false,false];s.paused=true;s.entities=[];s.resources=[];a.state=s;return s;});a.mounted=true;
  `});
  await page.waitForFunction(()=>!!(window as any).buildingDestructionReview?.mounted);
  await page.locator('#rts-start').click();await expect(page.locator('#rts-battle')).toBeVisible({timeout:60000});
  await page.waitForFunction(()=>!!(window as any).buildingDestructionReview?.field);
  const refresh=async()=>{
    const tick=await page!.evaluate(()=>{const a=(window as any).buildingDestructionReview;a.updateVisibility(a.state);return ++a.state.tick;});
    await page!.waitForFunction(tick=>(window as any).buildingDestructionReview.renderedTick===tick,tick);
  };
  const snapshot=async(progress:number,age:number|null)=>{
    const frame=await page!.evaluate(()=>{
      const a=(window as any).buildingDestructionReview,f=a.field,b=a.building,v=f.models.get(b.id),root=v.instance.root,meshes:any[]=[];
      root.traverseVisible((o:any)=>{if(!o.isMesh)return;let owner=o;while(owner&&owner.userData.rtsConstructionStage===undefined)owner=owner.parent;
        meshes.push({name:o.name,role:owner?.userData.rtsLifecycleRole??'shared',stage:owner?.userData.rtsConstructionStage??null,nodeId:owner?.userData.rtsLifecycleNodeId??null,triangles:(o.geometry.index?.count??o.geometry.attributes.position.count)/3});});
      const matrices:any[]=[];root.traverse((o:any)=>{if(o.userData.rtsDestructionCluster)matrices.push({cluster:o.userData.rtsDestructionCluster,matrix:o.matrix.toArray()});});
      const parent=root.parent,isolated=new a.THREE.Scene();isolated.add(root);f.renderer.info.reset();f.renderer.render(isolated,f.camera);
      const gpu={drawCalls:f.renderer.info.render.calls,triangles:f.renderer.info.render.triangles};parent.add(root);f.render(a.getTeamView(a.state,0),0,1);
      const peer=f.models.get(a.peer.id),peerMeshes:any[]=[];peer.instance.root.traverseVisible((o:any)=>{if(o.isMesh)peerMeshes.push(o.name);});
      return {time:a.state.time,alive:b.alive,construction:b.construction,groundY:root.position.y,pickable:root.userData.entityId!==undefined,meshes,matrices,gpu,peerMeshes};
    });
    expect(frame.groundY).toBe(0);expect(frame.pickable).toBe(age===null);expect(frame.peerMeshes.every(n=>n.startsWith('RTS completed'))).toBe(true);
    expect(frame.meshes.some(m=>m.role==='deathReplacement')).toBe(age!==null&&progress>=.18);
    if(age!==null){expect(frame.meshes.some(m=>m.role==='completedSource')).toBe(false);expect(frame.meshes.every(m=>m.stage!==null&&progress>=[0,.18,.55,.82][m.stage])).toBe(true);}
    const name=`${id}-stage-${String(progress).replace('.','p')}-${age===null?'alive':'death-'+String(age).replace('.','p')}`;
    await page!.screenshot({path:output+'/'+name+'.png'});frames.push({...frame,age,screenshot:name+'.png'});return frame;
  };
  for(const progress of [0,.18,.55,.82,1]){
    await page.evaluate(({id,progress})=>{
      const a=(window as any).buildingDestructionReview,s=a.state;s.entities=[];s.time=8;s.visibility[0].knownBuildings={};s.visibility[1].knownBuildings={};
      const kind=id==='house'?'house':'townhall';a.building=a.addBuilding(s,0,kind,{x:20,z:36},true);a.peer=a.addBuilding(s,0,kind,{x:35,z:36},true);
      if(id==='townhall-tier3')a.building.tier=a.peer.tier=3;a.building.construction=progress;a.building.hp=a.building.maxHp*(.1+.9*progress);
      a.field.focus({x:27,z:36});a.field.zoom(-100);
    },{id,progress});await refresh();await snapshot(progress,null);
    await page.evaluate(()=>{const a=(window as any).buildingDestructionReview;a.destroyEntity(a.state,a.building);});
    for(const age of [0,.2,.6,1,1.8,2.6]){
      await page.evaluate(age=>{const a=(window as any).buildingDestructionReview;a.state.time=a.building.deathTime+age;},age);await refresh();
      const frame=await snapshot(progress,age);
      if(age===1){await page.waitForTimeout(180);const paused=await page.evaluate(()=>{const a=(window as any).buildingDestructionReview,matrices:any[]=[];a.field.models.get(a.building.id).instance.root.traverse((o:any)=>{if(o.userData.rtsDestructionCluster)matrices.push({cluster:o.userData.rtsDestructionCluster,matrix:o.matrix.toArray()});});return {time:a.state.time,matrices};});expect(paused).toEqual({time:frame.time,matrices:frame.matrices});}
    }
  }
  expect(errors).toEqual([]);expect(httpErrors).toEqual([]);for(const row of sourceHashes)expect(sha(await readFile(row.path))).toBe(row.sha256);expect(sha(await readFile(candidate))).toBe(report.candidateSHA256);
  report.status='passed_mechanical_browser_checks_visual_review_pending';
}catch(error){report.status='failed';report.failure=String(error);if(page)await page.screenshot({path:output+'/failure.png'}).catch(()=>{});throw error;}
finally{await writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify({status:report.status,frames:frames.length,errors:errors.length,output}));}
