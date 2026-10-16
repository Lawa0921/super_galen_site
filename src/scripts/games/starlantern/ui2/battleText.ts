import { T } from '../data/text.zh-TW';
import type { BattleEvent } from '../engine/combatant';

/** One line of battle narration per event, for the message window. */
export function battleLines(log: BattleEvent[], nameOf: (key: string) => string): string[] {
  return log.map((e) => {
    switch (e.type) {
      case 'act': return T.log.act(nameOf(e.actor), e.label);
      case 'damage': return T.log.damage(nameOf(e.target), e.amount, e.mult);
      case 'ko': return T.log.ko(nameOf(e.target));
      case 'heal': return T.log.heal(nameOf(e.target), e.amount);
      case 'tp': return T.log.tp(nameOf(e.target), e.amount);
      case 'revive': return T.log.revive(nameOf(e.target));
      case 'cure': return T.log.cure(nameOf(e.target));
      case 'status': return T.log.status(nameOf(e.target), e.status);
      case 'resist': return T.log.resist(nameOf(e.target));
      case 'buff': return T.log.buff(nameOf(e.target), e.stat, e.pct);
      case 'taunt': return T.log.taunt(nameOf(e.target));
      case 'turret': return T.log.turret(nameOf(e.target));
      case 'asleep': return T.log.asleep(nameOf(e.actor));
      case 'no-tp': return T.log.noTp(nameOf(e.actor));
      case 'no-limit': return T.log.noLimit(nameOf(e.actor));
      case 'escape': return T.log.escape(e.success);
      case 'poison-tick': return T.log.poison(nameOf(e.target), e.amount);
    }
  });
}
