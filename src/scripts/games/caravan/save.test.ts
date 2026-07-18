import { describe, it, expect, beforeEach } from 'vitest';
import { SAVE_KEY, saveGame, loadGame, exportSave, importSave, newGame } from './save';

// happy-dom 提供 localStorage；每案例清空
beforeEach(() => localStorage.clear());

describe('save（版本化存檔）', () => {
  it('newGame 給出 v1 初始檔（金幣 200、無旗標）', () => {
    const s = newGame(1000);
    expect(s).toEqual({ version: 1, createdAt: 1000, gold: 200, flags: {} });
  });

  it('saveGame 後 loadGame 取回相同資料', () => {
    const s = newGame(1000);
    s.gold = 350;
    s.flags['met_guildmaster'] = true;
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
