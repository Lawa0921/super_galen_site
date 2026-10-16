import { describe, expect, it, vi } from 'vitest';
import { compareDelta } from '../../engine/compare';
import { Game } from '../../engine/game';
import { sellPrice } from '../../engine/loot/item';
import { activeIds, defaultSlotFor } from '../../engine/party';
import { constRng, plainItem } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import { ShopScene } from './shop';

function setup(gold = 100) {
  const game = new Game(constRng(0.5), null);
  game.state.gold = gold;
  const root = document.createElement('div');
  const sfx = { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() };
  const s = new ShopScene({ game, art: NO_ART, sfx, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity);
  s.enter(root);
  s.onAction('confirm');
  const pick = (label: string) => {
    const layer = root.querySelector('.slx-layer:last-child') ?? root.querySelector('.slx-cmd')!;
    const o = [...layer.querySelectorAll('[role=option]')].find((x) => x.querySelector('.slx-label')!.textContent === label);
    if (!o) throw new Error(`no ${label}`);
    (o as HTMLElement).click();
  };
  return { game, root, s, pick, sfx };
}

describe('ShopScene', () => {
  it('buys a chosen quantity, capped by what the party can afford', () => {
    const { game, pick, s } = setup(100);
    pick('購買');
    pick('回復藥');                       // potion 20 G → at most 5
    s.onAction('up');                     // +10, clamped to 5
    expect(document.body).toBeTruthy();
    s.onAction('confirm');
    expect(game.state.inventory.potion).toBe(3 + 5);
    expect(game.state.gold).toBe(0);
  });

  it('refuses when even one is too expensive', () => {
    const { game, pick, sfx, root } = setup(10);
    pick('購買');
    pick('回復藥');
    expect(game.state.gold).toBe(10);
    expect(sfx.error).toHaveBeenCalled();
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('金錢不足');
  });

  it('shows locked equipment as disabled with what it needs', () => {
    const { pick, root } = setup();
    pick('購買');
    const locked = [...root.querySelectorAll('.slx-layer [role=option]')].find((o) => o.getAttribute('aria-disabled') === 'true')!;
    expect(locked.querySelector('.slx-right')!.textContent).toContain('×');
  });

  it('sells materials by quantity and announces newly unlocked goods', () => {
    const { game, pick, s, root } = setup();
    game.state.inventory['thorn-fang'] = 5;
    pick('販賣');
    pick('素材');
    pick('荊棘牙');
    s.onAction('up');                     // all 5
    s.onAction('confirm');
    expect(game.state.inventory['thorn-fang'] ?? 0).toBe(0);
    expect(game.state.sold['thorn-fang']).toBe(5);
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toContain('荊棘槍');
  });

  it('says so when there is nothing to sell', () => {
    const { pick, root } = setup();
    pick('販賣');
    pick('素材');
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('沒有可以賣的素材。');
  });

  it('buying a base adds it to the bag and the full bag is announced', () => {
    const { game, pick, s } = setup(1000);
    pick('購買');
    pick('鐵劍・普通');
    s.onAction('confirm');
    expect(game.state.bag.map((x) => x.base)).toEqual(['iron-sword']);
    expect(game.state.inventory['iron-sword']).toBeUndefined();
    expect(game.state.gold).toBe(960);

    const full = setup(1000);
    full.game.state.bag = Array.from({ length: 60 }, (_, i) => plainItem('iron-sword', 100 + i));
    full.pick('購買');
    full.pick('鐵劍・普通');
    expect(full.sfx.error).toHaveBeenCalled();
    expect(full.root.querySelector('.slx-talk .slx-text')!.textContent).toBe('背包已滿（60 件）');
    expect(full.game.state.gold).toBe(1000);
  });

  it('the quantity box caps at the free bag slots', () => {
    const { game, pick, s, root } = setup(100000);
    game.state.bag = Array.from({ length: 58 }, (_, i) => plainItem('iron-sword', 100 + i));
    pick('購買');
    pick('鐵劍・普通');
    s.onAction('up');                           // +10, clamped to the 2 free slots
    expect(root.querySelector('.slx-qty-n')!.textContent).toBe('× 2');
    s.onAction('confirm');
    expect(game.state.bag).toHaveLength(60);
    expect(game.state.gold).toBe(100000 - 2 * 40);
  });

  it('does not count leftover gear ids in the inventory as sellable materials', () => {
    const { game, pick, root } = setup();
    game.state.inventory = { 'iron-sword': 2 };
    pick('販賣');
    pick('素材');
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('沒有可以賣的素材。');
    expect(game.state.sold['iron-sword']).toBeUndefined();
  });

  it('selling six thorn fangs unlocks thorn-gauntlets', () => {
    const { game, pick, s, root } = setup();
    game.state.inventory['thorn-fang'] = 6;
    pick('販賣');
    pick('素材');
    pick('荊棘牙');
    s.onAction('up');                     // clamped to the 6 held
    s.onAction('confirm');
    expect(game.state.sold['thorn-fang']).toBe(6);
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toContain('荊棘臂甲');
  });

  it('every base in the buy list carries the common rarity colour and word, and keeps its need text when locked', () => {
    const { pick, root } = setup();
    pick('購買');
    const rows = [...root.querySelectorAll('.slx-layer [role=option]')];
    const gear = rows.filter((o) => o.querySelector('.slx-label')!.textContent!.endsWith('・普通'));
    expect(gear.length).toBeGreaterThan(0);
    for (const o of gear) expect(o.querySelector('.slx-label')!.classList.contains('slx-rarity-common')).toBe(true);
    const locked = rows.find((o) => o.getAttribute('aria-disabled') === 'true')!;
    expect(locked.querySelector('.slx-right')!.textContent).toMatch(/^需要 .+×\d/);
  });

  it('the owned count of a base reads from the bag, not from a leftover inventory id', () => {
    const { game, pick, root } = setup();
    game.state.inventory = { 'iron-sword': 7 };
    game.state.bag = [plainItem('iron-sword', 100), plainItem('iron-sword', 101), plainItem('wooden-staff', 102)];
    pick('購買');
    const row = [...root.querySelectorAll('.slx-layer [role=option]')].find((o) => o.getAttribute('data-id') === 'iron-sword')!;
    expect(row.querySelector('.slx-right')!.textContent).toContain('持有 2');
  });

  it('the base preview lists per-member deltas', () => {
    const { game, pick, root } = setup();
    pick('購買');
    const row = [...root.querySelectorAll('.slx-layer [role=option]')].find((o) => o.getAttribute('data-id') === 'iron-sword') as HTMLElement;
    row.dispatchEvent(new Event('pointermove'));
    const info = root.querySelector('.slx-info')!;
    const ids = activeIds(game.state.party);
    const lines = [...info.querySelectorAll('.slx-cmp-member')];
    expect(lines).toHaveLength(ids.length);
    const m = game.state.party.roster[ids[0]];
    const temp = plainItem('iron-sword', 0);
    const d = compareDelta(m, defaultSlotFor(m, temp), temp);
    expect(Object.keys(d).length).toBeGreaterThan(0);
    expect(lines[0].textContent).toContain('攻擊');
    expect(info.querySelector('.slx-cmp-member .slx-up, .slx-cmp-member .slx-down')).toBeTruthy();
  });

  describe('selling gear', () => {
    const gearBag = (game: Game) => {
      const a = { ...plainItem('iron-sword', 100), rarity: 'rare' as const, ilvl: 5, junk: true };
      const b = { ...plainItem('wooden-staff', 101), junk: true };
      const c = { ...plainItem('iron-sword', 102), rarity: 'magic' as const, ilvl: 4 };
      game.state.bag = [a, b, c];
      return { a, b, c };
    };
    const rows = (root: HTMLElement) => [...root.querySelectorAll('.slx-layer:last-child [role=option]')];

    it('lists each bag item with its rarity word, colour and sell price', () => {
      const { game, pick, root } = setup();
      const { a } = gearBag(game);
      pick('販賣');
      pick('裝備');
      const row = rows(root).find((o) => o.getAttribute('data-id') === 'g100')!;
      expect(row.querySelector('.slx-label')!.textContent).toBe('鐵劍・稀有');
      expect(row.querySelector('.slx-label')!.classList.contains('slx-rarity-rare')).toBe(true);
      expect(row.querySelector('.slx-right')!.textContent).toContain(`${sellPrice(a)} G`);
    });

    it('sells one piece after a confirm, pays its price and leaves the sell-to-unlock tally alone', () => {
      const { game, pick, root } = setup(0);
      const { a } = gearBag(game);
      const sold = structuredClone(game.state.sold);
      pick('販賣');
      pick('裝備');
      pick('鐵劍・稀有');
      expect(root.querySelector('.slx-confirm')!.textContent).toContain(`${sellPrice(a)} G`);
      expect(game.state.gold).toBe(0);
      pick('是');
      expect(game.state.gold).toBe(sellPrice(a));
      expect(game.state.bag.map((x) => x.uid)).toEqual([101, 102]);
      expect(game.state.sold).toEqual(sold);
    });

    it('sell all marked asks with the count and total, then sells only the marked items', () => {
      const { game, pick, root } = setup(0);
      const { a, b } = gearBag(game);
      pick('販賣');
      pick('裝備');
      const first = rows(root)[0];
      expect(first.querySelector('.slx-label')!.textContent).toBe('賣出全部已標記（2 件）');
      (first as HTMLElement).click();
      const total = sellPrice(a) + sellPrice(b);
      const q = root.querySelector('.slx-confirm')!.textContent!;
      expect(q).toContain('2 件');
      expect(q).toContain(`${total} G`);
      expect(game.state.bag).toHaveLength(3);
      pick('是');
      expect(game.state.gold).toBe(total);
      expect(game.state.bag.map((x) => x.uid)).toEqual([102]);
      expect(game.state.sold).toEqual({});
    });

    it('declining the confirm sells nothing, and with nothing marked the first row is disabled', () => {
      const { game, pick, root } = setup(0);
      gearBag(game);
      pick('販賣');
      pick('裝備');
      (rows(root)[0] as HTMLElement).click();
      pick('否');
      expect(game.state.bag).toHaveLength(3);
      expect(game.state.gold).toBe(0);

      const none = setup(0);
      none.game.state.bag = [plainItem('iron-sword', 100)];
      none.pick('販賣');
      none.pick('裝備');
      const head = rows(none.root)[0];
      expect(head.getAttribute('aria-disabled')).toBe('true');
      expect(head.querySelector('.slx-label')!.textContent).toBe('賣出全部已標記（0 件）');
    });

    it('says so when the bag holds no gear', () => {
      const { pick, root } = setup();
      pick('販賣');
      pick('裝備');
      expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('沒有可以賣的裝備。');
    });
  });
});
