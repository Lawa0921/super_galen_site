// avatarArt.test.ts — 紙娃娃精靈（純 Bmp）：只用統一色票、沒有半透明、每個動畫每格都畫得出來；
// 圖層順序、頭盔收起頭頂的頭髮、外觀欄蓋過防具、稀有度 / 元素 / 強化看得出來、背面爬繩把手臂畫進影格。
import { describe, it, expect } from 'vitest';
import { Bmp, inPalette } from './pixel';
import { DEFAULT_APPEARANCE, HAIR_STYLES, OUTFITS, randomAppearance } from '../engine/appearance';
import { DOLL_LAYERS, dollKey, plainLook, type DollLook, type DollPiece } from '../engine/doll';
import { AV_FH, AV_FW, SHEET, SHEET_ANIMS, avatarFrame, avatarSheet, flatFrame, pieceBmp } from './avatarArt';
import { dollPreview } from './dollPreview';
import { fashionIcon } from './fashionIcon';
import { VANITY_ITEMS, type ArmorSetId } from '../engine/items';
import { DelveGame } from '../engine/game';
import { hairRamp } from './avatarPalette';

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}
const piece = (look: string, rarity = 0, plus = 0, elem: DollPiece['elem'] = null): DollPiece => ({ look, rarity, plus, elem });
const SETS: ArmorSetId[] = ['wood', 'copper', 'iron', 'gold', 'bone', 'molten'];
const opaque = (b: Bmp): number => { let n = 0; for (const v of b.px) if (v >>> 24) n++; return n; };
function clean(b: Bmp, what: string): void {
  let bad = '';
  for (const v of b.px) {
    const a = v >>> 24;
    if (a === 0) continue;
    if (a !== 255) { bad = `半透明 ${a}`; break; }
    if (!inPalette(Bmp.unpack(v))) { bad = `色票外 ${Bmp.unpack(v).join(',')}`; break; }
  }
  expect(bad, what).toBe('');
}
const diff = (a: Bmp, b: Bmp): number => { let n = 0; for (let i = 0; i < a.px.length; i++) if (a.px[i] !== b.px[i]) n++; return n; };

describe('紙娃娃影格', () => {
  it('影格表：每個動畫都有，格數對得上；兩列（body / head）', () => {
    const { b, meta } = avatarSheet(plainLook(DEFAULT_APPEARANCE));
    expect(b.w).toBe(AV_FW * SHEET.total);
    expect(b.h).toBe(AV_FH * 2);
    expect(meta.length).toBe(SHEET.total);
    expect(SHEET.climb[1]).toBeGreaterThanOrEqual(4);
    expect(SHEET.hang[1]).toBeGreaterThanOrEqual(2);
    expect(SHEET.mantle[1]).toBeGreaterThanOrEqual(2);
    // 背面爬繩 / 掛著 / 倒地：手臂畫在影格裡
    for (const k of ['climb', 'hang', 'dead'] as const) for (let f = 0; f < SHEET[k][1]; f++) expect(meta[SHEET[k][0] + f].arms).toBe(false);
    for (const k of ['idle', 'walk', 'jump', 'fall', 'mantle', 'swim', 'hurt'] as const) expect(meta[SHEET[k][0]].arms).toBe(true);
  });
  it('隨機外觀 × 各種穿搭：每格都有內容、只用色票、沒有半透明', { timeout: 60_000 }, () => {
    const r = lcg(5);
    const looks: DollLook[] = [];
    for (let i = 0; i < 8; i++) looks.push(plainLook(randomAppearance(r)));
    SETS.forEach((s, i) => looks.push({ ...plainLook(randomAppearance(r)), head: piece(`armor:${s}`, i % 6, i % 4, (['fire', 'ice', 'poison', 'light', 'storm', null] as const)[i]), body: piece(`armor:${s}`, 5 - i), legs: piece(`armor:${s}`, i), feet: i & 1 ? 'jump' : 'swift', neck: 'heart', belt: 'compass' }));
    for (const v of VANITY_ITEMS) looks.push({ ...plainLook(DEFAULT_APPEARANCE), back: v.includes('cape') || v.includes('wings') || v.includes('bow') ? piece(`back:${v === 'travel_cape' ? 'cape' : v === 'feather_wings' ? 'wings' : 'bow'}`) : null });
    for (const l of looks) {
      const { b } = avatarSheet(l);
      clean(b, dollKey(l));
      for (const k of SHEET_ANIMS) for (let f = 0; f < SHEET[k][1]; f++) {
        const fr = avatarFrame(l, k, f);
        expect(opaque(flatFrame(fr)), `${k}:${f}`).toBeGreaterThan(250);
      }
    }
  });
  it('每種髮型、每套服裝都長得不一樣', () => {
    const imgs = new Set<string>();
    for (let h = 0; h < HAIR_STYLES.length; h++) imgs.add(flatFrame(avatarFrame(plainLook({ ...DEFAULT_APPEARANCE, hair: h }), 'idle', 0)).px.join());
    expect(imgs.size).toBe(HAIR_STYLES.length);
    const outfits = new Set<string>();
    for (let o = 0; o < OUTFITS.length; o++) outfits.add(flatFrame(avatarFrame(plainLook({ ...DEFAULT_APPEARANCE, outfit: o }), 'idle', 0)).px.join());
    expect(outfits.size).toBe(OUTFITS.length);
  });
  it('爬繩的影格依序不同（手交替），掛著的影格會晃', () => {
    const l = plainLook(DEFAULT_APPEARANCE);
    const climb = new Set<string>(), hang = new Set<string>();
    for (let f = 0; f < SHEET.climb[1]; f++) climb.add(avatarFrame(l, 'climb', f).body.px.join());
    for (let f = 0; f < SHEET.hang[1]; f++) hang.add(avatarFrame(l, 'hang', f).body.px.join());
    expect(climb.size).toBeGreaterThanOrEqual(SHEET.climb[1] - 1);
    expect(hang.size).toBeGreaterThanOrEqual(2);
  });
});

describe('圖層', () => {
  it('側面影格依 DOLL_LAYERS 的順序合成（手臂 / 手持由渲染器畫在兩張中間）', () => {
    const l: DollLook = { ...plainLook(DEFAULT_APPEARANCE), head: piece('armor:iron'), back: piece('back:cape') };
    const trace: string[] = [];
    avatarFrame(l, 'idle', 0, trace);
    expect(trace).toEqual(DOLL_LAYERS.filter((k) => k !== 'arms' && k !== 'held'));
    const t2: string[] = [];
    avatarFrame(plainLook(DEFAULT_APPEARANCE), 'walk', 3, t2);
    expect(t2).toEqual(DOLL_LAYERS.filter((k) => k !== 'arms' && k !== 'held' && k !== 'back' && k !== 'headgear'));
  });
  it('頭盔：頭頂的呆毛 / 頭髮收起來（頭頂上方看不到髮色），瀏海留著', () => {
    const a = { ...DEFAULT_APPEARANCE, ahoge: true, hair: HAIR_STYLES.findIndex((h) => h.id === 'spiky') };
    const bare = avatarFrame(plainLook(a), 'idle', 0).head;
    const helm = avatarFrame({ ...plainLook(a), head: piece('armor:iron') }, 'idle', 0).head;
    const hr = new Set(hairRamp(a.hairColor).map((c) => c.join()));
    const hairPx = (b: Bmp, y0: number, y1: number): number => { let n = 0; for (let y = y0; y <= y1; y++) for (let x = 0; x < b.w; x++) if (b.on(x, y) && hr.has(b.get(x, y).join())) n++; return n; };
    expect(hairPx(bare, 0, 12)).toBeGreaterThan(5);
    expect(hairPx(helm, 0, 12)).toBe(0);
    // 瀏海（額頭那一帶）還在
    expect(hairPx(helm, 19, 21)).toBeGreaterThan(3);
  });
  it('外觀欄 / 時裝蓋過防具：穿鐵甲 vs 鐵甲 + 水手服外觀，畫出來的身體不同、而且和純水手服一樣', () => {
    const base = plainLook(DEFAULT_APPEARANCE);
    const armor = avatarFrame({ ...base, body: piece('armor:iron') }, 'idle', 0).body;
    const sailor = avatarFrame({ ...base, body: piece('outfit:sailor') }, 'idle', 0).body;
    expect(diff(armor, sailor)).toBeGreaterThan(30);
    const fullSailor = avatarFrame({ ...base, body: piece('outfit:sailor'), legs: piece('outfit:sailor') }, 'idle', 0).body;
    const plainSailor = avatarFrame(plainLook({ ...DEFAULT_APPEARANCE, outfit: OUTFITS.findIndex((o) => o.id === 'sailor'), color1: OUTFITS[1].colors[0], color2: OUTFITS[1].colors[1] }), 'idle', 0).body;
    expect(diff(fullSailor, plainSailor)).toBe(0);
  });
  it('稀有度 / 強化 / 元素看得出來（但只是少量點綴）', () => {
    const base = plainLook(DEFAULT_APPEARANCE);
    const common = flatFrame(avatarFrame({ ...base, body: piece('armor:gold'), head: piece('armor:gold') }, 'idle', 0));
    const epic = flatFrame(avatarFrame({ ...base, body: piece('armor:gold', 3), head: piece('armor:gold', 3) }, 'idle', 0));
    const myth = flatFrame(avatarFrame({ ...base, body: piece('armor:gold', 5, 5, 'fire'), head: piece('armor:gold', 5, 5, 'fire') }, 'idle', 0));
    const ice = flatFrame(avatarFrame({ ...base, body: piece('armor:gold', 5, 5, 'ice'), head: piece('armor:gold', 5, 5, 'ice') }, 'idle', 0));
    expect(diff(common, epic)).toBeGreaterThan(4);
    expect(diff(common, epic)).toBeLessThan(60);
    expect(diff(epic, myth)).toBeGreaterThan(4);
    expect(diff(myth, ice)).toBeGreaterThan(2);
    // 傳說以上的閃光會跟著影格移動
    const m0 = flatFrame(avatarFrame({ ...base, body: piece('armor:gold', 4) }, 'idle', 0)), m1 = flatFrame(avatarFrame({ ...base, body: piece('armor:gold', 4) }, 'idle', 1));
    const c0 = flatFrame(avatarFrame({ ...base, body: piece('armor:gold', 2) }, 'idle', 0)), c1 = flatFrame(avatarFrame({ ...base, body: piece('armor:gold', 2) }, 'idle', 1));
    expect(diff(m0, m1)).toBeGreaterThan(diff(c0, c1));
  });
  it('看得見的飾品：飾品鞋、背飾、墜飾、腰間小物都會改變畫面', () => {
    const base = plainLook(DEFAULT_APPEARANCE), b0 = flatFrame(avatarFrame(base, 'idle', 0));
    for (const extra of [{ feet: 'jump' }, { feet: 'swift' }, { neck: 'night' }, { belt: 'compass' }, { back: piece('back:feathers') }, { back: piece('back:buckler') }, { back: piece('back:wings') }] as Partial<DollLook>[]) {
      expect(diff(b0, flatFrame(avatarFrame({ ...base, ...extra }, 'idle', 0))), JSON.stringify(extra)).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('預覽 / 圖示 / 快取', () => {
  it('預覽：手臂畫上去（比只有身體多）', () => {
    const l = plainLook(DEFAULT_APPEARANCE);
    const p = dollPreview(l, dollKey(l), 'walk', 2);
    expect(opaque(p)).toBeGreaterThan(opaque(flatFrame(avatarFrame(l, 'walk', 2))));
    clean(p, 'preview');
  });
  it('每件時裝的圖示都有內容、只用色票', () => {
    for (const id of VANITY_ITEMS) {
      const b = fashionIcon(id)!;
      expect(b.w).toBe(16);
      expect(opaque(b), id).toBeGreaterThan(20);
      clean(b, id);
    }
    expect(opaque(pieceBmp({ ...plainLook(DEFAULT_APPEARANCE), head: piece('armor:bone', 4) }, 'head'))).toBeGreaterThan(40);
  });
  it('game.doll()：沒變就回傳同一份（不重算），換裝 / 外觀欄 / 隱藏 / 外觀才換 key', () => {
    const g = new DelveGame({ seed: 'doll', width: 96, height: 96, peaceful: true });
    const a = g.doll();
    expect(g.doll()).toBe(a);
    g.equip('iron_helmet');
    const b = g.doll();
    expect(b.key).not.toBe(a.key);
    g.setHideArmor('head', true);
    expect(g.doll().key).toBe(a.key);
    g.vanity.set('back', 'feather_wings');
    expect(g.doll().key).not.toBe(a.key);
    g.setAppearance({ ...DEFAULT_APPEARANCE, hair: 4 });
    const c = g.doll();
    expect(c.look.app.hair).toBe(4);
    expect(g.doll()).toBe(c);
  });
  it('烘一整張影格表夠快（換裝時才烘）', () => {
    const l = { ...plainLook(randomAppearance(lcg(9))), head: piece('armor:molten', 5), body: piece('armor:molten', 5), back: piece('back:cape') };
    avatarSheet(l);
    const t0 = performance.now();
    for (let i = 0; i < 3; i++) avatarSheet(l);
    expect((performance.now() - t0) / 3).toBeLessThan(250);
  });
});
