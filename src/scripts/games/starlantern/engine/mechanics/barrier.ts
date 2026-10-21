/**
 * Chizuru's barriers (spec §8.2, plan 8c rulings 6–7, 9; plan 8d Task 5): one barrier over the party at a time, a new one
 * replacing the old; with her 重結界, two of different kinds, a new one replacing only its own kind and working at the
 * node's percent as the later of the two. The guard barrier is the party's def and res (battle.syncWards mirrors it as each
 * member's `ward`; the ledger credits what it prevents to her). The purifying barrier, before any tick at each round's end,
 * heals every living member (her heal, credited to her even once she is down) and cures their poison (with her 祓, their
 * sleep too). With her 雷之結界, while a barrier is up, each round's end then strikes every living foe with thunder, credited
 * to her: an ambient strike, not her blow (it wakes no sleeper, gives no keystone TP, sets off no on-hit mechanic, and still
 * tells the foe's weakness). Each round's end takes a round off; a barrier lasts its rounds (and strikes) whether she stands
 * or not. A `release` skill spends
 * the barrier: 10% more power for each round it had left (with 連解 the barrier stays, that many rounds shorter).
 * Only the thunder draws: one hit's rolls on each foe it strikes (plan 8d 「亂數」).
 */
import { syncWards, type BattleState } from '../battle';
import { dealDamage, hitAmount, rollHit, type Combatant } from '../combatant';
import { credit, lossOf } from '../ledger';
import { knobOf } from '../progression';
import type { Rng } from '../rng';
import { applyEffect, pctOf, reveal, type EffectContext } from '../skills';
import { T } from '../../data/text.zh-TW';
import type { Effect } from '../types';
import type { MechModule } from './index';
import { BARRIER, barrierPower, type Barrier } from '../mech';

export { BARRIER };

/** The barrier a release reads: the one with the most rounds left (one barrier, or two under 重結界). */
const longest = (s: BattleState): Barrier | undefined =>
  (s.barriers ?? []).reduce<Barrier | undefined>((a, b) => (!a || b.turns > a.turns ? b : a), undefined);

/** Who raised the barriers up now (only Chizuru raises them), if she is in the fight. */
const ownerOf = (s: BattleState): Combatant | undefined => {
  const src = s.barriers?.[0]?.src;
  return src === undefined ? undefined : s.party.find((c) => c.key === src);
};

/** The thunder's power while a barrier is up (her 雷之結界), or undefined. */
const thunderOf = (s: BattleState): { owner: Combatant; power: number } | undefined => {
  const owner = ownerOf(s);
  const power = owner && knobOf(owner, 'barrierThunder');
  return owner && power !== undefined ? { owner, power } : undefined;
};

/**
 * `c` raises the barrier `eff` over the party: it replaces the barrier up, or with her 重結界 only one of its own kind, and
 * then, as the later of two kinds, it works at the node's percent (the earlier one at its whole).
 */
export function raiseBarrier(s: BattleState, c: Combatant, eff: Extract<Effect, { kind: 'barrier' }>, skill: string): void {
  const raised: Barrier = { skill, kind: eff.barrier, power: eff.power, turns: eff.turns, src: c.key, ...(eff.wake ? { wake: true as const } : {}) };
  const pair = knobOf(c, 'barrierPair');
  const other = pair === undefined ? undefined : s.barriers?.find((b) => b.kind !== eff.barrier);
  if (!other) { s.barriers = [raised]; return; }
  const { pair: _later, ...earlier } = other;
  s.barriers = [earlier, { ...raised, pair: pair! }];
}

/**
 * 雷之結界: one thunder hit on every living foe, its rolls drawn as a hit's, its damage credited to the barrier's owner, down
 * or not. Ambient, like a tick: `dot`, so a sleeper sleeps on (Selene's 深眠); no keystone TP, no onLandedHit.
 */
function strike(s: BattleState, ctx: EffectContext, rng: Rng): void {
  const t = thunderOf(s);
  if (!t) return;
  const spec = { power: t.power, element: 'thunder', scale: 'atk', melee: false } as const;
  const foes = s.enemies.filter((e) => e.alive);
  if (!foes.length) return;
  ctx.log.push({ type: 'act', actor: t.owner.key, label: T.mech.thunderWard });
  for (const foe of foes) {
    const rolls = rollHit(t.owner, foe, spec, rng);
    if (!rolls) { ctx.log.push({ type: 'miss', target: foe.key }); continue; }
    const { amount, mult, crit } = hitAmount(t.owner, foe, spec, rolls);
    credit(ctx.ledger, t.owner.key, 'damage', lossOf(foe, amount));
    const lost = dealDamage(foe, amount, { dot: true, ledger: ctx.ledger, log: ctx.log });
    reveal(ctx.revealed, foe.defId, spec.element);
    ctx.log.push({ type: 'damage', target: foe.key, amount: lost, element: 'thunder', mult, ...(crit ? { crit } : {}) });
    if (!foe.alive) ctx.log.push({ type: 'ko', target: foe.key });
  }
}

export const barrier: MechModule = {
  castDef(s, _c, def) {
    const b = longest(s);
    if (def.mech !== 'release' || !b) return def;
    const pct = 100 + BARRIER.releasePct * b.turns;
    return { ...def, effects: def.effects.map((e) => (e.kind === 'damage' ? { ...e, power: pctOf(e.power, pct) } : e)) };
  },
  pay(s, _c, def) {
    if (def.mech !== 'release' || !s.barriers?.length) return;
    // 連解: the barrier stays, this many rounds shorter (gone at 0).
    const keep = def.rules?.releaseKeep;
    s.barriers = keep === undefined ? [] : s.barriers.map((b) => ({ ...b, turns: b.turns - keep })).filter((b) => b.turns > 0);
    syncWards(s);
  },
  beforeTicks(s, ctx, rng) {
    for (const b of s.barriers ?? []) {
      if (b.kind !== 'purify') continue;
      const owner = s.party.find((c) => c.key === b.src);
      if (!owner) continue;
      for (const m of s.party) {
        if (!m.alive) continue;
        applyEffect(owner, m, { kind: 'heal', power: barrierPower(b) }, ctx);
        if (m.poison) {
          m.poison = false;
          delete m.poisonSrc;
          ctx.log.push({ type: 'cure', target: m.key });
        }
        if (b.wake && m.sleep > 0) {
          m.sleep = 0;
          ctx.log.push({ type: 'cure', target: m.key });
        }
      }
    }
    strike(s, ctx, rng);
  },
  roundEnd(s) {
    if (!s.barriers?.length) return;
    s.barriers = s.barriers.map((b) => ({ ...b, turns: b.turns - 1 })).filter((b) => b.turns > 0);
  },
  fieldWords(s) {
    const bolt = thunderOf(s) !== undefined;
    return (s.barriers ?? []).map((b) => b.kind === 'guard'
      ? { tone: 'ward' as const, text: T.mech.ward(b.turns, (b.boost ?? 1) > 1, bolt) }
      : { tone: 'purify' as const, text: T.mech.purify(b.turns, bolt) });
  },
  unusable(s, _c, def) {
    return def.effects.some((e) => e.kind === 'barrier-boost') && !s.barriers?.length ? T.mech.noBarrier : null;
  },
  cue(cue) {
    return cue === 'no-barrier' ? { tone: 'ward', text: T.mech.cue.noBarrier } : undefined;
  },
};
