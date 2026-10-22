// constants.ts — DELVE 共用常數（單位：tile 或 px；時間單位：秒）。
export const TILE_SIZE = 16;
export const CHUNK = 32;
export const WORLD_W = 4200;
export const WORLD_H = 1200;
/**
 * 世界生成器版本：改 worldgen 輸出時 +1，舊存檔會被判定不相容。
 * v5 = 液體（湖 / 綠洲 / 地下湖 / 熔岩 / 蜂巢；樹與地表裝飾的亂數流不變）。v4 的存檔可以遷移（見 save/serialize.ts：COMPAT_GEN）。
 * v7 = NPC 地表村落 / 矮人地廳 / 每個發現地點的地標（v6 的存檔不相容）。
 */
export const GEN_VERSION = 7;
export const FIXED_DT = 1 / 60;

// 玩家物理（px/s、px/s²）。每 tick 數值 ×60 換算後調整。
export const PLAYER_W = 20;
/** 碰撞盒高度：貼著角色的實際高度（約 31–33 px + 帽尖），跳起來撞天花板時頭真的碰到；仍然 > 2 格（32 px），能走的通道和以前一樣 */
export const PLAYER_H = 35;
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
/** 繩索攀爬速度（上 / 下）與攀爬時的水平速度（px/s） */
export const CLIMB_SPEED = 120;
export const CLIMB_X = 70;
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

// 光照（RGB 掃描光照的衰減常數）
export const LIGHT_AIR_DECAY = 0.91;
/**
 * 地下的空氣衰減：每欄地表下 LIGHT_DEEP_START 格起線性過渡、LIGHT_DEEP_FULL 格起完全使用。
 * 洞穴裡的火把 / 水晶 / 熔岩形成看得出邊界的光池，沒照到的地方是真的暗（地表附近與白天地表不變）。
 */
export const LIGHT_AIR_DECAY_DEEP = 0.87;
export const LIGHT_DEEP_START = 8;
export const LIGHT_DEEP_FULL = 24;
export const LIGHT_SOLID_DECAY = 0.56;
export const LIGHT_CUTOFF = 0.0185;
/** 裂紋石（密室的假牆）每格衰減：比一般實心更擋光，牆後的密室不會被坑道裡的火把照出來 */
export const LIGHT_SECRET_DECAY = 0.25;
export const LIGHT_MARGIN = 28;
/** 深水（量 > 128）每格衰減（R, G, B）：紅掉最快、藍走最遠 → 越深越藍 */
export const LIGHT_WATER_DECAY: readonly [number, number, number] = [0.78, 0.85, 0.9];
/** 深蜂蜜每格衰減（R, G, B）：藍掉最快 → 琥珀色 */
export const LIGHT_HONEY_DECAY: readonly [number, number, number] = [0.8, 0.68, 0.42];
/** 天光井：地表直通下去的豎井 / 裂谷，地表下這麼多格內還吃得到（越深越淡的）天光 */
export const SKY_SHAFT_LEN = 60;
/** 天光井在地表那格的強度（× 天空光），往下線性變淡到 0 */
export const SKY_SHAFT_K = 0.75;
/** 滿格熔岩的發光強度（量越少越暗） */
export const LAVA_LIGHT = 0.95;
/** 一天長度（秒）。 */
export const DAY_LENGTH = 600;
/** 連線（host 模式）：遠端 actor 放置的觸及距離多給這麼多格（客人的位置落後半個 RTT；C14）。net/protocol.ts 轉出口 */
export const REMOTE_REACH_SLACK = 1.5;
