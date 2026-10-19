// folkArt.ts — 世界 NPC 的族群外觀後製（純 Bmp）：
//   · dwarfify：把 44×54 的紙娃娃影格（面向右，dollPreview 的輸出）變成矮人——
//     從軀幹 / 腿交界拿掉 shrink 列（腳底固定、上半身往下移 → 矮壯），再在下巴畫一把大鬍子（偵測頭部膚色定位）。
//   · beardRamp：鬍子色階（沿用髮色色階，跟頭髮同色）。
//   全部色票色、不透明；鬍子自己 1px INK 描邊（落在胸口的描邊 = 鬍子和衣服的分界線）。
import { Bmp, type RGB } from './pixel';
import { HAIR_RAMPS, SKIN_RAMPS, hairRamp } from './avatarPalette';

/** 影格裡軀幹 / 腿的交界列（這列以下不動） */
export const WAIST_ROW = 45;
/** 原始影格裡下巴最低可能在哪一列（再下面是肩膀 / 軀幹：衣服的棕色會被誤認成深膚色） */
export const CHIN_MAX_ROW = 38;
const key = (c: RGB): number => (c[0] << 16) | (c[1] << 8) | c[2];
/** 臉的膚色（色階的陰影 / 底色 / 亮部；深影和最暗那階和頭髮 / 衣服太像，不算） */
function skinSet(skin?: number): Set<number> {
  const ramps = skin === undefined ? SKIN_RAMPS.slice(0, 3) : [SKIN_RAMPS[skin] ?? SKIN_RAMPS[1]];
  return new Set(ramps.flatMap((r) => r.slice(2).map(key)));
}
const DEFAULT_SKIN = skinSet();
const isSkinIn = (set: Set<number>, v: number): boolean => (v >>> 24) !== 0 && set.has(((v & 255) << 16) | (((v >>> 8) & 255) << 8) | ((v >>> 16) & 255));

/** 鬍子色階（5 階：[最暗, 陰影, 底色, 亮部, 高光]） */
export function beardRamp(hairColor: number): RGB[] {
  return hairRamp(Math.max(0, Math.min(HAIR_RAMPS.length - 1, Math.floor(hairColor))));
}

/** 原始（未縮）影格的下巴：最下面一列「臉寬」的膚色的位置與左右範圍；找不到 → null */
export function findChin(b: Bmp, maxY = CHIN_MAX_ROW, skin?: number): { y: number; x0: number; x1: number } | null {
  const set = skin === undefined ? DEFAULT_SKIN : skinSet(skin);
  const isSkin = (v: number): boolean => isSkinIn(set, v);
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

/** 一格紙娃娃 → 矮人（同尺寸）；skin = 外觀的膚色索引（給了比較準；省略 = 三種淺膚色都認） */
export function dwarfify(frame: Bmp, beard: RGB[] | null, shrink = 5, skin?: number): Bmp {
  const out = new Bmp(frame.w, frame.h);
  const waist = Math.min(WAIST_ROW, frame.h);
  for (let y = 0; y < frame.h; y++) {
    const sy = y >= waist ? y : y - shrink;
    if (sy < 0) continue;
    for (let x = 0; x < frame.w; x++) out.setRaw(x, y, frame.raw(x, sy));
  }
  if (!beard) return out;
  const c0 = findChin(frame, CHIN_MAX_ROW, skin);
  if (!c0) return out;
  const chin = { ...c0, y: c0.y + shrink };
  const set = skin === undefined ? DEFAULT_SKIN : skinSet(skin);
  const isSkin = (v: number): boolean => isSkinIn(set, v);
  const r = beard, b = new Bmp(out.w, out.h);
  const cx = (chin.x0 + chin.x1) / 2 + 2;
  // 上半：嘴角以下的臉頰 + 鬢角（膚色換成鬍子；左緣亮一階、往下漸暗）
  // 大頭（23×22）：鬍子從鬢角一路包到下巴（臉頰下半都是鬍子）
  const bx0 = chin.x0 - 3, bx1 = chin.x1 + 1;
  for (let y = chin.y - 4; y <= chin.y; y++) for (let x = bx0; x <= bx1; x++) {
    if (!isSkin(out.raw(x, y))) continue;
    if (y < chin.y - 2 && x > bx0 + 3 && x < chin.x1 - 1) continue;
    b.set(x, y, x <= bx0 + 1 ? r[3] : y === chin.y - 4 ? r[3] : (x + y) % 4 === 0 ? r[1] : r[2]);
  }
  // 八字鬍：嘴那一列往兩邊垂（亮一階、兩端暗）
  const my = chin.y - 2;
  for (let x = Math.round(cx) - 3; x <= chin.x1 + 1; x++) b.set(x, my, x >= chin.x1 ? r[1] : r[4]);
  b.set(Math.round(cx) - 3, my + 1, r[2]); b.set(chin.x1 + 1, my + 1, r[1]);
  // 下半：三束往下垂、越下越窄、尖端 V 字；每束左亮右暗、束縫深一階，尖端稍往前（右）
  const len = 8, w0 = bx1 - bx0 + 1;
  const locks = 3, lw = Math.max(2, Math.round((w0 - 1) / locks));
  for (let i = 0; i < locks; i++) {
    const lx0 = bx0 + 1 + i * lw, lx1 = lx0 + lw, tip = len - (i === 0 ? 2 : i === locks - 1 ? 1 : 0);
    for (let k = 1; k <= tip; k++) {
      const y = chin.y + k, sh = Math.round(k / 3);
      const shrink = Math.max(0, Math.round((k - tip + 3) * 0.7));
      for (let x = lx0 + shrink; x <= lx1 - shrink; x++) {
        const c = k === tip ? r[1] : x === lx0 + shrink ? r[3] : x === lx1 - shrink ? r[1] : (k === 2 && x === lx0 + shrink + 1) ? r[4] : r[2];
        b.set(x + sh, y, c);
      }
    }
  }
  b.selOutline();
  out.blit(b, 0, 0);
  return out;
}
