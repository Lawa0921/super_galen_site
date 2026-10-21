// game.ts — DelveGame：固定步長模擬（輸入 → 物理 → 挖掘/放置 → 時間）。不碰 DOM。
// render/input 層的典型用法：
//   game.setMoveX(-1|0|1); game.setJump(bool); game.setAim(tx, ty);
//   game.setMining(bool); game.setUse(bool); game.selectSlot(i);
//   while (acc >= FIXED_DT) { game.step(FIXED_DT); acc -= FIXED_DT; }
//   for (const ci of game.world.drainDirty()) redrawChunk(ci);
//   const light = game.computeLight(viewRectInTiles);
//   for (const e of game.drainEvents()) playSfx(e);
import { World, type ColumnSource } from './world';
import { chunkOfX, defaultBounds, type WorldBounds } from './coords';
import { OuterGen, frameOf } from './chunkgen';
import { LOAD_COLS, planStreaming } from './streaming';
import { generateWorld, type GenResult, type BiomeSegment, type Structure, type Landform, type ReservedZone, type GenLayers } from './worldgen';
import type { DungeonInfo } from './gen/dungeon';
type GenRelic = { x: number; y: number; item: ItemId; where: string };
import { T, W, TIER_UNBREAKABLE, tileDef, isSolidTile, isChestTile, isDoorTile, isInteractive, isBedTile, floorOk, ceilOk, ropeOk } from './tiles';
import { ITEMS, INFO_ACCESSORIES, type Accessory, type ItemDef, type ItemId, type PickStats, type WeaponDef, type WeaponKind } from './items';
import { bossRebirth, potLoot, type Drop } from './loot';
import { Inventory, starterInventory, type Stack } from './inventory';
import { craft as craftRecipe, findRecipe, type CraftResult, type Station } from './crafting';
import { makeBody, stepPlayer, onPlatform, type Body, type MoveStats } from './physics';
import { LightEngine, skyBrightness, type LightMap, type LightRect, type PointLight, type LightRGB } from './lighting';
import { skyColor, isNight as skyIsNight } from './sky';
import {
  START_TIME, dateOf, dayIndexOf, formatDate, moonPhase, nextSunrise, seasonOf, sunTimes, DAYS_PER_SEASON, DAYS_PER_YEAR,
  type GameDate, type Season, type SunTimes,
} from './calendar';
import { localWeather, weatherAt, weatherDim, type WeatherKind, type WeatherState } from './weather';
import { freezeColumns, updateFreeze } from './frost';
import {
  FISH, POOL_COUNT_MAX, biteDelay, biteWindow, canFishIn, crateLoot, fishingPower, rollCatch, timeSlot, type DepthZone, type TimeSlot,
} from './fishing';
import { ExploredMap, toggleMarker, type MapMarker } from './explore';
import { Discovery, buildRegions, outerRegions, type Region, type RegionCat } from './discovery';
import { EQUIP_SLOTS, type EquipSlot } from './equipment';
import {
  BASE_MANA, LIFE_CORE_HP, MAX_HP_CAP, SAFE_FALL_TILES, computeStats, damageTaken, enemyDamage, fallDamage,
  knockbackScale, regenRate, rollCrit, type PlayerStats,
} from './combat';
import { DropList, LODESTONE_TILES, MAGNET_TILES, overlaps, popVelocity, type PhysEnv, type Picker } from './entities';
import { LiquidSim, type ReactionKind, type SpringSpec } from './liquid';
import { LIQ, LIQ_MAX } from './liquidKind';
import { liquidContact, liquidMedium, playerMedium } from './swim';
import { BOAT_DRAFT, boatWaterline, canBoard, stepBoat } from './boat';
import { normalizeAppearance, RACES, type Appearance } from './appearance';
import { raceMods, type RaceMods } from './race';
import { VANITY_SLOTS, type HideSlot, type VanitySlot } from './vanity';
import { buildDollLook, dollKey, pieceOf, type DollLook } from './doll';
import { planWardrobeMigration } from './wardrobeMigration';
import { defaultTint, tintChannels, validTint, type Tint } from './tint';
import { ProjList, type HitFx, type ProjKind, type Projectile } from './projectiles';
import {
  ascendCost, ascendGear, baseTier, gearSlot, ilvlForDepth, rerollAffix, rerollCost, rollDropItem, rollGear, rollRarity,
  salvageYield, upgradeCost, upgradeGear, weaponDamage, affixDef, pickSpeed, MAX_PLUS, STAT_CAPS, type AffixId, type Cost, type Gear, type GearTotals, type LootSource,
} from './gear';
import { MAX_BREATH, PlayerActor, SOLO_PID, type ActorInput, type GameMode, type Pid } from './actor';
// 角色檔 ↔ actor（addActor / removeActor）。save/ 也 import 本檔：兩邊都只在函式內用對方，循環 import 無妨
import { applyCharacter, snapshotGame } from '../save/serialize';
import { characterState, splitSnapshot } from '../save/worldSave';
import type { DelveCharacter } from '../save/character';
import { ENEMIES, makeEnemy, stepEnemy, type AiCtx, type Enemy, type EnemyKind } from './enemies';
import {
  ACTIVE, BED_SAFE, DEFAULT_VIEW_HALF, DESPAWN, MAX_ENEMIES, NEAR_SPAWN_TILES, SPAWN_MAX, findSpot, habitatAt, homeNear, inHouse,
  isFirstNight, pickEntry, spawnCap, spawnChance, spawnInterval, spawnTable, type SpawnPressure,
} from './spawn';
import { Rng, type RngState } from './rng';
import { CALM_REGEN, Settlements, inClaim, type SettleEvent, type SettleHost, type Npc } from './settlement';
import { NPCS, earn, forgeMul, npcLine, pay, shopPrice, walletOf, type NpcKind } from './npcs';
import { PAIR_OF_LEFT, PAIR_OF_RIGHT } from './furniture';
import { findStandSpot } from './npcPath';
import { FolkWorld, type FolkEvent, type FolkHost, type FolkNpc } from './folk';
import { ROLES, AFF_QUEST, AFF_RESCUE, BUFFS, affMul, affTier, type BuffKind, type FolkService } from './folkDefs';
import { QuestLog, type QuestDef, type GiverInfo, type QuestCtx } from './quests';
import { landmarkReward } from './sites';
import type { VillageInfo, HallInfo } from './gen/settlements';
import type { LandmarkInfo } from './gen/landmarks';
import { isLandmarkTile } from './tiles';
import { WALL_ITEM } from './items';
import {
  levelDef, levelHp, lootIlvl, milestoneAt, respecCost, skillPointsAt, titleFor, xpForEvent, type GainResult, type XpCtx, type XpSource,
} from './levels';
import {
  ACTIVE_NODE, DASH_CARRY, DASH_IFRAMES, DASH_SPEED, DASH_TIME, THIRD_JUMP_HOLD, FURY_BELOW, PULSE_MAX, PULSE_RADIUS, PULSE_TIME, SKILL_CD, SLAM_BASE, SLAM_DIVE,
  SLAM_DIVE_BONUS, SLAM_KB, SLAM_PER_LEVEL, SLAM_RADIUS, gearBonus, type ActiveSkill, type LearnFail, type SkillId,
} from './skills';
import {
  TILE_SIZE, CHUNK, FIXED_DT, REACH_TILES, STATION_RANGE, PLACE_COOLDOWN, DAY_LENGTH, HOTBAR_SIZE, JUMP_SPEED, JUMP_HOLD,
} from './constants';

export interface DelveOptions {
  seed?: string | number;
  width?: number;
  height?: number;
  /** 和平模式：不自然生成怪物 */
  peaceful?: boolean;
  /** 預先生成好的世界（generateWorldSteps 分段生成；必須是同一個 seed / 大小） */
  gen?: GenResult;
  /** 角色外觀（省略 = 預設外觀） */
  appearance?: Appearance;
  /** 水平邊界（省略 = defaultBounds(width, height)：正式尺寸無限、小尺寸的測試世界有界） */
  bounds?: WorldBounds;
  /** 中央以外的欄由誰生成（省略 = 無限世界用外圍生成器 OuterGen；測試可注入） */
  columnSource?: ColumnSource;
}

export type BlockReason = 'reach' | 'tier' | 'full' | 'body' | 'support' | 'occupied' | 'chest' | 'locked' | 'golden'
  /** 戰鬥：沒有箭 / 魔力不足 / 現在不能召喚首領 / 藥水冷卻中 / 生命已達上限 */
  | 'ammo' | 'mana' | 'summon' | 'potion' | 'maxlife'
  /** 床：附近有怪，不能睡 */
  | 'sleep'
  /** 釣魚：沒有魚餌；吃東西：血是滿的 */
  | 'bait' | 'full_hp'
  /** 據點：範圍和別的據點重疊；商店：錢不夠 / 背包滿 */
  | 'claim' | 'coins' | 'bagfull'
  /** 傳送點：目的地爐心旁沒有空位 */
  | 'blockedspot';
/** 遊戲事件；pid = 由哪個玩家的動作產生（多 actor 時才有；世界事件 / 單機沒有 = 公開） */
export type DelveEvent = DelveEventBody & { pid?: Pid };
type DelveEventBody =
  | { type: 'mine'; x: number; y: number; tile: number; item: ItemId | null }
  | { type: 'place'; x: number; y: number; tile: number; item: ItemId }
  | { type: 'craft'; recipe: string; item: ItemId; n: number }
  | { type: 'blocked'; action: 'mine' | 'place' | 'use'; reason: BlockReason; x: number; y: number }
  | { type: 'select'; slot: number }
  | { type: 'chest'; open: boolean; x: number; y: number }
  /** 梳妝台：開啟（UI 開衣櫥 'mirror' 模式）/ 關閉（走遠、被拆、UI 關掉） */
  | { type: 'mirror'; open: boolean; x: number; y: number }
  /** 轉生之藥：UI 開種族選單（確定後呼叫 game.rebirth） */
  | { type: 'rebirth' }
  | { type: 'door'; open: boolean; x: number; y: number; unlocked: boolean }
  | { type: 'unlock'; x: number; y: number; item: ItemId }
  /** 讀古碑；first = 第一次讀到（收進日誌） */
  | { type: 'lore'; id: number; x: number; y: number; first: boolean }
  /** 第一次進入某地區 / 地標 */
  | { type: 'discover'; region: { id: number; name: string; cat: RegionCat; kind: string } }
  /** 第一次拿到某件珍寶（獨特道具） */
  | { type: 'treasure'; item: ItemId }
  | { type: 'hint'; id: 'platform' }
  /** 床：set = 設定重生點；false = 床被拆掉、重生點回到出生點 */
  | { type: 'spawn'; set: boolean; x: number; y: number }
  /** 傳送石：開始引導 / 取消 / 完成傳送（x,y = 目的地腳底 tile） */
  | { type: 'recall'; phase: 'start' | 'cancel' | 'done'; x: number; y: number }
  /** 小木船：上船 / 下船（按跳、擱淺、傳送、死亡） */
  | { type: 'boat'; on: boolean }
  // ── 戰鬥 ──
  /** 開始一次攻擊（音效 / 動畫） */
  | { type: 'attack'; item: ItemId; kind: WeaponKind }
  /** 打中怪物（x,y = 數字位置 px） */
  | { type: 'hit'; id: number; kind: EnemyKind; x: number; y: number; amount: number; crit: boolean }
  /** 玩家受傷（fall = 摔落；cause = 溺水 / 熔岩 / 燃燒） */
  | { type: 'hurt'; x: number; y: number; amount: number; fall: boolean; cause?: 'drown' | 'lava' | 'burn' }
  | { type: 'kill'; id: number; kind: EnemyKind; x: number; y: number }
  | { type: 'death'; x: number; y: number }
  | { type: 'respawn'; x: number; y: number }
  /** 撿起來；rarity = 帶詞條裝備的稀有度 */
  | { type: 'pickup'; item: ItemId; n: number; rarity?: number }
  // ── 裝備詞條 ──
  /** 地上出現一件裝備（掉落 / 擊殺；音效與光柱用） */
  | { type: 'loot'; item: ItemId; rarity: number; x: number; y: number }
  /** 連鎖閃電（px 折線：第一點 = 被打中的怪） */
  | { type: 'chain'; pts: { x: number; y: number }[] }
  /** 不滅：致命傷被撐住 */
  | { type: 'undying'; x: number; y: number }
  /** 圖鑑新收錄詞條 */
  | { type: 'codex'; affix: AffixId }
  /** 分解 */
  | { type: 'salvage'; count: number; shard: number; dust: number }
  /** 鍛造（洗煉 / 強化 / 升階） */
  | { type: 'forge'; action: 'reroll' | 'upgrade' | 'ascend'; slot: number | EquipSlot; item: ItemId }
  /** 空中再跳（凌雲）；px */
  | { type: 'airjump'; x: number; y: number }
  /** 攀爬：grab = 抓住繩索、mantle = 開始攀上邊緣（x, y = 牆角 px）、top = 攀上去站穩 */
  | { type: 'climb'; phase: 'grab' | 'mantle' | 'top'; x: number; y: number }
  | { type: 'heal'; amount: number; x: number; y: number }
  | { type: 'lifeup'; maxHp: number }
  | { type: 'boss'; phase: 'spawn' | 'phase2' | 'defeated' | 'leave'; kind: EnemyKind }
  /** 怪物射出投射物 / 投射物撞牆（音效、火花） */
  | { type: 'shot'; kind: ProjKind; hostile: boolean }
  | { type: 'impact'; kind: ProjKind; x: number; y: number }
  // ── 液體 ──
  /** 液體反應（水 + 熔岩 → 黑曜石、蜂蜜 + 熔岩 → 酥蜜塊、太少只冒煙）；tile 座標 */
  | { type: 'liquid'; kind: ReactionKind; x: number; y: number }
  /** 玩家掉進 / 跳出液體（px；big = 速度快）；liquid = LIQ.* */
  | { type: 'splash'; x: number; y: number; liquid: number; big: boolean }
  /** 水下少了一顆呼吸泡泡（left = 剩幾顆） */
  | { type: 'bubble'; left: number }
  /** 用桶子 / 海綿（舀 / 倒 / 吸），tile 座標 */
  | { type: 'liquidtool'; action: 'scoop' | 'pour' | 'sponge'; liquid: number; x: number; y: number }
  // ── 曆法 / 天氣 ──
  /** 睡覺：start = 開始淡出、wake = 天亮醒來（時間已跳到日出） */
  | { type: 'sleep'; phase: 'start' | 'wake' }
  | { type: 'sleep'; phase: 'wait'; ready: number; total: number }
  /** 閃電（x, y = 打在地表的 tile；dist = 離玩家幾格，雷聲延遲用） */
  | { type: 'lightning'; x: number; y: number; dist: number }
  // ── 釣魚 ──
  /**
   * cast 拋竿、land 浮標落水、bite 上鉤（浮標下沉，要在判定窗內按）、catch 釣到（item）、escape 魚跑了、
   * reel 收竿（沒釣到）、snag 浮標卡到牆、burn 浮標掉進熔岩燒掉、snap 走太遠線斷了；x, y = 浮標（px）
   */
  | { type: 'fish'; phase: 'cast' | 'land' | 'bite' | 'catch' | 'escape' | 'reel' | 'snag' | 'burn' | 'snap'; x: number; y: number; item?: ItemId; liquid?: number }
  /** 打開木箱 */
  | { type: 'crate'; item: ItemId; drops: { item: ItemId; n: number }[] }
  /** 吃東西 */
  | { type: 'eat'; item: ItemId; amount: number }
  // ── 據點 / 居民 ──
  | SettleEvent
  /** 和居民說話（UI 開居民面板） */
  | { type: 'talk'; kind: NpcKind; line: string }
  /** 點了據點爐心（UI 開據點面板） */
  | { type: 'hearth'; id: number; x: number; y: number }
  /** 商店：買 / 賣 / 服務 */
  | { type: 'trade'; kind: NpcKind; action: 'buy' | 'sell' | 'service'; item?: ItemId; n?: number; coins: number }
  /** 傳送點：從一個據點傳到另一個 */
  | { type: 'travel'; from: number; to: number; x: number; y: number }
  // ── 世界 NPC / 委託 / 地標 ──
  | FolkEvent
  /** 和村民 / 矮人 / 旅人說話（UI 開 NPC 面板）；board = 從委託板打開 */
  | { type: 'folktalk'; key: string; line: string; board?: boolean }
  /** 和村民 / 矮人 / 旅人交易 / 服務 */
  | { type: 'folktrade'; key: string; action: 'buy' | 'sell' | 'service'; item?: ItemId; n?: number; coins: number; service?: FolkService }
  /** 委託：接下 / 進度 / 條件達成 / 交付 */
  | { type: 'quest'; phase: 'accept' | 'progress' | 'ready' | 'done' | 'failed'; id: string; title: string; progress?: number; n?: number }
  /** 地標：第一次領到（first）/ 已經領過 */
  | { type: 'landmark'; x: number; y: number; tile: number; first: boolean; title: string; text: string; clue: string | null; items: { item: ItemId; n: number }[]; coins: number }
  /** 得到 / 失去 buff */
  | { type: 'buff'; kind: BuffKind; on: boolean }
  /** 據點的嚮導每天自動標出的地點 */
  | { type: 'scoutmark'; by: string; name: string; x: number; y: number }
  // ── 等級 / 技能（engine/levels.ts、engine/skills.ts） ──
  /** 得到經驗（x, y = 飄字位置 px） */
  | { type: 'xp'; amount: number; src: XpSource; x: number; y: number }
  /** 升到 level 級（每一級一個）；title = 里程碑稱號（每 5 級），points = 升完這級時可用的技能點 */
  | { type: 'levelup'; level: number; points: number; title: string | null; maxHp: number }
  /** 死亡失去的經驗 */
  | { type: 'xploss'; amount: number }
  /** 點了一級技能 / 重置技能樹 / 惜料退回材料 */
  | { type: 'learn'; id: SkillId; rank: number }
  | { type: 'respec'; refunded: number }
  | { type: 'refund'; item: ItemId }
  /** 主動技能：start 發動、land 震地落地（n = 打到幾隻）、cd 冷卻中（n = 剩幾秒）；pulse 的 n = 標到幾格礦 */
  | { type: 'skill'; skill: ActiveSkill; phase: 'start' | 'land' | 'cd'; x: number; y: number; n: number };

/** 釣魚狀態：flying 浮標在空中、floating 漂在液面等上鉤、bite 上鉤（判定窗內） */
export interface FishingState {
  state: 'flying' | 'floating' | 'bite';
  /** 浮標位置 / 速度（px） */
  x: number; y: number; vx: number; vy: number;
  /** 這個狀態經過的秒數；wait = 上鉤等待、window = 判定窗 */
  t: number; wait: number; window: number;
  liquid: number;
  rod: ItemId; bait: ItemId; power: number;
  /** debug：下一次釣起來固定是這個 */
  forced: ItemId | null;
}

/** 進行中的攻擊（render 動畫 + 近戰判定） */
export interface AttackState {
  item: ItemId; kind: WeaponKind;
  /** 這次攻擊的傷害 / 擊退（含強化與詞條；近戰判定用） */
  dmg?: number; kb?: number;
  fx?: HitFx;
  /** 已經過秒數 / 總秒數 */
  t: number; dur: number;
  /** 瞄準角（弧度，世界座標，0 = 右） */
  angle: number;
  dir: 1 | -1;
  id: number;
}

export interface MiningState { x: number; y: number; elapsed: number; need: number; }

export interface DelveState {
  seed: string;
  tick: number;
  time: number;
  sky: number;
  player: {
    x: number; y: number; vx: number; vy: number; onGround: boolean; tileX: number; tileY: number; gfxOffY: number; climbing: boolean;
    /** 攀上邊緣：p = 進度 0..1、dir = 朝哪邊、edgeX / edgeY = 牆角（px）；null = 沒在攀 */
    mantle: { p: number; dir: 1 | -1; edgeX: number; edgeY: number } | null;
  };
  spawn: { x: number; y: number };
  aim: { x: number; y: number };
  selected: number;
  held: Stack | null;
  inventory: (Stack | null)[];
  mining: { x: number; y: number; progress: number } | null;
  nearWorkbench: boolean;
  /** 開著的箱子 */
  chest: { x: number; y: number } | null;
  /** 傳送石引導進度 0..1（0 = 沒在引導） */
  recall: number;
  /** 床（重生點）；null = 出生點 */
  bed: { x: number; y: number } | null;
  // ── 戰鬥 ──
  hp: number; maxHp: number; mana: number; maxMana: number;
  dead: boolean;
  /** 重生倒數（秒） */
  respawnIn: number;
  defense: number;
  facing: 1 | -1;
  attack: { item: ItemId; kind: WeaponKind; progress: number; angle: number; dir: 1 | -1 } | null;
  /** 受傷無敵剩餘秒數 */
  iframes: number;
  equipment: { head: ItemId | null; body: ItemId | null; legs: ItemId | null; acc: (ItemId | null)[] };
  setBonus: string | null;
  enemies: number;
  drops: number;
  boss: { kind: EnemyKind; hp: number; maxHp: number; phase: number } | null;
  peaceful: boolean;
  bossesDefeated: string[];
  // ── 液體 ──
  /** 呼吸（泡泡數，0..maxBreath；可以是小數） */
  breath: number;
  maxBreath: number;
  /** 著火剩餘秒數 */
  burning: number;
  /** 蜂蜜回血效果剩餘秒數 */
  honey: number;
  /** 玩家和液體的接觸 */
  liquid: { type: number; frac: number; head: boolean };
  // ── 曆法 / 天氣 ──
  /** 第幾天（0 起算）、季節（0 春 … 3 冬）、玩家所在處的天氣 */
  day: number;
  season: number;
  weather: WeatherKind;
  /** 睡覺淡出 / 淡入 0..1（0 = 沒在睡） */
  sleep: number;
  /** 釣魚（浮標位置 px / 狀態）；null = 沒在釣 */
  fishing: { state: FishingState['state']; x: number; y: number; liquid: number } | null;
  /** 裝備詞條加總（已套上限；含手上武器 / 使用中的鎬） */
  gear: GearTotals;
  /** 不滅冷卻剩餘秒數 */
  undyingCd: number;
  /** 等級 / 經驗（into / need = 本級進度）/ 可用技能點 / 稱號 */
  level: { level: number; xp: number; into: number; need: number; points: number; title: string };
  /** 主動技能冷卻剩餘秒數 */
  skillCd: Record<ActiveSkill, number>;
}

/** 徒手（背包沒有鎬）時的挖掘能力 */
const HAND: PickStats = { speed: 0.35, tier: 1 };
/** 同一個 blocked 提示重複出現的最短間隔（秒） */
const BLOCK_REPEAT = 1.8;
/** 傳送石引導時間（秒） */
export const RECALL_TIME = 1.2;
/** 磁石增加的伸手距離（格） */
export const MAGNET_REACH = 3;
/** 互動基準點：腳底往上幾 px（舊碰撞盒 42 px 的一半） */
export const REACH_CENTER_Y = 21;
/** 玩家周圍自動揭露的半徑（格） */
export const REVEAL_RADIUS = 9;
/** 畫面上光照 ≥ 此值的格算「看見了」 */
export const REVEAL_LIGHT = 0.3;
/** 手持發光物的色相（最大通道 1） */
const HELD_HUE: Partial<Record<ItemId, LightRGB>> = {
  torch: [1, 0.74, 0.46], lantern: [1, 0.9, 0.6], lumen_blade: [0.5, 0.95, 1], crystal_staff: [0.82, 0.5, 1],
};
const NIGHT_HUE: LightRGB = [0.75, 1, 0.85];
const FIRE_HUE: LightRGB = [1, 0.5, 0.18];
const BOLT_HUE: LightRGB = [1, 0.6, 0.85];
const WAVE_HUE: LightRGB = [0.5, 0.95, 1];
/** 受傷後無敵秒數 */
export const IFRAMES = 0.8;
/** 死亡到重生的秒數 */
export const RESPAWN_TIME = 4;
/** 載入 / 重生後幾秒內不自然生成怪物（喘口氣） */
export const SPAWN_GRACE = 10;
/** 治療藥水：回復量與冷卻 */
export const POTION_HEAL = 60;
export const POTION_COOLDOWN = 30;
/** 魔力回復（每秒）與施法後延遲 */
export const MANA_REGEN = 7;
/** 死亡時掉落身上多少比例的錢幣 */
export const DEATH_COIN_LOSS = 0.5;
// ── 液體 ──
/** 呼吸泡泡數；頭在水 / 蜂蜜下每 BREATH_STEP 秒少一顆，出水每秒補 BREATH_REFILL 顆 */
export { MAX_BREATH };
export const BREATH_STEP = 1.6;
export const BREATH_REFILL = 4;
/** 沒氣了：每 DROWN_EVERY 秒扣 DROWN_DMG（不看防禦、不給無敵時間） */
export const DROWN_DMG = 3;
export const DROWN_EVERY = 0.5;
/** 熔岩：碰到時的傷害（扣防禦、有無敵時間）+ 著火 BURN_TIME 秒（每 0.5 秒 BURN_DMG，不自然回血） */
export const LAVA_DMG = 30;
export const BURN_TIME = 7;
export const BURN_DMG = 2;
/** 種族「光源 +1」：每點在身邊加的柔光強度（0..1；比夜視護符 0.78 暗） */
const RACE_LIGHT_GLOW = 0.3;
/** 蜂蜜：泡過之後 HONEY_TIME 秒內每秒多回 HONEY_REGEN */
export const HONEY_TIME = 10;
export const HONEY_REGEN = 2;
/** 液體工具（水桶 / 海綿）按住時的重複間隔（秒） */
export const LIQUID_TOOL_CD = 0.25;
/** 空桶至少要舀到這麼多（半桶）才算一桶 */
export const SCOOP_MIN = 128;
/** 液體模擬在瀏覽器每刻的時間預算（ms；session 設定，測試不設 → 確定性） */
export const LIQUID_BUDGET_MS = 2;
/** 夜晚：比當天日出早、或比日落晚超過一個曙暮光（日出 / 日落隨季節變化，見 calendar.sunTimes） */
export function isNightTime(t: number): boolean {
  const s = sunTimes(dayIndexOf(t));
  return skyIsNight(t / DAY_LENGTH, s.sunrise, s.sunset, s.twilight);
}
// ── 曆法 / 天氣 ──
/** 睡覺：淡出 SLEEP_FADE 秒 → 跳到日出 → 淡入 SLEEP_FADE 秒 */
export const SLEEP_FADE = 1.2;
/** 這個範圍（格）內有怪就不能睡 */
export const SLEEP_SAFE = { x: 30, y: 20 };
/** 閃電間隔（秒）與閃光時間 */
export const BOLT_MIN = 2.5;
export const BOLT_MAX = 10;
export const FLASH_TIME = 0.32;
/** 雨水：每 RAIN_EVERY 秒挑一欄，露天水面那格補 RAIN_ADD（最多補到 RAIN_TOP，不會長出新的一層 → 有上限） */
export const RAIN_EVERY = 0.3;
export const RAIN_ADD = 6;
export const RAIN_TOP = 250;
/** 強制天氣（debug / e2e）時的風 */
const FORCED_WIND: Record<WeatherKind, number> = { clear: 0.15, cloudy: 0.3, rain: 0.45, storm: 0.85, snow: 0.3, fog: 0.05 };
// ── 釣魚 ──
/** 浮標的重力 / 最快拋出速度（px/s²、px/s） */
export const BOBBER_GRAVITY = 760;
export const CAST_SPEED_MAX = 430;
/** 浮標離玩家超過這麼多格 → 線斷了 */
export const LINE_MAX_TILES = 26;
/** 吃東西的冷卻（秒） */
export const FOOD_COOLDOWN = 1;
/** 挖掘掉魚餌的機率 */
export const WORM_CHANCE = 1 / 12;
export const GRUB_CHANCE = 1 / 10;
export const BUG_CHANCE = 1 / 6;
export const SUNBEETLE_CHANCE = 1 / 150;
/** 首領：燈脈守望者的掉落 */
export const BOSS_DROPS: { item: ItemId; n: number }[] = [
  { item: 'lumen_blade', n: 1 }, { item: 'warden_heart', n: 1 }, { item: 'warden_trophy', n: 1 },
  { item: 'healing_potion', n: 5 }, { item: 'silver_coin', n: 12 },
];
/** 首領：每次擊敗另外掉一件時裝（從這些款式裡抽一件；高稀有款） */
export const BOSS_FASHION: readonly ItemId[] = ['idol_top', 'idol_bottom', 'gothic_top', 'gothic_bottom', 'acc_crown'];
/** 首領 → 召喚它用掉的道具（首領戰中存檔讀檔時退還） */
export const BOSS_SUMMON_ITEM: Partial<Record<EnemyKind, ItemId>> = { lantern_warden: 'wick_offering' };
// ── 裝備詞條 ──
/** 一般怪物掉一件裝備的機率（× (1 + 幸運%)）；首領另外掉 BOSS_GEAR 件 */
export const GEAR_DROP_CHANCE = 0.05;
export const BOSS_GEAR = 2;
/** 木箱開出裝備的機率；釣魚直接釣到裝備的機率 */
export const CRATE_GEAR: Record<'wooden_crate' | 'iron_crate' | 'golden_crate', number> = { wooden_crate: 0.12, iron_crate: 0.3, golden_crate: 0.65 };
export const FISH_GEAR_CHANCE = 0.02;
/** 連鎖閃電：半徑（格）、最多幾隻、傷害倍率 */
export const CHAIN_RADIUS = 6;
export const CHAIN_MAX = 3;
export const CHAIN_MUL = 0.6;
/** 冰凍：秒數 / 動作速度倍率；中毒：秒數、每 0.5 秒扣 maxHp 的 1.5%（1..6） */
export const FROST_TIME = 2.5;
export const FROST_SLOW = 0.5;
export const POISON_TIME = 4;
/** 生命竊取每下最多回多少 */
export const LEECH_CAP = 6;
const ORE_TILES = new Set<number>([T.COPPER_ORE, T.IRON_ORE, T.SILVER_ORE, T.GOLD_ORE]);
/** 傳說之魚（第一次釣到給比較多經驗） */
const LEGEND_FISH = new Set<ItemId>(FISH.filter((f) => f.rarity === 'legendary').map((f) => f.item));
/** 會換算經驗的事件種類（engine/levels.ts xpForEvent） */
const LEVEL_EVENTS = new Set<DelveEvent['type']>(['kill', 'place', 'mine', 'chest', 'craft', 'discover', 'lore', 'treasure', 'codex', 'fish', 'rooms', 'settlement', 'npc']);
/**
 * 私人事件：帶 pid 時只給那個玩家（drainEvents(pid)）——自己的 HUD / 面板 / 提示 / 背包 / 經驗。
 * 其他種類（挖 / 放 / 擊殺 / 命中 / 首領 / 液體 / 閃電 / 睡覺 / 門 / 死亡 / 攻擊音效…）帶不帶 pid 都是公開的；沒有 pid 的事件一律公開。
 */
export const PRIVATE_EVENTS: ReadonlySet<DelveEvent['type']> = new Set<DelveEvent['type']>([
  'pickup', 'blocked', 'select', 'xp', 'levelup', 'xploss', 'hurt', 'talk', 'trade', 'quest', 'bubble', 'craft',
  'chest', 'mirror', 'rebirth', 'hint', 'recall', 'boat', 'spawn', 'lifeup', 'buff', 'learn', 'respec', 'refund', 'salvage', 'forge',
  'codex', 'treasure', 'discover', 'lore', 'landmark', 'folktalk', 'folktrade', 'hearth', 'travel', 'eat', 'crate',
]);
/** 有人一直不取事件時，佇列最多留幾筆（取得最慢的那個人會漏掉最舊的） */
const EVENT_BACKLOG = 4096;
/** 世界系統看到的一個玩家（players() 的內部版：多帶 actor 本身） */
interface PlayerView { pid: Pid; cx: number; cy: number; dead: boolean; wet: boolean; a: PlayerActor }
/** 救援護送的獎勵 */
const ESCORT_REWARD = { xp: 180, coins: 150, item: { item: 'gear_shard' as ItemId, n: 2 } };
/** 和 NPC 交易 / 服務 / 接委託的距離（格） */
export const FOLK_TALK_RANGE = 10;
/** 嚮導 / 線索標記的上限 */
export const SCOUT_MAX = 60;
/** 嚮導標的地點彼此至少隔幾格（同一處的地區名牌和地標不會被當成兩個地點） */
export const SCOUT_SPACING = 24;
/** 裝備的位置：背包格號碼或裝備槽 */
export type GearAt = number | EquipSlot;
export type ForgeResult = { ok: true } | { ok: false; reason: 'none' | 'station' | 'cost' | 'max' | 'unique' | 'locked' };

export class DelveGame {
  static readonly TILE_SIZE = TILE_SIZE;
  static readonly CHUNK = CHUNK;
  static readonly FIXED_DT = FIXED_DT;

  readonly seed: string;
  readonly world: World;
  readonly spawn: { x: number; y: number };
  /** 世界生成資訊（debug / e2e / 小地圖用） */
  readonly biomes: readonly BiomeSegment[];
  readonly structures: readonly Structure[];
  readonly landforms: readonly Landform[];
  readonly dungeonZone: ReservedZone;
  readonly layers: GenLayers;
  /** 地城（房間 / 門 / 鑰匙位置）；小世界沒有 */
  readonly dungeon: DungeonInfo | null;
  /** 所有古碑（id = 碑文編號） */
  readonly tablets: readonly { x: number; y: number; id: number }[];
  /** 珍寶箱位置（debug / e2e） */
  readonly relics: GenRelic[];
  /** 泉水（瀑布源；debug / e2e） */
  readonly springs: readonly SpringSpec[];
  /** 地區 / 地標（依種子命名） */
  readonly regions: readonly Region[];
  // ── 玩家（PlayerActor）──────────────────────────────────
  /** 所有玩家角色（插入順序 = 處理順序；本地 actor 永遠第一個） */
  readonly actors = new Map<Pid, PlayerActor>();
  /** 本機玩家（solo / host = 'h'） */
  localPid: Pid = SOLO_PID;
  /** 單機 / 房主 / 客人（M-B1 只有 solo） */
  mode: GameMode = 'solo';
  /** 目前在處理的 actor：下面的相容 accessor 都讀寫它（M-B1 Task 1 恆等於 local） */
  cur!: PlayerActor;
  get local(): PlayerActor { return this.actors.get(this.localPid)!; }
  // 相容 accessor：既有程式碼（game.ts 內部、render / save / 測試）照舊用 this.player / game.hp…，實際存在 cur 上
  get explored(): PlayerActor['explored'] { return this.cur.explored; }
  set explored(v: PlayerActor['explored']) { this.cur.explored = v; }
  get discovery(): PlayerActor['discovery'] { return this.cur.discovery; }
  set discovery(v: PlayerActor['discovery']) { this.cur.discovery = v; }
  get markers(): PlayerActor['markers'] { return this.cur.markers; }
  set markers(v: PlayerActor['markers']) { this.cur.markers = v; }
  private get lastTile(): PlayerActor['lastTile'] { return this.cur.lastTile; }
  private set lastTile(v: PlayerActor['lastTile']) { this.cur.lastTile = v; }
  get player(): PlayerActor['player'] { return this.cur.player; }
  set player(v: PlayerActor['player']) { this.cur.player = v; }
  get inventory(): PlayerActor['inventory'] { return this.cur.inventory; }
  set inventory(v: PlayerActor['inventory']) { this.cur.inventory = v; }
  get appearance(): PlayerActor['appearance'] { return this.cur.appearance; }
  set appearance(v: PlayerActor['appearance']) { this.cur.appearance = v; }
  get vanity(): PlayerActor['vanity'] { return this.cur.vanity; }
  set vanity(v: PlayerActor['vanity']) { this.cur.vanity = v; }
  private get dollMemo(): PlayerActor['dollMemo'] { return this.cur.dollMemo; }
  private set dollMemo(v: PlayerActor['dollMemo']) { this.cur.dollMemo = v; }
  private get motion(): PlayerActor['motion'] { return this.cur.motion; }
  private set motion(v: PlayerActor['motion']) { this.cur.motion = v; }
  private get moveX(): PlayerActor['moveX'] { return this.cur.moveX; }
  private set moveX(v: PlayerActor['moveX']) { this.cur.moveX = v; }
  private get jump(): PlayerActor['jump'] { return this.cur.jump; }
  private set jump(v: PlayerActor['jump']) { this.cur.jump = v; }
  private get upHeld(): PlayerActor['upHeld'] { return this.cur.upHeld; }
  private set upHeld(v: PlayerActor['upHeld']) { this.cur.upHeld = v; }
  get bed(): PlayerActor['bed'] { return this.cur.bed; }
  set bed(v: PlayerActor['bed']) { this.cur.bed = v; }
  get buffs(): PlayerActor['buffs'] { return this.cur.buffs; }
  set buffs(v: PlayerActor['buffs']) { this.cur.buffs = v; }
  private get recallT(): PlayerActor['recallT'] { return this.cur.recallT; }
  private set recallT(v: PlayerActor['recallT']) { this.cur.recallT = v; }
  private get boating(): PlayerActor['boating'] { return this.cur.boating; }
  private set boating(v: PlayerActor['boating']) { this.cur.boating = v; }
  private get accSig(): PlayerActor['accSig'] { return this.cur.accSig; }
  private set accSig(v: PlayerActor['accSig']) { this.cur.accSig = v; }
  private get acc(): PlayerActor['acc'] { return this.cur.acc; }
  private set acc(v: PlayerActor['acc']) { this.cur.acc = v; }
  private get aim(): PlayerActor['aim'] { return this.cur.aim; }
  private set aim(v: PlayerActor['aim']) { this.cur.aim = v; }
  private get miningHeld(): PlayerActor['miningHeld'] { return this.cur.miningHeld; }
  private set miningHeld(v: PlayerActor['miningHeld']) { this.cur.miningHeld = v; }
  private get dropHeld(): PlayerActor['dropHeld'] { return this.cur.dropHeld; }
  private set dropHeld(v: PlayerActor['dropHeld']) { this.cur.dropHeld = v; }
  private get platformHinted(): PlayerActor['platformHinted'] { return this.cur.platformHinted; }
  private set platformHinted(v: PlayerActor['platformHinted']) { this.cur.platformHinted = v; }
  private get useHeld(): PlayerActor['useHeld'] { return this.cur.useHeld; }
  private set useHeld(v: PlayerActor['useHeld']) { this.cur.useHeld = v; }
  private get placeCooldown(): PlayerActor['placeCooldown'] { return this.cur.placeCooldown; }
  private set placeCooldown(v: PlayerActor['placeCooldown']) { this.cur.placeCooldown = v; }
  private get useConsumed(): PlayerActor['useConsumed'] { return this.cur.useConsumed; }
  private set useConsumed(v: PlayerActor['useConsumed']) { this.cur.useConsumed = v; }
  get openChest(): PlayerActor['openChest'] { return this.cur.openChest; }
  set openChest(v: PlayerActor['openChest']) { this.cur.openChest = v; }
  get openMirror(): PlayerActor['openMirror'] { return this.cur.openMirror; }
  set openMirror(v: PlayerActor['openMirror']) { this.cur.openMirror = v; }
  private get mining(): PlayerActor['mining'] { return this.cur.mining; }
  private set mining(v: PlayerActor['mining']) { this.cur.mining = v; }
  private get lastBlocked(): PlayerActor['lastBlocked'] { return this.cur.lastBlocked; }
  private set lastBlocked(v: PlayerActor['lastBlocked']) { this.cur.lastBlocked = v; }
  private get lastBlockedAt(): PlayerActor['lastBlockedAt'] { return this.cur.lastBlockedAt; }
  private set lastBlockedAt(v: PlayerActor['lastBlockedAt']) { this.cur.lastBlockedAt = v; }
  get equipment(): PlayerActor['equipment'] { return this.cur.equipment; }
  set equipment(v: PlayerActor['equipment']) { this.cur.equipment = v; }
  get hp(): PlayerActor['hp'] { return this.cur.hp; }
  set hp(v: PlayerActor['hp']) { this.cur.hp = v; }
  get baseMaxHp(): PlayerActor['baseMaxHp'] { return this.cur.baseMaxHp; }
  set baseMaxHp(v: PlayerActor['baseMaxHp']) { this.cur.baseMaxHp = v; }
  get mana(): PlayerActor['mana'] { return this.cur.mana; }
  set mana(v: PlayerActor['mana']) { this.cur.mana = v; }
  get dead(): PlayerActor['dead'] { return this.cur.dead; }
  set dead(v: PlayerActor['dead']) { this.cur.dead = v; }
  get respawnT(): PlayerActor['respawnT'] { return this.cur.respawnT; }
  set respawnT(v: PlayerActor['respawnT']) { this.cur.respawnT = v; }
  private get sleepReady(): boolean { return this.cur.sleepReady; }
  private set sleepReady(v: boolean) { this.cur.sleepReady = v; }
  get autoAim(): PlayerActor['autoAim'] { return this.cur.autoAim; }
  set autoAim(v: PlayerActor['autoAim']) { this.cur.autoAim = v; }
  get facing(): PlayerActor['facing'] { return this.cur.facing; }
  set facing(v: PlayerActor['facing']) { this.cur.facing = v; }
  get attack(): PlayerActor['attack'] { return this.cur.attack; }
  set attack(v: PlayerActor['attack']) { this.cur.attack = v; }
  private get attackCd(): PlayerActor['attackCd'] { return this.cur.attackCd; }
  private set attackCd(v: PlayerActor['attackCd']) { this.cur.attackCd = v; }
  private get iframes(): PlayerActor['iframes'] { return this.cur.iframes; }
  private set iframes(v: PlayerActor['iframes']) { this.cur.iframes = v; }
  private get sinceHit(): PlayerActor['sinceHit'] { return this.cur.sinceHit; }
  private set sinceHit(v: PlayerActor['sinceHit']) { this.cur.sinceHit = v; }
  private get knockT(): PlayerActor['knockT'] { return this.cur.knockT; }
  private set knockT(v: PlayerActor['knockT']) { this.cur.knockT = v; }
  private get fallPeak(): PlayerActor['fallPeak'] { return this.cur.fallPeak; }
  private set fallPeak(v: PlayerActor['fallPeak']) { this.cur.fallPeak = v; }
  private get potionCd(): PlayerActor['potionCd'] { return this.cur.potionCd; }
  private set potionCd(v: PlayerActor['potionCd']) { this.cur.potionCd = v; }
  private get manaDelay(): PlayerActor['manaDelay'] { return this.cur.manaDelay; }
  private set manaDelay(v: PlayerActor['manaDelay']) { this.cur.manaDelay = v; }
  private get aimPx(): PlayerActor['aimPx'] { return this.cur.aimPx; }
  private set aimPx(v: PlayerActor['aimPx']) { this.cur.aimPx = v; }
  private get statsEq(): PlayerActor['statsEq'] { return this.cur.statsEq; }
  private set statsEq(v: PlayerActor['statsEq']) { this.cur.statsEq = v; }
  private get statsCache(): PlayerActor['statsCache'] { return this.cur.statsCache; }
  private set statsCache(v: PlayerActor['statsCache']) { this.cur.statsCache = v; }
  get contact(): PlayerActor['contact'] { return this.cur.contact; }
  set contact(v: PlayerActor['contact']) { this.cur.contact = v; }
  get breath(): PlayerActor['breath'] { return this.cur.breath; }
  set breath(v: PlayerActor['breath']) { this.cur.breath = v; }
  private get drownT(): PlayerActor['drownT'] { return this.cur.drownT; }
  private set drownT(v: PlayerActor['drownT']) { this.cur.drownT = v; }
  get burning(): PlayerActor['burning'] { return this.cur.burning; }
  set burning(v: PlayerActor['burning']) { this.cur.burning = v; }
  private get burnTick(): PlayerActor['burnTick'] { return this.cur.burnTick; }
  private set burnTick(v: PlayerActor['burnTick']) { this.cur.burnTick = v; }
  get honeyT(): PlayerActor['honeyT'] { return this.cur.honeyT; }
  set honeyT(v: PlayerActor['honeyT']) { this.cur.honeyT = v; }
  private get wasWet(): PlayerActor['wasWet'] { return this.cur.wasWet; }
  private set wasWet(v: PlayerActor['wasWet']) { this.cur.wasWet = v; }
  get fishing(): PlayerActor['fishing'] { return this.cur.fishing; }
  set fishing(v: PlayerActor['fishing']) { this.cur.fishing = v; }
  get fishLog(): PlayerActor['fishLog'] { return this.cur.fishLog; }
  set fishLog(v: PlayerActor['fishLog']) { this.cur.fishLog = v; }
  private get foodCd(): PlayerActor['foodCd'] { return this.cur.foodCd; }
  private set foodCd(v: PlayerActor['foodCd']) { this.cur.foodCd = v; }
  private get miningWas(): PlayerActor['miningWas'] { return this.cur.miningWas; }
  private set miningWas(v: PlayerActor['miningWas']) { this.cur.miningWas = v; }
  get codex(): PlayerActor['codex'] { return this.cur.codex; }
  set codex(v: PlayerActor['codex']) { this.cur.codex = v; }
  get undyingCd(): PlayerActor['undyingCd'] { return this.cur.undyingCd; }
  set undyingCd(v: PlayerActor['undyingCd']) { this.cur.undyingCd = v; }
  private get statsKey(): PlayerActor['statsKey'] { return this.cur.statsKey; }
  private set statsKey(v: PlayerActor['statsKey']) { this.cur.statsKey = v; }
  private get statsRefs(): PlayerActor['statsRefs'] { return this.cur.statsRefs; }
  private set statsRefs(v: PlayerActor['statsRefs']) { this.cur.statsRefs = v; }
  private get statsDirty(): PlayerActor['statsDirty'] { return this.cur.statsDirty; }
  private set statsDirty(v: PlayerActor['statsDirty']) { this.cur.statsDirty = v; }
  get levels(): PlayerActor['levels'] { return this.cur.levels; }
  set levels(v: PlayerActor['levels']) { this.cur.levels = v; }
  private get raceXpCarry(): PlayerActor['raceXpCarry'] { return this.cur.raceXpCarry; }
  private set raceXpCarry(v: PlayerActor['raceXpCarry']) { this.cur.raceXpCarry = v; }
  private get skillCd(): PlayerActor['skillCd'] { return this.cur.skillCd; }
  private set skillCd(v: PlayerActor['skillCd']) { this.cur.skillCd = v; }
  private get dashT(): PlayerActor['dashT'] { return this.cur.dashT; }
  private set dashT(v: PlayerActor['dashT']) { this.cur.dashT = v; }
  private get dashDir(): PlayerActor['dashDir'] { return this.cur.dashDir; }
  private set dashDir(v: PlayerActor['dashDir']) { this.cur.dashDir = v; }
  private get dashEnd(): PlayerActor['dashEnd'] { return this.cur.dashEnd; }
  private set dashEnd(v: PlayerActor['dashEnd']) { this.cur.dashEnd = v; }
  private get slamming(): PlayerActor['slamming'] { return this.cur.slamming; }
  private set slamming(v: PlayerActor['slamming']) { this.cur.slamming = v; }
  private get slamY(): PlayerActor['slamY'] { return this.cur.slamY; }
  private set slamY(v: PlayerActor['slamY']) { this.cur.slamY = v; }
  private get slamPre(): PlayerActor['slamPre'] { return this.cur.slamPre; }
  private set slamPre(v: PlayerActor['slamPre']) { this.cur.slamPre = v; }
  get orePulse(): PlayerActor['orePulse'] { return this.cur.orePulse; }
  set orePulse(v: PlayerActor['orePulse']) { this.cur.orePulse = v; }
  /** 製圖師上次打聽到的地點（UI 顯示；每個玩家各自的） */
  get lastReveal(): PlayerActor['lastReveal'] { return this.cur.lastReveal; }
  set lastReveal(v: PlayerActor['lastReveal']) { this.cur.lastReveal = v; }
  private tabletAt = new Map<number, number>();
  /** 遊戲內經過秒數（日夜循環用） */
  time = START_TIME;
  tick = 0;

  /** 據點與居民（存檔內容） */
  readonly settle = new Settlements();
  /** 外圍地區（無限世界的海 / 生態段；所有 actor 的 Discovery 共用同一個查詢與快取） */
  private readonly outerRegion: ((x: number, y: number) => Region | null) | null;
  /** 地表村落 / 矮人地廳（世界生成） */
  readonly villages: readonly VillageInfo[];
  readonly halls: readonly HallInfo[];
  /** 每個發現地點的地標（一次性發現物；領過的記在 discovery.landmarks） */
  readonly landmarks: readonly LandmarkInfo[];
  private landmarkAt = new Map<number, LandmarkInfo>();
  /** 村民 / 矮人 / 旅人 / 受困探險者 + 好感度（存檔內容） */
  readonly folk: FolkWorld;
  /** 委託（存檔內容） */
  readonly quests: QuestLog;
  private folkHost: FolkHost | null = null;
  /** 嚮導上次標出的地點（UI 顯示） */
  lastScout: { name: string; x: number; y: number } | null = null;
  /** 嚮導 / 地標線索 / 探索委託標出的地點（和玩家自己的 20 個標記分開；存檔內容） */
  scoutMarks: MapMarker[] = [];
  /** 嚮導 / 線索 / 委託標過的所有地點（"x,y"；永久記錄，地圖清單滿了擠掉舊標記也不會再當成新地點；存檔內容） */
  readonly scouted = new Set<string>();
  /** 招募居民的每日好處：上次嚮導自動標點 / 藥師送祝福是哪一天（存檔內容） */
  perkDays = { guide: -1, healer: -1 };
  private events: DelveEvent[] = [];
  /** events[0] 的絕對序號（前面的已經被所有 actor 取走 / 丟掉） */
  private evBase = 0;
  /** 每個玩家 drainEvents 取到哪（絕對序號）；沒有 = 從 evBase 開始 */
  private readonly evRead = new Map<Pid, number>();
  /** > 0 = 正在跑世界段（step 的世界前 / 後段、換日、液體、委託…）：emit 不補 pid（公開）。withActor 進去時歸零、出來還原 */
  private worldDepth = 0;
  /** 揮擊編號（全域遞增：怪物用 lastSwing 判斷一次揮擊只打一下，多個玩家的編號不能撞） */
  private swingSeq = 0;
  private readonly lightEngine = new LightEngine();

  // ── 戰鬥狀態 ───────────────────────────────────────────
  /** 和平模式：不自然生成怪物（存檔內容；切到和平時清掉現有怪物） */
  private peacefulMode = false;
  /** 已擊敗的首領（存檔內容） */
  readonly bossesDefeated = new Set<string>();
  /** 各種怪物擊殺數（存檔內容） */
  kills: Partial<Record<EnemyKind, number>> = {};
  readonly drops = new DropList();
  readonly projectiles = new ProjList();
  enemies: Enemy[] = [];
  /** 渲染端告知的視野半寬 / 半高（格）：生成點要在畫面外 */
  viewHalf = { ...DEFAULT_VIEW_HALF };
  private nextEnemyId = 1;
  private spawnT = SPAWN_GRACE;
  /** 生成輪到第幾個活著的玩家當中心 */
  private spawnTurn = 0;
  /** 距上次喘息（新世界 / 讀檔 / 重生）的秒數：生成間隔由慢漸快（spawn.spawnInterval） */
  private spawnCalm = 0;
  private readonly spawnRng: Rng;
  private readonly combatRng: Rng;
  // ── 液體 ───────────────────────────────────────────────
  /** 液體模擬（世界的液體量 / 種類層） */
  readonly liquids: LiquidSim;
  /** 實體物理環境：world 的碰撞 + 液體介質 / 接觸（掉落物、怪物用） */
  readonly env: PhysEnv;
  // ── 曆法 / 天氣 ───────────────────────────────────────
  /** 強制天氣（debug / e2e；存檔內容）：until = 到這個遊戲時間為止 */
  weatherOverride: { kind: WeatherKind; until: number } | null = null;
  /** 上一刻的天數（換日偵測：結冰 / 融化） */
  private lastDay = -1;
  /** 睡覺經過秒數；null = 沒在睡 */
  private sleepT: number | null = null;
  private sleepSkipped = false;
  /** 上一次公開的等待人數（ready*100+total；變了才推 wait 事件） */
  private sleepWaitSig = 0;
  private boltT = 4;
  private flashT = 0;
  private rainT = 0;
  private readonly weatherRng: Rng;
  /** 天氣快取（每刻一次）：全域天氣 + 每個玩家腳下的在地天氣 */
  private wxCache: { tick: number; time: number; g: WeatherState; local: Map<PlayerActor, { g: WeatherState; local: WeatherState }> } | null = null;
  // ── 釣魚 ───────────────────────────────────────────────
  private readonly fishRng: Rng;
  /** 玩家敲開的冰洞（tile index；存檔內容）：到那一欄融化的季節前不會再結冰 */
  readonly minedIce = new Set<number>();
  // ── 裝備詞條 ───────────────────────────────────────────
  /** 掉寶 / 合成 / 鍛造的亂數 */
  private readonly lootRng: Rng;
  /** debug / e2e：怪物掉裝備的機率（null = 正常） */
  debugGearChance: number | null = null;
  // ── 等級 / 技能 ───────────────────────────────────────
  /** events 裡已經換算過經驗的位置 */
  private lvScan = 0;

  constructor(opts: DelveOptions = {}) {
    const me = new PlayerActor(SOLO_PID);
    this.actors.set(me.pid, me);
    this.cur = me;
    // settle.spawnCore（存檔欄位）= 本地玩家的重生爐心；其他玩家的存在各自的 actor 上
    this.settle.spawnLink = { get: () => this.local.spawnCore, set: (v) => { this.local.spawnCore = v; } };
    this.seed = String(opts.seed ?? 'delve');
    this.appearance = normalizeAppearance(opts.appearance);
    // 預先生成的世界只在大小對得上時採用（seed 由呼叫端保證）
    const pre = opts.gen && (opts.width === undefined || opts.gen.world.width === opts.width) && (opts.height === undefined || opts.gen.world.height === opts.height) ? opts.gen : null;
    const gen = pre ?? generateWorld(this.seed, { width: opts.width, height: opts.height });
    // 舊生成器的扁平格 → 區塊欄儲存。正式尺寸的世界無限（中央以外由外圍生成器產生），小尺寸的測試世界有界（B5）
    const bounds = opts.bounds ?? defaultBounds(gen.world.width, gen.world.height);
    const source = opts.columnSource ?? (bounds === 'infinite' ? new OuterGen(this.seed, frameOf(gen.world)) : null);
    this.world = World.fromGen(gen.world, gen.layers, { bounds, source });
    this.outerRegion = source instanceof OuterGen ? outerRegions(this.seed, source.profile) : null;
    this.liquids = new LiquidSim(this.world);
    // 液體反應（熔岩遇水 / 蜂蜜）不在任何活著的玩家站的格子凝成黑曜石 / 脆蜜塊（不把人封進方塊；液體本身照樣流過去）
    this.liquids.blocked = (x, y) => this.tileOverlapsPlayer(x, y, true);
    // 泉水瀑布（無限源 + 滲水石排水）
    this.springs = gen.springs;
    this.liquids.setSprings(gen.springs);
    const w = this.world;
    this.env = {
      isSolid: (x, y) => w.isSolid(x, y),
      isPlatform: (x, y) => w.isPlatform(x, y),
      isClimbable: (x, y) => w.isClimbable(x, y),
      isHalf: (x, y) => w.isHalf(x, y),
      mediumAt: (b) => liquidMedium(liquidContact(w, b)),
      itemMediumAt: (b) => liquidMedium(liquidContact(w, b), true),
      contactAt: (b) => liquidContact(w, b),
      liquidAt: (x, y) => ({ amount: w.getLiquid(x, y), type: w.getLiquidType(x, y) }),
    };
    this.spawn = gen.spawn;
    this.biomes = gen.biomes;
    this.structures = gen.structures;
    this.landforms = gen.landforms;
    this.dungeonZone = gen.dungeonZone;
    this.layers = gen.layers;
    // 每欄深度層線：系統一律走 world.layersAt(x)（預先生成的世界也補上）
    this.world.layers = gen.layers;
    this.dungeon = gen.dungeon;
    this.tablets = gen.tablets;
    this.relics = gen.relics;
    for (const t of gen.tablets) this.tabletAt.set(this.world.idx(t.x, t.y), t.id);
    this.regions = buildRegions({
      seed: this.seed, width: this.world.width, height: this.world.height, spawn: gen.spawn,
      surface: this.world.surface, layers: gen.layers, biomes: gen.biomes, structures: gen.structures, dungeon: gen.dungeon,
    });
    this.explored = new ExploredMap(this.world.width, this.world.height, undefined, this.world);
    this.villages = gen.villages ?? [];
    this.halls = gen.halls ?? [];
    this.landmarks = gen.landmarks ?? [];
    for (const l of this.landmarks) this.landmarkAt.set(this.world.idx(l.x, l.y), l);
    this.discovery = new Discovery(this.regions, { loreTotal: gen.tablets.length, landmarks: [...this.landmarkAt.keys()] });
    this.discovery.setOuter(this.outerRegion);
    // 據點核心範圍的欄 pin 住（無限世界：居民在那裡活動，不卸載）
    this.settle.attach(this.world);
    this.folk = new FolkWorld(this.seed, this.villages, this.halls);
    this.folk.populate(this.world);
    // 開局一段時間內不會遇見（第一位旅人至少四分之一天後、第一位受困者半天後）
    this.folk.enc.nextTraveller = this.time + DAY_LENGTH * 0.25;
    this.folk.enc.nextStranded = this.time + DAY_LENGTH * 0.5;
    this.perkDays = { guide: dayIndexOf(this.time), healer: -1 };
    this.quests = new QuestLog(this.seed);
    this.player = makeBody(0, 0);
    this.teleport(this.spawn.x, this.spawn.y);
    this.inventory = starterInventory();
    this.aim = { x: this.spawn.x, y: this.spawn.y + 1 };
    this.aimPx = { x: (this.spawn.x + 0.5) * TILE_SIZE, y: (this.spawn.y + 1.5) * TILE_SIZE };
    this.spawnRng = new Rng(`${this.seed}:spawn`);
    this.combatRng = new Rng(`${this.seed}:combat`);
    this.weatherRng = new Rng(`${this.seed}:weather`);
    this.fishRng = new Rng(`${this.seed}:fish`);
    this.lootRng = new Rng(`${this.seed}:loot`);
    this.peacefulMode = Boolean(opts.peaceful);
    this.world.markAllDirty();
    // 出生點：周圍已揭露、所在地區算已發現（不跳橫幅）
    this.explored.revealDisc(this.spawn.x, this.spawn.y, REVEAL_RADIUS + 6);
    this.discovery.visit(this.spawn.x, this.spawn.y);
    // 曆法：雪原的湖在春天開局時仍是冰
    this.refreshSeason();
  }

  /** 換掉探索狀態（存檔還原用） */
  setExploration(explored: ExploredMap, markers: MapMarker[]): void {
    this.explored = explored;
    this.markers = markers;
  }

  // ── 載入區（B7：每個 actor 周圍的欄常駐，遠的卸載 / 停放） ─────────────
  /**
   * 依所有 actor（活著或死亡等待重生）的位置 ensure / 預生成 / 卸載欄（engine/streaming.ts），再處理欄的載入 / 卸載事件。
   * step() 的第一件事；不碰任何 RNG。有界世界全部常駐 → 什麼都不做。
   */
  updateLoadedArea(): void {
    const w = this.world;
    const xs: number[] = [];
    for (const a of this.actors.values()) xs.push(Math.floor((a.player.x + a.player.w / 2) / TILE_SIZE));
    const plan = planStreaming(xs, w.residentSet(), w.pinnedSet(), w, this.tick);
    for (const cx of plan.load) w.ensureColumn(cx);
    if (plan.prefetch !== null) w.ensureColumn(plan.prefetch);
    for (const cx of plan.unload) w.unloadColumn(cx);
    this.columnEvents();
  }
  /**
   * 剛載入的第 cx 欄與常駐的鄰欄 n 之間的接縫：只喚醒可能與生成結果不一致的地方——接縫一側是中央（舊生成器，
   * 外圍的海接上中央的地形會流進來，spec C9）整條喚醒；兩側都是外圍生成的 → 只喚醒任一側 chunk 改過的那幾列
   * （同一個生成器的輸出在接縫兩側本來就連續，剛生成的海 / 熔岩保持沉睡，載入不會讓欄被標成已修改）。
   */
  private seamWake(cx: number, n: number): void {
    const w = this.world;
    if (!w.isResident(n)) return;
    const sx = Math.max(cx, n) * CHUNK;
    const central = (x: number): boolean => x >= 0 && x < w.width;
    if (central(sx - 1) || central(sx)) { this.liquids.wakeSeam(sx); return; }
    for (let cy = 0; cy < w.chunksY; cy++) {
      const a = w.chunkIndex(cx, cy), b = w.chunkIndex(n, cy);
      if (w.modifiedChunks.has(a) || w.liquidModified.has(a) || w.modifiedChunks.has(b) || w.liquidModified.has(b)) {
        this.liquids.wakeSeam(sx, cy * CHUNK, (cy + 1) * CHUNK);
      }
    }
  }
  /** tile 欄 x 周圍 LOAD_COLS 欄同步載入（teleport / 重生 / 傳送先叫它，落點不會是「沒載入 = 石頭」） */
  ensureAround(x: number): void {
    const w = this.world;
    if (!Number.isFinite(x)) return;
    const c = chunkOfX(Math.floor(x));
    const lo = Math.max(chunkOfX(w.xMin), c - LOAD_COLS), hi = Math.min(chunkOfX(w.xMax - 1), c + LOAD_COLS);
    for (let cx = lo; cx <= hi; cx++) w.ensureColumn(cx);
  }
  /**
   * 欄的載入 / 卸載事件：卸載 → 液體模擬忘掉那欄；載入 → 液體只喚醒接縫（seamWake）、依今天日期結冰、
   * 停放蓋回來的 chunk 整塊喚醒（玩家改過的地方可能還在流）。
   */
  private columnEvents(): void {
    const w = this.world;
    const ev = w.drainColumnEvents(), restored = w.drainRestoredChunks();
    if (!ev.loaded.length && !ev.unloaded.length && !restored.length) return;
    for (const cx of ev.unloaded) this.liquids.forgetColumn(cx);
    const loaded = [...new Set(ev.loaded)].filter((cx) => w.isResident(cx)).sort((a, b) => a - b);
    for (const cx of loaded) { this.seamWake(cx, cx - 1); this.seamWake(cx, cx + 1); }
    if (loaded.length) freezeColumns(w, this.liquids, dayIndexOf(this.time), loaded, (x, y) => this.tileOverlapsPlayer(x, y, true), this.minedIce);
    for (const k of restored) {
      const { cx, cy } = w.chunkCoords(k);
      if (w.isResident(cx)) this.liquids.wakeRect(cx * CHUNK - 1, cy * CHUNK - 1, (cx + 1) * CHUNK + 1, (cy + 1) * CHUNK + 1);
    }
  }

  // ── 多個玩家（actor）────────────────────────────────────
  /**
   * 暫時把 cur 切到 a 執行 fn（相容 accessor 都讀寫 a），結束（含丟例外）後還原。
   * 在裡面 emit 的事件帶 a.pid（多 actor 時；就算是從世界段裡叫進來的也一樣）。
   */
  withActor<T>(a: PlayerActor, fn: () => T): T {
    const prev = this.cur, world = this.worldDepth;
    this.cur = a;
    this.worldDepth = 0;
    try { return fn(); } finally { this.cur = prev; this.worldDepth = world; }
  }
  /** 世界段：裡面 emit 的事件不帶 pid（公開）；cur 不變 */
  private inWorld<T>(fn: () => T): T {
    this.worldDepth++;
    try { return fn(); } finally { this.worldDepth--; }
  }
  /**
   * 加入一個玩家：套上角色檔（applyCharacter，同讀檔），站在 at（腳底 tile；省略 = respawnPoint 的規則：
   * 據點爐心 > 世界出生點，新 actor 沒有床）。新 actor 只收得到加入之後的事件。
   */
  addActor(pid: Pid, character: DelveCharacter, at?: { x: number; y: number }): PlayerActor {
    if (this.actors.has(pid)) throw new Error(`delve: actor ${pid} already exists`);
    const a = new PlayerActor(pid);
    a.who = { id: character.id, nick: character.nick, createdAt: character.createdAt, rev: character.rev };
    a.player = makeBody(0, 0);
    a.inventory = starterInventory();
    a.appearance = normalizeAppearance(character.appearance);
    a.explored = new ExploredMap(this.world.width, this.world.height, undefined, this.world);
    a.discovery = new Discovery(this.regions, { loreTotal: this.tablets.length, landmarks: [...this.landmarkAt.keys()] });
    a.discovery.setOuter(this.outerRegion);
    this.actors.set(pid, a);
    this.evRead.set(pid, this.evBase + this.events.length);
    this.withActor(a, () => {
      const p = at ?? this.respawnPoint();
      this.teleport(p.x, p.y);
      this.aim = { x: p.x, y: p.y + 1 };
      this.aimPx = { x: (p.x + 0.5) * TILE_SIZE, y: (p.y + 1.5) * TILE_SIZE };
      // 同建構子的出生點：周圍已揭露、所在地區算已發現（不跳橫幅）
      this.explored.revealDisc(p.x, p.y, REVEAL_RADIUS + 6);
      this.discovery.visit(p.x, p.y);
      applyCharacter(this, characterState(character, this.time));
    });
    return a;
  }
  /** 移除一個玩家（不能是本地玩家）：先把還沒換算的經驗記上，再以它為 cur 拍角色快照回傳 */
  removeActor(pid: Pid): DelveCharacter {
    if (pid === this.localPid) throw new Error('delve: cannot remove the local actor');
    const a = this.actors.get(pid);
    if (!a) throw new Error(`delve: no actor ${pid}`);
    this.flushLevels();
    const now = Date.now();
    const who = a.who ?? { id: pid, nick: pid, createdAt: now, rev: 0 };
    const character = this.withActor(a, () => splitSnapshot(snapshotGame(this, now), who, { worldId: 'x', worldName: 'x', visits: {} }, now).character);
    this.actors.delete(pid);
    this.evRead.delete(pid);
    this.trimEvents();
    return character;
  }
  /** 某個玩家的輸入（房主餵遠端輸入；本地輸入用 setMoveX… 也可以用 input(localPid)） */
  input(pid: Pid): ActorInput {
    const a = this.actors.get(pid);
    if (!a) throw new Error(`delve: no actor ${pid}`);
    const g = this;
    return {
      get moveX() { return a.moveX; },
      set moveX(v: number) { a.moveX = Math.max(-1, Math.min(1, v)); },
      get jump() { return a.jump; },
      set jump(v: boolean) { a.jump = v; },
      get up() { return a.upHeld; },
      set up(v: boolean) { a.upHeld = v; },
      get drop() { return a.dropHeld; },
      set drop(v: boolean) { a.dropHeld = v; },
      get aim() { return { x: a.aim.x, y: a.aim.y }; },
      set aim(v: { x: number; y: number }) { g.aimOf(a, v.x, v.y); },
      get mining() { return a.miningHeld; },
      set mining(v: boolean) { g.miningOf(a, v); },
      get use() { return a.useHeld; },
      set use(v: boolean) { g.useOf(a, v); },
      get selected() { return a.inventory.selected; },
      set selected(i: number) { g.selectOf(a, i); },
    };
  }
  private aimOf(a: PlayerActor, tx: number, ty: number): void {
    const x = Math.floor(tx), y = Math.floor(ty);
    // 精確瞄準點（px）：整數 tile 座標視為格子中心
    a.aimPx = { x: (Number.isInteger(tx) ? tx + 0.5 : tx) * TILE_SIZE, y: (Number.isInteger(ty) ? ty + 0.5 : ty) * TILE_SIZE };
    if (x !== a.aim.x || y !== a.aim.y) { a.aim = { x, y }; a.mining = null; a.lastBlocked = ''; }
  }
  private miningOf(a: PlayerActor, held: boolean): void { a.miningHeld = held; if (!held) a.mining = null; }
  private useOf(a: PlayerActor, held: boolean): void {
    a.useHeld = held;
    if (!held) { a.placeCooldown = 0; a.useConsumed = false; }
  }
  private selectOf(a: PlayerActor, i: number): void {
    this.withActor(a, () => {
      const before = this.inventory.selected;
      this.inventory.select(i);
      if (this.inventory.selected !== before) this.emit({ type: 'select', slot: this.inventory.selected });
    });
  }
  /**
   * 推一個事件。不只一個玩家時補上 pid = cur.pid：玩家段（withActor）裡是那個玩家；step 外的 UI / API 呼叫（合成、買賣、
   * 技能樹、鍛造、委託、給 buff…）cur = 本地玩家 → 本地 pid。只有世界段（inWorld）推的不帶 pid = 公開。單機一律不帶。
   */
  private emit(ev: DelveEvent): void {
    if (this.worldDepth === 0 && this.actors.size > 1 && ev.pid === undefined) ev.pid = this.cur.pid;
    this.events.push(ev);
  }

  // ── 輸入（一律是本地玩家；遠端玩家用 input(pid)） ─────────
  setMoveX(v: number): void { this.local.moveX = Math.max(-1, Math.min(1, v)); }
  setJump(held: boolean): void { this.local.jump = held; }
  /** 按住「上」（W / ↑）：在繩索上往上爬，否則等同跳躍 */
  setUp(held: boolean): void { this.local.upHeld = held; }
  /** 按住「下」：穿過單向平台 */
  setDrop(held: boolean): void { this.local.dropHeld = held; }
  /** 游標所指 tile 座標 */
  setAim(tx: number, ty: number): void { this.aimOf(this.local, tx, ty); }
  /** 目前瞄準的 tile（不配置新物件，每幀查詢用） */
  aimTile(): Readonly<{ x: number; y: number }> { return this.local.aim; }
  /** 游標所指世界 px 座標（renderer 換算好鏡頭偏移後傳入） */
  setAimWorld(px: number, py: number): void { this.setAim(px / TILE_SIZE, py / TILE_SIZE); }
  setMining(held: boolean): void { this.miningOf(this.local, held); }
  setUse(held: boolean): void { this.useOf(this.local, held); }
  selectSlot(i: number): void { this.selectOf(this.local, i); }

  // ── 模擬 ───────────────────────────────────────────────
  /** 一個固定步長。整段是世界段（事件公開），玩家段 / 重生 / 換算經驗各自用 withActor 切回該玩家 */
  step(dt: number = FIXED_DT): void { this.inWorld(() => this.stepWorld(dt)); }
  private stepWorld(dt: number): void {
    // 第一件事：各 actor 周圍的載入區（不碰任何 RNG；有界世界全部常駐 → 什麼都不做）
    this.updateLoadedArea();
    this.flushLevels();
    this.tick++;
    this.time += dt;
    const day = dayIndexOf(this.time);
    if (day !== this.lastDay) this.onNewDay(day);
    if (this.flashT > 0) this.flashT -= dt;
    this.liquids.step();
    for (const e of this.liquids.drainEvents()) this.emit({ type: 'liquid', kind: e.kind, x: e.x, y: e.y });
    const actors = [...this.actors.values()];
    // 全員死亡：只倒數重生 + 怪物 / 據點（不跑 NPC；單機死亡時就是這樣）
    if (actors.every((a) => a.dead)) {
      for (const a of actors) this.withActor(a, () => this.updateDeath(dt));
      this.updateEntities(dt);
      this.updateSettlements(dt);
      return;
    }
    // 全員（活著的）都上床 → 開始睡（有人離線 / 死亡 / 加入也要重算）
    this.checkSleepStart();
    // 睡覺（世界層級）：活著的人不動、怪物不動；死掉的人照樣倒數重生
    if (this.sleepT !== null) {
      for (const a of actors) if (a.dead) this.withActor(a, () => this.updateDeath(dt));
      this.updateSleep(dt); this.updateSettlements(dt); this.updateFolk(dt);
      return;
    }
    // 每個玩家依序（本地第一個）：死掉的倒數重生、活著的跑玩家段
    const alive: PlayerActor[] = [];
    for (const a of actors) {
      this.withActor(a, () => {
        if (a.dead) this.updateDeath(dt);
        else { this.stepActor(dt); alive.push(a); }
      });
    }
    // 世界後段：怪物 / 投射物 / 掉落物 / 據點 / NPC 都看所有玩家（spec §5.2）
    this.updateEntities(dt);
    this.updateSettlements(dt);
    this.updateFolk(dt);
    for (const a of alive) this.withActor(a, () => this.closeFarPanels());
  }

  /** 玩家段（cur = 這個玩家）：移動、技能、摔落、液體、生命、探索、挖 / 打 / 釣 / 用 */
  private stepActor(dt: number): void {
    if (this.sleepReady) this.holdSleepReady();
    const knocked = this.knockT > 0;
    this.contact = liquidContact(this.world, this.player);
    const air0 = this.motion.airUsed ?? 0, climb0 = Boolean(this.motion.climbing), mantle0 = this.motion.mantle ?? null;
    this.preMoveSkills(dt);
    if (this.boating) this.stepBoating(dt, knocked);
    else stepPlayer(this.world, this.player, this.motion, { moveX: knocked ? 0 : this.moveX, jump: !knocked && this.jump, drop: this.dropHeld, up: !knocked && this.upHeld }, dt, this.moveStats(), playerMedium(this.contact));
    if ((this.motion.airUsed ?? 0) > air0) {
      const pl = this.player;
      // 三段跳（雲步 + 凌雲）的第三跳只有一半的按住時間：跳得比較矮，豎井不會變成一路連跳
      if ((this.motion.airUsed ?? 0) >= 2) this.motion.jumpTimer *= THIRD_JUMP_HOLD;
      this.emit({ type: 'airjump', x: pl.x + pl.w / 2, y: pl.y + pl.h }); this.fallPeak = null;
    }
    {
      const pl = this.player, mt = this.motion.mantle ?? null;
      if (mt && mt !== mantle0) this.emit({ type: 'climb', phase: 'mantle', x: mt.edgeX, y: mt.edgeY });
      else if (!mt && mantle0) this.emit({ type: 'climb', phase: 'top', x: pl.x + pl.w / 2, y: pl.y + pl.h });
      if (this.motion.climbing && !climb0) this.emit({ type: 'climb', phase: 'grab', x: pl.x + pl.w / 2, y: pl.y + 10 });
    }
    this.contact = liquidContact(this.world, this.player);
    this.postMoveSkills();
    this.updateFall();
    this.updateLiquid(dt);
    this.updateVitals(dt);
    // 天氣特效（落雷 / 雨水補池）以本地玩家為中心，只跑一次（B5）
    if (this.cur === this.local) this.inWorld(() => this.updateWeatherFx(dt));
    this.updateRecall(dt);
    this.updateExploration();
    if (!this.platformHinted && this.player.onGround && !this.dropHeld && onPlatform(this.world, this.player)) {
      this.platformHinted = true;
      this.emit({ type: 'hint', id: 'platform' });
    }
    if (this.attackCd > 0) this.attackCd -= dt;
    const weapon = this.heldWeapon();
    const rodHeld = this.heldRod() !== null;
    // 拿著釣竿：主按鍵（觸控的點擊）也是拋竿 / 收竿（按下那一刻）；船上不挖 / 不打 / 不用道具
    if (this.boating) this.mining = null;
    else if (this.miningHeld && rodHeld) { if (!this.miningWas) this.fishAction(); }
    else if (this.miningHeld) {
      if (weapon) this.tryAttack(weapon.item, weapon.def);
      else this.updateMining(dt);
    }
    this.miningWas = this.miningHeld;
    this.updateFishing(dt);
    if (this.foodCd > 0) this.foodCd -= dt;
    this.updateAttack(dt);
    if (!this.attack && Math.abs(this.player.vx) > 8) this.facing = this.player.vx > 0 ? 1 : -1;
    if (this.placeCooldown > 0) this.placeCooldown -= dt;
    if (this.useHeld && this.placeCooldown <= 0 && !this.boating) {
      const { x, y } = this.aim;
      const held = this.inventory.selectedStack();
      const use = held ? ITEMS[held.item].use : undefined;
      const npc = this.useConsumed ? null : this.settle.npcAtPx(this.aimPx.x, this.aimPx.y);
      const fk = this.useConsumed || npc ? null : this.folk.atPx(this.aimPx.x, this.aimPx.y);
      if (npc && this.canReach(Math.floor((npc.body.x + npc.body.w / 2) / TILE_SIZE), Math.floor((npc.body.y + npc.body.h / 2) / TILE_SIZE), this.reach() + 1)) {
        this.useConsumed = true; this.talkTo(npc);
      } else if (fk && this.canReach(Math.floor((fk.body.x + fk.body.w / 2) / TILE_SIZE), Math.floor((fk.body.y + fk.body.h / 2) / TILE_SIZE), this.reach() + 1)) {
        this.useConsumed = true; this.talkFolk(fk);
      } else if (isInteractive(this.world.getFg(x, y))) {
        if (!this.useConsumed) { this.useConsumed = true; this.interact(x, y); }
      } else if (use === 'hammer') {
        if (!this.useConsumed) { this.useConsumed = true; this.hammer(x, y); }
      } else if (use === 'recall') {
        if (!this.useConsumed) { this.useConsumed = true; this.startRecall(); }
      } else if (use === 'boat') {
        // 上不了船（還沒碰到水）不算用掉這次按住：按著掉進水裡，一碰到水面就上船
        if (!this.useConsumed && this.boardBoat()) this.useConsumed = true;
      } else if (use === 'fish') {
        if (!this.useConsumed) { this.useConsumed = true; this.fishAction(); }
      } else if (use === 'scoop' || use === 'pour' || use === 'sponge') {
        if (this.useLiquidTool(use, x, y)) this.placeCooldown = LIQUID_TOOL_CD;
      } else if (use) {
        if (!this.useConsumed) { this.useConsumed = true; this.consume(use); }
      } else if (!this.useConsumed && this.tryPlace(x, y)) {
        this.placeCooldown = PLACE_COOLDOWN;
        // 剛放下的梳妝台：這次按住不接著打開它（衣櫥會蓋住畫面），放開再按才用
        if (this.world.getFg(x, y) === T.VANITY_TABLE) this.useConsumed = true;
      }
    }
  }
  // ── 小木船 ─────────────────────────────────────────────
  /** 手持船按使用：碰到水面才上船（身體貼齊水線）；船不消耗。不能上船 → 不做事、回傳 false */
  private boardBoat(): boolean {
    const p = this.player, m = this.motion;
    if (this.boating || !canBoard(this.world, p)) return false;
    p.y = boatWaterline(this.world, p)! + BOAT_DRAFT - p.h;
    p.vy = 0; p.onGround = true; p.gfxOffY = 0;
    m.climbing = false; m.mantle = null; m.jumpTimer = 0; m.jumpWasHeld = this.jump || this.upHeld;
    this.mining = null; this.fallPeak = null; this.dashT = 0; this.slamming = false;
    this.boating = true;
    this.emit({ type: 'boat', on: true });
    return true;
  }
  /** 下船（按跳 / 擱淺 / 傳送 / 死亡）；不在船上 → 什麼都不做 */
  private leaveBoat(): void {
    if (!this.boating) return;
    this.boating = false;
    this.emit({ type: 'boat', on: false });
  }
  /** 船上的一步（取代 stepPlayer）：按跳 → 下船並起跳；擱淺 / 水沒了 → 下船；否則照 stepBoat 開 */
  private stepBoating(dt: number, knocked: boolean): void {
    const m = this.motion, p = this.player;
    const jumpIn = !knocked && (this.jump || this.upHeld);
    const pressed = jumpIn && !m.jumpWasHeld;
    m.jumpWasHeld = jumpIn;
    if (pressed) {
      this.leaveBoat();
      p.vy = -JUMP_SPEED; p.onGround = false; m.jumpTimer = JUMP_HOLD;
      return;
    }
    const mx: -1 | 0 | 1 = knocked || this.moveX === 0 ? 0 : this.moveX > 0 ? 1 : -1;
    if (mx !== 0) m.face = mx;
    if (!stepBoat(this.world, this.world, p, mx, dt).afloat) this.leaveBoat();
  }

  /** 走遠 / 被拆 → 關掉開著的箱子 / 梳妝台（cur = 這個玩家；世界後段之後） */
  private closeFarPanels(): void {
    if (this.openChest) {
      const { x, y } = this.openChest;
      if (!isChestTile(this.world.getFg(x, y)) || !this.canReach(x, y, this.reach() + 1.5)) this.closeChest();
    }
    if (this.openMirror) {
      const { x, y } = this.openMirror;
      if (this.world.getFg(x, y) !== T.VANITY_TABLE || !this.canReach(x, y, this.reach() + 1.5)) this.closeMirror();
    }
  }

  private updateMining(dt: number): void {
    const { x, y } = this.aim;
    const id = this.world.getFg(x, y);
    if (id === T.AIR && this.world.isFrozen(x, y)) { this.mineIce(x, y, dt); return; }
    if (id === T.AIR && WALL_ITEM[this.world.getWall(x, y)]) { this.mineWall(x, y, dt); return; }
    if (!this.world.inBounds(x, y) || id === T.AIR) { this.mining = null; return; }
    if (!this.canReach(x, y)) { this.block('mine', 'reach', x, y); this.mining = null; return; }
    const def = tileDef(id);
    const pick = this.currentPick();
    if (id === T.DOOR_LOCKED || id === T.LOCKED_CHEST) { this.block('mine', 'locked', x, y); this.mining = null; return; }
    if (def.minTier > pick.tier) { this.block('mine', 'tier', x, y); this.mining = null; return; }
    const plan = this.planBreak(x, y);
    if (plan.chest) { this.block('mine', 'chest', x, y); this.mining = null; return; }
    const need = def.hardness / pick.speed;
    if (!this.mining || this.mining.x !== x || this.mining.y !== y) this.mining = { x, y, elapsed: 0, need };
    this.mining.need = need; // 換鎬即時生效
    this.mining.elapsed += dt;
    if (this.mining.elapsed + 1e-9 >= need) {
      this.mining = null;
      this.breakTile(x, y);
    }
  }

  /** 敲冰：結冰格當成冰塊挖（不掉東西），挖完那格恢復成水 */
  private mineIce(x: number, y: number, dt: number): void {
    if (!this.canReach(x, y)) { this.block('mine', 'reach', x, y); this.mining = null; return; }
    const need = tileDef(T.ICE).hardness / this.currentPick().speed;
    if (!this.mining || this.mining.x !== x || this.mining.y !== y) this.mining = { x, y, elapsed: 0, need };
    this.mining.elapsed += dt;
    if (this.mining.elapsed + 1e-9 < need) return;
    this.mining = null;
    const w = this.world, i = w.idx(x, y);
    w.setFrozen(x, y, false);
    this.minedIce.add(i);
    w.touchLiquidAt(x, y);
    this.liquids.wake(x, y);
    this.emit({ type: 'mine', x, y, tile: T.ICE, item: null });
  }

  /** 0（地表）..1（世界底部）：戰利品依深度變好 */
  depthFrac(x: number, y: number): number {
    const w = this.world, s = w.surfaceAt(x);
    return Math.max(0, Math.min(1, (y - s) / Math.max(1, w.height - s)));
  }

  /** 挖掉 (x,y) 上的 tile id 會掉什麼（陶罐走戰利品表） */
  private dropsFor(id: number, x: number, y: number): Drop[] {
    if (id === T.POT) {
      const extra = this.world.potDrops.get(this.world.idx(x, y));
      const base = potLoot(this.seed, x, y, this.depthFrac(x, y));
      return extra ? [...base, ...extra] : base;
    }
    // 木門：整扇（3 格）只掉一個木門，算在最上面那格
    if (id === T.DOOR_CLOSED || id === T.DOOR_OPEN) return isDoorTile(this.world.getFg(x, y - 1)) ? [] : [{ item: 'wooden_door', n: 1 }];
    // 雙格家具（床 / 沙發 / 壁爐）：整件只掉一個，算在左半；孤立的右半也掉一個
    const pr = PAIR_OF_RIGHT.get(id);
    if (pr) return this.world.getFg(x - 1, y) === pr.left ? [] : [{ item: pr.item, n: 1 }];
    const d = tileDef(id).drop;
    return d ? [{ item: d, n: 1 }] : [];
  }

  /**
   * 預先算出挖 (x,y) 會連帶移除的所有格（本格 + 倒下的樹 + 失去支撐的火把 / 植物 / 藤蔓…）與總掉落物，
   * 以及背包是否放得下全部掉落物。不修改世界。
   */
  private planBreak(x: number, y: number): { tiles: [number, number][]; drops: Map<ItemId, number>; fits: boolean; chest: boolean } {
    const w = this.world;
    const tiles: [number, number][] = [];
    const gone = new Set<number>();
    const drops = new Map<ItemId, number>();
    const take = (tx: number, ty: number): void => {
      const k = w.idx(tx, ty);
      if (gone.has(k)) return;
      gone.add(k);
      tiles.push([tx, ty]);
      const tid = w.getFg(tx, ty);
      for (const d of this.dropsFor(tid, tx, ty)) drops.set(d.item, (drops.get(d.item) ?? 0) + d.n);
      // 雙格家具的另一半一起拆
      const pl = PAIR_OF_LEFT.get(tid), pr = PAIR_OF_RIGHT.get(tid);
      if (pl && w.getFg(tx + 1, ty) === pl.right) take(tx + 1, ty);
      if (pr && w.getFg(tx - 1, ty) === pr.left) take(tx - 1, ty);
    };
    const id = w.getFg(x, y);
    if (id === T.AIR || !w.inBounds(x, y)) return { tiles, drops, fits: true, chest: false };
    if (id === T.DOOR_CLOSED || id === T.DOOR_OPEN) {
      const [top, bot] = this.doorSpan(x, y);
      for (let ty = top; ty <= bot; ty++) take(x, ty);
    } else take(x, y);
    if (id === T.WOOD) this.fellTree(x, y, take, gone);
    // 失去支撐的物件（以「移除後」的世界判斷支撐）
    const goneAt = (tx: number, ty: number): boolean => w.inBounds(tx, ty) && gone.has(w.idx(tx, ty));
    const tileAfter = (tx: number, ty: number): number => (goneAt(tx, ty) ? T.AIR : w.getFg(tx, ty));
    const solidAfter = (tx: number, ty: number): boolean => isSolidTile(tileAfter(tx, ty));
    const supported = (nx: number, ny: number, nid: number): boolean => {
      switch (tileDef(nid).support) {
        case 'any': return w.getWall(nx, ny) !== 0 || solidAfter(nx - 1, ny) || solidAfter(nx + 1, ny)
          || solidAfter(nx, ny - 1) || solidAfter(nx, ny + 1);
        case 'floor': return floorOk(nid, tileAfter(nx, ny + 1));
        case 'ceiling': return ceilOk(nid, tileAfter(nx, ny - 1));
        case 'rope': return ropeOk(tileAfter(nx, ny - 1), tileAfter(nx - 1, ny), tileAfter(nx + 1, ny));
        case 'wall': return w.getWall(nx, ny) !== 0;
        case 'mount': return w.getWall(nx, ny) !== 0 || solidAfter(nx, ny + 1) || tileAfter(nx, ny + 1) === T.TABLE;
        default: return true;
      }
    };
    for (let k = 0; k < tiles.length; k++) {
      const [rx, ry] = tiles[k];
      for (const [nx, ny] of [[rx - 1, ry], [rx + 1, ry], [rx, ry - 1], [rx, ry + 1]] as const) {
        if (!w.inBounds(nx, ny) || gone.has(w.idx(nx, ny))) continue;
        const nid = w.getFg(nx, ny);
        if (!tileDef(nid).needsSupport) continue;
        if (!supported(nx, ny, nid)) take(nx, ny);
      }
    }
    // 有東西的箱子不能被挖掉（也不能因為挖掉它下面的地而掉落）——避免吞掉內容
    const chest = tiles.some(([tx, ty]) => isChestTile(w.getFg(tx, ty)) && !this.chestEmpty(tx, ty));
    return { tiles, drops, fits: this.inventory.canAddAll(drops), chest };
  }

  private chestEmpty(x: number, y: number): boolean {
    const c = this.world.chests.get(this.world.idx(x, y));
    return !c || c.every((s) => s === null);
  }

  /**
   * 移除 tile；處理砍樹與支撐。掉落物變成地上的道具（彈出來、靠近就撿，背包滿就留在地上）；
   * direct = true（debug 的 mineInstant）時直接進背包，放不下的才掉在地上。回傳是否有挖掉。
   */
  private breakTile(x: number, y: number, direct = false): boolean {
    const plan = this.planBreak(x, y);
    if (!plan.tiles.length) return false;
    if (plan.chest) { this.block('mine', 'chest', x, y); return false; }
    // 先算完所有掉落物再移除（門等多格物件的掉落依移除前的鄰格判斷）
    const all = plan.tiles.map(([tx, ty]) => { const tid = this.world.getFg(tx, ty); return { tx, ty, tid, drops: this.dropsFor(tid, tx, ty) }; });
    for (const { tx, ty, tid, drops } of all) {
      this.world.setFg(tx, ty, T.AIR);
      if (tid === T.BED_HEAD && this.bed && this.bed.x === tx && this.bed.y === ty) {
        this.bed = null;
        this.emit({ type: 'spawn', set: false, x: this.spawn.x, y: this.spawn.y });
      }
      if (tid === T.HEARTH) {
        const lost = this.settle.coreAt(tx, ty);
        // 重生爐心是每個角色自己的：把它設成重生點的每個人都清掉，各自收到提示
        if (lost) {
          for (const a of this.actors.values()) {
            if (a.spawnCore !== lost.id) continue;
            this.withActor(a, () => { a.spawnCore = null; this.emit({ type: 'spawn', set: false, x: this.spawn.x, y: this.spawn.y }); });
          }
        }
        this.settle.remove(tx, ty);
      }
      const bug = this.baitDrop(tid);
      // 脈鳴（鎬的傳奇詞條）：礦石有機率加倍
      const ap = this.activePick();
      const vein = ORE_TILES.has(tid) ? (ap?.gear?.affixes.find((a) => a.id === 'veinsong')?.value ?? 0) + this.levels.totals().vein : 0;
      const got = vein > 0 && this.lootRng.next() * 100 < vein ? drops.map((d) => ({ item: d.item, n: d.n * 2 })) : drops;
      for (const d of bug ? [...got, { item: bug, n: 1 }] : got) {
        const left = direct ? this.inventory.add(d.item, d.n) : d.n;
        if (left > 0) this.dropAtTile(d.item, left, tx, ty);
      }
      this.emit({ type: 'mine', x: tx, y: ty, tile: tid, item: drops.length ? drops[0].item : null });
    }
    return true;
  }

  /** 在 tile (tx,ty) 中心丟出掉落物（彈出方向由座標雜湊決定，確定性）；tint = 帶顏色的時裝（一件一個） */
  dropAtTile(item: ItemId, n: number, tx: number, ty: number, tint?: Tint): void {
    const h = ((Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663)) >>> 0) % 1000;
    const v = popVelocity(h / 1000, ((h * 7) % 1000) / 1000);
    const x = (tx + 0.5) * TILE_SIZE, y = (ty + 0.5) * TILE_SIZE;
    if (!tint) { this.drops.spawn(item, n, x, y, v.vx, v.vy * 0.7); return; }
    for (let k = 0; k < n; k++) this.drops.spawn(item, 1, x, y, v.vx, v.vy * 0.7, 0, undefined, tint);
  }

  /** 樹幹被砍：連帶收集上方相連的樹幹與樹葉（4 鄰、不往下、水平 ±4 格） */
  private fellTree(x: number, y: number, take: (tx: number, ty: number) => void, gone: Set<number>): void {
    const stack: [number, number][] = [[x, y - 1], [x - 1, y], [x + 1, y]];
    let guard = 0;
    while (stack.length && guard++ < 400) {
      const [tx, ty] = stack.pop()!;
      if (ty > y || Math.abs(tx - x) > 7) continue;
      if (!this.world.inBounds(tx, ty) || gone.has(this.world.idx(tx, ty))) continue;
      const tid = this.world.getFg(tx, ty);
      if (tid !== T.WOOD && tid !== T.LEAVES) continue;
      take(tx, ty);
      stack.push([tx, ty - 1], [tx - 1, ty], [tx + 1, ty]);
    }
  }

  private hasSupport(x: number, y: number): boolean {
    const w = this.world;
    if (w.getWall(x, y) !== 0) return true;
    return isSolidTile(w.getFg(x - 1, y)) || isSolidTile(w.getFg(x + 1, y))
      || isSolidTile(w.getFg(x, y - 1)) || isSolidTile(w.getFg(x, y + 1));
  }

  /** 放置時的支撐：地面型物件要正下方實心、垂吊型要正上方實心，平台可以接著平台往外延伸，其他照舊（鄰接實心或背牆）。 */
  private placeSupported(x: number, y: number, place: number): boolean {
    const sup = tileDef(place).support;
    if (sup === 'floor') return floorOk(place, this.world.getFg(x, y + 1));
    if (sup === 'ceiling') return ceilOk(place, this.world.getFg(x, y - 1));
    if (sup === 'rope') return ropeOk(this.world.getFg(x, y - 1), this.world.getFg(x - 1, y), this.world.getFg(x + 1, y));
    if (sup === 'wall') return this.world.getWall(x, y) !== 0;
    if (sup === 'mount') { const b = this.world.getFg(x, y + 1); return this.world.getWall(x, y) !== 0 || isSolidTile(b) || b === T.TABLE; }
    if (place === T.PLATFORM && (this.world.getFg(x - 1, y) === T.PLATFORM || this.world.getFg(x + 1, y) === T.PLATFORM)) return true;
    return this.hasSupport(x, y);
  }

  /** 門：同一欄連續的門 tile（含 (x,y)）的上下範圍 */
  private doorSpan(x: number, y: number): [number, number] {
    const w = this.world;
    let top = y, bot = y;
    while (top > 0 && isDoorTile(w.getFg(x, top - 1)) && y - top < 4) top--;
    while (bot < w.height - 1 && isDoorTile(w.getFg(x, bot + 1)) && bot - y < 4) bot++;
    return [top, bot];
  }

  /** 開 / 關 / 解鎖一扇門。回傳是否有改變。 */
  private useDoor(x: number, y: number): boolean {
    const w = this.world, id = w.getFg(x, y);
    const [top, bot] = this.doorSpan(x, y);
    if (id === T.DOOR_LOCKED) {
      if (!this.inventory.has('dungeon_key', 1)) { this.block('use', 'locked', x, y); return false; }
      this.inventory.remove('dungeon_key', 1);
      w.keysUsed++;
      for (let ty = top; ty <= bot; ty++) w.setFg(x, ty, T.DOOR_OPEN);
      this.emit({ type: 'unlock', x, y: top, item: 'dungeon_key' });
      this.emit({ type: 'door', open: true, x, y: top, unlocked: true });
      return true;
    }
    const open = id === T.DOOR_CLOSED;
    if (!open) {
      for (let ty = top; ty <= bot; ty++) if (this.tileOverlapsPlayer(x, ty)) { this.block('use', 'body', x, y); return false; }
    }
    for (let ty = top; ty <= bot; ty++) w.setFg(x, ty, open ? T.DOOR_OPEN : T.DOOR_CLOSED);
    this.emit({ type: 'door', open, x, y: top, unlocked: false });
    return true;
  }

  /** 木門放置：(x,y) 為最下面那格，往上佔 3 格，下方要實心地面 */
  private placeDoor(x: number, y: number, item: ItemId): boolean {
    const w = this.world;
    for (let k = 0; k < 3; k++) {
      const c = w.getFg(x, y - k);
      if (!w.inBounds(x, y - k) || (c !== T.AIR && !tileDef(c).replaceable)) { this.block('place', 'occupied', x, y); return false; }
      if (this.tileOverlapsPlayer(x, y - k)) { this.block('place', 'body', x, y); return false; }
    }
    if (!isSolidTile(w.getFg(x, y + 1))) { this.block('place', 'support', x, y); return false; }
    for (let k = 0; k < 3; k++) w.setFg(x, y - k, T.DOOR_CLOSED);
    this.inventory.takeFromSlot(this.inventory.selected, 1);
    this.emit({ type: 'place', x, y: y - 2, tile: T.DOOR_CLOSED, item });
    return true;
  }

  /** 雙格家具放置（床 / 沙發 / 壁爐）：(x,y) 左半、(x+1,y) 右半，兩格都要空、下面都要實心 */
  private placePair(x: number, y: number, item: ItemId, left: number): boolean {
    const w = this.world, pair = PAIR_OF_LEFT.get(left);
    if (!pair) return false;
    for (let k = 0; k < 2; k++) {
      const c = w.getFg(x + k, y);
      if (!w.inBounds(x + k, y) || (c !== T.AIR && !tileDef(c).replaceable)) { this.block('place', 'occupied', x, y); return false; }
      if (!isSolidTile(w.getFg(x + k, y + 1))) { this.block('place', 'support', x, y); return false; }
    }
    w.setFg(x, y, pair.left);
    w.setFg(x + 1, y, pair.right);
    this.inventory.takeFromSlot(this.inventory.selected, 1);
    this.emit({ type: 'place', x, y, tile: pair.left, item });
    return true;
  }

  /** 繩索放置：點在繩索上 → 接在這條繩索最下面；點在空格 → 要有支撐（天花板 / 繩索 / 平台 / 側牆） */
  private placeRope(x: number, y: number, item: ItemId): boolean {
    const w = this.world;
    let ty = y;
    if (w.getFg(x, y) === T.ROPE) {
      while (ty < w.height - 1 && w.getFg(x, ty) === T.ROPE) ty++;
      const c = w.getFg(x, ty);
      if (c !== T.AIR && !tileDef(c).replaceable) return false; // 到底了（靜默：按住時不洗提示）
    } else {
      const c = w.getFg(x, y);
      if (c !== T.AIR && !tileDef(c).replaceable) { this.block('place', 'occupied', x, y); return false; }
      if (!this.placeSupported(x, y, T.ROPE)) { this.block('place', 'support', x, y); return false; }
    }
    if (w.getFg(x, ty) !== T.AIR) w.setFg(x, ty, T.AIR);
    w.setFg(x, ty, T.ROPE);
    this.inventory.takeFromSlot(this.inventory.selected, 1);
    this.emit({ type: 'place', x, y: ty, tile: T.ROPE, item });
    return true;
  }

  /** 放背景牆：那格還沒有牆，而且貼著實心方塊或別的牆（或那格本身是實心） */
  private placeWall(x: number, y: number, item: ItemId): boolean {
    const w = this.world, id = ITEMS[item].placeWall ?? 0;
    if (!w.inBounds(x, y)) return false;
    if (w.getWall(x, y) !== 0) return false; // 已有牆（按住時不洗提示）
    if (!this.canReach(x, y)) { this.block('place', 'reach', x, y); return false; }
    const near = isSolidTile(w.getFg(x, y)) || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => w.getWall(x + dx, y + dy) !== 0 || isSolidTile(w.getFg(x + dx, y + dy)));
    if (!near) { this.block('place', 'support', x, y); return false; }
    w.setWall(x, y, id);
    this.inventory.takeFromSlot(this.inventory.selected, 1);
    this.emit({ type: 'place', x, y, tile: T.AIR, item });
    return true;
  }
  /** 拆木板牆（瞄準空格挖）：掉木板牆；牆上掛的東西失去支撐就掉下來 */
  private mineWall(x: number, y: number, dt: number): void {
    if (!this.canReach(x, y)) { this.block('mine', 'reach', x, y); this.mining = null; return; }
    const need = 0.3 / this.currentPick().speed;
    if (!this.mining || this.mining.x !== x || this.mining.y !== y) this.mining = { x, y, elapsed: 0, need };
    this.mining.elapsed += dt;
    if (this.mining.elapsed + 1e-9 < need) return;
    this.mining = null;
    const w = this.world, item = WALL_ITEM[w.getWall(x, y)] ?? 'plank_wall';
    w.setWall(x, y, 0);
    this.dropAtTile(item, 1, x, y);
    this.emit({ type: 'mine', x, y, tile: T.PLANKS, item });
    const f = w.getFg(x, y), sup = tileDef(f).support;
    if ((sup === 'wall' || sup === 'any' || sup === 'mount') && !this.placeSupported(x, y, f)) this.breakTile(x, y);
  }

  /** 嘗試以快捷欄選中的方塊放在 (x,y)。 */
  tryPlace(x: number, y: number): boolean {
    const stack = this.inventory.selectedStack();
    if (stack && ITEMS[stack.item].placeWall !== undefined) return this.placeWall(x, y, stack.item);
    const place = stack ? ITEMS[stack.item].place : undefined;
    if (!stack || place === undefined) return false;
    if (!this.world.inBounds(x, y)) return false;
    if (place === T.ROPE) {
      if (!this.canReach(x, y)) { this.block('place', 'reach', x, y); return false; }
      return this.placeRope(x, y, stack.item);
    }
    const cur = this.world.getFg(x, y);
    const replace = cur !== T.AIR && cur !== place && tileDef(cur).replaceable;
    if (cur !== T.AIR && !replace) { this.block('place', 'occupied', x, y); return false; }
    if (!this.canReach(x, y)) { this.block('place', 'reach', x, y); return false; }
    if (place === T.DOOR_CLOSED) return this.placeDoor(x, y, stack.item);
    if (PAIR_OF_LEFT.has(place)) return this.placePair(x, y, stack.item, place);
    if (place === T.HEARTH && this.settle.canFound(x, y) !== 'ok') { this.block('place', 'claim', x, y); return false; }
    if (isSolidTile(place) && this.tileOverlapsPlayer(x, y)) { this.block('place', 'body', x, y); return false; }
    if (!this.placeSupported(x, y, place)) { this.block('place', 'support', x, y); return false; }
    if (replace) {
      this.world.setFg(x, y, T.AIR);
      this.emit({ type: 'mine', x, y, tile: cur, item: null });
    }
    this.world.setFg(x, y, place);
    this.inventory.takeFromSlot(this.inventory.selected, 1);
    this.emit({ type: 'place', x, y, tile: place, item: stack.item });
    if (place === T.HEARTH) { this.settle.found(x, y); for (const e of this.settle.drainEvents()) this.emit(e); }
    return true;
  }

  /** 有玩家（任一 actor，不只自己；aliveOnly = 只算活著的）的身體碰到 tile (x,y)：放方塊 / 關門 / NPC 關門 / 液體都不能夾到人 */
  private tileOverlapsPlayer(x: number, y: number, aliveOnly = false): boolean {
    const S = TILE_SIZE;
    for (const a of this.actors.values()) {
      if (aliveOnly && a.dead) continue;
      const p = a.player;
      if (p.x < (x + 1) * S && p.x + p.w > x * S && p.y < (y + 1) * S && p.y + p.h > y * S) return true;
    }
    return false;
  }

  private block(action: 'mine' | 'place' | 'use', reason: BlockReason, x: number, y: number): void {
    const key = `${action}:${reason}:${x}:${y}`;
    // 同一格同原因只提示一次；換瞄準格（setAim 清掉）或超過 BLOCK_REPEAT 秒後可再提示
    if (key === this.lastBlocked && this.time - this.lastBlockedAt < BLOCK_REPEAT) return;
    this.lastBlocked = key;
    this.lastBlockedAt = this.time;
    this.emit({ type: 'blocked', action, reason, x, y });
  }

  /**
   * 使用中的鎬：永遠自動用背包裡實際最快的那把（含強化 / 勤掘）。
   * 它的挖掘類詞條（勤掘 → 速度、脈鳴）挖礦時一定生效；其他詞條（幸運 / 疾風 / 螢光…）要把「這把」拿在手上才生效。
   */
  activePick(): Stack | null {
    const i = this.inventory.bestPickSlot();
    return i >= 0 ? this.inventory.slots[i] : null;
  }
  private currentPick(): PickStats {
    const st = this.activePick();
    const k = (1 + this.levels.totals().mineSpd / 100) * (this.buffOn('minesong') ? BUFFS.minesong.mine : 1) * this.raceMods().mineMul;
    return st ? { speed: pickSpeed(st.item, st.gear) * k, tier: ITEMS[st.item].pick!.tier } : { ...HAND, speed: HAND.speed * k };
  }

  // ── 飾品 / 移動能力 ───────────────────────────────────
  /**
   * 某種飾品效果有沒有生效：資訊類（指南針 / 深度計 / 探險家地圖）放背包或裝備都算；
   * 其他（靴子、護符、磁石、戰鬥飾品）要裝在裝備欄的飾品槽。
   */
  hasAccessory(a: Accessory): boolean {
    const sl = this.inventory.slots;
    let sig = `${this.equipment.uid}:${this.equipment.version}|`;
    for (let i = 0; i < sl.length; i++) { const st = sl[i]; if (st && ITEMS[st.item].accessory) sig += st.item + ','; }
    if (sig !== this.accSig) {
      this.accSig = sig;
      const set = new Set<Accessory>();
      for (const it of this.equipment.accessories()) { const ac = ITEMS[it].accessory; if (ac) set.add(ac); }
      for (const st of sl) {
        const ac = st ? ITEMS[st.item].accessory : undefined;
        if (ac && INFO_ACCESSORIES.includes(ac)) set.add(ac);
      }
      this.acc = set;
    }
    return this.acc.has(a);
  }
  /** 當前種族被動（每次即時算、不快取：中途換種族立即生效；加在技能上限之外） */
  raceMods(): RaceMods { return raceMods(this.appearance.race); }
  moveStats(): MoveStats {
    const g = this.stats().gear;
    return {
      runMul: (this.hasAccessory('run') ? 1.45 : 1) * (1 + g.move / 100),
      // 跳躍高度約與初速平方成正比：+X% 高度 ≈ 初速 × √(1 + X%)（種族 jumpMul 是高度倍率，同樣開根號）
      jumpMul: (this.hasAccessory('jump') ? 1.25 : 1) * Math.sqrt(1 + g.jump / 100) * Math.sqrt(this.raceMods().jumpMul),
      // 凌雲（詞條）+ 雲步（技能）= 最多三段跳
      airJumps: (g.djump > 0 ? 1 : 0) + this.levels.totals().airJump,
    };
  }
  /** 伸手距離（格）：磁石 +3 */
  reach(): number { return REACH_TILES + (this.hasAccessory('magnet') ? MAGNET_REACH : 0) + this.levels.totals().reach; }
  /** 掉落物吸取半徑（格）：一般 5、磁石 12 */
  magnetRadius(): number { return this.hasAccessory('magnet') ? LODESTONE_TILES : MAGNET_TILES; }
  /**
   * 裝備帶來的數值（含手上武器、使用中的鎬的詞條）。裝備欄 / 選中格 / 那兩格的道具或詞條換了才重算。
   */
  stats(): PlayerStats {
    const inv = this.inventory, held = inv.selectedStack();
    const weapon = held && ITEMS[held.item].weapon ? held : null;
    // 鎬的一般詞條：只有拿在手上的正是使用中的那把才算
    const pick = held && ITEMS[held.item].pick && inv.slots[inv.bestPickSlot()] === held ? held : null;
    const key = `${this.equipment.uid}:${this.equipment.version}:${this.statsDirty}:${this.levels.version}`;
    const refs = [weapon, weapon?.gear, pick, pick?.gear];
    if (key !== this.statsKey || this.statsEq !== this.equipment || refs.some((r, i) => r !== this.statsRefs[i])) {
      this.statsKey = key; this.statsEq = this.equipment; this.statsRefs = refs;
      // 技能樹和詞條共用上限（gearBonus 加進原始加總再封頂）；等級的防禦成長另外加
      const c = computeStats(this.equipment, [weapon, pick], gearBonus(this.levels.totals()));
      this.statsCache = { ...c, defense: c.defense + levelDef(this.levels.level) };
    }
    return this.statsCache;
  }
  /** 詞條在原處被改了（鍛造 / 鎖定）→ 數值重算 */
  invalidateStats(): void { this.statsDirty++; }
  maxHp(): number { return Math.min(MAX_HP_CAP, this.baseMaxHp) + this.stats().maxHpBonus + levelHp(this.levels.level); }
  maxMana(): number { return BASE_MANA; }
  /** 直接裝上（debug / e2e / 測試；不經背包）。回傳裝到哪一槽。 */
  equip(item: ItemId, slot?: EquipSlot): EquipSlot | null {
    const s = slot ?? this.equipment.autoSlot(item);
    if (!s || !this.equipment.set(s, item)) return null;
    return s;
  }
  /** 背包第 i 格裝到 slot（省略 = 自動找槽） */
  equipFromInventory(i: number, slot?: EquipSlot): boolean {
    const st = this.inventory.slots[i];
    if (!st) return false;
    const s = slot ?? this.equipment.autoSlot(st.item);
    return s ? this.equipment.equipFrom(this.inventory, i, s) : false;
  }
  /** 背包第 i 格放進外觀欄 slot（省略 = 依道具決定） */
  equipVanityFromInventory(i: number, slot?: VanitySlot): boolean {
    const st = this.inventory.slots[i];
    if (!st) return false;
    const d = ITEMS[st.item];
    const s = slot ?? d.vanity?.slot ?? d.armor?.slot;
    return s ? this.vanity.equipFrom(this.inventory, i, s) : false;
  }
  unequipVanity(slot: VanitySlot): boolean { return this.vanity.unequipTo(this.inventory, slot); }
  /**
   * 梳妝台：身上每件換色看得出來的時裝（外觀欄順序）——目前的顏色（沒有 tint = 款式原色）與幾個顏色（tintChannels）。
   * 固定配色的（礦工盔、花冠、羽翼、髮夾…）不列。
   */
  mirrorTints(): { slot: VanitySlot; item: ItemId; tint: Tint; channels: 1 | 2 }[] {
    const out: { slot: VanitySlot; item: ItemId; tint: Tint; channels: 1 | 2 }[] = [];
    for (const slot of VANITY_SLOTS) {
      const st = this.vanity.getStack(slot), look = st ? ITEMS[st.item].vanity?.look : undefined;
      if (!st || !look) continue;
      const channels = tintChannels(look), tint = st.tint ?? defaultTint(look);
      if (channels === 0 || !tint) continue;
      out.push({ slot, item: st.item, tint: [tint[0], tint[1]], channels });
    }
    return out;
  }
  /**
   * 梳妝台：替外觀欄 slot 上正穿著的時裝換顏色（免費）。那格沒東西 / 不是看得出顏色的時裝 / 顏色不合法 → false。
   * 只有主色的款式：副色跟著主色。改的是那件物品本身（脫下來、放箱子都帶著）；紙娃娃靠 vanity.version 重畫。
   */
  recolorWorn(slot: VanitySlot, tint: [number, number]): boolean {
    const st = this.vanity.getStack(slot), look = st ? ITEMS[st.item].vanity?.look : undefined;
    const t = validTint(tint);
    if (!st || !look || !t) return false;
    const ch = tintChannels(look);
    if (ch === 0) return false;
    if (ch === 1) t[1] = t[0];
    if (st.tint && st.tint[0] === t[0] && st.tint[1] === t[1]) return true;
    st.tint = t;
    this.vanity.touch();
    return true;
  }
  setHideArmor(slot: HideSlot, hide: boolean): void { this.vanity.setHide(slot, hide); }
  /** 紙娃娃現在的樣子（外觀 / 裝備 / 外觀欄沒變就回傳同一個物件）與快取 key */
  doll(): { look: DollLook; key: string } {
    const e = this.equipment, v = this.vanity;
    const sig = `${e.uid}:${e.version}:${v.version}:${v.hide.head ? 1 : 0}${v.hide.body ? 1 : 0}${v.hide.legs ? 1 : 0}`;
    const m = this.dollMemo;
    if (m && m.sig === sig && m.look.app === this.appearance) return m;
    const look = buildDollLook(this.appearance, e, v);
    this.dollMemo = { sig, look, key: dollKey(look) };
    return this.dollMemo;
  }
  unequip(slot: EquipSlot): boolean {
    const ok = this.equipment.unequipTo(this.inventory, slot);
    if (ok && this.hp > this.maxHp()) this.hp = this.maxHp();
    return ok;
  }
  /** 導航資訊：有指南針才有東西座標（相對出生點，東 = 正），有深度計才有深度格數 */
  navInfo(): { east: number | null; depth: number | null } {
    const f = this.feetTile();
    return {
      east: this.hasAccessory('compass') ? f.x - this.spawn.x : null,
      depth: this.hasAccessory('depth') ? Math.max(0, f.y + 1 - this.world.surfaceAt(f.x)) : null,
    };
  }

  // ── 探索 ─────────────────────────────────────────────
  private updateExploration(): void {
    const t = this.playerTile(), c = this.playerCenter(), f = this.feetTile();
    this.discovery.track(c.x, c.y, f.y + 1 - this.world.surfaceAt(f.x));
    if (t.x !== this.lastTile.x || t.y !== this.lastTile.y) {
      this.lastTile = t;
      this.explored.revealDisc(t.x, t.y, REVEAL_RADIUS);
      for (const r of this.discovery.visit(t.x, t.y)) {
        this.emit({ type: 'discover', region: { id: r.id, name: r.name, cat: r.cat, kind: r.kind } });
      }
    }
    if (this.tick % 20 === 0) {
      for (const st of this.inventory.slots) {
        if (st && ITEMS[st.item].unique && this.discovery.gainTreasure(st.item)) this.emit({ type: 'treasure', item: st.item });
      }
      for (const it of this.equipment.items()) {
        if (ITEMS[it].unique && this.discovery.gainTreasure(it)) this.emit({ type: 'treasure', item: it });
      }
      this.observeGear();
    }
  }
  /** 畫面上（view，tile 座標）光照夠亮的格 → 揭露。回傳新揭露格數 */
  revealLit(L: LightMap, view: LightRect): number { return this.explored.revealLit(L, view, REVEAL_LIGHT); }
  /** 在地圖 (x,y) 新增 / 移除標記 */
  toggleMarker(x: number, y: number): 'added' | 'removed' | 'full' {
    const r = toggleMarker(this.markers, x, y);
    this.markers = r.markers;
    return r.action;
  }
  /** 古碑 (x,y) 的碑文編號 */
  tabletId(x: number, y: number): number {
    return this.tabletAt.get(this.world.idx(x, y)) ?? ((x * 7 + y) % 14);
  }

  // ── 床 / 傳送石 ───────────────────────────────────────
  /** 目前玩家（cur）的重生點（腳底 tile）：自己選的據點爐心 > 自己的床（床頭那格）> 出生點 */
  respawnPoint(): { x: number; y: number } {
    const core = this.cur.spawnCore;
    const hc = core !== null ? this.settle.coreById(core) : null;
    if (hc && this.world.getFg(hc.x, hc.y) === T.HEARTH) {
      // 爐心旁最近的空位（被方塊圍住 → 改用床 / 出生點）
      const spot = findStandSpot(this.world, hc.x + 1, hc.y);
      if (spot) return spot;
    }
    const b = this.bed;
    // 床可能在沒載入的遠方（Review Focus 5）：先載入床那一欄再看床還在不在（傳送時 teleport 再載入整個載入區）
    if (b && this.world.inBounds(b.x, b.y)) this.world.ensureColumn(chunkOfX(b.x));
    if (b && this.world.getFg(b.x, b.y) === T.BED_HEAD) return { x: b.x, y: b.y };
    return { x: this.spawn.x, y: this.spawn.y };
  }
  private useBed(x: number, y: number): boolean {
    const hx = this.world.getFg(x, y) === T.BED_FOOT ? x - 1 : x;
    if (this.world.getFg(hx, y) !== T.BED_HEAD) return false;
    this.bed = { x: hx, y };
    this.cur.spawnCore = null;
    this.emit({ type: 'spawn', set: true, x: hx, y });
    if (this.isNight()) this.trySleep(hx, y);
    return true;
  }
  /** 晚上躺上床：附近沒有怪 → 這個玩家 ready；活著的人都 ready 才開始睡（淡出 → 跳到日出 → 淡入）；有怪 → 提示 */
  private trySleep(x: number, y: number): void {
    if (this.sleepT !== null) return;
    const pc = this.playerCenter();
    const threat = this.enemies.some((e) => {
      const def = ENEMIES[e.kind];
      if (def.boss) return true;
      const b = e.body;
      return !def.minion && Math.abs(b.x + b.w / 2 - pc.x) / TILE_SIZE < SLEEP_SAFE.x && Math.abs(b.y + b.h / 2 - pc.y) / TILE_SIZE < SLEEP_SAFE.y;
    });
    if (threat) { this.block('use', 'sleep', x, y); return; }
    this.sleepReady = true;
    this.cur.sleepPos = { x: this.player.x, y: this.player.y };
    this.settleSleeper();
    this.checkSleepStart();
    this.emitSleepWait();
  }
  /** ready 的人躺好不動：清掉挖 / 打 / 傳送、關箱子、站定 */
  private settleSleeper(): void {
    this.mining = null; this.miningHeld = false; this.attack = null;
    this.recallT = null;
    this.closeChest();
    this.player.vx = 0;
  }
  /** ready 的玩家（玩家段開頭）：有移動輸入 / 床沒了 / 天亮了 / 離床太遠 → 取消；否則站定 */
  private holdSleepReady(): void {
    const b = this.bed, p = this.player;
    const at = this.cur.sleepPos;
    const away = !b || this.world.getFg(b.x, b.y) !== T.BED_HEAD || !at
      || Math.abs(p.x - at.x) > TILE_SIZE * 1.5 || Math.abs(p.y - at.y) > TILE_SIZE * 1.5;
    if (this.moveX !== 0 || this.jump || this.upHeld || !this.isNight() || away) { this.sleepReady = false; return; }
    p.vx = 0;
    this.mining = null; this.miningHeld = false; this.attack = null;
  }
  /** 沒在睡、至少一人 ready、活著的人全 ready → 開始睡 */
  private checkSleepStart(): void {
    if (this.sleepT !== null) return;
    const all = [...this.actors.values()], alive = all.filter((a) => !a.dead);
    if (alive.length === 0 || !alive.every((a) => a.sleepReady)) { this.emitSleepWait(); return; }
    this.sleepT = 0; this.sleepSkipped = false;
    for (const a of alive) this.withActor(a, () => this.settleSleeper());
    for (const a of all) a.sleepReady = false;
    this.sleepWaitSig = 0;
    this.emit({ type: 'sleep', phase: 'start' });
  }
  /** 等待中的人數（多人且至少一人 ready、還沒開始睡）；否則 null */
  sleepWaiting(): { ready: number; total: number } | null {
    if (this.actors.size < 2 || this.sleepT !== null) return null;
    const alive = [...this.actors.values()].filter((a) => !a.dead);
    const ready = alive.filter((a) => a.sleepReady).length;
    return ready > 0 ? { ready, total: alive.length } : null;
  }
  private emitSleepWait(): void {
    const w = this.sleepWaiting();
    const sig = w ? w.ready * 100 + w.total : 0;
    if (sig === this.sleepWaitSig) return;
    this.sleepWaitSig = sig;
    if (w) this.inWorld(() => this.emit({ type: 'sleep', phase: 'wait', ready: w.ready, total: w.total }));
  }
  private updateSleep(dt: number): void {
    if (this.sleepT === null) return;
    this.sleepT += dt;
    if (!this.sleepSkipped && this.sleepT >= SLEEP_FADE) {
      this.sleepSkipped = true;
      this.time = nextSunrise(this.time) + DAY_LENGTH * 0.004;
      this.wxCache = null;
      const day = dayIndexOf(this.time);
      if (day !== this.lastDay) this.onNewDay(day);
      // 睡飽：每個活著的人回滿血、怪物生成重新從慢開始
      for (const a of this.actors.values()) if (!a.dead) this.withActor(a, () => { this.hp = this.maxHp(); });
      this.spawnCalm = 0;
      this.spawnT = Math.max(this.spawnT, 4);
    }
    if (this.sleepT >= SLEEP_FADE * 2) {
      this.sleepT = null;
      this.emit({ type: 'sleep', phase: 'wake' });
    }
  }
  /** 睡覺淡出 / 淡入 0..1 */
  sleepFade(): number {
    const t = this.sleepT;
    if (t === null) return 0;
    return Math.max(0, Math.min(1, t < SLEEP_FADE ? t / SLEEP_FADE : (SLEEP_FADE * 2 - t) / SLEEP_FADE));
  }
  get sleeping(): boolean { return this.sleepT !== null; }
  private startRecall(): void {
    if (this.recallT !== null) return;
    this.recallT = 0;
    const r = this.respawnPoint();
    this.emit({ type: 'recall', phase: 'start', x: r.x, y: r.y });
  }
  private updateRecall(dt: number): void {
    if (this.recallT === null) return;
    const r = this.respawnPoint();
    if (this.moveX !== 0 || this.jump || this.upHeld) {
      this.recallT = null;
      this.emit({ type: 'recall', phase: 'cancel', x: r.x, y: r.y });
      return;
    }
    this.recallT += dt;
    if (this.recallT + 1e-9 >= RECALL_TIME) {
      this.recallT = null;
      this.teleport(r.x, r.y);
      this.closeChest();
      this.emit({ type: 'recall', phase: 'done', x: r.x, y: r.y });
    }
  }

  // ── 查詢 ───────────────────────────────────────────────
  /**
   * 玩家中心（px）：伸手 / 互動 / 瞄準的基準點。y 固定在腳底往上 REACH_CENTER_Y（= 舊的 42 px 碰撞盒的中心）：
   * 碰撞盒改成貼著角色的高度之後，手搆得到的範圍、工作台 / 箱子的距離都和以前一樣
   */
  playerCenter(): { x: number; y: number } {
    return { x: this.player.x + this.player.w / 2, y: this.player.y + this.player.h - REACH_CENTER_Y };
  }
  /** 玩家中心所在 tile */
  playerTile(): { x: number; y: number } {
    const c = this.playerCenter();
    return { x: Math.floor(c.x / TILE_SIZE), y: Math.floor(c.y / TILE_SIZE) };
  }
  /** 所有玩家（插入順序，本地第一個）：中心 px（同 playerCenter）、死活、在不在水裡（水生怪只追水裡的人） */
  players(): { pid: Pid; cx: number; cy: number; dead: boolean; wet: boolean }[] {
    return this.views().map(({ pid, cx, cy, dead, wet }) => ({ pid, cx, cy, dead, wet }));
  }
  private views(): PlayerView[] {
    const out: PlayerView[] = [];
    for (const a of this.actors.values()) {
      const p = a.player;
      out.push({
        pid: a.pid, cx: p.x + p.w / 2, cy: p.y + p.h - REACH_CENTER_Y, dead: a.dead,
        wet: !a.dead && a.contact.type === LIQ.WATER && a.contact.frac > 0.2, a,
      });
    }
    return out;
  }
  /** 離 (x,y) px 最近的活著的玩家；全員死亡 → 最近的屍體。距離相同取插入順序在前的 */
  private nearestView(vs: readonly PlayerView[], x: number, y: number): PlayerView {
    const anyAlive = vs.some((v) => !v.dead);
    let best = vs[0], bd = Infinity;
    for (const v of vs) {
      if (anyAlive && v.dead) continue;
      const dx = v.cx - x, dy = v.cy - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
  /** 給 NPC 系統（據點 / 世界 NPC）：活著的玩家站的 tile（插入順序；全員死亡 → 所有人的，單機死亡時就是屍體那格） */
  private playerTiles(): { x: number; y: number }[] {
    const vs = this.views(), alive = vs.filter((v) => !v.dead);
    return (alive.length ? alive : vs).map((v) => ({ x: Math.floor(v.cx / TILE_SIZE), y: Math.floor(v.cy / TILE_SIZE) }));
  }
  private allDead(): boolean {
    for (const a of this.actors.values()) if (!a.dead) return false;
    return true;
  }
  /** 玩家腳底所在 tile（x 取中心欄；站在地面上時 y+1 為地面） */
  feetTile(): { x: number; y: number } {
    const p = this.player;
    return { x: Math.floor((p.x + p.w / 2) / TILE_SIZE), y: Math.floor((p.y + p.h - 0.001) / TILE_SIZE) };
  }
  /** 玩家中心到 tile 中心的距離 ≤ REACH_TILES 格 */
  canReach(tx: number, ty: number, reach: number = this.reach()): boolean {
    const c = this.playerCenter();
    const dx = (tx + 0.5) * TILE_SIZE - c.x, dy = (ty + 0.5) * TILE_SIZE - c.y;
    const r = reach * TILE_SIZE;
    return dx * dx + dy * dy <= r * r;
  }
  /** 玩家中心 tile 的 STATION_RANGE 格（Chebyshev）內有工作台 */
  nearWorkbench(): boolean { return this.nearTile(T.WORKBENCH); }
  /** 附近有哪些合成站 */
  stations(): Record<Station, boolean> {
    const linked = this.linkedStations();
    const has = (id: number): boolean => this.nearTile(id) || Boolean(linked?.has(id));
    return {
      workbench: has(T.WORKBENCH), furnace: has(T.FURNACE) || this.nearTile(T.DWARF_FORGE),
      anvil: has(T.ANVIL) || this.nearNpc('smith') || this.nearTile(T.DWARF_FORGE) || this.forgeFolk() !== null,
      campfire: has(T.CAMPFIRE) || has(T.FIREPLACE_L) || this.nearNpc('cook'),
    };
  }
  private nearTile(id: number): boolean {
    const p = this.playerTile();
    for (let y = p.y - STATION_RANGE; y <= p.y + STATION_RANGE; y++) {
      for (let x = p.x - STATION_RANGE; x <= p.x + STATION_RANGE; x++) {
        if (this.world.inBounds(x, y) && this.world.getFg(x, y) === id) return true;
      }
    }
    return false;
  }
  skyLevel(): number {
    const s = this.sun(), wx = this.localWeatherState();
    const v = skyBrightness(this.time, s.sunrise, s.sunset, s.twilight) * weatherDim(wx.kind, wx.intensity);
    return Math.max(v, this.flash());
  }
  isNight(): boolean { return isNightTime(this.time); }

  // ── 曆法 / 天氣（查詢；季節 / 天氣 getter 也給日後的釣魚用） ──
  date(): GameDate { return dateOf(this.time); }
  dateText(): string { return formatDate(this.time); }
  season(): Season { return seasonOf(dayIndexOf(this.time)); }
  /** 今天的日出 / 日落 / 曙暮光 */
  sun(): SunTimes { return sunTimes(dayIndexOf(this.time)); }
  moon(): number { return moonPhase(this.time); }
  /** 全域天氣（含強制天氣） */
  weather(): WeatherState { return this.wx().g; }
  /** 玩家所在處的天氣（依生態區在地化：雪原下雪、沙漠不下雪） */
  localWeatherState(): WeatherState { return this.wx().local; }
  /** 風 −1..1（粒子 / 草的擺動） */
  wind(): number { const w = this.wx().local; return w.wind * (0.6 + 0.4 * w.intensity); }
  /** 閃電閃光 0 / 0.5 / 1（階梯） */
  flash(): number { return this.flashT <= 0 ? 0 : this.flashT > FLASH_TIME * 0.55 ? 1 : 0.5; }
  private wx(): { g: WeatherState; local: WeatherState } {
    let c = this.wxCache;
    if (!c || c.tick !== this.tick || c.time !== this.time) {
      const o = this.weatherOverride;
      let g: WeatherState;
      if (o && this.time < o.until) g = { kind: o.kind, intensity: 1, wind: FORCED_WIND[o.kind] };
      else {
        if (o) this.weatherOverride = null;
        g = weatherAt(this.seed, this.time);
      }
      c = this.wxCache = { tick: this.tick, time: this.time, g, local: new Map() };
    }
    // 在地天氣看 cur 的腳下：每個玩家各自快取
    let r = c.local.get(this.cur);
    if (!r) {
      const f = this.feetTile();
      r = { g: c.g, local: { ...c.g, kind: localWeather(c.g.kind, this.world.biomeAt(f.x)) } };
      c.local.set(this.cur, r);
    }
    return r;
  }
  /** debug / e2e：強制天氣 hours 小時（null = 取消，回到依 seed 的天氣） */
  forceWeather(kind: WeatherKind | null, hours = 6): void {
    this.weatherOverride = kind ? { kind, until: this.time + (hours / 24) * DAY_LENGTH } : null;
    this.wxCache = null;
    if (kind !== 'storm') this.flashT = 0;
    this.boltT = Math.min(this.boltT, 1.5);
  }
  /** debug / e2e：跳到某年某季某日某時（省略的欄位用現在的值）；會立即更新結冰。回傳日期文字 */
  setDate(o: { year?: number; season?: number; day?: number; hour?: number }): string {
    const d = this.date();
    const year = o.year ?? d.year, season = o.season ?? d.season, day = o.day ?? d.dayOfSeason;
    const hour = o.hour ?? d.frac * 24;
    const idx = (Math.max(1, year) - 1) * DAYS_PER_YEAR + Math.max(0, Math.min(3, season)) * DAYS_PER_SEASON + Math.max(0, Math.min(DAYS_PER_SEASON - 1, day - 1));
    this.time = (idx + Math.max(0, Math.min(23.999, hour)) / 24) * DAY_LENGTH;
    this.wxCache = null;
    this.onNewDay(idx);
    return this.dateText();
  }
  /** 依目前日期重算結冰（讀檔 / debug 後） */
  refreshSeason(): void { this.onNewDay(dayIndexOf(this.time)); }
  /** 讀檔還原：存檔已帶結冰狀態時只同步天數、不重算 */
  syncDay(): void { this.lastDay = dayIndexOf(this.time); this.wxCache = null; }
  /** 換日（世界段：step 外的 setDate / refreshSeason 呼叫也一樣不帶 pid） */
  private onNewDay(day: number): void { this.inWorld(() => this.newDay(day)); }
  private newDay(day: number): void {
    this.lastDay = day;
    // 據點的嚮導：每天自動在地圖上標一個新地點
    const guide = this.settle.npc('guide');
    if (guide && day > this.perkDays.guide) {
      this.perkDays.guide = day;
      const r = this.scout();
      if (r) this.emit({ type: 'scoutmark', by: this.settle.nameOf('guide'), name: r.name, x: r.x, y: r.y });
    }
    // 只跑常駐的欄（x 升冪；有界世界 = 全部）
    updateFreeze(this.world, this.liquids, day, (x, y) => this.tileOverlapsPlayer(x, y, true), this.minedIce, this.world.residentColumns());
  }
  /** 天氣效果：雷雨打閃電、雨水補露天水池 */
  private updateWeatherFx(dt: number): void {
    const wx = this.localWeatherState();
    const f = this.feetTile(), w = this.world;
    const nearSurface = f.y <= w.surfaceAt(f.x) + 12;
    if (wx.kind === 'storm' && wx.intensity > 0.4) {
      this.boltT -= dt;
      if (this.boltT <= 0) {
        const r = this.weatherRng;
        this.boltT = BOLT_MIN + r.next() * (BOLT_MAX - BOLT_MIN);
        const bx = Math.max(w.xMin, Math.min(w.xMax - 1, f.x + Math.round((r.next() * 2 - 1) * 40)));
        if (nearSurface) {
          this.flashT = FLASH_TIME;
          this.wxCache = null;
          this.emit({ type: 'lightning', x: bx, y: w.surfaceAt(bx), dist: Math.abs(bx - f.x) });
        }
      }
    }
    if ((wx.kind === 'rain' || wx.kind === 'storm') && wx.intensity > 0.3) {
      this.rainT -= dt;
      if (this.rainT <= 0) { this.rainT = RAIN_EVERY; this.rainFill(f.x); }
    }
  }
  /** 在玩家附近隨機挑一欄：露天的水面那格補一點水（補到 RAIN_TOP 為止，不會長出新的一層） */
  private rainFill(px: number): void {
    const w = this.world, r = this.weatherRng;
    const x = px + Math.round((r.next() * 2 - 1) * 40);
    if (x < w.xMin || x >= w.xMax) return;
    const surf = w.surfaceAt(x);
    for (let y = Math.max(0, surf - 64); y <= Math.min(w.height - 1, surf + 12); y++) {
      if (isSolidTile(w.getFg(x, y)) || w.isFrozen(x, y)) return;
      const a = w.getLiquid(x, y);
      if (!a) continue;
      if (w.getLiquidType(x, y) !== LIQ.WATER || w.getWall(x, y) !== 0 || a >= RAIN_TOP) return;
      w.setLiquid(x, y, Math.min(RAIN_TOP, a + RAIN_ADD), LIQ.WATER);
      this.liquids.wake(x, y);
      return;
    }
  }

  craft(recipeId: string): CraftResult {
    const st = this.stations();
    if (this.sharedStorage()) {
      const r0 = this.craftFromStorage(recipeId, st);
      if (r0) return r0;
    }
    // 合成的裝備也擲一次稀有度（大多是普通 / 優良；物品等級 = 基底等級）
    const sk = this.levels.totals();
    const make = (item: ItemId): Gear | undefined => {
      if (!gearSlot(item)) return undefined;
      const g = this.rollFor(item, 'craft', 0, baseTier(item));
      // 精工（技能核心）：機率再升一階（最高到稀有）
      if (sk.masterwork > 0 && g.rarity < 2 && this.lootRng.next() * 100 < sk.masterwork) return ascendGear(item, g, this.lootRng) ?? g;
      return g;
    };
    const r = craftRecipe(this.inventory, recipeId, { nearWorkbench: st.workbench, nearFurnace: st.furnace, nearAnvil: st.anvil, nearCampfire: st.campfire }, make);
    if (r.ok) {
      const rc = findRecipe(recipeId), out = rc?.out;
      if (out) this.emit({ type: 'craft', recipe: recipeId, item: out.item, n: out.n });
      // 惜料（技能）：機率退回一份主要材料（用量最多的那種）
      if (rc && sk.refund > 0 && rc.inputs.length && this.lootRng.next() * 100 < sk.refund) {
        const main = [...rc.inputs].sort((a, b) => b.n - a.n)[0].item, pt = this.playerTile();
        if (this.inventory.add(main, 1) > 0) this.dropAtTile(main, 1, pt.x, pt.y);
        this.emit({ type: 'refund', item: main });
      }
    }
    return r;
  }

  // ── 箱子 ───────────────────────────────────────────────
  /** 與 (x,y) 互動：箱子（開箱）、金寶箱（金鑰匙解鎖）、門（開 / 關 / 用地城鑰匙解鎖）、古碑（碑文）。回傳是否有互動。 */
  interact(x: number, y: number): boolean {
    const w = this.world, id = w.getFg(x, y);
    if (!isInteractive(id)) return false;
    if (!this.canReach(x, y)) { this.block('use', 'reach', x, y); return false; }
    if (isDoorTile(id)) return this.useDoor(x, y);
    if (isBedTile(id)) return this.useBed(x, y);
    if (id === T.HEARTH) {
      const c = this.settle.coreAt(x, y) ?? (this.settle.canFound(x, y) === 'ok' ? this.settle.found(x, y) : null);
      if (c) this.emit({ type: 'hearth', id: c.id, x, y });
      return Boolean(c);
    }
    if (id === T.QUEST_BOARD) {
      const v = this.villages.findIndex((q) => Math.abs(q.board.x - x) <= 2 && Math.abs(q.board.y - y) <= 2);
      const elder = this.folk.byKey(`v${Math.max(0, v)}:elder`);
      if (!elder) return false;
      this.emit({ type: 'folktalk', key: elder.key, line: '委託板上釘著幾張紙條。做完了去找村長領報酬。', board: true });
      return true;
    }
    if (isLandmarkTile(id)) return this.claimLandmark(x, y);
    if (id === T.VANITY_TABLE) {
      if (this.openMirror && this.openMirror.x === x && this.openMirror.y === y) return true;
      if (this.openMirror) this.closeMirror();
      if (this.openChest) this.closeChest();
      this.openMirror = { x, y };
      this.emit({ type: 'mirror', open: true, x, y });
      return true;
    }
    if (id === T.LORE_TABLET) {
      const lid = this.tabletId(x, y);
      this.emit({ type: 'lore', id: lid, x, y, first: this.discovery.readLore(lid) });
      return true;
    }
    if (id === T.LOCKED_CHEST && !w.unlocked.has(w.idx(x, y))) {
      if (!this.inventory.has('golden_key', 1)) { this.block('use', 'golden', x, y); return false; }
      this.inventory.remove('golden_key', 1);
      w.unlocked.add(w.idx(x, y));
      w.keysUsed++;
      w.markModified(x, y);
      this.emit({ type: 'unlock', x, y, item: 'golden_key' });
    }
    if (this.openChest && this.openChest.x === x && this.openChest.y === y) return true;
    if (this.openChest) this.closeChest();
    this.openChest = { x, y };
    this.emit({ type: 'chest', open: true, x, y });
    return true;
  }
  closeChest(): void {
    if (!this.openChest) return;
    const { x, y } = this.openChest;
    this.openChest = null;
    this.emit({ type: 'chest', open: false, x, y });
  }
  /** 不用梳妝台了（UI 關掉衣櫥 / 走遠 / 被拆）：推關閉事件，只推一次 */
  closeMirror(): void {
    if (!this.openMirror) return;
    const { x, y } = this.openMirror;
    this.openMirror = null;
    this.emit({ type: 'mirror', open: false, x, y });
  }
  /** 開著的箱子內容（直接參照，請用下列方法修改） */
  chestSlots(): (Stack | null)[] | null {
    if (!this.openChest) return null;
    return this.world.chests.get(this.world.idx(this.openChest.x, this.openChest.y)) ?? null;
  }
  /** 把箱子第 i 格拿進背包（放不下的留在箱子） */
  takeChestSlot(i: number): boolean {
    const slots = this.chestSlots(), c = this.openChest;
    const st = slots?.[i];
    if (!slots || !c || !st) return false;
    // 世界生成時放進箱子、還沒擲過詞條的裝備（珍寶等）：第一次拿的時候擲（依箱子座標，確定性）
    if (!st.gear && gearSlot(st.item)) {
      const depth = this.depthFrac(c.x, c.y), r = new Rng(`${this.seed}:chestroll:${c.x}:${c.y}:${i}`);
      const ilvl = Math.max(baseTier(st.item), ilvlForDepth(depth));
      st.gear = rollGear(st.item, r, { rarity: rollRarity(r, 'dungeon', depth, this.stats().gear.luck, ITEMS[st.item].unique ? 2 : 0), ilvl });
    }
    const left = this.inventory.add(st.item, st.count, st.gear, st.tint);
    if (left === st.count) { this.block('mine', 'full', c.x, c.y); return false; }
    if (left > 0) st.count = left; else slots[i] = null;
    this.world.markModified(c.x, c.y);
    return true;
  }
  /** 全部拿取，回傳拿到的道具總數 */
  takeAllFromChest(): number {
    const slots = this.chestSlots();
    if (!slots) return 0;
    let moved = 0;
    for (let i = 0; i < slots.length; i++) {
      const st = slots[i];
      if (!st) continue;
      const before = st.count;
      this.takeChestSlot(i);
      moved += before - (slots[i]?.count ?? 0);
    }
    return moved;
  }
  /** 把背包第 invSlot 格整堆放進箱子（先疊到同種堆，再放空格） */
  depositToChest(invSlot: number): boolean {
    const slots = this.chestSlots(), c = this.openChest;
    const st = this.inventory.slots[invSlot];
    if (!slots || !c || !st) return false;
    if (st.gear || st.tint) {
      const k = slots.indexOf(null);
      if (k < 0) return false;
      slots[k] = st;
      this.inventory.slots[invSlot] = null;
      this.world.markModified(c.x, c.y);
      return true;
    }
    const max = ITEMS[st.item].maxStack;
    let left = st.count;
    for (const s of slots) {
      if (left <= 0) break;
      if (s && s.item === st.item && s.count < max) { const k = Math.min(left, max - s.count); s.count += k; left -= k; }
    }
    for (let i = 0; i < slots.length && left > 0; i++) {
      if (slots[i] === null) { const k = Math.min(left, max); slots[i] = { item: st.item, count: k }; left -= k; }
    }
    if (left === st.count) return false;
    if (left > 0) st.count = left; else this.inventory.slots[invSlot] = null;
    this.world.markModified(c.x, c.y);
    return true;
  }

  /** 玩家身上的動態光：空手時一點微光；拿著發光道具（火把、提燈）時照亮身邊 */
  heldLights(): PointLight[] {
    const held = this.inventory.selectedStack();
    const pt = this.playerTile();
    const v = held ? (held.item === 'torch' ? 0.85 : ITEMS[held.item].heldLight ?? 0) : 0;
    const c = held ? HELD_HUE[held.item] : undefined;
    // 夜視護符：身邊一圈柔和的微光（比火把暗、不需要拿在手上）；螢光詞條也算
    const night = Math.max(this.hasAccessory('night') ? 0.78 : 0, Math.min(1, this.stats().gear.light / 100 + this.raceMods().light * RACE_LIGHT_GLOW));
    // 空手時不再有實體光（會穿牆照出密室）；玩家身邊的輪廓微光改由 render 的 ambientReach 處理
    const out: PointLight[] = [];
    if (v > 0) out.push({ x: pt.x, y: pt.y, v, c });
    if (night > 0) out.push({ x: pt.x, y: pt.y + 1, v: night, c: NIGHT_HUE });
    if (v >= 1) out.push({ x: pt.x, y: pt.y - 1, v: 1, c });
    return out;
  }

  /** 天空光 RGB（夜深藍、黎明粉、白天白、黃昏橘；見 sky.ts） */
  skyRGB(): [number, number, number] {
    const s = this.sun(), wx = this.localWeatherState();
    const k = weatherDim(wx.kind, wx.intensity), fl = this.flash();
    const c = skyColor(this.time, s.sunrise, s.sunset, s.twilight);
    return [0, 1, 2].map((i) => c[i] * k + (1 - c[i] * k) * fl * 0.9) as [number, number, number];
  }

  /** 計算視窗（tile 座標）+ 外框的光照。 */
  computeLight(view: LightRect, extra?: readonly PointLight[]): LightMap {
    return this.lightEngine.compute(this.world, view, { sky: this.skyLevel(), skyColor: this.skyRGB(), lights: extra });
  }

  /**
   * 取出 pid（預設本地玩家；不是現有玩家 → []、不記游標）上次取過之後的事件：公開事件 + 該 pid 的私人事件（PRIVATE_EVENTS）。
   * 每個玩家各有各的游標，互不吃掉；所有玩家都取過的部分才從佇列丟掉。
   */
  drainEvents(pid: Pid = this.localPid): DelveEvent[] {
    if (!this.actors.has(pid)) return [];
    this.flushLevels();
    const ev = this.events, end = this.evBase + ev.length;
    const from = Math.max(0, (this.evRead.get(pid) ?? this.evBase) - this.evBase);
    const out: DelveEvent[] = [];
    for (let i = from; i < ev.length; i++) {
      const e = ev[i];
      if (e.pid === undefined || e.pid === pid || !PRIVATE_EVENTS.has(e.type)) out.push(e);
    }
    this.evRead.set(pid, end);
    this.trimEvents();
    return out;
  }
  /** 取出佇列裡全部的事件（不分 pid；房主分送用）：所有玩家的游標一起跳到最後 */
  drainAll(): DelveEvent[] {
    this.flushLevels();
    const out = this.events;
    this.evBase += out.length;
    this.events = [];
    this.lvScan = 0;
    for (const pid of this.evRead.keys()) this.evRead.set(pid, this.evBase);
    return out;
  }
  /** 丟掉所有玩家都取過的事件（佇列太長時，取得最慢的人漏掉最舊的） */
  private trimEvents(): void {
    const end = this.evBase + this.events.length;
    let keep = end;
    for (const pid of this.actors.keys()) keep = Math.min(keep, this.evRead.get(pid) ?? this.evBase);
    keep = Math.max(keep, end - EVENT_BACKLOG);
    const k = keep - this.evBase;
    if (k <= 0) return;
    this.events = k >= this.events.length ? [] : this.events.slice(k);
    this.evBase = keep;
    this.lvScan = Math.max(0, this.lvScan - k);
  }

  getState(): DelveState {
    const p = this.player, t = this.playerTile();
    const held = this.inventory.selectedStack();
    return {
      seed: this.seed,
      tick: this.tick,
      time: this.time,
      sky: this.skyLevel(),
      player: { x: p.x, y: p.y, vx: p.vx, vy: p.vy, onGround: p.onGround, tileX: t.x, tileY: t.y, gfxOffY: p.gfxOffY, climbing: Boolean(this.motion.climbing),
        mantle: this.motion.mantle ? { p: this.motion.mantle.t / this.motion.mantle.dur, dir: this.motion.mantle.dir, edgeX: this.motion.mantle.edgeX, edgeY: this.motion.mantle.edgeY } : null },
      spawn: { ...this.spawn },
      aim: { ...this.aim },
      selected: this.inventory.selected,
      held: held ? { ...held } : null,
      inventory: this.inventory.toJSON().slots,
      mining: this.mining ? { x: this.mining.x, y: this.mining.y, progress: Math.min(1, this.mining.elapsed / this.mining.need) } : null,
      nearWorkbench: this.nearWorkbench(),
      chest: this.openChest ? { ...this.openChest } : null,
      recall: this.recallT === null ? 0 : Math.min(1, this.recallT / RECALL_TIME),
      bed: this.bed ? { ...this.bed } : null,
      hp: Math.ceil(this.hp), maxHp: this.maxHp(), mana: Math.floor(this.mana), maxMana: this.maxMana(),
      dead: this.dead,
      respawnIn: this.dead ? Math.max(0, this.respawnT) : 0,
      defense: this.stats().defense,
      facing: this.facing,
      attack: this.attack ? { item: this.attack.item, kind: this.attack.kind, progress: Math.min(1, this.attack.t / this.attack.dur), angle: this.attack.angle, dir: this.attack.dir } : null,
      iframes: Math.max(0, this.iframes),
      equipment: this.equipment.toJSON(),
      setBonus: this.stats().setBonus,
      enemies: this.enemies.length,
      drops: this.drops.list.length,
      boss: (() => { const b = this.bossEnemy(); return b ? { kind: b.kind, hp: Math.max(0, Math.ceil(b.hp)), maxHp: b.maxHp, phase: b.phase ?? 1 } : null; })(),
      peaceful: this.peacefulMode,
      bossesDefeated: [...this.bossesDefeated].sort(),
      breath: Math.round(this.breath * 100) / 100, maxBreath: MAX_BREATH,
      burning: Math.max(0, this.burning), honey: Math.max(0, this.honeyT),
      liquid: { type: this.contact.type, frac: this.contact.frac, head: this.contact.head },
      day: dayIndexOf(this.time), season: this.season(), weather: this.localWeatherState().kind, sleep: this.sleepFade(),
      fishing: this.fishing ? { state: this.fishing.state, x: this.fishing.x, y: this.fishing.y, liquid: this.fishing.liquid } : null,
      gear: { ...this.stats().gear },
      undyingCd: this.undyingCd,
      level: (() => {
        const lp = this.levels.progress();
        return { level: lp.level, xp: this.levels.xp, into: lp.into, need: lp.need, points: this.levels.points, title: titleFor(lp.level) };
      })(),
      skillCd: { ...this.skillCd },
    };
  }

  // ── 戰鬥 ───────────────────────────────────────────────
  get peaceful(): boolean { return this.peacefulMode; }
  /** 切換和平模式：切到和平時清掉一般怪物（首領保留）與怪物的投射物 */
  set peaceful(v: boolean) {
    this.peacefulMode = v;
    if (v) {
      this.enemies = this.enemies.filter((e) => ENEMIES[e.kind].boss || ENEMIES[e.kind].minion);
      for (const p of this.projectiles.list) if (p.hostile && !this.bossEnemy()) p.life = 0;
    }
  }

  /** 手上拿的武器（快捷欄選中格） */
  heldWeapon(): { item: ItemId; def: WeaponDef } | null {
    const st = this.inventory.selectedStack();
    const w = st ? ITEMS[st.item].weapon : undefined;
    return st && w ? { item: st.item, def: w } : null;
  }
  /** 肩膀位置（px）：揮砍 / 射擊的起點 */
  shoulder(): { x: number; y: number } {
    const p = this.player;
    return { x: p.x + p.w / 2 + this.facing * 2, y: p.y + p.h - 12 };
  }
  bossEnemy(): Enemy | null { return this.enemies.find((e) => ENEMIES[e.kind].boss) ?? null; }

  /** 最近的怪物（中心距離 ≤ maxPx）；自動瞄準用 */
  nearestEnemy(maxPx: number): Enemy | null {
    const c = this.playerCenter();
    let best: Enemy | null = null, bd = maxPx * maxPx;
    for (const e of this.enemies) {
      const b = e.body, dx = b.x + b.w / 2 - c.x, dy = b.y + b.h / 2 - c.y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /** 攻擊瞄準點（px）：自動瞄準開著且附近有怪 → 最近那隻；否則游標 */
  private attackAim(): { x: number; y: number } {
    if (this.autoAim) {
      const e = this.nearestEnemy(16 * TILE_SIZE);
      if (e) return { x: e.body.x + e.body.w / 2, y: e.body.y + e.body.h / 2 };
    }
    return this.aimPx;
  }

  /** 手上武器 / 全身詞條的命中效果 */
  hitFx(): HitFx {
    const g = this.stats().gear;
    return { burn: g.burn, frost: g.frost, poison: g.poison, leech: g.leech, chain: g.chain, soul: g.soul, pen: g.pen };
  }
  private tryAttack(item: ItemId, w0: WeaponDef): void {
    if (this.attackCd > 0) return;
    const held = this.inventory.selectedStack(), gear = held?.item === item ? held.gear : undefined;
    const gs = this.stats().gear;
    // 強化 / 詞條：基礎傷害、攻速、擊退
    const w: WeaponDef = { ...w0, damage: weaponDamage(item, gear), useTime: w0.useTime / (1 + gs.atkspd / 100), knockback: w0.knockback * (1 + gs.kb / 100) };
    const fx = this.hitFx();
    const aim = this.attackAim();
    const c = this.playerCenter();
    this.facing = aim.x >= c.x ? 1 : -1;
    const sh = this.shoulder();
    const angle = Math.atan2(aim.y - sh.y, aim.x - sh.x);
    const ux = Math.cos(angle), uy = Math.sin(angle);
    const ox = sh.x + ux * 12, oy = sh.y + uy * 12;
    const st = this.stats();
    const dmg = (base: number): number => base * (st.damageMul + this.furyBonus());
    const crit = w.crit + st.crit;
    const owner = this.cur.pid;
    switch (w.kind) {
      case 'bow': {
        const ammo = this.findAmmo();
        if (!ammo) { this.block('use', 'ammo', this.aim.x, this.aim.y); this.attackCd = 0.3; return; }
        this.inventory.remove(ammo, 1);
        const ad = ITEMS[ammo].ammo!;
        const sp = w.speed ?? 500;
        this.projectiles.spawn('arrow', false, ox, oy, ux * sp, uy * sp, {
          damage: dmg(w.damage + ad.damage), knockback: w.knockback, crit, life: 3, gravity: 420, pierce: 1, flame: ad.flame, item: ammo, fx, owner,
        });
        break;
      }
      case 'throw': {
        this.inventory.takeFromSlot(this.inventory.selected, 1);
        const sp = w.speed ?? 500;
        this.projectiles.spawn('knife', false, ox, oy, ux * sp, uy * sp, { damage: dmg(w.damage), knockback: w.knockback, crit, life: 2.5, gravity: 520, pierce: 1, item, fx, owner });
        break;
      }
      case 'boomerang': {
        // 一人一把：自己的迴旋木刃還在飛就不能再丟（別人的不算）
        if (this.projectiles.list.some((p) => p.kind === 'boomerang' && !p.hostile && (p.owner ?? this.localPid) === owner)) return;
        const sp = w.speed ?? 440;
        this.projectiles.spawn('boomerang', false, ox, oy, ux * sp, uy * sp, { damage: dmg(w.damage), knockback: w.knockback, crit, life: 4, pierce: 99, item, fx, owner });
        break;
      }
      case 'staff': {
        const cost = w.mana ?? 0;
        if (this.mana < cost) { this.block('use', 'mana', this.aim.x, this.aim.y); this.attackCd = 0.3; return; }
        this.mana -= cost; this.manaDelay = 0.9;
        const sp = w.speed ?? 480;
        this.projectiles.spawn('bolt', false, ox, oy, ux * sp, uy * sp, { damage: dmg(w.damage), knockback: w.knockback, crit, life: 1.4, pierce: 1, item, fx, owner });
        break;
      }
      default:
        if (w.wave) {
          const sp = w.speed ?? 420;
          this.projectiles.spawn('wave', false, ox, oy, ux * sp, uy * sp, { damage: dmg(w.damage * 0.6), knockback: w.knockback * 0.5, crit, life: 0.55, pierce: 3, item, fx, owner });
        }
    }
    this.swingSeq++;
    this.attack = { item, kind: w.kind, t: 0, dur: w.useTime, angle, dir: this.facing, id: this.swingSeq, dmg: dmg(w.damage), kb: w.knockback, fx };
    this.attackCd = w.useTime;
    this.emit({ type: 'attack', item, kind: w.kind });
  }

  /** 背包裡第一種箭（依格子順序） */
  private findAmmo(): ItemId | null {
    for (const s of this.inventory.slots) if (s && ITEMS[s.item].ammo?.kind === 'arrow') return s.item;
    return null;
  }

  private updateAttack(dt: number): void {
    const a = this.attack;
    if (!a) return;
    a.t += dt;
    if (a.t >= a.dur) { this.attack = null; return; }
    this.facing = a.dir;
    const w = ITEMS[a.item].weapon;
    if (!w || (w.kind !== 'sword' && w.kind !== 'broadsword' && w.kind !== 'spear')) return;
    const f = a.t / a.dur;
    const st = this.stats();
    for (const e of [...this.enemies]) {
      if (e.lastSwing === a.id || !this.meleeTouches(a, w, f, e.body)) continue;
      e.lastSwing = a.id;
      const dir = e.body.x + e.body.w / 2 >= this.player.x + this.player.w / 2 ? 1 : -1;
      this.damageEnemy(e, a.dmg ?? w.damage * st.damageMul, a.kb ?? w.knockback, w.crit + st.crit, dir as 1 | -1, false, a.fx);
    }
  }

  /** 近戰判定：劍 / 大劍 = 身前一塊弧形範圍（揮擊前 85%）；矛 = 沿瞄準方向的線段（伸出時） */
  meleeTouches(a: AttackState, w: WeaponDef, f: number, box: Body): boolean {
    const p = this.player, cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    const reach = w.reach ?? 32;
    if (w.kind === 'spear') {
      if (f < 0.08 || f > 0.75) return false;
      const ext = Math.sin(Math.min(1, f / 0.45) * Math.PI * 0.5) * reach;
      const sh = this.shoulder(), ux = Math.cos(a.angle), uy = Math.sin(a.angle);
      for (let s = 8; s <= ext; s += 5) {
        const x = sh.x + ux * s, y = sh.y + uy * s;
        if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) return true;
      }
      return false;
    }
    if (f > 0.85) return false;
    const x0 = a.dir > 0 ? cx - 6 : cx - reach, x1 = a.dir > 0 ? cx + reach : cx + 6;
    const y0 = cy - reach - 4, y1 = cy + reach * 0.75;
    return box.x < x1 && box.x + box.w > x0 && box.y < y1 && box.y + box.h > y0;
  }

  /** 對怪物造成傷害（已含玩家加成的原始值）；回傳是否打中 */
  private damageEnemy(e: Enemy, raw: number, kb: number, critChance: number, dir: 1 | -1, flame = false, fx?: HitFx): boolean {
    const def = ENEMIES[e.kind];
    if (e.state === 'shatter' || e.hp <= 0) return false;
    // 擊殺歸屬：在玩家的 cur 下打中（近戰 / 技能 / 荊棘 / owner 還在的投射物）→ 記住是誰；世界段（owner 已離開的投射物）→ 沒有人
    e.lastHitBy = this.worldDepth === 0 ? this.cur.pid : undefined;
    const crit = rollCrit(critChance, this.combatRng);
    const amount = enemyDamage(raw * (crit ? 2 : 1), Math.max(0, def.defense - (fx?.pen ?? 0)));
    e.hp -= amount;
    e.flash = 0.14;
    const k = knockbackScale(kb, def.kbRes);
    if (k > 0) {
      e.body.vx = dir * k;
      if (def.ai !== 'flyer' && def.ai !== 'swooper' && def.ai !== 'shooter' && def.ai !== 'ghost') e.body.vy = Math.min(e.body.vy, -k * 0.55);
      else e.body.vy -= k * 0.2;
      e.stun = 0.25;
    }
    if (flame) e.burn = 3;
    this.emit({ type: 'hit', id: e.id, kind: e.kind, x: e.body.x + e.body.w / 2, y: e.body.y, amount, crit });
    if (fx) this.applyHitFx(e, raw, kb, dir, fx, amount);
    if (e.hp <= 0) {
      if (fx?.soul && !this.dead) this.healBy(this.maxHp() * fx.soul / 100, true);
      if (this.enemies.includes(e)) this.killEnemy(e);
    }
    return true;
  }
  /** 詞條命中效果：吸血、燃燒 / 冰凍 / 中毒、連鎖閃電 */
  private applyHitFx(e: Enemy, raw: number, kb: number, dir: 1 | -1, fx: HitFx, amount: number): void {
    const r = this.combatRng;
    if (fx.leech > 0 && !this.dead) this.healBy(Math.min(LEECH_CAP, amount * fx.leech / 100), false);
    if (fx.burn > 0 && r.next() * 100 < fx.burn) e.burn = Math.max(e.burn, 3);
    if (fx.frost > 0 && r.next() * 100 < fx.frost) e.frost = FROST_TIME;
    if (fx.poison > 0 && r.next() * 100 < fx.poison) e.poison = POISON_TIME;
    if (fx.chain > 0 && r.next() * 100 < fx.chain) {
      const b = e.body, cx = b.x + b.w / 2, cy = b.y + b.h / 2, R = CHAIN_RADIUS * TILE_SIZE;
      const near = this.enemies.filter((q) => q !== e && q.hp > 0 && q.state !== 'shatter')
        .map((q) => ({ q, d: Math.hypot(q.body.x + q.body.w / 2 - cx, q.body.y + q.body.h / 2 - cy) }))
        .filter((o) => o.d <= R).sort((p, q) => p.d - q.d).slice(0, CHAIN_MAX);
      if (!near.length) return;
      const pts = [{ x: cx, y: cy }];
      const sub: HitFx = { ...fx, chain: 0, leech: 0 };
      for (const { q } of near) {
        pts.push({ x: q.body.x + q.body.w / 2, y: q.body.y + q.body.h / 2 });
        this.damageEnemy(q, raw * CHAIN_MUL, kb * 0.3, 0, dir, false, sub);
      }
      this.emit({ type: 'chain', pts });
    }
  }
  /** 回血（show = 飄綠字） */
  private healBy(v: number, show: boolean): void {
    const before = this.hp;
    this.hp = Math.min(this.maxHp(), this.hp + v);
    const got = this.hp - before;
    if (show && got >= 1) { const p = this.player; this.emit({ type: 'heal', amount: Math.round(got), x: p.x + p.w / 2, y: p.y }); }
  }
  /** debug：直接扣血（不看防禦 / 不擊退） */
  debugDamage(id: number, amount: number): boolean {
    const e = this.enemies.find((q) => q.id === id);
    if (!e) return false;
    e.hp -= amount; e.flash = 0.14;
    if (e.state === 'shatter') e.hp = Math.max(1, e.hp);
    this.emit({ type: 'hit', id: e.id, kind: e.kind, x: e.body.x + e.body.w / 2, y: e.body.y, amount, crit: false });
    if (e.hp <= 0) this.killEnemy(e);
    return true;
  }

  /**
   * 擊殺：在最後打中牠的玩家（lastHitBy，還在遊戲裡）的 cur 下結算——kill 事件帶他的 pid（經驗給他）、掉寶看他的幸運 / 等級、
   * 首領的轉生之藥看他的首殺紀錄；燒死 / 毒死 / 掉進液體死掉（世界段）也一樣。沒人打過 / 那人已離開 → 照舊（世界段 = 本地玩家）。
   * 單機只是多包一層 withActor(本地)：RNG 呼叫與事件都不變。
   */
  private killEnemy(e: Enemy): void {
    const by = e.lastHitBy === undefined ? undefined : this.actors.get(e.lastHitBy);
    if (by && (by !== this.cur || this.worldDepth > 0)) this.withActor(by, () => this.settleKill(e));
    else this.settleKill(e);
  }
  private settleKill(e: Enemy): void {
    const def = ENEMIES[e.kind], b = e.body;
    this.enemies = this.enemies.filter((q) => q !== e);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const r = this.combatRng;
    const drop = (item: ItemId, n: number): void => {
      if (n <= 0) return;
      const v = popVelocity(r.next(), r.next());
      this.drops.spawn(item, n, cx, cy, v.vx, v.vy);
    };
    const luck = this.stats().gear.luck;
    for (const d of def.drops) if (r.next() < Math.min(1, d.chance * (1 + luck / 100))) drop(d.item, r.int(d.min, d.max + 1));
    if (def.coins[1] > 0) drop('copper_coin', r.int(def.coins[0], def.coins[1] + 1));
    this.kills[e.kind] = (this.kills[e.kind] ?? 0) + 1;
    this.emit({ type: 'kill', id: e.id, kind: e.kind, x: cx, y: cy });
    // 裝備：一般怪機率掉一件（越深等級越高）；首領必掉
    const depth = this.depthFrac(Math.floor(cx / TILE_SIZE), Math.floor(cy / TILE_SIZE));
    const chance = this.debugGearChance ?? GEAR_DROP_CHANCE * (1 + luck / 100);
    if (!def.boss && !def.minion && this.lootRng.next() < chance) {
      const ilvl = lootIlvl(ilvlForDepth(depth), this.levels.level), item = rollDropItem(this.lootRng, ilvl);
      this.spawnGearDrop(item, this.rollFor(item, 'enemy', depth, ilvl), cx, cy);
    }
    if (def.boss) {
      for (const it of BOSS_DROPS) {
        if (gearSlot(it.item)) this.spawnGearDrop(it.item, this.rollFor(it.item, 'boss', 1, 5), cx, cy);
        else drop(it.item, it.n);
      }
      for (let k = 0; k < BOSS_GEAR; k++) { const item = rollDropItem(this.lootRng, 5); this.spawnGearDrop(item, this.rollFor(item, 'boss', 1, 5), cx, cy); }
      drop(BOSS_FASHION[Math.floor(this.lootRng.next() * BOSS_FASHION.length) % BOSS_FASHION.length], 1);
      // 轉生之藥：這個角色第一次擊敗這隻首領必掉，之後 15%（levels.bosses 在這時還是擊殺前的狀態）
      if (bossRebirth(this.seed, e.kind, this.kills[e.kind] ?? 0, !this.levels.bosses.has(e.kind))) drop('rebirth_potion', 1);
      this.bossesDefeated.add(e.kind);
      this.enemies = this.enemies.filter((q) => !ENEMIES[q.kind].minion);
      for (const p of this.projectiles.list) if (p.hostile) p.life = 0;
      this.emit({ type: 'boss', phase: 'defeated', kind: e.kind });
    }
  }

  /** 玩家受傷（原始傷害，扣防禦）；srcX = 傷害來源 x（擊退方向）。回傳是否有受傷 */
  hurtPlayer(raw: number, srcX: number): boolean {
    if (this.dead || this.iframes > 0) return false;
    const amount = Math.max(1, Math.round(damageTaken(raw, this.stats().defense) * (this.buffOn('ward') ? BUFFS.ward.dmgMul : 1)));
    this.applyDamage(amount, false);
    if (this.dead) return true;
    const p = this.player;
    p.vx = (p.x + p.w / 2 >= srcX ? 1 : -1) * 230;
    p.vy = -240; p.onGround = false;
    this.motion.climbing = false; this.motion.jumpTimer = 0; this.motion.mantle = null;
    this.knockT = 0.18;
    return true;
  }
  private applyDamage(amount: number, fall: boolean, cause?: 'lava'): void {
    const p = this.player;
    this.hp -= amount;
    this.sleepReady = false;
    this.iframes = fall ? 0.4 : IFRAMES;
    this.sinceHit = 0;
    this.emit({ type: 'hurt', x: p.x + p.w / 2, y: p.y, amount, fall, ...(cause ? { cause } : {}) });
    if (this.recallT !== null) { const r = this.respawnPoint(); this.recallT = null; this.emit({ type: 'recall', phase: 'cancel', x: r.x, y: r.y }); }
    if (this.hp <= 0 && !this.tryUndying()) this.die();
  }
  /** 不滅：致命傷時以 1 點生命撐住（冷卻 = 詞條秒數）。回傳是否撐住 */
  private tryUndying(): boolean {
    const cd = this.stats().gear.undying;
    if (cd <= 0 || this.undyingCd > 0) return false;
    this.hp = 1; this.undyingCd = cd; this.iframes = Math.max(this.iframes, 1.5);
    const p = this.player;
    this.emit({ type: 'undying', x: p.x + p.w / 2, y: p.y });
    return true;
  }

  private die(): void {
    const p = this.player, cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    // 跟著的探險者停下來等：只在所有人都倒下時（還有人活著 → 繼續跟最近的活人）
    if ([...this.actors.values()].every((a) => a === this.cur || a.dead)) this.folk.playerDied();
    this.dead = true; this.hp = 0; this.respawnT = RESPAWN_TIME;
    this.sleepReady = false;
    this.leaveBoat();
    this.dashT = 0; this.slamming = false;
    // 等級：失去本級進度的一小部分（不會掉級）
    const lost = this.levels.die();
    if (lost > 0) this.emit({ type: 'xploss', amount: lost });
    this.burning = 0; this.honeyT = 0; this.breath = MAX_BREATH; this.drownT = 0;
    this.mining = null; this.attack = null; this.recallT = null; this.miningHeld = false;
    this.closeChest();
    // 身上的錢掉一半在死亡地點
    for (const coin of ['copper_coin', 'silver_coin'] as const) {
      const n = Math.floor(this.inventory.count(coin) * DEATH_COIN_LOSS);
      if (n > 0 && this.inventory.remove(coin, n)) {
        const v = popVelocity(this.combatRng.next(), this.combatRng.next());
        this.drops.spawn(coin, n, cx, cy, v.vx, v.vy, 1.2);
      }
    }
    p.vx = 0; p.vy = 0;
    this.emit({ type: 'death', x: cx, y: cy });
  }
  private updateDeath(dt: number): void {
    this.respawnT -= dt;
    if (this.respawnT > 0) return;
    const r = this.respawnPoint();
    this.dead = false;
    this.teleport(r.x, r.y);
    this.hp = this.maxHp(); this.mana = this.maxMana();
    this.iframes = 2; this.sinceHit = 99;
    this.spawnT = Math.max(this.spawnT, 4);
    this.spawnCalm = 0;
    this.emit({ type: 'respawn', x: r.x, y: r.y });
  }

  /** 摔落傷害：記住騰空時的最高點，落地時算掉了幾格 */
  private updateFall(): void {
    const p = this.player;
    if (this.motion.climbing || this.motion.mantle || this.contact.frac > 0) { this.fallPeak = null; return; }
    if (!p.onGround) { this.fallPeak = this.fallPeak === null ? p.y : Math.min(this.fallPeak, p.y); return; }
    if (this.fallPeak !== null) {
      const tiles = (p.y - this.fallPeak) / TILE_SIZE;
      this.fallPeak = null;
      if (this.hasAccessory('nofall')) return;
      const sk = this.levels.totals();
      const dmg = Math.round(fallDamage(tiles, SAFE_FALL_TILES + (this.hasAccessory('jump') ? 8 : 0) + sk.fallSafe + this.raceMods().safeFall) * (1 - sk.fallRed / 100));
      if (dmg > 0) this.applyDamage(dmg, true);
    }
  }
  private updateVitals(dt: number): void {
    if (this.iframes > 0) this.iframes -= dt;
    if (this.knockT > 0) this.knockT -= dt;
    if (this.potionCd > 0) this.potionCd -= dt;
    if (this.undyingCd > 0) this.undyingCd = Math.max(0, this.undyingCd - dt);
    this.sinceHit += dt;
    const max = this.maxHp();
    const st = this.stats();
    const regen = (this.burning > 0 ? 0 : regenRate(this.sinceHit, st.regenMul) + st.gear.regen) + (this.honeyT > 0 ? HONEY_REGEN : 0)
      + (this.calm() ? CALM_REGEN * (this.healerHome() ? 2 : 1) : 0) + (this.buffOn('bless') ? BUFFS.bless.regen : 0);
    for (const k of Object.keys(this.buffs) as BuffKind[]) {
      if (this.time >= (this.buffs[k] ?? 0)) { delete this.buffs[k]; this.emit({ type: 'buff', kind: k, on: false }); }
    }
    if (this.hp < max) this.hp = Math.min(max, this.hp + regen * dt);
    else if (this.hp > max) this.hp = max;
    if (this.manaDelay > 0) this.manaDelay -= dt;
    else if (this.mana < this.maxMana()) this.mana = Math.min(this.maxMana(), this.mana + MANA_REGEN * dt);
  }

  // ── 液體 ───────────────────────────────────────────────
  /** 液體對玩家的效果：濺水、呼吸 / 溺水、熔岩（受傷 + 彈起 + 著火）、進水熄火、蜂蜜回血 */
  private updateLiquid(dt: number): void {
    const c = this.contact, p = this.player;
    const wetType = c.frac > 0 ? c.type : LIQ.NONE;
    if (wetType !== this.wasWet) {
      const entering = wetType !== LIQ.NONE;
      if (entering ? Math.abs(p.vy) > 60 : p.vy < -100) {
        const surf = entering ? p.y + p.h - c.frac * p.h : p.y + p.h;
        this.emit({ type: 'splash', x: p.x + p.w / 2, y: surf, liquid: entering ? wetType : this.wasWet, big: Math.abs(p.vy) > 250 });
      }
      this.wasWet = wetType;
    }
    // 呼吸：頭在水 / 蜂蜜下就消耗；沒氣了開始溺水（船上不扣）
    if (c.head && !this.boating && (c.type === LIQ.WATER || c.type === LIQ.HONEY)) {
      const before = Math.ceil(this.breath);
      this.breath = Math.max(0, this.breath - dt / (BREATH_STEP * (1 + this.levels.totals().breath / 100)));
      const now = Math.ceil(this.breath);
      if (now < before) this.emit({ type: 'bubble', left: now });
      if (this.breath <= 0) {
        this.drownT -= dt;
        if (this.drownT <= 0) { this.drownT = DROWN_EVERY; this.tickDamage(DROWN_DMG, 'drown'); if (this.dead) return; }
      }
    } else {
      this.drownT = 0;
      this.breath = Math.min(MAX_BREATH, this.breath + BREATH_REFILL * dt);
    }
    // 熔岩：受傷 + 往上彈 + 著火（熔殼護符全免）
    const ward = this.hasAccessory('lavaward');
    if (c.type === LIQ.LAVA && c.frac > 0 && !ward) {
      this.burning = BURN_TIME;
      if (this.iframes <= 0) {
        this.applyDamage(Math.max(1, Math.round(damageTaken(LAVA_DMG, this.stats().defense) * this.raceMods().lavaMul)), false, 'lava');
        if (this.dead) return;
        p.vy = Math.min(p.vy, -280); p.onGround = false;
        this.motion.jumpTimer = 0; this.motion.climbing = false; this.motion.mantle = null;
      }
    }
    if (ward || (c.type === LIQ.WATER && c.frac > 0.25)) this.burning = 0;
    if (this.burning > 0) {
      this.burning -= dt;
      this.burnTick -= dt;
      if (this.burnTick <= 0) { this.burnTick = 0.5; this.tickDamage(Math.max(1, Math.round(BURN_DMG * this.raceMods().burnMul)), 'burn'); if (this.dead) return; }
    } else { this.burning = 0; this.burnTick = 0; }
    // 蜂蜜：泡過之後一段時間多回血
    if (c.type === LIQ.HONEY && c.frac > 0) this.honeyT = HONEY_TIME;
    else if (this.honeyT > 0) this.honeyT = Math.max(0, this.honeyT - dt);
  }

  /** 持續傷害（溺水 / 燃燒）：不看防禦、不給無敵時間、不擊退 */
  private tickDamage(amount: number, cause: 'drown' | 'burn'): void {
    const p = this.player;
    this.hp -= amount;
    this.sleepReady = false;
    this.sinceHit = 0;
    this.emit({ type: 'hurt', x: p.x + p.w / 2, y: p.y, amount, fall: false, cause });
    if (this.hp <= 0 && !this.tryUndying()) this.die();
  }

  /**
   * 水桶 / 海綿（按住會隔 LIQUID_TOOL_CD 秒重複）。
   *   scoop：空桶從瞄準格（不夠再從左右同種格）舀滿一桶 → 換成對應的液體桶（要至少半桶；半桶到一整桶都算一桶）。
   *   pour：把一整桶（255）倒進瞄準格（空格 / 同種）；倒在別種液體上直接反應（水 ↔ 熔岩 → 黑曜石）。
   *   sponge：吸掉瞄準格與上下左右的水 / 蜂蜜（熔岩吸不了）。
   */
  private useLiquidTool(use: 'scoop' | 'pour' | 'sponge', x: number, y: number): boolean {
    const w = this.world, st = this.inventory.selectedStack(), sel = this.inventory.selected;
    if (!st || !w.inBounds(x, y)) return false;
    if (!this.canReach(x, y)) { this.block('use', 'reach', x, y); return false; }
    const pt = this.playerTile();
    if (use === 'scoop') {
      const t = w.getLiquidType(x, y);
      if (t === LIQ.NONE) return false;
      // 至少要有半桶（瞄準格 + 左右同種格）才舀得起來：避免從薄膜無中生有
      let avail = 0;
      for (const dx of [0, -1, 1, -2, 2]) if (w.getLiquidType(x + dx, y) === t) avail += w.getLiquid(x + dx, y);
      if (avail < SCOOP_MIN) return false;
      let got = 0;
      for (const dx of [0, -1, 1, -2, 2]) {
        if (got >= LIQ_MAX) break;
        if (w.getLiquidType(x + dx, y) !== t) continue;
        const r = this.liquids.take(x + dx, y, LIQ_MAX - got);
        if (r) got += r.amount;
      }
      this.inventory.takeFromSlot(sel, 1);
      const full: ItemId = t === LIQ.LAVA ? 'lava_bucket' : t === LIQ.HONEY ? 'honey_bucket' : 'water_bucket';
      const left = this.inventory.add(full, 1);
      if (left > 0) this.dropAtTile(full, left, pt.x, pt.y);
      this.emit({ type: 'liquidtool', action: 'scoop', liquid: t, x, y });
      return true;
    }
    if (use === 'pour') {
      const t = ITEMS[st.item].liquid ?? LIQ.WATER;
      if (!this.liquids.pour(x, y, t, LIQ_MAX)) { this.block('place', this.tileOverlapsPlayer(x, y) ? 'body' : 'occupied', x, y); return false; }
      this.inventory.takeFromSlot(sel, 1);
      const left = this.inventory.add('bucket', 1);
      if (left > 0) this.dropAtTile('bucket', left, pt.x, pt.y);
      this.emit({ type: 'liquidtool', action: 'pour', liquid: t, x, y });
      return true;
    }
    let got = 0, kind: number = LIQ.NONE;
    for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const t = w.getLiquidType(x + dx, y + dy);
      if (t !== LIQ.WATER && t !== LIQ.HONEY) continue;
      const r = this.liquids.take(x + dx, y + dy, LIQ_MAX);
      if (r) { got += r.amount; kind = t; }
    }
    if (!got) return false;
    this.emit({ type: 'liquidtool', action: 'sponge', liquid: kind, x, y });
    return true;
  }

  /** 怪物碰到液體：火系碰水被澆熄（重傷）、一般怪碰熔岩受傷 + 燃燒。回傳是否因此死掉 */
  private enemyLiquid(e: Enemy, dt: number): boolean {
    const def = ENEMIES[e.kind], b = e.body;
    if (def.boss) return false;
    const c = liquidContact(this.world, b);
    let dmg = 0;
    if (c.frac > 0 && c.type === LIQ.WATER && def.fire && c.frac >= 0.3) dmg = 25;
    else if (c.frac > 0 && c.type === LIQ.LAVA && !def.fire) { dmg = 30; e.burn = Math.max(e.burn, 3); }
    if (!dmg) { e.wetT = 0; return false; }
    e.wetT -= dt;
    if (e.wetT > 0) return false;
    e.wetT = def.fire ? 0.25 : 0.5;
    e.hp -= dmg; e.flash = 0.1;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    this.emit({ type: 'hit', id: e.id, kind: e.kind, x: cx, y: b.y, amount: dmg, crit: false });
    if (def.fire) this.emit({ type: 'liquid', kind: 'steam', x: Math.floor(cx / TILE_SIZE), y: Math.floor(cy / TILE_SIZE) });
    if (e.hp <= 0) { this.killEnemy(e); return true; }
    return false;
  }

  /** 會發光的怪物（螢光水母 / 首領）的點光源（tile 座標） */
  enemyLights(): PointLight[] {
    const out: PointLight[] = [];
    for (const e of this.enemies) {
      const def = ENEMIES[e.kind], g = def.glow;
      if (g) out.push({ x: (e.body.x + e.body.w / 2) / TILE_SIZE, y: (e.body.y + e.body.h / 2) / TILE_SIZE, v: g, c: def.glowHue });
    }
    return out;
  }

  /** 發光投射物（火球 / 餘燼 / 火焰箭 / 法術 / 光刃）的點光源（tile 座標） */
  projectileLights(): PointLight[] {
    const out: PointLight[] = [];
    for (const p of this.projectiles.list) {
      const hue = p.kind === 'fireball' || p.kind === 'ember' || p.flame ? FIRE_HUE : p.kind === 'bolt' ? BOLT_HUE : p.kind === 'wave' ? WAVE_HUE : null;
      if (!hue) continue;
      out.push({ x: (p.body.x + p.body.w / 2) / TILE_SIZE, y: (p.body.y + p.body.h / 2) / TILE_SIZE, v: p.kind === 'fireball' ? 0.7 : 0.5, c: hue });
    }
    return out;
  }

  /** 手持消耗品按「使用」 */
  private consume(use: NonNullable<ItemDef['use']>): void {
    const st = this.inventory.selectedStack();
    if (!st) return;
    const { x, y } = this.aim, p = this.player;
    if (use === 'eat') { this.eat(st.item); return; }
    if (use === 'crate') { this.openCrate(st.item); return; }
    if (use === 'life') {
      if (this.baseMaxHp >= MAX_HP_CAP) { this.block('use', 'maxlife', x, y); return; }
      this.inventory.takeFromSlot(this.inventory.selected, 1);
      this.baseMaxHp = Math.min(MAX_HP_CAP, this.baseMaxHp + LIFE_CORE_HP);
      this.hp = Math.min(this.maxHp(), this.hp + LIFE_CORE_HP);
      this.emit({ type: 'lifeup', maxHp: this.maxHp() });
    } else if (use === 'rebirth') {
      this.emit({ type: 'rebirth' }); // 不在這裡消耗：選了別的種族按確定才扣（rebirth()）
    } else if (use === 'heal') {
      if (this.potionCd > 0 || this.hp >= this.maxHp()) { this.block('use', 'potion', x, y); return; }
      this.inventory.takeFromSlot(this.inventory.selected, 1);
      const before = this.hp;
      this.hp = Math.min(this.maxHp(), this.hp + POTION_HEAL);
      this.potionCd = POTION_COOLDOWN;
      this.emit({ type: 'heal', amount: Math.round(this.hp - before), x: p.x + p.w / 2, y: p.y });
    } else if (use === 'summon') {
      if (!this.canSummon()) { this.block('use', 'summon', x, y); return; }
      this.inventory.takeFromSlot(this.inventory.selected, 1);
      this.summonBoss();
    }
  }
  /** 能不能召喚首領：場上沒有首領，而且是夜晚或在洞穴層以下 */
  canSummon(): boolean {
    if (this.bossEnemy()) return false;
    const f = this.feetTile();
    const deep = this.world.layersAt(f.x).deep;
    return this.isNight() || f.y >= deep;
  }
  /** 召喚燈脈守望者（在玩家正上方畫面外） */
  summonBoss(): Enemy | null {
    if (this.bossEnemy()) return null;
    const c = this.playerCenter();
    const e = this.addEnemy('lantern_warden', c.x, c.y - 16 * TILE_SIZE);
    this.emit({ type: 'boss', phase: 'spawn', kind: e.kind });
    return e;
  }
  /** 在 (cx px, bottom px) 生一隻怪 */
  private addEnemy(kind: EnemyKind, cx: number, bottom: number): Enemy {
    const e = makeEnemy(this.nextEnemyId++, kind, cx, bottom);
    e.dir = cx < this.nearestView(this.views(), cx, bottom).cx ? 1 : -1;
    this.enemies.push(e);
    return e;
  }
  /** debug / e2e：在 tile (tx, ty)（腳底）生一隻怪 */
  spawnEnemy(kind: EnemyKind, tx: number, ty: number): Enemy {
    return this.addEnemy(kind, (tx + 0.5) * TILE_SIZE, (ty + 1) * TILE_SIZE);
  }

  // ── 實體更新（生成 / AI / 投射物 / 掉落物） ─────────────
  /**
   * 世界的實體（看所有玩家，spec §5.2）：生成輪流以活著的玩家為中心；每隻怪鎖定最近的活著的玩家（全員死亡 = 最近的屍體）；
   * 任一玩家在 ACTIVE 內就活躍、離所有玩家都超過 DESPAWN 才消失；接觸傷害 / 敵方投射物打到誰就在誰的 cur 下 hurtPlayer；
   * 玩家投射物在 owner 的 cur 下結算；掉落物給最近的、收得下的活人。
   * 單機（一個 actor）時每個 RNG 呼叫 / 受傷 / 撿取的順序都和以前一樣（actor.golden.test）。
   */
  private updateEntities(dt: number): void {
    const vs = this.views();
    const S = TILE_SIZE;
    // 生成：有人活著才生
    if (!this.peacefulMode && vs.some((v) => !v.dead)) {
      this.spawnT -= dt;
      this.spawnCalm += dt;
      if (this.spawnT <= 0) { this.spawnT = spawnInterval(this.spawnCalm); this.trySpawn(vs); }
    }
    // 怪物：ctx 的玩家欄位每隻怪換成牠的目標
    const night = this.isNight();
    const ctx: AiCtx = {
      q: this.env, px: 0, py: 0, playerDead: false, rng: this.combatRng, night, playerWet: false,
      shoot: (kind, x, y, vx, vy, damage, noclip) => {
        this.projectiles.spawn(kind, true, x, y, vx, vy, { damage, knockback: 160, life: kind === 'stinger' ? 2.2 : 3, solidHit: !noclip });
        this.emit({ type: 'shot', kind, hostile: true });
      },
      teleportSpot: (e) => this.impSpot(e, ctx.px, ctx.py),
      summon: (kind, x, y) => { if (this.enemies.filter((q) => q.kind === kind).length < 6) this.addEnemy(kind, x, y); },
      bossEvent: (phase) => this.emit({ type: 'boss', phase, kind: 'lantern_warden' }),
    };
    for (const e of [...this.enemies]) {
      const def = ENEMIES[e.kind], b = e.body;
      const ex = b.x + b.w / 2, ey = b.y + b.h / 2;
      // 死掉的玩家也算（單機死亡時怪物照樣在屍體附近活動、不消失）
      let keep = false, active = false;
      for (const v of vs) {
        const dx = Math.abs(ex - v.cx) / S, dy = Math.abs(ey - v.cy) / S;
        if (!(dx > DESPAWN.x || dy > DESPAWN.y || this.dayDespawn(e, dx, dy))) keep = true;
        if (!(dx > ACTIVE.x || dy > ACTIVE.y)) active = true;
      }
      if (!def.boss && !def.minion && !keep) { this.removeEnemy(e); continue; }
      if (!def.boss && !active) continue;
      const t = this.nearestView(vs, ex, ey);
      ctx.px = t.cx; ctx.py = t.cy; ctx.playerDead = t.dead; ctx.playerWet = t.wet;
      // 冰凍：整隻怪的動作（移動 / 冷卻 / 動畫）變慢
      if (e.frost > 0) e.frost = Math.max(0, e.frost - dt);
      if (!stepEnemy(e, ctx, e.frost > 0 ? dt * FROST_SLOW : dt)) { this.removeEnemy(e); continue; }
      if (this.enemyLiquid(e, dt)) continue;
      if (e.burn > 0) {
        e.burn -= dt; e.burnTick -= dt;
        if (e.burnTick <= 0) {
          e.burnTick = 0.5;
          e.hp -= 2; e.flash = 0.06;
          this.emit({ type: 'hit', id: e.id, kind: e.kind, x: b.x + b.w / 2, y: b.y, amount: 2, crit: false });
          if (e.hp <= 0) { this.killEnemy(e); continue; }
        }
      }
      if (e.poison > 0) {
        e.poison -= dt; e.poisonTick -= dt;
        if (e.poisonTick <= 0) {
          e.poisonTick = 0.5;
          const pd = Math.max(1, Math.min(6, Math.round(e.maxHp * 0.015)));
          e.hp -= pd; e.flash = 0.06;
          this.emit({ type: 'hit', id: e.id, kind: e.kind, x: b.x + b.w / 2, y: b.y, amount: pd, crit: false });
          if (e.hp <= 0) { this.killEnemy(e); continue; }
        }
      }
      if (e.state === 'leave') continue;
      // 接觸傷害：依序檢查每個活著的玩家；荊棘反傷算被碰到的那個人的（受傷 / 反傷都在他的 cur 下）
      const mul = def.boss && e.phase === 2 ? 1.25 : 1;
      for (const v of vs) {
        const a = v.a, p = a.player;
        if (a.dead || !overlaps(b, p)) continue;
        const killed = this.withActor(a, () => {
          const thorns = this.stats().gear.thorns;
          if (this.hurtPlayer(def.damage * mul, b.x + b.w / 2) && thorns > 0 && e.hp > 0) {
            this.damageEnemy(e, thorns, 80, 0, b.x + b.w / 2 >= p.x + p.w / 2 ? 1 : -1);
            if (e.hp <= 0) return true;
          }
          return false;
        });
        if (killed) break;
      }
    }
    // 投射物：迴旋木刃回到 owner（沒有 owner / owner 走了 → 本地玩家）
    const local = vs.find((v) => v.a === this.local)!;
    const ownerOf = (pr: Projectile): PlayerView => (pr.owner === undefined ? undefined : vs.find((v) => v.pid === pr.owner)) ?? local;
    for (const w of this.projectiles.step(this.world, dt, (pr) => { const o = ownerOf(pr); return { x: o.cx, y: o.cy }; })) {
      this.emit({ type: 'impact', kind: w.kind, x: w.body.x + w.body.w / 2, y: w.body.y + w.body.h / 2 });
    }
    for (const pr of this.projectiles.list) {
      if (pr.life <= 0 || pr.pierce < 1 || pr.stuck) continue;
      if (pr.hostile) {
        // 敵方投射物：打到誰就在誰的 cur 下受傷（hurt 事件帶他的 pid）
        for (const v of vs) {
          const a = v.a;
          if (!a.dead && overlaps(pr.body, a.player) && this.withActor(a, () => this.hurtPlayer(pr.damage, pr.body.x + pr.body.w / 2))) { pr.life = 0; break; }
        }
        continue;
      }
      const owner = ownerOf(pr);
      if (pr.kind === 'boomerang' && pr.returning && overlaps(pr.body, owner.a.player)) { pr.life = 0; continue; }
      const hitEnemies = (): void => {
        for (const e of this.enemies) {
          if (pr.hit.has(e.id) || !overlaps(pr.body, e.body)) continue;
          if (!this.damageEnemy(e, pr.damage, pr.knockback, pr.crit, pr.body.vx >= 0 ? 1 : -1, pr.flame, pr.fx)) continue;
          pr.hit.add(e.id);
          pr.pierce--;
          if (pr.kind === 'boomerang') pr.returning = true;
          if (pr.pierce < 1) { pr.life = 0; break; }
        }
      };
      // 命中 / 擊殺在 owner 的 cur 下結算：事件帶他的 pid、吸血 / 噬魂回到他身上、掉寶看他的幸運（owner 已離開 → 世界段，記給本地）
      if (owner.pid === pr.owner) this.withActor(owner.a, hitEnemies);
      else hitEnemies();
    }
    // 掉落物：每個掉落物給最近的、活著、收得下的玩家
    const pickers: Picker[] = vs.map(({ a }) => {
      const inv = a.inventory;
      return {
        body: a.player, magnetPx: this.withActor(a, () => this.magnetRadius()) * S, canPickup: !a.dead,
        room: (item, n) => (inv.canAdd(item, n) ? n : inv.canAdd(item, 1) ? 1 : 0),
        take: (item, n, gear, tint) => n - inv.add(item, n, gear, tint),
      };
    });
    const got = this.drops.step(this.env, { pickers, activePx: ACTIVE.x * S }, dt);
    for (const [item, n, gear, , k] of got) this.withActor(vs[k].a, () => this.emit(gear ? { type: 'pickup', item, n, rarity: gear.rarity } : { type: 'pickup', item, n }));
  }
  private removeEnemy(e: Enemy): void { this.enemies = this.enemies.filter((q) => q !== e); }
  /** 夜行怪在白天、離開畫面就消失 */
  private dayDespawn(e: Enemy, dx: number, dy: number): boolean {
    if (e.kind !== 'night_walker' && e.kind !== 'dusk_owl') return false;
    return !this.isNight() && (dx > this.viewHalf.w + 2 || dy > this.viewHalf.h + 2);
  }

  /**
   * 生成一次：每次輪流以一個活著的玩家為中心（單機 = 永遠是自己，spawnRng 的呼叫和以前一樣）。
   * 床的安全範圍、「生成點要在畫面外」對每個玩家都檢查（每個玩家都當成一個用同一個 viewHalf 的觀看者）。
   */
  private trySpawn(vs: readonly PlayerView[]): void {
    const w = this.world, r = this.spawnRng, S = TILE_SIZE;
    if (this.enemies.length >= MAX_ENEMIES) return;
    const alive = vs.filter((v) => !v.dead);
    if (!alive.length) return;
    const c = alive[this.spawnTurn++ % alive.length];
    const pt = { x: Math.floor(c.cx / S), y: Math.floor(c.cy / S) };
    const tileOf = (v: PlayerView): { x: number; y: number } => ({ x: Math.floor(v.cx / S), y: Math.floor(v.cy / S) });
    const vw = this.viewHalf.w + 2, vh = this.viewHalf.h + 2;
    let dx: number, dy: number;
    if (r.next() < 0.7) {
      dx = (r.next() < 0.5 ? -1 : 1) * Math.round(vw + r.next() * Math.max(1, SPAWN_MAX.x - vw));
      dy = Math.round((r.next() * 2 - 1) * Math.min(SPAWN_MAX.y, vh * 1.2));
    } else {
      dx = Math.round((r.next() * 2 - 1) * SPAWN_MAX.x);
      dy = (r.next() < 0.5 ? -1 : 1) * Math.round(vh + r.next() * Math.max(1, SPAWN_MAX.y - vh));
    }
    const tx = pt.x + dx, ty = pt.y + dy;
    if (!w.inBounds(tx, ty)) return;
    const hab = habitatAt({ world: w, night: this.isNight() }, tx, ty);
    hab.season = this.season();
    hab.weather = this.withActor(c.a, () => this.localWeatherState()).kind;
    let near = 0;
    for (const e of this.enemies) {
      const b = e.body;
      if (Math.abs(b.x / S - pt.x) < ACTIVE.x && Math.abs(b.y / S - pt.y) < ACTIVE.y && !ENEMIES[e.kind].minion) near++;
    }
    const pressure: SpawnPressure = { firstNight: isFirstNight(this.time), nearSpawn: Math.abs(tx - this.spawn.x) < NEAR_SPAWN_TILES };
    if (near >= spawnCap(hab, pressure) || r.next() >= spawnChance(hab, pressure)) return;
    if (vs.some(({ a }) => a.bed && Math.hypot(tx - a.bed.x, ty - a.bed.y) < BED_SAFE)) return;
    if (inHouse(w, tx, ty) || homeNear(w, tx, ty)) return;
    if (this.settle.cores.length && this.settle.hasPerk(tx, ty, w, 'ward')) return;
    const entry = pickEntry(spawnTable(hab), r);
    if (!entry) return;
    const spot = findSpot(w, entry.kind, tx, ty);
    if (!spot) return;
    // 生成點仍要在每個人的畫面外
    if (vs.some((v) => { const t = tileOf(v); return Math.abs(spot.x / S - t.x) <= vw && Math.abs(spot.y / S - t.y) <= vh; })) return;
    const n = entry.group ? r.int(entry.group[0], entry.group[1] + 1) : 1;
    for (let k = 0; k < n && this.enemies.length < MAX_ENEMIES; k++) this.addEnemy(entry.kind, spot.x + k * 10, spot.y - k * 6);
  }

  /** 燼角魔瞬移點：牠的目標玩家（中心 px = (px, py)）左右 4–9 格、站得住的地方 */
  private impSpot(e: Enemy, px: number, py: number): { x: number; y: number } | null {
    const pt = { x: Math.floor(px / TILE_SIZE), y: Math.floor(py / TILE_SIZE) }, r = this.combatRng;
    for (let k = 0; k < 8; k++) {
      const tx = pt.x + (r.next() < 0.5 ? -1 : 1) * r.int(4, 10), ty = pt.y + r.int(-3, 4);
      const s = findSpot(this.world, e.kind, tx, ty);
      if (s) return s;
    }
    return null;
  }

  // ── 釣魚 ─────────────────────────────────────────────
  /** 手上的釣竿 */
  heldRod(): ItemId | null {
    const st = this.inventory.selectedStack();
    return st && ITEMS[st.item].rod ? st.item : null;
  }
  /** 背包裡第一種魚餌（依格子順序） */
  private findBait(): ItemId | null {
    for (const s of this.inventory.slots) if (s && ITEMS[s.item].bait) return s.item;
    return null;
  }
  /** 現在的時段（黎明 / 白天 / 黃昏 / 夜晚） */
  timeSlot(): TimeSlot { return timeSlot(this.date().frac, this.sun()); }
  /** 拋竿 / 收竿 / 上鉤時拉起來 */
  private fishAction(): void {
    const f = this.fishing;
    if (f) {
      if (f.state === 'bite') this.catchFish();
      else { this.fishing = null; this.emit({ type: 'fish', phase: 'reel', x: f.x, y: f.y }); }
      return;
    }
    const rod = this.heldRod();
    if (!rod) return;
    const bait = this.findBait();
    if (!bait) { this.block('use', 'bait', this.aim.x, this.aim.y); return; }
    const c = this.playerCenter(), aim = this.aimPx;
    this.facing = aim.x >= c.x ? 1 : -1;
    const ox = c.x + this.facing * 14, oy = this.player.y + 6;
    const dx = aim.x - ox, dy = aim.y - oy, d = Math.max(1, Math.hypot(dx, dy));
    const sp = Math.min(CAST_SPEED_MAX, 140 + d * 1.6);
    const wx = this.localWeatherState().kind;
    this.fishing = {
      state: 'flying', x: ox, y: oy, vx: (dx / d) * sp, vy: (dy / d) * sp - 150, t: 0, wait: 0, window: 0, liquid: LIQ.NONE,
      rod, bait, power: fishingPower(rod, bait, wx, this.timeSlot()) + this.levels.totals().fishPower, forced: null,
    };
    this.emit({ type: 'fish', phase: 'cast', x: ox, y: oy });
  }
  /** 浮標每刻：飛行（拋物線、撞牆卡住、落水）→ 漂浮（等上鉤）→ 上鉤（判定窗） */
  private updateFishing(dt: number): void {
    const f = this.fishing;
    if (!f) return;
    const w = this.world, S = TILE_SIZE;
    const end = (phase: 'reel' | 'snag' | 'burn' | 'snap'): void => { this.fishing = null; this.emit({ type: 'fish', phase, x: f.x, y: f.y }); };
    if (this.heldRod() !== f.rod || this.dead || this.sleepT !== null) { end('reel'); return; }
    const c = this.playerCenter();
    if (Math.hypot(f.x - c.x, f.y - c.y) > LINE_MAX_TILES * S) { end('snap'); return; }
    if (f.state === 'flying') {
      f.t += dt;
      f.vy = Math.min(600, f.vy + BOBBER_GRAVITY * dt);
      const steps = Math.max(1, Math.ceil(((Math.abs(f.vx) + Math.abs(f.vy)) * dt) / 4));
      for (let k = 0; k < steps; k++) {
        f.x += (f.vx * dt) / steps; f.y += (f.vy * dt) / steps;
        const tx = Math.floor(f.x / S), ty = Math.floor(f.y / S);
        if (ty >= w.height || tx < w.xMin || tx >= w.xMax) { end('snag'); return; }
        if (ty < 0) continue;
        if (w.isSolid(tx, ty)) { end('snag'); return; }
        const a = w.getLiquid(tx, ty);
        if (a > 24) {
          const t = w.getLiquidType(tx, ty);
          if (!canFishIn(t, Boolean(ITEMS[f.rod].rod?.lava))) { end('burn'); return; }
          f.state = 'floating'; f.liquid = t; f.vx = 0; f.vy = 0; f.t = 0;
          f.wait = biteDelay(f.power, this.fishRng.next());
          this.floatBobber(f);
          this.emit({ type: 'fish', phase: 'land', x: f.x, y: f.y, liquid: t });
          return;
        }
      }
      if (f.t > 5) end('snag');
      return;
    }
    // 漂浮 / 上鉤：液面沒了 → 又開始往下掉
    if (!this.floatBobber(f)) { f.state = 'flying'; f.t = 0; return; }
    f.t += dt;
    if (f.state === 'floating') {
      if (f.t >= f.wait) {
        f.state = 'bite'; f.t = 0; f.window = biteWindow(f.power);
        this.emit({ type: 'fish', phase: 'bite', x: f.x, y: f.y, liquid: f.liquid });
      }
    } else if (f.t > f.window) {
      f.state = 'floating'; f.t = 0; f.forced = null;
      f.wait = biteDelay(f.power, this.fishRng.next());
      this.emit({ type: 'fish', phase: 'escape', x: f.x, y: f.y });
    }
  }
  /** 浮標貼在所在那欄的液面上（往上找到液面那格）；那欄已經沒液體 → false */
  private floatBobber(f: FishingState): boolean {
    const w = this.world, S = TILE_SIZE;
    const tx = Math.floor(f.x / S);
    let ty = Math.floor(f.y / S);
    if (w.getLiquid(tx, ty) === 0 && w.getLiquid(tx, ty + 1) > 0) ty++;
    if (w.getLiquid(tx, ty) === 0 || w.getLiquidType(tx, ty) !== f.liquid) return false;
    while (ty > 0 && w.getLiquid(tx, ty - 1) > 0 && w.getLiquidType(tx, ty - 1) === f.liquid) ty--;
    const a = w.getLiquid(tx, ty);
    f.y = (ty + 1) * S - (a / 255) * S + 1;
    return true;
  }
  /** 浮標所在水域的格數（同種液體的 4 連通，數到 POOL_COUNT_MAX） */
  private poolSize(tx: number, ty: number, type: number): number {
    const w = this.world;
    const seen = new Set<number>([w.idx(tx, ty)]);
    const qx = [tx], qy = [ty];
    for (let k = 0; k < qx.length && seen.size < POOL_COUNT_MAX; k++) {
      const x = qx[k], y = qy[k];
      for (let d = 0; d < 4; d++) {
        const nx = d === 0 ? x - 1 : d === 1 ? x + 1 : x, ny = d === 2 ? y - 1 : d === 3 ? y + 1 : y;
        if (!w.getLiquid(nx, ny) || w.getLiquidType(nx, ny) !== type) continue;
        const j = w.idx(nx, ny);
        if (seen.has(j)) continue;
        seen.add(j); qx.push(nx); qy.push(ny);
      }
    }
    return seen.size;
  }
  /** 浮標所在的深度帶 */
  private depthZone(tx: number, ty: number): DepthZone {
    const L = this.world.layersAt(tx);
    return ty < L.rock ? 'surface' : ty < L.deep ? 'underground' : ty < L.molten ? 'cavern' : 'molten';
  }
  private catchFish(): void {
    const f = this.fishing;
    if (!f) return;
    const S = TILE_SIZE, tx = Math.floor(f.x / S), ty = Math.floor(f.y / S);
    const item = f.forced ?? rollCatch({
      liquid: f.liquid, biome: this.world.biomeAt(tx), zone: this.depthZone(tx, ty), season: this.season(),
      weather: this.localWeatherState().kind, time: this.timeSlot(), power: f.power, pool: this.poolSize(tx, ty, f.liquid),
      lavaRod: Boolean(ITEMS[f.rod].rod?.lava),
    }, this.fishRng.next()) ?? 'soggy_boot';
    this.fishing = null;
    this.inventory.remove(f.bait, 1);
    // 偶爾釣起沉在水底的裝備（取代這次的漁獲）
    if (!f.forced && this.lootRng.next() < FISH_GEAR_CHANCE) {
      const ilvl = lootIlvl(ilvlForDepth(this.depthFrac(tx, ty)), this.levels.level), it = rollDropItem(this.lootRng, ilvl);
      this.giveOrDrop(it, this.rollFor(it, 'fish', this.depthFrac(tx, ty), ilvl));
      this.emit({ type: 'fish', phase: 'catch', x: f.x, y: f.y, item: it, liquid: f.liquid });
      return;
    }
    const left = this.inventory.add(item, 1);
    if (left > 0) { const pt = this.playerTile(); this.dropAtTile(item, left, pt.x, pt.y); }
    if (ITEMS[item].fish) this.fishLog[item] = (this.fishLog[item] ?? 0) + 1;
    this.emit({ type: 'fish', phase: 'catch', x: f.x, y: f.y, item, liquid: f.liquid });
  }
  /** debug / e2e：浮標漂著時立刻上鉤（item = 指定釣起來的東西） */
  debugForceBite(item: ItemId | null = null): boolean {
    const f = this.fishing;
    if (!f || f.state === 'flying') return false;
    f.state = 'bite'; f.t = 0; f.window = biteWindow(f.power); f.forced = item;
    this.emit({ type: 'fish', phase: 'bite', x: f.x, y: f.y, liquid: f.liquid });
    return true;
  }
  /** 挖掘 / 拔草時偶爾掉魚餌：泥土 / 草地 → 蚯蚓、叢林泥巴 → 肥蛆、草叢 → 白天蚱蜢 / 晚上螢火蟲、極少金曦甲蟲 */
  private baitDrop(tid: number): ItemId | null {
    const r = this.fishRng;
    if (tid === T.DIRT || tid === T.GRASS) return r.next() < WORM_CHANCE ? 'worm' : null;
    if (tid === T.JUNGLE_GRASS || tid === T.MUD) return r.next() < GRUB_CHANCE ? 'grub' : null;
    if (tid === T.TALL_GRASS || tid === T.BUSH || tid === T.FERN || tid === T.FLOWER) {
      const v = r.next();
      if (!this.isNight() && v < SUNBEETLE_CHANCE) return 'sunbeetle';
      return v < BUG_CHANCE ? (this.isNight() ? 'firefly' : 'grasshopper') : null;
    }
    return null;
  }
  /** 吃料理：回血（滿血不能吃、有短冷卻） */
  private eat(item: ItemId): void {
    const heal = ITEMS[item].food ?? 0, { x, y } = this.aim;
    if (this.foodCd > 0) return;
    if (this.hp >= this.maxHp()) { this.block('use', 'full_hp', x, y); return; }
    this.inventory.takeFromSlot(this.inventory.selected, 1);
    const before = this.hp;
    this.hp = Math.min(this.maxHp(), this.hp + heal);
    this.foodCd = FOOD_COOLDOWN;
    const p = this.player, amount = Math.round(this.hp - before);
    this.emit({ type: 'eat', item, amount });
    this.emit({ type: 'heal', amount, x: p.x + p.w / 2, y: p.y });
  }
  /** 打開木箱：戰利品進背包（放不下的掉在腳邊） */
  private openCrate(item: ItemId): void {
    if (item !== 'wooden_crate' && item !== 'iron_crate' && item !== 'golden_crate') return;
    this.inventory.takeFromSlot(this.inventory.selected, 1);
    const drops = crateLoot(item, this.fishRng), pt = this.playerTile();
    for (const d of drops) {
      const left = this.inventory.add(d.item, d.n);
      if (left > 0) this.dropAtTile(d.item, left, pt.x, pt.y);
      this.emit({ type: 'pickup', item: d.item, n: d.n });
    }
    // 木箱裡的裝備（鐵皮 / 金邊箱機率更高、等級更高）
    if (this.lootRng.next() < CRATE_GEAR[item]) {
      const ilvl = item === 'wooden_crate' ? 2 : item === 'iron_crate' ? 3 : 4;
      const it = rollDropItem(this.lootRng, ilvl), g = this.rollFor(it, 'fish', ilvl / 5, ilvl);
      this.giveOrDrop(it, g);
    }
    this.emit({ type: 'crate', item, drops });
  }

  // ── 裝備詞條：掉落 / 圖鑑 / 分解 / 鍛造 ─────────────────
  /** 擲一件裝備：稀有度（來源 + 深度 + 幸運；珍寶至少稀有）→ 詞條 */
  private rollFor(item: ItemId, src: LootSource, depth: number, ilvl: number): Gear {
    const floor = ITEMS[item].unique ? 2 : 0;
    const luck = src === 'craft' ? 0 : this.stats().gear.luck;
    const g = rollGear(item, this.lootRng, { rarity: rollRarity(this.lootRng, src, depth, luck, floor), ilvl });
    if (src === 'craft') g.crafted = true;
    return g;
  }
  /** 在 (x,y) px 丟出一件裝備（彈出）；史詩以上發 loot 事件（光柱 / 音效） */
  private spawnGearDrop(item: ItemId, gear: Gear, x: number, y: number): void {
    const v = popVelocity(this.lootRng.next(), this.lootRng.next());
    this.drops.spawn(item, 1, x, y, v.vx, v.vy, 0, gear);
    this.emit({ type: 'loot', item, rarity: gear.rarity, x, y });
  }
  /** 一件放進背包；放不下掉在腳邊（gear = 帶詞條的裝備；tint = 帶顏色的時裝） */
  giveOrDrop(item: ItemId, gear?: Gear, tint?: Tint): void {
    if (this.inventory.add(item, 1, gear, tint) > 0) {
      const c = this.playerCenter();
      if (gear) this.spawnGearDrop(item, gear, c.x, c.y);
      else {
        const v = popVelocity(this.lootRng.next(), this.lootRng.next());
        this.drops.spawn(item, 1, c.x, c.y, v.vx, v.vy, 0, undefined, tint);
      }
    } else this.emit(gear ? { type: 'pickup', item, n: 1, rarity: gear.rarity } : { type: 'pickup', item, n: 1 });
  }
  /** 把背包 / 裝備欄的裝備收進圖鑑；新詞條發 codex 事件 */
  observeGear(): void {
    const seen = (item: ItemId, g: Gear | undefined): void => {
      for (const a of this.codex.observe(item, g)) this.emit({ type: 'codex', affix: a });
    };
    for (const st of this.inventory.slots) if (st && gearSlot(st.item)) seen(st.item, st.gear);
    for (const st of this.equipment.stacks()) seen(st.item, st.gear);
  }
  /** 裝備的位置：背包格號碼，或裝備欄的槽 */
  stackAt(at: GearAt): Stack | null {
    return typeof at === 'number' ? this.inventory.slots[at] ?? null : this.equipment.getStack(at);
  }
  /** 某個 Stack 物件現在在哪（背包格 / 裝備槽）；不在身上 → null。介面追蹤物件用 */
  locate(st: Stack): GearAt | null {
    const i = this.inventory.slots.indexOf(st);
    if (i >= 0) return i;
    return EQUIP_SLOTS.find((s) => this.equipment.getStack(s) === st) ?? null;
  }
  /** 裝備的詞條（背包格或裝備槽） */
  gearAt(at: GearAt): Gear | undefined { return this.stackAt(at)?.gear; }
  /** 詞條改了：裝備欄的要讓數值快取失效、超出的生命扣回來 */
  private gearChanged(at: GearAt): void {
    if (typeof at !== 'number') this.equipment.touch();
    this.invalidateStats();
    if (this.hp > this.maxHp()) this.hp = this.maxHp();
  }
  /** 鎖定 / 解鎖（鎖定的不會被分解）。回傳鎖定後的狀態；不是裝備 → null */
  toggleLock(at: GearAt): boolean | null {
    const st = this.stackAt(at);
    if (!st || !gearSlot(st.item)) return null;
    const g: Gear = st.gear ? { ...st.gear } : { rarity: 0, ilvl: baseTier(st.item), plus: 0, affixes: [] };
    if (g.locked) delete g.locked; else g.locked = true;
    st.gear = g;
    if (typeof at !== 'number') this.equipment.touch();
    return Boolean(g.locked);
  }
  /** 加材料（放不下掉在腳邊） */
  private giveMats(c: Cost): void {
    const pt = this.playerTile();
    for (const [item, n] of [['gear_shard', c.shard], ['stardust', c.dust]] as const) {
      if (n <= 0) continue;
      const left = this.inventory.add(item, n);
      if (left > 0) this.dropAtTile(item, left, pt.x, pt.y);
    }
  }
  private canPay(c: Cost): boolean { return this.inventory.has('gear_shard', c.shard) && this.inventory.has('stardust', c.dust); }
  private pay(c: Cost): void {
    if (c.shard > 0) this.inventory.remove('gear_shard', c.shard);
    if (c.dust > 0) this.inventory.remove('stardust', c.dust);
  }
  /** 分解（背包格或裝備中的）→ 碎晶 / 星塵。鎖定 / 不是裝備 → null */
  salvage(at: GearAt): Cost | null {
    const st = this.stackAt(at);
    if (!st || !gearSlot(st.item) || st.gear?.locked) return null;
    const y = this.salvageOut(st.gear);
    if (typeof at === 'number') this.inventory.slots[at] = null; else this.equipment.set(at, null);
    this.giveMats(y);
    this.gearChanged(at);
    this.emit({ type: 'salvage', count: 1, shard: y.shard, dust: y.dust });
    return y;
  }
  /** 這些格會被「分解全部」：快捷欄以外、沒鎖定、稀有度 ≤ maxRarity 的裝備 */
  salvageTargets(maxRarity = 0): number[] {
    const out: number[] = [];
    this.inventory.slots.forEach((st, i) => {
      if (i < HOTBAR_SIZE || !st || !gearSlot(st.item) || st.gear?.locked || (st.gear?.rarity ?? 0) > maxRarity) return;
      out.push(i);
    });
    return out;
  }
  /** 一次分解 salvageTargets(maxRarity) 的所有裝備 */
  salvageAll(maxRarity = 0): { count: number; shard: number; dust: number } {
    const tot = { count: 0, shard: 0, dust: 0 };
    for (const i of this.salvageTargets(maxRarity)) {
      const st = this.inventory.slots[i]!;
      const y = this.salvageOut(st.gear);
      this.inventory.slots[i] = null;
      tot.count++; tot.shard += y.shard; tot.dust += y.dust;
    }
    if (tot.count) {
      this.giveMats(tot);
      this.invalidateStats();
      this.emit({ type: 'salvage', ...tot });
    }
    return tot;
  }
  /** 鍛造（洗煉 / 強化 / 升階）要在鐵砧旁 */
  canForge(): boolean { return this.nearTile(T.ANVIL) || this.nearNpc('smith') || this.nearTile(T.DWARF_FORGE) || this.forgeFolk() !== null; }
  /** 鍛造成本（null = 已滿級 / 不能） */
  forgeCosts(at: GearAt): { reroll: Cost | null; upgrade: Cost | null; ascend: Cost | null } {
    const st = this.stackAt(at);
    if (!st || !gearSlot(st.item)) return { reroll: null, upgrade: null, ascend: null };
    const g = st.gear;
    const rerollable = Boolean(g?.affixes.some((a) => affixDef(a.id).kind !== 'unique'));
    return { reroll: rerollable ? this.discounted(this.forgeDiscount(rerollCost(g))) : null, upgrade: this.discounted(this.forgeDiscount(upgradeCost(g))), ascend: this.discounted(this.forgeDiscount(ascendCost(g))) };
  }
  private forge(at: GearAt, action: 'reroll' | 'upgrade' | 'ascend', cost: Cost | null, apply: (g: Gear) => Gear | null): ForgeResult {
    const st = this.stackAt(at);
    if (!st || !gearSlot(st.item)) return { ok: false, reason: 'none' };
    if (!this.canForge()) return { ok: false, reason: 'station' };
    cost = this.discounted(cost);
    if (!cost) return { ok: false, reason: 'max' };
    if (!this.canPay(cost)) return { ok: false, reason: 'cost' };
    const base: Gear = st.gear ?? { rarity: 0, ilvl: baseTier(st.item), plus: 0, affixes: [] };
    const next = apply(base);
    if (!next) return { ok: false, reason: action === 'reroll' ? 'unique' : 'max' };
    this.pay(cost);
    st.gear = next;
    this.gearChanged(at);
    this.emit({ type: 'forge', action, slot: at, item: st.item });
    return { ok: true };
  }
  /** 洗煉：換掉第 affix 條詞條（傳奇詞條不能洗） */
  reroll(at: GearAt, affix: number): ForgeResult {
    const st = this.stackAt(at);
    return this.forge(at, 'reroll', st ? this.forgeDiscount(rerollCost(st.gear)) : null, (g) => (st ? rerollAffix(st.item, g, affix, this.lootRng) : null));
  }
  /** 強化 +1（最多 +5） */
  upgrade(at: GearAt): ForgeResult {
    const st = this.stackAt(at);
    return this.forge(at, 'upgrade', st ? this.forgeDiscount(upgradeCost(st.gear)) : null, (g) => (g.plus >= MAX_PLUS ? null : upgradeGear(g)));
  }
  /** 升階：稀有度 +1（到傳說為止），多一條詞條 */
  ascend(at: GearAt): ForgeResult {
    const st = this.stackAt(at);
    return this.forge(at, 'ascend', st ? this.forgeDiscount(ascendCost(st.gear)) : null, (g) => (st ? ascendGear(st.item, g, this.lootRng) : null));
  }
  /** debug / e2e：給一件指定稀有度的裝備（affixes 指定時直接用） */
  giveGear(item: ItemId, rarity: number, o: { ilvl?: number; affixes?: Gear['affixes']; plus?: number } = {}): Gear | null {
    if (!gearSlot(item)) return null;
    const g = rollGear(item, this.lootRng, { rarity, ilvl: o.ilvl ?? 5 });
    if (o.affixes) g.affixes = o.affixes.map((a) => ({ ...a }));
    if (o.plus) g.plus = o.plus;
    return this.inventory.add(item, 1, g) > 0 ? null : g;
  }
  /** debug / e2e：在 tile (tx, ty) 上方丟一件指定稀有度的裝備到地上 */
  dropGear(item: ItemId, rarity: number, tx: number, ty: number): Gear | null {
    if (!gearSlot(item)) return null;
    const g = rollGear(item, this.lootRng, { rarity, ilvl: 5 });
    this.spawnGearDrop(item, g, (tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE);
    return g;
  }

  /** 掉寶 / 釣魚亂數的狀態（存檔用：讀檔後的掉落 / 漁獲不會重骰） */
  rngState(): { loot: RngState; fish: RngState } { return { loot: this.lootRng.getState(), fish: this.fishRng.getState() }; }
  setRngState(s: { loot?: RngState; fish?: RngState }): void {
    if (s.loot) this.lootRng.setState(s.loot);
    if (s.fish) this.fishRng.setState(s.fish);
  }

  // ── 據點 / 居民 ───────────────────────────────────────
  private settleHost: SettleHost | null = null;
  private updateSettlements(dt: number): void {
    this.settleHost ??= {
      world: this.world, time: 0,
      isNight: () => this.isNight(), sun: () => this.sun(), dayFrac: () => this.date().frac,
      playerTiles: () => this.playerTiles(), playerOverlaps: (x, y) => this.tileOverlapsPlayer(x, y),
    };
    this.settleHost.time = this.time;
    this.settle.update(dt, this.settleHost);
    for (const e of this.settle.drainEvents()) this.emit(e);
  }
  /** 玩家所在的據點（範圍內）與它的等級 */
  settlementHere(): { id: number; level: number } | null {
    const t = this.playerTile(), c = this.settle.claimAt(t.x, t.y);
    return c ? { id: c.id, level: this.settle.levelAt(t.x, t.y, this.world) } : null;
  }
  /** 安心：在 Lv1 以上的據點範圍內 */
  calm(): boolean {
    if (!this.settle.cores.length) return false;
    const t = this.playerTile();
    return this.settle.hasPerk(t.x, t.y, this.world, 'calm');
  }
  /** 合成站聯動（Lv2）：玩家所在據點範圍內有的合成站 tile */
  private linkedStations(): Set<number> | null {
    if (!this.settle.cores.length) return null;
    const t = this.playerTile(), c = this.settle.claimAt(t.x, t.y);
    if (!c || !this.settle.hasPerk(t.x, t.y, this.world, 'craft')) return null;
    const ev = this.settle.evaluation(c.id, this.world);
    return ev ? new Set([...ev.counts.keys()]) : null;
  }
  /** 共享儲物（Lv3）：玩家所在據點的箱子 */
  private sharedStorage(): number[] | null {
    if (!this.settle.cores.length) return null;
    const t = this.playerTile(), c = this.settle.claimAt(t.x, t.y);
    if (!c || !this.settle.hasPerk(t.x, t.y, this.world, 'storage')) return null;
    return this.settle.evaluation(c.id, this.world)?.chests ?? null;
  }
  /** 共享儲物：據點箱子裡（不含背包）的數量；不在 Lv3 據點裡 → null（UI 用來決定要不要算箱子） */
  storageChests(): ((item: ItemId) => number) | null {
    const chests = this.sharedStorage();
    if (!chests) return null;
    const cnt = new Map<ItemId, number>();
    for (const i of chests) for (const st of this.world.chests.get(i) ?? []) if (st) cnt.set(st.item, (cnt.get(st.item) ?? 0) + st.count);
    return (item) => cnt.get(item) ?? 0;
  }
  /** 共享儲物：背包 + 據點箱子裡的數量 */
  storageCount(item: ItemId): number {
    let n = this.inventory.count(item);
    for (const i of this.sharedStorage() ?? []) for (const st of this.world.chests.get(i) ?? []) if (st?.item === item) n += st.count;
    return n;
  }
  /** 背包材料不夠、但加上據點箱子就夠 → 從箱子補（null = 交給一般合成處理） */
  private craftFromStorage(recipeId: string, st: Record<Station, boolean>): CraftResult | null {
    const rc = findRecipe(recipeId), chests = this.sharedStorage();
    if (!rc || !chests || rc.inputs.every((a) => this.inventory.has(a.item, a.n))) return null;
    if (!rc.inputs.every((a) => this.storageCount(a.item) >= a.n)) return { ok: false, reason: 'missing' };
    const ok = rc.station === null || (rc.station === 'campfire' ? st.campfire || st.furnace : st[rc.station]);
    if (!ok) return { ok: false, reason: 'station' };
    const trial = Inventory.fromJSON(this.inventory.toJSON());
    const fromChest = new Map<ItemId, number>();
    for (const a of rc.inputs) {
      const own = Math.min(a.n, trial.count(a.item));
      trial.remove(a.item, own);
      if (a.n > own) fromChest.set(a.item, a.n - own);
    }
    const gear = rc.out.n === 1 && gearSlot(rc.out.item) ? this.rollFor(rc.out.item, 'craft', 0, baseTier(rc.out.item)) : undefined;
    if (trial.add(rc.out.item, rc.out.n, gear) > 0) return { ok: false, reason: 'full' };
    for (const [item, need0] of fromChest) {
      let need = need0;
      for (const i of chests) {
        const slots = this.world.chests.get(i);
        if (!slots) continue;
        for (let k = 0; k < slots.length && need > 0; k++) {
          const s0 = slots[k];
          if (s0?.item !== item) continue;
          const take = Math.min(need, s0.count);
          s0.count -= take; need -= take;
          if (s0.count <= 0) slots[k] = null;
        }
        const { x: cxk, y: cyk } = this.world.tileXY(i);
        this.world.markModified(cxk, cyk);
        if (need <= 0) break;
      }
    }
    this.inventory.slots = trial.slots;
    this.emit({ type: 'craft', recipe: recipeId, item: rc.out.item, n: rc.out.n });
    return { ok: true };
  }
  /** 玩家在某位居民身邊（6 格內） */
  nearNpc(kind: NpcKind, tiles = 6): boolean {
    const n = this.settle.npc(kind);
    if (!n) return false;
    const pc = this.playerCenter(), b = n.body;
    return Math.abs(b.x + b.w / 2 - pc.x) <= tiles * TILE_SIZE && Math.abs(b.y + b.h / 2 - pc.y) <= tiles * TILE_SIZE;
  }
  /** 鍛冶師的折扣：她住的據點範圍內或在她身邊 → 依心情打折 */
  smithMul(): number {
    const n = this.settle.npc('smith');
    if (!n) return 1;
    const t = this.playerTile(), c = this.settle.coreById(n.core);
    const inside = c ? inClaim(c, t.x, t.y) : false;
    return inside || this.nearNpc('smith') ? forgeMul(n.mood) : 1;
  }
  private discounted(c: Cost | null): Cost | null {
    if (!c) return null;
    const m = Math.min(this.smithMul(), this.folkForgeMul());
    return m >= 1 ? c : { ...c, shard: Math.max(c.shard ? 1 : 0, Math.ceil(c.shard * m)), dust: Math.max(c.dust ? 1 : 0, Math.ceil(c.dust * m)) };
  }
  private talkTo(n: Npc): void {
    const wx = this.localWeatherState();
    const line = npcLine(n.kind, { night: this.isNight(), rain: wx.kind === 'rain' || wx.kind === 'storm', mood: n.mood, homeless: n.home === null }, n.talks++);
    n.say = line; n.sayT = 4;
    n.dir = this.playerCenter().x >= n.body.x + n.body.w / 2 ? 1 : -1;
    // 據點的藥師：每天第一次說話送一次祝福
    const day = dayIndexOf(this.time);
    if (n.kind === 'healer' && this.perkDays.healer !== day) { this.perkDays.healer = day; this.giveBuff('bless'); }
    this.emit({ type: 'talk', kind: n.kind, line });
  }
  /** debug / e2e：和某位居民說話（等同右鍵點他） */
  residentTalk(kind: NpcKind): boolean { const n = this.settle.npc(kind); if (!n) return false; this.talkTo(n); return true; }
  /** 對話鍵：離玩家 3.5 格內最近、可以說話的人（居民或世界 NPC） */
  nearestTalkable(): { name: string; key: string; resident?: NpcKind; x: number; y: number } | null {
    const pc = this.playerCenter();
    let best: { name: string; key: string; resident?: NpcKind; x: number; y: number } | null = null, bd = 3.5 * TILE_SIZE;
    for (const n of this.settle.npcs) {
      const b = n.body, d = Math.hypot(b.x + b.w / 2 - pc.x, (b.y + b.h / 2 - pc.y) * 0.7);
      if (d < bd && n.state !== 'sleep') { bd = d; best = { name: this.settle.nameOf(n.kind), key: `res:${n.kind}`, resident: n.kind, x: b.x + b.w / 2, y: b.y }; }
    }
    for (const n of this.folk.npcs) {
      const b = n.body, d = Math.hypot(b.x + b.w / 2 - pc.x, (b.y + b.h / 2 - pc.y) * 0.7);
      if (d < bd && !n.leaving) { bd = d; best = { name: n.name, key: n.key, x: b.x + b.w / 2, y: b.y }; }
    }
    return best;
  }
  /** 點擊 / 觸控：(px,py) 上有人而且碰得到 → 立刻說話（回傳 true） */
  talkAtPx(px: number, py: number): boolean { return this.withActor(this.local, () => this.talkAtPxCur(px, py)); }
  private talkAtPxCur(px: number, py: number): boolean {
    const reach = (b: Body): boolean => this.canReach(Math.floor((b.x + b.w / 2) / TILE_SIZE), Math.floor((b.y + b.h / 2) / TILE_SIZE), this.reach() + 1);
    const r = this.settle.npcAtPx(px, py);
    if (r && reach(r.body)) { this.talkTo(r); return true; }
    const f = this.folk.atPx(px, py);
    if (f && reach(f.body)) { this.talkFolk(f); return true; }
    return false;
  }
  /** 對話鍵：和最近的人說話；附近沒有人 → false */
  talkNearest(): boolean { return this.withActor(this.local, () => this.talkNearestCur()); }
  private talkNearestCur(): boolean {
    const t = this.nearestTalkable();
    if (!t) return false;
    if (t.resident) return this.residentTalk(t.resident);
    const n = this.folk.byKey(t.key);
    if (!n) return false;
    this.talkFolk(n);
    return true;
  }
  /** 錢包（銅幣；1 銀幣 = 100） */
  coins(): number { return walletOf(this.inventory); }
  /** 向居民買第 i 項商品 */
  buy(kind: NpcKind, i: number): boolean {
    const n = this.settle.npc(kind), e = NPCS[kind].shop[i];
    if (!n || !e) return false;
    const price = shopPrice(e.price, n.mood);
    if (this.coins() < price) { this.block('use', 'coins', 0, 0); return false; }
    const trial = Inventory.fromJSON(this.inventory.toJSON());
    if (!pay(trial, price) || trial.add(e.item, e.n) > 0) { this.block('use', 'bagfull', 0, 0); return false; }
    this.inventory.slots = trial.slots;
    this.emit({ type: 'trade', kind, action: 'buy', item: e.item, n: e.n, coins: price });
    return true;
  }
  /** 賣給商人：收購價 × 心情（越開心給越多） */
  sellPrice(kind: NpcKind, item: ItemId): number {
    const n = this.settle.npc(kind), base = NPCS[kind].buys?.[item] ?? (kind === 'merchant' && ITEMS[item].fish ? 10 : 0);
    if (!n || !base) return 0;
    return Math.max(1, Math.round(base * (2 - shopPrice(100, n.mood) / 100)));
  }
  sell(kind: NpcKind, item: ItemId, n = 1): boolean {
    const price = this.sellPrice(kind, item);
    const k = Math.min(n, this.inventory.count(item));
    if (!price || k <= 0) return false;
    this.inventory.remove(item, k);
    const left = earn(this.inventory, price * k);
    if (left > 0) this.dropAtTile('copper_coin', left, this.playerTile().x, this.playerTile().y);
    this.emit({ type: 'trade', kind, action: 'sell', item, n: k, coins: price * k });
    return true;
  }
  /** 居民服務：製圖師打聽地點（藥師 / 嚮導用 residentService；其他服務是被動的） */
  service(kind: NpcKind): boolean {
    const n = this.settle.npc(kind), sv = NPCS[kind].service;
    if (!n || !sv || sv.kind !== 'reveal') return false;
    const price = shopPrice(sv.price ?? 100, n.mood);
    const pt = this.playerTile();
    const left = this.regions.filter((r) => r.ax >= 0 && !this.discovery.isFound(r.id) && !this.markers.some((m) => m.x === r.ax && m.y === r.ay));
    if (!left.length) return false;
    if (this.coins() < price) { this.block('use', 'coins', 0, 0); return false; }
    left.sort((a, b) => Math.hypot(a.ax - pt.x, a.ay - pt.y) - Math.hypot(b.ax - pt.x, b.ay - pt.y));
    const r = left[0];
    pay(this.inventory, price);
    this.explored.revealDisc(r.ax, r.ay, 12);
    if (this.markers.length < 20) this.markers.push({ x: r.ax, y: r.ay });
    this.emit({ type: 'trade', kind, action: 'service', coins: price });
    this.lastReveal = { name: r.name, x: r.ax, y: r.ay };
    return true;
  }
  /** 把某個據點的爐心設為重生點（Lv1 以上） */
  setSpawnCore(id: number): boolean {
    const c = this.settle.coreById(id);
    if (!c || (this.settle.evaluation(id, this.world)?.level ?? 0) < 1) return false;
    this.cur.spawnCore = id;
    this.bed = null;
    this.emit({ type: 'spawn', set: true, x: c.x + 1, y: c.y });
    return true;
  }
  /** 傳送點：玩家在 Lv3 據點範圍內 → 傳到另一個 Lv3 據點的爐心旁 */
  waypoints(): { id: number; x: number; y: number; level: number }[] {
    return this.settle.cores.map((c) => ({ id: c.id, x: c.x, y: c.y, level: this.settle.evaluation(c.id, this.world)?.level ?? 0 }))
      .filter((c) => c.level >= 3);
  }
  travel(to: number): boolean {
    const here = this.settlementHere(), dest = this.waypoints().find((c) => c.id === to);
    if (!here || here.level < 3 || !dest || dest.id === here.id) return false;
    // 爐心旁最近、站得下的空位；整圈都被填滿 → 不傳（提示），不會把人塞進方塊裡
    const spot = findStandSpot(this.world, dest.x + 1, dest.y);
    if (!spot) { this.block('use', 'blockedspot', dest.x, dest.y); return false; }
    this.teleport(spot.x, spot.y);
    this.closeChest();
    this.emit({ type: 'travel', from: here.id, to, x: spot.x, y: spot.y });
    return true;
  }
  /** 建築木槌：方塊整格 ⇄ 半格（只對實心、會自動接邊的方塊） */
  private hammer(x: number, y: number): boolean {
    const w = this.world, id = w.getFg(x, y);
    if (!this.canReach(x, y)) { this.block('use', 'reach', x, y); return false; }
    if (!isSolidTile(id) || tileDef(id).sprite || tileDef(id).minTier >= TIER_UNBREAKABLE) return false;
    w.setHalf(x, y, !w.isHalf(x, y));
    this.emit({ type: 'place', x, y, tile: id, item: 'builder_hammer' });
    return true;
  }
  /**
   * 放置預覽（藍圖 / 鬼影）：手上的方塊 / 家具放在 (x,y) 會佔哪些格、能不能放（不改世界）。
   * 不是可放置的東西 → null。門往上 3 格、雙格家具往右 1 格。
   */
  placementPreview(x: number, y: number): { tiles: [number, number, number][]; ok: boolean; wall?: number } | null {
    const st = this.inventory.selectedStack();
    if (!st) return null;
    const d = ITEMS[st.item], w = this.world;
    if (d.placeWall !== undefined) {
      const near = isSolidTile(w.getFg(x, y)) || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => w.getWall(x + dx, y + dy) !== 0 || isSolidTile(w.getFg(x + dx, y + dy)));
      return { tiles: [[x, y, T.AIR]], ok: w.inBounds(x, y) && w.getWall(x, y) === 0 && this.canReach(x, y) && near, wall: d.placeWall };
    }
    const place = d.place;
    if (place === undefined || place === T.ROPE || place === T.TORCH) return null;
    const free = (tx: number, ty: number): boolean => { const c = w.getFg(tx, ty); return w.inBounds(tx, ty) && (c === T.AIR || tileDef(c).replaceable); };
    const tiles: [number, number, number][] = [];
    let ok = this.canReach(x, y);
    if (place === T.DOOR_CLOSED) {
      for (let k = 0; k < 3; k++) { tiles.push([x, y - k, T.DOOR_CLOSED]); ok &&= free(x, y - k) && !this.tileOverlapsPlayer(x, y - k); }
      ok &&= isSolidTile(w.getFg(x, y + 1));
    } else if (PAIR_OF_LEFT.has(place)) {
      const pr = PAIR_OF_LEFT.get(place)!;
      tiles.push([x, y, pr.left], [x + 1, y, pr.right]);
      for (let k = 0; k < 2; k++) ok &&= free(x + k, y) && isSolidTile(w.getFg(x + k, y + 1));
    } else {
      tiles.push([x, y, place]);
      ok &&= free(x, y) && this.placeSupported(x, y, place) && !(isSolidTile(place) && this.tileOverlapsPlayer(x, y));
      if (place === T.HEARTH) ok &&= this.settle.canFound(x, y) === 'ok';
    }
    return { tiles, ok };
  }
  /** debug / e2e：立刻讓居民搬進玩家所在（或第一個）據點 */
  debugMoveIn(kind: NpcKind, force = false): boolean {
    const here = this.settlementHere()?.id ?? this.settle.cores[0]?.id;
    return here !== undefined && Boolean(this.settle.moveIn(kind, here, this.world, force));
  }
  // ── 世界 NPC（村民 / 矮人 / 旅人 / 受困探險者）、委託、地標、buff ──────
  private updateFolk(dt: number): void {
    const self = this;
    this.folkHost ??= {
      world: this.world, time: 0, day: 0,
      get viewHalf() { return self.viewHalf; },
      isNight: () => this.isNight(), playerTiles: () => this.playerTiles(),
      underground: (x, y) => {
        const b = this.dungeon?.bbox;
        return y > this.world.layersAt(x).rock + 4 && !(b && x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
      },
      onSurface: (x, y) => {
        return y <= this.world.layersAt(x).rock - 6 && y <= this.world.surfaceAt(x) + 4;
      },
      safeAt: (x, y) => this.settle.claimAt(x, y) !== null || this.siteAt(x, y) !== null,
      playerOverlaps: (x, y) => this.tileOverlapsPlayer(x, y),
      wantHerbalist: () => !this.settle.npc('healer') && !this.settle.invited.has('healer'),
    };
    const h = this.folkHost!;
    h.time = this.time; h.day = dayIndexOf(this.time);
    this.folk.update(dt, h);
    // 救出來的探險者會被怪物碰傷；死了 → 護送失敗
    for (const n of [...this.folk.npcs]) {
      if (n.role !== 'stranded' || !(n.following || n.waiting) || this.allDead()) continue;
      for (const e of this.enemies) {
        if (!overlaps(e.body, n.body)) continue;
        if (this.folk.hurt(n, Math.max(4, Math.round(ENEMIES[e.kind].damage * 0.6)), this.world)) this.refreshQuests();
        break;
      }
    }
    for (const e of this.folk.drainEvents()) {
      this.emit(e);
      if (e.phase === 'safe') this.refreshQuests();
    }
    if (this.tick % 30 === 0) this.refreshQuests();
  }
  /** (x,y) 在哪個村落 / 地廳裡（範圍含村外的緩坡） */
  siteAt(x: number, y: number): { kind: 'village' | 'hall'; i: number } | null {
    for (let i = 0; i < this.villages.length; i++) {
      const v = this.villages[i];
      if (x >= v.x0 - 12 && x <= v.x1 + 12 && y >= v.ground - 28 && y <= v.ground + 4) return { kind: 'village', i };
    }
    for (let i = 0; i < this.halls.length; i++) {
      const h = this.halls[i];
      if (x >= h.x0 - 4 && x <= h.x1 + 4 && y >= h.y0 - 5 && y <= h.floorY + 2) return { kind: 'hall', i };
    }
    return null;
  }
  /** 地區名（村落 / 地廳：discovery 的名字） */
  siteName(kind: 'village' | 'hall', i: number): string {
    const rk = kind === 'village' ? 'village' : 'dwarf_hall';
    const s = kind === 'village' ? this.villages[i] : this.halls[i];
    if (!s) return '';
    const cx = (s.x0 + s.x1) >> 1, cy = kind === 'village' ? (s as VillageInfo).ground - 2 : (s as HallInfo).floorY - 2;
    return this.regions.find((r) => r.kind === rk && r.contains(cx, cy))?.name ?? '';
  }
  private talkFolk(n: FolkNpc): void {
    const lines = ROLES[n.role].lines;
    const line = n.role === 'stranded' ? (n.safe ? '多虧了你，我終於回到安全的地方了！' : n.following ? '我跟著你，別走太快喔。' : n.waiting ? '你回來了！我們繼續走吧。' : lines[0]) : lines[n.talks++ % lines.length];
    n.say = line; n.sayT = 4;
    n.dir = this.playerCenter().x >= n.body.x + n.body.w / 2 ? 1 : -1;
    this.folk.talkAff(n.key, dayIndexOf(this.time));
    this.refreshQuests();
    this.emit({ type: 'folktalk', key: n.key, line });
  }
  /** debug / e2e：直接打開某人的面板（不用走過去） */
  debugTalk(key: string): boolean { const n = this.folk.byKey(key); if (!n) return false; this.talkFolk(n); return true; }
  /** 好感度的價格倍率 */
  folkMul(key: string): number { return affMul(this.folk.affinity(key)); }
  folkPrice(key: string, base: number): number { return Math.max(1, Math.round(base * this.folkMul(key))); }
  /** 玩家在某人身邊（tiles 格內） */
  nearFolk(n: FolkNpc, tiles = 7): boolean {
    const pc = this.playerCenter(), b = n.body;
    return Math.abs(b.x + b.w / 2 - pc.x) <= tiles * TILE_SIZE && Math.abs(b.y + b.h / 2 - pc.y) <= tiles * TILE_SIZE;
  }
  /** 身邊的鐵匠 / 符文匠（鍛造站 + 好感度折扣） */
  forgeFolk(): FolkNpc | null {
    for (const n of this.folk.npcs) if ((n.role === 'smith' || n.role === 'runesmith') && this.nearFolk(n, 6)) return n;
    return null;
  }
  private folkForgeMul(): number {
    const n = this.forgeFolk();
    return n ? Math.max(0.6, Math.round((affMul(this.folk.affinity(n.key)) - 0.05) * 100) / 100) : 1;
  }
  /** 向 NPC 買第 i 項（好感度不夠 / 錢不夠 / 背包滿 → false） */
  folkBuy(key: string, i: number): boolean {
    const n = this.folk.byKey(key), e = n ? this.folk.shop(n)[i] : undefined;
    if (!n || !e || !this.nearFolk(n, FOLK_TALK_RANGE)) return false;
    if ((e.tier ?? 0) > affTier(this.folk.affinity(key)) || this.folk.stockLeft(n, i) <= 0) return false;
    const price = this.folkPrice(key, e.price);
    if (this.coins() < price) { this.block('use', 'coins', 0, 0); return false; }
    const trial = Inventory.fromJSON(this.inventory.toJSON());
    if (!pay(trial, price) || trial.add(e.item, e.n) > 0) { this.block('use', 'bagfull', 0, 0); return false; }
    this.inventory.slots = trial.slots;
    this.folk.takeStock(n, i);
    this.folk.tradeAff(key, dayIndexOf(this.time));
    this.emit({ type: 'folktrade', key, action: 'buy', item: e.item, n: e.n, coins: price });
    return true;
  }
  /** 賣給 NPC 的單價（好感度每一級 +8%） */
  folkSellPrice(key: string, item: ItemId): number {
    const n = this.folk.byKey(key), base = n ? ROLES[n.role].buys?.[item] ?? 0 : 0;
    return base ? Math.max(1, Math.round(base * (1 + affTier(this.folk.affinity(key)) * 0.08))) : 0;
  }
  folkSell(key: string, item: ItemId, k = 1): boolean {
    const who = this.folk.byKey(key);
    if (!who || !this.nearFolk(who, FOLK_TALK_RANGE)) return false;
    const price = this.folkSellPrice(key, item), n = Math.min(k, this.inventory.count(item));
    if (!price || n <= 0) return false;
    this.inventory.remove(item, n);
    const left = earn(this.inventory, price * n);
    if (left > 0) this.dropAtTile('copper_coin', left, this.playerTile().x, this.playerTile().y);
    this.folk.tradeAff(key, dayIndexOf(this.time));
    this.emit({ type: 'folktrade', key, action: 'sell', item, n, coins: price * n });
    return true;
  }
  buffOn(k: BuffKind): boolean { const u = this.buffs[k]; return u !== undefined && this.time < u; }
  /** 給 buff：同種的刷新時間、不同種的並存 */
  giveBuff(k: BuffKind): void {
    this.buffs[k] = Math.max(this.buffs[k] ?? 0, this.time + BUFFS[k].secs);
    this.emit({ type: 'buff', kind: k, on: true });
  }
  /** 生效中的 buff（剩餘秒數由少到多；HUD 顯示用） */
  activeBuffs(): { kind: BuffKind; left: number }[] {
    return (Object.keys(this.buffs) as BuffKind[]).filter((k) => this.buffOn(k)).map((k) => ({ kind: k, left: (this.buffs[k] ?? 0) - this.time })).sort((a, b) => a.left - b.left);
  }
  /** debug / 測試：設定探險者的受傷冷卻 */
  iframesFolk(n: FolkNpc, t: number): void { n.hurtCd = t; }
  /** 藥師住在玩家所在的據點：據點回血加倍 */
  private healerHome(): boolean {
    const n = this.settle.npc('healer');
    if (!n) return false;
    const t = this.playerTile(), c = this.settle.claimAt(t.x, t.y);
    return Boolean(c && c.id === n.core);
  }
  /**
   * 服務（NPC 或居民共用）：heal / bless / ward / minesong 付錢；hint 免費；scout 標地點；invite / rescue 不收錢。
   * 回傳顯示給玩家的訊息（null = 做不到，原因在 block 事件或回傳的 fail）
   */
  doService(kind: FolkService, price: number, who: { key?: string; resident?: NpcKind }): { ok: boolean; msg: string } {
    const fail = (msg: string): { ok: boolean; msg: string } => ({ ok: false, msg });
    if (price > 0 && this.coins() < price) { this.block('use', 'coins', 0, 0); return fail('錢不夠'); }
    let msg = '';
    switch (kind) {
      case 'heal': {
        if (this.hp >= this.maxHp()) return fail('你很健康，不需要治療');
        const before = this.hp;
        this.hp = this.maxHp();
        this.burning = 0;
        const p = this.player;
        this.emit({ type: 'heal', amount: Math.round(this.hp - before), x: p.x + p.w / 2, y: p.y });
        msg = '傷口都處理好了';
        break;
      }
      case 'bless': case 'ward': case 'minesong':
        this.giveBuff(kind);
        msg = `得到「${BUFFS[kind].zh}」：${BUFFS[kind].desc}（${Math.round(BUFFS[kind].secs / 60)} 分鐘）`;
        break;
      case 'hint': return { ok: true, msg: this.nextStepHint() };
      case 'scout': {
        const r = this.scout();
        if (!r) return fail('附近已經沒有我不知道的地方了');
        msg = `「${r.name}」在（${r.x}, ${r.y}），已經標在你的地圖上了`;
        break;
      }
      default: return fail('');
    }
    if (price > 0) pay(this.inventory, price);
    if (who.key) {
      this.folk.tradeAff(who.key, dayIndexOf(this.time));
      this.emit({ type: 'folktrade', key: who.key, action: 'service', coins: price, service: kind });
    } else if (who.resident) this.emit({ type: 'trade', kind: who.resident, action: 'service', coins: price });
    return { ok: true, msg };
  }
  /** NPC 的服務（依好感度等級門檻、價格倍率） */
  folkService(key: string, kind: FolkService): { ok: boolean; msg: string } {
    const n = this.folk.byKey(key);
    const def = n ? ROLES[n.role].services.find((s) => s.kind === kind) : undefined;
    if (!n || !def) return { ok: false, msg: '' };
    if (!this.nearFolk(n, FOLK_TALK_RANGE)) return { ok: false, msg: '離太遠了，走近一點再說' };
    if ((def.tier ?? 0) > affTier(this.folk.affinity(key))) return { ok: false, msg: '還不夠熟，對方不願意幫這個忙' };
    if (kind === 'invite') return this.inviteFolk(n);
    if (kind === 'rescue') return this.rescue(n);
    if (kind === 'forge' || kind === 'deepforge') return { ok: true, msg: '在背包選一件裝備，按「鍛造」' };
    return this.doService(kind, def.price ? this.folkPrice(key, def.price) : 0, { key });
  }
  /** 居民的服務（藥師 / 嚮導；依心情調價） */
  residentService(kind: NpcKind, action: FolkService): { ok: boolean; msg: string } {
    const n = this.settle.npc(kind), sv = NPCS[kind].service;
    if (!n || !sv) return { ok: false, msg: '' };
    if (!this.nearNpc(kind, FOLK_TALK_RANGE)) return { ok: false, msg: '離太遠了，走近一點再說' };
    const base = sv.price ?? 0;
    const price = action === 'hint' ? 0 : action === 'bless' ? shopPrice(base * 3, n.mood) : action === 'ward' ? shopPrice(base * 5, n.mood) : shopPrice(base, n.mood);
    if (sv.kind === 'heal' && !['heal', 'bless', 'ward'].includes(action)) return { ok: false, msg: '' };
    if (sv.kind === 'guide' && !['hint', 'scout'].includes(action)) return { ok: false, msg: '' };
    return this.doService(action, price, { resident: kind });
  }
  /** 旅行藥師 → 邀請她到據點（成為藥師居民）；探險者 → 嚮導 */
  private inviteFolk(n: FolkNpc): { ok: boolean; msg: string } {
    const kind: NpcKind = n.role === 'herbalist' ? 'healer' : 'guide';
    if (n.role === 'stranded' && !n.safe) return { ok: false, msg: `先把${n.name}安全帶回去吧` };
    // 護送還沒交付：先自動交付（不會因為先按邀請而卡死）
    const esc = this.quests.get(`${n.key}#escort`);
    if (esc && this.quests.ready(esc)) this.turnInQuest(esc.def.id);
    const l = n.look;
    const ident = { name: n.name, look: { app: { ...l.app }, ...(l.head ? { head: l.head } : {}), ...(l.body ? { body: l.body } : {}), ...(l.legs ? { legs: l.legs } : {}),
      ...(l.back ? { back: l.back } : {}), ...(l.belt ? { belt: l.belt } : {}), ...(l.neck ? { neck: l.neck } : {}) } };
    if (!this.settle.invite(kind, ident)) return { ok: false, msg: this.settle.npc(kind) ? `據點已經有${NPCS[kind].title}了` : '已經邀請過了' };
    this.folk.addAff(n.key, 10);
    this.folk.dismiss(n);
    const has = this.settle.cores.length > 0;
    this.emit({ type: 'folktrade', key: n.key, action: 'service', coins: 0, service: 'invite' });
    return { ok: true, msg: has ? `${n.name}答應了！等據點有一間合格的空房（有床），白天就會搬過來。` : `${n.name}答應了！先做一個「據點爐心」、蓋好有床的房間，就會搬過來。` };
  }
  /** 救援受困探險者：開始跟著玩家 + 接下護送委託 */
  private rescue(n: FolkNpc): { ok: boolean; msg: string } {
    if (!this.folk.startFollow(n)) return { ok: false, msg: '' };
    const def: QuestDef = {
      id: `${n.key}#escort`, giver: n.key, giverName: n.name, kind: 'escort', n: 1, target: n.key,
      title: `護送：${n.name}`, desc: `把受困的${n.name}帶到地表、村落或據點。會跟著你走（被擋住會自己找路跟上）。`, reward: { ...ESCORT_REWARD },
    };
    if (this.quests.active.length >= 5) this.quests.active.push({ def, progress: 0 }); else this.quests.accept(def);
    this.folk.addAff(n.key, AFF_RESCUE);
    this.emit({ type: 'quest', phase: 'accept', id: def.id, title: def.title });
    return { ok: true, msg: `${n.name}抓住你的衣角：「我、我跟著你！」把人帶到地表、村落或據點就安全了。` };
  }
  /** 深岩升階（矮人符文匠）：用金錠 / 熔岩錠 + 銅幣代替星塵，把裝備升一階 */
  deepforgeCost(at: GearAt, key: string): { bar: ItemId; n: number; coins: number } | null {
    const st = this.stackAt(at);
    if (!st || !gearSlot(st.item)) return null;
    const r = st.gear?.rarity ?? 0;
    if (r >= 4) return null;
    return r < 2 ? { bar: 'gold_bar', n: 2 + r, coins: this.folkPrice(key, 120 * (r + 1)) } : { bar: 'molten_bar', n: r, coins: this.folkPrice(key, 200 * (r + 1)) };
  }
  deepforge(at: GearAt, key: string): ForgeResult {
    const n = this.folk.byKey(key), st = this.stackAt(at);
    if (!n || n.role !== 'runesmith' || !st || !gearSlot(st.item)) return { ok: false, reason: 'none' };
    if (!this.nearFolk(n, 8)) return { ok: false, reason: 'station' };
    if (affTier(this.folk.affinity(key)) < 1) return { ok: false, reason: 'locked' };
    const c = this.deepforgeCost(at, key);
    if (!c) return { ok: false, reason: 'max' };
    if (!this.inventory.has(c.bar, c.n) || this.coins() < c.coins) return { ok: false, reason: 'cost' };
    const base: Gear = st.gear ?? { rarity: 0, ilvl: baseTier(st.item), plus: 0, affixes: [] };
    const next = ascendGear(st.item, base, this.lootRng);
    if (!next) return { ok: false, reason: 'max' };
    this.inventory.remove(c.bar, c.n);
    pay(this.inventory, c.coins);
    st.gear = next;
    this.gearChanged(at);
    this.folk.tradeAff(key, dayIndexOf(this.time));
    this.emit({ type: 'forge', action: 'ascend', slot: at, item: st.item });
    return { ok: true };
  }
  /** 嚮導 / 地標線索：把最近的、還沒去過的地點（或還沒領過的地標）標在地圖上 */
  scout(): { name: string; x: number; y: number } | null {
    const pt = this.playerTile();
    // 標過的地點（嚮導 / 線索 / 委託）+ 玩家自己的標記：SCOUT_SPACING 格以內的候選都算「已經標過」（地區與地標一起去重）
    const done: { x: number; y: number }[] = this.markers.map((m) => ({ x: m.x, y: m.y }));
    for (const k of this.scouted) { const [x, y] = k.split(',').map(Number); done.push({ x, y }); }
    const R2 = SCOUT_SPACING * SCOUT_SPACING;
    const marked = (x: number, y: number): boolean => done.some((p) => (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y) < R2);
    const cand: { name: string; x: number; y: number; d: number }[] = [];
    for (const l of this.landmarks) {
      const i = this.world.idx(l.x, l.y);
      if (this.discovery.landmarks.has(i) || marked(l.x, l.y)) continue;
      cand.push({ name: tileDef(l.tile).name.zh, x: l.x, y: l.y, d: Math.hypot(l.x - pt.x, (l.y - pt.y) * 1.5) });
    }
    for (const r of this.regions) {
      if (r.ax < 0 || r.cat === 'land' || r.cat === 'depth' || this.discovery.isFound(r.id) || marked(r.ax, r.ay)) continue;
      cand.push({ name: r.name, x: r.ax, y: r.ay, d: Math.hypot(r.ax - pt.x, (r.ay - pt.y) * 1.5) * 0.9 });
    }
    cand.sort((a, b) => a.d - b.d);
    const c = cand[0];
    if (!c) return null;
    this.explored.revealDisc(c.x, c.y, 10);
    this.addScoutMark(c.x, c.y);
    this.lastScout = { name: c.name, x: c.x, y: c.y };
    return this.lastScout;
  }
  /** 嚮導的「下一步」：依目前進度給一句具體的建議 */
  nextStepHint(): string {
    const pt = this.playerTile();
    const dir = (x: number, y: number): string => `${x > pt.x ? '往東' : '往西'} ${Math.abs(x - pt.x)} 格${y > pt.y + 20 ? '、往下 ' + (y - pt.y) + ' 格' : ''}`;
    const pick = this.activePick();
    const tier = pick ? ITEMS[pick.item].pick!.tier : 0;
    if (tier <= 1) return '先換一把好鎬：挖銅礦，用熔爐煉成銅錠，在鐵砧旁做銅鎬。挖得快，往下才有意思。';
    if (!this.settle.cores.length) return '做一個「據點爐心」（石頭 15、木材 5、火把 3）放在地上，蓋好有床的房間，就會有人搬來住。';
    const vi = this.villages.findIndex((v) => !this.regions.some((r) => r.kind === 'village' && r.contains(v.x0 + 3, v.ground - 2) && this.discovery.isFound(r.id)));
    if (vi >= 0) { const v = this.villages[vi]; return `${dir(v.x0, v.ground)}有一座村子「${this.siteName('village', vi)}」。村民會賣東西、幫你鍛造治療，村長那裡還有委託。`; }
    if (!this.settle.invited.has('healer') && !this.settle.npc('healer')) return '白天在地表多走走：路邊偶爾會遇到旅行藥師，邀請這位藥師到據點，回血會快很多。';
    const hi = this.halls.findIndex((h) => !this.regions.some((r) => r.kind === 'dwarf_hall' && r.contains((h.x0 + h.x1) >> 1, h.floorY - 2) && this.discovery.isFound(r.id)));
    if (hi >= 0) { const h = this.halls[hi]; return `洞穴層深處住著矮人：${dir((h.x0 + h.x1) >> 1, h.floorY)}有「${this.siteName('hall', hi)}」。他們賣地表買不到的礦石，還能用錠幫你升階裝備。`; }
    if (this.dungeon && !this.regions.some((r) => r.kind === 'dungeon' && this.discovery.isFound(r.id))) return `${dir(this.dungeon.bbox.x, this.dungeon.bbox.y)}有一座地下城。帶夠藥水，裡面的鑰匙能打開金寶箱。`;
    if (!this.bossesDefeated.has('lantern_warden')) return '地下城最深處的守望者還沒被擊敗。準備好之後，用燈芯祭品把它叫出來吧。';
    const left = this.landmarks.length - this.discovery.landmarks.size;
    return left > 0 ? `這個世界還有 ${left} 件地標沒被發現。讓我幫你標一個在地圖上？` : '你已經走遍這個世界了。要不要試試蓋一座 Lv3 的村莊？';
  }
  // ── 委託 ──
  private giverInfo(n: FolkNpc): GiverInfo {
    return { key: n.key, name: n.name, race: n.race, x: Math.floor(n.body.x / TILE_SIZE), y: Math.floor(n.body.y / TILE_SIZE) };
  }
  private questCtx(): QuestCtx {
    return {
      day: dayIndexOf(this.time),
      nearestUnfound: (x, y, cats, skip) => {
        let best: { id: number; name: string; x: number; y: number } | null = null, bd = Infinity;
        for (const r of this.regions) {
          if (r.ax < 0 || !cats.includes(r.cat) || this.discovery.isFound(r.id) || skip.has(r.id) || r.kind === 'village' || r.kind === 'dwarf_hall') continue;
          const d = Math.hypot(r.ax - x, (r.ay - y) * 1.2);
          if (d < bd && d > 30) { bd = d; best = { id: r.id, name: r.name, x: r.ax, y: r.ay }; }
        }
        return best;
      },
    };
  }
  /** 某位委託人現在掛在板上的委託 */
  questOffers(key: string): QuestDef[] {
    const n = this.folk.byKey(key);
    return n && ROLES[n.role].quests ? this.quests.offers(this.giverInfo(n), this.questCtx()) : [];
  }
  acceptQuest(key: string, id: string): boolean {
    const who = this.folk.byKey(key);
    if (!who || !this.nearFolk(who, FOLK_TALK_RANGE)) return false;
    const q = this.questOffers(key).find((d) => d.id === id);
    if (!q || !this.quests.accept(q)) return false;
    if (q.at) this.addScoutMark(q.at.x, q.at.y);
    if (q.at) this.explored.revealDisc(q.at.x, q.at.y, 8);
    this.refreshQuests();
    this.emit({ type: 'quest', phase: 'accept', id, title: q.title });
    return true;
  }
  /** 嚮導 / 線索標記：最多 SCOUT_MAX 個，滿了丟掉最舊的（已經去過 / 領過的優先丟） */
  private addScoutMark(x: number, y: number): void {
    this.scouted.add(`${x},${y}`);
    if (this.scoutMarks.some((m) => m.x === x && m.y === y)) return;
    if (this.scoutMarks.length >= SCOUT_MAX) {
      const k = this.scoutMarks.findIndex((m) => this.markDone(m.x, m.y));
      this.scoutMarks.splice(k >= 0 ? k : 0, 1);
    }
    this.scoutMarks.push({ x, y });
  }
  /** 這個標記已經沒用了：那裡的地標領過了、或那個地點已經發現了 */
  private markDone(x: number, y: number): boolean {
    if (this.world.inBounds(x, y) && this.landmarkAt.has(this.world.idx(x, y))) return this.discovery.landmarks.has(this.world.idx(x, y));
    return this.regions.some((r) => r.ax === x && r.ay === y && this.discovery.isFound(r.id));
  }
  /** 交付：要在委託人身邊（村長 / 長老 / 被護送的人） */
  turnInQuest(id: string): boolean {
    this.refreshQuests();
    const q = this.quests.get(id);
    if (!q || !this.quests.ready(q)) return false;
    const giver = this.folk.byKey(q.def.giver);
    if (!giver || !this.nearFolk(giver, 9)) return false;
    if (q.def.kind === 'collect' && q.def.item && !this.inventory.has(q.def.item, q.def.n)) return false;
    const def = this.quests.turnIn(id);
    if (!def) return false;
    if (def.kind === 'collect' && def.item) this.inventory.remove(def.item, def.n);
    const left = earn(this.inventory, def.reward.coins);
    const pt = this.playerTile();
    if (left > 0) this.dropAtTile('copper_coin', left, pt.x, pt.y);
    if (def.reward.item) { const l2 = this.inventory.add(def.reward.item.item, def.reward.item.n); if (l2 > 0) this.dropAtTile(def.reward.item.item, l2, pt.x, pt.y); }
    this.folk.addAff(def.giver, AFF_QUEST);
    this.addXp(def.reward.xp, 'quest');
    this.emit({ type: 'quest', phase: 'done', id, title: def.title });
    if (def.kind === 'escort' && giver.role === 'stranded' && (this.settle.npc('guide') || this.settle.invited.has('guide'))) this.folk.dismiss(giver);
    return true;
  }
  private questKill(kind: EnemyKind): void {
    for (const q of this.quests.onKill(kind)) {
      this.emit({ type: 'quest', phase: this.quests.ready(q) ? 'ready' : 'progress', id: q.def.id, title: q.def.title, progress: q.progress, n: q.def.n });
    }
  }
  /** 收集 / 探索 / 護送的進度；剛達成的發 ready 事件 */
  refreshQuests(): void {
    if (!this.quests.active.length) return;
    // 護送的對象不見了（死掉 / 被移除）：自動結案（失敗，不給獎勵）
    for (const q of [...this.quests.active]) {
      if (q.def.kind !== 'escort' || !q.def.target || this.folk.byKey(q.def.target)) continue;
      this.quests.active = this.quests.active.filter((a) => a !== q);
      this.emit({ type: 'quest', phase: 'failed', id: q.def.id, title: q.def.title });
    }
    const before = new Map(this.quests.active.map((q) => [q.def.id, this.quests.ready(q)]));
    this.quests.refresh((it) => this.inventory.count(it), (r) => this.discovery.isFound(r), (k) => Boolean(this.folk.byKey(k)?.safe));
    for (const q of this.quests.active) if (this.quests.ready(q) && !before.get(q.def.id)) this.emit({ type: 'quest', phase: 'ready', id: q.def.id, title: q.def.title });
  }
  // ── 地標 ──
  /** 領地標：第一次 → 獎勵 + 文字 + 線索；之後只顯示文字 */
  private claimLandmark(x: number, y: number): boolean {
    const i = this.world.idx(x, y), info = this.landmarkAt.get(i), tile = this.world.getFg(x, y);
    const r = landmarkReward(this.seed, tile, info?.site ?? '', this.depthFrac(x, y), i);
    if (!info || !this.discovery.claimLandmark(i)) {
      this.emit({ type: 'landmark', x, y, tile, first: false, title: r.title, text: '這裡已經搜過了。', clue: null, items: [], coins: 0 });
      return true;
    }
    for (const it of r.items) { const left = this.inventory.add(it.item, it.n); if (left > 0) this.dropAtTile(it.item, left, x, y); }
    if (r.coins) { const left = earn(this.inventory, r.coins); if (left > 0) this.dropAtTile('copper_coin', left, x, y); }
    if (r.buff) this.giveBuff(r.buff);
    const clue = r.clue ? this.scout() : null;
    this.addXp(r.xp, 'discover', (x + 0.5) * TILE_SIZE, y * TILE_SIZE);
    this.emit({ type: 'landmark', x, y, tile, first: true, title: r.title, text: r.text, clue: clue ? clue.name : null, items: r.items, coins: r.coins });
    this.refreshQuests();
    return true;
  }
  /** debug / e2e：在玩家附近生出一位旅人 / 受困探險者 */
  debugEncounter(role: 'peddler' | 'herbalist' | 'stranded', dx = 4): FolkNpc | null {
    const t = this.playerTile(), s = findStandSpot(this.world, t.x + dx, t.y, 6);
    if (!s) return null;
    this.folk.notePlayer(t);
    return role === 'stranded' ? this.folk.spawnStranded(this.world, s.x, s.y, this.time) : this.folk.spawnTraveller(this.world, role, s.x, s.y, this.time);
  }
  // ── 等級 / 技能（engine/levels.ts、engine/skills.ts） ──────
  private levelCtx(): XpCtx {
    const w = this.world;
    return {
      day: dayIndexOf(this.time),
      idx: (x, y) => w.idx(x, y),
      depth: (x, y) => this.depthFrac(x, y),
      fishCount: (it) => this.fishLog[it] ?? 0,
      isFish: (it) => Boolean(ITEMS[it].fish),
      legendary: (it) => LEGEND_FISH.has(it),
      catStats: () => this.discovery.stats().cats,
      recipeStation: (id) => { const rc = findRecipe(id); return rc ? rc.station : undefined; },
    };
  }
  /** 把還沒換算過的事件換成經驗（step 開頭、drainEvents 時；新推的 xp / levelup 事件不會再被換算） */
  private flushLevels(): void {
    const ev = this.events;
    let ctx: XpCtx | null = null;
    for (; this.lvScan < ev.length; this.lvScan++) {
      const e = ev[this.lvScan];
      // 委託是世界層級（大家共用一份）：進度事件公開
      if (e.type === 'kill') this.inWorld(() => this.questKill(e.kind));
      if (!LEVEL_EVENTS.has(e.type)) continue;
      // 記給事件的 pid；沒有 pid（單機 / 世界事件，例如投射物擊殺、據點評等）→ 本地玩家。已離開的玩家 → 不記
      const who = e.pid === undefined ? this.local : this.actors.get(e.pid);
      if (!who) continue;
      // ctx 的 fishLog / discovery 等是在呼叫時讀 cur（= who），可以共用
      const c = ctx ??= this.levelCtx();
      this.withActor(who, () => {
        const a = xpForEvent(this.levels, e, c);
        if (a && a.amount > 0) this.addXp(a.amount, a.src, a.x, a.y);
      });
    }
  }
  /** 加經驗（種族加成 + 博學）：發 xp 事件；跨級的每一級發 levelup。
   *  種族加成只把「整數部分」交給 levels.gain、小數留在 raceXpCarry 下次再加（博學仍由 gain 照舊乘、照舊四捨五入）。 */
  addXp(n: number, src: XpSource = 'debug', x?: number, y?: number): GainResult {
    let bonus = 0;
    if (!this.levels.locked) {
      const exact = Math.max(0, n) * this.raceMods().xpPct / 100 + this.raceXpCarry;
      bonus = Math.floor(exact + 1e-9);
      this.raceXpCarry = Math.max(0, exact - bonus);
    }
    const r = this.levels.gain(n + bonus);
    if (r.amount <= 0) return r;
    const p = this.player;
    this.emit({ type: 'xp', amount: r.amount, src, x: x ?? p.x + p.w / 2, y: y ?? p.y - 4 });
    if (r.to > r.from) {
      // 生命上限跟著長（目前生命不變，靠回血補上：不打斷戰鬥中的數值）
      const spent = this.levels.spent;
      for (let L = r.from + 1; L <= r.to; L++) {
        const m = milestoneAt(L);
        this.emit({ type: 'levelup', level: L, points: Math.max(0, skillPointsAt(L) - spent), title: m ? m.title : null, maxHp: this.maxHp() });
      }
    }
    return r;
  }
  /** 點一級技能；失敗回傳原因（不扣點） */
  learnSkill(id: SkillId): LearnFail | null {
    const f = this.levels.learn(id);
    if (f) return f;
    if (this.hp > this.maxHp()) this.hp = this.maxHp();
    this.emit({ type: 'learn', id, rank: this.levels.rank(id) });
    return null;
  }
  /** 重置技能樹的材料 */
  respecCost(): Cost { return respecCost(this.levels.spent); }
  /** 重置技能樹：扣材料、點數全退 */
  respecSkills(): { ok: true; refunded: number } | { ok: false; reason: 'none' | 'cost' } {
    if (this.levels.spent <= 0) return { ok: false, reason: 'none' };
    const c = this.respecCost();
    if (!this.canPay(c)) return { ok: false, reason: 'cost' };
    this.pay(c);
    const refunded = this.levels.respec();
    if (this.hp > this.maxHp()) this.hp = this.maxHp();
    this.emit({ type: 'respec', refunded });
    return { ok: true, refunded };
  }
  skillCooldown(a: ActiveSkill): number { return Math.max(0, this.skillCd[a]); }
  /** 主動技能：沒學 / 死亡 / 睡覺 → false；冷卻中 → 發 cd 事件、false */
  useSkill(a: ActiveSkill): boolean { return this.withActor(this.local, () => this.useSkillCur(a)); }
  private useSkillCur(a: ActiveSkill): boolean {
    if (this.dead || this.sleepT !== null || !this.levels.has(ACTIVE_NODE[a])) return false;
    const p = this.player, cx = p.x + p.w / 2, fy = p.y + p.h;
    if (this.skillCd[a] > 0) { this.emit({ type: 'skill', skill: a, phase: 'cd', x: cx, y: fy, n: Math.ceil(this.skillCd[a]) }); return false; }
    let n = 0;
    if (a === 'dash') {
      this.dashDir = this.moveX !== 0 ? (this.moveX > 0 ? 1 : -1) : this.facing;
      this.facing = this.dashDir;
      this.dashT = DASH_TIME; this.dashEnd = true;
      this.iframes = Math.max(this.iframes, DASH_IFRAMES);
      this.knockT = 0;
      this.motion.climbing = false; this.motion.mantle = null; this.motion.jumpTimer = 0;
    } else if (a === 'slam') {
      if (p.onGround) this.slamShock(1);
      else {
        this.slamming = true; this.slamY = p.y;
        // 急墜前已經掉了多高（px）：落地時照算摔落傷害，只有急墜這一段免傷
        this.slamPre = this.fallPeak === null ? 0 : Math.max(0, p.y - this.fallPeak);
        p.vy = Math.max(p.vy, SLAM_DIVE); p.vx *= 0.3;
        this.motion.jumpTimer = 0; this.motion.climbing = false; this.motion.mantle = null;
        this.fallPeak = null;
      }
    } else n = this.pulseOres();
    this.skillCd[a] = SKILL_CD[a];
    this.emit({ type: 'skill', skill: a, phase: 'start', x: cx, y: fy, n });
    return true;
  }
  /** 物理之前：冷卻 / 感知倒數；突進中鎖住水平速度、不受重力；震地急墜 */
  private preMoveSkills(dt: number): void {
    for (const k of ['dash', 'slam', 'pulse'] as const) if (this.skillCd[k] > 0) this.skillCd[k] = Math.max(0, this.skillCd[k] - dt);
    if (this.orePulse) { this.orePulse.t -= dt; if (this.orePulse.t <= 0) this.orePulse = null; }
    const p = this.player;
    if (this.dashT > 0) {
      this.dashT -= dt;
      p.vx = this.dashDir * DASH_SPEED;
      p.vy = 0;
    }
    if (this.slamming) p.vy = Math.max(p.vy, SLAM_DIVE);
  }
  /** 物理之後：突進結束收掉多餘速度；震地落地 → 衝擊波（急墜越久威力越大），急墜那段不算摔落、急墜前的高度照算 */
  private postMoveSkills(): void {
    const p = this.player;
    if (this.dashEnd && this.dashT <= 0) {
      this.dashEnd = false;
      if (Math.abs(p.vx) > DASH_CARRY) p.vx = Math.sign(p.vx) * DASH_CARRY;
    }
    if (!this.slamming) return;
    // 急墜中：高度只記「急墜前」那段（落地時 updateFall 用它算傷害）
    this.fallPeak = this.slamPre > 0 ? p.y - this.slamPre : null;
    if (p.onGround) {
      this.slamming = false;
      this.slamShock(1 + Math.min(SLAM_DIVE_BONUS, Math.max(0, (p.y - this.slamY) / TILE_SIZE) / 20));
    } else if (this.motion.climbing || this.contact.frac > 0) { this.slamming = false; this.fallPeak = null; }
  }
  /** 衝擊波：腳邊 SLAM_RADIUS 格內的怪受傷、被往外震開 */
  private slamShock(power: number): void {
    const p = this.player, cx = p.x + p.w / 2, fy = p.y + p.h, R = SLAM_RADIUS * TILE_SIZE;
    const dmg = (SLAM_BASE + SLAM_PER_LEVEL * this.levels.level) * power * (this.stats().damageMul + this.furyBonus());
    let n = 0;
    for (const e of [...this.enemies]) {
      const b = e.body, ex = b.x + b.w / 2, ey = b.y + b.h / 2;
      if (Math.abs(ex - cx) > R || Math.abs(ey - (fy - 10)) > R * 0.8) continue;
      if (this.damageEnemy(e, dmg, SLAM_KB * power, 0, ex >= cx ? 1 : -1)) n++;
    }
    this.emit({ type: 'skill', skill: 'slam', phase: 'land', x: cx, y: fy, n });
  }
  /** 尋礦感知：半徑內的礦（近的優先，最多 PULSE_MAX 格）；回傳標到幾格 */
  private pulseOres(): number {
    const t = this.playerTile(), w = this.world, R = PULSE_RADIUS;
    const ores: { x: number; y: number; tile: number; d: number }[] = [];
    for (let y = t.y - R; y <= t.y + R; y++) {
      for (let x = t.x - R; x <= t.x + R; x++) {
        const d = (x - t.x) ** 2 + (y - t.y) ** 2;
        if (d > R * R || !w.inBounds(x, y)) continue;
        const id = w.getFg(x, y);
        if (ORE_TILES.has(id)) ores.push({ x, y, tile: id, d });
      }
    }
    ores.sort((a, b) => a.d - b.d);
    this.orePulse = { t: PULSE_TIME, max: PULSE_TIME, x: t.x, y: t.y, ores: ores.slice(0, PULSE_MAX).map(({ x, y, tile }) => ({ x, y, tile })) };
    return this.orePulse.ores.length;
  }
  /**
   * 背水（技能核心）：生命低於 FURY_BELOW 時的傷害加成（加在傷害倍率上）。和裝備 / 技能的傷害詞條共用 STAT_CAPS.dmg：
   * 詞條 + 技能已經到上限時就沒有額外加成。
   */
  private furyBonus(): number {
    const f = this.levels.totals().fury;
    if (f <= 0 || this.hp >= this.maxHp() * FURY_BELOW) return 0;
    return Math.max(0, Math.min(f, STAT_CAPS.dmg - this.stats().gear.dmg)) / 100;
  }
  /** 分解產量（拆解技能加成） */
  private salvageOut(g: Gear | undefined): Cost {
    const y = salvageYield(g), k = 1 + this.levels.totals().salvage / 100;
    return k === 1 ? y : { shard: Math.round(y.shard * k), dust: Math.round(y.dust * k) };
  }
  /** 鍛造成本（議價技能折扣；原本要的材料至少還是 1） */
  private forgeDiscount(c: Cost | null): Cost | null {
    const f = this.levels.totals().forge;
    if (!c || f <= 0) return c;
    const k = 1 - f / 100;
    return { shard: c.shard > 0 ? Math.max(1, Math.round(c.shard * k)) : 0, dust: c.dust > 0 ? Math.max(1, Math.round(c.dust * k)) : 0 };
  }

  // ── debug / e2e / 存檔還原 ─────────────────────────────
  /**
   * 轉生之藥：換成指定種族。同族或背包裡沒有藥 → false、什麼都不動；換成功才消耗 1 瓶（從背包找，不看選取格）。
   * 種族只能從這裡改（梳妝台 / 建角之後都不行）。
   */
  rebirth(race: number): boolean {
    const cur = this.appearance;
    if (!Number.isInteger(race) || race < 0 || race >= RACES.length || race === cur.race) return false;
    if (!this.inventory.remove('rebirth_potion', 1)) return false;
    this.appearance = normalizeAppearance({ ...cur, race });
    return true;
  }
  /** 換角色外觀（存一份正規化後的新物件） */
  setAppearance(a: Appearance): void { this.appearance = normalizeAppearance(a); }
  /**
   * 舊角色（cformat 1）的時裝轉換（spec C6，engine/wardrobeMigration.ts）：外觀上的服裝 / 頭飾 / 眼鏡變成時裝物品，
   * 能穿就穿上、否則進背包，背包滿就掉在腳邊（帶顏色、一件一個）；外觀改成布衣。看起來和轉換前一樣。
   * 只由 applyCharacter 在讀到舊角色時呼叫一次（存檔寫回 cformat 2，之後不再轉換）。
   */
  migrateWardrobe(): void {
    const v = this.vanity, e = this.equipment;
    const shown = (s: HideSlot): boolean => !v.hide[s] && pieceOf(e.getStack(s)) !== null;
    const plan = planWardrobeMigration(this.appearance, v.toJSON(), { head: shown('head'), body: shown('body'), legs: shown('legs') });
    for (const { slot, stack } of plan.equip) v.set(slot, stack.item, undefined, stack.tint);
    for (const st of plan.give) {
      if (this.inventory.add(st.item, 1, undefined, st.tint) > 0) {
        const pt = this.playerTile();
        this.dropAtTile(st.item, 1, pt.x, pt.y, st.tint);
      }
    }
    this.setAppearance(plan.appearance);
  }
  /**
   * 梳妝台：只改身體特徵與布衣配色（主色 / 副色）。種族只能用轉生之藥換；服裝 / 頭飾 / 眼鏡欄位維持原值（那些靠時裝物品）。
   */
  setBodyLook(a: Appearance): void {
    const cur = this.appearance;
    this.appearance = normalizeAppearance({ ...a, race: cur.race, outfit: cur.outfit, acc: cur.acc, glasses: cur.glasses });
  }

  /** 把玩家腳底放到 tile (tx, ty)（身體底 = (ty+1)*16），水平置中。先同步載入目的地周圍（ensureAround）再放人。 */
  teleport(tx: number, ty: number): void {
    this.ensureAround(tx);
    const p = this.player, w = this.world;
    // 夾在水平邊界內（傳送到 ±X_LIMIT 的邊欄：身體不卡進邊界外的實心牆，Review Focus 4）
    p.x = Math.max(w.xMin * TILE_SIZE, Math.min(w.xMax * TILE_SIZE - p.w, tx * TILE_SIZE + TILE_SIZE / 2 - p.w / 2));
    p.y = (ty + 1) * TILE_SIZE - p.h;
    p.vx = 0; p.vy = 0; p.gfxOffY = 0;
    this.motion.jumpTimer = 0;
    this.motion.climbing = false;
    this.motion.mantle = null;
    this.fallPeak = null;
    this.leaveBoat();
  }
  /** 立即挖掉一格（不檢查距離 / 等級），掉落物照常入背包。 */
  mineInstant(x: number, y: number): boolean { return this.breakTile(x, y, true); }
  give(item: ItemId, n = 1): number { return this.inventory.add(item, n); }
}

