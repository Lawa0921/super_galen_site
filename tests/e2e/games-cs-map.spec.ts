import { test, expect } from '@playwright/test';

for (const delayedRelease of [false, true]) test(delayedRelease
  ? 'keyboard traversal tolerates delayed native key release after positioning'
  : 'keyboard traversal climbs the south stairs, crosses the terrace and descends the north stairs', async ({page, browserName, isMobile},info) => {
  test.skip(browserName === 'webkit' || isMobile, 'Native keyboard traversal requires desktop Pointer Lock; Windows WebKit rejects it. Chromium and Firefox retain this coverage.');
  // Observe the real engine. Only bot commands are held still so the player
  // can complete this collision test; movement and floor physics are native.
  await page.route(url=>url.pathname==='/src/scripts/games/cs/engine.ts'&&!url.searchParams.has('walk-source'),route=>route.fulfill({contentType:'text/javascript',body:`
    export * from '/src/scripts/games/cs/engine.ts?walk-source';
    import {createMatch as make} from '/src/scripts/games/cs/engine.ts?walk-source';
    export function createMatch(team){const m=make(team);window.walkMatch=m;return m;}`}));
  await page.route(url=>url.pathname==='/src/scripts/games/cs/ai.ts',route=>route.fulfill({contentType:'text/javascript',body:'export function botInputs(){return {}}'}));
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/games/cs');await page.locator('#cs-start').click({timeout:60000});await page.locator('#cs-deploy').click();
  await expect.poll(()=>page.evaluate(()=>window.walkMatch?.phase)).toBe('live');
  await expect.poll(()=>page.evaluate(()=>document.pointerLockElement?.id)).toBe('cs-canvas');
  // Initial alignment must not depend on the driver receiving the position
  // result before it sends native keyup. Hold frames only at that target;
  // all subsequent stair and boundary traversal runs on the original clock.
  await page.evaluate(() => {
    if (window.csMapFrameGate?.active) throw new Error('Positioning gate already installed');
    const original = window.requestAnimationFrame;
    const held: FrameRequestCallback[] = [];
    const gate = window.csMapFrameGate = {
      active: true, original, held,
      release() {
        if (!gate.active) return;
        gate.active = false;
        window.requestAnimationFrame = original;
        for (const callback of held.splice(0)) original.call(window, callback);
      },
    };
    window.requestAnimationFrame = callback => original.call(window, time => {
      if (gate.active && window.walkMatch.actors[0].x >= 19) held.push(callback);
      else callback(time);
    });
  });
  let heldTime = 0;
  try {
    await page.keyboard.down('KeyD');
    await page.waitForFunction(()=>window.csMapFrameGate.held.length>0,undefined,{timeout:15000,polling:10});
    const held = await page.evaluate(()=>({x:window.walkMatch.actors[0].x,time:window.walkMatch.time,count:window.csMapFrameGate.held.length}));
    expect(held.count).toBeGreaterThan(0); expect(held.x).toBeGreaterThanOrEqual(19); expect(held.x).toBeLessThan(21.5);
    heldTime = held.time;
    // Reproduce a slow driver round trip after reaching the positioning target.
    if (delayedRelease) {
      await page.waitForTimeout(600);
      expect(await page.evaluate(()=>window.walkMatch.actors[0].x)).toBe(held.x);
    }
  }
  finally {
    try { await page.keyboard.up('KeyD'); }
    finally { await page.evaluate(()=>window.csMapFrameGate?.release()); }
  }
  expect(await page.evaluate(()=>window.requestAnimationFrame===window.csMapFrameGate.original&&!window.csMapFrameGate.active&&window.csMapFrameGate.held.length===0)).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.walkMatch.time)).toBeGreaterThan(heldTime);
  expect(await page.evaluate(()=>window.walkMatch.actors[0].x)).toBeLessThan(21.5);
  await page.keyboard.down('KeyW');
  try {await page.waitForFunction(()=>{const p=window.walkMatch.actors[0];return p.z<14&&p.y===2.4},undefined,{timeout:15000});}
  finally {await page.keyboard.up('KeyW');}
  const top=await page.evaluate(()=>{const p=window.walkMatch.actors[0];return {x:p.x,y:p.y,z:p.z}});
  expect(top.y).toBeCloseTo(2.4,5);expect(top.z).toBeGreaterThan(6);
  await page.screenshot({path:info.outputPath('native-terrace.png')});
  await page.keyboard.down('KeyW');
  try {await page.waitForFunction(()=>{const p=window.walkMatch.actors[0];return p.z<.5&&p.y===0},undefined,{timeout:15000});}
  finally {await page.keyboard.up('KeyW');}
  await page.screenshot({path:info.outputPath('native-north-exit.png')});
  await page.keyboard.down('KeyD');
  try {
    await page.waitForFunction(()=>window.walkMatch.actors[0].x>23.4,undefined,{timeout:10000});
    await page.waitForTimeout(850);
  } finally {await page.keyboard.up('KeyD');}
  const edge=await page.evaluate(()=>{const p=window.walkMatch.actors[0];return {x:p.x,y:p.y,z:p.z}});
  expect(edge.x).toBeGreaterThan(23.4);expect(edge.x).toBeLessThan(23.64);
  expect(edge.y).toBe(0);
  await page.screenshot({path:info.outputPath('native-movement-boundary.png')});
  await page.keyboard.press('Escape');await expect(page.locator('#cs-pause')).toBeVisible();
  expect(errors).toEqual([]);
});
