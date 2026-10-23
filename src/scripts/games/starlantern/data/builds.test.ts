import { describe, expect, it } from 'vitest';
import { BUILDS, type BuildDef } from './builds';
import { CHARACTER_IDS } from './characters';
import { NODES, TREES } from './trees';
import { RESERVE_CAP } from './runes';
import { RUNE_STOCK } from './runeEconomy';
import { fromMember, runeView, skillFor } from '../engine/battle';
import { buildSockets, buildTalents, buildTree, policyText } from '../engine/builds';
import { battleReservePct, lastingBarrierLoss } from '../engine/mechanics/runes';
import { newMember } from '../engine/party';
import { learnedSkills } from '../engine/progression';
import { expectedMemories } from '../engine/story/expect';
import { parityDepth } from '../engine/parity';
import type { PolicyRule } from '../engine/policy';
import type { Member } from '../engine/types';

/** The levels the rune bands measure at (plan 8h ruling 7). */
const LEVELS = [35, 50];
const runeBuilds = (): BuildDef[] => CHARACTER_IDS.flatMap((id) => BUILDS[id].filter((b) => b.key !== 'standard'));
/**
 * `b`'s owner at `level`, laid out by `b`, magic runes socketed as a click would (every rune in hand). The hero holds the
 * memories expected at that level's depth (his abyss skills wait for them), as the bands measure him.
 */
const wearing = (b: BuildDef, level: number): Member => {
  const memories = b.owner === 'hero' ? expectedMemories(parityDepth(level), ['hero']).hero.memories : 0;
  const bare: Member = { ...newMember(b.owner), level, ...(memories ? { memories } : {}), tree: buildTree(b.owner, level, b, memories), talents: buildTalents(b.owner, level, b) };
  return { ...bare, sockets: buildSockets(bare, b, 'magic') };
};
const named = (r: PolicyRule): string[] => ('skills' in r ? [...r.skills] : 'skill' in r ? [r.skill] : []);

describe('the suggested builds (plan 8h Task 4)', () => {
  it('every character has a standard and two rune builds', () => {
    for (const id of CHARACTER_IDS) {
      const list = BUILDS[id];
      expect(list.length, id).toBe(id === 'hero' ? 6 : 3);
      expect(new Set(list.map((b) => b.key)).size, id).toBe(list.length);
      expect(list[0].key).toBe('standard');
      for (const b of list) {
        expect(b.owner, b.key).toBe(id);
        if (b.key === 'standard') {
          expect(b.runes).toEqual({});
          expect(b.scenario).toBeUndefined();
          // The standard is the default tree: it never names a capstone (a named one is spent for on purpose).
          expect(b.capstone).toBeUndefined();
          expect([b.first, b.sides, b.talents, b.keystones]).toEqual([undefined, undefined, undefined, undefined]);
        } else {
          expect(Object.keys(b.runes).length, `${id} ${b.key}`).toBeGreaterThan(0);
          expect(b.scenario, `${id} ${b.key}`).toBeDefined();
        }
      }
    }
  });

  it('every suggested rune works where it goes, and the build learns what it plays', () => {
    let checked = 0;
    for (const b of runeBuilds()) {
      const tag = `${b.owner} ${b.key}`;
      for (const n of [...(b.sides ?? []), ...(b.first ?? [])]) expect(NODES[n]?.owner, `${tag} ${n}`).toBe(b.owner);
      for (const n of b.sides ?? []) expect(NODES[n].pair !== undefined && TREES[b.owner].branches[NODES[n].branch].nodes[NODES[n].tier].id !== n, `${tag} ${n} is a B side`).toBe(true);
      if (b.capstone !== undefined) expect(b.capstone >= 0 && b.capstone < TREES[b.owner].branches.length, tag).toBe(true);
      for (const level of LEVELS) {
        const m = wearing(b, level);
        const c = fromMember(m, 0);
        // Every rune it socketed works: nothing reads ◇.
        for (const [skill, refs] of Object.entries(m.sockets ?? {})) {
          const states = runeView(c, skill, refs.filter((r) => r !== null))?.states ?? [];
          for (const st of states) { expect(st.miss, `${tag} Lv${level} ${skill} ${st.ref.id}`).toBeNull(); checked++; }
        }
        // Its capstone is held, and every skill its policy names is learned.
        if (b.capstone !== undefined) expect(m.tree[TREES[b.owner].branches[b.capstone].nodes[4].id], `${tag} Lv${level} capstone`).toBe(1);
        const known = learnedSkills(m);
        for (const r of b.policy) for (const s of named(r)) expect(known, `${tag} Lv${level} ${r.kind}`).toContain(s);
        // Every skill it suggests runes for is learned by Lv 50.
        if (level === 50) for (const s of Object.keys(b.runes)) expect(known, `${tag} runes on ${s}`).toContain(s);
      }
    }
    expect(checked).toBeGreaterThan(40);
  });

  it('every suggested rune does something besides raising the TP', () => {
    // The skill with all its runes against the skill without this one, TP aside: a rune whose only change is a higher TP
    // (蓄力 on a skill with no power to raise) is a rune that only costs.
    const shape = (d: ReturnType<typeof skillFor>) => (d ? JSON.stringify({ target: d.target, effects: d.effects, runeRules: d.runeRules ?? null, hpCost: d.hpCost ?? null }) : '');
    for (const b of runeBuilds()) {
      for (const level of LEVELS) {
        const m = wearing(b, level);
        for (const [skill, refs] of Object.entries(m.sockets ?? {})) {
          const all = refs.filter((r) => r !== null);
          const withAll = skillFor(fromMember(m, 0), skill)!;
          for (const r of all) {
            const less = skillFor(fromMember({ ...m, sockets: { ...m.sockets, [skill]: all.filter((x) => x !== r) } }, 0), skill)!;
            const same = shape(withAll) === shape(less);
            expect(same && withAll.tp >= less.tp, `${b.owner} ${b.key} Lv${level} ${skill} ${r.id}`).toBe(false);
          }
        }
      }
    }
  });

  it('a lasting skill takes no 延長 unless the build casts it by hand', () => {
    // 常駐 keeps it up all fight; 延長 only lengthens a cast of it.
    for (const b of runeBuilds()) {
      const cast = new Set(b.policy.flatMap(named));
      for (const [skill, ids] of Object.entries(b.runes)) {
        if (ids.includes('lasting')) expect(!ids.includes('extend') || cast.has(skill), `${b.owner} ${b.key} ${skill}`).toBe(true);
      }
    }
  });

  it('the TP held for battle stays in reach', () => {
    for (const b of runeBuilds()) {
      for (const level of LEVELS) {
        const c = fromMember(wearing(b, level), 0);
        expect(battleReservePct(c), `${b.owner} ${b.key}`).toBeLessThanOrEqual(RESERVE_CAP);
        expect(lastingBarrierLoss(c), `${b.owner} ${b.key}`).toBe(0);
      }
    }
  });

  it('every rune build can start from the shop', () => {
    for (const b of runeBuilds()) {
      const all = Object.values(b.runes).flat();
      expect(all.some((r) => (RUNE_STOCK as readonly string[]).includes(r)), `${b.owner} ${b.key}`).toBe(true);
    }
  });

  it("each build's words", () => {
    for (const id of CHARACTER_IDS) {
      for (const b of BUILDS[id]) {
        expect(b.name.length, b.key).toBeGreaterThan(0);
        expect(b.intro.length, b.key).toBeGreaterThan(0);
        expect(`${b.name}${b.intro}`, `${id} ${b.key}`).not.toMatch(/[0-9]/);
        for (const line of policyText(b)) expect(line.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('cures in the builds (difficulty plan Task 2)', () => {
  it('every build that learns a cure uses it', () => {
    let withCure = 0;
    for (const b of runeBuilds()) {
      // At the level it is suggested from (its first band level; ruling E2): a skill named in its policy is learned at
      // every band level (the test above), so a cure learned only later stays out.
      const level = LEVELS.find((l) => l >= (b.minLevel ?? 0))!;
      // The skills that cure at once, as she casts them (a 淨化 rune's cure included).
      const m = wearing(b, level);
      const c = fromMember(m, 0);
      const cures = new Set(learnedSkills(m).filter((id) => skillFor(c, id)?.effects.some((e) => e.kind === 'cure')));
      const rules = b.policy.filter((r) => r.kind === 'cure-ailment');
      const tag = `${b.owner}/${b.key}`;
      if (!cures.size) { expect(rules, tag).toEqual([]); continue; }
      withCure++;
      expect(rules.length, tag).toBe(1);
      const rule = rules[0] as Extract<PolicyRule, { kind: 'cure-ailment' }>;
      expect(cures.has(rule.skill), `${tag} ${rule.skill}`).toBe(true);
      // Before heal-below when it has one; else before its closing damage rule.
      const at = b.policy.indexOf(rule);
      const heal = b.policy.findIndex((r) => r.kind === 'heal-below');
      expect(at, tag).toBe(heal >= 0 ? heal - 1 : b.policy.length - 2);
    }
    expect(withCure).toBeGreaterThan(0);
  });
});
