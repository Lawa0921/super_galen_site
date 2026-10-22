// eventScope.test.ts — 共玩時別人的事件不能觸發只屬於自己的表現（M-C2 D6）
import { describe, it, expect, vi } from 'vitest';
import { isMine, lifeEvent, type LifeIo } from './eventScope';
import { LevelFx } from './levelFx';
import { CombatLayer } from './combatDraw';
import { Renderer } from './renderer';
import { arenaGame } from '../net/testRig';
import type { DelveEvent } from '../engine/game';

const ev = (e: unknown): DelveEvent => e as DelveEvent;
const io = (): LifeIo => ({ onDeath: vi.fn(), onRespawn: vi.fn(), onUndying: vi.fn() });

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
