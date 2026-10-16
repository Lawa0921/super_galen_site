import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../rng';
import { posKey } from '../map';
import { genFloor } from './gen';
import { fillRooms, type Content } from './rooms';
import { CONDITIONS, type ConditionId } from '../../data/conditions';
import { REGIONS } from '../../data/regions';
import { MATERIALS } from '../../data/materials';

const run = (seed: number, cond: ConditionId = 'plain', boss = false) => {
  const g = genFloor(seed, { depth: 1 + (seed % 5), boss });
  return { g, ...fillRooms(g, mulberry32(seed ^ 0x9e37), CONDITIONS[cond]) };
};
const count = (cs: Content[], kind: Content['kind']) => cs.filter((c) => c.kind === kind).length;

describe('fillRooms', () => {
  it('has at least one chest room, at most one elite and one vault', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { g, contents } = run(seed);
      if (!g.rooms.length) continue;
      expect(count(contents, 'chest'), `seed ${seed}`).toBeGreaterThanOrEqual(1);
      expect(count(contents, 'elite')).toBeLessThanOrEqual(1);
      expect(count(contents, 'vault')).toBeLessThanOrEqual(1);
    }
  });

  it('a vault always comes with a key on the same floor', () => {
    let vaults = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const { contents, map } = run(seed);
      const vault = contents.find((c) => c.kind === 'vault');
      if (!vault) { expect(count(contents, 'key')).toBe(0); continue; }
      vaults++;
      const key = contents.find((c) => c.kind === 'key');
      expect(key, `seed ${seed}`).toBeDefined();
      expect(key!.room).not.toBe(vault.room);
      expect(map.tiles[key!.at.y][key!.at.x]).toBe('key');
      expect(map.tiles[vault.at.y][vault.at.x]).toBe('vault');
    }
    expect(vaults).toBeGreaterThan(0);
  });

  it('bounty adds a chest, calm adds a trap, starfall always has an elite', () => {
    let bountyMore = 0, calmMore = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const g = genFloor(seed, { depth: 2, boss: false });
      if (!g.rooms.length) continue;
      const base = fillRooms(g, mulberry32(seed), CONDITIONS.plain).contents;
      const bounty = fillRooms(g, mulberry32(seed), CONDITIONS.bounty).contents;
      const calm = fillRooms(g, mulberry32(seed), CONDITIONS.calm).contents;
      const star = fillRooms(g, mulberry32(seed), CONDITIONS.starfall).contents;
      if (count(bounty, 'chest') >= count(base, 'chest') + 1) bountyMore++;
      if (count(calm, 'trap') >= count(base, 'trap') + 1) calmMore++;
      expect(count(star, 'elite'), `seed ${seed}`).toBe(1);
    }
    expect(bountyMore).toBeGreaterThan(250);
    expect(calmMore).toBeGreaterThan(250);
  });

  it('contents never sit on the entrance, the stairs or a corridor', () => {
    for (let seed = 1; seed <= 300; seed++) {
      for (const boss of [false, true]) {
        const { g, map, contents } = run(seed, 'starfall', boss);
        const special = new Set([map.entrance, map.up, map.down, map.boss].filter(Boolean).map((p) => posKey(p!)));
        const seen = new Set<string>();
        for (const c of contents) {
          const r = g.rooms[c.room];
          expect(r, `seed ${seed}`).toBeDefined();
          expect(c.at.x >= r.x && c.at.x < r.x + r.w && c.at.y >= r.y && c.at.y < r.y + r.h).toBe(true);
          expect(special.has(posKey(c.at))).toBe(false);
          expect(c.room).not.toBe(g.entranceRoom);
          expect(c.room).not.toBe(g.exitRoom);
          expect(seen.has(posKey(c.at))).toBe(false);
          seen.add(posKey(c.at));
        }
      }
    }
  });

  it('does not mutate the input map and copes with fallback floors', () => {
    const g = genFloor(5, { depth: 1, boss: false });
    const before = JSON.stringify(g.map.tiles);
    fillRooms(g, mulberry32(1), CONDITIONS.plain);
    expect(JSON.stringify(g.map.tiles)).toBe(before);
    const fb = { ...g, rooms: [] };
    const out = fillRooms(fb, mulberry32(1), CONDITIONS.starfall);
    expect(out.contents).toEqual([]);
    expect(out.map.tiles).toEqual(fb.map.tiles);
  });
});

describe('region and condition data', () => {
  it('every non-junk region material exists in data/materials.ts', () => {
    const mats = Object.values(REGIONS).map((r) => r.material).filter((m): m is string => !!m);
    expect(mats.sort()).toEqual(['blaze-core', 'frost-heart', 'iron-shard', 'mire-gland', 'shade-crystal', 'storm-stone']);
    for (const m of mats) expect(MATERIALS[m], m).toBeDefined();
    expect(MATERIALS['blaze-core'].name).toBe('火焰核');
  });

  it('follows the spec tables', () => {
    expect(REGIONS.blaze).toMatchObject({ name: '熾焰之地', element: 'fire', resist: ['fire'], weak: ['ice'] });
    expect(REGIONS.blaze.skill).toMatchObject({ name: '烈焰吐息', target: 'row' });
    expect(REGIONS.shade.weak).toEqual(['thunder']);
    expect(REGIONS.mainline.skill).toBeNull();
    expect(CONDITIONS.fog).toMatchObject({ sight: 0, encounterMul: 0.8 });
    expect(CONDITIONS.calm).toMatchObject({ encounterMul: 0.6, extraTraps: 1 });
    expect(CONDITIONS.plain).toMatchObject({ encounterMul: 1, enemyAtkMul: 1, extraChests: 0, sight: 1 });
  });
});
