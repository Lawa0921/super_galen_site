import type { Rng } from './rng';
import type { Stat, StatBlock } from './types';
import { statMod } from './check';

export interface Move {
  id: string; name: string;
  kind: 'attack' | 'guard' | 'support';
  target: 'enemy' | 'ally' | 'self';
  hitStat: Stat;
  damage?: { dice: number; sides: number; bonusStat?: Stat };
  heal?: { dice: number; sides: number; bonusStat?: Stat };
  /** 命中後附加狀態（M7）：poison 每回合行動前扣 potency；stun 跳過一次行動；strength 出手傷害 +potency */
  applyStatus?: { kind: StatusKind; duration: number; potency?: number };
  /** M15 傷害屬性（attack 專用）；無＝中性 */
  element?: Element;
  narration: string; // 例：「{actor}的巨劍劈向{target}，造成 {amount} 點傷害！」
  /** 解鎖所需等級；未標＝Lv1 起就會（M4 roster.ts unlockedMoves 依此過濾） */
  minLevel?: number;
}

/** M15 傷害屬性：斬/刺/打/火/冰/聖；undefined＝中性（不觸發弱點/抗性） */
export type Element = 'slash' | 'pierce' | 'blunt' | 'fire' | 'frost' | 'holy';

export const ELEMENT_LABELS: Record<Element, string> = {
  slash: '斬', pierce: '刺', blunt: '打', fire: '火', frost: '冰', holy: '聖',
};

export type StatusKind = 'poison' | 'stun' | 'strength';
export interface StatusEffect { kind: StatusKind; remaining: number; potency: number; }

export interface CombatantBase {
  id: string; name: string; stats: StatBlock;
  maxHp: number; hp: number; defense: number; moves: Move[];
  /** M14 鐵匠強化：武器 +N 固定傷害加值 */
  damageBonus?: number;
  /** 進行中狀態效果（M7，戰鬥 runtime） */
  statuses?: StatusEffect[];
  /** 立繪路徑（M5 美術） */
  art?: string;
}

export interface PartyMember extends CombatantBase { isProtagonist?: boolean; }

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
  order: string[];                      // 先攻序（id），高到低
  turnIndex: number;                    // order 中目前行動者索引
  party: PartyMember[]; enemies: EnemyUnit[];
  guarding: Record<string, boolean>;    // 架盾中（受擊防禦+4，行動者輪到時解除）
  enemyIntents: Record<string, string>; // enemyId -> 預告的 moveId
  log: CombatEvent[];
  outcome: 'ongoing' | 'victory' | 'defeat' | 'retreated';
}

export function startCombat(rng: Rng, party: PartyMember[], enemies: EnemyUnit[]): CombatState {
  // Interleave party and enemies for initialization roll order (骰序，不可更動——既有測試依賴)
  const all = [];
  const maxLen = Math.max(party.length, enemies.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < party.length) all.push({ id: party[i].id, dex: party[i].stats.dex });
    if (i < enemies.length) all.push({ id: enemies[i].id, dex: enemies[i].stats.dex });
  }
  // Tie-break 用傳入順序（隊伍在前）的索引，與擲骰的交錯順序解耦
  const tieBreakIndex = new Map([...party, ...enemies].map((c, index) => [c.id, index]));
  const rolled = all.map((c) => ({ ...c, init: rng.d20() + statMod(c.dex) }));
  rolled.sort((a, b) => b.init - a.init || tieBreakIndex.get(a.id)! - tieBreakIndex.get(b.id)!);
  const state: CombatState = {
    round: 1, order: rolled.map((r) => r.id), turnIndex: 0,
    party, enemies, guarding: {}, enemyIntents: {}, log: [], outcome: 'ongoing',
  };
  for (const enemy of enemies) {
    if (enemy.maxPoise !== undefined && enemy.poise === undefined) enemy.poise = enemy.maxPoise;
    state.enemyIntents[enemy.id] = rng.weightedPick(
      enemy.intents.map((it) => ({ weight: it.weight, value: it.moveId }))
    );
  }
  state.log.push({ kind: 'info', text: '戰鬥開始！' });
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
      delete state.guarding[id];  // 輪到自己時解除架盾
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

function applyDamage(state: CombatState, target: CombatantBase, amount: number): void {
  target.hp = Math.max(0, target.hp - amount);
  if (target.hp === 0) state.log.push({ kind: 'down', text: `${target.name}倒下了！` });
  // M10 Boss 激怒：半血觸發一次，自我強化（永續）
  const boss = target as EnemyUnit;
  if (boss.enrage && !boss.enraged && target.hp > 0 && target.hp <= target.maxHp * boss.enrage.threshold) {
    boss.enraged = true;
    target.statuses ??= [];
    target.statuses.push({ kind: 'strength', remaining: 99, potency: boss.enrage.potency });
    state.log.push({ kind: 'info', text: `${target.name}被逼入絕境，發出震耳咆哮——激怒了！攻勢變得更加兇猛！` });
  }
}

const STATUS_LABEL: Record<StatusKind, string> = { poison: '中毒', stun: '暈眩', strength: '強化' };

/** 行動前狀態結算（M7）：毒發作扣血、暈眩跳過本次行動。回傳 false＝本次行動被取消。 */
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
  }
  actor.statuses = actor.statuses.filter((st) => st.remaining > 0);
  return canAct && actor.hp > 0;
}

function performMove(rng: Rng, state: CombatState, actor: CombatantBase, move: Move, target: CombatantBase): void {
  if (move.kind === 'guard') {
    state.guarding[actor.id] = true;
    state.log.push({ kind: 'action', text: fillNarration(move.narration, actor.name, actor.name, 0) });
    return;
  }
  if (move.kind === 'support' && !move.heal && move.applyStatus) {
    // M8：純 buff support（戰吟）——直接對目標上狀態
    const spec = move.applyStatus;
    target.statuses ??= [];
    const existing = target.statuses.find((s) => s.kind === spec.kind);
    if (existing) existing.remaining = Math.max(existing.remaining, spec.duration);
    else target.statuses.push({ kind: spec.kind, remaining: spec.duration, potency: spec.potency ?? 0 });
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
  // attack
  const die = rng.d20();
  const defense = target.defense + (state.guarding[target.id] ? 4 : 0);
  const hit = die === 20 ? true : die === 1 ? false : die + statMod(actor.stats[move.hitStat]) >= defense;
  if (!hit) {
    state.log.push({ kind: 'action', text: `${actor.name}的${move.name}落空了！` });
    return;
  }
  const dmgSpec = move.damage ?? { dice: 1, sides: 4 };
  // M7 強化：出手傷害 +potency，用一次遞減
  const strength = actor.statuses?.find((s) => s.kind === 'strength');
  const strengthBonus = strength?.potency ?? 0;
  if (strength) {
    strength.remaining -= 1;
    actor.statuses = actor.statuses!.filter((s) => s.remaining > 0);
  }
  const baseAmount = Math.max(1, rollDice(rng, dmgSpec.dice, dmgSpec.sides)
    + (dmgSpec.bonusStat ? statMod(actor.stats[dmgSpec.bonusStat]) : 0) + strengthBonus
    + (actor.damageBonus ?? 0));
  // M15 屬性弱點/抗性（僅對帶弱點表的目標＝敵人生效）
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
  state.log.push({ kind: 'damage', text: fillNarration(move.narration, actor.name, target.name, amount) });
  if (hitWeakness) state.log.push({ kind: 'info', text: `擊中弱點！${target.name}被${ELEMENT_LABELS[move.element!]}屬性重創！` });
  else if (foe && move.element && foe.resists?.includes(move.element)) {
    state.log.push({ kind: 'info', text: `效果不佳……${target.name}對${ELEMENT_LABELS[move.element!]}屬性有抗性。` });
  }
  applyDamage(state, target, amount);
  // M15 破防：弱點命中削護勢，歸零＝暈眩＋重置
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
  // M7 命中附加狀態（同類刷新為較長持續）
  if (move.applyStatus && target.hp > 0) {
    const spec = move.applyStatus;
    target.statuses ??= [];
    const existing = target.statuses.find((s) => s.kind === spec.kind);
    if (existing) existing.remaining = Math.max(existing.remaining, spec.duration);
    else target.statuses.push({ kind: spec.kind, remaining: spec.duration, potency: spec.potency ?? 0 });
    state.log.push({ kind: 'info', text: `${target.name}陷入${STATUS_LABEL[spec.kind]}狀態！` });
  }
}

export function partyAct(rng: Rng, state: CombatState, actorId: string, moveId: string, targetId: string): void {
  const actor = state.party.find((p) => p.id === actorId);
  const move = actor?.moves.find((m) => m.id === moveId);
  const targetFound = [...state.party, ...state.enemies].find((c) => c.id === targetId);
  if (!actor || !move || !targetFound || state.outcome !== 'ongoing') return;
  if (!tickStatuses(state, actor)) {
    checkOutcome(state);
    if (state.outcome === 'ongoing') advanceTurn(state);
    return;
  }
  performMove(rng, state, actor, move, targetFound);
  checkOutcome(state);
  if (state.outcome === 'ongoing') advanceTurn(state);
}

export function enemyAct(rng: Rng, state: CombatState, enemyId: string): void {
  const enemy = state.enemies.find((e) => e.id === enemyId);
  if (!enemy || state.outcome !== 'ongoing') return;
  if (!tickStatuses(state, enemy)) {
    state.enemyIntents[enemyId] = rng.weightedPick(
      enemy.intents.map((it) => ({ weight: it.weight, value: it.moveId }))
    );
    checkOutcome(state);
    if (state.outcome === 'ongoing') advanceTurn(state);
    return;
  }
  const moveId = state.enemyIntents[enemyId] ?? enemy.moves[0].id;
  const move = enemy.moves.find((m) => m.id === moveId) ?? enemy.moves[0];
  let target: CombatantBase;
  if (move.kind === 'support' && move.heal) {
    // 治療招：目標＝敵方存活同伴（可含自己）中缺血（maxHp - hp）最大者
    const aliveEnemies = state.enemies.filter((e) => e.hp > 0);
    if (aliveEnemies.length === 0) return;
    target = aliveEnemies.reduce(
      (most, e) => (e.maxHp - e.hp > most.maxHp - most.hp ? e : most), aliveEnemies[0]
    );
  } else {
    const aliveParty = state.party.filter((p) => p.hp > 0);
    if (aliveParty.length === 0) return;
    target = aliveParty.reduce((low, p) => (p.hp < low.hp ? p : low), aliveParty[0]);
  }
  performMove(rng, state, enemy, move, target);
  state.enemyIntents[enemyId] = rng.weightedPick(
    enemy.intents.map((it) => ({ weight: it.weight, value: it.moveId }))
  );
  checkOutcome(state);
  if (state.outcome === 'ongoing') advanceTurn(state);
}

/** M11 戰鬥道具效果（資料層 ItemDef.use 轉譯後傳入） */
export type ItemCombatUse =
  | { kind: 'heal'; amount: number; name: string }
  | { kind: 'cure'; name: string }
  | { kind: 'buff'; status: { kind: StatusKind; duration: number; potency?: number }; name: string };

/**
 * M11 戰鬥中使用道具：治療/解毒/強化目標隊友。
 * 消耗使用者的行動（advanceTurn）；背包扣減由呼叫端（UI/遠征層）負責。
 */
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
    state.log.push({ kind: 'info', text: `${actor.name}使用${use.name}，${target.name}獲得強化！` });
  }
  advanceTurn(state);
}

export function attemptRetreat(rng: Rng, state: CombatState): void {
  if (state.outcome !== 'ongoing') return;
  const aliveParty = state.party.filter((p) => p.hp > 0);
  const aliveEnemy = state.enemies.find((e) => e.hp > 0);
  if (aliveParty.length > 0 && aliveEnemy) {
    // 殿後者 = order 中最後出現的存活隊員（先攻最低）
    const rear = [...state.order].reverse()
      .map((id) => aliveParty.find((p) => p.id === id))
      .find((p) => p !== undefined)!;
    state.log.push({ kind: 'retreat', text: `${rear.name}殿後掩護撤退……` });
    const attackMove = aliveEnemy.moves.find((m) => m.kind === 'attack');
    if (attackMove) {
      performMove(rng, state, aliveEnemy, attackMove, rear);
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
