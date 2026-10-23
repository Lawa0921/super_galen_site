// host.harden.test.ts — M-C Task 1：房主／客人強化（遠方 sum 停放、延遲關連線、ping/RTT、同角色快速重連）。
import { describe, it, expect, vi } from 'vitest';
import { chunkOfX } from '../engine/coords';
import { CHUNK, TILE_SIZE } from '../engine/constants';
import type { Pid } from '../engine/actor';
import { END_TEXT } from './guest';
import { BUILD } from './testRig';
import { columnSums } from './chunkSync';
import { BULK_HIGH_WATER, NET_TILE_COLS, PROTO, SUM_PARK_MAX } from './protocol';
import { coopRig, FRAME, type Rig } from './testRig';

/** 房主端該客人身體中心所在的欄 */
function colOf(r: Rig, pid: Pid): number {
  const p = r.hostGame.actors.get(pid)!.player;
  return chunkOfX(Math.floor((p.x + p.w / 2) / TILE_SIZE));
}

/** 客人 0 對房主送一則（內容隨意的）sum：sums 全 0，跟房主的整欄不同 → 若回覆就會有 diff */
function sendSum(r: Rig, i: number, cx: number): void {
  const sums = new Array<number>(r.hostGame.world.chunksY).fill(0);
  r.links[i].send('ctrl', JSON.stringify({ t: 'sum', cx, sums }));
}

function until(r: Rig, cond: () => boolean, maxMs: number): boolean {
  for (let t = 0; t < maxMs; t += FRAME) { if (cond()) return true; r.run(FRAME); }
  return cond();
}

describe('遠方 sum 停放', () => {
  it('遠方欄的 sum 先停放，走近才回 col', () => {
    const r = coopRig({ world: 'infinite' });
    const hg = r.hostGame, w = hg.world, pid = r.guests[0].pid!;
    const far = colOf(r, pid) + NET_TILE_COLS + 8;
    const spy = vi.spyOn(w, 'ensureColumn');
    sendSum(r, 0, far);
    r.run(500);
    expect(spy.mock.calls.some(([cx]) => cx === far)).toBe(false);
    expect(r.cols[0].some((c) => c.cx === far)).toBe(false);
    expect(r.host.debugParked(pid)).toEqual([far]);
    // 傳送到該欄附近 → 停放的 sum 進 jobs、回 col
    const x = far * CHUNK + CHUNK / 2;
    hg.withActor(hg.actors.get(pid)!, () => hg.teleport(x, w.surfaceAt(x) - 1));
    r.run(500);
    expect(r.host.debugParked(pid)).toEqual([]);
    expect(r.cols[0].some((c) => c.cx === far)).toBe(true);
  });

  it('同 cx 只留最新（停放只算 1 筆）', () => {
    const r = coopRig({ world: 'infinite' });
    const pid = r.guests[0].pid!;
    const cx = colOf(r, pid) + NET_TILE_COLS + 3;
    sendSum(r, 0, cx);
    sendSum(r, 0, cx);
    r.run(100);
    expect(r.host.debugParked(pid)).toEqual([cx]);
  });

  it('超過 2 × NET_TILE_COLS 的 sum 直接丟，不停放', () => {
    const r = coopRig({ world: 'infinite' });
    const pid = r.guests[0].pid!;
    sendSum(r, 0, colOf(r, pid) + 2 * NET_TILE_COLS + 1);
    sendSum(r, 0, colOf(r, pid) - 2 * NET_TILE_COLS - 1);
    r.run(100);
    expect(r.host.debugParked(pid)).toEqual([]);
  });

  it('停放上限 32：最舊的先被擠掉（被擠掉的不會回 col，留下的走近後回 col）', () => {
    // 同一時刻可停放的欄（距離 14..26、左右各 13）只有 26 欄，所以先在位置 p0 停放 26 筆（舊的先送 p0+14, p0+15…），
    // 房主把客人移到 p0+4 之後，同一幀再送 p1 的 26 筆：聯集 34 筆 > 32，最舊且沒被刷新的 p0+14、p0+15 被擠掉。
    // 沒有上限的話它們在 flush 會因為距離 ≤ 13 而被升進 jobs 回 col，所以有無上限結果不同。
    const r = coopRig({ world: 'infinite' });
    const hg = r.hostGame, w = hg.world, pid = r.guests[0].pid!;
    r.pause(0, true);                                     // 客人自己的興趣範圍 sum 不介入
    const p0 = colOf(r, pid), N = NET_TILE_COLS;
    for (let d = N + 1; d <= 2 * N; d++) sendSum(r, 0, p0 + d);
    for (let d = N + 1; d <= 2 * N; d++) sendSum(r, 0, p0 - d);
    r.run(100);
    expect(r.host.debugParked(pid).length).toBe(2 * N);
    const x = (p0 + 4) * CHUNK + CHUNK / 2;
    hg.withActor(hg.actors.get(pid)!, () => hg.teleport(x, w.surfaceAt(x) - 1));
    const p1 = colOf(r, pid);
    expect(p1).toBe(p0 + 4);
    const before = r.cols[0].length;
    for (let d = N + 1; d <= 2 * N; d++) sendSum(r, 0, p1 + d);
    for (let d = N + 1; d <= 2 * N; d++) sendSum(r, 0, p1 - d);
    r.run(FRAME);                                         // 一幀：全部在同一個收件匣批次
    r.run(100);                                           // 讓 col 回覆送達
    const got = r.cols[0].slice(before).map((c) => c.cx);
    expect(got).toContain(p0 + 16);
    expect(got).toContain(p0 + 17);
    expect(got).not.toContain(p0 + 14);
    expect(got).not.toContain(p0 + 15);
    expect(r.host.debugParked(pid).length).toBeLessThanOrEqual(SUM_PARK_MAX);
  });

  it('bulk 被卡住時，同 cx 的 sum 只留最新一筆（範圍內換掉、停放時移除排著的）', () => {
    const r = coopRig({ world: 'infinite' });
    const hg = r.hostGame, w = hg.world, pid = r.guests[0].pid!;
    r.pause(0, true);
    const cx = colOf(r, pid) + 3;
    const wrong = new Array<number>(w.chunksY).fill(0);
    w.ensureColumn(cx);
    const right = columnSums(w, cx);
    const send = (sums: number[]): void => { r.links[0].send('ctrl', JSON.stringify({ t: 'sum', cx, sums })); };
    const buffered = vi.spyOn(r.hostLinks[0], 'buffered').mockReturnValue(BULK_HIGH_WATER + 1);   // bulk 在途太多：job 留在佇列
    const colsOf = (): { cx: number; diff: number[] }[] => r.cols[0].filter((c) => c.cx === cx);
    const base = colsOf().length;
    // 範圍內：先送錯的、再送對的 → 佇列裡只剩對的那筆
    send(wrong); send(right);
    r.run(100);
    buffered.mockRestore();
    r.run(100);
    let mine = colsOf().slice(base);
    expect(mine.length).toBe(1);
    expect(mine[0].diff).toEqual([]);
    // 停放：佇列裡排著錯的，客人被移到太遠 → 再送對的（停放、並移除排著的錯的）→ 移回來 → 只回一次且是對的
    const base2 = colsOf().length;
    const held = vi.spyOn(r.hostLinks[0], 'buffered').mockReturnValue(BULK_HIGH_WATER + 1);
    send(wrong);
    r.run(100);
    const away = (cx - 20) * CHUNK + CHUNK / 2, near = cx * CHUNK + CHUNK / 2;
    hg.withActor(hg.actors.get(pid)!, () => hg.teleport(away, w.surfaceAt(away) - 1));
    send(right);
    r.run(100);
    expect(r.host.debugParked(pid)).toEqual([cx]);
    hg.withActor(hg.actors.get(pid)!, () => hg.teleport(near, w.surfaceAt(near) - 1));
    r.run(100);
    held.mockRestore();
    r.run(100);
    mine = colsOf().slice(base2);
    expect(mine.length).toBe(1);
    expect(mine[0].diff).toEqual([]);
  });
});

describe('延遲關連線', () => {
  it('reject 後 2 秒才關連線', () => {
    const r = coopRig({ guests: 7 });
    const g8 = r.join();                                 // 房主 + 7 位客人已滿，第 8 位客人被拒
    r.run(1900);
    expect(g8.state).toBe('ended');
    expect(g8.endText).toBe(END_TEXT.full);
    expect(r.hostLinks[7].open).toBe(true);
    expect(r.host.lingering).toBe(1);
    r.run(200);
    expect(r.hostLinks[7].open).toBe(false);
    expect(r.host.lingering).toBe(0);
  });

  it('close() 之後 bye 送達、2 秒後關閉', () => {
    const r = coopRig();
    r.host.close();
    r.run(1900);                                          // close 之後 run 仍呼叫 host.frame（只處理延遲關閉）
    expect(r.guests[0].state).toBe('ended');
    expect(r.guests[0].endText).toBe(END_TEXT.closed);
    expect(r.hostLinks[0].open).toBe(true);
    r.run(300);
    expect(r.hostLinks[0].open).toBe(false);
    expect(r.host.lingering).toBe(0);
  });
});

describe('ping / RTT', () => {
  it('ping 讓雙方都有 rtt', () => {
    const r = coopRig({ latencyMs: [40, 40] });
    r.run(3000);
    const host = r.host.guests()[0].rttMs, guest = r.guests[0].rttMs;
    expect(host).not.toBeNull();
    expect(guest).not.toBeNull();
    expect(host!).toBeGreaterThanOrEqual(70);
    expect(host!).toBeLessThanOrEqual(200);
    expect(guest!).toBeGreaterThanOrEqual(70);
    expect(guest!).toBeLessThanOrEqual(200);
  });
});

describe('同角色快速重連', () => {
  // 不用 sever（兩端都會 onClose）：舊客人停止 frame，舊 link 開著但不送訊息，模擬 RTC 沒及時報斷線
  it('同角色舊連線沉默 5 秒以上 → 新 hello 取代', () => {
    const r = coopRig();
    const character = r.chars[0];
    r.pause(0, true);
    r.run(6000);
    const g2 = r.join({ character });
    expect(until(r, () => g2.state === 'live' || g2.state === 'ended', 3000)).toBe(true);
    expect(g2.state).toBe('live');
    expect(r.host.guests().length).toBe(1);
  });

  it('沉默只有 4 秒 → charInUse', () => {
    const r = coopRig();
    const character = r.chars[0];
    r.pause(0, true);
    r.run(4000);
    const g2 = r.join({ character });
    expect(until(r, () => g2.state === 'live' || g2.state === 'ended', 3000)).toBe(true);
    expect(g2.state).toBe('ended');
    expect(g2.endText).toBe(END_TEXT.charInUse);
  });

  it('沉默 6 秒的舊連線，不會被「角色檔不合法」的 hello 趕走', () => {
    const r = coopRig();
    r.pause(0, true);
    r.run(6000);
    const p = r.net.pair();
    r.host.accept(p.host);
    const got: string[] = [];
    p.guest.onMessage((ch, d) => { if (ch === 'ctrl' && typeof d === 'string') got.push(d); });
    p.guest.send('ctrl', JSON.stringify({ t: 'hello', proto: PROTO, build: BUILD, charId: r.chars[0].id, nick: 'x', character: { junk: 1 } }));
    r.run(200);
    expect(got.map((s) => (JSON.parse(s) as { t: string; reason?: string }))).toEqual([{ t: 'reject', reason: 'char' }]);
    expect(r.host.guests().length).toBe(1);
    expect(r.host.guests()[0].charId).toBe(r.chars[0].id);
  });
});
