import { describe, it, expect, beforeEach } from 'vitest';
import {
  CHRONICLE_KEY, emptyChronicle, loadChronicle, saveChronicle,
  recordEvent, recordEnemyDefeat, recordLocationVisit, recordEquipment, recordExpedition,
  ACHIEVEMENTS, evaluateAchievements, legacyBonusGold, collectionProgress,
} from './chronicle';
import { EVENTS } from './data/events';
import { LOCATIONS } from './data/locations';
import { ITEMS } from './data/items';

describe('chronicle：跨輪編年史', () => {
  beforeEach(() => localStorage.removeItem(CHRONICLE_KEY));

  it('emptyChronicle：全空、零傳承', () => {
    const c = emptyChronicle();
    expect(c.seenEvents).toEqual([]);
    expect(c.defeatedEnemies).toEqual([]);
    expect(c.visitedLocations).toEqual([]);
    expect(c.ownedEquipment).toEqual([]);
    expect(c.runs).toEqual({ started: 0, won: 0 });
    expect(c.legacyPoints).toBe(0);
    expect(c.unlockedAchievements).toEqual([]);
  });

  it('load/save roundtrip；壞資料回空編年史', () => {
    const c = emptyChronicle();
    recordEvent(c, 'ev_merchant_map');
    saveChronicle(c);
    expect(loadChronicle().seenEvents).toEqual(['ev_merchant_map']);
    localStorage.setItem(CHRONICLE_KEY, '{broken');
    expect(loadChronicle().seenEvents).toEqual([]);
  });

  it('記錄冪等：同一 id 只收錄一次，回傳是否新收錄', () => {
    const c = emptyChronicle();
    expect(recordEvent(c, 'ev_merchant_map')).toBe(true);
    expect(recordEvent(c, 'ev_merchant_map')).toBe(false);
    expect(c.seenEvents.length).toBe(1);
    expect(recordEnemyDefeat(c, '哥布林斥候')).toBe(true);
    expect(recordEnemyDefeat(c, '哥布林斥候')).toBe(false);
    expect(recordLocationVisit(c, 'riverside-road')).toBe(true);
    expect(recordLocationVisit(c, 'riverside-road')).toBe(false);
    expect(recordEquipment(c, 'salt-crystal-blade')).toBe(true);
    expect(recordEquipment(c, 'salt-crystal-blade')).toBe(false);
  });

  it('遠征結算：won 得 1 傳承點並計入 runs；lost/retreat 只計 started', () => {
    const c = emptyChronicle();
    expect(recordExpedition(c, 'won')).toBe(1);
    expect(recordExpedition(c, 'lost')).toBe(0);
    expect(recordExpedition(c, 'retreat')).toBe(0);
    expect(c.runs).toEqual({ started: 3, won: 1 });
    expect(c.legacyPoints).toBe(1);
  });

  it('legacyBonusGold：每點 +10G、上限 100G', () => {
    const c = emptyChronicle();
    expect(legacyBonusGold(c)).toBe(0);
    c.legacyPoints = 3;
    expect(legacyBonusGold(c)).toBe(30);
    c.legacyPoints = 25;
    expect(legacyBonusGold(c)).toBe(100);
  });

  it('collectionProgress：分子=已收錄、分母=data 實數', () => {
    const c = emptyChronicle();
    recordEvent(c, 'ev_merchant_map');
    recordLocationVisit(c, 'riverside-road');
    const p = collectionProgress(c);
    expect(p.events).toEqual([1, EVENTS.length]);
    expect(p.locations).toEqual([1, Object.keys(LOCATIONS).length]);
    expect(p.equipment[1]).toBe(Object.values(ITEMS).filter((i) => i.equip).length);
    expect(p.enemies[1]).toBeGreaterThan(0);
  });

  it('成就：首次歸來／三大 boss／奇怪商人終章／傳承 5 點可解鎖，evaluateAchievements 回傳新解鎖且冪等', () => {
    const c = emptyChronicle();
    expect(evaluateAchievements(c)).toEqual([]);
    recordExpedition(c, 'won');
    expect(evaluateAchievements(c)).toContain('first-steps');
    expect(evaluateAchievements(c)).not.toContain('first-steps'); // 已解鎖不重報
    recordEnemyDefeat(c, '礦坑監工');
    recordEnemyDefeat(c, '巢穴頭目');
    recordEnemyDefeat(c, '鹽晶洞主');
    expect(evaluateAchievements(c)).toContain('boss-slayer');
    recordEvent(c, 'ev_strange_merchant_finale');
    expect(evaluateAchievements(c)).toContain('strange-friend');
    c.legacyPoints = 5;
    expect(evaluateAchievements(c)).toContain('legacy-begins');
    expect(c.unlockedAchievements.length).toBeGreaterThanOrEqual(4);
  });

  it('成就定義完備：id 唯一、都有名稱與描述', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(10);
    for (const a of ACHIEVEMENTS) {
      expect(a.name).toBeTruthy();
      expect(a.desc).toBeTruthy();
    }
  });
});
