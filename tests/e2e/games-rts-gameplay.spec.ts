import {waitForRtsLobby} from '../helpers/rts-readiness';
import {test,expect} from '@playwright/test';
import type {Building,Unit} from '../../src/scripts/games/rts/types';
import type {TeamView} from '../../src/scripts/games/rts/scene';

test.use({viewport:{width:1600,height:1000}});

for(const map of ['river','pass'] as const)test(`gameplay controls: natural ${map} resource rally and minimap orders`,async({page})=>{
  test.setTimeout(180000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-04T12:00:00Z')});await page.goto('/games/rts');
  await waitForRtsLobby(page);
  // Observe only the rendered player view and projection, without injecting a
  // state, resources, commands, AI policy or outcome into this natural opening.
  await page.addScriptTag({type:'module',content:`
    const source=await(await fetch('/src/scripts/games/rts/main.ts')).text();
    const match=source.match(new RegExp('from "([^"]*scene[.]ts[^"]*)"'));
    if(!match)throw new Error('Missing battlefield module');
    const {Battlefield}=await import(match[1]),original=Battlefield.prototype.render;
    Battlefield.prototype.render=function(view,dt,alpha){window.rtsGameplay={field:this,view};return original.call(this,view,dt,alpha);};
  `});
  await page.locator(`input[value="${map}"]`).check();await page.locator('#rts-start').click();
  await expect(page.locator('#rts-battle')).toBeVisible({timeout:30000});await page.clock.pauseAt(new Date('2026-10-04T13:00:00Z'));
  const advance=async(seconds:number)=>{for(let i=0;i<Math.round(seconds*4);i++)await page.clock.fastForward(250);};
  const view=()=>page.evaluate(()=>(window as any).rtsGameplay.view as TeamView);
  const click=async(x:number,z:number,height=1,button:'left'|'right'='left',id?:number)=>{
    const p=await page.evaluate(p=>(window as any).rtsGameplay.field.screen(p,p.height),{x,z,height,id});
    await page.mouse.click(p.x,p.y,{button});await advance(.25);
  };
  const command=()=>page.locator('#rts-commands').getByRole('button',{name:/^工人/});
  const hall=()=>view().then(v=>v.entities.find(e=>e.team===0&&e.kind==='townhall') as Building);
  const workers=()=>view().then(v=>v.entities.filter((e):e is Unit=>e.team===0&&e.kind==='worker'&&e.category==='unit'));
  const initialIds=(await workers()).map(w=>w.id);
  await click(24,144,2);await expect(page.locator('#rts-selection h2')).toHaveText('領主府');
  for(const kind of ['gold','wood'] as const){
    const before=await workers(),resource=(await view()).resources.find(r=>r.kind===kind)!;
    expect(resource).toBeDefined();
    // The first tree stands east of the resource node; the node centre is the
    // timber pile, not a tree crown (especially for the narrow highland pine).
    await click(resource.x+(kind==='wood'?2.8:0),resource.z,kind==='wood'?3:1,'right');
    expect((await hall()).rally?.resourceId).toBe(resource.id);
    await expect(page.locator('#rts-selection')).toContainText('新工人自動採集');
    const gathered=(await view()).team.stats[kind==='gold'?'gatheredGold':'gatheredWood'];
    await command().click();await advance(6.5);
    const worker=(await workers()).find(w=>!before.some(old=>old.id===w.id))!;
    expect(worker?.order).toEqual({type:'gather',resourceId:resource.id});
    await advance(23);
    expect((await view()).team.stats[kind==='gold'?'gatheredGold':'gatheredWood']).toBeGreaterThan(gathered);
  }
  await page.screenshot({path:test.info().outputPath(`gameplay-${map}-resource-rally.png`)});
  const mini=await page.locator('#rts-minimap').boundingBox();if(!mini)throw new Error('Missing minimap');
  const miniClick=async(x:number,z:number,button:'left'|'right'='left')=>{await page.mouse.click(mini.x+x/288*mini.width,mini.y+z/288*mini.height,{button});await advance(.25);};
  // WebKit quantizes synthetic pointer coordinates to CSS pixels. Bound the
  // destination error by one minimap pixel, rather than an impossible 0.0001 m.
  const expectMiniPoint=(actual:{x:number;z:number},x:number,z:number)=>{
    expect(Math.abs(actual.x-x)).toBeLessThanOrEqual(288/mini.width);
    expect(Math.abs(actual.z-z)).toBeLessThanOrEqual(288/mini.height);
  };
  await miniClick(32,135,'right');const rally=(await hall()).rally!;
  expectMiniPoint(rally,32,135);expect(rally.resourceId).toBeUndefined();
  await expect(page.locator('#rts-selection')).toContainText('已設集結點');
  await expect(page.locator('#rts-selection')).not.toContainText('新工人自動採集');
  const worker=(await workers()).find(w=>w.id===initialIds[0])!;await click(worker.x,worker.z,1,'left',worker.id);
  await expect(page.locator('#rts-selection h2')).toHaveText('工人');
  await page.keyboard.press('a');await expect(page.locator('#rts-mode')).toBeVisible();
  await miniClick(24,144); // An occupied townhall footprint is not a movement destination.
  await expect(page.locator('#rts-mode')).toBeVisible();
  expect((await workers()).find(w=>w.id===worker.id)?.order.type).toBe('idle');
  await miniClick(33,132);
  await expect(page.locator('#rts-mode')).toBeHidden();
  const order=(await workers()).find(w=>w.id===worker.id)!.order;
  expect(order).toMatchObject({type:'move',attackMove:true});
  if(order.type!=='move')throw new Error('Expected minimap movement');
  expectMiniPoint(order.position,33,132);
  const start=(await workers()).find(w=>w.id===worker.id)!;await advance(2);
  const moving=(await workers()).find(w=>w.id===worker.id)!;expect(Math.hypot(moving.x-start.x,moving.z-start.z)).toBeGreaterThan(1);
  await page.keyboard.press('a');await miniClick(33,130,'right');await expect(page.locator('#rts-mode')).toBeHidden();
  expect((await workers()).find(w=>w.id===worker.id)?.order).toMatchObject({type:'move',attackMove:true});
  // Normal minimap left click changes the camera without replacing the order.
  const beforeCamera=await page.evaluate(()=>(window as any).rtsGameplay.field.screen({x:24,z:144},0));
  await miniClick(40,136);
  const afterCamera=await page.evaluate(()=>(window as any).rtsGameplay.field.screen({x:24,z:144},0));
  expect(Math.hypot(afterCamera.x-beforeCamera.x,afterCamera.y-beforeCamera.y)).toBeGreaterThan(10);
  expect((await workers()).find(w=>w.id===worker.id)?.order).toMatchObject({type:'move',attackMove:true});
  await page.screenshot({path:test.info().outputPath(`gameplay-${map}-minimap-order.png`)});expect(errors).toEqual([]);
});
