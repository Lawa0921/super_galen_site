import { describe, it, expect } from 'vitest';
import {
  BOARDS, BOARD_COLS, BOARD_ROWS, CHAR_KEYSTONES, DEFAULT_KEYSTONES, KEYSTONES, KEYSTONE_GATE, KEYSTONE_VALUES,
  MAX_KEYSTONES, PALETTES, TALENT_NODES, TALENT_PER, TEMPLATE, boardPoints, keystoneCount, talentBlocker,
} from './talents';
import { CHARACTER_IDS } from './characters';

const V = KEYSTONE_VALUES;
/** Normal nodes of noel's board, row-major, that satisfy adjacency when taken in this order. */
const normals = (c: string) => BOARDS[c as 'noel'].filter((n) => !n.keystone);
const ks = (c: string) => BOARDS[c as 'noel'].filter((n) => n.keystone);
/** Ranks totalling `pts` on noel's board, filling normal nodes row-major from the top, so small totals stay in rows 0-1. */
const fill = (c: string, pts: number): Record<string, number> => {
  const out: Record<string, number> = {};
  let left = pts;
  for (const n of normals(c)) { const r = Math.min(5, left); if (r > 0) out[n.id] = r; left -= r; }
  return out;
};

describe('talent boards', () => {
  it('each board has 24 normal nodes at rank 5 and 3 keystones at rank 1, ids unique across boards', () => {
    const all = new Set<string>();
    for (const c of CHARACTER_IDS) {
      const b = BOARDS[c];
      expect(normals(c)).toHaveLength(24);
      expect(ks(c)).toHaveLength(3);
      for (const n of normals(c)) expect(n.maxRank).toBe(5);
      for (const n of ks(c)) expect(n.maxRank).toBe(1);
      for (const n of b) { expect(all.has(n.id)).toBe(false); all.add(n.id); expect(TALENT_NODES[n.id].owner).toBe(c); }
    }
    expect(all.size).toBe(CHARACTER_IDS.length * 27);
  });

  it('every palette stat has a positive TALENT_PER value and appears 4 times on its board', () => {
    for (const c of CHARACTER_IDS) {
      expect(PALETTES[c]).toHaveLength(6);
      for (const s of PALETTES[c]) {
        expect(TALENT_PER[s]).toBeGreaterThan(0);
        expect(normals(c).filter((n) => n.stat === s)).toHaveLength(4);
      }
    }
  });

  it('keystones come from the catalogue, 3 distinct per character, and the descriptions show KEYSTONE_VALUES', () => {
    for (const c of CHARACTER_IDS) {
      expect(new Set(CHAR_KEYSTONES[c]).size).toBe(3);
      expect(ks(c).map((n) => n.keystone)).toEqual(CHAR_KEYSTONES[c]);
      for (const k of CHAR_KEYSTONES[c]) expect(KEYSTONES[k]).toBeDefined();
      expect(DEFAULT_KEYSTONES[c]).toEqual(CHAR_KEYSTONES[c].slice(0, 2));
    }
    expect(KEYSTONES['crit-tp'].desc).toBe(`暴擊時回復 ${V.critTp} TP`);
    expect(KEYSTONES['kill-tp'].desc).toBe(`擊倒敵人時回復 ${V.killTp} TP`);
    expect(KEYSTONES['weak-tp'].desc).toBe(`打中弱點時回復 ${V.weakTp} TP`);
    expect(KEYSTONES['last-stand'].desc).toBe(`HP 低於 ${Math.round(V.lastStandHp * 100)}% 時，造成的傷害 +${V.lastStandPct}%`);
    expect(KEYSTONES['opening-gauge'].desc).toBe(`戰鬥開始時絕技量表 +${V.openingGauge}`);
    expect(KEYSTONES.regen.desc).toBe(`每回合結束時回復最大 HP 的 ${V.regenPct}%`);
    expect(KEYSTONES['taunt-guard'].desc).toBe(`挑釁中受到的傷害 −${V.tauntGuardPct}%`);
  });

  it('normal nodes sit on the 6x4 grid and keystones on row 6', () => {
    expect(TEMPLATE).toHaveLength(BOARD_ROWS);
    for (const line of TEMPLATE) expect(line).toHaveLength(BOARD_COLS);
    for (const c of CHARACTER_IDS) {
      const seen = new Set<string>();
      for (const n of normals(c)) {
        expect(n.row).toBeGreaterThanOrEqual(0); expect(n.row).toBeLessThan(BOARD_ROWS);
        expect(n.col).toBeGreaterThanOrEqual(0); expect(n.col).toBeLessThan(BOARD_COLS);
        expect(n.id).toBe(`${c}-t${n.row}${n.col}`);
        expect(n.stat).toBe(PALETTES[c][TEMPLATE[n.row][n.col]]);
        seen.add(`${n.row},${n.col}`);
      }
      expect(seen.size).toBe(24);
      ks(c).forEach((n, i) => { expect(n.row).toBe(6); expect(n.col).toBe(i); expect(n.id).toBe(`${c}-k${i}`); });
    }
  });
});

describe('talent rules', () => {
  it('adjacency: row 0 is free, a deeper node needs rank in one of the three cells above', () => {
    expect(talentBlocker('noel', 'noel-t00', {})).toBeNull();
    expect(talentBlocker('noel', 'noel-t10', {})).toBe('adjacency');
    expect(talentBlocker('noel', 'noel-t10', { 'noel-t00': 1 })).toBeNull();
    expect(talentBlocker('noel', 'noel-t10', { 'noel-t01': 1 })).toBeNull(); // diagonal
    expect(talentBlocker('noel', 'noel-t10', { 'noel-t02': 1 })).toBe('adjacency'); // two columns away
    expect(talentBlocker('noel', 'noel-t21', { 'noel-t13': 1 })).toBe('adjacency');
    expect(talentBlocker('noel', 'noel-t00', { 'noel-t00': 5 })).toBe('maxed');
    expect(talentBlocker('noel', 'noel-t13', { 'noel-t02': 1 })).toBeNull(); // right edge, diagonal
    expect(talentBlocker('noel', 'noel-t13', { 'noel-t03': 1 })).toBeNull();
    expect(talentBlocker('noel', 'noel-t13', { 'noel-t01': 1 })).toBe('adjacency');
    expect(talentBlocker('noel', 'noel-t20', { 'noel-t00': 5 })).toBe('adjacency'); // rank only on row r-2
  });

  it('keystones ignore adjacency and open at exactly KEYSTONE_GATE board points', () => {
    expect(KEYSTONE_GATE).toBe(12);
    // row 0 only holds 4 nodes x 5 = 20 points, so 11 / 12 points sit entirely in row 0 and 1.
    const eleven = fill('noel', KEYSTONE_GATE - 1);
    const twelve = fill('noel', KEYSTONE_GATE);
    expect(boardPoints('noel', eleven)).toBe(KEYSTONE_GATE - 1);
    expect(boardPoints('noel', twelve)).toBe(KEYSTONE_GATE);
    expect(talentBlocker('noel', 'noel-k0', eleven)).toBe('gate');
    expect(talentBlocker('noel', 'noel-k0', twelve)).toBeNull();
    // keystone ranks never count as board points
    expect(boardPoints('noel', { ...eleven, 'noel-k0': 1 })).toBe(KEYSTONE_GATE - 1);
  });

  it('refuses a third keystone but still allows re-checking a held one as maxed', () => {
    const base = fill('noel', KEYSTONE_GATE);
    const two = { ...base, 'noel-k0': 1, 'noel-k1': 1 };
    expect(keystoneCount('noel', two)).toBe(MAX_KEYSTONES);
    expect(talentBlocker('noel', 'noel-k2', two)).toBe('keystone-cap');
    expect(talentBlocker('noel', 'noel-k0', two)).toBe('maxed');
    expect(talentBlocker('noel', 'noel-k2', { ...base, 'noel-k0': 1 })).toBeNull();
  });

  it('other characters board points are not counted', () => {
    expect(talentBlocker('noel', 'noel-k0', fill('chizuru', 20))).toBe('gate');
  });

  it('unknown and foreign node ids are reported as unknown, not thrown', () => {
    expect(talentBlocker('noel', 'nope', {})).toBe('unknown');
    expect(talentBlocker('noel', 'chizuru-t00', {})).toBe('unknown');
    expect(talentBlocker('noel', '__proto__', {})).toBe('unknown');
  });

  it('malformed ranks count as 0 (Task 11 replays builds from {} and never trusts saved ranks directly)', () => {
    const bad = {
      'noel-t00': '5', 'noel-t01': NaN, 'noel-t02': -3, 'noel-t03': 99, 'noel-t10': 1.5, 'ghost-node': 50,
      'noel-k0': 'x', 'noel-k1': 7, 'noel-k2': -1,
    } as unknown as Record<string, number>;
    expect(boardPoints('noel', bad)).toBe(0);
    expect(keystoneCount('noel', bad)).toBe(0);
    expect(talentBlocker('noel', 'noel-k2', bad)).toBe('gate');
    expect(boardPoints('noel', { 'noel-t00': 5, 'noel-t01': 2 })).toBe(7);
  });
});
