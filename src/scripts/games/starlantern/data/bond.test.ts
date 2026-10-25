import { describe, it, expect } from 'vitest';
import { COMPANIONS, GIFT_TASTE, type Companion } from './story/bond';
import { GIFT_LINES, RIN_OATH_GIFT_LINES, type GiftPools } from './bond.zh-TW';

/**
 * Bond plan Task 6 (spec §0 D14, §6.4): a companion's gift reactions are registered whole or not at all. What a written
 * table misses; empty when whole: loved and liked two lines or more, neutral one or more, a line for each material she
 * declines and for each one her healing turns, and no other keys.
 */
const problems = (c: Companion, p: GiftPools): string[] => {
  const t = GIFT_TASTE[c];
  const out: string[] = [];
  if (p.loved.length < 2) out.push(`${c}: loved ${p.loved.length} < 2`);
  if (p.liked.length < 2) out.push(`${c}: liked ${p.liked.length} < 2`);
  if (p.neutral.length < 1) out.push(`${c}: no neutral line`);
  const same = (got: string[], want: string[]) => [...got].sort().join() === [...want].sort().join();
  if (!same(Object.keys(p.declined), t.declined)) out.push(`${c}: declined lines ${Object.keys(p.declined)} not ${t.declined}`);
  if (!same(Object.keys(p.healed), Object.keys(t.healed))) out.push(`${c}: healed lines ${Object.keys(p.healed)} not ${Object.keys(t.healed)}`);
  for (const line of [...p.loved, ...p.liked, ...p.neutral, ...Object.values(p.declined), ...Object.values(p.healed)]) if (!line) out.push(`${c}: an empty line`);
  return out;
};
/** Every written table's problems; Rin needs both of hers (bond plan ruling 6). */
const allProblems = (lines: Partial<Record<Companion, GiftPools>>, rinOath: GiftPools | null): string[] => [
  ...COMPANIONS.flatMap((c) => (lines[c] ? problems(c, lines[c]!) : [])),
  ...(lines.rin && !rinOath ? ['rin: written before her choice only'] : []),
  ...(!lines.rin && rinOath ? ['rin: written after her choice only'] : []),
  ...(rinOath ? problems('rin', rinOath) : []),
];
const whole = (c: Companion): GiftPools => ({
  loved: ['一', '二'], liked: ['三', '四'], neutral: ['五'],
  declined: Object.fromEntries(GIFT_TASTE[c].declined.map((m) => [m, '六'])),
  healed: Object.fromEntries(Object.keys(GIFT_TASTE[c].healed).map((m) => [m, '七'])),
});

describe('bond text: gift reactions', () => {
  it('gift pools are whole once written', () => {
    expect(allProblems(GIFT_LINES, RIN_OATH_GIFT_LINES)).toEqual([]);
    // The check bites: whole tables pass, and each kind of hole is caught.
    expect(allProblems({ selene: whole('selene'), rin: whole('rin') }, whole('rin'))).toEqual([]);
    expect(allProblems({ selene: { ...whole('selene'), loved: ['一'] } }, null)).toEqual(['selene: loved 1 < 2']);
    expect(allProblems({ noel: { ...whole('noel'), neutral: [] } }, null)).toEqual(['noel: no neutral line']);
    expect(allProblems({ liz: { ...whole('liz'), declined: {} } }, null)).toHaveLength(1);
    expect(allProblems({ sylvie: { ...whole('sylvie'), healed: {} } }, null)).toHaveLength(1);
    expect(allProblems({ chizuru: { ...whole('chizuru'), healed: { 'ice-crystal': '八' } } }, null)).toHaveLength(1);   // she never heals
    expect(allProblems({ rin: whole('rin') }, null)).toEqual(['rin: written before her choice only']);
    expect(allProblems({}, whole('rin'))).toEqual(['rin: written after her choice only']);
  });
});
