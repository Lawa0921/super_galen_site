// guest.ts — 客人端協定狀態機與副本（co-op M-B3；spec §5.2–5.7；建造者決定 C3、C6、C9、C12–C14）。
//   握手（hello → welcome →〔烘焙世界：等 bulk legacy〕→ 建 replica → bulk snap → ready → live）、收件匣（C2：onMessage 只排隊，frame 開頭依序處理）、
//   生成器相容檢查（coopGenOk）：gen2 / 烘焙世界的副本照 welcome.gen2 建 Gen2Source / BakedSource（鎖表凍結、不記鎖），只生成自己附近（Task 18）、
//   chunk 同步（ChunkSyncGuest：tiles / col / chunk、updateInterest 送 sum）、液體、事件、角色、checkpoint、
//   teleport / knock、ws 內插（怪物 / 掉落物 / 投射物 / NPC 寫進 replica 的列表，現有 renderer 直接畫）、
//   樂觀放置與回滾（C14）、20 Hz 的 ps、逾時與重連。
// M-C C1：chk 的 onCheckpoint 寫好（promise resolve）才回 chkAck；最後一個跨邊界 cmd 的 seq 還沒被 chk.upTo 涵蓋 = unconfirmed。
// 客人信任房主（反目標：不做防作弊），但每則訊息的解析 / 套用失敗只丟掉那一則，絕不拋到 frame 之外。
// 決定性：不讀時鐘、不用 Math.random；時間一律是 frame(nowMs, …) 傳進來的值。
import { DelveGame, type DelveEvent } from '../engine/game';
import { MAX_BREATH, type Pid } from '../engine/actor';
import type { Cmd } from '../engine/commands';
import type { DollLook } from '../engine/doll';
import { ENEMIES, makeEnemy, type Enemy } from '../engine/enemies';
import { ITEM_SIZE, type DroppedItem } from '../engine/entities';
import { ProjList, type Projectile } from '../engine/projectiles';
import { ITEMS, type ItemId } from '../engine/items';
import { T, tileDef, isSolidTile, isInteractive, isBedTile, isChestTile, isDoorTile } from '../engine/tiles';
import { PAIR_OF_LEFT } from '../engine/furniture';
import { CHUNK, FIXED_DT, GEN_VERSION, GEN_VERSION_V2, PLACE_COOLDOWN, TILE_SIZE } from '../engine/constants';
import { OUTER_GEN_VERSION } from '../engine/legacy/chunkgen/index';
import { GEN2_VERSION } from '../engine/gen2';
import { LockTable, type LockJSON } from '../engine/gen2/locks';
import { chunkOfX } from '../engine/coords';
import type { DelveCharacter } from '../save/character';
import { genBlocker } from '../save/genCheck';
import { SAVE_FORMAT } from '../save/serialize';
import { validBakeInfo } from '../save/bake';
import { decodeLegacyMeta, type LegacyMeta } from '../save/legacyMeta';
import type { Channel, NetLink, Payload } from './link';
import {
  BOUNDARY_OPS, HOST_TIMEOUT_MS, INTERP_DELAY_MS, PING_MS, PROTO, PS_BOAT, PS_CLIMB, PS_GROUND, PS_HZ,
  type ByeReason, type GuestCtrl, type HostCtrl, type Ps, type RejectReason, type Welcome, type WorldSnap,
  type Ws, type WsDrop, type WsEnemy, type WsNpc, type WsProj, encodeMantle,
} from './protocol';
import { decodeBreath, decodePose } from './validate';
import { lerpPose, type PlayerPose } from '../engine/pose';
import { decodeBulk } from './codec';
import { ChunkSyncGuest, applyLiq } from './chunkSync';
import { applyWorldSnap } from './snapshot';
import { Interp } from './interp';

export interface NetGuestOptions {
  build: string;
  /** 最後一次 chk 的角色（沒有就是本地角色檔） */
  character: DelveCharacter;
  /** C9：只把房主的 chk 交出去（M-C 寫 IDB）；絕不存本地預測狀態。回傳 promise → resolve 之後才回 chkAck（reject 就不回） */
  onCheckpoint?: (c: DelveCharacter, rev: number) => void | Promise<void>;
  /** 測試注入（gen 快取 / columnSource）；預設依 welcome 建 replica。meta = 烘焙世界的 legacy bulk 解出來的（其他世界 undefined） */
  createReplica?: (w: Welcome, meta?: LegacyMeta) => DelveGame;
}
export type GuestState = 'connecting' | 'syncing' | 'live' | 'ended';
/** 最後一份 chk：upTo = 房主做這份 checkpoint 時處理到的 cmd seq */
export interface Checkpoint { rev: number; character: DelveCharacter; upTo: number }
export interface PeerView {
  pid: Pid; nick: string; look: DollLook | null; x: number; y: number; facing: 1 | -1; hp: number; maxHp: number; dead: boolean;
  /** 畫這個玩家用（M-C2）：x / y 與挖掘進度內插，其他欄位取較新那筆 */
  pose: PlayerPose;
}
/** 客人自己的動作狀態用房主的（M-C2 D3）：最新一份、不內插 */
export type OwnPose = Pick<PlayerPose, 'attack' | 'mining' | 'fishing' | 'iframes' | 'hurt'>;
/** 內插緩衝裡的一位玩家（ws 的 WsPlayer + 解好的 pose；位置 / 面向 / 死活都在 pose 裡，x / y = pose 的，給 Interp 用） */
interface PeerSample { pid: Pid; x: number; y: number; hp: number; maxHp: number; pose: PlayerPose }
const lerpPeer = (a: PeerSample, b: PeerSample, k: number): PeerSample => {
  const pose = lerpPose(a.pose, b.pose, k);
  return { ...b, x: pose.x, y: pose.y, pose };
};

export const END_TEXT: Readonly<Record<RejectReason | ByeReason | 'hostGone', string>> = Object.freeze({
  full: '房間已滿',
  proto: '版本不同，請重新整理頁面',
  gen: '世界版本不同，無法加入',
  charInUse: '這個角色已經在房間裡',
  char: '角色檔格式不正確',
  closed: '主機已離線',
  hostGone: '主機已離線',
  timeout: '連線逾時',
  leave: '已離開',
});

/** leave 之後最多等這麼久收房主最後的 chk，再自己關連線 */
export const LEAVE_GRACE_MS = 2000;
const PS_MS = 1000 / PS_HZ;
/** welcome 之前最多留這麼多則 bulk（加入時房主在 bulk 只送一則 snap；烘焙世界多一則 legacy） */
const EARLY_BULK_MAX = 5;

type Inbox = { link: NetLink; ch: Channel; data: Payload } | { link: NetLink; close: true };
/** 樂觀放置（C14）：ack 回來前記著；since = 放下那一刻的 sync.writes */
interface PendingPlace { x: number; y: number; old: number; placed: number; since: number }

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const isLegacyBulk = (d: Uint8Array): boolean => decodeBulk(d)?.head.t === 'legacy';
const endText = (r: unknown): string => (typeof r === 'string' && own(END_TEXT, r) ? END_TEXT[r as keyof typeof END_TEXT] : END_TEXT.closed);

/**
 * 房主送回來、客人副本自己已經預測過的私人事件（pid = 自己）：技能開始 / 冷卻（exec 在本地先跑過一次，C13）、
 * 空中跳與攀爬（stepReplica 的 afterMove 會發）、換格（selectSlot 在本地發）。丟掉免得特效 / 音效重複。
 */
function echoed(e: DelveEvent): boolean {
  if (e.type === 'skill') return e.phase === 'start' || e.phase === 'cd';
  return e.type === 'airjump' || e.type === 'climb' || e.type === 'select';
}

/** 能樂觀套用的單格方塊（C14）：一般方塊 / 平台這類；門、床、箱子、家具、成對家具、繩子、爐心、牆、要特殊支撐的都不算 */
function soloBlock(item: ItemId): number | null {
  const def = ITEMS[item];
  if (!def || def.place === undefined || def.placeWall !== undefined) return null;
  const t = def.place;
  if (t === T.ROPE || t === T.HEARTH || PAIR_OF_LEFT.has(t)) return null;
  if (isInteractive(t) || isDoorTile(t) || isBedTile(t) || isChestTile(t)) return null;
  if (tileDef(t).support !== 'none') return null;
  return t;
}

/**
 * 房主世界的生成器能不能用這個客人的程式重現（Task 18；save/genCheck 的 genBlocker 判版本）：
 * genVersion 7 = 外圍 OUTER_GEN_VERSION、不帶描述；genVersion 8 = outerGen GEN2_VERSION、帶描述（kind 對、鎖表合法、每個鎖 ≤ GEN2_VERSION）；其他 false
 */
export function coopGenOk(m: Pick<Welcome, 'genVersion' | 'outerGenVersion' | 'gen2'>): boolean {
  const v = m.genVersion, o = m.outerGenVersion, g = m.gen2 as unknown;
  if (v === GEN_VERSION) return o === OUTER_GEN_VERSION && g === undefined;
  if (v !== GEN_VERSION_V2 || o !== GEN2_VERSION || !isObj(g) || (g.kind !== 'gen2' && g.kind !== 'baked')) return false;
  let locks: LockJSON;
  try { locks = LockTable.fromJSON(g.locks).toJSON(); } catch { return false; }
  return genBlocker({ format: SAVE_FORMAT, genVersion: v, outerGen: o, bounds: 'infinite', gen2: { locks } }) === null;
}

/** welcome → 副本：舊世界照舊；gen2 = 不建中央的 Gen2Source；烘焙世界 = BakedSource（meta 來自 legacy bulk）。鎖表在副本裡凍結 */
function defaultReplica(w: Welcome, meta?: LegacyMeta): DelveGame {
  const g = w.gen2;
  if (!g) return new DelveGame({ seed: w.seed, width: w.w, height: w.h, bounds: w.bounds, peaceful: w.peaceful, localPid: w.pid, mode: 'replica' });
  const base = { seed: w.seed, peaceful: w.peaceful, localPid: w.pid, mode: 'replica' as const };
  if (g.kind === 'gen2') return new DelveGame({ ...base, worldGen: { kind: 'gen2', locks: g.locks } });
  if (!meta) throw new RangeError('baked replica without legacy meta');
  return new DelveGame({ ...base, worldGen: { kind: 'baked', locks: g.locks, bake: validBakeInfo(g.bake, meta.frame), meta } });
}

export class NetGuest {
  private link: NetLink;
  private readonly opts: NetGuestOptions;
  private st: GuestState = 'connecting';
  private text: string | null = null;
  private replica: DelveGame | null = null;
  private me: Pid | null = null;
  private chunks: ChunkSyncGuest | null = null;
  private checkpoint: Checkpoint | null = null;
  /** 這條連線上最後一個送出的跨邊界 cmd 的 seq（0 = 沒有；welcome 時歸零，舊連線的狀態改由 carry 帶著） */
  private boundarySeq = 0;
  /** 重連前還是 unconfirmed：新連線收到第一份 chk（房主這份角色寫進去了）才算解除 */
  private carry = false;
  /** 最後一個 welcome 的 worldId */
  private world: string | null = null;
  /** leave 之後收到的那份 chk 的 rev，與已經送出 chkAck 的最大 rev */
  private leaveChk: number | null = null;
  private ackSent = -1;
  /** 這次 hello 帶的角色（welcome 時套到本地 actor） */
  private character: DelveCharacter;
  private inbox: Inbox[] = [];
  /** welcome 之前到的 bulk（ctrl 與 bulk 各自有序、彼此不保證順序：snap 可能比 welcome 先到）；welcome 建好副本後依序套上 */
  private early: Uint8Array[] = [];
  /** 烘焙世界：welcome 到了、legacy bulk 還沒到（維持 connecting，legacy 一到就建副本） */
  private waitLegacy: Welcome | null = null;
  /** 這個副本（welcome 之後）已經套過 ctrl 的 world：之後才到的加入 snap 是舊的，不再蓋世界層級 */
  private worldSeen = false;
  private now = 0;
  private heardAt: number | null = null;
  /** leave 之後等最後的 chk 到這個時間（null = 不在等） */
  private closeAt: number | null = null;
  private cmdSeq = 0;
  private psSeq = 0;
  private nextPs = -Infinity;
  private nextPing = -Infinity;
  private rtt: number | null = null;
  /** 最後收到的 teleport tseq（ps 回報） */
  private tseq = 0;
  private placeCd = 0;
  private readonly pending = new Map<number, PendingPlace>();
  // ── ws ──
  private wsTick = -Infinity;
  private wsTime = 0;
  private wsAt = 0;
  private readonly players = new Interp<PeerSample>(undefined, lerpPeer);
  /** 房主回報的、自己 pid 的最新一份（M-C2 D3）；還沒有 ws → null */
  private own: OwnPose | null = null;
  private readonly enemyIp = new Interp<WsEnemy>();
  private readonly dropIp = new Interp<WsDrop>();
  private readonly projIp = new Interp<WsProj>();
  private readonly npcIp = new Interp<WsNpc>();
  private readonly peerInfo = new Map<Pid, { nick: string; look: DollLook | null }>();
  /** 建投射物用（拿 ProjList.spawn 的尺寸與預設值） */
  private readonly projScratch = new ProjList();

  constructor(link: NetLink, opts: NetGuestOptions) {
    this.link = link;
    this.opts = opts;
    this.character = opts.character;
    this.listen(link);
    this.hello();
  }

  get state(): GuestState { return this.st; }
  get endText(): string | null { return this.text; }
  get game(): DelveGame | null { return this.replica; }
  get pid(): Pid | null { return this.me; }
  get lastCheckpoint(): Checkpoint | null { return this.checkpoint; }
  /** 有跨邊界 cmd 還沒被房主的 chk 涵蓋（斷線時 = 那筆操作可能在房主世界裡生效了，但客人手上的角色不含它；C1） */
  get unconfirmed(): boolean { return this.carry || this.boundarySeq > (this.checkpoint?.upTo ?? 0); }
  /** 最後加入的世界（welcome 之前 null） */
  get worldId(): string | null { return this.world; }
  /** chunk 同步狀態（測試 / 除錯用）；welcome 之前 null */
  get sync(): ChunkSyncGuest | null { return this.chunks; }
  /** 自己的攻擊 / 挖掘 / 釣魚 / 無敵：房主 ws 裡自己 pid 的最新一份（M-C2 D3；客人副本不模擬這些）；還沒有 → null */
  ownPose(): OwnPose | null { return this.own; }
  /**
   * peers() 取樣用的時鐘（房主世界時間，秒）：最新 ws 的房主時間 + 到達後經過的時間 − INTERP_DELAY_MS。
   * 畫別人的揮擊進度要用它（(peerTime − attack.at) / dur），才會跟內插的身體同步
   */
  peerTime(): number { return (this.interpNow(this.now) - INTERP_DELAY_MS) / 1000; }
  /** 最近一次 ping/pong 量到的往返時間（ms）；第一個 pong 到之前是 null */
  get rttMs(): number | null { return this.rtt; }

  frame(nowMs: number, steps: number): void {
    this.now = nowMs;
    if (this.st === 'ended') { this.drainAfterLeave(nowMs); return; }
    if (this.heardAt === null) this.heardAt = nowMs;
    // ① 收件匣（C2）
    const inbox = this.inbox;
    this.inbox = [];
    for (const it of inbox) {
      if (it.link !== this.link) continue;                       // 舊連線（重連前）的
      if (this.isEnded()) break;
      if ('close' in it) { this.end(END_TEXT.hostGone, false); break; }
      this.heardAt = nowMs;
      try { this.handle(it.ch, it.data); } catch { /* 解析 / 套用失敗：只丟這一則 */ }
    }
    if (this.isEnded()) return;
    if (nowMs - this.heardAt > HOST_TIMEOUT_MS) { this.end(END_TEXT.hostGone, true); return; }
    const game = this.replica;
    if (!game) return;
    if (nowMs >= this.nextPing) { this.nextPing = nowMs + PING_MS; this.ctrl({ t: 'ping', at: nowMs }); }
    // ②–⑤ 包起來：半套用的房主狀態讓副本拋例外 → 丟掉這一幀的工作，不拋出 frame（引擎沒有 warn / invariant 管道，不記錄）
    try { this.simulate(game, nowMs, steps); } catch { /* 這一幀的模擬丟掉 */ }
    // ⑥ 內插取樣寫進 replica 的列表（C12）
    try { this.writeInterp(nowMs, steps * FIXED_DT); } catch { /* 房主給的列表壞掉：這一幀不更新 */ }
    // ⑦ 副本自己的編輯日誌沒有人用（套房主的 tiles 也會進日誌）
    try { game.world.edits.drain(); } catch { /* 同上 */ }
  }

  /** 樂觀放置與 ps.use 遮罩 → 固定步 → 興趣範圍送 sum → 20 Hz ps */
  private simulate(game: DelveGame, nowMs: number, steps: number): void {
    // ② 樂觀放置與 ps.use 遮罩（C14）
    const use = this.placeStep();
    // ③ 固定步：腳下的 chunk 還沒同步好 → 身體原地不動（不在生成的地形裡掉下去）
    const p = game.local.player;
    const hold = this.bodyReady() ? null : { x: p.x, y: p.y };
    try {
      for (let i = 0; i < steps; i++) game.step();
    } finally {
      if (hold) { p.x = hold.x; p.y = hold.y; p.vx = 0; p.vy = 0; }
      if (this.placeCd > 0) this.placeCd = Math.max(0, this.placeCd - steps * FIXED_DT);
    }
    if (this.st !== 'live') return;
    // ④ 興趣範圍（C6）：新進的欄送 sum
    const tx = Math.floor((p.x + p.w / 2) / TILE_SIZE);
    for (const s of this.chunks!.updateInterest(tx)) this.ctrl({ t: 'sum', cx: s.cx, sums: s.sums });
    // ⑤ 20 Hz 的 ps
    if (nowMs >= this.nextPs) {
      this.sendPs(use);
      const n = this.nextPs + PS_MS;
      this.nextPs = n > nowMs ? n : nowMs + PS_MS;
    }
  }

  /** 已加入的其他玩家（依 ws 內插；還沒有 ws 的不列） */
  peers(): PeerView[] {
    const out: PeerView[] = [];
    const t = this.interpNow(this.now);
    for (const id of this.players.ids()) {
      const s = this.players.sample(id, t);
      if (!s || s.pid === this.me) continue;
      const info = this.peerInfo.get(s.pid);
      const p = s.pose;
      out.push({
        pid: s.pid, nick: info?.nick ?? '', look: info?.look ?? null, x: p.x, y: p.y, facing: p.facing,
        hp: s.hp, maxHp: s.maxHp, dead: p.dead, pose: p,
      });
    }
    return out;
  }

  /** bye leave；state ended。房主最後的 chk 到了、chkAck 送出去之後（最晚 LEAVE_GRACE_MS）再自己關連線 */
  leave(): void {
    if (this.st === 'ended') return;
    this.ctrl({ t: 'bye', reason: 'leave' });
    this.end(END_TEXT.leave, false);
    this.closeAt = this.now + LEAVE_GRACE_MS;
    this.leaveChk = null;
  }

  /** 用 lastCheckpoint（沒有就 opts.character）重新 hello；舊 replica 丟掉 */
  reconnect(link: NetLink): void {
    const old = this.link;
    this.link = link;
    this.listen(link);
    if (old !== link && old.open) old.close('reconnect');
    if (this.replica) this.replica.cmdSink = null;
    this.replica = null;
    this.me = null;
    this.chunks = null;
    this.st = 'connecting';
    this.text = null;
    this.inbox = this.inbox.filter((it) => it.link === link);   // 舊連線的丟掉；新連線已到的留著
    this.early = [];
    this.waitLegacy = null;
    this.heardAt = null;
    this.closeAt = null;
    this.leaveChk = null;
    this.ackSent = -1;
    this.tseq = 0;
    this.placeCd = 0;
    this.nextPs = -Infinity;
    this.nextPing = -Infinity;
    this.rtt = null;
    this.pending.clear();
    this.resetWs();
    this.peerInfo.clear();
    this.character = this.checkpoint?.character ?? this.opts.character;
    this.hello();
  }

  // ── 連線 ──────────────────────────────────────────
  private listen(link: NetLink): void {
    link.onMessage((ch, data) => { this.inbox.push({ link, ch, data }); });
    link.onClose(() => { this.inbox.push({ link, close: true }); });
  }

  private hello(): void {
    const c = this.character;
    this.ctrl({ t: 'hello', proto: PROTO, build: this.opts.build, charId: c.id, nick: c.nick, character: c });
  }

  /** handle 可能把狀態改成 ended（TS 的窄化看不到） */
  private isEnded(): boolean { return this.st === 'ended'; }

  private ctrl(m: GuestCtrl): void { this.link.send('ctrl', JSON.stringify(m)); }

  private sendCmd(cmd: Cmd): number {
    const seq = ++this.cmdSeq;
    this.ctrl({ t: 'cmd', seq, cmd });
    if (BOUNDARY_OPS.has(cmd.op)) this.boundarySeq = seq;
    return seq;
  }

  /** 結束：close = 由客人關連線（reject / bye / 版本不同 / 逾時之後） */
  private end(text: string, close: boolean): void {
    this.st = 'ended';
    this.text = text;
    this.closeAt = null;
    if (close && this.link.open) this.link.close('ended');
  }

  /**
   * leave 之後：只收最後的 chk。它的 chkAck 送出、而且 ctrl 已經送完（buffered 0：關連線會丟掉在途的訊息）才關連線；
   * 最晚 LEAVE_GRACE_MS（onCheckpoint 一直沒完成、或房主沒送 chk）
   */
  private drainAfterLeave(nowMs: number): void {
    if (this.closeAt === null) { this.inbox = []; return; }
    const inbox = this.inbox;
    this.inbox = [];
    for (const it of inbox) {
      if (it.link !== this.link) continue;
      if ('close' in it) { this.closeAt = null; return; }
      if (it.ch !== 'ctrl' || typeof it.data !== 'string') continue;
      try {
        const m = JSON.parse(it.data) as HostCtrl;
        if (isObj(m) && m.t === 'chk' && fin(m.rev)) { this.leaveChk = m.rev; this.onChk(m); }
      } catch { /* 丟掉 */ }
    }
    const acked = this.leaveChk !== null && this.ackSent >= this.leaveChk && this.link.buffered('ctrl') === 0;
    if (acked || nowMs >= this.closeAt) { this.closeAt = null; if (this.link.open) this.link.close('leave'); }
  }

  // ── 收訊 ──────────────────────────────────────────
  private handle(ch: Channel, data: Payload): void {
    if (ch === 'bulk') {
      if (!(data instanceof Uint8Array)) return;
      if (!this.replica) {
        if (this.st !== 'connecting') return;
        // 烘焙世界的 welcome 已到、正在等的 legacy：現在建副本
        if (this.waitLegacy && isLegacyBulk(data)) { const m = this.waitLegacy; this.waitLegacy = null; this.build(m, data); return; }
        if (this.early.length < EARLY_BULK_MAX) this.early.push(data);
        return;
      }
      this.onBulk(data);
      return;
    }
    if (typeof data !== 'string') return;
    const m = JSON.parse(data) as unknown;
    if (!isObj(m) || typeof m.t !== 'string') return;
    if (ch === 'state') { if (m.t === 'ws' && this.replica) this.onWs(m as unknown as Ws); return; }
    const c = m as unknown as HostCtrl;
    switch (c.t) {
      case 'welcome': this.onWelcome(c); return;
      // reject / bye 之後由房主延遲關連線（LINGER_MS，讓最後的訊息送達），客人不自己關
      case 'reject': this.end(endText(c.reason), false); return;
      case 'bye': this.end(endText(c.reason), false); return;
      case 'ping': if (fin(c.at)) this.ctrl({ t: 'pong', at: c.at }); return;
      case 'pong': if (fin(c.at)) this.rtt = Math.max(0, this.now - c.at); return;
    }
    const game = this.replica;
    if (!game) return;
    switch (c.t) {
      case 'tiles': this.chunks!.onTiles(c.batches); return;
      case 'ev': game.pushNetEvents(c.list.filter((e) => !(e.pid === this.me && echoed(e)))); return;
      case 'pub': game.pushNetEvents(c.list.slice()); return;
      case 'char': {
        if (!isObj(c.character)) return;
        // 快捷欄選取由客人權威（房主只跟著 ps.slot / place 的 slot）：房主那份落後半個 RTT，套角色時保留本地的，免得剛換的格被改回去
        const sel = game.local.inventory.selected;
        game.applyNetCharacter(c.character);
        game.local.inventory.select(sel);
        return;
      }
      case 'chk': this.onChk(c); return;
      case 'ack': this.onAck(c); return;
      case 'teleport': {
        if (!fin(c.x) || !fin(c.y) || !fin(c.tseq)) return;
        // 同房主的 teleport()：位置、速度、跳躍計時、攀爬 / 攀邊、摔落高度、下船（下船事件由房主的 ev 帶回來）
        const a = game.local, p = a.player;
        p.x = c.x; p.y = c.y; p.vx = 0; p.vy = 0; p.gfxOffY = 0;
        a.motion.jumpTimer = 0;
        a.motion.climbing = false;
        a.motion.mantle = null;
        a.fallPeak = null;
        a.boating = false;
        this.tseq = c.tseq;
        return;
      }
      case 'knock': {
        if (!fin(c.vx) || !fin(c.vy) || !fin(c.dur)) return;
        const a = game.local;
        a.player.vx = c.vx; a.player.vy = c.vy; a.knockT = c.dur;
        return;
      }
      case 'world': if (isObj(c.snap)) { applyWorldSnap(game, c.snap); this.worldSeen = true; } return;
      case 'look': if (typeof c.pid === 'string') this.peerInfo.set(c.pid, { nick: String(c.nick ?? ''), look: isObj(c.look) ? c.look : null }); return;
      case 'gone': if (typeof c.pid === 'string') { this.peerInfo.delete(c.pid); this.players.delete(c.pid); } return;
    }
  }

  private onWelcome(m: Welcome): void {
    if (this.st !== 'connecting' || this.waitLegacy) return;
    if (!coopGenOk(m)) { this.genMismatch(); return; }
    if (typeof m.pid !== 'string' || !isObj(m.you) || !fin(m.you.x) || !fin(m.you.y)) return;
    if (m.gen2?.kind === 'baked') {
      // 烘焙世界要先有 legacy bulk（LegacyMeta）：早到的就用，沒有就維持 connecting 等它
      const i = this.early.findIndex(isLegacyBulk);
      if (i < 0) { this.waitLegacy = m; return; }
      const [legacy] = this.early.splice(i, 1);
      this.build(m, legacy);
      return;
    }
    this.build(m, null);
  }

  /** 房主世界的生成器這邊重現不了：bye、以「世界版本不同」結束 */
  private genMismatch(): void {
    this.ctrl({ t: 'bye', reason: 'leave' });
    this.end(END_TEXT.gen, true);
  }

  /** 建副本（legacy = 烘焙世界的 legacy bulk）；gen2 / 烘焙世界的描述或 LegacyMeta 壞掉 → 同生成器不符 */
  private build(m: Welcome, legacy: Uint8Array | null): void {
    const make = this.opts.createReplica ?? defaultReplica;
    let game: DelveGame;
    if (m.gen2) {
      try {
        const meta = legacy ? decodeLegacyMeta(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decodeBulk(legacy)!.payload))) : undefined;
        game = make(m, meta);
      } catch { this.genMismatch(); return; }
    } else game = make(m);
    const sync = new ChunkSyncGuest(game.world);
    sync.reset();
    game.cmdSink = (cmd) => { this.sendCmd(cmd); };
    const p = game.local.player;
    p.x = m.you.x; p.y = m.you.y; p.vx = 0; p.vy = 0;
    // 先對齊房主的時鐘再套角色（buff 的到期時間 = 目前時間 + 剩餘秒數）
    if (fin(m.time)) game.time = m.time;
    if (fin(m.tick)) game.tick = m.tick;
    game.applyNetCharacter(this.character);
    this.replica = game;
    this.chunks = sync;
    this.worldSeen = false;
    this.me = m.pid;
    this.world = typeof m.worldId === 'string' ? m.worldId : null;
    // 新連線的 upTo 從 0 起算：舊連線沒被涵蓋的跨邊界操作改記在 carry，等這條連線的第一份 chk
    this.carry = this.unconfirmed;
    this.boundarySeq = 0;
    this.resetWs();
    this.peerInfo.clear();
    if (Array.isArray(m.players)) {
      for (const q of m.players) if (isObj(q) && typeof q.pid === 'string') this.peerInfo.set(q.pid, { nick: String(q.nick ?? ''), look: isObj(q.look) ? q.look : null });
    }
    this.st = 'syncing';
    // 比 welcome 先到的 bulk（snap）：現在有副本了，依到達順序套上
    const early = this.early;
    this.early = [];
    for (const d of early) { try { this.onBulk(d); } catch { /* 只丟這一則 */ } }
  }

  private onBulk(bytes: Uint8Array): void {
    const game = this.replica, sync = this.chunks;
    if (!game || !sync) return;
    const msg = decodeBulk(bytes);
    if (!msg) return;
    const { head, payload } = msg;
    switch (head.t) {
      case 'snap': {
        if (this.st !== 'syncing') return;
        // 世界層級壞掉也照樣上線（之後的 world 重送會補上），不然會卡在 syncing 直到房主逾時
        // ctrl 與 bulk 彼此不保證順序：welcome 之後已經套過（較新的）world → 這份加入快照只套它的 visit
        try {
          if (isObj(head.snap)) {
            const snap = head.snap as WorldSnap;
            if (!this.worldSeen) applyWorldSnap(game, snap);
            else if (isObj(snap.visit)) game.applyVisit(snap.visit);
          }
        } catch { /* 丟掉這份快照 */ }
        this.ctrl({ t: 'ready' });
        this.st = 'live';
        return;
      }
      case 'col': sync.onCol(head, payload); return;
      case 'chunk': sync.onChunk(head, payload); return;
      case 'liq': if (Array.isArray(head.chunks)) applyLiq(game.world, head, payload); return;
    }
  }

  /** 先記下 lastCheckpoint，onCheckpoint 寫好（回傳 promise 就等它 resolve）之後、連線還開著才回 chkAck（C1） */
  private onChk(m: Extract<HostCtrl, { t: 'chk' }>): void {
    if (!fin(m.rev) || !isObj(m.character)) return;
    const rev = m.rev, link = this.link;
    this.checkpoint = { rev, character: m.character, upTo: fin(m.upTo) ? m.upTo : 0 };
    this.carry = false;
    const ack = (): void => {
      if (!link.open) return;
      link.send('ctrl', JSON.stringify({ t: 'chkAck', rev } satisfies GuestCtrl));
      if (link === this.link) this.ackSent = Math.max(this.ackSent, rev);
    };
    let r: unknown;
    try { r = this.opts.onCheckpoint?.(m.character, rev); } catch { return; }   // 寫不進去：不 ack（房主留著 held）
    const p = r as PromiseLike<void> | null | undefined;
    if (typeof p?.then === 'function') p.then(ack, () => { /* 寫入失敗：不 ack */ });
    else ack();
  }

  /** C14：ack ok:false → 那格仍是樂觀放下的方塊、期間房主沒寫過 → 還原 */
  private onAck(m: Extract<HostCtrl, { t: 'ack' }>): void {
    const pd = this.pending.get(m.seq);
    if (!pd) return;
    this.pending.delete(m.seq);
    if (m.ok) return;
    const w = this.replica!.world;
    if (w.getFg(pd.x, pd.y) === pd.placed && !this.chunks!.writtenSince(pd.x, pd.y, pd.since)) w.setFg(pd.x, pd.y, pd.old);
  }

  /** ws（state 通道：不可靠無序，舊的丟）：內插緩衝 + 本地的 hp / mana / breath / dead / time */
  private onWs(m: Ws): void {
    if (!fin(m.tick) || !fin(m.time) || m.tick <= this.wsTick) return;
    if (![m.players, m.enemies, m.drops, m.proj, m.npcs].every(Array.isArray)) return;
    const game = this.replica!;
    const at = m.time * 1000;
    const seen = new Set<number | string>();
    // 自己的呼吸：副本不跑液體，泡泡數照房主的（省略 = 滿氣；壞的沿用上一份）
    const br = decodeBreath(m.br, MAX_BREATH);
    if (br !== null) game.local.breath = br;
    for (const p of m.players) {
      if (!isObj(p) || typeof p.pid !== 'string') continue;
      // pose 壞掉：只丟這一份 pose（自己的沿用上一份；別人這則不進內插緩衝，但不當成離開）
      const pose = decodePose(p.pose);
      if (p.pid === this.me) {
        const a = game.local;
        if (fin(p.hp)) a.hp = p.hp;
        if (fin(p.mana)) a.mana = p.mana;
        // 死活在 pose 裡：這份壞掉就沿用上一份
        if (pose) {
          a.dead = pose.dead;
          this.own = { attack: pose.attack, mining: pose.mining, fishing: pose.fishing, iframes: pose.iframes, hurt: pose.hurt };
        }
        continue;
      }
      seen.add(p.pid);
      if (!pose) continue;
      this.players.push(p.pid, at, { pid: p.pid, x: pose.x, y: pose.y, hp: fin(p.hp) ? p.hp : 0, maxHp: fin(p.maxHp) ? p.maxHp : 0, pose });
    }
    this.players.retain(seen);
    const feed = <V extends { x: number; y: number }>(ip: Interp<V>, list: V[], key: (v: V) => number | string | null): void => {
      const ids = new Set<number | string>();
      for (const v of list) {
        const k = isObj(v) ? key(v) : null;
        if (k === null) continue;
        ip.push(k, at, v);
        ids.add(k);
      }
      ip.retain(ids);
    };
    feed(this.enemyIp, m.enemies, (e) => (fin(e.id) && own(ENEMIES, e.kind) ? e.id : null));
    feed(this.dropIp, m.drops, (d) => (fin(d.id) && own(ITEMS, d.item) ? d.id : null));
    feed(this.projIp, m.proj, (q) => (fin(q.id) && typeof q.kind === 'string' ? q.id : null));
    feed(this.npcIp, m.npcs, (n) => (fin(n.id) && (n.src === 0 || n.src === 1) ? `${n.src}:${n.id}` : null));
    this.wsTick = m.tick;
    this.wsTime = at;
    this.wsAt = this.now;
    game.time = m.time;
  }

  private resetWs(): void {
    this.wsTick = -Infinity;
    this.wsTime = 0;
    this.wsAt = 0;
    this.own = null;
    const ips: { clear(): void }[] = [this.players, this.enemyIp, this.dropIp, this.projIp, this.npcIp];
    for (const ip of ips) ip.clear();
  }

  /** 內插的「現在」= 最新一則 ws 的房主時間 + 它到達後經過的本地 ms */
  private interpNow(nowMs: number): number { return this.wsTime + (nowMs - this.wsAt); }

  // ── 每幀 ──────────────────────────────────────────
  /** C14：拿著可放置物按住使用、瞄準格不是可互動物、沒有 NPC → 遮掉 ps.use、改送 cmd place（冷卻 PLACE_COOLDOWN）；回傳要送的 ps.use */
  private placeStep(): boolean {
    const game = this.replica!, a = game.local;
    if (!a.useHeld) { this.placeCd = 0; return false; }
    if (a.dead || a.boating) return true;
    const held = a.inventory.selectedStack();
    const def = held ? ITEMS[held.item] : undefined;
    if (!held || !def || (def.place === undefined && def.placeWall === undefined)) return true;
    const w = game.world, { x, y } = a.aim;
    if (isInteractive(w.getFg(x, y))) return true;
    if (game.settle.npcAtPx(a.aimPx.x, a.aimPx.y) || game.folk.atPx(a.aimPx.x, a.aimPx.y)) return true;
    if (this.placeCd > 0 || this.st !== 'live') return false;
    this.placeCd = PLACE_COOLDOWN;
    const seq = this.sendCmd({ op: 'place', x, y, slot: a.inventory.selected });
    const t = soloBlock(held.item);
    if (t !== null && this.canPredict(x, y, t)) {
      this.pending.set(seq, { x, y, old: w.getFg(x, y), placed: t, since: this.chunks!.writes });
      w.setFg(x, y, t);
    }
    return false;
  }

  /** 樂觀放置的條件：chunk 已 live（pending / unsynced 的不碰）、空氣、觸及範圍內、不壓到自己、有支撐 */
  private canPredict(x: number, y: number, t: number): boolean {
    const game = this.replica!, w = game.world;
    if (!w.inBounds(x, y) || w.getFg(x, y) !== T.AIR) return false;
    if (this.chunks!.state(w.chunkIndex(chunkOfX(x), Math.floor(y / CHUNK))) !== 'live') return false;
    if (!game.canReach(x, y)) return false;
    const p = game.local.player, S = TILE_SIZE;
    if (isSolidTile(t) && p.x < (x + 1) * S && p.x + p.w > x * S && p.y < (y + 1) * S && p.y + p.h > y * S) return false;
    return w.getWall(x, y) !== 0 || isSolidTile(w.getFg(x - 1, y)) || isSolidTile(w.getFg(x + 1, y))
      || isSolidTile(w.getFg(x, y - 1)) || isSolidTile(w.getFg(x, y + 1));
  }

  /** 身體所在與腳下的 chunk 都已 live */
  private bodyReady(): boolean {
    const game = this.replica!, sync = this.chunks;
    if (this.st !== 'live' || !sync) return false;
    const w = game.world, p = game.local.player;
    const cx = chunkOfX(Math.floor((p.x + p.w / 2) / TILE_SIZE));
    for (const ty of [Math.floor(p.y / TILE_SIZE), Math.floor((p.y + p.h) / TILE_SIZE) + 1]) {
      const cy = Math.floor(ty / CHUNK);
      if (cy < 0 || cy >= w.chunksY) continue;
      if (sync.state(w.chunkIndex(cx, cy)) !== 'live') return false;
    }
    return true;
  }

  private sendPs(use: boolean): void {
    const a = this.replica!.local, p = a.player;
    const flags = (p.onGround ? PS_GROUND : 0) | (a.boating ? PS_BOAT : 0) | (a.motion.climbing ? PS_CLIMB : 0);
    const km = a.motion.mantle ?? null;
    const ps: Ps = {
      t: 'ps', seq: ++this.psSeq, tseq: this.tseq, x: p.x, y: p.y, vx: p.vx, vy: p.vy, flags, facing: a.facing,
      aim: [a.aimPx.x / TILE_SIZE, a.aimPx.y / TILE_SIZE], mine: a.miningHeld, use, slot: a.inventory.selected,
      mt: km ? encodeMantle({ p: km.t / km.dur, dir: km.dir, edgeX: km.edgeX, edgeY: km.edgeY }) : null,
    };
    this.link.send('state', JSON.stringify(ps));
  }

  /** 內插取樣寫進 replica：怪物（makeEnemy、id 照抄）、掉落物、投射物、NPC 位置。同 id 沿用舊物件（動畫相位接著走） */
  private writeInterp(nowMs: number, dt: number): void {
    if (this.wsTick === -Infinity) return;
    const game = this.replica!, t = this.interpNow(nowMs);
    const oldE = new Map(game.enemies.map((e) => [e.id, e]));
    const enemies: Enemy[] = [];
    for (const id of this.enemyIp.ids()) {
      const s = this.enemyIp.sample(id, t);
      if (!s) continue;
      let e = oldE.get(s.id);
      if (!e || e.kind !== s.kind) e = makeEnemy(s.id, s.kind, 0, 0); else e.age += dt;
      e.body.x = s.x; e.body.y = s.y;
      e.dir = s.dir === -1 ? -1 : 1;
      if (fin(s.hp)) e.hp = s.hp;
      if (fin(s.maxHp)) e.maxHp = s.maxHp;
      if (typeof s.state === 'string') e.state = s.state;
      enemies.push(e);
    }
    game.enemies = enemies;
    const drops = game.drops.list, oldD = new Map(drops.map((d) => [d.id, d]));
    const nd: DroppedItem[] = [];
    for (const id of this.dropIp.ids()) {
      const s = this.dropIp.sample(id, t);
      if (!s) continue;
      let d = oldD.get(s.id);
      if (!d || d.item !== s.item) {
        d = { id: s.id, item: s.item, count: 1, age: 0, pickDelay: 0, grabbed: false, body: { x: 0, y: 0, w: ITEM_SIZE, h: ITEM_SIZE, vx: 0, vy: 0, onGround: true, gfxOffY: 0 } };
      } else d.age += dt;
      d.count = fin(s.count) ? s.count : 1;
      d.body.x = s.x; d.body.y = s.y;
      nd.push(d);
    }
    drops.length = 0;
    drops.push(...nd);
    const proj = game.projectiles.list, oldP = new Map(proj.map((q) => [q.id, q]));
    const np: Projectile[] = [];
    for (const id of this.projIp.ids()) {
      const s = this.projIp.sample(id, t);
      if (!s) continue;
      let q = oldP.get(s.id);
      if (!q || q.kind !== s.kind) {
        try { q = this.projScratch.spawn(s.kind, Boolean(s.hostile), 0, 0, 0, 0); } catch { continue; }
        this.projScratch.list.length = 0;
        q.id = s.id;
      }
      q.hostile = Boolean(s.hostile);
      q.body.x = s.x; q.body.y = s.y;
      if (fin(s.vx)) q.body.vx = s.vx;
      if (fin(s.vy)) q.body.vy = s.vy;
      np.push(q);
    }
    proj.length = 0;
    proj.push(...np);
    for (const n of game.settle.npcs) this.placeNpc(n, `0:${n.id}`, t);
    for (const n of game.folk.npcs) this.placeNpc(n, `1:${n.id}`, t);
  }

  private placeNpc(n: { body: { x: number; y: number }; dir: 1 | -1 }, key: string, t: number): void {
    const s = this.npcIp.sample(key, t);
    if (!s) return;
    n.body.x = s.x; n.body.y = s.y;
    n.dir = s.dir === -1 ? -1 : 1;
  }
}
