// src/scripts/games/bomber/versus/determinism.test.ts
import { describe, it, expect } from 'vitest';
import { VersusMatch } from './versusMatch';
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

describe('determinism', () => {
  it('同 seed＋同輸入流 → 每端 stateHash 一致（模擬 4 端各自重放）', () => {
    const h1 = runScripted(777, 3600); // 60s
    const h2 = runScripted(777, 3600);
    const h3 = runScripted(777, 3600);
    expect(h2).toBe(h1);
    expect(h3).toBe(h1);
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
