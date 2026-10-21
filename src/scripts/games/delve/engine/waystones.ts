// waystones.ts — 傳送碑（B10）：世界物件、不是 tile（舊世界中央區一格都不會變）。
//   · id 0 = 出生點那顆（呼叫端給位置：spawn.x + 7 的生成地表上），永遠是解鎖的。
//   · 外圍（只有無限世界、有外圍側寫 profile 時）：每側第 k 顆（k ≥ 1）離中央邊欄 d = SEA_W + STONE_FIRST + (k − 1) × STONE_EVERY
//     + 抖動（±STONE_JITTER，由 (seed, 側, k) 雜湊），y = 地表 − 1；落在海上就往遠離中央的方向推到第一個陸地欄。
//     id：東 +k、西 −k；名字「東境第 k 碑」/「西境第 k 碑」。
//   位置全部是 (seed, id) 的純函式（只用整數雜湊 + 四則運算），near() 由 x 範圍算 k、不掃描。
import { hash2, seedInt } from './noise';
import { X_LIMIT } from './coords';
import { SEA_W, type OuterProfile } from './chunkgen';

export const SPAWN_STONE = 0, STONE_EVERY = 1600, STONE_JITTER = 150, STONE_FIRST = 200;
/** 落在海上時最多往外推幾格找陸地（v0 的碑一律在海後 ≥ 50 格，用不到；找不到 = 這顆不存在） */
const MAX_PUSH = 2000;
/** 讀檔時最多接受幾個解鎖 id（超過的丟掉） */
const MAX_UNLOCKED = 4096;

export interface Waystone { id: number; x: number; y: number /* 底座下方那格的上一格（站立 tile） */; name: string; }

/** 碑的 footprint：2 格寬、3 格高；(x, y) = 左上格 */
export interface StoneRect { x: number; y: number; w: 2; h: 3 }

export class Waystones {
  private readonly spawnStone: Waystone;
  private readonly profile: OuterProfile | null;
  private readonly sJit: number;
  /** 中央框寬（外圍 d 的基準）；有界世界沒有外圍 = 0 */
  private readonly width: number;
  /** 外圍碑的快取（id → 碑；推不到陸地 / 超出硬邊界 = null） */
  private readonly memo = new Map<number, Waystone | null>();

  constructor(seed: string, spawnStone: { x: number; y: number }, profile: OuterProfile | null) {
    this.spawnStone = { id: SPAWN_STONE, x: spawnStone.x, y: spawnStone.y, name: '出生地傳送碑' };
    this.profile = profile;
    this.sJit = seedInt(seed, 'waystone');
    this.width = profile ? profile.frame.width : 0;
  }

  byId(id: number): Waystone | null {
    if (!Number.isInteger(id)) return null;
    if (id === SPAWN_STONE) return this.spawnStone;
    if (!this.profile) return null;
    let s = this.memo.get(id);
    if (s === undefined) { s = this.compute(id); this.memo.set(id, s); }
    return s;
  }

  /** 第 k 顆（側 side）離中央邊欄的距離（含抖動、還沒推離海） */
  private dist(side: 1 | -1, k: number): number {
    const j = Math.floor((hash2(k, side, this.sJit) * 2 - 1) * STONE_JITTER);
    return SEA_W + STONE_FIRST + (k - 1) * STONE_EVERY + j;
  }
  /** 離中央邊欄 d 格 → 世界 x（同 OuterProfile.zoneAt 的 d：東 x − width、西 −1 − x；2 格寬的碑佔 x、x + 1） */
  private xOf(side: 1 | -1, d: number): number { return side === 1 ? this.width + d : -1 - d; }

  private compute(id: number): Waystone | null {
    const p = this.profile!;
    const side: 1 | -1 = id > 0 ? 1 : -1, k = Math.abs(id);
    let d = this.dist(side, k);
    const land = (dd: number): boolean => {
      const x = this.xOf(side, dd);
      return p.zoneAt(x).kind === 'land' && p.zoneAt(x + 1).kind === 'land';
    };
    let push = 0;
    while (!land(d) && push < MAX_PUSH) { d++; push++; }
    if (!land(d)) return null;
    const x = this.xOf(side, d);
    // 兩欄都要在硬邊界內（再留 2 格：碑旁要站得下人）
    if (x - 2 < -X_LIMIT || x + 4 > X_LIMIT) return null;
    return { id, x, y: p.surfaceAt(x) - 1, name: `${side === 1 ? '東' : '西'}境第 ${k} 碑` };
  }

  /** x 在 [x0, x1) 的碑（依 x 排序）：由範圍算 k 的候選，不掃描 */
  near(x0: number, x1: number): Waystone[] {
    const out: Waystone[] = [];
    if (!(x1 > x0)) return out;
    const sp = this.spawnStone;
    if (sp.x >= x0 && sp.x < x1) out.push(sp);
    if (this.profile) {
      // 第 k 顆的 d ∈ [base(k) − J, base(k) + J + MAX_PUSH]；東 x = width + d、西 x = −1 − d
      for (const side of [-1, 1] as const) {
        const dLo = side === 1 ? x0 - this.width : -x1;
        const dHi = side === 1 ? x1 - 1 - this.width : -1 - x0;
        if (dHi < SEA_W) continue;
        const base = SEA_W + STONE_FIRST;
        const kLo = Math.max(1, Math.floor((dLo - base - STONE_JITTER - MAX_PUSH) / STONE_EVERY) + 1);
        // 硬邊界外沒有碑：k 的上限跟著 X_LIMIT（範圍再大也不會多跑）
        const kHi = Math.min(Math.floor(X_LIMIT / STONE_EVERY) + 1, Math.floor((dHi - base + STONE_JITTER) / STONE_EVERY) + 1);
        for (let k = kLo; k <= kHi; k++) {
          const s = this.byId(side * k);
          if (s && s.x >= x0 && s.x < x1) out.push(s);
        }
      }
    }
    return out.sort((a, b) => a.x - b.x);
  }

  footprint(s: Waystone): { x: number; y: number; w: 2; h: 3 } {
    return { x: s.x, y: s.y - 2, w: 2, h: 3 };
  }
}

/** 存檔裡的解鎖 id → 這個世界真的有的碑（整數、不是 0、byId 存在），去重、由小到大；不是陣列 = [] */
export function validStoneIds(v: unknown, ws: Waystones): number[] {
  if (!Array.isArray(v)) return [];
  const out = new Set<number>();
  for (const id of v.slice(0, MAX_UNLOCKED)) {
    if (typeof id !== 'number' || !Number.isInteger(id) || id === SPAWN_STONE) continue;
    if (ws.byId(id)) out.add(id);
  }
  return [...out].sort((a, b) => a - b);
}
