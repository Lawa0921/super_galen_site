// gen2.lock.test.ts — gen2 每個版本的固定種子輸出雜湊鎖。
// 版本已發佈（凍結）後輸出不得再變。M1 期間 GEN2_VERSION = 0 尚未發佈（unfrozen），v0 的雜湊可以重錄；
// M2 把 GEN2_VERSION 改成 1 時，就是在這裡重錄並從此凍結（新增 v1 的雜湊、v0 之後視為發佈版）。
import { describe, it, expect } from 'vitest';
import { Gen2Source, GEN2_VERSION, GEN2_MIN_VERSION } from './index';
import { fillCol, bytes } from './testUtil';
import { fnv1a } from '../../net/codec';

const GEN2_HASHES: Record<number, number> = { 0: 244772130 };
// 101：家鄉的小屋（M2a Task 7 起家鄉表層槽多半是錨點，原本 105 的遺跡沒了）
const COLS = [-300, -40, -8, -4, -1, 0, 30, 65, 100, 101, 131, 132, 140, 160, 220, 400];

describe('gen2 版本雜湊鎖', () => {
  for (let v = GEN2_MIN_VERSION; v <= GEN2_VERSION; v++) {
    it(`gen2 v${v} 區塊雜湊`, () => {
      const src = new Gen2Source('gen2-lock', { latestVer: v });
      let h = 0x811c9dc5;
      for (const cx of COLS) h = fnv1a(bytes(fillCol(src, cx)), h);
      expect(h).toBe(GEN2_HASHES[v]);
    });
  }
  it('雜湊的欄涵蓋海上（沉船或浮箱）與陸上結構（小屋或遺跡）', () => {
    const src = new Gen2Source('gen2-lock');
    const kinds = new Set<string>();
    for (const cx of COLS) for (const b of src.blueprints.overlapping(cx * 32, cx * 32 + 32)) kinds.add(b.kind);
    expect([...kinds].some((k) => k === 'shipwreck' || k === 'crate'), [...kinds].join()).toBe(true);
    expect([...kinds].some((k) => k === 'cabin' || k === 'ruin'), [...kinds].join()).toBe(true);
  });
  it('每個版本都有雜湊', () => {
    for (let v = GEN2_MIN_VERSION; v <= GEN2_VERSION; v++) expect(GEN2_HASHES[v]).toBeTypeOf('number');
  });
});
