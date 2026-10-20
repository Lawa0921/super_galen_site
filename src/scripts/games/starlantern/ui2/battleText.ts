import { CHARACTERS } from '../data/characters';
import { STORY } from '../data/story.zh-TW';
import { T } from '../data/text.zh-TW';
import type { BattleEvent } from '../engine/combatant';
import { SHARD_NAMES, TOWN_FRAGMENTS, fragmentName } from '../data/story/fragments';
import type { FragmentGain } from '../engine/story/memories';
import type { LevelUp } from '../engine/party';
import type { Party } from '../engine/types';

/** One line of battle narration per event, for the message window. */
export function battleLines(log: BattleEvent[], nameOf: (key: string) => string): string[] {
  return log.map((e) => {
    switch (e.type) {
      case 'act': return T.log.act(nameOf(e.actor), e.label);
      case 'damage': return T.log.damage(nameOf(e.target), e.amount, e.mult) + (e.crit ? T.log.crit : '');
      case 'miss': return T.log.miss(nameOf(e.target));
      case 'ko': return T.log.ko(nameOf(e.target));
      case 'heal': return T.log.heal(nameOf(e.target), e.amount);
      case 'tp': return e.regen ? '' : T.log.tp(nameOf(e.target), e.amount);   // regen pops on the member instead
      case 'revive': return T.log.revive(nameOf(e.target));
      case 'cure': return T.log.cure(nameOf(e.target));
      case 'status': return T.log.status(nameOf(e.target), e.status);
      case 'resist': return T.log.resist(nameOf(e.target));
      case 'buff': return T.log.buff(nameOf(e.target), e.stat, e.pct);
      case 'taunt': return T.log.taunt(nameOf(e.target));
      case 'turret': return T.log.turret(nameOf(e.target));
      case 'asleep': return T.log.asleep(nameOf(e.actor));
      case 'no-tp': return T.log.noTp(nameOf(e.actor));
      case 'no-skill': return T.log.noSkill(nameOf(e.actor));
      case 'no-limit': return T.log.noLimit(nameOf(e.actor));
      case 'escape': return T.log.escape(e.success);
      case 'poison-tick': return T.log.poison(nameOf(e.target), e.amount);
      case 'dot-tick': return T.log.dot(nameOf(e.target), e.status, e.amount);
      case 'frozen': return T.log.frozen(nameOf(e.actor));
      case 'survived': return STORY.survived;
    }
  });
}

/** A line per member who levelled up (at their level now in `party`), then a line for the points it brought. */
export function levelUpLines(ups: LevelUp[], party: Party): { text: string; cls: 'slx-levelup' }[] {
  const lines: { text: string; cls: 'slx-levelup' }[] = [];
  for (const u of ups) {
    const who = CHARACTERS[u.id].name;
    lines.push({ text: T.battle.levelUp(who, party.roster[u.id].level), cls: 'slx-levelup' });
    if (u.points.skill > 0 || u.points.talent > 0) lines.push({ text: T.battle.points(who, u.points.skill, u.points.talent), cls: 'slx-levelup' });
  }
  return lines;
}

/** One line per memory piece, shard or town fragment a glimmer, boss or elite handed out. */
export function fragmentLines(gained: FragmentGain[]): string[] {
  return gained.map((g) => {
    if (g.kind === 'piece') return T.ui2.memory.piece(CHARACTERS[g.id].name, g.n);
    if (g.kind === 'shard') return T.ui2.memory.shard(SHARD_NAMES[g.grade]);
    const item = TOWN_FRAGMENTS.find((f) => f.id === g.id)?.item ?? g.id;
    return T.ui2.memory.town(fragmentName(item) ?? g.id);
  });
}
