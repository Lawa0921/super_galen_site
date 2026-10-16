import { test, expect, type Page } from '@playwright/test';

/**
 * DELVE 深掘 — 2D 沙盒 E2E 煙霧測試（Canvas2D；僅 chromium）。
 * 透過 window.__delveDebug 讀寫引擎狀態。
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Dbg = { game: any; handle: any; save: () => Promise<void> };
declare global { interface Window { __delveDebug?: Dbg } }

async function waitGame(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.__delveDebug?.game), undefined, { timeout: 30000 });
}

/** 世界 fg 的 FNV-1a 雜湊（整個世界） */
function worldHash(page: Page): Promise<string> {
  return page.evaluate(() => {
    const fg: Uint8Array = window.__delveDebug!.game.world.fg;
    let h = 0x811c9dc5;
    for (let i = 0; i < fg.length; i++) { h ^= fg[i]; h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  });
}

test.describe('delve', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'canvas sandbox smoke runs on chromium only');

  test('標題 → 新世界 開局，沒有 console 錯誤', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/games/delve');
    await expect(page.locator('#delve-title')).toBeVisible();
    await page.fill('#delve-seed', 'title-test');
    await page.click('#delve-new');
    await expect(page.locator('#delve-title')).toBeHidden();
    await waitGame(page);
    await expect(page.locator('#delve-hotbar .delve-slot')).toHaveCount(10);
    const seed = await page.evaluate(() => window.__delveDebug!.game.seed);
    expect(seed).toBe('title-test');
    // 迴圈有在跑
    const t0 = await page.evaluate(() => window.__delveDebug!.game.tick);
    await page.waitForTimeout(300);
    const t1 = await page.evaluate(() => window.__delveDebug!.game.tick);
    expect(t1).toBeGreaterThan(t0);
    expect(errors).toEqual([]);
  });

  test('同一個 seed 兩次載入世界相同', async ({ page }) => {
    await page.goto('/games/delve?seed=abc&autostart=1&fresh=1');
    await waitGame(page);
    const a = await worldHash(page);
    await page.goto('/games/delve?seed=abc&autostart=1&fresh=1');
    await waitGame(page);
    const b = await worldHash(page);
    expect(a).toBe(b);
    await page.goto('/games/delve?seed=abd&autostart=1&fresh=1');
    await waitGame(page);
    expect(await worldHash(page)).not.toBe(a);
  });

  test('瞄準腳下並按住挖掘 → 背包泥土增加', async ({ page }) => {
    await page.goto('/games/delve?seed=mine&autostart=1&fresh=1');
    await waitGame(page);
    // 等玩家落地
    await page.waitForFunction(() => window.__delveDebug!.game.player.onGround, undefined, { timeout: 10000 });
    const target = await page.evaluate(() => {
      const g = window.__delveDebug!.game;
      const p = g.player;
      const tx = Math.floor((p.x + p.w / 2) / 16);
      const ty = Math.floor((p.y + p.h + 1) / 16);
      // 確保目標是泥土（草地也掉泥土）
      g.world.setFg(tx, ty, 1);
      g.setAim(tx, ty);
      g.setMining(true);
      return { tx, ty, before: g.inventory.count('dirt') };
    });
    await page.waitForFunction(
      (b) => window.__delveDebug!.game.inventory.count('dirt') > b,
      target.before,
      { timeout: 10000 },
    );
    const fg = await page.evaluate(({ tx, ty }) => window.__delveDebug!.game.world.getFg(tx, ty), target);
    expect(fg).toBe(0);
  });

  test('存檔 → 重新整理 → 繼續，修改的格子還在', async ({ page }) => {
    await page.goto('/games/delve?seed=savetest&autostart=1&fresh=1');
    await waitGame(page);
    const spot = await page.evaluate(async () => {
      const d = window.__delveDebug!;
      const g = d.game;
      const t = g.playerTile();
      const x = t.x + 3, y = t.y + 4;
      g.world.setFg(x, y, 7); // planks
      await d.save();
      return { x, y };
    });
    await page.goto('/games/delve');
    await expect(page.locator('#delve-continue')).toBeVisible({ timeout: 10000 });
    await page.click('#delve-continue');
    await waitGame(page);
    const fg = await page.evaluate(({ x, y }) => window.__delveDebug!.game.world.getFg(x, y), spot);
    expect(fg).toBe(7);
    expect(await page.evaluate(() => window.__delveDebug!.game.seed)).toBe('savetest');
  });

  test('已有存檔時新世界先詢問覆蓋（取消保留、覆蓋才換世界）；autostart 沒 fresh=1 不覆蓋', async ({ page }) => {
    await page.goto('/games/delve?seed=keepme&autostart=1&fresh=1');
    await waitGame(page);
    await page.evaluate(() => window.__delveDebug!.save());
    // autostart 沒 fresh=1：跳出確認，不直接開局
    await page.goto('/games/delve?seed=other&autostart=1');
    await expect(page.locator('#delve-confirm')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#delve-confirm-msg')).toContainText('keepme');
    await page.click('#delve-confirm-cancel');
    await expect(page.locator('#delve-confirm')).toBeHidden();
    await expect(page.locator('#delve-title')).toBeVisible();
    expect(await page.evaluate(() => Boolean(window.__delveDebug))).toBe(false);
    // 標題「新世界」→ 取消 → 存檔還在
    await page.fill('#delve-seed', 'brandnew');
    await page.click('#delve-new');
    await expect(page.locator('#delve-confirm')).toBeVisible();
    await page.click('#delve-confirm-cancel');
    await expect(page.locator('#delve-continue')).toContainText('keepme');
    // 再按一次 → 覆蓋
    await page.click('#delve-new');
    await page.click('#delve-confirm-ok');
    await waitGame(page);
    expect(await page.evaluate(() => window.__delveDebug!.game.seed)).toBe('brandnew');
  });

  test('遊戲廳卡片連到 /games/delve', async ({ page }) => {
    await page.goto('/games');
    const link = page.locator('a[href="/games/delve"]');
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/games\/delve\/?$/);
    await expect(page.locator('#delve-new')).toBeVisible();
  });
});
