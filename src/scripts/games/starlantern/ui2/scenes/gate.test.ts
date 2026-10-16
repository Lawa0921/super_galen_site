import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { constRng } from '../../engine/testing';
import { NO_ART, type ArtIndex } from '../../render/textures';
import { GateScene, portalArt } from './gate';

function setup(prep?: (g: Game) => void, art: ArtIndex = NO_ART) {
  const game = new Game(constRng(0.5), null);
  game.state.dungeon.portals = [
    { region: 'mainline', condition: 'plain' },
    { region: 'blaze', condition: 'fog' },
    { region: 'iron', condition: 'starfall' },
  ];
  prep?.(game);
  const go = vi.fn();
  const root = document.createElement('div');
  const s = new GateScene({ game, art, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn() }, Infinity);
  s.enter(root);
  s.onAction('confirm');   // greeting
  s.onAction('confirm');   // 選擇傳送門
  const cards = () => [...root.querySelectorAll<HTMLElement>('.slx-portal')];
  const depths = () => [...root.querySelectorAll('.slx-depths [role=option] .slx-label')].map((o) => o.textContent);
  return { game, go, root, s, cards, depths };
}

describe('GateScene: the portal plaza', () => {
  it('the plaza shows three portals with the mainline first', () => {
    const { root, cards } = setup();
    expect(root.querySelector('.slx-place')!.textContent).toBe('傳送門廣場');
    expect(cards()).toHaveLength(3);
    expect(cards().map((c) => c.querySelector('.slx-portal-name')!.textContent)).toEqual(['星燈迷宮・本道', '熾焰之地', '鋼鐵要塞']);
    expect(cards()[0].getAttribute('aria-selected')).toBe('true');
    const blaze = cards()[1];
    expect(blaze.querySelector('.slx-portal-trait')!.textContent).toContain('火');
    expect(blaze.querySelector('.slx-portal-trait')!.textContent).toContain('灼燒');
    expect(blaze.querySelector('.slx-portal-monsters')!.textContent).toContain('苔蘚史萊姆');
    expect(blaze.querySelector('.slx-portal-cond')!.textContent).toContain('濃霧');
    expect(blaze.querySelector('.slx-portal-gear')!.textContent).toBe('限定裝備：？？？');
    // Before the art is approved there is no picture and no stand-in shape: words only.
    expect(root.querySelector('.slx-portals img')).toBeNull();
  });

  it('moves between cards with left and right', () => {
    const { s, cards } = setup();
    s.onAction('right');
    expect(cards().map((c) => c.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    s.onAction('right'); s.onAction('right');   // wraps
    expect(cards()[0].getAttribute('aria-selected')).toBe('true');
    s.onAction('left');
    expect(cards()[2].getAttribute('aria-selected')).toBe('true');
  });

  it('start depth offers only 1 and reached multiples of 5', () => {
    const { s, depths } = setup((g) => { g.state.dungeon.reached.blaze = 12; });
    s.onAction('right'); s.onAction('confirm');   // 熾焰之地
    expect(depths()).toEqual(['第 1 層', '第 5 層', '第 10 層']);
  });

  it('keeps the mainline shortcuts to every floor reached', () => {
    const { s, depths } = setup((g) => { g.state.dungeon.reached.mainline = 3; });
    s.onAction('confirm');
    expect(depths()).toEqual(['第 1 層 林間遺跡', '第 2 層 水晶洞窟', '第 3 層 星燈神殿']);
  });

  it('departs after a yes with the portal, its condition and the start depth', () => {
    const { game, go, s, root } = setup((g) => { g.state.dungeon.reached.blaze = 5; });
    s.onAction('right'); s.onAction('confirm');    // 熾焰之地
    s.onAction('down'); s.onAction('confirm');     // 第 5 層
    expect(root.querySelector('.slx-confirm')!.textContent).toContain('熾焰之地');
    expect(root.querySelector('.slx-confirm')!.textContent).toContain('第 5 層');
    expect(root.querySelector('.slx-confirm [aria-selected=true]')!.textContent).toBe('否');
    s.onAction('up'); s.onAction('confirm');       // 是
    expect(go).toHaveBeenCalledWith('dungeon');
    expect([game.phase, game.run!.region, game.run!.condition, game.run!.startDepth, game.floor]).toEqual(['map', 'blaze', 'fog', 5, 5]);
  });

  it('is fully playable with the mouse', () => {
    const { game, go, root, cards } = setup();
    cards()[2].click();
    (root.querySelector('.slx-depths [role=option]') as HTMLElement).click();
    (root.querySelector('.slx-confirm [data-id=yes]') as HTMLElement).click();
    expect(go).toHaveBeenCalledWith('dungeon');
    expect([game.run!.region, game.run!.condition]).toEqual(['iron', 'starfall']);
  });

  it('backs out one window at a time', () => {
    const { s, root } = setup();
    s.onAction('confirm');
    expect(root.querySelector('.slx-depths')).not.toBeNull();
    s.onAction('cancel');
    expect(root.querySelector('.slx-depths')).toBeNull();
    expect(root.querySelector('.slx-portals')).not.toBeNull();
    s.onAction('cancel');
    expect(root.querySelector('.slx-portals')).toBeNull();
  });

  it('cards under the depth window ignore the mouse', () => {
    const { s, root, cards, depths } = setup();
    s.onAction('confirm');
    expect(root.querySelector('.slx-portals')!.hasAttribute('inert')).toBe(true);
    cards()[1].click();
    expect(depths()).toEqual(['第 1 層 林間遺跡']);
  });

  it('shows approved portal art when it is published', () => {
    const urls = new Set([portalArt.card('blaze'), portalArt.trait('fire')]);
    const { cards } = setup(undefined, { has: (u) => urls.has(u) });
    expect(cards()[1].querySelector('img.slx-portal-art')!.getAttribute('src')).toBe(portalArt.card('blaze'));
    expect(cards()[1].querySelector('.slx-portal-trait img')!.getAttribute('src')).toBe(portalArt.trait('fire'));
    expect(cards()[0].querySelector('img')).toBeNull();
  });

  it('explains when nobody can fight', () => {
    const { game, go, s, root } = setup((g) => { for (const id of g.state.party.recruited) g.state.party.roster[id].hp = 0; });
    s.onAction('confirm'); s.onAction('confirm'); s.onAction('up'); s.onAction('confirm');
    expect(go).not.toHaveBeenCalled();
    expect(game.phase).toBe('town');
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('出戰成員全部倒下，無法出發');
  });
});
