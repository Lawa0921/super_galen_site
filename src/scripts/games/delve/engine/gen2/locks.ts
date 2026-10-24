// locks.ts — 版本鎖表：每片已進入的地塊記 [side, i, ver, culture]，之後該地塊永遠用這個版本的版面規則與文化。
// 房主的表會記新鎖；客人副本（frozen）只讀房主給的鎖，lock() 不記。
import type { CultureId, Side } from '../regionInfo';
import { CULTURES } from './cultures';

export interface LandLock { ver: number; culture: CultureId | null }
export type LockJSON = [side: Side, i: number, ver: number, culture: CultureId | null][];

const key = (side: Side, i: number): string => `${side}:${i}`;
const isNonNegInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

export class LockTable {
  private readonly frozen: boolean;
  private readonly map = new Map<string, { side: Side; i: number; lock: LandLock }>();

  constructor(opts?: { frozen?: boolean }) {
    this.frozen = opts?.frozen ?? false;
  }

  // 回凍結的物件：呼叫端改不到表內的鎖
  get(side: Side, i: number): LandLock | undefined {
    return this.map.get(key(side, i))?.lock;
  }

  // 記下一片地塊的鎖；新加的回 true（已鎖或 frozen 回 false，原鎖不變）
  lock(side: Side, i: number, l: LandLock): boolean {
    if (this.frozen) return false;
    return this.put(side, i, l);
  }

  private put(side: Side, i: number, l: LandLock): boolean {
    const k = key(side, i);
    if (this.map.has(k)) return false;
    this.map.set(k, { side, i, lock: Object.freeze({ ver: l.ver, culture: l.culture }) });
    return true;
  }

  // 依 (side, i) 排序
  toJSON(): LockJSON {
    return [...this.map.values()]
      .sort((a, b) => a.side - b.side || a.i - b.i)
      .map(({ side, i, lock }) => [side, i, lock.ver, lock.culture]);
  }

  // 壞資料丟 RangeError
  static fromJSON(v: unknown, opts?: { frozen?: boolean }): LockTable {
    if (!Array.isArray(v)) throw new RangeError('lock table: not an array');
    const t = new LockTable(opts);
    for (const e of v) {
      if (!Array.isArray(e) || e.length !== 4) throw new RangeError('lock table: entry is not [side, i, ver, culture]');
      const [side, i, ver, culture] = e as unknown[];
      if (side !== -1 && side !== 0 && side !== 1) throw new RangeError(`lock table: bad side ${String(side)}`);
      if (!isNonNegInt(i) || (side === 0 ? i !== 0 : i < 1)) throw new RangeError(`lock table: bad index ${String(i)} for side ${side}`);
      if (!isNonNegInt(ver)) throw new RangeError(`lock table: bad ver ${String(ver)}`);
      if (culture !== null && !(typeof culture === 'string' && Object.prototype.hasOwnProperty.call(CULTURES, culture))) throw new RangeError(`lock table: unknown culture ${String(culture)}`);
      if (!t.put(side, i, { ver, culture: culture as CultureId | null })) throw new RangeError(`lock table: duplicate ${side}:${i}`);
    }
    return t;
  }
}
