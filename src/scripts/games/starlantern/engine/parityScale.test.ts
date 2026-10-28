import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ROSTER_LIVE } from '../data/monsters';
import { createBattle } from './battle';
import { LEGACY_LINEUP } from './party';
import { isRosterTable } from './scaling';
import { fullParty, withRosterOnly } from './testing';

/**
 * Roster plan L1b (controller ruling 2026-10-28, on plan ruling 7): parity weighs the characters against the old roster,
 * always, whatever is live. Its fights carry `legacy: true` on their scale, so an old foe brings no deep trait (B11) even
 * where the table has become a roster table; and nothing else in the game sets it.
 */
/**
 * Whether source code sets a `legacy` key: as an object key with a value (`legacy: true`, not a typed parameter or the
 * optional declaration `legacy?:`), a
 * shorthand or spread-carried key (`{ …, legacy }`), an assignment (`.legacy =`) or a bracket write (`['legacy'] =`).
 */
function setsLegacy(src: string): boolean {
  const code = src.replace(/\/\/.*$/gm, '');
  return /(^|[{,\s])legacy\s*:\s*(true|false|![\w.$]+|[\w.$]+\s*[,}\n])/.test(code) || /[{,]\s*legacy\s*(?=[,}\n])/.test(code) || /\.legacy\s*=(?!=)/.test(code) || /\[\s*['"]legacy['"]\s*\]\s*=(?!=)/.test(code);
}

describe('parity fights the old roster as it was (L1b)', () => {
  const OLD = ['bat', 'beetle', 'golem'];
  const fight = (legacy: boolean) =>
    createBattle({ party: fullParty(LEGACY_LINEUP), enemyIds: OLD, inventory: {}, revealed: {}, scale: { depth: 5, region: 'mainline', ...(legacy ? { legacy: true as const } : {}) } });
  const shape = (s: ReturnType<typeof fight>) => JSON.stringify({ enemies: s.enemies, defs: s.enemyDefs });

  it('a legacy scale brings no deep trait where the live table would', () => {
    expect(ROSTER_LIVE.size).toBeGreaterThan(0);
    expect(isRosterTable('mainline', 5)).toBe(true);   // the first wave made depth 5 a roster table
    const live = fight(false);
    expect(live.enemies[0].ambush).toBe(true);          // so the game's fights there do bring them
    const legacy = fight(true);
    expect(legacy.enemies.some((c) => c.ambush)).toBe(false);
    expect(legacy.enemyDefs!.e2.skills.some((k) => k.name === '重踏')).toBe(false);
    // Exactly the fight as it was with nothing live.
    expect(shape(legacy)).toBe(withRosterOnly([], () => shape(fight(false))));
  });

  it('the setter scan sees every way to set the flag (rule-6 review, low 4)', () => {
    // An object key, a shorthand or spread-carried key, an assignment, a bracket write: each counts; other words do not.
    for (const src of ["{ depth, legacy: true }", "{ ...scale, legacy }", "scale.legacy = true;", "s['legacy'] = true", "{ legacy, depth }", "const o = { legacy\n}", "{ legacy: flag, depth }"]) {
      expect(setsLegacy(src), src).toBe(true);
    }
    for (const src of ["legacyEncounterTable('mainline', 4)", "const legacy = table;", "return legacy;", "// the legacy roster", "rosterTable(region, depth, legacy)", "if (!sc.legacy) x()", "function f(legacy: string[][]): void {}", "legacy?: true;"]) {
      expect(setsLegacy(src), src).toBe(false);
    }
  });

  it("parity is the only setter: measureParity's scale carries the flag, nothing else in the game does", () => {
    const root = dirname(dirname(fileURLToPath(import.meta.url)));
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.ts$/.test(f) && !/\.test\.ts$/.test(f)) files.push(p); } };
    walk(root);
    const setters = files.filter((p) => setsLegacy(readFileSync(p, 'utf8'))).map((p) => relative(root, p).split(sep).join('/'));
    // battle.ts declares the field (`legacy?: true`) and reads it; parity.ts is the one that sets it.
    expect(setters).toEqual(['engine/parity.ts']);
    const parity = readFileSync(join(root, 'engine', 'parity.ts'), 'utf8');
    expect(parity).toMatch(/const scale = \{ depth, region: 'mainline' as const, legacy: true as const \};/);
  });
});
