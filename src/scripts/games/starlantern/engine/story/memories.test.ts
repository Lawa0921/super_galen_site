import { describe, it, expect } from 'vitest';
import { CHARACTER_IDS } from '../../data/characters';
import { CHAINS, ELITE_PIECE_CHANCE, MEMORY_PITY } from '../../data/story/chains';
import type { CharacterId, Party } from '../types';
import { meet, newParty } from '../party';
import { memoriesOf } from '../progression';
import { mulberry32 } from '../rng';
import { MAX_PITY, applyPieces, eligible, forcedGlimmers, nextPiece, pieceDrops, pityAfterFloor, type PieceCtx } from './memories';

/** A party where exactly `held` are met (plus the hero), each holding the given number of pieces. */
const partyOf = (held: Partial<Record<CharacterId, number>>): Party => {
  let p = newParty(['hero']);
  for (const id of Object.keys(held) as CharacterId[]) if (id !== 'hero') p = meet(p, id, 1);
  const roster = { ...p.roster };
  for (const [id, n] of Object.entries(held) as [CharacterId, number][]) roster[id] = { ...roster[id], memories: n };
  return { ...p, roster };
};
const bossCtx = (depth: number, region: PieceCtx['region'] = 'mainline'): PieceCtx => ({ region, depth, source: 'boss' });
const eliteCtx = (depth: number, region: PieceCtx['region'] = 'mainline'): PieceCtx => ({ region, depth, source: 'elite' });

describe('memory piece rules', () => {
  it('only the next piece of a met companion', () => {
    const unmet = partyOf({});
    expect(eligible(unmet, 'sylvie', bossCtx(1, 'mire'))).toBe(false);
    const met = partyOf({ sylvie: 0 });
    expect(eligible(met, 'sylvie', bossCtx(1, 'mire'))).toBe(true);
    expect(eligible(met, 'sylvie', bossCtx(1, 'blaze'))).toBe(false);
    const three = partyOf({ sylvie: 3 });
    expect(eligible(three, 'sylvie', bossCtx(5, 'mire'))).toBe(false);
    expect(eligible(three, 'sylvie', bossCtx(6, 'mire'))).toBe(true);
    expect(nextPiece(three, 'sylvie')).toBe(4);
    expect(nextPiece(partyOf({ sylvie: 5 }), 'sylvie')).toBeNull();
    expect(eligible(partyOf({ sylvie: 5 }), 'sylvie', bossCtx(30, 'mire'))).toBe(false);
  });

  it("the hero's pieces wait for their depth on the main road", () => {
    const p = partyOf({ hero: 0 });
    expect(eligible(p, 'hero', bossCtx(3))).toBe(false);
    expect(eligible(p, 'hero', bossCtx(4))).toBe(true);
    expect(eligible(p, 'hero', bossCtx(10, 'blaze'))).toBe(false);
  });

  it('boss-only pieces need a boss', () => {
    const p = partyOf({ hero: 8 });
    expect(eligible(p, 'hero', eliteCtx(26))).toBe(false);
    expect(eligible(p, 'hero', { region: 'mainline', depth: 26, source: 'glimmer' })).toBe(false);
    expect(eligible(p, 'hero', bossCtx(26))).toBe(true);
  });

  it('the story chains come first, then the longest wait', () => {
    const p = partyOf({ hero: 0, rin: 0, selene: 0 });
    const ctx = bossCtx(10);
    expect(pieceDrops(p, { hero: 1, rin: 1, selene: 5 }, ctx, mulberry32(1))).toEqual(['rin']);
    expect(pieceDrops(p, { hero: 2, rin: 1 }, ctx, mulberry32(1))).toEqual(['hero']);

    const two = partyOf({ hero: 10, rin: 7, selene: 0, chizuru: 0 });
    const seen = new Set<CharacterId>();
    for (let seed = 1; seed <= 50; seed++) {
      const a = pieceDrops(two, {}, ctx, mulberry32(seed));
      expect(a).toEqual(pieceDrops(two, {}, ctx, mulberry32(seed)));
      expect(['selene', 'chizuru']).toContain(a[0]);
      seen.add(a[0]);
    }
    expect([...seen].sort()).toEqual(['chizuru', 'selene']);
  });

  it('one piece per boss', () => {
    const p = partyOf({ hero: 0, rin: 0, selene: 0, chizuru: 0 });
    for (let seed = 1; seed <= 20; seed++) expect(pieceDrops(p, {}, bossCtx(10), mulberry32(seed))).toHaveLength(1);
  });

  it('the depth-25 and depth-30 bosses top the hero up', () => {
    expect(pieceDrops(partyOf({ hero: 5 }), {}, bossCtx(25), mulberry32(1))).toEqual(['hero', 'hero', 'hero', 'hero']);
    expect(pieceDrops(partyOf({ hero: 9 }), {}, bossCtx(30), mulberry32(1))).toEqual(['hero']);
    expect(pieceDrops(partyOf({ hero: 2 }), {}, bossCtx(30), mulberry32(1))).toHaveLength(8);
    expect(pieceDrops(partyOf({ hero: 8 }), {}, eliteCtx(26), () => 0)).not.toContain('hero');
  });

  it('an elite always pays the hero and the rest by chance', () => {
    const heroOnly = partyOf({ hero: 0, rin: 7 });
    for (let seed = 1; seed <= 30; seed++) expect(pieceDrops(heroOnly, {}, eliteCtx(10), mulberry32(seed))).toEqual(['hero']);
    const selene = partyOf({ hero: 10, rin: 7, selene: 0 });
    let paid = 0;
    const N = 1000;
    for (let seed = 1; seed <= N; seed++) paid += pieceDrops(selene, {}, eliteCtx(10), mulberry32(seed)).length;
    expect(Math.abs(paid / N - ELITE_PIECE_CHANCE)).toBeLessThanOrEqual(0.05);
  });

  it("a forced glimmer holds its own chain's piece", () => {
    const g: PieceCtx = { region: 'storm', depth: 1, source: 'glimmer', who: 'noel' };
    expect(pieceDrops(partyOf({ noel: 0 }), {}, g, mulberry32(1))).toEqual(['noel']);
    expect(pieceDrops(partyOf({ noel: 5 }), {}, g, mulberry32(1))).toEqual([]);
    expect(pieceDrops(partyOf({}), {}, g, mulberry32(1))).toEqual([]);
  });

  it('no candidates drops nothing', () => {
    expect(pieceDrops(partyOf({ hero: 10, rin: 7 }), {}, bossCtx(10), mulberry32(1))).toEqual([]);
  });

  it('pity grows on floors cleared without a piece and resets on one', () => {
    const p = partyOf({ selene: 0, chizuru: 0, noel: 0 });
    const next = pityAfterFloor(p, { selene: 2, chizuru: 1 }, 'mainline', 3, ['selene']);
    expect(next.selene).toBe(0);
    expect(next.chizuru).toBe(2);
    expect(next.noel).toBeUndefined();
    const before = { selene: 2 };
    pityAfterFloor(p, before, 'mainline', 3, []);
    expect(before).toEqual({ selene: 2 });
  });

  it('pity stops at MAX_PITY', () => {
    const p = partyOf({ selene: 0 });
    expect(pityAfterFloor(p, { selene: MAX_PITY }, 'mainline', 3, []).selene).toBe(MAX_PITY);
    expect(MAX_PITY).toBe(999);
  });

  it('pity forces a glimmer for that chain only where it can drop', () => {
    const p = partyOf({ selene: 0 });
    const pity = { selene: MEMORY_PITY };
    expect(forcedGlimmers(p, pity, 'mainline', 2)).toContain('selene');
    expect(forcedGlimmers(p, pity, 'blaze', 2)).not.toContain('selene');
    expect(forcedGlimmers(p, { selene: MEMORY_PITY - 1 }, 'mainline', 2)).not.toContain('selene');
  });

  it('forced glimmers are at most two, in roster order', () => {
    const p = partyOf({ noel: 0, chizuru: 0, bobby: 0, selene: 0 });
    const pity = { noel: 9, chizuru: 9, bobby: 9, selene: 9 };
    const got = forcedGlimmers(p, pity, 'mainline', 2);
    expect(got).toHaveLength(2);
    const order = got.map((id) => CHARACTER_IDS.indexOf(id));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("Rin's first piece waits in a glimmer on the main road", () => {
    const p = partyOf({ rin: 0 });
    expect(forcedGlimmers(p, {}, 'mainline', 1)).toEqual(['rin']);
    expect(forcedGlimmers(p, {}, 'blaze', 1)).toEqual([]);
    expect(forcedGlimmers(partyOf({ rin: 1 }), {}, 'mainline', 1)).toEqual([]);
  });

  it('the same inputs draw the same pieces', () => {
    const p = partyOf({ hero: 10, rin: 7, selene: 0, chizuru: 0, bobby: 0 });
    for (let seed = 1; seed <= 20; seed++) {
      expect(pieceDrops(p, {}, eliteCtx(10), mulberry32(seed))).toEqual(pieceDrops(p, {}, eliteCtx(10), mulberry32(seed)));
    }
  });

  it('applyPieces never skips or repeats', () => {
    const p = partyOf({ rin: 0 });
    const { party, gained } = applyPieces(p, ['rin', 'rin']);
    expect(gained).toEqual([{ id: 'rin', n: 1 }, { id: 'rin', n: 2 }]);
    expect(memoriesOf(party.roster.rin)).toBe(2);
    expect(memoriesOf(p.roster.rin)).toBe(0);
    expect(CHAINS.rin.pieces.length).toBe(7);
  });
});
