import { describe, expect, it, vi } from 'vitest';
import { POWERS } from '../../data/gear';
import { T } from '../../data/text.zh-TW';
import { Game } from '../../engine/game';
import { itemWeight } from '../../engine/loot/item';
import { constRng, plainItem } from '../../engine/testing';
import type { ItemInstance, Rarity } from '../../engine/types';
import { NO_ART } from '../../render/textures';
import { EquipScene } from './equip';
import { LEGACY_LINEUP } from '../../engine/party';

const gear = (base: string, uid: number, rarity: Rarity = 'common', extra: Partial<ItemInstance> = {}): ItemInstance =>
  ({ ...plainItem(base, uid), rarity, ...extra });

/** `prep` runs on the fresh game before the scene opens (bag, worn gear). */
function setup(prep?: (g: Game) => void, arg = 'scarlet') {
  const game = new Game(constRng(0.5), null, undefined, 0, LEGACY_LINEUP);
  game.state.bag = [plainItem('iron-sword', 1)];
  game.state.nextUid = 100;
  prep?.(game);
  const go = vi.fn();
  const sfx = { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() };
  const root = document.createElement('div');
  const s = new EquipScene({ game, art: NO_ART, sfx, go, hasSave: () => false, newGame: vi.fn(), from: 'guild', arg });
  s.enter(root);
  const slot = (k: string) => root.querySelector<HTMLElement>(`.slx-doll-slot[data-slot=${k}]`)!;
  const cell = (i: number) => root.querySelector<HTMLElement>(`.slx-bag-cell[data-index="${i}"]`)!;
  /** "doll:weapon" or "bag:12": the focused area and its cursor. */
  const at = () => {
    const f = root.querySelector<HTMLElement>('.slx-equip-scene')!.dataset.focus!;
    const c = root.querySelector<HTMLElement>(`.slx-${f} .slx-cur`)!;
    return `${f}:${c.dataset.slot ?? c.dataset.index}`;
  };
  const press = (...as: Parameters<EquipScene['onAction']>[0][]) => as.forEach((a) => s.onAction(a));
  const detail = () => root.querySelector<HTMLElement>('.slx-item-detail')!;
  const worn = () => game.state.party.roster.scarlet.equip;
  return { game, go, root, s, sfx, slot, cell, at, press, detail, worn };
}

describe('EquipScene', () => {
  it('a filled slot still names its slot above the gear', () => {
    const { slot } = setup((g) => { g.state.party.roster.scarlet.equip.head = plainItem('leather-cap', 9); });
    expect(slot('head').querySelector('.slx-slot-tag')!.textContent).toBe('頭部');
    expect(slot('head').querySelector('.slx-slot-name')!.textContent).toBe('皮帽');
    expect(slot('neck').querySelector('.slx-slot-tag')).toBeNull();     // empty: the slot's name alone
  });

  it('nine slots in the figure order and sixty bag cells', () => {
    const { root, slot, cell } = setup((g) => {
      g.state.bag = [plainItem('iron-sword', 1), gear('cloth-gloves', 2, 'legendary', { special: 'lg-bobby' })];
    });
    const order = [...root.querySelectorAll<HTMLElement>('.slx-doll .slx-doll-slot')].map((e) => e.dataset.slot);
    expect(order).toEqual(['neck', 'head', 'offhand', 'weapon', 'body', 'hands', 'ring1', 'feet', 'ring2']);
    expect(root.querySelectorAll('.slx-bag .slx-bag-cell')).toHaveLength(60);
    expect(slot('weapon').textContent).toBe('武器');                 // empty: the slot's name
    expect(slot('ring2').textContent).toBe('戒指 2');
    expect(cell(0).textContent).toBe('鐵劍');
    expect(cell(0).classList.contains('slx-rarity-common')).toBe(true);
    expect(cell(1).textContent).toBe('長效齒輪');                       // 長效齒輪手套: the first four characters
    expect(cell(1).classList.contains('slx-rarity-legendary')).toBe(true);
    expect(cell(1).getAttribute('aria-label')).toBe('長效齒輪手套・傳說');   // the whole name and its rarity word
    expect(cell(2).textContent).toBe('');
    // left to right: bag, figure, detail
    const wins = [...root.querySelectorAll('.slx-equip-scene > .slx-win')].map((e) => e.classList[1]);
    expect(wins.indexOf('slx-bag')).toBeLessThan(wins.indexOf('slx-doll'));
    expect(wins.indexOf('slx-doll')).toBeLessThan(wins.indexOf('slx-item-detail'));
  });

  it("arrows stay inside the figure; Left from its left column and Tab go to the bag; Right from the bag's right column comes back", () => {
    const { at, press } = setup();
    expect(at()).toBe('doll:weapon');
    press('up', 'up');
    expect(at()).toBe('doll:neck');                                    // stops at the top edge
    press('right', 'right', 'right');
    expect(at()).toBe('doll:offhand');                                 // stops at the right edge
    press('down', 'down', 'down');
    expect(at()).toBe('doll:ring2');
    press('left');
    expect(at()).toBe('doll:feet');
    press('left');
    expect(at()).toBe('doll:ring1');
    press('left');
    expect(at()).toBe('bag:29');                                       // same row (2), rightmost cell
    press('right');
    expect(at()).toBe('doll:ring1');                                   // back, same row, leftmost
    press('swap');
    expect(at()).toBe('bag:29');                                       // Tab keeps each area's place
    press('down', 'down', 'down', 'down');
    expect(at()).toBe('bag:59');                                       // stops at the bottom edge
    for (let i = 0; i < 12; i++) press('left');
    expect(at()).toBe('bag:50');                                       // stops at the left edge
    press('swap');
    expect(at()).toBe('doll:ring1');
    press('swap', 'up', 'up', 'up', 'up', 'up', 'up', 'up');
    expect(at()).toBe('bag:0');
    for (let i = 0; i < 9; i++) press('right');
    expect(at()).toBe('bag:9');
    press('right');
    expect(at()).toBe('doll:neck');                                    // row 0 → the figure's row 0
    press('swap');
    press('down', 'down', 'down', 'down', 'down', 'right');
    expect(at()).toBe('doll:ring1');                                   // bag rows below the figure land on its last row
  });

  it('Enter on a slot then a bag item equips into that slot, the old item returns to the bag', () => {
    const { at, press, cell, slot, worn, game, root } = setup((g) => {
      g.state.party.roster.scarlet.equip.weapon = plainItem('wooden-staff', 9);
      g.state.bag = [plainItem('leather-vest', 2), plainItem('iron-sword', 1)];
    });
    press('confirm');                                                  // weapon is the target
    expect(slot('weapon').classList.contains('slx-doll-target')).toBe(true);
    expect(at()).toBe('bag:0');
    expect(cell(0).classList.contains('slx-unfit')).toBe(true);        // a vest does not fit a weapon slot
    expect(cell(1).classList.contains('slx-unfit')).toBe(false);
    press('right', 'confirm');
    expect(worn().weapon?.base).toBe('iron-sword');
    expect(game.state.bag.map((it) => it.base)).toEqual(['leather-vest', 'wooden-staff']);   // in the cell the sword left
    expect(cell(1).textContent).toBe('木杖');
    expect(root.querySelector('.slx-doll-target')).toBeNull();               // target cleared
    expect(root.querySelector('.slx-unfit')).toBeNull();
  });

  it('a ring picked from the bag with no target goes to defaultSlotFor', () => {
    const { press, worn, game } = setup((g) => {
      g.state.party.roster.scarlet.equip.ring1 = plainItem('star-ring', 7);
      g.state.bag = [plainItem('copper-ring', 5), plainItem('copper-ring', 6)];
    });
    press('swap', 'confirm');                                          // no target: first empty ring slot
    expect(worn().ring2?.uid).toBe(5);
    expect(worn().ring1?.uid).toBe(7);
    press('swap', 'up', 'confirm', 'confirm');                         // target 頭部, then a ring that does not fit it
    expect(worn().head).toBeUndefined();
    expect(worn().ring1?.uid).toBe(6);                                 // both full: defaultSlotFor gives ring1
    expect(game.state.bag.map((it) => it.uid)).toEqual([7]);
  });

  it('the detail shows affixes and up/down comparison rows', () => {
    const saber = gear('star-saber', 3, 'rare', { affixes: [{ key: 'crit', value: 5 }], junk: true });
    const { press, detail } = setup((g) => {
      const eq = g.state.party.roster.scarlet.equip;
      eq.weapon = plainItem('iron-sword', 8);
      eq.ring1 = plainItem('star-ring', 10);
      eq.ring2 = plainItem('star-ring', 11);
      g.state.bag = [saber, plainItem('copper-ring', 4)];
    });
    press('swap');
    const d = detail();
    expect(d.querySelector('.slx-item-name')!.textContent).toBe('星紋軍刀・稀有');
    expect(d.querySelector('.slx-item-name')!.classList.contains('slx-rarity-rare')).toBe(true);
    expect(d.textContent).toContain('武器');
    expect(d.textContent).toContain(T.gear.ilvl(10));
    expect(d.textContent).toContain(T.gear.weight(itemWeight(saber)));
    expect(d.textContent).toContain(T.gear.junk);
    expect(d.textContent).toContain('基礎 攻擊 +15');                   // implicit line
    expect(d.textContent).toContain('暴擊率 +5%');                      // affix line
    expect(d.textContent).toContain('鐵劍');                            // compared against what is worn
    const up = d.querySelector('.slx-cmp-row.slx-up[data-stat=atk]')!;
    expect(up.textContent).toContain('+11');
    expect(d.querySelector('.slx-cmp-row.slx-up[data-stat=crit]')).not.toBeNull();
    press('right');                                                    // the copper ring against a star ring
    const rows = detail().querySelectorAll('.slx-cmp-row');
    expect([...rows].map((r) => r.getAttribute('data-stat')).sort()).toEqual(['atk', 'hp', 'mag']);
    expect(detail().querySelector('.slx-cmp-row.slx-down[data-stat=atk]')!.textContent).toContain('−4');   // the minus sign
    expect(detail().textContent).not.toMatch(/-\d/);
    expect(detail().querySelector('.slx-cmp-row.slx-up[data-stat=hp]')!.textContent).toContain('+8');
    expect(detail().textContent).not.toContain(T.gear.junk);
  });

  it('the bag menu sorts and sets auto junk; marked items are greyed', () => {
    const { press, root, game, cell } = setup((g) => {
      g.state.bag = [plainItem('leather-vest', 1), gear('iron-sword', 2, 'rare'), gear('copper-ring', 3, 'magic')];
    });
    const menu = () => root.querySelector<HTMLElement>('.slx-bag-menu');
    expect(menu()).toBeNull();
    press('menu');
    expect([...menu()!.querySelectorAll('[role=option]')].map((o) => o.getAttribute('data-id')))
      .toEqual(['sort-rarity', 'sort-slot', 'sort-ilvl', 'auto-off', 'auto-common', 'auto-magic', 'junk']);
    press('confirm');                                                  // 依稀有度
    expect(menu()).toBeNull();
    expect(game.state.bag.map((it) => it.uid)).toEqual([2, 3, 1]);
    press('menu');
    (menu()!.querySelector('[data-id=auto-magic]') as HTMLElement).click();
    expect(game.state.autoJunk).toBe('magic');
    press('menu');
    expect(menu()!.querySelector('[data-id=auto-magic] .slx-right')!.textContent).toBe(T.ui2.equip.menu.current);
    press('cancel');                                                   // closes the menu only
    expect(menu()).toBeNull();
    press('swap', 'right', 'menu');                                    // bag cell 1: the magic ring
    expect(menu()!.querySelector('[data-id=junk]')!.textContent).toContain('銅戒・魔法');
    (menu()!.querySelector('[data-id=junk]') as HTMLElement).click();
    expect(game.state.bag[1].junk).toBe(true);
    expect(cell(1).classList.contains('slx-junk')).toBe(true);
    expect(cell(0).classList.contains('slx-junk')).toBe(false);
    press('menu');
    expect(menu()!.querySelector('[data-id=junk]')!.textContent).toContain(T.ui2.equip.menu.unmark('銅戒・魔法'));
    press('cancel', 'right', 'right', 'menu');                         // an empty cell: nothing to mark
    expect(menu()!.querySelector('[data-id=junk]')!.getAttribute('aria-disabled')).toBe('true');
  });

  it('the bag menu opens by mouse too', () => {
    const { root } = setup();
    (root.querySelector('.slx-bag-menu-btn') as HTMLElement).click();
    expect(root.querySelector('.slx-bag-menu')).not.toBeNull();
    expect(root.querySelector('.slx-bag')!.hasAttribute('inert')).toBe(true);   // the grid waits under the menu
  });

  it('Enter on an empty cell with a target takes the worn item off into the bag', () => {
    const { press, worn, game } = setup((g) => { g.state.party.roster.scarlet.equip.weapon = plainItem('wooden-staff', 9); });
    press('confirm', 'right', 'confirm');                              // target weapon, empty cell 1
    expect(worn().weapon).toBeUndefined();
    expect(game.state.bag.map((it) => it.uid)).toEqual([1, 9]);
  });

  it('no element carries a style attribute', () => {
    const { root, press } = setup((g) => { g.state.bag = [gear('star-saber', 3, 'rare', { affixes: [{ key: 'crit', value: 5 }] })]; });
    press('confirm', 'menu');
    expect(root.querySelectorAll('[style]')).toHaveLength(0);
  });

  it('pages through members with Q/E; Esc clears the target before leaving', () => {
    const { press, root, go } = setup();
    press('next');
    expect(root.querySelector('.slx-equip-name')!.textContent).toContain('千鶴');
    press('confirm');
    expect(root.querySelector('.slx-doll-target')).not.toBeNull();
    press('cancel');                                                   // clears the target only
    expect(root.querySelector('.slx-doll-target')).toBeNull();
    expect(go).not.toHaveBeenCalled();
    press('cancel');
    expect(go).toHaveBeenCalledWith('guild');
  });

  it('works with the mouse: click a slot, then an item; hovering moves the cursor', () => {
    const { slot, cell, worn, at, detail } = setup((g) => { g.state.bag = [plainItem('iron-sword', 1), plainItem('copper-ring', 5)]; });
    cell(1).dispatchEvent(new Event('pointermove'));
    expect(at()).toBe('bag:1');
    expect(detail().textContent).toContain('銅戒');
    slot('weapon').click();
    cell(0).click();
    expect(worn().weapon?.base).toBe('iron-sword');
    slot('ring2').click();                                             // a ring goes to the chosen ring slot
    cell(0).click();
    expect(worn().ring2?.base).toBe('copper-ring');
    expect(worn().ring1).toBeUndefined();
  });

  it('a touch tap with no hover still moves the view, even when the tap is refused', () => {
    const { cell, at, sfx, root } = setup();
    cell(5).click();                                                   // empty cell, no target: refused
    expect(sfx.error).toHaveBeenCalled();
    expect(at()).toBe('bag:5');
    expect(root.querySelectorAll('.slx-bag .slx-cur')).toHaveLength(1);
    expect(cell(5).classList.contains('slx-cur')).toBe(true);
    expect(root.querySelector('.slx-equip-scene')!.getAttribute('data-focus')).toBe('bag');
  });

  it('from the figure the menu acts on the worn piece the detail shows: take it off, but no junk mark', () => {
    const { press, root, worn, game } = setup((g) => {
      g.state.party.roster.scarlet.equip.weapon = plainItem('wooden-staff', 9);
      g.state.bag = [gear('star-saber', 3, 'rare')];
    });
    press('menu');
    const menu = root.querySelector('.slx-bag-menu')!;
    expect(menu.querySelector('[data-id=junk]')!.textContent).toContain('木杖');
    expect(menu.querySelector('[data-id=junk]')!.textContent).not.toContain('星紋軍刀');
    expect(menu.querySelector('[data-id=junk]')!.getAttribute('aria-disabled')).toBe('true');
    (menu.querySelector('[data-id=unequip]') as HTMLElement).click();
    expect(worn().weapon).toBeUndefined();
    expect(game.state.bag.map((it) => it.uid)).toEqual([3, 9]);
  });

  it('the flash lands on the newly filled slot, not on the next bag item', () => {
    const { press, slot, cell } = setup((g) => { g.state.bag = [plainItem('iron-sword', 1), plainItem('leather-vest', 2)]; });
    press('swap', 'confirm');                                          // sword into the empty weapon slot; the vest moves to cell 0
    expect(slot('weapon').classList.contains('slx-flash')).toBe(true);
    expect(cell(0).classList.contains('slx-flash')).toBe(false);
  });

  it('a swap flashes the slot and the cell the old piece came back to', () => {
    const { press, slot, cell } = setup((g) => { g.state.party.roster.scarlet.equip.weapon = plainItem('wooden-staff', 9); });
    press('swap', 'confirm');                                          // sword in, staff back into cell 0
    expect(slot('weapon').classList.contains('slx-flash')).toBe(true);
    expect(cell(0).classList.contains('slx-flash')).toBe(true);
  });

  it('Q/E in target mode clears the target and the dimming', () => {
    const { press, root } = setup((g) => { g.state.bag = [plainItem('leather-vest', 2), plainItem('iron-sword', 1)]; });
    press('confirm');
    expect(root.querySelector('.slx-unfit')).not.toBeNull();
    press('next');
    expect(root.querySelector('.slx-doll-target')).toBeNull();
    expect(root.querySelector('.slx-unfit')).toBeNull();
  });

  it('a target ring slot other than defaultSlotFor is the one compared and filled', () => {
    const { press, detail, worn } = setup((g) => {
      const eq = g.state.party.roster.scarlet.equip;
      eq.ring1 = plainItem('copper-ring', 7);
      eq.ring2 = gear('star-ring', 8, 'magic');
      g.state.bag = [gear('star-ring', 5, 'rare')];
    });
    press('down', 'right', 'right', 'confirm');                        // target 戒指 2 (defaultSlotFor would say 戒指 1)
    expect(detail().querySelector('.slx-cmp-head')!.textContent).toBe('比較：星紋戒');
    expect(detail().querySelector('.slx-cmp-head .slx-rarity-magic')!.textContent).toBe('星紋戒');   // the magic one in 戒指 2
    press('confirm');
    expect(worn().ring2?.uid).toBe(5);
    expect(worn().ring1?.uid).toBe(7);
  });

  it('a full bag refuses to take gear off, says why, and reads 60／60', () => {
    const { press, root, sfx, worn, cell } = setup((g) => {
      g.state.party.roster.scarlet.equip.weapon = plainItem('wooden-staff', 9);
      g.state.bag = Array.from({ length: 60 }, (_, i) => plainItem('leather-cap', 200 + i));
    });
    expect(root.querySelector('.slx-bag-count')!.textContent).toBe('背包 60／60');
    expect(cell(59).textContent).toBe('皮帽');
    press('menu');
    (root.querySelector('.slx-bag-menu [data-id=unequip]') as HTMLElement).click();
    expect(sfx.error).toHaveBeenCalled();
    expect(worn().weapon?.uid).toBe(9);
    expect(root.querySelector('.slx-equip-notice')!.textContent).toBe(T.ui2.equip.full);
    press('down');                                                     // the notice goes with the next action
    expect(root.querySelector('.slx-equip-notice')!.textContent).toBe('');
  });

  it('an empty bag: every cell empty, Enter refuses, nothing to mark', () => {
    const { press, root, sfx, game } = setup((g) => { g.state.bag = []; });
    expect(root.querySelector('.slx-bag-count')!.textContent).toBe('背包 0／60');
    expect([...root.querySelectorAll('.slx-bag-cell')].every((c) => c.textContent === '')).toBe(true);
    press('swap', 'confirm');
    expect(sfx.error).toHaveBeenCalled();
    expect(game.state.bag).toEqual([]);
    press('menu');
    expect(root.querySelector('.slx-bag-menu [data-id=junk]')!.getAttribute('aria-disabled')).toBe('true');
  });

  it("a power the viewed member cannot use is dimmed and says so; one in the member's kit is not", () => {
    const { press, detail } = setup((g) => {
      g.state.bag = [gear('cloth-gloves', 2, 'legendary', { special: 'lg-bobby' }), gear('leather-cap', 3, 'legendary', { special: 'lg-scarlet' })];
    });
    press('swap');                                                     // 長效齒輪手套 (turret) on 絲嘉蕾
    const off = detail().querySelector('.slx-line-power')!;
    expect(off.classList.contains('slx-line-off')).toBe(true);
    expect(off.textContent).toContain(T.gear.cannotUse);
    press('right');                                                    // scarlet's own provoke power
    const on = detail().querySelector('.slx-line-power')!;
    expect(on.classList.contains('slx-line-off')).toBe(false);
    expect(on.textContent).not.toContain(T.gear.cannotUse);
  });

  it('the portrait row is built once per member, not on every key or hover', () => {
    const { press, root } = setup();
    const arrow = root.querySelector('.slx-equip-head .slx-status-arrow')!;
    press('down', 'swap', 'right');
    expect(root.contains(arrow)).toBe(true);
    press('next');
    expect(root.contains(arrow)).toBe(false);
  });

  it('with a full bag the target hint points to the menu, since there is no empty cell to pick', () => {
    const { press, root } = setup((g) => {
      g.state.party.roster.scarlet.equip.weapon = plainItem('wooden-staff', 9);
      g.state.bag = Array.from({ length: 60 }, (_, i) => plainItem('leather-cap', 200 + i));
    });
    const hint = () => root.querySelector('.slx-keyhint')!.textContent;
    press('confirm');
    expect(hint()).toBe(T.ui2.equip.hintTargetFull);
    expect(hint()).not.toContain('選空格');
    press('menu');                                                     // the route the hint names: 卸下 the target's piece
    (root.querySelector('.slx-bag-menu [data-id=unequip]') as HTMLElement).click();
    expect(root.querySelector('.slx-equip-notice')!.textContent).toBe(T.ui2.equip.full);
    press('cancel');
    expect(hint()).toBe(T.ui2.equip.hint);
  });

  it('with room in the bag the target hint still says to pick an empty cell', () => {
    const { press, root } = setup();
    press('confirm');
    expect(root.querySelector('.slx-keyhint')!.textContent).toBe(T.ui2.equip.hintTarget);
  });

  it('only the power text is dimmed; the 此角色無法發動 note sits outside the dimmed part', () => {
    const { press, detail } = setup((g) => { g.state.bag = [gear('cloth-gloves', 2, 'legendary', { special: 'lg-bobby' })]; });
    press('swap');
    const line = detail().querySelector('.slx-line-off')!;
    expect(line.querySelector('.slx-line-dim')!.textContent).toBe(POWERS['lg-bobby'].text);
    expect(line.querySelector('.slx-line-dim .slx-line-note')).toBeNull();
    expect(line.querySelector(':scope > .slx-line-note')!.textContent).toBe(T.gear.cannotUse);
  });

  it('a power the wearer has not learned yet shows 尚未習得 and is not dimmed', () => {
    const { press, detail } = setup((g) => { g.state.bag = [gear('moss-charm', 2, 'legendary', { special: 'frost-bloom-neck' })]; }, 'noel');
    press('swap');                                                     // 霜華頸鍊 (ice-star) on a fresh 諾艾爾
    const line = detail().querySelector('.slx-line-power')!;
    expect(line.classList.contains('slx-line-off')).toBe(false);
    expect(line.querySelector('.slx-line-dim')).toBeNull();
    expect(line.querySelector('.slx-line-note')!.textContent).toBe(T.gear.notLearned);
    expect(line.textContent).not.toContain(T.gear.cannotUse);
  });
});

describe('EquipScene detail panel', () => {
  /** Opens the scene with the bag cursor on a piece that is compared against the worn weapon. */
  const onBag = (prep?: (g: Game) => void) => {
    const r = setup((g) => { g.state.party.roster.scarlet.equip.weapon = plainItem('iron-sword', 9); g.state.bag = [plainItem('star-saber', 1), plainItem('leather-cap', 2)]; prep?.(g); });
    r.press('swap');
    return r;
  };
  const cue = (r: ReturnType<typeof setup>, d: 'up' | 'down') => r.detail().querySelector<HTMLElement>(`.slx-more-${d}`)!;
  const body = (r: ReturnType<typeof setup>) => r.detail().querySelector<HTMLElement>('.slx-item-detail-body')!;

  it('a +3 item reads +3 in its bag cell, its doll slot and the detail', () => {
    const r = setup((g) => {
      g.state.bag = [gear('iron-sword', 1, 'rare', { enhance: 3, affixes: [{ key: 'atk', value: 3 }, { key: 'crit', value: 2 }], locked: 1 }), gear('iron-sword', 2, 'common')];
      g.state.party.roster.scarlet.equip = { weapon: gear('iron-sword', 9, 'common', { enhance: 2 }) };
    });
    const cellEl = r.root.querySelector<HTMLElement>('.slx-bag-cell[data-index="0"]')!;
    expect(cellEl.textContent).toBe('鐵劍+3');
    expect(cellEl.querySelector('.slx-enh')!.textContent).toBe('+3');
    expect(cellEl.getAttribute('aria-label')).toBe('鐵劍 +3・稀有');
    expect(r.root.querySelector('.slx-bag-cell[data-index="1"]')!.textContent).toBe('鐵劍');   // +0: no "+0"
    expect(r.root.querySelector('.slx-bag-cell[data-index="1"] .slx-enh')).toBeNull();
    const w = r.root.querySelector<HTMLElement>('.slx-doll-slot[data-slot=weapon]')!;
    expect(w.querySelector('.slx-enh')!.textContent).toBe('+2');
    expect(w.getAttribute('aria-label')).toContain('鐵劍 +2');
    r.press('swap');                                                    // onto the bag: the +3 sword is under the cursor
    const d = r.detail();
    expect(d.querySelector('.slx-item-name')!.textContent).toBe('鐵劍 +3・稀有');
    expect(d.querySelector('.slx-cmp-head')!.textContent).toBe(T.ui2.equip.versus('鐵劍 +2'));
    const locked = d.querySelectorAll('.slx-line-locked');
    expect(locked).toHaveLength(1);
    expect(locked[0].textContent).toBe(`${T.gear.affix('crit', 2)}${T.gear.lockedAffix}`);
  });

  it('the compare heading is short: the worn piece by name, or the slot marked empty', () => {
    const r = onBag();
    expect(r.detail().querySelector('.slx-cmp-head')!.textContent).toBe('比較：鐵劍');
    expect(r.detail().querySelector('.slx-cmp-head')!.textContent).toBe(T.ui2.equip.versus('鐵劍'));
    r.press('right');                                                   // the cap: nothing worn on the head
    expect(r.detail().querySelector('.slx-cmp-head')!.textContent).toBe('比較：頭部（空）');
  });

  it('a panel that fits shows no scroll cue and leaves the wheel alone', () => {
    const sh = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get');
    const ch = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get');
    try {
      sh.mockReturnValue(80); ch.mockReturnValue(100);
      const r = onBag();
      expect([cue(r, 'up').hidden, cue(r, 'down').hidden]).toEqual([true, true]);
      const e = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
      body(r).dispatchEvent(e);
      expect(e.defaultPrevented).toBe(false);
    } finally { sh.mockRestore(); ch.mockRestore(); }
  });

  it('a panel that overflows shows ▼, scrolls by wheel and by the clickable cues, and shows ▲ once scrolled', () => {
    const sh = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get');
    const ch = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get');
    try {
      sh.mockReturnValue(300); ch.mockReturnValue(100);
      const r = onBag();
      const b = body(r);
      expect([cue(r, 'up').hidden, cue(r, 'down').hidden]).toEqual([true, false]);
      expect(cue(r, 'down').textContent).toBe('▼');
      cue(r, 'down').click();
      expect(b.scrollTop).toBeGreaterThan(0);
      expect(cue(r, 'up').hidden).toBe(false);
      const wheel = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
      const before = b.scrollTop;
      b.dispatchEvent(wheel);
      expect(wheel.defaultPrevented).toBe(true);
      expect(b.scrollTop).toBeGreaterThan(before);
      for (let i = 0; i < 20; i++) cue(r, 'down').click();
      expect(b.scrollTop).toBe(200);                                    // held at the bottom
      expect(cue(r, 'down').hidden).toBe(true);
      const atEnd = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
      b.dispatchEvent(atEnd);
      expect(atEnd.defaultPrevented).toBe(false);                       // nothing more to scroll: the page may have it
      for (let i = 0; i < 20; i++) cue(r, 'up').click();
      expect(b.scrollTop).toBe(0);
      expect(cue(r, 'up').hidden).toBe(true);
    } finally { sh.mockRestore(); ch.mockRestore(); }
  });

  it('another piece starts at the top again', () => {
    const sh = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get');
    const ch = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get');
    try {
      sh.mockReturnValue(300); ch.mockReturnValue(100);
      const r = onBag();
      cue(r, 'down').click();
      cue(r, 'down').click();
      expect(body(r).scrollTop).toBeGreaterThan(0);                     // scrolled down first
      r.press('right');
      expect(body(r)).toBe(r.detail().querySelector('.slx-item-detail-body'));
      expect(body(r).scrollTop).toBe(0);
    } finally { sh.mockRestore(); ch.mockRestore(); }
  });

  it('the comparison sits right under the name and meta lines, before the lines, set and lore', () => {
    const r = onBag((g) => { g.state.bag = [gear('cloth-gloves', 2, 'legendary', { special: 'lg-bobby' })]; });
    const kids = [...r.detail().querySelector('.slx-item-detail-body')!.children].map((e) => e.classList[0]);
    expect(kids.slice(0, 3)).toEqual(['slx-item-name', 'slx-item-meta', 'slx-cmp']);
    expect(kids.indexOf('slx-cmp')).toBeLessThan(kids.indexOf('slx-item-lines'));
  });

  it('R and F scroll the detail panel by keyboard, and the key hint says so', () => {
    const sh = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get');
    const ch = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get');
    try {
      sh.mockReturnValue(300); ch.mockReturnValue(100);
      const r = onBag();
      const b = body(r);
      expect(r.root.querySelector('.slx-keyhint')!.textContent).toContain('R／F 捲動說明');
      r.press('scrollDown');
      expect(b.scrollTop).toBeGreaterThan(0);
      expect(r.at()).toBe('bag:0');                                     // the cursor stays where it was
      for (let i = 0; i < 20; i++) r.press('scrollDown');
      expect(b.scrollTop).toBe(200);
      r.press('scrollUp');
      expect(b.scrollTop).toBeLessThan(200);
      for (let i = 0; i < 20; i++) r.press('scrollUp');
      expect(b.scrollTop).toBe(0);
      expect(cue(r, 'up').hidden).toBe(true);
    } finally { sh.mockRestore(); ch.mockRestore(); }
  });

  it('hovering the doll does not take the panel while the bag has focus; it does once the doll has focus', () => {
    const r = onBag();
    const name = () => r.detail().querySelector('.slx-item-name')!.textContent;
    expect([r.at(), name()]).toEqual(['bag:0', '星紋軍刀']);
    r.slot('weapon').dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));   // passing over the doll on the way to the panel
    expect([r.at(), name()]).toEqual(['bag:0', '星紋軍刀']);
    r.cell(1).dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    expect(r.at()).toBe('bag:1');                                       // hovering inside the focused bag still moves
    r.press('swap');
    r.slot('weapon').dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    expect([r.at(), name()]).toEqual(['doll:weapon', '鐵劍']);
    r.slot('head').dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    expect(r.at()).toBe('doll:head');
  });
});

describe('EquipScene touch', () => {
  const tap = (node: HTMLElement, pointerType: string) => {
    node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType }));
    node.dispatchEvent(new PointerEvent('click', { bubbles: true, pointerType }));
  };
  const twoInBag = (g: Game) => { g.state.party.roster.scarlet.equip.weapon = plainItem('iron-sword', 9); g.state.bag = [plainItem('star-saber', 1), plainItem('hunter-bow', 2)]; };

  it('a first tap on bag gear selects it and shows the comparison; a second tap on the same piece wears it', () => {
    const { at, cell, detail, worn, game } = setup(twoInBag);
    tap(cell(1), 'touch');
    expect(at()).toBe('bag:1');
    expect(worn().weapon!.uid).toBe(9);                                 // nothing worn yet
    expect(detail().querySelector('.slx-cmp-head')!.textContent).toBe('比較：鐵劍');
    tap(cell(0), 'touch');                                              // another piece: selects that one instead
    expect(at()).toBe('bag:0');
    expect(worn().weapon!.uid).toBe(9);
    tap(cell(0), 'touch');
    expect(worn().weapon!.uid).toBe(1);
    expect(game.state.bag.map((it) => it.uid)).toContain(9);
  });

  it('a first tap on the piece the keyboard cursor already rests on still only selects it', () => {
    const { press, cell, worn } = setup(twoInBag);
    press('swap');                                                      // bag:0
    tap(cell(0), 'touch');
    expect(worn().weapon!.uid).toBe(9);
    tap(cell(0), 'touch');
    expect(worn().weapon!.uid).toBe(1);
  });

  it('a mouse click still wears at once', () => {
    const { cell, worn } = setup(twoInBag);
    tap(cell(0), 'mouse');
    expect(worn().weapon!.uid).toBe(1);
    cell(0).click();                                                    // a click with no pointer type: the mouse path
    expect(worn().weapon!.uid).toBe(9);                                 // swapped back
  });

describe('EquipScene, the hero leads', () => {
  it('the hero comes first: with no argument the equip screen opens on him', () => {
    const game = new Game(constRng(0.5), null, undefined, 0, ['rin', 'hero']);
    expect(game.state.party.grid.find((id) => id)).toBe('rin');   // Rin stands first on the field, yet the hero still leads
    const root = document.createElement('div');
    const sfx = { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() };
    const s = new EquipScene({ game, art: NO_ART, sfx, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), from: 'guild' });
    s.enter(root);
    expect(root.querySelector('.slx-equip-scene')!.textContent).toContain('洛恩');
  });
});
});
