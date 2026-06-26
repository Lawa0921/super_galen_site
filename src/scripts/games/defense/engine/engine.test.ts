import { describe, it, expect } from 'vitest';
import { DefenseGame, pathLength, posAt, pickTarget, TOWERS, WAVES } from './engine';
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

  it('邊賺金邊補塔 → 清 12 波 → won', () => {
    const g = new DefenseGame();
    const buildAll = (): void => { for (const sl of g.getState().slots) if (!g.getState().towers.some((t) => t.slot === sl.id)) g.build(sl.id, 'arcane'); };
    buildAll(); g.startWave();
    for (let i = 0; i < 300000 && g.getState().status !== 'won' && g.getState().status !== 'lost'; i++) {
      g.step(16);
      if (g.getState().status === 'building') { buildAll(); g.startWave(); } // 波間用金幣補滿空格
    }
    expect(g.getState().status).toBe('won');
    expect(g.getState().towers.length).toBeGreaterThan(3); // 確實補了不少塔
  });

  it('frost 命中使敵減速（出現 slowMs>0）', () => {
    const g = new DefenseGame();
    g.build('s1', 'frost'); // (240,140) 覆蓋 y140 走廊
    g.startWave();
    let sawSlow = false;
    for (let i = 0; i < 4000 && !sawSlow; i++) { g.step(16); if (g.getState().enemies.some((e) => e.slowMs > 0)) sawSlow = true; }
    expect(sawSlow).toBe(true);
  });

  it('bomb 命中對濺射範圍內多敵造成傷害', () => {
    const g = new DefenseGame();
    // 取最接近 (240,300) 的建塔格蓋炸彈塔（slots 為程式產生，不寫死 id）
    const near = g.getState().slots.reduce((a, s) => (Math.hypot(s.x - 240, s.y - 300) < Math.hypot(a.x - 240, a.y - 300) ? s : a));
    g.build(near.id, 'bomb');
    g.startWave();
    const mk = (id: number, dist: number): Enemy => ({ id, type: 'slime', hp: 30, maxHp: 30, speed: 0, gold: 6, dist, slowMs: 0, alive: true, x: 0, y: 0 });
    // 注入兩隻靜止相鄰 slime 在 s3 路徑上（dist 740≈(240,300)、760≈(220,300)，相距 20 < splash）
    (g as unknown as { enemies: Enemy[] }).enemies.push(mk(9001, 740), mk(9002, 760));
    for (let i = 0; i < 25; i++) g.step(16); // bomb 開火→投射→命中濺射
    const find = (id: number) => g.getState().enemies.find((e) => e.id === id);
    const hurt = (id: number) => { const e = find(id); return e ? e.hp < 30 : true; }; // 不在陣列=已擊殺=受傷
    expect(hurt(9001)).toBe(true);
    expect(hurt(9002)).toBe(true);
  });

  it('升級：等級→2、扣對應金、滿級不可再升', () => {
    const g = new DefenseGame();
    g.build('s0', 'arrow');
    const g1 = g.getState().gold;
    const t = g.getState().towers[0];
    expect(g.upgrade(t.id)).toBe(true);
    expect(g.getState().towers[0].level).toBe(2);
    expect(g.getState().gold).toBe(g1 - TOWERS.arrow.up.cost);
    expect(g.upgrade(t.id)).toBe(false);
  });

  it('Boss 波（第 6、12 波）含 boss', () => {
    expect(WAVES[5].some((g) => g.type === 'boss')).toBe(true);
    expect(WAVES[11].some((g) => g.type === 'boss')).toBe(true);
  });

  it('發出開火/命中/擊殺事件（供 render 做效果）', () => {
    const g = new DefenseGame();
    g.build('s1', 'arcane');
    g.startWave();
    let fired = false, hit = false, killed = false;
    for (let i = 0; i < 5000 && !(fired && hit && killed); i++) {
      g.step(16);
      for (const e of g.drainEvents()) {
        if (e.kind === 'fire') fired = true;
        if (e.kind === 'hit') hit = true;
        if (e.kind === 'kill') killed = true;
      }
    }
    expect(fired).toBe(true);
    expect(hit).toBe(true);
    expect(killed).toBe(true);
  });
});
