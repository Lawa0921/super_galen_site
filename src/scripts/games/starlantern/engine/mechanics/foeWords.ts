/**
 * The roster's foe mechanics on the battle screen (roster plan B6): a word over a foe (winding up, guarding, guarded, what
 * it stole, a pair that shares its wounds, rounds before it runs) and under a member a foe called out. A fight of the old
 * roster shows none of them. Nothing here draws or changes the fight.
 */
import type { BattleState } from '../battle';
import type { Combatant } from '../combatant';
import { foeGuard } from '../foes';
import { ENEMIES } from '../../data/enemies';
import { T } from '../../data/text.zh-TW';
import type { MechModule, MechWord } from './index';

const W = T.battle.foe.word;
const plain = (text: string): MechWord => ({ tone: 'plain', text });

export const foeMarks: MechModule = {
  foeWords(s: BattleState, e: Combatant): MechWord[] {
    if (!e.alive) return [];
    const out: MechWord[] = [];
    if (e.winding !== undefined) out.push(plain(W.winding));
    // Roster plan B7: a turning weakness as it stands (M5), an adaptation in force (M16).
    if (e.prism) for (const el of e.weak) out.push(plain(W.weak(T.element[el])));
    if (e.adapted && e.adapted.turns > 0) out.push(plain(W.adapted(T.element[e.adapted.el])));
    if (e.cut !== undefined) out.push(plain(W.cut));   // a body behind its parts (roster plan B8, M7)
    if (e.drained) out.push(plain(W.drained(e.drained)));   // what a TP thief took (roster plan B9, M17)
    if (e.cover) out.push(plain(W.guarding));
    if (foeGuard(s, e) !== e) out.push(plain(W.guarded));
    if (e.stolen) out.push(plain(W.stolen(e.stolen)));
    if (e.share && s.enemies.some((x) => x.key === e.share && x.alive)) out.push(plain(W.shared));
    const after = (s.enemyDefs?.[e.key] ?? ENEMIES[e.defId])?.fleeAfter;
    if (after !== undefined && after > s.round) out.push(plain(W.flee(after - s.round)));
    return out;
  },
  words(s: BattleState, c: Combatant): MechWord[] {
    return c.side === 'party' && c.alive && c.hunted !== undefined && c.hunted > s.round ? [plain(W.hunted)] : [];
  },
};
