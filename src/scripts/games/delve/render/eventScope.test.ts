// eventScope.test.ts — 共玩時別人的事件不能觸發只屬於自己的表現（M-C2 D6）
import { describe, it, expect, vi } from 'vitest';
import { HEAR_MARGIN, attackSfx, isMine, lifeEvent, offscreenOther, unlockToast, type LifeIo } from './eventScope';
import { LevelFx } from './levelFx';
import { CombatLayer } from './combatDraw';
import { Renderer } from './renderer';
import { arenaGame } from '../net/testRig';
import type { DelveEvent } from '../engine/game';

const ev = (e: unknown): DelveEvent => e as DelveEvent;
const io = (nicks: Record<string, string> = { g1: '小明' }): LifeIo => ({
  onDeath: vi.fn(), onRespawn: vi.fn(), onUndying: vi.fn(), onSleepStart: vi.fn(),
  onOtherDown: vi.fn(), onOtherBack: vi.fn(), nickOf: (pid) => nicks[pid] ?? '',
});

describe('isMine', () => {
  it('isMine：沒有 pid / 自己 / 別人', () => {
    expect(isMine(ev({ type: 'death', x: 0, y: 0 }), 'h')).toBe(true);
    expect(isMine(ev({ type: 'death', x: 0, y: 0, pid: 'h' }), 'h')).toBe(true);
    expect(isMine(ev({ type: 'death', x: 0, y: 0, pid: 'g1' }), 'h')).toBe(false);
  });
});

describe('lifeEvent', () => {
  it('別人的 death 不關背包、不放死亡音效', () => {
    const o = io();
    expect(lifeEvent(ev({ type: 'death', x: 0, y: 0, pid: 'g1' }), 'h', o)).toBe(true);
    expect(o.onDeath).not.toHaveBeenCalled();
    lifeEvent(ev({ type: 'death', x: 0, y: 0, pid: 'h' }), 'h', o);
    lifeEvent(ev({ type: 'death', x: 0, y: 0 }), 'h', o);
    expect(o.onDeath).toHaveBeenCalledTimes(2);
  });
  it('別人的 respawn 不跳甦醒提示；自己的會', () => {
    const o = io();
    lifeEvent(ev({ type: 'respawn', pid: 'g1' }), 'h', o);
    expect(o.onRespawn).not.toHaveBeenCalled();
    lifeEvent(ev({ type: 'respawn' }), 'h', o);
    expect(o.onRespawn).toHaveBeenCalledTimes(1);
  });
  it('別人的 undying 不跳提示；其他事件不處理', () => {
    const o = io();
    lifeEvent(ev({ type: 'undying', x: 0, y: 0, pid: 'g1' }), 'h', o);
    expect(o.onUndying).not.toHaveBeenCalled();
    expect(lifeEvent(ev({ type: 'attack', kind: 'sword', pid: 'g1' }), 'h', o)).toBe(false);
  });
});

describe('睡覺 / 隊友提示 / 揮擊音效', () => {
  it('別人就寢不關我的背包、不放睡覺音效；自己的與無 pid 的會；wake 不攔', () => {
    const o = io();
    expect(lifeEvent(ev({ type: 'sleep', phase: 'start', pid: 'g1' }), 'h', o)).toBe(true);
    expect(o.onSleepStart).not.toHaveBeenCalled();
    lifeEvent(ev({ type: 'sleep', phase: 'start', pid: 'h' }), 'h', o);
    lifeEvent(ev({ type: 'sleep', phase: 'start' }), 'h', o);
    expect(o.onSleepStart).toHaveBeenCalledTimes(2);
    expect(lifeEvent(ev({ type: 'sleep', phase: 'wake' }), 'h', o)).toBe(false);
  });
  it('隊友倒下 / 回來：低調提示帶暱稱，沒有暱稱用「隊友」；自己的不提示', () => {
    const o = io();
    lifeEvent(ev({ type: 'death', x: 0, y: 0, pid: 'g1' }), 'h', o);
    lifeEvent(ev({ type: 'respawn', x: 0, y: 0, pid: 'g1' }), 'h', o);
    lifeEvent(ev({ type: 'death', x: 0, y: 0, pid: 'g2' }), 'h', o);
    expect(o.onOtherDown).toHaveBeenNthCalledWith(1, '小明');
    expect(o.onOtherBack).toHaveBeenCalledWith('小明');
    expect(o.onOtherDown).toHaveBeenNthCalledWith(2, '隊友');
    const mine = io();
    lifeEvent(ev({ type: 'death', x: 0, y: 0 }), 'h', mine);
    expect(mine.onOtherDown).not.toHaveBeenCalled();
  });
  it('別人的 attack 仍播揮擊音效（走 main.ts 實際用的 attackSfx）', () => {
    const s = { bow: vi.fn(), magic: vi.fn(), throwSfx: vi.fn(), swing: vi.fn() };
    // 別人的 attack 不被 lifeEvent 攔截 → 一定落到 attackSfx
    const e = ev({ type: 'attack', kind: 'broadsword', pid: 'g1' });
    expect(lifeEvent(e, 'h', io())).toBe(false);
    expect(attackSfx((e as { kind: string }).kind, s)).toBe(false);
    expect(s.swing).toHaveBeenCalledWith(true);
    expect(attackSfx('bow', s)).toBe(true);
    expect(s.bow).toHaveBeenCalled();
    attackSfx('staff', s); attackSfx('boomerang', s);
    expect(s.magic).toHaveBeenCalled();
    expect(s.throwSfx).toHaveBeenCalled();
  });
});

describe('別人的 respawn 不 snapCamera', () => {
  const run = (e: DelveEvent) => {
    const g = arenaGame();
    const snap = vi.fn();
    const r = Object.create(Renderer.prototype) as Renderer & Record<string, unknown>;
    Object.assign(r, { game: g, combat: { onEvent: vi.fn() }, levelFx: { onEvent: vi.fn() }, snapCamera: snap, local: {}, clock: 0 });
    r.onEvent(e);
    return snap;
  };
  it('別人的不動鏡頭、自己的動', () => {
    expect(run(ev({ type: 'respawn', pid: 'g1' }))).not.toHaveBeenCalled();
    expect(run(ev({ type: 'respawn', pid: 'h' }))).toHaveBeenCalledTimes(1);
    expect(run(ev({ type: 'respawn' }))).toHaveBeenCalledTimes(1);
  });
  it('別人的 climb 不在本地玩家身上揚灰', () => {
    const g = arenaGame();
    const dust = vi.fn();
    const r = Object.create(Renderer.prototype) as Renderer & Record<string, unknown>;
    Object.assign(r, { game: g, combat: { onEvent: vi.fn() }, levelFx: { onEvent: vi.fn() }, climbDust: dust, local: {}, clock: 0 });
    r.onEvent(ev({ type: 'climb', phase: 'grab', pid: 'g1' }));
    expect(dust).not.toHaveBeenCalled();
    r.onEvent(ev({ type: 'climb', phase: 'grab', pid: 'h' }));
    expect(dust).toHaveBeenCalledTimes(1);
  });
});

describe('LevelFx', () => {
  const dash = (pid?: string) => ev({ type: 'skill', phase: 'start', skill: 'dash', x: 5, y: 5, pid });
  const trails = (fx: LevelFx): number => {
    const ctx = { fillRect: vi.fn(), set fillStyle(_v: string) { /* 略 */ } } as unknown as CanvasRenderingContext2D;
    fx.draw(ctx, 0.05);
    return (fx as unknown as { trails: unknown[] }).trails.length;
  };
  it('別人的 dash 不在本地玩家身後畫殘影；自己的會', () => {
    const g = arenaGame();
    const other = new LevelFx(g); other.onEvent(dash('g1'));
    expect(trails(other)).toBe(0);
    const mine = new LevelFx(g); mine.onEvent(dash('h'));
    expect(trails(mine)).toBeGreaterThan(0);
    const solo = new LevelFx(g); solo.onEvent(dash());
    expect(trails(solo)).toBeGreaterThan(0);
  });
  it('別人的 pulse 不在本地玩家身上放光環', () => {
    const g = arenaGame();
    const rings = (fx: LevelFx) => (fx as unknown as { rings: unknown[] }).rings.length;
    const a = new LevelFx(g); a.onEvent(ev({ type: 'skill', phase: 'start', skill: 'pulse', x: 5, y: 5, pid: 'g1' }));
    expect(rings(a)).toBe(0);
    const b = new LevelFx(g); b.onEvent(ev({ type: 'skill', phase: 'start', skill: 'pulse', x: 5, y: 5, pid: 'h' }));
    expect(rings(b)).toBe(2);
  });
});

describe('CombatLayer 震動', () => {
  const layer = () => {
    const c = Object.create(CombatLayer.prototype) as CombatLayer & Record<string, unknown>;
    const shake = vi.fn(), burst = vi.fn();
    Object.assign(c, { game: arenaGame(), shake, burst });
    return { c, shake, burst };
  };
  it('別人的 death / undying 不震我的畫面，但碎屑照畫', () => {
    for (const type of ['death', 'undying'] as const) {
      const { c, shake, burst } = layer();
      c.onEvent(ev({ type, x: 10, y: 10, pid: 'g1' }));
      expect(shake).not.toHaveBeenCalled();
      expect(burst).toHaveBeenCalled();
      c.onEvent(ev({ type, x: 10, y: 10, pid: 'h' }));
      expect(shake).toHaveBeenCalledTimes(1);
    }
  });
  it('別人的 kill / 命中仍照常（公開表現）', () => {
    const { c, burst } = layer();
    c.onEvent(ev({ type: 'kill', kind: 'gel_blob', x: 10, y: 10, pid: 'g1' }));
    expect(burst).toHaveBeenCalled();
  });
});

describe('unlockToast', () => {
  it('開金寶箱 / 地城門的提示只給自己；別人的 → null（背包也不跟著刷新）', () => {
    expect(unlockToast(ev({ type: 'unlock', x: 1, y: 2, item: 'golden_key', pid: 'h' }), 'h')).toBe('用金鑰匙打開了金寶箱');
    expect(unlockToast(ev({ type: 'unlock', x: 1, y: 2, item: 'dungeon_key' }), 'h')).toBe('用地城鑰匙打開了門');
    expect(unlockToast(ev({ type: 'unlock', x: 1, y: 2, item: 'golden_key', pid: 'g1' }), 'h')).toBeNull();
    expect(unlockToast(ev({ type: 'mine', x: 1, y: 2, tile: 1, item: null }), 'h')).toBeNull();
  });
});

describe('offscreenOther（別人的音效 / 提示依距離）', () => {
  // 畫面 = tile [0, 40) × [0, 25)，往外 m 格都算附近
  const near = (tx: number, ty: number, m: number): boolean => tx >= -m && tx < 40 + m && ty >= -m && ty < 25 + m;
  const view = (pid: string, tx: number, ty: number) => ({ pid, pose: { x: tx * 16, y: ty * 16 } });
  const views = [view('g1', 20, 10), view('g2', 400, 10)];
  it('別人在畫面外 → 略過；在畫面內（含小邊界）→ 照放', () => {
    expect(offscreenOther(ev({ type: 'attack', item: 'wood_sword', kind: 'sword', pid: 'g2' }), 'h', views, near)).toBe(true);
    expect(offscreenOther(ev({ type: 'attack', item: 'wood_sword', kind: 'sword', pid: 'g1' }), 'h', views, near)).toBe(false);
    expect(offscreenOther(ev({ type: 'mine', x: 400, y: 11, tile: 1, item: null, pid: 'g2' }), 'h', views, near)).toBe(true);
    expect(offscreenOther(ev({ type: 'attack', item: 'wood_sword', kind: 'sword', pid: 'g3' }), 'h', [view('g3', 40 + HEAR_MARGIN - 2, 10)], near)).toBe(false);
  });
  it('自己的 / 沒 pid 的 / 不知道在哪的 / 世界層級的事件照舊', () => {
    expect(offscreenOther(ev({ type: 'attack', item: 'wood_sword', kind: 'sword', pid: 'h' }), 'h', [view('h', 400, 10)], near)).toBe(false);
    expect(offscreenOther(ev({ type: 'kill', kind: 'gel_blob', x: 9999, y: 9999 }), 'h', views, near)).toBe(false);
    expect(offscreenOther(ev({ type: 'attack', item: 'wood_sword', kind: 'sword', pid: 'g9' }), 'h', views, near)).toBe(false);
    expect(offscreenOther(ev({ type: 'boss', phase: 'spawn', kind: 'gel_blob', pid: 'g2' }), 'h', views, near)).toBe(false);
  });
});
