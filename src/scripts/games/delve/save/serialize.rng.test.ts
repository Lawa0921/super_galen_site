// serialize.rng.test.ts — 掉寶 / 釣魚亂數的狀態跟著存檔：讀檔後的掉落結果和沒存檔時一模一樣（重讀不會重骰）
import { describe, it, expect } from 'vitest';
import { DelveGame } from '../engine/game';
import { Rng, sfc32, xmur3 } from '../engine/rng';
import { serializeGame, restoreGame, snapshotGame, encodeSave, decodeSave } from './serialize';

const SMALL = { width: 160, height: 100 };

describe('Rng 狀態', () => {
  it('getState / setState：接回同一個狀態 → 之後的序列完全相同', () => {
    const a = new Rng('state');
    for (let i = 0; i < 37; i++) a.next();
    const s = a.getState();
    expect(s).toHaveLength(4);
    for (const v of s) expect(Number.isInteger(v) && v >= 0 && v <= 0xffffffff).toBe(true);
    const want = Array.from({ length: 20 }, () => a.next());
    const b = new Rng('other-seed');
    b.setState(s);
    expect(Array.from({ length: 20 }, () => b.next())).toEqual(want);
  });
  it('加上狀態存取後，序列與原本的 sfc32 相同（世界生成不變）', () => {
    // 對照：直接用 sfc32（xmur3 四個種子 + 暖機 12 次）
    const r = new Rng('delve');
    const got = Array.from({ length: 50 }, () => r.next());
    const s = xmur3('delve'), f = sfc32(s(), s(), s(), s());
    for (let i = 0; i < 12; i++) f();
    expect(got).toEqual(Array.from({ length: 50 }, () => f()));
  });
});

describe('存檔：掉寶亂數狀態', { timeout: 120_000 }, () => {
  const roll = (g: DelveGame): unknown => g.giveGear('gold_sword', 3);
  it('存檔 → 讀檔後下一件裝備的詞條和不讀檔繼續玩的一樣', () => {
    const g = new DelveGame({ seed: 'rng-save', ...SMALL, peaceful: true });
    for (let i = 0; i < 5; i++) roll(g); // 推進掉寶亂數
    g.inventory.slots.fill(null);
    const bytes = serializeGame(g);
    const r = restoreGame(bytes);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const next = [roll(g), roll(g), roll(g)], again = [roll(r.game), roll(r.game), roll(r.game)];
    expect(again).toEqual(next);
    // 對照組：新開的同種子遊戲（狀態沒推進）會骰出不一樣的東西
    const fresh = new DelveGame({ seed: 'rng-save', ...SMALL, peaceful: true });
    expect([roll(fresh), roll(fresh), roll(fresh)]).not.toEqual(next);
  });
  it('釣魚亂數也存；壞的狀態被忽略（不算損毀，沿用種子起點）', () => {
    const g = new DelveGame({ seed: 'rng-fish', ...SMALL, peaceful: true });
    const snap = snapshotGame(g);
    expect(snap.header.extra?.rng?.loot).toHaveLength(4);
    expect(snap.header.extra?.rng?.fish).toHaveLength(4);
    snap.header.extra!.rng = { loot: [1, 2, 'x' as unknown as number, 4], fish: [1, 2, 3] as unknown as [number, number, number, number] };
    const d = decodeSave(encodeSave(snap));
    expect(d.header.extra?.rng).toBeUndefined();
    const r = restoreGame(d);
    expect(r.ok).toBe(true);
  });
});
