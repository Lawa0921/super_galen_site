import { test, expect, type Page } from '@playwright/test';

async function openArmory(page: Page) {
  // Observe the native match without changing its rules or countdown.
  await page.route(url => url.pathname === '/src/scripts/games/cs/engine.ts' && !url.searchParams.has('armory-source'), route => route.fulfill({ contentType: 'text/javascript', body: `
    export * from '/src/scripts/games/cs/engine.ts?armory-source';
    import { createMatch as create } from '/src/scripts/games/cs/engine.ts?armory-source';
    export function createMatch(team) { const match = create(team); window.armoryMatch = match; return match; }` }));
  await page.goto('/games/cs');
  await expect(page.locator('#cs-start')).toBeEnabled({ timeout: 60000 });
  await page.evaluate(async () => {
    const original = window.requestAnimationFrame;
    const gate = window.armoryClock = {
      held: true, heldAt: null as number | null, nativeFrames: 0, nativeTime: 0, original,
      release() { gate.held = false; window.requestAnimationFrame = original; },
    };
    // Keep native callbacks, DOM events and wall-clock timers running. Only the
    // timestamp delivered to animation consumers is held during UI assertions.
    window.requestAnimationFrame = callback => original.call(window, now => {
      if (now !== gate.nativeTime) { gate.nativeFrames++; gate.nativeTime = now; }
      gate.heldAt ??= now;
      callback(gate.held ? gate.heldAt : now);
    });
    // Let the already queued native game frame finish and its next frame use
    // the wrapper before the native Start click creates a match.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await page.locator('#cs-start').click();
}

async function releaseArmoryClockAndCheck(page: Page) {
  const result = await page.evaluate(async () => {
    const gate = window.armoryClock, match = window.armoryMatch;
    const before = { time: match.time, timer: match.timer };
    gate.release();
    const timestamps = await new Promise<number[]>(resolve => {
      gate.original.call(window, first => gate.original.call(window, second => resolve([first, second])));
    });
    return { before, after: { time: match.time, timer: match.timer, phase: match.phase }, timestamps,
      restored: window.requestAnimationFrame === gate.original };
  });
  expect(result.restored).toBe(true);
  expect(result.timestamps[1]).toBeGreaterThan(result.timestamps[0]);
  expect(result.after.time).toBeGreaterThan(result.before.time);
  expect(result.after.timer).toBeLessThan(result.before.timer);
  expect(result.after.phase).toBe('buy');
}

test('armory shows real weapons, balances and purchase reasons, then deploys the equipped weapon', async ({page},info) => {
  try {
    await openArmory(page);
    const beforeDelay = await page.evaluate(() => ({ time: window.armoryMatch.time, timer: window.armoryMatch.timer, wall: performance.now(), frames: window.armoryClock.nativeFrames, nativeTime: window.armoryClock.nativeTime }));
    await page.waitForTimeout(350);
    const afterDelay = await page.evaluate(() => ({ time: window.armoryMatch.time, timer: window.armoryMatch.timer, wall: performance.now(), phase: window.armoryMatch.phase, frames: window.armoryClock.nativeFrames, nativeTime: window.armoryClock.nativeTime }));
    expect(afterDelay.wall - beforeDelay.wall).toBeGreaterThanOrEqual(300);
    expect(afterDelay.frames).toBeGreaterThan(beforeDelay.frames);
    expect(afterDelay.nativeTime).toBeGreaterThan(beforeDelay.nativeTime);
    expect(afterDelay.time).toBe(beforeDelay.time);
    expect(afterDelay.timer).toBe(beforeDelay.timer);
    expect(afterDelay.phase).toBe('buy');
    const images=page.locator('.cs-card-photo img');
    await Promise.all([
      expect(page.locator('#cs-shop-money')).toHaveText('$2,400'),
      expect(images).toHaveCount(4),
      expect(page.locator('[data-buy="pistol"]')).toBeDisabled(),
      expect(page.locator('#cs-offer-pistol')).toHaveText('已裝備'),
      expect(page.locator('#cs-offer-sniper')).toHaveText('還差 $1,100'),
      expect(page.locator('[data-buy="sniper"]')).toBeDisabled(),
    ]);
    expect(await images.evaluateAll(nodes=>nodes.every((n:HTMLImageElement)=>n.complete&&n.naturalWidth===768))).toBe(true);
    await page.screenshot({path:info.outputPath('armory-opening.png')});
    await page.locator('[data-buy="rifle"]').click();
    await Promise.all([
      expect(page.locator('#cs-shop-money')).toHaveText('$400'),
      expect(page.locator('#cs-shop-loadout')).toContainText('AR-4'),
      expect(page.locator('#cs-offer-armor')).toHaveText('還差 $250'),
      expect(page.locator('[data-buy="rifle"]')).toBeDisabled(),
      expect(page.locator('[data-buy="pistol"]')).toBeEnabled(),
    ]);
    await releaseArmoryClockAndCheck(page);
    await page.locator('#cs-deploy').click();
    await expect(page.locator('#cs-shop')).toBeHidden();
    await expect(page.locator('#cs-weapon-name')).toHaveText('AR-4 突擊步槍');
  } finally {
    if (!page.isClosed()) await page.evaluate(() => window.armoryClock?.release());
  }
});

test('narrow armory scrolls within the panel and its deploy control remains reachable', async ({page},info) => {
  try {
    await page.setViewportSize({width:390,height:844});
    await openArmory(page);
    const bounds=await page.locator('.cs-shop-panel').evaluate(node=>({width:node.clientWidth,scroll:node.scrollWidth,height:node.clientHeight,content:node.scrollHeight}));
    expect(bounds.scroll).toBeLessThanOrEqual(bounds.width+1);
    await page.locator('[data-buy="smg"]').click();
    await expect(page.locator('#cs-shop-money')).toHaveText('$1,200');
    await page.locator('[data-buy="armor"]').click();
    await expect(page.locator('#cs-shop-money')).toHaveText('$550');
    await page.locator('#cs-deploy').scrollIntoViewIfNeeded();
    await expect(page.locator('#cs-deploy')).toBeInViewport();
    await page.screenshot({path:info.outputPath('armory-narrow.png')});
    await releaseArmoryClockAndCheck(page);
  } finally {
    if (!page.isClosed()) await page.evaluate(() => window.armoryClock?.release());
  }
});
