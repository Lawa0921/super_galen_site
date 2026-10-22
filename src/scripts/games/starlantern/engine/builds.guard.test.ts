/**
 * Plan 8h Task 9: the guards that keep the suggested builds from reaching the Normal bands, keep their words free of
 * hand-written numbers, and keep the list of nodes no build casts down to the ultimates no build takes.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILDS } from '../data/builds';
import { CHARACTER_IDS } from '../data/characters';
import { DEFAULT_CAPSTONE, NODES, TREES, tierNodes } from '../data/trees';
import { buildTree } from './builds';
import { UNCAST } from './buildBands';
import { MAX_LEVEL } from './party';
import { kitParty, partyAt } from './sim';
import type { CharacterId } from './types';

const here = dirname(fileURLToPath(import.meta.url));
const src = (...p: string[]) => readFileSync(join(here, ...p), 'utf8');

/** The lines of the block that opens on the line `open` (by its own indentation), its braces balanced. */
function block(text: string, open: string): string {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => l === open);
  expect(at, open).toBeGreaterThanOrEqual(0);
  let depth = 0;
  const out: string[] = [];
  for (const l of lines.slice(at)) {
    out.push(l);
    for (const ch of l) { if (ch === '{') depth++; else if (ch === '}') depth--; }
    if (depth === 0) break;
  }
  return out.join('\n');
}

/** The string literals of `code` once its comments and every `${…}` are taken out (a template's numbers come in there). */
function literals(code: string): string[] {
  let s = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // Innermost `${…}` first, until none is left (a template inside a template).
  for (let prev = ''; prev !== s;) { prev = s; s = s.replace(/\$\{[^{}]*\}/g, ''); }
  return [...s.matchAll(/'([^'\n]*)'|`([^`]*)`/g)].map((m) => m[1] ?? m[2]);
}

describe('build guards (plan 8h Task 9)', () => {
  it('the Normal bands never wear a build', () => {
    const files = [...readdirSync(here).filter((f) => /^balance.*\.test\.ts$/.test(f)), 'parity.ts'];
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const f of [...files.map((x) => src(x)), src('..', 'data', 'policies.ts')].map((t, i) => [files[i] ?? 'data/policies.ts', t] as const)) {
      // A lineup's `build: { … }` (Lineup.build). balance.lineups.test.ts's report cell has a `build: HeroBuild` field, the
      // hero's HERO_BUILDS tree since plan 8d, which is not a suggested build: the object form is what wears one.
      expect(/\bbuild\s*:\s*\{/.test(f[1]), `${f[0]} gives a lineup a build`).toBe(false);
      for (const word of ['runeTier', 'autoActions']) expect(f[1].includes(word), `${f[0]} has ${word}`).toBe(false);
    }
    // A lineup without `build` fields members with no build.
    for (const p of [partyAt(35), partyAt(50, {}, 10), kitParty(35, 8, 1)]) {
      for (const m of Object.values(p.roster)) expect(m.build, m.id).toBeUndefined();
    }
    // Nothing of the builds draws a random number.
    for (const f of [src('builds.ts'), src('buildBands.ts'), src('..', 'ui2', 'scenes', 'builds.ts')]) expect(f).not.toContain('Math.random');
  });

  it('the build words write no number by hand', () => {
    const text = src('..', 'data', 'text.zh-TW.ts');
    for (const open of ['  build: {', '    builds: {']) {
      const strings = literals(block(text, open));
      expect(strings.length, open).toBeGreaterThan(20);
      for (const s of strings) expect(s, `${open.trim()} ${s}`).not.toMatch(/[0-9]/);
    }
    // A build's name and line (data/builds.ts) are content: no number either.
    for (const id of CHARACTER_IDS) for (const b of BUILDS[id]) {
      expect(b.name, `${id}/${b.key}`).not.toMatch(/[0-9]/);
      expect(b.intro, `${id}/${b.key}`).not.toMatch(/[0-9]/);
    }
  });

  it('the uncast list only names ultimates no build takes (or one a controller ruling dropped)', () => {
    for (const [id, reason] of Object.entries(UNCAST)) {
      expect(reason.trim(), id).not.toBe('');
      const info = NODES[id];
      expect(info, id).toBeDefined();
      const owner = info.owner as CharacterId;
      const ultimate = tierNodes(TREES[owner].branches[info.branch], 4).some((n) => n.id === id);
      if (!ultimate) {
        // Plan 8h Task 5b ruling R5 dropped 收回 from coverage: its reason says so.
        expect(reason, id).toMatch(/ruling/);
        continue;
      }
      // No build of hers (the standard one included) lays out this branch's ultimate.
      for (const b of BUILDS[owner]) {
        const capstone = owner === 'hero' ? undefined : b.capstone ?? DEFAULT_CAPSTONE[owner as Exclude<CharacterId, 'hero'>];
        expect(capstone, `${owner}/${b.key} takes the branch of ${id}`).not.toBe(info.branch);
        expect(buildTree(owner, MAX_LEVEL, b, 10)[id] ?? 0, `${owner}/${b.key} learns ${id}`).toBe(0);
      }
    }
  });
});
