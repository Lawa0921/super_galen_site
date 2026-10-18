import { test, expect, type Page } from '@playwright/test';

/**
 * DELVE 深掘 — 2D 沙盒 E2E 煙霧測試（Canvas2D；僅 chromium）。
 * 透過 window.__delveDebug 讀寫引擎狀態。
 */
// window.__delveDebug 的型別宣告在 session.ts（DelveDebug，全域唯一一份）
import type {} from '../../src/scripts/games/delve/render/session';

/** 標題的「按任意鍵開始」→ 選單出現 */
async function pressStart(page: Page): Promise<void> {
  await expect(page.locator('#delve-root')).toHaveAttribute('data-ready', '1');
  await page.locator('#delve-press').click();
  await expect(page.locator('#delve-tmenu')).toBeVisible();
}

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
    await page.addInitScript(() => { try { localStorage.setItem('delve.peaceful', '1'); localStorage.setItem('delve.help.seen', '1'); } catch { /* ignore */ } });
  });

  test('標題 → 新世界 開局，沒有 console 錯誤', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/games/delve');
    await expect(page.locator('#delve-title')).toBeVisible();
    await expect(page.locator('#delve-press')).toBeVisible();
    await expect(page.locator('#delve-tmenu')).toBeHidden();
    await pressStart(page);
    await page.click('#delve-new');
    await expect(page.locator('#delve-newpanel')).toBeVisible();
    await page.fill('#delve-seed', 'title-test');
    await page.click('#delve-create');
    await expect(page.locator('#delve-title')).toBeHidden({ timeout: 15000 });
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
    await pressStart(page);
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
    // 標題「新世界」面板 → 開始 → 詢問 → 取消 → 存檔還在（「繼續」的摘要寫著種子）
    await pressStart(page);
    await expect(page.locator('#delve-continue')).toContainText('keepme', { timeout: 10000 });
    await page.click('#delve-new');
    await page.fill('#delve-seed', 'brandnew');
    await page.click('#delve-create');
    await expect(page.locator('#delve-confirm')).toBeVisible();
    await page.click('#delve-confirm-cancel');
    await expect(page.locator('#delve-continue')).toContainText('keepme');
    // 再按一次 → 覆蓋
    await page.click('#delve-create');
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
      const ch = g.structures.find((s: { kind: string }) => s.kind === 'cabin')!.chest!;
      g.teleport(ch.x + 1, ch.y);
      g.setAim(ch.x, ch.y);
      const slots = g.world.chests.get(g.world.idx(ch.x, ch.y))!;
      return { n: slots.filter((s: unknown) => s).length, first: slots[0] };
    });
    expect(before.n).toBeGreaterThan(0);
    await page.evaluate(() => { const g = window.__delveDebug!.game; g.setUse(true); });
    await expect(page.locator('#delve-chest')).toBeVisible({ timeout: 5000 });
    await page.evaluate(() => window.__delveDebug!.game.setUse(false));
    await expect(page.locator('#delve-inv')).toBeVisible();
    await expect(page.locator('#delve-chest-grid .delve-slot')).toHaveCount(20);
    const has0 = await page.evaluate((it) => window.__delveDebug!.game.inventory.count(it), before.first!.item);
    await page.click('#delve-chest-takeall');
    await expect.poll(() => page.evaluate((it) => window.__delveDebug!.game.inventory.count(it), before.first!.item)).toBeGreaterThan(has0);
    expect(await page.evaluate(() => window.__delveDebug!.game.chestSlots()!.every((s: unknown) => s === null))).toBe(true);
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
    await pressStart(page);
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
      const d = window.__delveDebug!, g = d.game, w = g.world, dg = g.dungeon!;
      const door = (locked ? dg.doors.find((q: { locked: boolean }) => q.locked)
        : dg.doors.find((q: { x: number; y: number; locked: boolean }) => !q.locked && w.getFg(q.x, q.y) === 53 && w.getFg(q.x - 1, q.y + 2) === 0 && w.getFg(q.x - 2, q.y + 2) === 0 && w.isSolid(q.x - 1, q.y + 3)))!;
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
    await pressStart(page);
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
      const c = g.structures.find((s: { kind: string; chest?: unknown }) => s.kind === 'cabin' && s.chest)!;
      g.teleport(c.chest!.x + 1, c.chest!.y);
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
    await pressStart(page);
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
    await page.evaluate(() => { const g = window.__delveDebug!.game, b = g.bossEnemy()!; g.debugDamage(b.id, b.maxHp * 0.6); });
    await expect.poll(() => page.evaluate(() => window.__delveDebug!.game.getState().boss?.phase)).toBe(2);
    await page.waitForTimeout(1600); // 碎籠無敵結束
    await page.evaluate(() => { const g = window.__delveDebug!.game, b = g.bossEnemy()!; g.debugDamage(b.id, b.maxHp); });
    await expect(page.locator('#delve-boss')).toBeHidden();
    expect(await page.evaluate(() => window.__delveDebug!.game.getState().bossesDefeated)).toEqual(['lantern_warden']);
    await page.keyboard.press('KeyJ');
    await expect(page.locator('[data-testid="journal-bosses"]')).toContainText('燈脈守望者 ✓');
    await page.evaluate(() => window.__delveDebug!.save());
    await page.goto('/games/delve');
    await pressStart(page);
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
    await pressStart(page);
    await expect(page.locator('#delve-new')).toBeVisible();
  });
});

// ── 液體（水 / 熔岩 / 蜂蜜） ─────────────────────────────────────────
// 測試場蓋在出生點正上方的天空（沒有自然生成的液體）：一塊石地板 + 需要的牆 / 池子。
test.describe('delve liquids', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'canvas sandbox smoke runs on chromium only');
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('delve.peaceful', '1'); localStorage.setItem('delve.help.seen', '1'); } catch { /* ignore */ } });
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
    g.give(item as never, 1);
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
      const row: number[] = [];
      for (let x = x0 + 5; x <= x0 + 12; x++) { s += w.getLiquid(x, fy - 1); row.push(w.getLiquid(x, fy - 1)); }
      // 這一段靜止了（世界裡的泉水瀑布會一直流，所以不能等全世界 activeCount === 0）
      const key = row.join(','), win = window as unknown as { __lastRow?: string };
      const same = win.__lastRow === key && g.liquids.activeCount < 5000;
      win.__lastRow = key;
      return s >= 200 && same;
    }, [x0, fy], { timeout: 15000, polling: 400 });
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
      const row: number[] = [];
      for (let x = x0 + 5; x <= x0 + 9; x++) { s += w.getLiquid(x, fy - 1); row.push(w.getLiquid(x, fy - 1)); }
      // 這一段靜止了（世界裡的泉水瀑布會一直流，所以不能等全世界 activeCount === 0）
      const key = row.join(','), win = window as unknown as { __lastRow?: string };
      const same = win.__lastRow === key && g.liquids.activeCount < 5000;
      win.__lastRow = key;
      return s >= 200 && same;
    }, [x0, fy], { timeout: 15000, polling: 400 });
    const before = await rowSum(page, x0 + 5, x0 + 9, fy - 1);
    await page.evaluate(() => window.__delveDebug!.save());
    await page.goto('/games/delve');
    await pressStart(page);
    await expect(page.locator('#delve-continue')).toBeVisible({ timeout: 10000 });
    await page.click('#delve-continue');
    await waitGame(page);
    expect(await page.evaluate(() => window.__delveDebug!.game.seed)).toBe('liq-save');
    expect(await rowSum(page, x0 + 5, x0 + 9, fy - 1)).toBe(before);
  });
});

// ── 驗收修正：操作說明、死亡中存檔、首領戰中存檔、手機預設 ─────────────────
test.describe('delve fixes', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'canvas sandbox smoke runs on chromium only');
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('delve.peaceful', '1'); } catch { /* ignore */ } });
  });

  test('操作說明：第一次進遊戲出現並暫停、按「知道了」關掉並記住；選單可再打開', async ({ page }) => {
    await page.goto('/games/delve?seed=helpme&autostart=1&fresh=1');
    await waitGame(page);
    await expect(page.locator('#delve-help')).toBeVisible();
    await expect(page.locator('.delve-help-list--keys')).toBeVisible();
    expect(await page.evaluate(() => window.__delveDebug!.handle.paused)).toBe(true);
    await page.click('#delve-help-close');
    await expect(page.locator('#delve-help')).toBeHidden();
    expect(await page.evaluate(() => window.__delveDebug!.handle.paused)).toBe(false);
    expect(await page.evaluate(() => localStorage.getItem('delve.help.seen'))).toBe('1');
    // 再進遊戲不會出現
    await page.goto('/games/delve?seed=helpme2&autostart=1&fresh=1');
    await waitGame(page);
    await page.waitForTimeout(300);
    await expect(page.locator('#delve-help')).toBeHidden();
    // 選單 → 操作說明；Esc 關掉後遊戲繼續
    await page.click('#delve-menu-btn');
    await page.click('#delve-help-btn');
    await expect(page.locator('#delve-help')).toBeVisible();
    await expect(page.locator('#delve-menu')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.locator('#delve-help')).toBeHidden();
    expect(await page.evaluate(() => window.__delveDebug!.handle.paused)).toBe(false);
  });

  test('死亡中存檔 → 重新整理繼續 → 在床邊活著、死亡掉的錢還在原地', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('delve.help.seen', '1'); } catch { /* ignore */ } });
    await page.goto('/games/delve?seed=deathsave&autostart=1&fresh=1');
    await waitGame(page);
    await page.waitForFunction(() => window.__delveDebug!.game.player.onGround, undefined, { timeout: 10000 });
    const info = await page.evaluate(async () => {
      const d = window.__delveDebug!, g = d.game, w = g.world, t = g.feetTile();
      const bx = t.x + 6, by = t.y;
      for (let k = 0; k < 2; k++) { w.setFg(bx + k, by, 0); w.setFg(bx + k, by - 1, 0); w.setFg(bx + k, by + 1, 3); }
      w.setFg(bx, by, 66); w.setFg(bx + 1, by, 67); // T.BED_HEAD / BED_FOOT
      g.bed = { x: bx, y: by };
      // 走遠一點再死
      const dx = g.spawn.x - 30; g.teleport(dx, w.surfaceAt(dx) - 1);
      g.give('copper_coin', 60);
      g.hurtPlayer(99999, 0);
      const dead = g.dead;
      await d.save();
      return { bed: { x: bx, y: by }, dead, deathX: dx };
    });
    expect(info.dead).toBe(true);
    await page.goto('/games/delve');
    await pressStart(page);
    await expect(page.locator('#delve-continue')).toBeVisible({ timeout: 10000 });
    await page.click('#delve-continue');
    await waitGame(page);
    const st = await page.evaluate(() => {
      const g = window.__delveDebug!.game;
      const coins = g.drops.list.filter((q: { item: string }) => q.item === 'copper_coin');
      return {
        dead: g.dead, f: g.feetTile(), hp: g.getState().hp, max: g.getState().maxHp,
        coins: coins.reduce((a: number, q: { count: number }) => a + q.count, 0),
        coinX: coins.length ? Math.floor((coins[0].body.x + coins[0].body.w / 2) / 16) : null,
        inv: g.inventory.count('copper_coin'),
      };
    });
    expect(st.dead).toBe(false);
    expect(st.f).toEqual(info.bed);
    expect(st.hp).toBe(st.max);
    expect(st.coins).toBe(30);
    expect(st.inv).toBe(30);
    expect(Math.abs((st.coinX ?? 0) - info.deathX)).toBeLessThan(6);
  });

  test('首領戰中存檔 → 讀檔後首領不在、燈芯祭品退還', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('delve.help.seen', '1'); } catch { /* ignore */ } });
    await page.goto('/games/delve?seed=bossrefund&autostart=1&fresh=1');
    await waitGame(page);
    await page.evaluate(async () => {
      const d = window.__delveDebug!, g = d.game;
      g.time = 600 * 0.9; g.summonBoss();
      await d.save();
    });
    await page.goto('/games/delve');
    await pressStart(page);
    await expect(page.locator('#delve-continue')).toBeVisible({ timeout: 10000 });
    await page.click('#delve-continue');
    await waitGame(page);
    const st = await page.evaluate(() => { const g = window.__delveDebug!.game; return { boss: Boolean(g.bossEnemy()), wick: g.inventory.count('wick_offering') }; });
    expect(st.boss).toBe(false);
    expect(st.wick).toBe(1);
    await expect(page.locator('#delve-boss')).toBeHidden();
  });

  test('手機：一載入就是觸控版（data-touch）、觸控版說明、預設每格 ≥ 16 CSS px', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.addInitScript(() => { try { localStorage.setItem('delve.peaceful', '1'); } catch { /* ignore */ } });
    await page.goto('/games/delve');
    await expect(page.locator('#delve-root')).toHaveAttribute('data-touch', '1');
    await page.goto('/games/delve?seed=phone&autostart=1&fresh=1');
    await waitGame(page);
    await expect(page.locator('.delve-help-list--touch')).toBeVisible();
    await expect(page.locator('.delve-help-list--keys')).toBeHidden();
    await page.click('#delve-help-close');
    const tileCss = await page.evaluate(() => 16 * window.__delveDebug!.handle.renderer.zoom);
    expect(tileCss).toBeGreaterThanOrEqual(16);
    await ctx.close();
  });
});

test.describe('delve 曆法 / 天氣', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'canvas sandbox smoke runs on chromium only');
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('delve.peaceful', '1'); localStorage.setItem('delve.help.seen', '1'); } catch { /* ignore */ } });
  });

  test('debug 改日期 / 季節 → HUD 時鐘顯示「第1年 秋 3日 06:4x」；日曆面板有今天 / 明天天氣', async ({ page }) => {
    await page.goto('/games/delve?seed=cal-e2e&autostart=1&fresh=1');
    await waitGame(page);
    await expect(page.locator('#delve-clock-text')).toHaveText(/^第1年 春 1日 0\d:\d\d$/, { timeout: 5000 });
    await page.evaluate(() => window.__delveDebug!.game.setDate({ year: 1, season: 2, day: 3, hour: 6 + 40 / 60 + 0.001 }));
    await expect(page.locator('#delve-clock-text')).toHaveText(/^第1年 秋 3日 06:4\d$/, { timeout: 5000 });
    await page.click('#delve-clock');
    await expect(page.locator('#delve-calendar')).toBeVisible();
    await expect(page.locator('[data-testid="calendar-date"]')).toHaveText('第1年 秋季 第3日');
    await expect(page.locator('[data-testid="calendar-today"]')).toHaveAttribute('data-weather', /^(clear|cloudy|rain|storm|snow|fog)$/);
    await expect(page.locator('[data-testid="calendar-tomorrow"]')).toHaveAttribute('data-weather', /^(clear|cloudy|rain|storm|snow|fog)$/);
    await expect(page.locator('[data-testid="calendar-days"]')).toContainText('17 天');
    await page.click('#delve-calendar-close');
    await expect(page.locator('#delve-calendar')).toBeHidden();
  });

  test('晚上躺上床 → 淡出、睡到隔天日出', async ({ page }) => {
    await page.goto('/games/delve?seed=bed-e2e&autostart=1&fresh=1');
    await waitGame(page);
    await page.waitForFunction(() => window.__delveDebug!.game.player.onGround, undefined, { timeout: 10000 });
    const bed = await page.evaluate(() => {
      const g = window.__delveDebug!.game, f = g.feetTile();
      const bx = f.x + 1, by = f.y;
      for (const x of [bx, bx + 1]) { g.world.setFg(x, by, 0); g.world.setFg(x, by - 1, 0); g.world.setFg(x, by + 1, 3); }
      g.world.setFg(bx, by, 66); g.world.setFg(bx + 1, by, 67);
      g.setDate({ season: 0, day: 2, hour: 22 });
      return { bx, by, day: g.date().dayIndex };
    });
    await page.evaluate(({ bx, by }) => window.__delveDebug!.game.interact(bx, by), bed);
    await page.waitForFunction(() => window.__delveDebug!.game.getState().sleep > 0, undefined, { timeout: 3000 });
    await page.waitForFunction((d) => { const g = window.__delveDebug!.game; return g.date().dayIndex === d + 1 && !g.sleeping; }, bed.day, { timeout: 8000 });
    const st = await page.evaluate(() => { const g = window.__delveDebug!.game; return { night: g.isNight(), hour: g.date().hour, sky: g.skyLevel() }; });
    expect(st.night).toBe(false);
    expect(st.hour).toBeGreaterThanOrEqual(5);
    expect(st.hour).toBeLessThanOrEqual(8);
    await expect(page.locator('#delve-clock-text')).toHaveText(/^第1年 春 3日 0[5-8]:\d\d$/, { timeout: 3000 });
  });

  test('強制下雨 → 畫面上有雨滴粒子、天空光變暗', async ({ page }) => {
    await page.goto('/games/delve?seed=rain-e2e&autostart=1&fresh=1');
    await waitGame(page);
    const clear = await page.evaluate(() => { const g = window.__delveDebug!.game; g.setDate({ season: 0, day: 3, hour: 12 }); g.forceWeather('clear'); return { sky: g.skyLevel(), rgb: Math.max(...g.skyRGB()) }; });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__delveDebug!.handle.renderer.fx.dropCount)).toBe(0);
    await page.evaluate(() => window.__delveDebug!.game.forceWeather('rain'));
    await page.waitForFunction(() => window.__delveDebug!.handle.renderer.fx.dropCount > 30, undefined, { timeout: 5000 });
    const rain = await page.evaluate(() => { const g = window.__delveDebug!.game; return { sky: g.skyLevel(), rgb: Math.max(...g.skyRGB()), w: g.getState().weather }; });
    expect(rain.w).toBe('rain');
    expect(rain.sky).toBeLessThan(clear.sky - 0.15);
    expect(rain.rgb).toBeLessThan(clear.rgb - 0.15);
    await expect(page.locator('#delve-clock')).toHaveAttribute('data-weather', 'rain', { timeout: 3000 });
  });

  test('冬天：森林的湖面結冰，可以走在上面', async ({ page }) => {
    await page.goto('/games/delve?seed=ice-e2e&autostart=1&fresh=1');
    await waitGame(page);
    await page.waitForFunction(() => window.__delveDebug!.game.player.onGround, undefined, { timeout: 10000 });
    // 在玩家右邊挖一個 10 寬 3 深的池子灌滿水（森林）
    const lake = await page.evaluate(() => {
      const g = window.__delveDebug!.game, w = g.world, f = g.feetTile();
      const x0 = f.x + 3, top = f.y + 1;
      for (let x = x0 - 2; x < x0 + 12; x++) { w.biome[x] = 0; for (let y = top - 6; y < top; y++) w.setFg(x, y, 0); w.setFg(x, top, 3); }
      for (let x = x0; x < x0 + 10; x++) for (let y = top; y < top + 3; y++) { w.setFg(x, y, 0); w.setWall(x, y, 0); w.setLiquid(x, y, 255, 1); }
      for (let y = top; y < top + 4; y++) { w.setFg(x0 - 1, y, 3); w.setFg(x0 + 10, y, 3); }
      for (let x = x0; x < x0 + 10; x++) w.setFg(x, top + 3, 3);
      g.setDate({ season: 3, day: 6, hour: 12 });
      return { x0, top, frozen: w.frozen[w.idx(x0 + 5, top)], solid: w.isSolid(x0 + 5, top) };
    });
    expect(lake.frozen).toBe(1);
    expect(lake.solid).toBe(true);
    await page.evaluate(({ x0, top }) => { const g = window.__delveDebug!.game; g.teleport(x0 + 5, top - 1); }, lake);
    await page.waitForTimeout(800);
    const st = await page.evaluate(({ top }) => { const g = window.__delveDebug!.game; return { onGround: g.player.onGround, feet: g.feetTile().y, wet: g.getState().liquid.frac, top }; }, lake);
    expect(st.onGround).toBe(true);
    expect(st.feet).toBe(st.top - 1);
    expect(st.wet).toBe(0);
  });
});

// ── 內容 / 打磨：釣魚、瀑布（液體總量有上限）、首領戰利品 ─────────────────────────
test.describe('delve fishing / waterfalls / furniture', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'canvas sandbox smoke runs on chromium only');
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('delve.peaceful', '1'); localStorage.setItem('delve.help.seen', '1'); } catch { /* ignore */ } });
  });

  test('釣魚：拋竿 → 浮標落水 → debug 強制上鉤 → 按「使用」釣起來（背包 + 日誌釣魚紀錄）', async ({ page }) => {
    await page.goto('/games/delve?seed=fish-e2e&autostart=1&fresh=1');
    await waitGame(page);
    // 天空蓋一個小水池，玩家站在池邊
    const pool = await page.evaluate(() => {
      const g = window.__delveDebug!.game, w = g.world;
      const x0 = g.spawn.x - 20, fy = Math.max(14, w.surfaceAt(g.spawn.x) - 24);
      for (let y = fy - 14; y < fy + 6; y++) for (let x = x0 - 3; x < x0 + 30; x++) { w.setFg(x, y, y >= fy ? 3 : 0); w.setLiquid(x, y, 0, 0); }
      for (let y = fy; y < fy + 4; y++) for (let x = x0 + 6; x < x0 + 24; x++) { w.setFg(x, y, 0); w.setLiquid(x, y, 255, 1); }
      g.teleport(x0 + 3, fy - 1);
      g.give('worm', 5);
      g.give('wood_rod', 1);
      const i = g.inventory.slots.findIndex((s) => s?.item === 'wood_rod');
      g.inventory.swap(i, 0); g.selectSlot(0);
      window.__delveDebug!.handle.renderer.snapCamera();
      g.setAim(x0 + 12, fy - 2);
      g.setUse(true);
      return { x0, fy };
    });
    await page.waitForTimeout(150);
    await page.evaluate(() => window.__delveDebug!.game.setUse(false));
    await expect.poll(() => page.evaluate(() => window.__delveDebug!.game.fishing?.state ?? null), { timeout: 5000 }).toBe('floating');
    expect(await page.evaluate(() => window.__delveDebug!.game.debugForceBite('brook_trout'))).toBe(true);
    await page.evaluate(() => window.__delveDebug!.game.setUse(true));
    await page.waitForTimeout(150);
    await expect.poll(() => page.evaluate(() => window.__delveDebug!.game.inventory.count('brook_trout'))).toBe(1);
    await page.evaluate(() => window.__delveDebug!.game.setUse(false));
    expect(await page.evaluate(() => window.__delveDebug!.game.inventory.count('worm'))).toBe(4);
    await page.keyboard.press('KeyJ');
    await expect(page.locator('[data-testid="journal-fish"]')).toContainText('釣魚紀錄 1 /');
    void pool;
  });

  test('瀑布：世界裡有泉水瀑布在流；跑一段時間液體總量不會一直長', async ({ page }) => {
    await page.goto('/games/delve?seed=falls-e2e&autostart=1&fresh=1');
    await waitGame(page);
    const info = await page.evaluate(() => {
      const g = window.__delveDebug!.game, w = g.world;
      const s = g.springs.find((q) => q.type === 1)!;
      g.teleport(s.drains[0].x, s.drains[0].y - 1);
      window.__delveDebug!.handle.renderer.snapCamera();
      return { n: g.springs.length, spring: w.getFg(s.x, s.y), total: w.liquidTotal() };
    });
    expect(info.n).toBeGreaterThan(3);
    expect(info.spring).toBe(72);
    // 跑大約 12 秒遊戲時間：泉水有出水、有排水；全世界總量的成長有上限
    const samples: number[] = [];
    for (let k = 0; k < 6; k++) {
      await page.waitForTimeout(2000);
      samples.push(await page.evaluate(() => window.__delveDebug!.game.world.liquidTotal()));
    }
    const st = await page.evaluate(() => window.__delveDebug!.game.liquids.springStats());
    expect(st.emitted).toBeGreaterThan(0);
    expect(st.drained).toBeGreaterThan(0);
    expect(samples[5] - samples[2]).toBeLessThan(255 * 60);
    expect(samples[5] - info.total).toBeLessThan(255 * 400);
    // 畫面上有瀑布水柱
    expect(await page.evaluate(() => window.__delveDebug!.handle.renderer.liquidLayer.stats.falls)).toBeGreaterThan(0);
  });

  test('首領戰利品可以放在地上，也可以掛在牆上；拆下來拿回來', async ({ page }) => {
    await page.goto('/games/delve?seed=trophy-e2e&autostart=1&fresh=1');
    await waitGame(page);
    const r = await page.evaluate(() => {
      const g = window.__delveDebug!.game, w = g.world;
      const x0 = g.spawn.x - 20, fy = Math.max(14, w.surfaceAt(g.spawn.x) - 24);
      for (let y = fy - 10; y < fy; y++) for (let x = x0 - 2; x < x0 + 12; x++) { w.setFg(x, y, 0); w.setWall(x, y, 0); w.setLiquid(x, y, 0, 0); }
      for (let x = x0 - 2; x < x0 + 12; x++) w.setFg(x, fy, 3);
      g.teleport(x0 + 2, fy - 1);
      const hold = (): void => { g.give('warden_trophy', 1); const i = g.inventory.slots.findIndex((s) => s?.item === 'warden_trophy'); g.inventory.swap(i, 0); g.selectSlot(0); };
      hold();
      const floor = g.tryPlace(x0 + 5, fy - 1);
      w.setWall(x0 + 5, fy - 5, 3);
      hold();
      const wall = g.tryPlace(x0 + 5, fy - 5);
      window.__delveDebug!.handle.renderer.snapCamera();
      return { floor, wall, a: w.getFg(x0 + 5, fy - 1), b: w.getFg(x0 + 5, fy - 5), x0, fy };
    });
    expect(r.floor).toBe(true);
    expect(r.wall).toBe(true);
    expect(r.a).toBe(80);
    expect(r.b).toBe(80);
    await page.waitForTimeout(300);
    const back = await page.evaluate(({ x0, fy }) => { const g = window.__delveDebug!.game; g.mineInstant(x0 + 5, fy - 5); return g.inventory.count('warden_trophy'); }, r);
    expect(back).toBe(1);
  });
});

// ── 標題畫面：開場、按任意鍵開始、選單鍵盤移動、新世界面板、設定、存檔摘要 ─────────────
test.describe('delve title', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'canvas sandbox smoke runs on chromium only');
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('delve.help.seen', '1'); } catch { /* ignore */ } });
  });

  test('即時背景場景在跑、按任意鍵 → 選單；↑↓ 移動焦點；設定寫入音量 / 縮放 / 自動瞄準', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/games/delve');
    await page.waitForFunction(() => (window.__delveTitle?.perf.frames ?? 0) > 10, undefined, { timeout: 15000 });
    expect(await page.evaluate(() => Boolean(window.__delveDebug))).toBe(false);
    await page.keyboard.press('Enter');
    await expect(page.locator('#delve-tmenu')).toBeVisible();
    await expect(page.locator('#delve-new')).toBeFocused();
    // 新世界 → 角色外觀 → 匯入存檔
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#delve-look')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#delve-import')).toBeFocused();
    await page.keyboard.press('End');
    await expect(page.locator('#delve-back')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#delve-new')).toBeFocused();
    // 設定
    await page.click('#delve-settings-btn');
    await expect(page.locator('#delve-settings')).toBeVisible();
    await page.locator('#delve-vol').fill('30');
    await page.click('#delve-zp-inc');
    await page.click('#delve-aim-pref');
    const st = await page.evaluate(() => ({ v: localStorage.getItem('arcade-sfx-vol'), z: localStorage.getItem('delve.zoom'), a: localStorage.getItem('delve.autoaim'), pub: (window as unknown as { __arcadeAudio?: { sfxVolume: number } }).__arcadeAudio?.sfxVolume }));
    expect(st).toEqual({ v: '0.3', z: '1', a: '1', pub: 0.3 });
    await page.keyboard.press('Escape');
    await expect(page.locator('#delve-settings')).toBeHidden();
    // 新世界面板：骰子給名字、難度切換記住
    await page.click('#delve-new');
    await page.click('#delve-dice');
    expect((await page.locator('#delve-seed').inputValue()).length).toBeGreaterThan(2);
    await page.click('#delve-diff-peaceful');
    await expect(page.locator('#delve-diff-peaceful')).toHaveAttribute('aria-checked', 'true');
    expect(await page.evaluate(() => localStorage.getItem('delve.peaceful'))).toBe('1');
    await page.fill('#delve-seed', 'title-flow');
    await page.click('#delve-create');
    await waitGame(page);
    expect(await page.evaluate(() => ({ s: window.__delveDebug!.game.seed, p: window.__delveDebug!.game.peaceful, aim: window.__delveDebug!.game.autoAim, title: Boolean(window.__delveTitle) }))).toEqual({ s: 'title-flow', p: true, aim: true, title: false });
    expect(errors).toEqual([]);
  });

  test('標題「操作說明」打開說明視窗，Esc 關掉回到選單；選單上 Esc 回到「按任意鍵開始」', async ({ page }) => {
    await page.goto('/games/delve');
    await pressStart(page);
    await page.click('#delve-help-open');
    await expect(page.locator('#delve-help')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#delve-help')).toBeHidden();
    await expect(page.locator('#delve-tmenu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#delve-press')).toBeVisible();
    await expect(page.locator('#delve-tmenu')).toBeHidden();
  });

  test('匯入壞檔：顯示中文說明，不是原始錯誤字串', async ({ page }) => {
    await page.goto('/games/delve');
    await pressStart(page);
    await page.locator('#delve-import-file').setInputFiles({ name: 'bad.delve', mimeType: 'application/octet-stream', buffer: Buffer.from('nope') });
    await expect(page.locator('#delve-title-msg')).toContainText('不是有效的 DELVE 存檔');
    await expect(page.locator('#delve-title-msg')).not.toContainText('too short');
  });

  test('「繼續」顯示存檔摘要（種子、日期、遊玩時間、最深、完成度）', async ({ page }) => {
    await page.goto('/games/delve?seed=summary&autostart=1&fresh=1');
    await waitGame(page);
    await page.evaluate(async () => { const d = window.__delveDebug!, g = d.game; g.setDate({ year: 2, season: 2, day: 5, hour: 9 }); g.tick = 60 * 60 * 61; g.discovery.depthRecord = 88; await d.save(); });
    await page.goto('/games/delve');
    await pressStart(page);
    const sub = page.locator('#delve-continue-sub');
    await expect(sub).toContainText('summary');
    await expect(sub).toContainText('第2年 秋 5日');
    await expect(sub).toContainText('遊玩 1 小時 1 分');
    await expect(sub).toContainText('最深 88 格');
    await expect(sub).toContainText('完成度');
    await expect(page.locator('#delve-export-title')).toBeVisible();
  });

  test('手機直式：沒有橫向捲動、選單按鈕至少 40px 高', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto('/games/delve');
    await expect(page.locator('#delve-root')).toHaveAttribute('data-ready', '1');
    await page.locator('#delve-press').tap();
    await expect(page.locator('#delve-tmenu')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const hs = await page.locator('#delve-tmenu .delve-ti:visible').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    expect(hs.length).toBeGreaterThanOrEqual(4);
    for (const h of hs) expect(h).toBeGreaterThanOrEqual(40);
    await ctx.close();
  });
});

// ── 裝備詞條：掉落稀有度 / 說明 / 分解 / 洗煉 / 存讀檔 ─────────────────
test.describe('delve loot', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'canvas sandbox smoke runs on chromium only');
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('delve.peaceful', '1'); localStorage.setItem('delve.help.seen', '1'); } catch { /* ignore */ } });
  });
  /** 玩家腳下清出一塊平地（x −6..+12），回傳腳底 tile */
  async function flatGround(page: Page): Promise<{ x: number; y: number }> {
    await page.waitForFunction(() => window.__delveDebug!.game.player.onGround, undefined, { timeout: 10000 });
    return page.evaluate(() => {
      const g = window.__delveDebug!.game, w = g.world, f = g.feetTile();
      for (let x = f.x - 6; x <= f.x + 12; x++) { for (let y = f.y - 6; y <= f.y; y++) w.setFg(x, y, 0); w.setFg(x, f.y + 1, 2); }
      return f;
    });
  }

  test('掉落：地上的傳說裝備有稀有度 → 撿起來後快捷欄外框是橙色（data-rarity=4）', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/games/delve?seed=loot-drop&autostart=1&fresh=1');
    await waitGame(page);
    const f = await flatGround(page);
    await page.evaluate(({ x, y }) => { window.__delveDebug!.game.dropGear('gold_sword', 4, x + 2, y - 1); }, f);
    expect(await page.evaluate(() => window.__delveDebug!.game.drops.list.some((d) => d.gear?.rarity === 4))).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__delveDebug!.game.inventory.slots.findIndex((s) => s?.item === 'gold_sword' && s.gear?.rarity === 4)), { timeout: 8000 }).toBeGreaterThanOrEqual(0);
    await expect(page.locator('#delve-hotbar .delve-slot[data-item="gold_sword"]')).toHaveAttribute('data-rarity', '4');
    await expect(page.locator('#delve-toast')).toContainText('獲得傳說裝備');
    // 圖鑑收錄的提示排在後面，不會蓋掉傳說：1.2 秒後仍是傳說那則
    await page.waitForTimeout(1200);
    await expect(page.locator('#delve-toast')).toContainText('傳說');
    expect(errors).toEqual([]);
  });

  test('說明：滑過裝備 → 名稱 / 稀有度 / 詞條；和裝備中的防具比較（綠升紅降）', async ({ page }) => {
    await page.goto('/games/delve?seed=loot-tip&autostart=1&fresh=1');
    await waitGame(page);
    await page.evaluate(() => {
      const g = window.__delveDebug!.game;
      g.giveGear('iron_chestplate', 1, { affixes: [{ id: 'thorned', tier: 2, value: 5 }] });
      g.equipFromInventory(g.inventory.slots.findIndex((s) => s?.item === 'iron_chestplate'));
      g.giveGear('gold_chestplate', 3, { affixes: [{ id: 'hale', tier: 4, value: 20 }, { id: 'gale', tier: 3, value: 8 }, { id: 'glow', tier: 2, value: 20 }] });
    });
    await page.keyboard.press('KeyE');
    const slot = page.locator('#delve-inv-grid .delve-slot[data-item="gold_chestplate"]');
    await expect(slot).toHaveAttribute('data-rarity', '3');
    await slot.hover();
    const tip = page.locator('#delve-tip');
    await expect(tip).toContainText('強健的 金胸甲 · 疾風');
    await expect(tip.locator('.delve-tip-name')).not.toContainText('Gold');
    await expect(tip).toContainText('史詩');
    await expect(tip).toContainText('生命上限 +20');
    await expect(tip).toContainText('比較');
    await expect(tip.locator('.is-up').first()).toContainText('防禦');
    await expect(tip.locator('.is-down')).toContainText('荊棘反傷');
  });

  test('說明：飾品槽滿了 → 和詞條最弱的飾品比較；裝上就換掉那件', async ({ page }) => {
    await page.goto('/games/delve?seed=loot-acc&autostart=1&fresh=1');
    await waitGame(page);
    await page.evaluate(() => {
      const g = window.__delveDebug!.game;
      const hale = (t: number): { id: 'hale'; tier: number; value: number } => ({ id: 'hale', tier: t, value: 5 * t });
      const put: [string, number, number[]][] = [['compass', 3, [3, 3, 3]], ['depth_meter', 2, [2, 2]], ['jump_boots', 1, [1]], ['swift_boots', 3, [4, 4, 4]], ['night_amulet', 2, [2, 3]]];
      for (const [item, r, tiers] of put) {
        g.giveGear(item as 'compass', r, { affixes: tiers.map(hale) });
        g.equipFromInventory(g.inventory.slots.findIndex((s) => s?.item === item));
      }
      g.giveGear('magnet', 2, { affixes: [hale(3), { id: 'gale', tier: 3, value: 8 }] });
    });
    await page.keyboard.press('KeyE');
    const slot = page.locator('#delve-inv-grid .delve-slot[data-item="magnet"]');
    await slot.hover();
    const tip = page.locator('#delve-tip');
    await expect(tip).toContainText('飾品槽已滿');
    await expect(tip.locator('.is-head')).toContainText('跳躍靴');
    await expect(tip.locator('.is-up').first()).toBeVisible();
    // 裝上：換掉的是最弱的跳躍靴（不是第一格的指南針）
    const after = await page.evaluate(() => {
      const g = window.__delveDebug!.game;
      g.equipFromInventory(g.inventory.slots.findIndex((s) => s?.item === 'magnet'));
      return { acc: g.equipment.accessories(), boots: g.inventory.count('jump_boots') };
    });
    expect(after.acc).toContain('magnet');
    expect(after.acc).toContain('compass');
    expect(after.acc).not.toContain('jump_boots');
    expect(after.boots).toBe(1);
  });

  test('分解：鎖定一件 → 「分解所有普通」確認後只分解沒鎖定的、拿到碎晶', async ({ page }) => {
    await page.goto('/games/delve?seed=loot-salvage&autostart=1&fresh=1');
    await waitGame(page);
    await page.evaluate(() => {
      const g = window.__delveDebug!.game;
      for (let i = 0; i < 10; i++) if (!g.inventory.slots[i]) g.inventory.slots[i] = { item: 'stone', count: 1 };
      g.giveGear('copper_sword', 0); g.giveGear('copper_helmet', 0); g.giveGear('wood_bow', 0);
    });
    await page.keyboard.press('KeyE');
    await page.locator('#delve-inv-grid .delve-slot[data-item="copper_helmet"]').click();
    await page.locator('#delve-lock-btn').click();
    await expect(page.locator('#delve-inv-grid .delve-slot[data-item="copper_helmet"]')).toHaveClass(/is-locked/);
    await page.locator('#delve-inv-grid .delve-slot[data-item="copper_helmet"]').click();
    await page.locator('#delve-salvage-all').click();
    await expect(page.locator('#delve-salvage-confirm')).toBeVisible();
    await expect(page.locator('#delve-sc-msg')).toContainText('2 件');
    await page.locator('#delve-sc-ok').click();
    await expect.poll(() => page.evaluate(() => window.__delveDebug!.game.inventory.count('gear_shard'))).toBeGreaterThan(0);
    const left = await page.evaluate(() => { const g = window.__delveDebug!.game; return [g.inventory.count('copper_sword'), g.inventory.count('wood_bow'), g.inventory.count('copper_helmet')]; });
    expect(left).toEqual([0, 0, 1]);
    await expect(page.locator('#delve-mats')).toContainText('碎晶');
  });

  test('洗煉：鐵砧旁打開鍛造台 → 洗煉第一條詞條（換掉、扣碎晶）→ 強化 +1', async ({ page }) => {
    await page.goto('/games/delve?seed=loot-forge&autostart=1&fresh=1');
    await waitGame(page);
    const f = await flatGround(page);
    const ok = await page.evaluate(({ x, y }) => {
      const g = window.__delveDebug!.game;
      g.give('anvil', 1);
      const i = g.inventory.slots.findIndex((s) => s?.item === 'anvil');
      g.inventory.swap(i, 5); g.selectSlot(5);
      const placed = g.tryPlace(x + 2, y);
      g.selectSlot(0);
      g.giveGear('iron_sword', 2, { affixes: [{ id: 'keen', tier: 2, value: 8 }, { id: 'swift', tier: 2, value: 4 }] });
      g.give('gear_shard', 200); g.give('stardust', 20);
      return placed && g.canForge();
    }, f);
    expect(ok).toBe(true);
    await page.keyboard.press('KeyE');
    await page.locator('#delve-inv-grid .delve-slot[data-item="iron_sword"]').click();
    await page.locator('#delve-forge-btn').click();
    await expect(page.locator('#delve-forge')).toBeVisible();
    await expect(page.locator('#delve-forge-station')).toContainText('鐵砧就在旁邊');
    await page.locator('#delve-forge [data-op="reroll"][data-affix="0"]').click();
    const after = await page.evaluate(() => { const g = window.__delveDebug!.game; const s = g.inventory.slots.find((x) => x?.item === 'iron_sword')!; return { ids: s.gear!.affixes.map((a) => a.id), shard: g.inventory.count('gear_shard'), rerolls: s.gear!.rerolls }; });
    expect(after.ids[0]).not.toBe('keen');
    expect(after.ids).toContain('swift');
    expect(after.shard).toBeLessThan(200);
    expect(after.rerolls).toBe(1);
    await page.locator('#delve-forge [data-op="upgrade"]').click();
    await expect.poll(() => page.evaluate(() => window.__delveDebug!.game.inventory.slots.find((x) => x?.item === 'iron_sword')!.gear!.plus)).toBe(1);
    await expect(page.locator('#delve-forge-item')).toContainText('+1');
    // 搬動那把劍（換格）→ 鍛造台追著同一把，不會強化到換過來的東西
    await page.evaluate(() => {
      const g = window.__delveDebug!.game;
      g.giveGear('gold_sword', 1);
      const a = g.inventory.slots.findIndex((x) => x?.item === 'iron_sword'), b = g.inventory.slots.findIndex((x) => x?.item === 'gold_sword');
      g.inventory.swap(a, b);
    });
    await page.locator('#delve-forge [data-op="upgrade"]').click();
    const pl = await page.evaluate(() => { const g = window.__delveDebug!.game; return [g.inventory.slots.find((x) => x?.item === 'iron_sword')!.gear!.plus, g.inventory.slots.find((x) => x?.item === 'gold_sword')!.gear!.plus]; });
    expect(pl).toEqual([2, 0]);
    // 點裝備欄裡的胸甲 → 鍛造台換成處理它（不卸下），強化裝備中的
    await page.evaluate(() => { const g = window.__delveDebug!.game; g.giveGear('iron_chestplate', 2); g.equipFromInventory(g.inventory.slots.findIndex((x) => x?.item === 'iron_chestplate')); });
    await page.locator('#delve-equip .delve-slot[data-equip="body"]').click();
    await expect(page.locator('#delve-forge-item')).toContainText('裝備中');
    await page.locator('#delve-forge [data-op="upgrade"]').click();
    await expect.poll(() => page.evaluate(() => window.__delveDebug!.game.equipment.gearAt('body')?.plus)).toBe(1);
    expect(await page.evaluate(() => window.__delveDebug!.game.equipment.get('body'))).toBe('iron_chestplate');
  });

  test('存檔 → 重新整理 → 繼續：背包與裝備欄的詞條、鎖定、圖鑑都還在', async ({ page }) => {
    await page.goto('/games/delve?seed=loot-save&autostart=1&fresh=1');
    await waitGame(page);
    const before = await page.evaluate(async () => {
      const d = window.__delveDebug!, g = d.game;
      g.giveGear('gold_sword', 4, { affixes: [{ id: 'blazing', tier: 5, value: 30 }, { id: 'stormcall', tier: 5, value: 25 }, { id: 'swift', tier: 4, value: 10 }], plus: 2 });
      g.toggleLock(g.inventory.slots.findIndex((s) => s?.item === 'gold_sword'));
      g.giveGear('iron_greaves', 4, { affixes: [{ id: 'skyleap', tier: 5, value: 1 }, { id: 'gale', tier: 3, value: 8 }] });
      g.equipFromInventory(g.inventory.slots.findIndex((s) => s?.item === 'iron_greaves'));
      g.observeGear();
      await d.save();
      return { sword: g.inventory.slots.find((s) => s?.item === 'gold_sword')!.gear, legs: g.equipment.gearAt('legs'), codex: g.codex.toJSON() };
    });
    await page.goto('/games/delve');
    await pressStart(page);
    await expect(page.locator('#delve-continue')).toBeVisible({ timeout: 10000 });
    await page.click('#delve-continue');
    await waitGame(page);
    const after = await page.evaluate(() => {
      const g = window.__delveDebug!.game;
      return { sword: g.inventory.slots.find((s) => s?.item === 'gold_sword')?.gear, legs: g.equipment.gearAt('legs'), codex: g.codex.toJSON(), djump: g.getState().gear.djump };
    });
    expect(after.sword).toEqual(before.sword);
    expect(after.sword!.locked).toBe(true);
    expect(after.legs).toEqual(before.legs);
    expect(after.codex).toEqual(before.codex);
    expect(after.djump).toBe(1);
  });
});

test.describe('delve 標題流程（生成畫面 / 回到標題）', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'canvas sandbox smoke runs on chromium only');
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('delve.peaceful', '1'); localStorage.setItem('delve.help.seen', '1'); } catch { /* ignore */ } });
  });

  test('生成畫面：地層剖面跟著生成器真的取樣、六個階段依序完成', async ({ page }) => {
    await page.goto('/games/delve');
    await pressStart(page);
    await page.click('#delve-new');
    await page.fill('#delve-seed', 'gen-screen');
    await page.click('#delve-create');
    await expect(page.locator('#delve-gen-phases .delve-gen-phase')).toHaveCount(6);
    await waitGame(page);
    // 生成結束：六個階段都打勾；剖面不是空的（有天空色 #3e74c4 / #5c9ce0 與至少 6 種顏色）
    await expect(page.locator('#delve-gen-phases .delve-gen-phase[data-state="done"]')).toHaveCount(6);
    const px = await page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('#delve-gen-map')!, d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      const set = new Set<string>();
      let alpha = true;
      for (let i = 0; i < d.length; i += 4) { set.add(`${d[i]},${d[i + 1]},${d[i + 2]}`); if (d[i + 3] !== 255) alpha = false; }
      return { w: c.width, h: c.height, colors: set.size, sky: set.has('62,116,196') || set.has('92,156,224'), alpha };
    });
    expect(px).toMatchObject({ w: 280, h: 80, sky: true, alpha: true });
    expect(px.colors).toBeGreaterThan(6);
  });

  /** 遊戲中 Esc → 選單「回到標題」：先存檔、轉場、回到標題選單（「繼續」摘要已更新）；舊的迴圈 / 渲染器 / 音效都收掉 */
  async function backToTitle(page: Page): Promise<void> {
    await page.keyboard.press('Escape');
    await expect(page.locator('#delve-menu')).toBeVisible();
    await page.click('#delve-to-title');
    await expect(page.locator('#delve-root')).toHaveAttribute('data-phase', 'title', { timeout: 15000 });
    await expect(page.locator('#delve-title')).toBeVisible();
    await expect(page.locator('#delve-tmenu')).toBeVisible();
    await expect(page.locator('#delve-menu')).toBeHidden();
    await expect(page.locator('#delve-hud')).toBeHidden();
    await expect(page.locator('#delve-wipe')).toBeHidden({ timeout: 5000 });
  }
  const live = (page: Page): Promise<{ handles: number; scenes: number; sounds: number; loops: number }> =>
    page.evaluate(() => window.__delveLive!());

  test('遊戲 → 回到標題 → 繼續：先存檔、摘要更新、舊迴圈停掉、不重新整理就能繼續', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/games/delve?seed=rt-cont&autostart=1&fresh=1');
    await waitGame(page);
    const spot = await page.evaluate(() => {
      const g = window.__delveDebug!.game, t = g.playerTile();
      const x = t.x + 3, y = t.y + 4;
      g.world.setFg(x, y, 7);
      g.tick = 60 * 60 * 3; // 遊玩 3 分鐘（摘要要顯示新的值，不是開局時的存檔）
      (window as unknown as { __old: unknown }).__old = g;
      return { x, y };
    });
    await expect.poll(() => live(page)).toMatchObject({ handles: 1, scenes: 0, sounds: 2 });
    await backToTitle(page);
    await expect(page.locator('#delve-continue')).toBeVisible();
    await expect(page.locator('#delve-continue-sub')).toContainText('rt-cont');
    await expect(page.locator('#delve-continue-sub')).toContainText('遊玩 3 分鐘');
    await expect(page.locator('#delve-continue')).toBeFocused();
    expect(await page.evaluate(() => Boolean(window.__delveDebug))).toBe(false);
    await expect.poll(() => live(page)).toMatchObject({ handles: 0, scenes: 1, sounds: 1 });
    // 舊的遊戲不再前進（迴圈 / 輸入都停了）
    const t0 = await page.evaluate(() => (window as unknown as { __old: { tick: number } }).__old.tick);
    await page.keyboard.down('d');
    await page.waitForTimeout(400);
    await page.keyboard.up('d');
    expect(await page.evaluate(() => (window as unknown as { __old: { tick: number } }).__old.tick)).toBe(t0);
    // 標題場景在跑
    const f0 = await page.evaluate(() => window.__delveTitle!.perf.frames);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__delveTitle!.perf.frames)).toBeGreaterThan(f0);
    // 繼續：同一個世界、修改的格子還在
    await page.click('#delve-continue');
    await waitGame(page);
    await expect(page.locator('#delve-title')).toBeHidden({ timeout: 15000 });
    expect(await page.evaluate(({ x, y }) => window.__delveDebug!.game.world.getFg(x, y), spot)).toBe(7);
    expect(await page.evaluate(() => window.__delveDebug!.game.seed)).toBe('rt-cont');
    await expect(page.locator('#delve-hotbar .delve-slot')).toHaveCount(10);
    await expect.poll(() => live(page)).toMatchObject({ handles: 1, scenes: 0, sounds: 2, loops: 1 });
    const a = await page.evaluate(() => window.__delveDebug!.game.tick);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__delveDebug!.game.tick)).toBeGreaterThan(a);
    // 再來一輪：還是只有一個迴圈
    await backToTitle(page);
    await page.click('#delve-continue');
    await waitGame(page);
    await expect(page.locator('#delve-hotbar .delve-slot')).toHaveCount(10);
    await expect.poll(() => live(page)).toMatchObject({ handles: 1, scenes: 0, sounds: 2, loops: 1 });
    expect(errors).toEqual([]);
  });

  test('遊戲 → 回到標題 → 新世界（覆蓋確認）→ 換成新種子，沒有重複的迴圈', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/games/delve?seed=rt-old&autostart=1&fresh=1');
    await waitGame(page);
    await backToTitle(page);
    await expect(page.locator('#delve-continue-sub')).toContainText('rt-old');
    await page.click('#delve-new');
    await expect(page.locator('#delve-newpanel')).toBeVisible();
    await page.fill('#delve-seed', 'rt-new');
    await page.click('#delve-create');
    await expect(page.locator('#delve-confirm')).toBeVisible();
    await expect(page.locator('#delve-confirm-msg')).toContainText('rt-old');
    await page.click('#delve-confirm-ok');
    await page.waitForFunction(() => window.__delveDebug?.game.seed === 'rt-new', undefined, { timeout: 30000 });
    await expect(page.locator('#delve-title')).toBeHidden({ timeout: 15000 });
    await expect(page.locator('#delve-hotbar .delve-slot')).toHaveCount(10);
    await expect.poll(() => live(page)).toMatchObject({ handles: 1, scenes: 0, sounds: 2, loops: 1 });
    const a = await page.evaluate(() => window.__delveDebug!.game.tick);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__delveDebug!.game.tick)).toBeGreaterThan(a);
    // 新世界的存檔蓋掉舊的
    await backToTitle(page);
    await expect(page.locator('#delve-continue-sub')).toContainText('rt-new');
    expect(errors).toEqual([]);
  });
});

test.describe('delve 角色外觀 / 紙娃娃 / 攀爬', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'canvas sandbox smoke runs on chromium only');
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('delve.peaceful', '1'); localStorage.setItem('delve.help.seen', '1'); } catch { /* ignore */ } });
  });

  test('標題「角色外觀」→ 換髮型 → 完成；新世界用這個外觀，存檔 → 重新整理 → 繼續後還在', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/games/delve');
    await pressStart(page);
    await page.click('#delve-look');
    const wr = page.locator('#delve-wardrobe');
    await expect(wr).toBeVisible();
    const row = wr.locator('.delve-wr-row[data-key="hair"]');
    await expect(row).toBeFocused();
    const before = Number(await row.getAttribute('data-value'));
    // 鍵盤 → 換一個，再用滑鼠點「下一個」再換一個
    await page.keyboard.press('ArrowRight');
    await row.locator('[data-dir="1"]').click();
    const hair = Number(await row.getAttribute('data-value'));
    expect(hair).not.toBe(before);
    await wr.locator('.delve-wr-row[data-key="hairColor"] [data-dir="1"]').click();
    const hairColor = Number(await wr.locator('.delve-wr-row[data-key="hairColor"]').getAttribute('data-value'));
    await page.click('#delve-wr-done');
    await expect(wr).toBeHidden();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('delve.appearance') ?? '{}'));
    expect(saved.hair).toBe(hair);
    // 標題背景的主角也換了
    await page.waitForFunction(() => Boolean(window.__delveTitle));
    expect(await page.evaluate(() => window.__delveTitle!.game.appearance.hair)).toBe(hair);
    // 新世界
    await page.click('#delve-new');
    await page.fill('#delve-seed', 'look-e2e');
    await page.click('#delve-create');
    await waitGame(page);
    expect(await page.evaluate(() => window.__delveDebug!.game.appearance.hair)).toBe(hair);
    await page.evaluate(() => window.__delveDebug!.save());
    // 預設外觀清掉：讀檔後的外觀要來自存檔本身
    await page.evaluate(() => localStorage.removeItem('delve.appearance'));
    await page.goto('/games/delve');
    await pressStart(page);
    await page.click('#delve-continue');
    await waitGame(page);
    const look = await page.evaluate(() => window.__delveDebug!.game.appearance);
    expect(look.hair).toBe(hair);
    expect(look.hairColor).toBe(hairColor);
    expect(errors).toEqual([]);
  });

  test('遊戲中選單「角色外觀」：Esc 關掉回到選單；隨機 → 完成 → 紙娃娃 key 換了', async ({ page }) => {
    await page.goto('/games/delve?seed=look-menu&autostart=1&fresh=1');
    await waitGame(page);
    await page.waitForTimeout(200);
    const k0 = await page.evaluate(() => window.__delveDebug!.handle.renderer.sprites.dollKey);
    await page.click('#delve-menu-btn');
    await page.click('#delve-look-menu');
    await expect(page.locator('#delve-wardrobe')).toBeVisible();
    await expect(page.locator('#delve-menu')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.locator('#delve-wardrobe')).toBeHidden();
    await expect(page.locator('#delve-menu')).toBeVisible();
    await page.click('#delve-look-menu');
    for (let i = 0; i < 3; i++) await page.click('#delve-wr-random');
    await page.click('#delve-wr-done');
    await page.click('#delve-resume');
    await page.waitForTimeout(250);
    const k1 = await page.evaluate(() => window.__delveDebug!.handle.renderer.sprites.dollKey);
    expect(k1).not.toBe(k0);
  });

  test('紙娃娃：戴頭盔 → 精靈快取 key 換了；外觀欄蓋過防具的樣子；隱藏開關；說明框試穿；存檔後還在', async ({ page }) => {
    await page.goto('/games/delve?seed=doll-e2e&autostart=1&fresh=1');
    await waitGame(page);
    const key = (): Promise<string> => page.evaluate(() => window.__delveDebug!.handle.renderer.sprites.dollKey);
    await page.waitForTimeout(200);
    const k0 = await key();
    await page.evaluate(() => { window.__delveDebug!.game.equip('iron_helmet'); window.__delveDebug!.game.equip('iron_chestplate'); });
    await page.waitForTimeout(200);
    const k1 = await key();
    expect(k1).not.toBe(k0);
    expect(k1).toContain('armor:iron');
    // 背包放一件時裝 → 右鍵 = 放進外觀欄
    await page.evaluate(() => { window.__delveDebug!.game.give('sailor_top', 1); });
    await page.keyboard.press('KeyE');
    await expect(page.locator('#delve-inv')).toBeVisible();
    await page.locator('#delve-inv-grid .delve-slot[data-item="sailor_top"]').click({ button: 'right' });
    await expect(page.locator('#delve-vanity .delve-slot[data-vanity="body"]')).toHaveAttribute('data-item', 'sailor_top');
    const doll = await page.evaluate(() => { const g = window.__delveDebug!.game; return { body: g.doll().look.body?.look, armor: g.equipment.get('body'), def: g.getState().defense }; });
    expect(doll.body).toBe('outfit:sailor');
    expect(doll.armor).toBe('iron_chestplate');
    expect(doll.def).toBeGreaterThan(0);
    await page.waitForTimeout(200);
    const k2 = await key();
    expect(k2).not.toBe(k1);
    await expect(page.locator('#delve-doll')).toHaveAttribute('data-key', k2);
    // 隱藏頭盔：樣子回到沒戴，防禦不變
    await page.click('#delve-hide-row [data-hide="head"]');
    await expect(page.locator('#delve-hide-row [data-hide="head"]')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => window.__delveDebug!.game.doll().look.head)).toBeNull();
    expect(await page.evaluate(() => window.__delveDebug!.game.getState().defense)).toBe(doll.def);
    // 說明框：時裝有「穿上去的樣子」
    await page.evaluate(() => { window.__delveDebug!.game.give('witch_hat', 1); });
    await page.waitForTimeout(150);
    await page.locator('#delve-inv-grid .delve-slot[data-item="witch_hat"]').hover();
    await expect(page.locator('#delve-tip [data-testid="tip-doll"]')).toBeVisible();
    // 存檔 → 讀回：外觀欄與隱藏開關都還在
    await page.evaluate(() => window.__delveDebug!.save());
    await page.goto('/games/delve');
    await pressStart(page);
    await page.click('#delve-continue');
    await waitGame(page);
    const after = await page.evaluate(() => { const g = window.__delveDebug!.game; return { v: g.vanity.get('body'), hide: g.vanity.hide.head }; });
    expect(after).toEqual({ v: 'sailor_top', hide: true });
  });

  test('爬繩：按住 W → climb；放開 → hang；爬到井口 → 攀上邊緣（mantle）站到地面上', async ({ page }) => {
    await page.goto('/games/delve?seed=climb-e2e&autostart=1&fresh=1');
    await waitGame(page);
    const at = await page.evaluate(() => {
      const d = window.__delveDebug!, g = d.game, w = g.world;
      // 3 格寬、13 格深的豎井，中間掛繩；井口兩邊是地面，上面清出空間
      const t = g.feetTile(), cx = t.x + 6, top = t.y - 2;
      for (let y = top - 6; y < top; y++) for (let x = cx - 5; x <= cx + 5; x++) { w.setFg(x, y, 0); w.setWall(x, y, 0); }
      for (let y = top; y < top + 14; y++) for (let x = cx - 5; x <= cx + 5; x++) w.setFg(x, y, Math.abs(x - cx) <= 1 && y < top + 13 ? 0 : 3);
      for (let y = top; y < top + 13; y++) w.setFg(cx, y, 65);
      g.teleport(cx, top + 12);
      d.handle.renderer.snapCamera();
      return { cx, top };
    });
    await page.waitForTimeout(300);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(350);
    expect(await page.evaluate(() => window.__delveDebug!.handle.renderer.playerAnim)).toBe('climb');
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__delveDebug!.handle.renderer.playerAnim)).toBe('hang');
    const seen = new Set<string>();
    await page.keyboard.down('KeyW');
    for (let i = 0; i < 60; i++) {
      seen.add(await page.evaluate(() => window.__delveDebug!.handle.renderer.playerAnim));
      if (await page.evaluate(() => { const p = window.__delveDebug!.game.getState().player; return p.onGround && !p.climbing && !p.mantle; })) break;
      await page.waitForTimeout(40);
    }
    await page.keyboard.up('KeyW');
    expect(seen.has('mantle')).toBe(true);
    const st = await page.evaluate(() => window.__delveDebug!.game.getState().player);
    expect(st.onGround).toBe(true);
    expect(st.climbing).toBe(false);
    expect(st.y + 42).toBeLessThanOrEqual(at.top * 16 + 0.5);
  });

  test('效能：跑來跑去不重烘紙娃娃，換裝才烘一次', async ({ page }) => {
    await page.goto('/games/delve?seed=perf-doll&autostart=1&fresh=1');
    await waitGame(page);
    await page.waitForTimeout(300);
    const bakes = (): Promise<{ sheets: number; arms: number }> => page.evaluate(() => ({ ...window.__delveDebug!.handle.renderer.sprites.bakes }));
    const b0 = await bakes();
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(800);
    await page.keyboard.up('KeyD');
    await page.keyboard.down('KeyA');
    await page.waitForTimeout(500);
    await page.keyboard.up('KeyA');
    const b1 = await bakes();
    expect(b1.sheets).toBe(b0.sheets);
    await page.evaluate(() => window.__delveDebug!.game.equip('gold_helmet'));
    await page.waitForTimeout(200);
    const b2 = await bakes();
    expect(b2.sheets).toBe(b1.sheets + 1);
  });
});

test.describe('delve settlements', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'canvas sandbox smoke runs on chromium only');
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('delve.peaceful', '1'); localStorage.setItem('delve.help.seen', '1'); } catch { /* ignore */ } });
  });

  /** 在玩家右邊整地並蓋 n 間房子（內部 8×5）；skip = 不放的家具；回傳房子 0 的內部左下角與地面 y */
  const village = (page: Page, rooms: number, skip: string[] = []): Promise<{ x: number; gy: number }> => page.evaluate(([rooms, skip]) => {
    const d = window.__delveDebug!, g = d.game, w = g.world, t = g.feetTile();
    g.setDate({ hour: 10 });
    const gy = t.y + 1, x0 = t.x + 3;
    for (let x = x0 - 12; x < x0 + 9 * rooms + 24; x++) {
      for (let y = gy - 12; y < gy; y++) { w.setFg(x, y, 0); w.setWall(x, y, 0); w.setLiquid(x, y, 0, 0); }
      for (let y = gy; y < gy + 3; y++) w.setFg(x, y, 3);
    }
    for (let k = 0; k < rooms; k++) {
      const x = x0 + k * 9, top = gy - 6;
      for (let yy = top; yy < gy; yy++) for (let xx = x - 1; xx <= x + 8; xx++) {
        const edge = yy === top || xx === x - 1 || xx === x + 8;
        if (edge && w.getFg(xx, yy) === 53) continue;
        w.setFg(xx, yy, edge ? 7 : 0);
        if (!edge) w.setWall(xx, yy, 3);
      }
      for (let i = 0; i < 3; i++) w.setFg(x - 1, gy - 1 - i, 53);
      if (!skip.includes('table')) w.setFg(x + 1, gy - 1, 76);
      if (!skip.includes('chair')) w.setFg(x + 2, gy - 1, 77);
      if (!skip.includes('bed')) { w.setFg(x + 4, gy - 1, 66); w.setFg(x + 5, gy - 1, 67); }
      if (!skip.includes('light')) w.setFg(x + 7, top + 1, 10);
      if (k > 0) { w.setFg(x + 6, gy - 1, 24); w.setFg(x + 6, top + 2, 79); w.setFg(x + 3, top + 1, 92); w.setFg(x + 7, gy - 1, 61); }
    }
    g.teleport(x0 + 2, gy - 1);
    d.handle.renderer.snapCamera();
    return { x: x0, gy };
  }, [rooms, skip] as [number, string[]]);
  const tileOnScreen = (page: Page, x: number, y: number): Promise<{ sx: number; sy: number }> => page.evaluate(([x, y]) => {
    const r = window.__delveDebug!.handle.renderer, c = (document.querySelector('#delve-canvas') as HTMLCanvasElement).getBoundingClientRect();
    return { sx: c.left + ((x + 0.5) * 16 - r.drawCam.x) * r.zoom, sy: c.top + ((y + 0.5) * 16 - r.drawCam.y) * r.zoom };
  }, [x, y]);
  const rightClick = async (page: Page, p: { sx: number; sy: number }): Promise<void> => {
    await page.mouse.move(p.sx, p.sy);
    await page.mouse.down({ button: 'right' }); await page.waitForTimeout(120); await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(80);
  };
  const hold = (page: Page, item: string, n = 1): Promise<void> => page.evaluate(([item, n]) => {
    const g = window.__delveDebug!.game;
    g.give(item as never, n as number);
    const i = g.inventory.slots.findIndex((s: { item: string } | null) => s?.item === item);
    g.inventory.swap(i, 1); g.selectSlot(1);
  }, [item, n] as [string, number]);

  test('查房模式：缺床的房間顯示紅色原因；右鍵放床後變成可入住', async ({ page }) => {
    await page.goto('/games/delve?seed=house-e2e&autostart=1&fresh=1');
    await waitGame(page);
    await page.waitForFunction(() => window.__delveDebug!.game.player.onGround, undefined, { timeout: 10000 });
    const h = await village(page, 1, ['bed']);
    await page.keyboard.press('KeyH');
    await expect(page.locator('#delve-house-btn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.delve-room-tag.is-bad')).toContainText('沒有床');
    await hold(page, 'bed');
    await rightClick(page, await tileOnScreen(page, h.x + 4, h.gy - 1));
    expect(await page.evaluate(([x, y]) => window.__delveDebug!.game.world.getFg(x, y), [h.x + 4, h.gy - 1])).toBe(66);
    await expect(page.locator('.delve-room-tag.is-ok')).toContainText('可入住');
    await expect(page.locator('.delve-room-tag.is-bad')).toHaveCount(0);
    await page.keyboard.press('KeyH');
    await expect(page.locator('.delve-room-tag')).toHaveCount(0);
  });

  test('據點：放爐心 → 面板 Lv1；再蓋一間有裝飾的房間 → 升 Lv2（提示 + 面板）', async ({ page }) => {
    await page.goto('/games/delve?seed=settle-e2e&autostart=1&fresh=1');
    await waitGame(page);
    await page.waitForFunction(() => window.__delveDebug!.game.player.onGround, undefined, { timeout: 10000 });
    const h = await village(page, 1);
    await hold(page, 'hearth');
    const hx = h.x + 10;
    await page.evaluate(([x, y]) => { const d = window.__delveDebug!; d.game.teleport(x - 2, y); d.handle.renderer.snapCamera(); }, [hx, h.gy - 1]);
    await page.waitForTimeout(150);
    await rightClick(page, await tileOnScreen(page, hx, h.gy - 1));
    expect(await page.evaluate(() => window.__delveDebug!.game.settle.cores.length)).toBe(1);
    // 放下後按住右鍵會直接打開據點面板；沒開的話按 B
    if (!(await page.locator('#delve-settle').isVisible())) await page.keyboard.press('KeyB');
    await expect(page.locator('#delve-settle')).toBeVisible();
    await expect(page.locator('[data-testid=settle-level]')).toHaveAttribute('data-level', '1');
    await expect(page.locator('[data-testid=settle-needs]')).toContainText('可入住的房間：1 / 2');
    // 第二間（左邊；有箱子、畫、層架、書架、蠟燭）
    await page.evaluate(([x, gy]) => {
      const w = window.__delveDebug!.game.world, top = gy - 6;
      for (let yy = top; yy < gy; yy++) for (let xx = x - 1; xx <= x + 8; xx++) {
        const edge = yy === top || xx === x - 1 || xx === x + 8;
        if (edge && w.getFg(xx, yy) === 53) continue;
        w.setFg(xx, yy, edge ? 7 : 0);
        if (!edge) w.setWall(xx, yy, 3);
      }
      for (let i = 0; i < 3; i++) w.setFg(x - 1, gy - 1 - i, 53);
      for (const [dx, dy, id] of [[1, 0, 76], [2, 0, 77], [4, 0, 66], [5, 0, 67], [7, 4, 10], [6, 0, 24], [6, 3, 79], [3, 4, 92], [7, 0, 61], [1, 1, 59]]) w.setFg(x + dx, gy - 1 - dy, id);
    }, [h.x - 9, h.gy]);
    await expect(page.locator('#delve-toast')).toContainText('據點升級', { timeout: 5000 });
    await expect(page.locator('[data-testid=settle-level]')).toHaveAttribute('data-level', '2', { timeout: 5000 });
    expect(await page.evaluate(() => window.__delveDebug!.game.settlementHere()?.level)).toBe(2);
  });

  test('居民：白天搬進來（提示）→ 右鍵說話開商店 → 用銅幣買火把', async ({ page }) => {
    await page.goto('/games/delve?seed=npc-e2e&autostart=1&fresh=1');
    await waitGame(page);
    await page.waitForFunction(() => window.__delveDebug!.game.player.onGround, undefined, { timeout: 10000 });
    const h = await village(page, 1);
    await page.evaluate(([x, y]) => {
      const g = window.__delveDebug!.game;
      g.world.setFg(x, y, 98); g.settle.found(x, y);
      g.give('copper_coin', 120);
    }, [h.x + 10, h.gy - 1]);
    await expect(page.locator('#delve-toast')).toContainText('搬進了你的據點', { timeout: 15000 });
    expect(await page.evaluate(() => window.__delveDebug!.game.settle.npcs.map((q) => q.kind))).toEqual(['merchant']);
    // 走到她旁邊、右鍵點她
    await page.evaluate(() => {
      const d = window.__delveDebug!, q = d.game.settle.npcs[0];
      d.game.teleport(Math.floor((q.body.x + q.body.w / 2) / 16) + 2, Math.floor((q.body.y + q.body.h - 1) / 16));
      d.handle.renderer.snapCamera();
    });
    await page.waitForTimeout(200);
    const p = await page.evaluate(() => {
      const d = window.__delveDebug!, q = d.game.settle.npcs[0], r = d.handle.renderer, c = (document.querySelector('#delve-canvas') as HTMLCanvasElement).getBoundingClientRect();
      return { sx: c.left + (q.body.x + q.body.w / 2 - r.drawCam.x) * r.zoom, sy: c.top + (q.body.y + q.body.h / 2 - r.drawCam.y) * r.zoom };
    });
    await rightClick(page, p);
    await expect(page.locator('#delve-npc')).toBeVisible();
    await expect(page.locator('[data-testid=npc-line]')).toHaveText(/「.+」/);
    const torches0 = await page.evaluate(() => window.__delveDebug!.game.inventory.count('torch'));
    await page.locator('[data-testid=npc-shop] [data-buy="0"]').click();
    await expect.poll(() => page.evaluate(() => window.__delveDebug!.game.inventory.count('torch'))).toBe(torches0 + 10);
    expect(await page.evaluate(() => window.__delveDebug!.game.coins())).toBeLessThan(120);
    await page.keyboard.press('Escape');
    await expect(page.locator('#delve-npc')).toBeHidden();
  });

  test('存檔 → 重新整理 → 繼續：爐心、居民（還住同一間）與爐心重生點都還在', async ({ page }) => {
    await page.goto('/games/delve?seed=settle-save&autostart=1&fresh=1');
    await waitGame(page);
    await page.waitForFunction(() => window.__delveDebug!.game.player.onGround, undefined, { timeout: 10000 });
    const h = await village(page, 2);
    const before = await page.evaluate(async ([x, y]) => {
      const d = window.__delveDebug!, g = d.game;
      g.world.setFg(x, y, 98); const c = g.settle.found(x, y);
      g.settle.refresh(g.world, true);
      g.debugMoveIn('merchant'); g.debugMoveIn('cook', true);
      g.setSpawnCore(c.id);
      await d.save();
      return { npcs: g.settle.npcs.map((n) => [n.kind, n.home]), spawn: g.respawnPoint(), level: g.settlementHere()?.level };
    }, [h.x + 19, h.gy - 1]);
    expect(before.npcs.length).toBe(2);
    await page.goto('/games/delve');
    await pressStart(page);
    await page.click('#delve-continue');
    await waitGame(page);
    const after = await page.evaluate(() => {
      const g = window.__delveDebug!.game;
      return { npcs: g.settle.npcs.map((n) => [n.kind, n.home]), spawn: g.respawnPoint(), level: g.settlementHere()?.level, cores: g.settle.cores.length };
    });
    expect(after.cores).toBe(1);
    expect(after.npcs).toEqual(before.npcs);
    expect(after.spawn).toEqual(before.spawn);
    expect(after.level).toBe(before.level);
  });
});
