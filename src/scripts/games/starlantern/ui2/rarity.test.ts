import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { compile } from 'sass';
import { describe, expect, it } from 'vitest';
import { RARITIES } from '../data/gear';
import { T } from '../data/text.zh-TW';
import { gearLabel, rarityClass } from './loot';

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
    expect(['common', 'magic', 'rare', 'epic', 'legendary', 'unique', 'set'].map((r) => colourOf(r).map((v) => v.toString(16).padStart(2, '0')).join('')))
      .toEqual(['e8e8e8', '6f9cff', 'ffd84a', 'b36bff', 'ff9a3c', 'd4af37', '5fd068']);
    expect(scss).toMatch(/@each \$k, \$c in \$slx-rarity \{\s*\.slx-rarity-#\{\$k\} \{ color: \$c; \}/);
    expect(scss).not.toMatch(/\.slx-rarity-[a-z]+ \{ color: #/);           // no second, hand-written copy
  });

  it('epic is a purple clearly apart from magic blue', () => {
    const dist = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]));
    const epic = colourOf('epic');
    expect(hue(epic)).toBeGreaterThanOrEqual(260);
    expect(hue(epic)).toBeLessThanOrEqual(290);
    expect(dist(epic, colourOf('magic'))).toBeGreaterThan(60);
    expect(dist(epic, colourOf('rare'))).toBeGreaterThan(60);
    expect(dist(epic, colourOf('legendary'))).toBeGreaterThan(60);
  });

  it('every rarity has a word and a colour', () => {
    for (const r of RARITIES) {
      expect(T.rarity[r], r).toBeTruthy();
      expect(() => colourOf(r), r).not.toThrow();
    }
  });

  it('names every rarity but common after the gear name', () => {
    expect(T.rarity).toEqual({ common: '普通', magic: '魔法', rare: '稀有', epic: '史詩', legendary: '傳說', unique: '獨特', set: '套裝' });
    const it0 = { uid: 1, base: 'leather-vest', rarity: 'magic' as const, ilvl: 1, affixes: [], enhance: 0 };
    expect(gearLabel(it0)).toBe('皮背心・魔法');
    expect(gearLabel({ ...it0, rarity: 'common' })).toBe('皮背心');
  });

  it('a starlit piece reads 星輝 before its rarity word', () => {
    const spear = { uid: 1, base: 'thorn-spear', rarity: 'legendary' as const, ilvl: 10, affixes: [], enhance: 0, special: 'lg-chizuru', starlit: true as const };
    expect(gearLabel(spear)).toBe('雙月槍・星輝傳說');
    expect(gearLabel({ ...spear, enhance: 2 })).toBe('雙月槍 +2・星輝傳說');
    expect(gearLabel({ ...spear, starlit: undefined })).toBe('雙月槍・傳說');
    expect(gearLabel({ uid: 2, base: 'iron-sword', rarity: 'epic', ilvl: 10, affixes: [], enhance: 0 })).toBe('鐵劍・史詩');
  });

  it('rarityClass adds slx-starlit only to starlit gear', () => {
    expect(rarityClass({ rarity: 'epic' })).toBe('slx-rarity-epic');
    expect(rarityClass({ rarity: 'legendary' })).toBe('slx-rarity-legendary');
    expect(rarityClass({ rarity: 'set', starlit: true })).toBe('slx-rarity-set slx-starlit');
    for (const r of RARITIES) expect(rarityClass({ rarity: r }), r).toBe(`slx-rarity-${r}`);
  });

  it('starlit glows cyan-white, after the legend glow, as text only', () => {
    const m = scss.match(/\$slx-starlit: #([0-9a-f]{6});/);
    expect(m).not.toBeNull();
    const rgb = [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16));
    expect(m![1]).toBe('bff6ff');
    expect(hue(rgb)).toBeGreaterThanOrEqual(180);
    expect(hue(rgb)).toBeLessThanOrEqual(200);
    const legend = scss.indexOf('.slx-loot-gear.slx-rarity-set');
    const starlit = scss.indexOf('.slx-loot-gear.slx-starlit');
    expect(legend).toBeGreaterThan(0);
    expect(starlit).toBeGreaterThan(legend);
    // Every rule whose selector names slx-starlit is text styling: no border, box-shadow or pseudo-element drawing.
    const rules = [...scss.matchAll(/([^{}]*slx-starlit[^{}]*)\{([^{}]*)\}/g)];
    expect(rules.length).toBeGreaterThan(0);
    for (const [, sel, body] of rules) {
      expect(sel).not.toMatch(/::?(before|after)/);
      expect(body).not.toMatch(/border|box-shadow|background|content/);
    }
    expect(scss).toMatch(/\.slx-line-starlit \{ color: \$slx-starlit; \}/);
  });

  it('a detail name takes its rarity colour; only a name with no rarity stays gold', () => {
    // The compiled stylesheet in the DOM, so the real cascade (order and specificity) decides the colour.
    const style = document.createElement('style');
    style.textContent = compile('src/styles/_starlantern-ui.scss').css;
    document.head.append(style);
    const name = (cls: string) => {
      const d = document.createElement('div');
      d.className = cls;
      document.body.append(d);
      const c = getComputedStyle(d).color;
      d.remove();
      return c;
    };
    try {
      const hex = (r: string) => `#${colourOf(r).map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      for (const r of RARITIES) expect(name(`slx-item-name slx-rarity-${r}`), r).toBe(hex(r));
      expect(name('slx-name-line slx-rarity-epic')).toBe(hex('epic'));    // the forge detail's name line too
      expect(name('slx-item-name slx-rarity-legendary slx-starlit')).toBe(hex('legendary'));
      expect(name('slx-item-name')).toBe('#e8c46a');                     // the empty cell's name: $slx-gold
    } finally {
      style.remove();
    }
  });

  it('only ui2/loot.ts builds a rarity class from a piece of gear', () => {
    const dir = resolve(process.cwd(), 'src/scripts/games/starlantern/ui2');
    const files = (readdirSync(dir, { recursive: true }) as string[])
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map((f) => f.split(sep).join('/'));
    expect(files).toContain('loot.ts');
    expect(files).toContain('scenes/equip.ts');
    const builders = files.filter((f) => /slx-rarity-\$\{[\w.]+\.rarity\}/.test(readFileSync(join(dir, f), 'utf-8')));
    expect(builders).toEqual(['loot.ts']);
  });

  it('an enhanced item reads 名稱 +n before its rarity word; +0 reads as before', () => {
    const it0 = { uid: 1, base: 'leather-vest', rarity: 'magic' as const, ilvl: 1, affixes: [], enhance: 0 };
    expect(gearLabel({ ...it0, enhance: 1, rarity: 'common' })).toBe('皮背心 +1');
    expect(gearLabel({ ...it0, enhance: 3 })).toBe('皮背心 +3・魔法');
    expect(gearLabel(it0)).toBe('皮背心・魔法');                     // +0 shows no "+0"
    expect(T.enhanced('鐵劍', 0)).toBe('鐵劍');
    expect(T.enhanced('鐵劍', 3)).toBe('鐵劍 +3');
  });
});
