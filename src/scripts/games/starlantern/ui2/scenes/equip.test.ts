import { describe, expect, it, vi } from 'vitest';
import { T } from '../../data/text.zh-TW';
import { Game } from '../../engine/game';
import { itemWeight } from '../../engine/loot/item';
import { constRng, plainItem } from '../../engine/testing';
import type { ItemInstance, Rarity } from '../../engine/types';
import { NO_ART } from '../../render/textures';
import { EquipScene } from './equip';

const gear = (base: string, uid: number, rarity: Rarity = 'common', extra: Partial<ItemInstance> = {}): ItemInstance =>
  ({ ...plainItem(base, uid), rarity, ...extra });

/** `prep` runs on the fresh game before the scene opens (bag, worn gear). */
function setup(prep?: (g: Game) => void, arg = 'scarlet') {
  const game = new Game(constRng(0.5), null);
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
    expect(d.textContent).toContain('攻擊 +15');                        // implicit line
    expect(d.textContent).toContain('暴擊率 +5%');                      // affix line
    expect(d.textContent).toContain('鐵劍');                            // compared against what is worn
    const up = d.querySelector('.slx-cmp-row.slx-up[data-stat=atk]')!;
    expect(up.textContent).toContain('+11');
    expect(d.querySelector('.slx-cmp-row.slx-up[data-stat=crit]')).not.toBeNull();
    press('right');                                                    // the copper ring against a star ring
    const rows = detail().querySelectorAll('.slx-cmp-row');
    expect([...rows].map((r) => r.getAttribute('data-stat')).sort()).toEqual(['atk', 'hp', 'mag']);
    expect(detail().querySelector('.slx-cmp-row.slx-down[data-stat=atk]')!.textContent).toContain('-4');
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
});
