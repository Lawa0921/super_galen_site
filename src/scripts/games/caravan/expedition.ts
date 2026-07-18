import type { Rng } from './rng';
import type { Stat } from './types';
import type { SaveData } from './save';
import type { CheckResult } from './check';
import { resolveCheck, statMod } from './check';
import type { CombatState, EnemyUnit } from './combat';
import type { JobId } from './data/jobs';

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

export function startExpedition(rng: Rng, save: SaveData, locationId: string): ExpeditionState {
  void rng; // 保留給 Task 3：地城開場可能要立刻 drawRooms
  const loc = getLocation(locationId);
  if (!loc) {
    throw new Error(`startExpedition: 找不到地點「${locationId}」`);
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
    const modifier = statMod(save.protagonist.stats[opt.check.stat]);
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

/** loot 入 save.gold/inventory；每存活出征者 xp += 20 + step*5；injuredForTrips>0 的隊員 -1 */
export function settleExpedition(
  state: ExpeditionState,
  save: SaveData
): { goldGained: number; itemsGained: Record<string, number>; xpGained: number } {
  const goldGained = state.loot.gold;
  const itemsGained = { ...state.loot.items };

  save.gold += goldGained;
  for (const [itemId, count] of Object.entries(itemsGained)) {
    save.inventory[itemId] = (save.inventory[itemId] ?? 0) + count;
  }

  const xpGained = 20 + state.step * 5;
  save.protagonist.xp += xpGained;
  for (const companion of save.companions) {
    if (companion.injuredForTrips === 0) {
      companion.xp += xpGained;
    } else {
      companion.injuredForTrips = Math.max(0, companion.injuredForTrips - 1);
    }
  }

  save.expedition = null;

  return { goldGained, itemsGained, xpGained };
}

// ---------------------------------------------------------------------------
// 迷宮房卡與戰鬥整合（Task 3）——型別先鎖定，函式本體留給 Task 3 實作
// ---------------------------------------------------------------------------

export function drawRooms(rng: Rng, state: ExpeditionState): RoomKind[] {
  void rng;
  void state;
  throw new Error('drawRooms: 尚未實作（Task 3）');
}

export function chooseRoom(
  rng: Rng,
  state: ExpeditionState,
  save: SaveData,
  room: RoomKind
): { event?: EventCard; encounterId?: string; restHealed?: number; treasureGold?: number } {
  void rng;
  void state;
  void save;
  void room;
  throw new Error('chooseRoom: 尚未實作（Task 3）');
}

export function buildEncounter(rng: Rng, state: ExpeditionState, encounterId: string): EnemyUnit[] {
  void rng;
  void state;
  void encounterId;
  throw new Error('buildEncounter: 尚未實作（Task 3）');
}

export function finishCombat(
  state: ExpeditionState,
  save: SaveData,
  combat: CombatState,
  fates: Array<{ id: string; fate: 'injured' | 'dead' }>
): void {
  void state;
  void save;
  void combat;
  void fates;
  throw new Error('finishCombat: 尚未實作（Task 3）');
}
