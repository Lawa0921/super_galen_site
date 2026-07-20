import type { Rng } from './rng';
import type { CompanionRecord, SaveData } from './save';
import type { StatBlock } from './types';
import type { Move } from './combat';
import { statMod } from './check';
import { JOBS, type JobId } from './data/jobs';
import { ITEMS } from './data/items';

// -----------------------------------------------------------------------
// 旅伴特質（M7）：招募池人物隨機帶 1 種，影響檢定/薪餉/屬性——招誰變成決策
// -----------------------------------------------------------------------

export interface TraitDef {
  id: string; name: string; desc: string;
  /** 全隊事件檢定加成（老練旅伴的建議） */
  checkBonus?: number;
  /** 每趟薪餉增減 */
  wageDelta?: number;
  /** 雇用費增減（負值＝便宜） */
  hireDelta?: number;
  /** 戰鬥屬性加成（memberFromRecord 整合） */
  statBonus?: Partial<StatBlock>;
  maxHpBonus?: number;
}

export const TRAITS: TraitDef[] = [
  { id: 'seasoned', name: '老練', desc: '旅途檢定 +1（全隊）', checkBonus: 1 },
  { id: 'greedy', name: '貪財', desc: '雇用費 -10，但每趟薪餉 +3', wageDelta: 3, hireDelta: -10 },
  { id: 'frugal', name: '儉樸', desc: '每趟薪餉 -2', wageDelta: -2 },
  { id: 'brawny', name: '強壯', desc: '力量 +2', statBonus: { str: 2 } },
  { id: 'nimble', name: '靈巧', desc: '敏捷 +2', statBonus: { dex: 2 } },
  { id: 'learned', name: '博學', desc: '智力 +2', statBonus: { int: 2 } },
  { id: 'charming', name: '迷人', desc: '魅力 +2', statBonus: { cha: 2 } },
  { id: 'tough', name: '硬朗', desc: '生命上限 +4', maxHpBonus: 4 },
];

export const traitById = (id: string | null | undefined): TraitDef | undefined =>
  id ? TRAITS.find((t) => t.id === id) : undefined;

/** 全隊事件檢定加成：加總所有成員特質的 checkBonus（M7） */
export function partyCheckBonus(save: SaveData): number {
  return [save.protagonist, ...save.companions]
    .reduce((sum, m) => sum + (traitById(m.trait)?.checkBonus ?? 0), 0);
}

/** 升級累積 XP 門檻；index=level（1-based，index 0 廢棄）；Lv5 為封頂（M4） */
export const XP_TABLE: number[] = [0, 0, 50, 120, 210, 320];

const MAX_LEVEL = XP_TABLE.length - 1; // 5

/** 依累積 xp 推算「應處」等級（封頂 Lv5），不等於 record.level（要靠 applyLevelUp 領取） */
export function levelFromXp(xp: number): number {
  let level = 1;
  for (let lv = 2; lv <= MAX_LEVEL; lv++) {
    if (xp >= XP_TABLE[lv]) level = lv;
  }
  return level;
}

/** 尚未領取的升級次數：xp 對應等級 - 目前 level */
export function pendingLevelUps(record: CompanionRecord): number {
  return levelFromXp(record.xp) - record.level;
}

/** 領取一次升級：level+1、依 allocate 配 2 點屬性、maxHp 依配點後新體質成長 */
export function applyLevelUp(record: CompanionRecord, allocate: Partial<StatBlock>): void {
  if (record.level >= MAX_LEVEL) {
    throw new Error(`已達最高等級 Lv${MAX_LEVEL}，無法再升級`);
  }
  for (const value of Object.values(allocate)) {
    if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
      throw new Error('屬性點配置每項必須為非負整數');
    }
  }
  const total = Object.values(allocate).reduce((sum: number, v) => sum + (v ?? 0), 0);
  if (total !== 2) {
    throw new Error('屬性點配置總和必須恰為 2');
  }
  for (const stat of Object.keys(allocate) as Array<keyof StatBlock>) {
    const value = allocate[stat];
    if (value) record.stats[stat] += value;
  }
  record.level += 1;
  record.maxHp += 3 + statMod(record.stats.con);
}

/** 依 record.level 過濾 JOBS[record.job].moves；招式無 minLevel 視為 Lv1 起就會 */
export function unlockedMoves(record: CompanionRecord): Move[] {
  return JOBS[record.job].moves.filter((move) => (move.minLevel ?? 1) <= record.level);
}

/** 雇用花費：30 + level×20 + 特質增減（M7） */
export function hireCost(record: CompanionRecord): number {
  return 30 + record.level * 20 + (traitById(record.trait)?.hireDelta ?? 0);
}

/** 每趟薪餉：8 + level×4 + 特質增減（M3 經濟基準；M7 特質） */
export function wagePerTrip(record: CompanionRecord): number {
  return 8 + record.level * 4 + (traitById(record.trait)?.wageDelta ?? 0);
}

const JOB_IDS: JobId[] = ['swordsman', 'ranger', 'mage', 'cleric'];
const STAT_KEYS: Array<keyof StatBlock> = ['str', 'dex', 'int', 'cha', 'con'];

/** 酒館招募池候選名（≥12 個繁中名，單次生成不重複抽取） */
const RECRUIT_NAMES = [
  '沈昭', '顧言', '蘇挽', '江離', '柳霜', '裴玄',
  '陸沉舟', '顏昀', '韓煦', '秦鳶', '溫如晦', '白澈',
  '雲舒', '阮青',
];

/** 聲望達門檻時，酒館池首位精英傭兵的直升等級與加成（M4 唯一聲望效果） */
const REPUTATION_VETERAN_THRESHOLD = 30;
const VETERAN_LEVEL = 2;
const VETERAN_MAX_HP_BONUS = 4;

/** 產生酒館招募池：3-5 人，職業/姓名/屬性微調皆由 rng 決定；聲望達標時首位為 Lv2 精英 */
export function generateRecruitPool(rng: Rng, tavernSeed: number, reputation: number): CompanionRecord[] {
  const count = 2 + rng.roll(3); // 3-5 人
  const namePool = [...RECRUIT_NAMES];
  const pool: CompanionRecord[] = [];

  for (let i = 0; i < count; i++) {
    const job = rng.pick(JOB_IDS);
    const jobDef = JOBS[job];
    const nameIndex = rng.roll(namePool.length) - 1;
    const name = namePool.splice(nameIndex, 1)[0];
    const boosted = rng.pick(STAT_KEYS);
    const stats: StatBlock = { ...jobDef.baseStats, [boosted]: jobDef.baseStats[boosted] + 1 };

    const isVeteran = reputation >= REPUTATION_VETERAN_THRESHOLD && i === 0;
    pool.push({
      id: `recruit-${tavernSeed}-${i}`,
      name,
      job,
      level: isVeteran ? VETERAN_LEVEL : 1,
      xp: isVeteran ? XP_TABLE[VETERAN_LEVEL] : 0,
      stats,
      maxHp: jobDef.baseMaxHp + (isVeteran ? VETERAN_MAX_HP_BONUS : 0),
      injuredForTrips: 0,
      trait: rng.pick(TRAITS).id, // M7：每位旅伴一種特質
      equipment: { weapon: null, armor: null, trinket: null },
    });
  }

  return pool;
}

// -----------------------------------------------------------------------
// 裝備三欄系統（M5 Task 1）
// -----------------------------------------------------------------------

const EQUIP_SLOTS = ['weapon', 'armor', 'trinket'] as const;
type EquipSlot = (typeof EQUIP_SLOTS)[number];

/** 依 id 找出主角或傭兵的存檔記錄；找不到回 undefined */
function findMemberRecord(save: SaveData, memberId: string): CompanionRecord | undefined {
  if (save.protagonist.id === memberId) return save.protagonist;
  return save.companions.find((c) => c.id === memberId);
}

/**
 * 從 save.inventory 扣 1 件裝備到成員身上；舊裝備（若有）退回 inventory。
 * 不可裝時丟 Error：成員不存在／物品無 equip 欄／等級不足／庫存 0。
 */
export function equipItem(save: SaveData, memberId: string, itemId: string): void {
  const record = findMemberRecord(save, memberId);
  if (!record) {
    throw new Error(`equipItem: 找不到成員「${memberId}」`);
  }
  const item = ITEMS[itemId];
  if (!item?.equip) {
    throw new Error(`equipItem: 「${itemId}」不是可裝備物品`);
  }
  if (item.equip.minLevel !== undefined && record.level < item.equip.minLevel) {
    throw new Error(`equipItem: ${record.name} 等級不足，需 Lv${item.equip.minLevel} 才能裝備「${item.name}」`);
  }
  if ((save.inventory[itemId] ?? 0) <= 0) {
    throw new Error(`equipItem: 背包中沒有「${item.name}」`);
  }

  const slot = item.equip.slot;
  const previousId = record.equipment[slot];

  save.inventory[itemId] -= 1;
  if (save.inventory[itemId] <= 0) delete save.inventory[itemId];
  if (previousId) {
    save.inventory[previousId] = (save.inventory[previousId] ?? 0) + 1;
  }
  record.equipment[slot] = itemId;
}

/** 卸下成員某一裝備欄位，物品退回 inventory；該欄位本就空時為 no-op */
export function unequipItem(save: SaveData, memberId: string, slot: EquipSlot): void {
  const record = findMemberRecord(save, memberId);
  if (!record) {
    throw new Error(`unequipItem: 找不到成員「${memberId}」`);
  }
  const itemId = record.equipment[slot];
  if (!itemId) return;
  record.equipment[slot] = null;
  save.inventory[itemId] = (save.inventory[itemId] ?? 0) + 1;
}

/** 加總成員三個裝備欄位的效果：屬性加值/防禦/生命上限（memberFromRecord 整合用） */
export function equipmentBonus(record: CompanionRecord): { stats: Partial<StatBlock>; defense: number; maxHp: number } {
  const stats: Partial<StatBlock> = {};
  let defense = 0;
  let maxHp = 0;
  for (const slot of EQUIP_SLOTS) {
    const itemId = record.equipment[slot];
    if (!itemId) continue;
    const equip = ITEMS[itemId]?.equip;
    if (!equip) continue;
    if (equip.bonus) {
      for (const key of Object.keys(equip.bonus) as Array<keyof StatBlock>) {
        stats[key] = (stats[key] ?? 0) + (equip.bonus[key] ?? 0);
      }
    }
    if (equip.defense) defense += equip.defense;
    if (equip.maxHp) maxHp += equip.maxHp;
  }
  return { stats, defense, maxHp };
}
