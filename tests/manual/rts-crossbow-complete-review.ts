/** Isolated asset override in a real Battlefield/SelectionPortrait. No publishing. */
import {chromium,expect} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const run='art-factory/rts/runs/original-crossbow-complete/2026-10-07-v1',out=run+'/qa/assembly';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chromium',headless:true});
try {
 const rows=[];
 for(const map of ['river','pass']){
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors:string[]=[],served:{lod:number;sha256:string}[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  for(const lod of [0,1])await page.route(`**/assets/games/rts/models/crossbow${lod?'-lod1':''}.glb`,async route=>{
   const body=await readFile(`${run}/candidate/original-crossbow-grip-lod${lod}.glb`);served.push({lod,sha256:createHash('sha256').update(body).digest('hex')});await route.fulfill({contentType:'model/gltf-binary',body});
  });
  await page.goto('http://127.0.0.1:4324/games/rts/');await page.waitForLoadState('networkidle');
  await page.addScriptTag({type:'module',content:`
   const mainPath='/src/scripts/games/rts/main.ts',source=await (await fetch(mainPath)).text();
   const scenePath=source.match(new RegExp('from "([^"]*scene[.]ts[^"]*)"'))[1];
   const simulationPath=source.match(new RegExp('from "([^"]*simulation[.]ts[^"]*)"'))[1];
   const {Battlefield}=await import(scenePath),{mountRts}=await import(mainPath),{createGame}=await import(simulationPath);
   const {addUnit}=await import('/src/scripts/games/rts/state.ts');const {updateVisibility}=await import('/src/scripts/games/rts/visibility.ts');
   const audit={field:null,state:null,ids:[]};window.crossbowCompleteAudit=audit;
   const render=Battlefield.prototype.render;Battlefield.prototype.render=function(view,dt,alpha){audit.field=this;return render.call(this,view,dt,alpha);};
   const old=document.getElementById('rts'),root=old.cloneNode(true);old.replaceWith(root);
   mountRts(root,(...args)=>{const state=createGame(...args);state.aiEnabled=[false,false];state.entities=state.entities.filter(e=>e.category!=='unit');
    for(const x of [32,34,36])audit.ids.push(addUnit(state,0,'crossbow',{x,z:42}).id);
    updateVisibility(state);audit.state=state;return state;});
  `});
  await page.getByRole('radio',{name:map==='river'?/雙河谷地/:/灰脊隘口/}).check();await page.locator('#rts-start').click();
  await page.locator('#rts-battle').waitFor({state:'visible',timeout:60000});await page.waitForFunction(()=>!!(window as any).crossbowCompleteAudit?.field);
  await page.evaluate(()=>{const a=(window as any).crossbowCompleteAudit;a.field.focus({x:34,z:42});a.field.zoom(-100);});await page.waitForTimeout(200);
  const pick=await page.evaluate(()=>{const a=(window as any).crossbowCompleteAudit,e=a.state.entities.find((v:any)=>v.id===a.ids[0]);
   for(const y of [1,.5,1.5,0]){const p=a.field.screen(e,y);if(a.field.pick(p.x,p.y)?.entityId===e.id)return p;}throw Error('Candidate cannot be selected');});
  await page.mouse.click(pick.x,pick.y);await expect(page.locator('#rts-portrait-view')).toHaveAttribute('data-kind','crossbow');
  const pose=()=>page.evaluate(()=>{const p=(window as any).crossbowCompleteAudit.field.portrait,values:number[]=[];p.instance.root.traverse((o:any)=>{if(o.isBone)values.push(...o.matrixWorld.elements);});return values;});
  const first=await pose();await page.waitForTimeout(360);const second=await pose();expect(second).not.toEqual(first);
  await page.screenshot({path:`${out}/${map}-portrait-and-army.png`});await page.locator('#rts-portrait-view').screenshot({path:`${out}/${map}-portrait.png`});
  const target=await page.evaluate(()=>{const a=(window as any).crossbowCompleteAudit;return a.field.screen({x:39,z:42});});await page.mouse.click(target.x,target.y,{button:'right'});
  await page.waitForFunction(()=>{const a=(window as any).crossbowCompleteAudit;return a.state.entities.find((v:any)=>v.id===a.ids[0]).x>32.5;},{},{timeout:10000});
  await page.screenshot({path:`${out}/${map}-move.png`});expect(served).toHaveLength(2);expect(errors).toEqual([]);
  rows.push({map,served,selection:true,portrait_bones_animate:true,mouse_move:true,errors});await page.close();
 }
 await writeFile(`${out}/report.json`,JSON.stringify({assembly_interaction_pass:true,art_approved:false,runtime_publish_allowed:false,scope:'Controlled roster, isolated browser asset routes; no natural-campaign or attack-timing approval.',rows},null,2)+'\n');console.log(JSON.stringify({assembly_interaction_pass:true,maps:rows.length,art_approved:false}));
}finally{await browser.close();}
