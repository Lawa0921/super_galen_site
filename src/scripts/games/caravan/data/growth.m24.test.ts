import { describe, expect, it } from 'vitest';
import {
  loadGame,
  newGame,
  realizeSaveGrowth,
  saveGame,
  STARTING_PROFILE,
} from '../save';
import type { SaveData } from '../save';
import { realizedGrowthBonuses } from './growth';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

function growthSave(): SaveData {
  return newGame(123, {
    job: 'swordsman',
    trait: 'brawny',
    allocation: { str: 2, con: 1 },
  });
}

function statTotal(save: SaveData): number {
  return Object.values(save.protagonist.stats).reduce((sum, value) => sum + value, 0);
}

describe('M24 潛力實現交易', () => {
  it('升級後保存會一次性實現尚未取得的潛力屬性與生命', () => {
    const save = growthSave();
    const growth = save.protagonist.growth!;
    const beforeStats = { ...save.protagonist.stats };
    const beforeHp = save.protagonist.maxHp;
    save.protagonist.level = 4;

    realizeSaveGrowth(save);
    const expected = realizedGrowthBonuses(growth, 4);
    for (const stat of Object.keys(beforeStats) as Array<keyof typeof beforeStats>) {
      expect(save.protagonist.stats[stat] - beforeStats[stat]).toBe(expected.stats[stat] ?? 0);
    }
    expect(save.protagonist.maxHp - beforeHp).toBe(expected.maxHp);
    expect(save.protagonist.growthRealizedLevel).toBe(4);
  });

  it('重複保存、載入與匯出不會重複灌入同一批成長', () => {
    const storage = new MemoryStorage();
    const save = growthSave();
    save.protagonist.level = 5;
    saveGame(save, storage);
    const firstStats = { ...save.protagonist.stats };
    const firstHp = save.protagonist.maxHp;

    saveGame(save, storage);
    realizeSaveGrowth(save);
    expect(save.protagonist.stats).toEqual(firstStats);
    expect(save.protagonist.maxHp).toBe(firstHp);

    const loaded = loadGame(storage)!;
    expect(loaded.protagonist.stats).toEqual(firstStats);
    expect(loaded.protagonist.maxHp).toBe(firstHp);
    expect(loaded.protagonist.growthRealizedLevel).toBe(5);
  });

  it('跨多級補領與逐級保存會得到相同最終數值', () => {
    const direct = growthSave();
    direct.protagonist.level = 5;
    realizeSaveGrowth(direct);

    const stepped = growthSave();
    for (let level = 2; level <= 5; level++) {
      stepped.protagonist.level = level;
      realizeSaveGrowth(stepped);
    }

    expect(stepped.protagonist.stats).toEqual(direct.protagonist.stats);
    expect(stepped.protagonist.maxHp).toBe(direct.protagonist.maxHp);
    expect(stepped.protagonist.growthRealizedLevel).toBe(5);
  });

  it('玩家手動配點保留，潛力只追加自身差分', () => {
    const save = growthSave();
    const before = statTotal(save);
    save.protagonist.stats.cha += 2;
    save.protagonist.level = 3;
    const expectedGrowth = Object.values(realizedGrowthBonuses(save.protagonist.growth, 3).stats)
      .reduce((sum, value) => sum + (value ?? 0), 0);

    realizeSaveGrowth(save);
    expect(statTotal(save) - before).toBe(2 + expectedGrowth);
  });

  it('舊 M23 存檔缺少實現標記時，依目前等級安全補算一次', () => {
    const storage = new MemoryStorage();
    const save = growthSave();
    save.protagonist.level = 4;
    delete save.protagonist.growthRealizedLevel;
    storage.setItem('caravan-save-v1', JSON.stringify(save));

    const loaded = loadGame(storage)!;
    const expected = realizedGrowthBonuses(loaded.protagonist.growth, 4);
    const original = growthSave();
    for (const stat of Object.keys(original.protagonist.stats) as Array<keyof typeof original.protagonist.stats>) {
      expect(loaded.protagonist.stats[stat] - original.protagonist.stats[stat]).toBe(expected.stats[stat] ?? 0);
    }
    expect(loaded.protagonist.growthRealizedLevel).toBe(4);
  });

  it('無潛力的舊角色維持原本數值與升級規則', () => {
    const save = newGame(123, { job: 'swordsman', trait: null });
    save.protagonist.level = 5;
    const stats = { ...save.protagonist.stats };
    const hp = save.protagonist.maxHp;
    realizeSaveGrowth(save);
    expect(save.protagonist.stats).toEqual(stats);
    expect(save.protagonist.maxHp).toBe(hp);
    expect(save.protagonist.growthRealizedLevel).toBeUndefined();
    expect(stats).toEqual(STARTING_PROFILE.swordsman.stats);
  });

  it('毀損潛力不能產生屬性或生命增益', () => {
    const save = growthSave();
    save.protagonist.growth = { potential: { str: 99 } } as never;
    save.protagonist.level = 5;
    const stats = { ...save.protagonist.stats };
    const hp = save.protagonist.maxHp;
    realizeSaveGrowth(save);
    expect(save.protagonist.stats).toEqual(stats);
    expect(save.protagonist.maxHp).toBe(hp);
  });
});
