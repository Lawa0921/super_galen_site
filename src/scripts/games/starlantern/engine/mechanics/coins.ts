/**
 * Liz's coins (spec §8.3, plan 8c ruling 21): every landed hit of hers is a coin (up to ten); 順手牽羊 takes two more.
 * 大手筆 spends them all for power (15% a coin), 一擲千金 for hits (one 40-power throw a coin at random foes); both start
 * again from none, so their own hits earn coins back. A foe she appraised doubles her coins when it falls, to anyone or
 * anything. Coins left when a fight is won become gold (battle.rewards). Plan 8d: her 金庫 raises the cap; 分期 spends only
 * a share of them (rounded up) at its own power a coin; 找零 hands some back after a spender that spent any (never past the
 * cap). castDef, the menu's greying and the sim's ranking all read the same `spendOf`. Nothing here draws.
 */
import type { BattleState } from '../battle';
import type { Combatant } from '../combatant';
import { knobOf } from '../progression';
import { pctOf } from '../skills';
import type { SkillDef } from '../types';
import { T } from '../../data/text.zh-TW';
import type { MechModule } from './index';
import { COINS } from '../mech';

export { COINS };

const coinsOf = (c: Combatant): number | null => (c.mech?.kind === 'coins' ? c.mech.coins : null);

/** The most coins `c` holds: COINS.cap, or her 金庫's. */
export const coinCapOf = (c: Combatant): number => knobOf(c, 'coinCap') ?? COINS.cap;

/** The coins a spender (`coin-power`, `coin-hits`) would spend now: all of them, or 分期's share rounded up. */
const spendOf = (c: Combatant, def: SkillDef): number => {
  const n = coinsOf(c) ?? 0;
  return Math.ceil((n * (def.rules?.coinSpendPct ?? 100)) / 100);
};
const spends = (def: SkillDef) => def.mech === 'coin-power' || def.mech === 'coin-hits';

/** A fallen appraised foe doubles its appraiser's coins, once. */
function payAppraisal(party: Combatant[], foe: Combatant): void {
  if (foe.alive || !foe.appraised) return;
  const by = party.find((c) => c.key === foe.appraised);
  if (by?.mech?.kind === 'coins') by.mech.coins = Math.min(coinCapOf(by), by.mech.coins * 2);
  delete foe.appraised;
}

export const coins: MechModule = {
  castDef(_s, c, def) {
    if (coinsOf(c) === null) return def;
    const n = spendOf(c, def);
    if (def.mech === 'coin-power') {
      const per = def.rules?.coinPowerPct ?? COINS.coinPowerPct;
      return { ...def, effects: def.effects.map((e) => (e.kind === 'damage' ? { ...e, power: pctOf(e.power, 100 + per * n) } : e)) };
    }
    if (def.mech === 'coin-hits') {
      const i = def.effects.findIndex((e) => e.kind === 'damage');
      return { ...def, effects: def.effects.map((e, j) => (j === i && e.kind === 'damage' ? { ...e, hits: n } : e)) };
    }
    return def;
  },
  pay(_s, c, def) {
    if (c.mech?.kind !== 'coins' || !spends(def)) return;
    const n = spendOf(c, def);
    // 找零: some come back once any were spent.
    c.mech.coins = Math.min(coinCapOf(c), c.mech.coins - n + (n > 0 ? knobOf(c, 'coinRefund') ?? 0 : 0));
  },
  onHit(actor, target, ctx) {
    // A triggered cast's hits earn no coin (plan 8h ruling 11b); a foe it fells still pays its appraisal.
    if (actor.mech?.kind === 'coins' && !ctx.triggered) actor.mech.coins = Math.min(coinCapOf(actor), actor.mech.coins + 1);
    if (!target.alive && ctx.battle) payAppraisal(ctx.battle.party, target);
  },
  roundEnd(s: BattleState) {
    // A foe a tick felled pays its appraisal too.
    for (const e of s.enemies) payAppraisal(s.party, e);
  },
  unusable(_s, c, def) {
    return def.mech === 'coin-hits' && coinsOf(c) !== null && spendOf(c, def) === 0 ? T.mech.noCoins : null;
  },
  words(_s, c) {
    const n = coinsOf(c);
    return n === null ? [] : [{ tone: 'coins', text: T.mech.coins(n) }];
  },
  foeWords(_s, e) {
    return e.appraised ? [{ tone: 'coins', text: T.mech.appraised, setup: true }] : [];
  },
};
