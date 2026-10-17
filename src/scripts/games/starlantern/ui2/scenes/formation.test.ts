import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { meet, LEGACY_GRID, partyWith } from '../../engine/party';
import { constRng } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import { FormationScene } from './formation';

function setup(prep?: (g: Game) => void) {
  const game = new Game(constRng(0.5), null);
  // The legacy five with the hero (洛恩) in Scarlet's cell: the hero always takes the field.
  game.state.party = partyWith(['hero', 'chizuru', 'liz', 'noel', 'selene'], 'front', LEGACY_GRID.map((c) => (c === 'scarlet' ? 'hero' : c)));
  prep?.(game);
  const go = vi.fn();
  const root = document.createElement('div');
  const s = new FormationScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn(), from: 'guild' });
  s.enter(root);
  const cell = (i: number) => root.querySelector(`[data-cell="${i}"]`) as HTMLElement;
  const pick = (label: string) => {
    const o = [...root.querySelectorAll('.slx-formation-pick [role=option]')].find((x) => x.querySelector('.slx-label')!.textContent === label);
    if (!o) throw new Error(`no ${label}`);
    (o as HTMLElement).click();
  };
  return { game, go, root, s, cell, pick };
}

describe('FormationScene', () => {
  it('shows the 3x3 grid front row first, with the count and the rules', () => {
    const { root, cell } = setup();
    expect(root.querySelectorAll('[data-cell]')).toHaveLength(9);
    expect(cell(0).textContent).toContain('洛恩');
    expect(cell(4).textContent).toContain('空位');
    expect(cell(8).textContent).toContain('瑟蕾');
    expect(root.querySelector('.slx-formation-count')!.textContent).toBe('上陣 5／5');
    expect(root.textContent).toContain('近戰敵人只會攻擊最前面');
    expect(cell(0).classList.contains('slx-cell-sel')).toBe(true);
  });

  it('moves the cursor in two dimensions with the arrow keys', () => {
    const { s, cell } = setup();
    s.onAction('right'); s.onAction('down');
    expect(cell(4).classList.contains('slx-cell-sel')).toBe(true);
    s.onAction('down'); s.onAction('down');
    expect(cell(7).classList.contains('slx-cell-sel')).toBe(true);   // stops at the back row
  });

  it('moves a member to an empty cell with the keyboard', () => {
    const { game, s } = setup();
    s.onAction('down'); s.onAction('right');                // middle row, centre
    s.onAction('confirm');                                   // who goes here?
    for (let i = 0; i < 2; i++) s.onAction('down');          // 莉茲 (third in the roster)
    s.onAction('confirm');
    expect(game.state.party.grid[4]).toBe('liz');
    expect(game.state.party.grid[2]).toBeNull();
  });

  it('swaps two members with the mouse', () => {
    const { game, cell, pick } = setup();
    cell(0).click();
    pick('瑟蕾');
    expect(game.state.party.grid[0]).toBe('selene');
    expect(game.state.party.grid[8]).toBe('hero');
  });

  it('refuses a sixth member and can take someone off the field', () => {
    const { game, root, cell, pick } = setup((g) => { g.state.party = meet(g.state.party, 'bobby', 1); });
    cell(4).click();
    pick('波比');
    expect(game.state.party.grid[4]).toBeNull();
    expect(root.querySelector('.slx-formation-msg')!.textContent).toBe('最多只能 5 人上陣');
    cell(2).click();
    pick('移出隊伍');
    expect(game.state.party.grid[2]).toBeNull();
    expect(root.querySelector('.slx-formation-count')!.textContent).toBe('上陣 4／5');
  });

  it("the hero's cell offers no remove", () => {
    const labelsAt = (i: number) => {
      const { root, cell } = setup();
      cell(i).click();
      return [...root.querySelectorAll('.slx-formation-pick [role=option] .slx-label')].map((x) => x.textContent);
    };
    expect(labelsAt(0)).toContain('洛恩');
    expect(labelsAt(0)).not.toContain('移出隊伍');
    expect(labelsAt(1)).toContain('移出隊伍');   // a cell beside the hero still offers it
  });

  it('a refused formation shows the reason', () => {
    const { game, root, cell, pick } = setup((g) => { g.state.party = meet(g.state.party, 'bobby', 1); });
    cell(0).click();
    pick('波比');   // bobby takes the hero's cell: the hero is off the field
    expect(game.state.party.grid[0]).toBe('hero');
    expect(root.querySelector('.slx-formation-msg')!.textContent).toBe('洛恩必須出戰');
  });

  it('goes back to where it came from', () => {
    const { s, go, root } = setup();
    s.onAction('confirm');
    s.onAction('cancel');                                    // closes the list first
    expect(root.querySelector('.slx-formation-pick')).toBeNull();
    s.onAction('cancel');
    expect(go).toHaveBeenCalledWith('guild');
  });
});
