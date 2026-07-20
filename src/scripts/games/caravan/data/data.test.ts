import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ITEMS } from './items';
import { LOCATIONS, visibleLocations } from './locations';
import { ENCOUNTERS, TRAINING_ENCOUNTER } from './enemies';
import { EVENTS } from './events';
import { TOWNS } from './towns';
import { JOBS } from './jobs';
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
  it('ITEMS 有 29 種（M3 12 + M5 11 + M10 稀有裝 6），且 ore 存在（Task 3 寶箱房寫死給 ore）', () => {
    expect(Object.keys(ITEMS).length).toBe(29);
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

  it('equip.slot 皆為合法值 weapon/armor/trinket（M5 資料完整性）', () => {
    const validSlots = ['weapon', 'armor', 'trinket'];
    for (const item of Object.values(ITEMS)) {
      if (item.equip) {
        expect(validSlots, `${item.id} 的 equip.slot「${item.equip.slot}」不合法`).toContain(item.equip.slot);
      }
    }
  });

  it('equip.slot==="weapon" 的物品必有 equip.move（供 memberFromRecord 取代 moves[0]，M5）', () => {
    for (const item of Object.values(ITEMS)) {
      if (item.equip?.slot === 'weapon') {
        expect(item.equip.move, `${item.id} 是武器卻無 move`).toBeDefined();
      }
    }
  });

  it('裝備物品共 18 件（M5 12＋M10 稀有 6：武器 7／護甲 5／飾品 6）', () => {
    const equipItems = Object.values(ITEMS).filter((item) => item.equip);
    expect(equipItems.length).toBe(18);
    expect(equipItems.filter((i) => i.equip!.slot === 'weapon').length).toBe(7);
    expect(equipItems.filter((i) => i.equip!.slot === 'armor').length).toBe(5);
    expect(equipItems.filter((i) => i.equip!.slot === 'trinket').length).toBe(6);
  });

  // ---------------------------------------------------------------------
  // locations.ts
  // ---------------------------------------------------------------------
  it('LOCATIONS 有計畫指定的 7 個地點（M3 4 + M5 內容擴充 3），其中 2 個為 hidden', () => {
    expect(Object.keys(LOCATIONS).length).toBe(7);
    const hidden = Object.values(LOCATIONS).filter((l) => l.hidden);
    expect(hidden.length).toBe(2);
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

    const hiddenLoc = Object.values(LOCATIONS).find((l) => l.id === 'goblin-den')!;
    save.flags[`discovered:${hiddenLoc.id}`] = true;
    const after = visibleLocations(save);
    expect(after.length).toBe(4);
    expect(after.some((l) => l.id === hiddenLoc.id)).toBe(true);
  });

  it('minReputation 過濾：reputation 0/40/60 三檔決定霧嶺古道／鹽晶洞窟是否出現於委託板（M5）', () => {
    const save = newGame();

    save.reputation = 0;
    let visible = visibleLocations(save).map((l) => l.id);
    expect(visible).not.toContain('misty-ridge-trail');
    expect(visible).not.toContain('salt-crystal-cavern');

    save.reputation = 40;
    visible = visibleLocations(save).map((l) => l.id);
    expect(visible).toContain('misty-ridge-trail');
    expect(visible).not.toContain('salt-crystal-cavern');

    save.reputation = 60;
    visible = visibleLocations(save).map((l) => l.id);
    expect(visible).toContain('misty-ridge-trail');
    expect(visible).toContain('salt-crystal-cavern');
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

  it('鹽晶洞窟 boss（鹽晶洞主）基礎 HP 落在 30-45 區間（深度加成另計，M5 量級設計）', () => {
    const enemies = ENCOUNTERS.enc_salt_cavern_boss();
    expect(enemies.length).toBe(1);
    expect(enemies[0].maxHp).toBeGreaterThanOrEqual(30);
    expect(enemies[0].maxHp).toBeLessThanOrEqual(45);
  });

  it('至少一隻敵人帶 guard 招（驗證 enemyAct 架盾 AI 路徑，M5 鹽晶洞主）', () => {
    const hasGuardMove = Object.values(ENCOUNTERS).some((factory) =>
      factory().some((enemy) => enemy.moves.some((m) => m.kind === 'guard'))
    );
    expect(hasGuardMove).toBe(true);
  });

  // ---------------------------------------------------------------------
  // events.ts
  // ---------------------------------------------------------------------
  it('EVENTS 共 42 張（M3 15 + M5 內容擴充 27），各分類數量符合計畫分布', () => {
    expect(EVENTS.length).toBe(42);
    const routeGeneric = EVENTS.filter(
      (c) => c.context.kind === 'route' && !c.context.locationIds
    );
    const forestOnly = EVENTS.filter((c) => c.context.locationIds?.includes('blackwood-trail'));
    const mistyRidgeOnly = EVENTS.filter((c) => c.context.locationIds?.includes('misty-ridge-trail'));
    const saltCavernOnly = EVENTS.filter((c) => c.context.locationIds?.includes('salt-crystal-cavern'));
    const dungeonKind = EVENTS.filter((c) => c.context.kind === 'dungeon');
    const rare = EVENTS.filter((c) => !c.context.kind);
    // 路線通用 18 = M3 既有 8 + M5 跨路線通用 10（含兩條新旗標鏈）
    expect(routeGeneric.length).toBe(18);
    expect(forestOnly.length).toBe(3);
    expect(mistyRidgeOnly.length).toBe(5);
    expect(saltCavernOnly.length).toBe(4);
    // dungeonKind 12 = M3 既有 4（含 1 張迷宮通用）+ M5 鹽晶洞窟限定 4 + 迷宮通用 4
    expect(dungeonKind.length).toBe(12);
    expect(rare.length).toBe(4);
  });

  it('稀有事件 4 張 weight 落在 1-2（寶藏地圖/流浪劍聖切磋/月光市集/受傷的信使，M5）', () => {
    const rareIds = [
      'ev_rare_treasure_map',
      'ev_rare_wandering_swordsaint',
      'ev_rare_moonlit_market',
      'ev_rare_wounded_messenger',
    ];
    for (const id of rareIds) {
      const card = EVENTS.find((c) => c.id === id);
      expect(card, `找不到稀有事件 ${id}`).toBeDefined();
      expect(card!.weight, `${id} weight 應落在 1-2`).toBeGreaterThanOrEqual(1);
      expect(card!.weight, `${id} weight 應落在 1-2`).toBeLessThanOrEqual(2);
      expect(card!.context.kind, `${id} 應無 kind 限制（route/dungeon 皆可出現）`).toBeUndefined();
    }
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

  it('新旗標鏈：褪色的軍旗→傭兵團遺跡→discover 古戰場（M5）', () => {
    const bannerCard = EVENTS.find((c) => c.id === 'ev_faded_banner');
    const ruinsCard = EVENTS.find((c) => c.id === 'ev_mercenary_ruins');
    expect(bannerCard).toBeDefined();
    expect(ruinsCard).toBeDefined();
    expect(ruinsCard!.requiresFlags).toEqual({ 'clue:mercenary-ruins': true });
    const bannerSetsFlag = allEffects(bannerCard!).some(
      (e) => e.type === 'flag' && e.flag === 'clue:mercenary-ruins' && e.value === true
    );
    expect(bannerSetsFlag).toBe(true);
    const ruinsDiscovers = allEffects(ruinsCard!).some(
      (e) => e.type === 'discover' && e.locationId === 'battlefield-ruins'
    );
    expect(ruinsDiscovers).toBe(true);
    expect(LOCATIONS['battlefield-ruins']?.hidden).toBe(true);
  });

  it('新旗標鏈：奇怪的商人三連環，旗標遞進且終點給獨特飾品（M5）', () => {
    const intro = EVENTS.find((c) => c.id === 'ev_strange_merchant_intro');
    const returnCard = EVENTS.find((c) => c.id === 'ev_strange_merchant_return');
    const finale = EVENTS.find((c) => c.id === 'ev_strange_merchant_finale');
    expect(intro).toBeDefined();
    expect(returnCard).toBeDefined();
    expect(finale).toBeDefined();
    expect(returnCard!.requiresFlags).toEqual({ 'clue:strange-merchant:1': true });
    expect(finale!.requiresFlags).toEqual({ 'clue:strange-merchant:2': true });
    const introSetsFlag = allEffects(intro!).some(
      (e) => e.type === 'flag' && e.flag === 'clue:strange-merchant:1' && e.value === true
    );
    expect(introSetsFlag).toBe(true);
    const returnSetsFlag = allEffects(returnCard!).some(
      (e) => e.type === 'flag' && e.flag === 'clue:strange-merchant:2' && e.value === true
    );
    expect(returnSetsFlag).toBe(true);
    const givesCompass = allEffects(finale!).some(
      (e) => e.type === 'item' && e.itemId === 'wanderers-compass' && e.count > 0
    );
    expect(givesCompass).toBe(true);
    expect(ITEMS['wanderers-compass']?.equip?.slot).toBe('trinket');
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
  it('TOWNS 有 4 座城鎮（M3 3 + M5 鹽泉城），各自 id/name/desc 齊全', () => {
    expect(Object.keys(TOWNS).length).toBe(4);
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

  // ---------------------------------------------------------------------
  // M5：鹽泉城（霧嶺古道終點）經濟量級 sanity——全遊戲最長（legs6）最險
  // （reputation≥40 才解鎖）的路線，押貨淨利不應輸給黑森林徑。
  // ---------------------------------------------------------------------
  it('經濟量級 sanity：鹽泉城押貨路線淨利 ≥ 黑森林徑（最長最險最賺，M5）', () => {
    const startTown = TOWNS['starting-town'];
    const cap = cargoCapacity(0);

    function bestRouteProfit(destTownId: string): number {
      const destTown = TOWNS[destTownId];
      const profits = Object.keys(destTown.priceModifiers).map(
        (itemId) => (tradeSellPrice(destTown, itemId) - buyPrice(startTown, itemId)) * cap
      );
      return Math.max(...profits);
    }

    const mistyRidgeTrail = LOCATIONS['misty-ridge-trail'];
    const blackwoodTrail = LOCATIONS['blackwood-trail'];
    expect(mistyRidgeTrail.legs).toBeGreaterThan(blackwoodTrail.legs!);
    expect(mistyRidgeTrail.minReputation).toBeGreaterThan(0);

    const blackwoodProfit = bestRouteProfit(blackwoodTrail.destinationTownId!);
    const saltSpringProfit = bestRouteProfit(mistyRidgeTrail.destinationTownId!);

    expect(
      saltSpringProfit,
      '最長最險的霧嶺古道→鹽泉城押貨淨利不應低於黑森林徑（風險報酬不倒掛）'
    ).toBeGreaterThanOrEqual(blackwoodProfit);
  });
});

// ---------------------------------------------------------------------------
// M5 美術資產接線：art 路徑欄位＋檔案實際存在（fs 檢查）
// ---------------------------------------------------------------------------

describe('M5 美術資產', () => {
  const artOk = (art: string | undefined): boolean =>
    !!art && art.startsWith('/assets/games/caravan/') && existsSync(join(process.cwd(), 'public', art));

  it('四鎮皆有 art 且檔案存在', () => {
    for (const town of Object.values(TOWNS)) {
      expect(artOk(town.art), `${town.id} art 缺失或檔案不存在：${town.art}`).toBe(true);
    }
  });

  it('四職業皆有 art 且檔案存在', () => {
    for (const job of Object.values(JOBS)) {
      expect(artOk(job.art), `${job.id} art 缺失或檔案不存在：${job.art}`).toBe(true);
    }
  });

  it('所有敵人單位皆有 art 且檔案存在', () => {
    const units = [...TRAINING_ENCOUNTER(), ...Object.values(ENCOUNTERS).flatMap((mk) => mk())];
    for (const unit of units) {
      expect(artOk(unit.art), `${unit.name} art 缺失或檔案不存在：${unit.art}`).toBe(true);
    }
  });

  it('全部事件皆有 art 且檔案存在（M9：42/42 全圖）', () => {
    for (const card of EVENTS) {
      expect(artOk(card.art), `${card.id} art 缺失或檔案不存在：${card.art}`).toBe(true);
    }
  });

  it('旅況插圖與狀態 icon 皆存在（M9 美術統一）', async () => {
    const { CONDITIONS } = await import('../expedition');
    for (const cond of CONDITIONS) {
      expect(artOk(cond.art), `旅況 ${cond.id} art 缺失：${cond.art}`).toBe(true);
    }
    for (const kind of ['poison', 'stun', 'strength']) {
      expect(
        existsSync(join(process.cwd(), `public/assets/games/caravan/icon-${kind}.webp`)),
        `狀態 icon ${kind} 不存在`
      ).toBe(true);
    }
  });

  it('主角立繪／標題橫幅／遊戲廳卡檔案存在', () => {
    for (const f of ['job-protagonist.webp', 'title-banner.webp', 'card-caravan.webp']) {
      expect(existsSync(join(process.cwd(), 'public/assets/games/caravan', f)), `${f} 不存在`).toBe(true);
    }
  });
});

describe('M5 平衡收尾 sanity', () => {
  it('高階迷宮報酬高於初階：鹽晶洞 boss 與小怪 loot 皆優於礦坑對應', () => {
    const bossMax = (id: string): number => ENCOUNTERS[id]()[0].loot!.gold[1];
    expect(bossMax('enc_salt_cavern_boss')).toBeGreaterThan(bossMax('enc_mine_overseer'));
    const avgGold = (id: string): number => {
      const es = ENCOUNTERS[id]();
      return es.reduce((s, e) => s + (e.loot ? (e.loot.gold[0] + e.loot.gold[1]) / 2 : 0), 0) / es.length;
    };
    expect(avgGold('enc_salt_crystals')).toBeGreaterThan(avgGold('enc_mine_spiders'));
  });

  it('裝備價格落在收入曲線內：一般裝 ≤120G；Lv3 稀有裝 121-160G（終局區段，M10）', () => {
    for (const item of Object.values(ITEMS)) {
      if (!item.equip) continue;
      if (item.equip.minLevel === 3) {
        expect(item.value, `${item.id} 稀有裝價位超界`).toBeGreaterThan(120);
        expect(item.value, `${item.id} 稀有裝價位超界`).toBeLessThanOrEqual(160);
      } else {
        expect(item.value, `${item.id} 一般裝備價超出負擔區間`).toBeLessThanOrEqual(120);
        if (item.equip.slot === 'weapon') {
          expect(item.value, `${item.id} 武器價低於下限`).toBeGreaterThanOrEqual(60);
        }
      }
    }
  });
});

describe('M10 稀有裝備與裝備 icon', () => {
  it('裝備 18 件（M5 12＋M10 稀有 6）；稀有 3 件在鹽泉城 stock、3 件在稀有事件獎勵', () => {
    const equipItems = Object.values(ITEMS).filter((i) => i.equip);
    expect(equipItems.length).toBe(18);
    const salt = TOWNS['salt-spring-city'];
    for (const id of ['brine-crystal-staff', 'pilgrim-warded-cloak', 'saltglass-talisman']) {
      expect(ITEMS[id]?.equip, `${id} 應為裝備`).toBeDefined();
      expect(salt.stock, `${id} 應在鹽泉城 stock`).toContain(id);
    }
    const rewardOf = (evId: string): string[] => {
      const card = EVENTS.find((e) => e.id === evId)!;
      return card.options.flatMap((o) => [...o.success, ...(o.failure ?? [])])
        .filter((fx) => fx.type === 'item').map((fx) => (fx as { itemId: string }).itemId);
    };
    expect(rewardOf('ev_rare_treasure_map')).toContain('ancient-king-blade');
    expect(rewardOf('ev_rare_wandering_swordsaint')).toContain('swordsaint-bokken');
    expect(rewardOf('ev_rare_wounded_messenger')).toContain('royal-courier-sigil');
  });

  it('稀有裝備皆 Lv3 需求且價格 121-160（終局裝，區隔一般裝 ≤120）', () => {
    for (const id of ['ancient-king-blade', 'swordsaint-bokken', 'royal-courier-sigil', 'brine-crystal-staff', 'pilgrim-warded-cloak', 'saltglass-talisman']) {
      const item = ITEMS[id];
      expect(item.equip!.minLevel, `${id} 應為 Lv3 裝`).toBe(3);
      expect(item.value).toBeGreaterThan(120);
      expect(item.value).toBeLessThanOrEqual(160);
    }
  });

  it('全部 18 件裝備皆有 icon art 且檔案存在（M10 美術統一）', () => {
    for (const item of Object.values(ITEMS)) {
      if (!item.equip) continue;
      expect(item.art, `裝備 ${item.id} 缺 art 欄位`).toBeTruthy();
      expect(
        existsSync(join(process.cwd(), 'public', item.art!)),
        `裝備 ${item.id} icon 檔案不存在：${item.art}`
      ).toBe(true);
    }
  });
});
