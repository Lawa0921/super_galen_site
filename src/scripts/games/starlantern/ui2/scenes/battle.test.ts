import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { constRng } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import { BattleScene } from './battle';

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };

function setup(prep?: (game: Game) => void) {
  const game = new Game(constRng(0.99), null);
  expect(game.depart(1)).toEqual({ ok: true });
  game.encounter = 99;
  expect(game.move('right').kind).toBe('battle');
  prep?.(game);
  const go = vi.fn();
  const root = document.createElement('div');
  const s = new BattleScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn(), stage: null, fast: true });
  s.enter(root);
  const labels = () => [...root.querySelectorAll('.slx-bcmd [role=option]')].map((o) => o.querySelector('.slx-label')!.textContent);
  const heading = () => root.querySelector('.slx-bcmd .slx-who')!.textContent;
  return { game, go, root, s, labels, heading };
}

describe('BattleScene', () => {
  it('lists the commands for the first member and adds the ultimate when the gauge is full', () => {
    const plain = setup();
    expect(plain.labels()).toEqual(['攻擊', '技能', '防禦', '道具', '逃跑', '全員攻擊']);
    expect(plain.heading()).toBe('絲嘉蕾 的行動');
    const full = setup((g) => { g.battle!.party[0].limit = 100; });
    expect(full.labels()).toContain('絕技：紅蓮劫火');
  });

  it('collects one action per member, submits once, and ignores input while the round plays', async () => {
    const { game, s } = setup();
    const submit = vi.spyOn(game, 'submitRound');
    for (let i = 0; i < 5; i++) { s.onAction('down'); s.onAction('down'); s.onAction('confirm'); }   // 防禦 ×5
    s.onAction('confirm');
    expect(submit).toHaveBeenCalledTimes(1);
    expect(Object.values(submit.mock.calls[0][0]).every((a) => a.kind === 'defend')).toBe(true);
    await flush();
  });

  it('goes back to the previous member on cancel', () => {
    const { s, heading } = setup();
    s.onAction('down'); s.onAction('down'); s.onAction('confirm');
    expect(heading()).toBe('千鶴 的行動');
    s.onAction('cancel');
    expect(heading()).toBe('絲嘉蕾 的行動');
  });

  it('disables items when there are none to use in battle', () => {
    const { root } = setup((g) => { g.state.inventory = {}; g.battle!.inventory = {}; });
    const item = [...root.querySelectorAll('.slx-bcmd [role=option]')].find((o) => o.textContent === '道具')!;
    expect(item.getAttribute('aria-disabled')).toBe('true');
  });

  it('全員攻擊 sends an attack for everyone at once', () => {
    const { game, s } = setup();
    const submit = vi.spyOn(game, 'submitRound');
    for (let i = 0; i < 5; i++) s.onAction('down');
    s.onAction('confirm');
    expect(Object.values(submit.mock.calls[0][0]).every((a) => a.kind === 'attack')).toBe(true);
  });

  it('shows the results after a win and returns to the labyrinth', async () => {
    const { go, s, root } = setup((g) => { for (const e of g.battle!.enemies) e.hp = 1; });
    for (let i = 0; i < 5; i++) s.onAction('down');
    s.onAction('confirm');
    await flush();
    expect(root.querySelector('.slx-result')!.textContent).toContain('勝利');
    s.onAction('confirm');
    expect(go).toHaveBeenCalledWith('dungeon');
  });

  it('shows the wipe and returns to town after a loss', async () => {
    const { go, s, root } = setup((g) => {
      g.battle!.party.forEach((c, i) => { c.hp = i === 0 ? 1 : 0; c.alive = i === 0; });   // one member left standing
      for (const e of g.battle!.enemies) { e.max.atk = 999; e.max.spd = 99; }
    });
    s.onAction('down'); s.onAction('down'); s.onAction('confirm');                              // 防禦
    await flush();
    expect(root.querySelector('.slx-result')!.textContent).toContain('全滅');
    s.onAction('confirm');
    expect(go).toHaveBeenCalledWith('town');
  });
});

describe('BattleScene sound and failure safety', () => {
  it('calls sound methods on their own object (a real SoundManager uses this)', async () => {
    class Sfx { hits = 0; cursor() {} confirm() {} cancel() {} error() {} hit() { this.hits++; } }
    const sfx = new Sfx();
    const game = new Game(constRng(0.99), null);
    game.depart(1); game.encounter = 99; game.move('right');
    for (const e of game.battle!.enemies) e.hp = 1;
    const stage = { show: vi.fn(), size: () => ({ width: 640, height: 360 }), battleView: { setup: vi.fn(), play: async (_s: unknown, fx: { hit(): void }) => { fx.hit(); } } };
    const root = document.createElement('div');
    const s = new BattleScene({ game, art: NO_ART, sfx, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), stage: stage as never, fast: true });
    s.enter(root);
    for (let i = 0; i < 5; i++) s.onAction('down');
    s.onAction('confirm');
    await flush();
    expect(sfx.hits).toBe(1);
    expect(root.querySelector('.slx-result')).not.toBeNull();
  });

  it('unlocks the screen and offers commands again if playback throws', async () => {
    const game = new Game(constRng(0.99), null);
    game.depart(1); game.encounter = 99; game.move('right');
    const stage = { show: vi.fn(), size: () => ({ width: 640, height: 360 }), battleView: { setup: vi.fn(), play: async () => { throw new Error('boom'); } } };
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const root = document.createElement('div');
    const s = new BattleScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn(), stage: stage as never, fast: true });
    s.enter(root);
    for (let i = 0; i < 5; i++) { s.onAction('down'); s.onAction('down'); s.onAction('confirm'); }
    await flush();
    expect(root.hasAttribute('inert')).toBe(false);
    expect(root.querySelectorAll('.slx-bcmd [role=option]').length).toBeGreaterThan(0);
    err.mockRestore();
  });
});
