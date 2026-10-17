// Funded, isolated UI fixture: not evidence of natural campaign progression.
import {chromium,firefox,webkit,expect} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const output=process.env.RTS_ICON_REVIEW_OUT??'art-factory/rts/runs/technology-skill-icons/2026-10-09-v1/qa/browser';
await mkdir(output,{recursive:true});const results=[];
const engines=Object.entries({chromium,firefox,webkit}).filter(([name])=>!process.env.RTS_BROWSER||process.env.RTS_BROWSER===name);
for(const [name,engine] of engines){
  const browser=await engine.launch(name==='chromium'?{channel:'chromium',headless:true,args:['--enable-gpu','--force_high_performance_gpu']}:{headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors:string[]=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(`${process.env.RTS_BASE_URL??'http://127.0.0.1:4344'}/games/rts`);await page.waitForLoadState('networkidle');
    await page.addScriptTag({type:'module',content:`
      const mainPath='/src/scripts/games/rts/main.ts',source=await(await fetch(mainPath)).text();
      const scenePath=source.match(new RegExp('from "([^"]*scene[.]ts[^"]*)"'))[1];
      const {Battlefield}=await import(scenePath),{mountRts}=await import(mainPath),{createGame}=await import('/src/scripts/games/rts/simulation.ts');
      const {addUnit,addBuilding}=await import('/src/scripts/games/rts/state.ts'),{updateVisibility}=await import('/src/scripts/games/rts/visibility.ts');
      const a={};window.technologyIconReview=a;const render=Battlefield.prototype.render;
      Battlefield.prototype.render=function(view,dt,alpha){
        a.field=this;a.view=view;const result=render.call(this,view,dt,alpha);
        // QA only: Windows headless WebKit can retain a stale canvas snapshot
        // after resize. Read once after BOTH world and portrait passes, only
        // when a screenshot requests it; never alter the production renderer.
        if(a.snapshotResolve){const resolve=a.snapshotResolve;a.snapshotResolve=null;
          resolve({png:this.canvas.toDataURL(),time:view.time,selection:[...this.selection],portraitKind:document.getElementById('rts-portrait-view')?.dataset.kind??null});}
        return result;
      };
      const old=document.getElementById('rts'),root=old.cloneNode(true);old.replaceWith(root);
      mountRts(root,(...args)=>{const state=createGame(...args);state.aiEnabled=[false,false];state.entities=[];state.resources=[];
        state.teams[0].gold=5000;state.teams[0].wood=5000;Object.assign(state.teams[0].hero,{level:3,points:3,skills:{cleave:1,mend:1,banner:1}});
        addBuilding(state,1,'townhall',{x:82,z:48},true);
        a.hall=addBuilding(state,0,'townhall',{x:14,z:48},true);a.forge=addBuilding(state,0,'forge',{x:22,z:36},true);a.mill=addBuilding(state,0,'lumbermill',{x:34,z:36},true);
        a.hero=addUnit(state,0,'commander',{x:22,z:46});a.ally=addUnit(state,0,'guard',{x:26,z:47});a.ally.hp=100;
        a.state=state;updateVisibility(state);return state;});
    `});
    await page.locator('#rts-start').click();await expect(page.locator('#rts-battle')).toBeVisible({timeout:60000});
    await page.waitForFunction(()=>!!(window as any).technologyIconReview?.field);
    expect(await page.evaluate(()=>(window as any).technologyIconReview.state.status)).toBe('playing');
    const commands=page.locator('#rts-commands'),button=(label:string)=>commands.locator(`button[data-label="${label}"]`);
    const snapshots:Array<{file:string;nativeFrame:string;sha256:string;time:number;selection:number[];portraitKind:string|null}>=[];
    const screenshot=async(file:string)=>{
      if(name==='webkit'){
        const frame=await page.evaluate(()=>new Promise<{png:string;time:number;selection:number[];portraitKind:string|null}>(resolve=>{(window as any).technologyIconReview.snapshotResolve=resolve;}));
        const nativeFrame=file.replace(/\.png$/,'-native-frame.png'),bytes=Buffer.from(frame.png.split(',')[1],'base64');
        await writeFile(`${output}/${nativeFrame}`,bytes);
        snapshots.push({file,nativeFrame,sha256:createHash('sha256').update(bytes).digest('hex'),time:frame.time,selection:frame.selection,portraitKind:frame.portraitKind});
      }
      await page.screenshot({path:`${output}/${file}`});
    };
    const point=async(key:string)=>page.evaluate(k=>{const a=(window as any).technologyIconReview,f=a.field,e=a[k],r=f.canvas.getBoundingClientRect();for(const y of [1,1.5,.5,2,.1])for(const dz of [0,-.3,.3])for(const dx of [0,-.3,.3]){const p=f.screen({x:e.x+dx,z:e.z+dz},y),client={x:Math.round(p.x+r.left),y:Math.round(p.y+r.top)};if([[0,0],[-1,0],[1,0],[0,-1],[0,1]].every(([ox,oy])=>f.pick(client.x+ox,client.y+oy)?.entityId===e.id))return client;}throw new Error('No robust integer mouse target for '+k);},key);
    const select=async(key:string)=>{await page.setViewportSize({width:1600,height:1000});await page.waitForTimeout(100);const p=await point(key);await page.mouse.click(p.x,p.y);};
    const views=[];
    for(const [key,count] of [['hero',9],['forge',6],['mill',1]] as const){
      await select(key);await expect(commands.locator('img')).toHaveCount(count);
      for(const width of [1600,1280,900]){
        await page.setViewportSize({width,height:1000});await page.waitForTimeout(300);
        await page.waitForFunction(()=>Array.from(document.querySelectorAll<HTMLImageElement>('#rts-commands img')).every(i=>i.complete&&i.naturalWidth===128));
        const layout=await commands.evaluate(element=>Array.from(element.querySelectorAll('button.rts-command-art')).map(button=>{
          const image=button.querySelector('img')!,copy=button.querySelector('.rts-command-copy')!,b=button.getBoundingClientRect(),i=image.getBoundingClientRect(),t=copy.getBoundingClientRect();
          return {label:(button as HTMLElement).dataset.label,disabled:(button as HTMLButtonElement).disabled,icon:image.getAttribute('src'),within:i.left>=b.left&&i.right<=b.right&&i.top>=b.top&&i.bottom<=b.bottom,nonoverlap:t.right<=i.left,overflow:button.scrollWidth>button.clientWidth,iconWidth:i.width};
        }));
        for(const item of layout){expect(item.within).toBe(true);expect(item.nonoverlap).toBe(true);expect(item.overflow).toBe(false);expect(item.iconWidth).toBeGreaterThanOrEqual(32);}
        await screenshot(`${name}-${key}-${width}.png`);await commands.screenshot({path:`${output}/${name}-${key}-${width}-commands.png`});views.push({selection:key,width,layout});
      }
    }
    await select('forge');await expect(button('精鍛兵刃 II')).toBeDisabled();
    await button('精鍛兵刃 II').locator('img').evaluate(i=>(i as HTMLElement).click());
    expect(await page.evaluate(()=>(window as any).technologyIconReview.forge.queue.length)).toBe(0);
    await button('精鍛兵刃 I').locator('img').click();await page.waitForFunction(()=>(window as any).technologyIconReview.forge.queue.some((q:any)=>q.target==='weapons1'));
    await select('mill');await button('精工斧具').locator('img').click();await page.waitForFunction(()=>(window as any).technologyIconReview.mill.queue.some((q:any)=>q.target==='timber'));
    await select('hero');await button('學習破陣斬').locator('img').click();
    await page.waitForFunction(()=>(window as any).technologyIconReview.state.teams[0].hero.skills.cleave===2);
    await button('破陣斬').locator('img').click();await expect(page.locator('#rts-canvas')).toBeFocused();await expect(page.locator('#rts-mode')).toContainText('破陣斬');await page.keyboard.press('Escape');await expect(page.locator('#rts-mode')).toBeHidden();
    await button('戰地救援').locator('img').click();
    const ally=await point('ally');await page.mouse.click(ally.x,ally.y);
    await page.waitForTimeout(300);
    console.log(JSON.stringify({browser:name,phase:'mend-click',point:ally,errors,...await page.evaluate(()=>{const a=(window as any).technologyIconReview;return {mode:document.querySelector('#rts-mode')?.textContent,modeHidden:(document.querySelector('#rts-mode') as HTMLElement).hidden,notice:document.querySelector('#rts-notice')?.textContent,heroMana:a.hero.mana,cooldown:a.hero.skillCooldowns.mend,allyHp:a.ally.hp,status:a.state.status,paused:a.state.paused,contextLost:a.field.renderer.getContext().isContextLost(),render:a.field.renderer.info.render};})}));
    await screenshot(`${name}-mend-click.png`);
    await page.waitForFunction(()=>(window as any).technologyIconReview.hero.skillCooldowns.mend>0);await expect(page.locator('#rts-mode')).toBeHidden();
    await button('王旗').locator('img').click();const hero=await point('hero');await page.mouse.click(hero.x,hero.y);
    await page.waitForFunction(()=>(window as any).technologyIconReview.hero.skillCooldowns.banner>0);
    await page.evaluate(()=>{(window as any).technologyIconReview.hero.mana=0;});await expect(button('破陣斬')).toBeDisabled();
    await button('破陣斬').locator('img').evaluate(i=>(i as HTMLElement).click());await expect(page.locator('#rts-mode')).toBeHidden();
    const assets=[];for(const id of ['timber','weapons','armor','cleave','mend','banner']){const url=`/assets/games/rts/ui/commands/${id}.png`,response=await page.request.get(new URL(url,page.url()).href);expect(response.status()).toBe(200);const bytes=await response.body();expect(bytes.equals(await readFile(`public${url}`))).toBe(true);assets.push({id,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
    expect(errors).toEqual([]);results.push({browser:name,views,assets,errors,screenshotAdapter:name==='webkit'?'QA-only full-frame native canvas readback before each page screenshot; Windows headless resize snapshot limitation':'none',snapshots,actions:['disabled research icon suppressed','paid research queued','skill learned','cast mode and Escape','mend healed ally','banner cast','zero-mana icon suppressed']});
    await writeFile(`${output}/report${process.env.RTS_BROWSER?'-'+process.env.RTS_BROWSER:''}.json`,JSON.stringify({status:results.length===engines.length?'passed':'partial',fixture:'funded UI; not natural campaign',results},null,2)+'\n');
  }finally{await browser.close();}
}
console.log(JSON.stringify({status:'passed',browsers:results.length,pageAndCommandScreenshots:results.length*19,nativeFrameEvidence:results.reduce((n,r)=>n+r.snapshots.length,0)}));
