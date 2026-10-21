import { describe, expect, it } from 'vitest';
import { SKILLS } from '../data/skills';
import { skillFor } from './battle';
import { runeFits, runeStates, runeWhy, skillTags } from './runes';

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
