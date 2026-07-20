import type { Move, PartyMember } from '../combat';
import type { CompanionRecord } from '../save';
import type { StatBlock } from '../types';
import { unlockedMoves, equipmentBonus, traitById } from '../roster';
import { ITEMS } from './items';

export type JobId = 'swordsman' | 'ranger' | 'mage' | 'cleric';

export interface JobDef {
  id: JobId;
  name: string;
  baseStats: StatBlock;
  baseMaxHp: number;
  defense: number;
  moves: Move[];
  /** 職業立繪路徑（M5 美術） */
  art?: string;
}

/** 通用「揮擊」：所有職業都會的基礎武器攻擊，備用招式 */
const universalStrike: Move = {
  id: 'strike', name: '揮擊', kind: 'attack', target: 'enemy', hitStat: 'str',
  damage: { dice: 1, sides: 6, bonusStat: 'str' },
  narration: '{actor}掄起手中武器揮向{target}，造成 {amount} 點傷害！',
};

export const JOBS: Record<JobId, JobDef> = {
  swordsman: {
    art: '/assets/games/caravan/job-swordsman.webp',
    id: 'swordsman', name: '劍士',
    baseStats: { str: 14, dex: 10, int: 8, cha: 10, con: 14 },
    baseMaxHp: 26, defense: 14,
    moves: [
      { id: 'heavy-slash', name: '重斬', kind: 'attack', target: 'enemy', hitStat: 'str',
        damage: { dice: 1, sides: 10, bonusStat: 'str' },
        narration: '{actor}掄起重劍朝{target}狠狠劈下，造成 {amount} 點傷害！' },
      { id: 'guard', name: '架盾', kind: 'guard', target: 'self', hitStat: 'str',
        narration: '{actor}舉盾穩守，蓄勢以待。' },
      { id: 'whirlwind-slash', name: '旋風斬', kind: 'attack', target: 'enemy', hitStat: 'str',
        damage: { dice: 1, sides: 12, bonusStat: 'str' },
        narration: '{actor}轉身畫出一道凌厲弧光，橫掃{target}，造成 {amount} 點傷害！',
        minLevel: 2 },
      { id: 'breaking-combo', name: '破陣連擊', kind: 'attack', target: 'enemy', hitStat: 'str',
        damage: { dice: 2, sides: 8, bonusStat: 'str' },
        narration: '{actor}連環劈斬撕開{target}的守勢，造成 {amount} 點傷害！',
        minLevel: 3 },
      universalStrike,
    ],
  },
  ranger: {
    art: '/assets/games/caravan/job-ranger.webp',
    id: 'ranger', name: '游俠',
    baseStats: { str: 10, dex: 16, int: 10, cha: 10, con: 10 },
    baseMaxHp: 20, defense: 13,
    moves: [
      { id: 'quick-shot', name: '疾射', kind: 'attack', target: 'enemy', hitStat: 'dex',
        damage: { dice: 1, sides: 8, bonusStat: 'dex' },
        narration: '{actor}拉弓疾射，箭矢直取{target}，造成 {amount} 點傷害！' },
      { id: 'aimed-shot', name: '瞄準射擊', kind: 'attack', target: 'enemy', hitStat: 'dex',
        damage: { dice: 1, sides: 6, bonusStat: 'dex' },
        narration: '{actor}屏息瞄準，一箭正中{target}要害，造成 {amount} 點傷害！' },
      { id: 'piercing-arrow', name: '穿甲箭', kind: 'attack', target: 'enemy', hitStat: 'dex',
        damage: { dice: 1, sides: 10, bonusStat: 'dex' },
        narration: '{actor}換上破甲箭矢，一擊貫穿{target}的護具，造成 {amount} 點傷害！',
        minLevel: 2 },
      { id: 'arrow-storm', name: '驟雨連射', kind: 'attack', target: 'enemy', hitStat: 'dex',
        damage: { dice: 2, sides: 6, bonusStat: 'dex' },
        narration: '{actor}連珠箭雨如驟雨般落向{target}，造成 {amount} 點傷害！',
        minLevel: 3 },
      universalStrike,
    ],
  },
  mage: {
    art: '/assets/games/caravan/job-mage.webp',
    id: 'mage', name: '法師',
    baseStats: { str: 8, dex: 10, int: 16, cha: 10, con: 8 },
    baseMaxHp: 16, defense: 11,
    moves: [
      { id: 'fireball', name: '火球', kind: 'attack', target: 'enemy', hitStat: 'int',
        damage: { dice: 2, sides: 6, bonusStat: 'int' },
        narration: '{actor}擲出灼熱火球，在{target}身邊炸裂，造成 {amount} 點傷害！' },
      { id: 'ice-spike', name: '冰刺', kind: 'attack', target: 'enemy', hitStat: 'int',
        damage: { dice: 1, sides: 8, bonusStat: 'int' },
        narration: '{actor}召喚寒冰尖刺貫穿{target}，造成 {amount} 點傷害！' },
      { id: 'gravity-crush', name: '重力壓', kind: 'attack', target: 'enemy', hitStat: 'int',
        damage: { dice: 2, sides: 8, bonusStat: 'int' },
        narration: '{actor}扭曲空間化作無形巨力，重重壓向{target}，造成 {amount} 點傷害！',
        minLevel: 2 },
      { id: 'meteor-fall', name: '隕石墜', kind: 'attack', target: 'enemy', hitStat: 'int',
        damage: { dice: 3, sides: 6, bonusStat: 'int' },
        narration: '{actor}召喚熾焰隕石轟然墜落，砸向{target}，造成 {amount} 點傷害！',
        minLevel: 3 },
      universalStrike,
    ],
  },
  cleric: {
    art: '/assets/games/caravan/job-cleric.webp',
    id: 'cleric', name: '教士',
    baseStats: { str: 10, dex: 8, int: 12, cha: 16, con: 12 },
    baseMaxHp: 22, defense: 12,
    moves: [
      { id: 'holy-strike', name: '聖擊', kind: 'attack', target: 'enemy', hitStat: 'cha',
        damage: { dice: 1, sides: 6, bonusStat: 'cha' },
        narration: '{actor}以聖杖之光擊向{target}，造成 {amount} 點傷害！' },
      { id: 'heal', name: '治癒', kind: 'support', target: 'ally', hitStat: 'cha',
        heal: { dice: 1, sides: 8, bonusStat: 'cha' },
        narration: '{actor}的祝禱化為柔光，為{target}恢復 {amount} 點生命。' },
      { id: 'holy-nova', name: '聖光爆', kind: 'attack', target: 'enemy', hitStat: 'cha',
        damage: { dice: 1, sides: 10, bonusStat: 'cha' },
        narration: '{actor}引動聖光轟然爆裂，擊向{target}，造成 {amount} 點傷害！',
        minLevel: 2 },
      { id: 'greater-heal', name: '聖光治癒術', kind: 'support', target: 'ally', hitStat: 'cha',
        heal: { dice: 2, sides: 6, bonusStat: 'cha' },
        narration: '{actor}引來聖潔光輝籠罩{target}，恢復 {amount} 點生命。',
        minLevel: 3 },
      universalStrike,
    ],
  },
};

/**
 * 用 JOBS[record.job] 的 moves/defense，配上 record 自己的 stats/maxHp（含成長），
 * 再疊上裝備三欄的效果（M5）：stats/defense/maxHp 加成；weapon 若帶 move 則取代
 * moves[0]（武器招約定——JOBS 每職業 moves[0] 恆為 kind==='attack'，見 jobs.test.ts 資料鎖定）。
 */
export function memberFromRecord(record: CompanionRecord): PartyMember {
  const job = JOBS[record.job];
  const bonus = equipmentBonus(record);

  const stats: StatBlock = { ...record.stats };
  for (const key of Object.keys(bonus.stats) as Array<keyof StatBlock>) {
    stats[key] += bonus.stats[key] ?? 0;
  }
  // M7 特質加成
  const trait = traitById(record.trait);
  if (trait?.statBonus) {
    for (const key of Object.keys(trait.statBonus) as Array<keyof StatBlock>) {
      stats[key] += trait.statBonus[key] ?? 0;
    }
  }
  const maxHp = record.maxHp + bonus.maxHp + (trait?.maxHpBonus ?? 0);

  const moves = unlockedMoves(record);
  const weaponId = record.equipment.weapon;
  const weaponMove = weaponId ? ITEMS[weaponId]?.equip?.move : undefined;
  const finalMoves = weaponMove ? [weaponMove, ...moves.slice(1)] : moves;

  return {
    id: record.id,
    name: record.name,
    stats,
    maxHp,
    hp: maxHp,
    defense: job.defense + bonus.defense,
    moves: finalMoves,
    isProtagonist: record.id === 'protagonist',
  };
}
