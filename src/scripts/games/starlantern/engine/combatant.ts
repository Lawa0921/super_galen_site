import { ROW_MELEE } from './formation';
import type { Rng } from './rng';
import { armorReduction, evadeChance, EVADE_MAX } from './stats';
import type { BuffStat, Element, Row, SecondaryKey, Stats, WeaponKind } from './types';
import { KEYSTONE_VALUES, MEMORY_KEYSTONE_VALUES, type KeystoneId } from '../data/talents';
import { AIM, BEAT, EMBER, MARK, type MechState } from './mech';
import type { MechCue } from './mechanics/index';
import { credit, type Ledger } from './ledger';
import { AILMENT, clearAilments, type AilmentShown, type Dot } from './ailments';

/** `src`: the combatant key of whoever cast it (the contribution ledger credits what it prevents to them). */
export interface Buff { stat: BuffStat; pct: number; turns: number; src?: string }

export interface Combatant {
  key: string; side: 'party' | 'enemy'; defId: string; name: string;
  max: Stats; hp: number; tp: number; row: Row; melee: boolean;
  /** Party grid cell 0-8 (engine/formation.ts); enemies have none. */
  cell?: number;
  weak: Element[]; resist: Element[]; boss: boolean; alive: boolean;
  poison: boolean; sleep: number; buffs: Buff[]; taunt: number;
  /** Who poisoned it: the first to land the poison; kept while it lasts, cleared by a cure or a fall. */
  poisonSrc?: string;
  defending: boolean;
  /** Ultimate gauge, 0–100; enemies keep 0. */
  limit: number;
  /** Battle-screen colouring of a regional variant (its region's element) or an elite. */
  tint?: Element | 'elite';
  /** Derived stats in play: a member's sheet secondaries, an enemy's `sec`. A missing key is 0. */
  x: Partial<Record<SecondaryKey, number>>;
  /** A member's level; an enemy's level in this fight. Armor and evasion are rated against the attacker's. */
  level: number;
  /** A member's skill-tree ranks by node id (a copy of `Member.tree`); enemies and test combatants have none. */
  ranks?: Record<string, number>;
  /** How a weapon-master's basic attack scales (the hero, from his weapon); absent reads as 'atk'. */
  attackScale?: 'atk' | 'mag';
  /** The hero's weapon kind (companions have none); drives his mastery and hit effect. */
  weaponKind?: WeaponKind;
  /** Legendary powers worn (members only). */
  powers: string[];
  /** Keystone talents held (members only; engine/progression.keystonesOf). */
  keystones: KeystoneId[];
  /** Memory pieces held (members only; read through `memoriesOf`); the hero's Lantern Key lights up with them. */
  memories?: number;
  /** Rin has sworn her oath (members only). */
  oath?: true;
  /** The art id a member shows: Rin wears `rin-oath` after her oath (members only; absent reads as `defId`). */
  artId?: string;
  /** Never drops below 1 HP (dealDamage): the party and Scarlet in a survive fight. */
  undying?: true;
  /** A member's character mechanic in this fight (engine/mech.ts); the old roster has none. */
  mech?: MechState;
  /** Ailments (engine/ailments.ts), each absent when not held: one burn, up to three bleed stacks, the rounds of shock and
   *  chill left, frozen until its next turn, and the rounds a thawed foe cannot be frozen again. */
  burn?: Dot;
  bleed?: Dot[];
  shock?: number;
  frozen?: true;
  freezeGuard?: number;
  chill?: number;
  /** The guard barrier over the party, as it stands on this member (battle.syncWards): def and res percent, who raised it. */
  ward?: { def: number; res: number; src: string };
  /** A shield: damage it takes before HP (dealDamage), and who gave it (the ledger credits what it absorbs to them). */
  shield?: { amount: number; src: string };
  /** Rounds fire, ice and thunder hit it as a weakness (Noel's hex; `isWeak`). */
  exposed?: number;
  /** Round ends a single enemy attack passes over this member (Rin's veil; battle.foePool). */
  veil?: number;
  /** The next landed hit is a critical one, drawing no crit roll; gone after it (Rin's veil). */
  nextCrit?: true;
  /** Who appraised this foe (Liz): its fall doubles their coins. */
  appraised?: string;
  /** The round this foe acts last in (Sylvie's pin). */
  delay?: number;
  /** The ally whose single attacks this member takes, and the rounds left (Scarlet's 代受). */
  cover?: { ally: string; turns: number };
  /** Her second cover, kept beside `cover` (Scarlet's 雙肩, plan 8d). */
  coverAlso?: { ally: string; turns: number };
  /** The counter this member answers each blow with, and the rounds left (Scarlet's 贖火). */
  riposte?: { power: number; turns: number };
  /** Who this foe must strike, and in which round (Scarlet's 盾擊). */
  challenged?: { by: string; round: number };
}

/** The aim stacks `a` holds on `t` (Sylvie; 0 for anyone else or any other foe). */
const aimOn = (a: Combatant, t: Combatant): number => (a.mech?.kind === 'aim' && a.mech.target === t.key ? a.mech.stacks : 0);

export type BattleEvent =
  | { type: 'act'; actor: string; label: string; ultimate?: string }
  | { type: 'no-limit'; actor: string }
  | { type: 'damage'; target: string; amount: number; element: Element; mult: number; crit?: boolean }
  | { type: 'miss'; target: string }
  | { type: 'ko'; target: string }
  | { type: 'heal'; target: string; amount: number }
  /** `regen`: the end-of-round tpRegen, shown as a quiet pop rather than a message line. */
  | { type: 'tp'; target: string; amount: number; regen?: boolean }
  | { type: 'revive'; target: string }
  | { type: 'cure'; target: string }
  | { type: 'status'; target: string; status: AilmentShown }
  | { type: 'resist'; target: string }
  | { type: 'buff'; target: string; stat: BuffStat; pct: number }
  | { type: 'taunt'; target: string }
  | { type: 'asleep'; actor: string }
  | { type: 'no-tp'; actor: string }
  /** A member's turn spent on a skill their tree has not learned (no menu offers one; a stale or crafted action). */
  | { type: 'no-skill'; actor: string }
  | { type: 'escape'; success: boolean }
  | { type: 'poison-tick'; target: string; amount: number }
  /** A burn or bleed stack's round-end damage. */
  | { type: 'dot-tick'; target: string; amount: number; status: 'burn' | 'bleed' }
  /** A shield took `amount` of a hit before HP did. */
  | { type: 'shield'; target: string; amount: number }
  /** A character mechanic's moment (engine/mechanics): Noel's overload with its backlash, Rin's 還有。. */
  | { type: 'mech'; actor: string; cue: MechCue; amount?: number }
  /** A frozen combatant's turn, lost (it thaws). */
  | { type: 'frozen'; actor: string }
  /** A survive fight lasted its rounds. */
  | { type: 'survived' };

export const MAX_BUFFS = 3;
export const SLEEP_TURNS = 3;

export function stat(c: Combatant, s: BuffStat): number {
  // A chilled boss is slower, and a guard barrier's ward guards: both added to the buffs' percentages.
  const pct = c.buffs.filter((b) => b.stat === s).reduce((sum, b) => sum + b.pct, 0) + (s === 'spd' && c.chill ? AILMENT.chillSpdPct : 0)
    + (c.ward ? (s === 'def' ? c.ward.def : s === 'res' ? c.ward.res : 0) : 0);
  return Math.max(1, Math.floor(c.max[s] * Math.max(0.25, 1 + pct / 100)));
}

/**
 * One buff per stat and direction, the strongest kept (spec §9): a stronger one (larger |pct|; a deeper debuff) replaces
 * the held one with its own source, a weaker or equal one leaves it; either way it lasts the longer of the two. A new
 * stat or direction takes a slot (at most MAX_BUFFS, the oldest dropped).
 */
export function addBuff(c: Combatant, b: Buff): void {
  const i = c.buffs.findIndex((x) => x.stat === b.stat && Math.sign(x.pct) === Math.sign(b.pct));
  if (i >= 0) {
    const old = c.buffs[i];
    c.buffs[i] = { ...(Math.abs(b.pct) > Math.abs(old.pct) ? b : old), turns: Math.max(old.turns, b.turns) };
    return;
  }
  if (c.buffs.length >= MAX_BUFFS) c.buffs.shift();
  c.buffs.push({ ...b });
}

/** A weakness of `t`: one of its own, or any element but physical while it is exposed (Noel's hex). */
export function isWeak(t: Combatant, el: Element): boolean {
  return t.weak.includes(el) || (!!t.exposed && el !== 'phys');
}

export function elementMult(t: Combatant, el: Element): number {
  return isWeak(t, el) ? 1.5 : t.resist.includes(el) ? 0.5 : 1;
}

export interface DamageSpec {
  power: number; element: Element; scale: 'atk' | 'mag'; melee: boolean;
  /** 'always' crits every time and draws no crit roll. */
  crit?: 'always';
  /** Percent: damage times 1 + execute / 100 x the target's missing share of HP. */
  execute?: number;
  /** Percent: damage times 1 + wounded / 100 against a target below full HP. */
  wounded?: number;
  /** Percent a stack of Sylvie's aim adds on this hit, in place of AIM.dmgPct (her 一擊, plan 8d). */
  aimPct?: number;
}

/** Enemies crit for a flat 50% more, whatever critDmg they carry. */
export const ENEMY_CRIT_DMG = 50;

/** True with chance `p`; a chance of 0 or less draws nothing, so fights without these stats keep their random sequence. */
export const roll = (p: number, rng: Rng): boolean => p > 0 && rng() < p;

/** The random part of one landed hit: the variance factor, whether it crit, whether it was blocked. */
export interface HitRolls { variance: number; crit: boolean; blocked: boolean }

/**
 * One hit's draws, in calcDamage's order: evasion (null when it lands), the variance (always drawn), the crit (none for
 * 'always'), the block (physical only). Every roll but the variance draws only when its chance is above 0.
 */
export function rollHit(a: Combatant, t: Combatant, spec: DamageSpec, rng: Rng): HitRolls | null {
  const ax = (k: SecondaryKey): number => a.x[k] ?? 0;
  const tx = (k: SecondaryKey): number => t.x[k] ?? 0;
  // An enemy's evasion is a plain percentage, held at the same 50% as a member's rated evasion.
  const evade = t.side === 'party' ? evadeChance(tx('evasion'), a.level) : Math.min(EVADE_MAX, tx('evasion') / 100);
  if (roll(evade, rng)) return null;
  const variance = 0.9 + rng() * 0.2;
  // Rin's hits on her mark, and a hit she readied under her veil, always crit and draw no crit roll.
  const sure = spec.crit === 'always' || !!a.nextCrit || (a.mech?.kind === 'mark' && a.mech.marks.includes(t.key));
  const crit = sure || roll((ax('crit') + AIM.critPct * aimOn(a, t)) / 100, rng);
  const blocked = spec.element === 'phys' && roll(tx('block') / 100, rng);
  return { variance, crit, blocked };
}

/**
 * One landed hit's amount from its rolls, drawing nothing: the base formula with weakness and row, element bonus and
 * resistance, vuln (weakness hits only), eliteDmg (elites and bosses), crit, armor and block (physical only), melee /
 * ranged reduction, defending, keystones. `mult` is the element multiplier the log shows.
 */
export function hitAmount(a: Combatant, t: Combatant, spec: DamageSpec, r: HitRolls): { amount: number; mult: number; crit: boolean } {
  const ax = (k: SecondaryKey): number => a.x[k] ?? 0;
  const tx = (k: SecondaryKey): number => t.x[k] ?? 0;
  const el = elementMult(t, spec.element);
  const atk = stat(a, spec.scale);
  const def = stat(t, spec.scale === 'atk' ? 'def' : 'res');
  let mult = el;
  // Melee weakens with the attacker's distance; the defender's row protects by reach (formation.reachable), not by halving.
  if (spec.melee) mult *= ROW_MELEE[a.row];
  const base = ((atk * spec.power) / 100) * (60 / (40 + def));
  // Every factor below is exactly 1 when its stat is absent, so such a hit keeps its old value to the bit.
  const hitEl = spec.element;
  // A negative resistance is a weakness, held at -100 (double damage); above 100 it is held at 100 (no damage), so the factor
  // never goes negative: a hit never heals, and a negative bonus times an over-100 resistance never multiplies back up.
  if (hitEl !== 'phys') mult *= (1 + ax(`${hitEl}Dmg`) / 100) * (1 - Math.min(100, Math.max(-100, tx(`${hitEl}Res`))) / 100);
  if (isWeak(t, spec.element)) mult *= 1 + ax('vuln') / 100;
  if (t.boss || t.tint === 'elite') mult *= 1 + ax('eliteDmg') / 100;
  if (spec.execute) mult *= 1 + (spec.execute / 100) * (1 - t.hp / t.max.hp);
  if (spec.wounded && t.hp < t.max.hp) mult *= 1 + spec.wounded / 100;
  // A crit on Rin's marked foe carries MARK.critSharePct of her crit damage (8d Task 3 ruling 1).
  const marked = a.mech?.kind === 'mark' && a.mech.marks.includes(t.key);
  if (r.crit) mult *= 1 + (a.side === 'enemy' ? ENEMY_CRIT_DMG : (ax('critDmg') * (marked ? MARK.critSharePct : 100)) / 100) / 100;
  // Rin's 不眨眼 (plan 8d): a crit on her marked foe hits harder still.
  if (r.crit && a.mech?.kind === 'mark' && a.mech.crit && a.mech.marks.includes(t.key)) mult *= 1 + a.mech.crit / 100;
  const aim = aimOn(a, t);
  if (aim) mult *= 1 + ((spec.aimPct ?? AIM.dmgPct) * aim) / 100;
  // Safira's beat: every hit of hers, her plain attack and her ultimate included.
  if (a.mech?.kind === 'beat' && a.defId === 'safira' && a.mech.beat > 0) mult *= 1 + (BEAT.pctPer * a.mech.beat) / 100;
  if (hitEl === 'phys') {
    mult *= 1 - armorReduction(tx('armor'), a.level);
    if (r.blocked) mult *= 0.5;
  }
  mult *= 1 - tx(spec.melee ? 'meleeDR' : 'rangedDR') / 100;
  if (t.defending) mult *= 0.5;
  if (t.shock) mult *= 1 + AILMENT.shockPct / 100;
  // Keystones (data/talents.ts): a factor only when held, and no draws, so a fight without them keeps its sequence.
  if (a.keystones.includes('last-stand') && a.hp < a.max.hp * KEYSTONE_VALUES.lastStandHp) mult *= 1 + KEYSTONE_VALUES.lastStandPct / 100;
  if (t.keystones.includes('taunt-guard') && t.taunt > 0) mult *= 1 - KEYSTONE_VALUES.tauntGuardPct / 100;
  // Memory keystones: the same rule, a factor only when held and no draws.
  if (a.keystones.includes('carried-out') && t.hp >= t.max.hp) mult *= 1 + MEMORY_KEYSTONE_VALUES.fullHpPct / 100;
  if (t.keystones.includes('not-a-shield') && t.taunt > 0) mult *= 1 - MEMORY_KEYSTONE_VALUES.friendGuardPct / 100;
  return { amount: Math.max(1, Math.floor(base * mult * r.variance)), mult: el, crit: r.crit };
}

/** One hit: `rollHit`, then `hitAmount` when it landed. Only the variance always draws. */
export function calcDamage(a: Combatant, t: Combatant, spec: DamageSpec, rng: Rng): { amount: number; mult: number; crit: boolean; miss: boolean } {
  const r = rollHit(a, t, spec, rng);
  if (!r) return { amount: 0, mult: 1, crit: false, miss: true };   // nothing landed: no element multiplier
  return { ...hitAmount(a, t, spec, r), miss: false };
}

/** One gain of the ultimate gauge, raised by the member's gauge bonus and rounded down. */
export const gaugeGain = (c: Combatant, n: number): number => Math.floor(n * (1 + (c.x.gauge ?? 0) / 100));

/**
 * Hurts a combatant and returns the HP it really lost: an undying target stops at 1, so the log and the gauge see only what
 * was taken. A shield takes the damage first (logged to `log`, credited to its giver in `ledger`); what it leaves goes to
 * HP. A hit wakes a sleeper, even one the shield took whole; damage over time (`dot`: poison, burn, bleed) does not.
 */
export function dealDamage(t: Combatant, amount: number, opts: { dot?: true; ledger?: Ledger; log?: BattleEvent[] } = {}): number {
  if (t.shield) {
    const absorbed = Math.min(t.shield.amount, amount);
    credit(opts.ledger, t.shield.src, 'shield', absorbed);
    opts.log?.push({ type: 'shield', target: t.key, amount: absorbed });
    amount -= absorbed;
    if (t.shield.amount > absorbed) t.shield = { ...t.shield, amount: t.shield.amount - absorbed };
    else delete t.shield;
  }
  const lost = t.undying ? Math.max(0, Math.min(amount, t.hp - 1)) : amount;
  // Scarlet keeps half of what she really loses as embers (ticks too), up to her cap (half her max HP; 熾心 raises it).
  if (t.mech?.kind === 'embers' && t.alive && lost > 0) {
    t.mech.embers = Math.min(Math.floor((t.max.hp * (t.mech.capPct ?? EMBER.capPct)) / 100), t.mech.embers + Math.floor((Math.min(lost, t.hp) * EMBER.sharePct) / 100));
  }
  if (t.side === 'party' && t.alive && lost > 0) t.limit = Math.min(100, t.limit + gaugeGain(t, Math.max(1, Math.floor((lost / t.max.hp) * 40))));
  t.hp = Math.max(t.undying ? 1 : 0, t.hp - amount);
  if (!opts.dot) t.sleep = 0;
  if (t.hp === 0) {
    t.alive = false;
    t.poison = false;
    delete t.poisonSrc;
    t.buffs = [];
    t.taunt = 0;
    if (t.mech?.kind === 'devices') t.mech.devices = [];   // Bobby's devices go with him
    delete t.shield;
    delete t.ward;
    delete t.exposed;
    delete t.veil;
    delete t.nextCrit;
    delete t.delay;
    delete t.cover;
    delete t.coverAlso;
    delete t.riposte;
    delete t.challenged;
    // Her marks and her aim end with her (their words go from the foes too).
    if (t.mech?.kind === 'mark') t.mech.marks = [];
    if (t.mech?.kind === 'aim') { t.mech.target = null; t.mech.stacks = 0; delete t.mech.lock; }
    clearAilments(t);
  }
  return lost;
}
