// layout.test.ts — gen2 版面：海 / 大陸交替、寬度範圍、地區鋪滿、島與槽位、文化指派、tier、家鄉、鎖、查詢一致性（禁用 API 的掃描在 determinism.test.ts）。
import { describe, it, expect } from 'vitest';
import { Layout, newWorldOrigin, SPAWN_X, VARIANT, HOME_X0, HOME_X1, SEA_SLOT_W } from './layout';
import { LockTable } from './locks';
import { poolFor, CULTURE_POOL, CULTURES } from './cultures';
import { BIOME } from '../world';

const SEEDS20 = Array.from({ length: 20 }, (_, k) => `seed-${k}`);
const L = (seed: string, locks = new LockTable()) => new Layout(seed, newWorldOrigin(341, 334), locks, 0);

describe('gen2 Layout', () => {
  it('交替、寬度範圍、地區鋪滿', () => {
    for (const seed of SEEDS20) for (const side of [1, -1] as const) {
      const lay = L(seed);
      for (let i = 1; i <= 12; i++) {
        const m = lay.landmass(side, i), w = m.x1 - m.x0;
        expect(m.kind).toBe(i % 2 ? 'sea' : 'continent');
        if (m.kind === 'sea') { expect(w).toBeGreaterThanOrEqual(480); expect(w).toBeLessThanOrEqual(i === 1 ? 700 : 1200); }
        else {
          expect(w).toBeGreaterThanOrEqual(2400); expect(w).toBeLessThanOrEqual(5200);
          expect(m.regions.length).toBeGreaterThanOrEqual(2); expect(m.regions.length).toBeLessThanOrEqual(4);
          m.regions.forEach((r, k) => { expect(r.x1 - r.x0).toBeGreaterThanOrEqual(700); expect(r.x1 - r.x0).toBeLessThanOrEqual(1500);
            expect(r.x0).toBe(k ? m.regions[k - 1].x1 : m.x0); if (k) expect(r.biome).not.toBe(m.regions[k - 1].biome); });
          expect(m.regions.at(-1)!.x1).toBe(m.x1);
        }
        if (i > 1) expect(side === 1 ? m.x0 : m.x1).toBe(side === 1 ? lay.landmass(side, i - 1).x1 : lay.landmass(side, i - 1).x0);
      }
    }
  });

  it('第 k 道海寬 ≤ min(1200, 700 + 100(k−1))；大陸總寬落在 [max(2400, 700n), min(5200, 1500n)]；地區生態 / 變體', () => {
    for (const seed of SEEDS20) for (const side of [1, -1] as const) {
      const lay = L(seed);
      expect(side === 1 ? lay.landmass(side, 1).x0 : lay.landmass(side, 1).x1).toBe(side === 1 ? HOME_X1 : HOME_X0);
      for (let i = 1; i <= 30; i++) {
        const m = lay.landmass(side, i), w = m.x1 - m.x0;
        if (m.kind === 'sea') { const k = (i + 1) >> 1; expect(w).toBeLessThanOrEqual(k === 1 ? 700 : Math.min(1200, 700 + 100 * (k - 1))); }
        else {
          const n = m.regions.length;
          expect(w).toBeGreaterThanOrEqual(Math.max(2400, 700 * n)); expect(w).toBeLessThanOrEqual(Math.min(5200, 1500 * n));
          for (const r of m.regions) {
            expect([BIOME.FOREST, BIOME.DESERT, BIOME.SNOW, BIOME.JUNGLE]).toContain(r.biome);
            expect([VARIANT.PLAIN, VARIANT.HILLS, VARIANT.HIGH]).toContain(r.variant);
            expect(r).toMatchObject({ side, landmass: i, tier: m.tier, culture: m.culture });
          }
          expect(m.regions.map((r) => r.index)).toEqual(m.regions.map((_, k) => k));
        }
      }
    }
  });

  it('海的島與槽位、海 / 島的 RegionInfo', () => { for (const seed of SEEDS20) for (const side of [1, -1] as const) for (const i of [1, 3, 5, 7]) {
    const m = L(seed).landmass(side, i), n = Math.ceil((m.x1 - m.x0) / 300);
    expect(m.slots).toHaveLength(n); expect(m.slots[0].x0).toBe(m.x0); expect(m.slots.at(-1)!.x1).toBe(m.x1);
    m.slots.forEach((s, k) => { expect(s.k).toBe(k); expect(s.x1 - s.x0).toBeLessThanOrEqual(300); if (k) expect(s.x0).toBe(m.slots[k - 1].x1); });
    expect(m.islands.length).toBeGreaterThanOrEqual(1); expect(m.islands.length).toBeLessThanOrEqual(Math.min(3, n));
    for (const d of m.islands) { const s = m.slots[d.slot]; expect(d.x1 - d.x0).toBeGreaterThanOrEqual(40); expect(d.x1 - d.x0).toBeLessThanOrEqual(160);
      expect(d.x0).toBeGreaterThanOrEqual(s.x0); expect(d.x1).toBeLessThanOrEqual(s.x1); expect(s.poi).toBe('island'); }
    expect(m.slots.filter((s) => s.poi === 'island')).toHaveLength(m.islands.length);
    expect(m.regions[0]).toMatchObject({ kind: 'sea', index: 0, x0: m.x0, x1: m.x1, biome: BIOME.OCEAN, variant: VARIANT.SEA });
    m.islands.forEach((d, j) => { expect(m.regions[j + 1]).toMatchObject({ kind: 'island', index: j + 1, x0: d.x0, x1: d.x1, variant: VARIANT.ISLAND, tier: m.tier });
      expect(L(seed).regionAt((d.x0 + d.x1) >> 1)!.kind).toBe('island'); });
    const free = m.slots.find((s) => s.poi !== 'island'); if (free) expect(L(seed).regionAt(free.x0 + 1)!.kind).toBe('sea'); } });

  it('槽位均分（最後一槽吃餘數）、島寬 ≤ 槽寬 − 80 且置中 ± floor(槽寬 / 10)、島依 x 排序、其他槽是沉船或木箱', () => {
    const pois = new Set<string>();
    for (const seed of SEEDS20) for (const side of [1, -1] as const) for (let i = 1; i <= 30; i += 2) {
      const m = L(seed).landmass(side, i), w = m.x1 - m.x0, n = m.slots.length, base = Math.ceil(w / n);
      m.slots.forEach((s, k) => expect(s.x1 - s.x0).toBe(k < n - 1 ? base : w - base * (n - 1)));
      for (const d of m.islands) {
        const s = m.slots[d.slot], sw = s.x1 - s.x0, c = s.x0 + (sw >> 1);
        expect(d.x1 - d.x0).toBeLessThanOrEqual(Math.min(160, sw - 80));
        expect(Math.abs(d.x0 + ((d.x1 - d.x0) >> 1) - c)).toBeLessThanOrEqual(Math.floor(sw / 10));
      }
      for (let j = 1; j < m.islands.length; j++) expect(m.islands[j].slot).toBeGreaterThan(m.islands[j - 1].slot);
      for (const s of m.slots) { pois.add(s.poi); expect(['island', 'shipwreck', 'crate']).toContain(s.poi); }
      for (const r of m.regions) expect(r).toMatchObject({ side, landmass: i, culture: null, tier: m.tier });
      m.regions.slice(1).forEach((r) => expect(r.biome).toBe(BIOME.FOREST));
    }
    expect(pois).toEqual(new Set(['island', 'shipwreck', 'crate']));
  });

  it('文化：第一片東西大陸恰一片霧竹、20 個種子兩側都出現過；之後相鄰大陸文化不同；tier', () => {
    const sides = new Set<number>();
    for (const seed of SEEDS20) { const lay = L(seed), e = lay.landmass(1, 2), w = lay.landmass(-1, 2);
      expect([e.culture, w.culture].filter((c) => c === 'mistbamboo')).toHaveLength(1);
      sides.add(e.culture === 'mistbamboo' ? 1 : -1);
      for (let i = 4; i <= 12; i += 2) expect(lay.landmass(1, i).culture).not.toBe(lay.landmass(1, i - 2).culture);
      expect(lay.landmass(1, 1).tier).toBe(1); expect(lay.landmass(1, 2).tier).toBe(1); expect(lay.landmass(1, 3).tier).toBe(2);
      expect(e.kind === 'continent' && e.regions.every((r) => r.kind === (e.culture ? 'culture' : 'wild'))).toBe(true); }
    expect(sides.size).toBe(2);
  });

  it('tier：大陸 = 第幾片、海 = 往外下一片大陸；ver 沒鎖用 latestVer', () => {
    const lay = new Layout('t', newWorldOrigin(341, 334), new LockTable(), 0);
    for (const side of [1, -1] as const) for (let i = 1; i <= 20; i++) {
      const m = lay.landmass(side, i);
      expect(m.tier).toBe(m.kind === 'continent' ? i >> 1 : (i + 1) >> 1);
      expect(m.ver).toBe(0);
      expect([m.side, m.i]).toEqual([side, i]);
    }
  });

  it('家鄉：[0,4200)、出生森林、兩端海灘、四種生態都在', () => { for (const seed of SEEDS20) { const lay = L(seed), h = lay.landmassAt(SPAWN_X)!;
    expect(h).toMatchObject({ side: 0, i: 0, kind: 'home', x0: 0, x1: 4200, tier: 0 });
    expect(lay.regionAt(SPAWN_X)).toMatchObject({ variant: VARIANT.SPAWN, x0: 1680, x1: 2520, biome: BIOME.FOREST });
    expect(lay.regionAt(0)).toMatchObject({ variant: VARIANT.BEACH, x1: 70 }); expect(lay.regionAt(4199)).toMatchObject({ variant: VARIANT.BEACH, x0: 4130 });
    expect(new Set(h.regions.map((r) => r.biome))).toEqual(new Set([0, 1, 2, 3])); expect(h.regions.every((r) => r.kind === 'home')).toBe(true); } });

  it('家鄉版面：鋪滿、雪原 / 叢林各在一側外圍、沙漠寬度與離外圍 ≥ 84 格森林、兩側都出現過', () => {
    const snowSides = new Set<string>(), desertSides = new Set<string>();
    for (const seed of SEEDS20) {
      const h = L(seed).landmassAt(SPAWN_X)!, R = h.regions;
      R.forEach((r, k) => { expect(r.x0).toBe(k ? R[k - 1].x1 : 0); expect(r.x1).toBeGreaterThan(r.x0); expect(r.index).toBe(k);
        expect(r).toMatchObject({ side: 0, landmass: 0, tier: 0, culture: null }); });
      expect(R.at(-1)!.x1).toBe(4200);
      expect(R[0]).toMatchObject({ x0: 0, x1: 70, variant: VARIANT.BEACH, biome: BIOME.FOREST });
      expect(R.at(-1)).toMatchObject({ x0: 4130, x1: 4200, variant: VARIANT.BEACH, biome: BIOME.FOREST });
      const outerW = R[1], outerE = R.at(-2)!;
      expect(new Set([outerW.biome, outerE.biome])).toEqual(new Set([BIOME.SNOW, BIOME.JUNGLE]));
      for (const o of [outerW, outerE]) {
        const w = o.x1 - o.x0;
        if (o.biome === BIOME.SNOW) { expect(w).toBeGreaterThanOrEqual(420); expect(w).toBeLessThanOrEqual(546); }
        else { expect(w).toBeGreaterThanOrEqual(504); expect(w).toBeLessThanOrEqual(630); }
      }
      snowSides.add(outerW.biome === BIOME.SNOW ? 'w' : 'e');
      const deserts = R.filter((r) => r.biome === BIOME.DESERT); expect(deserts).toHaveLength(1);
      const d = deserts[0], dw = d.x1 - d.x0; expect(dw).toBeGreaterThanOrEqual(315); expect(dw).toBeLessThanOrEqual(420);
      if (d.x1 <= 1680) { expect(d.x0 - outerW.x1).toBeGreaterThanOrEqual(84); expect(1680 - d.x1).toBeGreaterThanOrEqual(84); desertSides.add('w'); }
      else { expect(d.x0 - 2520).toBeGreaterThanOrEqual(84); expect(outerE.x0 - d.x1).toBeGreaterThanOrEqual(84); desertSides.add('e'); }
      for (const r of R) if (r.biome === BIOME.FOREST && r.variant !== VARIANT.BEACH && r.variant !== VARIANT.SPAWN)
        expect([VARIANT.PLAIN, VARIANT.HILLS]).toContain(r.variant);
      expect(R.filter((r) => r.variant === VARIANT.SPAWN)).toHaveLength(1);
    }
    expect(snowSides.size).toBe(2); expect(desertSides.size).toBe(2);
  });

  it('家鄉除兩端海灘外每個地區都 ≥ 84 寬（SEEDS20 + 300 個雜湊種子）', () => {
    const seeds = [...SEEDS20, ...Array.from({ length: 300 }, (_, k) => `h${(Math.imul(k + 1, 2654435761) >>> 0).toString(36)}`)];
    for (const seed of seeds) {
      const R = L(seed).landmassAt(SPAWN_X)!.regions;
      for (const r of R) if (r.variant !== VARIANT.BEACH) expect(r.x1 - r.x0, `${seed} [${r.x0}, ${r.x1})`).toBeGreaterThanOrEqual(84);
      expect(R.filter((r) => r.variant === VARIANT.BEACH)).toHaveLength(2);
    }
  });

  it('鎖覆寫文化並往後推', () => { const locks = new LockTable(); const free = L('s');
    const c1 = free.landmass(1, 2).culture; locks.lock(1, 2, { ver: 0, culture: c1 ? null : 'mistbamboo' });
    const lay = L('s', locks); expect(lay.landmass(1, 2).culture).toBe(c1 ? null : 'mistbamboo');
    expect(lay.landmass(1, 4).culture).not.toBe(lay.landmass(1, 2).culture); });

  it('鎖的 ver 寫進地塊；沒鎖的地塊用 latestVer', () => {
    const locks = new LockTable(); locks.lock(1, 3, { ver: 0, culture: null });
    const lay = new Layout('v', newWorldOrigin(341, 334), locks, 0);
    expect(lay.landmass(1, 3).ver).toBe(0); expect(lay.landmass(-1, 3).ver).toBe(0);
  });

  it('regionAt 與 landmassAt 一致、與查詢順序無關、跨實例相同', () => { const xs: number[] = []; for (let x = -60_000; x < 60_000; x += 97) xs.push(x);
    const a = L('ord'), b = L('ord'), fa = xs.map((x) => a.regionAt(x)), fb = [...xs].reverse().map((x) => b.regionAt(x)).reverse();
    expect(fb).toEqual(fa);
    xs.forEach((x, k) => { const m = a.landmassAt(x)!, r = fa[k]!; expect(r.x0).toBeLessThanOrEqual(x); expect(r.x1).toBeGreaterThan(x);
      expect(m.regions).toContainEqual(r); expect([r.side, r.landmass]).toEqual([m.side, m.i]); }); });

  it('不同種子版面不同；延伸到 ±X_LIMIT 為止', () => {
    const ends = SEEDS20.map((s) => L(s).landmass(1, 3).x1); expect(new Set(ends).size).toBeGreaterThan(1);
    const lay = L('far');
    expect(lay.landmassAt(999_999)).not.toBeNull(); expect(lay.landmassAt(-1_000_000)).not.toBeNull();
    expect(lay.landmassAt(1_000_000)).toBeNull(); expect(lay.landmassAt(-1_000_001)).toBeNull();
    expect(lay.regionAt(1_000_000)).toBeNull();
  });

  it('烘焙原點：東側從大陸開始時第一片是 tier 1 的大陸', () => {
    const lay = new Layout('s', { home: null, east: { x: 10_000, start: 'continent', seaY: 345, shore: 340 }, west: { x: -1_000, start: 'sea', seaY: 331, shore: 320 } }, new LockTable(), 0);
    expect(lay.landmass(1, 1)).toMatchObject({ kind: 'continent', x0: 10_000, tier: 1 }); expect(lay.landmassAt(5_000)).toBeNull();
    expect(lay.landmass(1, 2)).toMatchObject({ kind: 'sea', x0: lay.landmass(1, 1).x1, tier: 2 });
    expect(lay.landmass(-1, 1)).toMatchObject({ kind: 'sea', x1: -1_000, tier: 1 });
    expect([lay.landmass(1, 1).culture, lay.landmass(-1, 2).culture].filter((c) => c === 'mistbamboo')).toHaveLength(1);
    expect(lay.landmassAt(9_999)).toBeNull(); expect(lay.landmassAt(-1_000)).toBeNull();
    expect(lay.landmassAt(10_000)!.i).toBe(1); expect(lay.landmassAt(-1_001)!.i).toBe(1);
  });

  it('newWorldOrigin', () => {
    expect(newWorldOrigin(341, 334)).toEqual({ home: { x0: 0, x1: 4200 }, east: { x: 4200, start: 'sea', seaY: 341, shore: 334 }, west: { x: 0, start: 'sea', seaY: 341, shore: 334 } });
    expect(SEA_SLOT_W).toBe(300);
  });
});

describe('gen2 cultures', () => {
  it('文化池與 poolFor', () => {
    expect(CULTURE_POOL).toEqual({ 0: ['mistbamboo', null] });
    expect(poolFor(0)).toEqual(['mistbamboo', null]); expect(poolFor(5)).toBe(CULTURE_POOL[0]);
    expect(() => poolFor(-1)).toThrow(RangeError);
    expect(CULTURES.mistbamboo.name).toBe('霧竹之國'); expect(CULTURES.mistbamboo.prefixes).toHaveLength(8);
    expect(new Set(CULTURES.mistbamboo.prefixes).size).toBe(8);
    expect(CULTURES.mistbamboo.suffixes).toEqual(['山', '谷', '之里']);
  });
});
