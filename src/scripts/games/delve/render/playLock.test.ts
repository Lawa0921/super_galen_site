// 跨分頁的遊玩鎖：同一個角色 / 世界一次只能在一個分頁裡玩（Web Locks；用假的 LockManager 測）。
import { describe, expect, it } from 'vitest';
import { PlayLocks, charLock, heldElsewhere, worldLock, type LockApi } from './playLock';

/** 記憶體版 LockManager（同一個 origin 的所有分頁共用一份）：只實作 exclusive + ifAvailable 與 query */
function fakeLocks(): LockApi & { held: Set<string> } {
  const held = new Set<string>();
  const api = {
    held,
    request(name: string, opts: { ifAvailable?: boolean }, cb: (lock: Lock | null) => unknown): Promise<unknown> {
      if (!opts.ifAvailable) throw new Error('only ifAvailable is used');
      if (held.has(name)) return Promise.resolve(cb(null));
      held.add(name);
      return Promise.resolve(cb({ name, mode: 'exclusive' } as Lock)).finally(() => held.delete(name));
    },
    async query(): Promise<LockManagerSnapshot> {
      return { held: [...held].map((name) => ({ name, mode: 'exclusive' as const, clientId: 'x' })), pending: [] };
    },
  };
  return api as unknown as LockApi & { held: Set<string> };
}
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('play locks', () => {
  it('names: one lock per character and per world slot', () => {
    expect(charLock('abc')).toBe('delve-char-abc');
    expect(worldLock('w-1')).toBe('delve-world-w-1');
  });
  it('second tab cannot take the same character or world until the first releases', async () => {
    const mgr = fakeLocks();
    const a = new PlayLocks(mgr), b = new PlayLocks(mgr);
    expect(await a.acquire([charLock('c1'), worldLock('w1')])).toBe(true);
    expect(await b.acquire([charLock('c1'), worldLock('w2')])).toBe(false);
    expect(await b.acquire([charLock('c2'), worldLock('w1')])).toBe(false);
    // 失敗的那次沒有留下任何鎖（c2 還能拿）
    await flush();
    expect([...mgr.held].sort()).toEqual(['delve-char-c1', 'delve-world-w1']);
    a.release();
    await flush();
    expect(mgr.held.size).toBe(0);
    expect(await b.acquire([charLock('c1'), worldLock('w1')])).toBe(true);
    expect(await b.acquire([charLock('c3')])).toBe(true); // 同一場遊戲可以再加鎖
    b.release();
    await flush();
    expect(mgr.held.size).toBe(0);
  });
  it('a failing request releases the locks taken so far and rethrows', async () => {
    const mgr = fakeLocks();
    const real = mgr.request.bind(mgr);
    (mgr as { request: unknown }).request = (name: string, opts: object, cb: (l: Lock | null) => unknown) => {
      if (name === 'boom') return Promise.reject(new Error('SecurityError'));
      return (real as (n: string, o: object, c: (l: Lock | null) => unknown) => Promise<unknown>)(name, opts, cb);
    };
    const a = new PlayLocks(mgr);
    await expect(a.acquire([charLock('c'), 'boom'])).rejects.toThrow('SecurityError');
    await flush();
    expect(mgr.held.size).toBe(0);
  });
  it('release is idempotent', async () => {
    const mgr = fakeLocks();
    const a = new PlayLocks(mgr);
    await a.acquire([worldLock('w')]);
    a.release(); a.release();
    await flush();
    expect(mgr.held.size).toBe(0);
  });
  it('without Web Locks every acquire succeeds (no locking)', async () => {
    const a = new PlayLocks(undefined), b = new PlayLocks(undefined);
    expect(await a.acquire([charLock('c')])).toBe(true);
    expect(await b.acquire([charLock('c')])).toBe(true);
    a.release();
  });
  it('heldElsewhere: true while another tab holds one of the names', async () => {
    const mgr = fakeLocks();
    const a = new PlayLocks(mgr);
    expect(await heldElsewhere(mgr, [worldLock('w')])).toBe(false);
    await a.acquire([worldLock('w'), charLock('c')]);
    expect(await heldElsewhere(mgr, [worldLock('w')])).toBe(true);
    expect(await heldElsewhere(mgr, [charLock('c')])).toBe(true);
    expect(await heldElsewhere(mgr, [charLock('other')])).toBe(false);
    expect(await heldElsewhere(undefined, [worldLock('w')])).toBe(false);
    a.release();
    await flush();
    expect(await heldElsewhere(mgr, [worldLock('w')])).toBe(false);
  });
});
