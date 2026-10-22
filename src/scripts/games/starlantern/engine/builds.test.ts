import { describe, expect, it } from 'vitest';
import { BUILDS, buildOf, type BuildDef } from '../data/builds';
import { CHARACTER_IDS } from '../data/characters';
import { DEFAULT_POLICIES } from '../data/policies';
import { RUNE_SLOT_LEVELS } from '../data/runes';
import { SKILLS } from '../data/skills';
import { BOARDS, CHAR_KEYSTONES, DEFAULT_KEYSTONES } from '../data/talents';
import { T } from '../data/text.zh-TW';
import { buildSockets, buildTalents, buildTree, partyPolicies, policyOf, policyText } from './builds';
import { defaultTalents, defaultTree, heroTalents, heroTree, learnedSkills, treeFor, validBuild } from './progression';
import { TREES } from '../data/trees';
import { socketCount } from './sockets';
import { partyAt } from './sim';
import type { CharacterId, Member } from './types';

/** A build of `owner` with only what a test gives it. */
const build = (owner: CharacterId, over: Partial<BuildDef> = {}): BuildDef => ({ key: 'test', owner, name: 'test', intro: 'test', runes: {}, policy: [], ...over });
const memberAt = (id: CharacterId, level: number, b: BuildDef): Member => {
  const m = partyAt(level).roster[id] ?? partyAt(level, { ids: ['hero', id] }).roster[id];
  return { ...m, level, tree: buildTree(id, level, b), talents: buildTalents(id, level, b) };
};

describe('build data (plan 8h Task 3)', () => {
  it('the standard build is the default build', () => {
    for (const id of CHARACTER_IDS) {
      const std = BUILDS[id][0];
      expect(std.key, id).toBe('standard');
      expect(std.owner, id).toBe(id);
      expect(std.runes, id).toEqual({});
      expect(buildOf(id, 'standard')).toBe(std);
      if (DEFAULT_POLICIES[id]) expect(std.policy, id).toBe(DEFAULT_POLICIES[id]);
      else expect(std.policy, id).toEqual([]);
      for (let L = 1; L <= 50; L++) {
        expect(buildTree(id, L, std), `${id} ${L}`).toEqual(defaultTree(id, L));
        expect(buildTalents(id, L, std), `${id} ${L}`).toEqual(defaultTalents(id, L));
      }
    }
    expect(BUILDS.hero[0].hero).toBe('balanced');
    for (let m = 0; m <= 10; m++) for (const L of [1, 20, 35, 50]) expect(buildTree('hero', L, BUILDS.hero[0], m)).toEqual(heroTree(L, 'balanced', m));
    expect(buildOf('noel', 'nothing')).toBeUndefined();
  });

  it('hero builds follow HERO_BUILDS', () => {
    const sword = build('hero', { hero: 'sword' });
    for (const L of [1, 10, 35, 50]) {
      for (const m of [0, 5, 10]) expect(buildTree('hero', L, sword, m)).toEqual(heroTree(L, 'sword', m));
      expect(buildTalents('hero', L, sword)).toEqual(heroTalents(L, 'sword'));
    }
  });

  it('sides and capstone shape the tree', () => {
    const heavy = buildTree('noel', 50, build('noel', { sides: ['noel-star-heavy'] }));
    expect(heavy['noel-star-heavy']).toBeGreaterThan(0);
    expect(heavy['noel-star-twin'] ?? 0).toBe(0);
    expect(defaultTree('noel', 50)['noel-star-twin']).toBeGreaterThan(0);   // the default takes the A side
    const judged = buildTree('noel', 50, build('noel', { capstone: 2 }));
    expect(judged.judgement).toBe(1);
    expect(judged.inferno ?? 0).toBe(0);
    // `first`: a node learned before the default order would reach it.
    const early = buildTree('noel', 3, build('noel', { first: ['hex'] }));
    expect(early.hex).toBe(1);
    expect(defaultTree('noel', 3).hex ?? 0).toBe(0);
    // Every point is one the rules let her raise.
    for (const b of [build('noel', { sides: ['noel-star-heavy'], capstone: 2, first: ['hex'] })]) {
      for (const L of [5, 20, 35, 50]) expect(validBuild('noel', L, buildTree('noel', L, b), buildTalents('noel', L, b)), `${L}`).toBe(true);
    }
  });

  it('a named capstone is held by Lv 50, on every branch of every companion', () => {
    // Why a branch's ultimate cannot be held by Lv 50 even when the build spends for it first (the point budget).
    const CANNOT: Partial<Record<string, string>> = {};
    for (const id of CHARACTER_IDS.filter((c) => c !== 'hero')) {
      TREES[id].branches.forEach((branch, b) => {
        const ult = branch.nodes[4].id;
        const tree = treeFor(id, 50, 0, { capstone: b });
        const key = `${id}:${b}`;
        if (CANNOT[key]) expect(tree[ult] ?? 0, key).toBe(0);
        else expect(tree[ult], `${key} ${ult}`).toBe(1);
        expect(validBuild(id, 50, tree, defaultTalents(id, 50)), key).toBe(true);
      });
    }
    // The way there keeps the build's sides.
    const heavy = treeFor('noel', 50, 0, { capstone: 0, sides: ['noel-star-heavy'] });
    expect([heavy.inferno, heavy['noel-star-twin'] ?? 0]).toEqual([1, 0]);
    expect(heavy['noel-star-heavy']).toBeGreaterThan(0);
  });

  it('talents lean as asked', () => {
    const intNodes = BOARDS.noel.filter((n) => !n.keystone && n.stat === 'int').map((n) => n.id);
    const ranks = (t: Record<string, number>) => intNodes.reduce((n, id) => n + (t[id] ?? 0), 0);
    const lean = buildTalents('noel', 30, build('noel', { talents: ['int'] }));
    expect(ranks(lean)).toBeGreaterThan(ranks(defaultTalents('noel', 30)));
    // The keystones as given.
    const other = CHAR_KEYSTONES.noel.filter((k) => !DEFAULT_KEYSTONES.noel.includes(k)).slice(0, 1);
    expect(other).toHaveLength(1);
    const ks = buildTalents('noel', 50, build('noel', { keystones: other }));
    const held = BOARDS.noel.filter((n) => n.keystone && (ks[n.id] ?? 0) > 0).map((n) => n.keystone);
    expect(held).toEqual(other);
    expect(validBuild('noel', 50, defaultTree('noel', 50), ks)).toBe(true);
  });

  it('sockets fit the level', () => {
    expect(RUNE_SLOT_LEVELS[0]).toBe(5);
    const low = memberAt('noel', 5, build('noel')), high = memberAt('noel', 50, build('noel'));
    // A skill she learns between Lv 5 and Lv 50.
    const late = learnedSkills(high).find((s) => !learnedSkills(low).includes(s))!;
    expect(late).toBeDefined();
    const b = build('noel', { runes: { 'fire-star': ['spread', 'ignite', 'multistrike'], [late]: ['twin-cast'] } });
    expect(buildSockets(low, b, 'magic')).toEqual({ 'fire-star': [{ id: 'spread', tier: 'magic' }] });
    expect(socketCount(50)).toBe(3);
    expect(buildSockets(high, b, 'epic')).toEqual({
      'fire-star': [{ id: 'spread', tier: 'epic' }, { id: 'ignite', tier: 'epic' }, { id: 'multistrike', tier: 'epic' }],
      [late]: [{ id: 'twin-cast', tier: 'legendary' }],   // a legendary rune has one tier
    });
  });

  it('a member follows the policy of her build', () => {
    const party = partyAt(20, { ids: ['hero', 'liz', 'sylvie', 'safira', 'bobby'] });
    const liz = party.roster.liz;
    expect(policyOf(liz)).toBe(DEFAULT_POLICIES.liz);
    expect(policyOf({ ...liz, build: 'standard' })).toBe(DEFAULT_POLICIES.liz);
    expect(policyOf({ ...liz, build: 'no-such-build' })).toBe(DEFAULT_POLICIES.liz);
    expect(policyOf(party.roster.hero)).toEqual([]);
    const table = partyPolicies(party);
    expect(table.liz).toBe(DEFAULT_POLICIES.liz);
    expect(table.bobby).toBe(DEFAULT_POLICIES.bobby);
  });

  it('policy words come from the rules', () => {
    const words = policyText(build('noel', { policy: [{ kind: 'spend-at', gauge: 'heat', min: 4, skill: 'inferno' }, { kind: 'strongest-damage', aoe: true }] }));
    expect(words).toHaveLength(2);
    expect(words[0]).toContain('熱度');
    expect(words[0]).toContain('4');
    expect(words[0]).toContain(SKILLS.inferno.name);
    expect(policyText(build('noel'))).toEqual([T.build.rule.none]);
    // Every kind of rule has its sentence, with the skill's name where it names one.
    const every = build('scarlet', { policy: [
      { kind: 'ensure-barrier', skills: ['ward'], big: true, below: 30 }, { kind: 'ensure-device', skills: ['turret', 'shock-mine'] },
      { kind: 'ensure-mark', skill: 'rin-mark', big: true }, { kind: 'alternate', repeat: true },
      { kind: 'spend-at', gauge: 'embers', min: 40, of: 'maxHp', skill: 'crimson-end' }, { kind: 'heal-below', pct: 60 },
      { kind: 'strongest-damage' }, { kind: 'ensure-taunt', skill: 'provoke' }, { kind: 'ensure-cover', skill: 'cover' },
      { kind: 'release-at', min: 3, skill: 'heaven-spear' }, { kind: 'at-phase', phase: 'full', skill: 'full-moon' },
      { kind: 'execute-below', pct: 35, skill: 'rin-execute' }, { kind: 'cast-unless-last', skill: 'clap' },
      { kind: 'cast-when', skill: 'atoning-flame', big: true, whileAbsent: true }, { kind: 'echo' },
    ] });
    const lines = policyText(every);
    expect(lines).toHaveLength(15);
    for (const l of lines) expect(l.length).toBeGreaterThan(0);
    expect(lines[0]).toContain(SKILLS.ward.name);
    expect(lines[0]).toContain('30');
    expect(lines[4]).toContain('40');
    expect(lines[10]).toContain(T.mech.phase.full);
    expect(lines[13]).toContain(SKILLS['atoning-flame'].name);
    // The echo's share, from its rule.
    expect(policyText(build('hero', { policy: [{ kind: 'echo', min: 60 }] }))[0]).toContain('60');
  });
});
