import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { compile } from 'sass';
import { describe, expect, it } from 'vitest';
import { RARITIES } from '../data/gear';
import { T } from '../data/text.zh-TW';
import { gearLabel, rarityClass } from './loot';
import { AILMENT_FILL } from '../render/ailmentStyle';
import type { AilmentShown } from '../engine/ailments';

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

const scssVar = (name: string) => scss.match(new RegExp(`\\$${name}: (#[0-9a-f]{6});`))?.[1] ?? '';
const scssRgb = (name: string) => (scss.match(new RegExp(`\\$${name}: rgb\\((\\d+), (\\d+), (\\d+)\\);`)) ?? []).slice(1, 4).map(Number);
const hexOf = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/** `fg` at opacity `a` over `bg`, rounded as a browser paints it. */
const over = (fg: number[], a: number, bg: number[]) => fg.map((v, i) => Math.round(v * a + bg[i] * (1 - a)));
const linear = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]: number[]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** CIE76 ΔE between two sRGB colours (D65). */
const deltaE = (a: number[], b: number[]) => {
  const lab = (c: number[]) => {
    const [r, g, bl] = c.map(linear);
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const x = f((0.4124 * r + 0.3576 * g + 0.1805 * bl) / 0.95047), y = f(0.2126 * r + 0.7152 * g + 0.0722 * bl), z = f((0.0193 * r + 0.1192 * g + 0.9505 * bl) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  };
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(...p.map((v, i) => v - q[i]));
};

describe('rarity colours and words', () => {
  it('unique is crimson like its frame art (G1, user 2026-10-20): a lighter tint, readable on every panel, apart from the cannot-afford red', () => {
    const unique = colourOf('unique'), rare = colourOf('rare'), legendary = colourOf('legendary');
    const FRAME = [0xd8, 0x28, 0x3a];                                   // ui-rarity-unique's band colour
    expect(hue(unique)).toBeGreaterThanOrEqual(350);
    expect(hue(unique)).toBeLessThanOrEqual(358);
    expect(luminance(unique)).toBeGreaterThan(luminance(FRAME));       // lighter than the frame, for small text
    // WCAG contrast at least 4.5:1 on each background rarity text sits on: the window, a rarity-tinted bag cell (3%
    // white then 10% of its own colour over the window), and a selected list row at its brightest (20% gold).
    const win = scssRgb('slx-win'), gold = hexOf(scssVar('slx-gold'));
    const cell = over(unique, 0.1, over([255, 255, 255], 0.03, win));
    for (const [name, bg] of [['window', win], ['bag cell', cell], ['selected row', over(gold, 0.2, win)]] as const) {
      expect(contrast(unique, bg), name).toBeGreaterThanOrEqual(4.5);
    }
    // Clearly not the red of a cost the party cannot pay (.slx-lack, $slx-down), nor legendary orange or rare yellow.
    expect(deltaE(unique, hexOf(scssVar('slx-down')))).toBeGreaterThanOrEqual(15);
    expect(deltaE(unique, legendary)).toBeGreaterThanOrEqual(40);
    expect(deltaE(unique, rare)).toBeGreaterThanOrEqual(60);
  });

  it('colours come from one $slx-rarity map with the plan values, emitted by @each', () => {
    expect(['common', 'magic', 'rare', 'epic', 'legendary', 'unique', 'set'].map((r) => colourOf(r).map((v) => v.toString(16).padStart(2, '0')).join('')))
      .toEqual(['e8e8e8', '6f9cff', 'ffd84a', 'b36bff', 'ff9a3c', 'ff6b81', '5fd068']);
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

describe('ailment colours and words (plan 8b)', () => {
  /** The `$slx-ailment` map is the one source of ailment colours in the stylesheet; the Pixi labels use AILMENT_FILL. */
  const ailmentMap = scss.match(/\$slx-ailment: \(([^)]*)\);/)?.[1] ?? '';
  const entries = [...ailmentMap.matchAll(/([a-z]+): #([0-9a-f]{6})/g)].map((m) => [m[1], m[2]] as const);
  const rgb = (h: string) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));

  it('the stylesheet and the Pixi labels share seven colours, all apart and readable on the window', () => {
    expect(entries.map(([k]) => k).sort()).toEqual(Object.keys(AILMENT_FILL).sort());
    expect(entries).toHaveLength(7);
    for (const [k, h] of entries) expect(parseInt(h, 16), k).toBe(AILMENT_FILL[k as AilmentShown]);
    const win = scssRgb('slx-win');
    expect(win).toEqual([10, 14, 34]);
    for (const [k, h] of entries) expect(contrast(rgb(h), win), k).toBeGreaterThanOrEqual(4.5);
    for (const [a, ha] of entries) for (const [b, hb] of entries) {
      if (a < b) expect(Math.hypot(...rgb(ha).map((v, i) => v - rgb(hb)[i])), `${a} ${b}`).toBeGreaterThan(40);
    }
  });

  it('each ailment is a short word with its turns; bleed counts its stacks; poison and freeze have no number', () => {
    expect(T.ailment).toEqual({ poison: '中毒', sleep: '睡眠', burn: '灼燒', freeze: '凍結', chill: '冰緩', shock: '感電', bleed: '流血' });
    expect(T.ailmentChip({ id: 'burn', turns: 3 })).toBe('灼燒3');
    expect(T.ailmentChip({ id: 'sleep', turns: 2 })).toBe('睡眠2');
    expect(T.ailmentChip({ id: 'bleed', stacks: 2, turns: 3 })).toBe('流血×2');
    expect(T.ailmentChip({ id: 'poison' })).toBe('中毒');
    expect(T.ailmentChip({ id: 'freeze' })).toBe('凍結');
  });

  it('the region trait burn reads 酷熱, apart from the ailment 灼燒', () => {
    expect(T.ui2.gate.traits.burn).toBe('酷熱');
    expect(T.ui2.gate.traits.burn).not.toBe(T.ailment.burn);
    expect(Object.values(T.ui2.gate.traits)).not.toContain(T.ailment.burn);
  });
});

describe('mechanic colours (plan 8c)', () => {
  const map = scss.match(/\$slx-mech: \(([^)]*)\);/)?.[1] ?? '';
  const entries = [...map.matchAll(/([a-z]+): #([0-9a-f]{6})/g)].map((m) => [m[1], m[2]] as const);
  const rgb = (h: string) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));

  it('$slx-mech matches MECH_FILL, reads on the window, and no two tones look alike', async () => {
    const { MECH_FILL } = await import('../render/mechStyle');
    expect(entries.map(([k]) => k).sort()).toEqual(Object.keys(MECH_FILL).sort());
    expect(entries.length).toBeGreaterThanOrEqual(4);
    for (const [k, h] of entries) expect(parseInt(h, 16), k).toBe(MECH_FILL[k as keyof typeof MECH_FILL]);
    const win = scssRgb('slx-win');
    for (const [k, h] of entries) expect(contrast(rgb(h), win), k).toBeGreaterThanOrEqual(4.5);
    for (const [a, ha] of entries) for (const [b, hb] of entries) {
      if (a < b) expect(Math.hypot(...rgb(ha).map((v, i) => v - rgb(hb)[i])), `${a} ${b}`).toBeGreaterThan(40);
    }
    // Every tone has its class in the stylesheet, the words and the cue alike.
    const css = compile(resolve(process.cwd(), 'src/styles/_starlantern-ui.scss')).css;
    for (const [k] of entries) expect(css, k).toContain(`.slx-mech-${k}`);
    expect(css).toContain('.slx-pm-cue');
  });
});
