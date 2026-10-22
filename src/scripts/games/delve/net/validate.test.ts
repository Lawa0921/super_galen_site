import { describe, expect, it } from 'vitest';
import { parseGuestCtrl, parsePs } from './validate';

const RANGE = { lo: -3, hi: 3 };
const CY = 4;
const parse = (v: unknown, data?: string) => parseGuestCtrl(data ?? JSON.stringify(v), CY, RANGE);

describe('parseGuestCtrl', () => {
  const ok: unknown[] = [
    { t: 'hello', proto: 1, build: 'abc', charId: 'id-1', nick: '小明', character: { any: 'thing' } },
    { t: 'ready' },
    { t: 'cmd', seq: 5, cmd: { op: 'swap', a: 1, b: 2 } },
    { t: 'sum', cx: 2, sums: [0, 1, 4294967295, 77] },
    { t: 'bye', reason: 'leave' },
  ];
  for (const m of ok) {
    it(`合法 ${(m as { t: string }).t} 原樣通過`, () => {
      expect(parse(m)).toEqual(m);
    });
  }
  const bad: [string, unknown, string?][] = [
    ['not json', null, 'not json'],
    ['未知 t', { t: 'nuke' }],
    ['非物件', 5],
    ['sum cx 超出', { t: 'sum', cx: 4, sums: [0, 0, 0, 0] }],
    ['sum cx 非整數', { t: 'sum', cx: 0.5, sums: [0, 0, 0, 0] }],
    ['sums 少一', { t: 'sum', cx: 0, sums: [0, 0, 0] }],
    ['sums 含 -1', { t: 'sum', cx: 0, sums: [0, 0, 0, -1] }],
    ['sums 含 2^32', { t: 'sum', cx: 0, sums: [0, 0, 0, 4294967296] }],
    ['sums 含 0.5', { t: 'sum', cx: 0, sums: [0, 0, 0, 0.5] }],
    ['cmd 不合法', { t: 'cmd', seq: 1, cmd: { op: 'nuke' } }],
    ['seq 為 -1', { t: 'cmd', seq: -1, cmd: { op: 'talk' } }],
    ['build 長 65', { t: 'hello', proto: 1, build: 'x'.repeat(65), charId: 'a', nick: 'n', character: {} }],
    ['bye 原因不明', { t: 'bye', reason: 'zzz' }],
  ];
  for (const [name, m, raw] of bad) {
    it(`垃圾 → null：${name}`, () => { expect(parse(m, raw)).toBeNull(); });
  }
  it('Uint8Array 送到 ctrl → null', () => {
    expect(parseGuestCtrl(new Uint8Array([123, 125]), CY, RANGE)).toBeNull();
  });
  it('__proto__ 不會汙染', () => {
    const raw = '{"__proto__":{"polluted":1},"t":"cmd","seq":1,"cmd":{"__proto__":{"polluted":2},"op":"talk"}}';
    const r = parseGuestCtrl(raw, CY, RANGE);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((r as { polluted?: unknown } | null)?.polluted).toBeUndefined();
    expect(Object.getPrototypeOf(r)).toBe(Object.prototype);
  });
  it('ping / pong：at 必須是有限數（1e999 解析成 Infinity → 拒絕）', () => {
    expect(parse({ t: 'ping', at: 12.5 })).toEqual({ t: 'ping', at: 12.5 });
    expect(parse({ t: 'pong', at: 0 })).toEqual({ t: 'pong', at: 0 });
    for (const t of ['ping', 'pong']) {
      expect(parse(null, `{"t":"${t}","at":1e999}`)).toBeNull();
      expect(parse(null, `{"t":"${t}","at":"1"}`)).toBeNull();
      expect(parse({ t })).toBeNull();
    }
  });
  it('chkAck：rev 必須是 ≥ 0 的整數', () => {
    expect(parse({ t: 'chkAck', rev: 7, junk: 1 })).toEqual({ t: 'chkAck', rev: 7 });
    expect(parse({ t: 'chkAck', rev: 0 })).toEqual({ t: 'chkAck', rev: 0 });
    for (const rev of [-1, 1.5, '3', null, undefined]) expect(parse({ t: 'chkAck', rev })).toBeNull();
    expect(parse(null, '{"t":"chkAck","rev":1e999}')).toBeNull();
  });
});

describe('parsePs', () => {
  const base = { t: 'ps', seq: 1, tseq: 0, x: 10, y: -20, vx: 1, vy: 2, flags: 3, facing: 1, aim: [4, 5], mine: true, use: false, slot: 2 };
  const p = (o: Record<string, unknown>) => parsePs(JSON.stringify(o));
  it('合法通過', () => { expect(p(base)).toEqual(base); });
  it('非有限數 → null', () => {
    expect(parsePs('{"t":"ps","seq":1,"tseq":0,"x":NaN}')).toBeNull();
    expect(p({ ...base, x: null })).toBeNull();
    expect(p({ ...base, vx: 1e999 })).toBeNull();
  });
  it('x 1e12、slot 99、facing 0 → null', () => {
    expect(p({ ...base, x: 1e12 })).toBeNull();
    expect(p({ ...base, y: -1e12 })).toBeNull();
    expect(p({ ...base, slot: 99 })).toBeNull();
    expect(p({ ...base, facing: 0 })).toBeNull();
    expect(p({ ...base, t: 'pz' })).toBeNull();
  });
  it('Uint8Array → null', () => { expect(parsePs(new Uint8Array(3))).toBeNull(); });
});
