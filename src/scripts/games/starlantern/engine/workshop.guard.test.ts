import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS } from '../data/characters';
import { RUNE_IDS, runeKey, tiersOf } from '../data/runes';
import { cardOf, runeChoices } from '../ui2/skillCard';
import { defaultTree } from './progression';
import { socketable } from './sockets';
import { newGame, type GameState } from './state';

/**
 * Plan 8g Task 9: the workshop stays out of the balance sim and draws nothing; its words write no number by hand; every
 * rune the bag can hold reads, with a reason or none, on every skill of every member.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const source = (rel: string) => readFileSync(join(HERE, rel), 'utf8');

/** The block of `text` that opens on the line `head` and closes at the first line back at its indent. */
function block(text: string, head: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const at = lines.findIndex((l) => l.startsWith(head));
  expect(at, head).toBeGreaterThanOrEqual(0);
  const indent = head.length - head.trimStart().length;
  const end = lines.findIndex((l, i) => i > at && l.length - l.trimStart().length === indent && /^\s*[\]}]/.test(l));
  return lines.slice(at, end + 1).join('\n');
}

/** The string literals of `code` (comments out first), each template's `${…}` taken out. */
function literals(code: string): string[] {
  const bare = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const out: string[] = [];
  for (const m of bare.matchAll(/'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
    out.push((m[1] ?? m[2] ?? '').replace(/\$\{[^}]*\}/g, ''));
  }
  return out;
}

describe('workshop guards (plan 8g Task 9)', () => {
  it('the sim never meets the workshop', () => {
    const files = ['sim.ts', 'parity.ts', ...readdirSync(HERE).filter((f) => /^balance.*\.test\.ts$/.test(f)), '../data/policies.ts'];
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) {
      const text = source(f);
      for (const name of ['runeView', 'moveRune', 'lastingBarrierLoss', 'runeTutorialSeen', 'skillCard']) expect(text.includes(name), `${f} names ${name}`).toBe(false);
    }
    for (const f of ['../ui2/skillCard.ts', '../ui2/scenes/workshop.ts']) {
      const text = source(f);
      expect(text.includes('Math.random'), `${f} draws`).toBe(false);
      expect(/\brng\(/.test(text), `${f} draws from an rng`).toBe(false);
    }
  });

  it("the workshop's words write no number by hand", () => {
    const text = source('../data/text.zh-TW.ts');
    const blocks = {
      workshop: block(text, '    workshop: {'),
      tutorial: block(text, '    tutorial: ('),
      notes: block(text, '    notes: {'),
      fail: block(text, '    fail: {'),
    };
    for (const [name, code] of Object.entries(blocks)) {
      const strings = literals(code);
      expect(strings.length, name).toBeGreaterThanOrEqual(3);
      expect(strings.filter((s) => /[0-9０-９]/.test(s)), `${name} writes a number`).toEqual([]);
    }
    // The scan sees a number when there is one.
    expect(literals("a: '槽 1', b: `槽 ${i}`").filter((s) => /[0-9]/.test(s))).toEqual(['槽 1']);
  });

  it('every rune the bag can hold reads on every skill', () => {
    const s0 = newGame();
    const runes: Record<string, number> = {};
    for (const id of RUNE_IDS) for (const tier of tiersOf(id)) runes[runeKey({ id, tier })] = 1;
    const party = { ...s0.party, recruited: [...CHARACTER_IDS], roster: { ...s0.party.roster } };
    for (const id of CHARACTER_IDS) party.roster[id] = { ...party.roster[id], level: 50, tree: defaultTree(id, 50) };
    const s: GameState = { ...s0, party, runes, runesOpen: true };
    let checked = 0;
    for (const id of CHARACTER_IDS) {
      for (const skill of socketable(s.party.roster[id])) {
        const card = cardOf(s.party.roster[id], skill);
        expect(card, `${id}.${skill}`).toBeDefined();
        for (const r of card!.rows) expect(r.text.length, `${id}.${skill} ${r.key}`).toBeGreaterThan(0);
        const choices = runeChoices(s, { id, skill, slot: 0 });
        expect(choices.length, `${id}.${skill}`).toBe(Object.keys(runes).length);
        for (const c of choices) {
          expect(c.why === null || (typeof c.why === 'string' && c.why.length > 0), `${id}.${skill} ${runeKey(c.source.ref)}`).toBe(true);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(5000);
  }, 120000);
});
