import { describe, expect, it, vi } from 'vitest';
import { EQUIPMENT } from '../../data/equipment';
import { compareDelta } from '../../engine/compare';
import { Game } from '../../engine/game';
import { START_ITEMS } from '../../engine/state';
import { BAG_SIZE } from '../../engine/loot/bag';
import { materialUses } from '../../engine/forge/uses';
import { T } from '../../data/text.zh-TW';
import { sellPrice } from '../../engine/loot/item';
import { activeIds, defaultSlotFor } from '../../engine/party';
import { constRng, plainItem } from '../../engine/testing';
import { NO_ART, type ArtIndex } from '../../render/textures';
import { art } from '../../render/artPaths';
import { priceOf } from '../../engine/town';
import { ShopScene } from './shop';

/** The topmost open window of the facility (layers stack in document order). */
const topLayer = (root: HTMLElement): Element | undefined => [...root.querySelectorAll('.slx-layer')].pop();

function setup(gold = 100, artIdx: ArtIndex = NO_ART) {
  const game = new Game(constRng(0.5), null);
  game.state.gold = gold;
  const root = document.createElement('div');
  const sfx = { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() };
  const s = new ShopScene({ game, art: artIdx, sfx, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity);
  s.enter(root);
  s.onAction('confirm');
  const pick = (label: string) => {
    const layer = topLayer(root) ?? root.querySelector('.slx-cmd')!;
    const o = [...layer.querySelectorAll('[role=option]')].find((x) => x.querySelector('.slx-label')!.textContent === label);
    if (!o) throw new Error(`no ${label}`);
    (o as HTMLElement).click();
  };
  return { game, root, s, pick, sfx };
}

describe('ShopScene', () => {
  it('gear goods use the gear icon; a retiring base keeps its old icon until its gear art is published', () => {
    const published = [art.gear('iron-sword'), art.icon('iron-sword'), art.icon('hunter-bow'), art.icon('potion'), art.icon('leather-cap')];
    const { pick, root } = setup(100, { has: (u) => published.includes(u) });
    pick('購買');
    const row = (id: string) => root.querySelector<HTMLElement>(`.slx-layer [role=option][data-id="${id}"]`)!;
    const sword = row('iron-sword').querySelector('img')!;
    expect(sword.getAttribute('src')).toBe(art.gear('iron-sword'));
    expect(sword.className).toBe('slx-ico slx-gear-ico');
    // Its gear art is not published but its old icon still is: the old icon, at the item-icon size.
    const bow = row('hunter-bow').querySelector('img')!;
    expect(bow.getAttribute('src')).toBe(art.icon('hunter-bow'));
    expect(bow.className).toBe('slx-ico');
    expect(row('hunter-bow').querySelectorAll('img')).toHaveLength(1);
    // Neither art published: the name alone.
    expect(row('thorn-spear').querySelector('img')).toBeNull();
    const potion = row('potion').querySelector('img')!;              // items keep their icon
    expect(potion.getAttribute('src')).toBe(art.icon('potion'));
    expect(potion.className).toBe('slx-ico');
    // A base that was never in the old icon set gets no old icon, even if a file by that name were listed.
    const list = root.querySelector('.slx-shop-list .slx-menu')!;   // locked rows: the wheel scrolls past them
    for (let i = 0; i < 60 && !row('leather-cap'); i++) list.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true }));
    expect(row('leather-cap').querySelector('img')).toBeNull();
  });

  it('buys a chosen quantity, capped by what the party can afford', () => {
    const { game, pick, s } = setup(100);
    pick('購買');
    pick('回復藥');                       // potion 20 G → at most 5
    s.onAction('up');                     // +10, clamped to 5
    expect(document.body).toBeTruthy();
    s.onAction('confirm');
    expect(game.state.inventory.potion).toBe(START_ITEMS.potion + 5);
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
    pick('鐵劍');
    s.onAction('confirm');
    expect(game.state.bag.map((x) => x.base)).toEqual(['iron-sword']);
    expect(game.state.inventory['iron-sword']).toBeUndefined();
    expect(game.state.gold).toBe(960);

    const full = setup(1000);
    full.game.state.bag = Array.from({ length: BAG_SIZE }, (_, i) => plainItem('iron-sword', 100 + i));
    full.pick('購買');
    full.pick('鐵劍');
    expect(full.sfx.error).toHaveBeenCalled();
    expect(full.root.querySelector('.slx-talk .slx-text')!.textContent).toBe(`背包已滿（${BAG_SIZE} 件）`);
    expect(full.game.state.gold).toBe(1000);
  });

  it('the quantity box caps at the free bag slots', () => {
    const { game, pick, s, root } = setup(100000);
    game.state.bag = Array.from({ length: 58 }, (_, i) => plainItem('iron-sword', 100 + i));
    pick('購買');
    pick('鐵劍');
    s.onAction('up');                           // +10, clamped to the 2 free slots
    expect(root.querySelector('.slx-qty-n')!.textContent).toBe('× 2');
    s.onAction('confirm');
    expect(game.state.bag).toHaveLength(BAG_SIZE);
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

  it('every base in the buy list carries the common colour (the shared label adds no word), and keeps its need text when locked', () => {
    const { pick, root } = setup();
    pick('購買');
    const rows = [...root.querySelectorAll('.slx-layer [role=option]')];
    const gear = rows.filter((o) => o.querySelector('.slx-label')!.classList.contains('slx-rarity-common'));
    expect(gear.length).toBeGreaterThan(0);       // the window shows 12 rows; the rest scroll in
    expect(gear.map((o) => o.getAttribute('data-id'))).toEqual(Object.keys(EQUIPMENT).slice(0, gear.length));
    for (const o of gear) expect(o.querySelector('.slx-label')!.textContent).not.toContain('普通');
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

  it('shows a stat loss in red when the base replaces a worn weapon', () => {
    const { game, pick, root } = setup();
    const lead = activeIds(game.state.party)[0];
    game.state.party.roster[lead].equip.weapon = plainItem('frost-staff', 1);
    pick('購買');
    const row = [...root.querySelectorAll('.slx-layer [role=option]')].find((o) => o.getAttribute('data-id') === 'iron-sword') as HTMLElement;
    row.dispatchEvent(new Event('pointermove'));
    const li = root.querySelector('.slx-info .slx-cmp-member')!;
    expect(li.querySelector('[data-stat=mag]')!.classList.contains('slx-down')).toBe(true);
    expect(li.querySelector('[data-stat=mag]')!.textContent).toMatch(/魔力−\d/);          // the minus sign, not a hyphen
    expect(li.textContent).not.toMatch(/-\d/);
    expect(li.querySelector('[data-stat=atk]')!.classList.contains('slx-up')).toBe(true);
  });

  it('says the stats do not change when the base matches what is worn', () => {
    const { game, pick, root } = setup();
    const lead = activeIds(game.state.party)[0];
    game.state.party.roster[lead].equip.weapon = plainItem('iron-sword', 1);
    pick('購買');
    const row = [...root.querySelectorAll('.slx-layer [role=option]')].find((o) => o.getAttribute('data-id') === 'iron-sword') as HTMLElement;
    row.dispatchEvent(new Event('pointermove'));
    const li = root.querySelector('.slx-info .slx-cmp-member')!;
    expect(li.textContent).toContain('能力不變');
    expect(li.querySelector('.slx-up, .slx-down')).toBeNull();
  });

  describe('selling gear', () => {
    const gearBag = (game: Game) => {
      const a = { ...plainItem('iron-sword', 100), rarity: 'rare' as const, ilvl: 5, junk: true };
      const b = { ...plainItem('wooden-staff', 101), junk: true };
      const c = { ...plainItem('iron-sword', 102), rarity: 'magic' as const, ilvl: 4 };
      game.state.bag = [a, b, c];
      return { a, b, c };
    };
    const rows = (root: HTMLElement) => [...(topLayer(root)?.querySelectorAll('[role=option]') ?? [])];

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

    it('warns before selling a piece with +n or a locked affix, alone or among the marked; plain gear gets no warning', () => {
      const W = T.ui2.shop.warnInvested;
      for (const extra of [{ enhance: 4 }, { locked: 0, affixes: [{ key: 'crit' as const, value: 3 }] }]) {
        const one = setup(0);
        one.game.state.bag = [{ ...plainItem('iron-sword', 100), rarity: 'magic', ...extra }];
        one.pick('販賣');
        one.pick('裝備');
        (rows(one.root)[1] as HTMLElement).click();
        const c = one.root.querySelector('.slx-confirm')!;
        expect(c.textContent, JSON.stringify(extra)).toContain(W);
        expect(c.querySelector('[aria-selected=true]')!.getAttribute('data-id')).toBe('no');
        one.s.onAction('confirm');          // 否 keeps it
        expect(one.game.state.bag).toHaveLength(1);

        const marked = setup(0);
        marked.game.state.bag = [{ ...plainItem('iron-sword', 100), junk: true }, { ...plainItem('iron-sword', 101), junk: true, ...extra }];
        marked.pick('販賣');
        marked.pick('裝備');
        (rows(marked.root)[0] as HTMLElement).click();
        expect(marked.root.querySelector('.slx-confirm')!.textContent).toContain(W);
      }
      const plain = setup(0);
      gearBag(plain.game);
      plain.pick('販賣');
      plain.pick('裝備');
      (rows(plain.root)[0] as HTMLElement).click();
      expect(plain.root.querySelector('.slx-confirm')!.textContent).not.toContain(W);
    });

    it('says so when the bag holds no gear', () => {
      const { pick, root } = setup();
      pick('販賣');
      pick('裝備');
      expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('沒有可以賣的裝備。');
    });
  });

  it('junk shows grey with 雜物 and one press sells it all', () => {
    const { game, pick, root } = setup();
    game.state.inventory['old-coin'] = 3;
    game.state.inventory.moss = 2;
    const gold = game.state.gold;
    pick('販賣');
    pick('素材');
    const rows = [...topLayer(root)!.querySelectorAll('[role=option]')];
    expect(rows[0].querySelector('.slx-label')!.textContent).toBe(T.ui2.shop.sellJunk(3, 120));
    const coin = rows.find((o) => o.querySelector('.slx-label')!.textContent === '古代銀幣（雜物）')!;
    expect(coin.querySelector('.slx-label')!.classList.contains('slx-junk-mat')).toBe(true);
    (rows[0] as HTMLElement).click();
    expect(game.state.inventory['old-coin'] ?? 0).toBe(0);
    expect(game.state.inventory.moss).toBe(2);
    expect(game.state.gold).toBe(gold + 120);
    expect(game.state.sold['old-coin']).toBe(3);
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe(T.ui2.shop.soldJunk(3, 120));
    expect([...topLayer(root)!.querySelectorAll('[role=option]')].some((o) => o.textContent!.includes('古代銀幣'))).toBe(false);
  });

  it('the material detail lists every use', () => {
    const { game, pick, s, root } = setup();
    game.state.inventory.moss = 2;
    game.state.inventory['old-coin'] = 1;
    pick('販賣');
    pick('素材');
    const info = () => root.querySelector('.slx-info')!.textContent!;
    s.onAction('down');                   // past the sell-all-junk row
    expect(info()).toContain('發光苔');
    expect(info()).toContain(T.forge.kind.monster);
    expect(info()).toContain('6 G');
    expect(info()).toContain(T.forge.usedFor(materialUses('moss').map(T.forge.use).join('、')));
    s.onAction('down');
    expect(info()).toContain(T.forge.junkOnly);
    s.onAction('cancel');
    expect(root.querySelector('.slx-info')).toBeNull();
  });

  it('moss lists its uses in words: two potions, two bases and the charm it unlocks', () => {
    const { game, pick, root } = setup();
    game.state.inventory.moss = 2;
    pick('販賣');
    pick('素材');
    expect(root.querySelector('.slx-info')!.textContent).toContain('用於：回復藥、解毒藥、手部打造、項鍊打造、苔光護符解鎖');
  });

  it('the sell-all row shows what junk it sells instead of an empty detail', () => {
    const { game, pick, root } = setup();
    game.state.inventory['old-coin'] = 3;
    game.state.inventory.moss = 2;
    pick('販賣');
    pick('素材');
    const info = root.querySelector('.slx-info')!;
    expect(info.textContent).toContain(T.ui2.shop.junkHead);
    expect(info.textContent).toContain(T.ui2.shop.junkLine('古代銀幣', 3, 120));
    expect(info.textContent).toContain('古代銀幣 ×3');
    expect(info.textContent).toContain(T.forge.junkOnly);
  });

  it('the list and its detail share one row, so a long label pushes the detail aside instead of under it', () => {
    const { game, pick, root } = setup();
    game.state.inventory.moss = 2;
    pick('販賣');
    pick('素材');
    const page = topLayer(root)!;
    expect(page.classList.contains('slx-mat-page')).toBe(true);
    expect(page.querySelector(':scope > .slx-shop-list')).not.toBeNull();
    expect(page.querySelector(':scope > .slx-info.slx-mat-info')).not.toBeNull();
  });

  it('selling all junk announces a newly unlocked base, then the list reloads without the sell-all row', () => {
    const charm = EQUIPMENT['moss-charm'];
    const was = charm.unlock;
    charm.unlock = [{ mat: 'old-coin', qty: 3 }];
    try {
      const { game, pick, root, s } = setup();
      game.state.inventory['old-coin'] = 3;
      game.state.inventory.moss = 2;
      pick('販賣');
      pick('素材');
      (topLayer(root)!.querySelector('[role=option]') as HTMLElement).click();
      expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe(T.ui2.shop.unlocked('苔光護符'));
      const rows = [...topLayer(root)!.querySelectorAll('[role=option]')];
      expect(rows.map((o) => o.querySelector('.slx-label')!.textContent)).toEqual(['發光苔']);
      expect(rows[0].classList.contains('slx-sel')).toBe(true);
      expect(root.querySelector('.slx-info')!.textContent).toContain('發光苔');
      s.onAction('cancel');
    } finally {
      charm.unlock = was;
    }
  });
});

describe('ShopScene: townsfolk perks', () => {
  it('the shop shows the discounted price', () => {
    const plain = setup(1000);
    plain.pick('購買');
    const label = (root: HTMLElement) => [...(topLayer(root) ?? root).querySelectorAll('[role=option]')].find((x) => x.querySelector('.slx-label')!.textContent === '回復藥')!.textContent!;
    expect(label(plain.root)).toContain(`${priceOf(plain.game.state, 'potion')} G`);
    const { game, root, pick } = setup(1000);
    game.state.story.returned.push('orik');
    const cut = priceOf(game.state, 'potion')!;
    expect(cut).toBeLessThan(priceOf(plain.game.state, 'potion')!);
    pick('購買');
    expect(label(root)).toContain(`${cut} G`);
  });
});
