import { FfaMatch } from '../engine/ffa';
import type { InputAction } from '../engine/game';
import type { FfaReplay } from './ffaReplay';

const SIM_DT = 1000 / 60;
/** 輸入延遲幀數（沿用 1v1 鎖步）。預填 0..INPUT_DELAY-1 為空輸入，
 * 故「從未送幀的玩家」的全員停滯點 = INPUT_DELAY（FfaForfeitController 計算 F 用）。 */
export const INPUT_DELAY = 3;

/**
 * exportSyncState 附帶的 replay tail 視窗（幀數，60fps 下 10 秒）。
 * Host 死亡時各端停滯點不同（cf 偏移）：超前端可能已把落後端缺的幀「消化並從
 * inbox 刪除」——這些幀的非空輸入只存在於 replayEvents。匯出 tail 讓合併補課
 * 能覆蓋 [laggard.cf, ahead.cf) 的缺口（實測偏移 ≈ INPUT_DELAY＋relay 在途量，
 * 600 幀為十倍以上裕度；空幀不需匯出——由 fillEmptyInputsUpTo 確定性回填）。
 */
export const SYNC_REPLAY_TAIL_FRAMES = 600;

/** 合法的輸入動作字串集合，用於 onMessage shape 驗證（網路訊息不可信）。 */
const VALID_ACTIONS: ReadonlySet<string> = new Set<InputAction>([
  'left', 'right', 'rotateCW', 'rotateCCW', 'softDrop', 'hardDrop', 'hold',
]);

/** 單一玩家某幀的輸入。p = playerId。 */
export interface FfaFrameMsg {
  f: number;
  p: string;
  a: InputAction[];
}

/**
 * N 人鎖步的傳輸抽象（比照 1v1 Transport 精神）。
 * 本端把自己的 FfaFrameMsg 丟給 send；transport 會把「所有玩家的該幀輸入」
 * 透過 onMessage 回灌回來（星狀中繼，含或不含自己皆可，inbox 寫入需冪等）。
 * 實際傳輸由 T8 提供，這裡只依賴介面。
 */
export interface FfaLockstepTransport {
  send(msg: FfaFrameMsg): void;
  onMessage(cb: (msg: FfaFrameMsg) => void): void;
}

/**
 * 鎖步同步狀態快照（host migration 補課用，spec B.4）。
 * cf      = confirmedFrame（已全員確認並推進的幀界線）。
 * horizon = 每玩家「本端已知」的最大幀：max(inbox 未消化最大鍵, 已消化至 cf-1)；
 *           自己另取 sendFrame+inputDelay-1（已送出但未確認的本地幀上界）。
 * inputs  = inbox 所有未消化幀攤平（inbox 本來就含自己已送未消化的本地幀）。
 */
export interface FfaSyncState {
  cf: number;
  horizon: Record<string, number>;
  inputs: Array<{ f: number; p: string; a: InputAction[] }>;
}

export interface FfaLockstepOptions {
  playerIds: string[];
  localId: string;
  seed: number;
  transport: FfaLockstepTransport;
  inputDelay?: number;
}

/**
 * N 人確定性鎖步（星狀中繼）。
 *
 * 鐵則：
 *  1. 前進條件＝「全部 playerIds 在 frame F 都有輸入」才 step F（木桶效應，沿用 1v1 精神）。
 *  2. 已淘汰玩家不再送輸入 → 推進邏輯自動為其補空輸入 []，避免死鎖。
 *  3. onMessage 對網路訊息做 JSON 容錯 + shape 驗證，畸形訊息一律忽略、不丟例外、不污染狀態。
 *  4. getReplay() 回傳 FfaReplay（seed/playerIds/frameCount/稀疏逐幀輸入），
 *     可被 simulateFfaReplay 重跑出相同名次。
 */
export class FfaLockstep {
  readonly playerIds: string[];
  readonly localId: string;

  private match: FfaMatch;
  private transport: FfaLockstepTransport;
  private readonly seed: number;
  private readonly inputDelay: number;

  /** 每玩家每幀輸入：inbox.get(playerId).get(frame) = InputAction[]。 */
  private inbox: Map<string, Map<number, InputAction[]>> = new Map();
  private simFrame = 0;  // 下一個要模擬的幀（== confirmedFrame）
  private sendFrame = 0; // 下一個要送出的本地輸入幀
  private replayEvents: FfaReplay['events'] = [];

  /** 排程中的棄權：playerId → 預定生效幀（host 廣播的 F；重複排程取最早）。 */
  private forfeitAt = new Map<string, number>();
  /** 已套用的棄權紀錄（f = 實際套用幀，供 replay 確定性重現）。 */
  private replayForfeits: Array<{ f: number; p: string }> = [];

  constructor(opts: FfaLockstepOptions) {
    this.playerIds = [...opts.playerIds];
    this.localId = opts.localId;
    this.seed = opts.seed;
    this.inputDelay = opts.inputDelay ?? INPUT_DELAY;
    this.transport = opts.transport;
    this.match = new FfaMatch(this.playerIds, { seed: this.seed });

    for (const id of this.playerIds) this.inbox.set(id, new Map());

    // 預填 frame 0..inputDelay-1 為空陣列（全員），否則開局永遠卡在 simFrame 0。
    for (let f = 0; f < this.inputDelay; f++) {
      for (const id of this.playerIds) this.inbox.get(id)!.set(f, []);
    }

    this.transport.onMessage((raw) => this.handleMessage(raw));
  }

  /** == 下一個要模擬的幀；亦即「已全員確認並推進」的幀界線。 */
  get confirmedFrame(): number {
    return this.simFrame;
  }

  getMatch(): FfaMatch {
    return this.match;
  }

  getStandings(): string[] {
    return this.match.getStandings();
  }

  /**
   * 每模擬幀呼叫一次：先消化已到達的輸入推進，再送本地這一幀的輸入。
   * drain-before-send 與 1v1 一致，避免 loopback 同步傳遞造成端間 confirmedFrame 偏移。
   */
  tick(localActions: InputAction[]): void {
    // 1) 盡量前進：唯有全員對 simFrame 都有輸入才 step（淘汰者自動補空輸入）
    this.advance();

    // 2) 送出本地這一幀輸入（排程到 sendFrame + inputDelay）
    const targetFrame = this.sendFrame + this.inputDelay;
    const actions = sanitizeActions(localActions);
    this.recordInput(this.localId, targetFrame, actions);
    this.transport.send({ f: targetFrame, p: this.localId, a: actions });
    this.sendFrame++;

    // 送出後可能又湊齊（自身輸入），再推進一次
    this.advance();
  }

  /**
   * 排程確定性棄權：玩家 p 在幀 f「套用該幀輸入之前」被判敗淘汰。
   * f 一律由 host 決定後廣播（任何端不得自行判定）；各端以相同 (p,f) 排程保證鎖步一致。
   * p 不在 playerIds 或 f 非有限非負數 → 忽略；重複排程取最早的 f。
   */
  scheduleForfeit(p: string, f: number): void {
    if (!this.inbox.has(p)) return;
    if (typeof f !== 'number' || !Number.isFinite(f) || f < 0) return;
    const prev = this.forfeitAt.get(p);
    this.forfeitAt.set(p, prev === undefined ? f : Math.min(prev, f));
  }

  /** 取得本局可重播紀錄（用於後端 replay 抽驗）。forfeits 一律給欄位（無中離＝空陣列）。 */
  getReplay(): FfaReplay & { forfeits: Array<{ f: number; p: string }> } {
    return {
      seed: this.seed,
      playerIds: [...this.playerIds],
      frameCount: this.simFrame,
      events: [...this.replayEvents],
      forfeits: [...this.replayForfeits],
    };
  }

  /**
   * 匯出同步狀態快照（host migration 補課用）。
   * 純讀取、不改任何內部狀態；inputs 的 a 為複本，呼叫端改動不影響 inbox。
   * inputs ＝ inbox 未消化幀 ＋ replay tail（近 SYNC_REPLAY_TAIL_FRAMES 幀內
   * 已套用的非空幀）——cf 偏移時超前端已消化、落後端仍缺的幀只能從 tail 補。
   * 兩來源幀域不重疊（inbox ≥ cf > replay）→ 無重複鍵。
   */
  exportSyncState(): FfaSyncState {
    const horizon: Record<string, number> = {};
    const inputs: FfaSyncState['inputs'] = [];
    for (const id of this.playerIds) {
      // 已消化至 cf-1（inbox 空時的下界）
      let max = this.simFrame - 1;
      for (const [f, a] of this.inbox.get(id)!) {
        if (f > max) max = f;
        inputs.push({ f, p: id, a: [...a] });
      }
      // 自己＝已送出但未確認的本地幀上界（正常情況即 inbox 最大鍵；
      // 自己已淘汰被 autofill 消化時取 max 保單調）
      if (id === this.localId) {
        max = Math.max(max, this.sendFrame + this.inputDelay - 1);
      }
      horizon[id] = max;
    }
    const tailFrom = this.simFrame - SYNC_REPLAY_TAIL_FRAMES;
    for (const e of this.replayEvents) {
      if (e.f >= tailFrom) inputs.push({ f: e.f, p: e.p, a: [...e.a] });
    }
    return { cf: this.simFrame, horizon, inputs };
  }

  /**
   * 以 baseCf（合併視野的 max cf）回填空輸入（host migration 補課用）。
   * 須在 importMergedInputs「之後」呼叫：超前端已套用的幀中，非空輸入必在其
   * replay tail（已隨 merge 灌入）；merge 後仍缺的 (f, p) 即為空幀 → 確定性補 []。
   * 跳過自己：本地輸入只在送出當下記錄，絕不合成（避免搶填未來要送的幀）；
   * 協定保證 baseCf ≤ 任一玩家已送幀上界＋1，故自己的幀必已齊。
   * frame 非有限數或 ≤ cf → no-op（網路來值不可信）。
   */
  fillEmptyInputsUpTo(frame: number): void {
    if (typeof frame !== 'number' || !Number.isFinite(frame)) return;
    for (let f = this.simFrame; f < frame; f++) {
      for (const id of this.playerIds) {
        if (id === this.localId) continue;
        const map = this.inbox.get(id)!;
        if (!map.has(f)) map.set(f, []);
      }
    }
  }

  /**
   * 灌入合併後的輸入集（host migration 補課用）。
   * 逐筆走 recordInput（冪等：首寫保留）；p 不在名單或壞形狀（f 非有限非負數、
   * a 非合法 action 陣列）一律忽略——合併集可能來自網路，不可信。
   * 不主動推進；下一次 tick 的 advance 自然越過補上的缺口。
   */
  importMergedInputs(inputs: Array<{ f: number; p: string; a: InputAction[] }>): void {
    if (!Array.isArray(inputs)) return;
    for (const raw of inputs) {
      if (!raw || typeof raw !== 'object') continue;
      const e = raw as Record<string, unknown>;
      if (typeof e.f !== 'number' || !Number.isFinite(e.f) || e.f < 0) continue;
      if (typeof e.p !== 'string' || !this.inbox.has(e.p)) continue;
      if (!Array.isArray(e.a)) continue;
      if (!e.a.every((x) => typeof x === 'string' && VALID_ACTIONS.has(x))) continue;
      this.recordInput(e.p, e.f, [...(e.a as InputAction[])]);
    }
  }

  // ── 內部 ──────────────────────────────────────────────────────────────

  /** 收遠端 FfaFrameMsg：JSON 容錯 + shape 驗證 → 寫入 inbox。畸形一律忽略。 */
  private handleMessage(raw: unknown): void {
    let m: unknown = raw;
    if (typeof raw === 'string') {
      try {
        m = JSON.parse(raw);
      } catch {
        return;
      }
    }
    if (!m || typeof m !== 'object') return;
    const msg = m as Record<string, unknown>;
    if (typeof msg.f !== 'number' || !Number.isFinite(msg.f)) return;
    if (typeof msg.p !== 'string' || !this.inbox.has(msg.p)) return;
    if (!Array.isArray(msg.a)) return;
    if (!msg.a.every((x) => typeof x === 'string' && VALID_ACTIONS.has(x))) return;
    this.recordInput(msg.p, msg.f, msg.a as InputAction[]);
  }

  /** 寫入某玩家某幀輸入（冪等：已存在則不覆蓋，避免重複廣播造成不一致）。 */
  private recordInput(id: string, frame: number, actions: InputAction[]): void {
    if (frame < this.simFrame) return; // 已模擬過的幀＝死歷史（遲到重播/補課 tail）→ 不寫，免汙染 inbox
    const map = this.inbox.get(id);
    if (!map) return;
    if (map.has(frame)) return; // 冪等：保留首次確認的輸入
    map.set(frame, actions);
  }

  /**
   * 盡量推進所有「全員齊備」的幀。
   * 已淘汰玩家（match.getPlacement 已定名次）不會送輸入 → 在此自動補空輸入，避免死鎖。
   */
  private advance(): void {
    for (;;) {
      // 對局已分出勝負就停止推進。否則勝者也已進 getPlacement()，
      // 下方「為已定名次者補空輸入」會把全員每幀都補滿 → ready 恆真 → 無窮遞增 simFrame。
      if (this.match.phase !== 'playing') break;

      // 套用已到期的排程棄權（f <= simFrame；在套用該幀輸入「之前」執行，
      // 依 playerIds 固定順序迭代保確定性）。記錄用「實際套用幀 simFrame」，
      // 正常情況 f > 排程當下的 confirmedFrame → simFrame === f；遲到的 forfeit
      // 則記實際幀，保證 replay 重現一致。
      if (this.forfeitAt.size > 0) {
        const placed = this.match.getPlacement();
        for (const id of this.playerIds) {
          const f = this.forfeitAt.get(id);
          if (f === undefined || f > this.simFrame) continue;
          if (!placed.has(id)) {
            this.match.forfeit(id);
            this.replayForfeits.push({ f: this.simFrame, p: id });
          }
          this.forfeitAt.delete(id); // 已定名次者直接清理（no-op）
        }
      }

      // 為已淘汰玩家補上 simFrame 的空輸入（其端不再送 → 否則永遠缺幀死鎖）
      const placement = this.match.getPlacement();
      for (const id of this.playerIds) {
        if (placement.has(id) && !this.inbox.get(id)!.has(this.simFrame)) {
          this.inbox.get(id)!.set(this.simFrame, []);
        }
      }

      // 前進條件：全員都有 simFrame 的輸入
      let ready = true;
      for (const id of this.playerIds) {
        if (!this.inbox.get(id)!.has(this.simFrame)) {
          ready = false;
          break;
        }
      }
      if (!ready) break;

      // 套用該幀全員輸入（依 playerIds 固定順序），記錄非空幀到 replay
      for (const id of this.playerIds) {
        const actions = this.inbox.get(id)!.get(this.simFrame)!;
        if (actions.length) {
          this.replayEvents.push({ f: this.simFrame, p: id, a: actions });
        }
        for (const act of actions) this.match.input(id, act);
      }
      this.match.step(SIM_DT);

      // 清理該幀，前進
      for (const id of this.playerIds) this.inbox.get(id)!.delete(this.simFrame);
      this.simFrame++;
    }
  }
}

/** 過濾掉本地傳入的非法 action（防呆，保持與 onMessage 同一道驗證標準）。 */
function sanitizeActions(actions: InputAction[]): InputAction[] {
  if (!Array.isArray(actions)) return [];
  return actions.filter((a) => typeof a === 'string' && VALID_ACTIONS.has(a));
}

/**
 * 記憶體 mock Hub（測試用）：建多個 FfaLockstepTransport，彼此互聯。
 * 某 transport.send → 廣播給「所有」節點的 onMessage（含自己）。
 * 同步、無延遲、確定性。inbox 寫入冪等 → 含自己重複寫入不影響一致性。
 */
export class LoopbackHub {
  private callbacks: Map<string, (msg: FfaFrameMsg) => void> = new Map();

  /** 為某 playerId 取得一條接上本 Hub 的 transport。 */
  transportFor(playerId: string): FfaLockstepTransport {
    const broadcast = (msg: FfaFrameMsg): void => {
      // 廣播給所有節點（含發送者自己）；同步傳遞、確定性
      for (const cb of this.callbacks.values()) {
        cb(msg);
      }
    };
    return {
      send: broadcast,
      onMessage: (cb: (msg: FfaFrameMsg) => void): void => {
        this.callbacks.set(playerId, cb);
      },
    };
  }
}
