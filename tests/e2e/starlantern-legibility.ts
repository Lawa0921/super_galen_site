import { expect, type CDPSession, type Locator, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { EQUIPMENT } from '../../src/scripts/games/starlantern/data/equipment';
import { SPECIALS, STARLIT_RARITIES } from '../../src/scripts/games/starlantern/data/gear';
import { ENHANCE_MAX } from '../../src/scripts/games/starlantern/data/forge';
import { RUNES, runeKey, tiersOf, type RuneId } from '../../src/scripts/games/starlantern/data/runes';
import { STORY } from '../../src/scripts/games/starlantern/data/story.zh-TW';
import { T } from '../../src/scripts/games/starlantern/data/text.zh-TW';
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
const placeBeside = (page: Page, tile: string, nth = 0, content?: string) => page.evaluate(({ tile, nth, content }) => {
  const g = (window as unknown as Dbg).__starlanternDebug.game;
  const tiles: string[][] = g.map().tiles;
  const spots: { x: number; y: number }[] = [];
  tiles.forEach((row, y) => row.forEach((t, x) => { if (t === 'floor' && row[x - 1] === 'floor') spots.push({ x, y }); }));
  const at = spots[nth % spots.length];
  tiles[at.y][at.x] = tile;
  if (content) g.run.floors.get(g.floor).contents.push({ kind: content, at, room: -1 });
  g.pos = { x: at.x - 1, y: at.y };
  g.encounter = 0;
  return { at, spots: spots.length };
}, { tile, nth, content });

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

/** The chests the sweep put down, taken up again before it walks to the stairs. */
const chests: { x: number; y: number }[] = [];

const HANDBOOK_TABS = ['memories', 'people', 'leads', 'town', 'codex', 'truths'] as const;

/**
 * The sweep's screens, in the order one game reaches them: the menus by `go`, then a portal run (the departure prompt,
 * the dungeon, its menu and handbook, three event windows with art, the stairs, a fight, its lists and result) and the
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
  { name: 'guild', visit: async (page, w) => facility(page, w, 'guild', '.slx-guild') },
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
  { name: 'equip', visit: async (page) => { await go(page, 'equip'); await expect(page.locator('.slx-equip-scene')).toBeVisible(); } },
  ...HANDBOOK_TABS.map((tab, i) => ({
    name: i === 0 ? 'handbook' : `handbook-${tab}`, visit: async (page: Page) => {
      if (i === 0) await go(page, 'handbook');
      else await page.locator('.slx-handbook [role=tab]').nth(i).click();
      await expect(page.locator('.slx-handbook [role=tab]').nth(i)).toHaveAttribute('aria-selected', 'true');
    },
  })),
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
  { name: 'builds', visit: async (page) => { await go(page, 'builds'); await expect(page.locator('.slx-builds')).toBeVisible(); } },
  // The act 1 clear card: `go` shows it without changing the game.
  { name: 'clear', visit: async (page) => { await go(page, 'clear'); await expect(page.locator('.slx-clear [role=option]').first()).toBeVisible(); } },
  {
    name: 'confirm', visit: async (page, w) => {
      await facility(page, w, 'gate', '.slx-gate');
      await w.key('Enter');                                   // 選擇傳送門
      await expect(page.locator('.slx-portal')).toHaveCount(3);
      await w.key('Enter'); await w.key('Enter');             // the mainline card, depth 1
      await expect(page.locator('.slx-confirm')).toBeVisible();
    },
  },
  {
    name: 'dungeon', visit: async (page, w) => {
      await w.key('ArrowUp'); await w.key('Enter');           // 是
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
    name: 'event-elite', visit: async (page, w) => {
      await w.key('Escape');                                  // 離開: the party stays on the altar
      await expect(page.locator('.slx-event-altar')).toHaveCount(0);
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
    name: 'battle-skills', visit: async (page, w) => {
      for (let i = 0; i < 8; i++) {
        await w.choose('.slx-bcmd', '技能');
        if (await page.locator('.slx-bsub').isVisible()) break;
        await w.choose('.slx-bcmd', '防禦');                   // no skill to show: the next member
        await commandMenu(page);
      }
      await expect(page.locator('.slx-bsub [role=option]').first()).toBeVisible();
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

/** Scenes (their root's second class) whose text Tasks 3–6 have yet to bring to 12/24px: the text checks skip them. */
export const PENDING_SCENES: string[] = ['slx-dungeon', 'slx-battle', 'slx-status-scene', 'slx-equip-scene', 'slx-workshop', 'slx-builds'];

/** The windows ruling 8 centres: their top-left must sit on a whole stage pixel. */
const CENTRED = ['.slx-confirm', '.slx-layer.slx-confirm', '.slx-result', '.slx-settings', '.slx-keys', '.slx-clear-card', '.slx-title-menu', '.slx-depths', '.slx-event'];

type DomNode = { nodeId: number; nodeType: number; nodeName: string; nodeValue: string; children?: DomNode[]; attributes?: string[] };

/**
 * What keeps the screen from reading clearly, as a list of problems (empty: it reads clearly). Nothing to check before
 * the game is ready. The scale is the one `expectedMode` gives; the stage's corner sits on a whole device pixel; the page
 * scrolls no further than the stage overflows; in a scene not pending, every text is 12 or 24px Cubic 11 at weight 400
 * with an even leading of 14px or more, and the centred windows sit on whole stage pixels; and (chromium, the font not blocked) every
 * text is drawn with Cubic 11 itself, as the browser reports it.
 */
export async function legibility(page: Page, opts: { fontBlocked?: boolean } = {}): Promise<string[]> {
  if (page.isClosed()) return [];
  const ready = await page.evaluate(() => !!document.getElementById('sl-screen') && document.getElementById('sl-ui')?.dataset.ready === 'true').catch(() => false);
  if (!ready) return [];
  const out: string[] = [];
  const env = await page.evaluate(() => {
    const scr = document.getElementById('sl-screen')!;
    const r = scr.getBoundingClientRect();
    const root = document.documentElement;
    const scene = document.querySelector('#sl-ui > .slx-scene');
    return {
      vw: innerWidth, vh: innerHeight, d: devicePixelRatio, touch: matchMedia('(pointer: coarse)').matches,
      x: r.x + scrollX, y: r.y + scrollY, right: r.right + scrollX, bottom: r.bottom + scrollY,
      sw: root.scrollWidth, sh: root.scrollHeight, cw: root.clientWidth, ch: root.clientHeight,
      moving: scr.getAnimations().length > 0, scene: scene?.classList[1] ?? '',
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

  if (!PENDING_SCENES.includes(env.scene)) {
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
    for (const sel of CENTRED) {
      for (const win of await page.locator(`#sl-screen ${sel}:visible`).all()) {
        const b = await stageBox(page, win);
        if (!whole(b.x) || !whole(b.y)) out.push(`${sel} at stage ${b.x},${b.y}: not on a whole stage pixel`);
      }
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
