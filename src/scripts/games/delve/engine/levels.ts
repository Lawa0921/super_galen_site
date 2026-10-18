// levels.ts — 等級系統（純邏輯，不碰 DOM）：經驗曲線、經驗來源規則（含防刷）、升級成長、里程碑稱號、Progression（存檔內容）。
//   · 曲線：1 → 50 級，第 L 級升到 L+1 要 200 + 80·(L−1)^1.35（取 5 的倍數）。2 級 200、3 級累計 480、
//     15 級累計約 1.8 萬、20 級約 3.6 萬、50 級約 32 萬。第一天（約 700 經驗）≈ 3 級；打首領前（約 8 天）≈ 15–17 級。
//   · 每升一級：生命上限 +2、技能點 +1；每 10 級防禦 +1；每 5 級里程碑：稱號 + 額外 1 點技能點。
//   · 防刷：同一種怪同一天擊殺超過 KILL_FULL 隻後經驗遞減（×0.8 一隻，最低 10%）；挖礦 / 釣魚每天有上限；
//     玩家自己放的礦 / 箱子沒有經驗；地區 / 古碑 / 珍寶 / 詞條 / 配方 / 寶箱只有第一次算。
//   · 死亡：失去本級進度的 10%（不會掉級）。
//   · 物品等級：仍以深度為主；等級最多把掉落的物品等級往上推 1 階（不讓怪物跟著等級變強）。
import { ENEMIES, type EnemyKind } from './enemies';
import type { RegionCat } from './discovery';
import type { Station } from './crafting';
import { T, isChestTile } from './tiles';
import { affixDef, type Cost } from './gear';
import type { ItemId } from './items';
import type { DelveEvent } from './game';
import {
  isSkillId, learnCheck, rankOf, skillDef, skillTotals, spentPoints, SKILLS, type LearnFail, type Ranks, type SkillId, type SkillTotals,
} from './skills';

// ── 曲線 ─────────────────────────────────────────────────
export const MAX_LEVEL = 50;
/** 第 level 級升到下一級要的經驗（滿級 = 0） */
export function xpToNext(level: number): number {
  const L = Math.floor(level);
  if (L < 1 || L >= MAX_LEVEL) return 0;
  return Math.round((200 + 80 * (L - 1) ** 1.35) / 5) * 5;
}
const CUM: number[] = [0, 0];
for (let L = 2; L <= MAX_LEVEL; L++) CUM[L] = CUM[L - 1] + xpToNext(L - 1);
/** 到達 level 級的累計經驗 */
export function xpAtLevel(level: number): number { return CUM[Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)))]; }
export const MAX_XP = CUM[MAX_LEVEL];
export function levelForXp(xp: number): number {
  let L = 1;
  while (L < MAX_LEVEL && xp >= CUM[L + 1]) L++;
  return L;
}
export interface LevelProgress { level: number; into: number; need: number; frac: number; }
export function progressOf(xp: number): LevelProgress {
  const level = levelForXp(xp);
  if (level >= MAX_LEVEL) return { level, into: 0, need: 0, frac: 1 };
  const into = Math.max(0, Math.floor(xp) - CUM[level]), need = xpToNext(level);
  return { level, into, need, frac: into / need };
}

// ── 成長 / 里程碑 ─────────────────────────────────────────
export const HP_PER_LEVEL = 2;
export function levelHp(level: number): number { return HP_PER_LEVEL * (Math.max(1, Math.min(MAX_LEVEL, level)) - 1); }
export function levelDef(level: number): number { return Math.floor(Math.max(1, Math.min(MAX_LEVEL, level)) / 10); }
/** 到這一級總共拿到幾點技能點：每級 1 點 + 每 5 級里程碑 1 點 */
export function skillPointsAt(level: number): number {
  const L = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return L - 1 + Math.floor(L / 5);
}
export const TITLES: readonly (readonly [number, string])[] = [
  [1, '見習探險者'], [5, '初出茅廬'], [10, '洞窟行者'], [15, '燈脈尋跡者'], [20, '深淵獵手'], [25, '礦脈宗師'],
  [30, '傳奇冒險家'], [35, '星屑旅人'], [40, '地心征服者'], [45, '不滅之魂'], [50, '深掘之王'],
];
export function titleFor(level: number): string {
  let t = TITLES[0][1];
  for (const [L, name] of TITLES) if (level >= L) t = name;
  return t;
}
export interface Milestone { level: number; title: string; bonusPoints: number; }
export function milestoneAt(level: number): Milestone | null {
  return level % 5 === 0 && level >= 5 && level <= MAX_LEVEL ? { level, title: titleFor(level), bonusPoints: 1 } : null;
}

// ── 經驗來源 ─────────────────────────────────────────────
export const BOSS_XP = 1200;
export const BOSS_FIRST_XP = 1500;
/** 同一天重打首領的經驗下限 */
export const BOSS_FLOOR = 60;
/** 怪物經驗：依血量 / 攻擊 / 防禦（= 怪物強度）；首領固定；召喚物很少 */
export function enemyXp(kind: EnemyKind): number {
  const d = ENEMIES[kind];
  if (d.boss) return BOSS_XP;
  if (d.minion) return 2;
  return Math.max(3, Math.round(d.hp / 5 + d.damage * 0.5 + d.defense * 0.8));
}
/** 同一種怪同一天的前幾隻給全額 */
export const KILL_FULL = 12;
/** 今天已經打了 n 隻同種怪 → 這隻的經驗倍率 */
export function killMul(n: number): number {
  if (n < KILL_FULL) return 1;
  return Math.max(0.1, Math.round(0.8 ** (n - KILL_FULL + 1) * 1000) / 1000);
}
export const REGION_XP: Record<RegionCat, number> = { land: 50, depth: 80, cave: 40, site: 40, dungeon: 60, secret: 80 };
/** 日誌某個分類全部發現 */
export const CATEGORY_XP = 200;
export const LORE_XP = 30;
export const TREASURE_XP = 80;
export const AFFIX_XP = 15;
export const UNIQUE_AFFIX_XP = 60;
export const FISH_FIRST_XP = 25;
export const FISH_LEGEND_XP = 100;
export const FISH_CATCH_XP = 2;
export const ORE_XP: Readonly<Partial<Record<number, number>>> = { [T.COPPER_ORE]: 2, [T.IRON_ORE]: 3, [T.SILVER_ORE]: 4, [T.GOLD_ORE]: 5 };
/** 每天上限（基礎值，未乘博學） */
export const DAILY_CAP = { ore: 80, fish: 30 } as const;
export function chestXp(depth: number): number { return 20 + Math.round(Math.max(0, Math.min(1, depth)) * 60); }
export function recipeXp(station: Station | null): number {
  return station === 'anvil' ? 20 : station === 'furnace' ? 15 : station ? 12 : 8;
}
/** 死亡損失本級進度的比例 */
export const DEATH_XP_LOSS = 0.1;
/** 掉落的物品等級：深度決定；等級最多往上推 1 階（12 級 → 2、24 → 3、36 → 4、48 → 5） */
export function lootIlvl(depthIlvl: number, level: number): number {
  const d = Math.max(1, Math.min(5, Math.floor(depthIlvl)));
  return Math.max(1, Math.min(5, Math.max(d, Math.min(d + 1, 1 + Math.floor(level / 12)))));
}
/** 重置技能樹：碎晶 3 + 已花點數、每 10 點 1 星塵 */
export function respecCost(spent: number): Cost {
  if (spent <= 0) return { shard: 0, dust: 0 };
  return { shard: 3 + spent, dust: Math.floor(spent / 10) };
}

export type XpSource = 'kill' | 'boss' | 'discover' | 'lore' | 'treasure' | 'codex' | 'craft' | 'mine' | 'chest' | 'fish' | 'debug';

// ── 狀態 ─────────────────────────────────────────────────
export interface LevelsJSON {
  xp: number;
  ranks: Ranks;
  respecs: number;
  /** 防刷計數的那一天、各種怪今天擊殺數、今天挖礦 / 釣魚拿了多少 */
  day: number;
  kills: Record<string, number>;
  ore: number;
  fish: number;
  /** 玩家放的礦 / 箱子、開過的寶箱（tile index）、做過的配方、完成的日誌分類、打過的首領 */
  placed: number[];
  chests: number[];
  recipes: string[];
  cats: string[];
  bosses: string[];
}
export interface GainResult { amount: number; from: number; to: number; }

export class Progression {
  xp = 0;
  ranks: Ranks = {};
  respecs = 0;
  /** 數值相關的改動（點技能 / 重置 / 升級）+1：遊戲的數值快取用 */
  version = 0;
  day = -1;
  kills = new Map<string, number>();
  ore = 0;
  fish = 0;
  readonly placed = new Set<number>();
  readonly chests = new Set<number>();
  readonly recipes = new Set<string>();
  readonly cats = new Set<string>();
  readonly bosses = new Set<string>();
  private memo: { v: number; t: SkillTotals } | null = null;
  /** 測試用：鎖住 = 不拿經驗（不存檔） */
  locked = false;

  get level(): number { return levelForXp(this.xp); }
  get spent(): number { return spentPoints(this.ranks); }
  /** 還沒花的技能點 */
  get points(): number { return Math.max(0, skillPointsAt(this.level) - this.spent); }
  rank(id: SkillId): number { return rankOf(this.ranks, id); }
  has(id: SkillId): boolean { return this.rank(id) > 0; }
  totals(): SkillTotals {
    if (!this.memo || this.memo.v !== this.version) this.memo = { v: this.version, t: skillTotals(this.ranks) };
    return this.memo.t;
  }
  progress(): LevelProgress { return progressOf(this.xp); }

  /** 加經驗（乘上博學）；回傳實際加了多少、升級前後的等級 */
  gain(n: number): GainResult {
    const from = this.level;
    if (this.locked) return { amount: 0, from, to: from };
    const amount = Math.max(0, Math.min(MAX_XP - this.xp, Math.round(Math.max(0, n) * (1 + this.totals().xp / 100))));
    this.xp += amount;
    const to = this.level;
    if (to !== from) this.version++;
    return { amount, from, to };
  }
  /** 換日：防刷計數歸零 */
  newDay(day: number): void {
    if (day === this.day) return;
    this.day = day; this.kills.clear(); this.ore = 0; this.fish = 0;
  }
  check(id: SkillId): LearnFail | null { return learnCheck(this.ranks, id, this.level, this.points); }
  learn(id: SkillId): LearnFail | null {
    const f = this.check(id);
    if (f) return f;
    this.ranks = { ...this.ranks, [id]: this.rank(id) + 1 };
    this.version++;
    return null;
  }
  /** 重置技能樹（材料由呼叫端扣）；回傳退回的點數 */
  respec(): number {
    const n = this.spent;
    this.ranks = {};
    this.respecs++;
    this.version++;
    return n;
  }
  /** 死亡：失去本級進度的 DEATH_XP_LOSS（不會掉級）；回傳失去多少 */
  die(): number {
    const p = this.progress();
    if (p.level >= MAX_LEVEL) return 0;
    const lost = Math.floor(p.into * DEATH_XP_LOSS);
    this.xp -= lost;
    return lost;
  }

  toJSON(): LevelsJSON {
    const ranks: Ranks = {};
    for (const s of SKILLS) if (this.rank(s.id) > 0) ranks[s.id] = this.rank(s.id);
    const num = (a: Iterable<number>): number[] => [...a].sort((x, y) => x - y);
    return {
      xp: this.xp, ranks, respecs: this.respecs, day: this.day,
      kills: Object.fromEntries([...this.kills].sort(([a], [b]) => (a < b ? -1 : 1))), ore: this.ore, fish: this.fish,
      placed: num(this.placed), chests: num(this.chests), recipes: [...this.recipes].sort(), cats: [...this.cats].sort(), bosses: [...this.bosses].sort(),
    };
  }
  /** 由存檔還原；壞資料各欄位獨立退回預設（技能樹不合法 → 整棵重置，點數退回） */
  load(raw: unknown): void {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof LevelsJSON, unknown>>;
    const int = (v: unknown, lo: number, hi: number, d: number): number => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : d);
    const ints = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x) && x >= 0) : []);
    const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length < 64) : []);
    this.xp = Math.max(0, Math.min(MAX_XP, typeof o.xp === 'number' && Number.isFinite(o.xp) ? Math.floor(o.xp) : 0));
    this.respecs = int(o.respecs, 0, 1e6, 0);
    this.day = int(o.day, -1, 1e9, -1);
    this.ore = int(o.ore, 0, 1e6, 0);
    this.fish = int(o.fish, 0, 1e6, 0);
    this.kills.clear();
    if (o.kills && typeof o.kills === 'object' && !Array.isArray(o.kills)) {
      for (const [k, n] of Object.entries(o.kills)) if (Object.prototype.hasOwnProperty.call(ENEMIES, k) && Number.isInteger(n) && (n as number) > 0) this.kills.set(k, n as number);
    }
    for (const [set, v] of [[this.placed, o.placed], [this.chests, o.chests]] as const) { set.clear(); for (const i of ints(v)) set.add(i); }
    for (const [set, v] of [[this.recipes, o.recipes], [this.cats, o.cats], [this.bosses, o.bosses]] as const) { set.clear(); for (const s of strs(v)) set.add(s); }
    // 技能樹：依前置順序重放，任何一級點不上去（前置 / 等級 / 點數）→ 整棵重置
    const want: Ranks = {};
    if (o.ranks && typeof o.ranks === 'object') {
      for (const [k, n] of Object.entries(o.ranks)) if (isSkillId(k) && Number.isInteger(n) && (n as number) > 0) want[k] = n as number;
    }
    this.ranks = {};
    let ok = true;
    const order = [...SKILLS].sort((a, b) => a.row - b.row);
    for (const s of order) {
      const k = want[s.id] ?? 0;
      if (k > skillDef(s.id).max) { ok = false; break; }
      for (let i = 0; i < k && ok; i++) if (this.learnRaw(s.id)) ok = false;
      if (!ok) break;
    }
    if (!ok) this.ranks = {};
    this.version++;
  }
  private learnRaw(id: SkillId): LearnFail | null {
    const f = learnCheck(this.ranks, id, this.level, this.points);
    if (!f) this.ranks = { ...this.ranks, [id]: this.rank(id) + 1 };
    return f;
  }
}

// ── 事件 → 經驗 ──────────────────────────────────────────
/** xpForEvent 需要的遊戲查詢 */
export interface XpCtx {
  /** 遊戲內第幾天（防刷計數換日） */
  day: number;
  idx(x: number, y: number): number;
  /** 0（地表）..1（世界底） */
  depth(x: number, y: number): number;
  /** 這種魚目前的釣魚紀錄條數（事件處理時已經加過這一條） */
  fishCount(item: ItemId): number;
  isFish(item: ItemId): boolean;
  legendary(item: ItemId): boolean;
  /** 日誌各分類的發現數 */
  catStats(): readonly { cat: string; found: number; total: number }[];
  recipeStation(id: string): Station | null | undefined;
}
export interface XpAward { amount: number; src: XpSource; x?: number; y?: number; }

/**
 * 一個遊戲事件值多少經驗（基礎值，未乘博學）；會更新 p 的防刷 / 第一次紀錄。不值經驗 → null。
 * 座標：x / y 有給就是 px（飄字位置），沒給 = 玩家頭上。
 */
export function xpForEvent(p: Progression, e: DelveEvent, c: XpCtx): XpAward | null {
  p.newDay(c.day);
  switch (e.type) {
    case 'kill': {
      const def = ENEMIES[e.kind];
      if (def.boss) {
        const first = !p.bosses.has(e.kind);
        p.bosses.add(e.kind);
        // 重打（召喚很便宜）：同一天第 n 次重打 ×0.5ⁿ（600 → 300 → 150 …，最低 BOSS_FLOOR）
        const n = p.kills.get(e.kind) ?? 0;
        p.kills.set(e.kind, n + 1);
        const amount = first ? BOSS_XP + BOSS_FIRST_XP : Math.max(BOSS_FLOOR, Math.round(BOSS_XP * 0.5 ** (n + 1)));
        return { amount, src: 'boss', x: e.x, y: e.y };
      }
      const n = p.kills.get(e.kind) ?? 0;
      p.kills.set(e.kind, n + 1);
      const amount = Math.max(1, Math.round(enemyXp(e.kind) * killMul(n)));
      return { amount, src: 'kill', x: e.x, y: e.y };
    }
    case 'place': {
      if (ORE_XP[e.tile] !== undefined || isChestTile(e.tile)) p.placed.add(c.idx(e.x, e.y));
      return null;
    }
    case 'mine': {
      const base = ORE_XP[e.tile];
      if (base === undefined) return null;
      const i = c.idx(e.x, e.y);
      if (p.placed.delete(i)) return null;
      const amount = Math.min(base, DAILY_CAP.ore - p.ore);
      if (amount <= 0) return null;
      p.ore += amount;
      return { amount, src: 'mine', x: (e.x + 0.5) * 16, y: e.y * 16 };
    }
    case 'chest': {
      if (!e.open) return null;
      const i = c.idx(e.x, e.y);
      if (p.placed.has(i) || p.chests.has(i)) return null;
      p.chests.add(i);
      return { amount: chestXp(c.depth(e.x, e.y)), src: 'chest', x: (e.x + 0.5) * 16, y: e.y * 16 };
    }
    case 'craft': {
      if (p.recipes.has(e.recipe)) return null;
      const st = c.recipeStation(e.recipe);
      if (st === undefined) return null;
      p.recipes.add(e.recipe);
      return { amount: recipeXp(st), src: 'craft' };
    }
    case 'discover': {
      let amount = REGION_XP[e.region.cat] ?? 0;
      for (const s of c.catStats()) {
        if (s.total > 0 && s.found >= s.total && !p.cats.has(s.cat)) { p.cats.add(s.cat); amount += CATEGORY_XP; }
      }
      return amount > 0 ? { amount, src: 'discover' } : null;
    }
    case 'lore': return e.first ? { amount: LORE_XP, src: 'lore' } : null;
    case 'treasure': return { amount: TREASURE_XP, src: 'treasure' };
    case 'codex': return { amount: affixDef(e.affix).kind === 'unique' ? UNIQUE_AFFIX_XP : AFFIX_XP, src: 'codex' };
    case 'fish': {
      if (e.phase !== 'catch' || !e.item) return null;
      if (c.isFish(e.item) && c.fishCount(e.item) === 1) return { amount: c.legendary(e.item) ? FISH_LEGEND_XP : FISH_FIRST_XP, src: 'fish' };
      const amount = Math.min(FISH_CATCH_XP, DAILY_CAP.fish - p.fish);
      if (amount <= 0) return null;
      p.fish += amount;
      return { amount, src: 'fish' };
    }
    default: return null;
  }
}
