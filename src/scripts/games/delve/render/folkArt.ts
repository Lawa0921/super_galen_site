// folkArt.ts — 世界 NPC 的族群外觀後製（純 Bmp）：
//   · dwarfify：把 52×54 的紙娃娃影格（面向右，dollPreview 的輸出）變成矮人——
//     從軀幹 / 腿交界拿掉 shrink 列（腳底固定、上半身往下移 → 矮壯），再沿著 3/4 的臉畫鬍子（偵測嘴和下巴定位：只長在臉的前下方，不蓋眼睛和嘴）。
//   · beardRamp：鬍子色階（沿用髮色色階，跟頭髮同色）。
//   全部色票色、不透明；鬍子自己 1px INK 描邊（落在胸口的描邊 = 鬍子和衣服的分界線）。
import { Bmp, type RGB } from './pixel';
import { HAIR_RAMPS, MOUTH, MOUTH_RED, SKIN_RAMPS, TONGUE, hairRamp } from './avatarPalette';

/** 影格裡軀幹 / 腿的交界列（這列以下不動） */
export const WAIST_ROW = 47;
/** 原始影格裡下巴最低可能在哪一列（再下面是肩膀 / 軀幹：衣服的棕色會被誤認成深膚色） */
export const CHIN_MAX_ROW = 43;
const key = (c: RGB): number => (c[0] << 16) | (c[1] << 8) | c[2];
/** 臉的膚色（色階的陰影 / 底色 / 亮部；深影和最暗那階和頭髮 / 衣服太像，不算） */
function skinSet(skin?: number): Set<number> {
  const ramps = skin === undefined ? SKIN_RAMPS.slice(0, 3) : [SKIN_RAMPS[skin] ?? SKIN_RAMPS[1]];
  return new Set(ramps.flatMap((r) => r.slice(2).map(key)));
}
const DEFAULT_SKIN = skinSet();
const MOUTH_SET = new Set([MOUTH, MOUTH_RED, TONGUE].map(key));
/** 膚色的外框（臉頰前緣 / 下巴那圈深紅棕）也算臉 */
const isOutline = (v: number, skin?: number): boolean => (v >>> 24) !== 0 && (skin === undefined ? SKIN_RAMPS.slice(0, 3) : [SKIN_RAMPS[skin] ?? SKIN_RAMPS[1]]).some((r) => key(r[0]) === (((v & 255) << 16) | (((v >>> 8) & 255) << 8) | ((v >>> 16) & 255)));
const isSkinIn = (set: Set<number>, v: number): boolean => (v >>> 24) !== 0 && set.has(((v & 255) << 16) | (((v >>> 8) & 255) << 8) | ((v >>> 16) & 255));

/** 鬍子色階（5 階：[最暗, 陰影, 底色, 亮部, 高光]） */
export function beardRamp(hairColor: number): RGB[] {
  return hairRamp(Math.max(0, Math.min(HAIR_RAMPS.length - 1, Math.floor(hairColor))));
}

/** 原始（未縮）影格的下巴：最下面一列「臉寬」的膚色的位置與左右範圍；找不到 → null */
export function findChin(b: Bmp, maxY = CHIN_MAX_ROW, skin?: number): { y: number; x0: number; x1: number } | null {
  const set = skin === undefined ? DEFAULT_SKIN : skinSet(skin);
  // 嘴（張嘴的紅）也算臉：嘴在下巴附近，不然最下面那幾列會被嘴切斷、找到太上面
  const isSkin = (v: number): boolean => isSkinIn(set, v) || isSkinIn(MOUTH_SET, v);
  // 從腰往上找：第一列有一段 ≥ 6 格連續膚色的就是下巴（脖子 / 手比較窄；帽子 / 頭髮在更上面，不會先碰到）
  for (let y = Math.min(b.h, maxY) - 1; y >= Math.max(4, maxY - 14); y--) {
    let run = 0, best = 0, bx = -1;
    for (let x = 0; x <= b.w; x++) {
      if (x < b.w && isSkin(b.raw(x, y))) { run++; continue; }
      if (run > best) { best = run; bx = x - 1; }
      run = 0;
    }
    if (best >= 6) return { y, x0: bx - best + 1, x1: bx };
  }
  return null;
}

/** 嘴的位置（張嘴的紅 / 深紅 / 舌頭）：外框；找不到 → null */
function findMouth(b: Bmp, ya: number, yb: number): { y0: number; y1: number; x0: number; x1: number } | null {
  const set = new Set([MOUTH, MOUTH_RED, TONGUE].map(key));
  let y0 = b.h, y1 = -1, x0 = b.w, x1 = -1;
  for (let y = Math.max(0, ya); y <= Math.min(b.h - 1, yb); y++) for (let x = 0; x < b.w; x++) {
    const v = b.raw(x, y);
    if (!(v >>> 24) || !set.has(((v & 255) << 16) | (((v >>> 8) & 255) << 8) | ((v >>> 16) & 255))) continue;
    y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x);
  }
  return y1 < 0 ? null : { y0, y1, x0, x1 };
}

/**
 * 一格紙娃娃 → 矮人（同尺寸）：軀幹拿掉 shrink 列（腳底不動 → 矮壯），再畫鬍子。
 * 鬍子順著 3/4 的臉：只長在臉的前下方（嘴以下的臉頰 + 下巴）、八字鬍在嘴的上面一列（不蓋住嘴），
 * 下巴下面垂三束到胸口；不會往後腦延伸，也不會蓋到眼睛。skin = 外觀的膚色索引。
 */
export function dwarfify(frame: Bmp, beard: RGB[] | null, shrink = 2, skin?: number): Bmp {
  const out = new Bmp(frame.w, frame.h);
  const waist = Math.min(WAIST_ROW, frame.h);
  for (let y = 0; y < frame.h; y++) {
    const sy = y >= waist ? y : y - shrink;
    if (sy < 0) continue;
    for (let x = 0; x < frame.w; x++) out.setRaw(x, y, frame.raw(x, sy));
  }
  if (!beard) return out;
  const c1 = findChin(out, CHIN_MAX_ROW + shrink, skin);
  // 嘴只在臉上找（下巴往上 6 列內；紅色衣服不算）
  const mo = c1 ? findMouth(out, c1.y - 6, c1.y) : null;
  const c0 = c1;
  if (!mo || !c0) return out;
  const set = skin === undefined ? DEFAULT_SKIN : skinSet(skin);
  const isSkin = (v: number): boolean => isSkinIn(set, v) || isOutline(v, skin);
  const r = beard, b = new Bmp(out.w, out.h);
  // 臉頰 + 下巴：嘴以下、嘴的後緣往後 2 格到臉的前緣（膚色換成鬍子；前面亮、下面暗）
  const bx0 = mo.x0 - 2;
  for (let y = mo.y1 + 1; y <= c0.y + 1; y++) for (let x = bx0; x <= c0.x1 + 1; x++) {
    if (!isSkin(out.raw(x, y))) continue;
    b.set(x, y, x === bx0 ? r[1] : y === mo.y1 + 1 ? r[3] : (x + y) % 4 === 0 ? r[1] : r[2]);
  }
  // 嘴的兩側（同一列、嘴的後面 / 前面）也是鬍子：嘴被鬍子圍起來
  for (let y = mo.y0; y <= mo.y1; y++) { for (const x of [mo.x0 - 1, mo.x0 - 2, mo.x1 + 1, mo.x1 + 2]) if (isSkin(out.raw(x, y))) b.set(x, y, r[2]); }
  // 八字鬍：嘴上面那一列，從嘴的後緣到前緣再多一格（亮一階、兩端暗）
  const my = mo.y0 - 1;
  for (let x = mo.x0 - 2; x <= mo.x1 + 2; x++) if (isSkin(out.raw(x, my))) b.set(x, my, x === mo.x0 - 2 || x === mo.x1 + 2 ? r[2] : r[4]);
  // 下巴下面：三束往下垂、越下越窄、尖端 V 字，稍往前（右）
  const len = beard === r && r.length ? 6 : 6, lx = bx0, rx = c0.x1 + 1, lw = Math.max(2, Math.round((rx - lx + 1) / 3));
  for (let i = 0; i < 3; i++) {
    const a0 = lx + i * lw, a1 = Math.min(rx, a0 + lw), tip = len - (i === 0 ? 2 : i === 2 ? 1 : 0);
    for (let k = 1; k <= tip; k++) {
      const y = c0.y + 1 + k, sh = Math.round(k / 3), cut = Math.max(0, Math.round((k - tip + 2) * 0.8));
      for (let x = a0 + cut; x <= a1 - cut; x++) b.set(x + sh, y, k === tip ? r[1] : x === a0 + cut ? r[3] : x === a1 - cut ? r[1] : r[2]);
    }
  }
  b.selOutline();
  // 外框不能蓋到嘴（嘴被鬍子圍著、但露出來）和眼睛（八字鬍上面不描）
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    if (y < my || (y >= mo.y0 && y <= mo.y1 && x >= mo.x0 && x <= mo.x1)) b.clear(x, y);
  }
  out.blit(b, 0, 0);
  return out;
}
