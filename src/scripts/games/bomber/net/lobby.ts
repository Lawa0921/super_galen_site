import type { CharacterId } from '../engine/types';

/**
 * Bomber 對戰 Lobby 純狀態機（無 DOM、無網路）。
 *
 * 職責（plan Task 11 Step 1）：
 *  - host / guest 角色。
 *  - 玩家名單（每人 {id, character, ready}）。
 *  - 房狀態轉移 waiting → ready → starting。
 *  - host 選 arena（0-7）。
 *  - 2-4 人上限（拒絕第 5 名）。
 *  - 全員到齊且 ready 才可開局（>=2 人）。
 *  - 一名 guest 離開 → 退回 waiting（並清空 ready，需重新就緒）。
 *  - host 組裝 start payload {seed, arenaId, players:[{id,character}]}。
 *
 * 決定性鐵則：seed 是 host 的責任，且必須可重播——lobby 不直接用 Math.random，
 * 而是接受注入的 rng（測試/重播傳固定值），或 buildStartPayload 時外部直接指定 seed。
 * （對齊 ffaNetMain 由 host randInt 產 seed 並廣播給全員的精神：seed 單一來源、決定性。）
 */

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const ARENA_COUNT = 8; // arenaId 合法範圍 0..7（與 versus/arenas.ts ARENAS.length 一致）

export type LobbyRole = 'host' | 'guest';
export type LobbyState = 'waiting' | 'ready' | 'starting';

export interface LobbyPlayer {
  id: string;
  character: CharacterId;
  ready: boolean;
}

/** host 開局時廣播給全員的 start payload（seed/arenaId 單一來源＝host）。 */
export interface BomberStartPayload {
  seed: number;
  arenaId: number;
  /** 入座順序（host 在前）；index 即 BomberLockstep playerIds 的順序。 */
  players: Array<{ id: string; character: CharacterId }>;
}

export interface BomberLobbyOptions {
  role: LobbyRole;
  localId: string;
  character: CharacterId;
  /** 初始 arena（host 預設值；guest 端僅作顯示，最終以 host 廣播為準）。 */
  arenaId?: number;
  /**
   * 注入的隨機源（決定性測試/重播用）。預設 Math.random。
   * 僅用於「未指定 seed 時」產生 host 的對局 seed；不影響任何模擬內部 RNG。
   */
  rng?: () => number;
}

export class BomberLobby {
  readonly role: LobbyRole;
  readonly localId: string;

  private _players: LobbyPlayer[] = [];
  private _arenaId: number;
  private _state: LobbyState = 'waiting';
  private readonly rng: () => number;

  constructor(opts: BomberLobbyOptions) {
    this.role = opts.role;
    this.localId = opts.localId;
    this._arenaId = clampArena(opts.arenaId ?? 0) ?? 0;
    this.rng = opts.rng ?? Math.random;
    // 本機玩家先入座（host 在前的順序由「host 先建 lobby」自然保證）。
    this._players.push({ id: opts.localId, character: opts.character, ready: false });
  }

  get isHost(): boolean {
    return this.role === 'host';
  }

  get arenaId(): number {
    return this._arenaId;
  }

  get state(): LobbyState {
    return this._state;
  }

  /** 名單快照（外部不可變更內部陣列）。 */
  get players(): LobbyPlayer[] {
    return this._players.map((p) => ({ ...p }));
  }

  /**
   * 加入一名玩家（入座順序＝呼叫順序）。
   * 拒絕條件：已 starting / 已達上限（>MAX_PLAYERS）/ id 重複。回傳是否成功。
   */
  addPlayer(p: { id: string; character: CharacterId }): boolean {
    if (this._state === 'starting') return false;
    if (this._players.length >= MAX_PLAYERS) return false;
    if (this._players.some((x) => x.id === p.id)) return false;
    this._players.push({ id: p.id, character: p.character, ready: false });
    this.recompute();
    return true;
  }

  /**
   * 移除一名玩家（離開）。
   * 鐵則：有人離開 → 退回 waiting 並清空所有人的 ready（需重新確認後才能再開局）。
   * 未知 id 安全忽略。
   */
  removePlayer(id: string): void {
    if (this._state === 'starting') return;
    const before = this._players.length;
    this._players = this._players.filter((p) => p.id !== id);
    if (this._players.length === before) return; // 未知 id：無變化
    // 名單異動 → 重置就緒，回 waiting（避免「人換了但已就緒」的不一致）。
    for (const p of this._players) p.ready = false;
    this.recompute();
  }

  /** 設定某玩家 ready；未知 id 忽略。設定後重算 state。 */
  setReady(id: string, ready: boolean): void {
    if (this._state === 'starting') return;
    const p = this._players.find((x) => x.id === id);
    if (!p) return;
    p.ready = ready;
    this.recompute();
  }

  /**
   * host 選 arena（0..7）。guest 端無權（回 false）。
   * 超界 / 非整數 → 拒絕、值不變。
   */
  setArena(arenaId: number): boolean {
    if (!this.isHost) return false;
    if (this._state === 'starting') return false;
    const clamped = clampArena(arenaId);
    if (clamped === null) return false;
    this._arenaId = clamped;
    return true;
  }

  /**
   * 是否可開局：host 角色 + 人數達標（>=2, <=4）+ 全員 ready。
   * guest 端恆 false（開局由 host 主導，guest 收 host 的 start 廣播）。
   */
  canStart(): boolean {
    if (!this.isHost) return false;
    if (this._players.length < MIN_PLAYERS || this._players.length > MAX_PLAYERS) return false;
    return this._players.every((p) => p.ready);
  }

  /**
   * host 組裝 start payload。未達開局條件（含非 host）→ 回 null。
   * seed 來源優先序：明確指定 opts.seed > rng()（決定性可注入）。
   */
  buildStartPayload(opts?: { seed?: number }): BomberStartPayload | null {
    if (!this.canStart()) return null;
    const seed = opts?.seed !== undefined ? (opts.seed >>> 0) : this.genSeed();
    return {
      seed,
      arenaId: this._arenaId,
      players: this._players.map((p) => ({ id: p.id, character: p.character })),
    };
  }

  /**
   * 鎖定 lobby 進入 starting（開局後不再接受加入/就緒變動）。
   * 僅在 canStart() 時成功；回傳是否成功。
   */
  markStarting(): boolean {
    if (!this.canStart()) return false;
    this._state = 'starting';
    return true;
  }

  // ── 內部 ──────────────────────────────────────────────────────────────

  /** 由 rng 產生 32-bit 無號整數 seed（決定性：rng 可注入）。 */
  private genSeed(): number {
    return Math.floor(this.rng() * 0x1_0000_0000) >>> 0;
  }

  /** 依名單/ready 重算 state（starting 為終態，不被此覆蓋）。 */
  private recompute(): void {
    if (this._state === 'starting') return;
    const allReady =
      this._players.length >= MIN_PLAYERS &&
      this._players.length <= MAX_PLAYERS &&
      this._players.every((p) => p.ready);
    this._state = allReady ? 'ready' : 'waiting';
  }
}

/** 驗證並回傳合法 arenaId（0..7 整數），否則 null。 */
function clampArena(arenaId: number): number | null {
  if (!Number.isInteger(arenaId)) return null;
  if (arenaId < 0 || arenaId >= ARENA_COUNT) return null;
  return arenaId;
}
