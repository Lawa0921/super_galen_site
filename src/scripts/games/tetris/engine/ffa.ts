import { TetrisGame, type InputAction } from './game';
import type { ActivePiece, GameState, TSpinType } from './types';
import { computeAttack, cancelGarbage } from './attack';
import { createRng } from './rng';
import { BOARD_WIDTH } from './constants';

export type FfaPhase = 'playing' | 'result';

/**
 * 攻擊目標選擇策略。pickTarget 從「存活且非自己」中挑一名收垃圾者，無對手回 null。
 * 必須使用傳入的 rng（種子化）以保持確定性，禁止 Math.random()。
 */
export interface AttackRouting {
  pickTarget(fromId: string, aliveIds: string[], rng: () => number): string | null;
}

/** 種子化隨機路由：從存活且非自己的對手中以傳入 rng 等機率選一名。 */
export class SeededRandomRouting implements AttackRouting {
  pickTarget(fromId: string, aliveIds: string[], rng: () => number): string | null {
    const candidates = aliveIds.filter((id) => id !== fromId);
    if (candidates.length === 0) return null;
    const idx = Math.floor(rng() * candidates.length);
    // 保險夾擠（rng 理論上 [0,1)，floor 不會越界，但防 1.0 邊界）
    return candidates[Math.min(idx, candidates.length - 1)];
  }
}

export type FfaMatchEvent =
  | { kind: 'lock'; id: string; piece: ActivePiece }
  | { kind: 'lineClear'; id: string; rows: number[]; count: number; tSpin: TSpinType; combo: number; b2b: boolean }
  | { kind: 'attack'; from: string; to: string; amount: number }
  | { kind: 'garbageIn'; id: string; amount: number }
  | { kind: 'ko'; id: string; placement: number; reason?: 'forfeit' }
  | { kind: 'victory'; id: string };

export interface FfaMatchOptions {
  seed: number;
  routing?: AttackRouting;
}

/**
 * N 人大亂鬥對局核心（純確定性、可重模擬）。
 *
 * 鐵則：
 *  1. 全部 N 盤共用同一個 seed（禁 seed+i）。
 *  2. 攻擊目標選擇用種子化 targetRng = createRng((seed ^ 0x5e3779b9) >>> 0)；
 *     垃圾洞沿用 1v1 種子化 holeRng = createRng((seed ^ 0x9e3779b9) >>> 0)。
 *  3. 同幀多人 topout 的名次 tie-break 依 playerIds 固定順序。
 */
export class FfaMatch {
  readonly playerIds: string[];
  phase: FfaPhase = 'playing';

  private games: Map<string, TetrisGame> = new Map();
  private incoming: Map<string, number> = new Map();
  private placements: Map<string, number> = new Map();
  private routing: AttackRouting;
  private targetRng: () => number;
  private holeRng: () => number;
  private events: FfaMatchEvent[] = [];

  constructor(playerIds: string[], opts: FfaMatchOptions) {
    this.playerIds = [...playerIds];
    const seed = opts.seed;
    this.routing = opts.routing ?? new SeededRandomRouting();
    // 攻擊目標 RNG（種子化、與盤面/垃圾洞獨立但可重現）
    this.targetRng = createRng((seed ^ 0x5e3779b9) >>> 0);
    // 垃圾洞 RNG，沿用 1v1 match.ts 的種子化方式
    this.holeRng = createRng((seed ^ 0x9e3779b9) >>> 0);
    for (const id of this.playerIds) {
      // 鐵則 1：每盤同一 seed
      this.games.set(id, new TetrisGame({ seed }));
      this.incoming.set(id, 0);
    }
  }

  input(id: string, action: InputAction): void {
    if (this.phase !== 'playing') return;
    if (this.placements.has(id)) return; // 已淘汰／已定名次者不接收輸入
    const game = this.games.get(id);
    if (!game) return;
    game.input(action);
  }

  pendingGarbage(id: string): number {
    return this.incoming.get(id) ?? 0;
  }

  drainEvents(): FfaMatchEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  getPlayerState(id: string): GameState {
    const game = this.games.get(id);
    if (!game) throw new Error(`unknown player: ${id}`);
    return game.getState();
  }

  /** 仍存活（尚未定名次）的玩家 id，依 playerIds 原始順序。 */
  aliveIds(): string[] {
    return this.playerIds.filter((id) => !this.placements.has(id));
  }

  getPlacement(): Map<string, number> {
    return new Map(this.placements);
  }

  /** 名次 1..N 的 id 陣列（placement 1 = 冠軍）。 */
  getStandings(): string[] {
    return [...this.placements.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([id]) => id);
  }

  private holeCol(): number {
    return Math.floor(this.holeRng() * BOARD_WIDTH);
  }

  /** 處理某盤本幀事件：lock 傾倒垃圾、lineClear 攻擊路由、topout 名次。 */
  private process(id: string): void {
    if (this.phase !== 'playing') return;
    if (this.placements.has(id)) return;
    const game = this.games.get(id);
    if (!game) return;
    const evs = game.drainEvents();
    let lockOpen = false; // 有一個尚未結算傾倒的 lock
    let lockCleared = false; // 該 lock 是否消行

    const resolveLock = (): void => {
      if (lockOpen && !lockCleared && this.phase === 'playing') {
        const pending = this.incoming.get(id) ?? 0;
        if (pending > 0) {
          this.incoming.set(id, 0);
          game.receiveGarbage(pending, this.holeCol());
          this.events.push({ kind: 'garbageIn', id, amount: pending });
        }
      }
      lockOpen = false;
      lockCleared = false;
    };

    for (const ev of evs) {
      if (ev.kind === 'lock') {
        resolveLock(); // 結算前一個 lock（單 step 多次鎖定時才會發生）
        this.events.push({ kind: 'lock', id, piece: ev.piece });
        lockOpen = true;
        lockCleared = false;
      } else if (ev.kind === 'lineClear') {
        lockCleared = true;
        this.events.push({
          kind: 'lineClear', id, rows: ev.rows, count: ev.count,
          tSpin: ev.tSpin, combo: ev.combo, b2b: ev.b2b,
        });
        const out = computeAttack({ count: ev.count, tSpin: ev.tSpin, combo: ev.combo, b2b: ev.b2b });
        const pending = this.incoming.get(id) ?? 0;
        const res = cancelGarbage(pending, out);
        this.incoming.set(id, res.incoming);
        if (res.sent > 0) {
          // 鐵則 2：種子化 targetRng 選一名存活對手
          const target = this.routing.pickTarget(id, this.aliveIds(), this.targetRng);
          if (target) {
            this.incoming.set(target, (this.incoming.get(target) ?? 0) + res.sent);
            this.events.push({ kind: 'attack', from: id, to: target, amount: res.sent });
          }
        }
      } else if (ev.kind === 'topout') {
        lockOpen = false; // 頂出不傾倒
        this.eliminate(id);
        return; // 此盤已定名次，後續事件不再處理
      }
    }
    resolveLock(); // 結算最後一個 lock
  }

  /**
   * 中離判敗淘汰（確定性）：走與 topout 相同的淘汰路徑，
   * 但 ko 事件帶 reason='forfeit'。非 playing、未知 id、已定名次者 → no-op。
   */
  forfeit(id: string): void {
    if (this.phase !== 'playing') return;
    if (!this.games.has(id)) return; // 未知 id
    if (this.placements.has(id)) return; // 已淘汰／已定名次
    this.eliminate(id, 'forfeit');
  }

  /** 淘汰一名玩家：placement = 目前存活人數（含自己）；若僅剩 1 人則對方奪冠。 */
  private eliminate(id: string, reason?: 'forfeit'): void {
    const aliveCount = this.aliveIds().length; // 含 id 自己
    const placement = aliveCount; // 剩 k 人時第一個倒的得 placement=k
    this.placements.set(id, placement);
    this.events.push(reason ? { kind: 'ko', id, placement, reason } : { kind: 'ko', id, placement });

    const remaining = this.aliveIds();
    if (remaining.length === 1) {
      const champ = remaining[0];
      this.placements.set(champ, 1);
      this.events.push({ kind: 'victory', id: champ });
      this.phase = 'result';
    } else if (remaining.length === 0) {
      // 退化保護：N=1 或同時全倒（理論上不會發生），仍結束
      this.phase = 'result';
    }
  }

  step(dtMs: number): void {
    if (this.phase !== 'playing') return;
    // 先步進所有活躍盤（依 playerIds 固定順序）
    for (const id of this.playerIds) {
      if (this.placements.has(id)) continue;
      this.games.get(id)!.step(dtMs);
    }
    // 再逐盤 process（依 playerIds 固定順序 → 同幀多人 topout 的 tie-break 確定）
    for (const id of this.playerIds) {
      if (this.phase !== 'playing') break;
      this.process(id);
    }
  }
}
