import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { constRng } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import { TitleScene } from './title';

const ctx = (hasSave: boolean) => ({
  game: new Game(constRng(0.5), null), art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() },
  go: vi.fn(), hasSave: () => hasSave, newGame: vi.fn(),
});

describe('TitleScene', () => {
  it('disables continue without a save and starts a new game straight away', () => {
    const c = ctx(false); const root = document.createElement('div');
    const s = new TitleScene(c); s.enter(root);
    const opts = [...root.querySelectorAll('[role=option]')];
    expect(opts.map((o) => o.textContent)).toEqual(['新遊戲', '繼續', '設定']);
    expect(opts[1].getAttribute('aria-disabled')).toBe('true');
    s.onAction('confirm');
    expect(c.newGame).toHaveBeenCalled();
    expect(c.go).toHaveBeenCalledWith('town');
  });

  it('starts on continue when a save exists and asks before overwriting it', () => {
    const c = ctx(true); const root = document.createElement('div');
    const s = new TitleScene(c); s.enter(root);
    expect(root.querySelector('[aria-selected=true]')!.textContent).toBe('繼續');
    s.onAction('up');       // 新遊戲
    s.onAction('confirm');
    expect(root.textContent).toContain('覆蓋');
    expect(root.querySelector('.slx-confirm [aria-selected=true]')!.textContent).toBe('否');
    s.onAction('confirm');  // 否 is the default, so a double press cannot overwrite the save
    expect(c.newGame).not.toHaveBeenCalled();
    expect(root.querySelector('.slx-confirm')).toBeNull();
    s.onAction('confirm');  // 新遊戲 again
    s.onAction('up');       // 是
    s.onAction('confirm');
    expect(c.newGame).toHaveBeenCalledTimes(1);
    expect(c.go).toHaveBeenCalledWith('town');
  });

  it('continues into town', () => {
    const c = ctx(true); const root = document.createElement('div');
    const s = new TitleScene(c); s.enter(root);
    s.onAction('confirm');
    expect(c.go).toHaveBeenCalledWith('town');
    expect(c.newGame).not.toHaveBeenCalled();
  });
});
