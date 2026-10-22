import { describe, expect, it } from 'vitest';
import { intentLabel, planEnemies, resolveRound } from './battle';
import { reachable, shapeTargets } from './formation';
import { constRng, makeBattle, makeCombatant } from './testing';
import type { Combatant } from './combatant';

/** A party member standing in grid cell `cell` (0-2 front, 3-5 middle, 6-8 back). */
const at = (key: string, cell: number, extra: Partial<Combatant> = {}) =>
  makeCombatant({ key, side: 'party', cell, row: (['front', 'middle', 'back'] as const)[Math.floor(cell / 3)], ...extra });

describe('reachable', () => {
  const party = [at('a', 0), at('b', 4), at('c', 8)];
  it('lets melee reach only the frontmost row that still has someone standing', () => {
    expect(reachable(party, true).map((c) => c.key)).toEqual(['a']);
    expect(reachable([at('a', 0, { alive: false, hp: 0 }), at('b', 4), at('c', 5), at('d', 8)], true).map((c) => c.key)).toEqual(['b', 'c']);
    expect(reachable([at('c', 8)], true).map((c) => c.key)).toEqual(['c']);
  });
  it('lets ranged and magic reach anyone alive', () => {
    expect(reachable(party, false).map((c) => c.key)).toEqual(['a', 'b', 'c']);
  });
});

describe('shapeTargets', () => {
  // a b c / d e f / g h i, all nine filled to show each shape
  const keys = 'abcdefghi'.split('');
  const full = keys.map((k, i) => at(k, i));
  const hit = (shape: Parameters<typeof shapeTargets>[2], primary: string) =>
    shapeTargets(full, full.find((c) => c.key === primary)!, shape).map((c) => c.key).sort();
  it('hits a whole row, a whole column, or a cross around the primary target', () => {
    expect(hit('row', 'e')).toEqual(['d', 'e', 'f']);
    expect(hit('column', 'b')).toEqual(['b', 'e', 'h']);
    expect(hit('cross', 'e')).toEqual(['b', 'd', 'e', 'f', 'h']);
    expect(hit('cross', 'a')).toEqual(['a', 'b', 'd']);
  });
  it('skips the fallen', () => {
    const party = [at('a', 0), at('b', 1, { alive: false, hp: 0 }), at('c', 2)];
    expect(shapeTargets(party, party[0], 'row').map((c) => c.key)).toEqual(['a', 'c']);
  });
});

describe('enemy targeting in a round', () => {
  it('a taunting member draws melee even from a row melee could not reach', () => {
    for (const r of [0, 0.3, 0.6, 0.99]) {
      const s = makeBattle([at('front', 1), at('tank', 4, { taunt: 2 })], [makeCombatant({ key: 'e0', side: 'enemy', defId: 'bat' })]);
      const out = resolveRound(s, { front: { kind: 'defend' }, tank: { kind: 'defend' } }, constRng(r));
      const hits = out.log.filter((e) => e.type === 'damage').map((e) => (e as { target: string }).target);
      expect(hits).toEqual(['tank']);
    }
  });

  it('a row attack from a melee enemy hits the whole frontmost row and nobody behind it', () => {
    // 洞窟蜥蜴's 甩尾 is a melee row attack; rng 0 makes it pick the skill
    const s = makeBattle([at('a', 0), at('b', 2), at('c', 4)], [makeCombatant({ key: 'e0', side: 'enemy', defId: 'lizard' })]);
    const out = resolveRound(s, { a: { kind: 'defend' }, b: { kind: 'defend' }, c: { kind: 'defend' } }, constRng(0));
    const hits = out.log.filter((e) => e.type === 'damage').map((e) => (e as { target: string }).target).sort();
    expect(hits).toEqual(['a', 'b']);
  });

  it('a melee enemy never strikes the back row while the front row stands', () => {
    for (const r of [0, 0.3, 0.6, 0.99]) {
      const s = makeBattle([at('front', 1), at('back', 7)], [makeCombatant({ key: 'e0', side: 'enemy', defId: 'bat' })]);
      const out = resolveRound(s, { front: { kind: 'defend' }, back: { kind: 'defend' } }, constRng(r));
      const hits = out.log.filter((e) => e.type === 'damage').map((e) => (e as { target: string }).target);
      expect(hits.every((k) => k === 'front')).toBe(true);
    }
  });
});

describe('enemy intents', () => {
  it('are planned before the player chooses, and the round carries them out', () => {
    const s = makeBattle([at('a', 0), at('b', 1)], [makeCombatant({ key: 'e0', side: 'enemy', defId: 'bat' })]);
    planEnemies(s, constRng(0.5));
    const intent = s.intents!.e0;
    expect(intent.kind).toBe('attack');
    const out = resolveRound(s, { a: { kind: 'defend' }, b: { kind: 'defend' } }, constRng(0.01));
    const hit = out.log.find((e) => e.type === 'damage') as { target: string } | undefined;
    expect(hit?.target).toBe(intent.target);
  });

  it('plans the next round as the last one ends', () => {
    const s = makeBattle([at('a', 0)], [makeCombatant({ key: 'e0', side: 'enemy', defId: 'bat' })]);
    planEnemies(s, constRng(0.5));
    const out = resolveRound(s, { a: { kind: 'defend' } }, constRng(0.5));
    expect(out.intents?.e0).toBeDefined();
  });

  it('describes an intent for the player', () => {
    const s = makeBattle([at('a', 0)], [makeCombatant({ key: 'e0', side: 'enemy', defId: 'lizard' })]);
    planEnemies(s, constRng(0));   // rng 0: the first skill fires
    expect(intentLabel(s, 'e0')).toContain('甩尾');
  });
});
