import {test,expect} from '@playwright/test';
import {initialScreen} from './rts-candidate-fixture';

/** Funded technology-controls fixture with accelerated real simulation ticks.
 * Natural wall-clock campaigns and render performance are verified separately. */
test('formal art: paid tier upgrades unlock all production and successive research',async({page})=>{
  test.setTimeout(180000);await page.setViewportSize({width:1600,height:1000});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.clock.install({time:new Date('2026-10-04T12:00:00Z')});await page.goto('/games/rts');
  await page.evaluate(async()=>{
    const mainPath='/src/scripts/games/rts/main.ts',statePath='/src/scripts/games/rts/state.ts',simulationPath='/src/scripts/games/rts/simulation.ts',visibilityPath='/src/scripts/games/rts/visibility.ts';
    const {mountRts}=await import(mainPath),{addBuilding}=await import(statePath),{createGame}=await import(simulationPath),{updateVisibility}=await import(visibilityPath);
    const old=document.getElementById('rts')!,root=old.cloneNode(true) as HTMLElement;old.replaceWith(root);
    mountRts(root,(map:'river'|'pass',seed:number)=>{
      const state=createGame(map,seed);state.aiEnabled=[false,false];state.teams[0].gold=5000;state.teams[0].wood=5000;
      for(const [kind,x,z] of [['barracks',24,128],['forge',35,130],['chapel',45,140],['stable',45,154],['workshop',31,166],['altar',15,158],['lumbermill',15,141],['house',15,125],['house',15,132],['house',45,131]] as const)addBuilding(state,0,kind,{x,z},true);
      updateVisibility(state);(window as any).__rtsTechFixture=state;return state;
    });
  });
  await page.locator('#rts-start').click();await expect(page.locator('#rts-battle')).toBeVisible({timeout:30000});await page.clock.pauseAt(new Date('2026-10-04T13:00:00Z'));
  const advance=async(seconds:number)=>{
    if(seconds>=1){
      // Hundreds of fastForward protocol calls each forced a full WebGL frame;
      // WebKit spent almost the entire test timeout on these idle queue waits.
      // Run the real economy/combat tick, never assign queue completion or tier.
      const ticks=await page.evaluate(async duration=>{
        const simulationPath='/src/scripts/games/rts/simulation.ts';
        const {stepGame}=await import(simulationPath),state=(window as any).__rtsTechFixture;
        const before=state.tick;for(let i=0;i<duration*20;i++)stepGame(state);
        return state.tick-before;
      },seconds);
      expect(ticks).toBe(seconds*20);
    }
    await page.clock.fastForward(250); // Flush the actual render/HUD after the state changes.
  };
  const select=async(x:number,z:number)=>{
    const mini=await page.locator('#rts-minimap').boundingBox();if(!mini)throw new Error('Missing minimap');
    await page.mouse.click(mini.x+x/288*mini.width,mini.y+z/288*mini.height);await advance(.25);
    const center=initialScreen(24,144,2);await page.mouse.click(center.x,center.y);await advance(.25);
    console.log('TECH_SELECT',x,z,await page.locator('#rts-selection h2').textContent());
  };
  const command=(name:string)=>page.locator('#rts-commands').getByRole('button',{name:new RegExp('^'+name)});
  await select(45,140);await expect(command('牧師')).toBeDisabled();await expect(command('牧師')).toContainText('主城 II 階');
  await select(24,144);await command('升級城堡').click();await advance(.25);await expect(page.locator('#rts-gold')).toHaveText('4,720');await advance(36);
  await expect(page.locator('#rts-selection')).toContainText('主城第 2 階');await command('升級王城').click();await advance(46);
  await expect(page.locator('#rts-selection')).toContainText('主城第 3 階');await expect(page.locator('#rts-gold')).toHaveText('4,300');
  for(const [unit,x,z] of [['工人',24,144],['王國衛兵',24,128],['弩手',24,128],['牧師',45,140],['騎士',45,154],['攻城車',31,166],['誓衛統領',15,158]] as const){await select(x,z);await expect(command(unit)).toBeEnabled();await command(unit).click();await advance(.25);}
  await advance(24);
  const trained=await page.evaluate(()=>(window as any).__rtsTechFixture.entities.filter((e:any)=>e.alive&&e.team===0&&e.category==='unit').map((e:any)=>e.kind));
  for(const kind of ['worker','guard','crossbow','priest','knight','siege','commander'])expect(trained).toContain(kind);
  await select(35,130);await expect(command('精鍛兵刃 III')).toBeDisabled();
  for(const [name,seconds] of [['精鍛兵刃 I',21],['精鍛兵刃 II',25],['精鍛兵刃 III',29]] as const){await page.locator(`#rts-commands button[data-label="${name}"]`).click();await advance(seconds);}
  expect(await page.evaluate(()=>(window as any).__rtsTechFixture.teams[0].research)).toEqual(expect.arrayContaining(['weapons1','weapons2','weapons3']));
  expect(await page.evaluate(()=>(window as any).__rtsTechFixture.teams[0].stats.unitsTrained)).toBe(7);
  await page.screenshot({path:test.info().outputPath('tech-production.png')});expect(errors).toEqual([]);
});
