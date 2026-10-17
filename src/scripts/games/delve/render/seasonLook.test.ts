// seasonLook.test.ts — 季節外觀（純邏輯）：每棵樹 / 每格草的季節樣貌、逐日過渡、背景色調
import { describe, it, expect } from 'vitest';
import { treeLook, grassLook, leafColors, bgSeasonDay, TREE_LOOKS, type TreeLook } from './seasonLook';
import { DAYS_PER_SEASON, SEASON, SEASON_TRANSITION_DAYS } from '../engine/calendar';
import { TREE_KIND } from './scene';
import { inPalette, hex } from './pixel';

const mid = (s: number): number => s * DAYS_PER_SEASON + SEASON_TRANSITION_DAYS + 1;
const looks = (kind: number, day: number): Set<TreeLook> => {
  const out = new Set<TreeLook>();
  for (let x = 0; x < 400; x++) out.add(treeLook(kind, x, day));
  return out;
};

describe('treeLook', () => {
  it('春天：部分樹開花（粉）、其他新綠；夏天：濃綠', () => {
    const sp = looks(1, mid(SEASON.SPRING));
    expect(sp.has('blossom')).toBe(true);
    expect(sp.has('spring')).toBe(true);
    expect([...looks(0, mid(SEASON.SUMMER))]).toEqual(['summer']);
  });
  it('秋天：每棵樹各自是橙 / 紅 / 黃；常綠種（2）仍是綠', () => {
    const au = looks(0, mid(SEASON.AUTUMN));
    expect(au.has('autumn-orange') && au.has('autumn-red') && au.has('autumn-yellow')).toBe(true);
    expect(looks(2, mid(SEASON.AUTUMN)).has('autumn-red')).toBe(false);
  });
  it('冬天：落葉樹光禿（積雪）、常綠樹樹冠積雪', () => {
    expect([...looks(0, mid(SEASON.WINTER))]).toEqual(['winter-bare']);
    expect([...looks(2, mid(SEASON.WINTER))]).toEqual(['winter-snow']);
  });
  it('雪原松樹 / 叢林大樹不隨季節變', () => {
    for (const s of [0, 1, 2, 3]) {
      expect([...looks(TREE_KIND.PINE, mid(s))]).toEqual(['evergreen']);
      expect([...looks(TREE_KIND.JUNGLE, mid(s))]).toEqual(['evergreen']);
    }
  });
  it('換季逐日過渡：秋 1 日有的樹已變色、有的還沒', () => {
    const d = SEASON.AUTUMN * DAYS_PER_SEASON;
    const l = looks(0, d);
    expect(l.has('summer')).toBe(true);
    expect([...l].some((k) => k.startsWith('autumn'))).toBe(true);
    expect(TREE_LOOKS).toContain('summer');
  });
});

describe('grassLook / 葉色 / 背景色調', () => {
  it('草的季節外觀逐日過渡，最後全部換季', () => {
    const d = SEASON.WINTER * DAYS_PER_SEASON;
    const a = new Set<number>(), b = new Set<number>();
    for (let x = 0; x < 300; x++) { a.add(grassLook(x, d)); b.add(grassLook(x, d + SEASON_TRANSITION_DAYS)); }
    expect(a.has(SEASON.AUTUMN) && a.has(SEASON.WINTER)).toBe(true);
    expect([...b]).toEqual([SEASON.WINTER]);
  });
  it('所有季節葉色 / 背景色都在統一色票上', () => {
    for (const l of TREE_LOOKS) for (const c of leafColors(l)) expect(inPalette(hex(c))).toBe(true);
    for (const s of [0, 1, 2, 3] as const) for (const c of bgSeasonDay(s)) expect(inPalette(hex(c))).toBe(true);
  });
});
