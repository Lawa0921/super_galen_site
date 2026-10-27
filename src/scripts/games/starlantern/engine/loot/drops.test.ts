import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { TIERS } from '../../data/difficulty';
import { describe, it, expect } from 'vitest';
import { mulberry32, type Rng } from '../rng';
import { AFFIXES, GEAR_SLOTS, ROLL_FLOOR, SPECIALS, affixRange } from '../../data/gear';
import { ENEMIES } from '../../data/enemies';
import { INSCRIPTION_NAME } from '../../data/bestiary.zh-TW';
import { newRun } from '../dungeon/run';
import { MATERIALS } from '../../data/materials';
import { CONDITIONS } from '../../data/conditions';
import { MAX_ILVL, MAX_REACHED, depthLevel } from '../levels';
import type { ItemInstance, Rarity } from '../types';
import { itemLevel, itemName, rollItem, tierItemLevel, type DropSource } from './item';
import { BOSS_LEGENDARY, EPIC_SHARE, GEAR_CHANCE, RARE_MATERIALS, STARLIT_CHANCE, STARLIT_SALT, TROPHY_SALT, applyStarlit, inscribe, lootRng, mix, trophyRng, rarityWeights, rollBossGear, rollGear, rollRareMaterial, rollTier, starlitChance, pickSpecial, type DropCtx, type Tier } from './drops';
import type { RegionId } from '../../data/regions';

const N = 20000;
const tierOf = (r: Rarity): Tier => (r === 'common' || r === 'magic' || r === 'rare' || r === 'epic' ? r : 'legendaryTier');
const SOURCES: DropSource[] = ['monster', 'chest', 'elite', 'vault', 'boss'];
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
    expect(w.rare + w.epic).toBeCloseTo(5.5 * 1.5);
    expect(w.epic).toBeCloseTo(5.5 * 1.5 * EPIC_SHARE.monster);
    expect(w.legendaryTier).toBeCloseTo(0.5 * 1.5);
  });

  it('applies chest, elite, vault and boss adjustments', () => {
    const m = rarityWeights('monster', 10, 'plain');
    const c = rarityWeights('chest', 10, 'plain');
    expect(c.rare + c.epic).toBeCloseTo((m.rare + m.epic) * 1.5);
    expect(c.legendaryTier).toBeCloseTo(m.legendaryTier * 1.5);
    expect(c.common).toBe(70);
    const e = rarityWeights('elite', 10, 'plain');
    expect(e.common).toBe(0);
    expect(e.magic).toBeCloseTo(m.magic);
    expect(e.rare + e.epic).toBeCloseTo((m.rare + m.epic) * 3);
    const v = rarityWeights('vault', 10, 'plain');
    expect(v).toMatchObject({ common: 0, magic: 0 });
    expect(v.rare + v.epic).toBeCloseTo(m.rare + m.epic);
    expect(v.legendaryTier).toBeCloseTo(m.legendaryTier * 3);
    const close = (got: Record<Tier, number>, want: Record<Tier, number>) => {
      expect(Object.keys(got).sort()).toEqual(Object.keys(want).sort());
      for (const k of Object.keys(want) as Tier[]) expect(got[k], k).toBeCloseTo(want[k]);
    };
    close(rarityWeights('boss', 40, 'bounty'), { common: 0, magic: 0, rare: 0.8 * (1 - EPIC_SHARE.boss), epic: 0.8 * EPIC_SHARE.boss, legendaryTier: 0.2 });
    close(rarityWeights('boss', 1, 'plain', true), { common: 0, magic: 0, rare: 0.9 * (1 - EPIC_SHARE.boss), epic: 0.9 * EPIC_SHARE.boss, legendaryTier: 0.1 });
  });

  it('the epic share comes out of rare only, per source', () => {
    for (const source of SOURCES) {
      for (const lv of [1, 20]) {
        const w = rarityWeights(source, lv, 'plain');
        expect(w.epic / (w.rare + w.epic), `${source} ${lv}`).toBeCloseTo(EPIC_SHARE[source]);
        const saved = { ...EPIC_SHARE };
        let none: Record<Tier, number>;
        try {
          for (const k of SOURCES) EPIC_SHARE[k] = 0;
          none = rarityWeights(source, lv, 'plain');
        } finally {
          Object.assign(EPIC_SHARE, saved);
        }
        expect(none.epic, `${source} ${lv}`).toBe(0);
        expect(w.rare + w.epic, `${source} ${lv}`).toBeCloseTo(none.rare);
        for (const t of ['common', 'magic', 'legendaryTier'] as Tier[]) expect(w[t], `${source} ${lv} ${t}`).toBe(none[t]);
      }
    }
  });

  it('bounty and fierce raise epic in proportion', () => {
    const plain = rarityWeights('monster', 10, 'plain').epic;
    expect(rarityWeights('monster', 10, 'bounty').epic).toBeCloseTo(1.5 * plain);
    expect(rarityWeights('monster', 10, 'fierce').epic).toBeCloseTo(1.25 * plain);
  });

  it('one draw: only a draw that was rare can become epic', () => {
    const counted = (seed: number): Rng & { n: number } => {
      const inner = mulberry32(seed);
      const f = Object.assign(() => { f.n++; return inner(); }, { n: 0 });
      return f;
    };
    for (const source of ['monster', 'elite', 'boss'] as DropSource[]) {
      const w = rarityWeights(source, 10, 'plain');
      const merged = { ...w, rare: w.rare + w.epic, epic: 0 };
      let epics = 0;
      for (let s = 1; s <= 20000; s++) {
        const ra = counted(s), rb = counted(s);
        const a = rollTier(ra, w), b = rollTier(rb, merged);
        if (a !== b) expect([b, a], `${source} #${s}`).toEqual(['rare', 'epic']);
        if (a === 'epic') epics++;
        expect(ra.n).toBe(1);
        expect(rb.n).toBe(1);
      }
      expect(epics, source).toBeGreaterThan(0);
    }
  });

  it('epic sits at the end of the rare band: the boundary is rare_end − share × rare', () => {
    const at = (x: number): Rng => () => x;
    for (const source of SOURCES) {
      const w = rarityWeights(source, 10, 'plain');
      const total = w.common + w.magic + w.rare + w.epic + w.legendaryTier;
      const rareFull = w.rare + w.epic;
      const rareStart = w.common + w.magic;
      const rareEnd = rareStart + rareFull;
      const boundary = rareEnd - EPIC_SHARE[source] * rareFull;
      const merged = { ...w, rare: rareFull, epic: 0 };
      const eps = 1e-9 * total;
      const cases: [number, Tier, Tier][] = [
        [rareStart + eps, 'rare', 'rare'],
        [boundary - eps, 'rare', 'rare'],
        [boundary + eps, 'epic', 'rare'],
        [rareEnd - eps, 'epic', 'rare'],
      ];
      if (w.legendaryTier > 0) cases.push([rareEnd + eps, 'legendaryTier', 'legendaryTier']);
      for (const [v, want, wantMerged] of cases) {
        expect(rollTier(at(v / total), w), `${source} ${v}`).toBe(want);
        expect(rollTier(at(v / total), merged), `${source} ${v} merged`).toBe(wantMerged);
      }
    }
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
      const total = w.common + w.magic + w.rare + w.epic + w.legendaryTier;
      const xs = sample(ctxFor({ depth }), 11 + depth);
      for (const t of ['common', 'magic', 'rare', 'epic', 'legendaryTier'] as Tier[]) {
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

  it('an epic drop has four or five affixes at the epic floor', () => {
    const xs = sample(ctxFor({ source: 'vault', depth: 10 }), 101, 3000).filter((i) => i.rarity === 'epic');
    expect(xs.length).toBeGreaterThan(0);
    for (const i of xs) {
      expect(i.affixes.length).toBeGreaterThanOrEqual(4);
      expect(i.affixes.length).toBeLessThanOrEqual(5);
      for (const a of i.affixes) {
        const [lo, hi] = affixRange(a.key, i.ilvl);
        expect(a.value, a.key).toBeGreaterThanOrEqual(Math.max(1, Math.round(lo + (hi - lo) * ROLL_FLOOR.epic)));
      }
    }
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

  it('the second piece rolls at the boss item level on the elite weights', () => {
    for (const depth of [3, 12]) {
      const ctx = ctxFor({ source: 'boss', depth });
      const rng = mulberry32(40 + depth);
      const n = 6000;
      const tiers: Record<Tier, number> = { common: 0, magic: 0, rare: 0, epic: 0, legendaryTier: 0 };
      for (let i = 0; i < n; i++) {
        const [, b] = rollBossGear(rng, ctx);
        expect(b.ilvl).toBe(itemLevel(depth, 'boss'));          // not the elite's own item level
        tiers[tierOf(b.rarity)]++;
      }
      const w = rarityWeights('elite', depthLevel(depth), 'plain');
      const total = w.common + w.magic + w.rare + w.epic + w.legendaryTier;
      expect(tiers.common, `depth ${depth}`).toBe(0);
      // Boss weights never give magic; the elite's do, at their share.
      expect(tiers.magic / n, `depth ${depth}`).toBeCloseTo(w.magic / total, 1);
      expect(tiers.rare / n, `depth ${depth}`).toBeCloseTo(w.rare / total, 1);
      expect(tiers.epic / n, `depth ${depth}`).toBeCloseTo(w.epic / total, 1);
    }
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

describe('deep drops stay within the save cap', () => {
  it('a boss drop at the deepest legal depth is at most MAX_ILVL, and so is every source', () => {
    const rng = mulberry32(1);
    let uid = 1;
    const ctx = { depth: MAX_REACHED, region: 'mainline', source: 'boss', condition: 'plain', uid: () => uid++ } as unknown as DropCtx;
    for (const it of rollBossGear(rng, ctx)) expect(it.ilvl).toBeLessThanOrEqual(MAX_ILVL);
    for (const source of ['monster', 'chest', 'elite', 'vault', 'boss'] as DropSource[]) {
      expect(itemLevel(MAX_REACHED, source), source).toBeLessThanOrEqual(MAX_ILVL);
      expect(itemLevel(100000, source), source).toBe(MAX_ILVL);
    }
    expect(itemLevel(1, 'boss')).toBe(depthLevel(1) + 4);
  });
});

describe('starlit drops (plan 5g)', () => {
  const withChance = <T>(over: Partial<typeof STARLIT_CHANCE>, fn: () => T): T => {
    const saved = { drop: { ...STARLIT_CHANCE.drop }, elite: { ...STARLIT_CHANCE.elite }, boss: { ...STARLIT_CHANCE.boss } };
    try {
      Object.assign(STARLIT_CHANCE, over);
      return fn();
    } finally {
      Object.assign(STARLIT_CHANCE, saved);
    }
  };
  const legendary = (uid: number): ItemInstance => rollItem(mulberry32(uid), { uid, ilvl: 20, rarity: 'legendary', special: 'lg-noel' });

  it('the starlit chance table', () => {
    expect(STARLIT_SALT).toBe(0xa54ff53a);
    expect(starlitChance('monster', 1)).toBe(0.03);
    expect(starlitChance('chest', 10)).toBeCloseTo(0.048);
    expect(starlitChance('monster', 40)).toBe(0.08);
    expect(starlitChance('vault', 1)).toBe(0.05);
    expect(starlitChance('elite', 10)).toBeCloseTo(0.077);
    expect(starlitChance('boss', 1)).toBe(0.08);
    expect(starlitChance('boss', 10)).toBeCloseTo(0.116);
    expect(starlitChance('boss', 30)).toBe(0.16);
    for (const source of SOURCES) expect(starlitChance(source, 0), source).toBe(starlitChance(source, 1));
  });

  it('applyStarlit is keyed by seed and uid only', () => {
    for (let uid = 1; uid <= 300; uid++) {
      const it = legendary(uid);
      const ctx = { seed: 4242, source: 'boss' as const, depth: 10 };
      expect(applyStarlit(it, ctx)).toEqual(applyStarlit(legendary(uid), ctx));
      expect(applyStarlit(it, { source: 'boss', depth: 10 })).toBe(it);
    }
    const always = { base: 1, perDepth: 0, cap: 1 };
    withChance({ drop: always, elite: always, boss: always }, () => {
      for (const rarity of ['magic', 'rare', 'epic'] as Rarity[]) {
        const it = rollItem(mulberry32(3), { uid: 9, ilvl: 20, rarity });
        expect(applyStarlit(it, { seed: 1, source: 'boss', depth: 10 }), rarity).toBe(it);
      }
      expect(applyStarlit(legendary(9), { seed: 1, source: 'boss', depth: 10 }).starlit).toBe(true);
    });
  });

  it('different run seeds give different starlit outcomes for the same uid', () => {
    const it = legendary(1);
    let differ = 0;
    for (let uid = 1; uid <= 2000; uid++) {
      const a = applyStarlit({ ...it, uid }, { seed: 1, source: 'boss', depth: 10 }).starlit === true;
      const b = applyStarlit({ ...it, uid }, { seed: 2, source: 'boss', depth: 10 }).starlit === true;
      if (a !== b) differ++;
    }
    expect(differ).toBeGreaterThan(0);
  });

  it('applyStarlit hits its chance', () => {
    const n = 20000;
    let hits = 0;
    const it = legendary(1);
    for (let uid = 1; uid <= n; uid++) if (applyStarlit({ ...it, uid }, { seed: 12345, source: 'boss', depth: 10 }).starlit) hits++;
    const p = starlitChance('boss', 10);
    expect(Math.abs(hits / n - p)).toBeLessThan(tol(p, n));
  });

  it('the starlit stream takes no draw from the loot rng', () => {
    withChance({ boss: { base: 0.5, perDepth: 0, cap: 0.5 } }, () => {
      let starlit = 0;
      for (let s = 1; s <= 2000; s++) {
        const a = mulberry32(s), b = mulberry32(s);
        const x = rollGear(a, ctxFor({ source: 'boss', seed: 777 }));
        const y = rollGear(b, ctxFor({ source: 'boss' }));
        expect(a(), `#${s}`).toBe(b());
        const { affixes: _xa, starlit: xs, ...xr } = x;
        const { affixes: _ya, starlit: ys, ...yr } = y;
        expect(xr, `#${s}`).toEqual(yr);
        expect(ys).toBeUndefined();
        if (xs) starlit++;
      }
      expect(starlit).toBeGreaterThan(0);
    });
  });

  it('only labyrinth drops are starlit: rollItem alone never is', () => {
    for (const sp of Object.values(SPECIALS)) {
      for (let seed = 1; seed <= 5; seed++) {
        expect('starlit' in rollItem(mulberry32(seed), { uid: seed, ilvl: 30, rarity: sp.rarity, special: sp.id }), sp.id).toBe(false);
      }
    }
  });

  it('only the legendary tier of rollGear is ever starlit', () => {
    const always = { base: 1, perDepth: 0, cap: 1 };
    withChance({ drop: always, elite: always, boss: always }, () => {
      const xs = sample(ctxFor({ source: 'elite', depth: 10, seed: 5 }), 61, 3000);
      for (const it of xs) expect(it.starlit === true, it.rarity).toBe(tierOf(it.rarity) === 'legendaryTier');
      expect(xs.some((it) => it.starlit)).toBe(true);
    });
  });

  it('the sim never reaches the starlit stream', () => {
    const src = readFileSync('src/scripts/games/starlantern/engine/sim.ts', 'utf8');
    expect(src.length).toBeGreaterThan(1000);
    for (const word of ['applyStarlit', 'rollGear', 'STARLIT', 'starlit']) expect(src, word).not.toContain(word);
  });
});

describe("a tier's drops (difficulty plan Task 4)", () => {
  const sha = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
  /** An rng that counts its draws. */
  const counted = (seed: number) => { const base = mulberry32(seed); const f = Object.assign(() => { f.n++; return base(); }, { n: 0 }); return f; };
  const share = (w: Record<Tier, number>) => w.legendaryTier / (w.common + w.magic + w.rare + w.epic + w.legendaryTier);

  it('no tier rolls as before', () => {
    // Guard (green before the implementation): without a tier, and on Normal, every roll is the roll before any tier code:
    // SHA-256s recorded on the code before this task (as the T0-T1 review asked of the guards).
    const weights: unknown[] = [];
    for (const source of SOURCES) for (const lv of [2, 38, 98]) for (const cond of Object.keys(CONDITIONS) as (keyof typeof CONDITIONS)[]) for (const rep of [false, true]) {
      weights.push(rarityWeights(source, lv, cond, rep));
    }
    expect(sha(weights)).toBe(PINNED.weights);
    const rolls = (difficulty?: 'normal') => {
      const out: unknown[] = [];
      for (const source of SOURCES) for (const depth of [1, 10, 25]) for (const region of ['mainline', 'blaze'] as const) {
        const rng = counted(depth * 31 + source.length);
        const ctx = ctxFor({ source, depth, region, seed: 4242, ...(difficulty ? { difficulty } : {}) });
        for (let i = 0; i < 40; i++) out.push(rollGear(rng, ctx));
        out.push(rollBossGear(rng, ctx), rng.n);
      }
      return out;
    };
    const none = rolls();
    expect(rolls('normal')).toEqual(none);
    expect(sha(none)).toBe(PINNED.rolls);
    expect(starlitChance('boss', 30)).toBe(0.16);
  });

  it('a tier sets the legendary share to its multiple, from every source', () => {
    const lines: string[] = [];
    let ok = true;
    for (const [name, t] of [['nightmare', TIERS.nightmare], ['hell', TIERS.hell]] as const) for (const source of SOURCES) for (const rep of source === 'boss' ? [false, true] : [false]) for (const lv of [38, 98]) {
      const n = share(rarityWeights(source, lv, 'plain', rep));
      const got = share(rarityWeights(source, lv, 'plain', rep, t));
      const want = Math.min(t.legendaryCap, n * t.legendaryShareMul);
      lines.push(`${name} ${source}${rep ? ' repeat' : ''} Lv${lv} ${(got / n).toFixed(4)}`);
      if (Math.abs(got - want) > 1e-12) ok = false;
    }
    expect(ok, lines.join('\n')).toBe(true);
    // The vault, which has only rare and legendary weights, too: exactly 1.3x and 1.6x.
    const v = share(rarityWeights('vault', 38, 'plain'));
    expect(share(rarityWeights('vault', 38, 'plain', false, TIERS.nightmare)) / v).toBeCloseTo(1.3, 12);
    expect(share(rarityWeights('vault', 38, 'plain', false, TIERS.hell)) / v).toBeCloseTo(1.6, 12);
    // Capped: a share that would pass the cap sits at it.
    const capped = { ...TIERS.hell, legendaryShareMul: 10 };
    expect(share(rarityWeights('boss', 38, 'plain', false, capped))).toBeCloseTo(capped.legendaryCap, 12);
  });

  it('the legendary share stays under 1 whatever the cap (T4-T5 review)', () => {
    // A higher tier's cap is a share, always under 1.
    for (const [name, t] of Object.entries(TIERS)) if (name !== 'normal') expect(t.legendaryCap, name).toBeLessThan(1);
    // A row with no real cap still gives finite weights: the share sits at .99, never 1 (which divides by zero).
    const open = { ...TIERS.hell, legendaryCap: 1, legendaryShareMul: 100 };
    for (const source of SOURCES) {
      const w = rarityWeights(source, 38, 'plain', false, open);
      expect(Object.values(w).every(Number.isFinite), source).toBe(true);
      expect(share(w), source).toBeCloseTo(0.99, 12);
    }
  });

  it('a tier raises rare and epic by its multiplier, leaves common and magic', () => {
    for (const t of [TIERS.nightmare, TIERS.hell]) for (const source of SOURCES) {
      const n = rarityWeights(source, 38, 'plain');
      const w = rarityWeights(source, 38, 'plain', false, t);
      expect(w.common, source).toBe(n.common);
      expect(w.magic, source).toBe(n.magic);
      expect(w.rare, source).toBeCloseTo(n.rare * t.rarityMul, 12);
      expect(w.epic, source).toBeCloseTo(n.epic * t.rarityMul, 12);
    }
  });

  it("a boss's legendary odds", () => {
    const boss = (rep: boolean, t?: typeof TIERS.hell) => share(rarityWeights('boss', 38, 'plain', rep, t));
    expect(boss(false)).toBeCloseTo(0.2, 12);
    expect(boss(false, TIERS.nightmare)).toBeCloseTo(0.26, 12);
    expect(boss(false, TIERS.hell)).toBeCloseTo(0.32, 12);
    expect(boss(true)).toBeCloseTo(0.1, 12);
    expect(boss(true, TIERS.nightmare)).toBeCloseTo(0.13, 12);
    expect(boss(true, TIERS.hell)).toBeCloseTo(0.16, 12);
    expect(TIERS.nightmare.legendaryCap).toBe(0.5);
  });

  it('starlit rises with its cap', () => {
    expect(starlitChance('boss', 30)).toBe(0.16);
    expect(starlitChance('boss', 30, TIERS.hell)).toBeCloseTo(0.32, 12);
    expect(starlitChance('boss', 30, TIERS.nightmare)).toBeCloseTo(0.24, 12);
    // Under the cap: the base and the depth's rise, times the multiplier.
    expect(starlitChance('monster', 5, TIERS.nightmare)).toBeCloseTo((0.03 + 0.002 * 4) * 1.5, 12);
    // applyStarlit reads the tier from the context.
    const it = rollItem(mulberry32(7), { uid: 7, ilvl: 20, rarity: 'legendary', special: 'lg-noel' });
    let lit = 0, litT = 0;
    for (let seed = 0; seed < 4000; seed++) {
      if (applyStarlit({ ...it }, { seed, source: 'monster', depth: 5 }).starlit) lit++;
      if (applyStarlit({ ...it }, { seed, source: 'monster', depth: 5, difficulty: 'hell' }).starlit) litT++;
    }
    expect(litT).toBeGreaterThan(lit);
  });

  it("gear rolls a tier's item level, the boss's second piece too, once", () => {
    expect(tierItemLevel(10, 'boss', TIERS.nightmare)).toBe(itemLevel(10, 'boss') + 4);
    expect(tierItemLevel(MAX_REACHED, 'boss', TIERS.hell)).toBe(MAX_ILVL);
    const [a, b] = rollBossGear(mulberry32(3), ctxFor({ depth: 10, difficulty: 'nightmare' }));
    expect(a.ilvl).toBe(itemLevel(10, 'boss') + 4);
    expect(b.ilvl).toBe(itemLevel(10, 'boss') + 4);
    expect(rollGear(mulberry32(3), ctxFor({ depth: 10, source: 'monster', difficulty: 'hell' })).ilvl).toBe(itemLevel(10, 'monster') + 8);
    // A given item level is kept as it is.
    expect(rollGear(mulberry32(3), ctxFor({ depth: 10, source: 'elite', difficulty: 'hell', ilvl: 33 })).ilvl).toBe(33);
  });
});

/** The pre-tier rolls (recorded on the code before Task 4). */
const PINNED = { weights: '8d7faf51a6b4b0e1431f4068c704918687702fb4a20ce127ff7c63cb4f5127b5', rolls: '94b99933704b65898fd937d33639ff8c376c7551e4f123264beba2f3a70f0534' };

describe('the roster leaves the special pools alone (roster plan Task A3)', () => {
  it('pickSpecial draws as before', () => {
    // Seeds 1-200 x the seven regions x the three sources, recorded before the roster's uniques were merged into SPECIALS.
    const regions: RegionId[] = ['mainline', 'blaze', 'frost', 'storm', 'mire', 'shade', 'iron'];
    const got: string[] = [];
    for (let seed = 1; seed <= 200; seed++) for (const r of regions) for (const src of ['monster', 'elite', 'boss'] as DropSource[]) {
      got.push(pickSpecial(mulberry32(seed), r, src).id);
    }
    expect(got.slice(0, 6)).toEqual(PICKS_HEAD);
    expect(createHash('sha256').update(got.join(',')).digest('hex')).toBe(PICKS_SHA);
  });
});
const PICKS_HEAD = ['lg-selene', 'lg-selene', 'lg-selene', 'blaze-ember-ring', 'blaze-ember-ring', 'blaze-ember-ring'];
const PICKS_SHA = '2ce8998abb5648d99ac7ee99f4c0b8fce2fdfd7b356cfb6120960d9ff5078751';

describe('the trophy stream and species inscriptions (roster plan Task C1)', () => {
  it('trophyRng keys each draw by the run seed, TROPHY_SALT and its own count, and moves no loot draw', () => {
    const run = newRun(7, 'mainline', 'plain', 1);
    expect(run.trophyDraws).toBe(0);
    const first = trophyRng(run)();
    const second = trophyRng(run)();
    expect(run.trophyDraws).toBe(2);
    expect(run.lootDraws).toBe(0);
    expect(first).toBe(mulberry32(mix(7 ^ TROPHY_SALT, 0))());
    expect(second).toBe(mulberry32(mix(7 ^ TROPHY_SALT, 1))());
    expect(lootRng(newRun(7, 'mainline', 'plain', 1))()).not.toBe(first);
  });

  it("an inscription never raises an item's affix count or range", () => {
    // 100,000 pieces: every rarity an inscription can meet, item levels across the game.
    const rng = mulberry32(42);
    const t = mulberry32(43);
    const rarities: Rarity[] = ['common', 'magic', 'rare', 'epic'];
    let swapped = 0;
    for (let i = 0; i < 100000; i++) {
      const rarity = rarities[i % rarities.length];
      const ilvl = 1 + (i % MAX_ILVL);
      const it = rollItem(rng, { uid: i + 1, ilvl, rarity });
      const ins = inscribe(it, 'paper-moth', t);
      expect(ins.inscription).toBe('paper-moth');
      expect([ins.uid, ins.base, ins.rarity, ins.ilvl, ins.enhance]).toEqual([it.uid, it.base, it.rarity, it.ilvl, it.enhance]);
      if (ins.affixes.length !== it.affixes.length) throw new Error(`count moved at ${i}`);
      if (new Set(ins.affixes.map((a) => a.key)).size !== ins.affixes.length) throw new Error(`a key twice at ${i}`);
      for (const a of ins.affixes) {
        const [lo, hi] = affixRange(a.key, ilvl);
        const floor = ROLL_FLOOR[rarity];
        const min = Math.max(1, Math.round(lo + (hi - lo) * floor));
        if (a.value < min || a.value > Math.max(1, Math.round(hi))) throw new Error(`${a.key} ${a.value} out of range at ${i}`);
      }
      if (ins.affixes.some((a) => a.key === 'sleepRes') && !it.affixes.some((a) => a.key === 'sleepRes')) swapped++;
    }
    // It does land on the pieces that can take it (a magic, rare or epic piece of a slot that rolls 睡眠抗性).
    expect(swapped).toBeGreaterThan(10000);
  });

  it('a slot that cannot take the key keeps its affixes but carries the mark', () => {
    const key = ENEMIES['paper-moth'].inscribe!;
    const slot = GEAR_SLOTS.find((s) => !AFFIXES[key].slots.includes(s))!;
    expect(slot).toBeDefined();
    const it = rollItem(mulberry32(5), { uid: 9, ilvl: 10, rarity: 'rare', slot });
    const ins = inscribe(it, 'paper-moth', mulberry32(6));
    expect(ins.affixes).toEqual(it.affixes);
    expect(ins.inscription).toBe('paper-moth');
    // A piece that already carries the key is marked and left as it is.
    const fits = GEAR_SLOTS.find((s) => AFFIXES[key].slots.includes(s))!;
    const has = { ...rollItem(mulberry32(7), { uid: 10, ilvl: 10, rarity: 'rare', slot: fits }) };
    has.affixes = [{ key, value: 12 }, ...has.affixes.filter((a) => a.key !== key)];
    expect(inscribe(has, 'paper-moth', mulberry32(8)).affixes).toEqual(has.affixes);
  });

  it("an inscribed piece is named after its species' two characters", () => {
    const it = rollItem(mulberry32(1), { uid: 1, ilvl: 5, rarity: 'magic' });
    expect(itemName({ ...it, inscription: 'paper-moth' })).toBe(`${itemName(it)}・${INSCRIPTION_NAME['paper-moth']}銘`);
    expect(INSCRIPTION_NAME['paper-moth']).toBe('紙蛾');
    // Every ordinary species has its two characters, and nothing else does.
    const species = Object.values(ENEMIES).filter((e) => e.inscribe).map((e) => e.id).sort();
    expect(Object.keys(INSCRIPTION_NAME).sort()).toEqual(species);
    for (const [id, name] of Object.entries(INSCRIPTION_NAME)) {
      expect([...name], id).toHaveLength(2);
      for (const ch of name) expect(ENEMIES[id].name, id).toContain(ch);
    }
  });
});
