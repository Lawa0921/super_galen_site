import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { totalOf } from './ledger';
import { STANDARD_LINEUP } from './party';
import {
  PARITY_LEVELS, PARITY_MEMBER_PCT, PARITY_PARTY_PCT, PARITY_SEEDS, checkParity, measureParity, parityDepth, parityLineups,
  type ParityCell, type ParityTable,
} from './parity';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'sim-gate', 'contribution.json');
const TIMEOUT = 300_000;

let measured: ParityTable | undefined;
/** One measurement per file run: the slow part, shared by the tests and the gate's dump. */
const measure = (): ParityTable => (measured ??= measureParity());

const C = (damage: number, healing = 0, prevented = 0, shield = 0) => ({ damage, healing, prevented, shield });
const cell = (over: Partial<ParityCell>): ParityCell =>
  ({ level: 5, depth: 1, ids: ['hero', 'rin', 'liz', 'chizuru', 'selene'], measured: ['liz'], rounds: 10, by: {}, ...over });

describe('parity: the old roster baseline', () => {
  it('parity scenarios', () => {
    expect(PARITY_LEVELS.map(parityDepth)).toEqual([1, 3, 5, 9, 13]);
    expect([PARITY_SEEDS, PARITY_MEMBER_PCT, PARITY_PARTY_PCT]).toEqual([20, 10, 5]);
    const lineups = parityLineups();
    expect(lineups).toHaveLength(6);
    expect(lineups[0]).toEqual({ measured: STANDARD_LINEUP, ids: STANDARD_LINEUP });
    expect(lineups.slice(1).map((l) => l.measured)).toEqual([['liz'], ['sylvie'], ['scarlet'], ['safira'], ['bobby']]);
    for (const l of lineups.slice(1)) expect(l.ids).toEqual(['hero', 'rin', l.measured[0], 'chizuru', 'selene']);
  });

  it('checkParity bands', () => {
    // Liz is measured alone; the party is the five. Base: Liz 100 a round, the others 100 each (party 500).
    const others = { hero: C(1000), rin: C(1000), chizuru: C(600, 0, 400), selene: C(200, 800) };
    const base: ParityTable = { cells: [cell({ by: { liz: C(1000), ...others } })] };
    const withLiz = (liz: number, extra = 0) => ({ cells: [cell({ by: { liz: C(liz), ...others, hero: C(1000 + extra) } })] });
    const lizRow = (t: ParityTable) => checkParity(t, base).rows.find((r) => r.who === 'liz')!;
    expect(checkParity(withLiz(1090), base).ok).toBe(true);
    expect(lizRow(withLiz(1090))).toEqual({ level: 5, ids: 'hero,rin,liz,chizuru,selene', who: 'liz', base: 100, now: 109, pct: 9 });
    expect(checkParity(withLiz(1110), base).ok).toBe(false);
    expect(lizRow(withLiz(1110)).pct).toBe(11);
    expect(checkParity(withLiz(900), base).ok).toBe(true);
    expect(lizRow(withLiz(900)).pct).toBe(-10);
    // The party: +6% fails, +5% passes (Liz's own share stays inside her band either way).
    const party = (t: ParityTable) => checkParity(t, base).rows.find((r) => r.who === 'party')!;
    expect(checkParity(withLiz(1000, 300), base).ok).toBe(false);
    expect(party(withLiz(1000, 300))).toEqual({ level: 5, ids: 'hero,rin,liz,chizuru,selene', who: 'party', base: 500, now: 530, pct: 6 });
    expect(checkParity(withLiz(1000, 250), base).ok).toBe(true);
    expect(party(withLiz(1000, 250)).pct).toBe(5);
    // Rounds count: the same totals over twice the rounds is half a round's worth.
    expect(lizRow({ cells: [cell({ rounds: 20, by: { liz: C(1000), ...others } })] }).pct).toBe(-50);
    // A missing cell fails; a zero baseline must stay zero.
    expect(checkParity({ cells: [] }, base).ok).toBe(false);
    const zero: ParityTable = { cells: [cell({ by: { liz: C(0), ...others } })] };
    expect(checkParity(zero, zero).ok).toBe(true);
    expect(checkParity(withLiz(10), zero).ok).toBe(false);
  });

  it('every character holds ±10% and every party ±5% of the old roster', () => {
    const now = measure();
    if (process.env.SIM_GATE_OUT) {
      mkdirSync(process.env.SIM_GATE_OUT, { recursive: true });
      writeFileSync(join(process.env.SIM_GATE_OUT, 'contribution.json'), JSON.stringify(now, null, 2) + '\n');
    }
    expect(existsSync(FIXTURE), `${FIXTURE} is recorded by scripts/starlantern-sim-gate.sh`).toBe(true);
    const base = JSON.parse(readFileSync(FIXTURE, 'utf8')) as ParityTable;
    const { ok, rows } = checkParity(now, base);
    const bad = rows.filter((r) => !(Math.abs(r.pct) <= (r.who === 'party' ? PARITY_PARTY_PCT : PARITY_MEMBER_PCT)));
    expect(ok, JSON.stringify(bad, null, 1)).toBe(true);
  }, TIMEOUT);

  it('the measurement is the ledger of the default policies', () => {
    const t = measure();
    expect(t.cells).toHaveLength(PARITY_LEVELS.length * parityLineups().length);
    for (const c of t.cells) {
      expect(c.rounds, `${c.level} ${c.ids}`).toBeGreaterThan(0);
      for (const id of c.measured) expect(totalOf(c.by[id]!), `${c.level} ${c.ids} ${id}`).toBeGreaterThan(0);
      // Totals are whole numbers: the fixture stores sums, never shares.
      for (const id of c.ids) for (const v of Object.values(c.by[id]!)) expect(Number.isInteger(v)).toBe(true);
    }
  }, TIMEOUT);
});
