/**
 * Chizuru's barriers (spec §8.2, plan 8c rulings 6–7, 9): one barrier over the party at a time, a new one replacing the
 * old. The guard barrier is the party's def and res (battle.syncWards mirrors it as each member's `ward`; the ledger
 * credits what it prevents to her). The purifying barrier, before any tick at each round's end, heals every living member
 * (her heal, credited to her even once she is down) and cures their poison. Each round's end takes a round off; a
 * barrier lasts its rounds whether she stands or not. A `release` skill spends the barrier: 10% more power for each
 * round it had left. Nothing here draws.
 */
import { syncWards } from '../battle';
import { applyEffect, pctOf } from '../skills';
import { T } from '../../data/text.zh-TW';
import type { MechModule } from './index';

export const BARRIER = { releasePct: 10 } as const;

export const barrier: MechModule = {
  castDef(s, _c, def) {
    const b = s.barriers?.[0];
    if (def.mech !== 'release' || !b) return def;
    const pct = 100 + BARRIER.releasePct * b.turns;
    return { ...def, effects: def.effects.map((e) => (e.kind === 'damage' ? { ...e, power: pctOf(e.power, pct) } : e)) };
  },
  pay(s, _c, def) {
    if (def.mech !== 'release' || !s.barriers?.length) return;
    s.barriers = [];
    syncWards(s);
  },
  beforeTicks(s, ctx) {
    for (const b of s.barriers ?? []) {
      if (b.kind !== 'purify') continue;
      const owner = s.party.find((c) => c.key === b.src);
      if (!owner) continue;
      for (const m of s.party) {
        if (!m.alive) continue;
        applyEffect(owner, m, { kind: 'heal', power: b.power * (b.boost ?? 1) }, ctx);
        if (m.poison) {
          m.poison = false;
          delete m.poisonSrc;
          ctx.log.push({ type: 'cure', target: m.key });
        }
      }
    }
  },
  roundEnd(s) {
    if (!s.barriers?.length) return;
    s.barriers = s.barriers.map((b) => ({ ...b, turns: b.turns - 1 })).filter((b) => b.turns > 0);
  },
  fieldWords(s) {
    return (s.barriers ?? []).map((b) => b.kind === 'guard'
      ? { tone: 'ward' as const, text: T.mech.ward(b.turns, (b.boost ?? 1) > 1) }
      : { tone: 'purify' as const, text: T.mech.purify(b.turns) });
  },
  cue(cue) {
    return cue === 'no-barrier' ? { tone: 'ward', text: T.mech.cue.noBarrier } : undefined;
  },
};
