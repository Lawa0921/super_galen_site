// 難度曲線回歸：貪心模擬鎖住「會經營的贏、不經營的輸」的形狀，數值改壞會在這裡爆。
import { describe, it, expect } from 'vitest';
import { DefenseGame, SLOTS, TOWERS, WAVES, type TowerType } from './engine';

function run(plan: TowerType[], maxTowers = SLOTS.length, upgrade = true): { status: string; hp: number } {
  const g = new DefenseGame();
  let built = 0;
  for (let w = 0; w < WAVES.length; w++) {
    // building：能建就建（照 plan 循環）、能升就升
    let acted = true;
    while (acted) {
      acted = false;
      const s = g.getState();
      if (built < maxTowers) {
        const type = plan[built % plan.length];
        if (s.gold >= TOWERS[type].cost && g.build(SLOTS[built].id, type)) { built++; acted = true; continue; }
      }
      if (upgrade) for (const t of s.towers) if (t.level < 2 && g.upgrade(t.id)) { acted = true; break; }
    }
    g.startWave();
    let guard = 0;
    while (g.getState().status === 'wave' && guard++ < 60000) g.step(50);
    if (g.getState().status === 'lost') break;
  }
  const s = g.getState();
  return { status: s.status, hp: s.baseHp };
}

describe('難度曲線（貪心模擬）', () => {
  it('滿場混塔全升級 → 通關', () => {
    expect(run(['arrow', 'frost', 'bomb', 'arcane']).status).toBe('won');
  });
  it('滿場單一弩箭塔 → 能贏但會掉血（單一塔有代價）', () => {
    const r = run(['arrow']);
    expect(r.status).toBe('won');
    expect(r.hp).toBeLessThan(20);
  });
  it('只建 8 塔且不升級 → 輸（不經營會被懲罰）', () => {
    expect(run(['arrow', 'frost', 'bomb', 'arcane'], 8, false).status).toBe('lost');
  });
});
