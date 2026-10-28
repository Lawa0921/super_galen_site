/**
 * Power parity (spec §12.6, plan 8a Task 5): each character's effective contribution per round — damage, healing,
 * damage prevented, shield — measured with the contribution ledger and the sim player's default policies, so a roster
 * change can be held to the old roster's baseline (engine/__fixtures__/sim-gate/contribution.8b.json, the 8b rules) by
 * the rule `checkParity` states.
 */
import { CHARACTER_IDS } from '../data/characters';
import { expectedEnhance } from '../data/forge';
import { newLedger, totalOf, type Contribution } from './ledger';
import { STANDARD_LINEUP } from './party';
import type { PolicyTable } from './policy';
import { legacyEncounterTable } from './scaling';
import { kitParty, simBattle } from './sim';
import type { CharacterId } from './types';

export const PARITY_LEVELS = [5, 10, 20, 35, 50] as const;
/** Seeds a fight is measured over, k x 7919 for k = 1..160 (8d ruling: 20 seeds left 5 of 6 rows to noise). */
export const PARITY_SEEDS = 160;
/** A measured member's contribution per round in one cell may move this many percent of her own baseline either way... */
export const PARITY_MEMBER_PCT = 10;
/** ...or, when it is more, this many percent of the whole party's baseline in that cell (a small share's floor). */
export const PARITY_FLOOR_PCT = 2;
/** A measured member's contributions per round over the five levels of her lineup, summed, may move this many percent. */
export const PARITY_SUM_PCT = 10;
/** A whole party's contribution per round may move this many percent either way. */
export const PARITY_PARTY_PCT = 5;

/** The depth a level is measured at: depthLevel gives 2, 6, 10, ..., so level L meets depth floor((L - 2) / 4) + 1. */
export function parityDepth(level: number): number {
  return Math.floor((level - 2) / 4) + 1;
}

/**
 * The lineups measured: the standard five (all measured), then each companion outside it, in CHARACTER_IDS order,
 * fighting as hero + Rin + her + Chizuru + Selene (only she is measured).
 */
export function parityLineups(): { measured: CharacterId[]; ids: CharacterId[] }[] {
  const others = CHARACTER_IDS.filter((id) => !STANDARD_LINEUP.includes(id));
  return [
    { measured: [...STANDARD_LINEUP], ids: [...STANDARD_LINEUP] },
    ...others.map((id) => ({ measured: [id], ids: ['hero', 'rin', id, 'chizuru', 'selene'] as CharacterId[] })),
  ];
}

export interface ParityCell {
  level: number; depth: number; ids: CharacterId[]; measured: CharacterId[];
  /** Rounds of every fight in the cell, summed. */
  rounds: number;
  /** Every member's summed contribution over the cell's fights. */
  by: Partial<Record<CharacterId, Contribution>>;
}
export interface ParityTable { cells: ParityCell[] }

/**
 * Every level x lineup: the lineup in `kitParty(level, depth, 1, undefined, expectedEnhance(depth), { ids, expect: true })`
 * fights every main-road group of the depth and the Lantern-eater, seeds k x 7919 for k = 1..PARITY_SEEDS, one ledger
 * per cell. `policies` replaces the default policies.
 */
export function measureParity(policies?: PolicyTable): ParityTable {
  const cells: ParityCell[] = [];
  for (const level of PARITY_LEVELS) {
    const depth = parityDepth(level);
    const scale = { depth, region: 'mainline' as const, legacy: true as const };
    const fights: { enemyIds: string[]; boss: boolean }[] = [
      ...legacyEncounterTable('mainline', depth).map((g) => ({ enemyIds: g, boss: false })),
      { enemyIds: ['lanterneater'], boss: true },
    ];
    for (const { measured, ids } of parityLineups()) {
      const ledger = newLedger();
      let rounds = 0;
      for (const f of fights) for (let k = 1; k <= PARITY_SEEDS; k++) {
        const party = kitParty(level, depth, 1, undefined, expectedEnhance(depth), { ids, expect: true });
        rounds += simBattle(party, f.enemyIds, f.boss, k * 7919, scale, undefined, 'skill', undefined, undefined, { ledger, policies }).rounds;
      }
      const by: Partial<Record<CharacterId, Contribution>> = {};
      for (const id of ids) by[id] = { ...(ledger.by[id] ?? { damage: 0, healing: 0, prevented: 0, shield: 0 }) };
      cells.push({ level, depth, ids, measured, rounds, by });
    }
  }
  return { cells };
}

/**
 * One check: `rule` 'cell' (a measured member in one cell), 'sum' (a measured member over her lineup's levels; `level` 0)
 * or 'party' (a whole party in one cell); `allowed` is the absolute difference it may have, edge included.
 */
export interface ParityRow {
  level: number; ids: string; who: CharacterId | 'party'; base: number; now: number; pct: number;
  rule: 'cell' | 'sum' | 'party'; allowed: number;
  /** 'prev': this member row is held to the previous accepted gate, not to 8b (ParityOptions). */
  against?: 'prev';
}

/**
 * What a task's parity check compares with (8d ruling on parity measurement): `prev`, the previous accepted gate's table
 * (the same seeds), and `changed`, the characters whose kit this task changes. Every party row and the changed
 * characters' member rows are held to the 8b baseline; the other members' rows to `prev`, so drift an earlier task left
 * is not charged to this one. Without `prev` (the plan's close-out) every row is held to the 8b baseline.
 */
export interface ParityOptions { prev?: ParityTable; changed?: readonly CharacterId[] }

const perRound = (c: ParityCell, ids: CharacterId[]): number =>
  ids.reduce((n, id) => n + totalOf(c.by[id] ?? { damage: 0, healing: 0, prevented: 0, shield: 0 }), 0) / c.rounds;

/** Percent change from `base` to `now`; a zero base allows only zero. */
const change = (base: number, now: number): number => base === 0 ? (now === 0 ? 0 : Infinity) : ((now - base) * 100) / base;

/**
 * `now` against `base` (plan 8c ruling 11), cells matched on level and ids; every difference is absolute, per round:
 * - each measured member in each cell within max(PARITY_MEMBER_PCT of her own baseline, PARITY_FLOOR_PCT of the cell's
 *   party baseline), so a small share is not held to a band narrower than the noise of the party around it;
 * - each measured member's cells of one lineup, summed over its levels, within PARITY_SUM_PCT of the summed baseline,
 *   with no floor;
 * - each whole party in each cell within PARITY_PARTY_PCT, with no floor.
 * Edges pass. A cell of `base` missing from `now` fails, and so does every sum it belongs to.
 * With `opts.prev`, the members `opts.changed` leaves out are held to `prev` instead of `base` (ParityOptions).
 */
export function checkParity(now: ParityTable, base: ParityTable, opts: ParityOptions = {}): { ok: boolean; rows: ParityRow[] } {
  const rows: ParityRow[] = [];
  const sums = new Map<string, { ids: string; who: CharacterId; base: number; now: number; against?: 'prev' }>();
  const push = (r: Omit<ParityRow, 'pct'>) => rows.push({ ...r, pct: change(r.base, r.now) });
  const find = (t: ParityTable, level: number, ids: string) => t.cells.find((c) => c.level === level && c.ids.join(',') === ids);
  for (const b of base.cells) {
    const ids = b.ids.join(',');
    const n = find(now, b.level, ids);
    const party = perRound(b, b.ids);
    for (const id of b.measured) {
      // Held to the previous gate when this task leaves her kit alone and there is one; a missing cell there fails.
      const toPrev = opts.prev !== undefined && !(opts.changed ?? []).includes(id);
      const ref = toPrev ? find(opts.prev!, b.level, ids) : b;
      const before = ref ? perRound(ref, [id]) : NaN, after = n ? perRound(n, [id]) : NaN;
      const refParty = ref ? perRound(ref, ref.ids) : NaN;
      const against = toPrev ? { against: 'prev' as const } : {};
      push({ level: b.level, ids, who: id, base: before, now: after, rule: 'cell',
        allowed: Math.max((PARITY_MEMBER_PCT * before) / 100, (PARITY_FLOOR_PCT * refParty) / 100), ...against });
      const key = `${ids}|${id}`;
      const sum = sums.get(key) ?? sums.set(key, { ids, who: id, base: 0, now: 0, ...against }).get(key)!;
      sum.base += before;
      sum.now += after;
    }
    push({ level: b.level, ids, who: 'party', base: party, now: n ? perRound(n, b.ids) : NaN, rule: 'party', allowed: (PARITY_PARTY_PCT * party) / 100 });
  }
  for (const s of sums.values()) push({ level: 0, ...s, rule: 'sum', allowed: (PARITY_SUM_PCT * s.base) / 100 });
  return { ok: rows.every((r) => Math.abs(r.now - r.base) <= r.allowed), rows };
}
