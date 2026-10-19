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
import { eyeRamp, hairRamp } from './avatarPalette';

/** 測試用的中性外觀（探險家、栗色髮、沒有頭飾）：預設外觀是粉髮水手服，粉髮的高光是白色、水手服的領巾 / 長袖會和被測的東西重疊 */
const DEF = { ...DEFAULT_APPEARANCE, hair: 0, hairColor: 2, outfit: 0, color1: OUTFITS[0].colors[0], color2: OUTFITS[0].colors[1], acc: 0 };
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
  it('影格表：每個動畫都有，格數對得上；四列（body / head / 暗處輪廓光 / 臉）', () => {
    const { b, meta } = avatarSheet(plainLook(DEF));
    expect(b.w).toBe(AV_FW * SHEET.total);
    expect(b.h).toBe(AV_FH * 4);
    expect(meta.length).toBe(SHEET.total);
    expect(SHEET.climb[1]).toBeGreaterThanOrEqual(4);
    expect(SHEET.hang[1]).toBeGreaterThanOrEqual(2);
    expect(SHEET.mantle[1]).toBeGreaterThanOrEqual(2);
    // 背面爬繩 / 掛著 / 倒地：手臂畫在影格裡
    // 游泳：整個人連手臂一起斜著畫（划水）
    for (const k of ['climb', 'hang', 'dead', 'swim'] as const) for (let f = 0; f < SHEET[k][1]; f++) expect(meta[SHEET[k][0] + f].arms).toBe(false);
    for (const k of ['idle', 'walk', 'jump', 'fall', 'mantle', 'hurt'] as const) expect(meta[SHEET[k][0]].arms).toBe(true);
    expect(SHEET.mantle[1]).toBe(4);
  });
  it('隨機外觀 × 各種穿搭：每格都有內容、只用色票、沒有半透明', { timeout: 60_000 }, () => {
    const r = lcg(5);
    const looks: DollLook[] = [];
    for (let i = 0; i < 8; i++) looks.push(plainLook(randomAppearance(r)));
    SETS.forEach((s, i) => looks.push({ ...plainLook(randomAppearance(r)), head: piece(`armor:${s}`, i % 6, i % 4, (['fire', 'ice', 'poison', 'light', 'storm', null] as const)[i]), body: piece(`armor:${s}`, 5 - i), legs: piece(`armor:${s}`, i), feet: i & 1 ? 'jump' : 'swift', neck: 'heart', belt: 'compass' }));
    for (const v of VANITY_ITEMS) looks.push({ ...plainLook(DEF), back: v.includes('cape') || v.includes('wings') || v.includes('bow') ? piece(`back:${v === 'travel_cape' ? 'cape' : v === 'feather_wings' ? 'wings' : 'bow'}`) : null });
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
    for (let h = 0; h < HAIR_STYLES.length; h++) imgs.add(flatFrame(avatarFrame(plainLook({ ...DEF, hair: h }), 'idle', 0)).px.join());
    expect(imgs.size).toBe(HAIR_STYLES.length);
    const outfits = new Set<string>();
    for (let o = 0; o < OUTFITS.length; o++) outfits.add(flatFrame(avatarFrame(plainLook({ ...DEF, outfit: o }), 'idle', 0)).px.join());
    expect(outfits.size).toBe(OUTFITS.length);
  });
  it('爬繩的影格依序不同（手交替），掛著的影格會晃', () => {
    const l = plainLook(DEF);
    const climb = new Set<string>(), hang = new Set<string>();
    for (let f = 0; f < SHEET.climb[1]; f++) climb.add(avatarFrame(l, 'climb', f).body.px.join());
    for (let f = 0; f < SHEET.hang[1]; f++) hang.add(avatarFrame(l, 'hang', f).body.px.join());
    expect(climb.size).toBeGreaterThanOrEqual(SHEET.climb[1] - 1);
    expect(hang.size).toBeGreaterThanOrEqual(2);
  });
});

describe('動作：呼吸 / 擺動', () => {
  it('待機呼吸：四格裡身體有起伏（胸口那幾列會變）、頭慢一拍跟著沉；四格不全相同', () => {
    const l = plainLook(DEF);
    const fr = [0, 1, 2, 3].map((f) => flatFrame(avatarFrame(l, 'idle', f)));
    expect(new Set(fr.map((b) => b.px.join())).size).toBeGreaterThanOrEqual(3);
    const top = (b: Bmp): number => { for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.on(x, y)) return y; return b.h; };
    expect(new Set(fr.map(top)).size).toBeGreaterThanOrEqual(2);
  });
  it('走路：身體在踏步時上下彈（頭頂高度至少兩種）', () => {
    const l = plainLook({ ...DEF, ahoge: false });
    const top = (b: Bmp): number => { for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.on(x, y)) return y; return b.h; };
    const ys = new Set(Array.from({ length: SHEET.walk[1] }, (_, f) => top(flatFrame(avatarFrame(l, 'walk', f)))));
    expect(ys.size).toBeGreaterThanOrEqual(2);
  });
});

describe('3/4 正面的朝向感', () => {
  const eyeX = (b: Bmp, ramp: Set<string>): number => { let s = 0, n = 0; for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.on(x, y) && ramp.has(b.get(x, y).join())) { s += x; n++; } return n ? s / n : NaN; };
  it('臉在頭的中央偏右（面向的那側）；走路 / 跳的時候眼睛再往前偏一格', () => {
    const l = plainLook(DEF), er = new Set(eyeRamp(DEF.eyes).map((c) => c.join()));
    const idle = avatarFrame(l, 'idle', 0).head, walk = avatarFrame(l, 'walk', 0).head;
    // 頭的範圍
    let x0 = idle.w, x1 = -1;
    for (let y = 0; y < idle.h; y++) for (let x = 0; x < idle.w; x++) if (idle.on(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    expect(eyeX(idle, er)).toBeGreaterThan((x0 + x1) / 2);
    expect(eyeX(walk, er)).toBeGreaterThan(eyeX(idle, er) + 1.5);
  });
  it('小人的大小：約 38–42 px 高、頭約佔 6 成（約 1.6 頭身）', () => {
    const b = flatFrame(avatarFrame(plainLook({ ...DEF, ahoge: false }), 'idle', 0));
    let top = b.h; for (let y = 0; y < b.h && top === b.h; y++) for (let x = 0; x < b.w; x++) if (b.on(x, y)) { top = y; break; }
    expect(AV_FH - top).toBeGreaterThanOrEqual(36);
    expect(AV_FH - top).toBeLessThanOrEqual(43);
  });
});

describe('臉的那一層（舉過頭的武器畫在頭髮前、臉後）', () => {
  it('側面影格的 face：有內容、每一格都和 head 那張同位置同顏色（是 head 的子集）、有眼睛、不含頭髮那一大片', () => {
    const l = plainLook(DEF), er = new Set(eyeRamp(DEF.eyes).map((c) => c.join()));
    for (const [k, f] of [['idle', 0], ['walk', 3], ['jump', 0]] as const) {
      const r = avatarFrame(l, k, f);
      expect(r.face, k).toBeTruthy();
      let n = 0, eye = 0;
      for (let i = 0; i < r.face!.px.length; i++) {
        const v = r.face!.px[i];
        if (!(v >>> 24)) continue;
        n++;
        expect(v).toBe(r.head.px[i]);
        if (er.has(Bmp.unpack(v).join())) eye++;
      }
      expect(n, k).toBeGreaterThan(60);
      expect(n, k).toBeLessThan(opaque(r.head) * 0.75);
      expect(eye, k).toBeGreaterThan(4);
    }
    // 影格表第四列就是 face
    const { b } = avatarSheet(l);
    let m = 0;
    for (let y = AV_FH * 3; y < AV_FH * 4; y++) for (let x = 0; x < AV_FW; x++) if (b.on(x, y)) m++;
    expect(m).toBeGreaterThan(60);
  });
});

describe('圖層', () => {
  it('側面影格依 DOLL_LAYERS 的順序合成（手臂 / 手持由渲染器畫在兩張中間）', () => {
    const l: DollLook = { ...plainLook(DEF), head: piece('armor:iron'), back: piece('back:cape') };
    const trace: string[] = [];
    avatarFrame(l, 'idle', 0, trace);
    expect(trace).toEqual(DOLL_LAYERS.filter((k) => k !== 'arms' && k !== 'held'));
    const t2: string[] = [];
    avatarFrame(plainLook(DEF), 'walk', 3, t2);
    expect(t2).toEqual(DOLL_LAYERS.filter((k) => k !== 'arms' && k !== 'held' && k !== 'back' && k !== 'headgear'));
  });
  it('頭盔：頭頂的呆毛 / 頭髮收起來（頭頂上方看不到髮色），瀏海留著', () => {
    const a = { ...DEF, ahoge: true, hair: HAIR_STYLES.findIndex((h) => h.id === 'spiky') };
    const bare = avatarFrame(plainLook(a), 'idle', 0).head;
    const helm = avatarFrame({ ...plainLook(a), head: piece('armor:iron') }, 'idle', 0).head;
    const hr = new Set(hairRamp(a.hairColor).map((c) => c.join()));
    const hairPx = (b: Bmp, y0: number, y1: number): number => { let n = 0; for (let y = y0; y <= y1; y++) for (let x = 0; x < b.w; x++) if (b.on(x, y) && hr.has(b.get(x, y).join())) n++; return n; };
    expect(hairPx(bare, 0, 12)).toBeGreaterThan(5);
    expect(hairPx(helm, 0, 12)).toBe(0);
    // 瀏海（額頭那一帶）還在
    expect(hairPx(helm, 25, 27)).toBeGreaterThan(3);
  });
  it('外觀欄 / 時裝蓋過防具：穿鐵甲 vs 鐵甲 + 水手服外觀，畫出來的身體不同、而且和純水手服一樣', () => {
    const base = plainLook(DEF);
    const armor = avatarFrame({ ...base, body: piece('armor:iron') }, 'idle', 0).body;
    const sailor = avatarFrame({ ...base, body: piece('outfit:sailor') }, 'idle', 0).body;
    expect(diff(armor, sailor)).toBeGreaterThan(30);
    const fullSailor = avatarFrame({ ...base, body: piece('outfit:sailor'), legs: piece('outfit:sailor') }, 'idle', 0).body;
    const plainSailor = avatarFrame(plainLook({ ...DEF, outfit: OUTFITS.findIndex((o) => o.id === 'sailor'), color1: OUTFITS[1].colors[0], color2: OUTFITS[1].colors[1] }), 'idle', 0).body;
    expect(diff(fullSailor, plainSailor)).toBe(0);
  });
  it('稀有度 / 強化 / 元素看得出來（但只是少量點綴）', () => {
    const base = plainLook(DEF);
    const common = flatFrame(avatarFrame({ ...base, body: piece('armor:gold'), head: piece('armor:gold') }, 'idle', 0));
    const epic = flatFrame(avatarFrame({ ...base, body: piece('armor:gold', 3), head: piece('armor:gold', 3) }, 'idle', 0));
    const myth = flatFrame(avatarFrame({ ...base, body: piece('armor:gold', 5, 5, 'fire'), head: piece('armor:gold', 5, 5, 'fire') }, 'idle', 0));
    const ice = flatFrame(avatarFrame({ ...base, body: piece('armor:gold', 5, 5, 'ice'), head: piece('armor:gold', 5, 5, 'ice') }, 'idle', 0));
    expect(diff(common, epic)).toBeGreaterThan(4);
    // 頭 23×22 的帽沿比較長：點綴的格數跟著變多，但仍是少量（< 整張的 1/10）
    expect(diff(common, epic)).toBeLessThan(85);
    expect(diff(epic, myth)).toBeGreaterThan(4);
    expect(diff(myth, ice)).toBeGreaterThan(2);
    // 傳說以上的閃光會跟著影格移動
    const m0 = flatFrame(avatarFrame({ ...base, body: piece('armor:gold', 4) }, 'idle', 0)), m1 = flatFrame(avatarFrame({ ...base, body: piece('armor:gold', 4) }, 'idle', 1));
    const c0 = flatFrame(avatarFrame({ ...base, body: piece('armor:gold', 2) }, 'idle', 0)), c1 = flatFrame(avatarFrame({ ...base, body: piece('armor:gold', 2) }, 'idle', 1));
    expect(diff(m0, m1)).toBeGreaterThan(diff(c0, c1));
  });
  it('看得見的飾品：飾品鞋、背飾、墜飾、腰間小物都會改變畫面', () => {
    const base = plainLook(DEF), b0 = flatFrame(avatarFrame(base, 'idle', 0));
    for (const extra of [{ feet: 'jump' }, { feet: 'swift' }, { neck: 'night' }, { belt: 'compass' }, { back: piece('back:feathers') }, { back: piece('back:buckler') }, { back: piece('back:wings') }] as Partial<DollLook>[]) {
      expect(diff(b0, flatFrame(avatarFrame({ ...base, ...extra }, 'idle', 0))), JSON.stringify(extra)).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('預覽 / 圖示 / 快取', () => {
  it('預覽：手臂畫上去（和只有身體的那張差很多格：袖子 / 手 / 手臂的描邊）', () => {
    const l = plainLook(DEF);
    const p = dollPreview(l, dollKey(l), 'walk', 2);
    expect(diff(p, flatFrame(avatarFrame(l, 'walk', 2)))).toBeGreaterThan(20);
    clean(p, 'preview');
  });
  it('每件時裝的圖示都有內容、只用色票', () => {
    for (const id of VANITY_ITEMS) {
      const b = fashionIcon(id)!;
      expect(b.w).toBe(16);
      expect(opaque(b), id).toBeGreaterThan(20);
      clean(b, id);
    }
    expect(opaque(pieceBmp({ ...plainLook(DEF), head: piece('armor:bone', 4) }, 'head'))).toBeGreaterThan(40);
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
    g.setAppearance({ ...DEF, hair: 4 });
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

describe('體型（男 / 女）與爬繩', () => {
  const male = { ...DEF, body: 1, blush: false }, female = { ...DEF, body: 0 };
  it('男女畫出來不一樣：男生肩膀寬、沒有腮紅；每套防具 / 服裝在兩種體型上都畫得出來、只用色票', () => {
    const fb = avatarFrame(plainLook(female), 'idle', 0).body, mb = avatarFrame(plainLook(male), 'idle', 0).body;
    const width = (b: Bmp, y: number): number => { let n = 0; for (let x = 0; x < b.w; x++) if (b.on(x, y)) n++; return n; };
    // 肩膀那一列（3/4 正面的小身體：軀幹第 3 列）
    expect(width(mb, 40)).toBeGreaterThan(width(fb, 40));
    // 男女同高（都收在碰撞盒 42 px 裡；男生靠肩寬 / 粗眉 / 方眼分辨）
    const topRow = (b: Bmp): number => { for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.on(x, y)) return y; return b.h; };
    const ff = flatFrame(avatarFrame(plainLook({ ...female, ahoge: false }), 'idle', 0)), mf = flatFrame(avatarFrame(plainLook({ ...male, ahoge: false }), 'idle', 0));
    expect(Math.abs(topRow(ff) - topRow(mf))).toBeLessThanOrEqual(1);
    expect(topRow(mf)).toBeGreaterThanOrEqual(AV_FH - 42);
    expect(diff(fb, mb)).toBeGreaterThan(20);
    for (const body of [0, 1]) {
      for (let o = 0; o < OUTFITS.length; o++) clean(avatarSheet(plainLook({ ...DEF, body, outfit: o })).b, `body ${body} outfit ${o}`);
      for (const s of SETS) clean(avatarSheet({ ...plainLook({ ...DEF, body }), head: piece(`armor:${s}`), body: piece(`armor:${s}`), legs: piece(`armor:${s}`) }).b, `body ${body} ${s}`);
    }
  });
  it('爬繩是側面（臉看得到）：往上 8 格、往下 6 格是另一套、掛著 4 格；整格往左偏讓繩子對準中心', () => {
    const l = plainLook(DEF);
    const up = new Set<string>(), down = new Set<string>();
    for (let f = 0; f < SHEET.climb[1]; f++) { const r = avatarFrame(l, 'climb', f); up.add(r.body.px.join()); expect(r.meta.ox).toBeLessThan(0); }
    for (let f = 0; f < SHEET.climbdown[1]; f++) down.add(avatarFrame(l, 'climbdown', f).body.px.join());
    expect(SHEET.climb[1]).toBe(8);
    expect(up.size).toBe(8);
    expect(down.size).toBeGreaterThanOrEqual(5);
    for (const d of down) expect(up.has(d)).toBe(false);
    // 眼睛（瞳色）看得到 = 臉朝外，不是背面
    const eye = new Set(eyeRamp(DEF.eyes).map((c) => c.join()));
    let eyes = 0;
    const b = avatarFrame(l, 'climb', 2).body;
    for (let i = 0; i < b.px.length; i++) if (b.px[i] >>> 24 && eye.has(Bmp.unpack(b.px[i]).join())) eyes++;
    expect(eyes).toBeGreaterThan(4);
  });
  it('暗處輪廓光：影格表第三列是外框那一圈（只用色票）', () => {
    const { b } = avatarSheet(plainLook(DEF));
    let n = 0;
    for (let y = AV_FH * 2; y < AV_FH * 3; y++) for (let x = 0; x < AV_FW; x++) if (b.on(x, y)) n++;
    expect(n).toBeGreaterThan(60);
  });
});
