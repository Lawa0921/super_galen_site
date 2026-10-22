// quests.ts — 委託（純邏輯，無 DOM）：村長 / 地廳長老的委託板 + 救援護送。
//   種類：collect 收集（交付時扣掉道具）、slay 討伐（接下之後才開始算擊殺）、explore 探索（去發現指定的地點）、escort 護送（受困探險者）。
//   防刷：每個委託 id 唯一（giver#序號）、獎勵只在交付時給一次（completed 記住）；委託板一開始 2 張，
//   之後每過一天才補一張（不會一直刷新）；同時最多 MAX_ACTIVE 個進行中。
import { Rng } from './rng';
import { ITEMS, isItemId, type ItemId } from './items';
import { ENEMIES, type EnemyKind } from './enemies';
import type { FolkRace } from './folkDefs';

export type QuestKind = 'collect' | 'slay' | 'explore' | 'escort';
export interface QuestReward { xp: number; coins: number; item?: { item: ItemId; n: number } }
export interface QuestDef {
  id: string;
  /** 委託人（folk key）與名字 */
  giver: string; giverName: string;
  kind: QuestKind;
  title: string; desc: string;
  n: number;
  item?: ItemId;
  enemy?: EnemyKind;
  /** explore：目標地區 id；escort：護送的人（folk key） */
  region?: number;
  target?: string;
  /** 目標位置（tile；地圖標記用） */
  at?: { x: number; y: number };
  reward: QuestReward;
}
export interface QuestState { def: QuestDef; progress: number; }
export interface QuestLogJSON {
  active: QuestState[];
  completed: string[];
  board: Record<string, { upTo: number; day: number }>;
}
export interface GiverInfo { key: string; name: string; race: FolkRace; x: number; y: number; }
/** 產生委託要從遊戲拿的東西 */
export interface QuestCtx {
  day: number;
  /** 離 (x,y) 最近、還沒發現的地點（cats 篩選；skip = 已被其他委託指定的） */
  nearestUnfound(x: number, y: number, cats: readonly string[], skip: ReadonlySet<number>): { id: number; name: string; x: number; y: number } | null;
}

export const MAX_ACTIVE = 5;
export const BOARD_START = 2;
/** 委託板最多同時掛幾張（還沒接的） */
export const BOARD_MAX = 3;

interface Tpl { kind: 'collect' | 'slay' | 'explore'; item?: ItemId; enemy?: EnemyKind; n: [number, number]; xp: number; coins: number; bonus?: ItemId; }
const HUMAN_TPL: readonly Tpl[] = [
  { kind: 'collect', item: 'wood', n: [25, 40], xp: 70, coins: 60 },
  { kind: 'collect', item: 'gel', n: [8, 14], xp: 80, coins: 80 },
  { kind: 'collect', item: 'mushroom', n: [4, 8], xp: 70, coins: 70, bonus: 'healing_potion' },
  { kind: 'collect', item: 'pumpkin', n: [2, 4], xp: 70, coins: 90 },
  { kind: 'collect', item: 'copper_bar', n: [5, 10], xp: 110, coins: 110 },
  { kind: 'collect', item: 'feather', n: [3, 6], xp: 90, coins: 90 },
  { kind: 'slay', enemy: 'gel_blob', n: [6, 10], xp: 90, coins: 80 },
  { kind: 'slay', enemy: 'night_walker', n: [3, 6], xp: 140, coins: 120, bonus: 'healing_potion' },
  { kind: 'slay', enemy: 'dusk_owl', n: [3, 5], xp: 130, coins: 110 },
  { kind: 'slay', enemy: 'cave_bat', n: [5, 8], xp: 110, coins: 90 },
  { kind: 'explore', n: [1, 1], xp: 160, coins: 120, bonus: 'gear_shard' },
  { kind: 'explore', n: [1, 1], xp: 160, coins: 120 },
];
const DWARF_TPL: readonly Tpl[] = [
  { kind: 'collect', item: 'iron_ore', n: [15, 25], xp: 140, coins: 140 },
  { kind: 'collect', item: 'silver_ore', n: [10, 16], xp: 170, coins: 180 },
  { kind: 'collect', item: 'gold_ore', n: [6, 10], xp: 210, coins: 240, bonus: 'gear_shard' },
  { kind: 'collect', item: 'crystal', n: [3, 6], xp: 170, coins: 200 },
  { kind: 'collect', item: 'obsidian', n: [4, 8], xp: 230, coins: 260 },
  { kind: 'slay', enemy: 'rock_crab', n: [4, 7], xp: 180, coins: 160 },
  { kind: 'slay', enemy: 'spore_walker', n: [3, 6], xp: 200, coins: 180 },
  { kind: 'slay', enemy: 'ember_imp', n: [2, 4], xp: 280, coins: 260, bonus: 'stardust' },
  { kind: 'slay', enemy: 'magma_bat', n: [3, 6], xp: 240, coins: 220 },
  { kind: 'explore', n: [1, 1], xp: 220, coins: 200, bonus: 'gear_shard' },
];
const EXPLORE_CATS = ['site', 'cave', 'secret', 'dungeon'];

const kindLabel: Record<QuestKind, string> = { collect: '收集', slay: '討伐', explore: '探索', escort: '護送' };
export function questKindLabel(k: QuestKind): string { return kindLabel[k]; }

/** 委託人的第 n 張委託（確定性：種子 + 委託人 + 序號；explore 依目前還沒發現的地點挑） */
export function makeQuest(seed: string, g: GiverInfo, n: number, ctx: QuestCtx, skip: ReadonlySet<number>): QuestDef | null {
  const rng = new Rng(`${seed}:quest:${g.key}:${n}`);
  const list = g.race === 'dwarf' ? DWARF_TPL : HUMAN_TPL;
  // 依序號錯開：前兩張保證一張收集、一張討伐（新玩家先拿到簡單的）
  let tpl = list[rng.int(0, list.length)];
  if (n === 0) tpl = list.find((t) => t.kind === 'collect')!;
  if (n === 1) tpl = list.find((t) => t.kind === 'slay')!;
  const id = `${g.key}#${n}`;
  const scale = 1 + Math.min(1.5, n * 0.12);
  const base = { id, giver: g.key, giverName: g.name };
  const reward = (k = 1): QuestReward => ({
    xp: Math.round(tpl.xp * scale * k), coins: Math.round(tpl.coins * scale * k),
    ...(tpl.bonus ? { item: { item: tpl.bonus, n: tpl.bonus === 'healing_potion' ? 2 : 1 } } : {}),
  });
  if (tpl.kind === 'explore') {
    const r = ctx.nearestUnfound(g.x, g.y, g.race === 'dwarf' ? ['cave', 'site', 'secret'] : EXPLORE_CATS, skip);
    if (!r) { tpl = list[0]; } else {
      return { ...base, kind: 'explore', title: `探索：${r.name}`, desc: `${g.name}想知道「${r.name}」那邊現在是什麼樣子。去那裡看看，再回來報告。（已標在地圖上）`,
        n: 1, region: r.id, at: { x: r.x, y: r.y }, reward: reward() };
    }
  }
  const cnt = rng.int(tpl.n[0], tpl.n[1] + 1);
  if (tpl.kind === 'slay' && tpl.enemy) {
    const name = ENEMIES[tpl.enemy].name.zh;
    return { ...base, kind: 'slay', title: `討伐：${name} ×${cnt}`, desc: `${name}最近在附近出沒得太頻繁了。接下委託後打倒 ${cnt} 隻，再回來找${g.name}。`,
      n: cnt, enemy: tpl.enemy, reward: reward() };
  }
  const item = tpl.item ?? 'wood';
  return { ...base, kind: 'collect', title: `收集：${ITEMS[item].name.zh} ×${cnt}`, desc: `${g.name}需要 ${cnt} 個${ITEMS[item].name.zh}。帶齊了回來交給${g.name}。`,
    n: cnt, item, reward: reward() };
}

export class QuestLog {
  active: QuestState[] = [];
  readonly completed = new Set<string>();
  board: Record<string, { upTo: number; day: number }> = {};
  constructor(readonly seed: string) {}

  /** 委託板：補張數（每天最多補一張）→ 還沒接、還沒完成的委託（最多 BOARD_MAX 張） */
  offers(g: GiverInfo, ctx: QuestCtx): QuestDef[] {
    let b = this.board[g.key];
    if (!b) b = this.board[g.key] = { upTo: BOARD_START, day: ctx.day };
    if (ctx.day > b.day) {
      // 每過一天補一張（掛著沒接的已經滿了就不補）
      const open = this.openIndices(g.key, b.upTo).length;
      b.upTo += Math.max(0, Math.min(ctx.day - b.day, BOARD_MAX - open));
      b.day = ctx.day;
    }
    const skip = new Set(this.active.filter((q) => q.def.kind === 'explore' && q.def.region !== undefined).map((q) => q.def.region!));
    const out: QuestDef[] = [];
    for (const n of this.openIndices(g.key, b.upTo)) {
      const q = makeQuest(this.seed, g, n, ctx, skip);
      if (q) { out.push(q); if (q.region !== undefined) skip.add(q.region); }
      if (out.length >= BOARD_MAX) break;
    }
    return out;
  }
  private openIndices(key: string, upTo: number): number[] {
    const out: number[] = [];
    for (let n = 0; n < upTo; n++) {
      const id = `${key}#${n}`;
      if (!this.completed.has(id) && !this.active.some((q) => q.def.id === id)) out.push(n);
    }
    return out;
  }
  has(id: string): boolean { return this.active.some((q) => q.def.id === id); }
  get(id: string): QuestState | null { return this.active.find((q) => q.def.id === id) ?? null; }
  /** 接委託：已滿 / 接過 / 完成過 → false */
  accept(def: QuestDef): boolean {
    if (this.active.length >= MAX_ACTIVE || this.has(def.id) || this.completed.has(def.id)) return false;
    this.active.push({ def: { ...def, ...(def.at ? { at: { ...def.at } } : {}), reward: { ...def.reward } }, progress: 0 });
    return true;
  }
  /** 擊殺（討伐委託 +1） */
  onKill(kind: EnemyKind): QuestState[] {
    const hit: QuestState[] = [];
    for (const q of this.active) if (q.def.kind === 'slay' && q.def.enemy === kind && q.progress < q.def.n) { q.progress++; hit.push(q); }
    return hit;
  }
  /** 更新收集 / 探索 / 護送的進度（每次打開面板或每秒呼叫） */
  refresh(count: (item: ItemId) => number, found: (region: number) => boolean, arrived: (target: string) => boolean): void {
    for (const q of this.active) {
      const d = q.def;
      if (d.kind === 'collect' && d.item) q.progress = Math.min(d.n, count(d.item));
      else if (d.kind === 'explore' && d.region !== undefined) q.progress = found(d.region) ? 1 : 0;
      else if (d.kind === 'escort' && d.target) q.progress = Math.max(q.progress, arrived(d.target) ? 1 : 0);
    }
  }
  ready(q: QuestState): boolean { return q.progress >= q.def.n; }
  /** 交付（條件達成才行；collect 由呼叫端扣道具）→ 拿到的委託；完成過的不會再給 */
  turnIn(id: string): QuestDef | null {
    const q = this.get(id);
    if (!q || !this.ready(q) || this.completed.has(id)) return null;
    this.active = this.active.filter((a) => a !== q);
    this.completed.add(id);
    return q.def;
  }
  abandon(id: string): boolean {
    const n = this.active.length;
    this.active = this.active.filter((q) => q.def.id !== id || q.def.kind === 'escort');
    return this.active.length < n;
  }

  toJSON(): QuestLogJSON {
    return {
      active: this.active.map((q) => ({ def: { ...q.def, reward: { ...q.def.reward } }, progress: q.progress })),
      completed: [...this.completed].sort(),
      board: Object.fromEntries(Object.entries(this.board).map(([k, v]) => [k, { ...v }])),
    };
  }
  load(j: unknown): void {
    this.active = []; this.completed.clear(); this.board = {};
    if (!j || typeof j !== 'object') return;
    const o = j as Partial<QuestLogJSON>;
    const int = (v: unknown): v is number => Number.isInteger(v);
    for (const id of Array.isArray(o.completed) ? o.completed : []) if (typeof id === 'string') this.completed.add(id);
    for (const q of Array.isArray(o.active) ? o.active : []) {
      const d = q?.def as Partial<QuestDef> | undefined;
      if (!d || typeof d.id !== 'string' || typeof d.giver !== 'string' || !d.reward || !int(d.n) || d.n < 1) continue;
      if (!['collect', 'slay', 'explore', 'escort'].includes(d.kind as string) || this.completed.has(d.id) || this.has(d.id)) continue;
      if (d.item !== undefined && !isItemId(d.item)) continue;
      if (d.enemy !== undefined && !Object.prototype.hasOwnProperty.call(ENEMIES, d.enemy)) continue;
      const r = d.reward;
      if (!int(r.xp) || !int(r.coins) || (r.item && (!isItemId(r.item.item) || !int(r.item.n)))) continue;
      this.active.push({ def: d as QuestDef, progress: int(q.progress) ? Math.max(0, Math.min(d.n, q.progress)) : 0 });
      if (this.active.length >= MAX_ACTIVE + 1) break;
    }
    if (o.board && typeof o.board === 'object') {
      for (const [k, v] of Object.entries(o.board)) if (v && int(v.upTo) && int(v.day) && v.upTo >= 0 && v.upTo < 10000) this.board[k] = { upTo: v.upTo, day: v.day };
    }
  }
}
