/**
 * The roster's foe mechanics (roster plan B2–B4, spec §6.2), as pure functions battle.ts calls at fixed points. Every
 * decision here is made without a draw (spec §6.1); a combatant without these fields walks every path it walked before.
 */
import type { BattleState } from './battle';
import { addBuff, type Combatant } from './combatant';
import type { EnemyDef, EnemySkill } from './types';
import { T } from '../data/text.zh-TW';

/**
 * Roster plan B6: a foe's mechanics as lines for its target note: who guards it, what it stole, when it runs, whom it
 * shares its wounds with. None for the old roster.
 */
export function foeNotes(s: BattleState, e: Combatant, defOf: (c: Combatant) => EnemyDef | undefined): string[] {
  const N = T.ui2.battle.foe;
  const out: string[] = [];
  const guard = foeGuard(s, e);
  if (guard !== e) out.push(N.guarded(guard.name));
  if (e.stolen) out.push(N.stolen(e.stolen));
  const after = defOf(e)?.fleeAfter;
  if (after !== undefined && after > s.round) out.push(N.flee(after - s.round));
  const mate = e.share ? s.enemies.find((x) => x.key === e.share && x.alive) : undefined;
  if (mate) out.push(N.shared(mate.name));
  return out;
}

/** M14: rounds an `asleep` opener sleeps (it acts in round three); its anger on waking; a disguise's first bite. */
export const OPENER = { sleepRounds: 2, wakeAtkPct: 50, wakeTurns: 3, disguiseAtkPct: 50 } as const;

/** M14: a foe as its opener has it at the start of a fight (meetEnemy). Draws nothing. */
export function openWith(c: Combatant, d: EnemyDef): void {
  switch (d.opener) {
    case 'asleep':
      c.sleep = OPENER.sleepRounds;
      c.dozing = true;
      return;
    case 'ambush':
      c.ambush = true;
      return;
    case 'disguise':
      c.ambush = true;
      c.disguised = c.name;
      c.name = T.battle.foe.disguise;
      addBuff(c, { stat: 'atk', pct: OPENER.disguiseAtkPct, turns: 1 });
      return;
  }
}

/** M14: a dozing foe at its first turn awake (woken by a hit or by its rounds) wakes angry. Draws nothing. */
export function wakeUp(s: BattleState, c: Combatant): void {
  if (!c.dozing) return;
  delete c.dozing;
  addBuff(c, { stat: 'atk', pct: OPENER.wakeAtkPct, turns: OPENER.wakeTurns });
  s.log.push({ type: 'foe', actor: c.key, cue: 'wake' });
}

/** M13: whether any foe of the fight can steal (only then does a fight get a purse; game.ts startBattle). */
export function stealsIn(s: BattleState, defOf: (c: Combatant) => EnemyDef | undefined): boolean {
  return s.enemies.some((c) => defOf(c)?.skills.some((k) => k.effects.some((e) => e.kind === 'steal')));
}

/** M13: the gold felled thieves give back, a warden's twice over; a thief that left keeps it. */
export function returnedGold(s: BattleState, defOf: (c: Combatant) => EnemyDef | undefined): number {
  return s.enemies.reduce((n, c) => n + (!c.alive && !c.left && c.stolen ? c.stolen * (defOf(c)?.rank === 'warden' ? 2 : 1) : 0), 0);
}

/** M19: the evasion a foe has while any of its decoys stands. */
export const DECOY = { evasion: 20 } as const;

/** M19: each foe's evasion with its decoys: DECOY.evasion more while one of them stands, none once they are all gone. */
export function syncDecoys(s: BattleState): void {
  for (const c of s.enemies) {
    const want = s.enemies.some((d) => d.decoyOf === c.key && d.alive) ? DECOY.evasion : 0;
    const had = c.blur ?? 0;
    if (want === had) continue;
    const ev = (c.x.evasion ?? 0) - had + want;
    if (ev) c.x.evasion = ev; else delete c.x.evasion;
    if (want) c.blur = want; else delete c.blur;
  }
}

/** M20: links each foe whose definition shares its wounds with the first unlinked foe of that id (summons too). */
export function linkShares(s: BattleState, defOf: (c: Combatant) => EnemyDef | undefined): void {
  for (const c of s.enemies) {
    const id = defOf(c)?.shareWith;
    if (!id || c.share || c.decoyOf) continue;
    const mate = s.enemies.find((o) => o !== c && !o.share && !o.decoyOf && o.defId === id);
    if (mate) { c.share = mate.key; mate.share = c.key; }
  }
}

/** M22: whether a skill can be used now: a `when: 'deadAlly'` one only while an ally lies fallen, never raised, not gone. */
export function usableNow(s: BattleState, e: Combatant, sk: EnemySkill): boolean {
  return sk.when !== 'deadAlly' || s.enemies.some((c) => c !== e && !c.alive && !c.left && !c.rose && !c.decoyOf);
}

const living = (cs: Combatant[]) => cs.filter((c) => c.alive);
/** A foe that can stir: awake and not frozen (a sleeping or frozen guard guards no one, as Scarlet covers no one then). */
const stirs = (c: Combatant) => c.alive && c.sleep === 0 && !c.frozen;

/**
 * M2 guard: the foe a party member's single blow lands on. Another foe that covers `t` (the enemy side's `cover`) and can
 * stir takes it instead; anything else is `t` itself. Draws nothing.
 */
export function foeGuard(s: BattleState, t: Combatant): Combatant {
  if (t.side !== 'enemy') return t;
  return s.enemies.find((e) => e !== t && stirs(e) && e.cover?.ally === t.key) ?? t;
}

/**
 * M2 guard: who a foe's guard skill (target `ally`, a `cover` effect) covers: the living ally with the lowest share of HP
 * but itself (the first such, in line order). Undefined for any other skill, so it finds its targets as it always has; an
 * empty list when it stands alone.
 */
export function guardTargets(s: BattleState, actor: Combatant, sk: EnemySkill): Combatant[] | undefined {
  if (actor.side !== 'enemy' || sk.target !== 'ally' || !sk.effects.some((e) => e.kind === 'cover')) return undefined;
  const others = living(s.enemies).filter((c) => c !== actor);
  if (!others.length) return [];
  return [others.reduce((a, b) => (b.hp / b.max.hp < a.hp / a.max.hp ? b : a))];
}

/** M24 hunt: the living member called out for `round` (a hunt lands on one at a time), or undefined. */
export function huntedIn(s: BattleState, round: number): Combatant | undefined {
  return s.party.find((c) => c.alive && c.hunted === round && !c.defending);
}

/** At a round's start, once the party's defending is known: a member who defends lifts the hunt on her (M24). */
export function foesRoundStart(s: BattleState): void {
  for (const c of s.party) if (c.defending && c.hunted !== undefined) delete c.hunted;
}

/**
 * At a round's end, after the mechanics: a foe whose time is up leaves, still standing (M3: alive no more, `left`, paying
 * nothing); a foe's guard counts down its rounds (M2); a hunt for this round is over (M24).
 */
export function foesRoundEnd(s: BattleState, defOf: (c: Combatant) => EnemyDef | undefined = () => undefined): void {
  for (const e of s.enemies) {
    const after = defOf(e)?.fleeAfter;
    if (!e.alive || after === undefined || s.round < after) continue;
    e.alive = false;
    e.left = true;
    delete e.cover;
    delete e.winding;
    s.log.push({ type: 'foe', actor: e.key, cue: 'flee' });
  }
  for (const e of s.enemies) {
    if (!e.cover) continue;
    if (e.cover.turns > 1) e.cover = { ...e.cover, turns: e.cover.turns - 1 };
    else delete e.cover;
  }
  for (const c of s.party) if (c.hunted !== undefined && c.hunted <= s.round) delete c.hunted;
}
