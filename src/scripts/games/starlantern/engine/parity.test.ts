import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { totalOf } from './ledger';
import { STANDARD_LINEUP } from './party';
import {
  PARITY_FLOOR_PCT, PARITY_LEVELS, PARITY_MEMBER_PCT, PARITY_PARTY_PCT, PARITY_SEEDS, PARITY_SUM_PCT, checkParity, measureParity,
  parityDepth, parityLineups, type ParityCell, type ParityRow, type ParityTable,
} from './parity';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'sim-gate', 'contribution.8b.json');
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
    expect([PARITY_SEEDS, PARITY_MEMBER_PCT, PARITY_FLOOR_PCT, PARITY_SUM_PCT, PARITY_PARTY_PCT]).toEqual([20, 10, 2, 10, 5]);
    const lineups = parityLineups();
    expect(lineups).toHaveLength(6);
    expect(lineups[0]).toEqual({ measured: STANDARD_LINEUP, ids: STANDARD_LINEUP });
    expect(lineups.slice(1).map((l) => l.measured)).toEqual([['liz'], ['sylvie'], ['scarlet'], ['safira'], ['bobby']]);
    for (const l of lineups.slice(1)) expect(l.ids).toEqual(['hero', 'rin', l.measured[0], 'chizuru', 'selene']);
  });

  it('checkParity bands', () => {
    // Liz is measured alone; the party is the five. One round a cell, so a total is a round's worth.
    const one = (level: number, liz: number, hero: number): ParityCell =>
      cell({ level, rounds: 1, by: { liz: C(liz), hero: C(hero), rin: C(0), chizuru: C(0), selene: C(0) } });
    const table = (cells: ParityCell[]): ParityTable => ({ cells });
    const rowOf = (now: ParityTable, base: ParityTable, who: string, rule: ParityRow['rule'], level?: number) =>
      checkParity(now, base).rows.find((r) => r.who === who && r.rule === rule && (level === undefined || r.level === level))!;
    const within = (r: ParityRow) => Math.abs(r.now - r.base) <= r.allowed;

    // A small share: the party's 2% (20 of 1000) is the band, wider than her own 10% (2 of 20).
    const small = table([one(5, 20, 980)]);
    const s1 = rowOf(table([one(5, 39.9, 980)]), small, 'liz', 'cell');
    expect([s1.base, s1.now, s1.allowed, within(s1)]).toEqual([20, 39.9, 20, true]);
    expect(within(rowOf(table([one(5, 40.1, 980)]), small, 'liz', 'cell'))).toBe(false);
    expect(checkParity(table([one(5, 40.1, 980)]), small).ok).toBe(false);
    // A large share: her own 10% (50 of 500) is the band.
    const large = table([one(5, 500, 500)]);
    expect(rowOf(table([one(5, 549, 500)]), large, 'liz', 'cell').allowed).toBe(50);
    expect(within(rowOf(table([one(5, 549, 500)]), large, 'liz', 'cell'))).toBe(true);
    expect(checkParity(table([one(5, 549, 500)]), large).ok).toBe(true);
    expect(within(rowOf(table([one(5, 551, 500)]), large, 'liz', 'cell'))).toBe(false);
    expect(checkParity(table([one(5, 551, 500)]), large).ok).toBe(false);
    // Her five levels summed: strict 10%, no floor, edge included. +18 on a sum of 100 fails though every cell passes.
    const five = (liz: number[]) => table(PARITY_LEVELS.map((lv, i) => one(lv, liz[i], 980)));
    const base5 = five([20, 20, 20, 20, 20]);
    const r18 = checkParity(five([38, 20, 20, 20, 20]), base5);
    expect(r18.rows.filter((r) => r.rule === 'cell').every(within)).toBe(true);
    const sum18 = r18.rows.find((r) => r.rule === 'sum')!;
    expect(sum18).toEqual({ level: 0, ids: 'hero,rin,liz,chizuru,selene', who: 'liz', base: 100, now: 118, pct: 18, rule: 'sum', allowed: 10 });
    expect(r18.ok).toBe(false);
    expect(checkParity(five([30, 20, 20, 20, 20]), base5).ok).toBe(true);
    expect(checkParity(five([20, 20, 20, 20, 9.9]), base5).ok).toBe(false);
    // The party: 5% of 1000, edge included, no floor.
    const p50 = rowOf(table([one(5, 500, 550)]), large, 'party', 'party');
    expect([p50.base, p50.now, p50.allowed, p50.pct]).toEqual([1000, 1050, 50, 5]);
    expect(checkParity(table([one(5, 500, 550)]), large).ok).toBe(true);
    expect(within(rowOf(table([one(5, 500, 551)]), large, 'party', 'party'))).toBe(false);
    expect(checkParity(table([one(5, 500, 551)]), large).ok).toBe(false);
    // Rounds count: the same totals over twice the rounds is half a round's worth.
    expect(rowOf(table([{ ...one(5, 500, 500), rounds: 2 }]), large, 'liz', 'cell').pct).toBe(-50);
    // A missing cell fails.
    expect(checkParity({ cells: [] }, large).ok).toBe(false);
    expect(checkParity(table([one(10, 500, 500)]), large).ok).toBe(false);
  });

  it('every character holds parity with the 8b roster', () => {
    const now = measure();
    if (process.env.SIM_GATE_OUT) {
      mkdirSync(process.env.SIM_GATE_OUT, { recursive: true });
      writeFileSync(join(process.env.SIM_GATE_OUT, 'contribution.json'), JSON.stringify(now, null, 2) + '\n');
    }
    expect(existsSync(FIXTURE), `${FIXTURE} is recorded by scripts/starlantern-sim-gate.sh`).toBe(true);
    const base = JSON.parse(readFileSync(FIXTURE, 'utf8')) as ParityTable;
    const { ok, rows } = checkParity(now, base);
    const bad = rows.filter((r) => !(Math.abs(r.now - r.base) <= r.allowed));
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
