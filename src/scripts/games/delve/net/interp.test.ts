// interp.test.ts — Interp（Task 9）：延遲 INTERP_DELAY_MS 的線性內插、不外推、亂序 push、retain。
import { describe, it, expect } from 'vitest';
import { Interp } from './interp';
import { INTERP_DELAY_MS } from './protocol';

type P = { x: number; y: number; hp?: number };

describe('Interp', () => {
  it('預設延遲是 INTERP_DELAY_MS；t 0 在 x 0、t 100 在 x 100 → sample(150) 取 t 50 = 50', () => {
    expect(INTERP_DELAY_MS).toBe(100);
    const it2 = new Interp<P>();
    it2.push(1, 0, { x: 0, y: 0 });
    it2.push(1, 100, { x: 100, y: 10 });
    const s = it2.sample(1, 150)!;
    expect(s.x).toBe(50);
    expect(s.y).toBe(5);
  });

  it('只有一筆 → 那筆', () => {
    const ip = new Interp<P>();
    ip.push('h', 500, { x: 7, y: 8 });
    expect(ip.sample('h', 0)).toMatchObject({ x: 7, y: 8 });
    expect(ip.sample('h', 10_000)).toMatchObject({ x: 7, y: 8 });
  });

  it('now 超過最新 + 延遲 → 最新（不外推）；早於最舊 → 最舊', () => {
    const ip = new Interp<P>();
    ip.push(1, 0, { x: 0, y: 0 });
    ip.push(1, 100, { x: 100, y: 0, hp: 3 });
    expect(ip.sample(1, 1000)).toMatchObject({ x: 100, y: 0, hp: 3 });
    expect(ip.sample(1, 50)!.x).toBe(0);
  });

  it('亂序 push（先 100 再 0）結果相同；同一時間重複 push 取後來的', () => {
    const ip = new Interp<P>();
    ip.push(1, 100, { x: 100, y: 0 });
    ip.push(1, 0, { x: 0, y: 0 });
    expect(ip.sample(1, 150)!.x).toBe(50);
    ip.push(1, 100, { x: 200, y: 0 });
    expect(ip.sample(1, 150)!.x).toBe(100);
  });

  it('非位置欄位取較新那筆；夾在中間那兩筆（不是只看最新兩筆）', () => {
    const ip = new Interp<P>(100);
    ip.push(1, 0, { x: 0, y: 0, hp: 1 });
    ip.push(1, 66, { x: 66, y: 0, hp: 2 });
    ip.push(1, 133, { x: 133, y: 0, hp: 3 });
    const s = ip.sample(1, 150)!;   // t = 50：在 0 與 66 之間
    expect(s.x).toBeCloseTo(50, 6);
    expect(s.hp).toBe(2);
  });

  it('retain 之後消失的 id 回 null；ids 列出剩下的', () => {
    const ip = new Interp<P>();
    ip.push(1, 0, { x: 0, y: 0 });
    ip.push(2, 0, { x: 0, y: 0 });
    ip.push('p1', 0, { x: 0, y: 0 });
    expect(ip.ids()).toEqual([1, 2, 'p1']);
    ip.retain(new Set<number | string>([2]));
    expect(ip.sample(1, 100)).toBeNull();
    expect(ip.sample('p1', 100)).toBeNull();
    expect(ip.sample(2, 100)).not.toBeNull();
    expect(ip.ids()).toEqual([2]);
    expect(ip.sample(99, 0)).toBeNull();
  });
});
