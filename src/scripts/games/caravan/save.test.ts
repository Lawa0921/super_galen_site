import { describe, it, expect, beforeEach } from 'vitest';
import { SAVE_KEY, saveGame, loadGame, exportSave, importSave, newGame } from './save';
import { EXPEDITION_VERSION } from './expedition';

// happy-dom 提供 localStorage；每案例清空
beforeEach(() => localStorage.clear());

describe('save（版本化存檔）', () => {
  it('newGame 產出 v5：含預設主角、空傭兵清單、空背包、無進行中遠征、經營層預設值、裝備三欄皆空（M5）', () => {
    const s = newGame(1000);
    expect(s.version).toBe(5);
    expect(s.protagonist.name).toBe('你');
    expect(s.protagonist.job).toBe('swordsman');
    expect(s.protagonist.equipment).toEqual({ weapon: null, armor: null, trinket: null });
    expect(s.companions).toEqual([]);
    expect(s.gold).toBe(200);
    expect(s.inventory).toEqual({});
    expect(s.expedition).toBeNull();
    expect(s.wagonLevel).toBe(0);
    expect(s.tavernSeed).toBe(1000);
    expect(s.reputation).toBe(0);
    expect(s.visitedBossDungeons).toEqual([]);
  });

  it('v1 舊檔 loadGame 一路遷移到 v5 且保留原金幣與旗標，tavernSeed 取 createdAt', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, createdAt: 5, gold: 777, flags: { met: true } }));
    const s = loadGame();
    expect(s?.version).toBe(5);
    expect(s?.gold).toBe(777);
    expect(s?.flags).toEqual({ met: true });
    expect(s?.protagonist.id).toBe('protagonist');
    expect(s?.protagonist.equipment).toEqual({ weapon: null, armor: null, trinket: null });
    expect(s?.inventory).toEqual({});
    expect(s?.expedition).toBeNull();
    expect(s?.wagonLevel).toBe(0);
    expect(s?.tavernSeed).toBe(5);
    expect(s?.reputation).toBe(0);
    expect(s?.visitedBossDungeons).toEqual([]);
  });

  it('v2 舊檔 loadGame 遷移為 v5：補上 inventory/expedition/經營層/裝備欄位，其餘欄位不變', () => {
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
    expect(s?.version).toBe(5);
    expect(s?.gold).toBe(300);
    expect(s?.inventory).toEqual({});
    expect(s?.expedition).toBeNull();
    expect(s?.wagonLevel).toBe(0);
    expect(s?.tavernSeed).toBe(5);
    expect(s?.reputation).toBe(0);
    expect(s?.visitedBossDungeons).toEqual([]);
    expect(s?.protagonist.equipment).toEqual({ weapon: null, armor: null, trinket: null });
  });

  it('v3 舊檔 loadGame 遷移為 v5：補上 wagonLevel/tavernSeed/reputation/visitedBossDungeons/裝備欄位', () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: 3,
        createdAt: 42,
        gold: 150,
        flags: {},
        protagonist: { id: 'protagonist', name: '你', job: 'swordsman', level: 1, xp: 0,
          stats: { str: 12, dex: 12, int: 10, cha: 12, con: 12 }, maxHp: 22, injuredForTrips: 0 },
        companions: [],
        inventory: { herb: 2 },
        expedition: null,
      })
    );
    const s = loadGame();
    expect(s?.version).toBe(5);
    expect(s?.gold).toBe(150);
    expect(s?.inventory).toEqual({ herb: 2 });
    expect(s?.wagonLevel).toBe(0);
    expect(s?.tavernSeed).toBe(42);
    expect(s?.reputation).toBe(0);
    expect(s?.visitedBossDungeons).toEqual([]);
    expect(s?.protagonist.equipment).toEqual({ weapon: null, armor: null, trinket: null });
  });

  it('v4 舊檔 loadGame 遷移為 v5：主角與全部傭兵補上 equipment 預設（weapon/armor/trinket 皆 null，M5）', () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: 4,
        createdAt: 7,
        gold: 500,
        flags: {},
        protagonist: { id: 'protagonist', name: '你', job: 'swordsman', level: 2, xp: 50,
          stats: { str: 12, dex: 12, int: 10, cha: 12, con: 12 }, maxHp: 22, injuredForTrips: 0 },
        companions: [
          { id: 'comp-1', name: '甲', job: 'ranger', level: 1, xp: 0,
            stats: { str: 10, dex: 16, int: 10, cha: 10, con: 10 }, maxHp: 20, injuredForTrips: 0 },
          { id: 'comp-2', name: '乙', job: 'cleric', level: 1, xp: 0,
            stats: { str: 10, dex: 8, int: 12, cha: 16, con: 12 }, maxHp: 22, injuredForTrips: 1 },
        ],
        inventory: { herb: 3 },
        expedition: null,
        wagonLevel: 1,
        tavernSeed: 7,
        reputation: 40,
        visitedBossDungeons: ['goblin-den'],
      })
    );
    const s = loadGame();
    expect(s?.version).toBe(5);
    expect(s?.gold).toBe(500);
    expect(s?.protagonist.equipment).toEqual({ weapon: null, armor: null, trinket: null });
    expect(s?.companions).toHaveLength(2);
    for (const companion of s?.companions ?? []) {
      expect(companion.equipment).toEqual({ weapon: null, armor: null, trinket: null });
    }
    // 其餘欄位不受影響
    expect(s?.companions[1].injuredForTrips).toBe(1);
    expect(s?.wagonLevel).toBe(1);
    expect(s?.reputation).toBe(40);
    expect(s?.visitedBossDungeons).toEqual(['goblin-den']);
  });

  it('v5 檔 protagonist 缺 equipment → 視為毀損回 null（M5 shape 驗證）', () => {
    const s = newGame(1000) as unknown as Record<string, unknown>;
    const protagonist = s.protagonist as Record<string, unknown>;
    delete protagonist.equipment;
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    expect(loadGame()).toBeNull();
  });

  it('v2 檔缺 protagonist → 視為毀損回 null', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 2, createdAt: 1, gold: 5, flags: {}, companions: [] }));
    expect(loadGame()).toBeNull();
  });

  it('v5 檔缺 inventory → 視為毀損回 null', () => {
    const s = newGame(1000) as unknown as Record<string, unknown>;
    delete s.inventory;
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    expect(loadGame()).toBeNull();
  });

  it('v5 檔 expedition 型別錯誤（非 null 也非物件）→ 視為毀損回 null', () => {
    const s = newGame(1000) as unknown as Record<string, unknown>;
    s.expedition = 'not-an-object-or-null';
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    expect(loadGame()).toBeNull();
  });

  it.each(['wagonLevel', 'tavernSeed', 'reputation', 'visitedBossDungeons'] as const)(
    'v5 檔缺 %s → 視為毀損回 null',
    (field) => {
      const s = newGame(1000) as unknown as Record<string, unknown>;
      delete s[field];
      localStorage.setItem(SAVE_KEY, JSON.stringify(s));
      expect(loadGame()).toBeNull();
    }
  );

  it('v5 檔 visitedBossDungeons 型別錯誤（非陣列）→ 視為毀損回 null', () => {
    const s = newGame(1000) as unknown as Record<string, unknown>;
    s.visitedBossDungeons = 'not-an-array';
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    expect(loadGame()).toBeNull();
  });

  it('importSave 對 v1 字串也會遷移到 v5（與 loadGame 同路徑）', () => {
    const v1 = btoa(encodeURIComponent(JSON.stringify({ version: 1, createdAt: 5, gold: 42, flags: {} })));
    const s = importSave(v1);
    expect(s?.version).toBe(5);
    expect(s?.gold).toBe(42);
    expect(s?.inventory).toEqual({});
    expect(s?.tavernSeed).toBe(5);
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

  it('遠征快照版本防護：expedition 缺 expeditionVersion 欄位（舊版快照）→ load 後 expedition 為 null、gold 完好（M4）', () => {
    const s = newGame(1000) as unknown as Record<string, unknown>;
    s.gold = 456;
    // 手造一個「舊版」遠征快照：沒有 expeditionVersion 欄位（M4 之前的 ExpeditionState 形狀）
    s.expedition = {
      locationId: 'riverside-road', kind: 'route', step: 2, totalSteps: 4,
      phase: 'event', currentEventId: null, roomChoices: null, pendingEncounterId: null,
      loot: { gold: 10, items: {} }, eventLog: [], retreated: false, partyHp: {},
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded?.expedition).toBeNull();
    expect(loaded?.gold).toBe(456);
  });

  it('遠征快照版本防護：expeditionVersion 與 EXPEDITION_VERSION 不符時同樣丟棄', () => {
    const s = newGame(1000) as unknown as Record<string, unknown>;
    s.expedition = {
      locationId: 'riverside-road', kind: 'route', step: 1, totalSteps: 4,
      phase: 'event', currentEventId: null, roomChoices: null, pendingEncounterId: null,
      loot: { gold: 0, items: {} }, eventLog: [], retreated: false, partyHp: {},
      expeditionVersion: EXPEDITION_VERSION - 1, cargo: {},
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    expect(loadGame()?.expedition).toBeNull();
  });

  it('遠征快照版本防護：expeditionVersion 相符時保留遠征快照', () => {
    const s = newGame(1000) as unknown as Record<string, unknown>;
    s.expedition = {
      locationId: 'riverside-road', kind: 'route', step: 1, totalSteps: 4,
      phase: 'event', currentEventId: null, roomChoices: null, pendingEncounterId: null,
      loot: { gold: 0, items: {} }, eventLog: [], retreated: false, partyHp: {},
      expeditionVersion: EXPEDITION_VERSION, cargo: {},
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    expect(loadGame()?.expedition?.locationId).toBe('riverside-road');
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
