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
      s.onAction('confirm');
      expect(line()).toBe(T.ui2.town.soon(tab));
      s.onAction('confirm');
      expect(talking()).toBe(false);
    });
    // Mouse and touch: a click on each tab.
    for (const tab of TABS) {
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
