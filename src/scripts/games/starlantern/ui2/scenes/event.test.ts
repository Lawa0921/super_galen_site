import { describe, expect, it, vi } from 'vitest';
import { floorOf } from '../../engine/dungeon/run';
import type { Content } from '../../engine/dungeon/rooms';
import { altarAt } from '../../engine/events';
import { chestHasGear, RARE_MATERIALS } from '../../engine/loot/drops';
import { RUNE_DROP } from '../../data/runeEconomy';
import { Game } from '../../engine/game';
import { DELTA, tileAt, type Dir, type Tile } from '../../engine/map';
import { statsOf, LEGACY_LINEUP } from '../../engine/party';
import { constRng } from '../../engine/testing';
import { NO_ART, type ArtIndex } from '../../render/textures';
import { art } from '../../render/artPaths';
import { ITEMS } from '../../data/items';
import { capacity, carried, weightOf } from '../../data/weights';
import type { ItemInstance } from '../../engine/types';
import { DungeonScene } from './dungeon';
import { STORY } from '../../data/story.zh-TW';
import { chainLength } from '../../data/story/chains';

const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

function setup(artIdx: ArtIndex = NO_ART) {
  const game = new Game(constRng(0.99), null, undefined, 0, LEGACY_LINEUP);   // 0.99: no encounter roll, and a trap is always poison
  expect(game.depart({ region: 'mainline', condition: 'plain' }, 1)).toEqual({ ok: true });
  const sfx = { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn(), bump: vi.fn(), step: vi.fn(), chest: vi.fn(), encounter: vi.fn(), heal: vi.fn(), hit: vi.fn(), loot: vi.fn() };
  const go = vi.fn();
  const root = document.createElement('div');
  const s = new DungeonScene({ game, art: artIdx, sfx, go, hasSave: () => false, newGame: vi.fn(), stage: null, fast: true }, Infinity);
  s.enter(root);
  const text = () => root.querySelector('.slx-talk .slx-text')?.textContent ?? '';
  const talking = () => !root.querySelector('.slx-talk')!.hasAttribute('hidden') && !(root.querySelector('.slx-talk') as HTMLElement).hidden;
  const layer = () => root.querySelector('.slx-event');
  const options = () => [...root.querySelectorAll('.slx-layer:last-child [role=option] .slx-label')].map((o) => o.textContent);
  const pick = (label: string) => {
    const o = [...root.querySelectorAll('.slx-layer:last-child [role=option]')].find((x) => x.querySelector('.slx-label')!.textContent!.startsWith(label));
    if (!o) throw new Error(`no ${label} in ${options().join(',')}`);
    (o as HTMLElement).click();
  };
  /** Put a room content on a floor cell next to the party; returns the direction to step on it. */
  const plant = (tile: Tile, extra: Partial<Content> = {}, ok: (at: { x: number; y: number }) => boolean = () => true): { dir: Dir; at: { x: number; y: number } } => {
    const m = game.map();
    const near = (d: Dir) => ({ x: game.pos.x + DELTA[d].x, y: game.pos.y + DELTA[d].y });
    const dir = DIRS.find((d) => tileAt(m, near(d)) === 'floor' && ok(near(d)))!;
    const at = { x: game.pos.x + DELTA[dir].x, y: game.pos.y + DELTA[dir].y };
    m.tiles[at.y][at.x] = tile;
    if (tile !== 'chest' && tile !== 'trap' && tile !== 'key') floorOf(game.run!, game.floor).contents.push({ kind: tile as Content['kind'], at, room: 0, ...extra });
    return { dir, at };
  };
  return { game, sfx, go, root, s, text, talking, layer, options, pick, plant };
}

describe('EventLayer', () => {
  it('each event opens its layer and applies through Game: fountain', () => {
    const { game, s, layer, options, pick, plant, text } = setup();
    for (const id of game.state.party.recruited) game.state.party.roster[id].hp = 1;
    const { dir } = plant('fountain');
    s.onAction(dir);
    expect(layer()!.classList.contains('slx-event-fountain')).toBe(true);
    expect(layer()!.textContent).toContain('泉水');
    expect(options()).toEqual(['飲用', '離開']);
    pick('飲用');
    expect(layer()).toBeNull();
    expect(game.run!.usedFountain).toBe(true);
    expect(game.state.party.roster.scarlet.hp).toBeGreaterThan(1);
    expect(text()).toContain('泉水');
  });

  it('leaving the fountain uses nothing', () => {
    const { game, s, layer, pick, plant } = setup();
    const { dir } = plant('fountain');
    s.onAction(dir);
    pick('離開');
    expect(layer()).toBeNull();
    expect(game.run!.usedFountain).toBe(false);
  });

  it('each event opens its layer and applies through Game: merchant sells more than once', () => {
    const { game, s, root, options, pick, plant } = setup();
    const { dir } = plant('merchant', { stock: ['potion', 'ether', 'antidote'] });
    s.onAction(dir);
    expect(options()).toEqual(['回復藥', 'TP 藥', '解毒藥', '離開']);
    expect(root.querySelector('.slx-event-merchant [data-id=potion] .slx-right')!.textContent).toBe('20 G');
    expect(root.querySelector('.slx-event-merchant .slx-event-gold')!.textContent).toContain('150 G');
    const before = game.state.inventory.potion ?? 0;
    pick('回復藥');
    s.onAction('confirm');   // 謝謝惠顧
    pick('回復藥');
    s.onAction('confirm');
    expect(game.state.inventory.potion).toBe(before + 2);
    expect(game.state.gold).toBe(110);
    expect(root.querySelector('.slx-event-merchant .slx-event-gold')!.textContent).toContain('110 G');
  });

  it('the merchant remembers once Noel does', () => {
    const greet = (memories: number) => {
      const { game, s, layer, plant } = setup();
      game.state.party.roster.noel.memories = memories;
      const { dir } = plant('merchant', { stock: ['potion', 'ether', 'antidote'] });
      s.onAction(dir);
      return layer()!.textContent!;
    };
    const lost = greet(chainLength('noel') - 1);
    expect(lost).toContain(STORY.merchant.lost);
    expect(lost).not.toContain(STORY.merchant.found);
    const found = greet(chainLength('noel'));
    expect(found).toContain(STORY.merchant.found);
    expect(found).not.toContain(STORY.merchant.lost);
  });

  it('the merchant refuses a purchase the pack cannot carry', () => {
    const { game, s, pick, plant, text, sfx } = setup();
    game.state.gold = 999;
    game.run!.loot.items['old-coin'] = 400;
    const inv = { ...game.state.inventory };
    const { dir } = plant('merchant', { stock: ['potion', 'ether', 'antidote'] });
    s.onAction(dir);
    pick('回復藥');
    expect(sfx.error).toHaveBeenCalled();
    expect(text()).toBe('背包已滿');
    expect(game.state.gold).toBe(999);
    expect(game.state.inventory).toEqual(inv);
  });

  it('says so when the vault does not open', () => {
    const { game, s, pick, plant, text, sfx, layer } = setup();
    game.run!.keys.add(game.floor);
    const { dir } = plant('vault');
    s.onAction(dir);
    game.run!.keys.delete(game.floor);   // the key is gone by the time the player chooses
    pick('開啟');
    expect(sfx.error).toHaveBeenCalled();
    expect(layer()).toBeNull();
    expect(text()).toBe('寶庫打不開。需要這一層的鑰匙。');
  });

  it('the merchant says when the gold runs short', () => {
    const { game, s, pick, plant, text, sfx } = setup();
    game.state.gold = 5;
    const { dir } = plant('merchant', { stock: ['potion', 'ether', 'antidote'] });
    s.onAction(dir);
    pick('回復藥');
    expect(sfx.error).toHaveBeenCalled();
    expect(text()).toBe('金錢不足');
    expect(game.state.gold).toBe(5);
  });

  it('each event opens its layer and applies through Game: altar shows cost and gain, then accept', () => {
    const { game, s, root, options, pick, plant } = setup();
    const { dir, at } = plant('altar');
    const def = altarAt(game.run!, game.floor, at);
    s.onAction(dir);
    const box = root.querySelector('.slx-event-altar')!;
    expect(box.textContent).toContain(def.text);
    expect(box.querySelector('.slx-event-cost')!.textContent).toContain('代價');
    expect(box.querySelector('.slx-event-gain')!.textContent).toContain(`+${def.gain.pct}%`);
    expect(options()).toEqual(['接受', '拒絕']);
    pick('接受');
    expect(game.run!.altarBuffs).toEqual([def.gain]);
  });

  it('declining the altar changes nothing', () => {
    const { game, s, layer, pick, plant } = setup();
    const { dir } = plant('altar');
    s.onAction(dir);
    pick('拒絕');
    expect(layer()).toBeNull();
    expect(game.run!.altarBuffs).toEqual([]);
  });

  it('each event opens its layer and applies through Game: vault needs the key, then opens', () => {
    const { game, s, layer, options, pick, plant, text } = setup();
    const { dir, at } = plant('vault');
    s.onAction(dir);
    expect(layer()!.textContent).toContain('鑰匙');
    expect(options()).toEqual(['離開']);
    pick('離開');
    expect(game.pos).toEqual(at);   // the party stands on the shut vault
    game.run!.keys.add(game.floor);
    game.pos = { x: at.x - DELTA[dir].x, y: at.y - DELTA[dir].y };
    s.onAction(dir);
    expect(options()).toEqual(['開啟', '離開']);
    pick('開啟');
    expect(layer()).toBeNull();
    expect(text()).toContain('寶庫');
    expect(RARE_MATERIALS.some((id) => (game.run!.loot.items[id] ?? 0) >= 1)).toBe(true);
    expect(tileAt(game.map(), at)).toBe('floor');
  });

  it('each event opens its layer and applies through Game: an elite asks before the fight', () => {
    const { game, s, go, options, pick, plant, layer } = setup();
    const { dir, at } = plant('elite');
    const from = { ...game.pos };
    s.onAction(dir);
    expect(layer()!.textContent).toContain('要挑戰嗎？');
    expect(game.pos).toEqual(from);   // asked before stepping in
    expect(options()).toEqual(['挑戰', '離開']);
    pick('離開');
    expect(game.pos).toEqual(from);
    expect(game.phase).toBe('map');
    s.onAction(dir);
    pick('挑戰');
    expect(game.pos).toEqual(at);
    expect(game.phase).toBe('battle');
    expect(go).toHaveBeenCalledWith('battle');
  });

  it('a trap says what happened and flashes the screen red', () => {
    const { game, s, root, plant, text, layer } = setup();
    const { dir } = plant('trap');
    s.onAction(dir);
    expect(text()).toContain('陷阱');
    expect(root.querySelector('.slx-flash-hurt')).not.toBeNull();
    expect(layer()).toBeNull();
    expect(game.state.party.roster.scarlet.hp).toBeLessThan(statsOf(game.state.party.roster.scarlet).hp);
  });

  it('a key is a line of dialogue', () => {
    const { game, s, plant, text } = setup();
    const { dir } = plant('key');
    s.onAction(dir);
    expect(text()).toContain('鑰匙');
    expect(game.run!.keys.has(game.floor)).toBe(true);
  });
});

describe('the full pack window', () => {
  it('opens on a pick-up that does not fit, lists what is carried and discards to make room', () => {
    const { game, s, root, options, pick, plant, text } = setup();
    game.run!.loot.items['old-coin'] = 400;   // far over the limit
    const { dir, at } = plant('chest', {}, (spot) => !chestHasGear(game.run!, game.floor, spot));   // materials only
    s.onAction(dir);
    const box = root.querySelector('.slx-full')!;
    expect(box.textContent).toContain('背包已滿');
    expect(options()).toContain('古代銀幣');
    expect(options()[options().length - 1]).toBe('先留在這裡');
    const { item, qty } = game.run!.rolls[`chest:${game.floor}:${at.x},${at.y}`];
    const held = () => (ITEMS[item] ? game.state.inventory[item] : game.run!.loot.items[item]) ?? 0;
    const before = item === 'old-coin' ? 0 : held();
    pick('古代銀幣');
    expect(root.querySelector('.slx-layer:last-child')!.textContent).toContain('丟掉');
    pick('是');
    expect(root.querySelector('.slx-full')).toBeNull();
    expect(game.pos).toEqual(at);
    // Room was made: the chest is picked up at once and its contents land in the bag (consumables) or the run pack.
    expect(text()).toContain('打開寶箱');
    if (item !== 'old-coin') expect(held()).toBe(before + qty);
    expect(game.run!.opened.has(`${game.floor}:${at.x},${at.y}`)).toBe(true);
  });

  it('leaves weightless entries out of the discard list', () => {
    const { game, s, options, plant } = setup();
    game.run!.loot.items['old-coin'] = 400;
    game.run!.loot.items.moss = 0;
    const { dir } = plant('chest');
    s.onAction(dir);
    expect(options()).not.toContain('發光苔');
  });

  it('giving up leaves the pick-up where it is', () => {
    const { game, s, root, pick, plant } = setup();
    game.run!.loot.items['old-coin'] = 400;
    const { dir } = plant('chest');
    s.onAction(dir);
    pick('先留在這裡');
    expect(root.querySelector('.slx-full')).toBeNull();
    expect(game.run!.loot.items['old-coin']).toBe(400);
  });
});

describe('fragments in the labyrinth', () => {
  it('a chest lists the fragments it held', () => {
    const { game, s, plant, text } = setup();
    const { dir, at } = plant('chest', {}, (spot) => !chestHasGear(game.run!, game.floor, spot));
    game.run!.rolls[`frag:${game.floor}:${at.x},${at.y}`] = { item: '', qty: 0, frags: ['shard-dim'] };
    s.onAction(dir);
    expect(text()).toContain('打開寶箱');
    expect(text()).toContain('微光的碎片');
  });

  it('the full window names the fragments a shut chest holds back', () => {
    const { game, s, root, plant } = setup();
    game.run!.loot.items['old-coin'] = 400;
    const { dir, at } = plant('chest', {}, (spot) => !chestHasGear(game.run!, game.floor, spot));
    game.run!.rolls[`frag:${game.floor}:${at.x},${at.y}`] = { item: '', qty: 0, frags: ['shard-dim'] };
    s.onAction(dir);
    expect(root.querySelector('.slx-full')!.textContent).toContain('微光的碎片');
  });

  it('a shut chest with materials and gear but no fragments shows only the material line', () => {
    const { game, s, root, plant } = setup();
    game.run!.loot.items['old-coin'] = 400;
    const { dir, at } = plant('chest', {}, (spot) => chestHasGear(game.run!, game.floor, spot));
    game.run!.rolls[`frag:${game.floor}:${at.x},${at.y}`] = { item: '', qty: 0, frags: [] };
    s.onAction(dir);
    const text = root.querySelector('.slx-full')!.textContent!;
    expect(text.split('還差重量')).toHaveLength(2);   // one weight line, not the material line plus gearHeavy
  });

  it('a glimmer that did not fit is taken after discarding, from the same window', () => {
    const { game, s, root, plant, pick, text } = setup();
    for (const m of Object.values(game.state.party.roster)) m.memories = 99;   // every chain is spent: the glimmer holds a shard
    game.run!.loot.items['old-coin'] = 400;
    const { dir, at } = plant('glimmer');
    s.onAction(dir);
    expect(root.querySelector('.slx-full')!.textContent).toContain('微光的碎片');
    pick('古代銀幣');
    pick('是');
    expect(root.querySelector('.slx-full')).toBeNull();
    expect(text()).toContain('微光的碎片');
    expect(game.run!.loot.items['shard-dim']).toBe(1);
    expect(tileAt(game.map(), at)).toBe('floor');
  });
});

describe('Review Focus 2', () => {
  it('moves and right-click are ignored while an event layer is open', () => {
    const { game, s, root, plant, layer, pick, talking } = setup();
    const { dir } = plant('merchant', { stock: ['potion', 'ether', 'antidote'] });
    s.onAction(dir);
    const at = { ...game.pos };
    for (const d of DIRS) s.onAction(d);
    expect(game.pos).toEqual(at);
    expect(layer()).not.toBeNull();
    // The pad cannot be clicked under the window.
    expect(root.querySelector('.slx-pad')!.hasAttribute('inert')).toBe(true);
    (root.querySelector('.slx-pad-left') as HTMLElement).click();
    expect(game.pos).toEqual(at);
    // A purchase line is on screen: moves and right-click (cancel) do nothing at all.
    pick('回復藥');
    expect(talking()).toBe(true);
    for (const d of DIRS) s.onAction(d);
    s.onAction('cancel');
    expect(game.pos).toEqual(at);
    expect(talking()).toBe(true);
    expect(layer()).not.toBeNull();
    s.onAction('confirm');   // line closes, the merchant window is back
    expect(layer()).not.toBeNull();
    // Right-click on the window only leaves the event: no step, no field menu.
    s.onAction('cancel');
    expect(layer()).toBeNull();
    expect(root.querySelector('.slx-field-menu')).toBeNull();
    expect(game.pos).toEqual(at);
  });
});

describe('gear from chests and the vault', () => {
  const gearOf = (uid: number, base: string, rarity: ItemInstance['rarity']): ItemInstance => ({ uid, base, rarity, ilvl: 3, affixes: [], enhance: 0 });
  /** A cell whose chest rolls `gear` (or no gear), with the party moved beside it; returns the step onto it and the cell. */
  const chestCell = (game: Game, gear: boolean): { dir: Dir; at: { x: number; y: number } } => {
    const m = game.map();
    for (let y = 1; y < m.height - 1; y++) for (let x = 1; x < m.width - 1; x++) {
      if (tileAt(m, { x, y }) !== 'floor' || chestHasGear(game.run!, game.floor, { x, y }) !== gear) continue;
      const dir = DIRS.find((d) => tileAt(m, { x: x - DELTA[d].x, y: y - DELTA[d].y }) === 'floor');
      if (!dir) continue;
      game.pos = { x: x - DELTA[dir].x, y: y - DELTA[dir].y };
      m.tiles[y][x] = 'chest';
      return { dir, at: { x, y } };
    }
    throw new Error('no chest cell');
  };

  it('the vault lists its gear', () => {
    const { game, s, root, pick, plant, text } = setup();
    game.run!.keys.add(game.floor);
    const { dir, at } = plant('vault');
    game.run!.gearRolls[`vault:${game.floor}:${at.x},${at.y}`] = gearOf(55, 'hunter-bow', 'unique');
    s.onAction(dir);
    pick('開啟');
    expect(text()).toContain('打開寶庫');
    expect(text()).toContain('獵弓・獨特');
    expect(root.querySelector('.slx-talk .slx-text .slx-rarity-unique')!.textContent).toBe('獵弓・獨特');
  });

  it('the vault names its gear with the gear icon when published', () => {
    const { game, s, root, pick, plant } = setup({ has: (u) => u === art.gear('hunter-bow') });
    game.run!.keys.add(game.floor);
    const { dir, at } = plant('vault');
    game.run!.gearRolls[`vault:${game.floor}:${at.x},${at.y}`] = gearOf(55, 'hunter-bow', 'unique');
    s.onAction(dir);
    pick('開啟');
    const img = root.querySelector('.slx-talk .slx-text img.slx-gear-ico')!;
    expect(img.getAttribute('src')).toBe(art.gear('hunter-bow'));
    expect(img.nextElementSibling!.textContent).toBe('獵弓・獨特');
  });

  it('the best drop raises one pillar and plays loot once', () => {
    const { game, s, root, pick, plant, sfx } = setup();
    game.run!.keys.add(game.floor);
    const { dir, at } = plant('vault');
    game.run!.gearRolls[`vault:${game.floor}:${at.x},${at.y}`] = gearOf(56, 'hunter-bow', 'set');
    s.onAction(dir);
    expect(root.querySelector('.slx-pillar')).toBeNull();   // the window alone is no drop
    pick('開啟');
    expect(root.querySelectorAll('.slx-pillar').length).toBe(1);
    expect(root.querySelector('.slx-pillar')!.classList.contains('slx-rarity-set')).toBe(true);
    expect(sfx.loot).toHaveBeenCalledTimes(1);
    expect(sfx.loot).toHaveBeenCalledWith('set', 150);
  });

  it('a chest picked up after freeing room raises its pillar once', () => {
    const { game, s, root, pick, sfx, text } = setup();
    game.state.bag = Array.from({ length: 59 }, (_, i) => gearOf(1000 + i, 'cloth-robe', 'common'));
    game.run!.loot.gear.push(gearOf(7, 'leather-vest', 'common'));   // 59 + 1: full
    const { dir, at } = chestCell(game, true);
    game.run!.gearRolls[`chest:${game.floor}:${at.x},${at.y}`] = gearOf(10, 'wooden-staff', 'magic');
    s.onAction(dir);
    expect(root.querySelector('.slx-pillar')).toBeNull();   // still in the chest
    expect(root.querySelector('.slx-full')!.textContent).toContain('打開寶箱');   // the materials are paid at once
    pick('皮背心');
    pick('是');
    expect(text()).toContain('撿起了 木杖・魔法');
    expect(root.querySelectorAll('.slx-pillar.slx-rarity-magic').length).toBe(1);
    expect(sfx.loot).toHaveBeenCalledTimes(1);
    expect(sfx.loot).toHaveBeenCalledWith('magic', 150);
  });

  it('a bag already full from town still opens the vault and pays its materials; the gear waits, and is taken once a slot is free', () => {
    const { game, s, root, options, pick, plant, text } = setup();
    game.state.bag = Array.from({ length: 60 }, (_, i) => gearOf(1000 + i, 'cloth-robe', 'common'));
    game.run!.keys.add(game.floor);
    const { dir, at } = plant('vault');
    game.run!.gearRolls[`vault:${game.floor}:${at.x},${at.y}`] = gearOf(55, 'hunter-bow', 'unique');
    s.onAction(dir);
    pick('開啟');
    const box = root.querySelector('.slx-full')!;
    expect(box.textContent).toContain('打開寶庫');
    expect(box.textContent).toContain('獵弓・獨特 放不下');
    expect(box.textContent).toContain('冒險背包裡沒有能丟的裝備');
    expect(box.textContent).not.toContain('回城');   // the labyrinth is new every trip: no coming back for it
    expect(options()).toEqual(['先留在這裡']);
    expect(box.textContent).not.toContain('放棄');   // leaving it there destroys nothing
    expect(Object.keys(game.run!.loot.items).filter((id) => RARE_MATERIALS.includes(id))).toHaveLength(1);
    expect(game.run!.loot.items['old-coin']).toBe(6);
    pick('先留在這裡');
    expect(text()).toBe('先把它留在原地吧。');
    s.onAction('confirm');
    expect(root.querySelector('.slx-pillar')).toBeNull();
    // A slot freed (here by hand): stepping back onto the vault picks the gear up.
    game.state.bag.pop();
    game.pos = { x: at.x - DELTA[dir].x, y: at.y - DELTA[dir].y };
    s.onAction(dir);
    expect(text()).toContain('撿起了 獵弓・獨特');
    expect(game.run!.loot.gear.map((g) => g.uid)).toEqual([55]);
    expect(root.querySelectorAll('.slx-pillar.slx-rarity-unique').length).toBe(1);
    expect(tileAt(game.map(), at)).toBe('floor');
  });

  it('a full bag offers run-pack gear to discard, throws away only the chosen piece, and then picks up', () => {
    const { game, s, root, options, pick, text } = setup();
    game.state.bag = Array.from({ length: 57 }, (_, i) => gearOf(1000 + i, 'cloth-robe', 'common'));
    game.run!.loot.gear.push(gearOf(7, 'iron-sword', 'legendary'), gearOf(8, 'leather-vest', 'magic'), gearOf(9, 'hunter-bow', 'common'));   // 57 + 3: full
    const { dir, at } = chestCell(game, true);
    game.run!.gearRolls[`chest:${game.floor}:${at.x},${at.y}`] = gearOf(10, 'wooden-staff', 'rare');
    s.onAction(dir);
    const box = root.querySelector('.slx-full')!;
    expect(box.querySelector('.slx-event-title')!.textContent).toBe('背包已滿（60 件）');
    expect(box.querySelector('.slx-rarity-rare')!.textContent).toBe('木杖・稀有');   // what is waiting to be picked up
    expect(options()).toEqual(['鐵劍・傳說', '皮背心・魔法', '獵弓', '先留在這裡']);
    expect(box.querySelector('[data-id="gear:8"] .slx-label')!.classList.contains('slx-rarity-magic')).toBe(true);
    pick('皮背心');
    const ask = root.querySelector('.slx-layer:last-child')!;
    expect(ask.textContent).toContain('要丟掉 皮背心・魔法 嗎？');
    expect(ask.querySelector('.slx-rarity-magic')!.textContent).toBe('皮背心・魔法');   // the confirm keeps the colour
    pick('是');
    expect(root.querySelector('.slx-full')).toBeNull();
    expect(text()).toContain('撿起了 木杖・稀有');
    expect(game.run!.loot.gear.map((g) => g.uid)).toEqual([7, 9, 10]);
    expect(game.run!.opened.has(`${game.floor}:${at.x},${at.y}`)).toBe(true);
  });

  it('a pack too heavy (bag not full) also offers run-pack gear, which frees its weight', () => {
    const { game, s, options, pick, text } = setup();
    game.run!.loot.gear.push(gearOf(7, 'iron-sword', 'rare'), gearOf(8, 'leather-vest', 'magic'));
    const { dir, at } = chestCell(game, false);
    // Step on once to roll the chest, then load the pack so it is over by at most 1 (one coin) with the chest.
    game.run!.loot.items['old-coin'] = 400;
    s.onAction(dir);
    pick('先留在這裡');
    s.onAction('confirm');
    game.pos = { x: at.x - DELTA[dir].x, y: at.y - DELTA[dir].y };
    const { item, qty } = game.run!.rolls[`chest:${game.floor}:${at.x},${at.y}`];
    game.run!.loot.items['old-coin'] = 0;
    const base = carried(game.state, game.run) + qty * weightOf(item);
    game.run!.loot.items['old-coin'] = Math.floor(capacity(game.state.party) - base) + 1;
    s.onAction(dir);
    expect(options()).toEqual(expect.arrayContaining(['鐵劍・稀有', '皮背心・魔法', '古代銀幣']));
    pick('鐵劍');
    pick('是');
    expect(game.run!.loot.gear.map((g) => g.uid)).toEqual([8]);
    expect(text()).toContain('打開寶箱');
    expect(game.run!.opened.has(`${game.floor}:${at.x},${at.y}`)).toBe(true);
  });
});

describe('runes from chests and the vault (plan 8f Task 3)', () => {
  const gearOf = (uid: number, base: string, rarity: ItemInstance['rarity']): ItemInstance => ({ uid, base, rarity, ilvl: 3, affixes: [], enhance: 0 });

  it('a chest or vault with a rune says so', () => {
    const { game, s, root, pick, plant, text, talking } = setup();
    const { dir } = plant('chest');
    vi.spyOn(game, 'move').mockReturnValueOnce({ kind: 'chest', item: 'old-coin', qty: 2, rune: { id: 'bounce', tier: 'rare' } });
    s.onAction(dir);
    expect(text()).toContain('打開寶箱');
    expect(text()).toContain('得到符文：彈射（稀有）');
    const line = [...root.querySelectorAll('.slx-talk .slx-text .slx-loot-rune')];
    expect(line.map((x) => x.textContent)).toEqual(['得到符文：彈射（稀有）']);
    expect(line[0].classList.contains('slx-rarity-rare')).toBe(true);

    for (let i = 0; i < 6 && talking(); i++) s.onAction('confirm');
    expect(talking()).toBe(false);
    game.run!.keys.add(game.floor);
    const v = plant('vault');
    s.onAction(v.dir);
    vi.spyOn(game, 'openVault').mockReturnValueOnce({ kind: 'vault', loot: { 'old-coin': 6 }, gear: [], runeGold: { rune: { id: 'spread', tier: 'magic' }, gold: 60 } });
    pick('開啟');
    expect(text()).toContain('打開寶庫');
    expect(text()).toContain('擴散（魔法）已經 99 個，換成 60 G');
    expect(text()).not.toContain('得到符文');
  });

  it("a chest's rune is told once, also when its gear waits and is taken later", () => {
    const saved = RUNE_DROP.chest;
    RUNE_DROP.chest = 1;
    try {
      const { game, s, root, pick, text } = setup();
      game.state.runesOpen = true;
      game.state.bag = Array.from({ length: 59 }, (_, i) => gearOf(1000 + i, 'cloth-robe', 'common'));
      game.run!.loot.gear.push(gearOf(7, 'leather-vest', 'common'));   // 59 + 1: full
      const { dir, at } = (() => {
        const m = game.map();
        for (let y = 1; y < m.height - 1; y++) for (let x = 1; x < m.width - 1; x++) {
          if (tileAt(m, { x, y }) !== 'floor' || !chestHasGear(game.run!, game.floor, { x, y })) continue;
          const d = DIRS.find((k) => tileAt(m, { x: x - DELTA[k].x, y: y - DELTA[k].y }) === 'floor');
          if (!d) continue;
          game.pos = { x: x - DELTA[d].x, y: y - DELTA[d].y };
          m.tiles[y][x] = 'chest';
          return { dir: d, at: { x, y } };
        }
        throw new Error('no chest cell');
      })();
      game.run!.gearRolls[`chest:${game.floor}:${at.x},${at.y}`] = gearOf(10, 'wooden-staff', 'magic');
      s.onAction(dir);
      const keys = Object.keys(game.state.runes ?? {});
      expect(keys).toHaveLength(1);
      const runeLines = () => [...root.querySelectorAll('.slx-loot-rune')].map((x) => x.textContent);
      // The chest opened: its rune is told in the full window that heads the waiting gear, once.
      expect(root.querySelector('.slx-full')!.textContent).toContain('打開寶箱');
      expect(runeLines()).toHaveLength(1);
      expect(runeLines()[0]).toMatch(/^得到符文：/);
      pick('皮背心');
      pick('是');
      expect(text()).toContain('撿起了 木杖・魔法');
      expect(text()).not.toContain('得到符文');
      expect(runeLines()).toEqual([]);
      // Nothing waits in the emptied chest any more: there is nothing to tell again.
      expect(game.pos).toEqual(at);
      expect(game.pickUpHere()).toBeNull();
      expect(Object.values(game.state.runes!)).toEqual([1]);
    } finally {
      RUNE_DROP.chest = saved;
    }
  });
});
