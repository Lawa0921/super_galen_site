import { readFileSync } from 'node:fs';
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

/**
 * 標題選單 →「開始遊戲」→ 角色（newChar：新角色 → 暱稱 → 建立；否則選第一個角色）→ 世界列表「新世界」→ 世界名 → 開始冒險。
 * 呼叫前選單要開著；之後自己 waitGame。
 */
async function newWorldVia(page: Page, seed: string, o: { nick?: string; newChar?: boolean } = {}): Promise<void> {
  await page.click('#delve-start');
  await expect(page.locator('#delve-charpanel')).toBeVisible({ timeout: 15000 });
  if (o.newChar ?? true) {
    await page.click('#delve-newchar-open');
    await expect(page.locator('#delve-newchar')).toBeVisible();
    await page.fill('#delve-nick', o.nick ?? '');
    await page.click('#delve-newchar-create');
  } else {
    await page.locator('#delve-charlist .delve-char-row .delve-char-line').first().click();
  }
  await expect(page.locator('#delve-worldpanel')).toBeVisible();
  await page.click('#delve-new');
  await expect(page.locator('#delve-newpanel')).toBeVisible();
  await page.fill('#delve-seed', seed);
  await page.click('#delve-create');
}

/** 標題選單 →「開始遊戲」→ 新角色 →「更換外觀」：衣櫥打開 */
async function openNewLook(page: Page): Promise<void> {
  await page.click('#delve-start');
  await expect(page.locator('#delve-charpanel')).toBeVisible({ timeout: 15000 });
  await page.click('#delve-newchar-open');
  await expect(page.locator('#delve-newchar')).toBeVisible();
  await page.click('#delve-new-look');
  await expect(page.locator('#delve-wardrobe')).toBeVisible();
}

/** 世界列表裡世界名是 name 的列（點「列的文字」才是選世界；列裡還有匯出 / 刪除鈕） */
const worldRow = (page: Page, name: string) =>
  page.locator('#delve-worldlist .delve-world-row', { has: page.locator('.delve-world-line', { hasText: `「${name}」` }) });
/** 角色列表裡暱稱是 nick 的列 */
const charRow = (page: Page, nick: string) =>
  page.locator('#delve-charlist .delve-char-row', { has: page.locator('.delve-char-line', { hasText: nick }) });

/**
 * 在遊戲頁開資料庫（會立刻升到 v2）之前，於同源的頁面做出一個真正的 v1 資料庫：'main' 槽是 format 9 舊合併存檔。
 * 舊版程式的 saveSlot 寫的是 gzip(serializeGame) + bytes = 壓縮後長度 + 摘要（沒有 charId / format）。回傳存進去的位元組。
 */
async function seedLegacyV9(page: Page): Promise<number[]> {
  const legacy = [...readFileSync('src/scripts/games/delve/save/__fixtures__/format9.delve')];
  await page.goto('/no-such-page-delve-v9');
  const stored = await page.evaluate((raw) => new Promise<number[]>((ok, bad) => {
    const gz = new Response(new Blob([new Uint8Array(raw)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    gz.then((buf) => {
      const data = new Uint8Array(buf);
      const req = indexedDB.open('delve', 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('saves', { keyPath: 'slot' }); };
      req.onsuccess = () => {
        const db = req.result, t = db.transaction('saves', 'readwrite');
        t.objectStore('saves').put({ slot: 'main', seed: 'fixture-v9', savedAt: 1, bytes: data.length, data,
          summary: { seed: 'fixture-v9', time: 0, playSec: 0, depth: 0, completion: 0, peaceful: true } });
        t.oncomplete = () => { db.close(); ok([...data]); };
        t.onerror = () => bad(t.error);
      };
      req.onerror = () => bad(req.error);
    }, bad);
  }), legacy);
  expect(stored.slice(0, 2)).toEqual([0x1f, 0x8b]);
  return stored;
}

/**
 * 遊戲頁已經開過資料庫（v2）之後，直接把舊合併存檔寫進 'main'（= 還沒轉換的舊存檔出現在世界列表裡）。
 * header = 給了就寫一個手工的舊檔頭（沒有 chunk、不壓縮），否則寫 format9 fixture（gzip）。回傳存進去的位元組。
 */
async function injectLegacyMain(page: Page, header?: Record<string, unknown>): Promise<number[]> {
  const raw = header ? null : [...readFileSync('src/scripts/games/delve/save/__fixtures__/format9.delve')];
  return page.evaluate(({ raw, header }) => new Promise<number[]>((ok, bad) => {
    let bytes: Promise<Uint8Array>;
    if (raw) {
      bytes = new Response(new Blob([new Uint8Array(raw)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer().then((b) => new Uint8Array(b));
    } else {
      const json = new TextEncoder().encode(JSON.stringify(header));
      const b = new Uint8Array(8 + json.length);
      b.set([0x44, 0x4c, 0x56, 0x53]);
      new DataView(b.buffer).setUint32(4, json.length, true);
      b.set(json, 8);
      bytes = Promise.resolve(b);
    }
    bytes.then((data) => {
      const seed = String((header as { seed?: string } | null)?.seed ?? 'fixture-v9');
      const req = indexedDB.open('delve');
      req.onsuccess = () => {
        const db = req.result, t = db.transaction('saves', 'readwrite');
        t.objectStore('saves').put({ slot: 'main', seed, savedAt: Date.now(), bytes: data.length, data });
        t.oncomplete = () => { db.close(); ok([...data]); };
        t.onerror = () => bad(t.error);
      };
      req.onerror = () => bad(req.error);
    }, bad);
  }), { raw, header: header ?? null });
}

/** IndexedDB 'saves' 裡世界名是 seed 的世界記錄（不含 *.bak 備份）：{ slot, format, charId, data } */
function worldRecords(page: Page, seed: string): Promise<{ slot: string; format?: number; charId?: string; data: number[] }[]> {
  return page.evaluate((seed) => new Promise((ok, bad) => {
    const r = indexedDB.open('delve');
    r.onsuccess = () => {
      const d = r.result, q = d.transaction('saves').objectStore('saves').getAll();
      q.onsuccess = () => {
        ok((q.result as { slot: string; seed: string; format?: number; charId?: string; data: Uint8Array }[])
          .filter((x) => x.seed === seed && !x.slot.endsWith('.bak'))
          .map((x) => ({ slot: x.slot, format: x.format, charId: x.charId, data: [...x.data] })));
        d.close();
      };
      q.onerror = () => bad(q.error);
    };
    r.onerror = () => bad(r.error);
  }), seed);
}

/** 像素畫布的顯示尺寸：寬高比 = 畫布寬高比、縮放倍率是整數（不被壓扁、像素不糊） */
async function expectCrisp(page: Page, sel: string): Promise<void> {
  const m = await page.locator(sel).first().evaluate((el) => {
    const c = el as HTMLCanvasElement, r = c.getBoundingClientRect(), cs = getComputedStyle(c);
    const bx = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth) + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const by = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth) + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    return { cw: c.width, ch: c.height, dw: r.width - bx, dh: r.height - by };
  });
  expect(m.cw, `${sel} canvas width`).toBeGreaterThan(0);
  const sx = m.dw / m.cw, sy = m.dh / m.ch;
  expect(Math.abs(sx - sy), `${sel} aspect ${JSON.stringify(m)}`).toBeLessThan(0.01);
  expect(Math.abs(sx - Math.round(sx)), `${sel} integer scale ${JSON.stringify(m)}`).toBeLessThan(0.01);
  expect(Math.round(sx), `${sel} scale >= 1`).toBeGreaterThanOrEqual(1);
}

/** 世界 fg 的 FNV-1a 雜湊（中央區 [0, width) × [0, height)，逐格走 getter） */
function worldHash(page: Page): Promise<string> {
  return page.evaluate(() => {
    const w = window.__delveDebug!.game.world;
    let h = 0x811c9dc5;
    for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) { h ^= w.getFg(x, y); h = Math.imul(h, 16777619); }
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
    await newWorldVia(page, 'title-test');
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

  test('無限世界：鏡頭與 chunk 圖跟著走出中央（東邊海上 x 4300、西邊負 x），只烘焙常駐的欄，沒有 console 錯誤', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/games/delve?seed=infinite-e2e&autostart=1&fresh=1');
    await waitGame(page);
    const frames = (n: number): Promise<void> => page.evaluate((n) => new Promise<void>((ok) => {
      let k = 0;
      const f = (): void => { if (++k >= n) ok(); else requestAnimationFrame(f); };
      requestAnimationFrame(f);
    }), n);
    const go = (x: number): Promise<void> => page.evaluate((x) => {
      const d = window.__delveDebug!, g = d.game;
      g.teleport(x, g.world.surfaceAt(x) - 1);
      d.handle.renderer.snapCamera();
    }, x);
    const look = () => page.evaluate(() => {
      const d = window.__delveDebug!, r = d.handle.renderer, w = d.game.world, p = d.game.feetTile();
      const keys = r.cachedChunks().map((k) => w.chunkCoords(k).cx);
      return {
        camX: r.cam.x, vw: r.worldViewW(), bounds: w.bounds,
        res134: w.isResident(134), playerCx: Math.floor(p.x / 32),
        hasPlayerChunk: r.cachedChunks().includes(w.chunkIndex(Math.floor(p.x / 32), Math.floor(p.y / 32))),
        allResident: keys.every((cx) => w.isResident(cx)),
      };
    });
    await go(4300);
    await frames(30);
    const e = await look();
    expect(e.bounds).toBe('infinite');
    expect(e.camX).toBeGreaterThan(4200 * 16 - e.vw);
    expect(e.res134).toBe(true);
    expect(e.hasPlayerChunk).toBe(true);
    expect(e.allResident).toBe(true);
    await go(-300);
    await frames(30);
    const wv = await look();
    expect(wv.camX).toBeLessThan(0);
    expect(wv.playerCx).toBeLessThan(0);
    expect(wv.hasPlayerChunk).toBe(true);
    expect(wv.allResident).toBe(true);
    expect(errors).toEqual([]);
  });

  test('小木船：debug 給船、傳送到東邊海面、右鍵上船 → boating；按住右 2 秒 → 往東開超過 25 格', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/games/delve?seed=infinite-e2e&autostart=1&fresh=1');
    await waitGame(page);
    // 先按住右鍵（使用）：傳到水面上一碰到水就上船
    await page.mouse.move(640, 200);
    await page.mouse.down({ button: 'right' });
    const top = await page.evaluate(() => {
      const d = window.__delveDebug!, g = d.game, x = 4300;
      // 先傳到海上任一點（載入目的地），再找這欄的水面
      g.teleport(x, 100);
      const src = g.world.source as { waterTopAt?(x: number): number | null };
      const top = src.waterTopAt?.(x) ?? -1;
      g.give('boat', 1);
      const i = g.inventory.slots.findIndex((s: { item: string } | null) => s?.item === 'boat');
      g.inventory.swap(i, 3); g.selectSlot(3);
      g.teleport(x, top - 1); d.handle.renderer.snapCamera();
      return top;
    });
    expect(top).toBeGreaterThan(0);
    expect(await page.evaluate((top) => window.__delveDebug!.game.world.getLiquid(4300, top), top)).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => window.__delveDebug!.game.local.boating), { timeout: 5000 }).toBe(true);
    await page.mouse.up({ button: 'right' });
    const x0 = await page.evaluate(() => window.__delveDebug!.game.player.x);
    await page.keyboard.down('d');
    await page.waitForTimeout(2000);
    await page.keyboard.up('d');
    const s = await page.evaluate(() => { const g = window.__delveDebug!.game; return { x: g.player.x, boating: g.local.boating }; });
    expect(s.boating).toBe(true);
    expect((s.x - x0) / 16).toBeGreaterThan(25);
    expect(errors).toEqual([]);
  });

  test('傳送碑：debug 解鎖東境第 1 碑 → 站到出生點碑旁、右鍵打開面板（兩個項目）→ 點東境那顆 → 傳到海的另一邊', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/games/delve?seed=infinite-e2e&autostart=1&fresh=1');
    await waitGame(page);
    const stone = await page.evaluate(() => {
      const d = window.__delveDebug!, g = d.game;
      g.stonesUnlocked.add(1);
      const s = g.waystones.byId(0)!;
      // 碑右邊第 3 欄的地面上（伸手碰得到碑、身體不重疊）
      const x = s.x + 3;
      let y = Math.max(0, s.y - 12);
      while (y < g.world.height && !g.world.isSolid(x, y)) y++;
      g.teleport(x, y - 1); d.handle.renderer.snapCamera();
      return { x: s.x, y: s.y };
    });
    await page.waitForTimeout(300);
    // 瞄準碑身中間那格（footprint = x..x+1、y−2..y）
    const pt = await page.evaluate(({ x, y }) => {
      const d = window.__delveDebug!, r = d.handle.renderer, c = (document.querySelector('#delve-canvas') as HTMLCanvasElement).getBoundingClientRect();
      const p = r.worldToScreen((x + 1) * 16, (y - 0.5) * 16);
      return { x: c.left + p.x, y: c.top + p.y };
    }, stone);
    await page.mouse.move(pt.x, pt.y);
    await page.mouse.down({ button: 'right' });
    await expect(page.locator('#delve-stone')).toBeVisible({ timeout: 5000 });
    await page.mouse.up({ button: 'right' });
    await expect(page.locator('#delve-stone [data-stone]')).toHaveCount(2);
    await expect(page.locator('#delve-stone [data-stone="0"]')).toBeDisabled();
    await page.click('#delve-stone [data-stone="1"]');
    await expect.poll(() => page.evaluate(() => window.__delveDebug!.game.player.x / 16), { timeout: 5000 }).toBeGreaterThan(4200 + 480);
    await expect(page.locator('#delve-stone')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('大地圖（無限世界）：傳到 x −600 走幾步 → 開 M → 玩家附近畫出探索過的地形（不是一片迷霧）；往西拖 → 中心夾在探索範圍、仍看得到地形；mapPins 只有解鎖的傳送碑', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/games/delve?seed=infinite-e2e&autostart=1&fresh=1');
    await waitGame(page);
    await page.evaluate(() => {
      const d = window.__delveDebug!, g = d.game, x = -600;
      g.teleport(x, g.world.surfaceAt(x) - 1); d.handle.renderer.snapCamera();
    });
    await page.keyboard.down('a');
    await page.waitForTimeout(500);
    await page.keyboard.up('a');
    await page.waitForTimeout(300);
    await page.keyboard.press('KeyM');
    await expect(page.locator('#delve-map')).toBeVisible();
    /** 地圖 canvas 上「不是迷霧色、也不是背景」的像素數（中心玩家圖示附近 20 px 不算） */
    const terrain = (): Promise<number> => page.evaluate(() => new Promise<number>((ok) => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const c = document.querySelector<HTMLCanvasElement>('#delve-map-canvas')!, ctx = c.getContext('2d')!;
        const W = c.width, H = c.height, data = ctx.getImageData(0, 0, W, H).data;
        let n = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          if (Math.abs(x - W / 2) < 20 && Math.abs(y - H / 2) < 20) continue;
          const i = (y * W + x) * 4, r = data[i], gg = data[i + 1], b = data[i + 2];
          // 迷霧 #0c0a12 / 迷霧邊 #2c2838
          if ((r === 12 && gg === 10 && b === 18) || (r === 44 && gg === 40 && b === 56)) continue;
          n++;
        }
        ok(n);
      }));
    }));
    await expect.poll(terrain, { timeout: 5000 }).toBeGreaterThan(1000);
    const v0 = await page.evaluate(() => window.__delveDebug!.handle.map.full.view.cx);
    expect(v0).toBeLessThan(-550);
    // 往右拖（地圖往西捲）約 100 格 → 到 x −700 一帶；中心夾在探索範圍內，畫面上仍有地形
    const box = (await page.locator('#delve-map-canvas').boundingBox())!;
    const sx = box.x + box.width / 2, sy = box.y + box.height / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    for (let k = 1; k <= 10; k++) await page.mouse.move(sx + k * 30, sy);
    await page.mouse.up();
    const after = await page.evaluate(() => {
      const d = window.__delveDebug!;
      const v = d.handle.map.full.view, c = document.querySelector<HTMLCanvasElement>('#delve-map-canvas')!;
      return { cx: v.cx, halfW: c.width / 2 / v.scale, ext: d.handle.map.pages.exploredExtent() };
    });
    expect(after.cx).toBeLessThan(v0 - 10);
    expect(after.ext).not.toBeNull();
    expect(after.cx).toBeGreaterThanOrEqual(after.ext!.x0);
    // x −700 在畫面內（中心左邊半個畫面以內）
    expect(after.cx - after.halfW).toBeLessThanOrEqual(-700);
    expect(await terrain()).toBeGreaterThan(1000);
    await page.keyboard.press('KeyM');
    // 傳送碑：解鎖東境第 1 碑 → mapPins 有它（waystone 圖示、名字），沒解鎖的西境第 1 碑沒有
    const pins = await page.evaluate(() => {
      const d = window.__delveDebug!;
      d.game.stonesUnlocked.add(1);
      return d.mapPins();
    });
    const stones = pins.filter((p) => p.icon === 'waystone');
    expect(stones.map((p) => p.name)).toContain('東境第 1 碑');
    expect(stones.map((p) => p.name)).toContain('出生地傳送碑');
    expect(stones.map((p) => p.name)).not.toContain('西境第 1 碑');
    expect(stones.length).toBe(2);
    expect(errors).toEqual([]);
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

  test('已有存檔時新世界另開存檔槽（不再詢問覆蓋）：舊世界仍在列表；autostart 只給 seed 也是新世界、什麼都不給才繼續', async ({ page }) => {
    await page.goto('/games/delve?seed=keepme&autostart=1&fresh=1');
    await waitGame(page);
    await page.evaluate(() => window.__delveDebug!.save());
    // autostart + seed（沒 fresh=1）：直接開新世界，不詢問、不覆蓋
    await page.goto('/games/delve?seed=other&autostart=1');
    await waitGame(page);
    await expect(page.locator('#delve-confirm')).toBeHidden();
    expect(await page.evaluate(() => window.__delveDebug!.game.seed)).toBe('other');
    await page.evaluate(() => window.__delveDebug!.save());
    // 標題：用既有角色建新世界 → 直接開局（沒有覆蓋確認）
    await page.goto('/games/delve');
    await pressStart(page);
    await expect(page.locator('#delve-continue')).toContainText('other', { timeout: 10000 });
    await newWorldVia(page, 'brandnew', { newChar: false });
    await waitGame(page);
    await expect(page.locator('#delve-confirm')).toBeHidden();
    expect(await page.evaluate(() => window.__delveDebug!.game.seed)).toBe('brandnew');
    await page.evaluate(() => window.__delveDebug!.save());
    // 舊世界都還在列表（三個世界各自的存檔槽）
    await page.goto('/games/delve');
    await pressStart(page);
    await page.click('#delve-start');
    await page.locator('#delve-charlist .delve-char-row .delve-char-line').first().click();
    await expect(page.locator('#delve-worldpanel')).toBeVisible();
    await expect(page.locator('#delve-worldlist .delve-world-row')).toHaveCount(3);
    for (const name of ['keepme', 'other', 'brandnew']) await expect(worldRow(page, name)).toHaveCount(1);
    // autostart 沒 seed、沒 fresh=1：繼續最近存檔的世界
    await page.goto('/games/delve?autostart=1');
    await waitGame(page);
    expect(await page.evaluate(() => window.__delveDebug!.game.seed)).toBe('brandnew');
  });

  test('世界 4200×1200、四個生態區在預期位置（地表材料對得上）', async ({ page }) => {
    await page.goto('/games/delve?seed=biomes&autostart=1&fresh=1');
    await waitGame(page);
    const r = await page.evaluate(() => {
      const g = window.__delveDebug!.game, w = g.world;
      const topOf = (x: number): number => { let y = 0; while (y < w.height && ![1, 2, 3, 4, 18, 19, 20, 21, 22, 43].includes(w.getFg(x, y))) y++; return w.getFg(x, y); };
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
    // 舊世界一定有地城保留區（gen2 世界才是 null）
    expect(r.dz).not.toBeNull();
    expect(r.dz!.x0 < 4200 * 0.12 || r.dz!.x1 > 4200 * 0.88).toBe(true);
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
        // 不指定版本：頁面已用目前版本（v2）開過資料庫，指定 1 會 VersionError
        const req = indexedDB.open('delve');
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

  test('資料庫升級被別的分頁擋住（舊版程式開著 v1 連線不讓）：標題顯示原因、不會卡住；關掉那個分頁再重新整理 → 正常，存檔還在', async ({ page, context }) => {
    // 分頁 A：在遊戲頁開資料庫之前，用 v1 開著連線（有一筆存檔）且不處理 versionchange（= 舊版程式）
    const a = await context.newPage();
    await a.goto('/no-such-page-delve-blocked');
    await a.evaluate(() => new Promise<void>((res, rej) => {
      const req = indexedDB.open('delve', 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('saves', { keyPath: 'slot' }); };
      req.onsuccess = () => {
        const db = req.result;
        (window as unknown as { heldDb: IDBDatabase }).heldDb = db;
        const tx = db.transaction('saves', 'readwrite');
        const data = new Uint8Array([0x44, 0x4c, 0x56, 0x53, 0, 0, 0, 0]);
        tx.objectStore('saves').put({ slot: 'main', seed: 'held', savedAt: 1, bytes: data.length, data });
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      };
      req.onerror = () => rej(req.error);
    }));
    // 分頁 B：遊戲頁要升級到 v2 → 被擋住
    await page.goto('/games/delve');
    await pressStart(page);
    await expect(page.locator('#delve-title-msg')).toContainText('請關閉其他開著 DELVE 的分頁後重新整理', { timeout: 10000 });
    await expect(page.locator('#delve-continue')).toBeHidden();
    // 關掉 A → 重新整理 B：升級完成、看得到原本的存檔
    await a.close();
    await page.reload();
    await pressStart(page);
    await expect(page.locator('#delve-continue')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#delve-title-msg')).not.toContainText('請關閉其他開著 DELVE 的分頁');
    const stores = await page.evaluate(() => new Promise<string[]>((res) => {
      const req = indexedDB.open('delve');
      req.onsuccess = () => { const names = Array.from(req.result.objectStoreNames); req.result.close(); res(names); };
    }));
    expect(stores).toEqual(['characters', 'saves']);
  });

  test('舊存檔（format 9、DB v1）自動遷移：角色 + 世界 + main.v9.bak，內容不變', async ({ page }) => {
    const stored = await seedLegacyV9(page);
    await page.goto('/games/delve');
    await pressStart(page);
    await page.click('#delve-continue');
    await waitGame(page);
    const g1 = await page.evaluate(() => {
      const g = window.__delveDebug!.game;
      return { seed: g.seed, sword: g.inventory.count('gold_sword'), torch: g.inventory.count('torch'), lv: g.levels.level,
        door: g.world.getFg(49, 58), coins: g.world.chests.get(58 * 200 + 56)![0] };
    });
    expect(g1).toMatchObject({ seed: 'fixture-v9', sword: 1, door: 53 /* T.DOOR_CLOSED */, coins: { item: 'copper_coin', count: 37 } });
    const db = await page.evaluate(() => new Promise((ok) => {
      const r = indexedDB.open('delve');
      r.onsuccess = () => {
        const d = r.result, t = d.transaction(['saves', 'characters']);
        const bak = t.objectStore('saves').get('main.v9.bak'), main = t.objectStore('saves').get('main'), n = t.objectStore('characters').count();
        t.oncomplete = () => {
          ok({ v: d.version, bak: bak.result ? [...bak.result.data] : null, fmt: main.result?.format, charId: main.result?.charId, chars: n.result });
          d.close();
        };
      };
    }));
    // 備份 = 原封複製的舊記錄（壓縮後的 bytes 一個不差）
    expect(db).toMatchObject({ v: 2, bak: stored, fmt: 11, chars: 1 });
    expect(typeof (db as { charId: unknown }).charId).toBe('string');
    // 再讀一次：走 split 路徑，內容一樣，標題顯示暱稱
    await page.evaluate(() => window.__delveDebug!.save());
    await page.goto('/games/delve');
    await pressStart(page);
    await expect(page.locator('#delve-continue')).toContainText('旅人');
    await page.click('#delve-continue');
    await waitGame(page);
    expect(await page.evaluate(() => {
      const g = window.__delveDebug!.game;
      return { seed: g.seed, sword: g.inventory.count('gold_sword'), torch: g.inventory.count('torch'), lv: g.levels.level };
    })).toEqual({ seed: g1.seed, sword: g1.sword, torch: g1.torch, lv: g1.lv });
  });

  test('匯出（世界 + 內嵌角色）→ 另一個瀏覽器匯入接著玩；沒有角色的世界檔被拒', async ({ page, browser }) => {
    await page.goto('/games/delve?seed=exptest&autostart=1&fresh=1');
    await waitGame(page);
    const spot = await page.evaluate(async () => {
      const d = window.__delveDebug!, g = d.game, t = g.playerTile();
      g.give('torch', 17);
      g.world.setFg(t.x + 3, t.y + 4, 7);
      await d.save();
      return { x: t.x + 3, y: t.y + 4, torch: g.inventory.count('torch') };
    });
    // 存檔槽裡的世界檔本身沒有角色（gzip，跟匯出檔同一種外層）；新世界在自己的 w-<uuid> 槽
    const recs = await worldRecords(page, 'exptest');
    expect(recs.map((r) => r.slot)).toEqual([expect.stringMatching(/^w-/)]);
    const worldOnly = recs[0].data;
    await page.click('#delve-menu-btn');
    const dl = page.waitForEvent('download');
    await page.click('#delve-export');
    const file = readFileSync((await (await dl).path())!);

    const ctx = await browser.newContext();
    await ctx.addInitScript(() => { try { localStorage.setItem('delve.peaceful', '1'); localStorage.setItem('delve.help.seen', '1'); } catch { /* ignore */ } });
    const b = await ctx.newPage();
    await b.goto('/games/delve');
    await pressStart(b);
    await b.locator('#delve-import-file').setInputFiles({ name: 'w.delve', mimeType: 'application/octet-stream', buffer: Buffer.from(worldOnly) });
    await expect(b.locator('#delve-title-msg')).toContainText('這個存檔沒有角色資料');
    await b.locator('#delve-import-file').setInputFiles({ name: 'exptest.delve', mimeType: 'application/octet-stream', buffer: file });
    // 有 IndexedDB：匯入成新的世界、留在標題（不直接進遊戲），按「繼續冒險」進去
    await expect(b.locator('#delve-title-msg')).toContainText('已匯入世界「exptest」');
    expect(await b.evaluate(() => Boolean(window.__delveDebug))).toBe(false);
    // 匯入當下就存成世界 + 角色
    const imported = await worldRecords(b, 'exptest');
    expect(imported).toHaveLength(1);
    expect(imported[0]).toMatchObject({ slot: expect.stringMatching(/^w-/), format: 11, charId: expect.any(String) });
    expect(await b.evaluate(() => new Promise((ok) => {
      const r = indexedDB.open('delve');
      r.onsuccess = () => { const d = r.result, q = d.transaction('characters').objectStore('characters').count(); q.onsuccess = () => { ok(q.result); d.close(); }; };
    }))).toBe(1);
    await expect(b.locator('#delve-continue-sub')).toContainText('exptest');
    await b.click('#delve-continue');
    await waitGame(b);
    expect(await b.evaluate(({ x, y }) => {
      const g = window.__delveDebug!.game;
      return { seed: g.seed, torch: g.inventory.count('torch'), fg: g.world.getFg(x, y) };
    }, spot)).toEqual({ seed: 'exptest', torch: spot.torch, fg: 7 });
    await ctx.close();
  });

  test('存檔槽讀不了（角色記錄遺失）：「繼續冒險」不指向它，世界列表的「匯出」仍能把槽的原始位元組匯出', async ({ page }) => {
    await page.goto('/games/delve?seed=exporterr&autostart=1&fresh=1');
    await waitGame(page);
    await page.evaluate(() => window.__delveDebug!.save());
    // 讀出世界記錄（gzip）並刪掉角色記錄
    const [rec] = await worldRecords(page, 'exporterr');
    const worldRec = rec.data;
    await page.evaluate(() => new Promise<void>((ok, bad) => {
      const r = indexedDB.open('delve');
      r.onsuccess = () => {
        const d = r.result, t = d.transaction('characters', 'readwrite');
        t.objectStore('characters').clear();
        t.oncomplete = () => { ok(); d.close(); };
        t.onerror = () => bad(t.error);
      };
    }));
    expect(worldRec.slice(0, 2)).toEqual([0x1f, 0x8b]);
    await page.goto('/games/delve');
    await pressStart(page);
    // 記錄的角色不在了：沒有可繼續的組合 → 「繼續冒險」隱藏
    await expect(page.locator('#delve-start')).toBeFocused();
    await expect(page.locator('#delve-continue')).toBeHidden();
    // 世界列表要先有角色：建一個新角色 → 世界列表看得到這個世界
    await page.click('#delve-start');
    await page.click('#delve-newchar-open');
    await page.fill('#delve-nick', '救援');
    await page.click('#delve-newchar-create');
    await expect(page.locator('#delve-world-who')).toHaveText('選擇世界 — 以 救援 進入');
    const dl = page.waitForEvent('download');
    await worldRow(page, 'exporterr').locator('.delve-world-export').click();
    const file = readFileSync((await (await dl).path())!);
    // 匯出檔 = 存檔槽的原始位元組（gzip 外層，與 IndexedDB 裡的世界記錄逐位元組相同）
    expect([...file.subarray(0, 2)]).toEqual([0x1f, 0x8b]);
    expect([...file]).toEqual(worldRec);
    await expect(page.locator('#delve-title-msg')).toContainText('已匯出存檔檔案');
    // 匯出沒有修改存檔槽、沒有進遊戲
    expect(await page.evaluate(() => Boolean(window.__delveDebug))).toBe(false);
    expect((await worldRecords(page, 'exporterr')).map((r) => r.data)).toEqual([worldRec]);
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

  test('按 G 丟出手上的道具', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/games/delve?seed=toss&autostart=1&fresh=1');
    await waitGame(page);
    await page.evaluate(() => {
      const g = window.__delveDebug!.game;
      // 開局背包有 10 支火把：先清掉，只留這次給的 5 支
      g.inventory.remove('torch', g.inventory.count('torch'));
      g.give('torch', 5);
      const i = g.inventory.slots.findIndex((s: { item: string } | null) => s?.item === 'torch');
      if (i !== 0) g.inventory.swap(i, 0);
      g.selectSlot(0);
    });
    expect(await page.evaluate(() => window.__delveDebug!.game.inventory.selectedStack()?.item)).toBe('torch');
    await page.keyboard.press('KeyG');
    await expect.poll(() => page.evaluate(() => window.__delveDebug!.game.inventory.count('torch')), { timeout: 1000 }).toBe(0);
    // 丟的人 1.5 秒內撿不回來：這段時間裡地上一定有那 5 支
    expect(await page.evaluate(() => window.__delveDebug!.game.drops.list.some((d: { item: string; count: number }) => d.item === 'torch' && d.count === 5))).toBe(true);
    expect(errors).toEqual([]);
  });

  test('G 跟其他遊戲鍵一樣被技能樹擋住；在背包選中的那格丟掉後不再是選中狀態', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/games/delve?seed=toss&autostart=1&fresh=1');
    await waitGame(page);
    await page.evaluate(() => {
      const g = window.__delveDebug!.game;
      g.inventory.remove('torch', g.inventory.count('torch'));
      g.give('torch', 5);
      const i = g.inventory.slots.findIndex((s: { item: string } | null) => s?.item === 'torch');
      if (i !== 0) g.inventory.swap(i, 0);
      g.selectSlot(0);
    });
    const torches = () => page.evaluate(() => window.__delveDebug!.game.inventory.count('torch'));
    // 技能樹開著：G 不丟東西
    await page.keyboard.press('KeyK');
    await expect(page.locator('#delve-skills')).toBeVisible();
    await page.keyboard.press('KeyG');
    await page.waitForTimeout(150);
    expect(await torches()).toBe(5);
    await page.keyboard.press('Escape');
    await expect(page.locator('#delve-skills')).toBeHidden();
    // 背包裡點第 0 格（選中）→ G 丟掉 → 那格不再標成選中
    await page.keyboard.press('KeyE');
    await expect(page.locator('#delve-inv')).toBeVisible();
    const slot0 = page.locator('#delve-inv-grid .delve-slot').nth(0);
    await slot0.click();
    await expect(slot0).toHaveClass(/is-picked/);
    await page.keyboard.press('KeyG');
    await expect.poll(torches, { timeout: 1000 }).toBe(0);
    await expect(slot0).not.toHaveClass(/is-picked/);
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
    await expect(page.locator('#delve-start')).toBeVisible();
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
      return { x0, top, frozen: w.isFrozen(x0 + 5, top) ? 1 : 0, solid: w.isSolid(x0 + 5, top) };
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
    // 沒有存檔：「繼續冒險」藏起來，焦點從「開始遊戲」開始；順序 開始遊戲 → 匯入存檔 → 操作說明 → 設定 → 返回遊戲廳 → 繞回
    await expect(page.locator('#delve-continue')).toBeHidden();
    await expect(page.locator('#delve-start')).toBeFocused();
    for (const id of ['#delve-import', '#delve-help-open', '#delve-settings-btn', '#delve-back', '#delve-start']) {
      await page.keyboard.press('ArrowDown');
      await expect(page.locator(id)).toBeFocused();
    }
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#delve-back')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(page.locator('#delve-start')).toBeFocused();
    await page.keyboard.press('End');
    await expect(page.locator('#delve-back')).toBeFocused();
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
    // 開始遊戲 → 新角色（暱稱留空 = 旅人）→ 世界列表 → 新世界面板：骰子給名字、難度切換記住
    await page.click('#delve-start');
    await page.click('#delve-newchar-open');
    await page.click('#delve-newchar-create');
    await expect(page.locator('#delve-world-who')).toHaveText('選擇世界 — 以 旅人 進入');
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
    await page.evaluate(() => window.__delveDebug!.save());
    // 有存檔：「繼續冒險」排第一、拿到焦點，往下是「開始遊戲」
    await page.goto('/games/delve');
    await page.waitForFunction(() => (window.__delveTitle?.perf.frames ?? 0) > 10, undefined, { timeout: 15000 });
    await page.keyboard.press('Enter');
    await expect(page.locator('#delve-continue')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#delve-continue')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#delve-start')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#delve-continue')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#delve-back')).toBeFocused();
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
    // 拆存檔之後摘要也寫著角色暱稱（autostart 的新角色 = 旅人）
    await expect(sub).toContainText('旅人');
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

  test('「繼續冒險」開到待同步（pendingWorld）的角色 → 先跳確認；取消留在標題，確定才進去', async ({ page }) => {
    await page.goto('/games/delve?seed=pend-cont&autostart=1&fresh=1');
    await waitGame(page);
    await page.evaluate(() => window.__delveDebug!.save());
    // 角色記錄標上 pendingWorld（同客人斷線時 CoopGuestSession 寫的）
    await page.evaluate(() => new Promise<void>((ok, bad) => {
      const r = indexedDB.open('delve');
      r.onsuccess = () => {
        const d = r.result, t = d.transaction('characters', 'readwrite'), st = t.objectStore('characters'), q = st.getAll();
        q.onsuccess = () => { for (const rec of q.result as Record<string, unknown>[]) st.put({ ...rec, pendingWorld: 'w-friend' }); };
        t.oncomplete = () => { ok(); d.close(); };
        t.onerror = () => bad(t.error);
      };
    }));
    await page.goto('/games/delve');
    await pressStart(page);
    await expect(page.locator('#delve-continue')).toBeVisible();
    await page.click('#delve-continue');
    await expect(page.locator('#delve-confirm')).toBeVisible();
    await expect(page.locator('#delve-confirm-msg')).toContainText('最後一筆交易還沒確認');
    await expect(page.locator('#delve-confirm-ok')).toHaveText('繼續');
    await page.click('#delve-confirm-cancel');
    await expect(page.locator('#delve-confirm')).toBeHidden();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => Boolean(window.__delveDebug))).toBe(false);
    await expect(page.locator('#delve-root')).toHaveAttribute('data-phase', 'title');
    await page.click('#delve-continue');
    await expect(page.locator('#delve-confirm')).toBeVisible();
    await page.click('#delve-confirm-ok');
    await waitGame(page);
    expect(await page.evaluate(() => window.__delveDebug!.game.seed)).toBe('pend-cont');
  });

  test('生成畫面：地層剖面跟著生成器真的取樣、六個階段依序完成', async ({ page }) => {
    await page.goto('/games/delve');
    await pressStart(page);
    await newWorldVia(page, 'gen-screen');
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

  test('遊戲 → 回到標題 → 新世界（不覆蓋，舊世界仍在列表）→ 換成新種子，沒有重複的迴圈', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/games/delve?seed=rt-old&autostart=1&fresh=1');
    await waitGame(page);
    await backToTitle(page);
    await expect(page.locator('#delve-continue-sub')).toContainText('rt-old');
    await newWorldVia(page, 'rt-new', { newChar: false });
    await page.waitForFunction(() => window.__delveDebug?.game.seed === 'rt-new', undefined, { timeout: 30000 });
    await expect(page.locator('#delve-confirm')).toBeHidden();
    await expect(page.locator('#delve-title')).toBeHidden({ timeout: 15000 });
    await expect(page.locator('#delve-hotbar .delve-slot')).toHaveCount(10);
    await expect.poll(() => live(page)).toMatchObject({ handles: 1, scenes: 0, sounds: 2, loops: 1 });
    const a = await page.evaluate(() => window.__delveDebug!.game.tick);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__delveDebug!.game.tick)).toBeGreaterThan(a);
    // 「繼續冒險」改指向新世界；舊世界沒被蓋掉，兩個都在世界列表
    await backToTitle(page);
    await expect(page.locator('#delve-continue-sub')).toContainText('rt-new');
    await page.click('#delve-start');
    await page.locator('#delve-charlist .delve-char-row .delve-char-line').first().click();
    await expect(page.locator('#delve-worldlist .delve-world-row')).toHaveCount(2);
    await expect(worldRow(page, 'rt-old')).toHaveCount(1);
    await expect(worldRow(page, 'rt-new')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('carries gear between worlds：同一個角色換世界背包跟著走；放的方塊留在原本的世界', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/games/delve');
    await pressStart(page);
    await newWorldVia(page, '甲', { nick: '阿甲' });
    await waitGame(page);
    expect(await page.evaluate(() => window.__delveDebug!.game.seed)).toBe('甲');
    // 背包給一把金劍（新角色沒有）、玩家旁邊放一塊木板
    const spot = await page.evaluate(() => {
      const g = window.__delveDebug!.game, t = g.playerTile();
      const before = g.inventory.count('gold_sword');
      g.give('gold_sword', 1);
      const x = t.x + 3, y = t.y + 4;
      g.world.setFg(x, y, 7); // planks
      return { x, y, before };
    });
    expect(spot.before).toBe(0);
    await backToTitle(page);
    // 阿甲 建世界「乙」：金劍帶過來；同一個位置不是玩家放的木板（新世界）
    await newWorldVia(page, '乙', { newChar: false });
    await waitGame(page);
    expect(await page.evaluate(({ x, y }) => {
      const g = window.__delveDebug!.game;
      return { seed: g.seed, sword: g.inventory.count('gold_sword'), planks: g.world.getFg(x, y) === 7 };
    }, spot)).toEqual({ seed: '乙', sword: 1, planks: false });
    await backToTitle(page);
    // 再選 阿甲 +「甲」：木板還在、金劍也還在
    await page.click('#delve-start');
    await charRow(page, '阿甲').locator('.delve-char-line').click();
    await expect(page.locator('#delve-world-who')).toHaveText('選擇世界 — 以 阿甲 進入');
    await expect(page.locator('#delve-worldlist .delve-world-row')).toHaveCount(2);
    await worldRow(page, '甲').locator('.delve-world-line').click();
    await waitGame(page);
    expect(await page.evaluate(({ x, y }) => {
      const g = window.__delveDebug!.game;
      return { seed: g.seed, sword: g.inventory.count('gold_sword'), fg: g.world.getFg(x, y) };
    }, spot)).toEqual({ seed: '甲', sword: 1, fg: 7 });
    expect(errors).toEqual([]);
  });

  test('second character starts fresh in a shared world：B 進 A 的世界 → 背包沒有 A 的東西、站在出生點，世界是同一個', async ({ page }) => {
    await page.goto('/games/delve');
    await pressStart(page);
    await newWorldVia(page, '甲', { nick: 'A' });
    await waitGame(page);
    // A：背包放金劍、放一塊木板、走到離出生點很遠的地方
    const a = await page.evaluate(() => {
      const g = window.__delveDebug!.game, t = g.playerTile();
      g.give('gold_sword', 1);
      const x = t.x + 3, y = t.y + 4;
      g.world.setFg(x, y, 7);
      g.teleport(g.spawn.x + 30, g.spawn.y - 20);
      return { x, y, spawn: { x: g.spawn.x, y: g.spawn.y } };
    });
    await page.waitForTimeout(300);
    expect(Math.abs(await page.evaluate(() => window.__delveDebug!.game.playerTile().x) - a.spawn.x)).toBeGreaterThan(20);
    await backToTitle(page);
    // 新角色 B → 世界列表選「甲」
    await page.click('#delve-start');
    await page.click('#delve-newchar-open');
    await page.fill('#delve-nick', 'B');
    await page.click('#delve-newchar-create');
    await expect(page.locator('#delve-world-who')).toHaveText('選擇世界 — 以 B 進入');
    await worldRow(page, '甲').locator('.delve-world-line').click();
    await waitGame(page);
    const b = await page.evaluate(({ x, y }) => {
      const g = window.__delveDebug!.game, t = g.playerTile();
      return { seed: g.seed, sword: g.inventory.count('gold_sword'), fg: g.world.getFg(x, y), dx: Math.abs(t.x - g.spawn.x), spawn: { x: g.spawn.x, y: g.spawn.y } };
    }, a);
    expect(b).toMatchObject({ seed: '甲', sword: 0, fg: 7, spawn: a.spawn });
    expect(b.dx).toBeLessThanOrEqual(1);
  });

  test('delete world and character with confirm：取消不刪、確認才刪；刪掉「繼續冒險」的角色 → 改指向剩下的組合，都沒了就隱藏', async ({ page }) => {
    await page.goto('/games/delve');
    await pressStart(page);
    await newWorldVia(page, 'del-a', { nick: '甲角' });
    await waitGame(page);
    await backToTitle(page);
    await newWorldVia(page, 'del-b', { nick: '乙角' });
    await waitGame(page);
    await backToTitle(page);
    const cont = page.locator('#delve-continue-sub');
    await expect(cont).toContainText('del-b');
    await expect(cont).toContainText('乙角');
    const chars = page.locator('#delve-charlist .delve-char-row'), worlds = page.locator('#delve-worldlist .delve-world-row');
    // 刪角色 乙角（「繼續冒險」指向它）：取消 → 還在
    await page.click('#delve-start');
    await expect(chars).toHaveCount(2);
    await charRow(page, '乙角').locator('.delve-char-del').click();
    await expect(page.locator('#delve-confirm')).toBeVisible();
    await expect(page.locator('#delve-confirm-msg')).toContainText('乙角');
    await expect(page.locator('#delve-confirm-ok')).toHaveText('刪除');
    await page.click('#delve-confirm-cancel');
    await expect(page.locator('#delve-confirm')).toBeHidden();
    await expect(chars).toHaveCount(2);
    await expect(cont).toContainText('del-b');
    // 確認 → 刪掉；「繼續冒險」改指向 甲角 +「del-a」
    await charRow(page, '乙角').locator('.delve-char-del').click();
    await page.click('#delve-confirm-ok');
    await expect(page.locator('#delve-confirm')).toBeHidden();
    await expect(chars).toHaveCount(1);
    await expect(charRow(page, '甲角')).toHaveCount(1);
    await expect(cont).toContainText('del-a');
    await expect(cont).toContainText('甲角');
    // 刪世界「del-a」：取消不刪、確認才刪（「del-b」還在，只是它的角色沒了）
    await charRow(page, '甲角').locator('.delve-char-line').click();
    await expect(worlds).toHaveCount(2);
    await worldRow(page, 'del-a').locator('.delve-world-del').click();
    await expect(page.locator('#delve-confirm')).toBeVisible();
    await expect(page.locator('#delve-confirm-msg')).toContainText('del-a');
    await expect(page.locator('#delve-confirm-ok')).toHaveText('刪除');
    await page.click('#delve-confirm-cancel');
    await expect(worlds).toHaveCount(2);
    await expect(cont).toContainText('del-a');
    await worldRow(page, 'del-a').locator('.delve-world-del').click();
    await page.click('#delve-confirm-ok');
    await expect(worlds).toHaveCount(1);
    await expect(worldRow(page, 'del-b')).toHaveCount(1);
    expect(await worldRecords(page, 'del-a')).toEqual([]);
    // 剩下的「del-b」記錄的角色已經刪了 → 沒有可繼續的組合：回到主選單「繼續冒險」藏起來
    await page.click('#delve-worlds-back');
    await page.click('#delve-chars-back');
    await expect(page.locator('#delve-tmenu')).toBeVisible();
    await expect(page.locator('#delve-continue')).toBeHidden();
    await expect(page.locator('#delve-start')).toBeVisible();
  });

  test('same name twice：兩個同名世界各有自己的存檔槽，都在列表', async ({ page }) => {
    await page.goto('/games/delve');
    await pressStart(page);
    await newWorldVia(page, 'twin', { nick: '雙' });
    await waitGame(page);
    await backToTitle(page);
    await newWorldVia(page, 'twin', { newChar: false });
    await waitGame(page);
    await backToTitle(page);
    await page.click('#delve-start');
    await charRow(page, '雙').locator('.delve-char-line').click();
    await expect(page.locator('#delve-worldlist .delve-world-row')).toHaveCount(2);
    await expect(worldRow(page, 'twin')).toHaveCount(2);
    const slots = await worldRow(page, 'twin').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.slot));
    expect(new Set(slots).size).toBe(2);
    expect((await worldRecords(page, 'twin')).map((r) => r.slot).sort()).toEqual([...slots].sort());
  });

  test('migrates legacy main before listing：舊存檔在「開始遊戲」時先轉換 → 角色列表有 旅人、世界列表有該世界、main.v9.bak 存在', async ({ page }) => {
    const stored = await seedLegacyV9(page);
    await page.goto('/games/delve');
    await pressStart(page);
    await page.click('#delve-start');
    await expect(page.locator('#delve-charpanel')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#delve-charlist .delve-char-row')).toHaveCount(1);
    await expect(page.locator('#delve-charlist .delve-char-line')).toContainText('旅人');
    await page.locator('#delve-charlist .delve-char-line').first().click();
    await expect(page.locator('#delve-world-who')).toHaveText('選擇世界 — 以 旅人 進入');
    await expect(page.locator('#delve-worldlist .delve-world-row')).toHaveCount(1);
    await expect(worldRow(page, 'fixture-v9')).toHaveCount(1);
    // 只轉換、沒有進遊戲
    expect(await page.evaluate(() => Boolean(window.__delveDebug))).toBe(false);
    // 備份 = 原封複製的舊記錄；'main' 已是 format 10 + 角色
    const db = await page.evaluate(() => new Promise((ok) => {
      const r = indexedDB.open('delve');
      r.onsuccess = () => {
        const d = r.result, t = d.transaction('saves');
        const bak = t.objectStore('saves').get('main.v9.bak'), main = t.objectStore('saves').get('main');
        t.oncomplete = () => { ok({ bak: bak.result ? [...bak.result.data] : null, fmt: main.result?.format, char: typeof main.result?.charId }); d.close(); };
      };
    }));
    expect(db).toEqual({ bak: stored, fmt: 11, char: 'string' });
  });

  test('legacy main row picked with another character：先轉換（含 main.v9.bak）再用選定的角色進去，不是轉換出來的 旅人', async ({ page }) => {
    await page.goto('/games/delve');
    await pressStart(page);
    await page.click('#delve-start');
    await page.click('#delve-newchar-open');
    await page.fill('#delve-nick', '甲');
    await page.click('#delve-newchar-create');
    await expect(page.locator('#delve-world-who')).toHaveText('選擇世界 — 以 甲 進入');
    // 角色選好之後，'main' 才出現還沒轉換的舊存檔（例如「開始遊戲」時轉換失敗）：世界列表看得到它
    const stored = await injectLegacyMain(page);
    await page.click('#delve-worlds-back');
    await charRow(page, '甲').locator('.delve-char-line').click();
    await worldRow(page, 'fixture-v9').locator('.delve-world-line').click();
    await waitGame(page);
    const g = await page.evaluate(async () => {
      const d = window.__delveDebug!;
      await d.save();
      return { seed: d.game.seed, sword: d.game.inventory.count('gold_sword') };
    });
    // 甲 是新角色：沒有舊存檔玩家的金劍
    expect(g).toEqual({ seed: 'fixture-v9', sword: 0 });
    const db = await page.evaluate(() => new Promise<{ bak: number[] | null; fmt?: number; charId?: string; nicks: Record<string, string> }>((ok) => {
      const r = indexedDB.open('delve');
      r.onsuccess = () => {
        const d = r.result, t = d.transaction(['saves', 'characters']);
        const bak = t.objectStore('saves').get('main.v9.bak'), main = t.objectStore('saves').get('main'), cs = t.objectStore('characters').getAll();
        t.oncomplete = () => {
          const nicks: Record<string, string> = {};
          for (const c of cs.result as { id: string; nick: string }[]) nicks[c.id] = c.nick;
          ok({ bak: bak.result ? [...bak.result.data] : null, fmt: main.result?.format, charId: main.result?.charId, nicks });
          d.close();
        };
      };
    }));
    expect(db.bak).toEqual(stored);
    expect(db.fmt).toBe(11);
    // 'main' 最後進場的是 甲（轉換出來的 旅人 照 B5 留在角色庫）
    expect(db.nicks[db.charId!]).toBe('甲');
    expect(Object.values(db.nicks).sort()).toEqual(['旅人', '甲'].sort());
  });

  test('legacy main row from an old generator：提示指向世界列表的「新世界」、留在世界列表、沒有開局', async ({ page }) => {
    await page.goto('/games/delve');
    await pressStart(page);
    await page.click('#delve-start');
    await page.click('#delve-newchar-open');
    await page.fill('#delve-nick', '乙');
    await page.click('#delve-newchar-create');
    await expect(page.locator('#delve-world-who')).toHaveText('選擇世界 — 以 乙 進入');
    await injectLegacyMain(page, { format: 1, genVersion: 1, seed: 'old-gen', width: 1600, height: 500, time: 0, tick: 0, savedAt: 1, player: { x: 0, y: 0, vx: 0, vy: 0 }, inventory: { slots: [], selected: 0 }, chunks: [] });
    await page.click('#delve-worlds-back');
    await charRow(page, '乙').locator('.delve-char-line').click();
    await worldRow(page, 'old-gen').locator('.delve-world-line').click();
    const msg = page.locator('#delve-title-msg');
    await expect(msg).toContainText('舊版地圖產生器');
    await expect(msg).toContainText('「新世界」');
    await expect(msg).not.toContainText('下面的按鈕');
    await expect(page.locator('#delve-worldpanel')).toBeVisible();
    await expect(page.locator('#delve-upgrade-new')).toBeHidden();
    expect(await page.evaluate(() => Boolean(window.__delveDebug))).toBe(false);
  });

  test('one tab per character / world：A 在玩 → B 的繼續、選同一個角色或世界、刪除都被擋下；A 回到標題後 B 進得去', async ({ page, context }) => {
    await page.goto('/games/delve?seed=lock-w&autostart=1&fresh=1');
    await waitGame(page);
    await page.evaluate(() => window.__delveDebug!.save());
    const b = await context.newPage();
    await b.addInitScript(() => { try { localStorage.setItem('delve.peaceful', '1'); localStorage.setItem('delve.help.seen', '1'); } catch { /* ignore */ } });
    await b.goto('/games/delve');
    await pressStart(b);
    const msg = b.locator('#delve-title-msg');
    const busy = '這個角色或世界正在另一個分頁中遊玩，請先關掉那個分頁。';
    const notPlaying = async (): Promise<void> => {
      await expect(b.locator('#delve-root')).toHaveAttribute('data-phase', 'title');
      expect(await b.evaluate(() => Boolean(window.__delveDebug))).toBe(false);
    };
    // 繼續冒險 → A 正在玩的那個組合：擋下
    await expect(b.locator('#delve-continue-sub')).toContainText('lock-w');
    await b.click('#delve-continue');
    await expect(msg).toHaveText(busy);
    await notPlaying();
    // 同一個角色：刪除擋下、進同一個世界擋下、開新世界也擋下
    await b.click('#delve-start');
    await expect(msg).toHaveText('');
    await charRow(b, '旅人').locator('.delve-char-del').click();
    await expect(msg).toHaveText(busy);
    await expect(b.locator('#delve-confirm')).toBeHidden();
    await charRow(b, '旅人').locator('.delve-char-line').click();
    await worldRow(b, 'lock-w').locator('.delve-world-line').click();
    await expect(msg).toHaveText(busy);
    await notPlaying();
    await b.click('#delve-new');
    await b.fill('#delve-seed', 'lock-other');
    await b.click('#delve-create');
    await expect(msg).toHaveText(busy);
    await notPlaying();
    await b.click('#delve-new-cancel');
    // 刪 A 的世界：擋下、記錄還在；另一個角色進 A 的世界：擋下
    await b.click('#delve-worlds-back');
    await b.click('#delve-newchar-open');
    await b.fill('#delve-nick', '乙');
    await b.click('#delve-newchar-create');
    await expect(b.locator('#delve-world-who')).toHaveText('選擇世界 — 以 乙 進入');
    await expect(msg).toHaveText('');
    await worldRow(b, 'lock-w').locator('.delve-world-del').click();
    await expect(msg).toHaveText(busy);
    await expect(b.locator('#delve-confirm')).toBeHidden();
    expect(await worldRecords(b, 'lock-w')).toHaveLength(1);
    await worldRow(b, 'lock-w').locator('.delve-world-line').click();
    await expect(msg).toHaveText(busy);
    await notPlaying();
    // A 回到標題（放掉鎖）→ B 的「繼續冒險」進得去
    await page.bringToFront();
    await backToTitle(page);
    await b.bringToFront();
    await b.click('#delve-worlds-back');
    await b.click('#delve-chars-back');
    await b.click('#delve-continue');
    await waitGame(b);
    expect(await b.evaluate(() => window.__delveDebug!.game.seed)).toBe('lock-w');
    // 現在換 A 被擋
    await page.click('#delve-continue');
    await expect(page.locator('#delve-title-msg')).toHaveText(busy);
    expect(await page.evaluate(() => Boolean(window.__delveDebug))).toBe(false);
  });
});

/** 在畫面上右鍵 tile (x, y)（按住一下再放開：放置 / 使用） */
async function rightClickTile(page: Page, t: { x: number; y: number }): Promise<void> {
  const p = await page.evaluate(([x, y]) => {
    const r = window.__delveDebug!.handle.renderer, c = (document.querySelector('#delve-canvas') as HTMLCanvasElement).getBoundingClientRect();
    return { sx: c.left + ((x + 0.5) * 16 - r.drawCam.x) * r.zoom, sy: c.top + ((y + 0.5) * 16 - r.drawCam.y) * r.zoom };
  }, [t.x, t.y]);
  await page.mouse.move(p.sx, p.sy);
  await page.mouse.down({ button: 'right' }); await page.waitForTimeout(120); await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(80);
}
/** 右鍵使用已放好的家具（梳妝台 / 箱子） */
const useTile = rightClickTile;

/** 把 item 放到快捷列第 slot 格並選取（背包要有） */
function holdItem(page: Page, item: string, slot: number): Promise<void> {
  return page.evaluate(([item, slot]) => {
    const g = window.__delveDebug!.game;
    const i = g.inventory.slots.findIndex((s: { item: string } | null) => s?.item === item);
    if (i !== slot) g.inventory.swap(i, slot as number);
    g.selectSlot(slot as number);
  }, [item, slot] as const);
}

/** 清出腳邊右側一塊平地、在快捷列拿著 item、右鍵放在腳邊右兩格；回傳放下的 tile（fg = expectFg） */
async function placeFurniture(page: Page, item: string, expectFg: number): Promise<{ x: number; y: number }> {
  await page.waitForFunction(() => window.__delveDebug!.game.player.onGround, undefined, { timeout: 10000 });
  const at = await page.evaluate((item) => {
    const g = window.__delveDebug!.game, w = g.world, f = g.feetTile();
    for (let x = f.x - 1; x <= f.x + 4; x++) { for (let y = f.y - 4; y <= f.y; y++) { w.setFg(x, y, 0); w.setLiquid(x, y, 0, 0); } w.setFg(x, f.y + 1, 3); }
    g.give(item as never, 1);
    return { x: f.x + 2, y: f.y };
  }, item);
  await holdItem(page, item, 2);
  await rightClickTile(page, at);
  expect(await page.evaluate(({ x, y }) => window.__delveDebug!.game.world.getFg(x, y), at)).toBe(expectFg);
  return at;
}
/** 梳妝台 tile id（engine/tiles.ts T.VANITY_TABLE） */
const VANITY_TABLE_FG = 117;
const placeVanityTable = (page: Page): Promise<{ x: number; y: number }> => placeFurniture(page, 'vanity_table', VANITY_TABLE_FG);

test.describe('delve 角色外觀 / 紙娃娃 / 攀爬', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'canvas sandbox smoke runs on chromium only');
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('delve.peaceful', '1'); localStorage.setItem('delve.help.seen', '1'); } catch { /* ignore */ } });
  });

  test('新角色「更換外觀」→ 換髮型 → 完成；新角色 + 新世界用這個外觀，存檔 → 重新整理 → 繼續後還在', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/games/delve');
    await pressStart(page);
    await openNewLook(page);
    const wr = page.locator('#delve-wardrobe');
    // 第一列是體型
    await expect(wr.locator('.delve-wr-row').first()).toHaveAttribute('data-key', 'body');
    await expect(wr.locator('.delve-wr-row').first()).toBeFocused();
    const row = wr.locator('.delve-wr-row[data-key="hair"]');
    await row.focus();
    const before = Number(await row.getAttribute('data-value'));
    // 鍵盤 → 換一個，再用滑鼠點「下一個」再換一個
    await page.keyboard.press('ArrowRight');
    await row.locator('[data-dir="1"]').click();
    const hair = Number(await row.getAttribute('data-value'));
    expect(hair).not.toBe(before);
    await wr.locator('.delve-wr-row[data-key="hairColor"] [data-dir="1"]').click();
    const hairColor = Number(await wr.locator('.delve-wr-row[data-key="hairColor"]').getAttribute('data-value'));
    const doll0 = await page.locator('#delve-new-doll').evaluate((c) => (c as HTMLCanvasElement).toDataURL());
    await page.click('#delve-wr-done');
    await expect(wr).toBeHidden();
    // 回到新角色面板，小預覽跟著換
    await expect(page.locator('#delve-newchar')).toBeVisible();
    expect(await page.locator('#delve-new-doll').evaluate((c) => (c as HTMLCanvasElement).toDataURL())).not.toBe(doll0);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('delve.appearance') ?? '{}'));
    expect(saved.hair).toBe(hair);
    // 標題背景的主角也換了
    await page.waitForFunction(() => Boolean(window.__delveTitle));
    expect(await page.evaluate(() => window.__delveTitle!.game.appearance.hair)).toBe(hair);
    // 新角色面板選「男」→ 預設外觀換成男生體型、標題主角也換
    await page.click('#delve-body-m');
    await expect(page.locator('#delve-body-m')).toHaveAttribute('aria-checked', 'true');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('delve.appearance') ?? '{}').body)).toBe(1);
    expect(await page.evaluate(() => window.__delveTitle!.game.appearance.body)).toBe(1);
    // 建立角色 → 世界列表 → 新世界
    await page.fill('#delve-nick', '換裝');
    await page.click('#delve-newchar-create');
    await expect(page.locator('#delve-worldpanel')).toBeVisible();
    await page.click('#delve-new');
    await page.fill('#delve-seed', 'look-e2e');
    await page.click('#delve-create');
    await waitGame(page);
    expect(await page.evaluate(() => window.__delveDebug!.game.appearance.hair)).toBe(hair);
    expect(await page.evaluate(() => window.__delveDebug!.game.appearance.body)).toBe(1);
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
    expect(look.body).toBe(1);
    expect(errors).toEqual([]);
  });

  test('wardrobe race row：種族列在體型之後、右鍵三次 → 3（貓族）、說明跟著換、完成後存進 localStorage', async ({ page }) => {
    await page.goto('/games/delve');
    await pressStart(page);
    await openNewLook(page);
    const wr = page.locator('#delve-wardrobe');
    const keys = await wr.locator('.delve-wr-row').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.key));
    expect(keys.indexOf('race')).toBeGreaterThan(keys.indexOf('body'));
    const row = wr.locator('.delve-wr-row[data-key="race"]');
    const blurb = wr.locator('.delve-wr-blurb');
    const b0 = await blurb.textContent();
    expect((b0 ?? '').length).toBeGreaterThan(0);
    // 體型組是偶數列、沒有補位說明：「男女都能穿…」改成種族說明的第二句（換種族也一直在）
    expect(b0).toContain('男女都能穿任何髮型、服裝與裝備。');
    await expect(wr.locator('.delve-wr-note', { hasText: '男女都能穿' })).toHaveCount(0);
    for (let i = 0; i < 3; i++) await row.locator('[data-dir="1"]').click();
    await expect(row).toHaveAttribute('data-value', '3');
    expect(await blurb.textContent()).not.toBe(b0);
    await expect(blurb).toContainText('貓族');
    await expect(blurb).toContainText('男女都能穿任何髮型、服裝與裝備。');
    await page.click('#delve-wr-done');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('delve.appearance') ?? '{}'));
    expect(saved.race).toBe(3);
  });

  test('wardrobe preview turns：#delve-wr-turn 切換面向、畫布內容改變；桌面 6 倍 = 336 寬', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/games/delve');
    await pressStart(page);
    await openNewLook(page);
    const doll = page.locator('#delve-wr-doll');
    await expect(doll).toBeVisible();
    expect(await doll.evaluate((el) => (el as HTMLCanvasElement).clientWidth)).toBe(336);
    // 輪播會自己變：點擊前後在同一個 JS 任務內取圖（click 會同步重畫）
    let differs = false;
    for (let i = 0; i < 6 && !differs; i++) {
      const [a, b] = await doll.evaluate(async (el) => {
        const c = el as HTMLCanvasElement;
        const before = c.toDataURL();
        (document.querySelector('#delve-wr-turn') as HTMLButtonElement).click();
        return [before, c.toDataURL()];
      });
      differs = a !== b;
      await page.waitForTimeout(150);
    }
    expect(differs).toBe(true);
  });

  test('wardrobe preview 手機尺寸：600 寬 3 倍（168）、700 寬 4 倍（224）、選項列捲得到', async ({ page }) => {
    for (const [width, cw] of [[600, 168], [700, 224]] as const) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/games/delve');
      await pressStart(page);
      await openNewLook(page);
      const doll = page.locator('#delve-wr-doll');
      await expect(doll).toBeVisible();
      expect(await doll.evaluate((el) => (el as HTMLCanvasElement).clientWidth), `viewport ${width}`).toBe(cw);
      await expectCrisp(page, '#delve-wr-doll');
      const last = page.locator('#delve-wardrobe .delve-wr-row').last();
      await last.scrollIntoViewIfNeeded();
      await expect(last).toBeVisible();
    }
  });

  test('遊戲中選單沒有「角色外觀」；梳妝台：Esc 關掉回到遊戲（不開選單）；隨機 → 完成 → 紙娃娃 key 換了、種族 / 服裝不變', async ({ page }) => {
    await page.goto('/games/delve?seed=look-menu&autostart=1&fresh=1');
    await waitGame(page);
    await page.waitForFunction(() => window.__delveDebug!.game.player.onGround, undefined, { timeout: 10000 });
    await page.waitForTimeout(200);
    const k0 = await page.evaluate(() => window.__delveDebug!.handle.renderer.dollKey);
    // 選單裡不再有「角色外觀」（外觀改到梳妝台）
    await page.click('#delve-menu-btn');
    await expect(page.locator('#delve-menu')).toBeVisible();
    await expect(page.locator('#delve-look-menu')).toHaveCount(0);
    await page.click('#delve-resume');
    await expect(page.locator('#delve-menu')).toBeHidden();
    const at = await placeVanityTable(page);
    await useTile(page, at);
    await expect(page.locator('#delve-wardrobe')).toBeVisible();
    expect(await page.evaluate(() => window.__delveDebug!.handle.paused)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('#delve-wardrobe')).toBeHidden();
    await expect(page.locator('#delve-menu')).toBeHidden();
    expect(await page.evaluate(() => window.__delveDebug!.handle.paused)).toBe(false);
    const a0 = await page.evaluate(() => window.__delveDebug!.game.appearance);
    await useTile(page, at);
    await expect(page.locator('#delve-wardrobe')).toBeVisible();
    for (let i = 0; i < 3; i++) await page.click('#delve-wr-random');
    await page.click('#delve-wr-done');
    await expect(page.locator('#delve-wardrobe')).toBeHidden();
    await page.waitForTimeout(250);
    const k1 = await page.evaluate(() => window.__delveDebug!.handle.renderer.dollKey);
    expect(k1).not.toBe(k0);
    const a1 = await page.evaluate(() => window.__delveDebug!.game.appearance);
    expect({ race: a1.race, outfit: a1.outfit, acc: a1.acc, glasses: a1.glasses }).toEqual({ race: a0.race, outfit: a0.outfit, acc: a0.acc, glasses: a0.glasses });
  });

  test('紙娃娃：戴頭盔 → 精靈快取 key 換了；外觀欄蓋過防具的樣子；隱藏開關；說明框試穿；存檔後還在', async ({ page }) => {
    await page.goto('/games/delve?seed=doll-e2e&autostart=1&fresh=1');
    await waitGame(page);
    const key = (): Promise<string> => page.evaluate(() => window.__delveDebug!.handle.renderer.dollKey);
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
    // 往下爬是另一套動作
    await page.keyboard.down('KeyS');
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => window.__delveDebug!.handle.renderer.playerAnim)).toBe('climbdown');
    await page.keyboard.up('KeyS');
    await page.waitForTimeout(300);
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
    // 腳底（y + 碰撞盒高）站在井口的地面上
    const h = await page.evaluate(() => window.__delveDebug!.game.player.h);
    expect(st.y + h).toBeLessThanOrEqual(at.top * 16 + 0.5);
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
  test('手持物：7 種武器 × 前 / 斜上 / 上 / 斜下 × 揮擊每一段（加上拿著不揮）、火把 / 方塊 / 釣竿 / 迴旋鏢拿著，左右都看——(1) 手持物每一格都看得到（不被身體 / 頭 / 臉蓋掉）(2) 不蓋到眼睛和嘴', async ({ page }) => {
    test.setTimeout(240000);
    // 紫眼（色票裡只有史詩紫用到，畫面上不會撞色）
    await page.addInitScript(() => { try { localStorage.setItem('delve.appearance', JSON.stringify({ body: 0, blush: true, hair: 1, hairColor: 7, ahoge: true, eyes: 3, eyeShape: 0, skin: 0, outfit: 1, color1: 2, color2: 3, acc: 1, glasses: false })); } catch { /* ignore */ } });
    await page.goto('/games/delve?seed=face-e2e&autostart=1&fresh=1');
    await waitGame(page);
    await page.evaluate(() => {
      const d = window.__delveDebug!, g = d.game, w = g.world;
      d.game.setDate({ hour: 12 });
      const x0 = g.spawn.x - 20, fy = Math.max(12, w.surfaceAt(g.spawn.x) - 24);
      for (let y = fy - 16; y < fy; y++) for (let x = x0 - 2; x < x0 + 44; x++) { w.setFg(x, y, 0); w.setLiquid(x, y, 0, 0); }
      for (let x = x0 - 2; x < x0 + 44; x++) w.setFg(x, fy, 3);
      g.teleport(x0 + 20, fy - 1); d.handle.renderer.snapCamera();
    });
    // 法杖尖端的光暈（'lighter' 疊加的照明效果，不是武器本身）先關掉：只看武器有沒有蓋到臉
    await page.evaluate(() => { (window.__delveDebug!.handle.renderer as unknown as { drawGlows: () => void }).drawGlows = () => {}; });
    await page.waitForTimeout(400);
    // 臉那一層（影格表第 3 列）裡眼睛 / 嘴的像素，在畫面緩衝上是不是還是一樣的顏色
    const face = (): Promise<{ n: number; bad: number }> => page.evaluate(() => {
      const r = window.__delveDebug!.handle.renderer as unknown as { playerDraw: { fi: number; x: number; y: number; ox: number; oy: number; facing: number } | null; drawCam: { x: number; y: number }; buf: HTMLCanvasElement; sprites: { sheetFor(look: unknown, key: string, i?: number): { canvas: HTMLCanvasElement } } };
      const pd = r.playerDraw;
      if (!pd) return { n: 0, bad: -1 };
      const FW = 52, FH = 54, t = document.createElement('canvas');
      t.width = FW; t.height = FH;
      const tc = t.getContext('2d')!;
      const doll = window.__delveDebug!.game.doll();
      tc.drawImage(r.sprites.sheetFor(doll.look, doll.key, pd.fi).canvas, pd.fi * FW, FH * 3, FW, FH, 0, 0, FW, FH);
      const fd = tc.getImageData(0, 0, FW, FH).data, bc = r.buf.getContext('2d')!, bd = bc.getImageData(0, 0, r.buf.width, r.buf.height);
      // 眼睛（紫羅蘭瞳 + 上眼瞼）與嘴（深紅 / 紅 / 舌頭）
      const want = new Set(['2c2450', '9a6ee0', '472819', '8c2038', 'c8344c', 'e890b0']);
      let n = 0, bad = 0;
      for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
        const i = (y * FW + x) * 4;
        if (fd[i + 3] < 255) continue;
        const hx = [fd[i], fd[i + 1], fd[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
        if (!want.has(hx)) continue;
        n++;
        const bx = Math.round(pd.x - r.drawCam.x) + (pd.facing > 0 ? pd.ox + x : -(pd.ox + x) - 1), by = Math.round(pd.y - r.drawCam.y) + pd.oy + y;
        const j = (by * bd.width + bx) * 4;
        const bh = [bd.data[j], bd.data[j + 1], bd.data[j + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
        if (bh !== hx) bad++;
      }
      return { n, bad };
    });
    // 手持物（renderer 記下的這一幀手上那幾張）每一個不透明像素，在畫面緩衝上是不是還是它自己的顏色（沒被後畫的東西蓋掉）
    const held = (): Promise<{ n: number; hidden: number }> => page.evaluate(() => {
      const r = window.__delveDebug!.handle.renderer as unknown as { playerDraw: { x: number; y: number; facing: number } | null; heldDraws: { c: HTMLCanvasElement; x: number; y: number }[]; drawCam: { x: number; y: number }; buf: HTMLCanvasElement };
      const pd = r.playerDraw;
      if (!pd) return { n: 0, hidden: -1 };
      const bd = r.buf.getContext('2d')!.getImageData(0, 0, r.buf.width, r.buf.height), X = Math.round(pd.x - r.drawCam.x), Y = Math.round(pd.y - r.drawCam.y);
      // 後畫的那幾張會蓋掉先畫的（同一隻手上的東西互相疊）：每個局部座標只看最後畫的那張
      const top = new Map<string, number[]>();
      for (const d of r.heldDraws) {
        const t = document.createElement('canvas'); t.width = d.c.width; t.height = d.c.height;
        const tc = t.getContext('2d')!; tc.drawImage(d.c, 0, 0);
        const px = tc.getImageData(0, 0, t.width, t.height).data;
        for (let j = 0; j < t.height; j++) for (let i = 0; i < t.width; i++) { const k = (j * t.width + i) * 4; if (px[k + 3] === 255) top.set(`${d.x + i},${d.y + j}`, [px[k], px[k + 1], px[k + 2]]); }
      }
      let n = 0, hidden = 0;
      for (const [key, c] of top) {
        const [lx, ly] = key.split(',').map(Number);
        const bx = X + (pd.facing > 0 ? lx : -lx - 1), by = Y + ly;
        if (bx < 0 || by < 0 || bx >= bd.width || by >= bd.height) continue;
        n++;
        const j = (by * bd.width + bx) * 4;
        if (bd.data[j] !== c[0] || bd.data[j + 1] !== c[1] || bd.data[j + 2] !== c[2]) hidden++;
      }
      return { n, hidden };
    });
    const check = async (what: string): Promise<void> => {
      const f = await face(), h = await held();
      expect(f.bad, `${what}：蓋到眼睛 / 嘴`).toBe(0);
      expect(h.hidden, `${what}：手持物被蓋掉（共 ${h.n} 格）`).toBe(0);
      expect(h.n, `${what}：手持物有畫出來`).toBeGreaterThan(4);
    };
    const base = await face();
    expect(base.n).toBeGreaterThan(8);
    expect(base.bad).toBe(0);
    const hold = (item: string): Promise<void> => page.evaluate((item) => {
      const g = window.__delveDebug!.game; g.give(item as never, 1);
      const i = g.inventory.slots.findIndex((s) => s?.item === item); g.inventory.swap(i, 0); g.selectSlot(0);
    }, item);
    const facing = async (key: string): Promise<void> => { await page.keyboard.down(key); await page.waitForTimeout(60); await page.keyboard.up(key); await page.waitForTimeout(200); };
    const KIND: Record<string, string> = { wood_sword: 'sword', bone_greatsword: 'broadsword', iron_spear: 'spear', wood_bow: 'bow', crystal_staff: 'staff', throwing_knife: 'throw', wood_boomerang: 'boomerang' };
    for (const item of Object.keys(KIND)) {
      await hold(item);
      for (const side of ['KeyD', 'KeyA']) {
        await facing(side);
        // 拿著不揮
        await page.waitForTimeout(120);
        await check(`${item} ${side} 拿著`);
        const dir = side === 'KeyD' ? 1 : -1;
        for (const deg of [0, -45, -90, 45]) for (const p of [0, 0.1, 0.2, 0.3, 0.45, 0.6, 0.8, 0.95]) {
          // 揮擊定格：進度固定在 p（dur 拉很長）、瞄準角固定
          await page.evaluate(([item, kind, deg, p, dir]) => {
            const g = window.__delveDebug!.game as unknown as { attack: Record<string, unknown> | null };
            const a = (dir as number) > 0 ? ((deg as number) * Math.PI) / 180 : Math.PI - ((deg as number) * Math.PI) / 180;
            g.attack = { item, kind, t: (p as number) * 1e7, dur: 1e7, angle: a, dir, id: -1, dmg: 0, kb: 0, fx: null };
          }, [item, KIND[item], deg, p, dir] as const);
          await page.waitForTimeout(50);
          // 飛刀 / 迴旋鏢丟出去之後手上就沒東西了（只檢查不蓋臉）
          if ((KIND[item] === 'throw' || KIND[item] === 'boomerang') && p >= 0.5) { const f = await face(); expect(f.bad, `${item} ${side} ${deg}° p=${p}`).toBe(0); continue; }
          await check(`${item} ${side} ${deg}° p=${p}`);
        }
        await page.evaluate(() => { (window.__delveDebug!.game as unknown as { attack: unknown }).attack = null; });
      }
    }
    // 不是武器的手持物：火把 / 方塊 / 釣竿
    for (const item of ['torch', 'dirt', 'wood_rod']) {
      await hold(item);
      for (const side of ['KeyD', 'KeyA']) { await facing(side); await page.waitForTimeout(120); await check(`${item} ${side} 拿著`); }
    }
  });
});

test.describe('delve 時裝收集（布衣 / 梳妝台 / 轉生之藥 / 舊角色轉換）', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'canvas sandbox smoke runs on chromium only');
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('delve.peaceful', '1'); localStorage.setItem('delve.help.seen', '1'); } catch { /* ignore */ } });
  });
  /** OUTFITS 索引（engine/appearance.ts，只能 append）：13 = 哥德洋裝、14 = 基本布衣 */
  const GOTHIC = 13, PLAIN = 14;
  type Tinted = { item: string; tint?: number[] } | null;
  /** 外觀欄某格：{ item, tint }（沒東西 = null） */
  const vanityOf = (page: Page, slot: string): Promise<Tinted> => page.evaluate((slot) => {
    const st = window.__delveDebug!.game.vanity.getStack(slot as never);
    return st ? { item: st.item, tint: st.tint ? [...st.tint] : undefined } : null;
  }, slot);
  /** 畫布內容（比對像素用） */
  const canvasUrl = (page: Page, sel: string): Promise<string> => page.locator(sel).first().evaluate((c) => (c as HTMLCanvasElement).toDataURL());
  const vanityCell = (slot: string): string => `#delve-vanity .delve-slot[data-vanity="${slot}"] canvas`;
  /** 遊戲中 Esc → 選單「回到標題」（會先存檔） */
  const toTitle = async (page: Page): Promise<void> => {
    await page.keyboard.press('Escape');
    await expect(page.locator('#delve-menu')).toBeVisible();
    await page.click('#delve-to-title');
    await expect(page.locator('#delve-root')).toHaveAttribute('data-phase', 'title', { timeout: 15000 });
    await expect(page.locator('#delve-tmenu')).toBeVisible();
    await expect(page.locator('#delve-wipe')).toBeHidden({ timeout: 5000 });
  };
  /** 存檔 → 重新整理 → 繼續冒險 */
  const saveAndReload = async (page: Page): Promise<void> => {
    await page.evaluate(() => window.__delveDebug!.save());
    await page.goto('/games/delve');
    await pressStart(page);
    await page.click('#delve-continue');
    await waitGame(page);
  };
  /** characters 裡唯一的角色記錄：{ cformat, preview, appearance }（解壓 data） */
  const onlyCharacter = (page: Page): Promise<{ cformat: number; preview: { level: number; appearance: Record<string, unknown>; look?: Record<string, { look: string; tint?: number[] } | null> }; appearance: Record<string, unknown> }> =>
    page.evaluate(() => new Promise((ok, bad) => {
      const r = indexedDB.open('delve');
      r.onsuccess = () => {
        const d = r.result, q = d.transaction('characters').objectStore('characters').getAll();
        q.onsuccess = async () => {
          d.close();
          try {
            if (q.result.length !== 1) throw new Error(`characters: ${q.result.length}`);
            const rec = q.result[0];
            const raw = await new Response(new Blob([rec.data]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
            const c = JSON.parse(new TextDecoder().decode(raw));
            ok({ cformat: c.cformat, preview: rec.preview, appearance: c.appearance });
          } catch (e) { bad(e); }
        };
        q.onerror = () => bad(q.error);
      };
      r.onerror = () => bad(r.error);
    }));

  test('new character wears plain clothes and sees no outfit rows', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/games/delve');
    await pressStart(page);
    await openNewLook(page);
    const wr = page.locator('#delve-wardrobe');
    await expect(page.locator('#delve-wr-title')).toHaveText('角色外觀');
    const keys = async (): Promise<string[]> => wr.locator('.delve-wr-row').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.key ?? ''));
    const want = ['body', 'race', 'hair', 'hairColor', 'ahoge', 'eyes', 'eyeShape', 'skin', 'blush', 'color1', 'color2'];
    // 建角只有身體特徵 + 種族 + 布衣配色：沒有服裝 / 頭飾 / 眼鏡列
    expect([...await keys()].sort()).toEqual([...want].sort());
    await expect(wr.locator('.delve-wr-group', { hasText: '布衣' })).toHaveCount(1);
    await expect(wr.locator('.delve-wr-group', { hasText: '服裝' })).toHaveCount(0);
    // 隨機也不會冒出服裝 / 頭飾 / 眼鏡
    for (let i = 0; i < 4; i++) await page.click('#delve-wr-random');
    expect([...await keys()].sort()).toEqual([...want].sort());
    await page.click('#delve-wr-done');
    await expect(wr).toBeHidden();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('delve.appearance') ?? '{}'));
    expect({ outfit: saved.outfit, acc: saved.acc, glasses: saved.glasses }).toEqual({ outfit: PLAIN, acc: 0, glasses: false });
    // 建立角色 → 新世界：穿布衣、沒有頭飾 / 眼鏡、外觀欄全空
    await page.fill('#delve-nick', '布衣');
    await page.click('#delve-newchar-create');
    await expect(page.locator('#delve-worldpanel')).toBeVisible();
    await page.click('#delve-new');
    await page.fill('#delve-seed', 'plain-e2e');
    await page.click('#delve-create');
    await waitGame(page);
    const st = await page.evaluate(() => {
      const g = window.__delveDebug!.game, a = g.appearance, l = g.doll().look;
      return { outfit: a.outfit, acc: a.acc, glasses: a.glasses, vanity: g.vanity.toJSON().slots, look: [l.head, l.body, l.legs, l.back, l.acc] };
    });
    expect({ outfit: st.outfit, acc: st.acc, glasses: st.glasses }).toEqual({ outfit: PLAIN, acc: 0, glasses: false });
    expect(Object.values(st.vanity).every((v) => v === null)).toBe(true);
    expect(st.look).toEqual([null, null, null, null, null]);
    expect(errors).toEqual([]);
  });

  test('vanity table restyles hair and recolours worn clothes', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/games/delve?seed=vanity-e2e&autostart=1&fresh=1');
    await waitGame(page);
    // 先穿上一件兩色的時裝（水手服上衣，原色）
    await page.evaluate(() => {
      const g = window.__delveDebug!.game; g.give('sailor_top', 1);
      g.equipVanityFromInventory(g.inventory.slots.findIndex((s: { item: string } | null) => s?.item === 'sailor_top'));
    });
    expect((await vanityOf(page, 'body'))?.item).toBe('sailor_top');
    const at = await placeVanityTable(page);
    const a0 = await page.evaluate(() => window.__delveDebug!.game.appearance);
    await useTile(page, at);
    const wr = page.locator('#delve-wardrobe');
    await expect(wr).toBeVisible();
    await expect(page.locator('#delve-wr-title')).toHaveText('梳妝台');
    expect(await page.evaluate(() => window.__delveDebug!.handle.paused)).toBe(true);
    // 沒有種族 / 服裝 / 頭飾 / 眼鏡列；身上的水手服上衣有自己的主色 / 副色列
    for (const k of ['race', 'outfit', 'acc', 'glasses']) await expect(wr.locator(`.delve-wr-row[data-key="${k}"]`)).toHaveCount(0);
    await expect(wr.locator('.delve-wr-group', { hasText: '水手服上衣' })).toHaveCount(1);
    const hairRow = wr.locator('.delve-wr-row[data-key="hair"]'), c1Row = wr.locator('.delve-wr-row[data-key="body.color1"]');
    const c2Row = wr.locator('.delve-wr-row[data-key="body.color2"]');
    await expect(c2Row).toHaveCount(1);
    await hairRow.locator('[data-dir="1"]').click();
    const hair = Number(await hairRow.getAttribute('data-value'));
    expect(hair).not.toBe(a0.hair);
    const col0 = Number(await c1Row.getAttribute('data-value'));
    await c1Row.locator('[data-dir="1"]').click();
    const col1 = Number(await c1Row.getAttribute('data-value'));
    expect(col1).not.toBe(col0);
    const col2 = Number(await c2Row.getAttribute('data-value'));
    // 按完成之前遊戲裡的角色不變
    expect(await page.evaluate(() => window.__delveDebug!.game.appearance.hair)).toBe(a0.hair);
    await page.click('#delve-wr-done');
    await expect(wr).toBeHidden();
    expect(await page.evaluate(() => window.__delveDebug!.handle.paused)).toBe(false);
    const after = await page.evaluate(() => window.__delveDebug!.game.appearance);
    expect(after.hair).toBe(hair);
    expect({ race: after.race, outfit: after.outfit, acc: after.acc, glasses: after.glasses }).toEqual({ race: a0.race, outfit: a0.outfit, acc: a0.acc, glasses: a0.glasses });
    expect(await vanityOf(page, 'body')).toEqual({ item: 'sailor_top', tint: [col1, col2] });
    // 存檔 → 重新整理 → 繼續：髮型與這件衣服的顏色都還在
    await saveAndReload(page);
    expect(await page.evaluate(() => window.__delveDebug!.game.appearance.hair)).toBe(hair);
    expect(await page.evaluate(() => window.__delveDebug!.game.appearance.race)).toBe(a0.race);
    expect(await vanityOf(page, 'body')).toEqual({ item: 'sailor_top', tint: [col1, col2] });
    expect(errors).toEqual([]);
  });

  test('rebirth potion changes race; cancel keeps the potion', async ({ page }) => {
    await page.goto('/games/delve?seed=rebirth-e2e&autostart=1&fresh=1');
    await waitGame(page);
    await page.waitForFunction(() => window.__delveDebug!.game.player.onGround, undefined, { timeout: 10000 });
    // 腳邊清出空地（右鍵的地方不是可互動的方塊）、拿著轉生之藥
    const air = await page.evaluate(() => {
      const g = window.__delveDebug!.game, w = g.world, f = g.feetTile();
      for (let x = f.x - 2; x <= f.x + 3; x++) { for (let y = f.y - 4; y <= f.y; y++) { w.setFg(x, y, 0); w.setLiquid(x, y, 0, 0); } w.setFg(x, f.y + 1, 3); }
      g.give('rebirth_potion', 1);
      return { x: f.x + 2, y: f.y - 2 };
    });
    await holdItem(page, 'rebirth_potion', 3);
    const race0 = await page.evaluate(() => window.__delveDebug!.game.appearance.race);
    const potions = (): Promise<number> => page.evaluate(() => window.__delveDebug!.game.inventory.count('rebirth_potion'));
    const race = (): Promise<number> => page.evaluate(() => window.__delveDebug!.game.appearance.race);
    const wr = page.locator('#delve-wardrobe');
    const drink = async (): Promise<void> => {
      await rightClickTile(page, air);
      await expect(wr).toBeVisible();
      await expect(page.locator('#delve-wr-title')).toHaveText('轉生之藥');
    };
    // 只有種族一列；開著時暫停
    await drink();
    expect(await wr.locator('.delve-wr-row').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.key))).toEqual(['race']);
    expect(await page.evaluate(() => window.__delveDebug!.handle.paused)).toBe(true);
    // Esc：換了種族也不算，藥還在
    await wr.locator('.delve-wr-row[data-key="race"] [data-dir="1"]').click();
    await page.keyboard.press('Escape');
    await expect(wr).toBeHidden();
    await expect(page.locator('#delve-menu')).toBeHidden();
    expect(await page.evaluate(() => window.__delveDebug!.handle.paused)).toBe(false);
    expect(await potions()).toBe(1);
    expect(await race()).toBe(race0);
    // 取消鈕：一樣不消耗
    await drink();
    await wr.locator('.delve-wr-row[data-key="race"] [data-dir="1"]').click();
    await page.click('#delve-wr-cancel');
    await expect(wr).toBeHidden();
    expect(await potions()).toBe(1);
    expect(await race()).toBe(race0);
    // 選回同一族按完成：不消耗、提示
    await drink();
    await expect(wr.locator('.delve-wr-row[data-key="race"]')).toHaveAttribute('data-value', String(race0));
    await page.click('#delve-wr-done');
    await expect(wr).toBeHidden();
    await expect(page.locator('#delve-toast')).toContainText('種族沒有改變');
    expect(await potions()).toBe(1);
    expect(await race()).toBe(race0);
    // 換一族按完成：消耗剛好一瓶
    await drink();
    await wr.locator('.delve-wr-row[data-key="race"] [data-dir="1"]').click();
    const want = Number(await wr.locator('.delve-wr-row[data-key="race"]').getAttribute('data-value'));
    expect(want).not.toBe(race0);
    await page.click('#delve-wr-done');
    await expect(wr).toBeHidden();
    await expect(page.locator('#delve-toast')).toContainText('轉生成');
    expect(await race()).toBe(want);
    expect(await potions()).toBe(0);
    // 存檔 → 重新整理 → 繼續：新種族還在
    await saveAndReload(page);
    expect(await race()).toBe(want);
    expect(await potions()).toBe(0);
  });

  test('old character keeps its look after conversion', async ({ page }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/games/delve?seed=old-look&autostart=1&fresh=1');
    await waitGame(page);
    // 舊角色的樣子：哥德洋裝 + 自訂主色 / 副色 + 蝴蝶結（先不戴眼鏡：轉換後眼鏡會進背包，這張當「轉換後該長這樣」的對照）
    await page.evaluate(([outfit]) => {
      const g = window.__delveDebug!.game;
      g.setAppearance({ ...g.appearance, outfit, color1: 5, color2: 4, acc: 1, glasses: false });
    }, [GOTHIC]);
    await toTitle(page);
    await page.click('#delve-start');
    await expect(page.locator('#delve-charpanel')).toBeVisible({ timeout: 15000 });
    const doll = '#delve-charlist .delve-char-doll';
    const ref = await canvasUrl(page, doll);
    // 把角色記錄改成 PR #296 的舊角色檔（cformat 1、戴眼鏡、列表預覽只有外觀）
    await page.evaluate(() => new Promise<void>((ok, bad) => {
      const r = indexedDB.open('delve');
      r.onsuccess = () => {
        const d = r.result, q = d.transaction('characters').objectStore('characters').getAll();
        q.onsuccess = async () => {
          try {
            if (q.result.length !== 1) throw new Error(`characters: ${q.result.length}`);
            const rec = q.result[0];
            const gz = (s: ReadableStream, t: CompressionStream | DecompressionStream): Promise<ArrayBuffer> => new Response(s.pipeThrough(t)).arrayBuffer();
            const c = JSON.parse(new TextDecoder().decode(await gz(new Blob([rec.data]).stream(), new DecompressionStream('gzip'))));
            c.cformat = 1;
            c.appearance.glasses = true;
            const data = new Uint8Array(await gz(new Blob([new TextEncoder().encode(JSON.stringify(c))]).stream(), new CompressionStream('gzip')));
            const t = d.transaction('characters', 'readwrite');
            t.objectStore('characters').put({ ...rec, data, preview: { level: rec.preview.level, appearance: c.appearance } });
            t.oncomplete = () => { d.close(); ok(); };
            t.onerror = () => { d.close(); bad(t.error); };
          } catch (e) { d.close(); bad(e); }
        };
        q.onerror = () => bad(q.error);
      };
      r.onerror = () => bad(r.error);
    }));
    expect((await onlyCharacter(page)).cformat).toBe(1);
    await page.goto('/games/delve');
    await pressStart(page);
    await page.click('#delve-start');
    await expect(page.locator('#delve-charpanel')).toBeVisible({ timeout: 15000 });
    // 舊記錄的預覽照外觀畫（有眼鏡）
    expect(await canvasUrl(page, doll)).not.toBe(ref);
    await charRow(page, '旅人').locator('.delve-char-line').click();
    await worldRow(page, 'old-look').locator('.delve-world-line').click();
    await waitGame(page);
    // 轉換：洋裝上下身穿進時裝欄（帶原本的顏色）、蝴蝶結進飾品格、眼鏡進背包；外觀變布衣、顏色不動
    const inv = (): Promise<Record<string, number>> => page.evaluate(() => {
      const g = window.__delveDebug!.game;
      return Object.fromEntries(['gothic_top', 'gothic_bottom', 'acc_ribbon', 'acc_glasses'].map((k) => [k, g.inventory.count(k as never)]));
    });
    const expectConverted = async (): Promise<void> => {
      const a = await page.evaluate(() => window.__delveDebug!.game.appearance);
      expect({ outfit: a.outfit, acc: a.acc, glasses: a.glasses, color1: a.color1, color2: a.color2 }).toEqual({ outfit: PLAIN, acc: 0, glasses: false, color1: 5, color2: 4 });
      expect(await vanityOf(page, 'body')).toEqual({ item: 'gothic_top', tint: [5, 4] });
      expect(await vanityOf(page, 'legs')).toEqual({ item: 'gothic_bottom', tint: [5, 4] });
      expect(await vanityOf(page, 'acc')).toEqual({ item: 'acc_ribbon', tint: [4, 4] });
      expect(await vanityOf(page, 'head')).toBeNull();
      expect(await vanityOf(page, 'back')).toBeNull();
      expect(await inv()).toEqual({ gothic_top: 0, gothic_bottom: 0, acc_ribbon: 0, acc_glasses: 1 });
    };
    await expectConverted();
    await page.keyboard.press('KeyE');
    await expect(page.locator('#delve-inv')).toBeVisible();
    await expect(page.locator('#delve-vanity .delve-slot[data-vanity="acc"]')).toHaveAttribute('data-item', 'acc_ribbon');
    await expect(page.locator('#delve-vanity .delve-slot[data-vanity="body"]')).toHaveAttribute('data-item', 'gothic_top');
    await page.keyboard.press('KeyE');
    // 回到標題（存檔）：寫回 cformat 2，角色列表預覽畫時裝（和沒戴眼鏡的對照一模一樣，不是布衣）
    await toTitle(page);
    const rec = await onlyCharacter(page);
    expect(rec.cformat).toBe(2);
    expect(rec.preview.look?.body).toMatchObject({ look: 'outfit:gothic', tint: [5, 4] });
    expect(rec.preview.look?.legs).toMatchObject({ look: 'outfit:gothic', tint: [5, 4] });
    expect(rec.preview.look?.acc).toMatchObject({ look: 'acc:ribbon' });
    await page.click('#delve-start');
    await expect(page.locator('#delve-charpanel')).toBeVisible({ timeout: 15000 });
    expect(await canvasUrl(page, doll)).toBe(ref);
    // 再進一次：不會再發一次
    await charRow(page, '旅人').locator('.delve-char-line').click();
    await worldRow(page, 'old-look').locator('.delve-world-line').click();
    await waitGame(page);
    await expectConverted();
    expect(errors).toEqual([]);
  });

  test('fashion item colour survives chest and reload', async ({ page }) => {
    await page.goto('/games/delve?seed=tint-chest&autostart=1&fresh=1');
    await waitGame(page);
    await page.evaluate(() => { window.__delveDebug!.game.inventory.add('gothic_top', 1, undefined, [3, 7]); });
    const invTint = (): Promise<number[] | undefined> => page.evaluate(() => {
      const st = window.__delveDebug!.game.inventory.slots.find((s: { item: string } | null) => s?.item === 'gothic_top');
      return st?.tint ? [...st.tint] : undefined;
    });
    expect(await invTint()).toEqual([3, 7]);
    // 放箱子 → 打開 → 點背包格放進去 → 點箱子格拿回來：顏色一路跟著
    const at = await placeFurniture(page, 'chest', 24);
    await useTile(page, at);
    await expect(page.locator('#delve-chest')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#delve-inv')).toBeVisible();
    await page.locator('#delve-inv-grid .delve-slot[data-item="gothic_top"]').click();
    const inChest = await page.evaluate(() => {
      const st = window.__delveDebug!.game.chestSlots()!.find((s: { item: string } | null) => s?.item === 'gothic_top');
      return st?.tint ? [...st.tint] : null;
    });
    expect(inChest).toEqual([3, 7]);
    expect(await page.evaluate(() => window.__delveDebug!.game.inventory.count('gothic_top'))).toBe(0);
    await page.locator('#delve-chest-grid .delve-slot[data-item="gothic_top"]').click();
    expect(await invTint()).toEqual([3, 7]);
    await page.click('#delve-chest-close');
    await expect(page.locator('#delve-chest')).toBeHidden();
    // 右鍵穿上：時裝欄那件帶著顏色
    await expect(page.locator('#delve-inv')).toBeVisible();
    await page.locator('#delve-inv-grid .delve-slot[data-item="gothic_top"]').click({ button: 'right' });
    await expect(page.locator('#delve-vanity .delve-slot[data-vanity="body"]')).toHaveAttribute('data-item', 'gothic_top');
    expect(await vanityOf(page, 'body')).toEqual({ item: 'gothic_top', tint: [3, 7] });
    // 顏色真的畫到時裝欄格子上（像素）與紙娃娃上（重烘 key）：換一組顏色 → 不同；換回來 → 和原本一模一樣（紙娃娃會眨眼，比 key 不比像素）
    await page.waitForTimeout(200);
    const cell1 = await canvasUrl(page, vanityCell('body')), doll1 = await page.locator('#delve-doll').getAttribute('data-key');
    expect(doll1).toContain('outfit:gothic/');
    expect(doll1).toContain('/3.7');
    const recolor = (t: [number, number]): Promise<void> => page.evaluate((t) => {
      const d = window.__delveDebug!;
      if (!d.game.recolorWorn('body', t)) throw new Error('recolorWorn failed');
      d.handle.hud.refresh();
    }, t);
    await recolor([5, 2]);
    await page.waitForTimeout(200);
    expect(await canvasUrl(page, vanityCell('body'))).not.toBe(cell1);
    await expect(page.locator('#delve-doll')).not.toHaveAttribute('data-key', doll1!);
    await recolor([3, 7]);
    await page.waitForTimeout(200);
    expect(await canvasUrl(page, vanityCell('body'))).toBe(cell1);
    await expect(page.locator('#delve-doll')).toHaveAttribute('data-key', doll1!);
    // 存檔 → 重新整理 → 繼續：顏色還在，格子畫出來一樣
    await saveAndReload(page);
    expect(await vanityOf(page, 'body')).toEqual({ item: 'gothic_top', tint: [3, 7] });
    await page.keyboard.press('KeyE');
    await expect(page.locator('#delve-inv')).toBeVisible();
    await expect(page.locator('#delve-vanity .delve-slot[data-vanity="body"]')).toHaveAttribute('data-item', 'gothic_top');
    await page.waitForTimeout(200);
    expect(await canvasUrl(page, vanityCell('body'))).toBe(cell1);
  });
});

test.describe('delve 等級系統（經驗 / 升級 / 技能樹 / 主動技能）', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'canvas sandbox smoke runs on chromium only');
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('delve.peaceful', '1'); localStorage.setItem('delve.help.seen', '1'); } catch { /* ignore */ } });
  });
  const tileOnScreen = (page: Page, x: number, y: number): Promise<{ sx: number; sy: number }> => page.evaluate(([x, y]) => {
    const r = window.__delveDebug!.handle.renderer, c = (document.querySelector('#delve-canvas') as HTMLCanvasElement).getBoundingClientRect();
    return { sx: c.left + ((x + 0.5) * 16 - r.drawCam.x) * r.zoom, sy: c.top + ((y + 0.5) * 16 - r.drawCam.y) * r.zoom };
  }, [x, y]);
  /** 清出平地、從 0 經驗開始 */
  const flat = (page: Page): Promise<{ x: number; y: number }> => page.evaluate(() => {
    const g = window.__delveDebug!.game, w = g.world, f = g.feetTile();
    for (let x = f.x - 8; x <= f.x + 10; x++) { for (let y = f.y - 6; y <= f.y; y++) { w.setFg(x, y, 0); w.setLiquid(x, y, 0, 0); } w.setFg(x, f.y + 1, 3); }
    g.drainEvents();
    g.levels.load(null);
    return { x: f.x, y: f.y };
  });

  test('拿劍打死怪物 → 經驗條與數字增加；升級 → 橫幅 + 提示；生命上限 +2', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/games/delve?seed=lv-kill&autostart=1&fresh=1');
    await waitGame(page);
    await page.waitForFunction(() => window.__delveDebug!.game.player.onGround, undefined, { timeout: 10000 });
    const f = await flat(page);
    await expect(page.locator('#delve-xp-text')).toHaveText('1 級 · 0/200');
    const t = await page.evaluate(({ x, y }) => {
      const g = window.__delveDebug!.game;
      g.give('iron_sword', 1);
      const i = g.inventory.slots.findIndex((s: { item: string } | null) => s?.item === 'iron_sword');
      g.inventory.swap(i, 4); g.selectSlot(4);
      const e = g.spawnEnemy('gel_blob', x + 2, y);
      return { x: x + 2, y, id: e.id };
    }, f);
    const p = await tileOnScreen(page, t.x, t.y);
    await page.mouse.move(p.sx, p.sy);
    await page.mouse.down();
    await expect.poll(() => page.evaluate((id) => window.__delveDebug!.game.enemies.some((e: { id: number }) => e.id === id), t.id), { timeout: 8000 }).toBe(false);
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.__delveDebug!.game.levels.xp), { timeout: 4000 }).toBeGreaterThan(0);
    await expect(page.locator('#delve-xp-text')).not.toHaveText('1 級 · 0/200');
    const hp0 = await page.evaluate(() => window.__delveDebug!.game.getState().maxHp);
    // 升級（debug 加經驗到 2 級）
    await page.evaluate(() => { const g = window.__delveDebug!.game; g.addXp(200 - g.levels.xp + 3); });
    await expect(page.locator('#delve-lvup')).toBeVisible();
    await expect(page.locator('#delve-lvup-title')).toHaveText('升級！等級 2');
    await expect(page.locator('#delve-toast')).toContainText('升級！');
    await expect(page.locator('#delve-skill-pts')).toHaveText('1');
    expect(await page.evaluate(() => window.__delveDebug!.game.getState().maxHp)).toBe(hp0 + 2);
    await expect(page.locator('#delve-lvup')).toBeHidden({ timeout: 5000 });
    expect(errors).toEqual([]);
  });

  test('K 打開技能樹 → 方向鍵 + Enter 點技能 → 數值改變；存檔 → 重新整理 → 繼續：還在；重置技能樹', async ({ page }) => {
    await page.goto('/games/delve?seed=lv-tree&autostart=1&fresh=1');
    await waitGame(page);
    await flat(page);
    await page.evaluate(() => { const g = window.__delveDebug!.game; g.addXp(2160 - g.levels.xp); g.drainEvents(); });
    const hp0 = await page.evaluate(() => window.__delveDebug!.game.getState().maxHp);
    await page.keyboard.press('KeyK');
    const panel = page.locator('#delve-skills');
    await expect(panel).toBeVisible();
    expect(await page.evaluate(() => window.__delveDebug!.handle.paused)).toBe(true);
    await expect(page.locator('#delve-sk-points')).toContainText('可用技能點 6');
    // 焦點在根節點「鍛體」：Enter 點一級
    await expect(page.locator('.delve-sk-node[data-skill="b_vigor"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.delve-sk-node[data-skill="b_vigor"]')).toHaveAttribute('data-rank', '1');
    expect(await page.evaluate(() => window.__delveDebug!.game.getState().maxHp)).toBe(hp0 + 10);
    // ↓ 走到「突進」（2 級就能點）→ Enter
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.delve-sk-node[data-skill="b_dash"]')).toBeFocused();
    await expect(page.locator('#delve-sk-detail')).toContainText('突進');
    await page.keyboard.press('Enter');
    await expect(page.locator('.delve-sk-node[data-skill="b_dash"]')).toHaveAttribute('data-state', 'learned');
    // 沒點前置的：說明框寫原因
    await page.locator('.delve-sk-node[data-skill="b_eye"]').hover();
    await expect(page.locator('#delve-sk-tip-b_eye')).toBeVisible();
    await expect(page.locator('#delve-sk-tip-b_eye')).toContainText('前置：銳鋒');
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    expect(await page.evaluate(() => window.__delveDebug!.handle.paused)).toBe(false);
    // 主動技能：Q 突進
    const x0 = await page.evaluate(() => { const g = window.__delveDebug!.game; g.facing = 1; return g.player.x; });
    await page.keyboard.press('KeyQ');
    await expect.poll(() => page.evaluate((x) => (window.__delveDebug!.game.player.x - x) / 16, x0), { timeout: 3000 }).toBeGreaterThan(3);
    await expect(page.locator('#delve-act-dash')).toBeHidden(); // 桌面（非觸控）不顯示觸控鍵
    // 存檔 → 重新整理 → 繼續
    const before = await page.evaluate(async () => { const d = window.__delveDebug!; await d.save(); return d.game.levels.toJSON(); });
    await page.goto('/games/delve');
    await pressStart(page);
    await expect(page.locator('#delve-continue-sub')).toContainText('等級');
    await page.click('#delve-continue');
    await waitGame(page);
    const after = await page.evaluate(() => { const g = window.__delveDebug!.game; return { lv: g.levels.toJSON(), maxHp: g.getState().maxHp }; });
    expect(after.lv).toEqual(before);
    expect(after.maxHp).toBe(hp0 + 10);
    await expect(page.locator('#delve-xp-text')).toContainText('6 級');
    // 重置技能樹：要碎晶，按兩下確認
    await page.evaluate(() => window.__delveDebug!.game.give('gear_shard', 20));
    await page.click('#delve-skill-btn');
    await expect(page.locator('#delve-skills')).toBeVisible();
    await expect(page.locator('#delve-sk-respec')).toContainText('碎晶 5');
    await page.click('#delve-sk-respec');
    await expect(page.locator('#delve-sk-respec')).toHaveText('確定重置？');
    await page.click('#delve-sk-respec');
    await expect(page.locator('#delve-sk-msg')).toContainText('退回 2 點');
    const r = await page.evaluate(() => { const g = window.__delveDebug!.game; return { spent: g.levels.spent, shards: g.inventory.count('gear_shard'), maxHp: g.getState().maxHp }; });
    expect(r).toEqual({ spent: 0, shards: 15, maxHp: hp0 });
    await expect(page.locator('.delve-sk-node[data-skill="b_vigor"]')).toHaveAttribute('data-rank', '0');
  });

  test('日誌顯示等級；手機：技能鈕在生命區、技能樹分頁 + 大節點、沒有橫向捲動、觸控主動技能鍵', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.addInitScript(() => { try { localStorage.setItem('delve.peaceful', '1'); localStorage.setItem('delve.help.seen', '1'); } catch { /* ignore */ } });
    await page.goto('/games/delve?seed=lv-phone&autostart=1&fresh=1');
    await waitGame(page);
    await flat(page);
    await page.evaluate(() => { const g = window.__delveDebug!.game; g.addXp(2200); for (const id of ['b_vigor', 'b_dash'] as const) g.learnSkill(id); g.drainEvents(); });
    await expect(page.locator('#delve-act-dash')).toBeVisible();
    await expect(page.locator('#delve-act-slam')).toBeHidden();
    // 觸控版不寫按鍵：經驗條提示「點經驗條分配」、冷卻說明沒有（Q）
    await page.evaluate(() => { const g = window.__delveDebug!.game; g.addXp(5000); });
    await expect(page.locator('#delve-lvup-sub')).toContainText('點經驗條分配');
    await expect(page.locator('#delve-lvup-sub')).not.toContainText('按 K');
    await page.locator('#delve-skill-btn').tap();
    const panel = page.locator('#delve-skills');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('data-compact', '1');
    await expect(page.locator('.delve-sk-branch[data-branch="path"]')).toBeHidden();
    await page.locator('.delve-sk-tab[data-tab="path"]').tap();
    await expect(page.locator('.delve-sk-branch[data-branch="path"]')).toBeVisible();
    const node = page.locator('.delve-sk-node[data-skill="p_stride"]');
    const box = await node.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(40);
    // 點一下選取（詳情）、再點一下點一級
    await node.tap();
    await expect(page.locator('#delve-sk-detail')).toContainText('輕足');
    await expect(page.locator('#delve-sk-points')).not.toContainText('（Q）');
    expect(await page.evaluate(() => document.querySelector('#delve-skills')!.scrollTop)).toBeLessThan(200);
    expect(await page.evaluate(() => window.__delveDebug!.game.levels.rank('p_stride'))).toBe(0);
    await node.tap();
    await expect.poll(() => page.evaluate(() => window.__delveDebug!.game.levels.rank('p_stride'))).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator('#delve-skills-close').tap();
    await expect(panel).toBeHidden();
    // 日誌：等級行
    await page.evaluate(() => window.__delveDebug!.handle.ui.setJournal(true));
    await expect(page.locator('[data-testid="journal-level"]')).toContainText('等級 10');
    await ctx.close();
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
    // 記下每一則提示（同一刻升級的經驗提示可能馬上蓋掉據點升級的提示：看「有沒有出現過」，不看最後一則）
    await page.evaluate(() => {
      const hud = window.__delveDebug!.handle.hud, orig = hud.toast.bind(hud), log: string[] = [];
      (window as unknown as { __toasts: string[] }).__toasts = log;
      hud.toast = (m: string, ...a: unknown[]) => { log.push(m); return (orig as (...x: unknown[]) => void)(m, ...a); };
    });
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
    await expect.poll(() => page.evaluate(() => (window as unknown as { __toasts: string[] }).__toasts.some((m) => m.includes('據點升級'))), { timeout: 5000 }).toBe(true);
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
      g.settle.arriveDelay = 3;
    }, [h.x + 10, h.gy - 1]);
    await expect(page.locator('#delve-toast')).toContainText('搬進來了', { timeout: 30000 });
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

test.describe('delve settlements · layout & storage', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'canvas sandbox smoke runs on chromium only');
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('delve.peaceful', '1'); localStorage.setItem('delve.help.seen', '1'); } catch { /* ignore */ } });
  });

  /** HUD 上會互相蓋到的元素：角落按鈕、生命、快捷欄、小地圖 */
  const overlaps = (page: Page): Promise<string[]> => page.evaluate(() => {
    const vis = (e: Element): boolean => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
    const els = [...document.querySelectorAll('.delve-corner > .delve-chip'), document.querySelector('#delve-vitals'), document.querySelector('#delve-hotbar'), document.querySelector('#delve-minimap-canvas')]
      .filter((e): e is Element => Boolean(e) && vis(e as Element));
    const out: string[] = [];
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 1 && oy > 1) out.push(`${els[i].id || els[i].className} × ${els[j].id || els[j].className}`);
    }
    return out;
  });

  test('桌機 1024–1920：角落按鈕、生命、快捷欄、小地圖互不重疊', async ({ browser }) => {
    for (const [w, h] of [[1024, 768], [1280, 720], [1366, 768], [1440, 900], [1536, 864], [1920, 1080]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await ctx.newPage();
      await page.addInitScript(() => { try { localStorage.setItem('delve.peaceful', '1'); localStorage.setItem('delve.help.seen', '1'); } catch { /* ignore */ } });
      await page.goto('/games/delve?seed=layout-e2e&autostart=1&fresh=1');
      await waitGame(page);
      await expect(page.locator('#delve-vitals')).toBeVisible();
      await expect(page.locator('#delve-settle-btn')).toBeVisible();
      expect(await overlaps(page), `${w}×${h}`).toEqual([]);
      await ctx.close();
    }
  });

  test('橫放手機：開據點面板時觸控鍵收起來、不蓋住面板；HUD 不重疊', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.addInitScript(() => { try { localStorage.setItem('delve.peaceful', '1'); localStorage.setItem('delve.help.seen', '1'); } catch { /* ignore */ } });
    await page.goto('/games/delve?seed=layout-phone&autostart=1&fresh=1');
    await waitGame(page);
    await page.waitForFunction(() => window.__delveDebug!.game.player.onGround, undefined, { timeout: 10000 });
    expect(await overlaps(page)).toEqual([]);
    await page.evaluate(() => {
      const d = window.__delveDebug!, g = d.game, t = g.feetTile();
      g.world.setFg(t.x + 2, t.y, 98); g.settle.found(t.x + 2, t.y);
      d.handle.settleUi.openSettle(g.settle.cores[0].id);
    });
    await expect(page.locator('#delve-settle')).toBeVisible();
    await expect(page.locator('#delve-jump')).toBeHidden();
    const panel = await page.locator('#delve-settle').boundingBox();
    expect(panel!.y + panel!.height).toBeLessThanOrEqual(390);
    await page.evaluate(() => window.__delveDebug!.handle.settleUi.closeSettle());
    await expect(page.locator('#delve-jump')).toBeVisible();
    await ctx.close();
  });

  test('共享儲物（Lv3）：合成清單算上據點箱子的材料、標出「箱」，按下去從箱子扣、不會複製', async ({ page }) => {
    await page.goto('/games/delve?seed=storage-e2e&autostart=1&fresh=1');
    await waitGame(page);
    await page.waitForFunction(() => window.__delveDebug!.game.player.onGround, undefined, { timeout: 10000 });
    const info = await page.evaluate(() => {
      const d = window.__delveDebug!, g = d.game, w = g.world, t = g.feetTile();
      g.setDate({ hour: 10 });
      const gy = t.y + 1, x0 = t.x - 20;
      for (let x = x0 - 4; x < x0 + 60; x++) { for (let y = gy - 12; y < gy; y++) { w.setFg(x, y, 0); w.setWall(x, y, 0); w.setLiquid(x, y, 0, 0); } for (let y = gy; y < gy + 3; y++) w.setFg(x, y, 3); }
      const decos = [[[5, 0, 24], [6, 2, 79], [2, 4, 93]], [[5, 0, 61], [6, 3, 92], [2, 4, 93]], [[5, 0, 96], [6, 0, 95], [6, 3, 58]], [[5, 0, 88], [6, 0, 89], [6, 2, 79]]];
      decos.forEach((extra, k) => {
        const x = x0 + k * 9, top = gy - 6;
        for (let yy = top; yy < gy; yy++) for (let xx = x - 1; xx <= x + 8; xx++) {
          const edge = yy === top || xx === x - 1 || xx === x + 8;
          if (edge && w.getFg(xx, yy) === 53) continue;
          w.setFg(xx, yy, edge ? 7 : 0);
          if (!edge) w.setWall(xx, yy, 3);
        }
        for (let i = 0; i < 3; i++) w.setFg(x - 1, gy - 1 - i, 53);
        for (const [dx, dy, id] of [[1, 0, 76], [2, 0, 77], [3, 0, 66], [4, 0, 67], [7, 4, 10], ...extra]) w.setFg(x + dx, gy - 1 - dy, id);
      });
      const hx = x0 + 40;
      w.setFg(hx, gy - 1, 98); g.settle.found(hx, gy - 1);
      w.setFg(hx + 2, gy - 1, 11); // 工作台
      g.settle.refresh(w, true);
      const chest = w.chests.get(w.idx(x0 + 5, gy - 1))!;
      chest[0] = { item: 'planks', count: 30 };
      g.inventory.remove('planks', g.inventory.count('planks'));
      g.give('planks', 2);
      g.teleport(hx + 1, gy - 1);
      d.handle.renderer.snapCamera();
      return { level: g.settlementHere()?.level, ci: w.idx(x0 + 5, gy - 1) };
    });
    expect(info.level).toBe(3);
    await page.keyboard.press('KeyE');
    await expect(page.locator('#delve-station')).toContainText('共享儲物');
    const row = page.locator('.delve-recipe[data-recipe="table"]');
    await expect(row).toBeEnabled();
    await expect(row).toContainText('木板 32/8（箱 6）');
    await row.click();
    await expect.poll(() => page.evaluate(() => window.__delveDebug!.game.inventory.count('table'))).toBe(1);
    const after = await page.evaluate((ci) => {
      const g = window.__delveDebug!.game;
      return { bag: g.inventory.count('planks'), chest: g.world.chests.get(ci)![0]?.count ?? 0 };
    }, info.ci);
    // 背包的 2 片先用掉、其餘 6 片從箱子扣：總數剛好少 8
    expect(after).toEqual({ bag: 0, chest: 24 });
  });
});

// ── 世界 NPC：村落 / 矮人 / 遇見 / 委託 / 地標 ─────────────────────────────
test.describe('delve folk · villages, dwarves, encounters, quests', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'canvas sandbox smoke runs on chromium only');
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('delve.peaceful', '1'); localStorage.setItem('delve.help.seen', '1'); } catch { /* ignore */ } });
  });
  const rclick = async (page: Page, p: { sx: number; sy: number }): Promise<void> => {
    await page.mouse.move(p.sx, p.sy);
    await page.mouse.down({ button: 'right' }); await page.waitForTimeout(120); await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(80);
  };
  /** 走到某位 NPC 旁邊，回傳他在畫面上的位置 */
  const nearFolk = async (page: Page, key: string): Promise<{ sx: number; sy: number }> => {
    await page.evaluate((key) => {
      const d = window.__delveDebug!, n = d.game.folk.byKey(key)!;
      d.game.setDate({ hour: 12 });
      d.game.teleport(Math.floor((n.body.x + n.body.w / 2) / 16) + 2, Math.floor((n.body.y + n.body.h - 1) / 16));
      d.handle.renderer.snapCamera();
    }, key);
    await page.waitForTimeout(250);
    return page.evaluate((key) => {
      const d = window.__delveDebug!, q = d.game.folk.byKey(key)!, r = d.handle.renderer, c = (document.querySelector('#delve-canvas') as HTMLCanvasElement).getBoundingClientRect();
      return { sx: c.left + (q.body.x + q.body.w / 2 - r.drawCam.x) * r.zoom, sy: c.top + (q.body.y + q.body.h / 2 - r.drawCam.y) * r.zoom };
    }, key);
  };

  test('走近村落跳出發現橫幅；右鍵村長開面板 → 接委託 → L 委託清單有它；雜貨商買得到東西', async ({ page }) => {
    await page.goto('/games/delve?seed=folk-e2e&autostart=1&fresh=1');
    await waitGame(page);
    const v = await page.evaluate(() => { const g = window.__delveDebug!.game; g.give('silver_coin', 20); return g.villages[0]; });
    expect(v).toBeTruthy();
    await page.evaluate(([x, y]) => { const d = window.__delveDebug!; d.game.setDate({ hour: 12 }); d.game.teleport(x, y); d.handle.renderer.snapCamera(); }, [v.x0 - 16, v.ground - 1]);
    await expect(page.locator('#delve-banner-title')).toContainText(/發現：.+村/, { timeout: 5000 });
    await rclick(page, await nearFolk(page, 'v0:elder'));
    await expect(page.locator('#delve-folk')).toBeVisible();
    await expect(page.locator('[data-testid=folk-line]')).toHaveText(/「.+」/);
    await expect(page.locator('[data-testid=folk-aff]')).toContainText('好感');
    const accept = page.locator('#delve-folk-body [data-accept]').first();
    await expect(accept).toBeVisible();
    await accept.click();
    await expect.poll(() => page.evaluate(() => window.__delveDebug!.game.quests.active.length)).toBe(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('#delve-folk')).toBeHidden();
    await page.keyboard.press('KeyL');
    await expect(page.locator('#delve-quests')).toBeVisible();
    await expect(page.locator('[data-testid=quest-log] .delve-quest')).toHaveCount(1);
    await page.keyboard.press('KeyL');
    await expect(page.locator('#delve-quests')).toBeHidden();
    // 雜貨商
    await rclick(page, await nearFolk(page, 'v0:trader'));
    await expect(page.locator('#delve-folk-title')).toContainText('雜貨商');
    const t0 = await page.evaluate(() => window.__delveDebug!.game.inventory.count('torch'));
    await page.locator('[data-testid=folk-shop] [data-buy="0"]').click();
    await expect.poll(() => page.evaluate(() => window.__delveDebug!.game.inventory.count('torch'))).toBe(t0 + 10);
    // 好感度不夠的商品是鎖著的
    await expect(page.locator('[data-testid=folk-shop] .is-locked').first()).toBeDisabled();
  });

  test('紙娃娃畫布不被壓扁：外觀 / 新角色 / 角色列表 / 背包 / 說明框試穿 / 村民頭像都是整數倍、寬高比對', async ({ page }) => {
    for (const vp of [{ width: 1280, height: 800 }, { width: 812, height: 375 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(vp);
      await page.goto('/games/delve');
      await pressStart(page);
      await openNewLook(page);
      await expect(page.locator('#delve-wr-doll')).toBeVisible();
      await expectCrisp(page, '#delve-wr-doll');
      await page.click('#delve-wr-done');
      await expect(page.locator('#delve-new-doll')).toBeVisible();
      await expectCrisp(page, '#delve-new-doll');
      // 建立角色後，角色列表那一列的小人像也一樣
      await page.click('#delve-newchar-create');
      await expect(page.locator('#delve-worldpanel')).toBeVisible();
      await page.click('#delve-worlds-back');
      await expect(page.locator('#delve-charlist .delve-char-doll').first()).toBeVisible();
      await expectCrisp(page, '#delve-charlist .delve-char-doll');
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/games/delve?seed=folk-e2e&autostart=1&fresh=1');
    await waitGame(page);
    await page.evaluate(() => { window.__delveDebug!.game.give('witch_hat', 1); });
    await page.keyboard.press('KeyE');
    await expect(page.locator('#delve-doll-canvas')).toBeVisible();
    await expectCrisp(page, '#delve-doll-canvas');
    await page.locator('#delve-inv-grid .delve-slot[data-item="witch_hat"]').hover();
    await expect(page.locator('#delve-tip [data-testid="tip-doll"]')).toBeVisible();
    await expectCrisp(page, '#delve-tip [data-testid="tip-doll"]');
    await page.keyboard.press('KeyE');
    await expect(page.locator('#delve-inv')).toBeHidden();
    await rclick(page, await nearFolk(page, 'v0:elder'));
    await expect(page.locator('#delve-folk .delve-npc-face')).toBeVisible();
    await expectCrisp(page, '#delve-folk .delve-npc-face');
  });

  test('矮人地廳：矮人的面板（礦石商）、委託板開村長的委託、地標只能領一次', async ({ page }) => {
    await page.goto('/games/delve?seed=folk-e2e&autostart=1&fresh=1');
    await waitGame(page);
    await page.evaluate(() => window.__delveDebug!.game.give('silver_coin', 20));
    await rclick(page, await nearFolk(page, 'h0:ore_trader'));
    await expect(page.locator('#delve-folk-title')).toContainText('礦石商');
    await expect(page.locator('#delve-folk-title')).toContainText('・');
    await page.keyboard.press('Escape');
    // 委託板 → 村長的面板
    await page.evaluate(() => {
      const d = window.__delveDebug!, b = d.game.villages[0].board;
      d.game.teleport(b.x + 1, b.y); d.handle.renderer.snapCamera();
      d.game.interact(b.x, b.y);
    });
    await expect(page.locator('#delve-folk-title')).toContainText('村長');
    await page.keyboard.press('Escape');
    // 地標
    const r = await page.evaluate(() => {
      const d = window.__delveDebug!, g = d.game, l = g.landmarks.find((q) => q.tile === 109) ?? g.landmarks[0];
      g.teleport(l.x + 1, l.y); d.handle.renderer.snapCamera();
      const c0 = g.coins();
      g.interact(l.x, l.y);
      return { l, c0 };
    });
    await expect(page.locator('#delve-lore')).toBeVisible();
    await expect(page.locator('#delve-lore-kicker')).toContainText('新發現');
    const c1 = await page.evaluate(() => window.__delveDebug!.game.coins());
    expect(c1).toBeGreaterThanOrEqual(r.c0);
    await page.locator('#delve-lore-close').click();
    await page.evaluate((l) => window.__delveDebug!.game.interact(l.x, l.y), r.l);
    await expect(page.locator('#delve-lore-text')).toContainText('已經搜過了');
  });

  test('受困的探險者：面板救援 → 跟著走 → 到地表安全 → 收下謝禮；存檔讀回好感度 / 委託 / 邀請', async ({ page }) => {
    await page.goto('/games/delve?seed=folk-e2e&autostart=1&fresh=1');
    await waitGame(page);
    const key = await page.evaluate(() => {
      // 洞穴深處（大洞窟的地標旁；不在村落 / 地廳這種安全的地方）
      const d = window.__delveDebug!, g = d.game, l = g.landmarks.find((q) => q.site === 'cavern')!;
      g.teleport(l.x - 2, l.y); d.handle.renderer.snapCamera();
      return g.debugEncounter('stranded', 3)!.key;
    });
    await rclick(page, await nearFolk(page, key));
    await expect(page.locator('#delve-folk-title')).toContainText('受困');
    await page.locator('#delve-folk-body [data-svc=rescue]').click();
    await expect.poll(() => page.evaluate((k) => window.__delveDebug!.game.folk.byKey(k)!.following, key)).toBe(true);
    await page.keyboard.press('Escape');
    // 一起回到地表（傳送太遠他會原地等：測試直接把兩人放到出生點旁）
    await page.evaluate((k) => { const d = window.__delveDebug!, n = d.game.folk.byKey(k)!; d.game.teleport(d.game.spawn.x, d.game.spawn.y); n.body.x = d.game.player.x + 24; n.body.y = d.game.player.y + d.game.player.h - n.body.h; d.handle.renderer.snapCamera(); }, key);
    await expect.poll(() => page.evaluate((k) => { const n = window.__delveDebug!.game.folk.byKey(k)!; return { safe: Boolean(n.safe), following: Boolean(n.following) }; }, key), { timeout: 8000 })
      .toEqual({ safe: true, following: false });
    await rclick(page, await nearFolk(page, key));
    await page.locator('#delve-folk-body [data-turnin]').click();
    await expect.poll(() => page.evaluate(() => window.__delveDebug!.game.quests.completed.size)).toBe(1);
    await page.locator('#delve-folk-body [data-svc=invite]').click();
    await expect.poll(() => page.evaluate(() => window.__delveDebug!.game.settle.invited.has('guide'))).toBe(true);
    // 面板的敘述要一致：答應搬過來，就不會同時說「自己往家的方向走了」
    await expect(page.locator('#delve-folk-body')).toContainText('答應');
    await expect(page.locator('#delve-folk-body')).not.toContainText('往家的方向');
    const rescuedName = await page.evaluate((k) => window.__delveDebug!.game.folk.byKey(k)?.name ?? window.__delveDebug!.game.settle.idents.guide?.name, key);
    await page.evaluate(() => { window.__delveDebug!.game.folk.addAff('v0:trader', 33); });
    await page.evaluate(async () => { await window.__delveDebug!.save(); });
    await page.goto('/games/delve');
    await pressStart(page);
    await page.click('#delve-continue');
    await waitGame(page);
    const after = await page.evaluate(() => {
      const g = window.__delveDebug!.game;
      return { aff: g.folk.affinity('v0:trader'), done: g.quests.completed.size, invited: g.settle.invited.has('guide'), guide: g.settle.def('guide').name };
    });
    expect(after).toEqual({ aff: 33, done: 1, invited: true, guide: rescuedName });
  });

  test('觸控：拿著鎬點 NPC 會打開面板（不會挖地）；鍵盤 T 和最近的人說話、靠近時有提示；buff 顯示在 HUD', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 812, height: 375 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.addInitScript(() => { try { localStorage.setItem('delve.peaceful', '1'); localStorage.setItem('delve.help.seen', '1'); } catch { /* ignore */ } });
    await page.goto('/games/delve?seed=folk-e2e&autostart=1&fresh=1');
    await waitGame(page);
    const p = await nearFolk(page, 'v0:trader');
    await page.evaluate(() => { const g = window.__delveDebug!.game; g.selectSlot(g.inventory.slots.findIndex((s) => s?.item === 'wood_pickaxe')); });
    const mined0 = await page.evaluate(() => window.__delveDebug!.game.world.modifiedChunks.size);
    await page.touchscreen.tap(p.sx, p.sy);
    await expect(page.locator('#delve-folk')).toBeVisible();
    await expect(page.locator('#delve-folk-title')).toContainText('雜貨商');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__delveDebug!.game.world.modifiedChunks.size)).toBe(mined0);
    await ctx.close();
  });

  test('鍵盤 T：靠近 NPC 有「T 對話」提示，按 T 打開面板；多重 buff 顯示在 HUD', async ({ page }) => {
    await page.goto('/games/delve?seed=folk-e2e&autostart=1&fresh=1');
    await waitGame(page);
    await nearFolk(page, 'v0:elder');
    await expect(page.locator('[data-testid=talk-hint]')).toContainText('T');
    await page.keyboard.press('KeyT');
    await expect(page.locator('#delve-folk')).toBeVisible();
    await expect(page.locator('#delve-folk-title')).toContainText('村長');
    await page.keyboard.press('Escape');
    await page.evaluate(() => { const g = window.__delveDebug!.game; g.giveBuff('bless'); g.giveBuff('minesong'); });
    await expect(page.locator('[data-testid=buffs]')).toContainText('祝福');
    await expect(page.locator('[data-testid=buffs]')).toContainText('礦工之歌');
  });

  test('非和平模式：NPC 面板開著時遊戲暫停，關掉後繼續', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('delve.peaceful', '0'); } catch { /* ignore */ } });
    await page.goto('/games/delve?seed=folk-e2e&autostart=1&fresh=1');
    await waitGame(page);
    await page.evaluate(() => { window.__delveDebug!.game.peaceful = false; });
    await nearFolk(page, 'v0:elder');
    await page.evaluate(() => window.__delveDebug!.game.debugTalk('v0:elder'));
    await expect(page.locator('#delve-folk')).toBeVisible();
    const t0 = await page.evaluate(() => window.__delveDebug!.game.tick);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__delveDebug!.game.tick)).toBe(t0);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__delveDebug!.game.tick)).toBeGreaterThan(t0);
  });

  test('走開超過交易距離（10 格）面板就收起來（不會按了沒反應）', async ({ page }) => {
    await page.goto('/games/delve?seed=folk-e2e&autostart=1&fresh=1');
    await waitGame(page);
    await nearFolk(page, 'v0:trader');
    await page.evaluate(() => window.__delveDebug!.game.debugTalk('v0:trader'));
    await expect(page.locator('#delve-folk')).toBeVisible();
    await page.evaluate(() => { const d = window.__delveDebug!, n = d.game.folk.byKey('v0:trader')!; d.game.teleport(Math.floor(n.body.x / 16) + 12, Math.floor((n.body.y + n.body.h - 1) / 16)); });
    await expect(page.locator('#delve-folk')).toBeHidden({ timeout: 3000 });
    await expect(page.locator('#delve-toast')).toContainText('太遠');
  });

  test('面板不蓋小地圖按鈕列（含 iPad 直向 768×1024），提示訊息不蓋面板', async ({ browser }) => {
    const sizes: [number, number, boolean][] = [[768, 1024, true], [768, 1024, false], [1024, 768, false], [1440, 900, false], [375, 667, true], [812, 375, true]];
    for (const [w, h, touch] of sizes) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(touch ? { hasTouch: true, isMobile: true } : {}) });
      const page = await ctx.newPage();
      await page.addInitScript(() => { try { localStorage.setItem('delve.peaceful', '1'); localStorage.setItem('delve.help.seen', '1'); } catch { /* ignore */ } });
      await page.goto('/games/delve?seed=folk-e2e&autostart=1&fresh=1');
      await waitGame(page);
      await page.evaluate((touch) => {
        const d = window.__delveDebug!, n = d.game.folk.byKey('v0:elder')!;
        if (touch) document.querySelector<HTMLElement>('#delve-root')!.dataset.touch = '1';
        d.game.teleport(Math.floor(n.body.x / 16) + 1, Math.floor((n.body.y + n.body.h - 1) / 16));
        d.game.debugTalk('v0:elder');
      }, touch);
      await expect(page.locator('#delve-folk')).toBeVisible();
      await page.evaluate(() => window.__delveDebug!.handle.hud.toast('接下委託：收集：木材 ×34（這是一段比較長的提示訊息，看看會不會蓋到面板）', 5000));
      await page.waitForTimeout(500);
      const r = await page.evaluate(() => {
        const box = (s: string): DOMRect | null => { const e = document.querySelector(s); if (!e) return null; const st = getComputedStyle(e); if (st.display === 'none' || st.visibility === 'hidden') return null; const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 ? b : null; };
        const ov = (a: DOMRect | null, b: DOMRect | null): boolean => Boolean(a && b && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1);
        const p = box('#delve-folk'), t = box('#delve-toast'), mm = box('.delve-minimap-btns'), mc = box('#delve-minimap-canvas');
        return { toast: ov(p, t), mmBtns: ov(p, mm), mmCanvas: ov(p, mc), toastIn: t ? t.left >= -1 && t.right <= innerWidth + 1 : true };
      });
      expect(r, `${w}×${h}${touch ? ' touch' : ''}`).toEqual({ toast: false, mmBtns: false, mmCanvas: false, toastIn: true });
      await ctx.close();
    }
  });

  test('手機直向 375 / 橫向：NPC 面板與委託清單在畫面內、不蓋住快捷欄', async ({ browser }) => {
    for (const vp of [{ width: 375, height: 667 }, { width: 375, height: 812 }, { width: 812, height: 375 }]) {
      const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true });
      const page = await ctx.newPage();
      await page.addInitScript(() => { try { localStorage.setItem('delve.peaceful', '1'); localStorage.setItem('delve.help.seen', '1'); } catch { /* ignore */ } });
      await page.goto('/games/delve?seed=folk-e2e&autostart=1&fresh=1');
      await waitGame(page);
      await page.evaluate(() => { const d = window.__delveDebug!, n = d.game.folk.byKey('v0:elder')!; document.querySelector<HTMLElement>('#delve-root')!.dataset.touch = '1'; d.game.teleport(Math.floor(n.body.x / 16) + 2, Math.floor((n.body.y + n.body.h - 1) / 16)); d.game.debugTalk('v0:elder'); });
      for (const sel of ['#delve-folk', '#delve-quests']) {
        if (sel === '#delve-quests') await page.evaluate(() => window.__delveDebug!.handle.folkUi.setQuests(true));
        await expect(page.locator(sel)).toBeVisible();
        const b = (await page.locator(sel).boundingBox())!, hb = (await page.locator('#delve-hotbar').boundingBox())!;
        expect(b.x, `${sel} ${vp.width}`).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(vp.width + 1);
        expect(b.y + Math.min(b.height, 40)).toBeLessThanOrEqual(vp.height);
        const ov = Math.min(b.x + b.width, hb.x + hb.width) - Math.max(b.x, hb.x) > 1 && Math.min(b.y + b.height, hb.y + hb.height) - Math.max(b.y, hb.y) > 1;
        expect(ov, `${sel} 蓋到快捷欄 ${vp.width}×${vp.height}`).toBe(false);
        // 不蓋生命值（愛心）、高度夠用
        const hearts = (await page.locator('#delve-hearts').boundingBox())!;
        const ovH = Math.min(b.x + b.width, hearts.x + hearts.width) - Math.max(b.x, hearts.x) > 1 && Math.min(b.y + b.height, hearts.y + hearts.height) - Math.max(b.y, hearts.y) > 1;
        expect(ovH, `${sel} 蓋到生命 ${vp.width}×${vp.height}`).toBe(false);
        expect(await page.locator(sel).evaluate((e) => parseFloat(getComputedStyle(e).maxHeight) || e.getBoundingClientRect().height), `${sel} 可用高度 ${vp.width}×${vp.height}`).toBeGreaterThanOrEqual(260);
        expect(b.y + b.height).toBeLessThanOrEqual(vp.height + 1);
      }
      await ctx.close();
    }
  });
});
