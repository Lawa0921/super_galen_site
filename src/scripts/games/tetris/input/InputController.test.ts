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

describe('InputController softDrop SDF', () => {
  it('按下立即觸發一次', () => {
    const actions: string[] = [];
    const ic = new InputController((a) => actions.push(a), { das: 160, arr: 40 });
    ic.press('softDrop');
    expect(actions).toEqual(['softDrop']);
  });

  it('按住以 sdf 間隔重複（預設 30ms：100ms 內共 4 次），無 DAS 充能', () => {
    const actions: string[] = [];
    const ic = new InputController((a) => actions.push(a), { das: 160, arr: 40 });
    ic.press('softDrop'); // 1 次（立即）
    for (let i = 0; i < 10; i++) ic.update(10); // 100ms：30/60/90ms 各一次
    expect(actions).toEqual(['softDrop', 'softDrop', 'softDrop', 'softDrop']);
  });

  it('放開後停止重複', () => {
    const actions: string[] = [];
    const ic = new InputController((a) => actions.push(a), { das: 160, arr: 40 });
    ic.press('softDrop');
    ic.release('softDrop');
    ic.update(1000);
    expect(actions).toEqual(['softDrop']);
  });

  it('sdf=0 視為瞬降：每次 update 觸發多次但有單幀上限', () => {
    const actions: string[] = [];
    const ic = new InputController((a) => actions.push(a), { das: 160, arr: 40, sdf: 0 });
    ic.press('softDrop'); // 1 次
    ic.update(16);
    expect(actions.length).toBeGreaterThan(1);
    expect(actions.length).toBeLessThanOrEqual(1 + 20); // 單幀上限保護
    const afterOneFrame = actions.length;
    ic.update(16); // 持續按住：下一幀再觸發、同樣受上限
    expect(actions.length).toBeGreaterThan(afterOneFrame);
    expect(actions.length).toBeLessThanOrEqual(afterOneFrame + 20);
    expect(actions.every((a) => a === 'softDrop')).toBe(true);
  });

  it('left/right 既有 DAS/ARR 行為不受 softDrop 影響（同時按住互不干擾）', () => {
    const actions: string[] = [];
    const ic = new InputController((a) => actions.push(a), { das: 160, arr: 40 });
    ic.press('left');     // left x1
    ic.press('softDrop'); // softDrop x1
    ic.update(100); // left 未達 DAS；softDrop 30/60/90 → x3
    expect(actions.filter((a) => a === 'left')).toEqual(['left']);
    expect(actions.filter((a) => a === 'softDrop')).toHaveLength(4);
    ic.update(80); // left 跨 DAS(160) → 第 2 次；softDrop 至 180ms → 共 7 次
    expect(actions.filter((a) => a === 'left')).toHaveLength(2);
    expect(actions.filter((a) => a === 'softDrop')).toHaveLength(7);
    ic.release('softDrop');
    ic.update(40); // left 每 ARR 一次；softDrop 已放開
    expect(actions.filter((a) => a === 'left')).toHaveLength(3);
    expect(actions.filter((a) => a === 'softDrop')).toHaveLength(7);
  });

  it('softDrop 不走 DAS 充能：未指定 sdf 也不會等 das 才重複', () => {
    const actions: string[] = [];
    const ic = new InputController((a) => actions.push(a), { das: 500, arr: 40 });
    ic.press('softDrop');
    ic.update(60); // 遠小於 das=500，但 sdf=30 應已重複 2 次
    expect(actions).toEqual(['softDrop', 'softDrop', 'softDrop']);
  });
});
