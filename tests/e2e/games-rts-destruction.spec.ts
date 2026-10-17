import {test,expect,type Page} from '@playwright/test';

/** Generic building collapse + rubble, driven through the dev-only
 * window.__rtsDebug hook (never shipped in production bundles). */
type Hook={spawnBuilding(kind:string,x:number,z:number,o?:{team?:number;tier?:number}):number;destroy(id:number):boolean;focus(x:number,z:number):void;time():number;rubbleCount():number;setPaused(p:boolean):void;advance(s:number):number};
declare global {interface Window {__rtsDebug?:Hook}}
const KINDS:Array<[string,number?]>=[['townhall'],['townhall',2],['townhall',3],['house'],['barracks'],['lumbermill'],['forge'],['altar'],['tower'],['chapel'],['stable'],['workshop']];
const SLOTS=[[24,26],[33,26],[42,26],[24,36],[33,36],[42,36],[24,46],[33,46],[42,46],[24,58],[33,58],[42,58]];

async function startBattle(page:Page){
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/games/rts');await page.getByRole('button',{name:'開始戰役'}).click();
  await expect(page.locator('#rts-battle')).toBeVisible({timeout:60000});
  await expect.poll(()=>page.evaluate(()=>typeof window.__rtsDebug)).toBe('object');
  return errors;
}
const frames=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));

test.describe('generic building destruction',()=>{
  test.use({viewport:{width:1600,height:1000}});
  test('collapse frame sequence at the game camera with the published FX atlas',async({page},info)=>{
    test.setTimeout(120000);
    const atlas=page.waitForResponse(r=>r.url().endsWith('/assets/games/rts/effects/building-effects-atlas.png')&&r.ok());
    const errors=await startBattle(page),folder=info.outputPath('building-collapse'),canvas=page.locator('#rts-canvas');await atlas;
    const id=await page.evaluate(()=>{const d=window.__rtsDebug!;d.setPaused(true);d.focus(33,36);return d.spawnBuilding('barracks',33,36);});
    const box=(await canvas.boundingBox())!,clip={x:box.x+box.width/2-330,y:box.y+box.height/2-230,width:660,height:400};
    const shoot=async(name:string)=>{await page.evaluate(frames);await page.screenshot({path:`${folder}/${name}.png`,clip});};
    await page.evaluate(()=>window.__rtsDebug!.advance(.1));await shoot('frame-00-intact');
    await page.evaluate(id=>window.__rtsDebug!.destroy(id),id);const death=await page.evaluate(()=>window.__rtsDebug!.time());
    let age=0;
    for(const [i,target] of [.3,.7,1.1,1.5,1.9,2.3,2.8,3.4].entries()){
      const time=await page.evaluate(step=>window.__rtsDebug!.advance(step),target-age);age=target;expect(time-death).toBeCloseTo(target,5);
      await shoot(`frame-${String(i+1).padStart(2,'0')}-age-${target.toFixed(1)}`);
    }
    expect(await page.evaluate(()=>window.__rtsDebug!.rubbleCount())).toBe(1);
    await page.evaluate(()=>window.__rtsDebug!.advance(30));await shoot('frame-09-age-33.4');
    await page.evaluate(()=>window.__rtsDebug!.advance(10));await shoot('frame-10-age-43.4-sinking');
    await page.evaluate(()=>window.__rtsDebug!.advance(2));await expect.poll(()=>page.evaluate(()=>window.__rtsDebug!.rubbleCount())).toBe(0);
    await shoot('frame-11-age-45.4-cleared');
    expect(errors).toEqual([]);
  });
  test('all twelve building models collapse into footprint-scaled rubble that respects pause and restart',async({page},info)=>{
    test.setTimeout(120000);
    const errors=await startBattle(page),folder=info.outputPath('building-collapse');
    const ids=await page.evaluate(({kinds,slots})=>{const d=window.__rtsDebug!;d.setPaused(true);return kinds.map(([kind,tier],i)=>d.spawnBuilding(kind as never,slots[i][0],slots[i][1],tier?{tier}:{}));},{kinds:KINDS,slots:SLOTS});
    expect(ids).toHaveLength(12);
    await page.evaluate(()=>{const d=window.__rtsDebug!;d.focus(33,42);d.advance(.1);d.setPaused(false);});
    // The in-game pause menu freezes the collapse clock.
    await page.evaluate(id=>window.__rtsDebug!.destroy(id),ids[3]);
    await page.locator('#rts-pause').click();await expect(page.locator('#rts-menu')).toBeVisible();
    const pausedAt=await page.evaluate(()=>window.__rtsDebug!.time());await page.waitForTimeout(1200);
    expect(await page.evaluate(()=>window.__rtsDebug!.time())).toBe(pausedAt);
    await page.locator('#rts-resume').click();
    await page.evaluate(list=>{const d=window.__rtsDebug!;d.setPaused(true);list.forEach(id=>d.destroy(id));d.advance(1.2);},ids);
    await page.evaluate(frames);await page.locator('#rts-canvas').screenshot({path:`${folder}/all-collapsing.png`});
    await page.evaluate(()=>window.__rtsDebug!.advance(2.4));await page.evaluate(frames);
    await expect.poll(()=>page.evaluate(()=>window.__rtsDebug!.rubbleCount())).toBe(12);
    await page.locator('#rts-canvas').screenshot({path:`${folder}/all-rubble.png`});
    // Restart disposes the old battlefield, including every rubble prop.
    await page.evaluate(()=>window.__rtsDebug!.setPaused(false));
    await page.locator('#rts-pause').click();await page.locator('#rts-restart').click();await page.locator('#rts-confirm-yes').click();
    await expect(page.locator('#rts-battle')).toBeVisible({timeout:60000});
    await expect.poll(()=>page.evaluate(()=>window.__rtsDebug!.rubbleCount())).toBe(0);
    expect(errors).toEqual([]);
  });
});
