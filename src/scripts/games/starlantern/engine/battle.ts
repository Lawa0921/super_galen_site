import { reachable, rowOfCell, shapeTargets } from './formation';
import { CHARACTERS } from '../data/characters';
import { CONDITIONS, type ConditionId } from '../data/conditions';
import { ENEMIES } from '../data/enemies';
import { REGIONS, type RegionId } from '../data/regions';
import { ITEMS } from '../data/items';
import { POWERS } from '../data/gear';
import { SKILLS } from '../data/skills';
import { ULTIMATES } from '../data/ultimates';
import { stat, dealDamage, gaugeGain, type BattleEvent, type Combatant } from './combatant';
import { hasPassive, powersOf, sheetOf, statsOf } from './party';
import { pick, type Rng } from './rng';
import { depthLevel, homeLevel, regionTint, scaleEnemy } from './scaling';
import { SECONDARY_KEYS } from './stats';
import { applyEffect, patchSkill, type EffectContext } from './skills';
import type { BuffStat, CharacterId, Effect, Element, EnemyDef, Member, Party, Row, SecondaryKey, SkillDef, Target } from './types';

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
  /** What each enemy will do this round, decided before the player chooses (planEnemies) so the screen can show it. */
  intents?: Record<string, EnemyAction>;
  /** Each enemy's definition as met in this fight (depth, region, elite), by combatant key; absent means the plain ENEMIES entry. */
  enemyDefs?: Record<string, EnemyDef>;
}

/** Depth, region, run condition (default plain) and the id of the enemy that comes as an elite (its first occurrence in `enemyIds`). */
export interface BattleScale { depth: number; region: RegionId; elite?: string; condition?: ConditionId }

export type EnemyAction = { kind: 'attack'; target?: string } | { kind: 'enemy-skill'; index: number; target?: string };

export const LIMIT_MAX = 100;
export const LIMIT_PER_ACTION = 12;
/** Damage taken adds floor(damage / max HP * this), at least 1 (see dealDamage). */
export const LIMIT_PER_HIT_SCALE = 40;

const fresh = () => ({ poison: false, sleep: 0, buffs: [], taunt: 0, turret: null, defending: false, limit: 0 });

function fromMember(m: Member, cell: number): Combatant {
  const row: Row = rowOfCell(cell);
  const def = CHARACTERS[m.id];
  const sheet = sheetOf(m);
  // Only the non-zero secondaries are carried; a missing key reads as 0.
  const x: Partial<Record<SecondaryKey, number>> = {};
  for (const k of SECONDARY_KEYS) if (sheet[k]) x[k] = sheet[k];
  return { ...fresh(), key: m.id, side: 'party', defId: m.id, name: def.name, max: statsOf(m), hp: m.hp, tp: m.tp,
    row, cell, melee: def.melee, weak: [], resist: [], boss: false, alive: m.hp > 0, limit: m.limit ?? 0,
    x, level: m.level, powers: powersOf(m) };
}

/** An enemy carries only its non-zero secondaries, like a member; a missing key reads as 0. */
const nonZero = (sec: Partial<Record<SecondaryKey, number>>): Partial<Record<SecondaryKey, number>> =>
  Object.fromEntries(Object.entries(sec).filter(([, v]) => v));

function fromEnemy(d: EnemyDef, key: string, name: string, tint: Combatant['tint'], level: number): Combatant {
  const c: Combatant = { ...fresh(), key, side: 'enemy', defId: d.id, name, max: { ...d.stats }, hp: d.stats.hp, tp: d.stats.tp,
    row: 'front', melee: true, weak: [...d.weak], resist: [...d.resist], boss: !!d.boss, alive: true,
    x: nonZero(d.sec ?? {}), level, powers: [] };
  if (tint) c.tint = tint;
  return c;
}

/** An enemy's definition in this fight: the scaled one when the fight has one, else the plain entry. */
const enemyDef = (s: BattleState, c: Combatant): EnemyDef | undefined => s.enemyDefs?.[c.key] ?? ENEMIES[c.defId];

export function createBattle(o: {
  party: Party; enemyIds: string[]; boss?: boolean; inventory: Record<string, number>; revealed: Record<string, Element[]>;
  scale?: BattleScale;
  /** Run-long altar bonuses: percent added to the party's max stats for this whole battle (summed per stat). */
  altar?: { stat: BuffStat; pct: number }[];
}): BattleState {
  const party: Combatant[] = [];
  o.party.grid.forEach((id, cell) => { if (id) party.push(fromMember(o.party.roster[id], cell)); });
  const altar = new Map<BuffStat, number>();
  for (const b of o.altar ?? []) altar.set(b.stat, (altar.get(b.stat) ?? 0) + b.pct);
  for (const c of party) for (const [k, pct] of altar) c.max[k] = Math.floor(c.max[k] * (1 + pct / 100));
  const counts: Record<string, number> = {};
  for (const id of o.enemyIds) counts[id] = (counts[id] ?? 0) + 1;
  const seen: Record<string, number> = {};
  const sc = o.scale;
  const region = sc ? REGIONS[sc.region] : null;
  const defs: Record<string, EnemyDef> = {};
  const enemies = o.enemyIds.map((id, i) => {
    const n = (seen[id] = (seen[id] ?? 0) + 1);
    const elite = !!sc && sc.elite === id && n === 1;
    const d = sc && region ? scaleEnemy(ENEMIES[id], sc.depth, region, elite, CONDITIONS[sc.condition ?? 'plain']) : ENEMIES[id];
    defs[`e${i}`] = d;
    const name = counts[id] > 1 ? `${d.name} ${String.fromCharCode(64 + n)}` : d.name;
    // An enemy is met at the fight's depth level, or at its own home level when the fight has no scale.
    const level = sc ? depthLevel(sc.depth) : homeLevel(d);
    return fromEnemy(d, `e${i}`, name, elite ? 'elite' : region ? regionTint(region) : undefined, level);
  });
  const s: BattleState = {
    round: 0, party, enemies, boss: !!o.boss, inventory: { ...o.inventory }, revealed: structuredClone(o.revealed),
    itemBoost: hasPassive(o.party, 'itemBoost'), log: [], outcome: 'ongoing',
  };
  if (sc) s.enemyDefs = defs;
  return s;
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

/** Enemies attacking the party are bound by the grid: melee reaches only the front-most standing row; a taunting member is always reachable. */
function foePool(s: BattleState, actor: Combatant, melee: boolean): Combatant[] {
  if (actor.side !== 'enemy') return s.enemies;
  const pool = reachable(s.party, melee);
  const taunter = living(s.party).find((c) => c.taunt > 0);
  return taunter && !pool.includes(taunter) ? [...pool, taunter] : pool;
}

function resolveTargets(s: BattleState, actor: Combatant, target: Target | null, chosen: string | undefined, rng: Rng, melee = false): Combatant[] {
  const allies = actor.side === 'party' ? s.party : s.enemies;
  const foes = actor.side === 'party' ? s.enemies : s.party;
  switch (target) {
    case 'enemy': { const t = pickTarget(foePool(s, actor, melee), chosen, rng); return t ? [t] : []; }
    case 'row': case 'column': case 'cross': {
      if (actor.side === 'party') return living(foes);   // enemies stand in one line: a shape covers them all
      const t = pickTarget(foePool(s, actor, melee), chosen, rng);
      return t ? shapeTargets(foes, t, target) : [];
    }
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

/**
 * A skill as this combatant casts it: every worn power that names it rewrites it, in the order worn. Added effects
 * (`extra`) are gathered and appended last, so another power's powerPct never rescales them.
 */
export function skillFor(c: Combatant, id: string): SkillDef {
  const base = SKILLS[id];
  const mods = (c.powers ?? []).map((p) => POWERS[p]).filter((p) => p && p.skill === id).map((p) => p.mod);
  if (!base || !mods.length) return base;
  let def = base;
  const extra: Effect[] = [];
  for (const { extra: more, ...mod } of mods) { def = patchSkill(def, mod); extra.push(...(more ?? [])); }
  return extra.length ? patchSkill(def, { extra }) : def;
}

/** TP this combatant pays for a skill: ceil(tp x (1 - tpCost / 100)), at least 1 for a skill that costs TP at all. */
export function skillCost(c: Combatant, id: string): number {
  const tp = SKILLS[id]?.tp ?? 0;
  if (tp <= 0) return 0;
  // The epsilon keeps a float product such as 9.000000000000002 from costing a point more.
  return Math.max(1, Math.ceil((tp * (100 - (c.x.tpCost ?? 0))) / 100 - 1e-9));
}

const skillIsMelee = (effects: Effect[]) => effects.some((e) => e.kind === 'damage' && e.melee);

function chooseEnemyActions(s: BattleState, rng: Rng): Map<string, EnemyAction> {
  const out = new Map<string, EnemyAction>();
  for (const e of living(s.enemies)) {
    const skills = enemyDef(s, e)?.skills ?? [];
    const index = skills.findIndex((sk) => rng() < sk.chance);
    const melee = index >= 0 ? skillIsMelee(skills[index].effects) : e.melee;
    const target = pickTarget(foePool(s, e, melee), undefined, rng)?.key;
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
      const t = pickTarget(foePool(s, actor, actor.melee), act.target, rng);
      if (!t) return;
      s.log.push({ type: 'act', actor: actor.key, label: '攻擊' });
      physical(t);
      return;
    }
    case 'enemy-skill': {
      const sk = enemyDef(s, actor)!.skills[act.index];
      s.log.push({ type: 'act', actor: actor.key, label: sk.name });
      for (const t of resolveTargets(s, actor, sk.target, act.target, rng, skillIsMelee(sk.effects))) for (const eff of sk.effects) applyEffect(actor, t, eff, ctx);
      return;
    }
    case 'skill': {
      const def = skillFor(actor, act.skill);
      if (!def || def.passive) return;
      const cost = skillCost(actor, act.skill);
      if (actor.tp < cost) { s.log.push({ type: 'no-tp', actor: actor.key }); return; }
      actor.tp -= cost;
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
    const regen = Math.floor(c.x.tpRegen ?? 0);
    if (c.alive && regen > 0 && c.tp < c.max.tp) {
      const before = c.tp;
      c.tp = Math.min(c.max.tp, c.tp + regen);
      s.log.push({ type: 'tp', target: c.key, amount: c.tp - before });
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
  // Enemies do what they announced; one that has no plan (an older state, a fresh arrival) decides now.
  const planned = s.intents ?? {};
  const fresh = chooseEnemyActions(s, rng);
  const enemyActs = new Map([...fresh].map(([k, a]) => [k, planned[k] ?? a]));
  for (const actor of turnOrder([...living(s.party), ...living(s.enemies)], rng)) {
    if (!actor.alive) continue;
    if (actor.sleep > 0) { actor.sleep -= 1; s.log.push({ type: 'asleep', actor: actor.key }); continue; }
    const act = actor.side === 'party' ? actions[actor.key] : enemyActs.get(actor.key);
    if (act) {
      perform(s, actor, act, ctx, rng);
      if (actor.side === 'party' && actor.alive && act.kind !== 'ultimate' && act.kind !== 'escape') actor.limit = Math.min(LIMIT_MAX, actor.limit + gaugeGain(actor, LIMIT_PER_ACTION));
    }
    if (checkOutcome(s)) return s;
  }
  endOfRound(s, ctx, rng);
  if (!checkOutcome(s)) planEnemies(s, rng);
  return s;
}

/** Decide every living enemy's next action now, so it can be shown before the player chooses. */
export function planEnemies(s: BattleState, rng: Rng): void {
  s.intents = Object.fromEntries(chooseEnemyActions(s, rng));
}

/** "攻擊 → 千鶴" or a skill's name with its target, for the battle screen. */
export function intentLabel(s: BattleState, key: string): string {
  const a = s.intents?.[key];
  if (!a) return '';
  const e = s.enemies.find((x) => x.key === key);
  const def = e ? enemyDef(s, e) : undefined;
  const name = a.kind === 'attack' ? '攻擊' : (def?.skills[a.index]?.name ?? '');
  const sk = a.kind === 'enemy-skill' ? def?.skills[a.index] : null;
  const single = a.kind === 'attack' || sk?.target === 'enemy' || sk?.target === 'row' || sk?.target === 'column' || sk?.target === 'cross';
  const who = single && a.target ? s.party.find((c) => c.key === a.target)?.name : null;
  const area = sk?.target === 'enemies' ? '（全體）' : sk?.target === 'row' ? '（整排）' : sk?.target === 'column' ? '（整列）' : sk?.target === 'cross' ? '（十字）' : '';
  return `${name}${area}${who ? ` → ${who}` : ''}`;
}

/**
 * Exp, gold and rolled drops of a won fight. `dropMul` (the run condition's) multiplies how many of each drop that hit
 * comes: the whole part always, the fraction rolled, so 1.5 gives one or two and never rounds down to nothing.
 * The living party's goldFind, matFind and expBonus are each summed and held to 100: gold and exp are raised by their
 * sum and rounded, every drop chance by matFind's.
 */
export function rewards(s: BattleState, rng: Rng, dropBoost: boolean, dropMul = 1): { exp: number; gold: number; drops: Record<string, number> } {
  let exp = 0, gold = 0;
  const drops: Record<string, number> = {};
  const find = (k: SecondaryKey) => Math.min(100, living(s.party).reduce((n, c) => n + (c.x[k] ?? 0), 0));
  const matMul = 1 + find('matFind') / 100;
  for (const e of s.enemies) {
    const d = enemyDef(s, e)!;
    exp += d.exp;
    gold += d.gold;
    for (const drop of d.drops) {
      if (rng() >= Math.min(1, drop.chance * (dropBoost ? 2 : 1) * matMul)) continue;
      const whole = Math.floor(dropMul), part = dropMul - whole;
      const n = whole + (part > 0 && rng() < part ? 1 : 0);
      if (n > 0) drops[drop.mat] = (drops[drop.mat] ?? 0) + n;
    }
  }
  return { exp: Math.round(exp * (1 + find('expBonus') / 100)), gold: Math.round(gold * (1 + find('goldFind') / 100)), drops };
}

export function writeBack(p: Party, s: BattleState): Party {
  const roster = { ...p.roster };
  for (const c of s.party) {
    const id = c.key as CharacterId;
    roster[id] = { ...roster[id], hp: c.alive ? c.hp : 0, tp: c.tp, limit: c.limit };
  }
  return { ...p, roster };
}
