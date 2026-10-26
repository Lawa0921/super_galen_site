// mineshaft.ts — 礦坑、入口斜坡與坑道盡頭密室的畫圖（舊生成器 legacy/worldgen.ts 搬過來，舊生成器與 gen2 共用；選址、
// 佔位檢查、要不要斜坡 / 密室留在呼叫端）。亂數抽取順序與舊生成器相同。
//   · 礦坑：4 列空氣（沒有背景牆的格補泥土牆）、上下不是實心才補木板頂 / 地板、每 6 格一組木框（1/6 斷掉）、
//     每 3 框一支火把、1/2 機率一個 'mineshaft' 箱
//   · 斜坡：從坑道左端往左上每欄升一格，走到地表為止
//   · 密室：兩格厚的裂紋石塞（一敲就碎）+ 石殼 + 木板牆 + 'secret' 箱 + 2 個陶罐 + 蛛網 + 鐘乳石（不放發光物）
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T, W } from '../../tiles';
import type { Canvas, RandomLike } from './canvas';

// 密室室內高（室內列 ry0 .. ry0 + SECRET_RH − 1，地板列 ry0 + SECRET_RH）
export const SECRET_RH = 6;

// x0 = 坑道左端欄、len = 長、yTop = 坑道最上面一列空氣（頂板 yTop − 1、地板 yTop + 4）
export function drawMineshaft(cv: Canvas, o: { x0: number; len: number; yTop: number }, rng: RandomLike): { chest: { x: number; y: number } | null } {
  const { x0, len, yTop } = o;
  for (let x = x0; x < x0 + len; x++) {
    for (let y = yTop; y < yTop + 4; y++) { cv.setFg(x, y, T.AIR); if (!cv.wall(x, y)) cv.setWall(x, y, W.DIRT_WALL); }
    if (!cv.isSolid(x, yTop + 4)) cv.setFg(x, yTop + 4, T.PLANKS);
    if (!cv.isSolid(x, yTop - 1)) cv.setFg(x, yTop - 1, T.PLANKS);
  }
  let frame = 0;
  for (let fx = x0 + 2; fx < x0 + len - 2; fx += 6, frame++) {
    const broken = rng.chance(6);
    if (!broken) for (let dx = -1; dx <= 1; dx++) cv.setFg(fx + dx, yTop, T.PLANKS);
    for (let y = broken ? yTop : yTop + 1; y < yTop + 4; y++) { cv.setFg(fx - 1, y, T.BEAM); cv.setFg(fx + 1, y, T.BEAM); }
    if (!broken && frame % 3 === 1) cv.setFg(fx, yTop + 1, T.TORCH);
  }
  let chest: { x: number; y: number } | null = null;
  if (rng.chance(2)) {
    let cx = x0 + 4 + rng.int(0, Math.max(1, len - 8));
    while (cv.fg(cx, yTop + 3) !== T.AIR && cx < x0 + len - 1) cx++;
    if (cv.fg(cx, yTop + 3) === T.AIR && cv.isSolid(cx, yTop + 4)) { cv.chest(cx, yTop + 3, 'mineshaft'); chest = { x: cx, y: yTop + 3 }; }
  }
  return { chest };
}

// 入口斜坡：從坑道左端（x0 − 1）往左上每欄升一格（4 格高、可走上走下），腳下不是實心補木板，頭頂高過 surfaceAt(x) − 1 就停（最多 159 欄）。
// xMin = 斜坡不進入的左界（x < xMin 就停；舊生成器傳世界左緣 2，gen2 不傳）
export function drawRamp(cv: Canvas, o: { x0: number; yTop: number; xMin?: number }, surfaceAt: (x: number) => number): void {
  const { x0, yTop } = o, xMin = o.xMin ?? Number.NEGATIVE_INFINITY;
  for (let s = 1; s < 160; s++) {
    const x = x0 - s, feet = yTop + 3 - s;
    if (x < xMin) break;
    for (let y = feet - 3; y <= feet; y++) cv.setFg(x, y, T.AIR);
    if (!cv.isSolid(x, feet + 1)) cv.setFg(x, feet + 1, T.PLANKS);
    if (feet - 3 < surfaceAt(x) - 1) break;
  }
}

// drawRamp 會畫幾欄（同一條停止規則：x < xMin 不畫、第 s 欄畫完頭頂高過 surfaceAt(x) − 1 就停、最多 159 欄）。
// 第 s 欄的格在列 yTop − s .. yTop + 4 − s，所以斜坡最高的一列 = yTop − rampSteps（gen2 畫之前用它算外框）
export function rampSteps(o: { x0: number; yTop: number; xMin?: number }, surfaceAt: (x: number) => number): number {
  const { x0, yTop } = o, xMin = o.xMin ?? Number.NEGATIVE_INFINITY;
  for (let s = 1; s < 160; s++) {
    const x = x0 - s;
    if (x < xMin) return s - 1;
    if (yTop - s < surfaceAt(x) - 1) return s;
  }
  return 159;
}

// 密室的版面：plug0 = 裂紋石塞左欄（2 格寬）、rx0 / ry0 = 室內左上、shell = 石殼外框（含塞子）
export function secretRoomLayout(o: { shaftX0: number; shaftLen: number; yTop: number; right: boolean; rw: number }):
  { plug0: number; rx0: number; ry0: number; shell: { x: number; y: number; w: number; h: number } } {
  const { shaftX0, shaftLen, yTop, right, rw } = o;
  const plug0 = right ? shaftX0 + shaftLen : shaftX0 - 2;
  const rx0 = right ? shaftX0 + shaftLen + 2 : shaftX0 - 2 - rw;
  const ry0 = yTop - 2;
  return { plug0, rx0, ry0, shell: { x: rx0 - 2, y: ry0 - 2, w: rw + 4, h: SECRET_RH + 5 } };
}

// 坑道（shaftX0、shaftLen、yTop 同 drawMineshaft）右端（right）或左端的密室；rw = 室內寬。回傳室內矩形與 'secret' 箱位置
export function drawSecretRoom(cv: Canvas, o: { shaftX0: number; shaftLen: number; yTop: number; right: boolean; rw: number }, rng: RandomLike):
  { x: number; y: number; w: number; h: number; chest: { x: number; y: number } } {
  const { yTop, right, rw } = o, rh = SECRET_RH, { plug0, rx0, ry0, shell } = secretRoomLayout(o);
  for (let y = shell.y; y < shell.y + shell.h; y++) for (let x = Math.min(shell.x, plug0); x < Math.max(shell.x + shell.w, plug0 + 2); x++) {
    cv.setFg(x, y, T.STONE); cv.setWall(x, y, W.STONE_WALL);
  }
  for (let y = ry0; y < ry0 + rh; y++) for (let x = rx0; x < rx0 + rw; x++) { cv.setFg(x, y, T.AIR); cv.setWall(x, y, W.PLANK_WALL); }
  for (let x = rx0; x < rx0 + rw; x++) cv.setFg(x, ry0 + rh, T.PLANKS);
  for (let y = yTop; y < yTop + 4; y++) for (let k = 0; k < 2; k++) cv.setFg(plug0 + k, y, T.CRACKED_STONE);
  const floorY = ry0 + rh - 1;
  const cx = right ? rx0 + rw - 3 : rx0 + 2;
  cv.chest(cx, floorY, 'secret');
  for (let k = 0; k < 2; k++) { const px = rx0 + 1 + rng.int(0, rw - 2); if (cv.fg(px, floorY) === T.AIR && Math.abs(px - cx) > 1) cv.setFg(px, floorY, T.POT); }
  cv.setFg(right ? rx0 : rx0 + rw - 1, ry0, T.COBWEB);
  // 天花板垂一根鐘乳石（不放會發光的水晶：光會穿過裂紋石，從坑道就看得到密室）
  cv.setFg(rx0 + Math.floor(rw / 2), ry0, T.STALACTITE);
  return { x: rx0, y: ry0, w: rw, h: rh, chest: { x: cx, y: floorY } };
}
