import {waitForRtsLobby} from '../../../tests/helpers/rts-readiness';
import {test,expect} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

test.use({viewport:{width:1920,height:1080}});
test('current commander five base clips at gameplay camera scales',async({page},info)=>{
  test.setTimeout(120000);
  const run='art-factory/rts/runs/commander-grip/2026-10-14-v1';
  const published=process.env.RTS_GRIP_PUBLISHED==='1';
  const folder=run+'/qa/'+(published?'game-published':'game');
  if(!published)await page.route('**/assets/games/rts/models/commander*.glb',route=>route.fulfill({path:run+'/candidate/commander-lod'+(route.request().url().includes('-lod1')?'1':'0')+'.glb',contentType:'model/gltf-binary'}));
  await mkdir(folder,{recursive:true});const errors:string[]=[],assets:any[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  for(const id of ['commander','commander-lod1'])assets.push({id,sha256:createHash('sha256').update(await readFile(published?`public/assets/games/rts/models/${id}.glb`:`${run}/candidate/commander-lod${id.endsWith('-lod1')?1:0}.glb`)).digest('hex')});
  await page.clock.install({time:new Date('2026-10-11T12:00:00Z')});
  await page.goto('/games/rts');await waitForRtsLobby(page);
  await page.evaluate(async()=>{
    const mainPath='/src/scripts/games/rts/main.ts',main=await(await fetch(mainPath)).text();
    const scenePath=main.match(/from "([^"\n]*\/scene\.ts[^"\n]*)"/)?.[1];if(!scenePath)throw new Error('No active scene module');
    const simPath='/src/scripts/games/rts/simulation.ts',statePath='/src/scripts/games/rts/state.ts',fogPath='/src/scripts/games/rts/visibility.ts';
    const [{mountRts},{Battlefield},{createGame},{addBuilding,addUnit},{updateVisibility}]=await Promise.all([import(mainPath),import(scenePath),import(simPath),import(statePath),import(fogPath)]);
    const render=Battlefield.prototype.render;
    Battlefield.prototype.render=function(...args:any[]){
      const result=render.apply(this,args),f=(window as any).__commanderArt;f.field=this;
      if(f.enabled){
        for(const row of f.actors){const instance=(this as any).models.get(row.unit.id).instance;
          for(const variant of instance.variants){if(variant.sharedPose)continue;
            const clip=variant.clips.find((c:any)=>c.name===row.clip);variant.mixer.stopAllAction();
            const action=variant.mixer.clipAction(clip);action.reset();action.setLoop(2200,1);action.clampWhenFinished=true;action.play();action.time=clip.duration*row.fraction;action.paused=true;variant.mixer.update(0);
          }
        }
        this.renderer.render(this.scene,this.camera);
      }return result;
    };
    const old=document.getElementById('rts')!,root=old.cloneNode(true) as HTMLElement;old.replaceWith(root);
    mountRts(root,()=>{
      const state=createGame('river',1);state.aiEnabled=[false,false];state.entities=[];state.resources=[];
      state.map.scenery=[];state.map.landmarks=[];state.map.resources=[];state.map.spawns[0]={x:26,z:32};
      addBuilding(state,0,'townhall',{x:8,z:80},true);addBuilding(state,1,'townhall',{x:88,z:80},true);
      const actors:any[]=[];
      for(const [column,clip] of ['Idle','Walk','Attack','Hurt','Death'].entries())for(const [row,fraction] of [0,.33,.66,1].entries()){
        const unit=addUnit(state,0,'commander',{x:20+column*3,z:27+row*3});unit.order={type:'hold'};unit.mana=0;actors.push({unit,clip,fraction});
      }
      (window as any).__commanderArt={state,actors,enabled:false};updateVisibility(state);return state;
    });
  });
  await page.locator('#rts-start').click();await expect(page.locator('#rts-battle')).toBeVisible({timeout:60000});
  await page.clock.pauseAt(new Date('2026-10-11T13:00:00Z'));
  await page.evaluate(()=>{const w=window as any;w.__rtsDebug.setPaused(true);w.__commanderArt.enabled=true;});
  const pictures:any[]=[];
  // 48/24 are gameplay scales. 96 is a separately labelled LOD diagnostic;
  // commander's full animation bounds retain LOD0 at both gameplay scales.
  for(const span of [48,24,96]){
    await page.evaluate(span=>(window as any).__rtsDebug.camera(26,32,span),span);await page.clock.runFor(16);
    const samples=await page.evaluate(()=>{const f=(window as any).__commanderArt;return f.actors.map((row:any)=>{
      const instance=f.field.models.get(row.unit.id).instance;return {clip:row.clip,fraction:row.fraction,screen:f.field.screen(row.unit),variants:instance.variants.map((v:any)=>({visible:v.root.visible,shared:!!v.sharedPose,active:v.mixer._actions.filter((a:any)=>a.isScheduled()).map((a:any)=>({clip:a.getClip().name,time:a.time}))}))};
    });});
    expect(samples).toHaveLength(20);for(const s of samples){expect(s.variants.filter((v:any)=>v.visible)).toHaveLength(1);expect(s.variants[0].active.map((a:any)=>a.clip)).toEqual([s.clip]);}
    await page.screenshot({path:`${folder}/base-clips-span-${span}.png`});pictures.push({span,samples});
  }
  expect(pictures.flatMap(p=>p.samples.flatMap((s:any)=>s.variants.map((v:any,i:number)=>v.visible?i:-1))).filter(i=>i>=0)).toEqual(expect.arrayContaining([0,1]));
  expect(errors).toEqual([]);
  // Return to the unmodified render path before checking the portrait. The
  // staged-pose renderer would otherwise overwrite its final scissor viewport.
  await page.evaluate(()=>{(window as any).__commanderArt.enabled=false;(window as any).__rtsDebug.camera(26,32,24);});await page.clock.runFor(16);
  const point=await page.evaluate(()=>{const f=(window as any).__commanderArt;return f.field.screen(f.actors[0].unit,.9);});
  await page.mouse.click(point.x,point.y);await page.clock.runFor(150);
  await expect(page.locator('#rts-portrait')).toBeVisible();
  await page.screenshot({path:`${folder}/selected-commander.png`});
  for(const asset of assets){
    const served=await page.evaluate(async id=>Array.from(new Uint8Array(await (await fetch('/assets/games/rts/models/'+id+'.glb')).arrayBuffer())),asset.id);
    expect(createHash('sha256').update(Buffer.from(served)).digest('hex')).toBe(asset.sha256);
  }
  await writeFile(`${folder}/evidence.json`,JSON.stringify({scope:'Staged five base clips in production lighting and cameras; then real render path for selection portrait. Not a live combat victory test.',assets,pictures,errors,selectionPortraitVisible:true,bothServedModelHashesMatch:true},null,2));
});
