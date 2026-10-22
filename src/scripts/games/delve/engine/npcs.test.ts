import { describe, expect, it } from 'vitest';
import { NPCS, NPC_KINDS, earn, forgeMul, moodLabel, npcActivity, npcLine, npcMood, pay, priceMul, shopPrice, walletOf } from './npcs';
import { Inventory } from './inventory';
import { sunTimes } from './calendar';
import { ITEMS } from './items';

describe('npc definitions', () => {
  it('seven settlers (five original + two recruitable) with zh dialogue and a shop each', () => {
    expect(NPC_KINDS.length).toBe(7);
    for (const k of NPC_KINDS) {
      const d = NPCS[k];
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.shop.length).toBeGreaterThan(0);
      for (const e of d.shop) expect(ITEMS[e.item]).toBeDefined();
      for (const pool of Object.values(d.lines)) for (const l of pool) expect(l).toMatch(/[一-鿿]/);
      expect(d.likes).not.toContain(k);
    }
  });
});

describe('mood', () => {
  it('the first pair (merchant + smith) get along', () => {
    expect(npcMood('merchant', { comfort: 0, level: 1, neighbours: ['smith'], homeless: false }).value).toBeGreaterThanOrEqual(50);
    expect(npcMood('smith', { comfort: 0, level: 1, neighbours: ['merchant'], homeless: false }).value).toBeGreaterThanOrEqual(50);
  });
  it('room comfort, level and liked neighbours raise mood; disliked and crowding lower it', () => {
    const base = npcMood('cook', { comfort: 0, level: 1, neighbours: [], homeless: false }).value;
    expect(base).toBe(50);
    expect(npcMood('cook', { comfort: 6, level: 1, neighbours: [], homeless: false }).value).toBe(62);
    expect(npcMood('cook', { comfort: 0, level: 3, neighbours: [], homeless: false }).value).toBe(60);
    expect(npcMood('cook', { comfort: 0, level: 1, neighbours: ['gardener'], homeless: false }).value).toBe(60);
    expect(npcMood('smith', { comfort: 0, level: 1, neighbours: ['gardener'], homeless: false }).value).toBe(40);
    const crowd = npcMood('cook', { comfort: 0, level: 1, neighbours: ['smith', 'cartographer', 'merchant', 'gardener'], homeless: false });
    expect(crowd.notes.some((n) => n.startsWith('太擠'))).toBe(true);
    expect(npcMood('cook', { comfort: 0, level: 1, neighbours: [], homeless: true }).value).toBe(10);
  });

  it('mood is clamped and drives prices', () => {
    expect(npcMood('cook', { comfort: 99, level: 3, neighbours: ['gardener', 'merchant'], homeless: false }).value).toBe(100);
    expect(priceMul(100)).toBe(0.8);
    expect(priceMul(50)).toBe(1);
    expect(priceMul(0)).toBe(1.2);
    expect(forgeMul(100)).toBe(0.7);
    expect(forgeMul(50)).toBe(0.9);
    expect(shopPrice(100, 100)).toBe(80);
    expect(shopPrice(1, 0)).toBe(1);
    expect(moodLabel(90)).toBe('非常開心');
  });
});

describe('schedule', () => {
  const sun = sunTimes(0);
  it('sleeps at night only if they have a bed', () => {
    expect(npcActivity(0.95, sun, true, true)).toBe('sleep');
    expect(npcActivity(0.95, sun, true, false)).toBe('home');
  });
  it('home in the early morning and evening, work midday', () => {
    expect(npcActivity(sun.sunrise + sun.twilight + 0.01, sun, false, true)).toBe('home');
    expect(npcActivity(0.5, sun, false, true)).toBe('work');
    expect(npcActivity(sun.sunset - 0.02, sun, false, true)).toBe('home');
  });
});

describe('dialogue', () => {
  it('rotates lines and picks situational pools', () => {
    const c = { night: false, rain: false, mood: 50, homeless: false };
    expect(npcLine('merchant', c, 0)).not.toBe(npcLine('merchant', c, 3));
    expect(NPCS.merchant.lines.night).toContain(npcLine('merchant', { ...c, night: true }, 1));
    expect(NPCS.merchant.lines.homeless).toContain(npcLine('merchant', { ...c, homeless: true }, 5));
    expect(NPCS.cook.lines.happy).toContain(npcLine('cook', { ...c, mood: 90 }, 2));
    expect(NPCS.cook.lines.sad).toContain(npcLine('cook', { ...c, mood: 10 }, 2));
  });
});

describe('wallet', () => {
  it('pays with copper first, breaks silver and gives change', () => {
    const inv = new Inventory();
    inv.add('copper_coin', 30); inv.add('silver_coin', 2);
    expect(walletOf(inv)).toBe(230);
    expect(pay(inv, 80)).toBe(true);
    expect(inv.count('copper_coin')).toBe(50);
    expect(inv.count('silver_coin')).toBe(1);
    expect(pay(inv, 1000)).toBe(false);
    expect(walletOf(inv)).toBe(150);
  });
  it('earns coins as silver + copper', () => {
    const inv = new Inventory();
    expect(earn(inv, 250)).toBe(0);
    expect(inv.count('silver_coin')).toBe(2);
    expect(inv.count('copper_coin')).toBe(50);
  });
});
