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
