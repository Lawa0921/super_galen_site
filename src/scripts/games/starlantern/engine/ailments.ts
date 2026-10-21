/**
 * The ailments (spec §9, plan 8b): poison and sleep as before, plus burn, freeze (a boss is chilled instead), shock and
 * bleed. They live as optional fields on a Combatant, so a combatant without them is the same object as before. Nothing in
 * the data inflicts the new four yet; later plans add their sources.
 */
import { dealDamage, roll, SLEEP_TURNS, type Combatant } from './combatant';
import { credit, lossOf } from './ledger';
import type { EffectContext } from './skills';
import type { SecondaryKey } from './types';

export type AilmentId = 'poison' | 'sleep' | 'burn' | 'freeze' | 'shock' | 'bleed';
/** What the log and the screen show: a boss's freeze is shown as the chill it became. */
export type AilmentShown = AilmentId | 'chill';

export const AILMENT = {
  burnPct: 35, burnTurns: 3, bleedPct: 20, bleedTurns: 3, bleedMax: 3, shockPct: 20, shockTurns: 2,
  /** Set when a frozen turn is spent; the round's end takes 1, so the rest of that round and the next two are safe. */
  freezeGuard: 3,
  chillSpdPct: -30, chillTurns: 2, bossMul: 0.5,
} as const;

/** One damage-over-time stack: its tick, the rounds it has left, and who caused it (the ledger credits the tick to them). */
export interface Dot { tick: number; turns: number; src: string }

const RES: Partial<Record<AilmentId, SecondaryKey>> = {
  poison: 'poisonRes', sleep: 'sleepRes', burn: 'fireRes', freeze: 'iceRes', shock: 'thunderRes',
};

/**
 * The chance that an inflict lands: chance x (a boss halves it, but not a freeze) x (1 - the matching resistance / 100).
 * Bleed has no resistance. A foe still guarded after a freeze cannot be frozen (0). Poison and sleep are the old formula,
 * in the same order of operations.
 */
export function ailmentChance(t: Combatant, status: AilmentId, chance: number): number {
  if (status === 'freeze' && !t.boss && (t.freezeGuard ?? 0) > 0) return 0;
  const key = RES[status];
  const res = (key ? t.x[key] : 0) ?? 0;
  return chance * (t.boss && status !== 'freeze' ? AILMENT.bossMul : 1) * (1 - res / 100);
}

const tickOf = (amount: number, pct: number): number => Math.max(1, Math.floor((amount * pct) / 100));

/** One burn stays: the stronger tick (and its source) wins, ties keep the old one; the turns are the longer of the two. */
function addBurn(t: Combatant, d: Dot): void {
  const old = t.burn;
  if (!old) { t.burn = d; return; }
  t.burn = d.tick > old.tick ? { ...d, turns: Math.max(d.turns, old.turns) } : { ...old, turns: Math.max(d.turns, old.turns) };
}

/** Up to three bleed stacks; a full set takes the new one only in place of a weaker one (the fewest turns left among equals). */
function addBleed(t: Combatant, d: Dot): void {
  const list = t.bleed ?? (t.bleed = []);
  if (list.length < AILMENT.bleedMax) { list.push(d); return; }
  let weakest = 0;
  list.forEach((x, i) => {
    const w = list[weakest];
    if (x.tick < w.tick || (x.tick === w.tick && x.turns < w.turns)) weakest = i;
  });
  if (d.tick > list[weakest].tick) list[weakest] = d;
}

/**
 * Tries to inflict `status` on `t`. Poison and sleep draw once, always (their old sequence). The new four draw only when
 * their chance is above 0 and log nothing when it is not: burn and bleed need a hit on `t` in this action (`ctx.lastHit`),
 * and their tick is a share of it; a guarded foe cannot be frozen; a boss is chilled instead of frozen. `turns`: a sleep's
 * rounds when a variant sets them (深眠, plan 8d); absent, SLEEP_TURNS.
 */
export function inflictAilment(actor: Combatant, t: Combatant, status: AilmentId, chance: number, ctx: EffectContext, turns?: number): void {
  if (status === 'poison' || status === 'sleep') {
    if (ctx.rng() < ailmentChance(t, status, chance)) {
      if (status === 'poison') {
        // The first poisoner keeps the credit while the poison lasts (the contribution ledger).
        if (!t.poison) t.poisonSrc = actor.key;
        t.poison = true;
      } else t.sleep = turns ?? SLEEP_TURNS;
      ctx.log.push({ type: 'status', target: t.key, status });
    } else ctx.log.push({ type: 'resist', target: t.key });
    return;
  }
  let hit = 0;
  if (status === 'burn' || status === 'bleed') {
    if (!ctx.lastHit || ctx.lastHit.target !== t.key) return;
    hit = ctx.lastHit.amount;
  }
  const p = ailmentChance(t, status, chance);
  if (!(p > 0)) return;
  if (!roll(p, ctx.rng)) { ctx.log.push({ type: 'resist', target: t.key }); return; }
  let shown: AilmentShown = status;
  switch (status) {
    case 'burn': addBurn(t, { tick: tickOf(hit, AILMENT.burnPct), turns: AILMENT.burnTurns, src: actor.key }); break;
    case 'bleed': addBleed(t, { tick: tickOf(hit, AILMENT.bleedPct), turns: AILMENT.bleedTurns, src: actor.key }); break;
    case 'shock': t.shock = Math.max(t.shock ?? 0, AILMENT.shockTurns); break;
    case 'freeze':
      if (t.boss) { t.chill = Math.max(t.chill ?? 0, AILMENT.chillTurns); shown = 'chill'; } else t.frozen = true;
      break;
  }
  ctx.log.push({ type: 'status', target: t.key, status: shown });
}

/** A tick on a shocked combatant is 20% more (rounded down, at least 1). Integer arithmetic, so 10 is exactly 12. */
export function shockTick(c: Combatant, n: number): number {
  return c.shock ? Math.max(1, Math.floor((n * (100 + AILMENT.shockPct)) / 100)) : n;
}

/**
 * Round end, after poison: the burn ticks, then each bleed stack in order, each raised by shock. A tick on an enemy is
 * credited to the stack's source in the ledger (before it lands, so no overkill). A fall is logged and ends the ticking.
 */
export function tickAilments(c: Combatant, ctx: EffectContext): void {
  const ticks: [Dot, 'burn' | 'bleed'][] = [...(c.burn ? [[c.burn, 'burn'] as [Dot, 'burn']] : []), ...(c.bleed ?? []).map((d) => [d, 'bleed'] as [Dot, 'bleed'])];
  for (const [d, status] of ticks) {
    if (!c.alive) return;
    const amount = shockTick(c, d.tick);
    if (c.side === 'enemy') credit(ctx.ledger, d.src, 'damage', lossOf(c, amount));
    ctx.log.push({ type: 'dot-tick', target: c.key, amount: dealDamage(c, amount, { dot: true, ledger: ctx.ledger, log: ctx.log }), status });
    if (!c.alive) ctx.log.push({ type: 'ko', target: c.key });
  }
}

/** Round end, after the buffs: burn, bleed stacks, shock, chill and the freeze guard each lose a round; at 0 they are gone. */
export function ageAilments(c: Combatant): void {
  if (c.burn) { if (c.burn.turns > 1) c.burn = { ...c.burn, turns: c.burn.turns - 1 }; else delete c.burn; }
  if (c.bleed) {
    const left = c.bleed.map((d) => ({ ...d, turns: d.turns - 1 })).filter((d) => d.turns > 0);
    if (left.length) c.bleed = left; else delete c.bleed;
  }
  for (const k of ['shock', 'chill', 'freezeGuard'] as const) {
    const n = c[k];
    if (n === undefined) continue;
    if (n > 1) c[k] = n - 1; else delete c[k];
  }
}

/** Takes off the new ailments: a fall takes everything; a cure keeps the freeze guard (`keepGuard`). Poison and sleep are the caller's. */
export function clearAilments(c: Combatant, opts: { keepGuard?: boolean } = {}): void {
  delete c.burn; delete c.bleed; delete c.shock; delete c.frozen; delete c.chill;
  if (!opts.keepGuard) delete c.freezeGuard;
}

/** One ailment as the screen shows it: its rounds left (none for poison and freeze), the bleed's stack count. */
export interface AilmentChip { id: AilmentShown; turns?: number; stacks?: number }

/** The ailments a combatant holds, in a fixed order: poison, sleep, burn, bleed, shock, freeze, chill. */
export function ailmentChips(c: Combatant): AilmentChip[] {
  const out: AilmentChip[] = [];
  if (c.poison) out.push({ id: 'poison' });
  if (c.sleep > 0) out.push({ id: 'sleep', turns: c.sleep });
  if (c.burn) out.push({ id: 'burn', turns: c.burn.turns });
  if (c.bleed?.length) out.push({ id: 'bleed', stacks: c.bleed.length, turns: Math.max(...c.bleed.map((d) => d.turns)) });
  if (c.shock) out.push({ id: 'shock', turns: c.shock });
  if (c.frozen) out.push({ id: 'freeze' });
  if (c.chill) out.push({ id: 'chill', turns: c.chill });
  return out;
}
