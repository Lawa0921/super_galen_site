// houseFixture.ts — 測試 / debug 用：在世界上直接蓋一間房子（木板外框 + 木板牆 + 左側木門 + 基本家具）。
// 內部範圍 (x, y)–(x+iw-1, y+ih-1)；地板在 y+ih、天花板在 y-1、左牆 x-1（門在左牆最下面三格）、右牆 x+iw。
import { T, W } from './tiles';
import type { World } from './world';

export interface HouseOpts {
  door?: boolean;
  walls?: boolean;
  /** 背景牆種類（預設木板牆） */
  wallId?: number;
  table?: boolean; chair?: boolean; bed?: boolean; light?: boolean;
  /** 額外家具：[內部相對 x, 內部相對 y, tile] */
  extra?: [number, number, number][];
}

export function buildHouse(w: World, x: number, y: number, iw: number, ih: number, o: HouseOpts = {}): void {
  const opt = { door: true, walls: true, table: true, chair: true, bed: true, light: true, ...o };
  for (let yy = y - 1; yy <= y + ih; yy++) for (let xx = x - 1; xx <= x + iw; xx++) {
    const edge = yy === y - 1 || yy === y + ih || xx === x - 1 || xx === x + iw;
    // 和隔壁共用的牆上已經有門 → 保留（並排蓋房子時不會把鄰居的門蓋掉）
    if (!(edge && w.getFg(xx, yy) === T.DOOR_CLOSED)) w.setFg(xx, yy, edge ? T.PLANKS : T.AIR);
    w.setWall(xx, yy, opt.walls && !edge ? (opt.wallId ?? W.PLANK_WALL) : 0);
  }
  // 地基：地板下面再一層實心，門才站得住
  for (let xx = x - 2; xx <= x + iw + 1; xx++) w.setFg(xx, y + ih + 1, T.STONE);
  if (opt.door) for (let k = 0; k < 3; k++) w.setFg(x - 1, y + ih - 1 - k, T.DOOR_CLOSED);
  const floor = y + ih - 1;
  if (opt.table) w.setFg(x + 1, floor, T.TABLE);
  if (opt.chair) w.setFg(x + 2, floor, T.CHAIR);
  if (opt.bed) { w.setFg(x + 3, floor, T.BED_HEAD); w.setFg(x + 4, floor, T.BED_FOOT); }
  if (opt.light) w.setFg(x + iw - 1, y, T.TORCH);
  for (const [dx, dy, id] of opt.extra ?? []) w.setFg(x + dx, y + dy, id);
}

/** 平地：y 以下整片石頭、上面全空（測試世界用） */
export function flatWorld(w: World, groundY: number): void {
  for (let yy = 0; yy < w.height; yy++) for (let xx = w.xMin; xx < w.xMax; xx++) {
    w.setFg(xx, yy, yy >= groundY ? T.STONE : T.AIR);
    w.setWall(xx, yy, 0);
  }
  w.surfaceY = groundY;
  w.surface.fill(groundY);
}
