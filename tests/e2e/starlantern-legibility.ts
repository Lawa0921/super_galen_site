import { expect, type CDPSession, type Locator, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { dirname, relative, sep } from 'node:path';
import { EQUIPMENT } from '../../src/scripts/games/starlantern/data/equipment';
import { SPECIALS, STARLIT_RARITIES } from '../../src/scripts/games/starlantern/data/gear';
import { AFFIXES } from '../../src/scripts/games/starlantern/data/affixes';
import { ENHANCE_MAX } from '../../src/scripts/games/starlantern/data/forge';
import { ITEMS } from '../../src/scripts/games/starlantern/data/items';
import { RUNES, runeKey, tiersOf, type RuneId } from '../../src/scripts/games/starlantern/data/runes';
import { STORY } from '../../src/scripts/games/starlantern/data/story.zh-TW';
import { T } from '../../src/scripts/games/starlantern/data/text.zh-TW';
import { CHARACTERS } from '../../src/scripts/games/starlantern/data/characters';
import { BAG_SIZE } from '../../src/scripts/games/starlantern/engine/loot/bag';
import { LEGACY_GRID, LEGACY_LINEUP } from '../../src/scripts/games/starlantern/engine/party';
import type { ItemInstance } from '../../src/scripts/games/starlantern/engine/types';
import { gearLabel } from '../../src/scripts/games/starlantern/ui2/loot';

/**
 * The legibility plan's e2e helpers (2026-10-23): the screen sweep (Task 0). Later tasks add the measurements and the guard here.
 */

/** What the spec's `setup` hands back: the keys, the line closer, the menu chooser and the page errors seen so far. */
export interface SpecHelpers {
  errors: string[];
  key(k: string): Promise<void>;
  closeTalk(): Promise<void>;
  choose(scope: string, label: string): Promise<void>;
}

export interface SweepSize { width: number; height: number }

// eslint-free project: `any` keeps the debug handle as loose as the spec's own `Dbg`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dbg = { __starlanternDebug: { game: any; go(name: string, arg?: string): Promise<void> } };

/** Run `fn` on the live game in the page. */
const game = <R>(page: Page, fn: string) => page.evaluate((src) => {
  const g = (window as unknown as Dbg).__starlanternDebug.game;
  return new Function('g', src)(g) as R;
}, fn);

/** `__starlanternDebug.go`: straight to a scene, as the router would go there. */
export const go = async (page: Page, name: string, arg?: string) => {
  await page.evaluate(([n, a]) => (window as unknown as Dbg).__starlanternDebug.go(n!, a ?? undefined), [name, arg ?? null] as const);
};

/**
 * The piece of gear with the longest label the game can show: a special at its rarity (starlit when it can be), at the
 * highest enhance level, worn on a base of its own slot.
 */
export const longestGear = (): Omit<ItemInstance, 'uid'> => {
  const bases = Object.values(EQUIPMENT);
  const all: Omit<ItemInstance, 'uid'>[] = Object.values(SPECIALS).map((s) => ({
    base: bases.find((b) => b.slot === s.slot)!.id, rarity: s.rarity, ilvl: 10, enhance: ENHANCE_MAX, special: s.id, affixes: [],
    ...(STARLIT_RARITIES.includes(s.rarity) ? { starlit: true as const } : {}),
  }));
  for (const b of bases) all.push({ base: b.id, rarity: 'epic', ilvl: 10, enhance: ENHANCE_MAX, affixes: [] });
  return all.reduce((a, b) => (gearLabel({ ...b, uid: 0 }).length > gearLabel({ ...a, uid: 0 }).length ? b : a));
};

/** Every rune at every tier it comes in, three of each: the longest rune lists the shop, the forge and the workshop can show. */
const ALL_RUNES: Record<string, number> = Object.fromEntries(
  (Object.keys(RUNES) as RuneId[]).flatMap((id) => tiersOf(id).map((tier) => [runeKey({ id, tier }), 3] as const)));

/**
 * A new game (story off) on `seed`, set up so every screen has its longest content: the legacy five, the hero and Rin
 * recruited; Noel at Lv 20 knowing 火之星彈 (two rune slots open); runes open with every rune in the bag and the rune
 * tutorial still unread; the longest gear, a rare with affixes (for 重鑄) and three magic pieces (for 合成) in the bag.
 */
export const startSweepGame = async (page: Page, seed = 7): Promise<SpecHelpers> => {
  await page.addInitScript(() => {
    if (localStorage.getItem('starlantern-settings') === null) localStorage.setItem('starlantern-settings', JSON.stringify({ volume: 70, textSpeed: 'mid', vibrate: true, story: 'none' }));
  });
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
  await page.evaluate(([ids, grid, long, runes]) => {
    const g = (window as unknown as Dbg).__starlanternDebug.game;
    const s = g.state;
    const p = s.party;
    p.recruited = [...ids, 'hero', 'rin'];
    p.grid = grid;
    p.roster.noel = { ...p.roster.noel, level: 20, tree: { 'fire-star': 1 } };
    s.gold = 5000;
    s.runesOpen = true;
    s.runes = runes;
    Object.assign(s.inventory, { potion: 3, moss: 4, 'essence-common': 6, 'essence-magic': 2 });
    s.bag.push({ ...long, uid: g.mintUid() });
    // A rare with affixes: something the forge can reroll even when the longest piece is a starlit unique or set.
    s.bag.push({ uid: g.mintUid(), base: 'iron-sword', rarity: 'rare', ilvl: 4, enhance: 3, affixes: [{ key: 'atk', value: 3 }, { key: 'crit', value: 2 }, { key: 'hp', value: 9 }] });
    for (let i = 0; i < 3; i++) s.bag.push({ uid: g.mintUid(), base: 'iron-sword', rarity: 'magic', ilvl: 2, enhance: 0, affixes: [{ key: 'atk', value: 2 }] });
  }, [LEGACY_LINEUP, LEGACY_GRID.map((c) => (c === 'selene' ? 'hero' : c)), longestGear(), ALL_RUNES] as const);
  return { errors, key, closeTalk, choose };
};

/**
 * Story on, `ids` queued for the town, and the town entered: the scenes play (story staging S5, S6). The sweep game has
 * the story off, so `storyOff` puts it back once they are read.
 */
const storyOn = async (page: Page, w: SpecHelpers, ids: string[]) => {
  await page.evaluate((ids) => {
    const d = (window as unknown as { __starlanternDebug: { game: { arrival: string[] }; settings: { get(): object; set(s: object): void } } }).__starlanternDebug;
    d.settings.set({ ...d.settings.get(), story: 'all' });
    d.game.arrival = ids;
  }, ids);
  await go(page, 'town');
  await expect(page.locator('.slx-town .slx-talk')).toBeVisible();
  if (!(await page.locator('.slx-town .slx-talk .slx-next').isVisible())) await w.key('z');   // the line whole
};
const storyOff = (page: Page) => page.evaluate(() => {
  const d = (window as unknown as { __starlanternDebug: { settings: { get(): object; set(s: object): void } } }).__starlanternDebug;
  d.settings.set({ ...d.settings.get(), story: 'none' });
});

/** A facility scene, its greeting closed. */
const facility = async (page: Page, w: SpecHelpers, scene: string, cls: string) => {
  await go(page, scene);
  await expect(page.locator(cls)).toBeVisible(); await w.closeTalk();
};

/** Confirm through a dialogue of many pages (closeTalk stops after six). */
const readAll = async (page: Page, w: SpecHelpers) => {
  for (let i = 0; i < 40 && (await page.locator('.slx-talk:not([hidden])').isVisible()); i++) await w.key('z');
};

/** Walk the dungeon with encounters held off, along `keys`. */
const walk = async (page: Page, keys: string[]) => {
  for (const k of keys) {
    await page.evaluate(() => { (window as unknown as Dbg).__starlanternDebug.game.encounter = 0; });
    await page.keyboard.press(k);
  }
};

/** Keys over plain floor from the party to the stairs down (BFS over the live map). */
const toStairs = (page: Page) => page.evaluate(() => {
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

/**
 * Put `tile` on the `nth` plain floor tile of the map that has plain floor to its left, and stand the party there,
 * facing it: the key that steps onto it is returned. With `content`, the floor's contents gain that event there.
 */
export const placeBeside = (page: Page, tile: string, nth = 0, content?: string, extra: Record<string, unknown> = {}) => page.evaluate(({ tile, nth, content, extra }) => {
  const g = (window as unknown as Dbg).__starlanternDebug.game;
  const tiles: string[][] = g.map().tiles;
  const spots: { x: number; y: number }[] = [];
  tiles.forEach((row, y) => row.forEach((t, x) => { if (t === 'floor' && row[x - 1] === 'floor') spots.push({ x, y }); }));
  const at = spots[nth % spots.length];
  tiles[at.y][at.x] = tile;
  if (content) g.run.floors.get(g.floor).contents.push({ kind: content, at, room: -1, ...extra });
  g.pos = { x: at.x - 1, y: at.y };
  g.encounter = 0;
  return { at, spots: spots.length };
}, { tile, nth, content, extra });

/** Close the event window or talk line the last visit left showing; the party stays where it stood. */
const leaveEvent = async (page: Page, w: SpecHelpers) => {
  if (await page.locator('.slx-event').isVisible()) await w.key('Escape');
  await w.closeTalk();
  await expect(page.locator('.slx-event')).toHaveCount(0);
};

/** A merchant's stock of the three priced items with the longest names (his window's longest list). */
const LONGEST_STOCK = Object.values(ITEMS).filter((i) => i.price > 0)
  .sort((a, b) => b.name.length - a.name.length || String(b.price).length - String(a.price).length).slice(0, 3).map((i) => i.id);

/** Put plain floor back where `placeBeside` put a tile. */
const unplace = (page: Page, at: { x: number; y: number }) => page.evaluate((at) => {
  const g = (window as unknown as Dbg).__starlanternDebug.game;
  g.map().tiles[at.y][at.x] = 'floor';
}, at);

/** In battle: defend for each member until the command menu is for someone the test can use again. */
const commandMenu = async (page: Page) => {
  for (let i = 0; i < 80 && !(await page.locator('.slx-bcmd [role=option]').count()); i++) await page.waitForTimeout(50);
  await expect(page.locator('.slx-bcmd [role=option]').first()).toBeVisible();
};

/**
 * Art step 9: every row in `scope` that holds a rune icon keeps the height of one line of its own text (its line-height
 * and padding), and every icon sits inside its row; at least one such row is on screen. Measured in layout px.
 */
const runeRowsKeepTheirLine = async (page: Page, scope: string) => {
  const rows = await page.locator(`${scope} [role=option]`).evaluateAll((els) => els.filter((e) => e.querySelector('img.slx-rune-ico')).map((e) => {
    const li = e as HTMLElement; const cs = getComputedStyle(li); const box = li.getBoundingClientRect();
    const out = [...li.querySelectorAll('img.slx-rune-ico')].filter((i) => { const r = i.getBoundingClientRect(); return r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5; }).length;
    return { id: li.dataset.id, h: li.offsetHeight, line: parseFloat(cs.lineHeight) + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom), lh: parseFloat(cs.lineHeight), out };
  }));
  expect(rows.length, `${scope}: rows with rune icons`).toBeGreaterThan(0);
  for (const r of rows) {
    expect(r.lh, `${r.id} leading`).toBeGreaterThanOrEqual(14);
    expect(r.h, `${r.id} as tall as one line`).toBe(r.line);
    expect(r.out, `${r.id} icons inside the row`).toBe(0);
  }
};

/**
 * Art step 9: every picture matching `img` in `scope` is shown at its own native size (`px` x `px` layout px, the file
 * that size: never scaled), decorative (alt ""), and inside its row; a row with a 14 or 16 px icon keeps the height of one
 * line of its own text. At least `min` are on screen.
 */
const nativeIcons = async (page: Page, scope: string, img: string, px: number, min = 1) => {
  // The pictures land after the screen is drawn (ui2/lateArt.ts), and each <img> then loads its own file: wait until every
  // icon on screen has loaded before measuring, so a slow load (provoke-16.png) is not read as a 0x0 picture.
  await expect.poll(() => page.locator(`${scope} ${img}`).evaluateAll((els) => els.filter((e) => (e as HTMLElement).checkVisibility())
    .every((e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth > 0)),
  { message: `${scope} ${img}: every icon loaded`, timeout: 30000 }).toBe(true);
  const found = await page.locator(`${scope} ${img}`).evaluateAll((els) => els.filter((e) => (e as HTMLElement).checkVisibility()).map((e) => {
    const i = e as HTMLImageElement; const r = i.getBoundingClientRect();
    const row = (i.closest('[role=option], .slx-skill, .slx-ail, .slx-mech') ?? i.parentElement!) as HTMLElement;
    const b = row.getBoundingClientRect(); const cs = getComputedStyle(row);
    return { src: i.getAttribute('src'), w: i.offsetWidth, h: i.offsetHeight, nw: i.naturalWidth, nh: i.naturalHeight, alt: i.getAttribute('alt'),
      // 1 screen px of slack: on a phone held upright the stage is turned and scaled by a fraction, so edges land between pixels.
      out: r.top < b.top - 1 || r.bottom > b.bottom + 1 || r.left < b.left - 1 || r.right > b.right + 1,
      boxes: `icon ${r.left},${r.top},${r.right},${r.bottom} row ${row.className} ${b.left},${b.top},${b.right},${b.bottom}`,
      chip: row.matches('.slx-ail, .slx-mech'), rowH: row.offsetHeight, line: parseFloat(cs.lineHeight) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth) };
  }));
  expect(found.length, `${scope} ${img}: icons on screen`).toBeGreaterThanOrEqual(min);
  for (const f of found) {
    expect(f.out ? f.boxes : '', `${f.src} inside its row`).toBe('');
    expect([f.w, f.h, f.nw, f.nh], `${f.src} native ${px}`).toEqual([px, px, px, px]);
    expect(f.alt, `${f.src} decorative`).toBe('');
    if (f.chip) expect(f.rowH, `${f.src}: its chip stays one 14px line`).toBe(f.line);
  }
};

/** The chests and event rooms the sweep put down, taken up again before it walks to the stairs. */
const chests: { x: number; y: number }[] = [];

const HANDBOOK_TABS = ['memories', 'people', 'leads', 'town', 'codex', 'truths'] as const;

/**
 * The sweep's screens, in the order one game reaches them: the menus by `go`, then a portal run (the departure prompt,
 * the dungeon, its menu and handbook, every event room (altar, fountain, merchant, the vault locked and opened by its key, a trap, an elite, a chest into a full bag), the stairs, a fight, its lists and result) and the
 * finale card. Each visit leaves its screen showing.
 */
export const SWEEP: { name: string; visit(page: Page, w: SpecHelpers): Promise<void> }[] = [
  { name: 'title', visit: async (page) => { await go(page, 'title'); await expect(page.locator('.slx-title [role=option]').first()).toBeVisible(); } },
  {
    // The town's greeting, before it is closed: the dialogue box.
    name: 'talk', visit: async (page, w) => {
      await go(page, 'town');
      const talk = page.locator('.slx-town .slx-talk');
      await expect(talk).toBeVisible();
      if (!(await talk.locator('.slx-next').isVisible())) await w.key('z');   // the line whole
    },
  },
  { name: 'town', visit: async (page, w) => { await w.closeTalk(); await expect(page.locator('.slx-town')).toBeVisible(); } },
  {
    // Story staging S5: a memory played in the town, on a remembered line: the sepia veil over the town, the dimmed box,
    // and the town's HUD put away.
    name: 'memory-past', visit: async (page, w) => {
      await storyOn(page, w, ['mem:scarlet:5']);
      await expect(page.locator('.slx-town .slx-talk.slx-talk--memory')).toBeVisible();
      await expect(page.locator('.slx-town .slx-veil-past.slx-on')).toHaveCount(1);
      await expect(page.locator('.slx-town .slx-place')).toBeHidden();
    },
  },
  {
    // The same memory back in the present: the plain box, Scarlet's own face in its own colours, the veil gone.
    name: 'memory-present', visit: async (page, w) => {
      await w.key('z');
      await expect(page.locator('.slx-town .slx-talk .slx-name')).toHaveText(CHARACTERS.scarlet.name);
      if (!(await page.locator('.slx-town .slx-talk .slx-next').isVisible())) await w.key('z');
      await expect(page.locator('.slx-town .slx-talk')).not.toHaveClass(/slx-talk--memory/);
      await expect(page.locator('.slx-town .slx-veil-past.slx-on')).toHaveCount(0);
    },
  },
  {
    // Story staging S6: a town scene's location card where the place plate stood, the night dimming the town.
    name: 'place-card', visit: async (page, w) => {
      await readAll(page, w);   // the rest of the memory, then the day's line
      await storyOn(page, w, ['prologue-inn']);
      await expect(page.locator('.slx-town .slx-place-card')).toHaveText('月影旅館・深夜');
      await expect(page.locator('.slx-town .slx-veil-night.slx-on')).toHaveCount(1);
    },
  },
  {
    // Story L: a memory told at night in town, after the day's line: the night's card, its veil, the memory's past.
    name: 'night-memory', visit: async (page, w) => {
      await readAll(page, w);   // the inn night and the day's line after it
      await page.evaluate(() => {
        const d = (window as unknown as { __starlanternDebug: { game: { arrival: string[]; night: string[] } } }).__starlanternDebug;
        d.game.arrival = [];
        d.game.night = ['mem:rin:1'];
      });
      await go(page, 'town');
      await expect(page.locator('.slx-town .slx-talk')).toBeVisible();
      await w.key('z');   // the day's line
      if (!(await page.locator('.slx-town .slx-place-card').isVisible())) await w.key('z');   // the line whole first
      await expect(page.locator('.slx-town .slx-place-card')).toHaveText('月影旅館・夜');
      await expect(page.locator('.slx-town .slx-veil-night.slx-on')).toHaveCount(1);
      if (!(await page.locator('.slx-town .slx-talk .slx-next').isVisible())) await w.key('z');   // the line whole
    },
  },
  ...(['full', 'new'] as const).map((moon) => ({
    // Time and moon (Task 5): a night told under tonight's moon, the veil tinted (full: lighter and bluer; new: darker).
    name: `night-moon-${moon}`, visit: async (page: Page, w: SpecHelpers) => {
      await readAll(page, w);   // what is still on screen
      await page.evaluate((day) => {
        const d = (window as unknown as { __starlanternDebug: { game: { arrival: string[]; night: string[]; state: { story: { day?: number } } } } }).__starlanternDebug;
        d.game.arrival = [];
        d.game.night = ['mem:rin:1'];
        d.game.state.story.day = day;   // tonight is the day before's
      }, moon === 'full' ? 5 : 3);
      await go(page, 'town');
      await expect(page.locator('.slx-town .slx-talk')).toBeVisible();
      await w.key('z');   // the day's line
      if (!(await page.locator('.slx-town .slx-place-card').isVisible())) await w.key('z');   // the line whole first
      await expect(page.locator(`.slx-town .slx-veil-night.slx-on.slx-moon-${moon}`)).toHaveCount(1);
      // Task 7 review: on to the memory's present lines, so no sepia past veil hides the moon's tint
      for (let i = 0; i < 20 && (await page.locator('.slx-town .slx-talk.slx-talk--memory').count()) > 0; i++) {
        if (!(await page.locator('.slx-town .slx-talk .slx-next').isVisible())) await w.key('z');   // the line whole
        await w.key('z');
      }
      await expect(page.locator('.slx-town .slx-talk.slx-talk--memory')).toHaveCount(0);
      await expect(page.locator('.slx-town .slx-veil-past.slx-on')).toHaveCount(0);
      await expect(page.locator(`.slx-town .slx-veil-night.slx-on.slx-moon-${moon}`)).toHaveCount(1);
      if (!(await page.locator('.slx-town .slx-talk .slx-next').isVisible())) await w.key('z');   // the line whole
      await page.waitForTimeout(500);   // the past veil fades out (0.45s)
    },
  })),
  {
    // Story L: a group scene, the first thing of the night, under its own card (the inn's dinner, not the night's).
    name: 'group-scene', visit: async (page, w) => {
      await readAll(page, w);   // the night's memory
      await page.evaluate(() => {
        const d = (window as unknown as { __starlanternDebug: { game: { arrival: string[]; night: string[] } } }).__starlanternDebug;
        d.game.arrival = [];
        d.game.night = ['group:act2'];
      });
      await go(page, 'town');
      await expect(page.locator('.slx-town .slx-talk')).toBeVisible();
      await w.key('z');   // the day's line
      if (!(await page.locator('.slx-town .slx-place-card').isVisible())) await w.key('z');   // the line whole first
      await expect(page.locator('.slx-town .slx-place-card')).toHaveText('月影旅館・晚飯');
      if (!(await page.locator('.slx-town .slx-talk .slx-next').isVisible())) await w.key('z');   // the line whole
    },
  },
  {
    name: 'guild', visit: async (page, w) => {
      await readAll(page, w);   // the group scene
      await storyOff(page);
      await facility(page, w, 'guild', '.slx-guild');
    },
  },
  {
    // Guild quests PR B (controller ruling, spec §0 item 23): the guild's window with 委託 listed, its eleven 16px rows. The
    // switch (off until PR D) is on only while the guild draws its list, and Anna's greeting on this second visit draws from a
    // stand-in rng, so the game's own stream (the labyrinth screens after this one) is what it was without this screen.
    name: 'guild-board-listed', visit: async (page, w) => {
      const live = (on: boolean) => page.evaluate((v) => {
        const d = (window as unknown as { __starlanternDebug: { guild: { GUILD_SWITCH: { live: boolean } }; game: { rng: () => number; keep?: () => number } } }).__starlanternDebug;
        d.guild.GUILD_SWITCH.live = v;
        if (v) { d.game.keep = d.game.rng; d.game.rng = () => 0; } else { d.game.rng = d.game.keep!; delete d.game.keep; }
      }, on);
      await live(true);
      await facility(page, w, 'guild', '.slx-guild');
      await live(false);
      await expect(page.locator('.slx-guild .slx-cmd.slx-cmd-board [role=option]')).toHaveCount(11);
    },
  },
  {
    name: 'shop-buy', visit: async (page, w) => {
      await facility(page, w, 'shop', '.slx-shop');
      await page.locator('.slx-shop .slx-cmd [data-id=buy]').click();
      // The cursor on a piece of gear, so the comparison shows.
      const cur = page.locator('.slx-shop-list [aria-selected=true] .slx-label');
      for (let i = 0; i < 30 && !((await cur.getAttribute('class')) ?? '').includes('slx-rarity-'); i++) await w.key('ArrowDown');
      await expect(page.locator('.slx-info .slx-cmp-list')).toBeVisible();
    },
  },
  {
    name: 'shop-qty', visit: async (page, w) => {
      await w.key('Enter');
      await expect(page.locator('.slx-qty')).toBeVisible();
    },
  },
  {
    name: 'shop-mats', visit: async (page, w) => {
      await w.key('Escape'); await w.key('Escape');
      await page.locator('.slx-shop .slx-cmd [data-id=sell]').click();
      await page.locator('.slx-shop-pages [data-id=mats]').click();
      await expect(page.locator('.slx-shop [data-id=moss]')).toBeVisible();
    },
  },
  {
    name: 'shop-sell-gear', visit: async (page, w) => {
      await w.key('Escape');
      await page.locator('.slx-shop-pages [data-id=gear]').click();
      await expect(page.locator('.slx-shop [role=option]', { hasText: gearLabel({ ...longestGear(), uid: 0 }) })).toBeVisible();
    },
  },
  {
    name: 'shop-runes', visit: async (page, w) => {
      await w.key('Escape'); await w.key('Escape');
      await expect(page.locator('.slx-shop .slx-list')).toHaveCount(0);
      await page.locator('.slx-shop .slx-cmd [data-id=runes]').click();
      await expect(page.locator('.slx-shop .slx-list [role=option]').first()).toBeVisible();
      // Art step 9: each rune row leads with its cell (icon in its tier frame) and stays one line tall.
      await runeRowsKeepTheirLine(page, '.slx-shop .slx-list');
    },
  },
  { name: 'inn', visit: async (page, w) => facility(page, w, 'inn', '.slx-inn') },
  {
    name: 'portals', visit: async (page, w) => {
      await facility(page, w, 'gate', '.slx-gate');
      await w.key('Enter');
      await expect(page.locator('.slx-portal')).toHaveCount(3);
    },
  },
  {
    name: 'depths', visit: async (page) => {
      await page.locator('.slx-portal').first().click();
      await expect(page.locator('.slx-depths [role=option]').first()).toBeVisible();
    },
  },
  ...(['dismantle', 'enhance', 'reroll', 'fuse', 'craft', 'runes'] as const).map((tab) => ({
    name: `forge-${tab}`, visit: async (page: Page, w: SpecHelpers) => {
      await facility(page, w, 'forge', '.slx-forge');
      await page.locator(`.slx-forge .slx-cmd [data-id=${tab}]`).click();
      await expect(page.locator('.slx-forge .slx-list [role=option]').first()).toBeVisible();
    },
  })),
  { name: 'settings', visit: async (page) => { await go(page, 'settings'); await expect(page.locator('.slx-settings')).toBeVisible(); } },
  {
    name: 'keys', visit: async (page) => {
      await page.locator('.slx-settings [data-id=keys]').click();
      await expect(page.locator('.slx-keys')).toBeVisible();
    },
  },
  { name: 'formation', visit: async (page) => { await go(page, 'formation'); await expect(page.locator('.slx-formation-scene')).toBeVisible(); } },
  ...(['stats', 'gear', 'skills', 'tree', 'talent', 'ultimate'] as const).map((tab) => ({
    name: `status-${tab}`, visit: async (page: Page) => {
      await go(page, 'status', `tab:${tab}`);
      await expect(page.locator(`.slx-status-scene [data-tab=${tab}]`)).toHaveAttribute('aria-selected', 'true');
    },
  })),
  // Art step 9: the skills tab and the tree with every skill's native icon (16 in a row, 14 on a node), each whole.
  { name: 'status-skills-icons', visit: async (page) => { await go(page, 'status', 'tab:skills:noel'); await nativeIcons(page, '.slx-tab-skills', 'img.slx-skill-ico', 16); } },
  { name: 'status-tree-icons', visit: async (page) => { await go(page, 'status', 'tab:tree:noel'); await nativeIcons(page, '.slx-status-scene', '.slx-tree-node img.slx-skill-ico', 14, 3); } },
  { name: 'equip', visit: async (page) => { await go(page, 'equip'); await expect(page.locator('.slx-equip-scene')).toBeVisible(); } },
  ...HANDBOOK_TABS.map((tab, i) => ({
    name: i === 0 ? 'handbook' : `handbook-${tab}`, visit: async (page: Page) => {
      if (i === 0) await go(page, 'handbook');
      else await page.locator('.slx-handbook [role=tab]').nth(i).click();
      await expect(page.locator('.slx-handbook [role=tab]').nth(i)).toHaveAttribute('aria-selected', 'true');
    },
  })),
  {
    // Story L: a memory piece found and still untold is listed and marked 新 (and so is its owner's row); reading it tells it.
    name: 'handbook-new', visit: async (page) => {
      await page.evaluate(() => {
        const d = (window as unknown as { __starlanternDebug: { game: { state: { party: { roster: { rin: { memories?: number } } }; story: { seen: string[]; untold?: string[] } } } } }).__starlanternDebug;
        const { story, party } = d.game.state;
        const k = [1, 2, 3, 4, 5, 6, 7].find((n) => !story.seen.includes(`mem:rin:${n}`) && !(story.untold ?? []).includes(`mem:rin:${n}`));
        if (!k) return;
        party.roster.rin.memories = Math.max(party.roster.rin.memories ?? 0, k);
        story.untold = [...(story.untold ?? []), `mem:rin:${k}`];
      });
      await go(page, 'handbook');
      const rin = page.locator('.slx-handbook .slx-hb-list [role=option][data-id=rin]');
      await expect(rin.locator('.slx-fresh')).toHaveText(T.ui2.handbook.fresh);
      await rin.click();
      await expect(page.locator('.slx-handbook .slx-hb-list [role=option] .slx-fresh').first()).toHaveText(T.ui2.handbook.fresh);
    },
  },
  {
    // Time and moon (Task 4): Selene's pieces not found yet say the moon each waits for, the longest hints in the list.
    name: 'handbook-moon', visit: async (page) => {
      await go(page, 'handbook');
      await page.locator('.slx-handbook .slx-hb-list [role=option][data-id=selene]').click();
      const full = page.locator('.slx-handbook .slx-hb-list [role=option]').filter({ hasText: `・${T.ui2.calendar.moon.full}` });
      await expect(full.first()).toBeVisible();
      await expect(page.locator('.slx-handbook .slx-hb-list [role=option]').filter({ hasText: `・${T.ui2.calendar.moon.new}` })).toHaveCount(1);
    },
  },
  {
    // The first workshop visit with runes in the bag tells the rune tutorial (plan 8g).
    name: 'rune-tutorial', visit: async (page, w) => {
      await go(page, 'workshop');
      const talk = page.locator('.slx-workshop .slx-talk');
      await expect(talk).toBeVisible();
      if (!(await talk.locator('.slx-next').isVisible())) await w.key('z');
      await expect(talk.locator('.slx-next')).toBeVisible();
    },
  },
  {
    name: 'workshop', visit: async (page, w) => {
      await readAll(page, w);
      await expect(page.locator('.slx-workshop .slx-ws-skills')).toBeVisible();
    },
  },
  {
    // Noel at Lv 20: two slots open on 火之星彈, and slot 1's list holds every rune.
    name: 'workshop-runes', visit: async (page, w) => {
      await go(page, 'workshop', 'noel:fire-star');
      await expect(page.locator('.slx-ws-skills [aria-selected=true]')).toHaveAttribute('data-id', 'fire-star');
      await w.key('Enter');                                   // her slots
      await w.key('Enter');                                   // slot 1's runes
      await expect(page.locator('.slx-ws-runes [role=option]').first()).toBeVisible();
    },
  },
  {
    // Art step 9: runes socketed on 火之星彈, one working (擴散) and one doing nothing there (重擊 needs a skill of more than
    // one hit): the skill list's slot icons, and the slots with each rune's cell in its tier frame.
    name: 'workshop-socketed', visit: async (page, w) => {
      await page.evaluate(() => {
        const g = (window as unknown as Dbg).__starlanternDebug.game;
        g.state.party.roster.noel.sockets = { 'fire-star': [{ id: 'spread', tier: 'rare' }, { id: 'heavy', tier: 'common' }] };
      });
      await go(page, 'workshop', 'noel:fire-star');
      await expect(page.locator('.slx-ws-skills [data-id=fire-star] .slx-right [data-mark]')).toHaveCount(2);
      await w.key('Enter');                                   // her slots
      await expect(page.locator('.slx-ws-slot .slx-rune-cell')).toHaveCount(2);
    },
  },
  {
    // Art step 9: the skills page's slot icons after a skill's name (a working rune, one greyed).
    name: 'status-skills-runed', visit: async (page) => {
      await go(page, 'status', 'tab:skills:noel');
      await expect(page.locator('.slx-skill[data-skill=fire-star] .slx-skill-slots [data-mark]')).toHaveCount(2);
      await expect(page.locator('.slx-skill[data-skill=fire-star] .slx-skill-slots .slx-rune-off')).toHaveCount(1);
    },
  },
  { name: 'builds', visit: async (page) => { await go(page, 'builds'); await expect(page.locator('.slx-builds')).toBeVisible(); } },
  // The act 1 clear card: `go` shows it without changing the game.
  { name: 'clear', visit: async (page) => { await go(page, 'clear'); await expect(page.locator('.slx-clear [role=option]').first()).toBeVisible(); } },
  {
    // Difficulty plan Task 7a: Nightmare open (the main road reached 12), Glen's one line closed, Nightmare chosen with E;
    // Hell stays locked and says what opens it (the row's longest words). The plain 'portals' screen shows both locked.
    name: 'portals-tier', visit: async (page, w) => {
      await game(page, 'g.state.dungeon.reached.mainline = 12; delete g.state.dungeon.tier;');
      await facility(page, w, 'gate', '.slx-gate');
      await w.key('Enter');
      await expect(page.locator('.slx-portal')).toHaveCount(3);
      await w.key('e');
      await expect(page.locator('.slx-tier-sel')).toHaveAttribute('data-tier', 'nightmare');
      await expect(page.locator('.slx-tier-locked[data-tier=hell] .slx-tier-cond')).toBeVisible();
      await expect(page.locator('.slx-portal-tier').first()).toBeVisible();
    },
  },
  {
    name: 'depths-tier', visit: async (page) => {
      await page.locator('.slx-portal').first().click();
      await expect(page.locator('.slx-depths [role=option] .slx-right').first()).toContainText('噩夢');
    },
  },
  {
    name: 'confirm-tier', visit: async (page, w) => {
      await w.key('Enter');                                   // depth 1
      await expect(page.locator('.slx-confirm')).toContainText('難度：噩夢');
    },
  },
  {
    // Difficulty plan Task 7c: the handbook's 難度 page, listed now that Nightmare is open; the cursor on Hell, its longest
    // detail (still shut: the condition and the status).
    name: 'handbook-tiers', visit: async (page, w) => {
      await go(page, 'handbook');
      await page.locator('.slx-handbook [role=tab]', { hasText: T.ui2.handbook.tabs.tiers }).click();
      await expect(page.locator('.slx-handbook [role=tab]', { hasText: T.ui2.handbook.tabs.tiers })).toHaveAttribute('aria-selected', 'true');
      await w.key('ArrowDown'); await w.key('ArrowDown');
      await expect(page.locator('.slx-hb-detail h4')).toHaveText(T.ui2.tier.names.hell);
      // Its longest detail fits its column: nothing cut at the bottom.
      expect(await page.locator('.slx-hb-detail').evaluate((e) => e.scrollHeight <= e.clientHeight + 0.5)).toBe(true);
    },
  },
  {
    name: 'confirm', visit: async (page, w) => {
      // The sweep's own save again for the rest (difficulty plan Task 7a): the main road at 1, the tier row unseen.
      await game(page, 'g.state.dungeon.reached.mainline = 1; delete g.state.dungeon.tier;');
      await facility(page, w, 'gate', '.slx-gate');
      await w.key('Enter');                                   // 選擇傳送門
      await expect(page.locator('.slx-portal')).toHaveCount(3);
      await w.key('Enter'); await w.key('Enter');             // the mainline card, depth 1
      await expect(page.locator('.slx-confirm')).toBeVisible();
    },
  },
  {
    // Story L (controller ruling 2026-10-24): the dawn before departure, one memory told at the gate under the dawn's card.
    name: 'dawn', visit: async (page, w) => {
      await page.evaluate(() => {
        const d = (window as unknown as { __starlanternDebug: { game: { state: { party: { recruited: string[]; roster: Record<string, { memories?: number }> }; story: { seen: string[]; untold?: string[]; dawn?: string } } }; settings: { get(): object; set(s: object): void } } }).__starlanternDebug;
        d.settings.set({ ...d.settings.get(), story: 'all' });
        const { story, party } = d.game.state;
        const ids = party.recruited.filter((c) => c !== 'hero' && c !== 'rin' && !story.seen.includes(`mem:${c}:1`) && !(story.untold ?? []).includes(`mem:${c}:1`)).slice(0, 4);
        for (const c of ids) party.roster[c].memories = Math.max(party.roster[c].memories ?? 0, 1);
        story.untold = [...(story.untold ?? []), ...ids.map((c) => `mem:${c}:1`)];
        story.dawn = `mem:${ids[0]}:1`;
      });
      await w.key('ArrowUp'); await w.key('Enter');           // 是
      await expect(page.locator('.slx-gate .slx-talk')).toBeVisible();
      await expect(page.locator('.slx-gate .slx-place-card')).toHaveText('月影旅館・清晨');
      if (!(await page.locator('.slx-gate .slx-talk .slx-next').isVisible())) await w.key('z');   // the line whole
    },
  },
  {
    // Story L: the night before the descent, said at the gate on the departure that owes it, under the night's card.
    name: 'eve', visit: async (page, w) => {
      // The dawn's memory read, the party sets out; straight back by the entrance, then to the gate's question again.
      await readAll(page, w);
      await expect(page.locator('.slx-dungeon')).toBeVisible();
      await page.evaluate(() => (window as unknown as { __starlanternDebug: { game: { returnToTown(): boolean } } }).__starlanternDebug.game.returnToTown());
      await facility(page, w, 'gate', '.slx-gate');
      await w.key('Enter');                                   // 選擇傳送門
      await expect(page.locator('.slx-portal').first()).toBeVisible();
      await w.key('Enter'); await w.key('Enter');             // the mainline card, depth 1
      await expect(page.locator('.slx-confirm')).toBeVisible();
      await page.evaluate(() => {
        const d = (window as unknown as { __starlanternDebug: { game: { state: { story: { queue: string[] } } }; settings: { get(): object; set(s: object): void } } }).__starlanternDebug;
        d.settings.set({ ...d.settings.get(), story: 'all' });
        d.game.state.story.queue.push('finale-eve');
      });
      await w.key('ArrowUp'); await w.key('Enter');           // 是
      await expect(page.locator('.slx-gate .slx-talk')).toBeVisible();
      await expect(page.locator('.slx-gate .slx-place-card')).toHaveText('月影旅館・夜');
      if (!(await page.locator('.slx-gate .slx-talk .slx-next').isVisible())) await w.key('z');   // the line whole
    },
  },
  {
    name: 'dungeon', visit: async (page, w) => {
      await readAll(page, w);                                 // the eve, then the party sets out
      await storyOff(page);
      await expect(page.locator('.slx-dungeon')).toBeVisible(); await w.closeTalk();
    },
  },
  {
    name: 'field-menu', visit: async (page, w) => {
      await w.key('c');
      await expect(page.locator('.slx-field-menu')).toBeVisible();
    },
  },
  {
    name: 'handbook-dungeon', visit: async (page, w) => {
      await w.choose('.slx-field-menu', T.ui2.dungeon.handbook);
      await expect(page.locator('.slx-handbook .slx-hint')).toHaveText(T.ui2.handbook.hintReadonly);
    },
  },
  {
    name: 'event-altar', visit: async (page, w) => {
      await w.key('Escape');
      await expect(page.locator('.slx-dungeon')).toBeVisible(); await w.closeTalk();
      await placeBeside(page, 'altar', 0, 'altar');
      await w.key('ArrowRight');
      await expect(page.locator('.slx-event-altar .slx-event-art')).toBeVisible();
    },
  },
  {
    name: 'event-fountain', visit: async (page, w) => {
      await leaveEvent(page, w);                              // 離開: the party stays on the altar
      chests.push((await placeBeside(page, 'fountain', 1, 'fountain')).at);
      await w.key('ArrowRight');
      await expect(page.locator('.slx-event-fountain .slx-event-art')).toBeVisible();
    },
  },
  {
    // The merchant with the three priced items whose names are longest: the longest list his window can show.
    name: 'event-merchant', visit: async (page, w) => {
      await leaveEvent(page, w);
      chests.push((await placeBeside(page, 'merchant', 2, 'merchant', { stock: LONGEST_STOCK })).at);
      await w.key('ArrowRight');
      await expect(page.locator('.slx-event-merchant .slx-event-art')).toBeVisible();
      await expect(page.locator('.slx-event-merchant [role=option]')).toHaveCount(LONGEST_STOCK.length + 1);   // and 離開
    },
  },
  {
    name: 'event-vault-locked', visit: async (page, w) => {
      await leaveEvent(page, w);
      chests.push((await placeBeside(page, 'vault', 3, 'vault')).at);
      await w.key('ArrowRight');
      await expect(page.locator('.slx-event-vault')).toContainText(T.ui2.event.vault.locked);
    },
  },
  {
    // The key's line (a talk line, not a window), then the vault it opens.
    name: 'event-key', visit: async (page, w) => {
      await leaveEvent(page, w);
      await placeBeside(page, 'key', 4);
      await w.key('ArrowRight');
      await expect(page.locator('.slx-talk')).toContainText(T.ui2.event.key);
    },
  },
  {
    name: 'event-vault-ready', visit: async (page, w) => {
      await leaveEvent(page, w);
      chests.push((await placeBeside(page, 'vault', 6, 'vault')).at);
      await w.key('ArrowRight');
      await expect(page.locator('.slx-event-vault')).toContainText(T.ui2.event.vault.ready);
      await expect(page.locator('.slx-event-vault [role=option]')).toHaveCount(2);                  // 打開, 離開
    },
  },
  {
    // A trap says what it did in a talk line.
    name: 'event-trap', visit: async (page, w) => {
      await leaveEvent(page, w);
      await placeBeside(page, 'trap', 7);
      await w.key('ArrowRight');
      await expect(page.locator('.slx-talk')).toBeVisible();
    },
  },
  {
    name: 'event-elite', visit: async (page, w) => {
      await leaveEvent(page, w);
      await placeBeside(page, 'elite', 5);
      await w.key('ArrowRight');                              // seen from the doorway: asked before the fight
      await expect(page.locator('.slx-event-elite .slx-event-art')).toBeVisible();
    },
  },
  {
    // A chest whose gear does not fit a full bag: the 背包已滿 window offers the run pack's gear to throw away.
    name: 'event-chest-full', visit: async (page, w) => {
      await w.key('Escape');                                  // 離開: no fight
      await expect(page.locator('.slx-event-elite')).toHaveCount(0);
      await unplace(page, await game<{ x: number; y: number }>(page, 'return { x: g.pos.x + 1, y: g.pos.y };'));
      await game(page, `
        const mk = (r) => ({ uid: g.mintUid(), base: 'iron-sword', rarity: r, ilvl: 2, enhance: 0, affixes: [{ key: 'atk', value: 2 }] });
        g.run.loot.gear.push(mk('magic'), mk('rare'), mk('common'));
        while (g.state.bag.length + g.run.loot.gear.length < ${BAG_SIZE}) g.state.bag.push(mk('common'));
      `);
      const full = page.locator('.slx-full');
      for (let n = 11; n < 80 && !(await full.isVisible()); n += 3) {
        chests.push((await placeBeside(page, 'chest', n)).at);
        await w.key('ArrowRight');
        await w.closeTalk();
      }
      await expect(full).toContainText(T.ui2.event.full.bagTitle(BAG_SIZE));
      await expect(full.locator('[role=option]').first()).toBeVisible();
    },
  },
  {
    name: 'stairs', visit: async (page, w) => {
      await w.key('Escape');                                  // 放棄: the gear stays in the chest
      await w.closeTalk();
      await expect(page.locator('.slx-full')).toHaveCount(0);
      for (const at of chests.splice(0)) await unplace(page, at);   // the tried chests no longer block the way
      const keys = await toStairs(page);
      expect(keys.length).toBeGreaterThan(0);
      await walk(page, keys);
      await expect(page.locator('.slx-event-stairs')).toBeVisible();
    },
  },
  {
    name: 'battle', visit: async (page, w) => {
      await w.key('Enter');                                   // 留在這層
      await expect(page.locator('.slx-event-stairs')).toHaveCount(0);
      for (let i = 0; i < 200 && !(await page.locator('.slx-battle').isVisible()); i++) {
        await w.key(i % 2 ? 'ArrowLeft' : 'ArrowRight');
        await w.closeTalk();
        if (await page.locator('.slx-confirm').isVisible()) await w.key('Enter');
        if (await page.locator('.slx-event').isVisible()) await w.key('Escape');
      }
      await expect(page.locator('.slx-battle')).toBeVisible();
      await game(page, 'for (const e of g.battle.enemies) { e.max.hp = 999; e.hp = 999; e.max.atk = 1; e.max.mag = 1; }');
      await commandMenu(page);
    },
  },
  {
    // Art step 9 (G4): the party's ailment and mechanic words with their 14px icons (one member's row folding into +N),
    // the field bar's barrier and moon with theirs, and the foes' rows (Pixi) with theirs.
    name: 'battle-chips', visit: async (page, w) => {
      await game(page, `
        const [a, b] = g.battle.party;
        a.poison = true; a.burn = { tick: 1, turns: 3, src: 'e0' }; a.bleed = [{ tick: 1, turns: 3, src: 'e0' }]; a.shock = 3; a.chill = 3;
        b.sleep = 3;
        for (const e of g.battle.enemies) { e.burn = { tick: 1, turns: 3, src: 'hero' }; e.shock = 3; }
        g.battle.barriers = [{ skill: 'ward', kind: 'guard', power: 30, turns: 9, src: 'chizuru' }];
        g.battle.moon = { phase: 'full' };`);
      // One round on guard redraws every panel, the bar and the foes' rows with the words.
      for (let i = 0; i < 60 && (await game<number>(page, 'return g.battle?.round ?? -1;')) === 0; i++) {
        if (await page.locator('.slx-bcmd [role=option]').count()) await w.choose('.slx-bcmd', '防禦');
        else await page.waitForTimeout(50);
      }
      await commandMenu(page);
      await nativeIcons(page, '.slx-partybar', 'img.slx-chip-ico', 14, 2);
      await nativeIcons(page, '.slx-fieldbar', 'img.slx-chip-ico', 14, 2);
      await expect(page.locator('.slx-partybar .slx-ail-more').first()).toBeVisible();
      const foeIcons = await page.evaluate(() => {
        type N = { children?: N[]; texture?: { width: number; height: number }; width?: number; height?: number; text?: unknown; destroyed?: boolean };
        const v = (window as unknown as { __starlanternDebug: { stage: { battleView: { ailmentIcons(k: string): N[] } } } }).__starlanternDebug.stage.battleView;
        return v.ailmentIcons('e0').map((s) => [s.width, s.height]);
      });
      expect(foeIcons.length).toBeGreaterThan(0);
      for (const s of foeIcons) expect(s).toEqual([14, 14]);
    },
  },
  {
    // Touch overflow: a member's +N tapped (clicked here) opens the list of her whole row, over the battle.
    name: 'battle-chips-more', visit: async (page) => {
      await page.locator('.slx-partybar .slx-ail-more').first().click();
      await expect(page.locator('.slx-more-pop')).toBeVisible();
      expect(await page.locator('.slx-more-pop > *').count()).toBeGreaterThan(3);
    },
  },
  {
    name: 'battle-skills', visit: async (page, w) => {
      if (await page.locator('.slx-more-pop').isVisible()) await w.key('Escape');   // the +N list, closed first
      for (let i = 0; i < 8; i++) {
        await w.choose('.slx-bcmd', '技能');
        if (await page.locator('.slx-bsub').isVisible()) break;
        await w.choose('.slx-bcmd', '防禦');                   // no skill to show: the next member
        await commandMenu(page);
      }
      await expect(page.locator('.slx-bsub [role=option]').first()).toBeVisible();
      await nativeIcons(page, '.slx-bsub', 'img.slx-skill-menu-ico', 16);   // art step 9: each skill's 16px icon in its row
    },
  },
  {
    // Art step 9: the skill menu with working runes on its skills: each rune's 14px icon after the name, the row one line.
    name: 'battle-skills-runed', visit: async (page, w) => {
      await page.evaluate(() => {
        const g = (window as unknown as Dbg).__starlanternDebug.game;
        const who = document.querySelector('.slx-bcmd .slx-who')?.textContent ?? '';
        const c = g.battle.party.find((x: { name: string }) => who.startsWith(x.name));
        const ids = [...document.querySelectorAll<HTMLElement>('.slx-bsub [role=option]')].map((e) => e.dataset.id!);
        c.runes = Object.fromEntries(ids.map((id) => [id, [{ id: 'on-struck', tier: 'magic' }, { id: 'multistrike', tier: 'magic' }, { id: 'drain', tier: 'rare' }]]));
      });
      await w.key('Escape');                                  // the command menu
      await w.choose('.slx-bcmd', '技能');                     // the skills again, drawn with their runes
      await expect(page.locator('.slx-bsub [role=option] .slx-badge img.slx-rune-ico-14').first()).toBeVisible();
      await runeRowsKeepTheirLine(page, '.slx-bsub');
    },
  },
  {
    name: 'battle-target', visit: async (page, w) => {
      await w.key('Escape');
      await expect(page.locator('.slx-bsub')).toHaveCount(0);
      // Two foes or more: 攻擊 asks which. One foe: a potion asks which member instead.
      const foes = await game<number>(page, 'return g.battle.enemies.filter((e) => e.alive).length;');
      if (foes > 1) await w.choose('.slx-bcmd', '攻擊');
      else { await w.choose('.slx-bcmd', '道具'); await w.key('Enter'); }
      await expect(page.locator('.slx-btarget')).toBeVisible();
    },
  },
  {
    name: 'result', visit: async (page, w) => {
      for (let i = 0; i < 4 && (await page.locator('.slx-bsub').count()); i++) await w.key('Escape');
      await game(page, 'for (const e of g.battle.enemies) { e.max.hp = 1; e.hp = 1; }');
      for (let i = 0; i < 40 && !(await page.locator('.slx-result').isVisible()); i++) {
        if (await page.locator('.slx-bcmd [role=option]').count()) { await w.key('ArrowUp'); await w.key('Enter'); }   // 全員攻擊 (last item)
        else await page.waitForTimeout(50);
      }
      await expect(page.locator('.slx-result')).toBeVisible();
    },
  },
  {
    // Difficulty plan Task 7b: Hell opened, a Hell run into 熾焰之地 at depth 20 (its elites have the longest names); the
    // badge stands beside the condition.
    name: 'dungeon-tier', visit: async (page, w) => {
      await game(page, `
        g.battle = null; g.run = null; g.phase = 'town';
        const d = g.state.dungeon;
        d.reached.mainline = 30; d.reached.blaze = 20; d.bossKills['nightmare:mainline:25'] = 1;
        g.state.story.finaleCleared = true;
        if (!g.chooseTier('hell').ok) throw new Error('Hell did not open');
        const r = g.depart({ region: 'blaze', condition: 'plain' }, 20);
        if (!r.ok) throw new Error('no departure: ' + r.reason);
      `);
      await go(page, 'dungeon');
      await expect(page.locator('.slx-dungeon')).toBeVisible(); await w.closeTalk();
      await expect(page.locator('.slx-tier-badge')).toHaveText(T.ui2.tier.names.hell);
    },
  },
  {
    // A Hell elite of that depth, then the fullest picture of it: five of its group, every one wearing the elite's two
    // affixes and three ailments (the rows above their heads at their fullest).
    name: 'battle-affix', visit: async (page, w) => {
      await placeBeside(page, 'elite', 5);
      await w.key('ArrowRight');
      await expect(page.locator('.slx-event-elite')).toBeVisible();
      await w.key('Enter');                                   // 挑戰
      await expect(page.locator('.slx-battle')).toBeVisible();
      const n = await game<number>(page, 'return g.battle.enemies[0].affixes.length;');
      expect(n).toBe(2);
      await game(page, `
        const ids = g.battle.enemies.map((e) => e.defId);
        const five = [0, 1, 2, 3, 4].map((i) => ids[i % ids.length]);
        const affixes = [...g.battle.enemies[0].affixes];
        g.startBattle(five, false, true, five[0]);
        for (const e of g.battle.enemies) { e.affixes = [...affixes]; e.poison = true; e.shock = 2; e.chill = 2; e.max.hp = 999; e.hp = 999; e.max.atk = 1; e.max.mag = 1; }
      `);
      await go(page, 'battle');
      await commandMenu(page);
      const lead = await page.evaluate(() => (window as unknown as { __starlanternDebug: { stage: { battleView: { ailmentTexts(k: string): { text: string }[] } } } }).__starlanternDebug.stage.battleView.ailmentTexts('e4')[0]?.text);
      expect(Object.values(AFFIXES).map((a) => a.name)).toContain(lead);
    },
  },
  {
    // Touch overflow review: the rightmost of the five, its +N tapped (clicked here): its whole row, the elite's two
    // long affixes first, in a list that ends at the target's right edge and stays on the screen.
    name: 'battle-affix-more', visit: async (page) => {
      const hits = page.locator('.slx-foe-more');
      expect(await hits.count()).toBeGreaterThan(0);
      const last = hits.last();
      await expect(last).toHaveClass(/slx-foe-more-end/);
      await last.click();
      const pop = page.locator('.slx-foe-more-end > .slx-more-pop');
      await expect(pop).toBeVisible();
      await expect(pop.locator('.slx-affix')).toHaveCount(2);
      const b = await stageBox(page, pop);
      expect(b.x, 'the list starts on the screen').toBeGreaterThanOrEqual(-0.5);
      expect(b.x + b.width, 'the list ends on the screen').toBeLessThanOrEqual(640.5);
    },
  },
  {
    // The target list over the first of them: the note says each affix, a line each.
    name: 'battle-affix-target', visit: async (page, w) => {
      if (await page.locator('.slx-more-pop').isVisible()) await w.key('Escape');   // the +N list, closed first
      await w.choose('.slx-bcmd', '攻擊');
      await expect(page.locator('.slx-btarget')).toBeVisible();
      await expect(page.locator('.slx-bnote')).toHaveClass(/slx-bnote-lines/);
    },
  },
  {
    // The ending card: the game as the finale left it (no scenes owed), shown by `go`.
    name: 'finale', visit: async (page, w) => {
      await game(page, "g.cleared = 'finale'; g.finale = { pieces: [] };");
      await go(page, 'clear');
      const card = page.locator('.slx-clear [role=option]');
      for (let i = 0; i < 60 && !(await card.first().isVisible()); i++) {
        if (await page.locator('.slx-talk:not([hidden])').isVisible()) await w.key('z'); else await page.waitForTimeout(50);
      }
      await expect(page.locator('.slx-clear')).toContainText(STORY.endingTitle);
    },
  },
];

/**
 * Starts a sweep game and visits every SWEEP screen in turn; on each, the viewport takes each of `sizes` and `onScreen`
 * runs. Returns the page errors seen.
 */
export async function sweep(page: Page, sizes: readonly SweepSize[], onScreen: (name: string, size: SweepSize) => Promise<void>): Promise<string[]> {
  const w = await startSweepGame(page);
  for (const s of SWEEP) {
    await s.visit(page, w);
    for (const size of sizes) {
      await fitTo(page, size.width, size.height);   // 390x844: a touch phone held upright (Task 2b)
      await onScreen(s.name, size);
    }
  }
  return w.errors;
}

// ── Task 2a: the stage scale and the guard ───────────────────────────────────────────────────────────────────────────

export type Rect = { x: number; y: number; width: number; height: number };
export type StageMode = { kind: 'scale' | 'sideways'; s: number };

/** The device pixel ratios the stylesheet knows (ruling 1); any other gets a whole CSS scale. */
export const KNOWN_DPR = [1, 1.1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.625, 2.75, 3, 3.5, 4] as const;

/**
 * The stage scale ruling 1 (and, for a touch phone held upright, ruling 2) gives a `vw` x `vh` window at device pixel ratio
 * `d`: s·d whole, with K = floor(min(vw·d/640, vh·d/360)) device pixels per stage pixel, s = K/d at most 6, used only
 * when s ≥ 1; when no crisp scale of 1 or more fits, s is exactly 1 (readable over crisp: a smaller stage makes the text
 * physically tiny). An unknown d: a whole CSS scale from 1 to 6.
 */
export function expectedMode(vw: number, vh: number, d: number, touch: boolean): StageMode {
  const sideways = touch && vh >= vw && vw < 640;
  const [w, h] = sideways ? [360, 640] : [640, 360];
  const [aw, ah] = sideways ? [vw, vh - 40] : [vw, vh];
  const kind = sideways ? 'sideways' : 'scale';
  const known = KNOWN_DPR.find((k) => Math.abs(k - d) < 0.005);
  if (known === undefined) return { kind, s: Math.max(1, Math.min(6, Math.floor(Math.min(aw / w, ah / h) + 1e-9))) };
  const K = Math.min(Math.floor(Math.min((aw * known) / w, (ah * known) / h) + 1e-9), Math.floor(6 * known + 1e-9));
  if (K < 1) return { kind, s: 1 };
  if (K < Math.ceil(known - 1e-9)) return { kind, s: 1 };   // no crisp scale of 1x or more: plain 1x
  return { kind, s: K / known };
}

/** The stage's scale as drawn: read from the computed transform matrix of #sl-screen. */
export const stageScale = (page: Page): Promise<StageMode> => page.evaluate(() => {
  const m = new DOMMatrixReadOnly(getComputedStyle(document.getElementById('sl-screen')!).transform);
  return Math.abs(m.b) > 1e-6 ? { kind: 'sideways' as const, s: Math.hypot(m.a, m.b) } : { kind: 'scale' as const, s: m.a };
});

/** `target`'s box in stage px (0..640 x 0..360), whatever the stage's scale or turn. */
export const stageBox = async (page: Page, target: Locator): Promise<Rect> => {
  const mode = await stageScale(page);
  const scr: Rect = await page.locator('#sl-screen').evaluate((e) => e.getBoundingClientRect().toJSON());
  const r: Rect = await target.evaluate((e) => e.getBoundingClientRect().toJSON());
  const s = mode.s;
  if (mode.kind === 'scale') return { x: (r.x - scr.x) / s, y: (r.y - scr.y) / s, width: r.width / s, height: r.height / s };
  return { x: (r.y - scr.y) / s, y: (scr.x + scr.width - (r.x + r.width)) / s, width: r.height / s, height: r.width / s };
};

/** The windows ruling 8 centres: their top-left must sit on a whole stage pixel. */
const CENTRED = ['.slx-confirm', '.slx-layer.slx-confirm', '.slx-result', '.slx-settings', '.slx-keys', '.slx-clear-card', '.slx-title-menu', '.slx-depths', '.slx-event'];

type DomNode = { nodeId: number; nodeType: number; nodeName: string; nodeValue: string; children?: DomNode[]; attributes?: string[] };

/**
 * What keeps the screen from reading clearly, as a list of problems (empty: it reads clearly). Nothing to check before
 * the game is ready. The scale is the one `expectedMode` gives; the stage's corner sits on a whole device pixel; the page
 * scrolls no further than the stage overflows; every text is 12 or 24px Cubic 11 at weight 400 with an even leading of
 * 14px or more, and the centred windows sit on whole stage pixels (every scene since Task 7); and (chromium, the font
 * not blocked) every text is drawn with Cubic 11 itself, as the browser reports it.
 */
export async function legibility(page: Page, opts: { fontBlocked?: boolean; requireReady?: boolean; readyMs?: number } = {}): Promise<string[]> {
  // The afterEach guard checks whatever a test ended on (a test may never load the game); a caller that measures a screen
  // passes requireReady, so a game that never became ready (within readyMs, default 10s) is a failure, not a silent pass.
  const fail = opts.requireReady ? ['the game never became ready'] : [];
  if (page.isClosed()) return fail;
  const isReady = () => page.evaluate(() => !!document.getElementById('sl-screen') && document.getElementById('sl-ui')?.dataset.ready === 'true').catch(() => false);
  let ready = await isReady();
  for (const until = Date.now() + (opts.requireReady ? opts.readyMs ?? 10_000 : 0); !ready && Date.now() < until;) {
    await page.waitForTimeout(100);
    ready = await isReady();
  }
  if (!ready) return fail;
  const out: string[] = [];
  const env = await page.evaluate(() => {
    const scr = document.getElementById('sl-screen')!;
    const r = scr.getBoundingClientRect();
    const root = document.documentElement;
    return {
      vw: innerWidth, vh: innerHeight, d: devicePixelRatio, touch: matchMedia('(pointer: coarse)').matches,
      x: r.x + scrollX, y: r.y + scrollY, right: r.right + scrollX, bottom: r.bottom + scrollY,
      sw: root.scrollWidth, sh: root.scrollHeight, cw: root.clientWidth, ch: root.clientHeight,
      moving: scr.getAnimations().length > 0,
    };
  });
  const want = expectedMode(env.vw, env.vh, env.d, env.touch);
  const got = await stageScale(page);
  if (got.kind !== want.kind || Math.abs(got.s - want.s) > 1e-4) out.push(`stage scale ${got.kind} ${got.s}, want ${want.kind} ${want.s} at ${env.vw}x${env.vh}@${env.d}`);
  const whole = (v: number) => Math.abs(v - Math.round(v)) < 0.02;
  if (!env.moving && KNOWN_DPR.some((k) => Math.abs(k - env.d) < 0.005) && !(whole(env.x * env.d) && whole(env.y * env.d))) out.push(`stage corner ${env.x},${env.y} is not on a device pixel at d ${env.d}`);
  const overX = Math.max(0, Math.ceil(env.right - env.cw - 0.01)), overY = Math.max(0, Math.ceil(env.bottom - env.ch - 0.01));
  if (env.sw - env.cw > overX) out.push(`the page scrolls ${env.sw - env.cw}px across, the stage overflows ${overX}px`);
  if (env.sh - env.ch > overY) out.push(`the page scrolls ${env.sh - env.ch}px down, the stage overflows ${overY}px`);

  // Let the finite animations (a window opening, a fade) end first, for at most 500ms.
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations().filter((a) => Number.isFinite(Number(a.effect?.getComputedTiming().endTime ?? Infinity))).map((a) => a.finished.catch(() => undefined))),
    new Promise((r) => setTimeout(r, 500)),
  ]));
  out.push(...await page.evaluate(() => {
    const bad: string[] = [];
    const check = (where: string, cs: CSSStyleDeclaration) => {
      const size = parseFloat(cs.fontSize), lh = cs.lineHeight === 'normal' ? NaN : parseFloat(cs.lineHeight);
      const family = cs.fontFamily.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
      if (cs.fontSize !== '12px' && cs.fontSize !== '24px') bad.push(`${where}: font-size ${cs.fontSize}`);
      if (cs.fontWeight !== '400') bad.push(`${where}: font-weight ${cs.fontWeight}`);
      if (family !== 'Cubic 11') bad.push(`${where}: font ${family}`);
      // An even leading of 14px or more at 12px (Cubic 11 draws 11px glyphs in a 12px cell: 12px lines touch), 24 or more at 24px.
      if (!(lh >= Math.max(14, size) && (lh - size) % 2 === 0)) bad.push(`${where}: line-height ${cs.lineHeight} at ${cs.fontSize}`);
    };
    const name = (e: Element) => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')} "${(e.textContent ?? '').trim().slice(0, 20)}"`;
    const screen = document.getElementById('sl-screen')!;
    const walker = document.createTreeWalker(screen, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const e = n.parentElement!;
      if (!n.textContent?.trim() || !e.checkVisibility({ visibilityProperty: true })) continue;
      check(name(e), getComputedStyle(e));
    }
    for (const e of screen.querySelectorAll('*')) {
      if (!e.checkVisibility({ visibilityProperty: true })) continue;
      for (const pseudo of ['::before', '::after']) {
        const cs = getComputedStyle(e, pseudo);
        if (!/^["'].*\S.*["']$/.test(cs.content)) continue;   // text content only (not none, '' or an image)
        check(`${name(e)}${pseudo}`, cs);
      }
    }
    return bad;
  }));
  // The Pixi layer's text (the labyrinth's markers, the battle's names, intents, ailments and numbers): the pixel font too.
  out.push(...await page.evaluate(() => {
    type Node = { children?: Node[]; text?: unknown; style?: { fontFamily?: string | string[]; fontSize?: number; fontWeight?: string }; destroyed?: boolean };
    const stage = (window as unknown as { __starlanternDebug?: { stage?: { mapView?: { root: Node }; battleView?: { root: Node } } } }).__starlanternDebug?.stage;
    const bad: string[] = [];
    const walk = (n: Node) => {
      if (n.destroyed) return;
      if (typeof n.text === 'string' && n.style) {
        // Pixi may hand the family list back as one CSS string, its names quoted.
        const fam = (Array.isArray(n.style.fontFamily) ? n.style.fontFamily[0] : String(n.style.fontFamily ?? '').split(',')[0]).trim().replace(/^['"]|['"]$/g, '');
        if (fam !== 'Cubic 11' || ![12, 24].includes(n.style.fontSize ?? 0) || !['normal', '400'].includes(String(n.style.fontWeight))) bad.push(`pixi "${n.text}": ${fam} ${n.style.fontSize}px ${n.style.fontWeight}`);
      }
      for (const c of n.children ?? []) walk(c);
    };
    for (const r of [stage?.mapView?.root, stage?.battleView?.root]) if (r) walk(r);
    return bad;
  }));
  for (const sel of CENTRED) {
    for (const win of await page.locator(`#sl-screen ${sel}:visible`).all()) {
      const b = await stageBox(page, win);
      if (!whole(b.x) || !whole(b.y)) out.push(`${sel} at stage ${b.x},${b.y}: not on a whole stage pixel`);
    }
  }

  // The fonts the browser really drew with (chromium only): a missing glyph or an unloaded font shows here.
  if (!opts.fontBlocked && page.context().browser()?.browserType().name() === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send('DOM.enable');
      await cdp.send('CSS.enable');
      const { root } = await cdp.send('DOM.getDocument', { depth: -1 }) as unknown as { root: DomNode };
      const withText: DomNode[] = [];
      const find = (n: DomNode, inside: boolean) => {
        const attrs = n.attributes ?? [];
        const here = inside || attrs.some((a, i) => i % 2 === 0 && a === 'id' && attrs[i + 1] === 'sl-screen');
        if (here && n.nodeType === 1 && (n.children ?? []).some((c) => c.nodeType === 3 && c.nodeValue.trim())) withText.push(n);
        for (const c of n.children ?? []) find(c, here);
      };
      find(root, false);
      for (const n of withText) {
        // A node the page removed since the snapshot (a battle redraws its panels) has nothing left to draw: skip it.
        const got = await cdp.send('CSS.getPlatformFontsForNode', { nodeId: n.nodeId }).catch((e: Error) => { if (/Could not find node/.test(e.message)) return null; throw e; });
        if (!got) continue;
        const { fonts } = got as unknown as { fonts: { familyName: string; glyphCount: number }[] };
        const other = fonts.filter((f) => f.familyName !== 'Cubic 11');
        if (other.length) {
          const text = (n.children ?? []).filter((c) => c.nodeType === 3).map((c) => c.nodeValue.trim()).join(' ').slice(0, 20);
          out.push(`"${text}" drawn with ${other.map((f) => `${f.familyName} (${f.glyphCount})`).join(', ')}`);
        }
      }
    } finally {
      await cdp.detach().catch(() => undefined);
    }
  }
  return out;
}

// ── Task 2b: a touch phone ──────────────────────────────────────────────────────────────────────────────────────────

/** Pages now held as a phone, with the CDP session that made them one. */
const phones = new WeakMap<Page, CDPSession>();

/**
 * Make `page` a touch phone held upright, mid-test (CDP: the device metrics as a mobile, touch on), so `(pointer: coarse)`,
 * `devicePixelRatio` and `innerWidth` all read as on the phone. The probe of Task 2b found all three right.
 */
export async function asPhone(page: Page, { width = 390, height = 844, dpr = 3 } = {}): Promise<void> {
  const cdp = phones.get(page) ?? await page.context().newCDPSession(page);
  phones.set(page, cdp);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: true });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** Back to a desktop window of `width` x `height` (mouse, devicePixelRatio of the project). */
export async function asDesktop(page: Page, width: number, height: number): Promise<void> {
  const cdp = phones.get(page);
  if (cdp) {
    phones.delete(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    await cdp.detach().catch(() => undefined);
  }
  await page.setViewportSize({ width, height });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** The spec's window sizes: 390x844 is a touch phone held upright; any other size a desktop window. */
export const fitTo = (page: Page, width: number, height: number): Promise<void> =>
  (width === 390 && height === 844 ? asPhone(page) : asDesktop(page, width, height));

/**
 * A picture of the page as it shows now. On a phone it is taken through the phone's own CDP session: Playwright's
 * page.screenshot puts back its own viewport for the picture, which would show the desktop layout instead.
 */
export async function snap(page: Page, path: string): Promise<void> {
  const cdp = phones.get(page);
  if (!cdp) { await page.screenshot({ path }); return; }
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path, Buffer.from(data, 'base64'));
}

// ── Task 7: the review page ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Writes <review>/index.html beside <after> (SL_SHOTS): one row per screen and size, its picture before the legibility
 * work (<review>/before) and after it at 100%, 125% and 150% (<after>/d1, d1.25, d1.5), every picture at its natural size
 * (no width or height, pixelated), each row scrolling sideways on its own.
 */
export function writeReviewIndex(after: string, names: string[], sizes: SweepSize[]): void {
  const review = dirname(after);
  const rel = relative(review, after).split(sep).join('/');
  const cols: [string, string][] = [['改之前', 'before'], ['改之後 d1', `${rel}/d1`], ['d1.25', `${rel}/d1.25`], ['d1.5', `${rel}/d1.5`]];
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const rows = names.flatMap((n) => sizes.map((s) => {
    const file = `${n}-${s.width}x${s.height}.png`;
    const cells = cols.map(([head, folder]) => `<figure><figcaption>${esc(head)}</figcaption><img src="${folder}/${file}" alt="${esc(`${n} ${s.width}x${s.height} ${head}`)}"></figure>`).join('');
    return `<section><h2>${esc(n)} ${s.width}×${s.height}</h2><div class="row">${cells}</div></section>`;
  }));
  const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>星燈迷宮 易讀性 review</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 16px; background: #10121c; color: #e8e4d8; font: 14px/1.6 system-ui, sans-serif; }
  header { margin-bottom: 24px; }
  a { color: #e8c46a; }
  section { margin: 0 0 32px; }
  h2 { margin: 0 0 8px; font-size: 16px; }
  .row { display: flex; gap: 16px; align-items: flex-start; overflow-x: auto; padding-bottom: 8px; }
  figure { margin: 0; flex: none; }
  figcaption { margin-bottom: 4px; color: #a9a39a; }
  img { display: block; image-rendering: pixelated; }
</style>
</head>
<body>
<header>
<h1>星燈迷宮 易讀性（12／24px＋整數倍縮放）</h1>
<p>遊戲：<a href="http://localhost:4321/games/starlantern/">http://localhost:4321/games/starlantern/</a></p>
<p>每列一個畫面：改之前（before/）、改之後 d1、d1.25、d1.5，圖片都是原尺寸（像素不縮放）。390×844 是觸控手機直拿，舞台側置。</p>
<p>手機直拿側置時，觸控捲動的方向 e2e 驗不到：請在 iPhone 實機（iOS Safari）確認。</p>
</header>
${rows.join('\n')}
</body>
</html>
`;
  writeFileSync(`${review}/index.html`, html);
}
