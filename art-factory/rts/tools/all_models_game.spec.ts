import {waitForRtsLobby} from '../../../tests/helpers/rts-readiness';
import {test,expect} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';

test.use({viewport:{width:1920,height:1080}});
test('all production units, clip endpoints, both teams, LOD and selection portraits',async({page},info)=>{
  test.setTimeout(240000);
  const run=process.env.RTS_ASSEMBLY_RUN??'art-factory/rts/runs/all-models/2026-10-14-v1';
  const manifest=JSON.parse(await readFile(run+'/review-manifest.json','utf8'));
  const kinds=['worker','guard','crossbow','priest','knight','siege','commander','neutral-raider'];
  const published=process.env.RTS_ASSEMBLY_PUBLISHED==='1';
  const folder=process.env.RTS_GAME_OUT??run+'/qa/'+(published?'game-published':'game');
  await mkdir(folder,{recursive:true});const errors:string[]=[],assets:any[]=[];
  let packing:any;try{packing=JSON.parse(await readFile(run+'/qa/lossless-packing.json','utf8'));}catch(error:any){if(error.code!=='ENOENT')throw error;}
  for(const entry of Object.values(manifest.assets) as any[])for(const key of ['url','lod1']){const url=entry[key];if(!url)continue;const id=url.split('/').pop();let path='public'+url;if(!published){try{await readFile(run+'/candidate/'+id);path=run+'/candidate/'+id;}catch(error:any){if(error.code!=='ENOENT')throw error;}}assets.push({id,url,path,sha256:createHash('sha256').update(await readFile(path)).digest('hex')});}
  if(!published&&packing)for(const material of packing.materials)assets.push({...material,path:run+'/'+material.file});
  if(!published)await page.route('**/assets/games/rts/**',async route=>{const asset=assets.find(a=>a.url===new URL(route.request().url()).pathname);if(asset)await route.fulfill({path:asset.path,contentType:asset.url.endsWith('.glb')?'model/gltf-binary':asset.url.endsWith('.webp')?'image/webp':asset.url.endsWith('.png')?'image/png':'image/jpeg'});else await route.continue();});
  const requested=new Set<string>();
  page.on('response',response=>{const path=new URL(response.url()).pathname;if(path.startsWith('/assets/games/rts/'))requested.add(path);});
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-11T12:00:00Z')});
  await page.goto('/games/rts');await waitForRtsLobby(page);
  await page.evaluate(async()=>{
    const mainPath='/src/scripts/games/rts/main.ts',main=await(await fetch(mainPath)).text();
    const scenePath=main.match(/from "([^"\n]*\/scene\.ts[^"\n]*)"/)?.[1];if(!scenePath)throw new Error('No active scene module');
    const simPath='/src/scripts/games/rts/simulation.ts',statePath='/src/scripts/games/rts/state.ts',fogPath='/src/scripts/games/rts/visibility.ts';
    const [{mountRts},{Battlefield},{createGame},{addBuilding,addUnit},{updateVisibility,getTeamView}]=await Promise.all([import(mainPath),import(scenePath),import(simPath),import(statePath),import(fogPath)]);
    const render=Battlefield.prototype.render;
    Battlefield.prototype.render=function(...args:any[]){
      const result=render.apply(this,args),f=(window as any).__allModelArt;f.field=this;
      if(f.enabled){
        for(const row of f.actors){const instance=(this as any).models.get(row.unit.id).instance;
          for(const variant of instance.variants){if(variant.sharedPose)continue;
            const clip=variant.clips.find((c:any)=>c.name===row.clip);variant.mixer.stopAllAction();
            const action=variant.mixer.clipAction(clip);action.reset();action.setLoop(2200,1);action.clampWhenFinished=true;action.play();action.time=clip.duration*row.fraction;action.paused=true;variant.mixer.update(0);
          }
        }
        this.renderer.shadowMap.needsUpdate=true;this.renderer.render(this.scene,this.camera);
      }return result;
    };
    const old=document.getElementById('rts')!,root=old.cloneNode(true) as HTMLElement;old.replaceWith(root);
    mountRts(root,()=>{
      const state=createGame('river',1);state.aiEnabled=[false,false];state.entities=[];state.resources=[];
      state.map.scenery=[];state.map.landmarks=[];state.map.resources=[];state.map.spawns[0]={x:26,z:32};
      addBuilding(state,0,'townhall',{x:8,z:80},true);addBuilding(state,1,'townhall',{x:88,z:80},true);
      (window as any).__allModelArt={state,actors:[],enabled:false,addUnit,updateVisibility,getTeamView};updateVisibility(state);return state;
    });
  });
  await page.locator('#rts-start').click();await expect(page.locator('#rts-battle')).toBeVisible({timeout:60000});
  await page.clock.pauseAt(new Date('2026-10-11T13:00:00Z'));
  await page.evaluate(()=>{const w=window as any;w.__rtsDebug.setPaused(true);w.__allModelArt.enabled=true;});
  const pictures:any[]=[],portraits:string[]=[];
  for(const kind of kinds){
    await page.evaluate(()=>{const f=(window as any).__allModelArt;f.enabled=false;f.state.entities=f.state.entities.filter((e:any)=>e.category==='building');f.actors=[];});
    const bytes=await readFile(assets.find(a=>a.id===kind+'.glb').path);
    const jsonLength=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+jsonLength).toString('utf8'));
    const names=doc.animations.map((a:any)=>a.name);
    const spacing=['knight','siege'].includes(kind)?4.6:2.8;
    await page.evaluate(({kind,names,spacing})=>{
      const f=(window as any).__allModelArt;
      for(const [column,clip]of names.entries())for(const[row,fraction]of[0,.33,.66,1].entries()){
        const unit=f.addUnit(f.state,row%2,kind,{x:20+column*spacing,z:27+row*spacing});unit.order={type:'hold'};unit.mana=0;
        f.actors.push({unit,clip,fraction});
      }
      f.updateVisibility(f.state);f.state.tick+=1;f.enabled=true;
    },{kind,names,spacing});
    for(const span of [48,24,112]){
      await page.evaluate(({x,z,span})=>(window as any).__rtsDebug.camera(x,z,span),{x:20+(names.length-1)*spacing/2,z:27+1.5*spacing,span});await page.clock.runFor(32);
      const samples=await page.evaluate(()=>{const f=(window as any).__allModelArt;return f.actors.map((row:any)=>{
        const visual=f.field.models.get(row.unit.id),instance=visual?.instance;if(!instance)throw new Error('Missing '+row.unit.kind+' '+row.unit.id);
        return {kind:row.unit.kind,height:visual.height,team:row.unit.team,clip:row.clip,fraction:row.fraction,variants:instance.variants.map((v:any)=>({visible:v.root.visible,shared:!!v.sharedPose,bones:v.root.children.length,active:v.mixer._actions.filter((a:any)=>a.isScheduled()).map((a:any)=>({clip:a.getClip().name,time:a.time}))}))};
      });});
      expect(samples).toHaveLength(names.length*4);
      for(const sample of samples){
        expect(sample.variants.filter((v:any)=>v.visible)).toHaveLength(1);expect(sample.variants[0].active.map((a:any)=>a.clip)).toEqual([sample.clip]);
        // Anatomical bounds are independent of the all-animation culling sphere.
        // Current candidate units are 1.7–2.6 m tall; all use high detail at the
        // nearest gameplay zoom, low detail at normal and overview spans.
        expect(sample.height).toBeGreaterThan(1.7);expect(sample.height).toBeLessThan(2.6);
        expect(sample.variants.map((v:any)=>v.visible)).toEqual(span===24?[true,false]:[false,true]);
      }
      await page.screenshot({path:`${folder}/${kind}-all-clips-span-${span}.png`});pictures.push({kind,span,samples});
    }
    const visibleLods=pictures.filter(p=>p.kind===kind).flatMap(p=>p.samples.flatMap((s:any)=>s.variants.map((v:any,i:number)=>v.visible?i:-1))).filter(i=>i>=0);
    expect(visibleLods).toEqual(expect.arrayContaining([0,1]));
    await page.evaluate(()=>{const f=(window as any).__allModelArt;f.enabled=false;(window as any).__rtsDebug.camera(20,27,24);});await page.clock.runFor(32);
    const point=await page.evaluate(()=>{const f=(window as any).__allModelArt;return f.field.screen(f.actors[0].unit,.9);});
    await page.mouse.click(point.x,point.y);await page.clock.runFor(150);
    await expect(page.locator('#rts-portrait')).toBeVisible();await expect(page.locator('#rts-portrait-view')).toHaveAttribute('data-kind',kind);
    await page.screenshot({path:`${folder}/selected-${kind}.png`});portraits.push(kind);
  }
  // Continuous production animation and shadow scheduling. No pose override or
  // forced shadow update: only deterministic simulation snapshots are staged.
  const shadowMotion:any[]=[];
  for(const span of [76,24])for(const animation of ['walk','attack','death']){
    await page.evaluate(({kinds,span,animation})=>{
      const f=(window as any).__allModelArt;f.enabled=false;f.state.entities=f.state.entities.filter((e:any)=>e.category==='building');
      f.motionUnits=kinds.map((kind,i)=>{const u=f.addUnit(f.state,0,kind,{x:24+(i%4)*5,z:28+Math.floor(i/4)*7});u.order={type:'hold'};u.mana=0;u.animation=animation;
        if(animation==='attack')u.attackCue={sequence:1,startedAt:f.state.time,targetId:0};
        if(animation==='death'){u.alive=false;u.deathTime=f.state.time;u.hp=0;}return u;});
      f.updateVisibility(f.state);f.field.focus({x:32,z:32});f.field.setSpan(span);f.field.selection=[];
      const renderer=f.field.renderer;f.shadowFrames=[];f.motionFrames=[];
      if(!f.originalRender){f.originalRender=renderer.render.bind(renderer);renderer.render=(scene:any,camera:any)=>{if(scene===f.field.scene)f.shadowFrames.push(renderer.shadowMap.needsUpdate);return f.originalRender(scene,camera);};}
      f.field.render(f.getTeamView(f.state,0),0);f.shadowFrames=[];
    },{kinds,span,animation});
    for(let frame=0;frame<60;frame++){
      await page.evaluate(({animation})=>{const f=(window as any).__allModelArt;f.state.time+=1/60;f.state.tick++;
        if(animation==='walk')for(const u of f.motionUnits)u.x+=1/60;
        f.updateVisibility(f.state);f.field.render(f.getTeamView(f.state,0),1/60);
        f.motionFrames.push(f.motionUnits.map((u:any)=>{const v=f.field.models.get(u.id).instance.variants[0];return {kind:u.kind,clip:v.action?.getClip().name,time:v.action?.time,x:f.field.models.get(u.id).instance.root.position.x};}));
      },{animation});
      if(frame%15===14)await page.screenshot({path:`${folder}/motion-${animation}-span-${span}-${frame+1}.png`});
    }
    const motion=await page.evaluate(()=>{const f=(window as any).__allModelArt;return {shadows:f.shadowFrames,frames:f.motionFrames};});
    expect(motion.shadows).toHaveLength(60);expect(motion.shadows.filter(Boolean)).toHaveLength(span===76?30:60);
    for(const unit of motion.frames[59]){
      expect(unit.clip,`${unit.kind} ${animation}`).toBe(animation[0].toUpperCase()+animation.slice(1));
      // Siege clips clamp just before one second; all units must still have
      // progressed on at least 50 of the 60 samples, rather than one late jump.
      expect(new Set(motion.frames.map((rows:any[])=>rows.find(row=>row.kind===unit.kind).time)).size).toBeGreaterThan(50);
      if(animation==='walk')expect(unit.x-motion.frames[0].find((row:any)=>row.kind===unit.kind).x).toBeGreaterThan(.9);
    }
    shadowMotion.push({span,animation,...motion});
  }
  await writeFile(`${folder}/shadow-motion.json`,JSON.stringify({scope:'60 consecutive 1/60s snapshots per Walk/Attack/Death at far/near gameplay spans; normal Battlefield.render and ModelInstance.animate, no forced shadow updates.',samples:shadowMotion,errors},null,2));
  expect(errors).toEqual([]);
  const downloadAssets=[];
  for(const url of requested){
    const record=assets.find(a=>a.url===url);const bytes=await readFile(record?.path??'public'+url);
    const encoded=/\.(png|webp|woff2|jpg|mp3)$/.test(url)?bytes.length:gzipSync(bytes,{level:6}).length;
    downloadAssets.push({url,bytes:bytes.length,encoded,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  const firstMapEstimatedGzipBytes=downloadAssets.reduce((sum,a)=>sum+a.encoded,0);
  expect(firstMapEstimatedGzipBytes).toBeLessThanOrEqual(35_000_000);
  for(const asset of assets){
    const served=await page.evaluate(async url=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await(await fetch(url)).arrayBuffer()))).map(x=>x.toString(16).padStart(2,'0')).join(''),asset.url);
    expect(served).toBe(asset.sha256);
  }
  await writeFile(`${folder}/evidence.json`,JSON.stringify({scope:'All eight units and their clips in actual production renderer, both teams and both LODs; real selection portraits. Staged pose evidence, not a combat victory test.',assets,pictures,errors,selectionPortraitVisible:portraits,allServedModelHashesMatch:true,download:{method:'Gzip level 6 estimate over unique RTS asset URLs actually requested by the first-map browser session; image/audio bytes unchanged. Not a measured CDN transfer.',firstMapEstimatedGzipBytes,assets:downloadAssets}},null,2));
});
