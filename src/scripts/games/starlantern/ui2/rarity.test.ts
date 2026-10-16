import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { T } from '../data/text.zh-TW';
import { gearLabel } from './loot';

const scss = readFileSync(resolve(process.cwd(), 'src/styles/_starlantern-ui.scss'), 'utf-8');
/** The `$slx-rarity` map is the one source of rarity colours; `@each` turns it into `.slx-rarity-*`. */
const rarityMap = scss.match(/\$slx-rarity: \(([^)]*)\);/)?.[1] ?? '';
const colourOf = (r: string) => {
  const m = rarityMap.match(new RegExp(`\\b${r}: #([0-9a-f]{6})\\b`));
  if (!m) throw new Error(`no colour for ${r}`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
};
const hue = ([r, g, b]: number[]) => {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  if (!d) return 0;
  const h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return (h * 60 + 360) % 360;
};

describe('rarity colours and words', () => {
  it('unique is a deep warm gold (spec §4 獨特（金）), clearly apart from rare yellow and legendary orange', () => {
    const unique = colourOf('unique'), rare = colourOf('rare'), legendary = colourOf('legendary');
    expect(hue(unique)).toBeGreaterThanOrEqual(36);
    expect(hue(unique)).toBeLessThanOrEqual(46);         // gold, not purple
    const dist = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]));
    expect(dist(unique, rare)).toBeGreaterThan(60);        // deeper than rare's yellow
    expect(dist(unique, legendary)).toBeGreaterThan(40);
    const luma = ([r, g, b]: number[]) => 0.299 * r + 0.587 * g + 0.114 * b;
    expect(luma(unique)).toBeLessThan(luma(rare) - 30);
  });

  it('colours come from one $slx-rarity map with the plan values, emitted by @each', () => {
    expect(['common', 'magic', 'rare', 'legendary', 'unique', 'set'].map((r) => colourOf(r).map((v) => v.toString(16).padStart(2, '0')).join('')))
      .toEqual(['e8e8e8', '6f9cff', 'ffd84a', 'ff9a3c', 'd4af37', '5fd068']);
    expect(scss).toMatch(/@each \$k, \$c in \$slx-rarity \{\s*\.slx-rarity-#\{\$k\} \{ color: \$c; \}/);
    expect(scss).not.toMatch(/\.slx-rarity-[a-z]+ \{ color: #/);           // no second, hand-written copy
  });

  it('names every rarity but common after the gear name', () => {
    expect(T.rarity).toEqual({ common: '普通', magic: '魔法', rare: '稀有', legendary: '傳說', unique: '獨特', set: '套裝' });
    const it0 = { uid: 1, base: 'leather-vest', rarity: 'magic' as const, ilvl: 1, affixes: [], enhance: 0 };
    expect(gearLabel(it0)).toBe('皮背心・魔法');
    expect(gearLabel({ ...it0, rarity: 'common' })).toBe('皮背心');
  });
});
