/** 格子寬高（奇數，內側偶數座標放不可炸柱子）。 */
export const GRID_COLS = 13;
export const GRID_ROWS = 11;

/** 玩家固定出生格（左上內側）。 */
export const SPAWN = { x: 1, y: 1 } as const;

/** 炸彈引信與爆風存活時間（ms）。 */
export const BOMB_FUSE_MS = 2000;
export const BLAST_TTL_MS = 480;

/** 火力 / 同時炸彈數的基礎與上限。 */
export const BASE_FIRE = 1;
export const BASE_BOMBS = 1;
export const MAX_FIRE = 8;
export const MAX_BOMBS = 8;

/** 移動速度表：speedLevel 索引 -> 每格耗時 ms（越大階越快）。 */
export const SPEED_MS = [200, 168, 140, 116, 96] as const;

/** 命數與重生無敵時間。 */
export const START_LIVES = 3;
export const INVULN_MS = 1500;

/** 敵人每格移動基礎耗時（深層遞減）。 */
export const ENEMY_MOVE_MS: Record<'wander' | 'chaser', number> = { wander: 340, chaser: 280 };

/** 樓層生成參數。 */
export const CRATE_DENSITY = 0.72;        // 可放軟箱的空格被填的機率
export const POWERUP_DROP_RATE = 0.28;    // 軟箱底下藏道具的機率
export const BASE_ENEMY_COUNT = 3;        // 第 1 層敵人數；之後 +1/層
