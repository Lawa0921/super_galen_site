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
  narration: string; // 例：「{actor}的巨劍劈向{target}，造成 {amount} 點傷害！」
  /** 解鎖所需等級；未標＝Lv1 起就會（M4 roster.ts unlockedMoves 依此過濾） */
  minLevel?: number;
}

export interface CombatantBase {
  id: string; name: string; stats: StatBlock;
  maxHp: number; hp: number; defense: number; moves: Move[];
}

export interface PartyMember extends CombatantBase { isProtagonist?: boolean; }

export interface EnemyUnit extends CombatantBase {
  intents: Array<{ weight: number; moveId: string }>;
  loot?: { gold: [number, number]; itemId?: string; itemChance?: number };
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
}

function performMove(rng: Rng, state: CombatState, actor: CombatantBase, move: Move, target: CombatantBase): void {
  if (move.kind === 'guard') {
    state.guarding[actor.id] = true;
    state.log.push({ kind: 'action', text: fillNarration(move.narration, actor.name, actor.name, 0) });
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
  const amount = Math.max(1, rollDice(rng, dmgSpec.dice, dmgSpec.sides)
    + (dmgSpec.bonusStat ? statMod(actor.stats[dmgSpec.bonusStat]) : 0));
  state.log.push({ kind: 'damage', text: fillNarration(move.narration, actor.name, target.name, amount) });
  applyDamage(state, target, amount);
}

export function partyAct(rng: Rng, state: CombatState, actorId: string, moveId: string, targetId: string): void {
  const actor = state.party.find((p) => p.id === actorId);
  const move = actor?.moves.find((m) => m.id === moveId);
  const targetFound = [...state.party, ...state.enemies].find((c) => c.id === targetId);
  if (!actor || !move || !targetFound || state.outcome !== 'ongoing') return;
  performMove(rng, state, actor, move, targetFound);
  checkOutcome(state);
  if (state.outcome === 'ongoing') advanceTurn(state);
}

export function enemyAct(rng: Rng, state: CombatState, enemyId: string): void {
  const enemy = state.enemies.find((e) => e.id === enemyId);
  if (!enemy || state.outcome !== 'ongoing') return;
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
