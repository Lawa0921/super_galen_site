import { describe, it, expect } from 'vitest';
import { DefenseGame, pathLength, posAt, pickTarget } from './engine';
import type { Enemy } from './engine';

const L = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]; // L 形，長 200

describe('path 純函式', () => {
  it('pathLength 累加各段', () => {
    expect(pathLength(L)).toBe(200);
  });
  it('posAt：起點/轉角/中段/超出鉗在終點且 reached', () => {
    expect(posAt(L, 0).pos).toEqual({ x: 0, y: 0 });
    expect(posAt(L, 100).pos).toEqual({ x: 100, y: 0 });
    expect(posAt(L, 150).pos).toEqual({ x: 100, y: 50 });
    const end = posAt(L, 999);
    expect(end.pos).toEqual({ x: 100, y: 100 });
    expect(end.reached).toBe(true);
  });
});

describe('pickTarget', () => {
  const mk = (id: number, dist: number, x: number, y: number): Enemy =>
    ({ id, type: 'slime', hp: 10, maxHp: 10, speed: 30, gold: 5, dist, slowMs: 0, alive: true, x, y });
  it('回傳射程內「最前進」(dist 最大) 的敵', () => {
    const es = [mk(1, 50, 100, 0), mk(2, 80, 110, 0), mk(3, 80, 400, 0)]; // 3 在射程外
    const t = pickTarget(es, { x: 100, y: 0 }, 60);
    expect(t?.id).toBe(2);
  });
  it('射程內無敵回 null', () => {
    expect(pickTarget([mk(1, 50, 500, 500)], { x: 0, y: 0 }, 60)).toBeNull();
  });
});

describe('DefenseGame', () => {
  const adv = (g: DefenseGame, ms: number): void => { for (let t = 0; t < ms; t += 16) g.step(16); };

  it('開局：building、有起始金、門 20 HP', () => {
    const g = new DefenseGame();
    const s = g.getState();
    expect(s.status).toBe('building');
    expect(s.gold).toBeGreaterThan(0);
    expect(s.baseHp).toBe(20);
  });

  it('建塔扣錢；同格不可重建；錢不夠不可建', () => {
    const g = new DefenseGame();
    const slot = g.getState().slots[0].id;
    const g0 = g.getState().gold;
    expect(g.build(slot, 'arrow')).toBe(true);
    expect(g.getState().gold).toBeLessThan(g0);
    expect(g.getState().towers.length).toBe(1);
    expect(g.build(slot, 'arrow')).toBe(false); // 已佔用
    const broke = new DefenseGame();
    // 花光錢
    let i = 0;
    while (broke.build(broke.getState().slots[i]?.id, 'arcane')) i++;
    const spent = broke.getState().gold;
    expect(broke.build(broke.getState().slots[i]?.id ?? 'none', 'arcane')).toBe(false);
    expect(broke.getState().gold).toBe(spent); // 失敗不扣錢
  });

  it('沒蓋塔 → 敵人破門 → 最終 lost', () => {
    const g = new DefenseGame();
    g.startWave();
    for (let i = 0; i < 60000 && g.getState().status !== 'lost'; i++) {
      g.step(16);
      if (g.getState().status === 'building') g.startWave(); // 持續開波直到破門
    }
    expect(g.getState().status).toBe('lost');
    expect(g.getState().baseHp).toBe(0);
  });

  it('塔蓋滿 → 殺敵得金、清 12 波 → won', () => {
    const g = new DefenseGame();
    for (const slot of g.getState().slots) g.build(slot.id, 'arcane');
    const goldAfterBuild = g.getState().gold;
    g.startWave();
    let killedGold = goldAfterBuild;
    for (let i = 0; i < 200000 && g.getState().status !== 'won' && g.getState().status !== 'lost'; i++) {
      g.step(16);
      // 波間回到 building 時自動開下一波
      if (g.getState().status === 'building') g.startWave();
    }
    const s = g.getState();
    expect(s.status).toBe('won');
    expect(s.gold).toBeGreaterThan(killedGold); // 有殺敵得金
  });
});
