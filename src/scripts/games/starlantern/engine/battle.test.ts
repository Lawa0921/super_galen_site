import { describe, it, expect } from 'vitest';
import { createBattle, escapeChance, resolveRound, rewards, turnOrder, writeBack } from './battle';
import { newParty } from './party';
import { constRng, makeBattle, makeCombatant } from './testing';

const rng = constRng(0.5); // enemies never use skills (all chances < 0.5), variance 1.0
const P = (key: string, over = {}) => makeCombatant({ key, side: 'party', ...over });
const E = (key: string, over = {}) => makeCombatant({ key, side: 'enemy', ...over });

describe('createBattle', () => {
  it('builds rows from the formation and letters duplicate enemies', () => {
    const party = newParty();
    party.roster.liz.hp = 0;
    const s = createBattle({ party, enemyIds: ['slime', 'slime', 'bat'], inventory: { potion: 2 }, revealed: {} });
    expect(s.party.map((c) => [c.key, c.row])).toEqual([
      ['scarlet', 'front'], ['chizuru', 'front'], ['liz', 'front'], ['noel', 'back'], ['selene', 'back'],
    ]);
    expect(s.party.find((c) => c.key === 'liz')!.alive).toBe(false);
    expect(s.enemies.map((e) => [e.key, e.name])).toEqual([['e0', '苔蘚史萊姆 A'], ['e1', '苔蘚史萊姆 B'], ['e2', '遺跡蝙蝠']]);
    expect(s.outcome).toBe('ongoing');
  });
});

describe('turnOrder', () => {
  it('sorts by speed and keeps input order on ties', () => {
    const order = turnOrder([P('slow', { max: { spd: 5 } as never }), E('e0'), P('fast', { max: { spd: 30 } as never }), P('tie')], rng);
    expect(order.map((c) => c.key)).toEqual(['fast', 'e0', 'tie', 'slow']);
  });
});

describe('resolveRound', () => {
  it('does not mutate the previous state and logs only this round', () => {
    const prev = makeBattle([P('p')], [E('e0')]);
    const next = resolveRound(prev, { p: { kind: 'attack', target: 'e0' } }, rng);
    expect(prev.enemies[0].hp).toBe(100);
    expect(next.enemies[0].hp).toBe(80);
    expect(next.round).toBe(1);
  });
  it('wins when the last enemy falls, before it can act', () => {
    const s = resolveRound(makeBattle([P('p')], [E('e0', { hp: 1 })]), { p: { kind: 'attack', target: 'e0' } }, rng);
    expect(s.outcome).toBe('win');
    expect(s.party[0].hp).toBe(100);
  });
  it('loses when the party falls', () => {
    const s = resolveRound(makeBattle([P('p', { hp: 5 })], [E('e0', { max: { spd: 20 } as never })]), { p: { kind: 'defend' } }, rng);
    expect(s.outcome).toBe('lose');
  });
  it('halves enemy damage on a defending member', () => {
    const s = resolveRound(makeBattle([P('p')], [E('e0')]), { p: { kind: 'defend' } }, rng);
    expect(s.party[0].hp).toBe(90);
  });
  it('retargets when the chosen enemy is already down', () => {
    const s = resolveRound(makeBattle([P('p')], [E('e0', { hp: 0, alive: false }), E('e1', { sleep: 3 })]), { p: { kind: 'attack', target: 'e0' } }, rng);
    expect(s.enemies[1].hp).toBe(80);
  });
  it('refuses a skill without enough TP', () => {
    const s = resolveRound(makeBattle([P('p', { tp: 0 })], [E('e0', { sleep: 3 })]), { p: { kind: 'skill', skill: 'twin-slash', target: 'e0' } }, rng);
    expect(s.log).toContainEqual({ type: 'no-tp', actor: 'p' });
    expect(s.enemies[0].hp).toBe(100);
  });
  it('spends TP and the HP cost of skills', () => {
    // the faster sleeper skips its turn first, so the hit that wakes it lands after it would have acted
    const s = resolveRound(makeBattle([P('p')], [E('e0', { sleep: 3, max: { spd: 20 } as never })]), { p: { kind: 'skill', skill: 'flame-burst', target: 'e0' } }, rng);
    expect(s.party[0].tp).toBe(17);
    expect(s.party[0].hp).toBe(85);
  });
  it('skips sleeping actors, and damage wakes them', () => {
    const asleep = resolveRound(makeBattle([P('p')], [E('e0', { sleep: 2 })]), { p: { kind: 'defend' } }, rng);
    expect(asleep.log).toContainEqual({ type: 'asleep', actor: 'e0' });
    expect(asleep.enemies[0].sleep).toBe(1);
    expect(asleep.party[0].hp).toBe(100);
    const woken = resolveRound(makeBattle([P('p')], [E('e0', { sleep: 2 })]), { p: { kind: 'attack', target: 'e0' } }, rng);
    expect(woken.party[0].hp).toBe(80);
  });
  it('ticks poison at round end', () => {
    const s = resolveRound(makeBattle([P('p', { poison: true })], [E('e0', { sleep: 3 })]), { p: { kind: 'defend' } }, rng);
    expect(s.party[0].hp).toBe(90);
    expect(s.log).toContainEqual({ type: 'poison-tick', target: 'p', amount: 10 });
  });
  it('expires buffs and fires turrets at round end', () => {
    const s = resolveRound(
      makeBattle([P('p', { buffs: [{ stat: 'atk', pct: 50, turns: 1 }], turret: { power: 100, turns: 1 } })], [E('e0', { sleep: 3 })]),
      { p: { kind: 'defend' } }, rng,
    );
    expect(s.party[0].buffs).toEqual([]);
    expect(s.party[0].turret).toBeNull();
    expect(s.enemies[0].hp).toBe(80);
  });
  it('consumes items and ignores empty stock', () => {
    const used = resolveRound(makeBattle([P('p', { hp: 50 })], [E('e0', { sleep: 3 })], { inventory: { potion: 1 } }), { p: { kind: 'item', item: 'potion', target: 'p' } }, rng);
    expect([used.party[0].hp, used.inventory.potion]).toEqual([100, 0]);
    const empty = resolveRound(used, { p: { kind: 'item', item: 'potion', target: 'p' } }, rng);
    expect(empty.inventory.potion).toBe(0);
  });
  it('sends single-target enemy attacks at a taunting member', () => {
    const s = resolveRound(makeBattle([P('p1', { taunt: 2 }), P('p2')], [E('e0')]), { p1: { kind: 'defend' }, p2: { kind: 'defend' } }, rng);
    expect(s.party[0].hp).toBe(90);
    expect(s.party[1].hp).toBe(100);
  });
  it('makes a taunt cast this round pull the slower enemy at once', () => {
    const s = resolveRound(
      makeBattle([P('p1', { max: { spd: 20 } as never }), P('p2', { max: { spd: 20 } as never })], [E('e0')]),
      { p1: { kind: 'skill', skill: 'provoke' }, p2: { kind: 'defend' } }, rng,
    );
    expect(s.party[0].hp).toBe(80);
    expect(s.party[1].hp).toBe(100);
  });
  it('flees on a good roll but never from a boss', () => {
    const fled = resolveRound(makeBattle([P('p')], [E('e0')]), { p: { kind: 'escape' } }, constRng(0.1));
    expect(fled.outcome).toBe('fled');
    const boss = resolveRound(makeBattle([P('p')], [E('e0')], { boss: true }), { p: { kind: 'escape' } }, constRng(0.1));
    expect(boss.outcome).toBe('ongoing');
    expect(boss.log[0]).toEqual({ type: 'escape', success: false });
  });
  it('clamps escape chance', () => {
    expect(escapeChance(makeBattle([P('p', { max: { spd: 1 } as never })], [E('e0', { max: { spd: 999 } as never })]))).toBe(0.1);
  });
});

describe('after battle', () => {
  it('sums rewards and rolls drops, doubled by dropBoost', () => {
    const s = makeBattle([P('p')], [E('e0', { defId: 'slime' }), E('e1', { defId: 'bat' })]);
    expect(rewards(s, constRng(0), false)).toEqual({ exp: 9, gold: 9, drops: { moss: 1, 'bat-wing': 1 } });
    expect(rewards(s, constRng(0.99), false).drops).toEqual({});
    expect(rewards(s, constRng(0.7), false).drops).toEqual({});
    expect(rewards(s, constRng(0.7), true).drops).toEqual({ moss: 1, 'bat-wing': 1 });
  });
  it('writes HP and TP back to the roster', () => {
    const party = newParty();
    const s = createBattle({ party, enemyIds: ['slime'], inventory: {}, revealed: {} });
    s.party[0].hp = 7; s.party[0].tp = 1;
    const p = writeBack(party, s);
    expect([p.roster.scarlet.hp, p.roster.scarlet.tp]).toEqual([7, 1]);
    expect(party.roster.scarlet.hp).toBe(48);
  });
});
