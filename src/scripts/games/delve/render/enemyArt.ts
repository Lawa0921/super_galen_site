// enemyArt.ts — 怪物 / 首領 / 投射物的手繪像素精靈（純 Bmp，無 DOM）。每種 2–4 格動畫、面向右、1px 描邊、
// 最後吸附到統一色票。形狀用基本圖形（橢圓 / 多邊形 / 粗線段肢體）組裝，再以 shadeMask 自動打光（左上受光）。
import { Bmp, INK, hex, luma, mix, ramp, shade, snap, type RGB } from './pixel';
import { R, shadeMask } from './combatArt';
import type { EnemyKind } from '../engine/enemies';

export interface EnemyFrames { frames: Bmp[]; /** 精靈底部對齊身體底部（地面型）或中心對齊（飛行型） */ anchor: 'bottom' | 'center'; }

// ── 基本圖形 ─────────────────────────────────────────────
type Pt = [number, number];
function inPoly(pts: Pt[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const ell = (cx: number, cy: number, rx: number, ry: number) => (x: number, y: number): boolean => {
  const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; return dx * dx + dy * dy <= 1;
};
const poly = (pts: Pt[]) => (x: number, y: number): boolean => inPoly(pts, x + 0.5, y + 0.5);
const seg = (x0: number, y0: number, x1: number, y1: number, half: number) => (x: number, y: number): boolean => {
  const px = x + 0.5 - x0, py = y + 0.5 - y0, dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / l2));
  return Math.hypot(px - t * dx, py - t * dy) <= half;
};
const or = (...ms: ((x: number, y: number) => boolean)[]) => (x: number, y: number): boolean => ms.some((m) => m(x, y));
/** 把 mask 以 pal 自動打光畫到 b 上（每個部件各自打光、各自描邊交給最後的 outline） */
function part(b: Bmp, m: (x: number, y: number) => boolean, pal: RGB[]): void {
  shadeMask(b, m, pal, { x0: 0, y0: 0, x1: b.w - 1, y1: b.h - 1 });
}
function px(b: Bmp, pts: readonly (readonly [number, number])[], c: RGB): void { for (const [x, y] of pts) b.set(x, y, c); }
const fin = (b: Bmp): Bmp => b.outline(INK);
const rad = (d: number): number => (d * Math.PI) / 180;
/** 粗線段肢體：從 (x,y) 以角度 deg（0 = 向下，正 = 往前）長 len */
function limbEnd(x: number, y: number, deg: number, len: number): Pt { return [x + Math.sin(rad(deg)) * len, y + Math.cos(rad(deg)) * len]; }

// ── 色階 ───────────────────────────────────────────────
const P = {
  frost: ramp('#2c4486', '#3e74c4', '#5c9ce0', '#94c8ee', '#cceaf8', '#ffffff', '#ffffff'),
  robe: ramp('#0c0a12', '#1c1424', '#2c2450', '#463c78', '#7a5a8c', '#b8788e', '#f2b888'),
  ghoul: ramp('#16301e', '#214528', '#3f7468', '#6a9c88', '#a2c8b0', '#cceaf8', '#ffffff'),
  owl: ramp('#1c1424', '#2a1810', '#472819', '#623924', '#7c4c2e', '#966139', '#c99660'),
  bat: ramp('#0c0a12', '#1c1424', '#2c2450', '#463c78', '#7a5a8c', '#b8788e', '#f2b888'),
  rock: ramp('#1c1424', '#2c2838', '#423f54', '#5e5e74', '#707490', '#858aa0', '#b4b9c8'),
  wolf: ramp('#2c2838', '#5e5e74', '#858aa0', '#b4b9c8', '#cceaf8', '#ffffff', '#ffffff'),
  sand: ramp('#2a1810', '#6c1e14', '#a83a10', '#e8701c', '#ffa93a', '#f2b888', '#fff4c0'),
  hornet: ramp('#2a1810', '#623924', '#b07a4b', '#ffa93a', '#ffd86a', '#fff4c0', '#ffffff'),
  vine: ramp('#16301e', '#214528', '#2d672e', '#468a34', '#67ab3c', '#93cc50', '#c2e478'),
  petal: ramp('#2c2450', '#6c1e14', '#a83a10', '#b8788e', '#f2b888', '#fff4c0', '#ffffff'),
  shroom: ramp('#18204a', '#1f6474', '#2c8692', '#4aaeb0', '#a2c8b0', '#cceaf8', '#ffffff'),
  stalk: ramp('#2a1810', '#623924', '#966139', '#c99660', '#d8ba76', '#f2e2b0', '#fff4c0'),
  bone: R.bone,
  iron: R.iron,
  hex: ramp('#0c0a12', '#2c2450', '#463c78', '#7a5a8c', '#b8788e', '#f2b888', '#fff4c0'),
  imp: ramp('#0c0a12', '#2a1810', '#6c1e14', '#a83a10', '#e8701c', '#ffa93a', '#ffd86a'),
  lava: R.lava,
  coal: ramp('#0c0a12', '#1c1424', '#2c2838', '#423f54', '#5e5e74', '#707490', '#858aa0'),
  cyan: R.cyan,
};
const EYE_Y = hex('#ffd86a'), EYE_W = hex('#fff4c0'), EYE_R = hex('#e8701c'), EYE_C = hex('#cceaf8');
/** 眼睛用色（暗處剪影保留原色 → 黑暗裡看得到眼睛閃光） */
export const EYE_COLORS: readonly RGB[] = [EYE_Y, EYE_W, EYE_R, EYE_C];

// ── 凝膠團 / 霜凝膠 ───────────────────────────────────────
function blob(pal: RGB[], frost: boolean): Bmp[] {
  const shapes: [number, number][] = [[7, 5.5], [8.2, 4.6], [6, 6.8], [8.8, 4]];
  return shapes.map(([rx, ry]) => {
    const b = new Bmp(20, 16);
    const cy = 16 - ry - 0.5;
    part(b, ell(10, cy, rx, ry), pal);
    // 半透明的核心（較暗）+ 高光
    part(b, ell(9, cy + 1, rx * 0.45, ry * 0.42), pal.map((c) => mix(c, pal[1], 0.35)) as RGB[]);
    b.set(Math.round(10 - rx * 0.55), Math.round(cy - ry * 0.55), pal[6]);
    b.set(Math.round(10 - rx * 0.55) + 1, Math.round(cy - ry * 0.55), pal[5]);
    // 眼睛（面向右）
    const ex = Math.round(10 + rx * 0.25), ey = Math.round(cy - ry * 0.15);
    b.rect(ex, ey, 1, 2, INK); b.rect(ex + 3, ey, 1, 2, INK);
    if (frost) { px(b, [[10, Math.round(cy - ry) - 1], [9, Math.round(cy - ry)], [11, Math.round(cy - ry)], [10, Math.round(cy - ry) - 2]], P.frost[5]); }
    return fin(b);
  });
}

// ── 人形（夜行屍 / 孢行者 / 骸骨戰士 / 燼角魔） ──────────────
interface HumanPose { legA: number; legB: number; armA: number; armB: number; bob: number; }
const WALK: HumanPose[] = [
  { legA: 22, legB: -22, armA: 70, armB: 60, bob: 0 },
  { legA: 6, legB: -6, armA: 74, armB: 66, bob: -1 },
  { legA: -22, legB: 22, armA: 66, armB: 74, bob: 0 },
  { legA: -6, legB: 6, armA: 72, armB: 64, bob: -1 },
];
function nightWalker(): Bmp[] {
  return WALK.map((p) => {
    const b = new Bmp(22, 42), hip = 26 + p.bob;
    const leg = (d: number, dark: boolean): void => { const e = limbEnd(10, hip, d, 14); part(b, seg(10, hip, e[0], e[1], 1.6), dark ? P.ghoul.map((c) => mix(c, P.ghoul[0], 0.3)) as RGB[] : P.ghoul); };
    leg(p.legB, true);
    const arm = (d: number, dark: boolean): void => { const s: Pt = [11, 15 + p.bob]; const e = limbEnd(s[0], s[1], d, 12); part(b, seg(s[0], s[1], e[0], e[1], 1.5), dark ? P.ghoul.map((c) => mix(c, P.ghoul[0], 0.35)) as RGB[] : P.ghoul); };
    arm(p.armB, true);
    // 破爛長袍（頭罩 + 身體到膝下，下襬鋸齒）
    const robe = poly([[6, 12 + p.bob], [15, 12 + p.bob], [16, 30 + p.bob], [14, 33], [12, 31], [10, 34], [8, 31], [5, 33], [4, 30 + p.bob]]);
    part(b, robe, P.robe);
    part(b, ell(10.5, 9 + p.bob, 5, 5.5), P.robe);
    // 臉（頭罩裡）+ 發光的眼
    part(b, ell(12, 10 + p.bob, 3, 3.4), P.ghoul);
    b.set(13, 9 + p.bob, EYE_Y); b.set(14, 9 + p.bob, EYE_Y); b.set(11, 9 + p.bob, EYE_Y);
    b.set(13, 12 + p.bob, P.ghoul[1]);
    for (const x of [7, 9, 13]) b.set(x, 22 + p.bob, P.robe[1]);
    leg(p.legA, false);
    arm(p.armA, false);
    return fin(b);
  });
}
function sporeWalker(): Bmp[] {
  return WALK.map((p) => {
    const b = new Bmp(24, 34), hip = 24 + p.bob;
    const leg = (d: number): void => { const e = limbEnd(12, hip, d * 0.7, 8); part(b, seg(12, hip, e[0], e[1], 2.2), P.stalk); };
    leg(p.legB);
    part(b, ell(12, 18 + p.bob, 5.5, 7), P.stalk);   // 肥胖的菇柄身體
    const arm = (d: number): void => { const e = limbEnd(14, 15 + p.bob, d - 40, 8); part(b, seg(14, 15 + p.bob, e[0], e[1], 1.6), P.stalk); };
    leg(p.legA);
    // 菌傘：寬扁半圓 + 下緣菌褶
    part(b, (x, y) => ell(12, 10 + p.bob, 11, 7)(x, y) && y <= 10 + p.bob, P.shroom);
    for (let x = 3; x <= 21; x += 2) b.set(x, 11 + p.bob, P.shroom[1]);
    for (const [x, y] of [[7, 6], [12, 4], [16, 7], [10, 8], [18, 9]] as const) b.set(x, y + p.bob, P.shroom[6]);
    // 臉
    b.set(14, 15 + p.bob, INK); b.set(16, 15 + p.bob, INK); b.set(15, 18 + p.bob, P.stalk[1]);
    arm(p.armA);
    return fin(b);
  });
}
function boneKnight(): Bmp[] {
  return WALK.map((p) => {
    const b = new Bmp(26, 44), hip = 27 + p.bob, B = P.bone;
    const legs = (d: number, dark: boolean): void => {
      const k = limbEnd(12, hip, d, 8), e = limbEnd(k[0], k[1], d * 0.5, 8);
      const pal = dark ? B.map((c) => mix(c, B[0], 0.3)) as RGB[] : B;
      part(b, seg(12, hip, k[0], k[1], 1.2), pal); part(b, seg(k[0], k[1], e[0], e[1], 1.2), pal);
      part(b, ell(e[0] + 1.5, e[1] + 0.5, 2.6, 1.3), P.iron);
    };
    legs(p.legB, true);
    // 後手：短劍
    const se = limbEnd(14, 16 + p.bob, 40, 9);
    part(b, seg(14, 16 + p.bob, se[0], se[1], 1.1), B.map((c) => mix(c, B[0], 0.3)) as RGB[]);
    part(b, seg(se[0], se[1], se[0] + 7, se[1] - 6, 0.9), P.iron);
    // 骨盆 + 脊椎 + 肋骨
    part(b, ell(12, hip, 3.5, 2), B);
    part(b, seg(12, hip, 12, 15 + p.bob, 1), B);
    part(b, ell(12, 19 + p.bob, 5, 4.5), B);
    for (const y of [17, 19, 21]) for (let x = 8; x <= 16; x++) if (x !== 12 && b.on(x, y + p.bob)) b.set(x, y + p.bob, INK);
    // 頭：頭骨 + 鐵盔
    part(b, ell(13, 9 + p.bob, 4.6, 5), B);
    part(b, (x, y) => ell(13, 8 + p.bob, 5.2, 5)(x, y) && y <= 7 + p.bob, P.iron);
    b.rect(14, 9 + p.bob, 2, 2, INK); b.rect(11, 9 + p.bob, 2, 2, INK);
    b.set(14, 9 + p.bob, EYE_R);
    b.rect(12, 12 + p.bob, 4, 1, INK); b.set(13, 12 + p.bob, B[4]);
    legs(p.legA, false);
    // 前手：圓盾
    part(b, ell(16, 22 + p.bob, 5, 6), P.iron);
    part(b, ell(16, 22 + p.bob, 2, 2.4), R.red);
    return fin(b);
  });
}
function emberImp(): Bmp[] {
  const poses = [{ arm: 60, bob: 0, cast: false }, { arm: 64, bob: -1, cast: false }, { arm: 150, bob: -1, cast: true }];
  return poses.map((p) => {
    const b = new Bmp(24, 32), hip = 21 + p.bob;
    // 尾巴
    part(b, or(seg(8, hip, 3, hip - 4, 1), seg(3, hip - 4, 2, hip - 9, 0.8)), P.imp);
    b.set(1, hip - 11, P.lava[4]); b.set(2, hip - 10, P.lava[3]);
    for (const d of [18, -16]) { const e = limbEnd(11, hip, d, 9); part(b, seg(11, hip, e[0], e[1], 1.7), P.imp); }
    part(b, ell(11.5, 16 + p.bob, 4.5, 6), P.imp);
    // 頭 + 角
    part(b, ell(12.5, 8 + p.bob, 4.8, 4.4), P.imp);
    part(b, poly([[9, 5 + p.bob], [7, -0.5 + p.bob + 1], [10.5, 4 + p.bob]]), P.coal);
    part(b, poly([[14.5, 4 + p.bob], [17, 0.5 + p.bob], [16, 5 + p.bob]]), P.coal);
    b.rect(13, 7 + p.bob, 2, 2, P.lava[4]); b.set(16, 7 + p.bob, P.lava[4]); b.set(14, 7 + p.bob, P.lava[6]);
    b.rect(13, 11 + p.bob, 3, 1, INK);
    // 手（施法時舉高、手心火光）
    const e = limbEnd(13, 13 + p.bob, p.arm, 8);
    part(b, seg(13, 13 + p.bob, e[0], e[1], 1.4), P.imp);
    if (p.cast) { part(b, ell(e[0], e[1] - 1.5, 2.6, 2.6), P.lava); b.set(Math.round(e[0]), Math.round(e[1] - 2), P.lava[6]); }
    return fin(b);
  });
}

// ── 飛行（暗羽梟 / 穴蝠 / 熔岩蝠 / 刺翅蜂 / 燈靈） ──────────
function bat(pal: RGB[], lava: boolean): Bmp[] {
  const tips = [-1, 4, 9];
  return tips.map((ty) => {
    const b = new Bmp(20, 14);
    const wing = (dir: 1 | -1): void => {
      const x0 = 10 + dir * 2;
      part(b, poly([[x0, 5], [x0 + dir * 8, ty], [x0 + dir * 9, ty + 3], [x0 + dir * 6, ty + 5], [x0 + dir * 4, 9], [x0, 9]].map(([x, y]) => [x, Math.max(0, y)] as Pt)), pal.map((c) => mix(c, pal[0], 0.2)) as RGB[]);
      b.line(x0, 6, x0 + dir * 8, Math.max(0, ty), pal[4]);
    };
    wing(-1); wing(1);
    part(b, ell(10, 7.5, 3, 3.6), pal);
    px(b, [[8, 3], [12, 3], [8, 4], [12, 4]], pal[3]);
    b.set(9, 7, lava ? EYE_Y : EYE_R); b.set(11, 7, lava ? EYE_Y : EYE_R);
    if (lava) for (const [x, y] of [[9, 9], [10, 10], [11, 8]] as const) b.set(x, y, P.lava[3]);
    return fin(b);
  });
}
function owl(): Bmp[] {
  const fr = [{ wy: -2, dive: false }, { wy: 5, dive: false }, { wy: 11, dive: false }, { wy: 4, dive: true }];
  return fr.map((f) => {
    const b = new Bmp(26, 18), O = P.owl;
    if (!f.dive) {
      for (const dir of [-1, 1] as const) {
        const x0 = 13 + dir * 3;
        part(b, poly([[x0, 6], [x0 + dir * 10, Math.max(0, f.wy)], [x0 + dir * 11, Math.max(0, f.wy) + 3], [x0 + dir * 4, 12], [x0, 12]]), O.map((c) => mix(c, O[0], 0.15)) as RGB[]);
        for (let k = 0; k < 3; k++) b.set(x0 + dir * (6 + k), Math.max(0, f.wy) + 3 + k, O[2]);
      }
    } else part(b, poly([[8, 6], [20, 9], [9, 13]]), O);
    part(b, ell(13, 10, 4.5, 5.5), O);
    // 臉盤 + 大眼 + 喙
    part(b, ell(14.5, 7.5, 3.6, 3), P.stalk);
    b.rect(13, 7, 2, 2, EYE_Y); b.rect(16, 7, 2, 2, EYE_Y); b.set(14, 8, INK); b.set(17, 8, INK);
    b.set(16, 10, P.hornet[3]);
    px(b, [[11, 3], [17, 3], [12, 4], [16, 4]], O[3]);
    for (const [x, y] of [[11, 12], [13, 13], [12, 14]] as const) b.set(x, y, O[2]);
    return fin(b);
  });
}
function hornet(): Bmp[] {
  return [0, 1, 2].map((k) => {
    const b = new Bmp(22, 20), H = P.hornet;
    // 翅膀（透明感的淺藍）
    const wy = k === 1 ? 6 : 1;
    part(b, ell(9, wy + 3, 4, 3), ramp('#7f9cc4', '#94c8ee', '#94c8ee', '#cceaf8', '#cceaf8', '#ffffff', '#ffffff'));
    part(b, ell(13, wy + 4, 3.4, 2.6), ramp('#7f9cc4', '#94c8ee', '#94c8ee', '#cceaf8', '#cceaf8', '#ffffff', '#ffffff'));
    // 腹部（條紋）+ 毒刺
    part(b, ell(7, 12, 5, 3.6), H);
    for (const x of [4, 7]) for (let y = 9; y <= 15; y++) if (b.on(x, y)) b.set(x, y, INK);
    part(b, poly([[2, 12], [-0.5, 15], [3, 13.5]]), P.coal);
    // 胸 + 頭 + 觸角 + 大眼
    part(b, ell(12.5, 11, 2.8, 2.6), H.map((c) => mix(c, H[0], 0.4)) as RGB[]);
    part(b, ell(16.5, 10, 3, 2.8), H);
    b.rect(17, 9, 2, 2, INK); b.set(18, 9, EYE_R);
    b.line(17, 7, 19, 4, INK);
    for (const d of [-1, 1]) b.line(12 + d, 13, 12 + d * 2, 16 + (k === 2 ? 1 : 0), INK);
    if (k === 2) b.set(1, 15, H[5]);
    return fin(b);
  });
}
function wisp(): Bmp[] {
  return [0, 1].map((k) => {
    const b = new Bmp(14, 16), C = P.cyan;
    part(b, or(ell(7, 10, 4.2, 4.2), poly([[3.5, 9], [7 + (k ? 1.5 : -1.5), 0.5], [10.5, 9]])), C);
    part(b, ell(7, 10.5, 2, 2.2), ramp('#4aaeb0', '#a2c8b0', '#cceaf8', '#ffffff', '#ffffff', '#ffffff', '#ffffff'));
    b.set(6, 10, INK); b.set(8, 10, INK);
    return fin(b);
  });
}
function skull(): Bmp[] {
  return [0, 1, 2].map((k) => {
    const b = new Bmp(22, 24), B = P.bone, X = P.hex;
    // 紫色咒焰（頭頂往上飄）
    const fl = [[[5, 10], [7, 1 + k], [10, 8], [12, 0 + ((k + 1) % 3)], [14, 8], [16, 2 + ((k + 2) % 3)], [17, 10]]][0] as Pt[];
    part(b, poly([...fl, [17, 12], [5, 12]]), X);
    part(b, ell(11, 14, 6.5, 6), B);
    part(b, ell(11, 19, 4.2, 2.6), B);
    b.rect(7, 13, 3, 3, INK); b.rect(12, 13, 3, 3, INK);
    b.set(8, 14, X[5]); b.set(13, 14, X[5]);
    b.set(10, 17, INK); b.set(11, 17, INK);
    for (let x = 8; x <= 14; x += 2) b.set(x, 20, INK);
    return fin(b);
  });
}

// ── 地面多足（霜牙狼 / 赤砂蠍 / 岩甲蟹） ─────────────────────
function wolf(): Bmp[] {
  const legs = [[25, -20, -15, 20], [8, -6, 5, -8], [-20, 25, 20, -15], [-6, 8, -8, 5], [-35, -35, 40, 40]];
  return legs.map((l, k) => {
    const b = new Bmp(34, 22), W = P.wolf, leap = k === 4;
    const by = leap ? 9 : 10;
    const leg = (x: number, d: number, dark: boolean): void => {
      const e = limbEnd(x, by + 3, d, 8);
      part(b, seg(x, by + 3, e[0], e[1], 1.4), dark ? W.map((c) => mix(c, W[0], 0.35)) as RGB[] : W);
    };
    leg(9, l[1], true); leg(23, l[3], true);
    // 尾巴
    part(b, seg(5, by - 1, 1, by + (leap ? -3 : 3), 1.6), W);
    // 身體
    part(b, ell(16, by + 1, 10, 4.6), W);
    for (let x = 10; x < 22; x += 3) b.set(x, by - 2, W[2]);
    // 頭：口鼻往右
    part(b, ell(26, by - 2, 4.4, 3.8), W);
    part(b, poly([[27, by - 3], [33, by - 1], [32, by + 1], [27, by + 1]]), W);
    part(b, poly([[23, by - 5], [24, by - 10], [26.5, by - 5]]), W);
    b.set(28, by - 3, P.frost[1]); b.set(33, by - 1, INK);
    b.set(30, by + 1, EYE_W); b.set(31, by + 1, EYE_W);
    leg(11, l[0], false); leg(25, l[2], false);
    return fin(b);
  });
}
function scorpion(): Bmp[] {
  return [0, 1, 2].map((k) => {
    const b = new Bmp(32, 20), Sd = P.sand;
    const strike = k === 2;
    // 尾巴：一節節往上彎，前端毒針
    const tail: Pt[] = strike ? [[7, 12], [4, 8], [5, 4], [9, 2], [14, 3]] : [[7, 12], [3, 9], [3, 5], [6, 2], [10, 2]];
    for (let i = 0; i < tail.length; i++) part(b, ell(tail[i][0], tail[i][1], 2.4 - i * 0.2, 2.2 - i * 0.2), Sd);
    const tip = tail[tail.length - 1];
    part(b, poly([[tip[0], tip[1] - 1], [tip[0] + 4, tip[1] + 1], [tip[0], tip[1] + 2]]), P.coal);
    // 腳（三對）
    for (let i = 0; i < 3; i++) {
      const x = 11 + i * 4, sw = ((k + i) % 2 ? 1 : -1) * 2;
      b.line(x, 14, x - 2 + sw, 18, Sd[1]); b.line(x + 1, 14, x + 3 + sw, 18, Sd[2]);
    }
    // 身體節
    part(b, ell(15, 13, 8, 3.4), Sd);
    for (const x of [11, 15, 19]) b.set(x, 11, Sd[2]);
    // 鉗子
    for (const dy of [0, 3]) {
      part(b, seg(21, 12 + dy, 26, 10 + dy, 1.2), Sd);
      part(b, poly([[25, 7 + dy], [30, 8 + dy], [28.5, 10.5 + dy], [25, 11 + dy]]), Sd);
      b.set(28, 10 + dy, INK);
    }
    b.set(22, 11, EYE_Y); b.set(23, 12, INK);
    return fin(b);
  });
}
function crab(): Bmp[] {
  return [0, 1, 2].map((k) => {
    const b = new Bmp(26, 18), Rk = P.rock, Lg = R.red;
    for (let i = 0; i < 3; i++) for (const d of [-1, 1] as const) {
      const x = 13 + d * (4 + i * 2), sw = (k + i) % 2 ? 1 : 0;
      b.line(x, 12, x + d * (2 + sw), 17, Lg[2]);
    }
    // 鉗子（衝刺時張開）
    for (const d of [-1, 1] as const) {
      const cx = 13 + d * 9.5;
      part(b, ell(cx, 9, 2.8, 2.4), Lg);
      if (k === 2) { b.set(Math.round(cx + d * 2), 7, INK); b.set(Math.round(cx + d * 3), 7, Lg[4]); }
      else b.set(Math.round(cx + d), 8, INK);
    }
    // 岩石殼
    part(b, (x, y) => ell(13, 12, 8, 7)(x, y) && y <= 12, Rk);
    for (const [x, y] of [[9, 8], [13, 6], [16, 9], [11, 10], [15, 11]] as const) b.set(x, y, Rk[2]);
    b.set(10, 6, Rk[6]);
    b.rect(5, 12, 16, 1, Lg[2]);
    b.set(16, 4, EYE_Y); b.set(18, 5, EYE_Y); b.set(16, 5, INK); b.set(18, 6, INK);
    return fin(b);
  });
}

// ── 噬花藤（頭） ─────────────────────────────────────────
function snapHead(): Bmp[] {
  return [6, 22, 40].map((open) => {
    const b = new Bmp(24, 24), V = P.vine;
    const Rd = ramp('#2a1810', '#6c1e14', '#a83a10', '#e8701c', '#b8788e', '#f2b888', '#fff4c0');
    // 後方的葉片（左上 / 左下）
    part(b, ell(5, 6, 4.5, 2.5), V);
    part(b, ell(5, 18, 4.5, 2.5), V);
    // 球形花苞頭；往右的嘴（楔形缺口，張開角度 open）
    const half = rad(open / 2);
    const mouth = (x: number, y: number): boolean => {
      const dx = x + 0.5 - 10, dy = y + 0.5 - 12;
      return dx > 0 && Math.abs(Math.atan2(dy, dx)) < half;
    };
    part(b, (x, y) => ell(12, 12, 9, 8.5)(x, y) && !mouth(x, y), Rd);
    // 斑點 + 嘴內（暗）+ 牙齒
    for (const [x, y] of [[7, 7], [10, 5], [6, 14], [9, 18], [13, 19], [14, 4]] as const) if (b.on(x, y)) b.set(x, y, Rd[5]);
    for (let r = 2; r <= 8; r += 2) for (const s of [-1, 1]) {
      const a = half * s, tx = Math.round(10 + Math.cos(a) * r), ty = Math.round(12 + Math.sin(a) * r - s);
      if (b.on(tx, ty)) b.set(tx, ty, EYE_W);
    }
    b.set(12, 8 - Math.round(open / 20), INK);
    return fin(b);
  });
}

// ── 首領：燈脈守望者 ─────────────────────────────────────
/** 巨大的鐵籠燈：頂環 + 頂蓋、四根籠條、玻璃內的青色燈芯（有一道豎瞳）、底座。
 *  phase 2：籠條斷裂彎折、燈芯外溢成更大的焰、蓋子裂開帶熔紅。 */
function warden(phase: 1 | 2): Bmp[] {
  return [0, 1, 2].map((k) => {
    const W = 64, H = 74, b = new Bmp(W, H), I = P.coal, C = P.cyan;
    const cx = 32;
    // 頂環 + 吊鍊
    part(b, or(ell(cx, 5, 5, 4.5)), I);
    for (let y = 3; y <= 7; y++) for (let x = cx - 2; x <= cx + 2; x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - 5) < 2.4) b.clear(x, y);
    // 頂蓋（梯形）
    part(b, poly([[cx - 10, 10], [cx + 10, 10], [cx + 20, 19], [cx - 20, 19]]), I);
    b.rect(cx - 21, 19, 42, 3, I[4]);
    // 玻璃 + 燈芯
    const glass = poly([[cx - 18, 22], [cx + 18, 22], [cx + 16, 56], [cx - 16, 56]]);
    part(b, glass, ramp('#0c0a12', '#18204a', '#18204a', '#1f6474', '#1f6474', '#2c8692', '#4aaeb0'));
    const fr = phase === 2 ? 1.25 : 1;
    const flick = [0, 1.5, -1][k];
    part(b, or(ell(cx, 42, 9 * fr, 10 * fr), poly([[cx - 7 * fr, 38], [cx + flick, 24 - (fr - 1) * 12], [cx + 7 * fr, 38]])), C);
    part(b, ell(cx, 43, 5 * fr, 6 * fr), ramp('#4aaeb0', '#a2c8b0', '#cceaf8', '#ffffff', '#ffffff', '#ffffff', '#ffffff'));
    // 豎瞳（守望之眼）
    b.rect(cx - 1, 39, 2, 9, INK); b.set(cx, 38, INK); b.set(cx - 1, 48, INK);
    if (phase === 2) { b.rect(cx - 1, 41, 2, 4, P.lava[3]); }
    // 籠條
    const bars = [cx - 17, cx - 6, cx + 5, cx + 16];
    bars.forEach((x, i) => {
      if (phase === 1) part(b, seg(x + 0.5, 22, x + 0.5 - (i < 2 ? -1 : 1) * 0.5, 56, 1.5), I);
      else {
        // 斷成兩截、往外彎
        const d = i < 2 ? -1 : 1;
        part(b, seg(x + 0.5, 22, x + 0.5 + d * 3, 33 + (i % 2) * 4, 1.5), I);
        part(b, seg(x + 0.5 + d * 1, 47 - (i % 2) * 3, x + 0.5, 56, 1.5), I);
      }
    });
    // 橫箍
    if (phase === 1) b.rect(cx - 18, 38, 36, 2, I[3]);
    // 底座
    part(b, poly([[cx - 18, 56], [cx + 18, 56], [cx + 12, 64], [cx - 12, 64]]), I);
    part(b, ell(cx, 67, 5, 4), I);
    b.set(cx, 70, I[4]);
    // 金色鉚釘
    for (const x of [cx - 15, cx - 5, cx + 5, cx + 15]) { b.set(x, 15, R.gold[4]); b.set(x, 59, R.gold[4]); }
    if (phase === 2) {
      // 蓋子裂縫透出熔紅 + 外溢的火星
      for (const [x, y] of [[cx - 8, 13], [cx - 7, 14], [cx - 6, 15], [cx + 9, 16], [cx + 10, 17], [cx - 3, 60], [cx - 2, 61]] as const) b.set(x, y, P.lava[3]);
      for (const [x, y] of [[cx - 22, 30 + k * 2], [cx + 22, 28 - k], [cx - 20, 50 - k], [cx + 21, 46 + k]] as const) b.set(x, y, C[5]);
    }
    return fin(b);
  });
}

// ── 對外 ───────────────────────────────────────────────
let CACHE: Record<EnemyKind, EnemyFrames> | null = null;
// ── 水生：鋸鰭魚 / 螢光水母 ───────────────────────────────
const FIN = ramp('#16301e', '#214528', '#3f7468', '#6a9c88', '#a2c8b0', '#cceaf8', '#ffffff');
const BELLY = ramp('#2a1810', '#6c1e14', '#a83a10', '#e8701c', '#ffa93a', '#ffd86a', '#fff4c0');
const JELLY = ramp('#2c2450', '#463c78', '#7a5a8c', '#b8788e', '#f2b888', '#fff4c0', '#ffffff');
const JGLOW = ramp('#1f6474', '#2c8692', '#4aaeb0', '#a2c8b0', '#cceaf8', '#ffffff', '#ffffff');
/** 鋸鰭魚：橢圓魚身（暗綠背、橘紅腹）、鋸齒背鰭、擺動的尾巴、一排白牙、紅眼；3 格尾巴擺動 */
function sawfin(): Bmp[] {
  return [-2, 0, 2].map((tail) => {
    const b = new Bmp(22, 14);
    // 尾鰭（左邊）
    part(b, poly([[6, 7], [0, 2 + tail], [1.5, 7], [0, 12 + tail], [6, 8]] as Pt[]), FIN);
    // 背鰭：三個鋸齒
    part(b, poly([[8, 4], [9, 0.5], [11, 3.5], [12.5, 0.5], [14, 3.5], [15.5, 1], [16.5, 4.5]] as Pt[]), FIN);
    // 魚身：上半背色、下半腹色
    part(b, (x, y) => ell(12, 7.5, 8, 4.2)(x, y) && y < 8, FIN);
    part(b, (x, y) => ell(12, 7.5, 8, 4.2)(x, y) && y >= 8, BELLY);
    // 胸鰭
    part(b, poly([[11, 9], [9, 12.5], [13, 10]] as Pt[]), BELLY.map((c) => mix(c, BELLY[1], 0.3)) as RGB[]);
    // 嘴 + 牙
    b.set(19, 8, INK); b.set(18, 8, INK); b.set(20, 7, INK);
    b.set(18, 9, EYE_W); b.set(19, 9, EYE_W); b.set(17, 8, EYE_W);
    // 眼
    b.set(16, 6, EYE_R); b.set(16, 5, INK);
    return fin(b);
  });
}
/** 螢光水母：發光的鐘形傘 + 會擺的觸手；第 1 格收縮（傘變扁變寬）用在推進 */
function lumenJelly(): Bmp[] {
  const shapes: [number, number, number][] = [[7, 6.5, 0], [8.4, 5, 1], [7, 6.5, 2]];
  return shapes.map(([rx, ry, k]) => {
    const b = new Bmp(20, 24);
    const cy = 8.5;
    part(b, (x, y) => ell(10, cy, rx, ry)(x, y) && y <= cy + 1, JELLY);
    part(b, (x, y) => ell(10, cy - 0.5, rx * 0.55, ry * 0.55)(x, y) && y <= cy, JGLOW);
    // 傘緣
    for (let x = Math.round(10 - rx); x <= Math.round(10 + rx); x++) b.set(x, Math.round(cy + 1), (x & 1) ? JELLY[4] : JELLY[3]);
    // 觸手：4 條波浪線
    for (let t = 0; t < 4; t++) {
      const x0 = 10 - rx * 0.7 + t * (rx * 1.4 / 3);
      for (let y = Math.round(cy + 2); y < 23 - (k === 1 ? 3 : 0); y++) {
        const wob = Math.round(Math.sin((y + t * 3 + k * 2) * 0.7) * 1.2);
        b.set(Math.round(x0) + wob, y, y % 3 === 0 ? JGLOW[4] : JELLY[3]);
      }
    }
    b.set(8, Math.round(cy - ry * 0.5), JGLOW[6]); b.set(9, Math.round(cy - ry * 0.6), JGLOW[5]);
    return fin(b);
  });
}

export function enemyFrames(): Record<EnemyKind, EnemyFrames> {
  if (CACHE) return CACHE;
  CACHE = {
    gel_blob: { frames: blob(R.gel, false), anchor: 'bottom' },
    frost_blob: { frames: blob(P.frost, true), anchor: 'bottom' },
    night_walker: { frames: nightWalker(), anchor: 'bottom' },
    dusk_owl: { frames: owl(), anchor: 'center' },
    cave_bat: { frames: bat(P.bat, false), anchor: 'center' },
    rock_crab: { frames: crab(), anchor: 'bottom' },
    frost_wolf: { frames: wolf(), anchor: 'bottom' },
    sand_scorpion: { frames: scorpion(), anchor: 'bottom' },
    thorn_hornet: { frames: hornet(), anchor: 'center' },
    snap_vine: { frames: snapHead(), anchor: 'center' },
    spore_walker: { frames: sporeWalker(), anchor: 'bottom' },
    bone_knight: { frames: boneKnight(), anchor: 'bottom' },
    cursed_skull: { frames: skull(), anchor: 'center' },
    ember_imp: { frames: emberImp(), anchor: 'bottom' },
    magma_bat: { frames: bat(P.imp, true), anchor: 'center' },
    razor_fin: { frames: sawfin(), anchor: 'center' },
    glow_jelly: { frames: lumenJelly(), anchor: 'center' },
    lantern_warden: { frames: [...warden(1), ...warden(2)], anchor: 'center' },
    warden_wisp: { frames: wisp(), anchor: 'center' },
  };
  return CACHE;
}
/** 暗處剪影：身體壓暗到 SILHOUETTE_K（不低於 SILHOUETTE_FLOOR），描邊不變，眼睛保持原色 */
export const SILHOUETTE_K = 0.42;
export const SILHOUETTE_FLOOR: RGB = hex('#2c2838');
/** 剪影只畫在玩家這麼多格內 */
export const SILHOUETTE_RANGE = 12;
/** 所在格亮度低於這個才畫剪影（約光照第 2 階） */
export const SILHOUETTE_LIGHT = 0.3;
export function silhouetteWanted(distTiles: number, light: number): boolean {
  return distTiles <= SILHOUETTE_RANGE && light < SILHOUETTE_LIGHT;
}
export function silhouetteBmp(b: Bmp): Bmp {
  const o = new Bmp(b.w, b.h), ink = Bmp.pack(INK) & 0xffffff;
  const eyes = new Set(EYE_COLORS.map((c) => Bmp.pack(c) & 0xffffff));
  const floorL = luma(SILHOUETTE_FLOOR);
  for (let i = 0; i < b.px.length; i++) {
    const v = b.px[i];
    if (!(v >>> 24)) continue;
    const rgb = v & 0xffffff;
    if (rgb === ink || eyes.has(rgb)) { o.px[i] = (v | 0xff000000) >>> 0; continue; }
    let c = snap(shade(Bmp.unpack(v), SILHOUETTE_K));
    if (luma(c) < floorL) c = SILHOUETTE_FLOOR;
    o.px[i] = Bmp.pack(c);
  }
  return o;
}
/** 白色剪影（被打中閃白用） */
export function flashBmp(b: Bmp): Bmp {
  const o = new Bmp(b.w, b.h), white = hex('#ffffff'), ink = hex('#fff4c0');
  for (let i = 0; i < b.px.length; i++) if (b.px[i] >>> 24) o.px[i] = Bmp.pack((b.px[i] & 0xffffff) === (Bmp.pack(INK) & 0xffffff) ? ink : white);
  return o;
}
