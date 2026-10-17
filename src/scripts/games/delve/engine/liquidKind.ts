// liquidKind.ts — 液體種類常數（獨立小檔，避免 items ↔ world 的循環 import）。
/** 每格液體量 0..LIQ_MAX；種類存在 world.liquidType（0 = 沒有液體） */
export const LIQ = { NONE: 0, WATER: 1, LAVA: 2, HONEY: 3 } as const;
export type LiquidType = (typeof LIQ)[keyof typeof LIQ];
export const LIQ_MAX = 255;
export const LIQ_NAME: Record<number, string> = { 0: '無', 1: '水', 2: '熔岩', 3: '蜂蜜' };
