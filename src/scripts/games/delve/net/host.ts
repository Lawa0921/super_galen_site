// host.ts — 房主端協定狀態機（co-op M-B3；spec §5.2–5.7；建造者決定 C6–C10、C14）。
//   握手（hello → welcome + bulk snap → ready）、回覆 sum（整欄 col）、每位客人的 fanout（tiles／liq／ev／pub／teleport／knock）、
//   ws／char／chk／world／look 的計時送出、cmd 權杖桶與 ack、ps 檢查、逾時與 PS_STALE_MS、離線時寫回 visit 與 held。
// M-C C1：chk 帶 upTo（處理到這位客人的第幾個 cmd seq）。每送一份 chk 就把它寫成 held（送出但還沒 ack 的最新一份），
//   客人寫好 checkpoint 回 chkAck，rev ≥ held.rev 就清掉 held；房主重新載入世界後，客人重進時 held 較新就用它。
// 客人送來的一切都是不可信輸入：先過 validate.ts，不合法就丟掉，絕不拋例外到 frame 之外。
// 決定性：不讀時鐘、不用 Math.random；時間一律是 frame(nowMs, …) 傳進來的值。送出的角色 savedAt 一律 0（寫檔的人自己蓋時間）。
//   唯一例外：held.at 是牆鐘（Date.now，同 removeActor 的 lastSeen），只給世界檔的 LRU 用，不影響協定。
import type { DelveGame, DelveEvent } from '../engine/game';
import type { Pid } from '../engine/actor';
import type { CmdOp } from '../engine/commands';
import type { DollLook } from '../engine/doll';
import { GEN_VERSION, TILE_SIZE } from '../engine/constants';
import { OUTER_GEN_VERSION } from '../engine/chunkgen/index';
import { chunkOfX } from '../engine/coords';
import { LOAD_COLS } from '../engine/streaming';
import { validateCharacterStrict, type DelveCharacter } from '../save/character';
import type { HeldChar, VisitSave } from '../save/worldSave';
import type { Channel, NetLink, Payload } from './link';
import {
  BOUNDARY_OPS, BULK_HIGH_WATER, CHAR_HZ, CHK_MS, CMD_BURST, CMD_RATE, GUEST_TIMEOUT_MS, LIQ_HZ, LINGER_MS, LOOK_MS, MAX_GUESTS, NET_TILE_COLS, PING_MS, PROTO,
  PS_BOAT, PS_CLIMB, PS_GROUND, PS_STALE_MS, REPLACE_SILENT_MS, SAVE_DEBOUNCE_MS, SUM_PARK_MAX, WORLD_SIG_MS, WS_HZ,
  type ByeReason, type GuestCtrl, type HostCtrl, type PeerInfo, type Ps, type RejectReason, type WireBatch, type Ws,
  type WsDrop, type WsEnemy, type WsNpc, type WsPlayer, type WsProj, encodePose,
} from './protocol';
import { encodeBulk } from './codec';
import { parseGuestCtrl, parsePs } from './validate';
import { answerSum, chunkMessage, encodeLiq, wireBatch } from './chunkSync';
import { checkMove } from './motion';
import { snapshotWorld, worldSig } from './snapshot';

/** 世界檔裡各角色的 visit 與 held（正式版是 SplitSession，下一次存世界時寫進世界檔；C1） */
export interface VisitStore {
  get(charId: string): VisitSave | undefined; put(charId: string, v: VisitSave): void;
  /** 離線客人房主最後那份角色（rev = checkpoint rev）；null = 清掉 */
  getHeld(charId: string): HeldChar | undefined; putHeld(charId: string, h: HeldChar | null): void;
}
export interface NetHostOptions {
  build: string; worldId: string; visits: VisitStore;
  /** 跨邊界操作後 SAVE_DEBOUNCE_MS 防抖（spec §5.7） */
  requestSave?: () => void;
  /** 預設 MAX_GUESTS */
  maxGuests?: number;
  /** 房主自己的暱稱（客人名單、名牌）；沒給 → 「房主」 */
  nick?: string;
}
export type GuestPhase = 'hello' | 'syncing' | 'live';
export interface GuestInfo { pid: Pid; charId: string; nick: string; phase: GuestPhase; silentMs: number; rttMs: number | null; ackedRev: number }

type BulkJob = { k: 'sum'; cx: number; sums: number[] } | { k: 'chunk'; key: number };

/** 一條客人連線（hello 之前沒有 pid / actor） */
interface Guest {
  link: NetLink;
  /** false = 已移除 / 已拒絕：之後的訊息一律不理 */
  alive: boolean;
  phase: GuestPhase;
  pid: Pid; charId: string; nick: string;
  /** 最後一次收到任何訊息的房主時間（null = 還沒有第一幀） */
  heardAt: number | null;
  // ── 有 actor 之後 ──
  /** 加入時的 teleSeq（上線的 tseq = teleSeq − teleBase，客人從 0 起算） */
  teleBase: number; teleSeen: number; knockSeen: number;
  psSeq: number; psAt: number; released: boolean;
  /** 上一筆被接受的位置（checkMove 的 prev）與它的房主時間 */
  prev: { x: number; y: number; at: number };
  tokens: number; tokenAt: number;
  /** checkpoint rev（C9）：從 hello 角色的 rev 起算，每送一次 chk +1 */
  charRev: number; charSig: string; nextChk: number; chkNow: boolean;
  /** 處理過的最大 cmd seq（chk.upTo）；客人 chkAck 過的最大 rev（C1） */
  lastCmdSeq: number; ackedRev: number;
  /** 加入時用了 held（比客人 hello 帶來的新）：ready 時馬上送 chk，讓客人把房主這份寫進去 */
  chkOnLive: boolean;
  tiles: WireBatch[]; ev: DelveEvent[]; pub: DelveEvent[];
  /** bulk 待送（依序）；chunk 去重 */
  jobs: BulkJob[]; chunkQ: Set<number>; liq: Set<number>;
  /** 興趣範圍外的 sum（cx → sums，Map 順序 = 新舊）：走近才回；太遠或超過 SUM_PARK_MAX 就丟 */
  parkedSums: Map<number, number[]>;
  /** ping：下次送出時間與最近一次 pong 算出的 RTT */
  nextPing: number; rttMs: number | null;
  /** true = 已移出名單、連線留在 lingerQ 等 LINGER_MS 後關（期間只處理 pong 與 chkAck） */
  lingering: boolean;
}

type Inbox = { g: Guest; ch: Channel; data: Payload } | { g: Guest; close: true };
/** 延遲關閉中的連線：到 at 才 close */
interface Linger { g: Guest; at: number }
type Timer = 'ws' | 'liq' | 'char' | 'world' | 'look';
const PERIOD: Record<Timer, number> = { ws: 1000 / WS_HZ, liq: 1000 / LIQ_HZ, char: 1000 / CHAR_HZ, world: WORLD_SIG_MS, look: LOOK_MS };

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object';
/** 送出的角色：rev 換成 checkpoint rev、savedAt 歸 0（決定性） */
const stamp = (c: DelveCharacter, rev: number): DelveCharacter => ({ ...c, rev, savedAt: 0 });
/**
 * char 的變動比較鍵（C10）：buff 剩餘秒數每一步都在減，直接比 JSON 會讓 char 在 buff 生效期間每 200 ms 送一次。
 * 改比 buff 的到期時間（time + 剩餘，四捨五入到整秒：buff 延長 / 新增才算變動）、undyingCd 取整秒（倒數中每秒至多一次）。
 * 送出的角色本身不變（剩餘秒數照舊精確）；客人套角色時用自己的時鐘換回到期時間。
 */
function charKey(c: DelveCharacter, time: number): string {
  const until: Record<string, number> = {};
  for (const [k, left] of Object.entries(c.buffsLeft)) if (typeof left === 'number') until[k] = Math.round(time + left);
  return JSON.stringify({ ...c, buffsLeft: until, undyingCd: Math.ceil(c.undyingCd) });
}

/** ack 的 ok / reason：結果不是 false / null / { ok: false } 就算成功；learnSkill 例外（null = 成功、字串 = 失敗原因） */
function ackOf(op: CmdOp, res: unknown): { ok: boolean; reason?: string } {
  if (op === 'learnSkill') return res === null ? { ok: true } : { ok: false, ...(typeof res === 'string' ? { reason: res } : {}) };
  const ok = !(res === false || res === null || (isObj(res) && res.ok === false));
  const reason = isObj(res) && typeof res.reason === 'string' ? res.reason : undefined;
  return reason === undefined ? { ok } : { ok, reason };
}

export class NetHost {
  private readonly game: DelveGame;
  private readonly opts: NetHostOptions;
  private readonly maxGuests: number;
  private list: Guest[] = [];
  private inbox: Inbox[] = [];
  /** reject / 送了 bye 或最後 chk 的 remove 之後等 LINGER_MS 才關連線；lingerIn = 這些連線期間送來的訊息（只理 pong 與 chkAck） */
  private lingerQ: Linger[] = [];
  private lingerIn: { g: Guest; ch: Channel; data: Payload }[] = [];
  private readonly lookKeys = new Map<Pid, string>();
  private readonly next: Record<Timer, number> = { ws: -Infinity, liq: -Infinity, char: -Infinity, world: -Infinity, look: -Infinity };
  private sig = 0;
  private saveAt: number | null = null;
  private now = 0;
  private opened = false;
  private closed = false;

  constructor(game: DelveGame, opts: NetHostOptions) {
    this.game = game;
    this.opts = opts;
    this.maxGuests = Math.max(0, Math.floor(opts.maxGuests ?? MAX_GUESTS));
  }

  /** 開房：mode = 'host'；drain 一次日誌與 netLiquid 當基準（進場清單 B4） */
  open(): void {
    if (this.opened) return;
    const g = this.game;
    g.mode = 'host';
    g.world.edits.drain();
    g.world.drainNetLiquid();
    this.sig = worldSig(snapshotWorld(g, null));
    this.lookKeys.set(g.localPid, this.lookOf(g.localPid).key);
    this.opened = true;
  }

  /** 新連線：等 hello。onMessage / onClose 只排進收件匣（C2），frame 開頭依到達順序處理 */
  accept(link: NetLink): void {
    const g: Guest = {
      link, alive: true, phase: 'hello', pid: '', charId: '', nick: '', heardAt: this.opened ? this.now : null,
      teleBase: 0, teleSeen: 0, knockSeen: 0, psSeq: -1, psAt: 0, released: false, prev: { x: 0, y: 0, at: 0 },
      tokens: CMD_BURST, tokenAt: 0, charRev: 0, charSig: '', nextChk: 0, chkNow: false, lastCmdSeq: 0, ackedRev: 0, chkOnLive: false,
      tiles: [], ev: [], pub: [], jobs: [], chunkQ: new Set(), liq: new Set(),
      parkedSums: new Map(), nextPing: 0, rttMs: null, lingering: false,
    };
    link.onMessage((ch, data) => {
      if (g.alive) this.inbox.push({ g, ch, data });
      else if (g.lingering) this.lingerIn.push({ g, ch, data });
    });
    link.onClose(() => { if (g.alive) this.inbox.push({ g, close: true }); });
    if (!this.opened || this.closed) { this.reject(g, 'closed'); return; }
    this.list.push(g);
  }

  frame(nowMs: number, steps: number): void {
    this.now = nowMs;
    this.sweepLinger();
    if (!this.opened || this.closed) return;
    for (const g of this.list) if (g.heardAt === null) g.heardAt = nowMs;
    // ① 收件匣
    const inbox = this.inbox;
    this.inbox = [];
    for (const it of inbox) {
      if (!it.g.alive) continue;
      if ('close' in it) { this.remove(it.g, null); continue; }
      it.g.heardAt = nowMs;
      try { this.handle(it.g, it.ch, it.data); } catch { /* 不可信輸入：丟掉該則，不拋到迴圈外 */ }
    }
    // ② 固定步 + fanout
    for (let i = 0; i < steps; i++) {
      this.game.step();
      this.fanout();
    }
    this.watchActors();
    // ③ 依計時送
    this.flush();
    // ④ 逾時與 PS_STALE_MS
    for (const g of [...this.list]) {
      if (!g.alive) continue;
      if (nowMs - (g.heardAt ?? nowMs) > GUEST_TIMEOUT_MS) { this.remove(g, 'timeout'); continue; }
      if (g.phase !== 'hello' && !g.released && nowMs - g.psAt > PS_STALE_MS) {
        const inp = this.game.input(g.pid);
        inp.mining = false;
        inp.use = false;
        // 沒有新的回報：攀邊的姿勢也收掉（不會一直卡在攀邊的樣子）
        const a = this.game.actors.get(g.pid);
        if (a?.remote) a.remote.mantle = null;
        g.released = true;
      }
    }
  }

  /** 關房：每位客人最後的 chk + bye closed，移除 actor，mode 回 'solo' */
  close(): void {
    if (!this.opened || this.closed) return;
    let removed = false;
    for (const g of [...this.list]) {
      if (g.phase !== 'hello') removed = true;
      this.remove(g, 'closed');
    }
    this.inbox = [];
    this.closed = true;
    this.game.mode = 'solo';
    if (removed || this.saveAt !== null) { this.saveAt = null; this.opts.requestSave?.(); }
  }

  guests(): GuestInfo[] {
    return this.list.map((g) => ({
      pid: g.pid, charId: g.charId, nick: g.nick, phase: g.phase,
      silentMs: g.heardAt === null ? 0 : Math.max(0, this.now - g.heardAt), rttMs: g.rttMs, ackedRev: g.ackedRev,
    }));
  }

  /** 還在等延遲關閉的連線數 */
  get lingering(): number { return this.lingerQ.length; }

  /** 延遲關閉中的連線現在全部關掉（關房的保險：loop 不再 tick 時不留半開的連線） */
  closeLingering(): void {
    const q = this.lingerQ;
    this.lingerQ = [];
    this.lingerIn = [];
    for (const l of q) { l.g.lingering = false; if (l.g.link.open) l.g.link.close('linger'); }
  }

  /** 只給測試：客人 pid 目前停放的遠方 sum 的 cx（舊到新） */
  debugParked(pid: Pid): number[] {
    const g = this.list.find((o) => o.alive && o.pid === pid);
    return g ? [...g.parkedSums.keys()] : [];
  }

  // ── 收訊 ──────────────────────────────────────────
  private handle(g: Guest, ch: Channel, data: Payload): void {
    if (ch === 'state') { if (g.phase !== 'hello') this.onPs(g, parsePs(data)); return; }
    if (ch !== 'ctrl') return;                                                // 客人不該送 bulk
    const w = this.game.world;
    const m = parseGuestCtrl(data, w.chunksY, { lo: chunkOfX(w.xMin), hi: chunkOfX(w.xMax - 1) });
    if (!m) return;
    if (m.t === 'hello') { if (g.phase === 'hello') this.onHello(g, m); return; }
    if (g.phase === 'hello') return;                                          // 還沒加入：只收 hello
    switch (m.t) {
      case 'ready': if (g.phase === 'syncing') { g.phase = 'live'; if (g.chkOnLive) { g.chkOnLive = false; g.chkNow = true; } } return;
      case 'sum': this.onSum(g, m.cx, m.sums); return;
      case 'ping': this.sendCtrl(g, { t: 'pong', at: m.at }); return;
      case 'pong': g.rttMs = Math.max(0, this.now - m.at); return;
      case 'cmd': this.onCmd(g, m); return;
      case 'chkAck': this.onChkAck(g, m.rev); return;
      case 'bye': this.remove(g, null); return;
    }
  }

  private onHello(g: Guest, m: Extract<GuestCtrl, { t: 'hello' }>): void {
    const game = this.game;
    if (m.proto !== PROTO || m.build !== this.opts.build) { this.reject(g, 'proto'); return; }
    let character: DelveCharacter;
    try { character = validateCharacterStrict(m.character); } catch { this.reject(g, 'char'); return; }
    if (character.id !== m.charId) { this.reject(g, 'char'); return; }
    // 同 charId 的舊連線沉默太久 → 新連線取代（RTC 常常沒及時報斷線，所以不等 GUEST_TIMEOUT_MS）。
    // 放在 proto / 角色檔驗證之後：不合法的 hello 不能趕走合法的舊客人；移除後它不再佔名額，才輪到 full 判斷
    const dup = this.list.find((o) => o !== g && o.alive && o.phase !== 'hello' && o.charId === m.charId);
    if (dup && this.now - (dup.heardAt ?? this.now) > REPLACE_SILENT_MS) this.remove(dup, 'timeout');
    if (this.list.filter((o) => o.alive && o.phase !== 'hello').length >= this.maxGuests) { this.reject(g, 'full'); return; }
    if (this.list.some((o) => o !== g && o.alive && o.phase !== 'hello' && o.charId === m.charId)) { this.reject(g, 'charInUse'); return; }
    // C1：held（世界檔裡房主最後那份）與 hello 帶來的取 rev 較大的
    const kept = this.opts.visits.getHeld(m.charId);
    const useHeld = !!kept && kept.rev > character.rev;
    if (kept && useHeld) character = kept.character;
    let pid: Pid | null = null;
    for (let i = 1; i <= this.maxGuests && !pid; i++) if (!game.actors.has(`p${i}`)) pid = `p${i}`;
    if (!pid) { this.reject(g, 'full'); return; }
    try { game.addActor(pid, character, null, this.opts.visits.get(m.charId)); } catch { this.reject(g, 'char'); return; }
    // 用了 held：先不清（客人存著的還是斷線前那份）；上線時的 chk 會蓋成更新的 rev，它的 ack 才清掉。
    // 沒用（hello 較新）：held 已經過時，清掉
    if (kept && !useHeld) { this.opts.visits.putHeld(m.charId, null); this.saveSoon(); }
    const a = game.actors.get(pid)!, now = this.now;
    Object.assign(g, {
      phase: 'syncing', pid, charId: m.charId, nick: m.nick,
      teleBase: a.teleSeq, teleSeen: a.teleSeq, knockSeen: a.knockSeq,
      psSeq: -1, psAt: now, released: false, prev: { x: a.player.x, y: a.player.y, at: now },
      tokens: CMD_BURST, tokenAt: now, charRev: character.rev, nextChk: now + CHK_MS, chkNow: false, nextPing: now,
      chkOnLive: useHeld,
    } satisfies Partial<Guest>);
    // 空字串：第一個 char 計時一到就送（房主可能改用 held 那份較新的角色，客人手上只有 hello 那份）
    g.charSig = '';
    const players: PeerInfo[] = [];
    for (const p of game.actors.keys()) if (p !== pid) players.push({ pid: p, nick: this.nickOf(p), look: this.lookOf(p).look });
    const w = game.world;
    this.sendCtrl(g, {
      t: 'welcome', pid, worldId: this.opts.worldId, seed: game.seed, genVersion: GEN_VERSION, outerGenVersion: OUTER_GEN_VERSION,
      bounds: w.bounds, w: w.width, h: w.height, time: game.time, tick: game.tick, peaceful: game.peaceful,
      you: { x: a.player.x, y: a.player.y }, players,
    });
    g.link.send('bulk', encodeBulk({ t: 'snap', snap: snapshotWorld(game, game.visitOf(pid, 0)) }));
    const look = this.lookOf(pid);
    this.lookKeys.set(pid, look.key);
    this.broadcast({ t: 'look', pid, nick: g.nick, look: look.look }, g);
  }

  /** sum：興趣範圍內照舊依序回；範圍外先停放，走近才回；超過 2 倍範圍直接丟。每個 cx 只留最新一筆（排著的、停放的都算） */
  private onSum(g: Guest, cx: number, sums: number[]): void {
    const d = Math.abs(cx - this.colOf(g.pid));
    g.parkedSums.delete(cx);                                                  // 先 delete 再 set：排到最新
    if (d <= NET_TILE_COLS) { this.queueSum(g, cx, sums); return; }
    g.jobs = g.jobs.filter((j) => !(j.k === 'sum' && j.cx === cx));          // 排著的舊 sums 作廢
    if (d > 2 * NET_TILE_COLS) return;
    g.parkedSums.set(cx, sums);
    while (g.parkedSums.size > SUM_PARK_MAX) g.parkedSums.delete(g.parkedSums.keys().next().value!);
  }

  /** 排進 jobs；同 cx 已排著的 sum 就換掉它的 sums（保留位置） */
  private queueSum(g: Guest, cx: number, sums: number[]): void {
    const job = g.jobs.find((j) => j.k === 'sum' && j.cx === cx);
    if (job && job.k === 'sum') job.sums = sums; else g.jobs.push({ k: 'sum', cx, sums });
  }

  private onCmd(g: Guest, m: Extract<GuestCtrl, { t: 'cmd' }>): void {
    const now = this.now;
    // 被權杖桶擋下的也算「處理過」：它沒執行，下一份 chk 照樣反映它的（無）效果
    g.lastCmdSeq = Math.max(g.lastCmdSeq, m.seq);
    g.tokens = Math.min(CMD_BURST, g.tokens + Math.max(0, now - g.tokenAt) * CMD_RATE / 1000);
    g.tokenAt = now;
    if (g.tokens < 1) { this.sendCtrl(g, { t: 'ack', seq: m.seq, ok: false, reason: 'rate' }); return; }
    g.tokens -= 1;
    let r: { ok: boolean; reason?: string };
    try { r = ackOf(m.cmd.op, this.game.exec(g.pid, m.cmd)); } catch { r = { ok: false, reason: 'error' }; }
    this.sendCtrl(g, { t: 'ack', seq: m.seq, ...r });
    if (BOUNDARY_OPS.has(m.cmd.op)) { g.chkNow = true; this.saveSoon(); }
  }

  /** ps：tseq 舊的 / seq 舊的丟；checkMove 通過 → 採用位置與輸入；不通過 → teleSeq++（fanout 送 teleport 拉回） */
  private onPs(g: Guest, ps: Ps | null): void {
    if (!ps) return;
    const a = this.game.actors.get(g.pid);
    if (!a) return;
    // 攀邊姿勢只畫用：這則 ps 沒被採用（傳送後的舊 tseq / 死了 / checkMove 不過）→ 收掉，不會卡在攀邊的樣子
    const dropMantle = (): void => { if (a.remote) a.remote.mantle = null; };
    if (ps.tseq < a.teleSeq - g.teleBase) { dropMantle(); return; }
    if (ps.seq <= g.psSeq) return;
    g.psSeq = ps.seq;
    g.psAt = this.now;
    g.released = false;
    if (a.dead) { dropMantle(); return; }
    const motion = {
      x: ps.x, y: ps.y, vx: ps.vx, vy: ps.vy, facing: ps.facing,
      onGround: (ps.flags & PS_GROUND) !== 0, boating: (ps.flags & PS_BOAT) !== 0, climbing: (ps.flags & PS_CLIMB) !== 0,
      mantle: ps.mt ? { p: ps.mt[0], dir: ps.mt[1], edgeX: ps.mt[2], edgeY: ps.mt[3] } : null,
    };
    const dt = (this.now - g.prev.at) / 1000;
    if (checkMove(g.prev, motion, dt, { w: a.player.w, h: a.player.h }, this.game.env) !== 'ok') { a.teleSeq++; dropMantle(); return; }
    g.prev = { x: ps.x, y: ps.y, at: this.now };
    this.game.setRemoteMotion(g.pid, motion);
    const inp = this.game.input(g.pid);
    inp.aim = { x: ps.aim[0], y: ps.aim[1] };
    inp.selected = ps.slot;
    inp.mining = ps.mine;
    inp.use = ps.use;
  }

  // ── fanout（每步之後）────────────────────────────────
  private fanout(): void {
    const game = this.game, w = game.world;
    const batches = w.edits.drain();
    const liq = w.drainNetLiquid();
    const wired = new Map<number, WireBatch>();
    for (const g of this.list) {
      if (!g.alive || g.phase === 'hello') continue;
      if (g.phase === 'live') {
        const gcx = this.colOf(g.pid);
        for (let i = 0; i < batches.length; i++) {
          const b = batches[i];
          if (Math.abs(w.chunkCoords(b.chunk).cx - gcx) > NET_TILE_COLS) continue;
          let wb = wired.get(i);
          if (!wb) { wb = wireBatch(w, b); wired.set(i, wb); }
          g.tiles.push(wb);
          if (b.full && !g.chunkQ.has(b.chunk)) { g.chunkQ.add(b.chunk); g.jobs.push({ k: 'chunk', key: b.chunk }); }
        }
        for (const k of liq) if (Math.abs(w.chunkCoords(k).cx - gcx) <= NET_TILE_COLS) g.liq.add(k);
      }
      // C7：每位客人各自 drainEvents(pid)：公開 + 他自己的私人事件
      for (const e of game.drainEvents(g.pid)) {
        if (e.pid === g.pid) {
          g.ev.push(e);
          // 撿到有詞條的裝備：本幀送 chk、觸發存世界防抖（C9）
          if (e.type === 'pickup' && e.rarity !== undefined) { g.chkNow = true; this.saveSoon(); }
        } else g.pub.push(e);
      }
    }
    this.watchActors();
  }

  /** teleSeq / knockSeq 變了 → teleport / knock（房主端傳送、重生、拉回、擊退） */
  private watchActors(): void {
    for (const g of this.list) {
      if (!g.alive || g.phase === 'hello') continue;
      const a = this.game.actors.get(g.pid);
      if (!a) continue;
      if (a.teleSeq !== g.teleSeen) {
        g.teleSeen = a.teleSeq;
        const p = a.player;
        g.prev = { x: p.x, y: p.y, at: this.now };
        this.sendCtrl(g, { t: 'teleport', x: p.x, y: p.y, tseq: a.teleSeq - g.teleBase });
      }
      if (a.knockSeq !== g.knockSeen) {
        g.knockSeen = a.knockSeq;
        this.sendCtrl(g, { t: 'knock', vx: a.knockV.vx, vy: a.knockV.vy, dur: Math.max(0, a.knockT) });
      }
    }
  }

  // ── 依計時送（每幀結束）──────────────────────────────
  private flush(): void {
    const game = this.game, w = game.world, now = this.now;
    const due = (k: Timer): boolean => {
      if (now < this.next[k]) return false;
      const n = this.next[k] + PERIOD[k];
      this.next[k] = n > now ? n : now + PERIOD[k];
      return true;
    };
    const sendWs = due('ws'), sendLiq = due('liq'), sendChar = due('char');
    let ws: ReturnType<NetHost['wsParts']> | null = null;
    for (const g of this.list) {
      if (!g.alive || g.phase === 'hello') continue;
      if (g.parkedSums.size) {
        const gcx = this.colOf(g.pid);
        for (const [cx, sums] of [...g.parkedSums]) {
          const d = Math.abs(cx - gcx);
          if (d <= NET_TILE_COLS) { g.parkedSums.delete(cx); this.queueSum(g, cx, sums); }
          else if (d > 2 * NET_TILE_COLS) g.parkedSums.delete(cx);
        }
      }
      if (now >= g.nextPing) { g.nextPing = now + PING_MS; this.sendCtrl(g, { t: 'ping', at: now }); }
      if (g.tiles.length) { this.sendCtrl(g, { t: 'tiles', tick: game.tick, batches: g.tiles }); g.tiles = []; }
      if (g.ev.length) { this.sendCtrl(g, { t: 'ev', list: g.ev }); g.ev = []; }
      if (g.pub.length) { this.sendCtrl(g, { t: 'pub', list: g.pub }); g.pub = []; }
      // bulk：在途超過 BULK_HIGH_WATER 就把 col / chunk / liq 留到下一幀（R6）
      const room = (): boolean => g.link.buffered('bulk') <= BULK_HIGH_WATER;
      while (g.jobs.length && room()) {
        const j = g.jobs.shift()!;
        if (j.k === 'sum') {
          try { const r = answerSum(w, j.cx, j.sums); g.link.send('bulk', encodeBulk(r.head, r.payload)); } catch { /* 世界外的欄（validate 已擋） */ }
        } else {
          g.chunkQ.delete(j.key);
          const r = chunkMessage(w, j.key);
          if (r) g.link.send('bulk', encodeBulk(r.head, r.payload));
        }
      }
      if (g.phase === 'live' && sendLiq && g.liq.size && room()) {
        const r = encodeLiq(w, [...g.liq].sort((p, q) => p - q));
        g.liq.clear();
        if (r.head.chunks.length) g.link.send('bulk', encodeBulk(r.head, r.payload));
      }
      if (sendWs && g.phase === 'live') { ws ??= this.wsParts(); g.link.send('state', JSON.stringify(this.wsFor(g, ws))); }
      if (sendChar) {
        const c = game.characterOf(g.pid, 0), key = charKey(c, game.time);
        if (key !== g.charSig) { g.charSig = key; this.sendCtrl(g, { t: 'char', rev: g.charRev, character: stamp(c, g.charRev) }); }
      }
      if (g.chkNow || now >= g.nextChk) {
        g.chkNow = false;
        g.nextChk = now + CHK_MS;
        g.charRev++;
        const character = stamp(game.characterOf(g.pid, 0), g.charRev);
        this.sendCtrl(g, { t: 'chk', rev: g.charRev, character, upTo: g.lastCmdSeq });
        // 送出但還沒 ack 的最新一份 = held：這份 chk 在途中丟了、房主又在發現斷線前重新載入世界，客人重進時照樣用它
        this.opts.visits.putHeld(g.charId, { rev: g.charRev, character, at: Date.now() });
      }
    }
    if (due('world')) {
      const snap = snapshotWorld(game, null), sig = worldSig(snap);
      if (sig !== this.sig) { this.sig = sig; this.broadcast({ t: 'world', snap }, null); }
    }
    if (due('look')) {
      for (const pid of game.actors.keys()) {
        const l = this.lookOf(pid);
        if (this.lookKeys.get(pid) === l.key) continue;
        this.lookKeys.set(pid, l.key);
        this.broadcast({ t: 'look', pid, nick: this.nickOf(pid), look: l.look }, this.list.find((g) => g.alive && g.pid === pid) ?? null);
      }
    }
    this.saveIfDue();
  }

  /** 存世界的防抖到期 → requestSave */
  private saveIfDue(): void {
    if (this.saveAt !== null && this.now >= this.saveAt) { this.saveAt = null; this.opts.requestSave?.(); }
  }

  /** ws 的共用部分：所有玩家、加上帶欄號的怪物 / 掉落物 / 投射物 / NPC（每位客人再依 LOAD_COLS 過濾，C6） */
  private wsParts() {
    const game = this.game;
    const cxOf = (b: { x: number; w: number }): number => chunkOfX(Math.floor((b.x + b.w / 2) / TILE_SIZE));
    const players: WsPlayer[] = [];
    for (const a of game.actors.values()) {
      const p = a.player;
      players.push({
        pid: a.pid, x: p.x, y: p.y, vx: p.vx, vy: p.vy, facing: a.facing,
        hp: a.hp, maxHp: game.withActor(a, () => game.maxHp()), mana: a.mana, dead: a.dead,
        pose: encodePose(game.poseOf(a.pid)),
      });
    }
    const enemies: [number, WsEnemy][] = game.enemies.map((e) => [cxOf(e.body), {
      id: e.id, kind: e.kind, x: e.body.x, y: e.body.y, dir: e.dir, hp: e.hp, maxHp: e.maxHp, state: e.state,
    }]);
    const drops: [number, WsDrop][] = game.drops.list.map((d) => [cxOf(d.body), { id: d.id, item: d.item, count: d.count, x: d.body.x, y: d.body.y }]);
    const proj: [number, WsProj][] = game.projectiles.list.map((q) => [cxOf(q.body), {
      id: q.id, kind: q.kind, x: q.body.x, y: q.body.y, vx: q.body.vx, vy: q.body.vy, hostile: q.hostile,
    }]);
    const npcs: [number, WsNpc][] = [
      ...game.settle.npcs.map((n): [number, WsNpc] => [cxOf(n.body), { id: n.id, src: 0, x: n.body.x, y: n.body.y, dir: n.dir }]),
      ...game.folk.npcs.map((n): [number, WsNpc] => [cxOf(n.body), { id: n.id, src: 1, x: n.body.x, y: n.body.y, dir: n.dir }]),
    ];
    return { players, enemies, drops, proj, npcs };
  }

  private wsFor(g: Guest, parts: ReturnType<NetHost['wsParts']>): Ws {
    const gcx = this.colOf(g.pid);
    const near = <X>(l: [number, X][]): X[] => l.filter(([cx]) => Math.abs(cx - gcx) <= LOAD_COLS).map(([, v]) => v);
    return {
      t: 'ws', tick: this.game.tick, time: this.game.time, players: parts.players,
      enemies: near(parts.enemies), drops: near(parts.drops), proj: near(parts.proj), npcs: near(parts.npcs),
    };
  }

  // ── 移除 / 拒絕 ───────────────────────────────────
  /**
   * 移除一位客人（bye / onClose / 逾時 / 關房）：最後的 chk（連線還開著才送）、removeActor、visits.put、putHeld、對其他客人送 gone。
   * bye = 要送給他的 bye（null = 不送）。不立刻 close 連線（剛送出的訊息會被丟掉）：有送 bye 或最後的 chk 就進 lingerQ，
   * LINGER_MS 後由房主關；這段時間收到涵蓋那份 chk 的 chkAck 就清掉 held（C1）。
   */
  private remove(g: Guest, bye: ByeReason | null): void {
    if (!g.alive) return;
    g.alive = false;
    this.list = this.list.filter((o) => o !== g);
    let sentChk = false;
    if (g.phase !== 'hello' && this.game.actors.has(g.pid)) {
      let out: ReturnType<DelveGame['removeActor']> | null = null;
      try { out = this.game.removeActor(g.pid); } catch { out = null; }
      if (out) {
        g.charRev++;
        const character = stamp(out.character, g.charRev);
        if (g.link.open) { this.sendCtrl(g, { t: 'chk', rev: g.charRev, character, upTo: g.lastCmdSeq }); sentChk = true; }
        this.opts.visits.put(g.charId, out.visit);
        // at = removeActor 拍快照的時間（visit.lastSeen 就是它；房主自己不讀時鐘）
        this.opts.visits.putHeld(g.charId, { rev: g.charRev, character, at: out.visit.lastSeen });
        this.saveSoon();
      }
      this.lookKeys.delete(g.pid);
      this.broadcast({ t: 'gone', pid: g.pid }, null);
    }
    if (!g.link.open) return;
    if (bye) this.sendCtrl(g, { t: 'bye', reason: bye });
    if (bye || sentChk) this.linger(g);
  }

  /**
   * chkAck：正常連線或延遲中的都算。ack 到 held 那份（或更新的）→ 清掉 held（C1）。
   * 還連著的客人只清記憶體、不另外存世界：檔裡留著的舊 held 無害（客人重進時 hello 帶的是 ack 過的那份，rev ≥ held.rev，不會被採用）。
   * 已移除的客人要存（關房之後 loop 可能不再跑 → 直接 requestSave，不走防抖）。
   */
  private onChkAck(g: Guest, rev: number): void {
    g.ackedRev = Math.max(g.ackedRev, rev);
    if (!g.charId) return;
    const held = this.opts.visits.getHeld(g.charId);
    if (!held || held.rev > rev) return;
    this.opts.visits.putHeld(g.charId, null);
    if (g.alive) return;
    if (this.closed) this.opts.requestSave?.(); else this.saveSoon();
  }

  private reject(g: Guest, reason: RejectReason): void {
    this.sendCtrl(g, { t: 'reject', reason });
    g.alive = false;
    this.list = this.list.filter((o) => o !== g);
    this.linger(g);
  }

  /** 連線不立刻關（剛送出的 reject / bye 會被丟掉）：LINGER_MS 後才關，期間客人那端自己也不關 */
  private linger(g: Guest): void {
    g.lingering = true;
    this.lingerQ.push({ g, at: this.now + LINGER_MS });
  }

  /** 每個 frame 開頭：處理延遲中連線收到的訊息（pong 與 chkAck），再關掉到期的 */
  private sweepLinger(): void {
    const inbox = this.lingerIn;
    this.lingerIn = [];
    const w = this.opened ? this.game.world : null;
    for (const it of inbox) {
      if (!it.g.lingering || it.ch !== 'ctrl' || !w) continue;
      const m = parseGuestCtrl(it.data, w.chunksY, { lo: chunkOfX(w.xMin), hi: chunkOfX(w.xMax - 1) });
      if (m && m.t === 'pong') it.g.rttMs = Math.max(0, this.now - m.at);
      else if (m && m.t === 'chkAck') { try { this.onChkAck(it.g, m.rev); } catch { /* 不可信輸入：丟掉該則 */ } }
    }
    if (!this.lingerQ.length) return;
    const due = this.lingerQ.filter((l) => this.now >= l.at);
    if (!due.length) return;
    this.lingerQ = this.lingerQ.filter((l) => this.now < l.at);
    for (const l of due) { l.g.lingering = false; if (l.g.link.open) l.g.link.close('linger'); }
  }

  // ── 小工具 ────────────────────────────────────────
  private sendCtrl(g: Guest, m: HostCtrl): void { g.link.send('ctrl', JSON.stringify(m)); }

  /** 送給所有已加入的客人（except 除外） */
  private broadcast(m: HostCtrl, except: Guest | null): void {
    const s = JSON.stringify(m);
    for (const o of this.list) if (o !== except && o.alive && o.phase !== 'hello') o.link.send('ctrl', s);
  }

  /** 存世界的防抖：保留最早那次的到期時間（第一次觸發後最多 SAVE_DEBOUNCE_MS 就存），連續的跨邊界操作不會一直往後延 */
  private saveSoon(): void { if (this.saveAt === null) this.saveAt = this.now + SAVE_DEBOUNCE_MS; }

  /** 房主端該 actor 身體中心所在的欄 */
  private colOf(pid: Pid): number {
    const p = this.game.actors.get(pid)!.player;
    return chunkOfX(Math.floor((p.x + p.w / 2) / TILE_SIZE));
  }

  private lookOf(pid: Pid): { look: DollLook; key: string } {
    const a = this.game.actors.get(pid)!;
    return this.game.withActor(a, () => this.game.doll());
  }

  private nickOf(pid: Pid): string {
    const g = this.list.find((o) => o.alive && o.pid === pid);
    if (g) return g.nick;
    if (pid === this.game.localPid && this.opts.nick) return this.opts.nick;
    return this.game.actors.get(pid)?.who?.nick ?? '房主';
  }
}
