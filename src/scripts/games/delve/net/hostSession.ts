// hostSession.ts — 房主端協調層（M-C Task 6；DOM-free）：NetHost + RoomHost（房號信令）+ NetLoop（注入的 Ticker）。
// C10：RoomHost.poll 跟 host.frame 同一個 loop 驅動（Worker 計時器），房主分頁在背景時客人照樣能加入。
// 時間一律是 loop 傳進來的 nowMs（同 NetHost 的決定性規則）；open / reopenJoin 在第一次 tick 之前呼叫時，join 計時延到那一 tick 才起算。
import type { DelveGame } from '../engine/game';
import { NetHost, type GuestPhase, type VisitStore } from './host';
import { NetLoop, type Ticker } from './loop';
import { LINGER_MS } from './protocol';
import { RoomHost, type SignalApi } from './rtcSignal';
import type { RtcPeer } from './rtcLink';

export interface CoopPlayer { pid: string; nick: string; self: boolean; rttMs: number | null; phase: GuestPhase }
export interface HostSessionDeps {
  signal: SignalApi; makePeer: () => RtcPeer; ticker: Ticker; build: string;
  visits: VisitStore & { worldId: string }; requestSave: () => void; nick: string;
}
export type CoopChange = { type: 'join' | 'leave'; nick: string };

export class CoopHostSession {
  private readonly game: DelveGame;
  private readonly deps: HostSessionDeps;
  private readonly host: NetHost;
  private readonly rooms: RoomHost;
  private readonly loop: NetLoop;
  /** 最後一次 tick 的時間（null = 還沒 tick 過） */
  private now: number | null = null;
  /** true = 下一次 tick 用那時的時間重新起算 join 計時（RoomHost.reopen） */
  private stampJoin = false;
  /** 曾經 live 的客人（pid|charId → nick）：onChange 的 join / leave 依它比對 */
  private live = new Map<string, string>();
  private readonly cbs: ((e: CoopChange) => void)[] = [];
  private opening: Promise<string> | null = null;
  private closing: { until: number | null; done: Promise<void>; resolve: () => void } | null = null;

  constructor(game: DelveGame, deps: HostSessionDeps) {
    this.game = game;
    this.deps = deps;
    this.host = new NetHost(game, { build: deps.build, worldId: deps.visits.worldId, visits: deps.visits, requestSave: deps.requestSave });
    this.rooms = new RoomHost(deps.signal, deps.makePeer, (link) => this.host.accept(link));
    this.loop = new NetLoop(deps.ticker, (t, s) => this.tick(t, s));
  }

  /** NetHost.open → loop 開跑 → 拿房號（重複呼叫回同一個）；close 已經開始就丟錯 */
  open(): Promise<string> {
    if (this.closing) return Promise.reject(new Error('coop host closed'));
    this.opening ??= this.start();
    return this.opening;
  }

  get room(): string | null { return this.rooms.room; }
  get joining(): boolean { return this.rooms.joining; }

  /** 停止加入之後（閒置 10 分鐘）重新開放 */
  reopenJoin(): void {
    if (this.closing) return;
    if (this.now === null) this.stampJoin = true;
    else this.rooms.reopen(this.now);
  }

  /** 自己排第一；客人依加入順序（hello 階段的 pid / nick 還是空字串） */
  players(): CoopPlayer[] {
    const me: CoopPlayer = { pid: this.game.localPid, nick: this.deps.nick, self: true, rttMs: null, phase: 'live' };
    return [me, ...this.host.guests().map((g): CoopPlayer => ({ pid: g.pid, nick: g.nick, self: false, rttMs: g.rttMs, phase: g.phase }))];
  }

  /** 客人第一次到 live = join；曾經 live 的客人從名單消失 = leave（關房時不發） */
  onChange(cb: (e: CoopChange) => void): void { this.cbs.push(cb); }

  /**
   * 停止加入 → host.close()（每位客人最後的 chk + bye，mode 回 solo）→ loop 再跑 LINGER_MS 讓延遲關閉與 chkAck 走完 → stop。
   * 還沒 tick 過（loop 沒在跑）就直接停。
   */
  close(): Promise<void> {
    if (this.closing) return this.closing.done;
    let resolve!: () => void;
    const done = new Promise<void>((r) => { resolve = r; });
    this.closing = { until: this.now === null ? null : this.now + LINGER_MS, done, resolve };
    this.rooms.close();
    this.host.close();
    this.game.mode = 'solo';   // 從沒 open 過的 NetHost.close 不會改 mode
    this.live.clear();
    if (this.closing.until === null || !this.loop.running) this.finish();
    return done;
  }

  private async start(): Promise<string> {
    this.host.open();
    this.loop.start();
    let code: string;
    // 拿房號失敗（網路）：可以再呼叫 open 重試；放棄就 close() 讓 mode 回 solo
    try { code = await this.rooms.open(this.now ?? 0); } catch (e) { this.opening = null; throw e; }
    if (this.closing) { this.rooms.close(); throw new Error('coop host closed'); }   // 等房號時就關了
    if (this.now === null) this.stampJoin = true;
    return code;
  }

  private tick(t: number, steps: number): void {
    this.now = t;
    if (this.closing) {
      this.host.frame(t, 0);   // 關房後 frame 只處理延遲關閉（不跑模擬）
      if (this.closing.until === null || t >= this.closing.until) this.finish();
      return;
    }
    if (this.stampJoin) { this.stampJoin = false; this.rooms.reopen(t); }
    this.host.frame(t, steps);
    this.rooms.poll(t);
    this.diffPlayers();
  }

  private finish(): void {
    this.loop.stop();
    this.closing?.resolve();
  }

  private diffPlayers(): void {
    const seen = new Set<string>();
    for (const g of this.host.guests()) {
      const key = `${g.pid}|${g.charId}`;
      seen.add(key);
      if (g.phase !== 'live' || this.live.has(key)) continue;
      this.live.set(key, g.nick);
      this.emit({ type: 'join', nick: g.nick });
    }
    for (const [key, nick] of [...this.live]) {
      if (seen.has(key)) continue;
      this.live.delete(key);
      this.emit({ type: 'leave', nick });
    }
  }

  private emit(e: CoopChange): void {
    for (const cb of this.cbs.slice()) { try { cb(e); } catch { /* UI 的錯不能打斷 loop */ } }
  }
}
