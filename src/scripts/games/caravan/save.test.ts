import { describe, it, expect, beforeEach } from 'vitest';
import { SAVE_KEY, saveGame, loadGame, exportSave, importSave, newGame } from './save';

// happy-dom 提供 localStorage；每案例清空
beforeEach(() => localStorage.clear());

describe('save（版本化存檔）', () => {
  it('newGame 產出 v3：含預設主角、空傭兵清單、空背包、無進行中遠征', () => {
    const s = newGame(1000);
    expect(s.version).toBe(3);
    expect(s.protagonist.name).toBe('你');
    expect(s.protagonist.job).toBe('swordsman');
    expect(s.companions).toEqual([]);
    expect(s.gold).toBe(200);
    expect(s.inventory).toEqual({});
    expect(s.expedition).toBeNull();
  });

  it('v1 舊檔 loadGame 一路遷移到 v3 且保留原金幣與旗標', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, createdAt: 5, gold: 777, flags: { met: true } }));
    const s = loadGame();
    expect(s?.version).toBe(3);
    expect(s?.gold).toBe(777);
    expect(s?.flags).toEqual({ met: true });
    expect(s?.protagonist.id).toBe('protagonist');
    expect(s?.inventory).toEqual({});
    expect(s?.expedition).toBeNull();
  });

  it('v2 舊檔 loadGame 遷移為 v3：補上 inventory/expedition，其餘欄位不變', () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: 2,
        createdAt: 5,
        gold: 300,
        flags: { hello: true },
        protagonist: { id: 'protagonist', name: '你', job: 'swordsman', level: 1, xp: 0,
          stats: { str: 12, dex: 12, int: 10, cha: 12, con: 12 }, maxHp: 22, injuredForTrips: 0 },
        companions: [],
      })
    );
    const s = loadGame();
    expect(s?.version).toBe(3);
    expect(s?.gold).toBe(300);
    expect(s?.inventory).toEqual({});
    expect(s?.expedition).toBeNull();
  });

  it('v2 檔缺 protagonist → 視為毀損回 null', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 2, createdAt: 1, gold: 5, flags: {}, companions: [] }));
    expect(loadGame()).toBeNull();
  });

  it('v3 檔缺 inventory → 視為毀損回 null', () => {
    const s = newGame(1000) as unknown as Record<string, unknown>;
    delete s.inventory;
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    expect(loadGame()).toBeNull();
  });

  it('v3 檔 expedition 型別錯誤（非 null 也非物件）→ 視為毀損回 null', () => {
    const s = newGame(1000) as unknown as Record<string, unknown>;
    s.expedition = 'not-an-object-or-null';
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    expect(loadGame()).toBeNull();
  });

  it('importSave 對 v1 字串也會遷移到 v3（與 loadGame 同路徑）', () => {
    const v1 = btoa(encodeURIComponent(JSON.stringify({ version: 1, createdAt: 5, gold: 42, flags: {} })));
    const s = importSave(v1);
    expect(s?.version).toBe(3);
    expect(s?.gold).toBe(42);
    expect(s?.inventory).toEqual({});
  });

  it('saveGame 後 loadGame 取回相同資料（含 inventory/expedition）', () => {
    const s = newGame(1000);
    s.gold = 350;
    s.flags['met_guildmaster'] = true;
    s.inventory['herb'] = 3;
    saveGame(s);
    expect(loadGame()).toEqual(s);
  });

  it('無存檔時 loadGame 回 null', () => {
    expect(loadGame()).toBeNull();
  });

  it('毀損 JSON 回 null 而不是丟例外', () => {
    localStorage.setItem(SAVE_KEY, '{not json');
    expect(loadGame()).toBeNull();
  });

  it('缺 version 欄位視為毀損回 null', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ gold: 5 }));
    expect(loadGame()).toBeNull();
  });

  it('export → import 往返相等', () => {
    const s = newGame(1000);
    s.gold = 999;
    const roundTrip = importSave(exportSave(s));
    expect(roundTrip).toEqual(s);
  });

  it('import 垃圾字串回 null', () => {
    expect(importSave('not-base64!!!')).toBeNull();
  });

  it('loadGame：缺 gold/flags/createdAt 的部分毀損檔回 null', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1 }));
    expect(loadGame()).toBeNull();
  });

  it('loadGame：gold 型別錯的存檔回 null', () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ version: 1, createdAt: 1, gold: 'abc', flags: {} })
    );
    expect(loadGame()).toBeNull();
  });

  it('loadGame：version 大於 CURRENT_VERSION（未來版本）回 null', () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ version: 99, createdAt: 1, gold: 5, flags: {} })
    );
    expect(loadGame()).toBeNull();
  });

  it('importSave：編碼後的未來版本檔回 null', () => {
    const encoded = btoa(
      encodeURIComponent(JSON.stringify({ version: 99, createdAt: 1, gold: 5, flags: {} }))
    );
    expect(importSave(encoded)).toBeNull();
  });

  it('importSave：編碼後缺欄位的存檔回 null', () => {
    const encoded = btoa(encodeURIComponent(JSON.stringify({ version: 1 })));
    expect(importSave(encoded)).toBeNull();
  });
});
