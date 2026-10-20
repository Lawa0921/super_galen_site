// actors.world.test.ts — 世界系統看所有玩家（co-op M-B1 Task 3）：
// 怪物鎖定最近的活著的玩家、任一玩家附近就活躍、離所有人都太遠才消失、接觸傷害 / 敵方投射物打到被碰的那個人、
// 玩家投射物帶 owner（迴旋木刃回到 owner、命中 / 擊殺事件帶 owner 的 pid）、掉落物給最近的人、液體 / 放置看任一玩家、
// 生成輪流以活著的玩家為中心。
import { describe, it, expect } from 'vitest';
import { DelveGame, type DelveEvent } from './game';
import { T, W } from './tiles';
import { BIOME, LIQ } from './world';
import { FIXED_DT, TILE_SIZE } from './constants';
import { ACTIVE, DESPAWN, SPAWN_MAX } from './spawn';
import { createCharacter } from '../save/character';
import { normalizeAppearance } from './appearance';
import type { PlayerActor } from './actor';

const FLOOR = 60, S = TILE_SIZE;

/** 寬平地：y ≥ 60 石頭、x 40..69 地表是泥土、白天森林；本地玩家（A）站在 (40, 59)；和平（沒有自然生成） */
function arena(width = 400): DelveGame {
  const g = new DelveGame({ seed: 'actors-world', width, height: 100 });
  const w = g.world;
  g.liquids.setSprings([]);
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) {
    w.setLiquid(x, y, 0, LIQ.NONE);
    w.setFg(x, y, y >= FLOOR ? T.STONE : T.AIR);
    w.setWall(x, y, W.NONE);
  }
  for (let x = 0; x < w.width; x++) { w.surface[x] = FLOOR; w.biome[x] = BIOME.FOREST; }
  for (let x = 40; x < 70; x++) w.setFg(x, FLOOR, T.DIRT);
  g.teleport(40, FLOOR - 1);
  g.setDate({ season: 1, day: 2, hour: 12 });
  g.peaceful = true;
  g.drainAll();
  return g;
}

const hero = () => createCharacter('乙', normalizeAppearance(undefined), 0);
function steps(g: DelveGame, n: number): void { for (let i = 0; i < n; i++) g.step(FIXED_DT); }
const center = (a: PlayerActor) => ({ x: a.player.x + a.player.w / 2, y: a.player.y + a.player.h / 2 });
/** A 死掉而且一直不重生 */
function killForGood(g: DelveGame, a: PlayerActor): void {
  g.withActor(a, () => g.hurtPlayer(9999, 0));
  expect(a.dead).toBe(true);
  a.respawnT = 1e9;
}

describe('players()', () => {
  it('列出每個 actor 的 pid / 中心 / 死活 / 是否在水裡（插入順序）', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 60, y: FLOOR - 1 });
    const ps = g.players();
    expect(ps.map((p) => p.pid)).toEqual(['h', 'b']);
    expect(ps[0].cx).toBeCloseTo(g.playerCenter().x);
    expect(ps[0].cy).toBeCloseTo(g.playerCenter().y);
    const bc = g.withActor(b, () => g.playerCenter());
    expect(ps[1].cx).toBeCloseTo(bc.x);
    expect(ps[1].cy).toBeCloseTo(bc.y);
    expect(ps.map((p) => [p.dead, p.wet])).toEqual([[false, false], [false, false]]);
    killForGood(g, b);
    expect(g.players()[1].dead).toBe(true);
  });
});

describe('怪物鎖定最近的活著的玩家', () => {
  it('A 近、B 遠 → 朝 A；A 死了 → 改朝 B', () => {
    const g = arena();
    g.addActor('b', hero(), { x: 70, y: FLOOR - 1 });
    const e = g.spawnEnemy('sand_scorpion', 50, FLOOR - 1);
    steps(g, 3);
    expect(e.dir).toBe(-1);
    killForGood(g, g.local);
    steps(g, 3);
    expect(e.dir).toBe(1);
  });

  it('A 在左、B 在右、怪物比較靠近 B → 朝 B（不是只看本地玩家）', () => {
    const g = arena();
    g.addActor('b', hero(), { x: 70, y: FLOOR - 1 });
    const e = g.spawnEnemy('sand_scorpion', 62, FLOOR - 1);
    steps(g, 3);
    expect(e.dir).toBe(1);
  });
});

describe('活躍 / 消失看所有玩家', () => {
  it('A 在 ACTIVE 內、B 很遠 → 怪物活躍', () => {
    const g = arena();
    g.addActor('b', hero(), { x: 380, y: FLOOR - 1 });
    const e = g.spawnEnemy('gel_blob', 60, FLOOR - 1);
    steps(g, 10);
    expect(g.enemies).toContain(e);
    expect(e.age).toBeGreaterThan(0);
  });

  it('只有 B 在附近（A 超過 DESPAWN）→ 不消失、照樣活躍', () => {
    const g = arena();
    g.addActor('b', hero(), { x: 300, y: FLOOR - 1 });
    const e = g.spawnEnemy('gel_blob', 290, FLOOR - 1);
    expect(290 - 40).toBeGreaterThan(DESPAWN.x);
    steps(g, 10);
    expect(g.enemies).toContain(e);
    expect(e.age).toBeGreaterThan(0);
  });

  it('離 A、B 都在 DESPAWN 內但都超過 ACTIVE → 凍結不消失；都超過 DESPAWN → 消失', () => {
    const g = arena();
    g.addActor('b', hero(), { x: 390, y: FLOOR - 1 });
    // 離 A 130 格、離 B 130 格：都超過 DESPAWN（110）
    const gone = g.spawnEnemy('gel_blob', 170 + 45, FLOOR - 1);
    // 離 A 85 格（> ACTIVE 80、< DESPAWN 110）、離 B 265 格
    const idle = g.spawnEnemy('gel_blob', 40 + 85, FLOOR - 1);
    expect(85).toBeGreaterThan(ACTIVE.x);
    steps(g, 2);
    expect(g.enemies).not.toContain(gone);
    expect(g.enemies).toContain(idle);
    expect(idle.age).toBe(0);
  });
});

describe('傷害打到被碰的那個人', () => {
  it('接觸傷害：怪物和 B 重疊 → 只有 B 扣血、hurt 帶 b', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 60, y: FLOOR - 1 });
    steps(g, 3);
    g.drainAll();
    const hpA = g.local.hp, hpB = b.hp;
    g.spawnEnemy('sand_scorpion', 60, FLOOR - 1);
    steps(g, 2);
    expect(b.hp).toBeLessThan(hpB);
    expect(g.local.hp).toBe(hpA);
    const evB = g.drainEvents('b'), evH = g.drainEvents('h');
    expect(evB.some((e) => e.type === 'hurt' && e.pid === 'b')).toBe(true);
    expect(evH.some((e) => e.type === 'hurt')).toBe(false);
  });

  it('敵方投射物打到 B → 只有 B 扣血、hurt 事件帶 b 的 pid', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 60, y: FLOOR - 1 });
    steps(g, 3);
    g.drainAll();
    const hpA = g.local.hp, hpB = b.hp;
    const c = center(b);
    const pr = g.projectiles.spawn('stinger', true, c.x, c.y, 0, 0, { damage: 12, life: 2 });
    steps(g, 1);
    expect(b.hp).toBeLessThan(hpB);
    expect(g.local.hp).toBe(hpA);
    expect(pr.life).toBeLessThanOrEqual(0);
    const evB = g.drainEvents('b'), evH = g.drainEvents('h');
    expect(evB.filter((e) => e.type === 'hurt').map((e) => e.pid)).toEqual(['b']);
    expect(evH.some((e) => e.type === 'hurt')).toBe(false);
  });
});

describe('玩家投射物帶 owner', () => {
  it('B 的投射物打死怪物：hit / kill 事件帶 b', () => {
    const g = arena();
    g.addActor('b', hero(), { x: 66, y: FLOOR - 1 });
    const e = g.spawnEnemy('gel_blob', 52, FLOOR - 1);
    e.hp = 1;
    g.drainAll();
    const ec = { x: e.body.x + e.body.w / 2, y: e.body.y + e.body.h / 2 };
    g.projectiles.spawn('bolt', false, ec.x, ec.y, 0, 0, { damage: 50, life: 1, owner: 'b' });
    steps(g, 1);
    expect(g.enemies).not.toContain(e);
    const ev = g.drainAll();
    const hit = ev.find((x) => x.type === 'hit' && x.id === e.id);
    const kill = ev.find((x) => x.type === 'kill' && x.id === e.id);
    expect(hit?.pid).toBe('b');
    expect(kill?.pid).toBe('b');
  });

  it('B 揮出的投射物帶 owner = b', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 66, y: FLOOR - 1 });
    g.withActor(b, () => { g.give('wood_boomerang'); const i = g.inventory.slots.findIndex((s) => s?.item === 'wood_boomerang'); g.inventory.select(i); });
    g.input('b').aim = { x: 70, y: FLOOR - 2 };
    g.input('b').mining = true;
    steps(g, 2);
    const mine = g.projectiles.list.filter((p) => !p.hostile);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((p) => p.owner === 'b')).toBe(true);
  });

  it('迴旋木刃回到 owner（不是本地玩家）', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 70, y: FLOOR - 1 });
    // 離 A 比較近、owner 是右邊的 B
    const pr = g.projectiles.spawn('boomerang', false, 48 * S, (FLOOR - 3) * S, 0, 0, { life: 4, pierce: 99, owner: 'b' });
    pr.returning = true;
    steps(g, 1);
    expect(pr.body.vx).toBeGreaterThan(0);
    // 飛到 B 身上被收回
    for (let i = 0; i < 120 && g.projectiles.list.includes(pr); i++) steps(g, 1);
    expect(g.projectiles.list.includes(pr)).toBe(false);
    expect(Math.abs(pr.body.x + pr.body.w / 2 - center(b).x)).toBeLessThan(3 * S);
  });
});

describe('掉落物給最近的人', () => {
  it('兩人都在吸取範圍內：較近的 B 撿走，pickup 事件只給 b', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 46, y: FLOOR - 1 });
    steps(g, 3);
    g.drainAll();
    const a0 = g.local.inventory.count('gel'), b0 = b.inventory.count('gel');
    g.drops.spawn('gel', 3, 44.5 * S, (FLOOR - 1) * S, 0, 0);
    steps(g, 90);
    expect(b.inventory.count('gel')).toBe(b0 + 3);
    expect(g.local.inventory.count('gel')).toBe(a0);
    const evB = g.drainEvents('b'), evH = g.drainEvents('h');
    expect(evB.some((e) => e.type === 'pickup' && e.pid === 'b')).toBe(true);
    expect(evH.some((e) => e.type === 'pickup')).toBe(false);
  });

  it('只有 B 在附近（A 很遠）→ B 撿得到', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 300, y: FLOOR - 1 });
    steps(g, 3);
    const b0 = b.inventory.count('gel');
    g.drops.spawn('gel', 2, 302 * S, (FLOOR - 1) * S, 0, 0);
    steps(g, 90);
    expect(b.inventory.count('gel')).toBe(b0 + 2);
  });

  it('死掉的人不撿：A 死了、掉落物在 A 身上 → 活著的 B 吸走', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 44, y: FLOOR - 1 });
    steps(g, 3);
    killForGood(g, g.local);
    const b0 = b.inventory.count('gel');
    const ac = center(g.local);
    g.drops.spawn('gel', 1, ac.x, ac.y, 0, 0);
    steps(g, 90);
    expect(b.inventory.count('gel')).toBe(b0 + 1);
  });
});

describe('液體 / 放置看任一玩家', () => {
  it('liquids.blocked：B 站的格子擋住液體（B 死了就不擋）', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 60, y: FLOOR - 1 });
    steps(g, 3);
    const bt = g.withActor(b, () => g.feetTile());
    expect(g.liquids.blocked?.(bt.x, bt.y)).toBe(true);
    expect(g.liquids.blocked?.(bt.x + 5, bt.y)).toBe(false);
    killForGood(g, b);
    expect(g.liquids.blocked?.(bt.x, bt.y)).toBe(false);
  });

  // liquids.blocked 擋的是「液體反應凝成方塊」（不把人封進黑曜石），不是水流本身：水本來就會流到玩家身上（游泳）
  it('熔岩遇水不會在 B 站的格子凝成黑曜石（沒人站就會）', () => {
    const run = (withB: boolean): number => {
      const g = arena();
      const w = g.world;
      if (withB) { const b = g.addActor('b', hero(), { x: 60, y: FLOOR - 1 }); b.hp = 1e6; }
      steps(g, 3);
      w.setLiquid(59, FLOOR - 1, 255, LIQ.WATER);
      w.setLiquid(60, FLOOR - 1, 255, LIQ.LAVA);
      g.liquids.wake(59, FLOOR - 1); g.liquids.wake(60, FLOOR - 1);
      steps(g, 10);
      return w.getFg(60, FLOOR - 1);
    };
    expect(run(false)).toBe(T.OBSIDIAN);
    expect(run(true)).not.toBe(T.OBSIDIAN);
  });

  it('A 不能把方塊放在 B 身上', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 43, y: FLOOR - 1 });
    steps(g, 3);
    g.give('dirt', 5);
    g.selectSlot(g.inventory.slots.findIndex((s) => s?.item === 'dirt'));
    const bt = g.withActor(b, () => g.feetTile());
    g.drainAll();
    g.setAim(bt.x, bt.y); g.setUse(true);
    steps(g, 1);
    g.setUse(false);
    expect(g.world.getFg(bt.x, bt.y)).toBe(T.AIR);
    const ev = g.drainEvents('h');
    expect(ev.some((e) => e.type === 'blocked' && e.reason === 'body')).toBe(true);
  });
});

describe('生成輪流以活著的玩家為中心', () => {
  it('A 死了（不重生）、B 活著在遠方 → 照樣生怪，而且生在 B 附近', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 300, y: FLOOR - 1 });
    g.setDate({ season: 1, day: 2, hour: 23 });
    g.peaceful = false;
    killForGood(g, g.local);
    let spawned = 0;
    for (let i = 0; i < 60 * 90 && spawned === 0; i++) { g.step(FIXED_DT); spawned = g.enemies.length; }
    expect(spawned).toBeGreaterThan(0);
    const bx = center(b).x / S;
    for (const e of g.enemies) expect(Math.abs((e.body.x + e.body.w / 2) / S - bx)).toBeLessThan(SPAWN_MAX.x + 12);
  });
});

describe('單機不變', () => {
  it('只有一個 actor：players() 只有本地', () => {
    const g = arena();
    expect(g.players().map((p) => p.pid)).toEqual(['h']);
    const ev: DelveEvent[] = g.drainAll();
    expect(ev).toEqual([]);
  });
});

describe('擊殺歸屬：最後打中的人（持續傷害 / 液體擊殺也算他的）', () => {
  const NO_FX = { burn: 0, frost: 0, poison: 0, leech: 0, chain: 0, soul: 0, pen: 0 };
  /** 這段事件裡有沒有給 pid 的擊殺經驗（單機時事件不帶 pid = 本地玩家） */
  const xpTo = (ev: DelveEvent[], pid: string, src: 'kill' | 'boss' = 'kill') => ev.some((e) => e.type === 'xp' && e.src === src && (e.pid ?? 'h') === pid);
  /** B 的投射物在怪物身上打一下（不打死） */
  function bHits(g: DelveGame, e: ReturnType<DelveGame['spawnEnemy']>, o: { flame?: boolean; fx?: typeof NO_FX } = {}): void {
    e.hp = 1000;
    const ec = { x: e.body.x + e.body.w / 2, y: e.body.y + e.body.h / 2 };
    g.projectiles.spawn('arrow', false, ec.x, ec.y, 0, 0, { damage: 1, knockback: 0, life: 1, owner: 'b', ...o });
    steps(g, 1);
    expect(g.enemies).toContain(e);
  }
  /** 跑到怪物死掉，回傳這段的所有事件（drainAll 會先換算經驗：xp 事件也在裡面） */
  function untilDead(g: DelveGame, e: ReturnType<DelveGame['spawnEnemy']>): DelveEvent[] {
    const ev: DelveEvent[] = [];
    for (let i = 0; i < 240 && g.enemies.includes(e); i++) { steps(g, 1); ev.push(...g.drainAll()); }
    expect(g.enemies).not.toContain(e);
    return ev;
  }

  it('B 點燃的怪物燒死 → kill 事件帶 b、經驗給 B', () => {
    const g = arena();
    g.addActor('b', hero(), { x: 66, y: FLOOR - 1 });
    const e = g.spawnEnemy('gel_blob', 52, FLOOR - 1);
    bHits(g, e, { flame: true });
    expect(e.burn).toBeGreaterThan(0);
    e.hp = 1;
    g.drainAll();
    const ev = untilDead(g, e), kill = ev.find((x) => x.type === 'kill' && x.id === e.id);
    expect(kill?.pid).toBe('b');
    expect(xpTo(ev, 'b')).toBe(true);
    expect(xpTo(ev, 'h')).toBe(false);
  });

  it('B 讓怪物中毒、毒死 → 經驗給 B', () => {
    const g = arena();
    g.addActor('b', hero(), { x: 66, y: FLOOR - 1 });
    const e = g.spawnEnemy('gel_blob', 52, FLOOR - 1);
    bHits(g, e, { fx: { ...NO_FX, poison: 100 } });
    expect(e.poison).toBeGreaterThan(0);
    e.hp = 1;
    const ev = untilDead(g, e), kill = ev.find((x) => x.type === 'kill' && x.id === e.id);
    expect(kill?.pid).toBe('b');
    expect(xpTo(ev, 'b')).toBe(true);
    expect(xpTo(ev, 'h')).toBe(false);
  });

  /** 地上一格熔岩（x），怪物站在上面 */
  function lavaAt(g: DelveGame, x: number): void {
    g.world.setLiquid(x, FLOOR - 1, 255, LIQ.LAVA);
  }
  it('沒人打過、掉進熔岩死掉 → 世界擊殺，照舊記給本地玩家', () => {
    const g = arena();
    g.addActor('b', hero(), { x: 66, y: FLOOR - 1 });
    const e = g.spawnEnemy('gel_blob', 55, FLOOR - 1);
    e.hp = 1;
    lavaAt(g, 55);
    const ev = untilDead(g, e), kill = ev.find((x) => x.type === 'kill' && x.id === e.id);
    expect(kill).toBeDefined();
    expect(kill?.pid).toBeUndefined();
    expect(xpTo(ev, 'h')).toBe(true);
    expect(xpTo(ev, 'b')).toBe(false);
  });

  it('B 打過、之後掉進熔岩死掉 → 記給 B', () => {
    const g = arena();
    g.addActor('b', hero(), { x: 66, y: FLOOR - 1 });
    const e = g.spawnEnemy('gel_blob', 55, FLOOR - 1);
    bHits(g, e);
    e.hp = 1;
    lavaAt(g, 55);
    const ev = untilDead(g, e), kill = ev.find((x) => x.type === 'kill' && x.id === e.id);
    expect(kill?.pid).toBe('b');
    expect(xpTo(ev, 'b')).toBe(true);
    expect(xpTo(ev, 'h')).toBe(false);
  });

  it('打過的人已經離開 → 退回本地玩家', () => {
    const g = arena();
    g.addActor('b', hero(), { x: 66, y: FLOOR - 1 });
    const e = g.spawnEnemy('gel_blob', 52, FLOOR - 1);
    bHits(g, e, { flame: true });
    g.removeActor('b');
    e.hp = 1;
    g.drainAll();
    expect(xpTo(untilDead(g, e), 'h')).toBe(true);
  });

  /** 首領的轉生之藥：B 第一次擊敗必掉（A 打過不影響 B 的首殺） */
  const potions = (g: DelveGame, b: PlayerActor) => g.drops.list.filter((d) => d.item === 'rebirth_potion').reduce((n, d) => n + d.count, 0)
    + g.local.inventory.count('rebirth_potion') + b.inventory.count('rebirth_potion');
  it('B 的箭射死首領 → 轉生之藥看 B 的首殺紀錄', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 66, y: FLOOR - 1 });
    g.local.levels.bosses.add('lantern_warden');
    const e = g.spawnEnemy('lantern_warden', 56, FLOOR - 1);
    e.phase = 2; // 第二階段：血量低也不會進碎籠（無敵）
    e.hp = 1;
    const ec = { x: e.body.x + e.body.w / 2, y: e.body.y + e.body.h / 2 };
    g.projectiles.spawn('arrow', false, ec.x, ec.y, 0, 0, { damage: 50, life: 1, owner: 'b' });
    steps(g, 1);
    expect(g.enemies).not.toContain(e);
    expect(potions(g, b)).toBe(1);
    g.drainAll();
    expect(b.levels.bosses.has('lantern_warden')).toBe(true);
  });

  it('B 的火焰箭點燃首領、首領燒死 → 轉生之藥看 B 的首殺紀錄、首殺經驗給 B', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 66, y: FLOOR - 1 });
    g.local.levels.bosses.add('lantern_warden');
    const e = g.spawnEnemy('lantern_warden', 56, FLOOR - 1);
    e.phase = 2; // 第二階段：血量低也不會進碎籠（無敵）
    bHits(g, e, { flame: true });
    expect(e.burn).toBeGreaterThan(0);
    e.hp = 1;
    g.drainAll();
    const ev = untilDead(g, e), kill = ev.find((x) => x.type === 'kill' && x.id === e.id);
    expect(kill?.pid).toBe('b');
    expect(potions(g, b)).toBe(1);
    expect(xpTo(ev, 'b', 'boss')).toBe(true);
    expect(xpTo(ev, 'h', 'boss')).toBe(false);
    expect(b.levels.bosses.has('lantern_warden')).toBe(true);
  });
});
