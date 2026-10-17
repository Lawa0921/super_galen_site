import { describe, expect, it, vi } from 'vitest';
import { T } from '../../data/text.zh-TW';
import { Game } from '../../engine/game';
import type { ForgeResult } from '../../engine/forge/cost';
import { constRng, memoryStorage } from '../../engine/testing';
import type { ItemInstance, Rarity } from '../../engine/types';
import { NO_ART } from '../../render/textures';
import { ForgeScene, forgeRows, type ForgeHost } from './forge';

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
      if (i === 0) return;                  // 分解 opens its own page (covered below)
      s.onAction('confirm');
      expect(line()).toBe(T.ui2.town.soon(tab));
      s.onAction('confirm');
      expect(talking()).toBe(false);
    });
    // Mouse and touch: a click on each tab.
    for (const tab of TABS.slice(1)) {
      const opt = [...root.querySelectorAll('.slx-cmd [role=option]')].find((o) => o.textContent === tab) as HTMLElement;
      opt.click();
      expect(line()).toBe(T.ui2.town.soon(tab));
      s.onAction('confirm');
    }
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

  it('warns for enhanced gear, but not for a plain magic piece', () => {
    const a = open([gear(1, 'iron-sword', 'common', { enhance: 1 })]);
    a.s.onAction('confirm');
    expect(a.confirmEl()!.textContent).toContain(T.ui2.forge.warnPrecious);
    const b = open([gear(1, 'iron-sword', 'magic')]);
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
    s.onAction('confirm'); s.onAction('up'); s.onAction('confirm');
    expect(root.querySelector('.slx-forge-list')).toBeNull();
  });

  it('a save failure is reported honestly', async () => {
    const storage = memoryStorage();
    vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const { s, line } = open([gear(1, 'iron-sword', 'common'), gear(2, 'iron-sword', 'common')], storage);
    s.onAction('confirm'); s.onAction('up'); s.onAction('confirm');
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
    const { game, root, rows, confirmEl } = open([gear(1, 'iron-sword', 'common'), gear(2, 'iron-sword', 'common')]);
    (rows()[0] as HTMLElement).click();
    expect(confirmEl()).not.toBeNull();
    (confirmEl()!.querySelector('[data-id=yes]') as HTMLElement).click();
    expect(game.state.bag.map((i) => i.uid)).toEqual([2]);
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe(T.ui2.forge.dismantled('普通精華 ×1'));
  });

  it('cancel on the list goes back to the tabs', () => {
    const { s, root } = open([gear(1, 'iron-sword', 'common')]);
    s.onAction('cancel');
    expect(root.querySelector('.slx-forge-list')).toBeNull();
  });
});
