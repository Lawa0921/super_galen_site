// siteRegistry.ts — 聚落登錄：每個村落 / 地廳 / 隱士 / 地城用穩定的字串 key 登錄（舊世界 v{i} / h{i} / d0，gen2 s{structureId}）。
//   · add 依 key 去重（gen2 外圍在欄載入時重複交來）；onAdd 只對新 key 觸發（FolkWorld.addSite 放 NPC）。
//   · at(x, y)：點在哪個聚落的範圍裡（安全地點 / 委託板）。舊世界逐字照抄改動前的 game.siteAt（只看村落再看地廳）；gen2 用新範圍。
//   · 聚落 NPC 的 id = npcIdFor(NPC key)：加寬的確定性雜湊，不依登錄順序（連線時房主與客人載入外圍的順序不同）；撞號丟錯、不探測。
import { hash2, seedInt } from './noise';
import type { DungeonInfo, GenSite, HallInfo, VillageInfo } from './genTypes';

// 聚落 NPC 的 id 從這裡開始；遇見型 NPC（行商 / 受困者）用遞增 id，永遠小於它
export const SITE_NPC_BASE = 1 << 20;
const LO = 2097152; // 2 的 21 次方
const HI = 2147483648; // 2 的 31 次方

// NPC key → id ∈ [2^20, 2^20 + 2^52)：兩次 hash2 拼成 52 bits，安全整數（連線的 ws 以 JSON number 傳 id）
export function npcIdFor(key: string): number {
  const a = seedInt(key, 'npc-a'), b = seedInt(key, 'npc-b');
  const hi = Math.floor(hash2(a, b, 1) * HI), lo = Math.floor(hash2(b, a, 2) * LO);
  return SITE_NPC_BASE + hi * LO + lo;
}

// 登記 id：同 id 已被另一個 key 用 → 丟錯（不探測、不 +1：探測會讓 id 依登錄順序而變）；同 key 再來 → 沒事
export function claimNpcId(used: Map<number, string>, id: number, key: string): void {
  const prev = used.get(id);
  if (prev !== undefined && prev !== key) throw new Error(`npc id collision: ${id} (${prev} / ${key})`);
  used.set(id, key);
}

// 舊生成器的聚落 → GenSite：村落 v{i}、地廳 h{i}、地城 d0；rot = 索引（村落的職能輪替照舊）
export function legacySites(villages: readonly VillageInfo[], halls: readonly HallInfo[], dungeon: DungeonInfo | null): GenSite[] {
  const out: GenSite[] = [];
  villages.forEach((info, i) => out.push({ kind: 'village', key: `v${i}`, rot: i, info }));
  halls.forEach((info, i) => out.push({ kind: 'hall', key: `h${i}`, rot: i, info }));
  if (dungeon) out.push({ kind: 'dungeon', key: 'd0', rot: 0, info: dungeon });
  return out;
}

type Kind = GenSite['kind'];
const KINDS: readonly Kind[] = ['village', 'hall', 'hermit', 'dungeon'];

// 舊世界的範圍（= 改動前的 game.siteAt）：村落含村外的緩坡、地廳外框外擴
function inLegacy(s: GenSite, x: number, y: number): boolean {
  if (s.kind === 'village') { const v = s.info; return x >= v.x0 - 12 && x <= v.x1 + 12 && y >= v.ground - 28 && y <= v.ground + 4; }
  if (s.kind === 'hall') { const h = s.info; return x >= h.x0 - 4 && x <= h.x1 + 4 && y >= h.y0 - 5 && y <= h.floorY + 2; }
  return false;
}
// gen2 的範圍：村落 x0 − 4 .. x1 + 4、ground − 30 .. ground + 6；地廳 = 外框 + 兩側隧道；隱士 ±8；地城 = bbox
function inGen2(s: GenSite, x: number, y: number): boolean {
  switch (s.kind) {
    case 'village': { const v = s.info; return x >= v.x0 - 4 && x <= v.x1 + 4 && y >= v.ground - 30 && y <= v.ground + 6; }
    case 'hall': {
      const h = s.info;
      if (x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.floorY) return true;
      return y >= h.floorY - 5 && y <= h.floorY && h.tunnels.some((t) => x >= t.x0 && x <= t.x1);
    }
    case 'hermit': return Math.abs(x - s.at.x) <= 8 && Math.abs(y - s.at.y) <= 8;
    case 'dungeon': { const b = s.info.bbox; return x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h; }
  }
}

export class SiteRegistry {
  private readonly keys = new Map<string, GenSite>();
  private readonly byKind: { [K in Kind]: Extract<GenSite, { kind: K }>[] } = { village: [], hall: [], hermit: [], dungeon: [] };
  private readonly listeners: ((s: GenSite) => void)[] = [];
  private readonly inRange: (s: GenSite, x: number, y: number) => boolean;

  constructor(o: { ranges: 'legacy' | 'gen2' }) {
    this.inRange = o.ranges === 'legacy' ? inLegacy : inGen2;
  }
  // 新 key → 登錄、通知 onAdd、回 true；同 key → 忽略
  add(s: GenSite): boolean {
    if (this.keys.has(s.key)) return false;
    this.keys.set(s.key, s);
    (this.byKind[s.kind] as GenSite[]).push(s);
    for (const fn of this.listeners) fn(s);
    return true;
  }
  byKey(key: string): GenSite | undefined { return this.keys.get(key); }
  // 該種類的聚落（依加入順序；唯讀的內部陣列，不複製——每刻的查詢會呼叫）
  list<K extends Kind>(kind: K): readonly Extract<GenSite, { kind: K }>[] { return this.byKind[kind]; }
  // (x, y) 所在的聚落：依種類（村落、地廳、隱士、地城）再依加入順序，第一個範圍含它的
  at(x: number, y: number): GenSite | null {
    for (const k of KINDS) for (const s of this.byKind[k]) if (this.inRange(s, x, y)) return s;
    return null;
  }
  onAdd(fn: (s: GenSite) => void): void { this.listeners.push(fn); }
}
