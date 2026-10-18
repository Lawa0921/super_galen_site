// levelArt.ts — 等級系統的像素美術（純函式，回傳 Bmp；全部取自 render/pixel.ts 的統一色票、沒有半透明像素）：
//   · 經驗條（HUD）：外框 + 凹槽 + 綠色進度（亮邊 / 暗邊）+ 每 10% 一格刻度；升級閃光時整條變金。
//   · 等級徽章：數字 3×5 點陣；外框顏色依里程碑分階（棕 → 銅 → 銀 → 金 → 紫）= 每 5 級的外觀獎勵。
//   · 技能節點圖示（10×10 左右的字元格）+ 節點外框（被動方框 / 主動八角 / 核心菱角）+ 級數小點。
//   · 主動技能觸控鍵面（含冷卻遮罩）、升級光芒。
import { Bmp, hex, type RGB } from './pixel';
import { digitRows } from './combatAnim';
import type { SkillId, ActiveSkill } from '../engine/skills';

const C = {
  ink: hex('#0c0a12'), ink2: hex('#1c1424'), well: hex('#2a1810'), wellHi: hex('#472819'),
  frame: hex('#623924'), frameHi: hex('#966139'), frameLo: hex('#2a1810'),
  xp: hex('#67ab3c'), xpHi: hex('#c2e478'), xpLo: hex('#2d672e'), tick: hex('#16301e'),
  gold: hex('#ffd86a'), goldHi: hex('#fff4c0'), goldLo: hex('#e8701c'), goldDk: hex('#a83a10'),
  white: hex('#ffffff'), cream: hex('#f2e2b0'), sand: hex('#d8ba76'),
  red: hex('#c8344c'), redDk: hex('#8c2038'), orange: hex('#e8701c'),
  green: hex('#468a34'), greenHi: hex('#93cc50'), blue: hex('#3e74c4'), blueHi: hex('#94c8ee'), cyan: hex('#4aaeb0'), cyanHi: hex('#cceaf8'),
  silver: hex('#b4b9c8'), silverDk: hex('#707490'), brown: hex('#7c4c2e'), brownHi: hex('#b07a4b'),
  purple: hex('#9a6ee0'), purpleDk: hex('#463c78'),
  grey0: hex('#2c2838'), grey1: hex('#423f54'), grey2: hex('#5e5e74'), grey3: hex('#858aa0'),
};
export const LEVEL_COLORS = C;

// ── 等級徽章外框分階（里程碑外觀獎勵） ───────────────────
export interface BadgeTier { min: number; zh: string; hi: RGB; mid: RGB; lo: RGB; }
export const BADGE_TIERS: readonly BadgeTier[] = [
  { min: 1, zh: '木框', hi: C.frameHi, mid: C.frame, lo: C.frameLo },
  { min: 5, zh: '銅框', hi: C.gold, mid: C.orange, lo: C.goldDk },
  { min: 15, zh: '銀框', hi: C.white, mid: C.silver, lo: C.silverDk },
  { min: 25, zh: '金框', hi: C.goldHi, mid: C.gold, lo: C.goldLo },
  { min: 40, zh: '星紫框', hi: C.cyanHi, mid: C.purple, lo: C.purpleDk },
];
export function badgeTier(level: number): BadgeTier {
  let t = BADGE_TIERS[0];
  for (const b of BADGE_TIERS) if (level >= b.min) t = b;
  return t;
}

/** 3×5 點陣數字寫進 bmp（'#' = c） */
function digits(b: Bmp, text: string, x: number, y: number, c: RGB, shadow?: RGB): void {
  [...text].forEach((ch, i) => digitRows(ch).forEach((row, ry) => [...row].forEach((v, rx) => {
    if (v !== '#') return;
    if (shadow) b.set(x + i * 4 + rx + 1, y + ry + 1, shadow);
    b.set(x + i * 4 + rx, y + ry, c);
  })));
}
function bevel(b: Bmp, x: number, y: number, w: number, h: number, hi: RGB, mid: RGB, lo: RGB): void {
  b.rect(x, y, w, h, mid);
  b.rect(x, y, w, 1, hi); b.rect(x, y, 1, h, hi);
  b.rect(x, y + h - 1, w, 1, lo); b.rect(x + w - 1, y, 1, h, lo);
}

/** 等級徽章：寬依位數（1 位 11、2 位 15），高 11 */
export function badgeBmp(level: number, flash = false): Bmp {
  const s = String(Math.max(1, Math.floor(level))), w = 7 + s.length * 4, h = 11;
  const b = new Bmp(w, h), t = badgeTier(level);
  b.rect(1, 0, w - 2, h, C.ink); b.rect(0, 1, w, h - 2, C.ink);
  bevel(b, 1, 1, w - 2, h - 2, flash ? C.goldHi : t.hi, flash ? C.gold : t.mid, flash ? C.goldLo : t.lo);
  b.rect(3, 3, w - 6, h - 6, C.ink2);
  digits(b, s, 4, 3, flash ? C.white : C.goldHi);
  return b;
}

export const XP_BAR_W = 82;
export const XP_BAR_H = 7;
/** HUD 經驗條：frac 0..1；flash = 升級閃光（金色） */
export function xpBarBmp(frac: number, flash = false, w = XP_BAR_W): Bmp {
  const h = XP_BAR_H, b = new Bmp(w, h);
  b.rect(1, 0, w - 2, h, C.ink); b.rect(0, 1, w, h - 2, C.ink);
  bevel(b, 1, 1, w - 2, h - 2, C.frameHi, C.frame, C.frameLo);
  const ix = 2, iy = 2, iw = w - 4, ih = h - 4;
  b.rect(ix, iy, iw, ih, C.well);
  b.rect(ix, iy, iw, 1, C.ink2);
  const f = Math.max(0, Math.min(1, frac)), n = Math.round(iw * f);
  if (n > 0) {
    const [hi, mid, lo] = flash ? [C.goldHi, C.gold, C.goldLo] : [C.xpHi, C.xp, C.xpLo];
    b.rect(ix, iy, n, ih, mid);
    b.rect(ix, iy, n, 1, hi);
    b.rect(ix, iy + ih - 1, n, 1, lo);
    if (n < iw) b.rect(ix + n - 1, iy, 1, ih, hi);
  }
  // 刻度：每 10%
  for (let k = 1; k < 10; k++) {
    const x = ix + Math.round((iw * k) / 10);
    b.set(x, iy + ih - 1, x < ix + n ? (flash ? C.goldDk : C.tick) : C.wellHi);
  }
  return b;
}

// ── 技能圖示 ─────────────────────────────────────────────
const PAL: Record<string, RGB> = {
  k: C.ink2, w: C.white, W: C.cream, g: C.gold, G: C.green, l: C.greenHi, o: C.orange, r: C.red, R: C.redDk,
  b: C.blue, B: C.blueHi, c: C.cyan, C: C.cyanHi, s: C.silver, S: C.silverDk, n: C.brown, N: C.brownHi, y: C.sand, p: C.purple,
};
const ICONS: Record<SkillId, readonly string[]> = {
  b_vigor: ['.rr...rr.', 'rWrr.rrrR', 'rWrrrrrrR', 'rrrrrrrrR', '.rrrrrrR.', '..rrrrR..', '...rrR...', '....R....'],
  b_edge: ['.......sw', '......sws', '.....sws.', '....sws..', '.n.sws...', '..nws....', '..gnn....', '.n..g....', 'n........'],
  b_guard: ['sssssssss', 'swwSSSSSs', 'swSSgSSSs', 'sSSgggSSs', 'sSSSgSSSs', '.sSSSSSs.', '..sSSSs..', '...sSs...', '....s....'],
  b_dash: ['......o..', '......oo.', 'ww.ooooooo', '......oo.', '.ww...o..', '.........', 'www......'],
  b_eye: ['..kkkkk..', '.kWWWWWk.', 'kWWbbbWWk', 'kWbBkbbWk', 'kWWbbbWWk', '.kWWWWWk.', '..kkkkk..'],
  b_tempo: ['.....gg..', '....gg...', '...gg....', '..gggggg.', '.....gg..', '....gg...', '...gg....', '..g......'],
  b_mend: ['...GG....', '...Gl....', '.GGllGG..', '.GllllG..', '...Gl....', '...GG....'],
  b_slam: ['..nnnn...', '..nNNn...', '..nNNn...', '.nnNNnn..', '.nNNNNn..', '..nnnn...', 'o..oo..o.', '.o....o..', 'yyyyyyyyy'],
  b_fury: ['...r.....', '..rr..r..', '.rorr.rr.', '.rooorrr.', 'rogggorr.', 'rogwgoRr.', '.rogggR..', '..rRRR...'],
  p_stride: ['..nnn....', '..nNn....', '..nNn....', '..nNnnn..', '..nNNNNn.', '..nnnnnnn', '.........', 'w..w..w..'],
  p_lamp: ['....k....', '...k.k...', '..ggggg..', '.gWWWWWg.', '.gWyyyWg.', '.gWWWWWg.', '..ggggg..', '...nnn...'],
  p_reach: ['o.......o', 'oo.....oo', 'ooooooooo', 'oo.....oo', 'o.......o'],
  p_feather: ['.......ww', '......wsw', '.....wsw.', '....wsw..', '...wsw...', '..wsw....', '..ww.....', '.s.......'],
  p_sense: ['..ccccc..', '.c.....c.', 'c..ccc..c', 'c.c...c.c', 'c.c.o.c.c', 'c.c...c.c', 'c..ccc..c', '.c.....c.', '..ccccc..'],
  p_gills: ['...b.....', '..bb...C.', '.bbCb.C.C', '.bBCb..C.', '.bbbb....', '..bb..C..'],
  p_spring: ['....g....', '...ggg...', '..ggggg..', '....g....', '.sssssss.', '..SSSSS..', '.sssssss.', '..SSSSS..'],
  p_angler: ['..bbbb..b', '.bWbbbbbb', 'bbbbbbbbb', '.bbbbbb.b', '..bbbb...', '.........', '....s....', '...s.s...'],
  p_cloud: ['....g....', '...ggg...', '...ww....', '..wwww.ww', '.wwwwwwww', 'wwwsswwsw', '.ssssssss'],
  c_hands: ['.sssssss.', 's...n...s', '....n....', '....n....', '....N....', '....n....', '....n....'],
  c_thrift: ['..gggg...', '.gwgggo..', 'gwggggog.', 'gggooggo.', 'ggggggo..', '.gooog...', '..ggg..o.', '......oo.', '.....ooo.'],
  c_vein: ['.....w...', '....www..', '.SSSSw...', 'SSoSSSS..', 'SSSSoSS..', 'SoSSSSS..', '.SSSS....'],
  c_salvage: ['...c.....', '..cCc....', '.cCccc...', 'cCcccccc.', '.ccccc...', '..ccc..s.', '...c..s..', '.....s...'],
  c_haggle: ['sssssss..', '.ssssssss', '...SSS...', '..sssss..', '.SSSSSSS.', '.........', 'g.g.g....'],
  c_fortune: ['.GG.GG...', 'GlGGlG...', 'GGGGGG...', '.GGGG....', 'GGGGGG...', 'GlGGlG...', '.GG.GG...', '....n....', '.....n...'],
  c_scholar: ['nnnnnnnn.', 'nyyyyyyn.', 'nykkkkyn.', 'nyyyyyyn.', 'nykkkyyn.', 'nyyyyyyn.', 'nnnnnnnn.'],
  c_master: ['....g....', '...ggg...', 'ggggwgggg', '.ggwggggg', '..ggggg..', '.ggg.ggg.', '.gg...gg.'],
};
const GREYS: readonly RGB[] = [C.grey0, C.grey1, C.grey2, C.grey3];
function toGrey(c: RGB): RGB {
  const l = (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
  return GREYS[Math.max(0, Math.min(3, Math.floor(l * 4)))];
}
/** 技能圖示（左上對齊的原始大小） */
export function iconBmp(id: SkillId, locked = false): Bmp {
  const rows = ICONS[id];
  const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
  const b = new Bmp(w, h);
  b.grid(rows, PAL);
  if (locked) b.map(toGrey);
  return b;
}

export type NodeLook = 'locked' | 'open' | 'partial' | 'learned';
export const NODE_PX = 22;
/** 節點：22×22（外框形狀依種類、顏色依狀態）+ 圖示置中 + 下緣的級數小點；focus = 鍵盤焦點的亮框 */
export function nodeBmp(id: SkillId, kind: 'passive' | 'active' | 'keystone', look: NodeLook, rank: number, max: number, focus = false): Bmp {
  const S = NODE_PX, b = new Bmp(S, S);
  const fr = look === 'learned' ? [C.goldHi, C.gold, C.goldLo] : look === 'partial' ? [C.xpHi, C.xp, C.xpLo]
    : look === 'open' ? [C.frameHi, C.brownHi, C.frame] : [C.grey2, C.grey1, C.grey0];
  const inner = look === 'locked' ? C.ink : C.ink2;
  // 形狀：被動 = 方框；主動 = 切角大（八角）；核心 = 切角 + 尖角
  const cut = kind === 'passive' ? 1 : kind === 'active' ? 4 : 8;
  const inside = (x: number, y: number, inset: number): boolean => {
    const a = inset, z = S - 1 - inset;
    if (x < a || y < a || x > z || y > z) return false;
    const dx = Math.min(x - a, z - x), dy = Math.min(y - a, z - y);
    return dx + dy >= Math.max(0, cut - inset);
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!inside(x, y, 0)) continue;
    if (!inside(x, y, 1)) { b.set(x, y, C.ink); continue; }
    if (!inside(x, y, 2)) { b.set(x, y, x + y < S ? fr[0] : fr[2]); continue; }
    if (!inside(x, y, 3)) { b.set(x, y, fr[1]); continue; }
    b.set(x, y, inner);
  }
  if (focus) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (inside(x, y, 0) && !inside(x, y, 1)) b.set(x, y, C.white);
  const ic = iconBmp(id, look === 'locked');
  b.blit(ic, Math.floor((S - ic.w) / 2), Math.floor((S - 2 - ic.h) / 2));
  // 級數小點（max > 1 才畫）
  if (max > 1) {
    const w = max * 2 - 1, x0 = Math.floor((S - w) / 2), y = S - 5;
    for (let k = 0; k < max; k++) b.set(x0 + k * 2, y, k < rank ? C.goldHi : C.grey1);
  }
  return b;
}

/** 主動技能鍵面（觸控）：18×18，冷卻 cd 0..1（從上往下的暗色遮罩，像素逐列） */
export const ACTIVE_ICON: Record<ActiveSkill, SkillId> = { dash: 'b_dash', slam: 'b_slam', pulse: 'p_sense' };
export function activeKeyBmp(a: ActiveSkill, cd: number): Bmp {
  const S = 18, b = new Bmp(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = Math.min(x, S - 1 - x), dy = Math.min(y, S - 1 - y);
    if (dx + dy < 3) continue;
    b.set(x, y, dx + dy < 4 ? C.ink : dx === 1 || dy === 1 ? (x + y < S ? C.frameHi : C.frameLo) : C.frame);
  }
  b.rect(3, 3, S - 6, S - 6, C.ink2);
  const ic = iconBmp(ACTIVE_ICON[a], cd > 0);
  b.blit(ic, Math.floor((S - ic.w) / 2), Math.floor((S - ic.h) / 2));
  if (cd > 0) {
    const rows = Math.ceil((S - 6) * Math.min(1, cd));
    for (let y = 3; y < 3 + rows; y++) for (let x = 3; x < S - 3; x++) if ((x + y) % 2 === 0) b.set(x, y, C.ink);
  }
  return b;
}

/** 升級光芒（banner 背景）：w×h，從中心放射的金色光條（棋盤格抖動，只有不透明像素） */
export function raysBmp(w: number, h: number, phase: number): Bmp {
  const b = new Bmp(w, h), cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = Math.atan2(y - cy, x - cx), d = Math.hypot((x - cx) / (w / 2), (y - cy) / (h / 2));
    if (d > 1) continue;
    const ray = Math.sin(a * 8 + phase) > 0.55;
    if (!ray) continue;
    const lvl = d < 0.35 ? 2 : d < 0.7 ? 1 : 0;
    if (lvl === 0 && (x + y) % 2) continue;
    b.set(x, y, lvl === 2 ? C.goldHi : lvl === 1 ? C.gold : C.goldLo);
  }
  return b;
}
