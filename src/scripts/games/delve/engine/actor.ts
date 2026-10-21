// actor.ts — PlayerActor：一個玩家角色的全部狀態（身體 / 輸入 / 背包 / 裝備 / 生命 / 液體 / 技能 / 探索…）。
// DelveGame 以同名的相容 accessor（this.player、game.hp…）讀寫「目前 actor」cur；邏輯仍在 game.ts。
// 標 @internal 的欄位原本是 DelveGame 的 private：只給 game.ts 用（DelveGame 端是 private accessor）。
import type { Body, PlayerMotion } from './physics';
import type { Inventory } from './inventory';
import type { Appearance } from './appearance';
import { Vanity } from './vanity';
import type { DollLook } from './doll';
import type { BuffKind } from './folkDefs';
import type { Accessory, ItemId } from './items';
import { Equipment } from './equipment';
import { BASE_HP, BASE_MANA, computeStats, type PlayerStats } from './combat';
import { NO_CONTACT, type LiquidContact } from './swim';
import { Codex } from './codex';
import { Progression } from './levels';
import type { ActiveSkill } from './skills';
import type { ExploredMap, MapMarker } from './explore';
import type { Discovery } from './discovery';
import type { AttackState, FishingState, MiningState } from './game';

/** 玩家 id（solo / host 的本地玩家 = SOLO_PID） */
export type Pid = string;
export const SOLO_PID: Pid = 'h';
export type GameMode = 'solo' | 'host' | 'replica';

/** 一個 actor 的輸入（DelveGame.input(pid)；房主餵遠端輸入用）。寫入立即生效，語意同 setMoveX / setAim / setMining… */
export interface ActorInput {
  /** −1 / 0 / 1（超出範圍會被夾住） */
  moveX: number;
  jump: boolean;
  /** 按住「上」（繩索往上爬，否則等同跳躍） */
  up: boolean;
  /** 按住「下」（穿過單向平台） */
  drop: boolean;
  /** 游標所指 tile 座標（可帶小數 = 精確瞄準點，同 setAim）；讀回的是整數 tile */
  aim: { x: number; y: number };
  mining: boolean;
  use: boolean;
  /** 快捷欄選中格 */
  selected: number;
}

/** 角色檔身分（addActor 帶進來；removeActor 拍角色快照時沿用） */
export interface ActorIdentity { id: string; nick: string; createdAt: number; rev: number }

/** 呼吸泡泡數；頭在水 / 蜂蜜下每 BREATH_STEP 秒少一顆，出水每秒補 BREATH_REFILL 顆 */
export const MAX_BREATH = 10;

export class PlayerActor {
  constructor(readonly pid: Pid) {}

  /** 角色檔身分；本地 actor（建構子建的）為 null */
  who: ActorIdentity | null = null;

  /** 戰爭迷霧（存檔內容） */
  explored!: ExploredMap;
  /** 發現 / 日誌（存檔內容） */
  discovery!: Discovery;
  /** 使用者地圖標記（存檔內容） */
  markers: MapMarker[] = [];
  /** @internal */
  lastTile = { x: -1, y: -1 };
  player!: Body;
  inventory!: Inventory;
  /** 角色外觀（存檔內容；換外觀用 setAppearance，換成新物件 → 渲染器以參考判斷要不要重烘精靈） */
  appearance!: Readonly<Appearance>;
  /** 外觀欄（時裝）+ 防具隱藏開關（存檔內容） */
  vanity = new Vanity();
  /** @internal */
  dollMemo: { sig: string; look: DollLook; key: string } | null = null;
  /** @internal */
  motion: PlayerMotion = { jumpTimer: 0, jumpWasHeld: false, climbing: false };
  /** @internal */
  moveX = 0;
  /** @internal */
  jump = false;
  /** @internal */
  upHeld = false;
  /** 床（重生點，床頭 tile）；存檔內容 */
  bed: { x: number; y: number } | null = null;
  /** 設為重生點的據點爐心 id（spec §5.1：每個角色自己的；和床互斥）。本地玩家的這份同時是 settle.spawnCore（存檔照舊） */
  spawnCore: number | null = null;
  /** 目前的 buff：每種各自計時、可以同時有好幾種（祝福 / 守護 / 礦工之歌；存檔內容） */
  buffs: Partial<Record<BuffKind, number>> = {};
  /** 傳送石引導經過秒數；null = 沒在引導 @internal */
  recallT: number | null = null;
  /** 坐在小木船上（不存檔：讀檔後在水裡就是游泳）；渲染器在每個 boating 的 actor 腳下畫船 */
  boating = false;
  /** 飾品快取（以背包裡的飾品簽名判斷是否要重算） @internal */
  accSig = '';
  /** @internal */
  acc = new Set<Accessory>();
  /** @internal */
  aim = { x: 0, y: 0 };
  /** @internal */
  miningHeld = false;
  /** @internal */
  dropHeld = false;
  /** @internal */
  platformHinted = false;
  /** @internal */
  useHeld = false;
  /** @internal */
  placeCooldown = 0;
  /** 這次按住 use 已經用來開過箱子（按住不會一直重開 / 放置） @internal */
  useConsumed = false;
  /** 目前開著的箱子（tile 座標） */
  openChest: { x: number; y: number } | null = null;
  /** 目前在用的梳妝台（tile 座標）；比照箱子：走遠 / 被拆就關 */
  openMirror: { x: number; y: number } | null = null;
  /** @internal */
  mining: MiningState | null = null;
  /** @internal */
  lastBlocked = '';
  /** @internal */
  lastBlockedAt = -Infinity;
  /** 裝備欄（存檔內容） */
  equipment = new Equipment();
  /** 目前生命（浮點；顯示取整） */
  hp = BASE_HP;
  /** 生命上限（不含飾品）：100 + 生命晶核 × 20（存檔內容） */
  baseMaxHp = BASE_HP;
  mana = BASE_MANA;
  dead = false;
  /** 重生倒數（秒） */
  respawnT = 0;
  /** 已經躺上床等大家（B7：全員 ready 才開始睡；移動 / 受傷 / 離床取消） */
  sleepReady = false;
  /** 躺下時的位置（被傳走 / 摔下去 → 取消 ready） @internal */
  sleepPos: { x: number; y: number } | null = null;
  /** 自動瞄準最近的怪物（觸控用） */
  autoAim = false;
  facing: 1 | -1 = 1;
  attack: AttackState | null = null;
  /** @internal */
  attackCd = 0;
  /** @internal */
  iframes = 0;
  /** @internal */
  sinceHit = 99;
  /** @internal */
  knockT = 0;
  /** @internal */
  fallPeak: number | null = null;
  /** @internal */
  potionCd = 0;
  /** @internal */
  manaDelay = 0;
  /** @internal */
  aimPx = { x: 0, y: 0 };
  /** @internal */
  statsEq: Equipment | null = null;
  /** @internal */
  statsCache: PlayerStats = computeStats(new Equipment());
  /** 玩家這一刻和液體的接觸 */
  contact: LiquidContact = NO_CONTACT;
  breath = MAX_BREATH;
  /** @internal */
  drownT = 0;
  burning = 0;
  /** @internal */
  burnTick = 0;
  honeyT = 0;
  /** @internal */
  wasWet = 0;
  /** 進行中的釣魚（浮標）；null = 沒在釣 */
  fishing: FishingState | null = null;
  /** 釣魚紀錄：每種魚釣到幾條（存檔內容） */
  fishLog: Partial<Record<ItemId, number>> = {};
  /** @internal */
  foodCd = 0;
  /** @internal */
  miningWas = false;
  /** 裝備圖鑑（存檔內容） */
  codex = new Codex();
  /** 不滅冷卻（秒） */
  undyingCd = 0;
  /** @internal */
  statsKey = '';
  /** @internal */
  statsRefs: unknown[] = [];
  /** @internal */
  statsDirty = 0;
  /** 等級 / 經驗 / 技能樹 / 防刷紀錄（存檔內容） */
  levels = new Progression();
  /** 種族經驗加成的小數尾數（不存檔）：+10% 對 2~4 點的經驗也要逐次累積，不被四捨五入吃掉 @internal */
  raceXpCarry = 0;
  /** @internal */
  skillCd: Record<ActiveSkill, number> = { dash: 0, slam: 0, pulse: 0 };
  /** @internal */
  dashT = 0;
  /** @internal */
  dashDir: 1 | -1 = 1;
  /** 突進剛結束（下一刻把水平速度收回 DASH_CARRY） @internal */
  dashEnd = false;
  /** @internal */
  slamming = false;
  /** @internal */
  slamY = 0;
  /** @internal */
  slamPre = 0;
  /** 尋礦感知：t = 剩幾秒、max = 總秒數、x / y = 發動點（tile）、ores = 標到的礦（tile） */
  orePulse: { t: number; max: number; x: number; y: number; ores: { x: number; y: number; tile: number }[] } | null = null;
  /** 製圖師上次替這個玩家打聽到的地點（UI 顯示；付錢的人自己的地圖標記 / 迷霧，所以跟著 actor） */
  lastReveal: { name: string; x: number; y: number } | null = null;
}
