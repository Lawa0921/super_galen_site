/**
 * 快速配對隊列的儲存層。
 * 記憶體實作（本地/測試）與 Upstash Redis REST 實作（production），由 env 選擇（照 rankStore 模式）。
 */

import type { QueueEntry } from './matchmaking';

export type { QueueEntry };

/** 配對成立後寫給每位玩家的結果。 */
export interface MatchInfo {
  room: string;
  role: 'host' | 'guest';
  mode: '1v1' | 'ffa';
  count: number;
  players: string[];
}

export interface QueueStore {
  /** 進隊列（entry TTL 秒，靠 heartbeat 續命）。 */
  enqueue(entry: QueueEntry, ttlSec: number): Promise<void>;
  /** 續命；entry 已過期或不存在則不復活。 */
  heartbeat(id: string, ttlSec: number): Promise<void>;
  /** 主動離隊。 */
  leave(id: string): Promise<void>;
  /** 仍存活的等待者，依 joinedAt 升冪（同分以 id 次序，撮合穩定）；過期不回。 */
  listWaiting(): Promise<QueueEntry[]>;
  /** 撮合原子閘（SET NX）；回傳 true 代表本次取得鎖。 */
  claimMatchLock(ttlSec: number): Promise<boolean>;
  /** 寫入某玩家的配對結果。 */
  setMatch(playerId: string, info: MatchInfo, ttlSec: number): Promise<void>;
  /** 讀取某玩家的配對結果；無或過期回 null。 */
  getMatch(playerId: string): Promise<MatchInfo | null>;
}

const WAITING_KEY = 'queue:waiting';
const LOCK_KEY = 'queue:lock';

export class MemoryQueueStore implements QueueStore {
  private entries = new Map<string, { entry: QueueEntry; exp: number }>();
  private matches = new Map<string, { info: MatchInfo; exp: number }>();
  private lockExp = 0;

  async enqueue(entry: QueueEntry, ttlSec: number): Promise<void> {
    this.entries.set(entry.id, { entry: { ...entry }, exp: Date.now() + ttlSec * 1000 });
  }
  async heartbeat(id: string, ttlSec: number): Promise<void> {
    const e = this.entries.get(id);
    if (!e || e.exp <= Date.now()) return; // 過期/不存在不復活
    e.exp = Date.now() + ttlSec * 1000;
  }
  async leave(id: string): Promise<void> {
    this.entries.delete(id);
  }
  async listWaiting(): Promise<QueueEntry[]> {
    const now = Date.now();
    const alive: QueueEntry[] = [];
    for (const [id, e] of this.entries.entries()) {
      if (e.exp <= now) {
        this.entries.delete(id); // 順手清過期
        continue;
      }
      alive.push({ ...e.entry });
    }
    return alive.sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  async claimMatchLock(ttlSec: number): Promise<boolean> {
    const now = Date.now();
    if (this.lockExp > now) return false; // 鎖仍有效
    this.lockExp = now + ttlSec * 1000;
    return true;
  }
  async setMatch(playerId: string, info: MatchInfo, ttlSec: number): Promise<void> {
    this.matches.set(playerId, { info: { ...info, players: [...info.players] }, exp: Date.now() + ttlSec * 1000 });
  }
  async getMatch(playerId: string): Promise<MatchInfo | null> {
    const m = this.matches.get(playerId);
    if (!m || m.exp <= Date.now()) return null;
    return { ...m.info, players: [...m.info.players] };
  }
}

/** Upstash Redis REST 實作。ZSET queue:waiting（score=joinedAt）＋ queue:entry:{id}（TTL）＋ queue:match:{id}。 */
export class UpstashQueueStore implements QueueStore {
  constructor(private url: string, private token: string) {}

  private async cmd(...parts: string[]): Promise<unknown> {
    const path = parts.map((p) => encodeURIComponent(p)).join('/');
    const res = await fetch(`${this.url}/${path}`, { headers: { Authorization: `Bearer ${this.token}` } });
    if (!res.ok) throw new Error(`upstash ${res.status}`);
    return ((await res.json()) as { result?: unknown }).result ?? null;
  }

  async enqueue(entry: QueueEntry, ttlSec: number): Promise<void> {
    await this.cmd('set', `queue:entry:${entry.id}`, JSON.stringify(entry), 'EX', String(ttlSec));
    await this.cmd('zadd', WAITING_KEY, String(entry.joinedAt), entry.id);
  }
  async heartbeat(id: string, ttlSec: number): Promise<void> {
    // EXPIRE 對不存在的 key 回 0（不復活），語意與 Memory 版一致
    await this.cmd('expire', `queue:entry:${id}`, String(ttlSec));
  }
  async leave(id: string): Promise<void> {
    await this.cmd('del', `queue:entry:${id}`);
    await this.cmd('zrem', WAITING_KEY, id);
  }
  async listWaiting(): Promise<QueueEntry[]> {
    // 以 entry key 存活為準；ZSET 內的殘留（entry 已 TTL 過期者）順手 ZREM
    const ids = (await this.cmd('zrange', WAITING_KEY, '0', '-1')) as string[] | null;
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const raw = (await this.cmd('mget', ...ids.map((id) => `queue:entry:${id}`))) as Array<string | null> | null;
    const alive: QueueEntry[] = [];
    const dead: string[] = [];
    ids.forEach((id, i) => {
      const v = Array.isArray(raw) ? raw[i] : null;
      if (v === null || v === undefined) {
        dead.push(id);
        return;
      }
      try {
        alive.push(JSON.parse(String(v)) as QueueEntry);
      } catch {
        dead.push(id); // 壞資料一併清掉
      }
    });
    if (dead.length > 0) await this.cmd('zrem', WAITING_KEY, ...dead);
    // ZSET 已依 score 排序；同分時 Redis 以 member 字典序，與 Memory 版一致
    return alive;
  }
  async claimMatchLock(ttlSec: number): Promise<boolean> {
    const r = await this.cmd('set', LOCK_KEY, '1', 'NX', 'EX', String(ttlSec));
    return r === 'OK'; // NX 成功回 "OK"，已存在回 null
  }
  async setMatch(playerId: string, info: MatchInfo, ttlSec: number): Promise<void> {
    await this.cmd('set', `queue:match:${playerId}`, JSON.stringify(info), 'EX', String(ttlSec));
  }
  async getMatch(playerId: string): Promise<MatchInfo | null> {
    const r = await this.cmd('get', `queue:match:${playerId}`);
    if (r === null || r === undefined) return null;
    try {
      return JSON.parse(String(r)) as MatchInfo;
    } catch {
      return null;
    }
  }
}

let singleton: QueueStore | null = null;
export function getQueueStore(env: Record<string, string | undefined> = process.env): QueueStore {
  if (singleton) return singleton;
  // Upstash 原生命名，或 Vercel Marketplace（Upstash for Redis）注入的 KV_REST_API_* 命名
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  // 只設了一半 → 主動報錯，避免生產環境靜默退回記憶體（重啟即失資料）
  if ((url && !token) || (token && !url)) {
    throw new Error('Upstash 設定不完整：REST URL 與 TOKEN 必須同時提供（KV_REST_API_URL/TOKEN 或 UPSTASH_REDIS_REST_URL/TOKEN）');
  }
  singleton = url && token ? new UpstashQueueStore(url, token) : new MemoryQueueStore();
  return singleton;
}
