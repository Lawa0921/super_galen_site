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

/** 敵人每格移動基礎耗時（深層遞減）。
 *  ghost 緩慢但穿木箱；dasher 直線高速衝鋒；mimic 甦醒後中速追擊；tank 極慢但 2 滴血。 */
export const ENEMY_MOVE_MS: Record<'wander' | 'chaser' | 'ghost' | 'dasher' | 'mimic' | 'tank' | 'sapper' | 'splitter' | 'mini', number> =
  { wander: 340, chaser: 280, ghost: 470, dasher: 165, mimic: 300, tank: 540, sapper: 320, splitter: 380, mini: 230 };

/** sapper 放彈：冷卻、觸發距離、敵彈引信/火力、場上敵彈上限。 */
export const SAPPER_BOMB_CD_MS = 4500;
export const SAPPER_FIRST_CD_MS = 2500;
export const SAPPER_TRIGGER_DIST = 5;
export const ENEMY_BOMB_FUSE_MS = 2000;
export const ENEMY_BOMB_RANGE = 1;
export const MAX_ENEMY_BOMBS = 2;

/** 敵人受擊冷卻：同一團殘留爆風不會連續扣血（tank 多滴血專用）。 */
export const ENEMY_HIT_COOLDOWN_MS = 600;

/** 樓層生成參數。 */
export const CRATE_DENSITY = 0.72;        // 可放軟箱的空格被填的機率
export const POWERUP_DROP_RATE = 0.28;    // 軟箱底下藏道具的機率
export const BASE_ENEMY_COUNT = 3;        // 第 1 層敵人數；之後 +1/層
