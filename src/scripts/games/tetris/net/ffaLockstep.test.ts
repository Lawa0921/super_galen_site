import { describe, it, expect } from 'vitest';
import { FfaLockstep, LoopbackHub } from './ffaLockstep';
import { simulateFfaReplay } from './ffaReplay';
import type { InputAction } from '../engine/game';

/** 建 N 個接同一 LoopbackHub 的 FfaLockstep 節點，同 seed。 */
function buildNodes(playerIds: string[], seed: number): { nodes: FfaLockstep[]; hub: LoopbackHub } {
  const hub = new LoopbackHub();
  const nodes = playerIds.map(
    (localId) =>
      new FfaLockstep({
        playerIds,
        localId,
        seed,
        transport: hub.transportFor(localId),
      }),
  );
  return { nodes, hub };
}

/** 比對某節點全盤狀態的 JSON 指紋（依 playerIds 順序串接每盤 getPlayerState）。 */
function stateFingerprint(node: FfaLockstep): string {
  const m = node.getMatch();
  return JSON.stringify(m.playerIds.map((id) => m.getPlayerState(id)));
}

describe('FfaLockstep N 人鎖步', () => {
  it('4 端接同一 Hub、同 seed、各自輸入跑 120 幀 → 各端全盤狀態 JSON 完全一致', () => {
    const playerIds = ['P0', 'P1', 'P2', 'P3'];
    const { nodes } = buildNodes(playerIds, 12345);

    // 每端各自的輸入排程：依本端 localId 給不同序列
    const localActionsAt = (id: string, f: number): InputAction[] => {
      if (id === 'P0' && f % 5 === 0) return ['left'];
      if (id === 'P1' && f % 7 === 0) return ['right'];
      if (id === 'P2' && f % 11 === 0) return ['rotateCW'];
      if (id === 'P3' && f % 13 === 0) return ['softDrop'];
      return [];
    };

    for (let f = 0; f < 120; f++) {
      for (const node of nodes) {
        node.tick(localActionsAt(node.localId, f));
      }
    }

    // 各端全盤狀態指紋必須與 nodes[0] 完全一致
    const ref = stateFingerprint(nodes[0]);
    for (const node of nodes) {
      expect(stateFingerprint(node)).toBe(ref);
    }
  });

  it('各端 confirmedFrame 相等', () => {
    const playerIds = ['A', 'B', 'C', 'D'];
    const { nodes } = buildNodes(playerIds, 555);
    for (let f = 0; f < 120; f++) {
      for (const node of nodes) {
        node.tick(f % 3 === 0 ? ['hardDrop'] : []);
      }
    }
    const ref = nodes[0].confirmedFrame;
    expect(ref).toBeGreaterThan(0);
    for (const node of nodes) {
      expect(node.confirmedFrame).toBe(ref);
    }
  });

  it('某端 getReplay() 丟給 simulateFfaReplay → 名次等於實際 getStandings', () => {
    const playerIds = ['P0', 'P1', 'P2', 'P3'];
    const { nodes } = buildNodes(playerIds, 7);

    // 跑到分出勝負（P0 狂 hardDrop 先死、其餘不動隨重力堆死）
    let f = 0;
    for (; f < 10000 && nodes[0].getMatch().phase === 'playing'; f++) {
      for (const node of nodes) {
        const local: InputAction[] = node.localId === 'P0' && f % 2 === 0 ? ['hardDrop'] : [];
        node.tick(local);
      }
    }
    expect(nodes[0].getMatch().phase).toBe('result');

    const actualStandings = nodes[0].getStandings();
    expect(actualStandings.length).toBe(playerIds.length);

    const replay = nodes[0].getReplay();
    expect(replay.seed).toBe(7);
    expect(replay.playerIds).toEqual(playerIds);
    const simStandings = simulateFfaReplay(replay);
    expect(simStandings).toEqual(actualStandings);

    // 其餘端的 replay 也應重模擬出相同名次（鎖步全端紀錄一致）
    for (const node of nodes) {
      expect(simulateFfaReplay(node.getReplay())).toEqual(actualStandings);
      expect(node.getStandings()).toEqual(actualStandings);
    }
  });

  it('缺某玩家某幀輸入 → 不前進該幀（confirmedFrame 卡住）；補上後恢復', () => {
    const playerIds = ['P0', 'P1', 'P2', 'P3'];
    const seed = 99;
    const hub = new LoopbackHub();
    const nodes = playerIds.map(
      (localId) =>
        new FfaLockstep({ playerIds, localId, seed, transport: hub.transportFor(localId) }),
    );

    // 只讓 P0/P1/P2 tick（P3 不送任何幀），跑幾輪
    for (let f = 0; f < 20; f++) {
      nodes[0].tick([]);
      nodes[1].tick([]);
      nodes[2].tick([]);
    }
    const stuck = nodes[0].confirmedFrame;
    // P3 從未送輸入 → 缺其輸入的幀全部卡住（confirmedFrame 應遠小於 20）
    expect(stuck).toBeLessThan(20);

    // 補上 P3 的輸入後應恢復推進
    for (let f = 0; f < 30; f++) {
      for (const node of nodes) node.tick([]);
    }
    expect(nodes[0].confirmedFrame).toBeGreaterThan(stuck);
    // 全端仍一致
    const ref = stateFingerprint(nodes[0]);
    for (const node of nodes) expect(stateFingerprint(node)).toBe(ref);
  });

  it('一名玩家 topout 淘汰後仍能繼續推進（淘汰者補空輸入、不死鎖）直到 victory', () => {
    const playerIds = ['P0', 'P1', 'P2', 'P3'];
    const { nodes } = buildNodes(playerIds, 7);

    // P0 狂 hardDrop 先死；之後僅 P1/P2/P3 三端繼續 tick（模擬淘汰者離場不再送輸入）
    let f = 0;
    let p0Eliminated = false;
    for (; f < 20000 && nodes[0].getMatch().phase === 'playing'; f++) {
      for (const node of nodes) {
        // 一旦 P0 被淘汰，P0 端就不再 tick（驗證淘汰者該幀自動補空輸入避免死鎖）
        if (node.localId === 'P0') {
          if (p0Eliminated) continue;
          node.tick(f % 2 === 0 ? ['hardDrop'] : []);
        } else {
          node.tick([]);
        }
      }
      if (!p0Eliminated) {
        const placement = nodes[1].getMatch().getPlacement();
        if (placement.has('P0')) p0Eliminated = true;
      }
    }

    expect(p0Eliminated).toBe(true);
    expect(nodes[1].getMatch().phase).toBe('result');
    const standings = nodes[1].getStandings();
    expect(standings.length).toBe(4);
    // P0 最先死 → 名次最後
    expect(standings[standings.length - 1]).toBe('P0');
    // 仍活著的端彼此狀態一致
    const ref = stateFingerprint(nodes[1]);
    for (const node of nodes) {
      if (node.localId === 'P0') continue;
      expect(stateFingerprint(node)).toBe(ref);
    }
  });

  it('onMessage 收到畸形訊息（非 JSON / p 不在名單 / a 非陣列 / 非法 action）→ 不丟例外、不污染狀態', () => {
    const playerIds = ['P0', 'P1'];
    let cap: ((d: unknown) => void) | null = null;
    const transport = {
      send(): void {},
      onMessage(cb: (m: unknown) => void): void {
        cap = cb as (d: unknown) => void;
      },
    };
    const ls = new FfaLockstep({ playerIds, localId: 'P0', seed: 1, transport: transport as never });
    expect(cap).not.toBeNull();

    const before = JSON.stringify(ls.getMatch().getPlayerState('P1'));

    expect(() => cap!('not json{')).not.toThrow(); // 畸形 JSON 字串
    expect(() => cap!(JSON.stringify({ junk: 1 }))).not.toThrow(); // 缺欄位
    expect(() => cap!({ f: 'x', p: 'P1', a: [] })).not.toThrow(); // f 非數字
    expect(() => cap!({ f: 0, p: 'ZZ', a: [] })).not.toThrow(); // p 不在名單
    expect(() => cap!({ f: 0, p: 'P1', a: 'nope' })).not.toThrow(); // a 非陣列
    expect(() => cap!({ f: 0, p: 'P1', a: ['fly'] })).not.toThrow(); // 非法 action
    expect(() => cap!(null)).not.toThrow();
    expect(() => cap!(undefined)).not.toThrow();

    // 推進若干幀（P1 從沒有合法輸入 → 一直卡，但絕不丟例外、不前進）
    for (let f = 0; f < 5; f++) expect(() => ls.tick([])).not.toThrow();
    // 狀態未被污染：P1 盤面仍是初始（從未被 step，因為缺其合法輸入而卡幀）
    expect(JSON.stringify(ls.getMatch().getPlayerState('P1'))).toBe(before);
  });
});
