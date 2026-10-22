// coop.eight.test.ts — 8 人（房主 + 7 位客人，co-op M-C2 D7）：名額、7 位同時編輯、斷線客人的 held 不被擠掉。
import { describe, it, expect } from 'vitest';
import { T } from '../engine/tiles';
import { SplitSession } from '../save/split';
import { END_TEXT } from './guest';
import { CHK_MS, GUEST_TIMEOUT_MS, MAX_GUESTS } from './protocol';
import { coopRig, FRAME, FLOOR, type Rig } from './testRig';

/** 靜止：輸入放開後跑這麼久（延遲 + 重送 + 一個 char 週期都夠） */
const REST_MS = 2000;

/** 跑到 cond 為真（最多 maxMs）；回傳是否達成 */
function until(r: Rig, cond: () => boolean, maxMs: number): boolean {
  for (let t = 0; t < maxMs; t += FRAME) { if (cond()) return true; r.run(FRAME); }
  return cond();
}

describe('8 人（房主 + 7 位客人）', () => {
  it('7 位客人都能 live；第 8 位收到 full', () => {
    expect(MAX_GUESTS).toBe(7);
    const r = coopRig({ guests: 7 });
    const pids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
    expect(r.guests.map((g) => g.state)).toEqual(pids.map(() => 'live'));
    expect(r.guests.map((g) => g.pid)).toEqual(pids);
    expect([...r.hostGame.actors.keys()]).toEqual(['h', ...pids]);
    const extra = r.join();
    expect(until(r, () => extra.state === 'ended', 3000)).toBe(true);
    expect(extra.endText).toBe(END_TEXT.full);
    expect(r.hostGame.actors.size).toBe(8);
    expect(r.guests.slice(0, 7).every((g) => g.state === 'live')).toBe(true);
  });

  it('7 位客人同時編輯不同格，最後每位客人的 tile 都跟房主一致', () => {
    const r = coopRig({ guests: 7, latencyMs: [20, 60] });
    const hg = r.hostGame;
    // 每位客人挖一格不同的泥土（都在出生點 (40, 59) 腳下附近）
    const xs = r.guests.map((_, i) => 37 + i);
    for (const x of xs) hg.world.setFg(x, FLOOR, T.DIRT);
    r.run(1000);
    for (const g of r.guests) for (const x of xs) expect(g.game!.world.getFg(x, FLOOR)).toBe(T.DIRT);
    r.guests.forEach((g, i) => { g.game!.setAim(xs[i], FLOOR); g.game!.setMining(true); });
    expect(until(r, () => xs.every((x) => hg.world.getFg(x, FLOOR) === T.AIR), 8000)).toBe(true);
    for (const g of r.guests) g.game!.setMining(false);
    r.run(REST_MS);
    r.guests.forEach((g, i) => {
      for (const x of xs) expect(g.game!.world.getFg(x, FLOOR)).toBe(T.AIR);
      expect(r.sameTiles(i)).toEqual([]);
    });
  });

  it('7 位在線、斷線客人最後 chk 未 ack → held 仍在（不被其餘客人的每 30 秒 held 擠掉）', () => {
    // 只斷 1 位時 held 最多 7 + 1 = 8 筆，舊的共用上限 8 剛好裝得下；斷 2 位、補滿 7 位、在線的分頁都在背景（不 ack）
    // → 同時 9 筆：上限 8 會擠掉 at 最舊的（斷線那位），MAX_HELD = 32 不會
    // 房主的 VisitStore 用真的 SplitSession（held 的 LRU 在這裡）
    const s = SplitSession.fresh('host', Date.now(), 'w-eight');
    const r = coopRig({ guests: 7, latencyMs: [20, 60], store: s });
    // 0、1 號的分頁停住（不再回 chkAck）→ 房主逾時移除；最後那份 chk 沒人 ack → held 留著
    const gone = [r.chars[0].id, r.chars[1].id];
    r.pause(0, true); r.pause(1, true);
    expect(until(r, () => r.hostGame.actors.size === 6, GUEST_TIMEOUT_MS + 10_000)).toBe(true);
    const revs = gone.map((id) => s.getHeld(id)?.rev);
    for (const rev of revs) expect(Number.isFinite(rev)).toBe(true);
    // 補進 2 位 → 又是 7 位在線
    const late = [r.join(), r.join()];
    expect(until(r, () => late.every((g) => g.state === 'live'), 10_000)).toBe(true);
    expect(r.hostGame.actors.size).toBe(8);
    // 7 位在線的分頁都在背景超過一個 chk 週期（還沒到逾時）：每位都有一份沒 ack 的 held → 同時 7 + 2 = 9 筆
    const online = [2, 3, 4, 5, 6, 7, 8];
    for (const i of online) r.pause(i, true);
    r.run(CHK_MS + 5000);
    expect(online.every((i) => s.getHeld(r.chars[i].id) !== undefined)).toBe(true);
    // 斷線那兩位的 held 沒被擠掉、rev 沒變
    expect(gone.map((id) => s.getHeld(id)?.rev)).toEqual(revs);
    // 回到前景：在線的 ack 之後清掉自己的 held；斷線那兩位的照樣留著
    for (const i of online) r.pause(i, false);
    r.run(REST_MS);
    expect(online.every((i) => r.guests[i].state === 'live')).toBe(true);
    expect(online.every((i) => s.getHeld(r.chars[i].id) === undefined)).toBe(true);
    expect(gone.map((id) => s.getHeld(id)?.rev)).toEqual(revs);
  });
});
