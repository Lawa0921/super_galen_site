import {waitForRtsLobby} from '../helpers/rts-readiness';
import {test,expect} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';

test.use({viewport:{width:1600,height:1000}});
test('real work and successful spells select authored clips and freeze with pause',async({page},info)=>{
  test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const run='art-factory/rts/runs/work-cast/2026-10-11-v2';
  const candidate=process.env.RTS_WORK_CAST_CANDIDATE==='1';
  const output=process.env.RTS_WORK_CAST_OUT?`${process.env.RTS_WORK_CAST_OUT}/${info.project.name}`:info.outputPath(`work-cast-${candidate?'candidate':'published'}`);await mkdir(output,{recursive:true});
  if(candidate){
    const buffers=new Map<string,Buffer>();for(const unit of ['worker','priest','commander'])for(const lod of [0,1])buffers.set(`${unit}${lod?'-lod1':''}.glb`,await readFile(`${run}/candidate/${unit}-lod${lod}.glb`));
    await page.route('**/assets/games/rts/models/*.glb',route=>{
      const buffer=buffers.get(new URL(route.request().url()).pathname.split('/').at(-1)!);
      return buffer?route.fulfill({contentType:'model/gltf-binary',body:buffer}):route.continue();
    });
  }
  await page.clock.install({time:new Date('2026-10-11T12:00:00Z')});
  await page.goto('/games/rts');await waitForRtsLobby(page);
  // Staged layout, production commands/simulation/renderer. This is animation
  // assembly evidence, not a natural-match or balance acceptance result.
  await page.evaluate(async()=>{
    const mainPath='/src/scripts/games/rts/main.ts';
    const mainSource=await (await fetch(mainPath)).text();
    const scenePath=mainSource.match(/from "([^"\n]*\/scene\.ts[^"\n]*)"/)?.[1];
    if(!scenePath)throw new Error('Cannot locate served Battlefield module');
    const statePath='/src/scripts/games/rts/state.ts',simPath='/src/scripts/games/rts/simulation.ts',fogPath='/src/scripts/games/rts/visibility.ts',commandPath='/src/scripts/games/rts/commands.ts';
    const [{mountRts},{Battlefield},{createGame},{addBuilding,addUnit},{updateVisibility},{issueCommand}]=await Promise.all([import(mainPath),import(scenePath),import(simPath),import(statePath),import(fogPath),import(commandPath)]);
    const original=Battlefield.prototype.render;Battlefield.prototype.render=function(...args:any[]){(window as any).__workCastFixture.field=this;return original.apply(this,args);};
    const old=document.getElementById('rts')!,root=old.cloneNode(true) as HTMLElement;old.replaceWith(root);
    mountRts(root,(map:'river'|'pass',seed:number)=>{
      const state=createGame(map,seed);state.aiEnabled=[false,false];state.entities=[];state.resources=[];
      state.map.blocked.fill(0);state.map.noBuild.fill(0);state.map.scenery=[];state.map.landmarks=[];state.map.resources=[];state.map.spawns[0]={x:26,z:34};
      addBuilding(state,0,'townhall',{x:8,z:80},true);addBuilding(state,1,'townhall',{x:88,z:80},true);
      const mine=addUnit(state,0,'worker',{x:24,z:27}),chop=addUnit(state,0,'worker',{x:31,z:27});
      state.resources=[{id:'gold',kind:'gold',x:24,z:28.65,remaining:1000},{id:'wood',kind:'wood',x:31,z:28.65,remaining:1000}];
      const foundation=addBuilding(state,0,'house',{x:39,z:29}),house=addBuilding(state,0,'house',{x:48,z:29},true);house.hp-=200;
      const build=addUnit(state,0,'worker',{x:39,z:26.9}),repair=addUnit(state,0,'worker',{x:48,z:26.9});
      const priest=addUnit(state,0,'priest',{x:24,z:40}),patient=addUnit(state,0,'guard',{x:24,z:42});patient.hp=10;
      const cleave=addUnit(state,0,'commander',{x:32,z:40}),mend=addUnit(state,0,'commander',{x:40,z:40}),banner=addUnit(state,0,'commander',{x:48,z:40});
      const ally=addUnit(state,0,'guard',{x:40,z:42});ally.hp=10;
      const actors=[mine,chop,build,repair,priest,cleave,mend,banner];
      // Keep the staged lineup on actual dry terrain, with authored resource
      // models present so work can be assessed in its target context.
      for(const e of [...actors,patient,ally,foundation,house])e.x-=10;
      for(const r of state.resources)r.x-=10;state.map.resources=structuredClone(state.resources);
      for(const u of [...actors,patient,ally]){u.order={type:'hold'};u.mana=0;}
      state.teams[0].hero.level=5;state.teams[0].hero.skills={cleave:1,mend:1,banner:1};
      const fixture:any={state,actors,start(){
        priest.mana=100;cleave.mana=mend.mana=banner.mana=200;updateVisibility(state);
        return [issueCommand(state,0,{type:'gather',unitIds:[mine.id],resourceId:'gold'}),issueCommand(state,0,{type:'gather',unitIds:[chop.id],resourceId:'wood'}),
          issueCommand(state,0,{type:'resume',unitIds:[build.id],targetId:foundation.id}),issueCommand(state,0,{type:'repair',unitIds:[repair.id],targetId:house.id}),
          issueCommand(state,0,{type:'cast',heroId:cleave.id,skill:'cleave',position:{x:cleave.x,z:43}}),issueCommand(state,0,{type:'cast',heroId:mend.id,skill:'mend',targetId:ally.id}),issueCommand(state,0,{type:'cast',heroId:banner.id,skill:'banner'})];
      },startWalk(){
        priest.mana=0;patient.hp=10;ally.hp=10;
        return actors.slice(4).map(u=>issueCommand(state,0,{type:'move',unitIds:[u.id],position:{x:u.x,z:u.z+10},attackMove:u===priest}));
      },spellsOnWalk(){
        priest.mana=100;priest.cooldown=0;
        for(const u of [cleave,mend,banner]){u.mana=200;u.skillCooldowns={cleave:0,mend:0,banner:0};}
        return [issueCommand(state,0,{type:'cast',heroId:cleave.id,skill:'cleave',position:{x:cleave.x,z:cleave.z+2}}),
          issueCommand(state,0,{type:'cast',heroId:mend.id,skill:'mend',targetId:ally.id}),issueCommand(state,0,{type:'cast',heroId:banner.id,skill:'banner'})];
      },sample(){return actors.map(u=>{
        const instance=fixture.field.models.get(u.id).instance;
        return {id:u.id,kind:u.kind,x:u.x,z:u.z,rendered:instance.root.position.toArray(),animation:u.animation,order:u.order,castAge:u.castCue?state.time-u.castCue.startedAt:null,variants:instance.variants.map((v:any)=>({visible:v.root.visible,clip:v.action?.getClip().name,time:v.action?.time,pose:(()=>{
          const bones=new Set<any>();v.root.traverse((o:any)=>{if(o.isSkinnedMesh)o.skeleton.bones.forEach((b:any)=>bones.add(b));});
          return [...bones].map(b=>[b.name,...b.quaternion.toArray()]);
        })()}))};
      });}};
      updateVisibility(state);(window as any).__workCastFixture=fixture;return state;
    });
  });
  await page.locator('#rts-start').click();await expect(page.locator('#rts-battle')).toBeVisible({timeout:60000});
  await page.clock.pauseAt(new Date('2026-10-11T13:00:00Z'));
  await page.evaluate(()=>{const w=window as any;w.__rtsDebug.camera(26,34,48);w.__rtsDebug.setPaused(true);});await page.clock.runFor(16);
  const sample=()=>page.evaluate(()=>(window as any).__workCastFixture.sample());
  expect(await page.evaluate(()=>{const w=window as any;w.__rtsDebug.setPaused(false);return w.__workCastFixture.start();})).toEqual(Array.from({length:7},()=>({ok:true})));
  await page.clock.runFor(300);
  const active=await sample(),names=['Mine','Chop','Build','Build','Cast','CastCleave','CastMend','CastBanner'];
  for(const [i,u] of active.entries())for(const v of u.variants)expect(v.clip,`${i}:${u.kind}`).toBe(names[i]);
  await page.screenshot({path:`${output}/actions-default.png`});
  await page.evaluate(()=>(window as any).__rtsDebug.setPaused(true));await page.clock.runFor(16);const paused=await sample();
  await page.clock.runFor(500);expect(await sample()).toEqual(paused);
  await page.evaluate(()=>(window as any).__rtsDebug.camera(26,34,24));await page.clock.runFor(16);await page.screenshot({path:`${output}/actions-max-zoom.png`});
  const displayed:any[]=[];
  for(const lod of [0,1])for(let i=0;i<8;i++){
    await page.evaluate(({lod,i})=>{const w=window as any,f=w.__workCastFixture,u=f.actors[i],height=f.field.models.get(u.id).height,pixels=Math.abs(f.field.screen(u,height).y-f.field.screen(u).y);w.__rtsDebug.camera(u.x,u.z,f.field.span*pixels/(lod?32:72));},{lod,i});
    await page.clock.runFor(16);const actor=(await sample())[i];expect(actor.variants.map((v:any)=>v.visible)).toEqual(lod?[false,true]:[true,false]);expect(actor.variants[lod].clip).toBe(names[i]);displayed.push({lod,...actor});
    await page.screenshot({path:`${output}/${i}-${names[i]}-lod${lod}.png`});
  }
  for(const i of [0,4,7]){
    const point=await page.evaluate(i=>{const w=window as any,f=w.__workCastFixture,u=f.actors[i];w.__rtsDebug.camera(u.x,u.z,24);return f.field.screen(u,1);},i);
    await page.clock.runFor(16);await page.mouse.click(point.x,point.y);await page.clock.runFor(16);await expect(page.locator('#rts-selection h2')).toHaveText(i===0?'工人':i===4?'牧師':'誓衛統領');await expect(page.locator('#rts-portrait-view')).toBeVisible();
    await page.screenshot({path:`${output}/portrait-${i}.png`});
  }
  await page.evaluate(()=>{const w=window as any;w.__rtsDebug.camera(26,34,48);w.__rtsDebug.setPaused(false);});await page.clock.runFor(500);
  const expired=await sample();for(const actor of expired.slice(4))for(const v of actor.variants)expect(v.clip).toBe('Idle');
  expect(await page.evaluate(()=>(window as any).__workCastFixture.startWalk())).toEqual(Array.from({length:4},()=>({ok:true})));
  await page.clock.runFor(200);const walking=await sample();
  expect(await page.evaluate(()=>(window as any).__workCastFixture.spellsOnWalk())).toEqual(Array.from({length:3},()=>({ok:true})));
  await page.clock.runFor(200);const movingA=await sample();
  await page.screenshot({path:`${output}/moving-cast-a.png`});await page.clock.runFor(100);const movingB=await sample();
  await page.screenshot({path:`${output}/moving-cast-b.png`});
  for(let i=4;i<8;i++){
    expect(movingB[i].z).toBeGreaterThan(walking[i].z+.2);expect(movingB[i].animation).toBe('walk');
    for(const lod of [0,1]){
      expect(movingB[i].variants[lod].clip).toBe(names[i]);
      const legs=(actor:any)=>actor.variants[lod].pose.filter((b:any[])=>/^Thigh_|^Shin_/.test(b[0]));
      expect(legs(movingB[i])).not.toEqual(legs(movingA[i]));expect(legs(movingB[i]).length).toBe(4);
      expect(movingB[i].variants[lod].pose).toEqual(movingB[i].variants[0].pose);
    }
  }
  await page.locator('#rts-pause').click();await page.clock.runFor(16);const movingPaused=await sample();
  await page.clock.runFor(300);expect(await sample()).toEqual(movingPaused);
  await page.locator('#rts-resume').click();await page.clock.runFor(500);const walkingAgain=await sample();
  for(const actor of walkingAgain.slice(4))for(const v of actor.variants)expect(v.clip).toBe('Walk');
  await writeFile(`${output}/evidence.json`,JSON.stringify({candidate,active,paused,displayed,expired,walking,movingA,movingB,movingPaused,walkingAgain,errors},null,2));expect(errors).toEqual([]);
});
