import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page, browserName, isMobile }) => {
  test.skip(browserName !== 'chromium' || isMobile, 'Desktop Chromium WebGL overlay interaction.');
  await page.route(url => url.pathname === '/src/scripts/games/cs/engine.ts' && !url.searchParams.has('pause-result-source'), route => route.fulfill({
    contentType: 'text/javascript', body: `
      export * from '/src/scripts/games/cs/engine.ts?pause-result-source';
      import {createMatch as make} from '/src/scripts/games/cs/engine.ts?pause-result-source';
      export function createMatch(team){const match=make(team);window.csPauseResultMatch=match;return match;}`,
  }));
  await page.route(url => url.pathname === '/src/scripts/games/cs/ai.ts', route => route.fulfill({
    contentType: 'text/javascript', body: 'export function botInputs(){return {};}',
  }));
  await page.goto('/games/cs');
  await page.locator('#cs-start').click({ timeout: 60000 });
  await page.locator('#cs-deploy').click();
  await expect(page.locator('#cs-root')).toHaveAttribute('data-phase', 'live');
});

async function finishRound(page, matchOver = false) {
  await page.evaluate(complete => {
    const match = window.csPauseResultMatch;
    if (complete) match.scores[match.actors[0].team] = 3;
    for (const actor of match.actors) if (actor.team !== match.actors[0].team) actor.hp = 0;
  }, matchOver);
  await expect(page.locator('#cs-root')).toHaveAttribute('data-phase', matchOver ? 'match-over' : 'round-over');
  await expect(page.locator('#cs-result')).toBeVisible();
}

test('pausing a round result exposes native quit and clears overlays on reentry', async ({ page }, testInfo) => {
  await finishRound(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#cs-pause')).toBeVisible();
  await expect(page.locator('#cs-result')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('round-result-paused.png') });
  await page.locator('#cs-quit').click({ timeout: 3000 });
  await expect(page.locator('#cs-menu')).toBeVisible();
  await expect(page.locator('#cs-result')).toBeHidden();
  await page.locator('#cs-start').click();
  await expect(page.locator('#cs-shop')).toBeVisible();
  await expect(page.locator('#cs-pause')).toBeHidden();
});

test('resuming a paused round result restores the countdown and reaches the next round', async ({ page }) => {
  await finishRound(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#cs-pause')).toBeVisible();
  await expect(page.locator('#cs-result')).toBeVisible();
  const frozenTimer = await page.evaluate(() => window.csPauseResultMatch.timer);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.csPauseResultMatch.timer)).toBe(frozenTimer);
  await page.locator('#cs-resume').click({ timeout: 3000 });
  await expect(page.locator('#cs-pause')).toBeHidden();
  await expect(page.locator('#cs-result')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.csPauseResultMatch.timer)).toBeLessThan(frozenTimer);
  await expect(page.locator('#cs-root')).toHaveAttribute('data-phase', 'buy', { timeout: 15000 });
  await expect(page.locator('#cs-shop')).toBeVisible();
  await expect(page.locator('#cs-result')).toBeHidden();
});

test('Escape on a completed match keeps the result menu usable', async ({ page }) => {
  await finishRound(page, true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#cs-pause')).toBeHidden();
  await expect(page.locator('#cs-result')).toBeVisible();
  await page.locator('#cs-result-menu').click();
  await expect(page.locator('#cs-menu')).toBeVisible();
  await expect(page.locator('#cs-result')).toBeHidden();
});
