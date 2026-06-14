import { VersusMatch } from '../versus/versusMatch';
import type { CharacterId, Dir } from '../engine/types';

const SIM_DT = 1000 / 60;

/** 輸入延遲幀數（沿用 tetris ffaLockstep）。預填 0..INPUT_DELAY-1 為空輸入，
 * 故「從未送幀的玩家」的全員停滯點 = INPUT_DELAY。 */
export const INPUT_DELAY = 3;

/** 合法方向集合，用於 onMessage / queueLocal 的 shape 驗證（網路訊息不可信）。 */
const VALID_DIRS: ReadonlySet<string> = new Set<Dir>(['up', 'down', 'left', 'right']);

/**
 * 單一玩家「某一幀」的 versus 動作。
 *  - held：方向鍵按住/放開（對應 VersusMatch.setHeld）。
 *  - bomb / ability：單次動作（對應 VersusMatch.input）。
 */
export type VersusAction =
  | { t: 'held'; d: Dir; v: boolean }
  | { t: 'bomb' }
  | { t: 'ability' };

/** 單一玩家某幀的輸入。p = playerId。 */
export interface BomberFrameMsg {
  f: number;
  p: string;
  a: VersusAction[];
}

/**
 * N 人鎖步的傳輸抽象（比照 tetris FfaLockstepTransport 精神）。
 * 本端把自己的 BomberFrameMsg 丟給 send；transport 會把「所有玩家的該幀輸入」
 * 透過 onMessage 回灌回來（星狀中繼，含或不含自己皆可，inbox 寫入需冪等）。
 * 實際傳輸由 T10 提供，這裡只依賴介面。
 */
export interface BomberLockstepTransport {
  send(msg: BomberFrameMsg): void;
  onMessage(cb: (msg: BomberFrameMsg) => void): void;
}

export interface BomberLockstepOptions {
  playerIds: string[];
  localId: string;
  seed: number;
  arenaId: number;
  characters: Record<string, CharacterId>;
  transport: BomberLockstepTransport;
  inputDelay?: number;
}

/**
 * N 人確定性鎖步（星狀中繼），驅動 VersusMatch。
 *
 * 鐵則（1:1 仿 tetris ffaLockstep）：
 *  1. 前進條件＝「全部 playerIds 在 frame F 都有輸入」才 step F（木桶效應）。
 *  2. 已淘汰玩家（VersusMatch 中 player.alive === false）不再送輸入 →
 *     推進邏輯自動為其補空輸入 []，避免死鎖。
 *     （tetris ffaLockstep 用 getPlacement().has(id) 判定；VersusMatch 無該 API，
 *      改以 alive===false 對應「已定名次/離場、不會再送輸入」的玩家。）
 *  3. onMessage 對網路訊息做 JSON 容錯 + shape 驗證，畸形訊息一律忽略、不丟例外、不污染狀態。
 *  4. 套用某幀全員輸入時依固定 playerIds 順序、且同一玩家內 held 先於 bomb/ability，
 *     確保各端算出相同 stateHash()。
 */
export class BomberLockstep {
  readonly playerIds: string[];
  readonly localId: string;
  readonly match: VersusMatch;

  private transport: BomberLockstepTransport;
  private readonly seed: number;
  private readonly inputDelay: number;

  /** 每玩家每幀輸入：inbox.get(playerId).get(frame) = VersusAction[]。 */
  private inbox: Map<string, Map<number, VersusAction[]>> = new Map();
  /**
   * 每玩家「曾經收到過的最大輸入幀」（單調遞增，不隨 advance() 消化/刪除 inbox 而回退）。
   * 各端對同一玩家收到的廣播集合相同（inbox 寫入冪等、星狀中繼全員同收），故此值在各端一致，
   * 與各端的 simFrame 偏移無關——這正是 forfeit leave 幀「跨端決定性」的依據。
   */
  private lastInput: Map<string, number> = new Map();
  private simFrame = 0; // 下一個要模擬的幀（== confirmedFrame）
  private sendFrame = 0; // 下一個要送出的本地輸入幀
  /** 本地累積、尚未隨 tick 送出的動作。 */
  private pending: VersusAction[] = [];

  /** 斷線/離場玩家 → 其「離場生效幀」。自該幀起：補空輸入（免死鎖）+ 於該幀強制淘汰一次。 */
  private leaveAt: Map<string, number> = new Map();
  /** 已經實際套用過 match.forfeit 的離場玩家（冪等，避免重複淘汰）。 */
  private leaveApplied: Set<string> = new Set();

  constructor(opts: BomberLockstepOptions) {
    this.playerIds = [...opts.playerIds];
    this.localId = opts.localId;
    this.seed = opts.seed;
    this.inputDelay = opts.inputDelay ?? INPUT_DELAY;
    this.transport = opts.transport;
    this.match = new VersusMatch({
      seed: this.seed,
      arenaId: opts.arenaId,
      players: this.playerIds.map((id) => ({ id, character: opts.characters[id] })),
    });

    for (const id of this.playerIds) {
      this.inbox.set(id, new Map());
      this.lastInput.set(id, -1);
    }

    // 預填 frame 0..inputDelay-1 為空陣列（全員），否則開局永遠卡在 simFrame 0。
    for (let f = 0; f < this.inputDelay; f++) {
      for (const id of this.playerIds) this.recordInput(id, f, []);
    }

    this.transport.onMessage((raw) => this.handleMessage(raw));
  }

  /** == 下一個要模擬的幀；亦即「已全員確認並推進」的幀界線。 */
  get confirmedFrame(): number {
    return this.simFrame;
  }

  /** 累積本地輸入（會在下一次 tick 隨 sendFrame 送出）；過濾掉非法動作。 */
  queueLocal(...actions: VersusAction[]): void {
    for (const a of actions) {
      if (isValidAction(a)) this.pending.push(a);
    }
  }

  /**
   * 標記某玩家自 `frame` 起離場（斷線/退出）。自該幀起：
   *  1. advance() 為其自動補「空輸入」→ 不再因缺其輸入而死鎖（木桶效應）。
   *  2. 在 simFrame === frame 當幀對 match 套用一次 forfeit（強制淘汰）。
   *
   * 決定性鐵則：各端必須以「同一個 frame」呼叫本方法，如此各端在相同 simFrame 套用
   * 相同 forfeit，stateHash 不分歧。**正確的 frame 來源＝該離場玩家的
   * `lastInputFrame(p) + 1`**（見 lastInputFrame）：此值各端一致、與各端 simFrame 偏移
   * 無關，且恰是對局原本會卡住的前緣。呼叫端（bomber.astro）應以此推導 frame，
   * host 計算後廣播、全端套用相同值。
   *
   * 注意：下方 `Math.max(this.simFrame, frame)` 只是**防禦性安全網**，正確性來自上述
   * 「共享前緣」推導、而非此夾鉗。若以 lastInputFrame(p)+1 推導，理論上 frame 永遠 >=
   * 各端 simFrame（沒人能模擬超過尚缺輸入的前緣），故此夾鉗應**永不觸發**。一旦真的
   * 觸發（frame 已是過去式），代表推導出了問題（例如誤用 confirmedFrame）——此時於
   * 較晚的 simFrame 套用會造成端間分歧，寧可記錄警告而不要悄悄在分歧幀套用。
   * 同一玩家重複呼叫採「最早排定的有效幀」（冪等，避免不同來源覆蓋造成偏移）。
   */
  forfeit(playerId: string, frame: number): void {
    if (!this.inbox.has(playerId)) return; // 未知玩家忽略
    if (!Number.isFinite(frame)) return;
    const requested = Math.floor(frame);
    const at = Math.max(this.simFrame, requested);
    if (at !== requested && typeof console !== 'undefined') {
      // 防禦性安全網被觸發＝推導出了 bug（要求的離場幀已被本端模擬過）。記錄以利偵錯，
      // 仍夾到 simFrame 避免追溯歷史幀，但這代表端間可能分歧——不應在正常運作下發生。
      console.warn(
        `[BomberLockstep] forfeit(${playerId}) requested frame ${requested} < simFrame ${this.simFrame}; ` +
          `clamping to ${at}. This indicates a non-deterministic leave-frame derivation.`,
      );
    }
    const existing = this.leaveAt.get(playerId);
    if (existing !== undefined && existing <= at) return; // 已排定更早/同幀：保留首次
    this.leaveAt.set(playerId, at);
  }

  /**
   * 每模擬幀呼叫一次：先消化已到達的輸入推進，再送本地這一幀的輸入。
   * drain-before-send 與 tetris 一致，避免 loopback 同步傳遞造成端間 confirmedFrame 偏移。
   */
  tick(): void {
    // 1) 盡量前進：唯有全員對 simFrame 都有輸入才 step（淘汰者自動補空輸入）
    this.advance();

    // 2) 送出本地這一幀輸入（排程到 sendFrame + inputDelay）
    const targetFrame = this.sendFrame + this.inputDelay;
    const actions = this.pending;
    this.pending = [];
    this.recordInput(this.localId, targetFrame, actions);
    this.transport.send({ f: targetFrame, p: this.localId, a: actions });
    this.sendFrame++;

    // 送出後可能又湊齊（自身輸入），再推進一次
    this.advance();
  }

  // ── 內部 ──────────────────────────────────────────────────────────────

  /** 收遠端 BomberFrameMsg：JSON 容錯 + shape 驗證 → 寫入 inbox。畸形一律忽略。 */
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
    if (!msg.a.every(isValidAction)) return;
    this.recordInput(msg.p, msg.f, msg.a as VersusAction[]);
  }

  /** 寫入某玩家某幀輸入（冪等：已存在則不覆蓋，避免重複廣播造成不一致）。 */
  private recordInput(id: string, frame: number, actions: VersusAction[]): void {
    if (frame < this.simFrame) return; // 已模擬過的幀＝死歷史（遲到重播）→ 不寫，免汙染 inbox
    const map = this.inbox.get(id);
    if (!map) return;
    if (map.has(frame)) return; // 冪等：保留首次確認的輸入
    map.set(frame, actions);
    // 單調記錄「曾收到的最大輸入幀」——advance() 之後會刪掉已消化的幀，但此值不回退，
    // 故 lastInputFrame() 在各端一致（不受 simFrame 偏移影響）。
    const prev = this.lastInput.get(id);
    if (prev === undefined || frame > prev) this.lastInput.set(id, frame);
  }

  /**
   * 某玩家「曾經收到過的最大輸入幀」（無任何輸入則回傳 -1）。
   *
   * 決定性關鍵：星狀中繼下各端對同一玩家收到的廣播集合相同（inbox 寫入冪等），故此值
   * 在各端完全一致，與各端 simFrame 偏移無關。用於推導離場幀：一旦玩家 p 停送，
   * 全端的鎖步都會停在 p 的「最後輸入幀 + 1」（木桶效應的共同停滯點），所以
   * `lastInputFrame(p) + 1` 是各端算出皆相同、且正是對局原本會卡住的前緣——
   * 在該幀套用 forfeit 不會與任何端的 simFrame 相衝。
   */
  lastInputFrame(playerId: string): number {
    return this.lastInput.get(playerId) ?? -1;
  }

  /**
   * 盡量推進所有「全員齊備」的幀。
   * 已淘汰玩家（player.alive === false）不會送輸入 → 在此自動補空輸入，避免死鎖。
   */
  private advance(): void {
    for (;;) {
      // 對局已分出勝負就停止推進（否則下方「為已淘汰者補空輸入」會把全員每幀補滿 →
      // ready 恆真 → 無窮遞增 simFrame）。
      const state = this.match.getState();
      if (state.status !== 'playing') break;

      // 為已淘汰／已離場玩家補上 simFrame 的空輸入（其端不再送 → 否則永遠缺幀死鎖）。
      // 依 playerIds 固定順序迭代以保確定性。
      // - 已淘汰：player.alive === false。
      // - 已離場（斷線 forfeit）：simFrame >= 該玩家的 leaveAt（自離場幀起不再送）。
      const dead = new Set<string>();
      for (const p of state.players) if (!p.alive) dead.add(p.id);
      for (const id of this.playerIds) {
        const left = this.leaveAt.has(id) && this.simFrame >= this.leaveAt.get(id)!;
        if ((dead.has(id) || left) && !this.inbox.get(id)!.has(this.simFrame)) {
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

      // 離場強制淘汰：在套用本幀輸入「之前」對所有「leaveAt === simFrame」的玩家套用一次
      // forfeit（依 playerIds 固定順序，確保多人同幀離場時各端淘汰順序一致）。
      // 各端皆以 host 廣播的同一 leave 幀呼叫 forfeit → 在相同 simFrame 套用 → stateHash 一致。
      for (const id of this.playerIds) {
        if (this.leaveApplied.has(id)) continue;
        const at = this.leaveAt.get(id);
        if (at !== undefined && this.simFrame === at) {
          this.match.forfeit(id);
          this.leaveApplied.add(id);
        }
      }

      // 套用該幀全員輸入（依 playerIds 固定順序；同一玩家內 held 先於 bomb/ability，
      // 確保各端逐位元一致）。
      for (const id of this.playerIds) {
        const actions = this.inbox.get(id)!.get(this.simFrame)!;
        for (const act of actions) {
          if (act.t === 'held') this.match.setHeld(id, act.d, act.v);
        }
        for (const act of actions) {
          if (act.t === 'bomb') this.match.input(id, 'bomb');
          else if (act.t === 'ability') this.match.input(id, 'ability');
        }
      }
      this.match.step(SIM_DT);

      // 清理該幀，前進
      for (const id of this.playerIds) this.inbox.get(id)!.delete(this.simFrame);
      this.simFrame++;
    }
  }
}

/** 驗證單一 VersusAction 形狀（網路 / 本地皆走同一道閘）。 */
function isValidAction(a: unknown): a is VersusAction {
  if (!a || typeof a !== 'object') return false;
  const o = a as Record<string, unknown>;
  if (o.t === 'bomb' || o.t === 'ability') return true;
  if (o.t === 'held') {
    return typeof o.d === 'string' && VALID_DIRS.has(o.d) && typeof o.v === 'boolean';
  }
  return false;
}

/**
 * 記憶體 mock Hub（測試用）：建多個 BomberLockstepTransport，彼此互聯。
 * 某 transport.send → 廣播給「所有」節點的 onMessage（含自己）。inbox 寫入冪等
 * → 含自己重複寫入不影響一致性。
 *
 * 預設同步、無延遲、確定性。傳入 { jitter:true } 則進入「暫存」模式：
 * send 不立即投遞，而是壓入佇列；呼叫 flush() 時以確定性的打亂順序一次投遞
 * （模擬亂序/延遲投遞，仍 100% 確定性——以固定演算法重排，無 Math.random）。
 */
export class LoopbackBomberHub {
  private callbacks: Map<string, (msg: BomberFrameMsg) => void> = new Map();
  private readonly jitter: boolean;
  private queue: BomberFrameMsg[] = [];
  private seq = 0; // 確定性重排用的單調計數器

  constructor(opts?: { jitter?: boolean }) {
    this.jitter = opts?.jitter ?? false;
  }

  /** 為某 playerId 取得一條接上本 Hub 的 transport。 */
  transportFor(playerId: string): BomberLockstepTransport {
    const broadcast = (msg: BomberFrameMsg): void => {
      if (this.jitter) {
        this.queue.push(msg);
      } else {
        for (const cb of this.callbacks.values()) cb(msg);
      }
    };
    return {
      send: broadcast,
      onMessage: (cb: (msg: BomberFrameMsg) => void): void => {
        this.callbacks.set(playerId, cb);
      },
    };
  }

  /**
   * jitter 模式：把暫存訊息以「確定性打亂順序」一次投遞給全節點。
   * 重排鍵 = (seq * 2654435761) >>> 0 的位元雜湊（無 Math.random / Date.now），
   * 每次 flush 都會打亂與送達順序無關的次序，模擬亂序但保確定性。
   */
  flush(): void {
    if (this.queue.length === 0) return;
    const tagged = this.queue.map((msg) => ({ msg, k: (this.seq++ * 2654435761) >>> 0 }));
    tagged.sort((a, b) => a.k - b.k || a.msg.f - b.msg.f);
    this.queue = [];
    for (const { msg } of tagged) {
      for (const cb of this.callbacks.values()) cb(msg);
    }
  }
}
