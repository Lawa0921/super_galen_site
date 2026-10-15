import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { constRng } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import { GateScene } from './gate';

describe('GateScene', () => {
  it('lists reached floors and locks the rest', () => {
    const game = new Game(constRng(0.5), null);
    game.state.dungeon.reachedFloor = 2;
    const root = document.createElement('div');
    const s = new GateScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity);
    s.enter(root);
    s.onAction('confirm');
    s.onAction('confirm');                        // 選擇樓層
    const cards = [...root.querySelectorAll('.slx-floors [role=option]')];
    expect(cards.map((c) => c.getAttribute('aria-disabled'))).toEqual(['false', 'false', 'true']);
    expect(cards[0].querySelector('.slx-label')!.textContent).toBe('第 1 層 林間遺跡');
    s.onAction('confirm');
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toContain('下一階段');
  });
});
