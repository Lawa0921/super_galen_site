import { test, expect, type Page } from '@playwright/test';

/**
 * DELVE 1b M1 Task 17 — gen2 開發旗標（?gen2=1 / 0、localStorage 'delve.gen2'）與 session 的新世界 / 讀檔路徑。
 * 旗標只管「新世界用 gen2」與「讀到 v7 世界時烘焙升級」；讀 genVersion 8 的存檔不看旗標。
 */
// window.__delveDebug 的型別宣告在 session.ts（DelveDebug，全域唯一一份）
import type {} from '../../src/scripts/games/delve/render/session';

async function waitGame(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.__delveDebug?.game), undefined, { timeout: 60000 });
}

/** IndexedDB 'saves' 的所有記錄（含 *.bak 備份）：槽名 → 存著的 bytes（gzip） */
function records(page: Page): Promise<Record<string, number[]>> {
  return page.evaluate(() => new Promise<Record<string, number[]>>((ok, bad) => {
    const r = indexedDB.open('delve');
    r.onsuccess = () => {
      const d = r.result, q = d.transaction('saves').objectStore('saves').getAll();
      q.onsuccess = () => {
        ok(Object.fromEntries((q.result as { slot: string; data: Uint8Array }[]).map((x) => [x.slot, [...x.data]])));
        d.close();
      };
      q.onerror = () => bad(q.error);
    };
    r.onerror = () => bad(r.error);
  }));
}

test.describe('delve gen2 旗標', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'canvas sandbox smoke runs on chromium only');
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('delve.peaceful', '1'); localStorage.setItem('delve.help.seen', '1'); } catch { /* ignore */ } });
  });

  test('旗標關閉：新世界仍是 genVersion 7', async ({ page }) => {
    await page.goto('/games/delve?seed=e2e-g1&autostart=1&fresh=1&gen2=0');
    await page.waitForFunction(() => window.__delveDebug?.game);
    expect(await page.evaluate(() => window.__delveDebug!.game.genVersion)).toBe(7);
  });

  test('?gen2=1：新世界走 gen2、能往東走到海', async ({ page }) => {
    await page.goto('/games/delve?seed=e2e-g2&autostart=1&fresh=1&gen2=1');
    await page.waitForFunction(() => window.__delveDebug?.game);
    expect(await page.evaluate(() => window.__delveDebug!.game.genVersion)).toBe(8);
    // 簡報原本用 x 4300：種子 e2e-g2 的第一道海（4200–4889）在 4264–4364 有一座島（biome 0）→ 改用海面上的 4250
    await page.evaluate(() => { const g = window.__delveDebug!.game; g.teleport(4250, 330); });
    await expect.poll(() => page.evaluate(() => window.__delveDebug!.game.world.biomeAt(4250))).toBe(4);
  });

  test('?gen2=1：大地圖模型在走到東方大海後有「東方大海」標籤', async ({ page }) => {
    await page.goto('/games/delve?seed=e2e-map&autostart=1&fresh=1&gen2=1');
    await page.waitForFunction(() => window.__delveDebug?.game);
    expect(await page.evaluate(() => window.__delveDebug!.mapLabels().map((l) => l.name))).not.toContain('東方大海');
    // 第一道東海的海面：由 layout 推算（避開島），不寫死 x
    await page.evaluate(() => {
      const g = window.__delveDebug!.game, L = g.gen2()!.layout, sea = L.landmass(1, 1);
      let x = sea.x0 + 20;
      while (L.regionAt(x)?.kind === 'island') x++;
      g.teleport(x, L.origin.east.seaY - 2);
    });
    await expect.poll(() => page.evaluate(() => window.__delveDebug!.mapLabels().map((l) => l.name))).toContain('東方大海');
  });

  test('genVersion 8 的存檔：旗標關掉也照樣讀得進來（不生成、不是靜默什麼都不做）', async ({ page }) => {
    await page.goto('/games/delve?seed=e2e-g3&autostart=1&fresh=1&gen2=1');
    await waitGame(page);
    const spot = await page.evaluate(async () => {
      const d = window.__delveDebug!, g = d.game, t = g.playerTile();
      g.world.setFg(t.x + 3, t.y - 6, 7); // planks
      await d.save();
      return { x: t.x + 3, y: t.y - 6 };
    });
    // ?gen2=0 清掉旗標；autostart 沒 seed、沒 fresh → 繼續最近的世界（v8）
    await page.goto('/games/delve?autostart=1&gen2=0');
    await waitGame(page);
    expect(await page.evaluate(({ x, y }) => {
      const g = window.__delveDebug!.game;
      return { seed: g.seed, genVersion: g.genVersion, genKind: g.genKind, fg: g.world.getFg(x, y) };
    }, spot)).toEqual({ seed: 'e2e-g3', genVersion: 8, genKind: 'gen2', fg: 7 });
  });

  test('旗標開啟時讀 v7 世界 → 烘焙升級成 genVersion 8（開局的第一次存檔先把原檔備份成 .v7.bak）；之後旗標關掉照樣讀', async ({ page }) => {
    test.setTimeout(120000);
    await page.goto('/games/delve?seed=e2e-g4&autostart=1&fresh=1&gen2=0');
    await waitGame(page);
    const spot = await page.evaluate(async () => {
      const d = window.__delveDebug!, g = d.game, t = g.playerTile();
      g.world.setFg(t.x + 3, t.y - 6, 7);
      await d.save();
      return { x: t.x + 3, y: t.y - 6 };
    });
    // 旗標關閉時讀 v7：照舊（不烘焙、不備份）
    await page.goto('/games/delve?autostart=1');
    await waitGame(page);
    expect(await page.evaluate(() => window.__delveDebug!.game.genKind)).toBe('legacy');
    await page.evaluate(() => window.__delveDebug!.save());
    const v7 = await records(page);
    const slots = Object.keys(v7);
    expect(slots).toHaveLength(1);
    const [slot] = slots;
    // 旗標開啟：烘焙升級；開局的存檔先備份原本的 v7 記錄（bytes 原封）、再寫升級後的世界
    await page.goto('/games/delve?autostart=1&gen2=1');
    await waitGame(page);
    const opened = { seed: 'e2e-g4', genVersion: 8, genKind: 'baked', fg: 7 };
    const state = ({ x, y }: { x: number; y: number }) => {
      const g = window.__delveDebug!.game;
      return { seed: g.seed, genVersion: g.genVersion, genKind: g.genKind, fg: g.world.getFg(x, y) };
    };
    expect(await page.evaluate(state, spot)).toEqual(opened);
    await page.evaluate(() => window.__delveDebug!.save());
    const after = await records(page);
    expect(Object.keys(after).sort()).toEqual([slot, slot + '.v7.bak']);
    expect(after[slot + '.v7.bak']).toEqual(v7[slot]);
    expect(after[slot]).not.toEqual(v7[slot]);
    // 升級過的世界是 genVersion 8：旗標關掉也讀得進來，而且不再烘焙（還是 baked、不會多一份備份）
    await page.goto('/games/delve?autostart=1&gen2=0');
    await waitGame(page);
    expect(await page.evaluate(state, spot)).toEqual(opened);
    await page.evaluate(() => window.__delveDebug!.save());
    expect(Object.keys(await records(page)).sort()).toEqual([slot, slot + '.v7.bak']);
  });
});
