import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { constRng } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import { GuildScene } from './guild';

function setup() {
  const game = new Game(constRng(0.5), null);
  game.state.gold = 1000;
  game.state.inventory['iron-sword'] = 1;
  const root = document.createElement('div');
  const s = new GuildScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity);
  s.enter(root);
  s.onAction('confirm'); // greeting
  const opts = () => [...root.querySelectorAll('.slx-layer:last-child [role=option]')].map((o) => o.querySelector('.slx-label')!.textContent);
  const pick = (label: string) => {
    const layer = root.querySelector('.slx-layer:last-child') ?? root.querySelector('.slx-cmd')!;
    const all = [...layer.querySelectorAll('[role=option]')];
    const i = all.findIndex((o) => o.querySelector('.slx-label')!.textContent === label);
    if (i < 0) throw new Error(`no option ${label}: ${all.map((o) => o.textContent).join('/')}`);
    (all[i] as HTMLElement).click();
  };
  return { game, root, s, opts, pick };
}

describe('GuildScene', () => {
  it('lists the guild commands', () => {
    const { root } = setup();
    expect([...root.querySelectorAll('.slx-cmd [role=option]')].map((o) => o.textContent)).toEqual(['編隊', '招募', '裝備', '狀態', '離開']);
  });

  it('swaps two slots in the formation', () => {
    const { game, pick, s } = setup();
    pick('編隊');
    pick('前排 1：絲嘉蕾');
    pick('諾艾兒');
    expect(game.state.party.front[0]).toBe('noel');
    expect(game.state.party.back[0]).toBe('scarlet');
    s.onAction('cancel');
  });

  it('keeps the formation and explains when the last member would be removed', () => {
    const { game, pick, root } = setup();
    game.state.party.front = ['scarlet', null, null];
    game.state.party.back = [null, null];
    pick('編隊');
    pick('前排 1：絲嘉蕾');
    pick('（空）');
    expect(game.state.party.front[0]).toBe('scarlet');
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('至少要有一人出戰');
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

  it('equips from the inventory and shows the stat change', () => {
    const { game, pick, opts } = setup();
    pick('裝備');
    pick('絲嘉蕾');
    pick('武器：（未裝備）');
    expect(opts()).toContain('鐵劍');
    expect(document.body).toBeTruthy();
    pick('鐵劍');
    expect(game.state.party.roster.scarlet.equip.weapon).toBe('iron-sword');
  });

  it('after equipping, 返回 steps back to the member list instead of jumping to the commands', () => {
    const { pick, s, root, opts } = setup();
    pick('裝備'); pick('絲嘉蕾'); pick('武器：（未裝備）'); pick('鐵劍');
    s.onAction('confirm');                                   // the 'equipped' line
    expect(opts()).toContain('武器：鐵劍');
    s.onAction('cancel');
    expect(opts()).toContain('絲嘉蕾');
    expect(root.querySelectorAll('.slx-layer')).toHaveLength(1);
  });

  it('says there is nothing to equip rather than a stock error', () => {
    const { pick, root } = setup();
    pick('裝備'); pick('絲嘉蕾'); pick('防具：（未裝備）');
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toContain('沒有可以換上的');
  });

  it('closes the status sheet with a click', () => {
    const { pick, root } = setup();
    pick('狀態'); pick('諾艾兒');
    (root.querySelector('.slx-status') as HTMLElement).click();
    expect(root.querySelector('.slx-status')).toBeNull();
  });

  it('shows a status sheet with skills and the ultimate', () => {
    const { pick, root } = setup();
    pick('狀態');
    pick('諾艾兒');
    const sheet = root.querySelector('.slx-status')!;
    expect(sheet.textContent).toContain('火之星彈');
    expect(sheet.textContent).toContain('流星燈火');
    expect(sheet.textContent).toContain('Lv 1');
  });
});
