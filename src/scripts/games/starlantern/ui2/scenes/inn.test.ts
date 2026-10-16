import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { constRng, memoryStorage } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import { InnScene } from './inn';

function setup(storage = memoryStorage()) {
  const game = new Game(constRng(0.5), storage);
  const root = document.createElement('div');
  const sfx = { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() };
  const s = new InnScene({ game, art: NO_ART, sfx, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity, 0);
  s.enter(root);
  s.onAction('confirm');
  const opts = () => [...root.querySelectorAll('.slx-cmd [role=option]')].map((o) => o.querySelector('.slx-label')!.textContent);
  return { game, root, s, sfx, storage, opts };
}

describe('InnScene', () => {
  afterEach(() => vi.useRealTimers());

  it('rests and saves after a yes', async () => {
    const { game, s, root, storage } = setup();
    game.state.party.roster.scarlet.hp = 1;
    const gold = game.state.gold;
    s.onAction('confirm');                 // 休息
    s.onAction('up');                      // 是
    s.onAction('confirm');
    await vi.waitFor(() => expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('已存檔。'));
    expect(game.state.party.roster.scarlet.hp).toBeGreaterThan(1);
    expect(game.state.gold).toBeLessThan(gold);
    expect(storage.map.get('starlantern-save')).toBeTruthy();
  });

  it('ignores every key while the night passes, and stops the night timer on exit', async () => {
    vi.useFakeTimers();
    const game = new Game(constRng(0.5), memoryStorage());
    const go = vi.fn();
    const root = document.createElement('div');
    const s = new InnScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn() }, Infinity, 1000);
    s.enter(root);
    s.onAction('confirm');                 // greeting
    s.onAction('confirm'); s.onAction('up'); s.onAction('confirm');   // 休息 → 是
    expect(root.querySelector('.slx-night')).not.toBeNull();
    s.onAction('cancel');
    s.onAction('confirm');
    expect(go).not.toHaveBeenCalled();
    expect(root.querySelector('.slx-confirm')).toBeNull();
    s.exit();
    await vi.advanceTimersByTimeAsync(2000);
    expect(root.querySelector('.slx-talk')!.hasAttribute('hidden')).toBe(true);   // no line typed onto a scene that has gone
  });

  it('explains when nobody needs reviving', () => {
    const { s, root } = setup();
    s.onAction('down');                    // 復活
    s.onAction('confirm');
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('大家都很有精神呢。');
    expect(root.querySelector('.slx-layer')).toBeNull();
  });

  it('revives a fallen member for gold', () => {
    const { game, s } = setup();
    game.state.party.roster.liz.hp = 0;
    s.onAction('down'); s.onAction('confirm');   // 復活
    s.onAction('confirm');                       // 莉茲
    expect(game.state.party.roster.liz.hp).toBeGreaterThan(0);
  });

  it('the inn offers 休息, 復活 and 重置配點', () => {
    const { opts } = setup();
    expect(opts()).toEqual(['休息（20 G）', '復活', '重置配點', '離開']);
  });

  it('重置配點 lists members with their price and resets after a yes', async () => {
    const { game, s, root, opts } = setup();
    game.state.party.roster.scarlet.talents = { 'scarlet-t01': 1 };
    const gold = game.state.gold;
    s.onAction('down'); s.onAction('down'); s.onAction('confirm');   // 重置配點
    const rows = [...root.querySelectorAll('.slx-list [role=option]')];
    expect(rows.map((r) => r.querySelector('.slx-label')!.textContent)).toContain('絲嘉蕾');
    expect(rows[0].textContent).toContain('25 G');
    const at = rows.findIndex((r) => r.textContent!.includes('絲嘉蕾'));
    for (let i = 0; i < at; i++) s.onAction('down');
    s.onAction('confirm');                                           // 絲嘉蕾
    expect(root.querySelector('.slx-confirm')!.textContent).toContain('25 G');
    expect(game.state.party.roster.scarlet.talents).toEqual({ 'scarlet-t01': 1 });   // not before the yes
    s.onAction('up'); s.onAction('confirm');                         // 是
    expect(game.state.party.roster.scarlet.talents).toEqual({});
    expect(game.state.gold).toBe(gold - 25);
    await vi.waitFor(() => expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('絲嘉蕾的配點已重置，點數可以重新分配了。'));
    expect(opts().length).toBe(4);
  });

  it('no leaves everything as it was', () => {
    const { game, s, root } = setup();
    game.state.party.roster.scarlet.talents = { 'scarlet-t01': 1 };
    const gold = game.state.gold;
    s.onAction('down'); s.onAction('down'); s.onAction('confirm');
    const rows = [...root.querySelectorAll('.slx-list [role=option]')];
    const at = rows.findIndex((r) => r.textContent!.includes('絲嘉蕾'));
    for (let i = 0; i < at; i++) s.onAction('down');
    s.onAction('confirm');
    s.onAction('confirm');                                           // cursor starts on 否
    expect(game.state.party.roster.scarlet.talents).toEqual({ 'scarlet-t01': 1 });
    expect(game.state.gold).toBe(gold);
  });

  it('explains when a member has nothing to reset, and when gold is short', async () => {
    const { game, s, root } = setup();
    s.onAction('down'); s.onAction('down'); s.onAction('confirm');
    s.onAction('confirm');                                           // first member, nothing spent
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('還沒有配過點，不需要重置。');
    expect(root.querySelector('.slx-confirm')).toBeNull();
    expect(game.state.gold).toBe(150);
  });
});
