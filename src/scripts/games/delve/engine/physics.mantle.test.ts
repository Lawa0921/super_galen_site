// physics.mantle.test.ts — 攀上邊緣（mantle）：繩頂 / 繩索旁的 1–2 格台階、跳到牆邊時攀住邊緣。
// 規則（要公平）：只在「朝牆按方向」時觸發、只抓得到手搆得到的邊（繩上：頭到腳之間；空中：頭頂附近、而且已經不在往上衝）、
// 台面上要站得下、路徑上不能卡牆；攀爬過程短（≤ 0.5 秒）、結束時站在台面上。
import { describe, it, expect } from 'vitest';
import { World } from './world';
import { T } from './tiles';
import { makeBody, stepPlayer, findLedge, MANTLE_MAX_S, type PlayerMotion, type MoveControl } from './physics';
import { TILE_SIZE as S, FIXED_DT, PLAYER_H, PLAYER_W } from './constants';

const motion = (): PlayerMotion => ({ jumpTimer: 0, jumpWasHeld: false, climbing: false });
const atCol = (tx: number, feetRow: number) => makeBody(tx * S + S / 2 - PLAYER_W / 2, feetRow * S - PLAYER_H);
function run(w: World, b: ReturnType<typeof makeBody>, m: PlayerMotion, ctl: MoveControl, n: number, each?: () => void): void {
  for (let i = 0; i < n; i++) { stepPlayer(w, b, m, ctl, FIXED_DT); each?.(); }
}
/** 40×60：第 50 列以下石頭；左側 x 0..8 的高台台面在第 ledgeRow 列；繩索在 x=10 的第 ropeTop..49 列 */
function world(ledgeRow = 20, ropeTop = 20): World {
  const w = new World(40, 60);
  for (let x = 0; x < 40; x++) for (let y = 50; y < 60; y++) w.setFg(x, y, T.STONE);
  for (let x = 0; x <= 8; x++) for (let y = ledgeRow; y < 50; y++) w.setFg(x, y, T.STONE);
  for (let y = ropeTop; y < 50; y++) w.setFg(10, y, T.ROPE);
  return w;
}

describe('findLedge', () => {
  it('貼著牆、牆頂在搆得到的高度、上面站得下 → 找到邊緣（台面高度、站上去的位置）', () => {
    const w = world(46);
    // 站在地上（腳底第 50 列），左邊是 4 格高的台子：x 在 9 欄、貼著第 8 欄
    const b = makeBody(9 * S, 50 * S - PLAYER_H);
    const l = findLedge(w, b, -1, -PLAYER_H, PLAYER_H);
    expect(l).not.toBeNull();
    expect(l!.edgeY).toBe(46 * S);
    expect(l!.edgeX).toBe(9 * S);
    expect(l!.y1 + PLAYER_H).toBe(46 * S);
    expect(l!.x1 + PLAYER_W).toBeLessThanOrEqual(9 * S);
  });
  it('離牆太遠 / 牆頂太高 / 台面上頭頂有天花板（站不下）→ 沒有', () => {
    const w = world(46);
    expect(findLedge(w, makeBody(9 * S + 8, 50 * S - PLAYER_H), -1, -PLAYER_H, PLAYER_H)).toBeNull();
    expect(findLedge(w, makeBody(9 * S, 50 * S - PLAYER_H), -1, 20, PLAYER_H)).toBeNull();
    const w2 = world(46);
    for (let x = 0; x <= 8; x++) w2.setFg(x, 44, T.STONE);
    expect(findLedge(w2, makeBody(9 * S, 50 * S - PLAYER_H), -1, -PLAYER_H, PLAYER_H)).toBeNull();
  });
});

describe('繩索：攀上邊緣', () => {
  it('爬到繩頂、朝旁邊的高台按方向 → 進入 mantle、很快站上台面（不必先跳）', () => {
    const w = world(20, 20), b = atCol(10, 45), m = motion();
    // 爬到快到頂（腳底離繩頂不到一格）
    for (let i = 0; i < 400 && b.y + b.h > 21 * S; i++) stepPlayer(w, b, m, { moveX: 0, jump: false, up: true }, FIXED_DT);
    expect(m.climbing).toBe(true);
    let started = -1, t = 0;
    run(w, b, m, { moveX: -1, jump: false, up: true }, 60, () => { t++; if (m.mantle && started < 0) started = t; });
    expect(started).toBeGreaterThan(0);
    expect(m.mantle).toBeFalsy();
    expect(m.climbing).toBe(false);
    expect(b.onGround).toBe(true);
    expect(b.y + b.h).toBeCloseTo(20 * S, 3);
    expect(b.x + b.w).toBeLessThanOrEqual(9 * S + 0.01);
  });
  it('繩索中段旁邊有比頭低的台階（1–2 格）→ 也能攀上去', () => {
    // 高台台面在第 38 列，繩索從第 20 列一路到底；玩家在繩上、腳底第 40 列（台面高 2 格）
    const w = world(38, 20), b = atCol(10, 40), m = motion();
    run(w, b, m, { moveX: 0, jump: false, up: true }, 1);
    expect(m.climbing).toBe(true);
    run(w, b, m, { moveX: -1, jump: false }, 50);
    expect(b.onGround).toBe(true);
    expect(b.y + b.h).toBeCloseTo(38 * S, 3);
  });
  it('台面比頭還高（搆不到）→ 不會攀上去（側移照舊是放開繩索）', () => {
    const w = world(30, 20), b = atCol(10, 40), m = motion();
    run(w, b, m, { moveX: 0, jump: false, up: true }, 1);
    let mantled = false;
    run(w, b, m, { moveX: -1, jump: false }, 50, () => { if (m.mantle) mantled = true; });
    expect(mantled).toBe(false);
    expect(b.y + b.h).toBeGreaterThan(31 * S);
  });
  it('爬到繩頂、只按著「上」：旁邊有地面就自己攀上去（豎井出口）', () => {
    // 兩側都是台面在第 20 列的高台：左 x 0..8、右 x 12..39（中間 9..11 是 3 格寬的井）
    const w = world(20, 20);
    for (let x = 12; x < 40; x++) for (let y = 20; y < 50; y++) w.setFg(x, y, T.STONE);
    const b = atCol(10, 45), m = motion();
    run(w, b, m, { moveX: 0, jump: false, up: true }, 240);
    expect(m.climbing).toBe(false);
    expect(b.onGround).toBe(true);
    expect(b.y + b.h).toBeCloseTo(20 * S, 3);
  });
  it('mantle 過程：身體先往上、再往台面移；全程不會穿進牆裡、時間 ≤ MANTLE_MAX_S', () => {
    const w = world(38, 20), b = atCol(10, 40), m = motion();
    run(w, b, m, { moveX: 0, jump: false, up: true }, 1);
    let frames = 0, minY = Infinity;
    const y0 = b.y;
    for (let i = 0; i < 80; i++) {
      stepPlayer(w, b, m, { moveX: -1, jump: false }, FIXED_DT);
      if (m.mantle) {
        frames++;
        minY = Math.min(minY, b.y);
        // 不在實心方塊裡
        const tx0 = Math.floor(b.x / S), tx1 = Math.floor((b.x + b.w - 1e-6) / S), ty0 = Math.floor(b.y / S), ty1 = Math.floor((b.y + b.h - 1e-6) / S);
        for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) expect(w.isSolid(x, y)).toBe(false);
      }
    }
    expect(frames).toBeGreaterThan(5);
    expect(frames * FIXED_DT).toBeLessThanOrEqual(MANTLE_MAX_S + 1e-9);
    expect(minY).toBeLessThan(y0);
  });
  it('mantle 中的進度（mantle.t / dur）單調增加，邊緣座標固定', () => {
    const w = world(38, 20), b = atCol(10, 40), m = motion();
    run(w, b, m, { moveX: 0, jump: false, up: true }, 1);
    let last = -1, edge: { x: number; y: number } | null = null;
    for (let i = 0; i < 80; i++) {
      stepPlayer(w, b, m, { moveX: -1, jump: false }, FIXED_DT);
      if (!m.mantle) continue;
      const p = m.mantle.t / m.mantle.dur;
      expect(p).toBeGreaterThan(last);
      last = p;
      edge ??= { x: m.mantle.edgeX, y: m.mantle.edgeY };
      expect({ x: m.mantle.edgeX, y: m.mantle.edgeY }).toEqual(edge);
    }
    expect(edge).toEqual({ x: 9 * S, y: 38 * S });
  });
});

describe('空中：攀住邊緣', () => {
  /** 地面第 50 列；左邊高台台面在第 ledge 列（x 0..8）；玩家站在 x=9..10 欄 */
  function wall(ledge: number): World {
    const w = new World(40, 60);
    for (let x = 0; x < 40; x++) for (let y = 50; y < 60; y++) w.setFg(x, y, T.STONE);
    for (let x = 0; x <= 8; x++) for (let y = ledge; y < 50; y++) w.setFg(x, y, T.STONE);
    return w;
  }
  it('往牆跳、跳不太到頂（頭在台面附近時開始往下掉）→ 攀住邊緣上去', () => {
    // 台面在第 43 列 = 地面上 7 格：一般跳躍最高約 6.6 格，差一點點
    const w = wall(43), b = makeBody(9 * S + 1, 50 * S - PLAYER_H), m = motion();
    run(w, b, m, { moveX: 0, jump: false }, 5);
    let mantled = false;
    run(w, b, m, { moveX: -1, jump: true }, 120, () => { if (m.mantle) mantled = true; });
    expect(mantled).toBe(true);
    expect(b.onGround).toBe(true);
    expect(b.y + b.h).toBeCloseTo(43 * S, 3);
  });
  it('沒有朝牆按方向 → 不會攀住（照常落地）', () => {
    const w = wall(43), b = makeBody(9 * S + 1, 50 * S - PLAYER_H), m = motion();
    run(w, b, m, { moveX: 0, jump: false }, 5);
    run(w, b, m, { moveX: 0, jump: true }, 20);
    run(w, b, m, { moveX: 0, jump: false }, 120, () => expect(m.mantle).toBeFalsy());
    expect(b.y + b.h).toBeCloseTo(50 * S, 3);
  });
  it('正在往上衝（還沒到最高點）時經過邊緣 → 不攀（不會把正常的跳躍吸到牆上）', () => {
    // 低牆（台面第 47 列）：跳起來一路往上衝時頭就經過台面，不該在上升途中被拉上去
    const w = wall(47), b = makeBody(9 * S + 1, 50 * S - PLAYER_H), m = motion();
    run(w, b, m, { moveX: 0, jump: false }, 5);
    for (let i = 0; i < 8; i++) {
      stepPlayer(w, b, m, { moveX: -1, jump: true }, FIXED_DT);
      if (b.vy < -100) expect(m.mantle).toBeFalsy();
    }
  });
  it('在水裡游泳時不攀邊（游上岸用跳的）', () => {
    const w = wall(43), b = makeBody(9 * S + 1, 44 * S), m = motion();
    const med = { gravityMul: 0.3, maxFallMul: 0.3, runMul: 0.6, jumpMul: 0.8, inLiquid: true, swim: true, swimSpeed: 100, swimAccel: 600 };
    for (let i = 0; i < 30; i++) {
      stepPlayer(w, b, m, { moveX: -1, jump: false }, FIXED_DT, {}, med);
      expect(m.mantle).toBeFalsy();
    }
  });
});
