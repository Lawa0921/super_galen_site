import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RUNES, type RuneId, type RuneRef } from '../../data/runes';
import { newRun, GLIMMER_SALT } from '../dungeon/run';
import { FORGE_SALT } from '../forge/cost';
import { STANDARD_LINEUP } from '../party';
import { mulberry32, type Rng } from '../rng';
import { bagCount, ownedCount } from '../sockets';
import { newGame, type GameState } from '../state';
import { ABSORB_SALT } from '../story/fragments';
import { MEMORY_SALT } from '../story/memories';
import { constRng } from '../testing';
import { rarityWeights, STARLIT_SALT } from './drops';
import { grantRune, LEGENDARY_RUNES, NORMAL_RUNES, rollRune, RUNE_SALT, runeRng, runeTierWeights, spotRuneRng } from './runes';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, '..');

/** Every non-test .ts file under engine/, as paths relative to engine/. */
function engineSources(dir = ENGINE): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === '__fixtures__' ? [] : engineSources(p);
    return /\.ts$/.test(f) && !/\.test\.ts$/.test(f) ? [relative(ENGINE, p).replace(/\\/g, '/')] : [];
  });
}

/** An rng that returns `v` and counts its draws. */
const counting = (v: number) => {
  const r = Object.assign(() => { r.n++; return v; }, { n: 0 });
  return r;
};

const isLegendary = (r: RuneRef) => r.tier === 'legendary';

describe('rune drops (plan 8f Task 1)', () => {
  it('the salt is new', () => {
    const others = [STARLIT_SALT, MEMORY_SALT, ABSORB_SALT, GLIMMER_SALT, FORGE_SALT, 0x3c6ef372, 0x6a09e667];
    for (const s of others) expect(RUNE_SALT).not.toBe(s);
    expect(RUNE_SALT).toBe(0x5be0cd19);
    const users = engineSources().filter((f) => /0x5be0cd19/i.test(readFileSync(join(ENGINE, f), 'utf8')));
    expect(users).toEqual(['loot/runes.ts']);
  });

  it("tier weights are the gear's first four", () => {
    const { legendaryTier: _, ...four } = rarityWeights('monster', 10, 'plain');
    expect(runeTierWeights('monster', 10, 'plain')).toEqual(four);
    for (const d of [2, 40]) expect(runeTierWeights('boss', d, 'plain')).toEqual(runeTierWeights('elite', d, 'plain'));
    const share = (d: number) => {
      const w = runeTierWeights('elite', d, 'plain');
      return w.rare / (w.magic + w.rare + w.epic);
    };
    const e2 = runeTierWeights('elite', 2, 'plain');
    expect(e2.common).toBe(0);
    expect(e2.magic).toBeGreaterThan(0);
    expect(share(40)).toBeGreaterThan(share(2));
    const one = runeTierWeights('monster', 10, 'plain');
    const two = runeTierWeights('monster', 10, 'plain', 2);
    expect(two).toEqual({ common: one.common, magic: one.magic * 2, rare: one.rare * 2, epic: one.epic * 2 });
  });

  it('legendary runes come from elites and bosses only', () => {
    expect(NORMAL_RUNES).toHaveLength(26);
    expect(NORMAL_RUNES.every((id) => RUNES[id].group !== 'legendary')).toBe(true);
    expect(LEGENDARY_RUNES).toEqual(['twin-cast', 'starwheel', 'blood-price', 'sync', 'spill-shield', 'reprise']);
    expect(isLegendary(rollRune(constRng(0), 'monster', 10, 'plain'))).toBe(false);
    expect(rollRune(constRng(0), 'monster', 10, 'plain')).toEqual({ id: NORMAL_RUNES[0], tier: 'common' });
    expect(rollRune(constRng(0.999), 'monster', 10, 'plain')).toEqual({ id: NORMAL_RUNES[25], tier: 'epic' });
    for (const src of ['chest', 'vault'] as const) expect(isLegendary(rollRune(constRng(0), src, 10, 'plain'))).toBe(false);
    for (const src of ['elite', 'boss'] as const) {
      expect(rollRune(constRng(0), src, 10, 'plain')).toEqual({ id: LEGENDARY_RUNES[0], tier: 'legendary' });
      expect(isLegendary(rollRune(constRng(0.5), src, 10, 'plain'))).toBe(false);
    }
  });

  it('a roll draws the same count every time', () => {
    const m = counting(0.5);
    rollRune(m, 'monster', 10, 'plain');
    expect(m.n).toBe(2);
    for (const src of ['elite', 'boss'] as const) {
      const normal = counting(0.5);
      rollRune(normal, src, 10, 'plain');
      expect(normal.n).toBe(3);
      const legend = counting(0);
      expect(isLegendary(rollRune(legend, src, 10, 'plain'))).toBe(true);
      expect(legend.n).toBe(2);
    }
  });

  it('the odds come out as written', () => {
    const N = 20000;
    const roll = (src: 'monster' | 'elite' | 'boss', d: number, mul = 1): RuneRef[] => {
      const rng: Rng = mulberry32(1);
      return Array.from({ length: N }, () => rollRune(rng, src, d, 'plain', mul));
    };
    const elite = roll('elite', 20);
    const legend = elite.filter(isLegendary).length / N;
    expect(legend).toBeGreaterThan(0.015);
    expect(legend).toBeLessThan(0.025);
    const seen = new Set<RuneId>(elite.filter((r) => !isLegendary(r)).map((r) => r.id));
    for (const id of NORMAL_RUNES) expect(seen.has(id)).toBe(true);
    const highShare = (rs: RuneRef[]) => {
      const normal = rs.filter((r) => !isLegendary(r));
      expect(normal.some((r) => r.tier === 'common')).toBe(false);
      return normal.filter((r) => r.tier === 'rare' || r.tier === 'epic').length / normal.length;
    };
    expect(highShare(roll('boss', 40))).toBeGreaterThan(highShare(roll('boss', 2)));
    const magicUp = (rs: RuneRef[]) => rs.filter((r) => r.tier !== 'common').length / rs.length;
    expect(magicUp(roll('monster', 20, 2))).toBeGreaterThan(magicUp(roll('monster', 20)));
  });

  it('the rune streams never touch the loot stream', () => {
    const run = newRun(1234, 'mainline', 'plain', 1);
    const before = { loot: run.lootDraws, memory: run.memoryDraws };
    expect(run.runeDraws).toBe(0);
    const a = runeRng(run);
    expect(run.runeDraws).toBe(1);
    expect({ loot: run.lootDraws, memory: run.memoryDraws }).toEqual(before);
    const b = runeRng(run);
    expect(run.runeDraws).toBe(2);
    expect(a()).not.toBe(b());
    const snap = JSON.stringify({ ...run, floors: [...run.floors.keys()], opened: [...run.opened], keys: [...run.keys] });
    const p = spotRuneRng(run, 3, { x: 4, y: 5 });
    const q = spotRuneRng(run, 3, { x: 4, y: 5 });
    expect([p(), p(), p()]).toEqual([q(), q(), q()]);
    expect(spotRuneRng(run, 3, { x: 5, y: 4 })()).not.toBe(spotRuneRng(run, 3, { x: 4, y: 5 })());
    expect(JSON.stringify({ ...run, floors: [...run.floors.keys()], opened: [...run.opened], keys: [...run.keys] })).toBe(snap);
  });
});

describe('the rune bag and its stack (plan 8f Task 1)', () => {
  const spreadMagic: RuneRef = { id: 'spread', tier: 'magic' };
  /** A game with `bag` of 擴散（魔法） in the bag and one socketed on Noel. */
  const withSocketed = (bag: number): GameState => {
    const s = newGame(undefined, 0, STANDARD_LINEUP);
    s.party.roster.noel = { ...s.party.roster.noel, sockets: { 'fire-star': [spreadMagic] } };
    return { ...s, gold: 10, runes: { 'spread@magic': bag } };
  };

  it('a rune past the stack turns into its sell price', () => {
    const full = withSocketed(98);
    const before = JSON.stringify(full);
    const r = grantRune(full, spreadMagic);
    expect(r.gold).toBe(60);
    expect(r.state.gold).toBe(70);
    expect(r.state.runes).toEqual({ 'spread@magic': 98 });
    expect(JSON.stringify(full)).toBe(before);

    const room = withSocketed(97);
    const g = grantRune(room, spreadMagic);
    expect(g.gold).toBe(0);
    expect(g.state.gold).toBe(10);
    expect(bagCount(g.state, spreadMagic)).toBe(98);
    expect(bagCount(room, spreadMagic)).toBe(97);

    const bare = newGame(undefined, 0, STANDARD_LINEUP);
    expect(bare.runes).toBeUndefined();
    const n = grantRune(bare, { id: 'bounce', tier: 'rare' });
    expect(n.gold).toBe(0);
    expect(n.state.runes).toEqual({ 'bounce@rare': 1 });
    expect(bare.runes).toBeUndefined();
  });

  it("ownedCount counts the bag and every member's sockets", () => {
    const s = newGame(undefined, 0, STANDARD_LINEUP);
    expect(s.party.recruited).not.toContain('liz');
    s.party.roster.noel = { ...s.party.roster.noel, sockets: { 'fire-star': [spreadMagic, { id: 'spread', tier: 'rare' }] } };
    s.party.roster.liz = { ...s.party.roster.liz, sockets: { 'twin-slash': [null, spreadMagic] } };
    const g: GameState = { ...s, runes: { 'spread@magic': 2, 'spread@common': 5 } };
    expect(ownedCount(g, spreadMagic)).toBe(4);
    expect(ownedCount(g, { id: 'spread', tier: 'rare' })).toBe(1);
    expect(ownedCount(g, { id: 'spread', tier: 'common' })).toBe(5);
    expect(ownedCount(newGame(undefined, 0, STANDARD_LINEUP), spreadMagic)).toBe(0);
  });
});
