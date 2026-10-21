import { describe, expect, it } from 'vitest';
import { SKILLS } from '../data/skills';
import { skillFor } from './battle';
import { applyRunes, runeFits, runeStates, runeWhy, skillTags } from './runes';
import { RUNES, tiersOf, type RuneId, type RuneRef } from '../data/runes';
import { CHARACTER_IDS } from '../data/characters';
import { defaultTree } from './progression';
import { pctOf } from './skills';
import type { Effect, SkillDef } from './types';

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
