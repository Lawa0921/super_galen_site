import type { Rng } from './rng';
import type { FormationRow } from './save';
import type { Stat, StatBlock } from './types';
import { statMod } from './check';
import {
  MYSTIC_KIND_LABELS,
  mysticPowerText,
  mysticRuleForMove,
  prepareMysticPartyMember,
} from './data/arcana';
import {
  resolveArmorMitigation,
  type ArmorProtection,
} from './data/armorProfiles.m48';
import {
  canGuardIntercept,
  formationAttackProfile,
  type EngagementBand,
} from './data/martialEngagement.m49';

export interface Move {
  id: string; name: string;
  kind: 'attack' | 'guard' | 'support';
  target: 'enemy' | 'ally' | 'self';
  hitStat: Stat;
  /** M16 隊伍戰術：對敵方全體逐一進行命中與傷害判定 */
  area?: boolean;
  /** M16 隊伍戰術：命中檢定的固定加值 */
  hitBonus?: number;
  /** M48：只削減物理護甲的平坦減傷，不影響命中，也不穿透魔法防護。 */
  armorPiercing?: number;
  /** M49：可覆寫自動判定的交戰距離；真正魔法仍由 arcana 規則優先判定。 */
  engagement?: EngagementBand;
  damage?: { dice: number; sides: number; bonusStat?: Stat };
  heal?: { dice: number; sides: number; bonusStat?: Stat };
  /** M44：ward 為一次性魔法護法；remaining 代表可抵擋的命中次數。 */
  applyStatus?: { kind: StatusKind; duration: number; potency?: number };
  /** M15 傷害屬性（attack 專用）；無＝中性 */
  element?: Element;
  narration: string;
  /** 解鎖所需等級；未標＝Lv1 起就會（M4 roster.ts unlockedMoves 依此過濾） */
  minLevel?: number;
}

/** M15 傷害屬性：斬/刺/打/火/冰/聖；undefined＝中性（不觸發弱點/抗性） */
export type Element = 'slash' | 'pierce' | 'blunt' | 'fire' | 'frost' | 'holy';

export const ELEMENT_LABELS: Record<Element, string> = {
  slash: '斬', pierce: '刺', blunt: '打', fire: '火', frost: '冰', holy: '聖',
};

export type StatusKind = 'poison' | 'stun' | 'strength' | 'ward';
export interface StatusEffect { kind: StatusKind; remaining: number; potency: number; }

/** M41：法師使用秘法、教士使用神恩；strain 僅對秘法過載有意義。 */
export interface MysticPower {
  kind: 'mana' | 'favor';
  current: number;
  max: number;
  strain: number;
}

export interface CombatantBase {
  id: string; name: string; stats: StatBlock;
  maxHp: number; hp: number; defense: number; moves: Move[];
  /** M14 鐵匠強化：武器 +N 固定傷害加值 */
  damageBonus?: number;
  /** M48：裝備或敵人本身的材質防護。 */
  armorProtection?: ArmorProtection;
  /** 進行中狀態效果（M7/M44，戰鬥 runtime） */
  statuses?: StatusEffect[];
  /** M41 戰鬥中的秘法／神恩，不寫回角色存檔。M44 起敵方施法者也遵守同規則。 */
  mystic?: MysticPower;
  /** 立繪路徑（M5 美術） */
  art?: string;
}

export interface PartyMember extends CombatantBase {
  isProtagonist?: boolean;
  /** M17 前後排：單體敵襲優先鎖定仍存活的前排。 */
  formationRow?: FormationRow;
}

export interface EnemyUnit extends CombatantBase {
  intents: Array<{ weight: number; moveId: string }>;
  /** M15 弱點屬性：命中 ×1.5 並削 1 護勢 */
  weaknesses?: Element[];
  /** M15 抗性屬性：命中 ×0.5 */
  resists?: Element[];
  /** M15 護勢上限：弱點命中削減、歸零破防（暈眩 1 回合＋重置） */
  maxPoise?: number;
  /** runtime：目前護勢（startCombat 初始化） */
  poise?: number;
  loot?: { gold: [number, number]; itemId?: string; itemChance?: number };
  /** Boss 激怒（M10）：HP 比例 ≤ threshold 時觸發一次，自我強化 potency（永續） */
  enrage?: { threshold: number; potency: number };
  /** runtime：激怒已觸發 */
  enraged?: boolean;
}

export interface CombatEvent { kind: 'action'|'damage'|'heal'|'down'|'info'|'retreat'|'victory'|'defeat'; text: string; }

export interface CombatState {
  round: number;
  order: string[];
  turnIndex: number;
  party: PartyMember[]; enemies: EnemyUnit[];
  guarding: Record<string, boolean>;
  enemyIntents: Record<string, string>;
  log: CombatEvent[];
  outcome: 'ongoing' | 'victory' | 'defeat' | 'retreated';
}

export interface PartyMoveAvailability {
  allowed: boolean;
  canOvercast: boolean;
  cost: number;
  current: number;
  shortfall: number;
  backlash: number;
  reason: string;
}

export interface PartyActionOptions { overcast?: boolean; }
export interface PartyActionResult {
  acted: boolean;
  overcast: boolean;
  backlash: number;
  reason?: string;
}

export function startCombat(rng: Rng, party: PartyMember[], enemies: EnemyUnit[]): CombatState {
  // M41/M44：雙方施法者共用同一套招式裝飾、秘法／神恩容量與恢復手段。
  for (const member of party) prepareMysticPartyMember(member);
  for (const enemy of enemies) prepareMysticPartyMember(enemy);
  // Interleave party and enemies for initialization roll order (骰序不可更動——既有測試依賴)
  const all = [];
  const maxLen = Math.max(party.length, enemies.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < party.length) all.push({ id: party[i].id, dex: party[i].stats.dex });
    if (i < enemies.length) all.push({ id: enemies[i].id, dex: enemies[i].stats.dex });
  }
  const tieBreakIndex = new Map([...party, ...enemies].map((c, index) => [c.id, index]));
  const rolled = all.map((c) => ({ ...c, init: rng.d20() + statMod(c.dex) }));
  rolled.sort((a, b) => b.init - a.init || tieBreakIndex.get(a.id)! - tieBreakIndex.get(b.id)!);
  const state: CombatState = {
    round: 1, order: rolled.map((r) => r.id), turnIndex: 0,
    party, enemies, guarding: {}, enemyIntents: {}, log: [], outcome: 'ongoing',
  };
  for (const enemy of enemies) {
    if (enemy.maxPoise !== undefined && enemy.poise === undefined) enemy.poise = enemy.maxPoise;
    state.enemyIntents[enemy.id] = chooseEnemyIntent(rng, enemy);
  }
  state.log.push({ kind: 'info', text: '戰鬥開始！' });
  collapseFrontLineIfNeeded(state);
  for (const member of party) {
    if (member.mystic) state.log.push({ kind: 'info', text: `${member.name}：${mysticPowerText(member.mystic)}。` });
  }
  for (const enemy of enemies) {
    if (enemy.mystic) state.log.push({ kind: 'info', text: `${enemy.name}顯露施法氣息：${mysticPowerText(enemy.mystic)}。` });
  }
  return state;
}

function findCombatant(state: CombatState, id: string): { side: 'party' | 'enemy'; unit: CombatantBase } | null {
  const p = state.party.find((m) => m.id === id);
  if (p) return { side: 'party', unit: p };
  const e = state.enemies.find((m) => m.id === id);
  if (e) return { side: 'enemy', unit: e };
  return null;
}

export function currentActor(state: CombatState): { side: 'party' | 'enemy'; id: string } | null {
  if (state.outcome !== 'ongoing') return null;
  const id = state.order[state.turnIndex];
  const found = findCombatant(state, id);
  if (!found) return null;
  return { side: found.side, id };
}

export function advanceTurn(state: CombatState): void {
  for (let step = 0; step < state.order.length; step++) {
    state.turnIndex += 1;
    if (state.turnIndex >= state.order.length) {
      state.turnIndex = 0;
      state.round += 1;
    }
    const id = state.order[state.turnIndex];
    const found = findCombatant(state, id);
    if (found && found.unit.hp > 0) {
      delete state.guarding[id];
      return;
    }
  }
}

function fillNarration(template: string, actor: string, target: string, amount: number): string {
  return template.replace('{actor}', actor).replace('{target}', target).replace('{amount}', String(amount));
}

function rollDice(rng: Rng, dice: number, sides: number): number {
  let sum = 0;
  for (let i = 0; i < dice; i++) sum += rng.roll(sides);
  return sum;
}

function checkOutcome(state: CombatState): void {
  if (state.enemies.every((e) => e.hp <= 0)) {
    state.outcome = 'victory';
    state.log.push({ kind: 'victory', text: '敵人被擊潰了！' });
  } else if (state.party.every((p) => p.hp <= 0)) {
    state.outcome = 'defeat';
    state.log.push({ kind: 'defeat', text: '商隊的旗幟倒下了……' });
  }
}

/**
 * M49：前排一旦全數倒下，後排就不再享有「安全距離」的假象。
 * 將仍存活的後排提升為前排，讓近戰恢復正常貼身命中、弓弩承受近身壓力，
 * 同時使守勢角色可以在真正接戰後攔截同伴。這只改戰鬥 runtime，不回寫編隊存檔。
 */
function collapseFrontLineIfNeeded(state: CombatState): void {
  const aliveParty = state.party.filter((member) => member.hp > 0);
  if (aliveParty.length === 0) return;
  if (aliveParty.some((member) => member.formationRow !== 'back')) return;
  for (const member of aliveParty) member.formationRow = 'front';
  state.log.push({ kind: 'info', text: '前線崩潰！後排成員被迫上前接戰。' });
}

function applyDamage(state: CombatState, target: CombatantBase, amount: number): void {
  target.hp = Math.max(0, target.hp - amount);
  if (target.hp === 0) state.log.push({ kind: 'down', text: `${target.name}倒下了！` });
  collapseFrontLineIfNeeded(state);
  const boss = target as EnemyUnit;
  if (boss.enrage && !boss.enraged && target.hp > 0 && target.hp <= target.maxHp * boss.enrage.threshold) {
    boss.enraged = true;
    target.statuses ??= [];
    target.statuses.push({ kind: 'strength', remaining: 99, potency: boss.enrage.potency });
    state.log.push({ kind: 'info', text: `${target.name}被逼入絕境，發出震耳咆哮——激怒了！攻勢變得更加兇猛！` });
  }
}

const STATUS_LABEL: Record<StatusKind, string> = {
  poison: '中毒', stun: '暈眩', strength: '強化', ward: '護法',
};

function tickStatuses(state: CombatState, actor: CombatantBase): boolean {
  if (!actor.statuses?.length) return true;
  let canAct = true;
  for (const st of actor.statuses) {
    if (st.kind === 'poison') {
      state.log.push({ kind: 'damage', text: `${actor.name}毒素發作，損失 ${st.potency} 點生命！` });
      applyDamage(state, actor, st.potency);
      st.remaining -= 1;
    } else if (st.kind === 'stun') {
      state.log.push({ kind: 'info', text: `${actor.name}暈眩中，無法行動！` });
      st.remaining -= 1;
      canAct = false;
    }
    // M44 ward 是命中次數制，由魔法傷害真正打中時才消耗，不隨持有者回合自然衰減。
  }
  actor.statuses = actor.statuses.filter((st) => st.remaining > 0);
  return canAct && actor.hp > 0;
}

function consumeStrength(actor: CombatantBase): number {
  const strength = actor.statuses?.find((s) => s.kind === 'strength');
  if (!strength) return 0;
  strength.remaining -= 1;
  actor.statuses = actor.statuses!.filter((s) => s.remaining > 0);
  return strength.potency;
}

function performMove(
  rng: Rng,
  state: CombatState,
  actor: CombatantBase,
  move: Move,
  target: CombatantBase,
  strengthBonus = 0,
): void {
  if (move.kind === 'guard') {
    state.guarding[actor.id] = true;
    state.log.push({ kind: 'action', text: fillNarration(move.narration, actor.name, actor.name, 0) });
    return;
  }
  if (move.kind === 'support' && !move.heal && move.applyStatus) {
    const spec = move.applyStatus;
    target.statuses ??= [];
    const existing = target.statuses.find((s) => s.kind === spec.kind);
    if (existing) {
      existing.remaining = Math.max(existing.remaining, spec.duration);
      existing.potency = Math.max(existing.potency, spec.potency ?? 0);
    } else {
      target.statuses.push({ kind: spec.kind, remaining: spec.duration, potency: spec.potency ?? 0 });
    }
    state.log.push({ kind: 'action', text: fillNarration(move.narration, actor.name, target.name, 0) });
    state.log.push({ kind: 'info', text: `${target.name}獲得${STATUS_LABEL[spec.kind]}狀態！` });
    return;
  }
  if (move.kind === 'support' && move.heal) {
    const amount = Math.max(1, rollDice(rng, move.heal.dice, move.heal.sides)
      + (move.heal.bonusStat ? statMod(actor.stats[move.heal.bonusStat]) : 0));
    const applied = Math.min(amount, target.maxHp - target.hp);
    target.hp += applied;
    state.log.push({ kind: 'heal', text: fillNarration(move.narration, actor.name, target.name, applied) });
    return;
  }
  if (move.kind === 'support') {
    state.log.push({ kind: 'action', text: fillNarration(move.narration, actor.name, target.name, 0) });
    return;
  }
  const spellRule = mysticRuleForMove(move);
  const partyActor = state.party.find((member) => member.id === actor.id);
  const formation = formationAttackProfile(partyActor?.formationRow, move, !!spellRule);
  const die = rng.d20();
  const defense = target.defense + (state.guarding[target.id] ? 4 : 0);
  const hit = die === 20
    ? true
    : die === 1
      ? false
      : die + statMod(actor.stats[move.hitStat]) + (move.hitBonus ?? 0) + formation.hitModifier >= defense;
  if (!hit) {
    state.log.push({ kind: 'action', text: `${actor.name}的${move.name}落空了！` });
    return;
  }
  const dmgSpec = move.damage ?? { dice: 1, sides: 4 };
  const baseAmount = Math.max(1, rollDice(rng, dmgSpec.dice, dmgSpec.sides)
    + (dmgSpec.bonusStat ? statMod(actor.stats[dmgSpec.bonusStat]) : 0) + strengthBonus
    + (actor.damageBonus ?? 0));
  const foe = 'intents' in target ? (target as EnemyUnit) : null;
  let amount = baseAmount;
  let hitWeakness = false;
  if (foe && move.element) {
    if (foe.weaknesses?.includes(move.element)) {
      amount = Math.round(baseAmount * 1.5);
      hitWeakness = true;
    } else if (foe.resists?.includes(move.element)) {
      amount = Math.max(1, Math.round(baseAmount * 0.5));
    }
  }

  const armor = resolveArmorMitigation(target.armorProtection, move, !!spellRule);
  if (armor.baseReduction > 0) {
    if (armor.reduction > 0) {
      amount = Math.max(1, amount - armor.reduction);
      state.log.push({
        kind: 'info',
        text: `${target.name}的${armor.label}削去了 ${armor.reduction} 點${armor.magical ? '魔法' : '物理'}傷害。`,
      });
    }
    if (armor.bypassed > 0) {
      state.log.push({
        kind: 'info',
        text: `${actor.name}的${move.name}穿透了 ${armor.bypassed} 點護甲減傷！`,
      });
    }
  }

  // M44：護法只反制真正的魔法招式，不會把劍、箭、毒牙等物理威脅也一併作廢。
  let wardAbsorbed = 0;
  if (spellRule) {
    const ward = target.statuses?.find((status) => status.kind === 'ward' && status.remaining > 0);
    if (ward) {
      wardAbsorbed = Math.min(amount, ward.potency);
      amount = Math.max(0, amount - wardAbsorbed);
      ward.remaining -= 1;
      target.statuses = target.statuses!.filter((status) => status.remaining > 0);
      state.log.push({
        kind: 'info',
        text: `${target.name}的護法削去了 ${wardAbsorbed} 點魔法傷害！`,
      });
    }
  }

  state.log.push({ kind: 'damage', text: fillNarration(move.narration, actor.name, target.name, amount) });
  if (hitWeakness) state.log.push({ kind: 'info', text: `擊中弱點！${target.name}被${ELEMENT_LABELS[move.element!]}屬性重創！` });
  else if (foe && move.element && foe.resists?.includes(move.element)) {
    state.log.push({ kind: 'info', text: `效果不佳……${target.name}對${ELEMENT_LABELS[move.element!]}屬性有抗性。` });
  }
  applyDamage(state, target, amount);
  if (foe && hitWeakness && foe.poise !== undefined && foe.hp > 0) {
    foe.poise -= 1;
    if (foe.poise <= 0) {
      foe.poise = foe.maxPoise ?? 0;
      foe.statuses ??= [];
      const stunned = foe.statuses.find((s) => s.kind === 'stun');
      if (stunned) stunned.remaining = Math.max(stunned.remaining, 1);
      else foe.statuses.push({ kind: 'stun', remaining: 1, potency: 0 });
      state.log.push({ kind: 'info', text: `${foe.name}的架勢被徹底打散——破防！下一次行動陷入暈眩！` });
    }
  }
  const fullyWarded = !!spellRule && wardAbsorbed > 0 && amount === 0;
  if (move.applyStatus && target.hp > 0 && !fullyWarded) {
    const spec = move.applyStatus;
    target.statuses ??= [];
    const existing = target.statuses.find((s) => s.kind === spec.kind);
    if (existing) {
      existing.remaining = Math.max(existing.remaining, spec.duration);
      existing.potency = Math.max(existing.potency, spec.potency ?? 0);
    } else {
      target.statuses.push({ kind: spec.kind, remaining: spec.duration, potency: spec.potency ?? 0 });
    }
    state.log.push({ kind: 'info', text: `${target.name}陷入${STATUS_LABEL[spec.kind]}狀態！` });
  }
}

function backlashFor(actor: PartyMember, shortfall: number): number {
  return 2 + shortfall * 2 + (actor.mystic?.strain ?? 0) * 2;
}

/** UI 與正式結算共用；不足時不會偷偷自動過載。 */
export function partyMoveAvailability(
  actor: PartyMember,
  move: Move,
  options: PartyActionOptions = {},
): PartyMoveAvailability {
  const rule = mysticRuleForMove(move);
  if (!rule) {
    return { allowed: true, canOvercast: false, cost: 0, current: 0, shortfall: 0, backlash: 0, reason: '' };
  }
  const power = actor.mystic;
  if (!power || power.kind !== rule.kind) {
    return {
      allowed: false, canOvercast: false, cost: rule.cost, current: 0, shortfall: rule.cost, backlash: 0,
      reason: `${actor.name}無法調用${MYSTIC_KIND_LABELS[rule.kind]}。`,
    };
  }
  if (rule.cost <= power.current) {
    return {
      allowed: true, canOvercast: false, cost: rule.cost, current: power.current, shortfall: 0, backlash: 0, reason: '',
    };
  }
  const shortfall = rule.cost - power.current;
  const backlash = backlashFor(actor, shortfall);
  const canOvercast = rule.kind === 'mana' && rule.overcast && actor.hp > backlash;
  const allowed = options.overcast === true && canOvercast;
  return {
    allowed,
    canOvercast,
    cost: rule.cost,
    current: power.current,
    shortfall,
    backlash,
    reason: canOvercast
      ? `${MYSTIC_KIND_LABELS[rule.kind]}不足；可承受 ${backlash} 點反噬強行施法。`
      : `${MYSTIC_KIND_LABELS[rule.kind]}不足，需要 ${rule.cost}，目前 ${power.current}。`,
  };
}

function addOrRefreshStun(actor: PartyMember): void {
  actor.statuses ??= [];
  const stunned = actor.statuses.find((status) => status.kind === 'stun');
  if (stunned) stunned.remaining = Math.max(stunned.remaining, 1);
  else actor.statuses.push({ kind: 'stun', remaining: 1, potency: 0 });
}

function beginMysticAction(
  state: CombatState,
  actor: PartyMember,
  move: Move,
  availability: PartyMoveAvailability,
): { overcast: boolean; backlash: number } {
  const rule = mysticRuleForMove(move);
  if (!rule || !actor.mystic) return { overcast: false, backlash: 0 };
  if (rule.cost <= actor.mystic.current) {
    actor.mystic.current -= rule.cost;
    return { overcast: false, backlash: 0 };
  }
  actor.mystic.current = 0;
  actor.mystic.strain = Math.min(5, actor.mystic.strain + availability.shortfall);
  state.log.push({
    kind: 'info',
    text: `${actor.name}撕開安全界線強行施法，承受 ${availability.backlash} 點秘法反噬！`,
  });
  applyDamage(state, actor, availability.backlash);
  return { overcast: true, backlash: availability.backlash };
}

function finishMysticAction(state: CombatState, actor: PartyMember, move: Move, overcast: boolean): void {
  const rule = mysticRuleForMove(move);
  if (!rule || !actor.mystic) return;
  if (rule.gain > 0) actor.mystic.current = Math.min(actor.mystic.max, actor.mystic.current + rule.gain);
  if (rule.strainRelief > 0) actor.mystic.strain = Math.max(0, actor.mystic.strain - rule.strainRelief);
  if (overcast && actor.mystic.strain >= 3) {
    addOrRefreshStun(actor);
    state.log.push({ kind: 'info', text: `${actor.name}的秘法灼傷失控，下一次行動將陷入暈眩！` });
  }
  state.log.push({ kind: 'info', text: `${actor.name}：${mysticPowerText(actor.mystic)}。` });
}

function enemyRecoveryMove(enemy: EnemyUnit): Move | undefined {
  if (!enemy.mystic) return undefined;
  const id = enemy.mystic.kind === 'mana' ? 'arcane-focus' : 'field-prayer';
  return enemy.moves.find((move) => move.id === id);
}

/**
 * M44：敵人不會偷偷過載。若抽到付不起的法術，意圖直接改成公開的恢復／護持行動。
 * 若資料損壞到沒有恢復招式，退回任何仍可合法執行的招式，避免 AI 卡死。
 */
function chooseEnemyIntent(rng: Rng, enemy: EnemyUnit): string {
  const intendedId = rng.weightedPick(
    enemy.intents.map((it) => ({ weight: it.weight, value: it.moveId }))
  );
  const intended = enemy.moves.find((move) => move.id === intendedId) ?? enemy.moves[0];
  if (intended && partyMoveAvailability(enemy, intended).allowed) return intended.id;
  const recovery = enemyRecoveryMove(enemy);
  if (recovery) return recovery.id;
  const fallback = enemy.moves.find((move) => partyMoveAvailability(enemy, move).allowed);
  return fallback?.id ?? intendedId;
}

function validPartyTarget(state: CombatState, actor: PartyMember, move: Move, target: CombatantBase): boolean {
  if (move.target === 'self') return target.id === actor.id;
  if (move.target === 'ally') return state.party.some((member) => member.id === target.id && member.hp > 0);
  return state.enemies.some((enemy) => enemy.id === target.id && enemy.hp > 0);
}

export function partyAct(
  rng: Rng,
  state: CombatState,
  actorId: string,
  moveId: string,
  targetId: string,
  options: PartyActionOptions = {},
): PartyActionResult {
  const actor = state.party.find((p) => p.id === actorId);
  const move = actor?.moves.find((m) => m.id === moveId);
  const targetFound = [...state.party, ...state.enemies].find((c) => c.id === targetId);
  if (!actor || !move || !targetFound || state.outcome !== 'ongoing') {
    return { acted: false, overcast: false, backlash: 0, reason: '行動資料無效。' };
  }
  if (!validPartyTarget(state, actor, move, targetFound)) {
    return { acted: false, overcast: false, backlash: 0, reason: '這個招式不能指定該目標。' };
  }
  const availability = partyMoveAvailability(actor, move, options);
  if (!availability.allowed) {
    state.log.push({ kind: 'info', text: availability.reason });
    return { acted: false, overcast: false, backlash: 0, reason: availability.reason };
  }
  if (!tickStatuses(state, actor)) {
    checkOutcome(state);
    if (state.outcome === 'ongoing') advanceTurn(state);
    return { acted: true, overcast: false, backlash: 0, reason: '狀態使行動失敗。' };
  }
  const mystic = beginMysticAction(state, actor, move, availability);
  if (actor.hp <= 0) {
    checkOutcome(state);
    if (state.outcome === 'ongoing') advanceTurn(state);
    return { acted: true, overcast: mystic.overcast, backlash: mystic.backlash, reason: '施法者被反噬擊倒。' };
  }
  const formation = formationAttackProfile(actor.formationRow, move, !!mysticRuleForMove(move));
  if (formation.message) state.log.push({ kind: 'info', text: formation.message });
  if (move.kind === 'attack' && move.area) {
    const strengthBonus = consumeStrength(actor);
    for (const target of state.enemies.filter((enemy) => enemy.hp > 0)) {
      performMove(rng, state, actor, move, target, strengthBonus);
    }
  } else {
    const strengthBonus = move.kind === 'attack' ? consumeStrength(actor) : 0;
    performMove(rng, state, actor, move, targetFound, strengthBonus);
  }
  finishMysticAction(state, actor, move, mystic.overcast);
  checkOutcome(state);
  if (state.outcome === 'ongoing') advanceTurn(state);
  return { acted: true, overcast: mystic.overcast, backlash: mystic.backlash };
}

export function enemyAct(rng: Rng, state: CombatState, enemyId: string): void {
  const enemy = state.enemies.find((e) => e.id === enemyId);
  if (!enemy || state.outcome !== 'ongoing') return;
  if (!tickStatuses(state, enemy)) {
    state.enemyIntents[enemyId] = chooseEnemyIntent(rng, enemy);
    checkOutcome(state);
    if (state.outcome === 'ongoing') advanceTurn(state);
    return;
  }

  const intendedId = state.enemyIntents[enemyId] ?? enemy.moves[0].id;
  let move = enemy.moves.find((candidate) => candidate.id === intendedId) ?? enemy.moves[0];
  let availability = partyMoveAvailability(enemy, move);
  if (!availability.allowed) {
    move = enemyRecoveryMove(enemy)
      ?? enemy.moves.find((candidate) => partyMoveAvailability(enemy, candidate).allowed)
      ?? move;
    availability = partyMoveAvailability(enemy, move);
  }
  if (!availability.allowed) {
    state.log.push({ kind: 'info', text: `${enemy.name}無法完成預定行動，施法節奏被迫中斷。` });
    state.enemyIntents[enemyId] = chooseEnemyIntent(rng, enemy);
    advanceTurn(state);
    return;
  }

  const mystic = beginMysticAction(state, enemy, move, availability);
  let target: CombatantBase;
  if (move.kind === 'support') {
    const aliveEnemies = state.enemies.filter((candidate) => candidate.hp > 0);
    if (aliveEnemies.length === 0) return;
    if (move.target === 'self') {
      target = enemy;
    } else if (move.heal) {
      target = aliveEnemies.reduce(
        (most, candidate) => (
          candidate.maxHp - candidate.hp > most.maxHp - most.hp ? candidate : most
        ),
        aliveEnemies[0]
      );
    } else {
      // 護法優先交給生命比例最低的同伴，讓玩家可從公開意圖判斷其防守企圖。
      target = aliveEnemies.reduce(
        (lowest, candidate) => (
          candidate.hp / candidate.maxHp < lowest.hp / lowest.maxHp ? candidate : lowest
        ),
        aliveEnemies[0]
      );
    }
  } else {
    const aliveParty = state.party.filter((p) => p.hp > 0);
    if (aliveParty.length === 0) return;
    const frontLine = aliveParty.filter((member) => member.formationRow !== 'back');
    const targetPool = frontLine.length > 0 ? frontLine : aliveParty;
    target = targetPool.reduce((low, p) => (p.hp < low.hp ? p : low), targetPool[0]);
    if (move.kind === 'attack' && !move.area && !state.guarding[target.id]) {
      const guardian = state.order
        .map((id) => state.party.find((member) => member.id === id))
        .find((member) => member && member.hp > 0 && state.guarding[member.id] && canGuardIntercept(member.formationRow));
      if (guardian && guardian.id !== target.id) {
        state.log.push({ kind: 'info', text: `${guardian.name}挺身上前，替${target.name}攔下攻擊！` });
        target = guardian;
      }
    }
  }

  const strengthBonus = move.kind === 'attack' ? consumeStrength(enemy) : 0;
  if (move.kind === 'attack' && move.area) {
    for (const member of state.party.filter((partyMember) => partyMember.hp > 0)) {
      performMove(rng, state, enemy, move, member, strengthBonus);
    }
  } else {
    performMove(rng, state, enemy, move, target, strengthBonus);
  }
  finishMysticAction(state, enemy, move, mystic.overcast);
  state.enemyIntents[enemyId] = chooseEnemyIntent(rng, enemy);
  checkOutcome(state);
  if (state.outcome === 'ongoing') advanceTurn(state);
}

export type ItemCombatUse =
  | { kind: 'heal'; amount: number; name: string }
  | { kind: 'cure'; name: string }
  | { kind: 'buff'; status: { kind: StatusKind; duration: number; potency?: number }; name: string };

export function useItemInCombat(state: CombatState, actorId: string, use: ItemCombatUse, targetId: string): void {
  if (state.outcome !== 'ongoing') throw new Error('useItemInCombat: 戰鬥已結束');
  const actor = state.party.find((u) => u.id === actorId);
  const target = state.party.find((u) => u.id === targetId);
  if (!actor || actor.hp <= 0) throw new Error('useItemInCombat: 使用者不存在或已倒下');
  if (!target || target.hp <= 0) throw new Error('useItemInCombat: 目標不存在或已倒下');
  if (use.kind === 'heal') {
    const healed = Math.min(use.amount, target.maxHp - target.hp);
    target.hp += healed;
    state.log.push({ kind: 'heal', text: `${actor.name}使用${use.name}，${target.name}恢復 ${healed} 點生命。` });
  } else if (use.kind === 'cure') {
    target.statuses = (target.statuses ?? []).filter((st) => st.kind !== 'poison');
    state.log.push({ kind: 'info', text: `${actor.name}使用${use.name}，${target.name}的毒被清除了。` });
  } else {
    target.statuses = target.statuses ?? [];
    target.statuses.push({ kind: use.status.kind, remaining: use.status.duration, potency: use.status.potency ?? 0 });
    state.log.push({ kind: 'info', text: `${actor.name}使用${use.name}，${target.name}獲得${STATUS_LABEL[use.status.kind]}！` });
  }
  advanceTurn(state);
}

export function attemptRetreat(rng: Rng, state: CombatState): void {
  if (state.outcome !== 'ongoing') return;
  const aliveParty = state.party.filter((p) => p.hp > 0);
  const aliveEnemy = state.enemies.find((e) => e.hp > 0);
  if (aliveParty.length > 0 && aliveEnemy) {
    const rear = [...state.order].reverse()
      .map((id) => aliveParty.find((p) => p.id === id))
      .find((p) => p !== undefined)!;
    state.log.push({ kind: 'retreat', text: `${rear.name}殿後掩護撤退……` });
    // M44：撤退追擊也不能繞過敵方秘法資源；只選當下合法的攻擊。
    const attackMove = aliveEnemy.moves.find(
      (move) => move.kind === 'attack' && partyMoveAvailability(aliveEnemy, move).allowed
    );
    if (attackMove) {
      const availability = partyMoveAvailability(aliveEnemy, attackMove);
      const mystic = beginMysticAction(state, aliveEnemy, attackMove, availability);
      performMove(rng, state, aliveEnemy, attackMove, rear, consumeStrength(aliveEnemy));
      finishMysticAction(state, aliveEnemy, attackMove, mystic.overcast);
    }
  }
  state.outcome = 'retreated';
  state.log.push({ kind: 'retreat', text: '商隊撤出了戰鬥。' });
}

export function resolveCasualties(rng: Rng, state: CombatState): Array<{ id: string; fate: 'injured' | 'dead' }> {
  const fates: Array<{ id: string; fate: 'injured' | 'dead' }> = [];
  for (const member of state.party) {
    if (member.hp > 0) continue;
    if (member.isProtagonist) {
      fates.push({ id: member.id, fate: 'injured' });
    } else {
      const roll = rng.d20() + statMod(member.stats.con);
      fates.push({ id: member.id, fate: roll >= 10 ? 'injured' : 'dead' });
    }
  }
  return fates;
}
