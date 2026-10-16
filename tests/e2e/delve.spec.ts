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

  test('世界 4200×1200、四個生態區在預期位置（地表材料對得上）', async ({ page }) => {
    await page.goto('/games/delve?seed=biomes&autostart=1&fresh=1');
    await waitGame(page);
    const r = await page.evaluate(() => {
      const g = window.__delveDebug!.game, w = g.world;
      const topOf = (x: number): number => { let y = 0; while (y < w.height && ![1, 2, 3, 4, 18, 19, 20, 21, 22, 43].includes(w.fg[y * w.width + x])) y++; return w.fg[y * w.width + x]; };
      return {
        size: [w.width, w.height],
        spawnBiome: w.biomeAt(g.spawn.x),
        segs: g.biomes.map((b: { biome: number; x0: number; x1: number }) => {
          const mid = Math.floor((b.x0 + b.x1) / 2);
          return { biome: b.biome, colBiome: w.biomeAt(mid), top: topOf(mid), x0: b.x0, x1: b.x1 };
        }),
        dz: g.dungeonZone,
      };
    });
    expect(r.size).toEqual([4200, 1200]);
    expect(r.spawnBiome).toBe(0);
    expect(new Set(r.segs.map((s: { biome: number }) => s.biome))).toEqual(new Set([1, 2, 3]));
    const want: Record<number, number[]> = { 1: [4, 18], 2: [19, 20], 3: [21, 22] };
    for (const s of r.segs) {
      expect(s.colBiome).toBe(s.biome);
      expect(want[s.biome]).toContain(s.top);
    }
    expect(r.dz.x0 < 4200 * 0.12 || r.dz.x1 > 4200 * 0.88).toBe(true);
  });

  test('箱子：右鍵開箱 → 面板顯示內容 → 全部拿取', async ({ page }) => {
    await page.goto('/games/delve?seed=chests&autostart=1&fresh=1');
    await waitGame(page);
    const before = await page.evaluate(() => {
      const g = window.__delveDebug!.game;
      const cabin = g.structures.find((s: { kind: string }) => s.kind === 'cabin');
      g.teleport(cabin.chest.x + 1, cabin.chest.y);
      g.setAim(cabin.chest.x, cabin.chest.y);
      const slots = g.world.chests.get(g.world.idx(cabin.chest.x, cabin.chest.y));
      return { n: slots.filter((s: unknown) => s).length, first: slots[0] };
    });
    expect(before.n).toBeGreaterThan(0);
    await page.evaluate(() => { const g = window.__delveDebug!.game; g.setUse(true); });
    await expect(page.locator('#delve-chest')).toBeVisible({ timeout: 5000 });
    await page.evaluate(() => window.__delveDebug!.game.setUse(false));
    await expect(page.locator('#delve-inv')).toBeVisible();
    await expect(page.locator('#delve-chest-grid .delve-slot')).toHaveCount(20);
    const has0 = await page.evaluate((it) => window.__delveDebug!.game.inventory.count(it), before.first.item);
    await page.click('#delve-chest-takeall');
    await expect.poll(() => page.evaluate((it) => window.__delveDebug!.game.inventory.count(it), before.first.item)).toBeGreaterThan(has0);
    expect(await page.evaluate(() => window.__delveDebug!.game.chestSlots().every((s: unknown) => s === null))).toBe(true);
    await page.click('#delve-chest-close');
    await expect(page.locator('#delve-chest')).toBeHidden();
  });

  test('縮放：- / = 改整數倍率、看到的格子數改變，偏好記在 localStorage', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/games/delve?seed=zoom&autostart=1&fresh=1');
    await waitGame(page);
    const view = (): Promise<{ scale: number; w: number }> => page.evaluate(() => {
      const r = window.__delveDebug!.handle.renderer;
      return { scale: r.scale, w: r.viewTiles().w };
    });
    const v0 = await view();
    expect(Number.isInteger(v0.scale)).toBe(true);
    expect(v0.w).toBeGreaterThanOrEqual(60);
    await page.keyboard.press('Equal');
    const v1 = await view();
    expect(v1.scale).toBe(v0.scale + 1);
    expect(v1.w).toBeLessThan(v0.w);
    await page.click('#delve-zoom-out');
    await page.click('#delve-zoom-out');
    const v2 = await view();
    expect(v2.scale).toBe(Math.max(1, v0.scale - 1));
    expect(await page.evaluate(() => localStorage.getItem('delve.zoom'))).toBe(String(v2.scale - v0.scale));
    await page.reload();
    await waitGame(page);
    expect((await view()).scale).toBe(v2.scale);
  });

  test('舊版（生成器 v1）存檔：中文提示 + 開新世界按鈕', async ({ page }) => {
    await page.goto('/games/delve');
    await page.evaluate(async () => {
      // 手工做一個 v1 存檔（format 1、genVersion 1、沒有 chunk）寫進 IndexedDB
      const header = { format: 1, genVersion: 1, seed: 'old', width: 1600, height: 500, time: 0, tick: 0, savedAt: 1, player: { x: 0, y: 0, vx: 0, vy: 0 }, inventory: { slots: [], selected: 0 }, chunks: [] };
      const json = new TextEncoder().encode(JSON.stringify(header));
      const bytes = new Uint8Array(8 + json.length);
      bytes.set([0x44, 0x4c, 0x56, 0x53]);
      new DataView(bytes.buffer).setUint32(4, json.length, true);
      bytes.set(json, 8);
      await new Promise<void>((res, rej) => {
        const req = indexedDB.open('delve', 1);
        req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('saves')) req.result.createObjectStore('saves', { keyPath: 'slot' }); };
        req.onsuccess = () => {
          const tx = req.result.transaction('saves', 'readwrite');
          tx.objectStore('saves').put({ slot: 'main', seed: 'old', savedAt: 1, bytes: bytes.length, data: bytes });
          tx.oncomplete = () => res();
          tx.onerror = () => rej(tx.error);
        };
        req.onerror = () => rej(req.error);
      });
    });
    await page.reload();
    await expect(page.locator('#delve-continue')).toBeVisible({ timeout: 10000 });
    await page.click('#delve-continue');
    await expect(page.locator('#delve-title-msg')).toContainText('舊版地圖產生器');
    await expect(page.locator('#delve-upgrade-new')).toBeVisible();
  });

  test('地城：debug 傳送進地城、右鍵開門、拿地城鑰匙右鍵開上鎖的門（存檔後仍是開的）', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/games/delve?seed=alpha&autostart=1&fresh=1');
    await waitGame(page);
    /** 傳送到門旁（自由區那側）並回傳門中段 tile 在畫面上的座標 */
    const nearDoor = (locked: boolean): Promise<{ x: number; y: number; sx: number; sy: number }> => page.evaluate(async (locked) => {
      const d = window.__delveDebug!, g = d.game, w = g.world, dg = g.dungeon;
      const door = locked ? dg.doors.find((q: { locked: boolean }) => q.locked)
        : dg.doors.find((q: { x: number; y: number; locked: boolean }) => !q.locked && w.getFg(q.x, q.y) === 53 && w.getFg(q.x - 1, q.y + 2) === 0 && w.getFg(q.x - 2, q.y + 2) === 0 && w.isSolid(q.x - 1, q.y + 3));
      // 上鎖的門：站在不屬於上鎖房間的那一側
      let side = -1;
      if (locked) {
        const room = dg.rooms.find((r: { locked: boolean; x: number; w: number }) => r.locked && (door.x === r.x - 1 || door.x === r.x + r.w));
        side = room && door.x === room.x - 1 ? -1 : 1;
      }
      g.teleport(door.x + side * 2, door.y + 2);
      d.handle.renderer.snapCamera();
      await new Promise((r) => setTimeout(r, 400));
      const r = d.handle.renderer, c = (document.querySelector('#delve-canvas') as HTMLCanvasElement).getBoundingClientRect();
      const wx = (door.x + 0.5) * 16, wy = (door.y + 1.5) * 16;
      return { x: door.x, y: door.y, sx: c.left + (wx - r.drawCam.x) * r.zoom, sy: c.top + (wy - r.drawCam.y) * r.zoom };
    }, locked);
    const fg = (x: number, y: number): Promise<number> => page.evaluate(([x, y]) => window.__delveDebug!.game.world.getFg(x, y), [x, y]);
    // 1) 普通的門：右鍵 → 開
    const a = await nearDoor(false);
    expect(await fg(a.x, a.y + 1)).toBe(53);
    await page.mouse.move(a.sx, a.sy);
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(150);
    await page.mouse.up({ button: 'right' });
    await expect.poll(() => fg(a.x, a.y + 1)).toBe(54);
    for (let k = 0; k < 3; k++) expect(await fg(a.x, a.y + k)).toBe(54);
    // 2) 上鎖的門：沒鑰匙右鍵 → 還是鎖著、提示；拿到鑰匙再右鍵 → 開、鑰匙少一把
    const b = await nearDoor(true);
    expect(await fg(b.x, b.y + 1)).toBe(55);
    await page.mouse.move(b.sx, b.sy);
    await page.mouse.down({ button: 'right' }); await page.waitForTimeout(150); await page.mouse.up({ button: 'right' });
    await expect(page.locator('#delve-toast')).toContainText('鑰匙');
    expect(await fg(b.x, b.y + 1)).toBe(55);
    await page.evaluate(() => window.__delveDebug!.game.give('dungeon_key', 2));
    await page.mouse.down({ button: 'right' }); await page.waitForTimeout(150); await page.mouse.up({ button: 'right' });
    await expect.poll(() => fg(b.x, b.y + 1)).toBe(54);
    expect(await page.evaluate(() => window.__delveDebug!.game.inventory.count('dungeon_key'))).toBe(1);
    // 3) 存檔 → 重新整理 → 繼續：兩扇門都還開著
    await page.evaluate(() => window.__delveDebug!.save());
    await page.goto('/games/delve');
    await page.click('#delve-continue');
    await waitGame(page);
    expect(await fg(a.x, a.y + 1)).toBe(54);
    expect(await fg(b.x, b.y + 1)).toBe(54);
    expect(await page.evaluate(() => window.__delveDebug!.game.world.keysUsed)).toBe(1);
    expect(errors).toEqual([]);
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
