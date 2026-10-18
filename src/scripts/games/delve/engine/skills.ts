// skills.ts — 技能樹（純資料 + 純函式，不碰 DOM / 遊戲狀態）。
//   · 三條分支：劍心（戰鬥）/ 行者（探索）/ 匠魂（工匠），每條 8–9 個節點（被動 / 主動 / 核心）。
//   · 每個節點可以點好幾級（max），每級花 cost 點技能點；要先點過前置節點（req 各至少 1 級），也有等級門檻（level）。
//   · 和裝備共用的數值（傷害 / 暴擊 / 生命 / 防禦 / 攻速 / 回復 / 移速 / 跳躍 / 照明 / 幸運）交給 gear.ts 的加總，
//     與詞條一起套 STAT_CAPS（skills + gear 共用同一個上限，不會疊爆）；其餘是技能專屬數值，各有自己的上限 SKILL_CAPS。
import type { GearTotals, StatKey } from './gear';

export type Branch = 'blade' | 'path' | 'craft';
export interface BranchDef { id: Branch; zh: string; desc: string; }
export const BRANCHES: readonly BranchDef[] = [
  { id: 'blade', zh: '劍心', desc: '近身搏鬥、硬撐與反擊' },
  { id: 'path', zh: '行者', desc: '移動、感知與遠行' },
  { id: 'craft', zh: '匠魂', desc: '採掘、合成與鍛造' },
];

/** 技能數值：前十個和裝備詞條共用（套 STAT_CAPS），其餘是技能專屬（套 SKILL_CAPS） */
export type SharedStat = 'dmg' | 'crit' | 'hp' | 'def' | 'atkspd' | 'regen' | 'move' | 'jump' | 'light' | 'luck';
export type SkillOnlyStat = 'reach' | 'breath' | 'fallSafe' | 'fallRed' | 'fishPower' | 'refund' | 'salvage' | 'forge' | 'mineSpd' | 'vein' | 'xp'
  | 'airJump' | 'fury' | 'masterwork';
export type SkillStat = SharedStat | SkillOnlyStat;
export const GEAR_SHARED: readonly (SharedStat & StatKey)[] = ['dmg', 'crit', 'hp', 'def', 'atkspd', 'regen', 'move', 'jump', 'light', 'luck'];
export const SKILL_ONLY: readonly SkillOnlyStat[] = [
  'reach', 'breath', 'fallSafe', 'fallRed', 'fishPower', 'refund', 'salvage', 'forge', 'mineSpd', 'vein', 'xp', 'airJump', 'fury', 'masterwork',
];
/** 技能專屬數值的上限（全部點滿也到不了更高；%、格或次數） */
export const SKILL_CAPS: Record<SkillOnlyStat, number> = {
  reach: 2, breath: 60, fallSafe: 12, fallRed: 30, fishPower: 12, refund: 18, salvage: 40, forge: 20, mineSpd: 40,
  vein: 12, xp: 10, airJump: 1, fury: 25, masterwork: 25,
};

export type SkillId =
  | 'b_vigor' | 'b_edge' | 'b_guard' | 'b_eye' | 'b_tempo' | 'b_mend' | 'b_dash' | 'b_slam' | 'b_fury'
  | 'p_stride' | 'p_lamp' | 'p_reach' | 'p_feather' | 'p_spring' | 'p_gills' | 'p_angler' | 'p_sense' | 'p_cloud'
  | 'c_hands' | 'c_thrift' | 'c_salvage' | 'c_vein' | 'c_haggle' | 'c_fortune' | 'c_scholar' | 'c_master';
/** 主動技能（綁按鍵） */
export type ActiveSkill = 'dash' | 'slam' | 'pulse';
export const ACTIVE_OF: Partial<Record<SkillId, ActiveSkill>> = { b_dash: 'dash', b_slam: 'slam', p_sense: 'pulse' };
export const ACTIVE_NODE: Record<ActiveSkill, SkillId> = { dash: 'b_dash', slam: 'b_slam', pulse: 'p_sense' };

export interface SkillDef {
  id: SkillId;
  branch: Branch;
  zh: string;
  kind: 'passive' | 'active' | 'keystone';
  max: number;
  /** 每級花幾點 */
  cost: number;
  /** 前置節點（各至少 1 級） */
  req: readonly SkillId[];
  /** 等級門檻 */
  level: number;
  /** 樹狀圖格位（每條分支 3 欄 × 5 列） */
  col: number; row: number;
  /** 每級的數值 */
  per: Partial<Record<SkillStat, number>>;
  /** 說明（{v} = 目前級數的總值；主動 / 核心是固定說明） */
  desc: string;
}

const N = (id: SkillId, branch: Branch, zh: string, kind: SkillDef['kind'], col: number, row: number, max: number, cost: number,
  req: SkillId[], level: number, per: SkillDef['per'], desc: string): SkillDef => ({ id, branch, zh, kind, col, row, max, cost, req, level, per, desc });

export const SKILLS: readonly SkillDef[] = [
  // ── 劍心 ──
  N('b_vigor', 'blade', '鍛體', 'passive', 1, 0, 5, 1, [], 1, { hp: 6 }, '生命上限 +{v}'),
  N('b_edge', 'blade', '銳鋒', 'passive', 0, 1, 5, 1, ['b_vigor'], 2, { dmg: 4 }, '傷害 +{v}%'),
  N('b_guard', 'blade', '鐵壁', 'passive', 2, 1, 3, 1, ['b_vigor'], 2, { def: 1 }, '防禦 +{v}'),
  N('b_dash', 'blade', '突進', 'active', 1, 1, 1, 2, ['b_vigor'], 3, {}, '主動（Q）：朝前方疾衝約 5 格，途中無敵（冷卻 2.5 秒）'),
  N('b_eye', 'blade', '心眼', 'passive', 0, 2, 3, 1, ['b_edge'], 5, { crit: 2 }, '暴擊率 +{v}%'),
  N('b_tempo', 'blade', '疾刃', 'passive', 1, 2, 2, 1, ['b_edge'], 6, { atkspd: 5 }, '攻擊速度 +{v}%'),
  N('b_mend', 'blade', '回春', 'passive', 2, 2, 2, 1, ['b_guard'], 6, { regen: 0.3 }, '生命回復 +{v}/秒'),
  N('b_slam', 'blade', '震地', 'active', 2, 3, 1, 2, ['b_dash', 'b_guard'], 8, {}, '主動（F）：在地面震出衝擊波；空中使用會先急墜再落地重擊（威力更大、不受摔落傷害；冷卻 6 秒）'),
  N('b_fury', 'blade', '背水', 'keystone', 0, 4, 1, 3, ['b_eye'], 15, { fury: 25 }, '核心：生命低於 35% 時傷害 +25%'),
  // ── 行者 ──
  N('p_stride', 'path', '輕足', 'passive', 1, 0, 4, 1, [], 1, { move: 4 }, '移動速度 +{v}%'),
  N('p_lamp', 'path', '燈心', 'passive', 0, 1, 2, 1, ['p_stride'], 2, { light: 20 }, '身邊照明 +{v}%'),
  N('p_reach', 'path', '長臂', 'passive', 1, 1, 2, 1, ['p_stride'], 4, { reach: 1 }, '伸手距離 +{v} 格'),
  N('p_feather', 'path', '落羽', 'passive', 2, 1, 2, 1, ['p_stride'], 3, { fallSafe: 6, fallRed: 15 }, '安全落差 +{v} 格、摔落傷害 −{v2}%'),
  N('p_sense', 'path', '尋礦感知', 'active', 0, 2, 1, 2, ['p_lamp'], 5, {}, '主動（R）：感知周圍 28 格內的礦脈，8 秒內穿過岩壁標出位置（冷卻 20 秒）'),
  N('p_gills', 'path', '水性', 'passive', 1, 2, 2, 1, ['p_lamp'], 6, { breath: 30 }, '水下憋氣時間 +{v}%'),
  N('p_spring', 'path', '彈躍', 'passive', 2, 2, 2, 1, ['p_feather'], 6, { jump: 8 }, '跳躍高度 +{v}%'),
  N('p_angler', 'path', '釣運', 'passive', 1, 3, 2, 1, ['p_gills'], 8, { fishPower: 6 }, '釣力 +{v}（更快上鉤、判定窗更寬）'),
  N('p_cloud', 'path', '雲步', 'keystone', 2, 4, 1, 3, ['p_spring'], 12, { airJump: 1 }, '核心：可以在空中再跳一次；與凌雲詞條疊加成三段跳'),
  // ── 匠魂 ──
  N('c_hands', 'craft', '巧手', 'passive', 1, 0, 5, 1, [], 1, { mineSpd: 8 }, '挖掘速度 +{v}%'),
  N('c_thrift', 'craft', '惜料', 'passive', 0, 1, 3, 1, ['c_hands'], 3, { refund: 6 }, '合成時 {v}% 機率退回一份主要材料'),
  N('c_vein', 'craft', '礦脈直覺', 'passive', 1, 1, 2, 1, ['c_hands'], 4, { vein: 6 }, '挖礦時 {v}% 機率礦石加倍'),
  N('c_salvage', 'craft', '拆解', 'passive', 2, 1, 2, 1, ['c_hands'], 3, { salvage: 20 }, '分解得到的碎晶 / 星塵 +{v}%'),
  N('c_fortune', 'craft', '慧眼', 'passive', 0, 2, 4, 1, ['c_thrift'], 6, { luck: 5 }, '幸運 +{v}%'),
  N('c_haggle', 'craft', '議價', 'passive', 2, 2, 2, 1, ['c_salvage'], 6, { forge: 10 }, '鍛造（洗煉 / 強化 / 升階）材料 −{v}%'),
  N('c_scholar', 'craft', '博學', 'passive', 0, 3, 2, 1, ['c_fortune'], 10, { xp: 5 }, '獲得經驗 +{v}%'),
  N('c_master', 'craft', '精工', 'keystone', 2, 4, 1, 3, ['c_haggle'], 15, { masterwork: 25 }, '核心：合成裝備 25% 機率稀有度再升一階（最高到稀有）'),
];
const SKILL_MAP = new Map<string, SkillDef>(SKILLS.map((s) => [s.id, s]));
export const SKILL_IDS: readonly SkillId[] = SKILLS.map((s) => s.id);
export function skillDef(id: SkillId): SkillDef {
  const d = SKILL_MAP.get(id);
  if (!d) throw new Error(`unknown skill ${id}`);
  return d;
}
export function isSkillId(v: unknown): v is SkillId { return typeof v === 'string' && SKILL_MAP.has(v); }
/** 整棵樹全點滿要花幾點 */
export const TREE_COST = SKILLS.reduce((a, s) => a + s.max * s.cost, 0);

export type Ranks = Partial<Record<SkillId, number>>;
export function rankOf(r: Ranks, id: SkillId): number { return r[id] ?? 0; }
export function spentPoints(r: Ranks): number {
  let s = 0;
  for (const d of SKILLS) s += rankOf(r, d.id) * d.cost;
  return s;
}

export type LearnFail = 'max' | 'points' | 'level' | 'req';
/** 能不能再點一級；null = 可以 */
export function learnCheck(r: Ranks, id: SkillId, level: number, points: number): LearnFail | null {
  const d = skillDef(id);
  if (rankOf(r, id) >= d.max) return 'max';
  if (level < d.level) return 'level';
  if (d.req.some((q) => rankOf(r, q) < 1)) return 'req';
  if (points < d.cost) return 'points';
  return null;
}
/** 節點狀態（樹狀圖用）：learned 點滿 / partial 點了一部分 / open 前置與等級都到了（點數夠就能點）/ locked 前置或等級不夠 */
export function nodeState(r: Ranks, id: SkillId, level: number): 'learned' | 'partial' | 'open' | 'locked' {
  const d = skillDef(id), k = rankOf(r, id);
  if (k >= d.max) return 'learned';
  if (k > 0) return 'partial';
  const f = learnCheck(r, id, level, Infinity);
  return f === null ? 'open' : 'locked';
}

export type SkillTotals = Record<SkillStat, number>;
export function emptySkillTotals(): SkillTotals {
  const t = {} as SkillTotals;
  for (const k of [...GEAR_SHARED, ...SKILL_ONLY]) t[k] = 0;
  return t;
}
/** 點數 → 數值（技能專屬套 SKILL_CAPS；和裝備共用的不在這裡封頂，交給 gear.ts 與詞條一起封頂） */
export function skillTotals(r: Ranks): SkillTotals {
  const t = emptySkillTotals();
  for (const d of SKILLS) {
    const k = Math.min(d.max, Math.max(0, Math.floor(rankOf(r, d.id))));
    if (!k) continue;
    for (const [s, v] of Object.entries(d.per) as [SkillStat, number][]) t[s] += v * k;
  }
  for (const s of SKILL_ONLY) t[s] = Math.min(SKILL_CAPS[s], t[s]);
  for (const s of GEAR_SHARED) t[s] = Math.round(t[s] * 100) / 100;
  return t;
}
/** 和裝備共用的那部分（加進詞條的原始加總，再一起套 STAT_CAPS） */
export function gearBonus(t: SkillTotals): Partial<GearTotals> {
  const o: Partial<GearTotals> = {};
  for (const s of GEAR_SHARED) if (t[s]) o[s] = t[s];
  return o;
}
/** 說明文字（目前級數；k = 0 時顯示第 1 級的數值） */
export function skillText(id: SkillId, k: number): string {
  const d = skillDef(id), n = Math.max(1, k);
  const vals = Object.values(d.per) as number[];
  const fmt = (v: number): string => String(Math.round(v * n * 10) / 10);
  return d.desc.replace('{v2}', vals[1] !== undefined ? fmt(vals[1]) : '').replace('{v}', vals[0] !== undefined ? fmt(vals[0]) : '');
}

// ── 主動技能參數 ─────────────────────────────────────────
/** 冷卻（秒） */
export const SKILL_CD: Record<ActiveSkill, number> = { dash: 2.5, slam: 6, pulse: 20 };
/** 突進：速度（px/s）、持續秒數、無敵秒數 */
export const DASH_SPEED = 560;
export const DASH_TIME = 0.16;
export const DASH_IFRAMES = 0.28;
/** 震地：衝擊波半徑（格）、傷害 = 基礎 + 每級、擊退、空中急墜速度（px/s）、急墜加成上限 */
export const SLAM_RADIUS = 4.5;
export const SLAM_BASE = 16;
export const SLAM_PER_LEVEL = 1.5;
export const SLAM_KB = 300;
export const SLAM_DIVE = 760;
export const SLAM_DIVE_BONUS = 0.6;
/** 尋礦感知：半徑（格）、標記持續秒數、最多標幾格 */
export const PULSE_RADIUS = 28;
export const PULSE_TIME = 8;
export const PULSE_MAX = 240;
/** 背水：生命低於這個比例時生效 */
export const FURY_BELOW = 0.35;
