import { describe, it, expect } from 'vitest';
import { FfaLockstep, LoopbackHub } from './ffaLockstep';
import type { FfaFrameMsg } from './ffaLockstep';
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

describe('FfaLockstep.scheduleForfeit 幀排程確定性棄權', () => {
  /**
   * 標準中離場景：4 端同 hub 同 seed。
   * P3 只 tick 28 次（送出幀 3..30；加上預填 0..2 → 幀 0..30 有 P3 輸入），
   * 其餘三端 tick 30 次（送到幀 32）→ 全端 confirmedFrame 卡在 31（缺 P3 幀 31）。
   * host 廣播的 F = 中離者最後輸入幀(30) + 1 = 31。
   */
  function buildStuckAt31(
    seed: number,
    p3LeftAtTick = -1,
  ): { playerIds: string[]; nodes: FfaLockstep[] } {
    const playerIds = ['P0', 'P1', 'P2', 'P3'];
    const { nodes } = buildNodes(playerIds, seed);
    for (let i = 0; i < 28; i++) {
      for (const node of nodes) {
        const a: InputAction[] = node.localId === 'P3' && i === p3LeftAtTick ? ['left'] : [];
        node.tick(a);
      }
    }
    // P3 中離：不再 tick；其餘三端再跑 2 輪
    for (let i = 28; i < 30; i++) {
      for (const node of nodes) {
        if (node.localId === 'P3') continue;
        node.tick([]);
      }
    }
    return { playerIds, nodes };
  }

  /** 中離後續行的三個存活端（不含 P3 端）。 */
  function survivors(nodes: FfaLockstep[]): FfaLockstep[] {
    return nodes.filter((n) => n.localId !== 'P3');
  }

  it('核心續行：P3 停 tick → 三端 scheduleForfeit(P3,31) → 幀 31 判敗（placement=4）、續行到 victory、三端狀態與名次一致', () => {
    const { nodes } = buildStuckAt31(20260611);
    const alive = survivors(nodes);

    // 卡幀前提：全端 confirmedFrame 卡在 31（缺 P3 幀 31 輸入）
    for (const node of alive) expect(node.confirmedFrame).toBe(31);

    // host 廣播後各存活端排程（P3 端已離線不再 tick，不需排程）
    for (const node of alive) node.scheduleForfeit('P3', 31);

    // 續行幾輪：P3 應在幀 31 被判敗、confirmedFrame 恢復推進
    for (let i = 0; i < 10; i++) for (const node of alive) node.tick([]);
    for (const node of alive) {
      expect(node.getMatch().getPlacement().get('P3')).toBe(4);
      expect(node.confirmedFrame).toBeGreaterThan(31);
    }
    const cfAfter = alive[0].confirmedFrame;

    // 驅動到 victory：P0 狂 hardDrop 先死、其餘隨重力堆死
    let f = 0;
    for (; f < 20000 && alive[0].getMatch().phase === 'playing'; f++) {
      for (const node of alive) {
        node.tick(node.localId === 'P0' && f % 2 === 0 ? ['hardDrop'] : []);
      }
    }
    expect(alive[0].getMatch().phase).toBe('result');
    expect(alive[0].confirmedFrame).toBeGreaterThan(cfAfter); // 持續推進過

    // 三端 standings 一致且 P3 墊底
    const standings = alive[0].getStandings();
    expect(standings.length).toBe(4);
    expect(standings[3]).toBe('P3');
    const ref = stateFingerprint(alive[0]);
    for (const node of alive) {
      expect(node.getStandings()).toEqual(standings);
      expect(stateFingerprint(node)).toBe(ref);
    }
  });

  it('f 之前的輸入照常生效：P3 在中離前的 left 反映在其盤面、且 replay events 仍記錄', () => {
    // 對照組：完全相同的 tick 安排但 P3 沒按 left
    const withLeft = buildStuckAt31(777, 5);
    const noLeft = buildStuckAt31(777);

    // 兩局都卡在 31（幀 0..30 已模擬）→ P3 的 left（tick5 → 幀 8）已套用，盤面應不同
    const p3With = JSON.stringify(withLeft.nodes[0].getMatch().getPlayerState('P3'));
    const p3Without = JSON.stringify(noLeft.nodes[0].getMatch().getPlayerState('P3'));
    expect(p3With).not.toBe(p3Without);

    // 排程棄權後，replay events 仍含 P3 中離前的輸入（幀 8 = tick5 + inputDelay3）
    const alive = survivors(withLeft.nodes);
    for (const node of alive) node.scheduleForfeit('P3', 31);
    for (let i = 0; i < 5; i++) for (const node of alive) node.tick([]);
    const replay = alive[0].getReplay();
    expect(replay.events).toContainEqual({ f: 8, p: 'P3', a: ['left'] });
  });

  it('scheduleForfeit 對未知 p / NaN / 負數 / Infinity → 忽略不丟例外、無人被判敗、forfeits 為空陣列', () => {
    const playerIds = ['P0', 'P1', 'P2', 'P3'];
    const { nodes } = buildNodes(playerIds, 42);
    const node = nodes[0];

    expect(() => node.scheduleForfeit('ZZ', 10)).not.toThrow();
    expect(() => node.scheduleForfeit('P1', NaN)).not.toThrow();
    expect(() => node.scheduleForfeit('P1', -5)).not.toThrow();
    expect(() => node.scheduleForfeit('P1', Infinity)).not.toThrow();

    for (let i = 0; i < 30; i++) for (const n of nodes) n.tick([]);
    expect(node.getMatch().getPlacement().size).toBe(0);
    expect(node.getReplay().forfeits).toEqual([]);
  });

  it('重複 schedule 取最早 f（先 50 後 31 → 在 31 套用；先 31 後 50 亦同）', () => {
    // 先 50 後 31：若沒取 min（保留 50），P3 缺幀 31 輸入會永遠卡住、forfeit 永不套用
    const a = buildStuckAt31(8);
    const aliveA = survivors(a.nodes);
    for (const node of aliveA) {
      node.scheduleForfeit('P3', 50);
      node.scheduleForfeit('P3', 31);
    }
    for (let i = 0; i < 10; i++) for (const node of aliveA) node.tick([]);
    expect(aliveA[0].getMatch().getPlacement().get('P3')).toBe(4);
    expect(aliveA[0].getReplay().forfeits).toEqual([{ f: 31, p: 'P3' }]);

    // 先 31 後 50：後到的較晚 f 不得覆蓋較早的
    const b = buildStuckAt31(8);
    const aliveB = survivors(b.nodes);
    for (const node of aliveB) {
      node.scheduleForfeit('P3', 31);
      node.scheduleForfeit('P3', 50);
    }
    for (let i = 0; i < 10; i++) for (const node of aliveB) node.tick([]);
    expect(aliveB[0].getMatch().getPlacement().get('P3')).toBe(4);
    expect(aliveB[0].getReplay().forfeits).toEqual([{ f: 31, p: 'P3' }]);
  });

  it('已 topout 者 schedule → no-op（名次不變、forfeits 不記錄、對局續行）', () => {
    const playerIds = ['P0', 'P1', 'P2', 'P3'];
    const { nodes } = buildNodes(playerIds, 7);

    // P0 狂 hardDrop 到 topout
    let f = 0;
    for (; f < 20000 && !nodes[0].getMatch().getPlacement().has('P0'); f++) {
      for (const node of nodes) {
        node.tick(node.localId === 'P0' && f % 2 === 0 ? ['hardDrop'] : []);
      }
    }
    const placementBefore = nodes[0].getMatch().getPlacement().get('P0');
    expect(placementBefore).toBe(4);

    for (const node of nodes) node.scheduleForfeit('P0', node.confirmedFrame + 5);
    for (let i = 0; i < 30; i++) for (const node of nodes) node.tick([]);

    for (const node of nodes) {
      expect(node.getMatch().getPlacement().get('P0')).toBe(placementBefore);
      expect(node.getReplay().forfeits).toEqual([]);
    }
    // 對局仍正常（沒因排程壞掉）
    const ref = stateFingerprint(nodes[0]);
    for (const node of nodes) expect(stateFingerprint(node)).toBe(ref);
  });

  it('getReplay().forfeits 含實際套用幀 {f:31, p:P3}（各存活端一致）', () => {
    const { nodes } = buildStuckAt31(13);
    const alive = survivors(nodes);
    for (const node of alive) node.scheduleForfeit('P3', 31);
    for (let i = 0; i < 10; i++) for (const node of alive) node.tick([]);
    for (const node of alive) {
      expect(node.getReplay().forfeits).toEqual([{ f: 31, p: 'P3' }]);
    }
  });

  it('遲到的 forfeit（f 小於目前 simFrame）→ 下一次 advance 立即套用、記實際套用幀', () => {
    const { nodes } = buildStuckAt31(99);
    const alive = survivors(nodes);
    // 全端卡在 simFrame=31，排程一個早已過去的幀 f=5
    for (const node of alive) expect(node.confirmedFrame).toBe(31);
    for (const node of alive) node.scheduleForfeit('P3', 5);
    for (let i = 0; i < 10; i++) for (const node of alive) node.tick([]);
    for (const node of alive) {
      expect(node.getMatch().getPlacement().get('P3')).toBe(4);
      // 記實際套用幀（31），不是排程的 5
      expect(node.getReplay().forfeits).toEqual([{ f: 31, p: 'P3' }]);
      expect(node.confirmedFrame).toBeGreaterThan(31);
    }
    // 存活端狀態一致
    const ref = stateFingerprint(alive[0]);
    for (const node of alive) expect(stateFingerprint(node)).toBe(ref);
  });
});

describe('FfaLockstep 同步狀態 export/import（host migration M3）', () => {
  /** 手動傳遞節點：send 進 sent 陣列、inject 直灌 onMessage（自己的輸入 tick 內已寫 inbox）。 */
  function makeManualNode(
    playerIds: string[],
    localId: string,
    seed: number,
  ): { node: FfaLockstep; sent: FfaFrameMsg[]; inject: (m: unknown) => void } {
    let cb: ((m: unknown) => void) | null = null;
    const sent: FfaFrameMsg[] = [];
    const node = new FfaLockstep({
      playerIds,
      localId,
      seed,
      transport: {
        send: (m: FfaFrameMsg): void => {
          sent.push(m);
        },
        onMessage: (c: (m: FfaFrameMsg) => void): void => {
          cb = c as (m: unknown) => void;
        },
      },
    });
    return { node, sent, inject: (m: unknown) => cb!(m) };
  }

  /** 把 inputs 排序成確定性順序方便比對。 */
  function sortInputs<T extends { f: number; p: string }>(inputs: T[]): T[] {
    return [...inputs].sort((x, y) => x.f - y.f || x.p.localeCompare(y.p));
  }

  it('初始 exportSyncState 形狀正確：cf=0、horizon=預填上界（inputDelay-1）、inputs=預填空幀攤平', () => {
    const { node } = makeManualNode(['A', 'B'], 'A', 1);
    const s = node.exportSyncState();
    expect(s.cf).toBe(0);
    // 自己 = sendFrame(0)+inputDelay(3)-1 = 2；B = inbox 預填最大鍵 2
    expect(s.horizon).toEqual({ A: 2, B: 2 });
    expect(sortInputs(s.inputs)).toEqual([
      { f: 0, p: 'A', a: [] },
      { f: 0, p: 'B', a: [] },
      { f: 1, p: 'A', a: [] },
      { f: 1, p: 'B', a: [] },
      { f: 2, p: 'A', a: [] },
      { f: 2, p: 'B', a: [] },
    ]);
  });

  it('tick 後 export：cf=confirmedFrame、自己 horizon=sendFrame+delay-1、inputs 含自己已送未消化幀；收到遠端幀後 horizon 更新', () => {
    const { node, inject } = makeManualNode(['A', 'B'], 'A', 1);
    node.tick(['left']); // 預填 0..2 消化 → cf=3；送出 A@3=['left']
    node.tick([]); // 送出 A@4=[]；缺 B@3 → cf 仍 3
    expect(node.confirmedFrame).toBe(3);

    let s = node.exportSyncState();
    expect(s.cf).toBe(3);
    // A：sendFrame(2)+3-1=4；B：inbox 已空 → 已消化至 cf-1=2
    expect(s.horizon).toEqual({ A: 4, B: 2 });
    expect(sortInputs(s.inputs)).toEqual([
      { f: 3, p: 'A', a: ['left'] },
      { f: 4, p: 'A', a: [] },
    ]);

    // 收到 B@3（未消化前 export）→ horizon.B=3、inputs 含該幀
    // 注意 export 必須在消化前觀察：B@3 進來後 advance 只在 tick 內跑 → 仍未消化
    inject({ f: 3, p: 'B', a: ['right'] });
    s = node.exportSyncState();
    expect(s.horizon).toEqual({ A: 4, B: 3 });
    expect(sortInputs(s.inputs)).toEqual([
      { f: 3, p: 'A', a: ['left'] },
      { f: 3, p: 'B', a: ['right'] },
      { f: 4, p: 'A', a: [] },
    ]);
  });

  it('視野不等的斷點補課：host 死後 A export → B import + scheduleForfeit → 兩端越過缺口續行且狀態一致', () => {
    // 3 人局：A、B 為真節點，H（host）由測試腳本扮演。
    const playerIds = ['A', 'B', 'H'];
    const A = makeManualNode(playerIds, 'A', 77);
    const B = makeManualNode(playerIds, 'B', 77);
    let aPtr = 0; // A.sent 已投遞給 B 的指標
    let bPtr = 0; // B.sent 已投遞給 A 的指標
    const deliverAtoB = (): void => {
      for (; aPtr < A.sent.length; aPtr++) B.inject(A.sent[aPtr]);
    };
    const deliverBtoA = (): void => {
      for (; bPtr < B.sent.length; bPtr++) A.inject(B.sent[bPtr]);
    };

    // 正常 10 輪：雙向投遞 + H 每輪送空輸入幀 r+3（H 最後已知幀=12）
    for (let r = 0; r < 10; r++) {
      A.node.tick(r % 4 === 0 ? ['left'] : []);
      B.node.tick(r % 5 === 0 ? ['rotateCW'] : []);
      deliverAtoB();
      deliverBtoA();
      const h: FfaFrameMsg = { f: r + 3, p: 'H', a: [] };
      A.inject(h);
      B.inject(h);
    }

    // host 死亡窗 3 輪：H 無新幀；A→B 投遞中斷（視野不等），B→A 仍通（死前 host 已轉發）
    for (let r = 10; r < 13; r++) {
      A.node.tick([]);
      B.node.tick([]);
      deliverBtoA();
    }
    // 死亡窗內 A 的幀（13..15）在舊 host 上遺失，永不重送
    aPtr = A.sent.length;

    // 兩端皆卡在 13（缺 H@13）；B 另缺 A@13..15（原缺口）
    expect(A.node.confirmedFrame).toBe(13);
    expect(B.node.confirmedFrame).toBe(13);
    const sA = A.node.exportSyncState();
    const sB = B.node.exportSyncState();
    expect(sA.horizon).toEqual({ A: 15, B: 15, H: 12 });
    expect(sB.horizon).toEqual({ A: 12, B: 15, H: 12 });

    // 合併補課：B 灌入 A 的視野（重複 import 一次驗證無害）；hostForfeitF = max(horizon.H)+1 = 13
    B.node.importMergedInputs(sA.inputs);
    B.node.importMergedInputs(sA.inputs);
    A.node.importMergedInputs(sB.inputs);
    A.node.scheduleForfeit('H', 13);
    B.node.scheduleForfeit('H', 13);

    // 續行（新 host 接手 → 雙向投遞恢復，只轉發新幀）
    for (let r = 13; r < 25; r++) {
      A.node.tick([]);
      B.node.tick([]);
      deliverAtoB();
      deliverBtoA();
    }

    // 兩端皆越過原缺口（>15），H 判敗（3 人局墊底=3），狀態指紋一致
    expect(A.node.confirmedFrame).toBeGreaterThan(15);
    expect(B.node.confirmedFrame).toBeGreaterThan(15);
    expect(A.node.confirmedFrame).toBe(B.node.confirmedFrame);
    expect(A.node.getMatch().getPlacement().get('H')).toBe(3);
    expect(B.node.getMatch().getPlacement().get('H')).toBe(3);
    expect(A.node.getReplay().forfeits).toEqual([{ f: 13, p: 'H' }]);
    expect(stateFingerprint(A.node)).toBe(stateFingerprint(B.node));
  });

  it('exportSyncState 含 replay tail：已套用（已從 inbox 刪除）的非空幀一併匯出', () => {
    const { node, inject } = makeManualNode(['A', 'B'], 'A', 1);
    node.tick(['left']); // 預填 0..2 消化 → cf=3；送出 A@3=['left']
    inject({ f: 3, p: 'B', a: [] });
    node.tick([]); // 消化 f=3（A@3 套用後從 inbox 刪除）→ cf=4
    expect(node.confirmedFrame).toBe(4);
    // 沒有 tail 的話 A@3 已從 inbox 消失 → 落後端永遠補不到這幀
    const s = node.exportSyncState();
    expect(s.inputs).toContainEqual({ f: 3, p: 'A', a: ['left'] });
  });

  it('fillEmptyInputsUpTo：為缺幀者補空輸入（不覆蓋既有、跳過自己、壞值忽略）', () => {
    const { node } = makeManualNode(['A', 'B'], 'A', 2);
    node.tick([]);
    node.tick([]); // cf=3 卡住（缺 B@3）；自己已記錄 A@3、A@4
    expect(node.confirmedFrame).toBe(3);

    // 既有輸入不覆蓋：先補 B@4 真輸入，再 fill 到 6 → B@3/B@5 補空、B@4 保留
    node.importMergedInputs([{ f: 4, p: 'B', a: ['right'] }]);
    node.fillEmptyInputsUpTo(6);
    // 自己（A）的幀不由 fill 合成：A@5 尚未送出 → 不得被搶填空輸入
    expect(node.exportSyncState().inputs).not.toContainEqual({ f: 5, p: 'A', a: [] });
    node.tick([]); // 記錄 A@5 → f=3..5 齊備 → cf 推進到 6
    expect(node.confirmedFrame).toBe(6);
    // B@4=['right'] 已被套用 → 出現在 replay tail（驗證 fill 沒覆蓋它）
    expect(node.exportSyncState().inputs).toContainEqual({ f: 4, p: 'B', a: ['right'] });

    // 壞值一律忽略、不丟例外、不污染
    const cfBefore = node.confirmedFrame;
    expect(() => node.fillEmptyInputsUpTo(Number.NaN)).not.toThrow();
    expect(() => node.fillEmptyInputsUpTo(-5)).not.toThrow();
    expect(() => node.fillEmptyInputsUpTo(Number.POSITIVE_INFINITY)).not.toThrow();
    expect(node.confirmedFrame).toBe(cfBefore);
  });

  it('cf 偏移的斷點補課：ahead 端已消化 laggard 缺幀 → replay tail + fillEmpty 收斂一致（e2e 實測根因）', () => {
    // 真實 host 死亡時各端停滯點不同：A 多收到 host 死前 relay 的幀 → cf 超前 B，
    // 且 A 已把 B 缺的幀「消化並從 inbox 刪除」——光靠 inbox 視野合併補不回來。
    const playerIds = ['A', 'B', 'H'];
    const A = makeManualNode(playerIds, 'A', 77);
    const B = makeManualNode(playerIds, 'B', 77);
    let aPtr = 0;
    let bPtr = 0;
    const deliverAtoB = (): void => {
      for (; aPtr < A.sent.length; aPtr++) B.inject(A.sent[aPtr]);
    };
    const deliverBtoA = (): void => {
      for (; bPtr < B.sent.length; bPtr++) A.inject(B.sent[bPtr]);
    };

    // 正常 10 輪：雙向投遞 + H 每輪送空輸入幀 r+3
    for (let r = 0; r < 10; r++) {
      A.node.tick(r % 4 === 0 ? ['left'] : []);
      B.node.tick(r % 5 === 0 ? ['rotateCW'] : []);
      deliverAtoB();
      deliverBtoA();
      const h: FfaFrameMsg = { f: r + 3, p: 'H', a: [] };
      A.inject(h);
      B.inject(h);
    }

    // 死亡窗 3 輪：B→A 與 H→A 仍通（A 收好收滿）、任何幀都到不了 B → A 超前消化
    // （B 先 tick、投遞給 A、再 A tick → A 每輪都湊齊整幀，cf 一路推進）
    for (let r = 10; r < 13; r++) {
      B.node.tick(r === 10 ? ['rotateCW'] : []);
      deliverBtoA();
      A.inject({ f: r + 3, p: 'H', a: [] });
      A.node.tick(r === 10 ? ['left'] : []);
    }
    aPtr = A.sent.length; // A 死亡窗的幀在舊 host 上遺失，永不重送

    // A 超前（已消化 13..15）、B 卡 13；A 的 inbox 已沒有 B 缺的 13..15
    expect(A.node.confirmedFrame).toBeGreaterThan(B.node.confirmedFrame);
    expect(B.node.confirmedFrame).toBe(13);

    // 遷移補課：交換視野 + 以 baseCf=max(cf) 回填空幀 + 同一棄權幀
    const sA = A.node.exportSyncState();
    const sB = B.node.exportSyncState();
    const baseCf = Math.max(sA.cf, sB.cf);
    const forfeitF = Math.max(sA.horizon.H, sB.horizon.H) + 1;
    B.node.importMergedInputs(sA.inputs);
    B.node.fillEmptyInputsUpTo(baseCf);
    A.node.importMergedInputs(sB.inputs);
    A.node.fillEmptyInputsUpTo(baseCf);
    A.node.scheduleForfeit('H', forfeitF);
    B.node.scheduleForfeit('H', forfeitF);

    // 續行：雙向投遞恢復（新 host relay 新幀）
    for (let r = 0; r < 12; r++) {
      A.node.tick([]);
      B.node.tick([]);
      deliverAtoB();
      deliverBtoA();
    }

    // 兩端越過缺口、cf 相等、H 判敗墊底、全盤指紋與 replay 完全一致
    expect(B.node.confirmedFrame).toBeGreaterThan(baseCf);
    expect(A.node.confirmedFrame).toBe(B.node.confirmedFrame);
    expect(A.node.getMatch().getPlacement().get('H')).toBe(3);
    expect(B.node.getMatch().getPlacement().get('H')).toBe(3);
    expect(stateFingerprint(A.node)).toBe(stateFingerprint(B.node));
    expect(JSON.stringify(A.node.getReplay())).toBe(JSON.stringify(B.node.getReplay()));
  });

  it('重複 import 自己的 export 無害：cf 與全盤狀態不變、後續鎖步與對照組一致', () => {
    const playerIds = ['P0', 'P1', 'P2', 'P3'];
    const run = (withReimport: boolean): { fp: string; cf: number } => {
      const { nodes } = buildNodes(playerIds, 4242);
      for (let f = 0; f < 10; f++) {
        for (const node of nodes) node.tick(f % 3 === 0 ? ['softDrop'] : []);
      }
      if (withReimport) {
        const cfBefore = nodes[0].confirmedFrame;
        const fpBefore = stateFingerprint(nodes[0]);
        nodes[0].importMergedInputs(nodes[0].exportSyncState().inputs);
        nodes[0].importMergedInputs(nodes[0].exportSyncState().inputs);
        expect(nodes[0].confirmedFrame).toBe(cfBefore);
        expect(stateFingerprint(nodes[0])).toBe(fpBefore);
      }
      for (let f = 10; f < 30; f++) {
        for (const node of nodes) node.tick([]);
      }
      const fp = stateFingerprint(nodes[0]);
      for (const node of nodes) expect(stateFingerprint(node)).toBe(fp);
      return { fp, cf: nodes[0].confirmedFrame };
    };
    const a = run(true);
    const b = run(false);
    expect(a.fp).toBe(b.fp);
    expect(a.cf).toBe(b.cf);
  });

  it('importMergedInputs 壞輸入忽略：非陣列 / p 不在名單 / f 壞值 / a 壞形狀 → 不丟例外不污染；混入合法幀仍生效', () => {
    const { node } = makeManualNode(['A', 'B'], 'A', 9);
    node.tick(['hold']); // cf=3，缺 B@3 卡住
    expect(node.confirmedFrame).toBe(3);
    const fpBefore = stateFingerprint(node);

    expect(() => node.importMergedInputs(null as never)).not.toThrow();
    expect(() => node.importMergedInputs('junk' as never)).not.toThrow();
    expect(() =>
      node.importMergedInputs([
        null,
        42,
        { f: NaN, p: 'B', a: [] },
        { f: -1, p: 'B', a: [] },
        { f: Infinity, p: 'B', a: [] },
        { f: '3', p: 'B', a: [] },
        { f: 3, p: 'ZZ', a: [] }, // p 不在名單
        { f: 3, p: 'B', a: 'x' }, // a 非陣列
        { f: 3, p: 'B', a: ['fly'] }, // 非法 action
      ] as never),
    ).not.toThrow();

    node.tick([]);
    expect(node.confirmedFrame).toBe(3); // 壞幀全被忽略 → 仍缺 B@3
    expect(stateFingerprint(node)).toBe(fpBefore);
    expect(node.exportSyncState().horizon.B).toBe(2); // 垃圾沒寫進 inbox

    // 混入合法幀仍生效：B@3/B@4 補上後可推進
    node.importMergedInputs([
      { f: 3, p: 'B', a: ['right'] },
      null as never,
      { f: 4, p: 'B', a: [] },
    ]);
    node.tick([]);
    expect(node.confirmedFrame).toBeGreaterThan(3);
  });
});
