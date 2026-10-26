import { describe, expect, it } from 'vitest';
import { foeWords, memberWords } from './index';
import { makeBattle, makeCombatant } from '../testing';
import { ENEMIES } from '../../data/enemies';
import { T } from '../../data/text.zh-TW';
import type { Combatant } from '../combatant';

/** Roster plan B6: the words over a foe and under a member for the roster's foe mechanics. */
const P = (key: string, over: Partial<Combatant> = {}) => makeCombatant({ key, side: 'party', ...over });
const E = (key: string, over: Partial<Combatant> = {}) => makeCombatant({ key, side: 'enemy', ...over });
const texts = (ws: { text: string }[]) => ws.map((w) => w.text);

describe('foe words (roster plan B6)', () => {
  it('a foe winding up says so', () => {
    const s = makeBattle([P('scarlet')], [E('e0', { winding: 0 })]);
    expect(texts(foeWords(s, s.enemies[0]))).toEqual([T.battle.foe.word.winding]);
  });

  it('a guard says it guards, and the one it guards says so', () => {
    const s = makeBattle([P('scarlet')], [E('e0', { cover: { ally: 'e1', turns: 2 } }), E('e1')]);
    expect(texts(foeWords(s, s.enemies[0]))).toEqual([T.battle.foe.word.guarding]);
    expect(texts(foeWords(s, s.enemies[1]))).toEqual([T.battle.foe.word.guarded]);
    // A sleeping guard guards no one, and the words say so.
    s.enemies[0].sleep = 2;
    expect(texts(foeWords(s, s.enemies[1]))).toEqual([]);
  });

  it('a thief shows what it took', () => {
    const s = makeBattle([P('scarlet')], [E('e0', { stolen: 15 })]);
    expect(texts(foeWords(s, s.enemies[0]))).toEqual([T.battle.foe.word.stolen(15)]);
    expect(T.battle.foe.word.stolen(15)).toBe('偷走 15 金');
  });

  it('a pair that shares its wounds says so while both stand', () => {
    const s = makeBattle([P('scarlet')], [E('e0', { share: 'e1' }), E('e1', { share: 'e0' })]);
    expect(texts(foeWords(s, s.enemies[0]))).toEqual([T.battle.foe.word.shared]);
    s.enemies[1].alive = false;
    expect(texts(foeWords(s, s.enemies[0]))).toEqual([]);
  });

  it('a foe that will run counts its rounds down', () => {
    const s = makeBattle([P('scarlet')], [E('e0')], { round: 1, enemyDefs: { e0: { ...ENEMIES.slime, fleeAfter: 3 } } });
    expect(texts(foeWords(s, s.enemies[0]))).toEqual([T.battle.foe.word.flee(2)]);
  });

  it('the old roster shows no new word', () => {
    const s = makeBattle([P('scarlet')], [E('e0'), E('e1')]);
    for (const e of s.enemies) expect(foeWords(s, e)).toEqual([]);
    for (const c of s.party) expect(memberWords(s, c)).toEqual([]);
  });
});

describe('member words (roster plan B6)', () => {
  it('a member called out wears it until her round is over', () => {
    const s = makeBattle([P('scarlet', { hunted: 2 }), P('noel')], [E('e0')], { round: 1 });
    expect(texts(memberWords(s, s.party[0]))).toEqual([T.battle.foe.word.hunted]);
    expect(texts(memberWords(s, s.party[1]))).toEqual([]);
  });
});
