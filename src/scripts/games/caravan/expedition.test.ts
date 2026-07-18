import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerLocations,
  registerEvents,
  registerEncounters,
  registerTowns,
  startExpedition,
  drawEvent,
  optionAvailable,
  resolveOption,
  advanceExpedition,
  settleExpedition,
  drawRooms,
  chooseRoom,
  buildEncounter,
  finishCombat,
  applyPartyHp,
  EXPEDITION_VERSION,
} from './expedition';
import type { EventCard, LocationDef, ExpeditionState } from './expedition';
import { newGame } from './save';
import type { SaveData, CompanionRecord } from './save';
import type { Rng } from './rng';
import type { EnemyUnit, PartyMember, CombatState } from './combat';
import { tradeSellPrice } from './economy';
import type { TownDef } from './economy';

/** 依序回傳指定骰值的假 RNG；weightedPick 依 pickIndex 佇列選出候選陣列中的第幾個；next 依序回傳（預設全 0） */
function fakeRng(opts: { d20?: number[]; pickIndex?: number[]; next?: number[] } = {}): Rng {
  let d20i = 0;
  let picki = 0;
  let nexti = 0;
  const d20s = opts.d20 ?? [10];
  const picks = opts.pickIndex ?? [0];
  const nexts = opts.next ?? [0];
  return {
    next: () => nexts[nexti++ % nexts.length],
    roll: () => d20s[d20i++ % d20s.length],
    d20: () => d20s[d20i++ % d20s.length],
    pick: (arr) => arr[0],
    weightedPick: (items) => {
      if (items.length === 0) throw new Error('weightedPick: 空清單');
      const idx = picks[picki++ % picks.length];
      const hit = items[idx];
      if (!hit) throw new Error(`weightedPick: index 超出範圍（${idx}）`);
      return hit.value;
    },
  };
}

function makeEnemy(overrides: Partial<EnemyUnit> = {}): EnemyUnit {
  return {
    id: 'e1', name: '敵人',
    stats: { str: 10, dex: 10, int: 10, cha: 10, con: 10 },
    maxHp: 10, hp: 10, defense: 10, moves: [], intents: [],
    ...overrides,
  };
}

function makePartyMember(overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    id: 'protagonist', name: '主角',
    stats: { str: 12, dex: 12, int: 10, cha: 12, con: 12 },
    maxHp: 22, hp: 22, defense: 10, moves: [], isProtagonist: true,
    ...overrides,
  };
}

function makeCombat(overrides: Partial<CombatState> = {}): CombatState {
  return {
    round: 1, order: [], turnIndex: 0,
    party: [], enemies: [], guarding: {}, enemyIntents: {}, log: [], outcome: 'victory',
    ...overrides,
  };
}

const LOC_ROUTE_A: LocationDef = {
  id: 'loc_route_a', name: '臨水道', kind: 'route', legs: 2,
  encounterTable: [{ weight: 1, encounterId: 'enc_wolf' }],
  destinationTownId: 'town-a',
};
const LOC_ROUTE_B: LocationDef = {
  id: 'loc_route_b', name: '黑森林徑', kind: 'route', legs: 1, hidden: true,
  encounterTable: [{ weight: 1, encounterId: 'enc_goblin' }],
};
const LOC_DUNGEON_A: LocationDef = {
  id: 'loc_dungeon_a', name: '廢棄礦坑', kind: 'dungeon', floors: 3,
  roomsPerFloor: [2, 3], bossEncounterId: 'enc_boss',
  encounterTable: [{ weight: 1, encounterId: 'enc_spider' }],
  depthHpBonus: 2,
};

const TOWN_A: TownDef = {
  id: 'town-a', name: '測試鎮', desc: '測試用城鎮。',
  priceModifiers: { ore: 2 }, stock: ['ore', 'herb'],
};

function makeSave(overrides: Partial<SaveData> = {}): SaveData {
  const s = newGame(1000);
  return { ...s, ...overrides };
}

function makeCompanion(overrides: Partial<CompanionRecord> = {}): CompanionRecord {
  return {
    id: 'comp-1', name: '傭兵', job: 'cleric', level: 1, xp: 0,
    stats: { str: 10, dex: 10, int: 10, cha: 14, con: 12 },
    maxHp: 20, injuredForTrips: 0,
    ...overrides,
  };
}

function makeState(overrides: Partial<ExpeditionState> = {}): ExpeditionState {
  return {
    locationId: 'loc_route_a', kind: 'route', step: 1, totalSteps: 4,
    phase: 'event', currentEventId: null, roomChoices: null, pendingEncounterId: null,
    loot: { gold: 0, items: {} }, eventLog: [], retreated: false,
    partyHp: { protagonist: 22 },
    expeditionVersion: EXPEDITION_VERSION,
    cargo: {},
    ...overrides,
  };
}

const evUniversal: EventCard = {
  id: 'ev_universal', context: {}, weight: 1,
  title: '路遇行商', body: '一名行商向你招手。',
  options: [{ label: '打聲招呼', success: [{ type: 'log', text: '你與行商寒暄了幾句。' }] }],
};
const evRouteAOnly: EventCard = {
  id: 'ev_route_a_only', context: { locationIds: ['loc_route_a'] }, weight: 1,
  title: '水道旁的告示', body: '木樁上釘著一張告示。', options: [{ label: '看看', success: [] }],
};
const evDungeonOnly: EventCard = {
  id: 'ev_dungeon_only', context: { kind: 'dungeon' }, weight: 1,
  title: '坑道回聲', body: '深處傳來奇異的回聲。', options: [{ label: '前進', success: [] }],
};
const evWeightZero: EventCard = {
  id: 'ev_weight_zero', context: {}, weight: 0,
  title: '不該出現的卡', body: '……', options: [{ label: '？', success: [] }],
};
const evFlagged: EventCard = {
  id: 'ev_flagged', context: {}, weight: 1, requiresFlags: { met_guildmaster: true },
  title: '公會的委託', body: '公會長交代的後續。', options: [{ label: '接下', success: [] }],
};

beforeEach(() => {
  registerLocations({
    loc_route_a: LOC_ROUTE_A,
    loc_route_b: LOC_ROUTE_B,
    loc_dungeon_a: LOC_DUNGEON_A,
  });
  registerEvents([evUniversal, evRouteAOnly, evDungeonOnly, evWeightZero, evFlagged]);
  registerTowns({ 'town-a': TOWN_A });
});

describe('startExpedition', () => {
  it('route 地點：totalSteps=legs、phase=event、step=1、loot 歸零', () => {
    const save = makeSave();
    const state = startExpedition(fakeRng(), save, 'loc_route_a');
    expect(state.kind).toBe('route');
    expect(state.totalSteps).toBe(2);
    expect(state.step).toBe(1);
    expect(state.phase).toBe('event');
    expect(state.loot).toEqual({ gold: 0, items: {} });
    expect(state.retreated).toBe(false);
  });

  it('dungeon 地點：totalSteps=floors、phase=room-choice', () => {
    const save = makeSave();
    const state = startExpedition(fakeRng(), save, 'loc_dungeon_a');
    expect(state.kind).toBe('dungeon');
    expect(state.totalSteps).toBe(3);
    expect(state.phase).toBe('room-choice');
  });

  it('不存在的地點 id 丟 Error', () => {
    const save = makeSave();
    expect(() => startExpedition(fakeRng(), save, 'no-such-place')).toThrow();
  });

  it('partyHp 只含主角與未重傷的傭兵', () => {
    const save = makeSave({
      companions: [
        makeCompanion({ id: 'healthy', maxHp: 18, injuredForTrips: 0 }),
        makeCompanion({ id: 'hurt', maxHp: 16, injuredForTrips: 2 }),
      ],
    });
    const state = startExpedition(fakeRng(), save, 'loc_route_a');
    expect(state.partyHp[save.protagonist.id]).toBe(save.protagonist.maxHp);
    expect(state.partyHp.healthy).toBe(18);
    expect(state.partyHp.hurt).toBeUndefined();
  });

  it('expeditionVersion 戳記為 EXPEDITION_VERSION', () => {
    const save = makeSave();
    const state = startExpedition(fakeRng(), save, 'loc_route_a');
    expect(state.expeditionVersion).toBe(EXPEDITION_VERSION);
  });

  it('destinationTownId 從 LocationDef 帶入（route）', () => {
    const save = makeSave();
    const state = startExpedition(fakeRng(), save, 'loc_route_a');
    expect(state.destinationTownId).toBe('town-a');
  });

  it('destinationTownId 未設定時（dungeon）維持 undefined', () => {
    const save = makeSave();
    const state = startExpedition(fakeRng(), save, 'loc_dungeon_a');
    expect(state.destinationTownId).toBeUndefined();
  });

  it('未帶 cargo 時 state.cargo 為空物件（既有呼叫處相容）', () => {
    const save = makeSave();
    const state = startExpedition(fakeRng(), save, 'loc_route_a');
    expect(state.cargo).toEqual({});
  });

  it('未帶 cargo、無傭兵時薪餉為 0，save.gold 不變（既有呼叫處相容）', () => {
    const save = makeSave({ gold: 200 });
    startExpedition(fakeRng(), save, 'loc_route_a');
    expect(save.gold).toBe(200);
  });

  it('扣除 totalWage(save) 作為薪餉；有未重傷傭兵時 save.gold 減少對應金額', () => {
    const save = makeSave({
      gold: 200,
      companions: [makeCompanion({ id: 'c1', level: 1, injuredForTrips: 0 })], // wage=8+4=12
    });
    startExpedition(fakeRng(), save, 'loc_route_a');
    expect(save.gold).toBe(188);
  });

  it('金幣不足支付薪餉時丟 Error，且不改動 save', () => {
    const save = makeSave({
      gold: 5,
      companions: [makeCompanion({ id: 'c1', level: 1, injuredForTrips: 0 })], // wage=12
    });
    expect(() => startExpedition(fakeRng(), save, 'loc_route_a')).toThrow();
    expect(save.gold).toBe(5);
  });

  it('cargo 逐項從 save.inventory 移入 state.cargo，且不超過 cargoCapacity 時成功', () => {
    const save = makeSave({ inventory: { ore: 3, herb: 2 } }); // wagonLevel=0 → capacity=6
    const state = startExpedition(fakeRng(), save, 'loc_route_a', { ore: 2, herb: 1 });
    expect(state.cargo).toEqual({ ore: 2, herb: 1 });
    expect(save.inventory.ore).toBe(1);
    expect(save.inventory.herb).toBe(1);
  });

  it('cargo 總件數超過 cargoCapacity(save.wagonLevel) 時丟 Error，且不改動 inventory', () => {
    const save = makeSave({ inventory: { ore: 10 } }); // capacity=6
    expect(() => startExpedition(fakeRng(), save, 'loc_route_a', { ore: 7 })).toThrow();
    expect(save.inventory.ore).toBe(10);
  });

  it('cargo 指定物品在 save.inventory 中數量不足時丟 Error，且不改動 inventory', () => {
    const save = makeSave({ inventory: { ore: 1 } });
    expect(() => startExpedition(fakeRng(), save, 'loc_route_a', { ore: 3 })).toThrow();
    expect(save.inventory.ore).toBe(1);
  });
});

describe('drawEvent', () => {
  it('context.locationIds 指定時只在該地點出現', () => {
    const save = makeSave();
    const stateB = makeState({ locationId: 'loc_route_b' });
    // 候選過濾後只剩 evUniversal：evRouteAOnly 鎖定 loc_route_a 被排除、
    // evDungeonOnly 因 kind 不符被排除、evWeightZero/evFlagged 各自被排除
    const card = drawEvent(fakeRng({ pickIndex: [0] }), stateB, save);
    expect(card.id).toBe('ev_universal');
  });

  it('未填 locationIds 的卡視為通用，任何地點皆可能出現', () => {
    const save = makeSave();
    const stateA = makeState({ locationId: 'loc_route_a' });
    // 候選：[evUniversal, evRouteAOnly]，指定 pickIndex=1 抽出限定卡
    const card = drawEvent(fakeRng({ pickIndex: [1] }), stateA, save);
    expect(card.id).toBe('ev_route_a_only');
  });

  it('context.kind 過濾：dungeon 限定卡不會出現在 route', () => {
    registerEvents([evUniversal, evDungeonOnly]);
    const save = makeSave();
    const stateA = makeState({ locationId: 'loc_route_a', kind: 'route' });
    // evDungeonOnly 被過濾掉後候選只剩 evUniversal，無論 pickIndex 為何都只能抽到它
    const card = drawEvent(fakeRng({ pickIndex: [0] }), stateA, save);
    expect(card.id).toBe('ev_universal');
  });

  it('context.kind 過濾：dungeon 狀態下 dungeon 限定卡入選', () => {
    const save = makeSave();
    const stateDungeon = makeState({ locationId: 'loc_dungeon_a', kind: 'dungeon' });
    // 候選（dungeon）：[evUniversal, evDungeonOnly]
    const card = drawEvent(fakeRng({ pickIndex: [1] }), stateDungeon, save);
    expect(card.id).toBe('ev_dungeon_only');
  });

  it('weight<=0 的卡永遠不會入選候選', () => {
    registerEvents([evWeightZero]);
    const save = makeSave();
    expect(() => drawEvent(fakeRng(), makeState(), save)).toThrow();
  });

  it('requiresFlags 未滿足時排除該卡', () => {
    const save = makeSave({ flags: {} });
    const state = makeState();
    // 候選：[evUniversal, evRouteAOnly]（evFlagged 因 met_guildmaster 不為 true 被排除）
    const card = drawEvent(fakeRng({ pickIndex: [0] }), state, save);
    expect(card.id).not.toBe('ev_flagged');
  });

  it('requiresFlags 完全相等時該卡入選候選', () => {
    registerEvents([evFlagged]);
    const save = makeSave({ flags: { met_guildmaster: true } });
    const card = drawEvent(fakeRng({ pickIndex: [0] }), makeState(), save);
    expect(card.id).toBe('ev_flagged');
  });

  it('設定 state.currentEventId 與 phase=event', () => {
    const save = makeSave();
    const state = makeState({ phase: 'room-choice', currentEventId: null });
    const card = drawEvent(fakeRng({ pickIndex: [0] }), state, save);
    expect(state.currentEventId).toBe(card.id);
    expect(state.phase).toBe('event');
  });

  it('候選為空集合（資料錯誤）丟 Error', () => {
    registerEvents([evDungeonOnly]); // route 狀態下必然過濾光
    const save = makeSave();
    expect(() => drawEvent(fakeRng(), makeState({ kind: 'route' }), save)).toThrow();
  });
});

describe('optionAvailable', () => {
  it('無 requirement 一律可用', () => {
    const save = makeSave();
    expect(optionAvailable(save, { label: 'x', success: [] })).toBe(true);
  });

  it('job requirement：主角職業本身符合', () => {
    const save = makeSave(); // protagonist job = swordsman
    expect(optionAvailable(save, { label: 'x', requirement: { job: 'swordsman' }, success: [] })).toBe(true);
  });

  it('job requirement：未重傷傭兵職業符合', () => {
    const save = makeSave({ companions: [makeCompanion({ job: 'cleric', injuredForTrips: 0 })] });
    expect(optionAvailable(save, { label: 'x', requirement: { job: 'cleric' }, success: [] })).toBe(true);
  });

  it('job requirement：只有重傷傭兵持有該職業時視為不符', () => {
    const save = makeSave({ companions: [makeCompanion({ job: 'cleric', injuredForTrips: 2 })] });
    expect(optionAvailable(save, { label: 'x', requirement: { job: 'cleric' }, success: [] })).toBe(false);
  });

  it('itemId requirement：持有數量 >0 才符合', () => {
    const save = makeSave({ inventory: { herb: 1 } });
    expect(optionAvailable(save, { label: 'x', requirement: { itemId: 'herb' }, success: [] })).toBe(true);
  });

  it('itemId requirement：未持有時不符', () => {
    const save = makeSave({ inventory: {} });
    expect(optionAvailable(save, { label: 'x', requirement: { itemId: 'herb' }, success: [] })).toBe(false);
  });

  it('同時要求 job 與 itemId：只滿足一項仍視為不符', () => {
    const save = makeSave({ inventory: { herb: 1 } }); // protagonist 不是 cleric
    expect(
      optionAvailable(save, { label: 'x', requirement: { job: 'cleric', itemId: 'herb' }, success: [] })
    ).toBe(false);
  });
});

describe('resolveOption', () => {
  it('requirement 不滿足時丟 Error（防禦性，UI 應已 disabled）', () => {
    const save = makeSave({ inventory: {} });
    const state = makeState();
    const card: EventCard = {
      id: 'c', context: {}, weight: 1, title: 't', body: 'b',
      options: [{ label: '用藥草', requirement: { itemId: 'herb' }, success: [] }],
    };
    expect(() => resolveOption(fakeRng(), state, save, card, 0)).toThrow();
  });

  it('optIndex 超出範圍丟 Error', () => {
    const save = makeSave();
    const state = makeState();
    const card: EventCard = { id: 'c', context: {}, weight: 1, title: 't', body: 'b', options: [] };
    expect(() => resolveOption(fakeRng(), state, save, card, 0)).toThrow();
  });

  it('無 check：直接套用 success 效果，check 回傳 null', () => {
    const save = makeSave();
    const state = makeState();
    const card: EventCard = {
      id: 'c', context: {}, weight: 1, title: 't', body: 'b',
      options: [{ label: '拾金', success: [{ type: 'gold', amount: 5 }] }],
    };
    const result = resolveOption(fakeRng(), state, save, card, 0);
    expect(result.check).toBeNull();
    expect(state.loot.gold).toBe(5);
  });

  it('有 check：成功時套用 success 效果', () => {
    const save = makeSave(); // protagonist str=14 → statMod(14)=+2
    const state = makeState();
    const card: EventCard = {
      id: 'c', context: {}, weight: 1, title: 't', body: 'b',
      options: [{
        label: '試著搬開巨石', check: { stat: 'str', dc: 10 },
        success: [{ type: 'gold', amount: 10 }],
        failure: [{ type: 'gold', amount: 0 }],
      }],
    };
    // d20=10 → total=10+2=12 >= dc10 → success
    const result = resolveOption(fakeRng({ d20: [10] }), state, save, card, 0);
    expect(result.check?.success).toBe(true);
    expect(state.loot.gold).toBe(10);
  });

  it('有 check：失敗時套用 failure 效果', () => {
    const save = makeSave();
    const state = makeState();
    const card: EventCard = {
      id: 'c', context: {}, weight: 1, title: 't', body: 'b',
      options: [{
        label: '試著搬開巨石', check: { stat: 'str', dc: 20 },
        success: [{ type: 'gold', amount: 10 }],
        failure: [{ type: 'log', text: '你沒能搬動巨石。' }],
      }],
    };
    // d20=2 → total=2+2=4 < dc20 → failure
    const result = resolveOption(fakeRng({ d20: [2] }), state, save, card, 0);
    expect(result.check?.success).toBe(false);
    expect(state.loot.gold).toBe(0);
    expect(state.eventLog).toContain('你沒能搬動巨石。');
  });

  it('check 失敗但沒有 failure 陣列：不套用任何效果也不拋錯', () => {
    const save = makeSave();
    const state = makeState();
    const card: EventCard = {
      id: 'c', context: {}, weight: 1, title: 't', body: 'b',
      options: [{ label: '賭一把', check: { stat: 'str', dc: 20 }, success: [{ type: 'gold', amount: 99 }] }],
    };
    const result = resolveOption(fakeRng({ d20: [1] }), state, save, card, 0);
    expect(result.effects).toEqual([]);
    expect(state.loot.gold).toBe(0);
  });

  it('effect gold：疊加進 state.loot.gold（可負數）', () => {
    const save = makeSave();
    const state = makeState({ loot: { gold: 5, items: {} } });
    const card: EventCard = {
      id: 'c', context: {}, weight: 1, title: 't', body: 'b',
      options: [{ label: '被打劫', success: [{ type: 'gold', amount: -3 }] }],
    };
    resolveOption(fakeRng(), state, save, card, 0);
    expect(state.loot.gold).toBe(2);
  });

  it('effect item 正數：進 state.loot.items', () => {
    const save = makeSave();
    const state = makeState();
    const card: EventCard = {
      id: 'c', context: {}, weight: 1, title: 't', body: 'b',
      options: [{ label: '拾獲藥草', success: [{ type: 'item', itemId: 'herb', count: 2 }] }],
    };
    resolveOption(fakeRng(), state, save, card, 0);
    expect(state.loot.items.herb).toBe(2);
  });

  it('effect item 負數：直接扣 save.inventory（不進 loot），不低於 0', () => {
    const save = makeSave({ inventory: { herb: 1 } });
    const state = makeState();
    const card: EventCard = {
      id: 'c', context: {}, weight: 1, title: 't', body: 'b',
      options: [{ label: '用掉藥草', requirement: { itemId: 'herb' },
        success: [{ type: 'item', itemId: 'herb', count: -5 }] }],
    };
    resolveOption(fakeRng(), state, save, card, 0);
    expect(save.inventory.herb).toBe(0);
    expect(state.loot.items.herb).toBeUndefined();
  });

  it('effect hp target=protagonist：扣血但不低於 1', () => {
    const save = makeSave();
    const state = makeState({ partyHp: { [save.protagonist.id]: 3 } });
    const card: EventCard = {
      id: 'c', context: {}, weight: 1, title: 't', body: 'b',
      options: [{ label: '踩到陷阱', success: [{ type: 'hp', target: 'protagonist', amount: -99 }] }],
    };
    resolveOption(fakeRng(), state, save, card, 0);
    expect(state.partyHp[save.protagonist.id]).toBe(1);
  });

  it('effect hp target=party：套用到所有 partyHp 中的成員', () => {
    const save = makeSave({ companions: [makeCompanion({ id: 'ally', maxHp: 20, injuredForTrips: 0 })] });
    const state = makeState({
      partyHp: { [save.protagonist.id]: save.protagonist.maxHp, ally: 20 },
    });
    const card: EventCard = {
      id: 'c', context: {}, weight: 1, title: 't', body: 'b',
      options: [{ label: '毒霧', success: [{ type: 'hp', target: 'party', amount: -5 }] }],
    };
    resolveOption(fakeRng(), state, save, card, 0);
    expect(state.partyHp[save.protagonist.id]).toBe(save.protagonist.maxHp - 5);
    expect(state.partyHp.ally).toBe(15);
  });

  it('effect flag：寫入 save.flags', () => {
    const save = makeSave();
    const state = makeState();
    const card: EventCard = {
      id: 'c', context: {}, weight: 1, title: 't', body: 'b',
      options: [{ label: '答應委託', success: [{ type: 'flag', flag: 'met_guildmaster', value: true }] }],
    };
    resolveOption(fakeRng(), state, save, card, 0);
    expect(save.flags.met_guildmaster).toBe(true);
  });

  it('effect fight：設定 pendingEncounterId 與 phase=combat，且中止自動推進（step 不變）', () => {
    const save = makeSave();
    const state = makeState({ step: 1 });
    const card: EventCard = {
      id: 'c', context: {}, weight: 1, title: 't', body: 'b',
      options: [{ label: '遭到伏擊', success: [{ type: 'fight', encounterId: 'enc_wolf' }] }],
    };
    resolveOption(fakeRng(), state, save, card, 0);
    expect(state.pendingEncounterId).toBe('enc_wolf');
    expect(state.phase).toBe('combat');
    expect(state.step).toBe(1); // 沒有呼叫 advanceExpedition
  });

  it('effect discover：寫入 discovered:<id> 旗標並記入 eventLog', () => {
    const save = makeSave();
    const state = makeState();
    const card: EventCard = {
      id: 'c', context: {}, weight: 1, title: 't', body: 'b',
      options: [{ label: '追查線索', success: [{ type: 'discover', locationId: 'goblin-cave' }] }],
    };
    resolveOption(fakeRng(), state, save, card, 0);
    expect(save.flags['discovered:goblin-cave']).toBe(true);
    expect(state.eventLog.some((line) => line.includes('goblin-cave'))).toBe(true);
  });

  it('effect log：文字進 eventLog', () => {
    const save = makeSave();
    const state = makeState();
    const card: EventCard = {
      id: 'c', context: {}, weight: 1, title: 't', body: 'b',
      options: [{ label: '沉思', success: [{ type: 'log', text: '你在原地沉思了片刻。' }] }],
    };
    resolveOption(fakeRng(), state, save, card, 0);
    expect(state.eventLog).toEqual(['你在原地沉思了片刻。']);
  });

  it('多個效果依陣列順序逐一套用', () => {
    const save = makeSave();
    const state = makeState();
    const card: EventCard = {
      id: 'c', context: {}, weight: 1, title: 't', body: 'b',
      options: [{
        label: '搜刮', success: [
          { type: 'gold', amount: 3 },
          { type: 'item', itemId: 'ore', count: 1 },
          { type: 'log', text: '你搜刮了一番。' },
        ],
      }],
    };
    resolveOption(fakeRng(), state, save, card, 0);
    expect(state.loot.gold).toBe(3);
    expect(state.loot.items.ore).toBe(1);
    expect(state.eventLog).toEqual(['你搜刮了一番。']);
  });

  it('非 fight 效果結尾會呼叫 advanceExpedition（step 前進）', () => {
    const save = makeSave();
    const state = makeState({ step: 1, totalSteps: 4 });
    const card: EventCard = {
      id: 'c', context: {}, weight: 1, title: 't', body: 'b',
      options: [{ label: '前進', success: [{ type: 'log', text: '你繼續上路。' }] }],
    };
    resolveOption(fakeRng(), state, save, card, 0);
    expect(state.step).toBe(2);
    expect(state.phase).toBe('event');
  });
});

describe('advanceExpedition', () => {
  it('route：step+1 未超過 totalSteps 時 phase 維持 event', () => {
    const state = makeState({ kind: 'route', step: 1, totalSteps: 4, phase: 'combat' });
    advanceExpedition(fakeRng(), state);
    expect(state.step).toBe(2);
    expect(state.phase).toBe('event');
  });

  it('step 超過 totalSteps 時 phase=done', () => {
    const state = makeState({ kind: 'route', step: 4, totalSteps: 4 });
    advanceExpedition(fakeRng(), state);
    expect(state.step).toBe(5);
    expect(state.phase).toBe('done');
  });

  it('dungeon：未到頂層時 phase=room-choice', () => {
    const state = makeState({ kind: 'dungeon', step: 1, totalSteps: 3, phase: 'combat' });
    advanceExpedition(fakeRng(), state);
    expect(state.step).toBe(2);
    expect(state.phase).toBe('room-choice');
  });

  it('推進時清空 currentEventId', () => {
    const state = makeState({ step: 1, totalSteps: 4, currentEventId: 'ev_universal' });
    advanceExpedition(fakeRng(), state);
    expect(state.currentEventId).toBeNull();
  });
});

describe('settleExpedition', () => {
  it('loot 的 gold 與 items 併入 save', () => {
    const save = makeSave({ gold: 100, inventory: { ore: 1 } });
    const state = makeState({ loot: { gold: 30, items: { ore: 2, herb: 1 } }, step: 2 });
    settleExpedition(state, save);
    expect(save.gold).toBe(130);
    expect(save.inventory).toEqual({ ore: 3, herb: 1 });
  });

  it('xp = 20 + step*5，主角一定拿到', () => {
    const save = makeSave();
    const state = makeState({ step: 3 });
    const result = settleExpedition(state, save);
    expect(result.xpGained).toBe(35);
    expect(save.protagonist.xp).toBe(35);
  });

  it('未重傷傭兵一起拿 xp', () => {
    const save = makeSave({ companions: [makeCompanion({ id: 'c1', xp: 0, injuredForTrips: 0 })] });
    const state = makeState({ step: 1 });
    settleExpedition(state, save);
    expect(save.companions[0].xp).toBe(25);
  });

  it('重傷傭兵不拿 xp，injuredForTrips -1', () => {
    const save = makeSave({ companions: [makeCompanion({ id: 'c1', xp: 0, injuredForTrips: 2 })] });
    const state = makeState({ step: 1 });
    settleExpedition(state, save);
    expect(save.companions[0].xp).toBe(0);
    expect(save.companions[0].injuredForTrips).toBe(1);
  });

  it('injuredForTrips 不會降到 0 以下', () => {
    const save = makeSave({ companions: [makeCompanion({ id: 'c1', injuredForTrips: 0 })] });
    const state = makeState({ step: 1 });
    settleExpedition(state, save);
    expect(save.companions[0].injuredForTrips).toBe(0);
  });

  it('主角的 injuredForTrips 也會遞減（不遞減會永久卡在重傷——M3 終審地雷）', () => {
    const save = makeSave();
    save.protagonist.injuredForTrips = 2;
    const state = makeState({ step: 1 });
    settleExpedition(state, save);
    expect(save.protagonist.injuredForTrips).toBe(1);
    settleExpedition(makeState({ step: 1 }), save);
    expect(save.protagonist.injuredForTrips).toBe(0);
  });

  it('結算後 save.expedition 清為 null', () => {
    const save = makeSave();
    save.expedition = makeState();
    settleExpedition(makeState({ step: 1 }), save);
    expect(save.expedition).toBeNull();
  });

  it('回傳 goldGained/itemsGained/xpGained/tradeGold 摘要（無 tradeSales 時 tradeGold=0）', () => {
    const save = makeSave();
    const state = makeState({ loot: { gold: 12, items: { herb: 1 } }, step: 1 });
    const result = settleExpedition(state, save);
    expect(result).toEqual({ goldGained: 12, itemsGained: { herb: 1 }, xpGained: 25, tradeGold: 0 });
  });

  it('完成遠征（!retreated）聲望 +5', () => {
    const save = makeSave();
    expect(save.reputation).toBe(0);
    settleExpedition(makeState({ step: 1, retreated: false }), save);
    expect(save.reputation).toBe(5);
  });

  it('撤退/戰敗（retreated=true）不加聲望', () => {
    const save = makeSave();
    settleExpedition(makeState({ step: 1, retreated: true }), save);
    expect(save.reputation).toBe(0);
  });

  it('cargo 未售出時原封退回 save.inventory', () => {
    const save = makeSave({ inventory: {} });
    const state = makeState({ cargo: { ore: 3 }, step: 1 });
    settleExpedition(state, save);
    expect(save.inventory.ore).toBe(3);
  });

  it('tradeSales：destinationTownId 存在且未撤退時，依 tradeSellPrice 折現入 tradeGold，優先扣 cargo', () => {
    const save = makeSave({ inventory: {} });
    const state = makeState({
      destinationTownId: 'town-a', retreated: false, step: 1,
      cargo: { ore: 2 }, loot: { gold: 0, items: {} },
    });
    // ore priceModifier=2 → tradeSellPrice = round(12*2*0.9) = round(21.6) = 22
    const result = settleExpedition(state, save, [{ itemId: 'ore', count: 2 }]);
    expect(result.tradeGold).toBe(44);
    expect(save.gold).toBe(200 + 44);
    expect(state.cargo.ore).toBe(0);
    expect(save.inventory.ore ?? 0).toBe(0);
  });

  it('tradeSales：cargo 不足時接著扣 state.loot.items', () => {
    const save = makeSave({ inventory: {} });
    const state = makeState({
      destinationTownId: 'town-a', retreated: false, step: 1,
      cargo: { ore: 1 }, loot: { gold: 0, items: { ore: 2 } },
    });
    const result = settleExpedition(state, save, [{ itemId: 'ore', count: 2 }]);
    expect(result.tradeGold).toBe(44); // 22 * 2 件
    expect(state.cargo.ore).toBe(0);
    expect(state.loot.items.ore).toBe(1); // 2 件 loot 只用掉 1 件
    expect(save.inventory.ore).toBe(1); // 剩下 1 件 loot.ore 併入 itemsGained
  });

  it('tradeSales：只結算實際可售數量，超賣的部分不折現也不丟錯', () => {
    const save = makeSave({ inventory: {} });
    const state = makeState({
      destinationTownId: 'town-a', retreated: false, step: 1,
      cargo: { ore: 1 }, loot: { gold: 0, items: {} },
    });
    const result = settleExpedition(state, save, [{ itemId: 'ore', count: 5 }]);
    expect(result.tradeGold).toBe(22); // 只賣得出 1 件
  });

  it('tradeSales：state.destinationTownId 未設定時丟 Error', () => {
    const save = makeSave();
    const state = makeState({ destinationTownId: undefined, retreated: false, cargo: { ore: 1 } });
    expect(() => settleExpedition(state, save, [{ itemId: 'ore', count: 1 }])).toThrow();
  });

  it('tradeSales：state.retreated=true 時丟 Error（撤退/戰敗不得交易）', () => {
    const save = makeSave();
    const state = makeState({ destinationTownId: 'town-a', retreated: true, cargo: { ore: 1 } });
    expect(() => settleExpedition(state, save, [{ itemId: 'ore', count: 1 }])).toThrow();
  });

  it('空 tradeSales 陣列（預設）即使 destinationTownId 缺失或已撤退也不丟錯', () => {
    const save = makeSave();
    const state = makeState({ destinationTownId: undefined, retreated: true });
    expect(() => settleExpedition(state, save)).not.toThrow();
  });
});

describe('drawRooms', () => {
  it('非頂層：張數由 loc.roomsPerFloor 決定（roll 選 span 內的低點）', () => {
    const state = makeState({ locationId: 'loc_dungeon_a', kind: 'dungeon', step: 1, totalSteps: 3 });
    // LOC_DUNGEON_A.roomsPerFloor=[2,3]，span=2；roll 回 1 → count=2+1-1=2
    const chosen = drawRooms(fakeRng({ d20: [1], pickIndex: [0, 0] }), state);
    expect(chosen.length).toBe(2);
    expect(state.roomChoices).toEqual(chosen);
  });

  it('非頂層：roll 選 span 內的高點時抽 3 張', () => {
    const state = makeState({ locationId: 'loc_dungeon_a', kind: 'dungeon', step: 1, totalSteps: 3 });
    // roll 回 2 → count=2+2-1=3
    const chosen = drawRooms(fakeRng({ d20: [2], pickIndex: [0, 0, 0] }), state);
    expect(chosen.length).toBe(3);
  });

  it('同層不重複抽同型（不放回抽法）', () => {
    const state = makeState({ locationId: 'loc_dungeon_a', kind: 'dungeon', step: 1, totalSteps: 3 });
    const chosen = drawRooms(fakeRng({ d20: [2], pickIndex: [0, 0, 0] }), state);
    // pool 依序 [fight,treasure,event,rest,unknown]；每抽一張就從剩餘池移除，
    // pickIndex 全 0 代表每次都選「剩餘池的第一個」→ fight, treasure, event
    expect(chosen).toEqual(['fight', 'treasure', 'event']);
    expect(new Set(chosen).size).toBe(chosen.length);
  });

  it('頂層（step===totalSteps）固定 [\'fight\']（boss）', () => {
    const state = makeState({ locationId: 'loc_dungeon_a', kind: 'dungeon', step: 3, totalSteps: 3 });
    const chosen = drawRooms(fakeRng(), state);
    expect(chosen).toEqual(['fight']);
    expect(state.roomChoices).toEqual(['fight']);
  });

  it('未指定 roomsPerFloor 時預設 [2,3]', () => {
    registerLocations({
      loc_dungeon_b: {
        id: 'loc_dungeon_b', name: '哥布林巢穴', kind: 'dungeon', floors: 2,
        encounterTable: [{ weight: 1, encounterId: 'enc_goblin_nest' }],
      },
    });
    const state = makeState({ locationId: 'loc_dungeon_b', kind: 'dungeon', step: 1, totalSteps: 2 });
    // 預設 span=[2,3]→span=2；roll 回 2 → count=2+2-1=3
    const chosen = drawRooms(fakeRng({ d20: [2], pickIndex: [0, 0, 0] }), state);
    expect(chosen.length).toBe(3);
  });
});

describe('chooseRoom', () => {
  describe('fight', () => {
    it('非頂層：查 encounterTable 加權抽 encounterId，設 pendingEncounterId+phase=combat', () => {
      const save = makeSave();
      const state = makeState({ locationId: 'loc_dungeon_a', kind: 'dungeon', step: 1, totalSteps: 3 });
      const result = chooseRoom(fakeRng({ pickIndex: [0] }), state, save, 'fight');
      expect(result.encounterId).toBe('enc_spider');
      expect(state.pendingEncounterId).toBe('enc_spider');
      expect(state.phase).toBe('combat');
    });

    it('頂層（boss）：固定用 bossEncounterId，不查 encounterTable', () => {
      const save = makeSave();
      const state = makeState({ locationId: 'loc_dungeon_a', kind: 'dungeon', step: 3, totalSteps: 3 });
      const result = chooseRoom(fakeRng(), state, save, 'fight');
      expect(result.encounterId).toBe('enc_boss');
      expect(state.pendingEncounterId).toBe('enc_boss');
      expect(state.phase).toBe('combat');
    });
  });

  describe('treasure', () => {
    it('gold = roll(6)*10 + step*10，入 state.loot.gold', () => {
      const save = makeSave();
      const state = makeState({
        locationId: 'loc_dungeon_a', kind: 'dungeon', step: 2, totalSteps: 3,
        loot: { gold: 0, items: {} },
      });
      // roll(6)=3、step=2 → 3*10+2*10=50；next=0.99 不中物品機率
      const result = chooseRoom(fakeRng({ d20: [3], next: [0.99] }), state, save, 'treasure');
      expect(result.treasureGold).toBe(50);
      expect(state.loot.gold).toBe(50);
      expect(state.loot.items.ore).toBeUndefined();
    });

    it('10% 機率（next()<0.1）額外給 1 個 ore（M3 簡化固定物品）', () => {
      const save = makeSave();
      const state = makeState({ locationId: 'loc_dungeon_a', kind: 'dungeon', step: 1, totalSteps: 3 });
      const result = chooseRoom(fakeRng({ d20: [1], next: [0.05] }), state, save, 'treasure');
      expect(result.treasureGold).toBeDefined();
      expect(state.loot.items.ore).toBe(1);
    });

    it('未中機率（next()>=0.1）不給物品', () => {
      const save = makeSave();
      const state = makeState({ locationId: 'loc_dungeon_a', kind: 'dungeon', step: 1, totalSteps: 3 });
      chooseRoom(fakeRng({ d20: [1], next: [0.5] }), state, save, 'treasure');
      expect(state.loot.items.ore).toBeUndefined();
    });

    it('結算後呼叫 advanceExpedition（step 前進、phase 依 kind 推進）', () => {
      const save = makeSave();
      const state = makeState({
        locationId: 'loc_dungeon_a', kind: 'dungeon', step: 1, totalSteps: 3, phase: 'room-choice',
      });
      chooseRoom(fakeRng({ d20: [1], next: [0.99] }), state, save, 'treasure');
      expect(state.step).toBe(2);
      expect(state.phase).toBe('room-choice');
    });
  });

  describe('rest', () => {
    it('全隊回 1d6+2，不超過各自 maxHp（不同成員各自 cap）', () => {
      const save = makeSave({
        companions: [makeCompanion({ id: 'ally', maxHp: 20, injuredForTrips: 0 })],
      });
      const state = makeState({
        locationId: 'loc_dungeon_a', kind: 'dungeon', step: 1, totalSteps: 3,
        partyHp: { [save.protagonist.id]: 10, ally: 18 },
      });
      // roll(6)=4 → healed=4+2=6：protagonist 10+6=16（未達 max 22）；ally 18+6=24→cap 於 20
      const result = chooseRoom(fakeRng({ d20: [4] }), state, save, 'rest');
      expect(result.restHealed).toBe(6);
      expect(state.partyHp[save.protagonist.id]).toBe(16);
      expect(state.partyHp.ally).toBe(20);
    });

    it('結算後呼叫 advanceExpedition', () => {
      const save = makeSave();
      const state = makeState({
        locationId: 'loc_dungeon_a', kind: 'dungeon', step: 1, totalSteps: 3, phase: 'room-choice',
      });
      chooseRoom(fakeRng({ d20: [4] }), state, save, 'rest');
      expect(state.step).toBe(2);
      expect(state.phase).toBe('room-choice');
    });
  });

  describe('event', () => {
    it('抽 dungeon context 事件並回傳 { event }，不呼叫 advanceExpedition', () => {
      const save = makeSave();
      const state = makeState({
        locationId: 'loc_dungeon_a', kind: 'dungeon', step: 1, totalSteps: 3, phase: 'room-choice',
      });
      // 候選（context.kind 過濾後）：[evUniversal, evDungeonOnly]；pickIndex=1 → evDungeonOnly
      const result = chooseRoom(fakeRng({ pickIndex: [1] }), state, save, 'event');
      expect(result.event?.id).toBe('ev_dungeon_only');
      expect(state.phase).toBe('event');
      expect(state.step).toBe(1); // 未呼叫 advanceExpedition
    });
  });

  describe('unknown', () => {
    it('next()<0.5 實際化為 fight，走 fight 邏輯', () => {
      const save = makeSave();
      const state = makeState({ locationId: 'loc_dungeon_a', kind: 'dungeon', step: 1, totalSteps: 3 });
      const result = chooseRoom(fakeRng({ next: [0.1], pickIndex: [0] }), state, save, 'unknown');
      expect(result.encounterId).toBe('enc_spider');
      expect(state.phase).toBe('combat');
    });

    it('next()>=0.5 實際化為 treasure，走 treasure 邏輯（含 advanceExpedition）', () => {
      const save = makeSave();
      const state = makeState({
        locationId: 'loc_dungeon_a', kind: 'dungeon', step: 1, totalSteps: 3, phase: 'room-choice',
      });
      // next 佇列：[0]=0.9→實際化 treasure；[1]=0.99→物品機率未中
      const result = chooseRoom(fakeRng({ d20: [5], next: [0.9, 0.99] }), state, save, 'unknown');
      expect(result.treasureGold).toBe(5 * 10 + 1 * 10);
      expect(state.step).toBe(2);
      expect(state.phase).toBe('room-choice');
    });
  });
});

describe('buildEncounter', () => {
  beforeEach(() => {
    registerEncounters({
      enc_spider: () => [makeEnemy({ id: 'spider-1' })],
    });
  });

  it('查 registerEncounters 登記表生成敵人', () => {
    const state = makeState({ locationId: 'loc_dungeon_a', kind: 'dungeon', step: 1, totalSteps: 3 });
    const enemies = buildEncounter(fakeRng(), state, 'enc_spider');
    expect(enemies.map((e) => e.id)).toEqual(['spider-1']);
  });

  it('找不到 encounterId 丟 Error', () => {
    const state = makeState({ locationId: 'loc_dungeon_a', kind: 'dungeon', step: 1, totalSteps: 3 });
    expect(() => buildEncounter(fakeRng(), state, 'no-such-encounter')).toThrow();
  });

  it('dungeon：套用 depthHpBonus×(step-1)（step=3 → +2×2=+4）', () => {
    const state = makeState({ locationId: 'loc_dungeon_a', kind: 'dungeon', step: 3, totalSteps: 3 });
    const [enemy] = buildEncounter(fakeRng(), state, 'enc_spider');
    expect(enemy.maxHp).toBe(10 + 4);
    expect(enemy.hp).toBe(10 + 4);
  });

  it('dungeon 第一層（step=1）：加成為 0', () => {
    const state = makeState({ locationId: 'loc_dungeon_a', kind: 'dungeon', step: 1, totalSteps: 3 });
    const [enemy] = buildEncounter(fakeRng(), state, 'enc_spider');
    expect(enemy.maxHp).toBe(10);
    expect(enemy.hp).toBe(10);
  });

  it('route：不套用深度加成', () => {
    const state = makeState({ locationId: 'loc_route_a', kind: 'route', step: 2, totalSteps: 2 });
    const [enemy] = buildEncounter(fakeRng(), state, 'enc_spider');
    expect(enemy.maxHp).toBe(10);
    expect(enemy.hp).toBe(10);
  });
});

describe('applyPartyHp', () => {
  it('把 state.partyHp 覆蓋到對應 member.hp', () => {
    const state = makeState({ partyHp: { protagonist: 15, ally: 9 } });
    const members = [makePartyMember({ id: 'protagonist', hp: 22 }), makePartyMember({ id: 'ally', hp: 20 })];
    applyPartyHp(state, members);
    expect(members[0].hp).toBe(15);
    expect(members[1].hp).toBe(9);
  });

  it('partyHp 缺 key 時不動該 member 的 hp', () => {
    const state = makeState({ partyHp: { protagonist: 15 } });
    const members = [makePartyMember({ id: 'protagonist', hp: 22 }), makePartyMember({ id: 'stranger', hp: 7 })];
    applyPartyHp(state, members);
    expect(members[0].hp).toBe(15);
    expect(members[1].hp).toBe(7); // 未出現在 partyHp，維持原值
  });
});

describe('finishCombat', () => {
  it('無論勝敗都把 combat.party 最終 hp 寫回 state.partyHp', () => {
    const save = makeSave();
    const state = makeState({ partyHp: { [save.protagonist.id]: 22 } });
    const combat = makeCombat({
      outcome: 'defeat',
      party: [makePartyMember({ id: save.protagonist.id, hp: 0 })],
    });
    finishCombat(fakeRng(), state, save, combat, []);
    expect(state.partyHp[save.protagonist.id]).toBe(0);
  });

  it('victory：loot gold 區間下界（roll=1 → 取最小值）', () => {
    const save = makeSave();
    const state = makeState({ loot: { gold: 0, items: {} } });
    const enemy = makeEnemy({ id: 'e1', loot: { gold: [8, 8] } });
    const combat = makeCombat({ outcome: 'victory', party: [], enemies: [enemy] });
    finishCombat(fakeRng({ d20: [1] }), state, save, combat, []);
    expect(state.loot.gold).toBe(8);
  });

  it('victory：loot gold 區間上界（roll=span → 取最大值）', () => {
    const save = makeSave();
    const state = makeState({ loot: { gold: 0, items: {} } });
    const enemy = makeEnemy({ id: 'e1', loot: { gold: [5, 10] } }); // span=6
    const combat = makeCombat({ outcome: 'victory', party: [], enemies: [enemy] });
    finishCombat(fakeRng({ d20: [6] }), state, save, combat, []);
    expect(state.loot.gold).toBe(10);
  });

  it('victory：itemChance 命中額外給指定物品', () => {
    const save = makeSave();
    const state = makeState({ loot: { gold: 0, items: {} } });
    const enemy = makeEnemy({ id: 'e1', loot: { gold: [1, 1], itemId: 'goblin-ear', itemChance: 0.3 } });
    const combat = makeCombat({ outcome: 'victory', party: [], enemies: [enemy] });
    finishCombat(fakeRng({ d20: [1], next: [0.1] }), state, save, combat, []);
    expect(state.loot.items['goblin-ear']).toBe(1);
  });

  it('victory：itemChance 未命中不給物品', () => {
    const save = makeSave();
    const state = makeState({ loot: { gold: 0, items: {} } });
    const enemy = makeEnemy({ id: 'e1', loot: { gold: [1, 1], itemId: 'goblin-ear', itemChance: 0.3 } });
    const combat = makeCombat({ outcome: 'victory', party: [], enemies: [enemy] });
    finishCombat(fakeRng({ d20: [1], next: [0.5] }), state, save, combat, []);
    expect(state.loot.items['goblin-ear']).toBeUndefined();
  });

  it('victory 後呼叫 advanceExpedition 推進 step/phase', () => {
    const save = makeSave();
    const state = makeState({ kind: 'dungeon', step: 1, totalSteps: 3, loot: { gold: 0, items: {} } });
    const combat = makeCombat({ outcome: 'victory', party: [], enemies: [] });
    finishCombat(fakeRng(), state, save, combat, []);
    expect(state.step).toBe(2);
    expect(state.phase).toBe('room-choice');
  });

  it('retreated：retreated=true、loot.gold 折半（向下取整）、phase=done', () => {
    const save = makeSave();
    const state = makeState({ loot: { gold: 7, items: {} }, step: 2, totalSteps: 5, phase: 'combat' });
    const combat = makeCombat({ outcome: 'retreated', party: [], enemies: [] });
    finishCombat(fakeRng(), state, save, combat, []);
    expect(state.retreated).toBe(true);
    expect(state.loot.gold).toBe(3);
    expect(state.phase).toBe('done');
  });

  it('defeat：同 retreated 的折損與提前結束（phase=done）', () => {
    const save = makeSave();
    const state = makeState({ loot: { gold: 9, items: {} }, step: 2, totalSteps: 5, phase: 'combat' });
    const combat = makeCombat({ outcome: 'defeat', party: [], enemies: [] });
    finishCombat(fakeRng(), state, save, combat, []);
    expect(state.retreated).toBe(true);
    expect(state.loot.gold).toBe(4);
    expect(state.phase).toBe('done');
  });

  it('fates dead：非主角傭兵從 companions 移除', () => {
    const save = makeSave({
      companions: [makeCompanion({ id: 'c1' }), makeCompanion({ id: 'c2' })],
    });
    const state = makeState();
    const combat = makeCombat({ outcome: 'defeat', party: [], enemies: [] });
    finishCombat(fakeRng(), state, save, combat, [{ id: 'c1', fate: 'dead' }]);
    expect(save.companions.map((c) => c.id)).toEqual(['c2']);
  });

  it('fates dead：主角即使出現在 fates 中也不會被移除（防禦性）', () => {
    const save = makeSave();
    const protagonistId = save.protagonist.id;
    const state = makeState();
    const combat = makeCombat({ outcome: 'defeat', party: [], enemies: [] });
    finishCombat(fakeRng(), state, save, combat, [{ id: protagonistId, fate: 'dead' }]);
    expect(save.protagonist.id).toBe(protagonistId);
    expect(save.protagonist.injuredForTrips).toBe(0); // dead 分支不會誤把主角轉成 injured
  });

  it('fates injured：傭兵與主角皆設 injuredForTrips=2', () => {
    const save = makeSave({ companions: [makeCompanion({ id: 'c1', injuredForTrips: 0 })] });
    const state = makeState();
    const combat = makeCombat({ outcome: 'victory', party: [], enemies: [] });
    finishCombat(fakeRng(), state, save, combat, [
      { id: 'c1', fate: 'injured' },
      { id: save.protagonist.id, fate: 'injured' },
    ]);
    expect(save.companions[0].injuredForTrips).toBe(2);
    expect(save.protagonist.injuredForTrips).toBe(2);
  });

  describe('深度乘數（M4，dungeon 限定）', () => {
    it('dungeon victory：gold × (1+0.25×(step-1))，向下取整（step=3 → ×1.5）', () => {
      const save = makeSave();
      const state = makeState({
        locationId: 'loc_dungeon_a', kind: 'dungeon', step: 3, totalSteps: 5,
        loot: { gold: 0, items: {} },
      });
      const enemy = makeEnemy({ id: 'e1', loot: { gold: [10, 10] } });
      const combat = makeCombat({ outcome: 'victory', party: [], enemies: [enemy] });
      finishCombat(fakeRng({ d20: [1] }), state, save, combat, []);
      // 10 * 1.5 = 15（非 boss 層，step!==totalSteps，不觸發再殺折半）
      expect(state.loot.gold).toBe(15);
    });

    it('route：不套用深度乘數（等同 ×1）', () => {
      const save = makeSave();
      const state = makeState({ kind: 'route', step: 3, totalSteps: 5, loot: { gold: 0, items: {} } });
      const enemy = makeEnemy({ id: 'e1', loot: { gold: [10, 10] } });
      const combat = makeCombat({ outcome: 'victory', party: [], enemies: [enemy] });
      finishCombat(fakeRng({ d20: [1] }), state, save, combat, []);
      expect(state.loot.gold).toBe(10);
    });
  });

  describe('隱藏迷宮遞減報酬（M4）', () => {
    it('首殺：boss 擊殺 reputation +10、locationId 記入 visitedBossDungeons，loot 不打折', () => {
      const save = makeSave();
      expect(save.visitedBossDungeons).toEqual([]);
      const state = makeState({
        locationId: 'loc_dungeon_a', kind: 'dungeon', step: 3, totalSteps: 3,
        loot: { gold: 0, items: {} },
      });
      const enemy = makeEnemy({ id: 'boss', loot: { gold: [10, 10] } });
      const combat = makeCombat({ outcome: 'victory', party: [], enemies: [enemy] });
      finishCombat(fakeRng({ d20: [1] }), state, save, combat, []);
      // 深度乘數 1+0.25*2=1.5 → 15，首殺不折半
      expect(state.loot.gold).toBe(15);
      expect(save.reputation).toBe(10);
      expect(save.visitedBossDungeons).toEqual(['loc_dungeon_a']);
    });

    it('再殺：locationId 已在 visitedBossDungeons 時，loot gold 再折半（向下取整）', () => {
      const save = makeSave({ visitedBossDungeons: ['loc_dungeon_a'] });
      const state = makeState({
        locationId: 'loc_dungeon_a', kind: 'dungeon', step: 3, totalSteps: 3,
        loot: { gold: 0, items: {} },
      });
      const enemy = makeEnemy({ id: 'boss', loot: { gold: [10, 10] } });
      const combat = makeCombat({ outcome: 'victory', party: [], enemies: [enemy] });
      finishCombat(fakeRng({ d20: [1] }), state, save, combat, []);
      // 深度乘數 1.5 → 15，再殺折半 → floor(15/2)=7
      expect(state.loot.gold).toBe(7);
      expect(save.reputation).toBe(10); // 再殺仍給聲望
      expect(save.visitedBossDungeons).toEqual(['loc_dungeon_a']); // 不重複記錄
    });

    it('再殺：itemChance 減半', () => {
      const save = makeSave({ visitedBossDungeons: ['loc_dungeon_a'] });
      const state = makeState({
        locationId: 'loc_dungeon_a', kind: 'dungeon', step: 3, totalSteps: 3,
        loot: { gold: 0, items: {} },
      });
      const enemy = makeEnemy({ id: 'boss', loot: { gold: [1, 1], itemId: 'den-idol', itemChance: 0.6 } });
      const combat = makeCombat({ outcome: 'victory', party: [], enemies: [enemy] });
      // next=0.35：原本 0.6 機率會命中（0.35<0.6），減半後 0.3 機率不命中（0.35>=0.3）
      finishCombat(fakeRng({ d20: [1], next: [0.35] }), state, save, combat, []);
      expect(state.loot.items['den-idol']).toBeUndefined();
    });

    it('非頂層 boss 層（step!==totalSteps）即使 locationId 曾在 visitedBossDungeons 也不觸發遞減', () => {
      const save = makeSave({ visitedBossDungeons: ['loc_dungeon_a'] });
      const state = makeState({
        locationId: 'loc_dungeon_a', kind: 'dungeon', step: 1, totalSteps: 3,
        loot: { gold: 0, items: {} },
      });
      const enemy = makeEnemy({ id: 'e1', loot: { gold: [10, 10] } });
      const combat = makeCombat({ outcome: 'victory', party: [], enemies: [enemy] });
      finishCombat(fakeRng({ d20: [1] }), state, save, combat, []);
      expect(state.loot.gold).toBe(10); // 深度乘數 step=1 → ×1，非 boss 層不折半、不加聲望
      expect(save.reputation).toBe(0);
    });
  });

  describe('cargo 損失（撤退/戰敗）', () => {
    it('retreated：state.cargo 逐項折半（向下取整）', () => {
      const save = makeSave();
      const state = makeState({ cargo: { ore: 5, herb: 3 }, loot: { gold: 0, items: {} } });
      const combat = makeCombat({ outcome: 'retreated', party: [], enemies: [] });
      finishCombat(fakeRng(), state, save, combat, []);
      expect(state.cargo).toEqual({ ore: 2, herb: 1 });
    });

    it('defeat：state.cargo 同 retreated 折半', () => {
      const save = makeSave();
      const state = makeState({ cargo: { ore: 4 }, loot: { gold: 0, items: {} } });
      const combat = makeCombat({ outcome: 'defeat', party: [], enemies: [] });
      finishCombat(fakeRng(), state, save, combat, []);
      expect(state.cargo).toEqual({ ore: 2 });
    });

    it('victory：state.cargo 不受影響', () => {
      const save = makeSave();
      const state = makeState({
        kind: 'dungeon', step: 1, totalSteps: 3,
        cargo: { ore: 5 }, loot: { gold: 0, items: {} },
      });
      const combat = makeCombat({ outcome: 'victory', party: [], enemies: [] });
      finishCombat(fakeRng(), state, save, combat, []);
      expect(state.cargo).toEqual({ ore: 5 });
    });
  });
});
