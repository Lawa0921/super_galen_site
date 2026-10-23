import { test, expect, type Page, type CDPSession, type Browser, type BrowserContext } from '@playwright/test';

/**
 * DELVE 手機觸控：用 CDP Input.dispatchTouchEvent 產生真的觸控（pointerType 'touch'，不是合成的 dispatchEvent）。
 * 單機：按住身邊的土塊 → 挖掉；拿土塊點空格 → 放下；拿劍點一下 → 揮劍。
 * 連線客人（手機）：同樣的點按要送到房主——房主端那格被挖掉 / 放下。
 * （客人的 act(talkAt) 一律回 CMD_PENDING = true，觸控若先問「點到人了沒」就會把每次點擊都當成對話吃掉）
 */
import type {} from '../../src/scripts/games/delve/render/session';

const DIRT_FG = 1; // engine/tiles.ts T.DIRT
const PHONE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true };

async function waitGame(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.__delveDebug?.game), undefined, { timeout: 30000 });
}

async function pressStart(page: Page): Promise<void> {
  await expect(page.locator('#delve-root')).toHaveAttribute('data-ready', '1');
  await page.locator('#delve-press').click();
  await expect(page.locator('#delve-tmenu')).toBeVisible();
}

async function newContext(browser: Browser, phone: boolean): Promise<BrowserContext> {
  const ctx = await browser.newContext(phone ? PHONE : {});
  await ctx.addInitScript(() => { try { localStorage.setItem('delve.peaceful', '1'); localStorage.setItem('delve.help.seen', '1'); } catch { /* ignore */ } });
  return ctx;
}

/** tile (x, y) 中心在畫面上的座標；順便回報那一點最上層的元素（要是畫布才點得到） */
function tileScreen(page: Page, t: { x: number; y: number }): Promise<{ sx: number; sy: number; top: string }> {
  return page.evaluate(([x, y]) => {
    const r = window.__delveDebug!.handle.renderer, c = (document.querySelector('#delve-canvas') as HTMLCanvasElement).getBoundingClientRect();
    const sx = c.left + ((x + 0.5) * 16 - r.drawCam.x) * r.zoom, sy = c.top + ((y + 0.5) * 16 - r.drawCam.y) * r.zoom;
    return { sx, sy, top: document.elementFromPoint(sx, sy)?.id ?? '' };
  }, [t.x, t.y]);
}

async function touchDown(cdp: CDPSession, p: { sx: number; sy: number }): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.sx, y: p.sy, id: 1 }] });
}
async function touchUp(cdp: CDPSession): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
/** 手指點一下（約 120 ms） */
async function tap(page: Page, cdp: CDPSession, p: { sx: number; sy: number }): Promise<void> {
  await touchDown(cdp, p);
  await page.waitForTimeout(120);
  await touchUp(cdp);
}

const fgAt = (page: Page, t: { x: number; y: number }): Promise<number> =>
  page.evaluate(([x, y]) => window.__delveDebug!.game.world.getFg(x, y), [t.x, t.y]);
const selectItem = (page: Page, item: string): Promise<void> => page.evaluate((item) => {
  const g = window.__delveDebug!.game;
  g.selectSlot(g.inventory.slots.findIndex((s: { item: string } | null) => s?.item === item));
}, item);

test.describe('delve — 手機觸控', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'CDP touch / WebRTC require chromium');
  test.setTimeout(180_000);

  test('單機：按住身邊的土塊挖掉、拿土塊點空格放下、拿劍點一下揮劍', async ({ browser }) => {
    const ctx = await newContext(browser, true);
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await page.goto('/games/delve?seed=touch-e2e&autostart=1&fresh=1');
      await waitGame(page);
      await page.waitForFunction(() => window.__delveDebug!.game.player.onGround, undefined, { timeout: 20000 });
      const cdp = await ctx.newCDPSession(page);
      // 腳邊右側清出一塊平地，右邊第 2 格放一塊土
      const feet = await page.evaluate(() => {
        const g = window.__delveDebug!.game, w = g.world, f = g.feetTile();
        for (let x = f.x - 1; x <= f.x + 4; x++) { for (let y = f.y - 4; y <= f.y; y++) { w.setFg(x, y, 0); w.setLiquid(x, y, 0, 0); } w.setFg(x, f.y + 1, 3); }
        g.give('dirt', 3);
        return f;
      });
      const target = { x: feet.x + 2, y: feet.y };
      await page.evaluate(({ x, y, fg }) => window.__delveDebug!.game.world.setFg(x, y, fg), { ...target, fg: DIRT_FG });
      await page.waitForTimeout(200);

      // 拿鎬按住 → 挖掉
      await selectItem(page, 'wood_pickaxe');
      const at = await tileScreen(page, target);
      expect(at.top).toBe('delve-canvas');
      await touchDown(cdp, at);
      await expect.poll(() => fgAt(page, target), { timeout: 8000 }).toBe(0);
      await touchUp(cdp);

      // 拿土塊點一下 → 放下
      await selectItem(page, 'dirt');
      await tap(page, cdp, await tileScreen(page, target));
      await expect.poll(() => fgAt(page, target), { timeout: 5000 }).toBe(DIRT_FG);

      // 拿劍點一下 → 揮劍（攻擊狀態出現過）
      await selectItem(page, 'wood_sword');
      await page.evaluate(() => {
        const w = window as unknown as { __swung: boolean }, g = window.__delveDebug!.game;
        w.__swung = false;
        const tick = (): void => { if (g.getState().attack) w.__swung = true; else requestAnimationFrame(tick); };
        tick();
      });
      await tap(page, cdp, await tileScreen(page, { x: feet.x + 2, y: feet.y - 1 }));
      await expect.poll(() => page.evaluate(() => (window as unknown as { __swung: boolean }).__swung), { timeout: 5000 }).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test('連線客人用手機：按住身邊的土塊 → 房主端挖掉；拿土塊點空格 → 房主端放下', async ({ browser }) => {
    const ctxHost = await newContext(browser, false);
    const ctxGuest = await newContext(browser, true);
    const host = await ctxHost.newPage();
    const guest = await ctxGuest.newPage();
    const errors: string[] = [];
    host.on('pageerror', (e) => errors.push(`host: ${e.message}`));
    guest.on('pageerror', (e) => errors.push(`guest: ${e.message}`));
    try {
      // 房主開房
      await host.goto('/games/delve?seed=coop-touch-e2e&autostart=1&fresh=1');
      await waitGame(host);
      await host.click('#delve-menu-btn');
      await host.click('#delve-coop');
      await expect(host.locator('#delve-room-chip')).toHaveText(/房號 [A-Z0-9]{5}/, { timeout: 30000 });
      const room = ((await host.locator('#delve-room-chip').innerText()).match(/[A-Z0-9]{5}/) ?? [''])[0];
      await host.keyboard.press('Escape');

      // 客人（手機）加入
      await guest.goto('/games/delve');
      await pressStart(guest);
      await guest.click('#delve-start');
      await expect(guest.locator('#delve-charpanel')).toBeVisible({ timeout: 15000 });
      await guest.click('#delve-newchar-open');
      await guest.fill('#delve-nick', '手機客人');
      await guest.click('#delve-newchar-create');
      await expect(guest.locator('#delve-worldpanel')).toBeVisible();
      await guest.click('#delve-join-open');
      await guest.fill('#delve-room', room);
      await guest.click('#delve-join');
      await guest.waitForFunction(() => window.__delveDebug?.coop?.phase === 'live', undefined, { timeout: 60000 });
      await expect(guest.locator('#delve-root')).toHaveAttribute('data-touch', '1');
      await guest.waitForFunction(() => window.__delveDebug!.game.player.onGround, undefined, { timeout: 20000 });

      // 房主在客人腳邊清出平地、右邊第 2 格放一塊土，給客人一把鐵鎬和一個土塊
      const feet = await guest.evaluate(() => window.__delveDebug!.game.feetTile());
      const guestPid = await guest.evaluate(() => window.__delveDebug!.game.localPid);
      const target = { x: feet.x + 2, y: feet.y };
      await host.evaluate(({ f, pid, fg }) => {
        const g = window.__delveDebug!.game, w = g.world;
        for (let x = f.x - 1; x <= f.x + 4; x++) { for (let y = f.y - 4; y <= f.y; y++) { w.setFg(x, y, 0); w.setLiquid(x, y, 0, 0); } w.setFg(x, f.y + 1, 3); }
        w.setFg(f.x + 2, f.y, fg);
        const a = g.actors.get(pid as never);
        if (!a) throw new Error('host has no actor for guest');
        a.inventory.add('iron_pickaxe', 1);
        a.inventory.add('dirt', 1);
      }, { f: feet, pid: guestPid, fg: DIRT_FG });
      await guest.waitForFunction(({ x, y, fg }) => window.__delveDebug!.game.world.getFg(x, y) === fg, { ...target, fg: DIRT_FG }, { timeout: 15000 });
      await guest.waitForFunction(() => window.__delveDebug!.game.inventory.count('iron_pickaxe') >= 1 && window.__delveDebug!.game.inventory.count('dirt') >= 1, undefined, { timeout: 15000 });
      const cdp = await ctxGuest.newCDPSession(guest);

      // 客人拿鎬按住那格 → 房主端挖掉
      await selectItem(guest, 'iron_pickaxe');
      const at = await tileScreen(guest, target);
      expect(at.top).toBe('delve-canvas');
      await touchDown(cdp, at);
      await expect.poll(() => fgAt(host, target), { timeout: 15000, intervals: [50] }).toBe(0);
      await touchUp(cdp);

      // 方向挖掘：按住的那一下挖掉土塊之後會沿著方向繼續挖（可能挖到它下面的地板）→ 放之前房主把地板補回來（放置要有支撐）
      await host.evaluate((f) => { const w = window.__delveDebug!.game.world; for (let x = f.x - 1; x <= f.x + 4; x++) w.setFg(x, f.y + 1, 3); }, feet);
      // 客人拿土塊點那格 → 房主端放下
      await guest.waitForFunction(({ x, y }) => window.__delveDebug!.game.world.getFg(x, y) === 0, target, { timeout: 15000 });
      await guest.waitForFunction((f) => window.__delveDebug!.game.world.getFg(f.x + 2, f.y + 1) === 3, feet, { timeout: 15000 });
      await selectItem(guest, 'dirt');
      await tap(guest, cdp, await tileScreen(guest, target));
      await expect.poll(() => fgAt(host, target), { timeout: 15000 }).toBe(DIRT_FG);
      expect(errors).toEqual([]);
    } finally {
      await ctxHost.close();
      await ctxGuest.close();
    }
  });
});
