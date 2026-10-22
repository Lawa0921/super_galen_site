// 守門：凍結的 format-9 fixture 內容如預期（之後的遷移測試都靠它）。
import { describe, expect, it } from 'vitest';
import { decodeSave, restoreGame } from './serialize';
import { readLegacyFixture } from './legacyFixture';

describe('format-9 fixture', () => {
  it('fixture 是 format 9、每個要拆的欄位都有值', () => {
    const d = decodeSave(readLegacyFixture());
    expect(d.header.format).toBe(9);
    expect(d.header.seed).toBe('fixture-v9');
    expect(d.header.settle!.spawnCore).not.toBeNull();
    expect(Object.keys(d.header.folk!.buffs)).toEqual(['bless']);
    expect(d.header.vitals!.undying).toBe(42);
    expect(d.header.extra!.fishLog).toEqual({ silver_minnow: 3 });
    expect(d.header.markers).toHaveLength(2);
    expect(d.header.appearance!.race).toBe(3);
    expect(d.header.chests!.find((c) => c.i === 58 * 200 + 56)!.slots[0]).toEqual({ item: 'copper_coin', count: 37 });
  });
  it('fixture 用 restoreGame 讀得回來', () => { expect(restoreGame(readLegacyFixture()).ok).toBe(true); });
});
