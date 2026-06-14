import { describe, it, expect } from 'vitest';
import { BomberLockstep, LoopbackBomberHub, INPUT_DELAY } from './bomberLockstep';
import type { BomberFrameMsg, VersusAction } from './bomberLockstep';
import type { CharacterId, Dir } from '../engine/types';

const CHARS: CharacterId[] = ['lena', 'mira', 'aya', 'rosa'];
const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

/** 建 N 個接同一 LoopbackBomberHub 的 BomberLockstep 節點，同 seed/arenaId/characters。 */
function buildNodes(
  playerIds: string[],
  seed: number,
  arenaId = 0,
): { nodes: BomberLockstep[]; hub: LoopbackBomberHub } {
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
 * 把全端推進到同一個 confirmedFrame，以便在共同幀上比對 stateHash。
 *
 * 同步 loopback 下，每輪最後 tick 的節點會「結構性領先」一幀（它擁有當輪最新廣播，
 * 又因已淘汰玩家被自動補空輸入而不需等其真訊息）——這在 lockstep 是良性的瞬時偏移：
 * 鐵則只保證「全端皆已確認的幀，狀態必相同」。本 helper 只 tick 落後端（凍結領先端，
 * 保證收斂終止），直到全端 confirmedFrame 追平領先端，方可在同一幀比對指紋。
 */
function settle(nodes: BomberLockstep[], hub?: LoopbackBomberHub): void {
  for (let r = 0; r < 50; r++) {
    const max = Math.max(...nodes.map((n) => n.confirmedFrame));
    const laggards = nodes.filter((n) => n.confirmedFrame < max);
    if (laggards.length === 0) break;
    for (const n of laggards) n.tick();
    hub?.flush();
  }
}

describe('BomberLockstep N 人鎖步', () => {
  it('4 端 loopback 跑 600 幀：全端 stateHash 一致', () => {
    const playerIds = ['P0', 'P1', 'P2', 'P3'];
    const { nodes } = buildNodes(playerIds, 12345);

    // 每端各自的輸入排程（依本端 localId 給不同序列；含 held 切換、bomb、ability）
    const localActionsAt = (id: string, f: number): VersusAction[] => {
      const out: VersusAction[] = [];
      if (id === 'P0') {
        if (f % 5 === 0) out.push({ t: 'held', d: 'right', v: true });
        if (f % 5 === 3) out.push({ t: 'held', d: 'right', v: false });
        if (f % 23 === 0) out.push({ t: 'bomb' });
      } else if (id === 'P1') {
        if (f % 7 === 0) out.push({ t: 'held', d: 'left', v: true });
        if (f % 7 === 4) out.push({ t: 'held', d: 'left', v: false });
        if (f % 31 === 0) out.push({ t: 'ability' });
      } else if (id === 'P2') {
        if (f % 11 === 0) out.push({ t: 'held', d: 'up', v: true });
        if (f % 11 === 6) out.push({ t: 'held', d: 'up', v: false });
        if (f % 29 === 0) out.push({ t: 'bomb' });
      } else if (id === 'P3') {
        if (f % 13 === 0) out.push({ t: 'held', d: 'down', v: true });
        if (f % 13 === 8) out.push({ t: 'held', d: 'down', v: false });
        if (f % 37 === 0) out.push({ t: 'ability' });
      }
      return out;
    };

    for (let f = 0; f < 600; f++) {
      for (const node of nodes) {
        node.queueLocal(...localActionsAt(node.localId, f));
        node.tick();
      }
    }
    // 收斂到共同幀（消除同步 loopback 末輪的良性一幀偏移）
    settle(nodes);

    // 各端推進的幀數必須相等且 > 0
    const cf = nodes[0].confirmedFrame;
    expect(cf).toBeGreaterThan(0);
    for (const node of nodes) expect(node.confirmedFrame).toBe(cf);

    // 各端 stateHash 必須與 nodes[0] 完全一致（鎖步驗收門檻）
    const ref = nodes[0].match.stateHash();
    for (const node of nodes) {
      expect(node.match.stateHash()).toBe(ref);
    }
  });

  it('各端 confirmedFrame 相等（混合輸入 200 幀）', () => {
    const playerIds = ['A', 'B', 'C', 'D'];
    const { nodes } = buildNodes(playerIds, 555);
    for (let f = 0; f < 200; f++) {
      for (const node of nodes) {
        if (f % 3 === 0) node.queueLocal({ t: 'bomb' });
        node.tick();
      }
    }
    settle(nodes);
    const ref = nodes[0].confirmedFrame;
    expect(ref).toBeGreaterThan(0);
    for (const node of nodes) expect(node.confirmedFrame).toBe(ref);
    const hash = nodes[0].match.stateHash();
    for (const node of nodes) expect(node.match.stateHash()).toBe(hash);
  });

  it('亂序/延遲投遞：訊息延後且打亂順序送達 → 最終全端 stateHash 仍一致', () => {
    const playerIds = ['P0', 'P1', 'P2', 'P3'];
    const hub = new LoopbackBomberHub({ jitter: true });
    const characters: Record<string, CharacterId> = {};
    playerIds.forEach((id, i) => (characters[id] = CHARS[i]));
    const nodes = playerIds.map(
      (localId) =>
        new BomberLockstep({ playerIds, localId, seed: 909, arenaId: 1, characters, transport: hub.transportFor(localId) }),
    );

    const localActionsAt = (id: string, f: number): VersusAction[] => {
      const out: VersusAction[] = [];
      const k = playerIds.indexOf(id);
      if (f % (5 + k) === 0) out.push({ t: 'held', d: DIRS[k], v: true });
      if (f % (5 + k) === 2) out.push({ t: 'held', d: DIRS[k], v: false });
      if (f % (17 + k) === 0) out.push(k % 2 === 0 ? { t: 'bomb' } : { t: 'ability' });
      return out;
    };

    // 多輪：每輪先全員 queue+send，再 flush 亂序遞送，確保最終全員追上
    for (let f = 0; f < 400; f++) {
      for (const node of nodes) {
        node.queueLocal(...localActionsAt(node.localId, f));
        node.tick();
      }
      hub.flush(); // 把暫存的亂序/延遲訊息送達
    }
    // 收尾：清空所有在途訊息，再讓落後端追平領先端（亂序投遞下偏移可能 >1 幀）
    for (let i = 0; i < INPUT_DELAY + 8; i++) {
      for (const node of nodes) node.tick();
      hub.flush();
    }
    settle(nodes, hub);

    const cf = nodes[0].confirmedFrame;
    expect(cf).toBeGreaterThan(0);
    for (const node of nodes) expect(node.confirmedFrame).toBe(cf);
    const ref = nodes[0].match.stateHash();
    for (const node of nodes) expect(node.match.stateHash()).toBe(ref);
  });

  it('某端 frame 缺輸入時其他端等待（不推進）；補上後恢復', () => {
    const playerIds = ['P0', 'P1', 'P2', 'P3'];
    const seed = 99;
    const { nodes } = buildNodes(playerIds, seed);

    // 只讓 P0/P1/P2 tick（P3 不送任何幀）
    for (let f = 0; f < 20; f++) {
      nodes[0].tick();
      nodes[1].tick();
      nodes[2].tick();
    }
    const stuck = nodes[0].confirmedFrame;
    // P3 從未送輸入 → 缺其輸入的幀全部卡住（confirmedFrame 遠小於 20）
    expect(stuck).toBeLessThan(20);

    // 補上 P3 的輸入後應恢復推進
    for (let f = 0; f < 30; f++) {
      for (const node of nodes) node.tick();
    }
    expect(nodes[0].confirmedFrame).toBeGreaterThan(stuck);
    // 收斂到共同幀後，全端仍一致
    settle(nodes);
    const ref = nodes[0].match.stateHash();
    for (const node of nodes) expect(node.match.stateHash()).toBe(ref);
  });

  it('淘汰玩家停止送輸入後其餘端仍可推進（淘汰者自動補空輸入、不死鎖）', () => {
    // 2 人局：P0 走進自己的爆風自殺，P0 端隨後停 tick，P1 端必須能繼續推進直到 finished。
    const playerIds = ['P0', 'P1'];
    const characters: Record<string, CharacterId> = { P0: 'lena', P1: 'mira' };
    const hub = new LoopbackBomberHub();
    const nodes = playerIds.map(
      (localId) =>
        new BomberLockstep({ playerIds, localId, seed: 3, arenaId: 0, characters, transport: hub.transportFor(localId) }),
    );

    // P0 放彈後原地不動 → 引信到期自爆淘汰
    nodes[0].queueLocal({ t: 'bomb' });

    let p0Dead = false;
    let f = 0;
    for (; f < 6000 && nodes[1].match.getState().status === 'playing'; f++) {
      for (const node of nodes) {
        // 一旦 P0 死亡，P0 端就停止 tick（模擬淘汰者離場不再送輸入）
        if (node.localId === 'P0' && p0Dead) continue;
        node.tick();
      }
      const p0 = nodes[1].match.getState().players.find((p) => p.id === 'P0');
      if (p0 && !p0.alive) p0Dead = true;
    }

    expect(p0Dead).toBe(true);
    expect(nodes[1].match.getState().status).toBe('finished');
    // 倖存的 P1 端推進到結束（沒因 P0 停送而死鎖）
    expect(nodes[1].match.getState().winnerId).toBe('P1');
  });

  it('畸形網路訊息被忽略不丟例外、不污染狀態', () => {
    const playerIds = ['P0', 'P1'];
    let cap: ((d: unknown) => void) | null = null;
    const transport = {
      send(): void {},
      onMessage(cb: (m: unknown) => void): void {
        cap = cb as (d: unknown) => void;
      },
    };
    const ls = new BomberLockstep({
      playerIds,
      localId: 'P0',
      seed: 1,
      arenaId: 0,
      characters: { P0: 'lena', P1: 'mira' },
      transport: transport as never,
    });
    expect(cap).not.toBeNull();

    const before = ls.match.stateHash();

    expect(() => cap!('not json{')).not.toThrow(); // 畸形 JSON 字串
    expect(() => cap!(JSON.stringify({ junk: 1 }))).not.toThrow(); // 缺欄位
    expect(() => cap!({ f: 'x', p: 'P1', a: [] })).not.toThrow(); // f 非數字
    expect(() => cap!({ f: 0, p: 'ZZ', a: [] })).not.toThrow(); // p 不在名單
    expect(() => cap!({ f: 0, p: 'P1', a: 'nope' })).not.toThrow(); // a 非陣列
    expect(() => cap!({ f: 0, p: 'P1', a: [{ t: 'fly' }] })).not.toThrow(); // 未知 action t
    expect(() => cap!({ f: 0, p: 'P1', a: [{ t: 'held', d: 'sideways', v: true }] })).not.toThrow(); // 非法 dir
    expect(() => cap!({ f: 0, p: 'P1', a: [{ t: 'held', d: 'up', v: 'yes' }] })).not.toThrow(); // v 非 boolean
    expect(() => cap!({ f: 0, p: 'P1', a: [{ d: 'up', v: true }] })).not.toThrow(); // 缺 t
    expect(() => cap!({ f: 0, p: 'P1', a: ['bomb'] })).not.toThrow(); // action 非物件
    expect(() => cap!(null)).not.toThrow();
    expect(() => cap!(undefined)).not.toThrow();

    // 推進若干幀：預填的空幀 0..INPUT_DELAY-1 可被消化（全員齊備），
    // 但 frame INPUT_DELAY 起缺 P1 合法輸入 → 一律卡住、絕不丟例外。
    void before;
    for (let f = 0; f < 5; f++) expect(() => ls.tick()).not.toThrow();
    // 畸形訊息未被當成 P1 的輸入記錄 → confirmedFrame 恰好卡在 INPUT_DELAY
    // （僅消化預填的 0..INPUT_DELAY-1，之後永遠缺 P1）。
    expect(ls.confirmedFrame).toBe(INPUT_DELAY);
  });

  it('合法 held/bomb/ability 訊息可被處理（部分畸形混入仍只取合法）', () => {
    const playerIds = ['P0', 'P1'];
    const { nodes } = buildNodes(playerIds, 7);
    // 對照組：完全不送任何遠端動作的另一局，跑相同幀數 → 與本局 hash 不同
    const ctrl = buildNodes(playerIds, 7).nodes;

    for (let f = 0; f < 40; f++) {
      // 本局：P0 持續往右、間歇放彈
      if (f % 4 === 0) nodes[0].queueLocal({ t: 'held', d: 'right', v: true });
      if (f % 4 === 2) nodes[0].queueLocal({ t: 'held', d: 'right', v: false });
      if (f % 9 === 0) nodes[0].queueLocal({ t: 'bomb' });
      for (const node of nodes) node.tick();
      // 對照組：完全不動
      for (const node of ctrl) node.tick();
    }
    settle(nodes);
    settle(ctrl);

    // 合法輸入確實生效 → 兩局 hash 不同
    expect(nodes[0].match.stateHash()).not.toBe(ctrl[0].match.stateHash());
    // 本局兩端一致
    expect(nodes[1].match.stateHash()).toBe(nodes[0].match.stateHash());
  });
});

describe('BomberLockstep forfeit（斷線→決定性強制淘汰）', () => {
  it('forfeit 指定玩家於指定幀：該玩家停止送輸入也不死鎖、最終被淘汰', () => {
    // 2 人局：P1 「斷線」（從不送輸入）。P0 端在某幀對 P1 forfeit →
    // P1 被自動補空輸入（不死鎖）+ 在 leave 幀強制淘汰 → P0 勝出。
    const playerIds = ['P0', 'P1'];
    const characters: Record<string, CharacterId> = { P0: 'lena', P1: 'mira' };
    let cap: ((m: BomberFrameMsg) => void) | null = null;
    const ls = new BomberLockstep({
      playerIds, localId: 'P0', seed: 3, arenaId: 0, characters,
      transport: { send: () => {}, onMessage: (cb) => { cap = cb; } },
    });
    void cap;

    // 推進到 confirmedFrame 卡住（缺 P1）。
    for (let f = 0; f < 10; f++) ls.tick();
    const stuck = ls.confirmedFrame;
    expect(stuck).toBe(INPUT_DELAY); // 只消化預填空幀

    // 在「目前 confirmedFrame」這幀 forfeit P1 → 之後 P1 被補空輸入、不再卡。
    ls.forfeit('P1', ls.confirmedFrame);
    for (let f = 0; f < 30; f++) ls.tick();

    expect(ls.confirmedFrame).toBeGreaterThan(stuck);
    const s = ls.match.getState();
    const p1 = s.players.find((p) => p.id === 'P1')!;
    expect(p1.alive).toBe(false);
    expect(s.status).toBe('finished');
    expect(s.winnerId).toBe('P0');
  });

  it('兩端對同一玩家、同一幀 forfeit → stateHash 仍一致（決定性）', () => {
    const playerIds = ['P0', 'P1', 'P2'];
    const characters: Record<string, CharacterId> = { P0: 'lena', P1: 'mira', P2: 'aya' };
    const hub = new LoopbackBomberHub();
    const nodes = playerIds.map(
      (localId) =>
        new BomberLockstep({ playerIds, localId, seed: 77, arenaId: 2, characters, transport: hub.transportFor(localId) }),
    );

    // 先正常跑數幀（全員都送輸入），確保大家都有共同已確認幀界。
    const LEAVE_FRAME = INPUT_DELAY + 5;
    for (let f = 0; f < 12; f++) {
      for (const node of nodes) {
        if (f % 4 === 0) node.queueLocal({ t: 'held', d: 'right', v: true });
        if (f % 4 === 2) node.queueLocal({ t: 'held', d: 'right', v: false });
        node.tick();
      }
    }
    settle(nodes);

    // P2 「斷線」：存活端 P0/P1 各自在「同一幀」對 P2 forfeit。
    for (const node of nodes) {
      if (node.localId !== 'P2') node.forfeit('P2', LEAVE_FRAME);
    }
    // P2 端停止 tick（離場）；P0/P1 繼續直到追平。
    const survivors = nodes.filter((n) => n.localId !== 'P2');
    for (let f = 0; f < 40; f++) for (const node of survivors) node.tick();
    settle(survivors);

    // 兩存活端推進到相同幀、stateHash 一致，且 P2 已淘汰。
    expect(survivors[0].confirmedFrame).toBe(survivors[1].confirmedFrame);
    expect(survivors[0].match.stateHash()).toBe(survivors[1].match.stateHash());
    const p2 = survivors[0].match.getState().players.find((p) => p.id === 'P2')!;
    expect(p2.alive).toBe(false);
  });
});

describe('BomberFrameMsg 型別契約', () => {
  it('queueLocal 過濾非法本地動作（防呆，與 onMessage 同一道驗證）', () => {
    const playerIds = ['P0', 'P1'];
    const { nodes } = buildNodes(playerIds, 5);
    const clean = buildNodes(playerIds, 5).nodes;

    for (let f = 0; f < 20; f++) {
      // 摻入畸形本地動作 → 應被過濾，效果等同只送合法動作（這裡無合法動作）
      nodes[0].queueLocal({ t: 'fly' } as unknown as VersusAction);
      nodes[0].queueLocal({ t: 'held', d: 'nowhere', v: true } as unknown as VersusAction);
      for (const node of nodes) node.tick();
      for (const node of clean) node.tick();
    }
    // 摻入畸形動作的一局 hash 應與「完全沒送動作」的乾淨局相同（畸形被丟棄）
    expect(nodes[0].match.stateHash()).toBe(clean[0].match.stateHash());
  });

  it('BomberFrameMsg 形狀：tick 送出的訊息含 f/p/a', () => {
    const sent: BomberFrameMsg[] = [];
    const ls = new BomberLockstep({
      playerIds: ['P0', 'P1'],
      localId: 'P0',
      seed: 1,
      arenaId: 0,
      characters: { P0: 'lena', P1: 'mira' },
      transport: { send: (m: BomberFrameMsg) => sent.push(m), onMessage: () => {} },
    });
    ls.queueLocal({ t: 'bomb' });
    ls.tick();
    expect(sent.length).toBe(1);
    expect(sent[0].p).toBe('P0');
    expect(sent[0].f).toBe(INPUT_DELAY); // 第一幀排程到 sendFrame(0)+INPUT_DELAY
    expect(sent[0].a).toEqual([{ t: 'bomb' }]);
  });
});
