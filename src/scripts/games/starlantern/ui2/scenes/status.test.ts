import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { statsOf } from '../../engine/party';
import { constRng, plainItem } from '../../engine/testing';
import { art } from '../../render/artPaths';
import { NO_ART, type ArtIndex } from '../../render/textures';
import { STATUS_TABS } from './statusTabs';
import { StatusScene } from './status';

function setup(arg?: string, artIndex: ArtIndex = NO_ART) {
  const game = new Game(constRng(0.5), null);
  game.state.bag = [plainItem('iron-sword', 1)];
  game.state.party.roster.scarlet.equip.weapon = plainItem('iron-sword', 2);
  game.state.nextUid = 3;
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

  it('plays the standee entrance only when the member changes, with an aura in their colour', () => {
    const { s, root } = setup('scarlet', { has: (u) => u.includes('standee') });
    const first = root.querySelector('.slx-status-standee');
    expect(root.querySelector('.slx-status-art')!.classList.contains('slx-aura-scarlet')).toBe(true);
    s.onAction('right');                                 // another tab: same picture, no replay
    expect(root.querySelector('.slx-status-standee')).toBe(first);
    s.onAction('next');                                  // another member: a fresh picture slides in
    expect(root.querySelector('.slx-status-standee')).not.toBe(first);
    expect(root.querySelector('.slx-status-art')!.classList.contains('slx-aura-chizuru')).toBe(true);
    expect(root.querySelectorAll('.slx-status-art .slx-mote').length).toBeGreaterThan(0);
  });

  it('has a tab list that new systems can join, each carrying its own label and keys', () => {
    expect(STATUS_TABS.map((t) => t.id)).toEqual(['stats', 'gear', 'skills', 'ultimate']);
    expect(STATUS_TABS.every((t) => t.label.length > 0)).toBe(true);
    const extra = { id: 'test', label: '測試', onAction: vi.fn(() => true), render: () => document.createElement('div') };
    STATUS_TABS.push(extra);
    try {
      const { s, tab } = setup('scarlet');
      for (let i = 0; i < 4; i++) s.onAction('right');
      expect(tab()).toBe('測試');
      s.onAction('confirm');
      expect(extra.onAction).toHaveBeenCalledWith('confirm', expect.anything(), 'scarlet');
    } finally {
      STATUS_TABS.pop();
    }
  });

  it('shows no melee percentage for a member on reserve', () => {
    const { body } = setup('scarlet');
    expect(body()).toContain('近戰（100%）');
    const r = setup('scarlet');
    r.game.state.party.grid[0] = null;
    r.s.onAction('next'); r.s.onAction('prev');
    expect(r.body()).toContain('站位 待命');
    expect(r.body()).not.toContain('%）');
  });

  it('the gear page lists nine slots with rarity classes', () => {
    const { s, game, root } = setup('scarlet');
    game.state.party.roster.scarlet.equip.weapon = { ...plainItem('iron-sword', 9), rarity: 'rare' };
    s.onAction('right');
    expect(root.querySelectorAll('.slx-tab-gear .slx-gear-row')).toHaveLength(9);
    expect(root.querySelector('.slx-tab-gear .slx-gear-name')!.classList.contains('slx-rarity-rare')).toBe(true);
    expect(root.querySelector('.slx-tab-gear .slx-gear-row:nth-child(2) .slx-gear-name')!.classList.contains('slx-rarity-rare')).toBe(false);
  });
});
