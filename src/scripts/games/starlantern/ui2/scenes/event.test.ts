import { describe, expect, it, vi } from 'vitest';
import { floorOf } from '../../engine/dungeon/run';
import type { Content } from '../../engine/dungeon/rooms';
import { altarAt } from '../../engine/events';
import { chestHasGear, RARE_MATERIALS } from '../../engine/loot/drops';
import { Game } from '../../engine/game';
import { DELTA, tileAt, type Dir, type Tile } from '../../engine/map';
import { statsOf } from '../../engine/party';
import { constRng } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import { ITEMS } from '../../data/items';
import { DungeonScene } from './dungeon';

const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

function setup() {
  const game = new Game(constRng(0.99), null);   // 0.99: no encounter roll, and a trap is always poison
  expect(game.depart({ region: 'mainline', condition: 'plain' }, 1)).toEqual({ ok: true });
  const sfx = { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn(), bump: vi.fn(), step: vi.fn(), chest: vi.fn(), encounter: vi.fn(), heal: vi.fn(), hit: vi.fn() };
  const go = vi.fn();
  const root = document.createElement('div');
  const s = new DungeonScene({ game, art: NO_ART, sfx, go, hasSave: () => false, newGame: vi.fn(), stage: null, fast: true }, Infinity);
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
    expect(options()[options().length - 1]).toBe('放棄');
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
    pick('放棄');
    expect(root.querySelector('.slx-full')).toBeNull();
    expect(game.run!.loot.items['old-coin']).toBe(400);
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
