/**
 * Liz's coins (spec §8.3, plan 8c ruling 21): every landed hit of hers is a coin (up to ten); 順手牽羊 takes two more.
 * 大手筆 spends them all for power (15% a coin), 一擲千金 for hits (one 40-power throw a coin at random foes); both start
 * again from none, so their own hits earn coins back. A foe she appraised doubles her coins when it falls, to anyone or
 * anything. Coins left when a fight is won become gold (battle.rewards). Nothing here draws.
 */
import type { BattleState } from '../battle';
import type { Combatant } from '../combatant';
import { pctOf } from '../skills';
import { T } from '../../data/text.zh-TW';
import type { MechModule } from './index';

export const COINS = { cap: 10, coinPowerPct: 15, gold: 2 } as const;

const coinsOf = (c: Combatant): number | null => (c.mech?.kind === 'coins' ? c.mech.coins : null);

/** A fallen appraised foe doubles its appraiser's coins, once. */
function payAppraisal(party: Combatant[], foe: Combatant): void {
  if (foe.alive || !foe.appraised) return;
  const by = party.find((c) => c.key === foe.appraised);
  if (by?.mech?.kind === 'coins') by.mech.coins = Math.min(COINS.cap, by.mech.coins * 2);
  delete foe.appraised;
}

export const coins: MechModule = {
  castDef(_s, c, def) {
    const n = coinsOf(c);
    if (n === null) return def;
    if (def.mech === 'coin-power') {
      return { ...def, effects: def.effects.map((e) => (e.kind === 'damage' ? { ...e, power: pctOf(e.power, 100 + COINS.coinPowerPct * n) } : e)) };
    }
    if (def.mech === 'coin-hits') {
      const i = def.effects.findIndex((e) => e.kind === 'damage');
      return { ...def, effects: def.effects.map((e, j) => (j === i && e.kind === 'damage' ? { ...e, hits: n } : e)) };
    }
    return def;
  },
  pay(_s, c, def) {
    if (c.mech?.kind === 'coins' && (def.mech === 'coin-power' || def.mech === 'coin-hits')) c.mech.coins = 0;
  },
  onHit(actor, target, ctx) {
    if (actor.mech?.kind === 'coins') actor.mech.coins = Math.min(COINS.cap, actor.mech.coins + 1);
    if (!target.alive && ctx.battle) payAppraisal(ctx.battle.party, target);
  },
  roundEnd(s: BattleState) {
    // A foe a tick felled pays its appraisal too.
    for (const e of s.enemies) payAppraisal(s.party, e);
  },
  unusable(_s, c, def) {
    return def.mech === 'coin-hits' && coinsOf(c) === 0 ? T.mech.noCoins : null;
  },
  words(_s, c) {
    const n = coinsOf(c);
    return n === null ? [] : [{ tone: 'coins', text: T.mech.coins(n) }];
  },
  foeWords(_s, e) {
    return e.appraised ? [{ tone: 'coins', text: T.mech.appraised }] : [];
  },
};
