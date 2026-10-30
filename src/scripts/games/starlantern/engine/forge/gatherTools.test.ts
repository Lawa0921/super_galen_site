import { describe, expect, it } from 'vitest';
import { TOOL_LEVELS } from '../../data/gather';
import { newGame, type GameState } from '../state';
import { loadGame, saveGame } from '../save';
import { memoryStorage } from '../testing';
import { craftTool, toolCost } from './gatherTools';

/** Gathering plan Task A4 (spec §6.3, §11 item 4): the gathering tools, made once each at the forge, drawing nothing. */
const stocked = (): GameState => {
  const s = newGame();
  s.gold = 10_000;
  s.inventory = { 'copper-ore': 20, 'quartz-chip': 20, 'silver-ore': 20, 'deep-quartz': 20, 'ember-glass': 20, 'scrap-iron': 20, moss: 3 };
  return s;
};

describe('gathering tools (gathering plan Task A4)', () => {
  it('the first tool', () => {
    const s = stocked();
    const before = structuredClone(s);
    expect(toolCost(1)).toEqual(TOOL_LEVELS[0].cost);
    const r = craftTool(s, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.out).toEqual({ level: 1 });
    expect(r.state.gather).toEqual({ tool: 1, got: {} });
    expect(r.state.gold).toBe(s.gold - 150);
    expect(r.state.inventory['copper-ore']).toBe(14);
    expect(r.state.inventory['quartz-chip']).toBe(18);
    expect(r.state.forgeDraws).toBe(s.forgeDraws);
    expect(r.state.sold).toEqual(s.sold);
    expect(s).toEqual(before);   // pure
    // what was gathered before stays counted
    const had = stocked();
    had.gather = { got: { 'copper-ore': 9 } };
    const r2 = craftTool(had, 1);
    expect(r2.ok && r2.state.gather).toEqual({ tool: 1, got: { 'copper-ore': 9 } });
  });

  it('the second needs the first and two lands', () => {
    expect(craftTool(stocked(), 2)).toEqual({ ok: false, reason: 'invalid' });
    const one = stocked();
    one.gather = { tool: 1, got: {} };
    const r = craftTool(one, 2);
    expect(r.ok && r.state.gather).toEqual({ tool: 2, got: {} });
    expect(r.ok && r.state.inventory).toMatchObject({ 'silver-ore': 14, 'deep-quartz': 18, 'ember-glass': 18, 'scrap-iron': 18 });
    expect(r.ok && r.state.gold).toBe(one.gold - 600);
    // without the blaze land's spot: short
    const noBlaze = structuredClone(one);
    delete noBlaze.inventory['ember-glass'];
    expect(craftTool(noBlaze, 2)).toEqual({ ok: false, reason: 'mats' });
  });

  it('a tool is made once', () => {
    const one = stocked();
    one.gather = { tool: 1, got: {} };
    expect(craftTool(one, 1)).toEqual({ ok: false, reason: 'invalid' });
    const two = stocked();
    two.gather = { tool: 2, got: {} };
    expect(craftTool(two, 1)).toEqual({ ok: false, reason: 'invalid' });
    expect(craftTool(two, 2)).toEqual({ ok: false, reason: 'invalid' });
    for (const bad of [0, 3, 1.5, '1'] as unknown as (1 | 2)[]) expect(craftTool(stocked(), bad)).toEqual({ ok: false, reason: 'invalid' });
    // the tool goes through the save as it is
    const r = craftTool(stocked(), 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const mem = memoryStorage();
    expect(saveGame(mem, r.state)).toBe(true);
    const back = loadGame(mem);
    expect(back.status === 'ok' && back.state.gather).toEqual({ tool: 1, got: {} });
  });

  it('short of goods', () => {
    const poor = stocked();
    poor.gold = 149;
    const before = structuredClone(poor);
    expect(craftTool(poor, 1)).toEqual({ ok: false, reason: 'gold' });
    expect(poor).toEqual(before);
    const bare = stocked();
    bare.inventory['quartz-chip'] = 1;
    expect(craftTool(bare, 1)).toEqual({ ok: false, reason: 'mats' });
  });
});
