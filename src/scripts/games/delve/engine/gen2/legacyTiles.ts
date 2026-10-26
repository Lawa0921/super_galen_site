// legacyTiles.ts — 舊生成器（legacy generateWorld）家鄉出現過的前景 tile 集合，與 gen2 刻意不做的 tile（M2a Task 17；spec §4.4「家鄉不輸舊版」）。
// 量測：legacy/legacyTiles.measure.test.ts（DELVE_MEASURE=1），種子 alpha / beta / gamma 的整個舊世界（4200 × 1200）fg 的聯集。
// legacy 輸出自 M2a 起逐位元不變（V1_FILL_HASH / world.central.test.ts）；M2b 刪 legacy 時量測測試跟著刪，這些常數留著（home.quality.test.ts 的基準）。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T, DUNGEON_COLORS } from '../tiles';

// 量測值（tile id 由小到大）
export const LEGACY_HOME_TILES: readonly number[] = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
  40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 69, 70, 72, 73, 74, 76, 77, 78, 86, 87,
  96, 97, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116,
];

// gen2 刻意不做的 tile（舊生成器有、gen2 家鄉沒有）與理由；其餘舊世界有的 tile gen2 家鄉都要有。
// 只放 gen2 家鄉真的沒有的 tile（home.quality.test 反向驗）：碎石（雪原凍土）、冰（淚滴與凍土）、黏土（森林泥土帶的黏土脈）都有做，所以不在這裡
export const NOT_PORTED: Readonly<Record<number, string>> = {
  [T.SPRING]: '泉水瀑布不移植：需要液體模擬，§4.3 禁止生成後模擬',
  [T.LAVA_SPRING]: '熔岩瀑布不移植：同泉水，需要液體模擬（§4.3）',
  [T.DRAIN]: '滲水石是泉水瀑布的排水端，泉水不移植就不需要',
};

// 每個世界只挑一個的 tile 組：組內任一個出現在 gen2 家鄉就算整組有（舊生成器 3 個種子剛好挑到的顏色不代表 gen2 的 3 個種子也挑得到）
//   地城磚三色（DUNGEON_COLORS，每個世界挑一色；gen2 = structures/dungeon.ts 依雜湊挑）
export const ONE_PER_WORLD: readonly (readonly number[])[] = [DUNGEON_COLORS.map((c) => c.brick)];
