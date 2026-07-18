import { describe, it, expect } from 'vitest';
import { ITEMS } from './items';
import { LOCATIONS, visibleLocations } from './locations';
import { ENCOUNTERS } from './enemies';
import { EVENTS } from './events';
import { TOWNS } from './towns';
import type { EventCard, EffectSpec } from '../expedition';
import { startExpedition, drawEvent } from '../expedition';
import { createRng } from '../rng';
import { newGame } from '../save';
import { buyPrice, tradeSellPrice, cargoCapacity } from '../economy';

function allEffects(card: EventCard): EffectSpec[] {
  const out: EffectSpec[] = [];
  for (const opt of card.options) {
    out.push(...opt.success);
    if (opt.failure) out.push(...opt.failure);
  }
  return out;
}

describe('caravan content data integrity（M3 Task 4）', () => {
  it('所有選項 requirement.itemId 都存在於 ITEMS（M3 終審覆蓋缺口）', () => {
    for (const card of Object.values(EVENTS)) {
      for (const opt of card.options) {
        if (opt.requirement?.itemId) {
          expect(ITEMS[opt.requirement.itemId], `${card.id} 的 requirement.itemId「${opt.requirement.itemId}」不存在`).toBeDefined();
        }
      }
    }
  });

  // ---------------------------------------------------------------------
  // items.ts
  // ---------------------------------------------------------------------
  it('ITEMS 有 12 種，且 ore 存在（Task 3 寶箱房寫死給 ore）', () => {
    expect(Object.keys(ITEMS).length).toBe(12);
    expect(ITEMS.ore).toBeDefined();
    for (const item of Object.values(ITEMS)) {
      expect(item.id).toBeTruthy();
      expect(item.name).toBeTruthy();
      expect(item.desc.length).toBeGreaterThan(0);
      expect(item.value).toBeGreaterThan(0);
    }
  });

  it('overseer-ledger/den-idol（boss 遺寶）已轉為裝備，slot=trinket（M5 終審移交）', () => {
    expect(ITEMS['overseer-ledger'].equip?.slot).toBe('trinket');
    expect(ITEMS['den-idol'].equip?.slot).toBe('trinket');
  });

  // ---------------------------------------------------------------------
  // locations.ts
  // ---------------------------------------------------------------------
  it('LOCATIONS 有計畫指定的 4 個地點，其中 1 個為 hidden', () => {
    expect(Object.keys(LOCATIONS).length).toBe(4);
    const hidden = Object.values(LOCATIONS).filter((l) => l.hidden);
    expect(hidden.length).toBe(1);
  });

  it('route 地點必有 legs；dungeon 地點必有 floors/roomsPerFloor/bossEncounterId', () => {
    for (const loc of Object.values(LOCATIONS)) {
      if (loc.kind === 'dungeon') {
        expect(loc.floors).toBeGreaterThan(0);
        expect(loc.roomsPerFloor).toBeDefined();
        expect(loc.roomsPerFloor![0]).toBeGreaterThan(0);
        expect(loc.bossEncounterId).toBeTruthy();
      } else {
        expect(loc.legs).toBeGreaterThan(0);
      }
    }
  });

  it('LOCATIONS 的 encounterTable/bossEncounterId 全部存在於 ENCOUNTERS', () => {
    for (const loc of Object.values(LOCATIONS)) {
      expect(loc.encounterTable.length).toBeGreaterThan(0);
      for (const entry of loc.encounterTable) {
        expect(ENCOUNTERS[entry.encounterId]).toBeDefined();
      }
      if (loc.bossEncounterId) {
        expect(ENCOUNTERS[loc.bossEncounterId]).toBeDefined();
      }
    }
  });

  it('visibleLocations：hidden 地點未 discover 時不列出，discover 後出現', () => {
    const save = newGame();
    const before = visibleLocations(save);
    expect(before.length).toBe(3);
    expect(before.some((l) => l.hidden)).toBe(false);

    const hiddenLoc = Object.values(LOCATIONS).find((l) => l.hidden)!;
    save.flags[`discovered:${hiddenLoc.id}`] = true;
    const after = visibleLocations(save);
    expect(after.length).toBe(4);
    expect(after.some((l) => l.id === hiddenLoc.id)).toBe(true);
  });

  // ---------------------------------------------------------------------
  // enemies.ts（ENCOUNTERS）
  // ---------------------------------------------------------------------
  it('ENCOUNTERS 內每個工廠產出的敵人 loot.gold min<=max，loot.itemId（若有）存在於 ITEMS', () => {
    expect(Object.keys(ENCOUNTERS).length).toBeGreaterThan(0);
    for (const [encounterId, factory] of Object.entries(ENCOUNTERS)) {
      const enemies = factory();
      expect(enemies.length, `${encounterId} 應至少產出 1 隻敵人`).toBeGreaterThan(0);
      for (const enemy of enemies) {
        if (!enemy.loot) continue;
        const [min, max] = enemy.loot.gold;
        expect(min).toBeLessThanOrEqual(max);
        if (enemy.loot.itemId) {
          expect(ITEMS[enemy.loot.itemId]).toBeDefined();
        }
      }
    }
  });

  it('boss 遭遇（監工/巢穴頭目）HP 落在 25-35 區間', () => {
    for (const encounterId of ['enc_mine_overseer', 'enc_goblin_den_chief']) {
      const enemies = ENCOUNTERS[encounterId]();
      expect(enemies.length).toBe(1);
      expect(enemies[0].maxHp).toBeGreaterThanOrEqual(25);
      expect(enemies[0].maxHp).toBeLessThanOrEqual(35);
    }
  });

  it('每次呼叫工廠都回傳全新物件（不共用可變狀態，同 TRAINING_ENCOUNTER 慣例）', () => {
    const first = ENCOUNTERS.enc_wolf_pair();
    first[0].hp = 1;
    const second = ENCOUNTERS.enc_wolf_pair();
    expect(second[0].hp).toBe(second[0].maxHp);
  });

  // ---------------------------------------------------------------------
  // events.ts
  // ---------------------------------------------------------------------
  it('EVENTS 共 15 張，路線通用 8／森林限定 3／迷宮限定 4', () => {
    expect(EVENTS.length).toBe(15);
    const routeGeneric = EVENTS.filter(
      (c) => c.context.kind === 'route' && !c.context.locationIds
    );
    const forestOnly = EVENTS.filter((c) => c.context.locationIds?.includes('blackwood-trail'));
    const dungeonOnly = EVENTS.filter((c) => c.context.kind === 'dungeon');
    expect(routeGeneric.length).toBe(8);
    expect(forestOnly.length).toBe(3);
    expect(dungeonOnly.length).toBe(4);
  });

  it('所有事件 options 至少 1 個、card.weight > 0', () => {
    for (const card of EVENTS) {
      expect(card.options.length).toBeGreaterThanOrEqual(1);
      expect(card.options.length).toBeLessThanOrEqual(3);
      expect(card.weight).toBeGreaterThan(0);
    }
  });

  it('五屬性（str/dex/int/cha/con）都至少有一個事件選項用到', () => {
    const stats = new Set(
      EVENTS.flatMap((c) => c.options.map((o) => o.check?.stat).filter((s): s is NonNullable<typeof s> => !!s))
    );
    expect(stats.size).toBe(5);
  });

  it('body 有畫面感的長度（60-120 字量級，寬鬆檢查 40-160）', () => {
    for (const card of EVENTS) {
      expect(card.body.length, `${card.id} body 太短`).toBeGreaterThanOrEqual(40);
      expect(card.body.length, `${card.id} body 太長`).toBeLessThanOrEqual(160);
      expect(card.title.length).toBeGreaterThan(0);
    }
  });

  it('每個成功/失敗結果都至少有一個效果（讓玩家有敘事回饋）', () => {
    for (const card of EVENTS) {
      for (const opt of card.options) {
        expect(opt.success.length, `${card.id}/${opt.label} success 空`).toBeGreaterThan(0);
        if (opt.check) {
          // 有檢定就該有 failure 分支給玩家回饋（純敘事無檢定的選項可省略 failure）
          expect(opt.failure?.length ?? 0, `${card.id}/${opt.label} 有 check 卻無 failure 效果`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('所有 item 效果的 itemId 存在於 ITEMS', () => {
    for (const card of EVENTS) {
      for (const effect of allEffects(card)) {
        if (effect.type === 'item') {
          expect(ITEMS[effect.itemId], `${card.id} 引用不存在的物品 ${effect.itemId}`).toBeDefined();
        }
      }
    }
  });

  it('所有 discover 效果的 locationId 存在於 LOCATIONS', () => {
    for (const card of EVENTS) {
      for (const effect of allEffects(card)) {
        if (effect.type === 'discover') {
          expect(LOCATIONS[effect.locationId], `${card.id} 引用不存在的地點 ${effect.locationId}`).toBeDefined();
        }
      }
    }
  });

  it('所有 fight 效果的 encounterId 存在於 ENCOUNTERS，且 fight 必為所在效果陣列最後一項', () => {
    for (const card of EVENTS) {
      for (const opt of card.options) {
        for (const list of [opt.success, opt.failure ?? []]) {
          const fightIndex = list.findIndex((e) => e.type === 'fight');
          if (fightIndex === -1) continue;
          expect(fightIndex, `${card.id}/${opt.label} fight 不是陣列最後一項`).toBe(list.length - 1);
          const effect = list[fightIndex] as Extract<EffectSpec, { type: 'fight' }>;
          expect(ENCOUNTERS[effect.encounterId], `${card.id} 引用不存在的遭遇 ${effect.encounterId}`).toBeDefined();
        }
      }
    }
  });

  it('requiresFlags 的每個旗標，至少有一張卡的效果會設定它（旗標鏈兩端對得上）', () => {
    const settableFlags = new Set<string>();
    for (const card of EVENTS) {
      for (const effect of allEffects(card)) {
        if (effect.type === 'flag' && effect.value === true) settableFlags.add(effect.flag);
        if (effect.type === 'discover') settableFlags.add(`discovered:${effect.locationId}`);
      }
    }
    let sawRequiresFlags = false;
    for (const card of EVENTS) {
      if (!card.requiresFlags) continue;
      for (const [flag, expected] of Object.entries(card.requiresFlags)) {
        if (!expected) continue;
        sawRequiresFlags = true;
        expect(settableFlags.has(flag), `requiresFlags 旗標「${flag}」沒有任何卡片會設定它`).toBe(true);
      }
    }
    expect(sawRequiresFlags, '應該至少有一張旗標鏈卡片（ev_cave_entrance）').toBe(true);
  });

  it('旗標鏈範例：ev_merchant_map 設 clue:goblin-cave，ev_cave_entrance 需要它並 discover goblin-den', () => {
    const mapCard = EVENTS.find((c) => c.id === 'ev_merchant_map');
    const caveCard = EVENTS.find((c) => c.id === 'ev_cave_entrance');
    expect(mapCard).toBeDefined();
    expect(caveCard).toBeDefined();
    expect(caveCard!.requiresFlags).toEqual({ 'clue:goblin-cave': true });
    const mapSetsFlag = allEffects(mapCard!).some(
      (e) => e.type === 'flag' && e.flag === 'clue:goblin-cave' && e.value === true
    );
    expect(mapSetsFlag).toBe(true);
    const caveDiscovers = allEffects(caveCard!).some(
      (e) => e.type === 'discover' && e.locationId === 'goblin-den'
    );
    expect(caveDiscovers).toBe(true);
    expect(LOCATIONS['goblin-den']?.hidden).toBe(true);
  });

  // ---------------------------------------------------------------------
  // 整合：資料檔在模組載入時完成 register，接得上 expedition.ts 引擎
  // ---------------------------------------------------------------------
  it('資料檔載入時自我註冊，startExpedition/drawEvent 可對真實地點/事件運作', () => {
    const rng = createRng(42);
    const save = newGame();
    const state = startExpedition(rng, save, 'riverside-road');
    expect(state.totalSteps).toBe(4);
    const card = drawEvent(rng, state, save);
    expect(EVENTS.some((c) => c.id === card.id)).toBe(true);
  });

  // ---------------------------------------------------------------------
  // towns.ts（TOWNS，M4）
  // ---------------------------------------------------------------------
  it('TOWNS 有 3 座城鎮，各自 id/name/desc 齊全', () => {
    expect(Object.keys(TOWNS).length).toBe(3);
    for (const town of Object.values(TOWNS)) {
      expect(town.id).toBeTruthy();
      expect(town.name).toBeTruthy();
      expect(town.desc.length).toBeGreaterThanOrEqual(40);
      expect(town.desc.length).toBeLessThanOrEqual(80);
    }
  });

  it('TOWNS priceModifiers 引用的 itemId 都存在於 ITEMS', () => {
    for (const town of Object.values(TOWNS)) {
      for (const itemId of Object.keys(town.priceModifiers)) {
        expect(ITEMS[itemId], `${town.id} 的 priceModifiers 引用不存在的物品 ${itemId}`).toBeDefined();
      }
    }
  });

  it('TOWNS stock 引用的 itemId 都存在於 ITEMS', () => {
    for (const town of Object.values(TOWNS)) {
      expect(town.stock.length, `${town.id} 的 stock 不應為空`).toBeGreaterThan(0);
      for (const itemId of town.stock) {
        expect(ITEMS[itemId], `${town.id} 的 stock 引用不存在的物品 ${itemId}`).toBeDefined();
      }
    }
  });

  it('孤兒物品（繃帶/乾糧/銀懷錶/香料包）都被至少一座城鎮的 stock 收錄', () => {
    const allStock = new Set(Object.values(TOWNS).flatMap((t) => t.stock));
    for (const itemId of ['bandage', 'dried-rations', 'silver-locket', 'spice-pouch']) {
      expect(allStock.has(itemId), `孤兒物品 ${itemId} 未被任何城鎮收錄`).toBe(true);
    }
  });

  it('route 的 destinationTownId（若設定）存在於 TOWNS', () => {
    let sawDestination = false;
    for (const loc of Object.values(LOCATIONS)) {
      if (loc.kind !== 'route' || !loc.destinationTownId) continue;
      sawDestination = true;
      expect(TOWNS[loc.destinationTownId], `${loc.id} 的 destinationTownId「${loc.destinationTownId}」不存在於 TOWNS`).toBeDefined();
    }
    expect(sawDestination, '應至少有一條 route 設定 destinationTownId（riverside-road/blackwood-trail）').toBe(true);
  });

  it('臨水道→河灣鎮、黑森林徑→林邊聚落的 destinationTownId 對應正確', () => {
    expect(LOCATIONS['riverside-road'].destinationTownId).toBe('riverbend-town');
    expect(LOCATIONS['blackwood-trail'].destinationTownId).toBe('woodside-settlement');
  });

  it('差價 sanity：河灣鎮 ore 的 tradeSellPrice > 啟程之鎮 ore 的 buyPrice（押貨有利可圖）', () => {
    const startTown = TOWNS['starting-town'];
    const riverbend = TOWNS['riverbend-town'];
    expect(tradeSellPrice(riverbend, 'ore')).toBeGreaterThan(buyPrice(startTown, 'ore'));
  });

  it('差價 sanity：林邊聚落 herb 的 tradeSellPrice > 啟程之鎮 herb 的 buyPrice（押貨有利可圖）', () => {
    const startTown = TOWNS['starting-town'];
    const woodside = TOWNS['woodside-settlement'];
    expect(tradeSellPrice(woodside, 'herb')).toBeGreaterThan(buyPrice(startTown, 'herb'));
  });

  // ---------------------------------------------------------------------
  // 押貨報酬量級 sanity（M4 Task 2 修復）：
  // 「較長/較險路線的最佳單品淨利不能低於較短路線」，且雙方都落在合理區間 20-60。
  // ---------------------------------------------------------------------
  it('滿載押貨淨利量級 sanity：兩條路線各自的最佳單品淨利落在 20-60，且較長路線（黑森林徑 5 段）不低於較短路線（臨水道 4 段）', () => {
    const startTown = TOWNS['starting-town'];
    const cap = cargoCapacity(0); // 6，滿載未升級馬車

    function bestRouteProfit(destTownId: string): number {
      const destTown = TOWNS[destTownId];
      const profits = Object.keys(destTown.priceModifiers).map(
        (itemId) => (tradeSellPrice(destTown, itemId) - buyPrice(startTown, itemId)) * cap
      );
      return Math.max(...profits);
    }

    const riversideRoad = LOCATIONS['riverside-road']; // legs 4 → riverbend-town
    const blackwoodTrail = LOCATIONS['blackwood-trail']; // legs 5 → woodside-settlement
    expect(riversideRoad.legs).toBeLessThan(blackwoodTrail.legs!);

    const riversideProfit = bestRouteProfit(riversideRoad.destinationTownId!);
    const blackwoodProfit = bestRouteProfit(blackwoodTrail.destinationTownId!);

    expect(riversideProfit).toBeGreaterThanOrEqual(20);
    expect(riversideProfit).toBeLessThanOrEqual(60);
    expect(blackwoodProfit).toBeGreaterThanOrEqual(20);
    expect(blackwoodProfit).toBeLessThanOrEqual(60);
    expect(blackwoodProfit, '較長/較險的黑森林徑最佳押貨淨利不應低於較短的臨水道（風險報酬不倒掛）').toBeGreaterThanOrEqual(
      riversideProfit
    );
  });
});
