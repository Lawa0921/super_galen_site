import {waitForRtsLobby} from '../helpers/rts-readiness';
import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

// Staged 20-unit movement/renderer acceptance on unchanged map navigation.
// Natural match victories are verified separately, without this state fixture.
const crossings=[
  {map:'pass',name:'middle-pass',from:{x:128,z:144},to:{x:156,z:144}},
  {map:'pass',name:'north-pass',from:{x:128,z:69.5},to:{x:156,z:69.5}},
  {map:'river',name:'north-bridge',from:{x:132,z:86},to:{x:156,z:84}},
  {map:'river',name:'south-bridge',from:{x:132,z:204},to:{x:156,z:204}},
] as const;
test.use({viewport:{width:1920,height:1080}});
for(const crossing of crossings)test(`20 published guards cross ${crossing.name} through a real group order`,async({page},info)=>{
  test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const folder=info.outputPath('crossing');await mkdir(folder,{recursive:true});
  await page.clock.install({time:new Date('2026-10-11T12:00:00Z')});await page.goto('/games/rts');await waitForRtsLobby(page);
  await page.evaluate(async c=>{
    const mainPath='/src/scripts/games/rts/main.ts',main=await(await fetch(mainPath)).text();
    const scenePath=main.match(/from "([^"\n]*\/scene\.ts[^"\n]*)"/)?.[1];if(!scenePath)throw new Error('No active scene module');
    const simPath='/src/scripts/games/rts/simulation.ts',statePath='/src/scripts/games/rts/state.ts',navPath='/src/scripts/games/rts/navigation.ts',fogPath='/src/scripts/games/rts/visibility.ts';
    const [{mountRts},{Battlefield},{createGame},{addUnit,units,destroyEntity,distance},{isWalkable,findPath},{updateVisibility}]=await Promise.all([import(mainPath),import(scenePath),import(simPath),import(statePath),import(navPath),import(fogPath)]);
    const render=Battlefield.prototype.render;Battlefield.prototype.render=function(...args:any[]){(window as any).__crossing.field=this;return render.apply(this,args);};
    const old=document.getElementById('rts')!,root=old.cloneNode(true) as HTMLElement;old.replaceWith(root);
    mountRts(root,()=>{
      const state=createGame(c.map,1);state.aiEnabled=[false,false];for(const unit of units(state))destroyEntity(state,unit);
      const spots=[];for(let x=c.from.x-7;x<=c.from.x;x+=1.1)for(let z=c.from.z-5;z<=c.from.z+5;z+=1.1){const p={x,z};if(isWalkable(state.map,p,[],.5)&&findPath(state.map,p,c.to,[],.48))spots.push(p);}
      spots.sort((a,b)=>distance(a,c.from)-distance(b,c.from));const group=spots.slice(0,20).map(p=>addUnit(state,0,'guard',p));
      (window as any).__crossing={state,group};updateVisibility(state);return state;
    });
  },crossing);
  await page.locator(`input[value="${crossing.map}"]`).check();await page.locator('#rts-start').click();await expect(page.locator('#rts-battle')).toBeVisible({timeout:60000});
  await page.clock.pauseAt(new Date('2026-10-11T13:00:00Z'));
  await page.evaluate(c=>(window as any).__rtsDebug.camera(144,c.from.z,48),crossing);await page.clock.runFor(16);
  const points=await page.evaluate(()=>{const f=(window as any).__crossing;return f.group.map((u:any)=>f.field.screen(u));});expect(points).toHaveLength(20);
  const left=Math.min(...points.map((p:any)=>p.x))-12,right=Math.max(...points.map((p:any)=>p.x))+12,top=Math.min(...points.map((p:any)=>p.y))-12,bottom=Math.max(...points.map((p:any)=>p.y))+12;
  await page.mouse.move(left,top);await page.mouse.down();await page.mouse.move(right,bottom,{steps:8});await page.mouse.up();await page.clock.runFor(100);
  await expect(page.locator('.rts-group-list button')).toHaveCount(20);
  const target=await page.evaluate(to=>(window as any).__crossing.field.screen(to),crossing.to);await page.mouse.click(target.x,target.y,{button:'right'});
  await page.clock.runFor(100);await page.screenshot({path:`${folder}/start.png`});
  const samples:any[]=[],crossed=new Set<number>();let lastCross:number|null=null,settled:number|null=null;
  const began=await page.evaluate(()=>(window as any).__crossing.state.time);
  for(let step=0;step<240;step++){
    await page.clock.runFor(250);
    const frame=await page.evaluate(()=>{const f=(window as any).__crossing;return {time:f.state.time,units:f.group.map((u:any)=>({id:u.id,x:u.x,z:u.z,order:u.order.type,animation:u.animation,alive:u.alive}))};});
    samples.push(frame);for(const u of frame.units)if(u.x>150)crossed.add(u.id);
    if(lastCross===null&&crossed.size===20)lastCross=frame.time-began;
    if(step===19)await page.screenshot({path:`${folder}/crossing.png`});
    if(frame.units.every((u:any)=>u.order==='idle')){settled=frame.time-began;break;}
  }
  await page.screenshot({path:`${folder}/settled.png`});
  const final=samples.at(-1).units,overlaps=[];
  for(let i=0;i<final.length;i++)for(let j=i+1;j<final.length;j++)if(Math.hypot(final[i].x-final[j].x,final[i].z-final[j].z)<.96*.9)overlaps.push([final[i].id,final[j].id]);
  await writeFile(`${folder}/evidence.json`,JSON.stringify({scope:'staged group movement, production commands/maps/renderer and published models',crossing,began,lastCross,settled,overlaps,samples,errors},null,2));
  expect(lastCross).not.toBeNull();expect(lastCross!).toBeLessThan(16);expect(settled).not.toBeNull();expect(overlaps).toEqual([]);
  expect(final.every((u:any)=>u.alive&&Math.hypot(u.x-crossing.to.x,u.z-crossing.to.z)<6)).toBe(true);expect(errors).toEqual([]);
});
