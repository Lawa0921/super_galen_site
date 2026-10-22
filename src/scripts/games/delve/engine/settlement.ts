// settlement.ts — 據點（純邏輯，無 DOM）：
//   · 放下「據點爐心」宣告一塊範圍（核心 ±CLAIM 格）；範圍內的房間、家具、照明、圍欄決定據點分數與等級（Lv0..3）。
//   · 等級解鎖福利（PERKS）：重生點 / 安心（回血）→ 驅邪（範圍內不生怪）/ 合成站聯動 → 共享儲物 / 傳送點。
//   · 居民（npcs.ts 的五位）在條件達成、有空房（含床）時白天搬進來；作息：白天在家 / 上班、晚上回自己的床睡覺；
//     會自己開關門。離玩家很遠的居民凍結（不跑物理），CPU 很省。
//   · 存檔：核心位置 + 居民（種類、位置、家）+ 設為重生點的核心。
//   · 無限世界：核心範圍（±CLAIM.x）所在的區塊欄 pin 住、恆常駐（居民在那裡活動）；建立 / 讀檔時 pin、拆除時 unpin（B7）。
import type { World, TileWindow } from './world';
import { chunkOfX } from './coords';
import { T, isSolidTile } from './tiles';
import { checkRoom, scanRooms, type RoomCheck } from './housing';
import { DECOR_TILES, FURNITURE_BY_TILE, LIGHT_TILES, SAFETY_TILES } from './furniture';
import { NPCS, NPC_KINDS, npcActivity, npcMood, validIdent, withIdent, type NpcActivity, type NpcDef, type NpcIdent, type NpcKind } from './npcs';
import { normalizeAppearance } from './appearance';
import { makeBody, moveBody, type Body, type SolidQuery } from './physics';
import { TILE_SIZE as S, GRAVITY, MAX_FALL, JUMP_SPEED } from './constants';
import { findPath, findStandSpot, standable, type PathNode } from './npcPath';
import type { SunTimes } from './calendar';

/** 據點範圍：核心 ±x / ±y 格 */
export const CLAIM = { x: 40, y: 24 } as const;
/** 搬入檢查間隔（秒；白天才有人搬來） */
export const MOVE_IN_EVERY = 6;
/** 條件達成後過多久（遊戲秒）才真的搬來（≈ 3.5 遊戲小時；晚上不來，等到天亮） */
export const ARRIVE_DELAY = 90;
/** 回不了家（路被擋 / 卡在外面）這麼久（秒）就直接回房間 */
export const AWAY_LIMIT = 60;
/** 重算據點分數的最短間隔（秒；世界有變動才重算） */
export const EVAL_EVERY = 0.5;
/** 居民在這個距離（格）內才跑物理；再遠就凍結 */
export const NPC_ACTIVE = { x: 90, y: 60 };
const NPC_WALK = 52;

export type PerkId = 'spawn' | 'calm' | 'ward' | 'craft' | 'storage' | 'waypoint';
export const PERKS: Record<PerkId, { level: number; zh: string; desc: string }> = {
  spawn: { level: 1, zh: '重生點', desc: '可以把爐心設為重生點' },
  calm: { level: 1, zh: '安心', desc: '在據點範圍內回血加快' },
  ward: { level: 2, zh: '驅邪', desc: '據點範圍內不會生成怪物' },
  craft: { level: 2, zh: '合成站聯動', desc: '範圍內的合成站不論遠近一起作用' },
  storage: { level: 3, zh: '共享儲物', desc: '合成時直接使用範圍內箱子裡的材料' },
  waypoint: { level: 3, zh: '傳送點', desc: '在 Lv3 據點的爐心之間快速移動' },
};
export const PERK_ORDER: readonly PerkId[] = ['spawn', 'calm', 'ward', 'craft', 'storage', 'waypoint'];
/** 安心：每秒額外回血 */
export const CALM_REGEN = 1.5;

export interface Metrics {
  /** 合格房間數 */
  rooms: number;
  /** 合格房間的舒適度總和 */
  comfort: number;
  /** 家具種類數 */
  variety: number;
  /** 裝飾件數 */
  decor: number;
  /** 光源數 */
  light: number;
  /** 安全（戶外照明 + 圍欄） */
  safety: number;
  score: number;
}
export const LEVEL_NAMES = ['無', '營地', '聚落', '村莊'] as const;
export interface LevelNeed { rooms: number; score: number; variety: number; decor: number; }
/** 升到第 i+1 級的需求 */
export const LEVELS: readonly LevelNeed[] = [
  { rooms: 1, score: 0, variety: 0, decor: 0 },
  { rooms: 2, score: 45, variety: 6, decor: 2 },
  { rooms: 3, score: 90, variety: 10, decor: 6 },
];
export const MAX_LEVEL = LEVELS.length;

/** 分數：每間合格房 10、舒適度、家具種類 ×2、裝飾（上限 15）、光源（上限 10）、安全（上限 10） */
export function scoreOf(m: Omit<Metrics, 'score'>): number {
  return Math.round(m.rooms * 10 + m.comfort + m.variety * 2 + Math.min(15, m.decor) + Math.min(10, m.light) + Math.min(10, m.safety));
}
export function levelFor(m: Metrics): number {
  let lv = 0;
  for (const n of LEVELS) {
    if (m.rooms >= n.rooms && m.score >= n.score && m.variety >= n.variety && m.decor >= n.decor) lv++;
    else break;
  }
  return lv;
}
export interface NeedItem { zh: string; have: number; need: number; ok: boolean; }
/** 下一級的需求清單（已滿級 → 空） */
export function nextNeeds(m: Metrics, level: number): NeedItem[] {
  const n = LEVELS[level];
  if (!n) return [];
  const it = (zh: string, have: number, need: number): NeedItem => ({ zh, have, need, ok: have >= need });
  const out = [it('可入住的房間', m.rooms, n.rooms)];
  if (n.score) out.push(it('據點分數', m.score, n.score));
  if (n.variety) out.push(it('家具種類', m.variety, n.variety));
  if (n.decor) out.push(it('裝飾', m.decor, n.decor));
  return out;
}
export function perksFor(level: number): PerkId[] { return PERK_ORDER.filter((p) => PERKS[p].level <= level); }

export interface Core { id: number; x: number; y: number; }
export interface Evaluation {
  core: Core;
  rooms: RoomCheck[];
  valid: RoomCheck[];
  metrics: Metrics;
  level: number;
  /** 範圍內各種 tile 的件數（家具 / 合成站 / 盆栽…；雙格只算左半） */
  counts: Map<number, number>;
  /** 範圍內的箱子（tile index） */
  chests: number[];
}

export function inClaim(c: { x: number; y: number }, x: number, y: number): boolean {
  return Math.abs(x - c.x) <= CLAIM.x && Math.abs(y - c.y) <= CLAIM.y;
}
/** 兩個核心的範圍重疊 */
export function claimsOverlap(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) <= CLAIM.x * 2 && Math.abs(a.y - b.y) <= CLAIM.y * 2;
}

/** 評估一個據點（掃描範圍內所有房間與家具） */
/** evaluate 的視窗暫存（world.window 重用） */
let EVAL_WIN: TileWindow | undefined;
export function evaluate(w: World, core: Core, gardenBonus = false): Evaluation {
  const x0 = Math.max(w.xMin, core.x - CLAIM.x), x1 = Math.min(w.xMax - 1, core.x + CLAIM.x);
  const y0 = Math.max(0, core.y - CLAIM.y), y1 = Math.min(w.height - 1, core.y + CLAIM.y);
  const rooms = scanRooms(w, x0, y0, x1, y1);
  const valid = rooms.filter((r) => r.ok);
  const indoor = new Set<number>();
  for (const r of rooms) if (r.reasons[0] !== 'open') for (const t of r.tiles) indoor.add(t);
  const counts = new Map<number, number>();
  const chests: number[] = [];
  let light = 0, decor = 0, safety = 0;
  const win = (EVAL_WIN = w.window(x0, y0, Math.max(0, x1 - x0 + 1), Math.max(0, y1 - y0 + 1), EVAL_WIN));
  const ww = win.w;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const id = win.fg[(y - y0) * ww + (x - x0)];
    if (id === T.AIR || isSolidTile(id) && id !== T.GLASS) continue;
    const i = w.idx(x, y);
    if (id === T.CHEST) chests.push(i);
    if (LIGHT_TILES.has(id)) { light++; if (!indoor.has(i)) safety++; }
    if (DECOR_TILES.has(id)) decor++;
    if (SAFETY_TILES.has(id)) safety += 0.5;
    if (FURNITURE_BY_TILE.has(id) || id === T.HEARTH) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  let comfort = valid.reduce((a, r) => a + r.comfort, 0);
  if (gardenBonus) comfort += Math.floor((counts.get(T.POTTED_PLANT) ?? 0) / 2);
  const variety = [...counts.keys()].filter((id) => FURNITURE_BY_TILE.has(id)).length;
  const base = { rooms: valid.length, comfort: Math.round(comfort * 10) / 10, variety, decor, light, safety: Math.floor(safety) };
  const metrics: Metrics = { ...base, score: scoreOf(base) };
  return { core, rooms, valid, metrics, level: levelFor(metrics), counts, chests };
}

// ── 居民 ────────────────────────────────────────────────
export interface Npc {
  id: number;
  kind: NpcKind;
  body: Body;
  /** 住在哪個據點（核心 id） */
  core: number;
  /** 自己房間的 key（housing RoomCheck.key）；null = 沒有房間 */
  home: number | null;
  /** 自己的床（床頭） */
  bed: { x: number; y: number } | null;
  /** 房間內部範圍（散步用） */
  room: { x0: number; x1: number; y1: number } | null;
  act: NpcActivity;
  state: 'idle' | 'walk' | 'sleep';
  dir: 1 | -1;
  targetX: number | null;
  /** 狀態計時 / 卡住計時（秒） */
  t: number; stuck: number;
  mood: number;
  moodNotes: string[];
  /** 正在幫它開著的門（欄 + 上下範圍） */
  door: { x: number; top: number; bot: number } | null;
  /** 說過幾次話（換句用） */
  talks: number;
  /** 剛說的話與剩餘顯示秒數（頭上對話泡泡） */
  say: string | null; sayT: number;
  /** 目的地的列（tile；尋路用，省略 = 只看欄） */
  goalY?: number;
  /** 該在家卻不在房間裡的累計秒數（homeFallback） */
  away?: number;
  /** 快取的路（世界改了 / 目的地換了才重算） */
  path?: { nodes: PathNode[]; rev: number; gx: number; gy: number | undefined } | null;
}
export interface NpcJSON { kind: NpcKind; x: number; y: number; core: number; home: number | null; talks?: number; /** 只有 toJSON({ ids: true })（連線的世界快照）才帶；存檔不帶 */ id?: number; }
export interface PendingJSON { kind: NpcKind; core: number; at: number; }
export interface SettlementJSON { cores: Core[]; npcs: NpcJSON[]; spawnCore: number | null; nextId: number; pending?: PendingJSON | null; invited?: NpcKind[]; idents?: Partial<Record<NpcKind, NpcIdent>>; }

export type SettleEvent =
  /** coming = 條件達成、在路上（ARRIVE_DELAY 後從據點邊緣走進來）；arrive = 走進據點了 */
  | { type: 'npc'; phase: 'coming' | 'arrive' | 'leave' | 'homeless'; kind: NpcKind; x: number; y: number }
  | { type: 'settlement'; phase: 'found' | 'level' | 'lost'; id: number; level: number; x: number; y: number }
  /** 所有據點合格房間的總數變多了（經驗用；x, y = 新房間的位置 px） */
  | { type: 'rooms'; total: number; x: number; y: number };

/** 據點系統要從遊戲拿的東西 */
export interface SettleHost {
  world: World;
  time: number;
  isNight(): boolean;
  sun(): SunTimes;
  dayFrac(): number;
  /** 活著的玩家站的 tile（插入順序；全員死亡 → 所有人的） */
  playerTiles(): { x: number; y: number }[];
  /** 有任何玩家的身體碰到 tile（關門前確認沒夾到人） */
  playerOverlaps(x: number, y: number): boolean;
  /** 已知的生態區（居民入住時取名用；可省略） */
}

const isDoor = (id: number): boolean => id === T.DOOR_CLOSED || id === T.DOOR_OPEN;

export class Settlements {
  cores: Core[] = [];
  npcs: Npc[] = [];
  /**
   * 設為重生點的核心 id。重生點是每個角色自己的（spec §5.1）：DelveGame 用 spawnLink 把它接到本地玩家
   * （PlayerActor.spawnCore），存檔 / 讀檔照舊讀寫這個欄位；沒接（單獨測 Settlements）就存在這裡。
   */
  get spawnCore(): number | null { return this.spawnLink ? this.spawnLink.get() : this.ownSpawnCore; }
  set spawnCore(v: number | null) { if (this.spawnLink) this.spawnLink.set(v); else this.ownSpawnCore = v; }
  spawnLink: { get(): number | null; set(v: number | null): void } | null = null;
  private ownSpawnCore: number | null = null;
  nextId = 1;
  private evals = new Map<number, Evaluation>();
  private evalRev = -1;
  /** 客人副本（load 帶 trust）：只重算房間評估供顯示，不重新分配居民、不發事件——據點狀態一律以房主為準 */
  private trusted = false;
  private evalT = 0;
  private moveInT = 0;
  /** 正在路上的居民（條件達成時排定，at = 抵達的遊戲時間） */
  pending: PendingJSON | null = null;
  /** 邀請過的招募型居民（藥師 / 嚮導）：條件達成就會搬來 */
  readonly invited = new Set<NpcKind>();
  /** 邀請招募型居民（已經住進來 / 已邀請 → false） */
  invite(kind: NpcKind, ident?: NpcIdent): boolean {
    if (!NPCS[kind].need.recruit || this.invited.has(kind) || this.npc(kind)) return false;
    this.invited.add(kind);
    if (ident) this.idents[kind] = { name: ident.name, look: { ...ident.look, app: { ...ident.look.app } } };
    return true;
  }
  /** 招募型居民的個人身分（被邀請的那個人；存檔內容） */
  idents: Partial<Record<NpcKind, NpcIdent>> = {};
  /** 這位居民的設定（套上被邀請那個人的名字 / 外觀） */
  def(kind: NpcKind): NpcDef { return withIdent(kind, this.idents[kind]); }
  nameOf(kind: NpcKind): string { return this.def(kind).name; }
  /** 搬來前的等待（遊戲秒；測試 / e2e 可以調短） */
  arriveDelay = ARRIVE_DELAY;
  private lastLevel = new Map<number, number>();
  /** 上次重算時所有據點的合格房間總數（rooms 事件） */
  private lastRooms = 0;
  private events: SettleEvent[] = [];
  /** pin 住核心範圍的世界（DelveGame 建構時 attach；沒接 = 不 pin，單獨測 Settlements） */
  private pinWorld: World | null = null;
  /** 目前因核心而 pin 住的區塊欄 */
  private readonly pinnedCols = new Set<number>();

  drainEvents(): SettleEvent[] { const e = this.events; this.events = []; return e; }

  /** 接上世界：之後建立 / 拆除 / 讀檔的核心都會 pin / unpin 範圍內的欄 */
  attach(w: World): void { this.pinWorld = w; this.syncPins(w); }
  /** 核心 c 範圍內的區塊欄（夾在世界邊界內） */
  private claimCols(w: World, x: number): number[] {
    const a = chunkOfX(Math.max(w.xMin, x - CLAIM.x)), b = chunkOfX(Math.min(w.xMax - 1, x + CLAIM.x));
    const out: number[] = [];
    for (let c = a; c <= b; c++) out.push(c);
    return out;
  }
  /** 依目前的核心重設 pin：不再需要的 unpin、新的 pin 並載入 */
  private syncPins(w: World): void {
    const want = new Set<number>();
    for (const c of this.cores) for (const cx of this.claimCols(w, c.x)) want.add(cx);
    for (const cx of this.pinnedCols) if (!want.has(cx)) { w.unpin(cx); this.pinnedCols.delete(cx); }
    for (const cx of want) {
      if (!this.pinnedCols.has(cx)) { w.pin(cx); this.pinnedCols.add(cx); }
      w.ensureColumn(cx);
    }
  }

  // ── 核心 ──
  coreAt(x: number, y: number): Core | null { return this.cores.find((c) => c.x === x && c.y === y) ?? null; }
  coreById(id: number): Core | null { return this.cores.find((c) => c.id === id) ?? null; }
  /** (x,y) 所在的據點（核心範圍包含它） */
  claimAt(x: number, y: number): Core | null { return this.cores.find((c) => inClaim(c, x, y)) ?? null; }
  /** 能不能在 (x,y) 放核心：和既有核心範圍重疊 → 'overlap' */
  canFound(x: number, y: number): 'ok' | 'overlap' {
    return this.cores.some((c) => claimsOverlap(c, { x, y })) ? 'overlap' : 'ok';
  }
  found(x: number, y: number): Core {
    const c: Core = { id: this.nextId++, x, y };
    this.cores.push(c);
    this.lastLevel.set(c.id, 0);
    this.evalRev = -1;
    this.events.push({ type: 'settlement', phase: 'found', id: c.id, level: 0, x, y });
    if (this.pinWorld) this.syncPins(this.pinWorld);
    return c;
  }
  /** 核心被拆掉：據點消失、居民搬走 */
  remove(x: number, y: number): void {
    const c = this.coreAt(x, y);
    if (!c) return;
    this.cores = this.cores.filter((q) => q !== c);
    this.evals.delete(c.id);
    this.lastLevel.delete(c.id);
    if (this.spawnCore === c.id) this.spawnCore = null;
    for (const n of this.npcs.filter((q) => q.core === c.id)) this.events.push({ type: 'npc', phase: 'leave', kind: n.kind, x: n.body.x, y: n.body.y });
    this.npcs = this.npcs.filter((q) => q.core !== c.id);
    this.events.push({ type: 'settlement', phase: 'lost', id: c.id, level: 0, x, y });
    if (this.pinWorld) this.syncPins(this.pinWorld);
  }

  // ── 評估（快取：世界有改才重算） ──
  evaluation(id: number, w: World): Evaluation | null {
    const c = this.coreById(id);
    if (!c) return null;
    this.refresh(w);
    return this.evals.get(id) ?? null;
  }
  /** 強制重算（測試 / UI 打開面板時） */
  refresh(w: World, force = false): void {
    if (!force && this.evalRev === w.rev && this.evals.size === this.cores.length) return;
    this.evalRev = w.rev;
    this.evals.clear();
    for (const c of this.cores) {
      const garden = this.npcs.some((n) => n.core === c.id && n.kind === 'gardener');
      this.evals.set(c.id, evaluate(w, c, garden));
    }
    if (this.trusted) return;
    this.assignHomes(w);
    this.updateMoods();
    let total = 0, nx = 0, ny = 0;
    for (const ev of this.evals.values()) for (const r of ev.valid) { total++; nx = (r.x0 + r.x1 + 1) * S / 2; ny = r.y0 * S; }
    if (total > this.lastRooms) this.events.push({ type: 'rooms', total, x: nx, y: ny });
    this.lastRooms = total;
    for (const c of this.cores) {
      const lv = this.evals.get(c.id)?.level ?? 0, prev = this.lastLevel.get(c.id);
      if (prev !== undefined && lv > prev) this.events.push({ type: 'settlement', phase: 'level', id: c.id, level: lv, x: c.x, y: c.y });
      this.lastLevel.set(c.id, lv);
    }
  }
  levelAt(x: number, y: number, w: World): number {
    const c = this.claimAt(x, y);
    if (!c) return 0;
    return this.evaluation(c.id, w)?.level ?? 0;
  }
  /** (x,y) 生效的福利 */
  perksAt(x: number, y: number, w: World): PerkId[] { return perksFor(this.levelAt(x, y, w)); }
  hasPerk(x: number, y: number, w: World, p: PerkId): boolean { return this.levelAt(x, y, w) >= PERKS[p].level; }

  // ── 居民：房間分配 ──
  /** 據點裡還沒被別的居民住走的合格房間 */
  freeRooms(id: number, w: World): RoomCheck[] {
    const ev = this.evaluation(id, w);
    if (!ev) return [];
    const taken = new Set(this.npcs.filter((n) => n.core === id && n.home !== null).map((n) => n.home));
    return ev.valid.filter((r) => !taken.has(r.key));
  }
  private assignHomes(w: World): void {
    for (const n of this.npcs) {
      const ev = this.evals.get(n.core);
      const cur = ev?.valid.find((r) => r.key === n.home) ?? null;
      if (cur) { this.setHome(n, cur); continue; }
      const had = n.home !== null;
      n.home = null; n.bed = null; n.room = null;
      if (!ev) continue;
      const taken = new Set(this.npcs.filter((q) => q !== n && q.core === n.core && q.home !== null).map((q) => q.home));
      const free = ev.valid.find((r) => !taken.has(r.key));
      if (free) this.setHome(n, free);
      else if (had) this.events.push({ type: 'npc', phase: 'homeless', kind: n.kind, x: n.body.x, y: n.body.y });
    }
    void w;
  }
  private setHome(n: Npc, r: RoomCheck): void {
    n.home = r.key; n.bed = r.bed; n.room = { x0: r.x0, x1: r.x1, y1: r.y1 };
  }
  private updateMoods(): void {
    for (const n of this.npcs) {
      const ev = this.evals.get(n.core);
      const room = ev?.valid.find((r) => r.key === n.home);
      const m = npcMood(n.kind, {
        comfort: room?.comfort ?? 0, level: ev?.level ?? 0,
        neighbours: this.npcs.filter((q) => q !== n && q.core === n.core).map((q) => q.kind), homeless: n.home === null,
      });
      n.mood = m.value; n.moodNotes = m.notes;
    }
  }
  npc(kind: NpcKind): Npc | null { return this.npcs.find((n) => n.kind === kind) ?? null; }
  residents(id: number): Npc[] { return this.npcs.filter((n) => n.core === id); }

  /** 這位居民現在能不能搬進 core：等級、指定 tile、空房 */
  canMoveIn(kind: NpcKind, id: number, w: World): { ok: boolean; why: string } {
    const ev = this.evaluation(id, w);
    if (!ev) return { ok: false, why: '沒有據點' };
    const need = NPCS[kind].need;
    if (need.recruit && !this.invited.has(kind)) return { ok: false, why: need.zh };
    if (ev.level < need.level) return { ok: false, why: `據點要 Lv${need.level}` };
    if (need.tiles) {
      const have = need.tiles.reduce((a, t) => a + (ev.counts.get(t) ?? 0), 0);
      if (have < (need.count ?? 1)) return { ok: false, why: need.zh };
    }
    if (!this.freeRooms(id, w).length) return { ok: false, why: '沒有空房間（要有床）' };
    return { ok: true, why: '' };
  }
  /**
   * 讓一位居民搬進來（條件不符 → null）；force = 不檢查條件（debug）。
   * walkIn = 從據點範圍邊緣（靠房間那側）站得住的地方出現、自己走回家；否則直接出現在房間裡（debug / 讀檔）。
   */
  moveIn(kind: NpcKind, id: number, w: World, force = false, walkIn = false): Npc | null {
    if (this.npc(kind)) return null;
    if (!force && !this.canMoveIn(kind, id, w).ok) return null;
    const core = this.coreById(id);
    if (!core) return null;
    const room = this.freeRooms(id, w)[0] ?? null;
    let sx = room ? Math.floor((room.x0 + room.x1) / 2) : core.x + 1;
    let sy = room ? room.y1 : core.y;
    const inRoom = findStandSpot(w, sx, sy, 4);
    if (inRoom) { sx = inRoom.x; sy = inRoom.y; }
    if (walkIn) {
      const side = room && (room.x0 + room.x1) / 2 < core.x ? -1 : 1;
      const ex = Math.max(w.xMin + 2, Math.min(w.xMax - 3, core.x + side * (CLAIM.x - 2)));
      const spot = findStandSpot(w, ex, core.y, 12) ?? findStandSpot(w, core.x + 1, core.y, 10);
      if (spot) { sx = spot.x; sy = spot.y; }
    }
    const n = this.makeNpc(kind, id, sx, sy);
    if (room) this.setHome(n, room);
    this.npcs.push(n);
    this.updateMoods();
    this.events.push({ type: 'npc', phase: 'arrive', kind, x: n.body.x, y: n.body.y });
    return n;
  }
  private makeNpc(kind: NpcKind, core: number, tx: number, ty: number): Npc {
    const b = makeBody(0, 0);
    b.x = tx * S + S / 2 - b.w / 2; b.y = (ty + 1) * S - b.h;
    return {
      id: this.nextId++, kind, body: b, core, home: null, bed: null, room: null, act: 'home', state: 'idle', dir: 1, targetX: null,
      t: 0, stuck: 0, mood: 50, moodNotes: [], door: null, talks: 0, say: null, sayT: 0,
    };
  }

  // ── 每刻 ──
  update(dt: number, h: SettleHost): void {
    const w = h.world;
    this.evalT -= dt;
    if (this.evalT <= 0 && (this.evalRev !== w.rev || this.evals.size !== this.cores.length)) { this.evalT = EVAL_EVERY; this.refresh(w); }
    // 白天：有人搬進來（每次檢查最多一位）
    this.moveInT -= dt;
    if (this.moveInT <= 0) {
      this.moveInT = MOVE_IN_EVERY;
      if (!h.isNight()) this.tryMoveIn(w, h.time);
    }
    const night = h.isNight(), sun = h.sun(), d = h.dayFrac(), tiles = h.playerTiles();
    for (const n of this.npcs) {
      if (n.sayT > 0) { n.sayT -= dt; if (n.sayT <= 0) n.say = null; }
      const act = npcActivity(d, sun, night, n.bed !== null);
      if (act !== n.act) { n.act = act; n.targetX = null; n.t = 0; n.stuck = 0; if (n.state === 'sleep' && act !== 'sleep') this.wake(n, w); }
      // 離每個玩家都超過活動範圍才凍結
      const far = tiles.every((pt) => Math.abs(n.body.x / S - pt.x) > NPC_ACTIVE.x || Math.abs(n.body.y / S - pt.y) > NPC_ACTIVE.y);
      if (far) { this.freeze(n, w); continue; }
      this.stepNpc(n, dt, w, h);
      this.homeFallback(n, dt, w);
    }
  }
  /**
   * 搬入（白天、每 MOVE_IN_EVERY 秒）：照 NPC_KINDS 順序找第一位條件符合的人 → 排定「在路上」（coming 事件）；
   * arriveDelay 秒後還符合條件 → 從據點邊緣走進來（arrive 事件）。條件不再符合 → 取消。
   */
  tryMoveIn(w: World, now = 0): Npc | null {
    const p = this.pending;
    if (p) {
      if (!this.coreById(p.core) || this.npc(p.kind) || !this.canMoveIn(p.kind, p.core, w).ok) { this.pending = null; return null; }
      if (now < p.at) return null;
      this.pending = null;
      return this.moveIn(p.kind, p.core, w, false, true);
    }
    for (const kind of NPC_KINDS) {
      if (this.npc(kind)) continue;
      for (const c of this.cores) {
        if (!this.canMoveIn(kind, c.id, w).ok) continue;
        this.pending = { kind, core: c.id, at: now + this.arriveDelay };
        this.events.push({ type: 'npc', phase: 'coming', kind, x: c.x, y: c.y });
        return null;
      }
    }
    return null;
  }
  /** 該在家（home / sleep）卻一直不在房間裡（路被擋住）→ AWAY_LIMIT 秒後直接回房間 */
  private homeFallback(n: Npc, dt: number, w: World): void {
    if (!n.room || n.state === 'sleep' || n.act === 'work') { n.away = 0; return; }
    const b = n.body, fx = Math.floor((b.x + b.w / 2) / S), fy = Math.floor((b.y + b.h - 1) / S);
    const inside = fx >= n.room.x0 && fx <= n.room.x1 && Math.abs(fy - n.room.y1) <= 1;
    n.away = inside ? 0 : (n.away ?? 0) + dt;
    if ((n.away ?? 0) < AWAY_LIMIT) return;
    n.away = 0;
    const spot = findStandSpot(w, Math.floor((n.room.x0 + n.room.x1) / 2), n.room.y1, 4);
    const x = spot ? spot.x : Math.floor((n.room.x0 + n.room.x1) / 2), y = spot ? spot.y : n.room.y1;
    b.x = x * S + S / 2 - b.w / 2; b.y = (y + 1) * S - b.h; b.vx = 0; b.vy = 0;
    n.path = null; n.targetX = null;
    void w;
  }
  /** 遠處：不跑物理，直接放到該在的地方（晚上在床上、白天在房間裡） */
  private freeze(n: Npc, w: World): void {
    if (n.act === 'sleep' && n.bed && n.state !== 'sleep') this.lieDown(n, w);
  }
  private lieDown(n: Npc, w: World): void {
    if (!n.bed) return;
    this.closeDoor(n, w, true);
    n.state = 'sleep';
    n.body.x = n.bed.x * S; n.body.y = (n.bed.y + 1) * S - n.body.h;
    n.body.vx = 0; n.body.vy = 0;
    n.dir = 1;
  }
  private wake(n: Npc, w: World): void {
    n.state = 'idle';
    // 起床：站到床邊最近的空位（不會卡進牆裡）
    if (n.bed) {
      const spot = findStandSpot(w, n.bed.x + 1, n.bed.y, 4);
      const x = spot ? spot.x : n.bed.x + 1, y = spot ? spot.y : n.bed.y;
      n.body.x = x * S + S / 2 - n.body.w / 2; n.body.y = (y + 1) * S - n.body.h;
    }
  }
  private overlapsSolid(n: Npc, w: World): boolean {
    const b = n.body;
    for (let ty = Math.floor(b.y / S); ty <= Math.floor((b.y + b.h - 0.01) / S); ty++) {
      for (let tx = Math.floor(b.x / S); tx <= Math.floor((b.x + b.w - 0.01) / S); tx++) if (w.isSolid(tx, ty)) return true;
    }
    return false;
  }
  /** 目的地欄（px 中心） */
  private goal(n: Npc, w: World): number | null {
    const ev = this.evals.get(n.core), core = this.coreById(n.core);
    n.goalY = undefined;
    if (n.act === 'sleep' && n.bed) { n.goalY = n.bed.y; return (n.bed.x + 1) * S; }
    if (n.act === 'work' && ev && core) {
      const work = NPCS[n.kind].work ?? [];
      let best: number | null = null, bd = Infinity;
      if (work.length) {
        // 整個據點範圍找最近的工作 tile（站在它旁邊）；走不走得到交給尋路
        const x0 = Math.max(w.xMin, core.x - CLAIM.x), x1 = Math.min(w.xMax - 1, core.x + CLAIM.x);
        const y0 = Math.max(0, core.y - CLAIM.y), y1 = Math.min(w.height - 1, core.y + CLAIM.y);
        const ny = Math.floor((n.body.y + n.body.h - 1) / S);
        const win = (EVAL_WIN = w.window(x0, y0, Math.max(0, x1 - x0 + 1), Math.max(0, y1 - y0 + 1), EVAL_WIN));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          if (!work.includes(win.fg[(y - y0) * win.w + (x - x0)])) continue;
          const dd = Math.abs(x * S - n.body.x) + Math.abs(y - ny) * S * 3;
          if (dd < bd) { bd = dd; best = (x + 0.5) * S + (x * S > n.body.x ? -S : S); n.goalY = y; }
        }
      }
      if (best !== null) return best;
      n.goalY = core.y;
      return (core.x + 0.5) * S + ((n.id % 3) - 1) * 2 * S;
    }
    if (n.room) {
      n.goalY = n.room.y1;
      const span = Math.max(0, n.room.x1 - n.room.x0);
      const r = ((n.id * 7 + Math.floor(n.t * 0.37)) % (span + 1));
      return (n.room.x0 + r + 0.5) * S;
    }
    return core ? (core.x + 0.5) * S : null;
  }
  private stepNpc(n: Npc, dt: number, w: World, h: SettleHost): void {
    const b = n.body;
    n.t += dt;
    if (n.state === 'sleep') { if (n.act !== 'sleep') this.wake(n, w); return; }
    if (n.act === 'sleep' && n.bed) {
      const bx = (n.bed.x + 1) * S;
      if (Math.abs(b.x + b.w / 2 - bx) < S * 0.75 && Math.abs(b.y + b.h - (n.bed.y + 1) * S) < S * 1.5) { this.lieDown(n, w); return; }
      if (n.t > 14) { this.lieDown(n, w); return; } // 走不到床邊（路被擋住）：直接回床上
    }
    // 目的地：到了就停一下再換下一個點
    if (n.targetX === null) {
      if (n.state === 'idle' && n.t < 2 + (n.id % 5)) { b.vx = 0; this.physics(n, dt, w, h); return; }
      n.targetX = this.goal(n, w);
      n.state = 'walk'; n.t = n.act === 'sleep' ? n.t : 0; n.stuck = 0;
    }
    const tx = n.targetX;
    const cx = b.x + b.w / 2;
    const step = tx === null ? null : this.nextStep(n, tx, w);
    if (tx === null || step === null) {
      n.targetX = null; n.state = 'idle'; b.vx = 0; n.path = null;
      if (n.act !== 'sleep') n.t = 0;
    } else {
      n.dir = step.x > cx ? 1 : -1;
      b.vx = Math.abs(step.x - cx) < 2 ? 0 : n.dir * NPC_WALK;
      // 下一步比腳下高兩格：起跳
      if (step.up >= 2 && b.onGround) b.vy = -JUMP_SPEED;
      this.openDoorAhead(n, w);
    }
    const res = this.physics(n, dt, w, h);
    if (n.state === 'walk' && res.hitX) {
      n.stuck += dt;
      if (b.onGround && n.stuck > 0.25 && n.stuck < 0.3) b.vy = -JUMP_SPEED;
      if (n.stuck > 2.5) { n.targetX = null; n.state = 'idle'; n.t = 0; b.vx = 0; }
    } else n.stuck = 0;
    this.closeDoor(n, w, false, h);
  }
  /**
   * 沿著 BFS 路往目的地走：回傳這一刻要朝向的 px 與下一格比腳下高幾格；已經到了 → null。
   * 路以 world.rev + 目的地快取（世界沒變就不重算）；人不在路上（被推走 / 掉下去）才重算。
   */
  private nextStep(n: Npc, tx: number, w: World): { x: number; up: number } | null {
    const b = n.body, cx = b.x + b.w / 2;
    const fx = Math.floor(cx / S), fy = Math.floor((b.y + b.h - 1) / S), gx = Math.floor(tx / S);
    const atY = n.goalY === undefined || Math.abs(fy - n.goalY) <= 1;
    if (fx === gx && atY && Math.abs(tx - cx) < 3) return null;
    const core = this.coreById(n.core);
    const bounds = core ? { x0: core.x - CLAIM.x - 12, x1: core.x + CLAIM.x + 12, y0: core.y - CLAIM.y - 12, y1: core.y + CLAIM.y + 12 } : undefined;
    let p = n.path;
    const air = !b.onGround;
    // 身體 20px 寬，會跨兩欄：兩欄都算「在路上」
    const cols = [fx, Math.floor(b.x / S), Math.floor((b.x + b.w - 0.01) / S)];
    // 取路上最後一個碰得到的節點（走得最遠的那個），不會卡在「以為還在上一格」
    const onPath = (q: typeof p): number => {
      if (!q) return -1;
      for (let k = q.nodes.length - 1; k >= 0; k--) { const m = q.nodes[k]; if (cols.includes(m.x) && Math.abs(m.y - fy) <= (air ? 6 : 1)) return k; }
      return -1;
    };
    let i = onPath(p);
    // 跳 / 掉的途中不重算（空中站不住，BFS 會只回傳起點）
    if (air && p && i >= 0) { const nx = p.nodes[i + 1]; return nx ? { x: (nx.x + 0.5) * S, up: 0 } : { x: tx, up: 0 }; }
    if (air && !p) return { x: tx, up: 0 };
    if (!p || p.rev !== w.rev || p.gx !== gx || p.gy !== n.goalY || i < 0) {
      const sx = cols.find((c) => standable(w, c, fy)) ?? fx;
      p = n.path = { nodes: findPath(w, sx, fy, gx, n.goalY, undefined, bounds), rev: w.rev, gx, gy: n.goalY };
      i = onPath(p);
      if (i < 0) i = 0;
    }
    const next = p.nodes[i + 1];
    if (!next) {
      // 路的終點：到目的地那欄就對準 px，不然（到不了）就停
      // 走到路的盡頭：盡頭就是目的地那欄 → 對準目的地 px；到不了（盡頭不是目的地）→ 停
      const last = p.nodes[p.nodes.length - 1];
      if (atY && last.x === gx && Math.abs(tx - cx) >= 3) return { x: tx, up: 0 };
      return null;
    }
    if (next.x === gx && i + 2 >= p.nodes.length) return { x: tx, up: fy - next.y };
    // 往下掉：身體比一格寬，要多走一點才會整個離開台邊
    const d = Math.sign(next.x - p.nodes[i].x);
    const over = next.y > p.nodes[i].y && d ? d * ((b.w - S) / 2 + 3) : 0;
    return { x: (next.x + 0.5) * S + over, up: fy - next.y };
  }
  private physics(n: Npc, dt: number, w: World, h: SettleHost): { hitX: boolean } {
    const b = n.body;
    b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt);
    const q: SolidQuery = { isSolid: (x, y) => w.isSolid(x, y), isPlatform: (x, y) => w.isPlatform(x, y), isHalf: (x, y) => w.isHalf(x, y) };
    const r = moveBody(q, b, dt, b.onGround);
    if (b.gfxOffY > 0) b.gfxOffY = Math.max(0, b.gfxOffY - 120 * dt);
    void h;
    return r;
  }
  /** 前方（身體下半段）有關著的門 → 打開（記下來，走過去再關） */
  private openDoorAhead(n: Npc, w: World): void {
    const b = n.body;
    const ax = n.dir > 0 ? Math.floor((b.x + b.w + 2) / S) : Math.floor((b.x - 2) / S);
    const fy = Math.floor((b.y + b.h - 1) / S);
    if (w.getFg(ax, fy) !== T.DOOR_CLOSED) return;
    let top = fy, bot = fy;
    while (isDoor(w.getFg(ax, top - 1)) && fy - top < 4) top--;
    while (isDoor(w.getFg(ax, bot + 1)) && bot - fy < 4) bot++;
    for (let y = top; y <= bot; y++) w.setFg(ax, y, T.DOOR_OPEN);
    n.door = { x: ax, top, bot };
  }
  /** 走過門口（離門那欄超過一格）就把門關回去；夾到玩家 / 自己就先不關 */
  private closeDoor(n: Npc, w: World, force: boolean, h?: SettleHost): void {
    const d = n.door;
    if (!d) return;
    const b = n.body;
    const away = b.x > (d.x + 1) * S + 2 || b.x + b.w < d.x * S - 2;
    if (!force && !away) return;
    for (let y = d.top; y <= d.bot; y++) {
      if (w.getFg(d.x, y) !== T.DOOR_OPEN) { n.door = null; return; }
      if (h?.playerOverlaps(d.x, y)) return;
    }
    for (let y = d.top; y <= d.bot; y++) w.setFg(d.x, y, T.DOOR_CLOSED);
    n.door = null;
  }

  /** 世界 px (x,y) 上的居民（點擊對話用） */
  npcAtPx(x: number, y: number, pad = 4): Npc | null {
    for (const n of this.npcs) {
      const b = n.body;
      if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) return n;
    }
    return null;
  }

  // ── 存檔 ──
  toJSON(opts: { ids?: boolean } = {}): SettlementJSON {
    const r = (v: number): number => Math.round(v * 100) / 100;
    return {
      cores: this.cores.map((c) => ({ ...c })), spawnCore: this.spawnCore, nextId: this.nextId, pending: this.pending ? { ...this.pending } : null,
      invited: [...this.invited],
      idents: Object.fromEntries(Object.entries(this.idents).map(([k, v]) => [k, { name: v.name, look: { ...v.look, app: { ...v.look.app } } }])),
      npcs: this.npcs.map((n) => {
        // 睡著的人存成床邊站著（讀檔後依時段再躺回去）
        const o: NpcJSON = { kind: n.kind, x: r(n.body.x), y: r(n.body.y), core: n.core, home: n.home };
        if (n.talks) o.talks = n.talks;
        if (opts.ids) o.id = n.id;
        return o;
      }),
    };
  }
  /** 讀檔：壞欄位丟掉（不讓存檔壞掉）；核心那格不是爐心了也丟掉 */
  /** trust = true：客人副本（核心那格的爐心還在等 chunk 同步，不驗；單機一律 false） */
  load(j: unknown, w: World, trust = false): void {
    this.trusted = trust;
    this.cores = []; this.npcs = []; this.spawnCore = null; this.evals.clear(); this.evalRev = -1; this.lastLevel.clear(); this.invited.clear(); this.idents = {};
    if (!j || typeof j !== 'object') { this.syncPins(w); return; }
    const o = j as Partial<SettlementJSON>;
    if (o.idents && typeof o.idents === 'object') {
      for (const [k, v] of Object.entries(o.idents)) {
        const id = NPC_KINDS.includes(k as NpcKind) && NPCS[k as NpcKind].need.recruit ? validIdent(v, normalizeAppearance) : null;
        if (id) this.idents[k as NpcKind] = id;
      }
    }
    for (const k of Array.isArray(o.invited) ? o.invited : []) if (NPC_KINDS.includes(k) && NPCS[k].need.recruit) this.invited.add(k);
    const int = (v: unknown): v is number => Number.isInteger(v);
    let maxId = 0;
    const fixed = new Set<Npc>();
    for (const c of Array.isArray(o.cores) ? o.cores : []) {
      if (!c || !int(c.id) || !int(c.x) || !int(c.y) || this.coreById(c.id)) continue;
      // 核心那一欄可能還沒常駐（讀檔時離玩家很遠 → 停放中）：先載入再看那格是不是爐心
      if (w.inBounds(c.x, c.y)) w.ensureColumn(chunkOfX(c.x));
      if (!trust && w.getFg(c.x, c.y) !== T.HEARTH) continue;
      this.cores.push({ id: c.id, x: c.x, y: c.y });
      maxId = Math.max(maxId, c.id);
    }
    this.syncPins(w);
    for (const q of Array.isArray(o.npcs) ? o.npcs : []) {
      if (!q || !NPC_KINDS.includes(q.kind) || this.npc(q.kind) || !this.coreById(q.core)) continue;
      if (typeof q.x !== 'number' || typeof q.y !== 'number' || !Number.isFinite(q.x) || !Number.isFinite(q.y)) continue;
      const n = this.makeNpc(q.kind, q.core, 0, 0);
      n.body.x = q.x; n.body.y = q.y;
      n.home = int(q.home) ? q.home : null;
      n.talks = int(q.talks) && q.talks > 0 ? q.talks : 0;
      // 客人副本：居民 id 要與房主一致（ws 的 NPC 靠 id 配對）
      if (trust && int(q.id) && q.id > 0) { n.id = q.id; fixed.add(n); }
      maxId = Math.max(maxId, n.id);
      this.npcs.push(n);
    }
    this.spawnCore = int(o.spawnCore) && this.coreById(o.spawnCore) ? o.spawnCore : null;
    const pd = o.pending as Partial<PendingJSON> | null | undefined;
    this.pending = pd && NPC_KINDS.includes(pd.kind as NpcKind) && int(pd.core) && this.coreById(pd.core) && typeof pd.at === 'number' && Number.isFinite(pd.at)
      ? { kind: pd.kind as NpcKind, core: pd.core, at: pd.at } : null;
    if (trust) {
      // 客人副本：nextId 與房主一致（不夾帶 makeNpc 白花掉的號碼）；沒帶 id 的才重新編號
      this.nextId = Math.max(int(o.nextId) ? o.nextId : 1, maxId + 1);
      for (const n of this.npcs) if (!fixed.has(n)) n.id = this.nextId++;
    } else {
      this.nextId = Math.max(int(o.nextId) ? o.nextId : 1, maxId + 1, this.nextId);
      for (const n of this.npcs) n.id = this.nextId++;
    }
    this.refresh(w, true);
  }
}

/** debug / 測試：(x,y) 房間（null = 那格是牆） */
export function roomAt(w: World, x: number, y: number): RoomCheck | null { return checkRoom(w, x, y); }
