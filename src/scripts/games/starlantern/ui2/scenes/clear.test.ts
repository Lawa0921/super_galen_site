import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { T } from '../../data/text.zh-TW';
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
    expect(root.textContent).toContain(T.clear.title);
    s.onAction('confirm');
    expect(game.phase).toBe('town');
    expect(go).toHaveBeenCalledWith('town');
  });
  it("the clear card is Act 1's", () => {
    const game = new Game(constRng(0.5), null);
    game.phase = 'clear';
    const root = document.createElement('div');
    new ClearScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }).enter(root);
    expect(root.querySelector('h2')!.textContent).toBe(T.clear.title);
    expect(T.clear.title).toBe('第一幕　星燈重新亮起');
    const opts = [...root.querySelectorAll('.slx-opt')].map((o) => o.textContent);
    expect(opts).toEqual(['繼續']);
    expect(T.clear.back).toBe('繼續');
  });
});
