import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerLocations,
  registerEvents,
  startExpedition,
  drawEvent,
  optionAvailable,
  resolveOption,
  advanceExpedition,
  settleExpedition,
} from './expedition';
import type { EventCard, LocationDef, ExpeditionState } from './expedition';
import { newGame } from './save';
import type { SaveData, CompanionRecord } from './save';
import type { Rng } from './rng';

/** 依序回傳指定骰值的假 RNG；weightedPick 依 pickIndex 佇列選出候選陣列中的第幾個 */
function fakeRng(opts: { d20?: number[]; pickIndex?: number[] } = {}): Rng {
  let d20i = 0;
  let picki = 0;
  const d20s = opts.d20 ?? [10];
  const picks = opts.pickIndex ?? [0];
  return {
    next: () => 0,
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

const LOC_ROUTE_A: LocationDef = {
  id: 'loc_route_a', name: '臨水道', kind: 'route', legs: 2,
  encounterTable: [{ weight: 1, encounterId: 'enc_wolf' }],
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

  it('結算後 save.expedition 清為 null', () => {
    const save = makeSave();
    save.expedition = makeState();
    settleExpedition(makeState({ step: 1 }), save);
    expect(save.expedition).toBeNull();
  });

  it('回傳 goldGained/itemsGained/xpGained 摘要', () => {
    const save = makeSave();
    const state = makeState({ loot: { gold: 12, items: { herb: 1 } }, step: 1 });
    const result = settleExpedition(state, save);
    expect(result).toEqual({ goldGained: 12, itemsGained: { herb: 1 }, xpGained: 25 });
  });
});
