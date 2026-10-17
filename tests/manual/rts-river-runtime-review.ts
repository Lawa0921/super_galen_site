/** Controlled UI fixtures on the actual game, not a natural campaign.
 * Positions/roster are prepared; selection, gathering and movement use real mouse input. */
import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const folder='art-factory/rts/runs/riverbank/2026-10-07-v1/qa/runtime/interaction';
await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&/THREE|shader/i.test(m.text()))errors.push(m.text());});
 await page.goto(`${process.env.RTS_BASE_URL??'http://127.0.0.1:4324'}/games/rts/`);
 await page.waitForLoadState('networkidle');
 await page.addScriptTag({type:'module',content:`
  const mainPath='/src/scripts/games/rts/main.ts',source=await (await fetch(mainPath)).text();
  const scenePath=source.match(new RegExp('from "([^"]*scene[.]ts[^"]*)"'))[1];
  const simulationPath=source.match(new RegExp('from "([^"]*simulation[.]ts[^"]*)"'))[1];
  const {Battlefield}=await import(scenePath),{mountRts}=await import(mainPath),{createGame}=await import(simulationPath);
  const {addUnit}=await import('/src/scripts/games/rts/state.ts');
  const {updateVisibility}=await import('/src/scripts/games/rts/visibility.ts');
  const audit={field:null,state:null,addUnit,updateVisibility};window.riverRuntimeAudit=audit;
  const render=Battlefield.prototype.render;
  Battlefield.prototype.render=function(view,dt,alpha){audit.field=this;return render.call(this,view,dt,alpha);};
  const old=document.getElementById('rts'),root=old.cloneNode(true);old.replaceWith(root);
  mountRts(root,(...args)=>{const state=createGame(...args);state.aiEnabled=[false,false];state.entities=state.entities.filter(e=>e.team!==-1);audit.state=state;return state;});
 `});
 await page.locator('#rts-start').click();await page.locator('#rts-battle').waitFor({state:'visible',timeout:60000});
 await page.waitForFunction(()=>!!(window as any).riverRuntimeAudit?.field);
 expect(await page.evaluate(()=>(window as any).riverRuntimeAudit.state.map.terrainProfile)).toBe('meandering-river');
 const pick=async(id:number|string)=>page.evaluate(id=>{
  const a=(window as any).riverRuntimeAudit,f=a.field,e=typeof id==='number'?a.state.entities.find((v:any)=>v.id===id):a.state.resources.find((v:any)=>v.id===id);
  for(const height of [1,2,.5,3,0])for(const dx of [0,-.4,.4]){
   const p=f.screen({x:e.x+dx,z:e.z},height),hit=f.pick(p.x,p.y);
   if((typeof id==='number'?hit?.entityId:hit?.resourceId)===id)return p;
  }throw new Error('Fixture target cannot be picked: '+id);
 },id);
 const mines=[];
 for(const side of ['north','south']){
  const fixture=await page.evaluate(side=>{
   const a=(window as any).riverRuntimeAudit,s=a.state,f=a.field,r=s.resources.find((v:any)=>v.id===`river-gold-${side}`);
   const worker=s.entities.find((e:any)=>e.team===0&&e.kind==='worker');
   worker.x=r.x+(side==='north'?-5:5);worker.z=r.z;worker.path=[];worker.order={type:'idle'};worker.taskTime=0;worker.cargo.amount=0;
   r.remaining=4;
   a.updateVisibility(s);f.focus(r);f.zoom(-100);return {worker:worker.id,id:r.id,x:r.x,z:r.z,originalAmount:r.amount,before:r.remaining,goldBefore:s.teams[0].stats.gatheredGold};
  },side);
  await page.waitForTimeout(200);
  const w=await pick(fixture.worker);await page.mouse.click(w.x,w.y);
  await expect(page.locator('#rts-portrait-view')).toHaveAttribute('data-kind','worker');
  const r=await pick(fixture.id);await page.mouse.click(r.x,r.y,{button:'right'});
  await page.waitForFunction(f=>{const s=(window as any).riverRuntimeAudit.state,u=s.entities.find((e:any)=>e.id===f.worker);return u.order.type==='gather'&&u.order.resourceId===f.id;},fixture,{timeout:3000});
  await page.waitForFunction(f=>{const a=(window as any).riverRuntimeAudit;return a.state.resources.find((r:any)=>r.id===f.id).remaining===0&&!a.field.resources.get(f.id).root.visible;},fixture,{timeout:20000});
  const after=await page.evaluate(id=>(window as any).riverRuntimeAudit.state.resources.find((r:any)=>r.id===id).remaining,fixture.id);
  await page.screenshot({path:`${folder}/mine-${side}.png`});
  await page.waitForFunction(f=>(window as any).riverRuntimeAudit.state.teams[0].stats.gatheredGold===f.goldBefore+f.before,fixture,{timeout:60000});
  const returned=await page.evaluate(id=>{const a=(window as any).riverRuntimeAudit,r=a.state.resources.find((r:any)=>r.id===id);return {gathered:a.state.teams[0].stats.gatheredGold,mineVisible:a.field.resources.get(id).root.visible,cellVisible:a.state.visibility[0].visible[Math.floor(r.z)*96+Math.floor(r.x)]};},fixture.id);
  expect(returned.mineVisible).toBe(false);expect(returned.cellVisible).toBe(0);
  mines.push({...fixture,after,returned});
 }
 const crossings=[];
 for(const z of [28,68]){
  const ids=await page.evaluate(z=>{
   const a=(window as any).riverRuntimeAudit,s=a.state;s.entities=s.entities.filter((e:any)=>e.category!=='unit');
   const ids=['siege','knight','guard','crossbow'].map((kind,i)=>a.addUnit(s,0,kind,{x:40+(i%2)*2.2,z:z-1.5+Math.floor(i/2)*3}).id);
   a.updateVisibility(s);a.field.focus({x:48,z});a.field.zoom(-100);return ids;
  },z);
  await page.waitForTimeout(200);
  for(let i=0;i<ids.length;i++){
   const p=await pick(ids[i]);if(i>0)await page.keyboard.down('Shift');await page.mouse.click(p.x,p.y);if(i>0)await page.keyboard.up('Shift');
  }
  expect(await page.evaluate(()=>(window as any).riverRuntimeAudit.field.selection)).toEqual(ids);
  const target=await page.evaluate(z=>(window as any).riverRuntimeAudit.field.screen({x:56,z}),z);
  await page.mouse.click(target.x,target.y,{button:'right'});
  await page.waitForFunction(ids=>{const s=(window as any).riverRuntimeAudit.state;return ids.every(id=>s.entities.find((e:any)=>e.id===id).x>45);},ids,{timeout:20000});
  await page.screenshot({path:`${folder}/group-bridge-${z}.png`});
  await page.waitForFunction(ids=>{const s=(window as any).riverRuntimeAudit.state;return ids.every(id=>s.entities.find((e:any)=>e.id===id).x>53);},ids,{timeout:20000});
  const units=await page.evaluate(ids=>ids.map(id=>{const e=(window as any).riverRuntimeAudit.state.entities.find((e:any)=>e.id===id);return {kind:e.kind,x:e.x,z:e.z};}),ids);
  crossings.push({bridgeZ:z,units});
 }
 await page.evaluate(()=>{
  const a=(window as any).riverRuntimeAudit,f=a.field;a.oldField=f;
  a.disposal=['ownedGeometry','ownedMaterial','ownedTexture'].map(key=>{
   const item={key,expected:f[key].length,disposed:0};for(const resource of f[key])resource.addEventListener('dispose',()=>item.disposed++);return item;
  });
 });
 await page.locator('#rts-pause').click();await page.locator('#rts-restart').click();await page.locator('#rts-confirm-yes').click();
 await page.waitForFunction(()=>{const a=(window as any).riverRuntimeAudit;return a.field!==a.oldField;});
 const disposal=await page.evaluate(()=>{const a=(window as any).riverRuntimeAudit;return {resources:a.disposal,oldContextLost:a.oldField.renderer.getContext().isContextLost(),currentContextLost:a.field.renderer.getContext().isContextLost()};});
 for(const row of disposal.resources)expect(row.disposed).toBe(row.expected);
 expect(disposal.oldContextLost).toBe(true);expect(disposal.currentContextLost).toBe(false);expect(errors).toEqual([]);
 await page.screenshot({path:`${folder}/restarted-game.png`});
 const report={pass:true,fixture:'Actual game; prepared unit positions/roster and four remaining gold per expansion; normal mouse selection/gather/move, return/deposit, depletion visibility and live simulation. Not natural economy campaign.',mines,crossings,disposal,errors};
 await writeFile(`${folder}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}
