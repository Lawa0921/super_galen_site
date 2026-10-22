import { expect, type Page } from '@playwright/test';
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
      await page.setViewportSize(size);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await onScreen(s.name, size);
    }
  }
  return w.errors;
}
