import { test, expect, type Page } from '@playwright/test';

test.use({ launchOptions: { args: ['--mute-audio'] } });

const box = (page: Page) => page.locator('#sl-screen').boundingBox();

test.describe('starlantern', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'chromium only');

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
    await expect(page.locator('.slx-town .slx-talk')).not.toContainText('存檔無法讀取');
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
});
