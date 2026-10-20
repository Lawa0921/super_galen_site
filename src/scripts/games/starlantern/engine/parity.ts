/**
 * Power parity (spec §12.6, plan 8a Task 5): each character's effective contribution per round — damage, healing,
 * damage prevented, shield — measured with the contribution ledger and the sim player's default policies, so a roster
 * change can be held to ±10% per character and ±5% per party against the old roster's baseline
 * (engine/__fixtures__/sim-gate/contribution.json).
 */
import { CHARACTER_IDS } from '../data/characters';
import { expectedEnhance } from '../data/forge';
import { newLedger, totalOf, type Contribution } from './ledger';
import { STANDARD_LINEUP } from './party';
import type { PolicyTable } from './policy';
import { encounterTable } from './scaling';
import { kitParty, simBattle } from './sim';
import type { CharacterId } from './types';

export const PARITY_LEVELS = [5, 10, 20, 35, 50] as const;
export const PARITY_SEEDS = 20;
/** A measured member's contribution per round may move this many percent either way. */
export const PARITY_MEMBER_PCT = 10;
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
    const scale = { depth, region: 'mainline' as const };
    const fights: { enemyIds: string[]; boss: boolean }[] = [
      ...encounterTable('mainline', depth).map((g) => ({ enemyIds: g, boss: false })),
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

export interface ParityRow { level: number; ids: string; who: CharacterId | 'party'; base: number; now: number; pct: number }

const perRound = (c: ParityCell, ids: CharacterId[]): number =>
  ids.reduce((n, id) => n + totalOf(c.by[id] ?? { damage: 0, healing: 0, prevented: 0, shield: 0 }), 0) / c.rounds;

/** Percent change from `base` to `now`; a zero base allows only zero. */
const change = (base: number, now: number): number => base === 0 ? (now === 0 ? 0 : Infinity) : ((now - base) * 100) / base;

/**
 * `now` against `base`, cell by cell (matched on level and ids): every measured member's contribution per round within
 * ±PARITY_MEMBER_PCT, the whole party's within ±PARITY_PARTY_PCT. A cell of `base` missing from `now` fails.
 */
export function checkParity(now: ParityTable, base: ParityTable): { ok: boolean; rows: ParityRow[] } {
  const rows: ParityRow[] = [];
  let ok = true;
  for (const b of base.cells) {
    const ids = b.ids.join(',');
    const n = now.cells.find((c) => c.level === b.level && c.ids.join(',') === ids);
    if (!n) {
      ok = false;
      rows.push({ level: b.level, ids, who: 'party', base: perRound(b, b.ids), now: NaN, pct: NaN });
      continue;
    }
    const row = (who: CharacterId | 'party', members: CharacterId[], band: number) => {
      const before = perRound(b, members), after = perRound(n, members);
      const pct = change(before, after);
      if (!(Math.abs(pct) <= band)) ok = false;
      rows.push({ level: b.level, ids, who, base: before, now: after, pct });
    };
    for (const id of b.measured) row(id, [id], PARITY_MEMBER_PCT);
    row('party', b.ids, PARITY_PARTY_PCT);
  }
  return { ok, rows };
}
