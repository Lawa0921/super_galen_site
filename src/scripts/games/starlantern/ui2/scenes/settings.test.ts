import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { constRng } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import type { Settings } from '../settings';
import { SettingsScene } from './settings';

function setup(from?: 'title' | 'town') {
  let saved: Settings = { volume: 70, textSpeed: 'mid', vibrate: true, story: 'all' };
  const store = { get: () => saved, set: vi.fn((s: Settings) => { saved = s; }) };
  const go = vi.fn();
  const fullscreen = vi.fn();
  const root = document.createElement('div');
  const s = new SettingsScene({
    game: new Game(constRng(0.5), null), art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() },
    go, hasSave: () => false, newGame: vi.fn(), settings: store, from, fullscreen,
  });
  s.enter(root);
  const row = (id: string) => root.querySelector(`[data-id=${id}]`) as HTMLElement;
  return { s, root, go, store, row, fullscreen, saved: () => saved };
}

describe('SettingsScene', () => {
  it('lists volume, text speed, fullscreen, controls and back with current values', () => {
    const { root } = setup();
    expect([...root.querySelectorAll('[role=option] .slx-label')].map((o) => o.textContent)).toEqual(['音效音量', '文字速度', '震動', '劇情播放', '全螢幕', '按鍵說明', '返回']);
    expect(root.querySelector('[data-id=volume] .slx-right')!.textContent).toContain('70%');
    expect(root.querySelector('[data-id=speed] .slx-right')!.textContent).toContain('中');
  });

  it('adjusts values with left/right and saves them at once', () => {
    const { s, root, store, saved } = setup();
    s.onAction('right');
    expect(saved().volume).toBe(80);
    s.onAction('down');
    s.onAction('left');
    expect(saved().textSpeed).toBe('slow');
    expect(store.set).toHaveBeenCalledTimes(2);
    expect(root.querySelector('[data-id=speed] .slx-right')!.textContent).toContain('慢');
  });

  it('clamps volume at 0 and 100', () => {
    const { s, saved } = setup();
    for (let i = 0; i < 12; i++) s.onAction('right');
    expect(saved().volume).toBe(100);
    for (let i = 0; i < 12; i++) s.onAction('left');
    expect(saved().volume).toBe(0);
  });

  it('cycles a value when its row is clicked, so the mouse can change everything', () => {
    const { row, saved } = setup();
    row('speed').click();
    expect(saved().textSpeed).toBe('fast');
    row('speed').click(); row('speed').click();
    expect(saved().textSpeed).toBe('slow');
    row('volume').click();
    expect(saved().volume).toBe(80);
  });

  it('turns vibration on and off', () => {
    const { row, saved, root } = setup();
    expect(root.querySelector('[data-id=vibrate] .slx-right')!.textContent).toContain('開');
    row('vibrate').click();
    expect(saved().vibrate).toBe(false);
    expect(root.querySelector('[data-id=vibrate] .slx-right')!.textContent).toContain('關');
  });

  it('the story row cycles all, major and none', () => {
    const { row, saved, root } = setup();
    const shown = () => root.querySelector('[data-id=story] .slx-right')!.textContent;
    expect(root.querySelector('[data-id=story] .slx-label')!.textContent).toBe('劇情播放');
    expect(shown()).toContain('全部播放');
    row('story').click();
    expect(saved().story).toBe('major');
    expect(shown()).toContain('只播重大場景');
    row('story').click();
    expect(saved().story).toBe('none');
    expect(shown()).toContain('不自動播放');
    row('story').click();
    expect(saved().story).toBe('all');
  });

  it('toggles fullscreen and shows the controls until dismissed', () => {
    const { s, root, row, fullscreen } = setup();
    row('fullscreen').click();
    expect(fullscreen).toHaveBeenCalled();
    row('keys').click();
    const help = root.querySelector('.slx-keys') as HTMLElement;
    expect(help.textContent).toContain('Esc');
    s.onAction('down');                     // the list underneath does not move
    expect(root.querySelector('[aria-selected=true]')!.getAttribute('data-id')).toBe('keys');
    help.click();
    expect(root.querySelector('.slx-keys')).toBeNull();
  });

  it('goes back where it came from on cancel, 返回 or the back control', () => {
    const a = setup('town'); a.s.onAction('cancel'); expect(a.go).toHaveBeenCalledWith('town');
    const b = setup(); b.row('back').click(); expect(b.go).toHaveBeenCalledWith('title');
    const c = setup('title'); (c.root.querySelector('.slx-back') as HTMLElement).click(); expect(c.go).toHaveBeenCalledWith('title');
  });
});
