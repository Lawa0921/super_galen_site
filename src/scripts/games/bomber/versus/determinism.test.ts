// src/scripts/games/bomber/versus/determinism.test.ts
import { describe, it, expect } from 'vitest';
import { VersusMatch, SUDDEN_DEATH_AT_MS, RING_INTERVAL_MS } from './versusMatch';
import { createRng } from '../engine/rng';

const P = [
  { id: 'a', character: 'lena' as const }, { id: 'b', character: 'mira' as const },
  { id: 'c', character: 'aya' as const },  { id: 'd', character: 'rosa' as const },
];
const DIRS = ['up', 'down', 'left', 'right'] as const;

/** 以固定 seed 衍生一條決定性輸入腳本，逐幀餵給全新的 VersusMatch，
 *  回傳跑完 frames 幀後的 stateHash。模擬「某一端從頭重放輸入流」。 */
function runScripted(seed: number, frames: number): string {
  const m = new VersusMatch({ seed, arenaId: 3, players: P });
  const script = createRng(seed ^ 0xabcdef); // 決定性輸入腳本
  for (let f = 0; f < frames; f++) {
    for (const p of P) {
      const r = script();
      if (r < 0.3) m.setHeld(p.id, DIRS[Math.floor(script() * 4)], script() < 0.5);
      else if (r < 0.35) m.input(p.id, 'bomb');
      else if (r < 0.38) m.input(p.id, 'ability');
    }
    m.step(1000 / 60);
  }
  return m.stateHash();
}

/** 塌縮測試專用陣容：刻意指定角色，讓「倖存者」的技能不會產生爆風自殺
 *  （c=aya/blink 只瞬移、d=rosa/bulwark 只給無敵），讓「注定陣亡者」帶會炸的技能
 *  （a=lena/detonate、b=mira/inferno）以在塌縮期間實際跑放彈／爆風／破箱路徑。 */
const PC = [
  { id: 'a', character: 'lena' as const }, { id: 'b', character: 'mira' as const },
  { id: 'c', character: 'aya' as const },  { id: 'd', character: 'rosa' as const },
];

/** 將一場比賽決定性地推進「完整 sudden-death 塌縮」，回傳跑完後的指紋與佐證旗標。
 *
 *  設計（為何塌縮路徑一定會被走到，且比賽必經塌縮收尾）：
 *  - 不靠隨機戰鬥淘汰——若放任輸入流，比賽多半在 120s 前就分出勝負、step() 早退，
 *    elapsedMs 永遠到不了塌縮門檻。改用 debugMovePlayer 把四人「釘」在固定環距格上，
 *    再 debugSetElapsed 到塌縮前夕，逐幀 step 跨過全部 RING_INTERVAL_MS。
 *  - 環距 d = min(x, 12-x, y, 10-y)。a/b/c 釘在 d=1/2/3 且彼此遠離的格（左上／右下／右上
 *    三方），互不被爆風波及；d 釘在 d=5 的中心安全格、全程不會被塌縮觸及。
 *  - 關鍵：只對 a、b（注定陣亡且互相隔離者）餵 bomb，藉此在塌縮期間實跑放彈／爆風／
 *    破箱／grid 變異，且 a 在「第 1 圈塌縮」當幀即死，其腳下炸彈會被塌縮 bombs.filter
 *    清掉——順帶覆蓋該分支。c、d 絕不放彈（避免踩自己的彈自爆而讓比賽在第 3 圈前就結束），
 *    僅餵 ability：c=blink 只瞬移（每幀重新釘位修正）、d=bulwark 只給無敵，皆不致命。
 *  - 即便 b 在第 2 圈前因自己的彈自爆，alive 仍有 c、d 兩人，比賽續行；只要 c 撐到第 3 圈，
 *    塌縮就會推進到 collapsedRings=3 並殺 c，最後只剩 d → 比賽「經由塌縮」結束。
 *  - 每幀重新釘位仍存活的目標玩家：抵銷 blink/任何位移，確保各人如期被對應圈殺死。
 *  - 全程零 Math.random / Date.now：位置為定值、輸入走 createRng 決定性腳本。 */
function runCollapse(seed: number): { hash: string; maxRings: number; finishedDuringCollapse: boolean } {
  const m = new VersusMatch({ seed, arenaId: 3, players: PC });
  const script = createRng(seed ^ 0x5eed1234);

  // 釘位：環距 1 / 2 / 3 / 中心安全格（5）；a/b/c 三方遠離互不被爆風波及。
  const PARK: Record<string, { x: number; y: number }> = {
    a: { x: 1, y: 1 },  // d = 1，左上 → 第 1 圈塌縮致死
    b: { x: 10, y: 8 }, // d = 2，右下 → 第 2 圈塌縮致死（或先自爆，皆不影響推進）
    c: { x: 9, y: 3 },  // d = 3，右上 → 第 3 圈塌縮致死
    d: { x: 6, y: 5 },  // d = 5，中心 → 全程安全 → 最終獲勝者
  };
  // 只有 a、b 會放彈（兩人遠離、且都注定陣亡，自爆/誤傷都不破壞推進）。
  const BOMBERS = new Set(['a', 'b']);
  for (const p of PC) m.debugMovePlayer(p.id, PARK[p.id].x, PARK[p.id].y);

  // 推到塌縮前夕（門檻前一個 tick），確保第一個 step 之後才開始縮圈。
  m.debugSetElapsed(SUDDEN_DEATH_AT_MS - 1000 / 60);

  let maxRings = 0;
  let finishedDuringCollapse = false;
  // 跨越全部 MAX_COLLAPSE_RING 圈（門檻 + 3×RING_INTERVAL_MS）所需幀數，外加緩衝。
  // 比賽會在第 3 圈殺掉 c、只剩 d 時提早 finished，後續 step() 早退、決定性不受影響。
  const frames = Math.ceil((3 * RING_INTERVAL_MS + 2000) / (1000 / 60));
  for (let f = 0; f < frames; f++) {
    // 重新釘位仍存活的目標玩家，防止位移技能把人帶離該環。
    const state = m.getState();
    for (const p of state.players) {
      if (p.alive) m.debugMovePlayer(p.id, PARK[p.id].x, PARK[p.id].y);
    }
    // 決定性 bomb/ability 腳本（不餵方向鍵以維持釘位）。
    for (const p of PC) {
      const r = script();
      if (r < 0.15 && BOMBERS.has(p.id)) m.input(p.id, 'bomb');
      else if (r < 0.3) m.input(p.id, 'ability');
    }
    m.step(1000 / 60);

    const after = m.getState();
    if (after.collapsedRings > maxRings) maxRings = after.collapsedRings;
    if (after.status === 'finished' && after.collapsedRings > 0) finishedDuringCollapse = true;
  }

  return { hash: m.stateHash(), maxRings, finishedDuringCollapse };
}

describe('determinism', () => {
  it('同 seed＋同輸入流 → 每端 stateHash 一致（模擬 4 端各自重放）', () => {
    const h1 = runScripted(777, 3600); // 60s
    const h2 = runScripted(777, 3600);
    const h3 = runScripted(777, 3600);
    expect(h2).toBe(h1);
    expect(h3).toBe(h1);
  });

  it('重放涵蓋 sudden-death 塌縮路徑：獨立多次跑出相同 stateHash', () => {
    const r1 = runCollapse(424242);
    const r2 = runCollapse(424242);
    const r3 = runCollapse(424242);

    // 先證明塌縮路徑確實被執行（否則此測試會「靜默通過」而沒測到該路徑）：
    // 走完全部 MAX_COLLAPSE_RING 圈，且比賽是在塌縮進行中（collapsedRings>0）結束。
    expect(r1.maxRings).toBe(3);
    expect(r1.finishedDuringCollapse).toBe(true);
    // 三次獨立重放（含塌縮致死、塌縮名次、grid→wall 變異）→ 指紋必須完全一致。
    expect(r2.hash).toBe(r1.hash);
    expect(r3.hash).toBe(r1.hash);
    // 其餘旗標也應跨次一致。
    expect(r2.maxRings).toBe(r1.maxRings);
    expect(r3.maxRings).toBe(r1.maxRings);
  });

  it('不同 seed → hash 不同', () => {
    expect(runScripted(777, 600)).not.toBe(runScripted(778, 600));
  });

  it('getState() 為深拷貝：外部變更 state 不影響後續 stateHash', () => {
    const m = new VersusMatch({ seed: 99, arenaId: 3, players: P });
    for (let f = 0; f < 30; f++) m.step(1000 / 60);
    const before = m.stateHash();
    const snapshot = m.getState();
    // 惡意/意外地修改取出的快照——絕不能反向污染引擎內部狀態。
    snapshot.players[0].x = 999;
    snapshot.players[0].alive = false;
    snapshot.grid[0][0] = 'crate';
    snapshot.bombs.push({ x: 1, y: 1, fuseMs: 1, range: 9, owner: 'a' });
    snapshot.blasts.push({ x: 2, y: 2, ttlMs: 9 });
    snapshot.powerUps.push({ x: 3, y: 3, kind: 'fire' });
    expect(m.stateHash()).toBe(before);
  });
});
