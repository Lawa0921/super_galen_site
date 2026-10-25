// gen2Names.test.ts — gen2 地區名字的唯一化（Task 17b）：同組不同名、起點沒被佔就照雜湊挑、名單不夠時加後綴、與輸入順序無關
import { describe, it, expect } from 'vitest';
import { uniqueNames, numeral, type NameSpec } from './gen2Names';

const pick = (id: number, kind: string, list: readonly string[], start: number): NameSpec => ({ id, kind, list, start });

describe('uniqueNames', () => {
  it('沒有碰撞：每個 id 拿雜湊挑的起點名字', () => {
    const L = ['甲', '乙', '丙'];
    expect([...uniqueNames([pick(1, 'k', L, 2), pick(2, 'k', L, 0)])]).toEqual([[1, '丙'], [2, '甲']]);
  });
  it('碰撞：依 id 由小到大，起點被佔就往後找名單裡還沒用的（繞回開頭）', () => {
    const L = ['甲', '乙', '丙'];
    const m = uniqueNames([pick(9, 'k', L, 2), pick(3, 'k', L, 2), pick(5, 'k', L, 2)]);
    expect(m.get(3)).toBe('丙'); expect(m.get(5)).toBe('甲'); expect(m.get(9)).toBe('乙');
  });
  it('兩輪定名：起點沒衝突的先定名，衝突者才往空位找——沒碰撞的不會被擠走（A / B 同起點 0、C 起點 1 → C 不換名）', () => {
    const L = ['甲', '乙', '丙'];
    const m = uniqueNames([pick(1, 'k', L, 0), pick(2, 'k', L, 0), pick(3, 'k', L, 1)]);
    expect(m.get(1)).toBe('甲'); expect(m.get(3)).toBe('乙'); expect(m.get(2)).toBe('丙');
    // 起點被固定名字佔掉的也算衝突：讓給固定名字、第二輪再找；其他人照起點
    const f = uniqueNames([pick(1, 'k', L, 0), pick(2, 'k', L, 1), { id: 9, kind: 'k', fixed: '甲' }]);
    expect(f.get(2)).toBe('乙'); expect(f.get(1)).toBe('丙');
  });
  it('不同 kind 各自唯一（同名可以出現在不同 kind）', () => {
    const L = ['甲'];
    const m = uniqueNames([pick(1, 'a', L, 0), pick(2, 'b', L, 0)]);
    expect(m.get(1)).toBe('甲'); expect(m.get(2)).toBe('甲');
  });
  it('固定名字先佔位、不改；同 kind 的挑選避開它', () => {
    const L = ['家鄉林地', '苔光林地'];
    const m = uniqueNames([pick(1, 'forest', L, 0), { id: 7, kind: 'forest', fixed: '家鄉林地' }]);
    expect(m.get(7)).toBe('家鄉林地'); expect(m.get(1)).toBe('苔光林地');
  });
  it('名單不夠：用完名單後加後綴「二」「三」…（從起點依序），不丟錯', () => {
    const L = ['甲', '乙'];
    const specs = [1, 2, 3, 4, 5].map((id) => pick(id, 'k', L, 1));
    const m = uniqueNames(specs);
    expect([1, 2, 3, 4, 5].map((id) => m.get(id))).toEqual(['乙', '甲', '乙二', '甲二', '乙三']);
    // 名單只有一個名字（地城的入口大廳）
    const one = uniqueNames([10, 11, 12].map((id) => pick(id, 'dungeon_entry', ['入口大廳'], 0)));
    expect([...one.values()]).toEqual(['入口大廳', '入口大廳二', '入口大廳三']);
  });
  it('與輸入順序無關（純函式：只看整組）', () => {
    const L = ['甲', '乙', '丙'];
    const specs: NameSpec[] = [pick(4, 'k', L, 0), pick(2, 'k', L, 0), pick(8, 'k', L, 1), pick(6, 'k', L, 0), pick(1, 'j', L, 0), { id: 3, kind: 'k', fixed: '乙' }];
    const a = uniqueNames(specs), b = uniqueNames([...specs].reverse());
    expect([...b].sort((x, y) => x[0] - y[0])).toEqual([...a].sort((x, y) => x[0] - y[0]));
    expect(new Set([2, 3, 4, 6, 8].map((id) => a.get(id))).size).toBe(5);
  });
});

describe('numeral', () => {
  it('中文數字後綴', () => {
    expect([2, 3, 9, 10, 11, 19, 20, 21, 99].map(numeral)).toEqual(['二', '三', '九', '十', '十一', '十九', '二十', '二十一', '九十九']);
    expect(numeral(100)).toBe('100');
  });
});
