// pose.net.test.ts — PlayerPose 上線（co-op M-C2 Task 1）：WirePose 編解碼、ps.mt、ws 帶 pose、
// 其他客人 peers().pose、客人 ownPose()（自己的攻擊 / 挖掘 / 釣魚 / 無敵用房主的）、mining.progress 內插。
import { describe, it, expect } from 'vitest';
import { T } from '../engine/tiles';
import { TILE_SIZE } from '../engine/constants';
import { lerpPose, type PlayerPose } from '../engine/pose';
import type { NetGuest } from './guest';
import { encodePose, INTERP_DELAY_MS, PS_GROUND, WS_HZ, type Ps } from './protocol';
import { guestRemoteViews } from '../render/remotePlayers';
import { decodePose, parsePs } from './validate';
import { Interp } from './interp';
import { coopRig, FRAME, FLOOR, type Rig } from './testRig';

const pose = (o: Partial<PlayerPose> = {}): PlayerPose => ({
  x: 100.25, y: -40.5, vx: 12.75, vy: -3, onGround: false, gfxOffY: 1.5,
  facing: -1, dead: false, iframes: 0.33, boating: true, climbing: false,
  mantle: { p: 0.42, dir: -1, edgeX: 320, edgeY: 944 },
  liquidFrac: 0.6,
  held: 'wood_sword',
  attack: { item: 'wood_sword', kind: 'sword', angle: -1.57, dir: -1, at: 123.45, dur: 0.42 },
  mining: { x: 61, y: 60, progress: 0.5, pick: 'copper_pickaxe' },
  fishing: { state: 'bite', x: 400.5, y: 900.25, liquid: true },
  hurt: 7,
  ...o,
});
const wire = (p: PlayerPose): unknown => JSON.parse(JSON.stringify(encodePose(p)));

/** 跑到 cond 為真（最多 maxMs）；回傳是否達成 */
function until(r: Rig, cond: () => boolean, maxMs: number): boolean {
  for (let t = 0; t < maxMs; t += FRAME) { if (cond()) return true; r.run(FRAME); }
  return cond();
}
const slotOf = (g: NetGuest, item: string): number => g.game!.local.inventory.slots.findIndex((s) => s?.item === item);
const tileX = (g: NetGuest): number => { const p = g.game!.local.player; return Math.floor((p.x + p.w / 2) / TILE_SIZE); };

/** 客人拿劍朝右邊揮（按住） */
function swing(g: NetGuest): void {
  g.game!.selectSlot(slotOf(g, 'wood_sword'));
  g.game!.setAim(tileX(g) + 3, FLOOR - 2);
  g.game!.setMining(true);
}

describe('WirePose', () => {
  it('encode/decode round-trip；壞資料 → null', () => {
    const p = pose();
    expect(decodePose(wire(p))).toEqual(p);
    const q = pose({ mantle: null, attack: null, mining: null, fishing: null, held: null, facing: 1, dead: true, boating: false, onGround: true, climbing: true });
    expect(decodePose(wire(q))).toEqual(q);
    expect(decodePose(wire(pose({ mining: { x: 1, y: 2, progress: 0, pick: null } })))!.mining!.pick).toBeNull();
    // 數字保留 2 位小數
    const r = decodePose(wire(pose({ x: 1.23456, attack: { item: 'wood_sword', kind: 'sword', angle: 0.123456, dir: 1, at: 9.87654, dur: 0.42 } })))!;
    expect(r.x).toBe(1.23);
    expect(r.attack!.angle).toBe(0.12);
    expect(r.attack!.at).toBe(9.88);
    // 壞資料
    const good = encodePose(p) as unknown as unknown[];
    const bad = (i: number, v: unknown): unknown => { const w = JSON.parse(JSON.stringify(good)) as unknown[]; w[i] = v; return w; };
    for (const w of [null, undefined, 1, 'x', {}, [], good.slice(0, -1), [...good, 0]]) expect(decodePose(w)).toBeNull();
    for (let i = 0; i < good.length; i++) {
      expect(decodePose(bad(i, 'nope'))).toBeNull();
      expect(decodePose(bad(i, { a: 1 }))).toBeNull();
    }
    expect(decodePose(bad(0, NaN))).toBeNull();
    expect(decodePose(bad(0, 1e12))).toBeNull();
    expect(decodePose(bad(4, 999))).toBeNull();                                         // flags 超出範圍
    expect(decodePose(wire(pose({ iframes: -1 })))).toBeNull();
    expect(decodePose(wire(pose({ liquidFrac: 1.5 })))).toBeNull();
    expect(decodePose(wire(pose({ held: 'not_an_item' as never })))).toBeNull();
    expect(decodePose(bad(9, [2, 1, 0, 0]))).toBeNull();                               // 攀邊進度超過 1
    expect(decodePose(bad(9, [0.5, 0, 0, 0]))).toBeNull();
    expect(decodePose(bad(9, [0.5, 1, 0]))).toBeNull();
    expect(decodePose(wire(pose({ attack: { item: 'wood_sword', kind: 'laser' as never, angle: 0, dir: 1, at: 0, dur: 0.4 } })))).toBeNull();
    expect(decodePose(wire(pose({ attack: { item: 'nope' as never, kind: 'sword', angle: 0, dir: 1, at: 0, dur: 0.4 } })))).toBeNull();
    expect(decodePose(wire(pose({ attack: { item: 'wood_sword', kind: 'sword', angle: 0, dir: 1, at: 0, dur: 0 } })))).toBeNull();
    expect(decodePose(wire(pose({ mining: { x: 1, y: 2, progress: 1.2, pick: null } })))).toBeNull();
    expect(decodePose(wire(pose({ mining: { x: 1, y: 2, progress: 0.5, pick: 'nope' as never } })))).toBeNull();
    expect(decodePose(wire(pose({ fishing: { state: 'sleeping' as never, x: 0, y: 0, liquid: true } })))).toBeNull();
    // 挨打計數：0..255 的整數（送出時 mod 256）
    expect(decodePose(wire(pose({ hurt: 255 })))!.hurt).toBe(255);
    expect(decodePose(wire(pose({ hurt: 257 })))!.hurt).toBe(1);
    for (const h of [256, -1, 1.5, null]) expect(decodePose(bad(13, h))).toBeNull();
  });

  it('ps.mt：合法照收；壞的 → 整則 ps 丟掉', () => {
    const base = { t: 'ps', seq: 1, tseq: 0, x: 10, y: -20, vx: 1, vy: 2, flags: 3, facing: 1, aim: [4, 5], mine: true, use: false, slot: 2 };
    expect(parsePs(JSON.stringify({ ...base, mt: null }))!.mt).toBeNull();
    expect(parsePs(JSON.stringify({ ...base, mt: [0.5, -1, 32, 48] }))!.mt).toEqual([0.5, -1, 32, 48]);
    expect(parsePs(JSON.stringify(base))).toBeNull();
    for (const mt of [[0.5, 0, 32, 48], [2, 1, 32, 48], [0.5, 1, 32], [0.5, 1, 'a', 48], 'x', {}]) expect(parsePs(JSON.stringify({ ...base, mt }))).toBeNull();
  });
});

describe('co-op：pose 上線', () => {
  it('coopRig：客人揮劍 → 房主 ws 帶 attack → 另一位客人 peers() 的 pose.attack 有值', () => {
    const r = coopRig({ guests: 2 });
    const [a, b] = r.guests;
    swing(a);
    expect(until(r, () => r.hostGame.poseOf(a.pid!).attack !== null, 1000)).toBe(true);
    expect(until(r, () => b.peers().find((v) => v.pid === a.pid)?.pose.attack != null, 1000)).toBe(true);
    const v = b.peers().find((q) => q.pid === a.pid)!;
    expect(v.pose.attack!.item).toBe('wood_sword');
    expect(v.pose.attack!.kind).toBe('sword');
    expect(v.pose.held).toBe('wood_sword');
    expect(v.pose.x).toBeCloseTo(v.x, 5);
    expect(v.pose.y).toBeCloseTo(v.y, 5);
    a.game!.setMining(false);
  });

  it('coopRig：客人揮劍 → 該客人 ownPose().attack 有值（同一 tick 之後一則 ws 內）', () => {
    const r = coopRig();
    const g = r.guests[0];
    expect(g.ownPose()).not.toBeNull();
    expect(g.ownPose()!.attack).toBeNull();
    swing(g);
    expect(until(r, () => r.hostGame.actors.get(g.pid!)!.attack !== null, 1000)).toBe(true);
    // 房主那一刻開始揮 → 一則 ws 的間隔（加一點延遲）內，客人看到自己的 attack
    expect(until(r, () => g.ownPose()?.attack != null, 1000 / WS_HZ + 4 * FRAME)).toBe(true);
    expect(g.ownPose()!.attack!.item).toBe('wood_sword');
    g.game!.setMining(false);
    expect(until(r, () => g.ownPose()?.attack === null, 2000)).toBe(true);
  });

  it('coopRig：客人翻上邊緣 → 房主 poseOf(該 pid).mantle 有值', () => {
    const r = coopRig();
    const g = r.guests[0], hg = r.hostGame;
    const tx = tileX(g) + 2;
    // 右邊兩格外、7 格高的牆（同 physics.mantle.test：一般跳躍差一點點到頂 → 空中攀住邊緣）
    for (let y = FLOOR - 7; y < FLOOR; y++) for (let x = tx; x < tx + 6; x++) hg.world.setFg(x, y, T.STONE);
    r.run(500);
    expect(g.game!.world.getFg(tx, FLOOR - 7)).toBe(T.STONE);
    let seen = false, guestSaw = false;
    g.game!.setMoveX(1);
    g.game!.setJump(true);
    const ok = until(r, () => {
      if (g.game!.local.motion.mantle) guestSaw = true;
      if (hg.poseOf(g.pid!).mantle) seen = true;
      return seen;
    }, 2000);
    g.game!.setJump(false);
    g.game!.setMoveX(0);
    expect(guestSaw).toBe(true);
    expect(ok).toBe(true);
    // 爬完：房主那邊也收回
    expect(until(r, () => hg.poseOf(g.pid!).mantle === null, 1500)).toBe(true);
  });

  it('mining.progress 在兩筆 ws 之間線性內插', () => {
    // 內插緩衝（客人 peers() 用的那個 lerp）：兩筆之間的中點 → progress 取中間
    type S = { x: number; y: number; pose: PlayerPose };
    const ip = new Interp<S>(0, (p, q, k) => ({ ...q, x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k, pose: lerpPose(p.pose, q.pose, k) }));
    const at = (progress: number, x: number): S => ({ x, y: 0, pose: pose({ x, y: 0, mining: { x: 5, y: 6, progress, pick: null } }) });
    ip.push('p', 0, at(0.2, 0));
    ip.push('p', 100, at(0.6, 10));
    const mid = ip.sample('p', 50)!;
    expect(mid.x).toBeCloseTo(5, 9);
    expect(mid.pose.x).toBeCloseTo(5, 9);
    expect(mid.pose.mining!.progress).toBeCloseTo(0.4, 9);
    // 換了格 / 重新開始（進度變小）→ 不內插，取較新那筆
    const other = lerpPose(at(0.2, 0).pose, { ...at(0.6, 10).pose, mining: { x: 9, y: 6, progress: 0.6, pick: null } }, 0.5);
    expect(other.mining!.progress).toBe(0.6);
    expect(lerpPose(at(0.8, 0).pose, at(0.1, 0).pose, 0.5).mining!.progress).toBe(0.1);
    expect(lerpPose(at(0.8, 0).pose, { ...at(0.1, 0).pose, mining: null }, 0.5).mining).toBeNull();

    // 實際連線：另一位客人看到的挖掘進度每一幀都在變（不是每則 ws 才跳一次）
    const r = coopRig({ guests: 2 });
    const [a, b] = r.guests;
    r.hostGame.world.setFg(tileX(a) + 1, FLOOR, T.STONE);
    a.game!.selectSlot(slotOf(a, 'wood_pickaxe'));
    a.game!.setAim(tileX(a) + 1, FLOOR);
    a.game!.setMining(true);
    expect(until(r, () => (b.peers().find((v) => v.pid === a.pid)?.pose.mining?.progress ?? 0) > 0.05, 3000)).toBe(true);
    const seen: number[] = [];
    r.run(400, () => { const m = b.peers().find((v) => v.pid === a.pid)?.pose.mining; if (m) seen.push(m.progress); });
    a.game!.setMining(false);
    const distinct = new Set(seen.map((v) => v.toFixed(6))).size;
    // 400 ms ≈ 24 幀、ws 15 Hz ≈ 6 則：內插 → 幾乎每幀都不同
    expect(seen.length).toBeGreaterThan(15);
    expect(distinct).toBeGreaterThan(12);
  });
});

describe('M-C2 Task 2：遠端姿勢的時鐘與過時的攀邊', () => {
  it('客人畫別人：揮擊進度用跟身體內插同一個延遲時鐘（peerTime），不是最新的房主時間', () => {
    const r = coopRig();
    const g = r.guests[0], hg = r.hostGame;
    // 房主自己往右走（每一步都是平滑的本地物理）：記下房主時間 → 位置
    const hist: { t: number; x: number }[] = [];
    hg.setMoveX(1);
    r.run(600, () => hist.push({ t: hg.time, x: hg.local.player.x }));
    const xAt = (t: number): number => {
      let i = hist.findIndex((h) => h.t >= t);
      if (i <= 0) i = 1;
      const a = hist[i - 1], b = hist[i];
      return a.x + ((b.x - a.x) * (t - a.t)) / (b.t - a.t);
    };
    // 穩定走路中的幾幀：peers() 的身體位置 = 房主在 peerTime 那一刻的位置；晚 INTERP_DELAY_MS 的時鐘差很多
    let n = 0;
    r.run(300, () => {
      hist.push({ t: hg.time, x: hg.local.player.x });
      const peer = g.peers().find((v) => v.pid === hg.localPid);
      if (!peer) return;
      const t = g.peerTime();
      const [v] = guestRemoteViews([peer], t);
      expect(v.time).toBe(t);
      expect(Math.abs(v.pose.x - xAt(t))).toBeLessThan(1);
      expect(Math.abs(v.pose.x - xAt(t + INTERP_DELAY_MS / 1000))).toBeGreaterThan(3);
      n++;
    });
    hg.setMoveX(0);
    expect(n).toBeGreaterThan(10);
  });

  it('房主 onPs：actor 死了 / ps 因傳送（tseq 舊）或 checkMove 被拒 → 收掉攀邊姿勢', () => {
    const r = coopRig();
    const gst = r.guests[0], pid = gst.pid!;
    type HG = { pid: string; teleBase: number; psSeq: number; prev: { x: number; y: number; at: number } };
    const host = r.host as unknown as { list: HG[]; onPs(g: HG, ps: Ps | null): void };
    const rec = host.list.find((q) => q.pid === pid)!;
    const a = r.hostGame.actors.get(pid)!;
    const ps = (o: Partial<Ps> = {}): Ps => ({
      t: 'ps', seq: rec.psSeq + 1, tseq: a.teleSeq - rec.teleBase, x: rec.prev.x, y: rec.prev.y, vx: 0, vy: 0, flags: PS_GROUND, facing: 1,
      aim: [0, 0], mine: false, use: false, slot: 0, mt: [0.3, 1, rec.prev.x + a.player.w + 2, rec.prev.y + 6], ...o,
    });
    const climbing = (): void => { host.onPs(rec, ps()); expect(a.remote!.mantle).not.toBeNull(); };
    climbing();
    // 死了
    a.dead = true;
    host.onPs(rec, ps());
    expect(a.remote!.mantle).toBeNull();
    a.dead = false;
    // 傳送之後還在送舊 tseq 的 ps
    climbing();
    a.teleSeq++;
    host.onPs(rec, ps({ tseq: a.teleSeq - 1 - rec.teleBase }));
    expect(a.remote!.mantle).toBeNull();
    // checkMove 不通過（瞬移太遠）
    climbing();
    host.onPs(rec, ps({ x: rec.prev.x + 5000 }));
    expect(a.remote!.mantle).toBeNull();
  });
});

describe('最終修正：ps.mt 的牆角要貼著身體', () => {
  it('房主 onPs：mt 的牆角離客人回報的身體超過 2 格 → 當成 null（不畫飄在半空的攀邊）', () => {
    const r = coopRig();
    const gst = r.guests[0], pid = gst.pid!;
    type HG = { pid: string; teleBase: number; psSeq: number; prev: { x: number; y: number; at: number } };
    const host = r.host as unknown as { list: HG[]; onPs(g: HG, ps: Ps | null): void };
    const rec = host.list.find((q) => q.pid === pid)!;
    const a = r.hostGame.actors.get(pid)!, w = a.player.w, h = a.player.h, S = TILE_SIZE;
    // 牆角 = 身體右上角往外 (dx, dy) px
    const at = (dx: number, dy: number): Ps => ({
      t: 'ps', seq: rec.psSeq + 1, tseq: a.teleSeq - rec.teleBase, x: rec.prev.x, y: rec.prev.y, vx: 0, vy: 0, flags: PS_GROUND, facing: 1,
      aim: [0, 0], mine: false, use: false, slot: 0, mt: [0.3, 1, rec.prev.x + w + dx, rec.prev.y + dy],
    });
    const mantleAfter = (ps: Ps) => { host.onPs(rec, ps); return a.remote!.mantle; };
    expect(mantleAfter(at(2, 6))).toEqual({ p: 0.3, dir: 1, edgeX: rec.prev.x + w + 2, edgeY: rec.prev.y + 6 });
    // 剛好 2 格：照收
    expect(mantleAfter(at(2 * S, 6))).not.toBeNull();
    expect(mantleAfter(at(-w / 2, -2 * S))).not.toBeNull();
    // 超過 2 格（右邊 / 頭頂上 / 腳底下 / 左邊）→ null
    expect(mantleAfter(at(2 * S + 1, 6))).toBeNull();
    expect(mantleAfter(at(-w / 2, -2 * S - 1))).toBeNull();
    expect(mantleAfter(at(-w / 2, h + 2 * S + 1))).toBeNull();
    expect(mantleAfter(at(-w - 2 * S - 1, 6))).toBeNull();
    // ps 本身照收（位置、輸入）：只丟 mt
    expect(rec.psSeq).toBeGreaterThan(0);
    expect(mantleAfter(at(0, 0))).not.toBeNull();
  });
});

describe('M-C2 Task 2 修正：挨打計數上線', () => {
  it('coopRig：房主讓客人挨一下 → 客人 ownPose().hurt 和另一位客人 peers() 的 pose.hurt 都 +1；突進的無敵時間不算', () => {
    const r = coopRig({ guests: 2 });
    const [a, b] = r.guests;
    const hg = r.hostGame, pid = a.pid!;
    r.run(300);
    const h0 = a.ownPose()!.hurt;
    const seen = (): number | undefined => b.peers().find((v) => v.pid === pid)?.pose.hurt;
    expect(seen()).toBe(h0);
    // 無敵時間但不是挨打（突進 / 重生那種）：計數不變
    hg.actors.get(pid)!.iframes = 0.5;
    r.run(200);
    expect(a.ownPose()!.iframes).toBeGreaterThan(0);
    expect(a.ownPose()!.hurt).toBe(h0);
    hg.actors.get(pid)!.iframes = 0;
    // 挨打
    expect(hg.withActor(hg.actors.get(pid)!, () => hg.hurtPlayer(2, hg.actors.get(pid)!.player.x + 40))).toBe(true);
    expect(until(r, () => a.ownPose()!.hurt === ((h0 + 1) & 255), 1000)).toBe(true);
    expect(until(r, () => seen() === ((h0 + 1) & 255), 1000)).toBe(true);
  });
});

describe('最終修正：ws 的玩家只帶 pose（位置 / 面向 / 死活不重複）', () => {
  it('coopRig：客人的死活、別人的位置 / 面向 / 死活都從 pose 來', () => {
    const r = coopRig({ guests: 2 });
    const [a, b] = r.guests;
    const hg = r.hostGame, pid = a.pid!, act = hg.actors.get(pid)!;
    r.run(300);
    const peer = () => b.peers().find((v) => v.pid === pid)!;
    expect(peer().x).toBe(peer().pose.x);
    expect(peer().y).toBe(peer().pose.y);
    expect(peer().facing).toBe(peer().pose.facing);
    expect(a.game!.local.dead).toBe(false);
    // 房主把客人打死 → 客人自己的 dead、另一位客人看到的 dead 都是 true
    hg.withActor(act, () => hg.hurtPlayer(9999, act.player.x + 40));
    expect(act.dead).toBe(true);
    expect(until(r, () => a.game!.local.dead && peer().dead && peer().pose.dead, 1000)).toBe(true);
  });
});
