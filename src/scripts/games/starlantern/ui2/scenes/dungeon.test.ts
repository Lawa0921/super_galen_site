import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { constRng } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import { DungeonScene } from './dungeon';

function setup() {
  const game = new Game(constRng(0.99), null);   // 0.99: never an early encounter roll
  expect(game.depart(1)).toEqual({ ok: true });
  const sfx = { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn(), bump: vi.fn(), step: vi.fn(), stairs: vi.fn(), chest: vi.fn(), encounter: vi.fn() };
  const go = vi.fn();
  const root = document.createElement('div');
  const s = new DungeonScene({ game, art: NO_ART, sfx, go, hasSave: () => false, newGame: vi.fn(), stage: null, fast: true }, Infinity);
  s.enter(root);
  const text = () => root.querySelector('.slx-talk .slx-text')?.textContent ?? '';
  const pick = (label: string) => {
    const o = [...root.querySelectorAll('.slx-layer:last-child [role=option]')].find((x) => x.querySelector('.slx-label')!.textContent!.startsWith(label));
    if (!o) throw new Error(`no ${label}`);
    (o as HTMLElement).click();
  };
  return { game, sfx, go, root, s, text, pick };
}

describe('DungeonScene', () => {
  it('shows the floor name, a green lamp and the party bar', () => {
    const { root } = setup();
    expect(root.querySelector('.slx-floorname')!.textContent).toBe('第 1 層　林間遺跡');
    expect(root.querySelector('.slx-lamp')!.classList.contains('slx-lamp-green')).toBe(true);
    expect(root.querySelectorAll('.slx-partybar .slx-pm')).toHaveLength(5);
  });

  it('bumps into walls and walks on floors', () => {
    const { game, sfx, s } = setup();
    const at = { ...game.pos };
    s.onAction('up');
    expect(sfx.bump).toHaveBeenCalled();
    expect(game.pos).toEqual(at);
    s.onAction('right');
    expect(game.pos).toEqual({ x: at.x + 1, y: at.y });
    expect(sfx.step).toHaveBeenCalled();
  });

  it('enters battle on an encounter and ignores further moves', () => {
    const { game, go, s, sfx } = setup();
    game.encounter = 99;
    s.onAction('right');
    expect(sfx.encounter).toHaveBeenCalled();
    expect(go).toHaveBeenCalledWith('battle');
    const at = { ...game.pos };
    s.onAction('left');
    expect(game.pos).toEqual(at);
  });

  it('asks before returning to town at the entrance', () => {
    const { game, go, s, root } = setup();
    s.onAction('right'); s.onAction('left');
    expect(root.querySelector('.slx-confirm')).not.toBeNull();
    s.onAction('up');            // 是
    s.onAction('confirm');
    expect(game.phase).toBe('town');
    expect(go).toHaveBeenCalledWith('town');
  });

  it('asks before using the return lamp, then tells the town about it', () => {
    const { game, go, s, pick, root } = setup();
    s.onAction('menu');
    pick('歸還之燈');
    expect(go).not.toHaveBeenCalled();
    expect(root.querySelector('.slx-confirm [aria-selected=true]')!.textContent).toBe('否');
    pick('是');
    expect(game.state.inventory['return-lamp'] ?? 0).toBe(0);
    expect(game.notice).toBe('lamp');
    expect(go).toHaveBeenCalledWith('town');
  });

  it('closes windows with the mouse: a 返回 control appears while a window is open, C closes the menu too', () => {
    const { s, root } = setup();
    const back = root.querySelector('.slx-dungeon > .slx-back') as HTMLElement;
    expect(back.hidden).toBe(true);
    s.onAction('menu');
    expect(back.hidden).toBe(false);
    back.click();
    expect(root.querySelector('.slx-layer')).toBeNull();
    expect(back.hidden).toBe(true);
    s.onAction('menu');
    s.onAction('menu');
    expect(root.querySelector('.slx-layer')).toBeNull();
  });

  it('opens the status screen on the member picked from 隊伍狀態', () => {
    const { s, go, pick } = setup();
    s.onAction('menu');
    pick('隊伍狀態');
    pick('絲嘉蕾');
    expect(go).toHaveBeenCalledWith('status', 'scarlet');
  });

  it('leaves out items that do nothing outside battle', () => {
    const { game, s, root, pick } = setup();
    game.state.inventory.antidote = 2;
    s.onAction('menu');
    pick('道具');
    const names = [...root.querySelectorAll('.slx-layer:last-child [role=option] .slx-label')].map((o) => o.textContent);
    expect(names).toContain('回復藥');
    expect(names).not.toContain('解毒藥');
  });

  it('offers settings from the field menu', () => {
    const { s, go, pick } = setup();
    s.onAction('menu');
    pick('設定');
    expect(go).toHaveBeenCalledWith('settings');
  });

  it('uses a potion from the field menu', () => {
    const { game, s, pick } = setup();
    game.state.party.roster.liz.hp = 3;
    s.onAction('menu');
    pick('道具');
    pick('回復藥');
    pick('莉茲');
    expect(game.state.party.roster.liz.hp).toBeGreaterThan(3);
    expect(game.state.inventory.potion).toBe(2);
  });
});
