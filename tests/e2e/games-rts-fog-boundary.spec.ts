import {waitForRtsLobby} from '../helpers/rts-readiness';
import {test,expect} from '@playwright/test';

test.use({viewport:{width:1600,height:1000}});
for(const action of ['attack','build'] as const)test(`fog boundary: real pointer ${action} agrees with the visible battlefield`,async({page},info)=>{
  test.setTimeout(120000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-11T12:00:00Z')});
  await page.goto('/games/rts');await waitForRtsLobby(page);
  // Focused placement fixture, not natural campaign evidence. Published models,
  // real visibility, command validation, input and economic transactions remain in use.
  await page.evaluate(async action=>{
    const mainPath='/src/scripts/games/rts/main.ts',statePath='/src/scripts/games/rts/state.ts',simPath='/src/scripts/games/rts/simulation.ts',fogPath='/src/scripts/games/rts/visibility.ts';
    // Follow the exact module URL used by main, including a Vite HMR timestamp;
    // importing the unversioned scene can otherwise patch an unused class.
    const main=await(await fetch(mainPath)).text(),scenePath=main.match(/from "([^"\n]*\/scene\.ts[^"\n]*)"/)?.[1];
    if(!scenePath)throw new Error('No active scene module');
    const {mountRts}=await import(mainPath),{addBuilding,addUnit}=await import(statePath),{createGame}=await import(simPath),{updateVisibility}=await import(fogPath),{Battlefield}=await import(scenePath);
    const render=Battlefield.prototype.render;
    Battlefield.prototype.render=function(...args:any[]){(window as any).__fogFixture.field=this;return render.apply(this,args);};
    const old=document.getElementById('rts')!,root=old.cloneNode(true) as HTMLElement;old.replaceWith(root);
    mountRts(root,(map:'river'|'pass',seed:number)=>{
      const state=createGame(map,seed);state.aiEnabled=[false,false];state.entities=[];
      state.map.blocked.fill(0);state.map.noBuild.fill(0);state.map.scenery=[];
      state.map.spawns[0]={x:28,z:30.5};
      addBuilding(state,0,'townhall',{x:8,z:80},true);addBuilding(state,1,'townhall',{x:88,z:80},true);
      const worker=addUnit(state,0,'worker',{x:23.5,z:30.5});worker.order={type:'hold'};
      const enemy=action==='attack'?addBuilding(state,1,'house',{x:36,z:30.5},true):undefined;
      updateVisibility(state);(window as any).__fogFixture={state,worker,enemy};return state;
    });
  },action);
  await page.locator('#rts-start').click();await expect(page.locator('#rts-battle')).toBeVisible({timeout:60000});
  await page.clock.pauseAt(new Date('2026-10-11T13:00:00Z'));
  expect(await page.evaluate(()=>{const s=(window as any).__fogFixture.state;return [s.visibility[0].visible[30*288+35],s.visibility[0].visible[30*288+36]];})).toEqual([1,0]);
  const screen=(x:number,z:number,y=0)=>page.evaluate(({x,z,y})=>(window as any).__fogFixture.field.screen({x,z},y),{x,z,y});
  const worker=await screen(23.5,30.5,1);await page.mouse.click(worker.x,worker.y);await page.clock.fastForward(150);
  await expect(page.locator('#rts-selection h2')).toHaveText('工人');
  if(action==='attack'){
    const enemy=await screen(36,30.5,1.5);await page.mouse.click(enemy.x,enemy.y,{button:'right'});
    expect(await page.evaluate(()=>{const f=(window as any).__fogFixture;return f.worker.order.type==='attack'&&f.worker.order.targetId===f.enemy.id;})).toBe(true);
    await expect(page.locator('#rts-notice')).not.toContainText('目標不在視野內');
  }else{
    await page.keyboard.press('b');await page.locator('#rts-commands button[data-label="民居"]').click();
    const point=await screen(36,30.5);await page.mouse.move(point.x,point.y);
    expect(await page.evaluate(()=>(window as any).__fogFixture.field.placement)).toMatchObject({valid:true,position:{x:36,z:30.5}});
    await page.clock.fastForward(16);await page.screenshot({path:info.outputPath('fog-preview.png')});
    await page.mouse.click(point.x,point.y);
    expect(await page.evaluate(()=>{const f=(window as any).__fogFixture;return {gold:f.state.teams[0].gold,wood:f.state.teams[0].wood,order:f.worker.order.type};})).toEqual({gold:420,wood:170,order:'build'});
  }
  await page.clock.fastForward(16);await page.screenshot({path:info.outputPath(`fog-${action}.png`)});
  expect(errors).toEqual([]);
});
