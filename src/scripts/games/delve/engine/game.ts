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
import { ITEMS, type Accessory, type ItemId, type PickStats } from './items';
import { potLoot, type Drop } from './loot';
import { Inventory, starterInventory, type Stack } from './inventory';
import { craft as craftRecipe, findRecipe, type CraftResult } from './crafting';
import { makeBody, stepPlayer, onPlatform, type Body, type MoveStats, type PlayerMotion } from './physics';
import { LightEngine, skyBrightness, type LightMap, type LightRect, type PointLight } from './lighting';
import { ExploredMap, toggleMarker, type MapMarker } from './explore';
import { Discovery, buildRegions, type Region, type RegionCat } from './discovery';
import {
  TILE_SIZE, CHUNK, FIXED_DT, REACH_TILES, STATION_RANGE, PLACE_COOLDOWN, DAY_LENGTH,
} from './constants';

export interface DelveOptions {
  seed?: string | number;
  width?: number;
  height?: number;
}

export type BlockReason = 'reach' | 'tier' | 'full' | 'body' | 'support' | 'occupied' | 'chest' | 'locked' | 'golden';
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
  | { type: 'recall'; phase: 'start' | 'cancel' | 'done'; x: number; y: number };

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

  constructor(opts: DelveOptions = {}) {
    this.seed = String(opts.seed ?? 'delve');
    const gen = generateWorld(this.seed, { width: opts.width, height: opts.height });
    this.world = gen.world;
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
    stepPlayer(this.world, this.player, this.motion, { moveX: this.moveX, jump: this.jump, drop: this.dropHeld, up: this.upHeld }, dt, this.moveStats());
    this.updateRecall(dt);
    this.updateExploration();
    if (!this.platformHinted && this.player.onGround && !this.dropHeld && onPlatform(this.world, this.player)) {
      this.platformHinted = true;
      this.events.push({ type: 'hint', id: 'platform' });
    }
    if (this.miningHeld) this.updateMining(dt);
    if (this.placeCooldown > 0) this.placeCooldown -= dt;
    if (this.useHeld && this.placeCooldown <= 0) {
      const { x, y } = this.aim;
      const held = this.inventory.selectedStack();
      if (isInteractive(this.world.getFg(x, y))) {
        if (!this.useConsumed) { this.useConsumed = true; this.interact(x, y); }
      } else if (held && ITEMS[held.item].use === 'recall') {
        if (!this.useConsumed) { this.useConsumed = true; this.startRecall(); }
      } else if (!this.useConsumed && this.tryPlace(x, y)) this.placeCooldown = PLACE_COOLDOWN;
    }
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
    if (!plan.fits) { this.block('mine', 'full', x, y); this.mining = null; return; }
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

  /** 移除 tile 並把掉落物放進背包；處理砍樹與支撐。掉落物放不下時整個動作拒絕（full）。回傳是否有挖掉。 */
  private breakTile(x: number, y: number): boolean {
    const plan = this.planBreak(x, y);
    if (!plan.tiles.length) return false;
    if (plan.chest) { this.block('mine', 'chest', x, y); return false; }
    if (!plan.fits) { this.block('mine', 'full', x, y); return false; }
    // 先算完所有掉落物再移除（門等多格物件的掉落依移除前的鄰格判斷）
    const all = plan.tiles.map(([tx, ty]) => { const tid = this.world.getFg(tx, ty); return { tx, ty, tid, drops: this.dropsFor(tid, tx, ty) }; });
    for (const { tx, ty, tid, drops } of all) {
      this.world.setFg(tx, ty, T.AIR);
      if (tid === T.BED_HEAD && this.bed && this.bed.x === tx && this.bed.y === ty) {
        this.bed = null;
        this.events.push({ type: 'spawn', set: false, x: this.spawn.x, y: this.spawn.y });
      }
      for (const d of drops) this.inventory.add(d.item, d.n);
      this.events.push({ type: 'mine', x: tx, y: ty, tile: tid, item: drops.length ? drops[0].item : null });
    }
    return true;
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
  /** 背包裡有沒有某種飾品（任一格即可） */
  hasAccessory(a: Accessory): boolean {
    const sl = this.inventory.slots;
    let sig = '';
    for (let i = 0; i < sl.length; i++) { const st = sl[i]; if (st && ITEMS[st.item].accessory) sig += st.item + ','; }
    if (sig !== this.accSig) {
      this.accSig = sig;
      this.acc = new Set(sig.split(',').filter(Boolean).map((id) => ITEMS[id as ItemId].accessory as Accessory));
    }
    return this.acc.has(a);
  }
  moveStats(): MoveStats {
    return { runMul: this.hasAccessory('run') ? 1.45 : 1, jumpMul: this.hasAccessory('jump') ? 1.25 : 1 };
  }
  /** 伸手距離（格）：磁石 +3 */
  reach(): number { return REACH_TILES + (this.hasAccessory('magnet') ? MAGNET_REACH : 0); }
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
  nearWorkbench(): boolean {
    const p = this.playerTile();
    for (let y = p.y - STATION_RANGE; y <= p.y + STATION_RANGE; y++) {
      for (let x = p.x - STATION_RANGE; x <= p.x + STATION_RANGE; x++) {
        if (this.world.inBounds(x, y) && this.world.getFg(x, y) === T.WORKBENCH) return true;
      }
    }
    return false;
  }
  skyLevel(): number { return skyBrightness(this.time); }

  craft(recipeId: string): CraftResult {
    const r = craftRecipe(this.inventory, recipeId, { nearWorkbench: this.nearWorkbench() });
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
    };
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
  }
  /** 立即挖掉一格（不檢查距離 / 等級），掉落物照常入背包。 */
  mineInstant(x: number, y: number): boolean { return this.breakTile(x, y); }
  give(item: ItemId, n = 1): number { return this.inventory.add(item, n); }
}

