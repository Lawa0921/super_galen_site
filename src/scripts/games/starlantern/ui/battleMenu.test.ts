import { describe, it, expect, vi } from 'vitest';
import { BattleMenu } from './battleMenu';
import { Game } from '../engine/game';
import { createBattle } from '../engine/battle';
import { constRng } from '../engine/testing';

function setup(enemyIds = ['slime', 'bat'], boss = false) {
  const game = new Game(constRng(0.5), null);
  const state = createBattle({ party: game.state.party, enemyIds, boss, inventory: { potion: 1 }, revealed: {} });
  const root = document.createElement('div');
  const submit = vi.fn();
  const menu = new BattleMenu(root, game, submit);
  menu.show(state);
  const q = <T extends Element = HTMLButtonElement>(sel: string) => root.querySelector(sel) as T | null;
  return { root, submit, menu, state, q };
}

describe('battle menu', () => {
  it('marks each party card with its combatant key', () => {
    const { root, state } = setup();
    const cards = [...root.querySelectorAll<HTMLElement>('.sl-party .sl-member')];
    expect(cards.map((c) => c.dataset.key)).toEqual(state.party.map((c) => c.key));
  });
  it('auto-attacks with every able member', () => {
    const { q, submit } = setup();
    q('#sl-auto')!.click();
    expect(submit).toHaveBeenCalledTimes(1);
    const actions = submit.mock.calls[0][0];
    expect(Object.keys(actions)).toEqual(['scarlet', 'chizuru', 'liz', 'noel', 'selene']);
    expect(actions.scarlet).toEqual({ kind: 'attack', target: 'e0' });
  });
  it('walks member by member and submits after the last', () => {
    const { q, root, submit } = setup();
    expect(root.textContent).toContain('絲嘉蕾 的行動');
    q('#sl-cmd-attack')!.click();
    q('[data-target="e1"]')!.click();
    expect(root.textContent).toContain('千鶴 的行動');
    q('#sl-cmd-back')!.click();
    expect(root.textContent).toContain('絲嘉蕾 的行動');
    for (let i = 0; i < 5; i++) q('#sl-cmd-defend')!.click();
    expect(submit.mock.calls[0][0].scarlet).toEqual({ kind: 'defend' });
  });
  it('skips the target step when one enemy is left', () => {
    const { q, submit } = setup(['slime']);
    q('#sl-cmd-attack')!.click();
    for (let i = 0; i < 4; i++) q('#sl-cmd-defend')!.click();
    expect(submit.mock.calls[0][0].scarlet).toEqual({ kind: 'attack', target: 'e0' });
  });
  it('disables skills the member cannot afford', () => {
    const { q, state, menu, root } = setup();
    state.party[0].tp = 0;
    menu.show(state);
    q('#sl-cmd-skill')!.click();
    const skill = root.querySelector<HTMLButtonElement>('[data-skill="provoke"]')!;
    expect(skill.disabled).toBe(true);
  });
  it('picks an ally for healing skills', () => {
    const { q, submit, root } = setup();
    for (let i = 0; i < 4; i++) q('#sl-cmd-defend')!.click();
    q('#sl-cmd-skill')!.click();
    root.querySelector<HTMLButtonElement>('[data-skill="moonlight"]')!.click();
    q('[data-target="scarlet"]')!.click();
    expect(submit.mock.calls[0][0].selene).toEqual({ kind: 'skill', skill: 'moonlight', target: 'scarlet' });
  });
  it('disables escape against the boss', () => {
    const { q } = setup(['lanterneater'], true);
    expect(q('#sl-cmd-escape')!.disabled).toBe(true);
  });
  it('skips sleeping members', () => {
    const { q, state, menu, submit } = setup();
    state.party[0].sleep = 2;
    menu.show(state);
    q('#sl-auto')!.click();
    expect(submit.mock.calls[0][0].scarlet).toBeUndefined();
  });
  it('shows the result and continues', () => {
    const { root, menu, state } = setup();
    const done = vi.fn();
    menu.showResult({ outcome: 'win', exp: 12, gold: 9, drops: { moss: 1 }, levelUps: [{ id: 'noel', levels: 1, learned: ['ice-star'] }] }, state, done);
    expect(root.querySelector('#sl-result')!.textContent).toContain('勝利');
    expect(root.textContent).toContain('發光苔 ×1');
    expect(root.textContent).toContain('諾艾兒 學會了「冰之星彈」');
    (root.querySelector('#sl-continue') as HTMLButtonElement).click();
    expect(done).toHaveBeenCalled();
  });
});
