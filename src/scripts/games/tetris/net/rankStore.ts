/**
 * 排行榜 / 積分 / 對戰結果共識用的儲存層。
 * 記憶體實作（本地/測試）與 Upstash Redis REST 實作（production），由 env 選擇。
 */
export interface PlayerRecord {
  name?: string;
  rating: number;
  wins: number;
  losses: number;
  xp: number;
  level: number;
  games: number;
  top3: number;
}

/** 補齊舊資料缺少的進度欄位（向後相容）。 */
export function normalizePlayer(p: Record<string, unknown>): PlayerRecord {
  return {
    name: typeof p.name === 'string' ? p.name : undefined,
    rating: Number(p.rating ?? 1000),
    wins: Number(p.wins ?? 0),
    losses: Number(p.losses ?? 0),
    xp: Number(p.xp ?? 0),
    level: Number(p.level ?? 1),
    games: Number(p.games ?? 0),
    top3: Number(p.top3 ?? 0),
  };
}

export interface RankStore {
  getPlayer(id: string): Promise<PlayerRecord | null>;
  /** 寫入玩家資料並同步排行榜分數。 */
  setPlayer(id: string, rec: PlayerRecord): Promise<void>;
  /** 取積分前 n 名（高→低）。 */
  topPlayers(n: number): Promise<Array<{ id: string; rating: number }>>;

  // 對戰結果共識（雙方各回報一次，一致才計分）
  getReport(matchId: string, reporter: string): Promise<string | null>;
  setReport(matchId: string, reporter: string, winner: string, ttlSec: number): Promise<void>;
  isSettled(matchId: string): Promise<boolean>;
  /** 標記已結算；回傳 true 代表本次為首次（原子閘）。 */
  markSettled(matchId: string, ttlSec: number): Promise<boolean>;

  // N 人大亂鬥（BR/FFA）結果共識：多名玩家各回報一份 standings，達門檻一致才計分
  /** 記某玩家對某 matchId 回報的名次序列（index0=冠軍）。 */
  setBRReport(matchId: string, reporterId: string, standings: string[], ttlSec: number): Promise<void>;
  /** 回 reporterId → standings 的所有回報（解析失敗的條目略過）。 */
  getBRReportsForMatch(matchId: string): Promise<Record<string, string[]>>;
  /** 標記大亂鬥已結算；回傳 true 代表本次為首次（原子閘）。 */
  markSettledBR(matchId: string, ttlSec: number): Promise<boolean>;
}

const LB_KEY = 'lb';
const LB_MAX = 1000; // 排行榜成員上限（防無限成長）

export class MemoryRankStore implements RankStore {
  private players = new Map<string, PlayerRecord>();
  private reports = new Map<string, { winner: string; exp: number }>();
  private settled = new Map<string, number>();
  // 大亂鬥：matchId → (reporterId → { standings, exp })
  private brReports = new Map<string, Map<string, { standings: string[]; exp: number }>>();
  private settledBR = new Map<string, number>();

  // MemoryRankStore 的隔離靠「不同實例 = 不同 Map」達成（每個 ladder 各持一個實例），
  // 故無須在記憶體 key 內帶 namespace；ns 參數僅為與 Upstash 介面對齊（不使用）。
  constructor(_ns = '') { /* namespace 對記憶體實作無作用：實例即隔離 */ }

  async getPlayer(id: string): Promise<PlayerRecord | null> {
    const p = this.players.get(id);
    return p ? normalizePlayer(p as unknown as Record<string, unknown>) : null;
  }
  async setPlayer(id: string, rec: PlayerRecord): Promise<void> {
    this.players.set(id, { ...rec });
  }
  async topPlayers(n: number): Promise<Array<{ id: string; rating: number }>> {
    return [...this.players.entries()]
      .map(([id, p]) => ({ id, rating: p.rating }))
      .sort((a, b) => b.rating - a.rating)
      .slice(0, n);
  }
  async getReport(matchId: string, reporter: string): Promise<string | null> {
    const e = this.reports.get(`${matchId}:${reporter}`);
    if (!e) return null;
    if (e.exp < Date.now()) return null;
    return e.winner;
  }
  async setReport(matchId: string, reporter: string, winner: string, ttlSec: number): Promise<void> {
    this.reports.set(`${matchId}:${reporter}`, { winner, exp: Date.now() + ttlSec * 1000 });
  }
  async isSettled(matchId: string): Promise<boolean> {
    const e = this.settled.get(matchId);
    return e !== undefined && e > Date.now();
  }
  async markSettled(matchId: string, ttlSec: number): Promise<boolean> {
    const e = this.settled.get(matchId);
    if (e !== undefined && e > Date.now()) return false; // 已結算（未過期）
    this.settled.set(matchId, Date.now() + ttlSec * 1000);
    return true;
  }
  async setBRReport(matchId: string, reporterId: string, standings: string[], ttlSec: number): Promise<void> {
    let m = this.brReports.get(matchId);
    if (!m) {
      m = new Map();
      this.brReports.set(matchId, m);
    }
    m.set(reporterId, { standings: [...standings], exp: Date.now() + ttlSec * 1000 });
  }
  async getBRReportsForMatch(matchId: string): Promise<Record<string, string[]>> {
    const m = this.brReports.get(matchId);
    const out: Record<string, string[]> = {};
    if (!m) return out;
    const now = Date.now();
    for (const [reporter, e] of m.entries()) {
      if (e.exp < now) continue; // 過期略過
      out[reporter] = [...e.standings];
    }
    return out;
  }
  async markSettledBR(matchId: string, ttlSec: number): Promise<boolean> {
    const e = this.settledBR.get(matchId);
    if (e !== undefined && e > Date.now()) return false; // 已結算（未過期）
    this.settledBR.set(matchId, Date.now() + ttlSec * 1000);
    return true;
  }
}

/** Upstash Redis REST 實作。 */
export class UpstashRankStore implements RankStore {
  /**
   * ns：key 命名空間前綴。預設 ''（tetris：所有 key 與原本 byte-identical）。
   * bomber ladder 傳入 'bomber:' → 所有 key（含排行榜 zset）與 tetris 完全隔離。
   */
  constructor(private url: string, private token: string, private ns = '') {}

  /** 套用 namespace 前綴；ns='' 時回原 key（tetris 不變）。 */
  private k(key: string): string {
    return this.ns + key;
  }

  private async cmd(...parts: string[]): Promise<unknown> {
    const path = parts.map((p) => encodeURIComponent(p)).join('/');
    const res = await fetch(`${this.url}/${path}`, { headers: { Authorization: `Bearer ${this.token}` } });
    if (!res.ok) throw new Error(`upstash ${res.status}`);
    return ((await res.json()) as { result?: unknown }).result ?? null;
  }

  async getPlayer(id: string): Promise<PlayerRecord | null> {
    const r = await this.cmd('get', this.k(`player:${id}`));
    return r ? normalizePlayer(JSON.parse(String(r)) as Record<string, unknown>) : null;
  }
  async setPlayer(id: string, rec: PlayerRecord): Promise<void> {
    await this.cmd('set', this.k(`player:${id}`), JSON.stringify(rec));
    await this.cmd('zadd', this.k(LB_KEY), String(rec.rating), id);
    // 截斷排行榜（保留前 LB_MAX）
    await this.cmd('zremrangebyrank', this.k(LB_KEY), '0', String(-(LB_MAX + 1)));
  }
  async topPlayers(n: number): Promise<Array<{ id: string; rating: number }>> {
    const r = (await this.cmd('zrange', this.k(LB_KEY), '0', String(n - 1), 'REV', 'WITHSCORES')) as string[] | null;
    const out: Array<{ id: string; rating: number }> = [];
    if (Array.isArray(r)) {
      for (let i = 0; i < r.length; i += 2) out.push({ id: r[i], rating: Number(r[i + 1]) });
    }
    return out;
  }
  async getReport(matchId: string, reporter: string): Promise<string | null> {
    const r = await this.cmd('get', this.k(`rep:${matchId}:${reporter}`));
    return r === null || r === undefined ? null : String(r);
  }
  async setReport(matchId: string, reporter: string, winner: string, ttlSec: number): Promise<void> {
    await this.cmd('set', this.k(`rep:${matchId}:${reporter}`), winner, 'EX', String(ttlSec));
  }
  async isSettled(matchId: string): Promise<boolean> {
    return (await this.cmd('get', this.k(`done:${matchId}`))) !== null;
  }
  async markSettled(matchId: string, ttlSec: number): Promise<boolean> {
    const r = await this.cmd('set', this.k(`done:${matchId}`), '1', 'NX', 'EX', String(ttlSec));
    return r === 'OK'; // NX 成功回 "OK"，已存在回 null
  }
  async setBRReport(matchId: string, reporterId: string, standings: string[], ttlSec: number): Promise<void> {
    const key = this.k(`brreport:${matchId}`);
    await this.cmd('hset', key, reporterId, JSON.stringify(standings));
    await this.cmd('expire', key, String(ttlSec));
  }
  async getBRReportsForMatch(matchId: string): Promise<Record<string, string[]>> {
    // HGETALL 回扁平陣列 [field1, value1, field2, value2, ...]
    const r = (await this.cmd('hgetall', this.k(`brreport:${matchId}`))) as string[] | null;
    const out: Record<string, string[]> = {};
    if (Array.isArray(r)) {
      for (let i = 0; i < r.length; i += 2) {
        const field = r[i];
        try {
          const parsed = JSON.parse(String(r[i + 1]));
          if (Array.isArray(parsed)) out[field] = parsed.map(String);
        } catch {
          // 解析失敗略過該條目
        }
      }
    }
    return out;
  }
  async markSettledBR(matchId: string, ttlSec: number): Promise<boolean> {
    const r = await this.cmd('set', this.k(`settledbr:${matchId}`), '1', 'NX', 'EX', String(ttlSec));
    return r === 'OK'; // NX 成功回 "OK"，已存在回 null
  }
}

/** 解析 env → { url, token }（缺一半即報錯，避免生產環境靜默退回記憶體）。 */
function resolveUpstash(env: Record<string, string | undefined>): { url?: string; token?: string } {
  // Upstash 原生命名，或 Vercel Marketplace（Upstash for Redis）注入的 KV_REST_API_* 命名
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if ((url && !token) || (token && !url)) {
    throw new Error('Upstash 設定不完整：REST URL 與 TOKEN 必須同時提供（KV_REST_API_URL/TOKEN 或 UPSTASH_REDIS_REST_URL/TOKEN）');
  }
  return { url, token };
}

let singleton: RankStore | null = null;
export function getRankStore(env: Record<string, string | undefined> = process.env): RankStore {
  if (singleton) return singleton;
  const { url, token } = resolveUpstash(env);
  // tetris ladder：namespace 預設 ''（所有 key 與原本 byte-identical）
  singleton = url && token ? new UpstashRankStore(url, token) : new MemoryRankStore();
  return singleton;
}

/**
 * Bomber ladder 專用 rankStore（與 tetris 完全隔離的獨立單例）。
 * Upstash 實作所有 key 帶 'bomber:' 前綴；Memory 實作則是獨立實例（各自的 Map）。
 * 與 getRankStore() 互不共用單例，故 bomber 的積分/XP/排行榜不會碰到 tetris 紀錄。
 */
let bomberSingleton: RankStore | null = null;
export function getBomberRankStore(env: Record<string, string | undefined> = process.env): RankStore {
  if (bomberSingleton) return bomberSingleton;
  const { url, token } = resolveUpstash(env);
  bomberSingleton = url && token ? new UpstashRankStore(url, token, 'bomber:') : new MemoryRankStore('bomber:');
  return bomberSingleton;
}
