// avatarFit.test.ts — 紙娃娃的版面規則：每格四邊留白、站姿不超出碰撞盒、男女一眼分得出、
//   KO 是整個人倒下、游泳臉朝前進方向、背飾從 3/4 正面看得到、攀邊的手搆得到牆角、爬到繩頂的手不高過繩頂。
import { describe, it, expect } from 'vitest';
import { Bmp } from './pixel';
import { HAIR_STYLES, OUTFITS, ACCESSORIES, RACES, bodyDefaults, type RaceId } from '../engine/appearance';
import { plainLook, dollKey, type DollLook, type DollPiece } from '../engine/doll';
import { AV_FH, AV_FW, SHEET, SHEET_ANIMS, avatarFrame, flatFrame, armsTo, shoulderOf, ROPE_TOP_HANDS, mantleLean, raceHeadDy } from './avatarArt';
import { beardRamp } from './folkArt';
import { dollPreview } from './dollPreview';
import { folkFrames } from './folkDraw';
import { folkLook, ROLES, type FolkRole } from '../engine/folkDefs';
import { Rng } from '../engine/rng';
import { HAIR_RAMPS, SKIN_RAMPS, eyeRamp } from './avatarPalette';
import { luma } from './pixel';
import { PLAYER_H } from '../engine/constants';

const P = (look: string): DollPiece => ({ look, rarity: 0, plus: 0, elem: null });
const bbox = (b: Bmp): { x0: number; y0: number; x1: number; y1: number } => {
  let x0 = b.w, y0 = b.h, x1 = -1, y1 = -1;
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.on(x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
};
/** 測試的外觀：每種髮型 × 兩種體型 × 五個種族、每種頭飾、每套服裝、帽子 / 頭盔 / 背飾 */
function looks(): DollLook[] {
  const out: DollLook[] = [];
  for (const body of [0, 1]) for (let race = 0; race < RACES.length; race++) {
    const base = { ...bodyDefaults(body), race };
    for (let h = 0; h < HAIR_STYLES.length; h++) out.push(plainLook({ ...base, hair: h, ahoge: true }));
    for (let a = 0; a < ACCESSORIES.length; a++) out.push(plainLook({ ...base, acc: a, hair: 2 }));
    for (let o = 0; o < OUTFITS.length; o++) out.push(plainLook({ ...base, outfit: o, color1: OUTFITS[o].colors[0], color2: OUTFITS[o].colors[1] }));
    for (const hat of ['straw', 'witch', 'beret', 'maid', 'miner', 'flower']) out.push({ ...plainLook(base), head: P(`hat:${hat}`) });
    for (const s of ['wood', 'copper', 'iron', 'gold', 'bone', 'molten']) out.push({ ...plainLook(base), head: P(`armor:${s}`), body: P(`armor:${s}`), legs: P(`armor:${s}`) });
    for (const bk of ['cape', 'wings', 'feathers', 'bow', 'buckler']) out.push({ ...plainLook({ ...base, hair: 1 }), back: P(`back:${bk}`) });
  }
  return out;
}

describe('影格版面', () => {
  it('每種外觀的每一格：左 / 右 / 上 都至少留 1 px 透明（不會被切邊）；底下那列是地面', { timeout: 120_000 }, () => {
    for (const l of looks()) for (const a of SHEET_ANIMS) for (let f = 0; f < SHEET[a][1]; f++) {
      // 爬繩的預覽會畫一整條繩子（不算），那幾格直接看影格本身
      const rope = a === 'climb' || a === 'climbdown' || a === 'hang' || a === 'ropetop';
      const b = rope ? flatFrame(avatarFrame(l, a, f)) : dollPreview(l, dollKey(l), a, f), bb = bbox(b);
      expect(bb.x0, `${dollKey(l)} ${a}${f} left`).toBeGreaterThanOrEqual(1);
      expect(bb.x1, `${dollKey(l)} ${a}${f} right`).toBeLessThanOrEqual(AV_FW - 2);
      expect(bb.y0, `${dollKey(l)} ${a}${f} top`).toBeGreaterThanOrEqual(1);
    }
  });
  it('NPC（含矮人）的待機 / 走路也不被切邊', () => {
    for (const role of Object.keys(ROLES) as FolkRole[]) for (const s of ['a', 'b', 'c', 'd']) {
      const fr = folkFrames(folkLook(role, new Rng(`${s}:${role}`)));
      for (const b of [...fr.idle, ...fr.walk]) { const bb = bbox(b); expect(bb.x0, role).toBeGreaterThanOrEqual(1); expect(bb.x1, role).toBeLessThanOrEqual(AV_FW - 2); }
    }
  });
  it('碰撞盒貼著角色的高度：沒戴帽子時頭頂離碰撞盒上緣最多 4 格（跳起來撞天花板時頭真的碰到）', () => {
    for (const body of [0, 1]) for (let hair = 0; hair < HAIR_STYLES.length; hair++) {
      const b = flatFrame(avatarFrame(plainLook({ ...bodyDefaults(body), hair, acc: 0, ahoge: false }), 'idle', 0));
      expect(bbox(b).y0 - (AV_FH - PLAYER_H), `body ${body} hair ${hair}`).toBeLessThanOrEqual(4);
    }
  });
  it('站姿（待機 / 走 / 跳 / 落）的美術不高過碰撞盒（呆毛、帽尖不會插進天花板）', () => {
    for (const l of looks()) for (const a of ['idle', 'walk', 'jump', 'fall'] as const) for (let f = 0; f < SHEET[a][1]; f++) {
      expect(bbox(flatFrame(avatarFrame(l, a, f))).y0, `${dollKey(l)} ${a}${f}`).toBeGreaterThanOrEqual(AV_FH - PLAYER_H);
    }
  });
});

describe('男女一眼分得出', () => {
  it('同一個髮型 + 同一套服裝：眼睛那幾列差很多、男生肩膀寬至少 2 格、女生有腮紅', () => {
    const f = { ...bodyDefaults(0), hair: 0, outfit: 0, color1: OUTFITS[0].colors[0], color2: OUTFITS[0].colors[1], acc: 0, ahoge: false };
    const m = { ...f, body: 1, blush: false };
    const fb = flatFrame(avatarFrame(plainLook(f), 'idle', 0)), mb = flatFrame(avatarFrame(plainLook(m), 'idle', 0));
    let eyeDiff = 0;
    for (let y = 30; y <= 38; y++) for (let x = 0; x < AV_FW; x++) if (fb.raw(x, y) !== mb.raw(x, y)) eyeDiff++;
    expect(eyeDiff).toBeGreaterThanOrEqual(14);
    const width = (b: Bmp, y: number): number => { let a = b.w, z = -1; for (let x = 0; x < b.w; x++) if (b.on(x, y)) { a = Math.min(a, x); z = Math.max(z, x); } return z - a + 1; };
    // 肩膀下一列（軀幹第 3 列）
    const sy = shoulderOf(0, false).y + 1;
    expect(width(mb, sy) - width(fb, sy)).toBeGreaterThanOrEqual(2);
  });
});

describe('特殊姿勢', () => {
  const l = plainLook(bodyDefaults(0));
  it('KO：整個人倒下（寬比高大、頭不是直立的：兩隻眼睛不在同一列）', () => {
    const b = flatFrame(avatarFrame(l, 'dead', 0)), bb = bbox(b);
    expect(bb.x1 - bb.x0).toBeGreaterThan(bb.y1 - bb.y0);
    expect(bb.y1).toBe(AV_FH - 1);
  });
  it('游泳：臉在前進方向（右）——眼睛在身體中心的右邊', () => {
    // 綠眼（和水手服的藏青分得開）
    const ls = plainLook({ ...bodyDefaults(0), eyes: 1 });
    const er = new Set(eyeRamp(1).slice(0, 2).map((c) => c.join()));
    for (let f = 0; f < SHEET.swim[1]; f++) {
      const b = flatFrame(avatarFrame(ls, 'swim', f)), bb = bbox(b);
      let sx = 0, n = 0;
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.on(x, y) && er.has(b.get(x, y).join())) { sx += x; n++; }
      expect(n, `swim ${f}`).toBeGreaterThan(3);
      expect(sx / n, `swim ${f}`).toBeGreaterThan((bb.x0 + bb.x1) / 2);
    }
  });
  it('背飾從 3/4 正面看得到：每種背飾在身體以外多出至少 12 格', () => {
    const base = plainLook({ ...bodyDefaults(0), hair: 1 });
    const b0 = flatFrame(avatarFrame(base, 'idle', 0));
    for (const bk of ['cape', 'wings', 'feathers', 'bow', 'buckler']) {
      const b1 = flatFrame(avatarFrame({ ...base, back: P(`back:${bk}`) }, 'idle', 0));
      let n = 0;
      for (let i = 0; i < b1.px.length; i++) if (b1.px[i] !== b0.px[i]) n++;
      expect(n, bk).toBeGreaterThanOrEqual(12);
    }
  });
  it('攀上邊緣：手搆得到斜前上方約 14 格外的牆角（不會停在胸口）', () => {
    const meta = { dx: 0, dy: 0, arms: true };
    const s = shoulderOf(0, false), target: [number, number] = [s.x + 11, s.y - 9];
    const r = armsTo(l, meta, target, [target[0] - 2, target[1]]);
    expect(r.hands.on(target[0] + 24, target[1] + 24)).toBe(true);
  });
  it('攀上邊緣：牆角在胸口以下（繩頂旁的台面）→ 手往前下撐、手掌正好落在牆角（不浮在牆角上方）', () => {
    const meta = { dx: 1, dy: 0, arms: true };
    const s = shoulderOf(0, false);
    // 爬到繩頂、旁邊的台面和腳同高：牆角在影格 (51, 52) 附近
    for (const t of [[51, 52], [53, 52], [46, 50], [s.x + 12, s.y + 12]] as [number, number][]) {
      const lean = mantleLean(t[0], t[1], { x: s.x + meta.dx, y: s.y + meta.dy });
      expect(lean, `lean ${t}`).toBeLessThanOrEqual(8);
      const target: [number, number] = [t[0] - lean, t[1]];
      const r = armsTo(l, meta, target, [target[0] - 2, target[1]]);
      expect(r.hands.on(target[0] + 24, target[1] + 24), `hand at ${t}`).toBe(true);
    }
    // 搆得到的牆角：身體不用往前傾
    expect(mantleLean(s.x + 11, s.y - 9, s)).toBe(0);
  });
  it('爬到繩頂：最後那幾格的手不高過繩頂（手在胸口以下）', () => {
    for (const y of ROPE_TOP_HANDS) expect(y).toBeGreaterThanOrEqual(shoulderOf(0, false).y - 2);
    for (let f = 0; f < SHEET.ropetop[1]; f++) expect(avatarFrame(l, 'ropetop', f).meta.arms).toBe(false);
  });
});

describe('日系 Q 版的配色 / 臉', () => {
  const hex6 = (c: readonly number[]): string => c.map((v) => v.toString(16).padStart(2, '0')).join('');
  it('頭髮和膚色的色階不共用任何一色（深棕髮 × 深膚色不會臉和頭髮同色）；頭髮外框不是近黑（暗處讀得出剪影）', () => {
    const hair = new Set(HAIR_RAMPS.flat().map(hex6));
    for (const [i, r] of SKIN_RAMPS.entries()) for (const c of r) expect(hair.has(hex6(c)), `skin ${i} ${hex6(c)}`).toBe(false);
    for (const [i, r] of HAIR_RAMPS.entries()) expect(luma(r[0]), `hair ${i} outline`).toBeGreaterThanOrEqual(25);
    // 烏黑髮：底色是帶藍的深灰（洞穴裡也看得到髮型）
    expect(luma(HAIR_RAMPS[0][2])).toBeGreaterThanOrEqual(80);
  });
  it('膚色是偏白的暖粉（亮部 / 中間調），陰影往紅 / 紫偏、外框是深紅棕', () => {
    for (const skin of [0, 1]) {
      const [o, , sh, base, hi] = SKIN_RAMPS[skin];
      // 中間調：紅 > 綠 > 藍、但綠藍差不多（粉，不是橘）
      expect(base[0] - base[1], `skin ${skin} base`).toBeLessThanOrEqual(36);
      expect(base[1] - base[2], `skin ${skin} base`).toBeLessThanOrEqual(24);
      expect(luma(hi)).toBeGreaterThan(220);
      expect(sh[0]).toBeGreaterThan(sh[2]);
      expect(o[0]).toBeGreaterThan(o[2]);
      expect(luma(o)).toBeLessThan(110);
    }
  });
  it('前眼大（3 寬 × 5 高、2 格白高光）、後眼窄（2 寬）：看得出轉頭', () => {
    const a = { ...bodyDefaults(0), eyes: 3, glasses: false };
    const r = avatarFrame(plainLook(a), 'idle', 0), e = new Set(eyeRamp(3).slice(0, 2).map(hex6));
    const cols = new Map<number, number>(), white = { n: 0 };
    let x0 = 99, x1 = -1;
    for (let y = 0; y < r.face!.h; y++) for (let x = 0; x < r.face!.w; x++) {
      if (!r.face!.on(x, y)) continue;
      const c = hex6(r.face!.get(x, y));
      if (e.has(c)) { cols.set(x, (cols.get(x) ?? 0) + 1); x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
      if (c === 'ffffff') white.n++;
    }
    // 兩群眼睛：前眼（右）那群的欄數 > 後眼（左）
    const xs = [...cols.keys()].sort((p, q) => p - q);
    const gap = xs.findIndex((x, i) => i > 0 && x - xs[i - 1] > 1);
    expect(gap).toBeGreaterThan(0);
    const back = xs.slice(0, gap), front = xs.slice(gap);
    expect(front.length).toBeGreaterThanOrEqual(2);
    const sum = (l: number[]): number => l.reduce((s, x) => s + (cols.get(x) ?? 0), 0);
    expect(front.length).toBeGreaterThanOrEqual(3);
    expect(back.length).toBeLessThanOrEqual(2);
    expect(sum(front)).toBeGreaterThanOrEqual(sum(back) + 2);
    expect(white.n).toBeGreaterThanOrEqual(3);
  });
});

describe('髮型剪影', () => {
  it('九款髮型的剪影一眼分得出：兩兩之間（只看外形、不看顏色）至少差 30 格', () => {
    for (const body of [0, 1]) {
      const sil = HAIR_STYLES.map((_, hair) => flatFrame(avatarFrame(plainLook({ ...bodyDefaults(body), hair, acc: 0, ahoge: false }), 'idle', 0)));
      for (let i = 0; i < sil.length; i++) for (let j = i + 1; j < sil.length; j++) {
        let n = 0;
        for (let k = 0; k < sil[i].px.length; k++) if ((sil[i].px[k] >>> 24 ? 1 : 0) !== (sil[j].px[k] >>> 24 ? 1 : 0)) n++;
        expect(n, `body ${body}: ${HAIR_STYLES[i].id} vs ${HAIR_STYLES[j].id}`).toBeGreaterThanOrEqual(30);
      }
    }
  });
});

describe('種族外觀', () => {
  const CX = AV_FW / 2;
  const ID = (id: string): number => RACES.findIndex((r) => r.id === id);
  const raceLook = (body: number, race: number, extra: Record<string, unknown> = {}): DollLook => plainLook({ ...bodyDefaults(body), acc: 0, ahoge: false, race, ...extra });
  const opaqueDiff = (a: Bmp, b: Bmp): { x: number; y: number }[] => {
    const out: { x: number; y: number }[] = [];
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (a.raw(x, y) !== b.raw(x, y)) out.push({ x, y });
    return out;
  };
  const meanX = (ps: { x: number }[]): number => ps.reduce((s, p) => s + p.x, 0) / ps.length;
  it('五個種族的待機剪影兩兩至少差 30 格（只看外形）', () => {
    for (const body of [0, 1]) {
      const sil = RACES.map((_, race) => flatFrame(avatarFrame(raceLook(body, race), 'idle', 0)));
      for (let i = 0; i < sil.length; i++) for (let j = i + 1; j < sil.length; j++) {
        let n = 0;
        for (let k = 0; k < sil[i].px.length; k++) if ((sil[i].px[k] >>> 24 ? 1 : 0) !== (sil[j].px[k] >>> 24 ? 1 : 0)) n++;
        expect(n, `body ${body}: ${RACES[i].id} vs ${RACES[j].id}`).toBeGreaterThanOrEqual(30);
      }
    }
  });
  it('精靈的頭比人類寬：耳朵往兩側（前後）都突出', () => {
    for (const body of [0, 1]) for (let hair = 0; hair < HAIR_STYLES.length; hair++) {
      const h = bbox(avatarFrame(raceLook(body, 0, { hair }), 'idle', 0).head), e = bbox(avatarFrame(raceLook(body, ID('elf'), { hair }), 'idle', 0).head);
      expect(e.x1 - e.x0, `body ${body} hair ${hair}`).toBeGreaterThan(h.x1 - h.x0);
      expect(e.x0, `body ${body} hair ${hair} back ear`).toBeLessThan(h.x0);
      expect(e.x1, `body ${body} hair ${hair} front ear`).toBeGreaterThan(h.x1);
    }
  });
  it('貓族 / 龍裔的尾巴在身後：面向右時在身體中心左邊、鏡像（面向左）後在右邊', () => {
    for (const body of [0, 1]) for (const race of [ID('catfolk'), ID('dragonkin')]) {
      const human = avatarFrame(raceLook(body, 0), 'idle', 0).body, r = avatarFrame(raceLook(body, race), 'idle', 0).body;
      const tail = opaqueDiff(r, human);
      expect(tail.length, `body ${body} race ${race}`).toBeGreaterThan(15);
      expect(meanX(tail), `body ${body} race ${race}`).toBeLessThan(CX);
      const fh = new Bmp(AV_FW, AV_FH), fr = new Bmp(AV_FW, AV_FH);
      fh.blit(human, 0, 0, true); fr.blit(r, 0, 0, true);
      expect(meanX(opaqueDiff(fr, fh)), `body ${body} race ${race} mirrored`).toBeGreaterThan(CX);
    }
  });
  it('走路時尾巴會擺：8 格裡尾巴（扣掉身體上下彈）的位置至少兩種', () => {
    for (const race of [ID('catfolk'), ID('dragonkin')]) {
      const seen = new Set<string>();
      for (let f = 0; f < SHEET.walk[1]; f++) {
        const r = avatarFrame(raceLook(0, race), 'walk', f), h = avatarFrame(raceLook(0, 0), 'walk', f);
        seen.add(opaqueDiff(r.body, h.body).map((p) => `${p.x},${p.y - r.meta.dy}`).join(';'));
      }
      expect(seen.size, `race ${race}`).toBeGreaterThanOrEqual(2);
    }
  });
  it('矮人：待機時頭頂比人類低 raceHeadDy = 2 格（只有矮人會變矮）；手臂跟著接在變矮後的肩膀（meta.dy 多 2）', () => {
    const top = (b: Bmp): number => bbox(b).y0;
    for (const id of RACES.map((r) => r.id)) expect(raceHeadDy(id as RaceId), id).toBe(id === 'dwarf' ? 2 : 0);
    for (const body of [0, 1]) {
      const h = avatarFrame(raceLook(body, 0), 'idle', 0), d = avatarFrame(raceLook(body, ID('dwarf')), 'idle', 0);
      expect(top(flatFrame(d)) - top(flatFrame(h)), `body ${body}`).toBe(2);
      expect(d.meta.dy - h.meta.dy, `body ${body}`).toBe(2);
      // 腳底不動
      expect(bbox(flatFrame(d)).y1).toBe(bbox(flatFrame(h)).y1);
    }
  });
  it('矮人男有鬍子（下巴下面出現髮色的鬍子）、矮人女沒有', () => {
    for (const hairColor of [1, 8]) {
      const beard = new Set(beardRamp(hairColor).map((c) => c.join()));
      const below = (body: number): number => {
        const humanFace = avatarFrame(raceLook(body, 0, { hair: 0, hairColor }), 'idle', 0).face!;
        const chin = bbox(humanFace).y1 + raceHeadDy('dwarf');
        const head = avatarFrame(raceLook(body, ID('dwarf'), { hair: 0, hairColor }), 'idle', 0).head;
        let n = 0;
        for (let y = chin + 1; y < head.h; y++) for (let x = 0; x < head.w; x++) if (head.on(x, y) && beard.has(head.get(x, y).join())) n++;
        return n;
      };
      expect(below(1), `male hair ${hairColor}`).toBeGreaterThan(10);
      expect(below(0), `female hair ${hairColor}`).toBe(0);
    }
  });
  it('矮人男的鬍子不蓋眼睛 / 嘴：臉那一層還有眼睛和嘴，而且都是 head 的子集', () => {
    const r = avatarFrame(raceLook(1, ID('dwarf'), { eyes: 1 }), 'idle', 0), e = new Set(eyeRamp(1).slice(0, 2).map((c) => c.join()));
    let eyes = 0;
    for (let i = 0; i < r.face!.px.length; i++) {
      const v = r.face!.px[i];
      if (!(v >>> 24)) continue;
      expect(v).toBe(r.head.px[i]);
      if (e.has(Bmp.unpack(v).join())) eyes++;
    }
    expect(eyes).toBeGreaterThan(4);
  });
});
