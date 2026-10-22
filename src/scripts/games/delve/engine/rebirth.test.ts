// rebirth.test.ts — 轉生之藥：使用只推事件、換族才消耗；首領首殺必掉；珍寶箱 / 寶藏室 4%
import { describe, it, expect } from 'vitest';
import { DelveGame, type DelveEvent } from './game';
import { T, W } from './tiles';
import { FIXED_DT } from './constants';
import { RACES } from './appearance';
import { raceMods } from './race';
import { ITEMS } from './items';
import { bossRebirth, chestLoot, chestRebirth, REBIRTH_BOSS_CHANCE, REBIRTH_CHEST_CHANCE, type ChestKind } from './loot';

function arena(seed = 'rebirth'): DelveGame {
  const g = new DelveGame({ seed, width: 160, height: 100, peaceful: true });
  g.levels.locked = true;
  const w = g.world;
  for (let y = 0; y < w.height; y++) for (let x = 30; x < 100; x++) { w.setFg(x, y, y >= 60 ? T.STONE : T.AIR); w.setWall(x, y, W.NONE); }
  g.teleport(60, 59);
  run(g, 0.1);
  g.drainEvents();
  return g;
}
function run(g: DelveGame, seconds: number): void {
  for (let i = 0, n = Math.round(seconds / FIXED_DT); i < n; i++) g.step(FIXED_DT);
}
const evs = (g: DelveGame): DelveEvent[] => g.drainEvents();
function hold(g: DelveGame): void {
  g.give('rebirth_potion', 1);
  g.inventory.swap(g.inventory.slots.findIndex((s) => s?.item === 'rebirth_potion'), 0);
  g.selectSlot(0);
}

describe('轉生之藥：使用與換族', () => {
  it('是消耗品、use = rebirth', () => {
    expect(ITEMS.rebirth_potion.use).toBe('rebirth');
    expect(ITEMS.rebirth_potion.name.zh).toBe('轉生之藥');
  });
  it('使用只推 rebirth 事件，不消耗', () => {
    const g = arena();
    hold(g);
    g.setUse(true); run(g, 0.05); g.setUse(false);
    expect(evs(g).filter((e) => e.type === 'rebirth')).toHaveLength(1);
    expect(g.inventory.count('rebirth_potion')).toBe(1);
  });
  it('換成別的種族：消耗 1 瓶、raceMods 跟著變；選取格不是藥也能扣', () => {
    const g = arena();
    g.give('rebirth_potion', 2);
    g.selectSlot(5);
    const from = g.appearance.race, to = (from + 1) % RACES.length;
    expect(g.rebirth(to)).toBe(true);
    expect(g.appearance.race).toBe(to);
    expect(g.inventory.count('rebirth_potion')).toBe(1);
    expect(g.raceMods()).toEqual(raceMods(to));
  });
  it('同一個種族或沒有藥：false、不消耗、不改', () => {
    const g = arena();
    expect(g.rebirth((g.appearance.race + 1) % RACES.length)).toBe(false);
    g.give('rebirth_potion', 1);
    const cur = g.appearance;
    expect(g.rebirth(cur.race)).toBe(false);
    expect(g.rebirth(99)).toBe(false);
    expect(g.inventory.count('rebirth_potion')).toBe(1);
    expect(g.appearance).toBe(cur);
  });
});

describe('轉生之藥：來源', () => {
  it('首領首殺（這個角色沒有紀錄）必掉 1 瓶', () => {
    const g = arena();
    const boss = g.summonBoss()!;
    expect(boss).toBeTruthy();
    g.debugDamage(boss.id, boss.maxHp * 2);
    expect(g.drops.list.filter((d) => d.item === 'rebirth_potion').reduce((n, d) => n + d.count, 0)).toBe(1);
  });
  it('已有該首領紀錄 → 只走 15%：bossRebirth 與擊殺次數對應、比例接近 15%', () => {
    let hit = 0;
    for (let k = 0; k < 2000; k++) if (bossRebirth('s', 'lantern_warden', k, false)) hit++;
    expect(hit / 2000).toBeGreaterThan(REBIRTH_BOSS_CHANCE - 0.04);
    expect(hit / 2000).toBeLessThan(REBIRTH_BOSS_CHANCE + 0.04);
    expect(bossRebirth('s', 'lantern_warden', 3, false)).toBe(bossRebirth('s', 'lantern_warden', 3, false));
    expect(bossRebirth('s', 'lantern_warden', 0, true)).toBe(true);
  });
  it('非首殺實際依 bossRebirth 掉落', () => {
    for (const seed of ['rb-a', 'rb-b', 'rb-c', 'rb-d', 'rb-e', 'rb-f']) {
      const g = arena(seed);
      g.levels.bosses.add('lantern_warden');
      const boss = g.summonBoss()!;
      g.debugDamage(boss.id, boss.maxHp * 2);
      const got = g.drops.list.some((d) => d.item === 'rebirth_potion');
      expect(got, seed).toBe(bossRebirth(seed, 'lantern_warden', 1, false));
    }
  });
  it('只有珍寶箱 / 寶藏室有 4%，其他箱子沒有；不影響原本的戰利品', () => {
    const kinds: ChestKind[] = ['cabin', 'mineshaft', 'ruin', 'sky', 'dungeon', 'treasure', 'secret', 'relic'];
    for (const k of kinds) {
      let n = 0;
      for (let x = 0; x < 3000; x++) if (chestRebirth('c', x, 7, k).length) n++;
      if (k === 'treasure' || k === 'relic') {
        expect(n / 3000).toBeGreaterThan(REBIRTH_CHEST_CHANCE - 0.02);
        expect(n / 3000).toBeLessThan(REBIRTH_CHEST_CHANCE + 0.02);
      } else expect(n, k).toBe(0);
    }
    let x = 0;
    while (!chestRebirth('c', x, 7, 'relic').length) x++;
    const withPotion = chestLoot('c', x, 7, 'relic', 0.5);
    expect(withPotion.some((s) => s?.item === 'rebirth_potion')).toBe(true);
    expect(chestLoot('c', x, 7, 'relic', 0.5)).toEqual(withPotion);
  });
});
