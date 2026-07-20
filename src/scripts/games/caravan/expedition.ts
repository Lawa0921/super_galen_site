import type { Rng } from './rng';
import type { Stat } from './types';
import type { SaveData } from './save';
import type { CheckResult } from './check';
import { resolveCheck, statMod } from './check';
import { partyCheckBonus } from './roster';
import type { CombatState, EnemyUnit, PartyMember } from './combat';
import type { JobId } from './data/jobs';
import type { TownDef } from './economy';
import { tradeSellPrice, totalWage, cargoCapacity } from './economy';

/** 遠征快照結構版本；save.ts 的 parseAndMigrate 用它防護舊版遠征快照（M4） */
export const EXPEDITION_VERSION = 2;

// ---------------------------------------------------------------------------
// Effect DSL（M3 鎖定，見 docs/superpowers/plans/2026-07-18-caravan-m3-expedition.md）
// ---------------------------------------------------------------------------

export type EffectSpec =
  | { type: 'gold'; amount: number }
  | { type: 'item'; itemId: string; count: number }
  | { type: 'hp'; target: 'protagonist' | 'party'; amount: number }
  | { type: 'flag'; flag: string; value: boolean }
  | { type: 'fight'; encounterId: string }
  | { type: 'discover'; locationId: string }
  | { type: 'log'; text: string };

export interface EventOption {
  label: string;
  requirement?: { job?: JobId; itemId?: string };
  check?: { stat: Stat; dc: number };
  success: EffectSpec[];
  failure?: EffectSpec[];
}

export interface EventCard {
  id: string;
  context: { locationIds?: string[]; kind?: 'route' | 'dungeon' };
  weight: number;
  requiresFlags?: Record<string, boolean>;
  title: string;
  body: string;
  /** 事件插圖路徑（M5 美術，僅旗標鏈與稀有事件） */
  art?: string;
  options: EventOption[];
}

export type RoomKind = 'fight' | 'treasure' | 'event' | 'rest' | 'unknown';

export interface LocationDef {
  id: string;
  name: string;
  kind: 'route' | 'dungeon';
  hidden?: boolean; // 需 discover 才會出現在委託板
  legs?: number; // route：事件數
  floors?: number;
  roomsPerFloor?: [number, number];
  bossEncounterId?: string; // dungeon
  encounterTable: Array<{ weight: number; encounterId: string }>;
  depthHpBonus?: number; // dungeon：每層敵人 maxHp 加值
  /** route 抵達的目的城鎮（economy.ts TownDef.id）；異鎮交易的落點，M4 起可選填 */
  destinationTownId?: string;
  /** 委託板可見門檻：save.reputation 未達此值時不列入 visibleLocations（M5，data/locations.ts） */
  minReputation?: number;
}

export interface ExpeditionState {
  locationId: string;
  kind: 'route' | 'dungeon';
  step: number; // route: 第幾段；dungeon: 第幾層
  totalSteps: number;
  phase: 'event' | 'room-choice' | 'combat' | 'aftermath' | 'done';
  currentEventId: string | null;
  roomChoices: RoomKind[] | null; // dungeon 每層抽出的房卡
  pendingEncounterId: string | null;
  loot: { gold: number; items: Record<string, number> };
  eventLog: string[]; // 遠征日誌（歸返結算顯示）
  retreated: boolean;
  /**
   * 遠征期間的即時生命值（partyId -> hp）。不在計畫文件鎖定的介面契約列表中，
   * 是實作 `hp` EffectSpec 所必需的延伸欄位（契約本身沒有別的地方能存這個數字）。
   * 由 startExpedition 用主角＋未重傷傭兵的 maxHp 初始化；戰鬥（Task 3 buildEncounter
   * / combat.ts memberFromRecord）目前仍各自以滿血起始，不讀這個值——Task 3 若要銜接
   * 「遠征受的傷會帶進戰鬥」，需額外決定要不要接上這裡。
   */
  partyHp: Record<string, number>;
  /** 遠征快照結構版本（M4）；save.ts loadGame 用它判斷舊版遠征快照是否該丟棄 */
  expeditionVersion: number;
  /** route 抵達的目的城鎮（economy.ts TownDef.id）；從 LocationDef 帶入，dungeon 無此值（M4） */
  destinationTownId?: string;
  /** 本趟押運貨物：itemId -> 件數，出發時從 save.inventory 移入（M4） */
  cargo: Record<string, number>;
}

// ---------------------------------------------------------------------------
// 城鎮登記表（M4）——與 registerLocations/registerEvents/registerEncounters 同一模式：
// data/towns.ts 在啟動時呼叫 registerTowns 把 TOWNS 灌進來；settleExpedition 的異鎮
// 交易需要依 destinationTownId 查回 TownDef 算 tradeSellPrice。
// ---------------------------------------------------------------------------

let townCatalog: Record<string, TownDef> = {};

export function registerTowns(towns: Record<string, TownDef>): void {
  townCatalog = towns;
}

function getTown(townId: string): TownDef | undefined {
  return townCatalog[townId];
}

// ---------------------------------------------------------------------------
// 內容目錄（location / event catalog）
//
// data/locations.ts、data/events.ts 要到 Task 4 才會建立，但 startExpedition/
// drawEvent 的簽名（跨任務鎖定）不帶目錄參數。這裡用一個模組層級的可變登記表
// 解套：Task 4 的資料檔（或載入資料檔的頁面）在啟動時呼叫 registerLocations /
// registerEvents 把 LOCATIONS / EVENTS 灌進來；本檔自己的測試則用假資料呼叫
// 這兩個函式模擬。
// ---------------------------------------------------------------------------

let locationCatalog: Record<string, LocationDef> = {};
let eventCatalog: EventCard[] = [];

export function registerLocations(locations: Record<string, LocationDef>): void {
  locationCatalog = locations;
}

export function registerEvents(events: EventCard[]): void {
  eventCatalog = events;
}

function getLocation(locationId: string): LocationDef | undefined {
  return locationCatalog[locationId];
}

// ---------------------------------------------------------------------------
// 狀態機
// ---------------------------------------------------------------------------

export function startExpedition(
  rng: Rng,
  save: SaveData,
  locationId: string,
  cargo: Record<string, number> = {}
): ExpeditionState {
  void rng; // 保留給 Task 3：地城開場可能要立刻 drawRooms
  const loc = getLocation(locationId);
  if (!loc) {
    throw new Error(`startExpedition: 找不到地點「${locationId}」`);
  }

  const wage = totalWage(save);
  if (save.gold < wage) {
    throw new Error(`startExpedition: 金幣不足支付薪餉（需 ${wage}，現有 ${save.gold}）`);
  }

  const cargoEntries = Object.entries(cargo).filter(([, count]) => count > 0);
  const cargoTotal = cargoEntries.reduce((sum, [, count]) => sum + count, 0);
  const capacity = cargoCapacity(save.wagonLevel);
  if (cargoTotal > capacity) {
    throw new Error(`startExpedition: 押貨總件數（${cargoTotal}）超過馬車載貨上限（${capacity}）`);
  }
  for (const [itemId, count] of cargoEntries) {
    if ((save.inventory[itemId] ?? 0) < count) {
      throw new Error(`startExpedition: 背包裡的「${itemId}」不足以押運 ${count} 件`);
    }
  }

  // 驗證全部通過才動手扣款/扣貨，避免半途丟錯留下髒狀態
  save.gold -= wage;
  const stateCargo: Record<string, number> = {};
  for (const [itemId, count] of cargoEntries) {
    save.inventory[itemId] -= count;
    stateCargo[itemId] = count;
  }

  const totalSteps = loc.kind === 'dungeon' ? (loc.floors ?? 1) : (loc.legs ?? 1);

  const partyHp: Record<string, number> = { [save.protagonist.id]: save.protagonist.maxHp };
  for (const companion of save.companions) {
    if (companion.injuredForTrips === 0) {
      partyHp[companion.id] = companion.maxHp;
    }
  }

  return {
    locationId,
    kind: loc.kind,
    step: 1,
    totalSteps,
    phase: loc.kind === 'dungeon' ? 'room-choice' : 'event',
    currentEventId: null,
    roomChoices: null,
    pendingEncounterId: null,
    loot: { gold: 0, items: {} },
    eventLog: [],
    retreated: false,
    partyHp,
    expeditionVersion: EXPEDITION_VERSION,
    destinationTownId: loc.destinationTownId,
    cargo: stateCargo,
  };
}

/** 過濾 context/requiresFlags 後加權抽；設 state.currentEventId/phase */
export function drawEvent(rng: Rng, state: ExpeditionState, save: SaveData): EventCard {
  const candidates = eventCatalog.filter((card) => {
    if (card.weight <= 0) return false;
    if (card.context.kind && card.context.kind !== state.kind) return false;
    if (
      card.context.locationIds &&
      card.context.locationIds.length > 0 &&
      !card.context.locationIds.includes(state.locationId)
    ) {
      return false;
    }
    if (card.requiresFlags) {
      for (const [flag, expected] of Object.entries(card.requiresFlags)) {
        if ((save.flags[flag] ?? false) !== expected) return false;
      }
    }
    return true;
  });
  if (candidates.length === 0) {
    throw new Error(
      `drawEvent: 找不到符合條件的事件卡（location=${state.locationId}, kind=${state.kind}）——資料設定錯誤`
    );
  }
  const card = rng.weightedPick(candidates.map((c) => ({ weight: c.weight, value: c })));
  state.currentEventId = card.id;
  state.phase = 'event';
  return card;
}

/** job 在隊上（主角或未重傷傭兵）？item 在包內？兩者皆須滿足（若都指定） */
export function optionAvailable(save: SaveData, opt: EventOption): boolean {
  const requirement = opt.requirement;
  if (!requirement) return true;
  if (requirement.job) {
    const hasJob =
      save.protagonist.job === requirement.job ||
      save.companions.some((c) => c.job === requirement.job && c.injuredForTrips === 0);
    if (!hasJob) return false;
  }
  if (requirement.itemId) {
    if ((save.inventory[requirement.itemId] ?? 0) <= 0) return false;
  }
  return true;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function applyHpEffect(
  state: ExpeditionState,
  save: SaveData,
  targetId: string,
  amount: number
): void {
  const isProtagonist = targetId === save.protagonist.id;
  const maxHp = isProtagonist
    ? save.protagonist.maxHp
    : save.companions.find((c) => c.id === targetId)?.maxHp;
  if (maxHp === undefined) return;
  const current = state.partyHp[targetId] ?? maxHp;
  // 遠征事件不打死人，只有戰鬥才會——所以下限是 1 不是 0
  state.partyHp[targetId] = clamp(current + amount, 1, maxHp);
}

function applyEffect(effect: EffectSpec, state: ExpeditionState, save: SaveData): void {
  switch (effect.type) {
    case 'gold':
      state.loot.gold += effect.amount;
      break;
    case 'item':
      if (effect.count > 0) {
        state.loot.items[effect.itemId] = (state.loot.items[effect.itemId] ?? 0) + effect.count;
      } else if (effect.count < 0) {
        save.inventory[effect.itemId] = Math.max(
          0,
          (save.inventory[effect.itemId] ?? 0) + effect.count
        );
      }
      break;
    case 'hp': {
      const targets =
        effect.target === 'protagonist' ? [save.protagonist.id] : Object.keys(state.partyHp);
      for (const id of targets) applyHpEffect(state, save, id, effect.amount);
      break;
    }
    case 'flag':
      save.flags[effect.flag] = effect.value;
      break;
    case 'fight':
      state.pendingEncounterId = effect.encounterId;
      state.phase = 'combat';
      break;
    case 'discover':
      save.flags[`discovered:${effect.locationId}`] = true;
      state.eventLog.push(`你發現了新地點：${effect.locationId}`);
      break;
    case 'log':
      state.eventLog.push(effect.text);
      break;
  }
}

/**
 * 擲骰（用主角對應屬性）、套 effects（fight 設 pendingEncounterId+phase='combat'；
 * 其餘立即入 loot/save）、推進 phase/step。
 */
export function resolveOption(
  rng: Rng,
  state: ExpeditionState,
  save: SaveData,
  card: EventCard,
  optIndex: number
): { check: CheckResult | null; effects: EffectSpec[] } {
  const opt = card.options[optIndex];
  if (!opt) {
    throw new Error(`resolveOption: 選項索引超出範圍（${optIndex}）`);
  }
  if (!optionAvailable(save, opt)) {
    throw new Error(`resolveOption: 選項「${opt.label}」不符資格`);
  }

  let check: CheckResult | null = null;
  let effects: EffectSpec[];
  if (opt.check) {
    const modifier = statMod(save.protagonist.stats[opt.check.stat]) + partyCheckBonus(save);
    check = resolveCheck(rng, { stat: opt.check.stat, dc: opt.check.dc, modifier });
    effects = check.success ? opt.success : (opt.failure ?? []);
  } else {
    effects = opt.success;
  }

  let triggeredFight = false;
  for (const effect of effects) {
    applyEffect(effect, state, save);
    if (effect.type === 'fight') {
      triggeredFight = true;
      break;
    }
  }

  if (!triggeredFight) {
    advanceExpedition(rng, state);
  }

  return { check, effects };
}

/** step+1；超過 totalSteps→phase='done'；dungeon 未到頂層→'room-choice'；route→'event' */
export function advanceExpedition(rng: Rng, state: ExpeditionState): void {
  void rng; // 保留給 Task 3：dungeon 進下一層可能要立刻 drawRooms
  state.step += 1;
  state.currentEventId = null;
  if (state.step > state.totalSteps) {
    state.phase = 'done';
  } else if (state.kind === 'dungeon') {
    state.phase = 'room-choice';
    state.roomChoices = null;
  } else {
    state.phase = 'event';
  }
}

/**
 * loot 入 save.gold/inventory；每存活出征者 xp += 20 + step*5；injuredForTrips>0 的隊員 -1。
 *
 * tradeSales（M4）：僅在抵達目的鎮（state.destinationTownId 存在）且未撤退/戰敗
 * （!state.retreated）時可用，否則丟 Error（防禦性，UI 應已擋）。逐項優先從
 * state.cargo 扣、不足再從 state.loot.items 扣（超出可售數量時只結算實際可售部分，
 * 不丟錯——與 resolveOption 的 item 負數 effect 同一「clamp 不 throw」風格），以
 * tradeSellPrice(destinationTown, itemId) 折現進 tradeGold（獨立於 goldGained，
 * 兩者相加才是真正併入 save.gold 的總額）。
 *
 * 未售出的 cargo 一律退回 save.inventory（含被 finishCombat 撤退/戰敗折半後的殘餘）。
 * 完成遠征（!state.retreated）聲望 +5。
 */
export function settleExpedition(
  state: ExpeditionState,
  save: SaveData,
  tradeSales: Array<{ itemId: string; count: number }> = []
): { goldGained: number; itemsGained: Record<string, number>; xpGained: number; tradeGold: number } {
  let tradeGold = 0;
  if (tradeSales.length > 0) {
    if (!state.destinationTownId || state.retreated) {
      throw new Error('settleExpedition: tradeSales 僅在抵達目的鎮且未撤退/戰敗時可用');
    }
    const town = getTown(state.destinationTownId);
    if (!town) {
      throw new Error(`settleExpedition: 找不到城鎮「${state.destinationTownId}」`);
    }
    for (const sale of tradeSales) {
      if (sale.count <= 0) continue;
      let remaining = sale.count;
      const fromCargo = Math.min(remaining, state.cargo[sale.itemId] ?? 0);
      if (fromCargo > 0) {
        state.cargo[sale.itemId] -= fromCargo;
        remaining -= fromCargo;
      }
      const fromLoot = Math.min(remaining, state.loot.items[sale.itemId] ?? 0);
      if (fromLoot > 0) {
        state.loot.items[sale.itemId] -= fromLoot;
        remaining -= fromLoot;
      }
      const sold = sale.count - remaining;
      if (sold > 0) {
        tradeGold += tradeSellPrice(town, sale.itemId) * sold;
      }
    }
  }

  const goldGained = state.loot.gold;
  const itemsGained = { ...state.loot.items };

  save.gold += goldGained + tradeGold;
  for (const [itemId, count] of Object.entries(itemsGained)) {
    if (count > 0) save.inventory[itemId] = (save.inventory[itemId] ?? 0) + count;
  }
  // 未售出的押貨（含撤退/戰敗折半後的殘餘）退回背包
  for (const [itemId, count] of Object.entries(state.cargo)) {
    if (count > 0) save.inventory[itemId] = (save.inventory[itemId] ?? 0) + count;
  }

  // 完賽時 step=totalSteps+1（advanceExpedition 遞增後才會把 phase 轉成 'done'），
  // 多出的那 5 xp 是完賽獎勵（刻意設計，非 bug——見 Task 2 report 的顧慮欄）。
  const xpGained = 20 + state.step * 5;
  save.protagonist.xp += xpGained;
  // 主角的重傷趟數也要遞減——只寫不減會讓主角永久卡在重傷（M3 終審抓到的地雷）
  save.protagonist.injuredForTrips = Math.max(0, save.protagonist.injuredForTrips - 1);
  for (const companion of save.companions) {
    if (companion.injuredForTrips === 0) {
      companion.xp += xpGained;
    } else {
      companion.injuredForTrips = Math.max(0, companion.injuredForTrips - 1);
    }
  }

  if (!state.retreated) {
    save.reputation += 5;
  }

  save.expedition = null;

  return { goldGained, itemsGained, xpGained, tradeGold };
}

// ---------------------------------------------------------------------------
// 迷宮房卡與戰鬥整合（Task 3）
// ---------------------------------------------------------------------------

let encounterCatalog: Record<string, () => EnemyUnit[]> = {};

/**
 * 登記遭遇表：encounterId -> 產生 EnemyUnit[] 的工廠函式。與 registerLocations/
 * registerEvents 同一模式——Task 4 的 data/enemies.ts（或載入資料檔的入口）啟動時呼叫；
 * 本檔測試用假表模擬。
 */
export function registerEncounters(table: Record<string, () => EnemyUnit[]>): void {
  encounterCatalog = table;
}

const ROOM_WEIGHTS: Array<{ weight: number; value: RoomKind }> = [
  { weight: 40, value: 'fight' },
  { weight: 20, value: 'treasure' },
  { weight: 20, value: 'event' },
  { weight: 10, value: 'rest' },
  { weight: 10, value: 'unknown' },
];

/**
 * dungeon 每層抽 2-3 張房卡（張數由 loc.roomsPerFloor 決定，未設定預設 [2,3]）；
 * 種類加權 fight40/treasure20/event20/rest10/unknown10，同層用不放回抽法保證不重複；
 * 頂層（step===totalSteps）固定 ['fight']（boss）。設定並回傳 state.roomChoices。
 */
export function drawRooms(rng: Rng, state: ExpeditionState): RoomKind[] {
  if (state.step === state.totalSteps) {
    state.roomChoices = ['fight'];
    return state.roomChoices;
  }

  const loc = getLocation(state.locationId);
  const [minRooms, maxRooms] = loc?.roomsPerFloor ?? [2, 3];
  const span = Math.max(1, maxRooms - minRooms + 1);
  const count = minRooms + rng.roll(span) - 1;

  const chosen: RoomKind[] = [];
  let pool = ROOM_WEIGHTS;
  for (let i = 0; i < count && pool.length > 0; i++) {
    const kind = rng.weightedPick(pool);
    chosen.push(kind);
    pool = pool.filter((entry) => entry.value !== kind);
  }
  state.roomChoices = chosen;
  return chosen;
}

/**
 * 依房型分派：
 * - fight：查樓層 encounterTable 加權抽 encounterId（頂層用 bossEncounterId）、設
 *   pendingEncounterId+phase='combat'（結算延到 finishCombat 呼 advanceExpedition）
 * - treasure：gold=roll(6)*10+step*10 入 loot；10% 機率（M3 簡化）固定給 1 個 'ore'；結算後 advanceExpedition
 * - rest：全隊 partyHp 回 1d6+2（不超過各自 maxHp，maxHp 從 save 的 roster 查）；結算後 advanceExpedition
 * - event：drawEvent（dungeon context，等玩家選項，不推進 step）
 * - unknown：rng 二選一實際化為 fight 或 treasure，遞迴走對應邏輯
 */
export function chooseRoom(
  rng: Rng,
  state: ExpeditionState,
  save: SaveData,
  room: RoomKind
): { event?: EventCard; encounterId?: string; restHealed?: number; treasureGold?: number } {
  switch (room) {
    case 'fight': {
      const loc = getLocation(state.locationId);
      if (!loc) {
        throw new Error(`chooseRoom: 找不到地點「${state.locationId}」`);
      }
      const isBoss = state.step === state.totalSteps;
      const encounterId =
        isBoss && loc.bossEncounterId
          ? loc.bossEncounterId
          : rng.weightedPick(
              loc.encounterTable.map((e) => ({ weight: e.weight, value: e.encounterId }))
            );
      state.pendingEncounterId = encounterId;
      state.phase = 'combat';
      return { encounterId };
    }
    case 'treasure': {
      const treasureGold = rng.roll(6) * 10 + state.step * 10;
      state.loot.gold += treasureGold;
      if (rng.next() < 0.1) {
        state.loot.items.ore = (state.loot.items.ore ?? 0) + 1;
      }
      advanceExpedition(rng, state);
      return { treasureGold };
    }
    case 'rest': {
      const restHealed = rng.roll(6) + 2;
      for (const id of Object.keys(state.partyHp)) {
        const maxHp =
          id === save.protagonist.id
            ? save.protagonist.maxHp
            : save.companions.find((c) => c.id === id)?.maxHp;
        if (maxHp === undefined) continue;
        state.partyHp[id] = Math.min(maxHp, state.partyHp[id] + restHealed);
      }
      advanceExpedition(rng, state);
      return { restHealed };
    }
    case 'event': {
      const event = drawEvent(rng, state, save);
      return { event };
    }
    case 'unknown': {
      const realized: RoomKind = rng.next() < 0.5 ? 'fight' : 'treasure';
      return chooseRoom(rng, state, save, realized);
    }
  }
}

/**
 * 查 registerEncounters 登記表生成敵人；dungeon 時每敵 maxHp/hp 套用
 * depthHpBonus×(step-1)（route 不加成）。
 */
export function buildEncounter(rng: Rng, state: ExpeditionState, encounterId: string): EnemyUnit[] {
  void rng; // 目前查表生成是決定性的，不需要隨機；保留參數位與其他遠征函式簽名一致
  const factory = encounterCatalog[encounterId];
  if (!factory) {
    throw new Error(`buildEncounter: 找不到遭遇「${encounterId}」（先呼叫 registerEncounters 登記）`);
  }
  const enemies = factory();
  if (state.kind === 'dungeon') {
    const loc = getLocation(state.locationId);
    const bonus = (loc?.depthHpBonus ?? 0) * (state.step - 1);
    if (bonus > 0) {
      for (const enemy of enemies) {
        enemy.maxHp += bonus;
        enemy.hp += bonus;
      }
    }
  }
  return enemies;
}

/**
 * 把 state.partyHp 覆蓋到對應 member.hp；partyHp 沒有的 key 不動該 member。
 * 供 Task 5 在組隊進入戰鬥前，把遠征期間累積的傷勢灌回 PartyMember。
 */
export function applyPartyHp(state: ExpeditionState, members: PartyMember[]): void {
  for (const member of members) {
    const hp = state.partyHp[member.id];
    if (hp !== undefined) member.hp = hp;
  }
}

/**
 * 戰鬥結束後把結果併回遠征狀態：
 * - partyHp 雙向同步：不論勝敗，combat.party 的最終 hp 都寫回 state.partyHp
 * - victory：每敵 loot（gold 區間 rng 均勻取整、itemChance 命中額外給 1 個 itemId）入
 *   state.loot，再呼 advanceExpedition 依 kind 推進 phase
 *   - 深度乘數（M4，dungeon 限定）：gold × (1+0.25×(step-1))，向下取整，先於下面的
 *     再殺折半套用
 *   - boss 擊殺（kind==='dungeon' 且 step===totalSteps）：reputation +10、
 *     locationId 記入 save.visitedBossDungeons（不重複）；若擊殺前 locationId 已在
 *     visitedBossDungeons（再殺），該場全部敵人 loot gold 再折半（向下取整）、
 *     itemChance 減半（M4 隱藏迷宮遞減報酬）
 * - retreated / defeat：state.retreated=true、loot.gold 折半（向下取整）、
 *   state.cargo 逐項折半（向下取整，殘餘留給 settleExpedition 退回背包）、
 *   phase='done' 提前結束遠征
 * - fates 套 save：dead 傭兵從 companions 移除（主角不移除）；injured →
 *   injuredForTrips=2（主角同）
 *
 * 契約缺口（詳見本任務報告「偏離契約之處」）：介面契約鎖定的簽名沒有 rng 參數，
 * 但 loot 的 gold 區間骰與 itemChance 判定必須要有隨機來源，這裡在第一個參數位
 * 加了 rng（與其餘遠征函式的慣例位置一致）。
 */
export function finishCombat(
  rng: Rng,
  state: ExpeditionState,
  save: SaveData,
  combat: CombatState,
  fates: Array<{ id: string; fate: 'injured' | 'dead' }>
): void {
  for (const member of combat.party) {
    state.partyHp[member.id] = member.hp;
  }

  if (combat.outcome === 'victory') {
    const isBossFight = state.kind === 'dungeon' && state.step === state.totalSteps;
    const isRepeatKill = isBossFight && save.visitedBossDungeons.includes(state.locationId);
    const depthMultiplier = state.kind === 'dungeon' ? 1 + 0.25 * (state.step - 1) : 1;

    for (const enemy of combat.enemies) {
      if (!enemy.loot) continue;
      const [min, max] = enemy.loot.gold;
      let gold = min + rng.roll(max - min + 1) - 1;
      gold = Math.floor(gold * depthMultiplier);
      if (isRepeatKill) {
        gold = Math.floor(gold / 2);
      }
      state.loot.gold += gold;
      if (enemy.loot.itemId && enemy.loot.itemChance) {
        const itemChance = isRepeatKill ? enemy.loot.itemChance / 2 : enemy.loot.itemChance;
        if (rng.next() < itemChance) {
          state.loot.items[enemy.loot.itemId] = (state.loot.items[enemy.loot.itemId] ?? 0) + 1;
        }
      }
    }

    if (isBossFight) {
      save.reputation += 10;
      if (!save.visitedBossDungeons.includes(state.locationId)) {
        save.visitedBossDungeons.push(state.locationId);
      }
    }

    advanceExpedition(rng, state);
  } else {
    state.retreated = true;
    state.loot.gold = Math.floor(state.loot.gold / 2);
    for (const itemId of Object.keys(state.cargo)) {
      state.cargo[itemId] = Math.floor(state.cargo[itemId] / 2);
    }
    state.phase = 'done';
  }
  state.pendingEncounterId = null;

  for (const fate of fates) {
    if (fate.fate === 'dead') {
      if (fate.id !== save.protagonist.id) {
        save.companions = save.companions.filter((c) => c.id !== fate.id);
      }
    } else if (fate.id === save.protagonist.id) {
      save.protagonist.injuredForTrips = 2;
    } else {
      const companion = save.companions.find((c) => c.id === fate.id);
      if (companion) companion.injuredForTrips = 2;
    }
  }
}
