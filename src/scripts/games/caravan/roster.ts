import type { Rng } from './rng';
import type {
  CompanionRecord,
  ExpeditionPlan,
  ExpeditionRole,
  FormationRow,
  SaveData,
} from './save';
import { STARTING_PROFILE, STAT_ROLL_MIN, STAT_ROLL_MAX } from './save';
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

/** 全隊事件檢定加成：只加總本次出征者的特質與羈絆（M17）。 */
export function partyCheckBonus(save: SaveData, memberIds?: string[]): number {
  const included = new Set(memberIds ?? [save.protagonist.id, ...save.companions.map((c) => c.id)]);
  const traitSum = [save.protagonist, ...save.companions]
    .filter((member) => included.has(member.id))
    .reduce((sum, m) => sum + (traitById(m.trait)?.checkBonus ?? 0), 0);
  // M11 羈絆：旅伴 tier 總和（主角無羈絆欄）
  const bondSum = save.companions
    .filter((companion) => included.has(companion.id))
    .reduce((sum, c) => sum + bondTier(c.bond), 0);
  return traitSum + bondSum;
}

// ---------------------------------------------------------------------------
// M11 旅伴羈絆：同行完成遠征的趟數 → tier（檢定與生命加成）
// ---------------------------------------------------------------------------

/** 羈絆 tier：0-1 趟=0、2-4=1（同行）、5-8=2（信賴）、9+=3（莫逆） */
export function bondTier(bond: number | undefined): number {
  const b = bond ?? 0;
  if (b >= 9) return 3;
  if (b >= 5) return 2;
  if (b >= 2) return 1;
  return 0;
}

export const BOND_TIER_NAMES = ['', '同行', '信賴', '莫逆'] as const;
/** 每 tier 的 maxHp 加成（jobs.ts memberFromRecord 套用） */
export const BOND_HP_PER_TIER = 2;

// ---------------------------------------------------------------------------
// M17 真正的編隊：六人名冊、四人出征、前後排與互斥遠征職務
// ---------------------------------------------------------------------------

export const ROSTER_CAP = 6;
export const EXPEDITION_PARTY_CAP = 4;
export const RESERVE_WAGE_FACTOR = 0.25;

export interface ExpeditionRoleDef {
  id: ExpeditionRole;
  name: string;
  desc: string;
  /** 該職務擅長的事件檢定屬性。 */
  checkStat?: keyof StatBlock;
  /** 只有職務持有人執行對應檢定時才加入。 */
  checkBonus?: number;
  /** 只要職務有人擔任，整隊所有事件檢定都加入。 */
  teamCheckBonus?: number;
  /** 後備留營費倍率。 */
  reserveWageFactor?: number;
  /** 地下城休息房的額外回復。 */
  restBonus?: number;
}

export const EXPEDITION_ROLES: Record<ExpeditionRole, ExpeditionRoleDef> = {
  captain: {
    id: 'captain',
    name: '隊長',
    desc: '整隊檢定 +1；本人進行魅力檢定時再 +2。',
    checkStat: 'cha',
    checkBonus: 2,
    teamCheckBonus: 1,
  },
  scout: {
    id: 'scout',
    name: '斥候',
    desc: '本人進行敏捷檢定時 +2。',
    checkStat: 'dex',
    checkBonus: 2,
  },
  quartermaster: {
    id: 'quartermaster',
    name: '軍需官',
    desc: '本人進行智力檢定時 +2；後備成員留營費減半。',
    checkStat: 'int',
    checkBonus: 2,
    reserveWageFactor: 0.5,
  },
  medic: {
    id: 'medic',
    name: '醫護',
    desc: '本人進行體質檢定時 +2；休息房額外恢復 2 點生命。',
    checkStat: 'con',
    checkBonus: 2,
    restBonus: 2,
  },
};

export function memberRecordById(save: SaveData, memberId: string): CompanionRecord | undefined {
  return memberId === save.protagonist.id
    ? save.protagonist
    : save.companions.find((companion) => companion.id === memberId);
}

export function healthyRoster(save: SaveData): CompanionRecord[] {
  return [
    save.protagonist,
    ...save.companions.filter((companion) => companion.injuredForTrips === 0),
  ];
}

function defaultRow(record: CompanionRecord): FormationRow {
  return record.job === 'swordsman' ? 'front' : 'back';
}

function roleCandidateScore(record: CompanionRecord, role: ExpeditionRole): number {
  const stat = EXPEDITION_ROLES[role].checkStat;
  return stat ? effectiveStats(record)[stat] : record.level;
}

/**
 * 將舊檔、傷員、已解雇成員與重複職務整理成可出發的編隊。
 * 缺少 M17 計畫的舊 v6 存檔會沿用舊行為：主角＋前三名健康旅伴。
 */
export function normalizeExpeditionPlan(
  save: SaveData,
  candidate: ExpeditionPlan | undefined = save.expeditionPlan,
): ExpeditionPlan {
  const roster = healthyRoster(save);
  const validIds = new Set(roster.map((member) => member.id));
  const requested = candidate?.activeIds ?? roster.map((member) => member.id);
  const desiredSize = candidate
    ? Math.min(EXPEDITION_PARTY_CAP, Math.max(1, requested.length))
    : Math.min(EXPEDITION_PARTY_CAP, roster.length);
  const activeIds: string[] = [save.protagonist.id];
  for (const id of requested) {
    if (
      id !== save.protagonist.id &&
      validIds.has(id) &&
      !activeIds.includes(id) &&
      activeIds.length < EXPEDITION_PARTY_CAP
    ) {
      activeIds.push(id);
    }
  }
  // 既定出征者受傷或離隊時，以健康後備補足原先隊伍人數。
  for (const member of roster) {
    if (activeIds.length >= desiredSize) break;
    if (!activeIds.includes(member.id)) activeIds.push(member.id);
  }

  const positions: Record<string, FormationRow> = {};
  for (const id of activeIds) {
    const member = memberRecordById(save, id)!;
    const requestedRow = candidate?.positions?.[id];
    positions[id] = requestedRow === 'front' || requestedRow === 'back'
      ? requestedRow
      : defaultRow(member);
  }
  // 所有人都躲後排會讓敵人選擇規則失去意義；至少保留一名前排。
  if (!activeIds.some((id) => positions[id] === 'front')) positions[activeIds[0]] = 'front';

  const roles: Partial<Record<ExpeditionRole, string>> = {};
  const assigned = new Set<string>();
  for (const role of Object.keys(EXPEDITION_ROLES) as ExpeditionRole[]) {
    const holder = candidate?.roles?.[role];
    if (holder && activeIds.includes(holder) && !assigned.has(holder)) {
      roles[role] = holder;
      assigned.add(holder);
    }
  }
  // 每人最多一個職務；尚未分配的職務交給最適合的未任職成員。
  for (const role of Object.keys(EXPEDITION_ROLES) as ExpeditionRole[]) {
    if (roles[role]) continue;
    const holder = activeIds
      .filter((id) => !assigned.has(id))
      .map((id) => memberRecordById(save, id)!)
      .sort((a, b) => roleCandidateScore(b, role) - roleCandidateScore(a, role))[0];
    if (!holder) continue;
    roles[role] = holder.id;
    assigned.add(holder.id);
  }

  return { activeIds, positions, roles };
}

export function setExpeditionPlan(save: SaveData, plan: ExpeditionPlan): ExpeditionPlan {
  const normalized = normalizeExpeditionPlan(save, plan);
  save.expeditionPlan = normalized;
  return normalized;
}

export function expeditionMembers(save: SaveData, plan?: ExpeditionPlan): CompanionRecord[] {
  const normalized = normalizeExpeditionPlan(save, plan);
  return normalized.activeIds
    .map((id) => memberRecordById(save, id))
    .filter((member): member is CompanionRecord => member !== undefined);
}

export function memberRole(plan: ExpeditionPlan, memberId: string): ExpeditionRole | null {
  for (const role of Object.keys(EXPEDITION_ROLES) as ExpeditionRole[]) {
    if (plan.roles[role] === memberId) return role;
  }
  return null;
}

// ---------------------------------------------------------------------------
// M11 職業專精：Lv4 二選一進階（被動加成＋專屬招式）
// ---------------------------------------------------------------------------

export interface SpecializationDef {
  id: string;
  name: string;
  desc: string;
  /** 被動：屬性/防禦/生命上限加成 */
  statBonus?: Partial<StatBlock>;
  defense?: number;
  maxHp?: number;
  /** 專屬招式（入列於職業招式之後） */
  move: Move;
}

export const SPECIALIZATION_LEVEL = 4;

export const SPECIALIZATIONS: Record<CompanionRecord['job'], SpecializationDef[]> = {
  swordsman: [
    { id: 'berserker', name: '狂戰士', desc: '捨守取攻的戰場猛獸。力量 +2，習得「血怒斬」。',
      statBonus: { str: 2 },
      move: { id: 'blood-rage-slash', element: 'slash', name: '血怒斬', kind: 'attack', target: 'enemy', hitStat: 'str',
        damage: { dice: 2, sides: 10, bonusStat: 'str' },
        narration: '{actor}雙目赤紅，狂嘯著將全身之力灌入一斬，劈向{target}，造成 {amount} 點傷害！' } },
    { id: 'bulwark', name: '鐵壁衛', desc: '隊伍的不動壁壘。防禦 +2、生命上限 +6，習得「盾牆猛擊」。',
      defense: 2, maxHp: 6,
      move: { id: 'shield-bash', element: 'blunt', name: '盾牆猛擊', kind: 'attack', target: 'enemy', hitStat: 'str',
        damage: { dice: 1, sides: 8, bonusStat: 'con' },
        applyStatus: { kind: 'stun', duration: 1 },
        narration: '{actor}舉盾撞向{target}，造成 {amount} 點傷害並將其震得暈頭轉向！' } },
  ],
  ranger: [
    { id: 'hawkeye', name: '鷹眼', desc: '百步穿楊的神射手。敏捷 +2，習得「奪命狙擊」。',
      statBonus: { dex: 2 },
      move: { id: 'deadeye-shot', element: 'pierce', name: '奪命狙擊', kind: 'attack', target: 'enemy', hitStat: 'dex',
        damage: { dice: 2, sides: 8, bonusStat: 'dex' },
        narration: '{actor}屏息凝神，一箭破空而出，貫穿{target}，造成 {amount} 點傷害！' } },
    { id: 'trapper', name: '陷阱師', desc: '荒野的獵人智者。體質 +1、防禦 +1，習得「絆足陷阱」。',
      statBonus: { con: 1 }, defense: 1,
      move: { id: 'snare-trap', element: 'blunt', name: '絆足陷阱', kind: 'attack', target: 'enemy', hitStat: 'dex',
        damage: { dice: 1, sides: 6, bonusStat: 'dex' },
        applyStatus: { kind: 'stun', duration: 1 },
        narration: '{actor}拋出鐵絆索纏住{target}，造成 {amount} 點傷害並使其動彈不得！' } },
  ],
  mage: [
    { id: 'elementalist', name: '元素使', desc: '駕馭風暴的天災法師。智力 +2，習得「連鎖閃電」。',
      statBonus: { int: 2 },
      move: { id: 'chain-lightning', element: 'fire', name: '連鎖閃電', kind: 'attack', target: 'enemy', hitStat: 'int',
        damage: { dice: 2, sides: 10, bonusStat: 'int' },
        narration: '{actor}指尖迸出蛛網般的紫電，轟向{target}，造成 {amount} 點傷害！' } },
    { id: 'occultist', name: '秘術師', desc: '窺探禁忌的暗影學者。智力 +1、生命上限 +4，習得「腐蝕詛咒」。',
      statBonus: { int: 1 }, maxHp: 4,
      move: { id: 'corrosive-curse', element: 'frost', name: '腐蝕詛咒', kind: 'attack', target: 'enemy', hitStat: 'int',
        damage: { dice: 1, sides: 6, bonusStat: 'int' },
        applyStatus: { kind: 'poison', duration: 3, potency: 2 },
        narration: '{actor}低聲唸出禁咒，黑霧纏上{target}，造成 {amount} 點傷害並持續侵蝕！' } },
  ],
  cleric: [
    { id: 'hierophant', name: '大祭司', desc: '聖光的化身。魅力 +2，習得「神聖賜福」。',
      statBonus: { cha: 2 },
      move: { id: 'divine-blessing', name: '神聖賜福', kind: 'support', target: 'ally', hitStat: 'cha',
        heal: { dice: 3, sides: 6, bonusStat: 'cha' },
        narration: '{actor}張開雙臂引下天光，{target}沐浴其中，恢復 {amount} 點生命。' } },
    { id: 'inquisitor', name: '審判官', desc: '揮舞聖裁之錘的戰鬥祭司。力量 +1、防禦 +1，習得「聖裁之錘」。',
      statBonus: { str: 1 }, defense: 1,
      move: { id: 'judgement-hammer', element: 'holy', name: '聖裁之錘', kind: 'attack', target: 'enemy', hitStat: 'cha',
        damage: { dice: 2, sides: 8, bonusStat: 'cha' },
        narration: '{actor}高舉聖錘宣告裁決，重重砸向{target}，造成 {amount} 點傷害！' } },
  ],
};

// ---------------------------------------------------------------------------
// M14 冒險技能：五技能一一對應五屬性，rank 加成遠征檢定（expedition resolveOption）
// ---------------------------------------------------------------------------

export interface SkillDef { id: string; name: string; stat: keyof StatBlock; desc: string; }

export const SKILL_RANK_CAP = 5;

export const SKILLS: SkillDef[] = [
  { id: 'martial', name: '武藝', stat: 'str', desc: '刀劍拳腳的功底——力量檢定 +rank' },
  { id: 'scouting', name: '偵查', stat: 'dex', desc: '先一步察覺危險——敏捷檢定 +rank' },
  { id: 'lore', name: '博識', stat: 'int', desc: '商路見聞與古籍知識——智力檢定 +rank' },
  { id: 'negotiation', name: '交涉', stat: 'cha', desc: '討價還價與談判——魅力檢定 +rank' },
  { id: 'survival', name: '生存', stat: 'con', desc: '風餐露宿的本領——體質檢定 +rank' },
];

export function spendSkillPoint(record: CompanionRecord, skillId: string): void {
  const skill = SKILLS.find((sk) => sk.id === skillId);
  if (!skill) throw new Error(`未知技能「${skillId}」`);
  if ((record.skillPoints ?? 0) <= 0) throw new Error('沒有可用的技能點');
  const rank = record.skills?.[skillId] ?? 0;
  if (rank >= SKILL_RANK_CAP) throw new Error(`「${skill.name}」已達最高 rank ${SKILL_RANK_CAP}`);
  record.skills = { ...(record.skills ?? {}), [skillId]: rank + 1 };
  record.skillPoints = (record.skillPoints ?? 0) - 1;
}

/** 該屬性對應技能的 rank（遠征檢定加成） */
export function skillCheckBonus(record: CompanionRecord, stat: keyof StatBlock): number {
  const skill = SKILLS.find((sk) => sk.stat === stat);
  if (!skill) return 0;
  return record.skills?.[skill.id] ?? 0;
}

// ---------------------------------------------------------------------------
// M14 鐵匠強化：per-slot +N（跟人走），weapon=+N 傷害、armor=+N 防禦、trinket=+2N 生命
// ---------------------------------------------------------------------------

export const SMITH_PLUS_CAP = 3;

export function smithCost(currentPlus: number): { gold: number; ore: number } {
  return { gold: 40 * (currentPlus + 1), ore: currentPlus + 1 };
}

export function upgradeEquipment(save: SaveData, memberId: string, slot: EquipSlot): void {
  const record = memberId === save.protagonist.id
    ? save.protagonist
    : save.companions.find((c) => c.id === memberId);
  if (!record) throw new Error(`找不到成員「${memberId}」`);
  if (!record.equipment[slot]) throw new Error('該欄位沒有裝備，無法強化');
  const plus = record.equipmentPlus?.[slot] ?? 0;
  if (plus >= SMITH_PLUS_CAP) throw new Error(`已達強化上限 +${SMITH_PLUS_CAP}`);
  const cost = smithCost(plus);
  if (save.gold < cost.gold) throw new Error(`金幣不足（需 ${cost.gold}）`);
  if ((save.inventory['ore'] ?? 0) < cost.ore) throw new Error(`礦石不足（需 ${cost.ore}）`);
  save.gold -= cost.gold;
  save.inventory['ore'] -= cost.ore;
  record.equipmentPlus = { weapon: 0, armor: 0, trinket: 0, ...(record.equipmentPlus ?? {}), [slot]: plus + 1 };
}

/** M14 創角擲骰：每項屬性 = 職業基準 + [STAT_ROLL_MIN, STAT_ROLL_MAX] 均勻隨機 */
export function rollStats(rng: Rng, job: JobId): StatBlock {
  const profile = STARTING_PROFILE[job];
  const rolled = { ...profile.stats };
  const span = STAT_ROLL_MAX - STAT_ROLL_MIN + 1;
  for (const key of Object.keys(rolled) as Array<keyof StatBlock>) {
    rolled[key] = profile.stats[key] + STAT_ROLL_MIN + (rng.roll(span) - 1);
  }
  return rolled;
}

export function specById(id: string | null | undefined): SpecializationDef | null {
  if (!id) return null;
  for (const specs of Object.values(SPECIALIZATIONS)) {
    const found = specs.find((sp) => sp.id === id);
    if (found) return found;
  }
  return null;
}

/** Lv4 起可選、僅能選一次、僅限本職業的選項 */
export function chooseSpecialization(record: CompanionRecord, specId: string): void {
  if (record.level < SPECIALIZATION_LEVEL) {
    throw new Error(`專精需 Lv${SPECIALIZATION_LEVEL}（目前 Lv${record.level}）`);
  }
  if (record.specialization) throw new Error('已選定專精，不可更改');
  const spec = SPECIALIZATIONS[record.job].find((sp) => sp.id === specId);
  if (!spec) throw new Error(`職業「${record.job}」沒有專精「${specId}」`);
  record.specialization = specId;
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
  record.skillPoints = (record.skillPoints ?? 0) + 1; // M14 冒險技能
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
export function equipmentBonus(record: CompanionRecord): { stats: Partial<StatBlock>; defense: number; maxHp: number; damageBonus: number } {
  const stats: Partial<StatBlock> = {};
  let defense = 0;
  let maxHp = 0;
  let damageBonus = 0;
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
    // M14 鐵匠強化（slot 有裝備才生效）
    const plus = record.equipmentPlus?.[slot] ?? 0;
    if (plus > 0) {
      if (slot === 'weapon') damageBonus += plus;
      if (slot === 'armor') defense += plus;
      if (slot === 'trinket') maxHp += plus * 2;
    }
  }
  return { stats, defense, maxHp, damageBonus };
}

/** 裝備、人物特質與職業專精全部貫通到戰鬥及 M17 遠征檢定。 */
export function effectiveStats(record: CompanionRecord): StatBlock {
  const stats: StatBlock = { ...record.stats };
  const equipment = equipmentBonus(record);
  for (const key of Object.keys(equipment.stats) as Array<keyof StatBlock>) {
    stats[key] += equipment.stats[key] ?? 0;
  }
  const trait = traitById(record.trait);
  if (trait?.statBonus) {
    for (const key of Object.keys(trait.statBonus) as Array<keyof StatBlock>) {
      stats[key] += trait.statBonus[key] ?? 0;
    }
  }
  const specialization = specById(record.specialization);
  if (specialization?.statBonus) {
    for (const key of Object.keys(specialization.statBonus) as Array<keyof StatBlock>) {
      stats[key] += specialization.statBonus[key] ?? 0;
    }
  }
  return stats;
}
