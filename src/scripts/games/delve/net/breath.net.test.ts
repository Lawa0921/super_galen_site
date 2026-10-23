// breath.net.test.ts — 客人的呼吸泡泡（co-op）：呼吸由房主模擬，ws 只對收件的那位客人帶他自己的 br（滿氣省略）；
// 泡泡破掉 / 溺水的事件是私人事件，只送給那位客人。
import { describe, it, expect } from 'vitest';
import { LIQ } from '../engine/world';
import { MAX_BREATH, type DelveEvent } from '../engine/game';
import type { DelveGame } from '../engine/game';
import type { Ws } from './protocol';
import { decodeBreath } from './validate';
import { coopRig, FRAME, FLOOR, type Rig } from './testRig';

/** 跑到 cond 為真（最多 maxMs）；回傳是否達成 */
function until(r: Rig, cond: () => boolean, maxMs: number): boolean {
  for (let t = 0; t < maxMs; t += FRAME) { if (cond()) return true; r.run(FRAME); }
  return cond();
}
/** 整片 arena 地面上灌 15 格深的水（兩邊是世界邊界，不會流走） */
function flood(g: DelveGame, on: boolean): void {
  const w = g.world;
  for (let y = FLOOR - 15; y < FLOOR; y++) for (let x = 0; x < w.width; x++) w.setLiquid(x, y, on ? 255 : 0, on ? LIQ.WATER : LIQ.NONE);
}

describe('客人的呼吸泡泡', () => {
  it('客人泡在房主的水裡 → 自己的 getState().breath 往下掉、聽到泡泡 / 溺水；出水後補滿', () => {
    const r = coopRig({ guests: 2 });
    const [a, b] = r.guests, hg = r.hostGame;
    const ga = a.game!, gb = b.game!;
    // 兩位都泡在水裡（b 的副本沒灌水也一樣：呼吸只看房主的世界）
    flood(hg, true); flood(ga, true);
    expect(ga.getState().breath).toBe(MAX_BREATH);
    const evA: DelveEvent[] = [], evB: DelveEvent[] = [];
    const drain = (): void => { evA.push(...ga.drainEvents()); evB.push(...gb.drainEvents()); };
    expect(until(r, () => { drain(); return hg.actors.get(a.pid!)!.breath < MAX_BREATH - 2; }, 6000)).toBe(true);
    // 房主那邊掉了兩顆以上 → 一則 ws 內客人自己也看到
    expect(until(r, () => { drain(); return ga.getState().breath < MAX_BREATH - 2; }, 500)).toBe(true);
    expect(evA.some((e) => e.type === 'bubble' && e.pid === a.pid)).toBe(true);
    // 隊友的泡泡不會流到別人那裡（b 只收到自己的）
    expect(evB.some((e) => e.type === 'bubble' && e.pid === a.pid)).toBe(false);
    expect(evB.some((e) => e.type === 'bubble' && e.pid === b.pid)).toBe(true);
    expect(gb.getState().breath).toBeLessThan(MAX_BREATH);
    // 憋到沒氣 → 溺水受傷（自己的 hurt cause drown）
    expect(until(r, () => { drain(); return evA.some((e) => e.type === 'hurt' && e.cause === 'drown'); }, 20000)).toBe(true);
    // hurt 走可靠通道、ws 是定時送：再等一則 ws
    expect(until(r, () => { drain(); return ga.getState().breath === 0; }, 500)).toBe(true);
    expect(evB.some((e) => e.type === 'hurt' && e.pid === a.pid)).toBe(false);
    // 出水：補滿
    flood(hg, false); flood(ga, false);
    expect(until(r, () => ga.getState().breath === MAX_BREATH, 5000)).toBe(true);
  });

  it('ws 的 br 只給收件人自己、滿氣時省略', () => {
    const r = coopRig({ guests: 2 });
    const [a, b] = r.guests, hg = r.hostGame;
    // 直接看房主組給兩位客人的 ws（私有方法）：a 憋了氣、b 滿氣
    const host = r.host as unknown as { wsFor(g: unknown, parts: unknown): Ws; wsParts(): unknown; list: { pid: string }[] };
    const wsTo = (pid: string): Ws => host.wsFor(host.list.find((g) => g.pid === pid), host.wsParts());
    hg.actors.get(a.pid!)!.breath = 3.004;
    const wa = wsTo(a.pid!), wb = wsTo(b.pid!);
    // 無條件進位到 2 位小數：顆數（ceil）不變；players 裡不帶任何人的呼吸
    expect(wa.br).toBe(3.01);
    expect('br' in wb).toBe(false);
    expect(wa.players.every((p) => !('br' in p) && !('breath' in p))).toBe(true);
  });

  it('decodeBreath：有限數字夾到 0..max；其他 → null；省略 → 滿氣', () => {
    expect(decodeBreath(undefined, MAX_BREATH)).toBe(MAX_BREATH);
    expect(decodeBreath(3.5, MAX_BREATH)).toBe(3.5);
    expect(decodeBreath(-2, MAX_BREATH)).toBe(0);
    expect(decodeBreath(99, MAX_BREATH)).toBe(MAX_BREATH);
    for (const v of [NaN, Infinity, -Infinity, '3', null, {}, [1]]) expect(decodeBreath(v, MAX_BREATH)).toBeNull();
  });
});
