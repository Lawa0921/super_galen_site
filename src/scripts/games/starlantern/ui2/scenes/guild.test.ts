import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { constRng, plainItem } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import { GuildScene } from './guild';

function setup(from?: 'formation' | 'status') {
  const game = new Game(constRng(0.5), null);
  game.state.gold = 1000;
  game.state.bag = [plainItem('iron-sword', 1)];
  game.state.nextUid = 2;
  const root = document.createElement('div');
  const go = vi.fn();
  const s = new GuildScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn(), from }, Infinity);
  s.enter(root);
  if (!from) s.onAction('confirm'); // greeting
  const opts = () => [...root.querySelectorAll('.slx-layer:last-child [role=option]')].map((o) => o.querySelector('.slx-label')!.textContent);
  const pick = (label: string) => {
    const layer = root.querySelector('.slx-layer:last-child') ?? root.querySelector('.slx-cmd')!;
    const all = [...layer.querySelectorAll('[role=option]')];
    const i = all.findIndex((o) => o.querySelector('.slx-label')!.textContent === label);
    if (i < 0) throw new Error(`no option ${label}: ${all.map((o) => o.textContent).join('/')}`);
    (all[i] as HTMLElement).click();
  };
  return { game, root, s, opts, pick, go };
}

describe('GuildScene', () => {
  it('lists the guild commands', () => {
    const { root } = setup();
    expect([...root.querySelectorAll('.slx-cmd [role=option]')].map((o) => o.textContent)).toEqual(['編隊', '招募', '裝備', '狀態', '離開']);
  });

  it('recruits after a confirmation', () => {
    const { game, pick, s, root } = setup();
    pick('招募');
    pick('森林遊俠 希爾薇');
    expect(root.textContent).toContain('單體高傷');
    s.onAction('up');      // confirm box defaults to 否; up wraps to 是
    s.onAction('confirm');
    expect(game.state.party.recruited).toContain('sylvie');
  });

  it('opens the formation, equipment and status screens', () => {
    const { pick, go } = setup();
    pick('編隊');
    expect(go).toHaveBeenLastCalledWith('formation');
    pick('裝備');
    expect(go).toHaveBeenLastCalledWith('equip');
    pick('狀態');
    expect(go).toHaveBeenLastCalledWith('status');
  });

  it('skips the greeting when coming back from one of its own screens, with the cursor on that command', () => {
    const { root } = setup('formation');
    expect(root.querySelector('.slx-talk')!.hasAttribute('hidden')).toBe(true);
    expect(root.querySelector('.slx-cmd [aria-selected=true]')!.textContent).toBe('編隊');
    const back = setup('status');
    expect(back.root.querySelector('.slx-cmd [aria-selected=true]')!.textContent).toBe('狀態');
  });
});
