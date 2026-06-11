// src/scripts/games/bomber/versus/arenas.ts
import type { Grid, Tile, Vec } from '../engine/types';
import { GRID_COLS, GRID_ROWS } from '../engine/constants';
import { createRng } from '../engine/rng';

/** 模板字元：W 牆、C 必箱、? 50% 箱（seed 決定，沿水平中軸鏡像對稱）、. 地板、1-4 出生點。 */
export interface ArenaDef {
  id: number;
  name: string;        // 英文（arcade UI 慣例）
  nameZh: string;      // 選圖卡顯示用
  theme: number;       // tileSets 索引 0-7
  rows: string[];      // GRID_ROWS 行、每行 GRID_COLS 字
}

export interface ParsedArena { grid: Grid; spawns: Vec[]; }

export const ARENAS: ArenaDef[] = [
  {
    // 0 STONE PLAZA 石牢廣場：經典柱陣、開闊中央
    id: 0, name: 'STONE PLAZA', nameZh: '石牢廣場', theme: 0,
    rows: [
      'WWWWWWWWWWWWW',
      'W1.?CCCCC?.2W',
      'W.W?W?W?W?W.W',
      'W??C?...?C??W',
      'W?W.W.W.W.W?W',
      'WC?...?...?CW',
      'W?W.W.W.W.W?W',
      'W??C?...?C??W',
      'W.W?W?W?W?W.W',
      'W3.?CCCCC?.4W',
      'WWWWWWWWWWWWW',
    ],
  },
  {
    // 1 BONE GALLERY 白骨迴廊：房室隔牆、雙走廊
    id: 1, name: 'BONE GALLERY', nameZh: '白骨迴廊', theme: 1,
    rows: [
      'WWWWWWWWWWWWW',
      'W1.CC...CC.2W',
      'W.WWW?W?WWW.W',
      'W?C...?...C?W',
      'W?W?WWWWW?W?W',
      'W..?..C..?..W',
      'W?W?WWWWW?W?W',
      'W?C...?...C?W',
      'W.WWW?W?WWW.W',
      'W3.CC...CC.4W',
      'WWWWWWWWWWWWW',
    ],
  },
  {
    // 2 MOLTEN WORKS 熔火工坊：中央十字熱通道
    // 出生點右/左鄰格為字面 '.'，任意 seed 下均有地板可起步；左右鏡像對稱
    id: 2, name: 'MOLTEN WORKS', nameZh: '熔火工坊', theme: 2,
    rows: [
      'WWWWWWWWWWWWW',
      'W1.C..W..C.2W',
      'W?W?W.W.W?W?W',
      'WC?.......?CW',
      'W.W?W...W?W.W',
      'WW....W....WW',
      'W.W?W...W?W.W',
      'WC?.......?CW',
      'W?W?W.W.W?W?W',
      'W3.C..W..C.4W',
      'WWWWWWWWWWWWW',
    ],
  },
  {
    // 3 FROST ATRIUM 寒冰天井：四象限、角落保險區
    id: 3, name: 'FROST ATRIUM', nameZh: '寒冰天井', theme: 3,
    rows: [
      'WWWWWWWWWWWWW',
      'W1.?C.W.C?.2W',
      'W.W.W?W?W.W.W',
      'W?CC.....CC?W',
      'WCW?W?W?W?WCW',
      'W..?.....?..W',
      'WCW?W?W?W?WCW',
      'W?CC.....CC?W',
      'W.W.W?W?W.W.W',
      'W3.?C.W.C?.4W',
      'WWWWWWWWWWWWW',
    ],
  },
  {
    // 4 VOID ALTAR 虛空祭壇：環形祭壇、稀疏柱
    id: 4, name: 'VOID ALTAR', nameZh: '虛空祭壇', theme: 4,
    rows: [
      'WWWWWWWWWWWWW',
      'W1..?CCC?..2W',
      'W.?.......?.W',
      'W?.WW...WW.?W',
      'WC.W..?..W.CW',
      'WC?..???..?CW',
      'WC.W..?..W.CW',
      'W?.WW...WW.?W',
      'W.?.......?.W',
      'W3..?CCC?..4W',
      'WWWWWWWWWWWWW',
    ],
  },
  {
    // 5 TOXIC FEN 毒霧沼澤：蜿蜒泥路、密箱
    // 出生點左右鄰格均為字面 '.'，任意 seed 下均有地板可起步；左右鏡像對稱
    id: 5, name: 'TOXIC FEN', nameZh: '毒霧沼澤', theme: 5,
    rows: [
      'WWWWWWWWWWWWW',
      'W1.CC?.?CC.2W',
      'W?W.WCWCW.W?W',
      'WCC?..?..?CCW',
      'W.WCW?W?WCW.W',
      'W?..C?.?C..?W',
      'W.WCW?W?WCW.W',
      'WCC?..?..?CCW',
      'W?W.WCWCW.W?W',
      'W3.CC?.?CC.4W',
      'WWWWWWWWWWWWW',
    ],
  },
  {
    // 6 GOLD VAULT 黃金寶庫：金磚陣、道具豐沛
    id: 6, name: 'GOLD VAULT', nameZh: '黃金寶庫', theme: 6,
    rows: [
      'WWWWWWWWWWWWW',
      'W1.C?...?C.2W',
      'W.WWC?.?CWW.W',
      'WCWC?CCC?CWCW',
      'W?C?C???C?C?W',
      'W..?C?C?C?..W',
      'W?C?C???C?C?W',
      'WCWC?CCC?CWCW',
      'W.WWC?.?CWW.W',
      'W3.C?...?C.4W',
      'WWWWWWWWWWWWW',
    ],
  },
  {
    // 7 MOONLIT GARDEN 月光庭園：對角花園、長直線對狙
    id: 7, name: 'MOONLIT GARDEN', nameZh: '月光庭園', theme: 7,
    rows: [
      'WWWWWWWWWWWWW',
      'W1.........2W',
      'W.W?W?W?W?W.W',
      'W?C??...??C?W',
      'W.?WW?C?WW?.W',
      'W..?C...C?..W',
      'W.?WW?C?WW?.W',
      'W?C??...??C?W',
      'W.W?W?W?W?W.W',
      'W3.........4W',
      'WWWWWWWWWWWWW',
    ],
  },
];

/** 解析模板：playerCount 決定啟用幾個出生點（1..N）；? 箱由 seed 決定且沿水平中軸鏡像。 */
export function parseArena(def: ArenaDef, playerCount: 2 | 3 | 4, seed: number): ParsedArena {
  const rng = createRng((seed ^ (def.id * 0x9e3779b1)) >>> 0);
  const maybe: boolean[][] = [];
  for (let y = 0; y < GRID_ROWS; y++) {
    maybe.push([]);
    for (let x = 0; x < GRID_COLS; x++) {
      if (def.rows[y][x] !== '?') { maybe[y].push(false); continue; }
      if (y <= Math.floor((GRID_ROWS - 1) / 2)) maybe[y].push(rng() < 0.5);
      else maybe[y].push(false);
    }
  }
  for (let y = Math.floor((GRID_ROWS - 1) / 2) + 1; y < GRID_ROWS; y++) {
    const my = GRID_ROWS - 1 - y;
    for (let x = 0; x < GRID_COLS; x++) {
      if (def.rows[y][x] === '?') maybe[y][x] = def.rows[my][x] === '?' ? maybe[my][x] : rng() < 0.5;
    }
  }

  const grid: Grid = [];
  const spawnAt: Record<string, Vec> = {};
  for (let y = 0; y < GRID_ROWS; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < GRID_COLS; x++) {
      const ch = def.rows[y][x];
      if (ch === 'W') row.push('wall');
      else if (ch === 'C') row.push('crate');
      else if (ch === '?') row.push(maybe[y][x] ? 'crate' : 'floor');
      else {
        row.push('floor');
        if (ch >= '1' && ch <= '4') spawnAt[ch] = { x, y };
      }
    }
    grid.push(row);
  }
  const spawns: Vec[] = [];
  for (let i = 1; i <= playerCount; i++) {
    const s = spawnAt[String(i)];
    if (!s) throw new Error(`arena ${def.id} missing spawn ${i}`);
    spawns.push(s);
  }
  return { grid, spawns };
}
