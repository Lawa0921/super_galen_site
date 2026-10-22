// gear.ts — 裝備詞條系統（純資料 + 純函式，不碰 DOM / 遊戲狀態）。
//   · 稀有度 6 階：普通 / 優良 / 稀有 / 史詩 / 傳說 / 神話。決定詞條數與可擲的階數範圍。
//   · 詞條：前綴（「熾焰的」）/ 後綴（「· 迅捷」）/ 傳奇詞條（特殊效果，只在傳說以上出現）。
//     依裝備槽（武器 / 防具 / 飾品 / 工具）過濾、加權抽選；每條詞條 5 階，數值在該階範圍內擲。
//   · 物品等級（ilvl 1..5，來自深度 / 來源）限制最高階：早期最多 T2，前期不會失衡。
//   · 分解 → 碎晶 / 星塵；洗煉（換一條詞條）、強化（+1..+5）、升階（稀有度 +1，到傳說為止）。
// 所有擲骰都吃呼叫端給的 Rng（確定性，可測）。
import { Rng } from './rng';
import { ITEMS, INFO_ACCESSORIES, type ArmorSlot, type ItemId } from './items';

// ── 稀有度 ───────────────────────────────────────────────
export type Rarity = 0 | 1 | 2 | 3 | 4 | 5;
export interface RarityDef {
  id: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
  zh: string;
  en: string;
  /** 名稱 / 外框亮色、暗色（全部取自 render/pixel.ts 的統一色票） */
  color: string;
  dark: string;
  /** 一般詞條數 */
  affixes: number;
  /** 另外帶一條傳奇詞條 */
  unique: boolean;
  /** 可擲的詞條階數 [最低, 最高]（再受物品等級限制） */
  tiers: readonly [number, number];
}
export const RARITIES: readonly RarityDef[] = [
  { id: 'common', zh: '普通', en: 'Common', color: '#ffffff', dark: '#858aa0', affixes: 0, unique: false, tiers: [1, 1] },
  { id: 'uncommon', zh: '優良', en: 'Uncommon', color: '#93cc50', dark: '#2d672e', affixes: 1, unique: false, tiers: [1, 2] },
  { id: 'rare', zh: '稀有', en: 'Rare', color: '#5c9ce0', dark: '#2c4486', affixes: 2, unique: false, tiers: [1, 3] },
  { id: 'epic', zh: '史詩', en: 'Epic', color: '#9a6ee0', dark: '#463c78', affixes: 3, unique: false, tiers: [2, 4] },
  { id: 'legendary', zh: '傳說', en: 'Legendary', color: '#ffa93a', dark: '#a83a10', affixes: 3, unique: true, tiers: [3, 5] },
  { id: 'mythic', zh: '神話', en: 'Mythic', color: '#fff4c0', dark: '#e8701c', affixes: 4, unique: true, tiers: [4, 5] },
];
export const RARITY_COUNT = RARITIES.length;
/** 升階的上限（神話只能靠掉落） */
export const MAX_ASCEND = 4;
export const MAX_PLUS = 5;

// ── 裝備槽 ───────────────────────────────────────────────
export type GearSlot = 'weapon' | 'armor' | 'accessory' | 'tool';
/** 能帶詞條的道具：不可堆疊的武器 / 防具 / 鎬 / 飾品 */
export function gearSlot(id: ItemId): GearSlot | null {
  const d = ITEMS[id];
  if (!d || d.maxStack !== 1) return null;
  if (d.weapon) return 'weapon';
  if (d.armor) return 'armor';
  if (d.pick) return 'tool';
  if (d.accessory) return 'accessory';
  return null;
}
export function isGearItem(id: ItemId): boolean { return gearSlot(id) !== null; }

// ── 詞條 ─────────────────────────────────────────────────
export type StatKey =
  | 'dmg' | 'crit' | 'kb' | 'leech' | 'burn' | 'frost' | 'poison' | 'pen'
  | 'def' | 'hp' | 'thorns' | 'mine'
  | 'atkspd' | 'move' | 'jump' | 'light' | 'regen' | 'luck'
  // 傳奇效果
  | 'chain' | 'soul' | 'djump' | 'undying' | 'vein';
export const STAT_KEYS: readonly StatKey[] = [
  'dmg', 'crit', 'kb', 'leech', 'burn', 'frost', 'poison', 'pen', 'def', 'hp', 'thorns', 'mine',
  'atkspd', 'move', 'jump', 'light', 'regen', 'luck', 'chain', 'soul', 'djump', 'undying', 'vein',
];
/** 數值說明（面板 / 說明用）與單位 */
export const STAT_LABEL: Record<StatKey, string> = {
  dmg: '傷害', crit: '暴擊率', kb: '擊退', leech: '生命竊取', burn: '命中燃燒機率', frost: '命中冰凍機率', poison: '命中中毒機率',
  pen: '破甲', def: '防禦', hp: '生命上限', thorns: '荊棘反傷', mine: '挖掘速度', atkspd: '攻擊速度', move: '移動速度',
  jump: '跳躍高度', light: '照明', regen: '生命回復', luck: '幸運',
  chain: '連鎖閃電機率', soul: '擊殺回復', djump: '空中再跳', undying: '致命一擊保命', vein: '礦石加倍機率',
};
export const STAT_UNIT: Record<StatKey, '%' | '' | '/秒' | '秒'> = {
  dmg: '%', crit: '%', kb: '%', leech: '%', burn: '%', frost: '%', poison: '%', pen: '', def: '', hp: '', thorns: '',
  mine: '%', atkspd: '%', move: '%', jump: '%', light: '%', regen: '/秒', luck: '%',
  chain: '%', soul: '%', djump: '', undying: '秒', vein: '%',
};
/** 全身加總的上限（再多也不算）：讓滿身神話也不會無敵 */
export const STAT_CAPS: Record<StatKey, number> = {
  dmg: 80, crit: 30, kb: 100, leech: 6, burn: 50, frost: 50, poison: 50, pen: 20, def: 16, hp: 100, thorns: 40, mine: 100,
  atkspd: 40, move: 40, jump: 60, light: 100, regen: 4, luck: 100,
  chain: 100, soul: 100, djump: 1, undying: 999, vein: 100,
};

export type AffixId =
  | 'keen' | 'savage' | 'heavy' | 'leeching' | 'blazing' | 'rime' | 'venom' | 'stout' | 'hale' | 'thorned' | 'delving'
  | 'swift' | 'gale' | 'bound' | 'glow' | 'mending' | 'fortune' | 'sunder'
  | 'stormcall' | 'soulreap' | 'skyleap' | 'undying' | 'veinsong';
export interface AffixDef {
  id: AffixId;
  kind: 'prefix' | 'suffix' | 'unique';
  /** 命名用的字：前綴「熾焰的」、後綴「迅捷」 */
  word: string;
  stat: StatKey;
  slots: readonly GearSlot[];
  /** 防具限定部位（省略 = 全部） */
  armorSlots?: readonly ArmorSlot[];
  weight: number;
  /** 各階 [最低, 最高]（傳奇詞條只有一階 = 固定值） */
  tiers: readonly (readonly [number, number])[];
  /** 數值以 0.1 為單位擲（回血） */
  tenths?: boolean;
  /** 互斥群組（燃燒 / 冰凍 / 中毒同一件最多一種） */
  group?: string;
  /** 傳奇詞條的效果說明 */
  desc?: string;
}

const P = (id: AffixId, word: string, stat: StatKey, slots: GearSlot[], weight: number, tiers: [number, number][], extra: Partial<AffixDef> = {}): AffixDef =>
  ({ id, kind: 'prefix', word, stat, slots, weight, tiers, ...extra });
const S = (id: AffixId, word: string, stat: StatKey, slots: GearSlot[], weight: number, tiers: [number, number][], extra: Partial<AffixDef> = {}): AffixDef =>
  ({ id, kind: 'suffix', word, stat, slots, weight, tiers, ...extra });
const U = (id: AffixId, word: string, stat: StatKey, slots: GearSlot[], value: number, desc: string, extra: Partial<AffixDef> = {}): AffixDef =>
  ({ id, kind: 'unique', word, stat, slots, weight: 10, tiers: [[value, value]], desc, ...extra });
const ELEM: [number, number][] = [[6, 9], [10, 14], [15, 20], [21, 27], [28, 35]];

export const AFFIXES: readonly AffixDef[] = [
  // ── 前綴 ──
  P('keen', '鋒銳的', 'dmg', ['weapon', 'accessory'], 10, [[3, 5], [6, 9], [10, 14], [15, 20], [21, 28]]),
  P('savage', '致命的', 'crit', ['weapon', 'accessory'], 8, [[1, 2], [3, 4], [5, 6], [7, 9], [10, 12]]),
  P('heavy', '沉重的', 'kb', ['weapon'], 6, [[10, 15], [16, 25], [26, 35], [36, 50], [51, 70]]),
  P('leeching', '嗜血的', 'leech', ['weapon'], 4, [[1, 1], [1, 2], [2, 3], [3, 4], [4, 5]]),
  P('blazing', '熾焰的', 'burn', ['weapon'], 5, ELEM, { group: 'element' }),
  P('rime', '霜寒的', 'frost', ['weapon'], 5, ELEM, { group: 'element' }),
  P('venom', '蝕毒的', 'poison', ['weapon'], 5, ELEM, { group: 'element' }),
  P('stout', '堅韌的', 'def', ['armor', 'accessory'], 10, [[1, 1], [1, 2], [2, 2], [2, 3], [3, 4]]),
  P('hale', '強健的', 'hp', ['armor', 'accessory'], 9, [[4, 6], [7, 10], [11, 15], [16, 21], [22, 30]]),
  P('thorned', '荊棘的', 'thorns', ['armor'], 5, [[2, 3], [4, 6], [7, 9], [10, 13], [14, 18]]),
  P('delving', '勤掘的', 'mine', ['tool'], 12, [[6, 10], [11, 16], [17, 24], [25, 33], [34, 45]]),
  // ── 後綴 ──
  S('swift', '迅捷', 'atkspd', ['weapon', 'accessory'], 8, [[2, 3], [4, 5], [6, 8], [9, 11], [12, 15]]),
  S('sunder', '破甲', 'pen', ['weapon'], 6, [[1, 2], [3, 4], [5, 6], [7, 9], [10, 12]]),
  S('gale', '疾風', 'move', ['armor', 'accessory', 'tool'], 7, [[2, 3], [4, 6], [7, 9], [10, 12], [13, 16]]),
  S('bound', '躍動', 'jump', ['armor', 'accessory'], 6, [[4, 6], [7, 10], [11, 15], [16, 20], [21, 26]]),
  S('glow', '螢光', 'light', ['armor', 'accessory', 'tool'], 6, [[10, 15], [16, 25], [26, 35], [36, 50], [51, 70]]),
  S('mending', '再生', 'regen', ['armor', 'accessory'], 6, [[0.2, 0.3], [0.4, 0.5], [0.6, 0.8], [0.9, 1.1], [1.2, 1.5]], { tenths: true }),
  S('fortune', '尋寶', 'luck', ['weapon', 'armor', 'accessory', 'tool'], 5, [[3, 5], [6, 9], [10, 14], [15, 20], [21, 28]]),
  // ── 傳奇詞條（傳說 / 神話限定） ──
  U('stormcall', '奔雷的', 'chain', ['weapon'], 25, '命中時 25% 機率放出連鎖閃電，跳到附近最多 3 隻怪物（60% 傷害）'),
  U('soulreap', '噬魂的', 'soul', ['weapon'], 6, '擊殺怪物時回復 6% 生命上限'),
  U('skyleap', '凌雲的', 'djump', ['armor', 'accessory'], 1, '可以在空中再跳一次', { armorSlots: ['legs'] }),
  U('undying', '不滅的', 'undying', ['armor', 'accessory'], 90, '受到致命傷時以 1 點生命撐住（冷卻 90 秒）', { armorSlots: ['head', 'body'] }),
  U('veinsong', '脈鳴的', 'vein', ['tool'], 35, '挖礦時 35% 機率礦石加倍'),
];
export const AFFIX_IDS: readonly AffixId[] = AFFIXES.map((a) => a.id);
const AFFIX_MAP = new Map<string, AffixDef>(AFFIXES.map((a) => [a.id, a]));
export function affixDef(id: AffixId): AffixDef {
  const d = AFFIX_MAP.get(id);
  if (!d) throw new Error(`unknown affix ${id}`);
  return d;
}
export function isAffixId(v: unknown): v is AffixId { return typeof v === 'string' && AFFIX_MAP.has(v); }

// ── 裝備實例資料 ────────────────────────────────────────
export interface Affix { id: AffixId; tier: number; value: number; }
export interface Gear {
  rarity: number;
  /** 物品等級 1..5（限制詞條最高階） */
  ilvl: number;
  /** 強化等級 0..MAX_PLUS */
  plus: number;
  affixes: Affix[];
  /** 鎖定（不會被分解） */
  locked?: boolean;
  /** 洗煉次數（成本遞增） */
  rerolls?: number;
  /** 合成出來的（分解幾乎拿不到材料，避免「砍樹 → 合成 → 分解」刷碎晶） */
  crafted?: boolean;
}
export function cloneGear(g: Gear): Gear {
  return { ...g, affixes: g.affixes.map((a) => ({ ...a })) };
}
export const NORMAL_LIMIT = { prefix: 2, suffix: 2 } as const;

/** 稀有度 + 物品等級 → 可擲的階數 [min, max] */
export function tierRange(rarity: number, ilvl: number): [number, number] {
  const R = RARITIES[clampRarity(rarity)].tiers;
  const max = Math.min(R[1], Math.max(1, ilvl) + 1);
  return [Math.min(R[0], max), max];
}
function clampRarity(r: number): Rarity { return Math.max(0, Math.min(RARITY_COUNT - 1, Math.floor(r))) as Rarity; }

function slotOk(d: AffixDef, item: ItemId, slot: GearSlot): boolean {
  if (!d.slots.includes(slot)) return false;
  if (slot === 'armor' && d.armorSlots) return d.armorSlots.includes(ITEMS[item].armor!.slot);
  return true;
}
function weighted<T>(rng: Rng, list: readonly T[], w: (t: T) => number): T | null {
  let sum = 0;
  for (const t of list) sum += w(t);
  if (sum <= 0) return null;
  let v = rng.next() * sum;
  for (const t of list) { v -= w(t); if (v < 0) return t; }
  return list[list.length - 1];
}
function rollValue(d: AffixDef, tier: number, rng: Rng): number {
  const [lo, hi] = d.tiers[Math.min(d.tiers.length, tier) - 1];
  if (d.tenths) return rng.int(Math.round(lo * 10), Math.round(hi * 10) + 1) / 10;
  return rng.int(lo, hi + 1);
}
/** 擲一條一般詞條（kind 省略 = 前綴 / 後綴都可） */
function rollNormal(item: ItemId, slot: GearSlot, have: readonly Affix[], rarity: number, ilvl: number, rng: Rng, kind?: 'prefix' | 'suffix', exclude?: AffixId): Affix | null {
  const used = new Set(have.map((a) => a.id));
  const groups = new Set(have.map((a) => affixDef(a.id).group).filter(Boolean));
  const np = have.filter((a) => affixDef(a.id).kind === 'prefix').length, ns = have.filter((a) => affixDef(a.id).kind === 'suffix').length;
  const pool = AFFIXES.filter((d) => d.kind !== 'unique' && (!kind || d.kind === kind) && d.id !== exclude && !used.has(d.id)
    && !(d.group && groups.has(d.group)) && slotOk(d, item, slot)
    && (d.kind === 'prefix' ? np < NORMAL_LIMIT.prefix : ns < NORMAL_LIMIT.suffix));
  const d = weighted(rng, pool, (x) => x.weight);
  if (!d) return null;
  const [lo, hi] = tierRange(rarity, ilvl);
  const tier = rng.int(lo, hi + 1);
  return { id: d.id, tier, value: rollValue(d, tier, rng) };
}
function rollUnique(item: ItemId, slot: GearSlot, rng: Rng): Affix | null {
  const d = weighted(rng, AFFIXES.filter((x) => x.kind === 'unique' && slotOk(x, item, slot)), (x) => x.weight);
  return d ? { id: d.id, tier: 5, value: d.tiers[0][0] } : null;
}
/** 詞條排序：前綴 → 傳奇 → 後綴（命名 / 顯示用） */
function sortAffixes(a: Affix[]): Affix[] {
  const k = { prefix: 0, unique: 1, suffix: 2 } as const;
  return a.map((x, i) => ({ x, i })).sort((p, q) => k[affixDef(p.x.id).kind] - k[affixDef(q.x.id).kind] || p.i - q.i).map((o) => o.x);
}

/** 擲一件裝備的詞條（item 必須是裝備；ilvl 至少是基底等級） */
export function rollGear(item: ItemId, rng: Rng, o: { rarity: number; ilvl: number }): Gear {
  const slot = gearSlot(item);
  if (!slot) throw new Error(`rollGear: ${item} is not gear`);
  const rarity = clampRarity(o.rarity), R = RARITIES[rarity];
  const ilvl = Math.max(1, Math.min(5, Math.max(Math.floor(o.ilvl), baseTier(item))));
  const affixes: Affix[] = [];
  let n = R.affixes;
  if (R.unique) {
    const u = rollUnique(item, slot, rng);
    if (u) affixes.push(u); else n++;
  }
  for (let k = 0; k < n; k++) {
    const a = rollNormal(item, slot, affixes, rarity, ilvl, rng);
    if (!a) break;
    affixes.push(a);
  }
  return { rarity, ilvl, plus: 0, affixes: sortAffixes(affixes) };
}

// ── 稀有度權重 / 來源 ────────────────────────────────────
export type LootSource = 'craft' | 'enemy' | 'chest' | 'dungeon' | 'fish' | 'boss';
const BASE_W: Record<LootSource, readonly number[]> = {
  // 合成：大多普通、少量優良 / 稀有，不出史詩以上（也不吃深度 / 幸運）
  craft: [80, 18, 2, 0, 0, 0],
  enemy: [52, 30, 13, 4.4, 1.4, 0.15],
  chest: [34, 34, 21, 8.5, 2.2, 0.3],
  dungeon: [8, 28, 36, 20, 7, 1],
  fish: [40, 32, 19, 7, 1.8, 0.2],
  boss: [0, 0, 28, 46, 23, 3],
};
/** 來源 + 深度 0..1 + 幸運（%）→ 各稀有度機率（加總 1）。越深 / 越幸運，高階越多。 */
export function rarityWeights(src: LootSource, depth: number, luck: number): number[] {
  const d = Math.max(0, Math.min(1, depth)), L = Math.max(0, luck) / 100;
  const w = BASE_W[src].map((v, k) => {
    if (k === 0 || v === 0) return v;
    let x = v;
    if (src !== 'craft' && src !== 'boss') x *= 1 + d * k * 0.35;
    if (src !== 'craft') x *= 1 + L * k * 0.5;
    return x;
  });
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((v) => v / sum);
}
export function rollRarity(rng: Rng, src: LootSource, depth: number, luck: number, floor = 0): Rarity {
  const w = rarityWeights(src, depth, luck);
  let v = rng.next();
  for (let k = 0; k < w.length; k++) { v -= w[k]; if (v < 0) return Math.max(floor, k) as Rarity; }
  return Math.max(floor, RARITY_COUNT - 1) as Rarity;
}
/** 深度 0..1 → 物品等級 1..5 */
export function ilvlForDepth(depth: number): number {
  return 1 + Math.min(4, Math.floor(Math.max(0, Math.min(1, depth)) * 5));
}

/** 基底等級（掉落池 / 合成的物品等級） */
export const BASE_TIER: Partial<Record<ItemId, number>> = {
  wood_sword: 1, wood_bow: 1, wood_boomerang: 1, wood_helmet: 1, wood_chestplate: 1, wood_greaves: 1, wood_pickaxe: 1,
  copper_sword: 1, copper_helmet: 1, copper_chestplate: 1, copper_greaves: 1, copper_pickaxe: 1, feather_charm: 1,
  iron_sword: 2, iron_spear: 2, iron_helmet: 2, iron_chestplate: 2, iron_greaves: 2, iron_pickaxe: 2, chitin_buckler: 2,
  silver_bow: 3, silver_pickaxe: 3, gold_sword: 3, gold_helmet: 3, gold_chestplate: 3, gold_greaves: 3, gold_pickaxe: 3,
  fang_charm: 3, crystal_staff: 3, jump_boots: 3, swift_boots: 3, magnet: 3,
  bone_helmet: 4, bone_chestplate: 4, bone_greaves: 4, bone_greatsword: 4, magma_ward: 4, night_amulet: 4, explorer_map: 4,
  molten_helmet: 5, molten_chestplate: 5, molten_greaves: 5, lumen_blade: 5, warden_heart: 5, rune_pickaxe: 5,
};
export function baseTier(item: ItemId): number { return BASE_TIER[item] ?? 1; }
const SLOT_WEIGHT: Record<GearSlot, number> = { weapon: 4, armor: 3, tool: 2, accessory: 2 };
const POOL_CACHE = new Map<number, ItemId[]>();
/** 隨機掉落的基底：等級在 [ilvl−1, ilvl]、不是珍寶、不是資訊類飾品 */
export function dropPool(ilvl: number): ItemId[] {
  const L = Math.max(1, Math.min(5, Math.floor(ilvl)));
  let p = POOL_CACHE.get(L);
  if (!p) {
    p = (Object.keys(BASE_TIER) as ItemId[]).filter((id) => {
      const d = ITEMS[id], t = baseTier(id);
      return gearSlot(id) && !d.unique && !(d.accessory && INFO_ACCESSORIES.includes(d.accessory)) && t >= Math.max(1, L - 1) && t <= L;
    });
    POOL_CACHE.set(L, p);
  }
  return p;
}
export function rollDropItem(rng: Rng, ilvl: number): ItemId {
  const pool = dropPool(ilvl);
  return weighted(rng, pool, (id) => SLOT_WEIGHT[gearSlot(id)!]) ?? pool[0];
}

// ── 名稱 ─────────────────────────────────────────────────
/** 「前綴的 基底 · 後綴 +強化」；有傳奇詞條時用傳奇詞條當前綴 */
export function gearName(item: ItemId, g: Gear | undefined): string {
  const base = ITEMS[item].name.zh;
  if (!g) return base;
  const u = g.affixes.find((a) => affixDef(a.id).kind === 'unique');
  const pre = u ?? g.affixes.find((a) => affixDef(a.id).kind === 'prefix');
  const suf = g.affixes.find((a) => affixDef(a.id).kind === 'suffix');
  return `${pre ? `${affixDef(pre.id).word} ` : ''}${base}${suf ? ` · ${affixDef(suf.id).word}` : ''}${g.plus > 0 ? ` +${g.plus}` : ''}`;
}
export function rarityOf(g: Gear | undefined): Rarity { return g ? clampRarity(g.rarity) : 0; }
/**
 * 詞條強度（同部位比較「哪件最弱」用；不看物品本身的基礎效果）：
 * 稀有度 + 每條一般詞條的階數 + 傳奇詞條各 6，整體 ×(1 + 0.08 × 強化)。沒有詞條 = 0。
 */
export function gearPower(g: Gear | undefined): number {
  if (!g) return 0;
  let s = clampRarity(g.rarity);
  for (const a of g.affixes) s += affixDef(a.id).kind === 'unique' ? 6 : a.tier;
  return s * (1 + 0.08 * g.plus);
}

// ── 數值 ─────────────────────────────────────────────────
export type GearTotals = Record<StatKey, number>;
export function emptyTotals(): GearTotals {
  const t = {} as GearTotals;
  for (const k of STAT_KEYS) t[k] = 0;
  return t;
}
/** 詞條實際數值：飾品每級強化 +8%（飾品沒有基礎數值可強化） */
export function affixValue(a: Affix, item: ItemId, g: Gear): number {
  if (affixDef(a.id).kind === 'unique') return a.value;
  return gearSlot(item) === 'accessory' ? a.value * (1 + 0.08 * g.plus) : a.value;
}
export function addGearTotals(t: GearTotals, item: ItemId, g: Gear | undefined): GearTotals {
  if (!g) return t;
  for (const a of g.affixes) {
    const d = affixDef(a.id), v = affixValue(a, item, g);
    if (d.kind === 'unique') t[d.stat] = Math.max(t[d.stat], v); else t[d.stat] += v;
  }
  return t;
}
export function capTotals(t: GearTotals): GearTotals {
  const o = emptyTotals();
  for (const k of STAT_KEYS) o[k] = Math.min(STAT_CAPS[k], t[k]);
  return o;
}
const ARMOR_PLUS = [0, 1, 1, 2, 2, 3];
export function weaponDamage(item: ItemId, g: Gear | undefined): number {
  return (ITEMS[item].weapon?.damage ?? 0) * (1 + 0.06 * (g?.plus ?? 0));
}
export function armorDefense(item: ItemId, g: Gear | undefined): number {
  return (ITEMS[item].armor?.defense ?? 0) + ARMOR_PLUS[Math.max(0, Math.min(MAX_PLUS, g?.plus ?? 0))];
}
export function pickSpeed(item: ItemId, g: Gear | undefined): number {
  const base = ITEMS[item].pick?.speed ?? 0;
  if (!g) return base;
  let mine = 0;
  for (const a of g.affixes) if (affixDef(a.id).stat === 'mine') mine += a.value;
  return base * (1 + 0.05 * g.plus) * (1 + mine / 100);
}
/** 「燃燒機率 +12%」（含強化放大） */
export function affixText(a: Affix, item: ItemId, g: Gear): string {
  const d = affixDef(a.id);
  if (d.kind === 'unique') return d.desc ?? STAT_LABEL[d.stat];
  const v = affixValue(a, item, g), unit = STAT_UNIT[d.stat];
  const num = d.tenths ? v.toFixed(1) : String(Math.round(v * 10) / 10);
  return `${STAT_LABEL[d.stat]} +${num}${unit}`;
}

// ── 分解 / 洗煉 / 強化 / 升階 ─────────────────────────────
export interface Cost { shard: number; dust: number; }
const SALVAGE_BASE: readonly (readonly [number, number])[] = [[1, 0], [3, 0], [6, 1], [12, 3], [20, 6], [32, 12]];
/** 合成裝備的分解表（只有碎晶；不加物品等級） */
const SALVAGE_CRAFTED: readonly number[] = [0, 1, 2, 3, 5, 8];
/**
 * 分解得到的碎晶 / 星塵（固定公式，沒有隨機）。
 * 掉落的：稀有度底數 + ⌊物品等級 / 2⌋；合成的：只有很少的碎晶（普通 0 / 優良 1 / 稀有 2），沒有星塵。
 * 強化過的另外退還一部分（每級 3 碎晶，+3 起退星塵）——強化本來就要花材料，退還永遠少於花費。
 */
export function salvageYield(g: Gear | undefined): Cost {
  const r = rarityOf(g), ilvl = g?.ilvl ?? 1, plus = g?.plus ?? 0;
  const refund = { shard: plus * 3, dust: plus >= 3 ? plus - 2 : 0 };
  if (g?.crafted) return { shard: SALVAGE_CRAFTED[r] + refund.shard, dust: refund.dust };
  const [s, d] = SALVAGE_BASE[r];
  return { shard: s + Math.floor(ilvl / 2) + refund.shard, dust: d + refund.dust };
}
const UP_SHARD = [6, 12, 20, 32, 48], UP_DUST = [0, 0, 1, 2, 4];
/** 強化成本只看強化等級（不看稀有度）→ 先強化或先升階，總成本一樣 */
export function upgradeCost(g: Gear | undefined): Cost | null {
  const p = g?.plus ?? 0;
  if (p >= MAX_PLUS) return null;
  return { shard: UP_SHARD[p], dust: UP_DUST[p] };
}
const ASC_SHARD = [10, 24, 45, 80], ASC_DUST = [0, 2, 6, 14];
export function ascendCost(g: Gear | undefined): Cost | null {
  const r = rarityOf(g);
  if (r >= MAX_ASCEND) return null;
  return { shard: ASC_SHARD[r], dust: ASC_DUST[r] };
}
export function rerollCost(g: Gear | undefined): Cost {
  const r = rarityOf(g), n = Math.min(10, g?.rerolls ?? 0);
  return { shard: 4 + 3 * r + 2 * n, dust: r >= 3 ? r - 2 + Math.floor(n / 3) : 0 };
}
/** 洗煉第 index 條詞條：換成同類型（前綴 / 後綴）、不重複的另一條。傳奇詞條不能洗 → null */
export function rerollAffix(item: ItemId, g: Gear, index: number, rng: Rng): Gear | null {
  const slot = gearSlot(item), a = g.affixes[index];
  if (!slot || !a) return null;
  const d = affixDef(a.id);
  if (d.kind === 'unique') return null;
  const others = g.affixes.filter((_, i) => i !== index);
  const n = rollNormal(item, slot, others, g.rarity, g.ilvl, rng, d.kind, a.id);
  if (!n) return null;
  const out = cloneGear(g);
  out.affixes[index] = n;
  out.rerolls = (g.rerolls ?? 0) + 1;
  return out;
}
export function upgradeGear(g: Gear): Gear {
  const out = cloneGear(g);
  out.plus = Math.min(MAX_PLUS, g.plus + 1);
  return out;
}
/** 升階：稀有度 +1，補一條詞條（升到傳說時補傳奇詞條；沒有適用的傳奇詞條就補一般詞條） */
export function ascendGear(item: ItemId, g: Gear, rng: Rng): Gear | null {
  const slot = gearSlot(item);
  if (!slot || g.rarity >= MAX_ASCEND) return null;
  const out = cloneGear(g);
  out.rarity = g.rarity + 1;
  const R = RARITIES[out.rarity];
  let add: Affix | null = null;
  if (R.unique && !out.affixes.some((a) => affixDef(a.id).kind === 'unique')) add = rollUnique(item, slot, rng);
  if (!add) add = rollNormal(item, slot, out.affixes, out.rarity, out.ilvl, rng);
  if (add) out.affixes = sortAffixes([...out.affixes, add]);
  return out;
}

// ── 存檔驗證 ─────────────────────────────────────────────
/** 存檔裡的裝備資料：結構與範圍都對才回傳副本，否則 null */
export function validGear(item: ItemId, raw: unknown): Gear | null {
  const slot = gearSlot(item);
  if (!slot || !raw || typeof raw !== 'object') return null;
  const o = raw as Partial<Gear>;
  const int = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
  if (!int(o.rarity, 0, RARITY_COUNT - 1) || !int(o.ilvl, 1, 5) || !int(o.plus, 0, MAX_PLUS) || !Array.isArray(o.affixes) || o.affixes.length > 6) return null;
  if (o.locked !== undefined && typeof o.locked !== 'boolean') return null;
  if (o.rerolls !== undefined && !int(o.rerolls, 0, 1e6)) return null;
  const affixes: Affix[] = [];
  for (const a of o.affixes as unknown[]) {
    const x = a as Partial<Affix> | null;
    if (!x || typeof x !== 'object' || !isAffixId(x.id) || !int(x.tier, 1, 5) || typeof x.value !== 'number' || !Number.isFinite(x.value)) return null;
    if (!affixDef(x.id).slots.includes(slot)) return null;
    affixes.push({ id: x.id, tier: x.tier, value: x.value });
  }
  const g: Gear = { rarity: o.rarity, ilvl: o.ilvl, plus: o.plus, affixes };
  if (o.locked) g.locked = true;
  if (o.rerolls) g.rerolls = o.rerolls;
  if (o.crafted !== undefined && typeof o.crafted !== 'boolean') return null;
  if (o.crafted) g.crafted = true;
  return g;
}
