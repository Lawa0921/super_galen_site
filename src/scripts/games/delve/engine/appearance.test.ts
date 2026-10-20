// appearance.test.ts — 角色外觀（純資料）：選項數量、正規化（壞值退回預設）、隨機、循環切換、localStorage 預設外觀
import { describe, it, expect } from 'vitest';
import {
  APPEARANCE_FIELDS, DEFAULT_APPEARANCE, BODY_TYPES, bodyDefaults, HAIR_STYLES, HAIR_COLORS, EYE_COLORS, EYE_SHAPES, SKIN_TONES, OUTFITS,
  CLOTH_COLORS, ACCESSORIES, OUTFIT_PLAIN, appearanceKey, normalizeAppearance, randomAppearance, stepAppearance,
  loadDefaultAppearance, saveDefaultAppearance, APPEARANCE_KEY, sameAppearance, createLook, type Appearance,
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
  it('數量符合需求：髮型 ≥ 13、髮色 ≥ 10、瞳色 ≥ 6、膚色 ≥ 5、服裝 ≥ 14、頭飾 ≥ 10（含緞帶 / 貓耳 / 髮夾 / 兜帽 / 皇冠 / 耳機 / 狐面 / 髮簪）', () => {
    expect(HAIR_STYLES.length).toBeGreaterThanOrEqual(13);
    expect(ACCESSORIES.length).toBeGreaterThanOrEqual(10);
    expect(HAIR_COLORS.length).toBeGreaterThanOrEqual(10);
    expect(EYE_COLORS.length).toBeGreaterThanOrEqual(6);
    expect(EYE_SHAPES.length).toBeGreaterThanOrEqual(2);
    expect(SKIN_TONES.length).toBeGreaterThanOrEqual(5);
    expect(OUTFITS.length).toBeGreaterThanOrEqual(14);
    for (const id of ['ninja', 'mage', 'knight', 'qipao', 'pirate', 'idol', 'priest', 'gothic']) expect(OUTFITS.map((o) => o.id)).toContain(id);
    expect(CLOTH_COLORS.length).toBeGreaterThanOrEqual(8);
    for (const id of ['ribbon', 'catears', 'clip', 'hood', 'crown', 'headphones', 'foxmask', 'hairpin']) expect(ACCESSORIES.map((a) => a.id)).toContain(id);
    for (const id of ['twintails', 'ponytail', 'bob', 'long', 'spiky', 'messy', 'braid', 'odango', 'lowpony', 'wolf', 'wavy', 'sidepart']) expect(HAIR_STYLES.map((h) => h.id)).toContain(id);
    for (const id of ['pink', 'blue', 'silver', 'green']) expect(HAIR_COLORS.map((h) => h.id)).toContain(id);
  });
  it('新髮型 / 頭飾 / 服裝只加在末尾：舊存檔的索引不變', () => {
    expect(HAIR_STYLES.slice(0, 9).map((h) => h.id)).toEqual(['bob', 'twintails', 'ponytail', 'long', 'hime', 'spiky', 'messy', 'braid', 'odango']);
    expect(ACCESSORIES.slice(0, 6).map((a) => a.id)).toEqual(['none', 'ribbon', 'catears', 'clip', 'hood', 'flower']);
    expect(OUTFITS.slice(0, 6).map((o) => o.id)).toEqual(['explorer', 'sailor', 'miko', 'hoodie', 'coat', 'maid']);
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
  it('基本布衣 plain：append 在服裝最後（舊的 14 套索引不變）、OUTFIT_PLAIN 指向它、預設色合法', () => {
    expect(OUTFITS[OUTFITS.length - 1].id).toBe('plain');
    expect(OUTFITS[OUTFITS.length - 1].zh).toBe('布衣');
    expect(OUTFIT_PLAIN).toBe(OUTFITS.length - 1);
    expect(OUTFITS.slice(0, 14).map((o) => o.id)).toEqual(['explorer', 'sailor', 'miko', 'hoodie', 'coat', 'maid', 'ninja', 'mage', 'knight', 'qipao', 'pirate', 'idol', 'priest', 'gothic']);
    expect(normalizeAppearance({ ...DEFAULT_APPEARANCE, outfit: OUTFIT_PLAIN }).outfit).toBe(OUTFIT_PLAIN);
  });
  it('隨機外觀不會抽到布衣（NPC / 隨機的結果和加布衣之前一樣）', () => {
    const r = lcg(77);
    for (let i = 0; i < 2000; i++) expect(randomAppearance(r).outfit).not.toBe(OUTFIT_PLAIN);
  });
  it('每套服裝都有合法的預設主色 / 副色', () => {
    for (const o of OUTFITS) {
      expect(o.colors[0]).toBeGreaterThanOrEqual(0);
      expect(o.colors[0]).toBeLessThan(CLOTH_COLORS.length);
      expect(o.colors[1]).toBeLessThan(CLOTH_COLORS.length);
    }
  });
});

describe('體型（男 / 女）', () => {
  it('第一個欄位是體型；男女各有典型的預設外觀，換體型時沒改過的預設會換成那一邊的預設', () => {
    expect(APPEARANCE_FIELDS[0].key).toBe('body');
    expect(BODY_TYPES.map((b) => b.zh)).toEqual(['女', '男']);
    const f = bodyDefaults(0), m = bodyDefaults(1);
    expect(f.body).toBe(0); expect(m.body).toBe(1);
    expect(HAIR_STYLES[f.hair].id).toBe('twintails');
    expect(['messy', 'spiky']).toContain(HAIR_STYLES[m.hair].id);
    expect(['coat', 'hoodie']).toContain(OUTFITS[m.outfit].id);
    expect(f.blush).toBe(true); expect(m.blush).toBe(false);
    expect(DEFAULT_APPEARANCE).toEqual(f);
    // 沒改過 → 換成男生預設；改過 → 只換體型（與腮紅），其他保留（不鎖性別）
    expect(stepAppearance(f, 'body', 1)).toEqual(m);
    const custom = { ...f, hair: HAIR_STYLES.findIndex((h) => h.id === 'long'), outfit: 5 };
    const sw = stepAppearance(custom, 'body', 1);
    expect(sw.body).toBe(1);
    expect(sw.hair).toBe(custom.hair);
    expect(sw.outfit).toBe(5);
    // 腮紅是玩家自己的選擇：換體型不重設
    expect(sw.blush).toBe(true);
    expect(stepAppearance({ ...custom, blush: false }, 'body', 1).blush).toBe(false);
  });
  it('隨機也會挑體型', () => {
    const r = lcg(21), seen = new Set<number>();
    for (let i = 0; i < 40; i++) seen.add(randomAppearance(r).body);
    expect([...seen].sort()).toEqual([0, 1]);
  });
  it('舊存檔沒有體型 / 腮紅 → 女、有腮紅', () => {
    const n = normalizeAppearance({ hair: 2 });
    expect(n.body).toBe(0); expect(n.blush).toBe(true);
  });
});

describe('normalizeAppearance', () => {
  it('合法的外觀原樣保留', () => {
    const a: Appearance = { ...DEFAULT_APPEARANCE, hair: 3, hairColor: 7, ahoge: true, glasses: true, acc: 2, body: 1, blush: false };
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

describe('種族欄位', () => {
  it('舊外觀沒有 race → 0，其他欄位不變；壞值 → 0；合法值保留', () => {
    const old: Record<string, unknown> = { ...DEFAULT_APPEARANCE, hair: 5, hairColor: 3 };
    delete old.race;
    expect(normalizeAppearance(old)).toEqual({ ...DEFAULT_APPEARANCE, hair: 5, hairColor: 3, race: 0 });
    expect(normalizeAppearance({ ...old, race: 7 }).race).toBe(0);
    expect(normalizeAppearance({ ...old, race: 3 }).race).toBe(3);
  });
  it('只改 race，appearanceKey 不同', () => {
    expect(appearanceKey({ ...DEFAULT_APPEARANCE, race: 1 })).not.toBe(appearanceKey(DEFAULT_APPEARANCE));
  });
  it('換體型保留目前種族；兩種預設都是人類', () => {
    expect(bodyDefaults(0).race).toBe(0);
    expect(bodyDefaults(1).race).toBe(0);
    const a = { ...DEFAULT_APPEARANCE, race: 4 };
    expect(stepAppearance(a, 'body', 1).race).toBe(4);
    expect(stepAppearance({ ...bodyDefaults(0), race: 2 }, 'body', 1)).toMatchObject({ body: 1, race: 2, hair: bodyDefaults(1).hair, outfit: bodyDefaults(1).outfit });
  });
  it('隨機外觀的種族在範圍內，且五族都抽得到', () => {
    let s = 7; const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(randomAppearance(rand).race);
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('createLook（建角外觀：只留身體，穿基本布衣）', () => {
  it('outfit = 布衣、沒有頭飾、沒有眼鏡；身體欄位與種族照舊', () => {
    const a: Appearance = { ...bodyDefaults(0), race: 3, hair: 4, hairColor: 2, glasses: true, acc: 2 };
    const c = createLook(a);
    expect(c.outfit).toBe(OUTFIT_PLAIN);
    expect(c.acc).toBe(0);
    expect(c.glasses).toBe(false);
    for (const k of ['body', 'race', 'blush', 'hair', 'hairColor', 'ahoge', 'eyes', 'eyeShape', 'skin'] as const) expect(c[k]).toBe(a[k]);
    // 不改到原物件
    expect(a.outfit).not.toBe(OUTFIT_PLAIN);
  });
  it('原本穿別的衣服 → 配色換成布衣的預設；已經是布衣 → 自己調的配色保留', () => {
    expect(createLook(bodyDefaults(0))).toMatchObject({ color1: OUTFITS[OUTFIT_PLAIN].colors[0], color2: OUTFITS[OUTFIT_PLAIN].colors[1] });
    const p = { ...createLook(bodyDefaults(1)), color1: 3, color2: 10 };
    expect(createLook(p)).toEqual(p);
  });
  it('冪等', () => {
    const rand = lcg(11);
    for (let i = 0; i < 30; i++) { const c = createLook(randomAppearance(rand)); expect(createLook(c)).toEqual(c); }
  });
  it('建角外觀換體型：還是預設（沒改過）→ 換成另一邊預設的建角外觀；種族保留', () => {
    const f = { ...createLook(bodyDefaults(0)), race: 2 };
    expect(stepAppearance(f, 'body', 1)).toEqual({ ...createLook(bodyDefaults(1)), race: 2 });
    expect(stepAppearance(createLook(bodyDefaults(1)), 'body', 1)).toEqual(createLook(bodyDefaults(0)));
    // 改過 → 只換體型，仍是布衣
    const m = { ...createLook(bodyDefaults(0)), hair: 7 };
    expect(stepAppearance(m, 'body', 1)).toEqual({ ...m, body: 1 });
  });
});
