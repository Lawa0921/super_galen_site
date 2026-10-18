// housing.ts — 房屋判定（純函式，無 DOM）：從一格往外 flood fill 找出「房間」，檢查它是不是合格的住處。
//   邊界 = 實心方塊 / 門（開或關）/ 平台；房間內部 = 其他所有格（家具、空氣）。
//   合格條件（缺哪一項就列出哪個原因，UI 用 REASON_ZH 顯示）：
//     封閉（flood 不超過 ROOM.FLOOD 格）、大小（ROOM.MIN..ROOM.MAX 格、至少 MIN_W 寬 / MIN_H 高）、
//     每格都有人造背景牆、有門（或平台出入口）、有光源、有桌子、有座位、有床（居民要睡）。
//   舒適度：家具舒適度相加，同一種第二件起只算一半，每間上限 ROOM.COMFORT_CAP。
import type { World } from './world';
import { T, isSolidTile } from './tiles';
import { FURNITURE_BY_TILE, HOUSE_WALLS, LIGHT_TILES, PAIR_OF_RIGHT, isEntrance } from './furniture';

export const ROOM = {
  /** 內部格數下限 / 上限 */
  MIN: 20, MAX: 120,
  /** flood fill 上限：超過 = 沒有封閉（漏到外面了） */
  FLOOD: 400,
  MIN_W: 4, MIN_H: 3,
  COMFORT_CAP: 20,
} as const;

export type RoomReason = 'open' | 'too_big' | 'too_small' | 'low' | 'narrow' | 'wall' | 'door' | 'light' | 'table' | 'seat' | 'bed';
export const REASON_ZH: Record<RoomReason, string> = {
  open: '沒有封閉（牆或天花板有破口）',
  too_big: `房間太大（最多 ${ROOM.MAX} 格）`,
  too_small: `房間太小（至少 ${ROOM.MIN} 格）`,
  low: `天花板太低（至少 ${ROOM.MIN_H} 格高）`,
  narrow: `房間太窄（至少 ${ROOM.MIN_W} 格寬）`,
  wall: '缺少背景牆',
  door: '沒有門（或平台出入口）',
  light: '沒有光源',
  table: '沒有桌子',
  seat: '沒有椅子（或長椅 / 沙發）',
  bed: '沒有床',
};
/** 需求清單（UI 的勾選表）：key → 顯示名稱 */
export const ROOM_NEEDS: readonly { key: 'enclosed' | 'size' | 'wall' | 'door' | 'light' | 'table' | 'seat' | 'bed'; zh: string }[] = [
  { key: 'enclosed', zh: '封閉' }, { key: 'size', zh: '大小' }, { key: 'wall', zh: '背景牆' }, { key: 'door', zh: '門' },
  { key: 'light', zh: '光源' }, { key: 'table', zh: '桌子' }, { key: 'seat', zh: '座位' }, { key: 'bed', zh: '床' },
];

export interface RoomCheck {
  ok: boolean;
  reasons: RoomReason[];
  /** 內部格（tile index）；漏出去時只到 FLOOD 為止 */
  tiles: number[];
  /** 內部的外接矩形（含） */
  x0: number; y0: number; x1: number; y1: number;
  size: number; width: number; height: number;
  missingWalls: number;
  door: boolean; light: boolean; table: boolean; seat: boolean;
  /** 床頭位置（第一張床） */
  bed: { x: number; y: number } | null;
  comfort: number;
  /** 家具 tile → 件數（雙格家具只算左半） */
  furniture: Map<number, number>;
  /** 房間識別：最小的內部 tile index */
  key: number;
  /** 邊界有玩家蓋的方塊 / 門（區分「蓋到一半的房子」和天然洞穴） */
  built: boolean;
}

const boundary = (id: number): boolean => isSolidTile(id) || isEntrance(id);
/** 玩家蓋房子會用的方塊（查房模式用來認出還沒貼牆的空殼） */
export const BUILT_BLOCKS = new Set<number>([
  T.PLANKS, T.DARK_PLANKS, T.PALE_PLANKS, T.STONE_BRICK, T.RED_BRICK, T.ROOF_RED, T.ROOF_SLATE, T.GLASS,
  T.DOOR_CLOSED, T.DOOR_OPEN, T.PLATFORM,
]);

/** 從 (x,y) 找房間；(x,y) 是邊界 / 越界 → null */
export function checkRoom(w: World, x: number, y: number): RoomCheck | null {
  if (!w.inBounds(x, y) || boundary(w.getFg(x, y))) return null;
  const W0 = w.width, fg = w.fg;
  const seen = new Set<number>();
  const tiles: number[] = [];
  const start = y * W0 + x;
  const stack = [start];
  seen.add(start);
  let leaked = false, door = false, built = false;
  while (stack.length) {
    const i = stack.pop()!;
    tiles.push(i);
    if (tiles.length > ROOM.FLOOD) { leaked = true; break; }
    const tx = i % W0, ty = (i - tx) / W0;
    for (let k = 0; k < 4; k++) {
      const nx = tx + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = ty + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (!w.inBounds(nx, ny)) { leaked = true; continue; }
      const ni = ny * W0 + nx, id = fg[ni];
      if (boundary(id)) { if (isEntrance(id)) door = true; if (BUILT_BLOCKS.has(id)) built = true; continue; }
      if (seen.has(ni)) continue;
      seen.add(ni);
      stack.push(ni);
    }
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, key = Infinity, missing = 0;
  let light = false, table = false, seat = false;
  let bed: { x: number; y: number } | null = null;
  const furniture = new Map<number, number>();
  for (const i of tiles) {
    const tx = i % W0, ty = (i - tx) / W0;
    if (tx < x0) x0 = tx; if (tx > x1) x1 = tx; if (ty < y0) y0 = ty; if (ty > y1) y1 = ty;
    if (i < key) key = i;
    if (!HOUSE_WALLS.has(w.wall[i])) missing++;
    const id = fg[i];
    if (LIGHT_TILES.has(id)) light = true;
    if (PAIR_OF_RIGHT.has(id)) continue;
    const d = FURNITURE_BY_TILE.get(id);
    if (!d) continue;
    furniture.set(id, (furniture.get(id) ?? 0) + 1);
    if (d.role === 'table') table = true;
    if (d.role === 'seat') seat = true;
    if (d.role === 'bed' && !bed) bed = { x: tx, y: ty };
  }
  const size = tiles.length, width = x1 - x0 + 1, height = y1 - y0 + 1;
  const reasons: RoomReason[] = [];
  if (leaked) reasons.push('open');
  else {
    if (size > ROOM.MAX) reasons.push('too_big');
    else if (size < ROOM.MIN) reasons.push('too_small');
    if (height < ROOM.MIN_H) reasons.push('low');
    if (width < ROOM.MIN_W) reasons.push('narrow');
    if (missing > 0) reasons.push('wall');
    if (!door) reasons.push('door');
    if (!light) reasons.push('light');
    if (!table) reasons.push('table');
    if (!seat) reasons.push('seat');
    if (!bed) reasons.push('bed');
  }
  return {
    ok: reasons.length === 0, reasons, tiles, x0, y0, x1, y1, size, width, height, missingWalls: missing,
    door, light, table, seat, bed, comfort: leaked ? 0 : comfortOf(furniture), furniture, key, built,
  };
}

/** 家具 → 舒適度：同一種第二件起每件只算一半，總和上限 ROOM.COMFORT_CAP */
export function comfortOf(furniture: ReadonlyMap<number, number>): number {
  let s = 0;
  for (const [id, n] of furniture) {
    const c = FURNITURE_BY_TILE.get(id)?.comfort ?? 0;
    s += c + Math.max(0, n - 1) * c * 0.5;
  }
  return Math.min(ROOM.COMFORT_CAP, s);
}

/**
 * 矩形 (x0,y0)–(x1,y1) 內所有「看起來是室內」的房間（種子格：非邊界、有人造背景牆）：每間只回傳一次（含不合格的）。
 * 漏到外面的房間也會回傳（reasons = ['open']），讓查房模式能指出破口。
 */
export function scanRooms(w: World, x0: number, y0: number, x1: number, y1: number, opts: { shells?: boolean } = {}): RoomCheck[] {
  const out: RoomCheck[] = [];
  const claimed = new Set<number>();
  const ax = Math.max(0, x0), ay = Math.max(0, y0), bx = Math.min(w.width - 1, x1), by = Math.min(w.height - 1, y1);
  const W0 = w.width;
  for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
    const i = y * W0 + x;
    if (claimed.has(i) || !HOUSE_WALLS.has(w.wall[i]) || boundary(w.fg[i])) continue;
    const r = checkRoom(w, x, y);
    if (!r) continue;
    for (const t of r.tiles) claimed.add(t);
    out.push(r);
  }
  // 空殼：還沒貼背景牆、但已經用建材圍起來的空間（查房模式要能告訴新玩家「缺少背景牆」；天然洞穴不算）
  if (opts.shells) {
    for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
      const i = y * W0 + x;
      if (claimed.has(i) || boundary(w.fg[i])) continue;
      const r = checkRoom(w, x, y);
      if (!r) continue;
      for (const t of r.tiles) claimed.add(t);
      if (r.reasons[0] !== 'open' && r.built) out.push(r);
    }
  }
  return out;
}

/** 不合格原因（zh，頓號分隔）；合格 → 空字串 */
export function roomReasonsText(r: RoomCheck): string {
  return r.reasons.map((k) => (k === 'wall' ? `${REASON_ZH.wall}（${r.missingWalls} 格）` : REASON_ZH[k])).join('、');
}
