// avatarArt.test.ts — 紙娃娃精靈（純 Bmp）：只用統一色票、沒有半透明、每個動畫每格都畫得出來；
// 圖層順序、頭盔收起頭頂的頭髮、外觀欄蓋過防具、稀有度 / 元素 / 強化看得出來、背面爬繩把手臂畫進影格。
import { describe, it, expect } from 'vitest';
import { Bmp, INK, inPalette, rotPrep, rotate } from './pixel';
import { ACCESSORIES, DEFAULT_APPEARANCE, HAIR_STYLES, OUTFITS, RACES, bodyDefaults, randomAppearance } from '../engine/appearance';
import { DOLL_LAYERS, dollKey, plainLook, type DollLook, type DollPiece } from '../engine/doll';
import { ARM_PIV, AV_FH, AV_FW, AV_HEAD, SHEET, SHEET_ANIMS, avatarArm, avatarFrame, avatarSheet, flatFrame, pieceBmp, shoulderOf } from './avatarArt';
import { BRIM, HAT_HIDES_TOP, hatArt, helmetArt } from './avatarGear';
import { dollPreview, previewArms } from './dollPreview';
import { fashionIcon } from './fashionIcon';
import { ACC_ITEMS, ITEMS, OUTFIT_ITEMS, VANITY_ITEMS, type ArmorSetId, type ItemId } from '../engine/items';
import { accTintFromAppearance, defaultTint } from '../engine/tint';
import { DelveGame } from '../engine/game';
import { CLOTH_RAMPS, DARK, LEATHER, MAIL, SKIN_RAMPS, clothRamp, eyeRamp, hairRamp } from './avatarPalette';

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
  // 軀幹區域：待機第 0 格、面向右、只看 body 那張（手臂由渲染器另外畫、不在裡面），
  //   列 = 肩膀那列（AV_SHOULDER y 42）到髖（47）、欄 = 中心 26 ± 5（男生最寬的那列 21..31）。
  //   髮色用嫩綠（色階和這些服裝的布色不重疊）、鮑伯頭、沒有頭飾。全部 14 套服裝。
  const SHADED_OUTFITS = OUTFITS.map((o) => o.id);
  it('每套服裝的軀幹至少用到主色 / 副色色階裡 3 種不同的色（亮 / 底 / 影三階）', () => {
    for (const id of SHADED_OUTFITS) for (const body of [0, 1]) {
      const o = OUTFITS.findIndex((x) => x.id === id);
      expect(o, id).toBeGreaterThanOrEqual(0);
      const [c1, c2] = OUTFITS[o].colors;
      const cloth = new Set([...clothRamp(c1), ...clothRamp(c2)].map((c) => c.join()));
      const b = avatarFrame(plainLook({ ...DEF, body, hairColor: 9, outfit: o, color1: c1, color2: c2 }), 'idle', 0).body;
      const seen = new Set<string>();
      for (let y = 42; y <= 47; y++) for (let x = 21; x <= 31; x++) if (b.on(x, y) && cloth.has(b.get(x, y).join())) seen.add(b.get(x, y).join());
      expect(seen.size, `${id} body ${body}`).toBeGreaterThanOrEqual(3);
    }
  });
  // 前手：照 dollPreview 的合成（後手 → body → 前手 → head）把待機第 0 格的前手轉好放上去，
  //   前手的像素（沒被頭蓋住）和身體那張的像素（沒被前手 / 頭蓋住）四鄰相接的每一對，至少一邊是外框色。
  it('前手和軀幹分得開：待機第 0 格，前手和身體相鄰處至少一邊是外框色（布色階 [0] / 膚色階 [0] / INK）', () => {
    const OUT = new Set([...CLOTH_RAMPS, ...SKIN_RAMPS, LEATHER, DARK, MAIL].map((r) => r[0].join()).concat(INK.join()));
    const bad: string[] = [];
    for (let o = 0; o < OUTFITS.length; o++) for (const body of [0, 1]) {
      const l = plainLook({ ...DEF, body, outfit: o, color1: OUTFITS[o].colors[0], color2: OUTFITS[o].colors[1] });
      const fr = avatarFrame(l, 'idle', 0), full = dollPreview(l, dollKey(l), 'idle', 0);
      const s = shoulderOf(body, false), deg = previewArms('idle', 0).front;
      const arm = rotate(rotPrep(avatarArm(l, false)), ARM_PIV.x, ARM_PIV.y, -(deg * Math.PI) / 180, 64);
      const ax = s.x + fr.meta.dx - 32, ay = s.y + fr.meta.dy - 32;
      const isArm = (x: number, y: number): boolean => arm.on(x - ax, y - ay) && !fr.head.on(x, y);
      const isBody = (x: number, y: number): boolean => fr.body.on(x, y) && !arm.on(x - ax, y - ay) && !fr.head.on(x, y);
      const isOut = (x: number, y: number): boolean => OUT.has(full.get(x, y).join());
      let pairs = 0, blend = 0;
      for (let y = 0; y < AV_FH; y++) for (let x = 0; x < AV_FW; x++) {
        if (!isArm(x, y)) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (!isBody(x + dx, y + dy)) continue;
          pairs++;
          if (!isOut(x, y) && !isOut(x + dx, y + dy)) blend++;
        }
      }
      expect(pairs, `${OUTFITS[o].id} body ${body}: arm touches the body`).toBeGreaterThan(3);
      if (blend) bad.push(`${OUTFITS[o].id} body ${body}: ${blend}/${pairs}`);
    }
    expect(bad).toEqual([]);
  });
  it('每款髮型的前髮（瀏海那一帶）至少用到髮色色階裡 3 階（亮 / 底 / 影）', () => {
    const bad: string[] = [];
    for (let hair = 0; hair < HAIR_STYLES.length; hair++) for (const body of [0, 1]) for (const hairColor of [0, 2, 3, 5, 7, 9]) {
      const head = avatarFrame(plainLook({ ...DEF, body, hair, hairColor, ahoge: false }), 'idle', 0).head;
      const hr = new Set(hairRamp(hairColor).map((c) => c.join())), seen = new Set<string>();
      // 瀏海：區域第 8–21 欄、第 3–7 列（眼睛 / 男生的眉毛在第 8 列以下）
      for (let y = AV_HEAD.y + 3; y <= AV_HEAD.y + 7; y++) for (let x = AV_HEAD.x + 8; x <= AV_HEAD.x + 21; x++) if (head.on(x, y) && hr.has(head.get(x, y).join())) seen.add(head.get(x, y).join());
      if (seen.size < 3) bad.push(`${HAIR_STYLES[hair].id} body ${body} color ${hairColor}: ${seen.size}`);
    }
    expect(bad).toEqual([]);
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
    expect(eyeX(walk, er)).toBeGreaterThan(eyeX(idle, er) + 1);
  });
  it('小人的大小：約 30–34 px 高（克魯賽德戰技的英雄約 31）、頭佔一半以上（身體 + 腿 12–14 列）', () => {
    for (const body of [0, 1]) {
      const r = avatarFrame(plainLook({ ...bodyDefaults(body), ahoge: false }), 'idle', 0), b = flatFrame(r);
      let top = b.h; for (let y = 0; y < b.h && top === b.h; y++) for (let x = 0; x < b.w; x++) if (b.on(x, y)) { top = y; break; }
      expect(AV_FH - top, `body ${body}`).toBeGreaterThanOrEqual(30);
      expect(AV_FH - top, `body ${body}`).toBeLessThanOrEqual(34);
      // 頭（臉那張）的最下一列 = 下巴；下巴以下（身體 + 腿）12–14 列
      let chin = 0; for (let y = 0; y < r.face!.h; y++) for (let x = 0; x < r.face!.w; x++) if (r.face!.on(x, y)) chin = y;
      expect(AV_FH - 1 - chin, `body ${body}`).toBeGreaterThanOrEqual(11);
      expect(AV_FH - 1 - chin, `body ${body}`).toBeLessThanOrEqual(14);
      expect((chin - top) / (AV_FH - top), `body ${body}`).toBeGreaterThanOrEqual(0.52);
    }
  });
  it('身體比頭窄很多：頭寬約是身寬的 2.5–3 倍（軀幹 7–10 寬）', () => {
    for (const body of [0, 1]) {
      const r = avatarFrame(plainLook({ ...bodyDefaults(body), hair: 0, acc: 0, ahoge: false }), 'idle', 0);
      const w = (b: Bmp, y: number): number => { let a = b.w, z = -1; for (let x = 0; x < b.w; x++) if (b.on(x, y)) { a = Math.min(a, x); z = Math.max(z, x); } return z < 0 ? 0 : z - a + 1; };
      const torso = w(r.body, 45), head = Math.max(...Array.from({ length: 10 }, (_, k) => w(r.head, 28 + k)));
      expect(torso, `body ${body}`).toBeGreaterThanOrEqual(7);
      expect(torso, `body ${body}`).toBeLessThanOrEqual(12);
      expect(head / torso, `body ${body}`).toBeGreaterThanOrEqual(2);
    }
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
    expect(hairPx(bare, 0, 22)).toBeGreaterThan(3);
    expect(hairPx(helm, 0, 22)).toBe(0);
    // 瀏海（額頭那一帶）還在
    // （瀏海用鮑伯頭看：刺蝟頭的瀏海本來就短）
    const helmB = avatarFrame({ ...plainLook({ ...a, hair: 0 }), head: piece('armor:iron') }, 'idle', 0).head;
    expect(hairPx(helmB, 29, 32)).toBeGreaterThan(1);
  });
  it('戴帽子 / 頭盔：九款髮型 × 男女 × 五個種族 × 待機 / 走路，帽沿以上露不出一格頭髮（魔女帽圓錐蓋不到的前半部頭頂也是；貓耳是髮色）', { timeout: 60_000 }, () => {
    const covers = [...SETS.map((s) => `armor:${s}`), ...[...HAT_HIDES_TOP].map((h) => `hat:${h}`)];
    for (const look of covers) {
      // 只認這頂帽子 / 頭盔本身沒用到的髮色
      const g = new Bmp(AV_FW, AV_FH);
      if (look.startsWith('armor:')) helmetArt(g, piece(look), AV_HEAD.x, AV_HEAD.y, 0); else hatArt(g, look.slice(4), AV_HEAD.x, AV_HEAD.y);
      const gc = new Set<string>(); for (let i = 0; i < g.px.length; i++) if (g.px[i] >>> 24) gc.add(Bmp.unpack(g.px[i]).join());
      for (let hair = 0; hair < HAIR_STYLES.length; hair++) for (const body of [0, 1]) for (const [an, f] of [['idle', 0], ['walk', 2], ['jump', 0]] as const) {
        for (const hc of [2, 7, 9]) for (let race = 0; race < RACES.length; race++) {
          const hr = new Set(hairRamp(hc).map((c) => c.join()).filter((c) => !gc.has(c)));
          const b = flatFrame(avatarFrame({ ...plainLook({ ...DEF, body, hair, hairColor: hc, ahoge: true, race }), head: piece(look) }, an, f));
          let n = 0;
          for (let y = 0; y < AV_HEAD.y + BRIM - 1 + (an === 'walk' ? 1 : 0); y++) for (let x = 0; x < AV_FW; x++) if (b.on(x, y) && hr.has(b.get(x, y).join())) n++;
          expect(n, `${look} hair ${hair} body ${body} ${an} color ${hc} race ${race}`).toBe(0);
        }
      }
    }
  });
  it('帽子 / 頭盔不會蓋到眼睛和嘴（護頰、鼻樑護條、帽沿都在臉的外面 / 上面；五個種族都是）', () => {
    const covers = [...SETS.map((s) => `armor:${s}`), ...['straw', 'witch', 'beret', 'maid', 'miner', 'flower'].map((h) => `hat:${h}`)];
    for (const body of [0, 1]) for (let race = 0; race < RACES.length; race++) {
      const a = { ...DEF, body, eyes: 3, race }, er = new Set([...eyeRamp(3).slice(0, 2), [140, 32, 56], [200, 52, 76]].map((c) => c.join()));
      const count = (b: Bmp): number => { let n = 0; for (let i = 0; i < b.px.length; i++) if (b.px[i] >>> 24 && er.has(Bmp.unpack(b.px[i]).join())) n++; return n; };
      const bare = count(avatarFrame(plainLook(a), 'idle', 0).face!);
      for (const look of covers) expect(count(avatarFrame({ ...plainLook(a), head: piece(look) }, 'idle', 0).face!), `${look} body ${body} race ${race}`).toBe(bare);
    }
  });
  it('戴任何帽子 / 頭盔：貓耳、龍角收起來，精靈耳留著但不高過帽沿（和人類比，多出來的像素都在帽沿以下）', () => {
    const covers = [...SETS.map((s) => `armor:${s}`), ...['straw', 'witch', 'beret', 'maid', 'miner', 'flower'].map((h) => `hat:${h}`)];
    const ID = (id: string): number => RACES.findIndex((r) => r.id === id);
    for (const look of covers) for (const body of [0, 1]) for (let hair = 0; hair < HAIR_STYLES.length; hair++) for (const [an, f] of [['idle', 0], ['walk', 2], ['jump', 0]] as const) {
      const at = (race: number): Bmp => flatFrame(avatarFrame({ ...plainLook({ ...DEF, body, hair, ahoge: true, race }), head: piece(look) }, an, f));
      const human = at(0), brim = AV_HEAD.y + BRIM + (an === 'walk' ? 1 : 0);
      for (const race of [ID('elf'), ID('catfolk'), ID('dragonkin')]) {
        const b = at(race);
        let above = 0, extra = 0;
        for (let y = 0; y < AV_FH; y++) for (let x = 0; x < AV_FW; x++) if (b.raw(x, y) !== human.raw(x, y)) { extra++; if (y < brim) above++; }
        expect(above, `${look} hair ${hair} body ${body} ${an} ${RACES[race].id}`).toBe(0);
        // 精靈戴帽子耳朵還在
        if (race === ID('elf')) expect(extra, `${look} hair ${hair} body ${body} ${an} elf ears`).toBeGreaterThan(6);
      }
    }
  });
  it('兜帽蓋住精靈耳：精靈戴兜帽和人類戴兜帽畫出來一模一樣（耳朵不會從兜帽兩側戳出來）', () => {
    const hood = ACCESSORIES.findIndex((a) => a.id === 'hood'), elf = RACES.findIndex((r) => r.id === 'elf');
    for (const body of [0, 1]) for (let hair = 0; hair < HAIR_STYLES.length; hair++) for (const [an, f] of [['idle', 0], ['walk', 2], ['jump', 0]] as const) {
      const at = (race: number): Bmp => flatFrame(avatarFrame(plainLook({ ...DEF, body, hair, acc: hood, race }), an, f));
      expect(diff(at(elf), at(0)), `hair ${hair} body ${body} ${an}`).toBe(0);
    }
  });
  it('貓族戴貓耳髮箍：不會有四隻耳朵（髮箍的耳朵不畫，頭頂上方和不戴一樣；人類戴髮箍則有耳朵）', () => {
    const cat = ACCESSORIES.findIndex((a) => a.id === 'catears'), catfolk = RACES.findIndex((r) => r.id === 'catfolk');
    // 頭頂上方（區域第 −2 列以上）只有髮箍的耳朵會畫到；箍子本身（含描邊）在第 −2 列以下
    const above = (a: Bmp, b: Bmp): number => { let n = 0; for (let y = 0; y < AV_HEAD.y - 2; y++) for (let x = 0; x < AV_FW; x++) if (a.raw(x, y) !== b.raw(x, y)) n++; return n; };
    for (const body of [0, 1]) for (const hair of [0, 1, 2]) {
      const at = (race: number, acc: number): Bmp => flatFrame(avatarFrame(plainLook({ ...DEF, body, hair, acc, race, ahoge: false }), 'idle', 0));
      expect(above(at(catfolk, cat), at(catfolk, 0)), `catfolk hair ${hair} body ${body}`).toBe(0);
      expect(above(at(0, cat), at(0, 0)), `human hair ${hair} body ${body}`).toBeGreaterThan(10);
    }
  });
  it('貓族 / 龍裔 × 頭飾（兜帽除外）：貓耳 / 龍角在頭飾前面——人類沒有、種族才長出來的耳 / 角像素（頭頂附近），戴頭飾後一格都不被蓋掉', () => {
    const ID = (id: string): number => RACES.findIndex((r) => r.id === id);
    const accs = ACCESSORIES.map((a, i) => [a.id, i] as const).filter(([id]) => id !== 'none' && id !== 'hood');
    const bad: string[] = [];
    for (const race of [ID('catfolk'), ID('dragonkin')]) for (const body of [0, 1]) for (const hair of [0, 1, 2]) for (const [an, f] of [['idle', 0], ['walk', 2], ['jump', 0]] as const) {
      const at = (r: number, acc: number): Bmp => flatFrame(avatarFrame(plainLook({ ...DEF, body, hair, acc, race: r, ahoge: false }), an, f));
      const human = at(0, 0), bare = at(race, 0);
      // 耳 / 角：人類那格透明、種族那格不透明；只看頭的區域第 3 列以上（尾巴在身體下面，不算）
      const ears: number[] = [];
      for (let y = 0; y < AV_HEAD.y + 3; y++) for (let x = 0; x < AV_FW; x++) if (!(human.raw(x, y) >>> 24) && bare.raw(x, y) >>> 24) ears.push(y * AV_FW + x);
      expect(ears.length, `${RACES[race].id} body ${body} ${an}`).toBeGreaterThan(10);
      for (const [id, acc] of accs) {
        const b = at(race, acc);
        const lost = ears.filter((i) => b.px[i] !== bare.px[i]).length;
        if (lost) bad.push(`${RACES[race].id} × ${id} hair ${hair} body ${body} ${an}${f}: ${lost}`);
        // 頭飾也不能整個躲到耳 / 角後面：和不戴相比至少差 8 格（皇冠 / 髮簪 / 小花 / 面具會換位置，見 avatarHead TOP_GAP）
        if (diff(b, bare) < 8) bad.push(`${RACES[race].id} × ${id} hair ${hair} body ${body} ${an}${f}: hidden (${diff(b, bare)})`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('每款髮型（含側分長瀏海）× 男女：兩隻眼睛都露出來（後眼完整、前眼最多被鬢髮 / 辮子蓋掉邊緣）', () => {
    const er = new Set(eyeRamp(3).slice(0, 2).map((c) => c.join()));
    const eyes = (body: number, hair: number): { back: number; front: number } => {
      const fc = avatarFrame(plainLook({ ...DEF, body, hair, eyes: 3, ahoge: true }), 'idle', 0).face!;
      // 後眼在頭的區域第 11–12 欄、前眼在第 17–19 欄：以第 15 欄分開
      const n = { back: 0, front: 0 };
      for (let y = 0; y < fc.h; y++) for (let x = 0; x < fc.w; x++) if (fc.on(x, y) && er.has(fc.get(x, y).join())) n[x < AV_HEAD.x + 15 ? 'back' : 'front']++;
      return n;
    };
    for (const body of [0, 1]) {
      const bob = eyes(body, 0);
      for (let hair = 0; hair < HAIR_STYLES.length; hair++) {
        const e = eyes(body, hair), id = HAIR_STYLES[hair].id;
        expect(e.back, `${id} body ${body} back eye`).toBe(bob.back);
        expect(e.front, `${id} body ${body} front eye`).toBeGreaterThanOrEqual(id === 'sidepart' ? bob.front : 2);
      }
    }
  });
  it('五個種族 × 男女：整張影格表只用色票、沒有半透明', () => {
    for (let race = 0; race < RACES.length; race++) for (const body of [0, 1]) clean(avatarSheet(plainLook({ ...DEF, body, race })).b, `race ${race} body ${body}`);
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
  it('wearOf uses tint over outfit defaults：同款不同 tint 像素不同；沒 tint = 款式原色', () => {
    const same = (a: Bmp, b: Bmp): boolean => a.px.every((v, i) => v === b.px[i]);
    for (const id of VANITY_ITEMS) {
      const v = ITEMS[id].vanity!, def = defaultTint(v.look);
      if (!def) continue;
      const at = (tint?: [number, number]): Bmp => pieceBmp({ ...plainLook(DEF), [v.slot]: { ...piece(v.look), ...(tint ? { tint } : {}) } }, v.slot);
      const base = at();
      expect(same(at([def[0], def[1]]), base), `${id} 原色`).toBe(true);
      const other: [number, number] = [(def[0] + 3) % CLOTH_RAMPS.length, (def[1] + 5) % CLOTH_RAMPS.length];
      const tinted = at(other);
      expect(same(tinted, base), `${id} 換色`).toBe(false);
      clean(tinted, id);
    }
    // 穿在身上的整格也一樣（不只圖示）
    const look = (tint?: [number, number]): DollLook => ({ ...plainLook(DEF), body: { ...piece('outfit:maid'), ...(tint ? { tint } : {}) } });
    expect(same(avatarFrame(look(), 'idle', 0).body, avatarFrame(look(OUTFITS[5].colors as [number, number]), 'idle', 0).body)).toBe(true);
    expect(same(avatarFrame(look(), 'idle', 0).body, avatarFrame(look([3, 7]), 'idle', 0).body)).toBe(false);
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
    // 軀幹第 3 列（3/4 正面的小身體）
    expect(width(mb, 44)).toBeGreaterThan(width(fb, 44));
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
    expect(n).toBeGreaterThan(45);
  });
});

describe('時裝物品重現外觀（服裝 / 飾品格 / 布衣）', () => {
  const h = (b: Bmp): string => { let x = 0x811c9dc5; for (const v of b.px) { x ^= v; x = Math.imul(x, 0x01000193) >>> 0; } return x.toString(16); };
  // Task 2 改飾品 / 服裝繪製之前（commit 5dc476ff）算出來的像素雜湊：沒戴飾品格、沒穿時裝時，畫出來和改版前一模一樣
  const PINS: Record<string, string> = {
    'acc:none:r0': 'adafd9bd/edb12567',
    'acc:none:r3': '13bfa636/73e7341a',
    'acc:ribbon:r0': '33371a29/4733ab2d',
    'acc:ribbon:r3': '883cd5b0/6593b962',
    'acc:catears:r0': '54d9aa11/58245783',
    'acc:catears:r3': '5e94adb8/7730701c',
    'acc:clip:r0': '4a423407/7acf5eb3',
    'acc:clip:r3': '708d19f4/dfc2524e',
    'acc:hood:r0': '6b7d95b0/9435e89a',
    'acc:hood:r3': 'c1004827/14074209',
    'acc:flower:r0': 'c844be89/8b04cc67',
    'acc:flower:r3': 'ac2b46b0/bbe4b28c',
    'acc:crown:r0': '22b6f94b/c7e727d',
    'acc:crown:r3': '85e212ce/6aeee97e',
    'acc:headphones:r0': 'ca45a423/8e0effcd',
    'acc:headphones:r3': '55f93fb2/6fecb31e',
    'acc:foxmask:r0': 'ba014af9/d94e61d9',
    'acc:foxmask:r3': '77ca4b67/4b988167',
    'acc:hairpin:r0': '6beb3ecf/a2661af5',
    'acc:hairpin:r3': 'c583ecd3/78a230b5',
    'glasses': 'e1354c6b',
    'outfit:explorer:b0': '72bc946a/2fbe7594',
    'outfit:explorer:b1': 'd35fbe8/dffe2239',
    'outfit:sailor:b0': '24723e9f/e4eb890e',
    'outfit:sailor:b1': 'b57c37d1/644ffa1c',
    'outfit:miko:b0': '22a6502c/461b805b',
    'outfit:miko:b1': '5289df6b/619fb10c',
    'outfit:hoodie:b0': '96e23e91/a232e0bd',
    'outfit:hoodie:b1': '21caa27f/cd33d4aa',
    'outfit:coat:b0': 'da4e6a64/66da0281',
    'outfit:coat:b1': 'c8456fdf/c6d9d2aa',
    'outfit:maid:b0': '1d1b0d7b/5e044995',
    'outfit:maid:b1': 'ead0e89a/6d22380a',
    'outfit:ninja:b0': 'b8c13214/465da479',
    'outfit:ninja:b1': '778f3417/bbaa6411',
    'outfit:mage:b0': '640e0874/8505e1cf',
    'outfit:mage:b1': 'ae515736/d1a9476d',
    'outfit:knight:b0': '3c616160/9d0e8a97',
    'outfit:knight:b1': 'c0e7c2e4/ff65afa7',
    'outfit:qipao:b0': '483cc89b/2c7d4d21',
    'outfit:qipao:b1': 'ce00808/94258798',
    'outfit:pirate:b0': 'b6cee086/675cc2d0',
    'outfit:pirate:b1': '991505ba/32ce937f',
    'outfit:idol:b0': 'cc1ddd27/28332c5c',
    'outfit:idol:b1': 'd4729978/a122abbc',
    'outfit:priest:b0': '4386a673/252cf3fd',
    'outfit:priest:b1': '5506a404/b1d8d1fd',
    'outfit:gothic:b0': '1df0396d/ba9d6759',
    'outfit:gothic:b1': 'c780b600/67417700',
    'icon:sailor_top': 'c801a6c5',
    'icon:miko_robe': '28de9b7b',
    'icon:maid_dress': 'e4984463',
    'icon:hoodie_top': '393e221b',
    'icon:travel_coat': '52d68dac',
    'icon:explorer_vest': '769aeae',
    'icon:sailor_skirt': '78652b8',
    'icon:miko_hakama': 'a56b8d4d',
    'icon:maid_skirt': 'f566bec8',
    'icon:hoodie_shorts': '2fabf5fc',
    'icon:coat_trousers': 'da1225ce',
    'icon:explorer_shorts': '1fc6cb41',
    'icon:straw_hat': 'afee8d28',
    'icon:witch_hat': '589b3f97',
    'icon:beret': '145b6ccf',
    'icon:maid_headdress': '1136c88e',
    'icon:flower_crown': 'f99a44ae',
    'icon:travel_cape': 'a3602d6c',
    'icon:feather_wings': 'c7c5bf5b',
    'icon:ribbon_bow': '140784f2',
    'icon:miner_helmet': 'edf8e45d',
  };
  it('改版前的像素釘住：外觀直接設頭飾 / 眼鏡 / 服裝、舊時裝的圖示都沒變', () => {
    const got: Record<string, string> = {};
    for (let a = 0; a < ACCESSORIES.length; a++) for (const race of [0, 3]) {
      const app = { ...DEF, acc: a, race, color1: 6, color2: 10 };
      got[`acc:${ACCESSORIES[a].id}:r${race}`] = h(flatFrame(avatarFrame(plainLook(app), 'idle', 0))) + '/' + h(flatFrame(avatarFrame(plainLook(app), 'swim', 1)));
    }
    got.glasses = h(flatFrame(avatarFrame(plainLook({ ...DEF, glasses: true }), 'idle', 0)));
    for (let o = 0; o < OUTFITS.length; o++) for (const body of [0, 1]) {
      if (OUTFITS[o].id === 'plain') continue;
      const l = plainLook({ ...DEF, body, outfit: o, color1: OUTFITS[o].colors[0], color2: OUTFITS[o].colors[1] });
      got[`outfit:${OUTFITS[o].id}:b${body}`] = h(flatFrame(avatarFrame(l, 'walk', 1))) + '/' + h(avatarArm(l, false));
    }
    for (const k of Object.keys(PINS)) if (k.startsWith('icon:')) got[k] = h(fashionIcon(k.slice(5) as ItemId)!);
    expect(got).toEqual(PINS);
  });
  const PLAIN = OUTFITS.findIndex((o) => o.id === 'plain');
  const same = (a: Bmp, b: Bmp): boolean => a.px.length === b.px.length && a.px.every((v, i) => v === b.px[i]);
  it('布衣 plain：畫得出來、只用色票、和其他服裝都不一樣（素面短衫 + 細腰繩 + 長褲）', () => {
    expect(PLAIN).toBe(OUTFITS.length - 1);
    for (const body of [0, 1]) clean(avatarSheet(plainLook({ ...DEF, body, outfit: PLAIN, color1: OUTFITS[PLAIN].colors[0], color2: OUTFITS[PLAIN].colors[1] })).b, `plain body ${body}`);
  });
  it('兩件服裝物品穿在布衣上 = 外觀直接選那套服裝 + 同色（整張影格表 + 兩隻手臂逐像素相同），原色和換色都一樣', { timeout: 120_000 }, () => {
    for (const o of OUTFITS) {
      if (o.id === 'plain') continue;
      const [top, bottom] = OUTFIT_ITEMS[o.id];
      for (const body of [0, 1]) for (const tint of [[o.colors[0], o.colors[1]], [3, 7]] as [number, number][]) {
        const direct = plainLook({ ...DEF, body, outfit: OUTFITS.indexOf(o), color1: tint[0], color2: tint[1] });
        const base = { ...DEF, body, outfit: PLAIN, color1: tint[0], color2: tint[1] };
        const worn: DollLook = { ...plainLook(base), body: { ...piece(ITEMS[top].vanity!.look), tint }, legs: { ...piece(ITEMS[bottom].vanity!.look), tint } };
        const what = `${o.id} body ${body} tint ${tint}`;
        expect(same(avatarSheet(worn).b, avatarSheet(direct).b), what).toBe(true);
        expect(same(avatarArm(worn, false), avatarArm(direct, false)), what).toBe(true);
        expect(same(avatarArm(worn, true), avatarArm(direct, true)), what).toBe(true);
      }
    }
  });
  it('飾品格的頭飾 / 眼鏡 = 外觀直接設那個頭飾 / 眼鏡（顏色用 accTintFromAppearance 轉成物品 tint）；各種族都一樣', { timeout: 120_000 }, () => {
    const ids = [...ACCESSORIES.filter((a) => a.id !== 'none').map((a) => a.id), 'glasses'];
    for (const id of ids) for (const race of [0, 3, 4]) for (const hair of [0, 1]) {
      const app = { ...DEF, race, hair, color1: 6, color2: 10 };
      const direct = plainLook(id === 'glasses' ? { ...app, glasses: true } : { ...app, acc: ACCESSORIES.findIndex((a) => a.id === id) });
      const t = accTintFromAppearance(id, app);
      const accPiece: DollPiece = { ...piece(ITEMS[ACC_ITEMS[id]].vanity!.look), ...(t ? { tint: t } : {}) };
      const worn: DollLook = { ...plainLook(app), acc: accPiece };
      expect(same(avatarSheet(worn).b, avatarSheet(direct).b), `${id} race ${race} hair ${hair}`).toBe(true);
    }
  });
  it('飾品格有東西時取代外觀的頭飾和眼鏡；戴帽子 / 頭盔照舊收起髮飾，但眼鏡照樣戴', () => {
    const crown = ACCESSORIES.findIndex((a) => a.id === 'crown'), ribbon = ACCESSORIES.findIndex((a) => a.id === 'ribbon');
    const cur = { ...DEF, acc: ribbon, glasses: true };
    const f = (l: DollLook): Bmp => flatFrame(avatarFrame(l, 'idle', 0));
    expect(same(f({ ...plainLook(cur), acc: piece('acc:crown') }), f(plainLook({ ...cur, acc: crown, glasses: false })))).toBe(true);
    expect(same(f({ ...plainLook(cur), acc: piece('acc:glasses') }), f(plainLook({ ...cur, acc: 0, glasses: true })))).toBe(true);
    for (const hat of [piece('hat:beret'), piece('armor:iron')]) {
      const bare = { ...DEF, acc: 0, glasses: false };
      expect(same(f({ ...plainLook(bare), head: hat, acc: piece('acc:crown') }), f({ ...plainLook(bare), head: hat })), hat.look).toBe(true);
      expect(same(f({ ...plainLook(bare), head: hat, acc: piece('acc:glasses') }), f({ ...plainLook({ ...bare, glasses: true }), head: hat })), hat.look).toBe(true);
      expect(same(f({ ...plainLook(bare), head: hat, acc: piece('acc:glasses') }), f({ ...plainLook(bare), head: hat })), hat.look).toBe(false);
    }
  });
  it('飾品格的顏色只改飾品：tint 和外觀主副色不同時，耳機換色，但雙馬尾的髮圈（外觀副色）不變', () => {
    // 雙馬尾後面那個髮圈畫在後髮（body 那張），耳機畫在 head 那張：body 那張要和沒戴飾品時一模一樣
    const app = { ...DEF, hair: 1, color1: 6, color2: 10, acc: 0 };
    const at = (t?: [number, number]) => avatarFrame(t ? { ...plainLook(app), acc: { ...piece('acc:headphones'), tint: t } } : plainLook(app), 'idle', 0);
    const bare = at(), a = at([5, 5]), b = at([3, 3]);
    expect(diff(a.head, b.head)).toBeGreaterThan(2);
    expect(diff(a.body, bare.body)).toBe(0);
    expect(diff(b.body, bare.body)).toBe(0);
    // 對照：外觀副色一換，後面那個髮圈（body 那張）就跟著變
    const tieOnly = (c2: number): Bmp => avatarFrame(plainLook({ ...app, outfit: OUTFITS.findIndex((o) => o.id === 'plain'), color1: 6, color2: c2 }), 'idle', 0).body;
    const noLegs = (x: Bmp): Bmp => { const o = x.clone(); for (let y = 38; y < o.h; y++) for (let xx = 0; xx < o.w; xx++) o.clear(xx, y); return o; };
    expect(diff(noLegs(tieOnly(10)), noLegs(tieOnly(3)))).toBeGreaterThan(0);
  });
  it('新時裝的圖示都有內容、只用色票、彼此都不一樣；飾品圖示穿在格子裡的顏色跟著 tint', () => {
    const seen = new Map<string, string>();
    for (const id of VANITY_ITEMS) {
      const k = fashionIcon(id)!.px.join();
      expect(seen.get(k), `${id} 和 ${seen.get(k)} 的圖示一樣`).toBeUndefined();
      seen.set(k, id);
    }
    for (const id of Object.values(ACC_ITEMS)) {
      const b = fashionIcon(id)!;
      expect(opaque(b), id).toBeGreaterThan(20);
      clean(b, id);
    }
    expect(same(fashionIcon('acc_ribbon', [5, 5])!, fashionIcon('acc_ribbon')!)).toBe(false);
  });
});
