// drops.evict.test.ts — DropList 超過 MAX_DROPS 時的淘汰順序（co-op M-B3 Task 1）：
// 先淘汰最舊的「沒有 owner 或 ownerDelay ≤ 0」的堆；都是還在倒數的 owner 堆才淘汰最舊的。
import { describe, it, expect } from 'vitest';
import { DropList, MAX_DROPS } from './entities';

const OWNER = { pid: 'h', delay: 1.5 };
/** 位置彼此相隔很遠，免得就近合併 */
const at = (i: number): number => 1000 + i * 100;

describe('DropList 淘汰順序', () => {
  it('帶 owner 倒數中的堆不先被淘汰：最舊的一般堆先走', () => {
    const l = new DropList();
    const owned = l.spawn('torch', 1, 0, 0, 0, 0, 0, undefined, undefined, OWNER)!;
    const normals = [];
    for (let i = 0; i < MAX_DROPS; i++) normals.push(l.spawn('dirt', 1, at(i), 0)!);
    expect(l.list).toHaveLength(MAX_DROPS);
    expect(l.list).toContain(owned);
    expect(l.list).not.toContain(normals[0]);
    expect(l.list).toContain(normals[1]);
  });

  it('全部都是倒數中的 owner 堆 → 淘汰最舊的', () => {
    const l = new DropList();
    const all = [];
    for (let i = 0; i < MAX_DROPS + 1; i++) all.push(l.spawn('dirt', 1, at(i), 0, 0, 0, 0, undefined, undefined, OWNER)!);
    expect(l.list).toHaveLength(MAX_DROPS);
    expect(l.list).not.toContain(all[0]);
    expect(l.list).toContain(all[1]);
  });

  it('ownerDelay 歸零後那堆照一般順序淘汰', () => {
    const l = new DropList();
    const owned = l.spawn('torch', 1, 0, 0, 0, 0, 0, undefined, undefined, OWNER)!;
    owned.ownerDelay = 0;
    const normals = [];
    for (let i = 0; i < MAX_DROPS; i++) normals.push(l.spawn('dirt', 1, at(i), 0)!);
    expect(l.list).toHaveLength(MAX_DROPS);
    expect(l.list).not.toContain(owned);
    expect(l.list).toContain(normals[0]);
  });

  it('帶詞條的裝備路徑也走同一個淘汰順序', () => {
    const l = new DropList();
    const owned = l.spawn('torch', 1, 0, 0, 0, 0, 0, undefined, undefined, OWNER)!;
    for (let i = 0; i < MAX_DROPS - 1; i++) l.spawn('dirt', 1, at(i), 0);
    const tinted = l.spawn('dirt', 1, 5, 5, 0, 0, 0, undefined, { h: 1, s: 1, l: 1 } as never)!;
    expect(l.list).toHaveLength(MAX_DROPS);
    expect(l.list).toContain(owned);
    expect(l.list).toContain(tinted);
  });
});
