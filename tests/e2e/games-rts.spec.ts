import {test,expect} from '@playwright/test';
import {initialScreen} from './rts-candidate-fixture';
test.use({viewport:{width:1600,height:1000}});
test('the unlisted RTS opens from its direct URL',async({page})=>{
  await page.goto('/games');await expect(page.getByRole('link',{name:/曦境戰紀/})).toHaveCount(0);
  await page.goto('/games/rts');await expect(page.getByRole('heading',{name:'曦境戰紀'})).toBeVisible();
});
test('lobby offers two battlefields and keyboard guidance',async({page})=>{
  await page.goto('/games/rts');await expect(page.getByRole('heading',{name:'曦境戰紀'})).toBeVisible();
  await expect(page.getByRole('radio',{name:/雙河谷地/})).toBeChecked();
  await expect.poll(()=>page.locator('.rts-map-thumb').evaluateAll(images=>images.every(image=>image instanceof HTMLImageElement&&image.complete&&image.naturalWidth===600))).toBe(true);
  await page.getByRole('radio',{name:/灰脊隘口/}).check();await expect(page.getByRole('radio',{name:/灰脊隘口/})).toBeChecked();
  await expect(page.getByText('左鍵選取、拖曳框選，右鍵下令。',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'開始戰役'})).toBeEnabled();
  await page.screenshot({path:test.info().outputPath('lobby.png')});
});
test('lobby difficulty defaults to 普通, persists, and the footer never covers the lobby at 1024x768',async({page})=>{
  await page.setViewportSize({width:1024,height:768});
  await page.goto('/games/rts');await page.evaluate(()=>localStorage.clear());await page.reload();
  await expect(page.getByRole('radio',{name:/普通/})).toBeChecked();
  await page.getByRole('radio',{name:/困難/}).check();await page.reload();await expect(page.getByRole('radio',{name:/困難/})).toBeChecked();
  const overlaps=await page.evaluate(()=>{const f=document.querySelector('.rts-lobby-footer')!.getBoundingClientRect();
    return [...document.querySelectorAll('.rts-intro > *')].filter(el=>{const r=el.getBoundingClientRect();return r.height>0&&r.bottom>f.top&&r.top<f.bottom&&r.right>f.left&&r.left<f.right;}).map(el=>el.className||el.tagName);});
  expect(overlaps).toEqual([]);
  await page.getByRole('button',{name:'開始戰役'}).click({trial:true,timeout:5000});
});
test('lobby and pause menu expose the complete catalog tech tree and match limit',async({page})=>{
  await page.goto('/games/rts');
  expect(await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(el=>el.id);return ids.length-new Set(ids).size;})).toBe(0);
  await expect(page.getByText('30 分鐘上限 · 到時和局')).toBeVisible();
  await page.locator('#rts-lobby').getByText('科技樹').click();
  await expect(page.locator('#rts-lobby')).toContainText('精鍛兵刃 III');
  await expect(page.locator('#rts-lobby')).toContainText('攻城車');
  await expect(page.locator('#rts-lobby')).toContainText('需要王城與鍛造所');
  await page.screenshot({path:test.info().outputPath('tech-tree-lobby.png'),fullPage:true});
  await page.getByRole('button',{name:'開始戰役'}).click();
  await expect(page.locator('#rts-battle')).toBeVisible({timeout:30000});
  await page.locator('#rts-pause').click();
  await page.locator('#rts-menu summary').filter({hasText:'科技樹'}).click();
  await expect(page.locator('#rts-menu')).toContainText('精鍛兵刃 III');
  await page.screenshot({path:test.info().outputPath('tech-tree-pause.png')});
  await expect(page.locator('#rts-volume')).toHaveValue('70');
  await page.locator('#rts-volume').fill('0');
  await expect(page.locator('#rts-volume-value')).toHaveText('靜音');
  await page.locator('#rts-restart').click();await page.locator('#rts-confirm-yes').click();
  await expect(page.locator('#rts-battle')).toBeVisible({timeout:30000});
  await expect.poll(()=>page.evaluate(()=>document.activeElement?.id)).toBe('rts-canvas');
  expect(await page.locator('#rts-canvas').evaluate(canvas=>{const context=(canvas as HTMLCanvasElement).getContext('webgl2')||(canvas as HTMLCanvasElement).getContext('webgl');return !!context&&!context.isContextLost();})).toBe(true);
  const hall=initialScreen(24,144,2);await expect.poll(async()=>{await page.mouse.click(hall.x,hall.y);return page.locator('#rts-selection h2').textContent();}).toBe('領主府');
  await page.locator('#rts-pause').click();
  await expect(page.locator('#rts-volume')).toHaveValue('0');
});
test('shared original materials load once and a missing surface can be retried',async({page})=>{
  // Resolve a surface actually shared by the served models, including lossless
  // content-addressed packages whose filenames differ from the original JPEGs.
  const modelSurfaces=await Promise.all(['townhall','barracks'].map(async id=>{
    const response=await page.request.get(`/assets/games/rts/models/${id}.glb`);
    expect(response.ok()).toBe(true);const bytes=await response.body();
    expect(bytes.readUInt32LE(0)).toBe(0x46546c67);expect(bytes.readUInt32LE(16)).toBe(0x4e4f534a);
    const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
    return (doc.images as {uri?:string}[]).flatMap(image=>image.uri&&!image.uri.startsWith('data:')?[new URL(image.uri,response.url()).href]:[]);
  }));
  const shared=modelSurfaces[0].find(url=>modelSurfaces[1].includes(url));
  expect(shared,'Townhall and barracks must reference a common original surface').toBeDefined();
  let requests=0,unavailable=true;
  await page.route(shared!,route=>{
    requests++;return unavailable?route.fulfill({status:503,body:'Unavailable'}):route.continue();
  });
  await page.goto('/games/rts');await page.getByRole('button',{name:'開始戰役'}).click();
  await expect(page.getByText('戰場載入失敗，請重試。',{exact:true})).toBeVisible();
  expect(requests).toBe(1);unavailable=false;
  await page.getByRole('button',{name:'重新載入戰場'}).click();
  await expect(page.locator('#rts-battle')).toBeVisible({timeout:30000});expect(requests).toBe(2);
  await page.locator('#rts-pause').click();await page.locator('#rts-restart').click();await page.locator('#rts-confirm-yes').click();
  await expect(page.locator('#rts-battle')).toBeVisible();expect(requests).toBe(2);
});

test('failed battlefield downloads return to the lobby and can be retried',async({page})=>{
  let requests=0;
  await page.route('**/assets/games/rts/model-registry.json',route=>{requests++;return route.fulfill({status:503,body:'Unavailable'});});
  await page.goto('/games/rts');
  await page.getByRole('button',{name:'開始戰役'}).click();
  await expect(page.getByText('戰場載入失敗，請重試。',{exact:true})).toBeVisible();
  const retry=page.getByRole('button',{name:'重新載入戰場'});await expect(retry).toBeEnabled();
  await retry.click();await expect(retry).toBeEnabled();
  await expect.poll(()=>requests).toBe(2);
  await expect(page.locator('#rts-battle')).toBeHidden();
});

test('unavailable WebGL reports a retryable error and recovers',async({page})=>{
  await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    (window as any).__rtsDisableWebgl=true;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:string,...args:any[]){
      if((window as any).__rtsDisableWebgl&&type.startsWith('webgl'))return null;
      return original.apply(this,[type,...args] as any);
    } as typeof original;
  });
  await page.goto('/games/rts');await page.getByRole('button',{name:'開始戰役'}).click();
  await expect(page.getByText('戰場載入失敗，請重試。',{exact:true})).toBeVisible();
  await expect(page.locator('#rts-battle')).toBeHidden();
  const retry=page.getByRole('button',{name:'重新載入戰場'});await expect(retry).toBeEnabled();
  await page.evaluate(()=>{(window as any).__rtsDisableWebgl=false;});await retry.click();
  await expect(page.locator('#rts-battle')).toBeVisible({timeout:30000});
  await expect(page.locator('#rts-gold')).toHaveText('500');
});

test('formal art integration: renders, trains, pauses, surrenders and returns to maps',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/games/rts');await page.getByRole('button',{name:'開始戰役'}).click();
  await expect(page.locator('#rts-battle')).toBeVisible({timeout:30000});
  await expect(page.locator('#rts-gold')).toHaveText('500');
  const hall=initialScreen(24,144,2);await page.mouse.click(hall.x,hall.y);
  await expect(page.locator('#rts-selection h2')).toHaveText('領主府');
  await page.locator('#rts-commands').getByRole('button',{name:/工人/}).click();
  await expect(page.locator('#rts-gold')).toHaveText('450');
  await expect(page.locator('#rts-supply')).toHaveText('5 + 1 / 10');
  await page.locator('#rts-pause').click();const frozen=await page.locator('#rts-time').textContent();
  await expect(page.locator('#rts-menu')).toBeVisible();await page.waitForTimeout(1200);
  await expect(page.locator('#rts-time')).toHaveText(frozen!);await page.locator('#rts-resume').click();
  await expect(page.locator('#rts-supply')).toHaveText('6 / 10',{timeout:15000});
  await page.screenshot({path:test.info().outputPath('battle-formal-integration.png')});
  await page.locator('#rts-pause').click();await page.locator('#rts-surrender').click();
  // The safe choice is the visual default; the destructive action reads as a danger, not the gold primary.
  const keep=page.locator('#rts-confirm-no'),abandon=page.locator('#rts-confirm-yes');
  await expect(keep).toBeFocused();await expect(keep).toHaveClass(/rts-primary/);await expect(abandon).not.toHaveClass(/rts-primary/);await expect(abandon).toHaveClass(/rts-danger/);
  expect(await page.locator('#rts-confirm .rts-dialog-actions button').first().getAttribute('id')).toBe('rts-confirm-no');
  await abandon.click();
  await expect(page.locator('#rts-menu-title')).toHaveText('王旗暫時落下');
  await page.locator('#rts-back').click();await expect(page.locator('#rts-lobby')).toBeVisible();
  await page.getByRole('radio',{name:/灰脊隘口/}).check();await page.getByRole('button',{name:'開始戰役'}).click();
  await expect(page.locator('#rts-battle')).toBeVisible({timeout:30000});
  await expect(page.locator('#rts-map-name')).toHaveText('灰脊隘口');
  await expect(page.locator('#rts-gold')).toHaveText('500');
  expect(await page.locator('#rts-canvas').evaluate(canvas=>{const context=(canvas as HTMLCanvasElement).getContext('webgl2');return !!context&&!context.isContextLost();})).toBe(true);
  await page.mouse.click(hall.x,hall.y);await expect(page.locator('#rts-selection h2')).toHaveText('領主府');
  expect(errors).toEqual([]);
});

test('first-match tips advance on real actions without blocking battlefield input underneath',async({page})=>{
  test.setTimeout(120000);await page.goto('/games/rts');await page.evaluate(()=>localStorage.removeItem('rts.tutorial.v1'));await page.reload();
  await page.getByRole('button',{name:'開始戰役'}).click();await expect(page.locator('#rts-battle')).toBeVisible({timeout:60000});
  const tips=page.locator('#rts-tutorial');await expect(tips).toBeVisible();await expect(tips.locator('[data-tutorial-step]')).toHaveText('1 / 5');
  // The tip text sits over the battlefield: a click there must reach the battlefield, only the skip button is interactive.
  const text=await tips.locator('[data-tutorial-text]').boundingBox();
  const hit=await page.evaluate(([x,y])=>document.elementFromPoint(x,y)?.id??'',[text!.x+text!.width/2,text!.y+text!.height/2]);
  expect(['rts-canvas','rts-overlay']).toContain(hit);
  const skip=await tips.locator('[data-tutorial-skip]').boundingBox();
  expect(await page.evaluate(([x,y])=>document.elementFromPoint(x,y)?.hasAttribute('data-tutorial-skip'),[skip!.x+skip!.width/2,skip!.y+skip!.height/2])).toBe(true);
  const worker=initialScreen(27,149.5,1);
  await expect.poll(async()=>{await page.mouse.click(worker.x,worker.y);return page.locator('#rts-selection h2').textContent();},{timeout:30000}).toBe('工人');
  await expect(tips.locator('[data-tutorial-step]')).toHaveText('2 / 5');
  await tips.locator('[data-tutorial-skip]').click();await expect(tips).toBeHidden();
  expect(await page.evaluate(()=>localStorage.getItem('rts.tutorial.v1'))).toBe('done');
});
test('a first worker click is retained when the first gameplay animation frame is delayed',async({page})=>{
  test.setTimeout(120000);await page.goto('/games/rts');
  await page.evaluate(()=>{
    const request=window.requestAnimationFrame.bind(window),cancel=window.cancelAnimationFrame.bind(window),pending=new Map<number,FrameRequestCallback>();let next=-1;
    window.requestAnimationFrame=callback=>{const id=next--;pending.set(id,callback);return id;};
    window.cancelAnimationFrame=id=>{if(id<0)pending.delete(id);else cancel(id);};
    (window as any).releaseRtsFrames=()=>{window.requestAnimationFrame=request;window.cancelAnimationFrame=cancel;for(const callback of pending.values())request(callback);pending.clear();};
  });
  // A direct DOM click avoids Playwright's own RAF-based actionability waiting.
  await page.locator('#rts-start').dispatchEvent('click');
  await page.waitForFunction(()=>!(document.getElementById('rts-battle') as HTMLElement).hidden,undefined,{polling:100,timeout:30000});
  const worker=initialScreen(27,149.5,1);await page.mouse.click(worker.x,worker.y);
  await page.evaluate(()=>(window as any).releaseRtsFrames());
  await expect(page.locator('#rts-selection h2')).toHaveText('工人');
});

test('a failed initial paint replaces the lost WebGL canvas and retries with working input',async({page})=>{
  test.setTimeout(120000);await page.goto('/games/rts');
  await page.addScriptTag({type:'module',content:`
    const source=await(await fetch('/src/scripts/games/rts/main.ts')).text();
    const match=source.match(new RegExp('from "([^"]*scene[.]ts[^"]*)"'));
    if(!match)throw new Error('Missing battlefield module');
    const {Battlefield}=await import(match[1]),render=Battlefield.prototype.render;
    window.failedPaintCanvas=document.getElementById('rts-canvas');
    Battlefield.prototype.render=function(){Battlefield.prototype.render=render;throw new Error('Controlled initial paint failure');};
  `});
  await page.getByRole('button',{name:'開始戰役'}).click();
  await expect(page.getByText('戰場載入失敗，請重試。',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).failedPaintCanvas!==document.getElementById('rts-canvas'))).toBe(true);
  await page.getByRole('button',{name:'重新載入戰場'}).click();await expect(page.locator('#rts-battle')).toBeVisible({timeout:30000});
  expect(await page.locator('#rts-canvas').evaluate(canvas=>{const context=(canvas as HTMLCanvasElement).getContext('webgl2');return !!context&&!context.isContextLost();})).toBe(true);
  const worker=initialScreen(27,149.5,1);await page.mouse.click(worker.x,worker.y);await expect(page.locator('#rts-selection h2')).toHaveText('工人');
});

test('formal art integration: right-click harvesting pays for a completed house on pass',async({page})=>{
  test.setTimeout(120000);await page.goto('/games/rts');
  await page.getByRole('radio',{name:/灰脊隘口/}).check();await page.getByRole('button',{name:'開始戰役'}).click();
  await expect(page.locator('#rts-battle')).toBeVisible({timeout:30000});
  const worker=initialScreen(27,149.5,1);await page.mouse.click(worker.x,worker.y);
  await expect(page.locator('#rts-selection h2')).toHaveText('工人');
  await page.locator('#rts-commands').getByRole('button',{name:/^建造/}).click();
  const forge=page.locator('#rts-commands button[data-label="鍛造所"]');await expect(forge).toBeDisabled();await expect(forge).toContainText('需要兵營');await expect(forge.locator('..')).toHaveAttribute('title',/需要兵營/);
  await page.locator('#rts-commands').getByRole('button',{name:/^返回/}).click();await expect(forge).toHaveCount(0);
  const mine=initialScreen(34.5,144.5,1);await page.mouse.click(mine.x,mine.y,{button:'right'});
  await expect.poll(async()=>Number(await page.locator('#rts-gold').textContent()),{timeout:22000}).toBeGreaterThan(500);
  await page.locator('#rts-commands').getByRole('button',{name:/^停止/}).click();
  const funds=Number(await page.locator('#rts-gold').textContent());
  await page.locator('#rts-commands').getByRole('button',{name:/^建造/}).click();
  await page.locator('#rts-commands').getByRole('button',{name:/^民居/}).click();
  await expect(page.locator('#rts-commands button[data-label="建造"]')).toBeVisible();
  const position=initialScreen(24,131);await page.mouse.move(position.x,position.y);await page.mouse.click(position.x,position.y);
  await expect(page.locator('#rts-gold')).toHaveText(String(funds-80));
  // Slow software-backed browsers may need more wall time for pathing + ten simulated build seconds.
  await expect(page.locator('#rts-supply')).toHaveText('5 / 20',{timeout:45000});
  await page.screenshot({path:test.info().outputPath('construction-formal-integration.png')});
  const tree=initialScreen(35.3,154.5,3);await page.mouse.click(tree.x,tree.y,{button:'right'});
  await expect.poll(async()=>Number(await page.locator('#rts-wood').textContent()),{timeout:35000}).toBeGreaterThan(170);
});

test.describe('worker command card build submenu',()=>{
  const commandLabels=(page:import('@playwright/test').Page)=>page.locator('#rts-commands button').evaluateAll(buttons=>buttons.map(b=>(b as HTMLElement).dataset.label));
  const expectCardInsideDock=async(page:import('@playwright/test').Page)=>{
    const panel=(await page.locator('.rts-command-panel').boundingBox())!,map=(await page.locator('.rts-map-panel').boundingBox())!,unit=(await page.locator('.rts-unit-panel').boundingBox())!;
    expect(panel.y).toBeGreaterThanOrEqual(map.y-2);expect(Math.abs(panel.y+panel.height-(map.y+map.height))).toBeLessThanOrEqual(2);expect(Math.abs(panel.y-unit.y)).toBeLessThanOrEqual(2);
    const overflow=await page.locator('.rts-command-panel').evaluate(el=>el.scrollHeight-el.clientHeight);expect(overflow).toBeLessThanOrEqual(1);
    const last=(await page.locator('#rts-commands .rts-command-slot').last().boundingBox())!;expect(last.y+last.height).toBeLessThanOrEqual(panel.y+panel.height);
  };
  test('keeps the worker card inside the dock at 1024x768, 1366x768 and 1920x1080 and builds through the submenu',async({page})=>{
    test.setTimeout(120000);await page.goto('/games/rts');await page.getByRole('button',{name:'開始戰役'}).click();
    await expect(page.locator('#rts-battle')).toBeVisible({timeout:30000});
    const worker=initialScreen(27,149.5,1);await page.mouse.click(worker.x,worker.y);await expect(page.locator('#rts-selection h2')).toHaveText('工人');
    const buildings=['領主府','民居','兵營','伐木場','鍛造所','誓約祭壇','守望塔','禮拜堂','馬廄','工坊'];
    for(const [width,height] of [[1024,768],[1366,768],[1920,1080]]){
      await page.setViewportSize({width,height});
      await expect.poll(()=>commandLabels(page)).toEqual(['攻擊移動','停止','守備','建造']);
      await expect(page.locator('#rts-commands button[data-label="建造"]')).toHaveAttribute('aria-keyshortcuts','B');
      await expectCardInsideDock(page);await page.screenshot({path:test.info().outputPath(`hud-submenu/${width}x${height}-main.png`)});
      await page.locator('#rts-canvas').focus();await page.keyboard.press('b');
      await expect.poll(()=>commandLabels(page)).toEqual([...buildings,'返回']);await expect(page.locator('#rts-command-title')).toHaveText('建造');
      await expect(page.locator('#rts-commands button[data-label="民居"] small')).toHaveText('金 80 · 木 30');
      await expect(page.locator('#rts-commands button[data-label="工坊"]')).toBeDisabled();
      await page.screenshot({path:test.info().outputPath(`hud-submenu/${width}x${height}-build.png`)});
      // Cost text on enabled cards and requirement text on locked cards must stay fully readable: no ellipsis, no clipping by the button.
      const clipped=await page.locator('#rts-commands button small').evaluateAll(nodes=>nodes.filter(n=>{const s=n as HTMLElement,b=s.closest('button')!.getBoundingClientRect(),r=s.getBoundingClientRect();
        return s.scrollWidth>s.clientWidth||s.scrollHeight>s.clientHeight+1||r.bottom>b.bottom+.5||r.right>b.right+.5;}).map(n=>n.textContent));
      expect(clipped).toEqual([]);await expectCardInsideDock(page);
      await page.locator('#rts-commands button[data-label="民居"]').click();
      await expect(page.locator('#rts-mode')).toHaveText(/放置民居/);await expect.poll(()=>commandLabels(page)).toEqual(['攻擊移動','停止','守備','建造']);
      // WC3: Esc cancels placement back to the build card; a second Esc returns to the main card.
      await page.keyboard.press('Escape');await expect(page.locator('#rts-mode')).toBeHidden();await expect.poll(()=>commandLabels(page)).toEqual([...buildings,'返回']);await expect(page.locator('#rts-menu')).not.toBeVisible();
      await page.keyboard.press('Escape');await expect.poll(()=>commandLabels(page)).toEqual(['攻擊移動','停止','守備','建造']);await expect(page.locator('#rts-menu')).not.toBeVisible();
      await page.locator('#rts-commands button[data-label="建造"]').click();await expect.poll(()=>commandLabels(page)).toContain('返回');
      await page.locator('#rts-commands button[data-label="兵營"]').focus();await page.keyboard.press('s');await page.keyboard.press('Escape');
      await expect.poll(()=>commandLabels(page)).toEqual(['攻擊移動','停止','守備','建造']);await expect(page.locator('#rts-menu')).not.toBeVisible();
      await expect(page.locator('#rts-selection h2')).toHaveText('工人');
    }
  });
});

test('focused hero fixture: previews and validates all skills, then restarts cleanly',async({page})=>{
  await page.goto('/games/rts');
  await page.evaluate(async()=>{
    const mainPath='/src/scripts/games/rts/main.ts',statePath='/src/scripts/games/rts/state.ts',simulationPath='/src/scripts/games/rts/simulation.ts',visibilityPath='/src/scripts/games/rts/visibility.ts';
    const {mountRts}=await import(mainPath),{addUnit}=await import(statePath),{createGame}=await import(simulationPath),{updateVisibility}=await import(visibilityPath);
    const old=document.getElementById('rts')!,root=old.cloneNode(true) as HTMLElement;old.replaceWith(root);
    mountRts(root,(map:'river'|'pass',seed:number)=>{
      const state=createGame(map,seed);state.aiEnabled=[false,false];state.teams[0].hero.level=3;state.teams[0].hero.skills={cleave:1,mend:1,banner:1};
      const hero=addUnit(state,0,'commander',{x:34,z:134}),ally=addUnit(state,0,'guard',{x:34,z:138}),enemy=addUnit(state,1,'guard',{x:38,z:134});
      hero.order=ally.order=enemy.order={type:'hold'};ally.hp=20;updateVisibility(state);
      (window as any).__rtsHeroFixture={state,hero,ally,enemy};return state;
    });
  });
  await page.getByRole('button',{name:'開始戰役'}).click();await expect(page.locator('#rts-battle')).toBeVisible({timeout:30000});
  const hero=initialScreen(34,134,1);await page.mouse.click(hero.x,hero.y);await expect(page.locator('#rts-selection h2')).toHaveText('誓衛統領');
  await page.locator('#rts-commands').getByRole('button',{name:/^破陣斬/}).click();
  const far=initialScreen(44,134);await page.mouse.move(far.x,far.y);await page.mouse.click(far.x,far.y);
  await expect(page.locator('#rts-notice')).toContainText('目標超出範圍');expect(await page.evaluate(()=>(window as any).__rtsHeroFixture.hero.mana)).toBe(200);
  const enemy=initialScreen(38,134);await page.mouse.move(enemy.x,enemy.y);await page.screenshot({path:test.info().outputPath('hero-cleave-preview.png')});await page.mouse.click(enemy.x,enemy.y);
  await expect.poll(()=>page.evaluate(()=>(window as any).__rtsHeroFixture.enemy.hp)).toBeLessThan(320);
  await page.locator('#rts-commands').getByRole('button',{name:/^戰地救援/}).click();
  const ally=initialScreen(34,138,1);await page.mouse.move(ally.x,ally.y);await page.mouse.click(ally.x,ally.y);
  await expect.poll(()=>page.evaluate(()=>(window as any).__rtsHeroFixture.ally.hp)).toBeGreaterThan(20);
  await page.locator('#rts-commands').getByRole('button',{name:/^王旗/}).click();await page.screenshot({path:test.info().outputPath('hero-banner-preview.png')});
  await page.mouse.click(hero.x,hero.y);await expect.poll(()=>page.evaluate(()=>(window as any).__rtsHeroFixture.hero.bannerUntil>(window as any).__rtsHeroFixture.state.time)).toBe(true);
  expect(await page.evaluate(()=>(window as any).__rtsHeroFixture.hero.mana)).toBeLessThan(60);
  await page.locator('#rts-pause').click();await page.locator('#rts-restart').click();await page.locator('#rts-confirm-yes').click();
  await expect(page.locator('#rts-menu')).not.toBeVisible();await expect(page.locator('#rts-gold')).toHaveText('500');
  await expect.poll(()=>page.evaluate(()=>(window as any).__rtsHeroFixture.hero.mana)).toBe(200);
});
