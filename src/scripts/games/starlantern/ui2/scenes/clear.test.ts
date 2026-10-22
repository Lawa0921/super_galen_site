import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { constRng } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import { ClearScene } from './clear';

describe('ClearScene', () => {
  it('celebrates the clear and returns to town', () => {
    const game = new Game(constRng(0.5), null);
    game.phase = 'clear';
    const go = vi.fn();
    const root = document.createElement('div');
    const s = new ClearScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn() });
    s.enter(root);
    expect(root.textContent).toContain('星燈重新亮起');
    s.onAction('confirm');
    expect(game.phase).toBe('town');
    expect(go).toHaveBeenCalledWith('town');
  });
});
