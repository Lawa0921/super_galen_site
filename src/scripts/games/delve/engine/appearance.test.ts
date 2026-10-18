// appearance.test.ts — 角色外觀（純資料）：選項數量、正規化（壞值退回預設）、隨機、循環切換、localStorage 預設外觀
import { describe, it, expect } from 'vitest';
import {
  APPEARANCE_FIELDS, DEFAULT_APPEARANCE, HAIR_STYLES, HAIR_COLORS, EYE_COLORS, EYE_SHAPES, SKIN_TONES, OUTFITS,
  CLOTH_COLORS, ACCESSORIES, appearanceKey, normalizeAppearance, randomAppearance, stepAppearance,
  loadDefaultAppearance, saveDefaultAppearance, APPEARANCE_KEY, sameAppearance, type Appearance,
} from './appearance';

function memStore(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k); },
    setItem: (k, v) => { m.set(k, String(v)); },
  };
}
/** 可重現的亂數 */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}

describe('外觀選項', () => {
  it('數量符合需求：髮型 ≥ 8、髮色 ≥ 10、瞳色 ≥ 6、膚色 ≥ 5、服裝 ≥ 6、飾品含緞帶 / 貓耳 / 髮夾 / 兜帽', () => {
    expect(HAIR_STYLES.length).toBeGreaterThanOrEqual(8);
    expect(HAIR_COLORS.length).toBeGreaterThanOrEqual(10);
    expect(EYE_COLORS.length).toBeGreaterThanOrEqual(6);
    expect(EYE_SHAPES.length).toBeGreaterThanOrEqual(2);
    expect(SKIN_TONES.length).toBeGreaterThanOrEqual(5);
    expect(OUTFITS.length).toBeGreaterThanOrEqual(6);
    expect(CLOTH_COLORS.length).toBeGreaterThanOrEqual(8);
    for (const id of ['ribbon', 'catears', 'clip', 'hood']) expect(ACCESSORIES.map((a) => a.id)).toContain(id);
    for (const id of ['twintails', 'ponytail', 'bob', 'long', 'spiky', 'messy', 'braid', 'odango']) expect(HAIR_STYLES.map((h) => h.id)).toContain(id);
    for (const id of ['pink', 'blue', 'silver', 'green']) expect(HAIR_COLORS.map((h) => h.id)).toContain(id);
  });
  it('每個欄位都有中文名稱，id 不重複', () => {
    for (const f of APPEARANCE_FIELDS) {
      expect(f.label.length).toBeGreaterThan(0);
      if (f.kind === 'toggle') continue;
      const ids = f.options.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const o of f.options) expect(o.zh.length).toBeGreaterThan(0);
    }
  });
  it('每套服裝都有合法的預設主色 / 副色', () => {
    for (const o of OUTFITS) {
      expect(o.colors[0]).toBeGreaterThanOrEqual(0);
      expect(o.colors[0]).toBeLessThan(CLOTH_COLORS.length);
      expect(o.colors[1]).toBeLessThan(CLOTH_COLORS.length);
    }
  });
});

describe('normalizeAppearance', () => {
  it('合法的外觀原樣保留', () => {
    const a: Appearance = { ...DEFAULT_APPEARANCE, hair: 3, hairColor: 7, ahoge: true, glasses: true, acc: 2 };
    expect(normalizeAppearance(a)).toEqual(a);
  });
  it('壞值 / 越界 / 型別錯：該欄退回預設，其他欄保留（外觀壞掉不會讓存檔壞掉）', () => {
    const n = normalizeAppearance({ hair: 99, hairColor: -1, eyes: 'x', skin: 2.5, outfit: 1, ahoge: 'yes', extra: 1 });
    expect(n.hair).toBe(DEFAULT_APPEARANCE.hair);
    expect(n.hairColor).toBe(DEFAULT_APPEARANCE.hairColor);
    expect(n.eyes).toBe(DEFAULT_APPEARANCE.eyes);
    expect(n.skin).toBe(DEFAULT_APPEARANCE.skin);
    expect(n.outfit).toBe(1);
    expect(n.ahoge).toBe(DEFAULT_APPEARANCE.ahoge);
    expect(Object.keys(n).sort()).toEqual(Object.keys(DEFAULT_APPEARANCE).sort());
  });
  it('null / 非物件 → 預設外觀（新物件，不是同一個參考）', () => {
    for (const v of [null, undefined, 3, 'a', []]) {
      const n = normalizeAppearance(v);
      expect(n).toEqual(DEFAULT_APPEARANCE);
      expect(n).not.toBe(DEFAULT_APPEARANCE);
    }
  });
});

describe('randomAppearance / stepAppearance / key', () => {
  it('隨機外觀永遠合法，而且夠多樣', () => {
    const r = lcg(7), keys = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const a = randomAppearance(r);
      expect(normalizeAppearance(a)).toEqual(a);
      keys.add(appearanceKey(a));
    }
    expect(keys.size).toBeGreaterThan(50);
  });
  it('左右切換會循環、切換服裝時換成該服裝的預設配色', () => {
    const a = { ...DEFAULT_APPEARANCE, hair: 0 };
    expect(stepAppearance(a, 'hair', -1).hair).toBe(HAIR_STYLES.length - 1);
    expect(stepAppearance(a, 'hair', 1).hair).toBe(1);
    const o = stepAppearance({ ...DEFAULT_APPEARANCE, outfit: 0 }, 'outfit', 1);
    expect(o.outfit).toBe(1);
    expect([o.color1, o.color2]).toEqual(OUTFITS[1].colors);
    expect(stepAppearance({ ...DEFAULT_APPEARANCE, ahoge: false }, 'ahoge', 1).ahoge).toBe(true);
    // 不改到原物件
    expect(a.hair).toBe(0);
  });
  it('key：內容一樣 = 同 key；任一欄不同 = 不同 key', () => {
    const a = { ...DEFAULT_APPEARANCE };
    expect(appearanceKey(a)).toBe(appearanceKey({ ...a }));
    expect(sameAppearance(a, { ...a })).toBe(true);
    for (const f of APPEARANCE_FIELDS) {
      const b = stepAppearance(a, f.key, 1);
      expect(appearanceKey(b)).not.toBe(appearanceKey(a));
      expect(sameAppearance(a, b)).toBe(false);
    }
  });
});

describe('預設外觀（localStorage，新世界用）', () => {
  it('寫入再讀回相同；沒有 / 壞掉的 JSON → 預設', () => {
    const s = memStore();
    expect(loadDefaultAppearance(s)).toEqual(DEFAULT_APPEARANCE);
    const a = randomAppearance(lcg(3));
    saveDefaultAppearance(s, a);
    expect(loadDefaultAppearance(s)).toEqual(a);
    s.setItem(APPEARANCE_KEY, '{nope');
    expect(loadDefaultAppearance(s)).toEqual(DEFAULT_APPEARANCE);
    expect(loadDefaultAppearance(undefined)).toEqual(DEFAULT_APPEARANCE);
  });
  it('storage 會丟例外（私密模式）也不會壞', () => {
    const bad = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } } as unknown as Storage;
    expect(loadDefaultAppearance(bad)).toEqual(DEFAULT_APPEARANCE);
    expect(() => saveDefaultAppearance(bad, DEFAULT_APPEARANCE)).not.toThrow();
  });
});
