import { describe, expect, it } from 'vitest';
import type { AilmentChip } from '../engine/ailments';
import { T } from '../data/text.zh-TW';
import { AILMENT_SEVERITY, bySeverity, fitChips, textWidth } from './ailmentStyle';

const FIVE: AilmentChip[] = [{ id: 'poison' }, { id: 'burn', turns: 3 }, { id: 'bleed', stacks: 2, turns: 3 }, { id: 'shock', turns: 2 }, { id: 'chill', turns: 2 }];
const w = (t: string) => textWidth(t, 10);
const lineWidth = (r: { shown: AilmentChip[]; more: number }, gap: number) => {
  const texts = [...r.shown.map((c) => T.ailmentChip(c)), ...(r.more ? [T.ailmentMore(r.more)] : [])];
  return texts.reduce((s, t) => s + w(t), 0) + gap * Math.max(0, texts.length - 1);
};

describe('ailment rows: one line, most severe first, the rest folded into +N', () => {
  it('the order is by severity: a lost turn, then damage each round, then what only shifts numbers', () => {
    expect(AILMENT_SEVERITY).toEqual(['freeze', 'sleep', 'bleed', 'burn', 'poison', 'shock', 'chill']);
    expect(bySeverity(FIVE).map((c) => c.id)).toEqual(['bleed', 'burn', 'poison', 'shock', 'chill']);
    expect(FIVE.map((c) => c.id)).toEqual(['poison', 'burn', 'bleed', 'shock', 'chill']);   // the input is not touched
  });

  it('everything that fits is shown, with no +N', () => {
    expect(fitChips(FIVE, 1000, w, 2)).toEqual({ shown: bySeverity(FIVE), more: 0 });
    expect(fitChips([], 10, w, 2)).toEqual({ shown: [], more: 0 });
  });

  it('a row too narrow keeps as many of the most severe as fit beside the +N', () => {
    for (const max of [30, 50, 70, 90, 110, 130]) {
      const r = fitChips(FIVE, max, w, 2);
      expect(r.shown.length + r.more, `${max}`).toBe(5);
      expect(r.shown, `${max}`).toEqual(bySeverity(FIVE).slice(0, r.shown.length));
      expect(lineWidth(r, 2), `${max}`).toBeLessThanOrEqual(max);
      // One more shown would not fit.
      if (r.more > 0) expect(lineWidth({ shown: bySeverity(FIVE).slice(0, r.shown.length + 1), more: r.more - 1 }, 2), `${max}`).toBeGreaterThan(max);
    }
    expect(fitChips(FIVE, 5, w, 2)).toEqual({ shown: [], more: 5 });   // only the count, however narrow
  });

  it('text width: Cubic 11 advances a CJK character 13/12 em, anything else 8/12 em (legibility Task 4)', () => {
    expect(textWidth('流血×2', 12)).toBe(42);
    expect(textWidth('+3', 12)).toBe(16);
    expect(textWidth('暴擊！', 24)).toBe(78);
  });
});
