// movesets.test.ts — 角色專屬主射與爆彈
import { describe, it, expect } from 'vitest';
import { WitchGame, chainTarget } from './game';
import type { Enemy } from './types';

/** 開局 step 一次（fireCdMs 起始 0 → 立即發射），回傳 active 自機彈。 */
function fireOnce(character: 'mira' | 'gale' | 'frost' | 'volt') {
  const g = new WitchGame({ seed: 1, character });
  g.step(20);
  return g.getState().playerBullets.filter((b) => b.active);
}

describe('主射型', () => {
  it('balanced(Mira)：power 道直射、無穿透/連鎖/角度', () => {
    const bs = fireOnce('mira');
    expect(bs.length).toBe(1); // power=1
    expect(bs.every((b) => b.vx === 0 && b.pierceLeft === 0 && b.chainLeft === 0)).toBe(true);
  });

  it('pierce(Gale)：彈道可穿透（pierceLeft≥1）', () => {
    const bs = fireOnce('gale');
    expect(bs.length).toBeGreaterThan(0);
    expect(bs.every((b) => b.pierceLeft >= 1)).toBe(true);
  });

  it('fan(Frost)：一次射出多於 power 枚且有角度展開(vx≠0)', () => {
    const bs = fireOnce('frost');
    expect(bs.length).toBeGreaterThanOrEqual(3); // power+2
    expect(bs.some((b) => b.vx !== 0)).toBe(true);
  });

  it('chain(Volt)：彈帶連鎖次數(chainLeft≥1)', () => {
    const bs = fireOnce('volt');
    expect(bs.length).toBeGreaterThan(0);
    expect(bs.every((b) => b.chainLeft >= 1)).toBe(true);
  });
});

describe('chainTarget 連鎖目標', () => {
  const mk = (id: number, x: number, y: number, alive = true): Enemy => ({
    id, kind: 'bat', x, y, hp: 10, alive, path: 'descend', t: 0, baseX: x, fireCdMs: 9999,
  });

  it('回傳半徑內最近的「另一」隻 alive 敵', () => {
    const enemies = [mk(1, 100, 100), mk(2, 120, 100), mk(3, 400, 400)];
    const t = chainTarget(enemies, 100, 100, 1, 200);
    expect(t?.id).toBe(2);
  });

  it('排除來源敵與死亡敵', () => {
    const enemies = [mk(1, 100, 100), mk(2, 110, 100, false)];
    expect(chainTarget(enemies, 100, 100, 1, 200)).toBeNull();
  });

  it('超出半徑回傳 null', () => {
    const enemies = [mk(1, 100, 100), mk(2, 500, 500)];
    expect(chainTarget(enemies, 100, 100, 1, 120)).toBeNull();
  });
});

describe('爆彈型', () => {
  it('所有爆彈都扣 1 顆', () => {
    for (const c of ['mira', 'gale', 'frost', 'volt'] as const) {
      const g = new WitchGame({ seed: 1, character: c });
      const b0 = g.getState().player.bombs;
      g.input('bomb');
      expect(g.getState().player.bombs).toBe(b0 - 1);
    }
  });

  it('gust(Gale)：給較長無敵(≥1800ms)', () => {
    const g = new WitchGame({ seed: 1, character: 'gale' });
    g.input('bomb');
    expect(g.getState().player.invulnMs).toBeGreaterThanOrEqual(1800);
  });

  // Boss hp 變化量（爆彈對 boss 直傷）
  function bossDmg(character: 'mira' | 'gale' | 'frost' | 'volt'): number {
    const g = new WitchGame({ seed: 1, character });
    g.debugSkipToBoss();
    g.step(16); // 生成 boss
    const before = g.boss!.state.hp;
    g.input('bomb');
    return before - g.boss!.state.hp;
  }

  it('storm(Volt)：對 boss 直傷約為 inferno(Mira) 的 2 倍', () => {
    const inf = bossDmg('mira');
    const storm = bossDmg('volt');
    expect(inf).toBeGreaterThan(0);
    expect(storm).toBeGreaterThan(inf);
    expect(storm / inf).toBeCloseTo(2, 1);
  });

  it('freeze(Frost)：凍結期間敵方不再生成新彈', () => {
    // step() 單次上限 STEP_CAP_MS(100ms)，需多次小步推進遊戲時間
    const adv = (g: WitchGame, ms: number): void => { for (let t = 0; t < ms; t += 16) g.step(16); };
    const grow = (character: 'mira' | 'frost'): number => {
      const g = new WitchGame({ seed: 1, character });
      g.debugSkipToBoss();
      adv(g, 2500);            // boss 進入開火
      g.input('bomb');
      const before = g.getState().enemyBullets.filter((b) => b.active).length;
      adv(g, 800);
      return g.getState().enemyBullets.filter((b) => b.active).length - before;
    };
    const frost = grow('frost');
    const mira = grow('mira');
    expect(frost).toBeLessThanOrEqual(0); // 凍結 → 無新彈、現有彈停滯
    expect(mira).toBeGreaterThan(0);      // mira 不凍結 → boss 持續開火
    expect(frost).toBeLessThan(mira);
  });
});

describe('連射節奏（4 原型分化）', () => {
  // 開局 fireCdMs 初值 0：首個 step 中 tickPlayer 先遞減(0→0)，autoFire 立即開火並把 fireCdMs 設為該角間隔。
  function firstInterval(character: 'mira' | 'gale' | 'frost' | 'volt'): number {
    const g = new WitchGame({ seed: 1, character });
    g.step(1);
    return g.getState().player.fireCdMs;
  }

  it('間隔明顯拉開：Gale<Mira<Volt<Frost', () => {
    const gale = firstInterval('gale');
    const mira = firstInterval('mira');
    const volt = firstInterval('volt');
    const frost = firstInterval('frost');
    expect(gale).toBe(50);          // 機關槍：最快
    expect(mira).toBe(100);         // 穩定流：基準
    expect(volt).toBeCloseTo(110);  // 連鎖電：中速（明顯 ≠ Mira；×1.1 浮點）
    expect(frost).toBeCloseTo(190); // 霰彈：最慢（×1.9 浮點）
    expect(gale).toBeLessThan(mira);
    expect(mira).toBeLessThan(volt);
    expect(volt).toBeLessThan(frost);
  });
});

describe('Volt 連鎖電弧事件', () => {
  it('連鎖跳轉時發出 chainArc 事件（弧線從命中敵連到跳轉目標）', () => {
    const g = new WitchGame({ seed: 1, character: 'volt' });
    g.drainEvents(); // 清掉開局事件
    g.debugSpawnElite('bat', 240, 510); // 敵 A：自機彈正上方（必中）
    g.debugSpawnElite('bat', 290, 510); // 敵 B：A 的連鎖半徑(170)內、偏右不被直射
    for (let t = 0; t < 160; t += 16) g.step(16); // 推進到自機彈擊中 A（720px/s，36px≈50ms）
    const arcs = g.drainEvents().filter((e) => e.kind === 'chainArc') as Array<
      { kind: 'chainArc'; x1: number; y1: number; x2: number; y2: number }
    >;
    expect(arcs.length).toBeGreaterThan(0);
    expect(Math.abs(arcs[0].x1 - 240)).toBeLessThan(25); // 起點≈A
    expect(Math.abs(arcs[0].x2 - 290)).toBeLessThan(25); // 終點≈B
  });
});
