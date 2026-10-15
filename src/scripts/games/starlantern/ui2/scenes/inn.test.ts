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
});
