// game.ts — DelveGame：固定步長模擬（輸入 → 物理 → 挖掘/放置 → 時間）。不碰 DOM。
// render/input 層的典型用法：
//   game.setMoveX(-1|0|1); game.setJump(bool); game.setAim(tx, ty);
//   game.setMining(bool); game.setUse(bool); game.selectSlot(i);
//   while (acc >= FIXED_DT) { game.step(FIXED_DT); acc -= FIXED_DT; }
//   for (const ci of game.world.drainDirty()) redrawChunk(ci);
//   const light = game.computeLight(viewRectInTiles);
//   for (const e of game.drainEvents()) playSfx(e);
import { World } from './world';
import { generateWorld, type BiomeSegment, type Structure, type Landform, type ReservedZone, type GenLayers } from './worldgen';
import type { DungeonInfo } from './gen/dungeon';
type GenRelic = { x: number; y: number; item: ItemId; where: string };
import { T, tileDef, isSolidTile, isChestTile, isDoorTile, isInteractive, isBedTile, floorOk, ceilOk, ropeOk } from './tiles';
import { ITEMS, INFO_ACCESSORIES, type Accessory, type ItemId, type PickStats, type WeaponDef, type WeaponKind } from './items';
import { potLoot, type Drop } from './loot';
import { Inventory, starterInventory, type Stack } from './inventory';
import { craft as craftRecipe, findRecipe, type CraftResult, type Station } from './crafting';
import { makeBody, stepPlayer, onPlatform, type Body, type MoveStats, type PlayerMotion } from './physics';
import { LightEngine, skyBrightness, type LightMap, type LightRect, type PointLight } from './lighting';
import { ExploredMap, toggleMarker, type MapMarker } from './explore';
import { Discovery, buildRegions, type Region, type RegionCat } from './discovery';
import { Equipment, type EquipSlot } from './equipment';
import {
  BASE_HP, BASE_MANA, LIFE_CORE_HP, MAX_HP_CAP, SAFE_FALL_TILES, computeStats, damageTaken, enemyDamage, fallDamage,
  knockbackScale, regenRate, rollCrit, type PlayerStats,
} from './combat';
import { DropList, LODESTONE_TILES, MAGNET_TILES, overlaps, popVelocity, type PhysEnv } from './entities';
import { LiquidSim, type ReactionKind } from './liquid';
import { LIQ, LIQ_MAX } from './liquidKind';
import { NO_CONTACT, liquidContact, liquidMedium, playerMedium, type LiquidContact } from './swim';
import { ProjList, type ProjKind, type Projectile } from './projectiles';
import { ENEMIES, makeEnemy, stepEnemy, type AiCtx, type Enemy, type EnemyKind } from './enemies';
import {
  ACTIVE, BED_SAFE, DEFAULT_VIEW_HALF, DESPAWN, MAX_ENEMIES, SPAWN_INTERVAL, SPAWN_MAX, findSpot, habitatAt, inHouse,
  pickEntry, spawnCap, spawnChance, spawnTable,
} from './spawn';
import { Rng } from './rng';
import {
  TILE_SIZE, CHUNK, FIXED_DT, REACH_TILES, STATION_RANGE, PLACE_COOLDOWN, DAY_LENGTH,
} from './constants';

export interface DelveOptions {
  seed?: string | number;
  width?: number;
  height?: number;
  /** 和平模式：不自然生成怪物 */
  peaceful?: boolean;
}

export type BlockReason = 'reach' | 'tier' | 'full' | 'body' | 'support' | 'occupied' | 'chest' | 'locked' | 'golden'
  /** 戰鬥：沒有箭 / 魔力不足 / 現在不能召喚首領 / 藥水冷卻中 / 生命已達上限 */
  | 'ammo' | 'mana' | 'summon' | 'potion' | 'maxlife';
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
  | { type: 'pickup'; item: ItemId; n: number }
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
  | { type: 'liquidtool'; action: 'scoop' | 'pour' | 'sponge'; liquid: number; x: number; y: number };

/** 進行中的攻擊（render 動畫 + 近戰判定） */
export interface AttackState {
  item: ItemId; kind: WeaponKind;
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
  player: { x: number; y: number; vx: number; vy: number; onGround: boolean; tileX: number; tileY: number; gfxOffY: number; climbing: boolean };
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
}

/** 徒手（背包沒有鎬）時的挖掘能力 */
const HAND: PickStats = { speed: 0.35, tier: 1 };
/** 起始時間：清晨天亮後 */
const START_TIME = DAY_LENGTH * 0.3;
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
/** 夜晚：一天的前 20% 與後 20% */
export function isNightTime(t: number): boolean {
  let p = (t % DAY_LENGTH) / DAY_LENGTH;
  if (p < 0) p += 1;
  return p < 0.2 || p >= 0.8;
}
/** 首領：燈脈守望者的掉落 */
export const BOSS_DROPS: { item: ItemId; n: number }[] = [
  { item: 'lumen_blade', n: 1 }, { item: 'warden_heart', n: 1 }, { item: 'warden_trophy', n: 1 },
  { item: 'healing_potion', n: 5 }, { item: 'silver_coin', n: 12 },
];

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
  /** 遊戲內經過秒數（日夜循環用） */
  time = START_TIME;
  tick = 0;

  private motion: PlayerMotion = { jumpTimer: 0, jumpWasHeld: false, climbing: false };
  private moveX = 0;
  private jump = false;
  private upHeld = false;
  /** 床（重生點，床頭 tile）；存檔內容 */
  bed: { x: number; y: number } | null = null;
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
  private readonly spawnRng: Rng;
  private readonly combatRng: Rng;
  private aimPx = { x: 0, y: 0 };
  private statsVer = -1;
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

  constructor(opts: DelveOptions = {}) {
    this.seed = String(opts.seed ?? 'delve');
    const gen = generateWorld(this.seed, { width: opts.width, height: opts.height });
    this.world = gen.world;
    this.liquids = new LiquidSim(this.world);
    this.liquids.blocked = (x, y) => !this.dead && this.tileOverlapsPlayer(x, y);
    const w = this.world;
    this.env = {
      isSolid: (x, y) => w.isSolid(x, y),
      isPlatform: (x, y) => w.isPlatform(x, y),
      isClimbable: (x, y) => w.isClimbable(x, y),
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
    this.peacefulMode = Boolean(opts.peaceful);
    this.world.markAllDirty();
    // 出生點：周圍已揭露、所在地區算已發現（不跳橫幅）
    this.explored.revealDisc(this.spawn.x, this.spawn.y, REVEAL_RADIUS + 6);
    this.discovery.visit(this.spawn.x, this.spawn.y);
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
    this.liquids.step();
    for (const e of this.liquids.drainEvents()) this.events.push({ type: 'liquid', kind: e.kind, x: e.x, y: e.y });
    if (this.dead) {
      this.updateDeath(dt);
      this.updateEntities(dt);
      return;
    }
    const knocked = this.knockT > 0;
    this.contact = liquidContact(this.world, this.player);
    stepPlayer(this.world, this.player, this.motion, { moveX: knocked ? 0 : this.moveX, jump: !knocked && this.jump, drop: this.dropHeld, up: !knocked && this.upHeld }, dt, this.moveStats(), playerMedium(this.contact));
    this.contact = liquidContact(this.world, this.player);
    this.updateFall();
    this.updateLiquid(dt);
    this.updateVitals(dt);
    this.updateRecall(dt);
    this.updateExploration();
    if (!this.platformHinted && this.player.onGround && !this.dropHeld && onPlatform(this.world, this.player)) {
      this.platformHinted = true;
      this.events.push({ type: 'hint', id: 'platform' });
    }
    if (this.attackCd > 0) this.attackCd -= dt;
    const weapon = this.heldWeapon();
    if (this.miningHeld) {
      if (weapon) this.tryAttack(weapon.item, weapon.def);
      else this.updateMining(dt);
    }
    this.updateAttack(dt);
    if (!this.attack && Math.abs(this.player.vx) > 8) this.facing = this.player.vx > 0 ? 1 : -1;
    if (this.placeCooldown > 0) this.placeCooldown -= dt;
    if (this.useHeld && this.placeCooldown <= 0) {
      const { x, y } = this.aim;
      const held = this.inventory.selectedStack();
      const use = held ? ITEMS[held.item].use : undefined;
      if (isInteractive(this.world.getFg(x, y))) {
        if (!this.useConsumed) { this.useConsumed = true; this.interact(x, y); }
      } else if (use === 'recall') {
        if (!this.useConsumed) { this.useConsumed = true; this.startRecall(); }
      } else if (use === 'scoop' || use === 'pour' || use === 'sponge') {
        if (this.useLiquidTool(use, x, y)) this.placeCooldown = LIQUID_TOOL_CD;
      } else if (use) {
        if (!this.useConsumed) { this.useConsumed = true; this.consume(use); }
      } else if (!this.useConsumed && this.tryPlace(x, y)) this.placeCooldown = PLACE_COOLDOWN;
    }
    this.updateEntities(dt);
    if (this.openChest) {
      const { x, y } = this.openChest;
      if (!isChestTile(this.world.getFg(x, y)) || !this.canReach(x, y, this.reach() + 1.5)) this.closeChest();
    }
  }

  private updateMining(dt: number): void {
    const { x, y } = this.aim;
    const id = this.world.getFg(x, y);
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
    // 床：整張只掉一個，算在床頭；孤立的床尾也掉一個
    if (id === T.BED_FOOT) return this.world.getFg(x - 1, y) === T.BED_HEAD ? [] : [{ item: 'bed', n: 1 }];
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
      // 床的另一半一起拆
      if (tid === T.BED_HEAD && w.getFg(tx + 1, ty) === T.BED_FOOT) take(tx + 1, ty);
      if (tid === T.BED_FOOT && w.getFg(tx - 1, ty) === T.BED_HEAD) take(tx - 1, ty);
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
      for (const d of drops) {
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

  /** 床放置：(x,y) 床頭、(x+1,y) 床尾，兩格都要空、下面都要實心 */
  private placeBed(x: number, y: number, item: ItemId): boolean {
    const w = this.world;
    for (let k = 0; k < 2; k++) {
      const c = w.getFg(x + k, y);
      if (!w.inBounds(x + k, y) || (c !== T.AIR && !tileDef(c).replaceable)) { this.block('place', 'occupied', x, y); return false; }
      if (!isSolidTile(w.getFg(x + k, y + 1))) { this.block('place', 'support', x, y); return false; }
    }
    w.setFg(x, y, T.BED_HEAD);
    w.setFg(x + 1, y, T.BED_FOOT);
    this.inventory.takeFromSlot(this.inventory.selected, 1);
    this.events.push({ type: 'place', x, y, tile: T.BED_HEAD, item });
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

  /** 嘗試以快捷欄選中的方塊放在 (x,y)。 */
  tryPlace(x: number, y: number): boolean {
    const stack = this.inventory.selectedStack();
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
    if (place === T.BED_HEAD) return this.placeBed(x, y, stack.item);
    if (isSolidTile(place) && this.tileOverlapsPlayer(x, y)) { this.block('place', 'body', x, y); return false; }
    if (!this.placeSupported(x, y, place)) { this.block('place', 'support', x, y); return false; }
    if (replace) {
      this.world.setFg(x, y, T.AIR);
      this.events.push({ type: 'mine', x, y, tile: cur, item: null });
    }
    this.world.setFg(x, y, place);
    this.inventory.takeFromSlot(this.inventory.selected, 1);
    this.events.push({ type: 'place', x, y, tile: place, item: stack.item });
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

  private currentPick(): PickStats { return this.inventory.bestPick() ?? HAND; }

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
    return { runMul: this.hasAccessory('run') ? 1.45 : 1, jumpMul: this.hasAccessory('jump') ? 1.25 : 1 };
  }
  /** 伸手距離（格）：磁石 +3 */
  reach(): number { return REACH_TILES + (this.hasAccessory('magnet') ? MAGNET_REACH : 0); }
  /** 掉落物吸取半徑（格）：一般 5、磁石 12 */
  magnetRadius(): number { return this.hasAccessory('magnet') ? LODESTONE_TILES : MAGNET_TILES; }
  /** 裝備帶來的數值（裝備變動才重算） */
  stats(): PlayerStats {
    if (this.statsVer !== this.equipment.version || this.statsEq !== this.equipment) {
      this.statsVer = this.equipment.version; this.statsEq = this.equipment;
      this.statsCache = computeStats(this.equipment);
    }
    return this.statsCache;
  }
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
    const b = this.bed;
    if (b && this.world.getFg(b.x, b.y) === T.BED_HEAD) return { x: b.x, y: b.y };
    return { x: this.spawn.x, y: this.spawn.y };
  }
  private useBed(x: number, y: number): boolean {
    const hx = this.world.getFg(x, y) === T.BED_FOOT ? x - 1 : x;
    if (this.world.getFg(hx, y) !== T.BED_HEAD) return false;
    this.bed = { x: hx, y };
    this.events.push({ type: 'spawn', set: true, x: hx, y });
    return true;
  }
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
    return { workbench: this.nearTile(T.WORKBENCH), furnace: this.nearTile(T.FURNACE), anvil: this.nearTile(T.ANVIL) };
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
  skyLevel(): number { return skyBrightness(this.time); }
  isNight(): boolean { return isNightTime(this.time); }

  craft(recipeId: string): CraftResult {
    const st = this.stations();
    const r = craftRecipe(this.inventory, recipeId, { nearWorkbench: st.workbench, nearFurnace: st.furnace, nearAnvil: st.anvil });
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
    const left = this.inventory.add(st.item, st.count);
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
    // 夜視護符：身邊一圈柔和的微光（比火把暗、不需要拿在手上）
    const night = this.hasAccessory('night') ? 0.78 : 0;
    return [{ x: pt.x, y: pt.y, v: Math.max(0.22, v, night) }, ...(v >= 1 ? [{ x: pt.x, y: pt.y - 1, v: 1 }] : [])];
  }

  /** 計算視窗（tile 座標）+ 外框的光照。 */
  computeLight(view: LightRect, extra?: readonly PointLight[]): LightMap {
    return this.lightEngine.compute(this.world, view, { sky: this.skyLevel(), lights: extra });
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
      player: { x: p.x, y: p.y, vx: p.vx, vy: p.vy, onGround: p.onGround, tileX: t.x, tileY: t.y, gfxOffY: p.gfxOffY, climbing: Boolean(this.motion.climbing) },
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

  private tryAttack(item: ItemId, w: WeaponDef): void {
    if (this.attackCd > 0) return;
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
          damage: dmg(w.damage + ad.damage), knockback: w.knockback, crit, life: 3, gravity: 420, pierce: 1, flame: ad.flame, item: ammo,
        });
        break;
      }
      case 'throw': {
        this.inventory.takeFromSlot(this.inventory.selected, 1);
        const sp = w.speed ?? 500;
        this.projectiles.spawn('knife', false, ox, oy, ux * sp, uy * sp, { damage: dmg(w.damage), knockback: w.knockback, crit, life: 2.5, gravity: 520, pierce: 1, item });
        break;
      }
      case 'boomerang': {
        if (this.projectiles.list.some((p) => p.kind === 'boomerang' && !p.hostile)) return;
        const sp = w.speed ?? 440;
        this.projectiles.spawn('boomerang', false, ox, oy, ux * sp, uy * sp, { damage: dmg(w.damage), knockback: w.knockback, crit, life: 4, pierce: 99, item });
        break;
      }
      case 'staff': {
        const cost = w.mana ?? 0;
        if (this.mana < cost) { this.block('use', 'mana', this.aim.x, this.aim.y); this.attackCd = 0.3; return; }
        this.mana -= cost; this.manaDelay = 0.9;
        const sp = w.speed ?? 480;
        this.projectiles.spawn('bolt', false, ox, oy, ux * sp, uy * sp, { damage: dmg(w.damage), knockback: w.knockback, crit, life: 1.4, pierce: 1, item });
        break;
      }
      default:
        if (w.wave) {
          const sp = w.speed ?? 420;
          this.projectiles.spawn('wave', false, ox, oy, ux * sp, uy * sp, { damage: dmg(w.damage * 0.6), knockback: w.knockback * 0.5, crit, life: 0.55, pierce: 3, item });
        }
    }
    this.swingId++;
    this.attack = { item, kind: w.kind, t: 0, dur: w.useTime, angle, dir: this.facing, id: this.swingId };
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
      this.damageEnemy(e, w.damage * st.damageMul, w.knockback, w.crit + st.crit, dir as 1 | -1);
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
  private damageEnemy(e: Enemy, raw: number, kb: number, critChance: number, dir: 1 | -1, flame = false): boolean {
    const def = ENEMIES[e.kind];
    if (e.state === 'shatter' || e.hp <= 0) return false;
    const crit = rollCrit(critChance, this.combatRng);
    const amount = enemyDamage(raw * (crit ? 2 : 1), def.defense);
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
    if (e.hp <= 0) this.killEnemy(e);
    return true;
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
    for (const d of def.drops) if (r.next() < d.chance) drop(d.item, r.int(d.min, d.max + 1));
    if (def.coins[1] > 0) drop('copper_coin', r.int(def.coins[0], def.coins[1] + 1));
    this.kills[e.kind] = (this.kills[e.kind] ?? 0) + 1;
    this.events.push({ type: 'kill', id: e.id, kind: e.kind, x: cx, y: cy });
    if (def.boss) {
      for (const it of BOSS_DROPS) drop(it.item, it.n);
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
    this.motion.climbing = false; this.motion.jumpTimer = 0;
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
    if (this.hp <= 0) this.die();
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
    this.events.push({ type: 'respawn', x: r.x, y: r.y });
  }

  /** 摔落傷害：記住騰空時的最高點，落地時算掉了幾格 */
  private updateFall(): void {
    const p = this.player;
    if (this.motion.climbing || this.contact.frac > 0) { this.fallPeak = null; return; }
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
    this.sinceHit += dt;
    const max = this.maxHp();
    const regen = (this.burning > 0 ? 0 : regenRate(this.sinceHit, this.stats().regenMul)) + (this.honeyT > 0 ? HONEY_REGEN : 0);
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
        this.motion.jumpTimer = 0; this.motion.climbing = false;
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
    if (this.hp <= 0) this.die();
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
      const g = ENEMIES[e.kind].glow;
      if (g) out.push({ x: (e.body.x + e.body.w / 2) / TILE_SIZE, y: (e.body.y + e.body.h / 2) / TILE_SIZE, v: g });
    }
    return out;
  }

  /** 手持消耗品按「使用」 */
  private consume(use: 'life' | 'heal' | 'summon' | 'scoop' | 'pour' | 'sponge'): void {
    const st = this.inventory.selectedStack();
    if (!st) return;
    const { x, y } = this.aim, p = this.player;
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
    } else {
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
      if (this.spawnT <= 0) { this.spawnT = SPAWN_INTERVAL; this.trySpawn(); }
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
      if (!stepEnemy(e, ctx, dt)) { this.removeEnemy(e); continue; }
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
      if (!this.dead && e.state !== 'leave' && overlaps(b, p)) {
        const mul = def.boss && e.phase === 2 ? 1.25 : 1;
        this.hurtPlayer(def.damage * mul, b.x + b.w / 2);
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
        if (!this.damageEnemy(e, pr.damage, pr.knockback, pr.crit, pr.body.vx >= 0 ? 1 : -1, pr.flame)) continue;
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
      take: (item, n) => n - inv.add(item, n),
    }, dt);
    for (const [item, n] of got) this.events.push({ type: 'pickup', item, n });
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
    let near = 0;
    for (const e of this.enemies) {
      const b = e.body;
      if (Math.abs(b.x / S - pt.x) < ACTIVE.x && Math.abs(b.y / S - pt.y) < ACTIVE.y && !ENEMIES[e.kind].minion) near++;
    }
    if (near >= spawnCap(hab) || r.next() >= spawnChance(hab)) return;
    if (this.bed && Math.hypot(tx - this.bed.x, ty - this.bed.y) < BED_SAFE) return;
    if (inHouse(w, tx, ty)) return;
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

  // ── debug / e2e / 存檔還原 ─────────────────────────────
  /** 把玩家腳底放到 tile (tx, ty)（身體底 = (ty+1)*16），水平置中。 */
  teleport(tx: number, ty: number): void {
    const p = this.player;
    p.x = tx * TILE_SIZE + TILE_SIZE / 2 - p.w / 2;
    p.y = (ty + 1) * TILE_SIZE - p.h;
    p.vx = 0; p.vy = 0; p.gfxOffY = 0;
    this.motion.jumpTimer = 0;
    this.motion.climbing = false;
    this.fallPeak = null;
  }
  /** 立即挖掉一格（不檢查距離 / 等級），掉落物照常入背包。 */
  mineInstant(x: number, y: number): boolean { return this.breakTile(x, y, true); }
  give(item: ItemId, n = 1): number { return this.inventory.add(item, n); }
}

