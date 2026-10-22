// modes.test.ts — 房主 / 客人副本模式（co-op M-B3 Task 6，C11 / C12 / C13）：
// host 模式的遠端 actor 用回報的位置（照樣挖、放置觸及多 1.5 格）；teleSeq / knockSeq；
// replica 只動本地 actor、世界不動、指令轉送、事件直接進佇列、卸載不停放。
import { describe, it, expect } from 'vitest';
import { DelveGame, type DelveEvent, type DelveOptions } from './game';
import { T, W } from './tiles';
import { BIOME, LIQ } from './world';
import { CHUNK, FIXED_DT, TILE_SIZE } from './constants';
import { li, type Column, type ColumnLayers, type ColumnSource } from './column';
import { CMD_OPS, CMD_PENDING, type Cmd } from './commands';
import type { PlayerActor, RemoteMotion } from './actor';
import { createCharacter } from '../save/character';
import { normalizeAppearance } from './appearance';
import type { ItemId } from './items';
import { xpAtLevel } from './levels';
import { THIRD_JUMP_HOLD } from './skills';

const FLOOR = 60;
const S = TILE_SIZE;

/** 平地小世界（同 actors.test.ts）：y ≥ 60 石頭、x 40..69 地表是泥土；本地玩家站在 (40, 59) */
function arena(opts: DelveOptions = {}): DelveGame {
  const g = new DelveGame({ seed: 'actors', width: 160, height: 100, ...opts });
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
  g.drainEvents();
  return g;
}

const hero = () => createCharacter('乙', normalizeAppearance(undefined), 0);
function steps(g: DelveGame, n: number): void { for (let i = 0; i < n; i++) g.step(FIXED_DT); }
const center = (a: PlayerActor) => ({ x: a.player.x + a.player.w / 2, y: a.player.y + a.player.h / 2 });
/** 腳底站在 tile (tx, ty) 上的回報位置（身體左上角 px） */
const standAt = (a: PlayerActor, tx: number, ty: number, o: Partial<RemoteMotion> = {}): RemoteMotion => ({
  x: tx * S + S / 2 - a.player.w / 2, y: (ty + 1) * S - a.player.h, vx: 0, vy: 0,
  onGround: true, boating: false, climbing: false, facing: 1, ...o,
});

describe('host 模式：遠端 actor', () => {
  it('遠端 actor 用回報的位置（不是積分出來的）、facing 照抄；本地 actor 照常積分', () => {
    const g = arena();
    g.mode = 'host';
    const b = g.addActor('b', hero(), { x: 66, y: FLOOR - 1 });
    g.setMoveX(1);
    g.input('b').moveX = 1;
    const lx = g.local.player.x;
    g.setRemoteMotion('b', { x: 900, y: b.player.y, vx: 50, vy: 0, onGround: true, boating: false, climbing: false, facing: -1 });
    g.step(FIXED_DT);
    expect(b.player.x).toBe(900);
    expect(b.facing).toBe(-1);
    expect(g.local.player.x).toBeGreaterThan(lx);
    // 回報的位置每一步都套用（不是只套一次）
    steps(g, 5);
    expect(b.player.x).toBe(900);
  });

  it('沒有回報 → 身體停住', () => {
    const g = arena();
    g.mode = 'host';
    const b = g.addActor('b', hero(), { x: 66, y: FLOOR - 1 });
    const x0 = b.player.x, y0 = b.player.y;
    g.input('b').moveX = 1;
    steps(g, 20);
    expect(b.player.x).toBe(x0);
    expect(b.player.y).toBe(y0);
  });

  it('boating / climbing 照抄', () => {
    const g = arena();
    g.mode = 'host';
    const b = g.addActor('b', hero(), { x: 66, y: FLOOR - 1 });
    g.setRemoteMotion('b', standAt(b, 60, FLOOR - 1, { climbing: true }));
    g.step(FIXED_DT);
    expect(b.motion.climbing).toBe(true);
    g.setRemoteMotion('b', standAt(b, 60, FLOOR - 1, { boating: true }));
    g.step(FIXED_DT);
    expect(b.boating).toBe(true);
  });

  it('遠端 actor 仍會挖：瞄泥土按住挖 → 那格變空氣、掉落物出現', () => {
    const g = arena();
    g.mode = 'host';
    const b = g.addActor('b', hero(), { x: 66, y: FLOOR - 1 });
    g.setRemoteMotion('b', standAt(b, 50, FLOOR - 1));
    const pick = b.inventory.slots.findIndex((s) => s?.item === 'wood_pickaxe');
    expect(pick).toBeGreaterThanOrEqual(0);
    const inp = g.input('b');
    inp.selected = pick;
    inp.aim = { x: 51, y: FLOOR };
    inp.mining = true;
    const dirt0 = b.inventory.count('dirt');
    let ev: DelveEvent[] = [];
    for (let i = 0; i < 300 && g.world.getFg(51, FLOOR) !== T.AIR; i++) { g.step(FIXED_DT); ev = ev.concat(g.drainEvents('b')); }
    expect(g.world.getFg(51, FLOOR)).toBe(T.AIR);
    expect(ev).toContainEqual(expect.objectContaining({ type: 'mine', x: 51, y: FLOOR, pid: 'b' }));
    const dropped = g.drops.list.some((d) => d.item === 'dirt') || b.inventory.count('dirt') > dirt0;
    expect(dropped).toBe(true);
    // 挖的時候身體一直在回報的位置
    expect(b.player.x).toBe(standAt(b, 50, FLOOR - 1).x);
  });

  it('放置觸及多 1.5 格：遠端 7 格 → true；本地同距離 → false', () => {
    const g = arena();
    g.mode = 'host';
    const b = g.addActor('b', hero(), { x: 50, y: FLOOR - 1 });
    b.inventory.slots[1] = { item: 'dirt', count: 10 };
    g.local.inventory.slots[1] = { item: 'dirt', count: 10 };
    expect(g.withActor(b, () => g.reach())).toBe(6);
    expect(g.exec('b', { op: 'place', x: 57, y: FLOOR - 1, slot: 1 })).toBe(true);
    expect(g.world.getFg(57, FLOOR - 1)).toBe(T.DIRT);
    // 8 格 > 7.5：遠端也搆不到
    steps(g, 8);
    expect(g.exec('b', { op: 'place', x: 58, y: FLOOR - 1, slot: 1 })).toBe(false);
    // 本地：(40, 59) 到 (47, 59) 同樣 7 格
    expect(g.act({ op: 'place', x: 47, y: FLOOR - 1, slot: 1 })).toBe(false);
    expect(g.world.getFg(47, FLOOR - 1)).toBe(T.AIR);
  });

  it('solo 模式的非本地 actor 不多給觸及（slack 只在 host）', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 50, y: FLOOR - 1 });
    b.inventory.slots[1] = { item: 'dirt', count: 10 };
    expect(g.exec('b', { op: 'place', x: 57, y: FLOOR - 1, slot: 1 })).toBe(false);
  });
});

describe('teleSeq / knockSeq', () => {
  it('teleport → teleSeq + 1；敵方投射物打中 → knockSeq + 1、記下擊退速度', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 60, y: FLOOR - 1 });
    const t0 = b.teleSeq;
    g.withActor(b, () => g.teleport(60, FLOOR - 1));
    expect(b.teleSeq).toBe(t0 + 1);
    steps(g, 3);
    const k0 = b.knockSeq, hp0 = b.hp;
    const c = center(b);
    g.projectiles.spawn('stinger', true, c.x, c.y, 0, 0, { damage: 12, life: 2 });
    steps(g, 1);
    expect(b.hp).toBeLessThan(hp0);
    expect(b.knockSeq).toBe(k0 + 1);
    expect(b.knockV.vx).not.toBe(0);
    expect(g.local.knockSeq).toBe(0);
  });

  it('host：teleport 清掉遠端回報（不會被舊位置拉回去）', () => {
    const g = arena();
    g.mode = 'host';
    const b = g.addActor('b', hero(), { x: 66, y: FLOOR - 1 });
    g.setRemoteMotion('b', standAt(b, 50, FLOOR - 1));
    g.step(FIXED_DT);
    g.withActor(b, () => g.teleport(60, FLOOR - 1));
    expect(b.remote).toBeNull();
    const x = b.player.x;
    steps(g, 3);
    expect(b.player.x).toBe(x);
  });
});

/** 客人副本（本地 pid 'p1'），地形同 arena */
const replica = (): DelveGame => arena({ localPid: 'p1', mode: 'replica' });

describe('replica：只動本地 actor、世界不動', () => {
  it('本地有移動；怪物、掉落物、水量、編輯日誌與跑之前完全相同', () => {
    const g = replica();
    expect(g.localPid).toBe('p1');
    const e = g.spawnEnemy('gel_blob', 60, FLOOR - 1);
    const d = g.drops.spawn('torch', 3, 70 * S, 50 * S, 0, 0)!;
    g.world.setLiquid(80, FLOOR - 1, 255, LIQ.WATER);
    const ebody = { ...e.body }, dpos = { x: d.body.x, y: d.body.y };
    const liq0 = g.world.liquidTotal(), pend0 = g.world.edits.pending();
    const x0 = g.local.player.x;
    g.setMoveX(1);
    steps(g, 60);
    expect(g.local.player.x).toBeGreaterThan(x0 + 5 * S);
    expect(g.enemies).toEqual([e]);
    expect(e.body).toEqual(ebody);
    expect(g.drops.list).toEqual([d]);
    expect({ x: d.body.x, y: d.body.y }).toEqual(dpos);
    expect(g.world.getLiquid(80, FLOOR - 1)).toBe(255);
    expect(g.world.liquidTotal()).toBe(liq0);
    expect(g.world.edits.pending()).toBe(pend0);
  });

  it('時間照走、tick 照加', () => {
    const g = replica();
    const t0 = g.time, k0 = g.tick;
    steps(g, 10);
    expect(g.tick).toBe(k0 + 10);
    expect(g.time).toBeCloseTo(t0 + 10 * FIXED_DT, 9);
  });

  it('震地落地：結束急墜但不打衝擊波（不傷怪）', () => {
    const g = replica();
    g.addXp(xpAtLevel(8) - g.levels.xp);
    for (const id of ['b_vigor', 'b_dash', 'b_guard', 'b_slam'] as const) expect(g.learnSkill(id)).toBeNull();
    const e = g.spawnEnemy('gel_blob', 42, FLOOR - 1);
    const hp0 = e.hp;
    g.teleport(40, FLOOR - 6);
    g.step(FIXED_DT);
    g.drainEvents();
    g.act({ op: 'skill', skill: 'slam' });
    expect(g.local.slamming).toBe(true);
    let ev: DelveEvent[] = [];
    for (let i = 0; i < 60; i++) { g.step(FIXED_DT); ev = ev.concat(g.drainEvents()); }
    expect(g.local.slamming).toBe(false);
    expect(g.local.player.onGround).toBe(true);
    expect(e.hp).toBe(hp0);
    expect(ev.some((x) => x.type === 'skill' && x.phase === 'land')).toBe(false);
  });
});

describe('replica：三段跳與移動事件（同 stepActor）', () => {
  it('第三跳的按住時間減半（THIRD_JUMP_HOLD）、空中跳發 airjump', () => {
    const g = replica();
    g.addXp(xpAtLevel(20) - g.levels.xp);
    for (const id of ['p_stride', 'p_feather', 'p_spring', 'p_cloud'] as const) expect(g.learnSkill(id)).toBeNull();
    g.giveGear('wood_greaves', 4, { affixes: [{ id: 'skyleap', tier: 5, value: 1 }] });
    expect(g.equipFromInventory(g.inventory.slots.findIndex((s) => s?.item === 'wood_greaves'))).toBe(true);
    expect(g.moveStats().airJumps).toBe(2);
    steps(g, 30);
    g.drainEvents();
    const m = g.local.motion;
    /** 放開一步再按一步跳：回傳這一步之後的 airUsed / jumpTimer */
    const tap = (): { air: number; timer: number } => {
      g.setJump(false); g.step(FIXED_DT);
      g.setJump(true); g.step(FIXED_DT);
      return { air: m.airUsed ?? 0, timer: m.jumpTimer };
    };
    g.setJump(true); steps(g, 3); // 地面起跳
    steps(g, 10);
    const second = tap();
    expect(second.air).toBe(1);
    const third = tap();
    expect(third.air).toBe(2);
    expect(third.timer).toBeGreaterThan(0);
    expect(third.timer).toBeCloseTo(second.timer * THIRD_JUMP_HOLD, 9);
    expect(g.drainEvents().filter((e) => e.type === 'airjump')).toHaveLength(2);
  });
});

describe('replica：exec 轉送', () => {
  it('合成：回 { ok: true }、轉送那個指令、背包不變', () => {
    const g = replica();
    const sent: Cmd[] = [];
    g.cmdSink = (c) => { sent.push(c); };
    g.give('wood', 3);
    const inv0 = JSON.stringify(g.inventory.toJSON());
    expect(g.act({ op: 'craft', recipe: 'planks' })).toEqual({ ok: true });
    expect(sent).toEqual([{ op: 'craft', recipe: 'planks' }]);
    expect(JSON.stringify(g.inventory.toJSON())).toBe(inv0);
  });

  it('技能：本地也跑一次（dashT > 0）而且也轉送', () => {
    const g = replica();
    const sent: Cmd[] = [];
    g.cmdSink = (c) => { sent.push(c); };
    g.addXp(2200);
    expect(g.learnSkill('b_dash')).toBeNull();
    expect(g.act({ op: 'skill', skill: 'dash' })).toBe(true);
    expect(g.local.dashT).toBeGreaterThan(0);
    expect(sent).toEqual([{ op: 'skill', skill: 'dash' }]);
  });

  it('exec 其他 pid 丟例外；沒有 cmdSink 也不會壞', () => {
    const g = replica();
    expect(() => g.exec('zz', { op: 'chestClose' })).toThrow();
    expect(g.act({ op: 'swap', a: 0, b: 1 })).toBe(true);
  });

  it('CMD_PENDING 每個 op 都有值', () => {
    expect(Object.keys(CMD_PENDING).sort()).toEqual([...CMD_OPS].sort());
    expect(CMD_PENDING.craft).toEqual({ ok: true });
    expect(CMD_PENDING.chestTakeAll).toBe(0);
    expect(CMD_PENDING.lock).toBeNull();
    expect(CMD_PENDING.marker).toBe('added');
    expect(CMD_PENDING.folkService).toEqual({ ok: true, msg: '' });
    // 共用的物件都凍結（呼叫端改不動）
    expect(Object.isFrozen(CMD_PENDING)).toBe(true);
    for (const v of Object.values(CMD_PENDING)) if (v !== null && typeof v === 'object') expect(Object.isFrozen(v)).toBe(true);
  });
});

describe('replica：事件與經驗', () => {
  it('pushNetEvents 直接進佇列（不補 pid、不換算經驗）', () => {
    const g = replica();
    g.drainEvents();
    const xp0 = JSON.stringify(g.levels.toJSON());
    const ev: DelveEvent = { type: 'kill', id: 7, kind: 'gel_blob', x: 1, y: 2, pid: 'p1' };
    const pub: DelveEvent = { type: 'kill', id: 8, kind: 'gel_blob', x: 1, y: 2 };
    g.pushNetEvents([ev, pub]);
    expect(g.drainEvents()).toEqual([ev, pub]);
    expect(pub.pid).toBeUndefined();
    // 跑幾步、再推一次：都不換算經驗（擊殺不給本地經驗）
    g.pushNetEvents([{ ...ev, id: 9 }]);
    steps(g, 2);
    expect(g.drainEvents().filter((e) => e.type === 'kill').map((e) => e.type === 'kill' && e.id)).toEqual([9]);
    expect(JSON.stringify(g.levels.toJSON())).toBe(xp0);
  });

  it('applyNetCharacter 套到本地 actor', () => {
    const g = replica();
    const c = hero();
    c.inventory = { ...c.inventory, slots: c.inventory.slots.map((s, i) => (i === 3 ? { item: 'gold_bar' as ItemId, count: 4 } : s)) };
    g.applyNetCharacter(c);
    expect(g.local.inventory.slots[3]).toEqual({ item: 'gold_bar', count: 4 });
  });
});

/** 中央以外一律實心 STONE（同 save/worldSave.v11.test.ts） */
class StoneSource implements ColumnSource {
  readonly version = 1;
  fill(col: Column, x0: number, x1: number): void {
    for (let y = 0; y < col.height; y++) for (let x = x0; x < x1; x++) col.fg[li(x, y)] = T.STONE;
  }
  surfaceAt(): number { return 0; }
  biomeAt(): number { return 0; }
  layersAt(): ColumnLayers { return { rock: 10, deep: 50, molten: 90 }; }
}

describe('replica：卸載不停放', () => {
  const mk = (mode: 'solo' | 'replica'): DelveGame =>
    new DelveGame({ seed: 'inf-park', width: 200, height: 100, peaceful: true, bounds: 'infinite', columnSource: new StoneSource(), mode, localPid: mode === 'replica' ? 'p1' : undefined });
  const touch = (g: DelveGame, cx: number): number[] => {
    const w = g.world;
    w.ensureColumn(cx);
    const d = w.readChunk(cx, 0)!;
    d.fg[0] = T.AIR;
    w.writeChunk(cx, 0, d);
    return Array.from({ length: w.chunksY }, (_, cy) => w.chunkIndex(cx, cy));
  };

  it('replica：unloadColumn 直接丟掉，modifiedChunks / liquidModified 也清掉', () => {
    const g = mk('replica');
    expect(g.world.noPark).toBe(true);
    const keys = touch(g, 20);
    expect(g.world.modifiedChunks.has(keys[0])).toBe(true);
    expect(g.world.unloadColumn(20)).toBe(true);
    expect(g.world.parkedChunks()).toEqual([]);
    for (const k of keys) {
      expect(g.world.modifiedChunks.has(k)).toBe(false);
      expect(g.world.liquidModified.has(k)).toBe(false);
    }
    expect(20 * CHUNK).toBeGreaterThan(g.world.width);
  });

  it('solo 照舊停放', () => {
    const g = mk('solo');
    expect(g.world.noPark).toBe(false);
    const keys = touch(g, 20);
    expect(g.world.unloadColumn(20)).toBe(true);
    expect(g.world.parkedChunks()).toContain(keys[0]);
    expect(g.world.modifiedChunks.has(keys[0])).toBe(true);
  });
});
