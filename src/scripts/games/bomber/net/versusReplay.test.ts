import { describe, it, expect } from 'vitest';
import { BomberLockstep, LoopbackBomberHub, type VersusAction } from './bomberLockstep';
import {
  simulateVersusReplay,
  liveStandings,
  type VersusReplay,
} from './versusReplay';
import type { CharacterId } from '../engine/types';
import { VersusMatch } from '../versus/versusMatch';

const CHARS: CharacterId[] = ['lena', 'mira', 'aya', 'rosa'];

/** 建 N 個接同一 LoopbackBomberHub 的 BomberLockstep 節點。 */
function buildNodes(
  playerIds: string[],
  seed: number,
  arenaId = 0,
): { nodes: BomberLockstep[]; hub: LoopbackBomberHub; characters: Record<string, CharacterId> } {
  const hub = new LoopbackBomberHub();
  const characters: Record<string, CharacterId> = {};
  playerIds.forEach((id, i) => (characters[id] = CHARS[i % CHARS.length]));
  const nodes = playerIds.map(
    (localId) =>
      new BomberLockstep({
        playerIds,
        localId,
        seed,
        arenaId,
        characters,
        transport: hub.transportFor(localId),
      }),
  );
  return { nodes, hub };
}

/**
 * 把全端推進到同一個 confirmedFrame（消除同步 loopback 末輪的良性一幀偏移），
 * 比照 bomberLockstep.test 的 settle。
 */
function settle(nodes: BomberLockstep[], hub?: LoopbackBomberHub): void {
  for (let r = 0; r < 200; r++) {
    const max = Math.max(...nodes.map((n) => n.confirmedFrame));
    const laggards = nodes.filter((n) => n.confirmedFrame < max);
    if (laggards.length === 0) break;
    for (const n of laggards) n.tick();
    hub?.flush();
  }
}

/**
 * 跑一場 2 人局到 P0 自爆淘汰、P1 奪冠。P0 放彈原地不動，P1 也不動。
 * 回傳 nodes[1]（倖存端，已 finished）。
 */
function runSelfBombMatch(seed: number): { node: BomberLockstep; nodes: BomberLockstep[] } {
  const playerIds = ['P0', 'P1'];
  const { nodes } = buildNodes(playerIds, seed, 0);
  nodes[0].queueLocal({ t: 'bomb' });

  let p0Dead = false;
  for (let f = 0; f < 6000 && nodes[1].match.getState().status === 'playing'; f++) {
    for (const node of nodes) {
      if (node.localId === 'P0' && p0Dead) continue;
      node.tick();
    }
    const p0 = nodes[1].match.getState().players.find((p) => p.id === 'P0');
    if (p0 && !p0.alive) p0Dead = true;
  }
  settle(nodes);
  return { node: nodes[1], nodes };
}

describe('liveStandings — 由 placement 推導名次（winner first）', () => {
  it('已結束局：名次依 placement 升冪、平手以 playerIds 序穩定排列', () => {
    const { node } = runSelfBombMatch(3);
    const st = node.match.getState();
    expect(st.status).toBe('finished');
    const standings = liveStandings(node.match, ['P0', 'P1']);
    // P1 奪冠（placement 1）在前、P0 自爆（placement 2）殿後
    expect(standings).toEqual(['P1', 'P0']);
  });
});

describe('BomberLockstep.getReplay — 捕捉稀疏輸入log', () => {
  it('輸出 seed/arenaId/characters/playerIds/frameCount/inputs', () => {
    const { node } = runSelfBombMatch(3);
    const replay = node.getReplay();
    expect(replay.seed).toBe(3);
    expect(replay.arenaId).toBe(0);
    expect(replay.playerIds).toEqual(['P0', 'P1']);
    expect(replay.characters).toMatchObject({ P0: 'lena', P1: 'mira' });
    expect(replay.frameCount).toBeGreaterThan(0);
    expect(Array.isArray(replay.inputs)).toBe(true);
    // 稀疏：空輸入幀不應出現在 inputs（log 只記非空）
    for (const e of replay.inputs) {
      expect(e.a.length).toBeGreaterThan(0);
    }
  });
});

describe('simulateVersusReplay — 重模擬還原名次與 stateHash', () => {
  it('2 人局（自爆）：模擬名次與 stateHash == 原局', () => {
    const { node } = runSelfBombMatch(3);
    const replay = node.getReplay();
    const live = {
      standings: liveStandings(node.match, replay.playerIds),
      stateHash: node.match.stateHash(),
    };
    const sim = simulateVersusReplay(replay);
    expect(sim.standings).toEqual(live.standings);
    expect(sim.stateHash).toBe(live.stateHash);
  });

  it('4 人混合輸入跑完一段：模擬 stateHash 與名次 == 原局', () => {
    const playerIds = ['P0', 'P1', 'P2', 'P3'];
    const { nodes } = buildNodes(playerIds, 12345, 1);
    const localActionsAt = (id: string, f: number): VersusAction[] => {
      const out: VersusAction[] = [];
      const k = playerIds.indexOf(id);
      if (f % (5 + k) === 0) out.push({ t: 'held', d: (['up', 'down', 'left', 'right'] as const)[k], v: true });
      if (f % (5 + k) === 2) out.push({ t: 'held', d: (['up', 'down', 'left', 'right'] as const)[k], v: false });
      if (f % (17 + k) === 0) out.push(k % 2 === 0 ? { t: 'bomb' } : { t: 'ability' });
      return out;
    };
    for (let f = 0; f < 800; f++) {
      for (const node of nodes) {
        node.queueLocal(...localActionsAt(node.localId, f));
        node.tick();
      }
    }
    settle(nodes);

    const node = nodes[0];
    const replay = node.getReplay();
    const live = {
      standings: liveStandings(node.match, replay.playerIds),
      stateHash: node.match.stateHash(),
    };
    const sim = simulateVersusReplay(replay);
    expect(sim.stateHash).toBe(live.stateHash);
    expect(sim.standings).toEqual(live.standings);
  });

  it('determinism：同 replay 模擬兩次完全相同', () => {
    const { node } = runSelfBombMatch(3);
    const replay = node.getReplay();
    const a = simulateVersusReplay(replay);
    const b = simulateVersusReplay(replay);
    expect(a.standings).toEqual(b.standings);
    expect(a.stateHash).toBe(b.stateHash);
  });
});

describe('simulateVersusReplay — forfeit 結束的局也能重現', () => {
  it('P1 斷線（不送輸入）+ host forfeit → 模擬名次與 stateHash == 原局', () => {
    const playerIds = ['P0', 'P1'];
    const characters: Record<string, CharacterId> = { P0: 'lena', P1: 'mira' };
    const hub = new LoopbackBomberHub();
    // 只建 P0 端（P1 從不送輸入＝斷線）
    const ls = new BomberLockstep({
      playerIds,
      localId: 'P0',
      seed: 3,
      arenaId: 0,
      characters,
      transport: hub.transportFor('P0'),
    });

    // 推進到卡住（缺 P1）。
    for (let f = 0; f < 10; f++) ls.tick();
    // 以 lastInputFrame(P1)+1 推導離場幀（決定性），對 P1 forfeit。
    ls.forfeit('P1', ls.lastInputFrame('P1') + 1);
    for (let f = 0; f < 60 && ls.match.getState().status === 'playing'; f++) ls.tick();

    const s = ls.match.getState();
    expect(s.status).toBe('finished');
    expect(s.winnerId).toBe('P0');

    const replay = ls.getReplay();
    // replay 必須捕捉到 forfeit（否則重模擬永遠不會結束）
    expect(Array.isArray(replay.forfeits)).toBe(true);
    expect(replay.forfeits!.some((ff) => ff.p === 'P1')).toBe(true);

    const live = {
      standings: liveStandings(ls.match, replay.playerIds),
      stateHash: ls.match.stateHash(),
    };
    const sim = simulateVersusReplay(replay);
    expect(sim.standings).toEqual(live.standings);
    expect(sim.stateHash).toBe(live.stateHash);
    expect(sim.standings).toEqual(['P0', 'P1']);
  });

  it('forfeit 局 determinism：模擬兩次相同', () => {
    const playerIds = ['P0', 'P1'];
    const characters: Record<string, CharacterId> = { P0: 'lena', P1: 'mira' };
    const hub = new LoopbackBomberHub();
    const ls = new BomberLockstep({
      playerIds, localId: 'P0', seed: 5, arenaId: 0, characters,
      transport: hub.transportFor('P0'),
    });
    for (let f = 0; f < 10; f++) ls.tick();
    ls.forfeit('P1', ls.lastInputFrame('P1') + 1);
    for (let f = 0; f < 60 && ls.match.getState().status === 'playing'; f++) ls.tick();
    const replay = ls.getReplay();
    const a = simulateVersusReplay(replay);
    const b = simulateVersusReplay(replay);
    expect(a.stateHash).toBe(b.stateHash);
    expect(a.standings).toEqual(b.standings);
  });
});

describe('simulateVersusReplay — 未結束局回傳的 status', () => {
  it('frameCount 裁短到必不結束：standings 含全員、stateHash 仍可計算（不丟例外）', () => {
    const { node } = runSelfBombMatch(3);
    const replay = node.getReplay();
    const partial: VersusReplay = { ...replay, frameCount: 2 };
    expect(() => simulateVersusReplay(partial)).not.toThrow();
    const sim = simulateVersusReplay(partial);
    expect(typeof sim.stateHash).toBe('string');
    expect(sim.standings.length).toBe(replay.playerIds.length);
  });
});

describe('simulateVersusReplay — 竄改輸入被抓（stateHash 變動）', () => {
  it('插入額外 bomb 輸入 → stateHash != 原局', () => {
    const { node } = runSelfBombMatch(3);
    const replay = node.getReplay();
    const liveHash = node.match.stateHash();
    const tampered: VersusReplay = {
      ...replay,
      inputs: [{ f: 0, p: 'P1', a: [{ t: 'bomb' }] }, ...replay.inputs],
      // 給足夠幀讓竄改有機會改變局面
      frameCount: replay.frameCount,
    };
    const sim = simulateVersusReplay(tampered);
    // 竄改後 hash 幾乎必然不同（P1 多放一顆彈改變局面）
    expect(sim.stateHash).not.toBe(liveHash);
  });
});

describe('VersusReplay 結構 — 可直接餵 VersusMatch 重建（無需 lockstep）', () => {
  it('用 replay 的 seed/arenaId/characters/playerIds 建 VersusMatch 不丟例外', () => {
    const { node } = runSelfBombMatch(3);
    const replay = node.getReplay();
    expect(
      () =>
        new VersusMatch({
          seed: replay.seed,
          arenaId: replay.arenaId,
          players: replay.playerIds.map((id) => ({ id, character: replay.characters[id] })),
        }),
    ).not.toThrow();
  });
});
