// race.test.ts — 種族被動表：逐字數值、壞索引退回人類
import { describe, it, expect } from 'vitest';
import { raceMods, RACE_BLURB } from './race';
import { RACES, raceId, DEFAULT_APPEARANCE } from './appearance';

describe('種族被動表', () => {
  it('RACES 順序固定：人類 / 精靈 / 矮人 / 貓族 / 龍裔', () => {
    expect(RACES.map((r) => r.id)).toEqual(['human', 'elf', 'dwarf', 'catfolk', 'dragonkin']);
    expect(RACES.map((r) => r.zh)).toEqual(['人類', '精靈', '矮人', '貓族', '龍裔']);
  });
  it('各族數值', () => {
    expect(raceMods(0).xpPct).toBe(10);
    expect(raceMods(1).light).toBe(1);
    expect(raceMods(2).mineMul).toBe(1.15);
    expect(raceMods(3).safeFall).toBe(6);
    expect(raceMods(3).jumpMul).toBe(1.08);
    expect(raceMods(4).burnMul).toBe(0.5);
    expect(raceMods(4).lavaMul).toBe(0.75);
  });
  it('其餘欄位為中性值', () => {
    expect(raceMods(0)).toEqual({ xpPct: 10, light: 0, mineMul: 1, safeFall: 0, jumpMul: 1, burnMul: 1, lavaMul: 1 });
    expect(raceMods(2)).toEqual({ xpPct: 0, light: 0, mineMul: 1.15, safeFall: 0, jumpMul: 1, burnMul: 1, lavaMul: 1 });
  });
  it('壞索引 → 人類', () => {
    for (const bad of [99, -1, 1.5, NaN]) expect(raceMods(bad)).toEqual(raceMods(0));
  });
  it('raceId / RACE_BLURB', () => {
    expect(raceId({ ...DEFAULT_APPEARANCE, race: 2 })).toBe('dwarf');
    expect(raceId({ ...DEFAULT_APPEARANCE, race: 9 })).toBe('human');
    for (const r of RACES) expect(RACE_BLURB[r.id as keyof typeof RACE_BLURB].length).toBeGreaterThan(0);
    expect(RACE_BLURB.dwarf).toBe('矮人：挖掘速度 +15%');
  });
});
