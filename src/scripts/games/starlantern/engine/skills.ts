import { addBuff, dealDamage, hitAmount, isWeak, roll, rollHit, SLEEP_TURNS, stat, type BattleEvent, type Buff, type Combatant, type HitRolls } from './combatant';
import type { SkillMod } from '../data/gear';
import type { Rng } from './rng';
import type { Effect, Element, SkillDef } from './types';
import { KEYSTONE_VALUES, MEMORY_KEYSTONE_VALUES, type KeystoneId } from '../data/talents';
import { credit, creditPrevented, lossOf, type Ledger } from './ledger';
import { CURED, cureAilments, inflictAilment, type AilmentId } from './ailments';
import type { BattleState } from './battle';
import { onLandedHit } from './mechanics/index';
import { noteHit } from './mechanics/runes';
import { MOON } from './mechanics/moon';
import { AIM } from './mech';
import { COINS, coinCapOf } from './mechanics/coins';
import { aimCapOf } from './mechanics/aim';
import { T } from '../data/text.zh-TW';
import { overclock, placeDevice, tuneUp } from './mechanics/devices';
import { raiseBarrier } from './mechanics/barrier';
import { addEmbers } from './mechanics/embers';
import { adaptTo } from './foes';

/**
 * `ledger`: the sim's contribution ledger (absent in the game); it reads the fight and never draws. `redirect`: set only
 * while the ledger watches an enemy's single hit a taunt turned, with the other members it could have hit instead
 * (ledger.creditPrevented). `lastHit`: the HP the current action's latest landed hit took, and from whom (burn and bleed
 * are a share of it); each action starts without. `battle`: the fight being resolved (resolveRound sets it); an effect
 * that needs it does nothing without it (a bare test context, a cast outside battle).
 */
export interface EffectContext {
  rng: Rng; itemBoost: boolean; revealed: Record<string, Element[]>; log: BattleEvent[];
  ledger?: Ledger;
  redirect?: { pool: Combatant[]; cover?: true };
  battle?: BattleState;
  /** The id of the skill being cast, while its effects resolve. */
  cast?: string;
  /** The TP the current action paid for its skill (the hero's echo records it). */
  paid?: number;
  /** Who a foe's single blow went to by a cover, while that action and its aftermath (afterFoe) resolve (Scarlet's 回禮). */
  coverBlow?: string;
  lastHit?: { target: string; amount: number };
  /** The first foe the skill being cast has struck (plan 8e: 回聲 aims at it, whatever a bounce reaches after). */
  struck?: string;
  /**
   * The ailments 餘波 has tried this action, as `${target}:${status}` (plan 8e Task 5 review): a once-a-cast ailment of
   * the same kind on the same target is then not tried again (one try, the sure one: spec §6.6 rule 3).
   */
  afterTried?: string[];
  /**
   * Whose own action is resolving (plan 8e Task 6): set by resolveRound around `perform` only, so a blow struck at any
   * other time (devices, ticks, counters, echoes, reprises, triggered casts) sets off no trigger.
   */
  acting?: string;
  /** While a trigger rune's free cast resolves (plan 8h ruling 11b): it takes nothing for her mechanic and no TP back. */
  triggered?: true;
  /** The TP 回氣 has given back in this action (plan 8h ruling 11c): never more, all told, than the action paid. */
  regained?: number;
}

/** The skill a credit belongs to in a ledger split by skill: her own cast by hand, while it resolves (plan 8h ruling 9). */
const castOf = (ctx: EffectContext, actor: Combatant): string | undefined =>
  ctx.cast !== undefined && ctx.acting === actor.key && !ctx.triggered ? ctx.cast : undefined;

/** A power's percentage of a number, rounded half away from zero so a debuff (-37.5) rounds as deep as a buff (37.5). */
export const pctOf = (base: number, pct: number | undefined): number => {
  if (pct === undefined) return base;
  const v = (base * pct) / 100;
  return Math.sign(v) * Math.round(Math.abs(v)) || 0;   // `|| 0`: never -0
};

/**
 * A skill as one mod rewrites it; the original is never touched. `target` and `hpCost` replace the skill's own (an hpCost
 * of 0 is kept, so the skill costs no HP); `hits` and `element` go to damage; `powerPct` (plus `powerDelta` points) scales
 * damage, heal and device power, never a buff's percent; `buffPct` scales every buff and debuff percent; `turns` (plus
 * `turnsDelta`) goes to every effect that lasts; `chance` goes to poison inflicts only; `tpDelta` is added to a TP cost
 * (floored at 1); `extra` is appended as written.
 *
 * Stacking order (engine/battle.ts `skillFor` applies it, stages 2 and 3 as progression.treeMods gives them; this is the
 * one place it is stated):
 * 1. base: SKILLS[id];
 * 2. tree rank: the active node's ACTIVE_RANK_PCT on the skill's primary effect (progression.rankMod): powerPct for a
 *    damage, heal or device skill, buffPct for a pure buff or debuff skill; a debuff riding on damage never scales;
 * 3. tree variants: every variant node of the skill the member holds, folded into one mod by `stackMods` in tree order:
 *    absolute values (powerPct, buffPct, turns, chance, hpCost, hits, element, target) replace the earlier node's,
 *    relative values (tpDelta, powerDelta, turnsDelta) add; rules merge key by key;
 * 4. legendary powers last, one after another in the order worn;
 * 5. every `extra` (from the tree or a power) appended at the very end, so no powerPct or buffPct ever rescales it.
 * 6. then the member's runes (plan 8e, engine/runes.ts applyRunes): on the skill of stages 1-4 in one patch, the
 *    extras handed back after them; the abyss bonus (perform) and the caster's mechanic come after, in battle.
 */
export function patchSkill(def: SkillDef, mod: SkillMod): SkillDef {
  const power = mod.powerDelta === undefined ? mod.powerPct : (mod.powerPct ?? 100) + mod.powerDelta;
  const lasting = (t: number) => (mod.turns ?? t) + (mod.turnsDelta ?? 0);
  const effects = def.effects.map((e): Effect => {
    switch (e.kind) {
      case 'damage': return {
        ...e, power: pctOf(e.power, power),
        ...(mod.element !== undefined ? { element: mod.element } : {}), ...(mod.hits !== undefined ? { hits: mod.hits } : {}),
        // 一擊 (plan 8d ruling 7): the aim stacks count for more on this skill's hits.
        ...(mod.rules?.aimPct !== undefined ? { aimPct: mod.rules.aimPct } : {}),
      };
      // 滿溢 (plan 8d ruling 7): the heal's spill becomes a shield.
      case 'heal': return { ...e, power: pctOf(e.power, power), ...(mod.rules?.overflowPct !== undefined ? { overflowPct: mod.rules.overflowPct } : {}) };
      case 'buff': return { ...e, pct: pctOf(e.pct, mod.buffPct), turns: lasting(e.turns) };
      // Bobby's device rules (plan 8d ruling 7): 雙管's shots, 雙砲台's second turret, 急救's cures, 連鎖's shock.
      case 'device': return {
        ...e, power: pctOf(e.power, power), turns: lasting(e.turns),
        ...(mod.rules?.deviceHits !== undefined ? { hits: mod.rules.deviceHits } : {}),
        ...(mod.rules?.deviceTwin ? { twin: true as const } : {}),
        ...(mod.rules?.deviceCures !== undefined ? { cures: [...mod.rules.deviceCures] } : {}),
        ...(mod.rules?.deviceShock !== undefined ? { shock: mod.rules.deviceShock } : {}),
      };
      // 不動 (plan 8d ruling 7): never crit while the taunt lasts.
      case 'taunt': return { ...e, turns: lasting(e.turns), ...(mod.rules?.steady ? { steady: true as const } : {}) };
      case 'expose': return { ...e, turns: lasting(e.turns) };
      case 'veil': return { ...e, turns: lasting(e.turns) };
      // 祓 (plan 8d ruling 7): the purifying barrier it raises also wakes the party.
      case 'barrier': return { ...e, power: pctOf(e.power, power), turns: lasting(e.turns), ...(mod.rules?.wake ? { wake: true as const } : {}) };
      case 'aim-lock': return { ...e, turns: lasting(e.turns) };
      // 雙肩 (plan 8d ruling 7): her other cover stays.
      case 'cover': return { ...e, turns: lasting(e.turns), ...(mod.rules?.keep ? { keep: true as const } : {}) };
      case 'riposte': return { ...e, power: pctOf(e.power, power), turns: lasting(e.turns) };
      case 'gauge': return { ...e, amount: pctOf(e.amount, power) };
      // The moon's hold counts as its rounds (moon-recall's ranks hold the phase it steps back to; 新月之夜 holds the new
      // moon, plan 8d ruling 7).
      case 'moon': return {
        ...e,
        ...(mod.turns !== undefined || mod.turnsDelta !== undefined ? { hold: lasting(e.hold ?? 0) } : {}),
        ...(mod.rules?.phase !== undefined ? { phase: mod.rules.phase } : {}),
      };
      // A sleep's rounds follow `turns` (深眠, plan 8d ruling 7); every other ailment keeps its own.
      case 'inflict': return {
        ...e, chance: e.status === 'poison' ? mod.chance ?? e.chance : e.chance,
        ...(e.status === 'sleep' && (mod.turns !== undefined || mod.turnsDelta !== undefined) ? { turns: lasting(e.turns ?? SLEEP_TURNS) } : {}),
      };
      // Rules that belong to the mark (plan 8d ruling 7): 不眨眼's crit damage, 轉印's jumps.
      case 'mark': return {
        ...e,
        ...(mod.rules?.markCritPct !== undefined ? { critPct: mod.rules.markCritPct } : {}),
        ...(mod.rules?.markHops !== undefined ? { hops: mod.rules.markHops } : {}),
      };
      default: return { ...e };
    }
  });
  const out: SkillDef = { ...def, effects: [...effects, ...(mod.extra ?? []).map((e) => ({ ...e }))] };
  // The words follow the numbers (plan 8c): any number an effect's description names (its rounds, a buff's or debuff's
  // percent, a barrier's percent, an ailment's chance, its hits) is rewritten to the effective one, effect by effect.
  // Rounds are named again wherever they stand (a variant's note names them too): see `rounds` after the loop.
  const rounds = new Map<number, number>();
  def.effects.forEach((e, i) => {
    const now = effects[i] as unknown as Record<string, unknown>;
    for (const [f, say] of NAMED_NUMBERS(e)) {
      const was = (e as unknown as Record<string, unknown>)[f], is = now[f];
      if (typeof was !== 'number' || typeof is !== 'number' || was === is) continue;
      if (f === 'turns') { if (!rounds.has(was)) rounds.set(was, is); } else out.desc = out.desc.replace(say(was), say(is));
    }
    // 新月之夜 (plan 8d): the night's words name the phase it holds and for how long (8d final review).
    if (e.kind === 'moon' && e.step === undefined) {
      const was = e as { hold?: number; phase?: 'new' }, is = now as { hold?: number; phase?: 'new' };
      if (was.hold !== undefined && is.hold !== undefined && was.hold !== is.hold) out.desc = out.desc.replace(`${was.hold} 回合`, `${is.hold} 回合`);
      if ((is.phase ?? 'full') !== (was.phase ?? 'full')) out.desc = out.desc.replace(T.mech.phase[was.phase ?? 'full'], T.mech.phase[is.phase ?? 'full']);
    }
    // 收回's ranks hold the phase it steps back to: the words say for how many more round ends.
    const held = (now as { hold?: number }).hold ?? 0;
    if (e.kind === 'moon' && e.step === -1 && held > (e.hold ?? 0)) out.desc += T.mech.recallHold(held);
  });
  // Every old count of rounds at once (plan 8g Task 2 review: 「7 回合內……降防持續 7 回合」 both), whole numbers only,
  // so one effect's new count is never taken for another's old one.
  if (rounds.size) {
    out.desc = out.desc.replace(new RegExp(`(?<![0-9])(${[...rounds.keys()].join('|')}) 回合`, 'g'), (_, n: string) => `${rounds.get(Number(n))} 回合`);
  }
  // 分期 (plan 8d): a coin spender's words name the power a coin as the variant makes it.
  if (mod.rules?.coinPowerPct !== undefined) {
    out.desc = out.desc.replace(T.mech.coinPower(def.rules?.coinPowerPct ?? COINS.coinPowerPct), T.mech.coinPower(mod.rules.coinPowerPct));
  }
  // ... and the share it spends (分期 spends half, so the words never say it spends them all).
  if (mod.rules?.coinSpendPct !== undefined) {
    out.desc = out.desc.replace(T.mech.coinSpend(def.rules?.coinSpendPct ?? 100), T.mech.coinSpend(mod.rules.coinSpendPct));
  }
  // A single-foe skill made to strike every foe (擴咒) speaks of them all (8d final review).
  if (mod.target === 'enemies' && def.target === 'enemy') out.desc = out.desc.replace(/牠(?!們)/g, '牠們');
  if (mod.target !== undefined) out.target = mod.target;
  if (mod.hpCost !== undefined) out.hpCost = mod.hpCost;
  if (mod.tpDelta !== undefined && def.tp > 0) out.tp = Math.max(1, def.tp + mod.tpDelta);
  // A variant (plan 8d): its label goes after the skill's name, its rule after the words; its rules merge key by key.
  // Points added by another variant (雙砲台's powerDelta) on top of a variant's percent (雙管's) are added into the percent
  // its words name, so the words give the real power (8d Task 8 review).
  const sum = mod.powerPct !== undefined && mod.powerDelta !== undefined ? mod.powerPct + mod.powerDelta : undefined;
  for (const n of mod.notes ?? []) {
    out.name += `・${n.label}`;
    const text = sum === undefined ? n.text : n.text.replace(T.mech.notePower(mod.powerPct!), T.mech.notePower(sum));
    // A note the skill's own words already carry adds nothing (V's inWords); after 「！」 or 「？」 no 「。」 is added.
    if (text) out.desc += (out.desc && !/[。！？]$/.test(out.desc) ? '。' : '') + text;
  }
  if (mod.rules) out.rules = { ...def.rules, ...definedOnly(mod.rules) };
  return out;
}

/** The keys of `o` whose value is not undefined (an undefined rule never overwrites one). */
const definedOnly = <O extends object>(o: O): Partial<O> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<O>;

/** The ways a description names an effect's number, by field (patchSkill keeps them true). */
const NAMED_NUMBERS = (e: Effect): [string, (v: number) => string][] => {
  const out: [string, (v: number) => string][] = [];
  if ('turns' in e) out.push(['turns', (v) => `${v} 回合`]);
  if (e.kind === 'buff') out.push(['pct', (v) => `${Math.abs(v)}%`]);
  if (e.kind === 'barrier') out.push(['power', (v) => `${v}%`]);
  if (e.kind === 'inflict') out.push(['chance', (v) => `${Math.round(v * 100)}%`]);
  if (e.kind === 'damage') out.push(['hits', (v) => `${v} 段`], ['hits', (v) => `${v} 次`], ['hits', (v) => `${v} 枚`]);
  if (e.kind === 'gauge') out.push(['amount', (v) => `+${v}`]);
  return out;
};

/**
 * Mod nodes of one skill folded into one mod: absolute values replace (the later node wins), deltas add, extra and notes
 * append, rules merge key by key (the later node wins a key).
 */
export function stackMods(mods: SkillMod[]): SkillMod {
  const out: SkillMod = {};
  for (const m of mods) {
    const { tpDelta, powerDelta, turnsDelta, extra, notes, rules, ...abs } = m;
    Object.assign(out, Object.fromEntries(Object.entries(abs).filter(([, v]) => v !== undefined)));
    for (const [k, v] of [['tpDelta', tpDelta], ['powerDelta', powerDelta], ['turnsDelta', turnsDelta]] as const) {
      if (v !== undefined) out[k] = (out[k] ?? 0) + v;
    }
    if (extra?.length) out.extra = [...(out.extra ?? []), ...extra];
    if (notes?.length) out.notes = [...(out.notes ?? []), ...notes];
    if (rules) out.rules = { ...out.rules, ...definedOnly(rules) };
  }
  return out;
}

export function reveal(revealed: Record<string, Element[]>, defId: string, el: Element): void {
  const list = revealed[defId] ?? (revealed[defId] = []);
  if (!list.includes(el)) list.push(el);
}

/** A keystone's TP refill on one hit: only when held, held to the maximum, logged when anything was gained. */
function keystoneTp(actor: Combatant, id: KeystoneId, n: number, ctx: EffectContext): void {
  if (!actor.keystones.includes(id) || actor.tp >= actor.max.tp) return;
  const before = actor.tp;
  actor.tp = Math.min(actor.max.tp, actor.tp + n);
  ctx.log.push({ type: 'tp', target: actor.key, amount: actor.tp - before });
}

/** What a heal of `power` by `actor` restores before the target's max (the shield generator gives as much). */
export function healAmount(actor: Combatant, power: number, bonus?: number): number {
  let k = bonus;
  if (k === undefined) {
    k = 1 + (actor.x.heal ?? 0) / 100;
    if (actor.keystones.includes('moon-promise')) k *= 1 + MEMORY_KEYSTONE_VALUES.moonHealPct / 100;
  }
  return Math.floor((power / 100) * (stat(actor, 'mag') * 2 + 10) * k);
}

/** The ailment each element brings on a 餘波 crit (plan 8e). */
export const ELEMENT_AILMENT: Record<Element, AilmentId> = { phys: 'bleed', fire: 'burn', ice: 'freeze', thunder: 'shock' };

/**
 * The runes riding on one landed hit (plan 8e Task 4), in this order: 吸血 heals the caster a share of the HP the target
 * lost; 回氣 gives her TP; each 命中異常 is tried on the target; 餘波 brings the element's ailment on a crit. Ailments are
 * tried only on a target still standing. Only the ailments draw, one each, and only when the hit carries them.
 */
function runeHit(actor: Combatant, target: Combatant, eff: Extract<Effect, { kind: 'damage' }>, crit: boolean, hpLost: number, ctx: EffectContext): void {
  if (eff.drainPct !== undefined && actor.alive) {
    // What the target really lost: no overkill, nothing a shield took.
    const n = Math.floor((hpLost * eff.drainPct) / 100);
    if (n > 0) {
      const gained = gainHp(actor, n);
      credit(ctx.ledger, actor.key, 'healing', gained, castOf(ctx, actor));
      ctx.log.push({ type: 'heal', target: actor.key, amount: gained });
    }
  }
  if (eff.tpPerHit !== undefined && actor.alive && actor.tp < actor.max.tp) {
    // Never more, over the whole action, than the TP it paid (plan 8h ruling 11c): a free cast gets nothing back.
    const room = (ctx.triggered ? 0 : ctx.paid ?? 0) - (ctx.regained ?? 0);
    const n = Math.min(eff.tpPerHit, room, actor.max.tp - actor.tp);
    if (n > 0) {
      actor.tp += n;
      ctx.regained = (ctx.regained ?? 0) + n;
      ctx.log.push({ type: 'tp', target: actor.key, amount: n });
    }
  }
  if (!target.alive) return;
  // 餘波 on a crit makes the hit's own ailment of that kind sure (one try, the higher chance: spec §6.6 rule 3), and is
  // tried on its own only when the hit carries no such ailment.
  const after = eff.aftermath && crit ? ELEMENT_AILMENT[eff.element] : undefined;
  if (after) (ctx.afterTried ??= []).push(`${target.key}:${after}`);
  for (const a of eff.onHit ?? []) inflictAilment(actor, target, a.status, a.status === after ? 1 : a.chance, ctx);
  if (after && !eff.onHit?.some((a) => a.status === after) && target.alive) inflictAilment(actor, target, after, 1, ctx);
}

/**
 * A ledger that asks (`buffGivers`, plan 8h Task 5b, H3): each ally's attack buff on the hitter, and each ally's debuff on
 * the foe's guard, taken away alone with the same rolls; what the hit would have lost less is that giver's, out of the
 * hitter's `own` share. Returns what was given away. Nothing without such a ledger.
 */
function creditGivers(l: Ledger | undefined, a: Combatant, t: Combatant, eff: Extract<Effect, { kind: 'damage' }>, rolls: HitRolls, own: number): number {
  if (!l?.buffGivers) return 0;
  const guard = eff.scale === 'atk' ? 'def' : 'res';
  const loss = (alt: Combatant, foe: Combatant) => lossOf(t, hitAmount(alt, foe, eff, rolls).amount);
  const now = loss(a, t);
  let given = 0;
  const give = (b: Buff, without: number) => {
    if (!b.src || b.src === a.key) return;
    const n = Math.min(own - given, Math.max(0, now - without));
    if (n > 0) { credit(l, b.src, 'damage', n, b.skill); given += n; }
  };
  a.buffs.forEach((b, i) => { if (b.stat === eff.scale && b.pct > 0) give(b, loss({ ...a, buffs: a.buffs.filter((_, j) => j !== i) }, t)); });
  (a.auras ?? []).forEach((b, i) => { if (b.stat === eff.scale && b.pct > 0) give(b, loss({ ...a, auras: (a.auras ?? []).filter((_, j) => j !== i) }, t)); });
  t.buffs.forEach((b, i) => { if (b.stat === guard && b.pct < 0) give(b, loss(a, { ...t, buffs: t.buffs.filter((_, j) => j !== i) })); });
  return given;
}

function gainHp(t: Combatant, amount: number): number {
  const before = t.hp;
  t.hp = Math.min(t.max.hp, t.hp + amount);
  return t.hp - before;
}

/** The partner's half of a shared wound (roster plan B4, M20): it lands as it is, no roll, no on-hit effect. */
function shareWound(actor: Combatant, twin: Combatant, n: number, element: Element, ctx: EffectContext): void {
  if (n <= 0) return;
  if (actor.side === 'party') credit(ctx.ledger, actor.key, 'damage', lossOf(twin, n), castOf(ctx, actor));
  const lost = dealDamage(twin, n, { ledger: ctx.ledger, log: ctx.log });
  ctx.log.push({ type: 'damage', target: twin.key, amount: lost, element, mult: 1 });
  if (!twin.alive) ctx.log.push({ type: 'ko', target: twin.key });
}

/** A landed hit unmasks a foe in disguise (roster plan B3, M14): its own name comes back. */
function unmask(t: Combatant, ctx: EffectContext): void {
  if (t.disguised === undefined) return;
  t.name = t.disguised;
  delete t.disguised;
  ctx.log.push({ type: 'foe', actor: t.key, cue: 'reveal' });
}

export function applyEffect(actor: Combatant, target: Combatant, eff: Effect, ctx: EffectContext): void {
  switch (eff.kind) {
    case 'damage': {
      // Multistrike adds one hit, only to a single-hit effect; a chance of 0 draws nothing (the one rule, combatant.roll).
      const extra = (eff.hits ?? 1) === 1 && roll((actor.x.multi ?? 0) / 100, ctx.rng) ? 1 : 0;
      for (let i = 0; i < (eff.hits ?? 1) + extra && target.alive; i++) {
        const rolls = rollHit(actor, target, eff, ctx.rng);
        if (!rolls) { ctx.log.push({ type: 'miss', target: target.key }); continue; }
        const { amount: full, mult, crit } = hitAmount(actor, target, eff, rolls);
        // Shared wounds (roster plan B4, M20): while its partner stands, the target takes half (rounded up), the partner the rest.
        const twin = target.share ? ctx.battle?.enemies.find((e) => e.key === target.share && e.alive) : undefined;
        const amount = twin ? Math.ceil(full / 2) : full;
        if (ctx.ledger) {
          if (actor.side === 'party' && target.side === 'enemy') {
            // A 同步's lift goes to its giver: the loss less what the power before it would have taken, the same rolls.
            const loss = lossOf(target, amount);
            const own = eff.lift ? Math.min(loss, lossOf(target, hitAmount(actor, target, { ...eff, power: eff.lift.from }, rolls).amount)) : loss;
            credit(ctx.ledger, eff.lift?.by, 'damage', loss - own);
            credit(ctx.ledger, actor.key, 'damage', own - creditGivers(ctx.ledger, actor, target, eff, rolls, own), castOf(ctx, actor));
          } else if (actor.side === 'enemy' && target.side === 'party') creditPrevented(ctx.ledger, actor, target, eff, rolls, amount, ctx.redirect);
        }
        const hpBefore = target.hp;
        const lost = dealDamage(target, amount, { ledger: ctx.ledger, log: ctx.log });
        unmask(target, ctx);
        ctx.lastHit = { target: target.key, amount: lost };
        // A fight with a foe that borrows blows keeps the party's last one (roster plan B8, M6); no other fight does.
        if (actor.side === 'party' && target.side === 'enemy' && ctx.battle?.enemies.some((e) => e.mirrors)) ctx.battle.lastPartyHit = { by: actor.key, element: eff.element, power: eff.power };
        // A foe whose weakness turns tells the bestiary nothing (roster plan B7, M5).
        if (target.side === 'enemy' && !target.prism) reveal(ctx.revealed, target.defId, eff.element);
        ctx.log.push({ type: 'damage', target: target.key, amount: lost, element: eff.element, mult, ...(crit ? { crit } : {}) });
        if (!target.alive) ctx.log.push({ type: 'ko', target: target.key });
        if (twin) shareWound(actor, twin, full - amount, eff.element, ctx);
        adaptTo(target, eff.element, ctx.log);   // the first element to land on a foe that adapts (roster plan B7, M16)
        onLandedHit(actor, target, ctx);
        // Her runes on this hit (plan 8e): absent fields do nothing and draw nothing.
        runeHit(actor, target, eff, crit, hpBefore - target.hp, ctx);
        // Her crit or kill, or a foe's blow on her, may set off a trigger rune (plan 8e Task 6).
        noteHit(actor, target, crit, ctx);
        // crit-tp, weak-tp and kill-tp settle on every hit; none of them draws.
        if (crit) keystoneTp(actor, 'crit-tp', KEYSTONE_VALUES.critTp, ctx);
        if (isWeak(target, eff.element)) keystoneTp(actor, 'weak-tp', KEYSTONE_VALUES.weakTp, ctx);
        if (!target.alive) keystoneTp(actor, 'kill-tp', KEYSTONE_VALUES.killTp, ctx);
      }
      return;
    }
    case 'heal': {
      if (!target.alive) return;
      // The healer's heal bonus multiplies the amount; without it the value is unchanged to the bit.
      let bonus = 1 + (actor.x.heal ?? 0) / 100;
      if (actor.keystones.includes('moon-promise')) bonus *= 1 + MEMORY_KEYSTONE_VALUES.moonHealPct / 100;
      const full = healAmount(actor, eff.power, bonus);
      const room = target.max.hp - target.hp;
      const amount = gainHp(target, full);
      if (actor.side === 'party' && target.side === 'party') {
        // A 同步's lift goes to its giver: what the heal restored past what the power before it would have.
        const own = eff.lift ? Math.min(amount, Math.max(0, Math.min(healAmount(actor, eff.lift.from, bonus), room))) : amount;
        credit(ctx.ledger, eff.lift?.by, 'healing', amount - own);
        credit(ctx.ledger, actor.key, 'healing', own, castOf(ctx, actor));
      }
      ctx.log.push({ type: 'heal', target: target.key, amount });
      // 滿溢 (plan 8d): the spill shields, up to the cap, as the shield generator does (the bigger shield stays, now theirs).
      if (eff.overflowPct !== undefined && full > amount) {
        const shield = Math.min(full - amount, Math.floor((target.max.hp * eff.overflowPct) / 100));
        const skill = castOf(ctx, actor);
        if (shield > 0) target.shield = { amount: Math.max(shield, target.shield?.amount ?? 0), src: actor.key, ...(skill ? { skill } : {}) };
      }
      return;
    }
    case 'restore': {
      if (!target.alive) return;
      const k = ctx.itemBoost ? 2 : 1;
      if (eff.hp) {
        const amount = gainHp(target, eff.hp * k);
        if (actor.side === 'party' && target.side === 'party') credit(ctx.ledger, actor.key, 'healing', amount);
        ctx.log.push({ type: 'heal', target: target.key, amount });
      }
      if (eff.tp) {
        const before = target.tp;
        target.tp = Math.min(target.max.tp, target.tp + eff.tp * k);
        ctx.log.push({ type: 'tp', target: target.key, amount: target.tp - before });
      }
      return;
    }
    case 'revive': {
      if (target.alive) return;
      target.alive = true;
      target.hp = Math.max(1, Math.floor(target.max.hp * eff.hpPct));
      if (target.side === 'enemy') target.rose = true;   // a foe stands again once only (roster plan B4, M22)
      ctx.log.push({ type: 'revive', target: target.key });
      return;
    }
    case 'cure': {
      if (!target.alive) return;
      // The list `curable` names (difficulty plan Task 2): every ailment, the freeze guard kept.
      cureAilments(target, CURED);
      ctx.log.push({ type: 'cure', target: target.key });
      return;
    }
    case 'inflict': {
      if (!target.alive) return;
      // 餘波 already tried this ailment on this target, for sure, in this cast (plan 8e Task 5 review).
      if (ctx.afterTried?.includes(`${target.key}:${eff.status}`)) return;
      inflictAilment(actor, target, eff.status, eff.chance, ctx, eff.turns);
      return;
    }
    case 'buff': {
      if (!target.alive) return;
      // troupe-step: her buffs on her own side last longer (a debuff on a foe does not).
      const more = actor.keystones.includes('troupe-step') && target.side === actor.side ? MEMORY_KEYSTONE_VALUES.troupeTurns : 0;
      // A ledger that credits buff givers learns which cast of hers gave it (plan 8h Task 5b review).
      const skill = ctx.ledger?.buffGivers ? castOf(ctx, actor) : undefined;
      addBuff(target, { stat: eff.stat, pct: eff.pct, turns: eff.turns + more, src: actor.key, ...(skill ? { skill } : {}) });
      ctx.log.push({ type: 'buff', target: target.key, stat: eff.stat, pct: eff.pct });
      return;
    }
    case 'taunt': {
      actor.taunt = eff.turns;
      if (eff.steady) actor.steady = true; else delete actor.steady;
      ctx.log.push({ type: 'taunt', target: actor.key });
      return;
    }
    case 'device': {
      if (target !== actor) return;
      // Set by her own hand cast, a ledger split by skill credits its shields to that skill (plan 8h Task 3 review).
      placeDevice(actor, eff, ctx.cast ?? eff.device, castOf(ctx, actor) !== undefined);
      return;
    }
    case 'overclock': {
      if (target === actor) overclock(actor, ctx);
      return;
    }
    case 'tune-up': {
      if (target === actor) tuneUp(actor, eff.levels, eff.turns);
      return;
    }
    case 'expose': {
      if (!target.alive) return;
      target.exposed = Math.max(target.exposed ?? 0, eff.turns);
      return;
    }
    case 'mark': {
      // Her mark moves onto the target; with room for more (cap > 1) the oldest goes first.
      const m = actor.mech;
      if (m?.kind !== 'mark' || !target.alive) return;
      m.marks = [...m.marks.filter((k) => k !== target.key), target.key].slice(-m.cap);
      // What the mark carries as cast (plan 8d): 不眨眼's crit damage, 轉印's jumps for this fight.
      if (eff.critPct !== undefined) m.crit = eff.critPct; else delete m.crit;
      if (eff.hops !== undefined) m.hops = eff.hops; else delete m.hops;
      return;
    }
    case 'veil': {
      if (target !== actor) return;   // on the caster alone (plan 8c ruling 6)
      actor.veil = eff.turns;
      actor.nextCrit = true;
      return;
    }
    case 'barrier': {
      // Over the whole party, once (ruling 6), and only in a fight (ruling 7): it replaces any barrier up (with 重結界,
      // only one of its own kind: engine/mechanics/barrier.ts).
      const s = ctx.battle;
      if (target !== actor || !s) return;
      raiseBarrier(s, actor, eff, ctx.cast ?? '');
      return;
    }
    case 'barrier-boost': {
      const s = ctx.battle;
      if (target !== actor || !s) return;
      const b = s.barriers?.[0];
      if (!b) { ctx.log.push({ type: 'mech', actor: actor.key, cue: 'no-barrier' }); return; }
      // Both, under 重結界. A lasting barrier (plan 8e) gains no rounds: its boost counts down on its own.
      s.barriers = s.barriers!.map((x) => (x.lasting ? { ...x, boost: eff.mul, boostTurns: eff.turns } : { ...x, boost: eff.mul, turns: x.turns + eff.turns }));
      return;
    }
    case 'coins': {
      const m = actor.mech;
      if (m?.kind === 'coins') m.coins = Math.min(coinCapOf(actor), m.coins + eff.amount);
      return;
    }
    case 'appraise': {
      if (!target.alive) return;
      target.appraised = actor.key;
      if (!target.prism) for (const el of target.weak) reveal(ctx.revealed, target.defId, el);
      return;
    }
    case 'delay': {
      if (!target.alive) return;
      target.delay = (ctx.battle?.round ?? 0) + 1;
      return;
    }
    case 'aim-add': {
      // 命中後: only a foe this volley really hit; her aimed foe gains stacks, and with no aim yet the first foe it hits
      // becomes it. Draws nothing.
      const m = actor.mech;
      if (m?.kind !== 'aim' || !target.alive || target.side === actor.side || ctx.lastHit?.target !== target.key) return;
      if (m.target === null) m.target = target.key;
      if (m.target === target.key) m.stacks = Math.min(aimCapOf(actor), m.stacks + eff.n);
      return;
    }
    case 'aim-lock': {
      if (!target.alive || actor.mech?.kind !== 'aim') return;
      actor.mech = { kind: 'aim', target: target.key, stacks: aimCapOf(actor), lock: eff.turns };
      return;
    }
    case 'cover': {
      if (!target.alive || target === actor) return;
      // 雙肩 (plan 8d): the other cover she had stays beside the new one (two at most): her newest unless that is this
      // ally, whose cover is only renewed (so a cover cast again on either of the two keeps the other).
      const kept = eff.keep ? [actor.cover, actor.coverAlso].find((x) => x && x.ally !== target.key) : undefined;
      actor.cover = { ally: target.key, turns: eff.turns };
      if (kept) actor.coverAlso = kept; else delete actor.coverAlso;
      return;
    }
    case 'embers': {
      // 高喊 (plan 8d): embers on the spot, up to her cap.
      if (target === actor) addEmbers(actor, Math.floor((actor.max.hp * eff.pct) / 100));
      return;
    }
    case 'riposte': {
      if (target !== actor) return;
      actor.riposte = { power: eff.power, turns: eff.turns };
      return;
    }
    case 'challenge': {
      if (!target.alive) return;
      target.challenged = { by: actor.key, round: (ctx.battle?.round ?? 0) + 1 };
      return;
    }
    case 'gauge': {
      if (!target.alive || target.side !== 'party') return;
      const before = target.limit;
      target.limit = Math.min(100, target.limit + eff.amount);
      // Fed to another member: counted apart in a ledger that asks (plan 8h Task 5b, H3).
      const gauge = ctx.ledger?.gauge;
      if (gauge && target !== actor && target.limit > before) gauge[actor.key] = (gauge[actor.key] ?? 0) + target.limit - before;
      return;
    }
    case 'steal': {
      // Only on a hit that landed on this target in this action, and only from a run pack (the sim has none). No draw.
      const purse = ctx.battle?.purse;
      if (!purse || actor.side !== 'enemy' || ctx.lastHit?.target !== target.key) return;
      const n = Math.min(purse.gold, purse.depth * eff.perDepth);
      if (n <= 0) return;
      purse.gold -= n;
      actor.stolen = (actor.stolen ?? 0) + n;
      ctx.log.push({ type: 'foe', actor: actor.key, cue: 'steal', target: target.key, amount: n });
      return;
    }
    case 'hunt': {
      // A foe calls a member out for next round (roster plan B2, M24); draws nothing.
      if (!target.alive || target.side === actor.side || target.veil) return;   // a veil beats a hunt (B1 review item 11)
      target.hunted = (ctx.battle?.round ?? 0) + 1;
      return;
    }
    case 'moon': {
      const m = ctx.battle?.moon;
      if (target !== actor || !m) return;
      const order = MOON.order;
      m.phase = eff.step === -1 ? order[(order.indexOf(m.phase) + order.length - 1) % order.length] : eff.phase ?? 'full';
      if (eff.hold) m.hold = { turns: eff.hold };
      else delete m.hold;
      return;
    }
  }
}
