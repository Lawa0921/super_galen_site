// guestSession.ts — 客人端協調層（M-C Task 6；DOM-free）：joinRoom（房號信令）→ NetGuest + NetLoop（注入的 Ticker）+ 角色存檔。
// C4：savedAt 由這裡（寫 IDB 的一端）蓋 now()。C1：chk 寫好才 ack（NetGuest 等 persist 的 promise）；
//   結束時還有跨邊界操作沒被 chk 涵蓋（unconfirmed）→ 最後一份 chk 再存一次並標 pendingWorld = 那個世界。
// Task 1 合約：收到 reject / bye 之後由房主在 LINGER_MS 後關連線；房主沒關（分頁直接沒了）就由這裡在 LINGER_MS + 1000 後自己關。
// loop 跑到連線關掉、而且排著的 persist 都完成才停。leave() 另有主執行緒的保險（LEAVE_SAFETY_MS）：ticker 死掉或 IDB 卡住也一定結束。
import type { DelveGame } from '../engine/game';
import type { DelveCharacter } from '../save/character';
import type { NetLink } from './link';
import { NetGuest, END_TEXT, LEAVE_GRACE_MS, type GuestState, type PeerView } from './guest';
import { NetLoop, type Ticker } from './loop';
import { LINGER_MS } from './protocol';
import { JoinError, joinRoom, type SignalApi } from './rtcSignal';
import type { RtcPeer } from './rtcLink';

export type CoopGuestPhase = 'signaling' | GuestState | 'failed';
export interface GuestSessionDeps {
  signal: SignalApi; makePeer: () => RtcPeer; ticker: Ticker; build: string; character: DelveCharacter;
  /** 寫角色檔；pendingWorld = null 會清掉記錄上的標記 */
  persist: (c: DelveCharacter, pendingWorld: string | null) => Promise<void>;
  /** savedAt 與 joinRoom 等 ack 的逾時用；預設 Date.now */
  now?: () => number;
  /** 只給測試：joinRoom 等 ack 之間的 sleep（預設真的計時器） */
  sleep?: (ms: number) => Promise<void>;
}

/** 收到 reject / bye 後房主該在 LINGER_MS 關連線；多等這麼久還開著就自己關 */
const HOST_CLOSE_SLACK_MS = 1000;
/** leave 後 NetGuest 最晚 LEAVE_GRACE_MS 自己關；多等這麼久還開著就由這裡關 */
const LEAVE_SLACK_MS = 500;
/** leave() 最晚這麼久（主執行緒牆鐘）一定結束：關連線、停 loop、resolve（卡住的 persist 不再等） */
export const LEAVE_SAFETY_MS = LINGER_MS * 3;

export class CoopGuestSession {
  private readonly deps: GuestSessionDeps;
  private readonly now: () => number;
  private ph: CoopGuestPhase = 'signaling';
  private guest: NetGuest | null = null;
  private link: NetLink | null = null;
  private loop: NetLoop | null = null;
  private readonly cbs: ((p: CoopGuestPhase) => void)[] = [];
  private started = false;
  /** leave() 呼叫過（還在信令中 = 取消；之後 = NetGuest.leave） */
  private left = false;
  /** 取消加入時的結束文案（沒有 NetGuest 可問） */
  private text: string | null = null;
  /** 第一次看到 ended 的 loop 時間 */
  private endedAt: number | null = null;
  private finalChecked = false;
  /** persist 串成一條：舊的 chk 不會因為壓縮比較慢而晚寫、蓋掉新的；inflight = 還沒完成的筆數 */
  private chain: Promise<void> = Promise.resolve();
  private inflight = 0;
  private resolveDone!: () => void;
  private safety: ReturnType<typeof setTimeout> | null = null;
  private finished = false;
  private readonly done = new Promise<void>((r) => { this.resolveDone = r; });

  constructor(deps: GuestSessionDeps) {
    this.deps = deps;
    this.now = deps.now ?? Date.now;
  }

  /** 信令 → NetGuest → loop 開跑。失敗 reject JoinError、phase = 'failed'；之後 phase 跟著 NetGuest.state */
  async join(room: string): Promise<void> {
    if (this.started) throw new Error('coop guest: join called twice');
    this.started = true;
    this.setPhase('signaling');
    let link: NetLink;
    try {
      link = await joinRoom(this.deps.signal, this.deps.makePeer, room, { sleep: this.deps.sleep, now: this.deps.now });
    } catch (e) {
      this.setPhase('failed');
      this.finish();
      throw e instanceof JoinError ? e : new JoinError('rtc');
    }
    if (this.left) {   // 信令途中按了離開
      link.close('leave');
      this.text = END_TEXT.leave;
      this.setPhase('ended');
      this.finish();
      return;
    }
    this.link = link;
    this.guest = new NetGuest(link, {
      build: this.deps.build, character: this.deps.character,
      onCheckpoint: (c) => this.save(c, null),
    });
    this.loop = new NetLoop(this.deps.ticker, (t, s) => this.tick(t, s));
    this.loop.start();
    this.syncPhase();
  }

  get phase(): CoopGuestPhase { return this.ph; }
  get game(): DelveGame | null { return this.guest?.game ?? null; }
  get endText(): string | null { return this.guest?.endText ?? this.text; }
  get worldId(): string | null { return this.guest?.worldId ?? null; }
  get rttMs(): number | null { return this.guest?.rttMs ?? null; }
  peers(): PeerView[] { return this.guest?.peers() ?? []; }

  onPhase(cb: (p: CoopGuestPhase) => void): void { this.cbs.push(cb); }

  /** guest.leave()；resolve = loop 停了（連線關掉、最後的 chk 寫好；最晚 LEAVE_GRACE_MS + 500 ms 自己關連線） */
  leave(): Promise<void> {
    if (!this.started) return Promise.resolve();
    const g = this.guest;
    if (!g) {
      if (this.ph === 'signaling') this.left = true;   // join 拿到連線後馬上關
      return this.done;
    }
    if (!this.left && g.state !== 'ended') {
      this.left = true;
      g.leave();
      this.syncPhase();
    }
    if (!this.finished) this.safety ??= setTimeout(() => this.finish(), LEAVE_SAFETY_MS);
    return this.done;
  }

  private tick(t: number, steps: number): void {
    const g = this.guest, link = this.link;
    if (!g || !link) return;
    g.frame(t, steps);
    this.syncPhase();
    if (g.state !== 'ended') return;
    this.endedAt ??= t;
    // 被房主結束（reject / bye / 斷線）：之後不會再有 chk，現在就判斷；自己 leave：等最後的 chk（連線關掉）再判斷
    if (!this.left) this.checkFinal(g);
    const wait = this.left ? LEAVE_GRACE_MS + LEAVE_SLACK_MS : LINGER_MS + HOST_CLOSE_SLACK_MS;
    if (link.open && t - this.endedAt >= wait) link.close(this.left ? 'leave' : 'ended');
    if (link.open) return;
    this.checkFinal(g);
    if (this.inflight > 0) return;
    this.finish();
  }

  /** 停 loop、resolve；連線還開著就關（保險觸發時） */
  private finish(): void {
    this.finished = true;
    if (this.safety !== null) { clearTimeout(this.safety); this.safety = null; }
    if (this.link?.open) this.link.close(this.left ? 'leave' : 'ended');
    this.loop?.stop();
    this.resolveDone();
  }

  /** C1：結束時 unconfirmed → 最後一份 chk 標 pendingWorld 再存（只做一次） */
  private checkFinal(g: NetGuest): void {
    if (this.finalChecked) return;
    this.finalChecked = true;
    const chk = g.lastCheckpoint, world = g.worldId;
    if (g.unconfirmed && chk && world) this.save(chk.character, world).catch(() => { /* 寫不進去：沒有別的辦法 */ });
  }

  /** savedAt 在真正寫的時候蓋（C4）；回傳這一筆的 promise（NetGuest 等它才 ack） */
  private save(c: DelveCharacter, pendingWorld: string | null): Promise<void> {
    this.inflight++;
    const p = this.chain.then(() => this.deps.persist({ ...c, savedAt: this.now() }, pendingWorld));
    this.chain = p.then(() => undefined, () => undefined).then(() => { this.inflight--; });
    return p;
  }

  private syncPhase(): void {
    if (this.guest) this.setPhase(this.guest.state);
  }

  private setPhase(p: CoopGuestPhase): void {
    if (p === this.ph) return;
    this.ph = p;
    for (const cb of this.cbs.slice()) { try { cb(p); } catch { /* UI 的錯不能打斷 loop */ } }
  }
}
