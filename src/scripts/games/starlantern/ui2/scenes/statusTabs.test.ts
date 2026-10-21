import { describe, expect, it } from 'vitest';
import { T } from '../../data/text.zh-TW';
import { nextRankText } from './statusTabs';
import { skillFor } from '../../engine/battle';

describe("the tree's next-rank line (plan 8c)", () => {
  it('states what the next rank really changes: power, a percent, TP or rounds', () => {
    const t = T.ui2.tree;
    expect(nextRankText('fire-star', 1)).toBe(t.next('power', 100, 110));
    expect(nextRankText('fire-star', 2)).toBe(t.next('power', 110, 120));
    expect(nextRankText('hero-shackle', 1)).toBe(t.next('buff', 100, 110));   // a pure debuff: its percent
    expect(nextRankText('hex', 1)).toBe('下一級：TP −1');
    expect(nextRankText('rin-mark', 2)).toBe('下一級：TP −1');
    expect(nextRankText('rin-veil', 1)).toBe('下一級：持續 +1 回合');
    expect(nextRankText('rin-veil', 2)).toBe('下一級：持續 +1 回合');
    for (const id of ['hex', 'rin-mark', 'rin-veil']) expect(nextRankText(id, 1), id).not.toContain('%');
  });

  it("收回's ranks say how many round ends the recalled phase really stays (plan 8c final)", () => {
    // Rank 1 steps the moon back and the round's end moves it on; rank r holds it r - 1 round ends more.
    expect(nextRankText('moon-recall', 1)).toBe('下一級：倒回的月相再停 1 回合');
    expect(nextRankText('moon-recall', 2)).toBe('下一級：倒回的月相再停 2 回合');
    const at = (rank: number) => skillFor({ powers: [], ranks: { 'moon-recall': rank } }, 'moon-recall')!;
    expect((at(3).effects[0] as { hold?: number }).hold).toBe(2);
    expect(at(1).desc).not.toContain('再停');
    expect(at(2).desc).toContain('倒回的月相再停 1 回合');
    expect(at(3).desc).toContain('倒回的月相再停 2 回合');
  });
});
