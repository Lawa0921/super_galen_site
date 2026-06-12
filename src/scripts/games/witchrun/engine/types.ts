// types.ts
export interface Vec { x: number; y: number; }

/** 敵彈外觀種類（渲染層挑紋理用；判定半徑見 constants.BULLET_R） */
export type BulletKind = 'rune' | 'wave' | 'page' | 'gear' | 'wisp' | 'bell';

export interface EnemyBullet {
  x: number; y: number;
  vx: number; vy: number;          // px/s
  ax: number; ay: number;          // px/s^2
  turnRate: number;                // rad/s，旋轉速度向量（螺旋彈用）
  kind: BulletKind;
  r: number;                       // 被彈判定半徑
  grazed: boolean;                 // 每顆只計一次擦彈
  active: boolean;
  bounces: number;                 // 剩餘左右牆反射次數
}

export interface PlayerBullet {
  x: number; y: number; vx: number; vy: number;
  dmg: number; active: boolean;
  split: boolean;     // 裂變魔彈產生的子彈不再分裂
}

export type StageId = 1 | 2 | 3 | 4;

export type EnemyKind =
  | 'bat' | 'wisp' | 'fairy'        // S1 墓園
  | 'tome' | 'blade'                // S2 藏書螺旋
  | 'gear' | 'angel'                // S3 鐘匠工坊
  | 'moth' | 'chime';               // S4 鐘樓頂

/** 道中敵路徑模型 */
export type PathKind = 'descend' | 'sine' | 'swoopL' | 'swoopR' | 'hover';

export interface Enemy {
  id: number; kind: EnemyKind;
  x: number; y: number;
  hp: number; alive: boolean;
  path: PathKind; t: number;        // t = 出生後累計 ms
  baseX: number;                    // sine/hover 的錨點
  fireCdMs: number;                 // 下次開火倒數
  beamAim?: number;                 // angel 預警鎖定角（beam 兩段式）
  elite?: boolean;                  // 中型機（F3 用）
}

export type BossId = 'gargoyle' | 'grimoire' | 'bellwright' | 'deadbell';

export type RelicId =
  | 'split'      // 裂變魔彈
  | 'familiar'   // 影子使魔
  | 'magnet'     // 貪婪磁石
  | 'moonlight'  // 月光護符
  | 'feather'    // 咒速羽毛
  | 'catalyst'   // 爆炎觸媒
  | 'echo'       // 回音鈴
  | 'pact'       // 血色契約
  | 'stardust';  // 星屑掃帚

export interface RelicDef { id: RelicId; name: string; desc: string; }

/** 遺物效果聚合後的修正值（engine 各處讀這個，不各自查遺物） */
export interface Modifiers {
  splitShot: boolean;        // 命中後分裂
  familiar: boolean;         // 僚機 50% 攻擊
  magnet: boolean;           // 吸金範圍擴大
  speedMult: number;         // 移速倍率
  hitboxMult: number;        // 被彈判定倍率（<1 縮小）
  fireField: boolean;        // 爆炎留火場
  overdriveDurMult: number;  // OVERDRIVE 時長倍率
  atkMult: number;           // 攻擊倍率
  lifeCapDelta: number;      // 殘機上限增減
  focusGrazeBonus: number;   // 低速模式擦彈累積加成（0.3 = +30%）
}

export interface Coin { x: number; y: number; vy: number; active: boolean; }

export interface PlayerState {
  x: number; y: number;
  lives: number; bombs: number;
  power: number;                    // 火力等級 1..4
  focus: boolean;
  invulnMs: number;
  fireCdMs: number;
  alive: boolean;
}

export type GameStatus = 'title' | 'playing' | 'draft' | 'gameover' | 'cleared';

export interface BossState {
  id: BossId; x: number; y: number;
  hp: number; maxHp: number; phase: number; alive: boolean;
}

export interface WitchState {
  status: GameStatus;
  stage: StageId;
  player: PlayerState;
  /** 子彈/敵人/金幣皆為 game.ts 內部陣列的直接引用（避免每 tick 複製）：
   *  子彈池含 inactive 項需以 active 過濾；外部只可讀，不可變更。 */
  playerBullets: PlayerBullet[];
  enemyBullets: EnemyBullet[];
  enemies: Enemy[];
  coins: Coin[];
  boss: BossState | null;
  score: number;
  grazeChain: number;               // 擦彈連鎖（被彈歸零）
  overdrive: { gauge: number; activeMs: number };  // gauge 0..100
  relics: RelicId[];
  draftChoices: RelicId[];          // status==='draft' 時的三選一
  bellTolls: number;                // 亡鐘已敲響數（敘事 HUD 用）
  drops: Drop[];                    // 道具掉落（F3 用，先加欄位）
}

/** 道具掉落（F3 用，先定型別）。 */
export interface Drop {
  x: number; y: number; vy: number;
  kind: 'power' | 'bomb';
  active: boolean;
}

export type WitchEvent =
  | { kind: 'shoot' }
  | { kind: 'graze'; x: number; y: number }
  | { kind: 'overdrive' }                       // 引爆
  | { kind: 'inferno' }                         // 爆炎術
  | { kind: 'enemyKill'; x: number; y: number }
  | { kind: 'playerHit' }
  | { kind: 'coin' }
  | { kind: 'bossSpawn'; id: BossId }
  | { kind: 'bossPhase'; id: BossId; phase: number }
  | { kind: 'bossDefeat'; id: BossId }
  | { kind: 'bellToll'; count: number }         // 亡鐘鐘波
  | { kind: 'draftOpen'; choices: RelicId[] }
  | { kind: 'relicPicked'; id: RelicId }
  | { kind: 'stageStart'; stage: StageId }
  | { kind: 'gameover' }
  | { kind: 'cleared' }
  | { kind: 'telegraph'; x1: number; y1: number; x2: number; y2: number; durMs: number }
  | { kind: 'eliteKill'; x: number; y: number }
  | { kind: 'badEnd' };

export type InputAction = 'up' | 'down' | 'left' | 'right' | 'focus' | 'bomb' | 'overdrive';
