// avatarFit.test.ts — 紙娃娃的版面規則：每格四邊留白、站姿不超出碰撞盒、男女一眼分得出、
//   KO 是整個人倒下、游泳臉朝前進方向、背飾從 3/4 正面看得到、攀邊的手搆得到牆角、爬到繩頂的手不高過繩頂。
import { describe, it, expect } from 'vitest';
import { Bmp } from './pixel';
import { HAIR_STYLES, OUTFITS, ACCESSORIES, bodyDefaults } from '../engine/appearance';
import { plainLook, dollKey, type DollLook, type DollPiece } from '../engine/doll';
import { AV_FH, AV_FW, SHEET, SHEET_ANIMS, avatarFrame, flatFrame, armsTo, shoulderOf, ROPE_TOP_HANDS, mantleLean } from './avatarArt';
import { dollPreview } from './dollPreview';
import { folkFrames } from './folkDraw';
import { folkLook, ROLES, type FolkRole } from '../engine/folkDefs';
import { Rng } from '../engine/rng';
import { eyeRamp } from './avatarPalette';
import { PLAYER_H } from '../engine/constants';

const P = (look: string): DollPiece => ({ look, rarity: 0, plus: 0, elem: null });
const bbox = (b: Bmp): { x0: number; y0: number; x1: number; y1: number } => {
  let x0 = b.w, y0 = b.h, x1 = -1, y1 = -1;
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.on(x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
};
/** 測試的外觀：每種髮型 × 兩種體型、每種頭飾、帽子 / 頭盔 / 背飾 */
function looks(): DollLook[] {
  const out: DollLook[] = [];
  for (const body of [0, 1]) {
    const base = bodyDefaults(body);
    for (let h = 0; h < HAIR_STYLES.length; h++) out.push(plainLook({ ...base, hair: h, ahoge: true }));
    for (let a = 0; a < ACCESSORIES.length; a++) out.push(plainLook({ ...base, acc: a, hair: 2 }));
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
    for (let y = 22; y <= 33; y++) for (let x = 0; x < AV_FW; x++) if (fb.raw(x, y) !== mb.raw(x, y)) eyeDiff++;
    expect(eyeDiff).toBeGreaterThanOrEqual(14);
    const width = (b: Bmp, y: number): number => { let a = b.w, z = -1; for (let x = 0; x < b.w; x++) if (b.on(x, y)) { a = Math.min(a, x); z = Math.max(z, x); } return z - a + 1; };
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
