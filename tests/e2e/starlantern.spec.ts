import { test, expect, type Page } from '@playwright/test';
import { SPECIALS, AFFIXES } from '../../src/scripts/games/starlantern/data/gear';
import { CHARACTERS } from '../../src/scripts/games/starlantern/data/characters';
import { EQUIPMENT } from '../../src/scripts/games/starlantern/data/equipment';

test.use({ launchOptions: { args: ['--mute-audio'] } });

const box = (page: Page) => page.locator('#sl-screen').boundingBox();

test.describe('starlantern', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'chromium only');

  /** The town's own greeting lines: what it says on 繼續 when there is no notice (such as 存檔無法讀取) to give. */
  const TOWN_LINE = /暮霧又濃了些|聽說迷宮深處有星燈的光|補給品記得在出發前備齊/;
  /** After 繼續: the town greets as usual, and the game in play is exactly the stored save. */
  const expectSaveLoaded = async (page: Page) => {
    await expect(page.locator('.slx-town .slx-talk .slx-text')).toHaveText(TOWN_LINE);
    const r = await page.evaluate(() => ({
      saved: JSON.parse(localStorage.getItem('starlantern-save') ?? 'null'),
      game: JSON.parse(JSON.stringify((window as unknown as Dbg).__starlanternDebug.game.state)),
    }));
    expect(r.saved).not.toBeNull();
    expect(r.game).toEqual(r.saved);
  };

  test('forwards the old preview address to the game page', async ({ page }) => {
    await page.goto('/games/starlantern-next?seed=3');
    await expect(page).toHaveURL(/\/games\/starlantern\?seed=3$/);
    await expect(page.locator('.slx-title')).toBeVisible();
  });

  for (const [w, h, scale] of [[1280, 720, 2], [1366, 768, 2], [2560, 1440, 4], [390, 844, 0.6], [320, 568, 0.5]] as const) {
    test(`fits a ${w}x${h} window without scrolling`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/games/starlantern');
      await expect(page.locator('#sl-screen')).toBeVisible();
      const b = (await box(page))!;
      expect(b.width).toBeCloseTo(640 * scale, 0);
      expect(b.height).toBeCloseTo(360 * scale, 0);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(w + 0.5);
      expect(b.y + b.height).toBeLessThanOrEqual(h + 0.5);
      const scroll = await page.evaluate(() => ({ x: document.documentElement.scrollWidth, y: document.documentElement.scrollHeight, w: innerWidth, h: innerHeight }));
      expect(scroll.x).toBeLessThanOrEqual(scroll.w);
      expect(scroll.y).toBeLessThanOrEqual(scroll.h);
    });
  }

  test('uses the pixel font and still renders when it fails to load', async ({ page }) => {
    await page.goto('/games/starlantern');
    // A face only downloads once something asks for it; load it explicitly, then confirm it resolved.
    expect(await page.evaluate(async () => (await document.fonts.load('12px "Cubic 11"')).length)).toBeGreaterThan(0);
    await page.route('**/Cubic_11.woff2', (r) => r.abort());
    await page.goto('/games/starlantern');
    await expect(page.locator('.slx-title [role=option]').first()).toHaveText('新遊戲');   // the game itself, not just the loading line
  });

  test('tells the player when a save could not be read, and starts fresh', async ({ page }) => {
    await page.goto('/games/starlantern');
    await page.evaluate(() => localStorage.setItem('starlantern-save', '{broken'));
    await page.reload();
    await page.locator('.slx-title [data-id=cont]').click();
    await expect(page.locator('.slx-town .slx-talk')).toContainText('存檔無法讀取');
    await expect(page.locator('.slx-gold')).toHaveText('150 G');
  });

  test('plays title → town with the keyboard only', async ({ page }) => {
    await page.goto('/games/starlantern');
    await page.evaluate(() => localStorage.removeItem('starlantern-save'));
    await page.reload();
    await expect(page.locator('.slx-title [aria-selected=true]')).toHaveText('新遊戲');
    await expect(page.locator('.slx-title [role=option]').nth(1)).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Enter');
    await expect(page.locator('.slx-town')).toBeVisible();
    await expect(page.locator('.slx-place')).toHaveText('邊境小鎮 露米亞');
    // the greeting types out: the first confirm completes it, the next closes it
    for (let i = 0; i < 4 && (await page.locator('.slx-talk').isVisible()); i++) await page.keyboard.press('z');
    await expect(page.locator('.slx-talk')).toBeHidden();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.slx-town [aria-selected=true]')).toHaveText('道具店');
    await page.keyboard.press('Escape');
    await expect(page.locator('.slx-town .slx-confirm')).toContainText('標題');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(page.locator('.slx-title')).toBeVisible();
    expect(await page.locator('#sl-screen button, #sl-screen select').count()).toBe(0);
  });

  test('walks through the four facilities with the keyboard', async ({ page }) => {
    await page.goto('/games/starlantern');
    await page.evaluate(() => localStorage.removeItem('starlantern-save'));
    await page.reload();
    const closeTalk = async () => { for (let i = 0; i < 4 && (await page.locator('.slx-talk').isVisible()); i++) await page.keyboard.press('z'); };
    await expect(page.locator('.slx-title [aria-selected=true]')).toHaveText('新遊戲');
    await page.keyboard.press('Enter');
    await expect(page.locator('.slx-town')).toBeVisible();
    await closeTalk();
    await page.keyboard.press('Enter');                       // 冒險者公會
    await expect(page.locator('.slx-guild')).toBeVisible();
    await closeTalk();
    await page.keyboard.press('Enter');                       // 編隊
    await expect(page.locator('.slx-formation-scene [data-cell]')).toHaveCount(9);
    await page.keyboard.press('Escape');                      // back to the guild, no greeting
    await expect(page.locator('.slx-guild')).toBeVisible();
    await page.keyboard.press('Escape');                      // back to town
    await expect(page.locator('.slx-town')).toBeVisible();
    await closeTalk();
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');                       // 旅館
    await expect(page.locator('.slx-inn')).toBeVisible();
    await closeTalk();
    await page.keyboard.press('Enter');                       // 休息
    await page.keyboard.press('ArrowUp');                     // 是
    await page.keyboard.press('Enter');
    await expect(page.locator('.slx-talk .slx-text')).toHaveText('已存檔。', { timeout: 5000 });
    expect(await page.evaluate(() => !!localStorage.getItem('starlantern-save'))).toBe(true);
    expect(await page.locator('#sl-screen button, #sl-screen select').count()).toBe(0);
  });

  test('plays with the mouse only: menus, dialogue and the 返回 control', async ({ page }) => {
    await page.goto('/games/starlantern');
    await page.evaluate(() => localStorage.removeItem('starlantern-save'));
    await page.reload();
    const talkThrough = async () => { for (let i = 0; i < 4 && (await page.locator('.slx-talk').isVisible()); i++) await page.locator('.slx-talk').click(); };
    await page.locator('.slx-title [data-id=new]').click();
    await expect(page.locator('.slx-town')).toBeVisible();
    await talkThrough();
    await page.locator('.slx-town [data-id=guild]').click();
    await expect(page.locator('.slx-guild')).toBeVisible();
    await talkThrough();
    await page.locator('.slx-cmd [data-id=formation]').click();
    await expect(page.locator('.slx-formation-scene')).toBeVisible();
    await page.locator('[data-cell="4"]').click();               // middle row, centre
    await page.locator('.slx-formation-pick [data-id=liz]').click();
    await expect(page.locator('[data-cell="4"]')).toContainText('莉茲');
    await page.locator('.slx-back').click();
    await expect(page.locator('.slx-guild')).toBeVisible();
    await page.locator('.slx-cmd [data-id=status]').click();
    await expect(page.locator('.slx-status-scene')).toBeVisible();
    await page.locator('[data-tab=skills]').click();
    await expect(page.locator('.slx-status-body')).toContainText('挑釁');
    await page.locator('.slx-status-next').click();
    await expect(page.locator('.slx-status-name')).toContainText('千鶴');
    await page.locator('.slx-back').click();
    await page.locator('.slx-cmd [data-id=equip]').click();
    await expect(page.locator('.slx-equip-scene')).toBeVisible();
    await page.locator('.slx-doll-slot[data-slot=body]').click();
    await expect(page.locator('.slx-doll-target')).toHaveAttribute('data-slot', 'body');
    await expect(page.locator('.slx-bag-cell')).toHaveCount(60);
    await page.locator('.slx-back').click();                       // first 返回 clears the target
    await expect(page.locator('.slx-doll-target')).toHaveCount(0);
    await page.locator('.slx-back').click();
    await expect(page.locator('.slx-guild')).toBeVisible();
    await page.locator('.slx-back').click();
    await expect(page.locator('.slx-town')).toBeVisible();
  });

  test('plays the whole loop: depart, fight, return with the lamp, rest, reload and continue', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/games/starlantern?seed=7&fast=1');
    await page.evaluate(() => localStorage.removeItem('starlantern-save'));
    await page.reload();
    const key = (k: string) => page.keyboard.press(k);
    const closeTalk = async () => { for (let i = 0; i < 6 && (await page.locator('.slx-talk').isVisible()); i++) await key('z'); };
    const choose = async (scope: string, label: string) => {
      for (let i = 0; i < 12; i++) {
        const cur = (await page.locator(`${scope} [aria-selected=true] .slx-label`).first().textContent()) ?? '';
        if (cur.startsWith(label)) break;
        await key('ArrowDown');
      }
      await key('Enter');
    };
    await expect(page.locator('.slx-title [aria-selected=true]')).toHaveText('新遊戲');
    await key('Enter');
    await expect(page.locator('.slx-town')).toBeVisible(); await closeTalk();
    await choose('.slx-town', '傳送門廣場');
    await expect(page.locator('.slx-gate')).toBeVisible(); await closeTalk();
    await key('Enter');                                    // 選擇傳送門
    await expect(page.locator('.slx-portal')).toHaveCount(3);
    await key('Enter');                                    // 星燈迷宮・本道 (the first card)
    await key('Enter');                                    // 第 1 層
    await key('ArrowUp'); await key('Enter');              // 是
    await expect(page.locator('.slx-dungeon')).toBeVisible();
    await expect(page.locator('.slx-partybar .slx-pm')).toHaveCount(5);
    for (let i = 0; i < 200 && !(await page.locator('.slx-battle').isVisible()); i++) {
      await key(i % 2 ? 'ArrowLeft' : 'ArrowRight');
      await closeTalk();
      if (await page.locator('.slx-confirm').isVisible()) await key('Enter');   // stepping on the return point asks; default 否
      if (await page.locator('.slx-event').isVisible()) await key('Escape');    // an event room (or a full pack): leave it
    }
    await expect(page.locator('.slx-battle')).toBeVisible();
    for (let i = 0; i < 40 && !(await page.locator('.slx-result').isVisible()); i++) {
      if (await page.locator('.slx-bcmd [role=option]').count()) { await key('ArrowUp'); await key('Enter'); }   // 全員攻擊 (last item)
      else await page.waitForTimeout(50);
    }
    await expect(page.locator('.slx-result')).toContainText('勝利');
    await key('Enter');
    await expect(page.locator('.slx-dungeon')).toBeVisible();
    await key('c');
    await choose('.slx-field-menu', '歸還之燈');
    await expect(page.locator('.slx-dungeon .slx-confirm')).toContainText('歸還之燈');
    await key('ArrowUp'); await key('Enter');                                                     // 是
    await expect(page.locator('.slx-town')).toBeVisible();
    await expect(page.locator('.slx-town .slx-talk')).toContainText('歸還之燈');
    await closeTalk();
    await choose('.slx-town', '旅館');
    await expect(page.locator('.slx-inn')).toBeVisible(); await closeTalk();
    await key('Enter'); await key('ArrowUp'); await key('Enter');
    await expect(page.locator('.slx-talk .slx-text')).toHaveText('已存檔。', { timeout: 5000 });
    const gold = await page.evaluate(() => (window as unknown as { __starlanternDebug: { game: { state: { gold: number } } } }).__starlanternDebug.game.state.gold);
    await page.reload();
    await expect(page.locator('.slx-title [aria-selected=true]')).toHaveText('繼續');
    await key('Enter');
    await expect(page.locator('.slx-town .slx-gold')).toHaveText(`${gold} G`);
    expect(errors).toEqual([]);
  });

  /** Shared walkers for the portal-run tests. */
  type Dbg = { __starlanternDebug: { game: any } };
  const setup = async (page: Page, seed: number) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`/games/starlantern?seed=${seed}&fast=1`);
    await page.evaluate(() => localStorage.removeItem('starlantern-save'));
    await page.reload();
    const key = (k: string) => page.keyboard.press(k);
    const closeTalk = async () => { for (let i = 0; i < 6 && (await page.locator('.slx-talk').isVisible()); i++) await key('z'); };
    const choose = async (scope: string, label: string) => {
      for (let i = 0; i < 12; i++) {
        const cur = (await page.locator(`${scope} [aria-selected=true] .slx-label`).first().textContent()) ?? '';
        if (cur.startsWith(label)) break;
        await key('ArrowDown');
      }
      await key('Enter');
    };
    await expect(page.locator('.slx-title [aria-selected=true]')).toHaveText('新遊戲');
    await key('Enter');
    await expect(page.locator('.slx-town')).toBeVisible(); await closeTalk();
    return { errors, key, closeTalk, choose };
  };
  const depart = async (page: Page, w: Awaited<ReturnType<typeof setup>>) => {
    await w.choose('.slx-town', '傳送門廣場');
    await expect(page.locator('.slx-gate')).toBeVisible(); await w.closeTalk();
    await w.key('Enter');                                   // 選擇傳送門
    await expect(page.locator('.slx-portal')).toHaveCount(3);
    await w.key('Enter'); await w.key('Enter');             // the mainline card, depth 1
    await w.key('ArrowUp'); await w.key('Enter');           // 是
    await expect(page.locator('.slx-dungeon')).toBeVisible();
  };
  const lampHome = async (page: Page, w: Awaited<ReturnType<typeof setup>>) => {
    await w.closeTalk();
    await w.key('c');
    await w.choose('.slx-field-menu', '歸還之燈');
    await w.key('ArrowUp'); await w.key('Enter');
    await expect(page.locator('.slx-town')).toBeVisible();
  };

  test('each departure is a new dungeon', async ({ page }) => {
    const w = await setup(page, 11);
    const floors: string[] = [];
    for (let run = 0; run < 2; run++) {
      await depart(page, w);
      floors.push(await page.evaluate(() => JSON.stringify((window as unknown as Dbg).__starlanternDebug.game.map().tiles)));
      await page.evaluate(() => { (window as unknown as Dbg).__starlanternDebug.game.state.inventory['return-lamp'] = 1; });   // the new game starts with one lamp only
      await lampHome(page, w); await w.closeTalk();
    }
    expect(floors[0]).not.toBe(floors[1]);
    expect(w.errors).toEqual([]);
  });

  test('a portal run reaches depth 2 and banks the loot', async ({ page }) => {
    const w = await setup(page, 5);
    await depart(page, w);
    // Plan a path of plain floor from the entrance to the stairs down inside the page (BFS over the live map).
    const keys: string[] = await page.evaluate(() => {
      const g = (window as unknown as Dbg).__starlanternDebug.game;
      const m = g.map();
      const D: [string, number, number][] = [['ArrowUp', 0, -1], ['ArrowDown', 0, 1], ['ArrowLeft', -1, 0], ['ArrowRight', 1, 0]];
      const prev = new Map<string, { from: string; k: string } | null>([[`${g.pos.x},${g.pos.y}`, null]]);
      const q = [{ ...g.pos }];
      while (q.length) {
        const p = q.shift()!;
        for (const [k, dx, dy] of D) {
          const n = { x: p.x + dx, y: p.y + dy }, id = `${n.x},${n.y}`;
          const t = m.tiles[n.y]?.[n.x];
          if (!t || prev.has(id) || !['floor', 'door', 'down'].includes(t)) continue;
          prev.set(id, { from: `${p.x},${p.y}`, k });
          if (t === 'down') {
            const out: string[] = [];
            for (let c: string | undefined = id; c && prev.get(c); c = prev.get(c)!.from) out.unshift(prev.get(c)!.k);
            return out;
          }
          q.push(n);
        }
      }
      return [];
    });
    expect(keys.length).toBeGreaterThan(0);
    await page.evaluate(() => { (window as unknown as Dbg).__starlanternDebug.game.run.loot.items['star-stone'] = 2; });
    for (const k of keys) {
      await page.evaluate(() => { (window as unknown as Dbg).__starlanternDebug.game.encounter = 0; });
      await page.keyboard.press(k);
    }
    // The stairs ask first: a fresh party is under the suggested level, so the window warns and defaults to staying.
    const stairs = page.locator('.slx-event-stairs');
    await expect(stairs.locator('.slx-event-title')).toHaveText('前往第 2 層？');
    await expect(stairs).toContainText('建議等級 Lv 6');
    await expect(stairs).toContainText('隊伍等級不足，可能會很危險');
    await expect(stairs.locator('[aria-selected=true] .slx-label')).toHaveText('留在這層');
    expect(await page.evaluate(() => (window as unknown as Dbg).__starlanternDebug.game.floor)).toBe(1);
    await w.choose('.slx-event-stairs', '前往');
    await expect(stairs).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as Dbg).__starlanternDebug.game.floor)).toBe(2);
    // The floor name first, then the depth-clear reward in a second message.
    const talk = page.locator('.slx-dungeon .slx-talk .slx-text');
    await expect(talk).toContainText('第 2 層');
    for (let i = 0; i < 4 && !((await talk.textContent()) ?? '').includes('踏破獎勵'); i++) await w.key('z');
    await expect(talk).toContainText('踏破獎勵：經驗值 +');
    await w.closeTalk();
    await lampHome(page, w);
    await expect(page.locator('.slx-town .slx-talk')).toContainText('歸還之燈');
    await expect(page.locator('.slx-town .slx-talk')).toContainText('星紋石 ×2');
    expect(await page.evaluate(() => (window as unknown as Dbg).__starlanternDebug.game.state.inventory['star-stone'])).toBe(2);
    expect(w.errors).toEqual([]);
  });

  /** Keys for a walk over plain floor from the party to the nearest `goal` tile not in `skip` (BFS over the live map). */
  const pathTo = (page: Page, goal: string, skip: string[] = []) => page.evaluate(({ goal, skip }) => {
    const g = (window as unknown as Dbg).__starlanternDebug.game;
    const m = g.map();
    const D: [string, number, number][] = [['ArrowUp', 0, -1], ['ArrowDown', 0, 1], ['ArrowLeft', -1, 0], ['ArrowRight', 1, 0]];
    const prev = new Map<string, { from: string; k: string } | null>([[`${g.pos.x},${g.pos.y}`, null]]);
    const q = [{ ...g.pos }];
    while (q.length) {
      const p = q.shift()!;
      for (const [k, dx, dy] of D) {
        const n = { x: p.x + dx, y: p.y + dy }, id = `${n.x},${n.y}`;
        const t = m.tiles[n.y]?.[n.x];
        if (!t || prev.has(id)) continue;
        if (t === goal && !skip.includes(id)) {
          const out: string[] = [k];
          for (let c: string | undefined = `${p.x},${p.y}`; c && prev.get(c); c = prev.get(c)!.from) out.unshift(prev.get(c)!.k);
          return { at: id, keys: out };
        }
        if (!['floor', 'door'].includes(t)) continue;
        prev.set(id, { from: `${p.x},${p.y}`, k });
        q.push(n);
      }
    }
    return null;
  }, { goal, skip });

  test('gear drops, comes home and is worn', async ({ page }) => {
    const w = await setup(page, 7);
    await depart(page, w);
    // A legendary spear as the labyrinth would hand it over, its uid minted by the game itself.
    const uid: number = await page.evaluate(() => {
      const g = (window as unknown as Dbg).__starlanternDebug.game;
      const uid = g.mintUid();
      g.run.loot.gear.push({
        uid, base: 'thorn-spear', rarity: 'legendary', ilvl: 6, enhance: 0, special: 'lg-chizuru',
        affixes: [{ key: 'atk', value: 9 }, { key: 'crit', value: 4 }, { key: 'str', value: 6 }],
      });
      return uid;
    });
    await lampHome(page, w);
    await expect(page.locator('.slx-town .slx-talk')).toContainText('帶回了');
    await expect(page.locator('.slx-town .slx-talk')).toContainText('雙月槍・傳說');
    await w.closeTalk();
    await w.choose('.slx-town', '冒險者公會');
    await expect(page.locator('.slx-guild')).toBeVisible(); await w.closeTalk();
    await page.locator('.slx-cmd [data-id=equip]').click();
    await expect(page.locator('.slx-equip-scene')).toBeVisible();
    await page.locator('.slx-doll-slot[data-slot=weapon]').click();
    await expect(page.locator('.slx-doll-target')).toHaveAttribute('data-slot', 'weapon');
    const cell = page.locator('.slx-bag-cell[aria-label="雙月槍・傳說"]');
    await expect(cell).toHaveClass(/slx-rarity-legendary/);
    await cell.hover();                                                // the cursor on it: the comparison shows
    await expect(page.locator('.slx-item-detail .slx-cmp .slx-cmp-row.slx-up').first()).toBeVisible();
    await expect(page.locator('.slx-item-detail .slx-line-power')).toContainText('橫掃打 2 次');
    await cell.click();                                                // and wears it
    await expect(page.locator('.slx-doll-slot[data-slot=weapon]')).toHaveClass(/slx-rarity-legendary/);
    expect(await page.evaluate((u) => {
      const s = (window as unknown as Dbg).__starlanternDebug.game.state;
      return Object.values(s.party.roster).some((m: any) => m.equip.weapon?.uid === u);
    }, uid)).toBe(true);
    await page.locator('.slx-back').click();
    await expect(page.locator('.slx-guild')).toBeVisible();
    await page.locator('.slx-cmd [data-id=status]').click();
    await expect(page.locator('.slx-status-scene')).toBeVisible();
    await page.locator('[data-tab=stats]').click();
    const primary = page.locator('.slx-stat-cat[data-cat=primary]');
    await expect(primary.locator('.slx-stat-cat-head')).toHaveText('主屬性');
    // One column per stat source: the gear column holds the spear's strength.
    await expect(primary.locator('thead th')).toContainText(['裝備', '主屬性']);
    await expect(primary.locator('tr[data-stat=str] td.slx-gear')).toHaveText('+6');
    await page.locator('.slx-back').click();
    await expect(page.locator('.slx-guild')).toBeVisible();
    await page.locator('.slx-back').click();
    await expect(page.locator('.slx-town')).toBeVisible(); await w.closeTalk();
    await w.choose('.slx-town', '旅館');
    await expect(page.locator('.slx-inn')).toBeVisible(); await w.closeTalk();
    await w.key('Enter'); await w.key('ArrowUp'); await w.key('Enter');
    await expect(page.locator('.slx-talk .slx-text')).toHaveText('已存檔。', { timeout: 5000 });
    await page.reload();
    await expect(page.locator('.slx-title [aria-selected=true]')).toHaveText('繼續');
    await w.key('Enter');
    await expect(page.locator('.slx-town')).toBeVisible();
    await expectSaveLoaded(page);
    // The save loaded as valid: the spear is still worn, and every uid sits below nextUid exactly once.
    const check = await page.evaluate((u) => {
      const s = (window as unknown as Dbg).__starlanternDebug.game.state;
      const uids = [...s.bag, ...Object.values(s.party.roster).flatMap((m: any) => Object.values(m.equip))].map((it: any) => it.uid);
      const worn = Object.values(s.party.roster).some((m: any) => m.equip.weapon?.uid === u && m.equip.weapon.special === 'lg-chizuru');
      return { worn, unique: new Set(uids).size === uids.length, below: uids.every((x: number) => x < s.nextUid), codex: s.codex.includes('lg-chizuru') };
    }, uid);
    expect(check).toEqual({ worn: true, unique: true, below: true, codex: true });
    expect(w.errors).toEqual([]);
  });

  test('a rare chest drop raises a pillar', async ({ page }) => {
    const w = await setup(page, 7);
    await depart(page, w);
    // Every chest on the floor is given a rare under its own minted uid; whichever chest holds gear (chestHasGear,
    // fixed by the run seed) hands its rare over when opened.
    const chests: number = await page.evaluate(() => {
      const g = (window as unknown as Dbg).__starlanternDebug.game;
      let n = 0;
      g.map().tiles.forEach((row: string[], y: number) => row.forEach((t, x) => {
        if (t !== 'chest') return;
        g.run.gearRolls[`chest:${g.floor}:${x},${y}`] = {
          uid: g.mintUid(), base: 'iron-sword', rarity: 'rare', ilvl: 4, enhance: 0,
          affixes: [{ key: 'atk', value: 3 }, { key: 'crit', value: 2 }, { key: 'hp', value: 9 }],
        };
        n++;
      }));
      return n;
    });
    expect(chests).toBeGreaterThan(0);
    const pillar = page.locator('.slx-pillar.slx-rarity-rare');
    const tried: string[] = [];
    let raised = false;
    for (let c = 0; c < chests && !raised; c++) {
      const route = await pathTo(page, 'chest', tried);
      if (!route) break;
      tried.push(route.at);
      for (const k of route.keys) {
        await page.evaluate(() => { (window as unknown as Dbg).__starlanternDebug.game.encounter = 0; });
        await page.keyboard.press(k);
      }
      raised = (await pillar.count()) > 0;
      await w.closeTalk();
    }
    expect(raised).toBe(true);
    expect(await page.evaluate(() => (window as unknown as Dbg).__starlanternDebug.game.run.loot.gear.map((it: any) => it.rarity))).toContain('rare');
    expect(w.errors).toEqual([]);
  });

  test('the talent board shows the cursor\'s node at both ends, and its scroll cues follow the hidden rows', async ({ page }) => {
    const w = await setup(page, 7);
    await page.locator('.slx-town [data-id=guild]').click();
    await expect(page.locator('.slx-guild')).toBeVisible(); await w.closeTalk();
    await page.evaluate(() => {
      const m = (window as unknown as Dbg).__starlanternDebug.game.state.party.roster.noel;
      // Two keystones taken, so the third cell reads 關鍵已滿 (the widest cell state) for the cut-off check below.
      m.level = 50; m.talents = { 'noel-t00': 5, 'noel-t01': 5, 'noel-t02': 2, 'noel-k0': 1, 'noel-k1': 1 };
    });
    await page.locator('.slx-guild [data-id=status]').click();
    for (let i = 0; i < 8 && !((await page.locator('.slx-status-name').textContent()) ?? '').includes('諾艾兒'); i++) await page.locator('.slx-status-next').click();
    await page.locator('[data-tab=talent]').click();
    const board = page.locator('.slx-talent-board');
    const cur = page.locator('.slx-talent-node.slx-row-cur');
    /** The cursor's node lies wholly inside the board's visible box. */
    const inView = async () => {
      const [b, c] = [(await board.boundingBox())!, (await cur.boundingBox())!];
      return c.y >= b.y - 0.5 && c.y + c.height <= b.y + b.height + 0.5;
    };
    const up = page.locator('.slx-tab-talent .slx-more-up');
    const down = page.locator('.slx-tab-talent .slx-more-down');

    // The top end: the first node, rows hidden below.
    await expect(cur).toHaveAttribute('data-node', 'noel-t00');
    expect(await inView()).toBe(true);
    await expect(up).toBeHidden();
    await expect(down).toBeVisible();
    await expect(page.locator('.slx-talent-row[data-row="0"] .slx-talent-tier')).toHaveText('第1列');
    // Two-line cells: at least 3 whole rows fit at 1280x720, and no cell's bonus or state is cut off. The bonus
    // (.slx-talent-per) never shrinks, so it is judged against its line and its cell, not against itself.
    // `stretch` widens the first bonus past its cell, to prove the check reports it (run last, below).
    const measure = (stretch: boolean) => {
      if (stretch) document.querySelector('.slx-talent-per')!.textContent = '+99.9%／級+99.9%／級';
      const b = document.querySelector('.slx-talent-board')!.getBoundingClientRect();
      const row = document.querySelector('.slx-talent-row')!.getBoundingClientRect();
      const cut = [...document.querySelectorAll<HTMLElement>('.slx-talent-node')].flatMap((cell) => {
        const box = cell.getBoundingClientRect();
        const sub = cell.querySelector<HTMLElement>('.slx-talent-sub')!;
        const spans = [...sub.querySelectorAll<HTMLElement>(':scope > span')];
        const out = sub.scrollWidth > sub.clientWidth + 0.5 || spans.some((s) => s.scrollWidth > s.clientWidth + 0.5 || s.getBoundingClientRect().right > box.right + 0.5);
        return out ? [`${cell.dataset.node} ${sub.textContent}`] : [];
      });
      return { rows: b.height / row.height, cut, keyCap: document.querySelector('[data-node=noel-k2] .slx-talent-state')!.textContent };
    };
    const fit = await page.evaluate(measure, false);
    expect(fit.rows).toBeGreaterThanOrEqual(3);
    expect(fit.keyCap).toBe('關鍵已滿');
    expect(fit.cut).toEqual([]);

    // ↓ goes down the column to the keystone row, Tab along it: the bottom end is the last keystone, rows hidden above.
    await w.key('ArrowDown');
    await expect(cur).toHaveAttribute('data-node', 'noel-t10');
    for (let i = 0; i < 5; i++) await w.key('ArrowDown');
    await expect(cur).toHaveAttribute('data-node', 'noel-k0');
    await w.key('Tab'); await w.key('Tab');
    await expect(cur).toHaveAttribute('data-node', 'noel-k2');
    await expect(page.locator('.slx-status-panel .slx-hint')).toContainText('↑↓ 換列　Tab 換欄');
    expect(await inView()).toBe(true);
    await expect(up).toBeVisible();
    await expect(down).toBeHidden();

    // Away and back: the kept cursor is brought into view again.
    await page.locator('[data-tab=ultimate]').click();
    await page.locator('[data-tab=talent]').click();
    await expect(cur).toHaveAttribute('data-node', 'noel-k2');
    expect(await inView()).toBe(true);

    // The ▲ cue scrolls the board back up by mouse or touch.
    for (let i = 0; i < 12 && (await up.isVisible()); i++) await up.click();
    await expect(up).toBeHidden();
    expect(await board.evaluate((b) => b.scrollTop)).toBe(0);
    expect(w.errors).toEqual([]);
    // The cut-off check sees a clipped bonus: the first one stretched past its cell is reported.
    expect((await page.evaluate(measure, true)).cut).toEqual([expect.stringMatching(/^noel-t00 /)]);
  });

  test('spends skill and talent points, then resets them at the inn', async ({ page }) => {
    const w = await setup(page, 7);
    const noel = () => page.evaluate(() => {
      const s = (window as unknown as Dbg).__starlanternDebug.game.state;
      const m = s.party.roster.noel;
      return { gold: s.gold, level: m.level, tree: m.tree, talents: m.talents };
    });
    /** Reload, continue, and check the game in play is the stored save (not a fresh one after a thrown-away save). */
    const reloadContinue = async () => {
      await page.reload();
      await expect(page.locator('.slx-title [aria-selected=true]')).toHaveText('繼續');
      await w.key('Enter');
      await expect(page.locator('.slx-town')).toBeVisible();
      await expectSaveLoaded(page);
      await w.closeTalk();
    };
    const status = page.locator('.slx-status-name');
    const toNoel = async () => {
      for (let i = 0; i < 8 && !((await status.textContent()) ?? '').includes('諾艾兒'); i++) await page.locator('.slx-status-next').click();
      await expect(status).toContainText('諾艾兒');
    };
    const guildTab = async (tab: 'tree' | 'talent') => {
      await w.choose('.slx-town', '冒險者公會');
      await expect(page.locator('.slx-guild')).toBeVisible(); await w.closeTalk();
      await page.locator(`.slx-guild [data-id=${tab}]`).click();
      await expect(page.locator('.slx-status-scene')).toBeVisible();
      await expect(page.locator(`[data-tab=${tab}]`)).toHaveAttribute('aria-selected', 'true');
    };
    const backToTown = async () => {
      await page.locator('.slx-back').click();
      await expect(page.locator('.slx-guild')).toBeVisible();
      await page.locator('.slx-back').click();
      await expect(page.locator('.slx-town')).toBeVisible(); await w.closeTalk();
    };
    // Lv7: skillPoints 5, talentPoints 1.
    await page.evaluate(() => {
      const g = (window as unknown as Dbg).__starlanternDebug.game;
      g.state.party.roster.noel.level = 7;
      g.state.gold = 1000;
    });

    // The guild's 技能樹 entry opens the tree tab on the first member; page to Noel.
    await guildTab('tree');
    await expect(status).toContainText('絲嘉蕾');
    await toNoel();
    const ice = page.locator('.slx-tree-node[data-node=ice-star]');
    await expect(ice).toContainText('0／3');
    // Every node fits at 1280x720, so the columns' scroll cues stay hidden.
    await expect(page.locator('.slx-tab-tree .slx-more-up')).toBeHidden();
    await expect(page.locator('.slx-tab-tree .slx-more-down')).toBeHidden();
    expect(await page.locator('.slx-tree-cols').evaluate((c) => c.scrollHeight <= c.clientHeight + 1)).toBe(true);
    await ice.click();                                      // the first click selects and arms
    await expect(ice).toHaveClass(/slx-row-cur/);
    await expect(page.locator('.slx-tree-msg')).toHaveText('再按一次投點');
    await expect(ice).toContainText('0／3');
    await ice.click();                                      // a second click on it spends
    await expect(ice).toContainText('1／3');

    // 天賦: a click on another node moves the selection and arms that one; a second click spends.
    await page.locator('[data-tab=talent]').click();
    const t00 = page.locator('.slx-talent-node[data-node=noel-t00]');
    const t01 = page.locator('.slx-talent-node[data-node=noel-t01]');
    await expect(t00).toContainText('0／5');
    await t01.click();
    await expect(page.locator('.slx-talent-msg')).toHaveText('再按一次投點');
    await t00.click();
    await expect(t00).toHaveClass(/slx-row-cur/);
    await expect(t01).toContainText('0／5');
    await t00.click();
    await expect(t00).toContainText('1／5');
    await page.locator('[data-tab=stats]').click();
    await expect(page.locator('tr[data-stat=int] td.slx-talent')).toHaveText('+2');
    expect(await noel()).toEqual({ gold: 1000, level: 7, tree: { 'fire-star': 1, 'ice-star': 1 }, talents: { 'noel-t00': 1 } });

    // A spend in town is saved at once, and the saved build reloads as valid.
    await backToTown();
    await reloadContinue();
    expect(await noel()).toEqual({ gold: 1000, level: 7, tree: { 'fire-star': 1, 'ice-star': 1 }, talents: { 'noel-t00': 1 } });

    // The inn's 重置配點 for Noel costs 25 x 7 and gives every point back.
    await w.choose('.slx-town', '旅館');
    await expect(page.locator('.slx-inn')).toBeVisible(); await w.closeTalk();
    await w.choose('.slx-inn', '重置配點');
    await w.choose('.slx-list', '諾艾兒');
    const ask = page.locator('.slx-inn .slx-confirm');
    await expect(ask).toContainText('諾艾兒');
    await expect(ask).toContainText(`${25 * 7} G`);
    await expect(ask.locator('[aria-selected=true] .slx-label')).toHaveText('否');   // defaults to no
    await w.key('ArrowUp'); await w.key('Enter');                                    // 是
    await expect(page.locator('.slx-inn .slx-talk')).toContainText('配點已重置');
    expect(await noel()).toEqual({ gold: 1000 - 25 * 7, level: 7, tree: { 'fire-star': 1 }, talents: {} });
    await w.closeTalk();
    await page.locator('.slx-back').click();
    await expect(page.locator('.slx-town')).toBeVisible(); await w.closeTalk();

    await guildTab('tree');
    await toNoel();
    await expect(page.locator('.slx-tree-node[data-node=ice-star]')).toContainText('0／3');
    await page.locator('[data-tab=talent]').click();
    await expect(page.locator('.slx-talent-node[data-node=noel-t00]')).toContainText('0／5');
    await backToTown();

    // Last, a night at the inn saves, and the reset build reloads as valid.
    await w.choose('.slx-town', '旅館');
    await expect(page.locator('.slx-inn')).toBeVisible(); await w.closeTalk();
    await w.choose('.slx-inn', '休息');
    await w.key('ArrowUp'); await w.key('Enter');
    await expect(page.locator('.slx-talk .slx-text')).toHaveText('已存檔。', { timeout: 5000 });
    const saved = await noel();
    expect(saved.gold).toBeLessThan(1000 - 25 * 7);
    await reloadContinue();
    expect(await noel()).toEqual({ ...saved, tree: { 'fire-star': 1 }, talents: {} });
    expect(w.errors).toEqual([]);
  });

  test('every portal card shows its banner art and fits all its content without scrolling or clipping, under every condition', async ({ page }) => {
    const w = await setup(page, 7);
    await w.choose('.slx-town', '傳送門廣場');
    await expect(page.locator('.slx-gate')).toBeVisible(); await w.closeTalk();
    for (const pair of [['blaze', 'frost'], ['storm', 'mire'], ['shade', 'iron']]) {
      for (const condition of ['fog', 'bounty', 'fierce', 'calm', 'starfall', 'plain']) {
        await page.evaluate(([regions, cond]) => {
          (window as unknown as Dbg).__starlanternDebug.game.state.dungeon.portals = [{ region: 'mainline', condition: cond }, ...(regions as string[]).map((region) => ({ region, condition: cond }))];
        }, [pair, condition] as const);
        await w.key('Enter');                               // 選擇傳送門
        await expect(page.locator('.slx-portal')).toHaveCount(3);
        // Every card, the mainline too: its banner art is shown, nothing in it is clipped, and the region gear list does not scroll.
        await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('.slx-portal-art')].every((i) => i.complete));
        const r = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.slx-portal')].map((c) => {
          const g = c.querySelector<HTMLElement>('.slx-portal-gear');
          const art = c.querySelector<HTMLImageElement>('.slx-portal-art');
          const box = c.getBoundingClientRect(), cs = getComputedStyle(c), k = box.height / c.offsetHeight;   // the screen is scaled
          const inner = box.bottom - (parseFloat(cs.borderBottomWidth) + parseFloat(cs.paddingBottom)) * k;
          return {
            region: c.dataset.region, clipped: c.scrollHeight - c.clientHeight,
            depthBelow: (c.querySelector<HTMLElement>('.slx-portal-depth')!.getBoundingClientRect().bottom - inner) / k,
            art: art ? { h: art.offsetHeight, w: art.offsetWidth, loaded: art.naturalWidth > 0 } : null,
            gear: g ? { over: g.scrollHeight - g.clientHeight, items: g.querySelectorAll('.slx-codex-item').length, more: !c.querySelector<HTMLElement>('.slx-codex-more')!.hidden } : null,
          };
        }));
        expect(r.map((c) => c.region)).toEqual(['mainline', ...pair]);
        for (const c of r) {
          const at = `${c.region} ${condition}`;
          expect(c.clipped, `${at} card clipped`).toBeLessThanOrEqual(1);
          expect(c.depthBelow, `${at} depth line clipped`).toBeLessThanOrEqual(0.5);
          expect(c.art?.loaded, `${at} banner art`).toBe(true);
          expect(c.art!.h, `${at} banner height`).toBeGreaterThanOrEqual(28);
          if (c.region === 'mainline') continue;
          expect(c.gear!.items, at).toBe(3); expect(c.gear!.over, `${at} overflow`).toBeLessThanOrEqual(1); expect(c.gear!.more).toBe(false);
        }
        await w.key('Escape');
      }
    }
    expect(w.errors).toEqual([]);
  });

  /** The parts of the game state the forge tests read, through the debug handle. */
  const forgeState = (page: Page) => page.evaluate(() => {
    const s = (window as unknown as Dbg).__starlanternDebug.game.state;
    return { forgeDraws: s.forgeDraws as number, bag: s.bag as { uid: number; enhance: number; junk?: boolean }[], inventory: s.inventory as Record<string, number> };
  });
  /** Esc until the town is back, closing any line on the way. */
  const toTown = async (page: Page, w: Awaited<ReturnType<typeof setup>>) => {
    for (let i = 0; i < 8 && !(await page.locator('.slx-town').isVisible()); i++) { await w.closeTalk(); await w.key('Escape'); }
    await expect(page.locator('.slx-town')).toBeVisible(); await w.closeTalk();
  };

  test('the forge enhances, dismantles and crafts, and the save keeps it', async ({ page }) => {
    const w = await setup(page, 7);
    const { keepUid, junkUid, potions } = await page.evaluate(() => {
      const g = (window as unknown as Dbg).__starlanternDebug.game;
      g.state.gold = 2000;
      Object.assign(g.state.inventory, { 'essence-common': 20, 'essence-magic': 4, moss: 4 });
      const keepUid: number = g.mintUid();
      const junkUid: number = g.mintUid();
      g.state.bag.push({ uid: keepUid, base: 'iron-sword', rarity: 'common', ilvl: 1, affixes: [], enhance: 5 });
      g.state.bag.push({ uid: junkUid, base: 'iron-sword', rarity: 'common', ilvl: 1, affixes: [], enhance: 0, junk: true });
      return { keepUid, junkUid, potions: (g.state.inventory.potion ?? 0) as number };
    });
    expect(keepUid).not.toBe(junkUid);
    expect((await forgeState(page)).forgeDraws).toBe(0);
    // 鍛造屋 is the fifth facility: down four times, then Enter.
    for (let i = 0; i < 4; i++) await w.key('ArrowDown');
    await expect(page.locator('.slx-town [aria-selected=true] .slx-label')).toHaveText('鍛造屋');
    await w.key('Enter');
    await expect(page.locator('.slx-forge')).toBeVisible(); await w.closeTalk();

    // 強化 +5 → +6: the first step that can fail, so it always draws.
    await page.locator('.slx-forge .slx-cmd [data-id=enhance]').click();
    await page.locator(`.slx-forge [data-id=g${keepUid}]`).click();
    await page.locator('.slx-confirm [data-id=yes]').click();
    await expect(page.locator('.slx-talk .slx-text')).toHaveText(/強化成功|強化失敗/);
    await w.closeTalk();
    const level = ((await page.locator(`.slx-forge [data-id=g${keepUid}] .slx-right`).textContent()) ?? '').trim();
    expect(['+6', '+5']).toContain(level);
    expect((await forgeState(page)).forgeDraws).toBe(1);
    await w.key('Escape');

    // 分解全部已標記: only the marked piece goes.
    await page.locator('.slx-forge .slx-cmd [data-id=dismantle]').click();
    await expect(page.locator('.slx-forge [data-id=marked] .slx-label')).toHaveText('分解全部已標記（1 件）');
    await page.locator('.slx-forge [data-id=marked]').click();
    await page.locator('.slx-confirm [data-id=yes]').click();
    await expect(page.locator('.slx-talk .slx-text')).toContainText('普通精華');
    await w.closeTalk();
    const afterDismantle = await forgeState(page);
    expect(afterDismantle.bag.map((it) => it.uid)).toContain(keepUid);
    expect(afterDismantle.bag.map((it) => it.uid)).not.toContain(junkUid);
    await w.key('Escape');

    // 製作 → 消耗品 → 回復藥 ×2.
    await page.locator('.slx-forge .slx-cmd [data-id=craft]').click();
    await page.locator('.slx-forge [data-id=item]').click();
    await page.locator('.slx-forge [data-id=potion]').click();
    await w.key('ArrowUp');                                 // +10, held to the 2 the moss pays for
    await expect(page.locator('.slx-qty-n')).toHaveText('× 2');
    await w.key('Enter');
    await expect(page.locator('.slx-talk .slx-text')).toContainText('回復藥');
    await toTown(page, w);

    // The shop's buy list counts the two new potions.
    await w.choose('.slx-town', '道具店');
    await expect(page.locator('.slx-shop')).toBeVisible(); await w.closeTalk();
    await page.locator('.slx-shop .slx-cmd [data-id=buy]').click();
    await expect(page.locator('.slx-shop [data-id=potion] .slx-right')).toContainText(`持有 ${potions + 2}`);
    await toTown(page, w);

    // Reload and continue: the level and the draw count are what the forge left, and loading drew nothing.
    await page.reload();
    await expect(page.locator('.slx-title [aria-selected=true]')).toHaveText('繼續');
    await w.key('Enter');
    await expect(page.locator('.slx-town')).toBeVisible();
    const loaded = await forgeState(page);
    expect(`+${loaded.bag.find((it) => it.uid === keepUid)!.enhance}`).toBe(level);
    expect(loaded.forgeDraws).toBe(1);
    expect(w.errors).toEqual([]);
  });

  test('every forge window stays inside the screen, so nothing scrolls the stage', async ({ page }) => {
    const w = await setup(page, 7);
    await page.evaluate(() => {
      const g = (window as unknown as Dbg).__starlanternDebug.game;
      g.state.gold = 5000;
      Object.assign(g.state.inventory, { 'essence-magic': 10, 'essence-rare': 4, 'blaze-core': 9, 'star-tear': 1 });
      for (const it of [{ rarity: 'common', enhance: 5, affixes: [] }, ...[3, 4, 5].map((v) => ({ rarity: 'magic', enhance: 0, affixes: [{ key: 'crit', value: v }] }))]) {
        g.state.bag.push({ uid: g.mintUid(), base: 'iron-sword', ilvl: 8, ...it });
      }
    });
    await w.choose('.slx-town', '鍛造屋');
    await expect(page.locator('.slx-forge')).toBeVisible(); await w.closeTalk();
    const outside = () => page.evaluate(() => {
      const screen = document.querySelector('#sl-screen')!.getBoundingClientRect();
      const wins = [...document.querySelectorAll<HTMLElement>('.slx-forge .slx-win')].map((e) => ({ cls: e.className, r: e.getBoundingClientRect() }));
      const scrolled = [...document.querySelectorAll<HTMLElement>('#sl-screen, #sl-screen *')].filter((e) => e.scrollLeft > 0).map((e) => e.className);
      return [...wins.filter(({ r }) => r.left < screen.left - 0.5 || r.right > screen.right + 0.5).map(({ cls, r }) => `${cls} ${r.left}-${r.right} / ${screen.left}-${screen.right}`), ...scrolled.map((c) => `scrolled: ${c}`)];
    });
    const pages: [string, string[]][] = [['dismantle', []], ['enhance', []], ['reroll', ['[role=option]']], ['fuse', ['[data-id=magic]']], ['craft', ['[data-id=set]', '[data-id=set-blaze]']]];
    for (const [tab, steps] of pages) {
      await page.locator(`.slx-forge .slx-cmd [data-id=${tab}]`).click();
      for (const step of steps) await page.locator('.slx-forge .slx-layer').last().locator(step).first().click();
      expect(await outside(), tab).toEqual([]);
      for (let i = 0; i < 4 && (await page.locator('.slx-forge .slx-layer').count()); i++) await w.key('Escape');
    }
    expect(w.errors).toEqual([]);
  });

  /**
   * Every forge window's box, in stage px: lists (layers) and detail windows. A list must never cover a detail window,
   * and every window must stay inside the 640px stage.
   */
  const forgeOverlaps = (page: Page) => page.evaluate(() => {
    const screen = document.querySelector('#sl-screen')!.getBoundingClientRect();
    const k = screen.width / 640;
    const boxOf = (e: Element) => { const r = e.getBoundingClientRect(); return { l: (r.left - screen.left) / k, r: (r.right - screen.left) / k, t: (r.top - screen.top) / k, b: (r.bottom - screen.top) / k }; };
    const name = (e: Element) => e.className.replace(/\s+/g, '.');
    const lists = [...document.querySelectorAll('.slx-forge .slx-layer.slx-list')];
    const infos = [...document.querySelectorAll('.slx-forge .slx-info')];
    const out: string[] = [];
    for (const e of [...lists, ...infos]) { const b = boxOf(e); if (b.l < -0.5 || b.r > 640.5) out.push(`outside: ${name(e)} ${b.l.toFixed(1)}-${b.r.toFixed(1)}`); }
    for (const a of lists) for (const i of infos) {
      const [p, q] = [boxOf(a), boxOf(i)];
      if (p.l < q.r - 0.5 && q.l < p.r - 0.5 && p.t < q.b - 0.5 && q.t < p.b - 0.5) out.push(`overlap: ${name(a)} ${p.l.toFixed(1)}-${p.r.toFixed(1)} over ${name(i)} ${q.l.toFixed(1)}-${q.r.toFixed(1)}`);
    }
    return out;
  });

  test('no forge list covers a detail window on any tab, with worn gear and the longest real labels', async ({ page }) => {
    const w = await setup(page, 7);
    // The longest real names: a named piece (legendary, unique or set) and a wearer.
    const named = Object.values(SPECIALS).sort((a, b) => b.name.length - a.name.length)[0];
    const base = Object.values(EQUIPMENT).find((e) => e.slot === named.slot)!.id;
    const slot = named.slot === 'ring' ? 'ring1' : named.slot;
    const longKeys = (Object.keys(AFFIXES) as (keyof typeof AFFIXES)[]).filter((key) => AFFIXES[key].slots.includes(named.slot)).slice(0, 4);
    const longest = Object.values(CHARACTERS).sort((a, b) => b.name.length - a.name.length)[0].id;
    // The longest base name, for the fuse pick list (no named piece can be fused): three rares at +10.
    const longBase = Object.values(EQUIPMENT).sort((a, b) => b.name.length - a.name.length)[0].id;
    await page.evaluate(({ special, rarity, base, slot, keys, longest, longBase }) => {
      const g = (window as unknown as Dbg).__starlanternDebug.game;
      const s = g.state;
      s.gold = 99999;
      Object.assign(s.inventory, { 'essence-magic': 10, 'essence-rare': 4, 'essence-legendary': 4, 'blaze-core': 9, 'shade-crystal': 9, 'star-tear': 3, 'king-scale': 2 });
      // Every member is recruited, and each wears the longest named piece at +10 with a locked affix.
      s.party.recruited = [longest, ...Object.keys(s.party.roster).filter((id) => id !== longest)];
      const piece = () => ({ uid: g.mintUid(), base, rarity, special, ilvl: 999, enhance: 10, locked: 0, affixes: keys.map((key: string) => ({ key, value: 3949.5 })) });
      for (const id of s.party.recruited) s.party.roster[id].equip[slot] = piece();
      s.bag.unshift(piece());
      for (const v of [3, 4, 5]) s.bag.push({ uid: g.mintUid(), base: 'iron-sword', rarity: 'magic', ilvl: 999, enhance: 0, affixes: [{ key: 'critDmg', value: v }] });
      for (const v of [3, 4, 5]) s.bag.push({ uid: g.mintUid(), base: longBase, rarity: 'rare', ilvl: 999, enhance: 10, locked: 0, affixes: [{ key: 'critDmg', value: v }] });
      s.bag.push({ uid: g.mintUid(), base: 'iron-sword', rarity: 'common', ilvl: 1, enhance: 5, affixes: [] });
    }, { special: named.id, rarity: named.rarity, base, slot, keys: longKeys, longest, longBase });
    await w.choose('.slx-town', '鍛造屋');
    await expect(page.locator('.slx-forge')).toBeVisible(); await w.closeTalk();
    const top = () => page.locator('.slx-forge .slx-layer').last();
    const check = async (where: string) => expect(await forgeOverlaps(page), where).toEqual([]);
    const tab = async (id: string) => { await page.locator(`.slx-forge .slx-cmd [data-id=${id}]`).click(); await check(id); };
    const back = async () => { for (let i = 0; i < 6 && (await page.locator('.slx-forge .slx-layer').count()); i++) { await w.closeTalk(); await w.key('Escape'); } };
    /** Walk the cursor down every row of the top list, checking at each one (the detail follows the cursor). */
    const walk = async (where: string) => {
      const n = await top().locator('[role=option]').count();
      for (let i = 0; i < n; i++) { await check(`${where} row ${i}`); await w.key('ArrowDown'); }
    };

    /** The dismantle and fuse lists have no detail pane: every label there must show in full (name, +n and rarity word). */
    const clipped = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.slx-forge .slx-layer.slx-list .slx-label')]
      .filter((l) => l.scrollWidth > l.clientWidth + 0.5).map((l) => `${l.textContent} ${l.scrollWidth}>${l.clientWidth}`));
    const whole = async (where: string) => { expect(await clipped(), where).toEqual([]); await check(where); };
    await tab('dismantle'); await whole('dismantle'); await walk('dismantle'); await back();
    await tab('enhance'); await walk('enhance'); await back();
    await tab('reroll'); await walk('reroll items');
    await top().locator('[role=option]').last().click();               // a worn piece with a locked affix
    await check('reroll affixes'); await walk('reroll affixes');
    await top().locator('[role=option]:not([aria-disabled=true])').first().click();
    await check('reroll methods'); await walk('reroll methods');
    await back();
    await tab('fuse');
    await whole('fuse tiers');
    await top().locator('[data-id=rare]').click(); await whole('fuse picks');
    for (const n of [1, 2, 3]) await top().locator('[role=option]').nth(n).click();
    await whole('fuse picked');
    await top().locator('[data-id=go]').click(); await whole('fuse slots'); await walk('fuse slots');
    await back();
    await tab('craft');
    for (const [cat, sub] of [['item', null], ['base', null], ['set', 'set-blaze']] as const) {
      await top().locator(`[data-id=${cat}]`).click(); await check(`craft ${cat}`); await walk(`craft ${cat}`);
      if (sub) { await top().locator(`[data-id=${sub}]`).click(); await check(`craft ${sub}`); await walk(`craft ${sub}`); await w.key('Escape'); }
      await w.key('Escape');
    }
    await back();
    expect(w.errors).toEqual([]);
  });

  test('the shop material page keeps its list and detail apart inside the screen, and dims what is under the quantity box', async ({ page }) => {
    const w = await setup(page, 7);
    await page.evaluate(() => {
      const g = (window as unknown as Dbg).__starlanternDebug.game;
      // Every material at a five-digit count: the widest real rows, and a sell-all junk row with a six-digit total.
      for (const id of ['moss', 'bat-wing', 'thorn-fang', 'crystal-shell', 'ice-crystal', 'lizard-scale', 'star-stone', 'dusk-cloth', 'old-coin',
        'ancient-gear', 'star-tear', 'king-scale', 'shade-crystal', 'essence-legendary']) g.state.inventory[id] = 99999;
    });
    await w.choose('.slx-town', '道具店');
    await expect(page.locator('.slx-shop')).toBeVisible(); await w.closeTalk();
    await page.locator('.slx-shop .slx-cmd [data-id=sell]').click();
    await page.locator('.slx-shop .slx-layer').last().locator('[data-id=mats]').click();
    const bounds = () => page.evaluate(() => {
      const screen = document.querySelector('#sl-screen')!.getBoundingClientRect();
      const k = screen.width / 640;
      const box = (sel: string) => { const r = document.querySelector(sel)!.getBoundingClientRect(); return { l: (r.left - screen.left) / k, r: (r.right - screen.left) / k }; };
      return { list: box('.slx-mat-page > .slx-shop-list'), info: box('.slx-mat-page > .slx-info') };
    });
    const rows = await page.locator('.slx-mat-page [role=option]').count();
    expect(rows).toBeGreaterThan(10);
    for (let i = 0; i < rows; i++) {
      const b = await bounds();
      expect(b.list.l, `row ${i}`).toBeGreaterThanOrEqual(-0.5);
      expect(b.list.r, `row ${i}: list ${b.list.l}-${b.list.r}, detail ${b.info.l}-${b.info.r}`).toBeLessThanOrEqual(b.info.l + 0.5);
      expect(b.info.r, `row ${i}`).toBeLessThanOrEqual(640.5);
      await w.key('ArrowDown');
    }
    // A material row opens the quantity box on top: the page under it and the command window dim, like the forge's.
    await page.locator('.slx-mat-page [data-id=moss]').click();
    await expect(page.locator('.slx-qty')).toBeVisible();
    const filters = await page.evaluate(() => [...document.querySelectorAll('.slx-shop .slx-cmd, .slx-mat-page > .slx-win')].map((e) => getComputedStyle(e).filter));
    expect(filters.length).toBe(3);
    for (const f of filters) expect(f).toContain('brightness');
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.slx-qty')!).filter)).toBe('none');
    expect(w.errors).toEqual([]);
  });

  test('walks into the forge from town and dismantles one magic item', async ({ page }) => {
    const w = await setup(page, 7);
    const uid = await page.evaluate(() => {
      const g = (window as unknown as Dbg).__starlanternDebug.game;
      g.state.bag = [];
      const u: number = g.mintUid();
      g.state.bag.push({ uid: u, base: 'iron-sword', rarity: 'magic', ilvl: 1, affixes: [{ key: 'crit', value: 3 }], enhance: 0 });
      return u;
    });
    const before = (await forgeState(page)).inventory;
    await w.choose('.slx-town', '鍛造屋');
    await expect(page.locator('.slx-forge')).toBeVisible(); await w.closeTalk();
    await expect(page.locator('.slx-forge .slx-cmd [aria-selected=true] .slx-label')).toHaveText('分解');
    await w.key('Enter');                                   // 分解
    await expect(page.locator(`.slx-forge [data-id=g${uid}]`)).toHaveAttribute('aria-selected', 'true');
    await w.key('Enter');                                   // a magic piece goes at once, no confirm
    await expect(page.locator('.slx-talk .slx-text')).toContainText('魔法精華');
    const after = await forgeState(page);
    expect(after.bag).toEqual([]);
    expect(after.inventory['essence-magic'] ?? 0).toBe((before['essence-magic'] ?? 0) + 1);
    expect(after.inventory['essence-common'] ?? 0).toBe((before['essence-common'] ?? 0) + 1);
    expect(after.forgeDraws).toBe(0);
    await toTown(page, w);
    expect(w.errors).toEqual([]);
  });
});
