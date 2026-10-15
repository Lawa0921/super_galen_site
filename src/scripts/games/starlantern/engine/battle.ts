import { CHARACTERS } from '../data/characters';
import { ENEMIES } from '../data/enemies';
import { ITEMS } from '../data/items';
import { SKILLS } from '../data/skills';
import { ULTIMATES } from '../data/ultimates';
import { stat, dealDamage, type BattleEvent, type Combatant } from './combatant';
import { hasPassive, statsOf } from './party';
import { pick, type Rng } from './rng';
import { applyEffect, type EffectContext } from './skills';
import type { CharacterId, Element, Member, Party, Row, Target } from './types';

export type Action =
  | { kind: 'attack'; target: string }
  | { kind: 'skill'; skill: string; target?: string }
  | { kind: 'defend' }
  | { kind: 'item'; item: string; target?: string }
  | { kind: 'escape' }
  | { kind: 'ultimate'; target?: string };
export type Outcome = 'ongoing' | 'win' | 'lose' | 'fled';

export interface BattleState {
  round: number; party: Combatant[]; enemies: Combatant[]; boss: boolean;
  inventory: Record<string, number>; revealed: Record<string, Element[]>; itemBoost: boolean;
  log: BattleEvent[]; outcome: Outcome;
}

type EnemyAction = { kind: 'attack'; target?: string } | { kind: 'enemy-skill'; index: number; target?: string };

export const LIMIT_MAX = 100;
export const LIMIT_PER_ACTION = 12;
/** Damage taken adds floor(damage / max HP * this), at least 1 (see dealDamage). */
export const LIMIT_PER_HIT_SCALE = 40;

const fresh = () => ({ poison: false, sleep: 0, buffs: [], taunt: 0, turret: null, defending: false, limit: 0 });

function fromMember(m: Member, row: Row): Combatant {
  const def = CHARACTERS[m.id];
  return { ...fresh(), key: m.id, side: 'party', defId: m.id, name: def.name, max: statsOf(m), hp: m.hp, tp: m.tp,
    row, melee: def.melee, weak: [], resist: [], boss: false, alive: m.hp > 0, limit: m.limit ?? 0 };
}

function fromEnemy(id: string, key: string, name: string): Combatant {
  const d = ENEMIES[id];
  return { ...fresh(), key, side: 'enemy', defId: id, name, max: { ...d.stats }, hp: d.stats.hp, tp: d.stats.tp,
    row: 'front', melee: true, weak: [...d.weak], resist: [...d.resist], boss: !!d.boss, alive: true };
}

export function createBattle(o: {
  party: Party; enemyIds: string[]; boss?: boolean; inventory: Record<string, number>; revealed: Record<string, Element[]>;
}): BattleState {
  const party: Combatant[] = [];
  for (const id of o.party.front) if (id) party.push(fromMember(o.party.roster[id], 'front'));
  for (const id of o.party.back) if (id) party.push(fromMember(o.party.roster[id], 'back'));
  const counts: Record<string, number> = {};
  for (const id of o.enemyIds) counts[id] = (counts[id] ?? 0) + 1;
  const seen: Record<string, number> = {};
  const enemies = o.enemyIds.map((id, i) => {
    const n = (seen[id] = (seen[id] ?? 0) + 1);
    const name = counts[id] > 1 ? `${ENEMIES[id].name} ${String.fromCharCode(64 + n)}` : ENEMIES[id].name;
    return fromEnemy(id, `e${i}`, name);
  });
  return {
    round: 0, party, enemies, boss: !!o.boss, inventory: { ...o.inventory }, revealed: structuredClone(o.revealed),
    itemBoost: hasPassive(o.party, 'itemBoost'), log: [], outcome: 'ongoing',
  };
}

export function turnOrder(cs: Combatant[], rng: Rng): Combatant[] {
  return cs
    .map((c, i) => ({ c, i, k: stat(c, 'spd') * (1 + rng() * 0.25) }))
    .sort((a, b) => b.k - a.k || a.i - b.i)
    .map((x) => x.c);
}

const living = (cs: Combatant[]) => cs.filter((c) => c.alive);
const avgSpd = (cs: Combatant[]) => living(cs).reduce((s, c) => s + stat(c, 'spd'), 0) / Math.max(1, living(cs).length);

export function escapeChance(s: BattleState): number {
  return Math.min(0.95, Math.max(0.1, 0.5 + (avgSpd(s.party) - avgSpd(s.enemies)) / 50));
}

function pickTarget(list: Combatant[], key: string | undefined, rng: Rng): Combatant | null {
  const chosen = list.find((c) => c.key === key && c.alive);
  if (chosen) return chosen;
  const alive = living(list);
  if (!alive.length) return null;
  return alive.find((c) => c.taunt > 0) ?? pick(rng, alive);
}

function resolveTargets(s: BattleState, actor: Combatant, target: Target | null, chosen: string | undefined, rng: Rng): Combatant[] {
  const allies = actor.side === 'party' ? s.party : s.enemies;
  const foes = actor.side === 'party' ? s.enemies : s.party;
  switch (target) {
    case 'enemy': { const t = pickTarget(foes, chosen, rng); return t ? [t] : []; }
    case 'enemies': return living(foes);
    case 'ally': {
      const t = allies.find((c) => c.key === chosen && c.alive)
        ?? living(allies).sort((a, b) => a.hp / a.max.hp - b.hp / b.max.hp)[0];
      return t ? [t] : [];
    }
    case 'allies': return living(allies);
    case 'self': return [actor];
    case 'deadAlly': {
      const t = allies.find((c) => c.key === chosen && !c.alive) ?? allies.find((c) => !c.alive);
      return t ? [t] : [];
    }
    default: return [];
  }
}

function chooseEnemyActions(s: BattleState, rng: Rng): Map<string, EnemyAction> {
  const out = new Map<string, EnemyAction>();
  for (const e of living(s.enemies)) {
    const skills = ENEMIES[e.defId]?.skills ?? [];
    const index = skills.findIndex((sk) => rng() < sk.chance);
    const target = pickTarget(s.party, undefined, rng)?.key;
    out.set(e.key, index >= 0 ? { kind: 'enemy-skill', index, target } : { kind: 'attack', target });
  }
  return out;
}

function checkOutcome(s: BattleState): boolean {
  if (!living(s.enemies).length) s.outcome = 'win';
  else if (!living(s.party).length) s.outcome = 'lose';
  return s.outcome !== 'ongoing';
}

function perform(s: BattleState, actor: Combatant, act: Action | EnemyAction, ctx: EffectContext, rng: Rng): void {
  if (actor.side === 'enemy') {
    const taunter = living(s.party).find((c) => c.taunt > 0);
    if (taunter) act = { ...act, target: taunter.key } as EnemyAction;
  }
  const physical = (t: Combatant) =>
    applyEffect(actor, t, { kind: 'damage', power: 100, element: 'phys', scale: 'atk', melee: actor.melee }, ctx);
  switch (act.kind) {
    case 'attack': {
      const t = pickTarget(actor.side === 'party' ? s.enemies : s.party, act.target, rng);
      if (!t) return;
      s.log.push({ type: 'act', actor: actor.key, label: '攻擊' });
      physical(t);
      return;
    }
    case 'enemy-skill': {
      const sk = ENEMIES[actor.defId].skills[act.index];
      s.log.push({ type: 'act', actor: actor.key, label: sk.name });
      for (const t of resolveTargets(s, actor, sk.target, act.target, rng)) for (const eff of sk.effects) applyEffect(actor, t, eff, ctx);
      return;
    }
    case 'skill': {
      const def = SKILLS[act.skill];
      if (!def || def.passive) return;
      if (actor.tp < def.tp) { s.log.push({ type: 'no-tp', actor: actor.key }); return; }
      actor.tp -= def.tp;
      if (def.hpCost) actor.hp = Math.max(1, actor.hp - Math.floor(actor.max.hp * def.hpCost));
      s.log.push({ type: 'act', actor: actor.key, label: def.name });
      for (const t of resolveTargets(s, actor, def.target, act.target, rng)) for (const eff of def.effects) applyEffect(actor, t, eff, ctx);
      return;
    }
    case 'item': {
      const def = ITEMS[act.item];
      if (!def || !def.battle || (s.inventory[act.item] ?? 0) <= 0) return;
      s.inventory[act.item] -= 1;
      s.log.push({ type: 'act', actor: actor.key, label: def.name });
      for (const t of resolveTargets(s, actor, def.target, act.target, rng)) for (const eff of def.effects) applyEffect(actor, t, eff, ctx);
      return;
    }
    case 'defend':
      s.log.push({ type: 'act', actor: actor.key, label: '防禦' });
      return;
    case 'escape':
      return;
    case 'ultimate': {
      const u = ULTIMATES[actor.defId as CharacterId];
      if (!u) return;
      if (actor.limit < LIMIT_MAX) { s.log.push({ type: 'no-limit', actor: actor.key }); return; }
      actor.limit = 0;
      s.log.push({ type: 'act', actor: actor.key, label: u.name, ultimate: u.id });
      for (const t of resolveTargets(s, actor, u.target, act.target, rng)) for (const eff of u.effects) applyEffect(actor, t, eff, ctx);
      return;
    }
  }
}

function endOfRound(s: BattleState, ctx: EffectContext, rng: Rng): void {
  for (const c of living(s.party)) {
    if (!c.turret) continue;
    const t = pickTarget(s.enemies, undefined, rng);
    if (t) {
      s.log.push({ type: 'act', actor: c.key, label: '砲台' });
      applyEffect(c, t, { kind: 'damage', power: c.turret.power, element: 'phys', scale: 'mag', melee: false }, ctx);
    }
    c.turret = c.turret.turns > 1 ? { ...c.turret, turns: c.turret.turns - 1 } : null;
  }
  for (const c of [...s.party, ...s.enemies]) {
    if (c.alive && c.poison) {
      const amount = Math.max(1, Math.floor(c.max.hp * 0.1));
      dealDamage(c, amount);
      s.log.push({ type: 'poison-tick', target: c.key, amount });
      if (!c.alive) s.log.push({ type: 'ko', target: c.key });
    }
    c.buffs = c.buffs.map((b) => ({ ...b, turns: b.turns - 1 })).filter((b) => b.turns > 0);
    c.taunt = Math.max(0, c.taunt - 1);
    c.defending = false;
  }
}

export function resolveRound(prev: BattleState, actions: Record<string, Action>, rng: Rng): BattleState {
  const s = structuredClone(prev);
  s.log = [];
  if (s.outcome !== 'ongoing' || checkOutcome(s)) return s;
  s.round += 1;
  const ctx: EffectContext = { rng, itemBoost: s.itemBoost, revealed: s.revealed, log: s.log };
  for (const c of s.party) c.defending = c.alive && actions[c.key]?.kind === 'defend';
  if (s.party.some((c) => c.alive && actions[c.key]?.kind === 'escape')) {
    const success = !s.boss && rng() < escapeChance(s);
    s.log.push({ type: 'escape', success });
    if (success) { s.outcome = 'fled'; return s; }
  }
  const enemyActs = chooseEnemyActions(s, rng);
  for (const actor of turnOrder([...living(s.party), ...living(s.enemies)], rng)) {
    if (!actor.alive) continue;
    if (actor.sleep > 0) { actor.sleep -= 1; s.log.push({ type: 'asleep', actor: actor.key }); continue; }
    const act = actor.side === 'party' ? actions[actor.key] : enemyActs.get(actor.key);
    if (act) {
      perform(s, actor, act, ctx, rng);
      if (actor.side === 'party' && actor.alive && act.kind !== 'ultimate' && act.kind !== 'escape') actor.limit = Math.min(LIMIT_MAX, actor.limit + LIMIT_PER_ACTION);
    }
    if (checkOutcome(s)) return s;
  }
  endOfRound(s, ctx, rng);
  checkOutcome(s);
  return s;
}

export function rewards(s: BattleState, rng: Rng, dropBoost: boolean): { exp: number; gold: number; drops: Record<string, number> } {
  let exp = 0, gold = 0;
  const drops: Record<string, number> = {};
  for (const e of s.enemies) {
    const d = ENEMIES[e.defId];
    exp += d.exp;
    gold += d.gold;
    for (const drop of d.drops) if (rng() < Math.min(1, drop.chance * (dropBoost ? 2 : 1))) drops[drop.mat] = (drops[drop.mat] ?? 0) + 1;
  }
  return { exp, gold, drops };
}

export function writeBack(p: Party, s: BattleState): Party {
  const roster = { ...p.roster };
  for (const c of s.party) {
    const id = c.key as CharacterId;
    roster[id] = { ...roster[id], hp: c.alive ? c.hp : 0, tp: c.tp, limit: c.limit };
  }
  return { ...p, roster };
}
