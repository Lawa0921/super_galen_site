import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../rng';
import { SPECIALS } from '../../data/gear';
import { MATERIALS } from '../../data/materials';
import { CONDITIONS } from '../../data/conditions';
import { depthLevel } from '../levels';
import type { ItemInstance, Rarity } from '../types';
import { itemLevel, type DropSource } from './item';
import { BOSS_LEGENDARY, GEAR_CHANCE, RARE_MATERIALS, rarityWeights, rollBossGear, rollGear, rollRareMaterial, type DropCtx, type Tier } from './drops';

const N = 20000;
const tierOf = (r: Rarity): Tier => (r === 'common' || r === 'magic' || r === 'rare' ? r : 'legendaryTier');
const ctxFor = (over: Partial<DropCtx> = {}): DropCtx => {
  let uid = 0;
  return { uid: () => ++uid, depth: 1, region: 'mainline', condition: 'plain', source: 'monster', ...over };
};
const sample = (ctx: DropCtx, seed: number, n = N): ItemInstance[] => {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () => rollGear(rng, ctx));
};
const tol = (p: number, n = N) => 4 * Math.sqrt((p * (1 - p)) / n);
const frac = (xs: ItemInstance[], pred: (i: ItemInstance) => boolean) => xs.filter(pred).length / xs.length;

describe('rarity weights', () => {
  it('uses the fixed constants', () => {
    expect(GEAR_CHANCE).toEqual({ monster: 0.08, chest: 0.35 });
    expect(BOSS_LEGENDARY).toEqual({ first: 0.2, repeat: 0.1 });
    expect(RARE_MATERIALS).toEqual(['star-tear', 'ancient-gear', 'king-scale']);
  });

  it('matches the monster formula', () => {
    const w = rarityWeights('monster', 10, 'plain');
    expect(w.common).toBe(70);
    expect(w.magic).toBeCloseTo(24 * 1.25);
    expect(w.rare).toBeCloseTo(5.5 * 1.5);
    expect(w.legendaryTier).toBeCloseTo(0.5 * 1.5);
  });

  it('applies chest, elite, vault and boss adjustments', () => {
    const m = rarityWeights('monster', 10, 'plain');
    const c = rarityWeights('chest', 10, 'plain');
    expect(c.rare).toBeCloseTo(m.rare * 1.5);
    expect(c.legendaryTier).toBeCloseTo(m.legendaryTier * 1.5);
    expect(c.common).toBe(70);
    const e = rarityWeights('elite', 10, 'plain');
    expect(e.common).toBe(0);
    expect(e.magic).toBeCloseTo(m.magic);
    expect(e.rare).toBeCloseTo(m.rare * 3);
    const v = rarityWeights('vault', 10, 'plain');
    expect(v).toMatchObject({ common: 0, magic: 0 });
    expect(v.rare).toBeCloseTo(m.rare);
    expect(v.legendaryTier).toBeCloseTo(m.legendaryTier * 3);
    expect(rarityWeights('boss', 40, 'bounty')).toEqual({ common: 0, magic: 0, rare: 0.8, legendaryTier: 0.2 });
    expect(rarityWeights('boss', 1, 'plain', true)).toEqual({ common: 0, magic: 0, rare: 0.9, legendaryTier: 0.1 });
  });

  it('uses rarityMul from the condition', () => {
    expect(CONDITIONS.bounty.rarityMul).toBe(1.5);
    expect(CONDITIONS.fierce.rarityMul).toBe(1.25);
    for (const id of ['fog', 'calm', 'starfall', 'plain'] as const) expect(CONDITIONS[id].rarityMul).toBe(1);
  });
});

describe('rollGear', () => {
  it('monster rarity matches rarityWeights at depth 1 and 10', () => {
    for (const depth of [1, 10]) {
      const w = rarityWeights('monster', depthLevel(depth), 'plain');
      const total = w.common + w.magic + w.rare + w.legendaryTier;
      const xs = sample(ctxFor({ depth }), 11 + depth);
      for (const t of ['common', 'magic', 'rare', 'legendaryTier'] as Tier[]) {
        const p = w[t] / total;
        expect(Math.abs(frac(xs, (i) => tierOf(i.rarity) === t) - p), `depth ${depth} ${t}`).toBeLessThan(tol(p));
      }
    }
  });

  it('deeper, elite and bounty raise rare odds', () => {
    const rareUp = (xs: ItemInstance[]) => frac(xs, (i) => i.rarity !== 'common' && i.rarity !== 'magic');
    const base = rareUp(sample(ctxFor({ depth: 1 }), 21));
    expect(rareUp(sample(ctxFor({ depth: 20 }), 22))).toBeGreaterThan(base + 0.03);
    expect(rareUp(sample(ctxFor({ depth: 1, source: 'elite' }), 23))).toBeGreaterThan(base + 0.03);
    expect(rareUp(sample(ctxFor({ depth: 1, condition: 'bounty' }), 24))).toBeGreaterThan(base + 0.005);
  });

  it('elites never common; vaults and bosses never below rare', () => {
    expect(sample(ctxFor({ source: 'elite' }), 31, 3000).some((i) => i.rarity === 'common')).toBe(false);
    for (const source of ['vault', 'boss'] as DropSource[]) {
      const xs = sample(ctxFor({ source }), 32, 3000);
      expect(xs.some((i) => i.rarity === 'common' || i.rarity === 'magic'), source).toBe(false);
    }
  });

  it('a repeat boss halves the legendary-tier chance', () => {
    const first = frac(sample(ctxFor({ source: 'boss' }), 41), (i) => tierOf(i.rarity) === 'legendaryTier');
    const repeat = frac(sample(ctxFor({ source: 'boss', bossRepeat: true }), 42), (i) => tierOf(i.rarity) === 'legendaryTier');
    expect(Math.abs(first - 0.2)).toBeLessThan(tol(0.2));
    expect(Math.abs(repeat - 0.1)).toBeLessThan(tol(0.1));
  });

  it('gives items the level of their source', () => {
    for (const source of ['monster', 'chest', 'elite', 'vault', 'boss'] as DropSource[]) {
      const xs = sample(ctxFor({ source, depth: 7 }), 51, 50);
      for (const i of xs) expect(i.ilvl).toBe(itemLevel(7, source));
    }
  });

  it('is deterministic and gives each item a fresh uid', () => {
    const a = sample(ctxFor({ depth: 3 }), 61, 50);
    const b = sample(ctxFor({ depth: 3 }), 61, 50);
    expect(a).toEqual(b);
    expect(new Set(a.map((i) => i.uid)).size).toBe(50);
  });

  it('region-only gear never drops in the mainline', () => {
    for (const source of ['monster', 'chest', 'elite', 'vault', 'boss'] as DropSource[]) {
      const xs = sample(ctxFor({ source, depth: 10 }), 71, 8000);
      const specials = xs.filter((i) => i.special);
      expect(specials.length, source).toBeGreaterThan(0);
      for (const i of specials) expect(i.special, source).toMatch(/^lg-/);
    }
  });

  it('a region mixes in its own legendary, unique and set pieces', () => {
    const xs = sample(ctxFor({ region: 'blaze', source: 'vault' }), 81, 12000);
    const ids = new Set(xs.map((i) => i.special).filter(Boolean) as string[]);
    expect([...ids].some((id) => id.startsWith('lg-'))).toBe(true);
    expect(ids.has('blaze-heart-sword')).toBe(true);
    expect(ids.has('blaze-ember-ring')).toBe(true);
    expect([...ids].some((id) => id.startsWith('set-blaze-'))).toBe(true);
    for (const id of ids) {
      const s = SPECIALS[id];
      expect(s.region === null || s.region === 'blaze', id).toBe(true);
    }
  });

  it('boss-only gear drops only from bosses', () => {
    const id = 'iron-unbroken-shield';
    for (const source of ['monster', 'chest', 'elite', 'vault'] as DropSource[]) {
      expect(sample(ctxFor({ region: 'iron', source }), 91, 8000).some((i) => i.special === id), source).toBe(false);
    }
    expect(sample(ctxFor({ region: 'iron', source: 'boss' }), 92, 8000).some((i) => i.special === id)).toBe(true);
  });

  it('elite-only gear drops from elites and bosses but not elsewhere', () => {
    const id = 'shade-silent-blade';
    for (const source of ['monster', 'chest', 'vault'] as DropSource[]) {
      expect(sample(ctxFor({ region: 'shade', source }), 93, 8000).some((i) => i.special === id), source).toBe(false);
    }
    for (const source of ['elite', 'boss'] as DropSource[]) {
      expect(sample(ctxFor({ region: 'shade', source }), 94, 8000).some((i) => i.special === id), source).toBe(true);
    }
  });
});

describe('rollBossGear', () => {
  it('returns two items, the second on elite odds', () => {
    const ctx = ctxFor({ source: 'boss', depth: 50 });
    const out = rollBossGear(mulberry32(5), ctx);
    expect(out).toHaveLength(2);
    expect(out[0].ilvl).toBe(202);
    expect(out[1].ilvl).toBe(202);   // the second piece keeps the boss item level; only its odds are an elite's
    expect(out[1].rarity).not.toBe('common');
    let lowFirst = 0; let rareSecond = 0;
    const rng = mulberry32(6);
    for (let i = 0; i < 2000; i++) {
      const [a, b] = rollBossGear(rng, ctx);
      if (a.rarity === 'common' || a.rarity === 'magic') lowFirst++;
      if (b.rarity === 'rare') rareSecond++;
    }
    expect(lowFirst).toBe(0);
    expect(rareSecond).toBeGreaterThan(0);
    expect(new Set(out.map((i) => i.uid)).size).toBe(2);
  });
});

describe('rare materials', () => {
  it('picks only from the rare list and all three appear', () => {
    const rng = mulberry32(3);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(rollRareMaterial(rng));
    expect([...seen].sort()).toEqual([...RARE_MATERIALS].sort());
    for (const id of RARE_MATERIALS) expect(MATERIALS[id]).toBeDefined();
    expect(MATERIALS['star-tear']).toMatchObject({ name: '星燈之淚', price: 80 });
    expect(MATERIALS['king-scale']).toMatchObject({ name: '王者之鱗', price: 100 });
  });
});
