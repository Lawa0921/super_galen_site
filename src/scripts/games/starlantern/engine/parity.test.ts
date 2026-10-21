import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS } from '../data/characters';
import type { CharacterId } from './types';
import { totalOf } from './ledger';
import { STANDARD_LINEUP } from './party';
import {
  PARITY_FLOOR_PCT, PARITY_LEVELS, PARITY_MEMBER_PCT, PARITY_PARTY_PCT, PARITY_SEEDS, PARITY_SUM_PCT, checkParity, measureParity,
  parityDepth, parityLineups, type ParityCell, type ParityRow, type ParityTable,
} from './parity';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'sim-gate');
/** The 8b baseline at PARITY_SEEDS (recorded with the code at e43e7641; the 20-seed contribution.8b.json stays). */
const FIXTURE = join(FIXTURES, 'contribution.8b.160.json');
/**
 * The task under measurement (8d ruling on parity measurement), set by each task: the characters whose kit it changes
 * (held to 8b with every party) and the previous accepted gate it starts from (everyone else is held to that).
 * `PARITY_CLOSEOUT=1` holds every row to 8b instead: the plan's last task runs it.
 */
const PARITY_TASK: { name: string; changed: CharacterId[]; prev: string } = {
  name: '8d Task 5', changed: ['chizuru', 'selene'], prev: 'contribution.8d-3.160.json',
};
/**
 * Plan 8d's tasks that change the roster's numbers, in order; 2 stands for the last gate before the first of them. Each
 * task's `prev` must be the 160-seed table of the content task before it (`contribution.8d-<n>.160.json`, recorded from
 * that task's accepted gate), and no later table may exist: a task that forgets to move `prev` on fails here.
 */
const CONTENT_TASKS = [2, 3, 5, 6, 7, 8];
const TIMEOUT = 3_000_000;

let measured: ParityTable | undefined;
/** One measurement per file run: the slow part, shared by the tests and the gate's dump. */
const measure = (): ParityTable => (measured ??= measureParity());

const C = (damage: number, healing = 0, prevented = 0, shield = 0) => ({ damage, healing, prevented, shield });
const cell = (over: Partial<ParityCell>): ParityCell =>
  ({ level: 5, depth: 1, ids: ['hero', 'rin', 'liz', 'chizuru', 'selene'], measured: ['liz'], rounds: 10, by: {}, ...over });

describe('parity: the old roster baseline', () => {
  it('parity scenarios', () => {
    expect(PARITY_LEVELS.map(parityDepth)).toEqual([1, 3, 5, 9, 13]);
    expect([PARITY_SEEDS, PARITY_MEMBER_PCT, PARITY_FLOOR_PCT, PARITY_SUM_PCT, PARITY_PARTY_PCT]).toEqual([160, 10, 2, 10, 5]);
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

  it('a task holds its changed characters and every party to 8b, and the others to the previous gate; a close-out holds all to 8b', () => {
    // A party of 100 a round: Liz is measured, the hero is the rest.
    const one = (level: number, liz: number, hero: number): ParityCell =>
      cell({ level, rounds: 1, by: { liz: C(liz), hero: C(hero), rin: C(0), chizuru: C(0), selene: C(0) } });
    const table = (cells: ParityCell[]): ParityTable => ({ cells });
    const base = table([one(5, 20, 80)]);      // 8b
    const prev = table([one(5, 30, 70)]);      // the gate this task starts from: earlier drift moved Liz to 30
    const now = table([one(5, 31, 69)]);
    const row = (r: { rows: ParityRow[] }, who: string, rule: ParityRow['rule']) => r.rows.find((x) => x.who === who && x.rule === rule)!;
    // Liz unchanged by this task: compared with the previous gate (30 → 31, band 3), and passes.
    const task = checkParity(now, base, { prev, changed: ['noel', 'rin'] });
    expect([row(task, 'liz', 'cell').base, row(task, 'liz', 'cell').against]).toEqual([30, 'prev']);
    expect(row(task, 'liz', 'sum').against).toBe('prev');
    expect(task.ok).toBe(true);
    // Liz changed by this task: compared with 8b (20 → 31, band 2), and fails.
    const mine = checkParity(now, base, { prev, changed: ['liz'] });
    expect([row(mine, 'liz', 'cell').base, row(mine, 'liz', 'cell').against]).toEqual([20, undefined]);
    expect(mine.ok).toBe(false);
    // The close-out: no previous gate, every row against 8b.
    expect(checkParity(now, base).ok).toBe(false);
    expect(checkParity(now, base, { changed: [] }).ok).toBe(false);
    // The party is always held to 8b, whatever the previous gate says.
    const party = checkParity(table([one(5, 30, 76)]), base, { prev: table([one(5, 30, 76)]), changed: [] });
    expect([row(party, 'party', 'party').base, row(party, 'party', 'party').now]).toEqual([100, 106]);
    expect(party.ok).toBe(false);
    // An unchanged member whose cell the previous gate lacks fails rather than passing unmeasured.
    expect(checkParity(now, base, { prev: table([]), changed: [] }).ok).toBe(false);
  });

  it('the task under measurement names real characters and a recorded previous gate', () => {
    expect(PARITY_TASK.changed.length).toBeGreaterThan(0);
    for (const id of PARITY_TASK.changed) expect(CHARACTER_IDS, id).toContain(id);
    expect(existsSync(join(FIXTURES, PARITY_TASK.prev)), PARITY_TASK.prev).toBe(true);
    expect(existsSync(FIXTURE), FIXTURE).toBe(true);
  });

  it("the task's previous gate is the latest accepted one: the content task before it, and no table after that", () => {
    const task = Number(/^8d Task (\d+)$/.exec(PARITY_TASK.name)?.[1]);
    expect(CONTENT_TASKS.slice(1), PARITY_TASK.name).toContain(task);
    const before = CONTENT_TASKS[CONTENT_TASKS.indexOf(task) - 1];
    expect(PARITY_TASK.prev).toBe(`contribution.8d-${before}.160.json`);
    // The newest recorded table is that one: a table of this task or a later one means `PARITY_TASK` was left behind.
    const recorded = readdirSync(FIXTURES).map((f) => /^contribution\.8d-(\d+)\.160\.json$/.exec(f)?.[1]).filter((n) => n !== undefined).map(Number);
    expect(Math.max(...recorded)).toBe(before);
  });

  it('every character holds parity with the 8b roster', () => {
    const now = measure();
    if (process.env.SIM_GATE_OUT) {
      mkdirSync(process.env.SIM_GATE_OUT, { recursive: true });
      writeFileSync(join(process.env.SIM_GATE_OUT, 'contribution.json'), JSON.stringify(now, null, 2) + '\n');
    }
    expect(existsSync(FIXTURE), `${FIXTURE} is recorded by scripts/starlantern-sim-gate.sh`).toBe(true);
    const base = JSON.parse(readFileSync(FIXTURE, 'utf8')) as ParityTable;
    // A task's check, or with PARITY_CLOSEOUT=1 the plan's close-out (every row against 8b).
    const closeout = process.env.PARITY_CLOSEOUT === '1';
    const prev = closeout ? undefined : JSON.parse(readFileSync(join(FIXTURES, PARITY_TASK.prev), 'utf8')) as ParityTable;
    const { ok, rows } = checkParity(now, base, closeout ? {} : { prev, changed: PARITY_TASK.changed });
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
