// serialize.appearance.test.ts — 存檔格式 9：角色外觀（header.appearance）存檔 → 讀回一模一樣；
// 沒有 / 壞掉的外觀不算存檔損毀（退回預設）；外觀不影響其他欄位。
import { describe, it, expect } from 'vitest';
import { DelveGame } from '../engine/game';
import { DEFAULT_APPEARANCE, randomAppearance, type Appearance } from '../engine/appearance';
import { decodeSave, encodeSave, restoreGame, serializeGame, snapshotGame, SAVE_FORMAT } from './serialize';

const SMALL = { width: 128, height: 96 };
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}

describe('存檔：角色外觀', { timeout: 60_000 }, () => {
  it('格式 9 起 header.appearance 存著外觀', () => {
    expect(SAVE_FORMAT).toBe(9);
    const g = new DelveGame({ seed: 'look', ...SMALL, peaceful: true });
    expect(snapshotGame(g).header.appearance).toEqual(DEFAULT_APPEARANCE);
  });

  it('新遊戲可以指定外觀；存檔 → 讀回一模一樣（多組隨機外觀）', () => {
    const r = lcg(11);
    for (let i = 0; i < 6; i++) {
      const look: Appearance = randomAppearance(r);
      const g = new DelveGame({ seed: `look-${i}`, ...SMALL, peaceful: true, appearance: look });
      expect(g.appearance).toEqual(look);
      const back = restoreGame(serializeGame(g));
      expect(back.ok).toBe(true);
      if (back.ok) expect(back.game.appearance).toEqual(look);
    }
  });

  it('遊戲中換外觀（setAppearance）也會存進去；setAppearance 換成新物件（渲染器用參考判斷要不要重烘）', () => {
    const g = new DelveGame({ seed: 'look-change', ...SMALL, peaceful: true });
    const before = g.appearance;
    const look = { ...DEFAULT_APPEARANCE, hair: 4, hairColor: 7, acc: 2, glasses: true };
    g.setAppearance(look);
    expect(g.appearance).not.toBe(before);
    expect(g.appearance).not.toBe(look);
    const back = restoreGame(serializeGame(g));
    expect(back.ok && back.game.appearance).toEqual(look);
  });

  it('沒有外觀的舊存檔 / 外觀欄位壞掉：照樣讀得到，外觀退回預設（壞的欄位各自退回）', () => {
    const g = new DelveGame({ seed: 'look-old', ...SMALL, peaceful: true, appearance: { ...DEFAULT_APPEARANCE, hair: 5 } });
    const data = snapshotGame(g);
    delete (data.header as { appearance?: unknown }).appearance;
    const a = restoreGame(encodeSave(data));
    expect(a.ok && a.game.appearance).toEqual(DEFAULT_APPEARANCE);
    (data.header as { appearance?: unknown }).appearance = { hair: 999, hairColor: 3, glasses: 'x' };
    const bytes = encodeSave(data);
    expect(decodeSave(bytes).header.appearance).toEqual({ ...DEFAULT_APPEARANCE, hairColor: 3 });
    const b = restoreGame(bytes);
    expect(b.ok && b.game.appearance).toEqual({ ...DEFAULT_APPEARANCE, hairColor: 3 });
    (data.header as { appearance?: unknown }).appearance = 'garbage';
    const c = restoreGame(encodeSave(data));
    expect(c.ok && c.game.appearance).toEqual(DEFAULT_APPEARANCE);
  });
});

describe('存檔：外觀欄（時裝）與防具隱藏', { timeout: 60_000 }, () => {
  it('外觀欄四格（含當樣子用的防具詞條）與隱藏開關存檔 → 讀回一樣；紙娃娃 key 也一樣', () => {
    const g = new DelveGame({ seed: 'vanity', ...SMALL, peaceful: true });
    g.equip('iron_chestplate'); g.equip('gold_helmet'); g.equip('feather_charm');
    g.vanity.set('body', 'sailor_top');
    g.vanity.set('legs', 'gold_greaves', { rarity: 4, ilvl: 4, plus: 2, affixes: [] });
    g.vanity.set('back', 'travel_cape');
    g.setHideArmor('head', true);
    const key = g.doll().key;
    const back = restoreGame(serializeGame(g));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.game.vanity.toJSON()).toEqual(g.vanity.toJSON());
    expect(back.game.vanity.hide).toEqual({ head: true, body: false, legs: false });
    expect(back.game.doll().key).toBe(key);
    // 外觀欄不影響數值：防禦只算身上的防具
    expect(back.game.stats().defense).toBe(g.stats().defense);
  });
  it('沒有外觀欄的存檔 / 壞資料：讀得到，外觀欄空、不隱藏', () => {
    const g = new DelveGame({ seed: 'vanity-old', ...SMALL, peaceful: true });
    const data = snapshotGame(g);
    delete (data.header as { vanity?: unknown }).vanity;
    const a = restoreGame(encodeSave(data));
    expect(a.ok && a.game.vanity.toJSON()).toEqual(new DelveGame({ seed: 'x', ...SMALL }).vanity.toJSON());
    (data.header as { vanity?: unknown }).vanity = { slots: { head: 'dirt', body: 'miko_robe' }, hide: 7 };
    const b = restoreGame(encodeSave(data));
    expect(b.ok && b.game.vanity.get('head')).toBeNull();
    expect(b.ok && b.game.vanity.get('body')).toBe('miko_robe');
  });

  it('沒有 race 的舊 header.appearance 讀回人類；存了種族則讀回一樣', () => {
    const g = new DelveGame({ seed: 'look-race', ...SMALL, peaceful: true, appearance: { ...DEFAULT_APPEARANCE, hair: 5, race: 2 } });
    const data = snapshotGame(g);
    const { race: _drop, ...noRace } = data.header.appearance as Appearance;
    (data.header as { appearance?: unknown }).appearance = noRace;
    const a = restoreGame(encodeSave(data));
    expect(a.ok && a.game.appearance).toEqual({ ...DEFAULT_APPEARANCE, hair: 5, race: 0 });
    const b = restoreGame(encodeSave(snapshotGame(g)));
    expect(b.ok && b.game.appearance.race).toBe(2);
  });
});
