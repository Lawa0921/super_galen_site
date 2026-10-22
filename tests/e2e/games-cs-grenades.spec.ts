import { test, expect, type Page } from '@playwright/test';

// Expose the live match (same wrapper pattern as games-cs.spec.ts) and keep the
// enemy bots idle at spawn so the utility checks are not decided by a gunfight.
async function openWithMatch(page: Page) {
  await page.route(url => url.pathname === '/src/scripts/games/cs/engine.ts' && !url.searchParams.has('grenade-source'), route => route.fulfill({ contentType: 'text/javascript', body: `
    export * from '/src/scripts/games/cs/engine.ts?grenade-source';
    import {createMatch as make} from '/src/scripts/games/cs/engine.ts?grenade-source';
    export function createMatch(team){const m=make(team);window.csMatch=m;return m;}
  ` }));
  await page.route(url => url.pathname === '/src/scripts/games/cs/ai.ts' && !url.searchParams.has('grenade-source'), route => route.fulfill({ contentType: 'text/javascript', body: `
    export * from '/src/scripts/games/cs/ai.ts?grenade-source';
    import {botInputs as live} from '/src/scripts/games/cs/ai.ts?grenade-source';
    export function botInputs(m){const all=live(m);for(const a of m.actors)if(a.team!==m.actors[0].team&&m.phase==='live')delete all[a.id];return all;}
  ` }));
  await page.goto('/games/cs');
  await page.locator('#cs-start').click({ timeout: 60000 });
  await expect(page.locator('#cs-shop')).toBeVisible();
}
async function deploy(page: Page) {
  await page.locator('#cs-deploy').click();
  await expect(page.locator('#cs-root')).toHaveAttribute('data-phase', 'live');
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('cs-canvas');
}

test.describe('Breach Point utility', () => {
  test.beforeEach(async ({ page, browserName, isMobile }) => {
    test.skip(browserName !== 'chromium' || isMobile, 'WebGL + Pointer Lock gameplay acceptance uses desktop Chromium.');
    // Preserve evidence for an intermittent startup stall without changing
    // readiness, the inactivity window, test timeouts or retry behavior.
    await page.addInitScript(() => {
      (window as any).csLoadingTrace = { downloads: {}, heartbeatAt: performance.now(), maxHeartbeatGap: 0, ticks: 0,
        initialVisibility: document.visibilityState, visibilityChanges: 0 };
      document.addEventListener('visibilitychange', () => { (window as any).csLoadingTrace.visibilityChanges++; });
      setInterval(() => {
        const record = (window as any).csLoadingTrace, now = performance.now();
        record.maxHeartbeatGap = Math.max(record.maxHeartbeatGap, now - record.heartbeatAt);
        record.heartbeatAt = now; record.ticks++;
      }, 1000);
    });
    await page.route(url => url.pathname === '/src/scripts/games/cs/asset-download.ts' && !url.searchParams.has('loading-source'), route => route.fulfill({ contentType: 'text/javascript', body: `
      export * from '/src/scripts/games/cs/asset-download.ts?loading-source';
      import { fetchAssetBytes as real } from '/src/scripts/games/cs/asset-download.ts?loading-source';
      export function fetchAssetBytes(url, signal, progress) {
        const record = window.csLoadingTrace.downloads[url] = { startedAt: performance.now(), bytes: 0, chunks: 0 };
        const result = real(url, signal, bytes => {
          record.bytes = bytes; record.chunks++; record.lastProgressAt = performance.now(); progress(bytes);
        });
        void result.then(() => { record.completedAt = performance.now(); }, error => { record.error = error.name; record.failedAt = performance.now(); });
        return result;
      }` }));
    await page.route(url => url.pathname === '/src/scripts/games/cs/asset-loading.ts' && !url.searchParams.has('loading-source'), route => route.fulfill({ contentType: 'text/javascript', body: `
      export * from '/src/scripts/games/cs/asset-loading.ts?loading-source';
      import { createAssetLoadWatchdog as realWatchdog, loadOwnedResources as realOwned } from '/src/scripts/games/cs/asset-loading.ts?loading-source';
      export function createAssetLoadWatchdog(controller) {
        const now = performance.now(), loaded = new Map();
        const record = window.csLoadingTrace.watchdog = { armedAt: now, lastActivityAt: now, maxActivityGap: 0, deadlineAt: now + 30000 };
        const activity = () => {
          if (record.stoppedAt !== undefined || record.abortedAt !== undefined) return;
          const now = performance.now(); record.maxActivityGap = Math.max(record.maxActivityGap, now - record.lastActivityAt);
          record.lastActivityAt = now; record.deadlineAt = now + 30000;
        };
        controller.signal.addEventListener('abort', () => { record.abortedAt = performance.now(); record.reason = controller.signal.reason?.name; }, { once: true });
        const watchdog = realWatchdog(controller);
        return { progress(id, bytes) {
            if (Number.isFinite(bytes) && bytes > (loaded.get(id) ?? 0)) { loaded.set(id, bytes); activity(); }
            watchdog.progress(id, bytes);
          },
          completed() { record.lastItemAt = performance.now(); activity(); watchdog.completed(); },
          stop() { record.stoppedAt = performance.now(); watchdog.stop(); } };
      }
      export function loadOwnedResources(...args) {
        const result = realOwned(...args);
        void result.then(() => { window.csLoadingTrace.transferredAt = performance.now(); }, error => { window.csLoadingTrace.ownershipError = error.name; });
        return result;
      }` }));
  });
  test.afterEach(async ({ page }, info) => {
    if (info.status === 'skipped' || page.isClosed()) return;
    const data = await page.evaluate(() => {
      const start = document.querySelector('#cs-start') as HTMLButtonElement | null;
      const error = document.querySelector('#cs-load-error') as HTMLElement | null;
      return { ...((window as any).csLoadingTrace ?? {}), capturedAt: performance.now(), visibility: document.visibilityState,
        ready: start ? !start.disabled : null, loadError: error ? !error.hidden : null };
    }).catch(error => ({ probeError: String(error) }));
    await info.attach('cs-loading-progress', { body: JSON.stringify(data), contentType: 'application/json' });
  });

  test('buys a smoke, throws it and the smoke blocks a bot sight line through it', async ({ page }, info) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await openWithMatch(page);
    await expect(page.locator('[data-buy="smoke"]')).toContainText('$300');
    await page.locator('[data-buy="smoke"]').click();
    await expect(page.locator('#cs-shop-money')).toHaveText('$2,100');
    await expect(page.locator('#cs-offer-smoke')).toHaveText('已達上限 1');
    await expect(page.locator('#cs-shop-loadout')).toContainText('SMOKE×1');
    await deploy(page);
    await expect(page.locator('[data-grenade="smoke"]')).toHaveAttribute('data-count', '1');
    await page.keyboard.press('Digit4');
    await expect(page.locator('#cs-weapon-name')).toHaveText('煙霧彈');
    await page.waitForTimeout(450);
    await page.mouse.down(); await page.waitForTimeout(350); await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.csMatch.smokes.filter((s: { actor: number }) => s.actor === 0).length), { timeout: 8000 }).toBe(1);
    await expect(page.locator('#cs-weapon-name')).not.toHaveText('煙霧彈');
    await page.waitForTimeout(1300);
    const sight = await page.evaluate(async () => {
      const { visible } = await import('/src/scripts/games/cs/map.ts');
      const m = window.csMatch, s = m.smokes.find((s: { actor: number }) => s.actor === 0);
      const bot = m.actors.find((a: { team: string; id: number }) => a.team !== m.actors[0].team);
      // Put an idle enemy bot 5.5 m to one side of the smoke, looking at a point 5.5 m
      // on the other side; pick an axis with no wall so only the smoke is between.
      for (const [dx, dz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        Object.assign(bot, { x: s.x - dx * 5.5, z: s.z - dz * 5.5, y: s.y });
        const target = { x: s.x + dx * 5.5, z: s.z + dz * 5.5, y: s.y };
        if (visible(bot, target, [])) return { through: visible(bot, target, m.smokes), clear: true, bot: bot.name };
      }
      return { through: null, clear: false, bot: bot.name };
    });
    expect(sight).toMatchObject({ through: false, clear: true });
    await page.screenshot({ path: info.outputPath('smoke-thrown.png') });
    expect(errors).toEqual([]);
  });

  test('buys a flash and a self-flash whites out the screen, then fades', async ({ page }, info) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await openWithMatch(page);
    await page.locator('[data-buy="flash"]').click();
    await page.locator('[data-buy="flash"]').click();
    await expect(page.locator('#cs-offer-flash')).toHaveText('已達上限 2');
    await expect(page.locator('#cs-shop-money')).toHaveText('$2,000');
    await deploy(page);
    await page.keyboard.press('Digit4');
    await expect(page.locator('#cs-weapon-name')).toHaveText('閃光彈');
    await expect(page.locator('#cs-ammo')).toHaveText('2');
    await page.waitForTimeout(450);
    // Right-click lob: it pops a few metres ahead, in full view.
    await page.mouse.down({ button: 'right' }); await page.waitForTimeout(320); await page.mouse.up({ button: 'right' });
    await expect(page.locator('#cs-root')).toHaveAttribute('data-flash', 'on', { timeout: 4000 });
    await expect.poll(() => page.locator('#cs-flash').evaluate(n => Number(getComputedStyle(n).opacity))).toBeGreaterThan(.9);
    await page.screenshot({ path: info.outputPath('flash-white.png') });
    const duration = await page.evaluate(() => window.csMatch.actors[0].flashDuration);
    expect(duration).toBeGreaterThan(3);
    await expect(page.locator('#cs-ammo')).toHaveText('1', { timeout: 3000 });
    await expect(page.locator('#cs-root')).toHaveAttribute('data-flash', 'off', { timeout: 8000 });
    expect(errors).toEqual([]);
  });
});
