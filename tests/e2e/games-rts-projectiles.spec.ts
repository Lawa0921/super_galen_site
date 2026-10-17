import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {waitForRtsLobby} from '../helpers/rts-readiness';

test.use({viewport:{width:1920,height:1080}});
test('authored ranged releases produce real model flights and delayed impacts',async({page},info)=>{
  test.setTimeout(120000);const out=info.outputPath('projectiles');await mkdir(out,{recursive:true});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-16T12:00:00Z')});await page.goto('/games/rts');await waitForRtsLobby(page);
  await page.evaluate(async()=>{
    const mainPath='/src/scripts/games/rts/main.ts',source=await(await fetch(mainPath)).text(),scenePath=source.match(/from "([^"\n]*\/scene\.ts[^"\n]*)"/)?.[1];if(!scenePath)throw new Error('Missing served scene');
    const statePath='/src/scripts/games/rts/state.ts',simPath='/src/scripts/games/rts/simulation.ts',fogPath='/src/scripts/games/rts/visibility.ts',commandPath='/src/scripts/games/rts/commands.ts';
    const [{mountRts},{Battlefield},{createGame},{addUnit,addBuilding},{updateVisibility},{issueCommand}]=await Promise.all([import(mainPath),import(scenePath),import(simPath),import(statePath),import(fogPath),import(commandPath)]);
    const original=Battlefield.prototype.render;Battlefield.prototype.render=function(...args:any[]){(window as any).__flight.field=this;return original.apply(this,args);};
    const old=document.getElementById('rts')!,root=old.cloneNode(true) as HTMLElement;old.replaceWith(root);
    mountRts(root,()=>{const state=createGame('river',1);state.aiEnabled=[false,false];state.entities=[];state.resources=[];state.map.blocked.fill(0);state.map.noBuild.fill(0);state.map.scenery=[];state.map.landmarks=[];state.map.resources=[];state.paused=true;
      addBuilding(state,0,'townhall',{x:8,z:80},true);addBuilding(state,1,'townhall',{x:88,z:80},true);
      const crossbow=addUnit(state,0,'crossbow',{x:24,z:31}),guard=addUnit(state,1,'guard',{x:31,z:31}),siege=addUnit(state,0,'siege',{x:24,z:38}),house=addBuilding(state,1,'house',{x:34,z:38},true);guard.order={type:'hold'};guard.cooldown=99;crossbow.order=siege.order={type:'hold'};
      const fixture:any={state,crossbow,siege,guard,house,start(){updateVisibility(state);return [issueCommand(state,0,{type:'attack',unitIds:[crossbow.id],targetId:guard.id}),issueCommand(state,0,{type:'attack',unitIds:[siege.id],targetId:house.id})];},sample(){
        const shots=fixture.field.projectiles.shots;
        return {time:state.time,guardHp:guard.hp,houseHp:house.hp,projectiles:state.projectiles.map((p:any)=>{const shot=shots.get(p.id);let triangles=0;shot?.model.root.traverse((m:any)=>{if(m.isMesh)triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3;});return {...p,rendered:shot?.model.root.position.toArray(),quaternion:shot?.model.root.quaternion.toArray(),triangles,modelClass:shot?.model.constructor.name};}),shooters:[crossbow,siege].map(u=>{const m=fixture.field.models.get(u.id).instance;return {kind:u.kind,cue:u.attackCue,animation:u.animation,clips:m.variants.map((v:any)=>({name:v.action?.getClip().name,time:v.action?.time}))};})};}};
      (window as any).__flight=fixture;updateVisibility(state);return state;
    });
  });
  await page.locator('#rts-start').click();await expect(page.locator('#rts-battle')).toBeVisible({timeout:60000});await page.clock.pauseAt(new Date('2026-10-16T13:00:00Z'));
  await page.evaluate(()=>{const w=window as any;w.__rtsDebug.camera(29,34.5,24);w.__rtsDebug.setPaused(true);});
  expect(await page.evaluate(()=>{const w=window as any;w.__rtsDebug.setPaused(false);const commands=w.__flight.start();w.__rtsDebug.setPaused(true);return commands;})).toEqual([{ok:true},{ok:true}]);
  const samples:any[]=[];const advance=async(seconds:number,label:string)=>{await page.evaluate(s=>(window as any).__rtsDebug.advance(s),seconds);await page.clock.runFor(16);const row=await page.evaluate(()=>(window as any).__flight.sample());samples.push({label,...row});return row;};
  const windup=await advance(.05,'windup');expect(windup.projectiles).toHaveLength(0);expect(windup.guardHp).toBe(320);expect(windup.houseHp).toBe(500);
  for(const shooter of windup.shooters)expect(shooter.clips[0].name).toBe('Attack');
  const before=await advance(.45,'before-release');expect(before.projectiles).toHaveLength(0);
  const heavy=await advance(.05,'siege-release');expect(heavy.projectiles.map((p:any)=>p.kind)).toEqual(['shell']);
  expect(heavy.shooters.find((u:any)=>u.kind==='siege').clips[0].time).toBeCloseTo(.5,5);
  const aiming=await advance(.15,'before-crossbow-release');expect(aiming.projectiles.map((p:any)=>p.kind)).toEqual(['shell']);expect(aiming.shooters.find((u:any)=>u.kind==='crossbow').clips[0].time).toBeLessThan(16/24);
  const both=await advance(.05,'crossbow-release');expect(both.projectiles.map((p:any)=>p.kind).sort()).toEqual(['bolt','shell']);
  const releaseTime=both.shooters.find((u:any)=>u.kind==='crossbow').clips[0].time;expect(releaseTime).toBeGreaterThanOrEqual(16/24);expect(releaseTime).toBeLessThanOrEqual(16/24+.05);
  const flying=await advance(.20,'midflight');expect(flying.projectiles).toHaveLength(2);
  for(const shot of flying.projectiles){expect(shot.triangles).toBeGreaterThan(20);expect(shot.modelClass).toBe('ModelInstance');expect(shot.rendered[0]).toBeCloseTo(shot.x,5);expect(shot.rendered[2]).toBeCloseTo(shot.z,5);expect(shot.rendered[1]).toBe(shot.kind==='shell'?2.2:1.2);expect(shot.x).toBeGreaterThan(24);}
  await page.screenshot({path:out+'/midflight.png'});
  const boltHit=await advance(.20,'bolt-impact');expect(boltHit.guardHp).toBeLessThan(320);expect(boltHit.houseHp).toBe(500);expect(boltHit.projectiles.map((p:any)=>p.kind)).toEqual(['shell']);
  const heavyHit=await advance(.40,'siege-impact');expect(heavyHit.projectiles).toHaveLength(0);expect(heavyHit.houseHp).toBeLessThan(500);await page.screenshot({path:out+'/impacts.png'});
  expect(errors).toEqual([]);await writeFile(out+'/evidence.json',JSON.stringify({samples,errors,scope:'Real production commands, simulation, ProjectileLayer and GLTF ModelInstance: authored release, flight transforms and delayed target damage.'},null,2));
});
