// titleArt.ts — 標題畫面的像素美術（全部程式繪製、吸附統一色票、沒有半透明像素）：
//   DELVE 字標（金色斜面字 + 往下的岩塊厚度 + 深色描邊，L 上卡著一把鎬、E 旁插著火把，火焰 3 格動畫）、
//   選單小圖示（12×12）、選取游標。
import { Bmp, hex, INK, rotate, rotPrep, type RGB } from './pixel';

const C = (h: string): RGB => hex(h);
const GOLD_HI = C('#fff4c0'), GOLD = C('#ffd86a'), GOLD_MID = C('#ffa93a'), GOLD_LO = C('#e8701c'), GOLD_EDGE = C('#a83a10');
const EXT_1 = C('#6c1e14'), EXT_2 = C('#472819'), EXT_3 = C('#2a1810');
const OUT = C('#0c0a12');
const ORE = C('#ffffff');
const CRACK = C('#c99660');

// 字形：'#' = 字身。高 16，直筆 4 寬、橫筆 3 高
const GLYPHS: Record<string, readonly string[]> = {
  D: [
    '#########...', '##########..', '####...####.', '####....####', '####....####', '####....####', '####....####', '####....####',
    '####....####', '####....####', '####....####', '####....####', '####....####', '####...####.', '##########..', '#########...',
  ],
  E: [
    '###########', '###########', '###########', '####.......', '####.......', '####.......', '####.......', '#########..',
    '#########..', '#########..', '####.......', '####.......', '####.......', '###########', '###########', '###########',
  ],
  L: [
    '####.......', '####.......', '####.......', '####.......', '####.......', '####.......', '####.......', '####.......',
    '####.......', '####.......', '####.......', '####.......', '####.......', '###########', '###########', '###########',
  ],
  V: [
    '####......####', '####......####', '####......####', '.####....####.', '.####....####.', '.####....####.', '..####..####..', '..####..####..',
    '..####..####..', '...########...', '...########...', '....######....', '....######....', '.....####.....', '.....####.....', '......##......',
  ],
};
const WORD = 'DELVE';
const GLYPH_H = 16, GAP = 2, EXTRUDE = 3;
/** 字標畫布：左右留給火把 / 鎬、上方留給鎬頭與火焰 */
const PAD_L = 3, PAD_R = 12, PAD_T = 18, PAD_B = 3;

/** 字的遮罩（1 = 字身）與每個字的左緣 x */
function wordMask(): { w: number; mask: Uint8Array; lefts: number[] } {
  const lefts: number[] = [];
  let x = 0;
  for (const ch of WORD) { lefts.push(x); x += GLYPHS[ch][0].length + GAP; }
  const w = x - GAP;
  const mask = new Uint8Array(w * GLYPH_H);
  [...WORD].forEach((ch, i) => {
    const g = GLYPHS[ch];
    for (let y = 0; y < GLYPH_H; y++) for (let gx = 0; gx < g[y].length; gx++) if (g[y][gx] === '#') mask[y * w + lefts[i] + gx] = 1;
  });
  return { w, mask, lefts };
}

/** 字身的直式色階（由上到下）：亮 → 金 → 橙 → 深橙，階與階之間 2 列 Bayer 式交錯（不是漸層） */
function bodyColor(x: number, y: number): RGB {
  const band = (y0: number): boolean => y === y0 && (x & 1) === 0;
  if (y <= 1) return GOLD;
  if (y <= 5) return band(5) ? GOLD_MID : GOLD;
  if (y <= 10) return band(10) ? GOLD_LO : GOLD_MID;
  return GOLD_LO;
}

/** 鎬：拱形鎬頭（兩端尖往下）+ 直立木柄，RotSprite 旋轉成往左傾 → 左尖端敲進 L 的頂端、柄往右上 */
function pickBmp(): Bmp {
  const b = new Bmp(24, 24);
  const head = [
    '.......aaaaaaaa.......',
    '....aaabbccccbbaaa....',
    '..aabbcccccccccbbaa...',
    '.abbcc..........cbba..',
    'abbc..............cba.',
    'abc................ba.',
    'ab..................a.',
    'a.....................',
  ];
  b.grid(head, { a: C('#423f54'), b: C('#858aa0'), c: C('#b4b9c8') }, 1, 14);
  // 直立木柄（兩格寬：亮 / 暗），頂端一圈鐵箍
  for (let y = 1; y < 15; y++) { b.set(11, y, C('#c99660')); b.set(12, y, C('#7c4c2e')); }
  b.set(11, 0, C('#966139')); b.set(12, 0, C('#623924'));
  b.rect(10, 13, 4, 2, C('#5e5e74'));
  return b;
}
function drawPick(b: Bmp, x: number, y: number): void {
  const r = rotate(rotPrep(pickBmp()), 12, 13, -0.62, 30);
  b.blit(r, x, y, true);
}

/** 火把：木柄 + 3 格火焰 */
function drawTorch(b: Bmp, x: number, y: number, frame: number): void {
  const stick = C('#7c4c2e'), stickLo = C('#472819'), band = C('#5e5e74');
  b.rect(x + 1, y + 7, 2, 12, stick);
  b.rect(x + 2, y + 7, 1, 12, stickLo);
  b.rect(x, y + 7, 4, 2, band);
  const flames = [
    ['..a.', '.aa.', '.aba', 'abba', 'abcb', 'bccb', '.cc.'],
    ['.a..', '.aa.', 'aba.', 'abba', 'bcba', 'bccb', '.cc.'],
    ['..a.', '..aa', '.aba', 'abbb', 'bcbb', 'bccb', '.cc.'],
  ];
  b.grid(flames[frame % 3], { a: GOLD_LO, b: GOLD_MID, c: GOLD_HI }, x, y);
  // 火光：周圍幾顆稀疏的亮點（不透明像素，抖動感）
  const sparks = [[-2, 1], [5, 3], [-1, -2], [4, -1], [6, 6], [-3, 5]];
  for (let i = 0; i < sparks.length; i++) if ((i + frame) % 3 !== 0) b.set(x + sparks[i][0], y + sparks[i][1], i % 2 ? GOLD : GOLD_MID);
}

/** DELVE 字標的第 frame 格（火焰動畫 0..2） */
export function logoBmp(frame = 0): Bmp {
  const { w, mask, lefts } = wordMask();
  const W = PAD_L + w + PAD_R, H = PAD_T + GLYPH_H + EXTRUDE + PAD_B;
  const b = new Bmp(W, H);
  const at = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < GLYPH_H && mask[y * w + x] === 1;
  // 0) 鎬（被字蓋住尖端）：左尖端落在 L 直筆頂端、右尖端落在 V 的左上
  drawPick(b, PAD_L + lefts[2] - 17, PAD_T - 20);
  // 1) 岩塊厚度：字往下擠出 EXTRUDE 格（越下越暗）
  for (let d = EXTRUDE; d >= 1; d--) {
    const col = d === 1 ? EXT_1 : d === 2 ? EXT_2 : EXT_3;
    for (let y = 0; y < GLYPH_H; y++) for (let x = 0; x < w; x++) if (at(x, y)) b.set(PAD_L + x, PAD_T + y + d, col);
  }
  // 2) 字身：色階 + 斜面（左 / 上緣亮、右 / 下緣暗）+ 礦石亮點 + 幾道裂紋
  for (let y = 0; y < GLYPH_H; y++) {
    for (let x = 0; x < w; x++) {
      if (!at(x, y)) continue;
      let c = bodyColor(x, y);
      const top = !at(x, y - 1), left = !at(x - 1, y), bot = !at(x, y + 1), right = !at(x + 1, y);
      if (bot || right) c = GOLD_EDGE;
      if (top || left) c = GOLD_HI;
      b.set(PAD_L + x, PAD_T + y, c);
    }
  }
  // 礦石亮點與裂紋：[第幾個字, x, y, 色]
  const marks: [number, number, number, RGB][] = [
    [0, 1, 4, ORE], [0, 2, 11, CRACK], [0, 2, 12, CRACK],
    [1, 1, 5, ORE], [1, 6, 8, CRACK],
    [2, 2, 8, CRACK], [2, 1, 9, CRACK], [2, 8, 14, ORE],
    [3, 2, 1, ORE], [3, 11, 4, CRACK], [3, 10, 5, CRACK], [3, 6, 10, ORE],
    [4, 2, 3, CRACK], [4, 1, 12, ORE],
  ];
  for (const [li, mx, my, col] of marks) {
    const gx = lefts[li] + mx;
    if (at(gx, my)) b.set(PAD_L + gx, PAD_T + my, col);
  }
  // 3) 火把插在最後一個 E 右邊
  drawTorch(b, PAD_L + w + 4, PAD_T - 4, frame);
  // 4) 全部描一圈深色外框
  return b.outline(OUT);
}

// ── 選單小圖示（12×12：10×10 圖 + 描邊） ──────────────────
export type TitleIcon = 'continue' | 'new' | 'import' | 'export' | 'help' | 'settings' | 'back' | 'dice';
const ICONS: Record<TitleIcon, { rows: string[]; pal: Record<string, string> }> = {
  // 繼續：燃燒中的火把燈籠
  continue: { rows: ['....aa....', '...abba...', '...abca...', '..dddddd..', '..deffed..', '..deffed..', '..deffed..', '..dddddd..', '...g..g...', '..gggggg..'],
    pal: { a: '#e8701c', b: '#ffa93a', c: '#fff4c0', d: '#5e5e74', e: '#ffd86a', f: '#fff4c0', g: '#2c2838' } },
  // 新世界：小樹苗 + 土地
  new: { rows: ['....aa....', '...abba...', '..abbbba..', '..aabbaa..', '....cc....', '....cc....', '.d..cc..d.', 'ffffffffff', 'eeeeeeeeee', 'eegeeeegee'],
    pal: { a: '#2d672e', b: '#67ab3c', c: '#7c4c2e', d: '#93cc50', e: '#7c4c2e', f: '#468a34', g: '#472819' } },
  // 匯入：箭頭往下進箱子
  import: { rows: ['....aa....', '....aa....', '....aa....', '..aaaaaa..', '...aaaa...', '....aa....', 'b........b', 'bcccccccb.', 'bcddddddcb', 'bbbbbbbbbb'],
    pal: { a: '#93cc50', b: '#623924', c: '#966139', d: '#c99660' } },
  // 匯出：箭頭往上離開箱子
  export: { rows: ['....aa....', '...aaaa...', '..aaaaaa..', '....aa....', '....aa....', '....aa....', 'b........b', 'bcccccccb.', 'bcddddddcb', 'bbbbbbbbbb'],
    pal: { a: '#94c8ee', b: '#623924', c: '#966139', d: '#c99660' } },
  // 操作說明：攤開的書
  help: { rows: ['..........', 'aaaa..aaaa', 'abbbaabbba', 'abcbaabcba', 'abbbaabbba', 'abcbaabcba', 'abbbaabbba', 'aaaaaaaaaa', '....dd....', '..........'],
    pal: { a: '#472819', b: '#f2e2b0', c: '#b07a4b', d: '#a83a10' } },
  // 設定：齒輪
  settings: { rows: ['....aa....', '.a.abba.a.', '..abbbba..', '.abbccbba.', 'abbc..cbba', 'abbc..cbba', '.abbccbba.', '..abbbba..', '.a.abba.a.', '....aa....'],
    pal: { a: '#5e5e74', b: '#b4b9c8', c: '#858aa0' } },
  // 返回遊戲廳：拱門 + 往左的箭頭
  back: { rows: ['..aaaaaa..', '.abbbbbba.', 'abbccccbba', 'abc.d..cba', 'abcdd..cba', 'abddddddba', 'abcdd..cba', 'abc.d..cba', 'abc....cba', 'aaaaaaaaaa'],
    pal: { a: '#2c2838', b: '#707490', c: '#423f54', d: '#ffd86a' } },
  // 骰子
  dice: { rows: ['.aaaaaaaa.', 'abbbbbbbba', 'abccbbccba', 'abccbbccba', 'abbbccbbba', 'abbbccbbba', 'abccbbccba', 'abccbbccba', 'addddddda.', '.aaaaaaaa.'],
    pal: { a: '#2c2838', b: '#ffffff', c: '#a83a10', d: '#b4b9c8' } },
};
export function iconBmp(id: TitleIcon): Bmp {
  const def = ICONS[id];
  const b = new Bmp(12, 12);
  const pal: Record<string, RGB> = {};
  for (const k of Object.keys(def.pal)) pal[k] = hex(def.pal[k]);
  b.grid(def.rows, pal, 1, 1);
  return b.outline(INK);
}

/** 選取游標：往右的金色小三角（7×9，含描邊） */
export function cursorBmp(): Bmp {
  const b = new Bmp(7, 9);
  b.grid(['a....', 'aa...', 'aba..', 'abba.', 'aba..', 'aa...', 'a....'], { a: GOLD_MID, b: GOLD_HI }, 1, 1);
  return b.outline(OUT);
}

/** 字標原生大小（美術 px） */
export function logoSize(): { w: number; h: number } {
  const b = logoBmp(0);
  return { w: b.w, h: b.h };
}

/** 字標火把的火焰頂端（美術 px，餘燼從這裡往上飄） */
export function logoTorchTip(): { x: number; y: number } {
  const { w } = wordMask();
  return { x: PAD_L + w + 4 + 2, y: PAD_T - 4 };
}

/**
 * 字標的「刷光」：一道往右上斜的亮帶掃過金色字身（只蓋在字身像素上，亮帶中心白、兩側淡金）。
 * 回傳亮帶位置 s 的覆蓋圖（其餘透明）；s 從 −16 掃到字標寬 + 16。
 */
export function logoShineBmp(s: number): Bmp {
  const { w, mask } = wordMask();
  const W = PAD_L + w + PAD_R, H = PAD_T + GLYPH_H + EXTRUDE + PAD_B;
  const b = new Bmp(W, H);
  for (let y = 0; y < GLYPH_H; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      const d = x + Math.floor(y * 0.5) - s;
      if (d < 0 || d > 3) continue;
      b.set(PAD_L + x, PAD_T + y, d === 1 || d === 2 ? ORE : GOLD_HI);
    }
  }
  return b;
}
