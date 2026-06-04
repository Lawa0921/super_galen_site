import { describe, it, expect, vi } from 'vitest';
import { InputController } from './InputController';

describe('InputController DAS/ARR', () => {
  it('按下左鍵立即觸發一次，DAS 後依 ARR 重複', () => {
    const actions: string[] = [];
    const ic = new InputController((a) => actions.push(a), { das: 160, arr: 40 });
    ic.press('left');
    expect(actions).toEqual(['left']);        // 立即一次
    ic.update(100); expect(actions).toEqual(['left']);            // 未達 DAS
    ic.update(80);  expect(actions).toEqual(['left','left']);     // 跨過 DAS(160) → 第二次
    ic.update(40);  expect(actions).toEqual(['left','left','left']); // 每 ARR 再一次
  });

  it('放開左鍵停止重複', () => {
    const actions: string[] = [];
    const ic = new InputController((a) => actions.push(a), { das: 160, arr: 40 });
    ic.press('left');
    ic.release('left');
    ic.update(1000);
    expect(actions).toEqual(['left']); // 放開後不再重複
  });

  it('旋轉是單次、不重複', () => {
    const actions: string[] = [];
    const ic = new InputController((a) => actions.push(a), { das: 160, arr: 40 });
    ic.press('rotateCW');
    ic.update(1000);
    expect(actions).toEqual(['rotateCW']);
  });
});
