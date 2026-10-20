// game.combat.test.ts — 掉落物、生命 / 受傷 / 摔落 / 死亡重生、裝備飾品、武器（劍 / 矛 / 弓 / 法杖 / 迴旋）、生成規則、首領
import { describe, it, expect } from 'vitest';
import { DelveGame, RESPAWN_TIME, SPAWN_GRACE, IFRAMES, BOSS_FASHION, type DelveEvent } from './game';
import { T, W } from './tiles';
import { FIXED_DT, TILE_SIZE as S, DAY_LENGTH } from './constants';
import { ENEMIES } from './enemies';
import { damageTaken } from './combat';
import type { ItemId } from './items';

const SMALL = { width: 160, height: 100 };

/** 測試場：x 30..100 清空，floorY 以下石頭；玩家站在 (px, floorY-1)。預設和平（測試自己生怪）。 */
function arena(opts: { px?: number; floorY?: number; peaceful?: boolean; seed?: string } = {}): DelveGame {
  const { px = 60, floorY = 60, peaceful = true, seed = 'combat' } = opts;
  const g = new DelveGame({ seed, ...SMALL, peaceful });
  // 這些測試假設 1 級角色（小世界裡走幾步就會發現地區、升級）：不拿經驗
  g.levels.locked = true;
  const w = g.world;
  for (let y = 0; y < w.height; y++) for (let x = 30; x < 100; x++) { w.setFg(x, y, y >= floorY ? T.STONE : T.AIR); w.setWall(x, y, W.NONE); }
  g.teleport(px, floorY - 1);
  run(g, 0.1);
  g.drainEvents();
  return g;
}
function run(g: DelveGame, seconds: number): void {
  for (let i = 0, n = Math.round(seconds / FIXED_DT); i < n; i++) g.step(FIXED_DT);
}
function hold(g: DelveGame, item: ItemId, n = 1): void {
  g.give(item, n);
  const i = g.inventory.slots.findIndex((s) => s?.item === item);
  g.inventory.swap(i, 0);
  g.selectSlot(0);
}
const evs = (g: DelveGame): DelveEvent[] => g.drainEvents();

describe('掉落物', () => {
  it('挖掉的方塊變成地上的道具，靠近就撿起', () => {
    const g = arena();
    g.setAim(61, 60); g.setMining(true);
    run(g, 1.2);
    expect(g.world.getFg(61, 60)).toBe(T.AIR);
    expect(g.inventory.count('stone')).toBe(1);
    expect(g.drops.list.length).toBe(0);
    expect(evs(g).some((e) => e.type === 'pickup' && e.item === 'stone')).toBe(true);
  });
  it('背包滿 → 照樣挖掉，道具留在地上；騰出空格後撿起', () => {
    const g = arena();
    for (let i = 0; i < g.inventory.slots.length; i++) if (!g.inventory.slots[i]) g.inventory.slots[i] = { item: 'wood_pickaxe', count: 1 };
    g.setAim(61, 60); g.setMining(true);
    run(g, 1.5);
    g.setMining(false);
    expect(g.world.getFg(61, 60)).toBe(T.AIR);
    expect(g.inventory.count('stone')).toBe(0);
    expect(g.drops.list.map((d) => d.item)).toEqual(['stone']);
    g.inventory.slots[39] = null;
    run(g, 0.5);
    expect(g.inventory.count('stone')).toBe(1);
    expect(g.drops.list.length).toBe(0);
  });
  it('掉落物會落地彈跳停住；遠處（> 5 格）不會被吸過來，裝上磁石（12 格）就會', () => {
    const g = arena();
    g.drops.spawn('gel', 3, 69.5 * S, 50 * S, 0, 0);
    run(g, 2);
    const d = g.drops.list[0];
    expect(d.body.onGround).toBe(true);
    expect(d.body.y + d.body.h).toBeCloseTo(60 * S, 0);
    expect(g.inventory.count('gel')).toBe(0);
    g.equip('magnet');
    run(g, 1.5);
    expect(g.inventory.count('gel')).toBe(3);
  });
});

describe('飾品要裝備才生效（資訊類放背包也算）', () => {
  it('疾行靴放背包沒用、裝上才跑得快；指南針放背包就有東西座標', () => {
    const dist = (mode: 'none' | 'bag' | 'equip'): number => {
      const g = arena({ px: 40 });
      if (mode === 'bag') g.give('swift_boots');
      if (mode === 'equip') expect(g.equip('swift_boots')).toBe('acc0');
      g.setMoveX(1); run(g, 0.8);
      return g.player.x;
    };
    expect(dist('bag')).toBeCloseTo(dist('none'), 3);
    expect(dist('equip') - dist('none')).toBeGreaterThan(40);
    const g = arena();
    g.give('compass');
    expect(g.navInfo().east).not.toBeNull();
  });
  it('從背包裝上防具：防禦進 getState', () => {
    const g = arena();
    g.give('iron_helmet'); g.give('iron_chestplate'); g.give('iron_greaves');
    for (const it of ['iron_helmet', 'iron_chestplate', 'iron_greaves'] as const) {
      expect(g.equipFromInventory(g.inventory.slots.findIndex((s) => s?.item === it))).toBe(true);
    }
    const s = g.getState();
    expect(s.defense).toBe(2 + 3 + 2 + 3);
    expect(s.setBonus).toBe('iron');
    expect(s.equipment.head).toBe('iron_helmet');
    expect(g.inventory.count('iron_helmet')).toBe(0);
  });
});

describe('生命與受傷', () => {
  it('開局 100 / 100；受傷扣防禦/2、無敵時間內不會再受傷、被擊退', () => {
    const g = arena();
    expect(g.getState().hp).toBe(100);
    expect(g.getState().maxHp).toBe(100);
    g.equip('copper_chestplate');
    const x0 = g.player.x;
    expect(g.hurtPlayer(20, x0 - 50)).toBe(true);
    expect(g.getState().hp).toBe(100 - damageTaken(20, 2));
    expect(g.hurtPlayer(20, x0)).toBe(false);
    run(g, 0.2);
    expect(g.player.x).toBeGreaterThan(x0 + 5);
    run(g, IFRAMES);
    expect(g.hurtPlayer(20, x0)).toBe(true);
  });
  it('沒被打 5 秒後開始回血', () => {
    const g = arena();
    g.hurtPlayer(40, 0);
    const h = g.getState().hp;
    run(g, 4);
    expect(g.getState().hp).toBe(h);
    run(g, 4);
    expect(g.getState().hp).toBeGreaterThan(h + 5);
  });
  it('摔落：低於安全高度沒事、高處摔下受傷；輕羽墜免疫', () => {
    const drop = (tiles: number, charm = false): number => {
      const g = arena();
      if (charm) g.equip('feather_charm');
      g.teleport(60, 59 - tiles);
      run(g, 3);
      return 100 - g.getState().hp;
    };
    expect(drop(10)).toBe(0);
    expect(drop(40)).toBeGreaterThan(40);
    expect(drop(40, true)).toBe(0);
  });
  it('死亡：掉一半錢幣、等待後在床邊重生且滿血', () => {
    const g = arena();
    g.give('copper_coin', 80);
    g.world.setFg(50, 59, T.BED_HEAD); g.world.setFg(51, 59, T.BED_FOOT);
    g.bed = { x: 50, y: 59 };
    g.hurtPlayer(500, 0);
    const s = g.getState();
    expect(s.dead).toBe(true);
    expect(g.inventory.count('copper_coin')).toBe(40);
    expect(g.drops.list.some((d) => d.item === 'copper_coin' && d.count === 40)).toBe(true);
    expect(evs(g).some((e) => e.type === 'death')).toBe(true);
    run(g, RESPAWN_TIME - 0.5);
    expect(g.getState().dead).toBe(true);
    run(g, 1);
    const r = g.getState();
    expect(r.dead).toBe(false);
    expect(r.hp).toBe(100);
    expect(g.feetTile()).toEqual({ x: 50, y: 59 });
    expect(evs(g).some((e) => e.type === 'respawn')).toBe(true);
  });
  it('生命晶核：最大生命 +20；治療藥水回血並有冷卻', () => {
    const g = arena();
    hold(g, 'life_core', 2);
    g.setUse(true); run(g, 0.05); g.setUse(false); run(g, 0.05);
    expect(g.getState().maxHp).toBe(120);
    g.hurtPlayer(80, 0);
    const h = g.getState().hp;
    hold(g, 'healing_potion', 2);
    g.setUse(true); run(g, 0.05); g.setUse(false); run(g, 0.05);
    expect(g.getState().hp).toBeGreaterThanOrEqual(h + 59);
    g.hurtPlayer(10, 0); run(g, 1);
    g.setUse(true); run(g, 0.05); g.setUse(false);
    expect(g.inventory.count('healing_potion')).toBe(1);
    expect(evs(g).some((e) => e.type === 'blocked' && e.reason === 'potion')).toBe(true);
  });
});

describe('武器', () => {
  it('劍：揮擊打到身前的凝膠團（擊退）、打死後掉凝膠並撿起、擊殺數 +1', () => {
    const g = arena();
    hold(g, 'iron_sword');
    const e = g.spawnEnemy('gel_blob', 62, 59);
    g.setAim(63, 59); g.setMining(true);
    run(g, 0.1);
    expect(e.hp).toBeLessThan(e.maxHp);
    expect(e.body.vx).toBeGreaterThan(0);
    run(g, 3);
    g.setMining(false);
    expect(g.enemies.includes(e)).toBe(false);
    run(g, 1.5);
    expect(g.inventory.count('gel')).toBeGreaterThanOrEqual(1);
    expect(g.kills.gel_blob).toBe(1);
    const all = evs(g);
    expect(all.some((x) => x.type === 'attack' && x.kind === 'sword')).toBe(true);
    expect(all.some((x) => x.type === 'hit')).toBe(true);
    expect(all.some((x) => x.type === 'kill' && x.kind === 'gel_blob')).toBe(true);
  });
  it('劍打不到身後的怪；同一下只算一次', () => {
    const g = arena();
    hold(g, 'wood_sword');
    const e = g.spawnEnemy('rock_crab', 57, 59);
    g.setAim(66, 59); g.setMining(true);
    run(g, 0.2); g.setMining(false);
    expect(e.hp).toBe(e.maxHp);
    const e2 = g.spawnEnemy('rock_crab', 62, 59);
    g.setMining(true); run(g, 0.05); g.setMining(false); run(g, 0.3);
    const hits = evs(g).filter((x) => x.type === 'hit' && x.id === e2.id).length;
    expect(hits).toBe(1);
  });
  it('矛：沿瞄準方向刺到 3 格外的怪', () => {
    const g = arena();
    hold(g, 'iron_spear');
    const e = g.spawnEnemy('rock_crab', 63, 59);
    g.setAimWorld(64 * S, 59.5 * S); g.setMining(true);
    run(g, 0.35);
    expect(e.hp).toBeLessThan(e.maxHp);
  });
  it('弓：沒箭不能射；有箭消耗一支、箭飛出去打中遠處的怪', () => {
    const g = arena();
    hold(g, 'wood_bow');
    g.setAim(80, 58); g.setMining(true); run(g, 0.1); g.setMining(false);
    expect(evs(g).some((e) => e.type === 'blocked' && e.reason === 'ammo')).toBe(true);
    g.give('wooden_arrow', 10);
    run(g, 0.3);
    const e = g.spawnEnemy('rock_crab', 72, 59);
    g.setAimWorld(72.5 * S, 58 * S); g.setMining(true); run(g, 0.05); g.setMining(false);
    expect(g.inventory.count('wooden_arrow')).toBe(9);
    expect(g.projectiles.list.some((p) => p.kind === 'arrow')).toBe(true);
    run(g, 1);
    expect(e.hp).toBeLessThan(e.maxHp);
  });
  it('火焰箭點燃怪物（持續掉血）', () => {
    const g = arena();
    hold(g, 'wood_bow');
    g.give('flaming_arrow', 5);
    const e = g.spawnEnemy('bone_knight', 70, 59);
    g.setAimWorld(70.5 * S, 58 * S); g.setMining(true); run(g, 0.05); g.setMining(false);
    run(g, 0.6);
    expect(e.burn).toBeGreaterThan(0);
    const h = e.hp;
    run(g, 1.2);
    expect(e.hp).toBeLessThan(h);
  });
  it('法杖：耗魔、魔力不夠時不能施法，之後會回復', () => {
    const g = arena();
    hold(g, 'crystal_staff');
    g.setAim(80, 50); g.setMining(true);
    run(g, 3);
    g.setMining(false);
    expect(g.getState().mana).toBeLessThan(6);
    expect(evs(g).some((e) => e.type === 'blocked' && e.reason === 'mana')).toBe(true);
    run(g, 4);
    expect(g.getState().mana).toBeGreaterThan(20);
  });
  it('迴旋木刃：同時只能有一把在外面、會飛回來', () => {
    const g = arena();
    hold(g, 'wood_boomerang');
    g.setAim(80, 58); g.setMining(true);
    run(g, 0.5);
    expect(g.projectiles.list.filter((p) => p.kind === 'boomerang').length).toBe(1);
    g.setMining(false);
    run(g, 2);
    expect(g.projectiles.list.filter((p) => p.kind === 'boomerang').length).toBe(0);
  });
  it('飛刀：投出去消耗一把', () => {
    const g = arena();
    hold(g, 'throwing_knife', 5);
    g.setAim(80, 58); g.setMining(true); run(g, 0.05); g.setMining(false);
    expect(g.inventory.count('throwing_knife')).toBe(4);
  });
  it('自動瞄準：攻擊朝最近的怪（即使游標在另一邊）', () => {
    const g = arena();
    hold(g, 'wood_bow');
    g.give('wooden_arrow', 5);
    g.autoAim = true;
    g.spawnEnemy('rock_crab', 50, 59);
    g.setAim(80, 58); g.setMining(true); run(g, 0.05); g.setMining(false);
    const p = g.projectiles.list.find((q) => q.kind === 'arrow')!;
    expect(p.body.vx).toBeLessThan(0);
  });
});

describe('怪物生成', () => {
  it('一般模式：喘息時間後在畫面外生成、數量有上限；和平模式不生成', () => {
    const g = arena({ peaceful: false });
    g.time = DAY_LENGTH * 0.95; // 夜晚
    run(g, SPAWN_GRACE - 1);
    expect(g.enemies.length).toBe(0);
    const seen = new Set<number>();
    for (let i = 0; i < 60 * 30; i++) {
      g.step(FIXED_DT);
      for (const e of g.enemies) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        const pt = g.playerTile(), c = { x: (e.body.x + e.body.w / 2) / S, y: (e.body.y + e.body.h / 2) / S };
        expect(Math.abs(c.x - pt.x) > g.viewHalf.w || Math.abs(c.y - pt.y) > g.viewHalf.h, `${e.kind} spawned on screen`).toBe(true);
      }
    }
    expect(seen.size).toBeGreaterThan(0);
    expect(g.enemies.length).toBeLessThanOrEqual(12);
    const p = arena({ peaceful: true });
    p.time = DAY_LENGTH * 0.95;
    run(p, 30);
    expect(p.enemies.length).toBe(0);
  });
  it('切到和平模式清掉一般怪物；離太遠的怪物消失', () => {
    const g = arena({ peaceful: false });
    g.spawnEnemy('gel_blob', 70, 59);
    g.peaceful = true;
    expect(g.enemies.length).toBe(0);
    const big = new DelveGame({ seed: 'far', width: 320, height: 100 });
    big.spawnEnemy('gel_blob', 300, 10);
    big.spawnEnemy('gel_blob', 30, 10);
    big.teleport(10, big.spawn.y);
    big.step(FIXED_DT);
    expect(big.enemies.length).toBe(1);
  });
  it('同 seed 同輸入 → 同狀態（含生成的怪）', () => {
    const a = arena({ peaceful: false, seed: 'det2' }), b = arena({ peaceful: false, seed: 'det2' });
    for (const g of [a, b]) { g.time = DAY_LENGTH * 0.9; run(g, 25); }
    expect(a.enemies.map((e) => [e.kind, Math.round(e.body.x), Math.round(e.body.y), e.hp])).toEqual(b.enemies.map((e) => [e.kind, Math.round(e.body.x), Math.round(e.body.y), e.hp]));
    expect(a.getState()).toEqual(b.getState());
  });
});

describe('首領：燈脈守望者', () => {
  it('白天地表不能召喚；夜晚可以；血量一半進第二階段；擊敗後掉落並記錄', () => {
    const g = arena({ floorY: 40 }); // 洞穴層（第 58 列）之上
    g.time = DAY_LENGTH * 0.5;
    hold(g, 'wick_offering', 2);
    g.setUse(true); run(g, 0.05); g.setUse(false); run(g, 0.05);
    expect(g.bossEnemy()).toBeNull();
    expect(evs(g).some((e) => e.type === 'blocked' && e.reason === 'summon')).toBe(true);
    g.time = DAY_LENGTH * 0.9;
    g.setUse(true); run(g, 0.05); g.setUse(false);
    const boss = g.bossEnemy()!;
    expect(boss).not.toBeNull();
    expect(g.getState().boss).toMatchObject({ kind: 'lantern_warden', phase: 1 });
    expect(evs(g).some((e) => e.type === 'boss' && e.phase === 'spawn')).toBe(true);
    g.debugDamage(boss.id, boss.maxHp * 0.55);
    run(g, 0.1);
    expect(boss.phase).toBe(2);
    expect(evs(g).some((e) => e.type === 'boss' && e.phase === 'phase2')).toBe(true);
    run(g, 2);
    g.debugDamage(boss.id, boss.maxHp);
    expect(g.bossEnemy()).toBeNull();
    expect(g.getState().bossesDefeated).toEqual(['lantern_warden']);
    const items = g.drops.list.map((d) => d.item);
    for (const it of ['lumen_blade', 'warden_heart', 'warden_trophy'] as const) expect(items).toContain(it);
    // 另外掉一件高稀有時裝（偶像 / 哥德 / 小皇冠其中一件）
    expect(items.filter((it) => BOSS_FASHION.includes(it))).toHaveLength(1);
  });
  it('第一階段會射火球、召喚燈靈；玩家死亡後首領離開', () => {
    const g = arena();
    g.time = DAY_LENGTH * 0.9;
    g.equip('molten_chestplate');
    const boss = g.summonBoss()!;
    run(g, 8);
    expect(g.enemies.some((e) => e.kind === 'warden_wisp')).toBe(true);
    expect(evs(g).some((e) => e.type === 'shot' && e.kind === 'fireball')).toBe(true);
    while (!g.hurtPlayer(9999, 0)) g.step(FIXED_DT);
    run(g, 3.5);
    expect(g.getState().dead).toBe(true);
    expect(g.enemies.includes(boss)).toBe(false);
  });
  it('首領的血量足以讓金裝玩家打得完（金劍 dps 估算 < 120 秒）', () => {
    const hp = ENEMIES.lantern_warden.hp, def = ENEMIES.lantern_warden.defense;
    const perHit = Math.max(1, 18 * 1.0 - def / 2);
    const dps = perHit / 0.33;
    expect(hp / dps).toBeLessThan(120);
    expect(hp / dps).toBeGreaterThan(30);
  });
});
