/**
 * The roster's foe mechanics (roster plan B2–B4, spec §6.2), as pure functions battle.ts calls at fixed points. Every
 * decision here is made without a draw (spec §6.1); a combatant without these fields walks every path it walked before.
 */
import type { BattleState } from './battle';
import { addBuff, breakCharge, dealDamage, type BattleEvent, type Buff, type Combatant } from './combatant';
import type { BuffStat, Element, EnemyDef, EnemySkill } from './types';
import { T } from '../data/text.zh-TW';
import { ENEMIES } from '../data/enemies';
import { listedEnemy } from '../data/monsters';

/** Roster plan B4 (M4): the most foes a boss fight holds, the boss and its parts and its calls together. */
export const BOSS_GROUP_CAP = 4;
/** Roster plan B6: the most foes a fight's row ever holds, the fallen and the opening decoys included. */
export const ROW_MAX = 8;

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
  if (e.cut !== undefined) out.push(N.cut(e.cut));
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
    case 'encased':
      c.encased = true;   // M23: in ice until fire or round two's end
      return;
    case 'disguise': {
      // Its letter stays with the disguise (「寶箱？ A」, B1 review item 13).
      const letter = / [A-Z]$/.exec(c.name)?.[0] ?? '';
      c.ambush = true;
      c.disguised = c.name;
      c.name = `${T.battle.foe.disguise}${letter}`;
      addBuff(c, { stat: 'atk', pct: OPENER.disguiseAtkPct, turns: 1 });
      return;
    }
  }
}

/** M23: a foe in ice comes out of it (a fire hit, or round two's end). */
export function thaw(s: { log: BattleEvent[] }, c: Combatant): void {
  if (!c.encased) return;
  delete c.encased;
  s.log.push({ type: 'foe', actor: c.key, cue: 'thaw' });
}

/** M14: a dozing foe at its first turn awake (woken by a hit or by its rounds) wakes angry. Draws nothing. */
export function wakeUp(s: BattleState, c: Combatant): void {
  if (!c.dozing) return;
  delete c.dozing;
  addBuff(c, { stat: 'atk', pct: OPENER.wakeAtkPct, turns: OPENER.wakeTurns });
  s.log.push({ type: 'foe', actor: c.key, cue: 'wake' });
}

/** M13: whether a definition steals, or calls a foe that does (two calls deep). */
function steals(d: EnemyDef | undefined, depth = 2): boolean {
  if (!d) return false;
  return d.skills.some((k) => k.effects.some((e) => e.kind === 'steal' || (e.kind === 'summon' && depth > 0 && steals(ENEMIES[e.id], depth - 1))));
}

/**
 * M13: whether a thief can be in the fight, one there from the start or one a foe can call (only then does a fight get a
 * purse; game.ts startBattle; B1 review item 9).
 */
export function stealsIn(s: BattleState, defOf: (c: Combatant) => EnemyDef | undefined): boolean {
  return s.enemies.some((c) => steals(defOf(c)));
}

/**
 * M13, B1 review item 9: a thief felled (not one that left) gives what it took back to the pack the moment it falls, a
 * warden's twice over, win or not; each once. A fight with no purse (the sim) has no pack to give it to.
 */
export function settleThieves(s: BattleState, defOf: (c: Combatant) => EnemyDef | undefined): void {
  if (!s.purse) return;
  for (const c of s.enemies) {
    if (c.alive || c.left || !c.stolen || c.returned !== undefined) continue;
    const n = c.stolen * (defOf(c)?.rank === 'warden' ? 2 : 1);
    c.returned = n;
    s.purse.gold += n;
    s.log.push({ type: 'foe', actor: c.key, cue: 'return', amount: n });
  }
}

/** M13: the gold felled thieves gave back in this fight (shown with the win; already in the pack). */
export function returnedGold(s: BattleState): number {
  return s.enemies.reduce((n, c) => n + (c.returned ?? 0), 0);
}

/** M19, B1 review item 4: a decoy whose foe is down (and did not stand again) leaves the fight with it. */
export function decoysLeave(s: BattleState): void {
  for (const d of s.enemies) {
    if (!d.decoyOf || !d.alive) continue;
    const owner = s.enemies.find((c) => c.key === d.decoyOf);
    if (owner?.alive) continue;
    d.alive = false;
    d.left = true;
    s.log.push({ type: 'foe', actor: d.key, cue: 'vanish' });
  }
}

/** M4: whether `actor` may call `id` now: a fight that keeps its meeting, room under its cap and ROW_MAX, calls left, `id` live. */
export function canSummon(s: BattleState, actor: Combatant, id: string, max?: number): boolean {
  const room = s.meet ? s.enemies.filter((c) => c.alive && !c.decoyOf).length < s.meet.cap && s.enemies.length < ROW_MAX : false;
  return room && (max === undefined || (actor.summons ?? 0) < max) && listedEnemy(id);
}

/** B1 review item 6: the key a once-a-fight skill is spent under, shared by every foe of its kind. */
export const spentKey = (c: Combatant, sk: EnemySkill): string => `${c.defId}/${sk.name}`;

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

/**
 * Whether a skill can be used now (passed over after its draw when not, as a failed chance is): a `when: 'deadAlly'` one
 * only while an ally lies fallen, never raised, not gone (M22); a call only while it can happen (M4, B1 review item 2); a
 * once-a-fight one only before its kind has used it (B1 review item 6); a beat only on its rounds, a skill that needs its kin
 * only while they stand (roster plan B11). `round` is the round it would be played in (the next one, as it is planned).
 */
export function usableNow(s: BattleState, e: Combatant, sk: EnemySkill, round = s.round): boolean {
  if (sk.when === 'deadAlly' && !s.enemies.some((c) => c !== e && !c.alive && !c.left && !c.rose && !c.decoyOf)) return false;
  // Roster plan B11: a beat every N rounds; a skill that waits for its kin.
  if (sk.every && round % sk.every !== 0) return false;
  if (sk.needs && s.enemies.filter((c) => c !== e && c.alive && !c.decoyOf && c.defId === sk.needs!.id).length < sk.needs.n) return false;
  if (sk.oncePerFight && s.spent?.includes(spentKey(e, sk))) return false;
  return sk.effects.every((x) => x.kind !== 'summon' || canSummon(s, e, x.id, x.max));
}

/** M5: the elements a cycling prism's weakness turns through, a round each. */
export const PRISM_CYCLE: readonly Element[] = ['phys', 'fire', 'ice', 'thunder'];

/**
 * Roster plan B7: what a foe's definition puts on it as it is met (meetEnemy), drawing nothing: a turning weakness (M5),
 * an adaptation's rounds (M16). None on the old roster, which stays the same object field for field.
 */
export function foeTraits(c: Combatant, d: EnemyDef): void {
  if (d.prism) c.prism = true;
  if (d.adapt) c.adapt = d.adapt;
  if ([...d.skills, ...(d.stages ?? []).flatMap((st) => st.skills)].some((k) => k.effects.some((e) => e.kind === 'mirror'))) c.mirrors = true;
  if (d.mend) c.mend = { ...d.mend };
  if (d.dodgeUp) c.dodgeUp = d.dodgeUp;
}

/**
 * M7, drawing nothing: each body's cut while a foe that shields it stands (one of its `by` ids, else any part), none once
 * they are all down. Only a body with `parts` is touched.
 */
export function syncParts(s: BattleState, defOf: (c: Combatant) => EnemyDef | undefined): void {
  for (const e of s.enemies) {
    const parts = defOf(e)?.parts;
    if (!parts) continue;
    const shielded = e.alive && s.enemies.some((o) => o !== e && o.alive && !o.decoyOf && (parts.by ? parts.by.includes(o.defId) : defOf(o)?.rank === 'part'));
    if (shielded) e.cut = parts.cutPct; else delete e.cut;
  }
}

/**
 * M18: a mimic's atk and mag as it is met: `mimic`% of the strongest living member's (the most atk; the first of equals),
 * times the multipliers its scaled definition `met` carries but growth (elite, condition, tier, compensation), times the
 * fight's `power` (party size, a boss's power, the deep road's). `raw` is its plain definition, `growth` its growth at the
 * fight's depth (none without a scale). Neither growth nor ENEMY_POWER: the copy already has the party's. Draws nothing;
 * undefined for a foe that mimics no one, or a fight with no one standing.
 */
export function mimicStats(raw: EnemyDef, met: EnemyDef, party: Combatant[], growth: Partial<Record<'atk' | 'mag', number>>, power: number): { atk: number; mag: number } | undefined {
  const up = party.filter((c) => c.alive);
  if (!raw.mimic || !up.length) return undefined;
  const top = up.reduce((a, b) => (b.max.atk > a.max.atk ? b : a));
  const one = (k: 'atk' | 'mag') => Math.max(1, Math.round((top.max[k] * raw.mimic! / 100) * (met.stats[k] / (raw.stats[k] * (growth[k] ?? 1))) * power));
  return { atk: one('atk'), mag: one('mag') };
}

/** M8: the stage `e` fights `round` in: by its HP share (never back) or, with `stageEvery`, by the round. */
function stageFor(e: Combatant, d: EnemyDef, round: number): number | undefined {
  const stages = d.stages ?? [];
  if (d.stageEvery) {
    const i = Math.floor((Math.max(1, round) - 1) / d.stageEvery) % (stages.length + 1);
    return i === 0 ? undefined : i - 1;
  }
  let at = e.stage;
  const share = (e.hp * 100) / e.max.hp;
  stages.forEach((st, i) => { if (st.below !== undefined && share <= st.below && (at === undefined || i > at)) at = i; });
  return at;
}

/**
 * Roster plan B7, as a round's plan is drawn (and once as the fight opens), drawing nothing: a cycling prism takes the
 * round's weakness (M5), and a foe with stages takes the stage the round finds it in (M8), with that stage's elements when
 * it names them. Between the plan and the blow nothing changes, so a planned skill is always one of the list it is played
 * from. An adaptation in force (M16) stays over the new elements.
 */
export function foesStage(s: BattleState, round: number, defOf: (c: Combatant) => EnemyDef | undefined): void {
  for (const e of s.enemies) {
    if (!e.alive) continue;
    const d = defOf(e);
    if (!d || (!d.prism && !d.stages?.length)) continue;
    if (d.stages?.length) {
      const at = stageFor(e, d, round);
      if (at !== e.stage) {
        if (at === undefined) delete e.stage; else e.stage = at;
        const st = at === undefined ? undefined : d.stages[at];
        e.weak = [...(st?.weak ?? d.weak)];
        e.resist = [...(st?.resist ?? d.resist)];
        if (!d.stageEvery) s.log.push({ type: 'foe', actor: e.key, cue: 'stage' });
      }
    }
    if (d.prism === 'cycle') {
      e.weak = [PRISM_CYCLE[(Math.max(1, round) - 1) % PRISM_CYCLE.length]];
      e.resist = [];
    }
    keepAdapted(e);
  }
}

/** M16: an adaptation in force stays over whatever elements the foe has now. */
function keepAdapted(e: Combatant): void {
  const a = e.adapted;
  if (!a || a.turns <= 0) return;
  e.weak = e.weak.filter((x) => x !== a.el);
  if (!e.resist.includes(a.el)) e.resist = [...e.resist, a.el];
}

/**
 * M16: the first element that lands on a foe that adapts becomes its resistance, and no weakness, for its rounds; once a
 * fight. Draws nothing.
 */
export function adaptTo(t: Combatant, el: Element, log: BattleEvent[]): void {
  if (!t.adapt || t.adapted || !t.alive) return;
  t.adapted = { el, turns: t.adapt, ...(t.weak.includes(el) ? { weak: true as const } : {}) };
  keepAdapted(t);
  log.push({ type: 'foe', actor: t.key, cue: 'adapt' });
}

/** M16, at a round's end: an adaptation counts down; when it is over its element is what it was before. */
function ageAdapted(e: Combatant, d: EnemyDef | undefined): void {
  const a = e.adapted;
  if (!a || a.turns <= 0) return;
  if (a.turns > 1) { e.adapted = { ...a, turns: a.turns - 1 }; return; }
  e.adapted = { el: a.el, turns: 0 };
  const own = e.stage !== undefined ? d?.stages?.[e.stage]?.resist ?? d?.resist : d?.resist;
  if (!(own ?? []).includes(a.el) && d?.prism !== 'cycle') e.resist = e.resist.filter((x) => x !== a.el);
  if (a.weak) e.weak = [...e.weak, a.el];
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
  const others = living(s.enemies).filter((c) => c !== actor && !c.decoyOf);   // never a decoy (B1 review item 8)
  if (!others.length) return [];
  return [others.reduce((a, b) => (b.hp / b.max.hp < a.hp / a.max.hp ? b : a))];
}

/** M24 hunt: the living member called out for `round` (a hunt lands on one at a time), or undefined. */
export function huntedIn(s: BattleState, round: number): Combatant | undefined {
  // A veil beats a hunt (B1 review item 11): a veiled member is never the one called out; nor is one inside a foe (M28).
  return s.party.find((c) => c.alive && c.hunted === round && !c.defending && !c.veil && !c.engulfed);
}

/**
 * M26, drawing nothing: each foe's auras from the banners standing (every other foe's `rally`) and from its own throng (its
 * `throng` percents once for each foe of that id standing). A fight with no banner or throng is not touched at all.
 */
export function syncRallies(s: BattleState, defOf: (c: Combatant) => EnemyDef | undefined): void {
  if (!s.enemies.some((c) => { const d = defOf(c); return !!d?.rally || !!d?.throng; })) return;
  const up = s.enemies.filter((c) => c.alive && !c.decoyOf);
  for (const e of s.enemies) {
    const auras: Buff[] = [];
    if (e.alive) {
      for (const b of up) {
        const rally = b !== e ? defOf(b)?.rally : undefined;
        for (const [stat, pct] of Object.entries(rally ?? {}) as [BuffStat, number][]) auras.push({ stat, pct, turns: 0, src: b.key });
      }
      const throng = defOf(e)?.throng;
      const n = throng ? up.filter((c) => c.defId === throng.id).length : 0;
      for (const [stat, pct] of Object.entries(n ? throng!.per : {}) as [BuffStat, number][]) auras.push({ stat, pct: pct * n, turns: 0, src: e.key });
    }
    if (auras.length) e.auras = auras; else delete e.auras;
  }
}

/** M28: the share of its max HP an engulfer must lose to let its member out. */
export const ENGULF = { releasePct: 15, tickPct: 10 } as const;

/** M28: lets the member `foe` holds out, at once. */
export function spit(s: BattleState, foe: Combatant): void {
  const g = foe.gulp;
  if (!g) return;
  delete foe.gulp;
  const m = s.party.find((c) => c.key === g.key);
  if (m?.engulfed === foe.key) delete m.engulfed;
  s.log.push({ type: 'foe', actor: foe.key, cue: 'spit', target: g.key });
}

/** M28, after each action: a member whose engulfer is down (or gone) is out; a foe whose member fell holds no one. */
export function settleGulps(s: BattleState): void {
  for (const m of s.party) {
    if (!m.engulfed) continue;
    const foe = s.enemies.find((e) => e.key === m.engulfed);
    if (foe?.alive && foe.gulp?.key === m.key) continue;
    delete m.engulfed;
    if (foe) s.log.push({ type: 'foe', actor: foe.key, cue: 'spit', target: m.key });
  }
  for (const e of s.enemies) if (e.gulp && !s.party.some((c) => c.key === e.gulp!.key && c.alive && c.engulfed === e.key)) delete e.gulp;
}

/**
 * M28: whom `actor` may pick on one side (`foe`, the other side; `ally`, its own living): a member inside a foe picks that
 * foe alone, and of her allies herself; no one else picks her, from either side, but an item reaches her (`item`).
 */
export function choosable(s: BattleState, actor: Combatant, side: 'foe' | 'ally', item = false): Combatant[] {
  const foes = actor.side === 'party' ? s.enemies : s.party;
  const allies = actor.side === 'party' ? s.party : s.enemies;
  if (side === 'foe') {
    if (actor.engulfed) return foes.filter((c) => c.key === actor.engulfed && c.alive);
    return foes.filter((c) => c.alive && !c.engulfed);
  }
  if (actor.engulfed && !item) return [actor];
  return allies.filter((c) => c.alive && (item || !c.engulfed || c === actor));
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
  // M21: a mend that a hit of its element did not short this round.
  for (const e of s.enemies) {
    if (!e.alive || !e.mend) continue;
    if (e.shorted === s.round) { s.log.push({ type: 'foe', actor: e.key, cue: 'short' }); continue; }
    const amount = Math.min(e.max.hp - e.hp, Math.floor((e.max.hp * e.mend.pct) / 100));
    if (amount <= 0) continue;
    e.hp += amount;
    s.log.push({ type: 'heal', target: e.key, amount });
  }
  // M23: ice that no fire broke melts as round two ends.
  for (const e of s.enemies) if (e.alive && e.encased && s.round >= 2) thaw(s, e);
  // M28: a round inside poisons; a hold whose round is over lets its member out.
  for (const m of s.party) {
    if (!m.alive || !m.engulfed) continue;
    const amount = dealDamage(m, Math.max(1, Math.floor((m.max.hp * ENGULF.tickPct) / 100)), { dot: true, log: s.log });
    s.log.push({ type: 'poison-tick', target: m.key, amount });
    if (!m.alive) s.log.push({ type: 'ko', target: m.key });
  }
  for (const e of s.enemies) if (e.gulp && e.gulp.until <= s.round) spit(s, e);
  settleGulps(s);
  for (const e of s.enemies) {
    const after = defOf(e)?.fleeAfter;
    if (!e.alive || after === undefined || s.round < after) continue;
    e.alive = false;
    e.left = true;
    delete e.cover;
    breakCharge(e);
    s.log.push({ type: 'foe', actor: e.key, cue: 'flee' });
  }
  for (const e of s.enemies) ageAdapted(e, defOf(e));   // M16
  for (const e of s.enemies) {
    if (!e.cover) continue;
    if (e.cover.turns > 1) e.cover = { ...e.cover, turns: e.cover.turns - 1 };
    else delete e.cover;
  }
  for (const c of s.party) if (c.hunted !== undefined && c.hunted <= s.round) delete c.hunted;
}
