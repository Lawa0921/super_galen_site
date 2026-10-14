import { describe, it, expect, vi } from 'vitest';
import { renderTown } from './town';
import { Game } from '../engine/game';
import { constRng, memoryStorage } from '../engine/testing';
import type { UiHooks } from './dom';

function setup(storage = memoryStorage()) {
  const game = new Game(constRng(0.99), storage);
  const root = document.createElement('div');
  const hooks: UiHooks = { refresh: vi.fn(() => renderTown(root, game, hooks)), say: vi.fn(), move: vi.fn(), sfx: { menu: vi.fn(), bump: vi.fn() } as never };
  renderTown(root, game, hooks);
  const click = (sel: string) => (root.querySelector(sel) as HTMLButtonElement).click();
  return { game, root, hooks, click, storage };
}

describe('town ui', () => {
  it('lists only reached floors and departs', () => {
    const { game, root, click } = setup();
    click('#sl-tab-depart');
    expect(root.querySelectorAll('[id^="sl-depart-"]')).toHaveLength(1);
    click('#sl-depart-1');
    expect(game.phase).toBe('map');
  });
  it('explains why departure is refused', () => {
    const { game, click, hooks } = setup();
    for (const id of ['scarlet', 'chizuru', 'liz', 'noel', 'selene'] as const) game.state.party.roster[id].hp = 0;
    click('#sl-tab-depart');
    click('#sl-depart-1');
    expect(game.phase).toBe('town');
    expect(hooks.say).toHaveBeenCalledWith('出戰成員全部倒下，無法出發');
  });
  it('rests and saves at the inn', () => {
    const { game, click, storage } = setup();
    click('#sl-tab-inn');
    click('#sl-rest');
    expect(game.state.gold).toBe(130);
    expect(storage.map.has('starlantern-save')).toBe(true);
  });
  it('rejects a duplicate formation and keeps the old one', () => {
    const { game, root, click, hooks } = setup();
    click('#sl-tab-guild');
    const selects = root.querySelectorAll<HTMLSelectElement>('.sl-formation select');
    expect(selects).toHaveLength(5);
    selects[1].value = 'scarlet';
    selects[1].dispatchEvent(new Event('change'));
    expect(game.state.party.front).toEqual(['scarlet', 'chizuru', 'liz']);
    expect(hooks.say).toHaveBeenCalledWith('同一人不能重複上陣');
  });
  it('recruits a new member', () => {
    const { game, click } = setup();
    click('#sl-tab-guild');
    click('#sl-recruit-bobby');
    expect(game.state.party.recruited).toContain('bobby');
  });
  it('sells materials and shows locked gear as disabled', () => {
    const { game, root, click } = setup();
    game.state.inventory.moss = 2;
    click('#sl-tab-shop');
    click('#sl-sell-all-moss');
    expect(game.state.inventory.moss ?? 0).toBe(0);
    expect((root.querySelector('#sl-buy-moss-charm') as HTMLButtonElement).disabled).toBe(true);
  });
});
