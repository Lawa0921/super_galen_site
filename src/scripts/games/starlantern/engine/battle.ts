import { reachable, rowOfCell, shapeTargets } from './formation';
import { CHARACTERS, artIdOf } from '../data/characters';
import { CONDITIONS, type ConditionId } from '../data/conditions';
import { ENEMIES } from '../data/enemies';
import { REGIONS, type RegionId } from '../data/regions';
import { ITEMS } from '../data/items';
import { POWERS } from '../data/gear';
import { WEAPON_KINDS, WEAPON_MASTERY_PCT, weaponKindOf } from '../data/equipment';
import { SKILLS } from '../data/skills';
import { addBuff, stat, dealDamage, gaugeGain, type BattleEvent, type Combatant } from './combatant';
import { activeIds, hasPassive, powersOf, sheetOf, statsOf } from './party';
import { pick, type Rng } from './rng';
import { abyssPct, bossPartyScale, deepPower, empower, enemyLevelAt, groupCap, homeLevel, mul, partyScale, regionTint, scaleEnemy } from './scaling';
import { SECONDARY_KEYS } from './stats';
import { applyEffect, patchSkill, type EffectContext } from './skills';
import { keystonesOf, pctMod, skillRank, treeMods, ultimateFor } from './progression';
import { NODES } from '../data/trees';
import { KEYSTONE_VALUES, MEMORY_KEYSTONE_VALUES, type KeystoneId } from '../data/talents';
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
  /** The abyss capstones' bonus in percent for this fight (fixed at createBattle); absent reads as 0. */
  abyss?: number;
  /** The party-size multiplier applied to every enemy's hp, atk and mag; absent when it is 1 (a full party). */
  partyScale?: number;
  /** Rounds the party must last for a win (a story fight); absent in a plain fight. */
  survive?: number;
}

/** Depth, region, run condition (default plain) and the id of the enemy that comes as an elite (its first occurrence in `enemyIds`). */
export interface BattleScale { depth: number; region: RegionId; elite?: string; condition?: ConditionId }

export type EnemyAction = { kind: 'attack'; target?: string } | { kind: 'enemy-skill'; index: number; target?: string };

/** Rounds Scarlet's story fight lasts. */
export const STORY_FIGHT_ROUNDS = 3;
export const LIMIT_MAX = 100;
export const LIMIT_PER_ACTION = 12;
/** Damage taken adds floor(damage / max HP * this), at least 1 (see dealDamage). */
export const LIMIT_PER_HIT_SCALE = 40;

const fresh = () => ({ poison: false, sleep: 0, buffs: [], taunt: 0, turret: null, defending: false, limit: 0, keystones: [] as KeystoneId[] });

export function fromMember(m: Member, cell: number): Combatant {
  const row: Row = rowOfCell(cell);
  const def = CHARACTERS[m.id];
  const sheet = sheetOf(m);
  // Only the non-zero secondaries are carried; a missing key reads as 0.
  const x: Partial<Record<SecondaryKey, number>> = {};
  for (const k of SECONDARY_KEYS) if (sheet[k]) x[k] = sheet[k];
  // Only a weapon master (the hero) follows his weapon; a companion keeps its character's `melee` and the plain ATK attack.
  const kind = def.weaponMaster ? weaponKindOf(m.equip.weapon) : undefined;
  const wk = kind ? WEAPON_KINDS[kind] : undefined;
  const c: Combatant = { ...fresh(), key: m.id, side: 'party', defId: m.id, name: def.name, max: statsOf(m), hp: m.hp, tp: m.tp,
    row, cell, melee: wk ? wk.melee : def.melee, ...(def.weaponMaster ? { attackScale: wk ? wk.scale : 'atk' as const } : {}),
    ...(kind ? { weaponKind: kind } : {}), weak: [], resist: [], boss: false, alive: m.hp > 0, limit: m.limit ?? 0,
    x, level: m.level, powers: powersOf(m), ranks: { ...m.tree }, keystones: keystonesOf(m),
    ...(m.memories !== undefined ? { memories: m.memories } : {}), ...(m.oath ? { oath: true as const } : {}), ...(m.oath ? { artId: artIdOf(m) } : {}) };
  // Memory keystones that are plain secondaries (added once, here; absent keystones leave x as it was).
  if (c.keystones.includes('teachers-gift')) c.x.tpCost = (c.x.tpCost ?? 0) + MEMORY_KEYSTONE_VALUES.tpCostPct;
  if (c.keystones.includes('fathers-face')) c.x.matFind = (c.x.matFind ?? 0) + MEMORY_KEYSTONE_VALUES.matFind;
  return c;
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
  /** The depth of a fight that has no `scale` (the story boss of a dungeon's third floor); default `scale.depth`, else 1. */
  depth?: number;
  /** The abyss bonus in percent, only to force it (simulations); default is `abyssPct(depth)`, computed here and in engine/field.ts for casts outside battle, from the same `abyssPct(depth)`. */
  abyss?: number;
  /** Run-long altar bonuses: percent added to the party's max stats for this whole battle (summed per stat). */
  altar?: { stat: BuffStat; pct: number }[];
  /** Enemies allowed beyond the party-size group cap (a rescue fight passes 1). */
  extra?: number;
  /** A survive fight: it is won after this many rounds, and nobody in it (the party and any undying foe) falls. */
  survive?: number;
  /** Another name for an enemy, by its id, in this fight only (the finale's boss). */
  names?: Record<string, string>;
  /** A multiplier on every enemy's hp, atk and mag, applied after the party-size scale; default 1. */
  bossPower?: number;
}): BattleState {
  const party: Combatant[] = [];
  o.party.grid.forEach((id, cell) => { if (id) party.push(fromMember(o.party.roster[id], cell)); });
  const altar = new Map<BuffStat, number>();
  for (const b of o.altar ?? []) altar.set(b.stat, (altar.get(b.stat) ?? 0) + b.pct);
  for (const c of party) for (const [k, pct] of altar) c.max[k] = Math.floor(c.max[k] * (1 + pct / 100));
  // opening-gauge is a floor, not a gain: the gauge carries over between fights, so adding would stack fight after fight.
  for (const c of party) if (c.keystones.includes('opening-gauge')) c.limit = Math.min(LIMIT_MAX, Math.max(c.limit, KEYSTONE_VALUES.openingGauge));
  // small-shrine: one holder guards the whole party for the first turns of the fight.
  const shrine = party.find((c) => c.keystones.includes('small-shrine'));
  if (shrine) {
    for (const c of party) addBuff(c, { stat: 'def', pct: MEMORY_KEYSTONE_VALUES.shrineDefPct, turns: MEMORY_KEYSTONE_VALUES.shrineTurns, src: shrine.key });
  }
  const depth = o.depth ?? o.scale?.depth ?? 1;
  const size = activeIds(o.party).length;
  const k = o.boss ? bossPartyScale(size) : partyScale(size);
  const enemyIds = o.boss ? o.enemyIds : o.enemyIds.slice(0, groupCap(size, depth) + (o.extra ?? 0));
  const counts: Record<string, number> = {};
  for (const id of enemyIds) counts[id] = (counts[id] ?? 0) + 1;
  const seen: Record<string, number> = {};
  const sc = o.scale;
  const region = sc ? REGIONS[sc.region] : null;
  const defs: Record<string, EnemyDef> = {};
  const enemies = enemyIds.map((id, i) => {
    const n = (seen[id] = (seen[id] ?? 0) + 1);
    const elite = !!sc && sc.elite === id && n === 1;
    const met = sc && region ? scaleEnemy(ENEMIES[id], sc.depth, region, elite, CONDITIONS[sc.condition ?? 'plain']) : ENEMIES[id];
    // An enemy is met at its level for the fight's depth (enemyLevelAt; the deep road's own extra power on top), or at
    // its own home level when the fight has no scale.
    const level = sc ? enemyLevelAt(sc.depth) : homeLevel(met);
    const empowered = empower(met, level);
    const power = k * (o.bossPower ?? 1) * (sc ? deepPower(sc.depth) : 1);
    const scaled = power === 1 ? empowered : { ...empowered, stats: mul(empowered.stats, { hp: power, atk: power, mag: power }) };
    const d = o.names?.[id] ? { ...scaled, name: o.names[id] } : scaled;
    defs[`e${i}`] = d;
    const name = counts[id] > 1 ? `${d.name} ${String.fromCharCode(64 + n)}` : d.name;
    return fromEnemy(d, `e${i}`, name, elite ? 'elite' : region ? regionTint(region) : undefined, level);
  });
  const s: BattleState = {
    round: 0, party, enemies, boss: !!o.boss, inventory: { ...o.inventory }, revealed: structuredClone(o.revealed),
    itemBoost: hasPassive(o.party, 'itemBoost'), log: [], outcome: 'ongoing',
  };
  if (sc) s.enemyDefs = defs;
  if (o.survive) {
    s.survive = o.survive;
    for (const c of party) c.undying = true;
    for (const c of enemies) if (ENEMIES[c.defId]?.undying) c.undying = true;
  }
  if (k !== 1) s.partyScale = k;
  s.abyss = o.abyss ?? abyssPct(depth);
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
 * A skill as this combatant casts it: the tree's rank, then its mod nodes (stacked into one), then the hero's weapon
 * mastery, then every worn power that names it in the order worn; added effects (`extra`) last. The order is stated in engine/skills.ts `patchSkill`.
 * With nothing to rewrite it is `SKILLS[id]` itself. An unknown id is undefined.
 */
export function skillFor(c: Pick<Combatant, 'powers' | 'ranks' | 'weaponKind'>, id: string): SkillDef | undefined {
  const base = SKILLS[id];
  if (!base) return base;
  // The tree's two stages (the active's own rank, then its mod nodes stacked into one) come from progression.treeMods only.
  const powers = (c.powers ?? []).map((p) => POWERS[p]).filter((p) => p && p.skill === id).map((p) => p.mod);
  const info = NODES[id];
  const mastered = c.weaponKind && info?.owner === 'hero' && WEAPON_KINDS[c.weaponKind].mastery.includes(info.branch)
    ? pctMod(id, 100 + WEAPON_MASTERY_PCT) : undefined;
  const mods = [...(c.ranks ? treeMods(c.ranks, id) : []), ...(mastered ? [mastered] : []), ...powers];
  if (!mods.length) return base;
  let def = base;
  const extra: Effect[] = [];
  for (const { extra: more, ...mod } of mods) { def = patchSkill(def, mod); extra.push(...(more ?? [])); }
  return extra.length ? patchSkill(def, { extra }) : def;
}

/** TP this combatant pays for a skill: ceil(tp x (1 - tpCost / 100)), at least 1 for a skill that costs TP at all. */
export function skillCost(c: Pick<Combatant, 'x' | 'powers' | 'ranks'>, id: string): number {
  const tp = skillFor(c, id)?.tp ?? 0;
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
    applyEffect(actor, t, { kind: 'damage', power: 100, element: 'phys', scale: actor.attackScale ?? 'atk', melee: actor.melee }, ctx);
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
      // A member casts only what their tree has learned (a whole rank of the skill's own node, read as progression reads
      // a tree); a combatant without ranks (tests) casts anything. The lost turn is logged, as one short of TP is.
      if (actor.ranks && skillRank(actor.ranks, act.skill) === 0) { s.log.push({ type: 'no-skill', actor: actor.key }); return; }
      let def = skillFor(actor, act.skill);
      if (!def || def.passive) return;
      // The abyss capstones grow with the fight's depth, after the tree and the worn powers have had their say.
      const bonus = def.abyss && s.abyss ? pctMod(def.id, 100 + s.abyss) : undefined;
      if (bonus) def = patchSkill(def, bonus);
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
      const u = ultimateFor(actor.defId as CharacterId, actor.ranks, actor);
      if (!u) return;
      if (actor.limit < LIMIT_MAX) { s.log.push({ type: 'no-limit', actor: actor.key }); return; }
      actor.limit = 0;
      s.log.push({ type: 'act', actor: actor.key, label: u.name, ultimate: u.id });
      const targets = resolveTargets(s, actor, u.target, act.target, rng);
      for (const t of targets) for (const eff of u.effects) applyEffect(actor, t, eff, ctx);
      if (u.refundOnKill !== undefined && targets.length === 1 && !targets[0].alive) actor.limit = (LIMIT_MAX * u.refundOnKill) / 100;
      if (u.follow) {
        const who = u.follow.who === 'hero' ? living(s.party).filter((c) => c.key === 'hero') : living(s.party);
        for (const t of who) for (const eff of u.follow.effects) applyEffect(actor, t, eff, ctx);
      }
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
      const power = c.keystones.includes('blueprint') ? Math.round((c.turret.power * (100 + MEMORY_KEYSTONE_VALUES.turretPct)) / 100) : c.turret.power;
      applyEffect(c, t, { kind: 'damage', power, element: 'phys', scale: 'mag', melee: false }, ctx);
    }
    c.turret = c.turret.turns > 1 ? { ...c.turret, turns: c.turret.turns - 1 } : null;
  }
  for (const c of [...s.party, ...s.enemies]) {
    if (c.alive && c.poison) {
      const amount = Math.max(1, Math.floor(c.max.hp * 0.1));
      s.log.push({ type: 'poison-tick', target: c.key, amount: dealDamage(c, amount) });
      if (!c.alive) s.log.push({ type: 'ko', target: c.key });
    }
    if (c.alive && c.keystones.includes('regen')) {
      const amount = Math.min(c.max.hp - c.hp, Math.floor((c.max.hp * KEYSTONE_VALUES.regenPct) / 100));
      if (amount > 0) { c.hp += amount; s.log.push({ type: 'heal', target: c.key, amount }); }
    }
    const regen = Math.floor(c.x.tpRegen ?? 0);
    if (c.alive && regen > 0 && c.tp < c.max.tp) {
      const before = c.tp;
      c.tp = Math.min(c.max.tp, c.tp + regen);
      s.log.push({ type: 'tp', target: c.key, amount: c.tp - before, regen: true });
    }
    c.buffs = c.buffs.map((b) => ({ ...b, turns: b.turns - 1 })).filter((b) => b.turns > 0);
    c.taunt = Math.max(0, c.taunt - 1);
    c.defending = false;
  }
}

/**
 * unrung-bell: when the hero has just gone from standing to down and Rin stands holding it, she gets atk for bellTurns and
 * strikes the first living enemy once (a plain attack). Called after every action and after the round's end, so each fall
 * answers once. No draws of its own beyond the attack's.
 */
function ringBell(s: BattleState, heroWasUp: boolean, ctx: EffectContext): void {
  if (!heroWasUp || s.party.find((c) => c.key === 'hero')?.alive !== false) return;
  const rin = s.party.find((c) => c.key === 'rin');
  if (!rin?.alive || !rin.keystones.includes('unrung-bell')) return;
  const foe = living(s.enemies)[0];
  if (!foe) return;
  addBuff(rin, { stat: 'atk', pct: MEMORY_KEYSTONE_VALUES.bellAtkPct, turns: MEMORY_KEYSTONE_VALUES.bellTurns, src: rin.key });
  s.log.push({ type: 'buff', target: rin.key, stat: 'atk', pct: MEMORY_KEYSTONE_VALUES.bellAtkPct });
  s.log.push({ type: 'act', actor: rin.key, label: '攻擊' });
  applyEffect(rin, foe, { kind: 'damage', power: 100, element: 'phys', scale: rin.attackScale ?? 'atk', melee: rin.melee }, ctx);
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
    const heroUp = s.party.some((c) => c.key === 'hero' && c.alive);
    if (act) {
      perform(s, actor, act, ctx, rng);
      if (actor.side === 'party' && actor.alive && act.kind !== 'ultimate' && act.kind !== 'escape') actor.limit = Math.min(LIMIT_MAX, actor.limit + gaugeGain(actor, LIMIT_PER_ACTION));
    }
    ringBell(s, heroUp, ctx);
    if (checkOutcome(s)) return s;
  }
  const heroUp = s.party.some((c) => c.key === 'hero' && c.alive);
  endOfRound(s, ctx, rng);
  ringBell(s, heroUp, ctx);
  if (!checkOutcome(s) && s.survive && s.round >= s.survive) {
    s.outcome = 'win';
    s.log.push({ type: 'survived' });
  }
  if (s.outcome === 'ongoing') planEnemies(s, rng);
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
    if (s.survive && e.alive) continue;   // a survive fight pays only for the foes knocked out
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
