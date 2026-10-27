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

describe('foe words (roster plan B7–B11)', () => {
  const W = T.battle.foe.word;

  it('a turning weakness shows the weakness now; an adaptation shows its element while it lasts', () => {
    const s = makeBattle([P('scarlet')], [E('e0', { prism: true, weak: ['ice'] }), E('e1', { adapted: { el: 'fire', turns: 2 } }), E('e2', { adapted: { el: 'fire', turns: 0 } })]);
    expect(texts(foeWords(s, s.enemies[0]))).toEqual([W.weak(T.element.ice)]);
    expect(texts(foeWords(s, s.enemies[1]))).toEqual([W.adapted(T.element.fire)]);
    expect(texts(foeWords(s, s.enemies[2]))).toEqual([]);
    expect([W.weak('冰'), W.adapted('火')]).toEqual(['弱冰', '抗火']);
  });

  it('a body behind its parts, a TP thief, a foe in ice, a banner, a maw holding someone', () => {
    const s = makeBattle([P('scarlet', { engulfed: 'e4' })], [E('e0', { cut: 50 }), E('e1', { drained: 30 }), E('e2', { encased: true }), E('e3', { defId: 'banner-bearer' }),
      E('e4', { gulp: { key: 'scarlet', until: 2, taken: 0 } })]);
    expect(texts(foeWords(s, s.enemies[0]))).toEqual([W.cut]);
    expect(texts(foeWords(s, s.enemies[1]))).toEqual([W.drained(30)]);
    expect(texts(foeWords(s, s.enemies[2]))).toEqual([W.encased]);
    expect(texts(foeWords(s, s.enemies[3]))).toEqual([W.rally]);
    expect(ENEMIES['banner-bearer'].rally).toBeDefined();
    expect(texts(foeWords(s, s.enemies[4]))).toEqual([W.holding]);
    expect(texts(memberWords(s, s.party[0]))).toContain(W.engulfed);
  });
});
