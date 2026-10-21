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
import { afterAction, afterFoe, castCost, castDef, extraAction, initMechs, mechBeforeTicks, mechRoundEnd, payMech, watchAction, type CastDef } from './mechanics/index';
import { AILMENT, ageAilments, shockTick, tickAilments } from './ailments';
import { credit, lossOf, type Ledger } from './ledger';
import { AIM, barrierPower, type Barrier } from './mech';
import type { MoonPhase } from './mechanics/moon';
import { COINS } from './mechanics/coins';
import { payHp } from './mechanics/embers';
import { echoDef, echoOf } from './mechanics/echo';
import { T } from '../data/text.zh-TW';
import { isInnate, keystonesOf, mechKnob, pctMod, skillRank, treeMods, ultimateFor } from './progression';
import { NODES } from '../data/trees';
import { KEYSTONE_VALUES, MEMORY_KEYSTONE_VALUES, type KeystoneId } from '../data/talents';
import type { BuffStat, CharacterId, Effect, Element, EnemyDef, Member, Party, Row, SecondaryKey, SkillDef, Target } from './types';

export type Action =
  | { kind: 'attack'; target: string }
  | { kind: 'skill'; skill: string; target?: string }
  | { kind: 'defend' }
  | { kind: 'item'; item: string; target?: string }
  | { kind: 'escape' }
  | { kind: 'ultimate'; target?: string }
  /**
   * The hero repeats a companion's last skill (engine/mechanics/echo.ts); `rec` is the record the menu showed when he chose
   * it (a later cast that round does not change what he repeats). Without it, the record standing when he acts.
   */
  | { kind: 'echo'; target?: string; rec?: NonNullable<BattleState['echo']> };
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
  /** The barriers over the party (engine/mech.ts); the old roster raises none. */
  barriers?: Barrier[];
  /** The last plain skill a companion cast, for the hero's echo (engine/mechanics/echo.ts): who, in which round, as cast, at what TP. */
  echo?: { by: string; round: number; def: SkillDef; cost: number };
  /** The moon's phase while Selene fights (engine/mechanics/moon.ts), and the rounds a phase is held. */
  moon?: { phase: MoonPhase; hold?: { turns: number } };
}

/** Depth, region, run condition (default plain) and the id of the enemy that comes as an elite (its first occurrence in `enemyIds`). */
export interface BattleScale { depth: number; region: RegionId; elite?: string; condition?: ConditionId }

/**
 * `target` is the drawn one, which the engine plays (a taunt, a challenge or a cover turns it when the blow falls).
 * `shownTarget`, for the screen only: where a challenge or a cover will send it, as things stood when it was planned.
 */
export type EnemyAction = { kind: 'attack'; target?: string; shownTarget?: string } | { kind: 'enemy-skill'; index: number; target?: string; shownTarget?: string };

/** Rounds Scarlet's story fight lasts. */
export const STORY_FIGHT_ROUNDS = 3;
export const LIMIT_MAX = 100;
export const LIMIT_PER_ACTION = 12;
/** Damage taken adds floor(damage / max HP * this), at least 1 (see dealDamage). */
export const LIMIT_PER_HIT_SCALE = 40;

const fresh = () => ({ poison: false, sleep: 0, buffs: [], taunt: 0, defending: false, limit: 0, keystones: [] as KeystoneId[] });

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
  initMechs(s);
  return s;
}

/** By speed, a little shuffled; a foe pinned for `round` (Sylvie's pin) goes last. One draw per combatant either way. */
export function turnOrder(cs: Combatant[], rng: Rng, round = 0): Combatant[] {
  return cs
    .map((c, i) => ({ c, i, k: stat(c, 'spd') * (1 + rng() * 0.25), last: round > 0 && c.delay === round }))
    .sort((a, b) => Number(a.last) - Number(b.last) || b.k - a.k || a.i - b.i)
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

/**
 * Enemies attacking the party are bound by the grid: melee reaches only the front-most standing row; a taunting member is
 * always reachable, and so is `forced` (whom a challenge or a cover sends the blow to, wherever she stands). A veiled
 * member (Rin's veil) is passed over unless everyone in reach is veiled.
 */
function foePool(s: BattleState, actor: Combatant, melee: boolean, forced?: Combatant): Combatant[] {
  if (actor.side !== 'enemy') return s.enemies;
  const reach = reachable(s.party, melee);
  const seen = reach.filter((c) => !c.veil);
  const pool = seen.length ? seen : reach;
  const taunter = living(s.party).find((c) => c.taunt > 0);
  const withTaunter = taunter && !pool.includes(taunter) ? [...pool, taunter] : pool;
  return forced && forced.alive && !withTaunter.includes(forced) ? [...withTaunter, forced] : withTaunter;
}

function resolveTargets(s: BattleState, actor: Combatant, target: Target | null, chosen: string | undefined, rng: Rng, melee = false, forced?: Combatant): Combatant[] {
  const allies = actor.side === 'party' ? s.party : s.enemies;
  const foes = actor.side === 'party' ? s.enemies : s.party;
  switch (target) {
    case 'enemy': { const t = pickTarget(foePool(s, actor, melee, forced), chosen, rng); return t ? [t] : []; }
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
  if (!mods.length) return knobWords(c, base);
  let def = base;
  const extra: Effect[] = [];
  for (const { extra: more, ...mod } of mods) { def = patchSkill(def, mod); extra.push(...(more ?? [])); }
  return knobWords(c, extra.length ? patchSkill(def, { extra }) : def);
}

/**
 * A skill's words that name a number its owner's mechanic node turns: 獵人標記 locks the aim at her cap, which 獵人的耐心
 * raises (plan 8d Task 6 review). Unchanged (the same object) when no such node is held.
 */
function knobWords(c: Pick<Combatant, 'ranks'>, def: SkillDef): SkillDef {
  if (!c.ranks || !def.effects.some((e) => e.kind === 'aim-lock')) return def;
  const cap = mechKnob(c.ranks, def.owner, 'aimCap');
  return cap === undefined ? def : { ...def, desc: def.desc.replace(T.mech.aimFull(AIM.cap), T.mech.aimFull(cap)) };
}

/** TP this combatant pays for a skill: ceil(tp x (1 - tpCost / 100)), at least 1 for a skill that costs TP at all. */
export function skillCost(c: Pick<Combatant, 'x' | 'powers' | 'ranks'>, id: string): number {
  const tp = skillFor(c, id)?.tp ?? 0;
  if (tp <= 0) return 0;
  // The epsilon keeps a float product such as 9.000000000000002 from costing a point more.
  return Math.max(1, Math.ceil((tp * (100 - (c.x.tpCost ?? 0))) / 100 - 1e-9));
}

const skillIsMelee = (effects: Effect[]) => effects.some((e) => e.kind === 'damage' && e.melee);

/** Each living enemy's action for `round` (the one being played, or the next one when planned ahead). */
function chooseEnemyActions(s: BattleState, rng: Rng, round: number): Map<string, EnemyAction> {
  const out = new Map<string, EnemyAction>();
  for (const e of living(s.enemies)) {
    const skills = enemyDef(s, e)?.skills ?? [];
    const index = skills.findIndex((sk) => rng() < sk.chance);
    const melee = index >= 0 ? skillIsMelee(skills[index].effects) : e.melee;
    const target = pickTarget(foePool(s, e, melee), undefined, rng)?.key;
    const act: EnemyAction = index >= 0 ? { kind: 'enemy-skill', index, target } : { kind: 'attack', target };
    // Where a challenge or a cover (a taunt over them included) would send the blow, the screen shows it; the action keeps
    // its drawn target and the redirect is made when the blow falls (forcedTarget in perform). A lone taunt is drawn as
    // the target already, so a plain intent gains no field.
    const ch = e.challenged;
    const challenged = !!ch && ch.round === round && s.party.some((c) => c.key === ch.by && c.alive);
    const covered = living(s.party).some((c) => c.key !== target && c.cover?.ally === target);
    const forced = challenged || covered ? forcedTarget(s, e, act, round) : null;
    out.set(e.key, forced && forced.to.key !== target ? { ...act, shownTarget: forced.to.key } : act);
  }
  return out;
}

/**
 * Where a foe's single blow must go instead of its target (spec §10.3, plan 8c ruling 19), and the others it could have
 * hit instead (for the ledger): a taunt first (its pool: the others in reach), then a challenge (Scarlet's 盾擊, for this
 * round, while the challenger stands; the same pool), then a cover (someone standing in for the target; the pool is the
 * target). Null for an area attack, or when nothing turns the blow. `round` is the round the blow falls in (the next one
 * for an intent planned ahead). Draws nothing.
 */
export function forcedTarget(s: BattleState, enemy: Combatant, act: EnemyAction, round = s.round): { to: Combatant; pool: Combatant[]; cover?: true } | null {
  const sk = act.kind === 'enemy-skill' ? enemyDef(s, enemy)?.skills[act.index] : undefined;
  if (!(act.kind === 'attack' || sk?.target === 'enemy')) return null;
  const melee = act.kind === 'attack' ? enemy.melee : skillIsMelee(sk?.effects ?? []);
  // A veiled member is passed over by single blows, so she is in no pool of what they would have done (plan 8c final).
  const others = (who: Combatant) => reachable(s.party, melee).filter((c) => c !== who && !c.veil);
  const taunter = living(s.party).find((c) => c.taunt > 0);
  if (taunter) return { to: taunter, pool: others(taunter) };
  const ch = enemy.challenged;
  const by = ch && ch.round === round ? s.party.find((c) => c.key === ch.by && c.alive) : undefined;
  if (by) return { to: by, pool: others(by) };
  const meant = s.party.find((c) => c.key === act.target && c.alive);
  // A frozen or sleeping Scarlet stands in for no one (designer ruling, plan 8c final).
  const cover = meant ? living(s.party).find((c) => c !== meant && c.cover?.ally === meant.key && !c.frozen && c.sleep === 0) : undefined;
  if (meant && cover) return { to: cover, pool: [meant], cover: true };
  return null;
}

function checkOutcome(s: BattleState): boolean {
  if (!living(s.enemies).length) s.outcome = 'win';
  else if (!living(s.party).length) s.outcome = 'lose';
  return s.outcome !== 'ongoing';
}

/**
 * Carries out one action; returns what it cast: the skill as its mechanics rewrote it, or the ultimate, when one really was
 * cast; null for anything else (an attack, defending, an item, a turn lost to TP or the gauge).
 */
function perform(s: BattleState, actor: Combatant, act: Action | EnemyAction, ctx: EffectContext, rng: Rng): CastDef | null {
  delete ctx.lastHit;   // burn and bleed ride only on a hit of this action
  delete ctx.paid;
  let sentTo: Combatant | undefined;   // a challenger or a cover is reached wherever she stands
  if (actor.side === 'enemy') {
    // A single blow goes where a taunt, a challenge or a cover sends it (forcedTarget); the ledger credits the one it
    // went to with what the others in `pool` would have lost (plan 8c rulings 8, 19). An area attack follows a taunt only,
    // centred on the taunter. Reading the grid draws nothing.
    const forced = forcedTarget(s, actor, act as EnemyAction);
    const taunter = living(s.party).find((c) => c.taunt > 0);
    if (forced) {
      if (ctx.ledger) ctx.redirect = forced.cover ? { pool: forced.pool, cover: true } : { pool: forced.pool };
      act = { ...act, target: forced.to.key } as EnemyAction;
      sentTo = forced.to;
    } else if (taunter) act = { ...act, target: taunter.key } as EnemyAction;
  }
  const physical = (t: Combatant) =>
    applyEffect(actor, t, { kind: 'damage', power: 100, element: 'phys', scale: actor.attackScale ?? 'atk', melee: actor.melee }, ctx);
  switch (act.kind) {
    case 'attack': {
      const t = pickTarget(foePool(s, actor, actor.melee, sentTo), act.target, rng);
      if (!t) return null;
      s.log.push({ type: 'act', actor: actor.key, label: '攻擊' });
      physical(t);
      return null;
    }
    case 'enemy-skill': {
      const sk = enemyDef(s, actor)!.skills[act.index];
      s.log.push({ type: 'act', actor: actor.key, label: sk.name });
      for (const t of resolveTargets(s, actor, sk.target, act.target, rng, skillIsMelee(sk.effects), sentTo)) for (const eff of sk.effects) applyEffect(actor, t, eff, ctx);
      return null;
    }
    case 'skill': {
      // A member casts only what their tree has learned (a whole rank of the skill's own node, read as progression reads
      // a tree) or knows innately (Rin's mark); a combatant without ranks (tests) casts anything. The lost turn is logged,
      // as one short of TP is.
      if (actor.ranks && skillRank(actor.ranks, act.skill) === 0 && !isInnate(actor.defId, act.skill)) { s.log.push({ type: 'no-skill', actor: actor.key }); return null; }
      let def = skillFor(actor, act.skill);
      if (!def || def.passive) return null;
      // The abyss capstones grow with the fight's depth, after the tree and the worn powers have had their say.
      const bonus = def.abyss && s.abyss ? pctMod(def.id, 100 + s.abyss) : undefined;
      if (bonus) def = patchSkill(def, bonus);
      // Then the caster's mechanic (Noel's heat): the skill as she casts it now, at the TP she pays now.
      def = castDef(s, actor, def);
      const cost = castCost(s, actor, act.skill);
      if (actor.tp < cost) { s.log.push({ type: 'no-tp', actor: actor.key }); return null; }
      actor.tp -= cost;
      ctx.paid = cost;
      payHp(actor, def);
      payMech(s, actor, def, ctx);
      s.log.push({ type: 'act', actor: actor.key, label: def.name });
      ctx.cast = def.id;   // a barrier remembers the skill that raised it
      if (def.effects.some((e) => e.kind === 'damage' && e.scatter)) scatterCast(s, actor, def, act.target, ctx, rng);
      else for (const t of resolveTargets(s, actor, def.target, act.target, rng)) for (const eff of def.effects) applyEffect(actor, t, eff, ctx);
      delete ctx.cast;
      return def;
    }
    case 'item': {
      const def = ITEMS[act.item];
      if (!def || !def.battle || (s.inventory[act.item] ?? 0) <= 0) return null;
      s.inventory[act.item] -= 1;
      s.log.push({ type: 'act', actor: actor.key, label: def.name });
      for (const t of resolveTargets(s, actor, def.target, act.target, rng)) for (const eff of def.effects) applyEffect(actor, t, eff, ctx);
      return null;
    }
    case 'defend':
      s.log.push({ type: 'act', actor: actor.key, label: '防禦' });
      return null;
    case 'echo': {
      // The hero only: a companion's last plain skill, this round's or the last's, at 70% for the TP she paid.
      const rec = actor.defId === 'hero' ? (act.rec ?? echoOf(s)) : null;
      if (!rec) return null;
      if (actor.tp < rec.cost) { s.log.push({ type: 'no-tp', actor: actor.key }); return null; }
      actor.tp -= rec.cost;
      const def = echoDef(rec);
      s.log.push({ type: 'act', actor: actor.key, label: T.cmd.echoAct(def.name) });
      if (def.effects.some((e) => e.kind === 'damage' && e.scatter)) scatterCast(s, actor, def, act.target, ctx, rng);
      else for (const t of resolveTargets(s, actor, def.target, act.target, rng)) for (const eff of def.effects) applyEffect(actor, t, eff, ctx);
      return null;
    }
    case 'escape':
      return null;
    case 'ultimate': {
      const u = ultimateFor(actor.defId as CharacterId, actor.ranks, actor);
      if (!u) return null;
      if (actor.limit < LIMIT_MAX) { s.log.push({ type: 'no-limit', actor: actor.key }); return null; }
      actor.limit = 0;
      s.log.push({ type: 'act', actor: actor.key, label: u.name, ultimate: u.id });
      const targets = resolveTargets(s, actor, u.target, act.target, rng);
      for (const t of targets) for (const eff of u.effects) applyEffect(actor, t, eff, ctx);
      if (u.refundOnKill !== undefined && targets.length === 1 && !targets[0].alive) actor.limit = (LIMIT_MAX * u.refundOnKill) / 100;
      if (u.follow) {
        const who = u.follow.who === 'hero' ? living(s.party).filter((c) => c.key === 'hero') : living(s.party);
        for (const t of who) for (const eff of u.follow.effects) applyEffect(actor, t, eff, ctx);
      }
      return u;
    }
  }
}


/**
 * A skill with a scatter hit (散射, 一擲千金): its effects in order; a scatter damage effect throws each of its hits at a
 * living foe the fight's `pick` chooses (stopping when none stands), any other effect goes to the skill's own targets.
 */
function scatterCast(s: BattleState, actor: Combatant, def: SkillDef, chosen: string | undefined, ctx: EffectContext, rng: Rng): void {
  const targets = def.effects.some((e) => !(e.kind === 'damage' && e.scatter)) ? resolveTargets(s, actor, def.target, chosen, rng) : [];
  for (const eff of def.effects) {
    if (eff.kind === 'damage' && eff.scatter) {
      for (let i = 0; i < (eff.hits ?? 1); i++) {
        const foes = living(actor.side === 'party' ? s.enemies : s.party);
        if (!foes.length) break;
        const { scatter: _drop, ...one } = eff;
        applyEffect(actor, pick(rng, foes), { ...one, hits: 1 }, ctx);
      }
    } else for (const t of targets) applyEffect(actor, t, eff, ctx);
  }
}

function endOfRound(s: BattleState, ctx: EffectContext, rng: Rng): void {
  // The mechanics open the round's end before any tick (the purifying barrier heals and cures first).
  // (Bobby's devices run here too, as the old turret did: engine/mechanics/devices.ts.)
  mechBeforeTicks(s, ctx, rng);
  for (const c of [...s.party, ...s.enemies]) {
    if (c.alive && c.poison) {
      const amount = shockTick(c, Math.max(1, Math.floor(c.max.hp * 0.1)));
      if (c.side === 'enemy') credit(ctx.ledger, c.poisonSrc, 'damage', lossOf(c, amount));
      s.log.push({ type: 'poison-tick', target: c.key, amount: dealDamage(c, amount, { dot: true, ledger: ctx.ledger, log: s.log }) });
      if (!c.alive) s.log.push({ type: 'ko', target: c.key });
    }
    if (c.alive) tickAilments(c, ctx);
    if (c.alive && c.keystones.includes('regen')) {
      const amount = Math.min(c.max.hp - c.hp, Math.floor((c.max.hp * KEYSTONE_VALUES.regenPct) / 100));
      if (amount > 0) {
        c.hp += amount;
        if (c.side === 'party') credit(ctx.ledger, c.key, 'healing', amount);
        s.log.push({ type: 'heal', target: c.key, amount });
      }
    }
    const regen = Math.floor(c.x.tpRegen ?? 0);
    if (c.alive && regen > 0 && c.tp < c.max.tp) {
      const before = c.tp;
      c.tp = Math.min(c.max.tp, c.tp + regen);
      s.log.push({ type: 'tp', target: c.key, amount: c.tp - before, regen: true });
    }
    c.buffs = c.buffs.map((b) => ({ ...b, turns: b.turns - 1 })).filter((b) => b.turns > 0);
    ageAilments(c);
    c.taunt = Math.max(0, c.taunt - 1);
    c.defending = false;
  }
  // The mechanics close the round last, after every tick (a foe a tick felled has already lost its mark).
  mechRoundEnd(s, ctx, rng);
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
  // An action like any other for the mechanics (her veil ends with it).
  if (ctx.battle) afterAction(ctx.battle, rin, { kind: 'attack', target: foe.key }, null, ctx);
}

/**
 * The guard barrier on the party, mirrored as each living member's `ward` (plan 8c ruling 9): its percent (mech
 * barrierPower: power x boost, x the 重結界 percent when it is the later of two kinds; only one guard ever stands), to def
 * and res, with who raised it; the fallen and a party without a guard barrier carry none. Not a buff: it takes no buff slot
 * and never meets the strongest-kept rule. Draws nothing.
 */
export function syncWards(s: BattleState): void {
  const guard = (s.barriers ?? []).find((b) => b.kind === 'guard');
  const pct = guard ? barrierPower(guard) : 0;
  for (const c of s.party) {
    if (guard && c.alive) c.ward = { def: pct, res: pct, src: guard.src };
    else delete c.ward;
  }
}

/** `ledger` (the sim's, spec §12.6) is credited as the round resolves; it changes nothing and draws nothing. */
export function resolveRound(prev: BattleState, actions: Record<string, Action>, rng: Rng, ledger?: Ledger): BattleState {
  const s = structuredClone(prev);
  s.log = [];
  if (s.outcome !== 'ongoing' || checkOutcome(s)) return s;
  s.round += 1;
  syncWards(s);   // a state built or loaded with barriers meets its first hit with the wards on
  const ctx: EffectContext = { rng, itemBoost: s.itemBoost, revealed: s.revealed, log: s.log, battle: s, ...(ledger ? { ledger } : {}) };
  for (const c of s.party) c.defending = c.alive && actions[c.key]?.kind === 'defend';
  if (s.party.some((c) => c.alive && actions[c.key]?.kind === 'escape')) {
    const success = !s.boss && rng() < escapeChance(s);
    s.log.push({ type: 'escape', success });
    if (success) { s.outcome = 'fled'; return s; }
  }
  // Enemies do what they announced; one that has no plan (an older state, a fresh arrival) decides now.
  const planned = s.intents ?? {};
  const fresh = chooseEnemyActions(s, rng, s.round);
  const enemyActs = new Map([...fresh].map(([k, a]) => [k, planned[k] ?? a]));
  for (const actor of turnOrder([...living(s.party), ...living(s.enemies)], rng, s.round)) {
    if (!actor.alive) continue;
    // A frozen turn is lost before sleep is looked at (sleep keeps its rounds); it thaws and is guarded for a while.
    if (actor.frozen) { delete actor.frozen; actor.freezeGuard = AILMENT.freezeGuard; s.log.push({ type: 'frozen', actor: actor.key }); continue; }
    if (actor.sleep > 0) { actor.sleep -= 1; s.log.push({ type: 'asleep', actor: actor.key }); continue; }
    const act = actor.side === 'party' ? actions[actor.key] : enemyActs.get(actor.key);
    const heroUp = s.party.some((c) => c.key === 'hero' && c.alive);
    if (act) {
      // What the mechanics need to see before the action (Rin's living marks: a felled foe leaves them at once).
      const seen = actor.side === 'party' ? watchAction(s, actor) : [];
      const from = s.log.length;
      // Who could not stir as the foe's blow fell (a hit wakes a sleeper, so it is read before).
      const idle = actor.side === 'enemy' ? s.party.filter((c) => c.frozen || c.sleep > 0).map((c) => c.key) : [];
      const def = perform(s, actor, act, ctx, rng);
      delete ctx.redirect;
      // What the foe's action set off on the party (Scarlet's 贖火 counter); that sets off nothing more.
      if (actor.side === 'enemy') afterFoe(s, actor, ctx, from, idle);
      if (actor.side === 'party' && actor.alive && act.kind !== 'ultimate' && act.kind !== 'escape') actor.limit = Math.min(LIMIT_MAX, actor.limit + gaugeGain(actor, LIMIT_PER_ACTION));
      if (actor.side === 'party') {
        const own = act as Action;
        afterAction(s, actor, own, def, ctx);
        // A mechanic may grant more actions at once (Rin's 還有。, and with 追命 one after another); they fill no gauge.
        let again = extraAction(s, actor, own, ctx, seen);
        while (again) {
          const seen2 = watchAction(s, actor);
          const def2 = perform(s, actor, again, ctx, rng);
          delete ctx.redirect;
          afterAction(s, actor, again, def2, ctx);
          again = extraAction(s, actor, again, ctx, seen2);
        }
      }
    }
    ringBell(s, heroUp, ctx);
    syncWards(s);
    if (checkOutcome(s)) return s;
  }
  const heroUp = s.party.some((c) => c.key === 'hero' && c.alive);
  endOfRound(s, ctx, rng);
  ringBell(s, heroUp, ctx);
  syncWards(s);
  if (!checkOutcome(s) && s.survive && s.round >= s.survive) {
    s.outcome = 'win';
    s.log.push({ type: 'survived' });
  }
  if (s.outcome === 'ongoing') planEnemies(s, rng);
  return s;
}

/** Decide every living enemy's next action now, so it can be shown before the player chooses. */
export function planEnemies(s: BattleState, rng: Rng): void {
  s.intents = Object.fromEntries(chooseEnemyActions(s, rng, s.round + 1));
}

/** "攻擊 → 千鶴" or a skill's name with its target, for the battle screen. */
export function intentLabel(s: BattleState, key: string): string {
  const a = s.intents?.[key];
  if (!a) return '';
  const e = s.enemies.find((x) => x.key === key);
  if (e?.frozen) return '凍結中';   // it will lose this turn (its plan is still drawn, so the sequence holds)
  const def = e ? enemyDef(s, e) : undefined;
  const name = a.kind === 'attack' ? '攻擊' : (def?.skills[a.index]?.name ?? '');
  const sk = a.kind === 'enemy-skill' ? def?.skills[a.index] : null;
  const single = a.kind === 'attack' || sk?.target === 'enemy' || sk?.target === 'row' || sk?.target === 'column' || sk?.target === 'cross';
  const shown = a.shownTarget ?? a.target;
  const who = single && shown ? s.party.find((c) => c.key === shown)?.name : null;
  const area = sk?.target === 'enemies' ? '（全體）' : sk?.target === 'row' ? '（整排）' : sk?.target === 'column' ? '（整列）' : sk?.target === 'cross' ? '（十字）' : '';
  return `${name}${area}${who ? ` → ${who}` : ''}`;
}

/**
 * Exp, gold and rolled drops of a won fight. `dropMul` (the run condition's) multiplies how many of each drop that hit
 * comes: the whole part always, the fraction rolled, so 1.5 gives one or two and never rounds down to nothing.
 * The living party's goldFind, matFind and expBonus are each summed and held to 100: gold and exp are raised by their
 * sum and rounded, every drop chance by matFind's.
 */
export function rewards(s: BattleState, rng: Rng, dropBoost: boolean, dropMul = 1): { exp: number; gold: number; drops: Record<string, number>; coinGold: number } {
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
  // Liz's coins left at a won fight's end become gold (plan 8c ruling 21); no draw.
  const coinGold = s.outcome === 'win' ? s.party.reduce((n, c) => n + (c.mech?.kind === 'coins' ? c.mech.coins * COINS.gold : 0), 0) : 0;
  return { exp: Math.round(exp * (1 + find('expBonus') / 100)), gold: Math.round(gold * (1 + find('goldFind') / 100)) + coinGold, drops, coinGold };
}

export function writeBack(p: Party, s: BattleState): Party {
  const roster = { ...p.roster };
  for (const c of s.party) {
    const id = c.key as CharacterId;
    roster[id] = { ...roster[id], hp: c.alive ? c.hp : 0, tp: c.tp, limit: c.limit };
  }
  return { ...p, roster };
}
