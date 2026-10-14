import { test, expect } from '@playwright/test';

test.describe('Breach Point single-player', () => {
  test.beforeEach(({ browserName, isMobile }, testInfo) => {
    const gameplay = !/unavailable model|small touch/.test(testInfo.title);
    const basicGameplay = /arcade has|buys, deploys|defender selection/.test(testInfo.title);
    const supportedDesktop = browserName === 'chromium' || (browserName === 'firefox' && basicGameplay);
    test.skip(gameplay && (!supportedDesktop || isMobile), 'Desktop Chromium covers detailed gameplay; Firefox also covers entry and basic controls. Headless Windows WebKit rejects Pointer Lock even on a minimal page; fallback/device checks still run on all projects.');
  });
  test('arcade has a working game entry and asset loading finishes', async ({ page }, testInfo) => {
    await page.goto('/games');
    await page.locator('a[href="/games/cs"]').click();
    await expect(page.locator('#cs-start')).toBeEnabled({ timeout: 30000 });
    await expect(page.locator('#cs-canvas')).toBeVisible();
    await expect(page.locator('#cs-loading')).toBeHidden();
    await expect(page.locator('#cs-shop')).toBeHidden();
    await expect(page.locator('#cs-scoreboard')).toBeHidden();
    await expect(page.locator('#cs-pause')).toBeHidden();
    await page.screenshot({ path: `tmp/cs-menu-${testInfo.project.name}.png` });
  });
  test('buys, deploys, moves, shoots, reloads and pauses without advancing the clock', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/games/cs');
    await page.locator('#cs-start').click({ timeout: 30000 });
    await expect(page.locator('#cs-shop')).toBeVisible();
    await page.locator('[data-buy="rifle"]').click();
    await expect(page.locator('#cs-money')).toHaveText('$400');
    await page.locator('#cs-deploy').click();
    await expect(page.locator('#cs-root')).toHaveAttribute('data-phase', 'live');
    await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('cs-canvas');
    await expect(page.locator('#cs-pause')).toBeHidden();
    const before = Number(await page.locator('#cs-root').getAttribute('data-player-x'));
    await page.keyboard.down('KeyD');
    await expect.poll(async () => Number(await page.locator('#cs-root').getAttribute('data-player-x')), { timeout: 3000 }).toBeGreaterThan(before + 1);
    await page.keyboard.up('KeyD');
    await page.mouse.down();
    await expect(page.locator('#cs-ammo')).not.toHaveText('30');
    await page.mouse.up();
    await page.keyboard.press('KeyR');
    await expect(page.locator('#cs-action')).toContainText('換彈');
    await expect(page.locator('#cs-ammo')).toHaveText('30', { timeout: 4000 });
    await page.screenshot({ path: `tmp/cs-combat-${testInfo.project.name}.png` });
    await page.keyboard.press('Escape');
    await expect(page.locator('#cs-pause')).toBeVisible();
    // Flush the 80ms HUD cadence before sampling the frozen simulation clock.
    // The pause panel is synchronous; its timer text may be one HUD tick old.
    await page.waitForTimeout(150);
    const timer = await page.locator('#cs-timer').textContent();
    await page.waitForTimeout(1200);
    await expect(page.locator('#cs-timer')).toHaveText(timer!);
    await page.locator('#cs-resume').click();
    await expect(page.locator('#cs-pause')).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('cs-canvas');
    const resumeX = Number(await page.locator('#cs-root').getAttribute('data-player-x'));
    await page.keyboard.down('KeyA');
    await expect.poll(async () => Number(await page.locator('#cs-root').getAttribute('data-player-x')), { timeout: 3000 }).toBeLessThan(resumeX - .5);
    await page.keyboard.up('KeyA');
    expect(errors).toEqual([]);
  });
  test('defender selection, scoreboard, quit and restart work', async ({ page }) => {
    await page.goto('/games/cs');
    await page.locator('[data-team="defend"]').click();
    await page.locator('#cs-start').click({ timeout: 30000 });
    await expect(page.locator('#cs-team')).toContainText('守方');
    await page.locator('#cs-deploy').click();
    await page.keyboard.down('Tab');
    await expect(page.locator('#cs-scoreboard')).toBeVisible();
    await expect(page.locator('#cs-scoreboard tbody tr')).toHaveCount(6);
    await page.keyboard.up('Tab');
    await page.keyboard.press('Escape');
    await page.locator('#cs-quit').click();
    await expect(page.locator('#cs-menu')).toBeVisible();
    await page.locator('#cs-start').click();
    await expect(page.locator('#cs-shop')).toBeVisible();
  });
  test('paused gameplay redraws only for display changes and resumes immediately', async ({ page }) => {
    await page.goto('/games/cs');
    await expect(page.locator('#cs-start')).toBeEnabled({ timeout: 30000 });
    expect(await page.evaluate(() => document.visibilityState)).toBe('visible');
    await page.evaluate(async () => {
      const url = performance.getEntriesByType('resource').map(e => e.name).find(url => new URL(url).pathname === '/src/scripts/games/cs/renderer.ts');
      if (!url) throw new Error('Actual renderer module not found');
      const { GameRenderer } = await import(url), render = GameRenderer.prototype.render;
      window.csPauseDraws = 0;
      GameRenderer.prototype.render = function (...args) {
        window.csPauseDraws++;
        return render.apply(this, args);
      };
    });
    const frames = () => page.evaluate(() => window.csPauseDraws);
    await page.locator('#cs-start').click();
    await page.locator('#cs-deploy').click();
    await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('cs-canvas');
    await page.keyboard.press('Escape');
    await expect(page.locator('#cs-pause')).toBeVisible();
    // Permit the single pause-transition frame, then the scene must stay still.
    await page.waitForTimeout(150);
    const pausedFrames = await frames(), clock = await page.locator('#cs-timer').textContent();
    await page.waitForTimeout(400);
    expect(await frames()).toBe(pausedFrames);
    await expect(page.locator('#cs-timer')).toHaveText(clock!);
    await page.locator('#cs-pause-settings').click();
    await page.locator('#cs-quality').selectOption('low');
    await expect.poll(frames).toBeGreaterThan(pausedFrames);
    const afterQuality = await frames();
    await page.waitForTimeout(250);
    expect(await frames()).toBe(afterQuality);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(frames).toBeGreaterThan(afterQuality);
    const afterMotion = await frames();
    await page.waitForTimeout(250);
    expect(await frames()).toBe(afterMotion);
    await page.locator('#cs-settings .cs-primary').click();
    const oldSize = await page.locator('#cs-canvas').evaluate((canvas: HTMLCanvasElement) => canvas.width);
    await page.setViewportSize({ width: 1100, height: 750 });
    await expect.poll(frames).toBeGreaterThan(afterMotion);
    await expect.poll(() => page.locator('#cs-canvas').evaluate((canvas: HTMLCanvasElement) => canvas.width)).not.toBe(oldSize);
    const afterResize = await frames();
    await page.waitForTimeout(250);
    expect(await frames()).toBe(afterResize);
    await page.screenshot({ path: 'tmp/cs-paused-render-resized.png' });
    await page.locator('#cs-resume').click();
    await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('cs-canvas');
    await expect.poll(frames).toBeGreaterThan(afterResize + 2);
    const x = Number(await page.locator('#cs-root').getAttribute('data-player-x'));
    await page.keyboard.down('KeyD');
    try { await expect.poll(async () => Number(await page.locator('#cs-root').getAttribute('data-player-x'))).toBeGreaterThan(x + .5); }
    finally { await page.keyboard.up('KeyD'); }
  });
  for (const cancelWithPause of [false, true]) test(cancelWithPause
    ? 'pausing cancels a reload tap queued between animation frames'
    : 'a reload tap between animation frames starts reloading', async ({ page }) => {
    await page.route(url=>url.pathname==='/src/scripts/games/cs/engine.ts'&&!url.searchParams.has('reload-tap-source'),route=>route.fulfill({contentType:'text/javascript',body:`
      export * from '/src/scripts/games/cs/engine.ts?reload-tap-source';
      import {createMatch as make} from '/src/scripts/games/cs/engine.ts?reload-tap-source';
      export function createMatch(team){const m=make(team);window.csReloadMatch=m;return m;}
    `}));
    await page.goto('/games/cs');
    await page.locator('#cs-start').click({ timeout: 30000 });
    await page.locator('[data-buy="rifle"]').click();
    await page.locator('#cs-deploy').click();
    await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('cs-canvas');
    // Hold the next game frame so both native key events definitely arrive
    // between simulation steps, reproducing a short tap on a busy browser.
    const holdFrame = async () => {
      await page.evaluate(() => {
        if (!window.csFrameRequest) {
          window.csFrameRequest = window.requestAnimationFrame;
          window.requestAnimationFrame = callback => window.csFrameRequest(time => {
            if (window.csHoldFrame) window.csHeldFrames.push(callback); else callback(time);
          });
        }
        window.csHeldFrames = []; window.csHoldFrame = true;
      });
      await page.waitForFunction(() => window.csHeldFrames.length > 0, null, { polling: 10 });
    };
    const releaseFrame = () => page.evaluate(() => {
      window.csHoldFrame = false;
      for (const callback of window.csHeldFrames.splice(0)) requestAnimationFrame(callback);
    });
    await page.mouse.down();
    try { await expect(page.locator('#cs-ammo')).not.toHaveText('30'); }
    finally { await page.mouse.up(); }
    await expect(page.locator('#cs-root')).toHaveAttribute('data-phase', 'live');
    await expect(page.locator('#cs-health')).not.toHaveText('0');
    await holdFrame(); await page.keyboard.press('KeyR');
    if (!cancelWithPause) {
      await releaseFrame();
      await expect(page.locator('#cs-action')).toContainText('換彈');
      await page.keyboard.press('Escape');
      return;
    }
    await page.keyboard.press('Escape'); await releaseFrame();
    await expect(page.locator('#cs-pause')).toBeVisible();
    // HUD text refreshes every 80ms. A held automatic burst can spend another
    // round after the last HUD update, before pause freezes the simulation.
    // Compare with the paused engine, then wait for the display to catch up.
    const ammo = String(await page.evaluate(()=>window.csReloadMatch.actors[0].ammo));
    await expect(page.locator('#cs-ammo')).toHaveText(ammo);
    await page.locator('#cs-resume').click();
    await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('cs-canvas');
    await page.waitForTimeout(500);
    await expect(page.locator('#cs-root')).toHaveAttribute('data-phase', 'live');
    await expect(page.locator('#cs-health')).not.toHaveText('0');
    await expect(page.locator('#cs-ammo')).toHaveText(ammo);
    await expect(page.locator('#cs-action')).not.toContainText('換彈');
  });
  test('holding Left Ctrl crouches: lower camera, slower movement, release restores', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/games/cs');
    await page.locator('#cs-start').click({ timeout: 30000 });
    await expect(page.locator('.cs-key-hint')).toContainText('CTRL 蹲下');
    await page.locator('#cs-deploy').click();
    await expect(page.locator('#cs-root')).toHaveAttribute('data-phase', 'live');
    await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('cs-canvas');
    const cameraY = async () => Number(await page.locator('#cs-canvas').getAttribute('data-camera-y'));
    const speed = async () => Number(await page.locator('#cs-root').getAttribute('data-player-speed'));
    await expect.poll(cameraY).toBeCloseTo(1.58, 2);
    await page.keyboard.down('KeyD');
    // Sample the settled P9 speed. A >4 gate can capture acceleration at 4.02,
    // making the correct 1.80 crouch speed fail the subsequent 40% assertion.
    await expect.poll(speed, { timeout: 3000 }).toBeCloseTo(5.3, 1);
    const standing = await speed();
    await page.keyboard.down('ControlLeft');
    await expect.poll(cameraY, { timeout: 2000 }).toBeCloseTo(1.14, 2);
    await expect.poll(speed, { timeout: 3000 }).toBeLessThan(standing * .4);
    expect(await speed()).toBeGreaterThan(standing * .25);
    await expect(page.locator('#cs-pause')).toBeHidden();
    await page.keyboard.up('ControlLeft');
    await expect.poll(cameraY, { timeout: 2000 }).toBeCloseTo(1.58, 2);
    await expect.poll(speed, { timeout: 3000 }).toBeGreaterThan(standing * .9);
    await page.keyboard.up('KeyD');
    expect(errors).toEqual([]);
  });
  test('a delayed pointer lock request does not pause deployment before the browser grants it', async ({ page }) => {
    await page.addInitScript(() => {
      const request = HTMLCanvasElement.prototype.requestPointerLock;
      HTMLCanvasElement.prototype.requestPointerLock = async function(options) {
        await new Promise(resolve => setTimeout(resolve, 400));
        return request.call(this, options);
      };
    });
    await page.goto('/games/cs');
    await page.locator('#cs-start').click({ timeout: 30000 });
    await page.locator('#cs-deploy').click();
    await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('cs-canvas');
    await expect(page.locator('#cs-pause')).toBeHidden();
  });
  test('unavailable model produces a visible retry action instead of starting an empty world', async ({ page }) => {
    await page.route('**/assets/games/cs/environment.glb', route => route.fulfill({ status: 503, body: 'temporarily unavailable' }));
    await page.goto('/games/cs');
    await expect(page.locator('#cs-load-error')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#cs-start')).toBeDisabled();
    await expect(page.locator('#cs-retry')).toBeVisible();
  });
  test('small touch devices receive an honest keyboard and mouse notice', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/games/cs');
    await expect(page.locator('#cs-device-notice')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
