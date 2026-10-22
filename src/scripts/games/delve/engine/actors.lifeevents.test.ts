// actors.lifeevents.test.ts — 共玩時 death / undying / respawn 一定帶那位玩家的 pid（render 靠它判斷是不是自己的）
import { describe, it, expect, vi } from 'vitest';
import { DelveGame, type DelveEvent } from './game';
import { arenaGame } from '../net/testRig';
import { createCharacter } from '../save/character';
import { normalizeAppearance } from './appearance';
import { FIXED_DT } from './constants';

const hero = () => createCharacter('乙', normalizeAppearance(undefined), 0);
const two = (): { g: DelveGame; b: ReturnType<DelveGame['addActor']> } => {
  const g = arenaGame();
  const b = g.addActor('b', hero(), { x: 60, y: 59 });
  g.step(FIXED_DT); g.drainEvents();
  return { g, b };
};
const of = (g: DelveGame, type: string): DelveEvent[] => g.drainEvents().filter((e) => e.type === type);

describe('生死事件的 pid', () => {
  it('客人死亡 → death 帶 pid b；本地死亡 → 帶本地 pid', () => {
    const { g, b } = two();
    g.withActor(b, () => g.hurtPlayer(99999, 0));
    expect(of(g, 'death').map((e) => e.pid)).toEqual(['b']);
    g.hurtPlayer(99999, 0);
    expect(of(g, 'death').map((e) => e.pid)).toEqual([g.localPid]);
  });
  it('客人在 step（世界段）裡甦醒 → respawn 帶 pid b', () => {
    const { g, b } = two();
    g.withActor(b, () => g.hurtPlayer(99999, 0));
    g.drainEvents();
    let seen: DelveEvent[] = [];
    for (let i = 0; i < 20 / FIXED_DT && !seen.length; i++) { g.step(FIXED_DT); seen = of(g, 'respawn'); }
    expect(seen.map((e) => e.pid)).toEqual(['b']);
  });
  it('客人在 step 裡被怪打到死 → death 帶 pid b', () => {
    const { g, b } = two();
    g.peaceful = false;
    g.withActor(b, () => { g.hp = 1; g.burning = 5; });
    let seen: DelveEvent[] = [];
    for (let i = 0; i < 600 && !seen.length; i++) { g.step(FIXED_DT); seen = of(g, 'death'); }
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((e) => e.pid === 'b')).toBe(true);
  });
  it('客人的 undying 帶 pid b', () => {
    const { g, b } = two();
    const real = g.withActor(b, () => g.stats());
    const spy = vi.spyOn(g, 'stats').mockImplementation(() => ({ ...real, gear: { ...real.gear, undying: 5 } }));
    g.withActor(b, () => g.hurtPlayer(99999, 0));
    spy.mockRestore();
    expect(of(g, 'undying').map((e) => e.pid)).toEqual(['b']);
  });
});
