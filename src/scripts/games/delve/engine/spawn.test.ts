// spawn.test.ts — 棲地判定、生成表、生成點
import { describe, it, expect } from 'vitest';
import { World, BIOME } from './world';
import { T, W } from './tiles';
import { Rng } from './rng';
import { habitatAt, spawnTable, pickEntry, findSpot, spawnCap, spawnChance, spawnInterval, isFirstNight, inHouse, SPAWN_INTERVAL, NEAR_SPAWN_TILES, type Habitat } from './spawn';
import { DAY_LENGTH } from './constants';
import { NATURAL_KINDS } from './enemies';
import { TILE_SIZE as S } from './constants';

function world(): { w: World; layers: { deep: Int16Array; molten: Int16Array } } {
  const w = new World(80, 120);
  for (let x = 0; x < 80; x++) w.surface[x] = 20;
  for (let y = 20; y < 120; y++) for (let x = 0; x < 80; x++) w.setFg(x, y, T.STONE);
  return { w, layers: { deep: new Int16Array(80).fill(60), molten: new Int16Array(80).fill(100) } };
}
const kinds = (h: Habitat): string[] => spawnTable(h).map((e) => e.kind);

describe('棲地', () => {
  it('地表 / 地下 / 洞穴層 / 熔岩深淵 / 地城 / 菇林', () => {
    const { w, layers } = world();
    const src = { world: w, layers, night: false };
    expect(habitatAt(src, 10, 18).zone).toBe('surface');
    expect(habitatAt(src, 10, 40).zone).toBe('underground');
    expect(habitatAt(src, 10, 70).zone).toBe('cavern');
    expect(habitatAt(src, 10, 105).zone).toBe('molten');
    w.setWall(30, 40, W.DUNGEON_WALL_GREEN);
    expect(habitatAt(src, 30, 40).zone).toBe('dungeon');
    w.setFg(50, 41, T.MUSHROOM_GRASS);
    expect(habitatAt(src, 50, 40).mushroom).toBe(true);
  });
  it('生成表依棲地 / 生態區 / 晝夜不同', () => {
    const base: Habitat = { zone: 'surface', biome: BIOME.FOREST, mushroom: false, night: false };
    expect(kinds(base)).toEqual(['gel_blob']);
    expect(kinds({ ...base, night: true })).toContain('night_walker');
    expect(kinds({ ...base, night: true })).toContain('dusk_owl');
    expect(kinds({ ...base, biome: BIOME.SNOW })).toContain('frost_blob');
    expect(kinds({ ...base, biome: BIOME.SNOW, night: true })).toContain('frost_wolf');
    expect(kinds({ ...base, biome: BIOME.DESERT })).toContain('sand_scorpion');
    expect(kinds({ ...base, biome: BIOME.JUNGLE })).toContain('thorn_hornet');
    expect(kinds({ ...base, zone: 'underground', biome: BIOME.JUNGLE })).toContain('snap_vine');
    expect(kinds({ ...base, zone: 'cavern' })).toEqual(expect.arrayContaining(['cave_bat', 'rock_crab']));
    expect(kinds({ ...base, zone: 'cavern', mushroom: true })).toContain('spore_walker');
    expect(kinds({ ...base, zone: 'dungeon' })).toEqual(['bone_knight', 'cursed_skull']);
    expect(kinds({ ...base, zone: 'molten' })).toEqual(['ember_imp', 'magma_bat']);
    expect(spawnCap({ ...base, night: true })).toBeGreaterThan(spawnCap(base));
  });
  it('每種一般怪物都出現在某個生成表裡', () => {
    const all = new Set<string>();
    for (const zone of ['surface', 'underground', 'cavern', 'molten', 'dungeon'] as const) {
      for (const biome of [0, 1, 2, 3]) for (const night of [false, true]) for (const mushroom of [false, true]) for (const water of [false, true]) {
        for (const k of kinds({ zone, biome, night, mushroom, water })) all.add(k);
      }
    }
    for (const k of NATURAL_KINDS) expect(all.has(k), k).toBe(true);
  });
  it('pickEntry 依權重', () => {
    const r = new Rng('w');
    const t = [{ kind: 'gel_blob' as const, weight: 9 }, { kind: 'cave_bat' as const, weight: 1 }];
    let n = 0;
    for (let i = 0; i < 2000; i++) if (pickEntry(t, r)!.kind === 'gel_blob') n++;
    expect(n / 2000).toBeGreaterThan(0.85);
  });
});

describe('生成點', () => {
  it('地面型找得到站立點（腳下實心、身體所在是空的）；飛行型要空中；植物要貼著方塊', () => {
    const { w } = world();
    // 洞：x 10..20、y 30..35
    for (let y = 30; y <= 35; y++) for (let x = 10; x <= 20; x++) w.setFg(x, y, T.AIR);
    const s = findSpot(w, 'night_walker', 14, 31)!;
    expect(s).not.toBeNull();
    expect(s.y).toBe(36 * S);
    expect(findSpot(w, 'night_walker', 40, 40)).toBeNull();
    expect(findSpot(w, 'cave_bat', 14, 32)).not.toBeNull();
    expect(findSpot(w, 'snap_vine', 10, 33)).not.toBeNull();
  });
  it('有木板牆的地方算房子', () => {
    const { w } = world();
    w.setWall(5, 5, W.PLANK_WALL);
    expect(inHouse(w, 5, 5)).toBe(true);
    expect(inHouse(w, 6, 5)).toBe(false);
  });
});

describe('生成平衡（第一夜 / 出生點附近 / 生成間隔漸進）', () => {
  const night: Habitat = { zone: 'surface', biome: BIOME.FOREST, mushroom: false, night: true };
  it('第一夜：地表夜晚上限 3、機率降低', () => {
    expect(spawnCap(night, { firstNight: true, nearSpawn: true })).toBe(3);
    expect(spawnCap(night, { firstNight: true, nearSpawn: false })).toBe(3);
    expect(spawnChance(night, { firstNight: true, nearSpawn: true })).toBeLessThan(spawnChance(night));
  });
  it('之後的夜晚：出生點附近上限比遠方低；遠方維持 8', () => {
    expect(spawnCap(night, { firstNight: false, nearSpawn: true })).toBe(5);
    expect(spawnCap(night, { firstNight: false, nearSpawn: false })).toBe(8);
    expect(spawnCap(night)).toBe(8);
    expect(NEAR_SPAWN_TILES).toBeGreaterThan(0);
  });
  it('白天 / 地下不受第一夜影響', () => {
    const day: Habitat = { ...night, night: false };
    expect(spawnCap(day, { firstNight: true, nearSpawn: true })).toBe(4);
    expect(spawnCap({ ...night, zone: 'cavern' }, { firstNight: true, nearSpawn: true })).toBe(7);
  });
  it('第一夜 = 遊戲開始後的第一個夜晚（第一天傍晚到第二天清晨）', () => {
    expect(isFirstNight(DAY_LENGTH * 0.85)).toBe(true);
    expect(isFirstNight(DAY_LENGTH * 1.1)).toBe(true);
    expect(isFirstNight(DAY_LENGTH * 1.85)).toBe(false);
  });
  it('生成間隔：剛開始 / 剛重生較慢，逐漸加快到 SPAWN_INTERVAL', () => {
    expect(spawnInterval(0)).toBeGreaterThanOrEqual(2);
    expect(spawnInterval(30)).toBeLessThan(spawnInterval(0));
    expect(spawnInterval(30)).toBeGreaterThan(SPAWN_INTERVAL);
    expect(spawnInterval(600)).toBe(SPAWN_INTERVAL);
    for (let t = 0; t < 300; t += 7) expect(spawnInterval(t + 7)).toBeLessThanOrEqual(spawnInterval(t));
  });
});
