import { describe, expect, it } from 'vitest';
import { HIT_DESC, SKILLS } from '../data/skills';
import { runeView, skillFor } from './battle';
import { applyRunes, runeFits, runeNotes, runeStates, runeWhy, skillTags } from './runes';
import { RUNES, RUNE_NUMBERS, RUNE_STACK, tiersOf, type RuneId, type RuneRef } from '../data/runes';
import { CHARACTER_IDS } from '../data/characters';
import { INNATE, NODES, TREES } from '../data/trees';
import { rulesOf } from '../data/characters';
import { defaultTree, treeSkills } from './progression';
import { pctOf } from './skills';
import { POWERS } from '../data/gear';
import { T } from '../data/text.zh-TW';
import type { Combatant } from './combatant';
import type { CharacterId, Effect, SkillDef } from './types';

/** How many sets of three runes the slot-order test finds (see that test). */
const SETS_COUNT = 6218;

const worn = (power: string, id: string) => skillFor({ powers: [power] }, id)!;

describe('rune tags and fit (plan 8e Task 1)', () => {
  it('tags come from the skill as it is', () => {
    expect(skillTags(SKILLS['fire-star'])).toEqual(['damage', 'single', 'ranged', 'spell', 'fire', 'tp']);
    expect(skillTags(SKILLS['twin-slash'])).toEqual(expect.arrayContaining(['multi', 'melee', 'attack', 'phys']));
    expect(skillTags(SKILLS.ward)).toEqual(['buff', 'self', 'tp']);
    expect(skillTags(SKILLS.hex)).toContain('debuff');
    expect(skillTags(SKILLS.turret)).toEqual(expect.arrayContaining(['device', 'self']));
    expect(skillTags(SKILLS.moonlight)).toEqual(expect.arrayContaining(['heal', 'single']));
    expect(skillTags(SKILLS.rebirth)).toEqual(expect.arrayContaining(['heal', 'single']));
    expect(skillTags(SKILLS.dream)).toEqual(['ailment', 'all', 'tp']);
    expect(skillTags(SKILLS.stealth)).toEqual(['self']);
    const wide = skillTags(worn('lg-noel', 'fire-star'));
    expect(wide).toContain('all');
    expect(wide).not.toContain('single');
    expect(skillTags(worn('lg-sylvie', 'aimed-shot'))).toContain('debuff');
    expect(skillTags(SKILLS['aimed-shot'])).not.toContain('debuff');
  });

  it('fit: needs, groups, the element exception', () => {
    const star = SKILLS['fire-star'], aimed = SKILLS['aimed-shot'];
    expect(runeFits(star, 'spread', [])).toBeNull();
    expect(runeFits(star, 'focus', [])).toMatchObject({ kind: 'needs' });
    expect(runeFits(star, 'focus', ['spread'])).toEqual({ kind: 'group', other: 'spread' });
    expect(runeFits(star, 'spread', ['spread'])).toMatchObject({ kind: 'same' });
    expect(runeFits(aimed, 'ignite', [])).toMatchObject({ kind: 'needs' });
    expect(runeFits(aimed, 'ignite', ['flame'])).toBeNull();
    expect(runeFits(aimed, 'ignite', ['starwheel'])).toMatchObject({ kind: 'needs' });
    expect(runeFits(aimed, 'rime', ['starwheel'])).toEqual({ kind: 'group', other: 'starwheel' });
    expect(runeFits(aimed, 'starwheel', ['rime'])).toEqual({ kind: 'group', other: 'rime' });
    // Only the ailment runes take an element from an element rune; the hint marks the need an element rune can meet.
    expect(runeFits(aimed, 'ignite', [])).toEqual({ kind: 'needs', needs: [['fire', 'damage']], hint: true });
    expect(runeFits(aimed, 'tear', [])).toBeNull();
    // No hint when an element rune could not help: 灼焰 needs a damage skill, so a heal gets the plain need.
    expect(runeFits(SKILLS.moonlight, 'ignite', [])).toEqual({ kind: 'needs', needs: [['fire', 'damage']] });
    expect(runeWhy(runeFits(SKILLS.moonlight, 'ignite', [])!)).toBe('需要：火＋傷害');
    expect(runeFits(star, 'tear', [])).toEqual({ kind: 'needs', needs: [['phys', 'damage']] });
    // Any skill takes 受擊觸發 and 同步; groups that do not exclude stand side by side.
    expect(runeFits(SKILLS.cleanse, 'on-struck', [])).toBeNull();
    expect(runeFits(star, 'regain', ['thrift', 'drain'])).toBeNull();
  });

  it("淬毒 is halved on a cast that strikes them all or at random (plan 8h ruling B2'')", () => {
    const wide = RUNE_NUMBERS.venom.fixed.widePct;
    expect(wide).toBe(50);
    const chanceOn = (skill: string) => {
      const d = applyRunes(SKILLS[skill], [], [{ id: 'venom', tier: 'magic' }]);
      return (d.effects.find((e) => e.kind === 'inflict' && e.status === 'poison') as { chance: number }).chance;
    };
    expect(chanceOn('pierce')).toBe(0.3);                       // one foe: the whole chance
    expect(chanceOn('sweep')).toBe(0.15);                       // all of them: half
    expect(chanceOn('scatter-shot')).toBe(0.15);                // at random: half
    // 擴散 makes a single-foe skill strike them all: halved too.
    const spread = applyRunes(SKILLS.pierce, [], [{ id: 'venom', tier: 'magic' }, { id: 'spread', tier: 'magic' }]);
    expect((spread.effects.find((e) => e.kind === 'inflict') as { chance: number }).chance).toBe(0.15);
    expect(RUNES.venom.text('magic')).toContain(`${wide}%`);
  });

  it('a trigger rune needs a plain effect (plan 8h Task 2, ruling 11b)', () => {
    // A triggered cast only plays the plain effects: a skill with none of them takes no trigger rune.
    for (const r of ['on-struck', 'on-crit', 'on-kill'] as RuneId[]) {
      for (const skill of ['turret', 'moon-recall', 'ward']) {
        if (runeFits(SKILLS[skill], r, [])?.kind === 'needs') continue;   // its tags already say no
        expect(runeFits(SKILLS[skill], r, []), `${r} ${skill}`).toEqual({ kind: 'plain' });
      }
    }
    expect(runeWhy({ kind: 'plain' })).toBe(T.rune.why.plain);
    expect(runeFits(SKILLS['blaze-ring'], 'on-struck', [])).toBeNull();
    expect(runeFits(SKILLS.cleanse, 'on-struck', [])).toBeNull();   // a cure is plain
    // Judged on the skill before runes (a mechanic extra beside a plain effect is fine: 挑釁・高喊).
    expect(runeFits(skillFor({ powers: [], ranks: { provoke: 1, 'scarlet-provoke-shout': 1 } }, 'provoke')!, 'on-struck', [])).toBeNull();
    expect(runeStates(SKILLS.turret, [{ id: 'on-struck', tier: 'magic' }])[0].miss).toEqual({ kind: 'plain' });
  });

  it('fit: the structural reasons', () => {
    expect(runeFits(SKILLS.rebirth, 'spread', [])).toEqual({ kind: 'revive' });
    expect(runeFits(SKILLS['scatter-shot'], 'focus', [])).toEqual({ kind: 'scatter' });
    expect(runeFits(SKILLS['scatter-shot'], 'bounce', [])).toEqual({ kind: 'scatter' });
    expect(runeFits(SKILLS['iron-wall'], 'share', [])).toBeNull();
    expect(runeFits(worn('lg-scarlet', 'provoke'), 'share', [])).toEqual({ kind: 'pure' });
    expect(runeFits(SKILLS.ward, 'lasting', [])).toBeNull();
    expect(runeFits(SKILLS.ward, 'share', [])).toEqual({ kind: 'pure' });
    expect(runeFits(SKILLS.turret, 'lasting', [])).toEqual({ kind: 'pure' });
    expect(runeFits(SKILLS.rebirth, 'spill-shield', [])).toEqual({ kind: 'no-heal' });
    expect(runeFits(SKILLS.moonlight, 'spill-shield', [])).toBeNull();
  });

  it('runeStates: a lost element takes its ailment with it', () => {
    const aimed = SKILLS['aimed-shot'];
    const flame = { id: 'flame', tier: 'magic' } as const, rime = { id: 'rime', tier: 'common' } as const;
    const ignite = { id: 'ignite', tier: 'rare' } as const;
    expect(runeStates(aimed, [flame, ignite])).toEqual([{ ref: flame, miss: null }, { ref: ignite, miss: null }]);
    const [r, i] = runeStates(aimed, [rime, ignite]);
    expect(r).toEqual({ ref: rime, miss: null });
    expect(i.miss).toMatchObject({ kind: 'needs' });
    // An element rune that does not fit gives no element: 灼焰 on a heal fails, and so does the 點燃 that leaned on it.
    const [f, g] = runeStates(SKILLS.moonlight, [flame, ignite]);
    expect(f.miss).toMatchObject({ kind: 'needs' });
    expect(g.miss).toMatchObject({ kind: 'needs' });
    // A rune that does not work still holds its exclusive group (controller ruling, Task 2 review): 集中 does not fit a
    // single-target skill, and the 擴散 beside it is still refused for the group.
    const spreadM = { id: 'spread', tier: 'magic' } as const, focusM = { id: 'focus', tier: 'magic' } as const;
    const [fo, sp] = runeStates(SKILLS['fire-star'], [focusM, spreadM]);
    expect(fo.miss).toEqual({ kind: 'group', other: 'spread' });
    expect(sp.miss).toEqual({ kind: 'group', other: 'focus' });
    expect(runeFits(SKILLS['fire-star'], 'focus', [])).toMatchObject({ kind: 'needs' });
    // Slot order does not change the verdicts.
    expect(runeStates(aimed, [ignite, flame])).toEqual([{ ref: ignite, miss: null }, { ref: flame, miss: null }]);
  });

  it('the reason reads in one line', () => {
    expect(runeWhy({ kind: 'needs', needs: [['single', 'damage'], ['single', 'heal']] })).toBe('需要：單體＋傷害，或單體＋治療');
    expect(runeWhy({ kind: 'group', other: 'spread' })).toBe('已有同類符文：擴散');
    expect(runeWhy(runeFits(SKILLS['aimed-shot'], 'ignite', [])!)).toBe('需要：火（可由屬性符文提供）＋傷害');
    expect(runeWhy(runeFits(SKILLS['fire-star'], 'spread', ['spread'])!)).toBe('同一招不能裝兩個擴散');
    expect(runeWhy({ kind: 'revive' })).toBe('不能用在復活');
    expect(runeWhy({ kind: 'scatter' })).toBe('隨機目標的招不能改形狀');
    expect(runeWhy({ kind: 'pure' })).toBe('只能用在只有增益的招');
    expect(runeWhy({ kind: 'no-heal' })).toBe('需要：回復效果');
    expect(runeWhy(runeFits(SKILLS['moon-recall'], 'twin-cast', [])!)).toBe('需要：消耗 TP');
  });

  it("extend looks at the skill's own effects", () => {
    const aimed = worn('lg-sylvie', 'aimed-shot');
    expect(runeFits(aimed, 'extend', [], SKILLS['aimed-shot'])).toMatchObject({ kind: 'needs' });
    // Without a core given, the skill is its own core (the extra counts).
    expect(runeFits(aimed, 'extend', [])).toBeNull();
    expect(runeFits(SKILLS['hunters-mark'], 'extend', [])).toBeNull();
    const [e] = runeStates(aimed, [{ id: 'extend', tier: 'magic' }], SKILLS['aimed-shot']);
    expect(e.miss).toMatchObject({ kind: 'needs' });
  });
});

describe('runes rewrite the skill (plan 8e Task 3)', () => {
  const m = (id: RuneId): RuneRef => ({ id, tier: tiersOf(id).includes('magic') ? 'magic' : 'legendary' });
  /** The skill as a member with these runes on it casts it. */
  const rune = (id: string, refs: RuneRef[], over: { powers?: string[]; ranks?: Record<string, number> } = {}) =>
    skillFor({ powers: [], ...over, runes: { [id]: refs } }, id)!;
  const dmg = (d: SkillDef, i = 0) => d.effects.filter((e) => e.kind === 'damage')[i] as Extract<Effect, { kind: 'damage' }>;

  it("spread, focus and the spec's examples", () => {
    const wide = rune('fire-star', [m('spread')]);
    expect([wide.target, dmg(wide).power, wide.tp]).toEqual(['enemies', 84, 4]);
    const arrows = rune('aimed-shot', [m('spread'), m('flame'), m('ignite')]);
    expect([arrows.target, dmg(arrows).element, dmg(arrows).power, arrows.tp]).toEqual(['enemies', 'fire', pctOf(160, 63), 6]);
    expect(dmg(arrows).power).toBe(101);
    expect(dmg(arrows).onHit).toEqual([{ status: 'burn', chance: 0.35 }]);
    const rain = rune('moon-rain', [m('focus')]);
    expect(rain.target).toBe('ally');
    expect((rain.effects[0] as { power: number }).power).toBe(pctOf((SKILLS['moon-rain'].effects[0] as { power: number }).power, 170));
  });

  it('hits: one more, or one big', () => {
    const more = rune('twin-slash', [m('multistrike')]);
    expect([dmg(more).hits, dmg(more).power]).toEqual([3, 45]);
    const one = rune('twin-slash', [m('heavy')]);
    expect([dmg(one).hits, dmg(one).power]).toEqual([1, 138]);
  });

  it('TP adds percents, then flat, then floors at 1; a free skill stays free', () => {
    expect(rune('blade-dance', [m('thrift'), m('charge')]).tp).toBe(6);
    expect(rune('blade-dance', [m('thrift'), m('charge'), m('twin-cast')]).tp).toBe(11);
    const thrift = rune('fire-star', [m('thrift')]);
    expect([thrift.tp, dmg(thrift).power]).toEqual([3, 112]);
    expect(applyRunes({ ...SKILLS['war-dance'], tp: 0 }, [], [m('extend')]).tp).toBe(0);
    // 延長 +2 rounds and +2 TP on 戰舞.
    const longer = rune('war-dance', [m('extend')]);
    expect([longer.tp, (longer.effects[0] as { turns: number }).turns]).toEqual([9, 5]);
  });

  it('blood price turns TP into HP', () => {
    const star = rune('fire-star', [m('blood-price')]);
    expect([star.tp, star.hpCost]).toEqual([0, 0.12]);
    expect(star.runeRules?.plain).toEqual({ tp: 4 });
    const burst = rune('flame-burst', [m('blood-price')]);
    expect(burst.hpCost).toBe(0.29);
    expect(burst.runeRules?.plain).toEqual({ tp: 3, hpCost: 0.2 });
  });

  // Every three magic-tier runes that fit together (legendary runes at their one tier) on seven skills, in all six orders:
  // 6218 sets when written (SETS_COUNT, asserted exactly below, so a change to what fits is seen here).
  it('the order of the slots never matters', () => {
    const ids = Object.keys(RUNES) as RuneId[];
    let sets = 0;
    for (const sk of ['fire-star', 'twin-slash', 'aimed-shot', 'moonlight', 'war-dance', 'iron-wall', 'blade-dance']) {
      for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) for (let c = b + 1; c < ids.length; c++) {
        const refs = [m(ids[a]), m(ids[b]), m(ids[c])];
        if (runeStates(SKILLS[sk], refs).some((x) => x.miss)) continue;
        sets++;
        const first = rune(sk, refs);
        for (const p of [[0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) expect(rune(sk, p.map((i) => refs[i])), `${sk} ${p}`).toEqual(first);
      }
    }
    expect(sets).toBe(SETS_COUNT);
    const three: [string, RuneId[]][] = [['fire-star', ['thunderclap', 'ignite', 'jolt']], ['aimed-shot', ['regain', 'drain', 'thrift']], ['moonlight', ['dispel', 'spill-shield', 'thrift']]];
    for (const [sk, list] of three) {
      const refs = list.map(m);
      expect(runeStates(SKILLS[sk], refs).every((x) => x.miss === null)).toBe(true);
      const first = rune(sk, refs);
      for (const p of [[0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) expect(rune(sk, p.map((i) => refs[i]))).toEqual(first);
    }
    const star = rune('fire-star', [m('jolt'), m('ignite'), m('thunderclap')]);
    expect(dmg(star).element).toBe('thunder');
    expect(dmg(star).onHit).toEqual([{ status: 'burn', chance: 0.35 }, { status: 'shock', chance: 0.35 }]);
    const shot = rune('aimed-shot', [m('drain'), m('thrift'), m('regain')]);
    expect([dmg(shot).drainPct, dmg(shot).tpPerHit, shot.tp, dmg(shot).power]).toEqual([8, 1, Math.round(5 * 0.65) + 1, pctOf(160, 68)]);
    const moon = rune('moonlight', [m('thrift'), m('spill-shield'), m('dispel')]);
    expect(moon.effects).toEqual([{ kind: 'heal', power: pctOf(120, 84), overflowPct: 30 }, { kind: 'cure' }]);
  });

  it('a lasting rune leaves the castable skill alone', () => {
    const dance = rune('war-dance', [m('lasting')]);
    expect([(dance.effects[0] as { pct: number }).pct, dance.tp]).toEqual([25, 7]);
    expect(dance.runeRules?.lasting).toEqual({ pct: 60, reservePct: 30 });
    const { runeRules, ...rest } = dance;
    expect(runeRules).toEqual({ lasting: { pct: 60, reservePct: 30 } });
    expect(rest).toEqual(SKILLS['war-dance']);
  });

  it('a rune that stops fitting stays put and changes nothing', () => {
    const bow = { powers: ['storm-thunder-bow'] };
    expect(dmg(rune('aimed-shot', [m('jolt')], bow)).onHit).toEqual([{ status: 'shock', chance: 0.35 }]);
    expect(rune('aimed-shot', [m('jolt')])).toEqual(skillFor({ powers: [] }, 'aimed-shot'));
    expect(dmg(rune('aimed-shot', [m('jolt')], bow)).onHit).toEqual([{ status: 'shock', chance: 0.35 }]);
  });

  it('an ailment the skill already has is merged, highest chance', () => {
    const ranks = (r: number) => ({ ranks: { 'flame-wave': 1, 'noel-wave-burn': r } });
    expect(skillFor({ powers: [], ...ranks(1) }, 'flame-wave')!.effects).toContainEqual({ kind: 'inflict', status: 'burn', chance: 0.3 });
    const one = rune('flame-wave', [m('ignite')], ranks(1));
    expect(one.effects.some((e) => e.kind === 'inflict')).toBe(false);
    expect(dmg(one).onHit).toEqual([{ status: 'burn', chance: 0.35 }]);
    const three = rune('flame-wave', [{ id: 'ignite', tier: 'common' }], ranks(3));
    expect(three.effects.some((e) => e.kind === 'inflict')).toBe(false);
    expect(dmg(three).onHit).toEqual([{ status: 'burn', chance: 0.5 }]);
    // A rune cast once per cast adds its own inflict; the skill's own of the same ailment merges into it, highest chance.
    const own = (SKILLS['rin-venom-needle'].effects.find((e) => e.kind === 'inflict') as { chance: number }).chance;
    const venom = rune('rin-venom-needle', [m('venom')]);
    expect(venom.effects.filter((e) => e.kind === 'inflict')).toEqual([{ kind: 'inflict', status: 'poison', chance: Math.max(own, 0.3) }]);
  });

  it('no runes, the very same skill', () => {
    for (const id of CHARACTER_IDS) {
      const ranks = defaultTree(id, 50);
      for (const sk of Object.keys(SKILLS).filter((k) => SKILLS[k].owner === id)) {
        expect(skillFor({ powers: [], ranks, runes: {} }, sk), sk).toEqual(skillFor({ powers: [], ranks }, sk));
        expect(skillFor({ powers: [], ranks, runes: { [sk]: [] } }, sk), sk).toEqual(skillFor({ powers: [], ranks }, sk));
      }
    }
  });
});

describe('rune follow-ups (plan 8e Task 3 review)', () => {
  const m = (id: RuneId): RuneRef => ({ id, tier: tiersOf(id).includes('magic') ? 'magic' : 'legendary' });
  const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

  it('the order of the slots never matters when one rune fails, and the failing one changes nothing', () => {
    const on = (refs: RuneRef[]) => skillFor({ powers: [], runes: { 'fire-star': refs } }, 'fire-star')!;
    // 撕裂 needs a physical skill: it fails on 火之星彈 and the skill is as if only 擴散 and 吸血 were there.
    const torn = [m('spread'), m('tear'), m('drain')];
    expect(runeStates(SKILLS['fire-star'], torn).map((x) => x.miss?.kind ?? null)).toEqual([null, 'needs', null]);
    for (const p of orders) expect(on(p.map((i) => torn[i]))).toEqual(on([m('spread'), m('drain')]));
    // 擴散 and 集中 hold each other's group: both fail, and only 吸血 counts.
    const both = [m('spread'), m('focus'), m('drain')];
    for (const p of orders) expect(on(p.map((i) => both[i]))).toEqual(on([m('drain')]));
  });

  it("the hit count's words change whole numbers only", () => {
    const def = { ...SKILLS['twin-slash'], desc: '練了 12 次，連砍 2 次' };
    expect(applyRunes(def, [], [m('multistrike')]).desc).toBe('練了 12 次，連砍 3 次');
    expect(applyRunes({ ...SKILLS['twin-slash'] }, [], [m('heavy')]).desc).toBe(SKILLS['twin-slash'].desc.replace('2 次', '1 次'));
  });

  it("延長 fits no skill with a sleep's rounds or the moon's hold (its rounds go to buffs, debuffs and devices)", () => {
    const flagged: string[] = [];
    const check = (label: string, def: SkillDef) => {
      if (runeFits(def, 'extend', [], def) !== null) return;
      if (def.effects.some((e) => (e.kind === 'inflict' && e.status === 'sleep') || e.kind === 'moon')) flagged.push(label);
    };
    for (const [id, def] of Object.entries(SKILLS)) check(id, def);
    // Every variant at its top rank, on its own skill.
    for (const [id, { node }] of Object.entries(NODES)) {
      if (node.kind !== 'variant') continue;
      check(id, skillFor({ powers: [], ranks: { [node.skill!]: 1, [id]: node.maxRank } }, node.skill!)!);
    }
    expect(flagged).toEqual([]);
  });

  it('the skills one roster could ever hold runes on are fewer than a rune stack', () => {
    // So slots never hold more than RUNE_STACK of one rune (one of a rune a skill), and the save repair only trims the bag.
    // A bound no legal build passes: her innate skills, every active below the capstone tier, and the capstone actives of
    // only as many branches as she may hold capstones in (the largest ones), passives left out.
    const bound = (id: CharacterId): number => {
      const actives = Object.values(NODES).filter((x) => x.owner === id && x.node.kind === 'active' && !SKILLS[x.node.skill!].passive);
      const caps = TREES[id].branches.map((_, b) => actives.filter((x) => x.tier === 4 && x.branch === b).length).sort((a, b) => b - a);
      return (INNATE[id] ?? []).length + actives.filter((x) => x.tier < 4).length + caps.slice(0, rulesOf(id).capstones).reduce((a, n) => a + n, 0);
    };
    const total = CHARACTER_IDS.reduce((a, id) => a + bound(id), 0);
    expect(total).toBeLessThan(RUNE_STACK);
    // Every skill of every tree, capstones and all, would be more: the capstone rule is what keeps it under.
    expect(CHARACTER_IDS.reduce((a, id) => a + treeSkills(id).filter((sk) => !SKILLS[sk].passive).length, 0)).toBeGreaterThan(total);
  });
});

describe('the words follow the runes (plan 8g Task 2)', () => {
  const m = (id: RuneId): RuneRef => ({ id, tier: tiersOf(id).includes('magic') ? 'magic' : 'legendary' });
  type Build = Pick<Combatant, 'powers' | 'ranks'>;
  /** Every way each member's skills can stand: plain, each tree node that rewrites it (both sides of a pair), each legendary power on it. */
  const builds = (): { label: string; skill: string; c: Build }[] => {
    const out: { label: string; skill: string; c: Build }[] = [];
    for (const id of CHARACTER_IDS) {
      for (const skill of treeSkills(id).filter((k) => !SKILLS[k].passive)) {
        const own = NODES[skill]?.node.kind === 'active' ? { [skill]: NODES[skill].node.maxRank } : {};
        out.push({ label: skill, skill, c: { powers: [], ranks: own } });
        for (const [nid, info] of Object.entries(NODES)) {
          if (info.owner === id && info.node.skill === skill && info.node.kind !== 'active') {
            out.push({ label: `${skill}+${nid}`, skill, c: { powers: [], ranks: { ...own, [nid]: info.node.maxRank } } });
          }
        }
        for (const pw of Object.values(POWERS)) if (pw.skill === skill) out.push({ label: `${skill}+${pw.id}`, skill, c: { powers: [pw.id], ranks: own } });
      }
    }
    return out;
  };
  /** The old>new target words (plan 8g ruling 14). */
  const WORDS: Record<string, [string, string][]> = {
    'enemy>enemies': [['一名敵人', '全體敵人'], ['單體', '全體'], ['牠', '牠們']],
    'ally>allies': [['一名隊友', '我方全體'], ['單體', '全體']],
    'enemies>enemy': [['全體敵人', '一名敵人'], ['敵方全體', '一名敵人'], ['全體', '單體'], ['牠們', '牠']],
    'allies>ally': [['我方全體', '一名隊友'], ['全隊', '一名隊友'], ['全體', '單體']],
    'self>allies': [['自身', '我方全體']],
  };
  /** An old word where it stands alone: 牠 inside 牠們 is not the word 牠. */
  const oldWord = (a: string, b: string) => new RegExp(b.startsWith(a) ? `${a}(?!${b.slice(a.length)})` : a, 'g');
  const masked = (d: string) => d.replace(/[0-9]+/g, '#');
  const one = (skill: string, r: RuneId) => applyRunes(SKILLS[skill], [], [m(r)]).desc;

  it('words follow the target', () => {
    let changed = 0;
    for (const { label, skill, c } of builds()) {
      const before = skillFor(c, skill)!;
      for (const r of ['spread', 'focus', 'share'] as const) {
        if (runeView(c, skill, [m(r)])!.states[0].miss !== null) continue;
        const after = skillFor({ ...c, runes: { [skill]: [m(r)] } }, skill)!;
        const pairs = WORDS[`${before.target}>${after.target}`];
        expect(pairs, `${label}+${r}: ${before.target}>${after.target}`).toBeDefined();
        let rest = before.desc, any = false;
        for (const [a, b] of [...pairs!].sort((x, y) => y[0].length - x[0].length)) {
          if (!oldWord(a, b).test(rest)) continue;
          any = true;
          expect(after.desc, `${label}+${r}`).toContain(b);
          rest = rest.replace(oldWord(a, b), '|');
        }
        for (const [a, b] of pairs!) expect(oldWord(a, b).test(after.desc), `${label}+${r}: ${after.desc}`).toBe(false);
        if (any) changed++;
        else expect(masked(after.desc), `${label}+${r}`).toBe(masked(before.desc));
      }
    }
    expect(changed).toBeGreaterThan(20);
    // Pinned.
    expect(one('sweep', 'focus')).toBe('攻擊一名敵人');
    expect(one('moonlight', 'spread')).toBe('回復我方全體 HP');
    expect(one('pierce', 'spread')).toBe('全體強力突刺');
    expect(one('pin-shot', 'spread')).toBe('釘住牠們的腳。下一回合，牠們最後才動。');
    expect(one('iron-wall', 'share')).toBe('我方全體防禦大幅提升');
    expect(one('moon-rain', 'focus')).toBe('回復一名隊友 HP');
  });

  it('words follow the element', () => {
    let changed = 0;
    for (const { label, skill, c } of builds()) {
      const before = skillFor(c, skill)!;
      const was = new Set(before.effects.flatMap((e) => (e.kind === 'damage' ? [e.element] : [])));
      for (const r of ['flame', 'rime', 'thunderclap'] as const) {
        if (runeView(c, skill, [m(r)])!.states[0].miss !== null) continue;
        const after = skillFor({ ...c, runes: { [skill]: [m(r)] } }, skill)!;
        const now = (after.effects.find((e) => e.kind === 'damage') as { element: keyof typeof T.element }).element;
        for (const el of was) {
          if (el === now || el === 'phys') continue;
          const word = `${T.element[el]}屬性`;
          if (!before.desc.includes(word)) continue;
          changed++;
          expect(after.desc, `${label}+${r}`).not.toContain(word);
          expect(after.desc, `${label}+${r}`).toContain(`${T.element[now]}屬性`);
        }
      }
    }
    expect(changed).toBeGreaterThan(10);
    expect(one('fire-star', 'rime')).toBe('冰屬性魔法攻擊');
    expect(one('flame-wave', 'thunderclap')).toBe('雷屬性全體魔法攻擊');
    // The same element: nothing to say.
    expect(one('fire-star', 'flame')).toBe(SKILLS['fire-star'].desc);
  });

  it("順手牽羊's whole phrase counts with 連擊", () => {
    expect(HIT_DESC.pickpocket!(3)).toBe(SKILLS.pickpocket.desc);
    expect(one('pickpocket', 'multistrike')).toBe('手一晃、二晃、三晃、四晃，輕輕四下就摸走 2 枚銅板。成交。');
    expect(one('pickpocket', 'heavy')).toBe('手一晃，輕輕一下就摸走 2 枚銅板。成交。');
    // 散射 counts its arrows the same way.
    expect(HIT_DESC['scatter-shot']!(3)).toBe(SKILLS['scatter-shot'].desc);
    expect(one('scatter-shot', 'multistrike')).toBe('四支箭，射向隨機的敵人。');
    expect(one('scatter-shot', 'heavy')).toBe('一支箭，射向隨機的敵人。');
    expect(one('twin-slash', 'multistrike')).toBe('連砍 3 次');
    // Every damage skill that counts its hits in Chinese numerals has its whole phrase.
    const counted = Object.values(SKILLS).filter((d) => d.effects.some((e) => e.kind === 'damage') && /[二三四五六七八九十][下段次支晃]/.test(d.desc));
    expect(counted.map((d) => d.id).sort()).toEqual(Object.keys(HIT_DESC).sort());
  });

  it('no rune, no rewrite', () => {
    for (const d of Object.values(SKILLS)) {
      expect(applyRunes(d, [], []).desc, d.id).toBe(d.desc);
      // A rune that does not work changes no word either.
      const idle = (['spread', 'focus', 'share', 'flame', 'multistrike'] as const).find((r) => runeFits(d, r, [], d) !== null);
      if (idle) expect(applyRunes(d, [], [m(idle)]).desc, `${d.id}+${idle}`).toBe(d.desc);
    }
  });

  it('notes say what the rune does here', () => {
    const venomChance = Math.round((SKILLS['rin-venom-needle'].effects.find((e) => e.kind === 'inflict') as { chance: number }).chance * 100);
    expect(runeNotes(SKILLS['rin-venom-needle'], 'venom')).toEqual([T.rune.notes.merged(venomChance, T.ailment.poison)]);
    expect(runeNotes(SKILLS['rin-venom-needle'], 'venom')[0]).toBe(`這招本來就有 ${venomChance}% 中毒，取較高的一個`);
    expect(runeNotes(SKILLS['ice-star'], 'aftermath')).toEqual(['這招是冰屬性：暴擊時必定凍結']);
    expect(runeNotes(SKILLS.pierce, 'aftermath')).toEqual(['這招是物理屬性：暴擊時必定流血']);
    expect(runeNotes(SKILLS['fire-star'], 'aftermath')).toEqual(['這招是火屬性：暴擊時必定灼燒']);
    expect(runeNotes(SKILLS['fire-star'], 'aftermath', ['rime'])).toEqual(['這招是冰屬性：暴擊時必定凍結']);
    expect(runeNotes(SKILLS.ward, 'lasting')).toEqual([T.rune.lastingBarrier]);
    expect(runeNotes(SKILLS.ward, 'extend')).toEqual([]);
    expect(runeNotes(SKILLS['war-dance'], 'lasting')).toEqual([]);
    expect(runeNotes(SKILLS['fire-star'], 'venom')).toEqual([]);
  });
});

describe('the words follow the runes: review fixes (plan 8g Task 2 review)', () => {
  const m = (id: RuneId): RuneRef => ({ id, tier: tiersOf(id).includes('magic') ? 'magic' : 'legendary' });
  /** `skill` with tree node `node` at its top rank (and the skill's own top rank) and these runes. */
  const at = (skill: string, node: string | null, runes: RuneId[] = []) => {
    const own = NODES[skill]?.node.kind === 'active' ? { [skill]: NODES[skill].node.maxRank } : {};
    const ranks = node ? { ...own, [node]: NODES[node].node.maxRank } : own;
    return skillFor({ powers: [], ranks, ...(runes.length ? { runes: { [skill]: runes.map(m) } } : {}) }, skill)!;
  };
  const rank1 = (skill: string, node: string, runes: RuneId[] = []) => {
    const own = NODES[skill]?.node.kind === 'active' ? { [skill]: NODES[skill].node.maxRank } : {};
    return skillFor({ powers: [], ranks: { ...own, [node]: 1 }, ...(runes.length ? { runes: { [skill]: runes.map(m) } } : {}) }, skill)!;
  };

  it('a one-hit skill names no hit count: 連擊 leaves its other counts alone', () => {
    const hop = rank1('rin-mark', 'rin-mark-hop');
    expect(hop.desc).toContain('（每場最多 1 次）');
    expect(rank1('rin-mark', 'rin-mark-hop', ['multistrike']).desc).toBe(hop.desc);
    const chase = rank1('rin-execute', 'rin-execute-chase');
    expect(chase.desc).toContain('多 1 次');
    expect(rank1('rin-execute', 'rin-execute-chase', ['multistrike']).desc).toBe(chase.desc);
  });

  it('重擊 folds a per-hit note into one hit at the whole power', () => {
    let folded = 0;
    for (const [nid, info] of Object.entries(NODES)) {
      const skill = info.node.skill;
      if (!skill || info.node.kind !== 'variant') continue;
      const before = at(skill, nid);
      const hit = before.desc.match(/改為 ([0-9]+) 段，每段威力 ×([0-9.]+)/);
      if (!hit || runeFits(before, 'heavy', [], before) !== null) continue;
      const after = at(skill, nid, ['heavy']);
      // The whole power, 重擊's own percent in it, rounded as the engine rounds a power.
      const heavy = RUNES.heavy.mod('magic').power!;
      const n = Number(hit[1]), p = Math.round(Number(hit[2]) * 100);
      expect(after.desc, nid).toContain(T.rune.foldedHits(1, pctOf(n * p, heavy)));
      // Pinned against the engine: per hit P% became one hit of n x P x 重擊.
      const per = (before.effects.find((e) => e.kind === 'damage') as { power: number }).power;
      const one = (after.effects.find((e) => e.kind === 'damage') as { power: number }).power;
      expect(one, nid).toBe(pctOf(per * n, heavy));
      expect(after.desc, nid).not.toContain('每段威力');
      folded++;
    }
    expect(folded).toBeGreaterThanOrEqual(7);
    expect(at('hero-slash', 'hero-slash-twin', ['heavy']).desc).toBe(`單體近戰斬擊。${T.rune.foldedHits(1, pctOf(2 * 58, RUNES.heavy.mod('magic').power!))}。`);
    expect(pctOf(2 * 58, RUNES.heavy.mod('magic').power!)).toBe(133);
    // The notes say the same words they always did.
    expect(at('hero-slash', 'hero-slash-twin').desc).toBe(`單體近戰斬擊。${T.rune.perHitNote(2, T.mult(58))}。`);
  });

  it('散射 with 多矢 counts its arrows with 連擊 and 重擊', () => {
    expect(at('scatter-shot', 'sylvie-scatter-more').desc).toContain('改為 6 支箭');
    expect(at('scatter-shot', 'sylvie-scatter-more', ['multistrike']).desc).toContain('改為 7 支箭');
    expect(at('scatter-shot', 'sylvie-scatter-more', ['heavy']).desc).toContain('改為 1 支箭');
  });

  it("延長 changes every place the effect's rounds are named", () => {
    for (const [skill, node] of [['hex', 'noel-hex-wide'], ['ward', 'chizuru-ward-long'], ['sunder-arrow', 'sylvie-sunder-deep']] as const) {
      const before = at(skill, node);
      const after = at(skill, node, ['extend']);
      const was = (before.effects.find((e) => 'turns' in e) as { turns: number }).turns;
      const now = (after.effects.find((e) => 'turns' in e) as { turns: number }).turns;
      expect(now, skill).toBeGreaterThan(was);
      expect(before.desc.split(`${was} 回合`).length, skill).toBe(3);
      expect(after.desc, skill).toBe(before.desc.split(`${was} 回合`).join(`${now} 回合`));
    }
    // A number of rounds that names something else stays (砲台's 「多撐 2 回合」 is the pair's own).
    const turret = at('turret', 'bobby-turret-pair');
    expect(at('turret', 'bobby-turret-pair', ['extend']).desc).toContain('多撐 2 回合');
    expect(turret.desc).toContain('多撐 2 回合');
  });

  it("a shape rune that undoes a node's target change drops the node's sentence for it", () => {
    expect(at('moonlight', 'selene-moon-wide').desc).toBe(`回復一名隊友 HP。改為對我方全體，威力 ${T.mult(65)}。`);
    expect(at('moonlight', 'selene-moon-wide', ['focus']).desc).toBe(`回復一名隊友 HP。威力 ${T.mult(65)}。`);
    expect(at('flame-wave', 'noel-wave-focus', ['spread']).desc).toBe(`火屬性全體魔法攻擊。威力 ${T.mult(190)}。`);
    // A rune that takes the target elsewhere keeps it, its words rewritten.
    expect(at('flame-wave', 'noel-wave-focus', ['rime']).desc).toBe(`冰屬性全體魔法攻擊。改為打單體，威力 ${T.mult(190)}。`);
  });

  it('a sure ailment says so', () => {
    const sure: SkillDef = { ...SKILLS['rin-venom-needle'], effects: SKILLS['rin-venom-needle'].effects.map((e) => (e.kind === 'inflict' ? { ...e, chance: 1 } : e)) };
    expect(runeNotes(sure, 'venom')).toEqual(['這招本來就必定中毒']);
  });
});
