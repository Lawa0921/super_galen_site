import { describe, it, expect } from 'vitest';
import { newMember } from '../party';
import { chainLength } from '../../data/story/chains';
import { COMPANIONS, GIFTABLE, GIFT_TASTE, type Companion } from '../../data/story/bond';
import type { BondRecord, Member } from '../types';
import { bondOf, bondPoints, bondTier, giftPoints, tasteOf, tierAt } from './bond';

/** A member of `id` with `memories` pieces held and `bond` as her record. */
const who = (id: Member['id'], memories = 0, bond?: BondRecord): Member => ({ ...newMember(id), memories, ...(bond ? { bond } : {}) });
/** A record with only gifts. */
const gifts = (g: BondRecord['gifts']): BondRecord => ({ talk: 0, field: 0, gifts: g });
/** Gifts worth exactly the gift cap of 30: her first loved material, 24 times (4 × 2 + 22 × 1). */
const fullGifts = (c: Companion): BondRecord['gifts'] => ({ [GIFT_TASTE[c].loved[0]]: 24 });

describe('bond score', () => {
  it('bondTier thresholds', () => {
    const want: [number, number][] = [[0, 0], [19, 0], [20, 1], [39, 1], [40, 2], [59, 2], [60, 3], [84, 3], [85, 4], [100, 4]];
    for (const [points, tier] of want) expect(tierAt(points)).toBe(tier);
  });

  it('the hero has no bond', () => {
    expect(bondPoints(newMember('hero'))).toBe(0);
    expect(bondTier(newMember('hero'))).toBe(0);
    // Even a record forced onto him counts for nothing (the save refuses it, bond plan Task 2).
    const forced = who('hero', 5, { talk: 12, field: 40, gifts: { moss: 9 } });
    expect(bondPoints(forced)).toBe(0);
    expect(giftPoints(forced)).toBe(0);
  });

  it('Rin starts at ten', () => {
    expect(bondPoints(newMember('rin'))).toBe(10);
    expect(bondOf(newMember('rin'))).toEqual({ talk: 0, field: 0, gifts: {} });
    expect(bondPoints(who('rin', 3))).toBe(19);
    expect(bondTier(who('rin', 3))).toBe(0);
  });

  it('bondPoints follows the formula', () => {
    // 10 + 3 × 3 + 7 + (dusk-cloth loved ×3 = 4 + 4 + 1, star-tear liked ×1 = 2) + 13 = 50.
    const rin = who('rin', 3, { talk: 7, field: 13, gifts: { 'dusk-cloth': 3, 'star-tear': 1 } });
    expect(giftPoints(rin)).toBe(11);
    expect(bondPoints(rin)).toBe(50);
    expect(bondTier(rin)).toBe(2);
    // Each field is cut at its own cap.
    expect(bondPoints(who('rin', 0, { talk: 20, field: 0, gifts: {} }))).toBe(10 + 12);
    expect(bondPoints(who('rin', 0, { talk: 0, field: 99, gifts: {} }))).toBe(10 + 40);
    const many = who('selene', 0, gifts({ 'star-tear': 40 }));
    expect(giftPoints(many)).toBe(4 + 4 + 38);
    expect(bondPoints(many)).toBe(10 + 30);
    // Held pieces past her chain count as her chain.
    expect(bondPoints(who('selene', 99))).toBe(10 + 3 * chainLength('selene'));
    // The sum is cut at 100.
    expect(bondPoints(who('rin', 7, { talk: 12, field: 40, gifts: fullGifts('rin') }))).toBe(100);
  });

  it('bond caps keep every single source and every pair below 心契', () => {
    for (const c of ['rin', 'selene'] as const) {
      const sources: Record<'memory' | 'talk' | 'gift' | 'field', { memories: number; bond: BondRecord }> = {
        memory: { memories: chainLength(c), bond: { talk: 0, field: 0, gifts: {} } },
        talk: { memories: 0, bond: { talk: 12, field: 0, gifts: {} } },
        gift: { memories: 0, bond: gifts(fullGifts(c)) },
        field: { memories: 0, bond: { talk: 0, field: 40, gifts: {} } },
      };
      const keys = Object.keys(sources) as (keyof typeof sources)[];
      const merge = (ks: (keyof typeof sources)[]): Member => who(c, Math.max(0, ...ks.map((k) => sources[k].memories)), {
        talk: Math.max(0, ...ks.map((k) => sources[k].bond.talk)),
        field: Math.max(0, ...ks.map((k) => sources[k].bond.field)),
        gifts: Object.assign({}, ...ks.map((k) => sources[k].bond.gifts)),
      });
      for (const k of keys) expect(bondTier(merge([k])), `${c}: ${k} alone`).toBeLessThanOrEqual(2);
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
        expect(bondPoints(merge([keys[i], keys[j]])), `${c}: ${keys[i]} + ${keys[j]}`).toBeLessThan(85);
      }
      expect(bondPoints(merge(keys))).toBe(100);
      expect(bondTier(merge(keys))).toBe(4);
    }
  });

  it('gift repeats fall to one', () => {
    for (const [n, points] of [[1, 4], [2, 8], [3, 9], [4, 10]] as const) expect(giftPoints(who('rin', 0, gifts({ 'dusk-cloth': n })))).toBe(points);
    expect(giftPoints(who('rin', 0, gifts({ moss: 3 })))).toBe(3);
    expect(giftPoints(who('rin', 0, gifts({ 'star-tear': 3 })))).toBe(2 + 2 + 1);
    // A healed taste is the one the record reads: Selene's old coins are liked.
    expect(giftPoints(who('selene', 5, gifts({ 'old-coin': 2 })))).toBe(4);
  });

  it('a gift already taken never changes value', () => {
    for (const c of COMPANIONS) for (const mat of GIFTABLE) {
      const before = tasteOf(c, mat, false);
      if (before === 'declined') continue;
      expect(tasteOf(c, mat, true), `${c} ${mat}`).toBe(before);
    }
  });

  it('tasteOf reads the table and the healing', () => {
    expect(tasteOf('rin', 'dusk-cloth', false)).toBe('loved');
    expect(tasteOf('rin', 'shade-crystal', false)).toBe('liked');
    expect(tasteOf('rin', 'moss', false)).toBe('neutral');
    expect(tasteOf('rin', 'king-scale', false)).toBe('declined');
    expect(tasteOf('rin', 'king-scale', true)).toBe('declined');
    expect(tasteOf('selene', 'old-coin', false)).toBe('declined');
    expect(tasteOf('selene', 'old-coin', true)).toBe('liked');
    expect(tasteOf('sylvie', 'mire-gland', true)).toBe('neutral');
    expect(tasteOf('chizuru', 'frost-heart', true)).toBe('declined');
    expect(tasteOf('rin', 'essence-common', false)).toBeNull();
    expect(tasteOf('rin', 'potion', false)).toBeNull();
  });
});
