import type { CombatState, EnemyUnit, Move, PartyMember } from '../combat';
import type { CompanionRecord, SaveData } from '../save';
import { armorProtectionForDiscipline } from './armorProfiles.m48';
import { memberFromRecord } from './jobs';

export type ReliquaryBattleStage = 1 | 2 | 3;

export const RELIQUARY_BATTLE_NAMES: Record<ReliquaryBattleStage, string> = {
  1: '灰燼騎士守橋戰',
  2: '無舌唱詩班鎮魂戰',
  3: '龍燼化身決戰',
};

const STAGE_ROUTES: Record<ReliquaryBattleStage, string[]> = {
  1: ['read-runes', 'shield-march', 'hidden-path'],
  2: ['consecrate-choir', 'decode-lament', 'parley-echoes'],
  3: ['seal-reliquary', 'claim-ember', 'shatter-vessel'],
};

function battleFlag(stage: ReliquaryBattleStage): string {
  return `ashen-reliquary:battle:${stage}`;
}

function completedRoutes(save: SaveData, stage: ReliquaryBattleStage): string[] {
  const prefix = `ashen-reliquary:stage:${stage}:`;
  return Object.keys(save.flags)
    .filter((key) => key.startsWith(prefix) && save.flags[key] === true)
    .map((key) => key.slice(prefix.length))
    .filter((id) => STAGE_ROUTES[stage].includes(id));
}

/** 已完成的 M39 幕次視為戰鬥已通過，避免舊存檔被迫倒退重打。 */
export function reliquaryBattleCleared(save: SaveData, stage: ReliquaryBattleStage): boolean {
  return save.flags[battleFlag(stage)] === true || completedRoutes(save, stage).length === 1;
}

export interface ReliquaryBattleAccess {
  stage: ReliquaryBattleStage;
  allowed: boolean;
  completed: boolean;
  reason: string;
}

export function reliquaryBattleAccess(save: SaveData, stage: ReliquaryBattleStage): ReliquaryBattleAccess {
  const stageOne = completedRoutes(save, 1);
  const stageTwo = completedRoutes(save, 2);
  const stageThree = completedRoutes(save, 3);
  const corrupted = stageOne.length > 1 || stageTwo.length > 1 || stageThree.length > 1;
  if (corrupted) return { stage, allowed: false, completed: false, reason: '灰燼聖匣存在互相衝突的幕次收據。' };
  if (save.flags['world-quest:ashen-reliquary:completed'] === true) {
    return { stage, allowed: false, completed: true, reason: '灰燼聖匣的命運已經決定。' };
  }
  const completed = reliquaryBattleCleared(save, stage);
  if (completed) return { stage, allowed: false, completed: true, reason: `${RELIQUARY_BATTLE_NAMES[stage]}已經獲勝。` };
  const current: ReliquaryBattleStage = stageOne.length === 0 ? 1 : stageTwo.length === 0 ? 2 : 3;
  if (stage !== current) {
    return { stage, allowed: false, completed: false, reason: `目前只能進行第 ${current} 幕的戰鬥。` };
  }
  return { stage, allowed: true, completed: false, reason: `${RELIQUARY_BATTLE_NAMES[stage]}已可進入。` };
}

function defaultRow(record: CompanionRecord): 'front' | 'back' {
  return record.job === 'swordsman' || record.job === 'cleric' ? 'front' : 'back';
}

/** 使用目前出征編成；失效或受傷名單由健康旅伴依序補足，永遠保留主角。 */
export function buildReliquaryParty(save: SaveData): PartyMember[] {
  const healthy = save.companions.filter((member) => member.injuredForTrips <= 0);
  const byId = new Map(healthy.map((member) => [member.id, member]));
  const planned = (save.expeditionPlan?.activeIds ?? [])
    .filter((id) => id !== 'protagonist')
    .map((id) => byId.get(id))
    .filter((member): member is CompanionRecord => !!member);
  const selected = new Map<string, CompanionRecord>();
  for (const member of [...planned, ...healthy]) {
    if (selected.size >= 3) break;
    selected.set(member.id, member);
  }
  const records = [save.protagonist, ...selected.values()];
  return records.map((record) => {
    const member = memberFromRecord(record);
    member.formationRow = save.expeditionPlan?.positions[record.id] ?? defaultRow(record);
    return member;
  });
}

const ashCleave: Move = {
  id: 'reliquary-ash-cleave', name: '灰燼長劍', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'fire',
  damage: { dice: 1, sides: 8, bonusStat: 'str' },
  narration: '{actor}的焦黑長劍拖出龍火殘影，斬向{target}，造成 {amount} 點傷害！',
};
const ashWard: Move = {
  id: 'reliquary-ash-ward', name: '骨灰盾陣', kind: 'guard', target: 'self', hitStat: 'con',
  narration: '{actor}將刻滿禱文的盾牌插入石橋，骨灰凝成守勢。',
};
const cinderSpear: Move = {
  id: 'reliquary-cinder-spear', name: '燼矛投擲', kind: 'attack', target: 'enemy', hitStat: 'dex', element: 'pierce',
  damage: { dice: 1, sides: 6, bonusStat: 'dex' },
  narration: '{actor}投出仍在燃燒的斷矛，刺中{target}，造成 {amount} 點傷害！',
};

function ashKnight(): EnemyUnit {
  return {
    id: 'reliquary-ash-knight', name: '灰燼騎士・守橋者',
    stats: { str: 16, dex: 10, int: 10, cha: 8, con: 16 }, maxHp: 28, hp: 28, defense: 15,
    weaknesses: ['holy', 'blunt'], resists: ['fire', 'slash'], maxPoise: 4,
    armorProtection: armorProtectionForDiscipline('mail'),
    moves: [ashCleave, ashWard], intents: [
      { weight: 3, moveId: ashCleave.id }, { weight: 1, moveId: ashWard.id },
    ],
    enrage: { threshold: 0.45, potency: 2 },
  };
}
function cinderSquire(): EnemyUnit {
  return {
    id: 'reliquary-cinder-squire', name: '燼甲侍從',
    stats: { str: 11, dex: 15, int: 8, cha: 7, con: 11 }, maxHp: 14, hp: 14, defense: 12,
    weaknesses: ['frost', 'blunt'], resists: ['fire'], maxPoise: 2,
    armorProtection: armorProtectionForDiscipline('light'),
    moves: [cinderSpear], intents: [{ weight: 1, moveId: cinderSpear.id }],
  };
}

const silentChorus: Move = {
  id: 'reliquary-silent-chorus', name: '無聲聖歌', kind: 'attack', target: 'enemy', hitStat: 'cha', element: 'holy', area: true,
  damage: { dice: 1, sides: 5, bonusStat: 'cha' },
  narration: '{actor}張開被縫死的嘴，無聲震波掃過{target}，造成 {amount} 點傷害！',
};
const lamentTouch: Move = {
  id: 'reliquary-lament-touch', name: '哀歌觸碰', kind: 'attack', target: 'enemy', hitStat: 'int', element: 'frost',
  damage: { dice: 1, sides: 7, bonusStat: 'int' },
  applyStatus: { kind: 'stun', duration: 1 },
  narration: '{actor}將冰冷記憶按入{target}胸口，造成 {amount} 點傷害並奪走聲音！',
};
const choirClaw: Move = {
  id: 'reliquary-choir-claw', name: '亡魂撕扯', kind: 'attack', target: 'enemy', hitStat: 'dex', element: 'frost',
  damage: { dice: 1, sides: 5, bonusStat: 'dex' },
  narration: '{actor}從石壁中探出蒼白手臂撕扯{target}，造成 {amount} 點傷害！',
};

function tonguelessCantor(): EnemyUnit {
  return {
    id: 'reliquary-tongueless-cantor', name: '無舌領唱者',
    stats: { str: 8, dex: 11, int: 16, cha: 17, con: 14 }, maxHp: 34, hp: 34, defense: 14,
    weaknesses: ['holy', 'fire'], resists: ['frost', 'pierce'], maxPoise: 4,
    moves: [silentChorus, lamentTouch], intents: [
      { weight: 2, moveId: silentChorus.id }, { weight: 2, moveId: lamentTouch.id },
    ],
    enrage: { threshold: 0.5, potency: 2 },
  };
}
function choirWraith(index: number): EnemyUnit {
  return {
    id: `reliquary-choir-wraith-${index}`, name: '縫口唱詩亡魂',
    stats: { str: 7, dex: 13, int: 12, cha: 12, con: 9 }, maxHp: 11, hp: 11, defense: 12,
    weaknesses: ['holy', 'fire'], resists: ['slash', 'pierce'], maxPoise: 2,
    moves: [choirClaw], intents: [{ weight: 1, moveId: choirClaw.id }],
  };
}

const emberClaw: Move = {
  id: 'reliquary-ember-claw', name: '龍燼巨爪', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'fire',
  damage: { dice: 2, sides: 6, bonusStat: 'str' },
  narration: '{actor}以凝固龍火化成巨爪撕向{target}，造成 {amount} 點傷害！',
};
const emberBreath: Move = {
  id: 'reliquary-ember-breath', name: '心火吐息', kind: 'attack', target: 'enemy', hitStat: 'cha', element: 'fire', area: true,
  damage: { dice: 1, sides: 8, bonusStat: 'cha' },
  narration: '{actor}吐出古龍心火，烈焰吞沒{target}，造成 {amount} 點傷害！',
};
const emberShell: Move = {
  id: 'reliquary-ember-shell', name: '龍骨火殼', kind: 'guard', target: 'self', hitStat: 'con',
  narration: '{actor}收攏龍骨碎片，熔成一層燃燒甲殼。',
};
const wispFlare: Move = {
  id: 'reliquary-wisp-flare', name: '餘燼閃焰', kind: 'attack', target: 'enemy', hitStat: 'dex', element: 'fire',
  damage: { dice: 1, sides: 5, bonusStat: 'dex' },
  narration: '{actor}化為一道餘燼閃光穿過{target}，造成 {amount} 點傷害！',
};

function emberAvatar(): EnemyUnit {
  return {
    id: 'reliquary-ember-avatar', name: '龍燼化身・心火殘像',
    stats: { str: 18, dex: 12, int: 17, cha: 18, con: 19 }, maxHp: 62, hp: 62, defense: 17,
    weaknesses: ['frost', 'holy'], resists: ['fire', 'slash'], maxPoise: 5,
    moves: [emberClaw, emberBreath, emberShell], intents: [
      { weight: 3, moveId: emberClaw.id },
      { weight: 2, moveId: emberBreath.id },
      { weight: 1, moveId: emberShell.id },
    ],
    enrage: { threshold: 0.5, potency: 3 },
  };
}
function emberWisp(index: number): EnemyUnit {
  return {
    id: `reliquary-ember-wisp-${index}`, name: '龍燼餘火',
    stats: { str: 7, dex: 15, int: 12, cha: 11, con: 8 }, maxHp: 10, hp: 10, defense: 12,
    weaknesses: ['frost', 'holy'], resists: ['fire'], maxPoise: 2,
    moves: [wispFlare], intents: [{ weight: 1, moveId: wispFlare.id }],
  };
}

/** 每次呼叫都回傳全新敵人，不共享 HP、護勢、狀態或激怒資料。 */
export function createReliquaryEncounter(stage: ReliquaryBattleStage): EnemyUnit[] {
  if (stage === 1) return [ashKnight(), cinderSquire()];
  if (stage === 2) return [tonguelessCantor(), choirWraith(1), choirWraith(2)];
  if (stage === 3) return [emberAvatar(), emberWisp(1), emberWisp(2)];
  throw new Error(`未知灰燼聖匣戰鬥幕次「${stage}」`);
}

/** 僅在合法當前幕寫入一次勝利收據；戰鬥本身不額外灌入金幣，避免與路線獎勵重複膨脹。 */
export function completeReliquaryBattle(save: SaveData, stage: ReliquaryBattleStage): string {
  const access = reliquaryBattleAccess(save, stage);
  if (!access.allowed) throw new Error(access.reason);
  const receipt = battleFlag(stage);
  save.flags[receipt] = true;
  return receipt;
}

/** 將本次倒地角色轉為養傷，不在獨立世界任務頁直接永久刪除旅伴。 */
export function applyReliquaryBattleInjuries(save: SaveData, combat: CombatState): string[] {
  const injured: string[] = [];
  for (const unit of combat.party) {
    if (unit.hp > 0) continue;
    const record = unit.isProtagonist
      ? save.protagonist
      : save.companions.find((member) => member.id === unit.id);
    if (!record) continue;
    record.injuredForTrips = Math.max(record.injuredForTrips, unit.isProtagonist ? 1 : 2);
    injured.push(record.id);
  }
  return injured;
}
