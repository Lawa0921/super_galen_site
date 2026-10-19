import { test, expect, type Page } from '@playwright/test';
import { SPECIALS, AFFIXES } from '../../src/scripts/games/starlantern/data/gear';
import { CHARACTERS } from '../../src/scripts/games/starlantern/data/characters';
import { EQUIPMENT } from '../../src/scripts/games/starlantern/data/equipment';
import { LEGACY_GRID, LEGACY_LINEUP, meet } from '../../src/scripts/games/starlantern/engine/party';
import { STORY } from '../../src/scripts/games/starlantern/data/story.zh-TW';
import { T } from '../../src/scripts/games/starlantern/data/text.zh-TW';
import { CHAINS, chainLength } from '../../src/scripts/games/starlantern/data/story/chains';
import { ABSORB_CAP, ABSORB_GAIN, SHARD_IDS, SHARD_NAMES } from '../../src/scripts/games/starlantern/data/story/fragments';
import { memScene } from '../../src/scripts/games/starlantern/data/story/scenes';
import { favouredRegions } from '../../src/scripts/games/starlantern/data/meetings';
import { rollPortals, withLead } from '../../src/scripts/games/starlantern/engine/portals';
import { mkdirSync } from 'node:fs';

test.use({ launchOptions: { args: ['--mute-audio'] } });

const box = (page: Page) => page.locator('#sl-screen').boundingBox();

type Rect = { x: number; y: number; width: number; height: number };
const apart = (a: Rect, b: Rect) => a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
/** If the dialogue box shows a speaker's portrait, it must lie inside the screen and clear of the text and the name plate. Returns the talk box height, or null with no portrait. */
const faceFits = async (page: Page): Promise<number | null> => {
  const faceEl = page.locator('.slx-talk:not([hidden]) img.slx-talk-face');
  if ((await faceEl.count()) === 0) return null;
  const scr = (await box(page))!;
  const face = (await faceEl.first().boundingBox())!;
  const talk = (await page.locator('.slx-talk:not([hidden])').first().boundingBox())!;
  const text = (await page.locator('.slx-talk:not([hidden]) .slx-text').first().boundingBox())!;
  const name = await page.locator('.slx-talk:not([hidden]) .slx-name:not([hidden])').first().boundingBox();
  expect(face.y, 'portrait top inside the screen').toBeGreaterThanOrEqual(scr.y - 0.5);
  expect(face.x, 'portrait left inside the screen').toBeGreaterThanOrEqual(scr.x - 0.5);
  expect(face.x + face.width, 'portrait right inside the screen').toBeLessThanOrEqual(scr.x + scr.width + 0.5);
  expect(face.y + face.height, 'portrait bottom inside the screen').toBeLessThanOrEqual(scr.y + scr.height + 0.5);
  expect(apart(face, text), 'portrait clear of the dialogue text').toBe(true);
  if (name) expect(apart(face, name), 'portrait clear of the name plate').toBe(true);
  expect(apart(face, talk), 'portrait stands above the whole talk box').toBe(true);
  return talk.height;
};

test.describe('starlantern', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'chromium only');

  /**
   * Writes the story setting before the game opens. A new game plays the prologue, so most tests turn the story off;
   * the story tests pass 'all' or 'major'. Other settings keep their defaults.
   */
  const storySetting = (page: Page, story: 'none' | 'major' | 'all' = 'none') =>
    // Written only when absent: the init script runs again on every navigation, and a reload must not undo a setting the test changed.
    page.addInitScript((s) => {
      if (localStorage.getItem('starlantern-settings') === null) localStorage.setItem('starlantern-settings', JSON.stringify({ volume: 70, textSpeed: 'mid', vibrate: true, story: s }));
    }, story);

  /** The town's own greeting lines, straight from the story data: what it says on 繼續 when there is no notice (such as 存檔無法讀取) to give. */
  const townLines = (): string[] => [...Object.values(STORY.townLines).flat(), ...Object.values(STORY.rinLines).flat(), ...STORY.rinOath, ...STORY.bellkeeper.oath, ...STORY.bellkeeper.after];
  /** After 繼續: the town greets as usual, and the game in play is exactly the stored save. */
  const expectSaveLoaded = async (page: Page) => {
    await expect.poll(async () => townLines().includes((await page.locator('.slx-town .slx-talk .slx-text').textContent()) ?? '')).toBe(true);
    const r = await page.evaluate(() => ({
      saved: JSON.parse(localStorage.getItem('starlantern-save') ?? 'null'),
      game: JSON.parse(JSON.stringify((window as unknown as Dbg).__starlanternDebug.game.state)),
    }));
    expect(r.saved).not.toBeNull();
    expect(r.game).toEqual(r.saved);
  };

  test('story portraits fit a 390x844 phone: no horizontal scroll, inside the screen, clear of the text', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await storySetting(page, 'all');
    await page.goto('/games/starlantern?seed=7&fast=1');
    await page.evaluate(() => localStorage.removeItem('starlantern-save'));
    await page.reload();
    await expect(page.locator('.slx-title [aria-selected=true]')).toHaveText('新遊戲');
    await page.keyboard.press('Enter');
    let faces = 0;
    for (let i = 0; i < 80 && faces < 6; i++) {
      if (await page.locator('.slx-talk:not([hidden])').count()) {
        if ((await faceFits(page)) !== null) {
          faces++;
          const k = (await box(page))!.width / 640;
          expect((await page.locator('.slx-talk:not([hidden]) img.slx-talk-face').first().boundingBox())!.height).toBeGreaterThanOrEqual(2 * 96 * k - 0.5);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        }
        await page.keyboard.press('z');
      }
      await page.waitForTimeout(60);
    }
    expect(faces, 'the prologue shows portraits').toBeGreaterThanOrEqual(3);
  });

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
    await storySetting(page);
    await page.goto('/games/starlantern');
    await page.evaluate(() => localStorage.setItem('starlantern-save', '{broken'));
    await page.reload();
    await page.locator('.slx-title [data-id=cont]').click();
    await expect(page.locator('.slx-town .slx-talk')).toContainText('存檔無法讀取');
    await expect(page.locator('.slx-gold')).toHaveText('150 G');
  });

  test('plays title → town with the keyboard only', async ({ page }) => {
    await storySetting(page);
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
    await storySetting(page);
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
    await storySetting(page);
    await page.goto('/games/starlantern');
    await page.evaluate(() => localStorage.removeItem('starlantern-save'));
    await page.reload();
    const talkThrough = async () => { for (let i = 0; i < 4 && (await page.locator('.slx-talk').isVisible()); i++) await page.locator('.slx-talk').click(); };
    await page.locator('.slx-title [data-id=new]').click();
    await expect(page.locator('.slx-town')).toBeVisible();
    await talkThrough();
    await legacyRoster(page);
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
    await expect(page.locator('.slx-status-name')).toContainText('洛恩');       // the hero leads
    await page.locator('.slx-status-next').click();
    await page.locator('.slx-status-next').click();
    await expect(page.locator('.slx-status-name')).toContainText('絲嘉蕾');
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
    await storySetting(page);
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
    await legacyRoster(page);
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
  /** The legacy five, then the hero and Rin, recruited in that order and standing on the old grid with the hero in Selene's cell: the new start no longer has the old five to page to. */
  const legacyRoster = (page: Page) => page.evaluate(([ids, grid]) => {
    const p = (window as unknown as Dbg).__starlanternDebug.game.state.party;
    p.recruited = [...ids, 'hero', 'rin'];
    p.grid = grid;
  }, [LEGACY_LINEUP, LEGACY_GRID.map((c) => (c === 'selene' ? 'hero' : c))] as const);
  /** Page the status screen with 下一位 until `name` shows, at most once round the recruited members. */
  const flipTo = async (page: Page, name: string) => {
    const recruited: number = await page.evaluate(() => (window as unknown as Dbg).__starlanternDebug.game.state.party.recruited.length);
    const label = page.locator('.slx-status-name');
    for (let i = 0; i < recruited && !((await label.textContent()) ?? '').includes(name); i++) await page.locator('.slx-status-next').click();
  };
  const setup = async (page: Page, seed: number, opts: { story: 'none' | 'major' | 'all' } = { story: 'none' }) => {
    await storySetting(page, opts.story);
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
    await legacyRoster(page);
    await page.evaluate(() => {
      const m = (window as unknown as Dbg).__starlanternDebug.game.state.party.roster.noel;
      // Two keystones taken, so the third cell reads 關鍵已滿 (the widest cell state) for the cut-off check below.
      m.level = 50; m.talents = { 'noel-t00': 5, 'noel-t01': 5, 'noel-t02': 2, 'noel-k0': 1, 'noel-k1': 1 };
    });
    await page.locator('.slx-guild [data-id=status]').click();
    await flipTo(page, '諾艾兒');
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
      await flipTo(page, '諾艾兒');
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
    await legacyRoster(page);
    await page.evaluate(() => {
      const g = (window as unknown as Dbg).__starlanternDebug.game;
      g.state.party.roster.noel.level = 7;
      g.state.gold = 1000;
    });

    // The guild's 技能樹 entry opens the tree tab on the hero; page to Noel.
    await guildTab('tree');
    await expect(status).toContainText('洛恩');
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

  test("the guild points the way: Selene's lead first, then the next one, marked at the gate and kept in the handbook (6c Task 16)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    /** With SL_SHOTS=<dir> the run also leaves its screenshots there; otherwise this is a no-op (final review M-4). */
    const shots = process.env.SL_SHOTS;
    if (shots) mkdirSync(shots, { recursive: true });
    const shot = async (name: string) => {
      if (!shots) return;
      await page.waitForTimeout(700);   // windows fade in: wait until they are fully drawn
      await page.screenshot({ path: `${shots}/t16-${name}.png` });
    };
    const w = await setup(page, 7);
    const said = page.locator('.slx-talk:not([hidden]) .slx-text');
    /** Exactly one of `lines`, typed out in full. */
    const oneOf = (lines: readonly string[]) => new RegExp('^(' + lines.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')$');

    // A new game: Anna greets as usual, then passes on Selene's lead in a second box (final review M-2 ruling), and the main
    // road's portal carries it.
    await w.choose('.slx-town', '冒險者公會');
    await expect(page.locator('.slx-guild')).toBeVisible();
    await expect(said).toHaveText(oneOf(STORY.greet.guild.prologue));
    await w.key('z');                                       // the greeting closes: the lead is the second box
    await expect(said).toHaveText(STORY.leads.selene);
    await shot('01-guild-lead-selene');
    await w.closeTalk();
    await w.key('Escape');
    await expect(page.locator('.slx-town')).toBeVisible(); await w.closeTalk();
    await w.choose('.slx-town', '傳送門廣場');
    await expect(page.locator('.slx-gate')).toBeVisible(); await w.closeTalk();
    await w.key('Enter');                                   // 選擇傳送門
    const main = page.locator('.slx-portal[data-region=mainline]');
    await expect(main).toHaveClass(/slx-portal-lead/);
    await expect(main.locator('.slx-portal-sighting-depth')).toHaveText(T.ui2.gate.leadAt(2));
    await w.key('Escape'); await w.key('Escape');
    await expect(page.locator('.slx-town')).toBeVisible(); await w.closeTalk();

    // Selene met on the main road's second floor (the game's own `meet`, run here on the party and written back): the next
    // lead is the frost's. The way home rolls the portals on a constant rng chosen so that the plain roll has no frost (checked
    // here with the game's own rollPortals), so the frost portal proves the guarantee rather than a lucky roll.
    const party = await page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as Dbg).__starlanternDebug.game.state.party)));
    const met = meet(party, 'selene', 1);
    const favoured = favouredRegions(met.recruited);
    const v = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].find((x) => !rollPortals(() => x, favoured).some((p) => p.region === 'frost'))!;
    expect(v, 'some constant rng rolls no frost').toBeDefined();
    const plain = rollPortals(() => v, favoured);
    expect(plain.map((p) => p.region)).not.toContain('frost');
    await page.evaluate(([p]) => {
      const s = (window as unknown as Dbg).__starlanternDebug.game.state;
      s.party = p;
      s.dungeon.reached.mainline = 2;
      s.inventory['return-lamp'] = 3;
    }, [met] as const);
    await depart(page, w);
    await page.evaluate((x) => { (window as unknown as Dbg).__starlanternDebug.game.rng = () => x; }, v);
    await lampHome(page, w);
    await w.closeTalk();
    const rolled = await page.evaluate(() => (window as unknown as Dbg).__starlanternDebug.game.state.dungeon.portals);
    expect(rolled.map((p: { region: string }) => p.region)).toContain('frost');
    expect(rolled).toEqual(withLead(plain, 'frost', favoured));   // exactly the plain roll with the lead put in
    // A known draw for the greetings: 0.99 draws act 1's second line.
    await page.evaluate(() => { (window as unknown as Dbg).__starlanternDebug.game.rng = () => 0.99; });
    await w.choose('.slx-town', '冒險者公會');
    await expect(page.locator('.slx-guild')).toBeVisible();
    await expect(said).toHaveText(STORY.greet.guild.act1[1]);
    await w.key('z');                                       // two confirms on the first visit of the stay: greeting, then lead
    await expect(said).toHaveText(STORY.leads.chizuru);
    await shot('02-guild-lead-chizuru');
    await w.closeTalk();
    await w.key('Escape');
    await expect(page.locator('.slx-town')).toBeVisible(); await w.closeTalk();
    // Once per arrival: a second visit in the same stay is Anna's usual greeting, and nothing after it.
    await w.choose('.slx-town', '冒險者公會');
    await expect(page.locator('.slx-guild')).toBeVisible();
    await expect(said).toHaveText(STORY.greet.guild.act1[1]);   // the rng's 0.99 draws act 1's second line
    await w.key('z');
    await expect(page.locator('.slx-talk')).toBeHidden();
    await w.key('Escape');
    await expect(page.locator('.slx-town')).toBeVisible(); await w.closeTalk();
    await w.choose('.slx-town', '傳送門廣場');
    await expect(page.locator('.slx-gate')).toBeVisible(); await w.closeTalk();
    await w.key('Enter');                                   // 選擇傳送門
    const frost = page.locator('.slx-portal[data-region=frost]');
    await expect(frost).toHaveClass(/slx-portal-lead/);
    await expect(frost.locator('.slx-portal-lead-tag')).toHaveAttribute('title', T.ui2.gate.lead);
    await expect(frost.locator('.slx-portal-sighting-depth')).toHaveText(T.ui2.gate.leadAt(3));
    await expect(main.locator('.slx-portal-sighting')).toHaveCount(0);
    // the marker fits: no card is clipped by it
    const clipped = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.slx-portal')].map((c) => c.scrollHeight - c.clientHeight));
    for (const c of clipped) expect(c).toBeLessThanOrEqual(1);
    await shot('03-gate-lead-frost');
    await w.key('Escape'); await w.key('Escape');
    await expect(page.locator('.slx-town')).toBeVisible(); await w.closeTalk();

    // The handbook keeps it: the lead now, and Selene's, followed.
    await page.locator('.slx-town [data-id=handbook]').click();
    await expect(page.locator('.slx-handbook')).toBeVisible();
    await page.locator('.slx-tabs .slx-tab').filter({ hasText: T.ui2.handbook.tabs.leads }).click();
    const rows = page.locator('.slx-hb-list [role=option] .slx-label');
    await expect(rows).toHaveText([T.ui2.handbook.leads.place('霜凍之地', 3), CHARACTERS.selene.name]);
    await expect(page.locator('.slx-hb-detail')).toContainText(STORY.leads.chizuru);
    await shot('04-handbook-leads');
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

  test('two start, meet Selene, recall her', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    /** With SL_SHOTS=<dir> the run also leaves its screenshots there; otherwise this is a no-op. */
    const shot = async (name: string) => {
      if (!process.env.SL_SHOTS) return;
      await page.waitForTimeout(700);   // windows fade in: wait until they are fully drawn
      await page.screenshot({ path: `${process.env.SL_SHOTS}/${name}.png` });
    };
    /** Runs `fn` in the page on the live game (the debug hook), with one serialisable argument. */
    const game = <T, A = undefined>(fn: (g: any, a: A) => T, arg?: A): Promise<T> =>
      page.evaluate(([src, a]) => new Function('g', 'a', `return (${src})(g, a)`)((window as unknown as Dbg).__starlanternDebug.game, a), [fn.toString(), arg] as [string, unknown]) as Promise<T>;
    const w = await setup(page, 7);
    const others = Object.values(CHARACTERS).filter((c) => c.id !== 'hero' && c.id !== 'rin').map((c) => c.name);
    await shot('01-town-two-start');

    // New game: the hero (洛恩) and Rin (凜) only, in the guild's pages, the formation's pick list and the recall command.
    await page.locator('.slx-town [data-id=guild]').click();
    await expect(page.locator('.slx-guild')).toBeVisible(); await w.closeTalk();
    await expect(page.locator('.slx-cmd [data-id=recall]')).toHaveAttribute('aria-disabled', 'true');
    await page.locator('.slx-cmd [data-id=status]').click();
    const name = page.locator('.slx-status-name');
    await expect(name).toContainText('洛恩');
    await page.locator('.slx-status-next').click();
    await expect(name).toContainText('凜');
    await page.locator('.slx-status-next').click();
    await expect(name).toContainText('洛恩');   // two members: the second page turn is back at the first
    await page.locator('.slx-back').click();
    await page.locator('.slx-cmd [data-id=formation]').click();
    await expect(page.locator('.slx-formation-scene')).toBeVisible();
    await page.locator('[data-cell="4"]').click();   // an empty cell: who goes here?
    const picks = await page.locator('.slx-formation-pick [role=option] .slx-label').allTextContents();
    expect(picks).toEqual(expect.arrayContaining(['洛恩', '凜']));
    for (const other of others) expect(picks.join(' '), other).not.toContain(other);
    await page.locator('.slx-back').click();
    await page.locator('.slx-back').click();
    await expect(page.locator('.slx-guild')).toBeVisible();
    await page.locator('.slx-back').click();
    await expect(page.locator('.slx-town')).toBeVisible(); await w.closeTalk();

    // Both at Lv4, out through the mainline gate and down to floor 2 (the stairs ask first).
    await game((g) => { g.state.party.roster.hero.level = 4; g.state.party.roster.rin.level = 4; });
    await depart(page, w);
    const toStairs = await pathTo(page, 'down');
    expect(toStairs?.keys.length).toBeGreaterThan(0);
    for (const k of toStairs!.keys) {
      await game((g) => { g.encounter = 0; });
      await page.keyboard.press(k);
    }
    await w.choose('.slx-event-stairs', '前往');
    await expect.poll(() => game((g) => g.floor)).toBe(2);
    await w.closeTalk();

    // Selene waits in a room of floor 2. Stand two cells before it in a straight line, so the first step shows it on the map.
    const plan = await game((g) => {
      const room = g.run.floors.get(g.floor).contents.find((c: any) => c.kind === 'rescue');
      const open = (x: number, y: number) => ['floor', 'door'].includes(g.map().tiles[y]?.[x]);
      for (const [key, dx, dy] of [['ArrowRight', 1, 0], ['ArrowLeft', -1, 0], ['ArrowDown', 0, 1], ['ArrowUp', 0, -1]] as const) {
        const far = { x: room.at.x - 2 * dx, y: room.at.y - 2 * dy };
        if (open(far.x, far.y) && open(room.at.x - dx, room.at.y - dy)) { g.pos = far; g.encounter = 0; return { key, who: room.who, at: room.at }; }
      }
      return null;
    });
    expect(plan, 'a straight way into the rescue room').not.toBeNull();
    expect(plan!.who).toBe('selene');
    await page.keyboard.press(plan!.key);
    await expect.poll(() => game((g, at: string) => g.run.explored[g.floor].includes(at), `${plan!.at.x},${plan!.at.y}`)).toBe(true);
    await expect(page.locator('.slx-dungeon')).toBeVisible();
    await shot('02-map-rescue-marker');
    await game((g) => { g.encounter = 0; });
    await page.keyboard.press(plan!.key);
    await expect(page.locator('.slx-dungeon .slx-talk .slx-text')).toContainText('瑟蕾');
    await shot('03-meeting-line');
    // The found line, then the written meeting (plan 6c Task 8: up to four lines, hers among them), then the fight.
    // A key may first finish a line's typing, so allow a few presses per line, as the second meeting below does.
    const plates: string[] = [];
    for (let i = 0; i < 12 && !(await page.locator('.slx-battle').isVisible()); i++) {
      const plate = page.locator('.slx-dungeon .slx-talk .slx-name');
      if (await plate.isVisible()) plates.push((await plate.textContent()) ?? '');
      await w.key('z');
      await page.waitForTimeout(60);
    }
    await expect(page.locator('.slx-battle')).toBeVisible();
    expect(plates, 'Selene speaks in her own meeting').toContain('瑟蕾');
    await game((g) => { for (const e of g.battle.enemies) { e.hp = 0; e.alive = false; } });
    for (let i = 0; i < 40 && !(await page.locator('.slx-result').isVisible()); i++) {
      if (await page.locator('.slx-bcmd [role=option]').count()) { await w.key('ArrowUp'); await w.key('Enter'); }   // 全員攻擊
      else await page.waitForTimeout(50);
    }
    await expect(page.locator('.slx-result')).toContainText('勝利');
    await expect(page.locator('.slx-result')).toContainText(/瑟蕾（Lv\d+）加入了隊伍！/);
    await shot('04-rescue-result');
    await w.key('Enter');
    await expect(page.locator('.slx-dungeon')).toBeVisible();
    expect(await game((g) => g.state.party.recruited)).toEqual(['hero', 'rin', 'selene']);
    await lampHome(page, w);
    await w.closeTalk();

    // Home: the formation lets Selene step out to the bench (never the hero), and the guild calls her back.
    await w.choose('.slx-town', '冒險者公會');
    await expect(page.locator('.slx-guild')).toBeVisible(); await w.closeTalk();
    await page.locator('.slx-cmd [data-id=formation]').click();
    await expect(page.locator('.slx-formation-scene')).toBeVisible();
    const cellOf = (id: string) => game((g, who: string) => g.state.party.grid.indexOf(who), id);
    await page.locator(`[data-cell="${await cellOf('hero')}"]`).click();
    const heroPicks = await page.locator('.slx-formation-pick [role=option] .slx-label').allTextContents();
    expect(heroPicks).toContain('洛恩');
    expect(heroPicks).not.toContain('移出隊伍');   // the hero's cell has no way off the field
    await shot('05-formation-hero-cell');
    await page.locator('.slx-back').click();       // close the pick list
    await page.locator(`[data-cell="${await cellOf('selene')}"]`).click();
    await page.locator('.slx-formation-pick [role=option]').filter({ hasText: '移出隊伍' }).click();
    expect(await cellOf('selene')).toBe(-1);
    expect(await game((g) => g.state.party.recruited)).toContain('selene');
    await shot('06-formation-selene-benched');
    await page.locator('.slx-back').click();
    await expect(page.locator('.slx-guild')).toBeVisible();
    await expect(page.locator('.slx-cmd [data-id=recall]')).not.toHaveAttribute('aria-disabled', 'true');
    await page.locator('.slx-cmd [data-id=recall]').click();
    await shot('07-guild-recall-list');
    await page.locator('.slx-layer [data-id=selene]').click();
    await w.key('ArrowUp'); await w.key('Enter');   // 是
    await expect(page.locator('.slx-talk .slx-text')).toHaveText(T.ui2.guild.welcomeBack(CHARACTERS.selene.name));
    expect(await cellOf('selene')).toBeGreaterThanOrEqual(0);
    await w.closeTalk();

    // A full field: someone has to step out.
    await game((g) => {
      const p = g.state.party;
      p.grid = p.grid.map((c: string | null) => (c === 'selene' ? null : c));
      p.recruited.push('chizuru', 'liz', 'noel');
      for (const id of ['chizuru', 'liz', 'noel']) p.grid[p.grid.indexOf(null)] = id;
    });
    expect(await game((g) => g.state.party.grid.filter((c: string | null) => c).length)).toBe(5);
    const lizCell = await cellOf('liz');
    await page.locator('.slx-back').click();   // the guild reads the party when it opens: go out and in again
    await expect(page.locator('.slx-town')).toBeVisible(); await w.closeTalk();
    await w.choose('.slx-town', '冒險者公會');
    await expect(page.locator('.slx-guild')).toBeVisible(); await w.closeTalk();
    await page.locator('.slx-cmd [data-id=recall]').click();
    await page.locator('.slx-layer [data-id=selene]').click();
    await w.key('ArrowUp'); await w.key('Enter');   // 是
    await expect(page.locator('.slx-layer').last()).toContainText('要讓誰回公會待命？');
    await expect(page.locator('.slx-layer [data-id=hero]')).toHaveCount(0);   // the hero never steps out
    await shot('08-guild-recall-full-field-swap');
    await page.locator('.slx-layer [data-id=liz]').click();
    expect(await cellOf('selene')).toBe(lizCell);
    expect(await cellOf('liz')).toBe(-1);
    await w.closeTalk();

    // The hero's tree has five branches and his talent board six columns.
    await page.locator('.slx-cmd [data-id=tree]').click();
    await expect(page.locator('.slx-status-name')).toContainText('洛恩');
    await expect(page.locator('.slx-tree-branch')).toHaveCount(5);
    await shot('09-hero-skill-tree');
    await page.locator('.slx-back').click();
    await page.locator('.slx-cmd [data-id=talent]').click();
    await expect(page.locator('.slx-status-name')).toContainText('洛恩');
    await expect(page.locator('.slx-talent-wide')).toBeVisible();
    await shot('10-hero-talent-board');
    await page.locator('.slx-back').click();
    await page.locator('.slx-back').click();
    await expect(page.locator('.slx-town')).toBeVisible(); await w.closeTalk();

    // Save at the inn, reload and continue: the save is valid and Selene is still recruited.
    await w.choose('.slx-town', '旅館');
    await expect(page.locator('.slx-inn')).toBeVisible(); await w.closeTalk();
    await w.key('Enter'); await w.key('ArrowUp'); await w.key('Enter');
    await expect(page.locator('.slx-talk .slx-text')).toHaveText('已存檔。', { timeout: 5000 });
    await page.reload();
    await expect(page.locator('.slx-title [aria-selected=true]')).toHaveText('繼續');
    await w.key('Enter');
    await expect(page.locator('.slx-town')).toBeVisible();
    await expectSaveLoaded(page);
    expect(await game((g) => g.state.party.recruited)).toContain('selene');
    expect(w.errors).toEqual([]);
  });

  test("prologue, Rin's first memory, Selene, recall, handbook, Rin's reveal and Scarlet's fight", async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1280, height: 720 });
    /** With SL_SHOTS=<dir> the run also leaves its screenshots there; otherwise this is a no-op. */
    const shots = process.env.SL_SHOTS;
    if (shots) mkdirSync(shots, { recursive: true });
    const shot = async (name: string) => {
      if (!shots) return;
      await page.waitForTimeout(700);   // windows fade in: wait until they are fully drawn
      await page.screenshot({ path: `${shots}/${name}.png` });
    };
    /** Runs `fn` in the page on the live game (the debug hook), with one serialisable argument. */
    const game = <T, A = undefined>(fn: (g: any, a: A) => T, arg?: A): Promise<T> =>
      page.evaluate(([src, a]) => new Function('g', 'a', `return (${src})(g, a)`)((window as unknown as Dbg).__starlanternDebug.game, a), [fn.toString(), arg] as [string, unknown]) as Promise<T>;
    /**
     * Confirms through whatever is being said until the screen has stayed quiet for a few checks: no dialogue box, and no
     * window hidden for a scene (the town menu, the pad, the guild's command window). Keyed on structure, not on any wording.
     */
    const playOut = async () => {
      for (let quiet = 0, i = 0; quiet < 4 && i < 400; i++) {
        if (await page.locator('.slx-talk').first().isVisible()) { quiet = 0; await page.keyboard.press('z'); await page.waitForTimeout(30); }
        else if ((await page.locator('.slx-cmd-hidden').count()) > 0) { quiet = 0; await page.waitForTimeout(60); }
        else { quiet++; await page.waitForTimeout(60); }
      }
      await expect(page.locator('.slx-talk').first()).toBeHidden();
    };
    const w = await setup(page, 7, { story: 'all' });

    // 1. A new game plays the prologue and then the inn night to their end, with no return chat before them, and lands on the town menu.
    expect(await game((g) => g.arrival)).toEqual(['prologue', 'prologue-inn']);
    await playOut();
    await expect(page.locator('.slx-town-menu')).not.toHaveClass(/slx-cmd-hidden/);
    const first = await game((g) => ({ seen: g.state.story.seen, fresh: g.state.story.fresh, queue: g.state.story.queue }));
    expect(first.seen).toEqual(['prologue', 'prologue-inn']);
    expect(first.seen.filter((id: string) => id.startsWith('chat:'))).toEqual([]);
    expect([first.fresh, first.queue]).toEqual([[], []]);   // played, not skipped: nothing is new, nothing waits

    // 2. Another new game: Esc on the first sentence shows the skip summary, then the town menu. (The setting survives the reload.)
    await page.evaluate(() => localStorage.removeItem('starlantern-save'));
    await page.reload();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('starlantern-settings') ?? '{}').story)).toBe('all');
    await expect(page.locator('.slx-title [aria-selected=true]')).toHaveText('新遊戲');
    await w.key('Enter');
    await expect(page.locator('.slx-town .slx-talk')).toBeVisible();
    await expect(page.locator('.slx-town-menu')).toHaveClass(/slx-cmd-hidden/);
    await shot('01-prologue');
    await w.key('Escape');
    await expect(page.locator('.slx-town .slx-talk .slx-text')).toContainText(STORY.scenes.prologue.summary);
    await shot('02-prologue-skip-summary');
    // The inn night follows before the town is the player's (Task 10b): the menu stays hidden until its first line is up.
    const talkText = page.locator('.slx-town .slx-talk .slx-text');
    const innFirst = STORY.scenes['prologue-inn'].lines[0].text;
    for (let i = 0; i < 6 && ((await talkText.textContent()) ?? '') !== innFirst; i++) {
      await expect(page.locator('.slx-town-menu')).toHaveClass(/slx-cmd-hidden/);
      await w.key('z'); await page.waitForTimeout(80);
    }
    await expect(talkText).toHaveText(innFirst);
    await expect(page.locator('.slx-town-menu')).toHaveClass(/slx-cmd-hidden/);
    expect(await game((g) => ({ seen: g.state.story.seen, arrival: g.arrival }))).toEqual({ seen: ['prologue'], arrival: ['prologue-inn'] });
    await shot('02b-prologue-inn');
    await playOut();
    await expect(page.locator('.slx-town-menu')).not.toHaveClass(/slx-cmd-hidden/);
    expect(await game((g) => g.state.story.seen)).toEqual(['prologue', 'prologue-inn']);

    // 3. Out through the mainline gate. Rin's glimmer: stand two cells off, step once (it shows on the map), then onto it.
    await depart(page, w);
    const glimmer = await game((g) => {
      const c = g.run.floors.get(g.floor).contents.find((x: any) => x.kind === 'glimmer' && x.owner === 'rin');
      if (!c) return null;
      const open = (x: number, y: number) => ['floor', 'door'].includes(g.map().tiles[y]?.[x]);
      for (const [key, dx, dy] of [['ArrowRight', 1, 0], ['ArrowLeft', -1, 0], ['ArrowDown', 0, 1], ['ArrowUp', 0, -1]] as const) {
        const far = { x: c.at.x - 2 * dx, y: c.at.y - 2 * dy };
        if (open(far.x, far.y) && open(c.at.x - dx, c.at.y - dy)) { g.pos = far; g.encounter = 0; return { key, at: c.at }; }
      }
      return null;
    });
    expect(glimmer, "a straight way to Rin's glimmer on floor 1").not.toBeNull();
    await page.keyboard.press(glimmer!.key);
    await expect.poll(() => game((g, at: string) => g.run.explored[g.floor].includes(at), `${glimmer!.at.x},${glimmer!.at.y}`)).toBe(true);
    await shot('04-map-glimmer-marker');
    await game((g) => { g.encounter = 0; });
    await page.keyboard.press(glimmer!.key);
    // What the glimmer held, line by line, and then the memory scene in its own look.
    const memoryTalk = page.locator('.slx-dungeon .slx-talk.slx-talk--memory');
    for (let i = 0; i < 14 && !(await memoryTalk.isVisible()); i++) { await w.key('z'); await page.waitForTimeout(60); }
    await expect(memoryTalk).toBeVisible();
    // The memory may open on narration (no face): advance to Rin's first spoken line, then her portrait must be on the box.
    const rinFirst = STORY.scenes[memScene('rin', 1)].lines.find((l) => l.who === 'rin')!;
    const memoryText = page.locator('.slx-dungeon .slx-talk.slx-talk--memory .slx-text');
    for (let i = 0; i < 20 && !((await memoryText.textContent()) ?? '').includes(rinFirst.text); i++) { await w.key('z'); await page.waitForTimeout(60); }
    await expect(memoryText).toHaveText(rinFirst.text);
    await expect(page.locator('.slx-dungeon .slx-talk .slx-name')).toHaveText(CHARACTERS.rin.name);
    await expect(page.locator('.slx-dungeon .slx-talk img.slx-talk-face[src$="/char/rin-portrait.png"]')).toBeVisible();   // her memory is spoken with her portrait on the box
    // Task 10a: the portrait stands at least twice its old 96px (on-screen, at the page's own scale), and clear of the text and the name plate.
    {
      const scr = (await box(page))!;
      const k = scr.width / 640;
      const face = (await page.locator('.slx-dungeon .slx-talk img.slx-talk-face').boundingBox())!;
      const textBox = (await memoryText.boundingBox())!;
      const nameBox = (await page.locator('.slx-dungeon .slx-talk .slx-name').boundingBox())!;
      expect(face.height).toBeGreaterThanOrEqual(2 * 96 * k - 0.5);
      expect(face.width).toBeGreaterThanOrEqual(2 * 96 * k - 0.5);
      const clear = (a: { x: number; y: number; width: number; height: number }, b: typeof a) => a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
      expect(clear(face, textBox), 'portrait clear of the dialogue text').toBe(true);
      expect(clear(face, nameBox), 'portrait clear of the name plate').toBe(true);
      expect(face.y).toBeGreaterThanOrEqual(scr.y - 0.5);
      expect(face.x).toBeGreaterThanOrEqual(scr.x - 0.5);
      expect(face.x + face.width).toBeLessThanOrEqual(scr.x + scr.width + 0.5);
    }
    await shot('03-memory-scene');
    // Every line of the memory, wrapped or not: whenever a portrait shows it fits (the tall dungeon box is the risk that capped its size).
    {
      let tallest = 0;
      for (let i = 0; i < 60 && (await memoryTalk.isVisible()); i++) {
        tallest = Math.max(tallest, (await faceFits(page)) ?? 0);
        await w.key('z'); await page.waitForTimeout(40);
      }
      expect(tallest, 'at least one memory line showed a portrait').toBeGreaterThan(0);
    }
    await playOut();
    await expect(page.locator('.slx-talk--memory')).toHaveCount(0);
    await expect(page.locator('.slx-dungeon')).toBeVisible();
    const rin1 = await game((g) => ({ memories: g.state.party.roster.rin.memories, seen: g.state.story.seen, fresh: g.state.story.fresh }));
    expect(rin1.memories).toBe(1);
    expect(rin1.seen).toContain(memScene('rin', 1));
    expect(rin1.fresh).not.toContain(memScene('rin', 1));

    // 4. Both at Lv4, down to floor 2, and Selene waits in a room there.
    await game((g) => { g.state.party.roster.hero.level = 4; g.state.party.roster.rin.level = 4; });
    const toStairs = await pathTo(page, 'down');
    expect(toStairs?.keys.length).toBeGreaterThan(0);
    for (const k of toStairs!.keys) {
      await game((g) => { g.encounter = 0; });
      await page.keyboard.press(k);
    }
    await w.choose('.slx-event-stairs', '前往');
    await expect.poll(() => game((g) => g.floor)).toBe(2);
    await w.closeTalk();
    const plan = await game((g) => {
      const room = g.run.floors.get(g.floor).contents.find((c: any) => c.kind === 'rescue');
      const open = (x: number, y: number) => ['floor', 'door'].includes(g.map().tiles[y]?.[x]);
      for (const [key, dx, dy] of [['ArrowRight', 1, 0], ['ArrowLeft', -1, 0], ['ArrowDown', 0, 1], ['ArrowUp', 0, -1]] as const) {
        const far = { x: room.at.x - 2 * dx, y: room.at.y - 2 * dy };
        if (open(far.x, far.y) && open(room.at.x - dx, room.at.y - dy)) { g.pos = far; g.encounter = 0; return { key, who: room.who, at: room.at }; }
      }
      return null;
    });
    expect(plan, 'a straight way into the rescue room').not.toBeNull();
    expect(plan!.who).toBe('selene');
    await page.keyboard.press(plan!.key);
    await expect.poll(() => game((g, at: string) => g.run.explored[g.floor].includes(at), `${plan!.at.x},${plan!.at.y}`)).toBe(true);
    await shot('05-map-rescue-marker');
    await game((g) => { g.encounter = 0; });
    await page.keyboard.press(plan!.key);
    // The meeting line first, then the fight.
    await expect(page.locator('.slx-dungeon .slx-talk')).toBeVisible();
    await shot('06-meeting-line');
    for (let i = 0; i < 12 && !(await page.locator('.slx-battle').isVisible()); i++) { await w.key('z'); await page.waitForTimeout(60); }
    await expect(page.locator('.slx-battle')).toBeVisible();
    await game((g) => { for (const e of g.battle.enemies) { e.hp = 0; e.alive = false; } });
    for (let i = 0; i < 40 && !(await page.locator('.slx-result').isVisible()); i++) {
      if (await page.locator('.slx-bcmd [role=option]').count()) { await w.key('ArrowUp'); await w.key('Enter'); }   // 全員攻擊
      else await page.waitForTimeout(50);
    }
    await expect(page.locator('.slx-result')).toContainText(/瑟蕾（Lv\d+）加入了隊伍！/);
    await shot('07-rescue-result');
    await w.key('Enter');
    await expect(page.locator('.slx-dungeon')).toBeVisible();
    await playOut();
    expect(await game((g) => g.state.party.recruited)).toEqual(['hero', 'rin', 'selene']);

    // 5. Home with the lamp, after the party's first won fight: the first-return scene opens the arrival, ahead of any return
    // chat, while the town menu waits (Task 10b). It plays with its portraits in the screen. Then Selene to the bench and back.
    await game((g) => { g.state.inventory['return-lamp'] = 1; });
    await lampHome(page, w);
    const homeArrival = await game((g) => g.arrival);
    expect(homeArrival[0]).toBe('first-return');
    expect(homeArrival.slice(1).every((id: string) => id.startsWith('chat:'))).toBe(true);
    await expect(page.locator('.slx-town-menu')).toHaveClass(/slx-cmd-hidden/);
    {
      const trust = STORY.scenes['first-return'].lines.filter((l) => l.who === 'rin').at(-1)!.text;   // Rin's last spoken line of the scene
      let heard = false;
      let faces = 0;
      for (let i = 0; i < 40 && !heard; i++) {
        if (((await talkText.textContent()) ?? '') === trust) heard = true;
        else if (await page.locator('.slx-town .slx-talk').isVisible()) { if ((await faceFits(page)) !== null) faces++; await w.key('z'); await page.waitForTimeout(60); }
        else await page.waitForTimeout(60);
      }
      expect(heard, "the first return reaches Rin's last spoken line").toBe(true);
      await expect(page.locator('.slx-town .slx-talk .slx-name')).toHaveText(CHARACTERS.rin.name);
      expect((await faceFits(page)) ?? faces, 'the first return shows a portrait that fits').toBeGreaterThan(0);
      await shot('07b-first-return');
    }
    await playOut();
    expect(await game((g) => g.state.story.seen)).toContain('first-return');
    expect(await game((g) => g.arrival)).toEqual([]);
    await w.choose('.slx-town', '冒險者公會');
    await expect(page.locator('.slx-guild')).toBeVisible(); await w.closeTalk();
    await page.locator('.slx-cmd [data-id=formation]').click();
    await expect(page.locator('.slx-formation-scene')).toBeVisible();
    const cellOf = (id: string) => game((g, who: string) => g.state.party.grid.indexOf(who), id);
    await page.locator(`[data-cell="${await cellOf('selene')}"]`).click();
    await page.locator('.slx-formation-pick [role=option]').filter({ hasText: '移出隊伍' }).click();
    expect(await cellOf('selene')).toBe(-1);
    await page.locator('.slx-back').click();
    await expect(page.locator('.slx-guild')).toBeVisible();
    await expect(page.locator('.slx-cmd [data-id=recall]')).not.toHaveAttribute('aria-disabled', 'true');
    await page.locator('.slx-cmd [data-id=recall]').click();
    await shot('08-guild-recall');
    await page.locator('.slx-layer [data-id=selene]').click();
    await w.key('ArrowUp'); await w.key('Enter');   // 是
    await expect.poll(() => cellOf('selene')).toBeGreaterThanOrEqual(0);
    await w.closeTalk();

    // 6. The fragment exchange at the absorb cap: Rin is one short of ABSORB_CAP, the hero is full.
    await page.locator('.slx-back').click();
    await expect(page.locator('.slx-town')).toBeVisible(); await w.closeTalk();
    await game((g, a: { shard: string; amount: number; cap: number }) => {
      g.state.inventory[a.shard] = 3;
      const fill = (n: number) => Array.from({ length: n }, () => ({ stat: 'hp', amount: a.amount }));
      g.state.party.roster.hero.absorbed = fill(a.cap);
      g.state.party.roster.rin.absorbed = fill(a.cap - 1);
    }, { shard: SHARD_IDS.dim, amount: ABSORB_GAIN.dim.hp, cap: ABSORB_CAP });
    await w.choose('.slx-town', '冒險者公會');
    await expect(page.locator('.slx-guild')).toBeVisible(); await w.closeTalk();
    const layerRow = (label: string) => page.locator('.slx-layer:last-child [role=option]').filter({ hasText: label });
    await page.locator('.slx-cmd [data-id=exchange]').click();
    await shot('09-exchange-menu');
    await layerRow(T.ui2.exchange.absorb).click();
    await layerRow(SHARD_NAMES.dim).click();
    await expect(layerRow(CHARACTERS.hero.name)).toHaveAttribute('aria-disabled', 'true');
    await expect(layerRow(CHARACTERS.rin.name)).not.toHaveAttribute('aria-disabled', 'true');
    await expect(layerRow(CHARACTERS.rin.name)).toContainText(T.ui2.exchange.count(ABSORB_CAP - 1, ABSORB_CAP));
    await shot('10-exchange-absorb-cap');
    for (let i = 0; i < 6 && (await page.locator('.slx-layer').count()) > 0; i++) { await w.key('Escape'); await page.waitForTimeout(80); }
    await expect(page.locator('.slx-guild')).toBeVisible();
    await w.key('Escape');
    await expect(page.locator('.slx-town')).toBeVisible(); await w.closeTalk();

    // 7. The handbook from the town menu: something new to clear, Rin's first piece, the truths, all five pages.
    // A hero chat stands in for one heard before (the return chat did not necessarily play), so a plain scene with a portrait can be shot.
    await game((g, ids: string[]) => {
      for (const id of ids) {
        if (!g.state.story.seen.includes(id)) g.state.story.seen.push(id);
        if (!g.state.story.fresh.includes(id)) g.state.story.fresh.push(id);
      }
    }, [memScene('rin', 1), 'prologue', 'chat:hero:1']);
    await page.locator('.slx-town [data-id=handbook]').click();
    await expect(page.locator('.slx-handbook')).toBeVisible();
    const H = T.ui2.handbook;
    const hbTab = (label: string) => page.locator('.slx-tabs .slx-tab').filter({ hasText: label });
    const hbRow = (label: string) => page.locator('.slx-hb-list [role=option]').filter({ hasText: label });
    const replay = async () => {
      await expect(page.locator('.slx-handbook.slx-hb-playing')).toBeVisible();
      for (let i = 0; i < 120 && (await page.locator('.slx-handbook.slx-hb-playing').count()) > 0; i++) { await w.key('z'); await page.waitForTimeout(40); }
      await expect(page.locator('.slx-handbook.slx-hb-playing')).toHaveCount(0);
    };
    await expect(page.locator('.slx-hb-list .slx-fresh')).toHaveCount(1);   // Rin's row carries 新
    await shot('11-handbook-memories');
    await hbRow(CHARACTERS.rin.name).click();
    await expect(hbRow(STORY.scenes[memScene('rin', 1)].title).locator('.slx-fresh')).toHaveCount(1);
    await hbRow(STORY.scenes[memScene('rin', 1)].title).click();
    await replay();
    await expect(page.locator('.slx-hb-list .slx-fresh')).toHaveCount(0);
    await page.locator('.slx-back').click();   // from the piece list back to the memories
    for (const [tab, name] of [['people', '12-handbook-people'], ['town', '13-handbook-town'], ['codex', '14-handbook-codex']] as const) {
      await hbTab(H.tabs[tab]).click();
      await expect(hbTab(H.tabs[tab])).toHaveAttribute('aria-selected', 'true');
      await shot(name);
    }
    await hbTab(H.tabs.people).click();
    await hbRow(CHARACTERS.hero.name).click();
    await hbRow(STORY.scenes['chat:hero:1'].title).click();
    await expect(page.locator('.slx-handbook.slx-hb-playing')).toBeVisible();
    await expect(page.locator('.slx-handbook .slx-talk .slx-talk-face')).toBeVisible();
    await expect(page.locator('.slx-talk--memory')).toHaveCount(0);   // a chat is plain, a memory is dimmed
    await shot('12b-dialogue-portrait');
    await replay();
    await page.locator('.slx-back').click();
    await hbTab(H.tabs.truths).click();
    await expect(page.locator('.slx-hb-list .slx-fresh')).toHaveCount(1);   // the prologue is still marked new
    await shot('15-handbook-truths');
    await hbRow(H.stages.prologue).click();
    await replay();
    await expect(page.locator('.slx-hb-list .slx-fresh')).toHaveCount(0);
    await page.locator('.slx-back').click();
    await expect(page.locator('.slx-town')).toBeVisible(); await w.closeTalk();
    expect(await game((g) => g.state.story.fresh)).toEqual([]);

    // 8. Save at the inn, reload, continue: a valid save, Rin holds one memory, and the arrival has no return chat.
    await w.choose('.slx-town', '旅館');
    await expect(page.locator('.slx-inn')).toBeVisible(); await w.closeTalk();
    await w.key('Enter'); await w.key('ArrowUp'); await w.key('Enter');
    await expect(page.locator('.slx-talk .slx-text')).toHaveText(T.ui2.inn.saved, { timeout: 5000 });
    await page.reload();
    await expect(page.locator('.slx-title [aria-selected=true]')).toHaveText('繼續');
    await w.key('Enter');
    await expect(page.locator('.slx-town')).toBeVisible();
    await expectSaveLoaded(page);
    const back = await game((g) => ({ rin: g.state.party.roster.rin.memories, arrival: g.arrival, recruited: g.state.party.recruited }));
    expect(back.rin).toBe(1);
    expect(back.arrival).toEqual([]);
    expect(back.recruited).toContain('selene');
    await w.closeTalk();

    // 9. Rin's seventh piece, then home: the reveal plays alone in the town.
    await depart(page, w);
    await game((g, n: number) => { g.state.party.roster.rin.memories = n; g.state.inventory['return-lamp'] = 1; }, chainLength('rin'));
    await lampHome(page, w);
    await expect(page.locator('.slx-town-menu')).toHaveClass(/slx-cmd-hidden/);
    expect(await game((g) => g.arrival)).toEqual(['rin-reveal']);
    for (let i = 0; i < 2; i++) { await w.key('z'); await page.waitForTimeout(60); }
    await shot('16-rin-reveal');
    await playOut();
    const reveal = await game((g) => ({ oath: g.state.party.roster.rin.oath, seen: g.state.story.seen }));
    expect(reveal.oath).toBe(true);
    expect(reveal.seen).toContain('rin-reveal');

    // 10. The status page's memory column shows what her pieces added.
    await w.choose('.slx-town', '冒險者公會');
    await expect(page.locator('.slx-guild')).toBeVisible(); await w.closeTalk();
    await page.locator('.slx-cmd [data-id=status]').click();
    await flipTo(page, CHARACTERS.rin.name);
    await page.locator('[data-tab=stats]').click();
    const gainKey = Object.keys(CHAINS.rin.gain)[0];
    const memoryCell = page.locator(`.slx-stat-cat[data-cat=primary] tr[data-stat=${gainKey}] td.slx-memory`);
    await expect(page.locator('.slx-stat-cat[data-cat=primary] thead th')).toContainText([T.ui2.status.sources.memory]);
    await expect(memoryCell).toHaveText(/^\+/);
    await memoryCell.scrollIntoViewIfNeeded();
    await shot('17-status-memory-column');
    await page.locator('.slx-back').click();
    await page.locator('.slx-back').click();
    await expect(page.locator('.slx-town')).toBeVisible(); await w.closeTalk();

    // 11. Scarlet at iron depth 8: her story fight, with her standee in the enemy slot.
    await game((g) => {
      g.state.dungeon.reached.iron = 8;
      g.state.dungeon.portals = [{ region: 'mainline', condition: 'plain' }, { region: 'iron', condition: 'plain' }, { region: 'blaze', condition: 'plain' }];
    });
    await w.choose('.slx-town', '傳送門廣場');
    await expect(page.locator('.slx-gate')).toBeVisible(); await w.closeTalk();
    await w.key('Enter');
    await expect(page.locator('.slx-portal')).toHaveCount(3);
    await page.locator('.slx-portal').nth(1).click();
    await page.locator('.slx-depths [role=option]').nth(1).click();   // depth 5, the deepest start the region offers
    await w.key('ArrowUp'); await w.key('Enter');                    // 是
    await expect(page.locator('.slx-dungeon')).toBeVisible();
    await game((g) => { g.changeFloor(8); });
    await w.key('ArrowDown');                                        // the scene redraws on the next step
    const scarlet = await game((g) => {
      const room = g.run.floors.get(g.floor).contents.find((c: any) => c.kind === 'rescue');
      if (!room) return null;
      const open = (x: number, y: number) => ['floor', 'door'].includes(g.map().tiles[y]?.[x]);
      for (const [key, dx, dy] of [['ArrowRight', 1, 0], ['ArrowLeft', -1, 0], ['ArrowDown', 0, 1], ['ArrowUp', 0, -1]] as const) {
        const far = { x: room.at.x - 2 * dx, y: room.at.y - 2 * dy };
        if (open(far.x, far.y) && open(room.at.x - dx, room.at.y - dy)) { g.pos = far; g.encounter = 0; return { key, who: room.who, floor: g.floor }; }
      }
      return null;
    });
    expect(scarlet, "a straight way into Scarlet's room").not.toBeNull();
    expect([scarlet!.who, scarlet!.floor]).toEqual(['scarlet', 8]);
    await page.keyboard.press(scarlet!.key);
    await game((g) => { g.encounter = 0; });
    await page.keyboard.press(scarlet!.key);
    for (let i = 0; i < 14 && !(await page.locator('.slx-battle').isVisible()); i++) { await w.key('z'); await page.waitForTimeout(60); }
    await expect(page.locator('.slx-battle')).toBeVisible();
    const fight = await game((g) => ({ survive: g.battle.survive, foes: g.battle.enemies.map((e: any) => e.defId) }));
    expect(fight.survive).toBeGreaterThan(0);
    expect(fight.foes[0]).toBe('scarlet-foe');
    await shot('18-scarlet-story-fight');
    expect(w.errors).toEqual([]);
  });
});
