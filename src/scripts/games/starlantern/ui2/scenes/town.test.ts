import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { constRng } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import { TownScene } from './town';

describe('TownScene', () => {
  it('shows place, gold and the facility menu with a greeting', () => {
    const game = new Game(constRng(0.5), null);
    const root = document.createElement('div');
    const s = new TownScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity);
    s.enter(root);
    expect(root.querySelector('.slx-place')!.textContent).toBe('邊境小鎮 露米亞');
    expect(root.querySelector('.slx-gold')!.textContent).toBe('150 G');
    expect([...root.querySelectorAll('[role=option]')].map((o) => o.textContent)).toEqual(['冒險者公會', '道具店', '旅館', '迷宮入口', '設定']);
    expect(root.querySelector('.slx-talk .slx-text')!.textContent!.length).toBeGreaterThan(0);
  });

  it('answers a facility with a not-yet line, closes it with confirm, and returns to title on cancel', () => {
    const go = vi.fn();
    const root = document.createElement('div');
    const s = new TownScene({ game: new Game(constRng(0.5), null), art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn() }, Infinity);
    s.enter(root);
    s.onAction('confirm');               // greeting closes
    s.onAction('confirm');               // 冒險者公會
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toContain('冒險者公會');
    s.onAction('down');                  // dialogue open: menu must not move
    s.onAction('confirm');               // close line
    expect(root.querySelector('[aria-selected=true]')!.textContent).toBe('冒險者公會');
    s.onAction('cancel');
    expect(go).toHaveBeenCalledWith('title');
  });
});
