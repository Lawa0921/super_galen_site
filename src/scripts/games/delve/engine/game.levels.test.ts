// game.levels.test.ts — 等級系統接上遊戲：經驗來源、升級、技能點與數值（含上限）、重置、主動技能、死亡懲罰、存檔。
import { describe, it, expect } from 'vitest';
import { DelveGame, type DelveEvent } from './game';
import { T, W } from './tiles';
import { FIXED_DT, TILE_SIZE as S } from './constants';
import { enemyXp, levelHp, respecCost, xpAtLevel, DEATH_XP_LOSS } from './levels';
import { SKILL_CD, DASH_TIME } from './skills';
import { STAT_CAPS } from './gear';
import { fallDamage } from './combat';
import type { ItemId } from './items';
import { serializeGame, restoreGame } from '../save/serialize';

const SMALL = { width: 160, height: 100 };
function arena(opts: { px?: number; floorY?: number; seed?: string } = {}): DelveGame {
  const { px = 60, floorY = 60, seed = 'levels' } = opts;
  const g = new DelveGame({ seed, ...SMALL, peaceful: true });
  g.setAppearance({ ...g.appearance, race: 1 }); // 精靈：沒有經驗加成（人類 +10% 會讓精確經驗數字對不上）
  const w = g.world;
  for (let y = 0; y < w.height; y++) for (let x = 30; x < 100; x++) { w.setFg(x, y, y >= floorY ? T.STONE : T.AIR); w.setWall(x, y, W.NONE); w.setLiquid(x, y, 0, 0); }
  g.teleport(px, floorY - 1);
  run(g, 0.1);
  g.drainEvents();
  // 開場就發現的地區也有經驗：測試從 0 經驗開始
  g.levels.load(null);
  return g;
}
function run(g: DelveGame, seconds: number): void { for (let i = 0, n = Math.round(seconds / FIXED_DT); i < n; i++) g.step(FIXED_DT); }
function hold(g: DelveGame, item: ItemId, n = 1): void {
  g.give(item, n);
  const i = g.inventory.slots.findIndex((s) => s?.item === item);
  g.inventory.swap(i, 0);
  g.selectSlot(0);
}
const evs = (g: DelveGame): DelveEvent[] => g.drainEvents();
/** 直接到某一級（debug 加經驗）並清掉事件 */
function toLevel(g: DelveGame, L: number): void { g.addXp(xpAtLevel(L) - g.levels.xp); g.drainEvents(); }

describe('經驗來源', () => {
  it('打死怪物 → xp 事件（在怪物位置）+ 累計經驗', () => {
    const g = arena();
    const e = g.spawnEnemy('gel_blob', 64, 59);
    g.debugDamage(e.id, 999);
    const xp = evs(g).filter((x) => x.type === 'xp');
    expect(xp).toHaveLength(1);
    expect(xp[0]).toMatchObject({ type: 'xp', amount: enemyXp('gel_blob'), src: 'kill' });
    expect(g.levels.xp).toBe(enemyXp('gel_blob'));
    expect(g.getState().level).toMatchObject({ level: 1, xp: enemyXp('gel_blob') });
  });
  it('挖天然礦有經驗；自己放的礦沒有', () => {
    const g = arena();
    g.world.setFg(62, 59, T.COPPER_ORE);
    g.mineInstant(62, 59);
    expect(evs(g).some((x) => x.type === 'xp' && x.src === 'mine')).toBe(true);
    const before = g.levels.xp;
    hold(g, 'copper_ore', 3);
    expect(g.tryPlace(62, 59)).toBe(true);
    run(g, 0.05);
    g.mineInstant(62, 59);
    run(g, 0.05);
    evs(g);
    expect(g.levels.xp).toBe(before);
  });
  it('第一次合成某個配方有經驗，第二次沒有', () => {
    const g = arena();
    g.world.setFg(61, 59, T.WORKBENCH);
    g.give('wood', 20); g.give('gel', 4);
    expect(g.craft('torch').ok).toBe(true);
    const a = evs(g).filter((x) => x.type === 'xp').length;
    expect(g.craft('torch').ok).toBe(true);
    const b = evs(g).filter((x) => x.type === 'xp').length;
    expect(a).toBe(1);
    expect(b).toBe(0);
  });
});

describe('升級', () => {
  it('跨級 → levelup 事件（每一級一個）、生命上限 +2/級、技能點', () => {
    const g = arena();
    const hp0 = g.maxHp();
    g.addXp(xpAtLevel(5));
    const ups = evs(g).filter((x): x is Extract<DelveEvent, { type: 'levelup' }> => x.type === 'levelup');
    expect(ups.map((u) => u.level)).toEqual([2, 3, 4, 5]);
    expect(ups[3].title).not.toBeNull(); // 5 級里程碑：稱號
    expect(ups[0].title).toBeNull();
    expect(g.maxHp()).toBe(hp0 + levelHp(5));
    expect(g.levels.points).toBe(5);
  });
  it('每 10 級防禦 +1', () => {
    const g = arena();
    const d0 = g.stats().defense;
    toLevel(g, 10);
    expect(g.stats().defense).toBe(d0 + 1);
  });
});

describe('技能點 → 數值', () => {
  it('鍛體 +生命上限、銳鋒 +傷害倍率；和裝備詞條共用上限', () => {
    const g = arena();
    toLevel(g, 8);
    const hp = g.maxHp(), dm = g.stats().damageMul;
    expect(g.learnSkill('b_vigor')).toBeNull();
    expect(g.maxHp()).toBe(hp + 10);
    expect(g.learnSkill('b_edge')).toBeNull();
    expect(g.stats().damageMul).toBeCloseTo(dm + 0.04, 5);
    expect(evs(g).some((x) => x.type === 'learn')).toBe(true);
    // 詞條把傷害堆到上限 → 技能不會再往上加
    hold(g, 'copper_sword');
    g.inventory.slots[0]!.gear = { rarity: 4, ilvl: 5, plus: 0, affixes: [{ id: 'keen', tier: 5, value: STAT_CAPS.dmg }] };
    g.invalidateStats();
    expect(g.stats().gear.dmg).toBe(STAT_CAPS.dmg);
  });
  it('前置沒點 / 點數不夠 → 失敗原因，不扣點', () => {
    const g = arena();
    toLevel(g, 2);
    expect(g.learnSkill('b_edge')).toBe('req');
    expect(g.learnSkill('b_vigor')).toBeNull();
    expect(g.learnSkill('b_vigor')).toBe('points');
    expect(g.levels.spent).toBe(1);
  });
  it('長臂 +伸手距離、巧手更快挖完', () => {
    const g = arena();
    toLevel(g, 10);
    const r0 = g.reach();
    g.learnSkill('p_stride'); g.learnSkill('p_reach');
    expect(g.reach()).toBe(r0 + 1);
    const timeToMine = (gg: DelveGame): number => {
      gg.world.setFg(61, 60, T.STONE);
      gg.setAim(61, 60); gg.setMining(true);
      let n = 0;
      while (gg.world.getFg(61, 60) !== T.AIR && n < 600) { gg.step(FIXED_DT); n++; }
      gg.setMining(false);
      return n;
    };
    const slow = timeToMine(arena());
    for (let k = 0; k < 5; k++) g.learnSkill('c_hands');
    expect(timeToMine(g)).toBeLessThan(slow);
  });
  it('雲步 = 空中再跳；和凌雲疊成三段跳', () => {
    const g = arena();
    toLevel(g, 20);
    expect(g.moveStats().airJumps).toBe(0);
    for (const id of ['p_stride', 'p_feather', 'p_spring', 'p_cloud'] as const) expect(g.learnSkill(id)).toBeNull();
    expect(g.moveStats().airJumps).toBe(1);
    g.giveGear('wood_greaves', 4, { affixes: [{ id: 'skyleap', tier: 5, value: 1 }] });
    const i = g.inventory.slots.findIndex((s) => s?.item === 'wood_greaves');
    expect(g.equipFromInventory(i)).toBe(true);
    expect(g.moveStats().airJumps).toBe(2);
  });
  it('拆解 +分解產量、議價 −鍛造成本', () => {
    const g = arena();
    toLevel(g, 10);
    const gear = { rarity: 3, ilvl: 4, plus: 0, affixes: [] };
    g.give('copper_sword'); const i = g.inventory.slots.findIndex((s) => s?.item === 'copper_sword');
    g.inventory.slots[i]!.gear = { ...gear };
    const c0 = g.forgeCosts(i).upgrade!;
    g.learnSkill('c_hands'); g.learnSkill('c_salvage'); g.learnSkill('c_salvage'); g.learnSkill('c_haggle'); g.learnSkill('c_haggle');
    const c1 = g.forgeCosts(i).upgrade!;
    expect(c1.shard).toBeLessThan(c0.shard);
    const y = g.salvage(i)!;
    expect(y.shard).toBe(Math.round((12 + 2) * 1.4)); // 史詩：12 + ⌊4/2⌋，+40%
  });
});

describe('重置技能樹', () => {
  it('要材料；付得起 → 點數全退、數值回去', () => {
    const g = arena();
    toLevel(g, 6);
    g.learnSkill('b_vigor'); g.learnSkill('b_vigor'); g.learnSkill('b_edge');
    const hpSkilled = g.maxHp();
    const cost = g.respecCost();
    expect(cost).toEqual(respecCost(3));
    expect(g.respecSkills()).toEqual({ ok: false, reason: 'cost' });
    g.give('gear_shard', cost.shard);
    expect(g.respecSkills()).toEqual({ ok: true, refunded: 3 });
    expect(g.inventory.count('gear_shard')).toBe(0);
    expect(g.levels.spent).toBe(0);
    expect(g.levels.points).toBe(6);
    expect(g.maxHp()).toBe(hpSkilled - 20);
    expect(g.respecSkills()).toEqual({ ok: false, reason: 'none' });
  });
});

describe('主動技能', () => {
  it('沒學 → 不能用；突進：往前衝 ≥ 4 格、途中無敵、冷卻中不能再用', () => {
    const g = arena({ px: 40 });
    expect(g.useSkill('dash')).toBe(false);
    toLevel(g, 4);
    g.learnSkill('b_vigor'); // 1 點
    g.learnSkill('b_dash'); // 2 點
    expect(g.levels.has('b_dash')).toBe(true);
    const x0 = g.player.x;
    g.facing = 1;
    expect(g.useSkill('dash')).toBe(true);
    run(g, DASH_TIME / 2);
    expect(g.getState().iframes).toBeGreaterThan(0);
    run(g, 0.3);
    expect((g.player.x - x0) / S).toBeGreaterThanOrEqual(4);
    // 結束後收掉動量：總共約 6 格，不會再滑一大段
    run(g, 0.8);
    expect((g.player.x - x0) / S).toBeLessThanOrEqual(7);
    expect(g.useSkill('dash')).toBe(false);
    expect(g.skillCooldown('dash')).toBeGreaterThan(0);
    run(g, SKILL_CD.dash);
    expect(g.useSkill('dash')).toBe(true);
  });
  it('震地：地面上用 → 打到附近的怪', () => {
    const g = arena();
    toLevel(g, 8);
    for (const id of ['b_vigor', 'b_dash', 'b_guard', 'b_slam'] as const) expect(g.learnSkill(id)).toBeNull();
    const e = g.spawnEnemy('night_walker', 62, 59);
    run(g, 0.05); evs(g);
    const hp = e.hp;
    expect(g.useSkill('slam')).toBe(true);
    run(g, 0.05);
    expect(e.hp).toBeLessThan(hp);
    expect(evs(g).some((x) => x.type === 'skill' && x.skill === 'slam' && x.phase === 'land')).toBe(true);
  });
  it('震地：空中用 → 急墜，落地才放衝擊波、不受摔落傷害', () => {
    const g = arena({ floorY: 90 });
    toLevel(g, 8);
    for (const id of ['b_vigor', 'b_dash', 'b_guard', 'b_slam'] as const) g.learnSkill(id);
    g.teleport(60, 50); // 離地 40 格（一般會摔死）
    run(g, 0.1);
    evs(g);
    const hp = g.hp;
    expect(g.useSkill('slam')).toBe(true);
    run(g, 2);
    const ev = evs(g);
    expect(ev.some((x) => x.type === 'skill' && x.skill === 'slam' && x.phase === 'land')).toBe(true);
    expect(ev.some((x) => x.type === 'hurt' && x.fall)).toBe(false);
    expect(g.hp).toBeGreaterThanOrEqual(hp);
  });
  it('尋礦感知：標出半徑內的礦（穿過岩壁）', () => {
    const g = arena();
    toLevel(g, 5);
    g.learnSkill('p_stride'); g.learnSkill('p_lamp'); g.learnSkill('p_sense');
    g.world.setFg(70, 75, T.IRON_ORE);
    expect(g.useSkill('pulse')).toBe(true);
    expect(g.orePulse?.ores.some((o) => o.x === 70 && o.y === 75)).toBe(true);
    run(g, 9);
    expect(g.orePulse).toBeNull();
  });
});

describe('驗收修正', () => {
  it('震地：急墜前已經掉的高度照算摔落傷害，只有急墜那段免傷', () => {
    const g = arena({ floorY: 90 });
    toLevel(g, 8);
    for (const id of ['b_vigor', 'b_dash', 'b_guard', 'b_slam'] as const) g.learnSkill(id);
    g.teleport(60, 39); // 腳底離地 50 格
    run(g, 1.15); // 先自由落下約 35 格
    evs(g);
    expect(g.useSkill('slam')).toBe(true);
    run(g, 1.5);
    const fall = evs(g).filter((x): x is Extract<DelveEvent, { type: 'hurt' }> => x.type === 'hurt' && x.fall);
    expect(fall).toHaveLength(1);
    expect(fall[0].amount).toBeGreaterThan(30); // 約 (35 − 24) × 7
    expect(fall[0].amount).toBeLessThan(fallDamage(50)); // 整段 50 格的摔落傷害
  });
  it('背水和傷害詞條共用上限：低血時有加成，詞條已經到頂就沒有', () => {
    const g = arena();
    toLevel(g, 15);
    for (const id of ['b_vigor', 'b_edge', 'b_eye', 'b_fury'] as const) expect(g.learnSkill(id)).toBeNull();
    const fury = (): number => (g as unknown as { furyBonus(): number }).furyBonus();
    expect(fury()).toBe(0); // 滿血
    g.hp = g.maxHp() * 0.2;
    expect(fury()).toBeCloseTo(0.25, 5);
    hold(g, 'copper_sword');
    g.inventory.slots[0]!.gear = { rarity: 4, ilvl: 5, plus: 0, affixes: [{ id: 'keen', tier: 5, value: STAT_CAPS.dmg }] };
    g.invalidateStats();
    expect(fury()).toBe(0);
  });
  it('三段跳的第三跳比較矮（按住時間縮短）', () => {
    const g = arena({ floorY: 90 });
    toLevel(g, 20);
    for (const id of ['p_stride', 'p_feather', 'p_spring', 'p_cloud'] as const) g.learnSkill(id);
    g.giveGear('wood_greaves', 4, { affixes: [{ id: 'skyleap', tier: 5, value: 1 }] });
    g.equipFromInventory(g.inventory.slots.findIndex((s) => s?.item === 'wood_greaves'));
    run(g, 0.5);
    const rise = (): number => {
      // 在空中按一下跳（按住到頂點）→ 這一跳往上升了多少 px
      g.setJump(true); g.step(FIXED_DT);
      const y0 = g.player.y;
      let top = y0;
      for (let k = 0; k < 90 && g.player.vy <= 0; k++) { g.step(FIXED_DT); top = Math.min(top, g.player.y); }
      g.setJump(false); g.step(FIXED_DT);
      return y0 - top;
    };
    g.setJump(true); run(g, 0.3); g.setJump(false); run(g, 0.3); // 第一跳，落到下降段
    const second = rise();
    run(g, 0.2);
    const third = rise();
    expect(g.moveStats().airJumps).toBe(2);
    expect(third).toBeGreaterThan(0);
    expect(third).toBeLessThan(second * 0.75);
  });
});

describe('死亡懲罰 / 掉落等級 / 存檔', () => {
  it('死亡 → 失去本級進度的 10%，不掉級', () => {
    const g = arena();
    g.addXp(xpAtLevel(4) + 200);
    evs(g);
    g.hurtPlayer(9999, 0);
    expect(g.dead).toBe(true);
    expect(g.levels.level).toBe(4);
    expect(g.levels.xp).toBe(xpAtLevel(4) + 200 - Math.floor(200 * DEATH_XP_LOSS));
    expect(evs(g).some((x) => x.type === 'xploss')).toBe(true);
  });
  it('高等級在地表打怪：掉落物品等級最多被推高 1 階', () => {
    const g = arena();
    toLevel(g, 30);
    g.debugGearChance = 1;
    const e = g.spawnEnemy('gel_blob', 64, 59);
    g.debugDamage(e.id, 999);
    const d = g.drops.list.find((x) => x.gear);
    expect(d?.gear?.ilvl).toBeGreaterThanOrEqual(2);
    expect(d?.gear?.ilvl).toBeLessThanOrEqual(3);
  });
  it('存檔 → 讀檔：經驗、技能、防刷紀錄都在', () => {
    const g = arena();
    toLevel(g, 9);
    g.learnSkill('b_vigor'); g.learnSkill('p_stride');
    const e = g.spawnEnemy('gel_blob', 64, 59);
    g.debugDamage(e.id, 999);
    evs(g);
    const r = restoreGame(serializeGame(g));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const h = r.game;
    expect(h.levels.toJSON()).toEqual(g.levels.toJSON());
    expect(h.maxHp()).toBe(g.maxHp());
    expect(h.getState().level.level).toBe(9);
  });
});
