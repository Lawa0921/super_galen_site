import { afterEach, describe, expect, it, vi } from 'vitest';
import { Menu } from './menu';
import { Dialogue, MenuView, confirmBox } from './widgets';

const mk = () => new Menu([{ id: 'a', label: '冒險者公會' }, { id: 'b', label: '道具店', disabled: true }, { id: 'c', label: '旅館' }]);

describe('MenuView', () => {
  it('renders options, moves with keys, picks with confirm', () => {
    const pick = vi.fn(); const moved = vi.fn();
    const v = new MenuView(mk(), { pick, moved });
    const opts = [...v.el.querySelectorAll('[role=option]')];
    expect(opts.map((o) => o.textContent)).toEqual(['冒險者公會', '道具店', '旅館']);
    expect(opts[1].getAttribute('aria-disabled')).toBe('true');
    expect(v.onAction('down')).toBe(true);
    expect(v.el.querySelector('[aria-selected=true]')!.textContent).toBe('旅館');
    expect(moved).toHaveBeenCalledTimes(1);
    v.onAction('confirm');
    expect(pick).toHaveBeenCalledWith(expect.objectContaining({ id: 'c' }));
    expect(v.el.querySelector('button, select')).toBeNull();
  });

  it('follows the pointer, so Enter confirms the hovered option', () => {
    const pick = vi.fn();
    const v = new MenuView(mk(), { pick });
    const opts = v.el.querySelectorAll('[role=option]');
    opts[2].dispatchEvent(new Event('pointerenter'));
    v.onAction('confirm');
    expect(pick).toHaveBeenCalledWith(expect.objectContaining({ id: 'c' }));
    opts[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(pick).toHaveBeenCalledTimes(1);
  });

  it('passes cancel to its owner', () => {
    const cancel = vi.fn();
    const v = new MenuView(mk(), { pick: vi.fn(), cancel });
    expect(v.onAction('cancel')).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

describe('Dialogue', () => {
  afterEach(() => vi.useRealTimers());

  it('types out, completes on the first confirm and closes on the second', async () => {
    vi.useFakeTimers();
    const d = new Dialogue(20);
    const done = vi.fn();
    void d.say('露米亞', '暮霧又濃了些。').then(done);
    expect(d.el.hidden).toBe(false);
    expect(d.el.querySelector('.slx-name')!.textContent).toBe('露米亞');
    await vi.advanceTimersByTimeAsync(100);
    expect(d.el.querySelector('.slx-text')!.textContent).toBe('暮霧');
    expect(d.onAction('confirm')).toBe(true);
    expect(d.el.querySelector('.slx-text')!.textContent).toBe('暮霧又濃了些。');
    expect(done).not.toHaveBeenCalled();
    d.onAction('confirm');
    await vi.runAllTimersAsync();
    expect(done).toHaveBeenCalledTimes(1);
    expect(d.el.hidden).toBe(true);
    expect(d.busy()).toBe(false);
  });

  it('ignores input when idle and shows text at once when the speed is instant', async () => {
    const d = new Dialogue(Infinity);
    expect(d.onAction('confirm')).toBe(false);
    void d.say('', '立即');
    expect(d.el.querySelector('.slx-text')!.textContent).toBe('立即');
  });
});

describe('confirmBox', () => {
  it('answers yes or no and treats cancel as no', () => {
    const on = vi.fn();
    const box = confirmBox('要花 120 G 住宿嗎？', on);
    expect(box.el.textContent).toContain('要花 120 G 住宿嗎？');
    box.view.onAction('confirm');
    expect(on).toHaveBeenLastCalledWith(true);
    box.view.onAction('cancel');
    expect(on).toHaveBeenLastCalledWith(false);
  });
});
