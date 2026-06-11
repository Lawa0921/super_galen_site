import { describe, it, expect } from 'vitest';
import {
  electHost,
  mergeSync,
  hostForfeitFrame,
  MigratingTransport,
  type SyncState,
  type MigratableInner,
} from './ffaMigration';
import type { FfaFrameMsg } from './ffaLockstep';
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
