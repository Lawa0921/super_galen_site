/**
 * 牽線用的小型 KV store 抽象。
 * - 無金鑰（本地 / dev）→ 記憶體 mock（單一實例內有效，足夠本地開發）。
 * - 有 Upstash 金鑰（production）→ 打 Upstash Redis REST API（純 fetch，不加套件依賴）。
 * 只需要 set(帶 TTL) / get / del 三個操作即可承載 WebRTC offer/answer/ICE 中轉。
 */
export interface SignalStore {
  set(key: string, value: string, ttlSec: number): Promise<void>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<void>;
}

/** 記憶體實作：本地 / 單一 serverless 實例用。附過期清理。 */
export class MemoryStore implements SignalStore {
  private map = new Map<string, { value: string; expires: number }>();

  async set(key: string, value: string, ttlSec: number): Promise<void> {
    this.map.set(key, { value, expires: Date.now() + ttlSec * 1000 });
  }
  async get(key: string): Promise<string | null> {
    const e = this.map.get(key);
    if (!e) return null;
    if (e.expires < Date.now()) {
      this.map.delete(key);
      return null;
    }
    return e.value;
  }
  async del(key: string): Promise<void> {
    this.map.delete(key);
  }
}

/** Upstash Redis REST 實作（純 fetch）。 */
export class UpstashStore implements SignalStore {
  constructor(private url: string, private token: string) {}

  private async cmd(path: string): Promise<unknown> {
    const res = await fetch(`${this.url}/${path}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) throw new Error(`upstash ${res.status}`);
    const json = (await res.json()) as { result?: unknown };
    return json.result ?? null;
  }

  async set(key: string, value: string, ttlSec: number): Promise<void> {
    // SET key value EX ttl
    await this.cmd(`set/${encodeURIComponent(key)}/${encodeURIComponent(value)}?EX=${ttlSec}`);
  }
  async get(key: string): Promise<string | null> {
    const r = await this.cmd(`get/${encodeURIComponent(key)}`);
    return r === null || r === undefined ? null : String(r);
  }
  async del(key: string): Promise<void> {
    await this.cmd(`del/${encodeURIComponent(key)}`);
  }
}

let singleton: SignalStore | null = null;

/** 依環境變數選 store；無金鑰退回記憶體 mock。單例。 */
export function getSignalStore(env: Record<string, string | undefined> = process.env): SignalStore {
  if (singleton) return singleton;
  // Upstash 原生命名，或 Vercel Marketplace（Upstash for Redis）注入的 KV_REST_API_* 命名
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  // 只設了一半 → 主動報錯，避免生產環境靜默退回記憶體（重啟即失資料）
  if ((url && !token) || (token && !url)) {
    throw new Error('Upstash 設定不完整：REST URL 與 TOKEN 必須同時提供（KV_REST_API_URL/TOKEN 或 UPSTASH_REDIS_REST_URL/TOKEN）');
  }
  singleton = url && token ? new UpstashStore(url, token) : new MemoryStore();
  return singleton;
}
