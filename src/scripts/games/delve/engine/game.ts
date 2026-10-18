// game.ts — DelveGame：固定步長模擬（輸入 → 物理 → 挖掘/放置 → 時間）。不碰 DOM。
// render/input 層的典型用法：
//   game.setMoveX(-1|0|1); game.setJump(bool); game.setAim(tx, ty);
//   game.setMining(bool); game.setUse(bool); game.selectSlot(i);
//   while (acc >= FIXED_DT) { game.step(FIXED_DT); acc -= FIXED_DT; }
//   for (const ci of game.world.drainDirty()) redrawChunk(ci);
//   const light = game.computeLight(viewRectInTiles);
//   for (const e of game.drainEvents()) playSfx(e);
import { World } from './world';
import { generateWorld, type GenResult, type BiomeSegment, type Structure, type Landform, type ReservedZone, type GenLayers } from './worldgen';
import type { DungeonInfo } from './gen/dungeon';
type GenRelic = { x: number; y: number; item: ItemId; where: string };
import { T, W, TIER_UNBREAKABLE, tileDef, isSolidTile, isChestTile, isDoorTile, isInteractive, isBedTile, floorOk, ceilOk, ropeOk } from './tiles';
import { ITEMS, INFO_ACCESSORIES, type Accessory, type ItemDef, type ItemId, type PickStats, type WeaponDef, type WeaponKind } from './items';
import { potLoot, type Drop } from './loot';
import { Inventory, starterInventory, type Stack } from './inventory';
import { craft as craftRecipe, findRecipe, type CraftResult, type Station } from './crafting';
import { makeBody, stepPlayer, onPlatform, type Body, type MoveStats, type PlayerMotion } from './physics';
import { LightEngine, skyBrightness, type LightMap, type LightRect, type PointLight, type LightRGB } from './lighting';
import { skyColor, isNight as skyIsNight } from './sky';
import {
  START_TIME, dateOf, dayIndexOf, formatDate, moonPhase, nextSunrise, seasonOf, sunTimes, DAYS_PER_SEASON, DAYS_PER_YEAR,
  type GameDate, type Season, type SunTimes,
} from './calendar';
import { localWeather, weatherAt, weatherDim, type WeatherKind, type WeatherState } from './weather';
import { updateFreeze } from './frost';
import {
  POOL_COUNT_MAX, biteDelay, biteWindow, canFishIn, crateLoot, fishingPower, rollCatch, timeSlot, type DepthZone, type TimeSlot,
} from './fishing';
import { ExploredMap, toggleMarker, type MapMarker } from './explore';
import { Discovery, buildRegions, type Region, type RegionCat } from './discovery';
import { Equipment, EQUIP_SLOTS, type EquipSlot } from './equipment';
import {
  BASE_HP, BASE_MANA, LIFE_CORE_HP, MAX_HP_CAP, SAFE_FALL_TILES, computeStats, damageTaken, enemyDamage, fallDamage,
  knockbackScale, regenRate, rollCrit, type PlayerStats,
} from './combat';
import { DropList, LODESTONE_TILES, MAGNET_TILES, overlaps, popVelocity, type PhysEnv } from './entities';
import { LiquidSim, type ReactionKind, type SpringSpec } from './liquid';
import { LIQ, LIQ_MAX } from './liquidKind';
import { NO_CONTACT, liquidContact, liquidMedium, playerMedium, type LiquidContact } from './swim';
import { normalizeAppearance, type Appearance } from './appearance';
import { Vanity, type HideSlot, type VanitySlot } from './vanity';
import { buildDollLook, dollKey, type DollLook } from './doll';
import { ProjList, type HitFx, type ProjKind, type Projectile } from './projectiles';
import {
  ascendCost, ascendGear, baseTier, gearSlot, ilvlForDepth, rerollAffix, rerollCost, rollDropItem, rollGear, rollRarity,
  salvageYield, upgradeCost, upgradeGear, weaponDamage, affixDef, pickSpeed, MAX_PLUS, type AffixId, type Cost, type Gear, type GearTotals, type LootSource,
} from './gear';
import { Codex } from './codex';
import { ENEMIES, makeEnemy, stepEnemy, type AiCtx, type Enemy, type EnemyKind } from './enemies';
import {
  ACTIVE, BED_SAFE, DEFAULT_VIEW_HALF, DESPAWN, MAX_ENEMIES, NEAR_SPAWN_TILES, SPAWN_MAX, findSpot, habitatAt, homeNear, inHouse,
  isFirstNight, pickEntry, spawnCap, spawnChance, spawnInterval, spawnTable, type SpawnPressure,
} from './spawn';
import { Rng, type RngState } from './rng';
import { CALM_REGEN, Settlements, type SettleEvent, type SettleHost, type Npc } from './settlement';
import { NPCS, earn, forgeMul, npcLine, pay, shopPrice, walletOf, type NpcKind } from './npcs';
import { PAIR_OF_LEFT, PAIR_OF_RIGHT } from './furniture';
import { WALL_ITEM } from './items';
import {
  TILE_SIZE, CHUNK, FIXED_DT, REACH_TILES, STATION_RANGE, PLACE_COOLDOWN, DAY_LENGTH, HOTBAR_SIZE,
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
}

export type BlockReason = 'reach' | 'tier' | 'full' | 'body' | 'support' | 'occupied' | 'chest' | 'locked' | 'golden'
  /** 戰鬥：沒有箭 / 魔力不足 / 現在不能召喚首領 / 藥水冷卻中 / 生命已達上限 */
  | 'ammo' | 'mana' | 'summon' | 'potion' | 'maxlife'
  /** 床：附近有怪，不能睡 */
  | 'sleep'
  /** 釣魚：沒有魚餌；吃東西：血是滿的 */
  | 'bait' | 'full_hp'
  /** 據點：範圍和別的據點重疊；商店：錢不夠 / 背包滿 */
  | 'claim' | 'coins' | 'bagfull';
export type DelveEvent =
  | { type: 'mine'; x: number; y: number; tile: number; item: ItemId | null }
  | { type: 'place'; x: number; y: number; tile: number; item: ItemId }
  | { type: 'craft'; recipe: string; item: ItemId; n: number }
  | { type: 'blocked'; action: 'mine' | 'place' | 'use'; reason: BlockReason; x: number; y: number }
  | { type: 'select'; slot: number }
  | { type: 'chest'; open: boolean; x: number; y: number }
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
  | { type: 'travel'; from: number; to: number; x: number; y: number };

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
}

/** 徒手（背包沒有鎬）時的挖掘能力 */
const HAND: PickStats = { speed: 0.35, tier: 1 };
/** 同一個 blocked 提示重複出現的最短間隔（秒） */
const BLOCK_REPEAT = 1.8;
/** 傳送石引導時間（秒） */
export const RECALL_TIME = 1.2;
/** 磁石增加的伸手距離（格） */
export const MAGNET_REACH = 3;
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
export const MAX_BREATH = 10;
export const BREATH_STEP = 1.6;
export const BREATH_REFILL = 4;
/** 沒氣了：每 DROWN_EVERY 秒扣 DROWN_DMG（不看防禦、不給無敵時間） */
export const DROWN_DMG = 3;
export const DROWN_EVERY = 0.5;
/** 熔岩：碰到時的傷害（扣防禦、有無敵時間）+ 著火 BURN_TIME 秒（每 0.5 秒 BURN_DMG，不自然回血） */
export const LAVA_DMG = 30;
export const BURN_TIME = 7;
export const BURN_DMG = 2;
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
  /** 戰爭迷霧（存檔內容） */
  explored: ExploredMap;
  /** 發現 / 日誌（存檔內容） */
  discovery: Discovery;
  /** 使用者地圖標記（存檔內容） */
  markers: MapMarker[] = [];
  private tabletAt = new Map<number, number>();
  private lastTile = { x: -1, y: -1 };
  player: Body;
  inventory: Inventory;
  /** 角色外觀（存檔內容；換外觀用 setAppearance，換成新物件 → 渲染器以參考判斷要不要重烘精靈） */
  appearance: Readonly<Appearance>;
  /** 外觀欄（時裝）+ 防具隱藏開關（存檔內容） */
  vanity = new Vanity();
  private dollMemo: { sig: string; look: DollLook; key: string } | null = null;
  /** 遊戲內經過秒數（日夜循環用） */
  time = START_TIME;
  tick = 0;

  private motion: PlayerMotion = { jumpTimer: 0, jumpWasHeld: false, climbing: false };
  private moveX = 0;
  private jump = false;
  private upHeld = false;
  /** 床（重生點，床頭 tile）；存檔內容 */
  bed: { x: number; y: number } | null = null;
  /** 據點與居民（存檔內容） */
  readonly settle = new Settlements();
  /** 傳送石引導經過秒數；null = 沒在引導 */
  private recallT: number | null = null;
  /** 飾品快取（以背包裡的飾品簽名判斷是否要重算） */
  private accSig = '';
  private acc = new Set<Accessory>();
  private aim = { x: 0, y: 0 };
  private miningHeld = false;
  private dropHeld = false;
  private platformHinted = false;
  private useHeld = false;
  private placeCooldown = 0;
  /** 這次按住 use 已經用來開過箱子（按住不會一直重開 / 放置） */
  private useConsumed = false;
  /** 目前開著的箱子（tile 座標） */
  openChest: { x: number; y: number } | null = null;
  private mining: MiningState | null = null;
  private events: DelveEvent[] = [];
  private lastBlocked = '';
  private lastBlockedAt = -Infinity;
  private readonly lightEngine = new LightEngine();

  // ── 戰鬥狀態 ───────────────────────────────────────────
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
  /** 和平模式：不自然生成怪物（存檔內容；切到和平時清掉現有怪物） */
  private peacefulMode = false;
  /** 自動瞄準最近的怪物（觸控用） */
  autoAim = false;
  /** 已擊敗的首領（存檔內容） */
  readonly bossesDefeated = new Set<string>();
  /** 各種怪物擊殺數（存檔內容） */
  kills: Partial<Record<EnemyKind, number>> = {};
  readonly drops = new DropList();
  readonly projectiles = new ProjList();
  enemies: Enemy[] = [];
  /** 渲染端告知的視野半寬 / 半高（格）：生成點要在畫面外 */
  viewHalf = { ...DEFAULT_VIEW_HALF };
  facing: 1 | -1 = 1;
  attack: AttackState | null = null;
  private nextEnemyId = 1;
  private swingId = 0;
  private attackCd = 0;
  private iframes = 0;
  private sinceHit = 99;
  private knockT = 0;
  private fallPeak: number | null = null;
  private potionCd = 0;
  private manaDelay = 0;
  private spawnT = SPAWN_GRACE;
  /** 距上次喘息（新世界 / 讀檔 / 重生）的秒數：生成間隔由慢漸快（spawn.spawnInterval） */
  private spawnCalm = 0;
  private readonly spawnRng: Rng;
  private readonly combatRng: Rng;
  private aimPx = { x: 0, y: 0 };
  private statsEq: Equipment | null = null;
  private statsCache: PlayerStats = computeStats(new Equipment());
  // ── 液體 ───────────────────────────────────────────────
  /** 液體模擬（world.liquid / liquidType） */
  readonly liquids: LiquidSim;
  /** 實體物理環境：world 的碰撞 + 液體介質 / 接觸（掉落物、怪物用） */
  readonly env: PhysEnv;
  /** 玩家這一刻和液體的接觸 */
  contact: LiquidContact = NO_CONTACT;
  breath = MAX_BREATH;
  private drownT = 0;
  burning = 0;
  private burnTick = 0;
  honeyT = 0;
  private wasWet = 0;
  // ── 曆法 / 天氣 ───────────────────────────────────────
  /** 強制天氣（debug / e2e；存檔內容）：until = 到這個遊戲時間為止 */
  weatherOverride: { kind: WeatherKind; until: number } | null = null;
  /** 上一刻的天數（換日偵測：結冰 / 融化） */
  private lastDay = -1;
  /** 睡覺經過秒數；null = 沒在睡 */
  private sleepT: number | null = null;
  private sleepSkipped = false;
  private boltT = 4;
  private flashT = 0;
  private rainT = 0;
  private readonly weatherRng: Rng;
  private wxCache: { tick: number; time: number; g: WeatherState; local: WeatherState } | null = null;
  // ── 釣魚 ───────────────────────────────────────────────
  /** 進行中的釣魚（浮標）；null = 沒在釣 */
  fishing: FishingState | null = null;
  /** 釣魚紀錄：每種魚釣到幾條（存檔內容） */
  fishLog: Partial<Record<ItemId, number>> = {};
  private readonly fishRng: Rng;
  private foodCd = 0;
  private miningWas = false;
  /** 玩家敲開的冰洞（tile index；存檔內容）：到那一欄融化的季節前不會再結冰 */
  readonly minedIce = new Set<number>();
  // ── 裝備詞條 ───────────────────────────────────────────
  /** 裝備圖鑑（存檔內容） */
  codex = new Codex();
  /** 掉寶 / 合成 / 鍛造的亂數 */
  private readonly lootRng: Rng;
  /** 不滅冷卻（秒） */
  undyingCd = 0;
  /** debug / e2e：怪物掉裝備的機率（null = 正常） */
  debugGearChance: number | null = null;
  private statsKey = '';
  private statsRefs: unknown[] = [];
  private statsDirty = 0;

  constructor(opts: DelveOptions = {}) {
    this.seed = String(opts.seed ?? 'delve');
    this.appearance = normalizeAppearance(opts.appearance);
    // 預先生成的世界只在大小對得上時採用（seed 由呼叫端保證）
    const pre = opts.gen && (opts.width === undefined || opts.gen.world.width === opts.width) && (opts.height === undefined || opts.gen.world.height === opts.height) ? opts.gen : null;
    const gen = pre ?? generateWorld(this.seed, { width: opts.width, height: opts.height });
    this.world = gen.world;
    this.liquids = new LiquidSim(this.world);
    this.liquids.blocked = (x, y) => !this.dead && this.tileOverlapsPlayer(x, y);
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
    this.dungeon = gen.dungeon;
    this.tablets = gen.tablets;
    this.relics = gen.relics;
    for (const t of gen.tablets) this.tabletAt.set(this.world.idx(t.x, t.y), t.id);
    this.regions = buildRegions({
      seed: this.seed, width: this.world.width, height: this.world.height, spawn: gen.spawn,
      surface: this.world.surface, layers: gen.layers, biomes: gen.biomes, structures: gen.structures, dungeon: gen.dungeon,
    });
    this.explored = new ExploredMap(this.world.width, this.world.height);
    this.discovery = new Discovery(this.regions, { loreTotal: gen.tablets.length });
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

  // ── 輸入 ───────────────────────────────────────────────
  setMoveX(v: number): void { this.moveX = Math.max(-1, Math.min(1, v)); }
  setJump(held: boolean): void { this.jump = held; }
  /** 按住「上」（W / ↑）：在繩索上往上爬，否則等同跳躍 */
  setUp(held: boolean): void { this.upHeld = held; }
  /** 按住「下」：穿過單向平台 */
  setDrop(held: boolean): void { this.dropHeld = held; }
  /** 游標所指 tile 座標 */
  setAim(tx: number, ty: number): void {
    const x = Math.floor(tx), y = Math.floor(ty);
    // 精確瞄準點（px）：整數 tile 座標視為格子中心
    this.aimPx = { x: (Number.isInteger(tx) ? tx + 0.5 : tx) * TILE_SIZE, y: (Number.isInteger(ty) ? ty + 0.5 : ty) * TILE_SIZE };
    if (x !== this.aim.x || y !== this.aim.y) { this.aim = { x, y }; this.mining = null; this.lastBlocked = ''; }
  }
  /** 目前瞄準的 tile（不配置新物件，每幀查詢用） */
  aimTile(): Readonly<{ x: number; y: number }> { return this.aim; }
  /** 游標所指世界 px 座標（renderer 換算好鏡頭偏移後傳入） */
  setAimWorld(px: number, py: number): void { this.setAim(px / TILE_SIZE, py / TILE_SIZE); }
  setMining(held: boolean): void { this.miningHeld = held; if (!held) this.mining = null; }
  setUse(held: boolean): void {
    this.useHeld = held;
    if (!held) { this.placeCooldown = 0; this.useConsumed = false; }
  }
  selectSlot(i: number): void {
    const before = this.inventory.selected;
    this.inventory.select(i);
    if (this.inventory.selected !== before) this.events.push({ type: 'select', slot: this.inventory.selected });
  }

  // ── 模擬 ───────────────────────────────────────────────
  step(dt: number = FIXED_DT): void {
    this.tick++;
    this.time += dt;
    const day = dayIndexOf(this.time);
    if (day !== this.lastDay) this.onNewDay(day);
    if (this.flashT > 0) this.flashT -= dt;
    this.liquids.step();
    for (const e of this.liquids.drainEvents()) this.events.push({ type: 'liquid', kind: e.kind, x: e.x, y: e.y });
    if (this.dead) {
      this.updateDeath(dt);
      this.updateEntities(dt);
      this.updateSettlements(dt);
      return;
    }
    if (this.sleepT !== null) { this.updateSleep(dt); this.updateSettlements(dt); return; }
    const knocked = this.knockT > 0;
    this.contact = liquidContact(this.world, this.player);
    const air0 = this.motion.airUsed ?? 0, climb0 = Boolean(this.motion.climbing), mantle0 = this.motion.mantle ?? null;
    stepPlayer(this.world, this.player, this.motion, { moveX: knocked ? 0 : this.moveX, jump: !knocked && this.jump, drop: this.dropHeld, up: !knocked && this.upHeld }, dt, this.moveStats(), playerMedium(this.contact));
    if ((this.motion.airUsed ?? 0) > air0) { const pl = this.player; this.events.push({ type: 'airjump', x: pl.x + pl.w / 2, y: pl.y + pl.h }); this.fallPeak = null; }
    {
      const pl = this.player, mt = this.motion.mantle ?? null;
      if (mt && mt !== mantle0) this.events.push({ type: 'climb', phase: 'mantle', x: mt.edgeX, y: mt.edgeY });
      else if (!mt && mantle0) this.events.push({ type: 'climb', phase: 'top', x: pl.x + pl.w / 2, y: pl.y + pl.h });
      if (this.motion.climbing && !climb0) this.events.push({ type: 'climb', phase: 'grab', x: pl.x + pl.w / 2, y: pl.y + 10 });
    }
    this.contact = liquidContact(this.world, this.player);
    this.updateFall();
    this.updateLiquid(dt);
    this.updateVitals(dt);
    this.updateWeatherFx(dt);
    this.updateRecall(dt);
    this.updateExploration();
    if (!this.platformHinted && this.player.onGround && !this.dropHeld && onPlatform(this.world, this.player)) {
      this.platformHinted = true;
      this.events.push({ type: 'hint', id: 'platform' });
    }
    if (this.attackCd > 0) this.attackCd -= dt;
    const weapon = this.heldWeapon();
    const rodHeld = this.heldRod() !== null;
    // 拿著釣竿：主按鍵（觸控的點擊）也是拋竿 / 收竿（按下那一刻）
    if (this.miningHeld && rodHeld) { if (!this.miningWas) this.fishAction(); }
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
    if (this.useHeld && this.placeCooldown <= 0) {
      const { x, y } = this.aim;
      const held = this.inventory.selectedStack();
      const use = held ? ITEMS[held.item].use : undefined;
      const npc = this.useConsumed ? null : this.settle.npcAtPx(this.aimPx.x, this.aimPx.y);
      if (npc && this.canReach(Math.floor((npc.body.x + npc.body.w / 2) / TILE_SIZE), Math.floor((npc.body.y + npc.body.h / 2) / TILE_SIZE), this.reach() + 1)) {
        this.useConsumed = true; this.talkTo(npc);
      } else if (isInteractive(this.world.getFg(x, y))) {
        if (!this.useConsumed) { this.useConsumed = true; this.interact(x, y); }
      } else if (use === 'hammer') {
        if (!this.useConsumed) { this.useConsumed = true; this.hammer(x, y); }
      } else if (use === 'recall') {
        if (!this.useConsumed) { this.useConsumed = true; this.startRecall(); }
      } else if (use === 'fish') {
        if (!this.useConsumed) { this.useConsumed = true; this.fishAction(); }
      } else if (use === 'scoop' || use === 'pour' || use === 'sponge') {
        if (this.useLiquidTool(use, x, y)) this.placeCooldown = LIQUID_TOOL_CD;
      } else if (use) {
        if (!this.useConsumed) { this.useConsumed = true; this.consume(use); }
      } else if (!this.useConsumed && this.tryPlace(x, y)) this.placeCooldown = PLACE_COOLDOWN;
    }
    this.updateEntities(dt);
    this.updateSettlements(dt);
    if (this.openChest) {
      const { x, y } = this.openChest;
      if (!isChestTile(this.world.getFg(x, y)) || !this.canReach(x, y, this.reach() + 1.5)) this.closeChest();
    }
  }

  private updateMining(dt: number): void {
    const { x, y } = this.aim;
    const id = this.world.getFg(x, y);
    if (id === T.AIR && this.world.inBounds(x, y) && this.world.frozen[this.world.idx(x, y)]) { this.mineIce(x, y, dt); return; }
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
    w.frozen[i] = 0;
    this.minedIce.add(i);
    w.touchLiquid(i);
    this.liquids.wake(x, y);
    this.events.push({ type: 'mine', x, y, tile: T.ICE, item: null });
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
        this.events.push({ type: 'spawn', set: false, x: this.spawn.x, y: this.spawn.y });
      }
      if (tid === T.HEARTH) {
        const lost = this.settle.coreAt(tx, ty);
        if (lost && this.settle.spawnCore === lost.id) this.events.push({ type: 'spawn', set: false, x: this.spawn.x, y: this.spawn.y });
        this.settle.remove(tx, ty);
      }
      const bug = this.baitDrop(tid);
      // 脈鳴（鎬的傳奇詞條）：礦石有機率加倍
      const ap = this.activePick();
      const vein = ORE_TILES.has(tid) ? (ap?.gear?.affixes.find((a) => a.id === 'veinsong')?.value ?? 0) : 0;
      const got = vein > 0 && this.lootRng.next() * 100 < vein ? drops.map((d) => ({ item: d.item, n: d.n * 2 })) : drops;
      for (const d of bug ? [...got, { item: bug, n: 1 }] : got) {
        const left = direct ? this.inventory.add(d.item, d.n) : d.n;
        if (left > 0) this.dropAtTile(d.item, left, tx, ty);
      }
      this.events.push({ type: 'mine', x: tx, y: ty, tile: tid, item: drops.length ? drops[0].item : null });
    }
    return true;
  }

  /** 在 tile (tx,ty) 中心丟出掉落物（彈出方向由座標雜湊決定，確定性） */
  private dropAtTile(item: ItemId, n: number, tx: number, ty: number): void {
    const h = ((Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663)) >>> 0) % 1000;
    const v = popVelocity(h / 1000, ((h * 7) % 1000) / 1000);
    this.drops.spawn(item, n, (tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE, v.vx, v.vy * 0.7);
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
      this.events.push({ type: 'unlock', x, y: top, item: 'dungeon_key' });
      this.events.push({ type: 'door', open: true, x, y: top, unlocked: true });
      return true;
    }
    const open = id === T.DOOR_CLOSED;
    if (!open) {
      for (let ty = top; ty <= bot; ty++) if (this.tileOverlapsPlayer(x, ty)) { this.block('use', 'body', x, y); return false; }
    }
    for (let ty = top; ty <= bot; ty++) w.setFg(x, ty, open ? T.DOOR_OPEN : T.DOOR_CLOSED);
    this.events.push({ type: 'door', open, x, y: top, unlocked: false });
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
    this.events.push({ type: 'place', x, y: y - 2, tile: T.DOOR_CLOSED, item });
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
    this.events.push({ type: 'place', x, y, tile: pair.left, item });
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
    this.events.push({ type: 'place', x, y: ty, tile: T.ROPE, item });
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
    this.events.push({ type: 'place', x, y, tile: T.AIR, item });
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
    this.events.push({ type: 'mine', x, y, tile: T.PLANKS, item });
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
      this.events.push({ type: 'mine', x, y, tile: cur, item: null });
    }
    this.world.setFg(x, y, place);
    this.inventory.takeFromSlot(this.inventory.selected, 1);
    this.events.push({ type: 'place', x, y, tile: place, item: stack.item });
    if (place === T.HEARTH) { this.settle.found(x, y); for (const e of this.settle.drainEvents()) this.events.push(e); }
    return true;
  }

  private tileOverlapsPlayer(x: number, y: number): boolean {
    const p = this.player, S = TILE_SIZE;
    return p.x < (x + 1) * S && p.x + p.w > x * S && p.y < (y + 1) * S && p.y + p.h > y * S;
  }

  private block(action: 'mine' | 'place' | 'use', reason: BlockReason, x: number, y: number): void {
    const key = `${action}:${reason}:${x}:${y}`;
    // 同一格同原因只提示一次；換瞄準格（setAim 清掉）或超過 BLOCK_REPEAT 秒後可再提示
    if (key === this.lastBlocked && this.time - this.lastBlockedAt < BLOCK_REPEAT) return;
    this.lastBlocked = key;
    this.lastBlockedAt = this.time;
    this.events.push({ type: 'blocked', action, reason, x, y });
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
    return st ? { speed: pickSpeed(st.item, st.gear), tier: ITEMS[st.item].pick!.tier } : HAND;
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
  moveStats(): MoveStats {
    const g = this.stats().gear;
    return {
      runMul: (this.hasAccessory('run') ? 1.45 : 1) * (1 + g.move / 100),
      // 跳躍高度約與初速平方成正比：+X% 高度 ≈ 初速 × √(1 + X%)
      jumpMul: (this.hasAccessory('jump') ? 1.25 : 1) * Math.sqrt(1 + g.jump / 100),
      airJumps: g.djump > 0 ? 1 : 0,
    };
  }
  /** 伸手距離（格）：磁石 +3 */
  reach(): number { return REACH_TILES + (this.hasAccessory('magnet') ? MAGNET_REACH : 0); }
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
    const key = `${this.equipment.uid}:${this.equipment.version}:${this.statsDirty}`;
    const refs = [weapon, weapon?.gear, pick, pick?.gear];
    if (key !== this.statsKey || this.statsEq !== this.equipment || refs.some((r, i) => r !== this.statsRefs[i])) {
      this.statsKey = key; this.statsEq = this.equipment; this.statsRefs = refs;
      this.statsCache = computeStats(this.equipment, [weapon, pick]);
    }
    return this.statsCache;
  }
  /** 詞條在原處被改了（鍛造 / 鎖定）→ 數值重算 */
  invalidateStats(): void { this.statsDirty++; }
  maxHp(): number { return Math.min(MAX_HP_CAP, this.baseMaxHp) + this.stats().maxHpBonus; }
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
        this.events.push({ type: 'discover', region: { id: r.id, name: r.name, cat: r.cat, kind: r.kind } });
      }
    }
    if (this.tick % 20 === 0) {
      for (const st of this.inventory.slots) {
        if (st && ITEMS[st.item].unique && this.discovery.gainTreasure(st.item)) this.events.push({ type: 'treasure', item: st.item });
      }
      for (const it of this.equipment.items()) {
        if (ITEMS[it].unique && this.discovery.gainTreasure(it)) this.events.push({ type: 'treasure', item: it });
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
  /** 重生點（腳底 tile）：床還在 → 床頭那格；否則出生點 */
  respawnPoint(): { x: number; y: number } {
    const hc = this.settle.spawnCore !== null ? this.settle.coreById(this.settle.spawnCore) : null;
    if (hc && this.world.getFg(hc.x, hc.y) === T.HEARTH) return { x: hc.x + 1, y: hc.y };
    const b = this.bed;
    if (b && this.world.getFg(b.x, b.y) === T.BED_HEAD) return { x: b.x, y: b.y };
    return { x: this.spawn.x, y: this.spawn.y };
  }
  private useBed(x: number, y: number): boolean {
    const hx = this.world.getFg(x, y) === T.BED_FOOT ? x - 1 : x;
    if (this.world.getFg(hx, y) !== T.BED_HEAD) return false;
    this.bed = { x: hx, y };
    this.settle.spawnCore = null;
    this.events.push({ type: 'spawn', set: true, x: hx, y });
    if (this.isNight()) this.trySleep(hx, y);
    return true;
  }
  /** 晚上躺上床：附近沒有怪 → 開始睡（淡出 → 跳到日出 → 淡入）；有怪 → 提示 */
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
    this.sleepT = 0; this.sleepSkipped = false;
    this.mining = null; this.miningHeld = false; this.attack = null;
    this.recallT = null;
    this.closeChest();
    this.player.vx = 0;
    this.events.push({ type: 'sleep', phase: 'start' });
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
      // 睡飽：回滿血、怪物生成重新從慢開始
      this.hp = this.maxHp();
      this.spawnCalm = 0;
      this.spawnT = Math.max(this.spawnT, 4);
    }
    if (this.sleepT >= SLEEP_FADE * 2) {
      this.sleepT = null;
      this.events.push({ type: 'sleep', phase: 'wake' });
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
    this.events.push({ type: 'recall', phase: 'start', x: r.x, y: r.y });
  }
  private updateRecall(dt: number): void {
    if (this.recallT === null) return;
    const r = this.respawnPoint();
    if (this.moveX !== 0 || this.jump || this.upHeld) {
      this.recallT = null;
      this.events.push({ type: 'recall', phase: 'cancel', x: r.x, y: r.y });
      return;
    }
    this.recallT += dt;
    if (this.recallT + 1e-9 >= RECALL_TIME) {
      this.recallT = null;
      this.teleport(r.x, r.y);
      this.closeChest();
      this.events.push({ type: 'recall', phase: 'done', x: r.x, y: r.y });
    }
  }

  // ── 查詢 ───────────────────────────────────────────────
  /** 玩家中心（px） */
  playerCenter(): { x: number; y: number } {
    return { x: this.player.x + this.player.w / 2, y: this.player.y + this.player.h / 2 };
  }
  /** 玩家中心所在 tile */
  playerTile(): { x: number; y: number } {
    const c = this.playerCenter();
    return { x: Math.floor(c.x / TILE_SIZE), y: Math.floor(c.y / TILE_SIZE) };
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
      workbench: has(T.WORKBENCH), furnace: has(T.FURNACE),
      anvil: has(T.ANVIL) || this.nearNpc('smith'),
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
    const c = this.wxCache;
    if (c && c.tick === this.tick && c.time === this.time) return c;
    const o = this.weatherOverride;
    let g: WeatherState;
    if (o && this.time < o.until) g = { kind: o.kind, intensity: 1, wind: FORCED_WIND[o.kind] };
    else {
      if (o) this.weatherOverride = null;
      g = weatherAt(this.seed, this.time);
    }
    const f = this.feetTile();
    const local = { ...g, kind: localWeather(g.kind, this.world.biomeAt(f.x)) };
    this.wxCache = { tick: this.tick, time: this.time, g, local };
    return this.wxCache;
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
  private onNewDay(day: number): void {
    this.lastDay = day;
    updateFreeze(this.world, this.liquids, day, (x, y) => !this.dead && this.tileOverlapsPlayer(x, y), this.minedIce);
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
        const bx = Math.max(0, Math.min(w.width - 1, f.x + Math.round((r.next() * 2 - 1) * 40)));
        if (nearSurface) {
          this.flashT = FLASH_TIME;
          this.wxCache = null;
          this.events.push({ type: 'lightning', x: bx, y: w.surfaceAt(bx), dist: Math.abs(bx - f.x) });
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
    if (x < 0 || x >= w.width) return;
    const surf = w.surfaceAt(x);
    for (let y = Math.max(0, surf - 64); y <= Math.min(w.height - 1, surf + 12); y++) {
      const i = w.idx(x, y);
      if (isSolidTile(w.fg[i]) || w.frozen[i]) return;
      const a = w.liquid[i];
      if (!a) continue;
      if (w.liquidType[i] !== LIQ.WATER || w.wall[i] !== 0 || a >= RAIN_TOP) return;
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
    const make = (item: ItemId): Gear | undefined => (gearSlot(item) ? this.rollFor(item, 'craft', 0, baseTier(item)) : undefined);
    const r = craftRecipe(this.inventory, recipeId, { nearWorkbench: st.workbench, nearFurnace: st.furnace, nearAnvil: st.anvil, nearCampfire: st.campfire }, make);
    if (r.ok) {
      const out = findRecipe(recipeId)?.out;
      if (out) this.events.push({ type: 'craft', recipe: recipeId, item: out.item, n: out.n });
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
      if (c) this.events.push({ type: 'hearth', id: c.id, x, y });
      return Boolean(c);
    }
    if (id === T.LORE_TABLET) {
      const lid = this.tabletId(x, y);
      this.events.push({ type: 'lore', id: lid, x, y, first: this.discovery.readLore(lid) });
      return true;
    }
    if (id === T.LOCKED_CHEST && !w.unlocked.has(w.idx(x, y))) {
      if (!this.inventory.has('golden_key', 1)) { this.block('use', 'golden', x, y); return false; }
      this.inventory.remove('golden_key', 1);
      w.unlocked.add(w.idx(x, y));
      w.keysUsed++;
      w.markModified(x, y);
      this.events.push({ type: 'unlock', x, y, item: 'golden_key' });
    }
    if (this.openChest && this.openChest.x === x && this.openChest.y === y) return true;
    if (this.openChest) this.closeChest();
    this.openChest = { x, y };
    this.events.push({ type: 'chest', open: true, x, y });
    return true;
  }
  closeChest(): void {
    if (!this.openChest) return;
    const { x, y } = this.openChest;
    this.openChest = null;
    this.events.push({ type: 'chest', open: false, x, y });
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
    const left = this.inventory.add(st.item, st.count, st.gear);
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
    if (st.gear) {
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
    const night = Math.max(this.hasAccessory('night') ? 0.78 : 0, Math.min(1, this.stats().gear.light / 100));
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

  drainEvents(): DelveEvent[] {
    const out = this.events;
    this.events = [];
    return out;
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
    return { x: p.x + p.w / 2 + this.facing * 2, y: p.y + p.h - 26 };
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
    const dmg = (base: number): number => base * st.damageMul;
    const crit = w.crit + st.crit;
    switch (w.kind) {
      case 'bow': {
        const ammo = this.findAmmo();
        if (!ammo) { this.block('use', 'ammo', this.aim.x, this.aim.y); this.attackCd = 0.3; return; }
        this.inventory.remove(ammo, 1);
        const ad = ITEMS[ammo].ammo!;
        const sp = w.speed ?? 500;
        this.projectiles.spawn('arrow', false, ox, oy, ux * sp, uy * sp, {
          damage: dmg(w.damage + ad.damage), knockback: w.knockback, crit, life: 3, gravity: 420, pierce: 1, flame: ad.flame, item: ammo, fx,
        });
        break;
      }
      case 'throw': {
        this.inventory.takeFromSlot(this.inventory.selected, 1);
        const sp = w.speed ?? 500;
        this.projectiles.spawn('knife', false, ox, oy, ux * sp, uy * sp, { damage: dmg(w.damage), knockback: w.knockback, crit, life: 2.5, gravity: 520, pierce: 1, item, fx });
        break;
      }
      case 'boomerang': {
        if (this.projectiles.list.some((p) => p.kind === 'boomerang' && !p.hostile)) return;
        const sp = w.speed ?? 440;
        this.projectiles.spawn('boomerang', false, ox, oy, ux * sp, uy * sp, { damage: dmg(w.damage), knockback: w.knockback, crit, life: 4, pierce: 99, item, fx });
        break;
      }
      case 'staff': {
        const cost = w.mana ?? 0;
        if (this.mana < cost) { this.block('use', 'mana', this.aim.x, this.aim.y); this.attackCd = 0.3; return; }
        this.mana -= cost; this.manaDelay = 0.9;
        const sp = w.speed ?? 480;
        this.projectiles.spawn('bolt', false, ox, oy, ux * sp, uy * sp, { damage: dmg(w.damage), knockback: w.knockback, crit, life: 1.4, pierce: 1, item, fx });
        break;
      }
      default:
        if (w.wave) {
          const sp = w.speed ?? 420;
          this.projectiles.spawn('wave', false, ox, oy, ux * sp, uy * sp, { damage: dmg(w.damage * 0.6), knockback: w.knockback * 0.5, crit, life: 0.55, pierce: 3, item, fx });
        }
    }
    this.swingId++;
    this.attack = { item, kind: w.kind, t: 0, dur: w.useTime, angle, dir: this.facing, id: this.swingId, dmg: dmg(w.damage), kb: w.knockback, fx };
    this.attackCd = w.useTime;
    this.events.push({ type: 'attack', item, kind: w.kind });
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
    this.events.push({ type: 'hit', id: e.id, kind: e.kind, x: e.body.x + e.body.w / 2, y: e.body.y, amount, crit });
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
      this.events.push({ type: 'chain', pts });
    }
  }
  /** 回血（show = 飄綠字） */
  private healBy(v: number, show: boolean): void {
    const before = this.hp;
    this.hp = Math.min(this.maxHp(), this.hp + v);
    const got = this.hp - before;
    if (show && got >= 1) { const p = this.player; this.events.push({ type: 'heal', amount: Math.round(got), x: p.x + p.w / 2, y: p.y }); }
  }
  /** debug：直接扣血（不看防禦 / 不擊退） */
  debugDamage(id: number, amount: number): boolean {
    const e = this.enemies.find((q) => q.id === id);
    if (!e) return false;
    e.hp -= amount; e.flash = 0.14;
    if (e.state === 'shatter') e.hp = Math.max(1, e.hp);
    this.events.push({ type: 'hit', id: e.id, kind: e.kind, x: e.body.x + e.body.w / 2, y: e.body.y, amount, crit: false });
    if (e.hp <= 0) this.killEnemy(e);
    return true;
  }

  private killEnemy(e: Enemy): void {
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
    this.events.push({ type: 'kill', id: e.id, kind: e.kind, x: cx, y: cy });
    // 裝備：一般怪機率掉一件（越深等級越高）；首領必掉
    const depth = this.depthFrac(Math.floor(cx / TILE_SIZE), Math.floor(cy / TILE_SIZE));
    const chance = this.debugGearChance ?? GEAR_DROP_CHANCE * (1 + luck / 100);
    if (!def.boss && !def.minion && this.lootRng.next() < chance) {
      const ilvl = ilvlForDepth(depth), item = rollDropItem(this.lootRng, ilvl);
      this.spawnGearDrop(item, this.rollFor(item, 'enemy', depth, ilvl), cx, cy);
    }
    if (def.boss) {
      for (const it of BOSS_DROPS) {
        if (gearSlot(it.item)) this.spawnGearDrop(it.item, this.rollFor(it.item, 'boss', 1, 5), cx, cy);
        else drop(it.item, it.n);
      }
      for (let k = 0; k < BOSS_GEAR; k++) { const item = rollDropItem(this.lootRng, 5); this.spawnGearDrop(item, this.rollFor(item, 'boss', 1, 5), cx, cy); }
      this.bossesDefeated.add(e.kind);
      this.enemies = this.enemies.filter((q) => !ENEMIES[q.kind].minion);
      for (const p of this.projectiles.list) if (p.hostile) p.life = 0;
      this.events.push({ type: 'boss', phase: 'defeated', kind: e.kind });
    }
  }

  /** 玩家受傷（原始傷害，扣防禦）；srcX = 傷害來源 x（擊退方向）。回傳是否有受傷 */
  hurtPlayer(raw: number, srcX: number): boolean {
    if (this.dead || this.iframes > 0) return false;
    const amount = damageTaken(raw, this.stats().defense);
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
    this.iframes = fall ? 0.4 : IFRAMES;
    this.sinceHit = 0;
    this.events.push({ type: 'hurt', x: p.x + p.w / 2, y: p.y, amount, fall, ...(cause ? { cause } : {}) });
    if (this.recallT !== null) { const r = this.respawnPoint(); this.recallT = null; this.events.push({ type: 'recall', phase: 'cancel', x: r.x, y: r.y }); }
    if (this.hp <= 0 && !this.tryUndying()) this.die();
  }
  /** 不滅：致命傷時以 1 點生命撐住（冷卻 = 詞條秒數）。回傳是否撐住 */
  private tryUndying(): boolean {
    const cd = this.stats().gear.undying;
    if (cd <= 0 || this.undyingCd > 0) return false;
    this.hp = 1; this.undyingCd = cd; this.iframes = Math.max(this.iframes, 1.5);
    const p = this.player;
    this.events.push({ type: 'undying', x: p.x + p.w / 2, y: p.y });
    return true;
  }

  private die(): void {
    const p = this.player, cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    this.dead = true; this.hp = 0; this.respawnT = RESPAWN_TIME;
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
    this.events.push({ type: 'death', x: cx, y: cy });
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
    this.events.push({ type: 'respawn', x: r.x, y: r.y });
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
      const dmg = fallDamage(tiles, SAFE_FALL_TILES + (this.hasAccessory('jump') ? 8 : 0));
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
      + (this.calm() ? CALM_REGEN : 0);
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
        this.events.push({ type: 'splash', x: p.x + p.w / 2, y: surf, liquid: entering ? wetType : this.wasWet, big: Math.abs(p.vy) > 250 });
      }
      this.wasWet = wetType;
    }
    // 呼吸：頭在水 / 蜂蜜下就消耗；沒氣了開始溺水
    if (c.head && (c.type === LIQ.WATER || c.type === LIQ.HONEY)) {
      const before = Math.ceil(this.breath);
      this.breath = Math.max(0, this.breath - dt / BREATH_STEP);
      const now = Math.ceil(this.breath);
      if (now < before) this.events.push({ type: 'bubble', left: now });
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
        this.applyDamage(damageTaken(LAVA_DMG, this.stats().defense), false, 'lava');
        if (this.dead) return;
        p.vy = Math.min(p.vy, -280); p.onGround = false;
        this.motion.jumpTimer = 0; this.motion.climbing = false; this.motion.mantle = null;
      }
    }
    if (ward || (c.type === LIQ.WATER && c.frac > 0.25)) this.burning = 0;
    if (this.burning > 0) {
      this.burning -= dt;
      this.burnTick -= dt;
      if (this.burnTick <= 0) { this.burnTick = 0.5; this.tickDamage(BURN_DMG, 'burn'); if (this.dead) return; }
    } else { this.burning = 0; this.burnTick = 0; }
    // 蜂蜜：泡過之後一段時間多回血
    if (c.type === LIQ.HONEY && c.frac > 0) this.honeyT = HONEY_TIME;
    else if (this.honeyT > 0) this.honeyT = Math.max(0, this.honeyT - dt);
  }

  /** 持續傷害（溺水 / 燃燒）：不看防禦、不給無敵時間、不擊退 */
  private tickDamage(amount: number, cause: 'drown' | 'burn'): void {
    const p = this.player;
    this.hp -= amount;
    this.sinceHit = 0;
    this.events.push({ type: 'hurt', x: p.x + p.w / 2, y: p.y, amount, fall: false, cause });
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
      this.events.push({ type: 'liquidtool', action: 'scoop', liquid: t, x, y });
      return true;
    }
    if (use === 'pour') {
      const t = ITEMS[st.item].liquid ?? LIQ.WATER;
      if (!this.liquids.pour(x, y, t, LIQ_MAX)) { this.block('place', this.tileOverlapsPlayer(x, y) ? 'body' : 'occupied', x, y); return false; }
      this.inventory.takeFromSlot(sel, 1);
      const left = this.inventory.add('bucket', 1);
      if (left > 0) this.dropAtTile('bucket', left, pt.x, pt.y);
      this.events.push({ type: 'liquidtool', action: 'pour', liquid: t, x, y });
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
    this.events.push({ type: 'liquidtool', action: 'sponge', liquid: kind, x, y });
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
    this.events.push({ type: 'hit', id: e.id, kind: e.kind, x: cx, y: b.y, amount: dmg, crit: false });
    if (def.fire) this.events.push({ type: 'liquid', kind: 'steam', x: Math.floor(cx / TILE_SIZE), y: Math.floor(cy / TILE_SIZE) });
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
      this.events.push({ type: 'lifeup', maxHp: this.maxHp() });
    } else if (use === 'heal') {
      if (this.potionCd > 0 || this.hp >= this.maxHp()) { this.block('use', 'potion', x, y); return; }
      this.inventory.takeFromSlot(this.inventory.selected, 1);
      const before = this.hp;
      this.hp = Math.min(this.maxHp(), this.hp + POTION_HEAL);
      this.potionCd = POTION_COOLDOWN;
      this.events.push({ type: 'heal', amount: Math.round(this.hp - before), x: p.x + p.w / 2, y: p.y });
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
    const deep = this.layers.deep[Math.max(0, Math.min(this.world.width - 1, f.x))];
    return this.isNight() || f.y >= deep;
  }
  /** 召喚燈脈守望者（在玩家正上方畫面外） */
  summonBoss(): Enemy | null {
    if (this.bossEnemy()) return null;
    const c = this.playerCenter();
    const e = this.addEnemy('lantern_warden', c.x, c.y - 16 * TILE_SIZE);
    this.events.push({ type: 'boss', phase: 'spawn', kind: e.kind });
    return e;
  }
  /** 在 (cx px, bottom px) 生一隻怪 */
  private addEnemy(kind: EnemyKind, cx: number, bottom: number): Enemy {
    const e = makeEnemy(this.nextEnemyId++, kind, cx, bottom);
    e.dir = cx < this.playerCenter().x ? 1 : -1;
    this.enemies.push(e);
    return e;
  }
  /** debug / e2e：在 tile (tx, ty)（腳底）生一隻怪 */
  spawnEnemy(kind: EnemyKind, tx: number, ty: number): Enemy {
    return this.addEnemy(kind, (tx + 0.5) * TILE_SIZE, (ty + 1) * TILE_SIZE);
  }

  // ── 實體更新（生成 / AI / 投射物 / 掉落物） ─────────────
  private updateEntities(dt: number): void {
    const pc = this.playerCenter();
    const S = TILE_SIZE;
    // 生成
    if (!this.peacefulMode && !this.dead) {
      this.spawnT -= dt;
      this.spawnCalm += dt;
      if (this.spawnT <= 0) { this.spawnT = spawnInterval(this.spawnCalm); this.trySpawn(); }
    }
    // 怪物
    const night = this.isNight();
    const ctx: AiCtx = {
      q: this.env, px: pc.x, py: pc.y, playerDead: this.dead, rng: this.combatRng, night,
      playerWet: !this.dead && this.contact.type === LIQ.WATER && this.contact.frac > 0.2,
      shoot: (kind, x, y, vx, vy, damage, noclip) => {
        this.projectiles.spawn(kind, true, x, y, vx, vy, { damage, knockback: 160, life: kind === 'stinger' ? 2.2 : 3, solidHit: !noclip });
        this.events.push({ type: 'shot', kind, hostile: true });
      },
      teleportSpot: (e) => this.impSpot(e),
      summon: (kind, x, y) => { if (this.enemies.filter((q) => q.kind === kind).length < 6) this.addEnemy(kind, x, y); },
      bossEvent: (phase) => this.events.push({ type: 'boss', phase, kind: 'lantern_warden' }),
    };
    const p = this.player;
    for (const e of [...this.enemies]) {
      const def = ENEMIES[e.kind], b = e.body;
      const dx = Math.abs(b.x + b.w / 2 - pc.x) / S, dy = Math.abs(b.y + b.h / 2 - pc.y) / S;
      if (!def.boss && !def.minion && (dx > DESPAWN.x || dy > DESPAWN.y || this.dayDespawn(e, dx, dy))) { this.removeEnemy(e); continue; }
      if (!def.boss && (dx > ACTIVE.x || dy > ACTIVE.y)) continue;
      // 冰凍：整隻怪的動作（移動 / 冷卻 / 動畫）變慢
      if (e.frost > 0) e.frost = Math.max(0, e.frost - dt);
      if (!stepEnemy(e, ctx, e.frost > 0 ? dt * FROST_SLOW : dt)) { this.removeEnemy(e); continue; }
      if (this.enemyLiquid(e, dt)) continue;
      if (e.burn > 0) {
        e.burn -= dt; e.burnTick -= dt;
        if (e.burnTick <= 0) {
          e.burnTick = 0.5;
          e.hp -= 2; e.flash = 0.06;
          this.events.push({ type: 'hit', id: e.id, kind: e.kind, x: b.x + b.w / 2, y: b.y, amount: 2, crit: false });
          if (e.hp <= 0) { this.killEnemy(e); continue; }
        }
      }
      if (e.poison > 0) {
        e.poison -= dt; e.poisonTick -= dt;
        if (e.poisonTick <= 0) {
          e.poisonTick = 0.5;
          const pd = Math.max(1, Math.min(6, Math.round(e.maxHp * 0.015)));
          e.hp -= pd; e.flash = 0.06;
          this.events.push({ type: 'hit', id: e.id, kind: e.kind, x: b.x + b.w / 2, y: b.y, amount: pd, crit: false });
          if (e.hp <= 0) { this.killEnemy(e); continue; }
        }
      }
      if (!this.dead && e.state !== 'leave' && overlaps(b, p)) {
        const mul = def.boss && e.phase === 2 ? 1.25 : 1;
        // 荊棘：被碰到時反傷
        const thorns = this.stats().gear.thorns;
        if (this.hurtPlayer(def.damage * mul, b.x + b.w / 2) && thorns > 0 && e.hp > 0) {
          this.damageEnemy(e, thorns, 80, 0, b.x + b.w / 2 >= p.x + p.w / 2 ? 1 : -1);
          if (e.hp <= 0) continue;
        }
      }
    }
    // 投射物
    for (const w of this.projectiles.step(this.world, dt, pc)) {
      this.events.push({ type: 'impact', kind: w.kind, x: w.body.x + w.body.w / 2, y: w.body.y + w.body.h / 2 });
    }
    for (const pr of this.projectiles.list) {
      if (pr.life <= 0 || pr.pierce < 1 || pr.stuck) continue;
      if (pr.hostile) {
        if (!this.dead && overlaps(pr.body, p) && this.hurtPlayer(pr.damage, pr.body.x + pr.body.w / 2)) pr.life = 0;
        continue;
      }
      if (pr.kind === 'boomerang' && pr.returning && overlaps(pr.body, p)) { pr.life = 0; continue; }
      for (const e of this.enemies) {
        if (pr.hit.has(e.id) || !overlaps(pr.body, e.body)) continue;
        if (!this.damageEnemy(e, pr.damage, pr.knockback, pr.crit, pr.body.vx >= 0 ? 1 : -1, pr.flame, pr.fx)) continue;
        pr.hit.add(e.id);
        pr.pierce--;
        if (pr.kind === 'boomerang') pr.returning = true;
        if (pr.pierce < 1) { pr.life = 0; break; }
      }
    }
    // 掉落物
    const inv = this.inventory;
    const got = this.drops.step(this.env, {
      player: p, magnetPx: this.magnetRadius() * S, activePx: ACTIVE.x * S, canPickup: !this.dead,
      room: (item, n) => (inv.canAdd(item, n) ? n : inv.canAdd(item, 1) ? 1 : 0),
      take: (item, n, gear) => n - inv.add(item, n, gear),
    }, dt);
    for (const [item, n, gear] of got) this.events.push(gear ? { type: 'pickup', item, n, rarity: gear.rarity } : { type: 'pickup', item, n });
  }
  private removeEnemy(e: Enemy): void { this.enemies = this.enemies.filter((q) => q !== e); }
  /** 夜行怪在白天、離開畫面就消失 */
  private dayDespawn(e: Enemy, dx: number, dy: number): boolean {
    if (e.kind !== 'night_walker' && e.kind !== 'dusk_owl') return false;
    return !this.isNight() && (dx > this.viewHalf.w + 2 || dy > this.viewHalf.h + 2);
  }

  private trySpawn(): void {
    const w = this.world, r = this.spawnRng, S = TILE_SIZE;
    if (this.enemies.length >= MAX_ENEMIES) return;
    const pt = this.playerTile();
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
    const hab = habitatAt({ world: w, layers: this.layers, night: this.isNight() }, tx, ty);
    hab.season = this.season();
    hab.weather = this.localWeatherState().kind;
    let near = 0;
    for (const e of this.enemies) {
      const b = e.body;
      if (Math.abs(b.x / S - pt.x) < ACTIVE.x && Math.abs(b.y / S - pt.y) < ACTIVE.y && !ENEMIES[e.kind].minion) near++;
    }
    const pressure: SpawnPressure = { firstNight: isFirstNight(this.time), nearSpawn: Math.abs(tx - this.spawn.x) < NEAR_SPAWN_TILES };
    if (near >= spawnCap(hab, pressure) || r.next() >= spawnChance(hab, pressure)) return;
    if (this.bed && Math.hypot(tx - this.bed.x, ty - this.bed.y) < BED_SAFE) return;
    if (inHouse(w, tx, ty) || homeNear(w, tx, ty)) return;
    if (this.settle.cores.length && this.settle.hasPerk(tx, ty, w, 'ward')) return;
    const entry = pickEntry(spawnTable(hab), r);
    if (!entry) return;
    const spot = findSpot(w, entry.kind, tx, ty);
    if (!spot) return;
    // 生成點仍要在畫面外
    if (Math.abs(spot.x / S - pt.x) <= vw && Math.abs(spot.y / S - pt.y) <= vh) return;
    const n = entry.group ? r.int(entry.group[0], entry.group[1] + 1) : 1;
    for (let k = 0; k < n && this.enemies.length < MAX_ENEMIES; k++) this.addEnemy(entry.kind, spot.x + k * 10, spot.y - k * 6);
  }

  /** 燼角魔瞬移點：玩家左右 4–9 格、站得住的地方 */
  private impSpot(e: Enemy): { x: number; y: number } | null {
    const pt = this.playerTile(), r = this.combatRng;
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
      else { this.fishing = null; this.events.push({ type: 'fish', phase: 'reel', x: f.x, y: f.y }); }
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
      rod, bait, power: fishingPower(rod, bait, wx, this.timeSlot()), forced: null,
    };
    this.events.push({ type: 'fish', phase: 'cast', x: ox, y: oy });
  }
  /** 浮標每刻：飛行（拋物線、撞牆卡住、落水）→ 漂浮（等上鉤）→ 上鉤（判定窗） */
  private updateFishing(dt: number): void {
    const f = this.fishing;
    if (!f) return;
    const w = this.world, S = TILE_SIZE;
    const end = (phase: 'reel' | 'snag' | 'burn' | 'snap'): void => { this.fishing = null; this.events.push({ type: 'fish', phase, x: f.x, y: f.y }); };
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
        if (ty >= w.height || tx < 0 || tx >= w.width) { end('snag'); return; }
        if (ty < 0) continue;
        if (w.isSolid(tx, ty)) { end('snag'); return; }
        const a = w.getLiquid(tx, ty);
        if (a > 24) {
          const t = w.getLiquidType(tx, ty);
          if (!canFishIn(t, Boolean(ITEMS[f.rod].rod?.lava))) { end('burn'); return; }
          f.state = 'floating'; f.liquid = t; f.vx = 0; f.vy = 0; f.t = 0;
          f.wait = biteDelay(f.power, this.fishRng.next());
          this.floatBobber(f);
          this.events.push({ type: 'fish', phase: 'land', x: f.x, y: f.y, liquid: t });
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
        this.events.push({ type: 'fish', phase: 'bite', x: f.x, y: f.y, liquid: f.liquid });
      }
    } else if (f.t > f.window) {
      f.state = 'floating'; f.t = 0; f.forced = null;
      f.wait = biteDelay(f.power, this.fishRng.next());
      this.events.push({ type: 'fish', phase: 'escape', x: f.x, y: f.y });
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
    const w = this.world, W = w.width;
    const seen = new Set<number>([ty * W + tx]);
    const q = [ty * W + tx];
    for (let k = 0; k < q.length && seen.size < POOL_COUNT_MAX; k++) {
      const i = q[k];
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (j < 0 || j >= w.liquid.length || seen.has(j) || !w.liquid[j] || w.liquidType[j] !== type) continue;
        seen.add(j); q.push(j);
      }
    }
    return seen.size;
  }
  /** 浮標所在的深度帶 */
  private depthZone(tx: number, ty: number): DepthZone {
    const x = Math.max(0, Math.min(this.world.width - 1, tx)), L = this.layers;
    return ty < L.rock[x] ? 'surface' : ty < L.deep[x] ? 'underground' : ty < L.molten[x] ? 'cavern' : 'molten';
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
      const ilvl = ilvlForDepth(this.depthFrac(tx, ty)), it = rollDropItem(this.lootRng, ilvl);
      this.giveOrDrop(it, this.rollFor(it, 'fish', this.depthFrac(tx, ty), ilvl));
      this.events.push({ type: 'fish', phase: 'catch', x: f.x, y: f.y, item: it, liquid: f.liquid });
      return;
    }
    const left = this.inventory.add(item, 1);
    if (left > 0) { const pt = this.playerTile(); this.dropAtTile(item, left, pt.x, pt.y); }
    if (ITEMS[item].fish) this.fishLog[item] = (this.fishLog[item] ?? 0) + 1;
    this.events.push({ type: 'fish', phase: 'catch', x: f.x, y: f.y, item, liquid: f.liquid });
  }
  /** debug / e2e：浮標漂著時立刻上鉤（item = 指定釣起來的東西） */
  debugForceBite(item: ItemId | null = null): boolean {
    const f = this.fishing;
    if (!f || f.state === 'flying') return false;
    f.state = 'bite'; f.t = 0; f.window = biteWindow(f.power); f.forced = item;
    this.events.push({ type: 'fish', phase: 'bite', x: f.x, y: f.y, liquid: f.liquid });
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
    this.events.push({ type: 'eat', item, amount });
    this.events.push({ type: 'heal', amount, x: p.x + p.w / 2, y: p.y });
  }
  /** 打開木箱：戰利品進背包（放不下的掉在腳邊） */
  private openCrate(item: ItemId): void {
    if (item !== 'wooden_crate' && item !== 'iron_crate' && item !== 'golden_crate') return;
    this.inventory.takeFromSlot(this.inventory.selected, 1);
    const drops = crateLoot(item, this.fishRng), pt = this.playerTile();
    for (const d of drops) {
      const left = this.inventory.add(d.item, d.n);
      if (left > 0) this.dropAtTile(d.item, left, pt.x, pt.y);
      this.events.push({ type: 'pickup', item: d.item, n: d.n });
    }
    // 木箱裡的裝備（鐵皮 / 金邊箱機率更高、等級更高）
    if (this.lootRng.next() < CRATE_GEAR[item]) {
      const ilvl = item === 'wooden_crate' ? 2 : item === 'iron_crate' ? 3 : 4;
      const it = rollDropItem(this.lootRng, ilvl), g = this.rollFor(it, 'fish', ilvl / 5, ilvl);
      this.giveOrDrop(it, g);
    }
    this.events.push({ type: 'crate', item, drops });
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
    this.events.push({ type: 'loot', item, rarity: gear.rarity, x, y });
  }
  /** 放進背包；放不下掉在腳邊 */
  private giveOrDrop(item: ItemId, gear: Gear): void {
    if (this.inventory.add(item, 1, gear) > 0) {
      const c = this.playerCenter();
      this.spawnGearDrop(item, gear, c.x, c.y);
    } else this.events.push({ type: 'pickup', item, n: 1, rarity: gear.rarity });
  }
  /** 把背包 / 裝備欄的裝備收進圖鑑；新詞條發 codex 事件 */
  observeGear(): void {
    const seen = (item: ItemId, g: Gear | undefined): void => {
      for (const a of this.codex.observe(item, g)) this.events.push({ type: 'codex', affix: a });
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
    const y = salvageYield(st.gear);
    if (typeof at === 'number') this.inventory.slots[at] = null; else this.equipment.set(at, null);
    this.giveMats(y);
    this.gearChanged(at);
    this.events.push({ type: 'salvage', count: 1, shard: y.shard, dust: y.dust });
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
      const y = salvageYield(st.gear);
      this.inventory.slots[i] = null;
      tot.count++; tot.shard += y.shard; tot.dust += y.dust;
    }
    if (tot.count) {
      this.giveMats(tot);
      this.invalidateStats();
      this.events.push({ type: 'salvage', ...tot });
    }
    return tot;
  }
  /** 鍛造（洗煉 / 強化 / 升階）要在鐵砧旁 */
  canForge(): boolean { return this.nearTile(T.ANVIL) || this.nearNpc('smith'); }
  /** 鍛造成本（null = 已滿級 / 不能） */
  forgeCosts(at: GearAt): { reroll: Cost | null; upgrade: Cost | null; ascend: Cost | null } {
    const st = this.stackAt(at);
    if (!st || !gearSlot(st.item)) return { reroll: null, upgrade: null, ascend: null };
    const g = st.gear;
    const rerollable = Boolean(g?.affixes.some((a) => affixDef(a.id).kind !== 'unique'));
    return { reroll: rerollable ? this.discounted(rerollCost(g)) : null, upgrade: this.discounted(upgradeCost(g)), ascend: this.discounted(ascendCost(g)) };
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
    this.events.push({ type: 'forge', action, slot: at, item: st.item });
    return { ok: true };
  }
  /** 洗煉：換掉第 affix 條詞條（傳奇詞條不能洗） */
  reroll(at: GearAt, affix: number): ForgeResult {
    const st = this.stackAt(at);
    return this.forge(at, 'reroll', st ? rerollCost(st.gear) : null, (g) => (st ? rerollAffix(st.item, g, affix, this.lootRng) : null));
  }
  /** 強化 +1（最多 +5） */
  upgrade(at: GearAt): ForgeResult {
    const st = this.stackAt(at);
    return this.forge(at, 'upgrade', st ? upgradeCost(st.gear) : null, (g) => (g.plus >= MAX_PLUS ? null : upgradeGear(g)));
  }
  /** 升階：稀有度 +1（到傳說為止），多一條詞條 */
  ascend(at: GearAt): ForgeResult {
    const st = this.stackAt(at);
    return this.forge(at, 'ascend', st ? ascendCost(st.gear) : null, (g) => (st ? ascendGear(st.item, g, this.lootRng) : null));
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
      playerTile: () => this.playerTile(), playerOverlaps: (x, y) => this.tileOverlapsPlayer(x, y),
    };
    this.settleHost.time = this.time;
    this.settle.update(dt, this.settleHost);
    for (const e of this.settle.drainEvents()) this.events.push(e);
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
        this.world.markModified(i % this.world.width, Math.floor(i / this.world.width));
        if (need <= 0) break;
      }
    }
    this.inventory.slots = trial.slots;
    this.events.push({ type: 'craft', recipe: recipeId, item: rc.out.item, n: rc.out.n });
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
  forgeDiscount(): number {
    const n = this.settle.npc('smith');
    if (!n) return 1;
    const t = this.playerTile(), c = this.settle.coreById(n.core);
    const inside = c ? Math.abs(t.x - c.x) <= 40 && Math.abs(t.y - c.y) <= 24 : false;
    return inside || this.nearNpc('smith') ? forgeMul(n.mood) : 1;
  }
  private discounted(c: Cost | null): Cost | null {
    if (!c) return null;
    const m = this.forgeDiscount();
    return m >= 1 ? c : { ...c, shard: Math.max(c.shard ? 1 : 0, Math.ceil(c.shard * m)), dust: Math.max(c.dust ? 1 : 0, Math.ceil(c.dust * m)) };
  }
  private talkTo(n: Npc): void {
    const wx = this.localWeatherState();
    const line = npcLine(n.kind, { night: this.isNight(), rain: wx.kind === 'rain' || wx.kind === 'storm', mood: n.mood, homeless: n.home === null }, n.talks++);
    n.say = line; n.sayT = 4;
    n.dir = this.playerCenter().x >= n.body.x + n.body.w / 2 ? 1 : -1;
    this.events.push({ type: 'talk', kind: n.kind, line });
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
    this.events.push({ type: 'trade', kind, action: 'buy', item: e.item, n: e.n, coins: price });
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
    this.events.push({ type: 'trade', kind, action: 'sell', item, n: k, coins: price * k });
    return true;
  }
  /** 居民服務：製圖師打聽地點（其他服務是被動的） */
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
    this.events.push({ type: 'trade', kind, action: 'service', coins: price });
    this.lastReveal = { name: r.name, x: r.ax, y: r.ay };
    return true;
  }
  /** 製圖師上次打聽到的地點（UI 顯示） */
  lastReveal: { name: string; x: number; y: number } | null = null;
  /** 把某個據點的爐心設為重生點（Lv1 以上） */
  setSpawnCore(id: number): boolean {
    const c = this.settle.coreById(id);
    if (!c || (this.settle.evaluation(id, this.world)?.level ?? 0) < 1) return false;
    this.settle.spawnCore = id;
    this.bed = null;
    this.events.push({ type: 'spawn', set: true, x: c.x + 1, y: c.y });
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
    this.teleport(dest.x + 1, dest.y);
    this.closeChest();
    this.events.push({ type: 'travel', from: here.id, to, x: dest.x + 1, y: dest.y });
    return true;
  }
  /** 建築木槌：方塊整格 ⇄ 半格（只對實心、會自動接邊的方塊） */
  private hammer(x: number, y: number): boolean {
    const w = this.world, id = w.getFg(x, y);
    if (!this.canReach(x, y)) { this.block('use', 'reach', x, y); return false; }
    if (!isSolidTile(id) || tileDef(id).sprite || tileDef(id).minTier >= TIER_UNBREAKABLE) return false;
    w.setHalf(x, y, !w.isHalf(x, y));
    this.events.push({ type: 'place', x, y, tile: id, item: 'builder_hammer' });
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

  // ── debug / e2e / 存檔還原 ─────────────────────────────
  /** 換角色外觀（存一份正規化後的新物件） */
  setAppearance(a: Appearance): void { this.appearance = normalizeAppearance(a); }

  /** 把玩家腳底放到 tile (tx, ty)（身體底 = (ty+1)*16），水平置中。 */
  teleport(tx: number, ty: number): void {
    const p = this.player;
    p.x = tx * TILE_SIZE + TILE_SIZE / 2 - p.w / 2;
    p.y = (ty + 1) * TILE_SIZE - p.h;
    p.vx = 0; p.vy = 0; p.gfxOffY = 0;
    this.motion.jumpTimer = 0;
    this.motion.climbing = false;
    this.motion.mantle = null;
    this.fallPeak = null;
  }
  /** 立即挖掉一格（不檢查距離 / 等級），掉落物照常入背包。 */
  mineInstant(x: number, y: number): boolean { return this.breakTile(x, y, true); }
  give(item: ItemId, n = 1): number { return this.inventory.add(item, n); }
}

