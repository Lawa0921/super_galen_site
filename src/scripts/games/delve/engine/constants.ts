// constants.ts — DELVE 共用常數（單位：tile 或 px；時間單位：秒）。
export const TILE_SIZE = 16;
export const CHUNK = 32;
export const WORLD_W = 1600;
export const WORLD_H = 500;
/** 世界生成器版本：改 worldgen 輸出時 +1，舊存檔會被判定不相容。 */
export const GEN_VERSION = 2;
export const FIXED_DT = 1 / 60;

// 玩家物理（px/s、px/s²）。值參考泰拉每 tick 數值 ×60 換算後自行調整。
export const PLAYER_W = 20;
export const PLAYER_H = 42;
export const GRAVITY = 1440;
export const MAX_FALL = 600;
export const RUN_SPEED = 180;
export const RUN_ACCEL = 1500;
export const RUN_DECEL = 1800;
export const AIR_ACCEL = 900;
export const JUMP_SPEED = 300;
/** 按住跳躍時維持上升速度的秒數（可變跳高）。 */
export const JUMP_HOLD = 0.25;
/** 最大 step-up 高度（px），超過一格就擋。 */
export const STEP_MAX = 16.1;
/** 每個碰撞子步最多移動多少 px（< 半格，避免穿透）。 */
export const SUBSTEP_PX = 7;

// 互動
export const REACH_TILES = 6;
export const STATION_RANGE = 4;
export const PLACE_COOLDOWN = 0.12;

// 背包
export const INV_SIZE = 40;
export const HOTBAR_SIZE = 10;
export const MAX_STACK = 999;

// 光照（泰拉 Color 模式常數）
export const LIGHT_AIR_DECAY = 0.91;
export const LIGHT_SOLID_DECAY = 0.56;
export const LIGHT_CUTOFF = 0.0185;
export const LIGHT_MARGIN = 28;
/** 一天長度（秒）。 */
export const DAY_LENGTH = 600;
