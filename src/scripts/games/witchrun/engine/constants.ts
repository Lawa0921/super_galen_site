// constants.ts
/** 邏輯場域（直式 3:4）。渲染層等比縮放置中。 */
export const FIELD_W = 480;
export const FIELD_H = 640;

/** 自機。 */
export const PLAYER_SPEED = 240;        // px/s
export const FOCUS_SPEED = 120;         // 低速模式 px/s
export const PLAYER_HIT_R = 3;          // 被彈判定半徑
export const GRAZE_R = 18;              // 擦彈判定半徑
export const PLAYER_SPAWN = { x: 240, y: 560 } as const;
export const START_LIVES = 3;
export const LIFE_CAP = 5;
export const START_BOMBS = 3;
export const BOMB_CAP = 5;
export const INVULN_MS = 2000;
export const HIT_CLEAR_R = 160;         // 被彈後自動小清屏半徑（防連死）

/** 自機火力：power 1..4；每級子彈道數。 */
export const POWER_MAX = 4;
export const FIRE_INTERVAL_MS = 100;
export const PLAYER_BULLET_SPEED = 720;
export const PLAYER_BULLET_DMG = 1;

/** 子彈池上限。 */
export const MAX_ENEMY_BULLETS = 600;
export const MAX_PLAYER_BULLETS = 96;
export const BULLET_CULL_MARGIN = 32;   // 出界 margin 後回收

/** OVERDRIVE。 */
export const OVERDRIVE_MAX = 100;
export const GRAZE_GAIN = 2.5;          // 每次擦彈 +2.5
export const OVERDRIVE_DURATION_MS = 3000;

/** 爆炎術。 */
export const INFERNO_INVULN_MS = 1200;  // 放爆炎附帶短無敵
export const INFERNO_DMG = 30;          // 對全場敵人傷害

/** 敵彈判定半徑（依外觀種類）。 */
export const BULLET_R: Record<'rune' | 'wave' | 'page' | 'gear' | 'wisp' | 'bell', number> =
  { rune: 4, wave: 6, page: 5, gear: 7, wisp: 4, bell: 6 };

/** 實體判定半徑與金幣。 */
export const ENEMY_R = 14;
export const BOSS_R = 36;
export const COIN_R = 8;
export const COIN_PICKUP_R = 28;
export const COIN_MAGNET_R = 120;       // 貪婪磁石拾取半徑
export const COIN_FALL_SPEED = 90;      // px/s
export const POWER_COINS = 15;          // 每 15 金幣火力 +1
export const MAX_ENEMIES = 32;
export const FIRE_FIELD_MS = 3000;      // 爆炎觸媒火場持續
export const FIRE_FIELD_DPS = 4;        // 火場每秒傷害
export const STEP_CAP_MS = 100;         // 單次 step 上限（分頁切回防爆衝）

/** 全局十二響時限。 */
export const BELL_TOLL_INTERVAL_MS = 75_000;  // 全局亡鐘每響間隔
export const BELL_TOLL_MAX = 12;              // 敲滿即 Bad End
export const BELL_SURGE_MS = 5_000;           // 鐘響後彈速增幅持續
export const BELL_SURGE_MULT = 1.15;

/** Boss 衝刺。 */
export const BOSS_DASH_CD_MS = 6_000;
export const BOSS_DASH_DUR_MS = 600;

/** 清彈轉星屑上限。 */
export const CANCEL_COIN_CAP = 40;
