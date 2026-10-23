// pose.test.ts — PlayerPose（co-op M-C2 Task 1）：poseOf 不呼叫 getState、不改 cur，和 getState 的攻擊 / 挖掘一致。
import { describe, it, expect } from 'vitest';
import { DelveGame } from './game';
import { T, W } from './tiles';
import { FIXED_DT } from './constants';
import { normalizeAppearance } from './appearance';
import { createCharacter } from '../save/character';
import { bestPick } from './pose';

const FLOOR = 60;

/** 平地小世界：y ≥ 60 石頭；玩家站在 (60, 59) */
function arena(): DelveGame {
  const g = new DelveGame({ seed: 'pose', width: 160, height: 100 });
  const w = g.world;
  for (let y = 0; y < w.height; y++) for (let x = 30; x < 100; x++) {
    w.setFg(x, y, y >= FLOOR ? T.STONE : T.AIR);
    w.setWall(x, y, W.NONE);
  }
  g.teleport(60, FLOOR - 1);
  for (let i = 0; i < 5; i++) g.step(FIXED_DT);
  g.drainEvents();
  return g;
}
const slotOf = (g: DelveGame, item: string): number => g.inventory.slots.findIndex((s) => s?.item === item);

describe('poseOf', () => {
  it('poseOf：本地揮劍中 → attack 有 item/kind/angle/dir/at/dur，且 (time-at)/dur 等於 getState().attack.progress', () => {
    const g = arena();
    g.selectSlot(slotOf(g, 'wood_sword'));
    g.setAim(64, FLOOR - 2);
    g.setMining(true);
    for (let i = 0; i < 8; i++) g.step(FIXED_DT);
    const st = g.getState();
    expect(st.attack).not.toBeNull();
    const p = g.poseOf(g.localPid);
    expect(p.attack).not.toBeNull();
    const a = p.attack!;
    expect(a.item).toBe('wood_sword');
    expect(a.kind).toBe('sword');
    expect(a.angle).toBe(st.attack!.angle);
    expect(a.dir).toBe(st.attack!.dir);
    expect(a.dur).toBeGreaterThan(0);
    expect((g.time - a.at) / a.dur).toBeCloseTo(st.attack!.progress, 9);
    expect(p.held).toBe('wood_sword');
    expect(p.mining).toBeNull();
    expect(p.x).toBe(st.player.x);
    expect(p.y).toBe(st.player.y);
    expect(p.facing).toBe(st.facing);
  });

  it('poseOf：挖掘中 → mining.progress 等於 getState().mining.progress，pick 為最佳鎬', () => {
    const g = arena();
    g.give('copper_pickaxe', 1);
    g.selectSlot(slotOf(g, 'wood_pickaxe'));
    g.setAim(61, FLOOR);
    g.setMining(true);
    for (let i = 0; i < 6; i++) g.step(FIXED_DT);
    const st = g.getState();
    expect(st.mining).not.toBeNull();
    const p = g.poseOf(g.localPid);
    expect(p.mining).not.toBeNull();
    expect(p.mining!.x).toBe(st.mining!.x);
    expect(p.mining!.y).toBe(st.mining!.y);
    expect(p.mining!.progress).toBe(st.mining!.progress);
    expect(p.mining!.pick).toBe('copper_pickaxe');
    expect(p.mining!.pick).toBe(bestPick(g.inventory.slots));
    expect(p.attack).toBeNull();
  });

  it('poseOf 不改 cur（呼叫前後 game.cur 相同）', () => {
    const g = arena();
    g.addActor('b', createCharacter('乙', normalizeAppearance(undefined), 0), { x: 70, y: FLOOR - 1 });
    const b = g.actors.get('b')!;
    const cur0 = g.cur;
    const p = g.poseOf('b');
    expect(g.cur).toBe(cur0);
    expect(p.x).toBe(b.player.x);
    expect(p.y).toBe(b.player.y);
    expect(g.poseOf(g.localPid).x).toBe(g.local.player.x);
    expect(g.cur).toBe(cur0);
    expect(() => g.poseOf('nobody')).toThrow();
  });

  it('poseOf 不呼叫 getState', () => {
    const g = arena();
    let calls = 0;
    const orig = g.getState.bind(g);
    g.getState = () => { calls++; return orig(); };
    g.poseOf(g.localPid);
    expect(calls).toBe(0);
  });

  it('bestPick：背包裡 speed 最高的鎬；沒有 → null', () => {
    const g = arena();
    expect(bestPick(g.inventory.slots)).toBe('wood_pickaxe');
    g.give('iron_pickaxe', 1);
    expect(bestPick(g.inventory.slots)).toBe('iron_pickaxe');
    expect(bestPick([null, { item: 'torch', count: 3 }])).toBeNull();
  });
});

describe('PlayerPose.hurt（挨打計數，M-C2 Task 2 修正）', () => {
  it('突進 / 重生給無敵時間但計數不變；挨打（hurt 且沒有 cause）才 +1；各 actor 分開算', () => {
    const g = arena();
    g.peaceful = true;
    const h0 = g.poseOf(g.localPid).hurt;
    expect(h0).toBe(0);
    // 突進：iframes 上升、計數不變
    g.addXp(2200);
    for (const id of ['b_vigor', 'b_dash'] as const) g.learnSkill(id);
    expect(g.useSkill('dash')).toBe(true);
    expect(g.poseOf(g.localPid).iframes).toBeGreaterThan(0);
    expect(g.poseOf(g.localPid).hurt).toBe(h0);
    for (let i = 0; i < 60; i++) g.step(FIXED_DT);
    // 挨打：+1（同一刻也發 hurt 事件、沒有 cause）
    g.drainEvents();
    expect(g.hurtPlayer(3, g.player.x + 40)).toBe(true);
    const ev = g.drainEvents().filter((e) => e.type === 'hurt');
    expect(ev.length).toBe(1);
    expect('cause' in ev[0] && ev[0].cause).toBeFalsy();
    expect(g.poseOf(g.localPid).hurt).toBe(h0 + 1);
    // 別的 actor 不受影響
    g.addActor('p2', createCharacter('乙', normalizeAppearance(undefined), 0));
    expect(g.poseOf('p2').hurt).toBe(0);
    // 致命一擊 +1；之後重生的無敵時間不算挨打
    for (let i = 0; i < 90; i++) g.step(FIXED_DT);
    g.hurtPlayer(99999, g.player.x + 40);
    expect(g.dead).toBe(true);
    const before = g.poseOf(g.localPid).hurt;
    expect(before).toBe(h0 + 2);
    for (let i = 0; i < 60 * 20 && g.dead; i++) g.step(FIXED_DT);
    expect(g.dead).toBe(false);
    expect(g.poseOf(g.localPid).iframes).toBeGreaterThan(0);
    expect(g.poseOf(g.localPid).hurt).toBe(before);
  });
});
