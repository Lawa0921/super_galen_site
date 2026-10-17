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
  // 預設和平模式（不自然生怪），避免怪物干擾挖掘 / 建造測試；戰鬥測試自己用 debug 生怪
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('delve.peaceful', '1'); } catch { /* ignore */ } });
  });

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

  /** tile 中心 → 畫面座標 */
  const tileOnScreen = (page: Page, x: number, y: number): Promise<{ sx: number; sy: number }> => page.evaluate(([x, y]) => {
    const r = window.__delveDebug!.handle.renderer, c = (document.querySelector('#delve-canvas') as HTMLCanvasElement).getBoundingClientRect();
    return { sx: c.left + ((x + 0.5) * 16 - r.drawCam.x) * r.zoom, sy: c.top + ((y + 0.5) * 16 - r.drawCam.y) * r.zoom };
  }, [x, y]);
  const rightClick = async (page: Page, p: { sx: number; sy: number }): Promise<void> => {
    await page.mouse.move(p.sx, p.sy);
    await page.mouse.down({ button: 'right' }); await page.waitForTimeout(120); await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(80);
  };

  test('探索：M 開關全地圖；debug 傳送到小屋 → 發現橫幅 + 日誌「遺跡與建築」+1', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/games/delve?seed=alpha&autostart=1&fresh=1');
    await waitGame(page);
    await expect(page.locator('#delve-minimap')).toBeVisible();
    await page.keyboard.press('KeyM');
    await expect(page.locator('#delve-map')).toBeVisible();
    expect(await page.evaluate(() => window.__delveDebug!.handle.paused)).toBe(true);
    await expect(page.locator('#delve-map-info')).toContainText('標記 0/20');
    await page.keyboard.press('KeyM');
    await expect(page.locator('#delve-map')).toBeHidden();
    // 日誌：先記下「遺跡與建築」的數字
    await page.keyboard.press('KeyJ');
    const count = page.locator('#delve-journal [data-cat="site"] .delve-j-count');
    await expect(count).toBeVisible();
    const before = Number(await count.getAttribute('data-count'));
    await page.keyboard.press('KeyJ');
    await page.evaluate(() => {
      const d = window.__delveDebug!, g = d.game;
      const c = g.structures.find((s: { kind: string; chest?: unknown }) => s.kind === 'cabin' && s.chest);
      g.teleport(c.chest.x + 1, c.chest.y);
      d.handle.renderer.snapCamera();
    });
    await expect(page.locator('#delve-banner')).toHaveClass(/is-on/, { timeout: 5000 });
    await expect(page.locator('#delve-banner-title')).toContainText('發現：');
    await page.keyboard.press('KeyJ');
    await expect.poll(async () => Number(await count.getAttribute('data-count'))).toBe(before + 1);
    expect(errors).toEqual([]);
  });

  test('繩索：右鍵在天花板下放繩、再點繩往下延伸；按住 W 往上爬', async ({ page }) => {
    await page.goto('/games/delve?seed=ropes&autostart=1&fresh=1');
    await waitGame(page);
    const at = await page.evaluate(() => {
      const d = window.__delveDebug!, g = d.game, w = g.world;
      // 造一個 6 寬、8 高的空間，頂上一排石頭
      const t = g.feetTile(), x0 = t.x + 2, top = t.y - 7;
      for (let y = top; y < top + 8; y++) for (let x = x0; x < x0 + 6; x++) { w.setFg(x, y, y === top ? 3 : 0); w.setWall(x, y, 0); }
      for (let x = x0; x < x0 + 6; x++) w.setFg(x, top + 8, 3);
      g.teleport(x0 + 3, top + 7);
      g.give('rope', 30);
      const i = g.inventory.slots.findIndex((s: { item: string } | null) => s?.item === 'rope');
      g.inventory.swap(i, 2); g.selectSlot(2);
      d.handle.renderer.snapCamera();
      return { x: x0 + 3, top };
    });
    await page.waitForTimeout(300);
    const p = await tileOnScreen(page, at.x, at.top + 1);
    for (let k = 0; k < 7; k++) await rightClick(page, p);
    const n = await page.evaluate(([x, top]) => { const w = window.__delveDebug!.game.world; let n = 0; for (let y = top + 1; y < top + 8; y++) if (w.getFg(x, y) === 65) n++; return n; }, [at.x, at.top]);
    expect(n).toBeGreaterThanOrEqual(7);
    const y0 = await page.evaluate(() => window.__delveDebug!.game.player.y);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(500);
    const st = await page.evaluate(() => window.__delveDebug!.game.getState().player);
    await page.keyboard.up('KeyW');
    expect(st.climbing).toBe(true);
    expect(st.y).toBeLessThan(y0 - 32);
  });

  test('床：放床、右鍵設定重生點（提示）；傳送石引導後傳回床邊', async ({ page }) => {
    await page.goto('/games/delve?seed=beds&autostart=1&fresh=1');
    await waitGame(page);
    await page.waitForFunction(() => window.__delveDebug!.game.player.onGround, undefined, { timeout: 10000 });
    const b = await page.evaluate(() => {
      const g = window.__delveDebug!.game, w = g.world, t = g.feetTile();
      const x = t.x + 3, y = t.y;
      for (let k = 0; k < 2; k++) { w.setFg(x + k, y, 0); w.setFg(x + k, y - 1, 0); w.setFg(x + k, y + 1, 3); }
      g.give('bed', 1); g.give('recall_stone', 1);
      const i = g.inventory.slots.findIndex((s: { item: string } | null) => s?.item === 'bed');
      g.inventory.swap(i, 2); g.selectSlot(2);
      return { x, y };
    });
    const p = await tileOnScreen(page, b.x, b.y);
    await rightClick(page, p);
    expect(await page.evaluate(([x, y]) => window.__delveDebug!.game.world.getFg(x, y), [b.x, b.y])).toBe(66);
    await rightClick(page, p);
    await expect(page.locator('#delve-toast')).toContainText('重生點');
    expect(await page.evaluate(() => window.__delveDebug!.game.bed)).toEqual(b);
    // 走遠 → 手持傳送石右鍵 → 引導後回到床頭那格
    await page.evaluate(() => {
      const d = window.__delveDebug!, g = d.game;
      const x = g.spawn.x - 40; g.teleport(x, g.world.surfaceAt(x) - 1); d.handle.renderer.snapCamera();
      const i = g.inventory.slots.findIndex((s: { item: string } | null) => s?.item === 'recall_stone');
      g.inventory.swap(i, 3); g.selectSlot(3);
    });
    await page.waitForTimeout(200);
    await page.mouse.move(640, 200);
    await page.mouse.down({ button: 'right' }); await page.waitForTimeout(100); await page.mouse.up({ button: 'right' });
    await expect.poll(() => page.evaluate(() => window.__delveDebug!.game.feetTile().x), { timeout: 5000 }).toBe(b.x);
  });

  test('存檔 → 重新整理 → 繼續：迷霧、地圖標記（點全地圖放的）、日誌都還在', async ({ page }) => {
    await page.goto('/games/delve?seed=savemap&autostart=1&fresh=1');
    await waitGame(page);
    await page.evaluate(() => {
      const g = window.__delveDebug!.game;
      g.explored.revealDisc(g.spawn.x + 200, g.spawn.y + 50, 20);
      g.discovery.readLore(4);
    });
    await page.keyboard.press('KeyM');
    await expect(page.locator('#delve-map')).toBeVisible();
    await page.mouse.click(400, 380);
    await expect(page.locator('#delve-map-info')).toContainText('標記 1/20');
    await page.keyboard.press('KeyM');
    const before = await page.evaluate(async () => {
      const d = window.__delveDebug!, g = d.game;
      await d.save();
      return { count: g.explored.count, markers: g.markers, disc: g.discovery.toJSON() };
    });
    expect(before.markers.length).toBe(1);
    await page.goto('/games/delve');
    await page.click('#delve-continue');
    await waitGame(page);
    const after = await page.evaluate(() => { const g = window.__delveDebug!.game; return { count: g.explored.count, markers: g.markers, lore: g.discovery.toJSON().lore, found: g.discovery.toJSON().regions }; });
    expect(after.count).toBeGreaterThanOrEqual(before.count);
    expect(after.markers).toEqual(before.markers);
    expect(after.lore).toEqual(before.disc.lore);
    for (const id of before.disc.regions) expect(after.found).toContain(id);
  });

  test('戰鬥：debug 生一隻凝膠團 → 拿劍按住左鍵打死 → 撿到凝膠', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/games/delve?seed=fight&autostart=1&fresh=1');
    await waitGame(page);
    await page.waitForFunction(() => window.__delveDebug!.game.player.onGround, undefined, { timeout: 10000 });
    expect(await page.evaluate(() => window.__delveDebug!.game.getState().peaceful)).toBe(true);
    const t = await page.evaluate(() => {
      const d = window.__delveDebug!, g = d.game, w = g.world, f = g.feetTile();
      for (let x = f.x - 2; x <= f.x + 8; x++) { for (let y = f.y - 6; y <= f.y; y++) w.setFg(x, y, 0); w.setFg(x, f.y + 1, 3); }
      g.give('iron_sword', 1);
      const i = g.inventory.slots.findIndex((s: { item: string } | null) => s?.item === 'iron_sword');
      g.inventory.swap(i, 4); g.selectSlot(4);
      const e = g.spawnEnemy('gel_blob', f.x + 2, f.y);
      return { x: f.x + 2, y: f.y, id: e.id };
    });
    const p = await tileOnScreen(page, t.x, t.y);
    await page.mouse.move(p.sx, p.sy);
    await page.mouse.down();
    await expect.poll(() => page.evaluate((id) => window.__delveDebug!.game.enemies.some((e: { id: number }) => e.id === id), t.id), { timeout: 8000 }).toBe(false);
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.__delveDebug!.game.inventory.count('gel')), { timeout: 8000 }).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__delveDebug!.game.kills.gel_blob)).toBe(1);
    expect(errors).toEqual([]);
  });

  test('裝備：在背包點防具再點裝備格 → getState 防禦增加；點裝備格卸下', async ({ page }) => {
    await page.goto('/games/delve?seed=armor&autostart=1&fresh=1');
    await waitGame(page);
    await page.evaluate(() => { const g = window.__delveDebug!.game; g.give('gold_chestplate', 1); g.give('gold_helmet', 1); });
    expect(await page.evaluate(() => window.__delveDebug!.game.getState().defense)).toBe(0);
    await page.keyboard.press('KeyE');
    await expect(page.locator('#delve-inv')).toBeVisible();
    await page.locator('#delve-inv-grid .delve-slot[data-item="gold_chestplate"]').click();
    await page.locator('#delve-equip .delve-slot[data-equip="body"]').click();
    await expect.poll(() => page.evaluate(() => window.__delveDebug!.game.getState().defense)).toBe(5);
    await page.locator('#delve-inv-grid .delve-slot[data-item="gold_helmet"]').click();
    await page.locator('#delve-equip-btn').click();
    await expect.poll(() => page.evaluate(() => window.__delveDebug!.game.getState().defense)).toBe(8);
    await expect(page.locator('#delve-stats')).toContainText('防禦 8');
    // 滑鼠停在裝備格上 → 道具說明
    await page.locator('#delve-equip .delve-slot[data-equip="body"]').hover();
    await expect(page.locator('#delve-tip')).toContainText('金胸甲');
    await page.locator('#delve-equip .delve-slot[data-equip="head"]').click();
    await expect.poll(() => page.evaluate(() => window.__delveDebug!.game.getState().defense)).toBe(5);
    expect(await page.evaluate(() => window.__delveDebug!.game.inventory.count('gold_helmet'))).toBe(1);
  });

  test('死亡與重生：床設重生點 → 受到致命傷 → 死亡畫面 → 在床邊甦醒、滿血', async ({ page }) => {
    await page.goto('/games/delve?seed=dying&autostart=1&fresh=1');
    await waitGame(page);
    await page.waitForFunction(() => window.__delveDebug!.game.player.onGround, undefined, { timeout: 10000 });
    const bed = await page.evaluate(() => {
      const g = window.__delveDebug!.game, w = g.world, t = g.feetTile();
      const x = t.x - 6, y = w.surfaceAt(x) - 1;
      for (let k = 0; k < 2; k++) { w.setFg(x + k, y, 0); w.setFg(x + k, y + 1, 3); }
      w.setFg(x, y, 66); w.setFg(x + 1, y, 67); g.bed = { x, y };
      g.teleport(t.x + 30, w.surfaceAt(t.x + 30) - 1);
      g.hurtPlayer(9999, g.player.x);
      return { x, y };
    });
    await expect(page.locator('#delve-death')).toBeVisible();
    await expect(page.locator('#delve-death-msg')).toContainText('床邊');
    await expect(page.locator('#delve-death')).toBeHidden({ timeout: 8000 });
    const st = await page.evaluate(() => { const g = window.__delveDebug!.game; return { s: g.getState(), f: g.feetTile() }; });
    expect(st.s.dead).toBe(false);
    expect(st.s.hp).toBe(st.s.maxHp);
    expect(st.f).toEqual(bed);
  });

  test('首領：debug 召喚燈脈守望者 → 血條出現 → debug 傷害擊敗 → 旗標存檔後讀回仍在', async ({ page }) => {
    await page.goto('/games/delve?seed=bossy&autostart=1&fresh=1');
    await waitGame(page);
    await page.evaluate(() => { const g = window.__delveDebug!.game; g.time = 600 * 0.9; g.summonBoss(); });
    await expect(page.locator('#delve-boss')).toBeVisible();
    await expect(page.locator('#delve-boss-name')).toContainText('燈脈守望者');
    await page.evaluate(() => { const g = window.__delveDebug!.game, b = g.bossEnemy(); g.debugDamage(b.id, b.maxHp * 0.6); });
    await expect.poll(() => page.evaluate(() => window.__delveDebug!.game.getState().boss?.phase)).toBe(2);
    await page.waitForTimeout(1600); // 碎籠無敵結束
    await page.evaluate(() => { const g = window.__delveDebug!.game, b = g.bossEnemy(); g.debugDamage(b.id, b.maxHp); });
    await expect(page.locator('#delve-boss')).toBeHidden();
    expect(await page.evaluate(() => window.__delveDebug!.game.getState().bossesDefeated)).toEqual(['lantern_warden']);
    await page.keyboard.press('KeyJ');
    await expect(page.locator('[data-testid="journal-bosses"]')).toContainText('燈脈守望者 ✓');
    await page.evaluate(() => window.__delveDebug!.save());
    await page.goto('/games/delve');
    await page.click('#delve-continue');
    await waitGame(page);
    expect(await page.evaluate(() => window.__delveDebug!.game.getState().bossesDefeated)).toEqual(['lantern_warden']);
  });

  test('選單難度切換：和平 ↔ 一般，切回和平時清掉怪物', async ({ page }) => {
    await page.goto('/games/delve?seed=modes&autostart=1&fresh=1');
    await waitGame(page);
    await page.evaluate(() => { const g = window.__delveDebug!.game, t = g.feetTile(); g.spawnEnemy('gel_blob', t.x + 20, t.y - 3); });
    await page.click('#delve-menu-btn');
    await expect(page.locator('#delve-peaceful')).toContainText('和平');
    await page.click('#delve-peaceful');
    await expect(page.locator('#delve-peaceful')).toContainText('一般');
    expect(await page.evaluate(() => window.__delveDebug!.game.peaceful)).toBe(false);
    await page.click('#delve-peaceful');
    expect(await page.evaluate(() => ({ p: window.__delveDebug!.game.peaceful, n: window.__delveDebug!.game.enemies.length }))).toEqual({ p: true, n: 0 });
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

// ── 液體（水 / 熔岩 / 蜂蜜） ─────────────────────────────────────────
// 測試場蓋在出生點正上方的天空（沒有自然生成的液體）：一塊石地板 + 需要的牆 / 池子。
test.describe('delve liquids', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'canvas sandbox smoke runs on chromium only');
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('delve.peaceful', '1'); } catch { /* ignore */ } });
  });

  /** 在天空蓋測試場：回傳地板列 fy 與左端 x0；玩家站在 (x0+px, fy-1) */
  async function skyArena(page: Page, seed: string, px = 4): Promise<{ x0: number; fy: number }> {
    await page.goto(`/games/delve?seed=${seed}&autostart=1&fresh=1`);
    await waitGame(page);
    return page.evaluate((px) => {
      const g = window.__delveDebug!.game, w = g.world;
      const x0 = g.spawn.x - 20, fy = Math.max(12, g.world.surfaceAt(g.spawn.x) - 24);
      for (let y = fy - 16; y < fy; y++) for (let x = x0 - 2; x < x0 + 44; x++) { w.setFg(x, y, 0); w.setLiquid(x, y, 0, 0); }
      for (let x = x0 - 2; x < x0 + 44; x++) w.setFg(x, fy, 3);
      g.teleport(x0 + px, fy - 1);
      window.__delveDebug!.handle.renderer.snapCamera();
      return { x0, fy };
    }, px);
  }
  const hold = (page: Page, item: string): Promise<void> => page.evaluate((item) => {
    const g = window.__delveDebug!.game;
    g.give(item, 1);
    const i = g.inventory.slots.findIndex((s: { item: string } | null) => s?.item === item);
    g.inventory.swap(i, 0); g.selectSlot(0);
  }, item);
  const rowSum = (page: Page, x0: number, x1: number, y: number): Promise<number> => page.evaluate(([x0, x1, y]) => {
    const w = window.__delveDebug!.game.world;
    let s = 0;
    for (let x = x0; x <= x1; x++) s += w.getLiquid(x, y);
    return s;
  }, [x0, x1, y]);
  /** 用手上的桶子對 (x,y) 按一下「使用」 */
  const useAt = async (page: Page, x: number, y: number): Promise<void> => {
    await page.evaluate(([x, y]) => { const g = window.__delveDebug!.game; g.setAim(x, y); g.setUse(true); }, [x, y]);
    await page.waitForTimeout(150);
    await page.evaluate(() => window.__delveDebug!.game.setUse(false));
  };

  test('倒水桶 → 水流進石盆並靜止；桶子變回空桶', async ({ page }) => {
    const { x0, fy } = await skyArena(page, 'liq-pour', 2);
    // 石盆：x0+5..x0+12，兩側牆高 4
    await page.evaluate(([x0, fy]) => { const w = window.__delveDebug!.game.world; for (let y = fy - 4; y < fy; y++) { w.setFg(x0 + 4, y, 3); w.setFg(x0 + 13, y, 3); } }, [x0, fy]);
    await hold(page, 'water_bucket');
    await useAt(page, x0 + 7, fy - 3);
    expect(await page.evaluate(() => window.__delveDebug!.game.inventory.count('bucket'))).toBe(1);
    // 流下來、攤平、靜止
    await page.waitForFunction(([x0, fy]) => {
      const g = window.__delveDebug!.game, w = g.world;
      let s = 0;
      for (let x = x0 + 5; x <= x0 + 12; x++) s += w.getLiquid(x, fy - 1);
      return s >= 200 && g.liquids.activeCount === 0;
    }, [x0, fy], { timeout: 15000 });
    const vals = await page.evaluate(([x0, fy]) => { const w = window.__delveDebug!.game.world; const v: number[] = []; for (let x = x0 + 5; x <= x0 + 12; x++) v.push(w.getLiquid(x, fy - 1)); return v; }, [x0, fy]);
    expect(Math.max(...vals) - Math.min(...vals)).toBeLessThanOrEqual(3);
  });

  test('挖掉水壩 → 湖水流進另一邊', async ({ page }) => {
    const { x0, fy } = await skyArena(page, 'liq-dam', 23);
    await page.evaluate(([x0, fy]) => {
      const g = window.__delveDebug!.game, w = g.world;
      for (let y = fy - 9; y < fy; y++) { w.setFg(x0 - 1, y, 3); w.setFg(x0 + 20, y, 3); w.setFg(x0 + 40, y, 3); }
      for (let y = fy - 7; y < fy; y++) for (let x = x0; x < x0 + 20; x++) w.setLiquid(x, y, 255, 1);
      g.liquids.settle(100);
    }, [x0, fy]);
    expect(await rowSum(page, x0 + 21, x0 + 39, fy - 1)).toBe(0);
    await hold(page, 'gold_pickaxe');
    for (const y of [fy - 1, fy - 2, fy - 3]) {
      await page.evaluate(([x, y]) => { const g = window.__delveDebug!.game; g.setAim(x, y); g.setMining(true); }, [x0 + 20, y]);
      await page.waitForFunction(([x, y]) => window.__delveDebug!.game.world.getFg(x, y) === 0, [x0 + 20, y], { timeout: 10000 });
      await page.evaluate(() => window.__delveDebug!.game.setMining(false));
    }
    await page.waitForFunction(([x0, fy]) => {
      const w = window.__delveDebug!.game.world;
      let s = 0;
      for (let x = x0 + 21; x < x0 + 40; x++) s += w.getLiquid(x, fy - 1);
      return s > 255 * 10;
    }, [x0, fy], { timeout: 15000 });
  });

  test('游泳：水下呼吸泡泡減少，按住跳往上游', async ({ page }) => {
    const { x0, fy } = await skyArena(page, 'liq-swim', 8);
    await page.evaluate(([x0, fy]) => {
      const g = window.__delveDebug!.game, w = g.world;
      for (let y = fy - 16; y < fy; y++) { w.setFg(x0 + 3, y, 3); w.setFg(x0 + 14, y, 3); }
      for (let y = fy - 14; y < fy; y++) for (let x = x0 + 4; x < x0 + 14; x++) w.setLiquid(x, y, 255, 1);
      g.liquids.settle(50);
      g.teleport(x0 + 8, fy - 1);
    }, [x0, fy]);
    await page.waitForTimeout(2600);
    const st = await page.evaluate(() => window.__delveDebug!.game.getState());
    expect(st.liquid.head).toBe(true);
    expect(st.breath).toBeLessThan(st.maxBreath);
    const y0 = await page.evaluate(() => window.__delveDebug!.game.player.y);
    await page.keyboard.down('Space');
    await page.waitForTimeout(900);
    await page.keyboard.up('Space');
    expect(await page.evaluate(() => window.__delveDebug!.game.player.y)).toBeLessThan(y0 - 4 * 16);
  });

  test('熔岩：受傷而且著火', async ({ page }) => {
    const { x0, fy } = await skyArena(page, 'liq-lava', 2);
    await page.evaluate(([x0, fy]) => {
      const g = window.__delveDebug!.game, w = g.world;
      for (let y = fy - 4; y < fy; y++) { w.setFg(x0 + 9, y, 3); w.setFg(x0 + 16, y, 3); }
      for (let y = fy - 2; y < fy; y++) for (let x = x0 + 10; x < x0 + 16; x++) w.setLiquid(x, y, 255, 2);
      g.teleport(x0 + 12, fy - 1);
    }, [x0, fy]);
    await page.waitForTimeout(500);
    const st = await page.evaluate(() => window.__delveDebug!.game.getState());
    expect(st.hp).toBeLessThan(st.maxHp);
    expect(st.burning).toBeGreaterThan(0);
  });

  test('把水倒在熔岩上 → 變成黑曜石', async ({ page }) => {
    const { x0, fy } = await skyArena(page, 'liq-obsidian', 2);
    await page.evaluate(([x0, fy]) => {
      const w = window.__delveDebug!.game.world;
      for (let y = fy - 4; y < fy; y++) { w.setFg(x0 + 4, y, 3); w.setFg(x0 + 9, y, 3); }
      for (let x = x0 + 5; x < x0 + 9; x++) w.setLiquid(x, fy - 1, 255, 2);
    }, [x0, fy]);
    await hold(page, 'water_bucket');
    await useAt(page, x0 + 6, fy - 4);
    await page.waitForFunction(([x0, fy]) => {
      const w = window.__delveDebug!.game.world;
      for (let x = x0 + 5; x < x0 + 9; x++) if (w.getFg(x, fy - 1) === 47) return true; // T.OBSIDIAN
      return false;
    }, [x0, fy], { timeout: 10000 });
  });

  test('存檔 / 讀檔保留倒出來的水', async ({ page }) => {
    const { x0, fy } = await skyArena(page, 'liq-save', 2);
    await page.evaluate(([x0, fy]) => { const w = window.__delveDebug!.game.world; for (let y = fy - 4; y < fy; y++) { w.setFg(x0 + 4, y, 3); w.setFg(x0 + 10, y, 3); } }, [x0, fy]);
    await hold(page, 'water_bucket');
    await useAt(page, x0 + 7, fy - 3);
    await page.waitForFunction(([x0, fy]) => {
      const g = window.__delveDebug!.game, w = g.world;
      let s = 0;
      for (let x = x0 + 5; x <= x0 + 9; x++) s += w.getLiquid(x, fy - 1);
      return s >= 200 && g.liquids.activeCount === 0;
    }, [x0, fy], { timeout: 15000 });
    const before = await rowSum(page, x0 + 5, x0 + 9, fy - 1);
    await page.evaluate(() => window.__delveDebug!.save());
    await page.goto('/games/delve');
    await expect(page.locator('#delve-continue')).toBeVisible({ timeout: 10000 });
    await page.click('#delve-continue');
    await waitGame(page);
    expect(await page.evaluate(() => window.__delveDebug!.game.seed)).toBe('liq-save');
    expect(await rowSum(page, x0 + 5, x0 + 9, fy - 1)).toBe(before);
  });
});
