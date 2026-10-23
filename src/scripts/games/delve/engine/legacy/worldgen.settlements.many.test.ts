// worldgen.settlements.many.test.ts — 20 個種子：村落數量分布、村落 / 地廳 / 隧道完全不會淹水、地下湖的地標放置率
import { describe, it, expect, beforeAll } from 'vitest';
import { generateWorld, type GenResult } from './worldgen';
import { T } from '../tiles';

const SEEDS = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'folk-e2e', 'zeta7', 'omega', 's1', 's2', 's3', 's4', 'world',
  'npc-village', 'dwarf-deep', 'kappa', 'lambda', 'sigma', 'tau', 'upsilon'];

describe('20 個種子的村落 / 地廳', { timeout: 600_000 }, () => {
  const gens: { seed: string; g: GenResult }[] = [];
  beforeAll(() => { for (const seed of SEEDS) gens.push({ seed, g: generateWorld(seed) }); }, 600_000);

  it('每個世界至少 2 座村落，3 座以上是常態；每個世界都有嚮導可以找（村落 ≥ 2）', () => {
    const dist: Record<number, number> = {};
    for (const { g } of gens) dist[g.villages.length] = (dist[g.villages.length] ?? 0) + 1;
    console.log('[villages]', JSON.stringify(dist), '[halls]', JSON.stringify(gens.reduce<Record<number, number>>((a, { g }) => { a[g.halls.length] = (a[g.halls.length] ?? 0) + 1; return a; }, {})));
    for (const { seed, g } of gens) {
      expect(g.villages.length, seed).toBeGreaterThanOrEqual(2);
      expect(g.halls.length, seed).toBeGreaterThanOrEqual(1);
    }
    const three = gens.filter(({ g }) => g.villages.length >= 3).length;
    expect(three / gens.length).toBeGreaterThanOrEqual(0.5);
  });

  it('村落（含兩側緩坡）、地廳與兩側隧道裡沒有任何液體', () => {
    const wet: string[] = [];
    for (const { seed, g } of gens) {
      const w = g.world;
      const dry = (x0: number, x1: number, y0: number, y1: number, what: string): void => {
        let n = 0;
        for (let y = Math.max(0, y0); y <= Math.min(w.height - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(w.width - 1, x1); x++) if (w.liquid[y * w.width + x]) n++;
        if (n) wet.push(`${seed} ${what}: ${n}`);
      };
      g.villages.forEach((v, i) => dry(v.x0 - 9, v.x1 + 9, v.ground - 30, v.ground, `v${i}`));
      g.halls.forEach((h, i) => {
        dry(h.x0 - 2, h.x1 + 2, h.y0 - 2, h.floorY, `h${i}`);
        for (const t of h.tunnels) dry(t.x0, t.x1, h.floorY - 4, h.floorY - 1, `h${i} tunnel`);
      });
    }
    expect(wet).toEqual([]);
  });

  it('地下湖的地標放置率 ≥ 90%（找不到岸就在水面鑿石台）；村旗與桿頂燈都在', () => {
    let want = 0, got = 0;
    for (const { g } of gens) {
      for (const s of g.structures) {
        if (s.kind !== 'underground_lake') continue;
        want++;
        if (g.landmarks.some((l) => l.site === 'underground_lake' && l.x >= s.x - 14 && l.x < s.x + s.w + 14 && l.y >= s.y - 14 && l.y < s.y + s.h + 14)) got++;
      }
      for (const v of g.villages) {
        let cloth = 0, lamps = 0;
        for (let x = v.x0 - 4; x <= v.x1 + 4; x++) for (let y = v.ground - 16; y < v.ground; y++) {
          const id = g.world.getFg(x, y);
          if (id === T.FLAG_CLOTH) cloth++;
          if (id === T.FLAG_LAMP) lamps++;
        }
        expect(cloth).toBe(18);
        expect(lamps).toBe(2);
      }
    }
    console.log('[underground_lake landmarks]', got, '/', want);
    expect(got / Math.max(1, want)).toBeGreaterThanOrEqual(0.9);
  });
});
