/** Normal opening resources and mouse orders; clock advances only wall time. No state injection. */
import {chromium,firefox,webkit,expect} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const folder='art-factory/rts/runs/building-stages-lumbermill/2026-10-09-v3/qa/natural-construction';
await mkdir(folder,{recursive:true});const results=[];
for(const [browserName,engine] of Object.entries({chromium,firefox,webkit})){
  const browser=await engine.launch(browserName==='chromium'?{channel:'chromium',headless:true,args:['--enable-gpu','--force_high_performance_gpu']}:{headless:true});
  try{for(const map of ['river','pass']){
    const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.clock.install({time:new Date('2026-10-09T12:00:00Z')});await page.goto('http://127.0.0.1:4344/games/rts');await page.waitForLoadState('networkidle');
    await page.addScriptTag({type:'module',content:`
      const source=await(await fetch('/src/scripts/games/rts/main.ts')).text(),path=source.match(new RegExp('from "([^"]*scene[.]ts[^"]*)"'))[1];
      const {Battlefield}=await import(path),render=Battlefield.prototype.render;
      Battlefield.prototype.render=function(view,dt,alpha){window.naturalConstruction={field:this,view};return render.call(this,view,dt,alpha);};
    `});
    await page.locator(`input[value="${map}"]`).check();await page.locator('#rts-start').click();await expect(page.locator('#rts-battle')).toBeVisible({timeout:60000});await page.clock.pauseAt(new Date('2026-10-09T13:00:00Z'));
    const advance=async()=>page.clock.fastForward(250);
    await advance();
    const worker=await page.evaluate(()=>{const a=(window as any).naturalConstruction,w=a.view.entities.filter((e:any)=>e.team===0&&e.kind==='worker').at(-1);return {id:w.id,point:a.field.screen(w,1)};});
    await page.mouse.click(worker.point.x,worker.point.y);await advance();await expect(page.locator('#rts-selection h2')).toHaveText('工人');
    await page.locator('#rts-commands').getByRole('button',{name:/^伐木場/}).click();await expect(page.locator('#rts-canvas')).toBeFocused();
    const location=await page.evaluate(()=>(window as any).naturalConstruction.field.screen({x:14,z:35},0));
    await page.mouse.move(location.x,location.y);await advance();await page.mouse.click(location.x,location.y);await advance();
    await expect(page.locator('#rts-gold')).toHaveText('400');await expect(page.locator('#rts-wood')).toHaveText('160');await expect(page.locator('#rts-mode')).toBeHidden();
    const samples=[];let previous=-1;
    for(let attempt=0;attempt<160;attempt++){
      const sample=await page.evaluate(()=>{
        const a=(window as any).naturalConstruction,e=a.view.entities.find((e:any)=>e.team===0&&e.kind==='lumbermill');if(!e)return null;
        const instance=a.field.models.get(e.id).instance.root,meshes:any[]=[];instance.traverseVisible((o:any)=>{if(o.isMesh)meshes.push({stage:o.userData.rtsConstructionStage??null,tangent:!!o.geometry.attributes.tangent});});
        return {id:e.id,construction:e.construction,time:a.view.time,gold:a.view.team.gold,wood:a.view.team.wood,groundY:instance.position.y,scale:instance.scale.toArray(),meshes};
      });
      expect(sample).not.toBeNull();const s=sample!;
      const phase=s.construction>=1?4:s.construction>=.82?3:s.construction>=.55?2:s.construction>=.18?1:0;
      expect(s.groundY).toBe(0);expect(s.scale).toEqual([1,1,1]);expect(s.meshes).toHaveLength([2,5,9,14,9][phase]);expect(s.meshes.every(m=>m.tangent)).toBe(true);
      if(phase!==previous){
        expect(phase).toBe(previous+1);previous=phase;await page.screenshot({path:`${folder}/${browserName}-${map}-${phase}.png`});samples.push(s);
      }
      if(phase===4)break;await advance();
    }
    expect(previous).toBe(4);
    const built=await page.evaluate(()=>{const a=(window as any).naturalConstruction,e=a.view.entities.find((e:any)=>e.team===0&&e.kind==='lumbermill');return a.field.screen(e,1);});
    await page.mouse.click(built.x,built.y);await advance();await expect(page.locator('#rts-selection h2')).toHaveText('伐木場');await expect(page.locator('#rts-selection')).toContainText('建築已就緒');await expect(page.locator('#rts-commands').getByRole('button',{name:/^精工斧具/})).toBeEnabled();
    const url='/assets/games/rts/models/lumbermill.glb',response=await page.request.get(new URL(url,page.url()).href),bytes=await response.body(),local=await readFile('public'+url);expect(response.status()).toBe(200);expect(bytes.equals(local)).toBe(true);expect(errors).toEqual([]);
    results.push({browser:browserName,map,samples,paid:{gold:100,wood:40},sha256:createHash('sha256').update(bytes).digest('hex'),errors});
    await writeFile(folder+'/report.json',JSON.stringify({status:results.length===6?'passed':'partial',scope:'Natural opening economy and construction orders on two maps; clock accelerated; no state/resources/outcome injection',results},null,2)+'\n');await page.close();
  }}finally{await browser.close();}
}
console.log(JSON.stringify({status:'passed',browsers:3,maps:2,natural_builds:6}));
