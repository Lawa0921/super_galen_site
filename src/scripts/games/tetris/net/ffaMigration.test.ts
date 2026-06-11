import { describe, it, expect } from 'vitest';
import {
  electHost,
  mergeSync,
  hostForfeitFrame,
  MigratingTransport,
  runMigration,
  type SyncState,
  type MigratableInner,
  type MigGuestPeer,
  type MigHostPeer,
  type MigChannel,
  type RunMigrationDeps,
} from './ffaMigration';
import { FfaLockstep, type FfaFrameMsg, type FfaSyncState } from './ffaLockstep';
import { FfaHubTransport, FfaSpokeTransport } from './ffaTransport';
import { isValidSlot } from './signalClient';
import type { InputAction } from '../engine/game';

/** 測試用 mock inner transport：記錄送出、可手動觸發收訊。 */
function mockInner(): MigratableInner & {
  sentFrames: FfaFrameMsg[];
  sentControls: Array<Record<string, unknown>>;
  emit(msg: FfaFrameMsg): void;
  emitControl(msg: Record<string, unknown>): void;
} {
  let msgCb: ((msg: FfaFrameMsg) => void) | null = null;
  let ctrlCb: ((msg: Record<string, unknown>) => void) | null = null;
  return {
    sentFrames: [] as FfaFrameMsg[],
    sentControls: [] as Array<Record<string, unknown>>,
    send(msg: FfaFrameMsg): void {
      this.sentFrames.push(msg);
    },
    sendControl(msg: Record<string, unknown>): void {
      this.sentControls.push(msg);
    },
    onMessage(cb: (msg: FfaFrameMsg) => void): void {
      msgCb = cb;
    },
    onControl(cb: (msg: Record<string, unknown>) => void): void {
      ctrlCb = cb;
    },
    emit(msg: FfaFrameMsg): void {
      msgCb?.(msg);
    },
    emitControl(msg: Record<string, unknown>): void {
      ctrlCb?.(msg);
    },
  };
}

const frame = (f: number, p: string, a: InputAction[] = []): FfaFrameMsg => ({ f, p, a });

describe('electHost（新 host 選舉純函式）', () => {
  const players = ['h', 'g1', 'g2', 'g3'];

  it('基本：排除 host 後原始 index 最低的存活 guest 為候選；自己非候選 → join', () => {
    const r = electHost(players, 'h', [], 'g2');
    expect(r).toEqual({ role: 'join', candidateId: 'g1' });
  });

  it('候選已淘汰：g1 在 placedIds → 跳到下一個 g2', () => {
    const r = electHost(players, 'h', ['g1'], 'g3');
    expect(r).toEqual({ role: 'join', candidateId: 'g2' });
  });

  it('自己是候選 → role host', () => {
    const r = electHost(players, 'h', [], 'g1');
    expect(r).toEqual({ role: 'host', candidateId: 'g1' });
  });

  it('其他 guest 全淘汰、只剩自己 → 自己是候選 host', () => {
    const r = electHost(players, 'h', ['g1', 'g2'], 'g3');
    expect(r).toEqual({ role: 'host', candidateId: 'g3' });
  });

  it('全淘汰邊界：所有 guest 都在 placedIds → 無候選（candidateId 空字串、join）', () => {
    const r = electHost(players, 'h', ['g1', 'g2', 'g3'], 'g3');
    expect(r).toEqual({ role: 'join', candidateId: '' });
  });
});

describe('mergeSync（輸入視野合併純函式）', () => {
  it('並集：兩端不相交的 inputs 全數保留', () => {
    const a: SyncState = {
      cf: 10,
      horizon: { h: 12, g1: 11 },
      inputs: [{ f: 11, p: 'g1', a: ['left'] }],
    };
    const b: SyncState = {
      cf: 9,
      horizon: { h: 10, g2: 13 },
      inputs: [{ f: 12, p: 'g2', a: ['right'] }],
    };
    const m = mergeSync([a, b]);
    expect(m.inputs).toHaveLength(2);
    expect(m.inputs).toContainEqual({ f: 11, p: 'g1', a: ['left'] });
    expect(m.inputs).toContainEqual({ f: 12, p: 'g2', a: ['right'] });
  });

  it('冪等去重：同 (f,p) 鍵在多個 state 出現 → 首見保留', () => {
    const a: SyncState = {
      cf: 0,
      horizon: {},
      inputs: [{ f: 5, p: 'g1', a: ['hardDrop'] }],
    };
    const b: SyncState = {
      cf: 0,
      horizon: {},
      inputs: [{ f: 5, p: 'g1', a: ['left'] }], // 理論上不會不同，但首見必須保留
    };
    const m = mergeSync([a, b]);
    expect(m.inputs).toEqual([{ f: 5, p: 'g1', a: ['hardDrop'] }]);
  });

  it('horizon：每玩家取所有 state 的最大值', () => {
    const a: SyncState = { cf: 0, horizon: { h: 10, g1: 8 }, inputs: [] };
    const b: SyncState = { cf: 0, horizon: { h: 7, g1: 9, g2: 4 }, inputs: [] };
    const m = mergeSync([a, b]);
    expect(m.horizon).toEqual({ h: 10, g1: 9, g2: 4 });
  });

  it('冪等：同一組 state 重複合併結果相同；空輸入 → 空結果', () => {
    const a: SyncState = {
      cf: 3,
      horizon: { g1: 6 },
      inputs: [{ f: 6, p: 'g1', a: [] }],
    };
    const once = mergeSync([a]);
    const twice = mergeSync([a, a]);
    expect(twice).toEqual(once);
    expect(mergeSync([])).toEqual({ inputs: [], horizon: {} });
  });
});

describe('hostForfeitFrame（舊 host 判敗幀）', () => {
  it('一般情況：max horizon[host]+1（必可達停滯點，非 confirmedFrame+1）', () => {
    expect(hostForfeitFrame({ h: 42, g1: 40 }, 'h', 3)).toBe(43);
  });

  it('向下夾 INPUT_DELAY：host horizon 過低或缺席 → 回 inputDelay', () => {
    expect(hostForfeitFrame({ h: 1 }, 'h', 3)).toBe(3); // 1+1=2 < 3 → 夾到 3
    expect(hostForfeitFrame({}, 'h', 3)).toBe(3); // 從未送幀 → INPUT_DELAY
  });
});

describe('MigratingTransport（傳輸層熱插拔 facade）', () => {
  it('委派：send/sendControl 走 inner；inner 來訊（幀+控制）到上層回呼', () => {
    const inner = mockInner();
    const mt = new MigratingTransport(inner);
    const got: FfaFrameMsg[] = [];
    const gotCtrl: Array<Record<string, unknown>> = [];
    mt.onMessage((m) => got.push(m));
    mt.onControl((m) => gotCtrl.push(m));

    mt.send(frame(1, 'g1', ['left']));
    mt.sendControl({ t: 'ffa-mig-sync', gen: 1 });
    expect(inner.sentFrames).toEqual([frame(1, 'g1', ['left'])]);
    expect(inner.sentControls).toEqual([{ t: 'ffa-mig-sync', gen: 1 }]);

    inner.emit(frame(2, 'h'));
    inner.emitControl({ t: 'ffa-forfeit', p: 'g2' });
    expect(got).toEqual([frame(2, 'h')]);
    expect(gotCtrl).toEqual([{ t: 'ffa-forfeit', p: 'g2' }]);
  });

  it('緩衝：上層回呼註冊前 inner 來訊 → 註冊時依序 flush、不漏不重', () => {
    const inner = mockInner();
    const mt = new MigratingTransport(inner);
    inner.emit(frame(0, 'h'));
    inner.emit(frame(1, 'h'));
    inner.emitControl({ t: 'ffa-mig-state', gen: 1 });

    const got: FfaFrameMsg[] = [];
    const gotCtrl: Array<Record<string, unknown>> = [];
    mt.onMessage((m) => got.push(m));
    mt.onControl((m) => gotCtrl.push(m));
    expect(got).toEqual([frame(0, 'h'), frame(1, 'h')]); // 依序 flush
    expect(gotCtrl).toEqual([{ t: 'ffa-mig-state', gen: 1 }]);

    // flush 後不重：再來訊只多一筆
    inner.emit(frame(2, 'h'));
    expect(got).toEqual([frame(0, 'h'), frame(1, 'h'), frame(2, 'h')]);
  });

  it('swap：前後雙向訊息不漏不重 —— swap 後 send 走新 inner、新 inner 來訊到同一回呼、舊 inner 來訊丟棄', () => {
    const inner1 = mockInner();
    const inner2 = mockInner();
    const mt = new MigratingTransport(inner1);
    const got: FfaFrameMsg[] = [];
    const gotCtrl: Array<Record<string, unknown>> = [];
    mt.onMessage((m) => got.push(m));
    mt.onControl((m) => gotCtrl.push(m));

    // swap 前：走 inner1
    mt.send(frame(1, 'g1'));
    inner1.emit(frame(1, 'h'));
    expect(inner1.sentFrames).toEqual([frame(1, 'g1')]);
    expect(got).toEqual([frame(1, 'h')]);

    mt.swap(inner2);

    // swap 後：送出走 inner2，inner1 不再收到
    mt.send(frame(2, 'g1'));
    mt.sendControl({ t: 'ffa-mig-sync', gen: 1 });
    expect(inner2.sentFrames).toEqual([frame(2, 'g1')]);
    expect(inner2.sentControls).toEqual([{ t: 'ffa-mig-sync', gen: 1 }]);
    expect(inner1.sentFrames).toEqual([frame(1, 'g1')]); // 不重送舊 inner

    // 新 inner 來訊（幀+控制）到「同一」上層回呼，不需重新註冊
    inner2.emit(frame(2, 'newhost'));
    inner2.emitControl({ t: 'ffa-leave', p: 'g3' });
    expect(got).toEqual([frame(1, 'h'), frame(2, 'newhost')]);
    expect(gotCtrl).toEqual([{ t: 'ffa-leave', p: 'g3' }]);

    // 舊 inner（死掉的 host 通道）swap 後殘留來訊 → 丟棄，不重不漏
    inner1.emit(frame(3, 'h'));
    inner1.emitControl({ t: 'ffa-stale' });
    expect(got).toEqual([frame(1, 'h'), frame(2, 'newhost')]);
    expect(gotCtrl).toEqual([{ t: 'ffa-leave', p: 'g3' }]);
  });

  it('swap 期間緩衝：上層尚未註冊回呼時 swap，新舊 inner 的既收訊息依序 flush 不漏', () => {
    const inner1 = mockInner();
    const inner2 = mockInner();
    const mt = new MigratingTransport(inner1);

    inner1.emit(frame(0, 'h')); // swap 前、註冊前收到 → 緩衝
    mt.swap(inner2);
    inner2.emit(frame(1, 'newhost')); // swap 後、註冊前收到 → 緩衝
    inner1.emit(frame(9, 'h')); // 舊 inner swap 後來訊 → 丟棄

    const got: FfaFrameMsg[] = [];
    mt.onMessage((m) => got.push(m));
    expect(got).toEqual([frame(0, 'h'), frame(1, 'newhost')]); // 不漏不重、保序
  });
});

// ═════════════════════════════════════════════════════════════════════════
// M4：runMigration 遷移協調器（mock-net：記憶體 signal store + 直連 mock RTC）
// ═════════════════════════════════════════════════════════════════════════

/** 記憶體 mock signal store；putSlot/getSlot 都以 isValidSlot 驗證（抓錯誤的槽位命名）。 */
function makeMigSignal() {
  const store = new Map<string, string>();
  return {
    store,
    async putSlot(room: string, slot: string, data: string): Promise<void> {
      if (!isValidSlot(slot)) throw new Error(`invalid slot: ${slot}`);
      store.set(`${room}:${slot}`, data);
    },
    async getSlot(room: string, slot: string): Promise<string | null> {
      if (!isValidSlot(slot)) throw new Error(`invalid slot: ${slot}`);
      return store.get(`${room}:${slot}`) ?? null;
    },
  };
}

/** 雙向 buffered loopback channel pair（onmessage 設定前緩衝、設定當下 flush；可切斷）。 */
function bufferedPair() {
  let blocked = false;
  interface Inbox { deliver(raw: string): void }
  function makeEnd(getPeer: () => Inbox): MigChannel & Inbox {
    let cb: ((raw: string) => void) | null = null;
    const queue: string[] = [];
    return {
      open: true,
      onclose: null,
      get onmessage() { return cb; },
      set onmessage(fn: ((raw: string) => void) | null) {
        cb = fn;
        if (fn) while (queue.length) fn(queue.shift()!);
      },
      send(raw: string) {
        if (blocked) return;
        getPeer().deliver(raw);
      },
      deliver(raw: string) {
        if (cb) cb(raw);
        else queue.push(raw);
      },
    };
  }
  const a: MigChannel & Inbox = makeEnd(() => b);
  const b: MigChannel & Inbox = makeEnd(() => a);
  return { a, b, block: () => { blocked = true; } };
}

/** mock RTC：guest createOffer 回 token、host createAnswer 以 token 從 registry 取直連 pair。 */
function makeMockRtc() {
  const registry = new Map<string, MigChannel>();
  let seq = 0;
  const guestPeer = (): MigGuestPeer => {
    const { a, b } = bufferedPair();
    const token = `OFFER-${seq++}`;
    registry.set(token, b);
    return {
      createOffer: async () => token,
      acceptAnswer: async (_ans: string) => {},
      waitOpen: async () => {},
      channel: a,
    };
  };
  const hostPeer = (): MigHostPeer => {
    let ch: MigChannel | null = null;
    return {
      createAnswer: async (offer: string) => {
        ch = registry.get(offer) ?? null;
        if (!ch) throw new Error(`unknown offer: ${offer}`);
        return `ANS-${offer}`;
      },
      waitOpen: async () => {},
      get channel() { return ch!; },
    };
  };
  return { guestPeer, hostPeer, registry };
}

/** mock MigLockstep：固定 exportSyncState、記錄 import/scheduleForfeit。 */
function mockMigLockstep(state: FfaSyncState) {
  const scheduled: Array<{ p: string; f: number }> = [];
  const imported: SyncState['inputs'][] = [];
  return {
    scheduled,
    imported,
    exportSyncState: () => state,
    importMergedInputs: (inputs: SyncState['inputs']) => { imported.push(inputs); },
    scheduleForfeit: (p: string, f: number) => { scheduled.push({ p, f }); },
  };
}

/** 共用 deps 工廠（測試各自覆寫差異欄位）。 */
function migDeps(over: Partial<RunMigrationDeps> & Pick<RunMigrationDeps, 'selfId' | 'lockstep' | 'transport'>): RunMigrationDeps {
  return {
    signal: makeMigSignal(),
    room: 'R',
    gen: 1,
    playerIds: ['h', 'g1', 'g2'],
    hostId: 'h',
    placedIds: [],
    hostPeerFactory: makeMockRtc().hostPeer,
    guestPeerFactory: makeMockRtc().guestPeer,
    electionGraceMs: 0,
    pollIntervalMs: 1,
    timeoutMs: 4_000,
    ...over,
  };
}

describe('runMigration（遷移協調器，mock-net）', () => {
  it('完整遷移：3 端真鎖步、視野不等 → G1 成 host、G2 join → 兩端補課一致、續行到 victory、H placement=3、replay 一致', async () => {
    const playerIds = ['h', 'g1', 'g2'];
    const seed = 4242;

    // 原始星狀拓樸：H 為 hub，G1/G2 各持 spoke；G1/G2 的 lockstep 透過 MigratingTransport facade。
    const p1 = bufferedPair();
    const p2 = bufferedPair();
    const hub0 = new FfaHubTransport([p1.a, p2.a]);
    const facade1 = new MigratingTransport(new FfaSpokeTransport(p1.b) as unknown as MigratableInner);
    const facade2 = new MigratingTransport(new FfaSpokeTransport(p2.b) as unknown as MigratableInner);

    const hLs = new FfaLockstep({ playerIds, localId: 'h', seed, transport: hub0 });
    const g1Ls = new FfaLockstep({ playerIds, localId: 'g1', seed, transport: facade1 });
    const g2Ls = new FfaLockstep({ playerIds, localId: 'g2', seed, transport: facade2 });

    // 正常跑 40 幀
    for (let f = 0; f < 40; f++) { hLs.tick([]); g1Ls.tick([]); g2Ls.tick([]); }

    // 模擬 H 死前最後幾幀只送達 G1：切斷 H↔G2，H/G1 再各 tick 3 次 → G2 視野落後
    p2.block();
    for (let f = 0; f < 3; f++) { hLs.tick([]); g1Ls.tick([]); }
    expect(g1Ls.exportSyncState().horizon.h).toBeGreaterThan(g2Ls.exportSyncState().horizon.h);

    // H 死亡 → G1/G2 各自跑 runMigration（共用 mock signal/RTC）
    const signal = makeMigSignal();
    const rtc = makeMockRtc();
    const common = {
      signal, room: 'R', gen: 1, playerIds, hostId: 'h',
      hostPeerFactory: rtc.hostPeer, guestPeerFactory: rtc.guestPeer,
      electionGraceMs: 0, pollIntervalMs: 1, timeoutMs: 4_000,
    };
    const [r1, r2] = await Promise.all([
      runMigration({ ...common, selfId: 'g1', placedIds: [...g1Ls.getMatch().getPlacement().keys()], lockstep: g1Ls, transport: facade1 }),
      runMigration({ ...common, selfId: 'g2', placedIds: [...g2Ls.getMatch().getPlacement().keys()], lockstep: g2Ls, transport: facade2 }),
    ]);
    expect(r1.role).toBe('host');
    expect(r2.role).toBe('join');
    // 世代化槽位被使用（g2 原始 index=2 → 槽位 index 1；g1 beacon → 槽位 index 0）
    expect(signal.store.get('R:mig1-guest-1-offer')).toBeTruthy();
    expect(signal.store.get('R:mig1-host-ack-1')).toBeTruthy();
    expect(signal.store.get('R:mig1-guest-0-offer')).toBeTruthy();

    // 續行：G2 狂 hardDrop 先死 → 分出勝負
    let f = 0;
    for (; f < 20_000 && g1Ls.getMatch().phase === 'playing'; f++) {
      g1Ls.tick([]);
      g2Ls.tick(f % 2 === 0 ? ['hardDrop'] : []);
    }
    expect(g1Ls.getMatch().phase).toBe('result');
    expect(g2Ls.getMatch().phase).toBe('result');

    // 舊 host 判敗：placement = 3（最後一名）
    expect(g1Ls.getMatch().getPlacement().get('h')).toBe(3);
    expect(g2Ls.getMatch().getPlacement().get('h')).toBe(3);
    // 兩端狀態一致：standings + 完整 replay（events/forfeits/frameCount）JSON 相等
    expect(g1Ls.getStandings()).toEqual(g2Ls.getStandings());
    expect(g1Ls.getStandings()[0]).toBe('g1');
    expect(JSON.stringify(g1Ls.getReplay())).toBe(JSON.stringify(g2Ls.getReplay()));
    expect(g1Ls.getReplay().forfeits.map((x) => x.p)).toEqual(['h']);
  });

  it('雙候選讓位：G1/G2 都自判候選（不同 placedIds 視野）→ G2 在 answer 前發現 G1 offer → 讓位 join、收斂單一 host', async () => {
    const signal = makeMigSignal();
    const rtc = makeMockRtc();
    const ls1 = mockMigLockstep({ cf: 10, horizon: { h: 12, g1: 12, g2: 12 }, inputs: [] });
    const ls2 = mockMigLockstep({ cf: 10, horizon: { h: 12, g1: 12, g2: 12 }, inputs: [] });
    const f1 = new MigratingTransport(mockInner());
    const f2 = new MigratingTransport(mockInner());
    const common = {
      signal, hostPeerFactory: rtc.hostPeer, guestPeerFactory: rtc.guestPeer,
      electionGraceMs: 40, pollIntervalMs: 1, timeoutMs: 4_000,
    };
    const [r1, r2] = await Promise.all([
      // G1 視野：無人淘汰 → 候選 g1（自己）
      runMigration(migDeps({ ...common, selfId: 'g1', placedIds: [], lockstep: ls1, transport: f1 })),
      // G2 視野：g1 剛淘汰（分歧）→ 候選 g2（自己）→ 讓位
      runMigration(migDeps({ ...common, selfId: 'g2', placedIds: ['g1'], lockstep: ls2, transport: f2 })),
    ]);
    expect(r1.role).toBe('host');
    expect(r2.role).toBe('join');
    if (r2.role === 'join') expect(r2.hostId).toBe('g1');
    // 兩端對舊 host 排程同一棄權幀
    expect(ls1.scheduled).toEqual(ls2.scheduled);
    expect(ls1.scheduled[0].p).toBe('h');
  });

  it('逾時：join 等不到 ack / host 等不到 offer → MIGRATION_TIMEOUT 後 throw（netMain 據此降級）', async () => {
    // join：候選 g1 永不出現 → 等 ack 逾時
    await expect(runMigration(migDeps({
      selfId: 'g2',
      lockstep: mockMigLockstep({ cf: 0, horizon: {}, inputs: [] }),
      transport: new MigratingTransport(mockInner()),
      timeoutMs: 80, pollIntervalMs: 5,
    }))).rejects.toThrow(/timeout/i);

    // host：倖存者 g2 永不寫 offer → 收 offer 逾時
    await expect(runMigration(migDeps({
      selfId: 'g1',
      lockstep: mockMigLockstep({ cf: 0, horizon: {}, inputs: [] }),
      transport: new MigratingTransport(mockInner()),
      timeoutMs: 80, pollIntervalMs: 5,
    }))).rejects.toThrow(/timeout/i);
  });

  it('hostForfeitF 用 merge 後 horizon（兩端視野取 max，非任一端單獨視野）；合併輸入兩端都灌入', async () => {
    const signal = makeMigSignal();
    const rtc = makeMockRtc();
    // g1 視野：h 到 40；g2 視野：h 到 45 → merged horizon.h = 45 → F = 46
    const ls1 = mockMigLockstep({
      cf: 38, horizon: { h: 40, g1: 43, g2: 39 },
      inputs: [{ f: 41, p: 'g1', a: ['left'] }],
    });
    const ls2 = mockMigLockstep({
      cf: 36, horizon: { h: 45, g1: 41, g2: 42 },
      inputs: [{ f: 44, p: 'h', a: ['right'] }],
    });
    const f1 = new MigratingTransport(mockInner());
    const f2 = new MigratingTransport(mockInner());
    const common = {
      signal, hostPeerFactory: rtc.hostPeer, guestPeerFactory: rtc.guestPeer,
      electionGraceMs: 0, pollIntervalMs: 1, timeoutMs: 4_000,
    };
    const [r1, r2] = await Promise.all([
      runMigration(migDeps({ ...common, selfId: 'g1', lockstep: ls1, transport: f1 })),
      runMigration(migDeps({ ...common, selfId: 'g2', lockstep: ls2, transport: f2 })),
    ]);
    expect(r1.role).toBe('host');
    expect(r2.role).toBe('join');
    expect(ls1.scheduled).toEqual([{ p: 'h', f: 46 }]);
    expect(ls2.scheduled).toEqual([{ p: 'h', f: 46 }]);
    // 合併輸入＝兩端 inputs 並集，兩端都收到
    for (const ls of [ls1, ls2]) {
      expect(ls.imported).toHaveLength(1);
      expect(ls.imported[0]).toContainEqual({ f: 41, p: 'g1', a: ['left'] });
      expect(ls.imported[0]).toContainEqual({ f: 44, p: 'h', a: ['right'] });
    }
  });

  it('gen2：遷移成功後新 host 再死 → 以 gen=2 槽位再遷移成功', async () => {
    const playerIds = ['h', 'g1', 'g2', 'g3'];
    const signal = makeMigSignal();
    const rtc = makeMockRtc();
    const state = (): FfaSyncState => ({ cf: 5, horizon: { h: 7, g1: 7, g2: 7, g3: 7 }, inputs: [] });
    const ls = [mockMigLockstep(state()), mockMigLockstep(state()), mockMigLockstep(state())];
    const fa = [
      new MigratingTransport(mockInner()),
      new MigratingTransport(mockInner()),
      new MigratingTransport(mockInner()),
    ];
    const common = {
      signal, playerIds, hostPeerFactory: rtc.hostPeer, guestPeerFactory: rtc.guestPeer,
      electionGraceMs: 0, pollIntervalMs: 1, timeoutMs: 4_000,
    };
    // gen1：h 死 → g1 host、g2/g3 join
    const gen1 = await Promise.all([
      runMigration(migDeps({ ...common, gen: 1, hostId: 'h', selfId: 'g1', lockstep: ls[0], transport: fa[0] })),
      runMigration(migDeps({ ...common, gen: 1, hostId: 'h', selfId: 'g2', lockstep: ls[1], transport: fa[1] })),
      runMigration(migDeps({ ...common, gen: 1, hostId: 'h', selfId: 'g3', lockstep: ls[2], transport: fa[2] })),
    ]);
    expect(gen1.map((r) => r.role)).toEqual(['host', 'join', 'join']);

    // gen2：新 host g1 再死（h 已判敗 → placedIds 含 h）→ g2 host、g3 join，槽位走 mig2-
    const gen2 = await Promise.all([
      runMigration(migDeps({ ...common, gen: 2, hostId: 'g1', placedIds: ['h'], selfId: 'g2', lockstep: ls[1], transport: fa[1] })),
      runMigration(migDeps({ ...common, gen: 2, hostId: 'g1', placedIds: ['h'], selfId: 'g3', lockstep: ls[2], transport: fa[2] })),
    ]);
    expect(gen2.map((r) => r.role)).toEqual(['host', 'join']);
    // gen2 槽位確實使用 mig2- 前綴（g3 原始 index=3 → 槽位 index 2）
    expect(signal.store.get('R:mig2-guest-2-offer')).toBeTruthy();
    expect(signal.store.get('R:mig2-host-ack-2')).toBeTruthy();
    // gen2 兩端對 g1 排程同一棄權幀（gen1 對 h 的排程仍在前）
    expect(ls[1].scheduled[1]).toEqual({ p: 'g1', f: 8 });
    expect(ls[2].scheduled[1]).toEqual({ p: 'g1', f: 8 });
  });

  it('壞 sync 訊息忽略不炸：host 收到非 JSON / 錯 gen / 壞 shape 的 sync 後，仍以合法 sync 完成遷移', async () => {
    const playerIds = ['h', 'g1', 'g2'];
    const signal = makeMigSignal();
    const rtc = makeMockRtc();
    const ls1 = mockMigLockstep({ cf: 10, horizon: { h: 12, g1: 12, g2: 9 }, inputs: [] });
    const f1 = new MigratingTransport(mockInner());

    // 手動扮演 g2（join 端）：寫 offer → 等 ack → 先送垃圾再送合法 sync
    const gp = rtc.guestPeer();
    const offer = await gp.createOffer();
    await signal.putSlot('R', 'mig1-guest-1-offer', JSON.stringify({ id: 'g2', offer }));

    const hostPromise = runMigration(migDeps({
      signal, playerIds, selfId: 'g1', lockstep: ls1, transport: f1,
      hostPeerFactory: rtc.hostPeer, guestPeerFactory: rtc.guestPeer,
      timeoutMs: 4_000, pollIntervalMs: 1, electionGraceMs: 0,
    }));

    // 等 host 寫 ack
    let ack: string | null = null;
    for (let i = 0; i < 1000 && !ack; i++) {
      ack = await signal.getSlot('R', 'mig1-host-ack-1');
      if (!ack) await new Promise((r) => setTimeout(r, 2));
    }
    expect(ack).toBeTruthy();
    await gp.acceptAnswer(ack!);
    const received: string[] = [];
    gp.channel.onmessage = (raw: string) => received.push(raw);

    // 垃圾訊息：非 JSON、錯 gen、壞 shape → host 一律忽略
    gp.channel.send('not-json');
    gp.channel.send(JSON.stringify({ t: 'ffa-mig-sync', gen: 99, cf: 0, horizon: {}, inputs: [] }));
    gp.channel.send(JSON.stringify({ t: 'ffa-mig-sync', gen: 1, cf: 'x', horizon: {}, inputs: [] }));
    gp.channel.send(JSON.stringify({ t: 'ffa-mig-sync', gen: 1, cf: 0, horizon: { h: NaN }, inputs: [] }));
    // 合法 sync（g2 視野 h 到 14 > g1 的 12 → F 應為 15）
    gp.channel.send(JSON.stringify({ t: 'ffa-mig-sync', gen: 1, cf: 9, horizon: { h: 14, g1: 11, g2: 12 }, inputs: [] }));

    const r1 = await hostPromise;
    expect(r1.role).toBe('host');
    expect(ls1.scheduled).toEqual([{ p: 'h', f: 15 }]);
    // g2 端收到 ffa-mig-state 廣播（含 merged inputs + hostForfeitF）
    const state = received
      .map((raw) => { try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; } })
      .find((m) => m && m.t === 'ffa-mig-state');
    expect(state).toBeTruthy();
    expect(state!.hostForfeitF).toBe(15);
    expect(state!.gen).toBe(1);
  });
});
