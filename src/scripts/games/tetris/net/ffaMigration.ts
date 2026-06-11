import type { FfaLockstepTransport, FfaFrameMsg } from './ffaLockstep';

/**
 * Host Migration（中離續行 Stage B）—— 遷移基元。
 *
 * 本檔目前包含 M2 範圍：
 *  - electHost：新 host 選舉（無需通訊的確定性規則，spec B.2）
 *  - SyncState / mergeSync：輸入視野合併（斷點補課，spec B.4）
 *  - hostForfeitFrame：舊 host 判敗幀（max horizon+1、夾 INPUT_DELAY，禁 confirmedFrame+1）
 *  - MigratingTransport：傳輸層熱插拔 facade（spec B.5）
 *
 * M4 之後會在同檔加遷移協調器（runMigration）。
 */

/**
 * 新 host 選舉（純函式）。
 * 候選＝playerIds 中排除 hostId 與 placedIds（已定名次/已棄權）後，原始 slot index 最低者。
 * selfId === candidateId → 自任 host；無任何候選（全淘汰邊界）→ candidateId 空字串、role 'join'。
 */
export function electHost(
  playerIds: string[],
  hostId: string,
  placedIds: string[],
  selfId: string,
): { role: 'host' | 'join'; candidateId: string } {
  const placed = new Set(placedIds);
  const candidateId = playerIds.find((id) => id !== hostId && !placed.has(id)) ?? '';
  const role: 'host' | 'join' = candidateId !== '' && candidateId === selfId ? 'host' : 'join';
  return { role, candidateId };
}

/**
 * 單一端在 host 死亡斷點的同步快照（ffa-mig-sync 的酬載核心）。
 *  - cf：該端 confirmedFrame
 *  - horizon：該端視野中各玩家「已知輸入的最大幀」
 *  - inputs：該端 inbox 中尚未消化的幀＋自己已送出未確認的本地幀
 */
export interface SyncState {
  cf: number;
  horizon: Record<string, number>;
  inputs: Array<{ f: number; p: string; a: string[] }>;
}

/**
 * 合併各端 SyncState（純函式、冪等）。
 *  - inputs：以 (f, p) 為鍵去重、首見保留（同幀同玩家輸入在各端必然相同——皆源自舊 host 有序轉發）。
 *  - horizon：每玩家取所有 state 的最大值。
 */
export function mergeSync(states: SyncState[]): {
  inputs: SyncState['inputs'];
  horizon: Record<string, number>;
} {
  const seen = new Set<string>();
  const inputs: SyncState['inputs'] = [];
  const horizon: Record<string, number> = {};
  for (const s of states) {
    for (const inp of s.inputs) {
      const key = `${inp.f}|${inp.p}`;
      if (seen.has(key)) continue; // 冪等：首見保留
      seen.add(key);
      inputs.push(inp);
    }
    for (const [p, f] of Object.entries(s.horizon)) {
      const prev = horizon[p];
      horizon[p] = prev === undefined ? f : Math.max(prev, f);
    }
  }
  return { inputs, horizon };
}

/**
 * 舊 host 判敗生效幀：max(horizon[hostId]) + 1，向下夾 inputDelay。
 * 「+1 於已知輸入最大幀」＝必可達的全員停滯點；host 從未送幀 → INPUT_DELAY。
 * 禁用 confirmedFrame+1（Stage A 死鎖教訓：該幀可能永遠湊不齊全員輸入）。
 */
export function hostForfeitFrame(
  horizon: Record<string, number>,
  hostId: string,
  inputDelay: number,
): number {
  const h = horizon[hostId];
  return Math.max((h === undefined ? -1 : h) + 1, inputDelay);
}

/**
 * MigratingTransport 可持有的 inner 形狀（結構相容：FfaHubTransport / FfaSpokeTransport 皆滿足）。
 * 比 FfaLockstepTransport 多 sendControl/onControl（Hub/Spoke 既有的控制訊息通道）。
 */
export interface MigratableInner {
  send(msg: FfaFrameMsg): void;
  onMessage(cb: (msg: FfaFrameMsg) => void): void;
  sendControl(msg: Record<string, unknown>): void;
  onControl(cb: (msg: Record<string, unknown>) => void): void;
}

/**
 * 傳輸層熱插拔 facade（spec B.5）。
 *
 * FfaLockstep 只認一個 transport；遷移時不動 lockstep，改由本類在內部換 inner：
 *  - send/sendControl：永遠委派給「當前」inner。
 *  - 收訊（幀＋控制）：綁定時以「該 inner 是否仍為當前」做 stale 防護——
 *    swap 後舊 inner（死掉的 host 通道）殘留來訊一律丟棄（不重）。
 *  - 緩衝：上層回呼註冊前收到的訊息暫存，註冊時依序 flush（不漏、保序）；
 *    swap 不清緩衝（swap 前合法收到的訊息仍要送達上層）。
 */
export class MigratingTransport implements FfaLockstepTransport {
  private inner: MigratableInner;
  private cb: ((msg: FfaFrameMsg) => void) | null = null;
  private controlCb: ((msg: Record<string, unknown>) => void) | null = null;
  private msgBuffer: FfaFrameMsg[] = [];
  private ctrlBuffer: Array<Record<string, unknown>> = [];

  constructor(inner: MigratableInner) {
    this.inner = inner;
    this.bind(inner);
  }

  /** 把 inner 的收訊流重綁到同一上層回呼（含 stale 防護與註冊前緩衝）。 */
  private bind(inner: MigratableInner): void {
    inner.onMessage((msg) => {
      if (this.inner !== inner) return; // swap 後舊 inner 殘留來訊 → 丟棄
      if (this.cb) this.cb(msg);
      else this.msgBuffer.push(msg);
    });
    inner.onControl((msg) => {
      if (this.inner !== inner) return;
      if (this.controlCb) this.controlCb(msg);
      else this.ctrlBuffer.push(msg);
    });
  }

  /** 熱插拔：換掉 inner（spoke↔hub），訊息流重綁到同一上層回呼。 */
  swap(inner: MigratableInner): void {
    this.inner = inner;
    this.bind(inner);
  }

  send(msg: FfaFrameMsg): void {
    this.inner.send(msg);
  }

  sendControl(msg: Record<string, unknown>): void {
    this.inner.sendControl(msg);
  }

  onMessage(cb: (msg: FfaFrameMsg) => void): void {
    this.cb = cb;
    if (this.msgBuffer.length > 0) {
      const buffered = this.msgBuffer;
      this.msgBuffer = [];
      for (const m of buffered) cb(m); // 依序 flush，不漏不重
    }
  }

  onControl(cb: (msg: Record<string, unknown>) => void): void {
    this.controlCb = cb;
    if (this.ctrlBuffer.length > 0) {
      const buffered = this.ctrlBuffer;
      this.ctrlBuffer = [];
      for (const m of buffered) cb(m);
    }
  }
}
