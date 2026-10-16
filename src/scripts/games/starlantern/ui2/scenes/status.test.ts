import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { statsOf } from '../../engine/party';
import { constRng } from '../../engine/testing';
import { art } from '../../render/artPaths';
import { NO_ART, type ArtIndex } from '../../render/textures';
import { STATUS_TABS } from './statusTabs';
import { StatusScene } from './status';

function setup(arg?: string, artIndex: ArtIndex = NO_ART) {
  const game = new Game(constRng(0.5), null);
  game.state.inventory['iron-sword'] = 1;
  game.state.party.roster.scarlet.equip.weapon = 'iron-sword';
  const go = vi.fn();
  const root = document.createElement('div');
  const s = new StatusScene({ game, art: artIndex, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn(), from: 'guild', arg });
  s.enter(root);
  const body = () => root.querySelector('.slx-status-body')!.textContent!;
  const tab = () => root.querySelector('.slx-tab-sel')!.textContent;
  const name = () => root.querySelector('.slx-status-name')!.textContent!;
  return { game, go, root, s, body, tab, name };
}

describe('StatusScene', () => {
  it('opens on the member it was given, with a large standee and the stats tab', () => {
    const { root, name, tab, body, game } = setup('scarlet', { has: (u) => u === art.standee('scarlet') });
    expect(name()).toContain('絲嘉蕾');
    expect(name()).toContain('火焰騎士');
    expect(root.querySelector('.slx-status-standee')!.getAttribute('src')).toBe(art.standee('scarlet'));
    expect(tab()).toBe('能力');
    const st = statsOf(game.state.party.roster.scarlet);
    expect(body()).toContain('攻擊');
    expect(root.querySelector('[data-stat=atk] .slx-total')!.textContent).toBe(String(st.atk));
    expect(root.querySelector('[data-stat=atk] .slx-gear')!.textContent).toMatch(/^\+\d+$/);   // the sword's bonus
    expect(body()).toContain('站位 前排');
    expect(body()).toContain('近戰（100%）');
  });

  it('switches tabs with left/right and the mouse', () => {
    const { s, root, tab, body } = setup('noel');
    s.onAction('right');
    expect(tab()).toBe('裝備');
    expect(body()).toContain('武器');
    s.onAction('right');
    expect(tab()).toBe('技能');
    expect(body()).toContain('火之星彈');
    expect(body()).toContain('TP 4');
    (root.querySelector('[data-tab=ultimate]') as HTMLElement).click();
    expect(tab()).toBe('絕技');
    expect(body()).toContain('流星燈火');
    s.onAction('left'); s.onAction('left'); s.onAction('left');
    expect(tab()).toBe('能力');
    s.onAction('left');                                   // wraps
    expect(tab()).toBe('絕技');
  });

  it('pages through the recruited members with Q/E and the arrows, keeping the tab', () => {
    const { s, root, name, tab } = setup('scarlet');
    s.onAction('right');
    s.onAction('next');
    expect(name()).toContain('千鶴');                      // recruited order: scarlet, chizuru, liz, noel, selene
    expect(tab()).toBe('裝備');
    s.onAction('prev');
    expect(name()).toContain('絲嘉蕾');
    (root.querySelector('.slx-status-prev') as HTMLElement).click();
    expect(name()).toContain('瑟蕾');
  });

  it('defaults to the first member on the field and returns where it came from', () => {
    const { s, go, name } = setup();
    expect(name()).toContain('絲嘉蕾');
    s.onAction('cancel');
    expect(go).toHaveBeenCalledWith('guild');
  });

  it('has a tab list that new systems can join', () => {
    expect(STATUS_TABS.map((t) => t.id)).toEqual(['stats', 'gear', 'skills', 'ultimate']);
  });
});
