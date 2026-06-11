import { INPUT_DELAY, type FfaLockstepTransport, type FfaFrameMsg, type FfaSyncState } from './ffaLockstep';
import { FfaHubTransport, FfaSpokeTransport, type RelayChannel } from './ffaTransport';

/**
 * Host Migration（中離續行 Stage B）—— 遷移基元 + 協調器。
 *
 *  - electHost：新 host 選舉（無需通訊的確定性規則，spec B.2）
 *  - SyncState / mergeSync：輸入視野合併（斷點補課，spec B.4）
 *  - hostForfeitFrame：舊 host 判敗幀（max horizon+1、夾 INPUT_DELAY，禁 confirmedFrame+1）
 *  - MigratingTransport：傳輸層熱插拔 facade（spec B.5）
 *  - runMigration：遷移協調器（M4；全依賴注入，mock-net 可測）
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
 * 比 FfaLockstepTransport 多 sendControl/onControl（Hub/Spoke 既有的控制訊息通道）；
 * 兩者為可選——不支援控制通道的 inner（測試 mock）也可被包，控制訊息成 no-op。
 */
export interface MigratableInner {
  send(msg: FfaFrameMsg): void;
  onMessage(cb: (msg: FfaFrameMsg) => void): void;
  sendControl?(msg: Record<string, unknown>): void;
  onControl?(cb: (msg: Record<string, unknown>) => void): void;
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
    inner.onControl?.((msg) => {
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
    this.inner.sendControl?.(msg);
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

// ═════════════════════════════════════════════════════════════════════════
// M4：runMigration —— 遷移協調器（spec B.2/B.3/B.4/B.5）
//
// 協定（世代 g，槽位沿用 T11 guest-initiated 交握）：
//   1. electHost 決定角色（本端視野）。
//   2. 「所有」參與者（含自任 host）先 createOffer 寫入 mig{g}-guest-{i}-offer：
//      自任 host 的 offer 兼作「選舉 beacon」——讓位仲裁的依據，且讓位後可直接被
//      真 host answer（不必重寫）。i = 該玩家在 playerIds 的原始 index - 1
//      （host 在 index 0 → guest 原始 index 1..7 → 槽位 0..6）。
//   3. 自任 host：等 ELECTION_GRACE_MS（給更低 index 的真候選時間寫 beacon）→
//      檢查是否存在更低 index 的 offer：有 → 自己誤判為候選，改走 join；無 → host。
//   4. host：輪詢倖存者 offer → 逐一 createAnswer 寫 mig{g}-host-ack-{i} → waitOpen →
//      暫掛 per-channel 收訊收集 ffa-mig-sync（channel 需在 onmessage 設定前緩衝，
//      真實路徑由 wrapChannel 保證）→ 收齊（含自己 exportSyncState）→ mergeSync →
//      建 FfaHubTransport → 廣播 ffa-mig-state（合併輸入 + hostForfeitF）→
//      自己 import + scheduleForfeit → swap(hub)。
//   5. join：等 ack → acceptAnswer → waitOpen → spoke → 送 ffa-mig-sync →
//      等 ffa-mig-state → import + scheduleForfeit → swap(spoke)。
//   6. 任一步逾時（MIGRATION_TIMEOUT_MS）→ throw（netMain catch 後降級為中止）。
// ═════════════════════════════════════════════════════════════════════════

/** 整體遷移逾時（任一步超過即 reject → netMain 降級中止）。 */
export const MIGRATION_TIMEOUT_MS = 20_000;
/** 選舉先手窗：自任 host 寫完 beacon 後等待此時長，再做讓位檢查。 */
export const ELECTION_GRACE_MS = 3_000;
/** 同一局最多遷移次數（mig1..mig6 槽位上限；超過降級中止）。 */
export const MAX_MIGRATIONS = 6;

/** signaling 最小依賴（FfaSignalClient 子集；mock-net 可注入記憶體 Map）。 */
export interface MigSignal {
  putSlot(room: string, slot: string, data: string): Promise<void>;
  getSlot(room: string, slot: string): Promise<string | null>;
}

/** 遷移用 channel 形狀（RelayChannel + 可賦值 onmessage；真實路徑為 wrapChannel 產物）。 */
export type MigChannel = RelayChannel & { onmessage?: ((raw: string) => void) | null };

/** 新 host 端對某倖存者的 RTC peer（收 offer 回 answer；同 FfaHostAnswerPeer 形狀）。 */
export interface MigHostPeer {
  createAnswer(offer: string): Promise<string>;
  waitOpen(): Promise<void>;
  readonly channel: MigChannel;
}

/** 加入端對新 host 的 RTC peer（建 offer 收 answer；同 FfaGuestOfferPeer 形狀）。 */
export interface MigGuestPeer {
  createOffer(): Promise<string>;
  acceptAnswer(answer: string): Promise<void>;
  waitOpen(): Promise<void>;
  readonly channel: MigChannel;
}

/** 遷移所需的 lockstep 最小形狀（FfaLockstep 子集；mock 友善）。 */
export interface MigLockstep {
  exportSyncState(): FfaSyncState;
  importMergedInputs(inputs: SyncState['inputs']): void;
  scheduleForfeit(p: string, f: number): void;
}

export interface RunMigrationDeps {
  signal: MigSignal;
  room: string;
  /** 遷移世代 1..6（決定 mig{g}- 槽位）。 */
  gen: number;
  /** 開局 ffa-init 的 playerIds（全端一致、永不重排）。 */
  playerIds: string[];
  /** 剛死掉的 host（gen1 = playerIds[0]；gen2+ = 上一代新 host）。 */
  hostId: string;
  selfId: string;
  /** 本端視野中已定名次者（選舉排除；視野分歧由 beacon 仲裁兜底）。 */
  placedIds: string[];
  lockstep: MigLockstep;
  /** 對局現役 transport facade（成功後 swap 到新拓樸）。 */
  transport: MigratingTransport;
  hostPeerFactory: () => MigHostPeer;
  guestPeerFactory: () => MigGuestPeer;
  inputDelay?: number;
  now?: () => number;
  timeoutMs?: number;
  electionGraceMs?: number;
  pollIntervalMs?: number;
}

export type RunMigrationResult =
  /** 自己成為新 host：netMain 用 hub + guestIds 啟動 Stage A 偵測（wireFfaForfeit）。 */
  | { role: 'host'; hostId: string; hub: FfaHubTransport; guestIds: string[] }
  /** 加入新 host：netMain 對 spoke 重掛 host-down 偵測（gen+1 備用）。hostId = 本端認定的新 host。 */
  | { role: 'join'; hostId: string; spoke: FfaSpokeTransport };

/** mig offer 槽位酬載：{id, offer}（同 T11 GuestOfferMsg 形狀）。 */
function parseMigOffer(raw: string): { id: string; offer: string } | null {
  try {
    const m = JSON.parse(raw) as Record<string, unknown>;
    if (typeof m.id === 'string' && typeof m.offer === 'string') {
      return { id: m.id, offer: m.offer };
    }
  } catch { /* ignore */ }
  return null;
}

/** 驗證 ffa-mig-sync（原始字串）：gen 必須相符、shape 完整；畸形回 null（網路訊息不可信）。 */
function parseMigSync(raw: unknown, gen: number): SyncState | null {
  let m: unknown = raw;
  if (typeof raw === 'string') {
    try {
      m = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  if (o.t !== 'ffa-mig-sync' || o.gen !== gen) return null;
  if (typeof o.cf !== 'number' || !Number.isFinite(o.cf)) return null;
  if (!o.horizon || typeof o.horizon !== 'object' || Array.isArray(o.horizon)) return null;
  const horizon: Record<string, number> = {};
  for (const [k, v] of Object.entries(o.horizon as Record<string, unknown>)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    horizon[k] = v;
  }
  if (!Array.isArray(o.inputs)) return null;
  // inputs 細項由 importMergedInputs 再驗一次；這裡確保 mergeSync 不會炸
  const inputs = (o.inputs as unknown[]).filter((e): e is SyncState['inputs'][number] => {
    if (!e || typeof e !== 'object') return false;
    const i = e as Record<string, unknown>;
    return typeof i.f === 'number' && Number.isFinite(i.f)
      && typeof i.p === 'string' && Array.isArray(i.a);
  });
  return { cf: o.cf, horizon, inputs };
}

/** 驗證 ffa-mig-state（控制訊息物件）：gen 相符、inputs 陣列、hostForfeitF 有限非負。 */
function parseMigState(
  msg: Record<string, unknown>,
  gen: number,
): { inputs: SyncState['inputs']; hostForfeitF: number } | null {
  if (msg.t !== 'ffa-mig-state' || msg.gen !== gen) return null;
  if (!Array.isArray(msg.inputs)) return null;
  if (typeof msg.hostForfeitF !== 'number' || !Number.isFinite(msg.hostForfeitF) || msg.hostForfeitF < 0) return null;
  return { inputs: msg.inputs as SyncState['inputs'], hostForfeitF: msg.hostForfeitF };
}

/**
 * 遷移協調器（host 死亡後由每個倖存 guest 各自呼叫）。
 * 全依賴注入：signaling / RTC / lockstep / transport / 時鐘與節奏皆可 mock。
 * 成功 → 回傳新角色與新拓樸；任一步逾時或無候選 → throw（呼叫端降級中止）。
 *
 * 呼叫端規約：**已知自己已定名次（淘汰/棄權）者不得呼叫**——其低 index offer
 * 會讓真候選在讓位檢查中誤讓位 → 全員 join → 選舉死鎖（netMain 已把關）。
 * 視野落後、尚不知自己已定名次者照常參與：即使其誤判自任 host，
 * 仲裁會收斂到它當 host —— host 只是純 relay，已淘汰者亦可勝任。
 */
export async function runMigration(deps: RunMigrationDeps): Promise<RunMigrationResult> {
  const now = deps.now ?? Date.now;
  const timeoutMs = deps.timeoutMs ?? MIGRATION_TIMEOUT_MS;
  const grace = deps.electionGraceMs ?? ELECTION_GRACE_MS;
  const interval = deps.pollIntervalMs ?? 500;
  const inputDelay = deps.inputDelay ?? INPUT_DELAY;
  const deadline = now() + timeoutMs;
  const g = deps.gen;
  const placed = new Set(deps.placedIds);

  // 原始 index（playerIds 不重排）→ 槽位 index：guest 在 playerIds[1..7] → 槽位 0..6。
  const slotIndexOf = (id: string): number => deps.playerIds.indexOf(id) - 1;
  const offerSlot = (id: string): string => `mig${g}-guest-${slotIndexOf(id)}-offer`;
  const ackSlot = (id: string): string => `mig${g}-host-ack-${slotIndexOf(id)}`;

  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  const ensureTime = (label: string): void => {
    if (now() > deadline) throw new Error(`migration timeout: ${label}`);
  };
  /** 為一步驟掛上「剩餘預算」逾時（waitOpen / acceptAnswer 等可能永久卡住）。 */
  function withDeadline<T>(p: Promise<T>, label: string): Promise<T> {
    const remain = deadline - now();
    if (remain <= 0) return Promise.reject(new Error(`migration timeout: ${label}`));
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`migration timeout: ${label}`)), remain);
      p.then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); },
      );
    });
  }

  /** 輪詢槽位直到有值或 deadline。 */
  async function pollUntil(slot: string, label: string): Promise<string> {
    for (;;) {
      const v = await deps.signal.getSlot(deps.room, slot);
      if (v) return v;
      ensureTime(label);
      await sleep(interval);
    }
  }

  /** 建 offer 並寫入自己的槽位（join 的 offer ＝ host 候選的選舉 beacon，同一條路）。 */
  async function writeOwnOffer(peer: MigGuestPeer): Promise<void> {
    const offer = await withDeadline(peer.createOffer(), 'createOffer');
    await deps.signal.putSlot(deps.room, offerSlot(deps.selfId), JSON.stringify({ id: deps.selfId, offer }));
  }

  /** join 流程：等 ack → 接通 → 送 sync → 收 state → 補課 + 排程舊 host 判敗 → swap。 */
  async function joinFlow(peer: MigGuestPeer, candidateId: string): Promise<RunMigrationResult> {
    const answer = await pollUntil(ackSlot(deps.selfId), 'host-ack');
    await withDeadline(peer.acceptAnswer(answer), 'acceptAnswer');
    await withDeadline(peer.waitOpen(), 'waitOpen');
    const spoke = new FfaSpokeTransport(peer.channel);

    // 先掛 state 等待、再送 sync（state 必在 host 收齊全員 sync 後才廣播，此順序是保險）。
    let resolveState: (s: { inputs: SyncState['inputs']; hostForfeitF: number }) => void = () => {};
    const statePromise = new Promise<{ inputs: SyncState['inputs']; hostForfeitF: number }>((res) => {
      resolveState = res;
    });
    spoke.onControl((msg) => {
      const st = parseMigState(msg, g);
      if (st) resolveState(st);
    });
    const sync = deps.lockstep.exportSyncState();
    spoke.sendControl({ t: 'ffa-mig-sync', gen: g, cf: sync.cf, horizon: sync.horizon, inputs: sync.inputs });

    const state = await withDeadline(statePromise, 'ffa-mig-state');
    deps.lockstep.importMergedInputs(state.inputs);
    deps.lockstep.scheduleForfeit(deps.hostId, state.hostForfeitF);
    deps.transport.swap(spoke);
    return { role: 'join', hostId: candidateId, spoke };
  }

  /** host 流程：收齊倖存者 offer → answer → 收齊 sync → merge → 廣播 state → swap hub。 */
  async function hostFlow(): Promise<RunMigrationResult> {
    // 倖存者（本端視野）依原始順序輪詢；排除舊 host 與自己。
    const expected = deps.playerIds.filter(
      (id) => id !== deps.hostId && id !== deps.selfId && !placed.has(id),
    );
    if (expected.length === 0) throw new Error('migration: no survivors to host');

    const channels: MigChannel[] = [];
    const guestIds: string[] = [];
    const collected: SyncState[] = [];
    const remaining = new Set(expected);

    while (remaining.size > 0) {
      let progressed = false;
      for (const id of expected) {
        if (!remaining.has(id)) continue;
        const raw = await deps.signal.getSlot(deps.room, offerSlot(id));
        if (!raw) continue;
        const parsed = parseMigOffer(raw);
        if (!parsed) { remaining.delete(id); continue; } // 壞 offer：放棄該端（不可恢復）
        const peer = deps.hostPeerFactory();
        const answer = await withDeadline(peer.createAnswer(parsed.offer), 'createAnswer');
        await deps.signal.putSlot(deps.room, ackSlot(id), answer);
        await withDeadline(peer.waitOpen(), 'waitOpen');
        // 暫掛收訊收集 ffa-mig-sync（遷移期間 guest 凍結，不會送幀；
        // 設定 onmessage 當下 channel 既有緩衝會 flush —— wrapChannel 保證不漏早到的 sync）。
        peer.channel.onmessage = (rawMsg: string) => {
          const s = parseMigSync(rawMsg, g);
          if (s) collected.push(s);
        };
        channels.push(peer.channel);
        guestIds.push(id);
        remaining.delete(id);
        progressed = true;
      }
      if (remaining.size === 0) break;
      ensureTime('collect offers');
      if (!progressed) await sleep(interval);
    }

    // 收齊各端 sync（收訊由 channel handler 非同步推進；這裡輪詢計數）。
    while (collected.length < channels.length) {
      ensureTime('collect syncs');
      await sleep(interval);
    }

    // 合併（含自己的視野）→ 舊 host 判敗幀 = merge 後 horizon（禁 confirmedFrame+1）。
    const merged = mergeSync([deps.lockstep.exportSyncState(), ...collected]);
    const hostForfeitF = hostForfeitFrame(merged.horizon, deps.hostId, inputDelay);

    // 建 hub（接管各 channel 收訊）→ 廣播 ffa-mig-state → 自己補課 + swap。
    const hub = new FfaHubTransport(channels);
    hub.sendControl({ t: 'ffa-mig-state', gen: g, inputs: merged.inputs, hostForfeitF });
    deps.lockstep.importMergedInputs(merged.inputs);
    deps.lockstep.scheduleForfeit(deps.hostId, hostForfeitF);
    deps.transport.swap(hub);
    return { role: 'host', hostId: deps.selfId, hub, guestIds };
  }

  // ── 選舉與角色分派 ──────────────────────────────────────────────────────
  const elected = electHost(deps.playerIds, deps.hostId, deps.placedIds, deps.selfId);

  if (elected.role !== 'host') {
    if (!elected.candidateId) throw new Error('migration: no host candidate');
    const peer = deps.guestPeerFactory();
    await writeOwnOffer(peer);
    return joinFlow(peer, elected.candidateId);
  }

  // 自任 host：先寫 beacon offer（仲裁依據；讓位後可直接被真 host answer）。
  const beaconPeer = deps.guestPeerFactory();
  await writeOwnOffer(beaconPeer);
  if (grace > 0) await sleep(grace); // 給更低 index 的真候選先手時間
  // 讓位檢查：存在更低原始 index 的 offer → 自己誤判為候選（視野落後），改走 join。
  const myIdx = slotIndexOf(deps.selfId);
  for (const id of deps.playerIds) {
    if (id === deps.hostId || id === deps.selfId) continue;
    const idx = slotIndexOf(id);
    if (idx < 0 || idx >= myIdx) continue;
    const v = await deps.signal.getSlot(deps.room, offerSlot(id));
    if (v) return joinFlow(beaconPeer, id);
  }
  return hostFlow();
}
