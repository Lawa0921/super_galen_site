// host.harden.test.ts — M-C Task 1：房主／客人強化（遠方 sum 停放、延遲關連線、ping/RTT、同角色快速重連）。
import { describe, it, expect, vi } from 'vitest';
import { chunkOfX } from '../engine/coords';
import { CHUNK, TILE_SIZE } from '../engine/constants';
import type { Pid } from '../engine/actor';
import { END_TEXT } from './guest';
import { NET_TILE_COLS } from './protocol';
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

  it('停放上限 32，同 cx 只留最新', () => {
    const r = coopRig({ world: 'infinite' });
    const pid = r.guests[0].pid!;
    const base = colOf(r, pid) + NET_TILE_COLS + 1;
    for (let i = 0; i < 40; i++) sendSum(r, 0, base + i);
    r.run(100);
    expect(r.host.debugParked(pid).length).toBeLessThanOrEqual(32);
    // 同一個 cx 送 2 次只算 1 筆
    const r2 = coopRig({ world: 'infinite' });
    const pid2 = r2.guests[0].pid!;
    const cx = colOf(r2, pid2) + NET_TILE_COLS + 3;
    sendSum(r2, 0, cx);
    sendSum(r2, 0, cx);
    r2.run(100);
    expect(r2.host.debugParked(pid2)).toEqual([cx]);
  });
});

describe('延遲關連線', () => {
  it('reject 後 2 秒才關連線', () => {
    const r = coopRig({ guests: 3 });
    const g4 = r.join();                                 // 房主 + 3 位客人已滿，第 4 位客人被拒
    r.run(1900);
    expect(g4.state).toBe('ended');
    expect(g4.endText).toBe(END_TEXT.full);
    expect(r.hostLinks[3].open).toBe(true);
    expect(r.host.lingering).toBe(1);
    r.run(200);
    expect(r.hostLinks[3].open).toBe(false);
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
});
