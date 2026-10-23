import { test, expect, type Page } from '@playwright/test';
import { SPECIALS, AFFIXES } from '../../src/scripts/games/starlantern/data/gear';
import { CHARACTERS } from '../../src/scripts/games/starlantern/data/characters';
import { EQUIPMENT } from '../../src/scripts/games/starlantern/data/equipment';
import { LEGACY_GRID, LEGACY_LINEUP, meet } from '../../src/scripts/games/starlantern/engine/party';
import { FOUND_LINE, STORY } from '../../src/scripts/games/starlantern/data/story.zh-TW';
import { T } from '../../src/scripts/games/starlantern/data/text.zh-TW';
import { CHAINS, chainLength } from '../../src/scripts/games/starlantern/data/story/chains';
import { ABSORB_CAP, ABSORB_GAIN, SHARD_IDS, SHARD_NAMES } from '../../src/scripts/games/starlantern/data/story/fragments';
import { memScene } from '../../src/scripts/games/starlantern/data/story/scenes';
import { favouredRegions } from '../../src/scripts/games/starlantern/data/meetings';
import { rollPortals, withLead } from '../../src/scripts/games/starlantern/engine/portals';
import { SKILLS } from '../../src/scripts/games/starlantern/data/skills';
import { TREES } from '../../src/scripts/games/starlantern/data/trees';
import { STAT_CATEGORIES } from '../../src/scripts/games/starlantern/engine/stats';
import { maxValue } from '../../src/scripts/games/starlantern/engine/loot/item';
import { mkdirSync, readFileSync } from 'node:fs';
import { version8Save } from '../../src/scripts/games/starlantern/engine/testing';
import { defaultTalents, defaultTree } from '../../src/scripts/games/starlantern/engine/progression';
import { buildTalents, buildTree } from '../../src/scripts/games/starlantern/engine/builds';
import { buildOf } from '../../src/scripts/games/starlantern/data/builds';
import { SWEEP, asDesktop, asPhone, expectedMode, fitTo, go, legibility, longestGear, snap, stageBox, stageScale, startSweepGame, sweep, writeReviewIndex } from './starlantern-legibility';

test.use({ launchOptions: { args: ['--mute-audio'] } });

// The game's spec runs on the three desktop chromium projects only: its guard reads fonts over CDP and asPhone drives CDP
// too; firefox, webkit and the playwright mobile devices were never part of it (final review).
const STARLANTERN_PROJECTS = ['chromium', 'chromium-dpr125', 'chromium-dpr150'];
test.beforeEach(({}, info) => { test.skip(!STARLANTERN_PROJECTS.includes(info.project.name), 'starlantern runs on the desktop chromium projects only'); });

// Every test ends on a screen that reads clearly: whole-pixel scale and 12/24px Cubic 11 (legibility plan).
test.afterEach(async ({ page }, info) => {
  if (!STARLANTERN_PROJECTS.includes(info.project.name)) return;
  expect(await legibility(page, { fontBlocked: info.annotations.some((a) => a.type === 'font-blocked') })).toEqual([]);
});

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
  // A narration line keeps the last speaker's face with no name plate (story staging S4): the plate is optional.
  const plate = page.locator('.slx-talk:not([hidden]) .slx-name:not([hidden])');
  const name = (await plate.count()) ? await plate.first().boundingBox() : null;
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
  const townLines = (): string[] => [...Object.values(STORY.townLines).flat(), ...Object.values(STORY.rinLines).flat(), ...STORY.rinOath, ...STORY.bellkeeper.oath.map((l) => l.text), ...STORY.bellkeeper.after];
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
    await fitTo(page, 390, 844);
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
          // In stage px (legibility 2b): on the phone the stage is turned, so the screen's width is not its scale.
          expect((await stageBox(page, page.locator('.slx-talk:not([hidden]) img.slx-talk-face').first())).height).toBeGreaterThanOrEqual(2 * 96 - 0.5);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        }
        await page.keyboard.press('z');
      }
      await page.waitForTimeout(60);
    }
    expect(faces, 'the prologue shows portraits').toBeGreaterThanOrEqual(3);
  });

  test('legibility() with requireReady fails a page whose game never became ready (final review)', async ({ page }) => {
    await page.setContent('<p>no game here</p>');
    expect(await legibility(page)).toEqual([]);                                   // the afterEach guard: nothing to check
    expect(await legibility(page, { requireReady: true, readyMs: 300 })).toEqual(['the game never became ready']);
  });

  test('forwards the old preview address to the game page', async ({ page }) => {
    await page.goto('/games/starlantern-next?seed=3');
    await expect(page).toHaveURL(/\/games\/starlantern\?seed=3$/);
    await expect(page.locator('.slx-title')).toBeVisible();
  });

  // Whole device pixels per stage pixel at every size, at 100% here and at 125% and 150% in the chromium-dpr projects
  // (legibility Task 2a). The page scrolls only as far as the stage overflows (legibility checks it).
  for (const [w, h] of [[1280, 720], [1366, 768], [2560, 1440], [1281, 721], [1919, 1081], [844, 390], [844, 340], [600, 400]] as const) {
    test(`fits a ${w}x${h} window at whole device pixels (legibility Task 2a) @dpr`, async ({ page }) => {
      await fitTo(page, w, h);
      await page.goto('/games/starlantern');
      await expect(page.locator('.slx-title [role=option]').first()).toBeVisible();
      const env = await page.evaluate(() => ({ vw: innerWidth, vh: innerHeight, d: devicePixelRatio }));
      const mode = await stageScale(page);
      expect(mode.kind).toBe('scale');
      expect(mode.s).toBeCloseTo(expectedMode(env.vw, env.vh, env.d, false).s, 4);
      if (w === 1280) expect(mode.s).toBeCloseTo(({ 1: 2, 1.25: 1.6, 1.5: 2 } as Record<number, number>)[env.d], 4);
      // 844x390 at 150%: K would be 1 (s 0.667, the text physically tiny), so the stage stays at 1x (readable over crisp).
      if (w === 844 && h === 390) expect(mode.s).toBe(1);
      expect(await legibility(page, { requireReady: true })).toEqual([]);
    });
  }

  test('fullscreen keeps the whole-pixel scale (legibility Task 2a) @dpr', async ({ page }) => {
    await storySetting(page);
    await fitTo(page, 1280, 720);
    await page.goto('/games/starlantern');
    await expect(page.locator('.slx-title [role=option]').first()).toBeVisible();
    await page.locator('.slx-title [role=option]', { hasText: T.ui2.title.settings }).click();
    await expect(page.locator('.slx-settings')).toBeVisible();
    await page.locator('.slx-settings [data-id=fullscreen]').click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
    expect(await page.locator('#sl-screen').evaluate((e) => getComputedStyle(e).transform)).not.toBe('none');
    expect(await legibility(page, { requireReady: true })).toEqual([]);
  });

  test('a touch phone held upright shows the stage turned, at whole device pixels (legibility Task 2b)', async ({ page }) => {
    await page.goto('/games/starlantern');
    for (const [w, h, d, s] of [[390, 844, 3, 1], [412, 915, 2.625, 3 / 2.625]] as const) {
      await asPhone(page, { width: w, height: h, dpr: d });
      await page.reload();
      await expect(page.locator('.slx-title [role=option]').first()).toBeVisible();
      const mode = await stageScale(page);
      expect(mode.kind, `${w}x${h}@${d}`).toBe('sideways');
      expect(mode.s, `${w}x${h}@${d}`).toBeCloseTo(s, 4);
      // On screen the stage is 360 x 640 stage px, under the hint's 40px.
      const b = (await box(page))!;
      expect([b.width, b.height]).toEqual([expect.closeTo(360 * s, 1), expect.closeTo(640 * s, 1)]);
      expect(b.y).toBeGreaterThanOrEqual(40);
      expect(b.x + b.width).toBeLessThanOrEqual(w + 0.5);
      const hint = await page.evaluate(() => { const cs = getComputedStyle(document.body, '::before'); return { content: cs.content, size: cs.fontSize }; });
      expect(hint).toEqual({ content: '"請將手機向左轉成橫向"', size: '12px' });   // the stage turns upright when the phone turns left
      expect(await legibility(page, { requireReady: true })).toEqual([]);
    }
  });

  test('a narrow desktop window keeps the stage upright at 1x and scrolls (legibility Task 2b) @dpr', async ({ page }) => {
    await asDesktop(page, 390, 844);
    await page.goto('/games/starlantern');
    await expect(page.locator('.slx-title [role=option]').first()).toBeVisible();
    expect(await stageScale(page)).toEqual({ kind: 'scale', s: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(true);
    expect(await page.evaluate(() => getComputedStyle(document.body, '::before').content)).toBe('none');   // no hint without touch
    expect(await legibility(page, { requireReady: true })).toEqual([]);
  });

  test('uses the pixel font and still renders when it fails to load', { annotation: { type: 'font-blocked' } }, async ({ page }) => {
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

  test('an old save opens with the rework notice and a free respec (plan 8d)', async ({ page }) => {
    await storySetting(page);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    // A version 8 save as plan 8c's build wrote it: strengthening nodes in every tree, a legendary ring on Noel.
    const trees = (JSON.parse(readFileSync('src/scripts/games/starlantern/engine/__fixtures__/roster-8b.json', 'utf8')) as { trees: Record<string, { id: string }[][]> }).trees;
    const { raw } = version8Save(trees);
    await page.goto('/games/starlantern');
    await page.evaluate((r) => localStorage.setItem('starlantern-save', r), raw);
    await page.reload();
    await page.locator('.slx-title [data-id=cont]').click();
    await expect(page.locator('.slx-town .slx-talk')).toContainText(T.notices['tree-reworked']);
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
    await closeTalk();
    await choose('.slx-town', '旅館');
    await expect(page.locator('.slx-inn')).toBeVisible(); await closeTalk();
    await choose('.slx-inn', '重置配點');
    const noel = page.locator('.slx-list [role=option]').filter({ hasText: CHARACTERS.noel.name });
    await expect(noel.locator('.slx-right')).toHaveText(T.ui2.inn.free);
    await expect(page.locator('.slx-list [role=option] .slx-right')).toHaveText(Array(10).fill(T.ui2.inn.free));
    await choose('.slx-list', CHARACTERS.noel.name);
    await expect(page.locator('.slx-inn .slx-confirm')).toContainText('這次免費');
    const gold = await page.evaluate(() => (window as unknown as Dbg).__starlanternDebug.game.state.gold);
    await key('ArrowUp'); await key('Enter');                                    // 是
    await expect(page.locator('.slx-inn .slx-talk')).toContainText('配點已重置');
    const after = await page.evaluate(() => {
      const s = (window as unknown as Dbg).__starlanternDebug.game.state;
      return { gold: s.gold, noel: s.party.roster.noel, saved: JSON.parse(localStorage.getItem('starlantern-save') ?? 'null') };
    });
    expect(after.gold).toBe(gold);
    expect(after.noel.tree).toEqual({ 'fire-star': 1 });
    expect(after.noel).not.toHaveProperty('freeRespec');
    expect(after.saved.version).toBe(9);
    expect(after.saved.party.roster.noel).not.toHaveProperty('freeRespec');
    expect(after.saved.party.roster.liz.freeRespec).toBe(true);
    expect(errors).toEqual([]);
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
  /** Every branch name of the tree page shows whole inside the columns (a reveal scroll must not hide them, 8d Task 5). */
  const branchNamesShown = (page: Page) => page.locator('.slx-tree-cols').evaluate((c) => {
    const box = c.getBoundingClientRect();
    return [...c.querySelectorAll('.slx-tree-branch-name')].every((h) => { const r = h.getBoundingClientRect(); return r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5; });
  });
  /**
   * Every tree node whose name breaks onto a second line (a variant's skill and label on two rows, or the rank pushed under
   * the name) or runs out of its own width (8d Task 6 review). The hero's five narrow columns (`.slx-tree-wide`) put the rank
   * under the name by design, so there only the name itself is held to one line.
   */
  const treeNameFaults = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.slx-tree-node')].filter((n) => {
    const name = n.querySelector<HTMLElement>('.slx-skill-name')!;
    const below = (els: Element[]) => els.some((e) => e.getBoundingClientRect().top > els[0].getBoundingClientRect().top + 4);
    const head = n.closest('.slx-tree-wide') ? [] : [...n.querySelector('.slx-skill-head')!.children];
    return below([...name.children]) || below(head) || name.scrollWidth > name.clientWidth + 0.5;
  }).map((n) => n.getAttribute('data-node')!));
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
    await expect(primary.locator('thead th')).toContainText(['裝備', '主屬']);   // 主屬性 short in the heading (plan 8g Task 5 review)
    await expect(primary.locator('thead th[title=主屬性]')).toHaveText('主屬');
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

  /**
   * Plan 5g named the overlay `glow-starlit` before it became `starlit.png`: nothing may ask for that old name. The epic
   * frame and the starlit overlay were published with plan 5d's G1 sample (Task 8): asking for them must succeed.
   */
  const UNPUBLISHED_RARITY_ART = ['ui/glow-starlit.png'];
  /** Every starlantern asset response, to check none failed. */
  const assetResponses = (page: Page) => {
    const seen: { url: string; status: number }[] = [];
    page.on('response', (r) => { if (r.url().includes('/assets/games/starlantern/')) seen.push({ url: r.url(), status: r.status() }); });
    return seen;
  };
  const STARLIT_AFFIXES = (['atk', 'crit', 'str', 'hp'] as const).map((key) => ({ key, value: maxValue(key, 6) }));

  test('epic and starlit gear come home, read their words and survive a save', async ({ page }) => {
    const asked: string[] = [];
    page.on('request', (r) => asked.push(r.url()));
    const answered = assetResponses(page);
    const w = await setup(page, 7);
    await depart(page, w);
    const uids: { epic: number; star: number } = await page.evaluate((starAffixes) => {
      const g = (window as unknown as Dbg).__starlanternDebug.game;
      const epic = g.mintUid(), star = g.mintUid();
      g.run.loot.gear.push(
        { uid: epic, base: 'iron-sword', rarity: 'epic', ilvl: 6, enhance: 0,
          affixes: [{ key: 'atk', value: 5 }, { key: 'crit', value: 3 }, { key: 'hp', value: 12 }, { key: 'str', value: 3 }] },
        { uid: star, base: 'thorn-spear', rarity: 'legendary', ilvl: 6, enhance: 0, special: 'lg-chizuru', starlit: true, affixes: starAffixes },
      );
      return { epic, star };
    }, STARLIT_AFFIXES);
    await lampHome(page, w);
    await expect(page.locator('.slx-town .slx-talk')).toContainText('鐵劍・史詩');
    await expect(page.locator('.slx-town .slx-talk')).toContainText('雙月槍・星輝傳說');
    await w.closeTalk();
    await w.choose('.slx-town', '冒險者公會');
    await expect(page.locator('.slx-guild')).toBeVisible(); await w.closeTalk();
    await page.locator('.slx-cmd [data-id=equip]').click();
    await expect(page.locator('.slx-equip-scene')).toBeVisible();
    const star = page.locator('.slx-bag-cell[aria-label="雙月槍・星輝傳說"]');
    const epic = page.locator('.slx-bag-cell[aria-label="鐵劍・史詩"]');
    await expect(star).toHaveClass(/slx-rarity-legendary/);
    await expect(star).toHaveClass(/slx-starlit/);
    await expect(epic).toHaveClass(/slx-rarity-epic/);
    await expect(epic).toHaveCSS('color', 'rgb(179, 107, 255)');
    // Plan 5d Task 8: the epic frame and the star light are published; both pieces' gear art too (iron sword, 雙月槍).
    await expect(epic.locator('.slx-rframe.slx-rframe-epic')).toHaveCount(1);
    await expect(epic.locator('img.slx-gear-ico')).toHaveCount(1);
    await expect(star.locator('.slx-rstarlit')).toHaveCount(1);
    await expect(star.locator('.slx-rglow')).toHaveCount(1);
    await star.hover();
    await expect(page.locator('.slx-item-detail .slx-line-starlit')).toHaveText(T.gear.starlitLine);
    await epic.hover();
    // The detail name takes the epic colour (it was gold whatever the rarity before plan 5g).
    await expect(page.locator('.slx-item-detail .slx-item-name')).toHaveText('鐵劍・史詩');
    await expect(page.locator('.slx-item-detail .slx-item-name')).toHaveCSS('color', 'rgb(179, 107, 255)');
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
    const kept = await page.evaluate((u) => {
      const s = (window as unknown as Dbg).__starlanternDebug.game.state;
      const all = [...s.bag, ...Object.values(s.party.roster).flatMap((m: any) => Object.values(m.equip))] as any[];
      const e = all.find((it) => it.uid === u.epic), st = all.find((it) => it.uid === u.star);
      return { epic: e?.rarity, epicStarlit: e?.starlit, star: st?.rarity, starlit: st?.starlit, affixes: st?.affixes };
    }, uids);
    expect(kept).toEqual({ epic: 'epic', epicStarlit: undefined, star: 'legendary', starlit: true, affixes: STARLIT_AFFIXES });
    expect(asked.filter((u) => UNPUBLISHED_RARITY_ART.some((a) => u.endsWith(a)))).toEqual([]);
    expect(answered.filter((a) => a.status >= 400)).toEqual([]);
    expect(answered.some((a) => a.url.endsWith('ui/rarity-epic.png') && a.status === 200)).toBe(true);
    expect(w.errors).toEqual([]);
  });

  test('a starlit chest drop raises a star-light pillar', async ({ page }) => {
    const answered = assetResponses(page);
    const w = await setup(page, 7);
    await depart(page, w);
    // As in the rare chest test, but every chest's gear is a starlit legendary.
    const chests: number = await page.evaluate((starAffixes) => {
      const g = (window as unknown as Dbg).__starlanternDebug.game;
      let n = 0;
      g.map().tiles.forEach((row: string[], y: number) => row.forEach((t, x) => {
        if (t !== 'chest') return;
        g.run.gearRolls[`chest:${g.floor}:${x},${y}`] = {
          uid: g.mintUid(), base: 'thorn-spear', rarity: 'legendary', ilvl: 6, enhance: 0, special: 'lg-chizuru', starlit: true, affixes: starAffixes,
        };
        n++;
      }));
      return n;
    }, STARLIT_AFFIXES);
    expect(chests).toBeGreaterThan(0);
    const pillar = page.locator('.slx-pillar.slx-pillar-starlit.slx-pillar-legend');
    const tried: string[] = [];
    let raised = false;
    let lineIcon = false;
    for (let c = 0; c < chests && !raised; c++) {
      const route = await pathTo(page, 'chest', tried);
      if (!route) break;
      tried.push(route.at);
      for (const k of route.keys) {
        await page.evaluate(() => { (window as unknown as Dbg).__starlanternDebug.game.encounter = 0; });
        await page.keyboard.press(k);
      }
      raised = (await pillar.count()) > 0;
      if (raised) {
        lineIcon = await page.locator('.slx-talk .slx-text img.slx-gear-ico[src$="/gear/lg-chizuru.png"]').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth === 26)
          .catch(() => false);
      }
      await w.closeTalk();
    }
    expect(raised).toBe(true);
    expect(await page.evaluate(() => (window as unknown as Dbg).__starlanternDebug.game.run.loot.gear.map((it: any) => it.starlit === true))).toContain(true);
    // The chest line names the piece after its published gear icon, which loaded; the spear's art answered 200.
    expect(answered.some((a) => a.url.endsWith('/gear/lg-chizuru.png') && a.status === 200)).toBe(true);
    expect(answered.filter((a) => a.status >= 400)).toEqual([]);
    expect(lineIcon).toBe(true);
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
    expect(fit.rows, `${fit.rows} rows`).toBeGreaterThanOrEqual(3);
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

  test.describe('the status sheet', () => {
    test('shows no native scrollbar on any page, and every row is reachable by the ▲/▼ cues, the keys and the wheel', async ({ playwright }, info) => {
      test.setTimeout(180000);
      // Headless Chromium hides scrollbars; in this browser they show, so a native one takes room and is measured as the
      // player sees it. (A launch option cannot be set for one group, so this test opens its own browser.)
      const browser = await playwright.chromium.launch({ args: ['--mute-audio'], ignoreDefaultArgs: ['--hide-scrollbars'] });
      const context = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: { width: 1280, height: 720 } });
      const page = await context.newPage();
      try {
        const w = await setup(page, 7);
        await page.locator('.slx-town [data-id=guild]').click();
        await expect(page.locator('.slx-guild')).toBeVisible(); await w.closeTalk();
        // The fullest sheets: everyone recruited at the top level with every tree node at its top rank, each slot wearing a
        // +10 named piece (one with a power where the slot has one) with four affixes at their top values.
        const gear = Object.fromEntries(['weapon', 'offhand', 'head', 'body', 'hands', 'feet', 'neck', 'ring'].map((slot) => {
          const named = Object.values(SPECIALS).filter((s) => s.slot === slot)
            .sort((a, b) => Number(!!b.power) - Number(!!a.power) || b.name.length - a.name.length)[0];
          const keys = (Object.keys(AFFIXES) as (keyof typeof AFFIXES)[]).filter((k) => AFFIXES[k].slots.includes(slot as never)).slice(0, 4);
          return [slot, {
            base: Object.values(EQUIPMENT).find((e) => e.slot === slot)!.id, rarity: named?.rarity ?? 'rare', special: named?.id,
            affixes: keys.map((key) => ({ key, value: maxValue(key, 60) })),
          }];
        }));
        const trees = Object.fromEntries(Object.entries(TREES).map(([id, t]) => [id, Object.fromEntries(t.branches.flatMap((b) => b.nodes.map((n) => [n.id, n.maxRank])))]));
        await page.evaluate(({ gear, trees }) => {
          const g = (window as unknown as Dbg).__starlanternDebug.game;
          const p = g.state.party;
          p.recruited = Object.keys(p.roster);
          for (const id of p.recruited) {
            const m = p.roster[id];
            m.level = 50;
            m.tree = trees[id];
            for (const slot of ['weapon', 'offhand', 'head', 'body', 'hands', 'feet', 'neck', 'ring1', 'ring2']) {
              const d = gear[slot.startsWith('ring') ? 'ring' : slot];
              m.equip[slot] = { uid: g.mintUid(), base: d.base, rarity: d.rarity, ...(d.special ? { special: d.special } : {}), ilvl: 60, enhance: 10, affixes: d.affixes };
            }
          }
        }, { gear, trees });
        await page.locator('.slx-guild [data-id=status]').click();
        await expect(page.locator('.slx-status-scene')).toBeVisible();

        /**
         * Every box in the sheet that can scroll: none draws a native scrollbar or hides anything sideways, and one taller
         * than its room sits in a cue frame whose ▼/▲ step it from end to end, every row of it whole on screen on the way.
         */
        const audit = () => page.evaluate(() => {
          const scene = document.querySelector<HTMLElement>('.slx-status-scene')!;
          const scrolls = [scene, ...scene.querySelectorAll<HTMLElement>('*')].filter((e) => /auto|scroll/.test(getComputedStyle(e).overflowY + getComputedStyle(e).overflowX));
          const name = (e: HTMLElement) => `.${[...e.classList].join('.')}`;
          const bars = scrolls.flatMap((e) => {
            const cs = getComputedStyle(e);
            const side = e.offsetWidth - e.clientWidth - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
            const under = e.offsetHeight - e.clientHeight - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth);
            return side > 0.5 || under > 0.5 ? [`${name(e)} bar ${side}/${under}`] : [];
          });
          const sideways = scrolls.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => `${name(e)} ${e.scrollWidth}>${e.clientWidth}`);
          const ROWS = '.slx-status-facts p, .slx-stat-cat-head, .slx-stat-table tr, .slx-gear-row, .slx-tab-skills > .slx-skill, .slx-tree-node, .slx-talent-node, .slx-tab-ultimate > *';
          const unreachable = scrolls.filter((pane) => pane.scrollHeight > pane.clientHeight + 1).flatMap((pane) => {
            const up = pane.parentElement!.querySelector<HTMLElement>(':scope > .slx-more-up');
            const down = pane.parentElement!.querySelector<HTMLElement>(':scope > .slx-more-down');
            if (!up || !down) return [`${name(pane)} has no cues`];
            const rows = [...pane.querySelectorAll<HTMLElement>(ROWS)].filter((r) => r.parentElement!.closest('.slx-status-body, .slx-tree-cols, .slx-talent-board') === pane);
            const seen = new Set<HTMLElement>();
            const look = () => {
              const box = pane.getBoundingClientRect();
              for (const r of rows) { const b = r.getBoundingClientRect(); if (b.top >= box.top - 0.5 && b.bottom <= box.bottom + 0.5) seen.add(r); }
            };
            pane.scrollTop = 0;
            pane.dispatchEvent(new Event('scroll'));
            const out: string[] = [];
            if (down.hidden) out.push(`${name(pane)} hides ▼ with rows below`);
            look();
            for (let i = 0; i < 200 && !down.hidden; i++) { down.click(); look(); }
            if (pane.scrollTop < pane.scrollHeight - pane.clientHeight - 1) out.push(`${name(pane)} ▼ stops short`);
            if (up.hidden) out.push(`${name(pane)} hides ▲ at the bottom`);
            for (let i = 0; i < 200 && !up.hidden; i++) up.click();
            if (pane.scrollTop !== 0) out.push(`${name(pane)} ▲ stops short`);
            const missed = rows.filter((r) => !seen.has(r)).map((r) => (r.textContent ?? '').slice(0, 12));
            return missed.length ? [...out, `${name(pane)} never shows: ${missed.join(' | ')}`] : out;
          });
          return { bars, sideways, unreachable };
        });
        const flipToId = async (id: string) => {
          const art = page.locator('.slx-status-art');
          for (let i = 0; i < 12 && !((await art.getAttribute('class')) ?? '').includes(`slx-aura-${id} `) && !((await art.getAttribute('class')) ?? '').endsWith(`slx-aura-${id}`); i++) await page.locator('.slx-status-next').click();
          await expect(page.locator('.slx-status-name b')).toHaveText(CHARACTERS[id as keyof typeof CHARACTERS].name);
        };
        const longest = Object.values(CHARACTERS).filter((c) => c.id !== 'hero' && c.id !== 'rin').sort((a, b) => b.name.length - a.name.length)[0].id;
        for (const id of ['hero', 'rin', longest, 'safira', 'bobby']) {
          await flipToId(id);
          for (const tab of ['stats', 'gear', 'skills', 'tree', 'talent', 'ultimate']) {
            await page.locator(`[data-tab=${tab}]`).click();
            // Every category open: the longest the stats page gets (the fold state is kept, so once is enough).
            const closed = page.locator('.slx-stat-cat-head[aria-expanded=false]');
            for (let i = 0; tab === 'stats' && i < 10 && (await closed.count()); i++) await closed.first().click();
            expect(await audit(), `${id} ${tab}`).toEqual({ bars: [], sideways: [], unreachable: [] });
            // Every node's name whole on its tree (Bobby's 護盾產生器 is the longest, plan 8c final).
            if (tab === 'tree') {
              const cut = await page.locator('.slx-tree-node .slx-skill-name').evaluateAll((ns) => ns.filter((n) => n.scrollWidth > n.clientWidth + 0.5).map((n) => n.textContent));
              expect(await page.locator('.slx-tree-node .slx-skill-name').count(), `${id} tree`).toBeGreaterThan(0);
              expect(cut, `${id} tree`).toEqual([]);
            }
          }
        }

        // The keys: ↓ on the hero's skills page goes all the way down, and the cues follow.
        await flipToId('hero');
        await page.locator('[data-tab=skills]').click();
        const body = page.locator('.slx-status-body');
        const frame = (d: 'up' | 'down') => page.locator(`.slx-status-frame > .slx-more-${d}`);
        await expect(frame('down')).toBeVisible();
        await expect(frame('up')).toBeHidden();
        for (let i = 0; i < 80 && (await frame('down').isVisible()); i++) await w.key('ArrowDown');
        await expect(frame('down')).toBeHidden();
        await expect(frame('up')).toBeVisible();
        expect(await body.evaluate((b) => b.scrollHeight - b.clientHeight - b.scrollTop)).toBeLessThanOrEqual(1);
        // The wheel: over the gear page it scrolls the page, and ▲ comes up.
        await page.locator('[data-tab=gear]').click();
        await expect(frame('up')).toBeHidden();
        const at = (await body.boundingBox())!;
        await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
        await page.mouse.wheel(0, 200);
        await expect.poll(() => body.evaluate((b) => b.scrollTop)).toBeGreaterThan(0);
        await expect(frame('up')).toBeVisible();
        // The stats page's row cursor: ↓ to the last row brings it into view, with nothing left below.
        await page.locator('[data-tab=stats]').click();
        const last = STAT_CATEGORIES[STAT_CATEGORIES.length - 1].keys.at(-1)!;
        const cur = page.locator('.slx-tab-stats .slx-row-cur');
        for (let i = 0; i < 120 && (await cur.getAttribute('data-stat')) !== last; i++) await w.key('ArrowDown');
        await expect(cur).toHaveAttribute('data-stat', last);
        await expect(frame('down')).toBeHidden();
        await expect(frame('up')).toBeVisible();
        const curInView = await page.evaluate(() => {
          const b = document.querySelector('.slx-status-body')!.getBoundingClientRect();
          const c = document.querySelector('.slx-tab-stats .slx-row-cur')!.getBoundingClientRect();
          return c.top >= b.top - 0.5 && c.bottom <= b.bottom + 0.5;
        });
        expect(curInView).toBe(true);
        expect(w.errors).toEqual([]);
      } finally {
        await browser.close();
      }
    });
  });

  test("on a sideways phone the tree keeps the cursor's node whole while it walks down (legibility Task 2b)", async ({ page }) => {
    await fitTo(page, 1280, 720);
    const w = await setup(page, 7);
    await legacyRoster(page);
    await page.evaluate(() => {
      const g = (window as unknown as Dbg).__starlanternDebug.game;
      g.state.party.roster.noel.level = 20;
    });
    await w.choose('.slx-town', '冒險者公會');
    await expect(page.locator('.slx-guild')).toBeVisible(); await w.closeTalk();
    await page.locator('.slx-guild [data-id=tree]').click();
    await flipTo(page, CHARACTERS.noel.name);
    await expect(page.locator('.slx-status-name')).toContainText(CHARACTERS.noel.name);
    await asPhone(page);
    expect(await stageScale(page)).toEqual({ kind: 'sideways', s: 1 });
    const cur = page.locator('.slx-tree-node.slx-row-cur');
    const seen: string[] = [];
    for (let i = 0; i < 60; i++) {
      const id = (await cur.getAttribute('data-node')) ?? '';
      // The cursor's node shows whole inside the columns, below its branch's pinned name.
      const cols = await stageBox(page, page.locator('.slx-tree-cols'));
      const node = await stageBox(page, cur);
      const head = await stageBox(page, page.locator('.slx-tree-branch', { has: cur }).locator('.slx-tree-branch-name'));
      expect(node.y, `${id} under the pinned name`).toBeGreaterThanOrEqual(Math.max(cols.y, head.y + head.height) - 0.5);
      expect(node.y + node.height, `${id} above the columns' bottom`).toBeLessThanOrEqual(cols.y + cols.height + 0.5);
      if (seen.includes(id)) break;                       // the last node: down moves no further (or wraps)
      seen.push(id);
      await w.key('ArrowDown');
    }
    expect(seen.length, 'the walk went down several nodes').toBeGreaterThan(3);
    expect(w.errors).toEqual([]);
  });

  test("on a sideways phone the full-width talent board keeps the cursor's node whole while it walks down (review of T5)", async ({ page }) => {
    await fitTo(page, 1280, 720);
    const w = await setup(page, 7);
    await legacyRoster(page);
    await page.evaluate(() => {
      const g = (window as unknown as Dbg).__starlanternDebug.game;
      g.state.party.roster.noel.level = 50;
    });
    await w.choose('.slx-town', '冒險者公會');
    await expect(page.locator('.slx-guild')).toBeVisible(); await w.closeTalk();
    await page.locator('.slx-guild [data-id=tree]').click();
    await flipTo(page, CHARACTERS.noel.name);
    await page.locator('[data-tab=talent]').click();
    await expect(page.locator('.slx-status-scene')).toHaveClass(/slx-status-wide/);
    await asPhone(page);
    expect(await stageScale(page)).toEqual({ kind: 'sideways', s: 1 });
    const cur = page.locator('.slx-talent-node.slx-row-cur');
    const seen: string[] = [];
    let scrolled = false;
    for (let i = 0; i < 60; i++) {
      const id = (await cur.getAttribute('data-node')) ?? '';
      // The cursor's node shows whole inside the board.
      const board = await stageBox(page, page.locator('.slx-talent-board'));
      const node = await stageBox(page, cur);
      expect(node.y, `${id} below the board's top`).toBeGreaterThanOrEqual(board.y - 0.5);
      expect(node.y + node.height, `${id} above the board's bottom`).toBeLessThanOrEqual(board.y + board.height + 0.5);
      scrolled ||= await page.locator('.slx-talent-board').evaluate((b) => b.scrollTop > 0);
      if (seen.includes(id)) break;                       // the last node: down moves no further (or wraps)
      seen.push(id);
      await w.key('ArrowDown');
    }
    expect(seen.length, 'the walk went down several nodes').toBeGreaterThan(3);
    expect(scrolled, 'the walk went past the first screen of the board').toBe(true);
    expect(w.errors).toEqual([]);
  });

  test('the tree shows pairs and swaps a side (plan 8d)', async ({ page }) => {
    await fitTo(page, 1280, 720);
    const missing: string[] = [];
    page.on('response', (r) => { if (r.status() === 404) missing.push(r.url()); });
    const shots = process.env.SL_SHOTS;
    if (shots) mkdirSync(shots, { recursive: true });
    const shot = async (name: string) => { if (shots) { await page.waitForTimeout(400); await page.screenshot({ path: `${shots}/${name}.png` }); } };
    const w = await setup(page, 7);
    // Noel's tree has a pair (連星 / 重星) at branch 0 tier 1 and a mechanic pair (冷靜 / 反噬無效) at branch 1 tier 1.
    await legacyRoster(page);
    await page.evaluate(() => {
      const g = (window as unknown as Dbg).__starlanternDebug.game;
      g.state.party.roster.noel.level = 20;
      g.state.party.roster.noel.tree = { 'fire-star': 1, 'noel-star-twin': 2, 'ice-star': 1, 'noel-calm': 1 };
    });
    const noelTree = () => page.evaluate(() => (window as unknown as Dbg).__starlanternDebug.game.state.party.roster.noel.tree);
    /** Every row and tag of the pair, and the 冷靜 node, hold their text inside their own width. */
    const fits = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.slx-tree-pair, .slx-tree-pair > *, .slx-tree-node[data-node=noel-calm], .slx-tree-pair .slx-skill-name')]
      .filter((e) => e.scrollWidth > e.clientWidth + 0.5).map((e) => e.getAttribute('data-node') ?? e.className));

    await w.choose('.slx-town', '冒險者公會');
    await expect(page.locator('.slx-guild')).toBeVisible(); await w.closeTalk();
    await page.locator('.slx-guild [data-id=tree]').click();
    await expect(page.locator('[data-tab=tree]')).toHaveAttribute('aria-selected', 'true');
    await flipTo(page, CHARACTERS.noel.name);
    const pair = page.locator('.slx-tree-branch[data-branch="0"] .slx-tree-pair').first();   // 連星 / 重星 (延燒 / 聚焰 is the second)
    await expect(pair.locator('.slx-tree-node')).toHaveCount(2);
    await expect(pair.locator('.slx-tree-pair-tag')).toHaveText(T.ui2.tree.pairTag);
    await expect(pair.locator('.slx-tree-node').first()).toContainText('火之星彈・連星');
    await expect(pair.locator('.slx-tree-node').nth(1)).toContainText('火之星彈・重星');
    await expect(page.locator('.slx-tree-node[data-node=noel-star-heavy]')).toHaveClass(/slx-node-swap/);
    await expect(page.locator('.slx-tree-node[data-node=noel-calm] img')).toHaveCount(0);   // a mechanic node has no icon
    // The cursor on 冷靜 (branch 1 tier 1, after branch 0's seven rows): its rule now and next.
    for (let i = 0; i < 8; i++) await w.key('ArrowDown');
    await expect(page.locator('.slx-tree-info')).toContainText(T.ui2.tree.now('熱度上限 6。'));
    await expect(page.locator('.slx-tree-info')).toContainText(T.ui2.tree.nextMod('熱度上限 7。'));
    expect(await fits()).toEqual([]);
    // 冷靜 already shows, so the cursor scrolls nothing: the columns stay at the top, every branch name whole (8d Task 5).
    expect(await page.locator('.slx-tree-cols').evaluate((c) => c.scrollTop)).toBe(0);
    expect(await branchNamesShown(page)).toBe(true);
    await expect(page.locator('.slx-tree-frame .slx-more-up')).toBeHidden();
    await shot('tree-1280');
    // Scrolled down, the ▲ cue shows and covers no text: no node's name or rank, not the line above the columns.
    await page.locator('.slx-tree-cols').evaluate((c) => { c.scrollTop = 30; c.dispatchEvent(new Event('scroll')); });
    const upCue = page.locator('.slx-tree-frame .slx-more-up');
    await expect(upCue).toBeVisible();
    const covered = await upCue.evaluate((cue) => {
      const r = cue.getBoundingClientRect();
      const frame = cue.closest('.slx-tab-tree')!;
      const texts = [...frame.querySelectorAll<HTMLElement>('.slx-tree-node .slx-skill-name, .slx-tree-node .slx-skill-rank, .slx-tree-node .slx-tree-state, .slx-tree-node .slx-tree-kind, .slx-tree-left, .slx-tree-capstone, .slx-tree-branch-name')];
      return texts.filter((e) => {
        const t = e.getBoundingClientRect();
        // Only what shows: a row scrolled out of the columns is hidden by them.
        const cols = frame.querySelector('.slx-tree-cols')!.getBoundingClientRect();
        if (e.closest('.slx-tree-cols') && (t.bottom <= cols.top || t.top >= cols.bottom)) return false;
        return t.width > 0 && r.left < t.right && t.left < r.right && r.top < t.bottom && t.top < r.bottom;
      }).map((e) => `${e.className}:${e.textContent}`);
    });
    expect(covered).toEqual([]);
    await page.locator('.slx-tree-cols').evaluate((c) => { c.scrollTop = 0; c.dispatchEvent(new Event('scroll')); });

    // Two clicks on the empty side change the side, free.
    const heavy = page.locator('.slx-tree-node[data-node=noel-star-heavy]');
    await heavy.click();
    await expect(page.locator('.slx-tree-msg')).toHaveText(T.ui2.tree.swapPending);
    // The empty side previews its change with the workshop's card (plan 8g Task 8): wrapping, never spilling.
    const preview = page.locator('.slx-tree-info .slx-tree-preview');
    await expect(preview).toContainText('段數 2 → 1');
    for (const [vw, vh] of [[1280, 720], [844, 390], [390, 844]] as const) {
      await fitTo(page, vw, vh);
      await page.waitForTimeout(150);
      expect(await preview.evaluate((e) => e.scrollWidth <= e.clientWidth + 0.5), `the preview inside its line at ${vw}`).toBe(true);
      await shot(`tree-preview-${vw}`);
    }
    await fitTo(page, 1280, 720);
    await heavy.click();
    await expect(page.locator('.slx-tree-msg')).toHaveText(T.ui2.tree.swapped);
    expect(await noelTree()).toEqual({ 'fire-star': 1, 'noel-star-heavy': 2, 'ice-star': 1, 'noel-calm': 1 });
    await expect(heavy).toContainText('2／3');

    for (const [vw, vh, name] of [[844, 390, 'tree-844'], [390, 844, 'tree-390']] as const) {
      await fitTo(page, vw, vh);
      expect(await fits(), name).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), name).toBe(true);
      await shot(name);
    }

    // The skills page names the variant whole.
    await fitTo(page, 390, 844);
    await page.locator('[data-tab=skills]').click();
    const star = page.locator('.slx-tab-skills [data-skill=fire-star] .slx-skill-name');
    await expect(star).toHaveText('火之星彈・重星');
    expect(await star.evaluate((e) => e.scrollWidth <= e.clientWidth + 0.5)).toBe(true);
    await shot('skills-390');

    // And so does the battle menu.
    await fitTo(page, 1280, 720);
    await page.locator('.slx-back').click();
    await expect(page.locator('.slx-guild')).toBeVisible();
    await page.locator('.slx-back').click();
    await expect(page.locator('.slx-town')).toBeVisible(); await w.closeTalk();
    await depart(page, w);
    for (let i = 0; i < 200 && !(await page.locator('.slx-battle').isVisible()); i++) {
      await w.key(i % 2 ? 'ArrowLeft' : 'ArrowRight');
      await w.closeTalk();
      if (await page.locator('.slx-confirm').isVisible()) await w.key('Enter');
      if (await page.locator('.slx-event').isVisible()) await w.key('Escape');
    }
    await expect(page.locator('.slx-battle')).toBeVisible();
    await page.evaluate(() => {
      const g = (window as unknown as Dbg).__starlanternDebug.game;
      for (const e of g.battle.enemies) { e.max.hp = 999; e.hp = 999; e.max.atk = 1; e.max.mag = 1; }
    });
    for (let i = 0; i < 80; i++) {
      if (!(await page.locator('.slx-bcmd [role=option]').count())) { await page.waitForTimeout(50); continue; }
      const who = (await page.locator('.slx-bcmd .slx-who').textContent()) ?? '';
      if (who.startsWith(CHARACTERS.noel.name)) break;
      await w.choose('.slx-bcmd', '防禦');
    }
    await expect(page.locator('.slx-bcmd .slx-who')).toContainText(CHARACTERS.noel.name);
    await w.choose('.slx-bcmd', '技能');
    const item = page.locator('.slx-bsub [role=option]').filter({ hasText: '火之星彈・重星' });
    await expect(item).toHaveCount(1);
    for (const [vw, vh, name] of [[1280, 720, 'battle-1280'], [844, 390, 'battle-844'], [390, 844, 'battle-390']] as const) {
      await fitTo(page, vw, vh);
      expect(await item.locator('.slx-label').evaluate((e) => e.scrollWidth <= e.clientWidth + 0.5), name).toBe(true);
      await shot(name);
    }
    expect(missing).toEqual([]);
    expect(w.errors).toEqual([]);
  });

  test("chizuru's and selene's trees show their pairs and new nodes (plan 8d Task 5)", async ({ page }) => {
    await fitTo(page, 1280, 720);
    const missing: string[] = [];
    page.on('response', (r) => { if (r.status() === 404) missing.push(r.url()); });
    const shots = process.env.SL_SHOTS;
    if (shots) mkdirSync(shots, { recursive: true });
    const shot = async (name: string) => { if (shots) { await page.waitForTimeout(400); await page.screenshot({ path: `${shots}/${name}.png` }); } };
    const w = await setup(page, 7);
    await legacyRoster(page);
    await page.evaluate(() => {
      const g = (window as unknown as Dbg).__starlanternDebug.game;
      g.state.party.roster.chizuru.level = 35;
      g.state.party.roster.chizuru.tree = { sweep: 3, 'chizuru-sweep-twin': 2, 'spiral-spear': 1, 'chizuru-thunder-ward': 1, ward: 2, 'chizuru-ward-long': 1, 'purify-ward': 1, 'chizuru-purify-wake': 1 };
      g.state.party.roster.selene.level = 35;
      g.state.party.roster.selene.tree = { moonlight: 3, 'selene-moon-bright': 2, 'moon-rain': 1, 'selene-tide': 1, cleanse: 1, rebirth: 1, 'moon-recall': 1, dream: 1, 'selene-dream-deep': 1 };
    });
    /** No node row, name or pair tag of the tree spills out of its own width, and no name wraps. */
    const spills = async () => [...await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.slx-tree-node, .slx-tree-pair, .slx-tree-pair > *, .slx-tree-node .slx-skill-name')]
      .filter((e) => e.scrollWidth > e.clientWidth + 0.5).map((e) => e.getAttribute('data-node') ?? e.className)), ...await treeNameFaults(page)];
    await w.choose('.slx-town', '冒險者公會');
    await expect(page.locator('.slx-guild')).toBeVisible(); await w.closeTalk();
    await page.locator('.slx-guild [data-id=tree]').click();

    await flipTo(page, CHARACTERS.chizuru.name);
    const thunder = page.locator('.slx-tree-node[data-node=chizuru-thunder-ward]');
    await expect(thunder).toContainText('雷之結界');
    await expect(thunder).toContainText(T.ui2.tree.kind.mech);
    await expect(thunder.locator('img')).toHaveCount(0);
    await expect(page.locator('.slx-tree-node[data-node=chizuru-twin-ward]')).toHaveClass(/slx-node-swap/);
    await expect(page.locator('.slx-tree-branch[data-branch="0"] .slx-tree-pair-tag')).toHaveText(T.ui2.tree.pairTag);
    await expect(page.locator('.slx-tree-node[data-node=chizuru-sweep-twin]')).toContainText('橫掃・雙月');
    await thunder.click();
    await expect(page.locator('.slx-tree-info')).toContainText(T.ui2.tree.now('有結界時，每回合結束對全體敵人雷擊（威力 20）。'));
    expect(await spills()).toEqual([]);
    expect(await branchNamesShown(page)).toBe(true);
    await shot('chizuru-tree-1280');
    await fitTo(page, 844, 390);
    expect(await spills()).toEqual([]);
    await shot('chizuru-tree-844');
    await fitTo(page, 1280, 720);

    await flipTo(page, CHARACTERS.selene.name);
    // 收回 now sits at the prayer branch's tier 2, under 月之再生.
    const prayer = page.locator('.slx-tree-branch[data-branch="1"] .slx-tree-node');
    await expect(prayer.nth(2)).toHaveAttribute('data-node', 'moon-recall');
    await expect(page.locator('.slx-tree-node[data-node=selene-moon-bright]')).toContainText('月光・凝光');
    await expect(page.locator('.slx-tree-node[data-node=selene-moon-wide]')).toHaveClass(/slx-node-swap/);
    await expect(page.locator('.slx-tree-node[data-node=selene-new-night]')).toContainText('滿月之夜・新月');
    const tide = page.locator('.slx-tree-node[data-node=selene-tide]');
    await tide.click();
    await expect(page.locator('.slx-tree-info')).toContainText(T.ui2.tree.now('月相的好處由 30% 變成 40%。'));
    expect(await spills()).toEqual([]);
    expect(await branchNamesShown(page)).toBe(true);
    await shot('selene-tree-1280');
    await fitTo(page, 844, 390);
    expect(await spills()).toEqual([]);
    await shot('selene-tree-844');
    expect(missing).toEqual([]);
    expect(w.errors).toEqual([]);
  });

  test("liz's and sylvie's trees show their pairs and new nodes; 大手筆 heads 花錢 (plan 8d Task 6)", async ({ page }) => {
    await fitTo(page, 1280, 720);
    const missing: string[] = [];
    page.on('response', (r) => { if (r.status() === 404) missing.push(r.url()); });
    const shots = process.env.SL_SHOTS;
    if (shots) mkdirSync(shots, { recursive: true });
    const shot = async (name: string) => { if (shots) { await page.waitForTimeout(400); await page.screenshot({ path: `${shots}/${name}.png` }); } };
    const w = await setup(page, 7);
    await page.evaluate(() => {
      const g = (window as unknown as Dbg).__starlanternDebug.game;
      const p = g.state.party;
      for (const id of ['liz', 'sylvie'] as const) if (!p.recruited.includes(id)) p.recruited.push(id);
      p.roster.liz.level = 35;
      p.roster.liz.tree = { 'twin-slash': 3, pickpocket: 2, 'liz-twin-quick': 2, 'liz-change': 1, stealth: 1, 'fortune-strike': 2, 'liz-fortune-split': 1, quickstep: 1 };
      p.roster.sylvie.level = 35;
      p.roster.sylvie.tree = { 'aimed-shot': 3, 'sylvie-aim-one': 2, 'heart-shot': 1, 'sylvie-patience': 1, 'pin-shot': 1, 'sylvie-shift': 1, 'arrow-rain': 1, 'sylvie-rain-cover': 1 };
    });
    /** No node row, name or pair tag of the tree spills out of its own width, and no name wraps. */
    const spills = async () => [...await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.slx-tree-node, .slx-tree-pair, .slx-tree-pair > *, .slx-tree-node .slx-skill-name')]
      .filter((e) => e.scrollWidth > e.clientWidth + 0.5).map((e) => e.getAttribute('data-node') ?? e.className)), ...await treeNameFaults(page)];
    await w.choose('.slx-town', '冒險者公會');
    await expect(page.locator('.slx-guild')).toBeVisible(); await w.closeTalk();
    await page.locator('.slx-guild [data-id=tree]').click();

    await flipTo(page, CHARACTERS.liz.name);
    await expect(page.locator('.slx-tree-branch[data-branch="2"] .slx-tree-branch-name')).toContainText('花錢');
    await expect(page.locator('.slx-tree-branch[data-branch="2"] .slx-tree-node').first()).toHaveAttribute('data-node', 'fortune-strike');
    await expect(page.locator('.slx-tree-node[data-node=liz-twin-quick]')).toContainText('雙刃・快手');
    await expect(page.locator('.slx-tree-node[data-node=liz-twin-haggle]')).toHaveClass(/slx-node-swap/);
    await expect(page.locator('.slx-tree-branch[data-branch="0"] .slx-tree-pair-tag')).toHaveText(T.ui2.tree.pairTag);
    const change = page.locator('.slx-tree-node[data-node=liz-change]');
    await expect(change).toContainText(T.ui2.tree.kind.mech);
    await expect(change.locator('img')).toHaveCount(0);
    await change.click();
    await expect(page.locator('.slx-tree-info')).toContainText(T.ui2.tree.now('用掉銅板的招之後，退還 2 枚。'));
    expect(await spills()).toEqual([]);
    expect(await branchNamesShown(page)).toBe(true);
    await shot('liz-tree-1280');
    await fitTo(page, 844, 390);
    expect(await spills()).toEqual([]);
    await shot('liz-tree-844');
    await fitTo(page, 1280, 720);
    // 分期's number goes into 大手筆's own words on the skills page.
    await page.locator('[data-tab=skills]').click();
    await expect(page.locator('.slx-tab-skills [data-skill=fortune-strike] .slx-skill-name')).toHaveText('大手筆・分期');
    await expect(page.locator('.slx-tab-skills [data-skill=fortune-strike] .slx-desc')).toContainText('每枚威力多 14%');
    await page.locator('[data-tab=tree]').click();

    await flipTo(page, CHARACTERS.sylvie.name);
    await expect(page.locator('.slx-tree-node[data-node=sylvie-aim-one]')).toContainText('瞄準射擊・一擊');
    await expect(page.locator('.slx-tree-node[data-node=sylvie-aim-rapid]')).toHaveClass(/slx-node-swap/);
    const patience = page.locator('.slx-tree-node[data-node=sylvie-patience]');
    await patience.click();
    await expect(page.locator('.slx-tree-info')).toContainText(T.ui2.tree.now('瞄準上限 4 層。'));
    expect(await spills()).toEqual([]);
    expect(await branchNamesShown(page)).toBe(true);
    await shot('sylvie-tree-1280');
    await fitTo(page, 844, 390);
    expect(await spills()).toEqual([]);
    await shot('sylvie-tree-844');
    expect(missing).toEqual([]);
    expect(w.errors).toEqual([]);
  });

  test("scarlet's and safira's trees show their new nodes (plan 8d Task 7)", async ({ page }) => {
    await fitTo(page, 1280, 720);
    const missing: string[] = [];
    page.on('response', (r) => { if (r.status() === 404) missing.push(r.url()); });
    const shots = process.env.SL_SHOTS;
    if (shots) mkdirSync(shots, { recursive: true });
    const shot = async (name: string) => { if (shots) { await page.waitForTimeout(400); await page.screenshot({ path: `${shots}/${name}.png` }); } };
    const w = await setup(page, 7);
    await page.evaluate(() => {
      const g = (window as unknown as Dbg).__starlanternDebug.game;
      const p = g.state.party;
      for (const id of ['scarlet', 'safira'] as const) if (!p.recruited.includes(id)) p.recruited.push(id);
      p.roster.scarlet.level = 35;
      p.roster.scarlet.tree = { provoke: 1, 'scarlet-provoke-shout': 2, cover: 1, 'scarlet-cover-both': 1, 'flame-burst': 3, 'scarlet-burst-heart': 2, 'iron-wall': 1, 'scarlet-ardent': 1 };
      p.roster.safira.level = 35;
      p.roster.safira.tree = { 'blade-dance': 3, 'safira-dance-four': 2, 'sand-cyclone': 1, 'safira-improv': 1, 'war-dance': 1, 'safira-war-heat': 1, mirage: 1, 'safira-duet': 1 };
    });
    /** No node row, name or pair tag of the tree spills out of its own width, and no name wraps. */
    const spills = async () => [...await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.slx-tree-node, .slx-tree-pair, .slx-tree-pair > *, .slx-tree-node .slx-skill-name')]
      .filter((e) => e.scrollWidth > e.clientWidth + 0.5).map((e) => e.getAttribute('data-node') ?? e.className)), ...await treeNameFaults(page)];
    await w.choose('.slx-town', '冒險者公會');
    await expect(page.locator('.slx-guild')).toBeVisible(); await w.closeTalk();
    await page.locator('.slx-guild [data-id=tree]').click();

    await flipTo(page, CHARACTERS.scarlet.name);
    await expect(page.locator('.slx-tree-node[data-node=scarlet-provoke-shout]')).toContainText('挑釁・高喊');
    await expect(page.locator('.slx-tree-node[data-node=scarlet-cover-both]')).toContainText('代受・雙肩');
    await expect(page.locator('.slx-tree-node[data-node=scarlet-burst-heart]')).toContainText('爆炎斬・赤心');
    const ardent = page.locator('.slx-tree-node[data-node=scarlet-ardent]');
    await expect(ardent).toContainText('熾心');
    await expect(ardent).toContainText(T.ui2.tree.kind.mech);
    await expect(ardent.locator('img')).toHaveCount(0);
    await ardent.click();
    await expect(page.locator('.slx-tree-info')).toContainText(T.ui2.tree.now('餘燼上限是最大 HP 的 60%。'));
    await expect(page.locator('.slx-tree-info')).toContainText(T.ui2.tree.nextMod('餘燼上限是最大 HP 的 70%。'));
    expect(await spills()).toEqual([]);
    expect(await branchNamesShown(page)).toBe(true);
    await shot('scarlet-tree-1280');
    await fitTo(page, 844, 390);
    expect(await spills()).toEqual([]);
    await shot('scarlet-tree-844');
    await fitTo(page, 1280, 720);
    // 赤心's rule rides on 爆炎斬's own words on the skills page.
    await page.locator('[data-tab=skills]').click();
    await expect(page.locator('.slx-tab-skills [data-skill=flame-burst] .slx-skill-name')).toHaveText('爆炎斬・赤心');
    await expect(page.locator('.slx-tab-skills [data-skill=flame-burst] .slx-desc')).toContainText('HP 消耗全部用餘燼付清時，威力多 40%。');
    await page.locator('[data-tab=tree]').click();

    await flipTo(page, CHARACTERS.safira.name);
    await expect(page.locator('.slx-tree-node[data-node=safira-dance-four]')).toContainText('刃舞・四拍');
    await expect(page.locator('.slx-tree-node[data-node=safira-war-heat]')).toContainText('戰舞・熱場');
    const improv = page.locator('.slx-tree-node[data-node=safira-improv]');
    await expect(improv).toContainText(T.ui2.tree.kind.mech);
    await expect(improv.locator('img')).toHaveCount(0);
    await improv.click();
    await expect(page.locator('.slx-tree-info')).toContainText(T.ui2.tree.now('同一招連用不再踩空，拍子只少 2。'));
    expect(await spills()).toEqual([]);
    expect(await branchNamesShown(page)).toBe(true);
    await shot('safira-tree-1280');
    await fitTo(page, 844, 390);
    expect(await spills()).toEqual([]);
    await shot('safira-tree-844');
    await fitTo(page, 1280, 720);
    // 四拍 rewrites 刃舞's hits in its own words.
    await page.locator('[data-tab=skills]').click();
    await expect(page.locator('.slx-tab-skills [data-skill=blade-dance] .slx-desc')).toContainText('連砍 4 次');
    expect(missing).toEqual([]);
    expect(w.errors).toEqual([]);
  });

  test("bobby's and the hero's trees show their new nodes; a turret with both variants fits the battle menu (plan 8d Task 8)", async ({ page }) => {
    await fitTo(page, 1280, 720);
    const missing: string[] = [];
    page.on('response', (r) => { if (r.status() === 404) missing.push(r.url()); });
    const shots = process.env.SL_SHOTS;
    if (shots) mkdirSync(shots, { recursive: true });
    const shot = async (name: string) => { if (shots) { await page.waitForTimeout(400); await page.screenshot({ path: `${shots}/${name}.png` }); } };
    const w = await setup(page, 7);
    await page.evaluate(() => {
      const g = (window as unknown as Dbg).__starlanternDebug.game;
      const p = g.state.party;
      p.recruited = ['hero', 'bobby', 'noel', 'chizuru', 'selene'];
      p.grid = ['hero', 'noel', null, 'bobby', null, null, 'chizuru', null, 'selene'];
      p.roster.bobby.level = 50;
      p.roster.bobby.tree = { turret: 3, 'bobby-turret-twin': 2, cannon: 3, 'bobby-mass': 3, 'bobby-turret-pair': 1, tinker: 1, 'repair-drone': 1, 'bobby-drone-aid': 1, barrier: 1, 'bobby-bench': 1, 'shock-mine': 1, 'bobby-mine-chain': 1 };
      // Two working runes on the turret: the battle menu marks them (plan 8g Task 7).
      p.roster.bobby.sockets = { turret: [{ id: 'extend', tier: 'magic' }, { id: 'thrift', tier: 'magic' }] };
      g.state.runesOpen = true;
      g.state.runeTutorialSeen = true;
      p.roster.hero.level = 35;
      p.roster.hero.tree = { 'hero-slash': 2, 'hero-slash-twin': 2, 'hero-guard': 1, 'hero-guard-steady': 1, 'hero-flare': 1, 'hero-frost': 1, 'hero-frost-chill': 1, 'hero-mend': 1, 'hero-mend-overflow': 1 };
    });
    /** No node row, name or pair tag of the tree spills out of its own width, and no name wraps. */
    const spills = async () => [...await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.slx-tree-node, .slx-tree-pair, .slx-tree-pair > *, .slx-tree-node .slx-skill-name')]
      .filter((e) => e.scrollWidth > e.clientWidth + 0.5).map((e) => e.getAttribute('data-node') ?? e.className)), ...await treeNameFaults(page)];
    await w.choose('.slx-town', '冒險者公會');
    await expect(page.locator('.slx-guild')).toBeVisible(); await w.closeTalk();
    await page.locator('.slx-guild [data-id=tree]').click();

    await flipTo(page, CHARACTERS.bobby.name);
    await expect(page.locator('.slx-tree-node[data-node=bobby-turret-twin]')).toContainText('設置砲台・雙管');
    await expect(page.locator('.slx-tree-node[data-node=bobby-turret-pair]')).toContainText('砲台・雙砲台');   // its short tree name (8d Task 8 review)
    await expect(page.locator('.slx-tree-node[data-node=bobby-drone-aid]')).toContainText('無人機・急救');
    await expect(page.locator('.slx-tree-node[data-node=bobby-mine-chain]')).toContainText('電擊地雷・連鎖');
    const bench = page.locator('.slx-tree-node[data-node=bobby-bench]');
    await expect(bench).toContainText('工作檯');
    await expect(bench).toContainText(T.ui2.tree.kind.mech);
    await expect(bench.locator('img')).toHaveCount(0);
    await bench.click();
    await expect(page.locator('.slx-tree-info')).toContainText(T.ui2.tree.now('裝置最多同時 3 個。'));
    await expect(page.locator('.slx-tree-info')).toContainText(T.ui2.tree.nextMod('裝置最多同時 4 個。'));
    expect(await spills()).toEqual([]);
    expect(await branchNamesShown(page)).toBe(true);
    await shot('bobby-tree-1280');
    await fitTo(page, 844, 390);
    expect(await spills()).toEqual([]);
    await shot('bobby-tree-844');
    await fitTo(page, 1280, 720);
    // Both turret variants ride on one name on the skills page, whole at 390.
    await page.locator('[data-tab=skills]').click();
    const turretName = page.locator('.slx-tab-skills [data-skill=turret] .slx-skill-name');
    await expect(turretName).toHaveText('設置砲台・雙管・雙砲台');
    await fitTo(page, 390, 844);
    expect(await turretName.evaluate((e) => e.scrollWidth <= e.clientWidth + 0.5)).toBe(true);
    await shot('bobby-skills-390');
    await fitTo(page, 1280, 720);
    await page.locator('[data-tab=tree]').click();

    await flipTo(page, CHARACTERS.hero.name);
    await expect(page.locator('.slx-tree-node[data-node=hero-slash-twin]')).toContainText('斬擊・連斬');
    await expect(page.locator('.slx-tree-node[data-node=hero-guard-steady]')).toContainText('守勢・不動');
    await expect(page.locator('.slx-tree-node[data-node=hero-frost-chill]')).toContainText('星霜・凍原');
    const overflow = page.locator('.slx-tree-node[data-node=hero-mend-overflow]');
    await expect(overflow).toContainText('治癒・滿溢');
    await overflow.click();
    await expect(page.locator('.slx-tree-info')).toContainText(T.ui2.tree.now('溢出的回復變成護盾，最多最大 HP 的 6%。'));
    await expect(page.locator('.slx-tree-info')).toContainText(T.ui2.tree.nextMod('溢出的回復變成護盾，最多最大 HP 的 8%。'));
    expect(await spills()).toEqual([]);
    expect(await branchNamesShown(page)).toBe(true);
    await shot('hero-tree-1280');
    await fitTo(page, 844, 390);
    expect(await spills()).toEqual([]);
    await shot('hero-tree-844');

    // The battle menu: Bobby's turret, both variants on its name, stays inside its row at 1280 and 390.
    await fitTo(page, 1280, 720);
    await page.locator('.slx-back').click();
    await expect(page.locator('.slx-guild')).toBeVisible();
    await page.locator('.slx-back').click();
    await expect(page.locator('.slx-town')).toBeVisible(); await w.closeTalk();
    await depart(page, w);
    for (let i = 0; i < 200 && !(await page.locator('.slx-battle').isVisible()); i++) {
      await w.key(i % 2 ? 'ArrowLeft' : 'ArrowRight');
      await w.closeTalk();
      if (await page.locator('.slx-confirm').isVisible()) await w.key('Enter');
      if (await page.locator('.slx-event').isVisible()) await w.key('Escape');
    }
    await expect(page.locator('.slx-battle')).toBeVisible();
    await page.evaluate(() => {
      const g = (window as unknown as Dbg).__starlanternDebug.game;
      for (const e of g.battle.enemies) { e.max.hp = 999; e.hp = 999; e.max.atk = 1; e.max.mag = 1; }
    });
    for (let i = 0; i < 80; i++) {
      if (!(await page.locator('.slx-bcmd [role=option]').count())) { await page.waitForTimeout(50); continue; }
      const who = (await page.locator('.slx-bcmd .slx-who').textContent()) ?? '';
      if (who.startsWith(CHARACTERS.bobby.name)) break;
      await w.choose('.slx-bcmd', '防禦');
    }
    await expect(page.locator('.slx-bcmd .slx-who')).toContainText(CHARACTERS.bobby.name);
    await w.choose('.slx-bcmd', '技能');
    const item = page.locator('.slx-bsub [role=option]').filter({ hasText: '設置砲台・雙管・雙砲台' });
    await expect(item).toHaveCount(1);
    await expect(item.locator('.slx-badge')).toHaveText('◆◆');
    await item.hover();                                     // its note: the final numbers, then its words
    await expect(page.locator('.slx-bnote')).toHaveText(/^自身・砲台 威力 \d+　架一座砲台/);   // a device: its target and its power, as the card says
    for (const [vw, vh, name] of [[1280, 720, 'bobby-battle-1280'], [844, 390, 'bobby-battle-844'], [390, 844, 'bobby-battle-390']] as const) {
      await fitTo(page, vw, vh);
      expect(await item.locator('.slx-label').evaluate((e) => e.scrollWidth <= e.clientWidth + 0.5), name).toBe(true);
      const rows = await page.locator('.slx-bsub [role=option]').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 0.5).map((e) => e.textContent));
      expect(rows, `battle skill rows wider than their box at ${vw}`).toEqual([]);
      await expect(item.locator('.slx-badge')).toBeVisible();
      // The field bar (Selene's moon) stands clear of the skill list's frame.
      if (await page.locator('.slx-fieldbar').isVisible()) {
        const bar = await stageBox(page, page.locator('.slx-fieldbar'));   // stage px: the phone turns the stage (legibility 2b)
        const list = await stageBox(page, page.locator('.slx-bsub'));
        expect(bar.y + bar.height, `the field bar above the skill list at ${vw}`).toBeLessThanOrEqual(list.y + 0.5);
      }
      await shot(name);
    }
    expect(missing).toEqual([]);
    expect(w.errors).toEqual([]);
  });

  test('on the wide pages every column fits at 12px (legibility Task 5)', async ({ page }) => {
    test.setTimeout(180_000);
    await fitTo(page, 1280, 720);
    const shots = process.env.SL_SHOTS;
    if (shots) mkdirSync(shots, { recursive: true });
    const w = await setup(page, 7);
    const ids = Object.keys(TREES);
    // The fullest sheets: everyone recruited at Lv 50 with every memory (the hero's included), so every branch shows.
    await page.evaluate(([all, chains]) => {
      const p = (window as unknown as Dbg).__starlanternDebug.game.state.party;
      for (const id of all) if (!p.recruited.includes(id)) p.recruited.push(id);
      for (const id of p.recruited) { p.roster[id].level = 50; p.roster[id].memories = chains[id] ?? 0; }
    }, [ids, Object.fromEntries(ids.map((id) => [id, chainLength(id as keyof typeof CHAINS)]))] as const);
    await w.choose('.slx-town', '冒險者公會');
    await expect(page.locator('.slx-guild')).toBeVisible(); await w.closeTalk();
    await page.locator('.slx-guild [data-id=tree]').click();
    await expect(page.locator('.slx-status-scene')).toHaveClass(/slx-status-wide/);
    const bad: string[] = [];
    for (const id of ids) {
      await flipTo(page, CHARACTERS[id as keyof typeof CHARACTERS].name);
      for (const tab of ['tree', 'talent'] as const) {
        await page.locator(`[data-tab=${tab}]`).click();
        await expect(page.locator('.slx-status-scene')).toHaveClass(/slx-status-wide/);
        for (const [vw, vh] of [[1280, 720], [844, 390], [390, 844]] as const) {
          await fitTo(page, vw, vh);
          const over = await page.locator('.slx-tree-node .slx-skill-name, .slx-talent-name').evaluateAll((els) =>
            els.filter((e) => e.scrollWidth > e.clientWidth + 0.5).map((e) => (e.textContent ?? '').trim()));
          bad.push(...over.map((t) => `${id} ${tab} ${vw}: ${t}`));
          // A node's state line reads whole, never cut to 「…」 (review of T5).
          const cut = await page.locator('.slx-tree-state, .slx-talent-state').evaluateAll((els) =>
            els.filter((e) => e.checkVisibility() && e.scrollWidth > e.clientWidth + 0.5).map((e) => (e.textContent ?? '').trim()));
          bad.push(...cut.map((t) => `${id} ${tab} ${vw}: state 「${t}」 cut to 「…」`));
          // The member arrows stay a 20px tall target here too (review of T5), without growing the plate.
          for (const arrow of await page.locator('.slx-status-plate .slx-status-arrow').all()) {
            const h = (await stageBox(page, arrow)).height;
            if (h < 20 - 0.5) bad.push(`${id} ${tab} ${vw}: a member arrow ${h}px tall`);
          }
          const panel = await stageBox(page, page.locator('.slx-status-panel'));
          for (const other of ['.slx-status-plate', '.slx-status-scene > .slx-back']) {
            if (!apart(panel, await stageBox(page, page.locator(other)))) bad.push(`${id} ${tab} ${vw}: the panel meets ${other}`);
          }
          if (shots && vw === 1280) await snap(page, `${shots}/full-${id}-${tab}-1280.png`);
        }
        await fitTo(page, 1280, 720);
      }
    }
    expect(bad).toEqual([]);
    expect(w.errors).toEqual([]);
  });

  test('equip, workshop and builds fit at 12px (legibility Task 6)', async ({ page }) => {
    test.setTimeout(180_000);
    await fitTo(page, 1280, 720);
    // The fullest screens: the longest gear worn (its +10 mark on a doll slot) and in the bag; Noel at Lv 50 following
    // 暴走流星, 火之星彈 holding the three longest runes (two of them do nothing there: their reasons get lines of their own).
    const long = longestGear();
    // The longest gear's art left out of the manifest: a special with no art of its own keeps its name as text for good
    // (gearArt.ts), the case its +10 must not cover (T6 review). Unlisted art is never asked for, so nothing 404s.
    await page.route('**/assets/games/starlantern/manifest.json', async (route) => {
      const res = await route.fetch();
      const json = await res.json() as { urls: string[] };
      await route.fulfill({ response: res, json: { ...json, urls: json.urls.filter((u) => !u.includes(`/gear/${long.special}`)) } });
    });
    const w = await startSweepGame(page, 7);
    const gs = Object.values(EQUIPMENT).find((b) => b.id === long.base)!.slot;
    await page.evaluate(([long, slot]) => {
      const g = (window as unknown as Dbg).__starlanternDebug.game;
      const p = g.state.party;
      g.state.runeTutorialSeen = true;
      p.roster.hero.equip = { ...p.roster.hero.equip, [slot]: { ...long, uid: g.mintUid() } };
      p.roster.noel = {
        ...p.roster.noel, level: 50, build: 'meteor', tree: { 'fire-star': 1 },
        sockets: { 'fire-star': [{ id: 'twin-cast', tier: 'legendary' }, { id: 'starwheel', tier: 'legendary' }, { id: 'blood-price', tier: 'legendary' }] },
      };
    }, [long, gs === 'ring' ? 'ring1' : gs] as const);
    const SIZES = [[1280, 720], [844, 390], [390, 844]] as const;
    const shots = process.env.SL_SHOTS;
    if (shots) mkdirSync(shots, { recursive: true });
    const bad: string[] = [];
    /** At each size: the screen reads clearly, `boxes` lie inside the stage and pairwise apart, and `rows` never spill. */
    const check = async (name: string, boxes: string[], rows: string, more?: (vw: number) => Promise<void>) => {
      for (const [vw, vh] of SIZES) {
        await fitTo(page, vw, vh);
        bad.push(...(await legibility(page, { requireReady: true })).map((f) => `${name} ${vw}: ${f}`));
        const rects = await Promise.all(boxes.map(async (sel) => [sel, await stageBox(page, page.locator(sel).first())] as const));
        for (const [sel, r] of rects) {
          if (r.x < -0.5 || r.y < -0.5 || r.x + r.width > 640.5 || r.y + r.height > 360.5) bad.push(`${name} ${vw}: ${sel} leaves the stage`);
        }
        for (let i = 0; i < rects.length; i++) {
          for (let j = i + 1; j < rects.length; j++) if (!apart(rects[i][1], rects[j][1])) bad.push(`${name} ${vw}: ${rects[i][0]} meets ${rects[j][0]} ${JSON.stringify([rects[i][1], rects[j][1]])}`);
        }
        const over = await page.locator(rows).evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 0.5 || e.scrollHeight > e.clientHeight + 0.5).map((e) => `${e.className} "${(e.textContent ?? '').trim()}"`));
        bad.push(...over.map((o) => `${name} ${vw}: ${o} spills`));
        await more?.(vw);
        if (shots) { await page.waitForTimeout(400); await snap(page, `${shots}/t6-${name}-${vw}.png`); }
      }
      await fitTo(page, 1280, 720);
    };

    // Equipment: the four windows, the head, the key hint and the back button apart; each enhance mark inside its cell.
    await go(page, 'equip');
    await expect(page.locator('.slx-equip-scene .slx-doll-slot .slx-enh')).toHaveText('+10');
    await check('equip', ['.slx-equip-head', '.slx-bag', '.slx-doll', '.slx-equip-stats', '.slx-item-detail', '.slx-equip-scene .slx-keyhint', '.slx-equip-scene > .slx-back'],
      '.slx-equip-title, .slx-equip-stats .slx-stat-cell', async (vw) => {
        // A cell's name (shown until its gear art comes) wraps inside the cell, never wider than it.
        const wide = await page.locator('.slx-bag-cell, .slx-doll-slot').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 0.5).map((e) => (e.textContent ?? '').trim()));
        bad.push(...wide.map((t) => `equip ${vw}: cell "${t}" spills sideways`));
        // A piece with no art of its own keeps its name as text for good (gearArt.ts): its +10 never covers that name
        // (T6 review). The longest gear is such a special, worn and in the bag.
        const covered = await page.locator('.slx-equip-scene .slx-enh').evaluateAll((marks) => marks.flatMap((m) => {
          // A text run's box is the font's content area (taller than the 14px line); its 12px glyph cell is that box less
          // 1.5 stage px on each side, scaled as the stage is (turned or not).
          const t = new DOMMatrixReadOnly(getComputedStyle(document.getElementById('sl-screen')!).transform);
          const k = 1.5 * Math.hypot(t.a, t.b);
          const cell = m.parentElement!, e = m.getBoundingClientRect();
          const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
          const hit: string[] = [];
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            if (m.contains(n) || !n.textContent?.trim()) continue;
            const r = document.createRange(); r.selectNodeContents(n);
            for (const q of r.getClientRects()) {
              if (Math.min(e.right, q.right - k) - Math.max(e.left, q.left + k) > 0.5 && Math.min(e.bottom, q.bottom - k) - Math.max(e.top, q.top + k) > 0.5) hit.push(n.textContent.trim());
            }
          }
          return hit.length ? [`${[...new Set(hit)].join('')} under ${m.textContent}`] : [];
        }));
        bad.push(...covered.map((c) => `equip ${vw}: ${c}`));
        const textMarks = await page.locator('.slx-equip-scene .slx-enh').evaluateAll((marks) => marks.filter((m) => !m.parentElement!.querySelector('img')).length);
        if (textMarks < 2) bad.push(`equip ${vw}: ${textMarks} enhanced text-name cells (the longest gear, worn and in the bag, is one)`);
        for (const enh of await page.locator('.slx-equip-scene .slx-enh').all()) {
          const e = await stageBox(page, enh), c = await stageBox(page, enh.locator('xpath=..'));
          if (e.x < c.x - 0.5 || e.y < c.y - 0.5 || e.x + e.width > c.x + c.width + 0.5 || e.y + e.height > c.y + c.height + 0.5) bad.push(`equip ${vw}: ${await enh.textContent()} leaves its cell`);
        }
      });

    // The workshop at its fullest: Noel's slots, then slot 1's list of every rune in the bag.
    const ws = ['.slx-ws-head', '.slx-ws-skills', '.slx-ws-card', '.slx-ws-slots', '.slx-workshop .slx-keyhint', '.slx-workshop > .slx-back'];
    const wsRows = '.slx-workshop [role=option], .slx-ws-slot .slx-right, .slx-ws-card p, .slx-ws-card td, .slx-ws-foot p, .slx-ws-follow, .slx-ws-lack, .slx-ws-skills, .slx-ws-slots';
    const footInCard = async (vw: number) => {
      const foot = await stageBox(page, page.locator('.slx-ws-foot')), card = await stageBox(page, page.locator('.slx-ws-card'));
      if (foot.y + foot.height > card.y + card.height + 0.5) bad.push(`workshop ${vw}: the foot leaves the card`);
    };
    await go(page, 'workshop', 'noel:fire-star');
    await expect(page.locator('.slx-ws-follow')).toBeVisible();
    await w.key('Enter');                                     // her slots
    await expect(page.locator('.slx-ws-slot .slx-right').nth(2)).toHaveText('血之代價（傳說）');
    await check('workshop-slots', ws, wsRows, footInCard);
    await w.key('Enter');                                     // slot 1's runes
    await expect(page.locator('.slx-ws-runes [role=option]').first()).toBeVisible();
    await check('workshop-runes', ws, wsRows, footInCard);

    // The suggested builds: Noel's list, the 暴走流星 card, its confirm window.
    const bd = ['.slx-bd-head', '.slx-bd-list', '.slx-bd-card', '.slx-builds .slx-keyhint', '.slx-builds > .slx-back'];
    const bdRows = '.slx-builds [role=option], .slx-bd-card-body p, .slx-bd-card-body li, .slx-bd-rune, .slx-bd-foot p, .slx-bd-btn';
    await go(page, 'builds', 'noel');
    await expect(page.locator('.slx-bd-name')).toContainText('諾艾兒');
    await check('builds-list', bd, bdRows);
    for (let i = 0; i < 4 && (await page.locator('.slx-bd-list [aria-selected=true]').getAttribute('data-id')) !== 'meteor'; i++) await w.key('ArrowDown');
    await expect(page.locator('.slx-bd-card-name')).toContainText('暴走流星');
    await check('builds-card', bd, bdRows);
    await w.key('Enter');
    await expect(page.locator('.slx-builds .slx-confirm')).toBeVisible();
    await check('builds-confirm', ['.slx-builds .slx-confirm'], `${bdRows}, .slx-confirm p, .slx-confirm [role=option]`);
    expect(bad).toEqual([]);
    expect(w.errors).toEqual([]);
  });

  test("no tree node's name wraps or spills, on any member's tree, at 1280 or 844 (8d Task 6 review)", async ({ page }) => {
    await fitTo(page, 1280, 720);
    const w = await setup(page, 7);
    const ids = Object.keys(TREES);
    await page.evaluate((all) => {
      const p = (window as unknown as Dbg).__starlanternDebug.game.state.party;
      for (const id of all) if (!p.recruited.includes(id)) p.recruited.push(id);
    }, ids);
    await w.choose('.slx-town', '冒險者公會');
    await expect(page.locator('.slx-guild')).toBeVisible(); await w.closeTalk();
    await page.locator('.slx-guild [data-id=tree]').click();
    const bad: string[] = [];
    for (const id of ids) {
      await flipTo(page, CHARACTERS[id as keyof typeof CHARACTERS].name);
      await expect(page.locator(`.slx-tree-node[data-node="${TREES[id as keyof typeof TREES].branches[0].nodes[0].id}"]`)).toBeVisible();
      for (const [vw, vh] of [[1280, 720], [844, 390]] as const) {
        await fitTo(page, vw, vh);
        bad.push(...(await treeNameFaults(page)).map((n) => `${vw} ${n}`));
      }
      await fitTo(page, 1280, 720);
    }
    expect(bad).toEqual([]);

    // A click on a row the columns cut off brings it whole into view, and moves nothing when it already shows.
    await fitTo(page, 844, 390);
    await flipTo(page, CHARACTERS.sylvie.name);
    const cols = page.locator('.slx-tree-cols');
    // Scroll the columns so the first row they cut off shows only its top half.
    const cut = await cols.evaluate((c) => {
      const box = c.getBoundingClientRect();
      const n = [...c.querySelectorAll<HTMLElement>('.slx-tree-node')].find((x) => x.getBoundingClientRect().bottom > box.bottom + 1);
      if (!n) return null;
      const r = n.getBoundingClientRect();
      c.scrollTop += r.top + r.height / 2 - box.bottom;
      c.dispatchEvent(new Event('scroll'));
      return n.getAttribute('data-node');
    });
    expect(cut).not.toBeNull();
    /** The row shows whole: inside the columns and below its branch name, which stays pinned at their top. */
    const whole = (id: string) => cols.evaluate((c, nid) => {
      const n = c.querySelector(`.slx-tree-node[data-node="${nid}"]`)!;
      const box = c.getBoundingClientRect(), r = n.getBoundingClientRect();
      const head = n.closest('.slx-tree-branch')!.querySelector('.slx-tree-branch-name')!.getBoundingClientRect();
      return r.top >= head.bottom - 0.5 && r.bottom <= box.bottom + 0.5;
    }, id);
    // A plain DOM click: Playwright's own click would scroll the row into view first.
    await page.locator(`.slx-tree-node[data-node="${cut}"]`).evaluate((n) => (n as HTMLElement).click());
    await expect(page.locator(`.slx-tree-node[data-node="${cut}"]`)).toHaveClass(/slx-row-cur/);
    expect(await whole(cut!)).toBe(true);
    const top = await cols.evaluate((c) => c.scrollTop);
    await page.locator(`.slx-tree-node[data-node="${cut}"]`).evaluate((n) => (n as HTMLElement).click());
    expect(await cols.evaluate((c) => c.scrollTop)).toBe(top);
    expect(await whole(cut!)).toBe(true);
    // A row half under the pinned branch name comes down below it.
    const under = await cols.evaluate((c) => {
      const head = c.querySelector('.slx-tree-branch-name')!;
      // The first row the columns can scroll half under the name (their scroll is short at 844).
      const at = (n: HTMLElement) => c.scrollTop + n.getBoundingClientRect().top - head.getBoundingClientRect().bottom + n.getBoundingClientRect().height / 2;
      const n = [...c.querySelectorAll<HTMLElement>('.slx-tree-node')].find((x) => at(x) > 0 && at(x) <= c.scrollHeight - c.clientHeight)!;
      c.scrollTop = at(n);
      c.dispatchEvent(new Event('scroll'));
      return n.getAttribute('data-node');
    });
    expect(await whole(under!)).toBe(false);
    await page.locator(`.slx-tree-node[data-node="${under}"]`).evaluate((n) => (n as HTMLElement).click());
    expect(await whole(under!)).toBe(true);
    await fitTo(page, 1280, 720);
    expect(await branchNamesShown(page)).toBe(true);
    expect(w.errors).toEqual([]);
  });

  test("rin's innate mark and her 熟記 show on the status pages (plan 8d Task 3)", async ({ page }) => {
    await fitTo(page, 1280, 720);
    const missing: string[] = [];
    page.on('response', (r) => { if (r.status() === 404) missing.push(r.url()); });
    const shots = process.env.SL_SHOTS;
    if (shots) mkdirSync(shots, { recursive: true });
    const shot = async (name: string) => { if (shots) { await page.waitForTimeout(400); await page.screenshot({ path: `${shots}/${name}.png` }); } };
    const w = await setup(page, 7);
    await legacyRoster(page);
    await page.evaluate(() => {
      const g = (window as unknown as Dbg).__starlanternDebug.game;
      g.state.party.roster.rin.level = 20;
      g.state.party.roster.rin.tree = { 'rin-needle': 3, 'rin-needle-three': 2, 'rin-mark-hone': 1, 'rin-mark-steady': 1 };
    });
    await w.choose('.slx-town', '冒險者公會');
    await expect(page.locator('.slx-guild')).toBeVisible(); await w.closeTalk();
    await page.locator('.slx-guild [data-id=tree]').click();
    await flipTo(page, CHARACTERS.rin.name);
    const hone = page.locator('.slx-tree-node[data-node=rin-mark-hone]');
    await expect(hone).toContainText('熟記');
    await expect(hone).toContainText(T.ui2.tree.kind.mech);
    await expect(hone.locator('img')).toHaveCount(0);
    await expect(page.locator('.slx-tree-node[data-node=rin-mark-steady]')).toContainText('暗記・不眨眼');
    await expect(page.locator('.slx-tree-node[data-node=rin-mark]')).toHaveCount(0);   // not a node of her tree any more
    await hone.click();
    await expect(page.locator('.slx-tree-info')).toContainText(T.ui2.tree.now('暗記只要 5 TP。'));
    await shot('rin-tree-1280');
    await fitTo(page, 844, 390);
    await shot('rin-tree-844');
    await fitTo(page, 1280, 720);
    await page.locator('[data-tab=skills]').click();
    const mark = page.locator('.slx-tab-skills [data-skill=rin-mark]');
    await expect(mark.locator('.slx-skill-rank')).toHaveText(T.ui2.status.innate);
    await expect(mark.locator('.slx-skill-name')).toHaveText('暗記・不眨眼');
    await expect(mark.locator('.slx-skill-cost')).toHaveText(T.ui2.status.tp(5));
    await shot('rin-skills-1280');
    await fitTo(page, 844, 390);
    expect(await mark.evaluate((e) => e.scrollWidth <= e.clientWidth + 0.5)).toBe(true);
    await shot('rin-skills-844');
    expect(missing).toEqual([]);
    expect(w.errors).toEqual([]);
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
    // At the top nothing is above, so ▲ stays hidden. Since plan 8d Task 3 Noel's 火 branch holds two pairs (each variant on
    // two lines) and runs past 1280x720, so ▼ shows exactly when the columns overflow.
    await expect(page.locator('.slx-tab-tree .slx-more-up')).toBeHidden();
    const overflows = await page.locator('.slx-tree-cols').evaluate((c) => c.scrollHeight > c.clientHeight + 1);
    expect(overflows).toBe(true);
    await expect(page.locator('.slx-tab-tree .slx-more-down')).toBeVisible();
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
        // k below reads the drawn scale off a card's height: that holds only for an upright stage (desktop sizes here).
        expect((await stageScale(page)).kind).toBe('scale');
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
            // Final review: the count on one line; the 本次狀況 label and every 「未取得」 tag on screen, whole, inside the card.
            countLines: (() => { const l = c.querySelector('.slx-portal-gear-head .slx-portal-label'); if (!l) return null; const q = document.createRange(); q.selectNodeContents(l); return new Set([...q.getClientRects()].map((x) => Math.round(x.top))).size; })(),
            shown: [...c.querySelectorAll<HTMLElement>('.slx-portal-cond .slx-portal-label, .slx-codex-tag')].map((e) => {
              const q = e.getBoundingClientRect(), clip = (g ?? c).getBoundingClientRect();
              const inside = (o: DOMRect) => q.left >= o.left - 0.5 && q.right <= o.right + 0.5 && q.top >= o.top - 0.5 && q.bottom <= inner + 0.5 && q.bottom <= o.bottom + 0.5;
              return { text: e.textContent, whole: e.checkVisibility() && q.width > 0 && inside(box) && (e.classList.contains('slx-portal-label') || inside(clip)) };
            }),
          };
        }));
        expect(r.map((c) => c.region)).toEqual(['mainline', ...pair]);
        for (const c of r) {
          const at = `${c.region} ${condition}`;
          expect(c.clipped, `${at} card clipped`).toBeLessThanOrEqual(1);
          expect(c.depthBelow, `${at} depth line clipped`).toBeLessThanOrEqual(0.5);
          expect(c.art?.loaded, `${at} banner art`).toBe(true);
          expect(c.art!.h, `${at} banner height`).toBeGreaterThanOrEqual(24);   // legibility ruling 8: the strip gives up 8px for 12px text
          expect(c.shown.filter((x) => x.text === T.ui2.gate.condition), `${at} 本次狀況 label`).toEqual([{ text: T.ui2.gate.condition, whole: true }]);
          if (c.region === 'mainline') continue;
          expect(c.countLines, `${at} 限定裝備 count on one line`).toBe(1);
          expect(c.shown.filter((x) => x.text !== T.ui2.gate.condition), `${at} 未取得 tags`).toEqual(Array(3).fill({ text: '未取得', whole: true }));
          expect(c.gear!.items, at).toBe(3); expect(c.gear!.over, `${at} overflow`).toBeLessThanOrEqual(1); expect(c.gear!.more).toBe(false);
        }
        await w.key('Escape');
      }
    }
    expect(w.errors).toEqual([]);
  });

  test("the guild points the way: Selene's lead first, then the next one, marked at the gate and kept in the handbook (6c Task 16)", async ({ page }) => {
    await fitTo(page, 1280, 720);
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
      g.state.runes = { 'spread@common': 3 };   // something for 符文合成 to list (plan 8f)
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
    const pages: [string, string[]][] = [['dismantle', []], ['enhance', []], ['reroll', ['[role=option]']], ['fuse', ['[data-id=magic]']], ['craft', ['[data-id=set]', '[data-id=set-blaze]']], ['runes', []]];
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
    const k = Math.hypot(...(({ a, b }) => [a, b])(new DOMMatrixReadOnly(getComputedStyle(document.querySelector('#sl-screen')!).transform)));   // the stage scale as drawn (legibility 2a)
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
      // 符文合成 (plan 8f): two rows that can fuse, one greyed with its reason; a legendary is not listed.
      s.runes = { 'armor-break@common': 3, 'thunderclap@magic': 1, 'spill-shield@legendary': 1, 'on-struck@rare': 3 };
      s.inventory['essence-common'] = 1;
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
    await tab('runes'); await whole('runes'); await walk('runes'); await back();
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
      const k = Math.hypot(...(({ a, b }) => [a, b])(new DOMMatrixReadOnly(getComputedStyle(document.querySelector('#sl-screen')!).transform)));   // the stage scale as drawn (legibility 2a)
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

  test('every published art file loads, and nothing unpublished is asked for (plan 5d Tasks 8 and 10)', async ({ page }) => {
    const answered = assetResponses(page);
    const w = await setup(page, 7);
    const manifest = await page.evaluate(async () => (await (await fetch('/assets/games/starlantern/manifest.json')).json()).urls as string[]);
    expect(manifest.length).toBe(428);   // 410 + the companion talking faces, wave 1 (18; user approval 2026-10-23)
    // Every file the manifest lists answers 200.
    for (const u of manifest) expect((await page.request.get(u)).status(), u).toBe(200);
    // Walk the screens that show the new art (equipment, shop, forge, portal codex) with every sample piece in the bag.
    await page.evaluate(() => {
      const g = (window as unknown as Dbg).__starlanternDebug.game;
      const piece = (base: string, rarity: string, extra = {}) => ({ uid: g.mintUid(), base, rarity, ilvl: 6, enhance: 0, affixes: [{ key: 'atk', value: 3 }], ...extra });
      g.state.bag = [piece('iron-sword', 'epic'), piece('wooden-buckler', 'rare'), piece('leather-cap', 'magic'),
        piece('iron-sword', 'legendary', { special: 'blaze-heart-sword' }), piece('thorn-spear', 'legendary', { special: 'lg-chizuru', starlit: true }),
        piece('wooden-buckler', 'unique', { special: 'iron-unbroken-shield' }), piece('leather-vest', 'set', { special: 'set-blaze-body' }),
        piece('hunter-bow', 'common')];
      g.state.dungeon.portals = [{ region: 'mainline', condition: 'plain' }, { region: 'blaze', condition: 'plain' }, { region: 'iron', condition: 'plain' }];
    });
    await w.choose('.slx-town', '冒險者公會');
    await expect(page.locator('.slx-guild')).toBeVisible(); await w.closeTalk();
    await page.locator('.slx-cmd [data-id=equip]').click();
    await expect(page.locator('.slx-equip-scene .slx-bag-cell img.slx-gear-ico')).toHaveCount(8);   // every piece has its art
    await expect(page.locator('.slx-bag-cell .slx-rframe-epic')).toHaveCount(1);
    await expect(page.locator('.slx-bag-cell .slx-rstarlit')).toHaveCount(1);
    await w.key('Tab'); await w.key('ArrowRight'); await w.key('ArrowRight'); await w.key('ArrowRight');   // the legendary sword
    await expect(page.locator('.slx-item-art-box img.slx-gear-art')).toHaveAttribute('src', /gear\/blaze-heart-sword-large\.png$/);
    await page.locator('.slx-back').click(); await page.locator('.slx-back').click();
    await expect(page.locator('.slx-town')).toBeVisible(); await w.closeTalk();
    await w.choose('.slx-town', '道具店');
    await expect(page.locator('.slx-shop')).toBeVisible(); await w.closeTalk();
    await w.key('Enter');
    await expect(page.locator('.slx-shop-list [data-id="iron-sword"] img.slx-gear-ico')).toHaveCount(1);
    await expect(page.locator('.slx-shop-list [data-id="hunter-bow"] img.slx-gear-ico')).toHaveAttribute('src', /gear\/hunter-bow\.png$/);
    await toTown(page, w);
    await w.choose('.slx-town', '鍛造屋');
    await expect(page.locator('.slx-forge')).toBeVisible(); await w.closeTalk();
    await w.key('Enter');                                   // 分解
    await expect(page.locator('.slx-forge-list img.slx-gear-ico').first()).toBeVisible();
    await toTown(page, w);
    await w.choose('.slx-town', '傳送門廣場');
    await expect(page.locator('.slx-gate')).toBeVisible(); await w.closeTalk();
    await w.key('Enter');
    await expect(page.locator('.slx-portal-blaze .slx-codex-pics img.slx-codex-silhouette')).toHaveCount(3);   // every blaze piece and the set: none obtained yet
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('img')].every((i) => i.complete));
    // Every starlantern file asked for is listed (or is the manifest itself) and answered without error.
    const known = new Set(manifest);
    const unlisted = answered.map((a) => new URL(a.url).pathname).filter((p) => !known.has(p) && !p.endsWith('/manifest.json'));
    expect(unlisted).toEqual([]);
    expect(answered.filter((a) => a.status >= 400)).toEqual([]);
    for (const p of ['/gear/iron-sword.png', '/ui/rarity-epic.png', '/ui/starlit.png', '/ui/glow-legendary.png', '/gear/set-blaze-silhouette.png']) {
      expect(answered.some((a) => a.url.endsWith(p)), p).toBe(true);
    }
    for (const id of Object.keys(EQUIPMENT)) expect(answered.some((a) => a.url.endsWith(`/icon/${id}.png`)), `the retired old icon of ${id}`).toBe(false);
    expect(answered.some((a) => a.url.endsWith('/npc/forge-happy.png') && a.status === 200), "Doran's smile").toBe(true);
    expect(w.errors).toEqual([]);
  });

  test('lists of gear with icons show every row they list inside their window and the screen (plan 5d Task 10)', async ({ page }) => {
    const w = await setup(page, 7);
    await page.evaluate(() => {
      const g = (window as unknown as Dbg).__starlanternDebug.game;
      const bases = ['wooden-staff', 'iron-sword', 'hunter-bow', 'thorn-spear', 'crystal-blade', 'frost-staff', 'star-saber', 'cloth-robe',
        'leather-vest', 'scale-mail', 'dusk-mantle', 'moss-charm', 'bat-earring', 'crystal-pendant', 'gear-ring', 'wooden-buckler'];
      g.state.bag = bases.map((base) => ({ uid: g.mintUid(), base, rarity: 'magic', ilvl: 6, enhance: 0, affixes: [{ key: 'atk', value: 3 }] }));
      g.state.gold = 5000;
    });
    /** Every listed row of the top list lies inside that list's window, and the window inside the screen. */
    const rowsInside = async (list: string) => page.evaluate((sel) => {
      const win = [...document.querySelectorAll<HTMLElement>(sel)].pop()!;
      const scr = document.querySelector('#sl-screen')!.getBoundingClientRect();
      const box = win.getBoundingClientRect();
      const rows = [...win.querySelectorAll<HTMLElement>('[role=option]')].map((r) => r.getBoundingClientRect());
      return {
        rows: rows.length,
        outside: rows.filter((r) => r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5).length,
        offScreen: box.bottom > scr.bottom + 0.5 || box.top < scr.top - 0.5,
        cursorShown: (() => { const c = win.querySelector('[aria-selected=true]')?.getBoundingClientRect(); return !!c && c.top >= box.top - 0.5 && c.bottom <= box.bottom + 0.5; })(),
      };
    }, list);
    await w.choose('.slx-town', '道具店');
    await expect(page.locator('.slx-shop')).toBeVisible(); await w.closeTalk();
    await w.key('Enter');                                   // 購買
    await expect(page.locator('.slx-shop-list img.slx-gear-ico').first()).toBeVisible();
    for (let i = 0; i < 3; i++) {                           // the top, then scrolled down by the wheel through the locked bases
      const r = await rowsInside('.slx-shop-list');
      expect(r.rows, `shop ${i}`).toBeGreaterThan(0);
      expect(r, `shop ${i}`).toEqual({ rows: r.rows, outside: 0, offScreen: false, cursorShown: r.cursorShown });
      for (let k = 0; k < 6; k++) await page.locator('.slx-shop-list .slx-menu').dispatchEvent('wheel', { deltaY: 100 });
    }
    await toTown(page, w);
    await w.choose('.slx-town', '鍛造屋');
    await expect(page.locator('.slx-forge')).toBeVisible(); await w.closeTalk();
    await w.key('ArrowDown'); await w.key('Enter');         // 強化: the bag and what everyone wears
    for (let i = 0; i < 20; i++) {
      const r = await rowsInside('.slx-forge-list');
      expect(r, `forge row ${i}`).toEqual({ rows: r.rows, outside: 0, offScreen: false, cursorShown: true });
      await w.key('ArrowDown');
    }
    expect(w.errors).toEqual([]);
  });

  test('the party bar shows every line whole at 12px (legibility Task 4)', async ({ page }) => {
    await fitTo(page, 1280, 720);
    const w = await setup(page, 7);
    await legacyRoster(page);
    await depart(page, w);
    for (let i = 0; i < 200 && !(await page.locator('.slx-battle').isVisible()); i++) {
      await w.key(i % 2 ? 'ArrowLeft' : 'ArrowRight');
      await w.closeTalk();
      if (await page.locator('.slx-confirm').isVisible()) await w.key('Enter');
      if (await page.locator('.slx-event').isVisible()) await w.key('Escape');
    }
    await expect(page.locator('.slx-battle')).toBeVisible();
    // The widest numbers a panel shows: 9999 HP on all five.
    await page.evaluate(() => {
      const g = (window as unknown as Dbg).__starlanternDebug.game;
      for (const m of g.battle.party) { m.max.hp = 9999; m.hp = 9999; }
      for (const e of g.battle.enemies) { e.max.hp = 999; e.hp = 999; e.max.atk = 1; e.max.mag = 1; }
    });
    for (let i = 0; i < 60 && (await page.evaluate(() => (window as unknown as Dbg).__starlanternDebug.game.battle?.round ?? -1)) === 0; i++) {
      if (await page.locator('.slx-bcmd [role=option]').count()) await w.choose('.slx-bcmd', '防禦');
      else await page.waitForTimeout(50);
    }
    await expect(page.locator('.slx-partybar .slx-pm-num').first()).toContainText('9999');
    for (const [vw, vh] of [[1280, 720], [844, 390]] as const) {
      await fitTo(page, vw, vh);
      const faults = await page.locator('.slx-partybar .slx-pm').evaluateAll((ps) => ps.flatMap((p) => {
        const body = p.querySelector<HTMLElement>('.slx-pm-body')!;
        const out = body.scrollHeight > body.clientHeight ? [`body ${body.scrollHeight}>${body.clientHeight}`] : [];
        for (const sel of ['.slx-pm-name', '.slx-pm-num', '.slx-pm-tp']) {
          const e = p.querySelector<HTMLElement>(sel)!;
          if (e.scrollWidth > e.clientWidth + 0.5) out.push(`${sel} "${e.textContent}" ${e.scrollWidth}>${e.clientWidth}`);
        }
        return out;
      }));
      expect(faults, `at ${vw}x${vh}`).toEqual([]);
    }
    expect(w.errors).toEqual([]);
  });

  test('the title still comes when the pixel font is slow (legibility Task 4)', { annotation: { type: 'font-blocked' } }, async ({ page }) => {
    // Timed from the document (the font's preload holds the load event itself back), against the same page with the font
    // on time: the slow font may add at most 3.5s (the game waits 3s for it). The page's own boot is not the font's doing.
    const title = page.locator('.slx-title [role=option]').first();
    const timeToTitle = async () => {
      await page.goto('/games/starlantern', { waitUntil: 'domcontentloaded' });
      const t = Date.now();
      await expect(title).toBeVisible({ timeout: 10_000 });
      return Date.now() - t;
    };
    const onTime = await timeToTitle();
    let asked = 0;
    await page.route('**/Cubic_11.woff2', async (r) => { asked++; await new Promise((ok) => setTimeout(ok, 5000)); await r.continue().catch(() => undefined); });
    const slow = await timeToTitle();
    expect(asked, 'the font was asked for (and held back)').toBeGreaterThanOrEqual(1);
    // The game did wait for it (about 3s; without loadPixelFont the title would not wait at all), and not for longer.
    expect(slow - onTime, `the title took ${slow}ms with the font 5s late, ${onTime}ms with it on time`).toBeGreaterThan(2000);
    expect(slow - onTime, `the title took ${slow}ms with the font 5s late, ${onTime}ms with it on time`).toBeLessThan(3500);
  });

  test('five members with five ailments each never cover an enemy HP bar, at 1280x720 or 844x390 (one line each)', async ({ page }) => {
    await fitTo(page, 1280, 720);
    const game = <T, A = undefined>(fn: (g: any, a: A) => T, arg?: A): Promise<T> =>
      page.evaluate(([src, a]) => new Function('g', 'a', `return (${src})(g, a)`)((window as unknown as Dbg).__starlanternDebug.game, a), [fn.toString(), arg] as [string, unknown]) as Promise<T>;
    const w = await setup(page, 7);
    await legacyRoster(page);
    await depart(page, w);
    await expect(page.locator('.slx-partybar .slx-pm')).toHaveCount(5);
    for (let i = 0; i < 200 && !(await page.locator('.slx-battle').isVisible()); i++) {
      await w.key(i % 2 ? 'ArrowLeft' : 'ArrowRight');
      await w.closeTalk();
      if (await page.locator('.slx-confirm').isVisible()) await w.key('Enter');
      if (await page.locator('.slx-event').isVisible()) await w.key('Escape');
    }
    await expect(page.locator('.slx-battle')).toBeVisible();
    await game((g) => {
      for (const m of g.battle.party) {
        m.poison = true; m.burn = { tick: 1, turns: 3, src: 'e0' };
        m.bleed = [{ tick: 1, turns: 3, src: 'e0' }, { tick: 1, turns: 3, src: 'e0' }];
        m.shock = 3; m.chill = 3;
        m.hp = m.max.hp;
      }
      for (const e of g.battle.enemies) {
        e.poison = true; e.burn = { tick: 1, turns: 3, src: 'hero' }; e.bleed = [{ tick: 1, turns: 3, src: 'hero' }];
        e.shock = 3; e.chill = 3; e.max.hp = 999; e.hp = 999;
      }
    });
    // Everyone defends through one round, so every panel is redrawn with its words.
    for (let i = 0; i < 60 && (await game((g) => g.battle?.round ?? -1)) === 0; i++) {
      if (await page.locator('.slx-bcmd [role=option]').count()) await w.choose('.slx-bcmd', '防禦');
      else await page.waitForTimeout(50);
    }
    await expect(page.locator('.slx-bcmd [role=option]').first()).toBeVisible();
    await expect(page.locator('.slx-partybar .slx-pm-ail:not([hidden])')).toHaveCount(5);
    // A mechanic's word (plan 8c: Noel's heat, Liz's coins, Scarlet's embers, Safira's beat) takes the first place in
    // its row, and one more ailment folds into +N.
    for (const row of await page.locator('.slx-partybar .slx-pm-ail').all()) {
      const words = await row.locator('.slx-mech, .slx-ail').allTextContents();
      const mech = /^(熱度|銅板|餘燼|拍子)\d+$/.test(words[0]) ? [words[0]] : [];
      // At 12px (legibility Task 4) fewer words fit the panel's line before the +N.
      expect(words).toEqual(mech.length ? [...mech, '流血×2', '+4'] : ['流血×2', '灼燒2', '+3']);
    }
    /** Every member word against every living enemy's HP bar (design px, mapped onto the canvas as drawn). */
    const overlaps = () => page.evaluate(() => {
      const view = (window as unknown as { __starlanternDebug: { stage: any } }).__starlanternDebug.stage.battleView;
      const canvas = document.querySelector('#sl-canvas')!.getBoundingClientRect();
      const k = Math.hypot(...(({ a, b }) => [a, b])(new DOMMatrixReadOnly(getComputedStyle(document.querySelector('#sl-screen')!).transform)));   // the stage scale as drawn (legibility 2a)
      const keys: string[] = (window as unknown as { __starlanternDebug: { game: any } }).__starlanternDebug.game.battle.enemies.filter((e: any) => e.alive).map((e: any) => e.key);
      const bars = keys.map((key) => view.hpBarRect(key)).filter(Boolean)
        .map((r: { x: number; y: number; width: number; height: number }) => ({ left: canvas.left + r.x * k, top: canvas.top + r.y * k, right: canvas.left + (r.x + r.width) * k, bottom: canvas.top + (r.y + r.height) * k }));
      const chips = [...document.querySelectorAll('.slx-partybar .slx-ail, .slx-partybar .slx-mech')].map((c) => c.getBoundingClientRect());
      const hits: string[] = [];
      for (const c of chips) for (const b of bars) {
        if (c.left < b.right && b.left < c.right && c.top < b.bottom && b.top < c.bottom) hits.push(`${c.left},${c.top} x ${b.left},${b.top}`);
      }
      return { bars: bars.length, chips: chips.length, hits };
    });
    for (const size of [{ width: 1280, height: 720 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      await page.waitForTimeout(300);
      const r = await overlaps();
      expect(r.bars, `${size.width}x${size.height}`).toBeGreaterThan(0);
      expect(r.chips, `${size.width}x${size.height}`).toBe(15);   // three words a row at 12px (legibility Task 4), +N included
      expect(r.hits, `${size.width}x${size.height}`).toEqual([]);
      if (process.env.SL_SHOTS) { mkdirSync(process.env.SL_SHOTS, { recursive: true }); await page.screenshot({ path: `${process.env.SL_SHOTS}/five-by-five-${size.width}.png` }); }
    }
    expect(w.errors).toEqual([]);
  });

  test('ailments show as coloured words on the battle screen (plan 8b)', async ({ page }) => {
    await fitTo(page, 1280, 720);
    const missing: string[] = [];
    page.on('response', (r) => { if (r.status() === 404) missing.push(r.url()); });
    const game = <T, A = undefined>(fn: (g: any, a: A) => T, arg?: A): Promise<T> =>
      page.evaluate(([src, a]) => new Function('g', 'a', `return (${src})(g, a)`)((window as unknown as Dbg).__starlanternDebug.game, a), [fn.toString(), arg] as [string, unknown]) as Promise<T>;
    const w = await setup(page, 7);
    await depart(page, w);
    for (let i = 0; i < 200 && !(await page.locator('.slx-battle').isVisible()); i++) {
      await w.key(i % 2 ? 'ArrowLeft' : 'ArrowRight');
      await w.closeTalk();
      if (await page.locator('.slx-confirm').isVisible()) await w.key('Enter');
      if (await page.locator('.slx-event').isVisible()) await w.key('Escape');
    }
    await expect(page.locator('.slx-battle')).toBeVisible();
    const who: string = await game((g) => {
      const m = g.battle.party[0];
      m.poison = true; m.burn = { tick: 5, turns: 3, src: 'e0' };
      m.bleed = [{ tick: 3, turns: 3, src: 'e0' }, { tick: 3, turns: 2, src: 'e0' }];
      m.shock = 3; m.chill = 3;
      m.hp = m.max.hp;
      const e = g.battle.enemies[0];
      e.shock = 3; e.bleed = [{ tick: 1, turns: 3, src: m.key }];
      return m.key;
    });
    // Everyone defends through one round.
    for (let i = 0; i < 40 && (await game((g) => g.battle?.round ?? -1)) === 0; i++) {
      if (await page.locator('.slx-bcmd [role=option]').count()) await w.choose('.slx-bcmd', '防禦');
      else await page.waitForTimeout(50);
    }
    await expect(page.locator('.slx-bcmd [role=option]').first()).toBeVisible();
    const row = page.locator(`.slx-partybar [data-key=${who}] .slx-pm-ail`);
    await expect(row).toBeVisible();
    // One line, the most severe first; what does not fit is counted in +N.
    expect(await row.locator('.slx-ail').allTextContents()).toEqual(['流血×2', '灼燒2', '+3']);   // at 12px (legibility Task 4)
    expect(await page.locator('.slx-partybar .slx-ail img, .slx-partybar .slx-pm-ail img').count()).toBe(0);
    if (process.env.SL_SHOTS) { mkdirSync(process.env.SL_SHOTS, { recursive: true }); await page.waitForTimeout(800); await page.screenshot({ path: `${process.env.SL_SHOTS}/ailments-1280.png` }); }
    // At 1280 and on a phone: the words wrap within the panel's width just above it, on the screen; the panel keeps its height.
    const fits = () => row.evaluate((r) => {
      // Edges in stage px (legibility 2b): on a phone held upright the stage is turned, its top along the screen's right edge.
      const scr = document.querySelector('#sl-screen')!.getBoundingClientRect();
      const turned = scr.height > scr.width, k = turned ? scr.width / 360 : scr.width / 640;
      const st = (e: Element) => {
        const q = e.getBoundingClientRect();
        return turned
          ? { left: (q.top - scr.top) / k, right: (q.bottom - scr.top) / k, top: (scr.right - q.right) / k, bottom: (scr.right - q.left) / k, height: q.width / k }
          : { left: (q.left - scr.left) / k, right: (q.right - scr.left) / k, top: (q.top - scr.top) / k, bottom: (q.bottom - scr.top) / k, height: q.height / k };
      };
      const panel = st(r.closest('.slx-pm')!), box = st(r);
      const screen = { top: 0 };
      const bar = st(r.closest('.slx-partybar')!);
      return {
        scroll: r.scrollWidth, client: r.clientWidth,
        within: box.left >= panel.left - 0.5 && box.right <= panel.right + 0.5,
        above: box.bottom <= panel.top + 0.5 && box.top >= screen.top - 0.5,
        height: Math.abs(panel.height - bar.height) < 1,
        // Nothing (the command window included) covers a word. The row ignores the pointer, so the probe lets it be hit for a moment.
        seen: [...r.querySelectorAll<HTMLElement>('.slx-ail')].every((c) => {
          const b = c.getBoundingClientRect();
          r.style.pointerEvents = 'auto';
          const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          r.style.pointerEvents = '';
          return c.contains(hit);
        }),
      };
    });
    // Polled: a hit's number or effect may pass over a word for a moment.
    const settled = { within: true, above: true, height: true, seen: true };
    await expect.poll(fits, { timeout: 3000 }).toMatchObject(settled);
    await fitTo(page, 390, 844);
    await expect.poll(fits, { message: 'the ailment row wraps within its panel, above it, on the screen', timeout: 3000 }).toMatchObject(settled);
    const fit = await fits();
    expect(fit.scroll).toBeLessThanOrEqual(fit.client);
    if (process.env.SL_SHOTS) { await page.waitForTimeout(800); await page.screenshot({ path: `${process.env.SL_SHOTS}/ailments-390.png` }); }
    expect(w.errors).toEqual([]);
    expect(missing).toEqual([]);
  });

  test('slow enemy and backdrop art never shows a stand-in block, and lands when it arrives', async ({ page }) => {
    await fitTo(page, 1280, 720);
    // Every enemy picture and backdrop is held back (a slow network) until the fight is on screen, then lands 3 s later.
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    await page.route(/\/assets\/games\/starlantern\/(enemy\/.*|bg\/.*|char\/[a-z-]+-standee)\.png/, async (route) => { await held; await route.continue(); });
    const w = await setup(page, 7);
    await depart(page, w);
    for (let i = 0; i < 200 && !(await page.locator('.slx-battle').isVisible()); i++) {
      await w.key(i % 2 ? 'ArrowLeft' : 'ArrowRight');
      await w.closeTalk();
      if (await page.locator('.slx-confirm').isVisible()) await w.key('Enter');
      if (await page.locator('.slx-event').isVisible()) await w.key('Escape');
    }
    await expect(page.locator('.slx-battle')).toBeVisible();
    /** What each living foe's body holds: Sprite, Graphics or nothing. */
    const bodies = () => page.evaluate(() => {
      const d = (window as unknown as { __starlanternDebug: { game: any; stage: any } }).__starlanternDebug;
      return d.game.battle.enemies.filter((e: any) => e.alive).map((e: any) => {
        const box = d.stage.battleView.enemyBoxOf(e.key);
        return box ? box.children[0].children.map((c: any) => ('texture' in c && !('context' in c) ? 'sprite' : 'other')) : [];
      });
    });
    const seen: string[][][] = [await bodies()];
    // The fight waited its moment and drew no stand-in: every foe is a name and a bar for now.
    expect(seen[0].length).toBeGreaterThan(0);
    expect(seen[0].every((x: string[]) => x.length === 0)).toBe(true);
    if (process.env.SL_SHOTS) { mkdirSync(process.env.SL_SHOTS, { recursive: true }); await page.screenshot({ path: `${process.env.SL_SHOTS}/slow-art-held.png` }); }
    await page.waitForTimeout(3000);
    release();
    for (let i = 0; i < 40; i++) {
      const b = await bodies();
      seen.push(b);
      if (b.length && b.every((x: string[]) => x.length === 1 && x[0] === 'sprite')) break;
      await page.waitForTimeout(250);
    }
    // Never anything but a sprite (or, while it is on its way, nothing at all); and in the end every foe has its picture.
    for (const b of seen) for (const x of b) expect(x.every((k) => k === 'sprite')).toBe(true);
    expect(seen.at(-1)!.length).toBeGreaterThan(0);   // foes there to have their pictures (an empty list would pass)
    expect(seen.at(-1)!.every((x) => x.length === 1)).toBe(true);
    if (process.env.SL_SHOTS) await page.screenshot({ path: `${process.env.SL_SHOTS}/slow-art-landed.png` });
    expect(w.errors).toEqual([]);
  });

  test('heat and the mark show on the battle screen (plan 8c)', async ({ page }) => {
    await fitTo(page, 1280, 720);
    const missing: string[] = [];
    page.on('response', (r) => { if (r.status() === 404) missing.push(r.url()); });
    const game = <T, A = undefined>(fn: (g: any, a: A) => T, arg?: A): Promise<T> =>
      page.evaluate(([src, a]) => new Function('g', 'a', `return (${src})(g, a)`)((window as unknown as Dbg).__starlanternDebug.game, a), [fn.toString(), arg] as [string, unknown]) as Promise<T>;
    const shots = process.env.SL_SHOTS;
    if (shots) mkdirSync(shots, { recursive: true });
    const w = await setup(page, 7);
    // The standard five: Noel and Rin both fight.
    await page.evaluate(() => {
      const p = (window as unknown as Dbg).__starlanternDebug.game.state.party;
      p.recruited = ['hero', 'rin', 'chizuru', 'noel', 'selene'];
      p.grid = ['hero', 'rin', 'chizuru', null, null, null, 'noel', null, 'selene'];
    });
    await depart(page, w);
    for (let i = 0; i < 200 && !(await page.locator('.slx-battle').isVisible()); i++) {
      await w.key(i % 2 ? 'ArrowLeft' : 'ArrowRight');
      await w.closeTalk();
      if (await page.locator('.slx-confirm').isVisible()) await w.key('Enter');
      if (await page.locator('.slx-event').isVisible()) await w.key('Escape');
    }
    await expect(page.locator('.slx-battle')).toBeVisible();
    // Noel runs at heat 3; Rin has marked the first foe; the foes are made harmless and sturdy.
    const foes: number = await game((g) => {
      const noel = g.battle.party.find((c: any) => c.key === 'noel');
      const rin = g.battle.party.find((c: any) => c.key === 'rin');
      noel.mech = { kind: 'heat', heat: 3 };
      const live = g.battle.enemies.filter((e: any) => e.alive);
      for (const e of live) { e.max.hp = 999; e.hp = 999; e.max.atk = 1; e.max.mag = 1; }
      rin.mech = { kind: 'mark', marks: [live[0].key], cap: 1 };
      return live.length;
    });
    const round = () => game((g) => g.battle?.round ?? -1);
    /** One round: Rin does `rin`, everyone else defends. */
    const play = async (rin: '攻擊' | '防禦') => {
      const at = await round();
      for (let i = 0; i < 60 && (await round()) === at; i++) {
        if (!(await page.locator('.slx-bcmd [role=option]').count())) { await page.waitForTimeout(50); continue; }
        const who = (await page.locator('.slx-bcmd .slx-who').textContent()) ?? '';
        await w.choose('.slx-bcmd', who.startsWith(CHARACTERS.rin.name) ? rin : '防禦');
        if (await page.locator('.slx-btarget').isVisible()) await w.key('Enter');   // the first foe: her mark
      }
    };
    await play('防禦');
    await expect(page.locator('.slx-bcmd [role=option]').first()).toBeVisible();
    const row = page.locator('.slx-partybar [data-key=noel] .slx-pm-ail');
    await expect(row.locator('.slx-mech-heat')).toHaveText('熱度3');
    // The mark rides on the foe's picture (Pixi), first in its row.
    const marked = await page.evaluate(() => {
      const view = (window as unknown as Dbg & { __starlanternDebug: { stage: any } }).__starlanternDebug.stage.battleView;
      return view.ailmentTexts('e0').map((t: { text: string }) => t.text);
    });
    expect(marked[0]).toBe('暗記');
    if (shots) { await page.waitForTimeout(500); await page.screenshot({ path: `${shots}/mech-1280.png` }); }
    await fitTo(page, 844, 390);
    if (shots) { await page.waitForTimeout(500); await page.screenshot({ path: `${shots}/mech-844.png` }); }
    // On a phone held upright the row still fits its panel on one line.
    await fitTo(page, 390, 844);
    const fit = await row.evaluate((r) => ({ scroll: r.scrollWidth, client: r.clientWidth }));
    expect(fit.client).toBeGreaterThan(0);   // the row is there (a hidden row would pass vacuously)
    expect(fit.scroll).toBeLessThanOrEqual(fit.client);
    // Rin fells her marked foe: 還有。 pops over her, and she strikes again while a foe stands.
    await fitTo(page, 1280, 720);
    // Seed 7's first fight is two moss slimes: one to fell, one left standing for 還有。.
    expect(foes).toBeGreaterThanOrEqual(2);
    // Rin carries an ailment, so her ailment row stands above her panel for the cue to keep clear of.
    await game((g) => { g.battle.enemies.find((e: any) => e.key === 'e0').hp = 1; g.battle.party.find((c: any) => c.key === 'rin').burn = { tick: 1, turns: 3, src: 'e1' }; });
    const cue = page.locator('.slx-partybar [data-key=rin] .slx-pm-cue');
    // In fast mode too, the word holds, on the name and HP side of her panel, on top of whatever else is drawn there.
    const seen = cue.first().waitFor({ state: 'attached', timeout: 10_000 }).then(async () => {
      const shown = await cue.first().evaluate((c) => {
        const b = c.getBoundingClientRect(), panel = c.closest('.slx-pm')!.getBoundingClientRect();
        // The word ignores the pointer and the screen is inert while a round plays, so the probe lifts both for a moment.
        const inert = c.closest('[inert]');
        inert?.removeAttribute('inert');
        (c as HTMLElement).style.pointerEvents = 'auto';
        const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        (c as HTMLElement).style.pointerEvents = '';
        inert?.setAttribute('inert', '');
        // Off the HP digits, the TP line and the ailment row above the panel; each of them there to be kept clear of.
        const meets = (r: DOMRect) => b.left < r.right && r.left < b.right && b.top < r.bottom && r.top < b.bottom;
        const pm = c.closest('.slx-pm')!;
        const others = ['.slx-pm-num', '.slx-pm-tp', '.slx-pm-ail:not([hidden])'].map((q) => pm.querySelector(q)?.getBoundingClientRect());
        const clear = others.every((r) => !!r && r.width > 0 && !meets(r));
        // On the portrait (T4 review): its lower part, where no text is.
        const face = pm.querySelector('img')?.getBoundingClientRect();
        const onFace = !!face && b.left >= panel.left - 0.5 && b.top >= face.top + face.height / 2 - 0.5 && b.bottom <= panel.bottom + 0.5;
        const pops = [...pm.querySelectorAll('.slx-pm-pop, .slx-pm-crit, .slx-pm-weak, .slx-pm-resist, .slx-pm-miss')].map((p) => p.getBoundingClientRect());
        return { text: c.textContent, onPortrait: onFace && pops.every((r) => !meets(r)), onTop: c.contains(top), clear };
      });
      if (shots) await page.screenshot({ path: `${shots}/again-1280.png` });
      return shown;
    });
    await play('攻擊');
    expect(await seen).toEqual({ text: '還有。', onPortrait: true, onTop: true, clear: true });
    expect(await game((g) => g.battle.log.some((e: any) => e.type === 'mech' && e.cue === 'again'))).toBe(true);
    // Every cue word, in every slot of the bar (review of T4): the same word element, put on each panel in turn, stays on
    // the portrait's lower part and clear of the name, the HP digits and the TP line.
    for (const [vw, vh] of [[1280, 720], [844, 390], [390, 844]] as const) {
      await fitTo(page, vw, vh);
      const off = await page.evaluate((words) => [...document.querySelectorAll('.slx-partybar .slx-pm')].flatMap((pm, slot) => words.flatMap((word) => {
        const c = document.createElement('span');
        c.className = 'slx-pm-cue slx-mech-heat';
        c.textContent = word;
        pm.append(c);
        const b = c.getBoundingClientRect(), panel = pm.getBoundingClientRect(), face = pm.querySelector('img')!.getBoundingClientRect();
        const meets = (r: DOMRect) => b.left < r.right && r.left < b.right && b.top < r.bottom && r.top < b.bottom;
        const text = ['.slx-pm-name', '.slx-pm-num', '.slx-pm-tp'].map((q) => pm.querySelector(q)!.getBoundingClientRect());
        // In screen px: on the phone the stage is turned, so check against the face along both axes.
        const onFace = meets(face) && b.left >= panel.left - 0.5 && b.right <= panel.right + 0.5 && b.top >= panel.top - 0.5 && b.bottom <= panel.bottom + 0.5;
        c.remove();
        return onFace && text.every((r) => !meets(r)) ? [] : [`slot ${slot} 「${word}」`];
      })), Object.values(T.mech.cue));
      expect(off, `cue words off the portrait at ${vw}`).toEqual([]);
      if (shots && vw === 1280) {
        await page.evaluate((words) => [...document.querySelectorAll('.slx-partybar .slx-pm')].forEach((pm, i) => {
          const c = document.createElement('span');
          c.className = 'slx-pm-cue slx-mech-beat slx-shot-cue';
          c.textContent = words[i % words.length];
          pm.append(c);
        }), Object.values(T.mech.cue));
        await page.screenshot({ path: `${shots}/cue-words-1280.png` });
        await page.evaluate(() => document.querySelectorAll('.slx-shot-cue').forEach((c) => c.remove()));
      }
    }
    await fitTo(page, 1280, 720);
    expect(w.errors).toEqual([]);
    expect(missing).toEqual([]);
  });

  test('the barrier and the moon show above the battle, and release spends the barrier (plan 8c)', async ({ page }) => {
    await fitTo(page, 1280, 720);
    const missing: string[] = [];
    page.on('response', (r) => { if (r.status() === 404) missing.push(r.url()); });
    const game = <T, A = undefined>(fn: (g: any, a: A) => T, arg?: A): Promise<T> =>
      page.evaluate(([src, a]) => new Function('g', 'a', `return (${src})(g, a)`)((window as unknown as Dbg).__starlanternDebug.game, a), [fn.toString(), arg] as [string, unknown]) as Promise<T>;
    const shots = process.env.SL_SHOTS;
    if (shots) mkdirSync(shots, { recursive: true });
    const w = await setup(page, 7);
    await page.evaluate(() => {
      const p = (window as unknown as Dbg).__starlanternDebug.game.state.party;
      p.recruited = ['hero', 'rin', 'chizuru', 'noel', 'selene'];
      p.grid = ['hero', 'rin', 'chizuru', null, null, null, 'noel', null, 'selene'];
    });
    await depart(page, w);
    for (let i = 0; i < 200 && !(await page.locator('.slx-battle').isVisible()); i++) {
      await w.key(i % 2 ? 'ArrowLeft' : 'ArrowRight');
      await w.closeTalk();
      if (await page.locator('.slx-confirm').isVisible()) await w.key('Enter');
      if (await page.locator('.slx-event').isVisible()) await w.key('Escape');
    }
    await expect(page.locator('.slx-battle')).toBeVisible();
    // A guard barrier with three rounds left, the moon at the full; Chizuru knows the release thrust; the foes are harmless.
    await game((g) => {
      g.battle.barriers = [{ skill: 'ward', kind: 'guard', power: 30, turns: 3, src: 'chizuru' }];
      g.battle.moon = { phase: 'full' };
      const c = g.battle.party.find((m: any) => m.key === 'chizuru');
      c.ranks = { ...c.ranks, 'exorcism-thrust': 1 }; c.tp = c.max.tp;
      g.state.party.roster.chizuru.tree = { ...g.state.party.roster.chizuru.tree, 'exorcism-thrust': 1 };
      for (const e of g.battle.enemies) { e.max.hp = 9999; e.hp = 9999; e.max.atk = 1; e.max.mag = 1; }
    });
    const round = () => game((g) => g.battle?.round ?? -1);
    /** One round: Chizuru does `chizuru` (a label path), everyone else defends. */
    const play = async (chizuru: string[]) => {
      const at = await round();
      for (let i = 0; i < 80 && (await round()) === at; i++) {
        if (!(await page.locator('.slx-bcmd [role=option]').count())) { await page.waitForTimeout(50); continue; }
        const who = (await page.locator('.slx-bcmd .slx-who').textContent()) ?? '';
        if (!who.startsWith(CHARACTERS.chizuru.name)) { await w.choose('.slx-bcmd', '防禦'); continue; }
        for (const label of chizuru) {
          await w.choose(label === chizuru[0] ? '.slx-bcmd' : '.slx-bsub', label);
        }
        if (await page.locator('.slx-btarget').isVisible()) await w.key('Enter');
      }
    };
    await play(['防禦']);
    await expect(page.locator('.slx-bcmd [role=option]').first()).toBeVisible();
    const bar = page.locator('.slx-fieldbar');
    await expect(bar).toBeVisible();
    await expect(bar).toContainText('守之結界2');
    await expect(bar).toContainText('月相：下弦→新月');
    await expect(page.locator('.slx-fieldbar .slx-mech-ward')).toHaveCount(1);
    if (shots) { await page.waitForTimeout(500); await page.screenshot({ path: `${shots}/field-1280.png` }); }
    await fitTo(page, 844, 390);
    if (shots) { await page.waitForTimeout(500); await page.screenshot({ path: `${shots}/field-844.png` }); }
    await fitTo(page, 1280, 720);
    // Release: 破邪突 spends the barrier (two rounds left: 120% power); the bar loses its barrier word.
    await play(['技能', SKILLS['exorcism-thrust'].name]);
    await expect(page.locator('.slx-bcmd [role=option]').first()).toBeVisible();
    expect(await game((g) => g.battle.log.some((e: any) => e.type === 'act' && e.actor === 'chizuru' && e.label === '破邪突'))).toBe(true);
    expect(await game((g) => g.battle.barriers ?? [])).toEqual([]);
    if (shots) { await page.waitForTimeout(500); await page.screenshot({ path: `${shots}/release-1280.png` }); }
    await expect(page.locator('.slx-fieldbar .slx-mech-ward')).toHaveCount(0);
    await expect(bar).toContainText('月相');
    await fitTo(page, 844, 390);
    if (shots) { await page.waitForTimeout(500); await page.screenshot({ path: `${shots}/release-844.png` }); }
    expect(w.errors).toEqual([]);
    expect(missing).toEqual([]);
  });

  test('coins and aim show on the battle screen (plan 8c)', async ({ page }) => {
    await fitTo(page, 1280, 720);
    const missing: string[] = [];
    page.on('response', (r) => { if (r.status() === 404) missing.push(r.url()); });
    const game = <T, A = undefined>(fn: (g: any, a: A) => T, arg?: A): Promise<T> =>
      page.evaluate(([src, a]) => new Function('g', 'a', `return (${src})(g, a)`)((window as unknown as Dbg).__starlanternDebug.game, a), [fn.toString(), arg] as [string, unknown]) as Promise<T>;
    const shots = process.env.SL_SHOTS;
    if (shots) mkdirSync(shots, { recursive: true });
    const w = await setup(page, 7);
    await page.evaluate(() => {
      const p = (window as unknown as Dbg).__starlanternDebug.game.state.party;
      p.recruited = ['hero', 'rin', 'liz', 'sylvie', 'selene'];
      p.grid = ['hero', 'liz', null, null, 'rin', null, 'sylvie', null, 'selene'];
    });
    await depart(page, w);
    for (let i = 0; i < 200 && !(await page.locator('.slx-battle').isVisible()); i++) {
      await w.key(i % 2 ? 'ArrowLeft' : 'ArrowRight');
      await w.closeTalk();
      if (await page.locator('.slx-confirm').isVisible()) await w.key('Enter');
      if (await page.locator('.slx-event').isVisible()) await w.key('Escape');
    }
    await expect(page.locator('.slx-battle')).toBeVisible();
    // Liz holds seven coins; Sylvie has two stacks on the first foe and Liz has appraised it; the foes are harmless.
    await game((g) => {
      const liz = g.battle.party.find((c: any) => c.key === 'liz');
      const sylvie = g.battle.party.find((c: any) => c.key === 'sylvie');
      const live = g.battle.enemies.filter((e: any) => e.alive);
      for (const e of live) { e.max.hp = 9999; e.hp = 9999; e.max.atk = 1; e.max.mag = 1; }
      liz.mech = { kind: 'coins', coins: 7 };
      sylvie.mech = { kind: 'aim', target: live[0].key, stacks: 2 };
      live[0].appraised = 'liz';
    });
    const round = () => game((g) => g.battle?.round ?? -1);
    for (let i = 0; i < 60 && (await round()) === 0; i++) {
      if (await page.locator('.slx-bcmd [role=option]').count()) await w.choose('.slx-bcmd', '防禦');
      else await page.waitForTimeout(50);
    }
    await expect(page.locator('.slx-bcmd [role=option]').first()).toBeVisible();
    await expect(page.locator('.slx-partybar [data-key=liz] .slx-mech-coins')).toHaveText('銅板7');
    const words = await page.evaluate(() => {
      const d = (window as unknown as { __starlanternDebug: { game: any; stage: any } }).__starlanternDebug;
      return d.stage.battleView.ailmentTexts(d.game.battle.enemies.find((e: any) => e.alive).key).map((t: { text: string }) => t.text);
    });
    expect(words.slice(0, 2)).toEqual(['瞄準2', '估價']);   // the setups in their order: 暗記, 瞄準, 估價, 弱點
    if (shots) { await page.waitForTimeout(500); await page.screenshot({ path: `${shots}/coins-aim-1280.png` }); }
    await fitTo(page, 844, 390);
    if (shots) { await page.waitForTimeout(500); await page.screenshot({ path: `${shots}/coins-aim-844.png` }); }
    await fitTo(page, 390, 844);
    const row = page.locator('.slx-partybar [data-key=liz] .slx-pm-ail');
    const fit = await row.evaluate((r) => ({ scroll: r.scrollWidth, client: r.clientWidth }));
    expect(fit.client).toBeGreaterThan(0);   // the row is there (a hidden row would pass vacuously)
    expect(fit.scroll).toBeLessThanOrEqual(fit.client);
    expect(w.errors).toEqual([]);
    expect(missing).toEqual([]);
  });

  test('embers and the beat show on the battle screen (plan 8c)', async ({ page }) => {
    await fitTo(page, 1280, 720);
    const missing: string[] = [];
    page.on('response', (r) => { if (r.status() === 404) missing.push(r.url()); });
    const game = <T, A = undefined>(fn: (g: any, a: A) => T, arg?: A): Promise<T> =>
      page.evaluate(([src, a]) => new Function('g', 'a', `return (${src})(g, a)`)((window as unknown as Dbg).__starlanternDebug.game, a), [fn.toString(), arg] as [string, unknown]) as Promise<T>;
    const shots = process.env.SL_SHOTS;
    if (shots) mkdirSync(shots, { recursive: true });
    const w = await setup(page, 7);
    await page.evaluate(() => {
      const p = (window as unknown as Dbg).__starlanternDebug.game.state.party;
      p.recruited = ['hero', 'scarlet', 'safira', 'chizuru', 'selene'];
      p.grid = ['scarlet', 'safira', null, 'hero', null, null, 'chizuru', null, 'selene'];
    });
    await depart(page, w);
    for (let i = 0; i < 200 && !(await page.locator('.slx-battle').isVisible()); i++) {
      await w.key(i % 2 ? 'ArrowLeft' : 'ArrowRight');
      await w.closeTalk();
      if (await page.locator('.slx-confirm').isVisible()) await w.key('Enter');
      if (await page.locator('.slx-event').isVisible()) await w.key('Escape');
    }
    await expect(page.locator('.slx-battle')).toBeVisible();
    // Scarlet holds 20 embers, covers Safira and has 贖火 up; Safira is on her first beat after an attack; the foes are harmless.
    await game((g) => {
      const scarlet = g.battle.party.find((c: any) => c.key === 'scarlet');
      const safira = g.battle.party.find((c: any) => c.key === 'safira');
      for (const e of g.battle.enemies.filter((x: any) => x.alive)) { e.max.hp = 9999; e.hp = 9999; e.max.atk = 1; e.max.mag = 1; }
      scarlet.mech = { kind: 'embers', embers: 20 };   // under her cap (half her max HP); a 1-damage blow keeps none
      scarlet.cover = { ally: 'safira', turns: 3 };
      scarlet.riposte = { power: 80, turns: 3 };
      safira.mech = { kind: 'beat', beat: 1, last: 'attack' };
    });
    const round = () => game((g) => g.battle?.round ?? -1);
    // Everyone defends through one round: Safira's defend is a new move (the beat goes to 2); cover and 贖火 count down.
    for (let i = 0; i < 60 && (await round()) === 0; i++) {
      if (await page.locator('.slx-bcmd [role=option]').count()) await w.choose('.slx-bcmd', '防禦');
      else await page.waitForTimeout(50);
    }
    await expect(page.locator('.slx-bcmd [role=option]').first()).toBeVisible();
    // The rows only (a 贖火 counter's cue may still be rising over Scarlet's panel, in the same colour).
    const row = (key: string) => page.locator(`.slx-partybar [data-key=${key}] .slx-pm-ail`).locator('.slx-mech, .slx-ail');
    await expect(row('safira')).toHaveText(['拍子2', '受護']);
    await expect(row('scarlet')).toHaveText(['餘燼20', '贖火2', '代受']);
    await expect(page.locator('.slx-partybar [data-key=scarlet] .slx-pm-ail .slx-mech-embers')).toHaveCount(3);
    await expect(page.locator('.slx-partybar [data-key=safira] .slx-pm-ail .slx-mech-embers')).toHaveText('受護');
    if (shots) { await page.waitForTimeout(500); await page.screenshot({ path: `${shots}/embers-beat-1280.png` }); }
    await fitTo(page, 844, 390);
    if (shots) { await page.waitForTimeout(500); await page.screenshot({ path: `${shots}/embers-beat-844.png` }); }
    await fitTo(page, 390, 844);
    for (const key of ['scarlet', 'safira']) {
      const fit = await page.locator(`.slx-partybar [data-key=${key}] .slx-pm-ail`).evaluate((r) => ({ scroll: r.scrollWidth, client: r.clientWidth }));
      expect(fit.client, key).toBeGreaterThan(0);
      expect(fit.scroll, key).toBeLessThanOrEqual(fit.client);
    }
    expect(w.errors).toEqual([]);
    expect(missing).toEqual([]);
  });

  test('devices and the echo command show on the battle screen (plan 8c)', async ({ page }) => {
    await fitTo(page, 1280, 720);
    const missing: string[] = [];
    page.on('response', (r) => { if (r.status() === 404) missing.push(r.url()); });
    const game = <T, A = undefined>(fn: (g: any, a: A) => T, arg?: A): Promise<T> =>
      page.evaluate(([src, a]) => new Function('g', 'a', `return (${src})(g, a)`)((window as unknown as Dbg).__starlanternDebug.game, a), [fn.toString(), arg] as [string, unknown]) as Promise<T>;
    const shots = process.env.SL_SHOTS;
    if (shots) mkdirSync(shots, { recursive: true });
    const w = await setup(page, 7);
    await page.evaluate(() => {
      const p = (window as unknown as Dbg).__starlanternDebug.game.state.party;
      p.recruited = ['hero', 'bobby', 'noel', 'chizuru', 'selene'];
      p.grid = ['hero', 'noel', null, 'bobby', null, null, 'chizuru', null, 'selene'];
    });
    await depart(page, w);
    for (let i = 0; i < 200 && !(await page.locator('.slx-battle').isVisible()); i++) {
      await w.key(i % 2 ? 'ArrowLeft' : 'ArrowRight');
      await w.closeTalk();
      if (await page.locator('.slx-confirm').isVisible()) await w.key('Enter');
      if (await page.locator('.slx-event').isVisible()) await w.key('Escape');
    }
    await expect(page.locator('.slx-battle')).toBeVisible();
    // Bobby has a turret up, and a shield generator; the foes are harmless and use no skill.
    await game((g) => {
      const bobby = g.battle.party.find((c: any) => c.key === 'bobby');
      for (const e of g.battle.enemies.filter((x: any) => x.alive)) {
        e.max.hp = 9999; e.hp = 9999; e.max.atk = 1; e.max.mag = 1;
        if (g.battle.enemyDefs?.[e.key]) g.battle.enemyDefs[e.key] = { ...g.battle.enemyDefs[e.key], skills: [] };   // no acid, no ailment
        g.battle.intents[e.key] = { kind: 'attack', target: g.battle.intents[e.key]?.target };
      }
      bobby.poison = true;   // two devices and an ailment: one row
      bobby.mech = { kind: 'devices', cap: 2, devices: [
        { skill: 'turret', kind: 'turret', power: 38, level: 1, turns: 3 },
        { skill: 'barrier', kind: 'shield', power: 40, level: 2, turns: 3 },
      ] };
    });
    const round = () => game((g) => g.battle?.round ?? -1);
    // Everyone defends through one round: the devices run and count down.
    for (let i = 0; i < 60 && (await round()) === 0; i++) {
      if (await page.locator('.slx-bcmd [role=option]').count()) await w.choose('.slx-bcmd', '防禦');
      else await page.waitForTimeout(50);
    }
    await expect(page.locator('.slx-bcmd [role=option]').first()).toBeVisible();
    const words = page.locator('.slx-partybar [data-key=bobby] .slx-pm-ail').locator('.slx-mech, .slx-ail');
    await expect(words).toHaveText(['砲台1・2', '+2']);
    // The hero's command list: 殘響, greyed with nothing to repeat; then named once Noel's skill is on record.
    const heroTurn = async () => {
      for (let i = 0; i < 6 && !((await page.locator('.slx-bcmd .slx-who').textContent()) ?? '').startsWith('洛恩'); i++) await w.choose('.slx-bcmd', '防禦');
      await expect(page.locator('.slx-bcmd .slx-who')).toHaveText('洛恩 的行動');
    };
    await heroTurn();
    const echo = page.locator('.slx-bcmd [role=option]', { hasText: '殘響' });
    await expect(echo).toHaveAttribute('aria-disabled', 'true');
    await expect(echo.locator('.slx-label')).toHaveText('殘響');
    if (shots) { await page.waitForTimeout(500); await page.screenshot({ path: `${shots}/devices-echo-1280.png` }); }
    await game((g) => {
      const def = { id: 'fire-star', name: '火之星彈', owner: 'noel', tp: 5, target: 'enemy', desc: '', effects: [{ kind: 'damage', power: 140, element: 'fire', scale: 'mag', melee: false }] };
      g.battle.echo = { by: 'noel', round: g.battle.round, def, cost: 5 };
    });
    await fitTo(page, 844, 390);
    // On to the next member and back, so the hero's list is drawn again with the record.
    await w.choose('.slx-bcmd', '防禦');
    await w.key('Escape');
    await heroTurn();
    await expect(echo.locator('.slx-label')).toHaveText('殘響：火之星彈');
    await expect(echo).toHaveAttribute('aria-disabled', 'false');
    if (shots) { await page.waitForTimeout(500); await page.screenshot({ path: `${shots}/devices-echo-844.png` }); }
    await fitTo(page, 390, 844);
    await expect(words).toHaveText(['砲台1・2', '+2']);   // measured on the page: they still fit
    const fit = await page.locator('.slx-partybar [data-key=bobby] .slx-pm-ail').evaluate((r) => ({ scroll: r.scrollWidth, client: r.clientWidth }));
    expect(fit.client).toBeGreaterThan(0);   // the row is there (a hidden row would pass vacuously)
    expect(fit.scroll).toBeLessThanOrEqual(fit.client);
    expect(w.errors).toEqual([]);
    expect(missing).toEqual([]);
  });

  for (const [label, lineup] of [['a', ['hero', 'noel', 'chizuru', 'liz', 'sylvie']], ['b', ['scarlet', 'selene', 'safira', 'bobby', 'rin']]] as const) {
    test(`every mechanic beside the ailments, over four foes (plan 8c final, lineup ${label})`, async ({ page }) => {
      await fitTo(page, 1280, 720);
      const missing: string[] = [];
      page.on('response', (r) => { if (r.status() === 404) missing.push(r.url()); });
      const game = <T, A = undefined>(fn: (g: any, a: A) => T, arg?: A): Promise<T> =>
        page.evaluate(([src, a]) => new Function('g', 'a', `return (${src})(g, a)`)((window as unknown as Dbg).__starlanternDebug.game, a), [fn.toString(), arg] as [string, unknown]) as Promise<T>;
      const shots = process.env.SL_SHOTS;
      if (shots) mkdirSync(shots, { recursive: true });
      const w = await setup(page, 7);
      await page.evaluate((ids) => {
        const g = (window as unknown as Dbg).__starlanternDebug.game;
        const p = g.state.party;
        p.recruited = [...new Set([...p.recruited, ...ids])];
        p.grid = [ids[0], ids[1], null, ids[2], null, null, ids[3], null, ids[4]];
        // The first fight is four foes.
        const start = g.startBattle.bind(g);
        g.startBattle = (_ids: string[], ...rest: unknown[]) => start(['slime', 'slime', 'slime', 'slime'], ...rest);
      }, [...lineup]);
      await depart(page, w);
      for (let i = 0; i < 200 && !(await page.locator('.slx-battle').isVisible()); i++) {
        await w.key(i % 2 ? 'ArrowLeft' : 'ArrowRight');
        await w.closeTalk();
        if (await page.locator('.slx-confirm').isVisible()) await w.key('Enter');
        if (await page.locator('.slx-event').isVisible()) await w.key('Escape');
      }
      await expect(page.locator('.slx-battle')).toBeVisible();
      expect(await game((g) => g.battle.enemies.length)).toBe(4);
      // Every member's mechanic up, two ailments each (one of them a sleep or a freeze on two of them); every foe with
      // the party's setups on it and three ailments; the foes harmless and skill-less, so the round leaves it as set.
      await game((g) => {
        const b = g.battle;
        const foes = b.enemies;
        for (const e of foes) {
          e.max.hp = 9999; e.hp = 9999; e.max.atk = 1; e.max.mag = 1;
          if (b.enemyDefs?.[e.key]) b.enemyDefs[e.key] = { ...b.enemyDefs[e.key], skills: [] };
          b.intents[e.key] = { kind: 'attack', target: b.intents[e.key]?.target };
          e.poison = true; e.burn = { tick: 1, turns: 3, src: 'x' }; e.shock = 3;
          e.exposed = 3; e.appraised = 'liz';
        }
        foes[0].delay = b.round + 9;
        const mechs: Record<string, unknown> = {
          noel: { kind: 'heat', heat: 3 }, rin: { kind: 'mark', marks: [foes[0].key], cap: 1 }, chizuru: { kind: 'barrier' },
          liz: { kind: 'coins', coins: 7 }, sylvie: { kind: 'aim', target: foes[1].key, stacks: 2 }, scarlet: { kind: 'embers', embers: 20 },
          safira: { kind: 'beat', beat: 1, last: 'attack' },
          bobby: { kind: 'devices', cap: 2, devices: [{ skill: 'turret', kind: 'turret', power: 38, level: 2, turns: 3 }, { skill: 'repair-drone', kind: 'drone', power: 45, level: 1, turns: 3 }] },
        };
        b.party.forEach((c: any, i: number) => {
          if (mechs[c.key]) c.mech = mechs[c.key];
          c.poison = true;
          if (c.key === 'scarlet') { c.riposte = { power: 80, turns: 3 }; c.cover = { ally: b.party[1].key, turns: 3 }; }
          if (c.key === 'rin') c.veil = 2;
        });
        if (b.party.some((c: any) => c.key === 'chizuru')) b.barriers = [{ skill: 'ward', kind: 'guard', power: 30, turns: 3, src: 'chizuru' }];
      });
      // Everyone who can defends through one round, so every panel is drawn with its words.
      const round = () => game((g) => g.battle?.round ?? -1);
      for (let i = 0; i < 60 && (await round()) === 0; i++) {
        if (await page.locator('.slx-bcmd [role=option]').count()) await w.choose('.slx-bcmd', '防禦');
        else await page.waitForTimeout(50);
      }
      await expect(page.locator('.slx-bcmd [role=option]').first()).toBeVisible();
      // Then a sleep and a freeze (a round would wake and thaw them), drawn by stepping on to the next member and back.
      await game((g) => { g.battle.party[1].sleep = 3; g.battle.party[3].frozen = true; g.battle.party[3].burn = { tick: 1, turns: 3, src: 'x' }; });
      await w.choose('.slx-bcmd', '防禦');
      await w.key('Escape');
      for (const size of [{ width: 1280, height: 720 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(size);
        await page.waitForTimeout(400);
        // Every member's row on one line inside its panel, a freeze or a sleep never folded away.
        const rows = await page.locator('.slx-partybar .slx-pm-ail').evaluateAll((rs) => rs.map((r) => ({
          scroll: r.scrollWidth, client: r.clientWidth, words: [...r.children].map((c) => c.textContent),
        })));
        expect(rows).toHaveLength(5);
        for (const r of rows) { expect(r.client, JSON.stringify(r)).toBeGreaterThan(0); expect(r.scroll, JSON.stringify(r)).toBeLessThanOrEqual(r.client); }
        expect(rows.flatMap((r) => r.words).filter((t) => t === '凍結' || /^睡眠\d$/.test(t ?? ''))).toHaveLength(2);
        // Every foe's row: the setups first, capped with +N, one line inside its slot.
        const foeRows = await page.evaluate(() => {
          const d = (window as unknown as { __starlanternDebug: { game: any; stage: any } }).__starlanternDebug;
          return d.game.battle.enemies.map((e: any) => d.stage.battleView.ailmentTexts(e.key).map((t: { text: string }) => t.text));
        });
        expect(foeRows).toHaveLength(4);
        for (const r of foeRows) { expect(r.length).toBeGreaterThan(0); expect(r.at(-1)).toMatch(/^\+\d+$/); }
        if (shots) await page.screenshot({ path: `${shots}/final-${label}-${size.width}.png` });
      }
      expect(w.errors).toEqual([]);
      expect(missing).toEqual([]);
    });
  }

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
    await fitTo(page, 1280, 720);
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
    await expect(page.locator('.slx-dungeon .slx-talk .slx-text')).toHaveText(FOUND_LINE);   // the found line names nobody (story polish Task 1)
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
    expect(plates, 'Selene speaks in her own meeting, under a plate that does not name her yet').toContain(T.ui2.rescue.stranger);
    expect(plates, 'her name waits for her own words').not.toContain('瑟蕾');
    await game((g) => { for (const e of g.battle.enemies) { e.hp = 0; e.alive = false; } });
    for (let i = 0; i < 40 && !(await page.locator('.slx-result').isVisible()); i++) {
      if (await page.locator('.slx-bcmd [role=option]').count()) { await w.key('ArrowUp'); await w.key('Enter'); }   // 全員攻擊
      else await page.waitForTimeout(50);
    }
    await expect(page.locator('.slx-result')).toContainText('勝利');
    await expect(page.locator('.slx-result')).not.toContainText('加入了隊伍');   // the list keeps to the spoils (story polish Task 1)
    await shot('04-rescue-result');
    await w.key('Enter');   // 繼續: she speaks in the battle's dialogue box, and joins after her last line
    const talk = page.locator('.slx-battle .slx-talk');
    await expect(talk.locator('.slx-name')).toHaveText('瑟蕾');   // she says her name in her first line after the fight
    await expect(talk.locator('.slx-talk-face')).toBeVisible();
    await shot('04b-rescue-talk');
    if (process.env.SL_SHOTS) {   // the same line inside a phone screen, for the record
      await fitTo(page, 390, 844);
      await shot('04c-rescue-talk-phone');
      await fitTo(page, 1280, 720);
    }
    const join = /^瑟蕾（Lv\d+）加入了隊伍！$/;
    for (let i = 0; i < 12 && !join.test((await talk.locator('.slx-text').textContent()) ?? ''); i++) { await w.key('z'); await page.waitForTimeout(60); }
    await expect(talk.locator('.slx-text')).toHaveText(join);
    await expect(talk.locator('.slx-name')).toBeHidden();   // the narrator says it
    await w.key('z');
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

  test('a memory found in the labyrinth shows its caption and the map stays (story L)', async ({ page }) => {
    await fitTo(page, 1280, 720);
    /** Runs `fn` in the page on the live game (the debug hook), with one serialisable argument. */
    const game = <T, A = undefined>(fn: (g: any, a: A) => T, arg?: A): Promise<T> =>
      page.evaluate(([src, a]) => new Function('g', 'a', `return (${src})(g, a)`)((window as unknown as Dbg).__starlanternDebug.game, a), [fn.toString(), arg] as [string, unknown]) as Promise<T>;
    const w = await setup(page, 7);
    await depart(page, w);
    // Rin's glimmer on the first floor: stand two cells off in a straight line, step twice.
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
    await game((g) => { g.encounter = 0; });
    await page.keyboard.press(glimmer!.key);
    const caption = page.locator('.slx-dungeon .slx-talk:not([hidden]) .slx-text');
    await expect(caption).toHaveText(T.ui2.memory.recalled(CHARACTERS.rin.name));
    await expect(page.locator('.slx-talk--memory')).toHaveCount(0);
    for (let i = 0; i < 6 && (await page.locator('.slx-dungeon .slx-talk').isVisible()); i++) { await w.key('z'); await page.waitForTimeout(60); }
    await expect(page.locator('.slx-dungeon .slx-talk')).toBeHidden();
    await expect(page.locator('.slx-talk--memory')).toHaveCount(0);   // no memory scene follows the caption
    await expect(page.locator('.slx-dungeon')).toBeVisible();
    await expect(page.locator('.slx-dungeon .slx-pad')).not.toHaveClass(/slx-cmd-hidden/);
    const st = await game((g) => ({ phase: g.phase, untold: g.state.story.untold, seen: g.state.story.seen, memories: g.state.party.roster.rin.memories }));
    expect(st).toMatchObject({ phase: 'map', untold: [memScene('rin', 1)], memories: 1 });
    expect(st.seen).not.toContain(memScene('rin', 1));
    expect(w.errors).toEqual([]);
  });

  test('B1: on a return to town, Noel and Rin talk among themselves after the chat, and the town menu waits for them', async ({ page }) => {
    test.setTimeout(120_000);
    await fitTo(page, 1280, 720);
    const game = <T, A = undefined>(fn: (g: any, a: A) => T, arg?: A): Promise<T> =>
      page.evaluate(([src, a]) => new Function('g', 'a', `return (${src})(g, a)`)((window as unknown as Dbg).__starlanternDebug.game, a), [fn.toString(), arg] as [string, unknown]) as Promise<T>;
    const w = await setup(page, 7, { story: 'all' });
    const talkText = page.locator('.slx-town .slx-talk .slx-text');
    const playOut = async () => {
      for (let quiet = 0, i = 0; quiet < 4 && i < 400; i++) {
        if (await page.locator('.slx-talk').first().isVisible()) { quiet = 0; await page.keyboard.press('z'); await page.waitForTimeout(30); }
        else if ((await page.locator('.slx-cmd-hidden').count()) > 0) { quiet = 0; await page.waitForTimeout(60); }
        else { quiet++; await page.waitForTimeout(60); }
      }
      await expect(page.locator('.slx-talk').first()).toBeHidden();
    };
    await playOut();   // the prologue and the inn night
    // Noel joins (as a won rescue would leave her), so the two of them are met.
    const party = await game((g) => JSON.parse(JSON.stringify(g.state.party)));
    await game((g, p) => { g.state.party = p; }, meet(party, 'noel', 1));
    const id = 'banter:noel-rin:1';
    const banter = STORY.scenes[id];
    await depart(page, w);
    await game((g) => { g.state.inventory['return-lamp'] = 1; });
    await lampHome(page, w);
    // The arrival: the chat first (if one is due), then this one banter, last; nothing else is a banter.
    const arrival = await game((g) => [...g.arrival]);
    expect(arrival.at(-1)).toBe(id);
    expect(arrival.filter((x: string) => x.startsWith('banter:'))).toEqual([id]);
    expect(arrival.slice(0, -1).every((x: string) => x.startsWith('chat:'))).toBe(true);
    await expect(page.locator('.slx-town-menu')).toHaveClass(/slx-cmd-hidden/);
    // Its lines play in order on the town's dialogue box, under their speakers' names, while the menu stays hidden.
    const spoken = banter.lines.filter((l) => l.who !== 'narrator');
    let at = 0;
    for (let i = 0; i < 80 && at < spoken.length; i++) {
      const text = (await talkText.textContent()) ?? '';
      if (text === spoken[at].text) {
        await expect(page.locator('.slx-town .slx-talk .slx-name')).toHaveText(CHARACTERS[spoken[at].who as keyof typeof CHARACTERS].name);
        await expect(page.locator('.slx-town-menu')).toHaveClass(/slx-cmd-hidden/);
        at++;
      }
      if (at < spoken.length) { await w.key('z'); await page.waitForTimeout(60); }
    }
    expect(at, 'every spoken line of the banter showed, in order').toBe(spoken.length);
    await playOut();
    await expect(page.locator('.slx-town-menu')).not.toHaveClass(/slx-cmd-hidden/);
    const after = await game((g) => ({ seen: g.state.story.seen, queue: g.state.story.queue, arrival: g.arrival }));
    expect(after.seen).toContain(id);
    expect(after.queue).toEqual([]);
    expect(after.arrival).toEqual([]);
    expect(w.errors).toEqual([]);
  });

  test('in the labyrinth: wear a found piece, move a row and heal with a skill', async ({ page }) => {
    test.setTimeout(120_000);
    await fitTo(page, 1280, 720);
    const game = <T, A = undefined>(fn: (g: any, a: A) => T, arg?: A): Promise<T> =>
      page.evaluate(([src, a]) => new Function('g', 'a', `return (${src})(g, a)`)((window as unknown as Dbg).__starlanternDebug.game, a), [fn.toString(), arg] as [string, unknown]) as Promise<T>;
    const w = await setup(page, 7, { story: 'all' });
    const playOut = async () => {
      for (let quiet = 0, i = 0; quiet < 4 && i < 400; i++) {
        if (await page.locator('.slx-talk').first().isVisible()) { quiet = 0; await page.keyboard.press('z'); await page.waitForTimeout(30); }
        else if ((await page.locator('.slx-cmd-hidden').count()) > 0) { quiet = 0; await page.waitForTimeout(60); }
        else { quiet++; await page.waitForTimeout(60); }
      }
      await expect(page.locator('.slx-talk').first()).toBeHidden();
    };
    /** The topmost window of the labyrinth's menu stack. */
    const top = () => page.locator('.slx-dungeon .slx-layer').last();
    const option = (label: string) => top().locator('[role=option]').filter({ has: page.locator('.slx-label', { hasText: new RegExp(`^${label}$`) }) });

    // 1. The prologue and the inn night play out; Selene joins (as a won rescue would leave her), then the party sets out.
    await playOut();
    const party = await game((g) => JSON.parse(JSON.stringify(g.state.party)));
    await game((g, p) => { g.state.party = p; }, meet(party, 'selene', 1));
    await depart(page, w);
    await playOut();

    // 2. A weapon in the run pack, Selene on the field knowing 月光, and the hero at 1 HP.
    const uid: number = await game((g) => {
      const uid = g.mintUid();
      g.run.loot.gear.push({ uid, base: 'thorn-spear', rarity: 'common', ilvl: 5, enhance: 0, affixes: [] });
      const p = g.state.party;
      if (!p.grid.includes('selene')) p.grid[p.grid.indexOf(null)] = 'selene';
      p.roster.selene.tree.moonlight = 1;
      p.roster.hero.hp = 1;
      g.encounter = 0;
      return uid;
    });
    expect(await game((g) => g.state.party.grid.includes('selene'))).toBe(true);

    // 3. C → 裝備: the piece from the run pack goes on, and the doll's weapon slot names it. Esc is back in the labyrinth.
    await w.key('c');
    await w.choose('.slx-field-menu', '裝備');
    await expect(page.locator('.slx-equip-scene')).toBeVisible();
    const weapon = page.locator('.slx-doll-slot[data-slot=weapon]');
    await expect(weapon).not.toHaveAttribute('aria-label', /荊棘槍/);
    await page.locator('.slx-bag-cell[aria-label="荊棘槍"]').click();
    await expect(weapon).toHaveAttribute('aria-label', /荊棘槍/);
    expect(await game((g, u) => g.state.party.roster.hero.equip.weapon?.uid === u && !g.run.loot.gear.some((it: any) => it.uid === u), uid)).toBe(true);
    await w.key('Escape');
    await expect(page.locator('.slx-dungeon')).toBeVisible();

    // 4. C → 隊形: two members trade cells. Esc is back in the labyrinth.
    const before: (string | null)[] = await game((g) => [...g.state.party.grid]);
    const [a, b] = before.flatMap((id, i) => (id ? [i] : [])).slice(0, 2);
    await w.key('c');
    await w.choose('.slx-field-menu', '隊形');
    await expect(page.locator('.slx-formation-scene')).toBeVisible();
    await page.locator(`.slx-formation-scene [data-cell="${a}"]`).click();
    await page.locator('.slx-formation-pick [role=option]').filter({ hasText: CHARACTERS[before[b] as keyof typeof CHARACTERS].name }).click();
    const after: (string | null)[] = await game((g) => [...g.state.party.grid]);
    expect([after[a], after[b]]).toEqual([before[b], before[a]]);
    await w.key('Escape');
    await expect(page.locator('.slx-dungeon')).toBeVisible();

    // 5. C → 技能 → 瑟蕾 → 月光 → 洛恩: the hero's HP goes up, on the party bar too.
    await w.key('c');
    await w.choose('.slx-field-menu', T.ui2.dungeon.skills);
    await expect(top().locator('.slx-who')).toHaveText(T.ui2.dungeon.castWho);
    await option(CHARACTERS.selene.name).click();
    await expect(top().locator('.slx-who')).toHaveText(T.ui2.dungeon.castWhat(CHARACTERS.selene.name));
    await option(SKILLS.moonlight.name).click();
    await expect(top().locator('.slx-who')).toHaveText(T.ui2.dungeon.castOn(SKILLS.moonlight.name));
    await option(CHARACTERS.hero.name).click();
    await expect(page.locator('.slx-dungeon .slx-talk .slx-text')).toContainText(T.ui2.dungeon.cast(CHARACTERS.selene.name, SKILLS.moonlight.name));
    const hp: number = await game((g) => g.state.party.roster.hero.hp);
    expect(hp).toBeGreaterThan(1);
    await expect(page.locator('.slx-dungeon .slx-pm[data-key=hero] [role=meter]').first()).toHaveAttribute('aria-valuenow', String(hp));
    await w.closeTalk();

    // 7. Home with the lamp (an arrival chat and a banter may play first): the weapon worn in the labyrinth is still worn.
    await game((g) => { g.state.inventory['return-lamp'] = 1; });
    await lampHome(page, w);
    await playOut();
    expect(await game((g, u) => g.state.party.roster.hero.equip.weapon?.uid === u, uid)).toBe(true);

    // 6. No console error all the way.
    expect(w.errors).toEqual([]);
  });

  test("prologue, Rin's first memory, Selene, recall, handbook, Rin's reveal and Scarlet's fight", async ({ page }) => {
    test.setTimeout(300_000);
    await fitTo(page, 1280, 720);
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
    // Story L: the glimmer says who remembered something, and no memory plays here; it is told at night in town.
    await expect(page.locator('.slx-dungeon .slx-talk:not([hidden]) .slx-text')).toHaveText(T.ui2.memory.recalled(CHARACTERS.rin.name));
    await shot('03-memory-caption');
    await playOut();
    await expect(page.locator('.slx-talk--memory')).toHaveCount(0);
    await expect(page.locator('.slx-dungeon')).toBeVisible();
    const rin1 = await game((g) => ({ memories: g.state.party.roster.rin.memories, seen: g.state.story.seen, untold: g.state.story.untold }));
    expect(rin1.memories).toBe(1);
    expect(rin1.untold).toEqual([memScene('rin', 1)]);
    expect(rin1.seen).not.toContain(memScene('rin', 1));

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
    await expect(page.locator('.slx-result')).not.toContainText('加入了隊伍');   // said after 繼續 (story polish Task 1)
    await shot('07-rescue-result');
    await w.key('Enter');
    {
      const talk = page.locator('.slx-battle .slx-talk');
      const join = /^瑟蕾（Lv\d+）加入了隊伍！$/;
      await expect(talk).toBeVisible();
      for (let i = 0; i < 12 && !join.test((await talk.locator('.slx-text').textContent()) ?? ''); i++) { await w.key('z'); await page.waitForTimeout(60); }
      await expect(talk.locator('.slx-text')).toHaveText(join);
      await w.key('z');
    }
    await expect(page.locator('.slx-dungeon')).toBeVisible();
    await playOut();
    expect(await game((g) => g.state.party.recruited)).toEqual(['hero', 'rin', 'selene']);

    // 5. Home with the lamp, after the party's first won fight: the first-return scene opens the arrival, ahead of any return
    // chat, while the town menu waits (Task 10b). It plays with its portraits in the screen. Then Selene to the bench and back.
    await game((g) => { g.state.inventory['return-lamp'] = 1; });
    await lampHome(page, w);
    const homeArrival = await game((g) => g.arrival);
    expect(homeArrival[0]).toBe('first-return');
    expect(homeArrival.slice(1).every((id: string) => /^(chat|banter):/.test(id))).toBe(true);   // B1: a banter may follow the chat
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
      g.state.story.untold = (g.state.story.untold ?? []).filter((id: string) => !ids.includes(id));   // story L: told, so no longer untold
      g.state.story.tonight = (g.state.story.tonight ?? []).filter((id: string) => !ids.includes(id));
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
    // Story L: her memory no longer plays in the labyrinth, so its portrait checks are made on the handbook's replay.
    // The memory opens on its remembered past (narration, no face): advance to Rin's first spoken line, said now (story
    // staging S5: the plain look), then her portrait must be on the box.
    await expect(page.locator('.slx-handbook .slx-talk.slx-talk--memory')).toBeVisible();
    {
      const rinFirst = STORY.scenes[memScene('rin', 1)].lines.find((l) => l.who === 'rin')!;
      const memoryText = page.locator('.slx-handbook .slx-talk:not([hidden]) .slx-text');
      for (let i = 0; i < 20 && !((await memoryText.textContent()) ?? '').includes(rinFirst.text); i++) { await w.key('z'); await page.waitForTimeout(60); }
      await expect(memoryText).toHaveText(rinFirst.text);
      await expect(page.locator('.slx-handbook .slx-talk .slx-name')).toHaveText(CHARACTERS.rin.name);
      await expect(page.locator('.slx-handbook .slx-talk img.slx-talk-face[src$="/char/rin-portrait.png"]')).toBeVisible();
      // Task 10a: the portrait stands at least twice its old 96px (on-screen, at the page's own scale), and clear of the text and the name plate.
      const scr = (await box(page))!;
      const k = (await stageScale(page)).s;   // the stage scale as drawn (legibility 2a)
      const face = (await page.locator('.slx-handbook .slx-talk img.slx-talk-face').boundingBox())!;
      const textBox = (await memoryText.boundingBox())!;
      const nameBox = (await page.locator('.slx-handbook .slx-talk .slx-name').boundingBox())!;
      expect(face.height).toBeGreaterThanOrEqual(2 * 96 * k - 0.5);
      expect(face.width).toBeGreaterThanOrEqual(2 * 96 * k - 0.5);
      const clear = (a: { x: number; y: number; width: number; height: number }, b: typeof a) => a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
      expect(clear(face, textBox), 'portrait clear of the dialogue text').toBe(true);
      expect(clear(face, nameBox), 'portrait clear of the name plate').toBe(true);
      expect(face.y).toBeGreaterThanOrEqual(scr.y - 0.5);
      expect(face.x).toBeGreaterThanOrEqual(scr.x - 0.5);
      expect(face.x + face.width).toBeLessThanOrEqual(scr.x + scr.width + 0.5);
      await shot('03-memory-scene');
      // Every line of the memory, wrapped or not: whenever a portrait shows it fits.
      let tallest = 0;
      for (let i = 0; i < 60 && (await page.locator('.slx-handbook.slx-hb-playing').count()) > 0; i++) {
        if (await page.locator('.slx-handbook .slx-talk:not([hidden])').isVisible()) tallest = Math.max(tallest, (await faceFits(page)) ?? 0);
        await w.key('z'); await page.waitForTimeout(40);
      }
      expect(tallest, 'at least one memory line showed a portrait').toBeGreaterThan(0);
    }
    await expect(page.locator('.slx-handbook.slx-hb-playing')).toHaveCount(0);
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

  test('the depth scenes read inside the box, desktop and phone (story depth)', async ({ page }) => {
    test.setTimeout(300_000);
    /** With SL_SHOTS=<dir> each scene leaves its beat there as <scene>-<width>.png; otherwise this is a no-op. */
    const shots = process.env.SL_SHOTS;
    if (shots) mkdirSync(shots, { recursive: true });
    // Instant text, so each line is whole when it is measured (written before setup's own default, which only fills a gap).
    await page.addInitScript(() => {
      if (localStorage.getItem('starlantern-settings') === null) localStorage.setItem('starlantern-settings', JSON.stringify({ volume: 0, textSpeed: 'instant', vibrate: false, story: 'none' }));
    });
    const missing: string[] = [];
    page.on('response', (r) => { if (r.status() === 404) missing.push(r.url()); });
    const H = T.ui2.handbook;
    const banter = (a: string, b: string, n: number) => `banter:${a}-${b}:${n}`;
    /** The beat each scene is shot on (story depth Task 20): the line it must reach, and the file it leaves. */
    const BEATS: [string, RegExp][] = [
      ['rin-confess', /欠我們一句實話/],
      ['hero-alone', /得先過我這裡/],
      [banter('rin', 'scarlet', 2), /第七個晚上/],
      [banter('noel', 'selene', 2), /少掉一點自己/],
      ['finale-cost', /那十段記憶/],
      ['finale', /一張一張淡了/],
      ['epilogue', /第一頁/],
    ];
    for (const [width, height] of [[1280, 720], [390, 844]] as const) {
      await fitTo(page, width, height);
      const w = await setup(page, 7);
      await page.evaluate(() => {
        const s = (window as unknown as Dbg).__starlanternDebug.game.state;
        const all = ['hero', 'rin', 'selene', 'chizuru', 'safira', 'sylvie', 'noel', 'bobby', 'liz', 'scarlet'];
        s.party.recruited = [...all];
        for (const id of all) s.party.roster[id].memories = id === 'scarlet' ? 5 : 2;
        s.party.roster.hero.memories = 9;   // the confession at the dinner (her depth-30 reading waits for his tenth)
        s.party.roster.rin.oath = true;
        s.story.confession = 'dinner';
        s.story.finaleCleared = true;
        s.story.seen = ['prologue', 'prologue-inn', 'first-return', 'rin-reveal', 'rin-confess', 'bellkeeper-arrives', 'hero-alone', 'banter:rin-scarlet:2', 'banter:noel-selene:2', 'finale', 'epilogue'];
        s.story.fresh = [];
        s.story.queue = [];
      });
      await page.locator('.slx-town [data-id=handbook]').click();
      await expect(page.locator('.slx-handbook')).toBeVisible();
      const hbTab = (label: string) => page.locator('.slx-tabs .slx-tab').filter({ hasText: label });
      const pickRow = async (label: string) => {
        for (let i = 0; i < 40; i++) {
          const cur = (await page.locator('.slx-hb-list [aria-selected=true] .slx-label').first().textContent()) ?? '';
          if (cur === label) { await w.key('Enter'); return; }
          await w.key('ArrowDown');
        }
        throw new Error(`no handbook row ${label}`);
      };
      const reached = new Set<string>();
      /** Turns every page of the replay; each line, once still, must sit inside the box, its name plate too. */
      const readThrough = async () => {
        await expect(page.locator('.slx-handbook.slx-hb-playing')).toBeVisible();
        for (let i = 0; i < 80 && (await page.locator('.slx-handbook.slx-hb-playing').count()) > 0; i++) {
          await page.waitForTimeout(120);
          const fit = await page.evaluate(() => {
            const t = document.querySelector<HTMLElement>('.slx-handbook .slx-talk:not([hidden]) .slx-text');
            const n = document.querySelector<HTMLElement>('.slx-handbook .slx-talk:not([hidden]) .slx-name:not([hidden])');
            return { line: t?.textContent ?? '', text: !t || t.scrollHeight <= t.clientHeight + 1, name: !n || n.scrollWidth <= n.clientWidth + 1 };
          });
          expect(fit.text, `${width}: the line fits its box: ${fit.line}`).toBe(true);
          expect(fit.name, `${width}: the name plate fits: ${fit.line}`).toBe(true);
          for (const [scene, re] of BEATS) {
            if (reached.has(scene) || !re.test(fit.line)) continue;
            reached.add(scene);
            if (shots) await page.screenshot({ path: `${shots}/${scene.replace(/:/g, '-')}-${width}.png` });   // no 「:」 in a Windows file name
          }
          await w.key('z');
        }
        await expect(page.locator('.slx-handbook.slx-hb-playing')).toHaveCount(0);
      };
      await hbTab(H.tabs.people).click();
      await pickRow(CHARACTERS.rin.name);
      for (const id of ['rin-confess', 'hero-alone', 'banter:rin-scarlet:2'] as const) { await pickRow(STORY.scenes[id].title); await readThrough(); }
      await page.locator('.slx-back').click();
      await pickRow(CHARACTERS.noel.name);
      await pickRow(STORY.scenes['banter:noel-selene:2'].title);
      await readThrough();
      await page.locator('.slx-back').click();
      await hbTab(H.tabs.truths).click();
      await pickRow(H.stages.after);   // the finale, then the lantern festival (story depth ruling 12)
      await readThrough();
      expect([...reached].sort(), `${width}`).toEqual(BEATS.map(([scene]) => scene).sort());
      expect(w.errors).toEqual([]);
    }
    expect(missing).toEqual([]);
  });

  test('the first boss names its rune on the result, once, inside a phone screen (plan 8f)', async ({ page }) => {
    await fitTo(page, 1280, 720);
    const w = await setup(page, 7);
    await depart(page, w);
    // A boss put next to the party on depth 1: stepping on it starts a boss fight, the first this save has won.
    const key: string = await page.evaluate(() => {
      const g = (window as unknown as Dbg).__starlanternDebug.game;
      const m = g.map();
      const D: [string, number, number][] = [['ArrowUp', 0, -1], ['ArrowDown', 0, 1], ['ArrowLeft', -1, 0], ['ArrowRight', 1, 0]];
      for (const [k, dx, dy] of D) {
        const x = g.pos.x + dx, y = g.pos.y + dy;
        if (m.tiles[y]?.[x] !== 'floor') continue;
        m.tiles[y][x] = 'boss';
        m.boss = { x, y };
        g.encounter = 0;
        return k;
      }
      return '';
    });
    expect(key).not.toBe('');
    await w.closeTalk();
    await page.keyboard.press(key);
    for (let i = 0; i < 14 && !(await page.locator('.slx-battle').isVisible()); i++) { await w.key('z'); await page.waitForTimeout(60); }
    await expect(page.locator('.slx-battle')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as Dbg).__starlanternDebug.game.battle.boss)).toBe(true);
    await page.evaluate(() => { for (const e of (window as unknown as Dbg).__starlanternDebug.game.battle.enemies) { e.hp = 0; e.alive = false; } });
    for (let i = 0; i < 40 && !(await page.locator('.slx-result').isVisible()); i++) {
      if (await page.locator('.slx-bcmd [role=option]').count()) { await w.key('ArrowUp'); await w.key('Enter'); }   // 全員攻擊
      else await page.waitForTimeout(50);
    }
    await expect(page.locator('.slx-result')).toContainText('勝利');
    const rune = page.locator('.slx-result .slx-loot-rune');
    await expect(rune).toHaveCount(1);
    await expect(rune).toHaveText('得到符文：擴散（魔法）');
    await expect(rune).toHaveClass(/slx-rarity-magic/);
    expect(await page.evaluate(() => (window as unknown as Dbg).__starlanternDebug.game.state.runesOpen)).toBe(true);
    for (const [vw, vh] of [[390, 844], [1280, 720]] as const) {
      await fitTo(page, vw, vh);
      await page.waitForTimeout(150);
      const rows = await page.locator('.slx-result-lines p').evaluateAll((ps) => ps.map((p) => ({ t: p.textContent, over: p.scrollWidth > p.clientWidth })));
      expect(rows.filter((r) => r.over), `rows wider than the result at ${vw}`).toEqual([]);
      // The result window itself sits inside the screen.
      const box = (await page.locator('.slx-result').boundingBox())!;
      expect([box.x >= 0, box.y >= 0, box.x + box.width <= vw + 0.5, box.y + box.height <= vh + 0.5], `the result inside ${vw}x${vh}`).toEqual([true, true, true, true]);
      await expect(rune).toHaveCount(1);
    }
    await w.key('Enter');                                   // 繼續: the first rune's tutorial, told once by the narrator (plan 8g)
    const talk = page.locator('.slx-battle .slx-talk');
    await expect(talk).toBeVisible();
    await expect(talk.locator('.slx-text')).toContainText('你得到了符文');
    await w.key('z');                                       // the first page whole (a key finishes the typing)
    await expect(talk.locator('.slx-next')).toBeVisible();
    for (const [vw, vh] of [[390, 844], [844, 390], [1280, 720]] as const) {
      await fitTo(page, vw, vh);
      await page.waitForTimeout(150);
      await expect(page.locator('.slx-battle .slx-msg')).toBeHidden();   // the foes' names gone with the fight
      const screen = (await page.locator('.slx-screen').boundingBox())!;
      const box = (await talk.boundingBox())!;
      expect([box.x >= screen.x - 0.5, box.y >= screen.y - 0.5, box.x + box.width <= screen.x + screen.width + 0.5, box.y + box.height <= screen.y + screen.height + 0.5], `the tutorial inside the stage at ${vw}`).toEqual([true, true, true, true]);
      if (process.env.SL_SHOTS) await page.screenshot({ path: `${process.env.SL_SHOTS}/rune-tutorial-${vw}.png` });
    }
    for (let i = 0; i < 12 && (await talk.isVisible()); i++) await w.key('z');
    await expect(page.locator('.slx-dungeon')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as Dbg).__starlanternDebug.game.state.runeTutorialSeen)).toBe(true);
    await expect(page.locator('.slx-loot-rune')).toHaveCount(0);   // told on the result alone, not again on the map
    expect(await page.evaluate(() => (window as unknown as Dbg).__starlanternDebug.game.state.runes)).toEqual({ 'spread@magic': 1 });
    expect(w.errors).toEqual([]);
  });

  test('the shop sells and buys runes (plan 8f)', async ({ page }) => {
    await fitTo(page, 1280, 720);
    const missing: string[] = [];
    page.on('response', (r) => { if (r.status() === 404 && r.request().resourceType() === 'image') missing.push(r.url()); });
    const w = await setup(page, 7);
    // A save past its first boss: runes open, 500 G and a rare 彈射 in the bag.
    await page.evaluate(() => {
      const g = (window as unknown as Dbg).__starlanternDebug.game;
      g.state.runesOpen = true;
      g.state.gold = 500;
      g.state.runes = { 'bounce@rare': 1 };
    });
    const gold = () => page.evaluate(() => (window as unknown as Dbg).__starlanternDebug.game.state.gold as number);
    await w.choose('.slx-town', '道具店');
    await expect(page.locator('.slx-shop')).toBeVisible(); await w.closeTalk();
    await page.locator('.slx-shop .slx-cmd [data-id=runes]').click();
    const list = page.locator('.slx-rune-list');
    await expect(list.locator('[role=option]')).toHaveCount(6);   // four to buy, the 收購 heading, the bag's 彈射
    await expect(list.locator('[data-id="buy:spread@common"] .slx-right')).toHaveText('100 G　持有 0');
    await expect(list.locator('[data-id="sell:bounce@rare"] .slx-right')).toHaveText('收購 150 G　持有 1');
    const fits = async (where: string) => {
      const rows = await page.locator('.slx-rune-page [role=option], .slx-rune-info p').evaluateAll((els) => els.map((e) => ({ t: e.textContent, over: e.scrollWidth > e.clientWidth + 0.5 })));
      expect(rows.filter((r) => r.over), `rows wider than their box at ${where}`).toEqual([]);
      const page_ = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      expect(page_.sw, `the page scrolls sideways at ${where}`).toBeLessThanOrEqual(page_.cw);
      const box = await page.locator('.slx-rune-page').boundingBox();
      const vp = page.viewportSize()!;
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 0.5);
    };
    await fits('1280');
    if (process.env.SL_SHOTS) await page.screenshot({ path: `${process.env.SL_SHOTS}/rune-shop-1280.png` });
    await fitTo(page, 390, 844);
    await page.waitForTimeout(150);
    await fits('390');
    if (process.env.SL_SHOTS) await page.screenshot({ path: `${process.env.SL_SHOTS}/rune-shop-390.png` });
    await fitTo(page, 1280, 720);
    // Buy one 擴散 (100 G), then sell the 彈射 back (150 G).
    await list.locator('[data-id="buy:spread@common"]').click();
    await expect(page.locator('.slx-qty')).toBeVisible();
    await w.key('Enter');
    await expect.poll(gold).toBe(400);
    await w.closeTalk();
    await expect(list.locator('[data-id="buy:spread@common"] .slx-right')).toHaveText('100 G　持有 1');
    await list.locator('[data-id="sell:bounce@rare"]').click();
    await expect(page.locator('.slx-qty')).toBeVisible();
    await w.key('Enter');
    await expect.poll(gold).toBe(550);
    await w.closeTalk();
    await expect(list.locator('[data-id="sell:bounce@rare"]')).toHaveCount(0);
    // Both trades were saved at once.
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('starlantern-save') ?? '{}'));
    expect([saved.gold, saved.runes, saved.runesOpen]).toEqual([550, { 'spread@common': 1 }, true]);
    expect(w.errors).toEqual([]);
    expect(missing).toEqual([]);
  });

  test('the forge fuses three runes into one (plan 8f)', async ({ page }) => {
    await fitTo(page, 1280, 720);
    const w = await setup(page, 7);
    await page.evaluate(() => {
      const g = (window as unknown as Dbg).__starlanternDebug.game;
      g.state.gold = 100;
      g.state.runes = { 'spread@common': 3 };
      g.state.inventory['essence-common'] = 1;
    });
    const state = () => page.evaluate(() => {
      const s = (window as unknown as Dbg).__starlanternDebug.game.state;
      return { gold: s.gold as number, runes: s.runes as Record<string, number>, essence: s.inventory['essence-common'] as number | undefined };
    });
    await w.choose('.slx-town', '鍛造屋');
    await expect(page.locator('.slx-forge')).toBeVisible(); await w.closeTalk();
    await page.locator('.slx-forge .slx-cmd [data-id=runes]').click();
    const row = page.locator('.slx-forge-list [data-id="fuse:spread@common"]');
    await expect(row.locator('.slx-label')).toHaveText('擴散（普通）');
    await expect(row.locator('.slx-right')).toHaveText('持有 3');
    await expect(page.locator('.slx-rune-fuse-info')).toContainText('3 個擴散（普通）＋30 G＋普通精華 → 擴散（魔法）');
    for (const [vw, vh] of [[390, 844], [1280, 720]] as const) {
      await fitTo(page, vw, vh);
      await page.waitForTimeout(150);
      const over = await page.locator('.slx-forge-list [role=option], .slx-rune-fuse-info p').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 0.5).map((e) => e.textContent));
      expect(over, `rows wider than their box at ${vw}`).toEqual([]);
      const doc = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(doc, `the page scrolls sideways at ${vw}`).toBeLessThanOrEqual(0);
      if (process.env.SL_SHOTS) await page.screenshot({ path: `${process.env.SL_SHOTS}/rune-fuse-${vw}.png` });
    }
    await row.click();
    await expect(page.locator('.slx-confirm')).toBeVisible();
    await w.key('ArrowUp'); await w.key('Enter');           // 是
    await expect.poll(state).toEqual({ gold: 70, runes: { 'spread@magic': 1 }, essence: undefined });
    await expect(page.locator('.slx-forge .slx-talk')).toContainText('擴散（魔法）');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('starlantern-save') ?? '{}'));
    expect([saved.gold, saved.runes]).toEqual([70, { 'spread@magic': 1 }]);
    expect(w.errors).toEqual([]);
  });

  test.describe('the skill workshop (plan 8g)', () => {
    /** Every workshop window inside the stage and every row, card cell and foot line inside its own box, at this size. */
    const inside = async (page: Page, vw: number, vh: number) => {
      await fitTo(page, vw, vh);
      await page.waitForTimeout(150);
      const screen = await page.locator('.slx-screen').boundingBox();
      // Every window on screen (the tutorial's box is there but hidden unless it plays).
      for (const box of await page.locator('.slx-workshop .slx-win:not([hidden])').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, c: e.className }; }))) {
        expect(box.x, `${box.c} at ${vw}`).toBeGreaterThanOrEqual(screen!.x - 0.5);
        expect(box.y, `${box.c} at ${vw}`).toBeGreaterThanOrEqual(screen!.y - 0.5);
        expect(box.x + box.w, `${box.c} at ${vw}`).toBeLessThanOrEqual(screen!.x + screen!.width + 0.5);
        expect(box.y + box.h, `${box.c} at ${vw}`).toBeLessThanOrEqual(screen!.y + screen!.height + 0.5);
      }
      const over = await page.locator('.slx-workshop [role=option], .slx-ws-card p, .slx-ws-card td, .slx-ws-foot p')
        .evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 0.5).map((e) => e.textContent));
      expect(over, `wider than their box at ${vw}`).toEqual([]);
    };

    test('the skill workshop sockets a rune, after showing what it changes (plan 8g)', async ({ page }) => {
      await fitTo(page, 1280, 720);
      const missing: string[] = [];
      page.on('response', (r) => { if (r.status() === 404) missing.push(r.url()); });
      const w = await setup(page, 7);
      // A save past its first boss: Noel recruited at Lv 20 knowing 火之星彈, a magic 擴散 in the bag.
      await page.evaluate(() => {
        const s = (window as unknown as Dbg).__starlanternDebug.game.state;
        s.runesOpen = true;
        s.runeTutorialSeen = true;   // read already: the tutorial has its own test
        s.runes = { 'spread@magic': 1 };
        s.party.recruited = [...s.party.recruited, 'noel'];
        s.party.roster.noel = { ...s.party.roster.noel, level: 20, tree: { 'fire-star': 1 } };
      });
      await w.choose('.slx-town', '冒險者公會');
      await expect(page.locator('.slx-guild')).toBeVisible(); await w.closeTalk();
      await w.choose('.slx-guild .slx-cmd', '技能工坊');
      await expect(page.locator('.slx-workshop')).toBeVisible();
      for (let i = 0; i < 4 && !((await page.locator('.slx-ws-name').textContent()) ?? '').includes('諾艾兒'); i++) await w.key('e');
      await expect(page.locator('.slx-ws-name')).toContainText('諾艾兒');
      await expect(page.locator('.slx-ws-skills [aria-selected=true]')).toHaveAttribute('data-id', 'fire-star');
      await w.key('Enter');                                   // her slots
      await w.key('Enter');                                   // slot 1's runes
      await expect(page.locator('.slx-ws-runes [aria-selected=true]')).toHaveAttribute('data-id', 'bag:spread@magic');
      const target = page.locator('.slx-ws-card tr[data-key=target]');
      await expect(target.locator('td')).toHaveText(['敵方單體', '敵方全體']);
      await expect(target).toHaveClass(/slx-changed/);
      await expect(page.locator('.slx-ws-card tr[data-key=power] .slx-ws-after')).toHaveText('84（每個目標）');
      for (const [vw, vh] of [[1280, 720], [844, 390], [390, 844]] as const) {
        await inside(page, vw, vh);
        if (process.env.SL_SHOTS) await page.screenshot({ path: `${process.env.SL_SHOTS}/workshop-${vw}.png` });
      }
      await fitTo(page, 1280, 720);
      await w.key('Enter');                                   // socket it
      await expect(page.locator('.slx-ws-foot')).toContainText('火之星彈裝上了擴散（魔法）');
      await expect(page.locator('.slx-ws-skills [data-id=fire-star] .slx-right')).toHaveText('◆○');
      await w.key('Escape'); await w.key('Escape');           // the slots, the skills, the guild
      await expect(page.locator('.slx-guild')).toBeVisible();
      await expect(page.locator('.slx-talk')).toBeHidden();   // no new greeting
      await expect(page.locator('.slx-guild .slx-cmd [aria-selected=true]')).toHaveText('技能工坊');
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('starlantern-save') ?? '{}'));
      expect([saved.party.roster.noel.sockets, saved.runes]).toEqual([{ 'fire-star': [{ id: 'spread', tier: 'magic' }] }, {}]);
      expect(w.errors).toEqual([]);
      expect(missing).toEqual([]);
    });

    test('the workshop card stays inside the stage at its fullest (plan 8g)', async ({ page }) => {
      await fitTo(page, 1280, 720);
      const w = await setup(page, 7);
      // Chizuru at Lv 35: 守之結界 with three runes (常駐 and 除厄 among them), 淨之結界 with 常駐 too (the two-barrier
      // warning); Sylvie holds 雙重詠唱, whose move into 守之結界's third slot adds a line, takes one away and names her loss.
      await page.evaluate(() => {
        const s = (window as unknown as Dbg).__starlanternDebug.game.state;
        s.runesOpen = true;
        s.runeTutorialSeen = true;   // read already: the tutorial has its own test
        s.runes = { 'thrift@magic': 1 };
        s.party.recruited = [...s.party.recruited, 'chizuru', 'sylvie'];
        s.party.roster.chizuru = {
          ...s.party.roster.chizuru, level: 35, tree: { ward: 1, 'purify-ward': 1 },
          sockets: { ward: [{ id: 'lasting', tier: 'common' }, { id: 'extend', tier: 'magic' }, { id: 'dispel', tier: 'magic' }], 'purify-ward': [{ id: 'lasting', tier: 'common' }] },
        };
        s.party.roster.sylvie = { ...s.party.roster.sylvie, level: 20, tree: { 'aimed-shot': 1 }, sockets: { 'aimed-shot': [{ id: 'twin-cast', tier: 'legendary' }] } };
      });
      await w.choose('.slx-town', '冒險者公會');
      await expect(page.locator('.slx-guild')).toBeVisible(); await w.closeTalk();
      await w.choose('.slx-guild .slx-cmd', '技能工坊');
      for (let i = 0; i < 4 && !((await page.locator('.slx-ws-name').textContent()) ?? '').includes('千鶴'); i++) await w.key('e');
      for (let i = 0; i < 4 && (await page.locator('.slx-ws-skills [aria-selected=true]').getAttribute('data-id')) !== 'ward'; i++) await w.key('ArrowDown');
      await expect(page.locator('.slx-ws-skills [aria-selected=true]')).toHaveAttribute('data-id', 'ward');
      await w.key('Enter');                                   // her slots
      await w.key('ArrowDown'); await w.key('ArrowDown');
      await w.key('Enter');                                   // slot 3's runes (除厄 in it): 拆下, the bag, then the others'
      const move = 'move:sylvie:aimed-shot:0';
      for (let i = 0; i < 12 && (await page.locator('.slx-ws-runes [aria-selected=true]').getAttribute('data-id')) !== move; i++) await w.key('ArrowDown');
      await expect(page.locator('.slx-ws-runes [aria-selected=true]')).toHaveAttribute('data-id', move);
      await expect(page.locator('.slx-ws-giver')).toContainText('希爾薇');
      await expect(page.locator('.slx-ws-card')).toContainText('兩個常駐結界只會留下一個');
      for (const [vw, vh] of [[1280, 720], [390, 844]] as const) {
        await inside(page, vw, vh);
        const foot = await stageBox(page, page.locator('.slx-ws-foot'));   // stage px: the phone turns the stage (legibility 2b)
        const card = await stageBox(page, page.locator('.slx-ws-card'));
        expect(foot!.y + foot!.height, `the foot shows whole at ${vw}`).toBeLessThanOrEqual(card!.y + card!.height + 0.5);
        if (process.env.SL_SHOTS) await page.screenshot({ path: `${process.env.SL_SHOTS}/workshop-full-${vw}.png` });
      }
      await fitTo(page, 1280, 720);
      const body = page.locator('.slx-ws-card-body');
      const room = await body.evaluate((b) => b.scrollHeight - b.clientHeight);
      expect(room, 'the fullest card needs its ▼').toBeGreaterThan(1);
      const down = page.locator('.slx-ws-card-frame > .slx-more-down');
      const up = page.locator('.slx-ws-card-frame > .slx-more-up');
      await expect(down).toBeVisible();
      await expect(up).toBeHidden();
      await down.click();
      await expect.poll(() => body.evaluate((b) => b.scrollTop)).toBeGreaterThan(0);
      await expect(up).toBeVisible();
      const top = await body.evaluate((b) => b.scrollTop);
      if (top < room - 1) {
        await w.key('f');
        await expect.poll(() => body.evaluate((b) => b.scrollTop)).toBeGreaterThan(top);
      }
      expect(w.errors).toEqual([]);
    });

    test('the workshop moves a rune between members, by mouse (plan 8g)', async ({ page }) => {
      await fitTo(page, 1280, 720);
      const w = await setup(page, 7);
      // Noel at Lv 20 knowing 火之星彈; Sylvie with 彈射 in 瞄準射擊's first slot; a magic 擴散 in the bag.
      await page.evaluate(() => {
        const s = (window as unknown as Dbg).__starlanternDebug.game.state;
        s.runesOpen = true;
        s.runeTutorialSeen = true;   // read already: the tutorial has its own test
        s.runes = { 'spread@magic': 1 };
        s.party.recruited = [...s.party.recruited, 'noel', 'sylvie'];
        s.party.roster.noel = { ...s.party.roster.noel, level: 20, tree: { 'fire-star': 1 } };
        s.party.roster.sylvie = { ...s.party.roster.sylvie, level: 20, tree: { 'aimed-shot': 1 }, sockets: { 'aimed-shot': [{ id: 'bounce', tier: 'magic' }] } };
      });
      await w.choose('.slx-town', '冒險者公會');
      await expect(page.locator('.slx-guild')).toBeVisible(); await w.closeTalk();
      await page.locator('.slx-guild .slx-cmd [data-id=workshop]').click();
      await expect(page.locator('.slx-workshop')).toBeVisible();
      const next = page.locator('.slx-ws-head .slx-status-arrow').last();
      for (let i = 0; i < 4 && !((await page.locator('.slx-ws-name').textContent()) ?? '').includes('諾艾兒'); i++) await next.click();
      await expect(page.locator('.slx-ws-name')).toContainText('諾艾兒');
      await page.locator('.slx-ws-skills [data-id=fire-star]').click();
      await page.locator('.slx-ws-slots [data-id="slot:0"]').click();
      const runes = page.locator('.slx-ws-runes');
      await expect(runes.locator('[data-id="head:others"]')).toHaveText('從別人身上移過來');
      const row = runes.locator('[data-id="move:sylvie:aimed-shot:0"]');
      await expect(row.locator('.slx-right')).toHaveText('希爾薇');
      await row.hover();
      await expect(page.locator('.slx-ws-giver')).toContainText('希爾薇的瞄準射擊');
      await expect(page.locator('.slx-ws-card tr[data-key=target] td')).toHaveText(['敵方單體', '敵方單體']);
      for (const [vw, vh] of [[1280, 720], [390, 844]] as const) {
        await inside(page, vw, vh);
        if (process.env.SL_SHOTS) await page.screenshot({ path: `${process.env.SL_SHOTS}/workshop-move-${vw}.png` });
      }
      await fitTo(page, 1280, 720);
      await row.click();
      await expect(page.locator('.slx-ws-foot')).toContainText('從希爾薇・瞄準射擊移過來：彈射（魔法）');
      const sockets = await page.evaluate(() => {
        const r = (window as unknown as Dbg).__starlanternDebug.game.state.party.roster;
        return [r.noel.sockets, r.sylvie.sockets ?? null];
      });
      expect(sockets).toEqual([{ 'fire-star': [{ id: 'bounce', tier: 'magic' }] }, null]);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('starlantern-save') ?? '{}'));
      expect(saved.party.roster.noel.sockets).toEqual({ 'fire-star': [{ id: 'bounce', tier: 'magic' }] });
      expect(w.errors).toEqual([]);
    });

    test("the status page: columns line up across categories, the hero's branch names are whole, and the skills page leads to the workshop (plan 8g)", async ({ page }) => {
      await fitTo(page, 1280, 720);
      const w = await setup(page, 7);
      await page.evaluate(() => {
        const s = (window as unknown as Dbg).__starlanternDebug.game.state;
        s.runesOpen = true;
        s.runeTutorialSeen = true;   // read already: the tutorial has its own test
        s.party.recruited = [...s.party.recruited, 'noel'];
        s.party.roster.noel = { ...s.party.roster.noel, level: 20, tree: { 'fire-star': 1 }, sockets: { 'fire-star': [{ id: 'spread', tier: 'magic' }] } };
      });
      await w.choose('.slx-town', '冒險者公會');
      await expect(page.locator('.slx-guild')).toBeVisible(); await w.closeTalk();
      await page.locator('.slx-guild [data-id=status]').click();
      await expect(page.locator('.slx-status-scene')).toBeVisible();
      // Every category open: the n-th column starts at the same x in every table.
      for (let i = 0; i < 8; i++) {
        const closed = page.locator('.slx-stat-cat-head[aria-expanded=false]');
        if (!(await closed.count())) break;
        await closed.first().click();
      }
      const columns = async (vw: number) => {
        // Lefts in stage px (legibility 2b): turned on a phone, a column's left is its distance down from the screen's top.
        const lefts = await page.locator('.slx-stat-table').evaluateAll((ts) => {
          const scr = document.querySelector('#sl-screen')!.getBoundingClientRect();
          const turned = scr.height > scr.width, k = turned ? scr.width / 360 : scr.width / 640;
          return ts.map((t) => [...t.querySelectorAll('thead th')].map((th) => { const q = th.getBoundingClientRect(); return turned ? (q.top - scr.top) / k : (q.left - scr.left) / k; }));
        });
        expect(lefts.length, `tables at ${vw}`).toBeGreaterThan(1);
        for (const l of lefts) {
          expect(l.length).toBe(lefts[0].length);
          l.forEach((x, i) => expect(Math.abs(x - lefts[0][i]), `column ${i} at ${vw}`).toBeLessThanOrEqual(0.5));
        }
        // The row names keep to one line in their narrower column, and every heading fits its own (review of T5).
        const cramped = await page.locator('.slx-stat-table').evaluateAll((ts) => ts.flatMap((t) => [
          ...[...t.querySelectorAll('tbody th')].filter((th) => { const r = document.createRange(); r.selectNodeContents(th); return r.getClientRects().length > 1; }).map((th) => `row ${th.textContent} wraps`),
          ...[...t.querySelectorAll('thead th')].filter((th) => th.scrollWidth > th.clientWidth + 0.5).map((th) => `heading ${th.textContent} spills`),
        ]));
        expect(cramped, `stat tables at ${vw}`).toEqual([]);
      };
      const branches = async (vw: number) => {
        const heads = await page.locator('.slx-tree-branch-name').evaluateAll((hs) => hs.map((h) => ({
          t: h.textContent, over: h.scrollWidth > h.clientWidth + 0.5, ellipsis: getComputedStyle(h).textOverflow === 'ellipsis',
        })));
        expect(heads.length, `branches at ${vw}`).toBe(5);
        expect(heads.filter((h) => h.over || h.ellipsis), `cut branch names at ${vw}`).toEqual([]);
      };
      for (const [vw, vh] of [[1280, 720], [844, 390], [390, 844]] as const) {
        await fitTo(page, vw, vh);
        await page.waitForTimeout(150);
        await page.locator('.slx-tab[data-tab=stats]').click();
        await columns(vw);
        if (process.env.SL_SHOTS) await page.screenshot({ path: `${process.env.SL_SHOTS}/status-columns-${vw}.png` });
        await page.locator('.slx-tab[data-tab=tree]').click();   // the hero's five branches
        await branches(vw);
        if (process.env.SL_SHOTS) await page.screenshot({ path: `${process.env.SL_SHOTS}/status-hero-tree-${vw}.png` });
      }
      await fitTo(page, 1280, 720);
      // The skills page: Noel's 火之星彈 with its dots and rune line; a click opens the workshop on it.
      await flipTo(page, '諾艾兒');
      await page.locator('.slx-tab[data-tab=skills]').click();
      const fire = page.locator('.slx-skill[data-skill=fire-star]');
      await expect(fire.locator('.slx-skill-slots')).toHaveText('◆○');
      await expect(fire.locator('.slx-skill-rune')).toContainText('擴散（魔法）：');
      for (const [vw, vh] of [[1280, 720], [844, 390], [390, 844]] as const) {
        await fitTo(page, vw, vh);
        await page.waitForTimeout(150);
        const over = await page.locator('.slx-tab-skills .slx-skill-head, .slx-tab-skills .slx-skill-rune').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 0.5).map((e) => e.textContent));
        expect(over, `the skills page spills at ${vw}`).toEqual([]);
        if (process.env.SL_SHOTS) await page.screenshot({ path: `${process.env.SL_SHOTS}/status-skills-${vw}.png` });
      }
      await fitTo(page, 1280, 720);
      await fire.click();
      await expect(page.locator('.slx-workshop')).toBeVisible();
      await expect(page.locator('.slx-ws-name')).toContainText('諾艾兒');
      await expect(page.locator('.slx-ws-skills [aria-selected=true]')).toHaveAttribute('data-id', 'fire-star');
      await w.key('Escape');                                  // back to her skills page
      await expect(page.locator('.slx-status-scene')).toBeVisible();
      await expect(page.locator('.slx-status-name')).toContainText('諾艾兒');
      await expect(page.locator('.slx-tab-sel')).toHaveText('技能');
      await w.key('Escape');                                  // back to the guild, no new greeting
      await expect(page.locator('.slx-guild')).toBeVisible();
      await expect(page.locator('.slx-talk')).toBeHidden();
      expect(w.errors).toEqual([]);
    });

    test('the field menu, with the workshop on it, fits a landscape phone (plan 8g)', async ({ page }) => {
      await fitTo(page, 844, 390);
      const w = await setup(page, 11);
      await depart(page, w);
      await w.closeTalk();
      await w.key('c');
      const menu = page.locator('.slx-field-menu');
      await expect(menu).toBeVisible();
      await expect(menu.locator('[data-id=workshop]')).toBeVisible();
      await expect(menu.locator('.slx-more-down')).toHaveCount(0);           // every line on screen, 關閉 included
      await expect(menu.locator('[data-id=close]')).toBeVisible();
      await expect(page.locator('.slx-dungeon .slx-keyhint')).toBeHidden();   // the map's key hint gives way to the menu
      const screen = await page.locator('.slx-screen').boundingBox();
      const box = await menu.boundingBox();
      expect(box!.y + box!.height).toBeLessThanOrEqual(screen!.y + screen!.height + 0.5);
      expect(box!.x + box!.width).toBeLessThanOrEqual(screen!.x + screen!.width + 0.5);
      const over = await menu.locator('[role=option]').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 0.5).map((e) => e.textContent));
      expect(over).toEqual([]);
      if (process.env.SL_SHOTS) await page.screenshot({ path: `${process.env.SL_SHOTS}/field-menu-844.png` });
      expect(w.errors).toEqual([]);
    });

    test('the workshop tells the rune tutorial to a player who already holds runes (plan 8g)', async ({ page }) => {
      await fitTo(page, 1280, 720);
      const w = await setup(page, 7);
      await page.evaluate(() => {
        const s = (window as unknown as Dbg).__starlanternDebug.game.state;
        s.runesOpen = true;
        s.runes = { 'spread@magic': 1 };
      });
      await w.choose('.slx-town', '冒險者公會');
      await expect(page.locator('.slx-guild')).toBeVisible(); await w.closeTalk();
      await w.choose('.slx-guild .slx-cmd', '技能工坊');
      const talk = page.locator('.slx-workshop .slx-talk');
      await expect(talk).toBeVisible();
      await w.key('z');                                       // the first page whole
      await expect(talk.locator('.slx-next')).toBeVisible();
      for (const [vw, vh] of [[1280, 720], [844, 390], [390, 844]] as const) {
        await fitTo(page, vw, vh);
        await page.waitForTimeout(150);
        const screen = (await page.locator('.slx-screen').boundingBox())!;
        const box = (await talk.boundingBox())!;
        expect([box.x >= screen.x - 0.5, box.y >= screen.y - 0.5, box.x + box.width <= screen.x + screen.width + 0.5, box.y + box.height <= screen.y + screen.height + 0.5], `the tutorial inside the stage at ${vw}`).toEqual([true, true, true, true]);
        // Nothing of the screen under it shows through (the card's ▼ included).
        const top = await page.evaluate(() => { const b = document.querySelector('.slx-workshop .slx-talk')!.getBoundingClientRect(); return document.elementFromPoint(b.x + b.width - 12, b.y + 12)?.closest('.slx-talk') !== null; });
        expect(top, `the tutorial on top at ${vw}`).toBe(true);
        if (process.env.SL_SHOTS) await page.screenshot({ path: `${process.env.SL_SHOTS}/workshop-tutorial-${vw}.png` });
      }
      await fitTo(page, 1280, 720);
      for (let i = 0; i < 12 && (await talk.isVisible()); i++) await w.key('z');
      await expect(talk).toBeHidden();
      expect(await page.evaluate(() => (window as unknown as Dbg).__starlanternDebug.game.state.runeTutorialSeen)).toBe(true);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('starlantern-save') ?? '{}'));
      expect(saved.runeTutorialSeen).toBe(true);
      expect(w.errors).toEqual([]);
    });

    test('a skill with three runes and a reason in place of its TP fits the battle menu at 390 (plan 8g)', async ({ page }) => {
      await fitTo(page, 1280, 720);
      const w = await setup(page, 7);
      // Liz at Lv 35: 一擲千金 with three working runes, and no coins at the fight's start (its reason replaces the TP). The
      // skills that can show a reason (coins, a barrier, devices) all have four-character names; this is the widest row.
      await page.evaluate(() => {
        const g = (window as unknown as Dbg).__starlanternDebug.game;
        const p = g.state.party;
        p.recruited = ['hero', 'liz'];
        p.grid = ['hero', null, null, 'liz', null, null, null, null, null];
        p.roster.liz.level = 35;
        p.roster.liz.tree = { 'twin-slash': 1, jackpot: 1 };
        p.roster.liz.sockets = { jackpot: [{ id: 'tear', tier: 'magic' }, { id: 'drain', tier: 'magic' }, { id: 'regain', tier: 'magic' }] };
        g.state.runesOpen = true;
        g.state.runeTutorialSeen = true;
      });
      await depart(page, w);
      for (let i = 0; i < 200 && !(await page.locator('.slx-battle').isVisible()); i++) {
        await w.key(i % 2 ? 'ArrowLeft' : 'ArrowRight');
        await w.closeTalk();
        if (await page.locator('.slx-confirm').isVisible()) await w.key('Enter');
        if (await page.locator('.slx-event').isVisible()) await w.key('Escape');
      }
      await expect(page.locator('.slx-battle')).toBeVisible();
      await page.evaluate(() => {
        const g = (window as unknown as Dbg).__starlanternDebug.game;
        for (const e of g.battle.enemies) { e.max.hp = 999; e.hp = 999; e.max.atk = 1; e.max.mag = 1; }
      });
      for (let i = 0; i < 80; i++) {
        if (!(await page.locator('.slx-bcmd [role=option]').count())) { await page.waitForTimeout(50); continue; }
        const who = (await page.locator('.slx-bcmd .slx-who').textContent()) ?? '';
        if (who.startsWith('莉茲')) break;
        await w.choose('.slx-bcmd', '防禦');
      }
      await w.choose('.slx-bcmd', '技能');
      const item = page.locator('.slx-bsub [data-id=jackpot]');
      await expect(item.locator('.slx-badge')).toHaveText('◆◆◆');
      await expect(item.locator('.slx-right')).toHaveText('沒有銅板');
      for (const [vw, vh] of [[1280, 720], [390, 844]] as const) {
        await fitTo(page, vw, vh);
        await page.waitForTimeout(150);
        const rows = await page.locator('.slx-bsub [role=option], .slx-bsub .slx-label').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 0.5).map((e) => e.textContent));
        expect(rows, `rows or names cut at ${vw}`).toEqual([]);
        await expect(item.locator('.slx-badge')).toBeVisible();
        if (process.env.SL_SHOTS) await page.screenshot({ path: `${process.env.SL_SHOTS}/battle-long-${vw}.png` });
      }
      expect(w.errors).toEqual([]);
    });
  });

  test.describe('the suggested builds (plan 8h)', () => {
    /** Every window of `scene` inside the stage, and every row, card line and foot line inside its own box, at this size. */
    const inside = async (page: Page, scene: string, rows: string, vw: number, vh: number) => {
      await fitTo(page, vw, vh);
      await page.waitForTimeout(150);
      const screen = (await page.locator('.slx-screen').boundingBox())!;
      for (const b of await page.locator(`${scene} .slx-win:not([hidden])`).evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, c: e.className }; }))) {
        expect(b.x, `${b.c} at ${vw}`).toBeGreaterThanOrEqual(screen.x - 0.5);
        expect(b.y, `${b.c} at ${vw}`).toBeGreaterThanOrEqual(screen.y - 0.5);
        expect(b.x + b.w, `${b.c} at ${vw}`).toBeLessThanOrEqual(screen.x + screen.width + 0.5);
        expect(b.y + b.h, `${b.c} at ${vw}`).toBeLessThanOrEqual(screen.y + screen.height + 0.5);
      }
      const over = await page.locator(rows).evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 0.5).map((e) => e.textContent));
      expect(over, `wider than their box at ${vw}`).toEqual([]);
      const doc = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(doc, `the page scrolls sideways at ${vw}`).toBeLessThanOrEqual(0);
    };
    /** No text of these under 12px (plan 8h: its new text is 12px at least). */
    const legible = async (page: Page, sel: string) => {
      const small = await page.locator(sel).evaluateAll((els) => els.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 12).map((e) => e.textContent));
      expect(small, 'text under 12px').toEqual([]);
    };
    const shot = async (page: Page, name: string) => { if (process.env.SL_SHOTS) await page.screenshot({ path: `${process.env.SL_SHOTS}/${name}.png` }); };
    const sizes = [[1280, 720], [844, 390], [390, 844]] as const;

    test('a suggested build applies from the inn, then the workshop shows what is still missing (plan 8h)', async ({ page }) => {
      await fitTo(page, 1280, 720);
      const w = await setup(page, 7);
      // Noel at Lv 35 on the default tree and talents, 節流 on 冰之星彈 (the build takes it off), a magic 擴散 in the bag.
      await page.evaluate(({ tree, talents }) => {
        const s = (window as unknown as Dbg).__starlanternDebug.game.state;
        s.gold = 5000;
        s.runesOpen = true;
        s.runeTutorialSeen = true;   // read already: the tutorial has its own test
        s.runes = { 'spread@magic': 1 };
        if (!s.party.recruited.includes('noel')) s.party.recruited = [...s.party.recruited, 'noel'];
        s.party.roster.noel = { ...s.party.roster.noel, level: 35, tree, talents, sockets: { 'ice-star': [{ id: 'thrift', tier: 'magic' }] } };
      }, { tree: defaultTree('noel', 35), talents: defaultTalents('noel', 35) });
      await w.choose('.slx-town', '旅館');
      await expect(page.locator('.slx-inn')).toBeVisible(); await w.closeTalk();
      await w.choose('.slx-inn .slx-cmd', T.ui2.inn.builds);
      await expect(page.locator('.slx-builds')).toBeVisible();
      for (let i = 0; i < 8 && !((await page.locator('.slx-bd-name').textContent()) ?? '').includes('諾艾兒'); i++) await w.key('e');
      await expect(page.locator('.slx-bd-name')).toContainText('諾艾兒');
      const rows = '.slx-builds [role=option], .slx-bd-card-body p, .slx-bd-card-body li, .slx-bd-rune, .slx-bd-foot p, .slx-bd-btn, .slx-builds .slx-keyhint';
      await legible(page, rows);
      for (const [vw, vh] of sizes) { await inside(page, '.slx-builds', rows, vw, vh); await shot(page, `builds-list-${vw}`); }
      await fitTo(page, 1280, 720);
      for (let i = 0; i < 4 && (await page.locator('.slx-bd-list [aria-selected=true]').getAttribute('data-id')) !== 'meteor'; i++) await w.key('ArrowDown');
      await expect(page.locator('.slx-bd-card-name')).toContainText('暴走流星');
      await expect(page.locator('.slx-bd-rune[data-rune=spread]')).toHaveAttribute('data-state', 'have');
      await expect(page.locator('.slx-bd-rune[data-rune=ignite]')).toContainText('缺：點燃（打怪、寶箱掉落）');
      await legible(page, rows);
      for (const [vw, vh] of sizes) { await inside(page, '.slx-builds', rows, vw, vh); await shot(page, `builds-card-${vw}`); }
      // The card's ▼ scrolls it; the foot stays whole inside the card.
      await fitTo(page, 1280, 720);
      const foot = (await page.locator('.slx-bd-foot').boundingBox())!;
      const card = (await page.locator('.slx-bd-card').boundingBox())!;
      expect(foot.y + foot.height).toBeLessThanOrEqual(card.y + card.height + 0.5);
      await w.key('Enter');
      const confirm = page.locator('.slx-builds .slx-confirm');
      await expect(confirm).toContainText('回到袋子');
      await expect(confirm).toContainText(' G');
      await expect(confirm).toContainText(T.ui2.builds.underLevel(35, 40));
      for (const [vw, vh] of sizes) { await inside(page, '.slx-builds', `${rows}, .slx-confirm p, .slx-confirm [role=option]`, vw, vh); await shot(page, `builds-confirm-${vw}`); }
      await fitTo(page, 1280, 720);
      await w.key('ArrowUp'); await w.key('Enter');           // 是
      await expect(page.locator('.slx-bd-msg')).toContainText('諾艾兒套用了暴走流星');
      await expect(page.locator('.slx-bd-msg')).toContainText('1 顆回到袋子');
      await expect(page.locator('.slx-bd-list [data-id=meteor] .slx-right')).toHaveText(T.ui2.builds.following);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('starlantern-save') ?? '{}'));
      expect([saved.party.roster.noel.build, saved.party.roster.noel.sockets['fire-star'][0], saved.runes]).toEqual(['meteor', { id: 'spread', tier: 'magic' }, { 'thrift@magic': 1 }]);
      // Back to the inn (no new greeting), out to the guild's workshop on 火之星彈.
      await w.key('Escape');
      await expect(page.locator('.slx-inn')).toBeVisible();
      await expect(page.locator('.slx-inn .slx-talk')).toBeHidden();
      await w.key('Escape');
      await expect(page.locator('.slx-town')).toBeVisible(); await w.closeTalk();
      await w.choose('.slx-town', '冒險者公會');
      await expect(page.locator('.slx-guild')).toBeVisible(); await w.closeTalk();
      await w.choose('.slx-guild .slx-cmd', '技能工坊');
      await expect(page.locator('.slx-workshop')).toBeVisible();
      for (let i = 0; i < 8 && !((await page.locator('.slx-ws-name').textContent()) ?? '').includes('諾艾兒'); i++) await w.key('e');
      await expect(page.locator('.slx-ws-follow')).toContainText('跟隨：暴走流星——');
      await expect(page.locator('.slx-ws-skills [aria-selected=true]')).toHaveAttribute('data-id', 'fire-star');
      await w.key('Enter'); await w.key('Enter');             // her slots, slot 1's runes
      await expect(page.locator('.slx-ws-lack')).toHaveText('缺：點燃（打怪、寶箱掉落）、連擊（道具店有賣）');
      await legible(page, '.slx-ws-follow, .slx-ws-lack');
      for (const [vw, vh] of sizes) {
        await inside(page, '.slx-workshop', '.slx-workshop [role=option], .slx-ws-card p, .slx-ws-card td, .slx-ws-foot p, .slx-ws-follow, .slx-ws-lack', vw, vh);
        // The lists stay inside their windows under the two new lines.
        const spill = await page.locator('.slx-ws-skills, .slx-ws-slots').evaluateAll((els) => els.filter((e) => e.scrollHeight > e.clientHeight + 0.5).map((e) => e.className));
        expect(spill, `a list spills out of its window at ${vw}`).toEqual([]);
        await shot(page, `builds-workshop-${vw}`);
      }
      expect(w.errors).toEqual([]);
    });

    test("auto fights a round by each member's build (plan 8h)", async ({ page }) => {
      await fitTo(page, 1280, 720);
      const w = await setup(page, 7);
      // A full five, Noel following 暴走流星 at Lv 40 (the note's longest round); the foes harmless and tough.
      const meteor = buildOf('noel', 'meteor')!;
      await page.evaluate(({ tree, talents }) => {
        const g = (window as unknown as Dbg).__starlanternDebug.game;
        const p = g.state.party;
        p.recruited = ['hero', 'rin', 'chizuru', 'noel', 'selene'];
        p.grid = ['hero', 'rin', null, 'chizuru', null, null, 'noel', 'selene', null];
        p.roster.noel = { ...p.roster.noel, level: 40, tree, talents, build: 'meteor' };
        g.state.runeTutorialSeen = true;
      }, { tree: buildTree('noel', 40, meteor), talents: buildTalents('noel', 40, meteor) });
      await depart(page, w);
      for (let i = 0; i < 200 && !(await page.locator('.slx-battle').isVisible()); i++) {
        await w.key(i % 2 ? 'ArrowLeft' : 'ArrowRight');
        await w.closeTalk();
        if (await page.locator('.slx-confirm').isVisible()) await w.key('Enter');
        if (await page.locator('.slx-event').isVisible()) await w.key('Escape');
      }
      await expect(page.locator('.slx-battle')).toBeVisible();
      await page.evaluate(() => {
        const g = (window as unknown as Dbg).__starlanternDebug.game;
        for (const e of g.battle.enemies) { e.max.hp = 999; e.hp = 999; e.max.atk = 1; e.max.mag = 1; }
      });
      await expect(page.locator('.slx-bcmd [role=option]').first()).toBeVisible();
      for (let i = 0; i < 12 && (await page.locator('.slx-bcmd [aria-selected=true]').getAttribute('data-id')) !== 'policy'; i++) await w.key('ArrowDown');
      await expect(page.locator('.slx-bcmd [aria-selected=true] .slx-label')).toHaveText(T.cmd.policy);
      const note = page.locator('.slx-bnote');
      for (const name of ['洛恩', '凜', '千鶴', '諾艾兒', '瑟蕾']) await expect(note).toContainText(`${name}：`);
      expect((await note.textContent())!.split('\n')).toHaveLength(5);   // one member a line
      for (const [vw, vh] of [[1280, 720], [844, 390], [390, 844]] as const) {
        await fitTo(page, vw, vh);
        await page.waitForTimeout(150);
        const screen = { x: 0, y: 0, width: 640, height: 360 };   // stage px (legibility 2b)
        const b = await stageBox(page, note);
        expect(b.x, `the note inside the stage at ${vw}`).toBeGreaterThanOrEqual(screen.x - 0.5);
        expect(b.x + b.width, `the note inside the stage at ${vw}`).toBeLessThanOrEqual(screen.x + screen.width + 0.5);
        expect(b.y + b.height, `the note inside the stage at ${vw}`).toBeLessThanOrEqual(screen.y + screen.height + 0.5);
        const over = await page.locator('.slx-bnote, .slx-bcmd [role=option]').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 0.5).map((e) => e.textContent));
        expect(over, `wider than their box at ${vw}`).toEqual([]);
        // The five lines fit the box, and the box keeps clear of the command window.
        expect(await note.evaluate((e) => e.scrollHeight - e.clientHeight), `the note's lines fit at ${vw}`).toBeLessThanOrEqual(0.5);
        const cmd = await stageBox(page, page.locator('.slx-bcmd'));
        expect(cmd.x + cmd.width <= b.x || b.y + b.height <= cmd.y, `the note clear of the commands at ${vw}`).toBe(true);
        const small = await note.evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
        expect(small).toBeGreaterThanOrEqual(12);
        if (process.env.SL_SHOTS) await page.screenshot({ path: `${process.env.SL_SHOTS}/auto-preview-${vw}.png` });
      }
      await fitTo(page, 1280, 720);
      const round = () => page.evaluate(() => (window as unknown as Dbg).__starlanternDebug.game.battle?.round ?? -1);
      expect(await round()).toBe(0);
      await w.key('Enter');                                   // 自動
      await expect.poll(round, { timeout: 15000 }).toBe(1);
      expect(w.errors).toEqual([]);
    });
  });

  test('every main screen reads at 12px and 24px at 1280x720, 844x390 and a phone (legibility Task 7) @sweep @dpr', async ({ page }, info) => {
    // Every main screen at the three sizes (the phone held upright, turned), in each project's device pixel ratio: each
    // one reads clearly (legibility() finds nothing). With SL_SHOTS, one picture each into <SL_SHOTS>/<d1|d1.25|d1.5>,
    // and (the 100% project) the review page beside it, before and after side by side.
    test.setTimeout(900_000);
    const shots = process.env.SL_SHOTS;
    const ratio = ({ 'chromium-dpr125': 'd1.25', 'chromium-dpr150': 'd1.5' } as Record<string, string>)[info.project.name] ?? 'd1';
    const dir = shots ? `${shots}/${ratio}` : null;
    if (dir) mkdirSync(dir, { recursive: true });
    const sizes = [{ width: 1280, height: 720 }, { width: 844, height: 390 }, { width: 390, height: 844 }];
    const seen: string[] = [];
    const bad: string[] = [];
    const errors = await sweep(page, sizes, async (name, size) => {
      const file = `${name}-${size.width}x${size.height}`;
      seen.push(file);
      bad.push(...(await legibility(page, { requireReady: true })).map((f) => `${file}: ${f}`));
      if (dir) { await page.waitForTimeout(400); await snap(page, `${dir}/${file}.png`); }   // windows fade in
    });
    if (shots && ratio === 'd1') writeReviewIndex(shots, SWEEP.map((s) => s.name), sizes);
    expect(seen).toHaveLength(SWEEP.length * 3);
    expect(bad).toEqual([]);
    expect(errors).toEqual([]);
  });
});
