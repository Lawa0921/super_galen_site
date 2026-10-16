import { describe, expect, it, vi } from 'vitest';
import { EQUIPMENT } from '../../data/equipment';
import { Game } from '../../engine/game';
import { statsOf } from '../../engine/party';
import { constRng, plainItem } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import { EquipScene } from './equip';

function setup(arg = 'scarlet') {
  const game = new Game(constRng(0.5), null);
  game.state.bag = [plainItem('iron-sword', 1)];
  game.state.nextUid = 2;
  const go = vi.fn();
  const sfx = { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() };
  const root = document.createElement('div');
  const s = new EquipScene({ game, art: NO_ART, sfx, go, hasSave: () => false, newGame: vi.fn(), from: 'guild', arg });
  s.enter(root);
  const slots = () => [...root.querySelectorAll('.slx-equip-slots [role=option]')].map((o) => o.textContent);
  const items = () => [...root.querySelectorAll('.slx-equip-items [role=option] .slx-label')].map((o) => o.textContent);
  const cmp = (k: string) => root.querySelector(`.slx-compare [data-stat=${k}]`)!.textContent;
  return { game, go, root, s, sfx, slots, items, cmp };
}

describe('EquipScene', () => {
  it('lists the nine slots and previews what the slot under the cursor can take', () => {
    const { slots, items, root } = setup();
    expect(slots()[0]).toContain('武器');
    expect(slots()[0]).toContain('（未裝備）');
    expect(items()).toEqual(['鐵劍']);
    expect(root.querySelector('.slx-equip-items')!.hasAttribute('inert')).toBe(true);   // not active until the slot is chosen
  });

  it('compares stats before and after the item under the cursor, then equips it', () => {
    const { s, game, cmp } = setup();
    const before = statsOf(game.state.party.roster.scarlet).atk;
    const gain = EQUIPMENT['iron-sword'].bonus.atk!;
    s.onAction('confirm');                               // into the weapon list
    expect(cmp('atk')).toContain(String(before));
    expect(cmp('atk')).toContain(String(before + gain));
    expect(cmp('atk')).toContain('▲');
    s.onAction('confirm');                               // equip 鐵劍
    expect(game.state.party.roster.scarlet.equip.weapon?.base).toBe('iron-sword');
    expect(game.state.bag).toHaveLength(0);
  });

  it('can take an item off and says when a slot has nothing to offer', () => {
    const { s, game, items, root } = setup();
    s.onAction('confirm'); s.onAction('confirm');        // equip the sword
    s.onAction('confirm');                               // weapon list again: 卸下 is offered
    expect(items()).toContain('卸下');
    s.onAction('down'); s.onAction('confirm');           // 卸下
    expect(game.state.party.roster.scarlet.equip.weapon).toBeUndefined();
    s.onAction('down');                                  // 副手
    expect(root.querySelector('.slx-equip-items')!.textContent).toContain('沒有可以換上的裝備');
  });

  it('pages through members with Q/E, and steps back from the item list before leaving', () => {
    const { s, root, go } = setup();
    s.onAction('next');
    expect(root.querySelector('.slx-equip-name')!.textContent).toContain('千鶴');
    s.onAction('confirm');
    s.onAction('cancel');                                 // back to the slots
    expect(go).not.toHaveBeenCalled();
    s.onAction('cancel');
    expect(go).toHaveBeenCalledWith('guild');
  });

  it('works with the mouse: click a slot, then an item', () => {
    const { root, game } = setup();
    (root.querySelector('.slx-equip-slots [data-id=weapon]') as HTMLElement).click();
    (root.querySelector('.slx-equip-items [data-id="1"]') as HTMLElement).click();
    expect(game.state.party.roster.scarlet.equip.weapon?.base).toBe('iron-sword');
  });
});
