import { reachable, rowOfCell, shapeTargets } from './formation';
import { CHARACTERS, artIdOf } from '../data/characters';
import { CONDITIONS, type ConditionId } from '../data/conditions';
import { ENEMIES } from '../data/enemies';
import { REGIONS, type RegionId } from '../data/regions';
import { tierOf } from '../data/difficulty';
import type { AffixId } from '../data/affixes';
import { ITEMS } from '../data/items';
import { POWERS } from '../data/gear';
import { WEAPON_KINDS, WEAPON_MASTERY_PCT, weaponKindOf } from '../data/equipment';
import { SKILLS } from '../data/skills';
import { addBuff, stat, dealDamage, gaugeGain, type BattleEvent, type Combatant } from './combatant';
import { activeIds, hasPassive, powersOf, sheetOf, statsOf } from './party';
import { pick, type Rng } from './rng';
import { abyssPct, bossPartyScale, deepPower, empower, enemyLevelAt, groupCap, homeLevel, mul, partyScale, regionTint, scaleEnemy } from './scaling';
import { SECONDARY_KEYS } from './stats';
import { applyEffect, patchSkill, pctOf, type EffectContext } from './skills';
import { afterAction, afterFoe, castCost, castDef, extraAction, initMechs, mechBeforeTicks, mechRoundEnd, payMech, watchAction, type CastDef } from './mechanics/index';
import { AILMENT, ageAilments, shockTick, tickAilments } from './ailments';
import { foeGuard, foesRoundEnd, foesRoundStart, guardTargets, huntedIn, openWith, returnedGold, wakeUp } from './foes';
import { countCast, credit, lossOf, type Ledger } from './ledger';
import { AIM, barrierPower, type Barrier } from './mech';
import type { MoonPhase } from './mechanics/moon';
import { COINS } from './mechanics/coins';
import { payHp } from './mechanics/embers';
import { echoDef, echoOf } from './mechanics/echo';
import { applyLasting, runTriggers } from './mechanics/runes';
import { T } from '../data/text.zh-TW';
import { RUNE_NUMBERS, type RuneRef } from '../data/runes';
import { applyRunes, bounceNext, runeStates, type RuneMiss } from './runes';
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
  /**
   * Roster plan B3 (M13): the run pack's gold a thief can take, and the depth that caps each theft; set by the game only for
   * a fight with a thief in it (game.ts writes `gold` back to the pack each round). The sim has none: nothing is taken.
   */
  purse?: { gold: number; depth: number };
  /** The barriers over the party (engine/mech.ts); the old roster raises none. */
  barriers?: Barrier[];
  /** The last plain skill a companion cast, for the hero's echo (engine/mechanics/echo.ts): who, in which round, as cast, at what TP. */
  /** `dropped`: a variant's mechanic extras were left out of `def` (挑釁・高喊's embers; 8d final review). */
  echo?: { by: string; round: number; def: SkillDef; cost: number; dropped?: true };
  /** The moon's phase while Selene fights (engine/mechanics/moon.ts), and the rounds a phase is held. */
  moon?: { phase: MoonPhase; hold?: { turns: number } };
  /** Safira's 雙人舞 after her finale (plan 8d): the next ally's damage skill this round is `pct`% stronger (beat.ts). */
  duet?: { pct: number; by: string };
  /** 同步 (plan 8e): the next other ally's skill this round is `pct`% stronger (engine/mechanics/runes.ts). */
  sync?: { pct: number; by: string };
  /** 回聲 (plan 8e): each strikes `target` with `effects` at the end of `round`, its caster and its foe still standing. */
  /** `tpLeft`: the 回氣 its cast had still not given back, all its hits may give (plan 8h ruling 11c). */
  reprises?: { by: string; target: string; round: number; name: string; effects: Effect[]; tpLeft?: number }[];
  /** Trigger runes set off in this action, cast after it (plan 8e Task 6; engine/mechanics/runes.ts runTriggers). */
  triggers?: { by: string; skill: string; on: 'crit' | 'kill' | 'struck'; foe: string }[];
}

/** The difficulty a fight is measured or played at (spec §13 hook 1, plan 8h); read through data/difficulty.ts `tierOf`. */
export type Difficulty = 'normal' | 'nightmare' | 'hell';

/**
 * Depth, region, run condition (default plain) and the id of the enemy that comes as an elite (its first occurrence in
 * `enemyIds`). `difficulty` scales the scaled enemies (difficulty plan Task 1, `scaleEnemy`'s tier); 'normal' and none are
 * the same fight, draw for draw (`tierOf` gives null and the call is the one without a tier).
 */
export interface BattleScale {
  depth: number; region: RegionId; elite?: string; condition?: ConditionId; difficulty?: Difficulty;
  /** The affixes of this fight's elite, or of its boss in a boss fight (difficulty plan Task 3): drawn by the caller, applied here. */
  affixes?: readonly AffixId[];
  /**
   * Hell's crowd affix (controller ruling 2026-10-23; engine/tiers.ts rollCrowdAffix): drawn by the caller; applied to the
   * foe `floor(pick x foes)` of a plain crowd (no elite, no boss) only when the tier has a crowd affix chance.
   */
  crowdAffix?: { pick: number; id: AffixId };
}

/**
 * `target` is the drawn one, which the engine plays (a taunt, a challenge, a hunt or a cover turns it when the blow falls).
 * `shownTarget`, for the screen only: where a challenge, a hunt or a cover will send it, as things stood when it was planned.
 * Roster plan B2 (M1): `windup`, the foe spends this turn winding up the skill (its `windup` name), which comes next round
 * as the `charged` one, drawn for its target only.
 */
export type EnemyAction = { kind: 'attack'; target?: string; shownTarget?: string }
  | { kind: 'enemy-skill'; index: number; target?: string; shownTarget?: string; windup?: true; charged?: true };

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
    x, level: m.level, powers: powersOf(m), ranks: { ...m.tree }, keystones: keystonesOf(m), ...runesOf(m),
    ...(m.memories !== undefined ? { memories: m.memories } : {}), ...(m.oath ? { oath: true as const } : {}), ...(m.oath ? { artId: artIdOf(m) } : {}) };
  // Memory keystones that are plain secondaries (added once, here; absent keystones leave x as it was).
  if (c.keystones.includes('teachers-gift')) c.x.tpCost = (c.x.tpCost ?? 0) + MEMORY_KEYSTONE_VALUES.tpCostPct;
  if (c.keystones.includes('fathers-face')) c.x.matFind = (c.x.matFind ?? 0) + MEMORY_KEYSTONE_VALUES.matFind;
  return c;
}

/**
 * A member's socketed runes for battle (plan 8e): each skill's runes in slot order without the empty slots; only skills
 * with a rune, and no `runes` key at all when there is none (a member without runes is the same object as before).
 */
function runesOf(m: Member): { runes?: Record<string, RuneRef[]> } {
  const runes: Record<string, RuneRef[]> = {};
  for (const [skill, cells] of Object.entries(m.sockets ?? {})) {
    const refs = cells.filter((r): r is RuneRef => r !== null).map((r) => ({ id: r.id, tier: r.tier }));
    if (refs.length) runes[skill] = refs;
  }
  return Object.keys(runes).length ? { runes } : {};
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
  const t = sc ? tierOf(sc.difficulty) : null;
  const crowdAt = t && t.crowdAffixChance > 0 && sc?.crowdAffix && !o.boss && !sc.elite ? Math.floor(sc.crowdAffix.pick * enemyIds.length) : -1;
  const s: BattleState = {
    round: 0, party, enemies: [], boss: !!o.boss, inventory: { ...o.inventory }, revealed: structuredClone(o.revealed),
    itemBoost: hasPassive(o.party, 'itemBoost'), log: [], outcome: 'ongoing',
  };
  if (sc) s.enemyDefs = {};
  const meeting: Meeting = { scale: sc, boss: !!o.boss, k, bossPower: o.bossPower, names: o.names };
  enemyIds.forEach((id, i) => {
    const n = (seen[id] = (seen[id] ?? 0) + 1);
    meetEnemy(s, id, meeting, {
      elite: !!sc && sc.elite === id && n === 1,
      ...(counts[id] > 1 ? { letter: String.fromCharCode(64 + n) } : {}),
      ...(i === crowdAt ? { crowd: sc!.crowdAffix!.id } : {}),
    });
  });
  const enemies = s.enemies;
  if (o.survive) {
    s.survive = o.survive;
    for (const c of party) c.undying = true;
    for (const c of enemies) if (ENEMIES[c.defId]?.undying) c.undying = true;
  }
  if (k !== 1) s.partyScale = k;
  s.abyss = o.abyss ?? abyssPct(depth);
  initMechs(s);
  // 常駐 (plan 8e): the lasting buffs and barriers go up, and the reserve comes off max TP.
  applyLasting(s);
  return s;
}

/**
 * How a fight meets its foes (createBattle's): its scale, whether it is a boss fight, the party-size multiplier `k`, the
 * extra boss power and the names it renames foes to. Kept for a foe that joins the fight later (roster plan B1).
 */
export interface Meeting {
  scale?: BattleScale; boss?: boolean; k: number; bossPower?: number; names?: Record<string, string>;
}
/** One foe as it is met: the fight's elite, its letter among foes of its kind (absent: the only one), the crowd affix. */
export interface MeetAs { elite?: boolean; letter?: string; crowd?: AffixId }

/**
 * Meets one foe (roster plan B1): its definition as this fight scales it, made a combatant keyed `e<n>` after the foes
 * already there, added to `s.enemies` (and its definition to `s.enemyDefs` in a scaled fight). createBattle meets each of
 * its group with this, in order, so a fight is the same as before field for field. Draws nothing.
 */
export function meetEnemy(s: BattleState, id: string, m: Meeting, as: MeetAs = {}): Combatant {
  const sc = m.scale;
  const region = sc ? REGIONS[sc.region] : null;
  const t = sc ? tierOf(sc.difficulty) : null;
  const elite = !!as.elite;
  // The affixes go on the elite, or in a boss fight on each boss (ruling 5), only on a higher tier; none drawn here.
  const aff = t && sc?.affixes?.length && (elite || (m.boss && ENEMIES[id].boss)) ? sc.affixes : as.crowd ? [as.crowd] : undefined;
  const met = !sc || !region ? ENEMIES[id] : t ? scaleEnemy(ENEMIES[id], sc.depth, region, elite, CONDITIONS[sc.condition ?? 'plain'], t, aff) : scaleEnemy(ENEMIES[id], sc.depth, region, elite, CONDITIONS[sc.condition ?? 'plain']);
  // An enemy is met at its level for the fight's depth (enemyLevelAt; the deep road's own extra power on top), or at
  // its own home level when the fight has no scale.
  const level = sc ? enemyLevelAt(sc.depth) : homeLevel(met);
  const empowered = empower(met, level);
  const power = m.k * (m.bossPower ?? 1) * (sc ? deepPower(sc.depth) : 1);
  const scaled = power === 1 ? empowered : { ...empowered, stats: mul(empowered.stats, { hp: power, atk: power, mag: power }) };
  const d = m.names?.[id] ? { ...scaled, name: m.names[id] } : scaled;
  const key = `e${s.enemies.length}`;
  if (s.enemyDefs) s.enemyDefs[key] = d;
  const name = as.letter ? `${d.name} ${as.letter}` : d.name;
  const c = fromEnemy(d, key, name, elite ? 'elite' : region ? regionTint(region) : undefined, level);
  if (aff) c.affixes = [...aff];
  openWith(c, d);   // its opener (roster plan B3, M14); none on the old roster
  s.enemies.push(c);
  return c;
}

/**
 * By speed, a little shuffled; a foe pinned for `round` (Sylvie's pin) goes last, and a foe that ambushes goes first in
 * round one (roster plan B3, M14). One draw per combatant either way.
 */
export function turnOrder(cs: Combatant[], rng: Rng, round = 0): Combatant[] {
  return cs
    .map((c, i) => ({ c, i, k: stat(c, 'spd') * (1 + rng() * 0.25), last: round > 0 && c.delay === round, first: round === 1 && !!c.ambush }))
    .sort((a, b) => Number(b.first) - Number(a.first) || Number(a.last) - Number(b.last) || b.k - a.k || a.i - b.i)
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
    case 'enemy': {
      // A foe that another foe guards sends the party's single blow to its guard (roster plan B2, M2); draws nothing.
      const t = pickTarget(foePool(s, actor, melee, forced), chosen, rng);
      return t ? [actor.side === 'party' ? foeGuard(s, t) : t] : [];
    }
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
      // A foe that left the fight is not a fallen ally (roster plan B1).
      const t = allies.find((c) => c.key === chosen && !c.alive && !c.left) ?? allies.find((c) => !c.alive && !c.left);
      return t ? [t] : [];
    }
    default: return [];
  }
}

/** `def` with the abyss capstones' depth bonus in it (a skill without `abyss`, or no depth bonus, is `def` itself). */
export function abyssDef(s: Pick<BattleState, 'abyss'>, def: SkillDef): SkillDef {
  const bonus = def.abyss && s.abyss ? pctMod(def.id, 100 + s.abyss) : undefined;
  return bonus ? patchSkill(def, bonus) : def;
}

/**
 * `def` as `actor` casts it this moment, as `perform` casts it: the depth's bonus (`abyssDef`), then her mechanic
 * (`castDef`: Noel's heat, Liz's coins, a barrier to release, a 同步). The battle menu's numbers read this (plan 8h ruling 11h).
 */
export function castNow(s: BattleState, actor: Combatant, def: SkillDef): SkillDef {
  return castDef(s, actor, abyssDef(s, def));
}

/**
 * A skill as this combatant casts it: the tree's rank, then its mod nodes (stacked into one), then the hero's weapon
 * mastery, then every worn power that names it in the order worn; added effects (`extra`) last. The order is stated in engine/skills.ts `patchSkill`.
 * With nothing to rewrite it is `SKILLS[id]` itself. An unknown id is undefined.
 */
export function skillFor(c: Pick<Combatant, 'powers' | 'ranks' | 'weaponKind' | 'runes'>, id: string): SkillDef | undefined {
  const base = skillBase(c, id);
  if (!base) return undefined;
  // Runes come after all of it (spec §6.6 rule 1): on the skill without its extras, which they hand back last (plan 8e).
  const runes = c.runes?.[id];
  const { core, extra } = base;
  if (runes?.length) return knobWords(c, applyRunes(core, extra, runes));
  return knobWords(c, extra.length ? patchSkill(core, { extra }) : core);
}

/**
 * The skill before its runes, as `skillFor` builds it: `core` after the tree, mastery and legendary powers, and the
 * `extra` effects they add, handed back last. `core` is the data's own object when nothing rewrites the skill.
 */
function skillBase(c: Pick<Combatant, 'powers' | 'ranks' | 'weaponKind'>, id: string): { core: SkillDef; extra: Effect[] } | undefined {
  const base = SKILLS[id];
  if (!base) return undefined;
  // The tree's two stages (the active's own rank, then its mod nodes stacked into one) come from progression.treeMods only.
  const powers = (c.powers ?? []).map((p) => POWERS[p]).filter((p) => p && p.skill === id).map((p) => p.mod);
  const info = NODES[id];
  const mastered = c.weaponKind && info?.owner === 'hero' && WEAPON_KINDS[c.weaponKind].mastery.includes(info.branch)
    ? pctMod(id, 100 + WEAPON_MASTERY_PCT) : undefined;
  const mods = [...(c.ranks ? treeMods(c.ranks, id) : []), ...(mastered ? [mastered] : []), ...powers];
  let core = base;
  const extra: Effect[] = [];
  for (const { extra: more, ...mod } of mods) { core = patchSkill(core, mod); extra.push(...(more ?? [])); }
  return { core, extra };
}

/**
 * The skill without its runes and whether each of `refs` would work on it (plan 8g Task 1): what the workshop shows
 * before a rune goes in. `def` is `skillFor` with no runes; `states` the very judgement `applyRunes` makes on `refs`.
 */
export function runeView(c: Pick<Combatant, 'powers' | 'ranks' | 'weaponKind'>, id: string, refs: readonly RuneRef[]): { def: SkillDef; states: { ref: RuneRef; miss: RuneMiss | null }[] } | undefined {
  const base = skillBase(c, id);
  if (!base) return undefined;
  const { core, extra } = base;
  return {
    def: knobWords(c, extra.length ? patchSkill(core, { extra }) : core),
    states: runeStates({ ...core, effects: [...core.effects, ...extra] }, refs, core),
  };
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
export function skillCost(c: Pick<Combatant, 'x' | 'powers' | 'ranks' | 'runes' | 'weaponKind'>, id: string): number {
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
    // A foe winding up draws no skill: the one it wound up comes now, drawn for its target only (roster plan B2, M1).
    const charged = e.winding !== undefined && !!skills[e.winding];
    const index = charged ? e.winding! : skills.findIndex((sk) => rng() < sk.chance);
    const windup = !charged && index >= 0 && !!skills[index].windup;
    const melee = index >= 0 ? skillIsMelee(skills[index].effects) : e.melee;
    const target = pickTarget(foePool(s, e, melee), undefined, rng)?.key;
    const act: EnemyAction = index >= 0
      ? { kind: 'enemy-skill', index, target, ...(windup ? { windup: true as const } : {}), ...(charged ? { charged: true as const } : {}) }
      : { kind: 'attack', target };
    // Where a challenge or a cover (a taunt over them included) would send the blow, the screen shows it; the action keeps
    // its drawn target and the redirect is made when the blow falls (forcedTarget in perform). A lone taunt is drawn as
    // the target already, so a plain intent gains no field.
    const ch = e.challenged;
    const challenged = !!ch && ch.round === round && s.party.some((c) => c.key === ch.by && c.alive);
    const covered = living(s.party).some((c) => c.key !== target && covers(c, target));
    const hunted = !!huntedIn(s, round);
    const forced = challenged || covered || hunted ? forcedTarget(s, e, act, round) : null;
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
  if (act.kind === 'enemy-skill' && act.windup) return null;   // winding up is no blow (roster plan B2, M1)
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
  // A hunt (roster plan B2, M24): the member a foe called out for this round takes the single blows, wherever she stands;
  // a cover over her still stands in for her.
  const hunted = huntedIn(s, round);
  const meant = hunted ?? s.party.find((c) => c.key === act.target && c.alive);
  // A frozen or sleeping Scarlet stands in for no one (designer ruling, plan 8c final).
  const cover = meant ? living(s.party).find((c) => c !== meant && covers(c, meant.key) && !c.frozen && c.sleep === 0) : undefined;
  if (meant && cover) return { to: cover, pool: [meant], cover: true };
  if (hunted && hunted.key !== act.target) return { to: hunted, pool: others(hunted) };
  return null;
}

/** Whether `c` stands in for `ally` (Scarlet's 代受; with 雙肩 her second cover too). */
export const covers = (c: Combatant, ally: string | undefined): boolean => !!ally && (c.cover?.ally === ally || c.coverAlso?.ally === ally);

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
  delete ctx.afterTried;   // 餘波's tries of this action (plan 8e)
  delete ctx.paid;
  delete ctx.regained;
  delete ctx.coverBlow;
  let sentTo: Combatant | undefined;   // a challenger or a cover is reached wherever she stands
  if (actor.side === 'enemy' && act.kind === 'enemy-skill' && act.charged) {
    // The blow it wound up (roster plan B2, M1); a charge that sleep or a freeze broke is a plain attack.
    if (actor.winding === undefined) act = { kind: 'attack', target: act.target };
    else delete actor.winding;
  }
  if (actor.side === 'enemy') {
    // A single blow goes where a taunt, a challenge or a cover sends it (forcedTarget); the ledger credits the one it
    // went to with what the others in `pool` would have lost (plan 8c rulings 8, 19). An area attack follows a taunt only,
    // centred on the taunter. Reading the grid draws nothing.
    const forced = forcedTarget(s, actor, act as EnemyAction);
    const taunter = living(s.party).find((c) => c.taunt > 0);
    if (forced) {
      if (ctx.ledger) ctx.redirect = forced.cover ? { pool: forced.pool, cover: true } : { pool: forced.pool };
      if (forced.cover) ctx.coverBlow = forced.to.key;
      act = { ...act, target: forced.to.key } as EnemyAction;
      sentTo = forced.to;
    } else if (taunter) act = { ...act, target: taunter.key } as EnemyAction;
  }
  const physical = (t: Combatant) =>
    applyEffect(actor, t, { kind: 'damage', power: 100, element: 'phys', scale: actor.attackScale ?? 'atk', melee: actor.melee }, ctx);
  switch (act.kind) {
    case 'attack': {
      const drawn = pickTarget(foePool(s, actor, actor.melee, sentTo), act.target, rng);
      const t = drawn && actor.side === 'party' ? foeGuard(s, drawn) : drawn;
      if (!t) return null;
      s.log.push({ type: 'act', actor: actor.key, label: '攻擊' });
      physical(t);
      return null;
    }
    case 'enemy-skill': {
      const sk = enemyDef(s, actor)!.skills[act.index];
      if (act.windup) {
        // It winds up (roster plan B2, M1): the skill comes next round.
        actor.winding = act.index;
        s.log.push({ type: 'act', actor: actor.key, label: sk.windup ?? sk.name });
        return null;
      }
      s.log.push({ type: 'act', actor: actor.key, label: sk.name });
      // A guard (M2) covers the ally most hurt but itself; any other skill finds its targets as it always has.
      const targets = guardTargets(s, actor, sk) ?? resolveTargets(s, actor, sk.target, act.target, rng, skillIsMelee(sk.effects), sentTo);
      for (const t of targets) for (const eff of sk.effects) applyEffect(actor, t, eff, ctx);
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
      def = abyssDef(s, def);
      // Then the caster's mechanic (Noel's heat): the skill as she casts it now, at the TP she pays now.
      const raw = def;
      def = castDef(s, actor, def);
      const cost = castCost(s, actor, act.skill);
      if (actor.tp < cost) { s.log.push({ type: 'no-tp', actor: actor.key }); return null; }
      actor.tp -= cost;
      ctx.paid = cost;
      payHp(actor, def);
      payMech(s, actor, def, ctx);
      s.log.push({ type: 'act', actor: actor.key, label: def.name });
      if (actor.side === 'party') countCast(ctx.ledger, def.id);
      ctx.cast = def.id;   // a barrier remembers the skill that raised it
      delete ctx.struck;
      const scatter = def.effects.some((e) => e.kind === 'damage' && e.scatter);
      let first: Combatant[] = [];
      if (scatter) scatterCast(s, actor, def, act.target, ctx, rng);
      else {
        first = resolveTargets(s, actor, def.target, act.target, rng);
        castOn(actor, first, def, ctx);
        // 彈射 (plan 8e): after the first foe has had every effect, the damage goes on down the line, if a hit landed.
        if (def.runeRules?.bounce && first.length === 1 && ctx.struck === first[0].key) bounceCast(s, actor, def, first[0], ctx);
      }
      // 雙重詠唱 (plan 8e): the whole skill once more, paid already; one action for the mechanics.
      if (def.runeRules?.twice) twinCast(s, actor, def, raw, first, scatter, ctx, rng);
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
      ctx.paid = rec.cost;   // what 回氣 may give back (plan 8h ruling 11c)
      delete ctx.acting;   // an echo's blows set off no trigger rune (plan 8e ruling 11)
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
 * 彈射 (plan 8e ruling 8): up to `bounces` more foes, each the next one standing in line not hit yet (no draw), take the
 * skill's damage effects at 100 − dropPct × n percent of their power for the n-th bounce. Each hit rolls as any hit does.
 */
function bounceCast(s: BattleState, actor: Combatant, def: SkillDef, first: Combatant, ctx: EffectContext): void {
  const { bounces, dropPct } = def.runeRules!.bounce!;
  const foes = actor.side === 'party' ? s.enemies : s.party;
  const hit = new Set([first.key]);
  for (let n = 1; n <= bounces; n++) {
    const next = bounceNext(foes, first.key, hit);
    if (!next) return;
    hit.add(next.key);
    const before = ctx.lastHit;
    const drop = (p: number) => pctOf(p, 100 - dropPct * n);
    // A 同步's lift drops with it (plan 8h ruling 11e).
    for (const eff of def.effects) if (eff.kind === 'damage') applyEffect(actor, next, { ...eff, power: drop(eff.power), ...(eff.lift ? { lift: { ...eff.lift, from: drop(eff.lift.from) } } : {}) }, ctx);
    // A bounce that is dodged ends the chain: it only goes on from a foe it struck.
    if (!landedOn(ctx, before, next)) return;
  }
}

/**
 * The struck triggers this foe's action queued for members who could not stir as it began (the same `idle` 贖火 reads):
 * dropped, and their once-a-round mark given back, since nothing fired.
 */
function dropIdleStruck(s: BattleState, idle: readonly string[]): void {
  if (!s.triggers) return;
  const drop = s.triggers.filter((t) => t.on === 'struck' && idle.includes(t.by));
  if (!drop.length) return;
  s.triggers = s.triggers.filter((t) => !drop.includes(t));
  if (!s.triggers.length) delete s.triggers;
  for (const t of drop) {
    const c = s.party.find((m) => m.key === t.by);
    if (c?.fired) delete c.fired.struck;
  }
}

/** A skill cast once on its targets as `perform` resolves them (a scatter skill scatters), for a triggered cast (plan 8e). */
export function castOnce(s: BattleState, actor: Combatant, def: SkillDef, chosen: string | undefined, ctx: EffectContext, rng: Rng): void {
  if (def.effects.some((e) => e.kind === 'damage' && e.scatter)) scatterCast(s, actor, def, chosen, ctx, rng);
  else for (const t of resolveTargets(s, actor, def.target, chosen, rng)) for (const eff of def.effects) applyEffect(actor, t, eff, ctx);
}

/**
 * 雙重詠唱's second cast (plan 8e ruling 12), at once and with no draw for its targets: a single foe again, or the first
 * one standing should it have fallen; a single ally again, or else the default ally (the lowest share of HP); a revive
 * on another fallen ally, or nothing; a whole side or herself as usual. It never bounces. A scatter skill scatters anew.
 * With no one to cast on, nothing happens and nothing is logged.
 */
function twinCast(s: BattleState, actor: Combatant, cast: SkillDef, raw: SkillDef, first: Combatant[], scatter: boolean, ctx: EffectContext, rng: Rng): void {
  const allies = actor.side === 'party' ? s.party : s.enemies;
  const foes = actor.side === 'party' ? s.enemies : s.party;
  const again = { type: 'act' as const, actor: actor.key, label: T.rune.again(cast.name) };
  // The mechanic is paid again (controller ruling, Task 5 review): the second cast is the skill as her resource stands
  // now (一擲千金 throws the coins she holds now, 天之逆鉾 finds no barrier left to release), and spends it again.
  // At `secondPct` of the power (plan 8h Task 5b ruling B1); a 同步's lift is scaled with it.
  const pct = RUNE_NUMBERS['twin-cast'].fixed.secondPct;
  const second = (): SkillDef => {
    const full = patchSkill(castDef(s, actor, raw), { powerPct: pct });
    const def = { ...full, effects: full.effects.map((e) => ((e.kind === 'damage' || e.kind === 'heal') && e.lift ? { ...e, lift: { ...e.lift, from: pctOf(e.lift.from, pct) } } : e)) };
    // The mechanic's cue (Safira's finale) was said for the first cast; paying again says nothing more.
    const said = s.log.length;
    payMech(s, actor, def, ctx);
    s.log.splice(said).forEach((e) => { if (!(e.type === 'mech' && e.cue === 'finale')) s.log.push(e); });
    delete ctx.afterTried;
    return def;
  };
  if (scatter) {
    if (!living(foes).length) return;
    s.log.push(again);
    scatterCast(s, actor, second(), undefined, ctx, rng);
    return;
  }
  const def = cast;
  const one = (t: Combatant | undefined): Combatant[] => (t ? [t] : []);
  const targets = def.target === 'enemy' ? one(first[0]?.alive ? first[0] : living(foes)[0])
    : def.target === 'ally' ? one(first[0]?.alive ? first[0] : living(allies).sort((a, b) => a.hp / a.max.hp - b.hp / b.max.hp)[0])
      : def.target === 'deadAlly' ? one(allies.find((c) => !c.alive))
        : resolveTargets(s, actor, def.target, undefined, rng);
  if (!targets.length) return;
  s.log.push(again);
  castOn(actor, targets, second(), ctx);
}

/**
 * A cast's effects on each of its targets in turn; the first target a hit landed on, in target order, is the foe the cast
 * struck (`ctx.struck`, which 回聲 aims at; plan 8e final review), unless the cast already has one.
 */
function castOn(actor: Combatant, targets: Combatant[], def: SkillDef, ctx: EffectContext): void {
  for (const t of targets) {
    const before = ctx.lastHit;
    for (const eff of def.effects) applyEffect(actor, t, eff, ctx);
    if (!ctx.struck && landedOn(ctx, before, t)) ctx.struck = t.key;
  }
}

/** Whether a hit landed on `t` since `before` was the context's last hit (each landed hit records a new one). */
const landedOn = (ctx: EffectContext, before: EffectContext['lastHit'], t: Combatant): boolean =>
  ctx.lastHit !== before && ctx.lastHit?.target === t.key;

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
  // Then the foes' own countdowns (roster plan B2–B3): a flight, a guard's rounds, a hunt's round.
  foesRoundEnd(s, (c) => enemyDef(s, c));
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
    if (guard && c.alive) c.ward = { def: pct, res: pct, src: guard.src, ...(guard.skill ? { skill: guard.skill } : {}) };
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
  foesRoundStart(s);   // a member who defends lifts a hunt on her (roster plan B2, M24)
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
    // A lost turn breaks a foe's charge (roster plan B2, M1).
    if (actor.frozen) { delete actor.frozen; delete actor.winding; actor.freezeGuard = AILMENT.freezeGuard; s.log.push({ type: 'frozen', actor: actor.key }); continue; }
    if (actor.sleep > 0) { actor.sleep -= 1; delete actor.winding; s.log.push({ type: 'asleep', actor: actor.key }); continue; }
    if (actor.dozing) wakeUp(s, actor);   // a foe that opened asleep wakes angry (roster plan B3, M14)
    const act = actor.side === 'party' ? actions[actor.key] : enemyActs.get(actor.key);
    const heroUp = s.party.some((c) => c.key === 'hero' && c.alive);
    if (act) {
      // What the mechanics need to see before the action (Rin's living marks: a felled foe leaves them at once).
      const seen = actor.side === 'party' ? watchAction(s, actor) : [];
      const from = s.log.length;
      // Who could not stir as the foe's blow fell (a hit wakes a sleeper, so it is read before).
      const idle = actor.side === 'enemy' ? s.party.filter((c) => c.frozen || c.sleep > 0).map((c) => c.key) : [];
      ctx.acting = actor.key;   // only her own action's blows set off a trigger rune (plan 8e)
      const def = perform(s, actor, act, ctx, rng);
      delete ctx.acting;
      delete ctx.redirect;
      // What the foe's action set off on the party (Scarlet's 贖火 counter); that sets off nothing more.
      if (actor.side === 'enemy') afterFoe(s, actor, ctx, from, idle);
      // A member frozen or asleep as the blow fell sets off no struck trigger, though the blow woke her (plan 8e ruling 11).
      if (actor.side === 'enemy' && idle.length) dropIdleStruck(s, idle);
      if (actor.side === 'party' && actor.alive && act.kind !== 'ultimate' && act.kind !== 'escape') actor.limit = Math.min(LIMIT_MAX, actor.limit + gaugeGain(actor, LIMIT_PER_ACTION));
      if (actor.side === 'party') {
        const own = act as Action;
        afterAction(s, actor, own, def, ctx);
        // A mechanic may grant more actions at once (Rin's 還有。, and with 追命 one after another); they fill no gauge.
        let again = extraAction(s, actor, own, ctx, seen);
        while (again) {
          const seen2 = watchAction(s, actor);
          ctx.acting = actor.key;
          const def2 = perform(s, actor, again, ctx, rng);
          delete ctx.acting;
          delete ctx.redirect;
          afterAction(s, actor, again, def2, ctx);
          again = extraAction(s, actor, again, ctx, seen2);
        }
      }
      // The trigger runes her action (or the foe's blow on her) set off, cast now (plan 8e).
      runTriggers(s, ctx, rng);
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
  if (a.kind === 'enemy-skill' && a.windup) return T.battle.foe.windup(name);   // roster plan B2, M1
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
export function rewards(s: BattleState, rng: Rng, dropBoost: boolean, dropMul = 1): { exp: number; gold: number; drops: Record<string, number>; coinGold: number; returned?: number } {
  let exp = 0, gold = 0;
  const drops: Record<string, number> = {};
  const find = (k: SecondaryKey) => Math.min(100, living(s.party).reduce((n, c) => n + (c.x[k] ?? 0), 0));
  const matMul = 1 + find('matFind') / 100;
  for (const e of s.enemies) {
    if (s.survive && e.alive) continue;   // a survive fight pays only for the foes knocked out
    if (e.left || e.summoned) continue;   // a foe that left or was summoned pays nothing, and draws nothing (roster plan B1)
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
  // What felled thieves took comes back with the gold (roster plan B3, M13); no draw. Absent when none did.
  const returned = returnedGold(s, (c) => enemyDef(s, c));
  return { exp: Math.round(exp * (1 + find('expBonus') / 100)), gold: Math.round(gold * (1 + find('goldFind') / 100)) + coinGold + returned, drops, coinGold, ...(returned ? { returned } : {}) };
}

export function writeBack(p: Party, s: BattleState): Party {
  const roster = { ...p.roster };
  for (const c of s.party) {
    const id = c.key as CharacterId;
    // The TP the 常駐 cap cut on entry (plan 8e) comes back with the fight over. She held at most the fight's max, so this
    // never passes the TP she entered with.
    roster[id] = { ...roster[id], hp: c.alive ? c.hp : 0, tp: c.tp + (c.reservedTp ?? 0), limit: c.limit };
  }
  return { ...p, roster };
}
