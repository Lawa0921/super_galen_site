// profile.test.ts — gen2 每欄側寫：層線順序、出生平地、AMP 涵蓋、相鄰欄差、海 / 島 / 沙灘、快取一致、烘焙接縫（P13）。
import { describe, it, expect } from 'vitest';
import { Profile2, SEA_Y, SHORE_RAMP, BEACH_W, AMP, COL_SEA, COL_BEACH, COL_LAND, COL_ISLAND } from './profile';
import { Layout, newWorldOrigin, SPAWN_X, VARIANT, type SideOrigin } from './layout';
import { LockTable } from './locks';
import { BIOME } from '../world';

const SEEDS20 = Array.from({ length: 20 }, (_, k) => `seed-${k}`);
const P = (seed = 'p') => new Profile2(seed, new Layout(seed, newWorldOrigin(SEA_Y, SEA_Y - 7), new LockTable(), 0), 1200);
const PO = (east: SideOrigin) =>
  new Profile2('o', new Layout('o', { home: null, east, west: { x: -1000, start: 'sea', seaY: 331, shore: 320 } }, new LockTable(), 0), 1200);

describe('Profile2', () => {
  it('層線順序與範圍', () => {
    for (let x = -40000; x < 40000; x += 97) {
      const i = P().info(x);
      expect(i.surface).toBeGreaterThanOrEqual(1);
      expect(i.surface).toBeLessThan(i.rock);
      expect(i.rock).toBeLessThan(i.deep);
      expect(i.deep).toBeLessThan(i.molten);
      expect(i.molten).toBeLessThan(1200);
    }
  });

  it('出生點 ±60 平坦、±100 內相鄰差 ≤ 4', () => {
    for (const seed of SEEDS20) {
      const p = P(seed), s = p.surfaceAt(SPAWN_X);
      for (let x = SPAWN_X - 60; x <= SPAWN_X + 60; x++) expect(p.surfaceAt(x)).toBe(s);
      for (let x = SPAWN_X - 101; x <= SPAWN_X + 100; x++) expect(Math.abs(p.surfaceAt(x + 1) - p.surfaceAt(x))).toBeLessThanOrEqual(4);
    }
  });

  it('AMP 涵蓋每個 variant', () => {
    for (const v of Object.values(VARIANT)) expect(AMP[v]).toBeTypeOf('number');
  });

  it('相鄰欄地表差 ≤ 4（洞穴不會從側面挖到水）', () => {
    const p = P();
    for (let x = -30000; x < 30000; x++) expect(Math.abs(p.surfaceAt(x + 1) - p.surfaceAt(x))).toBeLessThanOrEqual(4);
  });

  it('海：水面 = seaY、海床在水面下 ≥ 2；島台地在水面上；biome', () => {
    const lay = new Layout('p', newWorldOrigin(SEA_Y, SEA_Y - 7), new LockTable(), 0), p = new Profile2('p', lay, 1200);
    let isl = 0;
    for (const side of [1, -1] as const) for (const i of [1, 3, 5]) {
      const m = lay.landmass(side, i);
      for (let x = m.x0; x < m.x1; x++) {
        const c = p.info(x);
        if (c.kind === COL_SEA) {
          expect(c.waterTop).toBe(SEA_Y);
          expect(c.surface).toBeGreaterThanOrEqual(SEA_Y + 2);
          expect(p.biomeAt(x)).toBe(BIOME.OCEAN);
        }
        if (c.kind === COL_ISLAND) {
          isl++;
          expect(c.surface).toBeLessThan(SEA_Y);
          expect(c.biome).toBe(BIOME.FOREST);
          expect(c.region.kind).toBe('island');
        }
      }
    }
    expect(isl).toBeGreaterThan(0);
  });

  it('沙灘：陸地離水 40 格內 kind = BEACH', () => {
    const p = P();
    for (let x = 0; x < 40; x++) expect(p.info(x).kind).toBe(COL_BEACH);
    for (let x = 4160; x < 4200; x++) expect(p.info(x).kind).toBe(COL_BEACH);
    expect(p.info(200).kind).toBe(COL_LAND);
  });

  it('快取不改變結果', () => {
    const a = P('c'), b = P('c');
    const xs = [...Array(3000)].map((_, k) => ((k * 7919) % 60000) - 30000);
    for (const x of xs) expect(a.info(x)).toEqual(b.info(x));
    for (const x of [...xs].reverse()) expect(a.info(x)).toEqual(b.info(x));
  });

  it('烘焙原點（海開始）：第一道海從 shore 高度斜下', () => {
    const p = PO({ x: 9000, start: 'sea', seaY: 346, shore: 330 });
    expect(Math.abs(p.surfaceAt(9000) - 330)).toBeLessThanOrEqual(2);
    expect(p.waterTopAt(9050)).toBe(346);
    for (let x = 9000; x < 9000 + SHORE_RAMP; x++) expect(Math.abs(p.surfaceAt(x + 1) - p.surfaceAt(x))).toBeLessThanOrEqual(4);
  });

  it('烘焙原點（大陸開始，P13）：從 v1 海床爬升、延續水面、接沙灘再接陸地', () => {
    const p = PO({ x: 9000, start: 'continent', seaY: 346, shore: 392 });
    expect(Math.abs(p.surfaceAt(9000) - 392)).toBeLessThanOrEqual(2);
    expect(p.waterTopAt(9000)).toBe(346);
    expect(p.info(9000).kind).toBe(COL_SEA);
    for (let x = 9000; x < 9000 + SHORE_RAMP + BEACH_W; x++) expect(Math.abs(p.surfaceAt(x + 1) - p.surfaceAt(x))).toBeLessThanOrEqual(4);
    const firstDry = [...Array(SHORE_RAMP + BEACH_W)].map((_, k) => 9000 + k).find((x) => p.waterTopAt(x) === null)!;
    expect(p.info(firstDry).kind).toBe(COL_BEACH);
    expect(p.info(9000 + SHORE_RAMP + BEACH_W + 5).kind).toBe(COL_LAND);
    expect(p.regionAt(9000)!.kind).toMatch(/^(wild|culture)$/);
  });
});
