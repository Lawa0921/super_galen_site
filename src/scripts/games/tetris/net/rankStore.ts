/**
 * 排行榜 / 積分 / 對戰結果共識用的儲存層。
 * 記憶體實作（本地/測試）與 Upstash Redis REST 實作（production），由 env 選擇。
 */
export interface PlayerRecord {
  name?: string;
  rating: number;
  wins: number;
  losses: number;
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
  markSettled(matchId: string, ttlSec: number): Promise<void>;
}

const LB_KEY = 'lb';
const LB_MAX = 1000; // 排行榜成員上限（防無限成長）

export class MemoryRankStore implements RankStore {
  private players = new Map<string, PlayerRecord>();
  private reports = new Map<string, { winner: string; exp: number }>();
  private settled = new Map<string, number>();

  async getPlayer(id: string): Promise<PlayerRecord | null> {
    return this.players.get(id) ?? null;
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
  async markSettled(matchId: string, ttlSec: number): Promise<void> {
    this.settled.set(matchId, Date.now() + ttlSec * 1000);
  }
}

/** Upstash Redis REST 實作。 */
export class UpstashRankStore implements RankStore {
  constructor(private url: string, private token: string) {}

  private async cmd(...parts: string[]): Promise<unknown> {
    const path = parts.map((p) => encodeURIComponent(p)).join('/');
    const res = await fetch(`${this.url}/${path}`, { headers: { Authorization: `Bearer ${this.token}` } });
    if (!res.ok) throw new Error(`upstash ${res.status}`);
    return ((await res.json()) as { result?: unknown }).result ?? null;
  }

  async getPlayer(id: string): Promise<PlayerRecord | null> {
    const r = await this.cmd('get', `player:${id}`);
    return r ? (JSON.parse(String(r)) as PlayerRecord) : null;
  }
  async setPlayer(id: string, rec: PlayerRecord): Promise<void> {
    await this.cmd('set', `player:${id}`, JSON.stringify(rec));
    await this.cmd('zadd', LB_KEY, String(rec.rating), id);
    // 截斷排行榜（保留前 LB_MAX）
    await this.cmd('zremrangebyrank', LB_KEY, '0', String(-(LB_MAX + 1)));
  }
  async topPlayers(n: number): Promise<Array<{ id: string; rating: number }>> {
    const r = (await this.cmd('zrange', LB_KEY, '0', String(n - 1), 'REV', 'WITHSCORES')) as string[] | null;
    const out: Array<{ id: string; rating: number }> = [];
    if (Array.isArray(r)) {
      for (let i = 0; i < r.length; i += 2) out.push({ id: r[i], rating: Number(r[i + 1]) });
    }
    return out;
  }
  async getReport(matchId: string, reporter: string): Promise<string | null> {
    const r = await this.cmd('get', `rep:${matchId}:${reporter}`);
    return r === null || r === undefined ? null : String(r);
  }
  async setReport(matchId: string, reporter: string, winner: string, ttlSec: number): Promise<void> {
    await this.cmd('set', `rep:${matchId}:${reporter}`, winner, 'EX', String(ttlSec));
  }
  async isSettled(matchId: string): Promise<boolean> {
    return (await this.cmd('get', `done:${matchId}`)) !== null;
  }
  async markSettled(matchId: string, ttlSec: number): Promise<void> {
    await this.cmd('set', `done:${matchId}`, '1', 'EX', String(ttlSec));
  }
}

let singleton: RankStore | null = null;
export function getRankStore(env: Record<string, string | undefined> = process.env): RankStore {
  if (singleton) return singleton;
  // Upstash 原生命名，或 Vercel Marketplace（Upstash for Redis）注入的 KV_REST_API_* 命名
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  singleton = url && token ? new UpstashRankStore(url, token) : new MemoryRankStore();
  return singleton;
}
