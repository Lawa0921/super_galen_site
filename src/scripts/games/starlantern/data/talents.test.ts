import { describe, it, expect } from 'vitest';
import {
  BOARDS, BOARD_COLS, BOARD_ROWS, CHAR_KEYSTONES, DEFAULT_KEYSTONES, KEYSTONES, KEYSTONE_GATE, KEYSTONE_VALUES,
  MAX_KEYSTONES, MEMORY_KEYSTONES, MEMORY_KEYSTONE_VALUES, PALETTES, TALENT_NODES, TALENT_PER, TEMPLATE, boardPoints, keystoneCount, talentBlocker, templateOf,
} from './talents';
import { CHARACTER_IDS, DEFAULT_RULES, rulesOf } from './characters';
import { raiseTalent } from '../engine/progression';
import type { CharacterId, Member } from '../engine/types';

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
  it('each board has BOARD_ROWS x boardCols normal nodes at rank 5 and its keystones at rank 1, ids unique across boards', () => {
    const all = new Set<string>();
    let total = 0;
    for (const c of CHARACTER_IDS) {
      const b = BOARDS[c];
      expect(normals(c)).toHaveLength(BOARD_ROWS * rulesOf(c).boardCols);
      expect(ks(c)).toHaveLength(CHAR_KEYSTONES[c].length);
      total += BOARD_ROWS * rulesOf(c).boardCols + CHAR_KEYSTONES[c].length;
      for (const n of normals(c)) expect(n.maxRank).toBe(5);
      for (const n of ks(c)) expect(n.maxRank).toBe(1);
      for (const n of b) { expect(all.has(n.id)).toBe(false); all.add(n.id); expect(TALENT_NODES[n.id].owner).toBe(c); }
    }
    expect(all.size).toBe(total);
  });

  it('every palette stat has a positive TALENT_PER value and appears 4 times on its board', () => {
    for (const c of CHARACTER_IDS) {
      expect(PALETTES[c]).toHaveLength(c === 'hero' ? 9 : 6);
      for (const s of PALETTES[c]) {
        expect(TALENT_PER[s]).toBeGreaterThan(0);
        expect(normals(c).filter((n) => n.stat === s)).toHaveLength(4);
      }
    }
  });

  it('keystones come from the catalogue, distinct per character, and the descriptions show KEYSTONE_VALUES', () => {
    for (const c of CHARACTER_IDS) {
      expect(CHAR_KEYSTONES[c]).toHaveLength(c === 'hero' ? 5 : 3);
      expect(new Set(CHAR_KEYSTONES[c]).size).toBe(CHAR_KEYSTONES[c].length);
      expect(ks(c).map((n) => n.keystone)).toEqual(CHAR_KEYSTONES[c]);
      for (const k of CHAR_KEYSTONES[c]) expect(KEYSTONES[k]).toBeDefined();
      expect(DEFAULT_KEYSTONES[c]).toEqual(CHAR_KEYSTONES[c].slice(0, rulesOf(c).maxKeystones));
    }
    expect(KEYSTONES['crit-tp'].desc).toBe(`暴擊時回復 ${V.critTp} TP`);
    expect(KEYSTONES['kill-tp'].desc).toBe(`擊倒敵人時回復 ${V.killTp} TP`);
    expect(KEYSTONES['weak-tp'].desc).toBe(`打中弱點時回復 ${V.weakTp} TP`);
    expect(KEYSTONES['last-stand'].desc).toBe(`HP 低於 ${Math.round(V.lastStandHp * 100)}% 時，造成的傷害 +${V.lastStandPct}%`);
    expect(KEYSTONES['opening-gauge'].desc).toBe(`戰鬥開始時絕技量表至少為 ${V.openingGauge}`);
    expect(KEYSTONES.regen.desc).toBe(`每回合結束時回復最大 HP 的 ${V.regenPct}%`);
    expect(KEYSTONES['taunt-guard'].desc).toBe(`挑釁中受到的攻擊傷害 −${V.tauntGuardPct}%`);
  });

  it('normal nodes sit on the BOARD_ROWS x boardCols grid of templateOf and keystones on row BOARD_ROWS', () => {
    expect(TEMPLATE).toHaveLength(BOARD_ROWS);
    for (const line of TEMPLATE) expect(line).toHaveLength(BOARD_COLS);
    for (const c of CHARACTER_IDS) {
      const cols = rulesOf(c).boardCols;
      const tpl = templateOf(c);
      expect(tpl).toHaveLength(BOARD_ROWS);
      for (const line of tpl) expect(line).toHaveLength(cols);
      if (c !== 'hero') expect(tpl).toBe(TEMPLATE);
      const seen = new Set<string>();
      for (const n of normals(c)) {
        expect(n.row).toBeGreaterThanOrEqual(0); expect(n.row).toBeLessThan(BOARD_ROWS);
        expect(n.col).toBeGreaterThanOrEqual(0); expect(n.col).toBeLessThan(cols);
        expect(n.id).toBe(`${c}-t${n.row}${n.col}`);
        expect(n.stat).toBe(PALETTES[c][tpl[n.row][n.col]]);
        seen.add(`${n.row},${n.col}`);
      }
      expect(seen.size).toBe(BOARD_ROWS * cols);
      ks(c).forEach((n, i) => { expect(n.row).toBe(BOARD_ROWS); expect(n.col).toBe(i); expect(n.id).toBe(`${c}-k${i}`); });
    }
  });

  it("the hero's board is 6x6 with 5 keystones and holds 3", () => {
    expect(PALETTES.hero).toEqual(['str', 'hp', 'atk', 'wil', 'def', 'res', 'int', 'mag', 'agi']);
    expect(CHAR_KEYSTONES.hero).toEqual(['regen', 'taunt-guard', 'last-stand', 'crit-tp', 'opening-gauge']);
    expect(templateOf('hero')).toEqual([0, 1, 2, 3, 4, 5].map((r) => [0, 1, 2, 3, 4, 5].map((c) => (6 * r + c) % 9)));
    expect(normals('hero')).toHaveLength(36);
    expect(ks('hero')).toHaveLength(5);
    expect(DEFAULT_KEYSTONES.hero).toEqual(['regen', 'taunt-guard', 'last-stand']);
    expect(DEFAULT_KEYSTONES.rin).toEqual(['crit-tp', 'kill-tp']);

    /** Level 50 with KEYSTONE_GATE points on the first row, then keystones one at a time in board order. */
    const climb = (id: CharacterId) => {
      let m: Member = { id, level: 50, exp: 0, hp: 0, tp: 0, equip: {}, tree: {}, talents: fill(id, KEYSTONE_GATE) };
      const out: (string | null)[] = [];
      for (const k of ks(id)) {
        const r = raiseTalent(m, k.id);
        out.push(r.ok ? null : r.reason);
        if (r.ok) m = r.member;
      }
      return { out, held: keystoneCount(id, m.talents) };
    };
    expect(climb('hero')).toEqual({ out: [null, null, null, 'keystones', 'keystones'], held: 3 });
    expect(climb('noel')).toEqual({ out: [null, null, 'keystones'], held: 2 });
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

  it('every companion reads the default rules', () => {
    const COMPANIONS = CHARACTER_IDS.filter((id) => id !== 'hero');
    expect(COMPANIONS).toHaveLength(9);
    for (const id of COMPANIONS) expect(rulesOf(id), id).toEqual(DEFAULT_RULES);
    expect(DEFAULT_RULES).toEqual({ curve: 'companion', branches: 3, capstones: 1, boardCols: 4, maxKeystones: 2 });
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

describe('memory keystones', () => {
  it('memory keystones never sit on a board', () => {
    const onBoards = new Set(CHARACTER_IDS.flatMap((c) => BOARDS[c].filter((n) => n.keystone).map((n) => n.keystone)));
    expect(Object.keys(MEMORY_KEYSTONES).sort()).toEqual(CHARACTER_IDS.filter((c) => c !== 'hero').sort());
    for (const [c, k] of Object.entries(MEMORY_KEYSTONES)) {
      expect(onBoards.has(k), c).toBe(false);
      expect(KEYSTONES[k].name, c).not.toBe('');
      expect(KEYSTONES[k].desc, c).not.toBe('');
      expect(CHAR_KEYSTONES[c as 'noel'], c).not.toContain(k);
    }
    expect(new Set(Object.values(MEMORY_KEYSTONES)).size).toBe(9);
    expect(MEMORY_KEYSTONE_VALUES).toEqual({
      moonHealPct: 20, shrineDefPct: 15, shrineTurns: 3, troupeTurns: 1, fullHpPct: 30, tpCostPct: 20, turretPct: 30, matFind: 20,
      friendGuardPct: 20, bellAtkPct: 50, bellTurns: 2,
    });
  });
});
