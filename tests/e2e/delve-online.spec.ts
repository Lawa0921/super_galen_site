import { test, expect, type Page } from '@playwright/test';

/**
 * DELVE 線上合作雙瀏覽器端到端：兩個 context，房主在遊戲中「開放加入」，客人以 5 碼房號加入，
 * 打真的 /api/signal（e2e server 單程序 MemoryStore）+ 同機 WebRTC。
 * 驗證：雙方 2 名玩家、客人真實輸入放方塊房主端同格變更、房主看到客人名牌、客人離開房間後角色 savedAt > 0。
 */
import type {} from '../../src/scripts/games/delve/render/session';

const DIRT_FG = 1; // engine/tiles.ts T.DIRT

async function pressStart(page: Page): Promise<void> {
  await expect(page.locator('#delve-root')).toHaveAttribute('data-ready', '1');
  await page.locator('#delve-press').click();
  await expect(page.locator('#delve-tmenu')).toBeVisible();
}

async function waitGame(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.__delveDebug?.game), undefined, { timeout: 30000 });
}

/** 在畫面上右鍵 tile (x, y)（按住一下再放開：放置） */
async function rightClickTile(page: Page, t: { x: number; y: number }): Promise<void> {
  const p = await page.evaluate(([x, y]) => {
    const r = window.__delveDebug!.handle.renderer, c = (document.querySelector('#delve-canvas') as HTMLCanvasElement).getBoundingClientRect();
    return { sx: c.left + ((x + 0.5) * 16 - r.drawCam.x) * r.zoom, sy: c.top + ((y + 0.5) * 16 - r.drawCam.y) * r.zoom };
  }, [t.x, t.y]);
  await page.mouse.move(p.sx, p.sy);
  await page.mouse.down({ button: 'right' }); await page.waitForTimeout(120); await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(80);
}

/** IndexedDB 'characters' 裡暱稱是 nick 的角色記錄的 savedAt（沒有 → -1） */
function charSavedAt(page: Page, nick: string): Promise<number> {
  return page.evaluate((nick) => new Promise<number>((ok, bad) => {
    const r = indexedDB.open('delve');
    r.onsuccess = () => {
      const d = r.result, q = d.transaction('characters').objectStore('characters').getAll();
      q.onsuccess = () => {
        const rec = (q.result as { nick: string; savedAt: number }[]).find((x) => x.nick === nick);
        ok(rec ? rec.savedAt : -1);
        d.close();
      };
      q.onerror = () => bad(q.error);
    };
    r.onerror = () => bad(r.error);
  }), nick);
}

test.describe('delve — online co-op', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'WebRTC requires chromium');
  test.setTimeout(180_000);

  test('guest joins host by room code, places a block, host sees it, leaving saves the character', async ({ browser }) => {
    const ctxHost = await browser.newContext();
    const ctxGuest = await browser.newContext();
    for (const ctx of [ctxHost, ctxGuest]) {
      await ctx.addInitScript(() => { try { localStorage.setItem('delve.peaceful', '1'); localStorage.setItem('delve.help.seen', '1'); } catch { /* ignore */ } });
    }
    const host = await ctxHost.newPage();
    const guest = await ctxGuest.newPage();
    const errors: string[] = [];
    host.on('pageerror', (e) => errors.push(`host: ${e.message}`));
    guest.on('pageerror', (e) => errors.push(`guest: ${e.message}`));

    try {
      // 房主：新世界自動開局 → 暫停選單「開放加入」→ 讀房號
      await host.goto('/games/delve?seed=coop-e2e&autostart=1&fresh=1');
      await waitGame(host);
      await host.click('#delve-menu-btn');
      await host.click('#delve-coop');
      await expect(host.locator('#delve-room-chip')).toHaveText(/房號 [A-Z0-9]{5}/, { timeout: 30000 });
      const room = ((await host.locator('#delve-room-chip').innerText()).match(/[A-Z0-9]{5}/) ?? [''])[0];
      expect(room).toMatch(/^[A-Z0-9]{5}$/);
      await host.keyboard.press('Escape'); // 收選單（開著時遊戲暫停輸入）

      // 客人：標題 → 新角色「客人」→ 世界面板「加入朋友的世界」→ 房號 → 加入
      await guest.goto('/games/delve');
      await pressStart(guest);
      await guest.click('#delve-start');
      await expect(guest.locator('#delve-charpanel')).toBeVisible({ timeout: 15000 });
      await guest.click('#delve-newchar-open');
      await expect(guest.locator('#delve-newchar')).toBeVisible();
      await guest.fill('#delve-nick', '客人');
      await guest.click('#delve-newchar-create');
      await expect(guest.locator('#delve-worldpanel')).toBeVisible();
      await guest.click('#delve-join-open');
      await expect(guest.locator('#delve-joinpanel')).toBeVisible();
      await guest.fill('#delve-room', room);
      await guest.click('#delve-join');
      await guest.waitForFunction(() => window.__delveDebug?.coop?.phase === 'live', undefined, { timeout: 60000 });

      // 雙方都看到 2 名玩家（客人的 peer 清單晚到，用輪詢）
      for (const p of [host, guest]) {
        await expect.poll(() => p.evaluate(() => window.__delveDebug?.coop?.players().length ?? 0), { timeout: 30000 }).toBe(2);
      }

      // 房主端有 1 個名牌，文字是「客人」
      await expect(host.locator('.delve-nameplate')).toHaveCount(1, { timeout: 15000 });
      await expect(host.locator('.delve-nameplate')).toHaveText('客人');

      // 等客人站穩，取它的腳邊 tile
      await guest.waitForFunction(() => window.__delveDebug!.game.player.onGround, undefined, { timeout: 20000 });
      const feet = await guest.evaluate(() => window.__delveDebug!.game.feetTile());
      const target = { x: feet.x + 2, y: feet.y };
      const guestPid = await guest.evaluate(() => window.__delveDebug!.game.localPid);

      // 房主端清出客人腳邊右側一塊平地（會同步給客人），並給客人 actor 一個土塊
      await host.evaluate(({ f, pid }) => {
        const g = window.__delveDebug!.game, w = g.world;
        for (let x = f.x - 1; x <= f.x + 4; x++) { for (let y = f.y - 4; y <= f.y; y++) { w.setFg(x, y, 0); w.setLiquid(x, y, 0, 0); } w.setFg(x, f.y + 1, 3); }
        const a = g.actors.get(pid as never);
        if (!a) throw new Error('host has no actor for guest');
        a.inventory.add('dirt', 1);
      }, { f: feet, pid: guestPid });

      // 客人端收到平地與土塊
      await guest.waitForFunction(({ x, y }) => window.__delveDebug!.game.world.getFg(x, y) === 0, target, { timeout: 15000 });
      await guest.waitForFunction(() => window.__delveDebug!.game.inventory.count('dirt') >= 1, undefined, { timeout: 15000 });
      await guest.evaluate(() => {
        const g = window.__delveDebug!.game;
        g.selectSlot(g.inventory.slots.findIndex((s: { item: string } | null) => s?.item === 'dirt'));
      });

      // 客人真實輸入：右鍵放下 → 房主端同一格出現土塊
      await rightClickTile(guest, target);
      await expect.poll(() => host.evaluate(({ x, y }) => window.__delveDebug!.game.world.getFg(x, y), target), { timeout: 15000 }).toBe(DIRT_FG);

      // 客人離開房間 → 回標題；離開時的最後一份 chk 帶新時間寫進 IDB（savedAt 嚴格變大）
      const savedBefore = await charSavedAt(guest, '客人');
      await guest.click('#delve-menu-btn');
      await expect(guest.locator('#delve-to-title')).toHaveText('離開房間');
      await guest.click('#delve-to-title');
      await expect(guest.locator('#delve-tmenu')).toBeVisible({ timeout: 30000 });
      await expect.poll(() => charSavedAt(guest, '客人'), { timeout: 10000 }).toBeGreaterThan(Math.max(savedBefore, 0));

      expect(errors).toEqual([]);
    } finally {
      await ctxHost.close();
      await ctxGuest.close();
    }
  });
});
