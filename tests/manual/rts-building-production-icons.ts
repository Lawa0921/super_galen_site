// Funded UI fixture with real commands. Accelerated upgrade ticks are not a natural-match claim.
import {chromium,firefox,webkit,expect,type Page} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {BUILDINGS,TIER_UPGRADES} from '../../src/scripts/games/rts/catalog';

const output=process.env.RTS_BUILDING_ICON_OUT??'art-factory/rts/runs/commercial-readiness/2026-10-09/qa/building-production-icons-browser-v1';
const candidate=process.env.RTS_BUILDING_ICON_CANDIDATE!=='0';
const run='art-factory/rts/runs/building-production-icons/2026-10-09-v1';
const assetIds=[...Object.keys(BUILDINGS),'townhall-tier2','townhall-tier3'];
const assets=await Promise.all(assetIds.map(async id=>{const bytes=await readFile(`${run}/candidate/${id}.webp`);return {id,bytes,sha256:createHash('sha256').update(bytes).digest('hex')};}));
const sourceHashes=await Promise.all(['src/scripts/games/rts/hud.ts','src/styles/_rts.scss'].map(async path=>({path,sha256:createHash('sha256').update(await readFile(path)).digest('hex')})));
const engines=Object.entries({chromium,firefox,webkit}).filter(([name])=>!process.env.RTS_BROWSER||name===process.env.RTS_BROWSER);
if(!engines.length)throw new Error('Unknown RTS_BROWSER');
await mkdir(output,{recursive:true});const results=[];
for(const [name,engine] of engines){
  const browser=await engine.launch(name==='chromium'?{channel:'chromium',headless:true,args:['--enable-gpu','--force_high_performance_gpu']}:{headless:true});
  const errors:string[]=[];let page:Page|undefined;let phase='start';
  try{
    page=await browser.newPage({viewport:{width:1600,height:1000}});
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    if(candidate)for(const asset of assets)await page.route(`**/assets/games/rts/ui/commands/building-${asset.id}.webp`,route=>route.fulfill({contentType:'image/webp',body:asset.bytes}));
    await page.goto(`${process.env.RTS_BASE_URL??'http://127.0.0.1:4344'}/games/rts`);await page.waitForLoadState('networkidle');
    await page.addScriptTag({type:'module',content:`
      const path='/src/scripts/games/rts/main.ts',source=await(await fetch(path)).text();
      const {Battlefield}=await import(source.match(new RegExp('from "([^"]*scene[.]ts[^"]*)"'))[1]);
      const {mountRts}=await import(path),{createGame,stepGame}=await import('/src/scripts/games/rts/simulation.ts');
      const {addUnit,addBuilding}=await import('/src/scripts/games/rts/state.ts'),{updateVisibility}=await import('/src/scripts/games/rts/visibility.ts');
      const a={stepGame,updateVisibility};window.buildingIconReview=a;
      const render=Battlefield.prototype.render;Battlefield.prototype.render=function(view,dt,alpha){a.field=this;a.view=view;
        if(!a.focused){a.focused=true;this.focus({x:25,z:40});}const result=render.call(this,view,dt,alpha);
        if(a.snapshot){const done=a.snapshot;a.snapshot=null;done(this.canvas.toDataURL());}return result;};
      const old=document.getElementById('rts'),root=old.cloneNode(true);old.replaceWith(root);
      mountRts(root,(...args)=>{const s=createGame(...args);s.aiEnabled=[false,false];s.entities=[];s.resources=[];s.map.blocked.fill(0);s.map.noBuild.fill(0);
        s.teams[0].gold=10000;s.teams[0].wood=10000;
        a.main=addBuilding(s,0,'townhall',{x:14,z:48},true);a.main.tier=3;
        a.hall=addBuilding(s,0,'townhall',{x:26,z:46},true);
        addBuilding(s,1,'townhall',{x:82,z:48},true);
        for(const [kind,x,z] of [['barracks',24,28],['forge',35,28],['chapel',35,38],['lumbermill',14,28]])addBuilding(s,0,kind,{x,z},true);
        a.worker=addUnit(s,0,'worker',{x:23,z:39});a.state=s;updateVisibility(s);return s;});a.mounted=true;
    `});
    await page.waitForFunction(()=>!!(window as any).buildingIconReview?.mounted);
    await page.locator('#rts-start').click();await expect(page.locator('#rts-battle')).toBeVisible({timeout:60000});
    await page.waitForFunction(()=>!!(window as any).buildingIconReview?.field);
    const commands=page.locator('#rts-commands'),button=(label:string)=>commands.locator(`button[data-label="${label}"]`);
    const point=async(key:string)=>page!.evaluate(k=>{const a=(window as any).buildingIconReview,e=a[k],f=a.field,r=f.canvas.getBoundingClientRect();
      for(const y of [.8,1.4,2.2,.1])for(const dx of [0,-.5,.5])for(const dz of [0,-.5,.5]){const p=f.screen({x:e.x+dx,z:e.z+dz},y),client={x:Math.round(p.x+r.left),y:Math.round(p.y+r.top)};
        if([[0,0],[-1,0],[1,0],[0,-1],[0,1]].every(([x,z])=>f.pick(client.x+x,client.y+z)?.entityId===e.id))return client;}throw new Error('No integer mouse target: '+k);},key);
    const select=async(key:string)=>{await page!.setViewportSize({width:1600,height:1000});await page!.waitForTimeout(150);const p=await point(key);await page!.mouse.click(p.x,p.y);};
    const captures:string[]=[];
    const capture=async(file:string)=>{
      if(name==='webkit'){const png=await page!.evaluate(()=>new Promise<string>(resolve=>{(window as any).buildingIconReview.snapshot=resolve;}));await writeFile(`${output}/${name}-${file}-native.png`,Buffer.from(png.split(',')[1],'base64'));}
      await page!.screenshot({path:`${output}/${name}-${file}.png`});captures.push(`${name}-${file}.png`);
    };
    phase='worker-layout';await select('worker');await expect(commands.locator('img')).toHaveCount(13);const views=[];
    for(const width of [1600,1280,900]){
      phase=`worker-layout-${width}`;
      await page.setViewportSize({width,height:1000});await page.waitForTimeout(300);
      await page.waitForFunction(()=>Array.from(document.querySelectorAll<HTMLImageElement>('#rts-commands img')).every(i=>i.complete&&i.naturalWidth===128));
      await commands.evaluate(e=>{e.parentElement!.scrollTop=0;});
      const layout=await commands.evaluate(element=>Array.from(element.querySelectorAll('button')).map(button=>{const image=button.querySelector('img')!,copy=button.querySelector('.rts-command-copy')!,b=button.getBoundingClientRect(),i=image.getBoundingClientRect(),t=copy.getBoundingClientRect(),panel=element.parentElement!.getBoundingClientRect();
        return {label:button.dataset.label,disabled:button.disabled,src:image.getAttribute('src'),within:i.left>=b.left&&i.right<=b.right&&i.top>=b.top&&i.bottom<=b.bottom,visibleInPanel:b.top>=panel.top&&b.bottom<=panel.bottom,nonoverlap:t.right<=i.left,overflow:button.scrollWidth>button.clientWidth,iconWidth:i.width};}));
      await writeFile(`${output}/${name}-layout-${width}.json`,JSON.stringify(layout,null,2));
      for(const item of layout){expect(item.within,item.label).toBe(true);expect(item.visibleInPanel,item.label).toBe(true);expect(item.nonoverlap,item.label).toBe(true);expect(item.overflow,item.label).toBe(false);expect(item.disabled,item.label).toBe(false);expect(item.iconWidth).toBeGreaterThanOrEqual(32);}
      for(const [kind,definition] of Object.entries(BUILDINGS)){
        phase=`build-mode-${width}-${kind}`;await button(definition.name).locator('img').click();await expect(page.locator('#rts-canvas')).toBeFocused();await expect(page.locator('#rts-mode')).toContainText(`放置${definition.name}`);
        if(width===900&&kind==='house'){
          await capture('build-mode-900');
          const overlap=await page.evaluate(()=>{const mode=document.querySelector('#rts-mode')!.getBoundingClientRect(),panel=document.querySelector('.rts-command-panel')!.getBoundingClientRect();return Math.max(0,Math.min(mode.right,panel.right)-Math.max(mode.left,panel.left))*Math.max(0,Math.min(mode.bottom,panel.bottom)-Math.max(mode.top,panel.top));});
          await writeFile(`${output}/${name}-mode-overlap.json`,JSON.stringify({width,overlapPixels:overlap}));expect(overlap,'build hint must not cover command buttons').toBe(0);
        }
        await page.keyboard.press('Escape');await expect(page.locator('#rts-mode')).toBeHidden();
      }
      await commands.evaluate(e=>{e.parentElement!.scrollTop=0;});await capture(`worker-${width}`);
      await commands.screenshot({path:`${output}/${name}-worker-${width}-commands.png`});views.push({width,layout});
    }
    phase='blocked-commands';await page.evaluate(()=>{const a=(window as any).buildingIconReview;a.state.teams[0].gold=0;a.state.teams[0].wood=0;});
    for(const definition of Object.values(BUILDINGS)){await expect(button(definition.name)).toBeDisabled();await button(definition.name).locator('img').evaluate(i=>(i as HTMLElement).click());await expect(page.locator('#rts-mode')).toBeHidden();}
    await capture('worker-disabled');
    await page.evaluate(()=>{const a=(window as any).buildingIconReview;a.state.teams[0].gold=10000;a.state.teams[0].wood=10000;a.main.tier=1;a.state.tick++;});
    await expect(button(BUILDINGS.workshop.name)).toBeDisabled();await button(BUILDINGS.workshop.name).locator('img').evaluate(i=>(i as HTMLElement).click());await expect(page.locator('#rts-mode')).toBeHidden();
    await page.evaluate(()=>{const a=(window as any).buildingIconReview;a.main.tier=3;a.state.tick++;});
    phase='paid-house-placement';await select('worker');await button(BUILDINGS.house.name).locator('img').click();
    const place=await page.evaluate(()=>{const f=(window as any).buildingIconReview.field,r=f.canvas.getBoundingClientRect(),p=f.screen({x:17,z:38});return {x:p.x+r.left,y:p.y+r.top};});
    await page.mouse.move(place.x,place.y);await page.waitForFunction(()=>(window as any).buildingIconReview.field.placement?.valid);
    await page.mouse.click(place.x,place.y);await page.waitForFunction(()=>{const a=(window as any).buildingIconReview;a.placed=a.state.entities.find((e:any)=>e.alive&&e.team===0&&e.kind==='house');return !!a.placed;});
    expect(await page.evaluate(()=>(window as any).buildingIconReview.state.teams[0].gold)).toBe(9920);await expect(page.locator('#rts-mode')).toBeHidden();
    await select('placed');await button('取消施工').click();await page.waitForFunction(()=>(window as any).buildingIconReview.placed.removalReason==='cancelled');
    phase='hall-upgrades';await select('hall');const upgradeResults=[];
    for(const tier of [2,3] as const){
      const upgrade=button(`升級${TIER_UPGRADES[tier].name}`);await expect(upgrade).toBeEnabled();await expect(upgrade.locator('img')).toHaveAttribute('src',`/assets/games/rts/ui/commands/building-townhall-tier${tier}.webp`);
      await capture(`hall-tier${tier}-before`);const gold=await page.evaluate(()=>(window as any).buildingIconReview.state.teams[0].gold);
      await upgrade.locator('img').click();await page.waitForFunction(t=>(window as any).buildingIconReview.hall.queue.some((q:any)=>q.type==='upgrade'&&q.target===t),tier);
      expect(await page.evaluate(()=>(window as any).buildingIconReview.state.teams[0].gold)).toBe(gold-TIER_UPGRADES[tier].cost.gold);
      await capture(`hall-tier${tier}-queue`);
      await page.evaluate(seconds=>{const a=(window as any).buildingIconReview;for(let i=0;i<seconds*20+2;i++)a.stepGame(a.state);},TIER_UPGRADES[tier].duration);
      await page.waitForFunction(t=>(window as any).buildingIconReview.hall.tier===t,tier);
      expect(await page.evaluate(()=>(window as any).buildingIconReview.main.tier)).toBe(3);
      expect(await page.evaluate(()=>{const a=(window as any).buildingIconReview;return a.field.selection.length===1&&a.field.selection.includes(a.hall.id);})).toBe(true);
      upgradeResults.push({tier,cost:TIER_UPGRADES[tier].cost,selectedSecondaryHallStayedSelected:true});
    }
    await expect(commands.locator('button[data-label^="升級"]')).toHaveCount(0);await capture('hall-tier3-complete');
    phase='asset-check';for(const asset of assets){const url=`/assets/games/rts/ui/commands/building-${asset.id}.webp`;const bytes=candidate?await page.evaluate(async path=>Array.from(new Uint8Array(await(await fetch(path)).arrayBuffer())),url):Array.from(await(await page.request.get(new URL(url,page.url()).href)).body());expect(Buffer.from(bytes).equals(asset.bytes),asset.id).toBe(true);}
    expect(errors).toEqual([]);results.push({browser:name,views,captures,upgradeResults,errors,actions:['30 real build-icon mode clicks and Escape','10 zero-resource child-clicks suppressed','tier-gated child-click suppressed','paid house placement and cancel','secondary hall paid upgrades1-to2-to3 without reselect'],screenshotAdapter:name==='webkit'?'QA-only native full-frame capture after world and portrait; headless resize screenshot limitation':'none'});
    await writeFile(`${output}/report.json`,JSON.stringify({status:results.length===engines.length?'passed':'partial',candidateRouteOverride:candidate,fixture:'funded UI with accelerated upgrade ticks; not natural campaign',sourceHashes,assets:assets.map(({id,bytes,sha256})=>({id,bytes:bytes.length,sha256})),results},null,2)+'\n');
  }catch(error){await page?.screenshot({path:`${output}/${name}-failure.png`}).catch(()=>{});await writeFile(`${output}/${name}-failure.json`,JSON.stringify({phase,errors,error:String(error),stack:error instanceof Error?error.stack:undefined},null,2));throw error;}
  finally{await browser.close();}
}
console.log(JSON.stringify({status:'passed',browsers:results.length,assets:assets.length,candidateRouteOverride:candidate}));
