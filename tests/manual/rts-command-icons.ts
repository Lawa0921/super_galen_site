import {chromium,firefox,webkit,expect} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const output=process.env.RTS_ICON_REVIEW_OUT??'art-factory/rts/runs/commercial-readiness/2026-10-09/qa/command-icons-regression';
await mkdir(output,{recursive:true});
const results=[];
for(const [name,engine] of Object.entries({chromium,firefox,webkit})){
  const browser=await engine.launch(name==='chromium'?{channel:'chromium',headless:true,args:['--enable-gpu','--force_high_performance_gpu']}:{headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors:string[]=[],responses:any[]=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',response=>{if(response.url().includes('/ui/commands/'))responses.push({url:response.url(),status:response.status()});});
    await page.goto(`${process.env.RTS_BASE_URL??'http://127.0.0.1:4344'}/games/rts`);await page.waitForLoadState('networkidle');
    await page.addScriptTag({type:'module',content:`
      const source=await(await fetch('/src/scripts/games/rts/main.ts')).text();
      const path=source.match(new RegExp('from "([^"]*scene[.]ts[^"]*)"'))[1];
      const {Battlefield}=await import(path),render=Battlefield.prototype.render;
      Battlefield.prototype.render=function(view,dt,alpha){window.iconReview={field:this,view};return render.call(this,view,dt,alpha);};
    `});
    await page.locator('#rts-start').click();await expect(page.locator('#rts-battle')).toBeVisible({timeout:60000});
    await page.waitForFunction(()=>!!(window as any).iconReview?.view);
    const worker=await page.evaluate(()=>{const {field,view}=(window as any).iconReview,w=view.entities.find((e:any)=>e.team===0&&e.kind==='worker');return {id:w.id,...field.screen(w,1)};});
    await page.mouse.click(worker.x,worker.y);await expect(page.locator('#rts-selection h2')).toHaveText('工人');
    const commands=page.locator('#rts-commands');await expect(commands.locator('img')).toHaveCount(13);
    await commands.getByRole('button',{name:/^攻擊移動/}).locator('img').click();await expect(page.locator('#rts-mode')).toContainText('攻擊移動');await expect(page.locator('#rts-canvas')).toBeFocused();await page.keyboard.press('Escape');await expect(page.locator('#rts-mode')).toBeHidden();
    await commands.getByRole('button',{name:/^攻擊移動/}).click();await expect(page.locator('#rts-mode')).toBeVisible();
    await commands.getByRole('button',{name:/^守備/}).locator('img').click();
    await page.waitForFunction(id=>(window as any).iconReview.view.entities.find((e:any)=>e.id===id)?.order.type==='hold',worker.id);
    await expect(page.locator('#rts-mode')).toBeHidden();
    await commands.getByRole('button',{name:/^攻擊移動/}).click();await expect(page.locator('#rts-mode')).toBeVisible();
    await commands.getByRole('button',{name:/^停止/}).locator('img').click();
    await page.waitForFunction(id=>(window as any).iconReview.view.entities.find((e:any)=>e.id===id)?.order.type==='idle',worker.id);
    await expect(page.locator('#rts-mode')).toBeHidden();
    const views=[];
    for(const width of [1600,1280,900]){
      await page.setViewportSize({width,height:1000});await page.waitForTimeout(500);
      await page.waitForFunction(()=>Array.from(document.querySelectorAll<HTMLImageElement>('#rts-commands img')).every(i=>i.complete&&i.naturalWidth===128));
      const layout=await commands.evaluate(element=>Array.from(element.querySelectorAll('button.rts-command-art')).map(button=>{
        const image=button.querySelector('img')!,copy=button.querySelector('.rts-command-copy')!,b=button.getBoundingClientRect(),i=image.getBoundingClientRect(),t=copy.getBoundingClientRect();
        return {label:(button as HTMLElement).dataset.label,width:b.width,height:b.height,iconWidth:i.width,within:i.left>=b.left&&i.right<=b.right&&i.top>=b.top&&i.bottom<=b.bottom,nonoverlap:t.right<=i.left,overflow:button.scrollWidth>button.clientWidth};
      }));
      expect(layout).toHaveLength(13);for(const item of layout){expect(item.within).toBe(true);expect(item.nonoverlap).toBe(true);expect(item.overflow).toBe(false);expect(item.iconWidth).toBeGreaterThanOrEqual(32);}
      await page.screenshot({path:`${output}/${name}-${width}.png`});await commands.screenshot({path:`${output}/${name}-${width}-commands.png`});views.push({width,layout});
    }
    const assets=[];
    for(const id of ['attack-move','stop','hold']){
      const url=`/assets/games/rts/ui/commands/${id}.png`,response=await page.request.get(new URL(url,page.url()).href);expect(response.status()).toBe(200);
      const bytes=await response.body(),local=await readFile(`public${url}`);expect(bytes.equals(local)).toBe(true);
      assets.push({id,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
    }
    expect(errors).toEqual([]);expect(new Set(responses.map(r=>new URL(r.url).pathname)).size).toBe(13);expect(responses.every(r=>r.status===200)).toBe(true);
    results.push({browser:name,views,assets,errors,requests:responses,actions:['attack mode via icon','Escape cancellation','hold via icon','stop via icon']});
    await writeFile(`${output}/report.json`,JSON.stringify({status:results.length===3?'passed':'partial',results},null,2)+'\n');
  }finally{await browser.close();}
}
console.log(JSON.stringify({browsers:results.length,status:'passed',screenshots:18}));
