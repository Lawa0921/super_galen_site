import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { constRng } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import { GateScene } from './gate';

function setup(prep?: (g: Game) => void) {
  const game = new Game(constRng(0.5), null);
  prep?.(game);
  const go = vi.fn();
  const root = document.createElement('div');
  const s = new GateScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn() }, Infinity);
  s.enter(root);
  s.onAction('confirm');   // greeting
  s.onAction('confirm');   // 選擇樓層
  return { game, go, root, s };
}

describe('GateScene', () => {
  it('lists reached floors and locks the rest', () => {
    const { root } = setup((g) => { g.state.dungeon.reached.mainline = 2; });
    const cards = [...root.querySelectorAll('.slx-floors [role=option]')];
    expect(cards.map((c) => c.getAttribute('aria-disabled'))).toEqual(['false', 'false', 'true']);
    expect(cards[0].querySelector('.slx-label')!.textContent).toBe('第 1 層 林間遺跡');
  });

  it('departs after a yes and enters the labyrinth', () => {
    const { game, go, s, root } = setup();
    s.onAction('confirm');                       // 第 1 層
    expect(root.querySelector('.slx-confirm')!.textContent).toContain('第 1 層');
    s.onAction('up'); s.onAction('confirm');     // 是
    expect(game.phase).toBe('map');
    expect(go).toHaveBeenCalledWith('dungeon');
    expect([game.run!.region, game.run!.condition, game.floor]).toEqual(['mainline', 'plain', 1]);
  });

  it('departs from a deeper reached floor as a mainline shortcut', () => {
    const { game, s, root } = setup((g) => { g.state.dungeon.reached.mainline = 3; });
    s.onAction('down'); s.onAction('down'); s.onAction('confirm');   // 第 3 層
    expect(root.querySelector('.slx-confirm')!.textContent).toContain('第 3 層');
    s.onAction('up'); s.onAction('confirm');
    expect([game.phase, game.floor, game.run!.startDepth]).toEqual(['map', 3, 3]);
  });

  it('explains when nobody can fight', () => {
    const { game, go, s, root } = setup((g) => { for (const id of g.state.party.recruited) g.state.party.roster[id].hp = 0; });
    s.onAction('confirm'); s.onAction('up'); s.onAction('confirm');
    expect(go).not.toHaveBeenCalled();
    expect(game.phase).toBe('town');
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('出戰成員全部倒下，無法出發');
  });
});
