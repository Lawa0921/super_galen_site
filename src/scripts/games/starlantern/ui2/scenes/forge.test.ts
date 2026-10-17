import { describe, expect, it, vi } from 'vitest';
import { T } from '../../data/text.zh-TW';
import { Game } from '../../engine/game';
import type { ForgeResult } from '../../engine/forge/cost';
import { constRng, memoryStorage } from '../../engine/testing';
import type { ItemInstance, Rarity } from '../../engine/types';
import { NO_ART } from '../../render/textures';
import { CHARACTERS } from '../../data/characters';
import { ENHANCE_COST, ENHANCE_MAX, ENHANCE_STEP, ENHANCE_SUCCESS, REGION_AFFIX_GROUP } from '../../data/forge';
import { EQUIPMENT } from '../../data/equipment';
import { AFFIXES } from '../../data/gear';
import { enhanceCost, forgeRng, rerollCost, rerollRange, swapPool } from '../../engine/forge/cost';
import { implicitStats, itemSlot } from '../../engine/loot/item';
import { gearLabel } from '../loot';
import { BAG_SIZE } from '../../engine/loot/bag';
import { baseCost, craftLevel, setCost } from '../../engine/forge/craft';
import { specialLines } from '../../engine/compare';
import { ForgeScene, costText, forgeRows, type ForgeHost } from './forge';

const gear = (uid: number, base: string, rarity: Rarity, extra: Partial<ItemInstance> = {}): ItemInstance =>
  ({ uid, base, rarity, ilvl: 3, affixes: [], enhance: 0, ...extra });

function setup(game = new Game(constRng(0.5), memoryStorage())) {
  const root = document.createElement('div');
  const go = vi.fn();
  const sfx = { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() };
  const s = new ForgeScene({ game, art: NO_ART, sfx, go, hasSave: () => false, newGame: vi.fn() }, Infinity);
  s.enter(root);
  const line = () => root.querySelector('.slx-talk .slx-text')!.textContent;
  const talking = () => !root.querySelector('.slx-talk')!.hasAttribute('hidden');
  return { game, root, s, go, sfx, line, talking };
}

describe('forgeRows', () => {
  it('forgeRows lists the bag, then worn gear with its wearer, each in its rarity colour', () => {
    const game = new Game(constRng(0.5), null);
    const s = game.state;
    s.bag = [gear(1, 'iron-sword', 'rare'), gear(2, 'hunter-bow', 'magic', { junk: true, enhance: 2 })];
    s.party.recruited = ['noel', 'scarlet'];
    s.party.roster.scarlet.equip = { weapon: gear(3, 'iron-sword', 'common') };
    s.party.roster.noel.equip = { body: gear(4, 'cloth-robe', 'legendary') };
    const rows = forgeRows(s, { worn: true, right: (it) => `#${it.uid}` });
    expect(rows.map((r) => r.id)).toEqual(['g1', 'g2', 'g4', 'g3']);
    expect(rows.map((r) => r.label)).toEqual(['鐵劍・稀有', '獵弓 +2・魔法', `布袍・傳說${T.ui2.forge.wornBy('諾艾兒')}`, `鐵劍${T.ui2.forge.wornBy('絲嘉蕾')}`]);
    expect(rows.map((r) => r.cls)).toEqual(['slx-rarity-rare', 'slx-rarity-magic slx-junk', 'slx-rarity-legendary', 'slx-rarity-common']);
    expect(rows.map((r) => r.right)).toEqual(['#1', '#2', '#4', '#3']);
  });

  it('leaves worn gear out unless asked, and applies the filter to both', () => {
    const game = new Game(constRng(0.5), null);
    const s = game.state;
    s.bag = [gear(1, 'iron-sword', 'rare'), gear(2, 'hunter-bow', 'magic')];
    s.party.roster[s.party.recruited[0]].equip = { weapon: gear(3, 'iron-sword', 'rare') };
    expect(forgeRows(s, { worn: false, right: () => '' }).map((r) => r.id)).toEqual(['g1', 'g2']);
    expect(forgeRows(s, { worn: true, filter: (it) => it.rarity === 'rare', right: () => '' }).map((r) => r.id)).toEqual(['g1', 'g3']);
  });
});

describe('ForgeScene', () => {
  const TABS = ['分解', '強化', '重鑄', '合成', '製作'];

  it('greets as 多蘭 in the 鍛造屋', () => {
    const { root, line } = setup();
    expect(root.querySelector('.slx-place')!.textContent).toBe('鍛造屋');
    expect(root.querySelector('.slx-talk .slx-name')!.textContent).toBe('多蘭');
    expect(T.ui2.facility.forge.greet).toContain(line());
    expect(root.querySelector('.slx-facility.slx-forge')).not.toBeNull();
  });

  it('the forge offers 分解 強化 重鑄 合成 製作 and every tab is reachable by keyboard and by click', () => {
    const { root, s, go, line, talking } = setup();
    s.onAction('confirm');                  // greeting
    const opts = [...root.querySelectorAll('.slx-cmd [role=option]')];
    expect(opts.map((o) => o.querySelector('.slx-label')!.textContent)).toEqual([...TABS, '離開']);
    expect(opts.map((o) => o.getAttribute('data-id'))).toEqual(['dismantle', 'enhance', 'reroll', 'fuse', 'craft', 'leave']);
    // Keyboard: each tab in turn.
    TABS.forEach((tab, i) => {
      if (i) s.onAction('down');
      // Every tab opens its own page (covered below); 製作 is the last of them.
      if (tab !== '製作') return;
      expect(talking()).toBe(false);
      s.onAction('confirm');
      expect(root.querySelector('.slx-forge-list [data-id=item]')).not.toBeNull();
      s.onAction('cancel');
      expect(root.querySelector('.slx-forge-list')).toBeNull();
    });
    // Mouse and touch: a click on the tab.
    const opt = [...root.querySelectorAll('.slx-cmd [role=option]')].find((o) => o.textContent === '製作') as HTMLElement;
    opt.click();
    expect(root.querySelector('.slx-forge-list [data-id=item]')).not.toBeNull();
    s.onAction('cancel');
    // Leaving returns to town, by key and by the 返回 control.
    s.onAction('cancel');
    expect(go).toHaveBeenCalledWith('town');
    go.mockClear();
    (root.querySelector('.slx-back') as HTMLElement).click();
    expect(go).toHaveBeenCalledWith('town');
  });

  it('afterAct speaks the ok line, or the reason, and reports a failed save', async () => {
    const { game, s, sfx, line, talking } = setup();
    s.onAction('confirm');                  // greeting
    const host = (s as unknown as { host(): ForgeHost }).host();
    const ok: ForgeResult<number> = { ok: true, state: game.state, out: 3 };

    game.notice = 'saved';
    host.afterAct(ok, (n) => [`得到 ${n} 個`, { text: '鐵塊', cls: 'slx-rarity-rare' }]);
    expect(sfx.confirm).toHaveBeenCalled();
    expect(line()).toBe('得到 3 個鐵塊');
    expect(game.notice).toBeNull();          // nothing left for the town to repeat
    s.onAction('confirm');

    host.afterAct({ ok: false, reason: 'affixLocked' }, () => ['never']);
    expect(sfx.error).toHaveBeenCalled();
    expect(line()).toBe(T.reasons.affixLocked);
    s.onAction('confirm');

    game.notice = 'save-failed';
    host.afterAct(ok, () => ['做好了']);
    expect(line()).toBe('做好了');
    s.onAction('confirm');
    await vi.waitFor(() => expect(line()).toBe(T.ui2.forge.saveFailed));
    expect(game.notice).toBeNull();
    s.onAction('confirm');
    expect(talking()).toBe(false);
  });

  it('the host reaches the scene: layers go on the stage and come off', () => {
    const { root, s } = setup();
    s.onAction('confirm');
    const host = (s as unknown as { host(): ForgeHost }).host();
    expect(host.layerRoot).toBe(root.querySelector('.slx-stage'));
    const a = document.createElement('div');
    const b = document.createElement('div');
    host.push({ el: a, onAction: () => true });
    host.push({ el: b, onAction: () => true });
    expect(root.querySelector('.slx-cmd')!.hasAttribute('inert')).toBe(true);
    host.pop(true);
    expect(b.isConnected).toBe(false);
    host.popAll();
    expect(a.isConnected).toBe(false);
    expect(root.querySelector('.slx-cmd')!.hasAttribute('inert')).toBe(false);
  });

  it('keeps the reasons the shop and the gate use apart from the forge ones', () => {
    expect(T.reasons.locked).toBe('尚未解鎖');
    expect(T.reasons).toMatchObject({ mats: '素材不足', max: '已經強化到最高了', affixLocked: '這件裝備只能重鑄已鎖定的詞綴', none: '沒有可以換的詞綴' });
  });

  it('no element carries a style attribute', () => {
    const { root, s } = setup();
    s.onAction('confirm');
    s.onAction('confirm');                  // 分解
    expect(root.querySelectorAll('[style]').length).toBe(0);
  });
});

describe('ForgeScene dismantle page', () => {
  function open(bag: ItemInstance[], storage = memoryStorage()) {
    const game = new Game(constRng(0.5), storage);
    game.state.bag = bag;
    const t = setup(game);
    t.s.onAction('confirm');                // greeting
    t.s.onAction('confirm');                // 分解
    const rows = () => [...t.root.querySelectorAll('.slx-forge-list [role=option]')];
    const ids = () => rows().map((r) => r.getAttribute('data-id'));
    const confirmEl = () => t.root.querySelector('.slx-confirm');
    return { ...t, game, rows, ids, confirmEl };
  }
  const ess = (id: string) => (g: Game) => g.state.inventory[id] ?? 0;

  it('dismantling one item asks first, 否 by default, then pays essences and saves', () => {
    const storage = memoryStorage();
    const setItem = vi.spyOn(storage, 'setItem');
    const { game, s, ids, rows, confirmEl, line, root } = open([gear(1, 'iron-sword', 'rare', { enhance: 2 }), gear(2, 'hunter-bow', 'magic')], storage);
    expect(ids()).toEqual(['g1', 'g2']);
    expect(rows()[0].textContent).toContain('鐵劍 +2・稀有');
    expect(rows()[0].textContent).toContain(T.ui2.forge.yields({ 'essence-rare': 1, 'essence-magic': 1 }));
    s.onAction('confirm');
    expect(confirmEl()).not.toBeNull();
    expect(confirmEl()!.textContent).toContain('稀有精華 ×1、魔法精華 ×1');
    expect(confirmEl()!.querySelector('[aria-selected=true]')!.getAttribute('data-id')).toBe('no');
    expect(root.querySelectorAll('[style]').length).toBe(0);
    // Confirming straight away is a 否: nothing happens.
    s.onAction('confirm');
    expect(confirmEl()).toBeNull();
    expect(game.state.bag.length).toBe(2);
    expect(setItem).not.toHaveBeenCalled();
    // Now 是.
    s.onAction('confirm');
    s.onAction('up');
    s.onAction('confirm');
    expect(game.state.bag.map((i) => i.uid)).toEqual([2]);
    expect(ess('essence-rare')(game)).toBe(1);
    expect(ess('essence-magic')(game)).toBe(1);
    expect(setItem).toHaveBeenCalled();
    expect(line()).toBe(T.ui2.forge.dismantled('稀有精華 ×1、魔法精華 ×1'));
    s.onAction('confirm');
    expect(ids()).toEqual(['g2']);          // the list updated and is still open
  });

  it('分解全部已標記 dismantles exactly the marked items and warns about a legendary', () => {
    const { game, s, ids, confirmEl, rows } = open([
      gear(1, 'iron-sword', 'common'), gear(2, 'hunter-bow', 'legendary', { junk: true }), gear(3, 'cloth-robe', 'magic', { junk: true }),
    ]);
    expect(ids()[0]).toBe('marked');
    expect(rows()[0].textContent).toContain(T.ui2.forge.dismantleMarked(2));
    s.onAction('confirm');
    const text = confirmEl()!.textContent!;
    expect(text).toContain('2 件');
    expect(text).toContain('傳說精華 ×1、稀有精華 ×1、魔法精華 ×1、普通精華 ×1');
    expect(text).toContain(T.ui2.forge.warnPrecious);
    expect(confirmEl()!.querySelector('[aria-selected=true]')!.getAttribute('data-id')).toBe('no');
    s.onAction('up');
    s.onAction('confirm');
    expect(game.state.bag.map((i) => i.uid)).toEqual([1]);
    expect(ess('essence-legendary')(game)).toBe(1);
    expect(ess('essence-common')(game)).toBe(1);
  });

  it('a single rare item asks first in its rarity colour; a magic one goes at once', () => {
    const { game, s, confirmEl, line } = open([gear(1, 'iron-sword', 'rare'), gear(2, 'hunter-bow', 'magic')]);
    s.onAction('confirm');
    expect(confirmEl()).not.toBeNull();
    expect(confirmEl()!.querySelector('.slx-rarity-rare')!.textContent).toBe('鐵劍・稀有');
    expect(confirmEl()!.querySelector('.slx-rarity-magic')!.textContent).toContain('魔法精華');
    s.onAction('confirm');                  // 否
    expect(game.state.bag.length).toBe(2);
    s.onAction('down');
    s.onAction('confirm');                  // the magic one: no question
    expect(confirmEl()).toBeNull();
    expect(game.state.bag.map((i) => i.uid)).toEqual([1]);
    expect(line()).toBe(T.ui2.forge.dismantled('魔法精華 ×1、普通精華 ×1'));
  });

  it('warns for enhanced gear, but not for a plain rare piece', () => {
    const a = open([gear(1, 'iron-sword', 'common', { enhance: 1 })]);
    a.s.onAction('confirm');
    expect(a.confirmEl()!.textContent).toContain(T.ui2.forge.warnPrecious);
    const b = open([gear(1, 'iron-sword', 'rare')]);
    b.s.onAction('confirm');
    expect(b.confirmEl()!.textContent).not.toContain(T.ui2.forge.warnPrecious);
  });

  it('has no 分解全部已標記 row without marked gear, and never lists worn gear', () => {
    const game = new Game(constRng(0.5), memoryStorage());
    game.state.bag = [gear(1, 'iron-sword', 'rare')];
    game.state.party.roster[game.state.party.recruited[0]].equip = { weapon: gear(9, 'iron-sword', 'rare') };
    const t = setup(game);
    t.s.onAction('confirm'); t.s.onAction('confirm');
    expect([...t.root.querySelectorAll('.slx-forge-list [role=option]')].map((r) => r.getAttribute('data-id'))).toEqual(['g1']);
  });

  it('an empty bag says so instead of opening a list', () => {
    const { line, root } = open([]);
    expect(line()).toBe(T.ui2.forge.nothingToDismantle);
    expect(root.querySelector('.slx-forge-list')).toBeNull();
  });

  it('closes the list when the last item goes', () => {
    const { s, root } = open([gear(1, 'iron-sword', 'common')]);
    s.onAction('confirm');
    expect(root.querySelector('.slx-forge-list')).toBeNull();
  });

  it('a save failure is reported honestly', async () => {
    const storage = memoryStorage();
    vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const { s, line } = open([gear(1, 'iron-sword', 'common'), gear(2, 'iron-sword', 'common')], storage);
    s.onAction('confirm');
    s.onAction('confirm');
    await vi.waitFor(() => expect(line()).toBe(T.ui2.forge.saveFailed));
  });

  it('a bag of 15 shows the ▼ scroll cue, and the cue and the wheel scroll', () => {
    const { s, root, rows } = open(Array.from({ length: 15 }, (_, i) => gear(i + 1, 'iron-sword', 'common')));
    expect(rows().length).toBe(12);
    const down = root.querySelector('.slx-forge-list .slx-more-down') as HTMLElement;
    expect(down).not.toBeNull();
    down.click();
    expect(root.querySelector('.slx-forge-list .slx-more-up')).not.toBeNull();
    for (let i = 0; i < 13; i++) s.onAction('down');
    expect(rows().at(-1)!.getAttribute('data-id')).toBe('g15');
    expect(root.querySelector('.slx-forge-list .slx-more-down')).toBeNull();
    // The wheel scrolls back up.
    root.querySelector('.slx-forge-list .slx-menu')!.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }));
    expect(rows()[0].getAttribute('data-id')).toBe('g3');
  });

  it('a click on a row and on 是 dismantles too', () => {
    const { game, root, rows, confirmEl } = open([gear(1, 'iron-sword', 'rare'), gear(2, 'iron-sword', 'common')]);
    (rows()[0] as HTMLElement).click();
    expect(confirmEl()).not.toBeNull();
    (confirmEl()!.querySelector('[data-id=yes]') as HTMLElement).click();
    expect(game.state.bag.map((i) => i.uid)).toEqual([2]);
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe(T.ui2.forge.dismantled('稀有精華 ×1、魔法精華 ×1'));
  });

  it('cancel on the list goes back to the tabs', () => {
    const { s, root } = open([gear(1, 'iron-sword', 'common')]);
    s.onAction('cancel');
    expect(root.querySelector('.slx-forge-list')).toBeNull();
  });
});

const CHAR_NAME = (id: keyof typeof CHARACTERS): string => CHARACTERS[id].name;

describe('costText', () => {
  it('costText marks what is lacking with words and a class', () => {
    const game = new Game(constRng(0.5), null);
    game.state.gold = 140;
    game.state.inventory = { 'essence-magic': 3 };
    const parts = costText(game.state, { gold: 140, mats: { 'essence-magic': 5 } });
    const text = parts.map((p) => (typeof p === 'string' ? p : p.text)).join('');
    expect(text).toBe(`魔法精華 3／5${T.ui2.forge.lacking}、140 G`);
    expect(parts.filter((p) => typeof p !== 'string' && p.cls === 'slx-lack').map((p) => (p as { text: string }).text)).toEqual([`魔法精華 3／5${T.ui2.forge.lacking}`]);
    game.state.gold = 90;
    const poor = costText(game.state, { gold: 140, mats: {} });
    expect(poor).toEqual([{ text: `90／140 G${T.ui2.forge.lacking}`, cls: 'slx-lack' }]);
  });
});

describe('ForgeScene enhance page', () => {
  function open(bag: ItemInstance[], prep: (g: Game) => void = () => {}) {
    const game = new Game(constRng(0.5), memoryStorage());
    game.state.bag = bag;
    prep(game);
    const t = setup(game);
    t.s.onAction('confirm');                // greeting
    t.s.onAction('down');
    t.s.onAction('confirm');                // 強化
    const info = () => t.root.querySelector('.slx-info') as HTMLElement;
    const rows = () => [...t.root.querySelectorAll('.slx-forge-list [role=option]')];
    const confirmEl = () => t.root.querySelector('.slx-confirm');
    return { ...t, game, info, rows, confirmEl };
  }
  const at = (o: ItemInstance, enhance: number): ItemInstance => ({ ...o, enhance });

  it('the detail compares the base bonus now and at the next level, with chance and cost', () => {
    const it = gear(1, 'iron-sword', 'rare', { ilvl: 40, enhance: 5 });
    const { info, rows } = open([it], (g) => { g.state.gold = 100; g.state.inventory = { 'essence-magic': 1 }; });
    const now = implicitStats(it).atk!;
    const next = implicitStats(at(it, 6)).atk!;
    expect(next).toBeGreaterThan(now);
    const text = info().textContent!;
    expect(text).toContain(T.ui2.forge.levelStep(5, 6));
    expect(text).toContain(T.ui2.forge.baseStat('攻擊', now, next));
    expect(info().querySelector('.slx-up')).not.toBeNull();
    expect(text).toContain(T.ui2.forge.chance(80));
    expect(text).toContain(T.ui2.forge.failNote);
    expect(text).toContain('魔法精華 1／4');
    expect(text).toContain('100／200 G');
    expect(info().querySelectorAll('.slx-lack').length).toBe(2);
    expect(rows()[0].textContent).toContain('+5');
  });

  it('a small base still shows its step: one decimal when fractional, green', () => {
    const { info } = open([gear(1, 'iron-sword', 'common', { ilvl: 1 })]);
    expect(info().textContent).toContain(`攻擊 +4.0 → +${(4 * (1 + ENHANCE_STEP)).toFixed(1)}`);
    expect(info().querySelector('.slx-cmp-row.slx-up')).not.toBeNull();
  });

  it('every base at every level reads as a change in the preview words', () => {
    for (const b of Object.values(EQUIPMENT)) for (const ilvl of [b.ilvl, b.ilvl + 7, 60]) for (let e = 0; e < ENHANCE_MAX; e++) {
      const it = gear(1, b.id, 'common', { ilvl, enhance: e });
      const [now, next] = [implicitStats(it), implicitStats(at(it, e + 1))];
      for (const k of Object.keys(next) as (keyof typeof next)[]) {
        const words = T.ui2.forge.baseStat('x', now[k]!, next[k]!);
        const [from, to] = words.slice(2).split(' → ');
        expect(from, `${b.id} ilvl ${ilvl} +${e} ${k}: ${words}`).not.toBe(to);
      }
    }
  });

  it('shows no chance below +5, and no failure note at 100%', () => {
    const { info } = open([gear(1, 'iron-sword', 'common', { enhance: 2 })]);
    expect(info().textContent).not.toContain('成功率');
    expect(info().textContent).not.toContain(T.ui2.forge.failNote);
  });

  it("a worn item shows its wearer's gains and who wears it", () => {
    const it = gear(7, 'iron-sword', 'rare', { ilvl: 40, enhance: 5 });
    const { game, rows, info } = open([], (g) => { g.state.party.roster[g.state.party.recruited[0]].equip = { weapon: it }; });
    const wearer = game.state.party.recruited[0];
    expect(rows()[0].textContent).toContain(T.ui2.forge.wornBy(CHAR_NAME(wearer)));
    const row = info().querySelector('.slx-cmp-member')!;
    expect(row.textContent).toContain(CHAR_NAME(wearer));
    expect(row.querySelector('.slx-up[data-stat=atk]')).not.toBeNull();
  });

  it('yes on a +0 item makes it +1 and says so; the row reads +1', () => {
    const { game, s, line, rows, confirmEl, sfx } = open([gear(1, 'iron-sword', 'common')], (g) => {
      g.state.gold = 100; g.state.inventory = { 'essence-common': 5 };
    });
    s.onAction('confirm');
    expect(confirmEl()!.querySelector('[aria-selected=true]')!.getAttribute('data-id')).toBe('no');
    s.onAction('confirm');                  // 否
    expect(game.state.bag[0].enhance).toBe(0);
    s.onAction('confirm'); s.onAction('up'); s.onAction('confirm');
    expect(game.state.bag[0].enhance).toBe(1);
    expect(line()).toBe(T.ui2.forge.enhanceOk('鐵劍 +1'));
    expect(sfx.error).not.toHaveBeenCalled();
    s.onAction('confirm');
    expect(rows()[0].textContent).toContain('+1');
    expect(game.state.gold).toBe(100 - ENHANCE_COST[0].gold);
  });

  it('a failed +6 attempt plays error, keeps +5 and spends the cost', () => {
    const it = gear(1, 'iron-sword', 'common', { enhance: 5 });
    const cost = ENHANCE_COST[5];
    const { game, s, line, sfx, rows, confirmEl } = open([it], (g) => {
      g.state.gold = 500; g.state.inventory = { 'essence-magic': 9 };
      for (let d = 0; d < 200; d++) {
        const c = structuredClone(g.state); c.forgeDraws = d;
        if (forgeRng(c)() >= ENHANCE_SUCCESS[5]) { g.state.forgeDraws = d; break; }
      }
    });
    s.onAction('confirm'); s.onAction('up'); s.onAction('confirm');
    expect(confirmEl()).toBeNull();
    expect(game.state.bag[0].enhance).toBe(5);
    expect(game.state.gold).toBe(500 - cost.gold);
    expect(game.state.inventory['essence-magic']).toBe(9 - cost.mats['essence-magic']);
    expect(sfx.error).toHaveBeenCalledTimes(1);
    expect(line()).toBe(T.ui2.forge.enhanceFail('鐵劍 +5'));
    expect(rows()[0].textContent).toContain('+5');
  });

  it('a +10 item shows 已達上限 and Enter refuses with the reason', () => {
    const { game, s, rows, info, line, confirmEl, sfx } = open([gear(1, 'iron-sword', 'rare', { enhance: 10 })]);
    expect(rows()[0].textContent).toContain(T.ui2.forge.maxed);
    expect(info().textContent).toContain(T.ui2.forge.maxed);
    s.onAction('confirm');
    expect(confirmEl()).toBeNull();
    expect(sfx.error).toHaveBeenCalled();
    expect(line()).toBe(T.reasons.max);
    expect(game.state.bag[0].enhance).toBe(10);
  });

  it('missing materials are named exactly, and nothing is spent', () => {
    const { game, s, line, confirmEl } = open([gear(1, 'iron-sword', 'common', { enhance: 5 })], (g) => {
      g.state.gold = 150; g.state.inventory = { 'essence-magic': 1 };
    });
    s.onAction('confirm');
    expect(confirmEl()).toBeNull();
    expect(line()).toBe(T.ui2.forge.lackNames(['魔法精華 ×3', '金錢 50 G']));
    expect(game.state.gold).toBe(150);
    expect(enhanceCost(game.state.bag[0])).not.toBeNull();
  });

  it('with nothing to enhance it says so; no inline styles', () => {
    const game = new Game(constRng(0.5), memoryStorage());
    game.state.bag = [];
    for (const m of Object.values(game.state.party.roster)) m.equip = {};
    const t = setup(game);
    t.s.onAction('confirm'); t.s.onAction('down'); t.s.onAction('confirm');
    expect(t.line()).toBe(T.ui2.forge.nothingToEnhance);
    const o = open([gear(1, 'iron-sword', 'rare', { enhance: 5 })]);
    expect(o.root.querySelectorAll('[style]').length).toBe(0);
  });

  it('cancel closes the list and its detail', () => {
    const { s, root, info } = open([gear(1, 'iron-sword', 'common')]);
    expect(info()).not.toBeNull();
    s.onAction('cancel');
    expect(root.querySelector('.slx-forge-list')).toBeNull();
    expect(root.querySelector('.slx-info')).toBeNull();
  });
});

describe('ForgeScene reroll page', () => {
  const sword = (extra: Partial<ItemInstance> = {}) => gear(1, 'iron-sword', 'rare', {
    ilvl: 30, affixes: [{ key: 'crit', value: 3 }, { key: 'atk', value: 12 }], ...extra,
  });
  const RICH = { 'essence-rare': 5, 'essence-legendary': 5, 'star-tear': 3, 'blaze-core': 2, 'frost-heart': 2, 'shade-crystal': 1 };

  function open(bag: ItemInstance[], prep: (g: Game) => void = () => {}, storage = memoryStorage()) {
    const game = new Game(constRng(0.5), storage);
    game.state.bag = bag;
    game.state.gold = 1000;
    game.state.inventory = { ...RICH };
    prep(game);
    const t = setup(game);
    t.s.onAction('confirm');                // greeting
    t.s.onAction('down'); t.s.onAction('down');
    t.s.onAction('confirm');                // 重鑄
    const lists = () => [...t.root.querySelectorAll('.slx-forge-list')];
    const top = () => lists()[lists().length - 1];
    const rows = () => [...top().querySelectorAll('[role=option]')] as HTMLElement[];
    const ids = () => rows().map((r) => r.getAttribute('data-id')!);
    const info = () => t.root.querySelector('.slx-info') as HTMLElement;
    const confirmEl = () => t.root.querySelector('.slx-confirm') as HTMLElement | null;
    const go = (...a: Array<'up' | 'down' | 'confirm' | 'cancel'>) => a.forEach((x) => t.s.onAction(x));
    return { ...t, game, lists, rows, ids, info, confirmEl, go };
  }
  const F = T.ui2.forge;
  const affixName = (k: 'crit' | 'atk', v: number) => T.gear.affix(k, v);

  it('lists items with affixes, each with its locked affix or 未鎖定; plain gear is left out', () => {
    const { rows, ids } = open([sword(), gear(2, 'iron-sword', 'common'), sword({ uid: 3, locked: 1 })]);
    expect(ids()).toEqual(['g1', 'g3']);
    expect(rows()[0].querySelector('.slx-right')!.textContent).toBe(F.unlocked);
    expect(rows()[1].querySelector('.slx-right')!.textContent).toBe(affixName('atk', 12));
  });

  it('with nothing to reroll it says so', () => {
    const game = new Game(constRng(0.5), memoryStorage());
    game.state.bag = [gear(1, 'iron-sword', 'common')];
    for (const m of Object.values(game.state.party.roster)) m.equip = {};
    const t = setup(game);
    t.s.onAction('confirm'); t.s.onAction('down'); t.s.onAction('down'); t.s.onAction('confirm');
    expect(t.line()).toBe(F.nothingToReroll);
  });

  it('the first reroll warns about the lock; afterwards only that affix is selectable', () => {
    const a = open([sword()]);
    a.go('confirm');                        // item -> affixes
    expect(a.ids()).toEqual(['a0', 'a1']);
    expect(a.rows().every((r) => r.getAttribute('aria-disabled') === 'false')).toBe(true);
    a.go('confirm');                        // affix -> how
    expect(a.info().textContent).toContain(F.lockWarn);
    a.go('confirm');                        // 重抽數值 -> confirm
    expect(a.confirmEl()!.textContent).toContain(F.lockWarn);

    const b = open([sword({ locked: 1 })]);
    b.go('confirm');
    expect(b.rows().map((r) => r.getAttribute('aria-disabled'))).toEqual(['true', 'false']);
    expect(b.rows()[0].textContent).toContain(F.lockedShort);
    expect(b.info().textContent).toContain(F.lockedOther);
    expect(F.lockedOther).toBe(T.reasons.affixLocked);
    b.go('confirm');                        // the cursor starts on the only live row, a1
    expect(b.ids()[0]).toBe('value');
    expect(b.info().textContent).not.toContain(F.lockWarn);
    b.rows()[0].click();
    expect(b.confirmEl()!.textContent).not.toContain(F.lockWarn);
    // A disabled row cannot be clicked into.
    b.go('cancel');                         // the confirm
    b.go('cancel');                         // the method list
    expect(b.ids()).toEqual(['a0', 'a1']);
    b.rows()[0].click();
    expect(b.ids()).toEqual(['a0', 'a1']);
  });

  it('the value preview shows rerollRange; the swap preview lists swapPool names', () => {
    const it = sword();
    const { go, info, rows, ids } = open([it]);
    go('confirm', 'confirm');
    expect(ids().slice(0, 2)).toEqual(['value', 'swap']);
    const [lo, hi] = rerollRange(it, 0)!;
    expect(info().textContent).toContain(affixName('crit', 3));
    expect(info().textContent).toContain(F.rerollRange('crit', lo, hi));
    expect(info().textContent).toContain('稀有精華 5／1');
    go('down');
    const names = swapPool(it, 0).map((k) => T.gear.statName[k]);
    expect(names.length).toBeGreaterThan(2);
    expect(info().textContent).toContain(F.rerollPool(names.join('、')));
    expect(info().textContent).toContain('稀有精華 5／2');
    // The right-hand column is the cost summary of each row.
    expect(rows()[1].querySelector('.slx-right')!.textContent).toBe(`${rerollCost(it, { swap: true }).gold} G`);
  });

  it('region-material rows list each region, and an empty pool is disabled with the reason', () => {
    const slot = itemSlot(sword());
    const crowded = (Object.keys(AFFIXES) as Array<keyof typeof AFFIXES>)
      .filter((k) => REGION_AFFIX_GROUP['shade-crystal'].includes(k) && AFFIXES[k].slots.includes(slot));
    const it = sword({ affixes: crowded.map((key) => ({ key, value: 5 })) });
    expect(swapPool(it, 0, 'shade-crystal')).toEqual([]);
    expect(swapPool(it, 0, 'blaze-core').length).toBeGreaterThan(0);
    const { go, ids, rows } = open([it]);
    go('confirm', 'confirm');
    expect(ids().filter((i) => i.startsWith('mat:'))).toEqual(Object.keys(REGION_AFFIX_GROUP).map((m) => `mat:${m}`));
    const byId = (id: string) => rows().find((r) => r.getAttribute('data-id') === id)!;
    expect(byId('mat:shade-crystal').getAttribute('aria-disabled')).toBe('true');
    expect(byId('mat:shade-crystal').textContent).toContain(T.reasons.none);
    expect(byId('mat:blaze-core').getAttribute('aria-disabled')).toBe('false');
    expect(byId('mat:blaze-core').textContent).toContain(F.rerollWith('火焰核', T.forge.group.blaze));
  });

  it('a region material pins the category: the preview lists only that group, and the cost adds the material', () => {
    const it = sword();
    const { go, info, rows, ids } = open([it]);
    go('confirm', 'confirm');
    go(...(Array(ids().indexOf('mat:blaze-core')).fill('down') as 'down'[]));
    const names = swapPool(it, 0, 'blaze-core').map((k) => T.gear.statName[k]);
    expect(info().textContent).toContain(F.rerollPool(names.join('、')));
    expect(info().textContent).toContain('火焰核 2／1');
    const cost = rerollCost(it, { swap: true, mat: 'blaze-core' });
    expect(rows().find((r) => r.getAttribute('data-id') === 'mat:blaze-core')!.querySelector('.slx-right')!.textContent).toContain(`${cost.gold} G`);
  });

  it('a unique offers only 重抽數值, and a set the same', () => {
    for (const rarity of ['unique', 'set'] as const) {
      const { go, ids } = open([sword({ rarity })]);
      go('confirm', 'confirm');
      expect(ids()).toEqual(['value']);
    }
  });

  it('a legendary shows the extra 星燈之淚 cost', () => {
    const { go, info } = open([sword({ rarity: 'legendary' })]);
    go('confirm', 'confirm');
    expect(info().textContent).toContain('星燈之淚 3／1');
  });

  it('missing materials are named and nothing is spent', () => {
    const { go, game, line, confirmEl } = open([sword()], (g) => { g.state.inventory = {}; g.state.gold = 5; });
    go('confirm', 'confirm', 'confirm');
    expect(confirmEl()).toBeNull();
    expect(line()).toBe(F.lackNames(['稀有精華 ×1', `金錢 ${rerollCost(sword(), { swap: false }).gold - 5} G`]));
    expect(game.state.bag[0].locked).toBeUndefined();
    expect(game.state.gold).toBe(5);
  });

  it('yes rerolls, says before and after, locks the affix and saves; 否 changes nothing', () => {
    const storage = memoryStorage();
    const setItem = vi.spyOn(storage, 'setItem');
    const { go, game, line, confirmEl, ids, rows, root } = open([sword()], () => {}, storage);
    go('confirm', 'confirm', 'confirm');
    expect(confirmEl()!.querySelector('[aria-selected=true]')!.getAttribute('data-id')).toBe('no');
    go('confirm');                          // 否
    expect(confirmEl()).toBeNull();
    expect(game.state.bag[0].locked).toBeUndefined();
    expect(setItem).not.toHaveBeenCalled();
    go('confirm', 'up', 'confirm');         // 是
    const after = game.state.bag[0].affixes[0];
    expect(game.state.bag[0].locked).toBe(0);
    expect(game.state.bag[0].affixes[1]).toEqual({ key: 'atk', value: 12 });
    expect(game.state.inventory['essence-rare']).toBe(4);
    expect(setItem).toHaveBeenCalled();
    expect(line()).toBe(F.rerolled(affixName('crit', 3), T.gear.affix(after.key, after.value)));
    expect(root.querySelectorAll('[style]').length).toBe(0);
    go('confirm');                          // dismiss -> back at the affix layer, refreshed
    expect(ids()).toEqual(['a0', 'a1']);
    expect(rows()[0].textContent).toContain(T.gear.affix(after.key, after.value));
    expect(rows()[1].getAttribute('aria-disabled')).toBe('true');
  });

  it('a better roll is green and a worse one is red', () => {
    const run = (value: number) => {
      const t = open([sword({ affixes: [{ key: 'crit', value }, { key: 'atk', value: 12 }] })]);
      t.go('confirm', 'confirm', 'confirm', 'up', 'confirm');
      return t.root.querySelector('.slx-talk .slx-text')!;
    };
    expect(rerollRange(sword(), 0)![0]).toBeGreaterThan(1);
    expect(run(1).querySelector('.slx-up')).not.toBeNull();
    expect(run(99).querySelector('.slx-down')).not.toBeNull();
  });

  it('a value reroll says 提升 or 下降 beside the colour, so colour is not the only cue', () => {
    const run = (value: number) => {
      const t = open([sword({ affixes: [{ key: 'crit', value }, { key: 'atk', value: 12 }] })]);
      t.go('confirm', 'confirm', 'confirm', 'up', 'confirm');
      return t.root.querySelector('.slx-talk .slx-text')!;
    };
    const up = run(1);
    expect(up.querySelector('.slx-up')!.textContent).toContain('提升');
    expect(up.textContent).not.toContain('下降');
    const down = run(99);
    expect(down.querySelector('.slx-down')!.textContent).toContain('下降');
    expect(down.textContent).not.toContain('提升');
  });

  it('a swap with a region material changes the key from that group and spends the material', () => {
    const { go, game, ids, line } = open([sword()]);
    go('confirm', 'confirm');
    go(...(Array(ids().indexOf('mat:blaze-core')).fill('down') as 'down'[]));
    go('confirm', 'up', 'confirm');
    const after = game.state.bag[0].affixes[0];
    expect(REGION_AFFIX_GROUP['blaze-core']).toContain(after.key);
    expect(game.state.inventory['blaze-core']).toBe(1);
    expect(game.state.bag[0].locked).toBe(0);
    expect(line()).toContain(' → ');
  });

  it('only the top window reads at full strength: lower lists and the command window are marked slx-under', () => {
    const { go, lists, confirmEl, root } = open([sword()]);
    const under = () => lists().map((l) => l.classList.contains('slx-under'));
    go('confirm', 'confirm');
    expect(under()).toEqual([true, true, false]);
    expect(root.querySelector('.slx-cmd')!.classList.contains('slx-under')).toBe(true);
    go('confirm');                          // the confirm opens on top of all three lists
    expect(confirmEl()!.classList.contains('slx-under')).toBe(false);
    expect(under()).toEqual([true, true, true]);
    go('confirm');                          // 否: back to the method list on top
    expect(under()).toEqual([true, true, false]);
    go('cancel', 'cancel', 'cancel');
    expect(root.querySelector('.slx-cmd')!.classList.contains('slx-under')).toBe(false);
  });

  it('Esc steps back one layer at a time and closes the detail', () => {
    const { go, lists, root } = open([sword()]);
    go('confirm', 'confirm');
    expect(lists().length).toBe(3);
    go('cancel');
    expect(lists().length).toBe(2);
    go('cancel');
    expect(lists().length).toBe(1);
    go('cancel');
    expect(lists().length).toBe(0);
    expect(root.querySelector('.slx-info')).toBeNull();
  });

  it('the whole flow works by click, worn gear included', () => {
    const { game, rows, root, line, confirmEl } = open([], (g) => { g.state.party.roster[g.state.party.recruited[0]].equip = { weapon: sword({ uid: 9 }) }; });
    expect(rows()[0].textContent).toContain(T.ui2.forge.wornBy(CHAR_NAME(game.state.party.recruited[0])));
    rows()[0].click();                      // item
    rows()[1].click();                      // atk
    rows()[0].click();                      // 重抽數值
    expect(confirmEl()).not.toBeNull();
    (confirmEl()!.querySelector('[data-id=yes]') as HTMLElement).click();
    const equipped = game.state.party.roster[game.state.party.recruited[0]].equip.weapon!;
    expect(equipped.locked).toBe(1);
    expect(line()).toContain(' → ');
    expect(root.querySelectorAll('[style]').length).toBe(0);
  });
});

describe('ForgeScene fuse page', () => {
  const F = T.ui2.forge;
  type Act = 'up' | 'down' | 'confirm' | 'cancel';
  function open(bag: ItemInstance[], prep: (g: Game) => void = () => {}, storage = memoryStorage()) {
    const game = new Game(constRng(0.5), storage);
    game.state.bag = bag;
    game.state.gold = 1000;
    prep(game);
    const t = setup(game);
    const loot = vi.fn();
    (t.sfx as Record<string, unknown>).loot = loot;
    t.s.onAction('confirm');                // greeting
    for (let i = 0; i < 3; i++) t.s.onAction('down');
    t.s.onAction('confirm');                // 合成
    const go = (...a: Act[]) => a.forEach((x) => t.s.onAction(x));
    const top = () => [...t.root.querySelectorAll('.slx-forge-list')].at(-1) as HTMLElement;
    const rows = () => [...top().querySelectorAll('[role=option]')] as HTMLElement[];
    const ids = () => rows().map((r) => r.getAttribute('data-id'));
    const row = (id: string) => rows().find((r) => r.getAttribute('data-id') === id)!;
    const confirmEl = () => t.root.querySelector('.slx-confirm') as HTMLElement | null;
    /** The first tier, then the first three items, then the 合成 row: the slot list is open after this. */
    const pickThree = () => go('confirm', 'confirm', 'down', 'confirm', 'down', 'confirm', 'up', 'up', 'up', 'confirm');
    return { ...t, game, go, rows, ids, row, confirmEl, loot, pickThree };
  }
  const three = (rarity: Rarity, ilvl = [3, 3, 3]): ItemInstance[] => ilvl.map((l, i) => gear(i + 1, 'iron-sword', rarity, { ilvl: l }));

  it('a tier with fewer than three items is disabled', () => {
    const { ids, row } = open([gear(1, 'iron-sword', 'common'), gear(2, 'iron-sword', 'common'), ...[3, 4, 5].map((u) => gear(u, 'hunter-bow', 'magic'))]);
    expect(ids()).toEqual(['common', 'magic', 'rare']);
    expect(row('common').textContent).toContain(F.fuseTier('common', 'magic'));
    expect(row('common').querySelector('.slx-right')!.textContent).toBe('2');
    expect(row('common').getAttribute('aria-disabled')).toBe('true');
    expect(row('magic').getAttribute('aria-disabled')).toBe('false');
    expect(row('magic').querySelector('.slx-right')!.textContent).toBe('3');
    expect(row('rare').getAttribute('aria-disabled')).toBe('true');
    expect(row('magic').getAttribute('aria-selected')).toBe('true');   // the cursor starts on the first live row
  });

  it('picking toggles; a fourth pick is refused; 合成 enables at three', () => {
    const bag = [1, 2, 3, 4].map((u) => gear(u, 'iron-sword', 'magic'));
    const { go, ids, row, sfx, game } = open(bag);
    go('confirm');                          // the magic tier
    expect(ids()).toEqual(['go', 'g1', 'g2', 'g3', 'g4']);
    expect(row('go').textContent).toContain(F.fuseGo(0));
    expect(row('go').getAttribute('aria-disabled')).toBe('true');
    expect(row('g1').getAttribute('aria-selected')).toBe('true');
    go('confirm');                          // pick g1
    expect(row('g1').textContent).toContain(F.picked);
    expect(row('go').textContent).toContain(F.fuseGo(1));
    go('confirm');                          // toggle off
    expect(row('g1').textContent).not.toContain(F.picked);
    go('confirm', 'down', 'confirm', 'down', 'confirm');   // g1 g2 g3
    expect(row('go').textContent).toContain(F.fuseGo(3));
    expect(row('go').getAttribute('aria-disabled')).toBe('false');
    // A fourth: the error sound, and nothing selected.
    sfx.error.mockClear();
    row('g4').click();
    expect(sfx.error).toHaveBeenCalledTimes(1);
    expect(row('g4').textContent).not.toContain(F.picked);
    expect(row('go').textContent).toContain(F.fuseGo(3));
    // Un-picking by click works too, and 合成 goes back to disabled.
    row('g3').click();
    expect(row('go').getAttribute('aria-disabled')).toBe('true');
    expect(game.state.bag.length).toBe(4);   // nothing was spent
  });

  it('cancel steps back one layer; a fresh tier pick starts clean', () => {
    const { go, ids, row } = open(three('common'));
    go('confirm', 'confirm', 'down', 'confirm', 'cancel');
    expect(ids()).toEqual(['common', 'magic', 'rare']);
    go('confirm');
    expect(row('g1').textContent).not.toContain(F.picked);
    expect(row('go').textContent).toContain(F.fuseGo(0));
  });

  it('legendary fusion offers no body slot; a chosen slot shows its extra cost', () => {
    const { ids, row, root, confirmEl, game, sfx, line } = open(three('rare', [5, 6, 7]), (g) => { g.state.inventory = { 'king-scale': 0 }; });
    // The rare tier is the third row.
    (root.querySelector('[data-id=rare]') as HTMLElement).click();
    expect(ids()).toEqual(['go', 'g1', 'g2', 'g3']);
    for (const id of ['g1', 'g2', 'g3', 'go']) row(id).click();
    expect(ids()[0]).toBe('random');
    expect(row('random').textContent).toContain(F.randomSlot);
    expect(ids()).not.toContain('body');
    expect(ids()).toContain('weapon');
    expect(row('weapon').textContent).toContain('王者之鱗 0／1');
    expect(row('weapon').querySelector('.slx-right')!.textContent).toContain('200 G');
    expect(row('random').querySelector('.slx-right')!.textContent).toBe('200 G');
    expect(root.querySelectorAll('[style]').length).toBe(0);
    // Short of the scale: refused with the reason named, nothing asked.
    sfx.error.mockClear();
    row('weapon').click();
    expect(confirmEl()).toBeNull();
    expect(sfx.error).toHaveBeenCalled();
    expect(line()).toBe(F.lackNames(['王者之鱗 ×1']));
    expect(game.state.bag.length).toBe(3);
  });

  it('a magic fusion does offer body, with its essence cost in have／need', () => {
    const { ids, row, pickThree } = open(three('common'), (g) => { g.state.inventory = { 'essence-common': 5 }; });
    pickThree();
    expect(ids()).toContain('body');
    expect(row('body').textContent).toContain('普通精華 5／2');
  });

  it('the confirm names the tier in its colour, the floored level, the random item and the region note; 否 first', () => {
    const { go, confirmEl, game, pickThree } = open(three('common', [3, 4, 4]));
    pickThree();
    go('confirm');                          // 隨機欄位
    const c = confirmEl()!;
    expect(c.querySelector('.slx-rarity-magic')!.textContent).toBe('魔法');
    expect(c.textContent).toContain(F.fuseIlvl(3));        // floor((3+4+4)/3)
    expect(c.textContent).toContain(F.fuseRandom);
    expect(c.textContent).not.toContain(F.fuseRandomIn('武器'));
    expect(c.textContent).toContain(F.fuseRegionNote);
    expect(c.textContent).toContain('30 G');
    expect(c.querySelector('[aria-selected=true]')!.getAttribute('data-id')).toBe('no');
    go('confirm');                          // 否
    expect(confirmEl()).toBeNull();
    expect(game.state.bag.length).toBe(3);
  });

  it('a rare-or-better input also defaults to 否', () => {
    const { go, confirmEl, root } = open(three('rare'));
    (root.querySelector('[data-id=rare]') as HTMLElement).click();
    go('confirm', 'down', 'confirm', 'down', 'confirm', 'up', 'up', 'up', 'confirm', 'confirm');
    expect(confirmEl()!.querySelector('.slx-rarity-legendary')!.textContent).toBe('傳說');
    expect(confirmEl()!.querySelector('[aria-selected=true]')!.getAttribute('data-id')).toBe('no');
  });

  it('a chosen slot is named in the confirm', () => {
    const { confirmEl, row, pickThree } = open(three('common'), (g) => { g.state.inventory = { 'essence-common': 5 }; });
    pickThree();
    row('feet').click();
    expect(confirmEl()!.textContent).toContain(F.fuseRandomIn('腳部'));
    expect(confirmEl()!.textContent).toContain('普通精華 5／2');
  });

  it('yes fuses, names the new item in its rarity colour and plays loot', () => {
    const storage = memoryStorage();
    const setItem = vi.spyOn(storage, 'setItem');
    const { go, game, root, line, loot, pickThree, confirmEl } = open(three('common'), (g) => { g.state.gold = 100; }, storage);
    pickThree();
    go('confirm');                          // 隨機欄位
    go('up');                               // 否 -> 是
    expect(confirmEl()!.querySelector('[aria-selected=true]')!.getAttribute('data-id')).toBe('yes');
    go('confirm');
    expect(game.state.bag.length).toBe(1);
    expect(game.state.bag[0].rarity).toBe('magic');
    expect(game.state.bag[0].ilvl).toBe(3);
    expect(game.state.gold).toBe(70);
    expect(setItem).toHaveBeenCalled();
    expect(loot).toHaveBeenCalledWith('magic');
    expect(line()).toBe(F.fused(gearLabel(game.state.bag[0])));
    expect(root.querySelector('.slx-talk .slx-text .slx-rarity-magic')!.textContent).toContain('魔法');
    expect(confirmEl()).toBeNull();
    expect(root.querySelector('.slx-forge-list')).toBeNull();   // the layers are gone
  });

  it('too little gold is refused with the reason, and nothing is spent', () => {
    const { go, game, confirmEl, pickThree, line } = open(three('common'), (g) => { g.state.gold = 5; });
    pickThree();
    go('confirm');
    expect(confirmEl()).toBeNull();
    expect(line()).toBe(F.lackNames(['金錢 25 G']));
    expect(game.state.bag.length).toBe(3);
    expect(game.state.gold).toBe(5);
  });
});

describe('ForgeScene craft page', () => {
  const F = T.ui2.forge;
  type Act = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel';
  function open(prep: (g: Game) => void = () => {}, storage = memoryStorage()) {
    const game = new Game(constRng(0.5), storage);
    game.state.gold = 1000;
    game.state.inventory = {};
    prep(game);
    const t = setup(game);
    const loot = vi.fn();
    (t.sfx as Record<string, unknown>).loot = loot;
    t.s.onAction('confirm');                // greeting
    for (let i = 0; i < 4; i++) t.s.onAction('down');
    t.s.onAction('confirm');                // 製作
    const go = (...a: Act[]) => a.forEach((x) => t.s.onAction(x));
    const top = () => [...t.root.querySelectorAll('.slx-forge-list')].at(-1) as HTMLElement;
    const rows = () => [...top().querySelectorAll('[role=option]')] as HTMLElement[];
    const ids = () => rows().map((r) => r.getAttribute('data-id'));
    const row = (id: string) => rows().find((r) => r.getAttribute('data-id') === id)!;
    const right = (id: string) => row(id).querySelector('.slx-right') as HTMLElement;
    const confirmEl = () => t.root.querySelector('.slx-confirm') as HTMLElement | null;
    const qty = () => t.root.querySelector('.slx-qty .slx-qty-n')?.textContent ?? null;
    const info = () => t.root.querySelector('.slx-info') as HTMLElement;
    return { ...t, game, go, rows, ids, row, right, confirmEl, qty, info, loot };
  }
  const full = (n: number): ItemInstance[] => Array.from({ length: n }, (_, i) => gear(i + 1, 'iron-sword', 'common'));

  it('three categories; a potion recipe crafts the chosen quantity', () => {
    const { ids, row, right, go, qty, game, line, sfx, info } = open((g) => { g.state.inventory = { moss: 10 }; g.state.gold = 100; });
    expect(ids()).toEqual(['item', 'base', 'set']);
    expect(row('item').textContent).toContain(F.craftCats.item);
    row('item').click();
    expect(ids()).toEqual(['potion', 'antidote', 'ether', 'return-lamp', 'phoenix']);
    // The shop price sits next to the craft cost, so the saving is visible.
    expect(right('potion').textContent).toBe(F.craftRow(20, '6 G'));
    expect(info().textContent).toContain('發光苔 10／2');
    expect(right('potion').classList.contains('slx-lack')).toBe(false);
    go('confirm');
    expect(qty()).toBe('× 1');
    go('right', 'right', 'confirm');
    expect(game.state.inventory.potion).toBe(3);
    expect(game.state.inventory.moss).toBe(4);
    expect(game.state.gold).toBe(82);
    expect(sfx.confirm).toHaveBeenCalled();
    expect(line()).toBe(F.craftedItem('回復藥', 3));
    expect(qty()).toBeNull();
    expect(info().textContent).toContain('發光苔 4／2');   // the detail refreshed
  });

  it('the quantity box stops at what the materials and gold allow', () => {
    const a = open((g) => { g.state.inventory = { moss: 5 }; });
    a.row('item').click(); a.go('confirm', 'up');
    expect(a.qty()).toBe('× 2');                       // 5 moss at 2 each
    const b = open((g) => { g.state.inventory = { moss: 100 }; g.state.gold = 13; });
    b.row('item').click(); b.go('confirm', 'up');
    expect(b.qty()).toBe('× 2');                       // 13 G at 6 each
    const c = open((g) => { g.state.inventory = { moss: 1000 }; g.state.gold = 100000; });
    c.row('item').click(); c.go('confirm');
    for (let i = 0; i < 12; i++) c.go('up');
    expect(c.qty()).toBe('× 99');                      // the stack cap, as in the shop
    c.go('cancel');
    expect(c.qty()).toBeNull();
    expect(c.game.state.inventory.potion).toBeUndefined();
  });

  it('a recipe nothing can pay for opens no quantity box and says what is short', () => {
    const { row, go, qty, line, sfx } = open((g) => { g.state.inventory = { moss: 1 }; });
    row('item').click();
    sfx.error.mockClear();
    go('confirm');
    expect(qty()).toBeNull();
    expect(sfx.error).toHaveBeenCalled();
    expect(line()).toBe(F.craftLack(T.reasons.mats, ['發光苔 ×1']));
  });

  it('a base recipe shows craftLevel, the magic chance and its cost', () => {
    const { row, ids, go, info, game } = open((g) => { g.state.inventory = { 'thorn-fang': 3, 'star-stone': 1 }; });
    row('base').click();
    expect(ids()).toEqual(['weapon', 'offhand', 'head', 'body', 'hands', 'feet', 'neck', 'ring']);
    expect(row('weapon').textContent).toContain('武器');
    expect(info().textContent).toContain(F.craftLevel(craftLevel(game.state)));
    expect(info().textContent).toContain(F.magicChance(25));
    expect(info().textContent).toContain('25%');
    expect(info().textContent).toContain('荊棘牙 3／3');
    expect(info().textContent).toContain(`${baseCost(game.state, 'weapon').gold} G`);
    go('down');
    expect(info().textContent).toContain('晶殼碎片 0／3');
    expect(info().querySelector('.slx-lack')).not.toBeNull();
  });

  it('a base asks first (否 under the cursor), then crafts, names it with its rarity and plays loot', () => {
    const storage = memoryStorage();
    const setItem = vi.spyOn(storage, 'setItem');
    const { row, go, confirmEl, game, line, loot, root } = open((g) => { g.state.inventory = { 'thorn-fang': 3, 'star-stone': 1 }; }, storage);
    row('base').click();
    go('confirm');
    const c = confirmEl()!;
    expect(c.textContent).toContain(F.craftLevel(craftLevel(game.state)));
    expect(c.textContent).toContain(F.magicChance(25));
    expect(c.querySelector('[aria-selected=true]')!.getAttribute('data-id')).toBe('no');
    go('confirm');                                      // 否
    expect(game.state.bag.length).toBe(0);
    expect(game.state.inventory['thorn-fang']).toBe(3);
    go('confirm', 'up', 'confirm');                     // 是
    expect(game.state.bag.length).toBe(1);
    const made = game.state.bag[0];
    expect(made.ilvl).toBe(craftLevel(game.state));
    expect(game.state.inventory['thorn-fang']).toBeUndefined();
    expect(setItem).toHaveBeenCalled();
    expect(loot).toHaveBeenCalledWith(made.rarity);
    expect(line()).toBe(F.crafted(gearLabel(made)));
    expect(root.querySelector(`.slx-talk .slx-text .slx-rarity-${made.rarity}`)).not.toBeNull();
    expect(row('weapon').querySelector('.slx-right')!.classList.contains('slx-lack')).toBe(true);   // the list refreshed
  });

  it('a base refuses when the bag is full, spending nothing', () => {
    const { row, go, confirmEl, game, line, sfx } = open((g) => { g.state.inventory = { 'thorn-fang': 3, 'star-stone': 1 }; g.state.bag = full(BAG_SIZE); });
    row('base').click();
    sfx.error.mockClear();
    go('confirm');
    expect(confirmEl()).toBeNull();
    expect(sfx.error).toHaveBeenCalled();
    expect(line()).toBe(T.reasons.full);
    expect(game.state.inventory['thorn-fang']).toBe(3);
  });

  it('a set piece crafts after a yes and is named in green', () => {
    const { row, ids, go, confirmEl, game, line, loot, root, info } = open((g) => { g.state.inventory = { 'blaze-core': 8, 'star-tear': 1 }; });
    row('set').click();
    expect(ids()).toEqual(['set-blaze', 'set-frost', 'set-storm', 'set-mire', 'set-shade', 'set-iron']);
    expect(row('set-blaze').textContent).toContain('焰紋套裝');
    go('confirm');
    expect(ids()).toEqual(['set-blaze-weapon', 'set-blaze-body', 'set-blaze-hands', 'set-blaze-ring']);
    expect(row('set-blaze-weapon').querySelector('.slx-label')!.classList.contains('slx-rarity-set')).toBe(true);
    expect(row('set-blaze-weapon').textContent).toContain('焰紋之刃');
    const text = info().textContent!;
    for (const l of specialLines('set-blaze-weapon')) expect(text).toContain(l.text);
    expect(text).toContain('火焰核 8／8');
    expect(text).toContain('星燈之淚 1／1');
    const setGold = setCost(game.state, 'set-blaze-weapon')!.gold;
    expect(text).toContain(`${setGold} G`);
    go('confirm');
    expect(confirmEl()!.querySelector('[aria-selected=true]')!.getAttribute('data-id')).toBe('no');
    go('confirm');                                      // 否
    expect(game.state.bag.length).toBe(0);
    go('confirm', 'up', 'confirm');                     // 是
    expect(game.state.bag.length).toBe(1);
    expect(game.state.bag[0]).toMatchObject({ rarity: 'set', special: 'set-blaze-weapon' });
    expect(game.state.codex).toContain('set-blaze-weapon');
    expect(game.state.inventory['star-tear']).toBeUndefined();
    expect(game.state.gold).toBe(1000 - setGold);
    expect(loot).toHaveBeenCalledWith('set');
    expect(line()).toBe(F.crafted(gearLabel(game.state.bag[0])));
    expect(root.querySelector('.slx-talk .slx-text .slx-rarity-set')).not.toBeNull();
    go('confirm', 'cancel');                            // the line, then back to the sets
    expect(ids()).toContain('set-blaze');
  });

  it('a lacking recipe stays readable, its right column says 不足 with slx-lack, and Enter refuses with 素材不足', () => {
    const { row, right, go, confirmEl, line, sfx, info, game } = open((g) => { g.state.inventory = { 'blaze-core': 3 }; });
    row('set').click(); go('confirm');
    expect(row('set-blaze-weapon').getAttribute('aria-disabled')).toBe('false');
    expect(right('set-blaze-weapon').textContent).toContain('不足');
    expect(right('set-blaze-weapon').classList.contains('slx-lack')).toBe(true);
    expect(info().textContent).toContain('火焰核 3／8');
    sfx.error.mockClear();
    go('confirm');
    expect(confirmEl()).toBeNull();
    expect(sfx.error).toHaveBeenCalled();
    expect(line()).toContain(T.reasons.mats);
    expect(line()).toContain('火焰核 ×5');
    expect(game.state.gold).toBe(1000);
  });

  it('Esc steps back layer by layer and leaves no stray window, with no inline styles', () => {
    const { row, go, root, ids } = open();
    row('item').click();
    go('cancel');
    expect(ids()).toEqual(['item', 'base', 'set']);
    expect(root.querySelector('.slx-info')).toBeNull();
    row('set').click(); go('confirm', 'cancel', 'cancel');
    expect(ids()).toEqual(['item', 'base', 'set']);
    expect(root.querySelector('.slx-info')).toBeNull();
    go('cancel');
    expect(root.querySelectorAll('.slx-forge-list').length).toBe(0);
    expect(root.querySelectorAll('[style]').length).toBe(0);
  });
});
