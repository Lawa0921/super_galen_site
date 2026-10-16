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

  it('enters a facility or settings, and asks before returning to the title on cancel', () => {
    const go = vi.fn();
    const root = document.createElement('div');
    const s = new TownScene({ game: new Game(constRng(0.5), null), art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn() }, Infinity);
    s.enter(root);
    s.onAction('confirm');               // greeting closes
    s.onAction('confirm');               // 冒險者公會
    expect(go).toHaveBeenCalledWith('guild');
    for (let i = 0; i < 4; i++) s.onAction('down');
    s.onAction('confirm');               // 設定
    expect(go).toHaveBeenCalledWith('settings');
    s.onAction('cancel');
    expect(root.querySelector('.slx-confirm')!.textContent).toContain('標題');
    expect(root.querySelector('.slx-confirm [aria-selected=true]')!.textContent).toBe('否');
    s.onAction('confirm');               // 否
    expect(root.querySelector('.slx-confirm')).toBeNull();
    expect(go).not.toHaveBeenCalledWith('title');
    s.onAction('cancel'); s.onAction('up'); s.onAction('confirm');
    expect(go).toHaveBeenCalledWith('title');
  });
});

describe('TownScene pointer', () => {
  it('ignores a facility click while the greeting is still on screen', () => {
    const go = vi.fn();
    const root = document.createElement('div');
    const s = new TownScene({ game: new Game(constRng(0.5), null), art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn() }, Infinity);
    s.enter(root);
    const line = root.querySelector('.slx-talk .slx-text')!.textContent;
    (root.querySelector('[data-id=guild]') as HTMLElement).click();
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe(line);
    expect(go).not.toHaveBeenCalled();
  });
});

describe('TownScene mouse', () => {
  it('has a 返回 control that asks before going back to the title once the greeting is closed', () => {
    const go = vi.fn();
    const root = document.createElement('div');
    const s = new TownScene({ game: new Game(constRng(0.5), null), art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn() }, Infinity);
    s.enter(root);
    (root.querySelector('.slx-talk') as HTMLElement).click();
    (root.querySelector('.slx-back') as HTMLElement).click();
    (root.querySelector('.slx-confirm [data-id=yes]') as HTMLElement).click();
    expect(go).toHaveBeenCalledWith('title');
  });
});

describe('TownScene notices', () => {
  it('tells the player about a wipe before anything else and clears the notice', () => {
    const game = new Game(constRng(0.5), null);
    game.notice = 'wipe';
    const root = document.createElement('div');
    const s = new TownScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity);
    s.enter(root);
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('全滅……已回到上次住宿的時間點');
    expect(game.notice).toBeNull();
  });
});
