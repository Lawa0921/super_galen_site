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
}

export interface CombatantBase {
  id: string; name: string; stats: StatBlock;
  maxHp: number; hp: number; defense: number; moves: Move[];
}

export interface PartyMember extends CombatantBase { isProtagonist?: boolean; }

export interface EnemyUnit extends CombatantBase { intents: Array<{ weight: number; moveId: string }>; }

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
