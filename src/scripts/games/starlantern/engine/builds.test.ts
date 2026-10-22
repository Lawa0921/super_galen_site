import { describe, expect, it } from 'vitest';
import { BUILDS, buildOf, type BuildDef } from '../data/builds';
import { CHARACTER_IDS } from '../data/characters';
import { DEFAULT_POLICIES } from '../data/policies';
import { RUNE_SLOT_LEVELS } from '../data/runes';
import { SKILLS } from '../data/skills';
import { BOARDS, CHAR_KEYSTONES, DEFAULT_KEYSTONES } from '../data/talents';
import { T } from '../data/text.zh-TW';
import { applyBuild, applyCost, autoActions, buildSockets, buildTalents, buildTree, followUp, partyPolicies, pitchOf, policyOf, policyText, runeSource } from './builds';
import { newGame, type GameState } from './state';
import { STANDARD_LINEUP } from './party';
import { respecPrice } from './town';
import type { RuneId, RuneRef, RuneTier } from '../data/runes';
import { ABYSS_UNLOCK } from '../data/hero';
import { MAX_LEVEL } from './party';
import { defaultTalents, defaultTree, heroTalents, heroTree, learnedSkills, newTree, treeFor, validBuild } from './progression';
import { TREES } from '../data/trees';
import { socketCount } from './sockets';
import { castPower, choose, partyAt } from './sim';
import { castNow, createBattle, resolveRound, skillFor, type Action, type BattleState } from './battle';
import { encounterTable } from './scaling';
import { mulberry32 } from './rng';
import { echoOf } from './mechanics/echo';
import { LIMIT_MAX } from './battle';
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

describe('apply and follow a build (plan 8h Task 6)', () => {
  const R = (id: RuneId, tier: RuneTier = 'magic'): RuneRef => ({ id, tier });
  /** A town game: Noel at `level` on her default tree, `gold` in hand, `runes` in the bag. */
  const town = (level: number, runes: Record<string, number> = {}, gold = 5000): GameState => {
    const s = newGame(undefined, 0, STANDARD_LINEUP);
    s.party.roster.noel = { ...s.party.roster.noel, level, tree: defaultTree('noel', level), talents: defaultTalents('noel', level) };
    return { ...s, gold, runes };
  };
  const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => { if (!r.ok) throw new Error(JSON.stringify(r)); return r as Extract<T, { ok: true }>; };

  it('apply takes only from the bag and names what is missing', () => {
    const s = town(35, { 'spread@common': 1, 'spread@rare': 1 });
    s.party.roster.noel.sockets = { 'ice-star': [R('thrift')] };
    s.party.roster.rin.sockets = { 'rin-needle': [R('ignite')] };
    const before = structuredClone(s);
    const r = ok(applyBuild(s, 'noel', 'meteor'));
    expect(s).toEqual(before);   // never changes what it is given
    const noel = r.state.party.roster.noel;
    const meteor = buildOf('noel', 'meteor')!;
    expect(noel.tree).toEqual(buildTree('noel', 35, meteor));
    expect(noel.talents).toEqual(buildTalents('noel', 35, meteor));
    expect(noel.build).toBe('meteor');
    // The best 擴散 in the bag goes in; her old rune is back in the bag; the teammate's rune stays where it was.
    expect(noel.sockets).toEqual({ 'fire-star': [R('spread', 'rare')] });
    expect(r.state.runes).toEqual({ 'spread@common': 1, 'thrift@magic': 1 });
    expect(r.state.party.roster.rin.sockets).toEqual({ 'rin-needle': [R('ignite')] });
    expect(r.placed).toEqual([R('spread', 'rare')]);
    expect(r.missing).toEqual([{ skill: 'fire-star', id: 'ignite', from: 'drop' }, { skill: 'fire-star', id: 'multistrike', from: 'shop' }]);
    expect(r.later).toEqual([]);
    expect([runeSource('spread'), runeSource('ignite'), runeSource('twin-cast')]).toEqual(['shop', 'drop', 'legendary']);
  });

  it('applying the same build again is free', () => {
    const s = town(35);
    const first = ok(applyBuild(s, 'noel', 'meteor'));
    expect(first.cost).toBe(respecPrice(s.party.roster.noel));
    expect(first.state.gold).toBe(s.gold - first.cost);
    const again = ok(applyBuild(first.state, 'noel', 'meteor'));
    expect([again.cost, again.state.gold]).toEqual([0, first.state.gold]);
    // A free respec pays for it and is used up.
    const free = town(35);
    free.party.roster.noel.freeRespec = true;
    const f = ok(applyBuild(free, 'noel', 'meteor'));
    expect([f.cost, f.state.gold, f.state.party.roster.noel.freeRespec]).toEqual([0, free.gold, undefined]);
    // A member who spent nothing pays nothing.
    const fresh = town(35);
    fresh.party.roster.noel = { ...fresh.party.roster.noel, tree: newTree('noel'), talents: {} };
    expect(ok(applyBuild(fresh, 'noel', 'meteor')).cost).toBe(0);
    // Short of gold: refused, nothing changed.
    expect(applyBuild(town(35, {}, 10), 'noel', 'meteor')).toEqual({ ok: false, reason: 'gold' });
    expect(applyBuild(town(35), 'noel', 'nope')).toEqual({ ok: false, reason: 'invalid' });
    expect(applyBuild(town(35), 'noel', 'jackpot')).toEqual({ ok: false, reason: 'invalid' });   // another's build
  });

  it('a low-level apply lists later slots apart from missing runes', () => {
    const s = town(10, { 'spread@magic': 1 });
    const r = ok(applyBuild(s, 'noel', 'meteor'));
    expect(r.state.party.roster.noel.sockets).toEqual({ 'fire-star': [R('spread')] });
    expect(r.later).toEqual([{ skill: 'fire-star', id: 'ignite', level: RUNE_SLOT_LEVELS[1] }, { skill: 'fire-star', id: 'multistrike', level: RUNE_SLOT_LEVELS[2] }]);
    expect(r.missing).toEqual([]);
    // A skill the build has not learned yet: its runes are later, at the level the build learns it.
    const low = town(5);
    low.party.roster.chizuru = { ...low.party.roster.chizuru, level: 5, tree: defaultTree('chizuru', 5), talents: defaultTalents('chizuru', 5) };
    const exorcist = buildOf('chizuru', 'exorcist')!;
    const r5 = ok(applyBuild(low, 'chizuru', 'exorcist'));
    const learnAt = (skill: string) => { for (let L = 5; L <= 50; L++) if (learnedSkills({ ...r5.state.party.roster.chizuru, level: L, tree: buildTree('chizuru', L, exorcist) }).includes(skill)) return L; return 0; };
    const at = learnAt('heaven-spear');
    expect(at).toBeGreaterThan(5);
    expect(r5.later.filter((x) => x.skill === 'heaven-spear')).toEqual(exorcist.runes['heaven-spear'].map((id, i) => ({ skill: 'heaven-spear', id, level: Math.max(at, RUNE_SLOT_LEVELS[i]) })));
    expect(r5.missing.some((x) => x.skill === 'heaven-spear')).toBe(false);
  });

  it('a skill memories open is later by memories, not by a level past the cap (Task 6 review I1)', () => {
    const s = town(35);
    s.party.roster.hero = { ...s.party.roster.hero, level: 35, tree: heroTree(35, 'balanced', 0), talents: heroTalents(35, 'balanced') };
    const r = ok(applyBuild(s, 'hero', 'sword'));
    const sword = buildOf('hero', 'sword')!;
    expect(r.later.filter((x) => x.skill === 'abyss-sword')).toEqual(sword.runes['abyss-sword'].map((id) => ({ skill: 'abyss-sword', id, memories: ABYSS_UNLOCK[0] })));
    expect(r.later.every((x) => !('level' in x) || x.level <= MAX_LEVEL)).toBe(true);
  });

  it('a rune the slot refuses says why, not where to find it (Task 6 review)', () => {
    // A hand-made build whose second rune clashes with the first (one shape a skill).
    const list = BUILDS.noel as BuildDef[];
    list.push(build('noel', { key: 'clash', runes: { 'fire-star': ['spread', 'focus'] } }));
    try {
      const r = ok(applyBuild(town(35, { 'spread@magic': 1, 'focus@magic': 1 }), 'noel', 'clash'));
      expect(r.missing).toEqual([{ skill: 'fire-star', id: 'focus', refused: 'group' }]);
    } finally { list.pop(); }
  });

  it('a build that only adds to her points is free (Task 6 review)', () => {
    const meteor = buildOf('noel', 'meteor')!;
    const s = town(35);
    // What the build gives at Lv10 is part of what it gives at Lv35: no point would move.
    s.party.roster.noel = { ...s.party.roster.noel, tree: buildTree('noel', 10, meteor), talents: buildTalents('noel', 10, meteor) };
    const r = ok(applyBuild(s, 'noel', 'meteor'));
    expect(r.cost).toBe(0);
    expect(r.state.party.roster.noel.tree).toEqual(buildTree('noel', 35, meteor));
  });

  it('applyCost says when a worn rune would come off, and when points only grow (Task 7 review)', () => {
    const meteor = buildOf('noel', 'meteor')!;
    // Following it, 擴散 in its slot: nothing moves, nothing comes off.
    const on = ok(applyBuild(town(35, { 'spread@magic': 1 }), 'noel', 'meteor')).state;
    expect(applyCost(on, 'noel', 'meteor')).toEqual({ cost: 0, changes: false, moves: false, strips: false });
    // Her tree is the build's, but she wears a rune it does not suggest: it would come off.
    const worn = structuredClone(on);
    worn.party.roster.noel.sockets = { 'fire-star': [R('spread')], 'ice-star': [R('thrift')] };
    expect(applyCost(worn, 'noel', 'meteor')).toEqual({ cost: 0, changes: false, moves: false, strips: true });
    const r = ok(applyBuild(worn, 'noel', 'meteor'));
    expect([r.returned, r.state.runes]).toEqual([1, { 'thrift@magic': 1 }]);
    // A suggested rune in another slot of the skill comes off its slot too.
    const moved = structuredClone(on);
    moved.party.roster.noel.sockets = { 'fire-star': [null, R('spread')] };
    expect(applyCost(moved, 'noel', 'meteor')!.strips).toBe(true);
    expect(ok(applyBuild(moved, 'noel', 'meteor')).returned).toBe(0);   // it goes back in, to the first slot
    // Points only added (the build at Lv10 is part of it at Lv35): changes, no point moves, free.
    const grow = town(35);
    grow.party.roster.noel = { ...grow.party.roster.noel, tree: buildTree('noel', 10, meteor), talents: buildTalents('noel', 10, meteor) };
    expect(applyCost(grow, 'noel', 'meteor')).toEqual({ cost: 0, changes: true, moves: false, strips: false });
    // From the default tree: points move, at the respec's price.
    expect(applyCost(town(35), 'noel', 'meteor')).toEqual({ cost: respecPrice(town(35).party.roster.noel), changes: true, moves: true, strips: false });
  });

  it('a policy sentence spaces its number (Task 7 review)', () => {
    expect(policyText(buildOf('noel', 'meteor')!)[0]).toBe(`熱度到 4 就放${SKILLS.inferno.name}，之前先留著。`);
  });

  it('following spends the points and fills new slots at a level-up', () => {
    const s = ok(applyBuild(town(19, { 'spread@magic': 1, 'ignite@magic': 1 }), 'noel', 'meteor')).state;
    const meteor = buildOf('noel', 'meteor')!;
    expect(s.party.roster.noel.sockets).toEqual({ 'fire-star': [R('spread')] });
    const up = structuredClone(s);
    up.party.roster.noel.level = 20;
    const after = followUp(up, ['noel', 'rin']);
    const noel = after.party.roster.noel;
    expect(noel.tree).toEqual(buildTree('noel', 20, meteor));
    expect(noel.talents).toEqual(buildTalents('noel', 20, meteor));
    expect(noel.sockets).toEqual({ 'fire-star': [R('spread'), R('ignite')] });   // the new slot from the bag, the old one kept
    expect(after.runes).toEqual({});
    expect(after.party.roster.rin).toBe(up.party.roster.rin);   // not following: untouched
    // Nothing in the bag: the new slot stays empty.
    const dry = structuredClone(s);
    dry.runes = {};
    dry.party.roster.noel.level = 20;
    expect(followUp(dry, ['noel']).party.roster.noel.sockets).toEqual({ 'fire-star': [R('spread')] });
    // Nobody following, or nothing to change: the same object.
    expect(followUp(after, ['noel', 'rin'])).toBe(after);
    const plain = town(20);
    expect(followUp(plain, ['noel'])).toBe(plain);
  });

  it("a build's suggested level goes on its pitch", () => {
    const meteor = buildOf('noel', 'meteor')!;
    expect(meteor.minLevel).toBe(40);
    expect(pitchOf(meteor)).toBe(`${meteor.intro}${T.build.minLevel(40)}`);
    expect(pitchOf(buildOf('noel', 'cycle')!)).toBe(buildOf('noel', 'cycle')!.intro);
    // Still applicable below it.
    expect(applyBuild(town(20), 'noel', 'meteor').ok).toBe(true);
  });
});

describe('autoActions (plan 8h Task 8)', () => {
  /** Who picks a command this round (the battle screen's actors). */
  const actors = (b: BattleState) => b.party.filter((c) => c.alive && c.sleep === 0 && !c.frozen);
  const firstRune = (id: CharacterId) => BUILDS[id][1].key;

  it('auto keeps chosen commands and never picks what the engine refuses', () => {
    // The standard five, each following her first rune build, Lv 35, depth 9 on the main road: its first group, then the boss.
    const build = Object.fromEntries(STANDARD_LINEUP.map((id) => [id, firstRune(id)])) as Partial<Record<CharacterId, string>>;
    const party = partyAt(35, { build, heroBuild: buildOf('hero', firstRune('hero'))!.hero }, 9);
    expect(STANDARD_LINEUP.every((id) => party.roster[id].build === firstRune(id))).toBe(true);
    const scale = { depth: 9, region: 'mainline' as const };
    let rounds = 0;
    for (const [enemyIds, boss] of [[encounterTable('mainline', 9)[0], false], [['lanterneater'], true]] as const) {
      const rng = mulberry32(7919);
      let b = createBattle({ party: structuredClone(party), enemyIds: [...enemyIds], boss, inventory: {}, revealed: {}, scale });
      for (let r = 0; r < 60 && b.outcome === 'ongoing'; r++, rounds++) {
        const [first, ...rest] = actors(b);
        if (!first) { b = resolveRound(b, {}, rng); continue; }
        const mine: Action = { kind: 'attack', target: b.enemies.find((e) => e.alive)!.key };
        const auto = autoActions(b, party, rest.map((c) => c.key));
        // Only who was asked, every one of them; the first member's command is never touched.
        expect(Object.keys(auto).sort()).toEqual(rest.map((c) => c.key).sort());
        // The hero repeats only what there is to repeat.
        for (const [k, a] of Object.entries(auto)) if (a.kind === 'echo') expect(echoOf(b, b.round + 1), k).toBeTruthy();
        b = resolveRound(b, { ...auto, [first.key]: mine }, rng);
        expect(b.log.filter((e) => e.type === 'no-tp' || e.type === 'no-skill'), `round ${r}`).toEqual([]);
      }
    }
    expect(rounds).toBeGreaterThan(2);
  });

  it("auto is the build's policy, and the standard one for who follows none", () => {
    const meteor = buildOf('noel', 'meteor')!;
    const party = partyAt(50, { build: { noel: 'meteor' } }, 9);
    const b = createBattle({ party: structuredClone(party), enemyIds: encounterTable('mainline', 9)[0], boss: false, inventory: {}, revealed: {}, scale: { depth: 9, region: 'mainline' } });
    const noel = b.party.find((c) => c.key === 'noel')!;
    expect(noel.mech?.kind).toBe('heat');
    if (noel.mech?.kind === 'heat') noel.mech.heat = 4;
    noel.tp = noel.max.tp;
    expect(meteor.policy[0]).toEqual({ kind: 'spend-at', gauge: 'heat', min: 4, skill: 'inferno' });
    expect(autoActions(b, party, ['noel']).noel).toMatchObject({ kind: 'skill', skill: 'inferno' });
    // Following nothing: what the sim's own player picks.
    const plain = structuredClone(party);
    delete plain.roster.noel.build;
    const keys = actors(b).map((c) => c.key);
    expect(autoActions(b, plain, keys)).toEqual(choose(b, plain));
    // A full gauge fires the ultimate first.
    noel.limit = LIMIT_MAX;
    expect(autoActions(b, party, ['noel']).noel.kind).toBe('ultimate');
    // The hero on 殘響 with nothing recorded does not pick it.
    const echo = partyAt(35, { build: { hero: 'echo' }, heroBuild: buildOf('hero', 'echo')!.hero }, 9);
    const e = createBattle({ party: structuredClone(echo), enemyIds: encounterTable('mainline', 9)[0], boss: false, inventory: {}, revealed: {}, scale: { depth: 9, region: 'mainline' } });
    expect(echoOf(e, e.round + 1)).toBeFalsy();
    expect(autoActions(e, echo, ['hero']).hero.kind).not.toBe('echo');
  });
});

describe('the sim ranks a skill by its depth bonus too (plan 8h Task 8 review)', () => {
  it('castPower counts the abyss bonus, as the battle menu does', () => {
    const party = partyAt(50, { memories: 10 }, 9);
    expect(learnedSkills(party.roster.hero)).toContain('abyss-sword');
    const b = createBattle({ party, enemyIds: encounterTable('mainline', 9)[0], boss: false, inventory: {}, revealed: {}, scale: { depth: 9, region: 'mainline' }, abyss: 20 });
    const hero = b.party.find((c) => c.key === 'hero')!;
    const def = skillFor(hero, 'abyss-sword')!;
    const now = castNow(b, hero, def).effects.reduce((n, e) => n + (e.kind === 'damage' ? e.power * (e.hits ?? 1) : 0), 0);
    const flat = def.effects.reduce((n, e) => n + (e.kind === 'damage' ? e.power * (e.hits ?? 1) : 0), 0);
    expect(now).toBeGreaterThan(flat);
    expect(castPower(b, hero, def)).toBe(now);
  });
});
